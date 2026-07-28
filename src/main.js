// Milestone 3: NAVIGASI KASAR — uji "cukup gak buat nyampe ruangan".
// Fokus produk: app KECIL (WebXR, tanpa Unity 365MB) + update tanpa Play Store. Presisi AR
// BUKAN tujuan — cukup: tahu lantai (pos.Y) + panah arah + jarak + "sampai". Kalau navigasi
// kasar map-anchored sudah memandu orang ke ruangan meski tilt → web MENANG (kecil+updatable).
//   - TUJUAN (MAP): rekam tujuan dalam KOORDINAT MAP (dari localize terakhir), di-re-anchor
//     tiap localize via worldFromMap → INI yang menguji apakah map-anchoring cukup akurat.
//   - SET TUJUAN (world): drop-pin ARCore (map-independent) — pembanding.
// showMesh:false — mesh cuma diagnostik; produk tak merender mesh.

import * as THREE from "three";
import { MultisetClient, XRSessionManager } from "@multisetai/vps/core";
import { ThreeAdapter } from "@multisetai/vps/three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

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

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 1000);

  let lastMapPos = null;   // posisi map-space localize terakhir (untuk merekam tujuan MAP)

  const session = new XRSessionManager(renderer.getContext(), {
    client,
    overlayRoot: document.body,       // HUD ikut tampil saat AR
    referenceSpaceType: "local",      // 'local' dijamin didukung oleh semua perangkat WebXR
    autoLocalize: true,
    poseTimeoutMs: 20000,             // 20s grace period untuk ARCore warm-up di awal sesi (ADR-W005)
    relocalization: true,             // auto re-localize saat tracking pulih dari loss (mis. keluar tangga)
    backgroundLocalization: true,
    bgLocalizationInterval: 10,       // 10s (min) — auto-relocalize lebih sering → pulih cepat dari drift/pose-loss
    confidenceCheck: true, confidenceThreshold: 0.5,   // threshold seimbang untuk indoor
    onSessionStart: () => { renderer.domElement.style.display = "none"; state.session = "AKTIF"; draw(); },
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

        // KOREKSI MESH SDK: Urutkan mapCodes berdasarkan elevasi Y real-time.
        // Y >= 1.5m = Lantai 2 (MAP_MW1QTZWG1TLG di index 0)
        // Y <  1.5m = Lantai 1 (MAP_BCADVLIXFSJE di index 0)
        // Dengan ini ThreeAdapter akan memuat mesh GLTF lantai yang BENAR (bukan tertukar).
        const isFloor2 = p.y >= 1.5;
        d.mapCodes = isFloor2 ? ["MAP_MW1QTZWG1TLG", "MAP_BCADVLIXFSJE"] : ["MAP_BCADVLIXFSJE", "MAP_MW1QTZWG1TLG"];
      }
      const codes = (d.mapCodes || []).join(",");
      if (codes) state.seen.add(codes);
      state.last = `poseFound=${d.poseFound}  conf=${d.confidence?.toFixed(3)}  rt=${d.responseTime ?? "?"}ms  mapCodes=[${codes}]`;
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

  // Group pembungkus panah 3D (3D GLTF model dengan fallback ArrowHelper)
  const arrowGroup = new THREE.Group();
  arrowGroup.visible = false;
  scene.add(arrowGroup);

  const fallbackArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 0.4, 0x00ff88, 0.15, 0.09);
  arrowGroup.add(fallbackArrow);

  const gltfLoader = new GLTFLoader();
  gltfLoader.load(
    "/models/arrow.gltf",
    (gltf) => {
      const model = gltf.scene;
      // Koreksi orientasi: putar 180 deg (Math.PI) agar ujung panah pas mengarah ke -Z Three.js
      model.rotation.y = Math.PI;

      // Auto-center bounding box model ke tengah-tengah pivot
      const box = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.sub(center);

      const wrapper = new THREE.Group();
      wrapper.add(model);

      // Normalisasi ukuran model panah (panjang/dimensi maks ~0.35 meter)
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const scale = 0.35 / maxDim;
        wrapper.scale.set(scale, scale, scale);
      }
      arrowGroup.remove(fallbackArrow);
      arrowGroup.add(wrapper);
    },
    undefined,
    (err) => console.warn("Gagal memuat 3D model panah /models/arrow.gltf, memakai fallback:", err)
  );

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
    destMarker.position.y = destination.y - 0.7;
    destMarker.visible = true; arrowGroup.visible = true;
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
    const floor = poi.floor ?? (userMapPos.y >= 1.5 ? 2 : 1);
    const startNode = findClosestNode(userMapPos, floor);
    const targetNode = findClosestNode(poi.position, floor);

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

  // --- POI navigation: transform koordinat map-space POI ke world-space ---
  function anchorPoiDest(poi, worldFromMap) {
    if (lastMapPos && activeWaypointsMap.length === 0) {
      calculateRouteToPoi(poi, lastMapPos);
    }
    if (activeWaypointsMap.length > 0 && lastWorldFromMap) {
      const activeWaypointMap = activeWaypointsMap[currentWaypointIndex] || activeWaypointsMap[activeWaypointsMap.length - 1];
      destination = activeWaypointMap.clone().applyMatrix4(worldFromMap);
    } else {
      const mapPos = new THREE.Vector3(poi.position.x, poi.position.y, poi.position.z);
      destination = mapPos.applyMatrix4(worldFromMap);
    }
    // Set penanda pilar di lokasi POI akhir
    const finalPoiPos = new THREE.Vector3(poi.position.x, poi.position.y, poi.position.z).applyMatrix4(worldFromMap);
    destMarker.position.copy(finalPoiPos);
    destMarker.position.y = finalPoiPos.y - 0.7;
    destMarker.visible = true;
    arrowGroup.visible = true;
  }

  const adapter = new ThreeAdapter({
    session, renderer, scene, camera,
    showMesh: false, // PRODUK: kamera dunia nyata aktif jernih; mesh 3D diagnostik tidak dirender
    onXRFrame: () => {                            // dipanggil tiap frame, camera SUDAH ter-sync
      if (!destination) return;
      // WAJIB getWorldPosition — camera.position (lokal) BASI di WebXR, isinya ~origin sesi.
      const user = new THREE.Vector3(); camera.getWorldPosition(user);
      const flat = destination.clone(); flat.y = user.y;   // jarak horizontal
      const dist = user.distanceTo(flat);

      // Sekuensial Waypoint Advancement: jika mendekati waypoint aktif (< 1.2m), beralih ke waypoint berikutnya
      if (activeWaypointsMap.length > 0 && currentWaypointIndex < activeWaypointsMap.length - 1) {
        if (dist < 1.2 && lastWorldFromMap) {
          currentWaypointIndex++;
          const nextWaypointMap = activeWaypointsMap[currentWaypointIndex];
          destination = nextWaypointMap.clone().applyMatrix4(lastWorldFromMap);
        }
      }

      const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);   // arah pandang (-Z world)
      // Panah melayang 0.7m di depan pandangan HP & 0.15m di bawah mata untuk efek HUD AR natural
      arrowGroup.position.copy(user).addScaledVector(fwd, 0.7);
      arrowGroup.position.y -= 0.15;

      const dir = flat.clone().sub(arrowGroup.position); dir.y = 0;
      if (dir.lengthSq() > 1e-4) {
        dir.normalize();
        const targetPos = arrowGroup.position.clone().add(dir);
        arrowGroup.lookAt(targetPos);
      }
      const arrivedLabel = activePoi ? `✓ SAMPAI di ${activePoi.name}` : "✓ SAMPAI di tujuan";
      const navLabel = activePoi ? activePoi.name : "tujuan";
      state.nav = dist < 1.2 && currentWaypointIndex >= activeWaypointsMap.length - 1 
        ? arrivedLabel 
        : `jarak ${dist.toFixed(1)} m → ikuti panah ke ${navLabel}`;
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
      lastWorldFromMap = worldFromMap;
      if (activePoi) {
        if (lastMapPos) calculateRouteToPoi(activePoi, lastMapPos);
        anchorPoiDest(activePoi, worldFromMap);  // POI mode: re-anchor & update route tiap localize
      } else if (destMap) anchorDest();          // Developer mode: re-anchor destMap
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

      if (lastWorldFromMap) {
        anchorPoiDest(activePoi, lastWorldFromMap);
      }
      draw();
    };
  }

  if (btnStopNav) {
    btnStopNav.onclick = () => {
      activePoi = null;
      destMap = null;
      destination = null;
      destMarker.visible = false;
      arrowGroup.visible = false;

      state.nav = "Navigasi dihentikan. Pilih tujuan di bawah.";
      panelActive?.classList.add("hidden");
      panelStandby?.classList.remove("hidden");
      draw();
    };
  }

  const mkBtn = (text, bg, fg, bottom, fn) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = `position:fixed;left:16px;bottom:${bottom}px;z-index:20;` +
      `padding:11px 16px;font:600 14px system-ui;color:${fg};background:${bg};border:0;border-radius:8px;`;
    b.onclick = fn;
    document.body.appendChild(b);
  };

  // Tombol developer hanya muncul jika bukan POI mode (atau POI tidak ditemukan)
  if (!poiMode || !activePoi) {
    // SET TUJUAN — drop-pin world (ARCore, map-independent) — pembanding
    mkBtn("SET TUJUAN", "#ffcc00", "#000", 24, () => {
      destMap = null;
      const wp = new THREE.Vector3(); camera.getWorldPosition(wp);
      destination = wp.clone();
      destMarker.position.copy(wp);
      destMarker.position.y = wp.y - 0.7;
      destMarker.visible = true; arrowGroup.visible = true;
      state.nav = "tujuan(world) diset — menjauh lalu kembali";
      draw();
    });

    // TUJUAN (MAP) — UJI INTI: rekam posisi map-space SEKARANG sbg tujuan
    mkBtn("TUJUAN (MAP)", "#a855f7", "#fff", 192, () => {
      if (!lastMapPos) { state.nav = "belum ada localize — arahkan sampai poseFound dulu"; draw(); return; }
      destMap = lastMapPos.clone();
      anchorDest();
      state.nav = "tujuan(MAP) diset — menjauh, cek panah balik ke titik benar?";
      draw();
    });

    // RELOCALIZE — picu localize manual
    mkBtn("RELOCALIZE", "#0088ff", "#fff", 80, () => {
      state.last = "relocalize…"; draw();
      adapter.localizeFrame().catch((e) => { state.last = `relocalize gagal: ${e?.message ?? e}`; draw(); });
    });
  }

  // REKAM POI — selalu ada (alat pengisian data lapangan)
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

  // SELESAI — akhiri sesi XR lalu balik ke Flutter via intent://
  mkBtn("SELESAI ✓", "#22c55e", "#fff", (poiMode && activePoi) ? 24 : 248, () => {
    const arrived = state.nav.includes("SAMPAI");
    if (session.isActive()) session.stopSession();
    returnToApp({ arrived: String(arrived) });
  });

  draw();
}

draw();
main().catch((e) => fail(e.message));
