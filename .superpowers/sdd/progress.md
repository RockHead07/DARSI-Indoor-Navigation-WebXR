# Progress: 2026-07-30-occlusion

Base sebelum Task 1: 855673c
Pre-flight: 2 konflik diputuskan pemilik — clipPathToHorizon pindah ke src/horizon.js; akses adapter.world diterima (bukan temuan review).

Task 1: complete (commits 2e10a35..471bede, review clean setelah 1 fix Important: komentar mapsetDiagnostic menggantung)
Task 2: complete (commits 471bede..ec1e9a5, review clean setelah 1 fix Important: komentar basi "produksi tanpa mesh")
Task 3: DIBLOKIR gerbang lapangan — pemilik harus menguji ?mesh=true di Lt 1 DAN Lt 2 di Jemursari sebelum occluder boleh dipasang.
Task 4: complete (commits ec1e9a5..d3f434b, review clean, 0 Critical/Important)
  Minor terbuka: (1) kasus segmen panjang-nol (dua titik identik berurutan) tak diuji di tools/check-horizon.mjs; (2) clipPathToHorizon mengembalikan titik yang BERALIAS ke objek input, bukan salinan — aman selama pemanggil tidak memutasi titik hasil.
Task 5: complete (commits d3f434b..1d2d5a1, review clean setelah 1 fix Critical + 1 Important)
  Critical: clipPathToHorizon kembalikan objek polos -> p2.clone() melempar tiap frame di rute >8m. Diperbaiki dgn normalisasi Vector3 di pemanggil.
  Important: ramp peredupan terbalik (terjauh paling besar). Diperbaiki.
Task 6: complete (commits 1d2d5a1..e01fb6a, docs jujur: occluder ditandai MENUNGGU, bukan selesai)
Task 3: MASIH DIBLOKIR gerbang lapangan.
Final review (opus, whole-branch): 1 Critical + 2 Important + 6 Minor. Semua Critical/Important diperbaiki di aa57926.
  Critical: patchMeshChildren memanggil adapter.world.getMeshGroup() yang TIDAK ADA (metode itu milik MeshVisualizer, bukan World). Optional chaining -> no-op diam-diam. Koreksi relativePose tak pernah jalan. Diganti scene.getObjectByName(_id) + penghitung di HUD.
  Important: gerbang pilar memakai jarak ke waypoint A*, bukan ke pilar.
  Important: docs masih bilang produksi tanpa mesh.
  Minor sisa (belum dikerjakan, dicatat): (4) SET TUJUAN/TUJUAN MAP terhalang gerbang pilar >12m, workaround ?pilar=999; (5) shader reveal SDK pakai uCenter basi setelah anak digeser, kosmetik; (6) mesh kedua lantai menumpuk di scene, relevan saat occluder dipasang.
STATUS: Task 1,2,4,5,6 selesai. Task 3 (occluder) MENUNGGU gerbang lapangan.
