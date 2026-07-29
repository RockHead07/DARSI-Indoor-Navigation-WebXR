# Roadmap & Spec: Google Maps-Style Indoor Pathfinding (V2)

**Tanggal**: 2026-07-27  
**Status**: Roadmap / Planned for Next Phase  
**Repo Parent / Referensi**: `D:\Dev\Projects\UnityProjects\Learning\DARSI-Indoor Navigation`  
**Repo Spike (WebXR)**: `D:\Dev\Projects\DARSI-Indoor-Navigation-WebXR`

---

## 🎯 Visi & Konsep

Mengembangkan sistem navigasi AR dari petunjuk panah garis lurus (*air distance*) menjadi **turn-by-turn indoor routing (Google Maps Style)** yang memandu pengguna mengikuti alur koridor/gang fisik bangunan tanpa menembus dinding.

---

## 📐 Arsitektur Teknis

### 1. Data Layer: Graph Koridor (`public/data/navgraph.json`)

Tentukan jaringan titik koridor (*waypoints/nodes*) dan koneksi antar-titik (*edges*) dalam koordinat mentah map-space VPS:

```json
{
  "mapSetCode": "MSET_PKRKGGFB1RO0",
  "nodes": [
    { "id": "N1_LIFT_LT2", "floor": 2, "position": { "x": -1.50, "y": 3.80, "z": 30.10 } },
    { "id": "N2_KORIDOR_TENGAN", "floor": 2, "position": { "x": -1.56, "y": 3.81, "z": 39.58 } },
    { "id": "N3_SIMPANG_POLI", "floor": 2, "position": { "x": 5.20, "y": 3.81, "z": 39.58 } }
  ],
  "edges": [
    { "from": "N1_LIFT_LT2", "to": "N2_KORIDOR_TENGAN", "distance": 9.48 },
    { "from": "N2_KORIDOR_TENGAN", "to": "N3_SIMPANG_POLI", "distance": 6.76 }
  ]
}
```

### 2. Routing Engine: A* (A-Star Pathfinding)

- **Input**: Posisi pengguna terkini (`lastMapPos` dari VPS) + `poi.position` target.
- **Proses**:
  1. Cari node terdekat (*nearest waypoint*) dari posisi pengguna saat ini.
  2. Cari node terdekat dari lokasi POI target.
  3. Jalankan algoritma A* untuk mendapatkan urutan node lintasan terpendek: `[UserNode → N1 → N2 → N3 → POI]`.
- **Output**: Array titik koordinat world-space yang harus dilalui pengguna.

### 3. AR Floor Visualizer & Turn-by-Turn Guidance

- ✅ **Floor Chevron Trail** (`floorTrailGroup`): chevron AR menapak lantai tiap 0.5 m mengikuti
  urutan segment rute, dengan animasi berjalan maju. **Ini penunjuk arah tunggal** — panah HUD
  melayang sudah dihapus (ADR-W008), karena chevron sudah mengarah ke node persimpangan
  berikutnya lewat A* dan tidak menembus dinding.
- ⬜ **HUD Instructions**: teks instruksi kontekstual di HUD (mis. *"Lurus 15m, lalu belok kanan
  ke Poli Anak"*). Belum ada.
- ⬜ **Navgraph memadai**: `navgraph.json` masih 3 node / 2 edge di Lantai 2 saja. Sampai node
  koridor Lantai 1 + tangga/lift direkam, rute A* nyaris garis lurus dan chevron belum
  menunjukkan nilai penuhnya. **Ini prasyarat terbesar yang tersisa di roadmap ini.**

---

## 🔗 Referensi & Integrasi dengan Parent Project

- Parent Unity Project (`D:\Dev\Projects\UnityProjects\Learning\DARSI-Indoor Navigation`) digunakan sebagai acuan denah layout bangunan & validasi titik koordinat visual jika diperlukan.
- Pada implementasi akhir di Next.js WebView (`darsi-indoor-navigation-ui-webview`), data `navgraph.json` ini akan dipasang melalui API backend atau static assets di Next.js.
