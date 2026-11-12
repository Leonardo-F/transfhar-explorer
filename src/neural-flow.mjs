// Native SVG animation of the reported architecture. Numerical examples are
// deterministic teaching calculations, not activations from a checkpoint.
import {getArchitectureModel, neuralSignal, patchProjection, positionExample, attentionExample, ffnExample, poolingExample, reconstructionExample} from './neural-model.mjs';

const NN_AXIS_NAMES=['acc X','acc Y','acc Z','gyro X','gyro Y','gyro Z'];
const NN_AXIS_COLORS=['#d9a276','#e8c795','#d5b488','#91b2a9','#b2c7bd','#9db8ad'];
const nnFixed=(x,n=3)=>Number(x).toFixed(n);
const nnLabel=(x,y,text,size=14,color='#eadfcd',anchor='start')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${text}</text>`;
const nnRect=(x,y,w,h,fill='#3b342b',stroke='#756550',rx=8)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`;
const nnTone=(v)=>v>=0?`rgb(${Math.round(103+Math.min(v,1.5)*78)},${Math.round(83+Math.min(v,1.5)*66)},${Math.round(57+Math.min(v,1.5)*48)})`:`rgb(83,${Math.round(92+Math.min(-v,1.5)*38)},${Math.round(89+Math.min(-v,1.5)*34)})`;
function nnPath(d,animated=true,color='#d6b98c') {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" marker-end="url(#nnArrow)"/>${animated?`<g class="nn-signals"><circle r="4" fill="#ffe0a1"><animateMotion path="${d}" dur="1.7s" repeatCount="indefinite"/></circle></g>`:''}`;
}
function nnModule(x,y,w,title,sub,active=false) {
  return nnRect(x,y,w,52,active?'#59432b':'#342e27',active?'#ecc98f':'#70614f')+nnLabel(x+w/2,y+22,title,14,active?'#ffe1ab':'#efe5d5','middle')+nnLabel(x+w/2,y+40,sub,11,'#c7b9a5','middle');
}
function nnSvg(body,height=390,label='TransfHAR 模型计算结构') {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="nn-svg" viewBox="0 0 1060 ${height}" role="img" aria-label="${label}"><defs><marker id="nnArrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="#d6b98c"/></marker></defs><rect width="1060" height="${height}" rx="12" fill="#24211d"/><g font-family="system-ui,sans-serif">${body}</g></svg>`;
}
export function getNeuralModel(input={}) {return getArchitectureModel(input)}

function nnOverview(m) {
  const ids=['window','project','position',m.mode==='pretrain'?'mask':'sequence','encoder'],xs=[24,230,436,642,848];
  const titles=['窗口与分块','共享 Conv1D','时间 + 通道位置',m.mode==='pretrain'?'移除遮挡 Token':'完整序列','Transformer ×12'];
  const subs=[`${m.axes}×128 → ${m.tokenCount}×4`,`${m.tokenCount}×384`,`${m.tokenCount}×384`,`${m.visibleIndices.length}×384`,'384 维 · 6 头 · FFN ×4'];
  let out=nnLabel(24,24,m.mode==='pretrain'?'Stage A · 自监督预训练':'Stage B · 冻结编码器 + 个人线性探针',13,'#d6b98c');
  xs.forEach((x,i)=>{out+=nnModule(x,40,184,titles[i],subs[i],ids[i]===m.stageId||(i===0&&m.stageId==='patch')||(i===4&&['attention','ffn'].includes(m.stageId)));if(i<4)out+=nnPath(`M ${x+184} 66 H ${x+204}`,false)});
  const tail=m.mode==='pretrain'?[['restore','补回 mask token',`${m.tokenCount}×192 · 衔接推导`],['decoder','Decoder ×4','192 维 · 4 头 → 每 patch 4 点'],['loss','遮挡 MSE','只比较被隐藏的采样点']]:[['pool','Mean Pool','Token 维平均 → 384'],['head','Linear Probe','384 → C · 仅此层适配']];
  out+=nnPath('M 940 92 V 122 H 48 V 145 H 84',false);
  tail.forEach(([id,title,sub],i)=>{const x=84+i*308;out+=nnModule(x,121,278,title,sub,m.stageId===id);if(i<tail.length-1)out+=nnPath(`M ${x+278} 147 H ${x+306}`,false)});
  return nnSvg(out,192,'论文模型全景：分块、共享卷积、位置、编码器，以及预训练或推理分支');
}
function nnFeatureGrid(vector,x,y,selected,cell=12,cols=24) {
  return vector.map((v,d)=>`<rect x="${x+(d%cols)*cell}" y="${y+Math.floor(d/cols)*cell}" width="${cell-2}" height="${cell-2}" rx="1" fill="${nnTone(v)}" ${d===selected-1?'stroke="#fff0b2" stroke-width="2"':''}/>`).join('');
}
function nnWindow(m) {
  const x0=86,w=660,dy=m.axes===6?44:76,y0=70;
  let out=nnLabel(26,29,'逐通道标准化后的示例窗口 · 每条轴 128 个采样点',15);
  for(let r=0;r<m.axes;r++) {
    const y=y0+r*dy,signal=neuralSignal(r),x=x0+m.col*w/32;
    out+=nnLabel(18,y+5,NN_AXIS_NAMES[r],12,NN_AXIS_COLORS[r]);
    if(m.stageId==='patch') for(let p=0;p<32;p++)out+=nnRect(x0+p*w/32,y-20,w/32-1,40,p===m.col?'#624a2e':p%2?'#332e27':'#2b2823','none',2);
    out+=nnRect(x,y-21,w/32,42,'#73532e',r===m.row?'#ffdb96':'#806747',2);
    const d=signal.map((v,i)=>(i?'L':'M')+nnFixed(x0+i*w/128,1)+' '+nnFixed(y-v*12,1)).join(' ');
    out+=`<path d="${d}" fill="none" stroke="${NN_AXIS_COLORS[r]}" stroke-width="${r===m.row?2:1.2}" opacity="${r===m.row?1:.5}"/>`;
    if(r===m.row)for(let k=0;k<4;k++)out+=`<circle cx="${x0+(m.col*4+k)*w/128}" cy="${y-signal[m.col*4+k]*12}" r="3.4" fill="#fff0bd"/>`;
  }
  const p=patchProjection(m);out+=nnRect(790,70,244,225,'#342c23','#9d7a50');
  out+=nnLabel(810,100,`${NN_AXIS_NAMES[m.row]} · patch ${m.col+1}/32`,16,'#f0cc94');
  p.values.forEach((v,k)=>{out+=nnLabel(812,139+k*36,`x[${p.indices[k]}]`,13,'#c4b59e')+nnLabel(1014,139+k*36,nnFixed(v),16,'#f5e8d2','end')});
  out+=nnPath(`M ${x0+(m.col+.5)*w/32} ${y0+m.row*dy} C 765 ${y0+m.row*dy},755 175,785 175`);
  out+=nnLabel(86,355,`${m.col*4}–${m.col*4+3} 号采样（从 0 计数） · ${nnFixed(m.col*.08,2)}–${nnFixed((m.col+1)*.08,2)} s`,13);
  out+=nnLabel(86,378,`每轴 128÷4=32 个 patch；${m.axes} 轴共 ${m.tokenCount} 个，不把不同轴的 4 点混在一起。`,13,'#c6b7a0');
  return nnSvg(out,400);
}
function nnProjection(m) {
  const p=patchProjection(m),d=m.dim-1;
  let out=nnLabel(28,30,'同一套 Conv1D 分别作用于每条轴和每个片段',16,'#f1d7ac');
  p.values.forEach((v,k)=>{
    const y=90+k*66;
    out+=nnRect(32,y-22,150,42,'#3a3228')+nnLabel(48,y+4,`x[${p.indices[k]}] = ${nnFixed(v)}`,14);
    out+=nnPath(`M 182 ${y} H 283`)+nnRect(285,y-22,190,42,'#483a2a','#9e8159')+nnLabel(303,y+4,`w[${m.dim},${k+1}] = ${nnFixed(p.weights[d][k])}`,13);
    out+=nnPath(`M 475 ${y} C 516 ${y},508 188,540 188`);
  });
  out+=nnRect(542,153,130,70,'#664a2d','#e8bc7e')+nnLabel(607,182,'Σ xₖwₖ + b',18,'#ffe3ab','middle')+nnLabel(607,207,nnFixed(p.vector[d]),18,'#fff0d3','middle');
  out+=nnPath('M 672 188 H 721');
  out+=nnFeatureGrid(p.vector,732,85,m.dim,12);
  out+=nnLabel(875,63,'一个 Token · 全部 384 维',15,'#efce9a','middle');
  out+=nnLabel(735,310,`高亮：第 ${m.dim} 维 · b = ${nnFixed(p.bias[d])}`,13);
  out+=nnLabel(34,355,'卷积核形状 [384, 1, 4] · kernel=4 · stride=4 · 所有通道共享权重',14);
  out+=nnLabel(34,382,`${m.axes} 轴 × 32 个 patch → [${m.tokenCount},384]；颜色表示示例特征的正负与幅度。`,13,'#c6b7a0');
  return nnSvg(out,405);
}
function nnPosition(m) {
  const p=positionExample(m),start=Math.floor((m.dim-1)/12)*12,vecs=[p.content,p.time,p.axis,p.vector],xs=[40,302,564,826];
  const names=['卷积内容 z','时间位置 p_time','通道身份 p_axis','输入 Token e'];
  let out=nnLabel(28,30,`时间索引 t=${m.col} · 通道 ${NN_AXIS_NAMES[m.row]} · 逐维相加`,16,'#f1d7ac');
  vecs.forEach((v,j)=>{
    out+=nnLabel(xs[j]+88,67,names[j],15,'#eac795','middle');
    for(let k=0;k<12;k++){const d=start+k;out+=nnRect(xs[j],82+k*20,180,18,nnTone(v[d]),d===m.dim-1?'#fff0b2':'none',2)+nnLabel(xs[j]+9,96+k*20,`d${d+1}`,11)+nnLabel(xs[j]+167,96+k*20,nnFixed(v[d]),12,'#fff2dc','end')}
    if(j<3)out+=nnLabel(xs[j]+220,209,j===2?'=':'+',27,'#efce9a','middle');
  });
  out+=nnLabel(30,360,`显示第 ${start+1}–${start+12} 维；完整向量有 384 维。时间向量由同一时间位置共享，通道向量由同一条轴共享。`,13);
  out+=nnLabel(30,384,'论文采用可学习位置编码；这里的数值仅用于演示向量加法。',13,'#c6b7a0');
  return nnSvg(out,405);
}
function nnMaskGrid(m,restore=false) {
  const mask=new Set(m.maskedIndices),x0=95,y0=72,cw=27,dy=m.axes===6?39:67;
  let out=nnLabel(28,30,restore?'按原索引补回 mask token，再进入解码器':'遮挡位置从编码器序列移除，仍保留原位置索引',16,'#f1d7ac');
  for(let r=0;r<m.axes;r++){
    out+=nnLabel(18,y0+r*dy+17,NN_AXIS_NAMES[r],12,NN_AXIS_COLORS[r]);
    for(let c=0;c<32;c++){
      const i=r*32+c,hidden=mask.has(i),selected=i===m.selected;
      out+=nnRect(x0+c*cw,y0+r*dy,23,25,hidden?(restore?'#70563a':'#2c2823'):NN_AXIS_COLORS[r],selected?'#fff0a9':hidden?'#8b7e6b':'none',3);
      out+=nnLabel(x0+c*cw+11.5,y0+r*dy+17,hidden?(restore?'M':'×'):String(c+1),10,hidden?'#e3c89e':'#24211d','middle');
    }
  }
  out+=nnLabel(95,337,`${m.tokenCount} 个原位置 = ${m.visibleIndices.length} 个可见 + ${m.maskedIndices.length} 个遮挡（${nnFixed(100*m.maskedIndices.length/m.tokenCount,1)}%）`,15);
  out+=nnLabel(95,365,restore?`恢复 [${m.tokenCount},192] · M 是可学习的 mask 向量，不是被遮挡的原始内容。`:`编码器输入 [${m.visibleIndices.length},384] · 隐藏位置不占编码器的输入席位。`,14,'#d6b98c');
  out+=nnLabel(95,390,'时间/整通道模式受离散网格约束：此演示取整；论文报告遮挡比例为 65%。',12,'#c6b7a0');
  if(!m.isMasked||restore)out+=nnPath(`M ${x0+m.col*cw+12} ${y0+m.row*dy+25} V 310 H 980`);
  return nnSvg(out,410);
}
function nnEncoder(m) {
  let out=nnLabel(28,29,'ViT-1D：12 个结构相同、参数各自学习的 pre-norm Block',16,'#f1d7ac');
  for(let b=1;b<=12;b++){out+=nnModule(25+(b-1)*85,47,76,`Block ${b}`,'384 维',b===m.block);if(b<12)out+=nnPath(`M ${101+(b-1)*85} 72 H ${108+(b-1)*85}`,false)}
  out+=nnRect(22,135,1016,228,'#302a22','#887154');out+=nnLabel(42,162,`放大 Block ${m.block} · ${m.mode==='pretrain'?'可见':'全部'} ${m.visibleIndices.length} Token × 384 维`,14,'#f0d4aa');
  const mods=[[105,90,'LayerNorm','沿 384 维'],[240,162,'6-head MHSA','每头 Q/K/V 64'],[494,90,'LayerNorm','沿 384 维'],[635,240,'FFN + GELU','384 → 1536 → 384']];
  out+=nnLabel(43,251,'X',20,'#f0d4aa');
  mods.forEach(([x,w,t,s])=>out+=nnModule(x,216,w,t,s,false));
  [[64,103],[197,238],[404,444],[480,492],[587,633],[877,923],[962,1015]].forEach(([a,b])=>out+=nnPath(`M ${a} 242 H ${b}`));
  [461,944].forEach(x=>out+=`<circle cx="${x}" cy="242" r="17" fill="#624b30" stroke="#d6b98c"/>`+nnLabel(x,249,'+',24,'#fbe0ae','middle'));
  out+=nnPath('M 73 242 V 187 H 461 V 223',false)+nnPath('M 479 242 V 319 H 944 V 261',false);
  out+=nnLabel(268,180,'残差：X + Attention(LN(X))',12,'#d6b98c','middle')+nnLabel(738,343,'残差：Y + FFN(LN(Y))',12,'#d6b98c','middle');
  out+=nnLabel(26,392,'12 层都保持 Token 数量与 384 维宽度；注意力交换 Token 信息，FFN 分别变换每个 Token。',14);
  return nnSvg(out,415);
}
function nnAttention(m) {
  let out=nnLabel(28,28,'缩放点积注意力 · Softmax(QKᵀ / √64) V',17,'#f1d7ac');
  for(let h=1;h<=6;h++)out+=nnModule(40+(h-1)*170,47,150,`Head ${h}`,'Q / K / V：64 维',h===m.head);
  if(m.isMasked)return nnSvg(out+nnRect(115,155,830,150,'#47372a','#c28f60')+nnLabel(530,208,`Token #${m.selected+1} 在本轮被遮挡`,22,'#f4cf94','middle')+nnLabel(530,248,'它不会产生编码器的 Q、K、V。请在下方选择一个可见 Token。',16,'#eee1cb','middle'),360);
  const a=attentionExample(m),entries=a.entries.slice().sort((x,y)=>y.weight-x.weight).slice(0,6),max=Math.max(...entries.map(e=>e.weight));
  out+=nnModule(32,145,190,'LN → Q / K / V',`输入 [${a.entries.length},384]`,true)+nnPath('M 224 171 H 269');
  out+=nnModule(273,145,210,'选中 Q · 对所有 K','64 维点积 ÷ 8',true)+nnPath('M 486 171 H 529');
  out+=nnModule(533,145,200,'Softmax','全可见序列归一化',true)+nnPath('M 736 171 H 779');
  out+=nnModule(783,145,245,'Σ attention × V','每头输出 64 维',true);
  entries.forEach((e,i)=>{const y=237+i*22;out+=nnLabel(52,y+5,`#${e.index+1} ${NN_AXIS_NAMES[Math.floor(e.index/32)]} / ${e.index%32+1}`,12)+nnRect(220,y-8,Math.max(2,e.weight/max*485),14,'#c7a370','none',2)+nnLabel(732,y+4,`${nnFixed(e.weight*100,2)}%`,12)});
  out+=nnLabel(810,254,'显示权重最大的 6 项',13,'#d6b98c')+nnLabel(810,279,`全部 ${a.entries.length} 项之和 = 1`,13)+nnLabel(810,304,`选中查询：Token #${m.selected+1}`,13);
  out+=nnLabel(32,395,'6 个头的输出拼接：6×64=384；经输出投影 Wᴼ 后与输入残差相加。下方网格显示完整查询权重。',13);
  return nnSvg(out,415);
}
function nnFFN(m) {
  if(m.isMasked)return nnSvg(nnLabel(530,180,'这个 Token 被移除，不经过编码器前馈子层。',20,'#f0d4aa','middle'),360);
  const f=ffnExample(m);let out=nnLabel(28,30,`Block ${m.block} 的前馈子层 · 每个 Token 共用同一套权重`,16,'#f1d7ac');
  out+=nnModule(30,160,164,'LayerNorm','384 维')+nnPath('M 196 186 H 245');
  out+=nnModule(249,160,210,'Linear W₁ + b₁','384 → 1536')+nnPath('M 461 186 H 508');
  out+=nnModule(512,160,160,'GELU','逐维非线性')+nnPath('M 675 186 H 720');
  out+=nnModule(724,160,202,'Linear W₂ + b₂','1536 → 384')+nnPath('M 928 186 H 976');
  out+=`<circle cx="999" cy="186" r="20" fill="#624b30" stroke="#d6b98c"/>`+nnLabel(999,193,'+',24,'#fbe0ae','middle');
  out+=nnPath('M 30 186 V 93 H 999 V 163',false)+nnLabel(530,82,'保留输入的残差路径',14,'#d6b98c','middle');
  out+=nnFeatureGrid(f.output,92,264,m.dim,6,48)+nnLabel(410,286,'输出仍是 384 维',16)+nnLabel(410,314,`第 ${m.dim} 维：${nnFixed(f.input[m.dim-1])} + ${nnFixed(f.projected[m.dim-1])} = ${nnFixed(f.output[m.dim-1])}`,15,'#f0d4aa');
  out+=nnLabel(30,380,'此处独立演示一个 FFN 子层的维度与算术；未把它冒充为前面 12 层的实际前向结果。',13,'#c6b7a0');
  return nnSvg(out,405);
}
function nnDecoder(m) {
  const rec=reconstructionExample(m).rows[m.selected];
  let out=nnLabel(28,30,'训练分支 · 补回原位置 → 轻量解码 → 重建 4 点',16,'#f1d7ac');
  out+=nnModule(28,75,210,'可见表征 + mask token',`[${m.tokenCount},192] · 衔接推导`,true)+nnPath('M 240 101 H 286');
  for(let b=0;b<4;b++){out+=nnModule(290+b*130,75,116,`Decoder ${b+1}`,'192 维 · 4 头');if(b<3)out+=nnPath(`M ${408+b*130} 101 H ${418+b*130}`,false)}
  out+=nnPath('M 800 101 H 843')+nnModule(847,75,185,'片段重建输出','192 → 4 · 形状推导',true);
  const series=[rec.target,rec.prediction],colors=['#92b6a9','#edbc7c'];
  series.forEach((v,j)=>{const pts=v.map((value,k)=>`${315+k*145},${250-value*43}`).join(' ');out+=`<polyline points="${pts}" fill="none" stroke="${colors[j]}" stroke-width="3" ${j?'stroke-dasharray="7 4"':''}/>`;v.forEach((value,k)=>out+=`<circle cx="${315+k*145}" cy="${250-value*43}" r="5" fill="${colors[j]}"/>`)});
  out+=nnLabel(45,217,`Token #${m.selected+1}`,16)+nnLabel(45,245,rec.masked?'被遮挡 → 计入损失':'可见 → 不计入损失',14,'#e5c698');
  out+=nnLabel(806,220,'实线：目标示例片段',13,colors[0])+nnLabel(806,250,'虚线：构造的重建示例',13,colors[1]);
  out+=nnLabel(30,363,'重建线是用于 MSE 算例的构造数据，不是解码器或已训练模型的输出。',13,'#c6b7a0');
  return nnSvg(out,390);
}
function nnLoss(m) {
  const rec=reconstructionExample(m),r=rec.rows[m.selected];
  let out=nnLabel(28,30,'L = Σ（遮挡位置的预测 − 目标）² /（遮挡 Token 数 × 4）',17,'#f1d7ac');
  const headers=['点索引','目标 x','示例重建 x̂','平方误差'];headers.forEach((v,j)=>out+=nnLabel(90+j*210,95,v,15,'#d6b98c'));
  r.target.forEach((v,k)=>{[m.col*4+k,nnFixed(v),nnFixed(r.prediction[k]),nnFixed(r.squared[k],5)].forEach((value,j)=>out+=nnLabel(90+j*210,145+k*41,value,17))});
  out+=nnRect(42,295,976,70,'#483b2a','#ba9666')+nnLabel(60,323,`当前 #${m.selected+1}：${r.masked?'计入':'不计入'}损失`,17,'#f2d6a5')+nnLabel(60,349,`全序列遮挡项 ${m.maskedIndices.length}×4；该构造重建算例的 MSE = ${nnFixed(rec.mse,5)}`,16);
  out+=nnLabel(42,393,'可见 Token 的误差即使非零也被排除。该数值不代表论文报告的训练损失。',13,'#c6b7a0');
  return nnSvg(out,415);
}
function nnPool(m,head=false) {
  const p=poolingExample(m),d=m.dim-1;let out=nnLabel(28,30,head?'冻结表征 → 用户可训练的单层线性头':'对所有 Token 的同一维求平均；不是对 384 个维度求平均',16,'#f1d7ac');
  if(head){
    out+=nnModule(32,150,180,'Mean-pooled z','384 维 · 冻结',true)+nnPath('M 215 176 H 263')+nnModule(267,150,190,'Wz + b','[C,384] × [384]')+nnPath('M 460 176 H 505');
    p.probabilities.forEach((v,c)=>{const y=83+c*38;out+=nnLabel(520,y+7,`类别 ${c+1}`,13)+nnRect(585,y-10,Math.max(2,v*1700),24,'#c2a071','none',3)+nnLabel(902,y+7,`${nnFixed(v*100,2)}%`,13)});
    out+=nnLabel(32,324,'C=7 仅为算例：384×7+7 = 2695 个可训练参数',16,'#eac795');
    out+=nnLabel(32,358,'柱条是对示例 logits 做 softmax 的算术结果，不是活动识别预测。',13,'#c6b7a0');
  }else{
    for(let i=0;i<6;i++)out+=nnRect(32,64+i*44,230,36)+nnLabel(46,87+i*44,`#${i+1} · d${m.dim} = ${nnFixed(p.tokens[i][d])}`,14)+nnPath(`M 264 ${82+i*44} C 320 ${82+i*44},320 188,370 188`,false);
    out+=nnRect(372,142,216,92,'#5a432b','#c5a16b')+nnLabel(480,172,`Σ ${m.tokenCount} 个值`,19,'#f5dab0','middle')+nnLabel(480,202,`÷ ${m.tokenCount}`,19,'#f5dab0','middle')+nnPath('M 591 188 H 677');
    out+=nnFeatureGrid(p.vector,700,77,m.dim,12)+nnLabel(845,65,'窗口向量：384 维',15,'#eac795','middle')+nnLabel(700,306,`第 ${m.dim} 维平均 = ${nnFixed(p.vector[d])}`,16);
    out+=nnLabel(32,369,`左侧仅列前 6 个 Token，求和实际使用全部 ${m.tokenCount} 个；算例使用示例特征，不是编码器输出。`,13,'#c6b7a0');
  }
  return nnSvg(out,395);
}
export function renderNeuralDiagram(model) {
  const m=getArchitectureModel(model);
  if(['window','patch'].includes(m.stageId))return nnWindow(m);
  if(m.stageId==='project')return nnProjection(m);
  if(m.stageId==='position')return nnPosition(m);
  if(m.stageId==='mask'||m.stageId==='restore')return nnMaskGrid(m,m.stageId==='restore');
  if(m.stageId==='encoder')return nnEncoder(m);
  if(m.stageId==='attention')return nnAttention(m);
  if(m.stageId==='ffn')return nnFFN(m);
  if(m.stageId==='decoder')return nnDecoder(m);
  if(m.stageId==='loss')return nnLoss(m);
  return nnPool(m,m.stageId==='head');
}
function nnTokenPicker(m) {
  const mask=new Set(m.maskedIndices),a=m.stageId==='attention'&&!m.isMasked?attentionExample(m):null,weights=new Map(a?.entries.map(e=>[e.index,e.weight])||[]),max=a?Math.max(...weights.values()):1;
  let out=`<div class="nn-token-map" aria-label="选择要追踪的 Token"><div class="nn-token-ruler"><span>时间片段 →</span>${Array.from({length:32},(_,c)=>`<span>${c+1}</span>`).join('')}</div>`;
  for(let r=0;r<m.axes;r++)out+=`<div class="nn-token-row"><strong>${NN_AXIS_NAMES[r]}</strong>${Array.from({length:32},(_,c)=>{const i=r*32+c,hidden=mask.has(i),weight=weights.get(i);return `<button type="button" data-nn-token="${i}" aria-pressed="${i===m.selected}" class="${hidden?'is-masked':''}" style="--token-color:${NN_AXIS_COLORS[r]};${weight!==undefined?`--attention:${.2+.8*weight/max};`:''}" aria-label="${NN_AXIS_NAMES[r]} 第 ${c+1} 个片段，Token ${i+1}，${hidden?'被遮挡':'可见'}${weight!==undefined?'，注意力权重 '+nnFixed(weight*100,2)+'%':''}">${hidden?'×':c+1}</button>`}).join('')}</div>`;
  return out+'</div>';
}
function nnEquation(m) {
  const d=m.dim-1,p=patchProjection(m);
  if(m.stageId==='project')return `<code>z[${m.dim}] = ${p.values.map((v,k)=>`(${nnFixed(v)} × ${nnFixed(p.weights[d][k])})`).join(' + ')} + (${nnFixed(p.bias[d])}) = <b>${nnFixed(p.vector[d])}</b></code><p>该维使用一个长度为 4 的卷积核；对不同 patch、不同轴都重复使用这组核。其余 383 组核同时生成其余特征。</p>`;
  if(m.stageId==='position'){const p=positionExample(m);return `<code>e[${m.dim}] = ${nnFixed(p.content[d])} + (${nnFixed(p.time[d])}) + (${nnFixed(p.axis[d])}) = <b>${nnFixed(p.vector[d])}</b></code><p>颜色方格是同一个 Token 的特征维；下面的网格才是不同时间与通道的 Token。</p>`}
  if(m.stageId==='attention'&&!m.isMasked){const a=attentionExample(m);return `<code>head ${m.head}：Σⱼ aᵢⱼ = ${nnFixed(a.entries.reduce((s,e)=>s+e.weight,0),6)}；output[1] = Σⱼ aᵢⱼ Vⱼ[1] = ${nnFixed(a.output[0])}</code><p>计算包含全部 ${a.entries.length} 个可见 Token，每个 Q/K/V 都有 64 维。数值由合成输入与示例稀疏投影权重生成，仅演示一个注意力子层。</p>`}
  if(m.stageId==='ffn')return '<code>Y = X + W₂ GELU(W₁ LayerNorm(X) + b₁) + b₂</code><p>4× 扩张发生在每个 Token 的特征维上，不会把 Token 数量变成 4 倍。</p>';
  if(m.stageId==='head')return '<code>logits = Wz + b；W ∈ ℝ^(C×384)，b ∈ ℝ^C；参数量 = 385C</code><p>添加新类别时更新个人线性探针；冻结编码器继续生成同一套 384 维特征。</p>';
  return `<code>所选 Token #${m.selected+1} = 通道索引 ${m.row} × 32 + 时间索引 ${m.col}（展示编号加 1）</code><p>采样索引 ${p.indices[0]}–${p.indices[3]}；时间 ${nnFixed(m.col*.08,2)}–${nnFixed((m.col+1)*.08,2)} 秒。${m.mode==='pretrain'?(m.isMasked?'本轮隐藏：不进入编码器，只在恢复与重建阶段出现。':'本轮可见：携带原位置进入编码器。'):'推理使用全部 Token。'}</p>`;
}
export function makeNeuralView(root,{axes=6,mode='inference',maskMode='random',row=0,col=0,onChange=()=>{}}={}) {
  const reduce=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state=getArchitectureModel({axes,mode,maskMode,row,col,playing:!reduce}),visible=false,autoTimer=null,scanning=false,destroyed=false;
  const isPageVisible=()=>typeof document==='undefined'||!document.hidden;
  function toggleSvg(){const svgs=root.querySelectorAll?.('svg')||[root.querySelector('svg')];for(const svg of svgs){if(state.playing&&visible&&isPageVisible())svg?.unpauseAnimations?.();else svg?.pauseAnimations?.()}}
  function emit(){onChange({...state})}
  function syncPlayback(){
    if(autoTimer!==null){clearInterval(autoTimer);autoTimer=null}toggleSvg();
    if(!destroyed&&visible&&state.playing&&isPageVisible())autoTimer=setInterval(()=>{
      if(scanning){if(state.col===31){scanning=false;state=getArchitectureModel({...state,playing:false});draw();syncPlayback();return}state=getArchitectureModel({...state,col:state.col+1})}
      else {if(state.step===state.stages.length-1){state=getArchitectureModel({...state,playing:false});draw();syncPlayback();return}state=getArchitectureModel({...state,step:state.step+1})}
      draw();emit();
    },(scanning?1000:5200)/state.speed);
  }
  function focusedControl(){
    const b=typeof document==='undefined'?null:document.activeElement;
    if(!b||!root.contains(b)||typeof b.hasAttribute!=='function')return '';
    for(const name of ['axes','mode','mask','step','prev','next','play','scan','token','dim','head','block','speed'])if(b.hasAttribute('data-nn-'+name)){
      const value=b.dataset['nn'+name[0].toUpperCase()+name.slice(1)];return `[data-nn-${name}${value===undefined?'':`="${value}"`}]`;
    }
    return '';
  }
  function draw(){
    const focus=focusedControl(),m=state;
    const buttons=(values,key)=>values.map(([value,label])=>`<button type="button" data-nn-${key}="${value}" aria-pressed="${String(String(key==='mask'?m.maskMode:m[key])===String(value))}">${label}</button>`).join('');
    root.innerHTML=`<div class="nn-heading"><div><span class="tiny-label">TRANSFHAR · ARCHITECTURE IN MOTION</span><h2>跟随一个片段，走过实际模型架构</h2><p>先看完整路径，再放大每个模块。点击下方任意 Token 可改变追踪对象。</p></div><button type="button" data-nn-play aria-pressed="${m.playing}">${m.playing?'Ⅱ 暂停':'▷ 播放计算流程'}</button></div>
    <div class="nn-controls"><div class="nn-control-group" role="group" aria-label="传感器轴数">${buttons([[3,'3 轴'],[6,'6 轴']],'axes')}</div><div class="nn-control-group" role="group" aria-label="模型阶段">${buttons([['pretrain','预训练'],['inference','推理']],'mode')}</div>${m.mode==='pretrain'?`<div class="nn-control-group" role="group" aria-label="遮挡模式">${buttons([['random','随机'],['time','时间'],['channel','通道']],'mask')}</div>`:''}<div class="nn-control-group" role="group" aria-label="播放速度">${buttons([[.65,'慢速'],[1,'常速'],[1.6,'快速']],'speed')}</div></div>
    <div class="nn-overview">${nnOverview(m)}</div>
    <div class="nn-stage-list" role="group" aria-label="计算步骤">${m.stages.map((s,i)=>`<button type="button" data-nn-step="${i}" aria-current="${m.step===i?'step':'false'}"><small>${String(i+1).padStart(2,'0')}</small>${s.short}</button>`).join('')}</div>
    <div class="nn-explanation"><div class="nn-step-caption"><strong>${m.title}</strong><span>${m.step+1} / ${m.stages.length}</span></div><p>${m.description}</p><small>论文 ${m.source}</small></div>
    <div class="nn-diagram">${renderNeuralDiagram(m)}</div>
    <div class="nn-context-controls">${['encoder','attention','ffn'].includes(m.stageId)?`<div class="nn-control-group nn-layer-picker" role="group" aria-label="编码器层">${buttons(Array.from({length:12},(_,i)=>[i+1,'层 '+(i+1)]),'block')}</div>`:''}${m.stageId==='attention'?`<div class="nn-control-group" role="group" aria-label="注意力头">${buttons(Array.from({length:6},(_,i)=>[i+1,'头 '+(i+1)]),'head')}</div>`:''}${['project','position','ffn','pool'].includes(m.stageId)?`<label class="nn-dim-label">展开特征维度 <input type="number" min="1" max="384" value="${m.dim}" data-nn-dim aria-label="选择特征维度"> / 384</label>`:''}</div>
    <div class="nn-calculation"><span class="tiny-label">可复算的示例 · 非训练权重</span>${nnEquation(m)}</div>
    <div class="nn-trace-header"><div><strong>追踪 Token #${m.selected+1}</strong><p>${NN_AXIS_NAMES[m.row]} · 第 ${m.col+1}/32 个片段 · ${m.tokenCount} 个 Token，每个 384 维</p></div><button type="button" data-nn-scan aria-pressed="${scanning}">${scanning?(m.playing?'Ⅱ 暂停分块扫描':'▷ 继续分块扫描'):'▷ 逐块生成 32 个 Token'}</button></div>
    <div class="nn-token-scroll">${nnTokenPicker(m)}</div><p class="nn-map-note">金框为当前片段；× 表示遮挡。${m.stageId==='attention'?'亮度表示所选查询对每个可见 Token 的注意力权重。':'每行一条轴，每列 4 个采样点；点击单元格即可追踪。'}</p>
    <div class="nn-nav"><button type="button" data-nn-prev ${m.step===0?'disabled':''}>← 上一步</button><span role="status">${scanning?(m.playing?'正在生成第 ':'分块扫描已暂停 · 第 ')+(m.col+1)+' / 32 个 Token':m.playing?'正在播放 · 手动选择会暂停':'已暂停 · 可自由选择片段与步骤'}</span><button type="button" data-nn-next ${m.step===m.stages.length-1?'disabled':''}>下一步 →</button></div>
    <p class="nn-disclaimer">架构与维度依据论文 §4.1.2–4.2.1；每头维度、1536 维前馈层、解码衔接和 4 点输出按形状推导并注明。波形、特征、注意力与重建均为可复算的教学算例，未使用训练权重，也未执行整个 12 层模型。层选择用于查看同构模块；算例不随层号变化。</p>`;
    toggleSvg();if(focus){const same=root.querySelector(focus),target=same&&!same.disabled?same:root.querySelector(`[data-nn-step="${m.step}"]`);target?.focus?.({preventScroll:true})}
  }
  function click(e){
    const b=e.target.closest('button');if(!b||!root.contains(b))return;
    const next={...state};let changed=false,manual=true;
    if(b.hasAttribute('data-nn-play')){next.playing=!next.playing;if(next.playing&&!scanning&&next.step===next.stages.length-1)next.step=0;manual=false;changed=true}
    else if(b.hasAttribute('data-nn-scan')){if(scanning){next.playing=!next.playing}else{scanning=true;next.col=0;next.step=next.stages.findIndex(s=>s.id==='project');next.playing=true}manual=false;changed=true}
    else if(b.hasAttribute('data-nn-axes')){next.axes=Number(b.dataset.nnAxes);changed=true}
    else if(b.hasAttribute('data-nn-mode')){next.mode=b.dataset.nnMode;next.step=0;changed=true}
    else if(b.hasAttribute('data-nn-mask')){next.maskMode=b.dataset.nnMask;changed=true}
    else if(b.hasAttribute('data-nn-token')){const i=Number(b.dataset.nnToken);next.row=Math.floor(i/32);next.col=i%32;changed=true}
    else if(b.hasAttribute('data-nn-step')){next.step=Number(b.dataset.nnStep);changed=true}
    else if(b.hasAttribute('data-nn-prev')){next.step--;changed=true}
    else if(b.hasAttribute('data-nn-next')){next.step++;changed=true}
    else if(b.hasAttribute('data-nn-head')){next.head=Number(b.dataset.nnHead);changed=true}
    else if(b.hasAttribute('data-nn-block')){next.block=Number(b.dataset.nnBlock);changed=true}
    else if(b.hasAttribute('data-nn-speed')){next.speed=Number(b.dataset.nnSpeed);manual=false;changed=true}
    if(!changed)return;
    if(manual){next.playing=false;scanning=false}state=getArchitectureModel(next);draw();syncPlayback();emit();
  }
  function change(e){if(!e.target.hasAttribute?.('data-nn-dim'))return;state=getArchitectureModel({...state,dim:e.target.value,playing:false});scanning=false;draw();syncPlayback();emit()}
  const visibilityChanged=()=>syncPlayback();
  root.addEventListener('click',click);root.addEventListener('change',change);
  if(typeof document!=='undefined')document.addEventListener?.('visibilitychange',visibilityChanged);
  draw();
  return {
    update(values){
      let next=getArchitectureModel({...state,...values});
      if(next.mode!==state.mode){const stage=next.stages.findIndex(s=>s.id===state.stageId);next=getArchitectureModel({...next,step:stage<0?0:stage})}
      if(['axes','mode','maskMode','row','col','step','dim','head','block','playing','speed'].some(k=>next[k]!==state[k])){state=next;draw();syncPlayback()}
    },
    setVisible(v){visible=!!v;syncPlayback()},
    destroy(){destroyed=true;if(autoTimer!==null)clearInterval(autoTimer);root.removeEventListener('click',click);root.removeEventListener('change',change);if(typeof document!=='undefined')document.removeEventListener?.('visibilitychange',visibilityChanged);root.innerHTML=''}
  };
}
