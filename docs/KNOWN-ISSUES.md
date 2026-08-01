# Masalah & Limitasi yang Diketahui — DARSI WebXR

---

## ⛔ PRIORITAS 1: Koordinat POI Tersimpan SALAH

**Status:** BELUM DIPERBAIKI — butuh rekam ulang di lapangan  
**Dampak:** navigasi memandu dengan rapi ke **titik yang keliru**. Rangka rutenya benar,
ujungnya salah.

```
POIKU_1 direkam         : 2026-07-27  (commit 3ff264a)
Bug REKAM POI diperbaiki : 2026-07-29  (commit de4405e)
```

**Akar masalah:** POI direkam dua hari **sebelum** perbaikan, memakai `lastMapPos` — posisi
dari lokalisasi terakhir yang bisa **sampai 10 detik basi**. Direkam sambil berjalan,
koordinatnya meleset beberapa meter. Perbaikan tidak mengoreksi data yang sudah terlanjur
direkam.

**Ini bukan masalah render maupun lokalisasi.** Penempatan POI tetap
`poiMapPos.applyMatrix4(worldFromMap)`, tak berubah. Datanya yang salah.

**Cara memperbaiki:**
1. Buka `?admin=true&mesh=true`, MULAI AR, tunggu localize.
2. Pilih POI yang mau diperbaiki di dropdown (`id`/`name` terisi otomatis).
3. Berdiri **tepat** di lokasi aslinya → **REKAM POI 📍**.
4. Baca `selisih dari koordinat tersimpan` — itu besar kesalahan data lama.
5. Tempel entri penggantinya ke `public/data/pois.json`, commit, deploy.

HUD juga menampilkan `POI terdekat: <nama> — <jarak> m` terus-menerus; berdiri di lokasi
asli dan membacanya memberi angka yang sama tanpa merekam.

---

## ⛔ BLOCKER: Localize Map Jemursari Tidak Stabil (Lantai 1 & lintas-lantai)

**Status:** BELUM TERSELESAIKAN — **ruang lingkup dipersempit 2026-07-29**  
**Dampak:** Memblokir navigasi POI map-anchored (titik lompat 5–60 m).  
**Akar masalah:** Kualitas scan map, bukan WebXR. Koridor RS berulang & mirip
antar-lantai → VPS false-match.

**Ruang lingkup terkini (berdasarkan Uji 2 & 3):**
- **Lantai 2 — cukup stabil.** Saat ter-localize benar (`pos.y≈3.8`), `geser` 0.1–0.4 m,
  `conf` 0.73–0.75. Navigasi map-anchored di Lantai 2 sah dikerjakan di atas ini.
- **Lantai 1 & lintas-lantai — masih blocker.** Dashboard MultiSet: Lantai 1
  (Azzara2/BCAD) area paling lemah, success rate keseluruhan 65%.
- ⚠️ **Stabil ≠ akurat** — tapi **akurasi sebenarnya belum pernah terukur.** `geser` kecil
  hanya membuktikan *repeatability*. Uji 2 menyimpulkan "repeatable ≠ accurate" dari mesh
  yang tampak melayang, **namun Uji 5 membuktikan mesh-nya sendiri yang salah dirender**
  (SDK tak menerapkan `relativePose`: Lt 2 meleset 3.99 m + yaw 20.89°). Jadi kesimpulan itu
  diambil dengan penggaris bengkok. Mesh baru sah jadi alat ukur **setelah** koreksi
  `relativePose` dipasang.

**Konsekuensi untuk gerbang CLAUDE.md** ("jangan bangun navigasi map-anchored di atas
localize belum stabil"): gerbang tetap berlaku untuk Lantai 1 / lintas-lantai; pekerjaan
map-anchored di Lantai 2 sah dilanjutkan.

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

**Status:** ⏳ SEBAGIAN — penyebabnya sudah diperbaiki, occluder-nya belum dipasang.

Koreksi `relativePose` sudah mendarat (ADR-W010): mesh Lantai 2 tak lagi meleset 3.99 m +
yaw 20.89°. **Material depth-only occluder MENUNGGU gerbang lapangan** — mesh harus terbukti
sejajar koridor di Lantai 1 dan Lantai 2 lewat `?mesh=true` sebelum dipasang.

Mesh hanya dimuat saat `?mesh=true` **atau** `?admin=true`; URL produksi polos tidak
mengunduhnya sama sekali. Di Mode Admin tersedia slider **🧱 Tampilkan Mesh Gedung** untuk
menyalakan/mematikannya seketika — slider mengatur tampil/sembunyi saja, karena
`ThreeAdapter` membaca `showMesh` sekali di constructor sehingga ketersediaan mesh tak bisa
diubah di tengah sesi.

`showMesh` sempat dibuat aktif tanpa syarat untuk menyiapkan occluder lalu dikembalikan:
selama materialnya belum ada, produksi cuma menanggung ongkosnya (mesh ungu menutupi kamera +
unduhan mesh & Draco) tanpa satu pun manfaatnya. Task occluder nanti mengaktifkannya
**bersamaan** dengan memasang material — satu paket, tak boleh dipisah lagi.

**Dampak:** Pilar penanda POI dan chevron lantai terlihat di balik tembok fisik (tidak
ter-occlude oleh geometri dunia nyata).

**Penyebab:** Kamera HP biasa tidak memiliki sensor depth/LiDAR. GPU WebGL
merender objek AR selalu di atas feed kamera.

**Kenapa dicabut (riwayat, ADR-W006, 2026-07-29):** occluder saat itu dibangun di atas mesh
yang terbukti miring, jadi mengklip panah di tempat yang salah — dan karena `colorWrite:false`,
penyebabnya tak terlihat. Ditambah dua cacat implementasi: occluder tak terpasang di
lokalisasi pertama (material dipasang sebelum mesh ada di scene), dan scope menjaring seluruh
scene, bukan cuma `meshGroup`. Akar masalah "mesh miring" itu sendiri **sudah diperbaiki** oleh
koreksi `relativePose` (ADR-W010, 2026-07-30) — tapi dua cacat implementasi di atas tetap
dicatat di sini karena occluder berikutnya wajib menghindarinya.

**Prasyarat menghidupkan kembali:** mesh terbukti sejajar dengan koridor nyata di lapangan
(Lantai 1 **dan** Lantai 2, lewat `?mesh=true` — lihat ADR-W010). Setelah itu wajib ikut:
pemasangan material **setelah** mesh masuk scene (bukan di `onLocalizationSuccess`), dan scope
dibatasi ke `meshGroup` SDK saja.

---

## Chevron Lantai Bisa di Luar Frame Kamera

**Status:** RISIKO BELUM TERUJI (ADR-W008)  
**Dampak:** Penunjuk arah kini hanya chevron di lantai. Kalau HP dipegang setinggi dada
menghadap lurus ke depan, lantai bisa berada di luar frame → pengguna tak melihat panduan.

**Penanganan kalau terbukti di lapangan:** naikkan chevron terdekat (mis. beberapa chevron
pertama diangkat bertahap ke garis pandang), **BUKAN** mengembalikan penunjuk yang terkunci
ke kamera — itu mengulang redundansi yang baru saja dihapus.

**Cara menguji:** Uji 4 di Jemursari, jalan normal sambil memegang HP seperti biasa (jangan
sengaja menunduk). Catat apakah chevron terlihat tanpa harus mengarahkan kamera ke bawah.

---

## Rute Lintas-Lantai Belum Ada

**Status:** DIGERBANGI (ADR-W007) — tidak menyesatkan, tapi juga belum memandu  
**Dampak:** POI di lantai berbeda dari user tidak dinavigasikan. Panah & chevron
disembunyikan, muncul pesan "Naik/Turun ke Lantai N dulu". Navigasi hidup otomatis
begitu user tiba di lantai yang benar.

**Penyebab:** `navgraph.json` hanya berisi 3 node di Lantai 2 — tidak ada node Lantai 1,
tidak ada edge tangga/lift.

**Rencana penanganan (butuh sesi rekam di Jemursari):**
1. Rekam node koridor Lantai 1 + minimal 1 node tangga/lift per lantai.
2. Tambah edge antar-lantai di `navgraph.json`.
3. Segmentasi navigasi sesuai ADR-020 (lift memutus tracking → relokalisasi setelah keluar).

---

## Navigasi Garis Lurus (A* sudah ada, navgraph masih minimal)

**Status:** SEBAGIAN — mesin A* jalan (`solveAStar`), **datanya yang kurang**  
**Dampak:** jejak chevron terlihat "cuma menuju POI", bukan mengikuti koridor.

**Bukan bug A\*.** Terbukti di Uji 4: `navgraph.json` hanya 3 node yang **hampir segaris**
(x bergeser 0.44 m sepanjang z 5.3 m), jadi rute optimalnya memang lurus. Dan graf mencakup
5 m gedung sementara user menavigasi 34 m — jejak didominasi satu segmen lurus dari posisi
user ke node pertama.

**Alat sudah siap (ADR-W009).** Di Mode Admin: **REKAM NODE ⛓️** (auto-edge ke node
sebelumnya, snap 1.5 m untuk menutup persimpangan), **PUTUS RANTAI ✂️** (mulai cabang baru),
**EXPORT NAVGRAPH 💾** (salin seluruh JSON ke clipboard).

**Yang tersisa:** satu sesi lapangan menyusuri koridor Jemursari sambil menekan tombol di
tiap tikungan. **Ini prasyarat terbesar yang tersisa** — lihat `docs/ROADMAP-PATHFINDING.md`.

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
| Koordinat POI benar | ⛔ Prioritas 1 | Rekam ulang di lapangan (lihat atas) |
| Jejak membelok di tikungan | 🔬 Belum diuji | Rekam navgraph di koridor bertikungan |
| UI dua-lapis User/Admin | ⏸ Ditunda | Data & tikungan beres dulu; dikerjakan di repo WebView (ADR-W011) |
| Localize stabil (< 1m) Lt 1 | ⛔ Blocker | Re-scan map |
| Kesejajaran mesh (akurasi) | ⏳ Diperbaiki, verifikasi lapangan tersisa | Penyebab ditemukan & diperbaiki (Uji 5 + koreksi `relativePose`, ADR-W010) → tersisa konfirmasi lapangan di Lt 1 & Lt 2 |
| Occlusion | ⏸ Ditunda | Gerbang lapangan Lt 1 & Lt 2 (ADR-W010) |
| Rute lintas-lantai | ⏸ Digerbangi | Rekam node Lt 1 + tangga/lift (ADR-W007) |
| Lingkup larangan Unity | Tanya dosen | — |
| Alur balik Chrome→Flutter | Setengah jadi | Lihat `docs/DEEPLINK-CONTRACT.md` |
| Proxy token backend | Ditunda | Di luar jalur pembuktian tesis |
| Pindah ke route `/ar` Next.js | Ditunda | WebXR final |
