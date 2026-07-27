# Spec: POI Navigation — DARSI WebXR Lab Spike

**Tanggal**: 2026-07-27  
**Status**: Disetujui — siap implementasi  
**Scope**: `src/main.js` + `public/data/pois.json`  
**Repo tujuan akhir**: route `/ar` di `darsi-indoor-navigation-ui-webview` (Next.js) — spike ini adalah bukti konsep.

---

## Konteks & Batasan

Repo ini adalah **lab spike** untuk membuktikan WebXR+VPS bisa menggantikan Unity runtime.
Localize map Jemursari **belum stabil** (§3.5 README — lompatan 5–60 m). Sesuai gerbang CLAUDE.md:

> *"Jangan bangun POI/navigasi map-anchored di atas localize yang belum stabil."*

Solusi: **pisahkan logic dari data**.
- Logic navigasi POI dibangun dan diverifikasi sekarang menggunakan **koordinat placeholder** di JSON.
- Data koordinat nyata diisi via fitur REKAM POI **setelah** localize stabil di map tujuan (A. Yani atau Jemursari pasca-rescan).

---

## Tujuan

Tambahkan sistem navigasi berbasis POI ke `main.js` sehingga:

1. Flutter dapat meluncurkan WebXR dengan URL `?poiId=AZZARA_201` → navigasi langsung ke POI tersebut.
2. Jika tidak ada `?poiId=` → mode developer tetap jalan (tombol lama tidak berubah).
3. Koordinat POI disimpan dalam `public/data/pois.json` sebagai sumber kebenaran tunggal.
4. Semua koordinat POI **wajib direkam dari VPS langsung** (via tombol REKAM POI) — tidak dari Unity — untuk menghindari masalah konversi handedness.

---

## Arsitektur

### File yang Berubah

| File | Perubahan |
|---|---|
| `public/data/pois.json` | **Baru** — database POI, koordinat map-space VPS |
| `src/main.js` | Tambah: `loadPoi()`, `anchorPoiDest()`, state machine navigasi, tombol REKAM POI |

Tidak ada file baru di `src/`. Semua logika tetap di `main.js` (pola yang sudah ada).

---

## Bagian 1: Data Layer — `public/data/pois.json`

### Schema

```json
{
  "mapSetCode": "MSET_PKRKGGFB1RO0",
  "pois": [
    {
      "id": "CONTOH_PLACEHOLDER",
      "name": "Placeholder (ganti setelah rekam lapangan)",
      "floor": 1,
      "mapCode": "MAP_BCADVLIXFSJE",
      "position": { "x": -1.9, "y": -0.5, "z": 34.3 }
    }
  ]
}
```

### Field

| Field | Type | Keterangan |
|---|---|---|
| `id` | `string` | Identifier unik, dipakai sebagai nilai `?poiId=` di URL |
| `name` | `string` | Nama tampilan di HUD saat navigasi |
| `floor` | `number` | Lantai (1 atau 2) — informatif, tidak dipakai runtime |
| `mapCode` | `string` | Map asal rekaman — informatif, tidak dipakai runtime |
| `position` | `{x,y,z}` | Koordinat **map-space VPS mentah** dari `lastMapPos` saat REKAM POI |

### Aturan Koordinat

- Koordinat WAJIB dari `lastMapPos` VPS (bukan Unity) — frame map-space, sudah right-handed.
- Tidak ada konversi sumbu yang diperlukan karena sumber = VPS itu sendiri.
- `position.y` mencerminkan elevasi absolut frame mapset (lt1 ≈ −0.5, lt2 ≈ 3.7 per temuan lapangan 2026-07-22).

---

## Bagian 2: Runtime Mode (URL-based)

### Deteksi Mode

```
URL load
  ↓
cek URLSearchParams('poiId')
  ├── ada & valid  → Mode Navigasi POI
  ├── ada & tidak ditemukan di JSON → HUD error, fallback Mode Developer
  └── tidak ada    → Mode Developer
```

### Mode Navigasi POI

State machine:

```
[WAITING_LOCALIZE]
  HUD: "Menuju {poi.name} — arahkan kamera untuk lokalisasi..."
  Tombol developer (SET TUJUAN, TUJUAN MAP) disembunyikan
        ↓
  onLocalizationSuccess(worldFromMap) pertama kali
        ↓
[NAVIGATING]
  destinationWorld = poi.position (THREE.Vector3).applyMatrix4(worldFromMap)
  Pilar kuning ditempatkan di destinationWorld
  Panah AR mengarah ke destinationWorld setiap frame
  HUD: "jarak X.X m → ikuti panah — {poi.name}"
        ↓ (tiap onLocalizationSuccess background)
  anchorPoiDest(worldFromMap) → re-anchor (anti-drift)
        ↓
  dist horizontal < 1.2 m
        ↓
[ARRIVED]
  HUD: "✓ SAMPAI di {poi.name}"
  Tombol SELESAI ✓ aktif → intent:// ke Flutter
```

### Mode Developer

Tidak ada perubahan dari kondisi saat ini. Semua tombol lama tetap:
- SET TUJUAN (world-anchored drop-pin)
- TUJUAN MAP (map-anchored, uji akurasi)
- RELOCALIZE
- SELESAI ✓

---

## Bagian 3: Fitur REKAM POI

**Muncul di semua mode** (developer & navigasi) sebagai alat bantu pengisian data lapangan.

### Behavior

| Kondisi saat tombol ditekan | Hasil |
|---|---|
| `poseFound=true` (`lastMapPos` ada) | Tampilkan output JSON POI di HUD — siap copy-paste |
| Belum ada localize | HUD: `"Belum ada pose — arahkan kamera ke sekeliling dulu."` |

### Output di HUD saat berhasil

```
📍 REKAM POI (copy ke pois.json):
{
  "id": "",
  "name": "",
  "floor": N,
  "mapCode": "MAP_...",
  "position": { "x": X.X, "y": Y.Y, "z": Z.Z }
}
```

- `mapCode` diisi dari kode map yang terlihat di localize terakhir.
- `floor` diisi dari deteksi elevasi Y (threshold Y ≥ 1.5 → lantai 2).

Output ini **tidak auto-disimpan** — user copy-paste secara manual ke `pois.json`.
Ini desain sadar: menjaga spike tetap stateless & tidak butuh backend.

---

## Bagian 4: Perubahan `src/main.js`

### Fungsi Baru

**`loadPoi(poiId)`** — async, dipanggil di awal `main()`:
- Fetch `public/data/pois.json`.
- Cari POI dengan `id === poiId`.
- Return POI object atau `null` jika tidak ditemukan.
- Error handling: fetch gagal → HUD error, fallback ke Mode Developer.

**`anchorPoiDest(poi, worldFromMap)`** — sync:
- Buat `THREE.Vector3` dari `poi.position`.
- `.applyMatrix4(worldFromMap)` → `destinationWorld`.
- Update `destination`, `destMarker.position`, visibilitas marker & panah.

### Perluasan `onLocalizationSuccess`

```js
onLocalizationSuccess: (_result, worldFromMap) => {
  // ... kode lama (gizmo, drift) tetap ...
  lastWorldFromMap = worldFromMap;
  if (activePoi) anchorPoiDest(activePoi, worldFromMap); // ← tambahan
  draw();
},
```

### Kondisi Render Tombol

```js
const poiMode = activePoi !== null;
if (!poiMode) {
  mkBtn("SET TUJUAN", ...);
  mkBtn("TUJUAN (MAP)", ...);
  mkBtn("RELOCALIZE", ...);
}
mkBtn("REKAM POI", ...);  // selalu ada
mkBtn("SELESAI ✓", ...);  // selalu ada
```

---

## Error Handling

| Skenario | Behavior |
|---|---|
| `?poiId=X` tapi `pois.json` tidak ada / fetch error | HUD: `"Gagal memuat data POI."` → fallback Mode Developer |
| `?poiId=X` tapi id tidak ditemukan | HUD: `"POI 'X' tidak ditemukan."` → fallback Mode Developer |
| localize tidak kunjung `poseFound` | State tetap `WAITING_LOCALIZE`, HUD informatif |
| POI ditemukan tapi localize sangat tidak stabil | `anchorPoiDest` tetap jalan tiap localize — user akan melihat drift di marker. Expected behavior di spike; bukan bug yang harus di-mask. |

---

## Yang Tidak Termasuk Scope (YAGNI)

- ❌ Dropdown selector POI di UI (tidak ada `?poiId=` = Mode Developer)
- ❌ Auto-simpan rekaman POI ke file/localStorage
- ❌ Multi-POI atau routing antar POI (A*)
- ❌ Backend API — data dari file JSON statis di `public/`
- ❌ Validasi lantai (floor mismatch warning) — terlalu dini sebelum localize stabil

---

## Urutan Pengujian

1. **Sekarang (tanpa ke lokasi)**: Test dengan koordinat placeholder di JSON. Verifikasi:
   - `?poiId=CONTOH_PLACEHOLDER` → Mode Navigasi aktif, tombol developer tersembunyi.
   - Tombol SELESAI dan REKAM POI selalu ada.
   - URL tanpa `?poiId=` → Mode Developer, semua tombol lama jalan.
   - `?poiId=TIDAK_ADA` → HUD error yang benar.

2. **Setelah localize stabil (ke lokasi)**: Gunakan REKAM POI, isi `pois.json`, deploy ulang, verifikasi navigasi end-to-end.

---

## Hubungan dengan Roadmap Proyek

- Tidak melanggar gerbang CLAUDE.md: logic dibangun di atas koordinat placeholder dulu, bukan di atas localize yang tidak stabil.
- Setelah pindah ke Next.js: `pois.json` diganti dengan API call dari `lib/api.ts` yang sudah ada di repo WebView.
- Kontrak Flutter → WebXR via `?poiId=` tetap sama.
