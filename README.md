# Wedding Board

A shared planning canvas for an Indian wedding: outfits, guest lists, venues, budgets, decor ideas, vendors, functions and to-dos on one auto-arranging board. Paste photos, type notes into the chat box, and Claude files everything into the right place.

Runs **on your own computer**. Open it from your laptop browser and from your phones (same Wi-Fi). Data stays in local files.

## Run it

### With Docker (recommended)

```bash
docker compose up -d            # build the image and start it on port 18001
docker compose up -d --build    # rebuild after changing the code
docker compose logs -f          # watch it
docker compose down             # stop it (your data stays in ./data and ./uploads)
```

Then open `http://<this machine's address>:18001` from your laptop or phones (same Wi-Fi). Share → *Add to Home Screen* makes it feel like an app. Everyone sees the same board, and edits appear live on all devices.

The container restarts by itself after a crash or reboot. Three folders are mounted into it:

| Host | In the container | What |
|---|---|---|
| `./data` | `/app/data` | the board, conversations, plan, daily backups |
| `./uploads` | `/app/uploads` | photos |
| `~/.claude` | `/claude` | your Claude login, so the chat uses your subscription |

Run `claude` once on the host to log in before starting. The container runs as your own user (uid 1000 by default; set `PUID`/`PGID` if yours differs), so those files keep their owner. Settings go in a `.env` file next to `compose.yaml`, for example `BOARD_PIN=2468` or `BOARD_PORT=8080`.

### Without Docker

```bash
npm install
npm start       # prints the address to open; default port 3000
```

Optional settings (environment variables):

| Variable | Meaning |
|---|---|
| `PORT` | default `3000` (with Docker use `BOARD_PORT` instead, default `18001`) |
| `BOARD_PIN` | require this PIN before anyone can open the board, e.g. `BOARD_PIN=2468 npm start` |
| `HOST` | `127.0.0.1` to allow only this computer (default `0.0.0.0` = whole Wi-Fi) |
| `ALLOWED_HOSTS` | extra hostnames to accept, e.g. a Tailscale name (`my-pc.tail1234.ts.net`) |
| `WB_MODEL` | Claude model for the chat (default `sonnet`) |
| `CLAUDE_HOME` | Docker only: folder holding your Claude login (default `~/.claude`) |
| `WB_NO_WEB` | set to `1` to stop Claude searching the web in conversation |
| `WB_DATA_DIR`, `WB_UPLOADS_DIR` | where `board.json` and photos live (default `./data`, `./uploads`) |

Without `BOARD_PIN`, anyone on your Wi-Fi can open and edit the board. Set a PIN if you share networks.

## Using the board

It is a moodboard, not a form. Dump things on it however they come out and Claude arranges them.

- **Talk to Claude:** the bar at the bottom is a conversation. Ask (*"what is still pending discussion?"*, *"what should we be doing this month?"*, *"ideas for a marigold and pink mandap"*) and it answers in the Claude panel, remembering what you said before. Tell it things (*"Taj quoted 12 lakh for the sangeet, 2 lakh token paid"*) and it puts them on the board and says what it did. It can search the web when you ask for something it cannot know.
- **Chat inside a section:** 💬 on any section opens a conversation just about that section, with its own thread. New notes land there.
- **Paste or drop:** paste a photo or text anywhere on the board (Ctrl/⌘+V), drag photos in, or use 📎 / the phone camera. It appears instantly, marked "Claude is arranging…", and a few seconds later has a title, the right section, tags, amounts and a colour palette.
- **Post-its:** every note is a post-it in its section's colour, whether you add it or Claude does. Photos are polaroids. A note can be a quote or a to-do with a checkbox, and can be featured at double width.
- **Decisions:** any note can be stamped 💬 *To discuss*, ⏸ *Parked* or 🔒 *Locked in*. Say *"park the vintage car idea"* or *"the Taj is final"*, or set it on the note. The pills at the top left dim everything else; the **Decisions** tab lists all three groups with one-tap lock / park / reopen. Parked notes are left out of the budget.
- **Plan:** the complete checklist for an Indian wedding, about 75 steps from "agree the budget" to "collect the marriage certificate", in eight phases with due dates worked back from your wedding day. Tick steps yourself or tell Claude what is done; add your own steps. Each step links to a section chat.
- **✨ Arrange:** Claude goes over the whole board: moves strays, groups related notes, cleans up titles, merges duplicates. One ↶ undoes it.
- **Journal:** everything you ever added, newest first, with the words you originally typed. Click an entry to fly to it. Deleted notes wait at the bottom and can be restored.
- **Canvas:** sections pack themselves into columns and empty sections shrink to slim bars. Drag a note to reorder or move it (on touch: press and hold). Scroll or drag to pan; pinch or Ctrl+scroll to zoom; **Fit** fits the screen. ◐ switches light and dark.
- **Banner:** names, date and countdown, budget vs planned vs paid, guests by side, next function, decisions, and plan progress. Notes with status *idea*, *shortlisted* or *declined* are not counted as planned spend, so comparing three venues does not triple your budget.

## How the Claude part works

The server runs the `claude` CLI headlessly (`claude -p`) with your existing Claude subscription login (the Docker image has the CLI built in and borrows the login from the host). No API key is needed, and a stray `ANTHROPIC_API_KEY` is ignored on purpose. Install Claude Code and run `claude` once to log in. Claude gets a compact JSON view of the board plus what you dropped and replies with validated operations (add/update/move/reorder cards, set budget…). Its only tools are reading the photos you attach and, in conversation, web search (turn that off with `WB_NO_WEB=1`). If Claude is unavailable, what you dropped simply stays in the Inspiration Inbox as you wrote it, so nothing is lost.

## Your data

- `data/board.json`: the board, conversations, plan progress, the journal and deleted items (also a daily copy in `data/backups/`). `uploads/`: photos (resized to ≤1600px in the browser).
- Both are git-ignored, so pushing this repo to GitHub publishes the app, not your wedding.
- To move to another computer, copy `data/` and `uploads/`.

## Develop

```bash
npm test      # unit tests: amounts, layout, operations, fallback
npm run dev   # restart on file changes
```

No build step or frontend dependencies. Layout lives in `public/layout.js`, rendering and gestures in `public/app.js`, operations/validation in `lib/store.js`, Claude integration in `lib/claude.js`.
