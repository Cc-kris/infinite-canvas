// Vision OCR batch runner (macOS). Emits one JSON line per image.
//
// PITFALL (measured in r24): passing a multi-language list like "en-US,zh-Hans" makes
// Vision rasterize Chinese through the first locale's model — Chinese text then comes
// back empty or as conf-0.30 noise, even at 28 px. Run ONE language per invocation and
// merge results afterwards.
//
// Build: swiftc -O ocr_batch.swift -o ocr_batch
// Usage: ./ocr_batch <lang[,lang2]> <image> [image ...]
import Foundation
import Vision
import AppKit

func printJSON(_ d: [String: Any]) {
    if let j = try? JSONSerialization.data(withJSONObject: d, options: [.sortedKeys]),
       let s = String(data: j, encoding: .utf8) { print(s) }
}

let args = CommandLine.arguments
guard args.count >= 3 else {
    print("usage: ocr_batch <langs> <img...>")
    exit(2)
}
let langs = args[1].split(separator: ",").map(String.init)

for path in args[2...] {
    var rec: [String: Any] = ["file": (path as NSString).lastPathComponent, "langs": langs]
    guard let img = NSImage(contentsOfFile: path),
          let tiff = img.tiffRepresentation,
          let bmp = NSBitmapImageRep(data: tiff),
          let cg = bmp.cgImage else {
        rec["error"] = "load_failed"
        printJSON(rec)
        continue
    }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.recognitionLanguages = langs
    req.usesLanguageCorrection = true
    if #available(macOS 13.0, *) { req.automaticallyDetectsLanguage = false }
    req.minimumTextHeight = 0.005   // 0.5% of frame height; burned-in subs are far larger
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do {
        try handler.perform([req])
    } catch {
        rec["error"] = "\(error)"
        printJSON(rec)
        continue
    }
    var items: [[String: Any]] = []
    for obs in (req.results ?? []) {
        guard let c = obs.topCandidates(1).first else { continue }
        let bb = obs.boundingBox
        items.append([
            "text": c.string,
            "conf": (Double(c.confidence) * 1000).rounded() / 1000,
            "x": (Double(bb.origin.x) * 1000).rounded() / 1000,
            "y": (Double(bb.origin.y) * 1000).rounded() / 1000,
            "w": (Double(bb.size.width) * 1000).rounded() / 1000,
            "h": (Double(bb.size.height) * 1000).rounded() / 1000,
        ])
    }
    rec["texts"] = items
    printJSON(rec)
}
