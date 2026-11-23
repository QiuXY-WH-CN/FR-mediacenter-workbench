import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import metadata from '../package.json' with { type: 'json' };

// Preserve classic-script order while the UI modules share the same page state.
const browserModules = [
  'app', 'navigation', 'community', 'workspace', 'organization', 'recovery',
  'statistics', 'login', 'avatar', 'tasks', 'presence', 'schedules'
];
const sharedModules = {
  'schedule-model': 'ScheduleModel',
  'template-policy': 'TemplatePolicy',
  organization: 'OrganizationModel',
  'stats-model': 'StatsModel',
  'particle-engine': 'ParticleEngine',
  localization: 'Localization',
  'task-model': 'WorkspaceModel'
};
const webRoot = fileURLToPath(new URL('../', import.meta.url));
const read = (file, encoding = 'utf8') => readFile(path.join(webRoot, file), encoding);
const release = 'v' + metadata.version;
const browser = await Promise.all(browserModules.map(name => read('src/browser/' + name + '.js')));
const shared = await Promise.all(Object.entries(sharedModules).map(async ([name, binding]) => {
  const source = await read('shared/' + name + '.cjs');
  return 'const ' + binding + ' = (() => {\nconst module = {exports: {}};\n' + source + '\nreturn module.exports;\n})();';
}));

const index = (await read('src/index.html'))
  .replace('href="style.css"', 'href="/style.css?v=' + release + '"')
  .replace('src="app.js"', 'src="/app.js?v=' + release + '"');
const style = (await read('src/browser/workbench.css')).replace(
  /font-size:\s*(\d+(?:\.\d+)?)px/g, (_, px) => 'font-size:calc(' + px + 'px * var(--font-scale,1))'
);
const assets = {
  '/index.html': {type: 'text/html; charset=utf-8', body: index},
  '/app.js': {type: 'text/javascript; charset=utf-8', body: [...shared, ...browser].join('\n')},
  '/style.css': {type: 'text/css; charset=utf-8', body: style}
};

async function image(url, file) {
  assets[url] = {type: 'image/png', base64: true, body: (await read(file, null)).toString('base64')};
}

for (const file of ['emblem.png', 'wordmark.png']) {
  await image('/brand/' + file, 'src/brand/' + file);
}
const screenshots = path.join(webRoot, 'sop/screenshots');
const images = await readdir(screenshots).catch(error => {
  if (error.code === 'ENOENT') return [];
  throw error;
});
for (const file of images.filter(file => file.endsWith('.png')).sort()) {
  await image('/guide/' + encodeURIComponent(file), 'sop/screenshots/' + file);
}

const documents = await Promise.all([
  ['新手快速入门.md', '新手快速入门 · 手把手教程'],
  ['工作台操作手册.md', '工作台操作手册'],
  ['知识库.md', '知识库']
].map(async ([file, title]) => ({path: file, title, content: await read('sop/' + file)})));
assets['/sop-docs.json'] = {type: 'application/json; charset=utf-8', body: JSON.stringify(documents)};

await mkdir(path.join(webRoot, 'dist/server'), {recursive: true});
await writeFile(path.join(webRoot, 'dist/assets.generated.js'), 'export default ' + JSON.stringify(assets));

// Avoid a Windows/Node 24 worker-thread service stall during launcher builds.
process.env.ESBUILD_WORKER_THREADS = '0';
const {build} = await import('esbuild');
await build({
  absWorkingDir: webRoot,
  entryPoints: ['src/worker.js'],
  outfile: 'dist/server/index.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true
});
console.log('Worker and embedded assets built.');
