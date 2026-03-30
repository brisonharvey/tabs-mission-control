"use strict";

const MANAGER_PAGE = "mission-control.html";
let missionControlWindowId = null;

function getManagerUrl(sourceWindowId) {
  const url = new URL(browser.runtime.getURL(MANAGER_PAGE));
  url.searchParams.set("sourceWindowId", String(sourceWindowId));
  return url.toString();
}

async function getLaunchContextWindow() {
  const windows = await browser.windows.getAll({
    populate: true,
    windowTypes: ["normal", "popup"]
  });

  const normalWindows = windows.filter(
    (windowInfo) =>
      windowInfo.type === "normal" &&
      windowInfo.id !== missionControlWindowId
  );

  const focusedNormalWindow =
    normalWindows.find((windowInfo) => windowInfo.focused) || null;

  if (focusedNormalWindow) {
    return focusedNormalWindow;
  }

  if (normalWindows.length > 0) {
    return normalWindows[0];
  }

  return browser.windows.getLastFocused();
}

async function openMissionControl() {
  // Firefox extensions cannot render above browser chrome, so the closest
  // Mission Control-style experience is a dedicated popup window sized to the
  // current browser window.
  const currentWindow = await getLaunchContextWindow();
  const managerUrl = getManagerUrl(currentWindow.id);

  if (missionControlWindowId !== null) {
    try {
      await browser.windows.update(missionControlWindowId, {
        focused: true,
        top: 0
      });

      const tabs = await browser.tabs.query({
        windowId: missionControlWindowId
      });

      if (tabs[0]?.id) {
        await browser.tabs.update(tabs[0].id, {
          active: true,
          url: managerUrl
        });
        return;
      }
    } catch (error) {
      missionControlWindowId = null;
    }
  }

  const popupWindow = await browser.windows.create({
    url: managerUrl,
    type: "popup",
    left: currentWindow.left,
    top: 0,
    width: Math.max(900, currentWindow.width ?? 1200),
    height: Math.max(640, currentWindow.height ?? 800)
  });

  missionControlWindowId = popupWindow.id ?? null;
}

browser.commands.onCommand.addListener((command) => {
  if (command === "open-mission-control") {
    openMissionControl().catch((error) => {
      console.error("Failed to open Mission Control", error);
    });
  }
});

browser.action.onClicked.addListener(() => {
  openMissionControl().catch((error) => {
    console.error("Failed to open Mission Control", error);
  });
});

browser.windows.onRemoved.addListener((windowId) => {
  if (windowId === missionControlWindowId) {
    missionControlWindowId = null;
  }
});
