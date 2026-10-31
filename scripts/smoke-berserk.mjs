import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loaderPath = path.join(root, "engine", "berserk", "berserk.js");
const wasmPath = path.join(root, "engine", "berserk", "berserk_bg.wasm");
const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const validUci = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

const [source, wasm] = await Promise.all([
  readFile(loaderPath, "utf8"),
  readFile(wasmPath),
]);

if (source.length < 8000) throw new Error("Berserk wasm-bindgen loader is incomplete.");
if (wasm.length < 1_000_000 || wasm.subarray(0, 4).toString("hex") !== "0061736d") {
  throw new Error("Berserk WASM file is missing, truncated, or has an invalid header.");
}

// Import the generated ESM loader from a data URL so this smoke test does not
// depend on a package.json module setting or write temporary source files.
const moduleUrl = "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const bindings = await import(moduleUrl);
const wasmBuffer = wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength);
await bindings.default({ module_or_path: wasmBuffer });

const engine = new bindings.Engine();
try {
  engine.set_threads(1);
  engine.set_position(startFen);
  if (!engine.fen().startsWith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR")) {
    throw new Error("Berserk did not accept the initial chess position.");
  }
  engine.go_uci(3, 0, 1, () => {});
  const bestmove = String(engine.last_bestmove() || "").trim();
  if (!validUci.test(bestmove)) {
    throw new Error("Berserk did not return a legal-format UCI bestmove: " + bestmove);
  }
  console.log("Berserk WASM smoke test passed: bindings initialized and UCI bestmove " + bestmove + " received.");
} finally {
  engine.free();
}
