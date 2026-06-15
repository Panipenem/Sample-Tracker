import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: ScanSessionStore
    @State private var scannerTarget: ScanTarget?
    @State private var manualSampleID = ""
    @State private var exportURL: URL?
    @State private var showingExporter = false

    var body: some View {
        NavigationStack {
            List {
                actionSection
                metadataSection
                boxSection
                positionSection
                sampleSection
                basketSection
                exportSection
            }
            .navigationTitle("LIMS Scanner")
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

    private var actionSection: some View {
        Section("1. 选择操作") {
            ForEach(ScanAction.allCases) { action in
                Button {
                    store.action = action
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(action.title)
                                .font(.headline)
                            Text(action.subtitle)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if store.action == action {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.blue)
                        }
                    }
                }
                .foregroundStyle(.primary)
            }
        }
    }

    private var metadataSection: some View {
        Section("2. 会话信息") {
            TextField("实验 / 任务标签", text: $store.experimentLabel)
            TextField("操作者", text: $store.operatorName)
            Text("Session: \(store.sessionID)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var boxSection: some View {
        if store.action.needsSourceBox {
            Section(store.action.needsTargetBox ? "3. 当前盒子" : "3. 冻存盒") {
                TextField("BOX-0001 或 box:BOX-0001", text: $store.sourceBoxCode)
                    .textInputAutocapitalization(.characters)
                Button {
                    scannerTarget = .sourceBox
                } label: {
                    Label("扫码选择当前盒子", systemImage: "qrcode.viewfinder")
                }

                if store.action.needsTargetBox {
                    TextField("目标盒子 BOX-0002", text: $store.targetBoxCode)
                        .textInputAutocapitalization(.characters)
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
                TextField("A1", text: $store.cursorPosition)
                    .textInputAutocapitalization(.characters)
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
                Label("打开相机扫码", systemImage: "camera.viewfinder")
            }
            HStack {
                TextField("手动输入 sample_id", text: $manualSampleID)
                    .textInputAutocapitalization(.characters)
                Button("加入") {
                    store.addManualSample(manualSampleID)
                    manualSampleID = ""
                }
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
                Text("还没有样本。")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(Array(store.items.enumerated()), id: \.element.id) { index, item in
                    HStack {
                        Text("\(index + 1)")
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading) {
                            Text(item.sampleID)
                                .font(.headline)
                            if let position = item.position {
                                Text(position)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Button("撤销上一管") { store.undoLast() }
                Button("清空扫码篮", role: .destructive) { store.clearBasket() }
                Button {
                    store.confirmSession()
                } label: {
                    Label("确认并保存事件", systemImage: "checkmark.circle")
                }
                .disabled(!store.canConfirm)
            }
        }
    }

    private var exportSection: some View {
        Section("导出") {
            Text("已保存事件：\(store.events.count)")
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
        switch store.messageKind {
        case .info: return .secondary
        case .success: return .green
        case .warning: return .orange
        case .error: return .red
        }
    }
}
