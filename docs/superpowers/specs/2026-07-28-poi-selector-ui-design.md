# Spec: POI Selector & Stop Navigation UI — DARSI WebXR

**Tanggal**: 2026-07-28  
**Status**: Disetujui — Siap untuk Plan & Eksekusi  
**Scope**: `index.html` (DOM Overlay UI) + `src/main.js` (UI state management)

---

## 1. Tujuan & Konteks

Menyediakan kontrol UI interaktif di layar WebXR (DOM Overlay) yang memudahkan pengguna untuk:
1. Memilih tujuan POI secara instan dari daftar `public/data/pois.json` tanpa harus mengetik URL parameter `?poiId=`.
2. Menghentikan navigasi kapan saja via tombol **Stop Navigation** (`🛑 Hentikan Navigasi`).

UI ini dirancang dengan estetika **Floating Bottom Bar Glassmorphism** yang ergonomis untuk jangkauan jempol pengguna saat menggunakan AR di HP Android.

---

## 2. Desain Layout & UX (Pendekatan A)

### Kondisi Layar

#### A. Kondisi Standby / Belum Ada Tujuan Aktif
Di bagian bawah layar (bottom floating area), muncul bar transparan berisi:
- **Label Header**: `🎯 Pilih Tujuan Navigasi`
- **Dropdown / Cards List**: Menampilkan daftar POI yang tersedia di `pois.json` (dipisahkan berdasarkan lantai / nama POI).
- **Tombol "Mulai Navigasi"**: Setelah POI dipilih dari dropdown → tap tombol ini untuk mengunci target navigasi.

#### B. Kondisi Navigasi Aktif (`currentPoiTarget != null`)
Bar bagian bawah berubah menjadi **Active Navigation Panel**:
- **Teks Status**: Menampilkan nama POI tujuan & estimasi jarak real-time (misal: `📍 Ke: Poliklinik Azzara 201 (12.4 m)`).
- **Tombol "🛑 Hentikan Navigasi"**: Tombol merah/dark semi-transparan.
  - Saat ditap:
    1. Menyembunyikan panah 3D (`arrowGroup.visible = false`).
    2. Menghapus target POI (`currentPoiTarget = null`).
    3. Mengembalikan tampilan bottom bar ke **Kondisi Standby**.

---

## 3. Komponen & Styling CSS (`index.html`)

### Floating Bottom Panel (`#nav-controls`)
- `position: fixed; bottom: 16px; left: 16px; right: 16px; z-index: 20;`
- `background: rgba(15, 23, 42, 0.85);` (Dark slate dengan backdrop-blur/glassmorphism).
- `border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 16px;`
- `padding: 12px 16px; color: #fff;`
- `pointer-events: auto;` (dapat di-tap/di-interaksi di WebXR DOM overlay).

### Element Internal:
1. `#poi-select` (`<select>` HTML styled):
   - Background dark, text putih, border rounded.
   - Populated secara dinamis dari `pois.json` saat aplikasi di-load.
2. `#btn-start-nav` (`<button>`):
   - Gradient hijau/emerald (`#10b981`).
   - Memulai navigasi ke `poiSelect.value`.
3. `#btn-stop-nav` (`<button>`):
   - Gradient merah/rose (`#ef4444`).
   - Menyembunyikan panah & mereset state navigasi.

---

## 4. Perubahan Logika di `src/main.js`

### State Management:
- Global state `currentPoiTarget` (null jika tidak ada navigasi).
- Fungsi `renderNavControls()` untuk melakukan toggle tampilan panel (Standby vs Active).
- Fungsi `populatePoiDropdown(pois)` saat data `pois.json` berhasil di-fetch.

### URL Query Parameter `?poiId=`:
- Jika URL membawa `?poiId=AZZARA_201`, sistem otomatis memilih POI tersebut dan mengaktifkan mode **Active Navigation Panel** secara langsung.

---

## 5. Pengujian & Verifikasi

1. **Test Standby Mode**: Buka app tanpa query parameter → Dropdown POI muncul dan terisi dari `pois.json`.
2. **Test Start Nav**: Pilih POI dari dropdown → tap "Mulai Navigasi" → Panah 3D muncul & mengarah ke POI, UI berubah ke Active Panel.
3. **Test Stop Nav**: Tap "Hentikan Navigasi" → Panah 3D hilang, UI kembali ke Standby.
4. **Test Direct URL**: Buka `?poiId=...` → Navigasi langsung aktif, tombol Stop Nav langsung muncul.
5. **Build Test**: Run `npm run build` untuk memverifikasi sintaks HTML/CSS/JS.
