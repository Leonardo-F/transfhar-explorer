// Reported architecture: paper §4.1.2–4.2.1. Numerical demonstrations use
// deterministic synthetic signals and illustrative weights, not a checkpoint.
import {pipelineMask} from './pipeline-view.js';

const NN_STAGE_INFO = {
  window:['窗口','128 点信号窗口','每轴 128 点；50 Hz × 2.56 s。先对齐、滤波和逐通道标准化。','§4.1.3'],
  patch:['分块','4 个采样点 → 一个 patch','核长 4、步长 4，无重叠分块；同一时间段的各条轴分别分块。','§4.1.2'],
  project:['卷积','共享 Conv1D → 384 维','每一个 4 点片段经过同一组 384 个卷积核，得到 384 个特征，而不是 384 个时间点。','§4.1.2'],
  position:['位置','内容 + 时间 + 通道','将两个可学习位置向量逐维相加：时间索引区分何时，通道索引区分哪条轴。','§4.1.2'],
  mask:['遮挡','移除遮挡 Token','预训练时先移除约 65% Token；保留下来的 Token 仍携带原时间与通道身份。','§4.1.4'],
  encoder:['编码器','12 个 pre-norm Transformer Block','每层先 LayerNorm，再多头自注意力并残差相加；然后再做 LayerNorm、前馈网络与残差相加。','§4.1.2'],
  attention:['注意力','一层中的 6 个注意力头','每个头将 384 维投影为 Q、K、V（各 64 维）；对所有可见 Token 做缩放点积和 softmax，再加权汇聚 V。','§4.1.2；每头 64 维为 384÷6 推导'],
  ffn:['前馈','逐 Token 的 4× 前馈网络','384 → 1536 → 384，使用 GELU。每个 Token 共用前馈权重；Token 之间的信息交换发生在前面的注意力子层。','§4.1.2；1536=4×384'],
  restore:['插回','恢复原索引与 mask token','解码前恢复完整的 Token 位置；编码器输出为 384 维，解码器宽度为 192，具体衔接方式未在论文中展开。','§4.1.4；384→192 衔接为形状推导'],
  decoder:['解码','4 层轻量解码器','192 维、4 头、4 层；重建每个 patch 的 4 个点。预训练后丢弃解码器。','§4.1.4；4 点输出为 patch 大小推导'],
  loss:['损失','仅遮挡位置的 MSE','逐点平方误差只在被遮挡的 patch 上求平均；可见位置不计入损失。','§4.1.4'],
  pool:['池化','沿 Token 维逐项平均','冻结编码器输出完整 Token 序列；每一维分别求平均，得到一个 384 维窗口表征。','§4.1.2、§4.2.1'],
  head:['分类头','个人线性探针 384 → C','只训练单层线性探针；每增加一类增加 385 个参数。此处以 C=7 为例显示类别分数。','§4.2.1']
};
const nnInt=(v,lo,hi,fallback=lo)=>Number.isFinite(Number(v))?Math.min(hi,Math.max(lo,Math.floor(Number(v)))):fallback;
const nnDemo=(i,s=1)=>Math.sin((i+1)*1.713+s*2.31)*.63+Math.cos((i+1)*.317+s)*.37;
const nnNorm=v=>{const mean=v.reduce((a,b)=>a+b,0)/v.length,variance=v.reduce((s,x)=>s+(x-mean)**2,0)/v.length;return v.map(x=>(x-mean)/Math.sqrt(variance+1e-5))};
const nnSoftmax=v=>{const max=Math.max(...v),e=v.map(x=>Math.exp(x-max)),sum=e.reduce((a,b)=>a+b,0);return e.map(x=>x/sum)};
const nnSignalCache=new Map(),nnPositionCache=new Map();

export function getArchitectureModel(input={}) {
  const axes=Number(input.axes)===3?3:6,mode=input.mode==='pretrain'?'pretrain':'inference';
  const maskMode=['random','time','channel'].includes(input.maskMode)?input.maskMode:'random';
  const ids=mode==='pretrain'?['window','patch','project','position','mask','encoder','attention','ffn','restore','decoder','loss']:['window','patch','project','position','encoder','attention','ffn','pool','head'];
  const stages=ids.map(id=>({id,short:NN_STAGE_INFO[id][0],title:NN_STAGE_INFO[id][1],description:NN_STAGE_INFO[id][2],source:NN_STAGE_INFO[id][3]}));
  const step=nnInt(input.step,0,stages.length-1),stage=stages[step],row=nnInt(input.row,0,axes-1),col=nnInt(input.col,0,31);
  const maskedIndices=[...pipelineMask(axes,mode==='inference'?'inference':maskMode)],maskedSet=new Set(maskedIndices);
  const tokenCount=axes*32,visibleIndices=Array.from({length:tokenCount},(_,i)=>i).filter(i=>!maskedSet.has(i));
  const focusStep=['window','patch','project','position'].includes(stage.id)?0:stage.id==='mask'?1:['encoder','attention','ffn'].includes(stage.id)?2:['restore','decoder','pool'].includes(stage.id)?3:4;
  return {axes,mode,maskMode,step,stages,stageId:stage.id,title:stage.title,description:stage.description,source:stage.source,
    row,col,selected:row*32+col,dim:nnInt(input.dim,1,384),head:nnInt(input.head,1,6),block:nnInt(input.block,1,12),
    playing:input.playing!==false,speed:[.65,1,1.6].includes(Number(input.speed))?Number(input.speed):1,
    tokenCount,maskedIndices,visibleIndices,isMasked:maskedSet.has(row*32+col),encoderHeads:6,headDim:64,ffnDim:1536,focusStep,
    phase:['restore','decoder'].includes(stage.id)?'restore':stage.id==='loss'?'loss':'masked'};
}

export function neuralSignal(row) {
  if(!nnSignalCache.has(row)){
    const raw=Array.from({length:128},(_,i)=>.55*Math.sin(i*Math.PI/21+row*1.1)+.3*Math.sin(i*Math.PI/6.5+row*2.2)+.15*Math.sin(i*Math.PI/2.65+row*.7));
    nnSignalCache.set(row,nnNorm(raw));
  }
  return nnSignalCache.get(row).slice();
}

export function patchProjection(input) {
  const m=getArchitectureModel(input),signal=neuralSignal(m.row),indices=Array.from({length:4},(_,i)=>m.col*4+i),values=indices.map(i=>signal[i]);
  const weights=Array.from({length:384},(_,d)=>Array.from({length:4},(_,k)=>nnDemo(d*4+k,3)*.35)),bias=Array.from({length:384},(_,d)=>nnDemo(d,7)*.08);
  const vector=weights.map((w,d)=>w.reduce((s,v,k)=>s+v*values[k],bias[d]));
  return {signal,indices,values,weights,bias,vector};
}

export function positionExample(input) {
  const m=getArchitectureModel(input),key=m.row*32+m.col;
  if(!nnPositionCache.has(key)){
    const content=patchProjection(m).vector,time=Array.from({length:384},(_,d)=>nnDemo(m.col*384+d,11)*.12),axis=Array.from({length:384},(_,d)=>nnDemo(m.row*384+d,19)*.12);
    nnPositionCache.set(key,{content,time,axis,vector:content.map((x,d)=>x+time[d]+axis[d])});
  }
  return nnPositionCache.get(key);
}

// Sparse illustrative Wq/Wk/Wv keep a full 64-D head computationally small.
// This evaluates one attention sublayer, not the trained 12-layer network.
export function attentionExample(input) {
  const m=getArchitectureModel(input);
  if(m.isMasked)return {blocked:true,entries:[],q:[],output:[]};
  const vectors=m.visibleIndices.map(index=>nnNorm(positionExample({...m,row:Math.floor(index/32),col:index%32}).vector));
  const project=(v,kind)=>Array.from({length:64},(_,d)=>v[(d*3+m.head*17+kind*41)%384]*.7+v[(d*7+kind*13+m.head)%384]*.3);
  const q=project(vectors[m.visibleIndices.indexOf(m.selected)],0),ks=vectors.map(v=>project(v,1)),vs=vectors.map(v=>project(v,2));
  const scores=ks.map(k=>k.reduce((s,x,d)=>s+x*q[d],0)/Math.sqrt(64)),weights=nnSoftmax(scores);
  const entries=m.visibleIndices.map((index,i)=>({index,score:scores[i],weight:weights[i],v:vs[i]}));
  return {blocked:false,q,entries,output:Array.from({length:64},(_,d)=>entries.reduce((s,e)=>s+e.weight*e.v[d],0))};
}

export function ffnExample(input) {
  const m=getArchitectureModel(input),x=positionExample(m).vector,normalized=nnNorm(x);
  const preactivation=Array.from({length:1536},(_,j)=>normalized[j%384]*nnDemo(j,29)*.5+normalized[(j*7+1)%384]*.2);
  const hidden=preactivation.map(v=>.5*v*(1+Math.tanh(Math.sqrt(2/Math.PI)*(v+.044715*v**3))));
  const projected=Array.from({length:384},(_,d)=>hidden[d]*.4+hidden[d+384]*.3+hidden[d+768]*.2+hidden[d+1152]*.1);
  return {input:x,normalized,preactivation,hidden,projected,output:x.map((v,d)=>v+projected[d])};
}

export function poolingExample(input) {
  const m=getArchitectureModel({...input,mode:'inference'});
  const tokens=Array.from({length:m.tokenCount},(_,index)=>positionExample({...m,row:Math.floor(index/32),col:index%32}).vector);
  const vector=Array.from({length:384},(_,d)=>tokens.reduce((s,t)=>s+t[d],0)/m.tokenCount);
  const logits=Array.from({length:7},(_,c)=>vector.reduce((s,x,d)=>s+x*nnDemo(c*384+d,41)*.1,nnDemo(c,43)*.1));
  return {tokens,vector,logits,probabilities:nnSoftmax(logits)};
}

export function reconstructionExample(input) {
  const m=getArchitectureModel(input),mask=new Set(m.maskedIndices);
  const rows=Array.from({length:m.tokenCount},(_,index)=>{
    const target=neuralSignal(Math.floor(index/32)).slice(index%32*4,index%32*4+4);
    const prediction=target.map((x,k)=>x*.8+nnDemo(index*4+k,53)*.24);
    return {index,masked:mask.has(index),target,prediction,squared:target.map((x,k)=>(x-prediction[k])**2)};
  });
  const total=rows.filter(r=>r.masked).reduce((s,r)=>s+r.squared.reduce((a,b)=>a+b,0),0);
  return {rows,mse:mask.size?total/(mask.size*4):0};
}
