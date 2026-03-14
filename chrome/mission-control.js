"use strict";

const FALLBACK_ICON = "icons/icon-32.svg";
const THEME_STORAGE_KEY = "missionControlThemePreference";
const RECENTLY_CLOSED_LIMIT = 8;
const extensionApi = globalThis.browser ?? globalThis.chrome;
const systemThemeQuery = globalThis.matchMedia?.("(prefers-color-scheme: dark)") ?? null;

const state = {
  allTabs: [],
  visibleTabs: [],
  windowGroups: [],
  visibleWindowGroups: [],
  selectedTabId: null,
  sourceWindowId: null,
  recentSessions: [],
  themePreference: "system",
  dragState: null
};

const accentCache = new Map();
const tabGroupCache = new Map();

const elements = {
  searchInput: document.getElementById("search-input"),
  refreshTabsButton: document.getElementById("refresh-tabs"),
  refreshSessionsButton: document.getElementById("refresh-sessions"),
  resultsSummary: document.getElementById("results-summary"),
  emptyState: document.getElementById("empty-state"),
  windowGroups: document.getElementById("window-groups"),
  recentEmptyState: document.getElementById("recent-empty-state"),
  recentlyClosedList: document.getElementById("recently-closed-list"),
  windowGroupTemplate: document.getElementById("window-group-template"),
  tabTemplate: document.getElementById("tab-card-template"),
  recentlyClosedItemTemplate: document.getElementById("recently-closed-item-template"),
  themeButtons: [...document.querySelectorAll(".theme-button")]
};

function callApi(apiMethod, ...args) {
  if (!apiMethod) {
    return Promise.reject(new Error("Extension API is unavailable"));
  }

  if (globalThis.browser) {
    try {
      return Promise.resolve(apiMethod(...args));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  return new Promise((resolve, reject) => {
    apiMethod(...args, (value) => {
      const runtimeError = extensionApi?.runtime?.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve(value);
    });
  });
}

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
    return url || "Browser page";
  }
}

function isSafeFaviconUrl(faviconUrl) {
  if (!faviconUrl) {
    return false;
  }

  try {
    const parsed = new URL(faviconUrl);
    return [
      "about:",
      "blob:",
      "chrome:",
      "chrome-extension:",
      "data:",
      "file:",
      "moz-extension:",
      "resource:"
    ].includes(parsed.protocol);
  } catch (error) {
    return false;
  }
}

function getRenderableFaviconUrl(faviconUrl) {
  return isSafeFaviconUrl(faviconUrl) ? faviconUrl : FALLBACK_ICON;
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
  if (!state.visibleTabs.length) {
    return -1;
  }

  const selectedIndex = state.visibleTabs.findIndex(
    (tab) => tab.id === state.selectedTabId
  );
  if (selectedIndex >= 0) {
    return selectedIndex;
  }

  state.selectedTabId = state.visibleTabs[0].id;
  return 0;
}

function ensureValidSelection() {
  if (!state.visibleTabs.length) {
    state.selectedTabId = null;
    return;
  }

  if (!state.visibleTabs.some((tab) => tab.id === state.selectedTabId)) {
    state.selectedTabId = state.visibleTabs[0].id;
  }
}

function setSelection(nextIndex, options = {}) {
  if (!state.visibleTabs.length) {
    return;
  }

  const boundedIndex = Math.max(0, Math.min(nextIndex, state.visibleTabs.length - 1));
  state.selectedTabId = state.visibleTabs[boundedIndex].id;
  renderSelectedState();

  if (options.focus !== false) {
    focusSelectedCard();
  }
}

function focusSelectedCard() {
  const selectedCard = elements.windowGroups.querySelector(
    `.tab-card[data-tab-id="${String(state.selectedTabId)}"]`
  );
  selectedCard?.focus();
}

function updateVisibleTabs(preferredTabId = state.selectedTabId) {
  const query = elements.searchInput.value.trim().toLowerCase();

  state.visibleWindowGroups = state.windowGroups
    .map((group) => {
      const visibleTabs = group.tabs.filter((tab) => {
        if (!query) {
          return true;
        }

        return (
          tab.title?.toLowerCase().includes(query) ||
          tab.url?.toLowerCase().includes(query) ||
          tab.groupTitle?.toLowerCase().includes(query)
        );
      });

      return {
        ...group,
        visibleTabs
      };
    })
    .filter((group) => group.visibleTabs.length > 0);

  state.visibleTabs = state.visibleWindowGroups.flatMap((group) => group.visibleTabs);

  if (!state.visibleTabs.length) {
    state.selectedTabId = null;
    return;
  }

  const preferredMatch = state.visibleTabs.find((tab) => tab.id === preferredTabId);
  if (preferredMatch) {
    state.selectedTabId = preferredMatch.id;
    return;
  }

  const activeMatch = state.visibleTabs.find((tab) => tab.active);
  if (activeMatch) {
    state.selectedTabId = activeMatch.id;
    return;
  }

  state.selectedTabId = state.visibleTabs[0].id;
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

  if (!isSafeFaviconUrl(tab.favIconUrl)) {
    accentCache.set(tab.id, fallbackAccent);
    return;
  }

  try {
    const faviconAccent = await extractAccentFromFavicon(tab.favIconUrl);
    accentCache.set(tab.id, faviconAccent);

    if (card.isConnected && card.dataset.tabId === String(tab.id)) {
      applyAccent(card, faviconAccent);
    }
  } catch (error) {
    accentCache.set(tab.id, fallbackAccent);
  }
}

function getWindowTitle(group) {
  if (group.windowId === state.sourceWindowId) {
    return `Current Window`;
  }

  return `Window ${group.displayIndex}`;
}

function getWindowLabel(group) {
  return group.windowId === state.sourceWindowId ? "Focused now" : "Browser window";
}

function getTabGroupLabel(tab) {
  const groupTitle = tab.groupTitle?.trim();
  if (groupTitle) {
    return groupTitle;
  }

  if (typeof tab.groupColor === "string" && tab.groupColor !== "grey") {
    return `${tab.groupColor[0].toUpperCase()}${tab.groupColor.slice(1)} group`;
  }

  return "Grouped";
}

function renderSummary() {
  const query = elements.searchInput.value.trim();
  const visibleWindowCount = state.visibleWindowGroups.length;
  const totalWindowCount = state.windowGroups.length;
  const visibleTabCount = state.visibleTabs.length;
  const totalTabCount = state.allTabs.length;
  const recentCount = state.recentSessions.length;

  if (!totalTabCount) {
    elements.resultsSummary.textContent = "No open tabs were found.";
    return;
  }

  if (!visibleTabCount) {
    elements.resultsSummary.textContent = query
      ? `No tabs match "${query}".`
      : "No open tabs were found.";
    return;
  }

  const querySummary = query
    ? `Showing ${visibleTabCount} of ${totalTabCount} tabs`
    : `Showing ${visibleTabCount} tabs`;
  const windowSummary =
    visibleWindowCount === totalWindowCount
      ? `across ${totalWindowCount} windows`
      : `across ${visibleWindowCount} of ${totalWindowCount} windows`;
  const recentSummary =
    recentCount > 0 ? `${recentCount} recently closed ready to restore` : "No recent sessions";

  elements.resultsSummary.textContent = `${querySummary} ${windowSummary}. ${recentSummary}.`;
}

function renderRecentSessions() {
  elements.recentlyClosedList.replaceChildren();
  elements.recentEmptyState.hidden = state.recentSessions.length > 0;

  state.recentSessions.forEach((session) => {
    const item = elements.recentlyClosedItemTemplate.content.firstElementChild.cloneNode(true);
    const icon = item.querySelector(".recently-closed-icon");
    const title = item.querySelector(".recently-closed-title");
    const url = item.querySelector(".recently-closed-url");

    item.dataset.sessionId = session.sessionId;
    title.textContent = session.title || "Recently closed tab";
    url.textContent = getShortUrl(session.url || "");

    icon.src = getRenderableFaviconUrl(session.favIconUrl);
    icon.addEventListener("error", () => {
      icon.src = FALLBACK_ICON;
    });

    item.addEventListener("click", () => {
      restoreSession(session.sessionId).catch((error) => {
        console.error("Failed to restore session", error);
        elements.resultsSummary.textContent = "Unable to restore that recently closed tab.";
      });
    });

    elements.recentlyClosedList.appendChild(item);
  });
}

function renderTabCard(tab) {
  const card = elements.tabTemplate.content.firstElementChild.cloneNode(true);
  const favicon = card.querySelector(".favicon");
  const previewFavicon = card.querySelector(".preview-favicon");
  const previewFaviconShell = card.querySelector(".preview-favicon-shell");
  const previewFaviconFallback = card.querySelector(".preview-favicon-fallback");
  const previewDomain = card.querySelector(".preview-domain");
  const title = card.querySelector(".tab-title");
  const url = card.querySelector(".tab-url");
  const tabGroupPill = card.querySelector(".tab-group-pill");
  const closeButton = card.querySelector(".close-button");

  card.dataset.tabId = String(tab.id);
  card.dataset.windowId = String(tab.windowId);
  card.dataset.tabIndex = String(tab.index);
  card.setAttribute("aria-selected", String(tab.id === state.selectedTabId));
  card.classList.toggle("is-active", Boolean(tab.active));
  card.classList.toggle("is-hibernated", Boolean(tab.discarded));
  card.classList.toggle("is-selected", tab.id === state.selectedTabId);

  title.textContent = tab.title || "Untitled tab";
  url.textContent = getShortUrl(tab.url || "");
  previewFaviconFallback.textContent = getPreviewLabel(tab);
  previewDomain.textContent = getTabHost(tab.url || "");

  if (tab.groupId >= 0) {
    tabGroupPill.hidden = false;
    tabGroupPill.textContent = getTabGroupLabel(tab);
    tabGroupPill.title = getTabGroupLabel(tab);
  } else {
    tabGroupPill.hidden = true;
    tabGroupPill.textContent = "";
    tabGroupPill.removeAttribute("title");
  }

  favicon.src = getRenderableFaviconUrl(tab.favIconUrl);
  favicon.addEventListener("error", () => {
    favicon.src = FALLBACK_ICON;
  });

  previewFaviconShell.classList.remove("has-image");
  previewFavicon.src = getRenderableFaviconUrl(tab.favIconUrl);
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
      elements.resultsSummary.textContent = "Unable to close that tab.";
    });
  });

  card.addEventListener("dragstart", (event) => {
    startDraggingTab(event, tab, card);
  });

  card.addEventListener("dragover", (event) => {
    handleCardDragOver(event, tab, card);
  });

  card.addEventListener("drop", (event) => {
    handleCardDrop(event, tab);
  });

  card.addEventListener("dragend", () => {
    endDraggingTab();
  });

  applyAccent(card, getFallbackAccent(tab));
  resolveAccentForTab(tab, card);
  return card;
}

function renderWindowGroups() {
  ensureValidSelection();
  elements.windowGroups.replaceChildren();

  const hasTabs = state.visibleTabs.length > 0;
  elements.emptyState.hidden = hasTabs;
  elements.windowGroups.hidden = !hasTabs;

  state.visibleWindowGroups.forEach((group) => {
    const section = elements.windowGroupTemplate.content.firstElementChild.cloneNode(true);
    const windowLabel = section.querySelector(".window-label");
    const windowTitle = section.querySelector(".window-title");
    const tabCount = section.querySelector(".window-tab-count");
    const dropZone = section.querySelector(".window-drop-zone");
    const tabGrid = section.querySelector(".tab-grid");

    section.dataset.windowId = String(group.windowId);
    windowLabel.textContent = getWindowLabel(group);
    windowTitle.textContent = getWindowTitle(group);
    tabCount.textContent =
      group.visibleTabs.length === group.tabs.length
        ? `${group.tabs.length} tabs`
        : `${group.visibleTabs.length} of ${group.tabs.length} tabs`;

    dropZone.dataset.windowId = String(group.windowId);
    dropZone.classList.toggle("is-drop-target-empty", group.visibleTabs.length === 0);
    tabGrid.setAttribute("aria-label", `${windowTitle.textContent} tabs`);

    dropZone.addEventListener("dragover", (event) => {
      handleWindowDragOver(event, group, dropZone);
    });

    dropZone.addEventListener("drop", (event) => {
      handleWindowDrop(event, group);
    });

    dropZone.addEventListener("dragleave", (event) => {
      if (event.currentTarget === event.target) {
        dropZone.classList.remove("is-drop-target");
      }
    });

    group.visibleTabs.forEach((tab) => {
      tabGrid.appendChild(renderTabCard(tab));
    });

    elements.windowGroups.appendChild(section);
  });
}

function renderSelectedState() {
  const cards = elements.windowGroups.querySelectorAll(".tab-card");
  cards.forEach((card) => {
    const isSelected = Number(card.dataset.tabId) === state.selectedTabId;
    card.classList.toggle("is-selected", isSelected);
    card.setAttribute("aria-selected", String(isSelected));
  });
}

function renderThemeButtons() {
  elements.themeButtons.forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.themePreference === state.themePreference
    );
  });
}

function render() {
  renderSummary();
  renderWindowGroups();
  renderRecentSessions();
  renderThemeButtons();
}

async function activateTab(tabId) {
  const tab = state.allTabs.find((candidate) => candidate.id === tabId);
  if (!tab) {
    return;
  }

  await callApi(extensionApi.tabs.update.bind(extensionApi.tabs), tabId, { active: true });
  await callApi(extensionApi.windows.update.bind(extensionApi.windows), tab.windowId, {
    focused: true
  });
  window.close();
}

async function closeTab(tabId) {
  const selectedIndex = getSelectedIndex();
  await callApi(extensionApi.tabs.remove.bind(extensionApi.tabs), tabId);
  accentCache.delete(tabId);

  const fallbackTabId =
    state.visibleTabs[Math.max(0, selectedIndex - 1)]?.id ??
    state.visibleTabs[Math.min(state.visibleTabs.length - 1, selectedIndex + 1)]?.id ??
    null;

  await refreshView({
    preferredTabId: fallbackTabId,
    includeRecentSessions: true
  });
}

async function hibernateTab(tabId) {
  const tab = state.allTabs.find((candidate) => candidate.id === tabId);
  if (!tab) {
    return;
  }

  if (tab.discarded) {
    await callApi(extensionApi.tabs.reload.bind(extensionApi.tabs), tabId);
    await refreshView({
      preferredTabId: tabId,
      includeRecentSessions: false
    });
    elements.resultsSummary.textContent = "Tab restored from hibernate mode.";
    return;
  }

  if (tab.active) {
    elements.resultsSummary.textContent =
      "Active tabs cannot be hibernated. Select another tab first.";
    return;
  }

  await callApi(extensionApi.tabs.discard.bind(extensionApi.tabs), tabId);
  await refreshView({
    preferredTabId: tabId,
    includeRecentSessions: false
  });
  elements.resultsSummary.textContent = "Tab moved into hibernate mode.";
}

function handleArrowNavigation(key) {
  const selectedIndex = getSelectedIndex();
  if (selectedIndex < 0) {
    return;
  }

  const delta = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  setSelection(selectedIndex + delta);
}

function getDropPosition(card, event) {
  const rect = card.getBoundingClientRect();
  const horizontalBias = rect.width >= rect.height;
  if (horizontalBias) {
    return event.clientX >= rect.left + rect.width / 2 ? "after" : "before";
  }

  return event.clientY >= rect.top + rect.height / 2 ? "after" : "before";
}

function clearDropIndicators() {
  elements.windowGroups
    .querySelectorAll(".tab-card[data-drop-position]")
    .forEach((card) => {
      delete card.dataset.dropPosition;
    });

  elements.windowGroups
    .querySelectorAll(".window-drop-zone.is-drop-target")
    .forEach((zone) => {
      zone.classList.remove("is-drop-target");
    });
}

function startDraggingTab(event, tab, card) {
  state.dragState = {
    tabId: tab.id,
    sourceWindowId: tab.windowId
  };

  card.classList.add("is-dragging");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(tab.id));
  }
}

function endDraggingTab() {
  elements.windowGroups.querySelectorAll(".tab-card.is-dragging").forEach((card) => {
    card.classList.remove("is-dragging");
  });
  state.dragState = null;
  clearDropIndicators();
}

function handleCardDragOver(event, tab, card) {
  if (!state.dragState || state.dragState.tabId === tab.id) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "move";
  clearDropIndicators();

  const dropZone = card.closest(".window-drop-zone");
  const dropPosition = getDropPosition(card, event);
  card.dataset.dropPosition = dropPosition;
  dropZone?.classList.add("is-drop-target");

  state.dragState.targetWindowId = tab.windowId;
  state.dragState.targetTabId = tab.id;
  state.dragState.dropPosition = dropPosition;
}

async function handleCardDrop(event, tab) {
  if (!state.dragState || state.dragState.tabId === tab.id) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const targetIndex = tab.index + (state.dragState.dropPosition === "after" ? 1 : 0);
  await moveTab(state.dragState.tabId, tab.windowId, targetIndex);
}

function handleWindowDragOver(event, group, dropZone) {
  if (!state.dragState) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  clearDropIndicators();
  dropZone.classList.add("is-drop-target");

  state.dragState.targetWindowId = group.windowId;
  state.dragState.targetTabId = null;
  state.dragState.dropPosition = "after";
}

async function handleWindowDrop(event, group) {
  if (!state.dragState) {
    return;
  }

  event.preventDefault();
  const targetIndex = group.tabs.length;
  await moveTab(state.dragState.tabId, group.windowId, targetIndex);
}

async function moveTab(tabId, targetWindowId, targetIndex) {
  const tab = state.allTabs.find((candidate) => candidate.id === tabId);
  if (!tab) {
    endDraggingTab();
    return;
  }

  const moveProperties = {
    index: targetIndex
  };

  if (targetWindowId !== tab.windowId) {
    moveProperties.windowId = targetWindowId;
  } else if (tab.index < targetIndex) {
    moveProperties.index -= 1;
  }

  if (moveProperties.index === tab.index && targetWindowId === tab.windowId) {
    endDraggingTab();
    return;
  }

  await callApi(extensionApi.tabs.move.bind(extensionApi.tabs), tabId, moveProperties);
  await refreshView({
    preferredTabId: tabId,
    includeRecentSessions: false
  });
  focusSelectedCard();
  endDraggingTab();
}

async function restoreSession(sessionId) {
  const restoredSession = await callApi(
    extensionApi.sessions.restore.bind(extensionApi.sessions),
    sessionId
  );
  const restoredTabId = restoredSession?.tab?.id ?? null;

  await refreshView({
    preferredTabId: restoredTabId,
    includeRecentSessions: true
  });
}

async function loadThemePreference() {
  if (!extensionApi.storage?.local) {
    applyTheme();
    return;
  }

  try {
    const stored = await callApi(
      extensionApi.storage.local.get.bind(extensionApi.storage.local),
      THEME_STORAGE_KEY
    );
    const themePreference = stored?.[THEME_STORAGE_KEY];
    if (["system", "light", "dark"].includes(themePreference)) {
      state.themePreference = themePreference;
    }
  } catch (error) {
    console.error("Failed to load theme preference", error);
  }

  applyTheme();
}

function applyTheme() {
  if (state.themePreference === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = state.themePreference;
  }

  document.documentElement.style.colorScheme =
    state.themePreference === "system" ? "light dark" : state.themePreference;
  renderThemeButtons();
}

async function saveThemePreference(nextPreference) {
  state.themePreference = nextPreference;
  applyTheme();

  if (!extensionApi.storage?.local) {
    return;
  }

  await callApi(extensionApi.storage.local.set.bind(extensionApi.storage.local), {
    [THEME_STORAGE_KEY]: nextPreference
  });
}

async function loadRecentlyClosedSessions() {
  if (!extensionApi.sessions?.getRecentlyClosed) {
    state.recentSessions = [];
    return;
  }

  const sessions = await callApi(
    extensionApi.sessions.getRecentlyClosed.bind(extensionApi.sessions),
    { maxResults: RECENTLY_CLOSED_LIMIT }
  );

  state.recentSessions = sessions
    .filter((session) => session.tab?.sessionId)
    .map((session) => ({
      sessionId: session.tab.sessionId,
      title: session.tab.title,
      url: session.tab.url,
      favIconUrl: session.tab.favIconUrl
    }));
}

async function hydrateChromeTabGroups(tabs) {
  if (!extensionApi.tabGroups?.get) {
    return tabs;
  }

  const uniqueGroupIds = [...new Set(
    tabs
      .map((tab) => tab.groupId)
      .filter((groupId) => typeof groupId === "number" && groupId >= 0)
  )];

  await Promise.all(
    uniqueGroupIds.map(async (groupId) => {
      if (tabGroupCache.has(groupId)) {
        return;
      }

      try {
        const group = await callApi(extensionApi.tabGroups.get.bind(extensionApi.tabGroups), groupId);
        tabGroupCache.set(groupId, group);
      } catch (error) {
        console.error("Failed to load tab group", error);
      }
    })
  );

  return tabs.map((tab) => {
    if (typeof tab.groupId !== "number" || tab.groupId < 0) {
      return tab;
    }

    const group = tabGroupCache.get(tab.groupId);
    return {
      ...tab,
      groupTitle: group?.title ?? "",
      groupColor: group?.color ?? "grey",
      groupCollapsed: Boolean(group?.collapsed)
    };
  });
}

async function loadWindowsAndTabs(options = {}) {
  if (state.sourceWindowId === null || Number.isNaN(state.sourceWindowId)) {
    const currentWindow = await callApi(
      extensionApi.windows.getCurrent.bind(extensionApi.windows)
    );
    state.sourceWindowId = currentWindow.id;
  }

  const windows = await callApi(extensionApi.windows.getAll.bind(extensionApi.windows), {
    populate: true,
    windowTypes: ["normal"]
  });

  const sortedWindows = windows
    .filter((windowInfo) => windowInfo.type === "normal")
    .sort((left, right) => {
      if (left.id === state.sourceWindowId) {
        return -1;
      }
      if (right.id === state.sourceWindowId) {
        return 1;
      }
      return (left.id ?? 0) - (right.id ?? 0);
    });

  state.windowGroups = sortedWindows.map((windowInfo, index) => {
    const tabs = (windowInfo.tabs || [])
      .filter((tab) => !tab.hidden)
      .sort((left, right) => left.index - right.index);

    return {
      windowId: windowInfo.id,
      displayIndex: index + 1,
      focused: Boolean(windowInfo.focused),
      tabs
    };
  });

  state.windowGroups = await Promise.all(
    state.windowGroups.map(async (group) => ({
      ...group,
      tabs: await hydrateChromeTabGroups(group.tabs)
    }))
  );

  state.allTabs = state.windowGroups.flatMap((group) => group.tabs);
  updateVisibleTabs(options.preferredTabId ?? state.selectedTabId);
}

async function refreshView(options = {}) {
  await loadWindowsAndTabs(options);
  if (options.includeRecentSessions) {
    await loadRecentlyClosedSessions();
  }
  render();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", () => {
    updateVisibleTabs(state.selectedTabId);
    render();
  });

  elements.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusSelectedCard();
    }
  });

  elements.refreshTabsButton.addEventListener("click", () => {
    refreshView({
      preferredTabId: state.selectedTabId,
      includeRecentSessions: false
    }).catch((error) => {
      console.error("Failed to refresh tabs", error);
      elements.resultsSummary.textContent = "Unable to refresh the tab list.";
    });
  });

  elements.refreshSessionsButton.addEventListener("click", () => {
    loadRecentlyClosedSessions()
      .then(() => {
        renderSummary();
        renderRecentSessions();
      })
      .catch((error) => {
        console.error("Failed to refresh recently closed tabs", error);
        elements.resultsSummary.textContent = "Unable to refresh recently closed tabs.";
      });
  });

  elements.themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      saveThemePreference(button.dataset.themePreference).catch((error) => {
        console.error("Failed to save theme preference", error);
        elements.resultsSummary.textContent = "Unable to save theme preference.";
      });
    });
  });

  if (systemThemeQuery) {
    const handleThemeChange = () => {
      if (state.themePreference === "system") {
        applyTheme();
      }
    };

    if (typeof systemThemeQuery.addEventListener === "function") {
      systemThemeQuery.addEventListener("change", handleThemeChange);
    } else if (typeof systemThemeQuery.addListener === "function") {
      systemThemeQuery.addListener(handleThemeChange);
    }
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      window.close();
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
      if (document.activeElement === elements.searchInput && !state.visibleTabs.length) {
        return;
      }

      const selectedIndex = getSelectedIndex();
      const selectedTab = state.visibleTabs[selectedIndex];
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
      const selectedTab = state.visibleTabs[selectedIndex];
      if (!selectedTab) {
        return;
      }

      event.preventDefault();
      closeTab(selectedTab.id).catch((error) => {
        console.error("Failed to close tab", error);
        elements.resultsSummary.textContent = "Unable to close the selected tab.";
      });
      return;
    }

    if (event.key.toLowerCase() === "h" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (document.activeElement === elements.searchInput) {
        return;
      }

      const selectedIndex = getSelectedIndex();
      const selectedTab = state.visibleTabs[selectedIndex];
      if (!selectedTab) {
        return;
      }

      event.preventDefault();
      hibernateTab(selectedTab.id).catch((error) => {
        console.error("Failed to hibernate tab", error);
        elements.resultsSummary.textContent = "Unable to hibernate the selected tab.";
      });
    }
  });
}

async function initialize() {
  state.sourceWindowId = parseSourceWindowId();
  bindEvents();
  await loadThemePreference();
  await refreshView({
    includeRecentSessions: true
  });
  focusSelectedCard();
}

initialize().catch((error) => {
  console.error("Failed to load tabs", error);
  elements.resultsSummary.textContent = "Unable to load tabs.";
});
