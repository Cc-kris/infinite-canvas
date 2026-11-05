"""把 <TOOL>/original.png 与 <TOOL>/local.png 拼成左右对照的 pair.jpg。用法：python3 visual-parity-pair.py TOOL_ID [TOOL_ID...]"""
import sys
from PIL import Image
OUT = "/Users/mac/Documents/Dev/infinite-canvas/docs/V1.0/e2e-1to1/20261105"
for d in sys.argv[1:]:
    a = Image.open(f"{OUT}/{d}/original.png").convert("RGB"); b = Image.open(f"{OUT}/{d}/local.png").convert("RGB")
    c = Image.new("RGB", (a.width + b.width + 20, max(a.height, b.height)), (255, 0, 0)); c.paste(a, (0, 0)); c.paste(b, (a.width + 20, 0))
    c.resize((c.width // 2, c.height // 2)).save(f"{OUT}/{d}/pair.jpg", quality=80); print("pair", d)
