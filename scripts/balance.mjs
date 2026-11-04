#!/usr/bin/env node
import {migrateNorthStar} from './north-star.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { isDeepStrictEqual } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { validate, prepare, duplicate, subtaskPatch, statuses } from './balance-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privateDir = path.join(root,'.balance-local');
const [command, ...raw] = process.argv.slice(2);
const apply = raw.includes('--apply');
const args = raw.filter(a => a !== '--apply');
const help = `Balance OS data tool (no browser required)
  login [email]                  Interactive password entry; password is never saved
  whoami | logout
  list tasks|wins|categories     JSON output, all pages
  get tasks|wins ID
  add tasks|wins record.json     Preview by default; --apply writes
  update tasks|wins ID patch.json [--apply]
  status ID STATUS [--apply]
  subtask TASK_ID SUBTASK_ID done|open [--apply]
  archive ID [--apply]           Reversible removal; preserves history
  batch plan.json [--apply]      Add-only, deduplicated; never replaces existing rows
  north-star plan.json [--apply] Save vision cards, verify, then archive source roadmap tasks
  snapshot                      Private local backup of all app tables
Batch shape: {tasks:[{key,title,domain,category,subtasks:[{title,estimateMinutes}],...}],wins:[{key,text,date,tags}]}
Session and snapshots are private, git-ignored files in .balance-local.
No hard-delete or full-data import command is provided.`;
if (!command || ['help','--help'].includes(command)) { console.log(help); process.exit(0); }
process.umask(0o077);
fs.mkdirSync(privateDir,{recursive:true,mode:0o700});
try { process.loadEnvFile(path.join(root,'.env')); } catch (e) { if(e.code !== 'ENOENT') throw e; }
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw Error('Missing Supabase configuration in project .env');
const storage = {
  getItem: k => { const f=path.join(privateDir,encodeURIComponent(k)+'.json'); return fs.existsSync(f)?fs.readFileSync(f,'utf8'):null; },
  setItem: (k,v) => { const f=path.join(privateDir,encodeURIComponent(k)+'.json'); fs.writeFileSync(f+'.tmp',v,{mode:0o600}); fs.renameSync(f+'.tmp',f); },
  removeItem: k => fs.rmSync(path.join(privateDir,encodeURIComponent(k)+'.json'),{force:true})
};
const client=createClient(url,key,{auth:{storage,storageKey:'balance-cli-auth',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
const unwrap = r => { if(r.error) throw Error(r.error.message); return r.data; };
const output = v => console.log(JSON.stringify(v,null,2));
const read = f => JSON.parse(fs.readFileSync(f,'utf8'));
function password() {
  if (!process.stdin.isTTY) throw Error('Run login yourself in a terminal');
  process.stdout.write('Password (hidden): '); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve,reject) => {
    let value='';
    const cleanup=()=>{process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
    const onData=b=>{for(const c of b.toString()) { if(c==='\u0003'){cleanup();reject(Error('Cancelled'));return;} if(c==='\r'||c==='\n'){cleanup();resolve(value);return;} if(c==='\u007f')value=value.slice(0,-1);else value+=c; }};
    process.stdin.on('data',onData);
  });
}
const tables=['north_star','categories','tasks','time_entries','weekly_reviews','daily_capacity','wins','habits','habit_logs','app_settings','timer_state'];
let user;
async function list(table) {
  if(!tables.includes(table)) throw Error('Unknown table');
  const rows=[];
  for(let offset=0;;offset+=500) { const page=unwrap(await client.from(table).select('*').eq('user_id',user.id).order('id').range(offset,offset+499)); rows.push(...page); if(page.length<500)return rows; }
}
async function get(table,id) { return unwrap(await client.from(table).select('*').eq('user_id',user.id).eq('id',id).single()); }
function savePrivate(name,data) { const file=path.join(privateDir,`${Date.now()}-${name}.json`);fs.writeFileSync(file,JSON.stringify(data,null,2),{mode:0o600});return file; }
async function snapshot() { const result={}; for(const t of tables)result[t]=await list(t);return savePrivate('snapshot',result); }
async function patch(table,id,fields) {
  if(!['tasks','wins','north_star'].includes(table))throw Error('Unsupported update table');
  if(table==='north_star') {
    for(const k of Object.keys(fields))if(!['title','vision','why','ideas','domain','sort_order'].includes(k))throw Error('Unsupported vision field: '+k);
    for(const k of ['title','vision'])if(k in fields&&!fields[k]?.trim())throw Error(k+' cannot be empty');
    if(fields.domain&&!['BUSINESS','LIFE_ADMIN'].includes(fields.domain))throw Error('Invalid domain');
  } else validate(table,fields);
  const before=await get(table,id);
  if(table==='tasks' && fields.status) {
    if(fields.status==='DONE')fields.completed_at=fields.completed_at??before.completed_at??new Date().toISOString();
    else if(fields.status!=='ARCHIVED')fields.completed_at=null;
  }
  if(table==='tasks' && (fields.category_id || fields.domain)) {
    const cat=await get('categories',fields.category_id??before.category_id);
    if(cat.domain!==(fields.domain??before.domain))throw Error('Category/domain mismatch');
  }
  output({mode:apply?'apply':'preview',table,id,changes:fields});
  if(!apply)return;
  savePrivate('before-update',{table,before,fields});
  if(table==='tasks')fields.updated_at=new Date().toISOString();
  if(table==='north_star')fields.revision=before.revision+1;
  let q=client.from(table).update(fields).eq('user_id',user.id).eq('id',id);
  // Reject stale edits; wins have no updated_at, so compare their mutable fields.
  if(table==='tasks')q=q.eq('updated_at',before.updated_at);
  else if(table==='north_star')q=q.eq('revision',before.revision);
  else q=q.eq('text',before.text).eq('date',before.date).filter('tags','eq',`{${before.tags.join(',')}}`);
  const rows=unwrap(await q.select());
  if(rows.length!==1)throw Error('Record changed concurrently; read it again before retrying');
  const after=await get(table,id);
  for(const [k,v] of Object.entries(fields))if(!isDeepStrictEqual(after[k],JSON.parse(JSON.stringify(v))))throw Error(`Read-back verification failed: ${k}`);
  output({verified:true,id});
}
async function batch(plan) {
  if(Object.keys(plan).some(k=>!['tasks','wins'].includes(k)))throw Error('Batch supports tasks and wins only');
  const cats=await list('categories'); const inserts=[]; const skipped=[];
  for(const table of ['tasks','wins']) {
    const existing=await list(table);
    for(const input of plan[table]??[]) {
      const row=prepare(table,input,user.id,cats);
      if(table==='tasks' && !cats.some(c=>c.id===row.category_id&&c.domain===row.domain))throw Error('Category/domain mismatch');
      const match=duplicate(table,row,existing);
      if(match)skipped.push({table,id:match.id,key:input.key});
      else {inserts.push({table,row});existing.push(row);}
    }
  }
  output({mode:apply?'apply':'preview',add:inserts.map(({table,row})=>({table,id:row.id,title:row.title??row.text})),skipped});
  if(!apply||!inserts.length)return;
  console.log('Backup:',await snapshot());
  // Sequential writes are restart-safe through deterministic IDs. A failure stops the batch.
  for(const {table,row} of inserts) {
    unwrap(await client.from(table).insert(row));
    const actual=await get(table,row.id);
    for(const [k,v] of Object.entries(row))if(!isDeepStrictEqual(actual[k],JSON.parse(JSON.stringify(v))))throw Error(`Read-back failed for ${row.id}: ${k}`);
    console.log('Verified:',table,row.id);
  }
}
let lock;
try {
  lock=fs.openSync(path.join(privateDir,'command.lock'),'wx',0o600);
  if(command==='login') {
    let email=args[0];
    if(!email){const rl=createInterface({input:process.stdin,output:process.stdout});email=await rl.question('Email: ');rl.close();}
    const secret=await password();
    const result=unwrap(await client.auth.signInWithPassword({email,password:secret}));
    console.log('Signed in:',result.user.email);
  } else {
    user=unwrap(await client.auth.getUser()).user;
    if(!user)throw Error('Run: npm run data -- login');
    if(command==='whoami')output({id:user.id,email:user.email});
    else if(command==='logout') {unwrap(await client.auth.signOut({scope:'local'}));console.log('CLI session signed out');}
    else if(command==='list')output(await list(args[0]));
    else if(command==='get')output(await get(args[0],args[1]));
    else if(command==='north-star')await migrateNorthStar(client,user,read(args[0]),savePrivate,apply);
    else if(command==='snapshot')console.log(await snapshot());
    else if(command==='batch')await batch(read(args[0]));
    else if(command==='add') {if(!['tasks','wins'].includes(args[0]))throw Error('Only tasks or wins');await batch({[args[0]]:[read(args[1])]});}
    else if(command==='update')await patch(args[0],args[1],read(args[2]));
    else if(command==='status'||command==='archive') {const status=command==='archive'?'ARCHIVED':args[1];if(!statuses.includes(status))throw Error('Invalid status');await patch('tasks',args[0],{status});}
    else if(command==='subtask') {if(!['done','open'].includes(args[2]))throw Error('Use done or open');await patch('tasks',args[0],subtaskPatch(await get('tasks',args[0]),args[1],args[2]==='done'));}
    else throw Error(help);
  }
} catch(e) { console.error(e.message);process.exitCode=1; }
finally {if(lock!==undefined){fs.closeSync(lock);fs.rmSync(path.join(privateDir,'command.lock'),{force:true});}client.auth.stopAutoRefresh();}
