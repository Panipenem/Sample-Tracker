import Foundation

enum ScanAction: String, CaseIterable, Identifiable, Codable {
    case putaway
    case pickup
    case returnSample = "return"
    case transfer
    case inventory
    case consume

    var id: String { rawValue }

    var title: String {
        switch self {
        case .putaway: return "入盒"
        case .pickup: return "取样"
        case .returnSample: return "放回"
        case .transfer: return "转移"
        case .inventory: return "盘点"
        case .consume: return "消耗"
        }
    }

    var subtitle: String {
        switch self {
        case .putaway: return "扫盒子，选起始孔位，连续扫 EP 管"
        case .pickup: return "从当前盒子连续取多管样本"
        case .returnSample: return "把取出的样本放回盒子"
        case .transfer: return "从当前盒子转移到目标盒子"
        case .inventory: return "盘点盒中实际样本"
        case .consume: return "把样本标记为已消耗"
        }
    }

    var needsSourceBox: Bool {
        switch self {
        case .putaway, .pickup, .returnSample, .transfer, .inventory:
            return true
        case .consume:
            return false
        }
    }

    var needsTargetBox: Bool { self == .transfer }

    var needsPosition: Bool {
        switch self {
        case .putaway, .returnSample, .transfer:
            return true
        case .pickup, .inventory, .consume:
            return false
        }
    }
}

struct ScanItem: Identifiable, Codable, Equatable {
    var id = UUID()
    var sampleID: String
    var position: String?
    var scannedAt = Date()
}

struct ScanEvent: Identifiable, Codable {
    var id = UUID()
    var sessionID: String
    var action: ScanAction
    var sampleID: String
    var boxCode: String?
    var position: String?
    var targetBoxCode: String?
    var operatorName: String?
    var experimentLabel: String?
    var createdAt: Date
    var scannedOrder: Int
}

struct ExportPayload: Codable {
    var exportedAt: Date
    var app: String
    var events: [ScanEvent]
}

struct ToastMessage: Identifiable, Equatable {
    var id = UUID()
    var title: String
    var detail: String?
    var kind: ScanSessionStore.MessageKind
}
