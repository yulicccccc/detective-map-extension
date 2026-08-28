// server.js - Zero-Admin Lightweight LAN Sync Server for iPad Apple Pencil Canvas
// LEGACY / HISTORICAL ONLY. Current V2 uses Cloudflare Worker + Durable Object.
// Pure Node.js Standard Library - No npm install required

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname);
const DATA_FILE = path.join(__dirname, '.detective-map-data.json');

let state = {
  quotes: [],
  strokes: [],
  viewport: { panX: 100, panY: 100, zoom: 1.0 }
};

try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    state = { ...state, ...parsed };
  }
} catch (e) {
  console.log('[Server] Initializing fresh state.');
}

function persistState() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('[Server] Failed to save data file:', err);
  }
}

const sseClients = new Set();

function broadcast(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`event: init\ndata: ${JSON.stringify(state)}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
    return;
  }

  if (pathname === '/api/quote' && req.method === 'POST') {
    readJsonBody(req, (data) => {
      if (!data) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid payload' }));
        return;
      }
      const quote = {
        id: data.id || `quote-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
        type: 'quote',
        text: data.text || '',
        sourceTitle: data.sourceTitle || 'Web Capture',
        sourceUrl: data.sourceUrl || '',
        capturedAt: data.capturedAt || new Date().toISOString(),
        x: typeof data.x === 'number' ? data.x : 120 + (state.quotes.length % 6) * 45,
        y: typeof data.y === 'number' ? data.y : 120 + (state.quotes.length % 6) * 45,
        width: data.width || 320,
        height: 'auto'
      };
      const existingIdx = state.quotes.findIndex(q => q.id === quote.id);
      if (existingIdx !== -1) state.quotes[existingIdx] = { ...state.quotes[existingIdx], ...quote };
      else state.quotes.push(quote);
      persistState();
      broadcast('quote_added', quote);
      broadcast('state_updated', state);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, quote }));
    });
    return;
  }

  if (pathname === '/api/quotes' && req.method === 'POST') {
    readJsonBody(req, (data) => {
      if (Array.isArray(data)) {
        state.quotes = data;
        persistState();
        broadcast('quotes_updated', state.quotes);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  if (pathname === '/api/stroke' && req.method === 'POST') {
    readJsonBody(req, (data) => {
      if (data && data.points) {
        const stroke = {
          id: data.id || `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
          type: 'ink',
          tool: data.tool || 'pen',
          width: data.width || (data.tool === 'highlighter' ? 20 : 3),
          opacity: typeof data.opacity === 'number' ? data.opacity : (data.tool === 'highlighter' ? 0.35 : 1.0),
          color: data.color || (data.tool === 'highlighter' ? '#f59e0b' : '#38bdf8'),
          points: data.points
        };
        state.strokes.push(stroke);
        persistState();
        broadcast('stroke_added', stroke);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, stroke }));
        return;
      }
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Invalid stroke' }));
    });
    return;
  }

  if (pathname === '/api/strokes' && req.method === 'POST') {
    readJsonBody(req, (data) => {
      if (Array.isArray(data)) {
        state.strokes = data;
        persistState();
        broadcast('strokes_updated', state.strokes);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  if (pathname === '/api/viewport' && req.method === 'POST') {
    readJsonBody(req, (data) => {
      if (data && typeof data.zoom === 'number') {
        state.viewport = data;
        persistState();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'canvas.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  });
});

function readJsonBody(req, callback) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try { callback(body ? JSON.parse(body) : null); }
    catch { callback(null); }
  });
}

function getLanIps() {
  const ips = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push({ name, address: net.address });
    }
  }
  return ips;
}

server.listen(PORT, '0.0.0.0', () => {
  const lanIps = getLanIps();
  console.log('\n======================================================');
  console.log('🚀 Detective Map - Zero-Admin iPad LAN Sync Server');
  console.log('======================================================');
  console.log(`\n🖥️  Windows PC Local: http://localhost:${PORT}/canvas.html`);
  console.log('\n📱 iPad Safari Access URL:');
  lanIps.forEach(ip => console.log(`   👉 http://${ip.address}:${PORT}/canvas.html`));
  console.log('======================================================\n');
});
