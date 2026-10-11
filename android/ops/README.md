# MW Ops — Android app

A small Android app that opens the staff app, <https://mithaiwallah.shop/ops/today>, full screen in
Chrome (a Trusted Web Activity). All screens come from the website, so website updates reach the app
straight away; a new app build is only needed to change the icon, name, colours or start address.

- Package: `shop.mithaiwallah.ops`
- Needs Android 7.0 or newer and Chrome (current Chrome needs Android 10+).
- Staff download: <https://mithaiwallah.shop/downloads/mw-ops.apk> (also linked in the app's More menu).

## Full screen (no address bar)

Chrome only hides the address bar when the website lists the app's signing certificate in
`public/.well-known/assetlinks.json`. If you publish on Google Play with Play App Signing, add the
**app signing key** SHA-256 fingerprint from Play Console (Setup → App signing) to that list too.

## Signing key

The release signing key is **not** in this repository and must never be committed. Keep the key file
and its password somewhere safe: every update must be signed with the same key, or phones will refuse
to install it over the old version. Its SHA-256 fingerprint is:

```
92:2D:71:D0:D8:19:77:DD:BC:0F:39:D8:D0:25:20:A5:9D:22:28:B8:0B:11:72:D2:1A:F1:A5:20:06:95:A2:32
```

## Building

GitHub Actions builds the app (`.github/workflows/android-ops.yml`) on every change under
`android/ops/`, or from Actions → "Android app (MW Ops)" → Run workflow. The APK and the Play Store
bundle (AAB) appear on the repository's Releases page.

To have the builds signed automatically, add these repository secrets once
(Settings → Secrets and variables → Actions → New repository secret):

| Secret | Value |
| --- | --- |
| `MW_OPS_KEYSTORE_BASE64` | the key file, base64-encoded |
| `MW_OPS_KEYSTORE_PASSWORD` | the key file password |
| `MW_OPS_KEY_ALIAS` | `mwops` |
| `MW_OPS_KEY_PASSWORD` | the same password |

Without them the builds are unsigned and cannot be installed until signed.

For each new version, raise `versionCode` (and `versionName`) in `app/build.gradle`.

Building on a computer instead: install Android Studio (or the Android SDK and JDK 17), then in this
folder run `./gradlew assembleRelease bundleRelease` with `MW_OPS_KEYSTORE`, `MW_OPS_KEYSTORE_PASSWORD`,
`MW_OPS_KEY_ALIAS` and `MW_OPS_KEY_PASSWORD` set in the environment.
