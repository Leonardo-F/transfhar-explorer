// Step-by-step data-flow view for the four model lessons.
// All waveforms are synthetic teaching illustrations, never dataset samples or
// model outputs. Counts and shapes follow the paper's reported configuration.

export const PIPELINE_STEPS = [
  {
    short: '窗口', group: 'A',
    title: '取一个 2.56 秒窗口',
    action: '从连续腕部 IMU 流中截取 2.56 秒：每条轴 128 个采样点（50 Hz）。',
    evidence: '论文 §4.1.3：50 Hz、2.56 s、128 点；波形为教学示意',
  },
  {
    short: '分块', group: 'A',
    title: '每 4 个采样点切成一个 patch',
    action: '卷积核长与步长都是 4，所以每轴 128 ÷ 4 = 32 个 patch；具体总数随轴数变化。',
    evidence: '论文 §4.1.2：kernel 4、stride 4、32 patch/轴',
  },
  {
    short: '投影', group: 'A',
    title: '共享卷积把 4 点变成 384 维',
    action: '同一套一维卷积（384 组权重）分别作用于每条轴：每个 patch 的 4 个点变成一个 384 维向量。',
    evidence: '论文 §4.1.2：通道独立分块、共享卷积、384 维隐藏状态',
  },
  {
    short: '位置', group: 'A',
    title: '加上时间位置与通道身份',
    action: '每个 token 逐维加上两个可学习向量：时间位置 p_time[t] 和通道身份 p_axis[c]。',
    evidence: '论文 §4.1.2：时间与通道分别学习的二维位置编码',
  },
  {
    short: '遮挡', group: 'A',
    title: '随机选一种模式，遮住 65%',
    action: '每个样本随机选一种遮挡模式（随机 / 时间 / 通道），论文报告三种模式都遮 65%。',
    evidence: '论文 §4.1.4：复合遮挡，三种模式各遮 65%',
  },
  {
    short: '编码', group: 'A',
    title: '只把可见 Token 送进编码器',
    action: '被遮挡的 token 直接从编码器输入中移除；只有可见 token 带着自己的原始位置进入 12 层 Transformer。',
    evidence: '论文 §4.1.2：遮挡 token 在编码前移除；12 层、6 头、4× FFN、pre-norm',
  },
  {
    short: '插回', group: 'A',
    title: '解码前插回 mask token',
    action: '按原索引插入可学习的 mask token 占位符，恢复序列；384→192 是逐 token 的维度适配示意，不做均值池化。论文未说明适配与插入的具体先后。',
    evidence: '论文 §4.1.4：插回 mask token 并恢复位置；384→192 为推导',
  },
  {
    short: '解码', group: 'A',
    title: '解码器重建被遮挡的 patch',
    action: '4 层、192 维、4 头的解码器只在预训练时使用：它为每个被遮挡 patch 输出重建的 4 点波形。',
    evidence: '论文 §4.1.4：4 层、192 维、4 头解码器；输出 4 点为按 patch 大小推导，重建波形为示意',
  },
  {
    short: '损失', group: 'A',
    title: '只在遮挡位置计算误差',
    action: '损失只统计被遮挡的 patch；可见位置不产生损失。预训练结束后解码器被丢弃。',
    evidence: '论文 §4.1.4：MSE 只在遮挡位置；解码器预训练后丢弃',
  },
  {
    short: '池化', group: 'B',
    title: '个人适配与分类：平均池化成 384 维',
    action: '个人适配和后续分类都不遮挡：全部 token 进入冻结编码器，再沿 token 维逐维平均，得到 1 个 384 维窗口向量；预训练重建分支不做此池化。',
    evidence: '论文 §4.1.2、§4.2.1：推理全部 token，mean-pool 到 384 维',
  },
  {
    short: '线性头', group: 'B',
    title: '个人线性头输出类别分数',
    action: '单层线性探针把 384 维向量映射到 C 个类别分数；只训练这一层（384×C+C 个参数），编码器冻结。',
    evidence: '论文 §4.2.1：单层线性探针，参数 384×C+C',
  },
];

const AXIS = ['acc X', 'acc Y', 'acc Z', 'gyro X', 'gyro Y', 'gyro Z'];
const COLOR = ['#c98a5e', '#d9b380', '#c99a72', '#8aa9a0', '#a8bcb2', '#8aa9a0'];
const LESSON_RANGE = { tokens: [0, 3], mae: [3, 5], encoder: [5, 9], reconstruct: [5, 8] };
const LESSON_START = { tokens: 0, mae: 4, encoder: 5, reconstruct: 6 };

// Deterministic synthetic waveform in [-1, 1]. Teaching illustration only.
function sig(ch, i) {
  const p = ch * 1.1;
  return .55 * Math.sin(i * 2 * Math.PI / 42 + p)
    + .3 * Math.sin(i * 2 * Math.PI / 13 + p * 2)
    + .15 * Math.sin(i * 2 * Math.PI / 5.3 + p * .7);
}
const hash = n => {
  let x = Math.imul(n + 1, 2654435761);
  x = Math.imul(x ^ (x >>> 16), 2246822519);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  return (x ^ (x >>> 16)) >>> 0;
};

// Same masking shape as the 3D view so the two stay consistent.
export function pipelineMask(axes, mode) {
  const total = axes * 32, hidden = new Set();
  if (mode === 'inference') return hidden;
  const columns = new Set(Array.from({ length: 32 }, (_, i) => i).sort((a, b) => hash(a + 21) - hash(b + 21)).slice(0, 21));
  const rows = new Set(Array.from({ length: axes }, (_, i) => i).sort((a, b) => hash(a + 400) - hash(b + 400)).slice(0, Math.round(axes * .65)));
  const ranked = Array.from({ length: total }, (_, i) => i).sort((a, b) => hash(a) - hash(b));
  const random = new Set(ranked.slice(0, Math.round(total * .65)));
  for (let r = 0; r < axes; r++) for (let c = 0; c < 32; c++) {
    if (mode === 'random' ? random.has(r * 32 + c) : mode === 'time' ? columns.has(c) : rows.has(r)) hidden.add(r * 32 + c);
  }
  return hidden;
}

// Ordinal of a visible token in the encoder input; -1 when the token is masked.
export function visibleIndex(axes, mask, row, col) {
  const idx = row * 32 + col;
  if (mask.has(idx)) return -1;
  let n = 0;
  for (let i = 0; i < idx; i++) if (!mask.has(i)) n++;
  return n;
}

function waveD(x0, x1, y, amp, ch, n = 128) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * i / (n - 1);
    d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + (y - sig(ch, i) * amp).toFixed(1);
  }
  return d;
}

function miniWave(x, y, w, h, ch, c) {
  const pts = [];
  for (let k = 0; k < 4; k++) {
    pts.push((x + 1 + (w - 2) * k / 3).toFixed(1) + ',' + (y + h / 2 - sig(ch, c * 4 + k) * h * .34).toFixed(1));
  }
  return `<polyline points="${pts.join(' ')}" fill="none" stroke="#7c7466" stroke-width=".9" opacity=".72"/>`;
}

function grid({ axes, mask, selected, loss, ghost, dim, x = 150, y = 92, cw = 24, ch = 16, gap = 2, mini = false }) {
  let s = '';
  for (let r = 0; r < axes; r++) {
    s += `<text x="${x - 12}" y="${y + r * (ch + gap) + ch * .72}" text-anchor="end" class="pv-lbl">${AXIS[r]}</text>`;
    for (let c = 0; c < 32; c++) {
      const masked = mask.has(r * 32 + c);
      const sel = selected && selected[0] === r && selected[1] === c;
      const fill = masked ? (loss ? '#e8b48a' : ghost ? '#f4f2ea' : '#d8d4ca') : loss ? '#d1cec9' : COLOR[r];
      const stroke = sel ? '#b4462c' : loss ? 'none' : masked && ghost ? '#c9c4b8' : '#ffffff';
      const opacity = masked && ghost ? .55 : loss ? (masked ? 1 : .32) : dim ? .34 : 1;
      s += `<rect x="${x + c * (cw + gap)}" y="${y + r * (ch + gap)}" width="${cw}" height="${ch}" rx="2" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="${sel ? 2.6 : .7}" ${masked && ghost ? 'stroke-dasharray="2 2"' : ''} data-row="${r}" data-col="${c}"/>`;
      if (mini && !masked) s += miniWave(x + c * (cw + gap), y + r * (ch + gap), cw, ch, r, c);
    }
  }
  return s;
}

function seqGrid(total, cols, x, y, size, gap, fillOf, labelOf) {
  let s = '';
  for (let i = 0; i < total; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    s += `<rect x="${x + c * (size + gap)}" y="${y + r * (size + gap)}" width="${size}" height="${size}" rx="1.5" fill="${fillOf(i)}"/>`;
    if (labelOf && size >= 16) s += `<text x="${x + c * (size + gap) + size / 2}" y="${y + r * (size + gap) + size * .68}" text-anchor="middle" class="pv-tiny">${labelOf(i)}</text>`;
  }
  return s;
}

function layers(x, y, w, n, h, gap, fill, label) {
  let s = '';
  for (let i = 0; i < n; i++) {
    s += `<rect x="${x}" y="${y + i * (h + gap)}" width="${w}" height="${h}" rx="2" fill="${fill}" stroke="#a19682" stroke-width=".7"/>`;
  }
  if (label) s += `<text x="${x + w / 2}" y="${y + n * (h + gap) + 12}" text-anchor="middle" class="pv-lbl">${label}</text>`;
  return s;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function svgWindow(st) {
  const x0 = 95, x1 = 955;
  let s = `<text x="${x0}" y="34" class="pv-cap">${st.axes} 条轴 · 50 Hz · 128 点 = 2.56 s</text>`;
  for (let r = 0; r < st.axes; r++) {
    const y = 66 + r * 41;
    s += `<text x="${x0 - 12}" y="${y + 4}" text-anchor="end" class="pv-lbl">${AXIS[r]}</text>`;
    s += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="#e7e6db"/>`;
    s += `<path d="${waveD(x0, x1, y, 14, r)}" fill="none" stroke="${COLOR[r]}" stroke-width="1.5"/>`;
  }
  [0, .64, 1.28, 1.92, 2.56].forEach(t => {
    const x = x0 + (x1 - x0) * t / 2.56;
    s += `<line x1="${x}" y1="306" x2="${x}" y2="314" stroke="#a7a39b"/><text x="${x}" y="330" text-anchor="middle" class="pv-lbl">${t}s</text>`;
  });
  return s;
}

function svgPatch(st) {
  const x0 = 95, x1 = 900, y = 92, c = st.col;
  let s = `<text x="${x0}" y="34" class="pv-cap">以 ${AXIS[st.row]} 为例 · 每 4 个采样点一个 patch</text>`;
  s += `<path d="${waveD(x0, x1, y, 24, st.row)}" fill="none" stroke="${COLOR[st.row]}" stroke-width="1.6"/>`;
  for (let k = 0; k <= 32; k++) {
    const x = x0 + (x1 - x0) * k / 32;
    s += `<line x1="${x}" y1="${y - 30}" x2="${x}" y2="${y + 30}" stroke="#d7d4ce" stroke-width=".8"/>`;
    if (k % 4 === 0 && k < 32) s += `<text x="${x + 2}" y="${y + 46}" class="pv-tiny">${k}</text>`;
  }
  const xa = x0 + (x1 - x0) * c / 32, xb = x0 + (x1 - x0) * (c + 1) / 32;
  s += `<rect x="${xa}" y="${y - 33}" width="${xb - xa}" height="66" fill="#f0c9b4" fill-opacity=".38" stroke="#c96b45" stroke-width="1.2"/>`;
  for (let k = 0; k < 4; k++) {
    const px = x0 + (x1 - x0) * (c * 4 + k) / 128, py = y - sig(st.row, c * 4 + k) * 24;
    s += `<circle cx="${px}" cy="${py}" r="3.4" fill="#b4462c"/>`;
  }
  s += `<text x="${x0}" y="168" class="pv-note">每个竖格 = 一个 patch（4 点）；分块不重叠，窗口之间才有 50% 重叠。</text>`;
  // Zoomed patch card
  s += `<rect x="110" y="188" width="360" height="118" rx="8" fill="#fff" stroke="#e5e2dd"/>`;
  s += `<text x="126" y="210" class="pv-lbl">放大第 ${c + 1} 个 patch：4 个采样点</text>`;
  s += `<line x1="132" y1="250" x2="454" y2="250" stroke="#d8d2c4"/>`;
  for (let k = 0; k < 4; k++) {
    const bx = 140 + k * 78, v = sig(st.row, c * 4 + k), h = Math.max(4, Math.abs(v) * 24);
    s += `<rect x="${bx}" y="${v >= 0 ? 250 - h : 250}" width="34" height="${h}" rx="2" fill="${COLOR[st.row]}"/>`;
    s += `<text x="${bx + 17}" y="272" text-anchor="middle" class="pv-tiny">x${k}</text>`;
    s += `<text x="${bx + 17}" y="288" text-anchor="middle" class="pv-tiny">采样 ${c * 4 + k}</text>`;
  }
  s += `<text x="500" y="214" class="pv-big">128 ÷ 4 = 32</text>`;
  s += `<text x="500" y="238" class="pv-note">每条轴 32 个 patch</text>`;
  s += `<text x="500" y="262" class="pv-big">${st.axes} × 32 = ${st.axes * 32}</text>`;
  s += `<text x="500" y="286" class="pv-note">${st.axes} 轴合计 ${st.axes * 32} 个 token</text>`;
  return s;
}

function svgProject(st, mask) {
  const x = 110, y = 80, cw = 22, ch = 15;
  let s = `<text x="${x}" y="34" class="pv-cap">${st.axes} 条轴共用同一套卷积参数；每个 patch 的 4 点 → 384 维</text>`;
  s += grid({ axes: st.axes, mask, selected: [st.row, st.col], x, y, cw, ch, mini: true });
  const bx = 915, by = 62, bh = 250;
  s += `<rect x="${bx}" y="${by}" width="26" height="${bh}" rx="3" fill="#b4a386"/>`;
  for (let i = 0; i < 48; i++) s += `<line x1="${bx + 3}" y1="${by + 4 + i * 5}" x2="${bx + 23}" y2="${by + 4 + i * 5}" stroke="#f2efea" stroke-opacity=".5"/>`;
  s += `<text x="${bx + 13}" y="${by + bh + 16}" text-anchor="middle" class="pv-lbl">384 维</text>`;
  const sx = x + st.col * (cw + 2) + cw / 2, sy = y + st.row * (ch + 2) + ch / 2;
  s += `<path d="M${sx} ${sy} C${sx + 120} ${sy}, ${bx - 160} ${by + bh / 2}, ${bx - 2} ${by + bh / 2}" fill="none" stroke="#a19682" stroke-width="1.4" stroke-dasharray="4 3"/>`;
  s += `<text x="150" y="318" class="pv-note">同一条轴内共享权重，不同轴也用同一套权重；轴身份由下一步的位置向量区分。</text>`;
  return s;
}

function svgPosition(st) {
  const x = 150, y = 108, cw = 24, ch = 15, gap = 2;
  let s = `<text x="88" y="34" class="pv-cap">每个 token = 卷积内容 z + 时间位置 p_time + 通道身份 p_axis</text>`;
  s += `<text x="138" y="64" text-anchor="end" class="pv-lbl">时间位置</text>`;
  for (let c = 0; c < 32; c++) {
    const sel = c === st.col;
    s += `<rect x="${x + c * (cw + gap)}" y="52" width="${cw}" height="16" rx="2" fill="#e8c46e" fill-opacity="${sel ? 1 : .45}" stroke="${sel ? '#b4462c' : 'none'}" stroke-width="2"/>`;
    if (c % 4 === 0) s += `<text x="${x + c * (cw + gap) + cw / 2}" y="46" text-anchor="middle" class="pv-tiny">t${c}</text>`;
  }
  s += `<text x="48" y="92" class="pv-lbl">通道身份</text>`;
  for (let r = 0; r < st.axes; r++) {
    const sel = r === st.row;
    s += `<rect x="48" y="${y + r * (ch + gap)}" width="36" height="${ch}" rx="2" fill="#b9aa91" fill-opacity="${sel ? 1 : .5}" stroke="${sel ? '#b4462c' : 'none'}" stroke-width="2"/>`;
  }
  s += grid({ axes: st.axes, mask: new Set(), selected: [st.row, st.col], x, y, cw, ch, gap });
  const cx = x + st.col * (cw + gap) + cw / 2, cy = y + st.row * (ch + gap) + ch / 2;
  s += `<path d="M${cx} 70 L${cx} ${y - 3}" stroke="#c08a35" stroke-width="1.2" stroke-dasharray="3 2"/>`;
  s += `<rect x="150" y="262" width="740" height="58" rx="7" fill="#f6f9f3" stroke="#e6e2db"/>`;
  s += `<text x="166" y="282" class="pv-lbl">当前 token：${AXIS[st.row]} · 片段 ${st.col}</text>`;
  s += `<text x="166" y="300" class="pv-note">u = z + p_time[${st.col}] + p_axis[${AXIS[st.row]}]：逐维相加，向量仍是 384 维。</text>`;
  s += `<text x="166" y="314" class="pv-note">同一时间片共享时间向量；不同轴有各自的通道向量。</text>`;
  return s;
}

function svgMask(st, mask) {
  const total = st.axes * 32, masked = mask.size;
  let s = `<text x="88" y="34" class="pv-cap">当前模式：${st.mode === 'random' ? '随机遮挡' : st.mode === 'time' ? '整段时间遮挡' : '整条通道遮挡'} · 可见 ${total - masked} / ${total}</text>`;
  s += grid({ axes: st.axes, mask, selected: [st.row, st.col], x: 150, y: 88, cw: 24, ch: 16 });
  s += `<rect x="88" y="292" width="14" height="14" rx="2" fill="#d8d4ca"/><text x="110" y="304" class="pv-lbl">遮挡（不进入编码器）</text>`;
  s += `<rect x="300" y="292" width="14" height="14" rx="2" fill="${COLOR[0]}"/><text x="322" y="304" class="pv-lbl">可见（橙=acc，绿=gyro）</text>`;
  s += `<text x="600" y="296" class="pv-note">遮挡 ${masked} 个（${(masked / total * 100).toFixed(1)}%）· 可见 ${total - masked} 个</text>`;
  s += `<text x="88" y="326" class="pv-note">论文报告三种模式均遮 65%；网页按整列 ${21 * st.axes} 个、整行 ${Math.round(st.axes * .65) * 32} 个离散取整，略高于 65%，形状分别为随机散点、整列、整行。</text>`;
  return s;
}

function svgEncode(st, mask) {
  const total = st.axes * 32, visible = total - mask.size;
  let s = `<text x="88" y="34" class="pv-cap">遮挡的 ${mask.size} 个 token 被移除；只有 ${visible} 个可见 token 进入编码器</text>`;
  s += `<text x="90" y="56" class="pv-lbl">原窗口（虚线灰格被移除）</text>`;
  s += grid({ axes: st.axes, mask, ghost: true, dim: true, selected: [st.row, st.col], x: 90, y: 66, cw: 12, ch: 10, gap: 1.4 });
  s += `<path d="M530 108 L578 108" stroke="#a19682" stroke-width="1.4" marker-end="url(#pvArrow)"/>`;
  s += `<text x="532" y="98" class="pv-tiny">只保留可见</text>`;
  const vx = 596, cols = 4, size = 10, gap = 3;
  s += `<text x="${vx + 26}" y="56" text-anchor="middle" class="pv-lbl">${visible} 个可见 token</text>`;
  let vi = 0;
  for (let r = 0; r < st.axes; r++) for (let c = 0; c < 32; c++) {
    if (mask.has(r * 32 + c)) continue;
    const rr = Math.floor(vi / cols), cc = vi % cols;
    const sel = r === st.row && c === st.col;
    s += `<rect x="${vx + cc * (size + gap)}" y="${66 + rr * (size + gap)}" width="${size}" height="${size}" rx="1.5" fill="${COLOR[r]}" stroke="${sel ? '#b4462c' : 'none'}" stroke-width="2"/>`;
    vi++;
  }
  s += `<path d="M660 108 L700 108" stroke="#a19682" stroke-width="1.4" marker-end="url(#pvArrow)"/>`;
  s += `<text x="662" y="98" class="pv-tiny">编码</text>`;
  s += layers(710, 66, 190, 12, 13, 4, '#c6bba7', '12 层 Transformer');
  s += `<text x="560" y="306" class="pv-lbl">每层：LN → 6 头注意力 → 残差 → LN → MLP(4×) → 残差</text>`;
  s += `<text x="560" y="324" class="pv-note">4× 指前馈层扩到 1536 维，再压回 384。</text>`;
  const idx = visibleIndex(st.axes, mask, st.row, st.col);
  s += `<rect x="90" y="286" width="430" height="46" rx="7" fill="#f6f9f3" stroke="#e6e2db"/>`;
  if (idx < 0) {
    s += `<text x="104" y="304" class="pv-lbl">追踪：${AXIS[st.row]} · 片段 ${st.col}</text>`;
    s += `<text x="104" y="322" class="pv-note">该 token 被遮挡 → 不在编码器输入中，位置留给解码器。</text>`;
  } else {
    s += `<text x="104" y="304" class="pv-lbl">追踪：${AXIS[st.row]} · 片段 ${st.col}</text>`;
    s += `<text x="104" y="322" class="pv-note">可见序列第 ${idx + 1} / ${visible} 个，带原始 (c=${st.row}, t=${st.col}) 位置进入编码器。</text>`;
  }
  return s;
}

function svgInsert(st, mask) {
  const total = st.axes * 32;
  let s = `<text x="88" y="34" class="pv-cap">按原位置插回 mask token：${mask.size} 个浅棕色标记 + ${total - mask.size} 个可见 = ${total}</text>`;
  const cols = 16, size = 16, gap = 3, x = 96, y = 58;
  s += seqGrid(total, cols, x, y, size, gap, i => mask.has(i) ? '#d6b896' : COLOR[Math.floor(i / 32)]);
  s += `<text x="${x}" y="304" class="pv-lbl">原始顺序 [B, ${total}, 384]</text>`;
  s += `<text x="${x}" y="322" class="pv-note">每个位置保留自己的时间与通道身份；浅棕色格子是可学习的 mask token 占位符，不是原始信号。</text>`;
  s += `<rect x="420" y="116" width="14" height="14" rx="2" fill="#d6b896"/><text x="440" y="127" class="pv-tiny">蓝 = mask token</text>`;
  s += `<rect x="420" y="140" width="14" height="14" rx="2" fill="#c98a5e"/><text x="440" y="151" class="pv-tiny">彩色 = 可见 token</text>`;
  s += `<path d="M470 160 L520 160" stroke="#a19682" stroke-width="1.5" marker-end="url(#pvArrow)"/>`;
  s += `<rect x="530" y="118" width="190" height="84" rx="8" fill="#f4f2ef" stroke="#cec7bb"/>`;
  s += `<text x="625" y="146" text-anchor="middle" class="pv-lbl">线性投影</text>`;
  s += `<text x="625" y="168" text-anchor="middle" class="pv-big">384 → 192</text>`;
  s += `<text x="625" y="188" text-anchor="middle" class="pv-tiny">论文未说明具体做法</text>`;
  s += `<path d="M730 160 L780 160" stroke="#a19682" stroke-width="1.5" marker-end="url(#pvArrow)"/>`;
  s += `<rect x="792" y="112" width="96" height="96" rx="8" fill="#d3b797"/>`;
  s += `<text x="840" y="152" text-anchor="middle" class="pv-tiny">解码器输入</text>`;
  s += `<text x="840" y="172" text-anchor="middle" class="pv-lbl">[B,192,192]</text>`;
  return s;
}

function svgDecode(st, mask) {
  let s = `<text x="88" y="34" class="pv-cap">4 层解码器只为被遮挡位置产出重建；可见 token 不参与损失</text>`;
  s += `<text x="110" y="56" class="pv-lbl">解码器</text>`;
  s += layers(110, 66, 150, 4, 34, 10, '#d3b797', '4 层 · 192 维 · 4 头');
  s += `<path d="M280 152 L350 152" stroke="#a19682" stroke-width="1.5" marker-end="url(#pvArrow)"/>`;
  const col = COLOR[st.row];
  const target = [sig(st.row, st.col * 4), sig(st.row, st.col * 4 + 1), sig(st.row, st.col * 4 + 2), sig(st.row, st.col * 4 + 3)];
  s += `<text x="380" y="70" class="pv-lbl">被遮挡 patch：${AXIS[st.row]} · 片段 ${st.col}</text>`;
  s += `<rect x="380" y="82" width="250" height="124" rx="7" fill="#fff" stroke="#e5e2dd"/>`;
  s += `<text x="394" y="100" class="pv-tiny">目标（4 个采样点，示意）</text>`;
  s += `<line x1="392" y1="170" x2="618" y2="170" stroke="#d8d2c4"/>`;
  target.forEach((v, k) => {
    const bx = 400 + k * 56, h = Math.max(5, Math.abs(v) * 70);
    s += `<rect x="${bx}" y="${v >= 0 ? 170 - h : 170}" width="28" height="${h}" rx="2" fill="${col}" opacity=".85"/>`;
    s += `<text x="${bx + 14}" y="188" text-anchor="middle" class="pv-tiny">x${k}</text>`;
  });
  s += `<rect x="660" y="82" width="250" height="124" rx="7" fill="#fff" stroke="#e5e2dd"/>`;
  s += `<text x="674" y="100" class="pv-tiny">重建输出（示意，不是模型结果）</text>`;
  s += `<line x1="672" y1="170" x2="898" y2="170" stroke="#d8d2c4"/>`;
  target.forEach((v, k) => {
    const rv = Math.max(-1, Math.min(1, v * .72 + .18 * Math.sin(k * 2.1 + st.col)));
    const bx = 680 + k * 56, h = Math.max(5, Math.abs(rv) * 70);
    s += `<rect x="${bx}" y="${rv >= 0 ? 170 - h : 170}" width="28" height="${h}" rx="2" fill="#f6d3b8" fill-opacity=".7" stroke="#d97a3f" stroke-width="1.2" stroke-dasharray="3 2"/>`;
  });
  s += `<text x="110" y="296" class="pv-note">每个被遮挡 patch 只有 4 个输出值；全部 ${st.axes * 32} 个 patch 共用同一个解码器。</text>`;
  s += `<text x="110" y="316" class="pv-note">虚线柱是教学示意，用来说明“解码器输出 4 点”，不代表论文模型的实际重建值。</text>`;
  return s;
}

function svgLoss(st, mask) {
  const total = st.axes * 32;
  let s = `<text x="88" y="34" class="pv-cap">只有橙色（被遮挡）的 ${mask.size} 个 patch 进入损失；灰色可见位置不计损失</text>`;
  s += grid({ axes: st.axes, mask, loss: true, dim: true, selected: [st.row, st.col], x: 150, y: 86, cw: 24, ch: 16 });
  s += `<rect x="88" y="286" width="14" height="14" rx="2" fill="#e8b48a"/><text x="110" y="298" class="pv-lbl">橙色 = 计算 MSE 的位置（${mask.size} 个）</text>`;
  s += `<rect x="360" y="286" width="14" height="14" rx="2" fill="#d1cec9" fill-opacity=".6"/><text x="382" y="298" class="pv-lbl">灰色 = 可见位置，不产生损失</text>`;
  s += `<text x="88" y="322" class="pv-note">L = (1/|M|) Σ (x̂ − x)²，只对 i ∈ M 求和；可见位置没有目标，也不产生损失。</text>`;
  s += `<text x="640" y="322" class="pv-note">预训练结束后丢弃解码器；编码器保留给下游。</text>`;
  return s;
}

function svgPool(st) {
  const total = st.axes * 32;
  let s = `<text x="88" y="34" class="pv-cap">推理不遮挡：${total} 个 token 全部编码，再沿 token 维逐维平均</text>`;
  const cols = 16, size = 14, gap = 3;
  s += seqGrid(total, cols, 96, 58, size, gap, i => COLOR[Math.floor(i / 32)]);
  s += `<text x="96" y="284" class="pv-lbl">[B, ${total}, 384]</text>`;
  s += `<text x="96" y="304" class="pv-note">每一小格是一个 token 的 384 维向量。</text>`;
  s += `<path d="M410 170 L470 170" stroke="#a19682" stroke-width="1.5" marker-end="url(#pvArrow)"/>`;
  s += `<text x="440" y="158" text-anchor="middle" class="pv-tiny">逐维平均</text>`;
  const bx = 510, by = 62, bh = 236;
  s += `<rect x="${bx}" y="${by}" width="34" height="${bh}" rx="3" fill="#867353"/>`;
  for (let i = 0; i < 40; i++) s += `<line x1="${bx + 4}" y1="${by + 6 + i * 5.7}" x2="${bx + 30}" y2="${by + 6 + i * 5.7}" stroke="#eee9e1" stroke-opacity=".45"/>`;
  s += `<text x="${bx + 17}" y="${by + bh + 18}" text-anchor="middle" class="pv-lbl">384 维</text>`;
  s += `<text x="${bx + 70}" y="140" class="pv-big">对 ${total} 个 token 求平均</text>`;
  s += `<text x="${bx + 70}" y="164" class="pv-note">每个特征维度单独求平均</text>`;
  s += `<text x="${bx + 70}" y="188" class="pv-note">输出 [B, 384]，一个窗口一个向量</text>`;
  s += `<text x="96" y="328" class="pv-note">推理时编码器冻结（雪花），不计算损失，也不需要解码器。</text>`;
  return s;
}

function svgHead(st) {
  const C = 7;
  let s = `<text x="88" y="34" class="pv-cap">单层线性探针：384 维 × C 类；示例 C = 7（用户研究的类别数）</text>`;
  // input bar
  s += `<rect x="96" y="84" width="28" height="200" rx="3" fill="#867353"/>`;
  s += `<text x="110" y="300" text-anchor="middle" class="pv-lbl">[B,384]</text>`;
  // weight matrix
  const mx = 210, my = 96, cell = 14;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    s += `<rect x="${mx + c * (cell + 2)}" y="${my + r * (cell + 2)}" width="${cell}" height="${cell}" rx="2" fill="#c6bba7" fill-opacity="${.35 + .08 * ((r + c) % 5)}"/>`;
  }
  s += `<text x="${mx + 62}" y="82" text-anchor="middle" class="pv-lbl">W：384×C</text>`;
  s += `<text x="${mx + 62}" y="238" text-anchor="middle" class="pv-tiny">+ b：C 个偏置</text>`;
  s += `<path d="M140 184 L200 184" stroke="#a19682" stroke-width="1.5" marker-end="url(#pvArrow)"/>`;
  s += `<path d="M350 184 L410 184" stroke="#a19682" stroke-width="1.5" marker-end="url(#pvArrow)"/>`;
  // output logits
  const ox = 440;
  s += `<text x="${ox}" y="76" class="pv-lbl">类别分数 C = 7（示意）</text>`;
  for (let i = 0; i < C; i++) {
    const y = 88 + i * 28, w = 90 + 60 * Math.abs(Math.sin(i * 1.7));
    s += `<rect x="${ox}" y="${y}" width="${w}" height="18" rx="3" fill="${i === 2 ? '#c96b45' : '#e8e3da'}"/>`;
    s += `<text x="${ox + w + 8}" y="${y + 13}" class="pv-tiny">类 ${i + 1}</text>`;
  }
  s += `<path d="M436 153 l-10 -5 v10 z" fill="#b4462c"/><text x="436" y="138" text-anchor="end" class="pv-tiny" fill="#b4462c">argmax</text>`;
  s += `<text x="${ox}" y="306" class="pv-note">softmax 后取最大类；橙色仅表示“示例中的 argmax”，不是模型输出。</text>`;
  s += `<text x="700" y="120" class="pv-big">385 × C</text>`;
  s += `<text x="700" y="144" class="pv-note">C = 7 时 2,695 个参数</text>`;
  s += `<text x="700" y="176" class="pv-note">编码器冻结，只更新 W 和 b</text>`;
  return s;
}

function stepSvg(st, mask) {
  switch (st.step) {
    case 0: return svgWindow(st);
    case 1: return svgPatch(st);
    case 2: return svgProject(st, mask);
    case 3: return svgPosition(st);
    case 4: return svgMask(st, mask);
    case 5: return svgEncode(st, mask);
    case 6: return svgInsert(st, mask);
    case 7: return svgDecode(st, mask);
    case 8: return svgLoss(st, mask);
    case 9: return svgPool(st);
    default: return svgHead(st);
  }
}

const ARROW = '<defs><marker id="pvArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#a19682"/></marker></defs>';

export function makePipelineView(host, { lesson = 'tokens', onState = () => {} } = {}) {
  const state = { lesson, step: LESSON_START[lesson] ?? 0, axes: 6, mode: 'random', row: 0, col: 0 };
  let destroyed = false;

  const emit = (withMode = false) => onState({ axes: state.axes, row: state.row, col: state.col, ...(withMode ? { mode: state.step >= 9 ? 'inference' : state.mode } : {}) });

  function focusKey(){
    const a = document.activeElement;
    if (!a || !host.contains(a)) return null;
    const step = a.closest('[data-pv-step]'); if (step) return { step: Number(step.dataset.pvStep) };
    const cell = a.closest('[data-row]'); if (cell) return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
    const ax = a.closest('[data-pv-axes]'); if (ax) return { axes: Number(ax.dataset.pvAxes) };
    const md = a.closest('[data-pv-mode]'); if (md) return { mode: md.dataset.pvMode };
    if (a.id === 'pvPrev' || a.id === 'pvNext') return { nav: a.id };
    return null;
  }
  function restoreFocus(key){
    if (!key) return;
    let el = null;
    if (key.step != null) el = host.querySelector(`[data-pv-step="${key.step}"]`);
    else if (key.row != null) el = host.querySelector(`[data-row="${key.row}"][data-col="${key.col}"]`);
    else if (key.axes != null) el = host.querySelector(`[data-pv-axes="${key.axes}"]`);
    else if (key.mode) el = host.querySelector(`[data-pv-mode="${key.mode}"]`);
    else if (key.nav) el = host.querySelector('#' + key.nav);
    if (el && el.isConnected && !el.disabled) el.focus({ preventScroll: true });
  }
  function render() {
    if (destroyed || !host) return;
    const focus = focusKey();
    const rawMask = pipelineMask(state.axes, state.mode);
    const mask = state.step >= 4 && state.step <= 8 ? rawMask : new Set();
    const total = state.axes * 32;
    const step = PIPELINE_STEPS[state.step];
    const range = LESSON_RANGE[state.lesson] || [0, PIPELINE_STEPS.length - 1];
    const inRange = state.step >= range[0] && state.step <= range[1];
    const rail = PIPELINE_STEPS.map((s, i) => {
      const out = i < range[0] || i > range[1];
      return `<button type="button" class="pv-step ${i === state.step ? 'active' : ''} ${out ? 'out' : ''}" data-pv-step="${i}" aria-current="${i === state.step}"><small>${String(i + 1).padStart(2, '0')}</small><span>${s.short}</span></button>`;
    }).join('');
    const visible = total - mask.size;
    const action = state.step === 1
      ? `卷积核长与步长都是 4，所以每轴 128 ÷ 4 = 32 个 patch；${state.axes} 轴共 ${total} 个。`
      : state.step === 4
        ? `每个样本随机选一种遮挡模式（随机 / 时间 / 通道），论文报告三种模式都遮 65%；当前 ${state.mode === 'random' ? '随机' : state.mode === 'time' ? '整段时间' : '整条通道'}遮挡，可见 ${visible} / ${total}。`
        : state.step === 5
          ? `被遮挡的 ${mask.size} 个 token 直接从编码器输入中移除；只有 ${visible} 个可见 token 带着自己的原始位置进入 12 层 Transformer。`
          : state.step === 6
            ? `按原索引插入 ${mask.size} 个可学习 mask token 占位符，恢复 ${total} 个位置；384→192 逐 token 适配示意，预训练不做均值池化，论文未说明适配与插入的先后。`
            : state.step === 8
              ? `损失只统计被遮挡的 ${mask.size} 个 patch；可见位置不产生损失。预训练结束后解码器被丢弃。`
              : state.step === 9
                ? `推理不遮挡：${total} 个 token 全部进入冻结编码器，再沿 token 维逐维平均，得到 1 个 384 维窗口向量。`
                : step.action;
    const stageInput = [
      '连续 IMU 流', `[B, ${state.axes}, 128]`, '每个 patch 4 点', `[B, ${total}, 384]`, `[B, ${total}, 384]`,
      `[B, ${total}, 384]`, `[B, ${visible}, 384]`, `[B, ${total}, 192]`, '重建 + 目标', `[B, ${total}, 384]`, '[B, 384]',
    ][state.step];
    const stageOutput = [
      `[B, ${state.axes}, 128]`, `${total} 个 patch（${state.axes}×32）`, `[B, ${total}, 384]`, `[B, ${total}, 384]`,
      `遮挡集合 M，|M| = ${mask.size}`, `[B, ${visible}, 384]`, `[B, ${total}, 192]`, `[B, ${total}, 4]（推导）`,
      `标量 loss（${mask.size} 个位置）`, '[B, 384]', '[B, C]',
    ][state.step];
    const keyText = state.step < 4 ? `${state.axes} 轴 · ${total} token` : state.step >= 9 ? `${state.axes} 轴 · 全部 ${total} token` : `${state.axes} 轴 · 可见 ${visible} / ${total}`;
    host.innerHTML = `
      <div class="pv-shell">
        <div class="pv-top">
          <div class="pv-lesson"><span class="pv-kicker">STEP-BY-STEP · 论文图 4 / 图 5</span><h2>从窗口到个人分类头</h2>
            <p>每一步都显示输入、动作和输出；点击上方步骤或下方网格里的任意 token 追踪它的路径。</p></div>
          <div class="pv-badge">本节：步骤 ${range[0] + 1}–${range[1] + 1}</div>
        </div>
        <div class="pv-toolbar">
          <div class="segment" role="group" aria-label="轴数">
            <button type="button" data-pv-axes="3" class="${state.axes === 3 ? 'active' : ''}" aria-pressed="${state.axes === 3}">3 轴</button>
            <button type="button" data-pv-axes="6" class="${state.axes === 6 ? 'active' : ''}" aria-pressed="${state.axes === 6}">6 轴</button>
          </div>
          <div class="segment" role="group" aria-label="遮挡模式">
            <button type="button" data-pv-mode="random" class="${state.mode === 'random' ? 'active' : ''}" aria-pressed="${state.mode === 'random'}" ${state.step >= 9 ? 'disabled' : ''}>随机</button>
            <button type="button" data-pv-mode="time" class="${state.mode === 'time' ? 'active' : ''}" aria-pressed="${state.mode === 'time'}" ${state.step >= 9 ? 'disabled' : ''}>时间</button>
            <button type="button" data-pv-mode="channel" class="${state.mode === 'channel' ? 'active' : ''}" aria-pressed="${state.mode === 'channel'}" ${state.step >= 9 ? 'disabled' : ''}>通道</button>
          </div>
          <span class="pv-trace">追踪：<b>${AXIS[state.row]} · 片段 ${state.col}</b>（采样点 ${state.col * 4}–${state.col * 4 + 3}）</span>
          <div class="pv-nav"><button type="button" id="pvPrev" ${state.step === 0 ? 'disabled' : ''}>← 上一步</button><span>${state.step + 1} / ${PIPELINE_STEPS.length}</span><button type="button" id="pvNext" ${state.step === PIPELINE_STEPS.length - 1 ? 'disabled' : ''}>下一步 →</button></div>
        </div>
        <div class="pv-rail" role="tablist" aria-label="流程步骤">${rail}</div>
        <div class="pv-stage ${inRange ? '' : 'pv-out-range'}">
          <div class="pv-stage-head">
            <div><span class="pv-kicker">STEP ${String(state.step + 1).padStart(2, '0')} / ${PIPELINE_STEPS.length} · ${step.group === 'A' ? '预训练 · Stage A' : '下游 · Stage B'}</span>
              <h3>${esc(step.title)}</h3></div>
            <span class="pv-chip">${step.group === 'A' ? (state.step <= 3 ? '不遮挡' : '遮挡训练') : '冻结编码器'}</span>
          </div>
          <p class="pv-action">${esc(action)}</p>
          <div class="pv-figure" tabindex="0" role="region" aria-label="流程示意图，可左右滚动"><svg viewBox="0 0 1000 345" class="pv-svg" role="img" aria-label="${esc(step.title)}">${ARROW}${stepSvg(state, mask)}</svg></div>
          <div class="pv-meta">
            <div><span>输入</span><b>${esc(stageInput)}</b></div>
            <div><span>这一步的关键数字</span><b>${keyText}</b></div>
            <div><span>输出</span><b>${esc(stageOutput)}</b></div>
          </div>
          <p class="pv-evidence">依据：${esc(step.evidence)}。波形与重建柱为教学示意，不含论文模型权重或真实样本。 <button class="evidence-link" type="button" data-page="${state.step === 10 ? 6 : 5}">对照原文第 ${state.step === 10 ? 6 : 5} 页 ↗</button></p>
        </div>
      </div>`;
    restoreFocus(focus);
    const railEl = host.querySelector('.pv-rail'), activeStep = host.querySelector('.pv-step.active');
    if (railEl && activeStep) railEl.scrollLeft = Math.max(0, activeStep.offsetLeft - railEl.clientWidth / 2 + activeStep.clientWidth / 2);
  }

  function onClick(e) {
    const step = e.target.closest('[data-pv-step]');
    if (step) { const wasInference = state.step >= 9; state.step = Number(step.dataset.pvStep); if (wasInference !== (state.step >= 9)) emit(true); render(); return; }
    const ax = e.target.closest('[data-pv-axes]');
    if (ax) { state.axes = Number(ax.dataset.pvAxes); state.row = Math.min(state.row, state.axes - 1); emit(); render(); return; }
    const md = e.target.closest('[data-pv-mode]');
    if (md) { state.mode = md.dataset.pvMode; emit(true); render(); return; }
    const cell = e.target.closest('[data-row]');
    if (cell) { state.row = Number(cell.dataset.row); state.col = Number(cell.dataset.col); emit(); render(); return; }
    if (e.target.closest('#pvPrev')) { const wasInference = state.step >= 9; state.step = Math.max(0, state.step - 1); if (wasInference !== (state.step >= 9)) emit(true); render(); return; }
    if (e.target.closest('#pvNext')) { const wasInference = state.step >= 9; state.step = Math.min(PIPELINE_STEPS.length - 1, state.step + 1); if (wasInference !== (state.step >= 9)) emit(true); render(); }
  }

  host.addEventListener('click', onClick);
  render();

  return {
    update(next = {}) {
      if (destroyed) return;
      let changed = false;
      for (const key of ['axes', 'mode', 'row', 'col']) {
        if (next[key] === undefined) continue;
        if (key === 'mode' && next.mode === 'inference') continue;
        if (next[key] !== state[key]) { state[key] = next[key]; changed = true; }
      }
      if (changed) render();
    },
    setStep(i) { state.step = Math.max(0, Math.min(PIPELINE_STEPS.length - 1, i)); render(); },
    destroy() {
      destroyed = true;
      host.removeEventListener('click', onClick);
      host.innerHTML = '';
    },
    get state() { return { ...state }; },
  };
}
