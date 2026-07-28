# CLAUDE.md — DARSI WebXR

**Baca docs/ dulu:** arsitektur (`docs/ARCHITECTURE.md`), keputusan teknis
(`docs/DECISIONS.md`), temuan lapangan (`docs/FIELD-TESTS.md`), dan masalah
yang diketahui (`docs/KNOWN-ISSUES.md`). Jangan asumsikan dari training data —
SDK `@multisetai/vps` v2.3.1 ini kecil & spesifik.

## Status repo

**Lab spike, BUKAN produk.** Kode inti nanti dipindah jadi route `/ar` di
`darsi-indoor-navigation-ui-webview` (Next.js) — jangan kembangkan repo ini jadi
app sendiri. Tujuan: buktikan WebXR+VPS bisa menggantikan runtime Unity (UaaL).

## Gerbang yang WAJIB dihormati

- **⛔ Blocker localize** (`docs/KNOWN-ISSUES.md`). Map Jemursari lompat 5–60 m.
  Jangan bangun POI/navigasi map-anchored di atas localize yang belum stabil (< ~1 m).
- **Lantai dibaca dari `position.Y`, BUKAN `mapCodes[0]`** (`docs/DECISIONS.md` ADR-W001).
  Untuk `ThreeAdapter` (saat `showMesh: true`), urutkan `d.mapCodes` di
  `onLocalizationResult` berdasarkan `position.Y`.
- **Dilarang panggil `renderer.setPixelRatio()`** — merusak matriks intrinsics kamera.
- **Wajib sediakan `/draco/` decoders** di `public/draco/` saat `showMesh: true`.
- **Gunakan `showMesh: false` untuk produksi AR** (`docs/DECISIONS.md` ADR-W003).
- **Aset 3D Model wajib di `public/models/`** (`docs/ARCHITECTURE.md`).
- **Gunakan `referenceSpaceType: "local"`** pada `XRSessionManager`.
- **Kamera WebXR three.js:** pakai `camera.getWorldPosition()`/`getWorldDirection()`,
  bukan `camera.position` (basi di sesi XR).

## Aturan kerja

- **YAGNI. Jangan overengineering.**
- **Jika mulai tersesat, BACA LAGI** `node_modules/@multisetai/vps/README.md`.
- **Commit sebagai pemilik (Bagus Insan Pradana), TANPA `Co-Authored-By`.**
- **Jangan push tanpa "ya" eksplisit.** Pemilik yang push.
- **Kredensial** ter-expose → wajib rotasi + proxy backend (`docs/KNOWN-ISSUES.md`).
- **Cari akar, bukan gejala** (`docs/DECISIONS.md` — band-aid filter outlier ditolak).

## Stack

Vite · three ≥0.169 · `@multisetai/vps` v2.3.1 · WebXR immersive-ar (ARCore) ·
Vercel. Chrome Android wajib (`navigator.xr` tak ada di WebView; iOS tak didukung).

