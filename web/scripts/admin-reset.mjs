// Offline operator recovery for a locked administrator. The secret stays in an ignored local file.
import {database} from './local-db.mjs';
import {createHash,randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url)),args=process.argv.slice(2),username=args[args.indexOf('--username')+1];
if(!args.includes('--username')||!args.includes('--issue')||typeof username!=='string'||!(/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username))){console.error('Usage: node scripts/admin-reset.mjs --username ADMIN_USERNAME --issue');process.exit(1)}
const DB=database(path.join(root,'.local/preview.db'));
try{const target=DB.sqlite.prepare("SELECT id FROM users WHERE username=? AND role='admin' AND status='active'").get(username);if(!target)throw Error('Active administrator not found.');const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex');DB.sqlite.exec('BEGIN');try{DB.sqlite.prepare('UPDATE resets SET used=1 WHERE user=?').run(target.id);DB.sqlite.prepare('INSERT INTO resets (hash,user,expires,used) VALUES (?,?,?,0)').run(hash,target.id,Date.now()+86400000);DB.sqlite.exec('COMMIT')}catch(e){DB.sqlite.exec('ROLLBACK');throw e}const output=path.join(root,'.local/admin-reset-link.txt');await mkdir(path.dirname(output),{recursive:true});await writeFile(output,'https://fengrumedia.dpdns.org/#reset='+token+'\n',{mode:0o600});console.log('One-use reset link saved to web/.local/admin-reset-link.txt (expires in 24 hours). Password and lock stay unchanged until the link is used.')}catch{console.error('Operator reset did not finish. Check the username and local database. No credential was printed.');process.exitCode=1}finally{DB.sqlite.close()}
