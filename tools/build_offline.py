"""Generate the self-contained offline HTML from the editable site files.

Usage:
  python3 tools/build_offline.py

The script inlines CSS, fonts, KaTeX, Three.js, the course JSON, paper figures
and the page images into a single file under dist/. It assumes the source
modules keep the import/export statements matched below; run the test suite
and open dist/transfhar-explorer.html after changing module boundaries.
"""
from __future__ import annotations

import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "transfhar-explorer.html"


def read(path: str) -> str:
    return (ROOT / path).read_text("utf8")


def data_url(path: Path, mime: str) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def strip_exports(source: str) -> str:
    return source.replace("export function ", "function ").replace("export const ", "const ")


def build_css() -> str:
    """Inline the lean KaTeX stylesheet, its woff2 fonts and the site CSS."""
    css = read("vendor/katex-embedded.lean.css") + "\n" + read("src/css/style.css")

    def inline_font(match: re.Match[str]) -> str:
        path = ROOT / "vendor" / "fonts" / match.group(1)
        return f"url({data_url(path, 'font/woff2')})"

    css, font_count = re.subn(r"url\(fonts/([A-Za-z0-9_.-]+\.woff2)\)", inline_font, css)
    assert font_count == 13, f"expected 13 fonts, inlined {font_count}"
    return css


def build_js() -> str:
    """Bundle the ES modules into one IIFE for the offline page."""
    lib = read("vendor/three.min.js")
    assert lib.startswith("var THREE=") and lib.rstrip().endswith("})();"), "unexpected three bundle"

    view = read("src/js/three-view.js")
    view = view.replace("import * as THREE from '../../vendor/three.min.module.js';", "")
    view = view.replace("import {pipelineMask} from './pipeline-view.js';", "")
    view = view.replace("export function makeThreeView", "function makeThreeView")

    pipeline = strip_exports(read("src/js/pipeline-view.js"))
    token_state = strip_exports(read("src/js/token-state.mjs"))
    translation = strip_exports(read("src/data/paper-zh.mjs"))
    neural_model = strip_exports(
        read("src/js/neural-model.mjs").replace(
            "import {pipelineMask} from './pipeline-view.js';", ""
        )
    )
    neural = strip_exports(re.sub(r"^import .*?;\n", "", read("src/js/neural-flow.mjs"), flags=re.M))

    app = read("src/js/app.js")
    for statement in (
        "import {makePipelineView} from './pipeline-view.js';",
        "import {networkShapes} from './token-state.mjs';",
        "import {makeNeuralView} from './neural-flow.mjs';",
        "import {getPaperTranslation} from '../data/paper-zh.mjs';",
        "const loadThreeView=()=>import('./three-view.js');",
    ):
        app = app.replace(statement, "")
    app = app.replace("loadThreeView().then(", "Promise.resolve({makeThreeView}).then(")

    replacements = (
        (
            "function inlineSourceUrl(kind,id){return kind==='figure'?`assets/figures/${id}.webp`:"
            "`assets/pages/page-${String(id).padStart(2,'0')}.webp`}",
            "function inlineSourceUrl(kind,id){return kind==='figure'?assetURLs[id]:"
            "assetURLs['page-'+String(id).padStart(2,'0')] }",
        ),
        ('src="assets/figures/fig1.webp"', 'src="${assetURLs.fig1}"'),
    )
    for before, after in replacements:
        assert before in app, before
        app = app.replace(before, after)

    # Remove links that only make sense in the modular site, then swap the
    # network boot for the JSON payload embedded below.
    for name in (
        "transfhar-source.zip",
        "dist/transfhar-explorer.html",
        "docs/TransfHAR_30min_Speaker_Notes.md",
    ):
        app = re.sub(r'<a href="' + re.escape(name) + r'" download>.*?</a>', "", app)

    start = app.find("try {const r=await fetch('./src/data/course.json')")
    assert start >= 0, "course fetch boot code not found"
    app = app[:start] + (
        "try {course=JSON.parse(document.getElementById('embeddedCourse').textContent);"
        "const i=course.lessons.findIndex(x=>x.id===lessonIdFromHash());"
        "current=i<0?0:i;render();setMenu(false);syncPressed()}"
        "catch(error){$('#main').textContent='无法载入课程内容：'+error.message}"
    )

    return (
        "(function(){\n"
        + lib
        + '\nconst assetURLs=JSON.parse(document.getElementById("embeddedAssets").textContent);\n'
        + view
        + "\n"
        + pipeline
        + "\n"
        + token_state
        + "\n"
        + translation
        + "\n"
        + neural_model
        + "\n"
        + neural
        + "\n"
        + app
        + "\n})();"
    )


def build_assets() -> dict[str, str]:
    assets: dict[str, str] = {}
    for i in range(1, 9):
        assets[f"fig{i}"] = data_url(ROOT / "assets" / "figures" / f"fig{i}.webp", "image/webp")
    for i in range(1, 17):
        assets[f"page-{i:02}"] = data_url(
            ROOT / "assets" / "pages" / f"page-{i:02}.webp", "image/webp"
        )
    return assets


def main() -> None:
    html = read("index.html")
    css = build_css()
    code = build_js()
    course = read("src/data/course.json")
    katex = read("vendor/katex.min.js")
    assets = build_assets()

    for label, text in (("code", code), ("katex", katex), ("course", course)):
        assert "</script" not in text.lower(), f"{label} contains </script"
    assert "</style" not in css.lower(), "css contains </style"

    html = html.replace(
        '<link rel="stylesheet" href="./vendor/katex-embedded.lean.css">\n'
        '  <link rel="stylesheet" href="./src/css/style.css">',
        "<style>\n" + css + "\n</style>",
    )
    html = html.replace(
        '<script defer src="./vendor/katex.min.js"></script>',
        "<script>" + katex + "</script>",
    )
    html = html.replace(
        '<script type="module" src="./src/js/app.js"></script>',
        '<script type="application/json" id="embeddedCourse">'
        + course
        + '</script>\n<script type="application/json" id="embeddedAssets">'
        + json.dumps(assets, separators=(",", ":"))
        + "</script>\n<script>"
        + code
        + "</script>",
    )
    notices = "\n".join(
        read(path).replace("--", "—")
        for path in ("LICENSE", "vendor/THREE-LICENSE.txt", "vendor/KATEX-LICENSE.txt")
    )
    html = html.replace("</head>", "<!-- Third-party notices:\n" + notices + "\n-->\n</head>")

    assert 'src="./src/js/app.js"' not in html
    assert "fetch('./src/data/course.json')" not in html
    assert "transfhar-source.zip" not in html

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf8")
    print(f"Wrote {OUT.relative_to(ROOT)} bytes: {OUT.stat().st_size}")


if __name__ == "__main__":
    main()
