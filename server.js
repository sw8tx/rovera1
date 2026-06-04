// Local dev server - run with: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const codes = {};
let rolimonsCache = null;
let rolimonsCacheAt = 0;
let thumbnailCache = new Map();

const THUMBNAIL_CACHE_MS = 24 * 60 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.toml': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(body));
}

function sendRedirect(res, location, maxAge = 86400) {
  res.writeHead(302, {
    Location: location,
    'Cache-Control': `public, max-age=${maxAge}`,
    'Access-Control-Allow-Origin': '*'
  });
  res.end();
}

async function readBody(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function loadRolimonsItems() {
  const now = Date.now();
  if (rolimonsCache && now - rolimonsCacheAt < 60 * 1000) {
    return { ...rolimonsCache, cached: true };
  }

  const response = await fetch('https://www.rolimons.com/itemapi/itemdetails', {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Rovera Trade Checker/1.0'
    }
  });
  if (!response.ok) throw new Error(`RoliMons request failed: ${response.status}`);
  const payload = await response.json();
  if (!payload || !payload.items) throw new Error('RoliMons response missing items');

  rolimonsCache = {
    success: true,
    item_count: payload.item_count || Object.keys(payload.items).length,
    items: payload.items,
    source: 'rolimons',
    fetched_at: new Date().toISOString()
  };
  rolimonsCacheAt = now;
  return { ...rolimonsCache, cached: false };
}

async function loadThumbnailUrl(id) {
  const itemId = String(id || '').trim();
  if (!/^\d{2,20}$/.test(itemId)) {
    throw new Error('Invalid item id');
  }

  const cached = thumbnailCache.get(itemId);
  if (cached && Date.now() - cached.at < THUMBNAIL_CACHE_MS) {
    return cached.url;
  }

  const response = await fetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${encodeURIComponent(itemId)}&size=150x150&format=Png&isCircular=false`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Rovera Thumbnail Proxy/1.0'
    }
  });
  if (!response.ok) throw new Error(`Thumbnail request failed: ${response.status}`);

  const payload = await response.json();
  const image = payload && payload.data && payload.data[0] && payload.data[0].imageUrl;
  if (!image) throw new Error('Thumbnail missing');

  thumbnailCache.set(itemId, { url: image, at: Date.now() });
  return image;
}

async function lookupRobloxUser(username) {
  const response = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
  });
  const payload = await response.json();
  const userData = payload.data && payload.data[0];
  if (!userData) return null;

  let avatar = null;
  try {
    const avatarResponse = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userData.id}&size=150x150&format=Png`);
    const avatarPayload = await avatarResponse.json();
    avatar = avatarPayload.data?.[0]?.imageUrl || null;
  } catch {}

  return {
    id: userData.id,
    name: userData.name,
    displayName: userData.displayName,
    avatar
  };
}

async function handleRoblox(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || '{}');
    const { action, email, username, code, userId } = body;

    if (action === 'track') {
      sendJson(res, { ok: true });
      return;
    }

    if (action === 'lookupUser') {
      const user = await lookupRobloxUser(username);
      if (!user) {
        sendJson(res, { error: 'not found' }, 404);
        return;
      }
      sendJson(res, user);
      return;
    }

    if (action === 'checkBio') {
      const response = await fetch(`https://users.roblox.com/v1/users/${userId}`);
      if (!response.ok) {
        sendJson(res, { bio: null });
        return;
      }
      const payload = await response.json();
      sendJson(res, { bio: payload.description || '' });
      return;
    }

    if (action === 'sendCode') {
      const c = generateCode();
      codes[email] = { code: c, expires: Date.now() + 600000 };
      console.log(`\nVerification code for ${email}: \x1b[33m${c}\x1b[0m\n`);
      sendJson(res, { sent: true, _local_code: c });
      return;
    }

    if (action === 'verifyCode') {
      const stored = codes[email];
      if (!stored || Date.now() > stored.expires) {
        sendJson(res, { valid: false, reason: 'Expired or not found' });
        return;
      }
      const valid = stored.code === String(code);
      if (valid) delete codes[email];
      sendJson(res, { valid });
      return;
    }

    sendJson(res, { error: 'Invalid action' }, 400);
  } catch (error) {
    sendJson(res, { error: error.message }, 500);
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost:3000');
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  if (filePath === '/catalog') filePath = '/catalog.html';
  if (filePath === '/privacy') filePath = '/privacy.html';
  if (filePath === '/privacy-policy') filePath = '/privacy.html';
  if (filePath === '/tos') filePath = '/tos.html';
  if (filePath === '/terms' || filePath === '/terms-of-service') filePath = '/tos.html';

  const fullPath = path.resolve(__dirname, `.${filePath}`);
  if (!fullPath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain; charset=utf-8' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost:3000');

  if (url.pathname === '/rolimons' && req.method === 'GET') {
    try {
      sendJson(res, await loadRolimonsItems());
    } catch (error) {
      sendJson(res, { success: false, error: error.message }, 502);
    }
    return;
  }

  if (url.pathname === '/thumbnail' && req.method === 'GET') {
    try {
      sendRedirect(res, await loadThumbnailUrl(url.searchParams.get('id')));
    } catch (error) {
      sendRedirect(res, '/logo.png', 300);
    }
    return;
  }

  if (url.pathname === '/roblox' && req.method === 'POST') {
    await handleRoblox(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(3000, () => {
  console.log('\nRovera local server running.');
  console.log('Open: http://localhost:3000');
  console.log('Verification codes will appear here in the terminal.\n');
});
