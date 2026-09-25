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

Rumus:

```
V_j = Q × η × k × T_j

Q   debit pompa                       belum terverifikasi
η   rasio waktu pompa benar menyala   tidak diketahui
k   jumlah unit di lokasi             tidak tercatat
T_j selesai − mulai_penanganan        terukur, n=408
```

`η` dan `k` hanya muncul sebagai perkalian, jadi keduanya runtuh menjadi satu
besaran: durasi pemompaan efektif setara-satu-pompa. Cukup satu taksiran, bukan
tiga.

`Q` tidak saling menghapus walaupun evaluator membagi volume dengan `Q` untuk
mendapat waktu layanan. `Q` menentukan berapa kali tangki penuh, jadi ia
mengendalikan jumlah kunjungan IF:

```
Q =   500 L/mnt  ->  28.500 L  ->  ±6 kunjungan IF
Q = 1.000 L/mnt  ->  57.000 L  -> ±11 kunjungan IF
Q = 2.000 L/mnt  -> 114.000 L  -> ±23 kunjungan IF
```

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

## Tahap B — waktu buang per-IF

`IF_DRAIN_S = 120.0` berlaku sama untuk 140 IF, sehingga pemilihan IF hanya
ditentukan jarak. Sungai besar dengan akses baik semestinya lebih cepat daripada
saluran kecil.

`if.csv` sudah punya `waterway_type` dan `distance_to_water_m` — cukup untuk
menurunkan waktu buang per-IF tanpa data tambahan, asal ada pembenaran kasar
dari lapangan.

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

### Perlu ditanyakan ke Damkar

1. **Spesifikasi debit pompa (liter/menit)** — mengunci `Q`, penentu jumlah
   kunjungan IF
2. **Dari total waktu di lokasi, berapa lama pompa benar-benar menyala** —
   mengunci `η`
3. **Satu lokasi biasanya ditangani berapa unit sekaligus** — mengunci `k`
4. **Apakah `mulai_penanganan`/`selesai` dicatat per kejadian atau per lokasi** —
   menentukan apakah pembagian per batch sah
5. **Apakah waktu buang di sungai besar dan saluran kecil terasa berbeda** —
   dasar Tahap B

Pertanyaan 2, 3, dan 5 boleh dijawab kasar. Yang dibutuhkan rentang, dan rentang
itu langsung menjadi batas analisis sensitivitas.

## Catatan risiko

- **Batch entry.** 290 dari 409 baris berbagi jam identik, jadi durasi per titik
  adalah hasil bagi rata, bukan pengukuran langsung. Harus dinyatakan sebagai
  asumsi.
- **Kedalaman lemah menjelaskan durasi** (r = 0,18). Jangan bangun regresi dan
  mengklaim daya prediksi. Yang ada tren peringkat monoton; ragamnya ditangani
  lewat Tahap C.
- **Batas waktu komputasi.** Pada uji dengan beban 30× lebih besar, satu proses
  ACS menembus 1 menit 14 detik walaupun `time_limit_s` 45 detik, karena
  pemeriksaan waktu hanya terjadi antar-iterasi sementara satu putaran polish
  menjadi jauh lebih lama. Dengan beban empiris hal ini akan terjadi, jadi
  pemeriksaan batas waktu perlu masuk ke dalam operator local search sebelum
  Tahap A dipakai di produksi.
- **Penamaan.** Sebut "beban pemompaan", bukan "volume genangan". Yang
  dimodelkan memang beban kerja, bukan volume air fisik; penamaan yang tepat
  menghindari pertanyaan hidrologi yang tidak bisa dijawab data ini.
