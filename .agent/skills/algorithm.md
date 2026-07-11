# Algorithm Skill — MDCVRP-IF-SI, Hybrid ACS, VNS

Reference for `backend/app/algorithms/`. Keep this file in sync with the thesis; if the code and this doc disagree, fix the code.

## Problem — MDCVRP-IF-SI

**Multi-Depot Capacitated Vehicle Routing Problem with Intermediate Facilities and Severity Index.**

Given:
- `F` flood points, each with severity index `SI_j ∈ [0, 1]` and total volume-to-pump `V_j` (liters).
- `D` depots. Each depot hosts a heterogeneous fleet of 3,000 L and 5,000 L tank trucks.
- `R` intermediate facilities (rivers). A vehicle empties its tank instantly on arrival at any IF.
- Symmetric distance matrix `d(i, j)` and time matrix `t(i, j)` across all nodes (flood + depot + IF).

Find a set of vehicle routes such that:
1. Every flood point `j` is pumped completely (Σ volume across visits = `V_j`).
2. Every vehicle starts and ends at its home depot.
3. Tank load never exceeds capacity between two IF/depot visits.
4. Objective `Z` is minimized.

## Objective function

```
Z = Σ_j  SI_j · t_j
```

for every flood-point **visit** `j` (a flood point visited multiple times contributes once per visit, using the arrival time of that visit). Lower is better — the term rewards reaching high-severity points early.

`t_j` is cumulative travel + service time from the vehicle's depot departure, measured in seconds (or any consistent unit — keep it consistent across the codebase).

## Solution representation

```python
@dataclass
class Visit:
    node_id: str
    node_type: Literal["flood", "if", "depot"]
    volume_pumped: float   # liters; 0 for depot/IF
    arrival_time: float    # cumulative seconds since depot departure
    tank_load: float       # liters in tank AFTER this visit's service

@dataclass
class Route:
    vehicle_id: str
    depot_id: str
    capacity: int          # 3000 or 5000
    visits: list[Visit]    # ordered; first and last are the depot

Solution = list[Route]
```

## Hard constraints (validate after every local-search move)

1. **Volume conservation:** `Σ_visits volume_pumped(node=j) == V_j` for every flood point `j`.
2. **Capacity:** `visit.tank_load ≤ route.capacity` for every visit.
3. **IF empties tank:** `tank_load == 0` immediately after an IF visit.
4. **Depot start/end:** `route.visits[0].node_id == route.visits[-1].node_id == route.depot_id`.
5. **No subtours:** the route sequence is a single walk, not a set of loops.

A move that violates any of the above must be rejected before the evaluator runs.

## ACS heuristic information

```
η(i, j) = SI_j / d(i, j)          for j ∈ flood points
η(i, r) = 1 / d(i, r)              for r ∈ IFs (SI undefined)
```

Combined with pheromone `τ(i, j)` in the standard ACS transition rule:

```
p(i, j) ∝ τ(i, j)^α · η(i, j)^β
```

Pseudorandom-proportional rule with parameter `q0` (exploit vs. explore). Local pheromone update after each transition; global update at end of each iteration using best-so-far solution and evaporation `ρ`.

Default parameters (starting points, tune from here):
- `n_ants = 20`, `iterations = 100`
- `α = 1.0`, `β = 2.0`, `ρ = 0.1`, `q0 = 0.9`
- `τ0 = 1 / (n · L_nn)` where `L_nn` is nearest-neighbour tour length

## Local search operators

Applied to the best ant of each iteration until no improvement:

- **2-opt (intra-route):** reverse a segment `[i, j]`. Must not break IF/capacity constraint.
- **or-opt (intra-route):** relocate 1–3 consecutive nodes elsewhere in the same route.
- **relocate (inter-route):** move one node from route A to route B.
- **exchange (inter-route):** swap two nodes between different routes.

Every operator calls the evaluator to recompute `arrival_time` and `tank_load` from scratch on the modified routes, then checks the hard constraints.

## VNS (baseline)

Standard variable neighborhood search using the same operator library:
- Shake in neighborhood `N_k` (k = 1..k_max) by random operator perturbation.
- Local search back to a local optimum with the same operators.
- Accept if improved; otherwise `k += 1`.

Same objective, same constraints, same evaluator — this is the point of comparability.

## Evaluator

`app/algorithms/evaluator.py` owns:
- Cumulative `arrival_time` and `tank_load` from the distance/time matrices.
- Constraint check (returns `bool` and a reason string).
- Objective `Z` computation.

Algorithm code should never inline these — always call the evaluator so ACS and VNS score solutions identically.
