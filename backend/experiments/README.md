# Eksperimen Bab 6

Folder ini adalah keluaran bawaan `scripts/run_experiments.py`.

- **`result/`**: hasil final yang dipakai di Bab 6 (masuk git). Dibuat dengan
  q0 bawaan 0,9 (commit `377fc80`), pembersihan kunjungan IF mubazir di Hybrid ACS
  dan VNS (`ad90409`), VNS dengan konstruksi paralel dan pemindahan ke kendaraan
  menganggur (`6b8196c`), serta eksperimen λu di S1 dan S2. Commit, perangkat, dan
  tanggal tercatat di `result/metadata.json`.
- `temp/`: hasil lama yang tidak dipakai (tidak masuk git):
  - `temp/result_q07`: hasil final sebelumnya, dengan q0 0,7 dan tanpa pembersihan
    kunjungan IF mubazir.
  - `temp/bab6`: run pertama dengan VNS lama yang membiarkan sebagian armada
    menganggur.
  - berkas lepas dari sebelum matriks AHP final dan 19 depo.

## Perintah

Jalankan dari folder `backend/` dengan venv proyek (Windows, PowerShell):

```powershell
cd backend
.venv\Scripts\python -m pip install -r requirements-dev.txt   # sekali: matplotlib dan pytest
.venv\Scripts\python scripts\run_experiments.py --workers 6 --penalty-scenarios s2-jun s1-jan --out experiments\result
.venv\Scripts\python scripts\make_figures.py --out experiments\result
```

`--penalty-scenarios s2-jun s1-jan` menjalankan eksperimen λu di kedua skenario.
Di S2 cakupan selalu 100% sehingga λu tidak berpengaruh, sedangkan di S1 cakupan
tidak penuh dan tarik-menariknya terlihat. `--out experiments\result` adalah folder
hasil final; untuk menjalankan ulang tanpa menimpanya, pakai nama folder lain.
Tanpa `--resume`, `runs.csv` di folder tujuan dihapus lebih dulu.

Kalau terhenti (laptop tidur, listrik padam), lanjutkan tanpa mengulang run yang
sudah selesai:

```powershell
.venv\Scripts\python scripts\run_experiments.py --workers 6 --penalty-scenarios s2-jun s1-jan --out experiments\result --resume
```

Satu eksperimen saja, misalnya untuk mengulang yang gagal:

```powershell
.venv\Scripts\python scripts\run_experiments.py --only polish_slice unserved_penalty --workers 6 --penalty-scenarios s2-jun s1-jan --out experiments\result --resume
```

Uji cepat semua jalur keluaran (sekitar 2 menit):

```powershell
.venv\Scripts\python scripts\run_experiments.py --seeds 2 --sensitivity-seeds 2 --extra-seeds 2 --time-limit 5 --penalty-scenarios s2-jun s1-jan --out experiments_smoke
.venv\Scripts\python scripts\make_figures.py --out experiments_smoke
```

## Isi eksperimen penuh

| Eksperimen | Skenario | Pengaturan | Seed | Algoritma | Run |
|---|---|---|---|---|---|
| main | S1, S2, S3 | bawaan (horizon 281 menit, dispatch 7 menit) | 30 | ACS, VNS | 180 |
| horizon | S2 | 240 / 281 / 360 / 517 menit | 30 | ACS, VNS | 240 |
| dispatch | S2 | 5 / 7 / 10 / 15 menit | 30 | ACS, VNS | 240 |
| acs_params | S2 | n_ants 10/20/30, q0 0,5/0,7/0,9, ρ 0,10/0,15/0,30 (satu per satu; bawaan 20, 0,9, 0,15) | 30 | ACS | 210 |
| polish_slice | S2 | 0,1 / 0,3 / 0,5 / 1,0 / 2,0 detik | 15 | ACS, VNS | 150 |
| unserved_penalty | S1, S2 | λu 100 / 250 / 500 / 1000 | 15 | ACS, VNS | 240 |
| **Total** | | | | | **1.260** |

Setiap run dibatasi 45 detik; solver berhenti sekitar 42 detik (3 detik dicadangkan
untuk perbaikan akhir) ditambah sekitar 1 detik persiapan. Durasi kira-kira =
jumlah run × 43 detik ÷ jumlah worker. Dengan `--workers 6`: 1.260 × 43 ÷ 6 ≈
9.000 detik, **sekitar 2 jam 30 menit**; sediakan 2 jam 45 menit, termasuk
`make_figures.py` (kurang dari 1 menit). Biarkan laptop terhubung ke listrik, mode
daya "Best performance", dan jangan jalankan pekerjaan berat lain: run yang berbagi
CPU menyelesaikan lebih sedikit iterasi dalam 45 detik, dan itu mengubah hasil.
Karena itu `--workers` dibatasi 6 secara bawaan dan skrip memberi peringatan bila
lebih.

## Keluaran

| Berkas | Isi |
|---|---|
| `metadata.json` | commit, versi Python, OS, CPU, RAM, worker, batas waktu, tanggal (satu entri per sesi, termasuk `--resume`) |
| `runs.csv` | satu baris per run: Z, penalti, skor, cakupan, kendaraan, kunjungan IF, `redundant_if` (kunjungan IF mubazir, selalu 0), kunjungan berulang, jarak, waktu, iterasi, detik saat solusi terbaik ditemukan (`best_found_s`) |
| `summary.csv` | rata-rata, simpangan baku, median, min (terbaik), maks (terburuk) per metrik per grup |
| `wilcoxon.csv` | uji Wilcoxon bertanda ACS vs VNS per metrik per grup (berpasangan per seed), dengan `better` pada α 0,05 |
| `sensitivity.csv` | grup horizon dan dispatch dari `summary.csv` |
| `sensitivity_acs.csv` | per nilai parameter ACS |
| `sensitivity_extra.csv` | grup polish_slice dan unserved_penalty |
| `traces/*.json` | konvergensi setiap run: `iter`, `t` (detik), `best_score`, `best_z`, `iter_best_score` |
| `best/<skenario>_<algoritma>.json` | solusi main dengan skor terkecil, lengkap dengan rute per kendaraan |
| `figures/*.png` | dari `make_figures.py` (300 dpi, 16 × 10 cm) |
| `tables/*.csv` | dari `make_figures.py`: tabel siap tempel ke Word (pemisah `;`, desimal koma) |

Rujukan ke bab:

| Subbab | Tabel | Gambar |
|---|---|---|
| 6.3 Hasil Hybrid ACS | `tabel_statistik_acs.csv`, `tabel_ringkasan_rute_<skenario>_acs.csv` | – |
| 6.4 Hasil VNS | `tabel_statistik_vns.csv`, `tabel_ringkasan_rute_<skenario>_vns.csv` | – |
| 6.5 Perbandingan | `tabel_perbandingan.csv` (lengkapnya `wilcoxon.csv`) | `boxplot_<metrik>.png` (satu panel per skenario) |
| 6.6 Konvergensi | – | `konvergensi_<skenario>.png`, `konvergensi_z_<skenario>.png` |
| 6.7 Sensitivitas | `tabel_sensitivitas.csv`, `uji_sensitivitas.csv`, `tabel_sensitivitas_horizon_dispatch.csv`, `tabel_polish_slice.csv`, `tabel_unserved_penalty.csv`, `tabel_unserved_penalty_s1-jan.csv` | `sensitivitas_<param>.png`, `sensitivitas_horizon.png`, `sensitivitas_dispatch.png`, `polish_slice.png`, `unserved_penalty.png`, `unserved_penalty_s1-jan.png` |
| Lampiran | `tabel_rute_<skenario>_<algoritma>.csv` (urutan kunjungan lengkap) | – |

Gambar sensitivitas, polish_slice, dan unserved_penalty hanya menampilkan panel Z
bila cakupan semua run 100% (skor sama dengan Z); bila tidak, panel skor dan
cakupan ikut ditampilkan. `uji_sensitivitas.csv` membandingkan setiap nilai
parameter ACS dan setiap polish_slice dengan nilai bawaannya (Wilcoxon berpasangan
per seed), ditambah uji Friedman untuk polish_slice per algoritma.

Tabel CSV dibuka di Excel lalu disalin ke Word. Karena memakai pemisah `;` dan
desimal koma, Excel dengan pengaturan regional Indonesia membacanya langsung per
kolom.
