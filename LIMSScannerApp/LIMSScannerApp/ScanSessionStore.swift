import Foundation
import SwiftUI

@MainActor
final class ScanSessionStore: ObservableObject {
    @Published var action: ScanAction = .putaway {
        didSet { resetForActionChange() }
    }
    @Published var sourceBoxCode = ""
    @Published var targetBoxCode = ""
    @Published var cursorPosition = "A1"
    @Published var operatorName = ""
    @Published var experimentLabel = ""
    @Published var items: [ScanItem] = []
    @Published var events: [ScanEvent] = []
    @Published var message = ""
    @Published var messageKind: MessageKind = .info

    enum MessageKind {
        case info
        case success
        case warning
        case error
    }

    var sessionID: String = ScanSessionStore.makeSessionID()

    var canConfirm: Bool { !items.isEmpty }

    func addScannedCode(_ rawValue: String, target: ScanTarget) {
        let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }

        switch target {
        case .sourceBox:
            sourceBoxCode = cleanBoxCode(value)
            show("已选择当前盒子：\(sourceBoxCode)", .success)
        case .targetBox:
            targetBoxCode = cleanBoxCode(value)
            show("已选择目标盒子：\(targetBoxCode)", .success)
        case .sample:
            addSample(value)
        }
    }

    func addManualSample(_ sampleID: String) {
        addSample(sampleID)
    }

    func undoLast() {
        guard let removed = items.popLast() else { return }
        if let position = removed.position {
            cursorPosition = position
        }
        show("已撤销 \(removed.sampleID)", .info)
    }

    func clearBasket() {
        items.removeAll()
        show("扫码篮已清空", .info)
    }

    func confirmSession() {
        guard canConfirm else {
            show("扫码篮为空。", .warning)
            return
        }

        let newEvents = items.enumerated().map { index, item in
            ScanEvent(
                sessionID: sessionID,
                action: action,
                sampleID: item.sampleID,
                boxCode: sourceBoxCode.isEmpty ? nil : sourceBoxCode,
                position: item.position,
                targetBoxCode: targetBoxCode.isEmpty ? nil : targetBoxCode,
                operatorName: operatorName.isEmpty ? nil : operatorName,
                experimentLabel: experimentLabel.isEmpty ? nil : experimentLabel,
                createdAt: Date(),
                scannedOrder: index + 1
            )
        }

        events.append(contentsOf: newEvents)
        items.removeAll()
        sessionID = ScanSessionStore.makeSessionID()
        show("已保存 \(newEvents.count) 条事件。", .success)
    }

    func exportURL() throws -> URL {
        let payload = ExportPayload(
            exportedAt: Date(),
            app: "LIMSScannerApp",
            events: events
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(payload)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("scan_events_\(Self.fileTimestamp()).json")
        try data.write(to: url, options: .atomic)
        return url
    }

    func show(_ text: String, _ kind: MessageKind = .info) {
        message = text
        messageKind = kind
    }

    private func addSample(_ rawSampleID: String) {
        let sampleID = rawSampleID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sampleID.isEmpty else { return }

        if items.contains(where: { $0.sampleID == sampleID }) {
            show("扫码篮里已经有 \(sampleID)", .warning)
            return
        }

        let position = action.needsPosition ? cursorPosition.normalizedPosition : nil
        items.append(ScanItem(sampleID: sampleID, position: position))
        if action.needsPosition {
            cursorPosition = Position.next(after: position ?? cursorPosition)
        }
        show("已加入 \(sampleID)", .success)
    }

    private func resetForActionChange() {
        items.removeAll()
        if !action.needsTargetBox {
            targetBoxCode = ""
        }
        show("已切换到 \(action.title)", .info)
    }

    private func cleanBoxCode(_ value: String) -> String {
        value.replacingOccurrences(
            of: #"^box:"#,
            with: "",
            options: [.regularExpression, .caseInsensitive]
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func makeSessionID() -> String {
        "SCAN-\(fileTimestamp())"
    }

    private static func fileTimestamp() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return formatter.string(from: Date())
    }
}

enum ScanTarget: String, Identifiable {
    case sourceBox
    case targetBox
    case sample

    var id: String { rawValue }

    var title: String {
        switch self {
        case .sourceBox: return "扫当前盒子"
        case .targetBox: return "扫目标盒子"
        case .sample: return "扫 EP 管"
        }
    }
}

enum Position {
    static func next(after position: String) -> String {
        let normalized = position.normalizedPosition
        guard let rowScalar = normalized.unicodeScalars.first,
              rowScalar.value >= 65,
              rowScalar.value <= 90
        else {
            return "A1"
        }

        let row = Character(rowScalar)
        let colText = String(normalized.dropFirst())
        let col = Int(colText) ?? 1
        if col < 99 {
            return "\(row)\(col + 1)"
        }

        let nextRow = UnicodeScalar(rowScalar.value + 1).map(Character.init) ?? "A"
        return "\(nextRow)1"
    }
}

extension String {
    var normalizedPosition: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
            .replacingOccurrences(of: " ", with: "")
    }
}
