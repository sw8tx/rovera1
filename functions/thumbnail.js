const CACHE_MS = 24 * 60 * 60 * 1000;
const cachedThumbnails = new Map();

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function redirect(location, maxAge = 86400) {
  return new Response(null, {
    status: 302,
    headers: {
      ...cors,
      Location: location,
      'Cache-Control': `public, max-age=${maxAge}`
    }
  });
}

async function loadThumbnailUrl(id) {
  const itemId = String(id || '').trim();
  if (!/^\d{2,20}$/.test(itemId)) {
    throw new Error('Invalid item id');
  }

  const cached = cachedThumbnails.get(itemId);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.url;
  }

  const response = await fetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${encodeURIComponent(itemId)}&size=150x150&format=Png&isCircular=false`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Rovera Thumbnail Proxy/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Thumbnail request failed: ${response.status}`);
  }

  const payload = await response.json();
  const image = payload && payload.data && payload.data[0] && payload.data[0].imageUrl;
  if (!image) {
    throw new Error('Thumbnail missing');
  }

  cachedThumbnails.set(itemId, { url: image, at: Date.now() });
  return image;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);

  try {
    return redirect(await loadThumbnailUrl(url.searchParams.get('id')));
  } catch {
    return redirect('/logo.png', 300);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: cors });
}
