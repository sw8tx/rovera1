const https = require('https');

const codes = {};

const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1510695471839186984/wdjubUn7F9On0qxcM1_dioTla3ZdtLmiq8XPEBBVORDHt5y4Zsxd_sh_UU0Nt829kAfA';

function httpsPost(hostname, path, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers }
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function httpsGet(hostname, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    req.on('error', reject);
    req.end();
  });
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendDiscordWebhook(embed) {
  try {
    const body = JSON.stringify({ embeds: [embed] });
    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'discord.com',
        path: '/api/webhooks/1510695471839186984/wdjubUn7F9On0qxcM1_dioTla3ZdtLmiq8XPEBBVORDHt5y4Zsxd_sh_UU0Nt829kAfA',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, (res) => { res.resume(); resolve(); });
      req.on('error', resolve);
      req.write(body); req.end();
    });
  } catch {}
}

async function getIpInfo(ip) {
  try {
    const r = await httpsGet('ip-api.com', `/json/${ip}?fields=country,regionName,city,isp,org`);
    if (r.status === 200 && r.body.country) return r.body;
  } catch {}
  return null;
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    const body = JSON.parse(event.body || '{}');
    const { action } = body;

    // ── VISITOR TRACKING ──
    if (action === 'track') {
      const ip = event.headers['x-forwarded-for']?.split(',')[0].trim() || event.headers['client-ip'] || 'unknown';
      const ua = event.headers['user-agent'] || 'unknown';
      const ref = body.referrer || 'direct';
      const now = new Date().toUTCString();

      const geo = await getIpInfo(ip);
      const location = geo ? `${geo.city}, ${geo.regionName}, ${geo.country}` : 'Unknown';
      const isp = geo ? `${geo.isp}` : 'Unknown';

      await sendDiscordWebhook({
        title: '👁️ New Visitor — rovera.xyz',
        color: 0x5bc4ff,
        fields: [
          { name: '🌐 IP', value: `\`${ip}\``, inline: true },
          { name: '📍 Location', value: location, inline: true },
          { name: '🏢 ISP', value: isp, inline: true },
          { name: '🕐 Time', value: now, inline: false },
          { name: '🖥️ User Agent', value: `\`${ua.slice(0, 200)}\``, inline: false },
          { name: '🔗 Referrer', value: ref, inline: true },
        ],
        footer: { text: 'Rovera Tracker' }
      });

      return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
    }

    // ── ROBLOX LOOKUP PROXY ──
    if (action === 'lookupUser') {
      const { username } = body;
      // Try multiple Roblox endpoints
      let userData = null;

      // Method 1: Standard POST
      try {
        const postBody = JSON.stringify({ usernames: [username], excludeBannedUsers: false });
        const lookupRes = await new Promise((resolve, reject) => {
          const req = https.request({
            hostname: 'users.roblox.com',
            path: '/v1/usernames/users',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postBody),
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Origin': 'https://www.roblox.com',
              'Referer': 'https://www.roblox.com/',
            }
          }, (res) => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: {} }); } });
          });
          req.on('error', reject);
          req.write(postBody); req.end();
        });
        if (lookupRes.status === 200 && lookupRes.body.data?.[0]) {
          userData = lookupRes.body.data[0];
        }
      } catch {}

      // Method 2: Search endpoint fallback
      if (!userData) {
        try {
          const searchRes = await httpsGet('users.roblox.com', `/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`);
          if (searchRes.status === 200 && searchRes.body.data) {
            const match = searchRes.body.data.find(u => u.name.toLowerCase() === username.toLowerCase());
            if (match) userData = { id: match.id, name: match.name, displayName: match.displayName };
          }
        } catch {}
      }

      if (!userData) {
        return { statusCode: 200, headers: cors, body: JSON.stringify({ error: 'not found' }) };
      }

      // Get avatar
      let avatar = null;
      try {
        const ar = await httpsGet('thumbnails.roblox.com',
          `/v1/users/avatar-headshot?userIds=${userData.id}&size=150x150&format=Png`);
        avatar = ar.body?.data?.[0]?.imageUrl || null;
      } catch {}

      return { statusCode: 200, headers: cors, body: JSON.stringify({ id: userData.id, name: userData.name, displayName: userData.displayName, avatar }) };
    }

    // ── CHECK BIO PROXY ──
    if (action === 'checkBio') {
      const { userId } = body;
      const r = await httpsGet('users.roblox.com', `/v1/users/${userId}`);
      if (r.status !== 200) return { statusCode: 200, headers: cors, body: JSON.stringify({ bio: null }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify({ bio: r.body.description || '' }) };
    }

    // ── SEND EMAIL CODE ──
    if (action === 'sendCode') {
      const { email, username } = body;
      const code = generateCode();
      codes[email] = { code, expires: Date.now() + 10 * 60 * 1000 };

      const RESEND_KEY = process.env.RESEND_API_KEY;
      if (!RESEND_KEY) {
        return { statusCode: 200, headers: cors, body: JSON.stringify({ sent: true, _debug_code: code }) };
      }

      const emailBody = {
        from: 'Rovera <help@rovera.xyz>',
        to: [email],
        subject: 'Your Rovera verification code',
        html: `
          <div style="background:#03040f;color:#f0f0f0;font-family:sans-serif;padding:40px;max-width:480px;margin:0 auto;border-radius:12px">
            <h1 style="font-size:28px;letter-spacing:2px;margin-bottom:8px">ROVERA</h1>
            <p style="color:#555;font-size:12px;margin-bottom:32px">roblox limited marketplace</p>
            <p style="margin-bottom:16px">Hey <strong>${username}</strong>, here is your verification code:</p>
            <div style="background:#0a0b18;border:1px solid #141525;border-radius:8px;padding:24px;text-align:center;margin:24px 0">
              <span style="font-size:40px;letter-spacing:12px;font-weight:bold;color:#5bc4ff">${code}</span>
            </div>
            <p style="color:#555;font-size:11px">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
            <hr style="border:none;border-top:1px solid #0d0e20;margin:24px 0">
            <p style="color:#333;font-size:10px">Rovera © 2026 — help@rovera.xyz</p>
          </div>
        `
      };

      const res = await httpsPost('api.resend.com', '/emails', emailBody, { Authorization: `Bearer ${RESEND_KEY}` });
      if (res.status >= 400) return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Email failed', detail: res.body }) };
      return { statusCode: 200, headers: cors, body: JSON.stringify({ sent: true }) };
    }

    // ── VERIFY CODE ──
    if (action === 'verifyCode') {
      const { email, code } = body;
      const stored = codes[email];
      if (!stored) return { statusCode: 200, headers: cors, body: JSON.stringify({ valid: false, reason: 'No code found' }) };
      if (Date.now() > stored.expires) {
        delete codes[email];
        return { statusCode: 200, headers: cors, body: JSON.stringify({ valid: false, reason: 'Code expired' }) };
      }
      if (stored.code !== String(code)) {
        return { statusCode: 200, headers: cors, body: JSON.stringify({ valid: false, reason: 'Wrong code' }) };
      }
      delete codes[email];
      return { statusCode: 200, headers: cors, body: JSON.stringify({ valid: true }) };
    }

    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid action' }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: e.message }) };
  }
};
