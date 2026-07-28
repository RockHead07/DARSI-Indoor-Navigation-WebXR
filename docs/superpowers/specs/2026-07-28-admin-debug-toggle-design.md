# Spec: Admin Debug & POI Overlay Slider Toggle — DARSI WebXR

**Tanggal**: 2026-07-28  
**Status**: Disetujui — Siap untuk Implementation Plan  
**Scope**: `index.html` (Slider Toggle Component) + `src/main.js` (Debug Overlay State)

---

## 1. Tujuan & Konteks

Menyediakan **Toggle Slider Switch (Mode Developer/Admin)** pada UI WebXR AR untuk:
1. Memisahkan tampilan bersih bagi pengguna biasa (hanya 1 POI aktif) dengan tampilan diagnostik bagi Admin/Owner.
2. Memungkinkan Admin melihat **seluruh titik POI secara bersamaan** di dalam ruang 3D gedung saat pengujian lapangan.
3. Menyembunyikan/menampilkan tombol-tombol diagnostik (`REKAM POI 📍`, `SET TUJUAN`, `TUJUAN MAP`, `RELOCALIZE`).

---

## 2. Desain UI & Layout Switch (`index.html`)

### A. iOS/Android Style Toggle Switch
Ditambahkan di atas bottom panel `#nav-controls`:

```html
<div id="debug-toggle-row">
  <span>🛠️ Mode Admin / Debug</span>
  <label class="switch">
    <input type="checkbox" id="toggle-debug-mode">
    <span class="slider round"></span>
  </label>
</div>
```

### B. CSS Styling (Glassmorphism)
- `.switch`: `position: relative; display: inline-block; width: 44px; height: 24px;`
- `.slider.round`: `border-radius: 24px; background-color: #334155;`
- `input:checked + .slider`: `background-color: #10b981;`

---

## 3. Logika State & Render (`src/main.js`)

1. **`allPoiGroup`**: `THREE.Group` yang menampung pilar 3D untuk semua POI di `pois.json`.
2. **Event `toggleDebugMode.onchange`**:
   - Jika `checked == true` $\rightarrow$ `allPoiGroup.visible = true`, tunjukkan tombol-tombol developer (`mkBtn`).
   - Jika `checked == false` $\rightarrow$ `allPoiGroup.visible = false`, sembunyikan tombol-tombol developer.
3. **URL Parameter Auto-Check**: Jika URL mengandung `?admin=true` atau `?debug=true`, slider otomatis posisi **ON**.

---

## 4. Pengujian & Verifikasi

1. **Test Toggle OFF**: Layar bersih, hanya POI terpilih yang muncul, tombol developer tersembunyi.
2. **Test Toggle ON**: Seluruh POI di `pois.json` muncul melayang di lokasi fisik 3D, tombol `REKAM POI`, `RELOCALIZE` muncul.
3. **Build Test**: `npm run build` lulus 100%.
