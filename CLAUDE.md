# CLAUDE.md

You are working on **FloodRoute Surabaya**, a web-based decision support system for flood pumping route optimization by the Surabaya Fire Department fleet.

## Reference Documents

Read these before making any changes:

- `PRD.md` -- product requirements, architecture, API specs, feature priorities
- `AGENT.md` -- repo structure, coding conventions, algorithm details, common tasks
- `DESIGN.md` -- design system, color tokens, typography (Manrope), component specs

## Project Architecture

```
Frontend: Next.js 15 (App Router) + Tailwind CSS v4 + Leaflet
Backend:  FastAPI (Python 3.12) + NumPy
Data:     Static CSV/npy files, no database
```

Frontend lives in `frontend/`. Backend lives in `backend/`. They communicate via REST API. Frontend runs on port 3000, backend on port 8000.

## Key Commands

```bash
# Frontend
cd frontend && npm run dev          # start dev server
cd frontend && npm run build        # production build
cd frontend && npm run lint         # eslint

# Backend
cd backend && uvicorn app.main:app --reload --port 8000   # start dev server
cd backend && python -m pytest                             # run tests
```

## Coding Rules

### Always

- Use TypeScript strict mode in frontend. No `any` types.
- Use Python type hints in backend. Every function has types.
- Follow the design tokens in DESIGN.md. Use CSS variables, not hardcoded hex values.
- Font is Manrope (weights 300, 400, 500). No other fonts.
- UI text in Bahasa Indonesia. Code, comments, variable names in English.
- One component per file. Filename kebab-case, export PascalCase.
- Validate algorithm constraints after every local search move.

### Never

- No `box-shadow` anywhere. Depth comes from background tint shifts per DESIGN.md.
- No database, no ORM, no migrations.
- No authentication, no user accounts.
- No `localStorage` or `sessionStorage` in frontend.
- No algorithm execution in the browser. Algorithms run on Python backend only.
- No `axios`. Use native `fetch` with a thin wrapper in `lib/api.ts`.
- No Redux, Zustand, or Jotai. React state (`useState`, `useReducer`) is sufficient.
- No CSS modules or styled-components. Tailwind only.
- No fonts other than Manrope. No sohne-var, no Inter, no system defaults for visible text.
- No colors outside the design system tokens. Exception: vehicle route colors (8 defined hues) and SI severity palette (5 defined hues), both specified in DESIGN.md.

## Frontend Patterns

### Component Structure

```tsx
// components/sidebar/results-panel.tsx
'use client'

import { useState } from 'react'
import type { OptimizationResult } from '@/types/optimization'

interface ResultsPanelProps {
  result: OptimizationResult | null
  isLoading: boolean
}

export function ResultsPanel({ result, isLoading }: ResultsPanelProps) {
  // component logic
}
```

### API Calls

```tsx
// lib/api.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function runOptimization(
  algorithm: 'acs' | 'vns',
  params: ACSParams | VNSParams
): Promise<OptimizationResult> {
  const res = await fetch(`${API_URL}/api/optimize/${algorithm}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!res.ok) throw new Error(`Optimization failed: ${res.status}`)
  return res.json()
}
```

### Map Components

Use `react-leaflet` components. Keep Leaflet imports dynamic (no SSR):

```tsx
// components/map/map-container.tsx
'use client'

import dynamic from 'next/dynamic'

const MapInner = dynamic(() => import('./map-inner'), { ssr: false })

export function MapContainer() {
  return <MapInner />
}
```

### Tailwind Usage

Use design tokens via CSS variables. Prefer semantic class names:

```tsx
// Good: uses design token
<button className="bg-[var(--color-indigo-ink)] text-white rounded-[var(--radius-md)] px-5 py-2.5 text-sm font-[var(--font-weight-regular)] tracking-[-0.14px] hover:bg-[var(--color-indigo-hover)] transition-colors">
  Jalankan Optimasi
</button>

// Also good: if tokens are mapped in tailwind config
<button className="bg-indigo-ink text-white rounded-md px-5 py-2.5 text-body-sm font-regular hover:bg-indigo-hover transition-colors">
  Jalankan Optimasi
</button>
```

## Backend Patterns

### Router Endpoint

```python
# app/routers/optimize.py
from fastapi import APIRouter, HTTPException
from app.models.optimization import ACSRequest, OptimizationResponse
from app.algorithms.acs import HybridACS
from app.data import distance_matrix, flood_points, depots, ifs

router = APIRouter(prefix="/api/optimize", tags=["optimize"])

@router.post("/acs", response_model=OptimizationResponse)
async def run_acs(request: ACSRequest) -> OptimizationResponse:
    try:
        solver = HybridACS(
            flood_points=flood_points,
            depots=depots,
            ifs=ifs,
            distance_matrix=distance_matrix,
            **request.model_dump(),
        )
        result = solver.solve()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### Algorithm Class

```python
# app/algorithms/acs.py
import numpy as np
from dataclasses import dataclass

@dataclass
class Route:
    vehicle_id: str
    depot_id: str
    capacity: int
    visits: list  # list of Visit

class HybridACS:
    def __init__(self, flood_points, depots, ifs, distance_matrix, **params):
        self.flood_points = flood_points
        self.depots = depots
        # ... store all inputs
        # ... initialize pheromone matrix

    def solve(self) -> dict:
        # Main loop: construct solutions, local search, update pheromone
        # Return result dict matching OptimizationResponse schema
        pass
```

### Data Loading (Lifespan)

```python
# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
import pandas as pd
import numpy as np

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load all data once at startup
    import app.data as data
    data.flood_points = pd.read_csv("app/data/genangan.csv")
    data.depots = pd.read_csv("app/data/depo.csv")
    data.ifs = pd.read_csv("app/data/if.csv")
    data.distance_matrix = np.load("app/data/distance_matrix.npy")
    yield

app = FastAPI(title="FloodRoute API", lifespan=lifespan)
```

## Domain-Specific Context

### Objective Function

```
Z = sum(SI_j * t_j)  for all flood point visits j
```

Lower Z is better. It means high-severity points (high SI) are reached early (low t).

### ACS Heuristic Information

```
eta(i, j) = SI_j / d(i, j)
```

Biases ants toward high-severity, nearby flood points.

### Vehicle Types

- 3,000 liter tank capacity
- 5,000 liter tank capacity

Each depot has both types. Vehicles must visit an IF (river) to empty their tank before it overflows.

### Multi-Visit

A flood point can be visited multiple times by same or different vehicles until its total volume is fully pumped. This is a hard constraint (Equation 2.1 in thesis).

## Git Workflow

- Branch from `main` for features: `feat/map-markers`, `feat/acs-algorithm`
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- One logical change per commit
- Run lint and type check before committing

## When in Doubt

1. Check PRD.md for what to build
2. Check AGENT.md for how to build it
3. Check DESIGN.md for how it should look
4. If still unclear, ask -- don't guess on domain logic (constraint checking, objective function calculation)
