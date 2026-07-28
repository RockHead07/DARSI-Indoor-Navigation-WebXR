# Admin Debug & POI Overlay Slider Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan UI Slider Toggle Switch (Mode Developer/Admin) untuk mengontrol visibilitas seluruh titik POI 3D dan tombol diagnostik developer.

**Architecture:**
1. CSS & HTML di `index.html`: Tambahkan markup `.switch` dan `#toggle-debug-mode` di bagian bawah `#nav-controls`.
2. Logic di `src/main.js`:
   - `allPoiGroup`: Menampung seluruh pilar 3D POI dari `pois.json`.
   - Event listener `#toggle-debug-mode.onchange`: Toggle `allPoiGroup.visible` dan visibilitas tombol diagnostik (`mkBtn`).

**Tech Stack:** HTML5, CSS3, JavaScript (ES Modules), Three.js.

## Global Constraints

- Standby Default: OFF (kecuali jika URL mengandung `?admin=true` atau `?debug=true`).
- Commit sebagai pemilik (Bagus Insan Pradana), TANPA `Co-Authored-By`.

---

### Task 1: Tambahkan Switch Slider Markup & CSS di `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Edit `index.html`**

Tambahkan styling CSS untuk `.switch` dan slider round, serta tambahkan elemen `#debug-toggle-row` di `#nav-controls`.

```html
<!-- Styling tambahan di index.html -->
<style>
  /* Toggle Switch Slider */
  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 2px;
    font-size: 13px;
    color: #cbd5e1;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    margin-bottom: 6px;
  }
  .switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
  }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider {
    position: absolute; cursor: pointer; inset: 0;
    background-color: #334155; transition: .3s;
    border-radius: 24px;
  }
  .slider:before {
    position: absolute; content: ""; height: 18px; width: 18px;
    left: 3px; bottom: 3px; background-color: white;
    transition: .3s; border-radius: 50%;
  }
  input:checked + .slider { background-color: #10b981; }
  input:checked + .slider:before { transform: translateX(20px); }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat(ui): tambah markup & CSS slider switch mode admin/developer"
```

---

### Task 2: Integrasikan Logika Toggle State & POI Overlay di `src/main.js`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Edit `src/main.js`**

1. Ambil rujukan `#toggle-debug-mode`.
2. Buat `allPoiGroup = new THREE.Group()` di scene.
3. Saat `loadAllPois()` selesai, buat 3D pilar untuk semua POI di `allPoiGroup`.
4. Hubungkan event handler `#toggle-debug-mode.onchange`:
   - Kontrol `allPoiGroup.visible` dan tombol-tombol diagnostik developer.

- [ ] **Step 2: Run verification build**

Run: `npm run build`  
Expected: PASS exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat(admin): integrasi toggle slider mode developer & POI overlay 3D"
```
