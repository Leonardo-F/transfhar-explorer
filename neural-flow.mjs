// An animated explanatory diagram; it does not display trained model weights,
// real activations, attention values, or predictions.
const TITLES={
  inference:['输入窗口','分块与位置','Transformer 编码','平均池化','个人分类头'],
  pretrain:['输入窗口','分块与位置','只编码可见 token','插回与解码','遮挡位置的损失']
};
const DETAILS={
  inference:[
    '从 50 Hz 腕部信号中取出 2.56 秒窗口，每条轴包含 128 个采样点。',
    '每轴 32 个片段；共享卷积生成 384 维 token，并加入时间位置和通道身份。',
    '推理时全部 token 进入 12 层 ViT-1D 编码器；每层有 6 个注意力头。',
    '平均池化：沿 token 维逐项平均，得到一个 384 维窗口表征。',
    '冻结编码器；只训练用户的线性探针，将 384 维表征映射到 C 类。'
  ],
  pretrain:[
    '从 50 Hz 腕部信号中取出 2.56 秒窗口，每条轴包含 128 个采样点。',
    '每轴 32 个片段；共享卷积生成 384 维 token，并加入时间位置和通道身份。',
    '约 65% 的 token 被遮挡并从编码器输入移除，12 层编码器只处理可见部分。',
    '按原位置插回可学习 mask token；4 层、192 维解码器重建被遮挡片段。',
    '只在遮挡位置计算均方误差；解码器用于预训练，推理时丢弃。'
  ]
};

export function getNeuralModel({axes=6,mode='inference',step=0,playing=true}={}){
  axes=Number(axes)===3?3:6;mode=mode==='pretrain'?'pretrain':'inference';
  step=Math.max(0,Math.min(4,Math.floor(Number(step)||0)));
  return {axes,mode,step,playing:!!playing,tokenCount:axes*32,title:TITLES[mode][step],description:DETAILS[mode][step]};
}

export function renderNeuralDiagram(model){
  const m=getNeuralModel(model), xs=[78,208,342,452,562,702,840], ys=[86,130,174,218,262,306];
  const colors=['#e9c693','#f0d8a5','#c5aa88','#d8bc8a','#e0c899','#e6c19a','#db9b6e'];
  const maskedRows=new Set([0,2,3,5]);
  let edges='',nodes='',signals='';
  for(let col=0;col<xs.length-1;col++){
    for(let a=0;a<ys.length;a++)for(let b=0;b<ys.length;b++){
      if(m.mode==='pretrain'&&col===1&&maskedRows.has(a))continue;
      const active=(m.step===0&&col===0)||(m.step===1&&col===1)||(m.step===2&&col>=2&&col<=4)||(m.step===3&&col===5)||(m.step===4&&col===5);
      edges+=`<line x1="${xs[col]}" y1="${ys[a]}" x2="${xs[col+1]}" y2="${ys[b]}" stroke="${active?'#b99b70':'#7a6e61'}" stroke-opacity="${active?'.24':'.10'}" stroke-width=".7"/>`;
    }
    for(let k=0;k<2;k++){
      const y1=ys[(col+k*3)%ys.length],y2=ys[(col*2+k*2+1)%ys.length];
      signals+=`<circle r="3.1" fill="#f3cc87" opacity=".95"><animateMotion path="M ${xs[col]} ${y1} L ${xs[col+1]} ${y2}" dur="1.4s" begin="${(col*.19+k*.6).toFixed(2)}s" repeatCount="indefinite"/></circle>`;
    }
  }
  for(let col=0;col<xs.length;col++)for(let r=0;r<ys.length;r++){
    const active=(m.step===0&&col===0)||(m.step===1&&col===1)||(m.step===2&&col>=2&&col<=4)||(m.step===3&&col===5)||(m.step===4&&col===6);
    const masked=m.mode==='pretrain'&&col===1&&maskedRows.has(r);
    nodes+=`<circle ${masked?'data-nn-masked="true"':''} cx="${xs[col]}" cy="${ys[r]}" r="${active?9:7}" fill="${masked?'#393734':active?colors[col]:'#4b443b'}" stroke="${masked?'#918b80':colors[col]}" stroke-dasharray="${masked?'3 2':'none'}" stroke-opacity="${active?'.95':'.58'}" stroke-width="1.2"/>`;
  }
  const right1=m.mode==='pretrain'?'插回 · 解码':'平均池化';
  const right2=m.mode==='pretrain'?'遮挡 MSE':'线性探针';
  const count=m.mode==='pretrain'?`${m.tokenCount} 个 token · 仅可见部分进入编码器`:`${m.tokenCount} 个 token · 全部进入编码器`;
  return `<svg class="nn-svg" viewBox="0 0 920 420" role="img" aria-label="${m.axes} 轴 ${m.mode==='pretrain'?'预训练':'下游推理'}的神经网络结构动画。节点和连线为示意。">
  <rect width="920" height="420" rx="14" fill="#24211d"/>
  <rect x="286" y="52" width="332" height="287" rx="18" fill="#373127" stroke="#786b57" stroke-width="1"/>
  <text x="452" y="37" text-anchor="middle" fill="#f2e4cb" class="nn-label nn-title">ViT-1D 编码器 · 12 层 · 384 维 · 6 头</text>
  <text x="342" y="330" text-anchor="middle" class="nn-label nn-sub">第 1–4 层</text><text x="452" y="330" text-anchor="middle" class="nn-label nn-sub">第 5–8 层</text><text x="562" y="330" text-anchor="middle" class="nn-label nn-sub">第 9–12 层</text>
  <g>${edges}</g><g>${nodes}</g><g class="nn-signals">${signals}</g>
  <text x="78" y="365" text-anchor="middle" class="nn-label">输入窗口</text><text x="208" y="365" text-anchor="middle" class="nn-label">分块 + 位置</text>
  <text x="702" y="365" text-anchor="middle" class="nn-label">${right1}</text><text x="840" y="365" text-anchor="middle" class="nn-label">${right2}</text>
  <text x="460" y="398" text-anchor="middle" class="nn-label nn-sub">${count}；节点、连线和流光均为教学示意</text>
  </svg>`;
}

export function makeNeuralView(root,{axes=6,mode='inference',onChange=()=>{}}={}){
  const reduce=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state=getNeuralModel({axes,mode,playing:!reduce}),visible=false,autoTimer=null;
  const toggleSvg=()=>{const svg=root.querySelector('svg');if(!svg)return;if(state.playing&&visible)svg.unpauseAnimations?.();else svg.pauseAnimations?.()};
  function syncPlayback(){
    if(autoTimer!==null){clearInterval(autoTimer);autoTimer=null}
    toggleSvg();
    if(visible&&state.playing)autoTimer=setInterval(()=>{
      state=getNeuralModel({...state,step:(state.step+1)%5});draw();
      onChange({axes:state.axes,mode:state.mode,step:state.step});
    },2800);
  }
  function focusedControl(){
    const b=typeof document==='undefined'?null:document.activeElement;
    if(!b||!root.contains(b)||typeof b.hasAttribute!=='function')return '';
    for(const name of ['axes','mode','step','prev','next','play'])if(b.hasAttribute('data-nn-'+name)){
      const value=b.dataset['nn'+name[0].toUpperCase()+name.slice(1)];
      return `[data-nn-${name}${value===undefined?'':`="${value}"`}]`;
    }
    return '';
  }
  function draw(){
    const focusSelector=focusedControl();
    const m=state,buttons=(values,key)=>values.map(([value,label])=>`<button type="button" data-nn-${key}="${value}" aria-pressed="${String(String(m[key])===String(value))}">${label}</button>`).join('');
    root.innerHTML=`<div class="nn-heading"><div><span class="tiny-label">ANIMATED MODEL STORY</span><h2>看见信号如何流过网络</h2><p>借鉴数学科普的节点与连线表达，结合论文中的两个阶段。</p></div><button type="button" data-nn-play aria-pressed="${m.playing}">${m.playing?'Ⅱ 暂停演示':'▷ 自动讲解'}</button></div>
    <div class="nn-controls"><div class="nn-control-group" role="group" aria-label="传感器轴数">${buttons([[3,'3 轴'],[6,'6 轴']],'axes')}</div><div class="nn-control-group" role="group" aria-label="模型阶段">${buttons([['pretrain','预训练'],['inference','推理']],'mode')}</div></div>
    <div class="nn-stage-list" aria-label="讲解步骤">${TITLES[m.mode].map((title,i)=>`<button type="button" data-nn-step="${i}" aria-current="${m.step===i?'step':'false'}"><small>${String(i+1).padStart(2,'0')}</small>${title}</button>`).join('')}</div>
    <div class="nn-diagram">${renderNeuralDiagram(m)}</div><div class="nn-explanation" aria-live="polite"><strong>${m.title}</strong><p>${m.description}</p><span>${m.axes} 轴 × 32 = ${m.tokenCount} token · 384 维</span></div>
    <div class="nn-nav"><button type="button" data-nn-prev ${m.step===0?'disabled':''}>← 上一步</button><button type="button" data-nn-next ${m.step===4?'disabled':''}>下一步 →</button></div>
    <p class="nn-disclaimer">此图压缩表示网络结构，不是实际神经元数量、注意力矩阵、模型权重、传感器数据或分类结果。三个编码器图组各概括 4 层；预训练中的灰色虚线节点示意遮挡，数量并非实际遮挡样本。真实模型细节以论文为准。</p>`;
    toggleSvg();
    if(focusSelector){const same=root.querySelector(focusSelector),target=same&&!same.disabled?same:root.querySelector(`[data-nn-step="${state.step}"]`);target?.focus?.({preventScroll:true})}
  }
  function click(e){
    const b=e.target.closest('button');if(!b||!root.contains(b))return;
    const next={...state};let changed=false;
    if(b.hasAttribute('data-nn-axes')){next.axes=Number(b.dataset.nnAxes);changed=true}
    else if(b.hasAttribute('data-nn-mode')){next.mode=b.dataset.nnMode;next.step=0;changed=true}
    else if(b.hasAttribute('data-nn-step')){next.step=Number(b.dataset.nnStep);changed=true}
    else if(b.hasAttribute('data-nn-prev')){next.step--;changed=true}
    else if(b.hasAttribute('data-nn-next')){next.step++;changed=true}
    else if(b.hasAttribute('data-nn-play')){next.playing=!next.playing;changed=true}
    if(!changed)return;
    const wasPlaying=state.playing;state=getNeuralModel(next);draw();
    if(wasPlaying!==state.playing)syncPlayback();
    if(wasPlaying===state.playing)onChange({axes:state.axes,mode:state.mode,step:state.step});
  }
  root.addEventListener('click',click);draw();
  return {update(values){const next=getNeuralModel({...state,...values});if(next.axes!==state.axes||next.mode!==state.mode||next.step!==state.step){state=next;draw()}},setVisible(v){visible=!!v;syncPlayback()},destroy(){if(autoTimer!==null)clearInterval(autoTimer);root.removeEventListener('click',click);root.innerHTML=''}};
}
