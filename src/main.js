// DARSI WebXR — navigasi AR indoor map-anchored (POI → A* → panah + chevron di lantai).
// Fokus produk: app KECIL (WebXR, tanpa Unity 365MB) + update tanpa Play Store. Presisi AR
// BUKAN tujuan — cukup: tahu lantai (pos.Y) + panah arah + jarak + "sampai".
//
// Mode:
//   - default              : produk. Kamera bersih, mesh gedung tidak dimuat.
//   - ?mesh=true           : DIAGNOSTIK. Render mesh gedung VPS (sudah dikoreksi
//                            relativePose, ADR-W010) — satu-satunya cek AKURASI yang kita
//                            punya (FIELD-TESTS Uji 2).
//   - ?admin=true / debug  : overlay semua POI + graph koridor + tombol developer.
//   - ?poiId=<id>          : langsung navigasi ke POI itu (dipanggil dari WebView).

import * as THREE from "three";
import { MultisetClient, XRSessionManager } from "@multisetai/vps/core";
import { ThreeAdapter } from "@multisetai/vps/three";
import { clipPathToHorizon } from "./horizon.js";

const MAPSET = "MSET_PKRKGGFB1RO0";                       // Jemursari
const FLOORS = ["MAP_BCADVLIXFSJE", "MAP_MW1QTZWG1TLG"];  // 2 lantai (hint)

// Tinggi HP dari lantai saat dipegang jalan. Semua koordinat map direkam pada ketinggian
// ini (localize memakai pose kamera), jadi lantai = worldY objek − EYE_HEIGHT.
// Nilai 1.5 diturunkan dari penempatan lama yang terbukti benar di lapangan: pilar 1.6 m
// dipasang di poiY−0.7 dengan origin di tengah → alasnya jatuh di poiY−1.5.
// ponytail: knob kalibrasi lapangan, bukan konstanta fisika — setel kalau pilar/chevron
// tampak tenggelam atau melayang.
const EYE_HEIGHT = 1.5;

// Jeda sebelum localize pertama, memberi ARCore waktu mengunci feature point (ADR-W005).
const ARCORE_WARMUP_MS = 1500;

// Ambang elevasi map-space pemisah lantai (ADR-W001: Lt1 Y≈−0.5, Lt2 Y≈3.7).
const floorOf = (mapY) => (mapY >= 1.5 ? 2 : 1);

// Mesh gedung VPS = alat DIAGNOSTIK, satu-satunya cek AKURASI yang kita punya
// (FIELD-TESTS Uji 2). Dibaca sekali saat load karena ThreeAdapter membaca showMesh sekali
// di constructor — mode tak bisa berubah di tengah sesi.
// Begitu material depth-only occluder dipasang, mesh berubah peran jadi occluder dan harus
// dimuat di SEMUA mode; saat itu SHOW_MESH beralih makna dari "apakah dimuat" jadi
// "apakah materialnya dibiarkan terlihat".
const SHOW_MESH = new URLSearchParams(location.search).has("mesh");

// Mode Admin dibaca di level modul karena dipakai SEBELUM ThreeAdapter dibuat: `showMesh`
// harus sudah bernilai benar di constructor (lihat catatan di bawah).
const IS_ADMIN = location.search.includes("admin=true") || location.search.includes("debug=true");

// KEMAMPUAN mesh vs TAMPILAN mesh — dua hal berbeda, dan SDK memaksa pemisahan ini.
// `ThreeAdapter` membuat objek `world`-nya SEKALI di constructor, dengan syarat
// `showMesh || showGizmo !== false || showObjectMeshes`. Kalau saat itu semuanya mati,
// `world` tak pernah ada dan mesh MUSTAHIL dimuat belakangan. Jadi slider di UI tidak bisa
// mengubah apakah mesh diunduh — ia hanya mengubah apakah mesh terlihat.
//   - Produksi (tanpa admin/mesh) : world tak dibuat, nol unduhan. Bersih.
//   - Sesi admin                  : mesh diunduh supaya slider bisa instan menampilkan atau
//                                   menyembunyikannya tanpa menunggu localize berikutnya.
const MESH_TERSEDIA = SHOW_MESH || IS_ADMIN;

// Horizon visibilitas (spec 2026-07-30). Angka bisa disetel di lapangan tanpa deploy ulang —
// sejarah repo ini menunjukkan konstanta spasial selalu perlu disetel setelah dicoba
// (EYE_HEIGHT baru ketahuan salah setelah pilar tenggelam ter-deploy).
const numParam = (nama, fallback) => {
  const v = parseFloat(new URLSearchParams(location.search).get(nama));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const HORIZON_M = numParam("horizon", 8);   // panjang jejak yang digambar (meter, sepanjang lintasan)
const PILAR_M = numParam("pilar", 12);      // jarak pilar tujuan mulai tampak (meter, horizontal)

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
const state = { auth: "—", session: "—", last: "—", seen: new Set(), nav: "tekan SET TUJUAN", drift: "—", pos: "—", intr: "—" };
function draw() {
  hud.innerHTML =
    `<b>DARSI WebXR</b> — uji navigasi (${MAPSET})\n` +
    `auth    : ${state.auth}\n` +
    `sesi    : ${state.session}\n` +
    `localize: ${state.last}\n` +
    `intrinsics: ${state.intr}   <b>← fx≈fy≈focal(px); px,py≈½w,½h?</b>\n` +
    `pos(map): ${state.pos}   <b>← Y = kandidat sinyal lantai</b>\n` +
    `mapCodes : ${[...state.seen].join(" | ") || "—"}` +
    (state.seen.size > 1 ? `  <b>✓ §3</b>` : "") + `\n` +
    `anchor geser/relocalize: ${state.drift}\n` +
    `<b>navigasi: ${state.nav}</b>`;
}
const fail = (m) => { hud.innerHTML = `<span class="err">✗ ${m}</span>`; };

// --- POI: load dari pois.json ---
async function loadPoi(poiId) {
  try {
    const res = await fetch("/data/pois.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const db = await res.json();
    return db.pois.find((p) => p.id === poiId) ?? null;
  } catch (e) {
    return null; // fetch gagal → fallback ke Mode Developer
  }
}

async function loadAllPois() {
  try {
    const res = await fetch("/data/pois.json");
    if (!res.ok) return [];
    const db = await res.json();
    return db.pois ?? [];
  } catch (e) {
    return [];
  }
}

const ID = import.meta.env.VITE_MS_CLIENT_ID;
const SECRET = import.meta.env.VITE_MS_CLIENT_SECRET;
if (!ID || !SECRET) fail("Set VITE_MS_CLIENT_ID & VITE_MS_CLIENT_SECRET di .env.local");

// Ambil relativePose tiap map di dalam map-set. SDK punya endpoint ini di DEFAULT_ENDPOINTS
// (`mapSetDetailsUrl`) tapi TIDAK PERNAH memanggilnya — `relativePose` 0 kemunculan di
// seluruh dist. Tanpa ini mesh lantai 2 meleset 3.99 m + yaw 20.89 derajat (Uji 5).
// Kunci Map = `_id` map, karena itulah yang dipakai SDK sebagai `name` objek mesh di scene.
async function fetchMapSetPoses(client) {
  const out = new Map();
  try {
    const res = await fetch(`https://api.multiset.ai/v1/vps/map-set/${MAPSET}`, {
      headers: { Authorization: `Bearer ${client.token}` },
    });
    if (!res.ok) return out;
    const body = await res.json();
    for (const m of body?.mapSet?.mapSetData ?? body?.mapSetData ?? []) {
      const p = m.relativePose?.position, q = m.relativePose?.rotation, id = m.map?._id;
      if (!id || !p || !q) continue;
      out.set(id, {
        position: new THREE.Vector3(p.x, p.y, p.z),
        // API memakai qx/qy/qz/qw, BUKAN x/y/z/w. Salah baca = identitas diam-diam.
        quaternion: new THREE.Quaternion(q.qx, q.qy, q.qz, q.qw),
      });
    }
  } catch { /* jaringan gagal → Map kosong → mesh dibiarkan seperti perilaku SDK */ }
  return out;
}

// MODE DIAGNOSTIK MANDIRI (?mapset=true) — menguji akar "mesh meleset".
// SDK mendeklarasikan endpoint `mapSetDetailsUrl` DAN tipe `IMapSetMapData.relativePose`
// (pose tiap map di dalam map-set), tapi KEDUANYA tak pernah dipakai: 0 kemunculan di
// seluruh dist. ThreeAdapter mengunduh mesh map TUNGGAL (vertex di ruang map itu sendiri)
// lalu menerapkan worldFromMap (ruang MAP-SET) tanpa relativePose → mesh meleset persis
// sebesar relativePose. Hipotesis: Lt 1 = jangkar (≈identitas, karena itu tampak hampir
// benar), Lt 2 punya geser nyata (karena itu "yang hancur selalu lantai 2").
// Sengaja dijalankan SEBELUM gerbang WebXR supaya bisa dibuka di laptop — tak butuh AR.
async function mapsetDiagnostic() {
  const client = new MultisetClient({
    clientId: ID, clientSecret: SECRET, mapType: "map-set", code: MAPSET,
  });
  const out = (s) => { hud.innerHTML = `<b>DIAGNOSTIK MAP-SET</b>\n${s}`; console.log(s); };
  out("mengautentikasi…");
  try {
    await client.authorize();
    const res = await fetch(`https://api.multiset.ai/v1/vps/map-set/${MAPSET}`, {
      headers: { Authorization: `Bearer ${client.token}` },
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { return out(`HTTP ${res.status} — bukan JSON:\n${text.slice(0, 600)}`); }

    const maps = body?.mapSet?.mapSetData ?? body?.mapSetData ?? [];
    if (!maps.length) {
      return out(`HTTP ${res.status} — struktur tak dikenal.\nkunci: ${Object.keys(body).join(", ")}\n\n${JSON.stringify(body, null, 2).slice(0, 900)}`);
    }
    out(`HTTP ${res.status} — ${maps.length} map\n\n` + maps.map((m) => {
      const p = m.relativePose?.position ?? {}, q = m.relativePose?.rotation ?? {};
      const mag = Math.hypot(p.x ?? 0, p.y ?? 0, p.z ?? 0);
      return `${m.map?.mapCode}  (order ${m.order})\n` +
             `  ${m.map?.mapName ?? ""}\n` +
             `  pos: x=${p.x} y=${p.y} z=${p.z}\n` +
             `  rot: ${q.qx}, ${q.qy}, ${q.qz}, ${q.qw}\n` +
             `  GESER: ${mag.toFixed(3)} m  ${mag < 0.01 ? "← ~identitas (jangkar map-set)" : "← INI offset mesh yang hilang"}`;
    }).join("\n\n"));
  } catch (e) {
    out(`gagal: ${e?.message ?? e}`);
  }
}

async function main() {
  if (new URLSearchParams(location.search).has("mapset")) return mapsetDiagnostic();

  if (!(await ThreeAdapter.isSupported())) {
    return fail("WebXR immersive-ar tidak didukung. Buka di Chrome Android + ARCore.");
  }

  // --- UI Elements ---
  const btnAr = document.getElementById("btn-ar");
  const poiSelect = document.getElementById("poi-select");

  // Populate POI Dropdown
  const allPois = await loadAllPois();
  if (allPois.length > 0 && poiSelect) {
    allPois.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `[Lt ${p.floor}] ${p.name}`;
      poiSelect.appendChild(opt);
    });
  }

  // --- deteksi mode POI vs Developer ---
  const urlParams = new URLSearchParams(window.location.search);
  const rawPoiId = urlParams.get("poiId");
  let activePoi = null;
  const poiMode = rawPoiId !== null;

  if (poiMode) {
    activePoi = await loadPoi(rawPoiId);
    if (!activePoi) {
      state.nav = `POI '${rawPoiId}' tidak ditemukan.`;
      draw();
    } else {
      state.nav = `Menuju ${activePoi.name} — arahkan kamera untuk lokalisasi...`;
      draw();
    }
  }

  // --- Pre-fetch Geolocation di 2D mode (ADR-W005) ---
  // Menghangatkan izin GPS di luar sesi WebXR agar tidak memicu dialog OS/focus-loss saat AR aktif
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      () => {},
      () => {},
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  }

  const client = new MultisetClient({
    clientId: ID, clientSecret: SECRET,
    mapType: "map-set", code: MAPSET, hintMapCodes: FLOORS,
    passGeoPose: true,    // kirim GPS browser ke VPS sebagai geo-hint (pre-fetched & cached)
    use2DFiltering: true, // skip altitude GPS — tidak akurat di dalam gedung
    // isRightHanded default true = BENAR (Tahap A terbukti: false memirror sumbu X → lt1
    // ambruk, lt2 geser 12m). Jadi tilt lt2 BUKAN handedness. Jangan diutak-atik lagi.
  });
  try { await client.authorize(); state.auth = "OK"; }
  catch (e) { return fail(`authorize gagal: ${e.message} (cek CORS domain di dashboard MultiSet)`); }
  draw();

  // relativePose dibutuhkan SEBELUM mesh pertama dimuat (Task 2). Gagal ambil = Map kosong,
  // mesh berperilaku seperti bawaan SDK (meleset) — bukan crash.
  const mapSetPoses = await fetchMapSetPoses(client);
  state.auth = `OK (relativePose: ${mapSetPoses.size} map)`;
  draw();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0); // Background 100% transparan untuk passthrough kamera ARCore
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 1000);

  // Tanpa lampu: semua material di scene ini MeshBasicMaterial (unlit), dan mesh SDK
  // memakai ShaderMaterial-nya sendiri. Menambah lampu tidak mengubah apa pun.

  let lastMapPos = null;   // posisi map-space localize terakhir (untuk merekam tujuan MAP)

  const session = new XRSessionManager(renderer.getContext(), {
    client,
    overlayRoot: document.body,       // HUD ikut tampil saat AR
    referenceSpaceType: "local",      // 'local' dijamin didukung oleh semua perangkat WebXR
    // autoLocalize DIMATIKAN SENGAJA (ADR-W005). SDK memicunya di rAF berikutnya PERSIS
    // setelah sesi mulai — saat tracking ARCore masih dingin. Karena
    // worldFromMap = worldFromCamera@capture · pose⁻¹, worldFromCamera yang dingin
    // meracuni anchor sejak lahir. poseTimeoutMs BUKAN jeda ("max ms to wait for a valid
    // viewer pose"), jadi tidak bisa dipakai untuk ini. Localize pertama dipicu manual
    // setelah ARCORE_WARMUP_MS di onSessionStart.
    autoLocalize: false,
    poseTimeoutMs: 20000,             // batas atas menunggu viewer pose valid sebelum menyerah
    relocalization: true,             // auto re-localize saat tracking pulih dari loss (mis. keluar tangga)
    backgroundLocalization: true,
    bgLocalizationInterval: 10,       // 10s (min) — auto-relocalize lebih sering → pulih cepat dari drift/pose-loss
    confidenceCheck: true,            // threshold jatuh ke default SDK 0.5; conf terbukti bukan filter andal (FIELD-TESTS Uji 1)
    onSessionStart: () => {
      renderer.domElement.style.display = "none"; state.session = "AKTIF"; syncArButton(true); draw();
      setTimeout(() => {
        if (!adapter.isActive()) return;             // user keburu menutup sesi
        adapter.localizeFrame().catch((e) => { state.last = `localize awal gagal: ${e?.message ?? e}`; draw(); });
      }, ARCORE_WARMUP_MS);
    },
    onSessionEnd: () => {
      renderer.domElement.style.display = "block";
      state.session = "berhenti (sesi WebXR diakhiri browser/user)";
      syncArButton(false);   // sesi bisa berakhir tanpa lewat tombol (back, focus loss) — label ikut jujur
      draw();
    },
    // DIAGNOSTIK: intrinsics yang BENAR-BENAR dikirim ke VPS. App native pakai kalibrasi
    // kamera asli; jalur web menurunkan dari proyeksi WebXR. Kalau fx≠fy jauh, atau px/py
    // bukan ~½ width/height, atau fx tak masuk akal utk focal → itu sumber offset sistematis.
    onCameraIntrinsics: (i) => {
      state.intr = `fx=${i.fx?.toFixed(0)} fy=${i.fy?.toFixed(0)} px=${i.px?.toFixed(0)} py=${i.py?.toFixed(0)} ${i.width}x${i.height}`;
      draw();
    },
    onLocalizationResult: (r) => {
      const d = r.localizeData;
      const p = d.position;
      if (p) {
        state.pos = `x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} z=${p.z.toFixed(1)}`;
        lastMapPos = new THREE.Vector3(p.x, p.y, p.z);

        // ThreeAdapter memuat mesh dari mapCodes[0], padahal urutan mapCodes = artefak urutan
        // hintMapCodes, BUKAN peringkat kecocokan (ADR-W001). Urutkan ulang pakai elevasi Y
        // supaya mesh lantai yang dimuat benar. Berlaku di SEMUA mode sejak mesh juga dimuat
        // di produksi sebagai occluder — kalau tertukar, occluder-nya lantai yang salah.
        d.mapCodes = floorOf(p.y) === 2
          ? ["MAP_MW1QTZWG1TLG", "MAP_BCADVLIXFSJE"]
          : ["MAP_BCADVLIXFSJE", "MAP_MW1QTZWG1TLG"];
      }
      const codes = (d.mapCodes || []).join(",");
      if (codes) state.seen.add(codes);
      state.last = `poseFound=${d.poseFound}  conf=${d.confidence?.toFixed(3)}  rt=${d.responseTime ?? "?"}ms  mapCodes=[${codes}]`;
      draw();
    },
    onLocalizationFailure: (why) => { state.last = `gagal: ${why ?? "—"}`; draw(); },
    onError: (e) => { state.last = `error: ${e?.message ?? e}`; draw(); },
  });

  // Pilar penanda. CylinderGeometry ber-origin di TENGAH, jadi origin-nya digeser ke ALAS
  // sekali di sini. Sesudah itu semua penempatan cukup menaruh alas di lantai
  // (worldY − EYE_HEIGHT) tanpa perlu ingat setengah tinggi masing-masing.
  const pillarGeo = (radius, height, seg) => {
    const g = new THREE.CylinderGeometry(radius, radius, height, seg);
    g.translate(0, height / 2, 0);
    return g;
  };

  // --- objek navigasi (world space) ---
  let destination = null;                        // THREE.Vector3 world, atau null
  const destMarker = new THREE.Mesh(             // pilar kuning di titik tujuan
    pillarGeo(0.06, 1.6, 12),
    new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
  destMarker.visible = false;
  scene.add(destMarker);

  // Geometri & material overlay POI dibuat SEKALI — renderAllPoisOverlay dipanggil tiap localize.
  const poiPillarGeo = pillarGeo(0.04, 1.2, 10);
  const poiPillarMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });

  // Group penanda 3D untuk SEMUA POI (Mode Admin / Overlay Debug)
  const allPoiMarkersGroup = new THREE.Group();
  allPoiMarkersGroup.visible = false;
  scene.add(allPoiMarkersGroup);

  // Group visualisasi 3D Graph Koridor A* Pathfinding (Mode Admin)
  const navGraphLinesGroup = new THREE.Group();
  navGraphLinesGroup.visible = false;
  scene.add(navGraphLinesGroup);

  // Group animasi panah beranimasi yang berjalan menapak di atas lantai koridor (Floor Chevron Trail)
  const floorTrailGroup = new THREE.Group();
  floorTrailGroup.visible = false;
  scene.add(floorTrailGroup);

  // Geometri panah chevron 3D datar menapak lantai
  function createChevronGeometry() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.22);
    shape.lineTo(0.18, -0.12);
    shape.lineTo(0.09, -0.12);
    shape.lineTo(0, 0.04);
    shape.lineTo(-0.09, -0.12);
    shape.lineTo(-0.18, -0.12);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2); // Rebah menapak di lantai (bidang XZ)
    return geo;
  }

  const chevronGeo = createChevronGeometry();
  const chevronMat = new THREE.MeshBasicMaterial({
    color: 0x34d399, // Hijau Pastel Mint Vibrant
    side: THREE.DoubleSide,
  });

  // gizmo koordinat map — DIBUAT SEKALI, di-update tiap localize (jangan menumpuk).
  const mkDot = (c) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.08),
                             new THREE.MeshBasicMaterial({ color: c }));
    m.visible = false; scene.add(m); return m;
  };
  const gizmo = { o: mkDot(0x00ff88), x: mkDot(0xff0000), z: mkDot(0x0088ff) };  // origin/+X/+Z
  let lastOriginWorld = null;

  // --- navigasi MAP-anchored (uji inti) ---
  let lastWorldFromMap = null;     // matrix localize terakhir → re-anchor tujuan tiap localize

  // --- NAVGRAPH & A* PATHFINDING ENGINE ---
  let navGraph = null;
  let activeWaypointsMap = [];   // Waypoints dalam koordinat MAP
  let currentWaypointIndex = 0;

  const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

  // Posisi user SEKARANG dalam koordinat map. WAJIB pakai ini untuk merekam, bukan
  // `lastMapPos` — lastMapPos hanya diperbarui saat lokalisasi (~10 dtk), jadi kalau
  // direkam sambil berjalan hasilnya posisi belasan meter di belakang. ARCore melacak
  // terus-menerus, jadi posisi kamera live + kebalikan worldFromMap = posisi map live.
  const _mapFromWorld = new THREE.Matrix4();
  function currentMapPos() {
    if (!lastWorldFromMap) return null;
    const w = new THREE.Vector3();
    camera.getWorldPosition(w);
    return w.applyMatrix4(_mapFromWorld.copy(lastWorldFromMap).invert());
  }

  async function loadNavGraph() {
    try {
      const res = await fetch("/data/navgraph.json");
      if (!res.ok) return null;
      const g = await res.json();
      // `distance` DITURUNKAN dari posisi node, tidak disimpan di file (ADR-021: satu pemilik
      // data). Kalau disalin manual, ia pasti melenceng begitu node digeser.
      const at = new Map((g.nodes ?? []).map((n) => [n.id, n.position]));
      for (const e of g.edges ?? []) {
        const a = at.get(e.from), b = at.get(e.to);
        e.distance = a && b ? dist3(a, b) : Infinity;   // edge menggantung → tak pernah dipilih A*
      }
      return g;
    } catch {
      return null;
    }
  }
  loadNavGraph().then((g) => { navGraph = g; });

  function findClosestNode(mapPos, floor) {
    if (!navGraph || !navGraph.nodes) return null;
    const candidates = navGraph.nodes.filter((n) => n.floor === floor);
    if (candidates.length === 0) return null;

    let closest = null;
    let minSq = Infinity;
    candidates.forEach((n) => {
      const dx = n.position.x - mapPos.x;
      const dy = n.position.y - mapPos.y;
      const dz = n.position.z - mapPos.z;
      const sq = dx * dx + dy * dy + dz * dz;
      if (sq < minSq) {
        minSq = sq;
        closest = n;
      }
    });
    return closest;
  }

  function solveAStar(startNodeId, targetNodeId) {
    if (!navGraph || !navGraph.nodes || !navGraph.edges) return [];

    const nodesMap = new Map(navGraph.nodes.map((n) => [n.id, n]));
    if (!nodesMap.has(startNodeId) || !nodesMap.has(targetNodeId)) return [];

    const openSet = [startNodeId];
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    navGraph.nodes.forEach((n) => {
      gScore.set(n.id, Infinity);
      fScore.set(n.id, Infinity);
    });

    gScore.set(startNodeId, 0);
    const startNode = nodesMap.get(startNodeId);
    const targetNode = nodesMap.get(targetNodeId);

    const heuristic = (n1, n2) => {
      const p1 = n1.position, p2 = n2.position;
      return Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
    };

    fScore.set(startNodeId, heuristic(startNode, targetNode));

    // Adjacency map
    const adj = new Map();
    navGraph.edges.forEach((e) => {
      if (!adj.has(e.from)) adj.set(e.from, []);
      if (!adj.has(e.to)) adj.set(e.to, []);
      adj.get(e.from).push({ to: e.to, dist: e.distance });
      adj.get(e.to).push({ to: e.from, dist: e.distance });
    });

    while (openSet.length > 0) {
      openSet.sort((a, b) => (fScore.get(a) ?? Infinity) - (fScore.get(b) ?? Infinity));
      const current = openSet.shift();

      if (current === targetNodeId) {
        const path = [current];
        let curr = current;
        while (cameFrom.has(curr)) {
          curr = cameFrom.get(curr);
          path.unshift(curr);
        }
        return path.map((id) => nodesMap.get(id));
      }

      const neighbors = adj.get(current) || [];
      neighbors.forEach(({ to, dist }) => {
        const tentativeG = (gScore.get(current) ?? Infinity) + dist;
        if (tentativeG < (gScore.get(to) ?? Infinity)) {
          cameFrom.set(to, current);
          gScore.set(to, tentativeG);
          const h = heuristic(nodesMap.get(to), targetNode);
          fScore.set(to, tentativeG + h);
          if (!openSet.includes(to)) openSet.push(to);
        }
      });
    }

    return []; // No path found
  }

  function calculateRouteToPoi(poi, userMapPos) {
    if (!poi || !navGraph) return;
    // Start difilter pakai lantai USER, target pakai lantai POI. Sekarang keduanya selalu
    // sama karena gerbang lintas-lantai di onLocalizationSuccess, tapi memisahkannya membuat
    // semantiknya benar dan siap untuk A* multi-lantai (butuh node tangga/lift dulu).
    const startNode = findClosestNode(userMapPos, floorOf(userMapPos.y));
    const targetNode = findClosestNode(poi.position, poi.floor ?? floorOf(poi.position.y));

    if (startNode && targetNode && startNode.id !== targetNode.id) {
      const nodePath = solveAStar(startNode.id, targetNode.id);
      if (nodePath.length > 0) {
        activeWaypointsMap = nodePath.map((n) => new THREE.Vector3(n.position.x, n.position.y, n.position.z));
        // Tambahkan POI persis di akhir
        activeWaypointsMap.push(new THREE.Vector3(poi.position.x, poi.position.y, poi.position.z));
        currentWaypointIndex = 0;
        return;
      }
    }
    // Fallback: navigasi langsung ke POI jika rute graph tidak ditemukan
    activeWaypointsMap = [new THREE.Vector3(poi.position.x, poi.position.y, poi.position.z)];
    currentWaypointIndex = 0;
  }

  // Satu-satunya jalur masuk navigasi ke POI — dipakai onLocalizationSuccess DAN tombol
  // "Navigasi". Gerbang lintas-lantai dipasang di sini supaya tak ada pemanggil yang lolos.
  function navigateToActivePoi(worldFromMap) {
    if (!activePoi || !worldFromMap) return;
    const poiFloor = activePoi.floor ?? floorOf(activePoi.position.y);

    // GERBANG LINTAS-LANTAI: navgraph belum punya node tangga/lift (ADR-020), jadi rute
    // antar-lantai tak bisa dihitung. Lebih baik diam jujur daripada menggambar rute palsu
    // yang menembus lantai. Begitu user sampai, localize berikutnya membaca Y dan rute jalan.
    if (lastMapPos && floorOf(lastMapPos.y) !== poiFloor) {
      activeWaypointsMap = []; currentWaypointIndex = 0; destination = null;
      destMarker.visible = false; floorTrailGroup.visible = false;
      const arah = poiFloor > floorOf(lastMapPos.y) ? "Naik" : "Turun";
      state.nav = `${arah} ke Lantai ${poiFloor} dulu — ${activePoi.name} ada di sana. ` +
                  `Navigasi aktif otomatis setelah sampai.`;
      return;
    }

    // Hitung rute HANYA kalau belum punya. Sebelumnya dipanggil tiap localize, dan karena
    // calculateRouteToPoi mereset currentWaypointIndex=0, progres waypoint terhapus tiap
    // 10 detik oleh background localization → jejak melompat mundur. Localize berikutnya
    // cukup me-RE-ANCHOR rute yang sama lewat worldFromMap baru.
    // ponytail: belum ada deteksi keluar-jalur — kalau user salah belok, rute tidak dihitung
    // ulang. Tambahkan kalau navgraph sudah rapat dan salah-belok jadi mungkin.
    if (lastMapPos && activeWaypointsMap.length === 0) calculateRouteToPoi(activePoi, lastMapPos);
    anchorPoiDest(activePoi, worldFromMap);
  }

  // --- POI navigation: transform koordinat map-space POI ke world-space ---
  function anchorPoiDest(poi, worldFromMap) {
    if (activeWaypointsMap.length > 0) {
      const activeWaypointMap = activeWaypointsMap[currentWaypointIndex] || activeWaypointsMap[activeWaypointsMap.length - 1];
      destination = activeWaypointMap.clone().applyMatrix4(worldFromMap);
    } else {
      const mapPos = new THREE.Vector3(poi.position.x, poi.position.y, poi.position.z);
      destination = mapPos.applyMatrix4(worldFromMap);
    }
    // Set penanda pilar di lokasi POI akhir
    const finalPoiPos = new THREE.Vector3(poi.position.x, poi.position.y, poi.position.z).applyMatrix4(worldFromMap);
    destMarker.position.copy(finalPoiPos);
    destMarker.position.y = finalPoiPos.y - EYE_HEIGHT;   // POI direkam pada tinggi mata → turunkan ke lantainya
    destMarker.visible = true;
  }

  function renderAllPoisOverlay(worldFromMap) {
    while (allPoiMarkersGroup.children.length > 0) {
      allPoiMarkersGroup.remove(allPoiMarkersGroup.children[0]);
    }
    if (!allPois || allPois.length === 0) return;

    allPois.forEach((p) => {
      const poiWorldPos = new THREE.Vector3(p.position.x, p.position.y, p.position.z).applyMatrix4(worldFromMap);
      const poiMarker = new THREE.Mesh(poiPillarGeo, poiPillarMat);
      poiMarker.position.copy(poiWorldPos);
      poiMarker.position.y = poiWorldPos.y - EYE_HEIGHT;   // alas pilar berdiri di lantai POI-nya
      allPoiMarkersGroup.add(poiMarker);
    });
  }

  function renderNavGraphOverlay(worldFromMap) {
    while (navGraphLinesGroup.children.length > 0) {
      navGraphLinesGroup.remove(navGraphLinesGroup.children[0]);
    }
    if (!navGraph || !navGraph.nodes || !navGraph.edges) return;

    const nodeWorldPositions = new Map();
    navGraph.nodes.forEach((n) => {
      const wPos = new THREE.Vector3(n.position.x, n.position.y, n.position.z).applyMatrix4(worldFromMap);
      nodeWorldPositions.set(n.id, wPos);

      // Titik node persimpangan (Kuning emas 3D sphere)
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
      dot.position.copy(wPos);
      navGraphLinesGroup.add(dot);
    });

    // Garis koridor penghubung (Kuning cerah)
    navGraph.edges.forEach((e) => {
      const p1 = nodeWorldPositions.get(e.from);
      const p2 = nodeWorldPositions.get(e.to);
      if (p1 && p2) {
        const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const line = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({ color: 0xfde047, linewidth: 2 })
        );
        navGraphLinesGroup.add(line);
      }
    });
  }

  function updateFloorTrail(worldFromMap, userWorldPos) {
    while (floorTrailGroup.children.length > 0) {
      floorTrailGroup.remove(floorTrailGroup.children[0]);
    }
    if (!activePoi || activeWaypointsMap.length === 0 || !worldFromMap) {
      floorTrailGroup.visible = false;
      return;
    }

    // Kumpulkan titik-titik lintasan A* di world space
    const semuaWaypoint = [userWorldPos.clone()];
    for (let i = currentWaypointIndex; i < activeWaypointsMap.length; i++) {
      semuaWaypoint.push(activeWaypointsMap[i].clone().applyMatrix4(worldFromMap));
    }

    // Jangan gambar yang tak pantas terlihat dari sini. Ini BUKAN occlusion — occlusion
    // sungguhan ada di occluder mesh; ini keterbacaan navigasi. Hanya memengaruhi RENDER:
    // perhitungan jarak, kemajuan waypoint, dan deteksi SAMPAI tetap memakai rute penuh.
    // clipPathToHorizon adalah helper geometri polos: titik interpolasi di ujung horizon
    // dikembalikan sebagai objek {x,y,z} biasa, dan titik lainnya diteruskan sebagai
    // REFERENSI ke input. Dinormalkan jadi Vector3 baru di sini — memberi .clone()/.sub()
    // yang dipakai loop chevron, sekaligus memutus alias ke activeWaypointsMap.
    const waypointsWorld = clipPathToHorizon(semuaWaypoint, HORIZON_M)
      .map((p) => new THREE.Vector3(p.x, p.y, p.z));

    if (waypointsWorld.length < 2) return;

    // Lantai diturunkan dari posisi USER, bukan dari tujuan: user selalu berdiri di lantainya
    // sendiri. (Sebelumnya dipakai waypoint terakhir → menuju POI lantai lain membuat chevron
    // melayang setinggi beda lantai.)
    const floorY = userWorldPos.y - EYE_HEIGHT;

    // Jarak interval antar panah (0.5m)
    const spacing = 0.5;
    const timeOffset = (performance.now() * 0.001 * 0.7) % spacing;
    const chevronTerpasang = [];   // dipakai Step 3 untuk meredupkan ujung horizon

    for (let i = 0; i < waypointsWorld.length - 1; i++) {
      const p1 = waypointsWorld[i];
      const p2 = waypointsWorld[i + 1];
      const segDir = p2.clone().sub(p1);
      const segLen = segDir.length();
      if (segLen < 0.1) continue;

      segDir.normalize();
      const numChevrons = Math.floor(segLen / spacing);

      for (let j = 0; j <= numChevrons; j++) {
        const d = j * spacing + timeOffset;
        if (d > segLen) continue;

        const pos = p1.clone().addScaledVector(segDir, d);
        pos.y = floorY + 0.08; // Menapak 8cm di atas permukaan lantai

        const chevron = new THREE.Mesh(chevronGeo, chevronMat);
        chevron.position.copy(pos);

        // Putar chevron mengarah ke segmen jalur berikutnya di lantai
        const lookTarget = pos.clone().add(segDir);
        chevron.lookAt(lookTarget);
        floorTrailGroup.add(chevron);
        chevronTerpasang.push(chevron);
      }
    }
    // Tiga chevron terakhir dikecilkan (0.75 / 0.5 / 0.25, terjauh paling kecil) agar tidak
    // muncul-hilang mendadak saat berjalan. Lewat SKALA, bukan transparansi: menghindari
    // sorting alpha dan alokasi material per-chevron. Jejak < 3 chevron → ramp seadanya.
    const ramp = [0.25, 0.5, 0.75];   // indeks 0 dipasang ke chevron TERJAUH → terjauh paling kecil
    const n = chevronTerpasang.length;
    for (let k = 0; k < Math.min(ramp.length, n); k++) {
      chevronTerpasang[n - 1 - k].scale.setScalar(ramp[k]);
    }

    floorTrailGroup.visible = true;
  }

  // Mesh dimuat SDK secara asinkron SETELAH onLocalizationSuccess (urutan SDK:
  // onLocalizationSuccess → fetchMapDetails → ensureMeshLoaded → applyMeshTransform), dan SDK
  // tak menyediakan callback "mesh siap" — jadi dicek tiap frame sampai semuanya terpasang.
  //
  // Dicari lewat scene.getObjectByName: SDK menamai root glTF tiap map dengan `_id`-nya
  // (`s.scene.name = e._id`) SEBELUM menambahkannya ke grup, dan SDK sendiri memakai lookup
  // yang sama (`this.scene.getObjectByName(e._id)`) untuk deduplikasi. Cara ini tidak
  // menyentuh field internal SDK sama sekali.
  //
  // Aman sekali-pasang: applyMeshTransform() hanya menulis position/quaternion/scale/visible
  // pada GRUP induk, tak pernah menyentuh transform anak — jadi koreksi ini bertahan melewati
  // setiap re-localize.
  let meshTerpasang = 0;
  const meshChildren = [];          // anak mesh yang sudah ditemukan — dipakai slider tampil/sembunyi
  let meshTampil = SHOW_MESH;       // default: hanya menyala kalau dibuka dengan ?mesh=true

  // Visibilitas diset di ANAK, bukan di grup: applyMeshTransform() milik SDK memaksa
  // `meshGroup.visible = true` tiap localize, jadi menyembunyikan grup akan dibatalkan
  // ~10 detik kemudian. SDK tak pernah menyentuh `visible` anak.
  function setMeshTampil(v) {
    meshTampil = v;
    meshChildren.forEach((c) => { c.visible = v; });
  }

  function patchMeshChildren() {
    // Koreksi relativePose: sekali per mesh, dilewati begitu semuanya terpasang.
    if (meshTerpasang < mapSetPoses.size) {
      for (const [id, pose] of mapSetPoses) {
        const child = scene.getObjectByName(id);
        if (!child || child.userData.msPatched) continue;
        child.userData.msPatched = true;
        meshTerpasang++;
        child.position.copy(pose.position);
        child.quaternion.copy(pose.quaternion);
        child.updateMatrixWorld(true);
        meshChildren.push(child);
        // Tampilkan di HUD: satu-satunya bukti bahwa koreksi BENAR-BENAR terpasang. Versi
        // sebelumnya gagal diam-diam dan lolos build, cek otomatis, dan review implementer.
        state.auth = `OK (relativePose: ${mapSetPoses.size} map, ${meshTerpasang} terpasang)`;
        draw();
      }
    }
    // Visibilitas DITEGAKKAN tiap frame, bukan dipasang sekali saat mesh ditemukan. Slider
    // harus jadi otoritas terakhir: kalau ada apa pun yang menampilkan mesh kembali —
    // SDK, animasi reveal, atau jalur yang belum kita ketahui — ia dikoreksi di frame
    // berikutnya alih-alih menang diam-diam. Ongkosnya perbandingan boolean per lantai.
    for (const c of meshChildren) {
      if (c.visible !== meshTampil) c.visible = meshTampil;
    }
  }

  const adapter = new ThreeAdapter({
    session, renderer, scene, camera,
    // Dibaca SEKALI di constructor — lihat MESH_TERSEDIA di atas. Produksi: tak dibuat sama
    // sekali. Sesi admin: dibuat agar slider "Tampilkan Mesh" bisa instan.
    // Task occluder nanti membuatnya `true` tanpa syarat BERSAMAAN dengan memasang material
    // depth-only; dua perubahan itu satu paket dan tak boleh dipisah lagi.
    showMesh: MESH_TERSEDIA,
    showGizmo: false,         // default SDK true; gizmo bawaannya tak dipakai (kita punya gizmo sendiri)
    useDefaultButton: false,  // Bersihkan UI: pakai tombol navigasi kustom, matikan tombol STOP AR bawaan SDK
    onXRFrame: () => {                            // dipanggil tiap frame, camera SUDAH ter-sync
      patchMeshChildren();   // mesh dimuat asinkron; tak ada callback "mesh siap" dari SDK
      if (!destination) return;
      // WAJIB getWorldPosition — camera.position (lokal) BASI di WebXR, isinya ~origin sesi.
      const user = new THREE.Vector3(); camera.getWorldPosition(user);
      const flat = destination.clone(); flat.y = user.y;   // jarak horizontal
      const dist = user.distanceTo(flat);

      // Pilar tujuan hanya tampak saat dekat. PILAR_M sengaja lebih besar dari HORIZON_M:
      // pilar menandai tujuan akhir dan berguna kalau sudah terlihat sesaat sebelum jejaknya
      // sampai ke sana. Informasi jaraknya tetap ada di HUD, jadi tak ada yang hilang.
      // Hanya visual — perhitungan jarak & deteksi SAMPAI di bawah tidak terpengaruh.
      // Aman ditulis tiap frame: gerbang lintas-lantai (ADR-W007) menyetel destination=null,
      // sehingga onXRFrame sudah keluar lebih awal dan tak pernah sampai ke baris ini.
      // Diukur ke PILAR-nya sendiri, bukan ke `dist`: `dist` mengukur jarak ke waypoint A*
      // yang sedang dituju, sedangkan pilar berdiri di POI akhir. Memakai `dist` membuat
      // pilar muncul begitu waypoint terdekat dekat — padahal POI-nya masih 40 m di balik
      // dua tembok, persis kasus yang gerbang ini seharusnya cegah.
      const pilarFlat = destMarker.position.clone(); pilarFlat.y = user.y;
      destMarker.visible = user.distanceTo(pilarFlat) <= PILAR_M;

      // Update animasi panah berjalan menapak di lantai koridor
      if (lastWorldFromMap) {
        updateFloorTrail(lastWorldFromMap, user);
      }

      // Sekuensial Waypoint Advancement: jika mendekati waypoint aktif (< 1.2m), beralih ke waypoint berikutnya
      if (activeWaypointsMap.length > 0 && currentWaypointIndex < activeWaypointsMap.length - 1) {
        if (dist < 1.2 && lastWorldFromMap) {
          currentWaypointIndex++;
          const nextWaypointMap = activeWaypointsMap[currentWaypointIndex];
          destination = nextWaypointMap.clone().applyMatrix4(lastWorldFromMap);
        }
      }

      const arrivedLabel = activePoi ? `✓ SAMPAI di ${activePoi.name}` : "✓ SAMPAI di tujuan";
      const navLabel = activePoi ? activePoi.name : "tujuan";
      state.nav = dist < 1.2 && currentWaypointIndex >= activeWaypointsMap.length - 1
        ? arrivedLabel
        : `jarak ${dist.toFixed(1)} m → ikuti jalur di lantai ke ${navLabel}`;
      draw();
    },
    onLocalizationSuccess: (_result, worldFromMap) => {
      renderAllPoisOverlay(worldFromMap);
      renderNavGraphOverlay(worldFromMap);

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
      lastWorldFromMap = worldFromMap;
      if (activePoi) navigateToActivePoi(worldFromMap);   // re-anchor & update rute tiap localize
      draw();
    },
  });
  adapter.initialize();               // pasang tombol START AR

  // --- Kontrol UI: DUA urusan, DUA kontrol ---
  // Sebelumnya AR hanya bisa dinyalakan lewat tombol "Navigasi", jadi menyalakan kamera
  // MEWAJIBKAN memilih tujuan. Padahal dua pekerjaan lapangan paling sering — menilai
  // kesejajaran mesh dan merekam navgraph — butuh AR menyala TANPA tujuan apa pun.

  // btn-ar: hanya mengurus kamera AR.
  if (btnAr) {
    btnAr.onclick = () => {
      if (adapter.isActive()) adapter.stopSession();
      else void adapter.startSession();   // WAJIB dari gesture user (syarat WebXR)
    };
  }
  // Label & warna diturunkan dari keadaan sesi yang sebenarnya, bukan ditebak saat diklik —
  // sesi juga bisa berakhir sendiri (tombol back, focus loss), dan tombol harus ikut jujur.
  function syncArButton(aktif) {
    if (!btnAr) return;
    btnAr.textContent = aktif ? "HENTIKAN AR" : "MULAI AR";
    btnAr.classList.toggle("aktif", aktif);
  }

  // poiSelect: hanya mengurus tujuan. Bisa diganti kapan saja tanpa mematikan AR;
  // pilih opsi kosong untuk berhenti menavigasi tapi tetap di dalam sesi AR.
  if (poiSelect) {
    poiSelect.onchange = () => {
      activeWaypointsMap = []; currentWaypointIndex = 0;   // tujuan berubah → hitung ulang rute
      destination = null;
      destMarker.visible = false;
      floorTrailGroup.visible = false;

      activePoi = allPois.find((p) => p.id === poiSelect.value) ?? null;
      if (!activePoi) {
        state.nav = "Tanpa tujuan — AR jalan untuk diagnostik/rekam.";
      } else {
        state.nav = `Menuju ${activePoi.name} — arahkan kamera untuk lokalisasi...`;
        if (lastWorldFromMap) navigateToActivePoi(lastWorldFromMap);
      }
      draw();
    };
  }

  const toggleDebugMode = document.getElementById("toggle-debug-mode");
  const devButtonsGroup = [];

  // Alat developer masuk ke grid #admin-tools DI DALAM panel. Versi lama memasangnya sebagai
  // tombol melayang `position:fixed` bertumpuk di 24/80/136/…/416 px, sehingga dua tombol
  // terbawah menimpa panel navigasi dan layar penuh tombol tanpa hierarki.
  const adminTools = document.getElementById("admin-tools");
  const mkBtn = (text, bg, fn) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.background = bg;
    b.onclick = fn;
    adminTools?.appendChild(b);
    return b;
  };

  // Slider mesh hanya ditampilkan kalau mesh memang tersedia di sesi ini — kalau tidak, ia
  // jadi sakelar bohong yang tak mengubah apa pun.
  const meshRow = document.getElementById("mesh-row");
  const toggleMesh = document.getElementById("toggle-mesh");
  if (toggleMesh) {
    toggleMesh.checked = meshTampil;
    toggleMesh.onchange = () => setMeshTampil(toggleMesh.checked);
  }

  function updateDebugVisibility() {
    const isDebug = toggleDebugMode ? toggleDebugMode.checked : false;
    allPoiMarkersGroup.visible = isDebug;
    navGraphLinesGroup.visible = isDebug;
    adminTools?.classList.toggle("hidden", !isDebug);
    meshRow?.classList.toggle("hidden", !(isDebug && MESH_TERSEDIA));
  }

  // SET TUJUAN & TUJUAN (MAP) DIHAPUS: sisa eksperimen Milestone 3 yang menjawab "apakah
  // map-anchoring cukup akurat" — pertanyaan yang sudah digantikan navigasi POI + A*.

  mkBtn("RELOCALIZE", "#0088ff", () => {
    state.last = "relocalize…"; draw();
    adapter.localizeFrame().catch((e) => { state.last = `relocalize gagal: ${e?.message ?? e}`; draw(); });
  });

  mkBtn("REKAM POI 📍", "#f97316", () => {
    const here = currentMapPos();   // posisi LIVE — lastMapPos basi hingga ~10 dtk
    if (!here) {
      state.nav = "Belum ada localize — arahkan kamera ke sekeliling dulu.";
      draw(); return;
    }
    const mapCode = [...state.seen][0] ?? "MAP_???";
    const snippet = JSON.stringify({
      id: "",
      name: "",
      floor: floorOf(here.y),
      mapCode,
      position: {
        x: parseFloat(here.x.toFixed(2)),
        y: parseFloat(here.y.toFixed(2)),
        z: parseFloat(here.z.toFixed(2)),
      },
    }, null, 2);
    state.nav = `📍 REKAM POI (copy ke pois.json):\n${snippet}`;
    draw();
  });

  // --- PEREKAM NAVGRAPH: berjalan = menggambar graf ---
  // Tiap tap menyimpan posisi map saat ini sebagai node DAN menyambungkannya ke node
  // sebelumnya. Jadi urutan langkahmu menyusuri koridor langsung menjadi topologi graf;
  // tikungan direkam dengan berhenti dan menekan tombol di setiap belokan.
  const rec = { nodes: [], edges: [] };

  // Sambungkan ke node terdekat yang SUDAH ada (untuk menutup persimpangan/loop) alih-alih
  // membuat node baru, kalau kita berdiri hampir di tempat yang sama.
  const SNAP_M = 1.5;

  mkBtn("REKAM NODE ⛓️", "#14b8a6", () => {
    const here = currentMapPos();   // posisi LIVE, bukan lastMapPos yang basi ~10 dtk
    if (!here) { state.nav = "Belum ada localize — arahkan kamera ke sekeliling dulu."; draw(); return; }
    const p = {
      x: parseFloat(here.x.toFixed(2)),
      y: parseFloat(here.y.toFixed(2)),
      z: parseFloat(here.z.toFixed(2)),
    };
    const near = rec.nodes.find((n) => dist3(n.position, p) <= SNAP_M);
    const node = near ?? {
      id: `N_LT${floorOf(p.y)}_${String(rec.nodes.length + 1).padStart(2, "0")}`,
      name: "",
      floor: floorOf(p.y),
      position: p,
    };
    if (!near) rec.nodes.push(node);

    const prev = rec.lastId;
    if (prev && prev !== node.id &&
        !rec.edges.some((e) => (e.from === prev && e.to === node.id) || (e.from === node.id && e.to === prev))) {
      rec.edges.push({ from: prev, to: node.id });
    }
    rec.lastId = node.id;

    state.nav = `⛓️ ${node.id}${near ? " (nyambung ke node lama)" : ""}\n` +
                `total: ${rec.nodes.length} node, ${rec.edges.length} edge\n` +
                `Lanjut jalan & tap tiap tikungan. Tekan PUTUS RANTAI untuk mulai cabang baru.`;
    draw();
  });

  mkBtn("PUTUS RANTAI ✂️", "#64748b", () => {
    rec.lastId = null;   // tap berikutnya memulai cabang baru, tak menyambung ke node terakhir
    state.nav = `✂️ rantai diputus — tap berikutnya jadi awal cabang baru.\n` +
                `total: ${rec.nodes.length} node, ${rec.edges.length} edge`;
    draw();
  });

  mkBtn("EXPORT NAVGRAPH 💾", "#e11d48", async () => {
    if (rec.nodes.length === 0) { state.nav = "Belum ada node direkam."; draw(); return; }
    // distance TIDAK diekspor — diturunkan saat loadNavGraph (ADR-021).
    const json = JSON.stringify({ nodes: rec.nodes, edges: rec.edges }, null, 2);
    let msg = `💾 ${rec.nodes.length} node, ${rec.edges.length} edge`;
    try {
      await navigator.clipboard.writeText(json);
      msg += " — TERSALIN ke clipboard. Tempel ke public/data/navgraph.json.";
    } catch {
      msg += " — clipboard ditolak, salin manual dari bawah:\n" + json;
    }
    state.nav = msg;
    draw();
  });

  // SELESAI ✓ BUKAN alat admin — ia satu-satunya jalan kembali ke MyRSIy lewat deep link.
  // Sebelumnya dibuat lewat mkBtn sehingga hanya muncul saat Mode Admin menyala, artinya di
  // produksi pengguna tidak punya cara keluar sama sekali. Kini tombol tetap di panel.
  const btnDone = document.getElementById("btn-done");
  if (btnDone) {
    btnDone.onclick = () => {
      const arrived = state.nav.includes("SAMPAI");
      if (adapter.isActive()) adapter.stopSession();
      returnToApp({ arrived: String(arrived) });
    };
  }

  // Hubungkan event listener Slider Switch Mode Admin
  if (toggleDebugMode) {
    toggleDebugMode.checked = IS_ADMIN;
    toggleDebugMode.onchange = updateDebugVisibility;
    updateDebugVisibility();
  }

  draw();
}

draw();
main().catch((e) => fail(e.message));
