# Wildwood Backgammon: notes for Claude

A backgammon game that runs entirely in the browser, with a coach that teaches as you play.
Everything ships as **one self-contained HTML page** (`backgammon.html`), with no server and no
runtime dependencies. The owner plays it as a published Claude artifact and wants it to stay
free to run. An LLM "explain this move" layer may be added later.

## Layout

| path | what |
|---|---|
| `backgammon.html` | **The app.** Markup, CSS and one `<script>` holding the engine plus UI. It is an HTML *fragment* (no `<!doctype>`/`<head>`); the artifact host adds the page skeleton. |
| `engine.js` | **Source of truth for the rules and analysis engine.** Exported for Node tests. |
| `build-page.js` | Copies `engine.js` into `backgammon.html` between the markers `/* ===== engine (verified rules core) ===== */` and `/* ===== UI ===== */`. |
| `build-site.js` | `npm run build:site`: wraps the fragment into `_site/index.html` (git-ignored) for GitHub Pages. |
| `.github/workflows/` | `test.yml` (CI) and `pages.yml` (deploys to GitHub Pages on push to `main`). |
| `tests/` | jsdom and Playwright suites, plus `run-all.js`. Fixtures are in `tests/fixtures/`. |
| `tools/` | One-off scripts: evaluation-net pipeline (`net-gen.js`, `net-features.js`, `train-net.py`, `pack-net.js`, `net-bench.js`, `make-net-fixture.js`), race calibration, cube-position finder, theme screenshots. They write scratch files to `/tmp`. |
| `wildbg-kit/` | `label.rs` (scores positions with wildbg to train the evaluation net), the board adapter, and a guide for running wildbg itself in a self-hosted build (WASM). |

## Workflow rules

1. **Engine changes go in `engine.js`, then run `npm run build`.** Never hand-edit the engine
   section inside `backgammon.html`; the next build will overwrite it.
2. **`backgammon.html` must end with `</script>`.** A missing closing tag once killed the whole
   menu. `build-page.js` also refuses an engine containing `</script`.
3. Run `npm test` before every commit. It needs Chromium for `feel-test`; if that isn't
   available, run `npx playwright install chromium`, or use `npm run test:fast` to skip it.
4. Keep the page self-contained. External requests are limited to the Google Fonts
   stylesheet, and the page must still work if that fails. No CDNs, no fetch calls, no WASM
   in the published page. wildbg is for a self-hosted build only; see `wildbg-kit/`.
5. Must work at phone width (about 400px), in light and dark mode, and with reduced motion.
6. **Never put an API key or other secret in the repo or in the published page.** That covers
   the planned LLM "explain this move" layer too. Keys go in GitHub's secret settings
   (Settings → Secrets and variables → Actions) and are read only by workflows or a server.
   A GitHub secret is **not** safe to inject into `backgammon.html` or `_site/` at build time:
   Pages serves a public static page, so anything in it can be read by every visitor. An LLM
   feature must call the model through something that keeps the key on the server side (a
   small proxy, or the Claude artifact runtime), or have each player enter their own key at
   runtime (kept in localStorage, never committed). CI fails if an Anthropic key pattern
   (`sk-ant-…`) appears in tracked files or the built site.

## Architecture

### Board model
- `points[1..24]`: positive numbers are White's checkers, negative are Black's.
- `bar{w,b}` and `off{w,b}` hold checkers on the bar and borne off.
- White moves 24→1; Black moves 1→24.
- A step is `{from:'bar'|pt, to:pt|'off', die}`.

### Engine (`engine.js`)
**Rules**
- `generateLegalTurns` enforces the max-dice and higher-die rules and removes duplicates.
- `destinationsFrom` powers compound one-click moves (for a 5-3, the full 8 in one click).

**Evaluation net** (`EVAL_NET`, between the `EVAL_NET:begin/end` markers)
- `probsOnRoll(b, q)` runs a 225→128→64→5 tanh net: `netInputs` (raw board per point,
  bar/off, plus the 29 hand-built `probFeatures`) → win, gammon and backgammon chances for
  the player on roll. Weights are int8 (per-row scale) in base64, about 56 KB.
- Trained offline to copy wildbg's strong nets (the `nets` branch). wildbg never runs in
  the page: it only labels training positions. Held-out error: ~1.2pp win in contact,
  ~0.7pp in races (the old 29-input MLP was ~6.4pp / ~2pp).
- To retrain: `tools/net-gen.js` → label with `wildbg-kit/label.rs` → `tools/net-features.js`
  → `tools/train-net.py` → `tools/pack-net.js <net.json>` → `npm run build`. Check with
  `tools/net-bench.js` and rebuild the fixture for `tests/net-test.js`.

**Move analysis**
- `analyze(board, p, dice)` ranks moves by `evaluate` = cubeless equity from the net,
  after each candidate move (1-ply). It gives up ~0.004–0.009 equity per decision against
  wildbg (the old `featureScore` ranker gave up ~0.07). `quickBest` ranks the same way.
- Equity and mistake thresholds are cubeless equity: 0.02 inaccuracy, 0.08 mistake,
  0.20 blunder (the review's `SEV` scale). Cube errors use the same scale. Settings saved
  before the net (0.05/0.15/0.30 on the old heuristic scale) are migrated on load.
- `featureScore` (blots, points, primes) is now only an input to the net.
- `describeTurn` writes the plain-language coaching text.

**Cube**
- `cubeAnalysis` handles money play (Janowski, cube efficiency x=0.68).
- `matchCubeAnalysis` and `metGet` handle match play with the Kazaross-XG2 match equity table.
- `cubeError` scales match errors to money equivalents.

**Bot levels** (`BOT_LEVELS`, `botChoose`, `botCubeView`)
- Easy / Medium / Strong. Weaker levels add Gaussian noise to each candidate's equity
  (0.23 / 0.09) and to the win chance for cube decisions, so errors fall where moves are close.
- Tuned with `tools/calibrate-levels.js`: Easy wins ~50% against a simulated beginner (the old
  hand-built ranker); Medium ~PR 14. `rating` is each level's fixed FIBS-scale rating
  (500 / 1700 / 2200), fitted to head-to-head results.
- UI: `state.prefs.level` (default medium, in `wwbg-prefs`), `botLevel()`. Tests that check
  cube mechanics pin `state.prefs.level='strong'` so the bot's cube play is exact.

**Review helpers**
- `quickBest`, `rollLuck` (averages over all 21 rolls), `whiteWinChance`, `cubelessEq`, `eqAfterMove`.

### UI (the second half of the `<script>` in `backgammon.html`)

**Screens and modes**
- Screens: `menu`, `match`, `learn` (mistake replay and quiz), `review` (post-game), `progress`.
- Modes: `state.mode` is `vsai` or `hotseat`. `isHuman(p)` is quiz-aware.

**Turn state**
- `state.gameId` is bumped on every new game or position. Async work (bot turns, animations)
  checks it and bails out if it has changed.
- `finishHumanTurn` must stay idempotent: `phase` goes 'moving' → 'ending'. A double call once
  gave the bot two turns. Test harnesses set `phase='moving'` before calling it.
- `state.busy` is set while animating.

**Animation and game feel**
- `fly()` uses the Web Animations API. `animateStep` also flies hit checkers to the bar, and
  `tumble()` animates the dice.
- `state.prefs.speed` sets the pace: slow ×1.6, normal ×1, fast ×0.55, off. It defaults to off
  under reduced motion.
- Last-move markers: a halo on checkers that arrived and a dashed ghost where one left.
- Drag and drop uses pointer events.

**Board themes**
- Themes are pure CSS variables on `[data-board="…"]`: classic, leather, club, marble, midnight.
- Each theme block must set *every* variable. The base block `:root, [data-board]` supplies
  defaults, and theme blocks override them. This is what lets the menu's preview swatches
  (which carry their own `data-board`) render any theme while nested inside another.
- Checker faces use `--cw-bg`/`--cb-bg` (rim/body), `--cw-top`/`--cb-top` (the inset face in
  `::before`) and `--stitch-ring` (drawn in `::after`).
- Textures are inline SVG data URIs: `--grain`, `--relief`, `--veins`.

**Persistence**
- Everything is in localStorage. Every read and write must be wrapped in try/catch.
- Data keys: `wwbg-mistakes-v1`, `wwbg-history-v1`, `wwbg-games-v1` (the last 20 game records).
- Settings keys: `wwbg-names`, `wwbg-threshold`, `wwbg-cube`, `wwbg-matchto`, `wwbg-prefs`
  (speed, sound, autoForced, board, level), `wwbg-theme` (light or dark).
- The game-record store is the global `gameRecs`. Don't name a local variable `games`: a clash
  once broke the Progress screen.

## Testing notes
- jsdom suites wrap the fragment in a document and stub `matchMedia` (reduced motion on),
  `requestAnimationFrame`, `confirm` and `URL`. They drive the page through `win.eval(...)`.
- `feel-test.js` and `tools/shot-themes.js` use Playwright and Chromium, and write `/tmp/page.html`.
- `review-flow.js` very occasionally reports one failure because the games it plays are
  random. Re-run it before investigating.
- Visual changes: run `node tools/shot-themes.js <outdir>` and look at the PNGs.

## Publishing
- The owner plays the version published as a Claude artifact.
- GitHub Pages: `.github/workflows/pages.yml` runs on every push to `main` (and by hand via
  workflow_dispatch). It checks the page is in sync with `engine.js`, runs `npm run test:fast`,
  then runs `build-site.js`, which wraps the fragment in `<!doctype html><meta charset=utf-8><meta name=viewport …>`
  plus the same base styles the test harnesses use, and deploys `_site/`. The repo's
  Settings → Pages → Source must be set to "GitHub Actions". Never commit a separate,
  diverging copy of the app; `_site/` is build output only.
