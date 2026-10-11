# Mithai Wallah — customer Android app

A small Android app that opens the customer website, <https://mithaiwallah.shop>, full screen in
Chrome (a Trusted Web Activity): the shop, cart and checkout, account, orders and My milk. Website
updates reach the app straight away; a new build is only needed to change the icon, name, colours,
start address or shortcuts.

- Package: `shop.mithaiwallah.app` (permanent once published on Google Play)
- Needs Android 7.0 or newer and Chrome (current Chrome needs Android 10+).
- Long-press the icon for **My milk** and **Shop sweets**.
- Links to the shop and account pages open in the app; staff links (`/ops`) are left to MW Ops.
- Test download: <https://mithaiwallah.shop/downloads/mithai-wallah.apk>. Customers should get it
  from Google Play once it is published there.

Building, signing (the same key as MW Ops), the GitHub secrets and Play App Signing work exactly as
described in [`../ops/README.md`](../ops/README.md). The site confirms this app in
`public/.well-known/assetlinks.json`. For each new version, raise `versionCode` and `versionName` in
`app/build.gradle`.
