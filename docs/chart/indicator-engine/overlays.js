(function exposeOverlays(global) {
  const engine = global.IDXIndicatorEngine;
  const { number, sma, ema, atr } = engine.math;

  engine.meta = (name, formulaVersion, settings, rows, status = "ok", reason = null) => ({
    name,
    source: rows[0]?.source || "yfinance",
    formulaVersion,
    inputs: settings,
    asOf: rows.at(-1)?.date || null,
    status,
    reason,
  });

  const point = (row, value) => Number.isFinite(value) ? { time: row.date, value } : null;
  const anchorKey = (dateText, anchor) => {
    const date = new Date(`${dateText}T00:00:00Z`);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const normalized = String(anchor || "Session").toLowerCase();
    if (normalized === "session") return dateText;
    if (normalized === "week") {
      const copy = new Date(date);
      const day = copy.getUTCDay() || 7;
      copy.setUTCDate(copy.getUTCDate() - day + 1);
      return copy.toISOString().slice(0, 10);
    }
    if (normalized === "month") return `${year}-${month + 1}`;
    if (normalized === "quarter") return `${year}-Q${Math.floor(month / 3) + 1}`;
    if (normalized === "decade") return `${Math.floor(year / 10) * 10}`;
    if (normalized === "century") return `${Math.floor(year / 100) * 100}`;
    return `${year}`;
  };

  function vwap(rows, settings = {}) {
    const anchor = settings.anchor || "Session";
    const calcMode = settings.bandMode || "Standard Deviation";
    const source = settings.source || "hlc3";
    const bands = [settings.bandMult1 ?? 1, settings.bandMult2 ?? 2, settings.bandMult3 ?? 3];
    let key = null;
    let volumeTotal = 0;
    let pvTotal = 0;
    let p2vTotal = 0;
    const center = [];
    const outputs = bands.map(() => ({ upper: [], lower: [] }));
    rows.forEach((row) => {
      const nextKey = anchorKey(row.date, anchor);
      if (nextKey !== key) {
        key = nextKey;
        volumeTotal = 0;
        pvTotal = 0;
        p2vTotal = 0;
      }
      const volume = number(row.volume);
      const price = source === "close" ? number(row.close) : (number(row.high) + number(row.low) + number(row.close)) / 3;
      if (!Number.isFinite(price) || !Number.isFinite(volume) || volume <= 0) return;
      volumeTotal += volume;
      pvTotal += price * volume;
      p2vTotal += price * price * volume;
      const mean = pvTotal / volumeTotal;
      const deviation = Math.sqrt(Math.max((p2vTotal / volumeTotal) - (mean * mean), 0));
      const basis = calcMode === "Percentage" ? mean * 0.01 : deviation;
      center.push(point(row, mean));
      bands.forEach((multiplier, index) => {
        outputs[index].upper.push(point(row, mean + (basis * multiplier)));
        outputs[index].lower.push(point(row, mean - (basis * multiplier)));
      });
    });
    const noVolume = !center.length;
    return {
      vwap: center.filter(Boolean),
      bands: outputs.map((band) => ({ upper: band.upper.filter(Boolean), lower: band.lower.filter(Boolean) })),
      meta: engine.meta("vwap", "pine-tv-vwap-v1", settings, rows, noVolume ? "missing" : "ok", noVolume ? "no_volume_from_vendor" : null),
    };
  }

  function initialBalance(rows, settings = {}) {
    const days = settings.initialBalanceDays || settings.days || 2;
    let month = "";
    let dayCount = 0;
    let high = null;
    let low = null;
    const highPoints = [];
    const lowPoints = [];
    const months = [];
    rows.forEach((row) => {
      const rowMonth = row.date.slice(0, 7);
      if (rowMonth !== month) {
        if (month) months.push({ month, high, low });
        month = rowMonth;
        dayCount = 0;
        high = null;
        low = null;
      }
      dayCount += 1;
      if (dayCount <= days) {
        high = high === null ? number(row.high) : Math.max(high, number(row.high));
        low = low === null ? number(row.low) : Math.min(low, number(row.low));
      }
      highPoints.push(point(row, high));
      lowPoints.push(point(row, low));
    });
    if (month) months.push({ month, high, low });
    return {
      high: highPoints.filter(Boolean),
      low: lowPoints.filter(Boolean),
      months,
      meta: engine.meta("ibh-ibl", "pine-ibh-ibl-v1", settings, rows),
    };
  }

  function anchoredLevels(rows) {
    const buckets = new Map();
    rows.forEach((row) => {
      const date = new Date(`${row.date}T00:00:00Z`);
      const year = date.getUTCFullYear();
      const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
      [["Q", `${year}-Q${quarter}`], ["Y", `${year}`]].forEach(([kind, key]) => {
        const id = `${kind}:${key}`;
        if (!buckets.has(id)) buckets.set(id, { kind, key, pv: 0, p2v: 0, volume: 0 });
        const bucket = buckets.get(id);
        const price = (number(row.high) + number(row.low) + number(row.close)) / 3;
        const volume = number(row.volume);
        if (Number.isFinite(price) && Number.isFinite(volume) && volume > 0) {
          bucket.pv += price * volume;
          bucket.p2v += price * price * volume;
          bucket.volume += volume;
        }
      });
    });
    const values = [...buckets.values()].filter((bucket) => bucket.volume > 0).map((bucket) => {
      const value = bucket.pv / bucket.volume;
      return { ...bucket, value, deviation: Math.sqrt(Math.max((bucket.p2v / bucket.volume) - (value * value), 0)) };
    });
    const current = rows.at(-1)?.date;
    if (!current) return { currentQ: null, nearest: [], meta: engine.meta("anchor-vwap", "pine-anchor-vwap-v1", {}, rows, "missing", "insufficient_history") };
    const date = new Date(`${current}T00:00:00Z`);
    const currentQKey = `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    const currentYear = `${date.getUTCFullYear()}`;
    const quarters = values.filter((item) => item.kind === "Q");
    const years = values.filter((item) => item.kind === "Y");
    const currentQ = quarters.find((item) => item.key === currentQKey);
    const previousQ = quarters.filter((item) => item.key < currentQKey).at(-1);
    const previousY = years.filter((item) => item.key < currentYear).at(-1);
    const candidates = [];
    [[previousQ, "PQ"], [previousY, "PY"]].forEach(([item, label]) => {
      if (!item) return;
      candidates.push({ label: `${label} VWAP`, value: item.value });
      [1, 2, 3].forEach((multiplier) => {
        candidates.push({ label: `${label}+${multiplier} VWAP`, value: item.value + (item.deviation * multiplier) });
        candidates.push({ label: `${label}-${multiplier} VWAP`, value: item.value - (item.deviation * multiplier) });
      });
    });
    candidates.sort((a, b) => a.value - b.value);
    const close = number(rows.at(-1).close);
    let nearestIndex = candidates.reduce((best, item, index) => Math.abs(item.value - close) < Math.abs(candidates[best]?.value - close) ? index : best, 0);
    const start = Math.max(0, Math.min(nearestIndex - 1, candidates.length - 3));
    return {
      currentQ: currentQ ? { label: "Q VWAP", value: currentQ.value } : null,
      nearest: candidates.slice(start, start + 3),
      all: candidates,
      meta: engine.meta("anchor-vwap", "pine-anchor-vwap-v1", {}, rows, candidates.length ? "ok" : "partial", candidates.length ? null : "insufficient_history"),
    };
  }

  function pivots(rows, length) {
    const highs = [];
    const lows = [];
    for (let index = length; index < rows.length - length; index += 1) {
      const window = rows.slice(index - length, index + length + 1);
      const high = number(rows[index].high);
      const low = number(rows[index].low);
      if (high === Math.max(...window.map((row) => number(row.high)))) highs.push({ index, confirmed: index + length, price: high });
      if (low === Math.min(...window.map((row) => number(row.low)))) lows.push({ index, confirmed: index + length, price: low });
    }
    return { highs, lows };
  }

  function smc(rows, settings = {}) {
    const internalLength = settings.internalLength || 5;
    const swingLength = settings.swingLength || 50;
    const atrValues = atr(rows, 200);
    const events = [];
    const orderBlocks = [];
    const equalLevels = [];
    const fvg = [];
    const calculate = (length, scope) => {
      const { highs, lows } = pivots(rows, length);
      let highCursor = 0;
      let lowCursor = 0;
      let activeHigh = null;
      let activeLow = null;
      let bias = 0;
      rows.forEach((row, index) => {
        while (highs[highCursor]?.confirmed <= index) activeHigh = highs[highCursor++];
        while (lows[lowCursor]?.confirmed <= index) activeLow = lows[lowCursor++];
        const close = number(row.close);
        const previous = index ? number(rows[index - 1].close) : null;
        if (activeHigh && previous <= activeHigh.price && close > activeHigh.price) {
          const type = bias === -1 ? "CHoCH" : "BOS";
          events.push({ time: row.date, index, scope, bias: 1, type, price: activeHigh.price });
          const segment = rows.slice(activeHigh.index, index + 1);
          const candidate = segment.reduce((best, item, offset) => number(item.low) < number(best.item.low) ? { item, offset } : best, { item: segment[0], offset: 0 });
          orderBlocks.push({ bias: 1, start: candidate.item.date, end: row.date, top: number(candidate.item.high), bottom: number(candidate.item.low), scope });
          bias = 1;
          activeHigh = null;
        }
        if (activeLow && previous >= activeLow.price && close < activeLow.price) {
          const type = bias === 1 ? "CHoCH" : "BOS";
          events.push({ time: row.date, index, scope, bias: -1, type, price: activeLow.price });
          const segment = rows.slice(activeLow.index, index + 1);
          const candidate = segment.reduce((best, item) => number(item.high) > number(best.high) ? item : best, segment[0]);
          orderBlocks.push({ bias: -1, start: candidate.date, end: row.date, top: number(candidate.high), bottom: number(candidate.low), scope });
          bias = -1;
          activeLow = null;
        }
      });
      const threshold = settings.equalThreshold ?? 0.1;
      highs.forEach((pivot, index) => {
        const previous = highs[index - 1];
        const tolerance = atrValues[pivot.confirmed] * threshold;
        if (previous && Number.isFinite(tolerance) && Math.abs(pivot.price - previous.price) < tolerance) equalLevels.push({ type: "EQH", time: rows[pivot.confirmed].date, price: pivot.price });
      });
      lows.forEach((pivot, index) => {
        const previous = lows[index - 1];
        const tolerance = atrValues[pivot.confirmed] * threshold;
        if (previous && Number.isFinite(tolerance) && Math.abs(pivot.price - previous.price) < tolerance) equalLevels.push({ type: "EQL", time: rows[pivot.confirmed].date, price: pivot.price });
      });
    };
    calculate(internalLength, "internal");
    calculate(swingLength, "swing");
    for (let index = 2; index < rows.length; index += 1) {
      if (number(rows[index].low) > number(rows[index - 2].high) && number(rows[index - 1].close) > number(rows[index - 2].high)) {
        fvg.push({ bias: 1, time: rows[index].date, top: number(rows[index].low), bottom: number(rows[index - 2].high) });
      }
      if (number(rows[index].high) < number(rows[index - 2].low) && number(rows[index - 1].close) < number(rows[index - 2].low)) {
        fvg.push({ bias: -1, time: rows[index].date, top: number(rows[index - 2].low), bottom: number(rows[index].high) });
      }
    }
    const swingWindow = rows.slice(-Math.max(swingLength * 2, 100));
    const top = Math.max(...swingWindow.map((row) => number(row.high)));
    const bottom = Math.min(...swingWindow.map((row) => number(row.low)));
    const highRow = swingWindow.findLast((row) => number(row.high) === top);
    const lowRow = swingWindow.findLast((row) => number(row.low) === bottom);
    const latestBias = events.at(-1)?.bias || 0;
    const zones = {
      premium: { top, bottom: (0.95 * top) + (0.05 * bottom), label: "Premium" },
      equilibrium: { top: (0.525 * top) + (0.475 * bottom), bottom: (0.525 * bottom) + (0.475 * top), label: "Equilibrium" },
      discount: { top: (0.95 * bottom) + (0.05 * top), bottom, label: "Discount" },
    };
    return {
      events,
      orderBlocks: orderBlocks.slice(-(settings.orderBlockCount || 4)),
      equalLevels,
      fvg,
      zones,
      extremes: {
        high: highRow ? { time: highRow.date, price: top, label: latestBias > 0 ? "Weak High" : "Strong High" } : null,
        low: lowRow ? { time: lowRow.date, price: bottom, label: latestBias < 0 ? "Weak Low" : "Strong Low" } : null,
      },
      ema1: rows.map((row, index) => point(row, ema(rows.map((item) => number(item.close)), settings.ema1Length || 25)[index])).filter(Boolean),
      ema2: rows.map((row, index) => point(row, ema(rows.map((item) => number(item.close)), settings.ema2Length || 50)[index])).filter(Boolean),
      ma200: rows.map((row, index) => point(row, sma(rows.map((item) => number(item.close)), settings.ma200Length || 200)[index])).filter(Boolean),
      meta: engine.meta("smc-style-structure", "pine-smc-ohlcv-v1", settings, rows),
    };
  }

  function aggregate(rows, interval = "1D") {
    if (interval === "1D") return rows;
    const groups = new Map();
    rows.forEach((row) => {
      const date = new Date(`${row.date}T00:00:00Z`);
      let key;
      if (interval === "1M") key = row.date.slice(0, 7);
      else {
        const copy = new Date(date);
        const day = copy.getUTCDay() || 7;
        copy.setUTCDate(copy.getUTCDate() - day + 1);
        key = copy.toISOString().slice(0, 10);
      }
      if (!groups.has(key)) groups.set(key, { ...row, date: key });
      else {
        const item = groups.get(key);
        item.high = Math.max(item.high, row.high);
        item.low = Math.min(item.low, row.low);
        item.close = row.close;
        item.volume += row.volume;
      }
    });
    return [...groups.values()];
  }

  function truncate(rows, marketDate) {
    return rows.filter((row) => row.date <= marketDate);
  }

  engine.vwap = vwap;
  engine.initialBalance = initialBalance;
  engine.anchoredLevels = anchoredLevels;
  engine.smc = smc;
  engine.aggregate = aggregate;
  engine.truncate = truncate;
})(globalThis);
