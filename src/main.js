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

const hud = document.getElementById("hud");
const state = { auth: "—", session: "—", last: "—", seen: new Set(), nav: "tekan SET TUJUAN", drift: "—" };
function draw() {
  hud.innerHTML =
    `<b>DARSI WebXR</b> — uji navigasi (${MAPSET})\n` +
    `auth    : ${state.auth}\n` +
    `sesi    : ${state.session}\n` +
    `localize: ${state.last}\n` +
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

  new ThreeAdapter({
    session, renderer, scene, camera, showMesh: false,
    onXRFrame: () => {                            // dipanggil tiap frame, camera SUDAH ter-sync
      if (!destination) return;
      const user = camera.position;
      const flat = destination.clone(); flat.y = user.y;   // jarak horizontal
      const dist = user.distanceTo(flat);
      // panah 0.8 m di depan kamera, menunjuk tujuan (horizontal)
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      arrow.position.copy(user).addScaledVector(fwd, 0.8);
      const dir = flat.sub(arrow.position); dir.y = 0;
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
  }).initialize();                    // pasang tombol START AR

  // tombol SET TUJUAN — rekam posisi user sekarang sbg tujuan (world space)
  const btn = document.createElement("button");
  btn.textContent = "SET TUJUAN";
  btn.style.cssText =
    "position:fixed;left:16px;bottom:24px;z-index:20;padding:12px 16px;" +
    "font:600 14px system-ui;color:#000;background:#ffcc00;border:0;border-radius:8px;";
  btn.onclick = () => {
    destination = camera.position.clone();
    destMarker.position.copy(destination);
    destMarker.position.y = camera.position.y - 0.7;   // pangkal pilar mendekati lantai
    destMarker.visible = true;
    arrow.visible = true;
    state.nav = "tujuan diset — menjauh lalu kembali";
    draw();
  };
  document.body.appendChild(btn);

  draw();
}

draw();
main().catch((e) => fail(e.message));
