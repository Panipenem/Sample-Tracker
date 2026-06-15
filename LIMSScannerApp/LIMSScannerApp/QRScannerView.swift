import AVFoundation
import SwiftUI
import VisionKit

struct QRScannerSheet: View {
    let target: ScanTarget
    let onCode: (String) -> Void
    @EnvironmentObject private var store: ScanSessionStore
    @Environment(\.dismiss) private var dismiss
    @State private var lastValue = ""

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                QRScannerView { value in
                    guard value != lastValue else { return }
                    lastValue = value
                    onCode(value)
                    if target != .sample {
                        dismiss()
                    }
                }
                .ignoresSafeArea()

                VStack(spacing: 10) {
                    if let toast = store.toast {
                        ToastView(toast: toast)
                            .transition(.move(edge: .top).combined(with: .opacity))
                    }

                    Spacer()

                    ScannerStatusPanel(target: target, basketCount: store.items.count, recentItems: Array(store.items.suffix(3).reversed()))
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 10)
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
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("完成") { dismiss() }
                }
            }
        }
    }
}

private struct ScannerStatusPanel: View {
    let target: ScanTarget
    let basketCount: Int
    let recentItems: [ScanItem]

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(target.title)
                        .font(.headline)
                    Text(target == .sample ? "扫到后自动加入扫码篮，可连续扫多管。" : "扫到盒子二维码后自动返回。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if target == .sample {
                    VStack(spacing: 2) {
                        Text("\(basketCount)")
                            .font(.title2.bold())
                        Text("已扫")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                }
            }

            if target == .sample && !recentItems.isEmpty {
                VStack(spacing: 6) {
                    ForEach(recentItems) { item in
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                            Text(item.sampleID)
                                .font(.caption.bold())
                                .lineLimit(1)
                            Spacer()
                            if let position = item.position {
                                Text(position)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .strokeBorder(Color.primary.opacity(0.08))
        )
    }
}

struct QRScannerView: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> UIViewController {
        if #available(iOS 16.0, *), DataScannerViewController.isSupported {
            let controller = VisionQRScannerViewController()
            controller.onCode = onCode
            return controller
        }

        let controller = AVFoundationScannerViewController()
        controller.onCode = onCode
        return controller
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}

@available(iOS 16.0, *)
final class VisionQRScannerViewController: UIViewController, DataScannerViewControllerDelegate {
    var onCode: ((String) -> Void)?

    private var scanner: DataScannerViewController?
    private var lastCode = ""
    private var lastCodeAt = Date.distantPast

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureScanner()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        try? scanner?.startScanning()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        scanner?.stopScanning()
    }

    private func configureScanner() {
        guard DataScannerViewController.isAvailable else {
            showCameraError("系统扫码不可用。请检查 Camera 权限，或确认设备支持 VisionKit 扫码。")
            return
        }

        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .accurate,
            recognizesMultipleItems: true,
            isHighFrameRateTrackingEnabled: true,
            isHighlightingEnabled: true
        )
        scanner.delegate = self
        addChild(scanner)
        scanner.view.frame = view.bounds
        scanner.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(scanner.view)
        scanner.didMove(toParent: self)
        self.scanner = scanner
    }

    func dataScanner(
        _ dataScanner: DataScannerViewController,
        didAdd addedItems: [RecognizedItem],
        allItems: [RecognizedItem]
    ) {
        handle(items: addedItems)
    }

    func dataScanner(
        _ dataScanner: DataScannerViewController,
        didUpdate updatedItems: [RecognizedItem],
        allItems: [RecognizedItem]
    ) {
        handle(items: updatedItems)
    }

    func dataScanner(
        _ dataScanner: DataScannerViewController,
        becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable
    ) {
        showCameraError("系统扫码不可用：\(error.localizedDescription)")
    }

    private func handle(items: [RecognizedItem]) {
        for item in items {
            guard case .barcode(let barcode) = item,
                  barcode.observation.symbology == .qr,
                  let value = barcode.payloadStringValue
            else {
                continue
            }

            emit(value)
            return
        }
    }

    private func emit(_ value: String) {
        let now = Date()
        if value == lastCode && now.timeIntervalSince(lastCodeAt) < 1.0 {
            return
        }

        lastCode = value
        lastCodeAt = now
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        onCode?(value)
    }

    private func showCameraError(_ message: String) {
        let label = UILabel()
        label.text = message
        label.textColor = .white
        label.numberOfLines = 0
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }
}

final class AVFoundationScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onCode: ((String) -> Void)?

    private let session = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var lastCode = ""
    private var lastCodeAt = Date.distantPast

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureSession()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        if !session.isRunning {
            DispatchQueue.global(qos: .userInitiated).async { [session] in
                session.startRunning()
            }
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if session.isRunning {
            DispatchQueue.global(qos: .userInitiated).async { [session] in
                session.stopRunning()
            }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    private func configureSession() {
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input)
        else {
            showCameraError("无法访问摄像头。请检查 Camera 权限。")
            return
        }

        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else {
            showCameraError("设备不支持二维码识别。")
            return
        }

        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.insertSublayer(layer, at: 0)
        previewLayer = layer
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              object.type == .qr,
              let value = object.stringValue
        else {
            return
        }

        let now = Date()
        if value == lastCode && now.timeIntervalSince(lastCodeAt) < 1.0 {
            return
        }

        lastCode = value
        lastCodeAt = now
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        onCode?(value)
    }

    private func showCameraError(_ message: String) {
        let label = UILabel()
        label.text = message
        label.textColor = .white
        label.numberOfLines = 0
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }
}
