#!/usr/bin/env python3
"""Scope audit for the 39 LinkFox-derived tools (Infinite Canvas).

Enforces the scope boundary agreed in ``docs/V1.0/plan_linkfox_navigation/scope_boundary.md``:

* 只复刻「工具功能 + 必要字段/文案」，界面必须使用本项目 Infinite Canvas 设计系统；
* 共享壳（shell）不得出现原站的非功能模块：促销条 / 积分·算力账单 / 学习中心 / 个人中心 /
  HelpDock（右下角帮助浮窗）/ 购买·充值入口；
* 共享壳必须保留本项目真实入口：设置、主题、Agent、画布（workspace links）；
* 可见文案不得出现 LinkFox 品牌（注释、import、测试负断言不算）；
* 工具工作区不得把原站品牌紫 #723cf9 等像素级值硬编码进 class。

Usage::

    python3 docs/V1.0/plan_linkfox_navigation/tools/scope_audit.py            # human summary
    python3 docs/V1.0/plan_linkfox_navigation/tools/scope_audit.py --json out.json
    python3 docs/V1.0/plan_linkfox_navigation/tools/scope_audit.py --strict   # warnings also fail

Exit code: 0 clean, 1 errors found (or warnings with --strict), 2 bad usage.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import subprocess
import sys
from dataclasses import asdict, dataclass, field

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
WEB_SRC = os.path.join(REPO_ROOT, "web", "src")

# --- what counts as the shared shell -------------------------------------
SHELL_FILES = [
    "web/src/components/layout/app-top-nav.tsx",
    "web/src/components/layout/mobile-nav-drawer.tsx",
    "web/src/components/layout/user-status-actions.tsx",
    "web/src/components/tools/tool-shell.tsx",
    "web/src/components/tools/tool-sidebar.tsx",
    "web/src/components/tools/tool-page.tsx",
    "web/src/components/layout/app-config-modal.tsx",
]

# --- rules ---------------------------------------------------------------
FORBIDDEN_MODULE_SIGNALS = {
    # module -> regex over *visible* text / testids / imports (comments stripped)
    "promo-bar": r"data-testid=\"[a-z-]*promo|促销|限时|立即抢购|领取福利",
    "points-billing": r"积分|算力|点数余额|充值|购买套餐|免费得算力",
    "learning-center": r"学习中心|教程中心|学院|课程中心|帮助中心|产品教程|使用教程",
    "user-center": r"个人中心|会员中心|我的订单|账号中心|退出登录",
    "help-dock": r"tool-help-dock|help-dock|HelpDock|在线客服|联系客服",
}
FORBIDDEN_MODULE_IMPORTS = r"(app-promo-bar|promo-bar|user-center|user-center-drawer|help-dock|tool-help-dock|learning-center)"

REQUIRED_SHELL_MARKERS = {
    "top-nav-shell": r'data-testid="shell-top-nav"',
    "agent-entry": r'data-testid="top-nav-agent-toggle"',
    "canvas-entry": r'data-testid=\{?`?workspace-link-|data-testid="workspace-link-',
    "settings-entry": r"Settings2|navigation\.config|openConfigDialog",
    "theme-entry": r"AnimatedThemeToggler|useThemeStore",
}
# each marker may live in one of these files
SHELL_MARKER_SCOPE = {
    "top-nav-shell": ["web/src/components/layout/app-top-nav.tsx"],
    "agent-entry": ["web/src/components/layout/app-top-nav.tsx"],
    "canvas-entry": ["web/src/components/layout/app-top-nav.tsx"],
    "settings-entry": [
        "web/src/components/layout/user-status-actions.tsx",
        "web/src/components/layout/app-top-nav.tsx",
    ],
    "theme-entry": [
        "web/src/components/layout/user-status-actions.tsx",
        "web/src/components/layout/app-top-nav.tsx",
    ],
}

BRAND_RE = re.compile(r"linkfox", re.I)
BRAND_ALLOW = re.compile(
    r"^(https?://|/api/|@linkfox|linkfox\.com|file-ai\.linkfox\.com|www\.linkfox\.com)",
    re.I,
)
# pixel-level leftovers from the original site (design-system violation)
PIXEL_PATTERNS = {
    "original-brand-hex": re.compile(r"#723cf9", re.I),
    "important-modifier": re.compile(r"(?<![\w-])(?:[a-z0-9\]\)]|\[[^\]]+\])!(?=[\"'\s])"),
}


@dataclass
class Finding:
    rule: str
    severity: str  # error | warning | info
    file: str
    line: int
    excerpt: str
    detail: str = ""


@dataclass
class Report:
    generated_at: str = ""
    repo: str = ""
    branch: str = ""
    head: str = ""
    dirty_web_src: list[str] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)
    checks: dict = field(default_factory=dict)

    @property
    def errors(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "error"]

    @property
    def warnings(self) -> list[Finding]:
        return [f for f in self.findings if f.severity == "warning"]


def _git(*args: str) -> str:
    try:
        return subprocess.run(["git", *args], cwd=REPO_ROOT, capture_output=True, text=True, timeout=15).stdout.strip()
    except Exception:
        return ""


def strip_comments(src: str) -> str:
    """Remove // and /* */ comments, keeping newlines so line numbers stay valid."""
    out: list[str] = []
    i, n = 0, len(src)
    state = "code"  # code | line | block | sq | dq | tpl
    while i < n:
        c = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if state == "code":
            if c == "/" and nxt == "/":
                state = "line"
                i += 2
                continue
            if c == "/" and nxt == "*":
                state = "block"
                i += 2
                continue
            if c == "'":
                state = "sq"
            elif c == '"':
                state = "dq"
            elif c == "`":
                state = "tpl"
            out.append(c)
            i += 1
            continue
        if state == "line":
            if c == "\n":
                state = "code"
                out.append(c)
            i += 1
            continue
        if state == "block":
            if c == "*" and nxt == "/":
                state = "code"
                i += 2
                continue
            if c == "\n":
                out.append(c)
            i += 1
            continue
        # inside string: keep chars, handle escapes / closing quote
        if c == "\\":
            out.append(c)
            if i + 1 < n:
                out.append(src[i + 1])
            i += 2
            continue
        out.append(c)
        if (state == "sq" and c == "'") or (state == "dq" and c == '"') or (state == "tpl" and c == "`"):
            state = "code"
        i += 1
    return "".join(out)


def iter_files(root: str, exts: tuple[str, ...], skip_tests: bool = False):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in {"node_modules", "dist", "__snapshots__"}]
        for name in filenames:
            if not name.endswith(exts):
                continue
            if skip_tests and (".test." in name or ".spec." in name):
                continue
            yield os.path.join(dirpath, name)


def rel(path: str) -> str:
    return os.path.relpath(path, REPO_ROOT).replace(os.sep, "/")


def jsx_text_nodes(code: str):
    """Yield (line, text) for JSX text nodes — text between > and <, no braces.

    The naive ``>...<`` scan also matches across ordinary code (``a > b; const c = ...<``),
    so candidates containing statement/assignment characters or more than one newline are
    dropped: real JSX copy is prose, not code.
    """
    for m in re.finditer(r">([^<>{}]{2,200})<", code):
        text = m.group(1).strip()
        if not text or "\n" in text.strip("\n").replace("\n", "", 1):
            continue
        if any(ch in text for ch in ";=()[]\\"):
            continue
        if re.match(r"^(const|let|var|return|import|export|function|if|else)\b", text):
            continue
        line = code.count("\n", 0, m.start(1)) + 1
        yield line, text


def render_strings(code: str):
    """Yield (line, literal) for string literals that plausibly render in UI.

    Heuristic: attribute-style literals (``prop="..."``, ``prop={'...'}``), object keys used by
    UI models (label/title/hint/placeholder/emptyHint/description/text/note), and i18n values.
    """
    keys = r"(?:label|title|hint|placeholder|emptyHint|description|desc|text|note|message|tooltip|ariaLabel|name|content|subtitle|header)"
    for m in re.finditer(rf"\b{keys}\s*[:=]\s*([\"'`])((?:\\\\.|(?!\1).){{2,200}})\1", code):
        line = code.count("\n", 0, m.start(1)) + 1
        yield line, m.group(2)


def check_shell(report: Report):
    present = [p for p in SHELL_FILES if os.path.exists(os.path.join(REPO_ROOT, p))]
    missing_files = [p for p in SHELL_FILES if p not in present]
    report.checks["shell_files_present"] = present
    report.checks["shell_files_absent"] = missing_files

    for p in present:
        code = strip_comments(open(os.path.join(REPO_ROOT, p), encoding="utf-8").read())
        stripped = re.sub(r"^\s*import .*$", "", code, flags=re.M)
        # visible text + rendered literals + testids
        candidates = list(jsx_text_nodes(stripped)) + list(render_strings(stripped))
        for m in re.finditer(r'data-testid="([^"]+)"', stripped):
            candidates.append((stripped.count("\n", 0, m.start()) + 1, m.group(1)))
        for rule_name, pattern in FORBIDDEN_MODULE_SIGNALS.items():
            rx = re.compile(pattern, re.I)
            for line, text in candidates:
                if rx.search(text):
                    report.findings.append(Finding(
                        rule=f"shell-forbidden:{rule_name}", severity="error", file=p, line=line,
                        excerpt=text[:120], detail="共享壳只保留本项目功能入口，不搬原站非功能模块"))
        # forbidden module imports
        for m in re.finditer(FORBIDDEN_MODULE_IMPORTS, code, re.I):
            line = code.count("\n", 0, m.start()) + 1
            report.findings.append(Finding(
                rule="shell-forbidden-import", severity="error", file=p, line=line,
                excerpt=code[m.start():m.end()], detail="共享壳不得挂载促销/积分/学习中心/个人中心/HelpDock"))

    # required entries: settings / theme / agent / canvas
    for marker, files in SHELL_MARKER_SCOPE.items():
        rx = re.compile(REQUIRED_SHELL_MARKERS[marker])
        hit = None
        for f in files:
            path = os.path.join(REPO_ROOT, f)
            if not os.path.exists(path):
                continue
            if rx.search(open(path, encoding="utf-8").read()):
                hit = f
                break
        if hit:
            report.checks.setdefault("shell_required", {})[marker] = f"ok:{hit}"
        else:
            report.checks.setdefault("shell_required", {})[marker] = "missing"
            report.findings.append(Finding(
                rule=f"shell-required-missing:{marker}", severity="error",
                file=files[0], line=0, excerpt="", detail="必须保留本项目真实入口（设置/主题/Agent/画布）"))


def check_brand(report: Report):
    """Visible LinkFox brand in UI copy (comments/imports/test files excluded)."""
    for path in iter_files(WEB_SRC, (".tsx", ".ts"), skip_tests=True):
        raw = open(path, encoding="utf-8").read()
        if not BRAND_RE.search(raw):
            continue
        code = re.sub(r"^\s*import .*$", "", strip_comments(raw), flags=re.M)
        for line, text in list(jsx_text_nodes(code)) + list(render_strings(code)):
            if BRAND_RE.search(text) and not BRAND_ALLOW.match(text.strip()):
                report.findings.append(Finding(
                    rule="brand-visible", severity="error", file=rel(path), line=line,
                    excerpt=text[:120], detail="可见文案必须使用本项目品牌，不出现 LinkFox"))
        # i18n locale values
        if "/i18n/locales/" in path.replace(os.sep, "/"):
            for m in re.finditer(r"[\"']([^\"'\n]{2,200})[\"']\s*:", code):
                pass  # keys only; values handled above via render_strings
            for m in re.finditer(r":\s*([\"'])((?:\\\\.|(?!\1).){2,200})\1", code):
                if BRAND_RE.search(m.group(2)) and not BRAND_ALLOW.match(m.group(2).strip()):
                    line = code.count("\n", 0, m.start()) + 1
                    report.findings.append(Finding(
                        rule="brand-visible-i18n", severity="error", file=rel(path), line=line,
                        excerpt=m.group(2)[:120], detail="i18n 文案含原站品牌"))


def check_tool_copy(report: Report):
    """Tool workspaces must not carry the original site's billing / ops copy.

    scope_boundary.md explicitly excludes 算力/积分/购买/学习中心/操作咨询 from the copy surface.
    These tokens are visually rendered strings, so scanning the comment-stripped source for the
    characters themselves is precise (no false hits from code identifiers).
    """
    tokens = {
        "billing": re.compile(r"算力|积分|充值|购买套餐|免费得算力"),
        "learning-center": re.compile(r"学习中心|教程中心|产品教程|操作咨询|帮助中心"),
        "user-center": re.compile(r"个人中心|会员中心|账号中心"),
    }
    for path in iter_files(os.path.join(WEB_SRC, "components", "tools"), (".tsx", ".ts")):
        name = os.path.basename(path)
        if ".test." in name or ".spec." in name or name.endswith(".d.ts"):
            continue
        code = strip_comments(open(path, encoding="utf-8").read())
        for rule, rx in tokens.items():
            for m in rx.finditer(code):
                line = code.count("\n", 0, m.start()) + 1
                src_line = code.splitlines()[line - 1].strip()
                report.findings.append(Finding(
                    rule=f"tool-copy:{rule}", severity="error", file=rel(path), line=line,
                    excerpt=src_line[:140],
                    detail="工具页只保留功能字段与必要文案，不搬原站计费/运营/学习中心文案"))


def check_placeholders(report: Report):
    """Case modules that openly say "not connected" are unfinished work, not parity."""
    rx = re.compile(r"案例库未接入|暂无真实案例|待接入")
    for path in iter_files(os.path.join(WEB_SRC, "components", "tools"), (".tsx",)):
        if ".test." in os.path.basename(path):
            continue
        code = strip_comments(open(path, encoding="utf-8").read())
        for m in rx.finditer(code):
            line = code.count("\n", 0, m.start()) + 1
            report.findings.append(Finding(
                rule="unfinished-copy:case-module", severity="warning", file=rel(path), line=line,
                excerpt=code.splitlines()[line - 1].strip()[:140],
                detail="原站有优秀案例的工具，本地不应以占位文案收尾"))


def check_pixels(report: Report):
    for path in iter_files(os.path.join(WEB_SRC, "components", "tools"), (".tsx", ".ts")):
        if ".test." in os.path.basename(path):
            continue
        raw = open(path, encoding="utf-8").read()
        code = strip_comments(raw)
        for rule, rx in PIXEL_PATTERNS.items():
            for m in rx.finditer(code):
                line = code.count("\n", 0, m.start()) + 1
                # grab class string around the hit
                start = code.rfind('"', 0, m.start())
                end = code.find('"', m.end())
                excerpt = code[start + 1:end][:120] if 0 <= start < m.start() and end > 0 else code[m.start():m.start() + 40]
                report.findings.append(Finding(
                    rule=f"design:{rule}", severity="warning", file=rel(path), line=line,
                    excerpt=excerpt, detail="使用设计系统 token / 组件，不搬原站像素值与 !important"))


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Infinite Canvas scope audit")
    ap.add_argument("--json", help="write machine-readable report to this path")
    ap.add_argument("--strict", action="store_true", help="warnings also fail the run")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    if not os.path.isdir(WEB_SRC):
        print(f"web/src not found at {WEB_SRC}", file=sys.stderr)
        return 2

    report = Report(
        generated_at=_dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        repo=REPO_ROOT,
        branch=_git("rev-parse", "--abbrev-ref", "HEAD"),
        head=_git("rev-parse", "--short", "HEAD"),
    )
    dirty = [l[3:] for l in _git("status", "--porcelain", "--", "web/src").splitlines() if l.strip()]
    report.dirty_web_src = dirty

    check_shell(report)
    check_brand(report)
    check_tool_copy(report)
    check_placeholders(report)
    check_pixels(report)

    if args.json:
        payload = {
            "generated_at": report.generated_at,
            "repo": report.repo,
            "branch": report.branch,
            "head": report.head,
            "dirty_web_src": report.dirty_web_src,
            "checks": report.checks,
            "summary": {
                "errors": len(report.errors),
                "warnings": len(report.warnings),
                "by_rule": {r: len([f for f in report.findings if f.rule == r])
                            for r in sorted({f.rule for f in report.findings})},
            },
            "findings": [asdict(f) for f in report.findings],
        }
        os.makedirs(os.path.dirname(os.path.abspath(args.json)), exist_ok=True)
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)

    if not args.quiet:
        print(f"scope_audit @ {report.head} ({report.branch})  dirty web/src files: {len(dirty)}")
        print(f"errors={len(report.errors)} warnings={len(report.warnings)}")
        for f in report.errors:
            print(f"  ERR  {f.file}:{f.line} [{f.rule}] {f.excerpt}")
        groups = {}
        for f in report.warnings:
            groups[(f.rule, f.file)] = groups.get((f.rule, f.file), 0) + 1
        if groups:
            print(f"  WARN 聚合（规则+文件，共 {len(groups)} 组，明细见 --json）：")
            for (rule, file), n in sorted(groups.items(), key=lambda kv: -kv[1])[:15]:
                print(f"    {n:>3}x [{rule}] {file}")
        for k, v in report.checks.get("shell_required", {}).items():
            print(f"  shell entry {k}: {v}")

    if report.errors or (args.strict and report.warnings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
