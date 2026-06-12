const state = {
  manifest: null,
  payload: null,
  reference: null,
  history: { dates: [], tickers: {} },
  view: "overview",
  strategy: "ALL",
  sector: "ALL",
  search: "",
  sort: "default",
  selectedTicker: "",
  currentManifestEntry: null,
  ohlcvCache: new Map(),
  chart: null,
  chartResizeObserver: null,
  chartRows: [],
  chartRange: "1Y",
  chartCandleSeries: null,
  chartDrawings: [],
  chartTool: "cursor",
  indicatorSettings: null,
  indicatorRenderTimer: null,
  calendarMonth: null,
  loadToken: 0,
  technicalByTicker: new Map(),
  fundamentalByTicker: new Map(),
  newsByTicker: new Map(),
  signalsByTicker: new Map(),
};

const viewTitles = {
  overview: ["IDX RESEARCH", "Market Overview"],
  screener: ["SIGNAL DISCOVERY", "Signal Screener"],
  ticker: ["SECURITY RESEARCH", "Ticker Analysis"],
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

const els = {
  loadBar: document.querySelector("#loadBar"),
  errorBanner: document.querySelector("#errorBanner"),
  pageTitle: document.querySelector("#pageTitle"),
  eyebrow: document.querySelector("#eyebrow"),
  sidebarDate: document.querySelector("#sidebarDate"),
  datePickerButton: document.querySelector("#datePickerButton"),
  selectedDateLabel: document.querySelector("#selectedDateLabel"),
  datePickerModal: document.querySelector("#datePickerModal"),
  calendarMonthLabel: document.querySelector("#calendarMonthLabel"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarPrevious: document.querySelector("#calendarPrevious"),
  calendarNext: document.querySelector("#calendarNext"),
  calendarLatest: document.querySelector("#calendarLatest"),
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
  tickerKeyMetrics: document.querySelector("#tickerKeyMetrics"),
  historyMeta: document.querySelector("#historyMeta"),
  historyStatus: document.querySelector("#historyStatus"),
  chartLegend: document.querySelector("#chartLegend"),
  priceChart: document.querySelector("#priceChart"),
  chartToolRail: document.querySelector("#chartToolRail"),
  activeIndicatorStrip: document.querySelector("#activeIndicatorStrip"),
  indicatorSettingsButton: document.querySelector("#indicatorSettingsButton"),
  indicatorSettingsModal: document.querySelector("#indicatorSettingsModal"),
  indicatorSettingsForm: document.querySelector("#indicatorSettingsForm"),
  resetIndicatorSettings: document.querySelector("#resetIndicatorSettings"),
  settingsSavedState: document.querySelector("#settingsSavedState"),
  tradePlan: document.querySelector("#tradePlan"),
  tickerSignals: document.querySelector("#tickerSignals"),
  technicalGrid: document.querySelector("#technicalGrid"),
  fundamentalGrid: document.querySelector("#fundamentalGrid"),
  newsPanel: document.querySelector("#newsPanel"),
  themeToggle: document.querySelector("#themeToggle"),
  datasetState: document.querySelector("#datasetState"),
  datasetTitle: document.querySelector("#datasetTitle"),
  datasetMeta: document.querySelector("#datasetMeta"),
  datasetTickers: document.querySelector("#datasetTickers"),
  datasetSignals: document.querySelector("#datasetSignals"),
  datasetPublished: document.querySelector("#datasetPublished"),
  refreshData: document.querySelector("#refreshData"),
  resetFilters: document.querySelector("#resetFilters"),
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
  document.body.classList.toggle("app-loading", progress < 100);
  els.loadBar.style.opacity = "1";
  els.loadBar.style.width = `${progress}%`;
  if (progress >= 100) {
    window.setTimeout(() => {
      els.loadBar.style.opacity = "0";
      els.loadBar.style.width = "0";
    }, 260);
  }
}

function applyTheme(theme) {
  const normalized = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = normalized;
  localStorage.setItem("idx-research-theme", normalized);
  const nextTheme = normalized === "dark" ? "light" : "dark";
  els.themeToggle?.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
  const icon = els.themeToggle?.querySelector(".theme-icon");
  if (icon) icon.textContent = normalized === "dark" ? "SUN" : "MOON";
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    normalized === "dark" ? "#081426" : "#f3f7fc",
  );
  applyChartTheme();
}

function initTheme() {
  const saved = localStorage.getItem("idx-research-theme") || localStorage.getItem("idx-flow-theme");
  applyTheme(saved || "dark");
}

const INDICATOR_SETTINGS_KEY = "idx-research-indicators-v1";

function loadIndicatorSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(INDICATOR_SETTINGS_KEY) || "{}");
  } catch {
    saved = {};
  }
  state.indicatorSettings = IDXIndicators.deepMerge(IDXIndicators.DEFAULTS, saved);
}

function saveIndicatorSettings() {
  localStorage.setItem(INDICATOR_SETTINGS_KEY, JSON.stringify(state.indicatorSettings));
  if (els.settingsSavedState) {
    els.settingsSavedState.textContent = "Saved globally for every ticker and market date.";
  }
}

function objectPathValue(object, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  let target = object;
  parts.forEach((part) => {
    if (!target[part]) target[part] = {};
    target = target[part];
  });
  if (value !== undefined) target[last] = value;
  return target[last];
}

function populateIndicatorSettingsForm() {
  if (!els.indicatorSettingsForm) return;
  els.indicatorSettingsForm.querySelectorAll("[name]").forEach((input) => {
    const value = objectPathValue(state.indicatorSettings, input.name);
    if (input.type === "checkbox") input.checked = Boolean(value);
    else input.value = value;
  });
}

function updateActiveIndicatorStrip() {
  if (!els.activeIndicatorStrip || !state.indicatorSettings) return;
  const settings = state.indicatorSettings;
  const active = [];
  if (settings.ema25.show) active.push(`EMA ${settings.ema25.period}`);
  if (settings.ema50.show) active.push(`EMA ${settings.ema50.period}`);
  if (settings.sma200.show) active.push(`SMA ${settings.sma200.period}`);
  if (settings.vwap.show) active.push(`${settings.vwap.anchor.toUpperCase()} VWAP`);
  if (settings.volume.show) active.push(settings.volume.maShow ? `VOL + MA ${settings.volume.period}` : "VOL");
  if (settings.rsi.show) active.push(`RSI ${settings.rsi.period}/${settings.rsi.smoothingPeriod}`);
  if (settings.macd.show) active.push(`MACD ${settings.macd.fast}/${settings.macd.slow}/${settings.macd.signal} H${settings.macd.histogramSmoothing}`);
  if (settings.initialBalance.show) active.push(`IB ${settings.initialBalance.days}D`);
  if (settings.smc.show) active.push("SMC");
  els.activeIndicatorStrip.innerHTML = `
    <strong>Global profile</strong>
    ${active.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
    <small>Applies to all tickers and dates</small>
  `;
}

function openModal(element) {
  if (!element) return;
  element.hidden = false;
  document.body.classList.add("modal-open");
  element.querySelector("button, input, select")?.focus();
}

function closeModal(element) {
  if (!element) return;
  element.hidden = true;
  if (els.datePickerModal.hidden && els.indicatorSettingsModal.hidden) {
    document.body.classList.remove("modal-open");
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

function technicalRowFromStock(stock) {
  return {
    Ticker: stock.ticker,
    Emiten: stock.companyName,
    "IDX Sector": stock.sector,
    Sector: stock.sector,
    Industry: stock.industry,
    "Closing Price": stock.lastPrice,
    "Price Change %": stock.changePercent,
    Volume: stock.volume,
    "Average Volume 20 D": stock.averageVolume20,
    "RVOL 20 D": stock.rvol,
    "RS Rating": stock.rsRating,
    "Internal Trend": stock.trend?.internal,
    "Swing Trend": stock.trend?.swing,
    "Latest Internal Struct": stock.structure?.internal,
    "Latest Swing Struct": stock.structure?.swing,
    "Strong High": stock.resistanceLevels?.[0],
    "Weak High": stock.resistanceLevels?.[1],
    "Strong Low": stock.supportLevels?.[0],
    "Weak Low": stock.supportLevels?.[1],
    IBH: stock.levels?.ibh,
    IBL: stock.levels?.ibl,
    PWH: stock.levels?.pwh,
    PWL: stock.levels?.pwl,
    MDH: stock.levels?.mdh,
    MDL: stock.levels?.mdl,
    "EMA 25": stock.movingAverages?.ema25,
    "EMA 50": stock.movingAverages?.ema50,
    "SMA 200": stock.movingAverages?.sma200,
    "MA Zone": stock.movingAverages?.zone,
    "RSI 14": stock.technical?.rsi14,
    "RSI Status": stock.technical?.rsiStatus,
    "RSI MA 14": stock.technical?.rsiMa14,
    "MACD Line": stock.technical?.macdLine,
    "Signal Line": stock.technical?.macdSignal,
    "Histogram (EMA3)": stock.technical?.macdHistogram,
    "Lines Position": stock.technical?.macdPosition,
    "Wave Pattern": stock.technical?.wavePattern,
    "Current MVWAP · VWAP": stock.technical?.vwap,
    "Current MVWAP · VWAP Zone": stock.technical?.vwapPosition,
    "ADR %": stock.technical?.adr,
    "ATR (14) %": stock.technical?.atr,
    Summary: stock.technical?.priceLocation,
  };
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
  const compactTechnical = Object.values(state.payload.stocks || {}).map(technicalRowFromStock);
  const technicalRows = state.payload.technical?.length ? state.payload.technical : compactTechnical;
  const fundamentalRows = state.payload.fundamental?.length
    ? state.payload.fundamental
    : state.reference?.fundamental || [];
  const newsRows = state.payload.news?.length ? state.payload.news : state.reference?.news || [];
  state.technicalByTicker = mapRows(technicalRows);
  state.fundamentalByTicker = mapRows(fundamentalRows);
  state.newsByTicker = groupRows(newsRows);
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
  if (state.view === "ticker" && view !== "ticker") destroyChart();
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
  const total = Number(
    summary.totalScanned
    ?? state.payload.technical?.length
    ?? Object.keys(state.payload.stocks || {}).length,
  );
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

function renderDataStatus() {
  const summary = state.payload.summary || {};
  const historicalSnapshot = state.payload.snapshotMode === "historical-ohlcv";
  const workbook = historicalSnapshot
    ? "Historical OHLCV snapshot"
    : String(state.payload.workbook || state.currentManifestEntry?.workbook || "")
      .split("/")
      .pop() || "Workbook unavailable";
  const total = Number(summary.totalScanned ?? state.payload.processing?.length ?? 0);
  const signalRows = Number(summary.signalRows ?? state.payload.screener?.length ?? 0);
  const partial = Number(summary.partial || 0);
  const noData = Number(summary.noData || 0);
  const stateLabel = historicalSnapshot
    ? "Historical session"
    : noData > 0 ? "Partially loaded" : partial > 0 ? "Loaded with warnings" : "Loaded";
  const stateTone = noData > 0 ? "negative" : partial > 0 ? "warning" : "positive";

  els.datasetState.className = `status-badge ${stateTone}`;
  els.datasetState.textContent = stateLabel;
  els.datasetTitle.textContent = workbook;
  els.datasetMeta.textContent = `Market date ${state.payload.date} · ${formatNumber(summary.ok || 0, 0)} complete · ${formatNumber(partial, 0)} partial · ${formatNumber(noData, 0)} unavailable`;
  if (historicalSnapshot) {
    els.datasetMeta.textContent = `Market date ${state.payload.date} · recalculated from OHLCV available on that session`;
  }
  els.datasetTickers.textContent = formatNumber(total, 0);
  els.datasetSignals.textContent = formatNumber(signalRows, 0);
  els.datasetPublished.textContent = cleanText(state.payload.runTime).replace(/\.\d+$/, "");
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
      <div class="legend-row" style="--legend:var(--faint)"><i></i><span>Unchanged</span><strong>${unchanged}</strong></div>
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
    const rgb = positive ? "59,130,246" : "248,113,113";
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

function resetScreenerFilters() {
  state.strategy = "ALL";
  state.sector = "ALL";
  state.search = "";
  state.sort = "default";
  els.screenerSearch.value = "";
  els.sortSelect.value = "default";
  renderScreener();
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
        <div class="ticker-title-row">
          <h2>${escapeHtml(ticker)}</h2>
          <span class="status-badge ${signals.length ? "positive" : "info"}">${signals.length ? `${signals.length} signal${signals.length === 1 ? "" : "s"}` : "Technical snapshot"}</span>
        </div>
        <p>${escapeHtml(cleanText(company))} \u00b7 ${escapeHtml(cleanText(sector))} \u00b7 Market date ${escapeHtml(state.payload.date)}</p>
      </div>
    </div>
    <div class="ticker-quote">
      <strong>${formatPrice(price)}</strong>
      <span class="${percentClass(change)}">${formatPercent(change)}</span>
    </div>
  `;

  renderPriceChart(ticker);
  renderTickerKeyMetrics(technical, primarySignal);
  renderTradePlan(primarySignal, technical, price);
  renderTickerSignals(signals, technical);
  renderTechnical(technical);
  renderFundamental(fundamental);
  renderNews(ticker, signals, technical);
}

function renderTickerKeyMetrics(technical, signal) {
  const metrics = [
    ["Trend", valueFrom(technical, ["Internal Trend", "Swing Trend"]), trendTone(valueFrom(technical, ["Internal Trend"]))],
    ["Structure", valueFrom(technical, ["Latest Internal Struct", "Latest Swing Struct"]), ""],
    ["RVOL", formatNumber(valueFrom(technical, ["RVOL 20 D", "RVOL"])), ""],
    ["RS rating", formatNumber(valueFrom(technical, ["RS Rating"]), 0), ""],
    ["VWAP position", valueFrom(technical, ["Current QVWAP (Q2 2026) · VWAP Zone", "Current MVWAP (June 2026) · VWAP Zone", "VWAP Zone"]), ""],
    ["Momentum", valueFrom(technical, ["RSI Status", "Wave Pattern"]), trendTone(valueFrom(technical, ["RSI Status"]))],
    ["Setup quality", valueFrom(signal, ["Filter Label"]) || "No active screener match", signal.Filter ? "positive" : "neutral"],
    ["Risk / reward", valueFrom(signal, ["R/R"]) || "-", ""],
  ];
  els.tickerKeyMetrics.innerHTML = metrics.map(([label, value, tone]) => `
    <div class="key-metric">
      <span>${escapeHtml(label)}</span>
      <strong class="${tone}">${escapeHtml(cleanText(value))}</strong>
    </div>
  `).join("");
}

function trendTone(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("bull") || text.includes("strong") || text.includes("positive")) return "positive";
  if (text.includes("bear") || text.includes("weak") || text.includes("negative")) return "negative";
  if (text.includes("overbought") || text.includes("oversold")) return "warning";
  return "neutral";
}

async function renderPriceChart(ticker) {
  const base = state.currentManifestEntry?.ohlcv;
  if (!base) {
    renderChartEmpty(ticker, "Missing history source");
    return;
  }
  destroyChart();
  els.historyStatus.className = "status-badge info";
  els.historyStatus.textContent = "Loading history";
  els.chartLegend.innerHTML = "<strong>Loading daily OHLCV history...</strong>";
  els.priceChart.innerHTML = `<div class="chart-loading" aria-label="Loading price chart"><span></span><span></span><span></span></div>`;
  try {
    const marketDate = state.payload.date;
    const cacheKey = `${marketDate}:${ticker}`;
    if (!state.ohlcvCache.has(cacheKey)) {
      state.ohlcvCache.set(cacheKey, await fetchJson(`${base}/${encodeURIComponent(ticker)}.json`));
    }
    if (state.selectedTicker !== ticker || state.payload.date !== marketDate) return;
    const rows = (state.ohlcvCache.get(cacheKey)?.rows || [])
      .filter((row) => row.date && [row.open, row.high, row.low, row.close].every((value) => asNumber(value) !== null))
      .filter((row) => row.date <= marketDate)
      .slice(-700);
    if (rows.length < 2) {
      renderChartEmpty(ticker, "Insufficient OHLCV records");
      return;
    }
    renderInteractiveMarketChart(ticker, rows);
  } catch {
    renderChartEmpty(ticker, "Price history has not been published for this ticker");
  }
}

function destroyChart() {
  state.chartResizeObserver?.disconnect();
  state.chartResizeObserver = null;
  state.chart?.remove();
  state.chart = null;
  state.chartCandleSeries = null;
  state.chartRows = [];
  state.chartDrawings = [];
}

function chartColors() {
  const light = document.documentElement.dataset.theme === "light";
  return {
    background: light ? "#ffffff" : "#0e1b2e",
    text: light ? "#526781" : "#9bacc3",
    grid: light ? "rgba(50,78,116,0.10)" : "rgba(148,173,207,0.10)",
    border: light ? "rgba(50,78,116,0.18)" : "rgba(148,173,207,0.18)",
  };
}

function applyChartTheme() {
  if (!state.chart) return;
  const colors = chartColors();
  state.chart.applyOptions({
    layout: {
      background: { type: "solid", color: colors.background },
      textColor: colors.text,
    },
    grid: {
      vertLines: { color: colors.grid },
      horzLines: { color: colors.grid },
    },
    rightPriceScale: { borderColor: colors.border },
    timeScale: { borderColor: colors.border },
  });
}

function firstNumericMatch(row, includes, excludes = []) {
  for (const [key, value] of Object.entries(row || {})) {
    const normalized = key.toLowerCase();
    if (includes.every((part) => normalized.includes(part.toLowerCase()))
      && excludes.every((part) => !normalized.includes(part.toLowerCase()))) {
      const parsed = asNumber(value);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function renderInteractiveMarketChart(ticker, rows) {
  if (!window.LightweightCharts) {
    renderChartEmpty(ticker, "The interactive chart library could not load");
    return;
  }

  destroyChart();
  els.priceChart.innerHTML = "";
  state.chartRows = rows;
  const settings = state.indicatorSettings;
  const colors = chartColors();
  const chart = LightweightCharts.createChart(els.priceChart, {
    autoSize: true,
    height: settings.rsi.show || settings.macd.show ? 720 : 560,
    layout: {
      background: { type: "solid", color: colors.background },
      textColor: colors.text,
      fontFamily: getComputedStyle(document.body).fontFamily,
    },
    grid: {
      vertLines: { color: colors.grid },
      horzLines: { color: colors.grid },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: "rgba(96,165,250,0.45)", labelBackgroundColor: "#2563eb" },
      horzLine: { color: "rgba(96,165,250,0.45)", labelBackgroundColor: "#2563eb" },
    },
    rightPriceScale: {
      borderColor: colors.border,
      scaleMargins: { top: 0.08, bottom: 0.25 },
    },
    timeScale: {
      borderColor: colors.border,
      rightOffset: 8,
      barSpacing: 8,
      minBarSpacing: 2,
    },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
  });
  state.chart = chart;

  const candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: "#3b82f6",
    downColor: "#f87171",
    borderUpColor: "#3b82f6",
    borderDownColor: "#f87171",
    wickUpColor: "#60a5fa",
    wickDownColor: "#fca5a5",
    priceLineColor: "#60a5fa",
  });
  candleSeries.setData(rows.map((row) => ({
    time: row.date,
    open: asNumber(row.open),
    high: asNumber(row.high),
    low: asNumber(row.low),
    close: asNumber(row.close),
  })));
  state.chartCandleSeries = candleSeries;

  if (settings.volume.show) {
    const volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.setData(rows.map((row) => ({
      time: row.date,
      value: asNumber(row.volume) || 0,
      color: asNumber(row.close) >= asNumber(row.open) ? "rgba(59,130,246,0.42)" : "rgba(248,113,113,0.38)",
    })));
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    if (settings.volume.maShow) {
      const volumeAverage = chart.addSeries(LightweightCharts.LineSeries, {
        color: "#60a5fa",
        lineWidth: 1,
        title: `Vol ${settings.volume.period}`,
        priceScaleId: "volume",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      volumeAverage.setData(IDXIndicators.movingAverage(rows, settings.volume.period, "sma", "volume"));
    }
  }

  [
    [settings.ema25, "ema", "#60a5fa", `EMA ${settings.ema25.period}`],
    [settings.ema50, "ema", "#a78bfa", `EMA ${settings.ema50.period}`],
    [settings.sma200, "sma", "#2563eb", `SMA ${settings.sma200.period}`],
  ].forEach(([config, type, color, title]) => {
    if (!config.show) return;
    const series = chart.addSeries(LightweightCharts.LineSeries, {
      color,
      lineWidth: title.startsWith("SMA") ? 2 : 1,
      title,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    series.setData(IDXIndicators.movingAverage(rows, config.period, type));
  });

  if (settings.vwap.show) {
    const vwapData = IDXIndicators.anchoredVwap(rows, settings.vwap.anchor, settings.vwap.multiplier);
    const vwapSeries = chart.addSeries(LightweightCharts.LineSeries, {
      color: "#22d3ee",
      lineWidth: 2,
      title: `${settings.vwap.anchor.toUpperCase()} VWAP`,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    vwapSeries.setData(vwapData.vwap);
    if (settings.vwap.bands) {
      [
        [vwapData.upper, "rgba(34,211,238,0.48)", `VWAP +${settings.vwap.multiplier}`],
        [vwapData.lower, "rgba(34,211,238,0.48)", `VWAP -${settings.vwap.multiplier}`],
      ].forEach(([data, color, title]) => {
        const band = chart.addSeries(LightweightCharts.LineSeries, {
          color,
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          title,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        band.setData(data);
      });
    }
  }

  if (settings.initialBalance.show) {
    const balance = IDXIndicators.initialBalance(rows, settings.initialBalance.days);
    [
      [balance.high, "#60a5fa", "IBH"],
      [balance.low, "#f87171", "IBL"],
    ].forEach(([data, color, title]) => {
      const series = chart.addSeries(LightweightCharts.LineSeries, {
        color,
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      series.setData(data);
    });
  }

  let paneIndex = 1;
  if (settings.rsi.show) {
    const rsiData = IDXIndicators.rsi(
      rows,
      settings.rsi.period,
      settings.rsi.smoothing,
      settings.rsi.smoothingPeriod,
    );
    const rsiSeries = chart.addSeries(LightweightCharts.LineSeries, {
      color: "#60a5fa",
      lineWidth: 2,
      title: `RSI ${settings.rsi.period}`,
      priceScaleId: "rsi",
      priceLineVisible: false,
      lastValueVisible: true,
    }, paneIndex);
    rsiSeries.setData(rsiData.values);
    if (rsiData.smooth.length) {
      const rsiSmooth = chart.addSeries(LightweightCharts.LineSeries, {
        color: "#94a3b8",
        lineWidth: 1,
        title: `RSI ${settings.rsi.smoothing.toUpperCase()}`,
        priceScaleId: "rsi",
        priceLineVisible: false,
        lastValueVisible: false,
      }, paneIndex);
      rsiSmooth.setData(rsiData.smooth);
    }
    [70, 50, 30].forEach((price) => rsiSeries.createPriceLine({
      price,
      color: price === 70 ? "rgba(59,130,246,0.55)" : price === 30 ? "rgba(248,113,113,0.55)" : "rgba(148,163,184,0.28)",
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: String(price),
    }));
    paneIndex += 1;
  }

  if (settings.macd.show) {
    const macdData = IDXIndicators.macd(
      rows,
      settings.macd.fast,
      settings.macd.slow,
      settings.macd.signal,
      settings.macd.histogramSmoothing,
    );
    const histogram = chart.addSeries(LightweightCharts.HistogramSeries, {
      priceScaleId: "macd",
      title: "MACD 4C",
      priceLineVisible: false,
      lastValueVisible: false,
    }, paneIndex);
    histogram.setData(macdData.histogram);
    const macdLine = chart.addSeries(LightweightCharts.LineSeries, {
      color: "#3b82f6",
      lineWidth: 2,
      title: "MACD",
      priceScaleId: "macd",
      priceLineVisible: false,
      lastValueVisible: true,
    }, paneIndex);
    macdLine.setData(macdData.line);
    const signalLine = chart.addSeries(LightweightCharts.LineSeries, {
      color: "#f87171",
      lineWidth: 1,
      title: "Signal",
      priceScaleId: "macd",
      priceLineVisible: false,
      lastValueVisible: true,
    }, paneIndex);
    signalLine.setData(macdData.signal);
    macdLine.createPriceLine({
      price: 0,
      color: "rgba(148,163,184,0.35)",
      lineWidth: 1,
      axisLabelVisible: false,
      title: "0",
    });
  }

  if (settings.smc.show && LightweightCharts.createSeriesMarkers) {
    LightweightCharts.createSeriesMarkers(
      candleSeries,
      IDXIndicators.structureMarkers(
        rows,
        settings.smc.internalLength,
        settings.smc.swingLength,
        settings.smc.equalTolerance,
      ),
    );
  }

  const technical = state.technicalByTicker.get(ticker) || {};
  const signal = (state.signalsByTicker.get(ticker) || [])[0] || {};
  const lines = [
    ["Entry", asNumber(valueFrom(signal, ["Entry"])), "#3b82f6"],
    ["Target", asNumber(valueFrom(signal, ["Target"])), "#60a5fa"],
    ["Invalidation", asNumber(valueFrom(signal, ["Invalidation"])), "#f87171"],
    ["Support", asNumber(valueFrom(technical, ["Strong Low", "Weak Low", "IBL", "PWL", "MDL"])), "#64748b"],
    ["Resistance", asNumber(valueFrom(technical, ["Strong High", "Weak High", "IBH", "PWH", "MDH"])), "#94a3b8"],
  ].filter(([, price]) => price !== null);
  lines.forEach(([title, price, color]) => candleSeries.createPriceLine({
    price,
    color,
    lineWidth: title === "Invalidation" ? 2 : 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    axisLabelVisible: true,
    title,
  }));

  const rowByDate = new Map(rows.map((row, index) => [row.date, { row, index }]));
  const updateLegend = (row, index) => {
    const previous = index > 0 ? asNumber(rows[index - 1].close) : null;
    const change = previous ? ((asNumber(row.close) / previous) - 1) * 100 : 0;
    els.chartLegend.innerHTML = `
      <strong>${escapeHtml(ticker)} · ${escapeHtml(row.date)}</strong>
      <span>O ${formatPrice(row.open)}</span>
      <span>H ${formatPrice(row.high)}</span>
      <span>L ${formatPrice(row.low)}</span>
      <span>C ${formatPrice(row.close)}</span>
      <span class="${change >= 0 ? "positive" : "negative"}">${change >= 0 ? "+" : ""}${change.toFixed(2)}%</span>
      <span>Vol ${formatNumber(row.volume, 0)}</span>
    `;
  };
  updateLegend(rows.at(-1), rows.length - 1);
  chart.subscribeCrosshairMove((param) => {
    if (!param.time) {
      updateLegend(rows.at(-1), rows.length - 1);
      return;
    }
    const key = typeof param.time === "string"
      ? param.time
      : `${param.time.year}-${String(param.time.month).padStart(2, "0")}-${String(param.time.day).padStart(2, "0")}`;
    const point = rowByDate.get(key);
    if (point) updateLegend(point.row, point.index);
  });

  state.chartResizeObserver = new ResizeObserver(() => chart.timeScale().applyOptions({}));
  state.chartResizeObserver.observe(els.priceChart);
  chart.subscribeClick((param) => {
    if (state.chartTool !== "horizontal" || !param.point) return;
    const price = candleSeries.coordinateToPrice(param.point.y);
    if (price === null) return;
    state.chartDrawings.push(candleSeries.createPriceLine({
      price,
      color: "#60a5fa",
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: "User level",
    }));
  });
  setChartRange(state.chartRange);
  updateActiveIndicatorStrip();

  const partial = rows.length < 60;
  els.historyStatus.className = `status-badge ${partial ? "warning" : "positive"}`;
  els.historyStatus.textContent = partial ? "Partial price history" : "History loaded";
  els.historyMeta.textContent = `${formatNumber(rows.length, 0)} daily bars · ${rows[0].date} to ${rows.at(-1).date}`;
}

function setChartRange(range) {
  state.chartRange = range;
  document.querySelectorAll("[data-chart-range]").forEach((button) => {
    button.classList.toggle("active", button.dataset.chartRange === range);
  });
  if (!state.chart || state.chartRows.length < 2) return;
  const counts = { "3M": 66, "6M": 132, "1Y": 264 };
  if (range === "ALL") {
    state.chart.timeScale().fitContent();
    return;
  }
  const rows = state.chartRows;
  const start = Math.max(0, rows.length - counts[range]);
  state.chart.timeScale().setVisibleRange({ from: rows[start].date, to: rows.at(-1).date });
}

function renderChartEmpty(ticker, detail) {
  destroyChart();
  els.historyStatus.className = "status-badge warning";
  els.historyStatus.textContent = "Missing history";
  els.historyMeta.textContent = detail;
  els.chartLegend.innerHTML = `<strong>${escapeHtml(ticker)} · OHLCV history unavailable</strong>`;
  els.priceChart.innerHTML = `
    <div class="chart-empty-state">
      <span class="empty-icon" aria-hidden="true">OHLC</span>
      <h3>Not enough price history available</h3>
      <p>This ticker needs at least two published OHLCV records to render a candlestick chart. Upload more historical workbook runs or connect a historical OHLCV source.</p>
      <div class="chart-empty-actions">
        <button class="secondary-button" type="button" data-chart-action="reload">Reload data</button>
        <button class="secondary-button" type="button" data-chart-action="change">Change ticker</button>
        <button class="secondary-button" type="button" data-chart-action="technical">View technical snapshot</button>
      </div>
    </div>
  `;
}

function renderCandlestickChart(ticker, rows) {
  const width = 760;
  const height = 310;
  const pad = { top: 16, right: 58, bottom: 48, left: 12 };
  const priceHeight = 210;
  const lows = rows.map((row) => asNumber(row.low)).filter((value) => value !== null);
  const highs = rows.map((row) => asNumber(row.high)).filter((value) => value !== null);
  const volumes = rows.map((row) => asNumber(row.volume) || 0);
  let min = Math.min(...lows);
  let max = Math.max(...highs);
  const spread = Math.max(1, max - min);
  min -= spread * 0.05;
  max += spread * 0.05;
  const step = (width - pad.left - pad.right) / rows.length;
  const bodyWidth = Math.max(1.2, Math.min(6, step * 0.68));
  const x = (index) => pad.left + step * index + step / 2;
  const y = (price) => pad.top + ((max - price) / (max - min)) * priceHeight;
  const maxVolume = Math.max(...volumes, 1);
  const volumeTop = pad.top + priceHeight + 17;
  const candles = rows.map((row, index) => {
    const open = asNumber(row.open);
    const high = asNumber(row.high);
    const low = asNumber(row.low);
    const close = asNumber(row.close);
    if ([open, high, low, close].some((value) => value === null)) return "";
    const up = close >= open;
    const top = Math.min(y(open), y(close));
    const bodyHeight = Math.max(1, Math.abs(y(open) - y(close)));
    const volumeHeight = ((asNumber(row.volume) || 0) / maxVolume) * 48;
    return `
      <g class="candle ${up ? "up" : "down"}">
        <line x1="${x(index)}" y1="${y(high)}" x2="${x(index)}" y2="${y(low)}"></line>
        <rect x="${x(index) - bodyWidth / 2}" y="${top}" width="${bodyWidth}" height="${bodyHeight}"></rect>
        <rect class="volume-bar" x="${x(index) - bodyWidth / 2}" y="${volumeTop + 48 - volumeHeight}" width="${bodyWidth}" height="${volumeHeight}"></rect>
        <title>${escapeHtml(row.date)} O ${formatPrice(open)} H ${formatPrice(high)} L ${formatPrice(low)} C ${formatPrice(close)}</title>
      </g>`;
  }).join("");
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const gridY = pad.top + ratio * priceHeight;
    const label = max - ratio * (max - min);
    return `<line class="chart-grid" x1="${pad.left}" y1="${gridY}" x2="${width - pad.right}" y2="${gridY}"></line>
      <text class="chart-label" x="${width - pad.right + 7}" y="${gridY + 3}">${formatPrice(label)}</text>`;
  }).join("");
  const labels = [0, Math.floor(rows.length / 2), rows.length - 1].map((index) =>
    `<text class="chart-label" x="${x(index)}" y="${height - 8}" text-anchor="${index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle"}">${escapeHtml(rows[index].date.slice(5))}</text>`
  ).join("");
  els.historyMeta.textContent = `${rows.length} daily bars · latest ${rows.at(-1).date}`;
  els.priceChart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ticker)} candlestick and volume chart">${grid}${candles}${labels}</svg>`;
}

function renderPublishedLineChart(ticker) {
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
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.24"></stop>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"></stop>
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

function renderTradePlan(signal, technical, currentPrice) {
  const entry = asNumber(valueFrom(signal, ["Entry"]));
  const target = asNumber(valueFrom(signal, ["Target"]));
  const invalidation = asNumber(valueFrom(signal, ["Invalidation"]));
  const support = asNumber(valueFrom(technical, ["Strong Low", "Weak Low", "IBL", "PWL", "MDL"]));
  const resistance = asNumber(valueFrom(technical, ["Strong High", "Weak High", "IBH", "PWH", "MDH"]));
  const current = asNumber(currentPrice);
  const levels = [entry, target, invalidation, support, resistance, current].filter((value) => value !== null);
  if (levels.length < 2) {
    els.tradePlan.innerHTML = `<div class="no-chart">Trade levels are not available for this ticker on the selected market date.</div>`;
    return;
  }
  const low = Math.min(...levels);
  const high = Math.max(...levels);
  const range = Math.max(1, high - low);
  const position = (value) => Math.max(4, Math.min(96, ((value - low) / range) * 100));
  const markers = [
    ["Invalidation", invalidation, ""],
    ["Support", support, "support"],
    ["Entry", entry, ""],
    ["Current", current, "current"],
    ["Target", target, ""],
    ["Resistance", resistance, "resistance"],
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
      <div class="level-card"><span>Entry</span><strong>${formatPrice(entry)}</strong></div>
      <div class="level-card"><span>Target</span><strong class="positive">${formatPrice(target)}</strong></div>
      <div class="level-card"><span>Invalidation</span><strong class="negative">${formatPrice(invalidation)}</strong></div>
      <div class="level-card"><span>Support</span><strong>${formatPrice(support)}</strong></div>
      <div class="level-card"><span>Resistance</span><strong>${formatPrice(resistance)}</strong></div>
      <div class="level-card"><span>Target upside</span><strong class="${percentClass(upside)}">${formatPercent(upside)}</strong></div>
      <div class="level-card"><span>Invalidation distance</span><strong>${risk === null ? "-" : formatPercent(risk)}</strong></div>
      <div class="level-card"><span>Risk / reward</span><strong>${escapeHtml(cleanText(rr))}</strong></div>
    </div>
  `;
}

function renderTickerSignals(signals, technical) {
  const rs = valueFrom(technical, ["RS Rating"]);
  if (!signals.length) {
    const trend = valueFrom(technical, ["Internal Trend", "Swing Trend"]);
    const structure = valueFrom(technical, ["Latest Internal Struct", "Latest Swing Struct"]);
    const momentum = valueFrom(technical, ["RSI Status", "Wave Pattern"]);
    els.tickerSignals.innerHTML = `
      <article class="ticker-signal neutral-signal">
        <span class="signal-code">IDX</span>
        <div>
          <h4>No active screener match</h4>
          <p>${escapeHtml(cleanText(trend))} trend · ${escapeHtml(cleanText(structure))} · ${escapeHtml(cleanText(momentum))} momentum. The technical snapshot remains available even though this ticker did not pass a published filter.</p>
        </div>
        <span class="signal-quality">RS ${escapeHtml(formatNumber(rs))}</span>
      </article>`;
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

function renderAnalysisSections(ticker, technical, fundamental) {
  const source = state.payload.tickerDetails?.[ticker] || {
    "IDX Technical Detail": technical,
    "IDX Fundamental Detail": fundamental,
  };
  const sections = [];
  for (const [sheet, row] of Object.entries(source)) {
    if (!row || typeof row !== "object") continue;
    const groups = new Map();
    for (const [rawKey, value] of Object.entries(row)) {
      if (rawKey === "Ticker" || value === null || value === undefined || value === "") continue;
      const normalized = cleanText(rawKey).replace(" Â· ", " · ");
      const parts = normalized.split(" · ");
      const group = parts.length > 1 ? parts[0] : sheet.replace("IDX ", "");
      const label = parts.length > 1 ? parts.slice(1).join(" · ") : normalized;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push([label, value]);
    }
    for (const [group, fields] of groups) {
      sections.push(`
        <details class="analysis-group">
          <summary><span>${escapeHtml(group)}</span><small>${escapeHtml(sheet)} · ${fields.length} fields</small></summary>
          <div class="analysis-field-grid">
            ${fields.map(([label, value]) => detailItem(label, value)).join("")}
          </div>
        </details>`);
    }
  }
  els.analysisSections.innerHTML = sections.join("")
    || `<div class="no-chart">Complete grouped fields will appear after a schema version 3 export.</div>`;
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
          ? String(value).toLowerCase().includes("ok") ? "positive" : String(value).toLowerCase().includes("partial") ? "warning" : "negative"
          : "";
        return `<td class="${statusClass}">${escapeHtml(cleanText(value))}</td>`;
      }).join("")}
    </tr>
  `).join("");
  els.dataEmpty.hidden = rows.length > 0;
}

function renderWorkbookExplorer() {
  const sheets = state.payload.workbookSheets || {};
  const names = Object.keys(sheets);
  if (!names.length) {
    els.explorerHead.innerHTML = "";
    els.explorerBody.innerHTML = "";
    els.explorerEmpty.hidden = false;
    els.explorerCount.textContent = "Schema v3 required";
    return;
  }
  if (!state.explorerSheet || !sheets[state.explorerSheet]) state.explorerSheet = names[0];
  els.explorerSheet.innerHTML = names.map((name) =>
    `<option value="${escapeHtml(name)}" ${name === state.explorerSheet ? "selected" : ""}>${escapeHtml(name)}</option>`
  ).join("");
  const table = sheets[state.explorerSheet] || { columns: [], rows: [] };
  const needle = state.explorerSearch.trim().toLowerCase();
  const rows = (table.rows || []).filter((row) =>
    !needle || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle))
  );
  const columns = (table.columns || []).slice(0, 140);
  const visible = rows.slice(0, 500);
  els.explorerCount.textContent = `${visible.length}${rows.length > visible.length ? ` of ${rows.length}` : ""} rows · ${columns.length} fields`;
  els.explorerHead.innerHTML = `<tr>${columns.map((column) => `<th>${escapeHtml(cleanText(column))}</th>`).join("")}</tr>`;
  els.explorerBody.innerHTML = visible.map((row) => `
    <tr ${row.Ticker ? `data-ticker="${escapeHtml(row.Ticker)}"` : ""}>
      ${columns.map((column) => `<td>${escapeHtml(cleanText(row[column]))}</td>`).join("")}
    </tr>`).join("");
  els.explorerEmpty.hidden = rows.length > 0;
}

function renderAll() {
  if (!state.payload) return;
  els.sidebarDate.textContent = state.payload.date;
  els.selectedDateLabel.textContent = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${state.payload.date}T00:00:00Z`));
  els.downloadLink.href = state.payload.workbook || "#";
  els.downloadLink.setAttribute("aria-disabled", state.payload.workbook ? "false" : "true");
  renderDataStatus();
  renderOverview();
  renderScreener();
  if (state.selectedTicker) renderTicker();
}

function publishedDateEntries() {
  return (state.manifest?.dates || []).filter((entry) => entry.isTradingDate !== false);
}

function renderCalendar() {
  if (!state.calendarMonth) return;
  const year = state.calendarMonth.getUTCFullYear();
  const month = state.calendarMonth.getUTCMonth();
  const published = new Set(publishedDateEntries().map((entry) => entry.date));
  const selected = state.payload?.date || state.manifest?.latest;
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  els.calendarMonthLabel.textContent = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(state.calendarMonth);
  const cells = Array.from({ length: firstDay }, () => "<span class=\"calendar-blank\"></span>");
  for (let day = 1; day <= days; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const enabled = published.has(date);
    cells.push(`
      <button
        type="button"
        class="${date === selected ? "selected" : ""}"
        data-market-date="${date}"
        ${enabled ? "" : "disabled"}
        aria-label="${escapeHtml(date)}${enabled ? "" : ", not published"}"
      >${day}</button>
    `);
  }
  els.calendarGrid.innerHTML = cells.join("");
}

function openCalendar() {
  const selected = state.payload?.date || state.manifest?.latest;
  state.calendarMonth = new Date(`${selected.slice(0, 7)}-01T00:00:00Z`);
  renderCalendar();
  openModal(els.datePickerModal);
}

async function loadDate(marketDate) {
  const item = state.manifest.dates.find((entry) => entry.date === marketDate);
  if (!item) return;
  const token = ++state.loadToken;
  loading(30);
  const payload = await fetchJson(item.file);
  if (token !== state.loadToken) return;
  state.payload = payload;
  state.currentManifestEntry = item;
  loading(72);
  rebuildIndexes();
  if (state.selectedTicker && !state.technicalByTicker.has(state.selectedTicker) && !state.signalsByTicker.has(state.selectedTicker)) {
    state.selectedTicker = "";
  }
  renderAll();
  renderCalendar();
  loading(100);
}

async function init() {
  loading(12);
  state.manifest = await fetchJson("data/manifest.json");
  if (!state.manifest.dates?.length) throw new Error("No screener datasets have been published.");
  loading(25);
  const historyPromise = state.manifest.history
    ? fetchJson(state.manifest.history).catch(() => ({ dates: [], tickers: {} }))
    : Promise.resolve({ dates: [], tickers: {} });
  const [payload, historyData] = await Promise.all([
    fetchJson(state.manifest.dates.find((entry) => entry.date === state.manifest.latest).file),
    historyPromise,
  ]);
  state.payload = payload;
  state.reference = {
    fundamental: payload.fundamental || [],
    news: payload.news || [],
  };
  state.currentManifestEntry = state.manifest.dates.find((entry) => entry.date === state.manifest.latest) || null;
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
  const closeTarget = event.target.closest("[data-close-modal]");
  if (closeTarget) {
    closeModal(closeTarget.dataset.closeModal === "date" ? els.datePickerModal : els.indicatorSettingsModal);
    return;
  }
  const dateTarget = event.target.closest("[data-market-date]");
  if (dateTarget && !dateTarget.disabled) {
    closeModal(els.datePickerModal);
    loadDate(dateTarget.dataset.marketDate).catch((error) => showError(error.message));
    return;
  }
  const toolTarget = event.target.closest("[data-chart-tool]");
  if (toolTarget) {
    const tool = toolTarget.dataset.chartTool;
    if (tool === "indicators") {
      populateIndicatorSettingsForm();
      openModal(els.indicatorSettingsModal);
      return;
    }
    if (tool === "fit") {
      state.chart?.timeScale().fitContent();
      return;
    }
    if (tool === "clear") {
      state.chartDrawings.forEach((line) => state.chartCandleSeries?.removePriceLine(line));
      state.chartDrawings = [];
      return;
    }
    state.chartTool = tool;
    els.chartToolRail.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.chartTool === tool);
    });
    state.chart?.applyOptions({
      crosshair: {
        mode: tool === "crosshair" ? LightweightCharts.CrosshairMode.Magnet : LightweightCharts.CrosshairMode.Normal,
      },
    });
    return;
  }
  const rangeTarget = event.target.closest("[data-chart-range]");
  if (rangeTarget) {
    setChartRange(rangeTarget.dataset.chartRange);
    return;
  }
  const chartAction = event.target.closest("[data-chart-action]");
  if (chartAction) {
    if (chartAction.dataset.chartAction === "reload") renderPriceChart(state.selectedTicker);
    if (chartAction.dataset.chartAction === "change") {
      els.tickerCommand.value = "";
      els.tickerCommand.focus();
    }
    if (chartAction.dataset.chartAction === "technical") {
      document.querySelector("#technicalGrid")?.closest(".panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }
  if (event.target.closest("[data-reset-filters]")) {
    resetScreenerFilters();
    return;
  }
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
els.themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
els.datePickerButton.addEventListener("click", openCalendar);
els.calendarPrevious.addEventListener("click", () => {
  state.calendarMonth = new Date(Date.UTC(
    state.calendarMonth.getUTCFullYear(),
    state.calendarMonth.getUTCMonth() - 1,
    1,
  ));
  renderCalendar();
});
els.calendarNext.addEventListener("click", () => {
  state.calendarMonth = new Date(Date.UTC(
    state.calendarMonth.getUTCFullYear(),
    state.calendarMonth.getUTCMonth() + 1,
    1,
  ));
  renderCalendar();
});
els.calendarLatest.addEventListener("click", () => {
  closeModal(els.datePickerModal);
  loadDate(state.manifest.latest).catch((error) => showError(error.message));
});
els.indicatorSettingsButton.addEventListener("click", () => {
  populateIndicatorSettingsForm();
  openModal(els.indicatorSettingsModal);
});
function handleIndicatorSettingInput(event) {
  const input = event.target.closest("[name]");
  if (!input) return;
  const value = input.type === "checkbox"
    ? input.checked
    : input.type === "number"
      ? Number(input.value)
      : input.value;
  if (input.type === "number" && (!Number.isFinite(value) || !input.validity.valid)) return;
  objectPathValue(state.indicatorSettings, input.name, value);
  saveIndicatorSettings();
  updateActiveIndicatorStrip();
  window.clearTimeout(state.indicatorRenderTimer);
  state.indicatorRenderTimer = window.setTimeout(() => {
    if (state.selectedTicker) renderPriceChart(state.selectedTicker);
  }, 220);
}
els.indicatorSettingsForm.addEventListener("change", handleIndicatorSettingInput);
els.indicatorSettingsForm.addEventListener("input", handleIndicatorSettingInput);
els.resetIndicatorSettings.addEventListener("click", () => {
  state.indicatorSettings = IDXIndicators.deepMerge(IDXIndicators.DEFAULTS, {});
  saveIndicatorSettings();
  populateIndicatorSettingsForm();
  updateActiveIndicatorStrip();
  if (state.selectedTicker) renderPriceChart(state.selectedTicker);
});
document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeModal(backdrop);
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeModal(els.datePickerModal);
  closeModal(els.indicatorSettingsModal);
});
els.resetFilters.addEventListener("click", resetScreenerFilters);
els.refreshData.addEventListener("click", () => {
  const selectedDate = state.payload?.date || state.manifest?.latest;
  els.datasetState.className = "status-badge info";
  els.datasetState.textContent = "Loading";
  loadDate(selectedDate).catch((error) => showError(error.message));
});
window.addEventListener("hashchange", routeFromHash);

initTheme();
loadIndicatorSettings();
populateIndicatorSettingsForm();
updateActiveIndicatorStrip();
init().catch((error) => {
  loading(100);
  showError(error.message);
  els.runMeta.textContent = "The dashboard could not load its published data.";
});
