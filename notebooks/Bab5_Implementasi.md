# BAB 5 IMPLEMENTASI

Bab ini memaparkan detail teknis implementasi seluruh komponen tugas akhir,
meliputi lingkungan pengembangan, pengumpulan data, konstruksi Severity
Index, algoritma Hybrid Ant Colony System, algoritma Variable Neighborhood
Search, dan pengembangan aplikasi website.

## 5.1 Lingkungan Implementasi

Sistem diimplementasikan dengan arsitektur klien-server terpisah. Sisi
backend menangani seluruh komputasi numerik serta eksekusi algoritma
optimasi, sedangkan sisi frontend berperan sebagai antarmuka visualisasi
peta dan panel konfigurasi. Pemisahan ini memastikan tidak ada beban
komputasi berjalan pada peramban pengguna. Bahasa utama untuk backend
adalah Python versi 3.12, sedangkan sisi frontend menggunakan TypeScript
di atas kerangka kerja Next.js versi 16 dengan App Router. Server backend
dijalankan menggunakan Uvicorn pada port 8000 dengan FastAPI sebagai
kerangka kerja REST. Server frontend berjalan pada port 3000 dan
berkomunikasi dengan backend melalui HTTP dengan payload JSON. Rincian
pustaka utama beserta versi minimum ditampilkan pada Tabel 5.1.

Tabel 5.1 Pustaka Utama Lingkungan Implementasi

| Komponen | Pustaka | Versi Minimum |
|----------|---------|---------------|
| Backend  | FastAPI                | 0.115  |
|          | Uvicorn                | 0.32   |
|          | NumPy                  | 2.0    |
|          | pandas                 | 2.2    |
|          | httpx                  | 0.27   |
|          | Pydantic               | 2.9    |
| Frontend | Next.js                | 16.2.10 |
|          | React                  | 19.2.4 |
|          | Tailwind CSS           | 4      |
|          | Leaflet                | 1.9.4  |
|          | react-leaflet          | 5.0    |
|          | Recharts               | 3.9    |
|          | jspdf, jspdf-autotable | 4.2, 5.0 |

## 5.2 Implementasi Pengumpulan Data

Empat kelas data yang dibutuhkan sistem meliputi titik genangan, depo
pemadam kebakaran, fasilitas perantara (IF), dan fasilitas kesehatan.
Seluruh data disimpan dalam berkas CSV yang dimuat sekali pada saat
startup FastAPI melalui hook `lifespan`. Setiap dataset yang dimuat
melewati sanitasi koordinat berupa konversi tipe numerik, perbaikan kolom
`Longitude` yang kehilangan titik desimal, serta penyaringan bounding
box Kota Surabaya (`-7.38 ≤ lat ≤ -7.13`, `112.58 ≤ lon ≤ 112.87`).
Baris yang berada di luar bounding box dibuang agar tidak mencemari
matriks jarak. Pada Algoritma 5.1 ditunjukkan hook `lifespan` yang
memuat seluruh dataset ke memori pada startup.

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    import app.data as data

    if (DATA_DIR / "floods.csv").exists():
        data.flood_points = _load_floods(DATA_DIR / "floods.csv")
    if (DATA_DIR / "depo.csv").exists():
        data.depots = _load_depots(DATA_DIR / "depo.csv")
    if (DATA_DIR / "if.csv").exists():
        data.ifs = _load_ifs(DATA_DIR / "if.csv")
    if (DATA_DIR / "faskes.csv").exists():
        data.faskes = _load_faskes(DATA_DIR / "faskes.csv")
    if (DATA_DIR / "distance_matrix.npy").exists():
        data.distance_matrix = np.load(DATA_DIR / "distance_matrix.npy")
    if (DATA_DIR / "time_matrix.npy").exists():
        data.time_matrix = np.load(DATA_DIR / "time_matrix.npy")

    yield
```

**Algoritma 5.1** Hook lifespan yang memuat seluruh dataset pada startup

Fungsi `_bbox_filter` menerapkan sanitasi bounding box terhadap semua
dataset yang termuat. Baris yang berada di luar rentang koordinat Kota
Surabaya dibuang dan jumlah baris yang dibuang dicatat pada log agar
dapat diaudit. Implementasi fungsi ini tampak pada Algoritma 5.2.

```python
def _bbox_filter(df: pd.DataFrame, label: str) -> pd.DataFrame:
    mask = (
        (df["lat"] >= SBY_LAT_MIN)
        & (df["lat"] <= SBY_LAT_MAX)
        & (df["lon"] >= SBY_LON_MIN)
        & (df["lon"] <= SBY_LON_MAX)
    )
    n_dropped = int((~mask).sum())
    if n_dropped > 0:
        import logging
        logging.getLogger("response.data").warning(
            "%s: dropped %d row(s) outside Surabaya bbox", label, n_dropped,
        )
    return df[mask].reset_index(drop=True)
```

**Algoritma 5.2** Sanitasi bounding box Kota Surabaya

### 5.2.1 API PetaBencana.id

Data titik genangan bersumber dari arsip laporan PetaBencana.id periode
2020 hingga 2024 yang dikumpulkan sebelum runtime aplikasi melalui
endpoint publik `data.petabencana.id/reports` dengan filter Kota Surabaya.
Kolom yang diekstraksi meliputi `Datetime`, `Latitude`, `Longitude`,
`Deskripsi`, `Images`, dan `Ketinggian (cm)`. Hasil pengumpulan disimpan
sebagai berkas `floods.csv` yang menjadi input tetap sistem. Nilai kolom
`Ketinggian (cm)` yang kosong tidak dihapus melainkan diisi dengan nilai
median pada tahap perhitungan Severity Index sehingga jumlah titik yang
dilayani tidak berkurang. Pada Algoritma 5.3 ditunjukkan fungsi pemuatan
data titik genangan.

```python
def _load_floods(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df.rename(
        columns={
            "Datetime": "datetime",
            "Latitude": "lat",
            "Longitude": "lon",
            "Deskripsi": "deskripsi",
            "Images": "images",
            "Ketinggian (cm)": "ketinggian_cm",
        }
    )
    df["ketinggian_cm"] = pd.to_numeric(df["ketinggian_cm"], errors="coerce")
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
    df = df.dropna(subset=["lat", "lon"]).reset_index(drop=True)
    df["lon"] = df["lon"].apply(_fix_longitude)
    df = _bbox_filter(df, "floods")
    df.insert(0, "id", [f"F_{i:04d}" for i in range(len(df))])
    return df
```

**Algoritma 5.3** Pemuatan data titik genangan

Fungsi `_fix_longitude` memperbaiki kesalahan pengetikan pada arsip
PetaBencana.id ketika kolom `Longitude` kehilangan titik desimal sehingga
nilai tertulis sebagai bilangan bulat enam digit. Implementasi fungsi ini
tampak pada Algoritma 5.4.

```python
def _fix_longitude(val: float) -> float:
    if val > 1000:
        s = str(int(round(val)))
        if s.startswith("112"):
            return float(s[:3] + "." + s[3:])
    return val
```

**Algoritma 5.4** Perbaikan kesalahan pengetikan kolom Longitude

### 5.2.2 Web Scraping

Sumber tambahan berasal dari scraping portal berita lokal Kota Surabaya
untuk periode ketika PetaBencana.id tidak memiliki laporan. Skrip
scraping dijalankan di luar runtime FastAPI sebagai proses preprocessing
satu arah. Alur kerja meliputi pengambilan halaman berita, ekstraksi teks
konten berdasarkan selector HTML setiap portal, identifikasi nama lokasi
genangan menggunakan pencocokan kata kunci nama kelurahan, geocoding nama
lokasi menjadi koordinat melalui Nominatim, dan ekstraksi estimasi
kedalaman dari teks yang berisi satuan sentimeter atau meter yang
dinormalkan ke sentimeter. Hasil scraping yang lolos validasi silang
bounding box digabung ke dalam berkas `floods.csv` bersama data
PetaBencana.id disertai kolom `Deskripsi` yang mempertahankan kutipan
sumber sebagai jejak audit.

### 5.2.3 Query OSRM

OSRM dimanfaatkan untuk dua kebutuhan berbeda pada titik waktu berbeda.
Pertama, matriks jarak dan matriks waktu antar seluruh simpul (depo,
genangan, IF) yang di-precompute dan disimpan sebagai `distance_matrix.npy`
serta `time_matrix.npy` pada direktori data. Kedua, geometri polyline
mengikuti jaringan jalan untuk visualisasi rute pada peta yang di-query
secara on-the-fly setelah setiap optimasi selesai. Fungsi pengambilan
geometri jalan ditunjukkan pada Algoritma 5.5. Waypoint dibagi menjadi
chunk berukuran maksimum 100 titik agar tidak melebihi batas request
OSRM.

```python
def fetch_road_geometry(
    waypoints: list[tuple[float, float]],
) -> list[list[float]] | None:
    if len(waypoints) < 2:
        return None

    chunks = _chunk_waypoints(waypoints, MAX_WAYPOINTS_PER_REQUEST)
    full_geometry: list[list[float]] = []

    try:
        with httpx.Client(timeout=OSRM_TIMEOUT_S) as client:
            for chunk in chunks:
                coords_str = ";".join(f"{lon},{lat}" for lat, lon in chunk)
                url = (
                    f"{OSRM_BASE}/route/v1/driving/{coords_str}"
                    f"?overview=full&geometries=geojson&steps=false"
                )
                resp = client.get(url)
                if resp.status_code != 200:
                    _log.warning(
                        "OSRM returned %d for %d waypoints",
                        resp.status_code, len(chunk),
                    )
                    return None

                data = resp.json()
                if data.get("code") != "Ok" or not data.get("routes"):
                    return None

                geojson_coords = data["routes"][0]["geometry"]["coordinates"]
                segment = [[c[1], c[0]] for c in geojson_coords]
                if full_geometry:
                    segment = segment[1:]
                full_geometry.extend(segment)

    except Exception as exc:
        _log.warning("OSRM request failed: %s", exc)
        return None

    return full_geometry
```

**Algoritma 5.5** Pengambilan geometri jalan dari OSRM

Bila permintaan gagal karena OSRM tidak dapat dihubungi atau
mengembalikan kode selain `Ok`, fungsi mengembalikan `None` dan
visualisasi peta jatuh ke polyline garis lurus antar simpul. Bila
`distance_matrix.npy` tidak tersedia (misalnya pada tahap pengembangan
awal atau ketika OSRM lokal belum diset), sistem otomatis membangun
matriks jarak berbasis Manhattan yang lebih tepat dibanding haversine
karena topologi jaringan jalan Kota Surabaya bersifat grid. Implementasi
matriks Manhattan ditampilkan pada Algoritma 5.6.

```python
def manhattan_matrix(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    lat_r = np.deg2rad(lats.astype(float))
    lon_r = np.deg2rad(lons.astype(float))

    avg_lat = np.mean(lat_r)
    cos_avg = np.cos(avg_lat)

    dlat = np.abs(lat_r[:, None] - lat_r[None, :])
    dlon = np.abs(lon_r[:, None] - lon_r[None, :]) * cos_avg

    return EARTH_RADIUS_M * (dlat + dlon)
```

**Algoritma 5.6** Matriks jarak Manhattan sebagai fallback

Matriks waktu diturunkan langsung dari matriks jarak dengan asumsi
kecepatan kota rata-rata 30 km per jam melalui pembagian sederhana yang
tampak pada Algoritma 5.7.

```python
def time_matrix_from_distance(
    dist_m: np.ndarray, speed_mps: float = CITY_SPEED_MPS
) -> np.ndarray:
    return dist_m / speed_mps
```

**Algoritma 5.7** Konversi matriks jarak menjadi matriks waktu

### 5.2.4 Ekstraksi Data OSM

Tiga kelas data yaitu depo pemadam kebakaran, fasilitas perantara, dan
fasilitas kesehatan diekstraksi dari OpenStreetMap menggunakan API
Overpass. Skrip ekstraksi tidak dijalankan pada runtime aplikasi melainkan
sebagai preprocessing yang menghasilkan berkas CSV siap pakai. Depo
pemadam kebakaran diperoleh dengan tag `amenity=fire_station` yang
berlokasi dalam bounding box Surabaya. Fasilitas perantara diambil dari
titik perpotongan geometris antara garis air (tag `waterway`) dengan
jalan arteri (tag `highway=trunk`, `primary`, atau `secondary`). Fasilitas
kesehatan diambil dengan tag `amenity=hospital`, `amenity=clinic`, atau
`amenity=doctors`.

Pada Algoritma 5.8 ditunjukkan fungsi pemuatan data depo yang menambahkan
prefix identifier `D_` pada kolom `osm_id` dan menyaring bounding box.
Kapasitas kendaraan tidak disimpan pada berkas CSV melainkan didefinisikan
sebagai konstanta `VEHICLE_CAPACITIES_L = [3000, 5000]` di dalam modul
instance, dan setiap depo diperlengkapi satu unit kendaraan per tipe
kapasitas.

```python
def _load_depots(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df.rename(columns={"addr:city": "city"})
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lon"] = pd.to_numeric(df["lon"], errors="coerce")
    df = df.dropna(subset=["lat", "lon"]).reset_index(drop=True)
    df = _bbox_filter(df, "depots")
    df["id"] = ["D_" + str(x) for x in df["osm_id"].astype(str)]
    return df
```

**Algoritma 5.8** Pemuatan data depo dari hasil ekstraksi OSM

Fungsi `_load_ifs` dan `_load_faskes` mengikuti pola yang serupa yakni
konversi tipe numerik pada kolom koordinat, penyaringan bounding box,
dan pembangkitan identifier dengan prefix masing-masing `IF_` dan `H_`.

## 5.3 Implementasi Konstruksi Severity Index

Konstruksi Severity Index diimplementasikan pada modul severity dengan
dua kriteria yang dapat diturunkan langsung dari dataset yang telah
dikumpulkan yaitu kedalaman genangan `depth_cm` sebagai kriteria benefit
dan jarak ke fasilitas kesehatan terdekat `dist_faskes_m` sebagai
kriteria cost. Kriteria klasifikasi jalan yang direncanakan pada
proposal belum diaktifkan karena tag highway pada titik genangan masih
dalam proses refinement. Struktur kode dirancang agar penambahan
kriteria berikutnya tidak memerlukan perubahan pada modul lain.

Pada tahap penulisan bab ini wawancara AHP kepada narasumber Dinas
Pemadam Kebakaran belum dilaksanakan sehingga matriks perbandingan
berpasangan sementara memakai asumsi domain intuition dengan rasio
kedalaman terhadap kedekatan faskes sebesar 3 banding 1. Nilai matriks
akan digantikan dengan hasil wawancara aktual pada versi final tanpa
perubahan struktur kode. Definisi konstanta matriks pairwise ditampilkan
pada Algoritma 5.9.

```python
CRITERIA = ["depth_cm", "dist_faskes_m"]

PAIRWISE = np.array(
    [
        [1.0, 3.0],
        [1.0 / 3.0, 1.0],
    ]
)
```

**Algoritma 5.9** Konstanta matriks perbandingan berpasangan AHP

Perhitungan bobot AHP menggunakan metode eigenvektor prinsipal seperti
tampak pada Algoritma 5.10. Vektor prioritas diambil dari eigenvektor
yang berpasangan dengan eigenvalue terbesar, kemudian dinormalisasi
sehingga jumlahnya sama dengan satu.

```python
def ahp_weights(pairwise: np.ndarray) -> np.ndarray:
    m = np.asarray(pairwise, dtype=float)
    if m.ndim != 2 or m.shape[0] != m.shape[1]:
        raise ValueError("pairwise must be a square matrix")
    eigvals, eigvecs = np.linalg.eig(m)
    idx = int(np.argmax(eigvals.real))
    vec = np.abs(eigvecs[:, idx].real)
    total = vec.sum()
    if total == 0:
        raise ValueError("degenerate pairwise matrix - zero eigenvector")
    return vec / total
```

**Algoritma 5.10** Perhitungan bobot AHP dengan eigenvektor prinsipal

Konsistensi matriks perbandingan berpasangan diukur menggunakan
`Consistency Ratio` (CR) sesuai formulasi Saaty. Nilai CR yang lebih
kecil atau sama dengan 0.10 menandakan matriks tergolong konsisten.
Perhitungan CR ditampilkan pada Algoritma 5.11.

```python
def consistency_ratio(pairwise: np.ndarray) -> float:
    m = np.asarray(pairwise, dtype=float)
    n = m.shape[0]
    if n < 3:
        return 0.0
    eigvals, _ = np.linalg.eig(m)
    lambda_max = eigvals.real.max()
    ci = (lambda_max - n) / (n - 1)
    ri = RANDOM_INDEX.get(n)
    if ri is None or ri == 0:
        return 0.0
    return float(ci / ri)
```

**Algoritma 5.11** Perhitungan Consistency Ratio

Perhitungan bobot Entropy Weight mengikuti formulasi entropi Shannon
yang dinormalisasi terhadap `ln(n_alternatif)`. Kriteria dengan tingkat
diversifikasi tinggi (nilai entropi rendah) memperoleh bobot lebih
besar. Implementasi ditampilkan pada Algoritma 5.12.

```python
def entropy_weights(data: np.ndarray) -> np.ndarray:
    m = np.asarray(data, dtype=float)
    if m.ndim != 2:
        raise ValueError("data must be a 2-D matrix")
    n_rows, n_cols = m.shape
    if n_rows < 2:
        return np.full(n_cols, 1.0 / n_cols)

    col_sums = m.sum(axis=0)
    col_sums = np.where(col_sums == 0, 1.0, col_sums)
    p = m / col_sums

    with np.errstate(divide="ignore", invalid="ignore"):
        log_p = np.where(p > 0, np.log(p), 0.0)
    k = 1.0 / np.log(n_rows)
    e = -k * (p * log_p).sum(axis=0)
    e = np.clip(e, 0.0, 1.0)

    d = 1.0 - e
    total = d.sum()
    if total == 0:
        return np.full(n_cols, 1.0 / n_cols)
    return d / total
```

**Algoritma 5.12** Perhitungan bobot Entropy Weight

Alur keseluruhan perhitungan Severity Index menggabungkan normalisasi
kriteria, kombinasi bobot AHP dan Entropy Weight, serta agregasi
menjadi nilai SI akhir sesuai Persamaan 2.14 dan Persamaan 2.15 pada
Bab 2. Fungsi utama ditampilkan pada Algoritma 5.13. Fungsi ini
mengembalikan objek `SeverityResult` yang berisi tiga vektor bobot,
nilai SI per titik, dan nilai `Consistency Ratio` matriks pairwise.

```python
def compute_severity_index(
    floods: pd.DataFrame,
    faskes: pd.DataFrame,
    combine: Literal["average", "geometric"] = "average",
) -> SeverityResult:
    if len(floods) == 0:
        return SeverityResult(
            weights_ahp=np.array([]),
            weights_ew=np.array([]),
            weights_combined=np.array([]),
            si_values=np.array([]),
            per_point=[],
            consistency_ratio=0.0,
        )

    depths = floods["ketinggian_cm"].to_numpy(dtype=float)
    depths = np.where(
        np.isnan(depths),
        np.nanmedian(depths[~np.isnan(depths)])
        if np.any(~np.isnan(depths)) else 20.0,
        depths,
    )
    dist_faskes = _distance_to_nearest_faskes(floods, faskes)

    norm_depth = _normalize_benefit(depths)
    norm_dist = _normalize_cost(dist_faskes)
    decision_matrix = np.column_stack([norm_depth, norm_dist])

    w_ahp = ahp_weights(PAIRWISE)
    w_ew = entropy_weights(decision_matrix + 1e-9)

    if combine == "geometric":
        combined = np.sqrt(w_ahp * w_ew)
        combined = combined / combined.sum()
    else:
        combined = (w_ahp + w_ew) / 2.0

    si = decision_matrix @ combined
    si = np.clip(si, 0.0, 1.0)

    per_point: list[dict[str, float | str]] = []
    ids = floods["id"].tolist()
    for i, node_id in enumerate(ids):
        per_point.append(
            {
                "id": str(node_id),
                "si_value": float(si[i]),
                "depth_cm": float(depths[i]),
                "dist_faskes_m": float(dist_faskes[i]),
            }
        )

    return SeverityResult(
        weights_ahp=w_ahp,
        weights_ew=w_ew,
        weights_combined=combined,
        si_values=si,
        per_point=per_point,
        consistency_ratio=consistency_ratio(PAIRWISE),
    )
```

**Algoritma 5.13** Alur keseluruhan perhitungan Severity Index

## 5.4 Implementasi Algoritma Hybrid Ant Colony System

Algoritma Hybrid ACS diimplementasikan sebagai kelas `HybridACS`.
Parameter algoritma direpresentasikan sebagai dataclass `ACSParams`
dengan nilai default `iterations = 60`, `n_ants = 20`, `alpha = 1.0`,
`beta = 1.0`, `rho = 0.15`, `q0 = 0.70`, dan `time_limit_s = 45`.
Nilai default ini adalah hasil kalibrasi awal yang masih dalam tahap
tuning. Definisi dataclass ditampilkan pada Algoritma 5.14.

```python
@dataclass
class ACSParams:
    iterations: int = 60
    n_ants: int = 20
    alpha: float = 1.0
    beta: float = 1.0
    rho: float = 0.15
    q0: float = 0.70
    seed: int | None = None
    time_limit_s: float | None = 45.0
```

**Algoritma 5.14** Dataclass parameter Hybrid ACS

Instance masalah dibangun sekali per panggilan API oleh fungsi
`build_instance` yang menggabungkan indeks depo, titik genangan, dan IF
ke dalam satu ruang indeks tunggal berukuran
`n_total = n_depots + n_floods + n_ifs` sehingga matriks jarak, matriks
waktu, dan matriks feromon dapat dialamatkan secara seragam. Volume tiap
titik genangan diturunkan dari `ketinggian_cm` dengan koefisien 100 liter
per sentimeter dan lantai minimum setara 5 sentimeter agar volume tidak
nol. Setiap depo diperlengkapi dua kendaraan yakni satu berkapasitas
3000 liter dan satu berkapasitas 5000 liter. Laju pompa ditetapkan 1000
liter per menit, waktu setup layanan 60 detik, dan waktu pengurasan
pada IF 120 detik.

### 5.4.1 Inisialisasi Feromon dan Parameter

Feromon awal `tau_0` dihitung berdasarkan estimasi panjang tour
nearest-neighbour agar sebanding dengan skala jarak instance. Matriks
feromon diinisialisasi seragam dengan nilai `tau_0`. Selain matriks
feromon, sistem menyiapkan matriks bantu `inv_dist` untuk mempercepat
evaluasi heuristik, vektor `node_si` yang memetakan indeks simpul global
ke nilai SI, dan array `nearest_depot` yang menyimpan depo terdekat bagi
setiap titik genangan untuk mendukung soft constraint proksimitas. Pada
Algoritma 5.15 ditampilkan konstruktor kelas yang menjalankan seluruh
langkah inisialisasi tersebut.

```python
class HybridACS:
    DEPOT_PROXIMITY_BONUS = 3.0

    def __init__(self, instance: Instance, params: ACSParams):
        self.inst = instance
        self.p = params
        self._rng = random.Random(params.seed)
        self._np_rng = np.random.default_rng(params.seed)

        n_total = instance.n_total
        d = instance.dist_matrix.copy()
        np.fill_diagonal(d, np.inf)
        nn_len = float(d.min(axis=1).mean() * (instance.n_floods + 1))
        self.tau0 = 1.0 / max(n_total * nn_len, 1.0)
        self.pheromone = np.full((n_total, n_total), self.tau0)
        with np.errstate(divide="ignore"):
            self.inv_dist = 1.0 / np.where(d == np.inf, 1.0, d)

        self.node_si = np.zeros(n_total)
        for k, fi in enumerate(instance.flood_indices):
            self.node_si[fi] = instance.si_values[k]

        self._flood_set: set[int] = set(instance.flood_indices)
        self._flood_lookup: dict[int, int] = {
            fi: k for k, fi in enumerate(instance.flood_indices)
        }

        if instance.n_depots > 0 and instance.n_floods > 0:
            depot_nodes = np.array(instance.depot_indices, dtype=int)
            flood_nodes = np.array(instance.flood_indices, dtype=int)
            sub = instance.dist_matrix[np.ix_(flood_nodes, depot_nodes)]
            self.nearest_depot = depot_nodes[np.argmin(sub, axis=1)]
        else:
            self.nearest_depot = np.zeros(instance.n_floods, dtype=int)
```

**Algoritma 5.15** Konstruktor kelas HybridACS

Heuristik `eta` mengikuti formulasi Persamaan 2.16 dengan modifikasi
bonus proksimitas depo. Untuk simpul tujuan berupa titik genangan,
`eta` dihitung sebagai `SI_j / d(i, j)` dan dikalikan konstanta
`DEPOT_PROXIMITY_BONUS = 3.0` jika depo terdekat titik tersebut sama
dengan depo asal kendaraan yang sedang dibangun. Untuk simpul tujuan
berupa IF, `eta` disederhanakan menjadi `1 / d(i, r)` karena IF tidak
memiliki nilai SI. Implementasi fungsi tersebut ditampilkan pada
Algoritma 5.16.

```python
def _eta(self, i: int, j: int, home_depot: int) -> float:
    if j in self._flood_set:
        base = self.node_si[j] * self.inv_dist[i, j]
        k = self._flood_lookup[j]
        if int(self.nearest_depot[k]) == home_depot:
            return base * self.DEPOT_PROXIMITY_BONUS
        return base
    return self.inv_dist[i, j]
```

**Algoritma 5.16** Perhitungan heuristik eta dengan bonus proksimitas depo

### 5.4.2 Konstruksi Solusi

Konstruksi solusi memakai skema round-robin sehingga seluruh kendaraan
bergiliran menambahkan satu simpul per putaran. Skema ini menggantikan
konstruksi sekuensial pada versi awal yang menyebabkan kendaraan pertama
menghabiskan pool titik genangan dan kendaraan berikutnya menghasilkan
rute kosong. Round-robin menjamin distribusi beban lebih merata dan
menekan akumulasi waktu kedatangan `t_j` yang memengaruhi Persamaan 2.9.

Aturan transisi menggunakan pseudorandom-proportional (Persamaan 2.17).
Diberikan bilangan acak `q` yang berdistribusi seragam pada 0 sampai 1,
kendaraan memilih kandidat dengan skor `tau^alpha * eta^beta` terbesar
bila `q < q0` (eksploitasi), sebaliknya kandidat dipilih secara
probabilistik dengan distribusi proporsional terhadap skor (eksplorasi).
Fungsi pemilihan simpul berikutnya ditampilkan pada Algoritma 5.17.

```python
def _choose_next(
    self,
    current: int,
    candidates: list[int],
    home_depot: int,
) -> int:
    assert candidates
    tau = self.pheromone[current, candidates]
    eta = np.array([self._eta(current, j, home_depot) for j in candidates])
    score = (tau ** self.p.alpha) * (eta ** self.p.beta)
    if self._rng.random() < self.p.q0:
        return int(candidates[int(np.argmax(score))])

    total = score.sum()
    if total <= 0:
        return int(self._rng.choice(candidates))
    probs = score / total
    idx = int(self._np_rng.choice(len(candidates), p=probs))
    return int(candidates[idx])
```

**Algoritma 5.17** Aturan transisi pseudorandom-proportional

Pemicu kunjungan IF terjadi saat muatan tangki mencapai kapasitas,
sehingga kendaraan wajib mengunjungi IF terdekat sebelum melanjutkan
pemompaan. Mekanisme multi-visit pada Persamaan 2.1 diakomodasi melalui
variabel `volumes_left` yang berkurang inkremental setiap kunjungan
hingga habis. Pada Algoritma 5.18 ditampilkan konstruksi rute untuk
satu semut yang mengintegrasikan seluruh mekanisme tersebut.

```python
def _construct_one_ant(self) -> tuple[list[list[int]], list[int]]:
    n_vehicles = len(self.inst.vehicles)
    volumes_left = self.inst.volumes.copy()

    depots = [self.inst.vehicles[vi][0] for vi in range(n_vehicles)]
    capacities = [self.inst.vehicles[vi][1] for vi in range(n_vehicles)]
    routes: list[list[int]] = [[depots[vi]] for vi in range(n_vehicles)]
    tanks = [0.0] * n_vehicles

    order = list(range(n_vehicles))
    self._rng.shuffle(order)

    max_rounds = self.inst.n_floods * 2 + self.inst.n_ifs + 5

    for _round in range(max_rounds):
        if not np.any(volumes_left > 0.5):
            break
        made_progress = False
        for vi in order:
            served_now = [
                fi for k, fi in enumerate(self.inst.flood_indices)
                if volumes_left[k] > 0.5
            ]
            if not served_now:
                break
            cur = routes[vi][-1]
            cap = capacities[vi]

            if tanks[vi] >= cap - 1e-3:
                nearest_if = self._nearest(cur, self.inst.if_indices)
                routes[vi].append(nearest_if)
                self._local_update(cur, nearest_if)
                tanks[vi] = 0.0
                made_progress = True
                continue

            nxt = self._choose_next(cur, served_now, home_depot=depots[vi])
            slot = self._flood_lookup[nxt]
            free = cap - tanks[vi]
            pump = float(min(volumes_left[slot], free))
            if pump <= 0:
                continue
            volumes_left[slot] -= pump
            tanks[vi] += pump
            routes[vi].append(nxt)
            self._local_update(cur, nxt)
            made_progress = True
        if not made_progress:
            break

    for vi in range(n_vehicles):
        if routes[vi][-1] != depots[vi]:
            self._local_update(routes[vi][-1], depots[vi])
            routes[vi].append(depots[vi])

    return routes, capacities
```

**Algoritma 5.18** Konstruksi rute satu semut dengan skema round-robin

### 5.4.3 Pembaruan Feromon Lokal

Pembaruan feromon lokal (Persamaan 2.19) dilakukan segera setelah setiap
perpindahan simpul agar semut berikutnya dalam iterasi yang sama
cenderung mengeksplorasi busur berbeda. Skema simetris diterapkan karena
masalah bersifat undirected dari sudut pandang jarak, sehingga
`tau[j, i]` selalu disamakan dengan `tau[i, j]`. Implementasi ringkas
ditampilkan pada Algoritma 5.19.

```python
def _local_update(self, i: int, j: int) -> None:
    self.pheromone[i, j] = (
        (1 - self.p.rho) * self.pheromone[i, j] + self.p.rho * self.tau0
    )
    self.pheromone[j, i] = self.pheromone[i, j]
```

**Algoritma 5.19** Pembaruan feromon lokal

### 5.4.4 Local Search Intra-Rute

Local search intra-rute dijalankan pada modul pencarian lokal. Operator
`two_opt` melakukan pembalikan segmen `[i, j]` dalam satu rute dan
menerima perubahan jika `Z` menurun serta seluruh volume genangan tetap
terlayani. Strategi first-improvement digunakan dengan batas
`max_passes = 5` per rute agar biaya komputasi terkendali. Implementasi
tampak pada Algoritma 5.20.

```python
def two_opt(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_z: float,
    max_passes: int = 5,
) -> tuple[list[list[int]], float]:
    best_routes = [list(r) for r in routes]
    best_z = current_z
    for ri, route in enumerate(best_routes):
        if len(route) <= 3:
            continue
        for _pass in range(max_passes):
            improved = False
            for i in range(1, len(route) - 2):
                for j in range(i + 1, len(route) - 1):
                    candidate = list(route)
                    candidate[i : j + 1] = reversed(candidate[i : j + 1])
                    trial = [list(x) for x in best_routes]
                    trial[ri] = candidate
                    ev = evaluate_solution(inst, trial, capacities)
                    if (
                        all_floods_served(ev.remaining_volume)
                        and ev.objective_z + 1e-9 < best_z
                    ):
                        best_routes = trial
                        route = candidate
                        best_z = ev.objective_z
                        improved = True
                        break
                if improved:
                    break
            if not improved:
                break
    return best_routes, best_z
```

**Algoritma 5.20** Operator two-opt intra-rute

Operator `or_opt` memindahkan segmen berisi 1 sampai 2 simpul flood
berurutan ke posisi lain baik antar-rute maupun dalam rute yang sama.
Batas panjang segmen 2 dipilih agar or-opt tetap komplementer terhadap
`relocate` tanpa meledakkan ruang pencarian. Implementasi ditampilkan
pada Algoritma 5.21.

```python
def or_opt(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_z: float,
    max_seg_len: int = 2,
    max_passes: int = 3,
) -> tuple[list[list[int]], float]:
    best_routes = [list(r) for r in routes]
    best_z = current_z
    for seg_len in range(1, max_seg_len + 1):
        for _pass in range(max_passes):
            improved = False
            for a in range(len(best_routes)):
                if len(best_routes[a]) < 2 + seg_len:
                    continue
                for i in range(1, len(best_routes[a]) - seg_len):
                    seg = best_routes[a][i : i + seg_len]
                    if not all(_is_flood(inst, n) for n in seg):
                        continue
                    for b in range(len(best_routes)):
                        if a == b:
                            continue
                        for j in range(1, len(best_routes[b])):
                            trial = [list(r) for r in best_routes]
                            trial[a] = trial[a][:i] + trial[a][i + seg_len :]
                            trial[b] = trial[b][:j] + seg + trial[b][j:]
                            ev = evaluate_solution(inst, trial, capacities)
                            if (
                                all_floods_served(ev.remaining_volume)
                                and ev.objective_z + 1e-9 < best_z
                            ):
                                best_routes = trial
                                best_z = ev.objective_z
                                improved = True
                                break
                        if improved:
                            break
                    if improved:
                        break
                if improved:
                    break
            if not improved:
                break
    return best_routes, best_z
```

**Algoritma 5.21** Operator or-opt untuk segmen 1 sampai 2 simpul

### 5.4.5 Local Search Inter-Rute

Operator inter-rute meliputi `relocate_between_routes` dan `exchange`.
Operator relocate memindahkan satu kunjungan flood dari rute A ke posisi
sisip pada rute B. Strategi first-improvement dipakai agar iterasi
berjalan cepat, dan implementasi memakai salinan dangkal hanya pada dua
rute yang berubah, bukan deep copy seluruh solusi, sehingga biaya per
trial berkurang signifikan pada instance dengan banyak kendaraan.
Implementasi ditampilkan pada Algoritma 5.22.

```python
def relocate_between_routes(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_z: float,
) -> tuple[list[list[int]], float]:
    best_routes = [list(r) for r in routes]
    best_z = current_z
    n_routes = len(best_routes)
    for a in range(n_routes):
        for i in range(1, len(best_routes[a]) - 1):
            node = best_routes[a][i]
            if node < inst.n_depots or node >= inst.n_depots + inst.n_floods:
                continue
            for b in range(n_routes):
                if a == b:
                    continue
                for j in range(1, len(best_routes[b])):
                    trial = list(best_routes)
                    trial[a] = best_routes[a][:i] + best_routes[a][i + 1 :]
                    trial[b] = best_routes[b][:j] + [node] + best_routes[b][j:]
                    ev = evaluate_solution(inst, trial, capacities)
                    if (
                        all_floods_served(ev.remaining_volume)
                        and ev.objective_z + 1e-9 < best_z
                    ):
                        best_routes = trial
                        best_z = ev.objective_z
                        return best_routes, best_z
    return best_routes, best_z
```

**Algoritma 5.22** Operator relocate antar-rute

Operator `exchange` menukar satu kunjungan flood pada rute A dengan
satu kunjungan flood pada rute B. Operator ini efektif ketika dua rute
saling membawa simpul yang lebih cocok untuk pasangan lainnya, misalnya
simpul ber-SI tinggi terjebak pada rute panjang. Implementasi tampak
pada Algoritma 5.23.

```python
def exchange(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_z: float,
) -> tuple[list[list[int]], float]:
    best_routes = [list(r) for r in routes]
    best_z = current_z
    n_routes = len(best_routes)
    for a in range(n_routes):
        for i in range(1, len(best_routes[a]) - 1):
            if not _is_flood(inst, best_routes[a][i]):
                continue
            for b in range(a + 1, n_routes):
                for j in range(1, len(best_routes[b]) - 1):
                    if not _is_flood(inst, best_routes[b][j]):
                        continue
                    trial = [list(r) for r in best_routes]
                    trial[a][i], trial[b][j] = trial[b][j], trial[a][i]
                    ev = evaluate_solution(inst, trial, capacities)
                    if (
                        all_floods_served(ev.remaining_volume)
                        and ev.objective_z + 1e-9 < best_z
                    ):
                        best_routes = trial
                        best_z = ev.objective_z
                        return best_routes, best_z
    return best_routes, best_z
```

**Algoritma 5.23** Operator exchange antar-rute

Fungsi `polish` menyatukan keempat operator ke dalam satu siklus yang
berhenti bila `Z` tidak lagi menurun atau `max_rounds` tercapai. Fungsi
ini menyediakan parameter `quick` yang bila diaktifkan hanya menjalankan
`two_opt` dan `relocate` sebagai polish murah per iterasi ACS. Mode
penuh menjalankan keempat operator dan dipakai secara periodik tiap lima
iterasi serta satu kali di akhir eksekusi sebagai final polish.
Implementasi ditampilkan pada Algoritma 5.24.

```python
def polish(
    inst: Instance,
    routes: list[list[int]],
    capacities: list[int],
    current_z: float,
    max_rounds: int = 5,
    quick: bool = False,
) -> tuple[list[list[int]], float, SolutionEval]:
    cur_routes = [list(r) for r in routes]
    cur_z = current_z
    for _ in range(max_rounds):
        prev_z = cur_z
        cur_routes, cur_z = two_opt(inst, cur_routes, capacities, cur_z)
        cur_routes, cur_z = relocate_between_routes(
            inst, cur_routes, capacities, cur_z
        )
        if not quick:
            cur_routes, cur_z = or_opt(inst, cur_routes, capacities, cur_z)
            cur_routes, cur_z = exchange(inst, cur_routes, capacities, cur_z)
        if cur_z >= prev_z - 1e-9:
            break
    ev = evaluate_solution(inst, cur_routes, capacities)
    return cur_routes, cur_z, ev
```

**Algoritma 5.24** Fungsi polish yang menyatukan seluruh operator local search

### 5.4.6 Pembaruan Feromon Global

Pembaruan feromon global (Persamaan 2.17 dan Persamaan 2.18) dilakukan
sekali per iterasi setelah tahap polish selesai. Skema `best-so-far`
digunakan dengan deposit sebesar `1 / Z_best` dan evaporasi `rho`
diterapkan pada seluruh matriks feromon sebelum reinforcement. Skema ini
mempercepat konvergensi ke wilayah solusi berkualitas tanpa membutuhkan
struktur elitis tambahan. Implementasi ditampilkan pada Algoritma 5.25.

```python
def _global_update(self, best_routes: list[list[int]], best_z: float) -> None:
    deposit = 1.0 / max(best_z, 1e-6)
    self.pheromone *= 1 - self.p.rho
    for route in best_routes:
        for a, b in zip(route[:-1], route[1:]):
            self.pheromone[a, b] += self.p.rho * deposit
            self.pheromone[b, a] = self.pheromone[a, b]
```

**Algoritma 5.25** Pembaruan feromon global best-so-far

### 5.4.7 Alur Keseluruhan Hybrid ACS

Alur keseluruhan memadukan konstruksi round-robin, polish bertingkat, dan
pembaruan feromon global ke dalam satu loop iterasi berbatas waktu.
Skema polish bertingkat berjalan dalam dua tingkatan yakni polish cepat
setiap iterasi dan polish lengkap tiap lima iterasi. Setelah loop utama
selesai, sisa anggaran waktu digunakan untuk final polish yang
menjalankan keempat operator dengan `max_rounds` tinggi guna menekan
`Z` sampai batas paling akhir. Fungsi `solve` sebagai orkestrator
seluruh iterasi ditampilkan pada Algoritma 5.26.

```python
def solve(self) -> ACSSolution:
    start = time.perf_counter()
    best_routes: list[list[int]] | None = None
    best_caps: list[int] | None = None
    best_z = float("inf")
    best_eval: SolutionEval | None = None
    trace = ACSTrace()

    for it in range(self.p.iterations):
        iter_best_z = float("inf")
        iter_best_routes: list[list[int]] | None = None
        iter_best_caps: list[int] | None = None

        for _ in range(self.p.n_ants):
            routes, caps = self._construct_one_ant()
            ev = evaluate_solution(self.inst, routes, caps)
            if not all_floods_served(ev.remaining_volume):
                continue
            if ev.objective_z < iter_best_z:
                iter_best_z = ev.objective_z
                iter_best_routes = copy.deepcopy(routes)
                iter_best_caps = list(caps)

        if iter_best_routes is None:
            trace.iter_best_z.append(best_z if best_z != float("inf") else 0.0)
            trace.best_z.append(best_z if best_z != float("inf") else 0.0)
            continue

        if it % 5 == 0 and it > 0:
            iter_best_routes, iter_best_z, ev = polish(
                self.inst, iter_best_routes, iter_best_caps, iter_best_z,
                max_rounds=3, quick=False,
            )
        else:
            iter_best_routes, iter_best_z, ev = polish(
                self.inst, iter_best_routes, iter_best_caps, iter_best_z,
                max_rounds=1, quick=True,
            )

        if iter_best_z < best_z:
            best_z = iter_best_z
            best_routes = copy.deepcopy(iter_best_routes)
            best_caps = list(iter_best_caps or [])
            best_eval = ev

        self._global_update(best_routes or iter_best_routes, best_z)
        trace.iter_best_z.append(float(iter_best_z))
        trace.best_z.append(float(best_z))

        if (
            self.p.time_limit_s is not None
            and time.perf_counter() - start > self.p.time_limit_s
        ):
            break

    if best_routes is None or best_eval is None or best_caps is None:
        raise RuntimeError("ACS did not find any feasible solution.")

    elapsed = time.perf_counter() - start
    budget_left = (self.p.time_limit_s or 0.0) - elapsed
    if budget_left > 2.0:
        polished_routes, polished_z, polished_eval = polish(
            self.inst, best_routes, best_caps, best_z,
            max_rounds=10, quick=False,
        )
        if polished_z + 1e-9 < best_z:
            best_routes = polished_routes
            best_z = polished_z
            best_eval = polished_eval
            trace.best_z.append(float(best_z))
            trace.iter_best_z.append(float(best_z))

    elapsed = time.perf_counter() - start
    return ACSSolution(
        routes=best_routes,
        capacities=best_caps,
        evaluation=best_eval,
        trace=trace,
        computation_time_s=elapsed,
    )
```

**Algoritma 5.26** Alur keseluruhan Hybrid ACS

## 5.5 Implementasi Algoritma Variable Neighborhood Search

Algoritma VNS diimplementasikan sebagai kelas `VNS` sebagai algoritma
pembanding. VNS memakai antarmuka identik dengan Hybrid ACS (input
`Instance`, output `SolutionEval`) sehingga hasil kedua algoritma dapat
dibandingkan secara adil pada dataset yang sama. Parameter
direpresentasikan sebagai dataclass `VNSParams` dengan nilai default
`max_iterations = 100`, `k_max = 3`, dan `time_limit_s = 45`. Definisi
dataclass ditampilkan pada Algoritma 5.27.

```python
@dataclass
class VNSParams:
    max_iterations: int = 100
    k_max: int = 3
    seed: int | None = None
    time_limit_s: float | None = 45.0
```

**Algoritma 5.27** Dataclass parameter VNS

### 5.5.1 Pembangkitan Solusi Awal

Solusi awal dibangun menggunakan heuristik nearest-neighbour dengan bias
skor `SI / d`. Setiap kendaraan membangun rutenya secara greedy sampai
batas `max_flood_visits` tercapai atau pool titik habis. Batas
`max_flood_visits = max(3, 2 * n_floods / n_vehicles + 1)` mencegah
satu kendaraan memonopoli pool sekaligus tetap membuka ruang jika
kendaraan lain gagal menyisir seluruh kandidat. Setelah tahap konstruksi,
fase repair menambahkan pasangan IF diikuti flood untuk titik yang belum
tuntas. Bila setelah 20 percobaan solusi awal tetap infeasible,
pembangkitan gagal dan optimasi dibatalkan. Fungsi utama pembangkitan
solusi awal ditampilkan pada Algoritma 5.28.

```python
def _greedy_initial(self) -> tuple[list[list[int]], list[int]]:
    max_attempts = 20
    for _attempt in range(max_attempts):
        volumes_left = self.inst.volumes.copy()
        n_vehicles = len(self.inst.vehicles)

        order = list(range(n_vehicles))
        self._rng.shuffle(order)

        route_map: dict[int, list[int]] = {}
        cap_map: dict[int, int] = {}

        for vi in order:
            depot, cap = self.inst.vehicles[vi]
            if np.all(volumes_left <= 0.5):
                route_map[vi] = [depot, depot]
                cap_map[vi] = cap
                continue
            route, _ = self._build_greedy_route(depot, cap, volumes_left)
            route_map[vi] = route
            cap_map[vi] = cap

        routes = [route_map[i] for i in range(n_vehicles)]
        capacities = [cap_map[i] for i in range(n_vehicles)]

        for _repair_round in range(self.inst.n_floods * 3):
            ev = evaluate_solution(self.inst, routes, capacities)
            if all_floods_served(ev.remaining_volume):
                return routes, capacities
            self._repair_one(routes, capacities, ev.remaining_volume)

        ev = evaluate_solution(self.inst, routes, capacities)
        if all_floods_served(ev.remaining_volume):
            return routes, capacities

    raise RuntimeError(
        "VNS failed to construct a feasible initial solution "
        f"after {max_attempts} attempts."
    )
```

**Algoritma 5.28** Pembangkitan solusi awal VNS

Fungsi `_greedy_next` memilih kandidat berikutnya menggunakan skor
`SI / d(i, j)` yang dikalikan noise `U(0.8, 1.2)` sebagai diversifikasi
antar attempt. Bonus proksimitas depo dengan konstanta yang sama seperti
Hybrid ACS (`DEPOT_PROXIMITY_BONUS = 3.0`) diterapkan pada skor untuk
menjaga konsistensi soft constraint pada kedua algoritma. Implementasi
ditampilkan pada Algoritma 5.29.

```python
def _greedy_next(
    self,
    current: int,
    candidates: list[int],
    home_depot: int,
) -> int:
    slots = [self._flood_lookup[c] for c in candidates]
    dists = self.inst.dist_matrix[current, candidates]
    si = self.inst.si_values[slots]
    with np.errstate(divide="ignore", invalid="ignore"):
        scores = si / np.where(dists < 1e-6, 1e-6, dists)
    bonus = np.where(
        self.nearest_depot[slots] == home_depot,
        self.DEPOT_PROXIMITY_BONUS,
        1.0,
    )
    scores = scores * bonus
    noise = self._np_rng.uniform(0.8, 1.2, size=len(scores))
    scores = scores * noise
    return int(candidates[int(np.argmax(scores))])
```

**Algoritma 5.29** Pemilihan kandidat greedy dengan noise

### 5.5.2 Shaking per Neighborhood

Operator shaking pada kerangka General Variable Neighborhood Search
menerima parameter `k` dan menerapkan `k` perturbasi acak pada solusi
terkini. Tiga jenis operator neighborhood diimplementasikan yakni
`swap_within` yang menukar dua simpul internal pada satu rute aktif,
`relocate_between` yang memindahkan satu kunjungan flood dari satu rute
aktif ke rute aktif lain, dan `reverse_segment` yang membalikkan segmen
dalam satu rute aktif dengan gaya 2-opt acak. Pilihan operator per
perturbasi diacak dengan probabilitas seragam. Batasan "rute aktif" yaitu
rute yang mengunjungi minimal satu flood, diberlakukan agar shaking
tidak membuang siklus perturbasi pada rute kosong. Fungsi pemilihan
operator ditampilkan pada Algoritma 5.30.

```python
def _shake(
    self,
    routes: list[list[int]],
    capacities: list[int],
    k: int,
) -> list[list[int]]:
    shaken = [list(r) for r in routes]
    for _ in range(k):
        move = self._rng.randint(0, 2)
        if move == 0:
            self._shake_swap_within(shaken)
        elif move == 1:
            self._shake_relocate_between(shaken)
        else:
            self._shake_reverse_segment(shaken)
    return shaken
```

**Algoritma 5.30** Fungsi shaking dengan k perturbasi acak

Operator `swap_within` yang mempertukarkan dua simpul internal dalam
satu rute aktif ditampilkan pada Algoritma 5.31.

```python
def _shake_swap_within(self, routes: list[list[int]]) -> None:
    active = self._active_routes(routes)
    if not active:
        return
    ri = self._rng.choice(active)
    r = routes[ri]
    internal = list(range(1, len(r) - 1))
    if len(internal) < 2:
        return
    a, b = self._rng.sample(internal, 2)
    r[a], r[b] = r[b], r[a]
```

**Algoritma 5.31** Operator shaking swap-within

Operator `relocate_between` yang memindahkan satu kunjungan flood dari
rute sumber ke rute tujuan ditampilkan pada Algoritma 5.32.

```python
def _shake_relocate_between(self, routes: list[list[int]]) -> None:
    active = self._active_routes(routes)
    if len(active) < 2:
        return
    src_ri = self._rng.choice(active)
    src = routes[src_ri]
    flood_positions = [
        i for i in range(1, len(src) - 1) if src[i] in self._flood_set
    ]
    if not flood_positions:
        return
    pos = self._rng.choice(flood_positions)
    node = src.pop(pos)

    dst_ri = self._rng.choice([r for r in active if r != src_ri])
    dst = routes[dst_ri]
    insert_pos = self._rng.randint(1, max(1, len(dst) - 1))
    dst.insert(insert_pos, node)
```

**Algoritma 5.32** Operator shaking relocate-between

Operator `reverse_segment` yang membalikkan segmen acak dalam satu rute
aktif ditampilkan pada Algoritma 5.33.

```python
def _shake_reverse_segment(self, routes: list[list[int]]) -> None:
    active = self._active_routes(routes)
    if not active:
        return
    ri = self._rng.choice(active)
    r = routes[ri]
    if len(r) <= 3:
        return
    a = self._rng.randint(1, len(r) - 3)
    b = self._rng.randint(a + 1, len(r) - 2)
    r[a:b + 1] = reversed(r[a:b + 1])
```

**Algoritma 5.33** Operator shaking reverse-segment

### 5.5.3 Alur Keseluruhan VNS

Loop utama mengikuti kerangka General Variable Neighborhood Search. Bila
polish menemukan solusi lebih baik, indeks neighborhood `k` di-reset ke
1 (intensifikasi mendalam). Bila tidak, `k` bertambah 1 (diversifikasi
lebih agresif). Iterasi berhenti ketika `max_iterations` atau
`time_limit_s` terpenuhi. Baseline dari solusi shaken dievaluasi terlebih
dahulu sebelum diserahkan ke fungsi polish untuk menghindari perilaku
thrashing yang muncul bila baseline dimulai dari `+inf`. Fungsi `solve`
sebagai orkestrator VNS ditampilkan pada Algoritma 5.34.

```python
def solve(self) -> VNSSolution:
    start = time.perf_counter()

    routes, capacities = self._greedy_initial()
    ev = evaluate_solution(self.inst, routes, capacities)

    if not all_floods_served(ev.remaining_volume):
        unserved_count = int(np.sum(ev.remaining_volume > 1.0))
        raise RuntimeError(
            f"VNS initial solution infeasible: "
            f"{unserved_count} flood(s) not fully served."
        )

    best_routes = [list(r) for r in routes]
    best_caps = list(capacities)
    best_z = ev.objective_z
    best_eval = ev
    trace = VNSTrace()

    for it in range(self.p.max_iterations):
        k = 1
        iter_z = best_z

        while k <= self.p.k_max:
            shaken = self._shake(best_routes, best_caps, k)

            try:
                shaken_ev = evaluate_solution(self.inst, shaken, best_caps)
                if not all_floods_served(shaken_ev.remaining_volume):
                    k += 1
                    continue
                polished, pol_z, pol_ev = polish(
                    self.inst, shaken, best_caps, shaken_ev.objective_z,
                    max_rounds=2, quick=True,
                )
            except Exception:
                k += 1
                continue

            if not all_floods_served(pol_ev.remaining_volume):
                k += 1
                continue

            if pol_z + 1e-9 < best_z:
                best_z = pol_z
                best_routes = [list(r) for r in polished]
                best_eval = pol_ev
                iter_z = pol_z
                k = 1
            else:
                k += 1

            if (
                self.p.time_limit_s is not None
                and time.perf_counter() - start > self.p.time_limit_s
            ):
                break

        trace.iter_best_z.append(float(iter_z))
        trace.best_z.append(float(best_z))

        if (
            self.p.time_limit_s is not None
            and time.perf_counter() - start > self.p.time_limit_s
        ):
            break

    elapsed = time.perf_counter() - start
    return VNSSolution(
        routes=best_routes,
        capacities=best_caps,
        evaluation=best_eval,
        trace=trace,
        computation_time_s=elapsed,
    )
```

**Algoritma 5.34** Alur keseluruhan VNS

## 5.6 Pengembangan Aplikasi Website

Aplikasi website berfungsi sebagai antarmuka pengguna Sistem Pendukung
Keputusan. Pengembangan menggunakan Next.js versi 16 dengan App Router,
React 19, dan Tailwind CSS versi 4. Sisi frontend dibangun sebagai
Single Page Application ringan yang berkomunikasi dengan backend
FastAPI melalui REST API berformat JSON. Seluruh eksekusi algoritma
tetap berada pada backend sehingga peramban tidak menjalankan
perhitungan optimasi apapun. Pada tahap penulisan bab ini aplikasi
telah mencapai kira-kira 80 persen kesiapan fitur.

### 5.6.1 Arsitektur Sistem

Arsitektur aplikasi disusun menjadi lima lapisan seperti pada Tabel 5.2.

Tabel 5.2 Arsitektur Aplikasi

| Lapisan | Peran | Modul Utama |
|---------|-------|-------------|
| Presentasi     | Rendering peta, panel input, dan panel hasil       | AppShell, MapInner, RoutePolylines, ChoroplethLayer, AlgorithmPanel, ResultsDock |
| State klien    | Konfigurasi algoritma, hasil optimasi, dan data peta | useAlgorithmConfig, useOptimization, useMapData |
| API klien      | Wrapper `fetch` tipe-safe                          | modul api dengan konstanta DEFAULT_ACS_PARAMS dan DEFAULT_VNS_PARAMS |
| API server     | Endpoint REST FastAPI                              | router data, router severity, router optimize |
| Algoritma dan data | Perhitungan optimasi dan I/O dataset            | kelas HybridACS, kelas VNS, evaluator, modul severity |

Endpoint utama yang disediakan backend meliputi
`GET /api/data/{floods|depo|if|faskes}` untuk membaca dataset, pasangan
`POST`, `PUT`, dan `DELETE` untuk penyuntingan tabel data,
`GET /api/severity-index` untuk mengambil vektor bobot dan nilai SI per
titik, `POST /api/optimize/acs` serta `POST /api/optimize/vns` untuk
menjalankan optimasi, dan `GET /health` sebagai probe kesiapan. Setiap
perubahan dataset melalui endpoint CRUD memicu invalidasi matriks jarak
in-memory sehingga panggilan optimasi berikutnya selalu membangun ulang
instance dari koordinat terbaru. Pada Algoritma 5.35 ditampilkan
endpoint eksekusi Hybrid ACS yang menerima parameter melalui request
Pydantic, membangun instance, memanggil solver, dan mengembalikan
response terstruktur untuk frontend.

```python
@router.post("/acs", response_model=OptimizationResponse)
async def run_acs(request: ACSRequest) -> OptimizationResponse:
    try:
        inst = _build_ready_instance()
        params = ACSParams(
            iterations=request.iterations,
            n_ants=request.n_ants,
            alpha=request.alpha,
            beta=request.beta,
            rho=request.rho,
            q0=request.q0,
            seed=request.seed,
            time_limit_s=request.time_limit_s,
        )
        solver = HybridACS(inst, params)
        sol = solver.solve()

        violations = validate_hard_constraints(inst, sol.evaluation)
        if violations:
            for v in violations:
                _log.warning("Constraint violation: %s", v)

        return _to_response(
            inst=inst,
            routes=sol.routes,
            capacities=sol.capacities,
            ev=sol.evaluation,
            convergence_best=sol.trace.best_z,
            convergence_iter=sol.trace.iter_best_z,
            computation_time_s=sol.computation_time_s,
            algorithm="acs",
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
```

**Algoritma 5.35** Endpoint REST untuk eksekusi Hybrid ACS

### 5.6.2 Panel Input

Panel input berisi tab pemilih algoritma (Hybrid ACS atau VNS), grid
input parameter, tombol jalankan optimasi, tombol reset hasil, dan
tombol bandingkan ACS vs VNS. Panel merespons dua mode tampilan yakni
mode `simple` yang menyembunyikan input numerik dan memakai preset
default, serta mode `advanced` yang mengekspos seluruh parameter untuk
keperluan analisis sensitivitas. Parameter Hybrid ACS yang tersedia
meliputi `iterations` (1 sampai 500), `n_ants` (1 sampai 100),
`alpha` (0.1 sampai 5.0), `beta` (0.1 sampai 10.0),
`rho` (0.01 sampai 0.9), dan `q0` (0.0 sampai 1.0). Parameter VNS
meliputi `max_iterations` (1 sampai 1000) dan `k_max` (1 sampai 6).
Rentang nilai dijaga selaras antara validator Pydantic pada backend dan
atribut `min`, `max`, `step` pada elemen `input` frontend agar tidak
terjadi ketidaksesuaian antara payload dan validator. Pada Algoritma
5.36 ditampilkan komponen input numerik pada panel algoritma.

```tsx
function NumInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <label className="flex flex-col gap-[3px]">
      <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="font-manrope rounded-md border border-frost bg-pure-white px-8 py-[6px] text-[13px] font-semibold text-midnight-ink outline-none focus:border-steel"
      />
    </label>
  );
}
```

**Algoritma 5.36** Komponen input numerik parameter

Tombol jalankan optimasi menampilkan indikator spinner selama komputasi
berlangsung dan berpindah ke label "Menghitung..." untuk memberi umpan
balik visual kepada pengguna. Pada Algoritma 5.37 ditampilkan struktur
tombol tersebut.

```tsx
<button
  type="button"
  disabled={isLoading}
  onClick={onRun}
  className={`inline-flex flex-1 items-center justify-center gap-[6px] rounded-md border-0 px-[14px] py-[10px] text-[13px] font-bold tracking-[-0.13px] text-white transition-colors ${
    isLoading
      ? "cursor-wait bg-steel"
      : "cursor-pointer bg-indigo-ink hover:bg-indigo-hover"
  }`}
>
  {isLoading ? (
    <>
      <Spinner />
      Menghitung...
    </>
  ) : (
    <>
      <Play size={14} strokeWidth={2.5} />
      Jalankan Optimasi
    </>
  )}
</button>
```

**Algoritma 5.37** Tombol jalankan optimasi

Nilai parameter dipersistensi ke `localStorage` melalui hook
`useAlgorithmConfig` sehingga preferensi pengguna bertahan lintas
refresh halaman. Nilai default dipertahankan pada konstanta
`DEFAULT_ACS_PARAMS` dan `DEFAULT_VNS_PARAMS` yang ditampilkan pada
Algoritma 5.38.

```typescript
export const DEFAULT_ACS_PARAMS: ACSParams = {
  iterations: 60,
  n_ants: 20,
  alpha: 1.0,
  beta: 1.0,
  rho: 0.15,
  q0: 0.7,
  seed: 42,
  time_limit_s: 45,
};

export const DEFAULT_VNS_PARAMS: VNSParams = {
  max_iterations: 100,
  k_max: 3,
  seed: 42,
  time_limit_s: 45,
};
```

**Algoritma 5.38** Konstanta parameter default kedua algoritma

### 5.6.3 Peta Interaktif

Peta interaktif dibangun menggunakan pustaka Leaflet versi 1.9 melalui
adapter `react-leaflet` versi 5. Komponen `MapContainer` di-load dinamis
dengan `next/dynamic` menggunakan opsi `ssr: false` karena Leaflet
mengakses objek `window` yang tidak tersedia pada server-side rendering.
Peta dipusatkan pada koordinat Kota Surabaya dengan zoom default 12,
minimum 10, dan maksimum 18. Beberapa lapisan yang dirender pada peta
meliputi lapisan basemap yang dapat dipilih di antara varian standard,
positron light, atau dark, lapisan marker titik genangan yang diwarnai
berdasarkan tier SI, lapisan marker depo, lapisan marker IF, lapisan
marker fasilitas kesehatan, lapisan choropleth per kecamatan, dan
lapisan polyline rute per kendaraan setelah optimasi berjalan. Pada
Algoritma 5.39 ditampilkan struktur komponen peta utama.

```tsx
export function MapInner({
  floods, depots, ifs, faskes,
  overlays, setOverlay,
  baseMap, setBaseMap,
  routes, highlightVehicleId, setHighlightVehicleId,
  focusedRoute, onPreviewData, isMobile = false,
}: MapInnerProps) {
  const base = BASE_MAP_LAYERS[baseMap];

  return (
    <MapContainer
      center={SURABAYA_CENTER}
      zoom={DEFAULT_ZOOM}
      minZoom={10}
      maxZoom={18}
      zoomControl={false}
      attributionControl={true}
      className="h-full w-full"
    >
      <TileLayer url={base.urlTemplate} attribution={base.attribution} />

      {overlays.choropleth ? <ChoroplethLayer floods={floods} /> : null}

      {overlays.floods ? <FloodMarkers points={floods} /> : null}
      {overlays.depots ? <DepotMarkers depots={depots} /> : null}
      {overlays.ifs ? <IfMarkers ifs={ifs} /> : null}
      {overlays.faskes ? <FaskesMarkers faskes={faskes} /> : null}

      {routes.length > 0 ? (
        <RoutePolylines
          routes={routes}
          highlightId={highlightVehicleId}
          onHover={setHighlightVehicleId}
        />
      ) : null}

      <FitBounds route={focusedRoute} />
    </MapContainer>
  );
}
```

**Algoritma 5.39** Struktur komponen peta interaktif

Lapisan choropleth memuat batas kecamatan Surabaya dari berkas GeoJSON,
mengagregasi titik genangan ke tiap kecamatan menggunakan fungsi
`aggregateSiByKecamatan`, kemudian mewarnai wilayah berdasarkan total
beban SI relatif. Ketika overlay choropleth diaktifkan, basemap otomatis
dialihkan ke varian positron agar warna wilayah terbaca jelas, dan
kembali ke basemap sebelumnya ketika overlay dimatikan. Pada Algoritma
5.40 ditampilkan fungsi styling GeoJSON per fitur kecamatan yang
menerjemahkan nilai statistik menjadi warna isian.

```tsx
function featureStyle(stat: KecamatanStat | undefined): PathOptions {
  if (!stat || stat.count === 0) {
    return {
      color: BORDER,
      weight: 0.8,
      opacity: 0.35,
      fillColor: EMPTY_FILL,
      fillOpacity: 0.15,
      dashArray: "3 3",
    };
  }
  return {
    color: BORDER,
    weight: 1,
    opacity: 0.45,
    fillColor: siColor(stat.loadNorm),
    fillOpacity: 0.55,
  };
}
```

**Algoritma 5.40** Fungsi styling GeoJSON per fitur kecamatan

Untuk pengguna mobile, seluruh dock kontrol dipindahkan ke bagian bawah
viewport melalui komponen `MobileDataLayerDock` dan `MobileRunBar`, dan
panel input serta panel hasil disajikan melalui overlay penuh layar
komponen `PanelOverlay`. Deteksi breakpoint dilakukan oleh hook
`useBreakpoint`.

### 5.6.4 Panel Detail dan Panel Evaluasi

Panel detail dan panel evaluasi diimplementasikan sebagai komponen
`ResultsDock` yang muncul di sisi kanan viewport hanya setelah optimasi
menghasilkan solusi feasible. Panel tersusun dari dua kartu koleps yakni
Ringkasan Hasil dan Detail Rute. Kartu Ringkasan Hasil menampilkan empat
metrik utama yaitu Skor Respons (`Z`), Total Jarak (dalam meter atau
kilometer), Total Waktu (dalam menit atau jam), dan jumlah Titik
Dilayani beserta jumlah kunjungan IF. Pada Algoritma 5.41 ditampilkan
komponen `ResultsPanel` yang merender keempat metrik tersebut.

```tsx
export function ResultsPanel({ result, mode }: ResultsPanelProps) {
  return (
    <div className="flex flex-col gap-[10px]">
      <div className="grid grid-cols-2 gap-8">
        <Metric
          Icon={TrendingDown}
          label="Skor Respons"
          value={formatNumber(result.objective_z, 0)}
          hint="makin rendah makin baik"
          accent="var(--color-midnight-ink)"
        />
        <Metric
          Icon={Route}
          label="Total Jarak"
          value={formatMeters(result.total_distance_m)}
          hint={`${result.n_vehicles} kendaraan`}
          accent="#0891b2"
        />
        <Metric
          Icon={Clock}
          label="Total Waktu"
          value={formatDuration(result.total_time_s)}
          hint={`${formatDuration(result.computation_time_s)} komputasi`}
          accent="#059669"
        />
        <Metric
          Icon={MapPinned}
          label="Titik Dilayani"
          value={formatNumber(result.total_flood_visits)}
          hint={`${result.total_if_visits} titik buang air`}
          accent="#ef4444"
        />
      </div>
    </div>
  );
}
```

**Algoritma 5.41** Komponen metrik ringkasan hasil

Tiga tombol ekspor tersedia yakni PDF (menggunakan pustaka `jspdf`
dengan `jspdf-autotable`), JSON (raw output API), dan CSV (tabel per
kunjungan). Kartu Detail Rute menyediakan tab Rute dan tab Severity
Index. Tab Rute berisi daftar per kendaraan yang setiap entrinya
mencantumkan `vehicle_id`, depo asal, kapasitas, jumlah kunjungan flood
dan IF, total jarak, kontribusi terhadap `Z`, tombol fokus peta, dan
tombol untuk menyembunyikan atau menampilkan polyline rute. Himpunan
rute yang disembunyikan dipersistensi ke `localStorage` agar preferensi
pengguna bertahan lintas refresh.

Bila mode `advanced` aktif, kartu Detail Rute menambahkan grafik
konvergensi menggunakan komponen `ConvergenceChart` yang memplot dua
garis yakni `iter_best_z` per iterasi dan `best_z` kumulatif dari data
trace hasil optimasi menggunakan Recharts. Implementasi komponen
konvergensi ditampilkan pada Algoritma 5.42.

```tsx
export function ConvergenceChart({ data }: ConvergenceChartProps) {
  if (!data.length) return null;
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="text-[10px] font-bold uppercase tracking-[0.9px] text-slate">
        Konvergensi (best Z per iterasi)
      </div>
      <div className="h-[140px] w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-frost)" strokeDasharray="2 4" />
            <XAxis
              dataKey="iteration"
              stroke="var(--color-slate)"
              fontSize={10}
              tickLine={false}
            />
            <YAxis
              stroke="var(--color-slate)"
              fontSize={10}
              tickLine={false}
              width={44}
              tickFormatter={(v: number) => formatNumber(v, 0)}
            />
            <Tooltip
              contentStyle={{
                border: "1px solid var(--color-frost)",
                borderRadius: "var(--radius-md)",
                boxShadow: "none",
                fontFamily: "var(--font-manrope)",
                fontSize: 12,
              }}
              formatter={(value) => formatNumber(Number(value ?? 0), 0)}
              labelFormatter={(l) => `Iterasi ${l}`}
            />
            <Line
              type="monotone"
              dataKey="iter_best_z"
              stroke="var(--color-smoke)"
              strokeWidth={1.5}
              dot={false}
              name="Iterasi"
            />
            <Line
              type="monotone"
              dataKey="best_z"
              stroke="var(--color-midnight-ink)"
              strokeWidth={2}
              dot={false}
              name="Best"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

**Algoritma 5.42** Komponen grafik konvergensi

Tab Severity Index menampilkan bobot AHP, bobot Entropy Weight, bobot
kombinasi, nilai Consistency Ratio, dan tabel nilai SI per titik yang
dapat diurutkan berdasarkan kolom `si_value`, `depth_cm`, atau
`dist_faskes_m`. Bila pengguna menjalankan mode perbandingan ACS vs VNS
melalui tombol pada panel input, panel tambahan `ComparisonPanel`
muncul di atas kartu Ringkasan Hasil dan menyajikan tabel selisih
metrik utama antara kedua algoritma pada seed dan preset yang sama.
