# Spec: A* Pathfinding & NavGraph — DARSI WebXR

**Tanggal**: 2026-07-28  
**Status**: Disetujui — Siap untuk Implementation Plan  
**Scope**: `public/data/navgraph.json` + `src/main.js` (A* Engine & Waypoint Traversal)

---

## 1. Konteks & Tujuan

Saat ini, panah 3D mengarah langsung dalam garis lurus (*air distance*) ke POI tujuan. Fitur ini menambahkan **A* Corridor Pathfinding** agar panah memandu pengguna menyusuri koridor gedung secara realistis tanpa menembus dinding.

---

## 2. Struktur Data Graph (`public/data/navgraph.json`)

Data graph disimpan dalam file JSON independen yang berisi titik-titik koridor gedung:

```json
{
  "nodes": [
    { "id": "N_LT2_CORRIDOR_1", "floor": 2, "position": { "x": -1.90, "y": 3.80, "z": 34.30 } },
    { "id": "N_LT2_CORRIDOR_2", "floor": 2, "position": { "x": -1.56, "y": 3.81, "z": 39.58 } },
    { "id": "AZZARA_201_GATE",  "floor": 2, "position": { "x": -1.56, "y": 3.81, "z": 39.58 } }
  ],
  "edges": [
    { "from": "N_LT2_CORRIDOR_1", "to": "N_LT2_CORRIDOR_2", "distance": 5.28 },
    { "from": "N_LT2_CORRIDOR_2", "to": "AZZARA_201_GATE",  "distance": 1.00 }
  ]
}
```

---

## 3. Logika Mesin A* (`src/main.js`)

1. **`loadNavGraph()`**: Mengambil data `navgraph.json` saat aplikasi di-load.
2. **`findClosestNode(positionMap, floor)`**: Mencari node graph dengan jarak Euclidean terdekat dari posisi user dalam lantai yang sama.
3. **`findPathAStar(startNodeId, targetNodeId)`**: Algoritma A* standar (PriorityQueue/Sorted List) untuk menghitung rute terpendar dengan cost `f = g + h`.
4. **`updateArrowTargetWaypoints()`**: 
   - Tiap frame XR (`onXRFrame`), periksa jarak horizontal user ke waypoint aktif (`activeWaypoint`).
   - Jika `distance(user, activeWaypoint) < 1.2m`, lanjut ke waypoint berikutnya dalam rute.
   - Panah 3D di-orientasikan (`lookAt`) ke waypoint aktif tersebut.

---

## 4. Pengujian & Verifikasi

1. **Validasi Graph JSON**: Skrip CI/Vite memastikan `navgraph.json` adalah JSON valid.
2. **Tes Rute Single-Floor**: Navigasi ke POI lantai 2 mengikuti rute node koridor.
3. **Fallback Line-of-Sight**: Jika graph tidak tersedia / node terputus, sistem fallback ke navigasi garis lurus langsung ke POI.
4. **Build Test**: `npm run build` lulus 100%.
