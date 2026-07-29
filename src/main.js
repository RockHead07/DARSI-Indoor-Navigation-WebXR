// DARSI WebXR — navigasi AR indoor map-anchored (POI → A* → panah + chevron di lantai).
// Fokus produk: app KECIL (WebXR, tanpa Unity 365MB) + update tanpa Play Store. Presisi AR
// BUKAN tujuan — cukup: tahu lantai (pos.Y) + panah arah + jarak + "sampai".
//
// Mode:
//   - default              : produk. Kamera bersih, tanpa mesh (ADR-W006).
//   - ?mesh=true           : DIAGNOSTIK. Render mesh gedung VPS — satu-satunya cek AKURASI
//                            yang kita punya (FIELD-TESTS Uji 2). Occlusion dicabut, jadi
//                            di mode ini mesh memang sengaja terlihat.
//   - ?admin=true / debug  : overlay semua POI + graph koridor + tombol developer.
//   - ?poiId=<id>          : langsung navigasi ke POI itu (dipanggil dari WebView).

import * as THREE from "three";
import { MultisetClient, XRSessionManager } from "@multisetai/vps/core";
import { ThreeAdapter } from "@multisetai/vps/three";

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

// Mesh gedung VPS = alat DIAGNOSTIK, bukan fitur produk (ADR-W006). Dibaca sekali saat load
// karena ThreeAdapter membaca showMesh sekali di constructor.
const SHOW_MESH = new URLSearchParams(location.search).has("mesh");

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

async function main() {
  if (!(await ThreeAdapter.isSupported())) {
    return fail("WebXR immersive-ar tidak didukung. Buka di Chrome Android + ARCore.");
  }

  // --- UI Elements ---
  const panelStandby = document.getElementById("panel-standby");
  const panelActive = document.getElementById("panel-active");
  const poiSelect = document.getElementById("poi-select");
  const btnStartNav = document.getElementById("btn-start-nav");
  const btnStopNav = document.getElementById("btn-stop-nav");

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
      panelStandby?.classList.add("hidden");
      panelActive?.classList.remove("hidden");
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
      renderer.domElement.style.display = "none"; state.session = "AKTIF"; draw();
      setTimeout(() => {
        if (!adapter.isActive()) return;             // user keburu menutup sesi
        adapter.localizeFrame().catch((e) => { state.last = `localize awal gagal: ${e?.message ?? e}`; draw(); });
      }, ARCORE_WARMUP_MS);
    },
    onSessionEnd:   () => { renderer.domElement.style.display = "block"; state.session = "berhenti (sesi WebXR diakhiri browser/user)"; draw(); },
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

        // Hanya relevan saat SHOW_MESH: ThreeAdapter memuat mesh dari mapCodes[0], padahal
        // urutan mapCodes = artefak urutan hintMapCodes, BUKAN peringkat kecocokan (ADR-W001).
        // Urutkan ulang pakai elevasi Y supaya mesh lantai yang dimuat benar, bukan tertukar.
        if (SHOW_MESH) {
          d.mapCodes = floorOf(p.y) === 2
            ? ["MAP_MW1QTZWG1TLG", "MAP_BCADVLIXFSJE"]
            : ["MAP_BCADVLIXFSJE", "MAP_MW1QTZWG1TLG"];
        }
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
  let destMap = null;              // tujuan dalam KOORDINAT MAP
  let lastWorldFromMap = null;     // matrix localize terakhir → re-anchor destMap tiap localize
  function anchorDest() {          // map-coord → world via worldFromMap; INILAH uji map-anchoring
    if (!destMap || !lastWorldFromMap) return;
    destination = destMap.clone().applyMatrix4(lastWorldFromMap);
    destMarker.position.copy(destination);
    destMarker.position.y = destination.y - EYE_HEIGHT;
    destMarker.visible = true;
  }

  // --- NAVGRAPH & A* PATHFINDING ENGINE ---
  let navGraph = null;
  let activeWaypointsMap = [];   // Waypoints dalam koordinat MAP
  let currentWaypointIndex = 0;

  async function loadNavGraph() {
    try {
      const res = await fetch("/data/navgraph.json");
      if (!res.ok) return null;
      return await res.json();
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

    if (lastMapPos) calculateRouteToPoi(activePoi, lastMapPos);
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
    const waypointsWorld = [userWorldPos.clone()];
    for (let i = currentWaypointIndex; i < activeWaypointsMap.length; i++) {
      waypointsWorld.push(activeWaypointsMap[i].clone().applyMatrix4(worldFromMap));
    }

    if (waypointsWorld.length < 2) return;

    // Lantai diturunkan dari posisi USER, bukan dari tujuan: user selalu berdiri di lantainya
    // sendiri. (Sebelumnya dipakai waypoint terakhir → menuju POI lantai lain membuat chevron
    // melayang setinggi beda lantai.)
    const floorY = userWorldPos.y - EYE_HEIGHT;

    // Jarak interval antar panah (0.5m)
    const spacing = 0.5;
    const timeOffset = (performance.now() * 0.001 * 0.7) % spacing;

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
      }
    }
    floorTrailGroup.visible = true;
  }

  const adapter = new ThreeAdapter({
    session, renderer, scene, camera,
    showMesh: SHOW_MESH,      // hanya di ?mesh=true — mesh = alat ukur akurasi, bukan fitur (ADR-W006)
    showGizmo: false,         // default SDK true; gizmo bawaannya tak dipakai (kita punya gizmo sendiri)
    useDefaultButton: false,  // Bersihkan UI: pakai tombol navigasi kustom, matikan tombol STOP AR bawaan SDK
    onXRFrame: () => {                            // dipanggil tiap frame, camera SUDAH ter-sync
      if (!destination) return;
      // WAJIB getWorldPosition — camera.position (lokal) BASI di WebXR, isinya ~origin sesi.
      const user = new THREE.Vector3(); camera.getWorldPosition(user);
      const flat = destination.clone(); flat.y = user.y;   // jarak horizontal
      const dist = user.distanceTo(flat);

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
      else if (destMap) anchorDest();                     // Developer mode: re-anchor destMap
      draw();
    },
  });
  adapter.initialize();               // pasang tombol START AR

  // --- Event Listeners UI Navigasi ---
  if (btnStartNav && poiSelect) {
    btnStartNav.onclick = () => {
      const selectedId = poiSelect.value;
      if (!selectedId) {
        state.nav = "Pilih POI tujuan terlebih dahulu!";
        draw();
        return;
      }
      const target = allPois.find((p) => p.id === selectedId);
      if (!target) return;

      activePoi = target;
      state.nav = `Menuju ${activePoi.name} — arahkan kamera untuk lokalisasi...`;
      panelStandby?.classList.add("hidden");
      panelActive?.classList.remove("hidden");

      if (lastWorldFromMap) navigateToActivePoi(lastWorldFromMap);
      draw();

      // Pemicu 1-Tap AR: Mulai sesi WebXR AR jika belum aktif
      if (!adapter.isActive()) {
        void adapter.startSession();
      }
    };
  }

  if (btnStopNav) {
    btnStopNav.onclick = () => {
      activePoi = null;
      destMap = null;
      destination = null;
      destMarker.visible = false;
      floorTrailGroup.visible = false;

      state.nav = "Navigasi dihentikan. Pilih tujuan di bawah.";
      panelActive?.classList.add("hidden");
      panelStandby?.classList.remove("hidden");
      draw();

      // Hentikan sesi WebXR AR jika sedang aktif
      if (adapter.isActive()) {
        adapter.stopSession();
      }
    };
  }

  const toggleDebugMode = document.getElementById("toggle-debug-mode");
  const isAdminUrl = location.search.includes("admin=true") || location.search.includes("debug=true");
  const devButtonsGroup = [];

  const mkBtn = (text, bg, fg, bottom, fn) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = `position:fixed;left:16px;bottom:${bottom}px;z-index:20;` +
      `padding:11px 16px;font:600 14px system-ui;color:${fg};background:${bg};border:0;border-radius:8px;display:none;`;
    b.onclick = fn;
    document.body.appendChild(b);
    devButtonsGroup.push(b);
    return b;
  };

  function updateDebugVisibility() {
    const isDebug = toggleDebugMode ? toggleDebugMode.checked : false;
    allPoiMarkersGroup.visible = isDebug;
    navGraphLinesGroup.visible = isDebug;
    devButtonsGroup.forEach((b) => {
      b.style.display = isDebug ? "block" : "none";
    });
  }

  // Tombol-tombol developer & diagnostik
  mkBtn("SET TUJUAN", "#ffcc00", "#000", 24, () => {
    destMap = null;
    const wp = new THREE.Vector3(); camera.getWorldPosition(wp);
    destination = wp.clone();
    destMarker.position.copy(wp);
    destMarker.position.y = wp.y - EYE_HEIGHT;
    destMarker.visible = true;
    state.nav = "tujuan(world) diset — menjauh lalu kembali";
    draw();
  });

  mkBtn("TUJUAN (MAP)", "#a855f7", "#fff", 192, () => {
    if (!lastMapPos) { state.nav = "belum ada localize — arahkan sampai poseFound dulu"; draw(); return; }
    destMap = lastMapPos.clone();
    anchorDest();
    state.nav = "tujuan(MAP) diset — menjauh, cek panah balik ke titik benar?";
    draw();
  });

  mkBtn("RELOCALIZE", "#0088ff", "#fff", 80, () => {
    state.last = "relocalize…"; draw();
    adapter.localizeFrame().catch((e) => { state.last = `relocalize gagal: ${e?.message ?? e}`; draw(); });
  });

  mkBtn("REKAM POI 📍", "#f97316", "#fff", 136, () => {
    if (!lastMapPos) {
      state.nav = "Belum ada pose — arahkan kamera ke sekeliling dulu.";
      draw(); return;
    }
    const isFloor2 = lastMapPos.y >= 1.5;
    const floor = isFloor2 ? 2 : 1;
    const mapCode = [...state.seen][0] ?? "MAP_???";
    const snippet = JSON.stringify({
      id: "",
      name: "",
      floor,
      mapCode,
      position: {
        x: parseFloat(lastMapPos.x.toFixed(2)),
        y: parseFloat(lastMapPos.y.toFixed(2)),
        z: parseFloat(lastMapPos.z.toFixed(2)),
      },
    }, null, 2);
    state.nav = `📍 REKAM POI (copy ke pois.json):\n${snippet}`;
    draw();
  });

  mkBtn("SELESAI ✓", "#22c55e", "#fff", 248, () => {
    const arrived = state.nav.includes("SAMPAI");
    if (session.isActive()) session.stopSession();
    returnToApp({ arrived: String(arrived) });
  });

  // Hubungkan event listener Slider Switch Mode Admin
  if (toggleDebugMode) {
    toggleDebugMode.checked = isAdminUrl;
    toggleDebugMode.onchange = updateDebugVisibility;
    updateDebugVisibility();
  }

  draw();
}

draw();
main().catch((e) => fail(e.message));
