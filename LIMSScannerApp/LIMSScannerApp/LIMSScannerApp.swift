import SwiftUI

@main
struct LIMSScannerApp: App {
    @StateObject private var store = ScanSessionStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
        }
    }
}
