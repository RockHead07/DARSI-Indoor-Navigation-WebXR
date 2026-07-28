# Docs Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrukturisasi dokumentasi repo DARSI-Indoor-Navigation-WebXR dari README monolitik 16KB menjadi folder `docs/` terorganisir dengan file-file terfokus, mengikuti best practice Arc42/ADR/Diátaxis.

**Architecture:** README.md dipangkas menjadi ringkasan ~2-3KB yang mengarahkan ke file docs terfokus. Konten detail dipecah ke `ARCHITECTURE.md` (Arc42-style), `DECISIONS.md` (ADR standard), `FIELD-TESTS.md` (kronologis temuan lapangan), dan `KNOWN-ISSUES.md` (blocker & limitasi). CLAUDE.md tetap di root (konvensi AI assistant) tapi dirampingkan dan mereferensi docs.

**Tech Stack:** Markdown only — tidak ada perubahan kode.

## Global Constraints

- Bahasa dokumen: **Bahasa Indonesia** (konsisten dengan semua docs yang sudah ada).
- CLAUDE.md **tetap di root** (konvensi AI assistant, dibaca otomatis).
- README.md **tetap di root** (konvensi GitHub).
- Konten yang sudah ada di docs/ (`CICD-SETUP.md`, `DEEPLINK-CONTRACT.md`, `SCAN-PROTOCOL.md`, `ROADMAP-PATHFINDING.md`) **tidak diubah**.
- Tidak ada konten yang hilang: setiap bagian README lama harus bisa ditemukan di dokumen baru.
- Commit sebagai pemilik (Bagus Insan Pradana), TANPA `Co-Authored-By`.

---

### Task 1: Buat `docs/ARCHITECTURE.md`

**Files:**
- Create: `docs/ARCHITECTURE.md`
- Source (read-only): `README.md` §1, §2, §4, §5, §6

**Produces:** File arsitektur lengkap: alur sistem, komponen, data flow, stack, konfigurasi SDK, dan struktur folder.

- [ ] **Step 1: Buat file `docs/ARCHITECTURE.md`** — Tulis konten arsitektur yang mencakup: Kenapa Repo Ini Ada, Dua Alur (Authoring vs Runtime), Tech Stack, Paket & Import, Struktur Folder, Komponen Utama (`src/main.js` — Auth, Session, Localize, Navigasi, POI, Deep Link), Menempatkan POI via `worldFromMap`, dan Opsi Localize (`IXRSessionOptions`). Sumber konten: README §1, §2, §4, §5, §6 + kondisi terkini repo.

- [ ] **Step 2: Verifikasi** — Buka `docs/ARCHITECTURE.md`, pastikan semua section lengkap tanpa placeholder.

- [ ] **Step 3: Commit** — `git add docs/ARCHITECTURE.md && git commit -m "docs: tambah ARCHITECTURE.md (Arc42-style arsitektur sistem WebXR)"`

---

### Task 2: Buat `docs/DECISIONS.md`

**Files:**
- Create: `docs/DECISIONS.md`
- Source (read-only): `README.md` §3, §7, implementasi terkini

**Produces:** File ADR (Architecture Decision Records) khusus repo WebXR.

ADR yang harus dicatat:
- **ADR-W001** — Sinyal lantai = `position.Y`, bukan `mapCodes[0]` (2026-07-22). Konteks: asumsi awal keliru. Bukti lapangan: ΔY=4.2m. Threshold: Y≥1.5→lt2.
- **ADR-W002** — Koordinat POI direkam dari VPS langsung, bukan Unity (2026-07-27). Alasan: hindari konversi handedness left→right.
- **ADR-W003** — `showMesh: false` untuk produksi AR (2026-07-28). Alasan: mesh diagnostik offset, kamera nyata lebih bersih, GPU lebih ringan.
- **ADR-W004** — Model 3D panah kustom via GLTFLoader + fallback ArrowHelper (2026-07-28).
- **ADR dari repo Unity yang tetap berlaku** — ADR-020, ADR-007/011, ADR-019, ADR-021.

Setiap ADR wajib punya: Konteks, Keputusan, Alasan, Konsekuensi.

- [ ] **Step 1: Buat file `docs/DECISIONS.md`** — Tulis semua ADR di atas.
- [ ] **Step 2: Verifikasi** — Pastikan setiap ADR punya 4 section (Konteks/Keputusan/Alasan/Konsekuensi).
- [ ] **Step 3: Commit** — `git add docs/DECISIONS.md && git commit -m "docs: tambah DECISIONS.md (ADR khusus repo WebXR)"`

---

### Task 3: Buat `docs/FIELD-TESTS.md`

**Files:**
- Create: `docs/FIELD-TESTS.md`
- Source (read-only): `README.md` §3 (hasil lapangan), §3.5 (blocker data)

**Produces:** File kronologis hasil uji lapangan.

Uji yang harus dicatat:
- **Uji 1 (2026-07-22)** — TECNO KL7, RS Jemursari. Hasil positif (auth, localize, anchoring, lantai). Blocker ditemukan (geser 5–60m). Data confidence & mapCodes.
- **Uji 2 (2026-07-23)** — Mesh diagnostik lantai 2. Temuan: REPEATABLE ≠ ACCURATE.
- **Uji 3 (2026-07-28)** — Panah 3D + showMesh:false. Lantai 2 terkonfirmasi. POI direkam.

Setiap uji wajib punya: Tanggal, Perangkat, Tujuan, Setup, Hasil (tabel), Temuan.

- [ ] **Step 1: Buat file `docs/FIELD-TESTS.md`** — Tulis kronologis ketiga uji.
- [ ] **Step 2: Verifikasi** — Pastikan setiap uji punya tanggal dan data terukur.
- [ ] **Step 3: Commit** — `git add docs/FIELD-TESTS.md && git commit -m "docs: tambah FIELD-TESTS.md (kronologis hasil uji lapangan)"`

---

### Task 4: Buat `docs/KNOWN-ISSUES.md`

**Files:**
- Create: `docs/KNOWN-ISSUES.md`
- Source (read-only): `README.md` §3.5, §8, §9

**Produces:** File masalah & limitasi yang diketahui.

Issues yang harus dicatat:
- **⛔ BLOCKER: Localize tidak stabil** — Status, dampak, akar masalah (kualitas scan), rencana (heatmap → re-scan → uji ulang), band-aid yang ditolak.
- **Occlusion** — Objek AR terlihat menembus tembok. Opsi: depth masking atau proximity hiding.
- **Navigasi garis lurus** — Belum A*, panah menembus dinding. Link ke ROADMAP-PATHFINDING.md.
- **Kredensial ter-expose** — Risiko keamanan, rencana proxy backend.
- **iOS tidak didukung** — Batasan platform, tidak ada rencana fix.
- **Gerbang keputusan tertunda** — Tabel: localize stabil, tanya dosen, Chrome→Flutter, A*, proxy, migrasi Next.js.

Setiap issue wajib punya: Status, Dampak, Rencana Penanganan.

- [ ] **Step 1: Buat file `docs/KNOWN-ISSUES.md`** — Tulis semua issues di atas.
- [ ] **Step 2: Verifikasi** — Pastikan setiap issue punya Status/Dampak/Rencana.
- [ ] **Step 3: Commit** — `git add docs/KNOWN-ISSUES.md && git commit -m "docs: tambah KNOWN-ISSUES.md (blocker, limitasi, rencana penanganan)"`

---

### Task 5: Pangkas `README.md` menjadi ringkasan + link ke docs/

**Files:**
- Modify: `README.md` (ganti seluruh isi, dari 325 baris → ~80 baris)

**Consumes:** `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/FIELD-TESTS.md`, `docs/KNOWN-ISSUES.md`

README baru harus berisi:
1. **Header**: 2 kalimat — apa ini & status (lab spike).
2. **Quick Start**: clone, install, setup env, run dev.
3. **Navigasi ke POI**: contoh URL `?poiId=...` + penjelasan mode developer.
4. **Tabel Dokumentasi**: link ke semua 8 file di docs/.
5. **Status Checklist**: checklist ringkas (item penting saja, max 12 baris).
6. **Deploy**: info Vercel + command deploy.
7. **Stack**: satu baris teknologi.

- [ ] **Step 1: Ganti isi `README.md`** — Overwrite dengan konten ringkas sesuai struktur di atas.
- [ ] **Step 2: Verifikasi link** — Pastikan semua link tabel mengarah ke file yang ada.
- [ ] **Step 3: Commit** — `git add README.md && git commit -m "docs: pangkas README.md menjadi ringkasan + link ke docs/"`

---

### Task 6: Update `CLAUDE.md` agar mereferensi docs baru

**Files:**
- Modify: `CLAUDE.md` (update referensi dari `README.md §...` ke `docs/...`)

**Consumes:** Semua file docs baru.

Perubahan:
- Ganti `README.md` dulu → `Baca docs/ dulu` + list file.
- Ganti referensi `README §3.5` → `docs/KNOWN-ISSUES.md`.
- Ganti referensi `README §3` → `docs/DECISIONS.md ADR-W001`.
- Ganti referensi `README §9` → hapus (sudah terintegrasi di KNOWN-ISSUES).
- Ganti referensi `README §5` → `docs/KNOWN-ISSUES.md`.

- [ ] **Step 1: Update isi `CLAUDE.md`** — Ganti referensi README lama dengan referensi docs baru.
- [ ] **Step 2: Verifikasi** — Pastikan semua referensi `docs/...` valid.
- [ ] **Step 3: Commit** — `git add CLAUDE.md && git commit -m "docs: update CLAUDE.md referensi ke docs/ baru"`

---

### Task 7: Verifikasi build & integritas keseluruhan

**Files:**
- Read-only: semua file yang diubah di Task 1–6

- [ ] **Step 1: Jalankan `npm run build`** — Expected: exit code 0 (perubahan docs-only).

- [ ] **Step 2: Verifikasi link antar-dokumen** — Buka setiap file docs dan pastikan semua referensi mengarah ke file yang ada.

- [ ] **Step 3: Cek konten tidak hilang** — Bandingkan section README lama vs file baru:

| README Lama | File Baru |
|---|---|
| §0 Kenapa repo ini ada | `docs/ARCHITECTURE.md` → "Kenapa Repo Ini Ada" |
| §1 Dua alur | `docs/ARCHITECTURE.md` → "Dua Alur" |
| §2 Paket & platform | `docs/ARCHITECTURE.md` → "Tech Stack" + "Paket & Import" |
| §3 Temuan lantai | `docs/FIELD-TESTS.md` → "Uji 1" + `docs/DECISIONS.md` → ADR-W001 |
| §3.5 Blocker | `docs/KNOWN-ISSUES.md` → "BLOCKER" + `docs/FIELD-TESTS.md` |
| §4 Menempatkan POI | `docs/ARCHITECTURE.md` → "Menempatkan POI" |
| §5 Opsi localize | `docs/ARCHITECTURE.md` → "Opsi Localize" |
| §6 Tech stack | `docs/ARCHITECTURE.md` → "Tech Stack" |
| §7 ADR berlaku | `docs/DECISIONS.md` → "ADR dari repo Unity" |
| §8 Gerbang keputusan | `docs/KNOWN-ISSUES.md` → "Gerbang Keputusan" |
| §9 Pekerjaan remote | `docs/KNOWN-ISSUES.md` (terintegrasi di rencana) |
| Status checklist | README baru → "Status" |
| Deploy | README baru → "Deploy" |

- [ ] **Step 4: Final commit (jika ada perbaikan)** — `git add -A && git commit -m "docs: fix referensi antar-dokumen"`
