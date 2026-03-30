"use strict";

const MANAGER_PAGE = "mission-control.html";
let missionControlWindowId = null;

function callChrome(apiMethod, ...args) {
  return new Promise((resolve, reject) => {
    apiMethod(...args, (value) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve(value);
    });
  });
}

function getManagerUrl(sourceWindowId) {
  const url = new URL(chrome.runtime.getURL(MANAGER_PAGE));
  url.searchParams.set("sourceWindowId", String(sourceWindowId));
  return url.toString();
}

async function getLaunchContextWindow() {
  const windows = await callChrome(chrome.windows.getAll.bind(chrome.windows), {
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

  return callChrome(chrome.windows.getLastFocused.bind(chrome.windows));
}

async function openMissionControl() {
  const currentWindow = await getLaunchContextWindow();
  const managerUrl = getManagerUrl(currentWindow.id);

  if (missionControlWindowId !== null) {
    try {
      await callChrome(chrome.windows.update.bind(chrome.windows), missionControlWindowId, {
        focused: true,
        top: 0
      });

      const tabs = await callChrome(chrome.tabs.query.bind(chrome.tabs), {
        windowId: missionControlWindowId
      });

      if (tabs[0]?.id) {
        await callChrome(chrome.tabs.update.bind(chrome.tabs), tabs[0].id, {
          active: true,
          url: managerUrl
        });
        return;
      }
    } catch (error) {
      missionControlWindowId = null;
    }
  }

  const popupWindow = await callChrome(chrome.windows.create.bind(chrome.windows), {
    url: managerUrl,
    type: "popup",
    left: currentWindow.left,
    top: 0,
    width: Math.max(900, currentWindow.width ?? 1200),
    height: Math.max(640, currentWindow.height ?? 800)
  });

  missionControlWindowId = popupWindow.id ?? null;
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-mission-control") {
    openMissionControl().catch((error) => {
      console.error("Failed to open Mission Control", error);
    });
  }
});

chrome.action.onClicked.addListener(() => {
  openMissionControl().catch((error) => {
    console.error("Failed to open Mission Control", error);
  });
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === missionControlWindowId) {
    missionControlWindowId = null;
  }
});
