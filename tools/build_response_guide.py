"""Builds RESPONSE_GUIDE.html from the template and the prompt source.

The prompt text is copied out of src/features/chat/systemPrompt.ts rather than
typed into the guide, so the guide cannot quietly drift from what MAYA is sent.
Run from the repository root:  python tools/build_response_guide.py
"""

import datetime
import html
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = (ROOT / "src/features/chat/systemPrompt.ts").read_text(encoding="utf-8").replace("\r\n", "\n")
TEMPLATE = (ROOT / "tools/response_guide.template.html").read_text(encoding="utf-8").replace("\r\n", "\n")


def constant(name: str) -> str:
    match = re.search(rf"(?:export )?const {name} = `(.*?)`;", SOURCE, re.S)
    if not match:
        raise SystemExit(f"{name} not found in systemPrompt.ts")
    return match.group(1)


def template_body(function: str) -> str:
    """The first template literal returned inside a function, with ${...} left visible."""
    start = SOURCE.index(f"export function {function}")
    match = re.search(r"return `(.*?)`;", SOURCE[start:], re.S)
    if not match:
        raise SystemExit(f"no template in {function}")
    return match.group(1)


def usage_rules() -> str:
    """The rules that follow the decision list, from the branch that has decisions."""
    start = SOURCE.index("export function formatDecisions")
    tail = SOURCE[start:].split("この記録の使い方:\n", 1)[1]
    return tail.split("`;", 1)[0]


today = datetime.date.today().isoformat()

time_example = template_body("formatTime").replace("${formatNow(now)}", "9月15日(月) 21:40")

decisions_example = """社長がこれまでに記録した判断です。新しい順。今日は 2026-09-15 です。

- 2026-09-10［実行中］来月から主力商品を8%値上げする
    理由: 仕入れ値が2割上がり、据え置くと赤字になるため
    次の一手: 主要3社に伝える（期限 2026-09-12） ※期限切れ

この記録の使い方:
""" + usage_rules()

activity_example = """社長の最近の活動です（Journal と、気になって保存した話題）。新しい順。

使い方:
- 相談に関係するときだけ、知っている相手として自然に触れます。一覧にして返さないでください
- ここにあるのは最近の分だけです。書かれていない過去の活動を作らないでください

Journal:
- 2026-09-14 MAYAのサーバーをクラウドに置いた
    決めたこと: 独自ドメインは使わず workers.dev にする
    社長の考え: アドレスがキレイかどうかはどうでもいい

話題:
- 2026-09-13 https://x.com/…/status/…（メモ: あとで読む）"""

company_example = """この会社について分かっていること。推測で補わず、書かれていないことは訊いてください。

会社名: （設定に入れた名前）
業種: （設定に入れた業種）
従業員数: 5名
経営目標:
  - （設定に入れた目標）"""

values = {
    "PERSONA": constant("PERSONA"),
    "PROTOCOL": constant("PROTOCOL"),
    "CONTRACT": constant("CONTRACT"),
    "SEARCH_GUIDE": constant("SEARCH_GUIDE"),
    "TIME_EXAMPLE": time_example,
    "DECISIONS_EXAMPLE": decisions_example,
    "ACTIVITY_EXAMPLE": activity_example,
    "COMPANY_EXAMPLE": company_example,
}

out = TEMPLATE.replace("{{DATE}}", today)
for key, text in values.items():
    out = out.replace("{{" + key + "}}", html.escape(text.strip("\n"), quote=False))

left = re.findall(r"\{\{[A-Z_]+\}\}", out)
if left:
    raise SystemExit(f"unfilled: {left}")
(ROOT / "RESPONSE_GUIDE.html").write_text(out, encoding="utf-8", newline="\n")
print("wrote RESPONSE_GUIDE.html", len(out), "chars")
