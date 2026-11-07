"""Generate an offline, self-contained HTML from the editable site files."""
from pathlib import Path
import base64,json,re
root=Path(__file__).resolve().parent
out=root/'transfhar-explorer.html'
html=(root/'index.html').read_text('utf8')
css=(root/'vendor/katex-embedded.css').read_text('utf8')+'\n'+(root/'style.css').read_text('utf8')
katex=(root/'vendor/katex.min.js').read_text('utf8')
lib=(root/'vendor/three.module.js').read_text('utf8')
assert lib.count('\nexport {')==1
lib=re.sub(r'\nexport \{[^\n]+\};\s*$','\n',lib)
view=(root/'three-view.js').read_text('utf8').replace("import * as THREE from './vendor/three.module.js';",'').replace('export function makeThreeView','function makeThreeView').replace('export function makeTokenView','function makeTokenView')
app=(root/'app.js').read_text('utf8').replace("import {makeThreeView,makeTokenView} from './three-view.js';",'').replace("import {describeToken,networkShapes} from './token-state.mjs';",'')
tokenstate=(root/'token-state.mjs').read_text('utf8').replace('export function ','function ')
for before,after in [
 ("function inlineSourceUrl(kind,id){return kind==='figure'?`assets/${id}.png`:`assets/pages/page-${String(id).padStart(2,'0')}.webp`}", "function inlineSourceUrl(kind,id){return kind==='figure'?assetURLs[id]:assetURLs['page-'+String(id).padStart(2,'0')] }"),
 ('src="assets/fig1.png"','src="${assetURLs.fig1}"'),
 ("$('#figureImage').src=`assets/${id}.png`","$('#figureImage').src=assetURLs[id]"),
 ("$('#paperImage').src=`assets/pages/page-${p}.webp`","$('#paperImage').src=assetURLs['page-'+p]"),
]:
 assert before in app,before;app=app.replace(before,after)
for name in ['transfhar-source.zip','transfhar-explorer.html','TransfHAR_30min_Speaker_Notes.md','transfhar.course.zip']:
 app=re.sub(r'<a href="'+re.escape(name)+r'" download>.*?</a>','',app)
start=app.find("try {const r=await fetch('./course.json')");assert start>=0
app=app[:start]+"try {course=JSON.parse(document.getElementById('embeddedCourse').textContent);const i=course.lessons.findIndex(x=>x.id===location.hash.slice(1));current=i<0?0:i;render()}catch(error){$('#main').textContent='无法载入课程内容：'+error.message}"
assets={}
for i in range(1,10):
 p=root/'assets'/f'fig{i}.png';assets[f'fig{i}']='data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode('ascii')
for i in range(1,17):
 p=root/'assets'/'pages'/f'page-{i:02}.webp';assets[f'page-{i:02}']='data:image/webp;base64,'+base64.b64encode(p.read_bytes()).decode('ascii')
course=(root/'course.json').read_text('utf8')
three='WebGLRenderer,Scene,PerspectiveCamera,Vector3,Vector2,Group,MeshBasicMaterial,LineBasicMaterial,BoxGeometry,Mesh,LineSegments,EdgesGeometry,Raycaster,Geometry,Line'
code='(function(){\nconst THREE=(()=>{\n'+lib+'\nreturn {'+three+'};\n})();\nconst assetURLs=JSON.parse(document.getElementById("embeddedAssets").textContent);\n'+view+'\n'+tokenstate+'\n'+app+'\n})();'
for label,x in [('code',code),('katex',katex),('course',course)]: assert '</script' not in x.lower(),label
assert '</style' not in css.lower()
html=html.replace('<link rel="stylesheet" href="./vendor/katex-embedded.css">\n  <link rel="stylesheet" href="./style.css">','<style>\n'+css+'\n</style>')
html=html.replace('<script defer src="./vendor/katex.min.js"></script>','<script>'+katex+'</script>')
html=html.replace('<script type="module" src="./app.js"></script>','<script type="application/json" id="embeddedCourse">'+course+'</script>\n<script type="application/json" id="embeddedAssets">'+json.dumps(assets,separators=(',',':'))+'</script>\n<script>'+code+'</script>')
license_notice=(root/'vendor/THREE-LICENSE.txt').read_text('utf8').replace('--','—')+'\n'+(root/'vendor/KATEX-LICENSE.txt').read_text('utf8').replace('--','—')
html=html.replace('</head>','<!-- Third-party notices:\n'+license_notice+'\n-->\n</head>')
assert 'src="./app.js"' not in html and 'fetch(\'./course.json\')' not in html
out.write_text(html,encoding='utf8')
print('Wrote',out.name,'bytes:',out.stat().st_size)
