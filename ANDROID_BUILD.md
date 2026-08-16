# GeniusFiles — Android build pipeline

Base de compilation Android professionnelle, reproductible et prête pour
la CI/CD. Aucune modification de l'interface web existante.

## Stack

- **Capacitor 8** (wrapper natif) — packages `@capacitor/core`, `@capacitor/android`,
  `@capacitor/filesystem`, `@capacitor/preferences`, `@capacitor/app`,
  `@capacitor/status-bar`, `@capacitor/splash-screen`.
- **GitHub Actions** (`.github/workflows/android-build.yml`) — build automatique
  APK + AAB à chaque push / tag / dispatch manuel.
- **Java 21 + Android SDK 35** — cible moderne, stable long terme.

## Génération locale (facultatif)

```bash
bun install
node scripts/build-mobile.mjs        # produit dist-mobile/
npx cap add android                  # à faire une seule fois
node scripts/apply-android-overrides.mjs
cd android && ./gradlew assembleDebug bundleDebug
```

Artefacts :

- `android/app/build/outputs/apk/debug/app-debug.apk`
- `android/app/build/outputs/bundle/debug/app-debug.aab`

## Génération via CI

Push sur `main` ou tag `v*.*.*` → GitHub Actions déclenche :

1. **Job `validate`** : lint, build web SSR, build mobile SPA.
2. **Job `android`** : init plateforme, sync, application des overrides,
   `gradlew assembleDebug` et `bundleDebug`.
3. Artefacts uploadés : `geniusfiles-debug-apk`, `geniusfiles-debug-aab`.
4. Sur un tag `v*.*.*`, les fichiers sont automatiquement attachés à la
   GitHub Release.

Le job `validate` échoue tôt si le build web casse — évite de dépenser des
minutes CI sur un projet cassé.

## Passer à un build signé release

Actuellement : debug uniquement. Pour activer la signature release :

1. Générer une keystore :
   ```bash
   keytool -genkey -v -keystore geniusfiles-release.jks \
     -alias geniusfiles -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Encoder en base64 : `base64 -w0 geniusfiles-release.jks | pbcopy`.
3. Ajouter les secrets GitHub (Settings → Secrets → Actions) :
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
   - `ANDROID_STORE_PASSWORD`
4. Dans le workflow, passer `BUILD_RELEASE: "true"` et ajouter les steps
   `decode keystore` + `bundleRelease`/`assembleRelease`. Les emplacements
   sont préparés dans `android-build.yml`.

## Permissions déclarées

Défini dans `android-overrides/app/src/main/AndroidManifest.xml` :

| Permission                                 | Quand                             | Pourquoi                                                 |
| ------------------------------------------ | --------------------------------- | -------------------------------------------------------- |
| `MANAGE_EXTERNAL_STORAGE`                  | Onboarding, sur demande explicite | Cœur d'un gestionnaire de fichiers moderne (Android 11+) |
| `READ_MEDIA_IMAGES/VIDEO/AUDIO`            | À la demande (galerie)            | Android 13+ granulaire                                   |
| `READ/WRITE_EXTERNAL_STORAGE`              | Auto (maxSdk 32/29)               | Compatibilité Android ≤ 10                               |
| `FOREGROUND_SERVICE`, `POST_NOTIFICATIONS` | À la demande (copies longues)     | Opérations en arrière-plan                               |

Aucune permission réseau, caméra, micro ou localisation.

## Détection runtime

Le code frontend utilise `src/lib/native/platform.ts` et
`src/lib/native/storage-permission.ts` pour rester **strictement isomorphe** :

- Sur le web (Lovable preview / SSR) : ces helpers retournent `"unavailable"`
  et ne font rien — aucune régression visible.
- Dans l'APK : ils délèguent au bridge Capacitor.

Un plugin Capacitor natif custom exposant `StoragePermission.check()` /
`openSettings()` sera à ajouter sous `android-overrides/` lors de la
première génération d'APK réussie (fondations JS déjà en place).

## Publicités (Google Mobile Ads — GMA Next-Gen SDK)

- ID d'application AdMob : `ca-app-pub-4007496300800778~9248149643`
  (déclaré dans `AndroidManifest.xml` via `com.google.android.gms.ads.APPLICATION_ID`).
- Dépendance injectée par `apply-android-overrides.mjs` :
  `com.google.android.libraries.ads.mobile.sdk:ads-mobile-sdk:1.3.1`,
  avec `minSdk >= 24` / `compileSdk >= 35` forcés dans `variables.gradle`.
- Initialisation en arrière-plan dès `GeniusFilesApplication.onCreate()`
  (évite tout ANR au démarrage).
- Pont WebView : plugin natif `GeniusFilesAds` + `src/lib/native/ads.ts`
  (`initializeAds`, `showBannerAd`, `hideBannerAd`) — no-op sur le web.
- Bannière adaptative ancrée en bas d'écran. Par défaut le **bloc de test**
  `ca-app-pub-3940256099942544/9214589741` est utilisé : le remplacer par le
  bloc réel avant publication.

## Fichiers ajoutés

```
capacitor.config.ts
scripts/build-mobile.mjs
scripts/apply-android-overrides.mjs
android-overrides/app/src/main/AndroidManifest.xml
android-overrides/app/src/main/res/xml/file_paths.xml
.github/workflows/android-build.yml
src/lib/native/platform.ts
src/lib/native/storage-permission.ts
ANDROID_BUILD.md
```

`android/` est généré à la volée par la CI (`npx cap add android`) et ne
doit pas être commité.
