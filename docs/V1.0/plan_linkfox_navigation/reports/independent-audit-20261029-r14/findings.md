# r14 findings (infinite-canvas 550b6c7 I2V/VR retry)

## Env facts (2026-10-29 ~21:00)
- App: http://127.0.0.1:3000 (vite dev, node PID 80431). Upstream https://sub2api.1006000.xyz = 200.
- Profile: /tmp/ic_r9_profile_translation
  - proxyEnabled=true, proxyUrl=http://127.0.0.1:23220 (ALIVE, canvas-proxy 0.1.3, /__media/upload, forwards /<full-url>)
  - channel sub2api-real baseUrl=https://sub2api.1006000.xyz, videoModel=sub2api-real::MiniMax-H3
  - mediaHostUrl=https://telephony-affects-borders-wider.trycloudflare.com (trycloudflare, may be stale)
- 127.0.0.1:23210 is DOWN (no listener); cloudflared pid 33008 still tunnels to it. 23210 is shared with market stack -> DO NOT start a duplicate (user ruling). It is NOT on the API path (proxyUrl is 23220); the 23210 page hits are stored media URLs in history.
- curl through proxy: `curl http://127.0.0.1:23220/https://sub2api.1006000.xyz/v1/models` -> 401 (reachable, auth required) = proxy passthrough OK.
- Key server: /tmp/ic_media/key_srv_18472.py (python PID 36035). Never read secrets.

## r13 failure read
- I2V: net=[] and "Execution context destroyed" -> no /v1/videos request captured; likely vite HMR full reload mid-run (dev server) rather than validation (probe shows submit enabled, issues=[]).
- VR: 240s timeout, net=[] -> same class of problem (no submit request seen).
- AVE: 502 ETIMEDOUT then multipart 400 utf-8 (binary as text) -> out of scope this round.

## Form facts (probe, no injection)
- I2V defaults: sourceMode=reference, videoType=product-showcase, submit enabled, hint "5s · 自适应 · 768P".
- VR: submit disabled until (source video OR public link) + >=1 ref image + prompt; link mode forwards public URL into JSON `videos:[url]` (the 922edd5 working path); clip default 0-15s.

## Plan
1. I2V: set product-watch.jpg, custom prompt, submit once, capture /v1/* req+resp, poll tool-task:v1:* every 2s.
2. VR: link mode with https://media.w3.org/2010/05/sintel/trailer.mp4 + 1 ref image + prompt, submit once.
3. On terminal: download(file-saver)->ftyp+sha256, save asset, send to canvas, fresh reload -> history row + panel.
4. On failure: keep real error (upstream code/message), no injection.
