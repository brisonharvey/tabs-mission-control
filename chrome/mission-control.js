"use strict";

const FALLBACK_ICON = "icons/icon-32.svg";
const THEME_STORAGE_KEY = "missionControlThemePreference";
const RECENTLY_CLOSED_LIMIT = 8;
const extensionApi = globalThis.browser ?? globalThis.chrome;
const systemThemeQuery = globalThis.matchMedia?.("(prefers-color-scheme: dark)") ?? null;

const state = {
  allTabs: [],
  visibleTabs: [],
  visibleItems: [],
  windowGroups: [],
  visibleWindowGroups: [],
  selectedItemKey: null,
  collapsedGroupIds: new Set(),
  expandedGroupIds: new Set(),
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
  groupControls: document.getElementById("group-controls"),
  groupControlsSummary: document.getElementById("group-controls-summary"),
  expandAllGroupsButton: document.getElementById("expand-all-groups"),
  collapseAllGroupsButton: document.getElementById("collapse-all-groups"),
  launchShortcutModifier: document.getElementById("launch-shortcut-modifier"),
  resultsSummary: document.getElementById("results-summary"),
  emptyState: document.getElementById("empty-state"),
  windowGroups: document.getElementById("window-groups"),
  recentEmptyState: document.getElementById("recent-empty-state"),
  recentlyClosedList: document.getElementById("recently-closed-list"),
  windowGroupTemplate: document.getElementById("window-group-template"),
  tabTemplate: document.getElementById("tab-card-template"),
  groupTemplate: document.getElementById("group-card-template"),
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

function isMacPlatform() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  return /mac/i.test(platform);
}

function renderLaunchShortcut() {
  if (!elements.launchShortcutModifier) {
    return;
  }

  elements.launchShortcutModifier.textContent = isMacPlatform() ? "Command" : "Ctrl";
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

function isWebPageUrl(pageUrl) {
  if (!pageUrl) {
    return false;
  }

  try {
    const parsed = new URL(pageUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function getChromeLocalFaviconUrl(pageUrl, size = 32) {
  if (!isWebPageUrl(pageUrl)) {
    return null;
  }

  const faviconUrl = new URL(extensionApi.runtime.getURL("/_favicon/"));
  faviconUrl.searchParams.set("pageUrl", pageUrl);
  faviconUrl.searchParams.set("size", String(size));
  return faviconUrl.toString();
}

function getRenderableFaviconUrl(faviconUrl, pageUrl, size = 32) {
  if (isSafeFaviconUrl(faviconUrl)) {
    return faviconUrl;
  }

  const chromeLocalFaviconUrl = getChromeLocalFaviconUrl(pageUrl, size);
  return chromeLocalFaviconUrl || FALLBACK_ICON;
}

function getPreviewLabel(tab) {
  const title = tab.title?.trim();
  if (title) {
    return title.slice(0, 1).toUpperCase();
  }

  const host = getTabHost(tab.url || "");
  return host.slice(0, 1).toUpperCase();
}

function getItemKey(item) {
  return item.type === "group" ? `group:${String(item.groupId)}` : `tab:${String(item.id)}`;
}

function getSelectedIndex() {
  if (!state.visibleItems.length) {
    return -1;
  }

  const selectedIndex = state.visibleItems.findIndex(
    (item) => getItemKey(item) === state.selectedItemKey
  );
  if (selectedIndex >= 0) {
    return selectedIndex;
  }

  state.selectedItemKey = getItemKey(state.visibleItems[0]);
  return 0;
}

function ensureValidSelection() {
  if (!state.visibleItems.length) {
    state.selectedItemKey = null;
    return;
  }

  if (!state.visibleItems.some((item) => getItemKey(item) === state.selectedItemKey)) {
    state.selectedItemKey = getItemKey(state.visibleItems[0]);
  }
}

function setSelection(nextIndex, options = {}) {
  if (!state.visibleItems.length) {
    return;
  }

  const boundedIndex = Math.max(0, Math.min(nextIndex, state.visibleItems.length - 1));
  state.selectedItemKey = getItemKey(state.visibleItems[boundedIndex]);
  renderSelectedState();

  if (options.focus !== false) {
    focusSelectedCard();
  }
}

function focusSelectedCard() {
  const selectedCard = elements.windowGroups.querySelector(
    `[data-item-key="${String(state.selectedItemKey)}"]`
  );
  selectedCard?.focus();
}

function buildVisibleItemsForGroup(group) {
  const items = [];

  for (let index = 0; index < group.visibleTabs.length; index += 1) {
    const tab = group.visibleTabs[index];
    const shouldRenderAsGroupCard =
      typeof tab.groupId === "number" &&
      tab.groupId >= 0 &&
      (
        state.collapsedGroupIds.has(tab.groupId) ||
        (tab.groupCollapsed && !state.expandedGroupIds.has(tab.groupId))
      );

    if (
      shouldRenderAsGroupCard
    ) {
      const groupId = tab.groupId;
      const visibleGroupTabs = [];
      while (
        index < group.visibleTabs.length &&
        group.visibleTabs[index].groupId === groupId
      ) {
        visibleGroupTabs.push(group.visibleTabs[index]);
        index += 1;
      }
      index -= 1;

      const allGroupTabs = group.tabs.filter((candidate) => candidate.groupId === groupId);
      items.push({
        type: "group",
        groupId,
        groupTitle: getTabGroupLabel(tab),
        groupColor: tab.groupColor,
        windowId: group.windowId,
        tabs: allGroupTabs,
        visibleTabs: visibleGroupTabs,
        activeTab: allGroupTabs.find((candidate) => candidate.active) || allGroupTabs[0],
        discardedCount: allGroupTabs.filter((candidate) => candidate.discarded).length
      });
      continue;
    }

    items.push({
      type: "tab",
      ...tab
    });
  }

  return items;
}

function updateVisibleTabs(preferredTabId = null, preferredItemKey = state.selectedItemKey) {
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
        visibleTabs,
        visibleItems: buildVisibleItemsForGroup({
          ...group,
          visibleTabs
        })
      };
    })
    .filter((group) => group.visibleTabs.length > 0);

  state.visibleTabs = state.visibleWindowGroups.flatMap((group) => group.visibleTabs);
  state.visibleItems = state.visibleWindowGroups.flatMap((group) => group.visibleItems);

  if (!state.visibleItems.length) {
    state.selectedItemKey = null;
    return;
  }

  const preferredItem = state.visibleItems.find((item) => getItemKey(item) === preferredItemKey);
  if (preferredItem) {
    state.selectedItemKey = getItemKey(preferredItem);
    return;
  }

  if (preferredTabId !== null) {
    const preferredTabItem = state.visibleItems.find((item) => {
      if (item.type === "group") {
        return item.tabs.some((tab) => tab.id === preferredTabId);
      }

      return item.id === preferredTabId;
    });

    if (preferredTabItem) {
      state.selectedItemKey = getItemKey(preferredTabItem);
      return;
    }
  }

  const activeMatch = state.visibleItems.find((item) =>
    item.type === "group" ? item.tabs.some((tab) => tab.active) : item.active
  );
  if (activeMatch) {
    state.selectedItemKey = getItemKey(activeMatch);
    return;
  }

  state.selectedItemKey = getItemKey(state.visibleItems[0]);
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

    icon.src = getRenderableFaviconUrl(session.favIconUrl, session.url, 18);
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

function renderGroupControls() {
  const allGroupIds = [...new Set(
    state.windowGroups.flatMap((group) =>
      group.tabs
        .map((tab) => tab.groupId)
        .filter((groupId) => typeof groupId === "number" && groupId >= 0)
    )
  )];
  const collapsedGroupIds = [...new Set(
    state.windowGroups.flatMap((group) =>
      group.tabs
        .filter((tab) => typeof tab.groupId === "number" && tab.groupId >= 0 && tab.groupCollapsed)
        .map((tab) => tab.groupId)
    )
  )];

  const expandedInViewCount = collapsedGroupIds.filter((groupId) =>
    state.expandedGroupIds.has(groupId)
  ).length;
  const hiddenCollapsedCount = collapsedGroupIds.length - expandedInViewCount;
  const locallyCollapsedOpenCount = [...state.collapsedGroupIds].filter(
    (groupId) => !collapsedGroupIds.includes(groupId)
  ).length;
  const hasGroups = allGroupIds.length > 0;
  elements.groupControls.hidden = !hasGroups;
  if (!hasGroups) {
    return;
  }

  const expandedCount = allGroupIds.length - collapsedGroupIds.length;
  elements.groupControlsSummary.textContent =
    `${hiddenCollapsedCount + locallyCollapsedOpenCount} collapsed cards, ${expandedInViewCount} expanded from browser-collapsed groups, ${expandedCount} open in the browser.`;
  elements.expandAllGroupsButton.disabled =
    hiddenCollapsedCount === 0 && locallyCollapsedOpenCount === 0;
  elements.collapseAllGroupsButton.disabled =
    state.collapsedGroupIds.size === allGroupIds.length;
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
  const pinnedPill = card.querySelector(".pinned-pill");
  const closeButton = card.querySelector(".close-button");

  card.dataset.itemKey = getItemKey({
    type: "tab",
    id: tab.id
  });
  card.dataset.tabId = String(tab.id);
  card.dataset.windowId = String(tab.windowId);
  card.dataset.tabIndex = String(tab.index);
  card.setAttribute("aria-selected", String(card.dataset.itemKey === state.selectedItemKey));
  card.classList.toggle("is-active", Boolean(tab.active));
  card.classList.toggle("is-hibernated", Boolean(tab.discarded));
  card.classList.toggle("is-selected", card.dataset.itemKey === state.selectedItemKey);

  title.textContent = tab.title || "Untitled tab";
  url.textContent = getShortUrl(tab.url || "");
  previewFaviconFallback.textContent = getPreviewLabel(tab);
  previewDomain.textContent = getTabHost(tab.url || "");
  pinnedPill.hidden = !tab.pinned;

  favicon.src = getRenderableFaviconUrl(tab.favIconUrl, tab.url, 18);
  favicon.addEventListener("error", () => {
    favicon.src = FALLBACK_ICON;
  });

  previewFaviconShell.classList.remove("has-image");
  previewFavicon.src = getRenderableFaviconUrl(tab.favIconUrl, tab.url, 52);
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
    state.selectedItemKey = card.dataset.itemKey;
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

function renderGroupCard(groupItem) {
  const card = elements.groupTemplate.content.firstElementChild.cloneNode(true);
  const groupCount = card.querySelector(".group-count");
  const groupTitle = card.querySelector(".group-title");
  const groupSubtitle = card.querySelector(".group-subtitle");
  const faviconStack = card.querySelector(".group-favicon-stack");

  const itemKey = getItemKey(groupItem);
  card.dataset.itemKey = itemKey;
  card.dataset.groupId = String(groupItem.groupId);
  card.dataset.windowId = String(groupItem.windowId);
  card.setAttribute("aria-selected", String(itemKey === state.selectedItemKey));
  card.classList.toggle("is-selected", itemKey === state.selectedItemKey);

  const accentSource = groupItem.activeTab || groupItem.tabs[0];
  if (accentSource) {
    applyAccent(card, getFallbackAccent(accentSource));
    resolveAccentForTab(accentSource, card);
  }

  groupCount.textContent = `${groupItem.tabs.length} tabs`;
  groupTitle.textContent = groupItem.groupTitle || "Collapsed group";
  const query = elements.searchInput.value.trim();
  const isCollapsedInBrowser = groupItem.tabs.some((tab) => tab.groupCollapsed);
  groupSubtitle.textContent = query
    ? `${groupItem.visibleTabs.length} matching tabs in this group`
    : groupItem.discardedCount > 0
      ? `${groupItem.discardedCount} hibernated, ${groupItem.tabs.length - groupItem.discardedCount} ready to resume`
      : isCollapsedInBrowser
        ? "Collapsed in the browser. Press Enter to expand."
        : "Collapsed in Mission Control. Press Enter to expand.";

  groupItem.tabs.slice(0, 3).forEach((tab) => {
    const icon = document.createElement("img");
    icon.className = "group-favicon";
    icon.alt = "";
    icon.width = 28;
    icon.height = 28;
    icon.src = getRenderableFaviconUrl(tab.favIconUrl, tab.url, 28);
    icon.addEventListener("error", () => {
      icon.src = FALLBACK_ICON;
    });
    faviconStack.appendChild(icon);
  });

  card.addEventListener("click", () => {
    expandGroup(groupItem.groupId).catch((error) => {
      console.error("Failed to expand tab group", error);
      elements.resultsSummary.textContent = "Unable to expand that tab group.";
    });
  });

  card.addEventListener("focus", () => {
    state.selectedItemKey = itemKey;
    renderSelectedState();
  });

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

    group.visibleItems.forEach((item) => {
      tabGrid.appendChild(item.type === "group" ? renderGroupCard(item) : renderTabCard(item));
    });

    elements.windowGroups.appendChild(section);
  });
}

function renderSelectedState() {
  const cards = elements.windowGroups.querySelectorAll(".overview-card");
  cards.forEach((card) => {
    const isSelected = card.dataset.itemKey === state.selectedItemKey;
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
  renderGroupControls();
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

function getSelectedItem() {
  return state.visibleItems.find((item) => getItemKey(item) === state.selectedItemKey) || null;
}

async function closeTab(tabId) {
  const selectedIndex = getSelectedIndex();
  await callApi(extensionApi.tabs.remove.bind(extensionApi.tabs), tabId);
  accentCache.delete(tabId);

  const fallbackItemKey =
    state.visibleItems[Math.max(0, selectedIndex - 1)] &&
    getItemKey(state.visibleItems[Math.max(0, selectedIndex - 1)]);

  await refreshView({
    preferredItemKey: fallbackItemKey ?? null,
    includeRecentSessions: true
  });
}

async function closeGroup(groupItem) {
  const selectedIndex = getSelectedIndex();
  const tabIds = groupItem.tabs.map((tab) => tab.id);
  await callApi(extensionApi.tabs.remove.bind(extensionApi.tabs), tabIds);
  tabIds.forEach((tabId) => accentCache.delete(tabId));

  const fallbackItemKey =
    state.visibleItems[Math.max(0, selectedIndex - 1)] &&
    getItemKey(state.visibleItems[Math.max(0, selectedIndex - 1)]);

  await refreshView({
    preferredTabId: null,
    preferredItemKey: fallbackItemKey ?? null,
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

async function hibernateGroup(groupItem) {
  const eligibleTabs = groupItem.tabs.filter((tab) => !tab.active && !tab.discarded);
  if (!eligibleTabs.length) {
    elements.resultsSummary.textContent =
      "No tabs in this group can be hibernated right now.";
    return;
  }

  await Promise.all(
    eligibleTabs.map((tab) =>
      callApi(extensionApi.tabs.discard.bind(extensionApi.tabs), tab.id)
    )
  );

  await refreshView({
    preferredTabId: groupItem.tabs[0]?.id ?? null,
    includeRecentSessions: false
  });
  elements.resultsSummary.textContent =
    `Hibernated ${eligibleTabs.length} tabs in ${groupItem.groupTitle || "that group"}.`;
}

async function expandGroup(groupId) {
  const groupItem = state.visibleItems.find(
    (item) => item.type === "group" && item.groupId === groupId
  );
  if (!groupItem) {
    return;
  }

  state.collapsedGroupIds.delete(groupId);
  if (groupItem.tabs.some((tab) => tab.groupCollapsed)) {
    state.expandedGroupIds.add(groupId);
  }
  updateVisibleTabs(groupItem.activeTab?.id ?? groupItem.visibleTabs[0]?.id ?? groupItem.tabs[0]?.id ?? null, null);
  render();
  focusSelectedCard();
}

function getCollapsibleGroupIdForItem(item) {
  if (!item) {
    return null;
  }

  if (item.type === "group") {
    if (state.collapsedGroupIds.has(item.groupId) || state.expandedGroupIds.has(item.groupId)) {
      return item.groupId;
    }
    return null;
  }

  if (
    typeof item.groupId === "number" &&
    item.groupId >= 0 &&
    (
      state.collapsedGroupIds.has(item.groupId) ||
      (item.groupCollapsed && state.expandedGroupIds.has(item.groupId))
    )
  ) {
    return item.groupId;
  }

  return null;
}

async function collapseGroupInView(groupId) {
  const isExpandedCollapsedGroup = state.expandedGroupIds.has(groupId);
  const isOpenGroup = state.windowGroups.some((group) =>
    group.tabs.some((tab) => tab.groupId === groupId)
  );
  if (!isExpandedCollapsedGroup && !isOpenGroup) {
    return;
  }

  state.expandedGroupIds.delete(groupId);
  state.collapsedGroupIds.add(groupId);
  updateVisibleTabs(null, `group:${String(groupId)}`);
  render();
  focusSelectedCard();
}

async function setAllGroupsCollapsed(collapsed) {
  const groupIds = [...new Set(
    state.windowGroups.flatMap((group) =>
      group.tabs
        .map((tab) => tab.groupId)
        .filter((groupId) => typeof groupId === "number" && groupId >= 0)
    )
  )];

  if (!groupIds.length) {
    return;
  }

  if (collapsed) {
    state.collapsedGroupIds = new Set(groupIds);
    state.expandedGroupIds.clear();
    updateVisibleTabs(null, `group:${String(groupIds[0])}`);
  } else {
    state.collapsedGroupIds.clear();
    groupIds.forEach((groupId) => {
      const isBrowserCollapsed = state.windowGroups.some((group) =>
        group.tabs.some((tab) => tab.groupId === groupId && tab.groupCollapsed)
      );
      if (isBrowserCollapsed) {
        state.expandedGroupIds.add(groupId);
      } else {
        state.expandedGroupIds.delete(groupId);
      }
    });
    updateVisibleTabs(null, state.selectedItemKey);
  }

  render();
}

function handleArrowNavigation(key) {
  const cards = [...elements.windowGroups.querySelectorAll(".overview-card")];
  if (!cards.length) {
    return;
  }

  const selectedCard =
    elements.windowGroups.querySelector(
      `[data-item-key="${String(state.selectedItemKey)}"]`
    ) ?? cards[0];
  const selectedCardIndex = cards.indexOf(selectedCard);

  if (selectedCardIndex < 0) {
    return;
  }

  if (key === "ArrowLeft" || key === "ArrowRight") {
    const delta = key === "ArrowLeft" ? -1 : 1;
    setSelection(selectedCardIndex + delta);
    return;
  }

  const cardLayouts = cards.map((card, index) => {
    const rect = card.getBoundingClientRect();
    return {
      card,
      index,
      top: rect.top,
      height: rect.height,
      centerX: rect.left + rect.width / 2
    };
  });

  const rowThreshold = Math.max(
    24,
    Math.min(
      ...cardLayouts.map((layout) => Math.max(24, Math.round(layout.height * 0.45)))
    )
  );
  const rows = [];

  cardLayouts.forEach((layout) => {
    const existingRow = rows.find((row) => Math.abs(row.top - layout.top) <= rowThreshold);
    if (existingRow) {
      existingRow.cards.push(layout);
      existingRow.top = Math.min(existingRow.top, layout.top);
      return;
    }

    rows.push({
      top: layout.top,
      cards: [layout]
    });
  });

  rows.sort((left, right) => left.top - right.top);
  rows.forEach((row) => {
    row.cards.sort((left, right) => left.centerX - right.centerX);
  });

  const selectedLayout = cardLayouts[selectedCardIndex];
  const selectedRowIndex = rows.findIndex((row) =>
    row.cards.some((layout) => layout.index === selectedLayout.index)
  );

  if (selectedRowIndex < 0) {
    return;
  }

  const movingDown = key === "ArrowDown";
  const targetRow = rows[selectedRowIndex + (movingDown ? 1 : -1)];

  if (!targetRow) {
    return;
  }

  const nextCard = targetRow.cards
    .slice()
    .sort((left, right) => {
      const horizontalDistanceDifference =
        Math.abs(left.centerX - selectedLayout.centerX) -
        Math.abs(right.centerX - selectedLayout.centerX);

      if (horizontalDistanceDifference !== 0) {
        return horizontalDistanceDifference;
      }

      return left.index - right.index;
    })[0];

  if (nextCard) {
    setSelection(nextCard.index);
  }
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

  const validCollapsedGroupIds = new Set(
    state.windowGroups.flatMap((group) =>
      group.tabs
        .filter((tab) => typeof tab.groupId === "number" && tab.groupId >= 0 && tab.groupCollapsed)
        .map((tab) => tab.groupId)
    )
  );
  const validGroupIds = new Set(
    state.windowGroups.flatMap((group) =>
      group.tabs
        .map((tab) => tab.groupId)
        .filter((groupId) => typeof groupId === "number" && groupId >= 0)
    )
  );
  state.expandedGroupIds.forEach((groupId) => {
    if (!validCollapsedGroupIds.has(groupId)) {
      state.expandedGroupIds.delete(groupId);
    }
  });
  state.collapsedGroupIds.forEach((groupId) => {
    if (!validGroupIds.has(groupId)) {
      state.collapsedGroupIds.delete(groupId);
    }
  });

  state.allTabs = state.windowGroups.flatMap((group) => group.tabs);
  updateVisibleTabs(options.preferredTabId ?? null, options.preferredItemKey ?? state.selectedItemKey);
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
    updateVisibleTabs(null, state.selectedItemKey);
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
      preferredItemKey: state.selectedItemKey,
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

  elements.expandAllGroupsButton.addEventListener("click", () => {
    setAllGroupsCollapsed(false).catch((error) => {
      console.error("Failed to expand tab groups", error);
      elements.resultsSummary.textContent = "Unable to expand all tab groups.";
    });
  });

  elements.collapseAllGroupsButton.addEventListener("click", () => {
    setAllGroupsCollapsed(true).catch((error) => {
      console.error("Failed to collapse tab groups", error);
      elements.resultsSummary.textContent = "Unable to collapse all tab groups.";
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
      if (document.activeElement === elements.searchInput && !state.visibleItems.length) {
        return;
      }

      const selectedItem = getSelectedItem();
      if (!selectedItem) {
        return;
      }

      event.preventDefault();
      const action =
        selectedItem.type === "group"
          ? expandGroup(selectedItem.groupId)
          : activateTab(selectedItem.id);
      action.catch((error) => {
        console.error("Failed to activate selection", error);
      });
      return;
    }

    if (event.key.toLowerCase() === "x" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (document.activeElement === elements.searchInput) {
        return;
      }

      const selectedItem = getSelectedItem();
      if (!selectedItem) {
        return;
      }

      event.preventDefault();
      const action =
        selectedItem.type === "group"
          ? closeGroup(selectedItem)
          : closeTab(selectedItem.id);
      action.catch((error) => {
        console.error("Failed to close selection", error);
        elements.resultsSummary.textContent =
          selectedItem.type === "group"
            ? "Unable to close the selected group."
            : "Unable to close the selected tab.";
      });
      return;
    }

    if (event.key.toLowerCase() === "h" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (document.activeElement === elements.searchInput) {
        return;
      }

      const selectedItem = getSelectedItem();
      if (!selectedItem) {
        return;
      }

      event.preventDefault();
      const action =
        selectedItem.type === "group"
          ? hibernateGroup(selectedItem)
          : hibernateTab(selectedItem.id);
      action.catch((error) => {
        console.error("Failed to hibernate selection", error);
        elements.resultsSummary.textContent =
          selectedItem.type === "group"
            ? "Unable to hibernate the selected group."
            : "Unable to hibernate the selected tab.";
      });
      return;
    }

    if (event.key.toLowerCase() === "c" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (document.activeElement === elements.searchInput) {
        return;
      }

      const selectedItem = getSelectedItem();
      const groupId = getCollapsibleGroupIdForItem(selectedItem);
      if (groupId === null) {
        return;
      }

      event.preventDefault();
      collapseGroupInView(groupId).catch((error) => {
        console.error("Failed to collapse group in view", error);
        elements.resultsSummary.textContent = "Unable to collapse that group in the overview.";
      });
    }
  });
}

async function initialize() {
  state.sourceWindowId = parseSourceWindowId();
  renderLaunchShortcut();
  bindEvents();
  await loadThemePreference();
  await refreshView({
    includeRecentSessions: true
  });
}

initialize().catch((error) => {
  console.error("Failed to load tabs", error);
  elements.resultsSummary.textContent = "Unable to load tabs.";
});
