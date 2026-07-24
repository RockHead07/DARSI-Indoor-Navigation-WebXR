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

## Setengah-Flutter — BELUM (repo CopyCat `My-eRSIy-CopyCat-`)

Saat dikerjakan (spike-sized):
1. `pubspec.yaml`: tambah **`app_links`** (penerima) + **`flutter_custom_tabs`** (peluncur AR).
2. `android/app/src/main/AndroidManifest.xml`: intent-filter di `MainActivity`:
   ```xml
   <intent-filter android:autoVerify="false">
     <action android:name="android.intent.action.VIEW"/>
     <category android:name="android.intent.category.DEFAULT"/>
     <category android:name="android.intent.category.BROWSABLE"/>
     <data android:scheme="myrsiy" android:host="ar-done"/>
   </intent-filter>
   ```
3. Dart: `AppLinks().uriLinkStream.listen(...)` → parse `arrived` → resume UI 2D
   (mis. panggil `window.onARSessionClosed(payload)` di WebView, sejajar jalur UaaL lama
   `ArSessionResume.tsx` / `lib/bridge.ts`).
4. Peluncuran AR: ganti `MethodChannel('darsi/unity').launchAr` → buka Custom Tab ke
   `https://darsi-webxr…/ar?poiId=…` via `flutter_custom_tabs`.

> Verifikasi end-to-end baru bisa setelah setengah-Flutter ada (skema diterima app).
> Sampai itu, setengah-WebXR bisa dicek terpisah: tombol SELESAI mengeset `window.location`
> ke URL `intent://` yang benar (lihat contoh di atas).
