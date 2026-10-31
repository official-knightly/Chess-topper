const statusEl = document.getElementById("status");
const REPO_URL = "https://github.com/official-knightly/Chess-topper";
const MANIFEST_URL = "https://raw.githubusercontent.com/official-knightly/Chess-topper/main/manifest.json";
const CURRENT_VERSION = "0.6.0";

function setStatus(message) {
  statusEl.textContent = message;
}

async function checkForUpdates() {
  const notice = document.getElementById("updateNotice");
  const text = document.getElementById("updateText");
  document.getElementById("updateNow").addEventListener("click", () => {
    chrome.tabs.create({ url: REPO_URL });
  });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let response;
    try {
      response = await fetch(MANIFEST_URL + "?check=" + Date.now(), {
        cache: "no-store",
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error("GitHub returned HTTP " + response.status);
    const remote = await response.json();
    if (!remote.version || !/^\d+(\.\d+){1,3}$/.test(remote.version)) {
      throw new Error("The repository manifest version is invalid");
    }
    const compare = (a, b) => {
      const aa = a.split(".").map(Number), bb = b.split(".").map(Number);
      for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
        const diff = (aa[i] || 0) - (bb[i] || 0);
        if (diff) return diff;
      }
      return 0;
    };
    if (compare(remote.version, CURRENT_VERSION) > 0) {
      notice.hidden = false;
      text.textContent = "Installed: v" + CURRENT_VERSION + " · Latest on GitHub: v" + remote.version;
      setStatus("Update available. Open the repository, download the latest ZIP, then reload the extension.");
    } else {
      notice.hidden = true;
      setStatus("You're using v" + CURRENT_VERSION + ". " + (compare(remote.version, CURRENT_VERSION) < 0 ? "GitHub version is older than this build." : "No update found."));
    }
  } catch (error) {
    setStatus("Update check unavailable. Check your connection and visit GitHub when convenient.");
  }
}

chrome.storage.local.get(
  { analysisMode: "berserk", bar: true, arrow: true, depth: 16, apiKey: "" },
  (settings) => {
    document.getElementById("analysisMode").value = settings.analysisMode || "berserk";
    document.getElementById("bar").checked = settings.bar !== false;
    document.getElementById("arrow").checked = settings.arrow !== false;
    document.getElementById("depth").value = String(settings.depth || 16);
    document.getElementById("apiKey").value = settings.apiKey || "";
  }
);

document.getElementById("apply").addEventListener("click", async () => {
  const settings = {
    analysisMode: document.getElementById("analysisMode").value,
    bar: document.getElementById("bar").checked,
    arrow: document.getElementById("arrow").checked,
    depth: Number(document.getElementById("depth").value),
    apiKey: document.getElementById("apiKey").value.trim()
  };
  try {
    await chrome.storage.local.set(settings);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus("Could not find the active tab.");
      return;
    }
    await chrome.tabs.sendMessage(tab.id, { type: "CHESS_TOPPER_SETTINGS", settings });
    setStatus("Settings saved and sent to this tab.");
  } catch (error) {
    setStatus("Saved. Open a supported chess analysis page, then reload it.");
  }
});

checkForUpdates();
