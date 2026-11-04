import {test} from 'node:test';
import assert from 'node:assert/strict';
import {migrateNorthStar} from './north-star.mjs';
function mock(fail=false) {
 const db={north_star:[],tasks:[{id:'source',user_id:'u',title:'Future — Vision',status:'BACKLOG',updated_at:'old',notes:'keep',subtasks:[{id:'s',done:false}],completed_at:null}]};
 const client={from(table){let mode='read',payload,filters=[],single=false;const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},single(){single=true;return q;},insert(v){mode='insert';payload=v;return q;},update(v){mode='update';payload=v;return q;},then(resolve,reject){try{if(mode==='insert'){if(fail)return Promise.resolve({error:{message:'write failed'}}).then(resolve,reject);db[table].push(structuredClone(payload));}let rows=db[table].filter(r=>filters.every(([k,v])=>r[k]===v));if(mode==='update')rows.forEach(r=>Object.assign(r,payload));return Promise.resolve({data:structuredClone(single?rows[0]:rows),error:null}).then(resolve,reject);}catch(e){return Promise.reject(e).then(resolve,reject);}}};return q;}};
 return {client,db};
}
const plan=[{id:'vision',kind:'card',title:'My future',vision:'Create',source_task_id:'source'}];
test('failed card save leaves source task untouched',async()=>{const {client,db}=mock(true);await assert.rejects(migrateNorthStar(client,{id:'u'},plan,()=>{},true),/write failed/);assert.equal(db.tasks[0].status,'BACKLOG');});
test('verified migration preserves notes and reruns without duplicates',async()=>{const {client,db}=mock();await migrateNorthStar(client,{id:'u'},plan,()=>{},true);assert.equal(db.tasks[0].status,'ARCHIVED');assert.equal(db.tasks[0].notes,'keep');assert.equal(db.tasks[0].completed_at,null);await migrateNorthStar(client,{id:'u'},plan,()=>{},true);assert.equal(db.north_star.length,1);});
test('preview never changes data and changed existing card blocks archiving',async()=>{const {client,db}=mock();await migrateNorthStar(client,{id:'u'},plan,()=>{},false);assert.equal(db.north_star.length,0);db.north_star.push({...plan[0],user_id:'u',vision:'Edited'});await assert.rejects(migrateNorthStar(client,{id:'u'},plan,()=>{},true),/differs/);assert.equal(db.tasks[0].status,'BACKLOG');});
