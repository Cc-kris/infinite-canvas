#!/usr/bin/env python3
"""Generate OCR positive controls and a font-size sensitivity ladder on a real video frame.

Why: an empty OCR sweep proves nothing unless the detector is shown to see subtitle-like
text on THIS footage at THIS resolution. Controls are drawn over a real result frame with a
black stroke + white fill, the way burned-in captions look.

Usage: make_ocr_controls.py <artifacts_dir> [frame.png]
Writes: ocr-control-{en,zh}.png, ocr-sens-{en,zh}-{14,16,18,20,24,28}.png
"""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFont

EN_FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
ZH_FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"   # PingFang.ttc is absent on macOS 26

EN_TEXT = "English subtitle sensitivity test at this size"
ZH_TEXT = "中文敏感度测试字号"


def draw(src, path, text, font_path, size, yfrac=0.86):
    img = src.copy()
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(font_path, size)
    W, H = img.size
    x = (W - d.textlength(text, font=f)) / 2
    y = H * yfrac
    for dx in (-2, -1, 0, 1, 2):          # stroke first
        for dy in (-2, -1, 0, 1, 2):
            d.text((x + dx, y + dy), text, font=f, fill=(0, 0, 0))
    d.text((x, y), text, font=f, fill=(255, 255, 255))
    img.save(path)


def main():
    art = sys.argv[1]
    frame = sys.argv[2] if len(sys.argv) > 2 else None
    if not frame:
        cands = sorted(glob.glob(os.path.join(art, "frames-result-*.png"))) or \
                sorted(glob.glob(os.path.join(art, "frames-result", "*.png")))
        if not cands:
            raise SystemExit(f"no frames under {art}")
        frame = cands[len(cands) // 2]
    src = Image.open(frame).convert("RGB")
    print("base frame:", frame, src.size)

    draw(src, os.path.join(art, "ocr-control-en.png"), EN_TEXT, EN_FONT, 30)
    draw(src, os.path.join(art, "ocr-control-zh.png"), ZH_TEXT, ZH_FONT, 30)
    for size in (14, 16, 18, 20, 24, 28):
        draw(src, os.path.join(art, f"ocr-sens-en-{size}.png"), EN_TEXT, EN_FONT, size)
        draw(src, os.path.join(art, f"ocr-sens-zh-{size}.png"), ZH_TEXT, ZH_FONT, size)


if __name__ == "__main__":
    main()
