"use strict";

const PAGE_SIZE = 20;
const FALLBACK_ICON = "icons/icon-32.svg";

const state = {
  allTabs: [],
  filteredTabs: [],
  pageIndex: 0,
  selectedGlobalIndex: 0,
  sourceWindowId: null
};

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

function clampSelectedIndex() {
  if (state.filteredTabs.length === 0) {
    state.selectedGlobalIndex = 0;
    state.pageIndex = 0;
    return;
  }

  const maxIndex = state.filteredTabs.length - 1;
  state.selectedGlobalIndex = Math.min(state.selectedGlobalIndex, maxIndex);

  const pageCount = getPageCount();
  state.pageIndex = Math.min(state.pageIndex, pageCount - 1);
  state.pageIndex = Math.max(state.pageIndex, 0);
}

function getPageCount() {
  return Math.max(1, Math.ceil(state.filteredTabs.length / PAGE_SIZE));
}

function getPageTabs() {
  const start = state.pageIndex * PAGE_SIZE;
  return state.filteredTabs.slice(start, start + PAGE_SIZE);
}

function setSelection(globalIndex) {
  if (!state.filteredTabs.length) {
    return;
  }

  const nextIndex = Math.max(0, Math.min(globalIndex, state.filteredTabs.length - 1));
  state.selectedGlobalIndex = nextIndex;
  state.pageIndex = Math.floor(nextIndex / PAGE_SIZE);
  render();
  focusSelectedCard();
}

function focusSelectedCard() {
  const selectedCard = elements.tabGrid.querySelector(".tab-card.is-selected");
  selectedCard?.focus();
}

function updateFilteredTabs() {
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
    state.selectedGlobalIndex = 0;
    return;
  }

  const activeMatchIndex = state.filteredTabs.findIndex((tab) => tab.active);
  if (!query && activeMatchIndex >= 0) {
    state.selectedGlobalIndex = activeMatchIndex;
    state.pageIndex = Math.floor(activeMatchIndex / PAGE_SIZE);
    return;
  }

  state.selectedGlobalIndex = Math.min(
    state.selectedGlobalIndex,
    state.filteredTabs.length - 1
  );
}

function render() {
  clampSelectedIndex();

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
    const previewDomain = card.querySelector(".preview-domain");
    const title = card.querySelector(".tab-title");
    const url = card.querySelector(".tab-url");

    card.dataset.globalIndex = String(globalIndex);
    card.dataset.tabId = String(tab.id);
    card.setAttribute("aria-selected", String(globalIndex === state.selectedGlobalIndex));
    card.classList.toggle("is-active", Boolean(tab.active));
    card.classList.toggle("is-selected", globalIndex === state.selectedGlobalIndex);

    title.textContent = tab.title || "Untitled tab";
    url.textContent = getShortUrl(tab.url || "");
    // Firefox does not offer a fast, non-disruptive way to capture thumbnail
    // previews for every tab in the current window, so the MVP uses a styled
    // fallback preview shell instead of attempting fake live thumbnails.
    previewFavicon.textContent = getPreviewLabel(tab);
    previewDomain.textContent = getTabHost(tab.url || "");

    favicon.src = tab.favIconUrl || FALLBACK_ICON;
    favicon.addEventListener("error", () => {
      favicon.src = FALLBACK_ICON;
    });

    card.addEventListener("click", () => {
      activateTab(tab.id);
    });

    card.addEventListener("focus", () => {
      state.selectedGlobalIndex = globalIndex;
      renderSelectedState();
    });

    elements.tabGrid.appendChild(card);
  });
}

function renderSelectedState() {
  const cards = elements.tabGrid.querySelectorAll(".tab-card");
  cards.forEach((card) => {
    const globalIndex = Number(card.dataset.globalIndex);
    const isSelected = globalIndex === state.selectedGlobalIndex;
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
  const nextPageIndex = state.pageIndex + direction;
  const pageCount = getPageCount();
  if (nextPageIndex < 0 || nextPageIndex >= pageCount) {
    return;
  }

  state.pageIndex = nextPageIndex;
  const startIndex = state.pageIndex * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE - 1, state.filteredTabs.length - 1);
  state.selectedGlobalIndex = Math.min(Math.max(state.selectedGlobalIndex, startIndex), endIndex);
  render();
  focusSelectedCard();
}

function handleArrowNavigation(key) {
  const pageTabs = getPageTabs();
  if (!pageTabs.length) {
    return;
  }

  const pageStartIndex = state.pageIndex * PAGE_SIZE;
  const localIndex = state.selectedGlobalIndex - pageStartIndex;
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

async function loadTabs() {
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

  const activeIndex = state.allTabs.findIndex((tab) => tab.active);
  if (activeIndex >= 0) {
    state.selectedGlobalIndex = activeIndex;
    state.pageIndex = Math.floor(activeIndex / PAGE_SIZE);
  }

  updateFilteredTabs();
  render();
  focusSelectedCard();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", () => {
    state.pageIndex = 0;
    state.selectedGlobalIndex = 0;
    updateFilteredTabs();
    render();
    focusSelectedCard();
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
        (event.key === "ArrowLeft" || event.key === "ArrowRight");

      if (isTyping) {
        return;
      }

      event.preventDefault();
      handleArrowNavigation(event.key);
      return;
    }

    if (event.key === "Enter") {
      const selectedTab = state.filteredTabs[state.selectedGlobalIndex];
      if (!selectedTab) {
        return;
      }

      event.preventDefault();
      activateTab(selectedTab.id).catch((error) => {
        console.error("Failed to activate tab", error);
      });
    }
  });
}

bindEvents();
loadTabs().catch((error) => {
  console.error("Failed to load tabs", error);
  elements.resultsSummary.textContent = "Unable to load tabs.";
});
