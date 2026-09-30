# Wiring the wildbg neural engine into Wildwood Backgammon

> **Status:** the game no longer needs this for strong analysis. Its built-in evaluation net was
> trained to copy wildbg (see CLAUDE.md, "Evaluation net", and `label.rs` here) and gives up only
> ~0.004–0.009 equity per move against it. This guide remains for a self-hosted build that wants
> wildbg itself (for example for rollouts).

The game exposes its analysis as one `analyze(board, player, dice)` function. This guide swaps
that for **wildbg**, an open-source
neural-net engine (club-to-expert strength), for gold-standard equity — without touching the board,
rules, or UI.

Everything here runs **on your own machine / your own static host**. It does **not** work inside the
hosted Claude artifact: that sandbox blocks loading external WebAssembly, and there's no CDN build of
wildbg. So: keep the artifact as the heuristic version; build this for the self-hosted version you own.

---

## 1. Build the wasm package (free, ~1 command)

```bash
# one-time toolchain
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# build wildbg's official wasm bindings
git clone https://github.com/carsten-wenderdel/wildbg
cd wildbg
wasm-pack build crates/wildbg-wasm --target web --release --out-dir ../../pkg
# optional: 2–4x faster with SIMD
# RUSTFLAGS="-C target-feature=+simd128" wasm-pack build crates/wildbg-wasm --target web --release --out-dir ../../pkg
```

This produces a `pkg/` folder with `wildbg_wasm.js`, `wildbg_wasm_bg.wasm` (neural nets embedded — no
extra files to fetch), and `wildbg_wasm.d.ts`. Put `pkg/` next to your `index.html`, alongside
`wildbg-adapter.js` (included in this kit).

> Note: wildbg's own CI runs `cargo check --package wildbg-wasm --target wasm32-unknown-unknown` on
> every commit, so this build path is supported and maintained. The two neural nets on the main branch
> are small "demo" nets — for full strength, use the nets from the `nets` branch / `wildbg-training`
> repo (see wildbg's README).

## 2. Load it (this is the whole change)

wildbg's `analyze()` is **synchronous** once the module is initialized — only `init()` is async — so
you don't need to make the game async. Two small edits:

**a) One indirection in the page's main `<script>`.** Rename the heuristic `analyze` and route through a
swappable engine:

```js
// was: function analyze(board, p, dice) { ...heuristic... }
function heuristicAnalyze(board, p, dice) { /* ...unchanged body... */ }

let ENGINE = null;                       // set once wildbg is ready
function analyze(board, p, dice) {
  return ENGINE ? ENGINE.analyze(board, p, dice) : heuristicAnalyze(board, p, dice);
}
window.__setEngine = (e) => { ENGINE = e; };   // called by the module below
```

Everything else in the game keeps calling `analyze(...)` exactly as before, and falls back to the
heuristic until wildbg finishes loading.

**b) Two script tags** at the end of `<body>`:

```html
<script src="wildbg-adapter.js"></script>   <!-- defines window.makeWildbgEngine -->
<script type="module">
  import init, { Wildbg } from './pkg/wildbg_wasm.js';
  await init();
  const engine = window.makeWildbgEngine(new Wildbg(), {
    replay: window.replay,             // the game's own functions, reused
    describeTurn: window.describeTurn, // keeps the plain-language coaching text
  });
  window.__setEngine(engine);
</script>
```

That's it. The coach's equities, win %, best-move ranking, and the "learn from mistakes" grading are now
neural-net driven. Because the output shape is identical, the mistake log, hint button, and move list
all keep working.

## 3. Keep or upgrade the explanations

- **Keep the heuristic prose:** pass `describeTurn` as shown — wildbg gives the numbers, your existing
  text generator narrates them.
- **LLM narration:** drop `describeTurn` and, in the coach panel, send wildbg's output
  (best line + equity + win/gammon/backgammon probabilities) to an LLM for richer coaching. That's the
  same seam — the engine computes, the language layer explains.

## 4. Performance

Multi-ply analysis evaluates all 21 dice rolls, so run it in a **Web Worker** to keep the board
responsive on long thinks (wildbg's docs cover this). The `+simd128` build flag above gives a 2–4x
speedup in modern browsers.

---

## What's in this kit

| file | purpose |
|------|---------|
| `wildbg-adapter.js` | Converts the Wildwood board ⇄ wildbg's 26-int "mover pips", and wraps `Wildbg` into an `analyze()` with the same shape the game expects. |
| `adapter-test.js` | Proves the coordinate mapping is correct (`node adapter-test.js`). |
| `WILDBG-WIRING.md` | This guide. |

## Why you can trust the mapping

The riskiest part of any such adapter is the board-perspective conversion (White vs Black move in
opposite directions; wildbg always frames the position from the player *to move*). `adapter-test.js`
validates it **without needing the wasm**: it takes each position, rotates it into wildbg's frame,
generates the moves there, maps them back, and checks they exactly equal the rules engine's own moves
for that player. Result across 40 random games:

```
4738 positions checked · 1115 bar cases · 181 bear-off cases · 0 mismatches
```

and the Black starting position produces the same mover-pips as White (`24:2 13:5 8:3 6:5`,
opponent negative) — matching wildbg's documented convention. So once the wasm builds, it receives
correct positions and its moves are read back correctly.
