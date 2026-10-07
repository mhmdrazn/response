# Laporan Pengembangan Aplikasi Response (FloodRoute Surabaya)

> Dokumen ini dibuat untuk diserahkan ke asisten penulisan (Claude Chat) sebagai bahan menulis bab-bab tugas akhir.
> Isinya adalah catatan faktual tentang apa yang sudah dibangun, bagaimana cara kerjanya, kenapa keputusan diambil,
> masalah apa yang muncul dan bagaimana diperbaiki, serta apa yang belum atau tidak boleh diklaim.
> Posisi: kondisi repositori pada 6 Oktober 2026 (commit terakhir `ded9ed8`), 102 commit sejak 11 Juli 2026.
>
> **Catatan untuk penulis bab:** angka di dokumen ini diambil dari kode, data, dan eksperimen yang benar-benar dijalankan.
> Bagian "Keterbatasan dan hal yang tidak boleh diklaim" (Bagian 13) wajib dibaca sebelum menulis klaim di bab hasil dan pembahasan.

---

## Daftar Isi

1. Ringkasan eksekutif
2. Latar belakang, masalah, dan pengguna
3. Arsitektur dan teknologi
4. Data dan pra-pemrosesan
5. Severity Index
6. Model optimasi
7. Algoritma: Hybrid ACS, VNS, dan local search
8. Perjalanan perbaikan model dan algoritma (kronologi masalah ke solusi)
9. Fitur aplikasi
10. Hasil eksperimen
11. Pengujian dan verifikasi
12. Kronologi pengembangan
13. Keterbatasan dan hal yang tidak boleh diklaim
14. Lampiran: parameter, API, struktur berkas, istilah

---

## 1. Ringkasan eksekutif

**Response** (nama kode repositori: *FloodRoute Surabaya*) adalah sistem pendukung keputusan berbasis web untuk
merencanakan rute truk pompa Dinas Pemadam Kebakaran dan Penyelamatan Kota Surabaya saat banjir. Masalahnya dimodelkan
sebagai **MDCVRP-IF-SI**: *Multi-Depot Capacitated Vehicle Routing Problem with Intermediate Facilities and Severity Index*.

Inti teknis:

- Dua algoritma dibandingkan: **Hybrid Ant Colony System (ACS)** sebagai metode utama dan **Variable Neighborhood Search (VNS)**
  sebagai pembanding. Keduanya berjalan di backend Python, dibatasi anggaran waktu (30, 45, atau 60 detik).
- Prioritas titik genangan ditentukan **Severity Index (SI)** yang dihitung dari tiga kriteria (tinggi genangan, kelas jalan,
  jarak ke fasilitas kesehatan) dengan bobot **AHP + Entropy Weight**. Bobot ini bisa diganti pengguna.
- Tujuan optimasi: meminimalkan **Z = Σ SI × waktu tiba**, sehingga titik yang parah dijangkau lebih awal.
- Kendaraan memulai rute dengan **tangki penuh** (siaga di pangkalan), sehingga wajib ke Intermediate Facility (IF, titik buang
  air seperti sungai) lebih dulu sebelum memompa. Satu titik boleh dikunjungi berulang sampai airnya habis.
- Kewajiban menuntaskan semua titik dijadikan **constraint lunak**: pekerjaan yang tidak selesai dikenai penalti, bukan
  ditolak. Sisanya dibawa ke **periode berikutnya** (rolling horizon).
- Beban pompa per titik **diturunkan dari geometri**: lebar jalan × panjang genangan × (kedalaman − batas aman).
  Batas waktu rute, jangkauan dispatch, debit pompa, dan waktu kerja diambil dari log penanganan Damkar (408 kejadian)
  dan hasil wawancara.
- Aplikasi menampilkan peta interaktif, hasil optimasi, detail tiap titik/depo/sungai/faskes/rute, diagnosis titik belum tuntas
  beserta saran, metrik keseimbangan beban, perencanaan multi-periode, pengaturan armada dan bobot prioritas, input titik
  genangan baru (klik peta atau CSV), serta ekspor PDF dan Excel.

Skala kode (perkiraan): backend sekitar 4.800 baris Python di `app/`, frontend sekitar 13.900 baris TypeScript, 69 kasus uji
pytest (semuanya lulus), 3 skenario banjir, 12 depo, 140 titik buang air, 404 fasilitas kesehatan.

---

## 2. Latar belakang, masalah, dan pengguna

### 2.1 Konteks

Tugas akhir Departemen Sistem Informasi ITS. Pengguna utama adalah petugas operasional Dinas Pemadam Kebakaran dan
Penyelamatan Kota Surabaya yang mengoordinasikan pengerahan truk pompa saat banjir.

Satu tugas produk: *diberi himpunan titik genangan, pos pemadam, dan sungai, hasilkan dan tampilkan rute truk pompa yang
mendahulukan titik berkeparahan tinggi.*

### 2.2 Formalisasi masalah (MDCVRP-IF-SI)

- **Banyak depo** (12 pos pemadam), tiap depo punya kendaraan dengan tangki berkapasitas terbatas (bawaan: 3.000 L dan 5.000 L,
  satu unit masing-masing per depo, total 24 kendaraan).
- **Fasilitas perantara (IF)**: tangki penuh harus dikosongkan di IF (sungai/kali) sebelum kendaraan bisa memompa lagi.
- **Severity Index (SI)**: bobot urgensi tiap titik, dalam rentang 0 sampai 1.
- **Kunjungan ganda**: satu titik boleh dikunjungi berkali-kali oleh kendaraan yang sama atau berbeda sampai volume air habis.
- **Soft constraint (masukan dosen penguji)**: lokasi boleh dikunjungi kembali sampai genangan surut; jumlah kunjungan
  diperlakukan sebagai constraint lunak. Ini diterjemahkan ke penalti pekerjaan yang belum selesai.

### 2.3 Pertanyaan penelitian yang terjawab oleh sistem

1. Berapa kali kendaraan harus kembali ke satu titik genangan? Jawabannya diturunkan dari volume titik dan kapasitas tangki,
   bukan diasumsikan. Ini adalah celah yang ingin ditutup tugas akhir ini.
2. Bagaimana memperhitungkan volume genangan di satu titik ketika tidak ada data luas genangan? Dijawab dengan model geometri
   (Bagian 6.4).
3. Algoritma mana (ACS atau VNS) yang menghasilkan rencana lebih baik pada kondisi yang sama?

---

## 3. Arsitektur dan teknologi

### 3.1 Gambaran

```
Frontend (Next.js 16, React 19, Tailwind 4, Leaflet)  <-- HTTP/JSON -->  Backend (FastAPI, Python 3.12, NumPy, pandas)
        port 3000                                                           port 8000
                                                                 Data statis: CSV + matriks .npy (tanpa database)
```

- **Tanpa database, tanpa autentikasi.** Data dimuat dari berkas saat startup (`ScenarioStore`).
- **Algoritma hanya berjalan di backend**, tidak pernah di peramban.
- Frontend memakai `fetch` bawaan lewat pembungkus tipis `lib/api.ts` (tanpa axios), state React saja (tanpa Redux/Zustand),
  Tailwind saja (tanpa CSS modules).
- Penyimpanan di peramban (`localStorage`) dipakai untuk kenyamanan pengguna: hasil optimasi terakhir, pilihan layout,
  parameter algoritma, rute yang disembunyikan, pengaturan armada, dan bobot prioritas. Catatan: aturan awal proyek melarang
  `localStorage`; penggunaannya ditambahkan bertahap atas permintaan pengguna.

### 3.2 Teknologi

| Lapisan | Teknologi |
|---|---|
| Backend | Python 3.12, FastAPI, Uvicorn, NumPy, pandas, httpx, Pydantic v2, pytest |
| Frontend | Next.js 16.2 (App Router), React 19.2, TypeScript (strict), Tailwind CSS v4, Leaflet 1.9 + react-leaflet 5, Recharts 3, lucide-react |
| Ekspor | jsPDF + jspdf-autotable (PDF); penulis XLSX sendiri berbasis `fflate` (tanpa pustaka spreadsheet) |
| Rute dan jarak | OSRM (server publik) untuk matriks jarak/waktu dan geometri rute; cadangan jarak Manhattan |
| Data peta | OpenStreetMap (Overpass) untuk depo, IF, faskes, jaringan jalan; PetaBencana.id untuk genangan |
| Basemap | OSM Standard, Esri Light Gray Canvas, Esri Dark Gray, Esri World Imagery (tanpa kunci API) |
| Deploy | Konfigurasi monorepo Vercel (`vercel.json`: layanan `frontend` dan `backend`, rewrite `/api/*` ke backend) |
| Font dan desain | Manrope saja; sistem desain di `DESIGN.md` (token warna, tanpa `box-shadow`) |

Dokumen pendukung di repo: `PRD.md` (kebutuhan produk), `AGENT.md` (konvensi), `DESIGN.md` (sistem desain),
`CLAUDE.md` (aturan kerja), `docs/beban-pemompaan.md` (rancangan beban pompa, sebagian sudah usang, lihat Bagian 8),
`docs/iterasi-vs-kualitas.md` (hasil sweep jatah polish), dan `notebooks/Bab5_Implementasi.md`
(draf Bab 5 lama, 1.788 baris, ditulis sebelum banyak perubahan model; **banyak bagiannya perlu disesuaikan**, lihat Bagian 13.4).

### 3.3 Endpoint API (backend)

| Metode | Path | Fungsi |
|---|---|---|
| GET | `/health` | Status, commit git yang berjalan, waktu start, skenario bawaan, jumlah titik, total beban |
| GET | `/api/scenarios` | Daftar skenario banjir dan bawaannya |
| GET | `/api/data/floods`, `/depo`, `/if`, `/faskes` | Data per skenario (`?scenario=`); depo/IF/faskes sama di semua skenario |
| GET | `/api/data/meta` | Waktu pembaruan dan jumlah baris tiap dataset |
| POST/PUT/DELETE | `/api/data/floods` (+ `/{id}`) | Tambah/ubah/hapus titik genangan; otomatis memperkaya kelas jalan, jarak faskes, volume, dan memperbarui matriks |
| POST/PUT/DELETE | `/api/data/depo`, `/if`, `/faskes` | CRUD data bersama |
| GET | `/api/severity-index` | SI dengan bobot bawaan (AHP + Entropy) |
| POST | `/api/severity-index` | SI dengan bobot kustom (pratinjau, tidak mengubah data) |
| POST | `/api/optimize/acs`, `/api/optimize/vns` | Jalankan algoritma; menerima parameter algoritma, `fleet`, `severity_weights`, `remaining_volumes` |
| GET | `/api/optimize/fleet-defaults` | Konfigurasi armada bawaan (kapasitas, jam operasional) |

### 3.4 Modul backend

| Berkas | Isi |
|---|---|
| `app/algorithms/instance.py` | Konstanta model, struktur `Instance`, pembuatan armada, jangkauan dispatch, horizon per kendaraan |
| `app/algorithms/evaluator.py` | Evaluator solusi (Z, penalti, kendala), evaluasi inkremental, `prune_idle_stops`, validasi kendala keras |
| `app/algorithms/acs.py` | Hybrid ACS (konstruksi semut, feromon, repair, polish, jatah waktu) |
| `app/algorithms/vns.py` | VNS (solusi awal greedy, shaking, siklus polish) |
| `app/algorithms/local_search.py` | 2-opt, relocate antar rute, or-opt, exchange, `polish` |
| `app/algorithms/diagnosis.py` | Diagnosis titik belum tuntas, saran perbaikan, metrik keseimbangan |
| `app/algorithms/osrm.py`, `geo.py` | Geometri rute dari OSRM (koneksi dipool, batch, cadangan Manhattan), utilitas jarak |
| `app/severity/{ahp,entropy,index}.py` | Perhitungan SI |
| `app/preprocessing/*` | Pipeline skenario: klasifikasi jalan, jarak faskes, matriks, beban pompa, pengayaan titik baru |
| `app/data/*` | `ScenarioStore`, registry skenario, penyuntingan titik genangan |
| `app/routers/*` | Endpoint data, optimasi, severity, skenario |
| `scripts/` | `build_scenario.py`, `backfill_workload.py`, `simulate_workload.py` |

---

## 4. Data dan pra-pemrosesan

### 4.1 Sumber data

| Data | Sumber | Catatan |
|---|---|---|
| Titik genangan | Log penanganan Damkar (`damkar_geocoded.csv`, dari `data-genangan-25-26.xlsx`); eksplorasi awal PetaBencana.id | Diberi koordinat (geokoding), tinggi genangan (cm), tanggal |
| Depo | OSM (pos pemadam kebakaran) | 12 depo, `shared/depo.csv` |
| Fasilitas perantara (IF) | OSM: titik di tepi sungai/kali yang dapat dijangkau jalan | 140 titik (93 `river`, 47 `stream`), `shared/if.csv` |
| Fasilitas kesehatan | OSM (rumah sakit, klinik, dsb.) | 404 titik, `shared/faskes.csv` |
| Jaringan jalan | OSM via Overpass API (geopandas untuk pemrosesan), di-cache di `cache/roads_utm.pkl` | Untuk klasifikasi kelas jalan titik genangan |
| Jarak dan waktu tempuh | OSRM (`/table`) | Matriks asimetris antar semua node |
| Waktu penanganan, jangkauan respons | Log Damkar: 408 kejadian, kolom `mulai_penanganan`, `selesai`, `respon_time` | Dipakai untuk horizon rute dan batas dispatch |
| Debit pompa, jumlah unit per lokasi | Wawancara Damkar | 2.000 L/menit; sekurangnya 1 unit per lokasi; log dicatat per kejadian di satu lokasi |

Notebook pengumpulan data (`notebooks/`):
`0` PetaBencana, `1` depo dan faskes OSM, `2` fasilitas perantara OSM, `3` data genangan Damkar, `4` klasifikasi jalan,
`5` jarak faskes via OSRM, `6` merge `floods.csv` final, `7` matriks OSRM, `8` pipeline atribut SI dan matriks.
Folder `output_*` berisi hasil antara.

### 4.2 Skenario banjir

Skenario adalah klaster kejadian banjir; tiap skenario punya `floods.csv`, `distance_matrix.npy`, `time_matrix.npy`
(`backend/app/data/files/scenarios/<id>/`). Urutan node pada matriks: **[depo, genangan, IF]**.

| ID | Tanggal | Titik genangan | Ukuran matriks | Total beban (L) | Kedalaman (cm) min / median / maks | Distribusi kelas jalan |
|---|---|---|---|---|---|---|
| `s1-jan` | 11-12 Jan 2025 | 17 | 169 × 169 | 536.250 | 5 / 20 / 60 | 2:8, 3:7, 4:2 |
| `s2-jun` (bawaan) | 22-23 Jun 2026 | 34 | 186 × 186 | 921.875 | 5 / 20 / 50 | 1:3, 2:12, 3:10, 4:6, 5:3 |
| `s3-nov` | 9-12 Nov 2025 | 27 | 179 × 179 | 383.750 | 5 / 15 / 60 | 1:3, 2:16, 3:4, 4:3, 5:1 |

Kelas jalan (ordinal): 5 trunk/primary, 4 secondary, 3 tertiary, 2 residential, 1 service.
Total beban di atas memakai model beban saat ini (Bagian 6.4).

### 4.3 Pipeline pembuatan skenario

`scripts/build_scenario.py` dan modul `app/preprocessing/` mengotomatiskan: filter hari, klasifikasi jalan, jarak ke faskes
terdekat (via OSRM, bukan haversine), matriks jarak/waktu, dan kolom `volume_l`. Matriks disimpan di git agar aplikasi tidak
bergantung pada OSRM saat dijalankan. Satu kasus galat historis: matriks 184 × 184 padahal harusnya 185 × 185 (kurang satu
node IF), diperbaiki dengan membangun ulang (22 Agustus 2026).

Saat pengguna menambah titik baru lewat aplikasi, `scenario_edit.py` memperkaya titik itu (kelas jalan, jarak faskes, volume)
dan **menyisipkan baris/kolom ke matriks** tanpa membangun ulang seluruhnya. Jika OSRM tidak tersedia, setiap sel yang kosong
memakai jarak Manhattan dengan kecepatan 30 km/jam.

### 4.4 Sanitasi dan batas Surabaya

Semua koordinat divalidasi terhadap kotak batas Kota Surabaya: lintang `-7.38` sampai `-7.13`, bujur `112.58` sampai `112.87`.
Titik di luar kotak ditolak (di input) atau menyebabkan galat saat membangun instance.

---

## 5. Severity Index

Berkas: `app/severity/{ahp.py, entropy.py, index.py}`.

### 5.1 Kriteria

| Kriteria | Variabel | Jenis | Normalisasi |
|---|---|---|---|
| Tinggi genangan | `ketinggian_cm` | benefit (makin tinggi makin parah) | min-max |
| Kelas jalan | `road_class` (1-5) | benefit | min-max |
| Jarak ke faskes terdekat | `dist_faskes_m` | cost (makin dekat makin diprioritaskan) | min-max terbalik |

Nilai yang hilang diisi median (kedalaman, jarak faskes) atau 3 (kelas jalan).

### 5.2 Pembobotan

- **AHP**: vektor prioritas dari eigenvektor utama matriks perbandingan berpasangan 3 × 3; ada perhitungan *consistency ratio* (CR)
  (nilai negatif akibat galat numerik dijepit ke 0).
- **Entropy Weight**: bobot objektif dari matriks keputusan ternormalisasi tiap skenario.
- **Gabungan**: rata-rata `(w_AHP + w_EW) / 2` (mode alternatif: rata-rata geometrik, tidak dipakai bawaan).
- `SI = clip(matriks_keputusan @ bobot_gabungan, 0, 1)`.

Bobot yang dihasilkan data saat ini:

| Skenario | AHP (kedalaman / jalan / faskes) | Entropy | Gabungan | SI min / rata / maks |
|---|---|---|---|---|
| `s1-jan` | 0,500 / 0,333 / 0,167 | 0,269 / 0,562 / 0,169 | 0,384 / 0,448 / 0,168 | 0,034 / 0,394 / 0,852 |
| `s2-jun` | 0,500 / 0,333 / 0,167 | 0,484 / 0,336 / 0,180 | 0,492 / 0,335 / 0,173 | 0,055 / 0,459 / 0,909 |
| `s3-nov` | 0,500 / 0,333 / 0,167 | 0,468 / 0,408 / 0,125 | 0,484 / 0,370 / 0,146 | 0,172 / 0,349 / 0,706 |

> **PERINGATAN PENTING:** matriks perbandingan berpasangan AHP di kode adalah **placeholder** (rasio kedalaman : kelas jalan : faskes
> = 3 : 2 : 1, komentar kode: *"Replace with AHP weights from expert interviews when available"*). CR = 0 karena matriks dibangun dari
> rasio yang sempurna konsisten, bukan karena hasil penilaian pakar. Sebelum klaim "bobot AHP berdasarkan pakar" ditulis di bab,
> matriks ini harus diganti dengan hasil wawancara/kuesioner pakar.

### 5.3 Bobot kustom oleh pengguna

Pengguna dapat mengganti bobot gabungan dengan tiga bobot manual (nilai relatif, dinormalisasi di server). Bobot kustom
**menggantikan** campuran AHP + Entropy sepenuhnya. Endpoint `POST /api/severity-index` memberi pratinjau tanpa mengubah data,
dan parameter `severity_weights` pada permintaan optimasi memakai bobot yang sama. Faktor "jumlah penduduk terdampak" disediakan
sebagai butir terkunci di antarmuka karena **datanya belum ada** di dataset.

### 5.4 Pemakaian SI dalam algoritma

- Fungsi tujuan: `Z = Σ SI_j × t_j`.
- Informasi heuristik ACS: `η(i, j) = SI_j / d(i, j)` untuk titik genangan (hanya `1/d` untuk node lain).
- Penalti pekerjaan tersisa dibobot SI (Bagian 6.5).

---

## 6. Model optimasi

Berkas utama: `app/algorithms/instance.py` dan `evaluator.py`.

### 6.1 Notasi dan struktur

- Node terpadu: `[0..n_depo)` depo, `[n_depo .. +n_genangan)` titik genangan, sisanya IF.
- Kendaraan = pasangan `(depo, kapasitas)`; tiap kendaraan punya satu rute: depo → ... → depo.
- Matriks jarak (m) dan waktu (detik) dari OSRM, asimetris.

### 6.2 Dinamika waktu dan tangki

1. **Siaga penuh**: kendaraan memulai rute dengan tangki penuh. Konsekuensi: kunjungan pertama harus IF (kosongkan), baru memompa.
   (Perbaikan 17 September 2026; sebelumnya kendaraan dianggap mulai kosong sehingga IF tidak pernah dipakai.)
2. Memompa di titik genangan: waktu layanan = `60 s (SERVICE_SETUP_S) + volume_terpompa / 33,33 L/s`
   (debit pompa 2.000 L/menit dari wawancara).
3. Mengosongkan di IF: waktu = `120 s × faktor outlet`. Faktor: `river` 0,75 (sungai besar, lebih leluasa), `stream` 1,25 (kali kecil).
   Faktor ini adalah **asumsi** yang menerjemahkan pernyataan Damkar "lebih leluasa di sungai besar"; belum dikalibrasi data.
4. Tangki menjadi 0 setelah IF; tidak boleh melebihi kapasitas.
5. Kapasitas IF dianggap tidak terbatas (hanya waktu buang yang dimodelkan, bukan antrean).

### 6.3 Fungsi tujuan dan skor

- `Z = Σ_{kunjungan memompa} SI_j × waktu_tiba` (waktu tiba dihitung sejak armada berangkat, detik).
- `skor = Z + penalti`; semua kandidat solusi diperingkat dengan **skor** (bukan Z saja).
- `penalti = UNSERVED_PENALTY × Σ_j SI_j × (sisa_liter_j / debit_pompa) + HORIZON_PENALTY × detik_lembur`.
  - `UNSERVED_PENALTY = 500`. Konversi liter ke detik pemompaan menyamakan satuan dengan Z (severity-detik).
    Nilai dikalibrasi pada `s2-jun`: pada 100 solver puas dengan cakupan 99,3% padahal bisa lebih; pada 500 mereka menutupnya.
  - `HORIZON_PENALTY = 10^6` per detik (big-M): kru tidak bisa begitu saja bekerja lebih lama.
- Pembandingan ACS vs VNS **mendahulukan cakupan, lalu Z** (perbaikan 26 September 2026): solusi dengan Z lebih besar tapi cakupan
  lebih tinggi bisa lebih baik.

### 6.4 Model beban pompa per titik (geometri)

Berkas: `app/preprocessing/workload.py`, kolom `volume_l` di `floods.csv`.

```
volume (L) = lebar jalan (m) × panjang genangan (m) × kedalaman yang dibuang (m) × 1000
kedalaman yang dibuang = max(kedalaman terlapor − 10 cm, 5 cm)
```

| Parameter | Nilai | Dasar |
|---|---|---|
| Lebar jalan per kelas (1 sampai 5) | 3,5 / 5 / 7 / 10 / 14 m | Asumsi lebar jalur per kelas OSM |
| Panjang genangan (`PONDING_LENGTH_M`) | 25 m | Asumsi: satu laporan menandai satu kolam lokal; genangan lebih panjang dicatat sebagai beberapa titik |
| Batas aman (`SAFE_DEPTH_CM`) | 10 cm | Kru berhenti ketika jalan kembali bisa dilewati, bukan saat kering |
| Kedalaman efektif minimum | 5 cm | Titik yang sudah di bawah batas aman tetap dilaporkan dan dilayani |
| Kedalaman bawaan bila hilang | 20 cm | Median data |

Jumlah muatan (rit) per titik **diturunkan**: `volume / kapasitas tangki`. Ini menjawab pertanyaan penguji "berapa kali kendaraan
harus kembali". Total beban skenario `s2-jun`: 921.875 L (sekitar 230 muatan 4.000 L rata-rata).

Evolusi model beban (penting untuk narasi metodologi, lihat Bagian 8.1):

1. v1: `volume = kedalaman × 100 L/cm` (konstanta tanpa dasar). Median titik hanya 2.000 L, tidak ada titik yang memenuhi tangki, sehingga mekanisme IF praktis tidak aktif.
2. v2: dikalibrasi dari durasi penanganan di log Damkar (kelas kedalaman → median durasi, dikoreksi waktu bolak-balik ke IF). Menghasilkan beban 100 sampai 190 ribu liter per titik, terlalu besar.
3. v3 (sekarang): model geometri di atas. Alasan: log tidak mencatat luas genangan, tetapi lebar jalan dan kedalaman bisa diperoleh, dan hasilnya masuk akal dan dapat dijelaskan.

### 6.5 Kendala

Kendala keras (diperiksa evaluator, `validate_hard_constraints`):

| Kode | Isi |
|---|---|
| HC2 | Rute berawal dan berakhir di depo yang sama |
| HC3/HC4 | Isi tangki tidak melebihi kapasitas |
| HC5 | Tangki 0 setelah mengunjungi IF |
| HC6 | **Jangkauan dispatch**: titik hanya dilayani depo yang bisa mencapainya dalam batas waktu tempuh |
| HC7 | **Horizon**: durasi rute tidak melebihi jam operasional kendaraan itu |

Kendala lunak: **HC1 cakupan penuh** (semua beban terpompa) dijadikan penalti, bukan syarat kelayakan (Bagian 6.3).

Parameter kendala (dari data):

| Konstanta | Nilai | Sumber |
|---|---|---|
| Horizon rute (`ROUTE_HORIZON_S`) | 281 menit (4,7 jam) | **Median** durasi `berangkat → tiba_pangkalan` pada log Damkar (408 kejadian). Model tidak pernah diam (setiap detik adalah mengemudi, memompa, atau membuang), sehingga angka ini dipetakan ke satu penugasan tipikal. Dengan persentil 90 (517 menit) batas tidak pernah mengikat |
| Jangkauan dispatch (`DISPATCH_LIMIT_S`) | 7 menit | Waktu respons terlama di log (`respon_time`, median 7, 409 data). Titik yang tidak dijangkau depo mana pun dilayani depo terdekat sebagai cadangan; bila kru itu pun tidak mampu, titik terbawa ke periode berikutnya |
| Debit pompa | 2.000 L/menit | Wawancara Damkar |
| Setup layanan | 60 detik | Asumsi |
| Waktu buang IF | 120 detik × faktor 0,75/1,25 | Asumsi (Bagian 6.2) |
| Kecepatan cadangan | 30 km/jam | Dipakai bila OSRM tidak tersedia |

### 6.6 Fleksibilitas armada (fitur terbaru)

Armada dan jam operasional dapat diubah per permintaan tanpa mengubah kode:

- Tiap depo punya daftar `(kapasitas, jumlah)` dan `operating_minutes` (30 sampai 720 menit); bawaan 1 unit 3.000 L dan 1 unit 5.000 L, 281 menit.
- Solver memakai **horizon per kendaraan** (`Instance.horizon_of(k)`), bukan satu konstanta global.
- Validasi di backend: kapasitas 500 sampai 20.000 L, jumlah 0 sampai 10, armada kosong ditolak (HTTP 422).

### 6.7 Evaluator

`evaluate_solution` memutar ulang satu rute demi satu rute, sehingga rute berikutnya melihat volume sisa setelah rute sebelumnya.
`evaluate_incremental` hanya menghitung ulang rute yang mungkin terganggu oleh sebuah langkah local search: rute sebelum
`first_changed` dipakai ulang, dan begitu keadaan volume sama dengan evaluasi sebelumnya, seluruh rute sesudahnya juga dipakai ulang.
`prune_idle_stops` membuang kunjungan titik yang memompa 0 liter (hanya perjalanan, tidak mengurangi cakupan).

---

## 7. Algoritma: Hybrid ACS, VNS, dan local search

### 7.1 Hybrid Ant Colony System (metode utama)

Berkas: `app/algorithms/acs.py`. Parameter bawaan: 20 semut, α = 1, β = 1, ρ = 0,15, q0 = 0,70, batas atas iterasi 1.000
(anggaran waktu yang menentukan iterasi sebenarnya).

**Konstruksi solusi (satu semut).** Semua kendaraan dibangun bergantian dalam ronde:

1. Kendaraan dengan tangki penuh menuju IF terdekat (kosongkan).
2. Selainnya memilih titik berikutnya dari himpunan titik yang **boleh dilayani depo-nya** (jangkauan dispatch) dan masih punya volume,
   dengan aturan transisi pseudo-acak proporsional ACS: dengan peluang `q0` pilih argmax `τ^α · η^β`, selain itu pilih acak
   proporsional. `η = SI_j / d(i, j)`.
3. Langkah hanya diterima bila kendaraan masih sempat pulang ke depo dalam horizon-nya.
4. **Pembaruan feromon lokal** pada setiap sisi yang dipilih: `τ ← (1 − ρ)τ + ρτ0`.
5. Tidak ada fase "overflow" ke depo jauh: titik yang tidak terjangkau kru dalam jangkauan dibiarkan terbawa (dihitung penalti).

**Pembaruan feromon global**: hanya pada sisi solusi terbaik: evaporasi `τ ← (1 − ρ)τ`, lalu tambah `ρ / skor_terbaik` pada sisi rute terbaik.
`τ0 = 1 / (n_total × panjang_tetangga_terdekat)`.

**Hibrida dengan local search**: tiap iterasi, semut terbaik diperbaiki (repair, Bagian 7.4) lalu dipoles dengan local search.
Polish cepat tiap iterasi (2-opt + relocate), polish lengkap tiap 5 iterasi (ditambah or-opt dan exchange).
Di akhir, **polish dalam** (maks 10 ronde, semua operator) pada solusi terbaik memakai sisa waktu, ditutup repair terakhir dan `prune_idle_stops`.

### 7.2 Variable Neighborhood Search (pembanding)

Berkas: `app/algorithms/vns.py`. Parameter bawaan: `k_max = 3`, batas iterasi 1.000.

- **Solusi awal greedy** per kendaraan: titik terdekat berikutnya di antara titik dalam jangkauan depo, dibatasi horizon.
- **Shaking** pada lingkungan ke-k: k perturbasi acak dari tiga jenis: tukar dua perhentian dalam satu rute, pindah satu titik ke rute depo lain
  yang berhak, atau balik satu segmen rute.
- **Satu iterasi = satu siklus shake + polish** (2 ronde cepat). `k` direset ke 1 saat membaik; selain itu `k = k mod k_max + 1`.
- Polish dalam dan repair di akhir sama seperti ACS.

### 7.3 Local search (dipakai keduanya)

`app/algorithms/local_search.py`: 2-opt dalam rute, relocate antar rute, or-opt, exchange antar rute. Semua langkah diperiksa terhadap
kendala dispatch dan dievaluasi dengan evaluasi inkremental. Optimasi kinerja:

- **Daftar kandidat** (`CANDIDATE_K = 12` tetangga terdekat) membatasi pasangan yang dicoba.
- **Urutan sapuan acak** (`_order`) agar polish yang terpotong waktu tidak selalu menyisakan rute belakang tak tersentuh.
- **Deadline di dalam operator**, bukan hanya antar iterasi, agar anggaran waktu benar-benar dihormati pada beban berat.

### 7.4 Repair berbasis evaluator

Pembukuan volume konstruktor (bergantian antar kendaraan) berbeda dengan evaluator (satu rute sampai habis, baru rute berikutnya),
sehingga isi tangki berbeda dan ada sisa kecil yang tidak pernah terambil karena local search hanya memindah perhentian yang ada.
`_repair` menyisipkan pasangan (IF terdekat, titik) ke kendaraan **dalam jangkauan** dengan tambahan waktu terkecil yang masih
muat dalam horizon (dengan margin 60 detik). Tiga detik anggaran dicadangkan untuk repair penutup (`REPAIR_RESERVE_S`).

### 7.5 Anggaran waktu dan jatah polish

- Anggaran: 30, 45, atau 60 detik per algoritma (kartu "Cepat", "Standar", "Mendalam").
- Tiga bagian: pencarian iteratif; 25% (`final_polish_frac`) untuk polish dalam akhir; 3 detik untuk repair penutup.
- **Jatah polish per iterasi** (`polish_slice_s`): ACS 0,3 detik, VNS 0,5 detik. Iterasi tidak lagi membagi anggaran dengan batas iterasi;
  jumlah iterasi muncul dari anggaran. Dasar pemilihan di Bagian 10.2.

---

## 8. Perjalanan perbaikan model dan algoritma (kronologi masalah ke solusi)

Bagian ini penting untuk bab implementasi, pembahasan, dan keterbatasan: tiap entri adalah masalah nyata yang ditemukan,
penyebabnya, perbaikan, dan dampak terukur bila ada.

### 8.1 Model beban: dari konstanta ke geometri

- **Masalah:** `DEFAULT_VOLUME_PER_CM = 100` tanpa dasar; tidak ada titik yang memenuhi tangki, IF tidak aktif.
- **Upaya 1 (durasi Damkar):** beban dari durasi penanganan, dikoreksi porsi waktu bolak-balik ke IF (70 sampai 80% waktu di lokasi dihabiskan untuk perjalanan IF, bukan memompa). Hasil: beban 100 sampai 190 ribu L per titik, kelewat besar dan rute menjadi sangat panjang dan berulang (bolak-balik terlalu banyak).
- **Keputusan:** model geometri (Bagian 6.4), dapat dijelaskan ke penguji; beban total `s2-jun` 921.875 L.

### 8.2 Pembatalan hard constraint kunjungan penuh (masukan dosen)

- **Masalah:** syarat "semua beban harus terpompa" membuat solver melempar galat atau menerima solusi absurd pada beban berat.
- **Perbaikan:** jadikan soft constraint dengan penalti `UNSERVED_PENALTY × Σ SI × (sisa / debit)`; metrik cakupan dan sisa dilaporkan.
- **Dampak lanjutan:** peringkat ACS vs VNS mendahulukan cakupan karena Z saja menyesatkan (VNS pernah memiliki Z lebih tinggi tetapi cakupan lebih tinggi).

### 8.3 Horizon rute

- Tanpa horizon, solver membeli cakupan dengan rute panjang (rute 23 jam). Ditambahkan batas satu penugasan.
- Urutan nilai: pertama durasi terpanjang di log, lalu persentil 90 (517 menit, 8,6 jam), lalu **median 281 menit (4,7 jam)**. Persentil 90 terlalu longgar: batas tidak pernah mengikat dan rute berhenti di 8,6 jam; pengguna juga menilai "8 jam kerja terus-menerus tidak masuk akal".
- Ditemukan solver melampaui horizon sedikit; solusi: `HORIZON_PENALTY` sebesar big-M `10^6` dan margin repair 60 detik. Pelanggaran HC7 pada hasil akhir: 0 pada semua run benchmark (Bagian 10).
- Bug terkait: konstruktor VNS membatasi tiap rute maksimal 3 kunjungan (`max(3, n_floods*2 // n_vehicles)`), membuat VNS runtuh ke 14,8% cakupan. Diganti pembatas berbasis horizon.

### 8.4 Jangkauan dispatch

- **Masalah:** separuh kunjungan pompa berasal dari depo yang jauhnya lebih dari 7 menit (hingga 27 menit), karena fase overflow dan repair menerima kendaraan mana pun.
- **Perbaikan:** `DISPATCH_LIMIT_S = 7 menit`; setiap titik punya himpunan depo yang berhak (`eligible_depots`); bila tidak ada, dipakai depo terdekat. Berlaku di konstruksi, shaking, relocate/exchange, dan repair (HC6). Akibatnya tidak semua depo dikerahkan (pada `s2-jun` ada depo yang jauh dari semua genangan).

### 8.5 Pembukuan konstruktor vs evaluator

- **Masalah:** ACS tidak pernah mencapai 100% cakupan meski waktu cukup; sisa 6.829 liter yang tidak terlihat konstruktor.
- **Penyebab:** perbedaan urutan pembukuan volume (Bagian 7.4).
- **Perbaikan:** repair berbasis evaluator di ACS dan VNS dengan cadangan waktu 3 detik; pemilihan kendaraan sadar-horizon (menguji kelayakan semua kandidat, bukan hanya satu yang terdekat).

### 8.6 Konvergensi dan metrik yang menyesatkan

- Kurva konvergensi memplot Z saja sedangkan solver mengurutkan pada skor; kurva dan hasil akhir tidak bertemu. Diubah memplot `best_score` dan `iter_best_score`, dan titik akhir disamakan dengan hasil yang dilaporkan.
- Fallback penjaga NaN: titik berjarak 0 (koordinat kembar) membuat heuristik tak hingga; jarak diberi lantai 1 m.

### 8.7 Kinerja: iterasi terlalu sedikit

- **Gejala:** ACS hanya sekitar 5,7 iterasi per 45 detik (target 20 sampai 40); VNS hanya 2 iterasi. Pembelajaran feromon nyaris tidak berjalan.
- **Penyebab utama:** tiap iterasi memoles sampai selesai; evaluasi seluruh solusi untuk setiap langkah (O(rute × perhentian)); pemindaian pasangan penuh.
- **Perbaikan berlapis:** (1) **evaluasi delta** (hanya rute terdampak); (2) **daftar kandidat**; (3) **urutan sapuan acak**; (4) **jatah polish per iterasi** dengan polish dalam di akhir; (5) deadline di dalam operator; (6) untuk VNS, satu iterasi menjadi satu siklus shake-polish dengan k dibawa antar siklus.
- **Hasil:** ACS 30 sampai 36 iterasi dan VNS 31 sampai 53 iterasi dalam 45 detik, tanpa penurunan Z yang bisa dibedakan dari derau antar seed (Bagian 10.2).
- Hipotesis keliru yang dikoreksi lewat uji multi-seed: "membuang relocate mempercepat" hanya derau satu seed; "daftar kandidat mempercepat" tidak terbukti karena rute mengulang node yang sama.

### 8.8 Peringatan proses ("backend basi")

Berulang kali tampilan menunjukkan hasil lama karena proses `uvicorn` yatim menahan port 8000 atau dua tumpukan berjalan bersamaan. Ditambahkan endpoint `/health` yang melaporkan `commit` (dibaca sekali saat impor), `started_at`, jenis sumber beban, dan total beban, sehingga proses basi bisa dikenali.

### 8.9 Model tangki siaga penuh

Awalnya kendaraan dimodelkan mulai kosong sehingga IF tidak pernah dikunjungi sebelum memompa. Menurut Damkar, kendaraan siaga di pangkalan sudah berisi air; maka rute selalu mulai dengan IF. Test regresi ditambahkan untuk ACS dan VNS (`tangki awal = kapasitas`).

---

## 9. Fitur aplikasi

### 9.1 Mode dan tata letak

- **Mode**: *Simple* (rute + severity, parameter algoritma tersembunyi) dan *Analitik* (parameter algoritma, grafik konvergensi, penalti, revisit). Perpindahan mode dianimasikan (tinggi dan opasitas).
- **Layout** `fullscreen`: peta penuh dengan panel melayang (kiri: algoritma dan dock; kanan: hasil). **Layout** `windowed`: dasbor dengan header, sidebar kiri (algoritma, lapisan peta, data, kelola, legenda), peta di tengah dengan panel detail di bawahnya, kolom hasil di kanan yang bisa di-scroll. Pilihan layout diingat antar kunjungan.
- Tombol sembunyikan semua panel; kontrol zoom dan kompas; legenda severity dan penanda.
- **Mobile**: peta penuh, bilah bawah berisi hasil dan tombol Jalankan; tombol persegi di kanan (kompas, zoom, Lapisan, Data, Kelola, Legenda) membuka lembar dari bawah. Panel detail menggantikan bilah bawah agar tidak bertumpuk.

### 9.2 Peta

- Marker genangan berwarna sesuai SI (5 kelas), ukuran mengikuti tinggi genangan, berdenyut bila SI ≥ 0,6. Marker depo, IF, faskes dengan ikon berbeda. Choropleth beban keparahan per kecamatan.
- Hover menampilkan tooltip ringkas; klik membuka **panel detail** (selanjutnya).
- Rute digambar per kendaraan dengan warna stabil (24 warna dari pencuplikan titik terjauh di ruang CIELAB, indeks = slot kendaraan, sehingga kendaraan sama berwarna sama antar run). Animasi kendaraan opsional. Klik garis rute membuka detail rute.
- Basemap dapat diganti (empat pilihan, tanpa kunci API).

### 9.3 Panel detail (genangan, depo, sungai, faskes, rute)

Satu kerangka panel dengan animasi tinggi dan fade saat berpindah:

- **Genangan**: lokasi, peringkat severity, estimasi beban dengan dasar perhitungan (lebar × panjang × kedalaman), status pelayanan (belum ada rencana, tidak dilayani, sebagian, tuntas), log kendaraan yang datang beserta waktu dan volume.
- **Depo**: jumlah kendaraan dikerahkan, titik dilayani, volume dipompa, rute terlama, tabel armada.
- **Sungai/IF**: tipe air, jumlah dan volume pembuangan, log pembuangan per kendaraan.
- **Faskes**: genangan di sekitar (radius 1 km), terdekat, severity tertinggi, daftar yang dapat diklik.
- **Rute**: waktu, jarak, volume, kontribusi Z, urutan kunjungan yang dikelompokkan per **siklus isi-buang** ("Siklus 3 dari 29", "Pembuangan akhir"); tombol **Google Maps** (membangun tautan arah dengan titik unik berurutan, maksimal 9 titik singgah) dan salin tautan.

### 9.4 Hasil optimasi

- Ringkasan: skor respons (Z), total jarak, total waktu, titik dilayani, **cakupan pemompaan** (bar dengan warna sesuai tingkat), penalti dan revisit (mode analitik).
- Tab **Rute** (daftar per depo, sembunyikan/tampilkan, fokus), **Periode**, **Belum tuntas**, **Beban**, **Severity** (tabel SI dan bobot).
- Grafik konvergensi (mode analitik) dan panel perbandingan ACS vs VNS (tombol "Bandingkan").
- **Ekspor PDF**: sampul dengan kartu angka, tabel rincian, catatan, titik belum tuntas dan saran, tabel rute dengan baris total, rincian kunjungan per kendaraan dengan kolom siklus, nomor halaman.
- **Ekspor Excel** (penulis XLSX sendiri, divalidasi dengan openpyxl): lembar Ringkasan, Rute, Kunjungan, Per Genangan, Belum Tuntas, Saran, Keseimbangan, Periode (bila ada), Konvergensi, dengan format angka, filter, dan baris beku.

### 9.5 Titik belum tuntas, alasan, dan saran

`app/algorithms/diagnosis.py`. Untuk tiap titik dengan sisa pekerjaan, alasan utama:

| Kode | Arti | Cara menentukan |
|---|---|---|
| `no_unit` | Tanpa unit | Tidak ada kendaraan di depo yang berhak melayani titik itu |
| `out_of_range` | Di luar jangkauan | Depo terdekat lebih jauh dari batas dispatch (7 menit) |
| `far` | Jarak jauh | Satu siklus ke titik itu memakan lebih dari 40% jam kerja kru |
| `priority` | Prioritas rendah | Kru yang menjangkaunya kehabisan waktu dan SI titik di bawah median titik terlayani |
| `capacity` | Kapasitas habis | Kru yang menjangkaunya habis jam operasionalnya |
| `unscheduled` | Belum dijadwalkan | Sisa waktu kru masih cukup menampung sisanya |

Saran dihitung dengan skenario *what-if*: **tambah 1 unit** (tangki terbesar yang ada) di depo yang menjangkau titik terbuka, atau **perpanjang jam
operasional 60 menit** di depo yang kru-nya sudah ≥ 90% terpakai; lalu repair ACS menaruh sisa pekerjaan pada kapasitas tambahan.
Keluaran: cakupan sebelum dan sesudah, titik yang tersisa. Ini **perkiraan batas bawah** (rencana tidak dioptimasi ulang), dan antarmuka
menyatakannya. Tombol "Terapkan" langsung mengubah pengaturan armada. Contoh hasil pada `s2-jun`: tambah 1 unit di Pos Kali Rungkut
menaikkan cakupan dari 91,5% ke 100%; perpanjang jam 60 menit ke 95,8%.

### 9.6 Keseimbangan beban

Tab **Beban** dan lembar Excel: rute terpanjang (*makespan*) beserta kendaraannya dan persen jam kerja, rata-rata dan simpangan durasi rute,
pemakaian jam kerja (rata-rata dan tertinggi), kendaraan aktif vs menganggur, sebaran beban antar kendaraan (diagram batang, koefisien **Gini**
dan koefisien variasi, dihitung di antara kendaraan yang **bekerja**, karena kendaraan yang menganggur sering semata-mata karena tidak ada
titik dalam jangkauan depo), dan tabel per depo (rute aktif, kunjungan, volume dipompa, rute terlama, pemakaian jam).

### 9.7 Perencanaan multi-periode (rolling horizon)

- Sisa volume per titik pada periode k menjadi pekerjaan periode k+1 (`remaining_volumes`), dengan armada penuh kembali dan anggaran komputasi sama.
- Periode berikutnya dimulai saat kru terakhir periode sebelumnya pulang (jam sejak awal ditampilkan).
- Tab **Periode**: bar kemajuan kumulatif bersegmen per periode, linimasa dengan lencana angka berwarna, tiap periode menampilkan Masuk, Terpompa, Sisa,
  jumlah kendaraan, titik tuntas dan terbuka. Tombol **Periode berikutnya** dan **Selesaikan semua** (maksimal 6 periode). Klik periode untuk melihat rutenya di peta.
- Asumsi yang dinyatakan di antarmuka: tinggi air dianggap tidak berubah antar periode (tidak ada surut alami).
- Uji manual: periode 1 menyisakan 78.750 L pada 3 titik; periode 2 memompa seluruhnya dengan 2 kendaraan, kumulatif 100% dalam 2 periode (sekitar 6 jam 49 menit).

### 9.8 Pengaturan optimasi

Dock **Kelola** dan dialog **Konfigurasi Optimasi** (perubahan baru berlaku setelah *Terapkan*):

- **Armada & Depo**: dua ukuran tangki (A dan B, bawaan 3.000 dan 5.000 L), jumlah unit per depo (0 sampai 10), jam operasional per depo, "terapkan ke semua", atur ulang per baris, ringkasan total unit dan muatan. Validasi dan pesan galat per baris.
- **Prioritas Keparahan**: pilih bobot bawaan (AHP + Entropy) atau kustom dengan tiga slider, preset ("Seimbang", "Utamakan tinggi air", "jalan utama", "faskes"), bar persentase hidup, butir "Penduduk terdampak" terkunci.
- Pengaturan tersimpan di peramban dan dikirim bersama tiap permintaan optimasi.

### 9.9 Input titik genangan baru

- **Klik di peta**: banner dan kursor crosshair, pin yang bisa diseret, panel isian (tinggi wajib, volume opsional, deskripsi) dengan validasi langsung dan pesan galat server (mis. duplikat).
- **Unggah CSV**: seret-lepas, templat unduhan, deteksi pemisah koma atau titik koma, alias nama kolom, pratinjau per baris (Siap, perlu diperbaiki, peringatan), impor berurutan dengan hasil per baris. Maksimal 60 baris.
- **Validasi**: koordinat dalam Surabaya; tinggi 1 sampai 300 cm (peringatan di atas 150 cm); volume 0 sampai 2.000.000 L; deskripsi maks 200 karakter; titik dalam 10 m dari titik lama ditolak (di klien dan server).
- Severity dihitung otomatis dari tinggi, kelas jalan, dan jarak faskes; kolom `severity` pada CSV diabaikan dengan catatan.
- Titik baru yang ditambah **menulis ke berkas data skenario** (dan matriks); sama seperti tabel data yang sudah ada.

### 9.10 Peringatan jalankan ulang

Setiap hasil menyimpan *sidik jari* pengaturan saat dijalankan (armada, prioritas, parameter algoritma, anggaran waktu, data). Bila berbeda dari kondisi sekarang, muncul banner kuning
yang menyebut kelompok yang berubah, tombol run berubah menjadi "Jalankan Ulang Optimasi", dan di mobile muncul banner satu baris. Hasil lama yang tersimpan tanpa sidik jari tidak diberi banner.

### 9.11 Detail UX lain

Tooltip dan klik pada marker, panel data (dock Data dengan jumlah dan waktu pembaruan, tombol muat ulang, tabel data yang dapat diedit/hapus/tambah), pemilih skenario, indikator
waktu komputasi dan bilah progres, toast penyelesaian, aksesibilitas dasar (`aria-*`, tombol Esc), gerak halus pada semua perubahan panel dengan dukungan `prefers-reduced-motion`.

---

## 10. Hasil eksperimen

### 10.1 Perbandingan ACS vs VNS pada tiga skenario

Pengaturan: anggaran 45 detik per run, armada bawaan (24 kendaraan), bobot SI bawaan (AHP + Entropy), kode pada commit `ded9ed8`, **3 seed per sel** (seed 1, 2, 3).
Data mentah per run ada di `report.md` bagian ini (angka per seed) dan dapat direproduksi dengan `HybridACS(inst, ACSParams(seed=s, time_limit_s=45))` dan `VNS(inst, VNSParams(...))`.
Tanda ± adalah simpangan baku populasi antar 3 seed. "Skor" = Z + penalti (dasar peringkat solver). Pelanggaran kendala keras (HC2 sampai HC7) pada hasil akhir: **0** pada ke-18 run.

| Skenario | Algoritma | Z rata-rata (± SD) | Skor rata-rata | Cakupan rata-rata | Iterasi | Kendaraan terpakai | Rute terpanjang (menit) |
|---|---|---|---|---|---|---|---|
| `s1-jan` (17 titik) | ACS | 381.183 ± 3.282 | 496.861 | 96,95% | 50 | 14,0 | 279,5 |
| `s1-jan` | VNS | 455.586 ± 10.636 | 548.856 | 97,20% | 63 | 9,3 | 279,2 |
| `s2-jun` (34 titik) | ACS | 912.247 ± 3.365 | 1.519.298 | 92,09% | 34 | 14,0 | 279,2 |
| `s2-jun` | VNS | 995.230 ± 14.373 | 1.561.349 | 92,22% | 52 | 11,0 | 280,7 |
| `s3-nov` (27 titik) | ACS | 138.432 ± 1.143 | 138.432 | 100,00% | 58 | 14,0 | 165,3 |
| `s3-nov` | VNS | 246.187 ± 12.911 | 246.187 | 100,00% | 64 | 8,7 | 267,4 |

Nilai per seed (Z; cakupan %):

| Skenario | ACS seed 1 / 2 / 3 | VNS seed 1 / 2 / 3 |
|---|---|---|
| `s1-jan` | 385.825 / 378.904 / 378.821; 96,83 / 97,39 / 96,64 | 456.653 / 442.059 / 468.047; 97,20 / 97,20 / 97,20 |
| `s2-jun` | 908.440 / 916.624 / 911.677; 92,00 / 92,33 / 91,95 | 985.754 / 984.395 / 1.015.542; 92,11 / 92,22 / 92,33 |
| `s3-nov` | 139.539 / 136.859 / 138.899; 100 / 100 / 100 | 241.667 / 233.127 / 263.767; 100 / 100 / 100 |

Pembacaan yang jujur dari tabel ini:

- **`s3-nov`** (beban ringan, cakupan 100% kedua algoritma): ACS menghasilkan Z sekitar **44% lebih rendah** daripada VNS, dan rute terpanjangnya jauh lebih pendek (165 vs 267 menit). Selisihnya jauh melebihi sebaran antar seed.
- **`s2-jun`** (beban berat, horizon mengikat, cakupan sekitar 92% pada keduanya): cakupan praktis sama (selisih 0,13 poin persen, lebih kecil dari sebaran antar seed); ACS punya Z sekitar **8% lebih rendah** dan hasil lebih stabil (SD 3.365 vs 14.373).
- **`s1-jan`**: VNS menutup sedikit lebih banyak beban (97,20% vs 96,95%, selisih 0,25 poin persen, VNS tepat sama pada ketiga seed), sedangkan ACS punya Z sekitar **16% lebih rendah** dan skor (Z + penalti) sekitar **9,5% lebih rendah**. Jika peringkat mendahulukan cakupan (aturan sistem: cakupan dulu, lalu Z), VNS unggul tipis di skenario ini; jika memakai skor gabungan, ACS unggul. Ini harus dibahas apa adanya, bukan disembunyikan.
- ACS memakai 14 kendaraan pada semua skenario; VNS hanya 9 sampai 11. Itu menunjukkan ACS menyebar kerja ke lebih banyak kru (rute lebih pendek dan titik parah dijangkau lebih awal), sedangkan VNS memadatkan pekerjaan pada kendaraan lebih sedikit.
- Keterbatasan: hanya 3 seed, satu mesin, satu anggaran waktu, tanpa uji signifikansi statistik. Jangan menulis "ACS lebih baik secara signifikan" tanpa menambah seed dan uji (misalnya Wilcoxon).

### 10.2 Pemilihan jatah polish per iterasi (sweep)

Skenario `s2-jun`, anggaran 45 detik, 3 seed per baris (seed 1, 2, 3). Cakupan sekitar 92% pada semua baris. Detail di `docs/iterasi-vs-kualitas.md`.

| Algoritma | Jatah polish | Iterasi | Z rata-rata |
|---|---|---|---|
| ACS | 0,3 s | 36 | 908.593 |
| ACS | 0,5 s | 30 | 909.017 |
| ACS | 0,8 s | 25 | 889.365 |
| ACS | 1,2 s | 19 | 908.789 |
| ACS | 2,0 s | 14 | 885.781 |
| VNS | 0,5 s | 53 | 997.558 |
| VNS | 1,0 s | 31 | 990.561 |
| VNS | 2,0 s | 16 | 999.363 |

Kesimpulan: selisih Z antar jatah masih di dalam sebaran antar seed (kira-kira ±3%), sehingga jatah pendek (lebih banyak iterasi) dipilih karena tidak ada penurunan kualitas yang terukur.
Catatan metodologi: hanya 3 seed per titik; untuk klaim statistik gunakan lebih banyak seed (misalnya 10) pada ketiga skenario.

### 10.3 Contoh hasil satu run `s2-jun` (anggaran 45 detik)

Contoh nyata dari antarmuka: skor respons ≈ 0,92 jt, total jarak ≈ 880 km, 14 kendaraan, 38 sampai 39 jam total waktu, cakupan ≈ 92%, sisa sekitar 72.000 sampai 78.000 L pada 3 sampai 6 titik.
Rute terpanjang sekitar 4 jam 38 menit hingga 4 jam 40 menit (99% jam kerja), dengan 14 dari 24 kendaraan terpakai (sisanya berasal dari depo di luar jangkauan semua titik atau tidak kebagian pekerjaan).

---

## 11. Pengujian dan verifikasi

### 11.1 Otomatis (backend)

`pytest`: **69 kasus uji lulus**, tersebar pada berkas:

| Berkas | Fokus |
|---|---|
| `test_store.py` | Pemuatan data, manifest skenario, invalidasi |
| `test_matrix_ops.py` | Sisip/ganti/hapus baris-kolom matriks |
| `test_scenario_filter.py` | Penyaringan skenario per tanggal |
| `test_severity.py` | AHP, entropy, SI |
| `test_algorithms.py`, `test_incremental_eval.py` | ACS/VNS, kesetaraan evaluasi inkremental dengan evaluasi penuh |
| `test_soft_constraint.py` | Penalti, cakupan, horizon, dispatch, standby penuh, anggaran waktu, repair, jumlah iterasi |
| `test_fleet_and_weights.py` | Armada kustom, horizon per kendaraan, bobot SI kustom, validasi input, duplikat titik |
| `test_diagnosis.py` | Alasan belum tuntas, saran, metrik keseimbangan, Gini, bawa sisa antar periode |
| `test_api.py` | Endpoint (kesehatan, skenario, data, severity, optimasi) |

Catatan: dua uji bergantung waktu (jumlah iterasi minimum dalam 15 detik) sempat gagal intermiten karena panjang iterasi bervariasi (seed sama menghasilkan 8 dan 14 iterasi pada dua kali jalan); ambang dilonggarkan (VNS 6, ACS 10), cukup untuk menjaga dari kegagalan lama (2 iterasi).

### 11.2 Frontend

`tsc --noEmit` bersih (TypeScript strict). `eslint` menyisakan beberapa galat lama kategori `react-hooks/set-state-in-effect` pada pola hidrasi (belum dirapikan) dan satu peringatan komponen di `toast.tsx`.
Tidak ada uji otomatis frontend (belum ada kerangka uji komponen).

### 11.3 Verifikasi manual

Setiap fitur UI dicoba di peramban (pane pratinjau) lewat inspeksi DOM, klik terprogram, dan tangkapan layar pada viewport desktop dan mobile (375 × 812).
Beberapa hal tidak bisa diverifikasi langsung karena pane tersembunyi (transisi CSS tidak berjalan): kualitas gerak animasi diperiksa lewat keadaan akhir, bukan lintasan.

---

## 12. Kronologi pengembangan

Berdasarkan riwayat git (102 commit, 11 Juli sampai 6 Oktober 2026).

| Periode | Pencapaian |
|---|---|
| 11 Jul 2026 | Inisialisasi repositori dan penggabungan frontend |
| 17-18 Jul | Perbaikan layout dan interaksi; ACS memakai seluruh kendaraan; integrasi data; peta choropleth; refaktor CSS ke Tailwind; konfigurasi deploy Vercel monorepo |
| 18 Agu | Perbaikan timeout OSRM (pooling koneksi, batch, cadangan Manhattan); constraint penugasan depo-genangan geometris; panah arah rute dan animasi kendaraan; mode sederhana menyembunyikan parameter |
| 21-22 Agu | Kelas jalan (C2) masuk SI; jarak faskes dari OSRM terhitung; matriks OSRM disimpan di git; perbaikan matriks 185 × 185 |
| 15 Sep | Revisi dasbor (PR #1): CR dijepit nol, warna rute, kesegaran data, grafik, tooltip, basemap Esri tanpa kunci, layout berjendela, penjaga NaN pada heuristik, satuan liter |
| 17 Sep | Tangki siaga penuh; panel dapat disembunyikan; helper `localStorage` |
| 23-25 Sep | Backend sadar skenario (store, manifest, pipeline build, pemilih skenario); pengayaan titik baru dengan pembaruan matriks langsung; suite pytest pertama; **soft constraint** (penalti); anggaran waktu di dalam local search; waktu buang per IF |
| 26 Sep | Peringkat cakupan dulu; horizon rute (p90 lalu median); beban dari log Damkar; repair berbasis evaluator; endpoint kesehatan; perbaikan kurva konvergensi; daftar kandidat; haul dari volume genangan; **evaluasi delta** |
| 1 Okt | Batas dispatch 7 menit; anggaran waktu dibagi ke iterasi; kartu anggaran komputasi 30/45/60; warna per kendaraan |
| 5 Okt | Panel detail genangan, depo, sungai, faskes, rute; ekspor Excel; layout berjendela menyatu; Google Maps; PDF dan Excel dirapikan; jatah polish tetap; animasi mode; legenda di sidebar; tata letak mobile |
| 6 Okt | Armada dan bobot prioritas dapat diatur; input titik genangan (peta dan CSV); diagnosis titik belum tuntas dan saran; keseimbangan beban; perencanaan multi-periode; label siklus; peringatan jalankan ulang |

---

## 13. Keterbatasan dan hal yang tidak boleh diklaim

### 13.1 Asumsi model yang belum tervalidasi

1. **Matriks AHP adalah placeholder** (Bagian 5.2). Bobot AHP bukan hasil pakar. Jangan menulis "AHP berdasarkan penilaian pakar" sebelum diganti.
2. **Model beban geometri** memakai asumsi lebar jalan per kelas, panjang genangan 25 m, dan batas aman 10 cm. Tidak ada data lapangan yang memvalidasi volume terhadap pemompaan sebenarnya. Analisis sensitivitas (panjang genangan 25/50/100 m, skala beban) **belum dilakukan** (ditunda atas keputusan pengguna).
3. **Faktor waktu buang IF** (0,75 sungai, 1,25 kali) adalah asumsi dari pernyataan kualitatif Damkar; kapasitas IF dianggap tak terbatas dan tidak ada antrean.
4. **Horizon 281 menit** adalah median log; ada kejadian lebih panjang (p90 517 menit). Rute model tidak pernah diam (tanpa istirahat, tanpa menunggu).
5. **Batas dispatch 7 menit** diambil dari waktu respons terlama di log; pembatasan ini membuat sebagian depo tak terpakai. Jarak/waktu bergantung pada OSRM publik (lalu lintas tidak dimodelkan).
6. **Periode berikutnya** dimodelkan dengan volume tetap (tidak ada surut air, tidak ada genangan baru) dan armada penuh kembali.
7. **Saran perbaikan** adalah perkiraan batas bawah (repair tanpa optimasi ulang), bukan jaminan.

### 13.2 Metodologi eksperimen

- Hasil benchmark dan sweep memakai **3 seed** per kondisi; belum ada uji signifikansi statistik. Perbedaan kecil (di bawah sekitar 3%) tidak boleh diklaim sebagai keunggulan.
- Anggaran waktu menentukan kualitas (algoritma anytime); hasil bergantung pada kecepatan mesin dan beban CPU. Satu uji pytest menunjukkan jumlah iterasi bervariasi 8 sampai 14 pada seed yang sama.
- Hanya satu sampel kejadian per skenario (tiga skenario); generalisasi ke kejadian lain belum diuji.
- Pembobotan `UNSERVED_PENALTY = 500` dikalibrasi pada `s2-jun`, bukan pada ketiganya.

### 13.3 Cakupan sistem

- Tidak ada autentikasi, multi-pengguna, atau basis data; pengubahan data (tambah titik, edit tabel) **menulis langsung ke berkas CSV skenario** yang dipakai bersama.
- Tidak ada pelacakan posisi kendaraan nyata, tidak ada data lalu lintas langsung, tidak ada integrasi dengan sistem Damkar.
- Faktor "jumlah penduduk terdampak" belum ada karena datanya tidak ada.
- Tidak ada uji otomatis frontend; verifikasi UI manual.
- Beberapa galat eslint lama (`set-state-in-effect`) belum dirapikan.
- Aturan awal proyek menyebut larangan `localStorage`; kode sekarang memakainya untuk kenyamanan (bukan untuk logika inti).

### 13.4 Dokumen lain yang tidak lagi akurat

- `docs/beban-pemompaan.md`: masih menguraikan model beban v2 (durasi Damkar) dan horizon 8,6 jam; **sudah digantikan** model geometri dan horizon 4,7 jam. Gunakan Bagian 6 dan 8 laporan ini.
- `notebooks/Bab5_Implementasi.md`: draf Bab 5 yang ditulis sebelum soft constraint, beban geometri, horizon, dispatch, evaluasi delta, repair, anggaran waktu bersliced, dan seluruh fitur UI baru. Bagian pustaka, pengumpulan data, SI, dan ACS/VNS dasar masih relevan sebagai kerangka tetapi **perlu disesuaikan**.
- `PRD.md` dan `AGENT.md` mendeskripsikan rancangan awal (satu skenario, tanpa panel detail dan diagnosis).

### 13.5 Terminologi yang konsisten

- Gunakan "titik genangan", "depo (pos pemadam)", "IF / titik buang air / fasilitas perantara (sungai, kali)".
- "Cakupan" = persen beban pompa yang terpompa pada periode itu; "kumulatif" = terhadap beban awal seluruh periode.
- "Makespan" = durasi rute terpanjang (kru terakhir pulang).

---

## 14. Lampiran

### 14.1 Parameter dan konstanta penting

| Nama | Nilai | Berkas |
|---|---|---|
| `VEHICLE_CAPACITIES_L` | 3.000 dan 5.000 (1 unit tiap depo) | `instance.py` |
| `PUMP_RATE_LPS` | 2000/60 ≈ 33,33 L/detik | `instance.py` |
| `SERVICE_SETUP_S` | 60 detik | `instance.py` |
| `IF_DRAIN_S` dan `IF_DRAIN_FACTOR` | 120 detik; river 0,75, stream 1,25 | `instance.py` |
| `ROUTE_HORIZON_S` | 281 × 60 detik | `instance.py` |
| `DISPATCH_LIMIT_S` | 7 × 60 detik | `instance.py` |
| `CANDIDATE_K` | 12 | `instance.py` |
| `HORIZON_PENALTY` | 10^6 | `instance.py` |
| `UNSERVED_PENALTY` | 500 | `instance.py` |
| `ROAD_WIDTH_M` | {1: 3,5; 2: 5; 3: 7; 4: 10; 5: 14} | `workload.py` |
| `PONDING_LENGTH_M`, `SAFE_DEPTH_CM`, `MIN_EFFECTIVE_DEPTH_CM` | 25 m, 10 cm, 5 cm | `workload.py` |
| ACS bawaan | 20 semut, α 1, β 1, ρ 0,15, q0 0,70, iterasi maks 1.000, `final_polish_frac` 0,25, jatah polish 0,3 s | `acs.py` |
| VNS bawaan | `k_max` 3, iterasi maks 1.000, `final_polish_frac` 0,25, jatah polish 0,5 s | `vns.py` |
| `REPAIR_RESERVE_S`, `REPAIR_MARGIN_S` | 3 detik, 60 detik | `acs.py`, `vns.py` |
| Anggaran komputasi | 30 / 45 / 60 detik | frontend |
| Batas input | tinggi 1 sampai 300 cm, volume 0 sampai 2.000.000 L, duplikat < 10 m, impor maks 60 baris | `data.py`, `flood-input.ts` |
| Batas armada | tangki 500 sampai 20.000 L, unit 0 sampai 10, jam operasional 30 sampai 720 menit | `optimization.py`, `fleet.ts` |
| Periode maksimum | 6 | `use-optimization.ts` |

### 14.2 Struktur berkas utama (frontend)

```
frontend/src/
  app/                 globals.css (token, animasi), layout, halaman
  components/
    app-shell.tsx      orkestrasi state dan layout
    layouts/windowed-layout.tsx
    map/               peta, marker, kontrol, dock lapisan/data/legenda, pick-layer, draft-marker
    sidebar/           panel algoritma, hasil, rute, detail (genangan/depo/sungai/faskes/rute), periode, belum tuntas, beban, stale-banner
    manage/            dock Kelola, dialog konfigurasi, editor armada, editor prioritas, dialog impor CSV
    results-dock.tsx   kartu hasil dengan tab
  hooks/               use-map-data, use-optimization, use-algorithm-config, use-fleet-config, use-priority, use-persistent-state, use-presence
  lib/                 api, export-report (PDF/Excel), xlsx, fleet, priority, periods, run-signature, route-cycles, gmaps, flood-input, csv, ...
  types/index.ts       tipe bersama (mencerminkan skema Pydantic)
```

### 14.3 Cara menjalankan

```
# Backend
cd backend
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
.venv/Scripts/python.exe -m pytest

# Frontend
cd frontend
npm run dev        # port 3000
npm run build
npx tsc --noEmit
```

Pemeriksaan proses backend yang benar-benar baru: `GET /health` (lihat `commit` dan `started_at`).

### 14.4 Daftar istilah

| Istilah | Arti |
|---|---|
| MDCVRP-IF-SI | Multi-Depot Capacitated Vehicle Routing Problem with Intermediate Facilities and Severity Index |
| ACS | Ant Colony System; Hybrid ACS = ACS + local search + repair |
| VNS | Variable Neighborhood Search |
| IF | Intermediate Facility: titik buang air (sungai/kali) tempat tangki dikosongkan |
| SI | Severity Index: bobot urgensi titik genangan, 0 sampai 1 |
| AHP / EW | Analytic Hierarchy Process / Entropy Weight |
| Makespan | Durasi rute terpanjang |
| Siklus | Satu putaran: kosongkan di IF lalu isi di titik genangan |
| Rolling horizon | Perencanaan periode demi periode; sisa pekerjaan menjadi masukan periode berikutnya |
| Cakupan | Persentase beban pompa yang sudah terpompa |
| Soft constraint | Pelanggaran dikenai penalti pada fungsi tujuan, bukan menjadikan solusi tidak layak |

### 14.5 Saran pemetaan ke bab tugas akhir (untuk penulis)

- **Bab 3 (metodologi / perancangan)**: Bagian 2, 4, 5, 6 (model), alur pengumpulan data, rancangan arsitektur (Bagian 3).
- **Bab 4 (perancangan sistem)**: Bagian 3, 9 (kebutuhan dan fitur), desain antarmuka (`DESIGN.md`).
- **Bab 5 (implementasi)**: Bagian 3, 4.3, 7, 9, 14; sesuaikan draf `notebooks/Bab5_Implementasi.md` dengan Bagian 8 (banyak perubahan model).
- **Bab 6 (pengujian dan hasil)**: Bagian 10, 11; sertakan tabel benchmark dan sweep.
- **Bab 7 (pembahasan)**: Bagian 8 (pelajaran dari perbaikan), 13 (keterbatasan), dan interpretasi benchmark.
