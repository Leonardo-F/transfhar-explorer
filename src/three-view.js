import * as THREE from '../vendor/three.min.module.js';
import {pipelineMask} from './pipeline-view.js';

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

// Frame a schematic so it fills the canvas instead of floating in empty space.
function fitCamera(camera,{minX,maxX,height,centerY=0,lift=.05,margin=1.18}){
 const t=Math.tan(camera.fov*Math.PI/360);
 const cx=(minX+maxX)/2;
 const d=Math.max(height/2/t,(maxX-minX)/2/(t*Math.max(.2,camera.aspect)))*margin;
 camera.position.set(cx,centerY+d*lift,d);
 camera.lookAt(new THREE.Vector3(cx,centerY,0));
 camera.updateProjectionMatrix();
}

// Polyline helpers for the flow particles.
function makePath(pts){let total=0;const cum=[0];for(let i=1;i<pts.length;i++){total+=pts[i].distanceTo(pts[i-1]);cum.push(total)}return {pts,cum,total}}
function pathPos(path,u){const d=Math.max(0,Math.min(1,u))*path.total;let i=1;while(i<path.cum.length&&path.cum[i]<d)i++;if(i>=path.pts.length)return path.pts[path.pts.length-1];const a=path.pts[i-1],b=path.pts[i],f=(d-path.cum[i-1])/((path.cum[i]-path.cum[i-1])||1);return a.clone().lerp(b,f)}

// Shapes are a teaching schematic, not trained weights, attention scores, or IMU data.
export function makeThreeView(originalCanvas, onInfo, onZoom=()=>{}){
 let canvas=originalCanvas,renderer,scene,camera,root,frame,ctx,drag=false,moved=false,lastX=0,lastY=0,pickables=[],hits=[];
 let state={axes:6,mode:'random',stage:'mask',spread:1,phase:'masked',focusStep:0,row:0,col:0};
 const REDUCE_MOTION=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 let tokenMeshes=[],tempGeos=[],particles=[],selectedRef=null,raycaster,mouse;
 const HOME={x:-.42,y:.62};
 const axisColors=[0xc98a5e,0xd9b380,0xc99a72,0x8aa9a0,0xa8bcb2,0x8aa9a0];
 function maskData(){const {axes,mode}=state;return {hidden:pipelineMask(axes,mode),total:axes*32};}
 function info(fallback=false){const {hidden,total}=maskData();let col=Math.max(0,Math.min(31,state.col)),row=Math.max(0,Math.min(state.axes-1,state.row));onInfo({axes:state.axes,total,maskedIndices:[...hidden],masked:hidden.size,percent:Math.round(hidden.size/total*1000)/10,mode:state.mode,stage:state.stage,phase:state.phase,focusStep:state.focusStep,row,col,isMasked:hidden.has(row*32+col),start:col*4,end:col*4+3,t0:(col*4/50).toFixed(2),t1:((col*4+4)/50).toFixed(2),fallback});}
 try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});}
 catch(error){return makeFallback()}
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setClearColor(0x000000,0);
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(35,1,.1,100);
 root=new THREE.Group();root.rotation.set(HOME.x,HOME.y,0);scene.add(root);
 raycaster=new THREE.Raycaster();mouse=new THREE.Vector2();
 // Shared geometries. Only classes exported by the bundled three.js build are used.
 const geo={
  token:new THREE.BoxGeometry(.07,1,.26),
  ghost:new THREE.BoxGeometry(.07,.16,.26),
  maskTok:new THREE.BoxGeometry(.05,.5,.22),
  lossBar:new THREE.BoxGeometry(.05,.55,.22),
  faint:new THREE.BoxGeometry(.05,.22,.22),
  panel:new THREE.BoxGeometry(.09,2.7,2.15),
  dec:new THREE.BoxGeometry(.09,1.7,1.5),
  pool:new THREE.BoxGeometry(.42,2.6,.42),
  head:new THREE.BoxGeometry(.1,2.3,.55),
  out:new THREE.BoxGeometry(.14,.3,.3),
  dot:new THREE.BoxGeometry(.075,.075,.075)
 };
 geo.panelEdge=new THREE.EdgesGeometry(geo.panel);geo.decEdge=new THREE.EdgesGeometry(geo.dec);
 geo.poolEdge=new THREE.EdgesGeometry(geo.pool);geo.headEdge=new THREE.EdgesGeometry(geo.head);
 geo.sel=new THREE.EdgesGeometry(new THREE.BoxGeometry(.11,1.08,.36));
 const mat={
  ghost:new THREE.MeshBasicMaterial({color:0x918b81,transparent:true,opacity:.34}),
  ghostEdge:new THREE.LineBasicMaterial({color:0xaca599,transparent:true,opacity:.5}),
  maskTok:new THREE.MeshBasicMaterial({color:0xd6b896,transparent:true,opacity:.85}),
  loss:new THREE.MeshBasicMaterial({color:0xe69a5d,transparent:true,opacity:.95}),
  lossEdge:new THREE.LineBasicMaterial({color:0xffb27d,transparent:true,opacity:.8}),
  panelEdge:new THREE.LineBasicMaterial({color:0xa89575,transparent:true,opacity:.5}),
  dec:new THREE.MeshBasicMaterial({color:0xc8a986,transparent:true,opacity:.14}),
  decEdge:new THREE.LineBasicMaterial({color:0xd6b896,transparent:true,opacity:.5}),
  seq:new THREE.MeshBasicMaterial({color:0xd8d9c2,transparent:true,opacity:.12}),
  pool:new THREE.MeshBasicMaterial({color:0xc9b088,transparent:true,opacity:.95}),
  poolEdge:new THREE.LineBasicMaterial({color:0xe4d7c1,transparent:true,opacity:.8}),
  head:new THREE.MeshBasicMaterial({color:0xd9a37e,transparent:true,opacity:.9}),
  out:new THREE.MeshBasicMaterial({color:0xd6b98c,transparent:true,opacity:.9}),
  flow:new THREE.LineBasicMaterial({color:0xb4a58b,transparent:true,opacity:.38}),
  flowDec:new THREE.LineBasicMaterial({color:0xd6b896,transparent:true,opacity:.42}),
  poolLine:new THREE.LineBasicMaterial({color:0xd3c3a7,transparent:true,opacity:.5}),
  headLine:new THREE.LineBasicMaterial({color:0xd9b48f,transparent:true,opacity:.55}),
  sel:new THREE.MeshBasicMaterial({color:0xe08a5e}),
  selEdge:new THREE.LineBasicMaterial({color:0xffd9c0}),
  groundA:new THREE.MeshBasicMaterial({color:0x4a4034,transparent:true,opacity:.9}),
  groundR:new THREE.MeshBasicMaterial({color:0x52452e,transparent:true,opacity:.7}),
  lane:new THREE.LineBasicMaterial({color:0x6c5d44,transparent:true,opacity:.55})
 };
 const axisA=axisColors.map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:1}));
 const axisR=axisColors.map(c=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.22}));
 const axisDot=axisColors.map(c=>new THREE.MeshBasicMaterial({color:c}));
 const panelMats=Array.from({length:12},()=>new THREE.MeshBasicMaterial({color:0xa89478,transparent:true,opacity:.14}));
 const attenMats=[0,1,2].map(()=>new THREE.LineBasicMaterial({color:0xe5dbcb,transparent:true,opacity:.3}));
 // Layout: zone A token grid (x -5.55..-3), zone C 12-layer encoder tunnel, then decoder/rebuild or pool/head.
 function colX(c){return -5.55+c*.083}
 function rowZ(r){return (r-(state.axes-1)/2)*.56}
 function encGap(){return .17+.07*Number(state.spread)}
 function xC(i){return -1.8+i*encGap()}
 function xD(i){return 2.15+i*.26}
 function xR(c){return 3.35+c*.062}
 function zR(r){return rowZ(r)*.85}
 function segGeo(pairs){const g=new THREE.Geometry();for(const [a,b] of pairs)g.vertices.push(new THREE.Vector3(a[0],a[1],a[2]),new THREE.Vector3(b[0],b[1],b[2]));return g}
 function pushBoxEdges(pairs,cx,cy,cz,w,h,d){const x=w/2,y=h/2,z=d/2,c=(sx,sy,sz)=>[cx+sx*x,cy+sy*y,cz+sz*z];
  pairs.push([c(-1,-1,-1),c(1,-1,-1)],[c(-1,1,-1),c(1,1,-1)],[c(-1,-1,1),c(1,-1,1)],[c(-1,1,1),c(1,1,1)]);
  pairs.push([c(-1,-1,-1),c(-1,1,-1)],[c(1,-1,-1),c(1,1,-1)],[c(-1,-1,1),c(-1,1,1)],[c(1,-1,1),c(1,1,1)]);
  pairs.push([c(-1,-1,-1),c(-1,-1,1)],[c(1,-1,-1),c(1,-1,1)],[c(-1,1,-1),c(-1,1,1)],[c(1,1,-1),c(1,1,1)]);
 }
 function extents(){return {minX:-5.85,maxX:state.mode==='inference'?4.15:5.5,height:4.1,centerY:1.25}}
 function fit(){fitCamera(camera,{...extents(),lift:.12,margin:1.24})}
 function rebuild(){
  while(root.children.length)root.remove(root.children[0]);
  tempGeos.forEach(g=>g.dispose());tempGeos=[];pickables=[];particles=[];selectedRef=null;tokenMeshes=[];
  const {hidden}=maskData(),step=state.focusStep,train=state.mode!=='inference',axes=state.axes;
  // ---- Zone A: input token volume (time x, channel z, bar height = 384-d schematic).
  const ground=new THREE.Mesh(new THREE.BoxGeometry(3.1,.05,(axes-1)*.56+.9),mat.groundA);
  ground.position.set(-4.27,-.05,0);root.add(ground);tempGeos.push(ground.geometry);
  // Lane separators etched into the ground plate, one per channel boundary.
  const lanePairs=[];
  for(let r=0;r<=axes;r++){
   const z=(r-axes/2)*.56;
   lanePairs.push([[colX(0)-.12,-.02,z],[colX(31)+.12,-.02,z]]);
  }
  const laneGeo=segGeo(lanePairs);root.add(new THREE.LineSegments(laneGeo,mat.lane));tempGeos.push(laneGeo);
  const ghostPairs=[];
  tokenMeshes=Array.from({length:axes},()=>Array.from({length:32}));
  for(let r=0;r<axes;r++)for(let c=0;c<32;c++){
   const idx=r*32+c,x=colX(c),z=rowZ(r);
   const isMask=train&&step>=1&&hidden.has(idx);
   if(isMask){
    const g=new THREE.Mesh(geo.ghost,mat.ghost);g.position.set(x,.08,z);g.userData={row:r,col:c,kind:'ghost'};root.add(g);pickables.push(g);tokenMeshes[r][c]=g;
    pushBoxEdges(ghostPairs,x,.08,z,.07,.16,.3);
   }else{
    const m=new THREE.Mesh(geo.token,axisA[r]);m.position.set(x,.5,z);m.userData={row:r,col:c,kind:'bar'};root.add(m);pickables.push(m);tokenMeshes[r][c]=m;
   }
  }
  if(ghostPairs.length){const lg=segGeo(ghostPairs);root.add(new THREE.LineSegments(lg,mat.ghostEdge));tempGeos.push(lg)}
  // ---- Zone C: 12-layer encoder tunnel.
  for(let i=0;i<12;i++){
   const p=new THREE.Mesh(geo.panel,panelMats[i]);p.position.set(xC(i),1.35,0);root.add(p);
   const e=new THREE.LineSegments(geo.panelEdge,mat.panelEdge);e.position.copy(p.position);root.add(e);
  }
  const seqLen=11*encGap()+.5;
  const seq=new THREE.Mesh(new THREE.BoxGeometry(seqLen,.4,.4),mat.seq);seq.position.set((xC(0)+xC(11))/2,1.35,0);root.add(seq);tempGeos.push(seq.geometry);
  mat.seq.opacity=step>=2?.42:.12;
  if(step>=2){
   const pairs=[];
   for(let r=0;r<axes;r++)for(let c=0;c<32;c++){
    if(train&&hidden.has(r*32+c))continue;
    pairs.push([[colX(c),1.02,rowZ(r)],[xC(0)-.28,1.35,rowZ(r)*.18]]);
   }
   const g=segGeo(pairs);root.add(new THREE.LineSegments(g,mat.flow));tempGeos.push(g);
   for(let k=0;k<3;k++){
    const x=xC([2,6,10][k]),pairs=[];
    for(let j=0;j<5;j++)pairs.push([[x,1.12+.09*((j*7)%5),-.55+.28*j],[x,1.3+.07*j,.55-.28*((j*3)%5)]]);
    const ag=segGeo(pairs);root.add(new THREE.LineSegments(ag,attenMats[k]));tempGeos.push(ag);
   }
  }
  if(train){
   // ---- Zone D: decoder + restored-position rebuild grid (pretraining only).
   for(let i=0;i<4;i++){
    const d=new THREE.Mesh(geo.dec,mat.dec);d.position.set(xD(i),.85,0);root.add(d);
    const e=new THREE.LineSegments(geo.decEdge,mat.decEdge);e.position.copy(d.position);root.add(e);
   }
   mat.dec.opacity=step>=3?.32:.14;mat.decEdge.opacity=step>=3?.55:.3;
   if(step>=2){
    const g=segGeo([[[xC(11)+.3,1.28,-.32],[xD(0)-.16,.95,0]],[[xC(11)+.3,1.35,0],[xD(0)-.16,.95,0]],[[xC(11)+.3,1.28,.32],[xD(0)-.16,.95,0]]]);
    root.add(new THREE.LineSegments(g,mat.flowDec));tempGeos.push(g);
   }
   const groundR=new THREE.Mesh(new THREE.BoxGeometry(2.35,.04,(axes-1)*.48+.55),mat.groundR);
   groundR.position.set(4.33,-.04,0);root.add(groundR);tempGeos.push(groundR.geometry);
   const lossPairs=[];
   for(let r=0;r<axes;r++)for(let c=0;c<32;c++){
    const idx=r*32+c,x=xR(c),z=zR(r);
    if(!hidden.has(idx)){if(step>=3){const b=new THREE.Mesh(geo.faint,axisR[r]);b.position.set(x,.11,z);root.add(b)}continue}
    if(step>=4){
     const b=new THREE.Mesh(geo.lossBar,mat.loss);b.position.set(x,.275,z);b.userData={row:r,col:c,kind:'loss'};root.add(b);pickables.push(b);
     pushBoxEdges(lossPairs,x,.275,z,.05,.55,.26);
    }else if(step>=3){
     const b=new THREE.Mesh(geo.maskTok,mat.maskTok);b.position.set(x,.25,z);b.userData={row:r,col:c,kind:'mask'};root.add(b);pickables.push(b);
    }
   }
   if(lossPairs.length){const lg=segGeo(lossPairs);root.add(new THREE.LineSegments(lg,mat.lossEdge));tempGeos.push(lg)}
  }else{
   // ---- Zone E: mean pooling + linear probe head (inference only).
   if(step>=3){
    const pairs=[];for(let j=0;j<14;j++)pairs.push([[1.5+(j%4)*.05,1.02+(j%5)*.1,((j%3)-1)*.32],[2.18,2.45,0]]);
    const g=segGeo(pairs);root.add(new THREE.LineSegments(g,mat.poolLine));tempGeos.push(g);
    const pool=new THREE.Mesh(geo.pool,mat.pool);pool.position.set(2.35,1.3,0);root.add(pool);
    const pe=new THREE.LineSegments(geo.poolEdge,mat.poolEdge);pe.position.copy(pool.position);root.add(pe);
   }
   if(step>=4){
    const head=new THREE.Mesh(geo.head,mat.head);head.position.set(3.15,1.3,0);root.add(head);
    const he=new THREE.LineSegments(geo.headEdge,mat.headLine);he.position.copy(head.position);root.add(he);
    const pairs=[[[2.58,1.3,0],[3.09,1.3,0]]];
    for(let j=0;j<7;j++)pairs.push([[3.21,1.3,0],[3.72,.32+j*.33,0]]);
    const g=segGeo(pairs);root.add(new THREE.LineSegments(g,mat.headLine));tempGeos.push(g);
    for(let j=0;j<7;j++){const o=new THREE.Mesh(geo.out,mat.out);o.position.set(3.8,.32+j*.33,0);root.add(o)}
   }
  }
  // ---- Flow particles: channel-colored dots riding visible tokens through the network.
  if(step>=2&&!REDUCE_MOTION){
   const maskedList=[...hidden];
   for(let n=0;n<14;n++){
    const row=n%axes;let col0=(n*7)%32;
    if(train){let guard=0;while(hidden.has(row*32+col0)&&guard++<32)col0=(col0+1)%32}
    const pts=[[colX(col0),1.02,rowZ(row)],[xC(0)-.25,1.35,rowZ(row)*.18],[(xC(0)+xC(11))/2,1.35,0],[xC(11)+.3,1.32,0]];
    if(train){
     const slot=maskedList.length?maskedList[(n*13)%maskedList.length]:row*32+col0;
     pts.push([xD(0)-.18,.95,0],[xD(3)+.15,.85,0],[xR(slot%32),.55,zR(Math.floor(slot/32))]);
    }else{
     pts.push([2.3,2.55,0],[3.12,1.3,0],[3.76,.32+(n%7)*.33,0]);
    }
    const mesh=new THREE.Mesh(geo.dot,axisDot[row]);root.add(mesh);
    particles.push({mesh,path:makePath(pts.map(p=>new THREE.Vector3(p[0],p[1],p[2]))),phase:n/14,speed:.09+.013*(n%5)});
   }
  }
  applySelection();
  if(camera.aspect)fit();
  axisA.forEach(m=>m.opacity=state.focusStep<=1?1:.5);
  if(REDUCE_MOTION)renderer.render(scene,camera);
  info(false);
 }
 // Cheap selection change: swap materials without rebuilding the scene.
 function applySelection(){
  if(selectedRef){
   const m=selectedRef.mesh,k=m.userData;
   m.material=k.kind==='bar'?axisA[k.row]:k.kind==='ghost'?mat.ghost:k.kind==='mask'?mat.maskTok:mat.loss;
   if(selectedRef.edge)root.remove(selectedRef.edge);
  }
  const row=Math.max(0,Math.min(state.axes-1,state.row)),col=Math.max(0,Math.min(31,state.col));
  const mesh=tokenMeshes[row]&&tokenMeshes[row][col];
  if(!mesh){selectedRef=null;return}
  mesh.material=mat.sel;selectedRef={mesh,baseY:mesh.position.y};
  const edge=new THREE.LineSegments(geo.sel,mat.selEdge);edge.position.copy(mesh.position);root.add(edge);selectedRef.edge=edge;
 }
 function resize(){const r=canvas.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(.1,r.width/r.height);fit();if(REDUCE_MOTION)renderer.render(scene,camera)}
 let last=performance.now();
 function animate(){
  if(REDUCE_MOTION){renderer.render(scene,camera);return}
  frame=requestAnimationFrame(animate);
  if(document.hidden||canvas.offsetParent===null){last=performance.now();return}
  if(!drag&&!moved)root.rotation.y+=.0016;
  const now=performance.now(),t=now/1000;last=now;
  const step=state.focusStep;
  if(step>=2){const active=Math.floor(t*2.4)%12;for(let i=0;i<12;i++)panelMats[i].opacity=i===active?.52:.18}
  else for(let i=0;i<12;i++)panelMats[i].opacity=.12;
  attenMats.forEach((m,k)=>m.opacity=step>=2?.18+.3*(.5+.5*Math.sin(t*2.2+k*1.3)):.1);
  mat.lossEdge.opacity=step>=4?.4+.45*(.5+.5*Math.sin(t*3.2)):.4;
  if(selectedRef){const y=selectedRef.baseY+.05*Math.sin(t*3);selectedRef.mesh.position.y=y;selectedRef.edge.position.y=y}
  for(const p of particles)p.mesh.position.copy(pathPos(p.path,(t*p.speed+p.phase)%1));
  renderer.render(scene,camera);
 }
 const zoomControl=makeZoomController(canvas,z=>{camera.zoom=z;camera.updateProjectionMatrix()},onZoom);
 function down(e){if(zoomControl.isPinching()){drag=false;moved=true;return}drag=true;moved=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)}
 function move(e){if(!drag||zoomControl.isPinching())return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;root.rotation.y+=dx*.008;root.rotation.x=Math.max(-1,Math.min(1,root.rotation.x+dy*.008));lastX=e.clientX;lastY=e.clientY}
 function up(e){if(drag&&!moved){const r=canvas.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);raycaster.setFromCamera(mouse,camera);const hit=raycaster.intersectObjects(pickables,false)[0];if(hit){state.row=hit.object.userData.row;state.col=hit.object.userData.col;applySelection();info(false)}}drag=false}
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);window.addEventListener('resize',resize);rebuild();resize();animate();
 return {update(config){const prev={...state};Object.assign(state,config);state.row=Math.min(state.row,state.axes-1);state.col=Math.max(0,Math.min(31,state.col));const structural=prev.axes!==state.axes||prev.mode!==state.mode||prev.focusStep!==state.focusStep||prev.phase!==state.phase||prev.spread!==state.spread;if(structural)rebuild();else{applySelection();if(REDUCE_MOTION)renderer.render(scene,camera);info(false)}},resize,zoomIn(){zoomControl.in()},zoomOut(){zoomControl.out()},resetView(){root.rotation.set(HOME.x,HOME.y,0);fit();zoomControl.reset()},destroy(){zoomControl.destroy();cancelAnimationFrame(frame);window.removeEventListener('resize',resize);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);Object.values(geo).forEach(g=>g.dispose());tempGeos.forEach(g=>g.dispose());Object.values(mat).forEach(m=>m.dispose());axisA.forEach(m=>m.dispose());axisR.forEach(m=>m.dispose());axisDot.forEach(m=>m.dispose());panelMats.forEach(m=>m.dispose());attenMats.forEach(m=>m.dispose());try{renderer.forceContextLoss()}catch(e){}renderer.dispose()}};
 function makeFallback(){
  canvas=originalCanvas.cloneNode(false);originalCanvas.replaceWith(canvas);ctx=canvas.getContext('2d');if(!ctx){onInfo({failed:true});return {update(){},resize(){},zoomIn(){},zoomOut(){},resetView(){},destroy(){}}}
  let zoom=1,yaw=.35,pitch=-.25,viewW=1,viewH=1;const zoomControl=makeZoomController(canvas,z=>{zoom=z;draw()},onZoom);
  const CSS={axis:['#c98a5e','#d9b380','#c99a72','#8aa9a0','#a8bcb2','#8aa9a0'],ghost:'#918b81',ghostEdge:'#aca599',mask:'#d6b896',loss:'#e69a5d',panel:'#a89478',panelEdge:'#a89575',dec:'#c8a986',seq:'#d8d9c2',pool:'#c9b088',head:'#d9a37e',out:'#d6b98c',flow:'#b4a58b',sel:'#e08a5e',ground:'#4a4034',groundR:'#52452e',line:'#a8a39b'};
  function project(x,y,z){const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),a=x*cy+z*sy,c=-x*sy+z*cy,b=y*cp-c*sp,scale=Math.min(viewW/13,viewH/5)*zoom;return [viewW*.5+a*scale,viewH*.5+(1.3-b)*scale]}
  function poly(points,color,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}}
  function quad(x,y,z,w,h,color,stroke){const s=project(x,y,z);return [[s[0]-w*40,s[1]],[s[0]+w*40,s[1]],[s[0]+w*40,s[1]-h*40],[s[0]-w*40,s[1]-h*40]]}
  function draw(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(10,r.width),h=Math.max(10,r.height);viewW=w;viewH=h;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);hits=[];const {hidden}=maskData(),step=state.focusStep,train=state.mode!=='inference',axes=state.axes;
   const colX=c=>-5.55+c*.083,rowZ=r2=>(r2-(axes-1)/2)*.56,gap=.17+.07*Number(state.spread),xC=i=>-1.8+i*gap,xD=i=>2.15+i*.26,xR=c=>3.35+c*.062,zR=r2=>rowZ(r2)*.85;
   // ground lanes
   for(let r2=0;r2<axes;r2++){const a=project(colX(0),0,rowZ(r2)),b=project(colX(31),0,rowZ(r2));ctx.strokeStyle=CSS.ground;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke()}
   // token bars
   for(let r2=0;r2<axes;r2++)for(let c=0;c<32;c++){
    const idx=r2*32+c,x=colX(c),z=rowZ(r2),isMask=train&&step>=1&&hidden.has(idx),sel=r2===state.row&&c===state.col;
    const hh=isMask?.16:1,color=sel?CSS.sel:isMask?CSS.axis[r2]:CSS.axis[r2];
    const p1=project(x,0,z-.15),p2=project(x,hh,z-.15),sx=Math.max(1.2,Math.abs(project(x+.035,0,z)[0]-p1[0]));
    const points=[[p1[0]-sx,p1[1]],[p1[0]+sx,p1[1]],[p2[0]+sx,p2[1]],[p2[0]-sx,p2[1]]];
    poly(points,sel?CSS.sel:isMask?CSS.ghost:CSS.axis[r2],sel?CSS.sel:(isMask?CSS.ghostEdge:null));hits.push({row:r2,col:c,points});
   }
   // encoder tunnel
   for(let i=0;i<12;i++){const x=xC(i),a=project(x,0,-1),b=project(x,2.7,1);ctx.strokeStyle=step>=2?CSS.panelEdge:'#726857';ctx.lineWidth=step>=2?1.4:1;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke()}
   // sequence bar
   if(step>=2){const a=project(xC(0),1.35,0),b=project(xC(11),1.35,0);ctx.strokeStyle=CSS.seq;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
    // converging flow (sampled)
    ctx.strokeStyle=CSS.flow;ctx.lineWidth=.8;for(let r2=0;r2<axes;r2++)for(let c=0;c<32;c+=4){if(train&&hidden.has(r2*32+c))continue;const s=project(colX(c),1.02,rowZ(r2)),e=project(xC(0)-.28,1.35,rowZ(r2)*.18);ctx.beginPath();ctx.moveTo(s[0],s[1]);ctx.lineTo(e[0],e[1]);ctx.stroke()}}
   if(train){
    for(let i=0;i<4;i++){const x=xD(i),a=project(x,0,-.75),b=project(x,1.7,.75);ctx.strokeStyle=step>=3?CSS.dec:'#816e59';ctx.lineWidth=step>=3?1.6:1;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke()}
    if(step>=3)for(let r2=0;r2<axes;r2++)for(let c=0;c<32;c++){
     const idx=r2*32+c;if(!hidden.has(idx))continue;const x=xR(c),z=zR(r2),s=project(x,0,z);
     ctx.fillStyle=step>=4?CSS.loss:CSS.mask;ctx.fillRect(s[0]-2,s[1]-6,4,6);
    }
   }else{
    if(step>=3){const s=project(2.35,0,0),t=project(2.35,2.6,0);ctx.fillStyle=CSS.pool;ctx.fillRect(s[0]-7,t[1],14,s[1]-t[1]);ctx.strokeStyle='#e4d7c1';ctx.strokeRect(s[0]-7,t[1],14,s[1]-t[1]);
     ctx.strokeStyle=CSS.flow;ctx.lineWidth=.8;for(let j=0;j<10;j++){const a=project(1.55,1.1+j*.06,((j%3)-1)*.3),b=project(2.2,2.45,0);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke()}}
    if(step>=4){const s=project(3.15,0,0),t=project(3.15,2.3,0);ctx.fillStyle=CSS.head;ctx.fillRect(s[0]-4,t[1],8,s[1]-t[1]);
     for(let j=0;j<7;j++){const o=project(3.8,.32+j*.33,0);ctx.fillStyle=CSS.out;ctx.fillRect(o[0]-4,o[1]-5,8,8);const a=project(3.2,1.3,0),b=project(3.72,.32+j*.33,0);ctx.strokeStyle=CSS.line;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke()}}
   }
   info(true);
  }
  function down(e){if(zoomControl.isPinching()){drag=false;moved=true;return}drag=true;moved=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)}
  function move(e){if(!drag||zoomControl.isPinching())return;const dx=e.clientX-lastX,dy=e.clientY-lastY;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;yaw+=dx*.008;pitch=Math.max(-1,Math.min(1,pitch+dy*.008));lastX=e.clientX;lastY=e.clientY;draw()}
  function up(e){if(drag&&!moved){const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;for(let k=hits.length-1;k>=0;k--){const q=hits[k];let inside=false;for(let i=0,j=q.points.length-1;i<q.points.length;j=i++){const a=q.points[i],b=q.points[j];if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]))inside=!inside}if(inside){state.row=q.row;state.col=q.col;draw();break}}}drag=false}
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);window.addEventListener('resize',draw);draw();
  return {update(config){Object.assign(state,config);state.row=Math.min(state.row,state.axes-1);draw()},resize:draw,zoomIn(){zoomControl.in()},zoomOut(){zoomControl.out()},resetView(){yaw=.5;pitch=-.22;zoomControl.reset()},destroy(){zoomControl.destroy();window.removeEventListener('resize',draw);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up)}};
 }
}
