# Hasil Uji Lapangan — DARSI WebXR

Catatan kronologis semua pengujian perangkat di lokasi nyata.

---

## Uji 1: 2026-07-22 — RS Jemursari (TECNO KL7, Android 14, Seluler)

**Tujuan:** Validasi pertama WebXR+VPS di perangkat nyata.

**Setup:** `darsi-webxr.vercel.app`, mapset `MSET_PKRKGGFB1RO0` (2 lantai).

### Hasil Positif

| Uji | Hasil |
|---|---|
| WebXR immersive-ar di browser | ✅ `sesi: AKTIF`, feed kamera + HUD overlay |
| Auth (CORS + kredensial) | ✅ `auth: OK` |
| VPS localize dari web | ✅ `poseFound=true`, conf 0.648–0.693 |
| `worldFromMap` anchoring | ✅ 3 bola penanda menempel di ruang |
| `mapCodes` diskriminasi lantai | ✅ TERBUKTI |
| iOS unsupported | ✅ iPhone menampilkan pesan error yang tepat |
| Loop navigasi world-anchored | ✅ drop-pin + panah + jarak + "sampai" |

### Temuan Diskriminasi Lantai

```
Lantai 1:  mapCodes = [MAP_MW1QTZWG1TLG]                     ← 1 kode
Lantai 2:  mapCodes = [MAP_BCADVLIXFSJE, MAP_MW1QTZWG1TLG]   ← 2 kode
```

**Sinyal lantai (TERBUKTI):**
```
Lantai 1: pos(map) x=-1.9 y=-0.5 z=34.3
Lantai 2: pos(map) x=-2.0 y= 3.7 z=38.0
           ΔY = 4.2 m = tinggi satu lantai
```

### Koreksi yang Ditemukan

1. `mapCodes` TIDAK selalu satu map — lantai 2 mengembalikan dua.
2. Urutan `mapCodes` = artefak dari urutan `hintMapCodes`, bukan peringkat.

### ⛔ BLOCKER: Localize Tidak Stabil

| conf | mapCodes | geser antar-localize |
|---|---|---|
| 0.817 | 1 map | **25.5 m** |
| 0.780 | 1 map | **5.2 m** |
| 0.543 | 2 map (ambigu) | **59.8 m** |

**Diagnosis:** Salah-lokalisasi berat. VPS mengunci ke lokasi mirip-tapi-salah
(koridor RS berulang & mirip antar-lantai). Confidence tidak bisa jadi filter.

**Dikonfirmasi server (dashboard MultiSet):**
- Success rate **65%** (54 Found / 83; 29 Not Found).
- Lantai 1 (Azzara2/BCAD) paling lemah.

---

## Uji 2: 2026-07-23 — RS Jemursari (Lantai 2, Mesh Diagnostik)

**Tujuan:** Verifikasi akurasi mesh overlay setelah koreksi setup SDK.

### Temuan: REPEATABLE ≠ ACCURATE

Di lantai 2 yang ter-localize BENAR (`mapCodes=[MW]`, `pos.y=3.9`), localize
STABIL (`geser 0.1–0.4 m`, `conf 0.73–0.75`), namun `showMesh` menunjukkan
mesh tetap melayang/tidak pas koridor nyata.

**Pelajaran:**
- `geser` kecil = REPEATABILITY (konsisten antar-localize), BUKAN AKURASI (vs dunia nyata).
- Mesh overlay = satu-satunya cek AKURASI yang kita punya.

---

## Uji 3: 2026-07-28 — RS Jemursari (Lantai 2, Panah 3D + showMesh:false)

**Tujuan:** Validasi panah 3D kustom dan kamera AR aktif tanpa mesh.

### Hasil

- Lantai 2 terkonfirmasi valid (Y ≈ 3.81m).
- Koordinat POI direkam: `x=-1.56, y=3.81, z=39.58`.
- Model 3D panah kustom (`arrow.gltf`) berfungsi melayang dan mengarah ke POI.
  *(Catatan 2026-07-29: panah ini kemudian dihapus — ADR-W008. Hasil uji di atas tetap
  dicatat apa adanya sebagai rekaman sejarah.)*
- `showMesh: false` → kamera HP aktif 100% transparan, performa AR ringan.
- Mesh offset diklasifikasi sebagai bug visual diagnostik, bukan masalah navigasi.

---

## Uji 4: 2026-07-29 — RS Jemursari (Lantai 2, Chevron Trail + Warm-Up ARCore)

**Tujuan:** Validasi chevron trail sebagai penunjuk arah tunggal (ADR-W008) dan efek
warm-up ARCore 1.5 dtk sebelum lokalisasi pertama (ADR-W005).

### ✅ REKOR BARU: geser 0.08 m

```
16:16  conf=0.831  rt=1188ms  mapCodes=[MAP_MW1QTZWG1TLG]   ← satu map, tidak ambigu
       pos(map): x=-1.8 y=3.9 z=32.8                        ← Lantai 2
       anchor geser/relocalize: 0.08 m                      ← terbaik yang pernah tercatat
       jarak 3.8 m
```

Chevron mengikuti koridor nyata menuju tangga; pilar tujuan berdiri di lantai (perbaikan
origin geometri, lihat catatan regresi di bawah). Rekor `geser` sebelumnya 0.1–0.4 m (Uji 2)
→ **bukti pertama yang mendukung warm-up ARCore.** Belum konklusif: satu sampel, dan `geser`
tetap mengukur *repeatability*, bukan akurasi terhadap dunia nyata.

### Temuan: jejak menembus tembok ≠ masalah occlusion

```
16:18  conf=0.614  rt=1554ms  mapCodes=[BCADVLIXFSJE, MW1QTZWG1TLG]  ← DUA map, ambigu
       pos(map): x=-1.3 y=3.8 z=-1.3   (dari z=32.8)
       anchor geser/relocalize: 6.88 m
       jarak 34.2 m
```

Chevron tampak "memanjat tembok". **Bukan occlusion, dan bukan bug render:** semua chevron
digambar pada satu bidang Y datar (`floorY`) sehingga mustahil memanjat — yang terlihat itu
perspektif jejak sepanjang 34 m yang memanjang ke kejauhan.

Akarnya: `navgraph.json` hanya punya 3 node, jadi A* tak punya simpul di sepanjang 34 m itu
dan jatuh ke **fallback garis lurus ke POI** — garis lurus sejauh itu di dalam gedung memang
menembus tembok.

**Konsekuensi keputusan:** occlusion TIDAK akan memperbaiki ini, hanya menyembunyikannya.
Meng-clip bagian di balik tembok menyisakan jejak yang menunjuk lurus *ke dalam* tembok lalu
terpotong — rutenya yang salah, bukan cara menggambarnya. Prioritas benar = **rapatkan
navgraph**, bukan occlusion.

### Catatan regresi (ditemukan & diperbaiki hari yang sama)

Semua pilar penanda sempat tenggelam separuh ke lantai dan ter-deploy ke produksi.
Sebabnya: `THREE.CylinderGeometry` ber-origin di **tengah**, dan offset lama `−0.7` / `−0.5`
(yang sebenarnya `setengah tinggi − 0.1`) disangka magic number tak konsisten lalu
diseragamkan jadi `−EYE_HEIGHT`. Perbaikan: origin geometri digeser ke alas sekali lewat
helper `pillarGeo()`, `EYE_HEIGHT = 1.5` mengembalikan penempatan lama yang benar.
Gerbang pencegahnya dicatat di `CLAUDE.md`.

### Belum diuji

- `?mesh=true` — kesejajaran mesh setelah warm-up ARCore.
- `?mapset=true` — pembacaan `relativePose` (uji akar mesh-meleset).
- Gerbang lintas-lantai (pilih POI Lt 1 sambil berdiri di Lt 2).
- Visibilitas chevron saat HP dipegang setinggi dada (`docs/KNOWN-ISSUES.md`).
