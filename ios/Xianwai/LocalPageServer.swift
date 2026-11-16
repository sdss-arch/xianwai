import Foundation
import Network

/// Serves the packaged interface and recordings to this app's WebKit view only.
final class LocalPageServer {
    static let port = 27483
    static let origin = URL(string: "http://127.0.0.1:27483")!

    private let token = UUID().uuidString
    private let queue = DispatchQueue(label: "app.xianwai.page")
    private let assets: URL
    private let recordings: URL
    private var listener: NWListener?

    init(assets: URL, recordings: URL) {
        self.assets = assets
        self.recordings = recordings
    }

    func start(ready: @escaping (Result<URLRequest, Error>) -> Void) throws {
        let parameters = NWParameters.tcp
        let port = NWEndpoint.Port(rawValue: UInt16(Self.port))!
        parameters.requiredInterfaceType = .loopback
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: port)
        let listener = try NWListener(using: parameters, on: port)
        self.listener = listener
        listener.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                // Keep the same origin across launches so WebKit retains local data.
                var request = URLRequest(url: Self.origin)
                request.cachePolicy = .reloadIgnoringLocalCacheData
                request.setValue(self.token, forHTTPHeaderField: "X-Xianwai-Session")
                DispatchQueue.main.async { ready(.success(request)) }
            case .failed(let error):
                DispatchQueue.main.async { ready(.failure(error)) }
            default:
                break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            guard let self else { connection.cancel(); return }
            guard case .hostPort(let host, _) = connection.endpoint,
                  String(describing: host) == "127.0.0.1" else {
                connection.cancel()
                return
            }
            connection.start(queue: self.queue)
            self.receive(connection, buffer: Data())
        }
        listener.start(queue: queue)
    }

    deinit { listener?.cancel() }

    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, ended, error in
            guard let self, error == nil else { connection.cancel(); return }
            var bytes = buffer
            if let data { bytes.append(data) }
            guard bytes.count <= 32_768 else { self.respond(connection, status: "431 Request Header Fields Too Large"); return }
            if let delimiter = bytes.range(of: Data("\r\n\r\n".utf8)),
               let text = String(data: bytes[..<delimiter.lowerBound], encoding: .utf8) {
                self.serve(connection, request: text)
            } else if ended {
                connection.cancel()
            } else {
                self.receive(connection, buffer: bytes)
            }
        }
    }

    private func serve(_ connection: NWConnection, request: String) {
        let lines = request.components(separatedBy: "\r\n")
        let target = lines[0].split(separator: " ", maxSplits: 2)
        guard target.count == 3, target[0] == "GET" || target[0] == "HEAD" else {
            respond(connection, status: "405 Method Not Allowed"); return
        }
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            let parts = line.split(separator: ":", maxSplits: 1)
            if parts.count == 2 { headers[parts[0].lowercased()] = parts[1].trimmingCharacters(in: .whitespaces) }
        }
        let authenticated = headers["cookie"]?.split(separator: ";").contains {
            $0.trimmingCharacters(in: .whitespaces) == "xianwai_local=" + token
        } ?? false
        let first = headers["x-xianwai-session"] == token
        guard headers["host"] == "127.0.0.1:\(Self.port)", authenticated || first else {
            respond(connection, status: "403 Forbidden"); return
        }
        let address = String(target[1])
        guard let path = address.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first?.removingPercentEncoding,
              path.range(of: "^/[A-Za-z0-9/_.-]*$", options: .regularExpression) != nil,
              !path.split(separator: "/").contains("..") else {
            respond(connection, status: "404 Not Found"); return
        }
        let file: URL
        if path.hasPrefix("/recordings-local/") {
            let name = String(path.dropFirst("/recordings-local/".count))
            guard name.range(of: "^[0-9]{13}-[a-f0-9]{8}\\.m4a$", options: .regularExpression) != nil else {
                respond(connection, status: "404 Not Found"); return
            }
            file = recordings.appendingPathComponent(name)
        } else {
            file = assets.appendingPathComponent(path == "/" ? "index.html" : String(path.dropFirst()))
        }
        guard let attributes = try? file.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]),
              attributes.isRegularFile == true, let fileSize = attributes.fileSize else {
            respond(connection, status: "404 Not Found"); return
        }
        let type = Self.mime[file.pathExtension] ?? "application/octet-stream"
        let range = byteRange(headers["range"], size: fileSize)
        if headers["range"] != nil && range == nil {
            respond(connection, status: "416 Range Not Satisfiable", headers: ["Content-Range: bytes */\(fileSize)"]); return
        }
        let start = range?.lowerBound ?? 0
        let end = range?.upperBound ?? fileSize
        var response = [
            "Content-Type: \(type)",
            "Content-Length: \(end - start)",
            "Accept-Ranges: bytes",
            "Cache-Control: no-store",
            "X-Content-Type-Options: nosniff",
            "Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; media-src 'self' blob:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'"
        ]
        if first { response.append("Set-Cookie: xianwai_local=\(token); Path=/; HttpOnly; SameSite=Strict") }
        if range != nil { response.append("Content-Range: bytes \(start)-\(end - 1)/\(fileSize)") }
        let status = range == nil ? "200 OK" : "206 Partial Content"
        if target[0] == "HEAD" || end == start {
            respond(connection, status: status, headers: response)
            return
        }
        guard let handle = try? FileHandle(forReadingFrom: file) else {
            respond(connection, status: "404 Not Found"); return
        }
        do { try handle.seek(toOffset: UInt64(start)) }
        catch { try? handle.close(); respond(connection, status: "500 Internal Server Error"); return }
        sendHeader(connection, status: status, headers: response) { [weak self] error in
            guard let self, error == nil else { try? handle.close(); connection.cancel(); return }
            self.stream(connection, file: handle, remaining: end - start)
        }
    }

    private func byteRange(_ header: String?, size: Int) -> Range<Int>? {
        guard let header, header.hasPrefix("bytes="), size > 0 else { return nil }
        let values = header.dropFirst(6).split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        guard values.count == 2 else { return nil }
        if let start = Int(values[0]), (0..<size).contains(start) {
            let last = values[1].isEmpty ? size - 1 : Int(values[1]) ?? -1
            return last >= start ? start..<(min(last, size - 1) + 1) : nil
        }
        if values[0].isEmpty, let length = Int(values[1]), length > 0 {
            return max(0, size - length)..<size
        }
        return nil
    }

    private func stream(_ connection: NWConnection, file: FileHandle, remaining: Int) {
        guard remaining > 0, let chunk = try? file.read(upToCount: min(remaining, 1_048_576)), !chunk.isEmpty else {
            try? file.close(); connection.cancel(); return
        }
        connection.send(content: chunk, completion: .contentProcessed { [weak self] error in
            guard let self, error == nil else { try? file.close(); connection.cancel(); return }
            self.stream(connection, file: file, remaining: remaining - chunk.count)
        })
    }

    private func sendHeader(_ connection: NWConnection, status: String, headers: [String], done: @escaping (NWError?) -> Void) {
        let text = (["HTTP/1.1 " + status, "Connection: close"] + headers + ["", ""]).joined(separator: "\r\n")
        connection.send(content: Data(text.utf8), completion: .contentProcessed(done))
    }

    private func respond(_ connection: NWConnection, status: String, headers: [String] = []) {
        let length = headers.contains { $0.hasPrefix("Content-Length:") } ? [] : ["Content-Length: 0"]
        sendHeader(connection, status: status, headers: headers + length) { _ in connection.cancel() }
    }

    private static let mime = [
        "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8", "json": "application/json; charset=utf-8", "webmanifest": "application/manifest+json",
        "wasm": "application/wasm", "png": "image/png", "m4a": "audio/mp4"
    ]
}
