import { cp, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

// Screenshot fixture only. No database, live API, cloud credential or real account is read.
const web = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(web, '..', 'miniprogram');
const require=createRequire(import.meta.url);
const fixture = join(web, '.local', 'manual-mini-fixture-v107');
const destination = join(web, 'sop', 'screenshots');
const cli = 'C:/Program Files (x86)/Tencent/微信web开发者工具/wechatide.cmd';
const quote = value => "'" + String(value).replace(/'/g, "''") + "'";
function official(tool, args = []) {
  const shell = process.env.PWSH || 'C:/Users/QiuXY/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe';
  const command = `& ${quote(cli)} -c Codex ${tool} ${args.map(quote).join(' ')}`;
  const result = spawnSync(shell, ['-NoProfile', '-Command', command], { encoding: 'utf8', timeout: 55000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  if (result.error) throw new Error(`${tool}: ${result.error.code || 'failed'}`);
  const raw = result.stdout || '';
  const offset = raw.indexOf('{');
  let parsed;
  try { parsed = JSON.parse(raw.slice(offset)); } catch { throw new Error(`${tool}: official CLI returned no JSON result`); }
  if (result.status !== 0 || parsed.ok === false || parsed.result?.success === false) {
    throw new Error(`${tool}: ${parsed.error?.code || parsed.result?.error?.code || parsed.message || parsed.result?.message || 'official tool failed'}`);
  }
  return parsed.result || parsed;
}
async function prepare() {
  await mkdir(fixture, { recursive: true });
  await mkdir(destination, { recursive: true });
  for (const part of ['pages', 'utils', 'components', 'templates', 'images']) await cp(join(source, part), join(fixture, part), { recursive: true });
  for (const part of ['app.json', 'app.wxss', 'sitemap.json']) await cp(join(source, part), join(fixture, part));
  const project = JSON.parse(await readFile(join(source, 'project.config.json'), 'utf8'));
  // Reuse the project's public AppID only to permit local simulator compilation.
  // The copied app/API never touches its accounts, cloud environment or live service.
  project.projectname = '冯如学媒手册 · 匿名离线样例';
  project.projectArchitecture = 'miniprogram';
  project.setting.urlCheck = false;
  await writeFile(join(fixture, 'project.config.json'), JSON.stringify(project, null, 2));
  await writeFile(join(fixture, 'config.js'), "module.exports={releaseVersion:'v1.0.7',transport:'direct',directBaseUrl:'https://example.invalid',pollMs:30000};\n");
  await mkdir(join(fixture, 'services'), { recursive: true });
  const departments = ['办公室', '新媒体运营部', '视觉传达部', '创意设计部'];
  const admin = { id: 'manual_admin', username: 'demo_admin', name: '示例管理员', role: 'admin', owner: true, dept: '', status: 'active', avatar: '', online: true };
  const people = [admin];
  departments.forEach((dept, index) => {
    people.push({id:`manual_lead_${index}`, username:`demo_lead_${index}`, name:['示例负责人甲','示例负责人乙','示例负责人丙','示例负责人丁'][index], dept, role:'manager', status:'active', avatar:'', online:index%2===0});
    people.push({id:`manual_member_${index}`,username:`demo_member_${index}`,name:['示例成员甲','示例成员乙','示例成员丙','示例成员丁'][index],dept,role:'member',status:'active',avatar:'',online:index%2!==0});
  });
  const day = '2026-10-09';
  const events = [{id:'manual_event', name:'示例 · 学媒开放日', date:day, endDate:day, allDay:false, startTime:'14:00', endTime:'17:00', department:'办公室', location:'示例活动室', description:'本活动及成员为离线匿名样例，用于说明操作流程。', requester:'示例对接人', createdBy:admin.id, updatedBy:'manual_lead_0',createdAt:'2026-10-01T09:00:00',updatedAt:'2026-10-05T15:00:00',canEditEvent:true,activation:'auto',recurrence:{frequency:'yearly',interval:1,end:'never'},recurrenceGroup:'manual_recurrence',seriesId:'news',cloudUrl:''},{id:'manual_future',name:'示例 · 明年迎新筹备',date:'2027-08-25',endDate:'2027-08-25',allDay:true,department:'',description:'远期日程，提前 7 天自动启用。',createdBy:admin.id,createdAt:'2026-10-09T10:00:00',activation:'auto',seriesId:'welcome',canEditEvent:true,cloudUrl:''}];
  const tasks = [
    {id:'manual_task_design', name:'示例 · 完成活动海报', status:'active', dept:'创意设计部', depts:['创意设计部'], priority:'high', due:day+'T12:00', requirements:'准备海报与源文件，并确认文案、尺寸和素材授权。', owners:['manual_member_3'], receivers:[admin.id,'manual_lead_3'], owner:'manual_member_3', receiver:admin.id, checks:['确认文案与尺寸','保留可编辑源文件'], rewardPoints:8, depends:[]},
    {id:'manual_task_story', name:'示例 · 整理活动文案', status:'review', dept:'新媒体运营部', depts:['新媒体运营部'], priority:'normal', due:day+'T15:00', requirements:'整理活动介绍与发布文案。', owners:['manual_member_1'], receivers:[admin.id], owner:'manual_member_1', receiver:admin.id, checks:['确认活动信息'], rewardPoints:4, submission:'示例成果已完成，待验收。', depends:[]},
    {id:'manual_task_photo', name:'示例 · 精选照片归档', status:'done', dept:'视觉传达部', depts:['视觉传达部'], priority:'normal', due:day+'T18:00', requirements:'按规范命名并整理精选照片。', owners:['manual_member_2'], receivers:[admin.id], owner:'manual_member_2', receiver:admin.id, checks:['确认授权'], rewardPoints:6, submission:'示例归档记录，仅用于手册展示。', depends:[]}
  ].map(task=>({...task,event:'manual_event',scheduleEnabled:true,reward:'',feedback:'',link:''}));
  tasks.push({id:'manual_future_task',event:'manual_future',name:'示例 · 迎新推送协作',status:'pending',dept:'办公室',depts:['办公室','创意设计部'],owners:['manual_member_0','manual_member_3'],receivers:['manual_lead_0','manual_lead_3'],priority:'normal',due:'2027-08-23T18:00',requirements:'收集迎新素材并准备封面。',checks:['核对资料'],rewardPoints:12,depends:[],scheduleEnabled:false});
  const templates=[require(join(source,'utils','template-policy.js')).optimizeTemplate({id:'manual_template',name:'示例 · 新闻推送协作',description:'办公室收集素材、创设设计封面，新媒体撰写文案并排版。',steps:[{name:'推送素材收集',dept:'办公室',offset:-3,time:'18:00',depends:[],rewardPoints:6},{name:'推送封面设计',dept:'创意设计部',offset:-2,time:'18:00',depends:[0],rewardPoints:8},{name:'推送文案撰写',dept:'新媒体运营部',offset:-1,time:'18:00',depends:[0],rewardPoints:8},{name:'推送排版',dept:'新媒体运营部',offset:0,time:'18:00',depends:[1,2],rewardPoints:10}]})];
  const series=require(join(source,'utils','schedule-model.js')).defaultSeries.map(item=>({...item,goals:item.id==='news'?[{id:'manual_goal_news',academicYear:'2026-2027',department:'新媒体运营部',name:'示例 · 新闻推送目标',metric:'events',target:24,completed:6,progress:25}]:item.id==='welcome'?[{id:'manual_goal_design',academicYear:'2026-2027',department:'创意设计部',name:'示例 · 迎新文创设计目标',metric:'designs',target:10,completed:3,progress:30}]:[]}));
  const state={version:'v1.0.7',user:admin,people,events,tasks,series,settings:{language:'zh-CN',fontScale:1,themeColor:'#e77b24',appearance:'light',motion:true,particles:'fireflies',particleDensity:25,rotationMinutes:5,workspace:'',particleSystem:{}},notices:[{text:'当前为匿名离线手册样例，不连接真实账号或任务。'}],ledger:[{id:'manual_ledger',task:'manual_task_photo',taskName:'示例 · 精选照片归档',eventName:'示例 · 学媒开放日',user:'manual_member_2',points:6,time:'2026-10-09T18:00:00'}],templates,ranking:[{id:'manual_member_2',name:'示例成员丙',dept:'视觉传达部',points:6}]};
  await writeFile(join(fixture, 'services', 'manual-state.js'), 'module.exports='+JSON.stringify(state)+';\n');
  await writeFile(join(fixture, 'services', 'api.js'), `const fixture=require('./manual-state');let session=false;let current=null;const listeners=new Set();function copy(value){return JSON.parse(JSON.stringify(value))}function notify(){for(const fn of listeners)fn(current)}function token(){return session?'manual_isolated_session':''}async function refresh(){if(!session)return null;current=copy(fixture);notify();return current}async function call(path,data){if(path==='info')return {initialized:true,version:'v1.0.7',reviewMode:false,user:session?copy(fixture.user):null};if(path==='login'){session=true;return {ok:true}}if(path==='members')return {members:copy(fixture.people),reviews:[]};if(path==='state')return copy(fixture);if(path==='wechat/status')return {bound:false};if(path==='captcha')return {required:false,failures:0,retryAfter:0,locked:false};if(path==='presence')return {online:true};if(path==='logout'){clear();return {ok:true}}if(path==='settings/save'){fixture.settings={...fixture.settings,...data};return {ok:true}}throw Error('匿名手册样例禁止此操作，不连接生产服务。')}function clear(){session=false;current=null;notify()}module.exports={call,refresh,mutate:async(path,data)=>{const result=await call(path,data);await refresh();return result},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},config:()=>({releaseVersion:'v1.0.7',transport:'direct',directBaseUrl:'https://example.invalid',pollMs:30000}),token,getState:()=>current,isReadOnly:()=>false,clear,discardSnapshot:()=>{current=null},setConnection:()=>{},info:()=>call('info'),manualSession:async()=>{session=true;return refresh()}};\n`);
  await writeFile(join(fixture, 'app.js'), "const api=require('./services/api');App({pendingAuth:{},onLaunch(){this.publicPreview=false},manualSession(){return api.manualSession()}});\n");
  // The normal page and controls are unchanged; remembered-credential I/O is stubbed.
  await writeFile(join(fixture,'utils','login-memory.js'),"module.exports={supported:()=>false,option:()=>({remember:false,username:''}),load:async()=>({remember:false,username:'',password:'',secure:false}),success:async()=>false,forget:()=>{},forgetPassword:()=>{},switchAccount:()=>{},realm:()=> 'anonymous-offline-fixture'};\n");
  console.log('Prepared isolated native fixture; real storage, accounts, database and requests are not used.');
}
async function capture() {
  const status=official('check_wechatide_status',['--skill-version','0.3.9']);
  if(status.loginExpired||status.tokenRequired||!['equal','agent_ahead'].includes(status.versionRelation))throw Error('Official WeChat IDE readiness check did not pass.');
  if(!process.argv.includes('--resume')){
    official('open_project_window',['--project',fixture,'--window-mode','fullMode']);
    official('simulator_refresh',['--project',fixture]);
  }
  const shot=(file,selector)=>official('simulator_screenshot',['--project',fixture,'--path',join(destination,file),'--optimize','false','--wait-for-selector',selector,'--wait','1']);
  const navigate=(url,action='navigateTo')=>official('automation_navigate',['--project',fixture,'--action',action,'--url',url]);
  if(!process.argv.includes('--new-pages')){
  if(!process.argv.includes('--resume'))navigate('/pages/auth/index','reLaunch');
  shot('01-小程序登录与记住选项.png','.auth-page');
  official('automation_evaluate',['--project',fixture,'--fn-source','async function(){await getApp().manualSession();return {anonymous:true};}']);
  navigate('/pages/home/index','switchTab');shot('02-小程序工作台与任务层级.png','.page');
  navigate('/pages/task/index?id=manual_task_design');shot('03-小程序任务详情与代交付.png','.page');
  navigate('/pages/calendar/index','switchTab');official('automation_viewport_action',['--project',fixture,'--action','pageScrollTo','--scroll-top','530','--wait-for-selector','.calendar-child']);shot('04-小程序日历与灰色归档.png','.page');
  navigate('/pages/profile/index','switchTab');shot('05-小程序我的与个人中心.png','.page');
  navigate('/pages/profile/preferences');official('automation_evaluate',['--project',fixture,'--fn-source',"function(){getCurrentPages().slice(-1)[0].tab({currentTarget:{dataset:{id:'appearance'}}});return {anonymous:true};}"]);shot('06-小程序外观与粒子设置.png','.settings-page');
  navigate('/pages/security/index');shot('07-小程序本机安全中心.png','.page');
  navigate('/pages/members/index');official('automation_evaluate',['--project',fixture,'--fn-source',"function(){getCurrentPages().slice(-1)[0].department({currentTarget:{dataset:{dept:'创意设计部'}}});return {anonymous:true};}"]);
  official('automation_evaluate',['--project',fixture,'--fn-source',"function(){const p=getCurrentPages().slice(-1)[0],s=p.orgScene;const n=s.nodes.filter(x=>x.dept==='创意设计部');const x=n.reduce((a,b)=>a+b.x,0)/n.length,y=n.reduce((a,b)=>a+b.y,0)/n.length;s.view.zoom=0.9;s.view.x=(p.boardSize.width/2)-x*0.9;s.view.y=(p.boardSize.height/2)-y*0.9;p.publishScene(true);return {anonymous:true,zoom:90};}"]);
  shot('08-小程序组织架构与在线状态.png','.org105-board');
  }
  if(process.argv.includes('--new-pages'))official('automation_evaluate',['--project',fixture,'--fn-source','async function(){await getApp().manualSession();return {anonymous:true};}']);
  // Select the template through its actual picker; ampersands are not forwarded safely by the Windows batch CLI.
  navigate('/pages/editor/index?mode=event-new');
  official('automation_evaluate',['--project',fixture,'--fn-source',"function(){const p=getCurrentPages().slice(-1)[0];for(const [key,value] of [['template','manual_template'],['name','示例 · 年度新闻推送'],['repeatFrequency','yearly'],['repeatEnd','count'],['repeatCount','3']]){const index=p.data.fields.findIndex(f=>f.key===key),field=p.data.fields[index];p.change({currentTarget:{dataset:{index}},detail:{value:field.type==='select'?String(field.options.findIndex(o=>o.value===value)):value}})}return {anonymous:true};}"]);
  official('automation_evaluate',['--project',fixture,'--fn-source',"async function(){const p=getCurrentPages().slice(-1)[0],index=p.data.fields.findIndex(f=>f.key==='activation');await new Promise(resolve=>wx.createSelectorQuery().selectAll('.field').boundingClientRect().selectViewport().scrollOffset().exec(result=>wx.pageScrollTo({scrollTop:result[0][index].top+result[1].scrollTop-30,duration:0,complete:resolve})));return {anonymous:true};}"]);shot('09-小程序日程重复与部门派单.png','.editor-fields');
  official('automation_evaluate',['--project',fixture,'--fn-source',"async function(){const p=getCurrentPages().slice(-1)[0],index=p.data.fields.findIndex(f=>f.key==='assign0_owners');p.togglePersonChoice({currentTarget:{dataset:{index,value:'manual_member_3'}}});p.togglePerson({currentTarget:{dataset:{index}}});await new Promise(resolve=>wx.createSelectorQuery().selectAll('.field').boundingClientRect().selectViewport().scrollOffset().exec(result=>wx.pageScrollTo({scrollTop:result[0][index].top+result[1].scrollTop-30,duration:0,complete:resolve})));return {anonymous:true};}"]);shot('12-小程序部门协作派单.png','.person-menu');
  navigate('/pages/rewards/index');official('automation_evaluate',['--project',fixture,'--fn-source',"function(){const p=getCurrentPages().slice(-1)[0];p.tab({currentTarget:{dataset:{id:'series'}}});p.search({detail:{value:'新闻'}});return {anonymous:true};}"]);shot('10-小程序系列与年度目标.png','.series-card');
  navigate('/pages/calendar/index','switchTab');official('automation_evaluate',['--project',fixture,'--fn-source',"function(){getCurrentPages().slice(-1)[0].mode({currentTarget:{dataset:{id:'timeline'}}});wx.pageScrollTo({scrollTop:0,duration:0});return {anonymous:true};}"]);shot('11-小程序时间轴与当前时间线.png','.calendar-timeline');
  console.log('Captured 12 actual native simulator screenshots using anonymous offline fixture data.');
}
async function pruneOld(){
  const current=['01-小程序登录与记住选项.png','02-小程序工作台与任务层级.png','03-小程序任务详情与代交付.png','04-小程序日历与灰色归档.png','05-小程序我的与个人中心.png','06-小程序外观与粒子设置.png','07-小程序本机安全中心.png','08-小程序组织架构与在线状态.png','09-小程序日程重复与部门派单.png','10-小程序系列与年度目标.png','11-小程序时间轴与当前时间线.png','12-小程序部门协作派单.png'];
  for(const name of current){const bytes=await readFile(join(destination,name));if(bytes.length<10000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('The 12 current native screenshots must exist before old screenshots are removed.');}
  const old=['01-部门与成员级联选择.png','02-大任务与子任务展开.png','03-部门组织网络与成员名单.png','04-管理员资料审核.png','05-创意设计部门紫色日历.png','06-成果归档与贡献积分.png'];
  const backup=join(web,'.local','manual-previous-screenshots');await mkdir(backup,{recursive:true});
  for(const name of old){const path=join(destination,name);try{await cp(path,join(backup,name));await unlink(path)}catch(error){if(error.code!=='ENOENT')throw error;}}
  console.log('Verified 12 native PNGs. Previous 6 screenshots moved to ignored local backup; they are excluded from the built guide.');
}
if(process.argv.includes('--capture'))await capture();else if(process.argv.includes('--prepare'))await prepare();else if(process.argv.includes('--prune-old'))await pruneOld();else throw Error('Use --prepare, then --capture and --prune-old. Never upload the fixture.');
