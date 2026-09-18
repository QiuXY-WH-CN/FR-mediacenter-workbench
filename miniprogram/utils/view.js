const api=require('../services/api');
const depts=['办公室','新媒体运营部','视觉传达部','创意设计部'];
const statuses={pending:'待确认',active:'进行中',review:'待验收',blocked:'等待前序',done:'已完成',conflict:'时间冲突',revise:'待修改'};
const roles={admin:'管理员',manager:'部门负责人',member:'成员'};
const day=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const textDate=d=>(d||'').replace('T',' ');
const shift=(s,n)=>{const d=new Date(s.slice(0,10)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
function decorate(s){if(!s)return null;const names=Object.fromEntries(s.people.map(p=>[p.id,p.name]));const manager=['admin','manager'].includes(s.user.role);const events=s.events.map(e=>({...e,canEdit:s.user.role==='admin'||manager&&e.createdBy===s.user.id,dateLabel:textDate(e.date)+(e.allDay===false?' '+e.startTime:' · 全天'),taskCount:s.tasks.filter(t=>t.event===e.id).length}));const tasks=s.tasks.map(t=>({...t,eventName:s.events.find(e=>e.id===t.event)?.name||'',ownerName:names[t.owner]||'已停用成员',receiverName:names[t.receiver]||'已停用成员',statusLabel:statuses[t.status],dueLabel:textDate(t.due),isOwner:t.owner===s.user.id,isReviewer:t.receiver===s.user.id||s.user.role==='admin',canEdit:events.find(e=>e.id===t.event)?.canEdit||false}));return {...s,manager,events,tasks,names,roleLabel:roles[s.user.role]}}
function page(spec){const onLoad=spec.onLoad,onUnload=spec.onUnload,onShow=spec.onShow;return Object.assign({},spec,{
 onLoad(options){this.options=options;this.unsubscribe=api.subscribe(s=>{if(s)this.renderState?.(decorate(s));else{this.setData({ready:false});if(this.route!=='pages/auth/index')wx.reLaunch({url:'/pages/auth/index'})}});onLoad?.call(this,options)},
 async onShow(){if(!api.token()){wx.reLaunch({url:'/pages/auth/index'});return}const s=api.getState();if(s)this.renderState?.(decorate(s));try{await api.refresh();this.setData({syncError:''});await onShow?.call(this)}catch(e){this.setData({syncError:e.message});if(e.status===403)wx.reLaunch({url:'/pages/auth/index'})}},
 onUnload(){this.unsubscribe?.();onUnload?.call(this)},
 async onPullDownRefresh(){try{await api.refresh(true);this.setData({syncError:''})}catch(e){error(e)}finally{wx.stopPullDownRefresh()}},
 go(e){const url=e.currentTarget.dataset.url;if(['/pages/home/index','/pages/tasks/index','/pages/calendar/index','/pages/profile/index'].includes(url))wx.switchTab({url});else wx.navigateTo({url})},
 openTask(e){wx.navigateTo({url:'/pages/task/index?id='+e.currentTarget.dataset.id})},openEvent(e){wx.navigateTo({url:'/pages/event/index?id='+e.currentTarget.dataset.id})}
})}
function error(e){wx.showModal({title:'暂未完成',content:e.message||String(e),showCancel:false})}
async function action(owner,fn){if(owner.data.busy)return;owner.setData({busy:true});try{return await fn()}catch(e){error(e)}finally{owner.setData({busy:false})}}
function copy(url){if(!url)return;wx.setClipboardData({data:url,success:()=>wx.showModal({title:'链接已复制',content:'可粘贴到云盘客户端或浏览器中访问。小程序不能直接打开任意外部网页。',showCancel:false})})}
module.exports={api,depts,statuses,roles,day,shift,textDate,decorate,page,error,action,copy};
