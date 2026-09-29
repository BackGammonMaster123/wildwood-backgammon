# Wildwood Backgammon

Backgammon in the browser with a built-in coach, all in a single HTML file.

- Play the bot, or play pass-and-play against a friend, with names and a per-player mistake log.
- The coach grades every move, explains the better play and gives hints.
- Doubling cube for money play and matches (3–15 points, with the Crawford rule).
- "Learn from mistakes" replays your logged blunders as a spaced-repetition quiz.
- Post-game review shows a win-chance graph, luck per roll and your biggest errors.
- A progress screen tracks your error rate over time.
- Game feel: drag-and-drop, animated moves including the bot's turn, sound, and auto-play of
  forced moves.
- Five board themes: classic walnut, navy leather, club green, marble & gold, and midnight.

## Run it
Play online at https://backgammonmaster123.github.io/wildwood-backgammon/ (deployed from `main`
by GitHub Pages), or open `backgammon.html` in a browser.

## Develop
```bash
npm install
npx playwright install chromium   # only needed for the browser test
npm run build                     # after editing engine.js
npm test
```
See `CLAUDE.md` for how the code is organised and the rules to follow.
