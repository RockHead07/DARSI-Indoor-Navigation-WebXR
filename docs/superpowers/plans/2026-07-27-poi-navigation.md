# POI Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan sistem navigasi berbasis POI ke DARSI WebXR — baca `?poiId=` dari URL, arahkan panah AR ke koordinat POI dari `pois.json`, dan sediakan tombol REKAM POI untuk pengisian data lapangan.

**Architecture:** Semua logika tetap di `src/main.js` (mengikuti pola yang ada). Data POI disimpan di `public/data/pois.json` sebagai static file yang di-fetch saat startup. Mode navigasi aktif hanya jika `?poiId=` ada di URL; tanpa parameter itu, semua tombol developer lama tetap muncul.

**Tech Stack:** Vite · three.js · `@multisetai/vps` v2.3.1 · Vanilla JS (ES modules) · Browser Geolocation API

## Global Constraints

- **Dilarang panggil `renderer.setPixelRatio()`** — merusak intrinsics kamera SDK.
- **Gunakan `camera.getWorldPosition()` / `getWorldDirection()`** — bukan `camera.position` (basi di sesi XR).
- **`referenceSpaceType: 'local'`** harus tetap dipertahankan.
- Tidak ada framework test — verifikasi via browser manual. Setiap task berakhir dengan langkah verifikasi di browser.
- Commit per task, bukan di akhir semua task.
- Tidak ada file baru di `src/` — semua tambahan ke `main.js`.
- Koordinat POI di `pois.json` adalah map-space VPS (right-handed, tidak perlu konversi sumbu).

---

## File yang Diubah

| File | Aksi | Tanggung Jawab |
|---|---|---|
| `public/data/pois.json` | **Buat baru** | Database POI statis — sumber kebenaran koordinat map-space |
| `src/main.js` | **Modifikasi** | Semua logika: loadPoi, anchorPoiDest, state machine, REKAM POI, passGeoPose |

---

### Task 1: Buat `public/data/pois.json` dengan data placeholder

**Files:**
- Create: `public/data/pois.json`

**Interfaces:**
- Produces: objek POI dengan shape `{ id: string, name: string, floor: number, mapCode: string, position: { x: number, y: number, z: number } }`

- [ ] **Step 1: Buat file `public/data/pois.json`**

```json
{
  "mapSetCode": "MSET_PKRKGGFB1RO0",
  "pois": [
    {
      "id": "CONTOH_PLACEHOLDER",
      "name": "Titik Uji Placeholder",
      "floor": 1,
      "mapCode": "MAP_BCADVLIXFSJE",
      "position": { "x": -1.9, "y": -0.5, "z": 34.3 }
    }
  ]
}
```

> Koordinat ini diambil dari temuan lapangan 2026-07-22 (lantai 1, posisi nyata). Akan diganti via REKAM POI setelah ke lokasi dengan map stabil.

- [ ] **Step 2: Verifikasi file bisa diakses**

Jalankan dev server:
```
npm run dev
```
Buka browser: `http://localhost:5173/data/pois.json`

Expected: JSON tampil dengan benar di browser.

- [ ] **Step 3: Commit**

```bash
git add public/data/pois.json
git commit -m "feat: tambah pois.json dengan data placeholder lantai 1"
```

---

### Task 2: Aktifkan `passGeoPose` di MultisetClient

**Files:**
- Modify: `src/main.js:55-60`

**Interfaces:**
- Consumes: `MultisetClient` config (baris 55–60 di `main.js`)
- Produces: Client yang menyertakan GPS hint di setiap request localize

- [ ] **Step 1: Tambah `passGeoPose` dan `use2DFiltering` ke config MultisetClient**

Ubah blok ini (baris 55–60):
```js
// SEBELUM
const client = new MultisetClient({
  clientId: ID, clientSecret: SECRET,
  mapType: "map-set", code: MAPSET, hintMapCodes: FLOORS,
  // isRightHanded default true = BENAR ...
});
```

Menjadi:
```js
// SESUDAH
const client = new MultisetClient({
  clientId: ID, clientSecret: SECRET,
  mapType: "map-set", code: MAPSET, hintMapCodes: FLOORS,
  passGeoPose: true,    // kirim GPS browser ke VPS sebagai geo-hint (eksperimental)
  use2DFiltering: true, // skip altitude GPS — tidak akurat di dalam gedung
  // isRightHanded default true = BENAR (Tahap A terbukti: false memirror sumbu X → lt1
  // ambruk, lt2 geser 12m). Jadi tilt lt2 BUKAN handedness. Jangan diutak-atik lagi.
});
```

- [ ] **Step 2: Verifikasi di browser**

Buka `http://localhost:5173`. Buka DevTools → Console.
Browser harus menampilkan popup izin lokasi (atau langsung menggunakan jika sudah pernah diizinkan).

Expected: Tidak ada error di console terkait `passGeoPose`. Localize tetap berjalan normal.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: aktifkan passGeoPose + use2DFiltering (geo-hint eksperimental)"
```

---

### Task 3: Deteksi URL param `?poiId=` dan fungsi `loadPoi()`

**Files:**
- Modify: `src/main.js` — tambah di atas fungsi `main()`, di dalam `main()` sebelum `client.authorize()`

**Interfaces:**
- Produces:
  - `activePoi` — variabel modul: `null` | `{ id, name, floor, mapCode, position: { x, y, z } }`
  - `poiMode` — `boolean`, `true` jika `?poiId=` ada dan POI ditemukan

- [ ] **Step 1: Tambah `loadPoi()` di atas fungsi `main()`**

Sisipkan setelah baris `const fail = ...` (setelah baris 44), sebelum baris `const ID = ...`:

```js
// --- POI: load dari pois.json berdasarkan ?poiId= di URL ---
async function loadPoi(poiId) {
  try {
    const res = await fetch("/data/pois.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const db = await res.json();
    return db.pois.find((p) => p.id === poiId) ?? null;
  } catch (e) {
    return null; // fetch gagal → fallback ke Mode Developer
  }
}
```

- [ ] **Step 2: Tambah deteksi URL dan pemanggilan `loadPoi()` di awal `main()`**

Sisipkan di dalam `async function main()` setelah baris `if (!(await ThreeAdapter.isSupported()))` (setelah baris 53), sebelum `const client = new MultisetClient(...)`:

```js
// --- deteksi mode POI vs Developer ---
const urlParams = new URLSearchParams(window.location.search);
const rawPoiId = urlParams.get("poiId");
let activePoi = null;
const poiMode = rawPoiId !== null;

if (poiMode) {
  activePoi = await loadPoi(rawPoiId);
  if (!activePoi) {
    // POI tidak ditemukan — tampilkan error lalu lanjut sebagai Mode Developer
    state.nav = `POI '${rawPoiId}' tidak ditemukan.`;
    draw();
  } else {
    state.nav = `Menuju ${activePoi.name} — arahkan kamera untuk lokalisasi...`;
    draw();
  }
}
```

- [ ] **Step 3: Verifikasi — URL tanpa ?poiId=**

Buka `http://localhost:5173`

Expected: HUD `navigasi: tekan SET TUJUAN` (tidak ada perubahan dari sebelumnya).

- [ ] **Step 4: Verifikasi — URL dengan poiId valid**

Buka `http://localhost:5173/?poiId=CONTOH_PLACEHOLDER`

Expected: HUD `navigasi: Menuju Titik Uji Placeholder — arahkan kamera untuk lokalisasi...`

- [ ] **Step 5: Verifikasi — URL dengan poiId tidak ada**

Buka `http://localhost:5173/?poiId=TIDAK_ADA`

Expected: HUD `navigasi: POI 'TIDAK_ADA' tidak ditemukan.`

- [ ] **Step 6: Commit**

```bash
git add src/main.js
git commit -m "feat: tambah loadPoi() dan deteksi URL ?poiId= (mode POI vs developer)"
```

---

### Task 4: Fungsi `anchorPoiDest()` + integrasi ke `onLocalizationSuccess`

**Files:**
- Modify: `src/main.js` — tambah fungsi `anchorPoiDest`, perbarui `onLocalizationSuccess` di ThreeAdapter, perbarui `onXRFrame` untuk "SAMPAI"

**Interfaces:**
- Consumes:
  - `activePoi` dari Task 3: `{ name: string, position: { x, y, z } }`
  - `worldFromMap`: `THREE.Matrix4` dari callback `onLocalizationSuccess`
  - `destination`: `THREE.Vector3 | null` (sudah ada di main.js baris 115)
  - `destMarker`, `arrow`: Three.js objects (sudah ada baris 116–125)
- Produces: `anchorPoiDest(poi, worldFromMap)` — memperbarui `destination`, `destMarker`, `arrow`

- [ ] **Step 1: Tambah fungsi `anchorPoiDest()` setelah `anchorDest()` (setelah baris 145)**

```js
// --- POI navigation: transform koordinat map-space POI ke world-space ---
function anchorPoiDest(poi, worldFromMap) {
  const mapPos = new THREE.Vector3(poi.position.x, poi.position.y, poi.position.z);
  destination = mapPos.applyMatrix4(worldFromMap);
  destMarker.position.copy(destination);
  destMarker.position.y = destination.y - 0.7;  // pangkal pilar mendekati lantai
  destMarker.visible = true;
  arrow.visible = true;
}
```

- [ ] **Step 2: Perbarui `onLocalizationSuccess` di ThreeAdapter untuk memanggil `anchorPoiDest`**

Cari baris 176 (`if (destMap) anchorDest();`) dan tambahkan blok POI di bawahnya:

```js
// SEBELUM (baris 175–177):
lastWorldFromMap = worldFromMap;
if (destMap) anchorDest();   // re-anchor tujuan MAP tiap localize — inti uji akurasi kasar
draw();

// SESUDAH:
lastWorldFromMap = worldFromMap;
if (activePoi) anchorPoiDest(activePoi, worldFromMap);  // POI mode: re-anchor tiap localize
else if (destMap) anchorDest();                          // Developer mode: re-anchor destMap
draw();
```

- [ ] **Step 3: Perbarui `onXRFrame` agar teks "SAMPAI" menyebut nama POI**

Cari baris 161:
```js
// SEBELUM:
state.nav = dist < 0.8 ? "✓ SAMPAI di tujuan" : `jarak ${dist.toFixed(1)} m → ikuti panah`;

// SESUDAH:
const arrivedLabel = activePoi ? `✓ SAMPAI di ${activePoi.name}` : "✓ SAMPAI di tujuan";
const navLabel = activePoi ? `${activePoi.name}` : "tujuan";
state.nav = dist < 1.2 ? arrivedLabel : `jarak ${dist.toFixed(1)} m → ikuti panah ke ${navLabel}`;
```

> Catatan: threshold diubah dari `0.8` ke `1.2` m sesuai spec — sedikit lebih toleran untuk navigasi gedung.

- [ ] **Step 4: Verifikasi di browser**

Buka `http://localhost:5173/?poiId=CONTOH_PLACEHOLDER`, klik START AR (jika tersedia di desktop/emulator), atau cukup cek bahwa tidak ada JS error di console.

Expected: Tidak ada error. Setelah localize berhasil (di device), `anchorPoiDest` akan dipanggil dan marker muncul.

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "feat: tambah anchorPoiDest() dan integrasi ke onLocalizationSuccess"
```

---

### Task 5: Tombol REKAM POI + conditional rendering tombol developer

**Files:**
- Modify: `src/main.js:182–224` — blok pembuatan tombol

**Interfaces:**
- Consumes:
  - `poiMode`: boolean dari Task 3
  - `activePoi`: objek POI dari Task 3
  - `lastMapPos`: `THREE.Vector3 | null` (sudah ada baris 71)
  - `state.seen`: `Set<string>` — kode map yang pernah terlihat

- [ ] **Step 1: Ubah blok tombol agar tombol developer disembunyikan saat `poiMode && activePoi`**

Ganti seluruh blok tombol (baris 191–224) dengan versi baru:

```js
// Tombol developer hanya muncul jika bukan POI mode (atau POI tidak ditemukan)
if (!poiMode || !activePoi) {
  // SET TUJUAN — drop-pin world (ARCore, map-independent) — pembanding
  mkBtn("SET TUJUAN", "#ffcc00", "#000", 24, () => {
    destMap = null;
    const wp = new THREE.Vector3(); camera.getWorldPosition(wp);
    destination = wp.clone();
    destMarker.position.copy(wp);
    destMarker.position.y = wp.y - 0.7;
    destMarker.visible = true; arrow.visible = true;
    state.nav = "tujuan(world) diset — menjauh lalu kembali";
    draw();
  });

  // TUJUAN (MAP) — UJI INTI: rekam posisi map-space SEKARANG sbg tujuan
  mkBtn("TUJUAN (MAP)", "#a855f7", "#fff", 192, () => {
    if (!lastMapPos) { state.nav = "belum ada localize — arahkan sampai poseFound dulu"; draw(); return; }
    destMap = lastMapPos.clone();
    anchorDest();
    state.nav = "tujuan(MAP) diset — menjauh, cek panah balik ke titik benar?";
    draw();
  });

  // RELOCALIZE — picu localize manual
  mkBtn("RELOCALIZE", "#0088ff", "#fff", 80, () => {
    state.last = "relocalize…"; draw();
    adapter.localizeFrame().catch((e) => { state.last = `relocalize gagal: ${e?.message ?? e}`; draw(); });
  });
}

// REKAM POI — selalu ada (alat pengisian data lapangan)
mkBtn("REKAM POI 📍", "#f97316", "#fff", 136, () => {
  if (!lastMapPos) {
    state.nav = "Belum ada pose — arahkan kamera ke sekeliling dulu.";
    draw(); return;
  }
  const isFloor2 = lastMapPos.y >= 1.5;
  const floor = isFloor2 ? 2 : 1;
  const mapCode = [...state.seen][0] ?? "MAP_???";
  const snippet = JSON.stringify({
    id: "",
    name: "",
    floor,
    mapCode,
    position: {
      x: parseFloat(lastMapPos.x.toFixed(2)),
      y: parseFloat(lastMapPos.y.toFixed(2)),
      z: parseFloat(lastMapPos.z.toFixed(2)),
    },
  }, null, 2);
  state.nav = `📍 REKAM POI (copy ke pois.json):\n${snippet}`;
  draw();
});

// SELESAI — akhiri sesi XR lalu balik ke Flutter via intent://
mkBtn("SELESAI ✓", "#22c55e", "#fff", poiMode && activePoi ? 24 : 248, () => {
  const arrived = state.nav.includes("SAMPAI");
  if (session.isActive()) session.stopSession();
  returnToApp({ arrived: String(arrived) });
});
```

> Catatan: Tombol SELESAI di-posisikan di `bottom: 24` saat POI mode (karena tombol developer tidak ada), dan di `bottom: 248` saat developer mode (di atas semua tombol lain).

- [ ] **Step 2: Verifikasi — Mode Developer (tanpa ?poiId=)**

Buka `http://localhost:5173`

Expected:
- Tombol SET TUJUAN, TUJUAN (MAP), RELOCALIZE, REKAM POI 📍, SELESAI ✓ semuanya terlihat.

- [ ] **Step 3: Verifikasi — Mode POI (dengan ?poiId= valid)**

Buka `http://localhost:5173/?poiId=CONTOH_PLACEHOLDER`

Expected:
- Tombol SET TUJUAN, TUJUAN (MAP), RELOCALIZE **tidak ada**.
- Tombol REKAM POI 📍 dan SELESAI ✓ **tetap ada**.
- HUD: `navigasi: Menuju Titik Uji Placeholder — arahkan kamera untuk lokalisasi...`

- [ ] **Step 4: Verifikasi — Tombol REKAM POI saat belum ada localize**

Tanpa XR session aktif, klik REKAM POI 📍.

Expected: HUD `navigasi: Belum ada pose — arahkan kamera ke sekeliling dulu.`

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "feat: tombol REKAM POI + conditional render tombol developer (POI vs dev mode)"
```

---

### Task 6: Deploy ke Vercel dan verifikasi end-to-end

**Files:**
- Tidak ada perubahan file — hanya deploy + cek.

- [ ] **Step 1: Build lokal untuk cek error**

```bash
npm run build
```

Expected: Build berhasil tanpa error. Warning tentang chunk size boleh diabaikan.

- [ ] **Step 2: Deploy ke Vercel**

```bash
npx vercel --prod --yes
```

Expected: URL deploy tampil, mis. `https://darsi-webxr.vercel.app`.

- [ ] **Step 3: Verifikasi Mode Developer di Vercel**

Buka `https://darsi-webxr.vercel.app` di Chrome Android.

Expected:
- HUD muncul, `auth: OK`, tombol-tombol developer terlihat.
- Klik REKAM POI 📍 tanpa AR aktif → HUD: `Belum ada pose...`

- [ ] **Step 4: Verifikasi Mode POI di Vercel**

Buka `https://darsi-webxr.vercel.app/?poiId=CONTOH_PLACEHOLDER` di Chrome Android.

Expected:
- HUD: `navigasi: Menuju Titik Uji Placeholder — arahkan kamera untuk lokalisasi...`
- Tombol developer tidak ada, REKAM POI dan SELESAI ada.
- `?poiId=TIDAK_ADA` → HUD: `POI 'TIDAK_ADA' tidak ditemukan.`

- [ ] **Step 5: Commit deploy tag (opsional)**

```bash
git tag poi-navigation-logic-v1
```

---

## Checklist Setelah Semua Task Selesai

Sebelum klaim "selesai", verifikasi semua ini terpenuhi:

- [ ] `?poiId=CONTOH_PLACEHOLDER` → Mode Navigasi POI aktif, tombol developer tersembunyi
- [ ] `?poiId=TIDAK_ADA` → HUD error yang benar, tombol developer muncul (fallback)
- [ ] Tanpa `?poiId=` → Mode Developer, semua tombol lama ada
- [ ] Tombol REKAM POI 📍 selalu ada di semua mode
- [ ] SELESAI ✓ selalu ada di semua mode
- [ ] `npm run build` bersih tanpa error
- [ ] Deploy Vercel berhasil

## Langkah Setelah Logic Verified (Butuh ke Lokasi)

Setelah semua task di atas selesai dan logic terverifikasi:

1. Pergi ke lokasi dengan map stabil (A. Yani atau Jemursari pasca-rescan).
2. Buka URL tanpa `?poiId=` (Mode Developer).
3. Aktifkan AR, tunggu `poseFound=true`.
4. Berdiri di depan tiap ruangan target, tekan **REKAM POI 📍**.
5. Copy JSON dari HUD ke `pois.json`, isi `id` dan `name`.
6. Commit + deploy ulang.
7. Test navigasi end-to-end dengan `?poiId=<id_nyata>`.
