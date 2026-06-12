(function exposeIndicatorMath(global) {
  const engine = global.IDXIndicatorEngine || {};
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

  function sma(values, length) {
    return values.map((_, index) => {
      const window = values.slice(index - length + 1, index + 1).map(number);
      return window.length === length && window.every((value) => value !== null)
        ? window.reduce((sum, value) => sum + value, 0) / length
        : null;
    });
  }

  function ema(values, length) {
    const alpha = 2 / (length + 1);
    let current = null;
    return values.map((raw) => {
      const value = number(raw);
      if (value === null) return current;
      current = current === null ? value : (value * alpha) + (current * (1 - alpha));
      return current;
    });
  }

  function rma(values, length) {
    let current = null;
    let seed = [];
    return values.map((raw) => {
      const value = number(raw);
      if (value === null) return current;
      if (current === null) {
        seed.push(value);
        if (seed.length < length) return null;
        if (seed.length > length) seed = seed.slice(-length);
        current = seed.reduce((sum, item) => sum + item, 0) / length;
      } else {
        current = ((current * (length - 1)) + value) / length;
      }
      return current;
    });
  }

  function wma(values, length) {
    const denominator = (length * (length + 1)) / 2;
    return values.map((_, index) => {
      const window = values.slice(index - length + 1, index + 1).map(number);
      if (window.length !== length || window.some((value) => value === null)) return null;
      return window.reduce((sum, value, offset) => sum + (value * (offset + 1)), 0) / denominator;
    });
  }

  function vwma(values, volumes, length) {
    return values.map((_, index) => {
      const priceWindow = values.slice(index - length + 1, index + 1).map(number);
      const volumeWindow = volumes.slice(index - length + 1, index + 1).map(number);
      if (priceWindow.length !== length || priceWindow.some((value) => value === null) || volumeWindow.some((value) => value === null)) return null;
      const totalVolume = volumeWindow.reduce((sum, value) => sum + value, 0);
      return totalVolume > 0
        ? priceWindow.reduce((sum, value, offset) => sum + (value * volumeWindow[offset]), 0) / totalVolume
        : null;
    });
  }

  function trueRange(rows) {
    return rows.map((row, index) => {
      const high = number(row.high);
      const low = number(row.low);
      const previous = index ? number(rows[index - 1].close) : null;
      if (high === null || low === null) return null;
      return previous === null ? high - low : Math.max(high - low, Math.abs(high - previous), Math.abs(low - previous));
    });
  }

  function atr(rows, length = 14) {
    return rma(trueRange(rows), length);
  }

  function stdev(values, length) {
    return values.map((_, index) => {
      const window = values.slice(index - length + 1, index + 1).map(number);
      if (window.length !== length || window.some((value) => value === null)) return null;
      const mean = window.reduce((sum, value) => sum + value, 0) / length;
      return Math.sqrt(window.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / length);
    });
  }

  engine.math = { number, sma, ema, rma, wma, vwma, atr, stdev };
  global.IDXIndicatorEngine = engine;
})(globalThis);
