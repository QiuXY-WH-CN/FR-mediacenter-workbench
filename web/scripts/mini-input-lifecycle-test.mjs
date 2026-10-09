import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url), root=new URL('../../miniprogram/',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
// The native compiler accepts literal conditions, so explicitly guard this runtime regression.
for(const dir of readdirSync(new URL('pages/',root)))
 for(const file of readdirSync(new URL(`pages/${dir}/`,root)).filter(p=>p.endsWith('.wxml')))
  assert.ok(!/wx:(?:if|elif)="(?!\{\{)/.test(read(`pages/${dir}/${file}`)),`${dir}/${file}: condition must be an expression`);
let editor;
const V={page:s=>s,depts:['办公室'],day:()=> '2026-10-08',shift:require('../../miniprogram/utils/schedule-model.js').shift};
vm.runInNewContext(read('pages/editor/index.js'),{Page:s=>editor=s,require:p=>p.endsWith('/view')?V:require(fileURLToPath(new URL('pages/editor/'+p+'.js',root))),wx:{}});
editor.options={mode:'event-new'};editor.data=structuredClone(editor.data);editor.setData=p=>Object.assign(editor.data,p);
editor.renderState({user:{id:'root',role:'admin',owner:true},people:[],events:[],tasks:[],templates:[],settings:{}});
for(const [key,value] of [['name','输入活动名称'],['location','会议室'],['description','多行\n说明'],['rewardPoints','12']]){
 const index=editor.data.fields.findIndex(f=>f.key===key);
 editor.change({currentTarget:{dataset:{index}},detail:{value}});
 assert.equal(editor.values()[key],value);
}
assert.equal(editor.data.fields.find(f=>f.key==='name').type,'text');
assert.equal(editor.data.fields.find(f=>f.key==='description').type,'textarea');
let spec,available=false,sequence=0;const timers=new Map(),frames=new Map();
const ctx=new Proxy({setTransform(){}},{get:(t,k)=>t[k]||(()=>{})});
const canvas={getContext:()=>ctx,requestAnimationFrame:f=>{frames.set(++sequence,f);return sequence},cancelAnimationFrame:id=>frames.delete(id)};
vm.runInNewContext(read('components/particle-field/index.js'),{Component:s=>spec=s,require:()=>require(fileURLToPath(new URL('utils/particle-engine.js',root))),wx:{nextTick:f=>f(),getWindowInfo:()=>({pixelRatio:2})},setTimeout:f=>{timers.set(++sequence,f);return sequence},clearTimeout:id=>timers.delete(id),Date,Math});
const owner={data:Object.fromEntries(Object.entries(spec.properties).map(([k,p])=>[k,structuredClone(p.value)])),...spec.methods,createSelectorQuery:()=>({select(){return this},fields(){return this},exec(fn){fn(available?[{node:canvas,width:390,height:671}]:[{}])}})};
spec.lifetimes.ready.call(owner);assert.equal(timers.size,1);
available=true;const retry=[...timers.values()][0];timers.clear();retry();assert.ok(owner.canvas);assert.equal(frames.size,1);
spec.pageLifetimes.hide.call(owner);assert.equal(frames.size,0);
spec.pageLifetimes.show.call(owner);assert.equal(frames.size,1);assert.equal(owner.width,390);
spec.lifetimes.detached.call(owner);assert.equal(frames.size,0);assert.equal(timers.size,0);
console.log('PASS: editable text/textarea/number values, no literal WXML conditions, delayed tab canvas retries, tab resume and complete animation/timer cleanup.');
