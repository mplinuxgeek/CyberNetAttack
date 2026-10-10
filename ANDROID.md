# Android build (Capacitor)

The game is plain HTML/JS, so Capacitor just wraps it. One-time setup (needs Node and Android Studio):

```
npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/android
mkdir -p www && cp -r index.html game.js sw.js manifest.webmanifest assets www/
npx cap add android
npx cap sync android
npx cap open android        # build / run from Android Studio
```
After editing the game, re-copy the files into `www/` and `npx cap sync`. Settings to check in Android Studio: portrait orientation,
fullscreen / immersive mode, and `android:hardwareAccelerated="true"` (the default). Vibration, audio and touch already work in the WebView.
It also installs as a PWA straight from Chrome ("Add to Home screen") thanks to `manifest.webmanifest` and `sw.js`.
