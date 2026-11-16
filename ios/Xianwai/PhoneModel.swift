import Foundation
import Security

struct PhoneFailure: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

final class PhoneModel: NSObject, URLSessionTaskDelegate {
    private let defaults = UserDefaults.standard
    private let preference = "xianwai.model"
    private let keyQuery: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "app.xianwai.workplace.ios.model",
        kSecAttrAccount as String: "api-key"
    ]
    private lazy var session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 85
        configuration.timeoutIntervalForResource = 155
        configuration.httpShouldSetCookies = false
        return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    }()

    private struct Settings {
        let endpoint: String
        let model: String
        let format: String
        let key: String
    }

    private func savedKey() throws -> String {
        var query = keyQuery
        query[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return "" }
        guard status == errSecSuccess, let bytes = result as? Data, let key = String(data: bytes, encoding: .utf8) else {
            throw PhoneFailure("读取密钥失败，请解锁手机后重试。")
        }
        return key
    }

    private func writeKey(_ key: String) throws {
        if key.isEmpty {
            let status = SecItemDelete(keyQuery as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw PhoneFailure("清除密钥失败。") }
            return
        }
        let value = [kSecValueData as String: Data(key.utf8)]
        var status = SecItemUpdate(keyQuery as CFDictionary, value as CFDictionary)
        if status == errSecItemNotFound {
            var entry = keyQuery
            entry[kSecValueData as String] = Data(key.utf8)
            entry[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(entry as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw PhoneFailure("保存密钥失败，请解锁手机后重试。") }
    }

    private func load() throws -> Settings {
        let saved = defaults.dictionary(forKey: preference) ?? [:]
        return Settings(endpoint: saved["endpoint"] as? String ?? "", model: saved["model"] as? String ?? "",
                        format: saved["format"] as? String ?? "auto", key: try savedKey())
    }

    func summary() throws -> [String: Any] {
        let current = try load()
        return ["endpoint": current.endpoint, "model": current.model, "format": current.format,
                "hasKey": !current.key.isEmpty, "configured": !current.endpoint.isEmpty && !current.model.isEmpty]
    }

    private func draft(_ data: [String: Any]) throws -> Settings {
        let endpoint = (data["endpoint"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let model = (data["model"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let key = (data["key"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let format = data["format"] as? String ?? "auto"
        guard endpoint.count <= 500, var parts = URLComponents(string: endpoint),
              parts.scheme?.lowercased() == "https", let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil else {
            throw PhoneFailure("请填写有效的 HTTPS API 地址。")
        }
        parts.scheme = "https"
        while parts.percentEncodedPath.hasSuffix("/") { parts.percentEncodedPath.removeLast() }
        if parts.percentEncodedPath.hasSuffix("/chat/completions") {
            parts.percentEncodedPath.removeLast("/chat/completions".count)
        }
        guard let base = parts.url?.absoluteString, !model.isEmpty, model.count <= 160,
              key.utf8.count <= 2048, key.utf8.allSatisfy({ (33...126).contains($0) }),
              ["auto", "schema", "json", "plain"].contains(format) else {
            throw PhoneFailure("请检查模型名称、密钥和返回格式。")
        }
        let previousEndpoint = defaults.dictionary(forKey: preference)?["endpoint"] as? String
        let retained = key.isEmpty && data["clearKey"] as? Bool != true && base == previousEndpoint
        return Settings(endpoint: base, model: model, format: format, key: retained ? try savedKey() : key)
    }

    func save(_ data: [String: Any]) throws -> [String: Any] {
        let updated = try draft(data)
        try writeKey(updated.key)
        defaults.set(["endpoint": updated.endpoint, "model": updated.model, "format": updated.format], forKey: preference)
        return try summary()
    }

    func test(_ data: [String: Any]) async throws {
        let config = try draft(data)
        let schema: [String: Any] = ["type": "object", "properties": ["ok": ["type": "boolean"]],
                                     "required": ["ok"], "additionalProperties": false]
        _ = try await request(config, messages: [["role": "user", "content": "Reply with this JSON object only: {\"ok\":true}"]],
                              schema: schema, name: "connection_test")
    }

    func complete(_ data: [String: Any]) async throws -> String {
        let config = try load()
        guard !config.endpoint.isEmpty, let messages = data["messages"] as? [[String: String]],
              let schema = data["schema"] as? [String: Any], let name = data["name"] as? String else {
            throw PhoneFailure("先在「设置」填入模型 API。")
        }
        return try await request(config, messages: messages, schema: schema, name: name)
    }

    private func request(_ config: Settings, messages: [[String: String]], schema: [String: Any], name: String) async throws -> String {
        guard let url = URL(string: config.endpoint + "/chat/completions") else { throw PhoneFailure("API 地址无效。") }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !config.key.isEmpty { request.setValue("Bearer " + config.key, forHTTPHeaderField: "Authorization") }
        for format in config.format == "auto" ? ["schema", "json", "plain"] : [config.format] {
            var body: [String: Any] = ["model": config.model, "messages": messages, "stream": false]
            if format == "schema" {
                body["response_format"] = ["type": "json_schema", "json_schema": ["name": name, "strict": true, "schema": schema]]
            } else if format == "json" {
                body["response_format"] = ["type": "json_object"]
            }
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (bytes, response): (Data, URLResponse)
            do { (bytes, response) = try await session.data(for: request) }
            catch { throw PhoneFailure("连接模型失败，请检查网络、地址和服务证书。") }
            guard let http = response as? HTTPURLResponse else { throw PhoneFailure("模型服务返回异常。") }
            if (200..<300).contains(http.statusCode),
               let payload = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
               let choices = payload["choices"] as? [[String: Any]],
               let message = choices.first?["message"] as? [String: Any],
               let content = message["content"] as? String, !content.isEmpty { return content }
            let error = String(decoding: bytes.prefix(4096), as: UTF8.self).lowercased()
            if config.format == "auto", format != "plain", [400, 422].contains(http.statusCode),
               ["response_format", "json_schema", "json_object", "structured output"].contains(where: { error.contains($0) }) { continue }
            if http.statusCode == 401 || http.statusCode == 403 { throw PhoneFailure("模型服务拒绝访问，请检查密钥和权限。") }
            if http.statusCode == 429 { throw PhoneFailure("模型服务暂时限流或额度不足，请稍后重试。") }
            throw PhoneFailure("模型服务返回异常（HTTP \(http.statusCode)）。请检查地址、模型名称和返回格式。")
        }
        throw PhoneFailure("模型未返回可用的内容。")
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
