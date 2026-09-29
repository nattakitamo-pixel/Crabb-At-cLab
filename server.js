// เซิร์ฟเวอร์เล็กๆ ไม่ต้องติดตั้งแพ็กเกจเพิ่ม: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const PUBLIC = path.join(__dirname, 'public');

let state = { mode: 'pickup', people: [], points: [] };
try { state = { ...state, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) }; } catch (_) {}

function save() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (_) { resolve({}); } });
  });
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = req.method;
  if (method === 'GET' && parts[1] === 'state') return send(res, 200, state);

  const body = method === 'GET' ? {} : await readBody(req);

  if (parts[1] === 'people' && method === 'POST' && !parts[2]) {
    const name = clean(body.name, 60), point = clean(body.point, 80);
    if (!name || !point) return send(res, 400, { error: 'กรุณากรอกชื่อและจุดรับส่ง' });
    const p = { id: crypto.randomUUID(), name, point, note: clean(body.note, 300), checked: false, createdAt: Date.now() };
    state.people.push(p); save();
    return send(res, 200, p);
  }

  const person = state.people.find((x) => x.id === parts[2]);
  if (parts[1] === 'people' && parts[2]) {
    if (!person) return send(res, 404, { error: 'ไม่พบรายชื่อ' });
    if (method === 'PUT') {
      const name = clean(body.name, 60), point = clean(body.point, 80);
      if (!name || !point) return send(res, 400, { error: 'กรุณากรอกชื่อและจุดรับส่ง' });
      Object.assign(person, { name, point, note: clean(body.note, 300) });
      save(); return send(res, 200, person);
    }
    if (method === 'DELETE') {
      state.people = state.people.filter((x) => x !== person);
      save(); return send(res, 200, { ok: true });
    }
    if (method === 'POST' && parts[3] === 'check') {
      person.checked = !!body.checked; save(); return send(res, 200, person);
    }
  }

  if (parts[1] === 'points' && method === 'POST') {
    const name = clean(body.name, 80);
    if (!name) return send(res, 400, { error: 'กรุณากรอกชื่อจุด' });
    if (!state.points.includes(name)) { state.points.push(name); save(); }
    return send(res, 200, state);
  }

  if (parts[1] === 'reset' && method === 'POST') {
    state.people.forEach((p) => { p.checked = false; });
    save(); return send(res, 200, state);
  }
  if (parts[1] === 'mode' && method === 'POST') {
    if (body.mode === 'pickup' || body.mode === 'dropoff') { state.mode = body.mode; save(); }
    return send(res, 200, state);
  }
  send(res, 404, { error: 'not found' });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return api(req, res, url).catch(() => send(res, 500, { error: 'server error' }));
  let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`เปิดที่ http://localhost:${PORT}`));
