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

下载仓库后，直接用现代浏览器打开 [transfhar-explorer.html](transfhar-explorer.html)。该文件内嵌课程内容、公式库和论文页面图像，适合离线分享。WebGL 不可用时，相关交互会使用 Canvas 兼容视图。

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

页面中的源码压缩包下载按钮依赖根目录下的 `transfhar-source.zip`；仓库不包含该自引用压缩包。可以使用 GitHub 的 **Code → Download ZIP** 下载源码，这不影响网页其他功能。

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
├── transfhar-explorer.html       # 可直接打开的离线网页
├── TransfHAR_30min_Speaker_Notes.md   # 约 30 分钟讲稿
├── VERIFICATION.md                    # 内容和功能核查记录
├── REVIEW_NOTES.md                    # 审查说明与待核实事项
├── tests/
│   ├── token-state.test.mjs           # 索引、遮挡及形状测试
│   └── pipeline-state.test.mjs        # 11 步流程与遮挡计数测试
├── assets/
│   ├── paper.pdf                      # 论文原文
│   ├── fig1.png … fig9.png            # 论文图像裁切
│   └── pages/                         # 论文 16 页截图
└── vendor/                            # Three.js、KaTeX 与第三方许可
```

修改讲解文字和章节时优先查看 `course.json`；修改互动逻辑查看 `app.js`、`pipeline-view.js` 与 `three-view.js`；修改外观查看 `style.css`。离线单文件由上述源码生成，修改后需重新运行构建脚本。

## 演示操作

- 用左右方向键切换章节；在放大的模型演示中切换步骤，按 Esc 退出。
- 模型章节默认打开“分步数据流”：点击顶部 11 个步骤，或用“上一步/下一步”逐步查看；点击下方网格里的任意 Token，可在后续步骤追踪它是否被遮挡、在编码器输入中的序号以及位置。
- 在“分步数据流”顶部切换 3 轴/6 轴和随机/时间/通道遮挡，所有计数与形状随之变化。
- “3D结构总览”保留可旋转、缩放的三维示意；WebGL 不可用时退回 Canvas 兼容视图。
- 三维面板支持图内缩放按钮、鼠标滚轮和恢复视角；触屏可使用双指缩放。
- 通过论文图和原页切换核对结论；讲稿提供逐章讲解提示。

## 论文与许可

Aidan Bradshaw, Riku Arakawa, Xin Liu, Karan Ahuja. *TransfHAR: Self-Supervised Wrist Representations for On-Demand Activity Recognition*. arXiv:2608.15861v2, 2026. DOI: [10.1145/3830398.3830553](https://doi.org/10.1145/3830398.3830553). [论文原文](https://arxiv.org/abs/2608.15861)。论文及其图像遵循 CC BY 4.0，使用时应保留作者和许可信息。

Three.js 和 KaTeX 各自的许可见 `vendor/` 目录。本项目教学代码目前未单独声明开源许可证；第三方内容仍受各自许可约束。
