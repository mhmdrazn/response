# FastAPI Skill — FloodRoute Backend

Conventions for the `backend/` package. See `PRD.md` and `AGENT.md` for endpoint contracts.

## Runtime

- **Python 3.12+**, **FastAPI**, served with **uvicorn**.
- Async endpoints where practical; synchronous is fine for CPU-bound algorithm runs.
- CORS allows `http://localhost:3000` in dev (add production origin later if deployed).

## Application entry — `app/main.py`

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

@asynccontextmanager
async def lifespan(app: FastAPI):
    import app.data as data
    # Only load files that exist; algorithms will fail loudly if data is missing.
    if (DATA_DIR / "genangan.csv").exists():
        data.flood_points = pd.read_csv(DATA_DIR / "genangan.csv")
    if (DATA_DIR / "depo.csv").exists():
        data.depots = pd.read_csv(DATA_DIR / "depo.csv")
    if (DATA_DIR / "if.csv").exists():
        data.ifs = pd.read_csv(DATA_DIR / "if.csv")
    if (DATA_DIR / "distance_matrix.npy").exists():
        data.distance_matrix = np.load(DATA_DIR / "distance_matrix.npy")
    if (DATA_DIR / "time_matrix.npy").exists():
        data.time_matrix = np.load(DATA_DIR / "time_matrix.npy")
    yield

app = FastAPI(title="FloodRoute API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Data loads **once** at startup. Never do per-request file I/O.

## `app/data/__init__.py` — module-level placeholders

```python
from typing import Optional
import pandas as pd
import numpy as np

flood_points: Optional[pd.DataFrame] = None
depots: Optional[pd.DataFrame] = None
ifs: Optional[pd.DataFrame] = None
distance_matrix: Optional[np.ndarray] = None
time_matrix: Optional[np.ndarray] = None
```

Routers and algorithms `import app.data as data` and read `data.flood_points`, etc. The `Optional[...]` type lets the module import even when static files are not yet present.

## Pydantic models

- Every request and response body is a `BaseModel` in `app/models/`.
- Use type hints for every field; give defaults for optional algorithm parameters (`n_ants: int = 20`).
- Response schema shared across `/optimize/acs` and `/optimize/vns` — extract to a single `OptimizationResponse` model.

## Algorithm code is pure

- No FastAPI imports inside `app/algorithms/` or `app/severity/`.
- Algorithms take plain arguments (DataFrames, ndarrays, params) and return plain Python objects. Routers do the (de)serialization.
- Every function has type hints. Docstrings on public entry points describe inputs and returned shape.

## Error handling

- 400 for invalid parameters (`n_ants < 1`, etc.) — raise `HTTPException(status_code=400, detail=...)`.
- 500 for algorithm failures — wrap `solver.solve()` in a `try` and re-raise as `HTTPException(500, str(e))`.
- Never swallow exceptions silently.

## What NOT to add

- No database, no ORM, no migrations.
- No auth, no sessions, no cookies.
- No background workers, no Celery. Endpoints are synchronous long-running (30–120s).
