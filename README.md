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

- **Chat box (bottom):** write naturally. *"Booked Umaid Bhawan for the Sangeet, ₹12 lakh, paid 2 lakh advance"*, *"Sharma family from Delhi, 18 people, bride's side"*, *"ideas for a marigold and pink mandap"*, *"how much have we planned vs paid?"*. Claude adds or updates cards, sets amounts and dates, and answers questions about the board. Everything is undoable with ↶.
- **Photos:** paste (Ctrl/⌘+V) or use 📎 / the phone camera, then send. Claude looks at the photo, titles it, tags it and files it. Dropping a photo straight onto a section adds it there without Claude.
- **Canvas:** sections are frames that pack themselves into columns; cards flow inside them. Drag a card to reorder or move it to another section (on touch: press and hold). Scroll or drag to pan; pinch or Ctrl+scroll to zoom; **Fit** re-arranges and fits the screen.
- **Click a card** to edit budget, paid, guest count, date, status, side (bride/groom), tags, link, photo. **⋯** on a section renames, recolours, reorders or deletes it; **＋ Section** adds your own.
- **Overview card:** wedding countdown, budget vs planned vs paid, spend by category, guest totals by side, next functions, to-do progress. Items with status *idea*, *shortlisted* or *declined* are not counted as planned spend, so comparing three venues does not triple your budget.

## How the Claude part works

The server runs the `claude` CLI headlessly (`claude -p`) with your existing Claude subscription login. No API key is needed, and a stray `ANTHROPIC_API_KEY` is ignored on purpose. Install Claude Code and run `claude` once to log in. Claude gets a compact JSON view of the board plus your message and replies with validated operations (add/update/move cards, set budget…). It has no tools except reading the photos you attach. If Claude is unavailable, the chat falls back to simple keyword filing so nothing you type is lost.

## Your data

- `data/board.json`: the board (also a daily copy in `data/backups/`). `uploads/`: photos (resized to ≤1600px in the browser).
- Both are git-ignored, so pushing this repo to GitHub publishes the app, not your wedding.
- To move to another computer, copy `data/` and `uploads/`.

## Develop

```bash
npm test      # unit tests: amounts, layout, operations, fallback
npm run dev   # restart on file changes
```

No build step or frontend dependencies. Layout lives in `public/layout.js`, rendering and gestures in `public/app.js`, operations/validation in `lib/store.js`, Claude integration in `lib/claude.js`.
