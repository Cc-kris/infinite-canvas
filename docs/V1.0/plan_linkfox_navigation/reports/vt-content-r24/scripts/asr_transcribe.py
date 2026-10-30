#!/usr/bin/env python3
"""Audio content verification: VAD speech coverage + Whisper language identification + transcription.

Text-level evidence only — deliberately does NOT use audio energy/envelope correlation as a
language or translation proxy (that was exactly the gap in the r22-f report).

Reads 16 kHz mono s16le PCM WAV with stdlib `wave` + numpy so it never touches PyAV.
(PyAV/faster-whisper skew raised `TypeError: open() got an unexpected keyword argument
'metadata_errors'` with av 19.0.2 in this environment.)

Usage:
  asr_transcribe.py --model-dir DIR --wav a.wav --wav b.wav --tag source --tag result \
      --out out.json --vad --forced en,zh

--model-dir must point at a CTranslate2 whisper model dir, e.g.
  ~/.cache/huggingface/hub/models--Systran--faster-whisper-small/snapshots/<sha>/
"""
import argparse
import json
import wave

import numpy as np
from faster_whisper import WhisperModel
from faster_whisper.vad import VadOptions, get_speech_timestamps


def load_wav(path):
    with wave.open(path, "rb") as w:
        got = (w.getnchannels(), w.getsampwidth(), w.getframerate())
        if got != (1, 2, 16000):
            raise SystemExit(f"{path}: need 16kHz mono s16le PCM, got ch/width/sr={got}")
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def vad_coverage(audio, sr=16000, thresholds=(0.15, 0.2, 0.3, 0.4, 0.5)):
    """Silero VAD speech coverage. Near-0% means the track carries no speech at all
    (e.g. music/SFX only), which makes any 'translation' claim unfalsifiable by ASR."""
    out = []
    for th in thresholds:
        ts = get_speech_timestamps(
            audio,
            VadOptions(threshold=th, min_speech_duration_ms=100, min_silence_duration_ms=100),
            sampling_rate=sr,
        )
        sec = sum(t["end"] - t["start"] for t in ts) / sr
        out.append({
            "threshold": th,
            "chunks": len(ts),
            "speech_sec": round(sec, 3),
            "ratio": round(sec / (len(audio) / sr), 4),
            "spans": [[round(t["start"] / sr, 2), round(t["end"] / sr, 2)] for t in ts],
        })
    return out


def transcribe(model, audio, language=None, vad_filter=True, beam_size=5, temperature=0.0):
    segs, info = model.transcribe(
        audio, language=language, beam_size=beam_size, temperature=temperature,
        vad_filter=vad_filter, condition_on_previous_text=False, word_timestamps=True,
    )
    segs = list(segs)
    return {
        "requested_language": language,
        "vad_filter": vad_filter,
        "beam_size": beam_size,
        "detected_language": info.language,
        "language_probability": round(info.language_probability, 4),
        "duration": round(info.duration, 3),
        "segments": [{
            "start": round(s.start, 3),
            "end": round(s.end, 3),
            "text": s.text.strip(),
            "avg_logprob": round(s.avg_logprob, 4),
            "no_speech_prob": round(s.no_speech_prob, 4),
            "words": [{"w": w.word, "p": round(w.probability, 3), "t": round(w.start, 2)}
                      for w in (s.words or [])],
        } for s in segs],
    }


def lid_distribution(model, audio):
    lang, prob, allprobs = model.detect_language(audio)
    pairs = list(allprobs) if not isinstance(allprobs, dict) else list(allprobs.items())
    pairs = [(str(k), float(v)) for k, v in pairs]
    top = sorted(pairs, key=lambda x: -x[1])[:8]
    return {"best": lang, "p": round(float(prob), 4), "top": [[k, round(v, 4)] for k, v in top]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--wav", action="append", required=True)
    ap.add_argument("--tag", action="append", default=[])
    ap.add_argument("--out", required=True)
    ap.add_argument("--vad", action="store_true")
    ap.add_argument("--forced", default="", help="comma list, e.g. en,zh")
    ap.add_argument("--compute-type", default="int8")
    args = ap.parse_args()

    tags = args.tag or [f"track{i}" for i in range(len(args.wav))]
    if len(tags) != len(args.wav):
        raise SystemExit("--tag count must match --wav count")

    model = WhisperModel(args.model_dir, device="cpu", compute_type=args.compute_type,
                         local_files_only=True)
    report = {"model_dir": args.model_dir, "tracks": {}}
    for tag, path in zip(tags, args.wav):
        audio = load_wav(path)
        entry = {
            "wav": path,
            "duration": round(len(audio) / 16000, 3),
            "rms": round(float(np.sqrt((audio ** 2).mean())), 4),
            "lid": lid_distribution(model, audio),
            "auto": transcribe(model, audio, language=None),
            "forced": {},
        }
        if args.vad:
            entry["vad"] = vad_coverage(audio)
        for lang in [x for x in args.forced.split(",") if x]:
            entry["forced"][lang] = transcribe(model, audio, language=lang)
        report["tracks"][tag] = entry
        print(f"[{tag}] lid={entry['lid']['best']} p={entry['lid']['p']} "
              f"text={[s['text'] for s in entry['auto']['segments']]}", flush=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print("wrote", args.out)


if __name__ == "__main__":
    main()
