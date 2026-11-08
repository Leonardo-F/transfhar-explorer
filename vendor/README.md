本目录包含离线依赖 Three.js、KaTeX 及其许可证。

- `three.module.js`：Three.js r94 原始 ESM 源码（MIT），供阅读与重新打包。
- `three.min.module.js`：用 `tools/three-entry.js` + esbuild 压缩并只保留实际使用的 14 个类，供模块化页面（`three-view.js`）使用。
- `three.min.js`：同一入口的 IIFE 压缩版（全局变量 `THREE`），供 `build_offline.py` 内联到单文件离线版。
- `katex-embedded.css`：KaTeX 0.16.22 的完整内嵌字体样式（原始备份）。
- `katex-embedded.lean.css`：只保留课程用到的字体（Main / Math / Size1–4 / AMS / Caligraphic）的精简样式。
- `fonts/*.woff2`：精简样式引用的字体文件；离线构建时再行内联为 data URL。
- `THREE-LICENSE.txt`、`KATEX-LICENSE.txt`：第三方许可证。

重新生成压缩版 Three.js（需要 Node.js 与 esbuild）：

```bash
npm install esbuild@0.25 --no-audit --no-fund   # 任意本地目录
npx esbuild tools/three-entry.js --bundle --minify --format=iife --global-name=THREE \
  --legal-comments=none --outfile=vendor/three.min.js
npx esbuild tools/three-entry.js --bundle --minify --format=esm \
  --legal-comments=none --outfile=vendor/three.min.module.js
```

精简 KaTeX 样式与字体由 `python3 build_assets.py katex` 重新生成。
