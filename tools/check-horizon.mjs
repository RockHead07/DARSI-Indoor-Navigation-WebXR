// Cek clipPathToHorizon. Repo ini tak punya framework test (lihat Global Constraints),
// jadi ini skrip Node polos: `node tools/check-horizon.mjs`.
// Mengimpor modul yang SAMA dengan yang dipakai browser — bukan salinan.
import assert from "node:assert/strict";
import { clipPathToHorizon } from "../src/horizon.js";

const P = (x, z) => ({ x, y: 0, z });
const len = (pts) => pts.slice(1).reduce((s, p, i) =>
  s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y, p.z - pts[i].z), 0);

// 1. Jalur lebih pendek dari horizon → dikembalikan utuh.
const pendek = [P(0, 0), P(0, 3)];
assert.deepEqual(clipPathToHorizon(pendek, 8), pendek, "jalur pendek harus utuh");

// 2. Potongan di tengah segmen → titik akhir diinterpolasi.
const potong = clipPathToHorizon([P(0, 0), P(0, 10)], 4);
assert.equal(potong.length, 2);
assert.ok(Math.abs(potong[1].z - 4) < 1e-9, `z harus 4, dapat ${potong[1].z}`);

// 3. Batas jatuh PERSIS di simpul → tanpa titik duplikat.
const tepat = clipPathToHorizon([P(0, 0), P(0, 5), P(0, 9)], 5);
assert.equal(tepat.length, 2, "batas di simpul tak boleh menghasilkan titik dobel");
assert.ok(Math.abs(len(tepat) - 5) < 1e-9);

// 4. Panjang lintasan, BUKAN jarak lurus — jalur menikung balik.
const tikung = clipPathToHorizon([P(0, 0), P(0, 3), P(3, 3)], 5);
assert.ok(Math.abs(len(tikung) - 5) < 1e-9, `panjang lintasan harus 5, dapat ${len(tikung)}`);

// 5. Masukan degenerate → tidak melempar error.
assert.deepEqual(clipPathToHorizon([], 8), []);
assert.deepEqual(clipPathToHorizon([P(1, 2)], 8), [P(1, 2)]);
assert.deepEqual(clipPathToHorizon([P(0, 0), P(0, 5)], 0), [P(0, 0)], "horizon 0 → hanya titik awal");

// 5b. Segmen panjang-nol (dua titik identik berurutan) tidak boleh membuat NaN.
const kembar = clipPathToHorizon([P(0, 0), P(0, 0), P(0, 10)], 4);
assert.equal(kembar.length, 2, "titik kembar harus dilewati, bukan jadi titik ekstra");
assert.ok(Number.isFinite(kembar[1].z), `z harus berhingga, dapat ${kembar[1].z}`);

// 6. Tidak memutasi masukan.
const asli = [P(0, 0), P(0, 10)];
const salinan = JSON.parse(JSON.stringify(asli));
clipPathToHorizon(asli, 4);
assert.deepEqual(asli, salinan, "input tidak boleh dimutasi");

console.log("OK — clipPathToHorizon lolos 7 kelompok cek.");
