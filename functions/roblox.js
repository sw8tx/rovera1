const codes = {};

const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1510695471839186984/wdjubUn7F9On0qxcM1_dioTla3ZdtLmiq8XPEBBVORDHt5y4Zsxd_sh_UU0Nt829kAfA';

async function sendDiscordWebhook(env, embed) {
  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch {}
}

async function getIpInfo(ip) {
  try {
    const r = await fetch(`https://ip-api.com/json/${ip}?fields=country,regionName,city,isp`);
    if (r.ok) return await r.json();
  } catch {}
  return null;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { action } = body;

    // ── VISITOR TRACKING ──
    if (action === 'track') {
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      const ua = request.headers.get('user-agent') || 'unknown';
      const ref = body.referrer || 'direct';
      const now = new Date().toUTCString();
      const cf = request.cf || {};
      const location = `${cf.city || '?'}, ${cf.region || '?'}, ${cf.country || '?'}`;

      await sendDiscordWebhook(env, {
        title: '👁️ New Visitor — rovera.xyz',
        color: 0x5bc4ff,
        fields: [
          { name: '🌐 IP', value: `\`${ip}\``, inline: true },
          { name: '📍 Location', value: location, inline: true },
          { name: '🕐 Time', value: now, inline: false },
          { name: '🖥️ User Agent', value: `\`${ua.slice(0, 200)}\``, inline: false },
          { name: '🔗 Referrer', value: ref, inline: true },
        ],
        footer: { text: 'Rovera Tracker' }
      });

      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    // ── ROBLOX LOOKUP ──
    if (action === 'lookupUser') {
      const { username } = body;
      let userData = null;

      try {
        const res = await fetch('https://users.roblox.com/v1/usernames/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
        });
        const d = await res.json();
        if (d.data?.[0]) userData = d.data[0];
      } catch {}

      if (!userData) {
        return new Response(JSON.stringify({ error: 'not found' }), { headers: cors });
      }

      let avatar = null;
      try {
        const ar = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userData.id}&size=150x150&format=Png`);
        const ad = await ar.json();
        avatar = ad.data?.[0]?.imageUrl || null;
      } catch {}

      return new Response(JSON.stringify({
        id: userData.id, name: userData.name,
        displayName: userData.displayName, avatar
      }), { headers: cors });
    }

    // ── CHECK BIO ──
    if (action === 'checkBio') {
      const { userId } = body;
      const r = await fetch(`https://users.roblox.com/v1/users/${userId}`);
      if (!r.ok) return new Response(JSON.stringify({ bio: null }), { headers: cors });
      const d = await r.json();
      return new Response(JSON.stringify({ bio: d.description || '' }), { headers: cors });
    }

    // ── SEND EMAIL CODE ──
    if (action === 'sendCode') {
      const { email, username } = body;
      const code = generateCode();
      codes[email] = { code, expires: Date.now() + 10 * 60 * 1000 };

      const RESEND_KEY = env.RESEND_API_KEY;
      if (!RESEND_KEY) {
        return new Response(JSON.stringify({ sent: true, _debug_code: code }), { headers: cors });
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
            <p style="color:#555;font-size:11px">This code expires in 10 minutes.</p>
          </div>
        `
      };

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
        body: JSON.stringify(emailBody)
      });

      if (!res.ok) return new Response(JSON.stringify({ error: 'Email failed' }), { status: 500, headers: cors });
      return new Response(JSON.stringify({ sent: true }), { headers: cors });
    }

    // ── VERIFY CODE ──
    if (action === 'verifyCode') {
      const { email, code } = body;
      const stored = codes[email];
      if (!stored) return new Response(JSON.stringify({ valid: false, reason: 'No code found' }), { headers: cors });
      if (Date.now() > stored.expires) {
        delete codes[email];
        return new Response(JSON.stringify({ valid: false, reason: 'Code expired' }), { headers: cors });
      }
      if (stored.code !== String(code)) {
        return new Response(JSON.stringify({ valid: false, reason: 'Wrong code' }), { headers: cors });
      }
      delete codes[email];
      return new Response(JSON.stringify({ valid: true }), { headers: cors });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: cors });
}
