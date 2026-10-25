
const statusEl = document.getElementById("status");

function setStatus(message) {
  statusEl.textContent = message;
}

chrome.storage.local.get(
  { analysisMode: "auto", bar: true, arrow: true, depth: 12, apiKey: "" },
  (settings) => {
    document.getElementById("analysisMode").value = settings.analysisMode || "auto";
    document.getElementById("bar").checked = settings.bar !== false;
    document.getElementById("arrow").checked = settings.arrow !== false;
    document.getElementById("depth").value = String(settings.depth || 12);
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
    await chrome.tabs.sendMessage(tab.id, {
      type: "CHESS_TOPPER_SETTINGS",
      settings
    });
    setStatus("Settings saved and sent to this tab.");
  } catch (error) {
    setStatus("Saved. Open a supported chess analysis page, then reload it.");
  }
});
