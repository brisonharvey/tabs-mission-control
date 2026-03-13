"use strict";

const PAGE_SIZE = 20;
const FALLBACK_ICON = "icons/icon-32.svg";

const state = {
  allTabs: [],
  filteredTabs: [],
  pageIndex: 0,
  selectedTabId: null,
  sourceWindowId: null
};

const accentCache = new Map();

const elements = {
  searchInput: document.getElementById("search-input"),
  prevPageButton: document.getElementById("prev-page"),
  nextPageButton: document.getElementById("next-page"),
  pageIndicator: document.getElementById("page-indicator"),
  resultsSummary: document.getElementById("results-summary"),
  emptyState: document.getElementById("empty-state"),
  tabGrid: document.getElementById("tab-grid"),
  tabTemplate: document.getElementById("tab-card-template")
};

function parseSourceWindowId() {
  const params = new URLSearchParams(window.location.search);
  const rawValue = params.get("sourceWindowId");
  return rawValue ? Number(rawValue) : null;
}

function getTabHost(url) {
  try {
    return new URL(url).host.replace(/^www\./, "") || "Local page";
  } catch (error) {
    return "Browser page";
  }
}

function getShortUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}`.slice(0, 64);
  } catch (error) {
    return url || "Firefox page";
  }
}

function getPreviewLabel(tab) {
  const title = tab.title?.trim();
  if (title) {
    return title.slice(0, 1).toUpperCase();
  }

  const host = getTabHost(tab.url || "");
  return host.slice(0, 1).toUpperCase();
}

function getSelectedIndex() {
  if (!state.filteredTabs.length) {
    return -1;
  }

  const selectedIndex = state.filteredTabs.findIndex(
    (tab) => tab.id === state.selectedTabId
  );
  if (selectedIndex >= 0) {
    return selectedIndex;
  }

  state.selectedTabId = state.filteredTabs[0].id;
  return 0;
}

function getPageCount() {
  return Math.max(1, Math.ceil(state.filteredTabs.length / PAGE_SIZE));
}

function getPageTabs() {
  const start = state.pageIndex * PAGE_SIZE;
  return state.filteredTabs.slice(start, start + PAGE_SIZE);
}

function ensureValidSelection() {
  if (!state.filteredTabs.length) {
    state.selectedTabId = null;
    state.pageIndex = 0;
    return;
  }

  const selectedIndex = getSelectedIndex();
  const pageCount = getPageCount();
  state.pageIndex = Math.max(0, Math.min(state.pageIndex, pageCount - 1));

  if (selectedIndex < 0) {
    state.selectedTabId = state.filteredTabs[0].id;
  }
}

function setSelection(globalIndex, options = {}) {
  if (!state.filteredTabs.length) {
    return;
  }

  const nextIndex = Math.max(0, Math.min(globalIndex, state.filteredTabs.length - 1));
  const nextPageIndex = Math.floor(nextIndex / PAGE_SIZE);
  const shouldRender = nextPageIndex !== state.pageIndex || options.forceRender;
  state.selectedTabId = state.filteredTabs[nextIndex].id;
  state.pageIndex = nextPageIndex;

  if (shouldRender) {
    render();
  } else {
    renderSelectedState();
  }

  if (options.focus !== false) {
    focusSelectedCard();
  }
}

function focusSelectedCard() {
  const selectedCard = elements.tabGrid.querySelector(
    `.tab-card[data-tab-id="${String(state.selectedTabId)}"]`
  );
  selectedCard?.focus();
}

function updateFilteredTabs(preferredTabId = state.selectedTabId) {
  const query = elements.searchInput.value.trim().toLowerCase();

  state.filteredTabs = state.allTabs.filter((tab) => {
    if (!query) {
      return true;
    }

    return (
      tab.title?.toLowerCase().includes(query) ||
      tab.url?.toLowerCase().includes(query)
    );
  });

  const pageCount = getPageCount();
  if (state.pageIndex >= pageCount) {
    state.pageIndex = pageCount - 1;
  }

  if (!state.filteredTabs.length) {
    state.selectedTabId = null;
    return;
  }

  const preferredMatch = state.filteredTabs.find((tab) => tab.id === preferredTabId);
  if (preferredMatch) {
    state.selectedTabId = preferredMatch.id;
    state.pageIndex = Math.floor(getSelectedIndex() / PAGE_SIZE);
    return;
  }

  const activeMatch = state.filteredTabs.find((tab) => tab.active);
  if (activeMatch) {
    state.selectedTabId = activeMatch.id;
    state.pageIndex = Math.floor(getSelectedIndex() / PAGE_SIZE);
    return;
  }

  state.selectedTabId = state.filteredTabs[0].id;
  state.pageIndex = 0;
}

function hashString(input) {
  let hash = 0;
  for (const character of input) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function getFallbackAccent(tab) {
  const seed = getTabHost(tab.url || tab.title || String(tab.id));
  const hue = hashString(seed) % 360;
  const saturation = 62;
  const lightness = 52;
  const solid = `hsl(${hue} ${saturation}% ${lightness}%)`;
  const soft = `hsl(${hue} ${saturation}% ${lightness}% / 0.14)`;
  const glow = `hsl(${hue} ${saturation}% ${lightness}% / 0.22)`;
  const border = `hsl(${hue} ${saturation}% ${lightness}% / 0.34)`;
  return { solid, soft, glow, border };
}

function rgbToAccent(red, green, blue) {
  return {
    solid: `rgb(${red}, ${green}, ${blue})`,
    soft: `rgba(${red}, ${green}, ${blue}, 0.14)`,
    glow: `rgba(${red}, ${green}, ${blue}, 0.22)`,
    border: `rgba(${red}, ${green}, ${blue}, 0.34)`
  };
}

async function extractAccentFromFavicon(faviconUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        canvas.width = 16;
        canvas.height = 16;
        context.drawImage(image, 0, 0, 16, 16);

        const { data } = context.getImageData(0, 0, 16, 16);
        let red = 0;
        let green = 0;
        let blue = 0;
        let total = 0;

        for (let index = 0; index < data.length; index += 4) {
          const alpha = data[index + 3];
          if (alpha < 80) {
            continue;
          }

          red += data[index];
          green += data[index + 1];
          blue += data[index + 2];
          total += 1;
        }

        if (!total) {
          reject(new Error("No visible pixels in favicon"));
          return;
        }

        resolve(
          rgbToAccent(
            Math.round(red / total),
            Math.round(green / total),
            Math.round(blue / total)
          )
        );
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      reject(new Error("Unable to load favicon"));
    };
    image.src = faviconUrl;
  });
}

function applyAccent(card, accent) {
  card.style.setProperty("--tab-accent", accent.solid);
  card.style.setProperty("--tab-accent-soft", accent.soft);
  card.style.setProperty("--tab-accent-glow", accent.glow);
  card.style.setProperty("--tab-accent-border", accent.border);
}

async function resolveAccentForTab(tab, card) {
  const cachedAccent = accentCache.get(tab.id);
  if (cachedAccent) {
    applyAccent(card, cachedAccent);
    return;
  }

  const fallbackAccent = getFallbackAccent(tab);
  applyAccent(card, fallbackAccent);

  if (!tab.favIconUrl) {
    accentCache.set(tab.id, fallbackAccent);
    return;
  }

  try {
    const faviconAccent = await extractAccentFromFavicon(tab.favIconUrl);
    accentCache.set(tab.id, faviconAccent);

    // The async favicon sampling can finish after a re-render, so only update
    // the card if it still represents the same tab.
    if (card.isConnected && card.dataset.tabId === String(tab.id)) {
      applyAccent(card, faviconAccent);
    }
  } catch (error) {
    accentCache.set(tab.id, fallbackAccent);
  }
}

function render() {
  ensureValidSelection();
  const selectedIndex = getSelectedIndex();

  const pageTabs = getPageTabs();
  const pageCount = getPageCount();
  const totalVisible = state.filteredTabs.length;
  const pageStart = totalVisible === 0 ? 0 : state.pageIndex * PAGE_SIZE + 1;
  const pageEnd = Math.min((state.pageIndex + 1) * PAGE_SIZE, totalVisible);

  elements.tabGrid.replaceChildren();
  elements.emptyState.hidden = totalVisible !== 0;
  elements.tabGrid.hidden = totalVisible === 0;
  elements.pageIndicator.textContent = `Page ${state.pageIndex + 1} of ${pageCount}`;
  elements.prevPageButton.disabled = state.pageIndex === 0;
  elements.nextPageButton.disabled = state.pageIndex >= pageCount - 1;
  elements.resultsSummary.textContent =
    totalVisible === 0
      ? "No tabs match the current search."
      : `Showing ${pageStart}-${pageEnd} of ${totalVisible} matching tabs`;

  pageTabs.forEach((tab, pageOffset) => {
    const globalIndex = state.pageIndex * PAGE_SIZE + pageOffset;
    const card = elements.tabTemplate.content.firstElementChild.cloneNode(true);

    const favicon = card.querySelector(".favicon");
    const previewFavicon = card.querySelector(".preview-favicon");
    const previewFaviconShell = card.querySelector(".preview-favicon-shell");
    const previewFaviconFallback = card.querySelector(".preview-favicon-fallback");
    const previewDomain = card.querySelector(".preview-domain");
    const title = card.querySelector(".tab-title");
    const url = card.querySelector(".tab-url");
    const closeButton = card.querySelector(".close-button");

    card.dataset.globalIndex = String(globalIndex);
    card.dataset.tabId = String(tab.id);
    card.setAttribute("aria-selected", String(globalIndex === selectedIndex));
    card.classList.toggle("is-active", Boolean(tab.active));
    card.classList.toggle("is-selected", globalIndex === selectedIndex);

    title.textContent = tab.title || "Untitled tab";
    url.textContent = getShortUrl(tab.url || "");
    // Firefox does not offer a fast, non-disruptive way to capture thumbnail
    // previews for every tab in the current window, so the MVP uses a styled
    // fallback preview shell instead of attempting fake live thumbnails.
    previewFaviconFallback.textContent = getPreviewLabel(tab);
    previewDomain.textContent = getTabHost(tab.url || "");

    favicon.src = tab.favIconUrl || FALLBACK_ICON;
    favicon.addEventListener("error", () => {
      favicon.src = FALLBACK_ICON;
    });

    previewFaviconShell.classList.remove("has-image");
    previewFavicon.src = tab.favIconUrl || FALLBACK_ICON;
    previewFavicon.addEventListener("load", () => {
      previewFaviconShell.classList.add("has-image");
    });
    previewFavicon.addEventListener("error", () => {
      previewFaviconShell.classList.remove("has-image");
      previewFavicon.removeAttribute("src");
    });

    card.addEventListener("click", () => {
      activateTab(tab.id).catch((error) => {
        console.error("Failed to activate tab", error);
      });
    });

    card.addEventListener("focus", () => {
      state.selectedTabId = tab.id;
      renderSelectedState();
    });

    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeTab(tab.id).catch((error) => {
        console.error("Failed to close tab", error);
      });
    });

    applyAccent(card, getFallbackAccent(tab));
    resolveAccentForTab(tab, card);
    elements.tabGrid.appendChild(card);
  });
}

function renderSelectedState() {
  const cards = elements.tabGrid.querySelectorAll(".tab-card");
  cards.forEach((card) => {
    const isSelected = Number(card.dataset.tabId) === state.selectedTabId;
    card.classList.toggle("is-selected", isSelected);
    card.setAttribute("aria-selected", String(isSelected));
  });
}

async function activateTab(tabId) {
  await browser.tabs.update(tabId, { active: true });

  if (state.sourceWindowId !== null) {
    await browser.windows.update(state.sourceWindowId, { focused: true });
  }

  window.close();
}

async function closeTab(tabId) {
  const selectedIndex = getSelectedIndex();
  await browser.tabs.remove(tabId);
  accentCache.delete(tabId);

  const nextIndex = Math.max(0, selectedIndex - 1);
  await loadTabs({
    preferredIndex: nextIndex
  });
}

function getColumnCount() {
  const cards = [...elements.tabGrid.querySelectorAll(".tab-card")];
  if (cards.length <= 1) {
    return 1;
  }

  const firstTop = cards[0].offsetTop;
  const secondRow = cards.find((card) => card.offsetTop > firstTop);
  if (!secondRow) {
    return cards.length;
  }

  return cards.findIndex((card) => card === secondRow);
}

function changePage(direction) {
  if (!state.filteredTabs.length) {
    return;
  }

  const previousPageIndex = state.pageIndex;
  const nextPageIndex = state.pageIndex + direction;
  const pageCount = getPageCount();
  if (nextPageIndex < 0 || nextPageIndex >= pageCount) {
    return;
  }

  state.pageIndex = nextPageIndex;
  const currentIndex = Math.max(0, getSelectedIndex());
  const offset = currentIndex - previousPageIndex * PAGE_SIZE;
  const nextStart = nextPageIndex * PAGE_SIZE;
  const nextEnd = Math.min(nextStart + PAGE_SIZE - 1, state.filteredTabs.length - 1);
  const nextIndex = Math.min(nextStart + Math.max(offset, 0), nextEnd);
  state.selectedTabId = state.filteredTabs[nextIndex].id;
  render();
  focusSelectedCard();
}

function handleArrowNavigation(key) {
  const pageTabs = getPageTabs();
  if (!pageTabs.length) {
    return;
  }

  const pageStartIndex = state.pageIndex * PAGE_SIZE;
  const localIndex = getSelectedIndex() - pageStartIndex;
  const columns = Math.max(1, getColumnCount());
  let nextLocalIndex = localIndex;

  if (key === "ArrowRight") {
    nextLocalIndex += 1;
  } else if (key === "ArrowLeft") {
    nextLocalIndex -= 1;
  } else if (key === "ArrowDown") {
    nextLocalIndex += columns;
  } else if (key === "ArrowUp") {
    nextLocalIndex -= columns;
  }

  nextLocalIndex = Math.max(0, Math.min(nextLocalIndex, pageTabs.length - 1));
  setSelection(pageStartIndex + nextLocalIndex);
}

async function loadTabs(options = {}) {
  state.sourceWindowId = parseSourceWindowId();

  const query = {};
  if (state.sourceWindowId !== null && !Number.isNaN(state.sourceWindowId)) {
    query.windowId = state.sourceWindowId;
  } else {
    const currentWindow = await browser.windows.getCurrent();
    query.windowId = currentWindow.id;
    state.sourceWindowId = currentWindow.id;
  }

  const tabs = await browser.tabs.query(query);

  state.allTabs = tabs
    .filter((tab) => !tab.hidden)
    .sort((a, b) => a.index - b.index);

  if (typeof options.preferredIndex === "number" && state.allTabs[options.preferredIndex]) {
    state.selectedTabId = state.allTabs[options.preferredIndex].id;
  } else if (!state.selectedTabId) {
    const activeTab = state.allTabs.find((tab) => tab.active);
    state.selectedTabId = activeTab?.id ?? state.allTabs[0]?.id ?? null;
  }

  updateFilteredTabs(state.selectedTabId);
  render();
  focusSelectedCard();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", () => {
    state.pageIndex = 0;
    updateFilteredTabs(state.selectedTabId);
    render();
  });

  elements.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusSelectedCard();
    }
  });

  elements.prevPageButton.addEventListener("click", () => {
    changePage(-1);
  });

  elements.nextPageButton.addEventListener("click", () => {
    changePage(1);
  });

  document.addEventListener("keydown", (event) => {
    const isModifierPageShortcut =
      (event.metaKey || event.ctrlKey) &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight");

    if (event.key === "Escape") {
      event.preventDefault();
      window.close();
      return;
    }

    if (isModifierPageShortcut) {
      event.preventDefault();
      changePage(event.key === "ArrowRight" ? 1 : -1);
      return;
    }

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      const isTyping =
        document.activeElement === elements.searchInput &&
        !["ArrowUp", "ArrowDown"].includes(event.key);

      if (isTyping) {
        return;
      }

      event.preventDefault();
      handleArrowNavigation(event.key);
      return;
    }

    if (event.key === "Enter") {
      if (document.activeElement === elements.searchInput && !state.filteredTabs.length) {
        return;
      }

      const selectedIndex = getSelectedIndex();
      const selectedTab = state.filteredTabs[selectedIndex];
      if (!selectedTab) {
        return;
      }

      event.preventDefault();
      activateTab(selectedTab.id).catch((error) => {
        console.error("Failed to activate tab", error);
      });
      return;
    }

    if (event.key.toLowerCase() === "x" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (document.activeElement === elements.searchInput) {
        return;
      }

      const selectedIndex = getSelectedIndex();
      const selectedTab = state.filteredTabs[selectedIndex];
      if (!selectedTab) {
        return;
      }

      event.preventDefault();
      closeTab(selectedTab.id).catch((error) => {
        console.error("Failed to close tab", error);
      });
    }
  });
}

bindEvents();
loadTabs().catch((error) => {
  console.error("Failed to load tabs", error);
  elements.resultsSummary.textContent = "Unable to load tabs.";
});
