let cachedPayload = null;
let cachedAt = 0;

const ROLIMONS_ITEM_DETAILS = 'https://www.rolimons.com/itemapi/itemdetails';
const CACHE_MS = 60 * 1000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      ...cors,
      'Cache-Control': 'public, max-age=60'
    }
  });
}

async function loadItemDetails() {
  const now = Date.now();
  if (cachedPayload && now - cachedAt < CACHE_MS) {
    return { ...cachedPayload, cached: true };
  }

  const response = await fetch(ROLIMONS_ITEM_DETAILS, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Rovera Trade Checker/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`RoliMons request failed: ${response.status}`);
  }

  const payload = await response.json();
  if (!payload || !payload.items) {
    throw new Error('RoliMons response missing items');
  }

  cachedPayload = {
    success: true,
    item_count: payload.item_count || Object.keys(payload.items).length,
    items: payload.items,
    source: 'rolimons',
    fetched_at: new Date().toISOString()
  };
  cachedAt = now;
  return { ...cachedPayload, cached: false };
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') || 'items';

  if (action !== 'items') {
    return json({ success: false, error: 'Invalid action' }, 400);
  }

  try {
    return json(await loadItemDetails());
  } catch (error) {
    return json({ success: false, error: error.message }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: cors });
}
