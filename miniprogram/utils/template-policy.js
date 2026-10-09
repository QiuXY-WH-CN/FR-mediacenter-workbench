// Shared production stages. Existing rewards are preserved; completed tasks are never rewritten.
function optimizeTemplate(template){
 const out=JSON.parse(JSON.stringify(template||{})),steps=(out.steps||[]).map((s,index)=>({...s,_index:index,depends:[...(s.depends||[])],offset:Number(s.offset||0)}));
 const push=s=>/推送|排版|外派稿/.test(s.name||'')&&!/视频切片|脚本|素材收集|收集素材|文案|封面/.test(s.name||''),video=s=>/视频|拍摄|剪辑/.test(s.name||'')&&!/脚本|文案|封面/.test(s.name||''),script=s=>/脚本|分镜/.test(s.name||'');
 const hasPush=steps.some(push),hasVideo=steps.some(video),originalLength=steps.length;
 for(const s of steps){
  if(/摄影|拍摄|剪辑/.test(s.name||'')&&!script(s))s.dept='视觉传达部';
  if(push(s))s.dept='新媒体运营部';
  if(/封面|背景板|海报|文创/.test(s.name||''))s.dept='创意设计部';
  if(/预告|预热|需求确认|背景板|脚本|分镜/.test(s.name||'')&&s.offset>0)s.offset=-s.offset;
  if(/总结|落幕|精选|归档/.test(s.name||'')&&s.offset<0)s.offset=-s.offset;
  if(script(s)){s.videoPointsAbove=30;s.requirements=(s.requirements||'')+(String(s.requirements||'').includes('超过 30')?'':' 视频项目积分超过 30 时安排脚本与分镜。');}
  s.time||='18:00';s.requirements||='核对交付内容与署名，提交成果供验收。';
 }
 const add=(name,dept,offset,requirements,extra={})=>{if(steps.length>=30)return null;const s={name,dept,offset:Math.max(-365,Math.min(365,offset)),time:'18:00',depends:[],requirements,rewardPoints:10,...extra,_index:steps.length};steps.push(s);return s};
 if(hasPush){
  const first=Math.min(...steps.filter(push).map(s=>s.offset));
  const materials=steps.find(s=>/素材收集|收集素材|需求与素材/.test(s.name||''))||add('推送素材收集','办公室',first-2,'收集并核对文稿、图片、人物信息和授权；大型活动由视觉传达部提供现场素材。');
  const cover=steps.find(s=>/封面设计|封面制作/.test(s.name||''))||add('推送封面设计','创意设计部',first-1,'设计或修改推送封面，交付预览与源文件，核对标题和尺寸。');
  const writing=steps.find(s=>/推送文案|文案预写|文案撰写/.test(s.name||''))||add('推送文案撰写','新媒体运营部',first-1,'根据已核对素材撰写文案，核对人物、事实与署名。');
  for(const s of [materials,cover,writing].filter(Boolean))s.offset=Math.min(s.offset,first);
  if(writing&&materials&&writing!==materials)writing.depends=[...new Set([...writing.depends,materials._index])];
  for(const s of steps.filter(push)){for(const dep of [materials,cover,writing].filter(Boolean)){if(s!==dep&&!s.depends.includes(dep._index))s.depends.push(dep._index);}}
 }
 if(hasVideo){
  const first=Math.min(...steps.filter(video).map(s=>s.offset));
  const screenplay=steps.find(script)||add('视频脚本与分镜','新媒体运营部',first-3,'明确脚本、分镜、拍摄清单和人物授权；视频项目积分超过 30 时安排。',{videoPointsAbove:30});
  let shooting=steps.find(s=>/视频.*拍摄|素材拍摄|拍摄.*视频/.test(s.name||'')&&!script(s));
  if(!shooting)shooting=add('视频素材拍摄','视觉传达部',first,'按拍摄清单交付原始素材，注明场景、人物与拍摄者。');
  if(shooting&&screenplay&&shooting!==screenplay)shooting.depends=[...new Set([...shooting.depends,screenplay._index])];
  for(const s of steps.filter(s=>/剪辑|视频制作|总结视频|毕业总结视频|总结视频/.test(s.name||'')&&!script(s))){if(shooting&&s!==shooting&&!s.depends.includes(shooting._index))s.depends.push(shooting._index);s.dept='视觉传达部';}
 }
 // Stable topological order also accepts newly inserted prerequisites. Invalid cycles keep the original template intact.
 const sorted=[],pending=[...steps];while(pending.length){const ready=pending.find(s=>s.depends.every(i=>sorted.some(x=>x._index===i)));if(!ready)return {...template,steps:JSON.parse(JSON.stringify(template.steps||[]))};pending.splice(pending.indexOf(ready),1);sorted.push(ready);}
 const remap=new Map(sorted.map((s,i)=>[s._index,i]));out.steps=sorted.map(s=>{const deps=s.depends.map(i=>remap.get(i));for(const i of deps)s.offset=Math.max(s.offset,sorted[i].offset);const {_index,...clean}=s;return {...clean,depends:deps}});out.workflowVersion=1;out.addedStages=steps.length-originalLength;return out;
}
function applicableSteps(template,options={}){
 const steps=template?.steps||[],videoPoints=Math.max(Number(options.rewardPoints)||0,...steps.filter(s=>/视频|拍摄|剪辑/.test(s.name||'')&&!/脚本|文案/.test(s.name||'')).map(s=>Number(s.rewardPoints)||0));
 return steps.map((step,index)=>({step,index})).filter(({step})=>!step.videoPointsAbove||videoPoints>Number(step.videoPointsAbove));
}
function suggestions(template,events=[],tasks=[]){
 const examples=events.filter(e=>e.template===template?.id),median=values=>{const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:null};
 return (template?.steps||[]).map(s=>{const history=examples.flatMap(e=>tasks.filter(t=>t.event===e.id&&t.name===s.name).map(t=>({offset:Math.round((Date.parse(String(t.due||'').slice(0,10))-Date.parse(e.date))/86400000),points:t.rewardPoints==null?null:Number(t.rewardPoints)})));return {name:s.name,dept:s.dept,offset:median(history.map(x=>x.offset))??s.offset,rewardPoints:median(history.map(x=>x.points))??s.rewardPoints??null,samples:history.length}});
}
module.exports={optimizeTemplate,applicableSteps,suggestions};
