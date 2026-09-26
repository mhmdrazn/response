# Rancangan Estimasi Beban Pemompaan

Dokumen kerja untuk mengganti konstanta volume yang tidak berdasar dengan
estimasi beban yang bisa dipertanggungjawabkan, beserta data yang dibutuhkan.

## Masalah

`DEFAULT_VOLUME_PER_CM = 100.0` di `backend/app/algorithms/instance.py` tidak
punya sumber. Akibatnya pada skenario `s2-jun`:

```
volume per titik    : median 2.000 L, maks 5.000 L
titik > tangki 5 kL : 0 dari 34
total kebutuhan     : 15,3 muatan truk untuk 24 kendaraan
```

Tidak ada satu pun titik yang bisa memenuhi tangki, sehingga kendaraan hampir
tidak pernah perlu kembali ke Intermediate Facility. Mekanisme IF — inti dari
MDCVRP-IF — praktis tidak aktif.

## Status

### Selesai: constraint lunak

Cakupan penuh tidak lagi menjadi syarat kelayakan. Solusi yang menyisakan
pekerjaan diberi penalti, bukan ditolak.

```
score   = objective_z + penalty
penalty = UNSERVED_PENALTY * Σ SI_j * (sisa_liter_j / PUMP_RATE_LPS)
```

Konversi liter ke detik pemompaan membuat kedua suku berada pada satuan yang
sama (severity-detik), sehingga `UNSERVED_PENALTY` tidak berdimensi.
Nilai bawaan 100 membuat penyisaan pekerjaan menjadi pilihan terakhir, bukan
cara memperbaiki skor.

Perubahan:

- `evaluator.py` — `SolutionEval` membawa `unserved_volume`, `penalty`, `score`;
  `coverage_ratio()` baru; HC1 keluar dari `validate_hard_constraints`
- `acs.py`, `vns.py`, `local_search.py` — semua kandidat diperingkat pakai
  `score`; VNS tidak lagi melempar error saat solusi awal belum tuntas
- `optimize.py` — respons membawa `penalty`, `score`, `demand_total_l`,
  `unserved_volume_l`, `coverage_pct`, `unserved_points`; permintaan menerima
  `unserved_penalty` opsional
- Frontend — panel hasil menampilkan bar Cakupan Pemompaan

### Berikutnya

| Tahap | Isi | Bergantung data |
|---|---|---|
| A | Beban dari durasi penanganan empiris | ya |
| B | Waktu buang per-IF | sebagian |
| C | Analisis sensitivitas | tidak |

## Tahap A — beban dari durasi empiris

`app/data/files/sources/damkar_geocoded.csv` menyimpan `mulai_penanganan` dan
`selesai` untuk 408 kejadian.

```
durasi per kejadian : median 268 menit
durasi per titik    : median 57 menit   (dibagi jumlah titik sebatch)
korelasi depth-durasi: 0,179
```

Konfirmasi dari Damkar: `Q` = 2.000 L/menit, catatan waktu dibuat **per kejadian
di satu lokasi**, dan satu lokasi ditangani **sekurangnya satu unit**.

Karena catatannya per lokasi, `T_j` adalah durasi baris itu sendiri — median
268 menit, bukan 57 menit hasil bagi batch. Jam yang identik antar-baris
mencerminkan banyak lokasi tergenang serentak dalam satu hujan, bukan satu
laporan yang dipecah.

### Buffer: waktu di lokasi bukan waktu memompa

Selama 268 menit itu unit tidak memompa terus. Ia memompa, berkendara ke IF,
membuang, lalu kembali — berulang kali. Model sudah menghitung perjalanan IF
secara eksplisit, jadi `V_j` harus diturunkan dari **waktu pompa saja**, kalau
tidak siklus buang terhitung dua kali.

Satu siklus buang, diukur dari matriks waktu `s2-jun`:

```
genangan -> IF terdekat : median 123 s  (p25 62, p75 158)
d = 2 × 123 + IF_DRAIN  = 366 s = 6,1 menit
```

Uraian waktu di lokasi:

```
T = SERVICE_SETUP + T_pompa + (V / C) × d       dengan V = Q × T_pompa

T_pompa = (T − SERVICE_SETUP) / (1 + Q × d / C)
```

Untuk `T` = 268 menit, `Q` = 33,33 L/s, `d` = 366 s:

| Tangki | T_pompa | Porsi memompa | V_j |
|---|---|---|---|
| 5.000 L | ±78 menit | 29% | ±155.000 L |
| 3.000 L | ±53 menit | 20% | ±105.000 L |

Jadi buffer bukan koreksi kecil — **70-80% waktu di lokasi habis untuk
mondar-mandir ke IF**, bukan menyedot. Angka ini sekaligus menjawab `η` tanpa
menebak: porsi memompa jatuh dari geometri jaringan itu sendiri.

`k` diambil 1 sebagai batas bawah. Kunjungan berulang oleh beberapa unit sudah
didukung model (satu titik boleh muncul di beberapa rute), jadi jumlah unit
per lokasi memang hasil keputusan optimasi, bukan masukan tetap.

Implementasi: kolom `volume_l` pada `floods.csv`, dihitung saat preprocessing.
`instance.py` memakainya bila ada, konstanta lama tinggal jadi cadangan.

### Menghindari kebocoran data

Memakai `selesai` dari kejadian yang sedang direncanakan adalah kebocoran.
Memakai `selesai` dari kejadian lampau untuk menaksir kejadian baru adalah
kalibrasi. Rancangan ini yang kedua: data historis dipakai sekali, offline.

Pembuktiannya lewat pemisahan waktu:

```
kalibrasi : catatan 2025 (257 kejadian)
uji       : s2-jun 2026  (di luar sampel)
```

`s1-jan` dan `s3-nov` berada di 2025, jadi hari kejadiannya dikeluarkan dari
kalibrasi (leave-one-event-out).

Saat dipakai nyata, `selesai` belum ada. Yang dipakai nilai harapan dari sebaran
terkalibrasi, lalu diperbarui ketika unit melaporkan progres — perencanaan
bergulir, bukan ramalan sekali jalan. Constraint lunak di atas yang membuat sisa
beban mengalir ke periode berikutnya tanpa dianggap gagal.

## Tahap B — waktu buang per-IF (selesai)

Damkar mengonfirmasi pembuangan lebih leluasa di sungai besar. `IF_DRAIN_S`
kini diskalakan per outlet:

```
IF_DRAIN_FACTOR = {"river": 0.75, "stream": 1.25}
```

Populasi IF: 93 `river`, 47 `stream`. Jadi 90 detik di sungai, 150 detik di
saluran, dari basis 120 detik. Instance membawa `if_drain_s` sepanjang `n_ifs`
dan evaluator memakainya per node, bukan konstanta tunggal. Pemilihan IF kini
menimbang jarak dan kecepatan buang sekaligus.

Faktornya masih perkiraan kasar berdasar pernyataan kualitatif. Bila nanti ada
angka lapangan, cukup ganti isi tabel itu.

Kapasitas volume per-IF **tidak** dipakai: IF di sini sungai dan saluran, bukan
kolam tertutup. Batas volume baru relevan bila terbukti ada IF berupa tandon
terbatas, dan itu menambah pengecekan kelayakan di konstruksi maupun local
search.

## Tahap C — analisis sensitivitas

Menggantikan rencana awal memakai DEM. Estimasi topografi mahal, rapuh di medan
datar seperti Surabaya, dan angkanya tidak dipakai solver.

Jalankan solver pada tiga skala beban yang seluruhnya persentil dari data
sendiri:

```
p25  ±27 menit
p50  ±57 menit   <- hasil utama
p75  ±100 menit
```

Yang dilaporkan: apakah urutan prioritas kunjungan dan peringkat ACS vs VNS
bertahan. Bila stabil, hasil tidak sensitif terhadap ketidakpastian estimasi
beban.

## Data yang dibutuhkan

### Sudah ada

| Data | Lokasi |
|---|---|
| Durasi penanganan, 408 kejadian | `sources/damkar_geocoded.csv` |
| Kedalaman genangan | `floods.csv` — `Ketinggian (cm)` |
| Kelas jalan | `floods.csv` — `road_class` |
| Jarak faskes | `floods.csv` — `dist_faskes_m` |
| Jenis dan jarak perairan IF | `shared/if.csv` |

### Terjawab dari Damkar

| Pertanyaan | Jawaban | Dipakai di |
|---|---|---|
| Debit pompa | 2.000 L/menit | `PUMP_RATE_LPS` |
| Waktu pompa benar menyala | diturunkan dari buffer siklus IF, bukan ditebak | Tahap A |
| Unit per lokasi | sekurangnya 1, bisa lebih | `k` = 1 (batas bawah) |
| Granularitas catatan waktu | per kejadian di satu lokasi | `T_j` = durasi baris |
| Beda outlet | ya, lebih leluasa di sungai besar | `IF_DRAIN_FACTOR` |

### Masih terbuka

- Angka lapangan untuk selisih waktu buang sungai vs saluran; sementara dipakai
  faktor 0,75 dan 1,25 terhadap basis 120 detik
- Sebaran jumlah unit per lokasi, bila nanti tercatat — akan menaikkan `V_j`
  secara proporsional

## Simulasi dampak Tahap A

`backend/scripts/simulate_workload.py` menghitung ulang instance di memori pada
beberapa skala beban tanpa menyentuh data.

### Temuan pertama: dua cacat model

Simulasi awal memberi ACS 99,5% dan VNS 14,8% pada beban p50. Cakupan yang tidak
runtuh itu justru membongkar dua cacat.

**Tidak ada batas horizon.** ACS bertahan 99,5% dengan memanjangkan rute: median
4,8 jam, **maksimum 23,3 jam**, 1.138 kunjungan IF. Cakupan dibeli dengan rute
yang tidak mungkin dijalankan.

**VNS terbatas secara struktural.** `_build_greedy_route` membatasi kunjungan:

```
max_flood_visits = max(3, (n_floods * 2) // n_vehicles + 1)   -> 3
```

Batas 3 kunjungan per rute membuat VNS tidak akan pernah bisa menggarap skenario
berat. Kekalahannya artefak konstruktor, bukan mutu algoritma — dan kalau
dibiarkan, bab perbandingan akan menyimpulkan hal yang salah.

### Perbaikan

**Horizon** diambil dari `berangkat -> tiba_pangkalan` di log Damkar (n=408) pada
persentil ke-90: **517 menit = 8,6 jam**, mencakup semua kecuali 10% hari
terpanjang. Maksimum yang teramati, 930 menit, sempat dipakai lebih dulu tetapi
terlalu longgar — armada menyelesaikan hampir semua beban tanpa horizon itu
pernah mengikat. Penegakannya tiga lapis:

1. Konstruksi ACS dan VNS menolak langkah yang tidak sempat pulang sebelum
   horizon
2. Evaluator berhenti menghitung pemompaan setelah horizon — kerja lembur tidak
   berimbalan
3. Kelebihan waktu diberi harga `HORIZON_PENALTY = 5000` per detik. Satu detik
   lembur paling banter membeli satu detik pemompaan yang bernilai
   `UNSERVED_PENALTY × max(SI)` = 500, jadi bobot sepuluh kali lipat menutup
   ruang tukar. Tanpa lapis ini local search masih menyisakan lembur, karena
   "tidak berimbalan" belum berarti "mahal"

**Batas kunjungan VNS dihapus**, diganti horizon yang sama. Satu bug ikut
ketahuan: `_route_time` pada fase repair mengabaikan waktu pompa, padahal itu
bagian terbesar satu perhentian di skenario berat, sehingga repair mengira rute
penuh masih punya ruang.

### Hasil setelah perbaikan

Horizon p90 = 8,6 jam:

```
beban                  V per titik     total    ACS cakupan/waktu/rute   VNS cakupan/waktu/rute
sekarang (100 L/cm)        2,3 m3   0,08 jt L      100,0% / 41s / 1,5j      98,7% / 45s / 3,0j
p25  67 mnt di lokasi     32,6 m3   1,11 jt L       99,5% / 45s / 8,5j     100,0% / 45s / 8,6j
p50 268 mnt di lokasi    131,7 m3   4,48 jt L       99,4% / 46s / 8,6j      99,6% / 46s / 8,6j
p75 382 mnt di lokasi    188,0 m3   6,39 jt L       78,5% / 46s / 8,6j      80,1% / 45s / 8,6j
```

VNS naik dari 14,8% ke 99,6% di p50 dan kini **unggul tipis atas ACS** di semua
skala berat — batas konstruktor itu memang seluruh ceritanya. Tidak ada rute
yang melewati horizon.

Titik jenuh armada jatuh antara p50 dan p75, dan aritmetikanya cocok: 24 unit ×
8,6 jam = 207 jam-kendaraan tersedia; p50 menuntut ±151 jam-kendaraan (muat,
cakupan ~99%), p75 menuntut ±215 (tidak muat, cakupan ~80%).

Di p75 inilah constraint lunak akhirnya bekerja sungguhan: solusi menyisakan
seperlima beban, tidak ditolak, dan sisanya bergulir ke periode berikutnya.

## Catatan risiko

- **Batch entry.** 290 dari 409 baris berbagi jam identik, jadi durasi per titik
  adalah hasil bagi rata, bukan pengukuran langsung. Harus dinyatakan sebagai
  asumsi.
- **Kedalaman lemah menjelaskan durasi** (r = 0,18). Jangan bangun regresi dan
  mengklaim daya prediksi. Yang ada tren peringkat monoton; ragamnya ditangani
  lewat Tahap C.
- **Batas waktu komputasi — sudah ditegakkan.** Sebelumnya satu proses ACS
  menembus 1 menit 14 detik walaupun `time_limit_s` 45 detik, karena pemeriksaan
  waktu hanya terjadi antar-iterasi sementara satu putaran polish jauh lebih
  lama pada rute panjang. Deadline kini diteruskan ke dalam `two_opt`,
  `relocate_between_routes`, `or_opt`, `exchange`, dan konstruksi awal VNS.
  Terukur pada beban 30×: ACS 45,2 detik, VNS 45,0 detik. Ambang 45 detik ini
  dipakai sebagai batasan tetap di skripsi.
- **Penamaan.** Sebut "beban pemompaan", bukan "volume genangan". Yang
  dimodelkan memang beban kerja, bukan volume air fisik; penamaan yang tepat
  menghindari pertanyaan hidrologi yang tidak bisa dijawab data ini.
