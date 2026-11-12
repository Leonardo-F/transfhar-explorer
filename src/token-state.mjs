// Shapes and indexes follow the paper's 50 Hz, 128-point, 4-sample patch setup.
export function describeToken({axes,axis,patch,dim,mode,maskedIndices=[]}){
 const names=['acc X','acc Y','acc Z','gyro X','gyro Y','gyro Z'];
 if(![3,6].includes(axes)||axis<0||axis>=axes||patch<0||patch>=32||dim<1||dim>384)throw new RangeError('Invalid token selection');
 return {axisName:names[axis],timeIndex:patch,points:Array.from({length:4},(_,i)=>patch*4+i),dimension:dim,masked:mode!=='inference'&&maskedIndices.includes(axis*32+patch),total:axes*32};
}
export function networkShapes({axes,mode,masked}){
 const total=axes*32,training=mode!=='inference',visible=training?total-masked:total;
 const shape=(label,shape,step,note)=>({label,shape,step,note});
 return {total,visible,training,shapes:[
  shape('输入窗口',`[B, ${axes}, 128]`,0,'每轴128点'),
  shape('一维卷积 + 位置',`[B, ${total}, 384]`,0,'每轴32个Token'),
  shape('编码器输入',`[B, ${visible}, 384]`,1,training?'仅可见Token':'全部Token'),
  shape('编码器输出',`[B, ${visible}, 384]`,2,'12层 · 384维'),
  training?shape('恢复 + 解码',`[B, ${total}, 192]`,3,'4层 · 192维；形状推导'):shape('逐维平均池化','[B, 384]',3,'沿Token维求平均'),
  training?shape('重建片段',`[B, ${total}, 4]`,4,'形状推导 · 仅遮挡处计算损失'):shape('七类线性头','[B, 7]',4,'七类仅为用户研究示例')
 ]};
}
