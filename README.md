# Wedding Board

A shared planning canvas for an Indian wedding: outfits, guest lists, venues, budgets, decor ideas, vendors, functions and to-dos on one auto-arranging board. Paste photos, type notes into the chat box, and Claude files everything into the right place.

Runs **on your own computer**. Open it from your laptop browser and from your phones (same Wi-Fi). Data stays in local files.

## Run it

```bash
npm install
npm start
```

The terminal prints two addresses:

```
This computer : http://localhost:3000
Phone / tablet: http://192.168.1.6:3000   (same Wi-Fi)
```

Open the second one on your phone (Share → *Add to Home Screen* makes it feel like an app). Everyone with the link sees the same board, and edits appear live on all devices.

Optional settings (environment variables):

| Variable | Meaning |
|---|---|
| `PORT` | default `3000` |
| `BOARD_PIN` | require this PIN before anyone can open the board, e.g. `BOARD_PIN=2468 npm start` |
| `HOST` | `127.0.0.1` to allow only this computer (default `0.0.0.0` = whole Wi-Fi) |
| `ALLOWED_HOSTS` | extra hostnames to accept, e.g. a Tailscale name (`my-pc.tail1234.ts.net`) |
| `WB_MODEL` | Claude model for the chat (default `sonnet`) |
| `WB_DATA_DIR`, `WB_UPLOADS_DIR` | where `board.json` and photos live (default `./data`, `./uploads`) |

Without `BOARD_PIN`, anyone on your Wi-Fi can open and edit the board. Set a PIN if you share networks.

## Using the board

It is a moodboard, not a form. Dump things on it however they come out and Claude arranges them.

- **Drop anything:** type a half-formed thought in the bar at the bottom, or paste a photo or text anywhere on the board (Ctrl/⌘+V), or drag photos in, or use 📎 / the phone camera. It appears on the board instantly, marked "Claude is arranging…". A few seconds later it has a proper title, sits in the right section, and carries tags, amounts, dates and a colour palette where they apply. One note that mentions three things becomes three cards.
- **Ask or instruct:** *"how much is planned vs paid?"*, *"ideas for a marigold and pink mandap"*, *"move the Leela card to shortlisted"*. Questions and instructions are answered in the bar instead of becoming cards.
- **How things look:** photos become polaroids, loose thoughts become handwritten sticky notes, lines worth remembering become quotes, to-dos get a checkbox, and concrete things (a venue, a vendor, a guest group) become neat fact cards. The most important card in a section can be featured at double width. Claude picks; you can change it by clicking the card.
- **✨ Arrange:** Claude goes over the whole board: moves strays to the right section, puts related cards together, cleans up titles, merges duplicates. One ↶ undoes it.
- **🕘 Journal:** everything you ever added, newest first, grouped by day, with the words you originally typed. Click an entry to fly to it on the board. Deleted cards wait at the bottom of the journal and can be restored.
- **Canvas:** sections pack themselves into columns and empty sections shrink to slim bars. Drag a card to reorder or move it (on touch: press and hold). Scroll or drag to pan; pinch or Ctrl+scroll to zoom; **Fit** fits the screen. ◐ switches light and dark.
- **Banner:** names, date and countdown, budget vs planned vs paid, biggest spend, guests by side, next function, to-do progress. Items with status *idea*, *shortlisted* or *declined* are not counted as planned spend, so comparing three venues does not triple your budget.

## How the Claude part works

The server runs the `claude` CLI headlessly (`claude -p`) with your existing Claude subscription login. No API key is needed, and a stray `ANTHROPIC_API_KEY` is ignored on purpose. Install Claude Code and run `claude` once to log in. Claude gets a compact JSON view of the board plus what you dropped and replies with validated operations (add/update/move/reorder cards, set budget…). It has no tools except reading the photos you attach. If Claude is unavailable, what you dropped simply stays in the Inspiration Inbox as you wrote it, so nothing is lost.

## Your data

- `data/board.json`: the board, the journal and deleted items (also a daily copy in `data/backups/`). `uploads/`: photos (resized to ≤1600px in the browser).
- Both are git-ignored, so pushing this repo to GitHub publishes the app, not your wedding.
- To move to another computer, copy `data/` and `uploads/`.

## Develop

```bash
npm test      # unit tests: amounts, layout, operations, fallback
npm run dev   # restart on file changes
```

No build step or frontend dependencies. Layout lives in `public/layout.js`, rendering and gestures in `public/app.js`, operations/validation in `lib/store.js`, Claude integration in `lib/claude.js`.
