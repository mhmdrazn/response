# Response

**Sistem Pendukung Keputusan Optimasi Rute Armada Pemadam Kebakaran untuk Penanganan Banjir Kota Surabaya.**

Models routing as **MDCVRP-IF-SI** (Multi-Depot Capacitated Vehicle Routing Problem with Intermediate Facilities and Severity Index) and solves it with **Hybrid Ant Colony System** (main) and **Variable Neighborhood Search** (baseline).

Thesis project — Information Systems, Institut Teknologi Sepuluh Nopember (ITS).

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind v4 + MapLibre GL (Protomaps tiles) + Recharts |
| Backend  | FastAPI + Python 3.12 + NumPy + pandas + scikit-learn |
| Data     | Static CSV + NumPy `.npy` (no database) |

## Repository layout

```
response/
├── frontend/      # Next.js app (port 3000)
├── backend/       # FastAPI app (port 8000)
├── notebooks/     # Colab notebooks for data collection
├── PRD.md         # Product requirements
├── AGENT.md       # Repo conventions
├── DESIGN.md      # Design system
└── CLAUDE.md      # Working agreement for AI agents
```

## Run locally

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Health check: <http://localhost:8000/health>. Interactive docs: <http://localhost:8000/docs>.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at <http://localhost:3000>. The frontend expects the backend at `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8000` via `.env.local`).

### Live traffic (optional)

**Map layer (TomTom).** The "Lalu Lintas" pill under *Lapisan Data* draws TomTom's
live traffic flow over the basemap, as vector lines the map styles itself (smooth
at any zoom, one line per direction where they differ). It is visual only: the OSRM matrix, the
severity index, ACS/VNS and every route stay exactly as they are.

1. Get a key at <https://developer.tomtom.com> (the free tier includes 200,000
   vector traffic tiles a month).
2. Put it in `frontend/.env.local` as `TOMTOM_API_KEY=...` — **without** the
   `NEXT_PUBLIC_` prefix, so it stays on the server. On Vercel, add the same
   variable to the frontend project's environment variables.
3. Restart `npm run dev`.

The browser never sees the key: tiles come through `/api/traffic-tiles/{z}/{x}/{y}`,
a Next.js route that adds it on the server. To stay inside the free tier the proxy
serves only tiles over Surabaya (zoom 10–15; closer in the map reuses the zoom-15
tiles, so zooming costs nothing; a full view is about 8 tiles), reuses each tile for 2 minutes (in memory and via `Cache-Control`
for the browser/CDN), and stops at a daily and a monthly cap — by default 90 % of
the free tier spread over 31 days (`TOMTOM_DAILY_TILE_LIMIT`, `TOMTOM_MONTHLY_TILE_LIMIT`
to change them). Past a cap the layer hides itself with a note and comes back the
next day. `/api/traffic-tiles/status` shows today's and this month's count. The
count lives in memory and in a file in the OS temp folder; on a serverless host
each instance counts on its own, which is why the caps sit below the free tier.

**Route planning with traffic (Google, optional).** The switch *Pertimbangkan lalu
lintas saat ini* in the algorithm panel uses Google's Routes API from the backend:
set `GOOGLE_MAPS_API_KEY` in `backend/.env` (restrict the key to the Routes API).
Each refresh buys at most `TRAFFIC_MAX_ELEMENTS` matrix elements (default 400),
reused for `TRAFFIC_CACHE_TTL_S` (default 10 min). Without the key the switch stays
disabled and everything runs on the precomputed OSRM times.

### Closing depots and outlets

Hover a depot or a water outlet (*Sungai*) on the map: its tooltip has a button to
switch the depot off (*Nonaktifkan depo*) or close the outlet (*Tutup titik buang*),
for example when a river has overflowed. Closed ones stay on the map, faded with a
red badge, and the next run leaves them out (`disabled_depots` / `closed_ifs` in the
run request: their rows and matrix entries are dropped before the instance is
built). The algorithm panel lists what is closed, with *Pulihkan semua* to undo.

## Documentation

- [PRD.md](PRD.md) — product requirements, architecture, API specs, feature priorities
- [AGENT.md](AGENT.md) — repo structure, coding conventions, algorithm details, common tasks
- [DESIGN.md](DESIGN.md) — visual design system, color tokens, typography, component specs
- [CLAUDE.md](CLAUDE.md) — instructions for AI agents working on this codebase
- `.agent/skills/` — focused skill notes for Next.js, FastAPI, Leaflet, and the algorithm layer

## Constraints

No database. No auth. No real-time data ingestion. Algorithms never run in the browser — they run on the Python backend only. UI text is in Bahasa Indonesia; code, comments, and commit messages are in English.
