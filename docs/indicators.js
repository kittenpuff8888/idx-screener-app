(function exposeIndicators(global) {
  const DEFAULTS = Object.freeze({
    schemaVersion: 3,
    chart: { mode: "research", interval: "1D", range: "1Y" },
    ema25: { show: true, period: 25, color: "#1c2d62", width: 1 },
    ema50: { show: true, period: 50, color: "#801922", width: 1 },
    sma200: { show: true, period: 200, color: "#2962ff", width: 1 },
    vwap: {
      show: true, anchor: "Session", source: "hlc3", bandMode: "Standard Deviation",
      showBand1: true, bandMult1: 1, showBand2: false, bandMult2: 2,
      showBand3: false, bandMult3: 3, color: "#22d3ee", width: 2,
    },
    anchorVwap: { show: true, showCurrentQ: true, showNearest: true, color: "#f8fafc", width: 1 },
    volume: { show: true, maShow: true, period: 20, opacity: 0.72, maColor: "#2962ff" },
    rsi: {
      show: true, length: 14, source: "close", smoothingType: "SMA",
      smoothingLength: 14, bbStdDev: 2, divergence: false, color: "#2962ff", width: 2,
    },
    macd: {
      show: true, fastLength: 12, slowLength: 26, signalLength: 9,
      histogramSmoothing: 3, source: "close", lineColor: "#2962ff", signalColor: "#ef4444",
    },
    initialBalance: {
      show: true, initialBalanceDays: 2, color: "#facc15", width: 2,
      showBox: true, boxOpacity: 0.08, showConnectors: true,
    },
    smc: {
      show: true, mode: "Historical", style: "Colored", showInternals: false,
      showStructure: true, showOrderBlocks: false, orderBlockCount: 4,
      showEqualHighLow: false, showFairValueGaps: false, showZones: true,
      showRibbon: true, showMA200: true, internalLength: 5, swingLength: 50,
      equalThreshold: 0.1, ema1Length: 25, ema2Length: 50, ma200Length: 200,
      showLabels: true, opacity: 0.18,
    },
  });

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const numeric = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  function deepMerge(base, override) {
    const result = clone(base);
    Object.entries(override || {}).forEach(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value) && result[key]) {
        result[key] = deepMerge(result[key], value);
      } else if (value !== undefined) {
        result[key] = value;
      }
    });
    return result;
  }

  function emaValues(values, period) {
    const multiplier = 2 / (period + 1);
    let current = null;
    return values.map((value) => {
      const parsed = numeric(value);
      if (parsed === null) return current;
      current = current === null ? parsed : (parsed * multiplier) + (current * (1 - multiplier));
      return current;
    });
  }

  function smaValues(values, period) {
    const output = [];
    const window = [];
    let total = 0;
    values.forEach((value) => {
      const parsed = numeric(value);
      window.push(parsed);
      if (parsed !== null) total += parsed;
      if (window.length > period) {
        const removed = window.shift();
        if (removed !== null) total -= removed;
      }
      const valid = window.filter((item) => item !== null).length;
      output.push(window.length === period && valid === period ? total / period : null);
    });
    return output;
  }

  function rmaValues(values, period) {
    const output = [];
    let current = null;
    values.forEach((value, index) => {
      const parsed = numeric(value);
      if (parsed === null) {
        output.push(current);
        return;
      }
      if (current === null) {
        const seed = values.slice(Math.max(0, index - period + 1), index + 1)
          .map(numeric)
          .filter((item) => item !== null);
        current = seed.length === period ? seed.reduce((sum, item) => sum + item, 0) / period : null;
      } else {
        current = ((current * (period - 1)) + parsed) / period;
      }
      output.push(current);
    });
    return output;
  }

  function lineData(rows, values) {
    return rows.map((row, index) => ({ time: row.date, value: values[index] }))
      .filter((point) => point.value !== null && Number.isFinite(point.value));
  }

  function movingAverage(rows, period, type = "ema", field = "close") {
    const values = rows.map((row) => numeric(row[field]));
    const calculated = type === "sma"
      ? smaValues(values, period)
      : type === "smma"
        ? rmaValues(values, period)
        : emaValues(values, period);
    return lineData(rows, calculated);
  }

  function rsi(rows, period = 14, smoothing = "sma", smoothingPeriod = 14) {
    if (global.IDXIndicatorEngine?.rsi) {
      return global.IDXIndicatorEngine.rsi(rows, {
        length: period,
        smoothingType: smoothing,
        smoothingLength: smoothingPeriod,
      });
    }
    const closes = rows.map((row) => numeric(row.close));
    const gains = closes.map((close, index) => {
      if (index === 0 || close === null || closes[index - 1] === null) return null;
      return Math.max(close - closes[index - 1], 0);
    });
    const losses = closes.map((close, index) => {
      if (index === 0 || close === null || closes[index - 1] === null) return null;
      return Math.max(closes[index - 1] - close, 0);
    });
    const avgGain = rmaValues(gains, period);
    const avgLoss = rmaValues(losses, period);
    const values = avgGain.map((gain, index) => {
      const loss = avgLoss[index];
      if (gain === null || loss === null) return null;
      if (loss === 0) return 100;
      return 100 - (100 / (1 + (gain / loss)));
    });
    let smooth = values.map(() => null);
    if (smoothing !== "none") {
      smooth = smoothing === "ema"
        ? emaValues(values, smoothingPeriod)
        : smoothing === "smma"
          ? rmaValues(values, smoothingPeriod)
          : smaValues(values, smoothingPeriod);
    }
    return { values: lineData(rows, values), smooth: lineData(rows, smooth), raw: values };
  }

  function macd(rows, fast = 12, slow = 26, signalPeriod = 9, histogramSmoothing = 3) {
    if (global.IDXIndicatorEngine?.macd4c) {
      return global.IDXIndicatorEngine.macd4c(rows, {
        fastLength: fast,
        slowLength: slow,
        signalLength: signalPeriod,
        histogramSmoothing,
      });
    }
    const closes = rows.map((row) => numeric(row.close));
    const fastLine = emaValues(closes, fast);
    const slowLine = emaValues(closes, slow);
    const macdValues = fastLine.map((value, index) => (
      value === null || slowLine[index] === null ? null : value - slowLine[index]
    ));
    const signalValues = emaValues(macdValues, signalPeriod);
    const rawHistogram = macdValues.map((value, index) => (
      value === null || signalValues[index] === null ? null : value - signalValues[index]
    ));
    const histogram = emaValues(rawHistogram, histogramSmoothing);
    return {
      line: lineData(rows, macdValues),
      signal: lineData(rows, signalValues),
      histogram: rows.map((row, index) => {
        const value = histogram[index];
        if (value === null) return null;
        const previous = index ? histogram[index - 1] : value;
        const rising = previous === null || value >= previous;
        const color = value >= 0
          ? (rising ? "#cbd5e1" : "#ef4444")
          : (rising ? "#3b82f6" : "#fca5a5");
        return { time: row.date, value, color };
      }).filter(Boolean),
    };
  }

  function anchorKey(dateText, anchor) {
    const date = new Date(`${dateText}T00:00:00Z`);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    if (anchor === "session") return dateText;
    if (anchor === "year") return `${year}`;
    if (anchor === "quarter") return `${year}-Q${Math.floor(month / 3) + 1}`;
    if (anchor === "week") {
      const copy = new Date(date);
      const day = copy.getUTCDay() || 7;
      copy.setUTCDate(copy.getUTCDate() - day + 1);
      return copy.toISOString().slice(0, 10);
    }
    return `${year}-${String(month + 1).padStart(2, "0")}`;
  }

  function anchoredVwap(rows, anchor = "month", multiplier = 1) {
    if (global.IDXIndicatorEngine?.vwap) {
      const result = global.IDXIndicatorEngine.vwap(rows, {
        anchor,
        bandMult1: multiplier,
      });
      return {
        vwap: result.vwap,
        upper: result.bands[0].upper,
        lower: result.bands[0].lower,
        meta: result.meta,
      };
    }
    let key = "";
    let cumulativeVolume = 0;
    let cumulativePriceVolume = 0;
    let cumulativeVarianceVolume = 0;
    const vwap = [];
    const upper = [];
    const lower = [];
    rows.forEach((row) => {
      const nextKey = anchorKey(row.date, anchor);
      if (nextKey !== key) {
        key = nextKey;
        cumulativeVolume = 0;
        cumulativePriceVolume = 0;
        cumulativeVarianceVolume = 0;
      }
      const high = numeric(row.high);
      const low = numeric(row.low);
      const close = numeric(row.close);
      const volume = numeric(row.volume);
      if ([high, low, close, volume].some((value) => value === null) || volume <= 0) return;
      const typical = (high + low + close) / 3;
      cumulativeVolume += volume;
      cumulativePriceVolume += typical * volume;
      const running = cumulativePriceVolume / cumulativeVolume;
      cumulativeVarianceVolume += ((typical - running) ** 2) * volume;
      const deviation = Math.sqrt(Math.max(cumulativeVarianceVolume / cumulativeVolume, 0));
      vwap.push({ time: row.date, value: running });
      upper.push({ time: row.date, value: running + (deviation * multiplier) });
      lower.push({ time: row.date, value: running - (deviation * multiplier) });
    });
    return { vwap, upper, lower };
  }

  function initialBalance(rows, days = 2) {
    if (global.IDXIndicatorEngine?.initialBalance) {
      return global.IDXIndicatorEngine.initialBalance(rows, { initialBalanceDays: days });
    }
    const outputHigh = [];
    const outputLow = [];
    let month = "";
    let monthRows = 0;
    let high = null;
    let low = null;
    rows.forEach((row) => {
      const rowMonth = row.date.slice(0, 7);
      if (rowMonth !== month) {
        month = rowMonth;
        monthRows = 0;
        high = null;
        low = null;
      }
      monthRows += 1;
      if (monthRows <= days) {
        high = high === null ? numeric(row.high) : Math.max(high, numeric(row.high));
        low = low === null ? numeric(row.low) : Math.min(low, numeric(row.low));
      }
      if (high !== null) outputHigh.push({ time: row.date, value: high });
      if (low !== null) outputLow.push({ time: row.date, value: low });
    });
    return { high: outputHigh, low: outputLow };
  }

  function pivotStructureMarkers(rows, pivotLength, equalTolerance, prefix = "") {
    const markers = [];
    const highs = [];
    const lows = [];
    for (let index = pivotLength; index < rows.length - pivotLength; index += 1) {
      const window = rows.slice(index - pivotLength, index + pivotLength + 1);
      const high = numeric(rows[index].high);
      const low = numeric(rows[index].low);
      if (high !== null && high === Math.max(...window.map((row) => numeric(row.high) ?? -Infinity))) {
        const previous = highs.at(-1);
        const equal = previous && Math.abs((high / previous.price) - 1) * 100 <= equalTolerance;
        highs.push({ index, price: high });
        markers.push({
          time: rows[index].date,
          position: "aboveBar",
          color: equal ? "#60a5fa" : "#94a3b8",
          shape: equal ? "circle" : "arrowDown",
          text: equal ? `${prefix}EQH` : `${prefix}SH`,
        });
      }
      if (low !== null && low === Math.min(...window.map((row) => numeric(row.low) ?? Infinity))) {
        const previous = lows.at(-1);
        const equal = previous && Math.abs((low / previous.price) - 1) * 100 <= equalTolerance;
        lows.push({ index, price: low });
        markers.push({
          time: rows[index].date,
          position: "belowBar",
          color: equal ? "#f87171" : "#94a3b8",
          shape: equal ? "circle" : "arrowUp",
          text: equal ? `${prefix}EQL` : `${prefix}SL`,
        });
      }
    }
    let lastHigh = null;
    let lastLow = null;
    rows.forEach((row, index) => {
      highs.filter((pivot) => pivot.index < index).forEach((pivot) => { lastHigh = pivot.price; });
      lows.filter((pivot) => pivot.index < index).forEach((pivot) => { lastLow = pivot.price; });
      const close = numeric(row.close);
      const previousClose = index ? numeric(rows[index - 1].close) : null;
      if (lastHigh !== null && previousClose !== null && previousClose <= lastHigh && close > lastHigh) {
        markers.push({ time: row.date, position: "belowBar", color: "#3b82f6", shape: "arrowUp", text: `${prefix}Break` });
        lastHigh = null;
      }
      if (lastLow !== null && previousClose !== null && previousClose >= lastLow && close < lastLow) {
        markers.push({ time: row.date, position: "aboveBar", color: "#f87171", shape: "arrowDown", text: `${prefix}Break` });
        lastLow = null;
      }
    });
    return markers;
  }

  function structureMarkers(rows, internalLength = 3, swingLength = 10, equalTolerance = 0.1) {
    const internal = pivotStructureMarkers(rows, internalLength, equalTolerance, "i");
    const swing = pivotStructureMarkers(rows, swingLength, equalTolerance);
    return [...internal, ...swing]
      .sort((a, b) => a.time.localeCompare(b.time))
      .slice(-160);
  }

  global.IDXIndicators = {
    DEFAULTS,
    deepMerge,
    movingAverage,
    smaValues,
    emaValues,
    rsi,
    macd,
    anchoredVwap,
    initialBalance,
    structureMarkers,
  };
})(window);
