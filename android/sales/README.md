# MW Sales — Android app for the field sales team

A small Android app that opens the Sales app, <https://mithaiwallah.shop/sales>, full screen in Chrome
(a Trusted Web Activity): dashboard, shops, ADD NEW B2B CUSTOMER, CREATE CUSTOMER ORDER, orders and
products. All screens come from the website, so website updates reach the app straight away; a new app
build is only needed to change the icon, name, colours or start address.

- Package: `shop.mithaiwallah.sales`
- Needs Android 7.0 or newer and Chrome (current Chrome needs Android 10+).
- Salespeople sign in with their own email at `/sales/login`; new people apply at `/sales/register`.
- Download: <https://mithaiwallah.shop/downloads/mw-sales.apk> (linked from the Sales sign-in page and
  the Sales app menu).

Signing uses its **own key** (not the MW Ops key), shared with MW Wholesale. Its SHA-256 fingerprint is:

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
