import { createHash } from 'node:crypto';

export const statuses = ['BACKLOG', 'TODAY', 'IN_PROGRESS', 'PENDING', 'DONE', 'ARCHIVED'];
export const normalize = s => s.trim().replace(/\s+/g, ' ').toLowerCase();
export const stableId = (user, table, key) => createHash('sha256').update(`${user}:${table}:${key}`).digest('hex');
export function validate(table, row) {
  const keys = table === 'tasks'
    ? ['title','category_id','domain','status','priority','notes','due_date','soft_deadline','next_action_at','pending_reason','context_card','subtasks','completed_at']
    : ['text','date','tags'];
  for (const k of Object.keys(row)) if (!keys.includes(k)) throw Error(`Unsupported ${table} field: ${k}`);
  if (table === 'tasks') {
    if ('title' in row && !row.title?.trim()) throw Error('Task title is required');
    if ('status' in row && !statuses.includes(row.status)) throw Error('Invalid status');
    if ('domain' in row && !['LIFE_ADMIN','BUSINESS'].includes(row.domain)) throw Error('Invalid domain');
    if ('priority' in row && ![1,2,3,4].includes(row.priority)) throw Error('Invalid priority');
    if ('subtasks' in row) {
      if (!Array.isArray(row.subtasks) || !row.subtasks.length) throw Error('At least one subtask is required');
      const ids = new Set();
      for (const s of row.subtasks) {
        if (!s.id || ids.has(s.id) || !s.title?.trim() || typeof s.done !== 'boolean') throw Error('Invalid subtask');
        if (s.estimateMinutes != null && (!Number.isFinite(s.estimateMinutes) || s.estimateMinutes < 0)) throw Error('Invalid estimate');
        ids.add(s.id);
      }
    }
  } else {
    if ('text' in row && !row.text?.trim()) throw Error('Win text is required');
    if ('tags' in row && (!Array.isArray(row.tags) || row.tags.some(t => !['life','biz','vitality','community'].includes(t)))) throw Error('Invalid win tags');
  }
  for (const k of ['date','due_date','soft_deadline']) if (row[k] != null && (!/^\d{4}-\d{2}-\d{2}$/.test(row[k]) || new Date(row[k]).toISOString().slice(0,10) !== row[k])) throw Error(`Invalid ${k}`);
  return row;
}
export function prepare(table, input, user, categories = [], now = new Date().toISOString()) {
  const { key, category, ...fields } = input;
  if (!key?.trim()) throw Error('A stable key is required for each new record');
  if (table === 'tasks') {
    if (category) {
      const matches = categories.filter(c => c.domain === fields.domain && normalize(c.name) === normalize(category));
      if (matches.length !== 1) throw Error(`Category must resolve uniquely: ${category}`);
      fields.category_id = matches[0].id;
    }
    fields.subtasks = (fields.subtasks ?? [{ title: 'Main' }]).map((s,i) => ({ ...s, id: s.id ?? stableId(user,'subtask',`${key}:${i}`), done: s.done ?? false }));
    validate(table, fields);
    if (!fields.title || !fields.category_id || !fields.domain) throw Error('Task requires title, category, and domain');
    if (fields.status === 'DONE') fields.completed_at ??= now;
    return { id: stableId(user,table,key), user_id: user, status: 'BACKLOG', priority: 2, context_card: {}, actual_seconds_total: 0, time_tracking_mode: 'PROJECT', created_at: now, updated_at: now, ...fields };
  }
  validate(table, fields);
  if (!fields.text || !fields.date) throw Error('Win requires text and date');
  return { id: stableId(user,table,key), user_id: user, tags: [], created_at: now, ...fields };
}
export function duplicate(table, candidate, existing) {
  return existing.find(r => r.id === candidate.id || (table === 'wins'
    ? r.date === candidate.date && normalize(r.text) === normalize(candidate.text)
    : r.domain === candidate.domain && normalize(r.title) === normalize(candidate.title)));
}
export function subtaskPatch(task, id, done, now = new Date().toISOString()) {
  if (!task.subtasks.some(s => s.id === id)) throw Error('Subtask not found');
  const subtasks = task.subtasks.map(s => s.id === id ? {...s, done, completedAt: done ? now : undefined} : s);
  const patch = {subtasks};
  if (subtasks.every(s => s.done)) Object.assign(patch,{status:'DONE',completed_at:task.completed_at ?? now});
  else if (!done && task.status === 'DONE') Object.assign(patch,{status:'BACKLOG',completed_at:null});
  return patch;
}
