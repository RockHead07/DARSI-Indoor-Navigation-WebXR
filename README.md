# DARSI Indoor Navigation — WebXR

Riset & keputusan awal untuk memindahkan **runtime AR** DARSI dari Unity (UaaL) ke
**WebXR di web**. Dokumen ini adalah **acuan asli** — API/angka diverifikasi dari
**type definition terkirim `@multisetai/vps@2.3.1`** (`dist/**/*.d.ts`), dan sejak
2026-07-22 sebagian **terverifikasi di perangkat** (lihat §3).

Sumber: `npm pack @multisetai/vps` → `package/dist/`.

---

## 0. Kenapa repo ini ada

- **Dosen minta tanpa Unity di produk**, ke depan integrasi **AI assistant 3D web**.
- **Ukuran aplikasi**: APK UaaL sekarang **365 MB** (libil2cpp 85 + libunity 22 +
  data.unity3d 19 + ARCore/OpenXR ~5). Semua hilang di jalur WebXR.
- **Update tanpa Play Store**: logika navigasi & data POI jadi web/JSON → deploy.

Batasan keras (ADR-002-C repo Unity): `navigator.xr` **tak ada di Android WebView** →
halaman AR **wajib** Chrome asli (Custom Tab). iOS tak didukung (Safari tanpa
`camera-access`) — **terkonfirmasi di perangkat 2026-07-22**: iPhone menampilkan
"WebXR immersive-ar tidak didukung", persis seperti seharusnya.

---

## 1. Dua alur — Unity hanya di authoring, bukan produk

```
AUTHORING (sekali per gedung, Unity = ALAT, tidak dikirim)
  iPhone Pro (LiDAR) → scan → MSET_xxx { MAP_lt0, MAP_lt1 }
  Unity: download mapset → bake NavMesh → tempatkan POI → Generate Waypoints
         → Export Navigation Data → navigation_data.json → commit ke repo ini

RUNTIME (user, TANPA Unity)
  MyRSIy (Flutter) → WebView (UI 2D) → tap "Navigasi AR"
    → Chrome Custom Tab: https://darsi…/ar?poiId=…
        three.js + @multisetai/vps + WebXR immersive-ar (ARCore = tracking)
        VPS localize → pose + mapCodes → LANTAI → navigation_data.json → A* → panah
```

Unity belum bisa dilepas total: penempatan POI 3D & generate waypoint belum ada
penggantinya di web (butuh editor three.js + `recast-navigation-js` — YAGNI sekarang).

---

## 2. Paket & platform (terverifikasi)

| Fakta | Nilai |
|---|---|
| Paket | `@multisetai/vps` **v2.3.1** |
| Peer dep | `three >= 0.169.0` |
| Kelas | `MultisetClient`, `XRSessionManager`, `ThreeAdapter` |
| Import | `@multisetai/vps/core`, `@multisetai/vps/three` |
| Browser | Chrome 81+ Android + ARCore, `immersive-ar`, HTTPS |
| iOS | ❌ (`camera-access` absen) |
| Repo lama | `multiset-webxr-sdk` **DIARSIP 2026-04-04** — jangan dipakai |

---

## 3. TEMUAN KUNCI — lantai diketahui dari `mapCodes`

Type asli:
```ts
interface ILocalizeResponse {
  poseFound: boolean;
  position: { x; y; z }; rotation: { x; y; z; w };
  confidence: number;
  mapIds: string[]; mapCodes: string[];   // ← map yang cocok = LANTAI
  responseTime: number;
}
```

**Konsekuensi:** `FloorVisibilityManager` Unity (329 baris clustering Y + smoothing +
hysteresis + 018-A) bisa **diganti satu lookup `mapCode → lantai`**. Versi web lebih
sederhana DAN lebih benar — lantai otoritatif dari VPS, bukan ditebak dari tinggi kamera.

### ✅ HASIL LAPANGAN 2026-07-22 (TECNO KL7, Android 14, data seluler, RS Jemursari)

Halaman uji `darsi-webxr.vercel.app` (mapset `MSET_PKRKGGFB1RO0`, 2 lantai), KEDUA lantai teruji:

| Uji | Hasil |
|---|---|
| WebXR immersive-ar jalan di browser | ✅ `sesi: AKTIF`, feed kamera + HUD overlay |
| auth (CORS + kredensial) | ✅ `auth: OK` |
| VPS localize dari web | ✅ `poseFound=true`, conf 0.648–0.693 |
| `worldFromMap` anchoring | ✅ 3 bola penanda menempel di ruang |
| **`mapCodes` diskriminasi lantai** | ✅ **TERBUKTI** (lihat di bawah) |

```
Lantai 1:  mapCodes = [MAP_MW1QTZWG1TLG]                     ← 1 kode
Lantai 2:  mapCodes = [MAP_BCADVLIXFSJE, MAP_MW1QTZWG1TLG]   ← 2 kode, BCAD di depan
```

**KOREKSI 2× (jujur — kedua asumsi awal keliru):**
1. `mapCodes` TIDAK selalu satu map — lantai 2 balas dua (koridor RS antar-lantai mirip,
   VPS cocok di keduanya).
2. Urutannya **BUKAN peringkat kecocokan.** Lantai 2 balas `[BCAD, MW]` = **persis urutan
   `hintMapCodes` yang ditulis di `main.js`** (`['MAP_BCADVLIXFSJE','MAP_MW1QTZWG1TLG']`).
   Jadi `mapCodes[0]` = artefak urutan hint, **bukan** sinyal lantai. Jangan andalkan.

**Sinyal lantai yang benar (dari data lapangan):**
- **Kehadiran**, bukan urutan: `BCAD` muncul HANYA di lantai 2; lantai 1 = `[MW]` saja.
  VPS mengembalikan subset hint yang cocok. Cukup untuk 2 lantai, ribet untuk >2.
- **Lebih kokoh (perlu verifikasi):** `position` hasil localize dalam frame **mapset**
  (semua map di-align via `relativePose`) — Y-nya mengkodekan tinggi/lantai langsung,
  stabil (tidak seperti Y-kamera). Ini kandidat sinyal lantai utama, bukan `mapCodes`.
- Respons hanya punya SATU `confidence` (0.648–0.693), tak ada confidence per-map → tak
  bisa me-ranking map dari respons.

**Eksperimen belum dijalankan (lain waktu):** balik `hintMapCodes` → `[MW, BCAD]`, redeploy,
localize lantai 2. Bila hasil ikut balik → urutan = urutan hint (artefak) terkonfirmasi.

**§3 status:** diskriminasi lantai **TERBUKTI** (BCAD hanya di lantai 2). Cara membaca lantai
dari respons **belum final** — condong ke `position.y` frame-mapset, bukan `mapCodes[0]`.

---

## 3.5 ⛔ BLOCKER UTAMA — localize map Jemursari TIDAK STABIL (lapangan 2026-07-22)

Diukur di HUD (`anchor geser/relocalize` = pergeseran origin-map di world antar-localize):

| conf | mapCodes | geser antar-localize |
|---|---|---|
| 0.817 | 1 map | **25.5 m** |
| 0.780 | 1 map | **5.2 m** |
| 0.543 | 2 map (ambigu) | **59.8 m** |

**Ini salah-lokalisasi berat, bukan variansi kecil.** VPS mengunci ke lokasi mirip-tapi-salah
(koridor RS berulang & mirip antar-lantai). Confidence pun tak bisa jadi filter: `conf 0.82`
tetap meleset 25 m.

**Konsekuensi keras:**
- Navigasi **world-anchored** (drop-pin) JALAN — pilar tujuan stabil, "sampai" terdeteksi.
- Navigasi **map-anchored** (gizmo, POI asli) RUSAK — titik lompat 5–60 m.
- Karena POI asli wajib map-anchored, **navigasi POI diblokir sampai localize stabil.**

**Ini masalah MAP, bukan WebXR.** VPS & map sama → app Unity dgn map ini sama kacaunya.

**Band-aid ditolak (best practice):** filter tolak-outlier di client sempat dibuat lalu
**dibuang** — ia menyembunyikan gejala, dan bisa mengunci fix pertama yang salah lalu menolak
yang benar. Map jelek tak bisa diselamatkan dari client (sejalan ADR-021: obati penyebab).

**Jalan keluar (urut):**
1. **Cek Localization Heatmap** map Jemursari di dashboard MultiSet → bukti scan jelek.
2. **Ukur `geser` di map A. Yani** (target sebenarnya; butuh di lokasi). Jemursari cuma
   scan latihan — instabilitasnya mungkin tak relevan.
3. Kalau perlu, **scan ulang** lebih rapat & kaya fitur.
4. **Baru** bangun setup POI + navigasi di atas map yang localize stabil.

---

## 4. Menempatkan POI — `worldFromMap` (terverifikasi tipe)

`ThreeAdapter.onLocalizationSuccess(result, worldFromMap: THREE.Matrix4)` mentransform
titik ruang-map VPS → ruang dunia three.js:
```ts
marker.position.copy(mapPoint.applyMatrix4(worldFromMap));
```
`navigation_data.json` (`pois[].position` dari Unity) langsung dipakai. `showMesh:false` —
tak perlu render mesh gedung; dunia nyata itu visualnya.
⚠️ Handedness: Unity kiri, three.js/WebXR kanan — koordinat POI Unity mungkin perlu
konversi sumbu saat diimpor; buktikan sebelum mengandalkan transfer langsung.

---

## 5. Opsi localize (terverifikasi `IXRSessionOptions`)

| Opsi | Default | Fungsi |
|---|---|---|
| `autoLocalize` | — | localize sekali saat sesi mulai |
| `relocalization` | — | re-localize saat tracking pulih |
| `backgroundLocalization` | — | localize periodik di latar |
| `bgLocalizationInterval` (10–180 s) | 30 | jeda background localize |
| `confidenceCheck` / `confidenceThreshold` (0.2–0.8) | 0.5 | tolak hasil berkonfidens rendah |
| `referenceSpaceType` | `'local'` | frame acuan XR |

Config mapset:
```ts
new MultisetClient({ clientId, clientSecret, mapType:'map-set',
  code:'MSET_PKRKGGFB1RO0', hintMapCodes:['MAP_BCADVLIXFSJE','MAP_MW1QTZWG1TLG'] });
await client.authorize();
```
⚠️ **Keamanan:** kredensial client ikut ter-bundle. Produksi → proxy `authorize()` lewat
backend FastAPI; browser hanya terima token. (Spike ini masih client-side.)
⚠️ **CORS:** origin (mis. `https://darsi-webxr.vercel.app`) WAJIB di-whitelist di dashboard
MultiSet → Credentials → Settings → Domains, atau `authorize()` gagal CORS.

---

## 6. Tech stack

| Lapis | Pilihan |
|---|---|
| AR runtime | WebXR `immersive-ar` (tracking = ARCore) |
| VPS | `@multisetai/vps` v2.3.1 (`MultisetClient` + `ThreeAdapter`) |
| Render | three.js ≥0.169 |
| Pathfinding | A* buatan sendiri (~40 baris) di atas `waypoints[].connectedWaypoints` |
| Framework | **route `/ar` di app Next.js WebView yang ADA** (bukan repo/app baru) |
| Hosting | Vercel (HTTPS bawaan, rollback per-deploy) |

Repo ini = **lab spike**. Kode inti nanti dipindah jadi route `/ar` di
`darsi-indoor-navigation-ui-webview`, memakai ulang `lib/api.ts` + UI 2D.

---

## 7. ADR yang tetap berlaku (repo Unity)

- **ADR-020** — lift memutus tracking → navigasi tersegmentasi. Web: `relocalization`
  + pantau perubahan `mapCodes` untuk konfirmasi lantai.
- **ADR-007/011** — posisi POI sah setelah localize → gerbang marker pada
  `onLocalizationResult` pertama.
- **ADR-019** — batas NavMesh = jangkauan panduan, bukan larangan fisik.
- **ADR-021** — data punya satu pemilik; sisanya diturunkan.

Pelajaran lapangan: WiFi RS menelan koneksi diam-diam → uji dgn seluler; `poiCollider`
< 1 m dari permukaan; lantai jangan dari satu sampel instan.

---

## 8. Gerbang keputusan berikutnya

0. **⛔ BLOCKER: localize stabil** (§3.5) — map Jemursari lompat 5–60 m. **Semua di bawah
   ini (POI, navigasi) diblokir sampai ada map yang localize < ~1 m.** Cek heatmap +
   uji A. Yani dulu.
1. **Larangan Unity** — produk saja atau di mana pun? Tanya dosen (1 kalimat).
2. **Alur balik Chrome → Flutter** — `arSessionClosed` sekarang panggilan langsung ke
   WebView hidup; Custom Tab tak punya itu. Kandidat deep link
   `myrsiy://ar-done?arrived=true&poiId=…`. Belum dibuktikan.
3. **Setup POI** (setelah blocker #0 beres) — cara terbersih = **tandai di web**: berdiri
   di POI, localize, rekam `position` map-space, simpan. Menghindari transfer koordinat
   Unity + handedness. Impor `navigation_data.json` = alternatif tapi butuh solve frame.

---

## Status

- [x] Riset SDK — API terverifikasi dari `.d.ts` v2.3.1
- [x] Temuan `mapCodes` (tipe) — lantai otoritatif dari VPS
- [x] `worldFromMap` — penempatan POI terkonfirmasi (tipe)
- [x] **Perangkat: WebXR+VPS jalan, auth OK, localize poseFound=true, worldFromMap
      anchoring OK** (TECNO KL7, 2026-07-22)
- [x] iOS unsupported — terkonfirmasi di iPhone
- [x] **Diskriminasi lantai TERBUKTI** — `BCAD` hanya muncul di lantai 2 (kedua lantai teruji)
- [x] **Loop navigasi world-anchored JALAN** — drop-pin + panah + jarak + "sampai" (device)
- [x] **⛔ BLOCKER ditemukan: localize map Jemursari lompat 5–60 m** (§3.5) — memblokir POI/navigasi
- [ ] **Cek Localization Heatmap Jemursari** (dashboard MultiSet) — bukti scan jelek?
- [ ] **Ukur `geser` map A. Yani** (target sebenarnya; butuh di lokasi)
- [ ] **Cara baca lantai dari respons belum final** — `mapCodes[0]` artefak hint; uji `position.y`
- [ ] Desain alur balik Chrome→Flutter
- [ ] Konfirmasi lingkup larangan Unity ke dosen
- [ ] Setup POI (tandai-di-web) — HANYA setelah blocker localize beres
- [ ] Pindah kode inti → route `/ar` di app Next.js WebView

---

## Deploy (spike)

Repo ter-link ke Vercel project `darsi-webxr` (`prj_PgPqbwLJJ8oymW2xHnbtsLkELMSX`).
Env `VITE_MS_CLIENT_ID`/`VITE_MS_CLIENT_SECRET` di-set di Vercel (di-inline saat build).
Framework: Vite (`vercel.json`). Deploy: `npx vercel --prod --yes`.
Live: `https://darsi-webxr.vercel.app`.
