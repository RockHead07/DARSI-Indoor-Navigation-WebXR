# Occlusion Handling (Depth Masking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengaktifkan pemuatan mesh gedung dari VPS MultiSet dan mengubah materialnya menjadi invisible depth mask (`colorWrite: false`, `depthWrite: true`) agar tembok fisik memblokir objek AR di belakangnya secara realistis.

**Architecture:**
1. Konfigurasi `showMesh: true` pada `ThreeAdapter` di `src/main.js`.
2. Intersepsi pemuatan mesh di `ThreeAdapter` / `scene` traversal:
   - Cari objek mesh gedung VPS.
   - Terapkan material `THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true })`.
   - Set `renderOrder = 0` untuk occluder dan `renderOrder = 1` untuk objek AR (pilar & panah).

**Tech Stack:** Three.js, WebGL Depth Buffer, WebXR.

## Global Constraints

- Kamera HP tetap 100% jernih dan transparan.
- Commit sebagai pemilik (Bagus Insan Pradana), TANPA `Co-Authored-By`.

---

### Task 1: Integrasikan Invisible Occluder Material pada `src/main.js`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Edit `src/main.js`**

1. Tambahkan fungsi `applyOccluderMaterial(object)`:
   ```javascript
   function applyOccluderMaterial(object) {
     object.traverse((child) => {
       if (child.isMesh) {
         child.material = new THREE.MeshBasicMaterial({
           colorWrite: false,
           depthWrite: true,
         });
         child.renderOrder = 0;
       }
     });
   }
   ```
2. Ubah `showMesh: true` pada `ThreeAdapter`.
3. Pada `onLocalizationSuccess`, tangkap mesh gedung dari `scene` dan terapkan `applyOccluderMaterial`.
4. Berikan `renderOrder = 1` pada `destMarker` dan `arrowGroup`.

- [ ] **Step 2: Run verification build**

Run: `npm run build`  
Expected: PASS exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat(ar): integrasi Occlusion Depth Masking menggunakan mesh gedung VPS transparan"
```
