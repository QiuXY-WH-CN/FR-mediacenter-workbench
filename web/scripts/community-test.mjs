import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const port=8878,base=`http://127.0.0.1:${port}`,password='Community-test-2026!';
const server=spawn(process.execPath,['scripts/dev.mjs'],{env:{...process.env,PORT:String(port),DB_PATH:':memory:',BOOTSTRAP_HASH:createHash('sha256').update('community-test').digest('hex')},windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{if(b.toString().includes('Local:'))resolve()});server.on('error',reject);server.on('exit',code=>reject(Error('server '+code)))});
 browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1360,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/#setup=community-test');
 await page.locator('[name=username]').fill('guide_admin');await page.locator('[name=name]').fill('示例负责人');await page.locator('[name=password]').fill(password);await page.locator('[name=confirm]').fill(password);await page.getByRole('button',{name:'创建管理员账号'}).click();await page.getByRole('heading',{name:'示例负责人，欢迎回来。'}).waitFor();
 await page.evaluate(async password=>{for(const [i,dept] of ['办公室','新媒体运营部','视觉传达部','创意设计部'].entries()){await baseApi('login',{username:'guide_admin',password});const invitation=await baseApi('invite',{dept,role:'member'});await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json','X-FR-Request':'1'},body:JSON.stringify({username:'guide_member_'+i,name:['办公室伙伴','新媒体伙伴','摄影伙伴','创设伙伴'][i],dept,password,invite:invitation.token})});}},password);
 // Registration signs in its applicant: restore the administrator session.
 await page.evaluate(async password=>{await baseApi('login',{username:'guide_admin',password});await refresh()},password);
 await mkdir('sop/screenshots',{recursive:true});
 const screenshot=async name=>{await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});await page.screenshot({path:'sop/screenshots/'+name+'.png',fullPage:false,animations:'disabled'})};
 await page.locator('[data-create]').first().click();await page.locator('[name=name]').fill('书院宣传周');await page.locator('[name=date]').fill('2026-10-10');await page.locator('[name=endDate]').fill('2026-10-12');
 const requester=page.locator('.person-cascade').filter({has:page.locator('[data-value=other]')});await requester.locator(':scope > summary').click();await requester.locator('.cascade-department').filter({hasText:'创意设计部'}).locator('summary').click();await screenshot('01-部门与成员级联选择');await requester.getByRole('button',{name:'创设伙伴',exact:true}).click();
 await page.getByRole('button',{name:'创建活动',exact:true}).click();await page.locator('dialog').waitFor({state:'hidden'});
 const eventId=await page.evaluate(()=>state.events[0].id);
 await page.evaluate(async event=>{const p=state.people.find(p=>p.dept==='创意设计部');await api('tasks/create',{event,name:'设计主视觉海报',owner:user.id,receiver:user.id,due:'2026-10-09T18:00',requirements:'交付主视觉与可编辑源文件',rewardPoints:20});await api('tasks/create',{event,name:'创设源文件归档',owner:p.id,receiver:user.id,due:'2026-10-12T18:00',requirements:'整理设计源文件',rewardPoints:10})},eventId);
 await page.locator('[data-view=tasks]').click();await page.locator('.task-group').waitFor();await screenshot('02-大任务与子任务展开');await page.locator('.task-group > summary').click();assert.equal(await page.locator('.task-group').getAttribute('open'),null);await page.locator('.task-group > summary').click();
 await page.locator('[data-view=members]').first().click();await page.locator('.org-node').first().waitFor();assert.equal(await page.locator('.org-department').count(),4);await screenshot('03-部门组织网络与成员名单');await page.locator('[data-org-dept="创意设计部"]').click();assert.equal(await page.locator('main .panel').filter({has:page.getByRole('heading',{name:/创意设计部/})}).count(),1);await page.locator('[data-org-dept=""]').click();
 await page.locator('[data-profile]').first().click();await page.locator('[name=name]').fill('示例新姓名');await page.locator('[data-profile-save]').click();await page.locator('dialog').waitFor({state:'hidden'});await page.locator('[data-profile-review]').first().waitFor();await screenshot('04-管理员资料审核');assert.equal(await page.evaluate(()=>user.name),'示例负责人');await page.locator('[data-decision=approve]').click();await page.waitForFunction(()=>user.name==='示例新姓名');
 await page.locator('[data-view=calendar]').first().click();await page.locator('[data-calendar-dept]').first().selectOption('创意设计部');await screenshot('05-创意设计部门紫色日历');
 await page.locator('[data-view=rewards]').first().click();await screenshot('06-成果归档与贡献积分');
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await context.storageState(),reducedMotion:'reduce'}),phone=await mobile.newPage();await phone.goto(base);await phone.locator('[data-view=members]').first().click();await phone.locator('.org-node').first().waitFor();assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Organization must fit mobile');await mkdir('.local/qa',{recursive:true});await phone.screenshot({path:'.local/qa/mobile-organization.png',fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);await writeFile('.local/qa/community-result.json',JSON.stringify({passed:true,checks:['department cascader','parent task expansion','organization permission','profile review','purple calendar','contribution archive','mobile organization'],errors},null,2));console.log('PASS: community features and six real interface guide screenshots.');
}finally{await browser?.close();server.kill()}
