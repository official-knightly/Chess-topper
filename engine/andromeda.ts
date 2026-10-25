/**
 * Andromeda browser adapter for the Emscripten/WASM build.
 *
 * Expected generated assets (per scripts/build-wasm.sh):
 *   <repository-root>/dist/andromeda.js
 *   <repository-root>/dist/andromeda.wasm
 *
 * This file lives in Andromeda/web/, so the default asset path is ../../dist/.
 *
 * IMPORTANT: this lightweight engine's search API starts a search asynchronously.
 * uci("go ...") starts the search; it does not synchronously return bestmove.
 * For a responsive UI, use this adapter inside a Web Worker and poll/read output
 * or extend the C++ API to expose search callbacks before treating it as a full
 * streaming UCI engine.
 */

type EmscriptenModule = {
    ccall: (
        ident: string,
        returnType: string | null,
        argTypes: string[],
        args: unknown[],
    ) => unknown;
    UTF8ToString: (ptr: number) => string;
    _initialize_engine: () => void;
    _get_uci_output: () => number;
};

type AndromedaFactory = (options?: {
    locateFile?: (file: string, prefix: string) => string;
}) => Promise<EmscriptenModule>;

export type AndromedaEngine = {
    uci: (command: string) => string;
    newGame: () => string;
    setOption: (name: string, value: string | number) => string;
    positionStart: (moves?: string[]) => string;
    positionFen: (fen: string, moves?: string[]) => string;
    go: (options?: {
        depth?: number;
        movetime?: number;
        nodes?: number;
        infinite?: boolean;
    }) => string;
    stop: () => string;
    evaluate: () => string;
    debug: () => string;
};

export type AndromedaEngineOptions = {
    /** URL of generated dist/ directory. Override this when hosting assets elsewhere. */
    wasmBaseUrl?: string | URL;
    /** URL of generated andromeda.js ESM factory. */
    moduleUrl?: string | URL;
};

export async function createAndromedaEngine(
    options: AndromedaEngineOptions = {},
): Promise<AndromedaEngine> {
    const defaultDistUrl = new URL("../../dist/", import.meta.url);
    const wasmBaseUrl = new URL(options.wasmBaseUrl ?? defaultDistUrl);
    const moduleUrl = new URL(
        options.moduleUrl ?? new URL("andromeda.js", wasmBaseUrl),
    );

    // A variable specifier avoids TypeScript requiring a declaration for the
    // generated Emscripten JS file. The URL is resolved relative to this adapter.
    const imported = await import(/* webpackIgnore: true */ /* @vite-ignore */ moduleUrl.href);
    const factory = (imported.default ?? imported.AndromedaModule) as AndromedaFactory | undefined;

    if (typeof factory !== "function") {
        throw new Error(
            "Andromeda WASM loader did not export a factory. Rebuild with -sMODULARIZE=1 -sEXPORT_ES6=1.",
        );
    }

    const module = await factory({
        locateFile(file: string, prefix: string) {
            return file.endsWith(".wasm")
                ? new URL(file, wasmBaseUrl).href
                : prefix + file;
        },
    });

    module._initialize_engine();

    const readOutput = (): string => {
        const ptr = module._get_uci_output();
        return ptr ? module.UTF8ToString(ptr) : "";
    };

    const uci = (command: string): string => {
        // C/C++ expects const char*. Passing a JS string directly to the raw
        // exported function is incorrect; ccall allocates/converts the string.
        module.ccall("send_uci_command", null, ["string"], [command]);
        return readOutput();
    };

    return {
        uci,
        newGame: () => uci("ucinewgame"),
        setOption: (name, value) => uci(`setoption name ${name} value ${value}`),
        positionStart: (moves = []) =>
            uci(moves.length ? `position startpos moves ${moves.join(" ")}` : "position startpos"),
        positionFen: (fen, moves = []) =>
            uci(`position fen ${fen}${moves.length ? ` moves ${moves.join(" ")}` : ""}`),
        go: (goOptions = {}) => {
            const parts: string[] = [];
            if (goOptions.depth !== undefined) parts.push(`depth ${Math.max(1, Math.floor(goOptions.depth))}`);
            if (goOptions.movetime !== undefined) parts.push(`movetime ${Math.max(1, Math.floor(goOptions.movetime))}`);
            if (goOptions.nodes !== undefined) parts.push(`nodes ${Math.max(1, Math.floor(goOptions.nodes))}`);
            if (goOptions.infinite) parts.push("infinite");
            return uci(`go${parts.length ? " " + parts.join(" ") : ""}`);
        },
        stop: () => uci("stop"),
        evaluate: () => uci("eval"),
        debug: () => uci("d"),
    };
}
