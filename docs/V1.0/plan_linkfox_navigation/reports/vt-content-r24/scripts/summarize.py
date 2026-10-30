#!/usr/bin/env python3
"""Aggregate OCR jsonl + ASR json into a verdict table.

Usage: summarize.py <artifacts_dir> <out.json>

Verdict rules (conservative, stated in the report):
  - a frame "carries text" only if conf >= 0.5 AND the box is >= 6 px tall on a 768 px frame
    (conf 0.30 single-glyph hits are Vision noise on texture/watermark, not captions)
  - burned-in subtitles require text present in the bottom 40% band on a sustained run of
    frames (>= 10% of frames), otherwise "no subtitles detected"
"""
import glob
import json
import os
import sys

MIN_CONF = 0.5
MIN_H = 0.008   # 0.8% of frame height ~= 6 px on 768
MAX_H = 0.20    # taller boxes are background geometry, not glyphs (measured: a lone "1"
                # came back with box height 0.62 on the source clip)


def load(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def real_hits(rows):
    hits = []
    for r in rows:
        for t in r.get("texts", []):
            if t["conf"] >= MIN_CONF and MIN_H <= t["h"] <= MAX_H:
                hits.append({"file": r["file"], "text": t["text"], "conf": t["conf"],
                             "x": t["x"], "y": t["y"], "h": t["h"]})
    return hits


def main():
    art, out = sys.argv[1], sys.argv[2]
    summary = {"ocr": {}, "asr": None}
    for path in sorted(glob.glob(os.path.join(art, "ocr-*.jsonl"))):
        name = os.path.basename(path)[4:-6]
        rows = load(path)
        hits = real_hits(rows)
        bottom = [h for h in hits if h["y"] < 0.40]
        summary["ocr"][name] = {
            "frames": len(rows),
            "frames_with_text": len({h["file"] for h in hits}),
            "hits": len(hits),
            "bottom_band_hits": len(bottom),
            "samples": hits[:8],
        }
    asr_path = None
    for cand in ("asr.json", "asr-deep-result.json", "asr-raw-small.json"):
        p = os.path.join(art, cand)
        if os.path.exists(p):
            asr_path = p
            break
    if asr_path:
        with open(asr_path, encoding="utf-8") as f:
            asr = json.load(f)
        # Two layouts are supported: {"tracks": {tag: ...}} and {config_json_string: {...}}
        tracks = asr.get("tracks", asr)
        summary["asr"] = {tag: {
            "lang": (t.get("info") or {}).get("lang") or (t.get("lid") or {}).get("best"),
            "p": (t.get("info") or {}).get("p") if "info" in t else (t.get("lid") or {}).get("p"),
            "text": " ".join(s["text"] for s in t.get("segments", [])
                             or t.get("auto", {}).get("segments", [])),
            "nospeech": [s.get("nospeech") for s in t.get("segments", [])],
            "vad_ratio_max": max([v["ratio"] for v in t.get("vad", [])] or [None]),
        } for tag, t in tracks.items()}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(json.dumps(summary, ensure_ascii=False, indent=2)[:3000])


if __name__ == "__main__":
    main()
