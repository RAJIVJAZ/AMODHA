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

Building, signing (the same key as MW Ops), the GitHub secrets and Play App Signing work exactly as
described in [`../ops/README.md`](../ops/README.md). The site confirms this app in
`public/.well-known/assetlinks.json`. For each new version, raise `versionCode` and `versionName` in
`app/build.gradle`.
