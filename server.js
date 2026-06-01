// Local dev server - run with: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const codes = {};

function generateCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

const MIME = { '.html':'text/html', '.js':'application/javascript', '.png':'image/png', '.toml':'text/plain' };

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.url === '/roblox' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { action, email, username, code } = JSON.parse(body);
        res.setHeader('Content-Type', 'application/json');

        if (action === 'sendCode') {
          const c = generateCode();
          codes[email] = { code: c, expires: Date.now() + 600000 };
          console.log(`\n📧 Verification code for ${email}: \x1b[33m${c}\x1b[0m\n`);
          res.writeHead(200);
          res.end(JSON.stringify({ sent: true, _local_code: c }));
          return;
        }

        if (action === 'verifyCode') {
          const stored = codes[email];
          if (!stored || Date.now() > stored.expires) {
            res.writeHead(200); res.end(JSON.stringify({ valid: false, reason: 'Expired or not found' })); return;
          }
          const valid = stored.code === String(code);
          if (valid) delete codes[email];
          res.writeHead(200); res.end(JSON.stringify({ valid })); return;
        }

        res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid action' }));
      } catch(e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  let filePath = req.url === '/' ? '/index.html' : req.url;
  const fullPath = path.join(__dirname, filePath);
  fs.readFile(fullPath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
    res.end(data);
  });
});

server.listen(3000, () => {
  console.log('\n🚀 Rovera local server running!');
  console.log('   Open: \x1b[36mhttp://localhost:3000\x1b[0m');
  console.log('   Verification codes will appear here in the terminal\n');
});
