# Protokol Scan / Mapping — DARSI (MultiSet VPS)

**Tujuan:** menghasilkan map MultiSet yang **localize-nya stabil < ~1 m**, sehingga POI &
navigasi map-anchored bisa dibangun (blocker `README.md §3.5`). Disarikan dari panduan
resmi MultiSet + disesuaikan kasus **koridor RS yang berulang/simetris** (sumber lompatan
anchor 5–60 m di scan Jemursari lama, 65% success).

> **Cara pakai:** Jemursari = tanah latihan (iterasi berulang di lab VR). A. Yani =
> penerapan sekali-pakai metode yang sudah terbukti di sini (akses langka). Jangan
> trial-error di A. Yani — datang dengan protokol yang sudah matang.

Setiap angka di bawah punya sumber; lihat **[Sumber](#sumber)** di akhir.

---

## 0. Prinsip (kenapa scan lama gagal)

Koridor RS **mirip antar-lantai & berulang** → VPS mengunci ke lokasi mirip-tapi-salah.
Confidence tinggi (0.82) pun bisa meleset 25 m — jadi **confidence bukan penjamin**.
Obatnya bukan tambalan di client (ADR-021: obati penyebab), melainkan **scan yang memberi
VPS cukup keunikan visual** untuk membedakan lokasi yang mirip. Tiga senjata utama:
**viewpoint diversity** (bolak-balik 2 arah), **feature richness** (signage/tekstur), dan
**cakupan rapat** (jangan ada zona tipis).

---

## 1. Alat

- **iPhone/iPad ber-LiDAR** via app **MultiSet Mapper (iOS)** — jalur utama.
- Alternatif: impor pro-scan sebagai **E57** (Matterport, Leica, NavVis, Faro, XGrids),
  atau GLB/PLY (Polycam, Scaniverse), Gaussian splat, foto/360°.
- LiDAR lebih tahan koridor polos daripada photogrammetry murni → **utamakan LiDAR untuk RS.**

---

## 2. Aturan gerak (paling sering dilanggar)

| Aturan | Nilai | Kenapa |
|---|---|---|
| Kecepatan | **lambat, kontinu, konsisten** | gerak jerky/berhenti-mulai → fragmentasi & tracking loss |
| Jarak ke permukaan | **1–5 m** | terlalu dekat = sempit; terlalu jauh = detail hilang |
| Sudut | **multi-sudut & multi-jarak** | jangan ulang viewpoint identik — tak menambah info |
| Koridor | **rekam BOLAK-BALIK 2 arah** | senjata utama anti-simetri RS: menambah keragaman viewpoint |

> **Koridor 2 arah = wajib, bukan opsional, untuk RS.** Ini yang paling menyembuhkan
> lompatan anchor antar-lantai.

---

## 3. Cakupan & join antar-lantai

- **Ukuran per sesi MultiSet Mapper:** ≈ **465 m² (~5.000 sq ft)**. Satu map optimal
  hingga ~2.500 m². E57 pro-scan jauh lebih besar.
- **Gedung berlantai / luas → pecah jadi zona per-lantai**, gabung sebagai **MapSet**
  (persis struktur `MSET_…` sekarang: 1 map per lantai).
- **Overlap antar-map (untuk join):** **15–20%** fitur visual bersama yang terlihat di
  kedua map. (Overlap tak mutlak — bisa align manual di portal — tapi jauh lebih andal.)
- **Jangan tinggalkan zona tipis.** Area yang jarang ter-scan = "Not Found" di lapangan
  (lihat heatmap dashboard).

---

## 4. Feature richness & lingkungan

**Incar:**
- Dinding bertekstur: cat bermotif, **signage, papan nama ruang, artwork, poster**.
- Sudut ruangan, kusen pintu, perabot tetap — geometri unik.

**Hindari / waspadai:**
- **Kaca, cermin, dinding polos, lantai mengkilap** → sedikit fitur / pantulan menyesatkan.
- Objek bergerak besar. (Orang lalu-lalang **OK** — NN tahan terhadap orang & perubahan
  minor; masalahnya perubahan **struktural**.)

**Pencahayaan:** NN tahan variasi cahaya wajar. Yang mematikan = **perubahan drastis**
(renovasi, dinding dibongkar) → jadwalkan **refresh map** bila gedung berubah.

---

## 5. Verifikasi pasca-scan (tanpa harus ke lokasi lagi)

Di **dashboard MultiSet → Analytics / MapViewer**:
1. **Localization Success Heatmap** (ada sejak v1.11.1) — tunjukkan area yang paling sering
   berhasil ter-localize. **Catatan penting: butuh traffic** — heatmap terisi dari query
   nyata, **bukan skor statis pra-rilis**. Untuk map baru, jalankan dulu beberapa query
   localize keliling gedung supaya heatmap bermakna.
2. **Success-rate per-map** — target jauh di atas **65%** (angka scan Jemursari lama).
3. **Baca area dingin** → itu daftar **re-scan bertarget** (bukan re-scan buta seluruh gedung).

---

## 6. Checklist siap-turun (bawa saat scan)

- [ ] iPhone/iPad LiDAR + MultiSet Mapper siap, ruang penyimpanan cukup.
- [ ] Rencana rute per-lantai; tiap lantai = 1 map dalam MapSet.
- [ ] Zona > 465 m²? → pecah, siapkan 15–20% overlap antar-zona.
- [ ] Gerak lambat-konsisten; jarak 1–5 m; tak berhenti-mulai.
- [ ] **Tiap koridor dilewati BOLAK-BALIK 2 arah.**
- [ ] Sapu multi-sudut & multi-jarak; sorot signage/papan nama/tekstur.
- [ ] Hindari framing penuh kaca/cermin/dinding polos.
- [ ] Antar-lantai (tangga): scan area transisi di kedua ujung untuk kontinuitas.
- [ ] Pasca-scan: upload → jalankan query localize keliling → cek heatmap & success-rate.
- [ ] Success-rate belum memadai? → catat area dingin → re-scan bertarget → ulangi.

---

## Sumber

- Docs utama: <https://docs.multiset.ai/>
- Alat & equipment mapping: <https://docs.multiset.ai/basics/editor/mapping-equipment>
- FAQ (ukuran, lingkungan, refresh): <https://docs.multiset.ai/quick-access/faq>
- Ringkasan LLM (agregat panduan): <https://multiset.gitbook.io/multiset/llms-full.txt>
- Halaman mapping: <https://www.multiset.ai/mapping>
- Rilis Heatmap v1.11.1: <https://www.multiset.ai/post/multiset-v1-11-1-meta-ray-ban-vps-localization-heatmaps-and-smarter-mapset-management-multiset-ai>

> Angka (1–5 m, 15–20%, ~465 m²) berasal dari sumber di atas per riset 2026-07-24.
> **Verifikasi ulang di dashboard/dok versimu sebelum dijadikan KPI keras** — MultiSet
> memperbarui dok & fitur; granularitas metrik success-rate bisa beda per versi.
