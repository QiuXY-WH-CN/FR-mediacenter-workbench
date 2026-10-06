import {DatabaseSync} from 'node:sqlite';
import {mkdir} from 'node:fs/promises';
await mkdir('.local/backups',{recursive:true});
const name='.local/backups/before-release-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db';
const db=new DatabaseSync('.local/preview.db');
db.exec("VACUUM INTO '"+name+"'");
db.close();
console.log('Database snapshot created: '+name);
