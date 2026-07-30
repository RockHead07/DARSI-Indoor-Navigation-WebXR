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

Tanpa `?poiId=` → pilih tujuan dari dropdown di panel bawah.

### Query param

| Param | Efek |
|---|---|
| `?poiId=<id>` | Langsung navigasi ke POI itu (dipanggil dari WebView) |
| `?admin=true` (atau `debug=true`) | Overlay semua POI + graph koridor + tombol developer |
| `?mesh=true` | **Diagnostik.** Render mesh gedung VPS (sudah dikoreksi `relativePose`, ADR-W010) — satu-satunya cek akurasi yang kita punya. Produksi tidak memuat mesh sama sekali |
| `?horizon=<m>` | Panjang jejak chevron yang digambar (default 8 m) |
| `?pilar=<m>` | Jarak pilar tujuan mulai tampak (default 12 m) |
| `?mapset=true` | Diagnostik mandiri: baca `relativePose` tiap map. Jalan tanpa AR, bisa dibuka di laptop |

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
- [x] Navigasi world-anchored berfungsi (jarak + "sampai")
- [x] Chevron lantai jadi penunjuk arah **tunggal**; panah 3D HUD dihapus (ADR-W008)
- [x] Mesh kini dimuat di SEMUA mode (bukan hanya `?mesh=true`); untuk sementara tetap terlihat sampai material occluder depth-only dipasang (ADR-W010)
- [x] Mesin A* + navigasi POI map-anchored + chevron trail di lantai
- [x] Gerbang lintas-lantai — tak pernah menggambar rute palsu (ADR-W007)
- [x] Warm-up ARCore sebelum localize pertama (ADR-W005)
- [x] Protokol scan (`docs/SCAN-PROTOCOL.md`)
- [x] CI/CD (GitHub Actions + Vercel auto-deploy)
- [~] Alur balik Chrome→Flutter (setengah jadi)
- [ ] 🔬 **Uji 4:** kesejajaran mesh setelah warm-up ARCore (`?mesh=true`)
- [ ] ⛔ **Localize stabil < 1m di Lantai 1** (blocker — `docs/KNOWN-ISSUES.md`)
- [ ] navgraph Lantai 1 + node tangga/lift (buka rute lintas-lantai)
- [x] Mesh dikoreksi `relativePose` — Lt 2 tak lagi meleset 3.99 m + yaw 20.89° (ADR-W010)
- [x] Horizon visibilitas — jejak & pilar tak digambar di luar jangkauan wajar
- [ ] Occluder depth-only — menunggu bukti mesh sejajar di Lt 1 & Lt 2 (`?mesh=true`)
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

