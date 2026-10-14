# MW Wholesale — Android app for sweet shops (B2B)

A small Android app that opens the Wholesale app, <https://mithaiwallah.shop/trade>, full screen in
Chrome (a Trusted Web Activity): catalogue at the shop's own prices, quick order, orders and tracking,
invoices and statement. Website updates reach the app straight away; a new build is only needed to
change the icon, name, colours or start address.

- Package: `shop.mithaiwallah.wholesale` (permanent once published on Google Play)
- Needs Android 7.0 or newer and Chrome (current Chrome needs Android 10+).
- Links to `/trade` and `/b2b` open in the app.
- Download: <https://mithaiwallah.shop/downloads/mw-wholesale.apk> (linked from the Wholesale sign-in
  page and the wholesale page on the website). Shops should get it from Google Play once it is
  published there.

Signing uses its **own key** (not the MW Ops key), shared with MW Sales. Its SHA-256 fingerprint is:

```
48:D4:1C:65:39:9E:DB:E4:E5:BC:7F:56:DA:B4:86:D4:9C:90:38:CF:D1:7B:1E:AF:8D:87:2B:B9:27:3D:6E:30
```

The key file and password are not in this repository; keep them safe, because every update must be
signed with the same key. For automatic signed builds add the repository secrets
`MW_B2B_KEYSTORE_BASE64`, `MW_B2B_KEYSTORE_PASSWORD`, `MW_B2B_KEY_ALIAS` (`mwb2b`) and
`MW_B2B_KEY_PASSWORD`. Building, Play App Signing and the rest work as described in
[`../ops/README.md`](../ops/README.md). The site confirms this app in
`public/.well-known/assetlinks.json`. For each new version, raise `versionCode` and `versionName` in
`app/build.gradle`.
