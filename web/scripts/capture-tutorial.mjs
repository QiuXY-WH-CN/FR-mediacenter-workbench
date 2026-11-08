import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const PLAYWRIGHT_MODULE = process.env.PLAYWRIGHT_MODULE;
const {chromium} = PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(PLAYWRIGHT_MODULE).href)
  : await import('playwright');

const port = Number(process.env.TUTORIAL_PORT || 8921);
const base = `http://127.0.0.1:${port}`;
const setupToken = 'tutorial-isolated-fixture';
const server = spawn(process.execPath, ['scripts/dev.mjs'], {
  env: {...process.env, HOST: '127.0.0.1', PORT: String(port), DB_PATH: ':memory:',
    BOOTSTRAP_HASH: createHash('sha256').update(setupToken).digest('hex')},
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});

const out = 'sop/screenshots';
await mkdir(out, {recursive: true});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Isolated server startup timed out')), 20000);
    server.stdout.on('data', (chunk) => { if (chunk.toString().includes('Local:')) { clearTimeout(timer); resolve(); } });
    server.stderr.on('data', (chunk) => process.stderr.write(chunk));
    server.on('error', reject);
    server.on('exit', (code) => reject(Error('Isolated server exited ' + code)));
  });

  browser = await chromium.launch({channel: 'msedge', headless: true});
  const owner = await browser.newContext({viewport: {width: 1280, height: 860}});
  const ownerPage = await owner.newPage();
  ownerPage.on('pageerror', (e) => console.error('OWNER PAGE ERROR', e.message));

  await ownerPage.goto(base + '/#setup=' + setupToken);
  await ownerPage.locator('[name=username]').fill('tutorial_admin');
  await ownerPage.locator('[name=name]').fill('示例管理员');
  await ownerPage.locator('[name=password]').fill('Tutorial-admin-2026!');
  await ownerPage.locator('[name=confirm]').fill('Tutorial-admin-2026!');
  await ownerPage.getByRole('button', {name: '创建管理员账号', exact: true}).click();
  await ownerPage.locator('.sidebar').waitFor();

  const makeMember = async (username, name, dept, role) => {
    const invitation = await ownerPage.evaluate(({dept, role}) => api('invite', {dept, role}), {dept, role});
    const context = await browser.newContext({viewport: {width: 1280, height: 860}});
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error('MEMBER PAGE ERROR', e.message));
    await page.goto(base);
    await page.evaluate(async ({username, name, dept, invite}) => api('register', {
      username, name, dept, password: 'Tutorial-member-2026!', invite,
    }), {username, name, dept, invite: invitation.token});
    return {context, page};
  };

  const member = await makeMember('tutorial_member', '示例成员', '视觉传达部', 'member');
  const lead = await makeMember('tutorial_lead', '示例负责人', '视觉传达部', 'manager');
  const memberPage = member.page;

  await ownerPage.evaluate(async () => {
    const s = await api('state');
    const m = s.people.find((p) => p.name === '示例成员');
    const l = s.people.find((p) => p.name === '示例负责人');
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const e1 = await api('events/create', {
      name: '迎新晚会现场拍摄', date: day, endDate: day, allDay: false,
      startTime: '18:30', endTime: '21:30', department: '视觉传达部', source: '学媒自有',
      description: '覆盖舞台、合影与花絮；活动后 48 小时内交付精修图。',
      activation: 'auto', template: 'blank', seriesId: 'welcome', rewardPoints: 20,
    });
    await api('tasks/create', {
      event: e1.id, name: '现场摄影与精修', owners: [m.id], receivers: [l.id],
      due: day + 'T18:00',
      requirements: '覆盖舞台、合影与花絮；当晚精修 30 张并上传素材库，保留摄影署名。',
      checks: ['已上传原始文件到素材库', '已交付精修图', '已备注摄影署名'],
      rewardPoints: 20,
    });
  });

  const nav = async (page, viewName, selector) => {
    await page.evaluate((v) => { view = v; render(); }, viewName);
    await page.waitForSelector(selector);
  };

  // 01 login
  const guest = await browser.newContext({viewport: {width: 1280, height: 860}});
  const guestPage = await guest.newPage();
  await guestPage.goto(base);
  await guestPage.locator('#auth-form').waitFor();
  await wait(200);
  await guestPage.screenshot({path: `${out}/tutorial-01-登录页.png`});
  await guest.close();

  // Member session after reload
  await memberPage.goto(base);
  await memberPage.locator('.sidebar').waitFor();
  await wait(400);

  // 02 overview
  await memberPage.screenshot({path: `${out}/tutorial-02-工作概览.png`});

  // 03 my tasks
  await nav(memberPage, 'tasks', '[data-view=tasks].active');
  await memberPage.waitForSelector('.task-group, .task-row, .panel.empty', {timeout: 5000}).catch(() => {});
  await wait(200);
  await memberPage.screenshot({path: `${out}/tutorial-03-我的任务.png`});

  // 04 submit form dialog
  const taskId = await memberPage.evaluate(() => state.tasks.find((t) => t.owner === user.id)?.id);
  if (taskId) {
    await memberPage.evaluate((id) => api('tasks/action', {id, action: 'accept'}), taskId);
    await memberPage.evaluate((id) => submitForm(id), taskId);
    await memberPage.locator('#submit-form').waitFor();
    await wait(150);
    await memberPage.locator('#dialog').screenshot({path: `${out}/tutorial-04-提交成果.png`});
    await memberPage.evaluate(() => $('#dialog').close());
  } else {
    await memberPage.screenshot({path: `${out}/tutorial-04-提交成果.png`});
  }

  // 05 calendar
  await nav(memberPage, 'calendar', '.calendar');
  await wait(200);
  await memberPage.screenshot({path: `${out}/tutorial-05-日历与时间轴.png`});

  // 06 profile dialog
  await memberPage.evaluate(() => profileForm());
  await memberPage.locator('#profile-form').waitFor();
  await wait(150);
  await memberPage.locator('#dialog').screenshot({path: `${out}/tutorial-06-个人资料与头像.png`});
  await memberPage.evaluate(() => $('#dialog').close());

  // 07 settings dialog
  await memberPage.evaluate(() => settingsForm('appearance'));
  await memberPage.locator('.settings-tabs').waitFor();
  await wait(200);
  await memberPage.locator('#dialog').screenshot({path: `${out}/tutorial-07-外观与偏好设置.png`});
  await memberPage.evaluate(() => $('#dialog').close());

  // 08 knowledge base
  await nav(memberPage, 'sop', '.sop-document');
  await wait(200);
  await memberPage.screenshot({path: `${out}/tutorial-08-知识库.png`});

  console.log('Tutorial screenshots captured.');
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
