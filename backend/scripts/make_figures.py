"""Figures and tables for Bab 6, from a run_experiments.py output folder.

Reads runs.csv, wilcoxon.csv, sensitivity_acs.csv, sensitivity_extra.csv,
traces/ and best/ in --out and writes:

  figures/  PNG, 300 dpi, 16 x 10 cm, serif 10 pt, no title (the caption is in
            the book), labels in Indonesian
    konvergensi_<scenario>.png      mean best score over time, ACS vs VNS, IQR band
    konvergensi_z_<scenario>.png    the same for Z of the best solution
    boxplot_<metric>.png            ACS vs VNS per scenario (objective_z, score,
                                    total_distance_m, vehicles_used)
    sensitivitas_<param>.png        n_ants, q0, rho: mean +/- std of score and Z
    polish_slice.png, unserved_penalty.png
  tables/   CSV to paste into Word: ';' separated, decimal comma, UTF-8 with BOM
    tabel_statistik_<algorithm>.csv, tabel_perbandingan.csv,
    tabel_rute_<scenario>_<algorithm>.csv, tabel_sensitivitas.csv,
    tabel_polish_slice.csv, tabel_unserved_penalty.csv

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
from matplotlib.ticker import FuncFormatter  # noqa: E402

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
            ax.legend([*handles, band], [*labels, "Rentang interkuartil"], loc="upper right")
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
        fig, ax = plt.subplots(figsize=FIG_SIZE)
        width = 0.34
        for k, a in enumerate(ALGOS):
            data = [
                [fval(r, metric) / scale for r in main if r["scenario"] == sc and r["algorithm"] == a]
                for sc in scenarios
            ]
            pos = np.arange(len(scenarios)) + (k - 0.5) * (width + 0.04)
            bp = ax.boxplot(
                data, positions=pos, widths=width, patch_artist=True, showfliers=True,
                medianprops={"color": INK, "linewidth": 1.4},
                whiskerprops={"color": MUTED, "linewidth": 1.0},
                capprops={"color": MUTED, "linewidth": 1.0},
                flierprops={"marker": MARKER[a], "markersize": 4, "markerfacecolor": COLOR[a],
                            "markeredgecolor": "white", "markeredgewidth": 0.6},
            )
            for box in bp["boxes"]:
                box.set_facecolor(COLOR[a])
                box.set_alpha(0.75)
                box.set_edgecolor("white")
                box.set_linewidth(1.0)
                if a == "vns":
                    box.set_hatch("///")
            bp["boxes"][0].set_label(ALGO_LABEL[a])
        ax.set_xticks(np.arange(len(scenarios)))
        ax.set_xticklabels([SCENARIO_LABEL.get(sc, sc) for sc in scenarios])
        ax.set_ylabel(METRIC_LABEL[metric])
        ax.grid(axis="x", visible=False)
        _number_axis(ax)
        ax.legend(loc="best")
        _save(fig, figs / f"boxplot_{metric}.png", made)


# --- Sensitivity -----------------------------------------------------------------


def _two_panels():
    fig, axes = plt.subplots(1, 2, figsize=FIG_SIZE)
    return fig, axes


def sensitivity_acs(rows: list[dict[str, str]], figs: Path, made: list[Path], notes: list[str]) -> None:
    if not rows:
        notes.append("sensitivitas: sensitivity_acs.csv missing (acs_params not run)")
        return
    label = {"n_ants": "Jumlah semut (m)", "q0": "q₀", "rho": "ρ"}
    for param in ("n_ants", "q0", "rho"):
        group = sorted((r for r in rows if r["param"] == param), key=lambda r: float(r["value"]))
        if not group:
            continue
        x = np.array([float(r["value"]) for r in group])
        fig, axes = _two_panels()
        for ax, key, ylabel in ((axes[0], "score", "Skor"), (axes[1], "z", "Z")):
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


def extra_figures(rows: list[dict[str, str]], figs: Path, made: list[Path], notes: list[str]) -> None:
    specs = {
        "polish_slice": (
            "Batas waktu polish per iterasi (detik)",
            [("score", "Skor"), ("objective_z", "Z")],
        ),
        "unserved_penalty": (
            "Bobot penalti tak terlayani (λᵤ)",
            [("coverage_pct", "Cakupan (%)"), ("objective_z", "Z"), ("score", "Skor")],
        ),
    }
    for exp, (xlabel, panels) in specs.items():
        group = [r for r in rows if r["experiment"] == exp]
        if not group:
            notes.append(f"{exp}: not run")
            continue
        fig, axes = plt.subplots(1, len(panels), figsize=FIG_SIZE)
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
            _number_axis(ax)
        axes[0].legend(loc="best")
        if len(panels) == 3:
            fig.supxlabel(xlabel, fontsize=10)
        _save(fig, figs / f"{exp}.png", made)


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
    for exp, name, label in (
        ("polish_slice", "tabel_polish_slice.csv", "Batas polish (detik)"),
        ("unserved_penalty", "tabel_unserved_penalty.csv", "λu"),
    ):
        group = [r for r in rows if r["experiment"] == exp]
        if not group:
            continue
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
    sensitivity_acs(sens, figs, made, notes)
    extra_figures(extra, figs, made, notes)

    table_statistics(runs, tables, made)
    table_comparison(read_csv(out / "wilcoxon.csv"), tables, made)
    table_routes(out, tables, made, notes)
    table_sensitivity(sens, tables, made)
    table_extra(extra, tables, made)

    for p in made:
        print(f"wrote {p.relative_to(out)}")
    for n in notes:
        print(f"skipped: {n}")


if __name__ == "__main__":
    main()
