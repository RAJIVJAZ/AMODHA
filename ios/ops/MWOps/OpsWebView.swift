import SwiftUI
import UIKit
import WebKit

/// The web view that shows the business app, with pull-to-refresh, downloads (CSV exports, invoices),
/// links to WhatsApp / phone / other sites handed to iOS, and a retry screen when there is no internet.
struct OpsWebView: UIViewRepresentable {
    let startURL: URL

    func makeCoordinator() -> Coordinator { Coordinator(startURL: startURL) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // keeps the sign-in between launches
        config.allowsInlineMediaPlayback = true
        config.defaultWebpagePreferences.preferredContentMode = .mobile

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.customUserAgent = nil
        webView.evaluateJavaScript("navigator.userAgent") { result, _ in
            if let ua = result as? String { webView.customUserAgent = ua + " MWOpsiOS/1" }
        }
        webView.isOpaque = false
        webView.backgroundColor = UIColor(named: "LaunchBackground")
        webView.scrollView.contentInsetAdjustmentBehavior = .never // the pages handle the safe areas themselves

        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.reload(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        context.coordinator.webView = webView
        webView.load(URLRequest(url: startURL))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
        let startURL: URL
        weak var webView: WKWebView?
        private var downloadURLs: [ObjectIdentifier: URL] = [:]

        init(startURL: URL) { self.startURL = startURL }

        @objc func reload(_ sender: UIRefreshControl) {
            if let webView, webView.url != nil, webView.url?.scheme != "about" {
                webView.reload()
            } else {
                webView?.load(URLRequest(url: startURL))
            }
            sender.endRefreshing()
        }

        private func isAppPage(_ url: URL) -> Bool {
            guard url.scheme == "https", let host = url.host?.lowercased() else { return false }
            return AppConfig.appHosts.contains(host)
        }

        // Links: the business app stays inside; everything else goes to Safari, WhatsApp, the phone app…
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { return decisionHandler(.cancel) }
            if url.scheme == "about" || url.scheme == "data" || url.scheme == "blob" { return decisionHandler(.allow) }
            if isAppPage(url) {
                return decisionHandler(action.shouldPerformDownload ? .download : .allow)
            }
            // Sub-resources and embedded frames from other sites load normally; only real link taps leave the app.
            if action.targetFrame?.isMainFrame == false { return decisionHandler(.allow) }
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }

        // Files the page cannot show (CSV exports, attachments) are downloaded and offered in the share sheet.
        func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
            let disposition = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
            if !response.canShowMIMEType || disposition.lowercased().hasPrefix("attachment") {
                decisionHandler(.download)
            } else {
                decisionHandler(.allow)
            }
        }

        func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
        func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

        func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appendingPathComponent(suggestedFilename.isEmpty ? "download" : suggestedFilename)
            downloadURLs[ObjectIdentifier(download)] = url
            completionHandler(url)
        }

        func downloadDidFinish(_ download: WKDownload) {
            guard let url = downloadURLs.removeValue(forKey: ObjectIdentifier(download)) else { return }
            share(url)
        }

        func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
            downloadURLs.removeValue(forKey: ObjectIdentifier(download))
        }

        private func share(_ url: URL) {
            guard let webView, let root = webView.window?.rootViewController else { return }
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = webView
            sheet.popoverPresentationController?.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.midY, width: 1, height: 1)
            (root.presentedViewController ?? root).present(sheet, animated: true)
        }

        // target="_blank": business-app pages open in place, other sites in Safari.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url {
                if isAppPage(url) { webView.load(action.request) } else { UIApplication.shared.open(url) }
            }
            return nil
        }

        // JavaScript alert / confirm (used before deleting or approving things).
        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            present(message: message, actions: [("OK", .default, { completionHandler() })], fallback: completionHandler)
        }

        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            present(message: message, actions: [("Cancel", .cancel, { completionHandler(false) }), ("OK", .default, { completionHandler(true) })],
                    fallback: { completionHandler(false) })
        }

        private func present(message: String, actions: [(String, UIAlertAction.Style, () -> Void)], fallback: @escaping () -> Void) {
            guard let root = webView?.window?.rootViewController else { return fallback() }
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            for (title, style, handler) in actions { alert.addAction(UIAlertAction(title: title, style: style) { _ in handler() }) }
            (root.presentedViewController ?? root).present(alert, animated: true)
        }

        // No internet: a simple page with a retry button instead of a blank screen.
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showOffline(webView, error) }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showOffline(webView, error) }

        private func showOffline(_ webView: WKWebView, _ error: Error) {
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
            if nsError.domain == "WebKitErrorDomain" && nsError.code == 102 { return } // frame load interrupted by a download
            let retry = (webView.url.flatMap { isAppPage($0) ? $0 : nil } ?? startURL).absoluteString
            let html = """
            <html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
            <body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#022738;color:#fff;font-family:-apple-system,sans-serif;text-align:center">
            <div style="padding:24px"><h2 style="margin:0 0 8px">No connection</h2>
            <p style="opacity:.8;margin:0 0 20px">MW Ops needs the internet. Check your connection and try again.</p>
            <a href="\(retry)" style="display:inline-block;background:#fff;color:#16323f;padding:12px 22px;border-radius:12px;font-weight:700;text-decoration:none">Try again</a></div></body></html>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }
    }
}
