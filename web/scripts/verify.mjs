import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const args = new Set(process.argv.slice(2));
const webRoot = fileURLToPath(new URL('../', import.meta.url));
function run(script) {
  console.log('\n> ' + script);
  const result = spawnSync(process.execPath, [script], {cwd: webRoot, stdio: 'inherit'});
  if (result.error) throw result.error;
  return result.status === 0;
}

if (!run('scripts/build.mjs') || !run('scripts/prepare-mini.mjs')) process.exit(1);
const scripts = await readdir(new URL('./', import.meta.url));
const extraBrowserChecks = new Set(['community-test.mjs', 'motion-v103-test.mjs', 'tutorial-reader-check.mjs']);
const checks = scripts.filter(name => /(?:^test(?:-mini(?:-ui)?)?|-test)\.mjs$/.test(name) || extraBrowserChecks.has(name));
const selected = checks.filter(name => {
  if (name === 'native-compile-test.mjs') return args.has('--native-compiler');
  if (name.includes('browser-test') || extraBrowserChecks.has(name)) return args.has('--browser');
  if (name.startsWith('service-')) return process.platform === 'win32';
  return true;
}).sort();
const failed = [];
for (const name of selected) {
  if (!run('scripts/' + name)) failed.push(name);
}
console.log('\nPassed ' + (selected.length - failed.length) + '/' + selected.length + ' checks.');
if (failed.length) {
  console.error('Failed: ' + failed.join(', '));
  process.exitCode = 1;
}
