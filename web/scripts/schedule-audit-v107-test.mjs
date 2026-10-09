import assert from 'node:assert/strict';
import ScheduleModel from '../../miniprogram/utils/schedule-model.js';
import TemplatePolicy from '../../miniprogram/utils/template-policy.js';
import {registerRecurrence,expandRecurrences,recurringPlan,updateScheduleEvents} from '../src/schedule-workflows.js';

// Pure, synthetic workspaces: this audit never opens a database or a real account.
const user={id:'synthetic-admin',name:'测试管理员',role:'admin'},now=new Date('2026-10-09T00:00:00Z');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const h={fail,canManageEvent:()=>true};
const fields=(e,extra={})=>({name:e.name,date:e.date,endDate:e.endDate,department:e.department,activation:e.activation,recurrence:e.recurrence,seriesId:e.seriesId,...extra});
function series(recurrence){
 const event={id:'seed',name:'合成日程',date:'2026-10-05',endDate:'2026-10-05',department:'',activation:'auto',recurrence,seriesId:'',createdBy:user.id};
 const state={events:[event],tasks:[],series:[],recurrenceRules:[]};
 registerRecurrence(state,event);expandRecurrences(state,user,[],fail,now);return state;
}
for(const oldRule of [
 {frequency:'weekly',interval:2,weekdays:[1,3],end:'count',count:8},
 {frequency:'monthly',interval:1,end:'count',count:8}
]){
 const s=series(oldRule),oldGroup=s.events[0].recurrenceGroup;
 const event=s.events.find(e=>e.occurrenceIndex===3),older=s.events.filter(e=>e.occurrenceIndex<3).map(e=>({id:e.id,date:e.date}));
 updateScheduleEvents(s,event,fields(event,{recurrence:{frequency:'daily',interval:1,end:'count',count:3}}),{scope:'future'},user,h);
 const oldConfig=s.recurrenceRules.find(r=>r.id===oldGroup);
 assert.equal(oldConfig.recurrence.frequency,oldRule.frequency,'Splitting a series preserves its old frequency');
 assert.equal(oldConfig.recurrence.interval,oldRule.interval,'Splitting a series preserves its old interval');
 assert.deepEqual(oldConfig.recurrence.weekdays,oldRule.weekdays,'Splitting a series preserves selected weekdays');
 assert.equal(oldConfig.recurrence.until,ScheduleModel.shift(event.date,-1));
 expandRecurrences(s,user,[],fail,now);
 assert.deepEqual(s.events.filter(e=>e.recurrenceGroup===oldGroup).map(e=>({id:e.id,date:e.date})),older,'No extra occurrences may appear before a changed future rule');
 assert.equal(s.events.filter(e=>e.recurrenceGroup===event.recurrenceGroup).length,3);
 assert.equal(recurringPlan(s,now).length,0,'Repeated maintenance is idempotent after splitting');
}
{
 const s=series({frequency:'weekly',interval:2,weekdays:[1,3],end:'count',count:8}),seed=s.events[0],oldGroup=seed.recurrenceGroup;
 updateScheduleEvents(s,seed,fields(seed,{recurrence:{frequency:'monthly',interval:1,end:'count',count:3}}),{scope:'series'},user,h);
 expandRecurrences(s,user,[],fail,now);
 assert.ok(!s.events.some(e=>e.recurrenceGroup===oldGroup),'Replacing the entire series must not resurrect old dates');
 assert.equal(s.events.length,3);assert.equal(recurringPlan(s,now).length,0);
}
{
 const s=series({frequency:'weekly',interval:1,end:'count',count:4}),selected=s.events.find(e=>e.occurrenceIndex===1),oldGroup=selected.recurrenceGroup;
 const oldDate=selected.date,newDate=ScheduleModel.shift(oldDate,1);
 updateScheduleEvents(s,selected,fields(selected,{date:newDate,endDate:newDate}),{scope:'this'},user,h);
 expandRecurrences(s,user,[],fail,now);
 assert.equal(selected.recurrenceGroup,undefined);assert.equal(selected.recurrence.frequency,'none');
 assert.ok(!s.events.some(e=>e.recurrenceGroup===oldGroup&&e.date===oldDate),'Moving one instance cannot regenerate its old date');
 assert.equal(s.events.length,4);
}
assert.deepEqual(ScheduleModel.occurrenceDates('2027-01-31',{frequency:'monthly',interval:1,end:'count',count:3}),['2027-01-31','2027-02-28','2027-03-31']);
assert.deepEqual(ScheduleModel.occurrenceDates('2026-10-04',{frequency:'weekly',interval:2,weekdays:[1,3],end:'count',count:5}),['2026-10-04','2026-10-05','2026-10-07','2026-10-19','2026-10-21']);
const template=TemplatePolicy.optimizeTemplate({steps:[{name:'视频脚本与分镜',dept:'新媒体运营部',offset:-2,depends:[],videoPointsAbove:30},{name:'视频素材拍摄',dept:'视觉传达部',offset:0,depends:[0],rewardPoints:30},{name:'视频剪辑与提审',dept:'视觉传达部',offset:2,depends:[1],rewardPoints:30}]});
const applicable=TemplatePolicy.applicableSteps(template,{rewardPoints:30}),indices=new Set(applicable.map(x=>x.index));
assert.ok(!applicable.some(x=>x.step.videoPointsAbove));
for(const {step} of applicable)assert.ok(step.depends.filter(i=>indices.has(i)).every(i=>applicable.some(x=>x.index===i)),'Conditional stages keep original dependency indices');
const from='2026-10-09',horizon=ScheduleModel.shift(from,90),ancient='1980-01-01';
const oldDaily=ScheduleModel.occurrenceWindow(ancient,{frequency:'daily',interval:1,end:'never'},from,horizon);
assert.equal(oldDaily.length,91);assert.equal(oldDaily[0].date,from);assert.equal(oldDaily.at(-1).date,horizon);
assert.equal(oldDaily[0].index,Math.round((Date.parse(from)-Date.parse(ancient))/ScheduleModel.DAY));assert.ok(oldDaily[0].index>1000);
assert.deepEqual(ScheduleModel.occurrenceWindow(ancient,{frequency:'daily',interval:1,end:'date',until:'2020-12-31'},from,horizon),[],'Ended historic rules do not backfill old tasks');
assert.equal(ScheduleModel.occurrenceWindow(ancient,{frequency:'daily',interval:1,end:'count',count:100},from,horizon).length,100,'Explicit bounded counts retain all instances');
assert.deepEqual(ScheduleModel.occurrenceWindow('2000-01-31',{frequency:'monthly',interval:1,end:'never'},from,horizon),[{date:'2026-10-31',index:321},{date:'2026-11-30',index:322},{date:'2026-12-31',index:323}]);
assert.deepEqual(ScheduleModel.occurrenceWindow('2000-02-29',{frequency:'yearly',interval:1,end:'never'},from,horizon),[{date:'2027-02-28',index:27}],'An old annual anchor exposes the next occurrence beyond the rolling horizon');
assert.deepEqual(ScheduleModel.occurrenceWindow('2030-02-28',{frequency:'yearly',interval:1,end:'never'},from,horizon),[{date:'2031-02-28',index:1}],'A future annual seed retains its next annual occurrence');
for(let seedDay=0;seedDay<7;seedDay++)for(const interval of [1,2,7])for(const weekdays of [[1,3],[0,6],[seedDay],[0,1,2,3,4,5,6]]){
 const seed=ScheduleModel.shift('2020-01-05',seedDay),rule={frequency:'weekly',interval,weekdays,end:'never'};
 const expected=ScheduleModel.occurrenceDates(seed,rule,horizon,10000).map((date,index)=>({date,index})).filter(x=>x.date>=from&&x.date<=horizon);
 assert.deepEqual(ScheduleModel.occurrenceWindow(seed,rule,from,horizon),expected,'Weekly seeks must preserve indices for every seed weekday and interval');
}
{
 const event={id:'old-seed',name:'长期日程',date:ancient,endDate:ancient,recurrence:{frequency:'daily',interval:1,end:'never'},createdBy:user.id},s={events:[event],tasks:[],series:[],recurrenceRules:[]};
 registerRecurrence(s,event);const rule=s.recurrenceRules[0];rule.excluded.push(oldDaily[3].index);
 const before=performance.now();expandRecurrences(s,user,[],fail,now);assert.ok(performance.now()-before<1000,'Decades-old rules must seek in bounded time');
 assert.equal(s.events.length,91,'Only seed plus the current 90-day window is materialized');
 assert.ok(s.events.every(e=>e.id===event.id||e.date>=from&&e.date<=horizon));
 assert.ok(!s.events.some(e=>e.occurrenceIndex===oldDaily[3].index),'Excluded original indices survive long-term window seeks');
 assert.equal(recurringPlan(s,now).length,0);const tomorrow=new Date('2026-10-10T00:00:00Z');
 assert.equal(recurringPlan(s,tomorrow).length,1,'Advancing one day extends the rolling window by one instance');
 expandRecurrences(s,user,[],fail,tomorrow);assert.equal(s.events.length,92);assert.equal(recurringPlan(s,tomorrow).length,0);
}
console.log('PASS independent schedule audit: future/full/single scopes, stable weekly indices, calendar edges, conditional dependencies and bounded multi-decade daily/monthly/yearly recurrence windows.');
