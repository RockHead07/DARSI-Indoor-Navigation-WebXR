# Arsitektur — DARSI WebXR

> **Status Repositori:** **Lab Spike** (Proof of Concept untuk membuktikan bahwa kombinasi WebXR + VPS dapat menggantikan Unity AR runtime pada navigasi dalam ruangan rumah sakit).

Dokumen arsitektur ini disusun dengan pendekatan berstandar Arc42 untuk mendokumentasikan konteks, pilihan teknologi, struktur komponen, serta alur data dari sistem navigasi WebXR DARSI.

---

## 1. Kenapa Repo Ini Ada

Repositori ini dibuat berdasarkan kebutuhan proyek dan temuan dari evaluasi sistem sebelumnya:

1. **Permintaan Dosen / Pemangku Kepentingan:** Menghilangkan ketergantungan pada runtime Unity di dalam aplikasi akhir (produk), serta membuka jalan untuk integrasi **3D AI Web Assistant** di masa depan.
2. **Pengurangan Ukuran Aplikasi (APK):** Runtime Unity via Unity as a Library (UaaL) menyumbang beban **365 MB** pada APK Android (`libil2cpp` 85 MB + `libunity` 22 MB + `data.unity3d` 19 MB + ARCore/OpenXR ~5 MB). Seluruh overhead ini hilang sepenuhnya ketika beralih ke jalur WebXR.
3. **Pembaruan Tanpa Melalui Play Store:** Logika navigasi, penyesuaian visual, dan data POI (*Point of Interest*) disimpan secara terpusat di server web/JSON, sehingga pembaruan dapat dideploy secara langsung tanpa perlu merilis pembaruan APK di Play Store.
4. **Batasan WebView & Platform (ADR-002-C):**
   - API `navigator.xr` **tidak tersedia** di dalam Android WebView bawaan. Oleh karena itu, halaman navigasi AR **wajib** dibuka melalui browser Chrome asli (menggunakan Chrome Custom Tab dari aplikasi Flutter MyRSIy).
   - Perangkat iOS **tidak didukung** karena Safari di iOS belum mendukung akses kamera WebXR (`camera-access`) untuk `immersive-ar` (telah terkonfirmasi di uji perangkat real).

---

## 2. Dua Alur — Unity Hanya di Authoring

Sistem ini memisahkan secara tegas antara alur pembuatan map/navigasi (*Authoring*) dan alur penggunaan oleh pengguna akhir (*Runtime*). Unity hanya digunakan sebagai **alat bantu authoring** (sekali per gedung) dan tidak dikirimkan (*shipped*) ke perangkat pengguna.

```
AUTHORING (Sekali per gedung, Unity sebagai ALAT — tidak dikirim ke pengguna)
  iPhone Pro (LiDAR) → Scan Gedung → MSET_xxx { MAP_lt0, MAP_lt1 }
  Unity Editor: Download Mapset → Bake NavMesh → Tempatkan POI → Generate Waypoints
               → Export Navigation Data → navigation_data.json / pois.json → Commit ke repo

RUNTIME (Pengguna akhir, TANPA Unity di perangkat)
  MyRSIy (App Flutter) → WebView (UI 2D) → User Tap "Navigasi AR"
    → Launch Chrome Custom Tab: https://darsi-webxr.vercel.app/ar?poiId=...
        three.js + @multisetai/vps + WebXR immersive-ar (ARCore tracking)
        VPS Localize → Pose + mapCodes → Deteksi Lantai → Transform worldFromMap → A* / Panah 3D
```

---

## 3. Tech Stack

Tabel berikut merangkum teknologi dan pustaka yang digunakan dalam repositori WebXR lab spike ini:

| Komponen / Lapis | Pilihan Teknologi | Deskripsi / Catatan |
|---|---|---|
| **AR Runtime** | WebXR `immersive-ar` | Tracking pergerakan dunia nyata berbasis ARCore di Chrome Android. |
| **VPS (Visual Positioning System)** | `@multisetai/vps` v2.3.1 | Pustaka `MultisetClient` dan `ThreeAdapter` untuk lokalisasi visual berbasis gambar kamera. |
| **Render Engine** | three.js (≥ 0.169.0) | Rendering grafik 3D Web (pilar penanda, chevron lantai, dan scene WebXR). |
| **Pathfinding** | A* (Direncanakan) | Algoritma A* sederhana (~40 baris) di atas graf `waypoints[].connectedWaypoints`. |
| **Build Tool** | Vite v5.4.0 | Bundler dan dev server modern untuk aplikasi web ESM. |
| **Hosting & Deployment** | Vercel | Hosting dengan dukungan HTTPS bawaan dan otomatisasi deployment dari Git. |
| **Browser Target** | Chrome Android 81+ | Mengaktifkan WebXR `immersive-ar` dengan dukungan ARCore bawaan. |
| **iOS Support** | ❌ Tidak Didukung | Safari di iOS belum mendukung WebXR `immersive-ar` (`camera-access` tidak ada). |

> **Catatan Arsitektur:** Kode inti dalam repo ini merupakan **lab spike**. Ke depan, kode akan diintegrasikan sebagai route `/ar` di aplikasi WebView Next.js `darsi-indoor-navigation-ui-webview`.

---

## 4. Paket & Import

Daftar pustaka utama dan tipe import yang digunakan dalam proyek:

| Kategori | Detail / Nilai |
|---|---|
| **Paket Utama** | `@multisetai/vps` (versi `^2.3.1`) |
| **Peer Dependencies** | `three` (versi `^0.169.0`) |
| **Kelas Utama SDK** | `MultisetClient`, `XRSessionManager`, `ThreeAdapter` |
| **Subpath Import** | `@multisetai/vps/core` (`MultisetClient`, `XRSessionManager`) <br> `@multisetai/vps/three` (`ThreeAdapter`) |
| **Loader 3D (three.js)** | `three/examples/jsm/loaders/GLTFLoader.js` |
| **SDK Lama (Deprekasi)** | `multiset-webxr-sdk` **DIARSIPKAN 2026-04-04** — Dilarang digunakan. |

---

## 5. Struktur Folder

Berikut adalah struktur folder dan berkas repositori `DARSI-Indoor-Navigation-WebXR`:

```
DARSI-Indoor-Navigation-WebXR/
├── .github/
│   └── workflows/          # Workflow CI/CD (GitHub Actions)
├── docs/                   # Dokumentasi proyek & Arc42 architecture
│   ├── ARCHITECTURE.md     # Arsitektur sistem (berkas ini)
│   ├── CICD-SETUP.md       # Konfigurasi integrasi & deployment Vercel
│   ├── DASHBOARD-CHECK-JEMURSARI.md # Verifikasi log & heatmap VPS MultiSet
│   ├── DEEPLINK-CONTRACT.md # Kontrak intent deep link ke Flutter MyRSIy
│   ├── ROADMAP-PATHFINDING.md # Rencana pengembangan navigasi A*
│   ├── SCAN-PROTOCOL.md    # Protokol pemindaian VPS MultiSet
│   └── superpowers/        # Rencana kerja & spesifikasi internal
├── public/                 # Asset statis yang disajikan langsung oleh web server
│   ├── data/
│   │   └── pois.json       # Basis data POI (Point of Interest)
│   │   └── navgraph.json   # Node koridor + edges untuk A* pathfinding
│   └── draco/              # Draco 3D mesh decoders (hanya dipakai saat ?mesh=true)
├── src/
│   ├── main.js             # Kode utama aplikasi (entry point spike WebXR)
│   └── horizon.js          # clipPathToHorizon — fungsi murni, bisa diuji dari Node
├── tools/
│   └── verify-mapcodes.mjs # Script utilitas verifikasi mapCodes VPS
├── .env.example            # Contoh variabel lingkungan
├── .env.local              # Variabel lingkungan lokal (client credentials VPS)
├── .gitignore              # Daftar berkas yang diabaikan Git
├── CLAUDE.md               # Panduan gaya & perintah proyek
├── index.html              # Entry HTML dengan container HUD dan canvas WebGL
├── package.json            # Manifest dependensi & skrip Vite
├── README.md               # Berkas acuan awal & temuan pengujian
└── vercel.json             # Konfigurasi routing & deployment Vercel
```

---

## 6. Komponen Utama (`src/main.js`)

Aplikasi dikelola secara terpusat pada berkas `src/main.js` yang terbagi ke dalam 6 komponen/alur utama:

### 6.1. Auth & VPS Connection (`MultisetClient`)
- Inisialisasi koneksi SDK `@multisetai/vps/core` dengan mengumpankan `clientId` dan `clientSecret` dari variabel lingkungan (`VITE_MS_CLIENT_ID`, `VITE_MS_CLIENT_SECRET`).
- Mengonfigurasi `mapType: 'map-set'`, kode mapset (`MSET_PKRKGGFB1RO0`), serta `hintMapCodes` (daftar kode map lantai untuk mempercepat lokalisasi).
- Memanggil `await client.authorize()` sebelum memulai sesi AR untuk memverifikasi kredensial dan CORS domain.

### 6.2. AR Session (`XRSessionManager`)
- Mengelola siklus hidup sesi WebXR `immersive-ar`.
- Menyiapkan konfigurasi sesi: `referenceSpaceType: 'local'`, **`autoLocalize: false`**, `relocalization: true`, `backgroundLocalization: true` (setiap 10 detik), dan `confidenceCheck: true` (threshold jatuh ke default SDK 0.5).
- **Lokalisasi pertama dipicu manual** setelah `ARCORE_WARMUP_MS` (1.5 dtk) di `onSessionStart`. `autoLocalize` bawaan SDK menembak di rAF berikutnya persis — saat tracking ARCore masih dingin, yang meracuni `worldFromMap` sejak lahir (ADR-W005).
- Menyediakan handler event `onSessionStart`, `onSessionEnd`, `onCameraIntrinsics`, `onLocalizationResult`, `onLocalizationFailure`, dan `onError`.

### 6.3. Localization & Floor Detection
- Menerima respons VPS melalui callback `onLocalizationResult`.
- **Deteksi Lantai berbasis `position.Y`:** Berdasarkan temuan pengujian lapangan (2026-07-22), elevasi `Y` pada koordinat mapset VPS bersifat absolut dan kokoh (`Y < 1.5m` = Lantai 1 `MAP_BCADVLIXFSJE`, `Y >= 1.5m` = Lantai 2 `MAP_MW1QTZWG1TLG`).
- Secara dinamis mengurutkan array `d.mapCodes` berdasarkan nilai `position.Y` agar `ThreeAdapter` memuat mesh lantai yang tepat. Urutan `mapCodes` hanyalah artefak urutan `hintMapCodes`, bukan peringkat kecocokan VPS (ADR-W001). Berjalan tanpa gerbang: saat mesh tidak dimuat ia tak berpengaruh apa pun (tak ada yang membaca urutannya), dan membiarkannya begitu berarti task occluder nanti tak perlu mengingat memasangnya kembali.

### 6.4. Navigation & Floor Chevron Trail
Penunjuk arah **tunggal** adalah chevron menapak lantai (ADR-W008). Panah 3D HUD sudah dihapus.

- **Destinasi Visual (`destMarker`):** Pilar silinder kuning berdiri di koordinat tujuan.
  Geometri silinder ber-origin di **tengah**, jadi origin-nya digeser ke **alas** sekali
  lewat helper `pillarGeo()` — sesudah itu semua penempatan cukup menaruh alas di lantai
  (`worldY − EYE_HEIGHT`) tanpa perlu mengingat setengah tinggi masing-masing pilar.
- **Chevron Trail (`floorTrailGroup`):** `THREE.ShapeGeometry` datar (di-`rotateX(-π/2)` agar
  rebah di bidang XZ) disebar tiap 0.5 m di sepanjang waypoint A*, 8 cm di atas lantai, dengan
  offset animasi berbasis `performance.now()` sehingga tampak berjalan maju.
- **Tinggi lantai:** diturunkan dari posisi **user** (`userWorldPos.y − EYE_HEIGHT`), bukan
  dari tujuan — user selalu berdiri di lantainya sendiri.
- **Loop Frame (`onXRFrame`):** posisi kamera diambil via `camera.getWorldPosition()`, trail
  diperbarui, dan waypoint aktif maju saat jarak `< 1.2 m`. Kalkulasi jarak mengabaikan beda
  tinggi (horizontal distance); saat waypoint terakhir tercapai HUD menampilkan `"SAMPAI"`.
- **Koreksi mesh (`patchMeshChildren`):** `relativePose` tiap map diterapkan ke anak
  `meshGroup` (grup-nya ditimpa SDK tiap localize). Dijalankan tiap frame karena SDK tak
  menyediakan callback "mesh siap". **Material depth-only occluder BELUM dipasang** —
  menunggu gerbang lapangan (ADR-W010, `docs/KNOWN-ISSUES.md`).
- **Horizon visibilitas:** `clipPathToHorizon()` memotong jejak berdasarkan panjang lintasan;
  pilar tujuan digerbangi jarak. Hanya memengaruhi render, bukan logika navigasi.

### 6.5. POI (Point of Interest)
- Memeriksa URL query string `?poiId=`. Jika ada, sistem membaca berkas `/data/pois.json` melalui `loadPoi(poiId)`.
- Mengonversi koordinat map-space POI (`poi.position`) menjadi world-space melalui perkalian matriks `worldFromMap`:
  `destination = mapPos.applyMatrix4(worldFromMap);`
- Menyediakan tombol utilitas **REKAM POI 📍** untuk merekam posisi `lastMapPos` VPS saat ini dalam bentuk cuplikan JSON untuk memfasilitasi pengambilan data koordinat POI di lapangan tanpa tergantung Unity.

### 6.6. Deep Link back to Flutter
- Mengatur alur kembali pengguna dari Chrome Custom Tab ke aplikasi Flutter MyRSIy melalui fungsi `returnToApp`.
- Memanfaatkan format skema URI Android `intent://ar-done?arrived=...#Intent;scheme=myrsiy;package=com.rsislam.surabaya.rs_islam_app;end` untuk memastikan navigasi kembali teratur dan tidak di-drop oleh browser Chrome.
- Dipicu saat pengguna menekan tombol **SELESAI ✓** pada antarmuka HUD.

---

## 7. Menempatkan POI — `worldFromMap`

Transformasi koordinat dari ruang peta VPS (*map-space*) ke ruang dunia tiga dimensi Three.js (*world-space*) ditangani oleh kelas `ThreeAdapter` melalui callback `onLocalizationSuccess(result, worldFromMap)`:

```javascript
// Transformasi koordinat titik POI dari VPS map-space ke Three.js world-space
const mapPoint = new THREE.Vector3(poi.position.x, poi.position.y, poi.position.z);
const worldPoint = mapPoint.applyMatrix4(worldFromMap);
destMarker.position.copy(worldPoint);
```

### Mengapa POI Direkam Langsung dari VPS (Bukan dari Unity)?
1. **Perbedaan System Handedness:** Unity menggunakan koordinat *left-handed* (sumbu Y ke atas, Z ke depan, X ke kanan), sedangkan Three.js / WebXR menggunakan sistem *right-handed* (sumbu Y ke atas, Z ke luar layar, X ke kanan). Perekaman langsung dari Unity berisiko menyebabkan misalignment sumbu X/Z atau pembalikan arah rotasi.
2. **Eliminasi Mismatch Frame Refrensi:** Dengan cara berdiri di titik POI fisik di lokasi, melakukan lokalisasi VPS, dan menekan tombol **REKAM POI 📍**, koordinat `lastMapPos` yang dicatat dipastikan berada dalam *frame mapset* VPS yang sama persis dengan yang dipakai oleh `worldFromMap` saat runtime.

---

## 8. Opsi Localize (`IXRSessionOptions`)

Konfigurasi parameter lokalisasi pada `XRSessionManager` disesuaikan untuk kebutuhan kestabilan navigasi indoor:

| Opsi | Default SDK | Nilai Terpasang di Project | Fungsi & Alasan Arsitektur |
|---|---|---|---|
| `autoLocalize` | `false` | `true` | Melakukan lokalisasi otomatis sesaat setelah sesi WebXR AR aktif. |
| `relocalization` | `false` | `true` | Otomatis melakukan re-lokalisasi ketika tracking kamera pulih dari *tracking loss* (misal saat keluar dari lift atau tangga). |
| `backgroundLocalization` | `false` | `true` | Melakukan lokalisasi berkala di latar belakang untuk mengoreksi *drift* odometri ARCore. |
| `bgLocalizationInterval` | `30` | `10` (detik) | Interval waktu background localization (10s = minimum SDK) agar koreksi posisi berjalan lebih frekuen. |
| `confidenceCheck` | `false` | `true` | Mengaktifkan pemfilteran kualitas hasil lokalisasi VPS. |
| `confidenceThreshold` | `0.5` | `0.6` | Menolak hasil lokalisasi yang memiliki konfidensi di bawah 0.6 untuk mengurangi risiko *false match*. |
| `referenceSpaceType` | `'local'` | `'local'` | Menggunakan *reference space* `'local'` yang didukung secara universal oleh seluruh implementasi WebXR browser. |

### Snippet Konfigurasi Mapset & Inisialisasi VPS

```javascript
// Inisialisasi MultisetClient untuk mapset gedung
const client = new MultisetClient({
  clientId: import.meta.env.VITE_MS_CLIENT_ID,
  clientSecret: import.meta.env.VITE_MS_CLIENT_SECRET,
  mapType: "map-set",
  code: "MSET_PKRKGGFB1RO0",
  hintMapCodes: ["MAP_BCADVLIXFSJE", "MAP_MW1QTZWG1TLG"],
  passGeoPose: true,    // Kirim GPS sebagai geo-hint tambahan
  use2DFiltering: true, // Abaikan altitude GPS yang tidak akurat di dalam gedung
});

// Autentikasi kredensial ke server MultiSet VPS
await client.authorize();
```

> ⚠️ **Catatan Keamanan & CORS:**
> 1. Pada versi spike ini, `clientId` dan `clientSecret` berada di client-side. Pada lingkungan produksi, proses `authorize()` wajib diforward melalui proxy backend (misal FastAPI) agar kredensial tidak terekspos.
> 2. Origin domain deployment (misal `https://darsi-webxr.vercel.app`) **WAJIB** terdaftar di whitelist dashboard MultiSet (*Credentials -> Settings -> Domains*), jika tidak maka proses `authorize()` akan gagal karena kebijakan CORS.
