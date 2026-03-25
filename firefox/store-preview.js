"use strict";

(function installStorePreviewMocks() {
  const params = new URLSearchParams(window.location.search);
  const variant = params.get("variant") || "overview";

  function createSvgDataUrl(label, fill) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="18" fill="${fill}"/>
        <text x="32" y="40" font-size="28" text-anchor="middle" fill="#ffffff"
          font-family="Arial, sans-serif">${label}</text>
      </svg>
    `;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function createTab(id, windowId, index, options) {
    return {
      id,
      windowId,
      index,
      active: Boolean(options.active),
      discarded: Boolean(options.discarded),
      hidden: false,
      title: options.title,
      url: options.url,
      favIconUrl: createSvgDataUrl(options.faviconLabel, options.faviconColor)
    };
  }

  const windows = [
    {
      id: 101,
      type: "normal",
      focused: true,
      tabs: [
        createTab(1, 101, 0, {
          active: true,
          title: "Sprint Plan - Tab Mission Control",
          url: "https://linear.app/team/sprint-plan",
          faviconLabel: "L",
          faviconColor: "#3b82f6"
        }),
        createTab(2, 101, 1, {
          title: "Design System Notes",
          url: "https://notion.so/design-system",
          faviconLabel: "N",
          faviconColor: "#111827"
        }),
        createTab(3, 101, 2, {
          title: "AMO Listing Checklist",
          url: "https://extensionworkshop.com/documentation/publish",
          faviconLabel: "F",
          faviconColor: "#2563eb"
        }),
        createTab(4, 101, 3, {
          title: "Accessibility QA Matrix",
          url: "https://docs.google.com/spreadsheets/d/accessibility",
          faviconLabel: "G",
          faviconColor: "#22c55e"
        })
      ]
    },
    {
      id: 202,
      type: "normal",
      focused: false,
      tabs: [
        createTab(5, 202, 0, {
          title: "Inbox - Product Launch",
          url: "https://mail.google.com/mail/u/0/#inbox",
          faviconLabel: "M",
          faviconColor: "#ef4444"
        }),
        createTab(6, 202, 1, {
          title: "Release Notes Draft",
          url: "https://docs.example.com/release-notes",
          faviconLabel: "D",
          faviconColor: "#8b5cf6"
        }),
        createTab(7, 202, 2, {
          title: "Store Screenshot Concepts",
          url: "https://github.com/brisonharvey/Tab-Mission-Control/issues/24",
          faviconLabel: "G",
          faviconColor: "#0f766e"
        })
      ]
    },
    {
      id: 303,
      type: "normal",
      focused: false,
      tabs: [
        createTab(8, 303, 0, {
          discarded: true,
          title: "Long-form Article on Browser UX",
          url: "https://alistapart.com/article/browser-ux",
          faviconLabel: "A",
          faviconColor: "#f97316"
        }),
        createTab(9, 303, 1, {
          title: "Music for Deep Work",
          url: "https://open.spotify.com/playlist/deep-work",
          faviconLabel: "S",
          faviconColor: "#16a34a"
        })
      ]
    }
  ];

  const recentSessions = [
    {
      tab: {
        sessionId: "session-1",
        title: "Issue Triage Board",
        url: "https://github.com/org/repo/projects/1",
        favIconUrl: createSvgDataUrl("G", "#111827")
      }
    },
    {
      tab: {
        sessionId: "session-2",
        title: "Color Contrast Checker",
        url: "https://webaim.org/resources/contrastchecker/",
        favIconUrl: createSvgDataUrl("W", "#14b8a6")
      }
    },
    {
      tab: {
        sessionId: "session-3",
        title: "Developer Hub Submission Flow",
        url: "https://addons.mozilla.org/developers/",
        favIconUrl: createSvgDataUrl("A", "#f59e0b")
      }
    }
  ];

  const previewState = {
    themePreference: variant === "dark" ? "dark" : "system"
  };

  if (variant === "search") {
    previewState.themePreference = "light";
  }

  function cloneWindows() {
    return windows.map((windowInfo) => ({
      ...windowInfo,
      tabs: windowInfo.tabs.map((tab) => ({ ...tab }))
    }));
  }

  const api = {
    runtime: {
      getURL(path) {
        return new URL(path.replace(/^\//, ""), window.location.href).toString();
      }
    },
    storage: {
      local: {
        async get(key) {
          if (typeof key === "string") {
            return {
              [key]: previewState.themePreference
            };
          }

          return {
            missionControlThemePreference: previewState.themePreference
          };
        },
        async set(values) {
          previewState.themePreference =
            values.missionControlThemePreference ?? previewState.themePreference;
        }
      }
    },
    windows: {
      async getCurrent() {
        return { id: 101 };
      },
      async getAll() {
        return cloneWindows();
      },
      async update() {
        return {};
      }
    },
    tabs: {
      async update() {
        return {};
      },
      async remove() {
        return {};
      },
      async reload() {
        return {};
      },
      async discard() {
        return {};
      },
      async move() {
        return {};
      }
    },
    sessions: {
      async getRecentlyClosed() {
        return recentSessions.map((session) => ({
          tab: { ...session.tab }
        }));
      },
      async restore() {
        return {
          tab: {
            id: 10
          }
        };
      }
    }
  };

  globalThis.browser = api;

  window.addEventListener("load", () => {
    if (variant === "search") {
      window.setTimeout(() => {
        const input = document.getElementById("search-input");
        input.value = "issue";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, 60);
    }

    if (variant === "dark") {
      window.setTimeout(() => {
        document.documentElement.dataset.theme = "dark";
      }, 80);
    }

    window.setTimeout(() => {
      document.body.dataset.storePreviewReady = "true";
    }, 180);
  });
})();
