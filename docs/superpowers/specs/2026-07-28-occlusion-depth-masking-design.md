# Spec: Occlusion Handling (Depth Masking) — DARSI WebXR

**Tanggal**: 2026-07-28  
**Status**: Disetujui — Siap untuk Implementation Plan  
**Scope**: `src/main.js` + `ThreeAdapter` Mesh Material Transformer

---

## 1. Masalah & Konteks

Objek AR (pilar POI kuning & panah 3D) saat ini terlihat merembes / menembus dinding fisik gedung. Hal ini menurunkan aspek realisme & immersiveness navigasi AR indoor.

Karena HP Android standar tidak memiliki sensor LiDAR hardware untuk WebXR depth sensing, solusi berstandar industri adalah menggunakan **Invisible Depth Masking Occluder** memanfaatkan 3D Mesh scan gedung dari VPS.

---

## 2. Rancangan Solusi: Invisible Mesh Occluder

Saat lokalisasi VPS berhasil, `ThreeAdapter` menerima GLTF Mesh gedung. Kita mentransformasi material dari mesh tersebut menjadi occluder transparan:

```javascript
function applyDepthMaskMaterial(buildingMesh) {
  buildingMesh.traverse((child) => {
    if (child.isMesh) {
      child.material = new THREE.MeshBasicMaterial({
        colorWrite: false, // Tidak melukis piksel warna (kamera HP tetap terlihat)
        depthWrite: true,  // Tetap melukis nilai z-depth 3D ke buffer
      });
      child.renderOrder = 0; // Ter-render paling awal di pipeline WebGL
    }
  });
}
```

---

## 3. Integrasi pada `src/main.js`

1. Aktifkan penangkapan mesh gedung di `ThreeAdapter` saat lokalisasi sukses (`onLocalizationSuccess`).
2. Terapkan `applyDepthMaskMaterial()` ke mesh gedung tersebut.
3. Objek AR (pilar POI & panah) diberi `renderOrder = 1` agar di-clip secara otomatis oleh depth buffer tembok gedung.

---

## 4. Pengujian & Verifikasi

1. **Uji Tembok**: Tempatkan POI di balik dinding $\rightarrow$ Pilar POI terputus / tersembunyi di balik dinding fisik.
2. **Uji Koridor**: Pengguna berjalan mendekati POI $\rightarrow$ Pilar POI muncul kembali saat pengguna melewati sudut dinding.
3. **Build Test**: `npm run build` lulus 100%.
