import {DatabaseSync} from 'node:sqlite';
export function database(path=':memory:') {
 const sqlite=new DatabaseSync(path);
 class Statement {constructor(sql,params=[]){this.sql=sql;this.params=params}bind(...params){return new Statement(this.sql,params)}async first(){return sqlite.prepare(this.sql).get(...this.params)||null}async all(){return {results:sqlite.prepare(this.sql).all(...this.params)}}async run(){const r=sqlite.prepare(this.sql).run(...this.params);return {success:true,meta:{changes:Number(r.changes)}}}}
 return {sqlite,prepare:sql=>new Statement(sql),batch:async statements=>{sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}};
}
