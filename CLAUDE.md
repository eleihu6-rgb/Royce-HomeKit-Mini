# Project Rules

## Version Bumping

The app version is displayed in `index.html` (React entry) and in `src/components/Sidebar.tsx`:
- `index.html` → `<title>ROIs Crew — Ver B{n}/F{n}</title>`
- `src/components/Sidebar.tsx` → `<div className="logo-tagline">Ver: B{n}/F{n}</div>`

**B** = backend version (increments when `server.py` changes).  
**F** = frontend version (increments when any HTML, JS, CSS, or TypeScript/TSX file changes).

**Rule: after every code change in a session, bump the relevant counter before finishing.**  
Both numbers start at 1 and only go up — never reset.

Current version: **B3/F6**

Examples:
- Changed only `server.py` → bump B only (B2/F1 → B3/F1)
- Changed only a JS/HTML/CSS/TS file → bump F only (B1/F1 → B1/F2)
- Changed both → bump both (B1/F1 → B2/F2)

Always update both `index.html` and `src/components/Sidebar.tsx`.

## Dev Workflow — Two processes must run

**Frontend (Vite + React)** — auto-pushes changes to browser instantly:
```bash
cd /home/eleihu6/Royce-HomeKit-Mini
npm run dev
# → http://localhost:5173/
```

**Backend (Python API server)** — handles all `/api/*` routes:
```bash
nohup python3 server.py >/tmp/server_nbids.log 2>&1 &
```

Vite proxies every `/api/*` request to `http://localhost:8088`, so both run together seamlessly.

## Server Restart After `server.py` Changes

After any change to `server.py`, restart the Python server.
Use `kill -9` on ALL running instances — `pkill` alone is not enough.

```bash
ps aux | grep "server.py" | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null
sleep 1
nohup python3 server.py >/tmp/server_nbids.log 2>&1 &
sleep 2
ps aux | grep "server.py" | grep -v grep   # confirm exactly ONE process
```

Vite does **not** need restarting for frontend changes — it hot-reloads automatically.
