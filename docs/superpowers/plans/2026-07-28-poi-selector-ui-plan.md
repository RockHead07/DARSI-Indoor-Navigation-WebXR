# POI Selector & Stop Navigation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementasi UI floating bottom bar di WebXR (DOM Overlay) untuk memilih POI dari `pois.json` dan menghentikan navigasi kapan saja via tombol "Stop Navigation".

**Architecture:** 
1. HTML/CSS di `index.html`: Tambahkan `#nav-controls` container (glassmorphism) dengan `#poi-select`, `#btn-start-nav`, dan `#btn-stop-nav`.
2. JS di `src/main.js`: Management state `currentPoiTarget`, handler untuk start/stop navigation, dan populate dropdown dari `pois.json`.

**Tech Stack:** HTML5, CSS3 (Vanilla), JavaScript ES Modules, Three.js / WebXR.

## Global Constraints

- Bebas kerumitan: Gunakan vanilla CSS glassmorphism tanpa TailwindCSS (sesuai aturan proyek).
- POI Data Source: `public/data/pois.json`.
- Commit sebagai pemilik (Bagus Insan Pradana), TANPA `Co-Authored-By`.

---

### Task 1: Tambahkan HTML & Styling CSS UI Control di `index.html`

**Files:**
- Modify: `index.html:10-22`

- [ ] **Step 1: Edit `index.html`**

Tambahkan elemen `#nav-controls` dan style CSS glassmorphism untuk `#nav-controls`, `#poi-select`, `.btn-action`, `#btn-start-nav`, dan `#btn-stop-nav`.

```html
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>DARSI WebXR — Indoor Navigation</title>
  <style>
    html, body { margin: 0; height: 100%; background: #000; color: #eee;
      font: 14px/1.5 system-ui, -apple-system, sans-serif; }
    /* HUD tetap terlihat saat sesi AR lewat WebXR DOM overlay (overlayRoot = body) */
    #hud { position: fixed; inset: 0 0 auto 0; padding: 12px 14px;
      background: rgba(0,0,0,.6); white-space: pre-wrap; z-index: 10;
      pointer-events: none; }
    #hud b { color: #00ff88; }
    .warn { color: #ffb020; }
    .err  { color: #ff5060; }

    /* Bottom Floating Nav Panel */
    #nav-controls {
      position: fixed;
      bottom: 16px;
      left: 16px;
      right: 16px;
      z-index: 20;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 16px;
      padding: 12px 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-sizing: border-box;
    }
    .panel-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    #poi-select {
      flex: 1;
      background: rgba(30, 41, 59, 0.9);
      color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      outline: none;
    }
    .btn-action {
      border: none;
      border-radius: 10px;
      padding: 10px 16px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      color: #ffffff;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    #btn-start-nav {
      background: linear-gradient(135deg, #10b981, #059669);
    }
    #btn-start-nav:active {
      transform: scale(0.96);
    }
    #btn-stop-nav {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      width: 100%;
    }
    #btn-stop-nav:active {
      transform: scale(0.96);
    }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div id="hud">DARSI WebXR — memuat…</div>

  <div id="nav-controls">
    <!-- Panel Standby: Pilihan POI -->
    <div id="panel-standby" class="panel-row">
      <select id="poi-select">
        <option value="">-- Pilih Tujuan POI --</option>
      </select>
      <button id="btn-start-nav" class="btn-action">Navigasi 🚀</button>
    </div>

    <!-- Panel Active: Status & Stop Navigation -->
    <div id="panel-active" class="panel-row hidden">
      <button id="btn-stop-nav" class="btn-action">🛑 Hentikan Navigasi</button>
    </div>
  </div>

  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Run verification build**

Run: `npm run build`  
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ui): tambah markup & style CSS floating panel POI selector"
```

---

### Task 2: Hubungkan Logika UI Selector & Stop Navigation di `src/main.js`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Implementasi logika JS di `src/main.js`**

1. Ambil rujukan DOM elements: `#panel-standby`, `#panel-active`, `#poi-select`, `#btn-start-nav`, `#btn-stop-nav`.
2. Buat fungsi `loadAllPois()` untuk mengambil seluruh isi `public/data/pois.json` dan mengisi `<select id="poi-select">`.
3. Tambahkan event listener ke `#btn-start-nav`:
   - Ambil nilai dari `#poi-select`.
   - Set POI tujuan dan sembunyikan `#panel-standby`, munculkan `#panel-active`.
4. Tambahkan event listener ke `#btn-stop-nav`:
   - Reset `activePoi = null` / `currentPoiTarget = null`.
   - Sembunyikan panah 3D (`arrowGroup.visible = false`).
   - Sembunyikan `#panel-active`, munculkan `#panel-standby`.
   - Reset `state.nav = "Navigasi dihentikan. Pilih tujuan di bawah."`.

- [ ] **Step 2: Verification Build**

Run: `npm run build`  
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat(ui): integrasi event handler POI selector & stop navigation"
```
