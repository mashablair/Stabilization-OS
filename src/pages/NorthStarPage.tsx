import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useNorthStar, saveNorthStar, type NorthStarCard } from '../northStar';
import { useAuth } from '../lib/AuthContext';
import { useCategories } from '../hooks/useData';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';

export default function NorthStarPage() {
  const {user} = useAuth();
  const {data:cards=[],isPending,error,refetch} = useNorthStar();
  const {data:categories=[]} = useCategories();
  const navigate=useNavigate();
  const [edit,setEdit]=useState<{card:NorthStarCard;isNew:boolean}|null>(null);
  const [step,setStep]=useState<{card:NorthStarCard;id:string;title:string;category:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const vision=cards.find(c=>c.kind==='vision');
  const input='w-full rounded-xl border border-slate-200 dark:border-border-dark bg-white dark:bg-background-dark p-3 text-sm';
  const button='rounded-lg px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50';
  function create(kind:'card'|'vision') {
    if(!user)return;
    setMessage('');setEdit({isNew:true,card:{id:crypto.randomUUID(),user_id:user.id,kind,title:kind==='vision'?'My guiding vision':'',vision:'',why:'',ideas:'',domain:'BUSINESS',source_task_id:null,sort_order:cards.length,revision:0}});
  }
  async function save() {
    if(!edit||busy)return;
    setBusy(true);setMessage('');
    try {await saveNorthStar(edit.card,edit.isNew);setEdit(null);} catch(e){setMessage(e instanceof Error?e.message:'Could not save. Please try again.');}finally{setBusy(false);}
  }
  async function createStep() {
    if(!step||!user||busy)return;
    if(!step.title.trim()||!step.category){setMessage('Enter a next step and choose a category.');return;}
    setBusy(true);setMessage('');
    try {
      const now=new Date().toISOString();
      const {error}=await supabase.from('tasks').insert({id:step.id,user_id:user.id,title:step.title.trim(),category_id:step.category,domain:step.card.domain,status:'BACKLOG',priority:2,notes:`Inspired by North Star: ${step.card.title}\n/north-star#${step.card.id}`,context_card:{why:step.card.why,nextMicroStep:'',reframe:''},subtasks:[{id:crypto.randomUUID(),title:'Main',done:false}],time_tracking_mode:'PROJECT',actual_seconds_total:0,created_at:now,updated_at:now});
      if(error)throw new Error(error.message);
      await queryClient.invalidateQueries({queryKey:['tasks']});setStep(null);navigate(`/tasks/${step.id}`);
    }catch(e){setMessage(e instanceof Error?e.message:'Could not create the task.');}finally{setBusy(false);}
  }
  return <div className="max-w-5xl mx-auto px-4 py-7 pb-28 space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs uppercase tracking-widest text-primary font-bold">Direction, possibility, purpose</p><h1 className="text-3xl font-bold mt-1">North Star</h1><p className="text-slate-500 dark:text-slate-400 mt-2">A place to remember the life you’re building toward.</p></div>
      <button className={button} onClick={()=>create('card')} disabled={isPending||!!error}>＋ Add a vision</button>
    </header>
    {isPending?<p>Loading your North Star…</p>:error?<div role="alert" className="p-4 rounded-xl border border-amber-400">Your vision board couldn’t load. Please try again.<button className={button} onClick={()=>refetch()}>Retry</button></div>:<>
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-purple-100 to-pink-50 dark:from-purple-950/40 dark:to-slate-900 p-6 md:p-8">
        <div className="flex justify-between gap-4"><span className="material-symbols-outlined text-primary text-3xl" aria-hidden="true">explore</span><button className={button} onClick={()=>{setMessage('');vision?setEdit({card:{...vision},isNew:false}):create('vision');}}>{vision?'Edit vision':'Write your guiding vision'}</button></div>
        <h2 className="text-xl font-semibold mt-4">{vision?.title??'What kind of life do you want to create?'}</h2>
        <p className="mt-3 text-lg leading-relaxed whitespace-pre-wrap max-w-3xl">{vision?.vision??'Give your ambitions room to breathe. This is a compass you can return to as your life evolves.'}</p>
        {vision?.why&&<p className="mt-4 text-slate-500 dark:text-slate-400 whitespace-pre-wrap">{vision.why}</p>}
      </section>
      <div className="grid md:grid-cols-2 gap-4">
        {cards.filter(c=>c.kind==='card').map((card,i)=><article id={card.id} key={card.id} className="scroll-mt-28 rounded-2xl border border-slate-200 dark:border-border-dark bg-white dark:bg-card-dark p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3"><span className="text-xs uppercase tracking-widest text-primary font-bold">{card.domain==='BUSINESS'?'Work & creativity':'Life & freedom'} · {String(i+1).padStart(2,'0')}</span><button className={button} aria-label={`Edit ${card.title}`} onClick={()=>{setMessage('');setEdit({card:{...card},isNew:false});}}>Edit</button></div>
          <h2 className="text-xl font-semibold">{card.title}</h2><p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{card.vision}</p>
          {card.why&&<div><h3 className="text-xs uppercase tracking-wider text-slate-400 mb-1">Why it matters</h3><p className="whitespace-pre-wrap text-sm">{card.why}</p></div>}
          {card.ideas&&<details className="text-sm"><summary className="cursor-pointer text-primary font-medium">Ideas to explore</summary><p className="mt-2 whitespace-pre-wrap text-slate-500 dark:text-slate-400">{card.ideas}</p></details>}
          <div className="mt-auto pt-3 border-t border-slate-100 dark:border-border-dark flex flex-wrap items-center justify-between gap-2"><button className={button} onClick={()=>{setMessage('');setStep({card,id:crypto.randomUUID(),title:'',category:categories.find(c=>c.domain===card.domain)?.id??''});}}>Create a next step →</button>{card.source_task_id&&<Link className="text-xs text-slate-400 hover:text-primary" to={`/tasks/${card.source_task_id}`}>Original notes</Link>}</div>
        </article>)}
      </div>
      <p className="text-center text-sm text-slate-400">Let these visions guide you. Choose a small next step when the time feels right.</p>
    </>}
    {(edit||step)&&<div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-label={edit?'Edit your vision':'Create a next step'} className="bg-white dark:bg-card-dark rounded-2xl max-w-xl w-full p-5 max-h-[90vh] overflow-y-auto space-y-4">
      <h2 className="text-xl font-bold">{edit?'Your vision':'One small next step'}</h2>
      {edit?<>
        {(['title','vision','why','ideas'] as const).filter(k=>edit.card.kind==='card'||k!=='ideas').map(k=><label className="block space-y-1" key={k}><span className="text-sm text-slate-500">{{title:'Title',vision:'What I envision',why:'Why it matters',ideas:'Ideas to explore'}[k]}</span><textarea rows={k==='title'?1:3} className={input} value={edit.card[k]} onChange={e=>setEdit({...edit,card:{...edit.card,[k]:e.target.value}})} /></label>)}
        {edit.card.kind==='card'&&<label className="block text-sm">Area<select className={input} value={edit.card.domain} onChange={e=>setEdit({...edit,card:{...edit.card,domain:e.target.value as NorthStarCard['domain']}})}><option value="BUSINESS">Work & creativity</option><option value="LIFE_ADMIN">Life & freedom</option></select></label>}
      </>:step&&<><p className="text-sm text-slate-500">Inspired by {step.card.title}. This will go into All Tasks; you can add it to Today when ready.</p><label className="block text-sm">Next step<input autoFocus className={input} value={step.title} onChange={e=>setStep({...step,title:e.target.value})}/></label><label className="block text-sm">Category<select className={input} value={step.category} onChange={e=>setStep({...step,category:e.target.value})}><option value="">Choose a category</option>{categories.filter(c=>c.domain===step.card.domain).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></>}
      {message&&<p role="alert" className="text-sm text-red-500">{message}</p>}
      <div className="flex justify-end gap-2"><button className={button} disabled={busy} onClick={()=>{setEdit(null);setStep(null);}}>Cancel</button><button className="bg-gradient-accent rounded-xl px-4 py-2 text-white font-semibold disabled:opacity-50" disabled={busy} onClick={edit?save:createStep}>{busy?'Saving…':edit?'Save vision':'Create task'}</button></div>
    </section></div>}
  </div>;
}
