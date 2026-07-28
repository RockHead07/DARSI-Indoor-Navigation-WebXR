# Animated Floor Arrow Trail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti panah melayang kaku (*head-locked*) menjadi deretan panah 3D pastel mint beranimasi yang berjalan menapak di atas lantai koridor (*World-Anchored Animated Floor Trail*).

**Architecture:**
1. Di `src/main.js`, buat `floorTrailGroup = new THREE.Group()`.
2. Saat A* pathfinding menghasilkan waypoints, buat sampel titik setiap $0.6\text{m}$ di atas elevasi lantai ($Y_{\text{lantai}} + 0.08\text{m}$).
3. Di dalam `onXRFrame`, update offset animasi mengalir `trailOffset` sehingga panah-panah pastel mint bergerak berjalan menyusuri lorong menuju POI.

**Tech Stack:** Three.js, WebGL Depth Buffer, WebXR.

## Global Constraints

- Warna panah: Hijau Pastel Mint (`#34d399` / `0x34d399`).
- Commit sebagai pemilik (Bagus Insan Pradana), TANPA `Co-Authored-By`.

---

### Task 1: Integrasikan Animated Floor Arrow Trail di `src/main.js`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Edit `src/main.js`**

1. Buat `floorTrailGroup = new THREE.Group()` dan beri `renderOrder = 1`.
2. Tambahkan fungsi `updateFloorTrail(waypointsWorld)`:
   - Hitung sampel titik sepanjang kurva lintasan A* di elevasi lantai.
   - Buat deretan panah chevron hijau pastel mint.
3. Di `onXRFrame`, update animasi geser `trailOffset`.

- [ ] **Step 2: Run verification build**

Run: `npm run build`  
Expected: PASS exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat(ar): integrasi Animated Floor Arrow Trail (panah pastel mint berjalan menapak di lantai)"
```
