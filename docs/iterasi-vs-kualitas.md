# Iterasi vs kualitas polish

Anggaran komputasi (30/45/60 detik) dibagi ke banyak iterasi. Tiap iterasi hanya boleh
memoles solusi terbaiknya selama `polish_slice_s` detik, sisanya dipakai membangun solusi
(ACS: semut) atau mengguncang solusi (VNS: shake). Polish dalam yang lebih panjang
dilakukan sekali di akhir (`final_polish_frac` = 25% anggaran).

Batas `iterations` / `max_iterations` hanyalah batas atas (1000). Jumlah iterasi yang
terjadi ditentukan oleh anggaran waktu dan jatah polish, bukan oleh batas itu.

## Hasil sweep

Skenario `s2-jun`, anggaran 45 s, 3 seed (1, 2, 3) per baris.

| Algoritma | Jatah polish | Iterasi | Z rata-rata | Cakupan |
|-----------|-------------:|--------:|------------:|--------:|
| ACS | 0,3 s | 36 | 908.593 | 92,1% |
| ACS | 0,5 s | 30 | 909.017 | 91,9% |
| ACS | 0,8 s | 25 | 889.365 | 91,9% |
| ACS | 1,2 s | 19 | 908.789 | 91,8% |
| ACS | 2,0 s | 14 | 885.781 | 91,6% |
| VNS | 0,5 s | 53 | 997.558 | 92,1% |
| VNS | 1,0 s | 31 | 990.561 | 92,3% |
| VNS | 2,0 s | 16 | 999.363 | 92,2% |

## Kesimpulan

- Selisih Z antar jatah polish ada di dalam sebaran antar seed (sekitar ±3%), jadi tidak
  terukur ada penurunan kualitas ketika jatah dipendekkan. Iterasi naik 2,5× (ACS) dan
  3,3× (VNS).
- Default: ACS 0,3 s, VNS 0,5 s. Polish dalam penutup menutup kedalaman yang tidak sempat
  dicapai per iterasi.
- ACS konsisten sekitar 8–10% lebih baik dari VNS pada semua jatah polish.
- Sweep hanya 3 seed per titik. Untuk klaim di skripsi, ulangi dengan seed lebih banyak
  (misalnya 10) pada ketiga skenario.
