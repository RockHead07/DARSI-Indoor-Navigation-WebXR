# Dokumentasi Setup CI/CD — DARSI WebXR

**Tanggal**: 2026-07-27  
**Status**: Aktif  
**Teknologi**: GitHub Actions (CI) + Vercel Deployment (CD)

---

## 🏆 Arsitektur CI/CD Terbaik

Proyek **DARSI WebXR** menggunakan alur CI/CD modern berstandar industri:

```
[ Developer Push / PR ]
         │
         ├──► 1. GitHub Actions (CI)
         │       ├── Check syntax & ES modules
         │       ├── Validasi JSON (`public/data/pois.json`)
         │       └── Test Production Build (`npm run build`)
         │
         └──► 2. Vercel Integration (CD)
                 ├── Push ke `main` → Deploy Otomatis ke Production (`darsi-webxr.vercel.app`)
                 └── Pull Request  → Deploy Preview Unique URL untuk testing HP
```

---

## 🛠️ 1. Continuous Integration (CI) — GitHub Actions

File workflow berada di: `.github/workflows/ci.yml`

### Tugas Workflow:
- Memicu otomatis setiap ada `push` atau `pull_request` ke branch `main`.
- Menggunakan Node.js 20 & `npm ci` untuk menguji ketergantungan paket secara bersih.
- Menjalankan skrip validasi JSON untuk memastikan `pois.json` tidak rusak (*corrupted*).
- Menjalankan `npm run build` untuk memastikan bundling Vite tidak memiliki error sintaks / impor yang pecah.

---

## 🚀 2. Continuous Deployment (CD) — Vercel

### Setup Vercel Auto-Deploy (Rekomendasi Utama):
1. Masuk ke [Vercel Dashboard](https://vercel.com).
2. Pilih project `darsi-webxr` -> **Settings** -> **Git**.
3. Hubungkan repository GitHub kamu.
4. **Environment Variables**: Pastikan variabel berikut terpasang di Vercel Settings -> Environment Variables:
   - `VITE_MS_CLIENT_ID`
   - `VITE_MS_CLIENT_SECRET`

### Hasil dari Integration ini:
- **Production URL**: Setiap `git push origin main` akan otomatis ter-deploy ke `https://darsi-webxr.vercel.app`.
- **Preview Deployment**: Setiap Pull Request baru akan mendapatkan URL pengetesan sementara (mis. `https://darsi-webxr-git-feature-xxx.vercel.app`), sehingga fitur bisa dicoba dulu di HP sebelum di-merge.
