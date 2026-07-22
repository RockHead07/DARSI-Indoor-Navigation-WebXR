#!/usr/bin/env node
// verify-mapcodes.mjs — uji asumsi §3 README: apakah `mapCodes` dari VPS berbeda
// antar-lantai saat query sebuah MapSet? Kalau ya, lantai bisa diturunkan langsung
// dari hasil localize (menggantikan clustering Y FloorVisibilityManager di Unity).
//
// Kontrak endpoint di-verifikasi dari kode terkirim @multisetai/vps@2.3.1:
//   AUTH : POST https://api.multiset.ai/v1/m2m/token
//          header Authorization: Basic base64(clientId:clientSecret), body "{}"
//          → { token }  (atau access_token)
//   QUERY: POST https://api.multiset.ai/v1/vps/map/query-form   (multipart/form-data)
//          Authorization: Bearer <token>
//          field: mapSetCode, isRightHanded, fx, fy, px, py, width, height, queryImage
//          → { poseFound, position, rotation, confidence, mapIds, mapCodes[], responseTime }
//
// Zero dependency. Butuh Node 18+ (fetch/FormData/Blob bawaan).
//
// PAKAI:
//   MULTISET_CLIENT_ID=xxx MULTISET_CLIENT_SECRET=yyy \
//   node verify-mapcodes.mjs MSET_39LMY8E89OO6 foto-lantai-bawah.jpg foto-lantai-atas.jpg
//
// Intrinsics kamera tidak ada di foto biasa, jadi DIPERKIRAKAN (fx≈0.72·width).
// Kalau poseFound=false, itu kemungkinan besar intrinsics/kualitas foto — lihat CATATAN
// di bawah, bukan berarti VPS-nya gagal.

import { readFileSync } from "node:fs";

const AUTH_URL  = "https://api.multiset.ai/v1/m2m/token";
const QUERY_URL = "https://api.multiset.ai/v1/vps/map/query-form";

const [mapSetCode, ...images] = process.argv.slice(2);
const { MULTISET_CLIENT_ID: ID, MULTISET_CLIENT_SECRET: SECRET } = process.env;
// faktor fokal bisa di-tune bila poseFound gagal (env FOCAL_FACTOR, default 0.72 ≈ HP ~26mm)
const FOCAL = Number(process.env.FOCAL_FACTOR ?? 0.72);

if (!ID || !SECRET) fail("Set MULTISET_CLIENT_ID dan MULTISET_CLIENT_SECRET di env.");
if (!mapSetCode?.startsWith("MSET_")) fail("Argumen 1 harus kode mapset (MSET_...).");
if (images.length < 2) fail("Beri minimal 2 foto: satu per lantai. (arg 2, arg 3, ...)");

function fail(m) { console.error("✗ " + m); process.exit(1); }

// --- baca dimensi JPEG/PNG tanpa dependency ---
function imageSize(buf) {
  // PNG: IHDR
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: cari marker SOF0–SOF15 (0xC0..0xCF kecuali C4,C8,CC)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const m = buf[o + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { height: buf.readUInt16BE(o + 5), width: buf.readUInt16BE(o + 7) };
      }
      o += 2 + buf.readUInt16BE(o + 2);
    }
  }
  fail("Format gambar tak dikenal (pakai JPEG atau PNG).");
}

// --- 1. authorize ---
const basic = Buffer.from(`${ID}:${SECRET}`).toString("base64");
const authRes = await fetch(AUTH_URL, {
  method: "POST",
  headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
  body: "{}",
});
if (!authRes.ok) fail(`Auth gagal: HTTP ${authRes.status} ${await authRes.text()}`);
const authJson = await authRes.json();
const token = authJson.token ?? authJson.access_token;
if (!token) fail("Auth sukses tapi tak ada token di respons.");
console.log("✓ authorized\n");

// --- 2. query tiap foto ---
const results = [];
for (const path of images) {
  const buf = readFileSync(path);
  const { width, height } = imageSize(buf);
  const fx = width * FOCAL, fy = width * FOCAL, px = width / 2, py = height / 2;

  const form = new FormData();
  form.append("mapSetCode", mapSetCode);
  form.append("isRightHanded", "true");
  form.append("fx", `${fx}`); form.append("fy", `${fy}`);
  form.append("px", `${px}`); form.append("py", `${py}`);
  form.append("width", `${width}`); form.append("height", `${height}`);
  form.append("queryImage", new Blob([buf]), path);

  const res = await fetch(QUERY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const j = res.ok ? await res.json() : { error: `HTTP ${res.status} ${await res.text()}` };
  results.push({ path, width, height, ...j });

  console.log(`── ${path}  (${width}×${height})`);
  if (j.error)          console.log(`   ✗ ${j.error}`);
  else if (!j.poseFound) console.log(`   ⚠ poseFound=false — lihat CATATAN (intrinsics/kualitas foto)`);
  else console.log(`   ✓ poseFound  confidence=${j.confidence}  mapCodes=${JSON.stringify(j.mapCodes)}`);
  console.log();
}

// --- 3. vonis ---
const ok = results.filter(r => r.poseFound);
console.log("═".repeat(56));
if (ok.length < 2) {
  console.log("BELUM CUKUP: <2 foto ter-localize. Coba foto lebih jelas /");
  console.log("tune FOCAL_FACTOR, atau capture on-device (intrinsics asli).");
} else {
  const sets = ok.map(r => (r.mapCodes ?? []).join(","));
  const berbeda = new Set(sets).size > 1;
  for (const r of ok) console.log(`  ${r.path.padEnd(28)} → ${JSON.stringify(r.mapCodes)}`);
  console.log();
  if (berbeda) {
    console.log("✓ TERBUKTI: mapCodes BERBEDA antar-lantai.");
    console.log("  → Lantai bisa diturunkan dari result.mapCodes. Desain §3 TERKUNCI.");
  } else {
    console.log("✗ SAMA: mapCodes tidak berbeda antar-lantai.");
    console.log("  → Asumsi §3 GUGUR. Logika lantai perlu dirancang ulang. Berhenti, lapor.");
  }
}
