# TransfHAR Explorer

一个面向论文学习与组会分享的中文交互式网页，围绕 TransfHAR 的腕部惯性传感器活动识别方法，结合论文原图、公式、分步数据流和 Three.js 结构总览，帮助读者理解数据处理、模型训练、个性化识别与部署。项目包含 14 个章节及一份约 30 分钟的讲稿。

## 项目目的与内容

- **理解输入数据**：介绍数据集、L1–L4 活动层次、2.56 秒窗口和归一化，并展示论文统计图。
- **看清模型如何工作**：模型章节默认打开 11 步“分步数据流”，逐帧显示窗口、分块、共享卷积、位置编码、三种遮挡、只编码可见 Token、插回 mask token、解码、遮挡损失、平均池化与线性头；每一步都给出输入/输出形状与论文依据。另有“4点→Token与位置”逐步实验和可旋转的 3D 结构总览。
- **阅读论文证据**：在页面中查看论文原图及对应原页，了解离线评估、用户研究与消融实验。
- **讨论实际应用**：区分论文中的腕表原型与产品化设想，讨论用户特定分类头的训练、部署和局限。

网页用于教学与分享，**不是论文官方实现**。论文实验数值来自作者报告；分步数据流中的波形与重建柱是明确标注的合成教学示意，不是数据集样本或模型输出；3D 几何、遮挡和数学反例同样是教学示意。本仓库不含已训练编码器或可直接用于产品的分类模型。具体核查和未确认之处见 [VERIFICATION.md](VERIFICATION.md) 和 [REVIEW_NOTES.md](REVIEW_NOTES.md)。

## 快速开始

### 方式一：离线单文件

下载仓库后，直接用现代浏览器打开 [transfhar-explorer.html](transfhar-explorer.html)。该文件约 5.1 MB，内嵌课程内容、公式、字体和论文页面图像，适合离线分享。WebGL 不可用时，相关交互会使用 Canvas 兼容视图。

### 方式二：修改源码并本地预览

在仓库根目录运行：

```bash
python3 -m http.server 8000
```

在浏览器访问 <http://localhost:8000>。模块化版本通过 HTTP 读取课程和 JavaScript 模块，请不要直接双击 `index.html`。修改源码后，重新生成离线网页：

```bash
python3 build_offline.py
```

检查 Token 索引、遮挡、训练／推理形状和 11 步流程计数（需安装 Node.js）：

```bash
node tests/token-state.test.mjs
node tests/pipeline-state.test.mjs
```

源码请使用 GitHub 的 **Code → Download ZIP** 下载；网页中的下载区只保留离线单文件、讲稿与许可入口。

## 资源与依赖的重新生成

构建脚本只依赖 Python 标准库；只有重新生成图片、字体或压缩版 Three.js 时才需要额外工具：

```bash
# 论文页截图（120 DPI、裁白边、WebP）、figure 裁切与精简 KaTeX 样式
python3 build_assets.py            # 需要 Python Pillow 与 poppler 的 pdftoppm

# 压缩版 Three.js（esbuild，见 tools/three-entry.js 与 vendor/README.md）
npx esbuild tools/three-entry.js --bundle --minify --format=iife --global-name=THREE \
  --legal-comments=none --outfile=vendor/three.min.js
npx esbuild tools/three-entry.js --bundle --minify --format=esm \
  --legal-comments=none --outfile=vendor/three.min.module.js
```

生成的 `vendor/three.min.*`、`vendor/fonts/`、`assets/fig*.webp` 与 `assets/pages/*.webp` 已提交到仓库，日常修改文字或交互后只需运行 `python3 build_offline.py`。

## 文件目录

```text
transfhar-explorer/
├── index.html                         # 模块化网页入口
├── app.js                             # 页面、交互、图表与论文原页展示
├── pipeline-view.js                   # 模型章节的 11 步分步数据流
├── style.css                          # 样式与响应式布局
├── three-view.js                      # Three.js 结构总览与兼容视图
├── token-state.mjs                    # Token 索引、遮挡和张量形状计算
├── course.json                        # 章节内容、公式、来源与讲解提示
├── build_offline.py                   # 生成独立离线 HTML
├── build_assets.py                    # 重新生成页面图、figure 与精简 KaTeX 样式
├── transfhar-explorer.html            # 可直接打开的离线网页（约 5.1 MB）
├── TransfHAR_30min_Speaker_Notes.md   # 约 30 分钟讲稿
├── VERIFICATION.md                    # 内容和功能核查记录
├── REVIEW_NOTES.md                    # 审查说明与待核实事项
├── tests/
│   ├── token-state.test.mjs           # 索引、遮挡及形状测试
│   └── pipeline-state.test.mjs        # 11 步流程与遮挡计数测试
├── tools/
│   └── three-entry.js                 # 压缩版 Three.js 的打包入口
├── assets/
│   ├── paper.pdf                      # 论文原文
│   ├── fig1.webp … fig8.webp          # 网页使用的论文图像裁切
│   ├── fig1.png … fig8.png            # 转换前的 PNG 源图（保留以便重新生成）
│   └── pages/                         # 论文 16 页截图（WebP，120 DPI）
└── vendor/                            # Three.js、KaTeX、压缩版与字体
```

## 演示操作

- 键盘：`←` / `→` 切换章节；在分步数据流内用 `←` / `→` 切换步骤；`Esc` 退出放大演示或关闭移动端目录；页面顶部有“跳到正文”链接。
- 模型章节默认打开“分步数据流”：点击顶部 11 个步骤，或用“上一步/下一步”逐步查看；点击下方网格里的任意 Token，可在后续步骤追踪它是否被遮挡、在编码器输入中的序号以及位置。
- 在“分步数据流”顶部切换 3 轴/6 轴和随机/时间/通道遮挡，所有计数与形状随之变化；第 9 步起显示推理路径。
- “3D结构总览”支持待机自转、拖动旋转和缩放；拖动后停止待机自转。WebGL 不可用时退回 Canvas 兼容视图。
- 三维面板支持图内缩放按钮、鼠标滚轮和恢复视角；触屏可使用双指缩放。
- 移动端点击左上角菜单打开目录，可用关闭按钮、遮罩或 `Esc` 退出。
- 通过论文图和原页切换核对结论；部分章节默认显示对应原文页，也可随时手动切换。
- 顶栏“讲稿”打开右侧讲稿栏，显示当前章节提示和计时器；点击栏内关闭按钮返回。小屏幕上讲稿栏覆盖在正文之上。

## 性能与可访问性

- **离线包体积**：从 8.49 MB 降到约 5.1 MB（gzip 约 3.3 MB）。做法包括论文页按 120 DPI 重新渲染并裁掉白边、figure 转 WebP、Three.js 压缩、裁掉未使用的 KaTeX 字族、不再内嵌未引用的图。
- **首屏**：模块版默认章节不再下载 Three.js 和 KaTeX 字体；3D 视图与 Token 实验在进入模型章节后才惰性加载，论文原图/页面按需加载，图片带尺寸或延迟解码以减少布局抖动。
- **无障碍**：跳过链接、方向键作用域（不会在控件上误翻章）、分步数据流焦点保持、移动端目录 `inert`/`Esc`/遮罩、可选状态补充 `aria-pressed`/`aria-current`、提高小字对比度与焦点环对比度。
- **动效偏好**：尊重 `prefers-reduced-motion`，开启后 3D 改为单帧渲染、关闭持续粒子与脉冲动画，平滑滚动改为即时跳转。
- **演讲模式**：放大标题与分步数据流说明文字，便于投影讲解。

## 论文与许可

Aidan Bradshaw, Riku Arakawa, Xin Liu, Karan Ahuja. *TransfHAR: Self-Supervised Wrist Representations for On-Demand Activity Recognition*. arXiv:2608.15861v2, 2026. DOI: [10.1145/3830398.3830553](https://doi.org/10.1145/3830398.3830553). [论文原文](https://arxiv.org/abs/2608.15861)。论文及其图像遵循 CC BY 4.0，使用时应保留作者和许可信息。

Three.js 和 KaTeX 各自的许可见 `vendor/` 目录。本项目教学代码目前未单独声明开源许可证；第三方内容仍受各自许可约束。
