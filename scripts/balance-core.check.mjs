import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepare,duplicate,subtaskPatch,validate} from './balance-core.mjs';
const cats=[{id:'cat',domain:'BUSINESS',name:'PRODUCT'}];
const input={key:'plan:1',title:'Build tutor',category:'PRODUCT',domain:'BUSINESS',subtasks:[{title:'Login',estimateMinutes:30},{title:'Tutor',estimateMinutes:30}]};
test('repeated batch has stable IDs and preserves existing completion',()=>{
  const a=prepare('tasks',input,'user',cats);const b=prepare('tasks',input,'user',cats);
  assert.equal(a.id,b.id);assert.deepEqual(a.subtasks,b.subtasks);
  const done={...a,status:'DONE'};
  assert.equal(duplicate('tasks',b,[done]),done);
});
test('adopts a manually-created win on the same date',()=>{
  const w=prepare('wins',{key:'win',text:'Did math',date:'2026-11-03'},'user');
  assert.ok(duplicate('wins',w,[{id:'manual',text:' DID  math ',date:'2026-11-03'}]));
  assert.equal(duplicate('wins',w,[{id:'other',text:'Did math',date:'2026-11-02'}]),undefined);
});
test('completion and reopening preserve other subtasks and recorded time',()=>{
  const task={status:'BACKLOG',subtasks:[{id:'a',title:'A',done:true,actualSecondsTotal:60},{id:'b',title:'B',done:false}]};
  const done=subtaskPatch(task,'b',true,'2026-11-04T12:00:00.000Z');
  assert.equal(done.status,'DONE');assert.equal(done.subtasks[0].actualSecondsTotal,60);
  const opened=subtaskPatch({...task,...done},'b',false);
  assert.equal(opened.status,'BACKLOG');assert.equal(opened.completed_at,null);assert.equal(opened.subtasks[0].done,true);
});
test('rejects ownership edits, invalid dates and empty subtasks',()=>{
  assert.throws(()=>validate('tasks',{user_id:'other'}));
  assert.throws(()=>validate('wins',{date:'2026-02-30'}));
  assert.throws(()=>validate('tasks',{subtasks:[]}));
  assert.throws(()=>prepare('tasks',{...input,category:'missing'},'user',cats));
});
