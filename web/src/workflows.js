import TaskModel from '../../miniprogram/utils/task-model.js';
import ScheduleModel from '../../miniprogram/utils/schedule-model.js';
import TemplatePolicy from '../../miniprogram/utils/template-policy.js';
import {standardChecks,activeTaskPeople,validateTaskParties,taskChecks,taskDependencies,taskReward} from './task-actions.js';
import {audit,scheduleFields,normalizeSchedule,annotatedSchedule,seriesState,validateSeries,registerRecurrence,expandRecurrences,updateScheduleEvents} from './schedule-workflows.js';
const DAY = 86400000;
const departments = ['办公室', '新媒体运营部', '视觉传达部', '创意设计部'];
export const builtinTemplates = [
  {id:'ceremony', name:'典礼宣传', description:'提前预写，照片交付后再排版。', steps:[
    {name:'推送文案预写',dept:'新媒体运营部',offset:-2,time:'18:00',depends:[],requirements:'核对活动主题、人物与流程，活动前预写文案。'},
    {name:'活动现场摄影',dept:'视觉传达部',offset:0,time:'08:30',depends:[],requirements:'覆盖主舞台、发言、全景与互动，核对拍摄清单。'},
    {name:'精选照片交付',dept:'视觉传达部',offset:2,time:'12:00',depends:[1],requirements:'活动结束后 48 小时内提交 10—15 张精选照片；按场景分类，注明人物、摄影者。'},
    {name:'推送排版与提审',dept:'新媒体运营部',offset:2,time:'18:00',depends:[0,2],requirements:'使用已验收的文案与精选照片，核对署名和版式，提交预览链接。'}]},
  {id:'video',name:'视频制作',description:'选题、拍摄、剪辑与视频号发布。',steps:[
    {name:'选题与脚本确认',dept:'新媒体运营部',offset:-3,time:'18:00',depends:[],requirements:'明确选题、脚本、分镜与拍摄安排。'},
    {name:'视频素材拍摄',dept:'视觉传达部',offset:0,time:'11:00',depends:[0],requirements:'拍摄丰富素材，按机位与环节归类，72 小时内交付视频素材。'},
    {name:'视频剪辑与提审',dept:'视觉传达部',offset:3,time:'18:00',depends:[1],requirements:'交付成片与关键片段，核对字幕、配乐授权和署名。'},
    {name:'视频号发布',dept:'新媒体运营部',offset:4,time:'18:00',depends:[2],requirements:'核对发布文案、封面与视频版本，提交发布链接。'}]},
  {id:'external',name:'外派稿件',description:'办公室登记需求，需求方供稿，新媒体排版。',steps:[
    {name:'需求与素材确认',dept:'办公室',offset:-2,time:'18:00',depends:[],requirements:'登记需求方、期望时间、交付形式；检查需求方提供的文稿与图片。'},
    {name:'外派稿排版与提审',dept:'新媒体运营部',offset:-1,time:'18:00',depends:[0],requirements:'按已确认稿件排版，核对图片授权、文字与署名。'},
    {name:'发布与归档',dept:'新媒体运营部',offset:0,time:'18:00',depends:[1],requirements:'提交发布链接与归档位置。'}]},
  {id:'design',name:'视觉设计',description:'设计 brief、设计交付与源文件归档。',steps:[
    {name:'设计需求确认',dept:'办公室',offset:-7,time:'18:00',depends:[],requirements:'明确文创/展板/海报用途、尺寸、文案、风格与交付时间。'},
    {name:'设计定稿',dept:'创意设计部',offset:-1,time:'18:00',depends:[0],requirements:'交付预览图，核对尺寸、文案与输出规格。'},
    {name:'设计源文件归档',dept:'创意设计部',offset:2,time:'18:00',depends:[1],requirements:'定稿后 3 天内保留可编辑源文件和导出图，记录字体与素材来源。'}]}
].map(TemplatePolicy.optimizeTemplate);
export function normalizeWorkspace(s) { s.templates ||= []; s.ledger ||= []; normalizeSchedule(s);for(const t of s.tasks||[]){t.owners=TaskModel.owners(t);t.receivers=TaskModel.receivers(t);t.owner=t.owner_id=t.owners[0]||'';t.receiver=t.reviewer_id=t.receivers[0]||'';t.depts=Array.isArray(t.depts)?[...new Set(t.depts.filter(Boolean))]:t.dept?[t.dept]:[];} return annotatedSchedule(s); }
export function extendState(s,u,visible) {
  normalizeWorkspace(s);
  return {templates:[...builtinTemplates,...s.templates.map(TemplatePolicy.optimizeTemplate)],series:seriesState(s,u,visible),ledger:s.ledger.filter(x=>u.role==='admin'||x.user===u.id||u.role==='manager'&&x.dept===u.dept)};
}
export async function workflows(path,b,u,db,h) {
  const {fail,text,date,shift,shared,log,canManageEvent,manager}=h;
  const optional=(v,max=3000)=>v==null||v===''?'':text(v,max);
  const url=v=>{v=optional(v,2000);if(v){let p;try{p=new URL(v)}catch{fail(400,'链接格式不正确')}if(!['https:','http:'].includes(p.protocol)||p.username||p.password)fail(400,'请填写 http 或 https 链接')}return v};
  const priority=v=>{v=v||'normal';if(!['low','normal','high','urgent'].includes(v))fail(400,'任务优先级无效');return v};
  const points=v=>taskReward(v,fail);
  const fields=(x,old={})=>{
    const d=date(x.date??old.date),allDay=x.allDay??old.allDay??true;
    if(typeof allDay!=='boolean')fail(400,'全天设置无效');
    const dateDelta=old.date?Math.round((Date.parse(d)-Date.parse(old.date))/DAY):0;
    const start=allDay?'':(x.startTime??old.startTime??'09:00'),end=allDay?'':(x.endTime??old.endTime??'10:00'),endDate=date(x.endDate||(old.endDate?shift(old.endDate,dateDelta):d));
    if(!allDay&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)))fail(400,'请填写有效时间');
    if(endDate<d||(!allDay&&endDate===d&&end<=start))fail(400,'结束时间必须晚于开始时间');
    const source=x.source??old.source??'学媒自有';if(!['学媒自有','外派需求'].includes(source))fail(400,'需求来源无效');
    const department=x.department??old.department??'';if(department&&!departments.includes(department))fail(400,'部门模式无效');if(department&&u.role!=='admin'&&department!==u.dept)fail(403,'只能创建本部门内部日程');const schedule=scheduleFields(x,old,fail);if(!ScheduleModel.validDate(d)||!ScheduleModel.validDate(endDate))fail(400,'日期无效');if(schedule.recurrence.end==='date'&&schedule.recurrence.until<d)fail(400,'重复结束日期不能早于首次日程');return {department,...schedule,priority:priority(x.priority??old.priority),name:text(x.name??old.name,60),date:d,endDate,allDay,startTime:start,endTime:end,location:optional(x.location??old.location,100),description:optional(x.description??old.description),source,requester:optional(x.requester??old.requester,100),cloudUrl:url(x.cloudUrl??old.cloudUrl),rewardPoints:points(x.rewardPoints??old.rewardPoints),rewardNote:optional(x.rewardNote??old.rewardNote,500)};
  };
  const normalizeSteps=input=>{
    if(!Array.isArray(input)||input.length>30)fail(400,'模板最多包含 30 个环节');
    return input.map((x,i)=>{
      const offset=Number(x.offset||0);if(!Number.isInteger(offset)||Math.abs(offset)>365||!departments.includes(x.dept))fail(400,'请检查环节的部门与相对天数');
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time||''))fail(400,'环节时间无效');
      const depends=x.depends||[];if(!Array.isArray(depends)||depends.some(j=>!Number.isInteger(j)||j<0||j>=i)||new Set(depends).size!==depends.length)fail(400,'依赖只能选择前面的环节');
      if(x.videoPointsAbove!==undefined&&x.videoPointsAbove!==30)fail(400,'视频脚本积分条件无效');return {name:text(x.name,100),dept:x.dept,offset,time:x.time,depends,requirements:text(x.requirements,3000),priority:priority(x.priority),rewardPoints:x.rewardPoints==null?null:points(x.rewardPoints),rewardNote:optional(x.rewardNote,500),...(x.videoPointsAbove===30?{videoPointsAbove:30}:{})};
    });
  };
  if(path==='/api/templates/save'){
    if(!manager(u))fail(403,'需要负责人权限');
    const name=text(b.name,60),description=optional(b.description,500),steps=normalizeSteps(b.steps);
    return shared(db,s=>{if(!manager(u))fail(403,'需要负责人权限');normalizeWorkspace(s);const old=s.templates.find(t=>t.id===b.id);if(b.id&&(!old||!(u.role==='admin'||old.createdBy===u.id)))fail(403,'无权修改此模板');
      const template=audit(TemplatePolicy.optimizeTemplate({...(old||{}),id:old?.id||crypto.randomUUID(),name,description,steps,createdBy:old?.createdBy||u.id}),u,!old);
      if(old)s.templates[s.templates.indexOf(old)]=template;else s.templates.push(template);
      log(s,`已保存模板「${name}」`);return {ok:true,id:template.id};},u);
  }
  if(path==='/api/events/create'){
    if(!manager(u))fail(403,'需要负责人权限');
    return shared(db,async s=>{if(!manager(u))fail(403,'需要负责人权限');const f=fields(b);if(f.source==='外派需求'&&u.role!=='admin'&&u.dept!=='办公室')fail(403,'外派需求请由办公室登记派单');const people=await activeTaskPeople(db);normalizeWorkspace(s);const templateId=b.template||'blank';const template=[...builtinTemplates,...s.templates].find(t=>t.id===templateId);if(templateId!=='blank'&&!template)fail(400,'模板无效');
      const id=crypto.randomUUID(),optimized=template?TemplatePolicy.optimizeTemplate(template):null,applicable=TemplatePolicy.applicableSteps(optimized,{rewardPoints:f.rewardPoints}),indices=new Set(applicable.map(x=>x.index)),steps=applicable.map(x=>x.step);
      const assignments=applicable.map(({step:x,index:i})=>{
        const sameDept=people.find(p=>!p.owner&&p.dept===x.dept&&p.role==='manager')||people.find(p=>!p.owner&&p.dept===x.dept);
        const legacy=x.dept==='视觉传达部'?b.visual||sameDept?.id:x.dept==='新媒体运营部'?b.editor||sameDept?.id:sameDept?.id;
        const selected=b.assignments?.[i],receiver=people.find(p=>!p.owner&&p.role==='admin')?.id||sameDept?.id||legacy;
        return validateTaskParties(selected||{owner:legacy,receiver},null,people,f,fail);
      });
      validateSeries(s,f.seriesId,fail);const event=audit({id,...f,type:template?.name||'自由活动',template:templateId},u,true);s.events.unshift(event);
      applicable.forEach(({step:x,index:i},j)=>{const depends=x.depends.filter(k=>indices.has(k)).map(k=>id+'-'+k);s.tasks.push(audit({id:id+'-'+i,event:id,...assignments[j],priority:x.priority||f.priority,name:x.name,due:shift(f.date,x.offset)+'T'+x.time,status:depends.length?'blocked':'pending',depends,requirements:x.requirements,checks:[...standardChecks],checked:[false,false],rewardPoints:x.rewardPoints??f.rewardPoints,rewardNote:x.rewardNote||f.rewardNote},u,true));});
      registerRecurrence(s,event);const repeated=expandRecurrences(s,u,people,fail);log(s,`已创建「${f.name}」及 ${steps.length} 项任务`);return {ok:true,id,created:1+repeated};
    },u);
  }
  if(path==='/api/events/update')return shared(db,async s=>{
    const e=s.events.find(x=>x.id===b.id);if(!e||!canManageEvent(u,e,s))fail(403,'无权修改此活动');
    const f=fields(b,e);if(f.department!==(e.department||'')&&s.tasks.some(t=>t.event===e.id))fail(400,'已有任务的活动不能修改所属部门，请新建内部日程');if(f.source==='外派需求'&&u.role!=='admin'&&u.dept!=='办公室')fail(403,'外派需求请由办公室登记派单');
    const updated=updateScheduleEvents(s,e,f,b,u,h),people=await activeTaskPeople(db),created=expandRecurrences(s,u,people,fail);log(s,`已更新「${e.name}」的活动信息`, 'all');return {ok:true,updated,created};
  },u);
  if(path==='/api/tasks/create'){
    return shared(db,async s=>{const people=await activeTaskPeople(db);const e=s.events.find(x=>x.id===b.event);if(!e||!canManageEvent(u,e,s))fail(403,'无权添加任务');
      const parties=validateTaskParties(b,null,people,e,fail),id=crypto.randomUUID(),depends=taskDependencies(b.depends,e.id,id,s,fail),checks=taskChecks(b.checks,text,fail);s.tasks.push(audit({id,event:e.id,...parties,priority:priority(b.priority),name:text(b.name,100),due:date(b.due,true),depends,status:depends.some(id=>s.tasks.find(t=>t.id===id).status!=='done')?'blocked':'pending',requirements:text(b.requirements,3000),checks,checked:checks.map(()=>false),rewardPoints:points(b.rewardPoints??e.rewardPoints),rewardNote:optional(b.rewardNote??e.rewardNote,500)},u,true));audit(e,u);
      log(s,`新任务「${b.name}」已分配`,parties.owners,e.department||'');return {ok:true,id};},u);
  }
  return null;
}
