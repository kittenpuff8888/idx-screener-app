const state = {
  manifest: null,
  payload: null,
  history: { dates: [], tickers: {} },
  view: "overview",
  strategy: "ALL",
  sector: "ALL",
  search: "",
  sort: "default",
  dataSearch: "",
  selectedTicker: "",
  technicalByTicker: new Map(),
  fundamentalByTicker: new Map(),
  newsByTicker: new Map(),
  signalsByTicker: new Map(),
};

const viewTitles = {
  overview: ["IDX RESEARCH", "Market Overview"],
  screener: ["SIGNAL DISCOVERY", "Signal Screener"],
  ticker: ["SECURITY RESEARCH", "Ticker Analysis"],
  data: ["RUN INTEGRITY", "Data Quality"],
};

const screenerColumns = [
  { label: "Filter", key: "filter", className: "" },
  { label: "Ticker", key: "ticker", className: "" },
  { label: "Sector", key: "sector", className: "" },
  { label: "Price", key: "price", className: "numeric" },
  { label: "Change", key: "change", className: "numeric" },
  { label: "RVOL", key: "rvol", className: "numeric" },
  { label: "MA", key: "ma", className: "" },
  { label: "RS", key: "rs", className: "numeric" },
  { label: "Entry", key: "entry", className: "numeric" },
  { label: "Target", key: "target", className: "numeric" },
  { label: "Upside", key: "upside", className: "numeric" },
  { label: "Invalidation", key: "invalidation", className: "numeric" },
  { label: "R/R", key: "rr", className: "numeric" },
  { label: "Signal explanation", key: "summary", className: "explanation" },
];

const dataColumns = [
  "Ticker",
  "Status",
  "Bars",
  "Retry Count",
  "Source Used",
  "Latest Market Day",
  "Reason",
];

const els = {
  loadBar: document.querySelector("#loadBar"),
  errorBanner: document.querySelector("#errorBanner"),
  pageTitle: document.querySelector("#pageTitle"),
  eyebrow: document.querySelector("#eyebrow"),
  sidebarDate: document.querySelector("#sidebarDate"),
  dateSelect: document.querySelector("#dateSelect"),
  downloadLink: document.querySelector("#downloadLink"),
  tickerCommand: document.querySelector("#tickerCommand"),
  tickerList: document.querySelector("#tickerList"),
  menuButton: document.querySelector("#menuButton"),
  runMeta: document.querySelector("#runMeta"),
  coverageBadge: document.querySelector("#coverageBadge"),
  metricGrid: document.querySelector("#metricGrid"),
  breadthTone: document.querySelector("#breadthTone"),
  breadthChart: document.querySelector("#breadthChart"),
  signalMap: document.querySelector("#signalMap"),
  sectorHeatmap: document.querySelector("#sectorHeatmap"),
  gainersList: document.querySelector("#gainersList"),
  declinersList: document.querySelector("#declinersList"),
  screenerCount: document.querySelector("#screenerCount"),
  screenerSearch: document.querySelector("#screenerSearch"),
  sectorSelect: document.querySelector("#sectorSelect"),
  sortSelect: document.querySelector("#sortSelect"),
  strategyFilters: document.querySelector("#strategyFilters"),
  screenerHead: document.querySelector("#screenerHead"),
  screenerBody: document.querySelector("#screenerBody"),
  screenerEmpty: document.querySelector("#screenerEmpty"),
  tickerEmpty: document.querySelector("#tickerEmpty"),
  tickerContent: document.querySelector("#tickerContent"),
  tickerHero: document.querySelector("#tickerHero"),
  historyMeta: document.querySelector("#historyMeta"),
  priceChart: document.querySelector("#priceChart"),
  tradePlan: document.querySelector("#tradePlan"),
  tickerSignals: document.querySelector("#tickerSignals"),
  technicalGrid: document.querySelector("#technicalGrid"),
  fundamentalGrid: document.querySelector("#fundamentalGrid"),
  newsPanel: document.querySelector("#newsPanel"),
  qualityMetrics: document.querySelector("#qualityMetrics"),
  dataSearch: document.querySelector("#dataSearch"),
  dataCount: document.querySelector("#dataCount"),
  dataHead: document.querySelector("#dataHead"),
  dataBody: document.querySelector("#dataBody"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanText(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value)
    .replaceAll("\u00e2\u20ac\u00a2", "\u2022")
    .replaceAll("\u00c2\u00b7", "\u00b7")
    .replaceAll("\u00e2\u2020\u2018", "\u2191")
    .replaceAll("\u00e2\u2020\u201c", "\u2193")
    .replaceAll("\u00e2\u2020\u2019", "\u2192")
    .replaceAll("\u00e2\u20ac\u201d", "\u2014");
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const match = String(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function valueFrom(row, names) {
  if (!row) return null;
  for (const name of names) {
    if (row[name] !== null && row[name] !== undefined && row[name] !== "" && row[name] !== "-") {
      return row[name];
    }
    const groupedKey = Object.keys(row).find((key) => key.endsWith(` \u00b7 ${name}`));
    if (groupedKey && row[groupedKey] !== null && row[groupedKey] !== undefined && row[groupedKey] !== "") {
      return row[groupedKey];
    }
  }
  return null;
}

function formatNumber(value, digits = 2) {
  const parsed = asNumber(value);
  if (parsed === null) return cleanText(value);
  return parsed.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function percentNumber(value) {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  return Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
}

function formatPercent(value) {
  const parsed = percentNumber(value);
  if (parsed === null) return cleanText(value);
  return `${parsed > 0 ? "+" : ""}${parsed.toFixed(2)}%`;
}

function percentClass(value) {
  const parsed = percentNumber(value);
  if (parsed === null || parsed === 0) return "neutral";
  return parsed > 0 ? "positive" : "negative";
}

function formatPrice(value) {
  const parsed = asNumber(value);
  if (parsed === null) return cleanText(value);
  return parsed.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function loading(progress) {
  els.loadBar.style.opacity = "1";
  els.loadBar.style.width = `${progress}%`;
  if (progress >= 100) {
    window.setTimeout(() => {
      els.loadBar.style.opacity = "0";
      els.loadBar.style.width = "0";
    }, 260);
  }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

function showError(message) {
  els.errorBanner.textContent = message;
  els.errorBanner.hidden = false;
}

function mapRows(rows) {
  return new Map((rows || []).map((row) => [String(row.Ticker || "").toUpperCase(), row]));
}

function groupRows(rows) {
  const grouped = new Map();
  for (const row of rows || []) {
    const ticker = String(row.Ticker || "").toUpperCase();
    if (!ticker) continue;
    if (!grouped.has(ticker)) grouped.set(ticker, []);
    grouped.get(ticker).push(row);
  }
  return grouped;
}

function rebuildIndexes() {
  state.technicalByTicker = mapRows(state.payload.technical);
  state.fundamentalByTicker = mapRows(state.payload.fundamental);
  state.newsByTicker = groupRows(state.payload.news);
  state.signalsByTicker = groupRows(state.payload.screener);

  const tickers = [...new Set([
    ...state.technicalByTicker.keys(),
    ...state.fundamentalByTicker.keys(),
    ...state.signalsByTicker.keys(),
  ])].sort();
  els.tickerList.innerHTML = tickers.map((ticker) => `<option value="${escapeHtml(ticker)}"></option>`).join("");
}

function canonicalSignal(row) {
  const ticker = String(row.Ticker || "").toUpperCase();
  const technical = state.technicalByTicker.get(ticker) || {};
  return {
    raw: row,
    filter: String(row.Filter || ""),
    label: cleanText(valueFrom(row, ["Filter Label"]) || `Filter ${row.Filter || ""}`),
    ticker,
    sector: cleanText(valueFrom(row, ["Sector", "IDX Sector"])),
    price: valueFrom(row, ["Price", "Closing Price"]),
    change: valueFrom(row, ["Chg %", "Price Change %"]),
    rvol: valueFrom(row, ["RVOL", "RVOL 20 D"]),
    ma: valueFrom(row, ["MA", "MA Position", "MA Zone"]),
    rs: valueFrom(row, ["RS Rating"]) ?? valueFrom(technical, ["RS Rating"]),
    entry: valueFrom(row, ["Entry"]),
    target: valueFrom(row, ["Target"]),
    upside: valueFrom(row, ["Target Upside %", "Upside %"]),
    invalidation: valueFrom(row, ["Invalidation"]),
    rr: valueFrom(row, ["R/R"]),
    summary: valueFrom(row, ["Summary Screener"]) || row.Section || "",
  };
}

function signalsOverview() {
  const exported = state.payload.overview?.signals;
  if (exported?.length) return exported;
  const counts = new Map();
  for (const row of state.payload.screener || []) {
    const id = String(row.Filter || "");
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts].map(([id, count]) => ({
    id,
    count,
    label: valueFrom((state.payload.screener || []).find((row) => row.Filter === id), ["Filter Label"]) || `Filter ${id}`,
  }));
}

function showView(view, updateHash = true) {
  if (!viewTitles[view]) view = "overview";
  state.view = view;
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === view);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  [els.eyebrow.textContent, els.pageTitle.textContent] = viewTitles[view];
  document.body.classList.remove("nav-open");
  if (updateHash) {
    const suffix = view === "ticker" && state.selectedTicker ? `/${state.selectedTicker}` : "";
    history.replaceState(null, "", `#${view}${suffix}`);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function routeFromHash() {
  const route = location.hash.replace(/^#/, "").split("/");
  const view = route[0] || "overview";
  if (view === "ticker" && route[1]) selectTicker(route[1], false);
  showView(view, false);
}

function metricCard(label, value, detail, tone = "") {
  return `
    <article class="metric-card ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function renderOverview() {
  const summary = state.payload.summary || {};
  const overview = state.payload.overview || {};
  const breadth = overview.breadth || { advances: 0, declines: 0, unchanged: 0 };
  const signalRows = summary.signalRows ?? state.payload.screener.length;
  const signalTickers = summary.signalTickers ?? state.signalsByTicker.size;
  const total = Number(summary.totalScanned ?? state.payload.technical.length);
  const coverage = total ? ((Number(summary.ok || 0) / total) * 100).toFixed(1) : "0.0";

  els.runMeta.textContent = `Market data ${state.payload.date} \u00b7 Run ${cleanText(state.payload.runTime)}`;
  els.coverageBadge.textContent = formatNumber(total, 0);
  els.metricGrid.innerHTML = [
    metricCard("Signals", formatNumber(signalRows, 0), `${formatNumber(signalTickers, 0)} unique tickers`, "positive"),
    metricCard("Advancing", formatNumber(breadth.advances, 0), "Positive daily change", "positive"),
    metricCard("Declining", formatNumber(breadth.declines, 0), "Negative daily change", "negative"),
    metricCard("Full coverage", `${coverage}%`, `${formatNumber(summary.ok, 0)} complete records`, "amber"),
  ].join("");

  renderBreadth(breadth);
  renderSignalMap();
  renderSectorHeatmap(overview.sectors || []);
  renderMovers(els.gainersList, overview.topGainers || []);
  renderMovers(els.declinersList, overview.topDecliners || []);
}

function renderBreadth(breadth) {
  const advances = Number(breadth.advances || 0);
  const declines = Number(breadth.declines || 0);
  const unchanged = Number(breadth.unchanged || 0);
  const total = Math.max(1, advances + declines + unchanged);
  const advancePct = (advances / total) * 100;
  const declineEnd = advancePct + (declines / total) * 100;
  const ratio = declines ? advances / declines : advances;
  const tone = ratio >= 1 ? "positive" : "negative";
  els.breadthTone.className = `tone-badge ${tone}`;
  els.breadthTone.textContent = ratio >= 1 ? "Constructive" : "Defensive";
  els.breadthChart.innerHTML = `
    <div class="donut" style="--advance:${advancePct}%;--decline:${declineEnd}%">
      <div class="donut-label">
        <strong>${ratio.toFixed(2)}</strong>
        <span>A / D ratio</span>
      </div>
    </div>
    <div class="breadth-legend">
      <div class="legend-row" style="--legend:var(--green)"><i></i><span>Advancing</span><strong>${advances}</strong></div>
      <div class="legend-row" style="--legend:var(--red)"><i></i><span>Declining</span><strong>${declines}</strong></div>
      <div class="legend-row" style="--legend:#52635d"><i></i><span>Unchanged</span><strong>${unchanged}</strong></div>
      <div class="breadth-bar">
        <span style="width:${advancePct}%"></span>
        <span style="width:${Math.max(0, declineEnd - advancePct)}%"></span>
      </div>
    </div>
  `;
}

function renderSignalMap() {
  const signals = signalsOverview();
  els.signalMap.innerHTML = signals.map((signal) => `
    <button class="signal-tile" type="button" data-strategy="${escapeHtml(signal.id)}">
      <span class="signal-code">${escapeHtml(signal.id)}</span>
      <span>
        <span class="signal-name">${escapeHtml(cleanText(signal.label))}</span>
        <span class="signal-sub">Workbook filter ${escapeHtml(signal.id)}</span>
      </span>
      <strong>${formatNumber(signal.count, 0)}</strong>
    </button>
  `).join("");
}

function renderSectorHeatmap(sectors) {
  const visible = [...sectors]
    .sort((a, b) => (b.signals || 0) - (a.signals || 0) || (b.count || 0) - (a.count || 0))
    .slice(0, 18);
  els.sectorHeatmap.innerHTML = visible.map((sector) => {
    const change = percentNumber(sector.avgChange) || 0;
    const strength = Math.min(0.24, 0.06 + Math.abs(change) / 35);
    const positive = change >= 0;
    const rgb = positive ? "82,229,164" : "255,119,130";
    return `
      <button
        class="sector-cell"
        type="button"
        data-sector="${escapeHtml(sector.sector)}"
        style="--cell-bg:rgba(${rgb},${strength});--cell-border:rgba(${rgb},${Math.min(0.38, strength + 0.08)})"
      >
        <span>${escapeHtml(cleanText(sector.sector))}</span>
        <strong class="${positive ? "positive" : "negative"}">${formatPercent(sector.avgChange)}</strong>
        <small>${formatNumber(sector.signals, 0)} signal tickers \u00b7 ${formatNumber(sector.count, 0)} covered</small>
      </button>
    `;
  }).join("") || `<div class="no-chart">No sector overview is available.</div>`;
}

function renderMovers(element, rows) {
  element.innerHTML = rows.slice(0, 7).map((row) => `
    <div class="mover-row" data-ticker="${escapeHtml(row.ticker)}">
      <button class="ticker-link" type="button">${escapeHtml(row.ticker)}</button>
      <span class="mover-sector">${escapeHtml(cleanText(row.sector))}</span>
      <span class="mono-value">${formatPrice(row.price)}</span>
      <strong class="mono-value ${percentClass(row.change)}">${formatPercent(row.change)}</strong>
    </div>
  `).join("") || `<div class="no-chart">No mover data is available.</div>`;
}

function setupScreenerControls() {
  const sectors = [...new Set((state.payload.screener || []).map((row) => cleanText(valueFrom(row, ["Sector", "IDX Sector"]))))].sort();
  const current = state.sector;
  els.sectorSelect.innerHTML = `<option value="ALL">All sectors</option>${sectors
    .filter((sector) => sector !== "-")
    .map((sector) => `<option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>`)
    .join("")}`;
  els.sectorSelect.value = sectors.includes(current) ? current : "ALL";
  if (els.sectorSelect.value === "ALL") state.sector = "ALL";
}

function renderStrategyFilters() {
  const signals = signalsOverview();
  const total = state.payload.screener.length;
  els.strategyFilters.innerHTML = [
    `<button class="strategy-chip ${state.strategy === "ALL" ? "active" : ""}" data-strategy="ALL" type="button">All <strong>${total}</strong></button>`,
    ...signals.map((signal) => `
      <button class="strategy-chip ${state.strategy === signal.id ? "active" : ""}" data-strategy="${escapeHtml(signal.id)}" type="button">
        ${escapeHtml(signal.id)} \u00b7 ${escapeHtml(cleanText(signal.label))}<strong>${signal.count}</strong>
      </button>
    `),
  ].join("");
}

function filteredSignals() {
  const needle = state.search.trim().toLowerCase();
  let rows = (state.payload.screener || []).map(canonicalSignal);
  if (state.strategy !== "ALL") rows = rows.filter((row) => row.filter === state.strategy);
  if (state.sector !== "ALL") rows = rows.filter((row) => row.sector === state.sector);
  if (needle) {
    rows = rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle)));
  }
  const sorters = {
    "change-desc": (a, b) => (percentNumber(b.change) ?? -Infinity) - (percentNumber(a.change) ?? -Infinity),
    "rvol-desc": (a, b) => (asNumber(b.rvol) ?? -Infinity) - (asNumber(a.rvol) ?? -Infinity),
    "upside-desc": (a, b) => (percentNumber(b.upside) ?? -Infinity) - (percentNumber(a.upside) ?? -Infinity),
    "rs-desc": (a, b) => (asNumber(b.rs) ?? -Infinity) - (asNumber(a.rs) ?? -Infinity),
  };
  if (sorters[state.sort]) rows.sort(sorters[state.sort]);
  return rows;
}

function screenerCell(row, column) {
  const value = row[column.key];
  if (column.key === "filter") return `<span class="filter-badge">${escapeHtml(value)}</span>`;
  if (column.key === "ticker") return `<button class="ticker-link" type="button">${escapeHtml(value)}</button>`;
  if (column.key === "change" || column.key === "upside") {
    return `<span class="${percentClass(value)}">${escapeHtml(formatPercent(value))}</span>`;
  }
  if (["price", "entry", "target", "invalidation"].includes(column.key)) return escapeHtml(formatPrice(value));
  if (["rvol", "rs"].includes(column.key)) return escapeHtml(formatNumber(value));
  return escapeHtml(cleanText(value));
}

function renderScreener() {
  setupScreenerControls();
  renderStrategyFilters();
  const rows = filteredSignals();
  const visible = rows.slice(0, 600);
  els.screenerCount.textContent = rows.length > visible.length
    ? `${visible.length} of ${rows.length} rows`
    : `${rows.length} signal rows`;
  els.screenerHead.innerHTML = `<tr>${screenerColumns.map((column) => `<th class="${column.className}">${column.label}</th>`).join("")}</tr>`;
  els.screenerBody.innerHTML = visible.map((row) => `
    <tr data-ticker="${escapeHtml(row.ticker)}">
      ${screenerColumns.map((column) => `<td class="${column.className}">${screenerCell(row, column)}</td>`).join("")}
    </tr>
  `).join("");
  els.screenerEmpty.hidden = rows.length > 0;
}

function selectTicker(ticker, updateHash = true) {
  const normalized = String(ticker || "").trim().toUpperCase().replace(".JK", "");
  if (!normalized) return;
  const exists = state.technicalByTicker.has(normalized)
    || state.fundamentalByTicker.has(normalized)
    || state.signalsByTicker.has(normalized);
  if (!exists) {
    showError(`Ticker ${normalized} is not present in the selected market-date dataset.`);
    return;
  }
  els.errorBanner.hidden = true;
  state.selectedTicker = normalized;
  els.tickerCommand.value = normalized;
  renderTicker();
  showView("ticker", updateHash);
}

function renderTicker() {
  const ticker = state.selectedTicker;
  if (!ticker) {
    els.tickerEmpty.hidden = false;
    els.tickerContent.hidden = true;
    return;
  }
  const technical = state.technicalByTicker.get(ticker) || {};
  const fundamental = state.fundamentalByTicker.get(ticker) || {};
  const signals = state.signalsByTicker.get(ticker) || [];
  const primarySignal = signals[0] || {};
  const price = valueFrom(technical, ["Closing Price", "Price"]) ?? valueFrom(primarySignal, ["Price"]);
  const change = valueFrom(technical, ["Price Change %", "Chg %"]) ?? valueFrom(primarySignal, ["Chg %"]);
  const company = valueFrom(technical, ["Emiten"]) || valueFrom(fundamental, ["Company", "Emiten"]) || "IDX listed company";
  const sector = valueFrom(technical, ["IDX Sector", "Sector"]) || valueFrom(fundamental, ["IDX Sector"]) || "-";

  els.tickerEmpty.hidden = true;
  els.tickerContent.hidden = false;
  els.tickerHero.innerHTML = `
    <div class="ticker-identity">
      <span class="ticker-avatar">${escapeHtml(ticker.slice(0, 3))}</span>
      <div>
        <h2>${escapeHtml(ticker)}</h2>
        <p>${escapeHtml(cleanText(company))} \u00b7 ${escapeHtml(cleanText(sector))}</p>
      </div>
    </div>
    <div class="ticker-quote">
      <strong>${formatPrice(price)}</strong>
      <span class="${percentClass(change)}">${formatPercent(change)}</span>
    </div>
  `;

  renderPriceChart(ticker);
  renderTradePlan(primarySignal, price);
  renderTickerSignals(signals, technical);
  renderTechnical(technical);
  renderFundamental(fundamental);
  renderNews(ticker, signals, technical);
}

function renderPriceChart(ticker) {
  const points = (state.history.tickers?.[ticker] || []).filter((point) => asNumber(point.price) !== null);
  els.historyMeta.textContent = `${points.length} published market dates`;
  if (points.length < 2) {
    els.priceChart.innerHTML = `<div class="no-chart">At least two published dates are needed for a price line.</div>`;
    return;
  }

  const width = 720;
  const height = 250;
  const pad = { top: 18, right: 56, bottom: 30, left: 16 };
  const prices = points.map((point) => asNumber(point.price));
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  const spread = Math.max(1, max - min);
  min -= spread * 0.08;
  max += spread * 0.08;
  const x = (index) => pad.left + (index / (points.length - 1)) * (width - pad.left - pad.right);
  const y = (price) => pad.top + ((max - price) / (max - min)) * (height - pad.top - pad.bottom);
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(2)},${y(asNumber(point.price)).toFixed(2)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${height - pad.bottom} L${x(0)},${height - pad.bottom} Z`;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const gridY = pad.top + ratio * (height - pad.top - pad.bottom);
    const label = max - ratio * (max - min);
    return `<line class="chart-grid" x1="${pad.left}" y1="${gridY}" x2="${width - pad.right}" y2="${gridY}"></line>
      <text class="chart-label" x="${width - pad.right + 8}" y="${gridY + 3}">${formatPrice(label)}</text>`;
  }).join("");
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const dates = labelIndexes.map((index) => `<text class="chart-label" x="${x(index)}" y="${height - 8}" text-anchor="${index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}">${escapeHtml(points[index].date.slice(5))}</text>`).join("");
  const dots = points.map((point, index) => `<circle class="chart-dot" cx="${x(index)}" cy="${y(asNumber(point.price))}" r="3"><title>${escapeHtml(point.date)}: ${formatPrice(point.price)}</title></circle>`).join("");

  els.priceChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ticker)} published closing price history">
      <defs>
        <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#52e5a4" stop-opacity="0.2"></stop>
          <stop offset="100%" stop-color="#52e5a4" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      ${grid}
      <path class="chart-area" d="${area}"></path>
      <path class="chart-line" d="${line}"></path>
      ${dots}
      ${dates}
    </svg>
  `;
}

function renderTradePlan(signal, currentPrice) {
  const entry = asNumber(valueFrom(signal, ["Entry"]));
  const target = asNumber(valueFrom(signal, ["Target"]));
  const invalidation = asNumber(valueFrom(signal, ["Invalidation"]));
  const current = asNumber(currentPrice);
  const levels = [entry, target, invalidation, current].filter((value) => value !== null);
  if (levels.length < 2) {
    els.tradePlan.innerHTML = `<div class="no-chart">No complete entry, target, and invalidation plan is available for this ticker.</div>`;
    return;
  }
  const low = Math.min(...levels);
  const high = Math.max(...levels);
  const range = Math.max(1, high - low);
  const position = (value) => Math.max(4, Math.min(96, ((value - low) / range) * 100));
  const markers = [
    ["Invalidation", invalidation, ""],
    ["Entry", entry, ""],
    ["Current", current, "current"],
    ["Target", target, ""],
  ].filter(([, value]) => value !== null);
  const upside = valueFrom(signal, ["Target Upside %", "Upside %"]);
  const risk = valueFrom(signal, ["Invalidation Down %"]);
  const rr = valueFrom(signal, ["R/R"]);

  els.tradePlan.innerHTML = `
    <div class="level-track">
      ${markers.map(([label, value, className]) => `
        <span class="level-marker ${className}" style="left:${position(value)}%" data-label="${label}" data-value="${formatPrice(value)}"></span>
      `).join("")}
    </div>
    <div class="level-cards">
      <div class="level-card"><span>Target upside</span><strong class="${percentClass(upside)}">${formatPercent(upside)}</strong></div>
      <div class="level-card"><span>Invalidation distance</span><strong>${risk === null ? "-" : formatPercent(risk)}</strong></div>
      <div class="level-card"><span>Risk / reward</span><strong>${escapeHtml(cleanText(rr))}</strong></div>
    </div>
  `;
}

function renderTickerSignals(signals, technical) {
  const rs = valueFrom(technical, ["RS Rating"]);
  if (!signals.length) {
    els.tickerSignals.innerHTML = `<div class="no-chart">This ticker has technical data but did not match a published screener filter on this date.</div>`;
    return;
  }
  els.tickerSignals.innerHTML = signals.map((signal) => {
    const id = String(signal.Filter || "");
    const label = valueFrom(signal, ["Filter Label"]) || `Filter ${id}`;
    const explanation = valueFrom(signal, ["Summary Screener"]) || signal.Section || `${label} matched the workbook criteria.`;
    return `
      <article class="ticker-signal">
        <span class="signal-code">${escapeHtml(id)}</span>
        <div>
          <h4>${escapeHtml(cleanText(label))}</h4>
          <p>${escapeHtml(cleanText(explanation))}</p>
        </div>
        <span class="signal-quality">RS ${escapeHtml(formatNumber(rs))}</span>
      </article>
    `;
  }).join("");
}

function detailItem(label, value, wide = false) {
  return `<div class="detail-item ${wide ? "wide" : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(cleanText(value))}</strong></div>`;
}

function renderTechnical(row) {
  const items = [
    ["Internal trend", valueFrom(row, ["Internal Trend"])],
    ["Swing trend", valueFrom(row, ["Swing Trend"])],
    ["Internal structure", valueFrom(row, ["Latest Internal Struct"])],
    ["Swing structure", valueFrom(row, ["Latest Swing Struct"])],
    ["RS rating", valueFrom(row, ["RS Rating"])],
    ["Beta zone", valueFrom(row, ["Beta (vs IHSG) Zone", "Beta Zone"])],
    ["RVOL 20D", formatNumber(valueFrom(row, ["RVOL 20 D", "RVOL"]))],
    ["ADR / ATR zone", valueFrom(row, ["ADR & ATR (14) Zone", "ADR & ATR (14)"])],
    ["MA zone", valueFrom(row, ["MA Zone", "MA Position"])],
    ["RSI status", valueFrom(row, ["RSI Status", "RSI 14"])],
    ["MACD position", valueFrom(row, ["Lines Position", "MACD Cross"])],
    ["Price location", valueFrom(row, ["Summary"])],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "-");
  els.technicalGrid.innerHTML = items.map(([label, value]) => detailItem(label, value)).join("")
    || detailItem("Status", "No technical detail available for this ticker.", true);
}

function renderFundamental(row) {
  const items = [
    ["Market cap", valueFrom(row, ["Market Cap"])],
    ["Market cap class", valueFrom(row, ["Market Cap Categories"])],
    ["P/E ratio", valueFrom(row, ["Current PE Ratio (TTM)", "P/E Ratio"])],
    ["Price / book", valueFrom(row, ["Current Price to Book Value", "P/B Ratio", "Current PBV"])],
    ["ROE", valueFrom(row, ["Return on Equity (TTM)", "ROE"])],
    ["Debt / equity", valueFrom(row, ["Debt to Equity Ratio (Quarter)", "Debt to Equity"])],
    ["Dividend yield", valueFrom(row, ["Dividend Yield (%)", "Dividend Yield"])],
    ["Free float", valueFrom(row, ["Free Float (%)", "Free Float %", "Free Float"])],
    ["PBV regime", valueFrom(row, ["PBV Regime"])],
    ["YTD return", valueFrom(row, ["Year to Date Price Returns"])],
    ["52 week high", valueFrom(row, ["52 Week High"])],
    ["52 week low", valueFrom(row, ["52 Week Low"])],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "-");
  const summary = valueFrom(row, ["Business Summary"]);
  if (summary) items.push(["Business summary", summary, true]);
  els.fundamentalGrid.innerHTML = items.map(([label, value, wide]) => detailItem(label, value, wide)).join("")
    || detailItem("Status", "No fundamental detail available for this ticker.", true);
}

function safeLink(value) {
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function renderNews(ticker, signals, technical) {
  const rows = [...(state.newsByTicker.get(ticker) || [])];
  if (!rows.length) {
    for (const signal of signals) {
      const sentimentNews = valueFrom(signal, ["Sentiment News"]);
      const corpAction = valueFrom(signal, ["Corp. Action"]);
      if (sentimentNews && sentimentNews !== "-") rows.push({ "Sentiment News": sentimentNews, Sentiment: "Workbook summary" });
      if (corpAction && corpAction !== "-") rows.push({ "Corp. Action": corpAction, Sentiment: "Corporate action" });
    }
  }
  const todayEvent = valueFrom(technical, ["Today Event", "ARA/ARB"]);
  if (todayEvent && todayEvent !== "-") rows.push({ "Corp. Action": todayEvent, Sentiment: "Technical event" });

  if (!rows.length) {
    els.newsPanel.innerHTML = `<div class="no-chart">No news or event entry is available in this workbook for ${escapeHtml(ticker)}.</div>`;
    return;
  }
  els.newsPanel.innerHTML = rows.slice(0, 8).map((row) => {
    const headline = valueFrom(row, ["Sentiment News", "Corp. Action", "Company"]) || "Workbook event";
    const category = valueFrom(row, ["Sentiment", "Corp. Category", "Event Risk"]) || "News";
    const link = safeLink(valueFrom(row, ["News URL", "Corp. URL"]));
    return `
      <article class="news-item">
        <div>
          <h4>${escapeHtml(cleanText(category))}</h4>
          <p>${escapeHtml(cleanText(headline))}</p>
        </div>
        ${link ? `<a class="news-link" href="${escapeHtml(link)}" target="_blank" rel="noopener">SOURCE</a>` : ""}
      </article>
    `;
  }).join("");
}

function renderDataQuality() {
  const summary = state.payload.summary || {};
  const total = Number(summary.totalScanned || state.payload.processing.length || 0);
  const ok = Number(summary.ok || 0);
  const partial = Number(summary.partial || 0);
  const noData = Number(summary.noData || 0);
  const completePct = total ? (ok / total) * 100 : 0;
  els.qualityMetrics.innerHTML = [
    metricCard("Scanned", formatNumber(total, 0), "Total processing records"),
    metricCard("Full data", formatNumber(ok, 0), `${completePct.toFixed(1)}% completion`, "positive"),
    metricCard("Partial", formatNumber(partial, 0), "Usable with missing fields", "amber"),
    metricCard("No data", formatNumber(noData, 0), "Unavailable tickers", noData ? "negative" : "positive"),
  ].join("");

  const needle = state.dataSearch.trim().toLowerCase();
  const rows = (state.payload.processing || []).filter((row) => {
    if (!needle) return true;
    return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle));
  });
  const visible = rows.slice(0, 500);
  els.dataCount.textContent = rows.length > visible.length ? `Showing ${visible.length} of ${rows.length}` : `${rows.length} records`;
  els.dataHead.innerHTML = `<tr>${dataColumns.map((column) => `<th>${column}</th>`).join("")}</tr>`;
  els.dataBody.innerHTML = visible.map((row) => `
    <tr data-ticker="${escapeHtml(row.Ticker || "")}">
      ${dataColumns.map((column) => {
        const value = row[column];
        const statusClass = column === "Status"
          ? String(value).toLowerCase().includes("ok") ? "positive" : String(value).toLowerCase().includes("partial") ? "neutral" : "negative"
          : "";
        return `<td class="${statusClass}">${escapeHtml(cleanText(value))}</td>`;
      }).join("")}
    </tr>
  `).join("");
}

function renderAll() {
  if (!state.payload) return;
  els.sidebarDate.textContent = state.payload.date;
  els.downloadLink.href = state.payload.workbook || "#";
  els.downloadLink.setAttribute("aria-disabled", state.payload.workbook ? "false" : "true");
  renderOverview();
  renderScreener();
  renderDataQuality();
  if (state.selectedTicker) renderTicker();
}

async function loadDate(marketDate) {
  const item = state.manifest.dates.find((entry) => entry.date === marketDate);
  if (!item) return;
  loading(30);
  state.payload = await fetchJson(item.file);
  loading(72);
  rebuildIndexes();
  if (state.selectedTicker && !state.technicalByTicker.has(state.selectedTicker) && !state.signalsByTicker.has(state.selectedTicker)) {
    state.selectedTicker = "";
  }
  renderAll();
  loading(100);
}

async function init() {
  loading(12);
  state.manifest = await fetchJson("data/manifest.json");
  if (!state.manifest.dates?.length) throw new Error("No screener datasets have been published.");
  loading(25);
  els.dateSelect.innerHTML = state.manifest.dates
    .map((entry) => `<option value="${escapeHtml(entry.date)}">${escapeHtml(entry.date)}</option>`)
    .join("");
  els.dateSelect.value = state.manifest.latest;

  const historyPromise = state.manifest.history
    ? fetchJson(state.manifest.history).catch(() => ({ dates: [], tickers: {} }))
    : Promise.resolve({ dates: [], tickers: {} });
  const [payload, historyData] = await Promise.all([
    fetchJson(state.manifest.dates.find((entry) => entry.date === state.manifest.latest).file),
    historyPromise,
  ]);
  state.payload = payload;
  state.history = historyData;
  loading(75);
  rebuildIndexes();
  renderAll();
  routeFromHash();
  loading(100);
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

document.addEventListener("click", (event) => {
  const tickerTarget = event.target.closest("[data-ticker]");
  if (tickerTarget?.dataset.ticker) {
    selectTicker(tickerTarget.dataset.ticker);
    return;
  }
  const goTarget = event.target.closest("[data-go]");
  if (goTarget) {
    showView(goTarget.dataset.go);
    return;
  }
  const strategyTarget = event.target.closest("[data-strategy]");
  if (strategyTarget) {
    state.strategy = strategyTarget.dataset.strategy;
    renderScreener();
    showView("screener");
    return;
  }
  const sectorTarget = event.target.closest("[data-sector]");
  if (sectorTarget) {
    state.sector = sectorTarget.dataset.sector;
    renderScreener();
    showView("screener");
  }
});

els.dateSelect.addEventListener("change", (event) => {
  loadDate(event.target.value).catch((error) => showError(error.message));
});

els.screenerSearch.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderScreener();
});

els.sectorSelect.addEventListener("change", (event) => {
  state.sector = event.target.value;
  renderScreener();
});

els.sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderScreener();
});

els.dataSearch.addEventListener("input", (event) => {
  state.dataSearch = event.target.value;
  renderDataQuality();
});

els.tickerCommand.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    selectTicker(event.target.value);
    event.target.closest(".ticker-command")?.classList.remove("mobile-open");
  }
});

els.tickerCommand.addEventListener("change", (event) => selectTicker(event.target.value));

document.querySelector(".ticker-command").addEventListener("click", (event) => {
  if (window.innerWidth <= 680 && event.target.classList.contains("command-prefix")) {
    event.currentTarget.classList.add("mobile-open");
    els.tickerCommand.focus();
  }
});

els.menuButton.addEventListener("click", () => document.body.classList.toggle("nav-open"));
window.addEventListener("hashchange", routeFromHash);

init().catch((error) => {
  loading(100);
  showError(error.message);
  els.runMeta.textContent = "The dashboard could not load its published data.";
});
