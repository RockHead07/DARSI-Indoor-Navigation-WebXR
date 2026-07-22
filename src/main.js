// Milestone 1: buktikan WebXR + VPS jalan di HP, dan mapCodes = lantai.
// Localize mapset Jemursari, tampilkan poseFound/confidence/mapCodes LIVE di HUD,
// dan taruh penanda di origin map (bukti worldFromMap bekerja).
//
// Verifikasi §3 README: berjalan-jalan antar lantai → mapCodes berubah?
// HUD menyimpan daftar mapCodes berbeda yang pernah terlihat.

import * as THREE from "three";
import { MultisetClient, XRSessionManager } from "@multisetai/vps/core";
import { ThreeAdapter } from "@multisetai/vps/three";

const MAPSET = "MSET_PKRKGGFB1RO0";                       // Jemursari
const FLOORS = ["MAP_BCADVLIXFSJE", "MAP_MW1QTZWG1TLG"];  // 2 lantai (hint)

const hud = document.getElementById("hud");
const state = { auth: "—", session: "—", last: "—", seen: new Set() };
function draw() {
  hud.innerHTML =
    `<b>DARSI WebXR</b> — uji mapCodes (${MAPSET})\n` +
    `auth    : ${state.auth}\n` +
    `sesi    : ${state.session}\n` +
    `localize: ${state.last}\n` +
    `mapCodes terlihat: ${[...state.seen].join("  |  ") || "—"}` +
    (state.seen.size > 1 ? `\n<b>✓ mapCodes BERBEDA antar-lantai — §3 terbukti</b>` : "");
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

  new ThreeAdapter({
    session, renderer, scene, camera, showMesh: false,
    onLocalizationSuccess: (_result, worldFromMap) => {
      // bukti anchoring: bola hijau di ORIGIN map + triad sumbu 1 m
      const at = (v, c) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.08),
                                 new THREE.MeshBasicMaterial({ color: c }));
        m.position.copy(v.applyMatrix4(worldFromMap));
        scene.add(m);
      };
      at(new THREE.Vector3(0, 0, 0), 0x00ff88);  // origin
      at(new THREE.Vector3(1, 0, 0), 0xff0000);  // +X
      at(new THREE.Vector3(0, 0, 1), 0x0088ff);  // +Z
      console.log("worldFromMap", worldFromMap.elements);
    },
  }).initialize();                    // pasang tombol START AR

  draw();
}

draw();
main().catch((e) => fail(e.message));
