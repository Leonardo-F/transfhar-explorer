import * as THREE from './vendor/three.module.js';

// Zoom stays local to the drawing surface; scrolling elsewhere still scrolls the page.
function makeZoomController(canvas, apply, onZoom=()=>{}){
 let value=1, gestureStart=null, pinchStart=null;const touches=new Map();
 const set=next=>{value=Math.max(.65,Math.min(2.75,next));apply(value);onZoom(value)};
 const distance=()=>{const p=[...touches.values()];return p.length<2?0:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)};
 function wheel(e){e.preventDefault();if(gestureStart!==null&&e.ctrlKey)return;const dy=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?100:1);set(value*Math.exp(-Math.max(-300,Math.min(300,dy))*.0015))}
 function gestureBegin(e){e.preventDefault();gestureStart=value}
 function gestureMove(e){if(gestureStart===null)return;e.preventDefault();set(gestureStart*e.scale)}
 function gestureEnd(e){e.preventDefault();gestureStart=null}
 function touchDown(e){if(e.pointerType!=='touch')return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size===2){const d=distance();pinchStart=d?{distance:d,zoom:value}:null}}
 function touchMove(e){if(e.pointerType!=='touch'||!touches.has(e.pointerId))return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});if(touches.size>=2&&pinchStart){e.preventDefault();set(pinchStart.zoom*distance()/pinchStart.distance)}}
 function touchEnd(e){if(e.pointerType!=='touch')return;touches.delete(e.pointerId);if(touches.size<2)pinchStart=null}
 canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('gesturestart',gestureBegin,{passive:false});canvas.addEventListener('gesturechange',gestureMove,{passive:false});canvas.addEventListener('gestureend',gestureEnd,{passive:false});canvas.addEventListener('pointerdown',touchDown);canvas.addEventListener('pointermove',touchMove);canvas.addEventListener('pointerup',touchEnd);canvas.addEventListener('pointercancel',touchEnd);
 return {in(){set(value*1.2)},out(){set(value/1.2)},reset(){set(1)},isPinching(){return touches.size>=2},destroy(){canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('gesturestart',gestureBegin);canvas.removeEventListener('gesturechange',gestureMove);canvas.removeEventListener('gestureend',gestureEnd);canvas.removeEventListener('pointerdown',touchDown);canvas.removeEventListener('pointermove',touchMove);canvas.removeEventListener('pointerup',touchEnd);canvas.removeEventListener('pointercancel',touchEnd);touches.clear()}};
}

// Shapes are a teaching schematic, not trained weights, attention scores, or IMU data.
export function makeThreeView(originalCanvas, onInfo, onZoom=()=>{}){
 let canvas=originalCanvas,renderer,scene,camera,root,frame,ctx,drag=false,moved=false,lastX=0,lastY=0,yaw=.35,pitch=-.25,pickables=[],hits=[];
 let state={axes:6,mode:'random',stage:'mask',spread:1,phase:'masked',focusStep:0,row:0,col:0};
 let tokenGeometry,layerGeometry,decoderGeometry,latentGeometry,headGeometry,classGeometry,materials={},axisMaterials=[],sharedEdges=[],flowGeometries=[],raycaster,mouse;
 const axisColors=[0xe69d75,0xe6c574,0xdb9c83,0x71bdb0,0xa4cfc1,0x8bb9a5],axisCSS=['#e69d75','#e6c574','#db9c83','#71bdb0','#a4cfc1','#8bb9a5'];
 const hash=n=>{let x=Math.imul(n+1,2654435761);x=Math.imul(x^(x>>>16),2246822519);x=Math.imul(x^(x>>>13),3266489917);return (x^(x>>>16))>>>0};
 function maskData(){
  const {axes,mode,stage}=state,total=axes*32;
  if(mode==='inference')return {hidden:new Set(),total};
  const ranked=Array.from({length:total},(_,i)=>i).sort((a,b)=>hash(a)-hash(b));
  const columns=new Set(Array.from({length:32},(_,i)=>i).sort((a,b)=>hash(a+21)-hash(b+21)).slice(0,21));
  const rows=new Set(Array.from({length:axes},(_,i)=>i).sort((a,b)=>hash(a+400)-hash(b+400)).slice(0,Math.round(axes*.65)));
  const random=new Set(ranked.slice(0,Math.round(total*.65))),hidden=new Set();
  for(let r=0;r<axes;r++)for(let c=0;c<32;c++)if(mode==='random'?random.has(r*32+c):mode==='time'?columns.has(c):rows.has(r))hidden.add(r*32+c);
  return {hidden,total};
 }
 function info(fallback=false){const {hidden,total}=maskData();let col=Math.max(0,Math.min(31,state.col)),row=Math.max(0,Math.min(state.axes-1,state.row));onInfo({axes:state.axes,total,maskedIndices:[...hidden],masked:hidden.size,percent:Math.round(hidden.size/total*1000)/10,mode:state.mode,stage:state.stage,phase:state.phase,focusStep:state.focusStep,row,col,isMasked:hidden.has(row*32+col),start:col*4,end:col*4+3,t0:(col*4/50).toFixed(2),t1:((col*4+4)/50).toFixed(2),fallback});}
 try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});}
 catch(error){return makeFallback()}
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0x000000,0);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.1,100);camera.position.set(0,1.3,20);camera.lookAt(new THREE.Vector3(0,0,0));root=new THREE.Group();root.rotation.set(-.26,.38,.02);scene.add(root);
 materials={visible:new THREE.MeshBasicMaterial({color:0xbce87e}),masked:new THREE.MeshBasicMaterial({color:0xd4d0c2,transparent:true,opacity:.32}),restore:new THREE.MeshBasicMaterial({color:0x8fc3dd}),loss:new THREE.MeshBasicMaterial({color:0xe69a5d}),selected:new THREE.MeshBasicMaterial({color:0xce6e4b}),layer:new THREE.MeshBasicMaterial({color:0xa3cab8,transparent:true,opacity:.9}),decoder:new THREE.MeshBasicMaterial({color:0x91c8d9,transparent:true,opacity:.9}),head:new THREE.MeshBasicMaterial({color:0xe4aa85}),edge:new THREE.LineBasicMaterial({color:0x5f9480,transparent:true,opacity:.65})};
 axisMaterials=axisColors.map(color=>new THREE.MeshBasicMaterial({color,transparent:true}));materials.visible.transparent=true;materials.head.transparent=true;
 raycaster=new THREE.Raycaster();mouse=new THREE.Vector2();tokenGeometry=new THREE.BoxGeometry(.105,.21,.14);layerGeometry=new THREE.BoxGeometry(1.65,.11,1.4);decoderGeometry=new THREE.BoxGeometry(1.35,.14,1.2);latentGeometry=new THREE.BoxGeometry(.8,.07,.25);headGeometry=new THREE.BoxGeometry(.43,1.25,.4);classGeometry=new THREE.BoxGeometry(.36,.08,.2);const layerEdge=new THREE.EdgesGeometry(layerGeometry),decoderEdge=new THREE.EdgesGeometry(decoderGeometry);sharedEdges=[layerEdge,decoderEdge];
 function rebuild(){
  while(root.children.length)root.remove(root.children[0]);flowGeometries.forEach(g=>g.dispose());flowGeometries=[];pickables=[];const {hidden}=maskData();const step=state.focusStep;
  axisMaterials.forEach(m=>m.opacity=step<=1?1:.32);materials.layer.opacity=step===2?1:.30;materials.decoder.opacity=step>=3?.95:.30;materials.visible.opacity=(state.mode==='inference'&&step>=3)?1:.38;materials.head.opacity=step===4?1:.35;
  for(let r=0;r<state.axes;r++)for(let c=0;c<32;c++){
   const isMask=state.mode!=='inference'&&state.focusStep>=1&&hidden.has(r*32+c),isSelected=r===state.row&&c===state.col;
   const mat=isSelected?materials.selected:isMask?(state.phase==='loss'?materials.loss:state.phase==='restore'?materials.restore:materials.masked):axisMaterials[r];
   const mesh=new THREE.Mesh(tokenGeometry,mat);mesh.position.set(-4.35+c*.12,(state.axes-1)*.17-r*.34,0);mesh.userData={row:r,col:c};root.add(mesh);pickables.push(mesh);
  }
  if(state.stage==='encoder'){for(let i=0;i<4;i++){const g=new THREE.Geometry();g.vertices.push(new THREE.Vector3(-.57,-.55+i*.35,0),new THREE.Vector3(-.10,-.48+i*.3,0));flowGeometries.push(g);root.add(new THREE.Line(g,materials.edge))}}
  const gap=.15+.07*Number(state.spread);
  for(let i=0;i<12;i++){const y=(i-5.5)*gap,layer=new THREE.Mesh(layerGeometry,materials.layer);layer.position.set(.72,y,0);root.add(layer);const edge=new THREE.LineSegments(layerEdge,materials.edge);edge.position.copy(layer.position);root.add(edge)}
  if(state.mode==='inference'){for(let i=0;i<16;i++){const v=new THREE.Mesh(latentGeometry,materials.visible);v.position.set(2.75,(i-7.5)*.11,0);root.add(v)}const head=new THREE.Mesh(headGeometry,materials.head);head.position.set(3.85,0,0);root.add(head);for(let i=0;i<7;i++){const output=new THREE.Mesh(classGeometry,materials.visible);output.position.set(4.55,(i-3)*.14,0);root.add(output)}}
  if(state.mode!=='inference')for(let i=0;i<4;i++){const mesh=new THREE.Mesh(decoderGeometry,materials.decoder);mesh.position.set(3.05,(i-1.5)*.31,0);root.add(mesh);const edge=new THREE.LineSegments(decoderEdge,materials.edge);edge.position.copy(mesh.position);root.add(edge)}
  info(false);
 }
 function resize(){const r=canvas.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(.1,r.width/r.height);camera.updateProjectionMatrix()}
 function animate(){frame=requestAnimationFrame(animate);if(!document.hidden&&canvas.offsetParent!==null)renderer.render(scene,camera)}
 const zoomControl=makeZoomController(canvas,z=>{camera.zoom=z;camera.updateProjectionMatrix()},onZoom);
 function down(e){if(zoomControl.isPinching()){drag=false;moved=true;return}drag=true;moved=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)}
 function move(e){if(!drag||zoomControl.isPinching())return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;root.rotation.y+=dx*.008;root.rotation.x=Math.max(-1,Math.min(1,root.rotation.x+dy*.008));lastX=e.clientX;lastY=e.clientY}
 function up(e){if(drag&&!moved){const r=canvas.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);raycaster.setFromCamera(mouse,camera);const hit=raycaster.intersectObjects(pickables,false)[0];if(hit){state.row=hit.object.userData.row;state.col=hit.object.userData.col;rebuild()}}drag=false}
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);window.addEventListener('resize',resize);rebuild();resize();animate();
 return {update(config){Object.assign(state,config);state.row=Math.min(state.row,state.axes-1);rebuild()},resize,zoomIn(){zoomControl.in()},zoomOut(){zoomControl.out()},resetView(){root.rotation.set(-.26,.38,.02);zoomControl.reset()},destroy(){zoomControl.destroy();cancelAnimationFrame(frame);window.removeEventListener('resize',resize);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);tokenGeometry.dispose();layerGeometry.dispose();decoderGeometry.dispose();latentGeometry.dispose();headGeometry.dispose();classGeometry.dispose();flowGeometries.forEach(g=>g.dispose());sharedEdges.forEach(g=>g.dispose());Object.values(materials).forEach(m=>m.dispose());axisMaterials.forEach(m=>m.dispose());renderer.dispose()}};
 function makeFallback(){
  canvas=originalCanvas.cloneNode(false);originalCanvas.replaceWith(canvas);ctx=canvas.getContext('2d');if(!ctx){onInfo({failed:true});return {update(){},resize(){},zoomIn(){},zoomOut(){},resetView(){},destroy(){}}}
  let zoom=1;const zoomControl=makeZoomController(canvas,z=>{zoom=z;draw()},onZoom);
  function project(x,y,z,w,h){const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),a=x*cy+z*sy,c=-x*sy+z*cy,b=y*cp-c*sp,scale=Math.min(w/10,h/5)*zoom;return [w*.48+a*scale,h*.50-b*scale]}
  function poly(points,color,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}}
  function draw(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(10,r.width),h=Math.max(10,r.height);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);hits=[];const {hidden}=maskData();const step=state.focusStep;ctx.globalAlpha=step<=1?1:.35;
   for(let row=0;row<state.axes;row++)for(let col=0;col<32;col++){const isMask=state.mode!=='inference'&&state.focusStep>=1&&hidden.has(row*32+col),isSelected=row===state.row&&col===state.col,x=-4.35+col*.12,y=(state.axes-1)*.16-row*.32,points=[[x,y,0],[x+.1,y,0],[x+.1,y+.2,0],[x,y+.2,0]].map(q=>project(...q,w,h));const color=isSelected?'#ce6e4b':isMask?(state.phase==='loss'?'#e69a5d':state.phase==='restore'?'#9abed0':'#dddacf'):axisCSS[row];poly(points,color,isSelected?'#a95438':null);hits.push({row,col,points})}
   ctx.globalAlpha=step===2?1:.3;if(state.stage==='encoder'){ctx.strokeStyle='#7ca38f';ctx.lineWidth=1;for(let i=0;i<4;i++){const a=project(-.57,-.55+i*.35,0,w,h),b=project(-.1,-.48+i*.3,0,w,h);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke()}}
   const gap=.15+.07*Number(state.spread);for(let i=0;i<12;i++){let y=(i-5.5)*gap;poly([[-.1,y,-.45],[1.55,y,-.45],[1.55,y,.45],[-.1,y,.45]].map(q=>project(...q,w,h)),'#a3cab8','#76a791')}
   if(state.mode==='inference'){ctx.globalAlpha=step===3?1:.3;for(let i=0;i<16;i++){let y=(i-7.5)*.11;poly([[2.35,y,0],[3.15,y,0],[3.15,y+.06,0],[2.35,y+.06,0]].map(q=>project(...q,w,h)),'#bce87e')}ctx.globalAlpha=step===4?1:.3;poly([[3.6,-.65,0],[4.05,-.65,0],[4.05,.65,0],[3.6,.65,0]].map(q=>project(...q,w,h)),'#e4aa85','#d58d6c');for(let i=0;i<7;i++){let y=(i-3)*.14;poly([[4.3,y,0],[4.65,y,0],[4.65,y+.08,0],[4.3,y+.08,0]].map(q=>project(...q,w,h)),'#bce87e')}}
   ctx.globalAlpha=step>=3?1:.3;if(state.mode!=='inference')for(let i=0;i<4;i++){let y=(i-1.5)*.31;poly([[2.4,y,-.35],[3.75,y,-.35],[3.75,y,.35],[2.4,y,.35]].map(q=>project(...q,w,h)),'#91c8d9','#cbe5ee')}
   ctx.globalAlpha=1;info(true);
  }
  function down(e){if(zoomControl.isPinching()){drag=false;moved=true;return}drag=true;moved=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)}
  function move(e){if(!drag||zoomControl.isPinching())return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;yaw+=dx*.008;pitch=Math.max(-1,Math.min(1,pitch+dy*.008));lastX=e.clientX;lastY=e.clientY;draw()}
  function up(e){if(drag&&!moved){const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;for(let k=hits.length-1;k>=0;k--){const q=hits[k];let inside=false;for(let i=0,j=q.points.length-1;i<q.points.length;j=i++){const a=q.points[i],b=q.points[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))inside=!inside}if(inside){state.row=q.row;state.col=q.col;draw();break}}}drag=false}
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);window.addEventListener('resize',draw);draw();
  return {update(config){Object.assign(state,config);state.row=Math.min(state.row,state.axes-1);draw()},resize:draw,zoomIn(){zoomControl.in()},zoomOut(){zoomControl.out()},resetView(){yaw=.35;pitch=-.25;zoomControl.reset()},destroy(){zoomControl.destroy();window.removeEventListener('resize',draw);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up)}};
 }
}

// Symbolic tokenization / positional-encoding diagram: no measured values or trained weights.
export function makeTokenView(originalCanvas,onZoom=()=>{}){
 let canvas=originalCanvas,renderer,scene,camera,root,frame,ctx,drag=false,moved=false,lastX=0,lastY=0,yaw=.18,pitch=-.16;
 let state={step:0,axis:0,patch:0,dim:1,masked:false,mode:'inference'};
 const palette={input:0xe49e76,kernel:0xeab38d,token:0x81b9a2,time:0xe8c46e,axis:0x8dbdb4,result:0x4d8c70,masked:0xc8c9bd,chosen:0xc45d40,encoder:0x97c4b1,line:0x9eaa99};
 let materials={},unit,lineMaterial,lineGeometries=[];
 function layout(){
  const blocks=[],links=[],selected=Math.min(23,Math.floor((state.dim-1)/16));
  const add=(x,y,w,h,color,selectedFlag=false)=>blocks.push({x,y,w,h,color:selectedFlag?'chosen':color});
  const stack=(x,y,color,spacing=.12)=>{for(let i=0;i<24;i++)add(x,y+(i-11.5)*spacing,.64,spacing*.72,color,i===selected)};
  if(state.step===0){for(let k=0;k<4;k++)add(-2.25+k*1.5,0,.95,1.45,'input');return {blocks,links}}
  for(let k=0;k<4;k++)add(-4.2+k*.48,0,.35,.9,'input');
  add(-1.9,0,.8,1.65,'kernel');links.push([-2.65,-2.38]);
  if(state.step===1){add(.1,0,.9,.22,'chosen');links.push([-1.45,-.42]);return {blocks,links}}
  stack(-.6,0,'token');links.push([-1.45,-1.0]);
  if(state.step>=3){stack(.9,1.08,'time',.073);stack(.9,-1.08,'axis',.073);add(1.42,1.75-state.patch/31*1.34,.16,.16,'chosen');add(1.42,-.42-state.axis/5*1.34,.16,.16,'chosen');links.push([-.18,.4])}
  if(state.step>=4){stack(2.5,0,'result');links.push([1.48,2.1])}
  if(state.step>=5){const blocked=state.mode!=='inference'&&state.masked;add(4.05,0,.9,1.85,blocked?'masked':'encoder');if(!blocked)links.push([2.91,3.58])}
  return {blocks,links};
 }
 try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true})}catch(error){return fallback()}
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0x000000,0);
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.1,100);camera.position.set(0,.4,15.8);camera.lookAt(new THREE.Vector3(0,0,0));root=new THREE.Group();root.rotation.set(-.18,.24,.01);scene.add(root);
 unit=new THREE.BoxGeometry(1,1,1);for(const [k,color] of Object.entries(palette))materials[k]=new THREE.MeshBasicMaterial({color});lineMaterial=new THREE.LineBasicMaterial({color:palette.line,transparent:true,opacity:.85});
 function draw(){while(root.children.length)root.remove(root.children[0]);lineGeometries.forEach(x=>x.dispose());lineGeometries=[];materials.input.color.setHex([0xe69d75,0xe6c574,0xdb9c83,0x71bdb0,0xa4cfc1,0x8bb9a5][state.axis]);const {blocks,links}=layout();for(const b of blocks){const mesh=new THREE.Mesh(unit,materials[b.color]);mesh.position.set(b.x,b.y,0);mesh.scale.set(b.w,b.h,.2);root.add(mesh)}for(const [a,b] of links){const g=new THREE.Geometry();g.vertices.push(new THREE.Vector3(a,0,0),new THREE.Vector3(b,0,0));lineGeometries.push(g);root.add(new THREE.Line(g,lineMaterial))}}
 function resize(){const r=canvas.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(.1,r.width/r.height);camera.updateProjectionMatrix()}
 function animate(){frame=requestAnimationFrame(animate);if(!document.hidden&&canvas.offsetParent!==null)renderer.render(scene,camera)}
 const zoomControl=makeZoomController(canvas,z=>{camera.zoom=z;camera.updateProjectionMatrix()},onZoom);
 function down(e){if(zoomControl.isPinching()){drag=false;moved=true;return}drag=true;moved=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)}
 function move(e){if(!drag||zoomControl.isPinching())return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;root.rotation.y+=dx*.008;root.rotation.x=Math.max(-1,Math.min(1,root.rotation.x+dy*.008));lastX=e.clientX;lastY=e.clientY}
 function up(){drag=false}
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);window.addEventListener('resize',resize);draw();resize();animate();
 return {update(config){Object.assign(state,config);draw()},resize,zoomIn(){zoomControl.in()},zoomOut(){zoomControl.out()},resetView(){root.rotation.set(-.18,.24,.01);zoomControl.reset()},destroy(){zoomControl.destroy();cancelAnimationFrame(frame);window.removeEventListener('resize',resize);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);lineGeometries.forEach(x=>x.dispose());unit.dispose();lineMaterial.dispose();Object.values(materials).forEach(x=>x.dispose());renderer.dispose()}};
 function fallback(){
  canvas=originalCanvas.cloneNode(false);originalCanvas.replaceWith(canvas);ctx=canvas.getContext('2d');if(!ctx)return {fallback:true,update(){},resize(){},zoomIn(){},zoomOut(){},resetView(){},destroy(){}};
  let zoom=1;const zoomControl=makeZoomController(canvas,z=>{zoom=z;draw2d()},onZoom);
  const colors={input:'#e49e76',kernel:'#eab38d',token:'#81b9a2',time:'#e8c46e',axis:'#8dbdb4',result:'#4d8c70',masked:'#c8c9bd',chosen:'#c45d40',encoder:'#97c4b1',line:'#9eaa99'};
  function draw2d(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(10,r.width),h=Math.max(10,r.height);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);colors.input=['#e69d75','#e6c574','#db9c83','#71bdb0','#a4cfc1','#8bb9a5'][state.axis];const {blocks,links}=layout(),scale=Math.min(w/10.5,h/5)*zoom,cx=w*.52,cy=h*.52;for(const [a,b] of links){ctx.strokeStyle=colors.line;ctx.beginPath();ctx.moveTo(cx+a*scale,cy);ctx.lineTo(cx+b*scale,cy);ctx.stroke()}for(const q of blocks){ctx.fillStyle=colors[q.color];ctx.fillRect(cx+(q.x-q.w/2)*scale,cy-(q.y+q.h/2)*scale,q.w*scale,q.h*scale)}}
  window.addEventListener('resize',draw2d);draw2d();return {fallback:true,update(config){Object.assign(state,config);draw2d()},resize:draw2d,zoomIn(){zoomControl.in()},zoomOut(){zoomControl.out()},resetView(){zoomControl.reset()},destroy(){zoomControl.destroy();window.removeEventListener('resize',draw2d)}};
 }
}
