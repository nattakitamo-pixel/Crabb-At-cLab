// Netlify Function: /api/* เก็บข้อมูลใน Netlify Blobs (คนละคีย์ต่อคน ลดปัญหาเขียนทับกัน)
import { getStore } from '@netlify/blobs';

export const config = { path: '/api/*' };

const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const json = (code, body) => new Response(JSON.stringify(body), {
  status: code,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

// store: { get(key)->obj|null, set(key,obj), delete(key), list(prefix)->[key] }
export async function handle(req, store, uuid = () => crypto.randomUUID()) {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean); // ['api', ...]
  const method = req.method;
  const readAll = async () => {
    const keys = await store.list('p/');
    const rows = await Promise.all(keys.map((k) => store.get(k)));
    return rows.filter(Boolean).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  };
  const readPoints = async () => {
    const keys = await store.list('pt/');
    const rows = await Promise.all(keys.map((k) => store.get(k)));
    return rows.filter(Boolean).map((r) => r.name);
  };
  const full = async () => ({ mode: await mode(), people: await readAll(), points: await readPoints() });
  const mode = async () => ((await store.get('mode')) || {}).mode || 'pickup';

  if (method === 'GET' && parts[1] === 'state') return json(200, await full());

  let body = {};
  if (method !== 'GET') { try { body = await req.json(); } catch (_) {} }

  if (parts[1] === 'points' && method === 'POST') {
    const name = clean(body.name, 80);
    if (!name) return json(400, { error: 'กรุณากรอกชื่อจุด' });
    await store.set('pt/' + encodeURIComponent(name), { name });
    return json(200, await full());
  }

  if (parts[1] === 'people' && method === 'POST' && !parts[2]) {
    const name = clean(body.name, 60), point = clean(body.point, 80);
    if (!name || !point) return json(400, { error: 'กรุณากรอกชื่อและจุดรับส่ง' });
    const p = { id: uuid(), name, point, note: clean(body.note, 300), checked: false, createdAt: Date.now() };
    await store.set('p/' + p.id, p);
    return json(200, p);
  }

  if (parts[1] === 'people' && parts[2]) {
    const key = 'p/' + parts[2];
    const person = await store.get(key);
    if (!person) return json(404, { error: 'ไม่พบรายชื่อ' });
    if (method === 'PUT') {
      const name = clean(body.name, 60), point = clean(body.point, 80);
      if (!name || !point) return json(400, { error: 'กรุณากรอกชื่อและจุดรับส่ง' });
      Object.assign(person, { name, point, note: clean(body.note, 300) });
      await store.set(key, person); return json(200, person);
    }
    if (method === 'DELETE') { await store.delete(key); return json(200, { ok: true }); }
    if (method === 'POST' && parts[3] === 'check') {
      person.checked = !!body.checked; await store.set(key, person); return json(200, person);
    }
  }

  if (parts[1] === 'reset' && method === 'POST') {
    const rows = await readAll();
    await Promise.all(rows.filter((p) => p.checked).map((p) => store.set('p/' + p.id, { ...p, checked: false })));
    return json(200, await full());
  }
  if (parts[1] === 'mode' && method === 'POST') {
    if (body.mode === 'pickup' || body.mode === 'dropoff') await store.set('mode', { mode: body.mode });
    return json(200, await full());
  }
  return json(404, { error: 'not found' });
}

export default async (req) => {
  const s = getStore({ name: 'rollcall', consistency: 'strong' });
  const store = {
    get: (k) => s.get(k, { type: 'json' }),
    set: (k, v) => s.setJSON(k, v),
    delete: (k) => s.delete(k),
    list: async (prefix) => (await s.list({ prefix })).blobs.map((b) => b.key),
  };
  try { return await handle(req, store); } catch (e) { return json(500, { error: 'server error' }); }
};
