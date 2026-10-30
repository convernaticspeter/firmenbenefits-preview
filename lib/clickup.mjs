// Minimal ClickUp API v2 client for storing website submissions.
const API = 'https://api.clickup.com/api/v2';

async function call(path, { method = 'GET', body, env = process.env } = {}) {
  const response = await fetch(API + path, {
    method,
    headers: { Authorization: env.CLICKUP_TOKEN, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 200) }; }
  if (!response.ok) { const err = new Error('clickup_' + response.status); err.status = response.status; err.detail = data?.err || data?.ECODE; throw err; }
  return data;
}

export function clickupConfigured(env = process.env) {
  return Boolean(env.CLICKUP_TOKEN && env.CLICKUP_LIST_ID);
}

export async function createTask({ name, markdown, tags = [] }, env = process.env) {
  const data = await call(`/list/${env.CLICKUP_LIST_ID}/task`, { method: 'POST', env, body: { name: name.slice(0, 250), markdown_description: markdown, tags } });
  return { id: data.id, url: data.url };
}

export async function addComment(taskId, text, env = process.env) {
  return call(`/task/${encodeURIComponent(taskId)}/comment`, { method: 'POST', env, body: { comment_text: text, notify_all: false } });
}

export async function addTag(taskId, tag, env = process.env) {
  return call(`/task/${encodeURIComponent(taskId)}/tag/${encodeURIComponent(tag)}`, { method: 'POST', env, body: {} });
}

export async function getTask(taskId, env = process.env) {
  return call(`/task/${encodeURIComponent(taskId)}`, { env });
}
