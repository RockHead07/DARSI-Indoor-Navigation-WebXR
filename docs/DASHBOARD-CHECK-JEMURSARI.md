# Runbook: Cek dashboard Jemursari (dijalankan pemilik)

**Tujuan:** ambil bukti server *di mana* scan Jemursari lemah, supaya re-scan **bertarget**
(bukan buta seluruh gedung). Butuh login portal MultiSet → **kamu** yang jalankan; tempel
hasilnya ke chat, aku padukan dgn [`SCAN-PROTOCOL.md`](SCAN-PROTOCOL.md) jadi daftar area
re-scan.

## Map yang dicek

| Map code | Nama dashboard | Lantai |
|---|---|---|
| `MSET_PKRKGGFB1RO0` | MapSet Jemursari | (induk) |
| `MAP_BCADVLIXFSJE` | **Azzara2** | **lantai 1** |
| `MAP_MW1QTZWG1TLG` | **Azzara3** | **lantai 2** |

## Langkah

1. Login <https://console.multiset.ai> (atau dashboard yang kamu pakai).
2. Buka MapSet **Jemursari** (`MSET_PKRKGGFB1RO0`).
3. Buka **Analytics → Maps Query** (atau MapViewer):
   - Catat **success-rate per-map** (Azzara2/lt1 vs Azzara3/lt2). Patokan lama: 65% total,
     lt1/BCAD paling banyak "Not Found".
4. Buka **Localization Heatmap** tiap map:
   - **Azzara2 (lt1)** — tandai area **dingin / tanpa hit** (kandidat re-scan #1).
   - **Azzara3 (lt2)** — sama.
   - Screenshot heatmap kalau bisa.

## Yang ditempel balik ke chat

- Success-rate: lt1 = __% , lt2 = __% (total __%).
- Area dingin lt1 (deskripsi ruang/koridor): ________
- Area dingin lt2: ________
- (opsional) screenshot heatmap.

→ Aku ubah ini jadi **daftar area re-scan bertarget** + update `README.md §3.5` dgn data server terbaru.

## Catatan

- Heatmap **butuh traffic**: kalau tampak kosong, itu karena query sedikit, bukan berarti
  map sempurna. Jemursari sudah ~83 query (dari tes lapangan) → harusnya terisi.
- **A. Yani (`MSET_39LMY8E89OO6`) di-skip dulu** — akses langka; diterapkan setelah metode
  matang di Jemursari.
