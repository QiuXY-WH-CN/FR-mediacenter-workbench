import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,relative,join} from 'node:path';
import {readdirSync,readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
const project=fileURLToPath(new URL('../../miniprogram/',import.meta.url)),artifacts=fileURLToPath(new URL('../.local/qa/v105-native/',import.meta.url));mkdirSync(artifacts,{recursive:true});
const compiler='C:/Program Files (x86)/Tencent/微信web开发者工具/resources/app.asar.unpacked/node_modules/wcc-exec/';
const walk=dir=>readdirSync(dir,{withFileTypes:true}).filter(d=>d.name!=='node_modules').flatMap(d=>d.isDirectory()?walk(join(dir,d.name)):[join(dir,d.name)]);
const pageRoutes=JSON.parse(readFileSync(join(project,'app.json'),'utf8')).pages;const files=walk(join(project,'pages')),components=walk(join(project,'components')),wxml=[...files.filter(p=>p.endsWith('.wxml')),...walk(join(project,'templates')).filter(p=>p.endsWith('.wxml')),...components.filter(p=>p.endsWith('.wxml'))],wxss=[join(project,'app.wxss'),...files.filter(p=>p.endsWith('.wxss')),...components.filter(p=>p.endsWith('.wxss'))],source=files.filter(p=>p.endsWith('.js')).concat(walk(join(project,'utils')).filter(p=>p.endsWith('.js')),components.filter(p=>p.endsWith('.js')),walk(join(project,'services')).filter(p=>p.endsWith('.js')),[join(project,'app.js'),join(project,'config.js')]);
const report={project:'miniprogram',wxml:[],wxss:[],javascript:[],success:true};
function compile(exe,args,name){const result=spawnSync(compiler+exe,args,{cwd:project,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024}),ok=result.status===0&&!result.error;writeFileSync(join(artifacts,name+'-stdout.txt'),result.stdout||'');writeFileSync(join(artifacts,name+'-stderr.txt'),result.stderr||'');if(!ok){report.success=false;console.error(name+': '+(result.error?.message||result.stderr||result.stdout));}return {ok,status:result.status}}
const wout=relative(project,join(artifacts,'templates.js')).replaceAll('\\','/'),sout=relative(project,join(artifacts,'styles.js')).replaceAll('\\','/');
const w=compile('wcc.exe',['-o',wout,...wxml.map(p=>relative(project,p).replaceAll('\\','/'))],'wxml');report.wxml=wxml.map(p=>({file:relative(project,p).replaceAll('\\','/'),...w}));
const s=compile('wcsc.exe',['-lc','-js','-o',sout,...wxss.map(p=>relative(project,p).replaceAll('\\','/'))],'wxss');report.wxss=wxss.map(p=>({file:relative(project,p).replaceAll('\\','/'),...s}));
for(const p of source){const check=spawnSync(process.execPath,['--check',p],{encoding:'utf8',windowsHide:true}),ok=check.status===0;report.javascript.push({file:relative(project,p).replaceAll('\\','/'),ok});if(!ok){report.success=false;console.error(p+': '+check.stderr)}}
for(const output of ['templates.js','styles.js'])try{report[output]={bytes:statSync(join(artifacts,output)).size}}catch{}
writeFileSync(join(artifacts,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({success:report.success,pageTemplates:pageRoutes.length,totalTemplates:wxml.length,styles:wxss.length,javascript:source.length,artifacts},null,2));if(!report.success)process.exitCode=1;
