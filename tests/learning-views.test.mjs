import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const failures=[];
async function test(name,fn){try{await fn();console.log('PASS',name)}catch(error){failures.push(name);console.error('FAIL',name,error.message)}}

await test('brand returns to the title page',()=>{
 assert.match(html,/<a class="brand" href="#cover"/);
 assert.match(html,/<span>TransfHAR<\/span><a class="evidence-link" href="https:\/\/arxiv\.org\/abs\/2608\.15861"/);
});
await test('clicking the brand reopens the cover even when already selected',()=>{
 let click,section=null,prevented=false;
 const document={addEventListener:(event,fn)=>{if(event==='click')click=fn}};
 const line=app.split('\n').find(x=>x.startsWith("document.addEventListener('click'"));
 const ctx={document,go:i=>{section=i},showInline(){},syncPressed(){}};
 runInNewContext(line,ctx);
 click({preventDefault:()=>{prevented=true},target:{closest:s=>s==='.brand'?{}:null}});
 assert.equal(section,0);assert.equal(prevented,true);
});
await test('presenter notes have reading room and no timer controls',()=>{
 const at=app.indexOf('function speaker(l)');
 const fn=app.slice(at,app.indexOf('\n',at));
 const ctx={h:String,fmt:String,timerOn:false,timerFormat:()=> '00:00'};runInNewContext(fn+'\nthis.speaker=speaker;',ctx);
 const out=ctx.speaker({speaker:{headline:'测试',minutes:2,points:['要点'],notes:'正文',demoCue:'提示'}});
 assert.match(out,/speaker-close/);assert.match(out,/正文/);assert.doesNotMatch(out,/timerToggle|timerReset|timerValue/);
});
await test('all source pages have page-specific Chinese reading text',async()=>{
 const file=new URL('../paper-zh.mjs',import.meta.url);
 assert.ok(existsSync(file),'missing Chinese page translations');
 const {paperTranslations}=await import(file);
 for(let p=1;p<=16;p++){
   const entry=paperTranslations[String(p)];
   assert.ok(entry && entry.title && entry.paragraphs?.length,`missing page ${p}`);
   assert.ok(entry.paragraphs.every(x=>typeof x==='string' && x.length>10));
 }
 assert.match(JSON.stringify(paperTranslations['5']),/384/);
 assert.match(JSON.stringify(paperTranslations['9']),/86\.7/);
});
await test('translation follows the selected page and hides for a figure',async()=>{
 const {getPaperTranslation}=await import('../paper-zh.mjs');
 const nodes={},cls=()=>({values:new Set(),toggle(k,v){v?this.values.add(k):this.values.delete(k)},remove(k){this.values.delete(k)}});
 for(const id of ['inlinePaperImage','inlinePaper','inlinePageSelect','inlineScroll','inlineCaption','inlineFigureTab','inlinePageTab','paperTranslation','translationToggle','inlinePaperGrid','stagePaper'])
   nodes['#'+id]={classList:cls(),style:{},dataset:{},setAttribute(k,v){this[k]=v},scrollIntoView(){}};
 nodes['#inlineScroll'].dataset.mode='page';nodes['#inlinePageSelect'].value='5';nodes['#stagePaper'].hidden=false;
 const body={classList:cls()},document={body,querySelector:s=>nodes[s]};
 const start=app.indexOf('const $=');const end=app.indexOf('\nconst figBtn=');
 const ctx={document,getPaperTranslation,REDUCE_MOTION:false,setStage(){}};
 runInNewContext(app.slice(start,end)+"\nthis.setTranslation=v=>{translationOpen=v;syncTranslation()};this.show=showInline;",ctx);
 ctx.setTranslation(true);
 assert.equal(nodes['#paperTranslation'].hidden,false);assert.match(nodes['#paperTranslation'].innerHTML,/384/);
 assert.equal(nodes['#translationToggle']['aria-pressed'],'true');
 ctx.show('page',6,false);assert.match(nodes['#paperTranslation'].innerHTML,/设备端/);
 ctx.show('figure','fig4',false);assert.equal(nodes['#paperTranslation'].hidden,true);assert.equal(nodes['#translationToggle'].hidden,true);
 ctx.show('page',9,false);assert.equal(nodes['#paperTranslation'].hidden,false);assert.match(nodes['#paperTranslation'].innerHTML,/86\.7/);
});
await test('explanatory neural storyboard distinguishes training and inference',async()=>{
 const file=new URL('../neural-flow.mjs',import.meta.url);
 assert.ok(existsSync(file),'missing animated neural network module');
 const {getNeuralModel,renderNeuralDiagram}=await import(file);
 const train=getNeuralModel({axes:3,mode:'pretrain',step:3});
 const inference=getNeuralModel({axes:6,mode:'inference',step:3});
 assert.equal(train.tokenCount,96);assert.equal(inference.tokenCount,192);
 assert.match(train.description,/解码|遮挡/);assert.match(inference.description,/池化/);
 const svg=renderNeuralDiagram(inference);
 assert.match(svg,/<svg/);assert.match(svg,/animateMotion/);assert.match(svg,/12 层/);
 assert.match(svg,/384/);assert.match(svg,/示意/);
 const masked=renderNeuralDiagram(train);
 assert.equal((masked.match(/data-nn-masked/g)||[]).length,4);
 assert.equal((svg.match(/data-nn-masked/g)||[]).length,0);
});
await test('neural storyboard controls change state and stop playback when hidden',async()=>{
 const {makeNeuralView}=await import('../neural-flow.mjs');
 const updates=[];let handler,paused=0,unpaused=0;
 const svg={pauseAnimations(){paused++},unpauseAnimations(){unpaused++}};
 const root={innerHTML:'',querySelector:s=>s==='svg'?svg:null,contains:()=>true,addEventListener:(name,fn)=>{handler=fn},removeEventListener:()=>{handler=null}};
 const view=makeNeuralView(root,{axes:6,mode:'inference',onChange:v=>updates.push(v)});
 view.setVisible(true);assert.ok(unpaused>0);
 const press=(attr,value)=>handler({target:{closest:()=>({dataset:{['nn'+attr[0].toUpperCase()+attr.slice(1)]:value},hasAttribute:n=>n==='data-nn-'+attr})}});
 press('mode','pretrain');assert.equal(updates.at(-1).mode,'pretrain');assert.match(root.innerHTML,/插回 · 解码/);
 press('axes','3');assert.equal(updates.at(-1).axes,3);assert.match(root.innerHTML,/96 token/);
 press('step','3');assert.match(root.innerHTML,/192 维解码器/);
 view.setVisible(false);assert.ok(paused>0);view.destroy();assert.equal(handler,null);
});
await test('playing storyboard advances through the teaching steps and stops offscreen',async()=>{
 const {makeNeuralView}=await import('../neural-flow.mjs');
 const realSet=global.setInterval,realClear=global.clearInterval;let tick=null,cleared=false;
 global.setInterval=fn=>{tick=fn;return 42};global.clearInterval=()=>{cleared=true;tick=null};
 try{
  const updates=[],svg={pauseAnimations(){},unpauseAnimations(){}};
  const root={innerHTML:'',querySelector:()=>svg,contains:()=>true,addEventListener(){},removeEventListener(){}};
  const view=makeNeuralView(root,{mode:'inference',onChange:x=>updates.push(x)});
  view.setVisible(true);assert.equal(typeof tick,'function');tick();assert.equal(updates.at(-1).step,1);
  view.setVisible(false);assert.equal(cleared,true);assert.equal(tick,null);view.destroy();
 }finally{global.setInterval=realSet;global.clearInterval=realClear}
});
await test('keyboard focus is retained when storyboard controls redraw',async()=>{
 const {makeNeuralView}=await import('../neural-flow.mjs');
 const prevDocument=global.document;let handler,focused='';
 const old={dataset:{nnMode:'pretrain'},hasAttribute:n=>n==='data-nn-mode'};
 global.document={activeElement:old};
 try{
  const svg={pauseAnimations(){},unpauseAnimations(){}};
  const root={innerHTML:'',contains:()=>true,querySelector:s=>s==='svg'?svg:{focus(){focused=s}},addEventListener:(n,fn)=>{handler=fn},removeEventListener(){}};
  const view=makeNeuralView(root,{onChange(){}});
  focused='';
  handler({target:{closest:()=>old}});
  assert.equal(focused,'[data-nn-mode="pretrain"]');view.destroy();
 }finally{global.document=prevDocument}
});
await test('automatic animation preserves keyboard focus during a step change',async()=>{
 const {makeNeuralView}=await import('../neural-flow.mjs');
 const savedDocument=global.document,savedSet=global.setInterval,savedClear=global.clearInterval;
 let tick,focused='';const active={dataset:{nnMode:'inference'},hasAttribute:n=>n==='data-nn-mode'};
 global.document={activeElement:active};global.setInterval=fn=>(tick=fn,42);global.clearInterval=()=>{};
 try{
  const svg={pauseAnimations(){},unpauseAnimations(){}};
  const root={innerHTML:'',contains:()=>true,querySelector:s=>s==='svg'?svg:{focus(){focused=s}},addEventListener(){},removeEventListener(){}};
  const view=makeNeuralView(root,{onChange(){}});view.setVisible(true);focused='';tick();
  assert.equal(focused,'[data-nn-mode="inference"]');view.destroy();
 }finally{global.document=savedDocument;global.setInterval=savedSet;global.clearInterval=savedClear}
});
if(failures.length){console.error(`${failures.length} checks failed`);process.exit(1)}
console.log('Learning views checks passed');
