import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: ScanSessionStore
    @State private var scannerTarget: ScanTarget?
    @State private var manualSampleID = ""
    @State private var exportURL: URL?
    @State private var showingExporter = false

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                List {
                    overviewSection
                    actionSection
                    metadataSection
                    boxSection
                    positionSection
                    sampleSection
                    basketSection
                    exportSection
                }
                .listStyle(.insetGrouped)
                .navigationTitle("LIMS Scanner")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            scannerTarget = .sample
                        } label: {
                            Image(systemName: "qrcode.viewfinder")
                        }
                    }
                }

                if let toast = store.toast {
                    ToastView(toast: toast)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .zIndex(1)
                }
            }
            .animation(.spring(response: 0.28, dampingFraction: 0.86), value: store.toast?.id)
            .task(id: store.toast?.id) {
                guard let toast = store.toast else { return }
                try? await Task.sleep(for: .seconds(1.8))
                await MainActor.run {
                    withAnimation {
                        store.clearToast(toast)
                    }
                }
            }
            .sheet(item: $scannerTarget) { target in
                QRScannerSheet(target: target) { value in
                    store.addScannedCode(value, target: target)
                }
            }
            .sheet(isPresented: $showingExporter) {
                if let exportURL {
                    ShareSheet(items: [exportURL])
                }
            }
        }
    }

    private var overviewSection: some View {
        Section {
            SessionOverviewCard(
                action: store.action,
                sourceBoxCode: store.sourceBoxCode,
                targetBoxCode: store.targetBoxCode,
                cursorPosition: store.cursorPosition,
                basketCount: store.items.count,
                eventCount: store.events.count
            )
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private var actionSection: some View {
        Section("1. 选择操作") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 10)], spacing: 10) {
                ForEach(ScanAction.allCases) { action in
                    ActionCard(action: action, isSelected: store.action == action) {
                        store.action = action
                    }
                }
            }
            .padding(.vertical, 4)
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        }
    }

    private var metadataSection: some View {
        Section("2. 会话信息") {
            LabelledField(title: "实验 / 任务标签", systemImage: "text.badge.plus") {
                TextField("EXP-20260616-01", text: $store.experimentLabel)
            }
            LabelledField(title: "操作者", systemImage: "person") {
                TextField("姓名或缩写", text: $store.operatorName)
            }
            LabeledContent("Session") {
                Text(store.sessionID)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var boxSection: some View {
        if store.action.needsSourceBox {
            Section(store.action.needsTargetBox ? "3. 当前盒子" : "3. 冻存盒") {
                LabelledField(title: "当前盒子", systemImage: "shippingbox") {
                    TextField("BOX-0001 或 box:BOX-0001", text: $store.sourceBoxCode)
                        .textInputAutocapitalization(.characters)
                }
                Button {
                    scannerTarget = .sourceBox
                } label: {
                    Label("扫码选择当前盒子", systemImage: "qrcode.viewfinder")
                }

                if store.action.needsTargetBox {
                    LabelledField(title: "目标盒子", systemImage: "arrow.forward.square") {
                        TextField("BOX-0002", text: $store.targetBoxCode)
                            .textInputAutocapitalization(.characters)
                    }
                    Button {
                        scannerTarget = .targetBox
                    } label: {
                        Label("扫码选择目标盒子", systemImage: "qrcode.viewfinder")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var positionSection: some View {
        if store.action.needsPosition {
            Section("4. 起始孔位") {
                LabelledField(title: "下一孔位", systemImage: "circle.grid.3x3") {
                    TextField("A1", text: $store.cursorPosition)
                        .textInputAutocapitalization(.characters)
                }
                Text("连续扫码后会自动递增：A1 → A2 → A3。")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var sampleSection: some View {
        Section("5. 连续扫 EP 管") {
            Button {
                scannerTarget = .sample
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "camera.viewfinder")
                        .font(.title2)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("打开相机连续扫码")
                            .font(.headline)
                        Text("扫到后自动加入扫码篮")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                .padding(.vertical, 6)
            }

            HStack {
                TextField("手动输入 sample_id", text: $manualSampleID)
                    .textInputAutocapitalization(.characters)
                Button("加入") {
                    store.addManualSample(manualSampleID)
                    manualSampleID = ""
                }
                .buttonStyle(.borderedProminent)
                .disabled(manualSampleID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            if !store.message.isEmpty {
                Text(store.message)
                    .font(.caption)
                    .foregroundStyle(messageColor)
            }
        }
    }

    private var basketSection: some View {
        Section("6. 扫码篮") {
            if store.items.isEmpty {
                ContentUnavailableView(
                    "还没有样本",
                    systemImage: "tray",
                    description: Text("打开相机后可以连续扫 EP 管。")
                )
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            } else {
                ForEach(Array(store.items.enumerated()), id: \.element.id) { index, item in
                    BasketRow(index: index + 1, item: item)
                }
                Button("撤销上一管") { store.undoLast() }
                Button("清空扫码篮", role: .destructive) { store.clearBasket() }
                Button {
                    store.confirmSession()
                } label: {
                    Label("确认并保存事件", systemImage: "checkmark.circle")
                }
                .buttonStyle(.borderedProminent)
                .disabled(!store.canConfirm)
            }
        }
    }

    private var exportSection: some View {
        Section("导出") {
            LabeledContent("已保存事件") {
                Text("\(store.events.count)")
                    .font(.headline)
            }
            Button {
                do {
                    exportURL = try store.exportURL()
                    showingExporter = true
                } catch {
                    store.show("导出失败：\(error.localizedDescription)", .error)
                }
            } label: {
                Label("导出 scan_events.json", systemImage: "square.and.arrow.up")
            }
            .disabled(store.events.isEmpty)
        }
    }

    private var messageColor: Color {
        color(for: store.messageKind)
    }
}

private struct SessionOverviewCard: View {
    let action: ScanAction
    let sourceBoxCode: String
    let targetBoxCode: String
    let cursorPosition: String
    let basketCount: Int
    let eventCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(action.title)
                        .font(.title2.bold())
                    Text(action.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: iconName)
                    .font(.title2)
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(.blue, in: RoundedRectangle(cornerRadius: 12))
            }

            HStack(spacing: 10) {
                MetricPill(title: "扫码篮", value: "\(basketCount)")
                MetricPill(title: "事件", value: "\(eventCount)")
                MetricPill(title: "孔位", value: action.needsPosition ? cursorPosition : "-")
            }

            if action.needsSourceBox {
                Text(boxSummary)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(16)
        .background(
            LinearGradient(
                colors: [Color.blue.opacity(0.16), Color.cyan.opacity(0.08)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 18)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .strokeBorder(Color.blue.opacity(0.16))
        )
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private var iconName: String {
        switch action {
        case .putaway: return "tray.and.arrow.down"
        case .pickup: return "tray.and.arrow.up"
        case .returnSample: return "arrow.uturn.backward"
        case .transfer: return "arrow.left.arrow.right"
        case .inventory: return "checklist"
        case .consume: return "archivebox"
        }
    }

    private var boxSummary: String {
        if action.needsTargetBox {
            return "当前盒：\(sourceBoxCode.isEmpty ? "未选择" : sourceBoxCode) → 目标盒：\(targetBoxCode.isEmpty ? "未选择" : targetBoxCode)"
        }
        return "当前盒：\(sourceBoxCode.isEmpty ? "未选择" : sourceBoxCode)"
    }
}

private struct MetricPill: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.background.opacity(0.8), in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct ActionCard: View {
    let action: ScanAction
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: iconName)
                        .foregroundStyle(isSelected ? .white : .blue)
                        .frame(width: 30, height: 30)
                        .background(isSelected ? Color.blue : Color.blue.opacity(0.12), in: Circle())
                    Spacer()
                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.blue)
                    }
                }
                Text(action.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                Text(action.subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 118, alignment: .topLeading)
            .background(isSelected ? Color.blue.opacity(0.10) : Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(isSelected ? Color.blue : Color.clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }

    private var iconName: String {
        switch action {
        case .putaway: return "tray.and.arrow.down"
        case .pickup: return "tray.and.arrow.up"
        case .returnSample: return "arrow.uturn.backward"
        case .transfer: return "arrow.left.arrow.right"
        case .inventory: return "checklist"
        case .consume: return "archivebox"
        }
    }
}

private struct LabelledField<Field: View>: View {
    let title: String
    let systemImage: String
    @ViewBuilder var field: Field

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .foregroundStyle(.blue)
                .frame(width: 26)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                field
            }
        }
    }
}

private struct BasketRow: View {
    let index: Int
    let item: ScanItem

    var body: some View {
        HStack(spacing: 12) {
            Text("\(index)")
                .font(.caption.bold())
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(.blue, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(item.sampleID)
                    .font(.headline)
                if let position = item.position {
                    Label(position, systemImage: "mappin.and.ellipse")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
        }
        .padding(.vertical, 2)
    }
}

struct ToastView: View {
    let toast: ToastMessage

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: iconName)
                .font(.headline)
                .foregroundStyle(.white)
                .frame(width: 30, height: 30)
                .background(color(for: toast.kind), in: Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(toast.title)
                    .font(.subheadline.bold())
                if let detail = toast.detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(Color.primary.opacity(0.08))
        )
        .shadow(color: .black.opacity(0.14), radius: 16, x: 0, y: 8)
    }

    private var iconName: String {
        switch toast.kind {
        case .success: return "checkmark"
        case .warning: return "exclamationmark"
        case .error: return "xmark"
        case .info: return "info"
        }
    }
}

func color(for kind: ScanSessionStore.MessageKind) -> Color {
    switch kind {
    case .info: return .secondary
    case .success: return .green
    case .warning: return .orange
    case .error: return .red
    }
}
