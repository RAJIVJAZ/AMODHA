import SwiftUI

// MW Ops: the staff business app at https://mithaiwallah.shop/ops in a full-screen web view.
// Every screen comes from the website, so website updates reach the app straight away; a new app
// build is only needed to change the icon, name, colours or start address.
@main
struct MWOpsApp: App {
    var body: some Scene {
        WindowGroup {
            OpsWebView(startURL: AppConfig.startURL)
                .ignoresSafeArea()
                .background(Color("LaunchBackground"))
                .preferredColorScheme(.light)
        }
    }
}

enum AppConfig {
    static let startURL = URL(string: "https://mithaiwallah.shop/ops/today")!
    /// Pages on these hosts open inside the app; everything else opens in Safari or the right app.
    static let appHosts: Set<String> = ["mithaiwallah.shop", "www.mithaiwallah.shop"]
}
