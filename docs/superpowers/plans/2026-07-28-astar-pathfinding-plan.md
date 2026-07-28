# A* Pathfinding & NavGraph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementasi mesin A* Pathfinding dan pengolahan data `navgraph.json` agar panah 3D menuntun pengguna menyusuri koridor gedung titik demi titik.

**Architecture:**
1. Data file `public/data/navgraph.json`: Berisi titik node koridor dan bobot/jarak koneksi edges.
2. Logika A* di `src/main.js`:
   - `loadNavGraph()`: Fetch data graph dari server.
   - `findClosestNode()`: Cari node terdekat dari posisi user dalam map space.
   - `findAStarPath()`: Cari rute terpendek antar node.
   - Waypoint Traversal di `onXRFrame`: Alihkan target panah 3D dari satu waypoint ke waypoint berikutnya secara sekuensial saat user mendekati waypoint (<1.2m).

**Tech Stack:** JavaScript (ES Modules), Three.js, JSON.

## Global Constraints

- Standalone: Zero external pathfinding library dependencies (murni A* ~40-50 baris di `src/main.js`).
- Fallback: Jika graph tidak ada atau rute terputus, panah otomatis fallback ke navigasi garis lurus.
- Commit sebagai pemilik (Bagus Insan Pradana), TANPA `Co-Authored-By`.

---

### Task 1: Buat Data Corridor Graph di `public/data/navgraph.json`

**Files:**
- Create: `public/data/navgraph.json`

- [ ] **Step 1: Buat file `public/data/navgraph.json`**

Tulis data node & edges koridor untuk RS Islam Jemursari (Lantai 2 & Lantai 1):

```json
{
  "nodes": [
    {
      "id": "NODE_LT2_START",
      "name": "Koridor Utama Lantai 2",
      "floor": 2,
      "position": { "x": -2.0, "y": 3.7, "z": 34.3 }
    },
    {
      "id": "NODE_LT2_MID",
      "name": "Persimpangan Koridor Lantai 2",
      "floor": 2,
      "position": { "x": -1.8, "y": 3.8, "z": 37.0 }
    },
    {
      "id": "POIKU_1",
      "name": "Poliklinik Azzara 201",
      "floor": 2,
      "position": { "x": -1.56, "y": 3.81, "z": 39.58 }
    }
  ],
  "edges": [
    {
      "from": "NODE_LT2_START",
      "to": "NODE_LT2_MID",
      "distance": 2.7
    },
    {
      "from": "NODE_LT2_MID",
      "to": "POIKU_1",
      "distance": 2.6
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add public/data/navgraph.json
git commit -m "feat(data): tambah navgraph.json berisi node & edges koridor gedung"
```

---

### Task 2: Implementasikan Algoritma A* Pathfinding di `src/main.js`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Edit `src/main.js`**

1. Tambahkan fungsi `loadNavGraph()` untuk memuat `/data/navgraph.json`.
2. Implementasikan `findClosestNode(posMap, floor, graph)`:
   - Cari node dalam floor yang sama dengan jarak Euclidean `||posMap - node.position||` terkecil.
3. Implementasikan `solveAStar(startNodeId, targetNodeId, graph)`:
   - Priority queue / openSet sekuensial.
   - Return array of node position `Vector3`.
4. Integrasikan sekuensial waypoints ke `onXRFrame`:
   - Lacak `currentWaypointIndex` dari rute terhitung.
   - Arahkan `arrowGroup.lookAt()` ke `currentWaypoint`.
   - Jika jarak horizontal user ke `currentWaypoint < 1.2m`, naikkan `currentWaypointIndex++`.

- [ ] **Step 2: Run verification build**

Run: `npm run build`  
Expected: PASS exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat(nav): integrasi mesin A* pathfinding & sekuensial waypoint traversal"
```
