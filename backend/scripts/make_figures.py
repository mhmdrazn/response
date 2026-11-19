"""Figures and tables for Bab 6, from a run_experiments.py output folder.

Reads runs.csv, wilcoxon.csv, sensitivity_acs.csv, sensitivity_extra.csv,
traces/ and best/ in --out and writes:

  figures/  PNG, 300 dpi, 16 x 10 cm, serif 10 pt, no title (the caption is in
            the book), labels in Indonesian
    konvergensi_<scenario>.png      mean best score over time, ACS vs VNS, IQR band
    konvergensi_z_<scenario>.png    the same for Z of the best solution
    boxplot_<metric>.png            ACS vs VNS, one panel per scenario with its own
                                    y axis (objective_z, score, total_distance_m,
                                    vehicles_used)
    sensitivitas_<param>.png        n_ants, q0, rho: mean +/- std (Z only when every
                                    run is fully covered, else score and Z)
    sensitivitas_horizon.png, sensitivitas_dispatch.png
                                    ACS vs VNS: Z, coverage and vehicles used
    polish_slice.png, unserved_penalty[_<scenario>].png
  tables/   CSV to paste into Word: ';' separated, decimal comma, UTF-8 with BOM
    tabel_statistik_<algorithm>.csv, tabel_perbandingan.csv,
    tabel_ringkasan_rute_<scenario>_<algorithm>.csv (per vehicle, for the body),
    tabel_rute_<scenario>_<algorithm>.csv (full stop order, for the appendix),
    tabel_sensitivitas.csv, uji_sensitivitas.csv (Wilcoxon vs default, Friedman),
    tabel_sensitivitas_horizon_dispatch.csv, tabel_polish_slice.csv,
    tabel_unserved_penalty[_<scenario>].csv

A figure or table whose experiment has not been run is skipped with a note.

    python scripts/make_figures.py --out experiments
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.ticker import FuncFormatter, MaxNLocator  # noqa: E402

OUT_DEFAULT = Path(__file__).resolve().parents[1] / "experiments"
SCENARIOS = ["s1-jan", "s2-jun", "s3-nov"]
SCENARIO_LABEL = {
    "s1-jan": "S1 (11-12 Jan 2025)",
    "s2-jun": "S2 (22-23 Jun 2026)",
    "s3-nov": "S3 (9-12 Nov 2025)",
}
ALGOS = ["acs", "vns"]
ALGO_LABEL = {"acs": "Hybrid ACS", "vns": "VNS"}
# Categorical slots 1 and 2 of the reference palette, plus line style and marker
# so the two stay apart in grayscale print and for colour-blind readers.
COLOR = {"acs": "#2a78d6", "vns": "#eb6834"}
STYLE = {"acs": "-", "vns": "--"}
MARKER = {"acs": "o", "vns": "s"}
INK, MUTED, GRID = "#1f1f1e", "#5c5b55", "#e2e1dc"

FIG_SIZE = (16 / 2.54, 10 / 2.54)
DPI = 300
GRID_STEP_S = 0.5

METRIC_LABEL = {
    "objective_z": "Z",
    "score": "Skor (Z + penalti)",
    "coverage_pct": "Cakupan (%)",
    "total_distance_m": "Jarak tempuh (km)",
    "vehicles_used": "Kendaraan terpakai",
    "if_visits": "Kunjungan IF",
    "excess_visits": "Kunjungan berulang",
    "runtime_s": "Waktu komputasi (detik)",
    "iterations": "Iterasi",
}
# Lower is better except coverage.
HIGHER_IS_BETTER = {"coverage_pct"}


# --- Formatting ------------------------------------------------------------------


def id_number(x: float, digits: int = 2) -> str:
    """Indonesian number: dot for thousands, comma for decimals (1.526.759,12)."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return ""
    s = f"{x:,.{digits}f}"
    return s.replace(",", "_").replace(".", ",").replace("_", ".")


def _axis_number(x: float, _pos: int) -> str:
    if abs(x) >= 1000:
        return id_number(x, 0)
    return id_number(x, 1 if abs(x) < 10 and x != int(x) else 0)


def setup_matplotlib() -> None:
    plt.rcParams.update({
        "font.family": "serif",
        "font.serif": ["Times New Roman", "DejaVu Serif", "serif"],
        "font.size": 10,
        "axes.labelsize": 10,
        "xtick.labelsize": 9,
        "ytick.labelsize": 9,
        "legend.fontsize": 9,
        "axes.edgecolor": MUTED,
        "axes.labelcolor": INK,
        "xtick.color": MUTED,
        "ytick.color": MUTED,
        "axes.grid": True,
        "grid.color": GRID,
        "grid.linewidth": 0.6,
        "axes.axisbelow": True,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "legend.frameon": False,
        "savefig.dpi": DPI,
        "figure.dpi": 100,
        "axes.formatter.use_locale": False,
    })


def _save(fig, path: Path, made: list[Path]) -> None:
    fig.tight_layout()
    fig.savefig(path, dpi=DPI)
    plt.close(fig)
    made.append(path)


def _percent_axis(ax) -> None:
    """Coverage sits just under 100, where whole numbers repeat: one decimal."""
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _p: id_number(v, 1)))


def _number_axis(ax, which: str = "y") -> None:
    fmt = FuncFormatter(_axis_number)
    (ax.yaxis if which == "y" else ax.xaxis).set_major_formatter(fmt)


# --- Reading ---------------------------------------------------------------------


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def fval(row: dict[str, str], key: str) -> float:
    v = row.get(key, "")
    return float(v) if v not in ("", None) else math.nan


def write_table(path: Path, header: list[str], rows: list[list[object]], made: list[Path]) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh, delimiter=";")
        w.writerow(header)
        w.writerows(rows)
    made.append(path)


# --- Convergence -----------------------------------------------------------------


def resample(trace: list[dict[str, object]], key: str, grid: np.ndarray) -> np.ndarray:
    """A step function of the trace on the time grid: the last value seen so far."""
    t = np.array([float(p["t"]) for p in trace])  # type: ignore[arg-type]
    v = np.array([float(p[key]) if p[key] is not None else np.nan for p in trace])  # type: ignore[arg-type]
    idx = np.searchsorted(t, grid, side="right") - 1
    out = np.full(len(grid), np.nan)
    ok = idx >= 0
    out[ok] = v[idx[ok]]
    return out


def convergence(out: Path, figs: Path, time_limit: float, made: list[Path], notes: list[str]) -> None:
    grid = np.arange(0.0, time_limit + 1e-9, GRID_STEP_S)
    for sc in SCENARIOS:
        traces = {
            a: [json.loads(p.read_text(encoding="utf-8")) for p in sorted((out / "traces").glob(f"main_{sc}_{a}_*.json"))]
            for a in ALGOS
        }
        if not any(traces.values()):
            notes.append(f"konvergensi {sc}: no main traces")
            continue
        for key, name, ylabel in (
            ("best_score", f"konvergensi_{sc}.png", "Skor terbaik"),
            ("best_z", f"konvergensi_z_{sc}.png", "Z solusi terbaik"),
        ):
            fig, ax = plt.subplots(figsize=FIG_SIZE)
            for a in ALGOS:
                runs = [resample(tr, key, grid) for tr in traces[a] if tr]
                if not runs:
                    continue
                m = np.vstack(runs)
                with np.errstate(all="ignore"), _quiet():
                    mean = np.nanmean(m, axis=0)
                    q1 = np.nanpercentile(m, 25, axis=0)
                    q3 = np.nanpercentile(m, 75, axis=0)
                ax.fill_between(grid, q1, q3, color=COLOR[a], alpha=0.18, linewidth=0)
                ax.plot(grid, mean, color=COLOR[a], linestyle=STYLE[a], linewidth=1.6,
                        label=f"{ALGO_LABEL[a]} (rata-rata, n = {len(runs)})")
            ax.set_xlabel("Waktu (detik)")
            ax.set_ylabel(ylabel)
            ax.set_xlim(0, time_limit)
            _number_axis(ax)
            handles, labels = ax.get_legend_handles_labels()
            band = plt.Rectangle((0, 0), 1, 1, color=MUTED, alpha=0.18, linewidth=0)
            ax.legend([*handles, band], [*labels, "Rentang interkuartil"], loc="center right")
            _save(fig, figs / name, made)


class _quiet:
    """Silence numpy's all-NaN warnings while a grid point has no run started yet."""

    def __enter__(self):
        import warnings

        self._w = warnings.catch_warnings()
        self._w.__enter__()
        warnings.simplefilter("ignore")

    def __exit__(self, *exc):
        self._w.__exit__(*exc)


# --- Box plots -------------------------------------------------------------------


def boxplots(runs: list[dict[str, str]], figs: Path, made: list[Path], notes: list[str]) -> None:
    main = [r for r in runs if r["experiment"] == "main"]
    if not main:
        notes.append("boxplot: no main runs")
        return
    scenarios = [sc for sc in SCENARIOS if any(r["scenario"] == sc for r in main)]
    for metric in ("objective_z", "score", "total_distance_m", "vehicles_used"):
        scale = 1000.0 if metric == "total_distance_m" else 1.0
        # One panel per scenario, each on its own y axis: on a shared axis the
        # large S1/S2 values flatten the S3 boxes.
        fig, axes = plt.subplots(1, len(scenarios), figsize=FIG_SIZE, squeeze=False)
        for ax, sc in zip(axes[0], scenarios):
            for k, a in enumerate(ALGOS):
                data = [fval(r, metric) / scale for r in main if r["scenario"] == sc and r["algorithm"] == a]
                if not data:
                    continue
                bp = ax.boxplot(
                    [data], positions=[k], widths=0.6, patch_artist=True, showfliers=True,
                    medianprops={"color": INK, "linewidth": 1.4},
                    whiskerprops={"color": MUTED, "linewidth": 1.0},
                    capprops={"color": MUTED, "linewidth": 1.0},
                    flierprops={"marker": MARKER[a], "markersize": 4, "markerfacecolor": COLOR[a],
                                "markeredgecolor": "white", "markeredgewidth": 0.6},
                )
                box = bp["boxes"][0]
                box.set_facecolor(COLOR[a])
                box.set_alpha(0.75)
                box.set_edgecolor("white")
                box.set_linewidth(1.0)
                if a == "vns":
                    box.set_hatch("///")
            ax.set_xticks(range(len(ALGOS)))
            ax.set_xticklabels([ALGO_LABEL[a] for a in ALGOS], fontsize=8)
            ax.set_xlabel(SCENARIO_LABEL.get(sc, sc), fontsize=9)
            ax.grid(axis="x", visible=False)
            _number_axis(ax)
        axes[0][0].set_ylabel(METRIC_LABEL[metric])
        _save(fig, figs / f"boxplot_{metric}.png", made)


# --- Sensitivity -----------------------------------------------------------------


def fully_covered(runs: list[dict[str, str]]) -> bool:
    """Every run served all the work, so its score is its Z and one panel suffices."""
    return bool(runs) and all(
        fval(r, "coverage_pct") >= 100.0 - 1e-6
        and abs(fval(r, "score") - fval(r, "objective_z")) <= 1e-6 * max(1.0, fval(r, "objective_z"))
        for r in runs
    )


def _panels(n: int):
    fig, axes = plt.subplots(1, n, figsize=FIG_SIZE, squeeze=False)
    return fig, list(axes[0])


def sensitivity_acs(
    rows: list[dict[str, str]], runs: list[dict[str, str]], figs: Path, made: list[Path], notes: list[str]
) -> None:
    if not rows:
        notes.append("sensitivitas: sensitivity_acs.csv missing (acs_params not run)")
        return
    label = {"n_ants": "Jumlah semut (m)", "q0": "q₀", "rho": "ρ"}
    one_panel = fully_covered([r for r in runs if r["experiment"] == "acs_params"])
    panels = [("z", "Z")] if one_panel else [("score", "Skor"), ("z", "Z")]
    for param in ("n_ants", "q0", "rho"):
        group = sorted((r for r in rows if r["param"] == param), key=lambda r: float(r["value"]))
        if not group:
            continue
        x = np.array([float(r["value"]) for r in group])
        fig, axes = _panels(len(panels))
        for ax, (key, ylabel) in zip(axes, panels):
            mean = np.array([fval(r, f"{key}_mean") for r in group])
            std = np.array([fval(r, f"{key}_std") for r in group])
            ax.errorbar(x, mean, yerr=std, color=COLOR["acs"], marker="o", markersize=5,
                        linewidth=1.6, capsize=3, elinewidth=1.0, label="Rata-rata ± simpangan baku")
            for xi, r, yi in zip(x, group, mean):
                if r["is_default"] in ("True", "true", "1"):
                    ax.annotate("bawaan", (xi, yi), textcoords="offset points", xytext=(0, 8),
                                ha="center", fontsize=8, color=MUTED)
            ax.set_xlabel(label[param])
            ax.set_ylabel(ylabel)
            ax.set_xticks(x)
            ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _p: id_number(v, 2).rstrip("0").rstrip(",")))
            _number_axis(ax)
        axes[0].legend(loc="best")
        _save(fig, figs / f"sensitivitas_{param}.png", made)


def extra_figures(
    rows: list[dict[str, str]], runs: list[dict[str, str]], figs: Path, made: list[Path], notes: list[str]
) -> None:
    xlabels = {
        "polish_slice": "Batas waktu polish per iterasi (detik)",
        "unserved_penalty": "Bobot penalti tak terlayani (λᵤ)",
    }
    for exp, sc, group in _by_scenario(rows, list(xlabels)):
        xlabel = xlabels[exp]
        group_runs = [r for r in runs if r["experiment"] == exp and r["scenario"] == sc]
        if fully_covered(group_runs):
            panels = [("objective_z", "Z")]
        elif exp == "unserved_penalty":
            panels = [("coverage_pct", "Cakupan (%)"), ("objective_z", "Z"), ("score", "Skor")]
        else:
            panels = [("score", "Skor"), ("objective_z", "Z")]
        fig, axes = _panels(len(panels))
        for ax, (key, ylabel) in zip(axes, panels):
            for a in ALGOS:
                g = sorted((r for r in group if r["algorithm"] == a), key=lambda r: float(r["param_value"]))
                if not g:
                    continue
                x = np.array([float(r["param_value"]) for r in g])
                mean = np.array([fval(r, f"{key}_mean") for r in g])
                std = np.array([fval(r, f"{key}_std") for r in g])
                ax.errorbar(x, mean, yerr=std, color=COLOR[a], linestyle=STYLE[a], marker=MARKER[a],
                            markersize=5, linewidth=1.6, capsize=3, elinewidth=1.0, label=ALGO_LABEL[a])
            ax.set_ylabel(ylabel)
            if len(panels) < 3:
                ax.set_xlabel(xlabel)
            # The settings grow by multiples, so a log axis spaces them evenly.
            ticks = sorted({float(r["param_value"]) for r in group})
            ax.set_xscale("log")
            ax.set_xticks(ticks)
            ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _p: id_number(v, 1).removesuffix(",0")))
            ax.xaxis.set_minor_formatter(FuncFormatter(lambda v, _p: ""))
            if len(panels) == 3:
                ax.tick_params(axis="x", labelsize=8)
            _percent_axis(ax) if key == "coverage_pct" else _number_axis(ax)
        axes[0].legend(loc="best")
        if len(panels) == 3:
            fig.supxlabel(xlabel, fontsize=10)
        _save(fig, figs / f"{exp}{_suffix(sc)}.png", made)
    for exp in xlabels:
        if not any(r["experiment"] == exp for r in rows):
            notes.append(f"{exp}: not run")


def limits_figures(summary: list[dict[str, str]], figs: Path, made: list[Path], notes: list[str]) -> None:
    """sensitivitas_horizon.png and sensitivitas_dispatch.png: Z, coverage and fleet used."""
    specs = {
        "horizon": ("horizon_min", "Batas durasi rute (menit)"),
        "dispatch": ("dispatch_min", "Batas waktu dispatch (menit)"),
    }
    panels = [("objective_z", "Z"), ("coverage_pct", "Cakupan (%)"), ("vehicles_used", "Kendaraan terpakai")]
    for exp, (col, xlabel) in specs.items():
        group = [r for r in summary if r["experiment"] == exp]
        if not group:
            notes.append(f"sensitivitas_{exp}: not run")
            continue
        fig, axes = _panels(len(panels))
        for ax, (key, ylabel) in zip(axes, panels):
            for a in ALGOS:
                g = sorted((r for r in group if r["algorithm"] == a), key=lambda r: float(r[col]))
                if not g:
                    continue
                x = np.array([float(r[col]) for r in g])
                mean = np.array([fval(r, f"{key}_mean") for r in g])
                std = np.array([fval(r, f"{key}_std") for r in g])
                ax.errorbar(x, mean, yerr=std, color=COLOR[a], linestyle=STYLE[a], marker=MARKER[a],
                            markersize=5, linewidth=1.6, capsize=3, elinewidth=1.0, label=ALGO_LABEL[a])
            ax.set_ylabel(ylabel)
            ticks = sorted({float(r[col]) for r in group})
            ax.set_xticks(ticks)
            ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _p: id_number(v, 0)))
            ax.tick_params(axis="x", labelsize=8, labelrotation=45)
            _percent_axis(ax) if key == "coverage_pct" else _number_axis(ax)
            if key == "vehicles_used":
                ax.yaxis.set_major_locator(MaxNLocator(integer=True))
        axes[0].legend(loc="best")
        fig.supxlabel(xlabel, fontsize=10)
        _save(fig, figs / f"sensitivitas_{exp}.png", made)


def _suffix(scenario: str) -> str:
    """No suffix for S2, where these experiments run by default; else _<scenario>."""
    return "" if scenario == "s2-jun" else f"_{scenario}"


def _by_scenario(rows: list[dict[str, str]], experiments: list[str]):
    """(experiment, scenario, rows) for every scenario an experiment was run on."""
    for exp in experiments:
        scenarios = sorted({r.get("scenario", "s2-jun") for r in rows if r["experiment"] == exp})
        for sc in scenarios:
            yield exp, sc, [r for r in rows if r["experiment"] == exp and r.get("scenario", "s2-jun") == sc]


# --- Tables ----------------------------------------------------------------------


TABLE_METRICS = [
    ("objective_z", "Z", 1.0, 2),
    ("score", "Skor", 1.0, 2),
    ("coverage_pct", "Cakupan (%)", 1.0, 2),
    ("total_distance_m", "Jarak (km)", 1000.0, 2),
    ("vehicles_used", "Kendaraan", 1.0, 2),
    ("if_visits", "Kunjungan IF", 1.0, 2),
    ("excess_visits", "Kunjungan berulang", 1.0, 2),
    ("runtime_s", "Waktu komputasi (detik)", 1.0, 2),
]


def table_statistics(runs: list[dict[str, str]], tables: Path, made: list[Path]) -> None:
    main = [r for r in runs if r["experiment"] == "main"]
    for a in ALGOS:
        rows: list[list[object]] = []
        for sc in SCENARIOS:
            group = [r for r in main if r["scenario"] == sc and r["algorithm"] == a]
            if not group:
                continue
            for metric, label, scale, digits in TABLE_METRICS:
                v = np.array([fval(r, metric) for r in group]) / scale
                v = v[~np.isnan(v)]
                if len(v) == 0:
                    continue
                best, worst = (v.max(), v.min()) if metric in HIGHER_IS_BETTER else (v.min(), v.max())
                rows.append([
                    SCENARIO_LABEL.get(sc, sc), label, len(v),
                    id_number(float(v.mean()), digits),
                    id_number(float(v.std(ddof=1)) if len(v) > 1 else 0.0, digits),
                    id_number(float(best), digits), id_number(float(worst), digits),
                ])
        if rows:
            write_table(
                tables / f"tabel_statistik_{a}.csv",
                ["Skenario", "Metrik", "n", "Rata-rata", "Simpangan baku", "Terbaik", "Terburuk"],
                rows, made,
            )


def table_comparison(wil: list[dict[str, str]], tables: Path, made: list[Path]) -> None:
    labels = {
        "objective_z": ("Z", 1.0), "score": ("Skor", 1.0), "coverage_pct": ("Cakupan (%)", 1.0),
        "total_distance_m": ("Jarak (km)", 1000.0), "vehicles_used": ("Kendaraan", 1.0),
        "if_visits": ("Kunjungan IF", 1.0), "runtime_s": ("Waktu komputasi (detik)", 1.0),
    }
    winner = {"acs": "Hybrid ACS", "vns": "VNS", "tie": "Setara"}
    rows: list[list[object]] = []
    for r in wil:
        if r["experiment"] != "main" or r["metric"] not in labels:
            continue
        label, scale = labels[r["metric"]]
        p = float(r["p_value"])
        rows.append([
            SCENARIO_LABEL.get(r["scenario"], r["scenario"]), label, r["n"],
            id_number(float(r["mean_acs"]) / scale, 2), id_number(float(r["mean_vns"]) / scale, 2),
            "< 0,001" if p < 0.001 else id_number(p, 4),
            id_number(float(r["effect_size_r"]), 3), winner.get(r["better"], r["better"]),
        ])
    if rows:
        write_table(
            tables / "tabel_perbandingan.csv",
            ["Skenario", "Metrik", "n", "Rata-rata Hybrid ACS", "Rata-rata VNS", "p-value",
             "Ukuran efek r", "Unggul (α = 0,05)"],
            rows, made,
        )


def short_id(node_type: str, node_id: str) -> str:
    if node_type == "if":
        num = node_id.split("_")[-1]
        return f"IF{int(num)}" if num.isdigit() else node_id
    return node_id


def table_routes(out: Path, tables: Path, made: list[Path], notes: list[str]) -> None:
    files = sorted((out / "best").glob("*.json"))
    if not files:
        notes.append("tabel_rute: best/ is empty (main not run)")
    for path in files:
        best = json.loads(path.read_text(encoding="utf-8"))
        rows: list[list[object]] = []
        for v in best["routes"]:
            depot = f"D{int(v['depot_index']) + 1}"
            stops = [depot, *(short_id(s["type"], s["id"]) for s in v["visits"]), depot]
            rows.append([
                v["vehicle"], f"{depot} {v.get('depot_name') or v['depot_id']}",
                " → ".join(stops),
                id_number(float(v["distance_m"]) / 1000.0, 2),
                id_number(float(v["time_s"]) / 60.0, 1),
                v["if_visits"],
            ])
        write_table(
            tables / f"tabel_rute_{best['scenario']}_{best['algorithm']}.csv",
            ["Kendaraan", "Depo", "Urutan kunjungan", "Jarak (km)", "Waktu (menit)", "Kunjungan IF"],
            rows, made,
        )


def table_sensitivity(rows: list[dict[str, str]], tables: Path, made: list[Path]) -> None:
    if not rows:
        return
    names = {"n_ants": "Jumlah semut (m)", "q0": "q0", "rho": "ρ"}
    out = [[
        names.get(r["param"], r["param"]), id_number(float(r["value"]), 2).rstrip("0").rstrip(","),
        "ya" if r["is_default"] in ("True", "true", "1") else "", r["n_runs"],
        id_number(fval(r, "z_mean")), id_number(fval(r, "z_std")),
        id_number(fval(r, "score_mean")), id_number(fval(r, "score_std")),
        id_number(fval(r, "coverage_pct_mean"), 2), id_number(fval(r, "iterations_mean"), 1),
    ] for r in rows]
    write_table(
        tables / "tabel_sensitivitas.csv",
        ["Parameter", "Nilai", "Bawaan", "n", "Rata-rata Z", "Simpangan baku Z", "Rata-rata skor",
         "Simpangan baku skor", "Rata-rata cakupan (%)", "Rata-rata iterasi"],
        out, made,
    )


def table_extra(rows: list[dict[str, str]], tables: Path, made: list[Path]) -> None:
    labels = {"polish_slice": "Batas polish (detik)", "unserved_penalty": "λu"}
    for exp, sc, group in _by_scenario(rows, list(labels)):
        name, label = f"tabel_{exp}{_suffix(sc)}.csv", labels[exp]
        group.sort(key=lambda r: (r["algorithm"], float(r["param_value"])))
        out = [[
            ALGO_LABEL.get(r["algorithm"], r["algorithm"]),
            id_number(float(r["param_value"]), 1).rstrip("0").rstrip(","), r["n_runs"],
            id_number(fval(r, "coverage_pct_mean"), 2), id_number(fval(r, "coverage_pct_std"), 2),
            id_number(fval(r, "objective_z_mean")), id_number(fval(r, "objective_z_std")),
            id_number(fval(r, "score_mean")), id_number(fval(r, "score_std")),
            id_number(fval(r, "iterations_mean"), 1),
        ] for r in group]
        write_table(
            tables / name,
            ["Algoritma", label, "n", "Rata-rata cakupan (%)", "Simpangan baku cakupan",
             "Rata-rata Z", "Simpangan baku Z", "Rata-rata skor", "Simpangan baku skor",
             "Rata-rata iterasi"],
            out, made,
        )


def short_depot(name: str | None, depot_id: str) -> str:
    """Depot name without the "Dinas Pemadam Kebakaran" every one starts with."""
    if not name:
        return depot_id
    for prefix in ("Dinas Pemadam Kebakaran ", "Dinas Kebakaran "):
        if name.startswith(prefix):
            return name[len(prefix):]
    return name


def table_route_summary(out: Path, tables: Path, made: list[Path]) -> None:
    """Per vehicle: the floods it served, its stops, distance and time, first arrival."""
    for path in sorted((out / "best").glob("*.json")):
        best = json.loads(path.read_text(encoding="utf-8"))
        rows: list[list[object]] = []
        for v in best["routes"]:
            floods = [s for s in v["visits"] if s["type"] == "flood"]
            served = list(dict.fromkeys(s["id"] for s in floods))
            first = min((float(s["arrival_s"]) for s in floods), default=math.nan)
            rows.append([
                v["vehicle"],
                f"D{int(v['depot_index']) + 1} {short_depot(v.get('depot_name'), v['depot_id'])}",
                ", ".join(served),
                len(floods),
                v["if_visits"],
                id_number(float(v["distance_m"]) / 1000.0, 2),
                id_number(float(v["time_s"]) / 60.0, 1),
                id_number(first / 60.0, 1),
            ])
        write_table(
            tables / f"tabel_ringkasan_rute_{best['scenario']}_{best['algorithm']}.csv",
            ["Kendaraan", "Depo", "Titik genangan dilayani", "Kunjungan genangan",
             "Kunjungan IF", "Jarak (km)", "Waktu (menit)", "Tiba pertama di genangan (menit)"],
            rows, made,
        )


def _wilcoxon():
    """wilcoxon_signed_rank from run_experiments.py (one implementation for both scripts)."""
    import importlib.util

    path = Path(__file__).resolve().parent / "run_experiments.py"
    spec = importlib.util.spec_from_file_location("run_experiments_for_figures", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod.wilcoxon_signed_rank


def chi2_sf(x: float, df: int) -> float:
    """P(X >= x) for a chi-squared variable, from the regularized lower gamma series."""
    if x <= 0:
        return 1.0
    a, z = df / 2.0, x / 2.0
    term = total = 1.0 / a
    k = 0
    while abs(term) > 1e-15 * abs(total) and k < 10_000:
        k += 1
        term *= z / (a + k)
        total += term
    lower = math.exp(a * math.log(z) - z - math.lgamma(a)) * total
    return float(min(1.0, max(0.0, 1.0 - lower)))


def friedman(blocks: np.ndarray) -> tuple[float, int, float]:
    """Friedman test, rows = blocks (seeds), columns = settings: (chi2, df, p).

    Ranks within each block, ties sharing their average rank, with the usual
    tie correction.
    """
    n, k = blocks.shape
    ranks = np.zeros_like(blocks, dtype=float)
    ties = 0.0
    for i, row in enumerate(blocks):
        order = np.argsort(row, kind="mergesort")
        r = np.empty(k)
        sorted_row = row[order]
        j = 0
        while j < k:
            m = j
            while m + 1 < k and sorted_row[m + 1] == sorted_row[j]:
                m += 1
            r[order[j : m + 1]] = (j + m) / 2.0 + 1.0
            t = m - j + 1
            ties += t**3 - t
            j = m + 1
        ranks[i] = r
    rsum = ranks.sum(axis=0)
    chi2 = 12.0 / (n * k * (k + 1)) * float(np.sum(rsum**2)) - 3.0 * n * (k + 1)
    correction = 1.0 - ties / (n * k * (k**2 - 1))
    if correction > 0:
        chi2 /= correction
    return chi2, k - 1, chi2_sf(chi2, k - 1)


def _by_seed(rows: list[dict[str, str]], metric: str) -> dict[int, float]:
    return {int(float(r["seed"])): fval(r, metric) for r in rows}


def table_sensitivity_tests(runs: list[dict[str, str]], tables: Path, made: list[Path]) -> None:
    """Each ACS parameter value and each polish slice against its default, paired by seed."""
    from app.algorithms.acs import DEFAULT_POLISH_SLICE_S as ACS_SLICE, ACSParams
    from app.algorithms.vns import DEFAULT_POLISH_SLICE_S as VNS_SLICE

    wilcoxon = _wilcoxon()
    out: list[list[object]] = []

    def row(test, algo, param, value, metric, base, other):
        seeds = sorted(set(base) & set(other))
        if not seeds:
            return
        b = np.array([base[s] for s in seeds])
        o = np.array([other[s] for s in seeds])
        res = wilcoxon(o, b)
        out.append([
            test, ALGO_LABEL[algo], param, value, METRIC_LABEL[metric], len(seeds),
            id_number(float(o.mean())), id_number(float(b.mean())),
            id_number(100.0 * (o.mean() / b.mean() - 1.0), 2),
            "< 0,001" if res["p_value"] < 0.001 else id_number(float(res["p_value"]), 4),
        ])

    acs = [r for r in runs if r["experiment"] == "acs_params"]
    defaults = ACSParams()
    for metric in ("objective_z", "score"):
        base = _by_seed([r for r in acs if r["param"] == "default"], metric)
        for param in ("n_ants", "q0", "rho"):
            values = sorted({float(r["param_value"]) for r in acs if r["param"] == param})
            for v in values:
                other = _by_seed([r for r in acs if r["param"] == param and float(r["param_value"]) == v], metric)
                default_label = id_number(float(getattr(defaults, param)), 2).rstrip("0").rstrip(",")
                row("Wilcoxon vs bawaan " + default_label, "acs", param,
                    id_number(v, 2).rstrip("0").rstrip(","), metric, base, other)

    polish = [r for r in runs if r["experiment"] == "polish_slice"]
    for algo, default in (("acs", ACS_SLICE), ("vns", VNS_SLICE)):
        mine = [r for r in polish if r["algorithm"] == algo]
        if not mine:
            continue
        values = sorted({float(r["param_value"]) for r in mine})
        for metric in ("objective_z", "score"):
            base = _by_seed([r for r in mine if float(r["param_value"]) == float(default)], metric)
            for v in values:
                if v == float(default):
                    continue
                other = _by_seed([r for r in mine if float(r["param_value"]) == v], metric)
                row(f"Wilcoxon vs bawaan {id_number(default, 1)}", algo, "polish_slice_s",
                    id_number(v, 1), metric, base, other)
            per_value = [_by_seed([r for r in mine if float(r["param_value"]) == v], metric) for v in values]
            seeds = sorted(set.intersection(*(set(d) for d in per_value)))
            if len(seeds) >= 2 and len(values) >= 3:
                blocks = np.array([[d[s] for d in per_value] for s in seeds])
                chi2, df, p = friedman(blocks)
                out.append([
                    f"Friedman (χ² = {id_number(chi2, 3)}, df = {df})", ALGO_LABEL[algo],
                    "polish_slice_s", "semua nilai", METRIC_LABEL[metric], len(seeds),
                    "", "", "", "< 0,001" if p < 0.001 else id_number(p, 4),
                ])
    if out:
        write_table(
            tables / "uji_sensitivitas.csv",
            ["Uji", "Algoritma", "Parameter", "Nilai", "Metrik", "n", "Rata-rata",
             "Rata-rata bawaan", "Selisih (%)", "p-value"],
            out, made,
        )


def table_limits(summary: list[dict[str, str]], tables: Path, made: list[Path]) -> None:
    """Horizon and dispatch groups: Z, coverage, vehicles and distance per value."""
    rows: list[list[object]] = []
    for exp, col, label in (("horizon", "horizon_min", "Batas durasi rute (menit)"),
                            ("dispatch", "dispatch_min", "Batas waktu dispatch (menit)")):
        group = sorted((r for r in summary if r["experiment"] == exp),
                       key=lambda r: (float(r[col]), r["algorithm"]))
        for r in group:
            rows.append([
                label, id_number(float(r[col]), 0), ALGO_LABEL.get(r["algorithm"], r["algorithm"]),
                r["n_runs"],
                id_number(fval(r, "objective_z_mean")), id_number(fval(r, "objective_z_std")),
                id_number(fval(r, "coverage_pct_mean"), 2),
                id_number(fval(r, "vehicles_used_mean"), 1),
                id_number(fval(r, "total_distance_m_mean") / 1000.0, 1),
            ])
    if rows:
        write_table(
            tables / "tabel_sensitivitas_horizon_dispatch.csv",
            ["Parameter", "Nilai", "Algoritma", "n", "Rata-rata Z", "Simpangan baku Z",
             "Rata-rata cakupan (%)", "Rata-rata kendaraan", "Rata-rata jarak (km)"],
            rows, made,
        )


# --- Main ------------------------------------------------------------------------


def _time_limit(runs: list[dict[str, str]], given: float | None) -> float:
    if given:
        return given
    limits = [fval(r, "time_limit_s") for r in runs if r["experiment"] == "main"]
    limits = [x for x in limits if not math.isnan(x)]
    return max(limits) if limits else 45.0


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT, help="run_experiments.py output folder")
    ap.add_argument("--time-limit", type=float, default=None,
                    help="x-axis end of the convergence plots (default: the runs' limit)")
    args = ap.parse_args()

    out: Path = args.out
    runs = read_csv(out / "runs.csv")
    if not runs:
        sys.exit(f"no runs.csv in {out}")
    figs, tables = out / "figures", out / "tables"
    figs.mkdir(parents=True, exist_ok=True)
    tables.mkdir(parents=True, exist_ok=True)
    setup_matplotlib()

    made: list[Path] = []
    notes: list[str] = []
    convergence(out, figs, _time_limit(runs, args.time_limit), made, notes)
    boxplots(runs, figs, made, notes)
    sens = read_csv(out / "sensitivity_acs.csv")
    extra = read_csv(out / "sensitivity_extra.csv")
    summary = read_csv(out / "summary.csv")
    sensitivity_acs(sens, runs, figs, made, notes)
    extra_figures(extra, runs, figs, made, notes)
    limits_figures(summary, figs, made, notes)

    table_statistics(runs, tables, made)
    table_comparison(read_csv(out / "wilcoxon.csv"), tables, made)
    table_routes(out, tables, made, notes)
    table_route_summary(out, tables, made)
    table_sensitivity(sens, tables, made)
    table_sensitivity_tests(runs, tables, made)
    table_extra(extra, tables, made)
    table_limits(summary, tables, made)

    for p in made:
        print(f"wrote {p.relative_to(out)}")
    for n in notes:
        print(f"skipped: {n}")


if __name__ == "__main__":
    main()
