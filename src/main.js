// Milestone 2: buktikan LOOP NAVIGASI jalan di WebXR.
// "Taruh tujuan → navigasi balik": tombol SET TUJUAN merekam posisi user SEKARANG
// (world space three.js) sebagai tujuan; tiap frame panah + jarak memandu ke sana.
// Sengaja pakai drop-pin, BUKAN koordinat POI Unity — supaya loop navigasi teruji
// terpisah dari soal frame-koordinat Unity→VPS + handedness (README §4, belum beres).
//
// Milestone 1 (tetap): localize mapset Jemursari + mapCodes = lantai (§3).

import * as THREE from "three";
import { MultisetClient, XRSessionManager } from "@multisetai/vps/core";
import { ThreeAdapter } from "@multisetai/vps/three";

const MAPSET = "MSET_PKRKGGFB1RO0";                       // Jemursari
const FLOORS = ["MAP_BCADVLIXFSJE", "MAP_MW1QTZWG1TLG"];  // 2 lantai (hint)

// --- kontrak alur-balik ke CopyCat (Flutter) — lihat docs/DEEPLINK-CONTRACT.md ---
// Halaman ini jalan di Chrome Custom Tab yang diluncurkan CopyCat. "Selesai" harus balik
// ke app. Cara ANDAL di Chrome Android = intent:// (bukan bare `myrsiy://` yang sering
// di-drop), dan WAJIB dipicu tap user (gesture) — auto-redirect sesudah sessionend dibuang.
const RETURN = { scheme: "myrsiy", host: "ar-done", pkg: "com.rsislam.surabaya.rs_islam_app" };
function returnToApp(params) {
  const qs = new URLSearchParams(params).toString();
  // Hasil mis: intent://ar-done?arrived=true#Intent;scheme=myrsiy;package=com.rsislam...;end
  window.location.href =
    `intent://${RETURN.host}?${qs}#Intent;scheme=${RETURN.scheme};package=${RETURN.pkg};end`;
}

const hud = document.getElementById("hud");
const state = { auth: "—", session: "—", last: "—", seen: new Set(), nav: "tekan SET TUJUAN", drift: "—", pos: "—" };
function draw() {
  hud.innerHTML =
    `<b>DARSI WebXR</b> — uji navigasi (${MAPSET})\n` +
    `auth    : ${state.auth}\n` +
    `sesi    : ${state.session}\n` +
    `localize: ${state.last}\n` +
    `pos(map): ${state.pos}   <b>← Y = kandidat sinyal lantai</b>\n` +
    `mapCodes : ${[...state.seen].join(" | ") || "—"}` +
    (state.seen.size > 1 ? `  <b>✓ §3</b>` : "") + `\n` +
    `anchor geser/relocalize: ${state.drift}\n` +
    `<b>navigasi: ${state.nav}</b>`;
}
const fail = (m) => { hud.innerHTML = `<span class="err">✗ ${m}</span>`; };

const ID = import.meta.env.VITE_MS_CLIENT_ID;
const SECRET = import.meta.env.VITE_MS_CLIENT_SECRET;
if (!ID || !SECRET) fail("Set VITE_MS_CLIENT_ID & VITE_MS_CLIENT_SECRET di .env.local");

async function main() {
  if (!(await ThreeAdapter.isSupported())) {
    return fail("WebXR immersive-ar tidak didukung. Buka di Chrome Android + ARCore.");
  }

  const client = new MultisetClient({
    clientId: ID, clientSecret: SECRET,
    mapType: "map-set", code: MAPSET, hintMapCodes: FLOORS,
  });
  try { await client.authorize(); state.auth = "OK"; }
  catch (e) { return fail(`authorize gagal: ${e.message} (cek CORS domain di dashboard MultiSet)`); }
  draw();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 1000);

  const session = new XRSessionManager(renderer.getContext(), {
    client,
    overlayRoot: document.body,       // HUD ikut tampil saat AR
    autoLocalize: true,
    relocalization: true,             // re-localize saat tracking pulih (mis. keluar tangga)
    backgroundLocalization: true,     // tiap 30s di latar → mapCodes ikut ter-refresh
    confidenceCheck: true, confidenceThreshold: 0.5,
    onSessionStart: () => { renderer.domElement.style.display = "none"; state.session = "AKTIF"; draw(); },
    onSessionEnd:   () => { renderer.domElement.style.display = "block"; state.session = "berhenti"; draw(); },
    onLocalizationResult: (r) => {
      const d = r.localizeData;
      const codes = (d.mapCodes || []).join(",");
      if (codes) state.seen.add(codes);
      state.last = `poseFound=${d.poseFound}  conf=${d.confidence?.toFixed(3)}  mapCodes=[${codes}]`;
      const p = d.position;
      if (p) state.pos = `x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} z=${p.z.toFixed(1)}`;
      draw();
    },
    onLocalizationFailure: (why) => { state.last = `gagal: ${why ?? "—"}`; draw(); },
    onError: (e) => { state.last = `error: ${e?.message ?? e}`; draw(); },
  });

  // --- objek navigasi (world space) ---
  let destination = null;                        // THREE.Vector3 world, atau null
  const destMarker = new THREE.Mesh(             // pilar kuning di titik tujuan
    new THREE.CylinderGeometry(0.06, 0.06, 1.6, 12),
    new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
  destMarker.visible = false;
  scene.add(destMarker);

  const arrow = new THREE.ArrowHelper(           // panah pemandu, melayang di depan kamera
    new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 0.4, 0x00ff88, 0.15, 0.09);
  arrow.visible = false;
  scene.add(arrow);

  // gizmo koordinat map — DIBUAT SEKALI, di-update tiap localize (jangan menumpuk).
  const mkDot = (c) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.08),
                             new THREE.MeshBasicMaterial({ color: c }));
    m.visible = false; scene.add(m); return m;
  };
  const gizmo = { o: mkDot(0x00ff88), x: mkDot(0xff0000), z: mkDot(0x0088ff) };  // origin/+X/+Z
  let lastOriginWorld = null;

  const adapter = new ThreeAdapter({
    session, renderer, scene, camera,
    showMesh: true,   // DIAGNOSTIK: lihat apakah mesh map pas dgn dinding nyata (mesh
                      // melayang jauh = mislokalisasi, terlihat mata). Produk → false.
    onXRFrame: () => {                            // dipanggil tiap frame, camera SUDAH ter-sync
      if (!destination) return;
      // WAJIB getWorldPosition — camera.position (lokal) BASI di WebXR, isinya ~origin sesi.
      const user = new THREE.Vector3(); camera.getWorldPosition(user);
      const flat = destination.clone(); flat.y = user.y;   // jarak horizontal
      const dist = user.distanceTo(flat);
      const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);   // arah pandang (-Z world)
      arrow.position.copy(user).addScaledVector(fwd, 0.8);
      const dir = flat.clone().sub(arrow.position); dir.y = 0;
      if (dir.lengthSq() > 1e-4) arrow.setDirection(dir.normalize());
      state.nav = dist < 0.8 ? "✓ SAMPAI di tujuan" : `jarak ${dist.toFixed(1)} m → ikuti panah`;
      draw();
    },
    onLocalizationSuccess: (_result, worldFromMap) => {
      // Ukur MENTAH, jangan mask. Update gizmo di tempat (tidak menumpuk) dan catat
      // berapa origin bergeser antar-localize = repeatability VPS + drift tracking.
      const put = (dot, x, y, z) => {
        dot.position.copy(new THREE.Vector3(x, y, z).applyMatrix4(worldFromMap));
        dot.visible = true;
      };
      put(gizmo.o, 0, 0, 0); put(gizmo.x, 1, 0, 0); put(gizmo.z, 0, 0, 1);
      const now = gizmo.o.position.clone();
      if (lastOriginWorld) state.drift = `${now.distanceTo(lastOriginWorld).toFixed(2)} m`;
      lastOriginWorld = now;
      draw();
    },
  });
  adapter.initialize();               // pasang tombol START AR

  const mkBtn = (text, bg, fg, bottom, fn) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = `position:fixed;left:16px;bottom:${bottom}px;z-index:20;` +
      `padding:11px 16px;font:600 14px system-ui;color:${fg};background:${bg};border:0;border-radius:8px;`;
    b.onclick = fn;
    document.body.appendChild(b);
  };

  // SET TUJUAN — rekam posisi user SEKARANG (world) sbg tujuan
  mkBtn("SET TUJUAN", "#ffcc00", "#000", 24, () => {
    const wp = new THREE.Vector3(); camera.getWorldPosition(wp);   // world, bukan camera.position
    destination = wp.clone();
    destMarker.position.copy(wp);
    destMarker.position.y = wp.y - 0.7;                            // pangkal pilar mendekati lantai
    destMarker.visible = true; arrow.visible = true;
    state.nav = "tujuan diset — menjauh lalu kembali";
    draw();
  });

  // RELOCALIZE — picu localize manual (perbaiki pose bila tracking meleset)
  mkBtn("RELOCALIZE", "#0088ff", "#fff", 80, () => {
    state.last = "relocalize…"; draw();
    adapter.localizeFrame().catch((e) => { state.last = `relocalize gagal: ${e?.message ?? e}`; draw(); });
  });

  // SELESAI — akhiri sesi XR lalu balik ke CopyCat via intent:// (gesture terjaga: sinkron).
  mkBtn("SELESAI ✓", "#22c55e", "#fff", 136, () => {
    const arrived = state.nav.includes("SAMPAI");
    if (session.isActive()) session.stopSession();   // lepas kamera/XR dulu (sinkron)
    returnToApp({ arrived: String(arrived) });        // hand-off ke app native
  });

  draw();
}

draw();
main().catch((e) => fail(e.message));
