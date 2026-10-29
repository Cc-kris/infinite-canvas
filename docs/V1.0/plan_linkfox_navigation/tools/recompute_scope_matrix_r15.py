#!/usr/bin/env python3
"""R15 (2026-10-29): strict re-audit on top of R14 (6ca29da) + the read-only
residual review committed at 74aba4b.

Absorbs only *committed* evidence introduced by:
  6ede584  tool-result bytes persistence root-cause fix (mapper keeps url / IDB
           provenance key `tool-result:<taskId>:<index>:<nano>` / anti-downgrade
           upsert) + provenance-heal tests
  a565e63  r15b root-cause doc: historical tasks are irreversibly byte-less;
           fresh-reload readback of a real task by storageKey (1,963,716B)
  c125c62  R17 three-action machine receipts after the fresh-reload fixes
           (PRODUCT_IMAGE_SUITE / NEW_DESIGNER)
  73b09be  PRODUCT_SCENE real succeeded task task-mvtly3vu-fdqgy7 (2,398,828B
           / sha fa5ee380…) — pre-reload console evidence only
  8df2d8a  PRINT_EXTRACT real succeeded task task-mvtlxua2-kh39uf (2,783,996B)
           + committed PNG + prose fresh-reload section
  560a46e  HAND_REPAIR three-action real receipt task-mvtbe5rp-0maafh
           (2,153,466B / sha a34cea71…, asset + canvas node all match)
plus the follow-up receipts already in HEAD
  5156699  r13 report claiming HAND_REPAIR F PASS (no machine receipt at the time)
  7f64b09  CHANGE_COLOR_V2 / REMOVE_PEN H-leg probes (BLOCKED_NO_BYTES)
  b5d6263  PRODUCT_SCENE / HANDHELD_GOODS H recheck (PARTIAL held)
  0005ef4  PRINT_EXTRACT inventory before the successful run (PARTIAL held)
  f19a784  gate after 6ede584: typecheck/test/build exit 0, 1475 pass / 84 files

Hard rules carried over from R13/R14 and **not relaxed**:
  * evidence must be committed (``git ls-tree HEAD``) and byte/sha reconcilable
  * F: result + >=2 machine action legs (download / save-to-assets / send-to-canvas)
  * T: no brand / billing / case-module placeholder in **visible** copy
       (re-derived from the comment-stripped HEAD blob)
  * R: declared bytes must reproduce a committed artifact (size and/or sha256)
  * H: real task id + **machine** reload marker + post-reload observation + bytes
       -> R15 tightening: a prose-only README section does NOT count as the
          "machine reload marker" leg; the leg needs structured JSON fields.
          (Applied identically to R14's I2V evidence chain; nothing is looser.)
  * any cell not backed by committed machine evidence stays PARTIAL/BLOCKED

Baseline note (documented, not silently reconciled): the committed R13 matrix
(5156699) was produced by a compacted generator (H 11/28) and the R14 matrix was
derived from the script chain (H 31/8). R15 diffs against the **committed R14
matrix** (matrix.json in reports/independent-audit-20261029-r14-matrix), which is
the artefact the reviewer actually reviewed at 74aba4b.
"""
from __future__ import annotations

import hashlib
import importlib.util
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

_spec = importlib.util.spec_from_file_location(
    "r14audit", os.path.join(HERE, "recompute_scope_matrix_r14.py"))
r14 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(r14)  # type: ignore[union-attr]

DOCS = r14.DOCS
ROOT = r14.ROOT
OUTDIR = os.path.join(DOCS, "reports/independent-audit-20261029-r15-matrix")
EV = "real-acceptance/"
R14_JSON = "reports/independent-audit-20261029-r14-matrix/matrix.json"
R17A = EV + "R17-three-actions-20261029/ACTIONS.json"
HR = EV + "HAND_REPAIR/r13-three-actions-real.json"
HR_PNG = "edit8-h-real-20261029/HAND_REPAIR-result-1024x1024.png"
ND_PNG = "suite-design-realgen-20261029/new-designer-result-1.png"
SCENE = "r16-scene-real-20261029/"
PE = "evidence/real-acceptance/PRINT_EXTRACT/"

ABSORBED = [
    ("6ede584", "结果字节持久化共同根因修复：mapper 同时保留 {dataUrl,url}、入库键带 provenance "
                "`tool-result:<taskId>:<index>:<nano>`、`listTaskResultMedia(taskId)` 反查、"
                "`healResultMediaByProvenance()` 只在字节真实存在时挂回、`upsertTask` 防无 storageKey 降级覆盖；"
                "新增 provenance-heal 测试（f19a784 门禁 typecheck/test/build exit 0，1475 pass/84 files）"),
    ("a565e63", "r15b 根因时间线对账：CHANGE_COLOR_V2 两条历史成功任务落在 G1 入库/B7 url 修复之前，"
                "字节属**不可逆丢失**（不注入不补造）；fresh reload 后按 storageKey 抽样读回真实任务 "
                "task-mvtk9pu3-sfifnh = 1,963,716B / video/mp4（README 散文，非机器回执）"),
    ("c125c62", "R17 修复后三动作机器回执：PIS 存资产 2/2（assetId VNzmLg-tuAfTh0nJcODrp 2,785,837B "
                "sha 6f9dec2a…；wz_Za93ggobpIS9WqsPkG 2,840,825B）+ 发画布 2/2（project/node 各 1 image 节点）；"
                "NEW_DESIGNER 下载 411,801B sha 90e28e0f… + 存资产 2 条同字节 + 发画布 Z_1vTtbr… / image-1793282047892-95442"),
    ("73b09be", "PRODUCT_SCENE 真实成功任务 task-mvtly3vu-fdqgy7：storageKey "
                "`tool-result:task-mvtly3vu-fdqgy7:0:TTlb-VmksNFfPn_GhRyTk`、2,398,828B / sha fa5ee380…、"
                "下载/存资产 ofbXDtlnY5gFse29gfpuf/发画布 A6AI_SDmdn8KK1WmaHkg5；回执自述为**刷新前**控制台证据"),
    ("8df2d8a", "PRINT_EXTRACT 真实成功任务 task-mvtlxua2-kh39uf：succeeded / payloadDropped=false / "
                "storageKey `tool-result:task-mvtlxua2-kh39uf:0:jf8VlMsU9spY5W5raRSnO` / 2,783,996B / image/png + "
                "上游 OSS url；落盘 result.png 同尺寸（md5 ccdef37f…）；README §3 为**散文** reload 观测，"
                "存资产动作 UNVERIFIED"),
    ("560a46e", "HAND_REPAIR 真实任务 task-mvtbe5rp-0maafh 三动作回执：下载/存资产 assetId "
                "qVZbf4pJUvsoYXGe04jvD/发画布 b35kvRaZb6zdwcOT_Yn2i + image-1793281461613-pl9uk，"
                "三处字节 2,153,466B / sha a34cea71… 互证，metadata.taskId 绑定"),
    ("5156699", "r13 报告先行主张 HAND_REPAIR F PARTIAL→PASS（当时无机器回执；R14 树内未生效，R15 由 560a46e 兑现）"),
    ("7f64b09", "CHANGE_COLOR_V2 / REMOVE_PEN H 腿探针：真实 taskId 齐备但 BLOCKED_NO_BYTES（payloadDropped）"),
    ("f19a784", "6ede584 后独立快照三闸：typecheck/test/build exit 0，1475 pass / 0 fail / 84 files"),
]

# ---------------------------------------------------------------- overrides
OVERRIDES15: dict[tuple[str, str], tuple[str, str, list[str]]] = {
    ("HAND_REPAIR", "F"): (
        "PASS",
        "560a46e 真实任务 task-mvtbe5rp-0maafh 三动作机器回执齐备：下载 2,153,466B/sha a34cea71…、"
        "存入资产 assetId qVZbf4pJUvsoYXGe04jvD（metadata.taskId 同源）、发画布 project "
        "b35kvRaZb6zdwcOT_Yn2i + node image-1793281461613-pl9uk；三处字节与已提交产物 "
        "edit8-h-real-20261029/HAND_REPAIR-result-1024x1024.png 逐位一致（R15 实算复核）",
        [HR, HR_PNG, EV + "HAND_REPAIR/R13_F_HAND_REPAIR_NOTES.md"],
    ),
    ("NEW_DESIGNER", "F"): (
        "PASS",
        "c125c62 R17 修复后三动作机器回执（ACTIONS.json，不新生成）：下载 411,801B/sha 90e28e0f…（落盘 "
        "~/Downloads 与 IDB 同 sha）、存资产 2 条 assetId nowDKQUvmRssATNlZ83VO / 8J_BAwI8zxZ4ShWj0fxB7 同字节、"
        "发画布 project Z_1vTtbrlxiYoAUmDXh3t + node image-1793282047892-95442（image）→ c034fae 代码腿有了回执腿",
        [R17A, ND_PNG],
    ),
    ("NEW_DESIGNER", "R"): (
        "PASS",
        "回执声明 411,801B / sha 90e28e0f… 可由已提交产物 "
        "suite-design-realgen-20261029/new-designer-result-1.png 逐位复算（R15 实算 411,801B / 90e28e0f… 一致），"
        "且 c125c62 落盘文件 bytesEqual/shaEqual 同为 true → R14 的「证据链断裂」结论已不成立（74aba4b 已指出）",
        [R17A, ND_PNG],
    ),
}

# ------------------------------------------------------------ note refreshes
NOTE_REFRESH15: dict[tuple[str, str], str] = {
    # ---- PASS cells whose evidence got strictly stronger (verdict unchanged) ----
    ("PRODUCT_IMAGE_SUITE", "F"): (
        "R14 PASS + c125c62 全结构化回执：存资产 2/2（assetId VNzmLg-tuAfTh0nJcODrp 2,785,837B、"
        "wz_Za93ggobpIS9WqsPkG 2,840,825B）、发画布 2/2（project aGnnTvJu1QdMhV7H_hu9_ / y8FGuKkp7tc1KWnIRwB-f 各 1 image 节点）、"
        "下载 1/2（第二张被 Chrome 同源连续自动下载静默拦截，非应用异常）→ 三腿成立且首次含 assetId/nodeId 机器字段"
    ),
    # ---- maintained PARTIAL cells (gaps re-stated with R15 evidence) ----
    ("PRODUCT_SCENE", "H"): (
        "73b09be 补齐真实成功任务 task-mvtly3vu-fdqgy7（2,398,828B/sha fa5ee380… 与已提交 PNG 一致）与三动作，"
        "但回执自述「未刷新前的控制台证据」——无机器 reload 标记、无刷新后观测字段 → H 仍缺两条腿，维持 PARTIAL"
    ),
    ("PRINT_EXTRACT", "H"): (
        "8df2d8a 首次拿到 succeeded 真实任务 task-mvtlxua2-kh39uf（payloadDropped=false、storageKey、2,783,996B、"
        "落盘 result.png 同尺寸）→ 任务腿与字节腿成立；但 refresh 观测仅 README §3 散文（无 steps.freshLoad/"
        "persistedTask 之类机器字段），且存资产动作 UNVERIFIED → **只差一条机器 reload 回执**，维持 PARTIAL"
    ),
    ("VIDEO_REPLICATION", "H"): (
        "a565e63 抽样显示 task-mvtk9pu3-sfifnh 现已 succeeded（payloadDropped=false，storageKey "
        "`tool-result:4zwepLZTtpMan11tTGMKR`，读回 1,963,716B / video/mp4），但该结论只存在于 README 散文："
        "无机器 reload 回执、无刷新后该工具面板观测 → 由「上游 502 阻塞」降级为「缺机器回执」，维持 PARTIAL"
    ),
    ("VIDEO_REPLICATION", "R"): (
        "声明字节共有两个：旧回执 1,297,168B（属 IMAGE_TO_VIDEO 产物，不能跨工具顶替）、a565e63 抽样 1,963,716B；"
        "HEAD 内无 1,963,716B 产物（git ls-tree 实测：仅 1,297,168 / 2,277,978 存在）→ 无可复算产物，维持 PARTIAL"
    ),
    ("VIDEO_REPLICATION", "F"): (
        "HEAD 内无任何该工具的动作回执（无 download/saveAsset/sendCanvas 结构化字段），a565e63 只是字节抽样 → 维持 PARTIAL"
    ),
    ("AI_VIDEO_EDITING", "H"): (
        "1ba727c：task-mvtkgo4b-gaomk5 status=failed（提交链未确认、无 upstream 产物），本轮无新任务/无新回执 → 维持 PARTIAL"
    ),
    ("AI_VIDEO_EDITING", "F"): "仅 download 一项动作回执（存资产/发画布无结构化回执）→ 维持 PARTIAL",
    ("VIDEO_CONCAT", "F"): (
        "0e8f9f1+af0522f：下载 2,133,234B/sha daf59082… 与已提交 downloaded.mp4 一致（硬腿 1）；"
        "存资产 tool_assets 0 条同尺、media_files 无该 storageKey、canvasVideoNodes=[] → 维持 PARTIAL"
    ),
    ("VIDEO_TRANSLATION", "F"): (
        "上游 /videos 只收 JSON、拒上传字节（400），HEAD 内仍无成功样例可挂三动作 → 维持 PARTIAL（上游阻塞）"
    ),
    ("CHANGE_COLOR_V2", "H"): (
        "7f64b09 探针：真实 taskId 齐备但 BLOCKED_NO_BYTES；a565e63 时间线对账证明这两条任务成功于 00:35（G1 入库 01:14 / "
        "B7 url 01:23 之前）→ 字节属不可逆丢失，不可注入补造；6ede584 只保证**新**任务不再丢字节 → 维持 PARTIAL"
    ),
    ("REMOVE_PEN", "H"): (
        "7f64b09 探针 + 回执内 3 处 payloadDropped=true，无 storageKey/url/bytes；同属 a565e63 的不可逆丢失窗口 → 维持 PARTIAL"
    ),
    ("HANDHELD_GOODS", "H"): (
        "b5d6263 复核 + 73b09be 报告：唯一落库任务 task-mvs5p8g8-or3oim 仍 failed / submit-unconfirmed（刷新中断、items=0、"
        "无 upstreamTaskId）→ 无成功任务可绑，维持 PARTIAL"
    ),
    ("IMAGE_TEXT_EDIT", "H"): (
        "H4-real 回执 payloadDropped=true（BLOCKED(payload)），无 storageKey/url/bytes；24165da 只修 hydrate 代码腿 → 维持 PARTIAL"
    ),
    ("NEW_DESIGNER", "H"): (
        "维持 PASS（H4-real 机器 reload 标记 + 411,801B/sha 对账），c125c62 另证修复后下载 sha 与 IDB 一致"
    ),
}

PASS = "PASS"


class Audit15(r14.Audit14):
    """R15: R14 + 3 strictly evidenced flips + machine assertions for every cell."""

    # ---------------------------- assertions ----------------------------
    def h_asserts15(self) -> dict:
        out: dict[str, list] = {k: list(v) for k, v in (self.h_asserts14() or {}).items()}

        def add(tid, check, ok, detail=""):
            out.setdefault(tid, []).append({"check": check, "ok": bool(ok), "detail": str(detail)})

        # ===== HAND_REPAIR F: three machine action legs (560a46e) =====
        hr = self._j(HR) or {}
        hr_sz, hr_sha = self.disk_sha(HR_PNG)
        acts = hr.get("actions") or {}
        dl = acts.get("download") or {}
        sa = acts.get("saveAsset") or {}
        cv = acts.get("sendCanvas") or {}
        add("HAND_REPAIR", "receipt_committed_clean", self._clean(HR), "git status clean")
        add("HAND_REPAIR", "task_id_real",
            str(hr.get("taskId", "")).startswith("task-mv"), hr.get("taskId"))
        add("HAND_REPAIR", "artifact_bytes_sha_on_disk",
            hr_sz == 2153466 and hr_sha == "a34cea71ca7da6dec09ee6167367f6c60ba600e4ff44ec0c6441b6f5f3800e20",
            f"disk={hr_sz}B sha={hr_sha[:16]}")
        add("HAND_REPAIR", "download_leg_matches_disk",
            dl.get("bytes") == hr_sz and dl.get("sha256") == hr_sha,
            f"dl={dl.get('bytes')}B sha ok={dl.get('sha256') == hr_sha}")
        add("HAND_REPAIR", "save_asset_leg_bound",
            bool(sa.get("assetId")) and sa.get("bytes") == hr_sz and sa.get("sha256") == hr_sha
            and (sa.get("metadata") or {}).get("taskId") == hr.get("taskId"),
            f"assetId={sa.get('assetId')} meta.task={(sa.get('metadata') or {}).get('taskId')}")
        add("HAND_REPAIR", "send_canvas_leg_bound",
            bool(cv.get("projectId")) and bool(cv.get("nodeId")) and cv.get("bytes") == hr_sz
            and cv.get("sha256") == hr_sha,
            f"{cv.get('projectId')} / {cv.get('nodeId')}")
        add("HAND_REPAIR", "three_legs_cross_checked",
            (hr.get("crossCheck") or {}).get("allMatch") is True,
            str(hr.get("crossCheck")))

        # ===== NEW_DESIGNER F/R: post-fix three actions (c125c62) =====
        r17 = self._j(R17A) or {}
        nd = r17.get("NEW_DESIGNER") or {}
        nd_sz, nd_sha = self.disk_sha(ND_PNG)
        nd_dl = nd.get("download") or {}
        nd_cv = nd.get("sendToCanvas") or {}
        nd_sa = nd.get("saveToAssets") or []
        add("NEW_DESIGNER", "receipt_committed_clean", self._clean(R17A), "git status clean")
        add("NEW_DESIGNER", "artifact_bytes_sha_on_disk",
            nd_sz == 411801 and nd_sha == "90e28e0f93420bb42270708737760d810d9df1e986566aed60d61a79b4a09d88",
            f"disk={nd_sz}B sha={nd_sha[:16]}")
        add("NEW_DESIGNER", "download_leg_matches_disk",
            nd_dl.get("bytes") == nd_sz and nd_dl.get("sha256") == nd_sha
            and nd_dl.get("bytesEqual") is True and nd_dl.get("shaEqual") is True,
            f"dl={nd_dl.get('bytes')}B")
        add("NEW_DESIGNER", "save_asset_legs_bytes_equal",
            len(nd_sa) >= 1 and all(a.get("bytes") == nd_sz and a.get("sha256") == nd_sha
                                    and bool(a.get("assetId")) for a in nd_sa),
            f"{len(nd_sa)} 条：{[a.get('assetId') for a in nd_sa]}")
        add("NEW_DESIGNER", "send_canvas_leg_bound",
            bool(nd_cv.get("projectId")) and bool(nd_cv.get("nodeId"))
            and nd_cv.get("nodeType") == "image" and nd_cv.get("verdict") == "PASS",
            f"{nd_cv.get('projectId')} / {nd_cv.get('nodeId')}")
        add("NEW_DESIGNER", "stored_result_matches_artifact",
            (nd.get("storedResult") or {}).get("bytes") == nd_sz
            and (nd.get("storedResult") or {}).get("sha256") == nd_sha,
            str((nd.get("storedResult") or {}).get("storageKey")))

        # ===== PRODUCT_SCENE H gap: real bytes but no machine reload marker =====
        sc = self._j(SCENE + "receipt.json") or {}
        sc_sz, sc_sha = self.disk_sha(SCENE + "PRODUCT_SCENE-result-1.png")
        sc_res = sc.get("result") or {}
        add("PRODUCT_SCENE", "task_succeeded_with_bytes",
            sc.get("status") == "succeeded" and str(sc.get("taskId", "")).startswith("task-mv")
            and sc_res.get("bytes") == 2398828 and sc_res.get("sha256") == sc_sha and sc_sz == 2398828,
            f"{sc.get('taskId')} {sc_res.get('bytes')}B disk={sc_sz}")
        add("PRODUCT_SCENE", "no_machine_reload_marker",
            not (sc.get("steps") or sc.get("freshLoad") or sc.get("panelAfterReload"))
            and "未刷新" in str(sc.get("note", "")),
            "receipt 无 steps/freshLoad/panelAfterReload 字段，自述为刷新前证据 → H 维持 PARTIAL")

        # ===== PRINT_EXTRACT H gap: machine task/bytes, prose-only reload =====
        pe = self._j(PE + "task.json") or {}
        pe_item = ((pe.get("result") or {}).get("items") or [{}])[0]
        pe_sz, pe_sha = self.disk_sha(PE + "result.png")
        pe_md5 = ""
        p_pe = r14.r13._resolve(PE + "result.png")
        if p_pe:
            pe_md5 = hashlib.md5(open(p_pe, "rb").read()).hexdigest()
        add("PRINT_EXTRACT", "task_succeeded_payload_kept",
            pe.get("status") == "succeeded" and pe_item.get("payloadDropped") is False
            and bool(pe_item.get("storageKey")) and pe_item.get("bytes") == 2783996,
            f"{pe.get('id')} {pe_item.get('bytes')}B key={str(pe_item.get('storageKey'))[:28]}")
        add("PRINT_EXTRACT", "artifact_bytes_match_receipt",
            pe_sz == 2783996 and pe_md5 == "ccdef37fe1cc90b5920d200ff9c2417e",
            f"disk={pe_sz}B md5={pe_md5}")
        add("PRINT_EXTRACT", "no_machine_reload_receipt",
            not (pe.get("steps") or pe.get("freshLoad") or pe.get("panelAfterReload")),
            "reload 观测仅 README §3 散文；task.json 无刷新序列字段 → H 维持 PARTIAL（只差机器 reload 回执）")
        add("PRINT_EXTRACT", "save_asset_still_unverified",
            "UNVERIFIED" in open(r14.r13._resolve("evidence/real-acceptance/PRINT_EXTRACT/README.md")
                                or "/dev/null", encoding="utf-8").read(),
            "README §4 存资产=UNVERIFIED（toast 被覆盖）")

        # ===== VIDEO_REPLICATION: sampled bytes have no committed artifact =====
        rows = subprocess.run(["git", "-C", ROOT, "ls-tree", "-r", "-l", "HEAD"],
                              capture_output=True, text=True).stdout
        add("VIDEO_REPLICATION", "no_committed_artifact_1963716B",
            " 1963716 " not in rows and " 1963716\t" not in rows,
            "git ls-tree 实测无 1,963,716B 产物（仅 1,297,168 / 2,277,978）→ R 维持 PARTIAL")
        add("VIDEO_REPLICATION", "only_download_leg",
            not os.path.exists(r14.r13._resolve(EV + "VIDEO_REPLICATION/actions.json") or ""),
            "HEAD 内无该工具 download/saveAsset/sendCanvas 结构化动作回执 → F 维持 PARTIAL")

        # ===== CHANGE_COLOR_V2 / REMOVE_PEN: irreversible byte loss (a565e63) =====
        ccv = str(self._j("edit8-h-real-20261029/CHANGE_COLOR_V2.json") or {})
        add("CHANGE_COLOR_V2", "historical_payload_dropped",
            "payloadDropped" in ccv and "true" in ccv,
            "edit8-h-real 回执含 payloadDropped=true（字节不可逆丢失）")
        rp = str(self._j("edit8-h-real-20261029/REMOVE_PEN.json") or {})
        add("REMOVE_PEN", "historical_payload_dropped",
            rp.count('"payloadDropped": true') >= 1 or rp.count("'payloadDropped': True") >= 1,
            f"payloadDropped 次数={rp.count('payloadDropped')}")

        # ===== fix commit that underpins the H/F byte chain =====
        add("HAND_REPAIR", "byte_persistence_fix_in_head",
            self.head_has("web/src/stores/use-tool-task-store.ts")
            and "healResultMediaByProvenance" in self.head_blob_text("web/src/stores/use-tool-task-store.ts")
            and "mergeWithoutStorageKeyDowngrade" in self.head_blob_text("web/src/stores/use-tool-task-store.ts"),
            "6ede584 自愈+防降级已入库")
        return out

    # ------------------------------ run ------------------------------
    def run(self) -> dict:
        rep = super().run()
        by = {t["id"]: t for t in rep["tools"]}

        base14 = {}
        p14 = os.path.join(DOCS, R14_JSON)
        if os.path.exists(p14):
            import json as _json
            with open(p14, encoding="utf-8") as fh:
                base14 = {t["id"]: t for t in _json.load(fh)["tools"]}

        for (tid, dim), payload in OVERRIDES15.items():
            verdict, note, evs = payload
            row = by[tid]
            row[dim] = verdict
            row[dim + "_note"] = note
            row[dim + "_evidence"] = evs
        for (tid, dim), note in NOTE_REFRESH15.items():
            by[tid][dim + "_note"] = note

        # H_legs bookkeeping for the cells whose evidence moved in R15
        by["NEW_DESIGNER"]["H_legs"] = dict(by["NEW_DESIGNER"].get("H_legs") or {}, **{
            "file": R17A, "task": True, "reload": True, "bytes": True,
            "reload_mark": '"freshReload": "URL 追加 ?fresh=<epochMs>"',
            "post_reload": "restoredUnits + download/saveToAssets/sendToCanvas",
            "binding": ["task-mvtdl9v8-165q1n"],
        })
        by["HAND_REPAIR"]["F_evidence"] = [HR, HR_PNG, EV + "HAND_REPAIR/R13_F_HAND_REPAIR_NOTES.md"]
        by["PRODUCT_SCENE"]["H_legs"] = dict(by["PRODUCT_SCENE"].get("H_legs") or {}, **{
            "file": SCENE + "receipt.json", "task": True, "reload": False, "bytes": True,
            "reload_mark": None, "post_reload": None,
            "binding": [sc_id] if (sc_id := (self._j(SCENE + "receipt.json") or {}).get("taskId")) else [],
        })
        by["PRODUCT_SCENE"]["H_gap"] = ("真实成功任务已存在（73b09be），但回执为刷新前控制台证据："
                                        "缺机器 reload 标记 + 刷新后面板观测两条腿")
        by["PRINT_EXTRACT"]["H_legs"] = {
            "file": PE + "task.json", "task": True, "reload": False, "bytes": True,
            "reload_mark": None, "post_reload": None,
            "artifact": PE + "result.png",
            "binding": [(self._j(PE + "task.json") or {}).get("id") or ""],
        }
        by["PRINT_EXTRACT"]["H_gap"] = ("任务腿+字节腿已成立（task-mvtlxua2-kh39uf / 2,783,996B）；"
                                        "缺机器 reload 回执（README 散文不计入）；存资产动作 UNVERIFIED")
        by["VIDEO_REPLICATION"]["H_gap"] = ("task-mvtk9pu3-sfifnh 现为 succeeded（a565e63 抽样 1,963,716B），"
                                            "但仅 README 散文、无机器 reload 回执/刷新后观测；且无该尺已提交产物")

        changes = []
        for tid, row in by.items():
            b = base14.get(tid)
            if not b:
                continue
            for dim in ("F", "T", "R", "H", "K", "U"):
                if b.get(dim) != row.get(dim):
                    changes.append({
                        "id": tid, "dim": dim, "was": b.get(dim), "now": row.get(dim),
                        "commit": {"HAND_REPAIR": "560a46e", "NEW_DESIGNER": "c125c62"}.get(tid, ""),
                        "why": (row.get(dim + "_note") or "")[:300],
                    })

        tally = {}
        for dim in ("F", "T", "R", "H", "K", "U"):
            c: dict[str, int] = {}
            for t in rep["tools"]:
                c[t[dim]] = c.get(t[dim], 0) + 1
            tally[dim] = c
        rep["summary"] = {"tools": len(rep["tools"]), "tally": tally,
                          "changes_vs_r14": len(changes)}
        rep["generatedAt"] = subprocess.run(
            ["date", "+%Y-%m-%dT%H:%M:%S%z"], capture_output=True, text=True).stdout.strip()
        rep["baseline"] = "R14 6ca29da（F33/6 T39/0 R37/2 H31/8 K12/27 U39）+ 残余复核 74aba4b"
        rep["absorbed_commits"] = [{"commit": c, "what": w} for c, w in ABSORBED]
        rep["changes_vs_r14"] = changes
        rep["h_asserts"] = self.h_asserts15()
        rep["auditor"] = "tools/recompute_scope_matrix_r15.py"
        rep["scope"] = "39 个工具（沿用 R14 范围，K/U 口径继承）"
        rep["rubric_r15"] = {
            "F": "结果 + >=2 条机器动作腿（下载/存资产/发画布），字节需可对账",
            "T": "无品牌/计费/案例库占位（HEAD blob 注释剥离后可见文案重扫）",
            "R": "回执声明字节必须能复算到已提交产物（尺寸或 sha256）",
            "H": "真实 task id + 机器 reload 标记（JSON 字段）+ 刷新后观测 + 字节",
            "K": "案例模块（继承 R13/R14）", "U": "设计 token（继承 R13/R14）",
        }
        rep["r15_notes"] = [
            "只吸收 git ls-tree HEAD 内已提交内容；工作树 dirty 文件与未跟踪目录一律不参与判定。",
            "R15 相对 R14 仅 3 处改判，全部由**新提交的机器回执**兑现：HAND_REPAIR F（560a46e 三腿互证）、"
            "NEW_DESIGNER F（c125c62 三动作）、NEW_DESIGNER R（411,801B/sha 90e28e0f 与已提交产物逐位一致）。",
            "H 判据收紧执行（非放宽）：README 散文式的「fresh reload 后观测」不计入机器 reload 腿。"
            "因此 PRODUCT_SCENE（73b09be 自述刷新前）、PRINT_EXTRACT（8df2d8a README §3）、"
            "VIDEO_REPLICATION（a565e63 抽样）三格 H 均**维持 PARTIAL**，缺口精确到「一条机器 reload 回执」。",
            "a565e63 的根因对账说明 CHANGE_COLOR_V2 / REMOVE_PEN 等历史成功任务的字节属**不可逆丢失**"
            "（成功时间早于 G1 入库 / B7 url 修复），R15 明确不注入、不补造，H 维持 PARTIAL。",
            "6ede584 只保证**新**任务不再丢字节：入库键带 provenance、刷新后按任务反查、防降级覆盖；"
            "门禁 f19a784 已证 typecheck/test/build exit 0（1475 pass / 84 files），本轮另跑同门禁复核。",
            "基线不一致已在文档中披露：committed R13 矩阵（5156699，H 11/28）与 R14 矩阵（脚本链，H 31/8）"
            "不是同一生成器；R15 以**已提交的 R14 矩阵**为 diff 基线，并保留 R14 字段以便追溯。",
            "PIS F 维持 PASS 但证据升级为结构化回执（首次含 assetId / projectId / nodeId / sha256）。",
        ]
        rep["residual"] = self.residual_list(by)
        return rep

    @staticmethod
    def residual_list(by: dict) -> list[dict]:
        out = []
        for tid, row in by.items():
            for dim in ("F", "T", "R", "H"):
                if row.get(dim) != "PASS":
                    out.append({"id": tid, "dim": dim, "verdict": row.get(dim),
                                "gap": (row.get(dim + "_note") or "")[:220]})
        return sorted(out, key=lambda x: (x["id"], x["dim"]))


def to_md(rep: dict) -> str:
    t = rep["summary"]["tally"]
    L = []
    L.append("# R15 独立复核：严格三腿矩阵（39 工具）")
    L.append("")
    L.append(f"- 审计对象（committed tree）：HEAD `{rep['head'][:7]}`（`{rep['branch']}`）")
    L.append(f"- 基线：{rep.get('baseline')}")
    L.append(f"- 生成：{rep['generatedAt']}；审计器：`tools/recompute_scope_matrix_r15.py`"
             "（继承 R14/R13，**只收紧**：散文式 reload 不计入 H 机器腿，不放宽任何判据）")
    L.append("- 证据源：`git ls-tree HEAD` + 磁盘字节/sha256 实算；**未提交/未跟踪内容一律不吸收**")
    L.append("")
    L.append("## 统计（F/T/R/H/K/U）")
    L.append("")
    L.append("| 维度 | PASS | PARTIAL | 其它 |")
    L.append("| --- | --- | --- | --- |")
    for d in ("F", "T", "R", "H", "K", "U"):
        c = t[d]
        other = {k: v for k, v in c.items() if k not in ("PASS", "PARTIAL")}
        L.append(f"| {d} | {c.get('PASS', 0)} | {c.get('PARTIAL', 0)} | "
                 + (", ".join(f"{k} {v}" for k, v in other.items()) or "—") + " |")
    L.append("")
    L.append(f"非全绿单元：**{len(rep['residual'])}** 个（{len({r['id'] for r in rep['residual']})} 个工具）")
    L.append("")
    L.append(f"相对 R14 改判：**{len(rep['changes_vs_r14'])} 处**")
    L.append("")
    for c in rep["changes_vs_r14"]:
        L.append(f"- **{c['id']}** `{c['dim']}` {c['was']} → {c['now']}（{c['commit']}）")
    L.append("")
    L.append("## 吸收的已提交证据")
    L.append("")
    for a in rep["absorbed_commits"]:
        L.append(f"- `{a['commit']}` — {a['what']}")
    L.append("")
    L.append("## 矩阵（39 工具）")
    L.append("")
    L.append("| # | 工具 | F | T | R | H | K | U |")
    L.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for i, row in enumerate(rep["tools"], 1):
        L.append(f"| {i} | {row['id']} | {row['F']} | {row['T']} | {row['R']} | "
                 f"{row['H']} | {row['K']} | {row['U']} |")
    L.append("")
    L.append("## 剩余非全绿清单（断点精确到单元）")
    L.append("")
    L.append("| # | 工具 | 维度 | 判定 | 唯一缺口 |")
    L.append("| --- | --- | --- | --- | --- |")
    for i, r in enumerate(rep["residual"], 1):
        gap = (r["gap"] or "").replace("|", "/")[:200]
        L.append(f"| {i} | {r['id']} | {r['dim']} | {r['verdict']} | {gap} |")
    L.append("")
    L.append("## 逐工具判定 / 证据路径")
    L.append("")
    for row in rep["tools"]:
        L.append(f"### {row['id']}（{row.get('name','')}）`{row.get('route','')}`")
        for d in ("F", "T", "R", "H"):
            ev = row.get(d + "_evidence") or []
            note = row.get(d + "_note") or ""
            L.append(f"- **{d} {row[d]}**：{note}")
            if ev:
                L.append("  - 证据：" + ", ".join(f"`{e}`" for e in ev[:4]))
        L.append(f"- **K {row['K']} / U {row['U']}**：{(row.get('K_note') or '')}｜{(row.get('U_note') or '')}")
        L.append("")
    L.append("## 机器硬断言（全部条目）")
    L.append("")
    total = 0
    bad = 0
    for tid, rows in rep["h_asserts"].items():
        for r in rows:
            total += 1
            if not r["ok"]:
                bad += 1
                L.append(f"- ❌ **{tid}** `{r['check']}` — {r['detail']}")
    L.append(f"- 断言项合计 {total} 条，失败 **{bad}** 条；明细见 `matrix.json.h_asserts`")
    L.append("")
    L.append("## 判定说明 / 剩余风险")
    L.append("")
    for n in rep["r15_notes"]:
        L.append(f"- {n}")
    L.append("")
    L.append("## 复核方式")
    L.append("")
    L.append("```bash")
    L.append("python3 docs/V1.0/plan_linkfox_navigation/tools/recompute_scope_matrix_r15.py")
    L.append("python3 - <<'PY'  # 产物字节/sha256 独立实算")
    L.append("import hashlib,os")
    L.append("for p in ['docs/V1.0/plan_linkfox_navigation/evidence/edit8-h-real-20261029/HAND_REPAIR-result-1024x1024.png',")
    L.append("          'docs/V1.0/plan_linkfox_navigation/evidence/suite-design-realgen-20261029/new-designer-result-1.png',")
    L.append("          'docs/V1.0/plan_linkfox_navigation/evidence/r16-scene-real-20261029/PRODUCT_SCENE-result-1.png',")
    L.append("          'evidence/real-acceptance/PRINT_EXTRACT/result.png']:")
    L.append("    b=open(p,'rb').read(); print(len(b), hashlib.sha256(b).hexdigest()[:16], p)")
    L.append("PY")
    L.append("```")
    L.append("")
    return "\n".join(L)


def main() -> int:
    ap = __import__("argparse").ArgumentParser()
    ap.add_argument("--json", default=os.path.join(OUTDIR, "matrix.json"))
    ap.add_argument("--md", default=os.path.join(OUTDIR, "matrix.md"))
    a = ap.parse_args()
    rep = Audit15().run()
    os.makedirs(os.path.dirname(a.json), exist_ok=True)
    import json as _json
    with open(a.json, "w", encoding="utf-8") as fh:
        _json.dump(rep, fh, ensure_ascii=False, indent=1)
    md = to_md(rep)
    with open(a.md, "w", encoding="utf-8") as fh:
        fh.write(md)
    with open(os.path.join(os.path.dirname(a.md), "report.md"), "w", encoding="utf-8") as fh:
        fh.write(md)
    print("head", rep["head"])
    print("tally", rep["summary"]["tally"])
    print("residual", len(rep["residual"]))
    for c in rep["changes_vs_r14"]:
        print(" *", c["id"], c["dim"], c["was"], "->", c["now"], "|", c["commit"])
    bad = [(tid, r["check"], r["detail"]) for tid, rows in rep["h_asserts"].items()
           for r in rows if not r["ok"]]
    print("assert fails:", len(bad))
    for b in bad:
        print("   -", b)
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
