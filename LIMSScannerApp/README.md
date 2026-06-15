# LIMS Scanner App

Standalone iOS companion app for field scanning workflows.

## First version scope

- Select workflow action: putaway, pickup, return, transfer, inventory, consume.
- Scan source freezer box QR.
- Scan target box QR for transfer.
- Continuously scan EP tube QR codes.
- Keep a temporary scan basket.
- Confirm the basket into local scan events.
- Export `scan_events_YYYYMMDD-HHMMSS.json` with the iOS share sheet.

The app does not modify the web LIMS SQLite database directly yet. It exports scan events that can later be imported by the web LIMS.

## Open and run

1. Open `LIMSScannerApp.xcodeproj` in Xcode.
2. Select the `LIMSScanner` scheme.
3. Select a real iPhone as the run destination.
4. Set your Apple development team under Signing & Capabilities if Xcode asks.
5. Run.

The app needs Camera permission for QR scanning.

## Export payload

The exported JSON has this shape:

```json
{
  "exportedAt": "2026-06-15T00:00:00Z",
  "app": "LIMSScannerApp",
  "events": [
    {
      "id": "...",
      "sessionID": "SCAN-20260615-230000",
      "action": "putaway",
      "sampleID": "20260615-001",
      "boxCode": "BOX-0001",
      "position": "A1",
      "targetBoxCode": null,
      "operatorName": "Alice",
      "experimentLabel": "EXP-20260615-01",
      "createdAt": "2026-06-15T00:00:00Z",
      "scannedOrder": 1
    }
  ]
}
```

## Next integration step

Add a web LIMS importer for `scan_events.json` that translates events into updates to `samples` and `sample_events`.
