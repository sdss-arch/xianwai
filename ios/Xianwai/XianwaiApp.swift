import SwiftUI
import UIKit
import WebKit
import AVFoundation
import UniformTypeIdentifiers

@main
struct XianwaiApp: App {
    var body: some Scene {
        WindowGroup {
            PhoneScreen()
                .preferredColorScheme(.light)
        }
    }
}

private struct PhoneScreen: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> PhoneViewController { PhoneViewController() }
    func updateUIViewController(_ controller: PhoneViewController, context: Context) {}
}

private final class PhoneViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler, UIDocumentPickerDelegate {
    private let recordings = PhoneRecordings()
    private let model = PhoneModel()
    private var server: LocalPageServer?
    private var webView: WKWebView!
    private var export: (id: String, temporaryFile: URL?)?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.96, green: 0.95, blue: 0.93, alpha: 1)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        let content = configuration.userContentController
        content.add(WeakScriptReceiver(self), name: "xianwai")
        content.addUserScript(WKUserScript(source: """
            window.XianwaiPhone = Object.freeze({
              dispatch(id, action, json) {
                window.webkit.messageHandlers.xianwai.postMessage({id, action, json});
              }
            });
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let browser = WKWebView(frame: .zero, configuration: configuration)
        browser.navigationDelegate = self
        browser.isOpaque = false
        browser.backgroundColor = view.backgroundColor
        browser.translatesAutoresizingMaskIntoConstraints = false
        webView = browser
        view.addSubview(browser)
        let area = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            browser.leadingAnchor.constraint(equalTo: area.leadingAnchor),
            browser.trailingAnchor.constraint(equalTo: area.trailingAnchor),
            browser.topAnchor.constraint(equalTo: area.topAnchor),
            browser.bottomAnchor.constraint(equalTo: area.bottomAnchor)
        ])

        recordings.onEnded = { [weak self] result in
            switch result {
            case .success(let metadata): self?.emit("XianwaiNativeRecording", [metadata])
            case .failure(let error): self?.emit("XianwaiNativeRecordingError", [error.localizedDescription])
            }
        }
        NotificationCenter.default.addObserver(self, selector: #selector(didEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(audioInterrupted), name: AVAudioSession.interruptionNotification, object: nil)
        guard let directory = Bundle.main.resourceURL?.appendingPathComponent("AppAssets/web", isDirectory: true),
              FileManager.default.fileExists(atPath: directory.appendingPathComponent("index.html").path) else {
            showFailure("缺少离线资源，请重新安装弦外。")
            return
        }
        let service = LocalPageServer(assets: directory, recordings: recordings.directory)
        server = service
        do {
            try service.start { [weak self] result in
                switch result {
                case .success(let request): self?.webView.load(request)
                case .failure: self?.showFailure("弦外无法打开本机工作台。请退出应用后重试。")
                }
            }
        } catch { showFailure("弦外无法打开本机工作台。请退出应用后重试。") }
    }

    @objc private func didEnterBackground() { recordings.finishIfRecording() }

    @objc private func audioInterrupted(_ notification: Notification) {
        let interruption = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
        if interruption == AVAudioSession.InterruptionType.began.rawValue { recordings.finishIfRecording() }
    }

    private func showFailure(_ text: String) {
        let label = UILabel()
        label.text = text
        label.numberOfLines = 0
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 28),
            label.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -28),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    private func trusted(_ url: URL?) -> Bool {
        url?.scheme == "http" && url?.host == "127.0.0.1" && url?.port == LocalPageServer.port
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(navigationAction.targetFrame?.isMainFrame == true && trusted(navigationAction.request.url) ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { showFailure("工作台载入失败。请退出应用后重试。") }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "xianwai", message.frameInfo.isMainFrame, trusted(message.frameInfo.request.url),
              let payload = message.body as? [String: Any], let id = payload["id"] as? String,
              id.range(of: "^[0-9]{1,12}$", options: .regularExpression) != nil else { return }
        guard let action = payload["action"] as? String, let json = payload["json"] as? String,
              json.utf8.count <= 2_000_000,
              let data = (try? JSONSerialization.jsonObject(with: Data(json.utf8))) as? [String: Any] else {
            finish(id, error: PhoneFailure("操作内容无效或过长。"))
            return
        }
        do {
            switch action {
            case "settings": finish(id, value: try model.summary())
            case "saveSettings": finish(id, value: try model.save(data))
            case "testSettings", "complete":
                Task { [weak self] in
                    guard let self else { return }
                    do {
                        if action == "testSettings" {
                            try await self.model.test(data)
                            self.finish(id, value: true)
                        } else {
                            self.finish(id, value: try await self.model.complete(data))
                        }
                    } catch { self.finish(id, error: error) }
                }
            case "startRecording":
                recordings.start { [weak self] result in
                    switch result {
                    case .success(let started): self?.finish(id, value: started)
                    case .failure(let error): self?.finish(id, error: error)
                    }
                }
            case "stopRecording": finish(id, value: try recordings.stop())
            case "listRecordings": finish(id, value: try recordings.list())
            case "deleteRecording":
                try recordings.remove(data["id"] as? String ?? "")
                finish(id, value: true)
            case "exportRecording":
                try presentExport(id, url: recordings.existing(data["id"] as? String ?? ""), temporary: false)
            case "exportText":
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("弦外-复盘-\(UUID().uuidString.prefix(8)).txt")
                try (data["text"] as? String ?? "").write(to: url, atomically: true, encoding: .utf8)
                do { try presentExport(id, url: url, temporary: true) }
                catch { try? FileManager.default.removeItem(at: url); throw error }
            case "copy":
                UIPasteboard.general.string = data["text"] as? String ?? ""
                finish(id, value: true)
            default: finish(id, error: PhoneFailure("该手机功能暂不可用。"))
            }
        } catch { finish(id, error: error) }
    }

    private func presentExport(_ id: String, url: URL, temporary: Bool) throws {
        guard export == nil, presentedViewController == nil else { throw PhoneFailure("请先结束当前导出。") }
        let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
        picker.delegate = self
        export = (id, temporary ? url : nil)
        present(picker, animated: true)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { completeExport(false) }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        completeExport(!urls.isEmpty)
    }

    private func completeExport(_ saved: Bool) {
        guard let current = export else { return }
        export = nil
        if let file = current.temporaryFile { try? FileManager.default.removeItem(at: file) }
        if saved { finish(current.id, value: true) }
        else { finish(current.id, error: PhoneFailure("已取消导出。")) }
    }

    private func finish(_ id: String, value: Any) { emit("XianwaiNativeResult", [id, true, value]) }
    private func finish(_ id: String, error: Error) { emit("XianwaiNativeResult", [id, false, error.localizedDescription]) }

    private func emit(_ callback: String, _ arguments: [Any]) {
        guard let bytes = try? JSONSerialization.data(withJSONObject: arguments),
              let json = String(data: bytes, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.\(callback)?.(...\(json))", completionHandler: nil)
    }
}

private final class WeakScriptReceiver: NSObject, WKScriptMessageHandler {
    weak var receiver: WKScriptMessageHandler?

    init(_ receiver: WKScriptMessageHandler) { self.receiver = receiver }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        receiver?.userContentController(userContentController, didReceive: message)
    }
}
