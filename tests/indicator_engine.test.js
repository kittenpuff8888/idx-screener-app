const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
global.window = global;
for (const file of [
  "docs/chart/indicator-engine/math.js",
  "docs/chart/indicator-engine/overlays.js",
  "docs/chart/indicator-engine/momentum.js",
]) {
  vm.runInThisContext(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
}

const rows = Array.from({ length: 280 }, (_, index) => {
  const date = new Date(Date.UTC(2025, 0, 2 + index));
  const close = 100 + (index * 0.2) + (Math.sin(index / 5) * 4);
  return {
    date: date.toISOString().slice(0, 10),
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: 1_000_000 + (index * 1_000),
    source: "fixture",
  };
});

assert.equal(IDXIndicatorEngine.math.sma([1, 2, 3, 4], 3).at(-1), 3);
assert.equal(IDXIndicatorEngine.math.rma([1, 2, 3, 4], 3)[2], 2);
assert.equal(IDXIndicatorEngine.initialBalance(rows, { initialBalanceDays: 2 }).meta.formulaVersion, "pine-ibh-ibl-v1");
assert.equal(IDXIndicatorEngine.vwap(rows, { anchor: "Month" }).meta.status, "ok");
assert.ok(IDXIndicatorEngine.rsi(rows, { length: 14 }).values.length > 0);
assert.ok(IDXIndicatorEngine.macd4c(rows, {}).histogram.length > 0);
assert.ok(Number.isFinite(IDXIndicatorEngine.anchoredLevels(rows).currentQ.value));

const cutoff = rows[220].date;
const truncated = IDXIndicatorEngine.truncate(rows, cutoff);
assert.equal(truncated.at(-1).date, cutoff);
const structure = IDXIndicatorEngine.smc(truncated, { internalLength: 5, swingLength: 20 });
assert.ok(structure.events.every((event) => event.time <= cutoff));
assert.ok(structure.equalLevels.every((event) => event.time <= cutoff));
assert.equal(structure.meta.asOf, cutoff);

console.log("indicator engine tests passed");
