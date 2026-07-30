# Desain: Occlusion & Keterbacaan Objek AR Jauh

**Tanggal:** 2026-07-30
**Status:** disetujui — implementasi bertahap (Tahap 1 lebih dulu)

---

## 1. Masalah

Uji 4 (2026-07-29, RS Jemursari Lt 2) memunculkan dua keluhan yang sama-sama disebut
"occlusion" oleh pemilik project:

1. **Jejak chevron sepanjang 34 m menembus tembok dan ruangan lain.**
2. **Pilar tujuan terlihat walau ruangannya di balik dinding.**

Yang **tidak** dikeluhkan: objek AR menimpa benda nyata di dekat kamera (railing, tangga,
orang lewat). Ini penting — ia menghapus satu pendekatan dari daftar.

## 2. Diagnosis: dua gejala, dua akar berbeda

**Gejala 1 bukan masalah occlusion.** Akarnya rute yang salah: `navgraph.json` hanya berisi
3 node yang hampir segaris, jadi A* jatuh ke fallback garis lurus ke POI, dan garis lurus
34 m di dalam gedung memang menembus tembok. Meng-occlude rute yang salah berarti
menyembunyikan bukti, bukan memperbaiki penyebab — persis pola yang ditolak `CLAUDE.md`.
Perbaikan akarnya = merapatkan navgraph (alat sudah ada, ADR-W009).

**Gejala 2 memang masalah occlusion asli.** Objeknya berada di posisi yang benar, tapi tak
seharusnya terlihat dari tempat user berdiri.

## 3. Best practice occlusion (dan posisi jujur desain ini)

Urutan baku, dari fidelitas tertinggi:

| # | Pendekatan | Jangkauan | Meng-occlude benda bergerak? |
|---|---|---|---|
| 1 | Depth real-time (ARCore Depth API) | tipikal 20–30 m, maks 65.5 m | ya |
| 2 | Mesh hasil scan sebagai depth-only occluder | sejauh mesh | tidak |
| 3 | Draw-distance / horizon | — | — (bukan occlusion) |

**Horizon (Tahap 1) BUKAN best practice occlusion.** Ia best practice untuk keterbacaan
navigasi. Dicatat eksplisit supaya tidak ada yang mengutipnya kelak sebagai "occlusion sudah
beres".

**Kenapa depth tidak dipilih lebih dulu**, walau ia peringkat teratas:
- Dokumentasi ARCore: *"Surfaces with few or no features, such as white walls, will be
  associated with imprecise depth"*, dan depth diperoleh dari gerakan sehingga butuh user
  bergerak dulu. Koridor rumah sakit yang putih polos adalah skenario terburuknya.
- SDK `@multisetai/vps` mengunci mati pembuatan sesi:
  `requestSession("immersive-ar", { requiredFeatures:["local"], optionalFeatures:["camera-access","dom-overlay"], … })`
  — nol jejak `depth-sensing`/`sessionInit` di seluruh dist, tanpa jalur passthrough.
  Mengaktifkannya menuntut membajak `navigator.xr.requestSession`.
- Dukungan perangkat di TECNO KL7 belum diuji.

Depth tetap dicatat sebagai peningkatan masa depan khusus **occlusion jarak dekat & benda
bergerak** — satu-satunya hal yang mesh tak bisa lakukan.

---

## 4. Tahap 1 — Horizon Visibilitas

**Prinsip:** bukan "sembunyikan yang di balik tembok", melainkan **"jangan gambar yang memang
tak pantas terlihat dari sini"**. Tidak butuh geometri gedung maupun sensor depth, sehingga
tetap benar walau lokalisasi meleset.

### 4.1 Komponen

**`clipPathToHorizon(points: Vector3[], horizonM: number): Vector3[]`** — fungsi murni.
Memotong polyline berdasarkan **panjang lintasan terakumulasi**, bukan jarak lurus. Titik
potong diinterpolasi tepat di batas horizon agar ujung jejak tidak berkedip saat user
berjalan. Tidak menyentuh state apa pun; dapat diuji terpisah.

Memakai panjang lintasan (bukan jarak lurus) disengaja: kalau jalur membelok di 6 m, user
tetap melihat sampai tikungan dan sedikit setelahnya — justru itu yang memberi tahu
"belok di sini".

**Pemakaian di `updateFloorTrail`** — polyline `[posisi user, ...waypoint tersisa]` dilewatkan
`clipPathToHorizon` sebelum chevron disebar. Logika penyebaran chevron tidak berubah.

**Gerbang pilar tujuan** — `destMarker.visible` hanya saat jarak horizontal ≤ `PILAR_M`.
Di luar itu tersembunyi; HUD tetap menampilkan `jarak X m → ikuti jalur di lantai ke Y`,
jadi tak ada informasi yang hilang.

**Peredupan tepi horizon** — **tiga chevron terakhir** diskalakan 0.75 / 0.5 / 0.25 (yang
terjauh paling kecil) agar tidak muncul/hilang mendadak saat user berjalan. Lewat **skala**,
bukan transparansi: menghindari sorting alpha dan alokasi material per-chevron. Kalau jejak
berisi kurang dari tiga chevron, ramp diterapkan sebanyak yang ada.

### 4.2 Batas yang tegas

Gating ini **hanya memengaruhi render**. Perhitungan jarak, kemajuan waypoint, deteksi
"SAMPAI", dan gerbang lintas-lantai (ADR-W007) tidak disentuh. Navigasi tetap mengetahui
seluruh rute; yang berubah hanya seberapa banyak yang digambar.

### 4.3 Nilai & override lapangan

| Konstanta | Default | Override | Arti |
|---|---|---|---|
| `HORIZON_M` | 8 m | `?horizon=` | panjang jejak yang digambar |
| `PILAR_M` | 12 m | `?pilar=` | jarak pilar tujuan mulai tampak |

`PILAR_M` sengaja **lebih besar** dari `HORIZON_M`: pilar menandai tujuan akhir, dan berguna
kalau ia sudah terlihat sesaat sebelum jejaknya sendiri sampai ke sana — user melihat "itu
tujuannya" lalu jejak menyusul. Kalau dibuat sama, pilar baru muncul persis saat jejak
berakhir dan efeknya terasa mendadak.

Override disediakan karena sejarah repo ini menunjukkan konstanta spasial selalu perlu
disetel setelah dicoba (`EYE_HEIGHT` baru ketahuan salah setelah pilar tenggelam ter-deploy),
dan satu perjalanan ke Jemursari terlalu mahal untuk terbuang hanya karena angkanya meleset.
Nilai non-numerik atau ≤ 0 jatuh ke default.

### 4.4 Keterbatasan yang diakui

- Dengan navgraph 3 node, horizon **mengurangi** tapi tidak menghilangkan jejak menembus
  tembok — 8 m pertama masih lurus menuju node yang jaraknya 34 m. Akarnya tetap navgraph.
- Pilar yang berjarak 5 m **di balik tembok tetap terlihat**. Hanya Tahap 2 yang
  menyelesaikannya.

---

## 5. Tahap 2 — Occluder mesh (occlusion sungguhan)

**Prasyarat mutlak:** `relativePose` terverifikasi dan mesh terbukti sejajar dengan koridor
nyata. Ini syarat yang sudah tertulis di ADR-W006 dan tidak boleh dilewati — occluder yang
posisinya salah mengklip objek di tempat keliru, dan karena `colorWrite:false` penyebabnya
tak terlihat sama sekali.

### 5.1 Urutan kerja

1. ~~**Verifikasi `relativePose`**~~ — ✅ **SELESAI 2026-07-30 (Uji 5), hipotesis terbukti:**
   - `MAP_BCADVLIXFSJE` (Lt 1, order 0): `relativePose` = **identitas**.
   - `MAP_MW1QTZWG1TLG` (Lt 2, order 1): geser `(-0.25, 3.94, 0.59)` + **rotasi 20.89° yaw
     murni** di sumbu Y. Di ujung koridor 30 m, yaw saja → meleset **11.4 m**.

   Ini menjelaskan "yang hancur selalu lantai 2" (Lt 1 identitas) dan "mesh miring"
   (yaw 20.89°). Rincian di `docs/FIELD-TESTS.md` Uji 5.
2. **Terapkan `relativePose` ke mesh.** SDK mengunduh mesh map **tunggal** (vertex di ruang
   map itu sendiri) lalu menerapkan `worldFromMap` (ruang **map-set**) tanpa `relativePose`
   — `relativePose` muncul 0 kali di seluruh dist SDK. Koreksinya: transformasi mesh menjadi
   `worldFromMap · relativePose`.
3. **Pasang material depth-only** (`colorWrite:false, depthWrite:true`) — memperbaiki dua
   cacat yang mencabut occlusion di ADR-W006:
   - **Waktu:** dipasang **setelah** mesh benar-benar masuk scene, bukan di
     `onLocalizationSuccess`. Urutan SDK: `onLocalizationSuccess` → `fetchMapDetails` →
     `ensureMeshLoaded` → `applyMeshTransform`, sehingga callback berjalan saat mesh belum ada.
   - **Lingkup:** dibatasi ke `meshGroup` milik SDK saja, bukan seluruh `scene`. Versi lama
     menjadikan *setiap* mesh non-panah sebagai occluder tak terlihat.
4. **Aktifkan `showMesh` di produksi** dan kembalikan pengurutan `d.mapCodes` berdasarkan
   `position.Y` (ADR-W001) yang kini digerbangi `SHOW_MESH`.

### 5.2 Keterbatasan yang diakui

Occluder mewarisi kesalahan lokalisasi: kalau anchor meleset 1–2 m, occluder ikut meleset
sejauh itu. Ia juga tidak meng-occlude benda bergerak (orang lewat) maupun perabot yang tidak
ada di mesh scan.

---

## 6. Pengujian

**Unit (Tahap 1).** `clipPathToHorizon` adalah satu-satunya logika non-trivial dan mendapat
satu cek `assert` yang bisa dijalankan:
- jalur lebih pendek dari horizon → dikembalikan utuh
- potongan jatuh di tengah segmen → titik akhir diinterpolasi benar
- batas jatuh persis di simpul → tanpa titik duplikat
- jalur kosong / satu titik → tidak melempar error

**Lapangan (Tahap 1).** Di Lt 2 Jemursari: jejak berhenti di sekitar horizon dan ujungnya
tidak berkedip saat berjalan; pilar tujuan muncul saat mendekat; HUD tetap menampilkan jarak
saat pilar tersembunyi. Bandingkan `?horizon=8` dengan `?horizon=999` untuk menyetel angka.

**Lapangan (Tahap 2).** `?mesh=true` di Lt 1 **dan** Lt 2 — mesh harus sejajar koridor di
KEDUANYA sebelum occluder dipasang. Sesudah occluder aktif: pilar di balik tembok tak terlihat,
dan chevron di koridor yang sama tetap utuh (bukan terpotong sembarangan).

## 7. Berkas yang disentuh

- `src/main.js` — seluruh perubahan Tahap 1 dan Tahap 2.
- `public/data/navgraph.json` — tidak disentuh desain ini (perbaikan akar gejala 1 ada di ADR-W009).
- `docs/DECISIONS.md` — ADR baru untuk Tahap 1; ADR-W006 diperbarui saat Tahap 2 mencabutnya.
- `docs/KNOWN-ISSUES.md` — status occlusion diperbarui tiap tahap.
