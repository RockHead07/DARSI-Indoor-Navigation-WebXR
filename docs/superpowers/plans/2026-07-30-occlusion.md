# Occlusion & Keterbacaan Objek AR Jauh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memperbaiki mesh gedung yang meleset (koreksi `relativePose`), memakainya sebagai depth-only occluder, lalu membatasi jejak & pilar pada horizon visibilitas.

**Architecture:** SDK `@multisetai/vps` mengunduh mesh map **tunggal** (vertex di ruang map itu sendiri) lalu menerapkan `worldFromMap` (ruang **map-set**) tanpa `relativePose` — field itu 0 kemunculan di seluruh dist SDK. Karena `applyMeshTransform()` menimpa transform `meshGroup` tiap localize, koreksi dipasang di **anak** grup (SDK tak pernah menyentuh transform anak setelah dimuat), menghasilkan `worldFromMap · relativePose · vertex`. Occluder material dipasang di pass yang sama, sehingga otomatis menyelesaikan dua cacat yang mencabut occlusion di ADR-W006: waktu (dulu dipasang sebelum mesh ada) dan lingkup (dulu menjaring seluruh scene).

**Tech Stack:** Vite 5 · three ≥0.169 · `@multisetai/vps` v2.3.1 · WebXR immersive-ar (ARCore) · Vercel. Semua perubahan di satu file: `src/main.js`.

## Global Constraints

- **Kode dibatasi ke `src/main.js` + `src/horizon.js`.** Repo ini lab spike, bukan app modular — jangan memecah lebih jauh. **Pengecualian tercatat (keputusan pemilik, 2026-07-30):** `clipPathToHorizon` tinggal di `src/horizon.js` karena `main.js` menyentuh `document` saat diimpor sehingga tak bisa diimpor skrip Node. Memisahkannya membuat cek otomatis menguji kode yang benar-benar dijalankan browser, dan lebih sedikit mesin daripada mengekstrak lewat regex.
- **`adapter.world.getMeshGroup()` menembus field `private` SDK — DITERIMA (keputusan pemilik, 2026-07-30).** `private` hanya berlaku compile-time di TypeScript; nama properti selamat dari minifikasi. Tidak ada alternatif bersih: SDK tak mengekspos accessor apa pun dan `meshGroup` anonim di scene. Versi `@multisetai/vps` dikunci di `package.json`; risikonya dicatat di ADR-W010 agar upgrade SDK memicu pengecekan ulang. **Bukan temuan review.**
- **Commit sebagai pemilik:** `git -c user.name="Bagus Insan Pradana" -c user.email="dana.bagus07@gmail.com" commit --no-gpg-sign`. **DILARANG** menambahkan `Co-Authored-By`.
- **DILARANG `git push`** tanpa "ya" eksplisit dari pemilik.
- **Kebijakan commit repo:** jangan spam commit. Commit hanya di batas task sesuai plan ini.
- **DILARANG memanggil `renderer.setPixelRatio()`** — merusak matriks intrinsics kamera (CLAUDE.md).
- **Kamera WebXR:** wajib `camera.getWorldPosition()` / `getWorldDirection()`, bukan `camera.position` (basi di sesi XR).
- **Pilar penanda:** wajib lewat helper `pillarGeo()` yang sudah menggeser origin ke alas. Jangan menghitung setengah tinggi manual (regresi tercatat di CLAUDE.md).
- **Satu penunjuk arah:** chevron lantai (ADR-W008). Jangan menambah indikator terkunci-kamera.
- **Kuaternion dari API MultiSet bernama `{qx, qy, qz, qw}`**, BUKAN `{x, y, z, w}`. Salah baca = rotasi identitas diam-diam.
- **Tidak ada framework test di repo ini.** `package.json` tak punya script `test` maupun devDependency test. Cek otomatis ditulis sebagai skrip Node polos berbasis `node:assert/strict`, dijalankan dengan `node`. **Jangan** menambah Jest/Vitest.
- **Verifikasi build wajib lolos:** `npx vite build`.

## Nilai konstanta (verbatim dari spec §4.3)

| Konstanta | Default | Override URL | Arti |
|---|---|---|---|
| `HORIZON_M` | `8` | `?horizon=` | panjang jejak yang digambar (meter, sepanjang lintasan) |
| `PILAR_M` | `12` | `?pilar=` | jarak pilar tujuan mulai tampak (meter, horizontal) |

Nilai non-numerik atau ≤ 0 → jatuh ke default.

## Data `relativePose` terverifikasi (Uji 5, 2026-07-30)

```
MAP_BCADVLIXFSJE  "Azzara2"  order 0 → pos (0, 0, 0)          rot (0, 0, 0, 1)                    = IDENTITAS
MAP_MW1QTZWG1TLG  "Azzara3"  order 1 → pos (-0.25, 3.94, 0.59) rot (0, -0.18128906133681114, 0, 0.9834298532379511)
```

Lantai 2 = rotasi **20.89° yaw murni** + geser 3.99 m.

## File Structure

Hanya `src/main.js` yang berubah. Pembagian tanggung jawab di dalamnya:

| Blok | Tanggung jawab | Task |
|---|---|---|
| `fetchMapSetPoses(client)` | Ambil `relativePose` per map dari API, kembalikan `Map<_id, {position, quaternion}>` | 1 |
| `mapsetDiagnostic()` | Dipakai ulang oleh Task 1 agar tak ada dua jalur fetch | 1 |
| `patchMeshChildren()` | Terapkan `relativePose` + material occluder ke anak `meshGroup` yang belum di-patch | 2, 3 |
| `clipPathToHorizon()` | Fungsi murni: potong polyline berdasarkan panjang lintasan | 4 |
| `updateFloorTrail()` | Pakai `clipPathToHorizon` + ramp skala ujung | 5 |
| gating `destMarker` | Sembunyikan pilar di luar `PILAR_M` | 5 |

Cek otomatis: `tools/check-horizon.mjs` (baru, Task 4).

---

## Task 1: Ambil `relativePose` map-set saat startup

**Files:**
- Modify: `src/main.js` — ekstrak fetch dari `mapsetDiagnostic()` (baris 102) jadi fungsi bersama; panggil setelah `client.authorize()` (baris ~197)

**Interfaces:**
- Produces: `async function fetchMapSetPoses(client) → Map<string, {position: THREE.Vector3, quaternion: THREE.Quaternion}>` — kunci = `_id` map (yang dipakai SDK sebagai `name` objek mesh di scene). Map kosong kalau fetch gagal.
- Produces: `const mapSetPoses` — hasil `await fetchMapSetPoses(client)`, dideklarasikan di dalam `main()` dan dibaca `patchMeshChildren()` (Task 2). Catatan: `fetchMapSetPoses` sendiri berada di level modul (di atas `mapsetDiagnostic()`), sedangkan `mapSetPoses` di dalam `main()`.
- Consumes: `MultisetClient` yang sudah `authorize()` (punya `client.token`).

- [ ] **Step 1: Tambah `fetchMapSetPoses` tepat di atas `mapsetDiagnostic()`**

Sisipkan sebelum baris `async function mapsetDiagnostic() {`:

```js
// Ambil relativePose tiap map di dalam map-set. SDK punya endpoint ini di DEFAULT_ENDPOINTS
// (`mapSetDetailsUrl`) tapi TIDAK PERNAH memanggilnya — `relativePose` 0 kemunculan di
// seluruh dist. Tanpa ini mesh lantai 2 meleset 3.99 m + yaw 20.89 derajat (Uji 5).
// Kunci Map = `_id` map, karena itulah yang dipakai SDK sebagai `name` objek mesh di scene.
async function fetchMapSetPoses(client) {
  const out = new Map();
  try {
    const res = await fetch(`https://api.multiset.ai/v1/vps/map-set/${MAPSET}`, {
      headers: { Authorization: `Bearer ${client.token}` },
    });
    if (!res.ok) return out;
    const body = await res.json();
    for (const m of body?.mapSet?.mapSetData ?? body?.mapSetData ?? []) {
      const p = m.relativePose?.position, q = m.relativePose?.rotation, id = m.map?._id;
      if (!id || !p || !q) continue;
      out.set(id, {
        position: new THREE.Vector3(p.x, p.y, p.z),
        // API memakai qx/qy/qz/qw, BUKAN x/y/z/w. Salah baca = identitas diam-diam.
        quaternion: new THREE.Quaternion(q.qx, q.qy, q.qz, q.qw),
      });
    }
  } catch { /* jaringan gagal → Map kosong → mesh dibiarkan seperti perilaku SDK */ }
  return out;
}
```

- [ ] **Step 2: Panggil setelah authorize di `main()`**

Cari blok di `src/main.js`:

```js
  try { await client.authorize(); state.auth = "OK"; }
  catch (e) { return fail(`authorize gagal: ${e.message} (cek CORS domain di dashboard MultiSet)`); }
  draw();
```

Ganti menjadi:

```js
  try { await client.authorize(); state.auth = "OK"; }
  catch (e) { return fail(`authorize gagal: ${e.message} (cek CORS domain di dashboard MultiSet)`); }
  draw();

  // relativePose dibutuhkan SEBELUM mesh pertama dimuat (Task 2). Gagal ambil = Map kosong,
  // mesh berperilaku seperti bawaan SDK (meleset) — bukan crash.
  const mapSetPoses = await fetchMapSetPoses(client);
  state.auth = `OK (relativePose: ${mapSetPoses.size} map)`;
  draw();
```

- [ ] **Step 3: Verifikasi build**

Run: `npx vite build`
Expected: `✓ built in <N>s`, tanpa baris `error`.

- [ ] **Step 4: Verifikasi HUD di browser**

Jalankan preview lalu buka halaman produksi (kredensial hanya ada di build Vercel; `.env.local` lokal berisi placeholder sehingga authorize akan 404 — itu wajar dan bukan kegagalan task ini).

Untuk verifikasi lokal cukup pastikan tidak ada error runtime baru: buka `http://localhost:5173/`, baca teks halaman, harapkan pesan `authorize gagal: ...` (bukan `ReferenceError`/`TypeError`).

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git -c user.name="Bagus Insan Pradana" -c user.email="dana.bagus07@gmail.com" commit --no-gpg-sign -m "Ambil relativePose map-set saat startup

SDK punya endpoint mapSetDetailsUrl tapi tak pernah memanggilnya, sehingga
relativePose tiap map tak pernah diterapkan ke mesh. Diambil sendiri saat
startup, dikunci berdasarkan _id map (yang dipakai SDK sebagai nama objek
mesh di scene). Gagal ambil menghasilkan Map kosong, bukan crash."
```

---

## Task 2: Terapkan `relativePose` ke mesh (koreksi kemelesetan)

**Files:**
- Modify: `src/main.js` — tambah `patchMeshChildren()`; panggil dari `onXRFrame` (baris ~647); ubah `showMesh` (baris 644)

**Interfaces:**
- Consumes: `mapSetPoses` dari Task 1; `adapter` (`ThreeAdapter`).
- Produces: `function patchMeshChildren()` — idempoten, aman dipanggil tiap frame. Menandai objek yang sudah diproses dengan `child.userData.msPatched = true`.

**Kenapa di anak, bukan di grup:** `applyMeshTransform()` milik SDK menimpa `meshGroup.position`, `.quaternion`, dan memaksa `.scale = 1` **setiap localize**. Koreksi di grup akan hilang. SDK tak pernah menyentuh transform anak setelah dimuat, sehingga `meshGroup(worldFromMap) → anak(relativePose) → vertex` bertahan.

- [ ] **Step 1: Ubah `showMesh` menjadi selalu aktif**

Cari baris 644:

```js
    showMesh: SHOW_MESH,      // hanya di ?mesh=true — mesh = alat ukur akurasi, bukan fitur (ADR-W006)
```

Ganti menjadi:

```js
    // Mesh SELALU dimuat: dipakai sebagai depth-only occluder (Task 3). `?mesh=true` hanya
    // mengubah MATERIAL-nya (shader SDK tetap terlihat) agar kesejajaran bisa dinilai mata.
    showMesh: true,
```

- [ ] **Step 2: Tambah `patchMeshChildren` tepat sebelum `const adapter = new ThreeAdapter({`**

```js
  // Mesh dimuat SDK secara asinkron SETELAH onLocalizationSuccess (urutan SDK:
  // onLocalizationSuccess → fetchMapDetails → ensureMeshLoaded → applyMeshTransform), jadi
  // tak ada callback yang menandai "mesh siap". Karena itu dicek tiap frame; jumlah anak
  // ≤ jumlah lantai, dan objek yang sudah diproses ditandai userData.msPatched.
  // `adapter.world` ditandai private di TypeScript, tapi itu compile-time saja — nama
  // properti selamat dari minifikasi. Terikat @multisetai/vps v2.3.1 (versi dikunci).
  function patchMeshChildren() {
    const group = adapter.world?.getMeshGroup?.();
    if (!group) return;
    for (const child of group.children) {
      if (child.userData.msPatched) continue;
      child.userData.msPatched = true;

      // `name` diisi SDK dengan `_id` map (mapDetails._id). Gizmo bawaan SDK tak bernama,
      // jadi otomatis terlewat — dan showGizmo:false membuatnya tak ada sama sekali.
      const pose = child.name ? mapSetPoses.get(child.name) : null;
      if (pose) {
        child.position.copy(pose.position);
        child.quaternion.copy(pose.quaternion);
        child.updateMatrixWorld(true);
      }
    }
  }
```

- [ ] **Step 3: Panggil dari `onXRFrame`**

Cari baris 647 dan blok tepat di bawahnya:

```js
    onXRFrame: () => {                            // dipanggil tiap frame, camera SUDAH ter-sync
      if (!destination) return;
```

Ganti menjadi:

```js
    onXRFrame: () => {                            // dipanggil tiap frame, camera SUDAH ter-sync
      patchMeshChildren();   // mesh dimuat asinkron; tak ada callback "mesh siap" dari SDK
      if (!destination) return;
```

Penempatan **sebelum** `if (!destination) return;` disengaja: koreksi mesh harus berjalan walau belum ada tujuan yang dipilih, karena mode `?mesh=true` dipakai untuk menilai kesejajaran tanpa menavigasi ke mana pun.

- [ ] **Step 4: Lepas gerbang `SHOW_MESH` pada pengurutan `mapCodes`**

Karena mesh kini dimuat di produksi juga, `ThreeAdapter` memilih mesh lantai dari
`mapCodes[0]` di **semua** mode. Urutan `mapCodes` adalah artefak urutan `hintMapCodes`,
bukan peringkat kecocokan (ADR-W001) — tanpa pengurutan ulang, produksi bisa memuat mesh
lantai yang SALAH sebagai occluder.

Cari blok di `onLocalizationResult`:

```js
        // Hanya relevan saat SHOW_MESH: ThreeAdapter memuat mesh dari mapCodes[0], padahal
        // urutan mapCodes = artefak urutan hintMapCodes, BUKAN peringkat kecocokan (ADR-W001).
        // Urutkan ulang pakai elevasi Y supaya mesh lantai yang dimuat benar, bukan tertukar.
        if (SHOW_MESH) {
          d.mapCodes = floorOf(p.y) === 2
            ? ["MAP_MW1QTZWG1TLG", "MAP_BCADVLIXFSJE"]
            : ["MAP_BCADVLIXFSJE", "MAP_MW1QTZWG1TLG"];
        }
```

Ganti menjadi:

```js
        // ThreeAdapter memuat mesh dari mapCodes[0], padahal urutan mapCodes = artefak urutan
        // hintMapCodes, BUKAN peringkat kecocokan (ADR-W001). Urutkan ulang pakai elevasi Y
        // supaya mesh lantai yang dimuat benar. Berlaku di SEMUA mode sejak mesh juga dimuat
        // di produksi sebagai occluder — kalau tertukar, occluder-nya lantai yang salah.
        d.mapCodes = floorOf(p.y) === 2
          ? ["MAP_MW1QTZWG1TLG", "MAP_BCADVLIXFSJE"]
          : ["MAP_BCADVLIXFSJE", "MAP_MW1QTZWG1TLG"];
```

- [ ] **Step 5: Verifikasi build**

Run: `npx vite build`
Expected: `✓ built in <N>s`, tanpa baris `error`.

Catatan: `showMesh: true` menuntut decoder Draco tersedia di `public/draco/` (CLAUDE.md).
Folder itu sudah ada di repo — tidak ada yang perlu ditambahkan.

- [ ] **Step 6: Commit**

```bash
git add src/main.js
git -c user.name="Bagus Insan Pradana" -c user.email="dana.bagus07@gmail.com" commit --no-gpg-sign -m "Terapkan relativePose ke mesh — koreksi meleset 3.99 m + yaw 20.89 derajat

applyMeshTransform() milik SDK menimpa transform meshGroup tiap localize,
jadi koreksi dipasang di ANAK grup: SDK tak pernah menyentuh transform anak
setelah dimuat. Hasilnya worldFromMap . relativePose . vertex.

Mesh kini selalu dimuat (dipakai sebagai occluder di task berikutnya);
?mesh=true hanya mengubah materialnya agar kesejajaran bisa dinilai mata.

Pengurutan mapCodes berdasarkan elevasi Y dilepas dari gerbang SHOW_MESH:
mesh kini dimuat di produksi juga, dan mapCodes[0] yang tertukar berarti
occluder dari lantai yang salah."
```

- [ ] **Step 7: GERBANG LAPANGAN — verifikasi kesejajaran sebelum lanjut**

Deploy, lalu buka `?mesh=true` di **Lantai 1 DAN Lantai 2**.

**Kriteria lolos:** mesh ungu sejajar dengan koridor nyata di **kedua** lantai saat berdiri diam.

**Kalau Lantai 2 masih miring:** JANGAN lanjut ke Task 3. Occluder yang posisinya salah mengklip objek di tempat keliru, dan karena `colorWrite:false` penyebabnya tak terlihat sama sekali — itulah yang mencabut occlusion di ADR-W006. Laporkan ke pemilik project.

---

## Task 3: Material depth-only (occluder sesungguhnya)

**Files:**
- Modify: `src/main.js` — lengkapi `patchMeshChildren()`

**Interfaces:**
- Consumes: `patchMeshChildren()` dari Task 2; `SHOW_MESH` (baris 36).
- Produces: tidak ada simbol baru.

**Prasyarat:** gerbang lapangan Task 2 Step 6 **lolos**.

- [ ] **Step 1: Tambah material occluder di dalam `patchMeshChildren`**

Ganti isi loop `patchMeshChildren` menjadi:

```js
    for (const child of group.children) {
      if (child.userData.msPatched) continue;
      child.userData.msPatched = true;

      const pose = child.name ? mapSetPoses.get(child.name) : null;
      if (pose) {
        child.position.copy(pose.position);
        child.quaternion.copy(pose.quaternion);
        child.updateMatrixWorld(true);
      }

      // Produksi: mesh jadi occluder TAK TERLIHAT — tidak melukis warna (feed kamera tetap
      // jernih) tapi tetap melukis z-depth, sehingga tembok memblokir objek AR di baliknya.
      // Di ?mesh=true material shader SDK dibiarkan agar kesejajaran bisa dinilai mata.
      // Lingkup SENGAJA dibatasi ke anak meshGroup — versi lama menjaring seluruh scene
      // dan diam-diam mengubah pilar/chevron/gizmo jadi tembok tak terlihat (ADR-W006).
      if (!SHOW_MESH) {
        child.traverse((o) => {
          if (!o.isMesh) return;
          o.material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true });
          o.renderOrder = 0;
        });
      }
    }
```

- [ ] **Step 2: Naikkan `renderOrder` objek navigasi di atas occluder**

Occluder memakai `renderOrder = 0`. Objek navigasi harus digambar sesudahnya agar uji depth berjalan benar.

Cari deklarasi `destMarker` (sekitar baris 240):

```js
  destMarker.visible = false;
  scene.add(destMarker);
```

Ganti menjadi:

```js
  destMarker.visible = false;
  destMarker.renderOrder = 1;      // digambar setelah occluder (renderOrder 0)
  scene.add(destMarker);
```

Cari deklarasi `floorTrailGroup`:

```js
  const floorTrailGroup = new THREE.Group();
  floorTrailGroup.visible = false;
  scene.add(floorTrailGroup);
```

Ganti menjadi:

```js
  const floorTrailGroup = new THREE.Group();
  floorTrailGroup.visible = false;
  floorTrailGroup.renderOrder = 1; // digambar setelah occluder (renderOrder 0)
  scene.add(floorTrailGroup);
```

- [ ] **Step 3: Verifikasi build**

Run: `npx vite build`
Expected: `✓ built in <N>s`, tanpa baris `error`.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git -c user.name="Bagus Insan Pradana" -c user.email="dana.bagus07@gmail.com" commit --no-gpg-sign -m "Occluder depth-only pada mesh yang sudah dikoreksi

Memperbaiki dua cacat yang mencabut occlusion di ADR-W006:
- WAKTU: material dipasang saat anak mesh benar-benar muncul di scene,
  bukan di onLocalizationSuccess yang berjalan sebelum mesh diunduh.
- LINGKUP: hanya anak meshGroup milik SDK, bukan seluruh scene. Versi lama
  diam-diam mengubah pilar, chevron, dan gizmo jadi tembok tak terlihat.

?mesh=true tetap menampilkan shader SDK sebagai alat ukur kesejajaran."
```

- [ ] **Step 5: Verifikasi lapangan**

Deploy, lalu di Lantai 2 tanpa query param: pilih POI di balik tembok. Pilarnya **tidak** terlihat. Chevron di koridor yang sama tetap utuh (bukan terpotong sembarangan). Feed kamera tetap jernih — tidak ada warna ungu.

---

## Task 4: `clipPathToHorizon` + cek otomatis

**Files:**
- Create: `src/horizon.js`
- Create: `tools/check-horizon.mjs`
- Modify: `src/main.js` — import `clipPathToHorizon`, tambah konstanta horizon

**Interfaces:**
- Produces: `export function clipPathToHorizon(points, horizonM) → Array<{x,y,z}>` di `src/horizon.js` — fungsi murni. Memotong polyline berdasarkan **panjang lintasan terakumulasi** dari titik pertama. Titik potong diinterpolasi tepat di batas. `points` = array objek ber-field `x`,`y`,`z` (kompatibel dengan `THREE.Vector3`). Mengembalikan array baru; tidak memutasi input.
- Produces: `HORIZON_M`, `PILAR_M` — konstanta modul di `src/main.js`.

- [ ] **Step 1: Tulis cek yang gagal**

Buat `tools/check-horizon.mjs`:

```js
// Cek clipPathToHorizon. Repo ini tak punya framework test (lihat Global Constraints),
// jadi ini skrip Node polos: `node tools/check-horizon.mjs`.
// Mengimpor modul yang SAMA dengan yang dipakai browser — bukan salinan.
import assert from "node:assert/strict";
import { clipPathToHorizon } from "../src/horizon.js";

const P = (x, z) => ({ x, y: 0, z });
const len = (pts) => pts.slice(1).reduce((s, p, i) =>
  s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y, p.z - pts[i].z), 0);

// 1. Jalur lebih pendek dari horizon → dikembalikan utuh.
const pendek = [P(0, 0), P(0, 3)];
assert.deepEqual(clipPathToHorizon(pendek, 8), pendek, "jalur pendek harus utuh");

// 2. Potongan di tengah segmen → titik akhir diinterpolasi.
const potong = clipPathToHorizon([P(0, 0), P(0, 10)], 4);
assert.equal(potong.length, 2);
assert.ok(Math.abs(potong[1].z - 4) < 1e-9, `z harus 4, dapat ${potong[1].z}`);

// 3. Batas jatuh PERSIS di simpul → tanpa titik duplikat.
const tepat = clipPathToHorizon([P(0, 0), P(0, 5), P(0, 9)], 5);
assert.equal(tepat.length, 2, "batas di simpul tak boleh menghasilkan titik dobel");
assert.ok(Math.abs(len(tepat) - 5) < 1e-9);

// 4. Panjang lintasan, BUKAN jarak lurus — jalur menikung balik.
const tikung = clipPathToHorizon([P(0, 0), P(0, 3), P(3, 3)], 5);
assert.ok(Math.abs(len(tikung) - 5) < 1e-9, `panjang lintasan harus 5, dapat ${len(tikung)}`);

// 5. Masukan degenerate → tidak melempar error.
assert.deepEqual(clipPathToHorizon([], 8), []);
assert.deepEqual(clipPathToHorizon([P(1, 2)], 8), [P(1, 2)]);
assert.deepEqual(clipPathToHorizon([P(0, 0), P(0, 5)], 0), [P(0, 0)], "horizon 0 → hanya titik awal");

// 6. Tidak memutasi masukan.
const asli = [P(0, 0), P(0, 10)];
const salinan = JSON.parse(JSON.stringify(asli));
clipPathToHorizon(asli, 4);
assert.deepEqual(asli, salinan, "input tidak boleh dimutasi");

console.log("OK — clipPathToHorizon lolos 6 kelompok cek.");
```

- [ ] **Step 2: Jalankan cek untuk memastikan GAGAL**

Run: `node tools/check-horizon.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND` untuk `../src/horizon.js`

- [ ] **Step 3a: Tulis `src/horizon.js`**

Buat file baru `src/horizon.js`:

```js
// Fungsi murni horizon visibilitas. Sengaja dipisah dari main.js: main.js menyentuh
// `document` saat diimpor sehingga tak bisa diimpor skrip Node, dan memisahkannya membuat
// tools/check-horizon.mjs menguji kode yang BENAR-BENAR dijalankan browser — bukan salinan.

// Potong polyline berdasarkan PANJANG LINTASAN terakumulasi, bukan jarak lurus. Disengaja:
// kalau jalur membelok di 6 m, user tetap melihat sampai tikungan dan sedikit setelahnya —
// justru itu yang memberi tahu "belok di sini". Titik potong diinterpolasi tepat di batas
// agar ujung jejak tidak berkedip saat user berjalan. Fungsi murni: tidak memutasi masukan.
export function clipPathToHorizon(points, horizonM) {
  if (points.length < 2) return points.slice();
  const out = [points[0]];
  let sisa = horizonM;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (seg <= 0) continue;
    if (seg < sisa) { out.push(b); sisa -= seg; continue; }
    const t = sisa / seg;
    // t === 0 berarti batas jatuh persis di simpul sebelumnya → jangan tambah titik dobel.
    if (t > 0) {
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
    return out;
  }
  return out;
}
```

- [ ] **Step 3b: Jalankan cek untuk memastikan LOLOS**

Run: `node tools/check-horizon.mjs`
Expected: `OK — clipPathToHorizon lolos 6 kelompok cek.`

- [ ] **Step 3c: Import ke `src/main.js` dan tambah konstanta**

Cari baris import terakhir di `src/main.js`:

```js
import { ThreeAdapter } from "@multisetai/vps/three";
```

Tambahkan tepat di bawahnya:

```js
import { clipPathToHorizon } from "./horizon.js";
```

Lalu sisipkan tepat setelah baris `const SHOW_MESH = ...`:

```js
// Horizon visibilitas (spec 2026-07-30). Angka bisa disetel di lapangan tanpa deploy ulang —
// sejarah repo ini menunjukkan konstanta spasial selalu perlu disetel setelah dicoba
// (EYE_HEIGHT baru ketahuan salah setelah pilar tenggelam ter-deploy).
const numParam = (nama, fallback) => {
  const v = parseFloat(new URLSearchParams(location.search).get(nama));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const HORIZON_M = numParam("horizon", 8);   // panjang jejak yang digambar (meter, sepanjang lintasan)
const PILAR_M = numParam("pilar", 12);      // jarak pilar tujuan mulai tampak (meter, horizontal)
```

- [ ] **Step 4: Verifikasi build**

Run: `npx vite build`
Expected: `✓ built in <N>s`, tanpa baris `error`.

Build wajib lolos di sini: ia membuktikan Vite berhasil me-resolve `./horizon.js`.
Kalau gagal `Failed to resolve import`, periksa ekstensi `.js` pada path import.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/horizon.js tools/check-horizon.mjs
git -c user.name="Bagus Insan Pradana" -c user.email="dana.bagus07@gmail.com" commit --no-gpg-sign -m "clipPathToHorizon: potong polyline berdasarkan panjang lintasan

Fungsi murni dengan cek otomatis (tools/check-horizon.mjs, node polos tanpa
framework). Memakai panjang lintasan alih-alih jarak lurus supaya tikungan
tetap terlihat — justru itu yang memberi tahu arah belok. Titik potong
diinterpolasi tepat di batas agar ujung jejak tidak berkedip saat berjalan.

HORIZON_M dan PILAR_M bisa disetel lewat ?horizon= dan ?pilar= karena
konstanta spasial di repo ini selalu perlu disetel setelah dicoba."
```

---

## Task 5: Pasang horizon ke jejak & gerbang pilar

**Files:**
- Modify: `src/main.js` — `updateFloorTrail()` (baris ~587); blok jarak di `onXRFrame`

**Interfaces:**
- Consumes: `clipPathToHorizon`, `HORIZON_M`, `PILAR_M` dari Task 4.
- Produces: tidak ada simbol baru.

- [ ] **Step 1: Potong jejak di `updateFloorTrail`**

Cari blok:

```js
    // Kumpulkan titik-titik lintasan A* di world space
    const waypointsWorld = [userWorldPos.clone()];
    for (let i = currentWaypointIndex; i < activeWaypointsMap.length; i++) {
      waypointsWorld.push(activeWaypointsMap[i].clone().applyMatrix4(worldFromMap));
    }

    if (waypointsWorld.length < 2) return;
```

Ganti menjadi:

```js
    // Kumpulkan titik-titik lintasan A* di world space
    const semuaWaypoint = [userWorldPos.clone()];
    for (let i = currentWaypointIndex; i < activeWaypointsMap.length; i++) {
      semuaWaypoint.push(activeWaypointsMap[i].clone().applyMatrix4(worldFromMap));
    }

    // Jangan gambar yang tak pantas terlihat dari sini. Ini BUKAN occlusion — occlusion
    // sungguhan ada di occluder mesh; ini keterbacaan navigasi. Hanya memengaruhi RENDER:
    // perhitungan jarak, kemajuan waypoint, dan deteksi SAMPAI tetap memakai rute penuh.
    const waypointsWorld = clipPathToHorizon(semuaWaypoint, HORIZON_M);

    if (waypointsWorld.length < 2) return;
```

- [ ] **Step 2a: Deklarasikan penampung chevron LEBIH DULU**

Urutan penting — kalau `push` ditambahkan sebelum deklarasinya ada, hasilnya `ReferenceError`.

Cari baris:

```js
    const timeOffset = (performance.now() * 0.001 * 0.7) % spacing;
```

Tambahkan tepat di bawahnya:

```js
    const chevronTerpasang = [];   // dipakai Step 3 untuk meredupkan ujung horizon
```

- [ ] **Step 2b: Kumpulkan tiap chevron yang dipasang**

Cari baris pembuatan chevron di dalam loop:

```js
        const chevron = new THREE.Mesh(chevronGeo, chevronMat);
        chevron.position.copy(pos);

        // Putar chevron mengarah ke segmen jalur berikutnya di lantai
        const lookTarget = pos.clone().add(segDir);
        chevron.lookAt(lookTarget);
        floorTrailGroup.add(chevron);
```

Ganti menjadi:

```js
        const chevron = new THREE.Mesh(chevronGeo, chevronMat);
        chevron.position.copy(pos);

        // Putar chevron mengarah ke segmen jalur berikutnya di lantai
        const lookTarget = pos.clone().add(segDir);
        chevron.lookAt(lookTarget);
        floorTrailGroup.add(chevron);
        chevronTerpasang.push(chevron);
```

- [ ] **Step 3: Terapkan ramp skala di ujung horizon**

Cari baris penutup `updateFloorTrail`:

```js
    floorTrailGroup.visible = true;
  }
```

Ganti menjadi:

```js
    // Tiga chevron terakhir dikecilkan (0.75 / 0.5 / 0.25, terjauh paling kecil) agar tidak
    // muncul-hilang mendadak saat berjalan. Lewat SKALA, bukan transparansi: menghindari
    // sorting alpha dan alokasi material per-chevron. Jejak < 3 chevron → ramp seadanya.
    const ramp = [0.75, 0.5, 0.25];
    const n = chevronTerpasang.length;
    for (let k = 0; k < Math.min(ramp.length, n); k++) {
      chevronTerpasang[n - 1 - k].scale.setScalar(ramp[k]);
    }

    floorTrailGroup.visible = true;
  }
```

- [ ] **Step 4: Gerbang pilar tujuan berdasarkan jarak**

Cari blok di `onXRFrame`:

```js
      const user = new THREE.Vector3(); camera.getWorldPosition(user);
      const flat = destination.clone(); flat.y = user.y;   // jarak horizontal
      const dist = user.distanceTo(flat);
```

Ganti menjadi:

```js
      const user = new THREE.Vector3(); camera.getWorldPosition(user);
      const flat = destination.clone(); flat.y = user.y;   // jarak horizontal
      const dist = user.distanceTo(flat);

      // Pilar tujuan hanya tampak saat dekat. PILAR_M sengaja lebih besar dari HORIZON_M:
      // pilar menandai tujuan akhir dan berguna kalau sudah terlihat sesaat sebelum jejaknya
      // sampai ke sana. Informasi jaraknya tetap ada di HUD, jadi tak ada yang hilang.
      // Hanya visual — perhitungan jarak & deteksi SAMPAI di bawah tidak terpengaruh.
      // Aman ditulis tiap frame: gerbang lintas-lantai (ADR-W007) menyetel destination=null,
      // sehingga onXRFrame sudah keluar lebih awal dan tak pernah sampai ke baris ini.
      destMarker.visible = dist <= PILAR_M;
```

- [ ] **Step 5: Verifikasi cek & build**

Run: `node tools/check-horizon.mjs`
Expected: `OK — clipPathToHorizon lolos 6 kelompok cek.`

Run: `npx vite build`
Expected: `✓ built in <N>s`, tanpa baris `error`.

- [ ] **Step 6: Commit**

```bash
git add src/main.js
git -c user.name="Bagus Insan Pradana" -c user.email="dana.bagus07@gmail.com" commit --no-gpg-sign -m "Pasang horizon visibilitas ke jejak & pilar tujuan

Jejak dipotong pada HORIZON_M sepanjang lintasan; tiga chevron terakhir
diskalakan 0.75/0.5/0.25 agar ujungnya tidak muncul-hilang mendadak. Pilar
tujuan hanya tampak dalam PILAR_M.

Gating ini HANYA memengaruhi render. Perhitungan jarak, kemajuan waypoint,
deteksi SAMPAI, dan gerbang lintas-lantai (ADR-W007) tidak disentuh."
```

- [ ] **Step 7: Verifikasi lapangan**

Di Lantai 2: jejak berhenti di sekitar horizon dan ujungnya tidak berkedip saat berjalan; pilar muncul saat mendekat; HUD tetap menampilkan jarak saat pilar tersembunyi. Bandingkan `?horizon=8` dengan `?horizon=999` untuk menyetel angka.

---

## Task 6: Perbarui dokumentasi

**Files:**
- Modify: `docs/DECISIONS.md` — ADR-W010 baru; perbarui ADR-W006
- Modify: `docs/KNOWN-ISSUES.md` — status occlusion
- Modify: `README.md` — §Status
- Modify: `docs/ARCHITECTURE.md` — §6.4

**Interfaces:** tidak ada kode.

- [ ] **Step 1: Tulis ADR-W010 di `docs/DECISIONS.md`**

Sisipkan tepat sebelum baris `## ADR dari repo Unity yang tetap berlaku`:

```markdown
## ADR-W010 — Koreksi `relativePose` + occluder mesh + horizon visibilitas (2026-07-30)

**Mencabut penundaan di ADR-W006.**

### Konteks
Uji 5 membuktikan SDK tak pernah menerapkan `relativePose` tiap map di dalam map-set:
Lantai 1 (`order 0`) identitas, Lantai 2 geser `(-0.25, 3.94, 0.59)` + **rotasi 20.89° yaw
murni**. Di ujung koridor 30 m, yaw saja → meleset 11.4 m.

### Keputusan
1. `relativePose` diambil sendiri saat startup dan diterapkan ke **anak** `meshGroup` —
   bukan ke grupnya, karena `applyMeshTransform()` milik SDK menimpa transform grup tiap
   localize. Hasilnya `worldFromMap · relativePose · vertex`.
2. Mesh yang sudah lurus dipakai sebagai **depth-only occluder** (`colorWrite:false,
   depthWrite:true`), dipasang saat anak mesh benar-benar muncul di scene dan dibatasi ke
   anak `meshGroup` saja — memperbaiki dua cacat yang mencabut occlusion di ADR-W006.
3. **Horizon visibilitas**: jejak dipotong pada `HORIZON_M` sepanjang lintasan, pilar tujuan
   digerbangi `PILAR_M`. Ini **bukan** occlusion melainkan keterbacaan navigasi — dicatat
   eksplisit supaya tak dikutip kelak sebagai "occlusion sudah beres".

### Konsekuensi
- Mesh kembali diunduh di produksi (ongkos yang memang dituntut occlusion).
- Occluder mewarisi kesalahan lokalisasi dan tak meng-occlude benda bergerak.
- Depth ARCore ditolak untuk sekarang: dokumentasi resmi menyebut tembok putih polos
  menghasilkan depth tak presisi, SDK mengunci `requestSession` tanpa passthrough, dan
  dukungan perangkat belum diuji. Tetap dicatat untuk occlusion jarak dekat.
- **Mesh kini sah jadi alat ukur akurasi** — pertama kalinya bagi project ini.

---
```

- [ ] **Step 2: Perbarui `docs/KNOWN-ISSUES.md`**

Ganti baris status pada entri occlusion:

```markdown
**Status:** DITUNDA — pernah diimplementasi 2026-07-28, **dicabut ADR-W006** (2026-07-29)
```

menjadi:

```markdown
**Status:** ✅ SELESAI — dihidupkan kembali 2026-07-30 lewat ADR-W010, setelah `relativePose`
terbukti (Uji 5) dan mesh dikoreksi.
```

- [ ] **Step 3: Perbarui `README.md` §Status**

Ganti baris:

```markdown
- [ ] Occlusion (ditunda sampai mesh terbukti sejajar)
```

menjadi:

```markdown
- [x] Mesh dikoreksi `relativePose` (yaw 20.89° Lt 2) + occluder depth-only (ADR-W010)
- [x] Horizon visibilitas — jejak & pilar tak digambar di luar jangkauan wajar
```

- [ ] **Step 4: Perbarui `docs/ARCHITECTURE.md` §6.4**

Tambahkan di akhir daftar butir §6.4:

```markdown
- **Koreksi mesh & occluder (`patchMeshChildren`):** `relativePose` tiap map diterapkan ke
  anak `meshGroup` (grup-nya ditimpa SDK tiap localize), lalu material depth-only dipasang di
  pass yang sama. Dijalankan tiap frame karena SDK tak menyediakan callback "mesh siap".
- **Horizon visibilitas:** `clipPathToHorizon()` memotong jejak berdasarkan panjang lintasan;
  pilar tujuan digerbangi jarak. Hanya memengaruhi render, bukan logika navigasi.
```

- [ ] **Step 5: Commit**

```bash
git add docs/DECISIONS.md docs/KNOWN-ISSUES.md README.md docs/ARCHITECTURE.md
git -c user.name="Bagus Insan Pradana" -c user.email="dana.bagus07@gmail.com" commit --no-gpg-sign -m "Docs: ADR-W010 (koreksi relativePose, occluder, horizon)

ADR-W006 dicabut penundaannya setelah relativePose terbukti di Uji 5.
KNOWN-ISSUES, README, dan ARCHITECTURE disinkronkan ke kondisi kode."
```

---

## Verifikasi akhir

- [ ] `node tools/check-horizon.mjs` → `OK — clipPathToHorizon lolos 6 kelompok cek.`
- [ ] `npx vite build` → `✓ built`, tanpa `error`
- [ ] `git status --short` → kosong
- [ ] Lapangan Lt 1 & Lt 2 dengan `?mesh=true` → mesh sejajar koridor di **kedua** lantai
- [ ] Lapangan tanpa param → pilar di balik tembok tak terlihat; feed kamera jernih; jejak berhenti di horizon tanpa berkedip
- [ ] **Push menunggu "ya" eksplisit dari pemilik project**
