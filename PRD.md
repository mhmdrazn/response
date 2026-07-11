# PRD: FloodRoute Surabaya

## Product Overview

**FloodRoute** is a web-based decision support system for optimizing flood pumping routes by the Surabaya Fire Department fleet. It solves a Multi-Depot Capacitated Vehicle Routing Problem with Intermediate Facilities and Severity Index (MDCVRP-IF-SI) using Hybrid Ant Colony System, and visualizes the results on an interactive map.

**Primary user:** Operational staff at Dinas Pemadam Kebakaran dan Penyelamatan Kota Surabaya who coordinate pump truck deployment during flood events.

**Single job of this product:** Given a set of flood points, fire stations, and rivers, produce and display optimal pump truck routes that prioritize high-severity locations first.

---

## Architecture

```
┌─────────────────────────────┐      ┌──────────────────────────────┐
│  Frontend (Next.js)         │      │  Backend (FastAPI / Python)   │
│                             │      │                              │
│  - Interactive map (Leaflet)│ HTTP │  - /api/data/*  (static data)│
│  - Parameter controls       │◄────►│  - /api/optimize/acs         │
│  - Route visualization      │      │  - /api/optimize/vns         │
│  - Metrics & charts         │      │  - /api/severity-index       │
│                             │      │                              │
│  Deployed: Vercel / local   │      │  Deployed: Railway / local   │
└─────────────────────────────┘      └──────────────────────────────┘
                                              │
                                     ┌────────┴────────┐
                                     │  Static Data     │
                                     │  (JSON / CSV)    │
                                     │  - genangan.csv  │
                                     │  - depo.csv      │
                                     │  - if.csv        │
                                     │  - faskes.csv    │
                                     │  - distance.npy  │
                                     └─────────────────┘
```

**Frontend:** Next.js (App Router) + Tailwind CSS + Leaflet via react-leaflet. No database. No auth.

**Backend:** FastAPI (Python). Algorithms run server-side. Data loaded from static files at startup. No database.

**Deployment for thesis defense:** Both services run locally (`npm run dev` + `uvicorn`). Optional deployment to Vercel (frontend) + Railway (backend) for remote access.

---

## Pages & Layout

The application is a single-page app with a sidebar + map layout.

### Main Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Navbar (logo, title, dark mode toggle)                      │
├────────────────┬─────────────────────────────────────────────┤
│                │                                             │
│   Sidebar      │              Map Area                       │
│   (380px)      │              (Leaflet)                      │
│                │                                             │
│  ┌──────────┐  │  - Flood point markers (color by SI)        │
│  │ Controls │  │  - Depot markers                            │
│  │          │  │  - IF markers                               │
│  │ - Algo   │  │  - Vehicle route polylines                  │
│  │ - Params │  │  - Popups on click                          │
│  │ - Run    │  │                                             │
│  └──────────┘  │                                             │
│                │                                             │
│  ┌──────────┐  │                                             │
│  │ Results  │  │                                             │
│  │          │  │                                             │
│  │ - Z val  │  │                                             │
│  │ - Dist   │  │                                             │
│  │ - Time   │  │                                             │
│  │ - Routes │  │                                             │
│  └──────────┘  │                                             │
│                │                                             │
│  ┌──────────┐  │                                             │
│  │ Converge │  │                                             │
│  │ Chart    │  │                                             │
│  └──────────┘  │                                             │
│                │                                             │
├────────────────┴─────────────────────────────────────────────┤
│  Footer (attribution, ITS logo)                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Features

### P0 (Must have for thesis defense)

1. **Map visualization**
   - Display all flood points as circle markers colored by Severity Index (green-yellow-red gradient)
   - Display depot markers (distinct icon/color)
   - Display IF markers (distinct icon/color)
   - Click any marker to see popup with details (name, SI value, coordinates, depth, etc.)

2. **Algorithm controls**
   - Select algorithm: Hybrid ACS or VNS
   - Set key parameters (number of ants, iterations, rho, q0, alpha, beta)
   - "Run Optimization" button that calls backend API
   - Loading state while algorithm runs (progress indicator or spinner)

3. **Route display**
   - After optimization, draw each vehicle's route as a colored polyline on the map
   - Different color per vehicle
   - Route includes depot start, flood points visited, IF visits, depot return
   - Click route to see vehicle details (capacity, total distance, points served)

4. **Results panel**
   - Objective function value Z
   - Total distance traveled (all vehicles)
   - Number of IF visits
   - Number of revisits
   - Computation time
   - Per-vehicle breakdown table

5. **Severity Index display**
   - Table showing SI value per flood point with indicator breakdown
   - Legend explaining color scale on map

### P1 (Should have)

6. **Convergence chart**
   - Line chart: best Z vs iteration for the last optimization run
   - Rendered in sidebar below results

7. **Algorithm comparison mode**
   - Run both Hybrid ACS and VNS on same data
   - Side-by-side results table
   - Overlay convergence curves on same chart

8. **Route animation**
   - Step-through animation showing vehicles moving along routes in order
   - Play/pause controls

### P2 (Nice to have)

9. **Parameter sensitivity view**
   - Pre-computed results for parameter variations
   - Small multiples chart showing Z across parameter values

10. **Export results**
    - Download route solution as JSON
    - Download results table as CSV
    - Screenshot/export map as image

---

## API Endpoints (Backend)

### Data endpoints

```
GET /api/data/genangan        -> list of flood points with SI
GET /api/data/depo            -> list of depots
GET /api/data/if              -> list of intermediate facilities
GET /api/data/distance-matrix -> distance/time matrix (or subset)
```

### Optimization endpoints

```
POST /api/optimize/acs
  Body: { iterations, n_ants, rho, q0, alpha, beta }
  Response: {
    routes: [...],
    objective_value: float,
    total_distance: float,
    total_if_visits: int,
    total_revisits: int,
    computation_time: float,
    convergence: [{ iteration, best_z }, ...]
  }

POST /api/optimize/vns
  Body: { max_iterations, k_max }
  Response: (same schema as ACS)
```

### Severity Index endpoint

```
GET /api/severity-index
  Response: {
    weights: { ahp: [...], ew: [...], combined: [...] },
    flood_points: [{ id, si_value, depth, road_class, health_dist }, ...]
  }
```

---

## Data Files

All data is static (historical). No real-time ingestion.

| File | Format | Description |
|------|--------|-------------|
| `genangan.csv` | CSV | Flood points: id, lat, lon, depth_cm, road_class, health_dist_m, volume_l, si_value |
| `depo.csv` | CSV | Depots: id, lat, lon, name, vehicle_3000, vehicle_5000 |
| `if.csv` | CSV | Intermediate facilities: id, lat, lon, waterway_name, highway_name, highway_type |
| `faskes.csv` | CSV | Healthcare facilities: id, lat, lon, name, type |
| `distance_matrix.npy` | NumPy | Symmetric matrix of road distances (meters) between all nodes |
| `time_matrix.npy` | NumPy | Symmetric matrix of travel times (seconds) between all nodes |

---

## Non-functional Requirements

- **Response time:** Optimization endpoint may take 30-120 seconds for full dataset. Frontend shows loading state.
- **Browsers:** Chrome, Firefox, Safari (latest). Mobile responsive is P2.
- **Accessibility:** Keyboard navigable sidebar controls. Color-blind safe palette for route colors (use pattern/dash in addition to hue). Map controls accessible.
- **Language:** UI in Bahasa Indonesia. Code comments in English.
- **No auth.** No user accounts. Single-user tool.
- **No database.** All data from static files.

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS v4 |
| Map | Leaflet + react-leaflet |
| Charts | Recharts |
| Icons | Lucide React |
| Backend framework | FastAPI |
| Algorithm language | Python 3.12 |
| Key Python libs | NumPy, SciPy, requests |
| Data format | CSV, NumPy .npy, JSON |
| Deployment (optional) | Vercel (FE) + Railway (BE) |
