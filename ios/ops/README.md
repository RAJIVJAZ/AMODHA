# MW Ops for iPhone and iPad

A small iOS app that opens the staff business app, <https://mithaiwallah.shop/ops/today>, full screen. All screens come
from the website, so website updates reach the app straight away; a new build is only needed to change the icon,
name, colours or start address. It keeps staff signed in, has pull-to-refresh, hands WhatsApp / phone / other links
to iOS, offers CSV exports and invoices in the share sheet, can attach photos from the camera, and shows a retry
screen without internet.

- Bundle ID: `shop.mithaiwallah.ops` · iOS 16 or newer · iPhone and iPad.
- Code: `MWOps/` (SwiftUI + WKWebView). The Xcode project is generated from `project.yml` with XcodeGen.

## Without the native app

Staff can already install the web app today: open <https://mithaiwallah.shop/ops> in **Safari** → **Share** →
**Add to Home Screen**. It opens full screen with the MW Ops icon.

## Getting the native app onto staff iPhones (TestFlight)

Apple only installs apps that come through Apple. For an internal staff app, **TestFlight internal testing** is the
simplest route: no App Store listing and no App Review, up to 100 people, and each build lasts 90 days (GitHub
uploads a fresh build on the 1st of every month).

1. Join the **Apple Developer Program** (developer.apple.com, US$99 a year) as the business.
2. In **App Store Connect → Apps → +**, create a new app named "MW Ops" with the bundle ID `shop.mithaiwallah.ops`
   (register the ID first under developer.apple.com → Identifiers if it is not offered).
3. In **App Store Connect → Users and Access → Integrations → App Store Connect API**, create a key with the
   **App Manager** role and download the `.p8` file (it can be downloaded only once).
4. In GitHub → AMODHA → Settings → Secrets and variables → Actions, add:
   `APPLE_TEAM_ID` (developer.apple.com → Membership), `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_P8_BASE64`
   (the `.p8` file base64-encoded; on a Mac: `base64 -i AuthKey_XXXX.p8 | pbcopy`).
5. GitHub → Actions → **iOS app (MW Ops)** → Run workflow. After Apple processes the build (10–30 minutes) it appears
   in App Store Connect → TestFlight.
6. Add each staff member as a user in App Store Connect (role: Developer or Marketing is enough), then add them to an
   **internal testing group** in TestFlight. They install **TestFlight** from the App Store and accept the invite.

Publishing on the public App Store instead needs App Review; Apple often rejects apps that only show a website, and
an app for your own staff is better delivered through TestFlight or as a private (Custom) app via Apple Business
Manager.

## Building on a Mac

`brew install xcodegen && cd ios/ops && xcodegen generate && open MWOps.xcodeproj`, choose your team under
Signing & Capabilities, and run.
