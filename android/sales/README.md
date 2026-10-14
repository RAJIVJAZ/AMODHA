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

Building, signing (the same key as MW Ops), the GitHub secrets and Play App Signing work exactly as
described in [`../ops/README.md`](../ops/README.md). The site confirms this app in
`public/.well-known/assetlinks.json`. For each new version, raise `versionCode` and `versionName` in
`app/build.gradle`.
