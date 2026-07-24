# Kontrak Deep-Link: WebXR (Chrome Custom Tab) → CopyCat (Flutter)

Menutup unknown §8 #2. Halaman AR jalan di **Chrome Custom Tab** (WebXR wajib Chrome asli,
bukan WebView — ADR-002-C), jadi bridge WebView langsung yang lama **tidak tersedia**;
kembali ke app pakai deep-link. Ini pola matang (identik OAuth redirect-via-Custom-Tab).

## Kontrak

| Bagian | Nilai |
|---|---|
| Scheme | `myrsiy` |
| Host/path | `ar-done` |
| Package (Android) | `com.rsislam.surabaya.rs_islam_app` |
| Query | `arrived=true\|false` (opsional nanti: `poiId`) |

**URL yang dikirim WebXR** (via `intent://`, bukan bare scheme — lebih andal di Chrome Android):
```
intent://ar-done?arrived=true#Intent;scheme=myrsiy;package=com.rsislam.surabaya.rs_islam_app;end
```

## Setengah-WebXR — SUDAH (repo ini)

`src/main.js`: konstanta `RETURN` + `returnToApp()`; tombol **SELESAI ✓** →
`session.stopSession()` (sinkron, lepas kamera) → `returnToApp({arrived})`.

**Dua aturan keras (riset):**
1. **Harus dipicu tap user.** Chrome membuang navigasi ke skema eksternal yang bukan dari
   gesture — jadi JANGAN auto-redirect sesudah `sessionend`/`setTimeout`. Tombol = benar.
2. **Pakai `intent://`**, bukan `window.location = "myrsiy://…"` (sering di-drop di Chrome).

## Setengah-Flutter — RECEIVER SUDAH (repo CopyCat `My-eRSIy-CopyCat-`)

Penerima deep-link terpasang, **additif** — tak menyentuh launch Unity yang sudah jalan:
1. `pubspec.yaml`: **`app_links: ^6.3.0`**.
2. `android/app/src/main/AndroidManifest.xml`: intent-filter `VIEW` (`myrsiy`/`ar-done`)
   di `MainActivity` (singleTop → datang via `onNewIntent` saat app hidup di balik tab).
3. `lib/features/darsi/darsi_navigation_screen.dart`: `_appLinks.uriLinkStream.listen(_onDeepLink)`
   → `_onDeepLink` panggil **`window.onARSessionClosed(payload)`** yang SAMA dgn jalur Unity
   (`ArSessionResume.tsx` / `lib/bridge.ts` di Next.js). Warm-stream cukup (Custom Tab di atas
   layar hidup; tak ada cold-start). Verifikasi: `flutter analyze` bersih.

### BELUM: peluncuran AR via Custom Tab
Launch masih ke Unity (`MethodChannel('darsi/unity').launchAr`). Menggantinya dgn
`flutter_custom_tabs` ke `https://darsi-webxr…/ar?poiId=…` **ditunda sengaja** — Unity masih
runtime AR produk (keputusan "WebXR ganti Unity" belum final: blocker §3.5 + tanya dosen).
Merobek launch Unity sekarang = merusak flow yang sudah teruji lapangan. Additif dulu.

## Uji terpisah (tanpa perlu launch Custom Tab)

Receiver bisa diuji sendiri via adb — buktikan resume terpanggil tanpa halaman WebXR:
```bash
adb shell am start -a android.intent.action.VIEW \
  -d "myrsiy://ar-done?arrived=true" com.rsislam.surabaya.rs_islam_app
```
Buka layar DARSI dulu (WebView aktif) → jalankan perintah → `window.onARSessionClosed({"arrived":"true"})`
terpanggil di WebView. End-to-end penuh (tap SELESAI di tab → balik) butuh launch Custom Tab (di atas).
