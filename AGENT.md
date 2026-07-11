# AGENT.md

Instructions for AI agents and developers working on the FloodRoute Surabaya codebase.

---

## Project Context

This is a **thesis project** (Tugas Akhir) for the Information Systems department at Institut Teknologi Sepuluh Nopember (ITS). It builds a decision support system for flood pumping route optimization by the Surabaya Fire Department.

The problem is modeled as MDCVRP-IF-SI (Multi-Depot Capacitated Vehicle Routing Problem with Intermediate Facilities and Severity Index). Two algorithms are implemented and compared: Hybrid Ant Colony System (main) and Variable Neighborhood Search (baseline).

**Read these files before making changes:**
- `PRD.md` for product requirements and architecture
- `DESIGN.md` for visual design system and component specifications

---

## Repository Structure

```
floodroute-surabaya/
├── frontend/                  # Next.js app
│   ├── src/
│   │   ├── app/               # App Router pages
│   │   ├── components/        # React components
│   │   │   ├── map/           # Map-related (MapContainer, markers, routes)
│   │   │   ├── sidebar/       # Sidebar panels (controls, results, chart)
│   │   │   └── ui/            # Reusable UI primitives (button, card, input)
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/               # Utilities, API client, constants
│   │   └── types/             # TypeScript type definitions
│   ├── public/                # Static assets
│   ├── tailwind.config.ts
│   └── package.json
│
├── backend/                   # FastAPI app
│   ├── app/
│   │   ├── main.py            # FastAPI entry point, CORS, lifespan
│   │   ├── routers/
│   │   │   ├── data.py        # GET endpoints for static data
│   │   │   └── optimize.py    # POST endpoints for ACS and VNS
│   │   ├── models/            # Pydantic request/response schemas
│   │   ├── algorithms/
│   │   │   ├── evaluator.py   # Solution evaluator (Z, distance, constraints)
│   │   │   ├── acs.py         # Hybrid Ant Colony System
│   │   │   ├── vns.py         # Variable Neighborhood Search
│   │   │   └── local_search.py # 2-opt, or-opt, relocate, exchange
│   │   ├── severity/
│   │   │   ├── ahp.py         # Analytic Hierarchy Process
│   │   │   ├── entropy.py     # Entropy Weight
│   │   │   └── index.py       # Combined SI calculation
│   │   └── data/              # Static data files (CSV, npy)
│   ├── requirements.txt
│   └── Dockerfile
│
├── notebooks/                 # Colab notebooks for data collection
│   ├── 01_genangan.ipynb
│   ├── 02_depo.ipynb
│   ├── 03_intermediate_facilities.ipynb
│   ├── 04_faskes.ipynb
│   └── 05_distance_matrix.ipynb
│
├── PRD.md
├── AGENT.md
├── DESIGN.md
└── README.md
```

---

## Coding Conventions

### Frontend (TypeScript / Next.js)

- **Framework:** Next.js 15 with App Router. Use server components by default, add `'use client'` only when needed (interactivity, hooks, browser APIs).
- **Styling:** Tailwind CSS v4. Use design tokens defined in `DESIGN.md`. No inline styles. No CSS modules.
- **Components:** Functional components only. One component per file. Name files in kebab-case (`route-display.tsx`), export component in PascalCase (`RouteDisplay`).
- **State management:** React state (`useState`, `useReducer`) for local state. No Redux or Zustand -- the app is simple enough.
- **API calls:** Use a thin wrapper around `fetch` in `lib/api.ts`. No axios. Handle loading/error states explicitly.
- **Types:** Define shared types in `types/` directory. API response types mirror Pydantic schemas from backend.
- **Map:** Use `react-leaflet` components. Keep map logic in `components/map/`. Leaflet CSS imported once in layout.
- **Charts:** Use Recharts for convergence chart and comparison charts.
- **No localStorage or sessionStorage.** All state lives in React. Data comes from backend API.

### Backend (Python / FastAPI)

- **Python version:** 3.12+
- **Framework:** FastAPI with `uvicorn`. Use async endpoints where possible.
- **Code style:** Follow PEP 8. Use type hints everywhere. Use docstrings for public functions.
- **Data loading:** Load all CSV/npy files once at app startup via FastAPI lifespan event. Store in module-level variables. No per-request file I/O.
- **Algorithm code:** Keep algorithms pure (no FastAPI dependencies). They receive data structures and return solution objects. Router endpoints handle serialization.
- **Pydantic models:** All request/response bodies defined as Pydantic `BaseModel`. Keep in `models/` directory.
- **CORS:** Allow frontend origin (localhost:3000 in dev). Configure in `main.py`.
- **Error handling:** Return proper HTTP status codes. 400 for bad parameters, 500 for algorithm failures. Include error message in response body.
- **No database.** No ORM. No migrations.

### General

- **Language:** UI text in Bahasa Indonesia. Code, comments, commit messages, variable names in English.
- **Naming:** Use descriptive names. `flood_points` not `fp`. `calculate_severity_index` not `calc_si`. Exception: well-known abbreviations from the domain are fine (`SI`, `ACS`, `VNS`, `IF`, `OSRM`).
- **Git:** Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`). One logical change per commit.

---

## Algorithm Implementation Notes

### Solution Representation

A solution is a list of routes. Each route is assigned to one vehicle and consists of an ordered list of node visits:

```python
@dataclass
class Route:
    vehicle_id: str
    depot_id: str
    capacity: int           # 3000 or 5000 liters
    visits: list[Visit]     # ordered sequence

@dataclass
class Visit:
    node_id: str
    node_type: str          # 'flood', 'if', 'depot'
    volume_pumped: float    # liters pumped at this visit (0 for IF/depot)
    arrival_time: float     # cumulative time from depot departure
    tank_load: float        # tank load after this visit
```

### Objective Function

```
Z = sum(SI_j * t_j) for all flood point visits j
```

Where `SI_j` is the Severity Index and `t_j` is the cumulative arrival time. Lower is better.

### Key Constraints to Enforce

1. Total volume pumped at each flood point across all visits equals its estimated volume.
2. Tank load never exceeds vehicle capacity at any point in the route.
3. Tank resets to 0 after visiting an IF (river).
4. Each vehicle starts and ends at its assigned depot.
5. No subtours (every route passes through the depot).

### Informasi Heuristik ACS

```
eta(i, j) = SI_j / d(i, j)
```

This biases ants toward high-severity, nearby flood points. The formula integrates into the standard ACS transition rule (Equation 2.16 in the thesis proposal).

### Local Search Operators

- **Intra-route:** 2-opt (reverse segment), or-opt (relocate 1-3 consecutive nodes within same route)
- **Inter-route:** relocate (move one node between routes), exchange (swap one node between routes)

All operators must re-validate constraints after modification.

---

## Running the Project

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:3000
```

### Environment Variables

Frontend (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

No other env vars needed. No API keys. No secrets.

---

## Common Tasks

### Adding a new API endpoint

1. Define Pydantic request/response models in `backend/app/models/`
2. Add route handler in appropriate router file in `backend/app/routers/`
3. Register router in `backend/app/main.py` if new file
4. Add corresponding TypeScript types in `frontend/src/types/`
5. Add API call function in `frontend/src/lib/api.ts`

### Adding a new map layer

1. Create component in `frontend/src/components/map/`
2. Use `react-leaflet` components (`Marker`, `Polyline`, `CircleMarker`, etc.)
3. Import and render inside the main `MapContainer` component
4. Style markers/lines following DESIGN.md color tokens

### Modifying algorithm parameters

1. Update Pydantic model for the endpoint in `backend/app/models/`
2. Pass new parameter through router to algorithm function
3. Update frontend controls in sidebar component
4. Update TypeScript types

---

## What NOT to Do

- **Don't add a database.** This is a static-data thesis project, not a production SaaS.
- **Don't add authentication.** Single-user tool for thesis defense demo.
- **Don't add real-time data ingestion.** All data is historical. Real-time is explicitly out of scope (Batasan Masalah #10).
- **Don't over-engineer state management.** React state is sufficient. No global stores.
- **Don't use shadows for depth.** Follow DESIGN.md -- depth comes from background tint shifts, not box-shadow.
- **Don't introduce colors outside the design system.** Exception: vehicle route colors need ~10 distinguishable hues for different trucks; use a curated palette that works on the map background.
- **Don't run algorithms in the browser.** They run on the Python backend. The frontend only displays results.
