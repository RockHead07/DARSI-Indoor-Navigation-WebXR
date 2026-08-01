// Validasi public/data/navgraph.json: `node tools/check-navgraph.mjs`
// Isinya ditempel manual dari EXPORT NAVGRAPH di HP, dan di situlah kesalahan menyelinap —
// edge menggantung atau komponen terputus tak terlihat di file, tapi bikin A* diam-diam
// jatuh ke fallback garis lurus. Skrip Node polos; repo ini sengaja tanpa framework test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const g = JSON.parse(readFileSync(new URL("../public/data/navgraph.json", import.meta.url), "utf8"));
const at = new Map(g.nodes.map((n) => [n.id, n.position]));
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

assert.ok(g.nodes.length > 0, "navgraph kosong");
assert.ok(!JSON.stringify(g.edges).includes("distance"), "distance tak boleh disimpan (ADR-021) — diturunkan saat muat");

// ID unik: duplikat membuat lookup diam-diam mengambil yang pertama.
const ids = new Set();
for (const n of g.nodes) {
  assert.ok(!ids.has(n.id), `id ganda: ${n.id}`);
  ids.add(n.id);
  assert.ok(Number.isFinite(n.position?.x) && Number.isFinite(n.position?.y) && Number.isFinite(n.position?.z),
    `posisi tidak valid di ${n.id}`);
}

// Edge sehat.
const pasangan = new Set();
for (const e of g.edges) {
  assert.ok(at.has(e.from), `edge menggantung: ${e.from} tidak ada`);
  assert.ok(at.has(e.to), `edge menggantung: ${e.to} tidak ada`);
  assert.notEqual(e.from, e.to, `self-loop di ${e.from}`);
  const k = [e.from, e.to].sort().join("|");
  assert.ok(!pasangan.has(k), `edge duplikat: ${k}`);
  pasangan.add(k);
}

// Satu kesatuan: node yang terputus tak akan pernah dipakai A*, dan itu tak terlihat
// di file — cuma muncul sebagai "kok rutenya lurus terus" di lapangan.
const adj = new Map(g.nodes.map((n) => [n.id, []]));
for (const e of g.edges) { adj.get(e.from).push(e.to); adj.get(e.to).push(e.from); }
const tersambung = new Set([g.nodes[0].id]);
const antre = [g.nodes[0].id];
while (antre.length) for (const nb of adj.get(antre.shift())) {
  if (!tersambung.has(nb)) { tersambung.add(nb); antre.push(nb); }
}
assert.equal(tersambung.size, g.nodes.length,
  `graf terputus: ${tersambung.size}/${g.nodes.length} tersambung. Node terpisah tak akan pernah dirutekan.`);

const jarak = g.edges.map((e) => d3(at.get(e.from), at.get(e.to)));
const rentang = (a) => Math.max(...a) - Math.min(...a);
console.log(`OK — ${g.nodes.length} node, ${g.edges.length} edge, satu kesatuan.`);
console.log(`   jarak antar-node: ${Math.min(...jarak).toFixed(1)}–${Math.max(...jarak).toFixed(1)} m ` +
            `(rata ${(jarak.reduce((a, b) => a + b, 0) / jarak.length).toFixed(1)})`);
console.log(`   rentang X ${rentang(g.nodes.map((n) => n.position.x)).toFixed(2)} m, ` +
            `Z ${rentang(g.nodes.map((n) => n.position.z)).toFixed(2)} m` +
            `${rentang(g.nodes.map((n) => n.position.x)) < 1 ? "  <- lurus, tanpa tikungan" : ""}`);
