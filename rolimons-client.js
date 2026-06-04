/* Shared RoliMon's data client for Rovera */
(function () {
  const API_PATH = '/rolimons?action=items';
  const CACHE_KEY = 'rovera_rolimons_items_v3';
  const CACHE_TTL = 5 * 60 * 1000;

  const demandLabels = {
    '-1': 'None',
    0: 'Terrible',
    1: 'Low',
    2: 'Normal',
    3: 'High',
    4: 'Amazing'
  };

  const trendLabels = {
    '-1': 'None',
    0: 'Lowering',
    1: 'Unstable',
    2: 'Stable',
    3: 'Raising',
    4: 'Fluctuating'
  };

  let items = [];
  let byId = new Map();
  let byName = new Map();

  function numberOrFallback(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function thumbnailUrl(id) {
    return `/thumbnail?id=${encodeURIComponent(id)}`;
  }

  function normalizeItem(id, raw) {
    const rap = Math.max(0, numberOrFallback(raw[2], 0));
    const value = numberOrFallback(raw[3], -1);
    const defaultValue = Math.max(0, numberOrFallback(raw[4], 0));
    const baseValue = value > 0 ? value : (defaultValue > 0 ? defaultValue : rap);
    const demand = numberOrFallback(raw[5], -1);
    const trend = numberOrFallback(raw[6], -1);
    const projected = numberOrFallback(raw[7], -1) === 1;
    const hyped = numberOrFallback(raw[8], -1) === 1;
    const rare = numberOrFallback(raw[9], -1) === 1;
    const name = String(raw[0] || `Item ${id}`);
    const acronym = String(raw[1] || '');

    return {
      id: String(id),
      name,
      acronym,
      rap,
      value,
      defaultValue,
      baseValue,
      demand,
      trend,
      projected,
      hyped,
      rare,
      demandLabel: demandLabels[demand] || 'None',
      trendLabel: trendLabels[trend] || 'None',
      thumbnail: thumbnailUrl(id),
      url: `https://www.rolimons.com/item/${id}`,
      search: `${name} ${acronym} ${id}`.toLowerCase()
    };
  }

  function normalizePayload(payload) {
    const rawItems = payload && payload.items ? payload.items : {};
    return Object.entries(rawItems)
      .map(([id, raw]) => normalizeItem(id, raw))
      .filter(item => item.baseValue > 0 || item.rap > 0)
      .sort((a, b) => b.baseValue - a.baseValue);
  }

  function indexItems(nextItems) {
    items = nextItems;
    byId = new Map(items.map(item => [item.id, item]));
    byName = new Map(items.map(item => [item.name.toLowerCase(), item]));
  }

  function readCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!cached || !cached.savedAt || !cached.payload) return null;
      if (Date.now() - cached.savedAt > CACHE_TTL) return null;
      return cached.payload;
    } catch {
      return null;
    }
  }

  function writeCache(payload) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), payload }));
    } catch {}
  }

  async function fetchItems(force) {
    if (!force) {
      const cached = readCache();
      if (cached) {
        indexItems(normalizePayload(cached));
        return items;
      }
    }

    const response = await fetch(API_PATH, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('RoliMons data failed');
    const payload = await response.json();
    if (!payload || !payload.items) throw new Error('RoliMons data missing');
    writeCache(payload);
    indexItems(normalizePayload(payload));
    return items;
  }

  function getItems() {
    return items;
  }

  function getById(id) {
    return byId.get(String(id)) || null;
  }

  function search(query, limit) {
    const q = String(query || '').trim().toLowerCase();
    const max = limit || 8;
    if (!q) return items.slice(0, max);

    return items
      .map(item => {
        let score = 0;
        const name = item.name.toLowerCase();
        const acronym = item.acronym.toLowerCase();
        if (item.id === q) score += 1200;
        if (name === q || acronym === q) score += 1000;
        if (name.startsWith(q) || acronym.startsWith(q)) score += 550;
        if (item.search.includes(q)) score += 220;
        if (!score) return null;
        score += Math.min(180, item.baseValue / 1000);
        if (item.demand >= 3) score += 25;
        if (item.rare) score += 18;
        return { item, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map(result => result.item);
  }

  function findItem(query) {
    const q = String(query || '').trim();
    if (!q) return null;
    return byId.get(q) || byName.get(q.toLowerCase()) || search(q, 1)[0] || null;
  }

  function formatNumber(value) {
    return Math.round(Number(value) || 0).toLocaleString('en-US');
  }

  function valueForItem(item) {
    return item.baseValue || item.value || item.defaultValue || item.rap || 0;
  }

  function itemRisk(item) {
    let risk = 0;
    if (item.projected) risk += 28;
    if (item.hyped) risk += 12;
    if (item.trend === 0) risk += 10;
    if (item.trend === 1) risk += 7;
    if (item.demand <= 1) risk += 6;
    if (item.rare) risk -= 6;
    return Math.max(0, risk);
  }

  function itemAdjustedValue(item) {
    let factor = 1;
    if (item.demand === 4) factor += 0.13;
    if (item.demand === 3) factor += 0.08;
    if (item.demand === 1) factor -= 0.06;
    if (item.demand === 0) factor -= 0.12;
    if (item.trend === 3) factor += 0.08;
    if (item.trend === 2) factor += 0.02;
    if (item.trend === 1) factor -= 0.05;
    if (item.trend === 0) factor -= 0.1;
    if (item.projected) factor -= 0.22;
    if (item.hyped) factor -= 0.08;
    if (item.rare) factor += 0.08;
    return Math.max(0, valueForItem(item) * factor);
  }

  function summarize(list) {
    const safe = Array.isArray(list) ? list : [];
    const totalValue = safe.reduce((sum, item) => sum + valueForItem(item), 0);
    const totalRap = safe.reduce((sum, item) => sum + (item.rap || 0), 0);
    const adjusted = safe.reduce((sum, item) => sum + itemAdjustedValue(item), 0);
    const risk = safe.reduce((sum, item) => sum + itemRisk(item), 0);
    const weightedDemand = totalValue
      ? safe.reduce((sum, item) => sum + Math.max(0, item.demand) * valueForItem(item), 0) / totalValue
      : 0;
    const weightedTrend = totalValue
      ? safe.reduce((sum, item) => sum + Math.max(0, item.trend) * valueForItem(item), 0) / totalValue
      : 0;
    const projected = safe.filter(item => item.projected).length;
    const hyped = safe.filter(item => item.hyped).length;
    const rare = safe.filter(item => item.rare).length;
    const reputation = Math.max(
      0,
      Math.min(100, Math.round(52 + weightedDemand * 9 + weightedTrend * 5 + rare * 4 - projected * 14 - hyped * 6 - risk * 0.18))
    );

    return {
      count: safe.length,
      totalValue,
      totalRap,
      adjusted,
      risk,
      weightedDemand,
      weightedTrend,
      projected,
      hyped,
      rare,
      reputation
    };
  }

  function analyzeTrade(giveItems, receiveItems) {
    const give = summarize(giveItems);
    const receive = summarize(receiveItems);
    const rawDelta = receive.totalValue - give.totalValue;
    const adjustedDelta = receive.adjusted - give.adjusted;
    const percent = give.adjusted > 0 ? adjustedDelta / give.adjusted : 0;
    const demandEdge = receive.weightedDemand - give.weightedDemand;
    const reputationEdge = receive.reputation - give.reputation;

    let verdict = 'Fair';
    let tone = 'fair';
    if (percent >= 0.08 && receive.risk <= give.risk + 14) {
      verdict = 'Good trade';
      tone = 'good';
    } else if (percent >= 0.025) {
      verdict = 'Small win';
      tone = 'good';
    } else if (percent <= -0.08) {
      verdict = 'Bad trade';
      tone = 'bad';
    } else if (receive.projected > give.projected && adjustedDelta < give.totalValue * 0.04) {
      verdict = 'Risky trade';
      tone = 'warn';
    }

    const reasons = [];
    reasons.push(`Value delta: ${rawDelta >= 0 ? '+' : '-'}${formatNumber(Math.abs(rawDelta))}`);
    reasons.push(`Risk-adjusted delta: ${adjustedDelta >= 0 ? '+' : '-'}${formatNumber(Math.abs(adjustedDelta))}`);
    reasons.push(`Demand edge: ${demandEdge >= 0 ? '+' : ''}${demandEdge.toFixed(2)}`);
    reasons.push(`Market reputation: ${receive.reputation}/100 vs ${give.reputation}/100`);
    if (receive.projected || give.projected) reasons.push(`Projected flags: receiving ${receive.projected}, giving ${give.projected}`);
    if (receive.hyped || give.hyped) reasons.push(`Hype flags: receiving ${receive.hyped}, giving ${give.hyped}`);
    if (receive.rare || give.rare) reasons.push(`Rare items: receiving ${receive.rare}, giving ${give.rare}`);

    return {
      verdict,
      tone,
      rawDelta,
      adjustedDelta,
      percent,
      demandEdge,
      reputationEdge,
      give,
      receive,
      reasons
    };
  }

  window.RoveraRoli = {
    demandLabels,
    trendLabels,
    fetchItems,
    getItems,
    getById,
    search,
    findItem,
    formatNumber,
    summarize,
    analyzeTrade,
    valueForItem
  };
})();
