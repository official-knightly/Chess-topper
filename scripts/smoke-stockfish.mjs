import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const enginePath = path.join(root, "engine", "stockfish-19-single.js");
const child = spawn(process.execPath, [enginePath], {
  cwd: path.join(root, "engine"),
  stdio: ["pipe", "pipe", "pipe"]
});

let output = "";
let phase = "uci";
let finished = false;
const timer = setTimeout(() => fail("Stockfish smoke test timed out after 25 seconds"), 25_000);

function finish() {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  child.stdin.end();
  child.kill();
  console.log("Full Stockfish 19 UCI smoke test passed: uciok, readyok, and bestmove received.");
}

function fail(message) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  child.kill();
  console.error(message);
  console.error(output.slice(-5000));
  process.exitCode = 1;
}

child.on("error", error => fail("Could not start Stockfish: " + error.message));
child.on("exit", (code, signal) => {
  if (!finished) fail(`Stockfish exited before bestmove (code=${code}, signal=${signal})`);
});
child.stderr.on("data", chunk => { output += chunk.toString(); });
child.stdout.on("data", chunk => {
  const text = chunk.toString();
  output += text;
  for (const line of text.split(/\r?\n/)) {
    if (phase === "uci" && line.trim() === "uciok") {
      phase = "ready";
      child.stdin.write("isready\n");
    } else if (phase === "ready" && line.trim() === "readyok") {
      phase = "search";
      child.stdin.write("position startpos\ngo depth 3\n");
    } else if (phase === "search" && /^bestmove\s+[a-h][1-8][a-h][1-8][qrbn]?\b/.test(line.trim())) {
      finish();
      break;
    }
  }
});

child.stdin.write("uci\n");
