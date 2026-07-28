# DARSI Indoor Navigation — WebXR

**Lab spike** untuk membuktikan WebXR+VPS bisa menggantikan runtime Unity (UaaL)
sebagai AR runtime navigasi indoor RS Islam A. Yani.

Kode inti nanti dipindah ke route `/ar` di `darsi-indoor-navigation-ui-webview` (Next.js).

---

## Quick Start

```bash
# 1. Clone & install
git clone <repo-url>
npm install

# 2. Setup kredensial
cp .env.example .env.local
# Isi VITE_MS_CLIENT_ID & VITE_MS_CLIENT_SECRET

# 3. Jalankan dev server
npm run dev
```

Buka di **Chrome Android** (WebXR `immersive-ar` wajib ARCore).
iOS tidak didukung (Safari tanpa `camera-access`).

---

## Navigasi ke POI

```
https://darsi-webxr.vercel.app/?poiId=POIKU_1
```

Tanpa `?poiId=` → mode developer (tombol SET TUJUAN, TUJUAN MAP, RELOCALIZE).

---

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arsitektur sistem, komponen, data flow, stack |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Keputusan teknis (ADR) khusus repo WebXR |
| [`docs/FIELD-TESTS.md`](docs/FIELD-TESTS.md) | Kronologis hasil uji lapangan |
| [`docs/KNOWN-ISSUES.md`](docs/KNOWN-ISSUES.md) | Blocker, limitasi, & rencana penanganan |
| [`docs/CICD-SETUP.md`](docs/CICD-SETUP.md) | Setup CI/CD (GitHub Actions + Vercel) |
| [`docs/DEEPLINK-CONTRACT.md`](docs/DEEPLINK-CONTRACT.md) | Kontrak deep link Chrome → Flutter |
| [`docs/SCAN-PROTOCOL.md`](docs/SCAN-PROTOCOL.md) | Protokol scan gedung (dari panduan MultiSet) |
| [`docs/ROADMAP-PATHFINDING.md`](docs/ROADMAP-PATHFINDING.md) | Roadmap A* indoor pathfinding |

---

## Status

- [x] WebXR+VPS jalan di perangkat (auth, localize, anchoring)
- [x] Diskriminasi lantai TERBUKTI (`position.Y` sebagai sinyal)
- [x] Navigasi world-anchored berfungsi (panah + jarak + "sampai")
- [x] Panah 3D kustom (`public/models/arrow.gltf`)
- [x] Kamera AR aktif jernih (`showMesh: false`)
- [x] Protokol scan (`docs/SCAN-PROTOCOL.md`)
- [x] CI/CD (GitHub Actions + Vercel auto-deploy)
- [~] Alur balik Chrome→Flutter (setengah jadi)
- [ ] ⛔ **Localize stabil < 1m** (blocker — lihat `docs/KNOWN-ISSUES.md`)
- [ ] A* Pathfinding (lihat `docs/ROADMAP-PATHFINDING.md`)
- [ ] Proxy token backend
- [ ] Pindah ke route `/ar` Next.js

---

## Deploy

Vercel project `darsi-webxr` (`prj_PgPqbwLJJ8oymW2xHnbtsLkELMSX`).
Env vars di Vercel: `VITE_MS_CLIENT_ID`, `VITE_MS_CLIENT_SECRET`.
Live: [`https://darsi-webxr.vercel.app`](https://darsi-webxr.vercel.app).

```bash
npx vercel --prod --yes
```

---

## Stack

Vite · three ≥0.169 · `@multisetai/vps` v2.3.1 · WebXR immersive-ar (ARCore) ·
Vercel. Chrome Android wajib.

