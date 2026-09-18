import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
const files={'/index.html':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8'};
const assets={};for(const [file,type] of Object.entries(files))assets[file]={type,body:await readFile('src'+file,'utf8')};
assets['/app.js'].body+='\n'+await readFile('src/enhancements.js','utf8');
assets['/style.css'].body+='\n'+await readFile('src/v2.css','utf8');
assets['/index.html'].body=assets['/index.html'].body.replace(/<link rel="icon"[^>]*>/,'<link rel="icon" type="image/png" href="/brand/emblem.png">').replace('#183e36','#ff861b');
for(const file of ['emblem.png','wordmark.png'])assets['/brand/'+file]={type:'image/png',base64:true,body:(await readFile('src/brand/'+file)).toString('base64')};
const documents=[{path:'知识库.md',title:'知识库',content:await readFile('sop/知识库.md','utf8')}];assets['/sop-docs.json']={type:'application/json; charset=utf-8',body:JSON.stringify(documents)};
await writeFile('src/assets.generated.js','export default '+JSON.stringify(assets));
await mkdir('dist/server',{recursive:true});
await build({entryPoints:['./src/worker.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
console.log('Worker and embedded assets built.');

