import assert from 'node:assert/strict';
import {getArchitectureModel, patchProjection, positionExample, attentionExample, ffnExample, poolingExample, reconstructionExample} from '../src/js/neural-model.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
for(const axes of [3,6]) for(const mode of ['pretrain','inference']) {
  const m=getArchitectureModel({axes,mode,row:axes-1,col:31});
  assert.equal(m.tokenCount,axes*32);assert.equal(m.selected,axes*32-1);
  assert.equal(m.visibleIndices.length+m.maskedIndices.length,m.tokenCount);
  assert.equal(m.stages.some(s=>s.id==='decoder'),mode==='pretrain');
  assert.equal(m.stages.some(s=>s.id==='pool'),mode==='inference');
  assert.equal(m.encoderHeads* m.headDim,384);assert.equal(m.ffnDim,1536);
}
const m=getArchitectureModel({axes:6,mode:'inference',row:4,col:31,dim:384});
const patch=patchProjection(m),pos=positionExample(m);
assert.deepEqual(patch.indices,[124,125,126,127]);assert.equal(patch.vector.length,384);
close(patch.vector[383],patch.values.reduce((s,x,k)=>s+x*patch.weights[383][k],patch.bias[383]));
assert.deepEqual(patch.weights,patchProjection({...m,row:0,col:0}).weights);
for(let d=0;d<384;d++) close(pos.vector[d],patch.vector[d]+pos.time[d]+pos.axis[d]);
for(const mode of ['inference','random','time','channel']) {
  const x=getArchitectureModel({axes:6,mode:mode==='inference'?mode:'pretrain',maskMode:mode});
  const row=Math.floor(x.visibleIndices[0]/32),col=x.visibleIndices[0]%32;
  const a=attentionExample({...x,row,col});
  assert.equal(a.q.length,64);assert.equal(a.output.length,64);assert.equal(a.entries.length,x.visibleIndices.length);
  assert.ok(a.entries.every(e=>!x.maskedIndices.includes(e.index)));
  close(a.entries.reduce((s,e)=>s+e.weight,0),1);
  close(a.output[0],a.entries.reduce((s,e)=>s+e.weight*e.v[0],0));
  if(x.maskedIndices.length){const i=x.maskedIndices[0];assert.equal(attentionExample({...x,row:Math.floor(i/32),col:i%32}).blocked,true)}
}
const f=ffnExample(m);assert.equal(f.hidden.length,1536);assert.equal(f.output.length,384);
for(let d=0;d<384;d++) close(f.output[d],f.input[d]+f.projected[d]);
const p=poolingExample(m);assert.equal(p.vector.length,384);assert.equal(p.logits.length,7);close(p.probabilities.reduce((s,x)=>s+x,0),1);
close(p.vector[0],p.tokens.reduce((s,t)=>s+t[0],0)/192);
const train=getArchitectureModel({mode:'pretrain'}),rec=reconstructionExample(train);
close(rec.mse,rec.rows.filter(r=>r.masked).reduce((s,r)=>s+r.squared.reduce((a,b)=>a+b,0),0)/(train.maskedIndices.length*4));
assert.equal(rec.rows.filter(r=>r.masked).length,train.maskedIndices.length);
const clamped=getArchitectureModel({axes:3,row:5,col:80,dim:900,head:9,block:-1,step:100});
assert.equal(clamped.row,2);assert.equal(clamped.col,31);assert.equal(clamped.dim,384);assert.equal(clamped.head,6);assert.equal(clamped.block,1);assert.equal(clamped.step,clamped.stages.length-1);
console.log('Neural architecture numerical checks passed');
