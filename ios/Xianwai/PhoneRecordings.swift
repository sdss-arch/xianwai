import AVFoundation
import Foundation

final class PhoneRecordings: NSObject, AVAudioRecorderDelegate {
    let directory: URL
    var onEnded: ((Result<[String: Any], Error>) -> Void)?
    private var recorder: AVAudioRecorder?
    private var starting = false
    private let session = AVAudioSession.sharedInstance()
    private let files = FileManager.default

    override init() {
        directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Recordings", isDirectory: true)
        super.init()
    }

    func start(_ reply: @escaping (Result<Bool, Error>) -> Void) {
        guard recorder == nil, !starting else {
            reply(.failure(PhoneFailure("录音已经开始。"))); return
        }
        starting = true
        session.requestRecordPermission { [weak self] granted in
            DispatchQueue.main.async {
                guard let self else { return }
                self.starting = false
                guard granted else { reply(.failure(PhoneFailure("请在系统设置中允许「弦外」使用麦克风。"))); return }
                do {
                    try self.begin()
                    reply(.success(true))
                } catch { reply(.failure(error)) }
            }
        }
    }

    private func begin() throws {
        let id = "\(Int64(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.lowercased().prefix(8)).m4a"
        let staged = files.temporaryDirectory.appendingPathComponent(id)
        do {
            try session.setCategory(.record, mode: .default)
            try session.setActive(true)
            let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44_100,
                                            AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 64_000]
            let next = try AVAudioRecorder(url: staged, settings: settings)
            next.delegate = self
            guard next.record(forDuration: 120) else { throw PhoneFailure("无法开始录音。") }
            recorder = next
        } catch {
            try? files.removeItem(at: staged)
            try? session.setActive(false)
            throw PhoneFailure("无法开始录音，请检查麦克风是否被占用。")
        }
    }

    func stop() throws -> [String: Any] {
        guard let current = recorder else { throw PhoneFailure("当前没有正在进行的录音。") }
        recorder = nil
        current.delegate = nil
        current.stop()
        return try store(current.url)
    }

    func finishIfRecording() {
        if recorder != nil { onEnded?(Result { try stop() }) }
    }

    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        guard recorder === self.recorder else { return }
        self.recorder = nil
        if flag { onEnded?(Result { try store(recorder.url) }) }
        else { discard(recorder) }
    }

    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        guard recorder === self.recorder else { return }
        self.recorder = nil
        recorder.delegate = nil
        recorder.stop()
        discard(recorder)
    }

    private func discard(_ recording: AVAudioRecorder) {
        try? files.removeItem(at: recording.url)
        try? session.setActive(false)
        onEnded?(.failure(PhoneFailure("录音未能保存，请重试。")))
    }

    private func store(_ staged: URL) throws -> [String: Any] {
        defer { try? session.setActive(false); try? files.removeItem(at: staged) }
        var folder = directory
        try files.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try folder.setResourceValues(values)
        guard let source = metadata(staged), (source["size"] as? Int ?? 0) > 0 else {
            throw PhoneFailure("这段录音没有可保存的内容。")
        }
        try files.moveItem(at: staged, to: directory.appendingPathComponent(staged.lastPathComponent))
        return source
    }

    private func metadata(_ file: URL) -> [String: Any]? {
        let id = file.lastPathComponent
        guard let time = Int64(id.prefix(13)), let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize else { return nil }
        return ["id": id, "name": "录音 \(id)", "time": time, "size": size, "url": "/recordings-local/\(id)"]
    }

    func list() throws -> [[String: Any]] {
        guard files.fileExists(atPath: directory.path) else { return [] }
        return try files.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey])
            .filter { Self.isRecording($0.lastPathComponent) && (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true }
            .sorted { $0.lastPathComponent > $1.lastPathComponent }
            .compactMap(metadata)
    }

    func existing(_ id: String) throws -> URL {
        guard Self.isRecording(id) else { throw PhoneFailure("找不到这条录音。") }
        let file = directory.appendingPathComponent(id)
        guard files.fileExists(atPath: file.path) else { throw PhoneFailure("找不到这条录音。") }
        return file
    }

    func remove(_ id: String) throws { try files.removeItem(at: existing(id)) }

    static func isRecording(_ id: String) -> Bool {
        id.range(of: "^[0-9]{13}-[0-9a-f]{8}\\.m4a$", options: .regularExpression) != nil
    }
}
