# CLAUDE.md — DARSI WebXR

**Baca `README.md` dulu.** Itu acuan asli: API/angka diverifikasi dari type-def
`@multisetai/vps@2.3.1`, plus temuan lapangan (§3 lantai, §3.5 blocker). Jangan
asumsikan dari training data — SDK ini kecil & spesifik.

## Status repo

**Lab spike, BUKAN produk.** Kode inti nanti dipindah jadi route `/ar` di
`darsi-indoor-navigation-ui-webview` (Next.js) — jangan kembangkan repo ini jadi
app sendiri. Tujuan: buktikan WebXR+VPS bisa menggantikan runtime Unity (UaaL).

## Gerbang yang WAJIB dihormati

- **⛔ Blocker localize (README §3.5).** Map Jemursari lompat 5–60 m. Jangan bangun
  POI/navigasi map-anchored di atas localize yang belum stabil (< ~1 m) — itu
  membangun di atas pondasi salah. Kerja yang boleh jalan tanpa map stabil: README §9.
- **Lantai dibaca dari `position.Y`, BUKAN `mapCodes[0]`** (§3 — urutan mapCodes = artefak hint).
- **Kamera WebXR three.js:** pakai `camera.getWorldPosition()`/`getWorldDirection()`,
  bukan `camera.position` (basi di sesi XR).

## Aturan kerja

- **Commit sebagai pemilik (Bagus Insan Pradana), TANPA `Co-Authored-By`.** Ini
  keputusan sadar — jangan jadikan diri collaborator di repo ekosistem ini.
- **Jangan push tanpa "ya" eksplisit.** Pemilik yang push.
- **Kredensial:** client-side di spike ini sudah ter-expose → wajib rotasi + produksi
  proxy `authorize()` lewat backend FastAPI (README §5). Jangan tambah secret ke bundle.
- **Cari akar, bukan gejala.** Band-aid client (mis. filter outlier localize) sudah
  ditolak — map jelek tak bisa diselamatkan dari client (README §3.5).

## Stack

Vite · three ≥0.169 · `@multisetai/vps` v2.3.1 · WebXR immersive-ar (ARCore) ·
Vercel. Chrome Android wajib (`navigator.xr` tak ada di WebView; iOS tak didukung).
