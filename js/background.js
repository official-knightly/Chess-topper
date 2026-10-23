const API_URL = "https://stockfishapi.com/v1/eval";
const REQUEST_TIMEOUT_MS = 3200;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "CT_REMOTE_ANALYZE") return;
  (async () => {
    const fen = typeof message.fen === "string" ? message.fen.trim() : "";
    if (!fen || fen.length > 200) throw new Error("Invalid FEN");
    const { apiKey = "" } = await chrome.storage.local.get({ apiKey: "" });
    if (!apiKey) throw new Error("Add your rotated Stockfish API key in the extension popup");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fen,
          depth: Math.min(14, Math.max(1, Number(message.depth) || 12)),
          multipv: Math.min(2, Math.max(1, Number(message.multipv) || 2))
        }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.detail || data?.title || data?.message || `HTTP ${response.status}`;
        throw new Error(detail);
      }
      sendResponse({ ok: true, data });
    } finally {
      clearTimeout(timeout);
    }
  })().catch(error => {
    sendResponse({
      ok: false,
      error: error?.name === "AbortError" ? "Stockfish API timed out" : (error?.message || "Stockfish API request failed")
    });
  });
  return true;
});
