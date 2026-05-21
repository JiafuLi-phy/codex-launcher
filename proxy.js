/**
 * Codex Launcher - Embedded HTTPS/WS Proxy
 *
 * Routes OpenAI Codex traffic to any LLM backend via:
 *   HTTP  → model discovery, file operations, auth mock
 *   WS    → protocol translation (Responses API ↔ Chat Completions)
 *
 * Features:
 *   - Real-time SSE ↔ WS streaming translation
 *   - Content format normalization (nested arrays → plain text)
 *   - Role mapping (developer → system)
 *   - Request queue (prevents concurrent response.create conflicts)
 *   - Hot reload via SIGHUP
 *   - Model tag injection in responses ([model-name] prefix)
 */
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');

const PORT = parseInt(process.argv[2]) || 53683;
const CFG = process.env.CONFIG_FILE || os.homedir() + '/.codex-launcher/config.json';

// ── Config ──
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CFG, 'utf8')); }
  catch(e) { return { models: [], activeModel: null }; }
}

// ── Content extraction (Responses API nested format → plain text) ──
function extractText(c) {
  if (!c) return '';
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(x => x.text || extractText(x) || '').join('\n');
  if (typeof c === 'object') return c.text || c.content || '';
  return String(c);
}

// ── Role mapping (developer → system, unknown → user) ──
function mapRole(r) {
  if (r === 'developer' || r === 'system') return 'system';
  if (r === 'assistant') return 'assistant';
  return 'user';
}

// ── Build Chat Completions messages from Responses API request ──
function buildMessages(rj) {
  const ms = [];
  if (rj.instructions) ms.push({ role: 'system', content: rj.instructions });
  const inp = rj.input || '';
  if (typeof inp === 'string') {
    ms.push({ role: 'user', content: inp });
  } else if (Array.isArray(inp)) {
    inp.forEach(i => {
      const r = mapRole(i.role || 'user');
      const c = extractText(i.content);
      if (!c) return;
      // Merge consecutive same-role messages
      const last = ms[ms.length - 1];
      if (last && last.role === r) { last.content += '\n' + c; }
      else { ms.push({ role: r, content: c }); }
    });
  }
  if (!ms.length) ms.push({ role: 'user', content: 'hello' });
  return ms;
}

// ── Resolve model config ──
function resolveModel(modelId, cfg) {
  let m = cfg.models.find(x => x.id === modelId);
  if (!m) m = cfg.models.find(x => x.id === cfg.activeModel);
  if (!m) m = cfg.models[0];
  if (!m) return { model: 'deepseek-v4-pro', host: 'api.deepseek.com', pathPrefix: '', apiKey: '' };
  return m;
}

// ── Backend HTTP request ──
function beRequest(method, path, body, headers, m, cb) {
  const h = { Authorization: 'Bearer ' + (m.apiKey || ''), 'Content-Type': 'application/json', ...(headers || {}) };
  const r = https.request({
    hostname: m.apiHost, port: 443, path: (m.pathPrefix || '') + path,
    method, headers: h, timeout: 120000,
  }, resp => {
    let d = []; resp.on('data', c => d.push(c));
    resp.on('end', () => cb(null, resp.statusCode, resp.headers, Buffer.concat(d)));
  });
  r.on('error', e => cb(e));
  if (body) r.write(body);
  r.end();
}

// ── Backend SSE stream ──
function beStream(method, path, body, headers, m, onData, onEnd, onError) {
  const r = https.request({
    hostname: m.apiHost, port: 443, path: (m.pathPrefix || '') + path,
    method, headers: {
      Authorization: 'Bearer ' + (m.apiKey || ''),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(headers || {}),
    }, timeout: 120000,
  }, resp => {
    if (resp.statusCode !== 200) {
      let d = ''; resp.on('data', c => d += c);
      resp.on('end', () => onError && onError(new Error('HTTP ' + resp.statusCode + ': ' + d.substring(0, 200))));
      return;
    }
    let b = ''; resp.on('data', c => {
      b += c.toString();
      const ls = b.split('\n'); b = ls.pop();
      for (const l of ls) {
        if (l.startsWith('data: ') && !l.includes('[DONE]')) {
          try { onData(JSON.parse(l.substring(6))); } catch {}
        }
      }
    });
    resp.on('end', onEnd);
  });
  r.on('error', e => onError && onError(e));
  if (body) r.write(body);
  r.end();
}

// ── WebSocket frame encoder ──
function wsSend(socket, data) {
  const p = Buffer.from(data, 'utf8'), l = p.length;
  let f;
  if (l < 126) { f = Buffer.alloc(2 + l); f[0] = 0x81; f[1] = l; p.copy(f, 2); }
  else { f = Buffer.alloc(4 + l); f[0] = 0x81; f[1] = 126; f.writeUInt16BE(l, 2); p.copy(f, 4); }
  socket.write(f);
}

// ── Response completion event sequence ──
function finish(socket, rid, iid, model, text, done) {
  const t = text || '(empty)';
  wsSend(socket, JSON.stringify({ type: 'response.output_text.done', response_id: rid,
    item_id: iid, output_index: 0, content_index: 0, text: t }));
  setTimeout(() => wsSend(socket, JSON.stringify({ type: 'response.content_part.done', response_id: rid,
    item_id: iid, output_index: 0, content_index: 0, part: { type: 'output_text', text: t } })), 50);
  setTimeout(() => wsSend(socket, JSON.stringify({ type: 'response.output_item.done', response_id: rid,
    output_index: 0, item: { id: iid, type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: t }] } })), 100);
  setTimeout(() => wsSend(socket, JSON.stringify({ type: 'response.completed', response: { id: rid,
    object: 'response', status: 'completed', model, output: [{ id: iid, type: 'message',
    role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: t }] }] } })), 150);
  setTimeout(() => done(), 2000);
}

// ── Static placeholder response (for system-only requests) ──
function staticResp(socket, rid, iid, model, text, done) {
  wsSend(socket, JSON.stringify({ type: 'response.created', response: { id: rid, object: 'response',
    status: 'in_progress', model, output: [] } }));
  setTimeout(() => wsSend(socket, JSON.stringify({ type: 'response.output_item.added',
    response_id: rid, output_index: 0, item: { id: iid, type: 'message', role: 'assistant',
    status: 'in_progress', content: [] } })), 30);
  setTimeout(() => wsSend(socket, JSON.stringify({ type: 'response.content_part.added',
    response_id: rid, item_id: iid, output_index: 0, content_index: 0,
    part: { type: 'output_text', text: '' } })), 60);
  setTimeout(() => wsSend(socket, JSON.stringify({ type: 'response.output_text.delta',
    response_id: rid, item_id: iid, output_index: 0, content_index: 0, delta: text })), 90);
  finish(socket, rid, iid, model, text, done);
}

// ── Main WS handler: one response.create → one Chat Completions stream ──
function handleCreate(socket, rj, cfg, done) {
  const cm = rj.model || 'gpt-5.4';
  const m = resolveModel(cm, cfg);
  const model = m.id;
  const msgs = buildMessages(rj);
  const rid = 'resp_' + Date.now();
  const iid = 'msg_' + Date.now();
  console.log('WS: ' + cm + ' → ' + m.name + '/' + model + ' msgs=' + msgs.length);

  // System-only request → fast placeholder, skip LLM call
  if (!msgs.some(m => m.role === 'user')) {
    staticResp(socket, rid, iid, model, 'I understand.', done);
    return;
  }

  // 1-3. Open response + create output item + content slot
  wsSend(socket, JSON.stringify({ type: 'response.created', response: { id: rid, object: 'response',
    status: 'in_progress', model, output: [] } }));
  setTimeout(() => wsSend(socket, JSON.stringify({ type: 'response.output_item.added',
    response_id: rid, output_index: 0, item: { id: iid, type: 'message', role: 'assistant',
    status: 'in_progress', content: [] } })), 50);
  setTimeout(() => wsSend(socket, JSON.stringify({ type: 'response.content_part.added',
    response_id: rid, item_id: iid, output_index: 0, content_index: 0,
    part: { type: 'output_text', text: '' } })), 100);

  // 4-8. Stream deltas from backend → translate → forward as WS events
  setTimeout(() => {
    let fullText = '';
    const tag = '[' + m.name + '] ';
    let tagSent = false;
    const cr = { model, messages: msgs, stream: true, max_tokens: 4096 };

    beStream('POST', '/v1/chat/completions', Buffer.from(JSON.stringify(cr)), null, m,
      (c) => {
        const d = c.choices?.[0]?.delta?.content || '';
        if (d) {
          if (!tagSent) { d = tag + d; tagSent = true; }
          fullText += d;
          wsSend(socket, JSON.stringify({ type: 'response.output_text.delta', response_id: rid,
            item_id: iid, output_index: 0, content_index: 0, delta: d }));
        }
      },
      () => finish(socket, rid, iid, model, fullText, done),
      (e) => finish(socket, rid, iid, model, fullText || '(err)', () => setTimeout(done, 2000)));
  }, 150);
}

// ── HTTP + WS server ──
const server = http.createServer((req, res) => {
  let b = []; req.on('data', c => b.push(c)); req.on('end', () => {
    b = Buffer.concat(b);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.writeHead(200); return res.end(); }

    const cfg = loadConfig();

    // Model list injection
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const data = cfg.models.map(m => ({ id: m.id, object: 'model', owned_by: m.provider }));
      return res.end(JSON.stringify({ object: 'list', data }));
    }

    // Mock file operations
    if (req.url.startsWith('/v1/files')) {
      res.writeHead(200);
      return res.end(JSON.stringify({ data: [], object: 'list' }));
    }

    // Mock auth
    if (req.url.startsWith('/backend-api')) {
      res.writeHead(200);
      return res.end(JSON.stringify({ access_token: 'tok_' + Date.now(),
        account_id: 'cdx', expires_in: 86400 }));
    }

    res.writeHead(404); res.end('{}');
  });
});

// WebSocket upgrade handler
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n' +
    'Connection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');

  const cfg = loadConfig();
  const queue = [];
  let processing = false;

  function next() {
    if (processing || !queue.length) return;
    processing = true;
    handleCreate(socket, queue.shift(), cfg, () => { processing = false; next(); });
  }

  let buf = Buffer.alloc(0);
  socket.on('data', raw => {
    buf = Buffer.concat([buf, raw]);
    if (buf.length < 2) return;

    // Parse WebSocket masked frame
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f, off = 2;
    if (len === 126 && buf.length >= 4) { len = buf.readUInt16BE(2); off = 4; }
    else if (len === 127 && buf.length >= 10) { len = Number(buf.readBigUInt64BE(2)); off = 10; }
    if (!masked || buf.length < off + 4 + len) return;

    const mask = buf.slice(off, off + 4);
    const payload = buf.slice(off + 4, off + 4 + len);
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    buf = buf.slice(off + 4 + len);

    try {
      const rj = JSON.parse(payload.toString('utf8'));
      if (rj.type === 'response.create') { queue.push(rj); next(); }
    } catch {}
  });

  socket.on('error', () => {});
  socket.on('end', () => {});
});

// Hot reload on SIGHUP
process.on('SIGHUP', () => {
  console.log('Config reloaded');
});

server.listen(PORT, '127.0.0.1', () => {
  const cfg = loadConfig();
  console.log(`Codex Proxy :${PORT} (HTTP+WS), ${cfg.models.length} models`);
});
