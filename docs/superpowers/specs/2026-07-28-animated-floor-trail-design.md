# Spec: Animated Floor Arrow Trail (World-Anchored Navigation) — DARSI WebXR

**Tanggal**: 2026-07-28  
**Status**: Disetujui — Siap untuk Implementation Plan  
**Scope**: `src/main.js` (Floor Trail Generator & Animation Loop)

---

## 1. Masalah & Konteks

Panah navigasi melayang kaku di depan mata (*head-locked HUD*) kurang imersif dan sering terasa seperti stiker 2D di layar HP. 

Standar industri (Google Maps Live View / Apple Maps AR) menggunakan **World-Anchored Animated Floor Trail**: deretan panah beranimasi yang menapak di atas lantai fisik lorong gedung.

---

## 2. Arsitektur Teknis

### A. Floor Trajectory Calculation
1. Dapatkan larik waypoint dari A* Pathfinding (`activeWaypointsMap`).
2. Konversi ke world-space: `wPos = mapPos.clone().applyMatrix4(worldFromMap)`.
3. Set elevasi ketinggian $Y$: `wPos.y = floorY + 0.08m` (menapak di lantai).

### B. Chevron Arrow Placement & Animation
1. Hitung total panjang lintasan A* dan sampel titik koordinat setiap interval $0.6\text{m}$.
2. Buat objek panah 3D chevron kecil berwarna **Hijau Pastel Mint (`#34d399`)**.
3. Di dalam `onXRFrame`, geser offset animasi `trailOffset = (time * 0.8) % spacing` untuk menciptakan efek panah bergerak berjalan menyusuri lantai lorong.

---

## 3. Pengujian & Verifikasi

1. **Uji Floor Anchoring**: Panah menapak jernih di atas permukaan lantai lorong.
2. **Uji Flow Motion**: Panah bergerak mengalir secara beranimasi menyusuri koridor ke arah POI.
3. **Uji Occlusion**: Panah terputus/tersembunyi di balik dinding lorong saat lorong berbelok.
4. **Build Test**: `npm run build` lulus 100%.
