# TransfHAR Explorer

面向论文学习与组会分享的中文交互网页：阅读论文原图与中文译注，跟随分步数据流、神经网络动图和三维结构理解腕部 IMU 活动识别。包含 14 章与约 30 分钟讲稿。

## 使用

- **离线阅读**：下载 [transfhar-explorer.html](transfhar-explorer.html)，直接在现代浏览器打开。
- **修改源码**：在仓库目录运行 `python3 -m http.server 8000`，访问 `http://localhost:8000`。修改后运行 `python3 tools/build_offline.py` 生成离线单文件。
- **演示**：模型章节可在分步数据流、论文原图、Token 实验、神经网络动图和 3D 总览之间切换。顶栏“讲稿”打开演讲提示；原文页提供中文对照。

## 文件

| 路径 | 用途 |
| --- | --- |
| `index.html`、`src/style.css`、`src/app.js` | 页面入口、样式和交互 |
| `src/course.json`、`src/paper-zh.mjs` | 课程内容和论文中文译注 |
| `src/pipeline-view.js`、`src/token-state.mjs` | 分步数据流、遮挡和形状计算 |
| `src/neural-flow.mjs`、`src/neural-model.mjs`、`src/three-view.js` | 网络动图、教学算例和三维视图 |
| `tools/build_offline.py`、`transfhar-explorer.html` | 离线构建脚本及生成的单文件 |
| `assets/`、`vendor/`、`tools/build_assets.py`、`tools/` | 论文素材、依赖及资源生成工具 |
| `tests/`、`docs/VERIFICATION.md`、`docs/REVIEW_NOTES.md` | 自动测试与内容核查 |
| `docs/TransfHAR_30min_Speaker_Notes.md` | 独立讲稿 |

资源重建需要 Pillow 和 Poppler；第三方依赖的生成方式见 [vendor/README.md](vendor/README.md)。

## 验证

需要 Node.js，依次运行：

```sh
node tests/token-state.test.mjs
node tests/pipeline-state.test.mjs
node tests/learning-views.test.mjs
node tests/neural-model.test.mjs
node tests/neural-playback.test.mjs
python3 tools/build_offline.py
```

模型动画使用合成信号与示例权重，不含已训练模型或真实预测。中文对照是逐页译文和译注，并非逐词全文翻译；详细依据和限制见 [VERIFICATION.md](docs/VERIFICATION.md)。

## 论文与许可

Bradshaw 等，[TransfHAR: Self-Supervised Wrist Representations for On-Demand Activity Recognition](https://arxiv.org/abs/2608.15861)，2026。论文及图片遵循 CC BY 4.0。项目原创代码采用 [MIT](LICENSE)；论文素材和 `vendor/` 第三方依赖遵循各自许可。
