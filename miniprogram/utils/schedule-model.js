const DAY=86400000;
const defaultSeries=[
 {id:'dean-dialogue',name:'院长有约',description:'院长交流与专题访谈'},
 {id:'fengru-friends',name:'冯如朋友圈',description:'人物与校园生活'},
 {id:'fengxiaoru-stories',name:'冯小如身边事',description:'书院日常与学生故事'},
 {id:'college-visits',name:'书院互访',description:'书院交流活动'},
 {id:'welcome',name:'迎新系列',description:'迎新报道与入学服务'},
 {id:'party-building',name:'冯如党建',description:'党建活动与专题报道'},
 {id:'news',name:'新闻',description:'活动新闻与综合报道'}
];
function today(now=new Date()){const value=new Date(now);return new Date(value.getTime()+8*3600000).toISOString().slice(0,10)}
function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value}
function shift(value,days){const d=new Date(value.slice(0,10)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)+value.slice(10)}
function enabled(event={},now=new Date()){if(event.activation==='paused')return false;if(event.activation==='active')return true;const day=typeof now==='string'&&validDate(now)?now:today(now);return !validDate(event.date)||event.date<=shift(day,7)}
function state(event={},now=new Date(),tasks=[]){if(tasks.length&&tasks.every(t=>t.status==='done'))return 'archived';return event.activation==='paused'?'paused':enabled(event,now)?'active':'scheduled'}
function academicYear(date=today()){const d=String(date),year=Number(d.slice(0,4)),start=Number(d.slice(5,7))>=9?year:year-1;return start+'-'+(start+1)}
function normalizeRecurrence(input,fail){const invalid=message=>{if(fail)fail(400,message);throw Error(message)};if(input==null||input==='none'||input.frequency==='none')return {frequency:'none'};if(typeof input!=='object'||Array.isArray(input))invalid('重复设置无效');const frequency=input.frequency,interval=input.interval===undefined?1:input.interval;if(!['daily','weekly','monthly','yearly'].includes(frequency)||!Number.isInteger(interval)||interval<1||interval>99)invalid('重复频率或间隔无效');const end=input.end||'never';if(!['never','date','count'].includes(end))invalid('重复结束条件无效');const out={frequency,interval,end};if(end==='date'){if(!validDate(input.until))invalid('重复结束日期无效');out.until=input.until}if(end==='count'){if(!Number.isInteger(input.count)||input.count<2||input.count>100)invalid('重复次数须为 2—100 次');out.count=input.count}if(input.weekdays!==undefined){if(frequency!=='weekly'||!Array.isArray(input.weekdays)||!input.weekdays.length||input.weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)||new Set(input.weekdays).size!==input.weekdays.length)invalid('请选择有效的重复星期');out.weekdays=[...input.weekdays].sort()}return out}
function recurrenceLabel(rule={},english=false){if(!rule.frequency||rule.frequency==='none')return english?'Never':'不重复';const n=rule.interval||1,unit={daily:['天','day'],weekly:['周','week'],monthly:['月','month'],yearly:['年','year']}[rule.frequency];if(!unit)return '';let label=english?'Every '+(n===1?'':n+' ')+unit[1]+(n===1?'':'s'):'每'+(n===1?'':n)+unit[0];if(rule.end==='count')label+=english?' · '+rule.count+' occurrences':' · 共 '+rule.count+' 次';if(rule.end==='date')label+=' · '+rule.until;return label}
function monthDate(seed,months){const base=new Date(seed+'T12:00:00Z'),year=base.getUTCFullYear(),month=base.getUTCMonth()+months,day=base.getUTCDate(),last=new Date(Date.UTC(year,month+1,0,12)).getUTCDate();return new Date(Date.UTC(year,month,Math.min(day,last),12)).toISOString().slice(0,10)}
// Dates are anchored to the original day: January 31 -> February 28 -> March 31.
function occurrenceDates(seed,rule={},horizon=shift(seed,90),maximum=1000){if(!validDate(seed))return [];if(!rule.frequency||rule.frequency==='none')return [seed];const out=[seed],interval=rule.interval||1,end=rule.end||'never',limit=end==='count'?rule.count:maximum;let candidate=seed;for(let index=1;out.length<limit&&index<36600;index++){if(rule.frequency==='daily')candidate=shift(seed,index*interval);else if(rule.frequency==='monthly')candidate=monthDate(seed,index*interval);else if(rule.frequency==='yearly')candidate=monthDate(seed,index*interval*12);else{candidate=shift(seed,index);const weekday=new Date(candidate+'T12:00:00Z').getUTCDay(),week=Math.floor((index+new Date(seed+'T12:00:00Z').getUTCDay())/7);if(rule.weekdays?.length){if(week%interval!==0||!rule.weekdays.includes(weekday))continue}else if(index%(7*interval)!==0)continue}if(end==='date'&&candidate>rule.until)break;if(end!=='count'&&candidate>horizon&&out.length>1)break;out.push(candidate);if(out.length>=maximum)break}return out}
// Seek directly to the current window. Indices remain anchored to the original
// rule, so excluded instances and existing history do not change after years.
function occurrenceWindow(seed,rule={},from=today(),horizon=shift(from,90),maximum=1000){
 if(!validDate(seed)||!validDate(from)||!validDate(horizon)||horizon<from)return [];
 if(rule.end==='count')return occurrenceDates(seed,rule,horizon,Math.min(maximum,100)).map((date,index)=>({date,index}));
 if(!rule.frequency||rule.frequency==='none')return seed>=from&&seed<=horizon?[{date:seed,index:0}]:[];
 const interval=rule.interval||1,out=[],limit=rule.end==='date'&&validDate(rule.until)?rule.until:null;
 const accept=(date,index)=>{if(!validDate(date)||limit&&date>limit)return false;if(date>=from&&date<=horizon&&out.length<maximum)out.push({date,index});return true};
 const days=Math.max(0,Math.ceil((Date.parse(from)-Date.parse(seed))/DAY));
 if(rule.frequency==='daily'||rule.frequency==='weekly'&&!rule.weekdays?.length){
  const period=interval*(rule.frequency==='weekly'?7:1),start=Math.ceil(days/period);
  for(let index=start;out.length<maximum;index++){const date=shift(seed,index*period);if(date>horizon||!accept(date,index))break;}return out;
 }
 if(rule.frequency==='weekly'){
  const selected=rule.weekdays,seedWeekday=new Date(seed+'T12:00:00Z').getUTCDay(),tail=selected.filter(d=>d>seedWeekday).length;
  if(seed>=from&&seed<=horizon)accept(seed,0);
  for(let delta=Math.max(1,days);out.length<maximum;delta++){
   const date=shift(seed,delta);if(date>horizon||limit&&date>limit)break;
   const weekday=new Date(date+'T12:00:00Z').getUTCDay(),week=Math.floor((delta+seedWeekday)/7);
   if(week%interval!==0||!selected.includes(weekday))continue;
   const index=week===0?selected.filter(d=>d>seedWeekday&&d<=weekday).length:tail+Math.floor((week-1)/interval)*selected.length+selected.filter(d=>d<=weekday).length;
   accept(date,index);
  }return out;
 }
 if(rule.frequency==='monthly'||rule.frequency==='yearly'){
  const period=interval*(rule.frequency==='yearly'?12:1),monthDelta=(Number(from.slice(0,4))-Number(seed.slice(0,4)))*12+Number(from.slice(5,7))-Number(seed.slice(5,7));
  let index=Math.max(0,Math.floor(monthDelta/period)),date=monthDate(seed,index*period);
  if(date<from){index++;date=monthDate(seed,index*period)}
  for(;out.length<maximum;index++,date=monthDate(seed,index*period)){
   if(!validDate(date)||limit&&date>limit)break;
   if(date>horizon){
    // Keep an upcoming annual instance available even beyond the 90-day window.
    if(rule.frequency==='yearly'&&!out.some(x=>x.index>0)){if(index===0){index=1;date=monthDate(seed,period)}if(validDate(date)&&(!limit||date<=limit))out.push({date,index});}
    break;
   }
   accept(date,index);
  }return out;
 }
 return [];
}
function taskEnabled(task,event,now=new Date()){return task.scheduleEnabled===false?false:enabled(event,now)}
module.exports={DAY,defaultSeries,today,validDate,shift,enabled,state,academicYear,normalizeRecurrence,recurrenceLabel,occurrenceDates,occurrenceWindow,taskEnabled};
