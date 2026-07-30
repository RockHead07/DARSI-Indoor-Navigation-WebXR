// Fungsi murni horizon visibilitas. Sengaja dipisah dari main.js: main.js menyentuh
// `document` saat diimpor sehingga tak bisa diimpor skrip Node, dan memisahkannya membuat
// tools/check-horizon.mjs menguji kode yang BENAR-BENAR dijalankan browser — bukan salinan.

// Potong polyline berdasarkan PANJANG LINTASAN terakumulasi, bukan jarak lurus. Disengaja:
// kalau jalur membelok di 6 m, user tetap melihat sampai tikungan dan sedikit setelahnya —
// justru itu yang memberi tahu "belok di sini". Titik potong diinterpolasi tepat di batas
// agar ujung jejak tidak berkedip saat user berjalan. Fungsi murni: tidak memutasi masukan.
// KONTRAK: titik yang diteruskan dikembalikan sebagai REFERENSI ke objek input; hanya titik
// interpolasi di ujung horizon yang objek baru. Pemanggil yang perlu memutasi hasilnya WAJIB
// menyalin dulu (pemanggil di main.js membungkusnya jadi THREE.Vector3 baru).
export function clipPathToHorizon(points, horizonM) {
  if (points.length < 2) return points.slice();
  const out = [points[0]];
  let sisa = horizonM;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (seg <= 0) continue;
    if (seg < sisa) { out.push(b); sisa -= seg; continue; }
    const t = sisa / seg;
    // t === 0 berarti batas jatuh persis di simpul sebelumnya → jangan tambah titik dobel.
    if (t > 0) {
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    }
    return out;
  }
  return out;
}
