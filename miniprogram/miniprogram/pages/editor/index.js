const V=require('../../utils/view');
const F=(key,label,value='',type='text',options=[])=>({key,label,value:value??'',type,options:options.map(o=>typeof o==='string'?{label:o,value:o}:o)});
const fieldList=items=>items.map(f=>{if(f.type==='select'){f.selected=Math.max(0,f.options.findIndex(o=>o.value===f.value));f.value=f.options[f.selected]?.value||'';f.display=f.options[f.selected]?.label||'请选择'}return f});
Page(V.page({data:{fields:[],title:'编辑',busy:false,resultToken:'',stepCount:0},renderState(s){this.snapshot=s;if(!this.initialized){this.initialized=true;this.initialize()}},
 initialize(){const o=this.options,s=this.snapshot,u=s.user,e=s.events.find(x=>x.id===o.id||x.id===o.event),t=s.tasks.find(x=>x.id===o.id);let fields=[],title='编辑';this.initialValues={};
  const people=s.people.map(p=>({value:p.id,label:p.name+' · '+p.dept}));
  const rewards=x=>[F('rewardPoints','每项任务积分',x?.rewardPoints||0,'number'),F('rewardNote','其他奖励备注',x?.rewardNote||'')];
  if(o.mode==='event-new'||o.mode==='event-edit'){
    const x=o.mode==='event-edit'?e:{};if(!x){this.setData({error:'活动不存在'});return}title=o.mode==='event-new'?'新建活动':'编辑活动';
    fields=[...(o.mode==='event-new'?[F('template','选择模板',o.template||'blank','select',[{value:'blank',label:'空白日程 · 自由创建'},...s.templates.map(t=>({value:t.id,label:t.name}))])]:[]),F('name','活动名称',x.name),F('allDay','全天',x.allDay!==false,'switch'),F('date','开始日期',x.date||V.day(),'date'),F('endDate','结束日期',x.endDate||x.date||V.day(),'date'),F('startTime','开始时间（非全天生效）',x.startTime||'09:00','time'),F('endTime','结束时间（非全天生效）',x.endTime||'10:00','time'),F('location','地点（可选）',x.location),F('source','需求来源',x.source||'学媒自有','select',['学媒自有','外派需求']),F('requester','需求方 / 对接人',x.requester),F('description','活动说明与交付目标',x.description,'textarea'),F('cloudUrl','活动云盘上传链接（可稍后填写）',x.cloudUrl),...rewards(x)];
  }else if(o.mode==='task-new'||o.mode==='task-edit'){
    const x=o.mode==='task-edit'?t:{};if(!x){this.setData({error:'任务不存在'});return}title=o.mode==='task-new'?'添加任务':'调整分工';const event=e||s.events.find(e=>e.id===t?.event)||{};this.taskEvent=event;
    fields=[...(o.mode==='task-new'?[F('name','任务名称')]:[]),F('owner','负责人',x.owner||u.id,'select',people),F('receiver','验收人',x.receiver||u.id,'select',people),F('dueDate','截止日期',x.due?.slice(0,10)||event.date||V.day(),'date'),F('dueTime','截止时间',x.due?.slice(11,16)||event.endTime||'18:00','time'),F('requirements','交付要求',x.requirements||'','textarea'),...(o.mode==='task-new'?[F('depends','前序任务（全部验收后解锁）',[],'checks',s.tasks.filter(t=>t.event===event.id).map(t=>({value:t.id,label:t.name})))]:[]),...rewards(o.mode==='task-new'?event:x)];
  }else if(['template-new','template-edit','template-from'].includes(o.mode)){
    let x=s.templates.find(t=>t.id===o.id)||{name:'',steps:[]};
    if(o.mode==='template-from'){const tasks=s.tasks.filter(t=>t.event===e?.id);x={name:(e?.name||'活动')+'流程',description:e?.description||'',steps:tasks.map(t=>({name:t.name,dept:t.dept,offset:Math.round((Date.parse(t.due.slice(0,10))-Date.parse(e.date))/86400000),time:t.due.slice(11,16),depends:t.depends.map(id=>tasks.findIndex(t=>t.id===id)),requirements:t.requirements,rewardPoints:t.rewardPoints,rewardNote:t.rewardNote}))};}
    this.templateId=x.createdBy&&(u.role==='admin'||x.createdBy===u.id)?x.id:'';title=this.templateId?'编辑模板':'创建模板';
    fields=[F('name','模板名称',x.name),F('description','使用说明',x.description,'textarea')];this.setData({stepCount:x.steps.length});x.steps.forEach((step,i)=>fields.push(...this.stepFields(step,i)));
  }else if(o.mode==='member'){
    title='管理成员';const m=this.member;if(!m){this.loadMember();return}fields=[F('dept','部门',m.dept,'select',u.role==='admin'?V.depts:[u.dept]),F('role','角色',m.role,'select',(u.role==='admin'?['member','manager','admin']:['member']).map(value=>({value,label:V.roles[value]}))),F('status','账号状态',m.status==='disabled'?'disabled':'active','select',[{value:'active',label:'开通'},{value:'disabled',label:'停用 / 拒绝申请'}])];
  }else if(o.mode==='invite'){title='邀请成员';fields=[F('dept','部门',u.dept,'select',u.role==='admin'?V.depts:[u.dept]),F('role','角色','member','select',(u.role==='admin'?['member','manager']:['member']).map(value=>({value,label:V.roles[value]})))];
  }else if(o.mode==='password'){title='修改密码';fields=[F('oldPassword','当前密码','','password'),F('password','新密码（至少 10 个字符）','','password'),F('confirm','再次输入新密码','','password')];}
  this.setData({title,fields:fieldList(fields),isTemplate:o.mode.startsWith('template-'),isMember:o.mode==='member'});if(o.mode==='event-new')this.assignments();
 },
 async loadMember(){try{const b=await V.api.call('members');this.member=b.members.find(m=>m.id===this.options.id);if(!this.member)throw Error('成员不存在');this.initialize()}catch(e){V.error(e)}},
 stepFields(s,i){const k='step'+i+'_';return [F(k+'name',`环节 ${i+1} · 名称`,s.name),F(k+'dept','建议部门',s.dept||this.snapshot.user.dept,'select',V.depts),F(k+'offset','相对开始日天数（可为负数）',s.offset??0,'signed'),F(k+'time','截止时间',s.time||'18:00','time'),F(k+'depends','前序环节编号（如 1,2；可空）',(s.depends||[]).map(j=>j+1).join(',')),F(k+'requirements','交付要求',s.requirements||'','textarea'),F(k+'rewardPoints','积分（空白沿用活动默认）',s.rewardPoints??'','number'),F(k+'rewardNote','其他奖励',s.rewardNote||'')];},
 values(){return Object.fromEntries(this.data.fields.map(f=>[f.key,f.value]))},
 change(e){const i=Number(e.currentTarget.dataset.index),f=this.data.fields[i];let value=e.detail.value;const fields=this.data.fields.slice();if(f.type==='select'){const n=Number(value);fields[i]={...f,selected:n,value:f.options[n].value,display:f.options[n].label}}else fields[i]={...f,value};this.setData({fields});if(f.key==='template')this.assignments();if(f.key==='date'){const vals=this.values();if(vals.endDate<value){const j=fields.findIndex(x=>x.key==='endDate');this.setData({[`fields[${j}].value`]:value})}}},
 assignments(){const d=this.values(),template=this.snapshot.templates.find(t=>t.id===d.template),people=this.snapshot.people.map(p=>({value:p.id,label:p.name+' · '+p.dept}));const fields=this.data.fields.filter(f=>!f.key.startsWith('assign'));if(template)template.steps.forEach((s,i)=>{fields.push(F('assign'+i+'_owner',`${s.name} · 负责人`,d['assign'+i+'_owner']||this.snapshot.people.find(p=>p.dept===s.dept)?.id||this.snapshot.user.id,'select',people),F('assign'+i+'_receiver','验收人',d['assign'+i+'_receiver']||this.snapshot.user.id,'select',people))});this.setData({fields:fieldList(fields),templateHint:template?`${template.steps.length} 个环节，复制后可单独调整。`:'只创建日程，不自动分配任务。'});},
 addStep(){if(this.data.stepCount>=30){V.error(Error('最多 30 个环节'));return}this.setData({fields:fieldList([...this.data.fields,...this.stepFields({},this.data.stepCount)]),stepCount:this.data.stepCount+1})},
 removeStep(){if(!this.data.stepCount)return;const i=this.data.stepCount-1;this.setData({fields:this.data.fields.filter(f=>!f.key.startsWith('step'+i+'_')),stepCount:i})},
 async save(){await V.action(this,async()=>{const d=this.values(),o=this.options;let path,data=d;
   if(o.mode==='event-new'){path='events/create';const t=this.snapshot.templates.find(t=>t.id===d.template);data={...d,assignments:(t?.steps||[]).map((_,i)=>({owner:d['assign'+i+'_owner'],receiver:d['assign'+i+'_receiver']}))}}
   else if(o.mode==='event-edit'){path='events/update';data={...d,id:o.id}}
   else if(o.mode==='task-new'||o.mode==='task-edit'){path=o.mode==='task-new'?'tasks/create':'tasks/action';data={...d,event:o.event,id:o.id,action:'assign',due:d.dueDate+'T'+d.dueTime,depends:d.depends||[]}}
   else if(o.mode.startsWith('template-')){path='templates/save';data={name:d.name,description:d.description,...(this.templateId?{id:this.templateId}:{}),steps:Array.from({length:this.data.stepCount},(_,i)=>{const k='step'+i+'_';return {name:d[k+'name'],dept:d[k+'dept'],offset:Number(d[k+'offset']),time:d[k+'time'],depends:d[k+'depends'].trim()?d[k+'depends'].split(/[,，]/).map(x=>Number(x.trim())-1):[],requirements:d[k+'requirements'],rewardPoints:d[k+'rewardPoints']===''?null:Number(d[k+'rewardPoints']),rewardNote:d[k+'rewardNote']}})}}
   else if(o.mode==='member'){path='members/update';data={...d,id:o.id}}
   else if(o.mode==='invite')path='invite';
   else if(o.mode==='password'){if(d.password!==d.confirm)throw Error('两次新密码不一致');path='password'}
   if(!path)throw Error('未知编辑模式');const result=await V.api.mutate(path,data);
   if(path==='invite'){this.setData({resultToken:result.token,tokenLabel:'邀请码（7 天内一次有效）'});return}
   wx.showToast({title:'已保存并同步'});wx.navigateBack();
 })},copy(){wx.setClipboardData({data:this.data.resultToken})},
 async resetMember(){await V.action(this,async()=>{const b=await V.api.call('reset-link',{id:this.options.id});this.setData({resultToken:b.token,tokenLabel:'密码重置码（24 小时内一次有效）'})})},
 onShareAppMessage(){return {title:'邀请加入冯如学媒',path:'/pages/auth/index?invite='+this.data.resultToken}}
}));
