// Offline operator recovery for a locked administrator. The secret stays in an ignored local file.
import {createHash, randomBytes} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {database} from './local-db.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const usernameIndex = args.indexOf('--username');
const originIndex = args.indexOf('--origin');
const username = usernameIndex >= 0 ? args[usernameIndex + 1] : '';
let origin;
try {
  origin = new URL(originIndex >= 0 ? args[originIndex + 1] : 'http://127.0.0.1:8766');
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/'
    || !(origin.protocol === 'https:' || (loopback && origin.protocol === 'http:'))) {
    throw new Error('Expected an HTTPS origin or loopback HTTP origin.');
  }
} catch {
  console.error('Set --origin to a workbench HTTPS or loopback HTTP origin.');
  process.exit(1);
}
if (!args.includes('--issue') || !/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username ?? '')) {
  console.error('Usage: node scripts/admin-reset.mjs --username ADMIN_USERNAME --issue [--origin ORIGIN]');
  process.exit(1);
}

const DB = database(path.join(root, '.local/preview.db'));
try {
  const target = DB.sqlite.prepare("SELECT id FROM users WHERE username=? AND role='admin' AND status='active'").get(username);
  if (!target) throw new Error('Active administrator not found.');
  const token = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  DB.sqlite.exec('BEGIN');
  try {
    DB.sqlite.prepare('UPDATE resets SET used=1 WHERE user=?').run(target.id);
    DB.sqlite.prepare('INSERT INTO resets (hash,user,expires,used) VALUES (?,?,?,0)').run(hash, target.id, Date.now() + 86400000);
    DB.sqlite.exec('COMMIT');
  } catch (error) {
    DB.sqlite.exec('ROLLBACK');
    throw error;
  }
  const output = path.join(root, '.local/admin-reset-link.txt');
  await mkdir(path.dirname(output), {recursive: true});
  await writeFile(output, origin.origin + '/#reset=' + token + '\n', {mode: 0o600});
  console.log('One-use reset link saved to web/.local/admin-reset-link.txt (expires in 24 hours). Password and lock stay unchanged until the link is used.');
} catch {
  console.error('Operator reset did not finish. Check the username and local database. No credential was printed.');
  process.exitCode = 1;
} finally {
  DB.sqlite.close();
}
