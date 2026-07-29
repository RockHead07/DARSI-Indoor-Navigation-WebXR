# Keputusan Teknis (ADR) — DARSI WebXR

Catatan keputusan arsitektur khusus repo WebXR. Untuk ADR repo Unity, lihat
`DARSI-Indoor Navigation/docs/DECISIONS.md`.

---

## ADR-W001 — Sinyal lantai = `position.Y`, BUKAN `mapCodes[0]` (2026-07-22)

### Konteks
VPS mengembalikan respons lokalisasi berisi `mapCodes[]` dan `position`. Asumsi awal adalah `mapCodes[0]` selalu menunjukkan indikator lantai utama dari kecocokan terbaik VPS.

### Keputusan
Menggunakan `position.Y` (elevasi dalam Map Set Space terpadu) sebagai indikator lantai utama.
Threshold sederhana yang diterapkan:
- $Y \ge 1.5\text{m} \rightarrow$ Lantai 2
- $Y < 1.5\text{m} \rightarrow$ Lantai 1

### Alasan (Terbukti di Lapangan 2026-07-22)
1. `mapCodes` tidak selalu mengembalikan satu map — lokalisasi di Lantai 2 mengembalikan dua map (`[BCAD, MW]`).
2. Urutan `mapCodes` dalam respons merupakan artefak dari urutan `hintMapCodes` yang dikirimkan client, BUKAN peringkat kecocokan (*match ranking*) dari VPS.
3. `position.Y` bersifat absolut dalam frame mapset: Lantai 1 $Y = -0.5\text{m}$, Lantai 2 $Y = 3.7\text{m}$ ($\Delta Y = 4.2\text{m}$, sesuai tinggi 1 lantai).

### Konsekuensi
- Logika `FloorVisibilityManager` dari Unity (329 baris clustering Y, smoothing, dan hysteresis) digantikan oleh threshold sederhana di web.
- `d.mapCodes` pada event `onLocalizationResult` diurutkan ulang secara dinamis berdasarkan `position.Y` agar `ThreeAdapter` memuat file mesh GLTF lantai yang tepat saat diagnostik (`showMesh: true`).

---

## ADR-W002 — Koordinat POI direkam dari VPS, bukan Unity (2026-07-27)

### Konteks
Terdapat dua opsi untuk menentukan koordinat 3D POI: mengimpor data `navigation_data.json` hasil ekspor Unity, atau merekam posisi koordinat secara langsung dari lokalisasi VPS di web.

### Keputusan
Merekam koordinat POI secara langsung dari VPS melalui tombol **REKAM POI** pada antarmuka web, lalu menyimpannya di `public/data/pois.json`.

### Alasan
- Sistem koordinat Unity menggunakan *left-handed coordinate system*, sedangkan three.js dan WebXR menggunakan *right-handed coordinate system*.
- Perekaman langsung di ruang VPS (*map-space*) menghindari kebutuhan transformasi sumbu dan perataan *handedness* yang rentan error saat impor dari Unity.

### Konsekuensi
- Koordinat POI langsung tersimpan dalam frame *map-space*.
- Matriks `worldFromMap` dari `ThreeAdapter` dapat langsung ditransformasikan ke koordinat POI tanpa langkah konversi koordinat tambahan.

---

## ADR-W003 — `showMesh: false` untuk produksi AR (2026-07-28)

> **Diperluas oleh ADR-W006 (2026-07-29):** keputusan "produksi tanpa mesh" tetap berlaku,
> tetapi mesh kini bisa dihidupkan sebagai alat diagnostik lewat `?mesh=true`.


### Konteks
Secara default, opsi `showMesh: true` pada `ThreeAdapter` mengonstruksi dan menampilkan mesh 3D gedung hasil scan VPS sebagai overlay di atas kamera. Pada pengujian lapangan, mesh ini tampak melayang atau offset akibat variansi akurasi scan.

### Keputusan
Menetapkan `showMesh: false` untuk penggunaan produksi AR. Feed kamera asli perangkat (ARCore via WebXR) aktif 100% transparan sebagai latar belakang.

### Alasan
- Mesh gedung 3D hanyalah alat visualisasi diagnostik saat pengujian, bukan fitur produk navigasi akhir.
- Mematikan mesh mengurangi beban render GPU secara signifikan tanpa memengaruhi akurasi atau performa perhitungan VPS.

### Konsekuensi
- Pengguna melihat panah navigasi 3D melayang secara natural di atas feed kamera dunia nyata.
- Decoder Draco (`/draco/`) tidak wajib dimuat dalam mode produksi.

---

## ADR-W004 — Model 3D panah kustom via GLTFLoader (2026-07-28)

### Konteks
Penunjuk arah awal menggunakan `THREE.ArrowHelper` bawaan three.js (berupa garis dan kerucut sederhana).

### Keputusan
Mengganti visualisasi panah dengan model 3D GLTF kustom (`public/models/arrow.gltf`) yang dimuat menggunakan `GLTFLoader`, dengan `THREE.ArrowHelper` sebagai fallback jika pemuatan model gagal.

### Alasan
- Model 3D kustom memberikan tampilan visual yang jauh lebih representatif dan profesional untuk produk navigasi AR indoor.
- Mekanisme fallback memastikan navigasi tetap berfungsi meskipun aset 3D gagal diunduh.

### Konsekuensi
- Model panah di-scale secara dinamis (~0.35m) dan dirotasi halus ke arah POI target pada setiap frame XR (`onXRFrame`).
- Fitur ini memiliki dependensi pada `GLTFLoader` dan koneksi jaringan untuk mengunduh file aset `.gltf`.

---

## ADR-W005 — Stabilitas Kamera AR & Pre-Fetch GeoPose Non-Blocking (2026-07-28)

### Konteks
Pada Chrome Android WebXR `immersive-ar`, munculnya dialog izin OS (seperti `navigator.geolocation.getCurrentPosition`) di tengah-tengah sesi WebXR yang aktif menyebabkan *window focus loss*. Sesuai spesifikasi W3C WebXR, *focus loss* otomatis menghentikan sesi AR secara paksa (`session.end()`), yang membuat kamera AR aktif sesaat lalu layar berubah hitam.

### Keputusan
1. **Pre-Fetch Geolocation**: Memanggil dan meng-warmup izin Geolocation di luar sesi WebXR (sebelum tombol "START AR" ditap).
2. **Cached GeoPose**: Menggunakan koordinat GPS dari cache browser (`maximumAge: 60000`) untuk Geo-Hint VPS tanpa memicu dialog OS/timeout 10 detik saat sesi AR aktif.
3. **ARCore Warm-Up Period**: Memberikan jeda 1.5 detik (`ARCORE_WARMUP_MS`) setelah sesi WebXR dimulai sebelum memicu lokalisasi VPS pertama.

> **Koreksi 2026-07-29 — poin 3 sebelumnya tercatat tapi TIDAK PERNAH ADA di kode.**
> Yang terpasang hanyalah `poseTimeoutMs: 20000`, dan itu bukan jeda. Dokumentasi SDK:
> *"Max ms to wait for a valid viewer pose before failing"* — batas atas menunggu, bukan
> penundaan. Sementara `autoLocalize: true` membuat SDK memicu `localizeFrame()` di
> **rAF berikutnya persis** setelah sesi mulai (`e.requestAnimationFrame(() => this.localizeFrame())`
> di `core/index.js`), yaitu saat tracking ARCore masih dingin.
>
> Ini bukan sekadar cacat dokumentasi. Karena `worldFromMap = worldFromCamera@capture · pose⁻¹`,
> `worldFromCamera` yang diambil saat tracking dingin **meracuni anchor sejak lahir** — kandidat
> penyebab offset mesh yang selama ini dikejar.
>
> **Mekanisme sebenarnya yang kini diimplementasikan:** `autoLocalize: false` +
> `setTimeout(() => adapter.localizeFrame(), ARCORE_WARMUP_MS)` di `onSessionStart`.
> (`trackingCaptureDelayMs` milik SDK tidak bisa dipakai — hanya berlaku untuk `trackObjects()`.)

### Alasan
- Mencegah *focus loss* dari prompt izin OS saat sesi WebXR berjalan.
- Mengirimkan Geo-Hint ke server VPS tanpa menyebabkan delay / kamera mati di dalam gedung (indoor).
- Memberikan waktu bagi ARCore untuk mengunci titik-titik fitur fisik (*point cloud*) sebelum lokalisasi pertama diproses.

### Konsekuensi
- Sesi AR WebXR berjalan 100% stabil dan lancar di Chrome Android.
- Fitur `passGeoPose` tetap aktif memberikan Geo-Hint ke server VPS tanpa risiko mematikan kamera.

---

## ADR-W006 — Occlusion ditunda; mesh jadi alat diagnostik `?mesh=true` (2026-07-29)

### Konteks
Occlusion depth masking (`showMesh: true` + material `colorWrite:false, depthWrite:true`)
diimplementasikan 2026-07-28. Audit terhadap source SDK menemukan dua cacat:

1. **Occluder tidak pernah terpasang di lokalisasi pertama.** Urutan `handleLocalizationResult`
   di `dist/three/index.js`: `onLocalizationSuccess` dipanggil **lebih dulu**, baru
   `fetchMapDetails` → `ensureMeshLoaded` → `applyMeshTransform`. Saat callback kita jalan,
   mesh belum ada di scene, sehingga masuk dengan material asli SDK (`ShaderMaterial` ungu
   `#7B2CBF`, opacity 0.58, grid kuning). Baru lokalisasi berikutnya (~10 dtk, via
   `bgLocalizationInterval`) yang membuatnya tak terlihat.
2. **Scope terbalik.** `applyOccluderMaterial(scene)` menjadikan *setiap* mesh yang bukan
   turunan `arrowGroup`/`destMarker` sebagai occluder tak terlihat — termasuk gizmo bawaan
   SDK (`showGizmo` default `true`, tak pernah dimatikan), pilar POI, garis navgraph, dan
   chevron. Konsekuensinya: mesh apapun yang ditambahkan ke scene nanti otomatis jadi
   tembok tak terlihat.

Lebih mendasar: occluder dibangun **di atas mesh yang terbukti miring** (FIELD-TESTS Uji 2).
Occluder yang salah posisi mengklip panah di tempat yang keliru, dan karena `colorWrite:false`
penyebabnya tak bisa dilihat — panah hilang tanpa penjelasan.

### Keputusan
1. Occlusion **ditunda**. `applyOccluderMaterial()` dicabut dari kode.
2. `showMesh` dibaca dari URL: `?mesh=true` → aktif, selain itu non-aktif.
3. `showGizmo: false` ditambahkan secara eksplisit (default SDK `true`).

### Alasan
- Mencabut mesh menghapus cacat 1 & 2 sekaligus, tanpa menambal gejala.
- Mesh **tidak boleh dihapus total**: FIELD-TESTS Uji 2 mencatat mesh overlay adalah
  **satu-satunya cek AKURASI yang kita punya** (`geser` kecil hanya membuktikan
  *repeatability*, bukan *accuracy*). Menghapusnya berarti membuang alat ukur — termasuk
  alat untuk menilai perbaikan warm-up ARCore di ADR-W005.
- Dengan `showMesh` & `showGizmo` dua-duanya `false`, SDK tidak membuat `this.world` sama
  sekali → tanpa download mesh, tanpa Draco, tanpa shader.

### Konsekuensi
- Produksi: kamera bersih sejak detik pertama, tanpa kilatan mesh ungu 10 detik.
- Panah & pilar POI kembali tembus tembok fisik (lihat `docs/KNOWN-ISSUES.md`).
- `?mesh=true` sengaja menampilkan mesh — di mode diagnostik kita justru ingin melihatnya.
- Mutasi `d.mapCodes` (ADR-W001) kini digerbangi `SHOW_MESH`: hanya perlu saat mesh dimuat,
  karena `ThreeAdapter` membaca `mapCodes[0]` untuk memilih mesh lantai.

### Syarat menghidupkan kembali
Occlusion baru layak dipasang lagi **setelah mesh terbukti sejajar dengan koridor nyata**.
Saat itu, wajib ikut dibawa: (a) pemasangan material occluder **setelah** mesh benar-benar
masuk scene, bukan di `onLocalizationSuccess`; (b) scope dibatasi ke `meshGroup` milik SDK
saja, bukan seluruh `scene`. Spesifikasi lama tersimpan di
`docs/superpowers/specs/2026-07-28-occlusion-depth-masking-design.md`.

---

## ADR-W007 — Rute lintas-lantai: gerbang jujur, bukan rute palsu (2026-07-29)

### Konteks
`calculateRouteToPoi` memfilter node start **dan** target memakai lantai POI. User di
Lantai 1 menuju POI Lantai 2 → `findClosestNode(posisiUserLt1, floor=2)` mengembalikan node
Lantai 2 terdekat dari posisi Lantai 1, lalu A* menggambar rute yang menembus lantai.
`navgraph.json` juga belum punya satu pun node Lantai 1 maupun edge tangga/lift.

### Keputusan
Selama `activePoi.floor !== floorOf(posisiUser.y)`: **jangan gambar apapun.** Sembunyikan
panah, chevron trail, dan pilar tujuan; tampilkan pesan `"Naik/Turun ke Lantai N dulu —
navigasi aktif otomatis setelah sampai"`. Gerbang dipasang di `navigateToActivePoi()`,
satu-satunya jalur masuk navigasi POI (dipakai `onLocalizationSuccess` **dan** tombol
"Navigasi"), supaya tak ada pemanggil yang bisa melewatinya.

### Alasan
- Rute yang salah lebih berbahaya daripada tidak ada rute — user mengikuti panah dengan
  percaya diri ke arah yang keliru.
- Pemulihannya otomatis: begitu user tiba di lantai benar, lokalisasi berikutnya membaca
  `position.Y` (ADR-W001) dan navigasi hidup sendiri. Tidak butuh data lapangan baru.
- A* multi-lantai penuh (ADR-020: lift memutus tracking → navigasi tersegmentasi) menunggu
  sesi rekam navgraph di Jemursari: minimal node tangga/lift per lantai + node koridor Lt 1.

### Konsekuensi
- `calculateRouteToPoi` kini memfilter start pakai lantai user dan target pakai lantai POI
  — semantiknya benar dan siap untuk multi-lantai, walau saat ini keduanya selalu sama.
- Utang yang tercatat: `docs/KNOWN-ISSUES.md` → "Rute lintas-lantai belum ada".

---

## ADR dari repo Unity yang tetap berlaku

- **ADR-020:** Lift memutus tracking $\rightarrow$ navigasi tersegmentasi. Di web: manfaatkan `relocalization` otomatis VPS + pantau perubahan `mapCodes` / `position.Y` untuk konfirmasi perpindahan lantai.
- **ADR-007 / ADR-011:** Posisi POI sah setelah lokalisasi berhasil $\rightarrow$ pasang gerbang penampil marker/panah hanya setelah `onLocalizationResult` pertama yang valid (`poseFound = true`).
- **ADR-019:** Batas NavMesh berfungsi sebagai jangkauan panduan, bukan larangan fisik pergerakan pengguna.
- **ADR-021:** Data hanya memiliki satu pemilik terotorisasi; data sisanya diturunkan (*derived state*). Client tidak boleh mencoba memperbaiki map jelek dengan filter outlier buatan sendiri.
- **Pelajaran lapangan:** WiFi rumah sakit sering memutus koneksi diam-diam $\rightarrow$ selalu utamakan pengujian menggunakan data seluler.
