# Response

**Sistem Pendukung Keputusan Optimasi Rute Armada Pemadam Kebakaran untuk Penanganan Banjir Kota Surabaya.**

Models routing as **MDCVRP-IF-SI** (Multi-Depot Capacitated Vehicle Routing Problem with Intermediate Facilities and Severity Index) and solves it with **Hybrid Ant Colony System** (main) and **Variable Neighborhood Search** (baseline).

Thesis project — Information Systems, Institut Teknologi Sepuluh Nopember (ITS).

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind v4 + react-leaflet + Recharts |
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

## Documentation

- [PRD.md](PRD.md) — product requirements, architecture, API specs, feature priorities
- [AGENT.md](AGENT.md) — repo structure, coding conventions, algorithm details, common tasks
- [DESIGN.md](DESIGN.md) — visual design system, color tokens, typography, component specs
- [CLAUDE.md](CLAUDE.md) — instructions for AI agents working on this codebase
- `.agent/skills/` — focused skill notes for Next.js, FastAPI, Leaflet, and the algorithm layer

## Constraints

No database. No auth. No real-time data ingestion. Algorithms never run in the browser — they run on the Python backend only. UI text is in Bahasa Indonesia; code, comments, and commit messages are in English.
