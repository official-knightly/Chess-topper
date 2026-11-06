// Client adapter around the existing Berserk WASM worker (public/engine/engine-worker.js).
// The WASM binary is served from GitHub's LFS media endpoint (same fallback the original site uses).

export const WASM_URL =
  "https://media.githubusercontent.com/media/official-knightly/Berserk-web/main/engine/berserk_bg.wasm";

export type Candidate = {
  rank: number;
  depth: number;
  uci: string;
  pv: string[];
  scoreCp: number;
  mate: number | null;
};

export type SearchResult = {
  bestmove: string;
  scoreCp: number;
  depth: number;
  nodes: string;
  candidates: Candidate[];
};

export type EngineStatus = "idle" | "loading" | "ready" | "error";

type Listener = (s: { status: EngineStatus; progress: number; error?: string }) => void;

class BerserkEngine {
  private worker: Worker | null = null;
  private pending = new Map<number, { resolve: (r: SearchResult) => void; reject: (e: Error) => void }>();
  private seq = 0;
  private queue: Promise<unknown> = Promise.resolve();
  status: EngineStatus = "idle";
  progress = 0;
  error?: string;
  private listeners = new Set<Listener>();
  ready!: Promise<void>;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn({ status: this.status, progress: this.progress, error: this.error });
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((l) => l({ status: this.status, progress: this.progress, error: this.error }));
  }

  start() {
    if (this.worker || typeof window === "undefined") return this.ready;
    this.status = "loading";
    this.emit();
    this.ready = new Promise<void>((resolve, reject) => {
      const w = new Worker("/engine/engine-worker.js", { type: "module", name: "Berserk-WASM" });
      this.worker = w;
      w.onmessage = (ev) => {
        const m = ev.data || {};
        if (m.type === "ready") {
          this.status = "ready";
          this.progress = 1;
          this.emit();
          resolve();
        } else if (m.type === "progress") {
          this.progress = m.total ? m.loaded / m.total : Math.min(0.95, m.loaded / 64_000_000);
          this.emit();
        } else if (m.type === "init-error") {
          this.fail(m.error || "Berserk WASM initialization failed.");
          reject(new Error(this.error));
        } else if (m.type === "result" || m.type === "search-error") {
          const p = this.pending.get(m.id);
          if (!p) return;
          this.pending.delete(m.id);
          if (m.type === "search-error") p.reject(new Error(m.error));
          else p.resolve(m as SearchResult);
        }
      };
      w.onerror = (e) => {
        this.fail(e.message || "Berserk worker failed.");
        reject(new Error(this.error));
      };
      w.postMessage({ type: "init", wasmUrl: WASM_URL });
    });
    this.ready.catch(() => {});
    return this.ready;
  }

  private fail(msg: string) {
    this.status = "error";
    this.error = msg;
    this.emit();
    this.pending.forEach((p) => p.reject(new Error(msg)));
    this.pending.clear();
  }

  /** Searches are serialized: the WASM search is synchronous inside the worker. */
  search(fen: string, ms: number, multiPV = 1): Promise<SearchResult> {
    const run = async () => {
      await this.start();
      const id = ++this.seq;
      return new Promise<SearchResult>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.worker!.postMessage({
          type: "search",
          id,
          fen,
          milliseconds: Math.max(100, Math.min(10000, Math.round(ms))),
          multiPV: Math.max(1, Math.min(8, Math.round(multiPV))),
        });
      });
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
}

export const engine = new BerserkEngine();
