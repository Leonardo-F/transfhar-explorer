"""Generate an offline, self-contained HTML from the editable site files."""
from pathlib import Path
import base64,json,re
root=Path(__file__).resolve().parent.parent
out=root/'transfhar-explorer.html'
html=(root/'index.html').read_text('utf8')

def data_url(path,mime):
    return f'data:{mime};base64,'+base64.b64encode(path.read_bytes()).decode('ascii')

# KaTeX stylesheet + fonts: the lean CSS references external woff2 files, which are
# inlined again so the offline page stays a single file.
css=(root/'vendor/katex-embedded.lean.css').read_text('utf8')+'\n'+(root/'src/style.css').read_text('utf8')
def inline_font(match):
    return 'url('+data_url(root/'vendor'/'fonts'/match.group(1),'font/woff2')+')'
css,font_count=re.subn(r'url\(fonts/([A-Za-z0-9_.-]+\.woff2)\)',inline_font,css)
assert font_count==13, font_count
katex=(root/'vendor/katex.min.js').read_text('utf8')

# Minified, tree-shaken Three.js bundle. Regenerate with:
#   cd .cache/build-tools && ./node_modules/.bin/esbuild three-entry.js \
#     --bundle --minify --format=iife --global-name=THREE \
#     --legal-comments=none --outfile=../../vendor/three.min.js
lib=(root/'vendor/three.min.js').read_text('utf8')
assert lib.startswith('var THREE=') and lib.rstrip().endswith('})();'), 'unexpected three bundle'

view=(root/'src/three-view.js').read_text('utf8').replace("import * as THREE from '../vendor/three.min.module.js';",'').replace("import {pipelineMask} from './pipeline-view.js';",'').replace('export function makeThreeView','function makeThreeView').replace('export function makeTokenView','function makeTokenView')
pipeline=(root/'src/pipeline-view.js').read_text('utf8').replace('export const PIPELINE_STEPS','const PIPELINE_STEPS').replace('export function pipelineMask','function pipelineMask').replace('export function visibleIndex','function visibleIndex').replace('export function makePipelineView','function makePipelineView')
app=(root/'src/app.js').read_text('utf8').replace("loadThreeView().then(","Promise.resolve({makeThreeView,makeTokenView}).then(").replace("const loadThreeView=()=>import('./three-view.js');",'').replace("import {makePipelineView} from './pipeline-view.js';",'').replace("import {describeToken,networkShapes} from './token-state.mjs';",'')
tokenstate=(root/'src/token-state.mjs').read_text('utf8').replace('export function ','function ')
translation=(root/'src/paper-zh.mjs').read_text('utf8').replace('export const paperTranslations','const paperTranslations').replace('export function getPaperTranslation','function getPaperTranslation')
neuralmodel=(root/'src/neural-model.mjs').read_text('utf8').replace("import {pipelineMask} from './pipeline-view.js';",'').replace('export function ','function ')
neural=(root/'src/neural-flow.mjs').read_text('utf8').replace('export function ','function ')
neural=re.sub(r'^import .*?;\n','',neural,flags=re.M)
app=app.replace("import {makeNeuralView} from './neural-flow.mjs';",'')
app=app.replace("import {getPaperTranslation} from './paper-zh.mjs';",'')
for before,after in [
 ("function inlineSourceUrl(kind,id){return kind==='figure'?`assets/${id}.webp`:`assets/pages/page-${String(id).padStart(2,'0')}.webp`}", "function inlineSourceUrl(kind,id){return kind==='figure'?assetURLs[id]:assetURLs['page-'+String(id).padStart(2,'0')] }"),
 ('src="assets/fig1.webp"','src="${assetURLs.fig1}"'),
]:
 assert before in app,before;app=app.replace(before,after)
for name in ['transfhar-source.zip','transfhar-explorer.html','docs/TransfHAR_30min_Speaker_Notes.md']:
 app=re.sub(r'<a href="'+re.escape(name)+r'" download>.*?</a>','',app)
start=app.find("try {const r=await fetch('./src/course.json')");assert start>=0
app=app[:start]+"try {course=JSON.parse(document.getElementById('embeddedCourse').textContent);const i=course.lessons.findIndex(x=>x.id===location.hash.slice(1));current=i<0?0:i;render();setMenu(false);syncPressed()}catch(error){$('#main').textContent='无法载入课程内容：'+error.message}"
assets={}
for i in range(1,9):
 assets[f'fig{i}']=data_url(root/'assets'/f'fig{i}.webp','image/webp')
for i in range(1,17):
 assets[f'page-{i:02}']=data_url(root/'assets'/'pages'/f'page-{i:02}.webp','image/webp')
course=(root/'src/course.json').read_text('utf8')
code='(function(){\n'+lib+'\nconst assetURLs=JSON.parse(document.getElementById("embeddedAssets").textContent);\n'+view+'\n'+pipeline+'\n'+tokenstate+'\n'+translation+'\n'+neuralmodel+'\n'+neural+'\n'+app+'\n})();'
for label,x in [('code',code),('katex',katex),('course',course)]: assert '</script' not in x.lower(),label
assert '</style' not in css.lower()
html=html.replace('<link rel="stylesheet" href="./vendor/katex-embedded.lean.css">\n  <link rel="stylesheet" href="./src/style.css">','<style>\n'+css+'\n</style>')
html=html.replace('<script defer src="./vendor/katex.min.js"></script>','<script>'+katex+'</script>')
html=html.replace('<script type="module" src="./src/app.js"></script>','<script type="application/json" id="embeddedCourse">'+course+'</script>\n<script type="application/json" id="embeddedAssets">'+json.dumps(assets,separators=(',',':'))+'</script>\n<script>'+code+'</script>')
license_notice=(root/'LICENSE').read_text('utf8').replace('--','—')+'\n'+(root/'vendor/THREE-LICENSE.txt').read_text('utf8').replace('--','—')+'\n'+(root/'vendor/KATEX-LICENSE.txt').read_text('utf8').replace('--','—')
html=html.replace('</head>','<!-- Third-party notices:\n'+license_notice+'\n-->\n</head>')
assert 'src="./src/app.js"' not in html and 'fetch(\'./src/course.json\')' not in html
out.write_text(html,encoding='utf8')
print('Wrote',out.name,'bytes:',out.stat().st_size)
