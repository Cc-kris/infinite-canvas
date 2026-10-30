#!/usr/bin/env bash
# r24 video-translation CONTENT re-verification — full reproducible pipeline.
#
# Verifies only content-level facts the r22-f report left unverified:
#   1) which language the result audio actually speaks (ASR + LID, not energy correlation)
#   2) whether subtitles are burned in at all, and in which language (OCR, single-locale)
#
# Prereqs:
#   - ffmpeg/ffprobe  (this box: /opt/homebrew/Cellar/ffmpeg/8.1/bin, not linked into PATH)
#   - python venv with: faster-whisper==1.2.1 ctranslate2 numpy
#   - CTranslate2 whisper model dir(s) available offline
#   - swiftc (Xcode CLT) for the Vision OCR binary
#
# Usage:
#   ./run_all.sh <source.mp4> <result.mp4> <outdir> <model_dir> [ocr_langs]
set -euo pipefail

SRC=${1:?source mp4}
RES=${2:?result mp4}
OUT=${3:?outdir}
MODEL=${4:?ctranslate2 model dir}
LANGS=${5:-"zh-Hans en-US"}
FFDIR=${FFDIR:-/opt/homebrew/Cellar/ffmpeg/8.1/bin}
PY=${PY:-python3}

mkdir -p "$OUT/artifacts"
A="$OUT/artifacts"

echo "== 1. probe + audio extraction (16k mono s16le)"
"$FFDIR/ffprobe" -v error -show_streams -show_format "$SRC"  > "$A/probe-source.txt"
"$FFDIR/ffprobe" -v error -show_streams -show_format "$RES"  > "$A/probe-result.txt"
"$FFDIR/ffmpeg" -v error -y -i "$SRC" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$A/source-16k-mono.wav"
"$FFDIR/ffmpeg" -v error -y -i "$RES" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$A/result-16k-mono.wav"
sha256sum "$SRC" "$RES" > "$A/sha256.txt" 2>/dev/null || shasum -a 256 "$SRC" "$RES" > "$A/sha256.txt"

echo "== 2. ASR + language ID + Silero VAD speech coverage"
"$PY" "$(dirname "$0")/asr_transcribe.py" --model-dir "$MODEL" \
  --wav "$A/source-16k-mono.wav" --tag source \
  --wav "$A/result-16k-mono.wav" --tag result \
  --vad --forced en,zh --out "$A/asr.json"

echo "== 3. frame extraction: native all frames + bottom 32% band upscaled 3x"
"$FFDIR/ffmpeg" -v error -y -i "$SRC" "$A/frames-source-%04d.png"
"$FFDIR/ffmpeg" -v error -y -i "$RES" "$A/frames-result-%04d.png"
"$FFDIR/ffmpeg" -v error -y -i "$SRC" -vf "crop=iw:ih*0.32:0:ih*0.68,scale=iw*3:ih*3:flags=lanczos" "$A/band-source-%04d.png"
"$FFDIR/ffmpeg" -v error -y -i "$RES" -vf "crop=iw:ih*0.32:0:ih*0.68,scale=iw*3:ih*3:flags=lanczos" "$A/band-result-%04d.png"

echo "== 4. OCR positive controls + sensitivity ladder (proves the detector can see subs)"
"$PY" "$(dirname "$0")/make_ocr_controls.py" "$A"

echo "== 5. OCR sweep — ONE language per invocation (multi-lang silently kills zh)"
swiftc -O "$(dirname "$0")/ocr_batch.swift" -o "$OUT/ocr_batch"
for L in $LANGS; do
  for SET in frames-result band-result frames-source band-source; do
    "$OUT/ocr_batch" "$L" "$A/$SET"-*.png > "$A/ocr-$SET-$L.jsonl"
  done
  "$OUT/ocr_batch" "$L" "$A"/ocr-control-*.png "$A"/ocr-sens-*.png > "$A/ocr-controls-$L.jsonl"
done

echo "== 6. summarize"
"$PY" "$(dirname "$0")/summarize.py" "$A" "$OUT/summary.json"
echo "done -> $OUT/summary.json"
