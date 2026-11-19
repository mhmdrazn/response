# Eksperimen Bab 6

Folder ini adalah keluaran bawaan `scripts/run_experiments.py`.

- **`result/`**: hasil final yang dipakai di Bab 6 (masuk git). Hybrid ACS dan VNS
  versi akhir (VNS dengan konstruksi paralel dan pemindahan ke kendaraan
  menganggur, commit `6b8196c`); eksperimen λu di S1 dan S2. Detailnya di
  `result/metadata.json`.
- `temp/`: hasil lama yang tidak dipakai (tidak masuk git): run pertama dengan VNS
  lama (`temp/bab6`) dan berkas dari sebelum matriks AHP final dan 19 depo.

## Perintah

Jalankan dari folder `backend/` dengan venv proyek (Windows, PowerShell):

```powershell
cd backend
.venv\Scripts\python -m pip install -r requirements-dev.txt   # sekali: matplotlib dan pytest
.venv\Scripts\python scripts\run_experiments.py --workers 6 --out experiments\result
.venv\Scripts\python scripts\make_figures.py --out experiments\result
```

`--out experiments\result` adalah folder hasil final; untuk menjalankan ulang tanpa
menimpanya, pakai nama folder lain. Tanpa `--resume`, `runs.csv` di
folder tujuan dihapus lebih dulu.

Kalau terhenti (laptop tidur, listrik padam), lanjutkan tanpa mengulang run yang
sudah selesai:

```powershell
.venv\Scripts\python scripts\run_experiments.py --workers 6 --out experiments\result --resume
```

Satu eksperimen saja, misalnya untuk mengulang yang gagal:

```powershell
.venv\Scripts\python scripts\run_experiments.py --only polish_slice unserved_penalty --workers 6 --out experiments\result --resume
```

Uji cepat semua jalur keluaran (sekitar 2 menit):

```powershell
.venv\Scripts\python scripts\run_experiments.py --seeds 2 --sensitivity-seeds 2 --extra-seeds 2 --time-limit 5 --out experiments_smoke
.venv\Scripts\python scripts\make_figures.py --out experiments_smoke
```

## Isi eksperimen penuh (bawaan)

| Eksperimen | Skenario | Pengaturan | Seed | Algoritma | Run |
|---|---|---|---|---|---|
| main | S1, S2, S3 | bawaan (horizon 281 menit, dispatch 7 menit) | 30 | ACS, VNS | 180 |
| horizon | S2 | 240 / 281 / 360 / 517 menit | 30 | ACS, VNS | 240 |
| dispatch | S2 | 5 / 7 / 10 / 15 menit | 30 | ACS, VNS | 240 |
| acs_params | S2 | n_ants 10/20/30, q0 0,5/0,7/0,9, ρ 0,10/0,15/0,30 (satu per satu) | 30 | ACS | 210 |
| polish_slice | S2 | 0,1 / 0,3 / 0,5 / 1,0 / 2,0 detik | 15 | ACS, VNS | 150 |
| unserved_penalty | S2 | λu 100 / 250 / 500 / 1000 | 15 | ACS, VNS | 120 |
| **Total** | | | | | **1.140** |

Setiap run dibatasi 45 detik; solver berhenti sekitar 42 detik (3 detik dicadangkan
untuk perbaikan akhir) ditambah sekitar 1 detik persiapan. Durasi kira-kira =
jumlah run × 43 detik ÷ jumlah worker. Dengan `--workers 6`: 1.140 × 43 ÷ 6 ≈
8.200 detik, **sekitar 2 jam 20 menit**; sediakan 2,5 jam. Biarkan laptop terhubung ke listrik, mode daya
"Best performance", dan jangan jalankan pekerjaan berat lain: run yang berbagi
CPU menyelesaikan lebih sedikit iterasi dalam 45 detik, dan itu mengubah hasil.
Karena itu `--workers` dibatasi 6 secara bawaan dan skrip memberi peringatan bila
lebih.

## Keluaran

| Berkas | Isi |
|---|---|
| `metadata.json` | commit, versi Python, OS, CPU, RAM, worker, batas waktu, tanggal (satu entri per sesi, termasuk `--resume`) |
| `runs.csv` | satu baris per run: Z, penalti, skor, cakupan, kendaraan, kunjungan IF, kunjungan berulang, jarak, waktu, iterasi, detik saat solusi terbaik ditemukan (`best_found_s`) |
| `summary.csv` | rata-rata, simpangan baku, median, min (terbaik), maks (terburuk) per metrik per grup |
| `wilcoxon.csv` | uji Wilcoxon bertanda ACS vs VNS per metrik per grup (berpasangan per seed), dengan `better` pada α 0,05 |
| `sensitivity.csv` | grup horizon dan dispatch dari `summary.csv` |
| `sensitivity_acs.csv` | per nilai parameter ACS |
| `sensitivity_extra.csv` | grup polish_slice dan unserved_penalty |
| `traces/*.json` | konvergensi setiap run: `iter`, `t` (detik), `best_score`, `best_z`, `iter_best_score` |
| `best/<skenario>_<algoritma>.json` | solusi main dengan skor terkecil, lengkap dengan rute per kendaraan |
| `figures/*.png` | dari `make_figures.py`: konvergensi, boxplot, sensitivitas, polish_slice, unserved_penalty (300 dpi, 16 × 10 cm) |
| `tables/*.csv` | dari `make_figures.py`: tabel siap tempel ke Word (pemisah `;`, desimal koma) |

Rujukan ke bab:

| Subbab | Berkas |
|---|---|
| 6.3 Hasil Hybrid ACS | `tables/tabel_statistik_acs.csv`, `tables/tabel_rute_*_acs.csv` |
| 6.4 Hasil VNS | `tables/tabel_statistik_vns.csv`, `tables/tabel_rute_*_vns.csv` |
| 6.5 Perbandingan | `tables/tabel_perbandingan.csv`, `figures/boxplot_*.png`, `wilcoxon.csv` |
| 6.6 Konvergensi | `figures/konvergensi_*.png`, `figures/konvergensi_z_*.png` |
| 6.7 Sensitivitas | `tables/tabel_sensitivitas.csv`, `figures/sensitivitas_*.png`, `sensitivity.csv`, `tables/tabel_polish_slice.csv`, `tables/tabel_unserved_penalty.csv` |

Tabel CSV dibuka di Excel lalu disalin ke Word. Karena memakai pemisah `;` dan
desimal koma, Excel dengan pengaturan regional Indonesia membacanya langsung per
kolom.
