# Masalah & Limitasi yang Diketahui — DARSI WebXR

---

## ⛔ BLOCKER: Localize Map Jemursari Tidak Stabil

**Status:** BELUM TERSELESAIKAN  
**Dampak:** Memblokir navigasi POI map-anchored (titik lompat 5–60 m).  
**Akar masalah:** Kualitas scan map, bukan WebXR. Koridor RS berulang & mirip
antar-lantai → VPS false-match.

**Rencana penanganan (urut):**
1. Cek Localization Heatmap di dashboard MultiSet → bukti area scan lemah.
2. Ukur stabilitas di map A. Yani (target sebenarnya; butuh di lokasi).
3. Re-scan Jemursari dengan protokol `docs/SCAN-PROTOCOL.md`.
4. Uji ulang stabilitas localize setelah re-scan.

**Band-aid yang sudah DITOLAK:** filter tolak-outlier di client — menyembunyikan
gejala, bisa mengunci fix pertama yang salah. Map jelek tidak bisa diselamatkan
dari client (sejalan ADR-021).

---

## Occlusion: Objek AR Terlihat Menembus Tembok Fisik

**Status:** BELUM DIIMPLEMENTASIKAN  
**Dampak:** Pilar penanda POI dan panah 3D terlihat di balik tembok fisik (tidak
ter-occlude oleh geometri dunia nyata).

**Penyebab:** Kamera HP biasa tidak memiliki sensor depth/LiDAR. GPU WebGL
merender objek AR selalu di atas feed kamera.

**Rencana penanganan (opsi):**
1. **Depth Masking (Invisible Mesh Occluder):** Manfaatkan mesh scan gedung VPS
   sebagai occlusion buffer (`colorWrite: false`, `depthWrite: true`). Kamera tetap
   transparan, tapi objek AR di belakang tembok ter-clip oleh depth buffer.
2. **Proximity Hiding:** Pilar POI hanya dimunculkan ketika jarak ≤ 3–5m dan dalam
   koridor yang sama (setelah A* pathfinding diimplementasikan).

---

## Navigasi Garis Lurus (Belum A* Pathfinding)

**Status:** PLANNED (`docs/ROADMAP-PATHFINDING.md`)  
**Dampak:** Panah menunjuk garis lurus ke POI (air distance), bisa menembus dinding
jika POI ada di koridor/ruangan berbeda.

**Rencana penanganan:**
1. Buat `public/data/navgraph.json` (node koridor + edges).
2. Implementasi A* pathfinding di `src/main.js`.
3. Panah mengarah ke node persimpangan berikutnya, bukan langsung ke POI.
4. Lihat `docs/ROADMAP-PATHFINDING.md` untuk spesifikasi lengkap.

---

## Kredensial Ter-Expose di Client Bundle

**Status:** RISIKO KEAMANAN TERTUNDA  
**Dampak:** `VITE_MS_CLIENT_ID` & `VITE_MS_CLIENT_SECRET` ter-inline di bundle JS.

**Rencana penanganan:**
- Produksi: proxy `authorize()` lewat backend FastAPI. Browser hanya terima token.
- Rotasi kredensial yang sudah ter-expose.

---

## iOS Tidak Didukung

**Status:** BATASAN PLATFORM (tidak ada rencana fix)  
**Penyebab:** Safari tidak mendukung `camera-access` untuk WebXR `immersive-ar`.
Terkonfirmasi di iPhone 2026-07-22.

---

## Gerbang Keputusan Tertunda

| Keputusan | Status | Tergantung Pada |
|---|---|---|
| Localize stabil (< 1m) | ⛔ Blocker | Re-scan map |
| Lingkup larangan Unity | Tanya dosen | — |
| Alur balik Chrome→Flutter | Setengah jadi | Lihat `docs/DEEPLINK-CONTRACT.md` |
| Mesin A* | Ditunda | navgraph.json + solve-frame |
| Proxy token backend | Ditunda | Di luar jalur pembuktian tesis |
| Pindah ke route `/ar` Next.js | Ditunda | WebXR final |
