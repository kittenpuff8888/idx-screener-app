(function exposeMomentum(global) {
  const engine = global.IDXIndicatorEngine;
  const { number, sma, ema, rma, wma, vwma, stdev } = engine.math;
  const points = (rows, values) => rows.map((row, index) => ({ time: row.date, value: values[index] }))
    .filter((point) => Number.isFinite(point.value));

  function rsi(rows, settings = {}) {
    const length = settings.length || settings.period || 14;
    const source = settings.source || "close";
    const values = rows.map((row) => number(row[source]));
    const changes = values.map((value, index) => index && value !== null && values[index - 1] !== null ? value - values[index - 1] : null);
    const up = rma(changes.map((value) => value === null ? null : Math.max(value, 0)), length);
    const down = rma(changes.map((value) => value === null ? null : Math.max(-value, 0)), length);
    const raw = up.map((gain, index) => {
      const loss = down[index];
      if (gain === null || loss === null) return null;
      if (loss === 0) return 100;
      if (gain === 0) return 0;
      return 100 - (100 / (1 + (gain / loss)));
    });
    const smoothingType = String(settings.smoothingType || settings.smoothing || "SMA").toUpperCase();
    const smoothingLength = settings.smoothingLength || settings.smoothingPeriod || 14;
    const volumes = rows.map((row) => number(row.volume));
    let smooth = raw.map(() => null);
    if (smoothingType === "EMA") smooth = ema(raw, smoothingLength);
    else if (["SMMA", "SMMA (RMA)", "RMA"].includes(smoothingType)) smooth = rma(raw, smoothingLength);
    else if (smoothingType === "WMA") smooth = wma(raw, smoothingLength);
    else if (smoothingType === "VWMA") smooth = vwma(raw, volumes, smoothingLength);
    else if (smoothingType !== "NONE") smooth = sma(raw, smoothingLength);
    const deviation = smoothingType.includes("BOLLINGER") ? stdev(raw, smoothingLength) : raw.map(() => null);
    const multiplier = settings.bbStdDev || 2;
    return {
      values: points(rows, raw),
      smooth: points(rows, smooth),
      upper: points(rows, smooth.map((value, index) => value === null || deviation[index] === null ? null : value + (deviation[index] * multiplier))),
      lower: points(rows, smooth.map((value, index) => value === null || deviation[index] === null ? null : value - (deviation[index] * multiplier))),
      raw,
      meta: engine.meta("rsi", "pine-rsi-v1", settings, rows),
    };
  }

  function macd4c(rows, settings = {}) {
    const source = settings.source || "close";
    const values = rows.map((row) => number(row[source]));
    const fast = ema(values, settings.fastLength || settings.fast || 12);
    const slow = ema(values, settings.slowLength || settings.slow || 26);
    const line = fast.map((value, index) => value === null || slow[index] === null ? null : value - slow[index]);
    const signal = ema(line, settings.signalLength || settings.signal || 9);
    const rawHistogram = line.map((value, index) => value === null || signal[index] === null ? null : value - signal[index]);
    const smoothing = settings.histogramSmoothing || 3;
    const histogram = smoothing > 1 ? ema(rawHistogram, smoothing) : rawHistogram;
    return {
      line: points(rows, line),
      signal: points(rows, signal),
      histogram: rows.map((row, index) => {
        const value = histogram[index];
        if (!Number.isFinite(value)) return null;
        const previous = index ? histogram[index - 1] : value;
        const color = value >= 0
          ? (value > previous ? "#c0c0c0" : "#ef4444")
          : (value < previous ? "#ff5050" : "#2962ff");
        return { time: row.date, value, color };
      }).filter(Boolean),
      raw: { line, signal, histogram },
      meta: engine.meta("macd4c", "pine-macd-4c-v1", settings, rows),
    };
  }

  engine.rsi = rsi;
  engine.macd4c = macd4c;
})(globalThis);
