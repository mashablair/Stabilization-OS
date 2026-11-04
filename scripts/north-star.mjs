import {isDeepStrictEqual} from 'node:util';
export async function migrateNorthStar(client,user,plan,savePrivate,apply) {
  const check=r=>{if(r.error)throw Error(r.error.message);return r.data;};
  const existing=check(await client.from('north_star').select('*').eq('user_id',user.id));
  const sources=[];
  for(const card of plan) {
    if(!card.id||!card.title?.trim()||!card.vision?.trim()||!['card','vision'].includes(card.kind))throw Error('Invalid vision card');
    if(card.source_task_id) {
      const task=check(await client.from('tasks').select('*').eq('user_id',user.id).eq('id',card.source_task_id).single());
      if(!task.title.startsWith('Future —'))throw Error('Only the agreed Future roadmap tasks can be migrated');
      sources.push(task);
    }
  }
  console.log(JSON.stringify({mode:apply?'apply':'preview',cards:plan.map(c=>c.title),archive:sources.map(t=>t.title)},null,2));
  if(!apply)return;
  savePrivate('before-north-star',{existing,sources,plan});
  // Save and verify every card before archiving any task.
  for(const card of plan) {
    const found=existing.find(c=>c.id===card.id||c.source_task_id&&c.source_task_id===card.source_task_id);
    if(found) {
      for(const [k,v] of Object.entries(card))if(!isDeepStrictEqual(found[k],v))throw Error('Existing vision differs; review it before archiving sources');
    } else {
      check(await client.from('north_star').insert({...card,user_id:user.id}));
      const actual=check(await client.from('north_star').select('*').eq('id',card.id).eq('user_id',user.id).single());
      for(const [k,v] of Object.entries(card))if(!isDeepStrictEqual(actual[k],v))throw Error('Vision read-back verification failed');
    }
  }
  for(const task of sources) {
    if(task.status==='ARCHIVED')continue;
    const rows=check(await client.from('tasks').update({status:'ARCHIVED',updated_at:new Date().toISOString()}).eq('id',task.id).eq('user_id',user.id).eq('updated_at',task.updated_at).select());
    if(rows.length!==1)throw Error('Task changed concurrently; preserved without archiving');
    const actual=check(await client.from('tasks').select('*').eq('id',task.id).eq('user_id',user.id).single());
    if(actual.status!=='ARCHIVED')throw Error('Archive verification failed');
    for(const [k,v] of Object.entries(task))if(!['status','updated_at'].includes(k)&&!isDeepStrictEqual(actual[k],v))throw Error('Source preservation check failed');
  }
  console.log('Verified all vision cards; archived source tasks with notes, subtasks, and completion timestamps preserved.');
}
