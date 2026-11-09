import assert from 'node:assert/strict';
import {makeNeuralView, getNeuralModel, renderNeuralDiagram} from '../neural-flow.mjs';

const saved={set:global.setInterval,clear:global.clearInterval,doc:global.document,match:global.matchMedia};
let timer=null,delay=0,visibility,docHidden=false;
global.setInterval=(fn,ms)=>(timer=fn,delay=ms,42);global.clearInterval=()=>{timer=null};
global.document={get hidden(){return docHidden},addEventListener(n,fn){if(n==='visibilitychange')visibility=fn},removeEventListener(n){if(n==='visibilitychange')visibility=null}};
function mount(options={}) {
 const events={},updates=[],svgs=[{pauseAnimations(){},unpauseAnimations(){}}];
 const root={innerHTML:'',contains:()=>true,querySelectorAll:()=>svgs,querySelector:()=>null,addEventListener:(n,fn)=>{events[n]=fn},removeEventListener:n=>{delete events[n]}};
 const view=makeNeuralView(root,{...options,onChange:x=>updates.push(x)});
 const press=(key,value)=>events.click({target:{closest:()=>({dataset:{['nn'+key[0].toUpperCase()+key.slice(1)]:value},hasAttribute:k=>k==='data-nn-'+key})}});
 return {view,root,updates,press,events};
}
try {
 const x=mount();x.view.setVisible(true);assert.equal(typeof timer,'function');
 x.press('step','2');assert.equal(timer,null);assert.equal(x.updates.at(-1).stageId,'project');assert.equal(x.updates.at(-1).playing,false);
 x.press('scan');assert.equal(delay,1000);assert.equal(x.updates.at(-1).col,0);
 for(let i=1;i<32;i++){timer();assert.equal(x.updates.at(-1).col,i)}
 timer();assert.equal(timer,null);assert.match(x.root.innerHTML,/已暂停/);
 x.press('token','191');assert.equal(x.updates.at(-1).row,5);assert.equal(x.updates.at(-1).col,31);
 x.press('axes','3');assert.equal(x.updates.at(-1).row,2);assert.equal((x.root.innerHTML.match(/data-nn-token=/g)||[]).length,96);
 x.press('mode','pretrain');x.press('mask','channel');assert.equal(x.updates.at(-1).maskMode,'channel');
 x.press('step','6');assert.equal(x.updates.at(-1).stageId,'attention');
 const step=x.updates.at(-1).step;x.view.update({axes:3,mode:'pretrain',row:2,col:1,maskMode:'channel'});assert.equal(step,6);assert.match(x.root.innerHTML,/缩放点积注意力/);
 x.press('play');assert.equal(typeof timer,'function');docHidden=true;visibility();assert.equal(timer,null);docHidden=false;visibility();assert.equal(typeof timer,'function');
 x.view.setVisible(false);assert.equal(timer,null);x.view.setVisible(true);assert.equal(typeof timer,'function');
 x.press('speed','1.6');assert.equal(delay,5200/1.6);x.view.destroy();assert.equal(timer,null);assert.equal(visibility,null);assert.equal(Object.keys(x.events).length,0);
 global.matchMedia=()=>({matches:true});const y=mount();y.view.setVisible(true);assert.equal(timer,null);assert.match(y.root.innerHTML,/▷ 播放计算流程/);y.press('play');assert.equal(typeof timer,'function');y.view.destroy();
 for(const mode of ['inference','pretrain'])for(const axes of [3,6]){
  const base=getNeuralModel({mode,axes});
  for(let i=0;i<base.stages.length;i++)assert.match(renderNeuralDiagram({...base,step:i}),/<svg/);
 }
 console.log('Neural controls, complete patch scanning, visibility, reduced-motion and branch renders passed');
} finally {global.setInterval=saved.set;global.clearInterval=saved.clear;global.document=saved.doc;global.matchMedia=saved.match}
