# Progress: 2026-07-30-occlusion

Base sebelum Task 1: 855673c
Pre-flight: 2 konflik diputuskan pemilik — clipPathToHorizon pindah ke src/horizon.js; akses adapter.world diterima (bukan temuan review).

Task 1: complete (commits 2e10a35..471bede, review clean setelah 1 fix Important: komentar mapsetDiagnostic menggantung)
Task 2: complete (commits 471bede..ec1e9a5, review clean setelah 1 fix Important: komentar basi "produksi tanpa mesh")
Task 3: DIBLOKIR gerbang lapangan — pemilik harus menguji ?mesh=true di Lt 1 DAN Lt 2 di Jemursari sebelum occluder boleh dipasang.
Task 4: complete (commits ec1e9a5..d3f434b, review clean, 0 Critical/Important)
  Minor terbuka: (1) kasus segmen panjang-nol (dua titik identik berurutan) tak diuji di tools/check-horizon.mjs; (2) clipPathToHorizon mengembalikan titik yang BERALIAS ke objek input, bukan salinan — aman selama pemanggil tidak memutasi titik hasil.
