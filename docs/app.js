const DISCLAIMER = "Educational research only. Not financial advice. Data is source-limited, archived, and not real-time. Verify independently before making trading decisions.";
const WATCHLIST_KEY = "idx-research-watchlist-v1";
const THEME_KEY = "idx-research-theme";
const INDICATOR_SETTINGS_KEY = "idx-research-indicators-v1";
const DRAWINGS_KEY_PREFIX = "idx-research-drawings:";

const state = {
  manifest: null,
  updateLog: { entries: [] },
  entry: null,
  marketDate: "",
  data: null,
  view: "dashboard",
  selectedTicker: "",
  maps: {
    technical: new Map(),
    fundamental: new Map(),
    news: new Map(),
    signals: new Map(),
  },
  filters: {
    search: "",
    sector: "ALL",
    signal: "ALL",
    rvol: null,
    rs: null,
    quality: "ALL",
    sort: "source",
  },
  density: "comfortable",
  heatmapMode: "tickers",
  explorerSheet: "Screener",
  explorerSearch: "",
  indicatorSettings: null,
  calendarMonth: null,
  loadToken: 0,
  chart: null,
  chartCandles: null,
  chartRows: [],
  chartResizeObserver: null,
  ohlcvCache: new Map(),
  chartMode: "research",
  chartInterval: "1D",
  chartRange: "1Y",
  chartPayload: null,
  tradingViewSymbol: "",
  logicReference: { records: [] },
  guideSearch: "",
  guideCategory: "ALL",
  activeDrawingTool: "crosshair",
  drawingDraft: null,
  navigationReady: false,
  kseiManifest: null,
  kseiData: null,
  kseiFilters: { search: "", sector: "ALL", type: "ALL", sort: "hhi" },
};

const viewTitles = {
  dashboard: ["DASHBOARD", "Research Dashboard"],
  market: ["MARKET MAP", "IDX Market Map"],
  screener: ["SCREENER", "Signal Screener"],
  watchlist: ["WATCHLIST", "Local Watchlist"],
  ticker: ["TICKER RESEARCH", "Ticker Research"],
  ownership: ["KSEI OWNERSHIP", "Ownership Dashboard"],
  quality: ["DATA QUALITY", "Data Quality"],
  explorer: ["WORKBOOK EXPLORER", "Workbook Explorer"],
  guide: ["GUIDE", "Methodology Guide"],
};

const els = Object.fromEntries(
  [
    "loadBar", "errorBanner", "pageTitle", "eyebrow", "sidebarStatus", "sidebarDate",
    "datasetState", "datasetLine", "footerFreshness", "refreshData", "workbookDownload",
    "menuButton", "themeToggle", "tickerCommand", "mobileTickerCommand", "tickerList", "datePickerButton",
    "selectedDateLabel", "datePickerModal", "calendarPrevious", "calendarNext",
    "calendarMonthLabel", "calendarGrid", "calendarLatest", "marketCoverageBadge",
    "dashboardMarketDate", "dashboardPublished", "dashboardHealthTitle", "dashboardHealth",
    "dashboardSignalTitle", "dashboardSignals", "dashboardSectorTitle", "dashboardSectors",
    "dashboardResearchRows",
    "marketContextGrid", "marketMetricGrid", "marketMap", "sectorSignalHeatmap", "heatmapMode",
    "qualityFunnel", "activityMap", "screenerCount", "screenerSearch", "sectorSelect",
    "signalSelect", "rvolMinimum", "rsMinimum", "qualitySelect", "sortSelect",
    "resetFilters", "densityToggle", "exportScreener", "signalLenses", "screenerTable",
    "screenerHead", "screenerBody", "screenerEmpty", "watchlistContent",
    "exportWatchlist", "tickerEmpty", "tickerContent", "tickerHero", "tickerKeyMetrics",
    "tickerSignals", "chartWorkspace", "priceChart", "chartLegend", "historyStatus", "historyMeta",
    "indicatorSettingsButton", "activeIndicatorStrip", "tradingViewLink", "levelMap",
    "chartSourceBadge", "chartTickerSearch", "resetChartLayout", "fullscreenChart",
    "researchChartView", "tradingViewChartView", "tradingViewWidget", "chartOverlayLayer", "chartDrawingLayer",
    "tickerSourceStatus", "technicalGrid", "fundamentalGrid", "fundamentalModeBadge",
    "tickerKseiCard",
    "newsPanel", "newsModeBadge", "lastSuccessfulLoad", "qualityMetricGrid",
    "sourceCoverage", "qaSummary", "qualityExceptions", "explorerCount",
    "explorerSheet", "explorerSearch", "exportExplorer", "explorerReferenceBadge",
    "explorerHead", "explorerBody", "explorerEmpty", "indicatorSettingsModal",
    "indicatorSettingsForm", "settingsSavedState", "resetIndicatorSettings",
    "guideCount", "guideSearch", "guideClear", "guideCategories", "guideGlossary",
    "guideResults", "guideEmpty",
    "kseiAsOfBadge", "kseiUpdateButton", "kseiUnavailable", "kseiContent",
    "kseiMetricGrid", "kseiOwnershipTypes", "kseiCcsDonut",
    "kseiSectorConcentration", "kseiResultCount", "kseiSearch",
    "kseiSectorFilter", "kseiTypeFilter", "kseiSort", "kseiTableBody",
    "kseiSourceNote", "kseiUpdateModal", "kseiUpdateDates",
    "kseiUpdateSummary", "kseiUpdateDetails", "kseiDetailModal",
    "kseiDetailTitle", "kseiDetailSubtitle", "kseiDetailBody",
  ].map((id) => [id, document.getElementById(id)]),
);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === "" || value === "-" || value === "N/A") return null;
  const match = String(value).replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function validValue(value) {
  return value !== null && value !== undefined && value !== "" && value !== "-" && value !== "N/A";
}

function formatTimestamp(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(date)} WIB`;
}

function findValue(row, names) {
  if (!row) return null;
  for (const name of names) {
    if (validValue(row[name])) return row[name];
    const groupedKey = Object.keys(row).find((key) => key.endsWith(` · ${name}`));
    if (groupedKey && validValue(row[groupedKey])) return row[groupedKey];
  }
  return null;
}

function tickerOf(row) {
  return String(row?.Ticker || row?.ticker || "").trim().toUpperCase();
}

function formatNumber(value, digits = 2) {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  return parsed.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function percentNumber(value) {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  return Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
}

function formatPercent(value) {
  const parsed = percentNumber(value);
  if (parsed === null) return null;
  return `${parsed > 0 ? "+" : ""}${parsed.toFixed(2)}%`;
}

function formatPrice(value) {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  return parsed.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function toneFor(value) {
  const parsed = percentNumber(value);
  if (parsed === null || parsed === 0) return "neutral";
  return parsed > 0 ? "positive" : "negative";
}

function inferredMissingMeta(source = "workbook", reason = "field_not_found") {
  return {
    status: "missing",
    reason,
    source,
    asOf: state.marketDate,
    formula: null,
  };
}

function valueHtml(value, meta, formatter = (item) => String(item), options = {}) {
  if (!validValue(value)) {
    const detail = meta || inferredMissingMeta(options.source, options.reason);
    const title = [
      `Status: ${detail.status || "missing"}`,
      `Reason: ${detail.reason || "source_unavailable"}`,
      `Source: ${detail.source || options.source || "workbook"}`,
      `As of: ${detail.asOf || state.marketDate || "unknown"}`,
      detail.formula ? `Formula: ${detail.formula}` : "",
    ].filter(Boolean).join(" | ");
    return `<span class="missing-value" title="${escapeHtml(title)}">— <small>${escapeHtml(detail.source || options.source || "Missing")}</small></span>`;
  }
  const rendered = formatter(value);
  const source = meta?.source || options.source;
  const chip = options.showSource && source ? ` <span class="source-chip">${escapeHtml(sourceLabel(source))}</span>` : "";
  return `${escapeHtml(rendered ?? String(value))}${chip}`;
}

function sourceLabel(source) {
  const labels = {
    yfinance: "YF",
    investing_com: "INV",
    workbook: "Workbook",
    derived: "Derived",
    tradingview_chart: "Chart",
  };
  return labels[source] || source || "Missing";
}

function logicConcept(id) {
  return state.logicReference.records.find((item) => item.id === id);
}

function guideLink(id, label = "Learn more") {
  return `<button class="guide-link" type="button" data-guide-id="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
}

function shortTooltip(id) {
  const item = logicConcept(id);
  if (!item) return "";
  return `${item.shortDefinition} Learn more in Guide: ${item.displayName}.`;
}

const GUIDE_LABEL_ALIASES = {
  "last price": "price-change-percent",
  price: "price-change-percent",
  change: "price-change-percent",
  "change %": "price-change-percent",
  rvol: "rvol",
  rs: "rs-rating",
  "rs rating": "rs-rating",
  signal: "signal-rows",
  "signal group": "signal-rows",
  "signal rows": "signal-rows",
  "unique tickers": "unique-signal-tickers",
  "data status": "data-quality-status",
  status: "data-quality-status",
  source: "source-workbook",
  "as of": "market-date",
  "market date": "market-date",
  entry: "entry-level",
  target: "target-level",
  invalidation: "invalidation-level",
  "r/r": "risk-reward",
  "target upside %": "target-upside",
  "ema trend": "ema-trend",
  "current q vwap": "vwap-current-quarter",
  "prev q vwap": "vwap-previous-quarter",
  "prev y vwap": "vwap-previous-year",
  vwap: "tradingview-default-vwap",
  rsi: "rsi",
  macd: "macd",
  "volume ma": "volume-ma",
  quality: "data-quality-status",
};

function conceptIdForLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();
  const direct = GUIDE_LABEL_ALIASES[normalized];
  if (direct && logicConcept(direct)) return direct;
  return logicConcept(normalized)?.id
    || state.logicReference.records.find((item) => item.displayName.toLowerCase() === normalized)?.id
    || null;
}

function guideHeading(label, conceptId = null) {
  const id = conceptId || conceptIdForLabel(label);
  if (!id) return escapeHtml(label);
  return `<span class="guided-label" title="${escapeHtml(shortTooltip(id))}">${escapeHtml(label)} ${guideLink(id, "?")}</span>`;
}

function hydrateGuideTooltips() {
  document.querySelectorAll("[data-guide-concept]").forEach((element) => {
    const id = element.dataset.guideConcept;
    const tooltip = shortTooltip(id);
    if (tooltip) element.title = tooltip;
  });
}

function loading(progress) {
  document.body.classList.toggle("app-loading", progress < 100);
  els.loadBar.style.width = `${progress}%`;
  els.loadBar.style.opacity = progress >= 100 ? "0" : "1";
  if (progress >= 100) window.setTimeout(() => { els.loadBar.style.width = "0"; }, 250);
}

function showError(message) {
  els.errorBanner.hidden = false;
  els.errorBanner.textContent = message;
}

function clearError() {
  els.errorBanner.hidden = true;
  els.errorBanner.textContent = "";
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return response.json();
}

function applyTheme(theme) {
  const normalized = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = normalized;
  localStorage.setItem(THEME_KEY, normalized);
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    normalized === "dark" ? "#07111f" : "#edf3f9",
  );
  if (state.selectedTicker && state.view === "ticker") renderPriceChart(state.selectedTicker);
}

function initTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || "dark");
}

function mapRows(rows) {
  return new Map((rows || []).map((row) => [tickerOf(row), row]).filter(([ticker]) => ticker));
}

function groupRows(rows) {
  const grouped = new Map();
  (rows || []).forEach((row) => {
    const ticker = tickerOf(row);
    if (!ticker) return;
    if (!grouped.has(ticker)) grouped.set(ticker, []);
    grouped.get(ticker).push(row);
  });
  return grouped;
}

function activeFundamentalRecords() {
  return state.data?.fundamental?.activeRecords || [];
}

function activeNewsRecords() {
  return state.data?.news?.activeRecords || [];
}

function rebuildIndexes() {
  const technical = state.data?.technical?.records || {};
  state.maps.technical = new Map(Object.entries(technical).map(([ticker, row]) => [ticker.toUpperCase(), row]));
  state.maps.fundamental = mapRows(activeFundamentalRecords());
  state.maps.news = groupRows(activeNewsRecords());
  state.maps.signals = groupRows(state.data?.screener?.records || []);
  const tickers = [...new Set([
    ...state.maps.technical.keys(),
    ...state.maps.fundamental.keys(),
    ...state.maps.signals.keys(),
  ])].sort();
  els.tickerList.innerHTML = tickers.map((ticker) => `<option value="${escapeHtml(ticker)}"></option>`).join("");
}

function archiveBase(marketDate) {
  return `data/dates/${marketDate}/`;
}

async function resolveReference(domain, marketDate, payload) {
  if (payload.dataMode !== "latest_reference_not_point_in_time") {
    return { ...payload, activeRecords: payload.records || [], isReference: false };
  }
  try {
    const reference = await fetchJson(`${archiveBase(marketDate)}${payload.referencePath}`);
    return {
      ...payload,
      activeRecords: reference.records || [],
      isReference: true,
      referenceMarketDate: payload.referenceMarketDate,
      referenceLoadStatus: "loaded",
    };
  } catch (error) {
    return {
      ...payload,
      activeRecords: [],
      isReference: true,
      referenceLoadStatus: "failed",
      referenceError: error.message,
    };
  }
}

async function loadKseiForDate(marketDate) {
  const available = (state.kseiManifest?.availableDates || []).filter((date) => date <= marketDate);
  if (!available.length) return null;
  const asOf = available.at(-1);
  const entry = state.kseiManifest.snapshots.find((item) => item.asOf === asOf);
  if (!entry) return null;
  return fetchJson(entry.path.replace(/^data\//, "data/"));
}

async function loadDate(marketDate, options = {}) {
  const entry = state.manifest.dates.find((item) => item.marketDate === marketDate);
  if (!entry) throw new Error(`Market date ${marketDate} is not published.`);
  const token = ++state.loadToken;
  clearError();
  loading(20);
  els.datasetState.className = "status-badge info";
  els.datasetState.textContent = "Loading";
  const base = archiveBase(marketDate);
  const [overview, screener, technical, fundamentalRaw, newsRaw, processing, qa] = await Promise.all([
    fetchJson(`${base}overview.json`),
    fetchJson(`${base}screener.json`),
    fetchJson(`${base}technical.json`),
    fetchJson(`${base}fundamental.json`),
    fetchJson(`${base}news.json`),
    fetchJson(`${base}processing-results.json`),
    fetchJson(`${base}qa-audit.json`),
  ]);
  if (token !== state.loadToken) return;
  if ([overview, screener, technical].some((payload) => payload.schemaVersion !== 5)) {
    throw new Error(`Schema error for ${marketDate}. Expected schema version 5.`);
  }
  loading(55);
  const [fundamental, news, kseiData] = await Promise.all([
    resolveReference("fundamental", marketDate, fundamentalRaw),
    resolveReference("news", marketDate, newsRaw),
    loadKseiForDate(marketDate),
  ]);
  if (token !== state.loadToken) return;
  state.marketDate = marketDate;
  state.entry = entry;
  state.data = { overview, screener, technical, fundamental, news, processing, qa };
  state.kseiData = kseiData;
  rebuildIndexes();
  if (state.selectedTicker && !state.maps.technical.has(state.selectedTicker) && !state.maps.signals.has(state.selectedTicker)) {
    state.selectedTicker = "";
  }
  updateDateQuery(marketDate, options.historyMode || "auto");
  renderAll();
  renderCalendar();
  loading(100);
}

function rememberScrollPosition() {
  history.replaceState(
    { ...(history.state || {}), scrollY: window.scrollY },
    "",
    window.location.href,
  );
}

function updateDateQuery(marketDate, historyMode = "auto") {
  const url = new URL(window.location.href);
  url.searchParams.set("date", marketDate);
  const target = `${url.pathname}${url.search}${location.hash || "#dashboard"}`;
  if (historyMode === "none") return;
  const replace = historyMode === "replace" || !state.navigationReady;
  if (!replace && target === `${location.pathname}${location.search}${location.hash}`) return;
  if (!replace) rememberScrollPosition();
  history[replace ? "replaceState" : "pushState"](
    { scrollY: 0 },
    "",
    target,
  );
  if (!replace) window.scrollTo({ top: 0, behavior: "smooth" });
}

function showView(view, updateHash = true, options = {}) {
  if (!viewTitles[view]) view = "market";
  if (view !== "ticker") destroyChart();
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
    const target = `${location.pathname}${location.search}#${view}${suffix}`;
    if (target !== `${location.pathname}${location.search}${location.hash}`) {
      rememberScrollPosition();
      history.pushState({ scrollY: 0 }, "", target);
    }
  }
  if (view === "ticker" && state.selectedTicker) renderTicker();
  if (options.scroll !== false) window.scrollTo({ top: 0, behavior: "smooth" });
}

function routeFromHash(options = {}) {
  const [view = "dashboard", ticker] = location.hash.replace(/^#/, "").split("/");
  if (view === "ticker" && ticker) {
    state.selectedTicker = ticker.toUpperCase();
  }
  showView(view, false, options);
}

async function restoreNavigation(event) {
  const requestedDate = new URL(window.location.href).searchParams.get("date");
  const marketDate = state.manifest.availableMarketDates.includes(requestedDate)
    ? requestedDate
    : state.manifest.latestMarketDate;
  if (marketDate !== state.marketDate) {
    await loadDate(marketDate, { historyMode: "none" });
  }
  routeFromHash({ scroll: false });
  requestAnimationFrame(() => window.scrollTo({ top: event.state?.scrollY || 0, behavior: "auto" }));
}

function selectTicker(ticker, updateHash = true) {
  const normalized = String(ticker || "").trim().toUpperCase().replace(".JK", "");
  if (!normalized) return;
  state.selectedTicker = normalized;
  els.tickerCommand.value = normalized;
  showView("ticker", updateHash);
  renderTicker();
}

function summary() {
  return state.data?.overview?.summary || {};
}

function metricCard(label, value, detail, tone = "") {
  const conceptMap = {
    "Scanned tickers": "total-scanned",
    "OK tickers": "ok-tickers",
    "Partial tickers": "partial-tickers",
    "No-data tickers": "no-data-tickers",
    "Signal rows": "signal-rows",
    "Unique signal tickers": "unique-signal-tickers",
    "QA failures": "qa-warning",
  };
  const conceptId = conceptMap[label];
  return `<article class="metric-card ${tone}" ${conceptId ? `title="${escapeHtml(shortTooltip(conceptId))}"` : ""}><span>${escapeHtml(label)}${conceptId ? ` ${guideLink(conceptId, "?")}` : ""}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
}

function sectorMomentumRows() {
  const groups = new Map();
  state.maps.technical.forEach((stock) => {
    const sector = validValue(stock.sector) ? stock.sector : "Unclassified";
    const change = percentNumber(stock.changePercent);
    if (change === null) return;
    if (!groups.has(sector)) groups.set(sector, []);
    groups.get(sector).push(change);
  });
  return [...groups.entries()].map(([sector, values]) => ({
    sector,
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    count: values.length,
  })).sort((a, b) => b.average - a.average);
}

function renderDashboard() {
  const stats = summary();
  const qa = state.data.qa.summary || {};
  const status = (qa.fail || 0) > 0
    ? ["Issues found", "error"]
    : (stats.partial || 0) > 0 || (qa.warn || 0) > 0
      ? ["Partial", "warning"]
      : ["OK", "ok"];
  els.dashboardMarketDate.textContent = state.marketDate;
  els.dashboardPublished.textContent = `Published ${formatTimestamp(state.data.overview.generatedAt || state.manifest.generatedAt)}. Archive release, not real-time.`;
  els.dashboardHealthTitle.innerHTML = `Data Quality: <span class="status-badge ${status[1]}">${status[0]}</span>`;
  els.dashboardHealth.innerHTML = [
    ["Scanned", stats.totalScanned],
    ["OK", stats.ok],
    ["Partial", stats.partial],
    ["No data", stats.noData],
  ].map(([label, value]) => `<span><small>${escapeHtml(label)}</small><strong>${formatNumber(value, 0) || "0"}</strong></span>`).join("");

  const signalRows = (state.data.screener.records || []).map(normalizedSignal);
  const signalCounts = new Map();
  signalRows.forEach((row) => signalCounts.set(row.signal, (signalCounts.get(row.signal) || 0) + 1));
  const topSignals = [...signalCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  els.dashboardSignalTitle.textContent = `${formatNumber(stats.signalRows, 0) || "0"} rows · ${formatNumber(stats.signalTickers, 0) || "0"} tickers`;
  els.dashboardSignals.innerHTML = topSignals.length
    ? topSignals.map(([label, count]) => `<button type="button" data-dashboard-signal="${escapeHtml(label)}">${escapeHtml(label)} <b>${count}</b></button>`).join("")
    : `<span class="missing-value">No published signal rows for this date</span>`;

  const sectors = sectorMomentumRows();
  const strongest = sectors.slice(0, 2);
  const weakest = sectors.slice(-2).reverse();
  els.dashboardSectorTitle.textContent = `${formatNumber(sectors.length, 0) || "0"} sectors with observed change`;
  els.dashboardSectors.innerHTML = [
    ...strongest.map((item) => ({ ...item, tone: item.average >= 0 ? "positive" : "negative", label: "Highest" })),
    ...weakest.map((item) => ({ ...item, tone: item.average >= 0 ? "positive" : "negative", label: "Lowest" })),
  ].map((item) => `<button type="button" data-filter-sector="${escapeHtml(item.sector)}"><span><small>${item.label}</small><strong>${escapeHtml(item.sector)}</strong></span><b class="${item.tone}">${item.average >= 0 ? "+" : ""}${item.average.toFixed(2)}%</b></button>`).join("");

  const priorityRows = [...signalRows]
    .sort((a, b) => ((asNumber(b.rvol) || 0) * 10 + (asNumber(b.rs) || 0)) - ((asNumber(a.rvol) || 0) * 10 + (asNumber(a.rs) || 0)))
    .slice(0, 8);
  els.dashboardResearchRows.innerHTML = priorityRows.length
    ? `<table class="data-table dashboard-table"><thead><tr><th>Ticker</th><th>Company</th><th>Sector</th><th>Signal</th><th>Change</th><th>RVOL</th><th>RS</th><th>Status</th><th>Actions</th></tr></thead><tbody>${priorityRows.map((row) => `<tr data-open-ticker="${escapeHtml(row.ticker)}"><td><strong>${escapeHtml(row.ticker)}</strong></td><td>${escapeHtml(row.company || row.ticker)}</td><td>${escapeHtml(row.sector || "Unclassified")}</td><td><span class="signal-chip">${escapeHtml(row.signal)}</span></td><td class="numeric ${toneFor(row.change)}">${formatPercent(row.change) || "—"}</td><td class="numeric">${formatNumber(row.rvol, 2) || "—"}</td><td class="numeric">${formatNumber(row.rs, 0) || "—"}</td><td><span class="status-badge ${escapeHtml(String(row.dataStatus).toLowerCase())}">${escapeHtml(row.dataStatus)}</span></td><td class="row-actions"><button type="button" data-open-ticker="${escapeHtml(row.ticker)}">Open</button><button type="button" data-toggle-watch="${escapeHtml(row.ticker)}">${watchlist().includes(row.ticker) ? "Saved" : "Watch"}</button></td></tr>`).join("")}</tbody></table>`
    : `<div class="empty-state"><h3>No published signal rows</h3><p>The selected archive loaded successfully, but contains no active signal rows.</p></div>`;
}

function renderDatasetStatus() {
  const stats = summary();
  const historical = state.entry.snapshotMode === "historical_ohlcv_reconstruction";
  els.datasetState.className = `status-badge ${historical ? "warning" : "ok"}`;
  els.datasetState.textContent = historical ? "Reconstructed" : "Workbook";
  const lastUpdate = state.updateLog.entries?.at(-1);
  const lastLoad = lastUpdate?.timestamp || state.manifest.lastSuccessfulDatasetLoad;
  els.datasetLine.textContent = [
    `${formatNumber(stats.totalScanned, 0) || "0"} scanned`,
    `${formatNumber(stats.ok, 0) || "0"} OK`,
    `${formatNumber(stats.partial, 0) || "0"} partial`,
    `${formatNumber(stats.signalRows, 0) || "0"} signal rows from ${formatNumber(stats.signalTickers, 0) || "0"} tickers`,
    `last load ${formatTimestamp(lastLoad)}`,
  ].join(" · ");
  els.footerFreshness.textContent = `Data as of ${state.marketDate} · Last successful dataset load ${formatTimestamp(state.manifest.lastSuccessfulDatasetLoad)}`;
  const workbook = state.entry.workbook;
  els.workbookDownload.classList.toggle("disabled", !workbook);
  els.workbookDownload.setAttribute("aria-disabled", String(!workbook));
  els.workbookDownload.title = workbook
    ? `Download source workbook for ${state.marketDate}`
    : "A point-in-time workbook is not published for this reconstructed date.";
  if (workbook) els.workbookDownload.href = workbook;
  else els.workbookDownload.removeAttribute("href");
  els.sidebarStatus.textContent = "Dataset loaded";
  els.sidebarDate.textContent = state.marketDate;
  els.selectedDateLabel.textContent = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${state.marketDate}T00:00:00Z`));
}

function renderMarket() {
  const stats = summary();
  const overview = state.data.overview.overview || {};
  const breadth = overview.breadth || {};
  const technicalCount = state.maps.technical.size;
  els.marketCoverageBadge.textContent = `${formatNumber(technicalCount, 0) || 0} tickers`;
  renderMarketContext();
  els.marketMetricGrid.innerHTML = [
    metricCard("Advancing", formatNumber(breadth.advances, 0) || "0", "Positive daily change", "positive"),
    metricCard("Declining", formatNumber(breadth.declines, 0) || "0", "Negative daily change", "negative"),
    metricCard("Signal rows", formatNumber(stats.signalRows, 0) || "0", `${formatNumber(stats.signalTickers, 0) || 0} unique tickers`, "positive"),
    metricCard("Unavailable", formatNumber(stats.noData, 0) || "0", "Explicit no-data records", stats.noData ? "negative" : ""),
  ].join("");
  renderMarketMap();
  renderSectorSignalHeatmap();
  renderQualityFunnel();
  renderActivityMap();
}

function sparklineSvg(item) {
  const values = (item.series || []).map(asNumber).filter((value) => value !== null);
  if (values.length < 2) return "";
  const width = 80;
  const height = 28;
  const padding = 2;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum || 1;
  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - minimum) / spread) * (height - padding * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  return `<svg class="market-context-sparkline ${toneFor(item.changePercent)}" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false"><polyline points="${points}" /></svg>`;
}

function renderMarketContext() {
  const published = state.data.overview.overview?.marketContext || [];
  const defaults = [
    ["IHSG", "^JKSE"],
    ["VIX", "^VIX"],
    ["EIDO", "EIDO"],
    ["KOSPI", "^KS11"],
  ];
  const records = defaults.map(([label, symbol]) => (
    published.find((item) => item.symbol === symbol || item.label === label)
    || {
      label,
      symbol,
      value: null,
      changePercent: null,
      status: "missing",
      reason: "market_context_not_published",
      source: "yfinance",
      asOf: state.marketDate,
    }
  ));
  els.marketContextGrid.innerHTML = records.map((item) => {
    const missing = !validValue(item.value);
    const detail = missing
      ? `${item.source || "yfinance"} · ${item.reason || "source_unavailable"}`
      : `${item.symbol} · ${item.source || "yfinance"} · ${item.asOf || state.marketDate}`;
    return `<article class="market-context-card ${missing ? "missing" : toneFor(item.changePercent)}"><div class="market-context-copy"><span>${escapeHtml(item.label || item.symbol)}</span><strong>${missing ? valueHtml(null, item, formatNumber) : escapeHtml(formatNumber(item.value, 2))}</strong><small class="${toneFor(item.changePercent)}">${missing ? escapeHtml(detail) : `${escapeHtml(formatPercent(item.changePercent) || "0.00%")} · ${escapeHtml(detail)}`}</small></div>${sparklineSvg(item)}</article>`;
  }).join("");
}

function renderMarketMap() {
  const signals = new Map();
  (state.data.screener.records || []).forEach((row) => {
    const ticker = tickerOf(row);
    signals.set(ticker, (signals.get(ticker) || 0) + 1);
  });
  const sectors = new Map();
  state.maps.technical.forEach((stock, ticker) => {
    const sector = validValue(stock.sector) ? stock.sector : "Unclassified";
    if (!sectors.has(sector)) sectors.set(sector, []);
    sectors.get(sector).push({ ticker, stock });
  });
  els.marketMap.innerHTML = [...sectors.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sector, rows]) => {
      const validChanges = rows.map(({ stock }) => percentNumber(stock.changePercent)).filter((value) => value !== null);
      const average = validChanges.length ? validChanges.reduce((sum, value) => sum + value, 0) / validChanges.length : 0;
      const tiles = rows
        .sort((a, b) => (asNumber(b.stock.fundamentals?.marketCap) || 0) - (asNumber(a.stock.fundamentals?.marketCap) || 0))
        .map(({ ticker, stock }) => {
          const change = formatPercent(stock.changePercent);
          const signalCount = signals.get(ticker) || 0;
          const title = [
            ticker,
            stock.companyName || ticker,
            sector,
            `Price: ${formatPrice(stock.lastPrice) || "missing"}`,
            `Change: ${change || "missing"}`,
            `RVOL: ${formatNumber(stock.rvol) || "missing"}`,
            `RS: ${formatNumber(stock.rsRating) || "missing"}`,
            `Signal rows: ${signalCount}`,
            `Data status: ${stock.dataStatus || "UNKNOWN"}`,
            shortTooltip("rvol"),
            shortTooltip("data-quality-status"),
          ].join(" | ");
          return `<button class="market-tile ${toneFor(stock.changePercent)}" type="button" data-open-ticker="${escapeHtml(ticker)}" title="${escapeHtml(title)}"><strong>${escapeHtml(ticker)}</strong><span>${escapeHtml(change || "—")}</span><small>${signalCount ? `${signalCount} signal rows` : stock.dataStatus || "No signal row"}</small></button>`;
        }).join("");
      return `<details class="sector-group"><summary class="sector-group-head"><strong>${escapeHtml(sector)}</strong><small class="${average >= 0 ? "positive" : "negative"}">${average >= 0 ? "+" : ""}${average.toFixed(2)}% · ${rows.length} tickers</small></summary><div class="ticker-tiles">${tiles}</div><div class="sector-group-action"><button type="button" data-filter-sector="${escapeHtml(sector)}">View all signals in this sector</button></div></details>`;
    }).join("");
}

function sectorSignalMatrix() {
  const matrix = new Map();
  const signals = state.data.screener.records || [];
  signals.forEach((row) => {
    const sector = findValue(row, ["Sector", "IDX Sector"]) || state.maps.technical.get(tickerOf(row))?.sector || "Unclassified";
    const signal = row.signalType || row["Filter Label"] || "Workbook Signal";
    const key = `${sector}|||${signal}`;
    if (!matrix.has(key)) matrix.set(key, { rows: 0, tickers: new Set() });
    const cell = matrix.get(key);
    cell.rows += 1;
    cell.tickers.add(tickerOf(row));
  });
  return matrix;
}

function renderSectorSignalHeatmap() {
  const rows = state.data.screener.records || [];
  const sectors = [...new Set(rows.map((row) => findValue(row, ["Sector", "IDX Sector"]) || state.maps.technical.get(tickerOf(row))?.sector || "Unclassified"))].sort();
  const signals = [...new Set(rows.map((row) => row.signalType || row["Filter Label"] || "Workbook Signal"))].sort();
  const matrix = sectorSignalMatrix();
  const values = [...matrix.values()].map((cell) => state.heatmapMode === "tickers" ? cell.tickers.size : cell.rows);
  const maximum = Math.max(1, ...values);
  els.heatmapMode.textContent = state.heatmapMode === "tickers" ? "Unique tickers" : "Signal rows";
  if (!sectors.length || !signals.length) {
    els.sectorSignalHeatmap.innerHTML = `<div class="empty-state"><h3>No sector-signal cells</h3><p>The published screener contains zero rows for this market date.</p></div>`;
    return;
  }
  els.sectorSignalHeatmap.innerHTML = `<table class="heatmap-table"><thead><tr><th>Sector</th>${signals.map((signal) => `<th>${guideHeading(signal)}</th>`).join("")}</tr></thead><tbody>${sectors.map((sector) => `<tr><th>${escapeHtml(sector)}</th>${signals.map((signal) => {
    const cell = matrix.get(`${sector}|||${signal}`) || { rows: 0, tickers: new Set() };
    const value = state.heatmapMode === "tickers" ? cell.tickers.size : cell.rows;
    const heat = Math.round((value / maximum) * 54);
    const title = `${sector} | ${signal} | ${cell.tickers.size} tickers | ${cell.rows} rows | ${[...cell.tickers].join(", ")}`;
    return `<td><button type="button" style="--heat:${heat}" data-sector-filter="${escapeHtml(sector)}" data-signal-filter="${escapeHtml(signal)}" title="${escapeHtml(title)}">${value}</button></td>`;
  }).join("")}</tr>`).join("")}</tbody></table>`;
}

function renderQualityFunnel() {
  const stats = summary();
  const signalTickers = new Set((state.data.screener.records || []).map(tickerOf));
  const volumeConfirmed = [...signalTickers].filter((ticker) => (asNumber(state.maps.technical.get(ticker)?.rvol) || 0) >= 1).length;
  const newsSupported = [...signalTickers].filter((ticker) => {
    const rows = state.maps.news.get(ticker) || [];
    return rows.some((row) => validValue(findValue(row, ["Latest News Title", "Headline", "Title", "Sentiment News"])));
  }).length;
  const stages = [
    ["Total scanned tickers", asNumber(stats.totalScanned) || 0],
    ["Full-data tickers", asNumber(stats.ok) || 0],
    ["Tickers with technical signal", signalTickers.size],
    ["Volume-confirmed signal tickers", volumeConfirmed],
    ["Signal tickers with published news", newsSupported],
    ["Final unique signal tickers", asNumber(stats.signalTickers) || 0],
  ];
  const maximum = Math.max(1, ...stages.map(([, value]) => value));
  els.qualityFunnel.innerHTML = stages.map(([label, value]) => `<div class="funnel-row" style="--width:${Math.max(4, (value / maximum) * 100)}%"><span><strong>${escapeHtml(label)}</strong><b>${formatNumber(value, 0)}</b></span></div>`).join("");
}

function renderActivityMap() {
  const rows = [...state.maps.technical.entries()]
    .map(([ticker, stock]) => ({
      ticker,
      change: percentNumber(stock.changePercent),
      rvol: asNumber(stock.rvol),
      marketCap: asNumber(stock.fundamentals?.marketCap),
      sector: stock.sector || "Unclassified",
    }))
    .filter((row) => row.change !== null && row.rvol !== null);
  if (!rows.length) {
    els.activityMap.innerHTML = `<div class="empty-state"><h3>Activity data unavailable</h3><p>Daily change and relative volume are required for this view.</p></div>`;
    return;
  }
  const width = 900;
  const height = 380;
  const pad = 48;
  const xMax = Math.max(5, ...rows.map((row) => Math.min(20, Math.abs(row.change))));
  const yMax = Math.max(2, ...rows.map((row) => Math.min(8, row.rvol)));
  const x = (value) => pad + ((Math.max(-xMax, Math.min(xMax, value)) + xMax) / (xMax * 2)) * (width - pad * 2);
  const y = (value) => height - pad - (Math.max(0, Math.min(yMax, value)) / yMax) * (height - pad * 2);
  const colors = ["#3b82f6", "#22d3ee", "#8b5cf6", "#f59e0b", "#ec4899", "#14b8a6", "#94a3b8"];
  const sectorColors = new Map([...new Set(rows.map((row) => row.sector))].sort().map((sector, index) => [sector, colors[index % colors.length]]));
  const bubbles = rows.map((row) => {
    const radius = row.marketCap ? Math.max(3, Math.min(11, Math.log10(Math.max(row.marketCap, 10)) - 5)) : 4;
    const title = `${row.ticker} | ${row.sector} | Change ${row.change.toFixed(2)}% | RVOL ${row.rvol.toFixed(2)}`;
    return `<circle cx="${x(row.change).toFixed(1)}" cy="${y(row.rvol).toFixed(1)}" r="${radius.toFixed(1)}" fill="${sectorColors.get(row.sector)}" fill-opacity="0.68" stroke="${row.change >= 0 ? "#60a5fa" : "#ef4444"}" stroke-width="1.1" data-open-ticker="${escapeHtml(row.ticker)}"><title>${escapeHtml(title)}</title></circle>`;
  }).join("");
  els.activityMap.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="IDX activity map"><line x1="${x(0)}" y1="${pad}" x2="${x(0)}" y2="${height - pad}" stroke="rgba(148,163,184,.28)" /><line x1="${pad}" y1="${y(1)}" x2="${width - pad}" y2="${y(1)}" stroke="rgba(148,163,184,.28)" /><text x="${pad}" y="${height - 14}">Negative daily change</text><text x="${width - pad}" y="${height - 14}" text-anchor="end">Positive daily change</text><text x="12" y="${pad}">Higher RVOL</text><text x="12" y="${height - pad}">Lower RVOL</text>${bubbles}</svg>`;
}

function normalizedSignal(row) {
  const ticker = tickerOf(row);
  const stock = state.maps.technical.get(ticker) || {};
  return {
    raw: row,
    ticker,
    company: stock.companyName || ticker,
    sector: findValue(row, ["Sector", "IDX Sector"]) || stock.sector,
    signal: row.signalType || row["Filter Label"] || "Workbook Signal",
    legacy: row.legacyFilter || "",
    price: findValue(row, ["Price", "Closing Price"]) ?? stock.lastPrice,
    change: findValue(row, ["Chg %", "Price Change %"]) ?? stock.changePercent,
    rvol: findValue(row, ["RVOL", "RVOL 20 D"]) ?? stock.rvol,
    adr: findValue(row, ["ADR %", "ADR"]),
    currentVwap: findValue(row, ["Current Q VWAP"]),
    previousVwap: findValue(row, ["Prev Q VWAP"]),
    previousYearVwap: findValue(row, ["Prev Y VWAP"]),
    ma: findValue(row, ["MA", "MA Zone"]),
    summary: findValue(row, ["Summary Screener", "Section"]),
    sentiment: findValue(row, ["Sentiment News"]),
    corporateAction: findValue(row, ["Corp. Action"]),
    entryPoi: findValue(row, ["Entry POI"]),
    entry: findValue(row, ["Entry"]),
    targetPoi: findValue(row, ["Target POI"]),
    target: findValue(row, ["Target"]),
    upside: findValue(row, ["Target Upside %", "Upside %"]),
    invalidationPoi: findValue(row, ["Invalidation POI"]),
    invalidation: findValue(row, ["Invalidation"]),
    rr: findValue(row, ["R/R"]),
    beta: findValue(row, ["Beta Zone"]),
    rs: findValue(row, ["RS Rating"]) ?? stock.rsRating,
    dataStatus: stock.dataStatus || "UNKNOWN",
    marketDate: state.marketDate,
    source: stock.provenance?.source || state.data.screener.provenance?.signals?.source || "workbook",
  };
}

function filteredSignals() {
  const needle = state.filters.search.toLowerCase();
  let rows = (state.data.screener.records || []).map(normalizedSignal).filter((row) => {
    if (state.filters.sector !== "ALL" && row.sector !== state.filters.sector) return false;
    if (state.filters.signal !== "ALL" && row.signal !== state.filters.signal) return false;
    if (state.filters.quality !== "ALL" && row.dataStatus !== state.filters.quality) return false;
    if (state.filters.rvol !== null && (asNumber(row.rvol) ?? -Infinity) < state.filters.rvol) return false;
    if (state.filters.rs !== null && (asNumber(row.rs) ?? -Infinity) < state.filters.rs) return false;
    if (needle && !Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle))) return false;
    return true;
  });
  const sorters = {
    change: (a, b) => (percentNumber(b.change) || -Infinity) - (percentNumber(a.change) || -Infinity),
    rvol: (a, b) => (asNumber(b.rvol) || -Infinity) - (asNumber(a.rvol) || -Infinity),
    rs: (a, b) => (asNumber(b.rs) || -Infinity) - (asNumber(a.rs) || -Infinity),
    rr: (a, b) => (asNumber(b.rr) || -Infinity) - (asNumber(a.rr) || -Infinity),
  };
  if (sorters[state.filters.sort]) rows = [...rows].sort(sorters[state.filters.sort]);
  return rows;
}

const screenerColumns = [
  ["Ticker", "ticker"], ["Company", "company"], ["Sector", "sector"], ["Signal", "signal"],
  ["Data Status", "dataStatus"], ["Chg %", "change"], ["RVOL", "rvol"], ["RS Rating", "rs"],
  ["Price", "price"], ["Market Date", "marketDate"], ["Legacy Code Audit", "legacy"],
  ["Summary Screener", "summary"], ["ADR %", "adr"], ["Current Q VWAP", "currentVwap"],
  ["Prev Q VWAP", "previousVwap"], ["Prev Y VWAP", "previousYearVwap"], ["MA", "ma"],
  ["Sentiment News", "sentiment"], ["Corp. Action", "corporateAction"], ["Entry Level Basis", "entryPoi"], ["Entry", "entry"],
  ["Target Level Basis", "targetPoi"], ["Target", "target"], ["Target Upside %", "upside"],
  ["Invalidation Basis", "invalidationPoi"], ["Invalidation", "invalidation"], ["R/R", "rr"],
  ["Beta Zone", "beta"], ["Source", "source"], ["Actions", "actions"],
];

function screenerCell(row, key) {
  if (key === "ticker") return `<strong>${escapeHtml(row.ticker)}</strong>`;
  if (key === "company") return `<span class="company-cell">${escapeHtml(row.company)}</span>`;
  if (key === "signal") return `<span class="signal-chip">${escapeHtml(row.signal)}</span>`;
  if (key === "legacy") return row.legacy ? `<code class="legacy-code">${escapeHtml(row.legacy)}</code>` : valueHtml(null, { reason: "field_not_found", source: "workbook", asOf: state.marketDate }, String);
  if (key === "change" || key === "upside") return `<span class="${toneFor(row[key])}">${valueHtml(row[key], null, (value) => formatPercent(value), { source: row.source })}</span>`;
  if (["price", "entry", "target", "invalidation"].includes(key)) return valueHtml(row[key], null, formatPrice, { source: row.source });
  if (["rvol", "adr", "rr", "rs"].includes(key)) return valueHtml(row[key], null, (value) => formatNumber(value, 2), { source: row.source });
  if (key === "source") return `<span class="source-chip">${escapeHtml(sourceLabel(row.source))}</span>`;
  if (key === "dataStatus") {
    const reason = row.dataStatus === "PARTIAL"
      ? "Some workbook or source fields are unavailable for this ticker/date."
      : row.dataStatus === "NO_DATA"
        ? "No usable archived data is available for this ticker/date."
        : "Required research fields are available.";
    return `<span class="status-badge ${escapeHtml(String(row.dataStatus).toLowerCase())}" title="${escapeHtml(reason)}">${escapeHtml(row.dataStatus)}</span>`;
  }
  if (key === "actions") return `<span class="row-actions"><button type="button" data-open-ticker="${escapeHtml(row.ticker)}">Open</button><button type="button" data-toggle-watch="${escapeHtml(row.ticker)}">${watchlist().includes(row.ticker) ? "Saved" : "Watch"}</button></span>`;
  return valueHtml(row[key], null, (value) => String(value), { source: row.source });
}

function setupScreenerOptions() {
  const signals = (state.data.screener.records || []).map(normalizedSignal);
  const sectors = [...new Set([
    ...signals.map((row) => row.sector),
    ...[...state.maps.technical.values()].map((stock) => stock.sector),
  ].filter(Boolean))].sort();
  const signalTypes = [...new Set(signals.map((row) => row.signal).filter(Boolean))].sort();
  els.sectorSelect.innerHTML = `<option value="ALL">All sectors</option>${sectors.map((sector) => `<option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>`).join("")}`;
  els.signalSelect.innerHTML = `<option value="ALL">All signal categories</option>${signalTypes.map((signal) => `<option value="${escapeHtml(signal)}">${escapeHtml(signal)}</option>`).join("")}`;
  els.sectorSelect.value = sectors.includes(state.filters.sector) ? state.filters.sector : "ALL";
  els.signalSelect.value = signalTypes.includes(state.filters.signal) ? state.filters.signal : "ALL";
  const counts = new Map();
  signals.forEach((row) => counts.set(row.signal, (counts.get(row.signal) || 0) + 1));
  els.signalLenses.innerHTML = `<button class="signal-lens ${state.filters.signal === "ALL" ? "active" : ""}" type="button" data-lens="ALL">All · ${signals.length}</button>${[...counts.entries()].map(([label, count]) => `<button class="signal-lens ${state.filters.signal === label ? "active" : ""}" type="button" data-lens="${escapeHtml(label)}">${escapeHtml(label)} · ${count}</button>`).join("")}`;
}

function renderScreener() {
  setupScreenerOptions();
  const sourceRows = state.data.screener.records || [];
  const rows = filteredSignals();
  els.screenerCount.textContent = `${rows.length} of ${sourceRows.length} rows`;
  els.screenerTable.classList.toggle("compact", state.density === "compact");
  els.densityToggle.textContent = state.density === "compact" ? "Compact" : "Comfortable";
  els.screenerHead.innerHTML = `<tr>${screenerColumns.map(([label]) => `<th>${guideHeading(label)}</th>`).join("")}</tr>`;
  els.screenerBody.innerHTML = rows.map((row) => `<tr data-open-ticker="${escapeHtml(row.ticker)}">${screenerColumns.map(([, key]) => `<td class="${["price", "change", "rvol", "adr", "entry", "target", "upside", "invalidation", "rr", "rs"].includes(key) ? "numeric" : ""} ${key === "summary" ? "wide-cell" : ""}">${screenerCell(row, key)}</td>`).join("")}</tr>`).join("");
  if (rows.length) {
    els.screenerEmpty.hidden = true;
  } else {
    const workbookEmpty = sourceRows.length === 0;
    els.screenerEmpty.hidden = false;
    els.screenerEmpty.innerHTML = workbookEmpty
      ? `<h3>Workbook contains no signal rows for this market date.</h3><p>The dataset loaded successfully and published a zero-row screener.</p>`
      : `<h3>No rows match the current filters.</h3><p>Reset filters or choose another sector, signal category, or threshold.</p><button class="secondary-button" type="button" data-reset-filters>Reset filters</button>`;
  }
}

function resetFilters() {
  state.filters = { search: "", sector: "ALL", signal: "ALL", rvol: null, rs: null, quality: "ALL", sort: "source" };
  els.screenerSearch.value = "";
  els.rvolMinimum.value = "";
  els.rsMinimum.value = "";
  els.qualitySelect.value = "ALL";
  els.sortSelect.value = "source";
  renderScreener();
}

function watchlist() {
  try {
    return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]");
  } catch {
    return [];
  }
}

function setWatchlist(tickers) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...new Set(tickers)].sort()));
  renderWatchlist();
  if (state.data) {
    renderDashboard();
    renderScreener();
  }
  if (state.selectedTicker) renderTickerHero(state.maps.technical.get(state.selectedTicker) || {});
}

function toggleWatchlist(ticker) {
  const items = watchlist();
  setWatchlist(items.includes(ticker) ? items.filter((item) => item !== ticker) : [...items, ticker]);
}

function renderWatchlist() {
  const items = watchlist();
  if (!items.length) {
    els.watchlistContent.innerHTML = `<div class="empty-state"><h3>Your local watchlist is empty.</h3><p>Add a ticker from Screener or Ticker Research. The list is stored locally in this browser only.</p></div>`;
    return;
  }
  const rows = items.map((ticker) => ({ ticker, stock: state.maps.technical.get(ticker) || {} }));
  els.watchlistContent.innerHTML = `<div class="table-shell"><table class="data-table"><thead><tr><th>Ticker</th><th>Sector</th><th>Signal</th><th>${guideHeading("Price")}</th><th>${guideHeading("Change")}</th><th>${guideHeading("RVOL")}</th><th>${guideHeading("RS")}</th><th>${guideHeading("Data status")}</th><th>Market date</th><th>Actions</th></tr></thead><tbody>${rows.map(({ ticker, stock }) => {
    const signal = (state.maps.signals.get(ticker) || [])[0];
    const signalLabel = signal?.signalType || signal?.["Filter Label"];
    return `<tr data-open-ticker="${escapeHtml(ticker)}"><td><strong>${escapeHtml(ticker)}</strong></td><td>${valueHtml(stock.sector, null, String, { source: stock.provenance?.source })}</td><td>${signalLabel ? `<span class="signal-chip">${escapeHtml(signalLabel)}</span>` : `<span class="missing-value" title="No signal row is published for this ticker/date.">No signal row</span>`}</td><td class="numeric">${valueHtml(stock.lastPrice, stock._meta?.lastPrice, formatPrice)}</td><td class="numeric ${toneFor(stock.changePercent)}">${valueHtml(stock.changePercent, stock._meta?.changePercent, formatPercent)}</td><td class="numeric">${valueHtml(stock.rvol, stock._meta?.rvol, (value) => formatNumber(value, 2))}</td><td class="numeric">${valueHtml(stock.rsRating, stock._meta?.rsRating, (value) => formatNumber(value, 0))}</td><td><span class="status-badge ${escapeHtml(String(stock.dataStatus || "NO_DATA").toLowerCase())}">${escapeHtml(stock.dataStatus || "NO_DATA")}</span></td><td>${escapeHtml(state.marketDate)}</td><td><span class="row-actions"><button type="button" data-open-ticker="${escapeHtml(ticker)}">Open</button><button type="button" data-remove-watch="${escapeHtml(ticker)}">Remove</button></span></td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function renderTicker() {
  const ticker = state.selectedTicker;
  if (!ticker) {
    els.tickerEmpty.hidden = false;
    els.tickerContent.hidden = true;
    return;
  }
  const stock = state.maps.technical.get(ticker) || {};
  const signals = state.maps.signals.get(ticker) || [];
  els.tickerEmpty.hidden = true;
  els.tickerContent.hidden = false;
  renderTickerHero(stock);
  renderTickerMetrics(stock);
  renderTickerSignals(signals);
  renderLevelMap(stock, signals[0] || {});
  renderTickerSourceStatus(stock);
  renderTechnical(stock);
  renderTickerKsei(ticker);
  renderFundamental(ticker);
  renderNews(ticker);
  renderPriceChart(ticker);
}

function renderTickerHero(stock) {
  const ticker = state.selectedTicker;
  const inWatchlist = watchlist().includes(ticker);
  const sector = validValue(stock.sector) ? stock.sector : "Sector unavailable";
  const industry = validValue(stock.industry) ? ` · ${escapeHtml(stock.industry)}` : "";
  els.tickerHero.innerHTML = `<div class="ticker-identity"><span class="section-kicker">${escapeHtml(sector)}</span><h2>${escapeHtml(ticker)}</h2><p>${escapeHtml(stock.companyName || ticker)}${industry}</p><small>${escapeHtml(state.marketDate)} · archived release · not real-time</small></div><div class="ticker-quote"><strong>${valueHtml(stock.lastPrice, stock._meta?.lastPrice, formatPrice)}</strong><span class="${toneFor(stock.changePercent)}">${valueHtml(stock.changePercent, stock._meta?.changePercent, formatPercent)}</span><div class="ticker-actions"><span class="status-badge ${escapeHtml(String(stock.dataStatus || "NO_DATA").toLowerCase())}">${escapeHtml(stock.dataStatus || "NO_DATA")}</span><button class="secondary-button persistent-watch-action" type="button" data-toggle-watch="${escapeHtml(ticker)}">${inWatchlist ? "Remove from watchlist" : "Add to watchlist"}</button></div></div>`;
  els.tradingViewLink.href = `https://www.tradingview.com/chart/?symbol=IDX%3A${encodeURIComponent(ticker)}`;
}

function concentrationLabel(hhi) {
  const value = asNumber(hhi);
  if (value === null) return "Unavailable";
  if (value < 1500) return "Low concentration";
  if (value < 2500) return "Moderate concentration";
  if (value < 3500) return "High concentration";
  return "Very high concentration";
}

function renderTickerKsei(ticker) {
  const record = (state.kseiData?.records || []).find((item) => item.ticker === ticker);
  if (!record) {
    els.tickerKseiCard.innerHTML = `<div class="empty-state compact-empty"><h3>No KSEI snapshot for this ticker/date.</h3><p>A later ownership snapshot is never inserted into an earlier historical view.</p><button type="button" class="secondary-button" data-go-view="ownership">Open KSEI Ownership</button></div>`;
    return;
  }
  const metrics = [
    ["Free float", kseiPercent(record.freeFloat), "ksei-free-float"],
    ["HHI", `${formatNumber(record.hhi, 0)} · ${concentrationLabel(record.hhi)}`, "ksei-hhi"],
    ["CR1", kseiPercent(record.cr1), "ksei-cr1-cr3"],
    ["CR3", kseiPercent(record.cr3), "ksei-cr1-cr3"],
    ["CCS", `${formatNumber(record.ccs, 0)} · ${record.ccsCategory}`, "ksei-ccs"],
    ["Ownership", record.ownershipType, "ksei-ownership-type"],
  ];
  els.tickerKseiCard.innerHTML = `<div class="ticker-ksei-metrics">${metrics.map(([label, value, concept]) => `<div title="${escapeHtml(shortTooltip(concept))}"><span>${escapeHtml(label)} ${guideLink(concept, "?")}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div><div class="ticker-ksei-actions"><small>Snapshot ${escapeHtml(state.kseiData.asOf)} · point-in-time KSEI workbook</small><span><button type="button" class="text-button" data-ksei-ticker="${escapeHtml(ticker)}">Ownership detail</button><button type="button" class="secondary-button" data-go-view="ownership">Open full KSEI Ownership</button></span></div>`;
}

function renderTickerMetrics(stock) {
  const metrics = [
    ["Last price", stock.lastPrice, stock._meta?.lastPrice, formatPrice, "price-change-percent"],
    ["Daily change", stock.changePercent, stock._meta?.changePercent, formatPercent, "price-change-percent"],
    ["RVOL", stock.rvol, stock._meta?.rvol, (value) => formatNumber(value, 2), "rvol"],
    ["RS rating", stock.rsRating, stock._meta?.rsRating, (value) => formatNumber(value, 0), "rs-rating"],
    ["EMA trend", stock.trend?.internal, null, String, "signal-ema-trend"],
    ["VWAP position", stock.technical?.vwapPosition, stock._meta?.vwap, String, "vwap-default"],
    ["RSI 14", stock.technical?.rsi14, stock._meta?.rsi14, (value) => formatNumber(value, 2), "rsi"],
    ["Signal rows", (state.maps.signals.get(state.selectedTicker) || []).length, null, (value) => formatNumber(value, 0), "signal-rows"],
  ];
  els.tickerKeyMetrics.innerHTML = metrics.map(([label, value, meta, formatter, conceptId]) => `<div class="key-metric" title="${escapeHtml(shortTooltip(conceptId))}"><span>${escapeHtml(label)} ${guideLink(conceptId, "?")}</span><strong>${valueHtml(value, meta, formatter)}</strong></div>`).join("");
}

function renderTickerSignals(signals) {
  if (!signals.length) {
    els.tickerSignals.innerHTML = `<div class="empty-state"><h3>No workbook signal rows for this ticker on ${escapeHtml(state.marketDate)}.</h3><p>The ticker can still be inspected through its available technical and reference fields.</p></div>`;
    return;
  }
  els.tickerSignals.innerHTML = signals.map((row) => `<article class="signal-card"><strong>${escapeHtml(row.signalType || row["Filter Label"] || "Workbook Signal")}</strong><p>${escapeHtml(findValue(row, ["Summary Screener", "Section"]) || "Signal explanation is missing from the workbook.")}</p><small class="source-chip">${escapeHtml(sourceLabel(state.data.screener.provenance?.signals?.source || "workbook"))}</small></article>`).join("");
}

function renderLevelMap(stock, signal) {
  const current = asNumber(stock.lastPrice);
  const points = [
    ["Invalidation", asNumber(findValue(signal, ["Invalidation"])), "red"],
    ["Entry", asNumber(findValue(signal, ["Entry"])), ""],
    ["Current", current, ""],
    ["Target", asNumber(findValue(signal, ["Target"])), ""],
  ].filter(([, value]) => value !== null);
  if (points.length < 2) {
    els.levelMap.innerHTML = `<div class="empty-state"><h3>Workbook levels are incomplete.</h3><p>${DISCLAIMER}</p></div>`;
    return;
  }
  const values = points.map(([, value]) => value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  els.levelMap.innerHTML = `<div class="level-track">${points.map(([label, value, tone]) => `<div class="level-point ${tone} ${label === "Current" ? "stagger" : ""}" style="left:${((value - min) / span) * 100}%"><span>${escapeHtml(label)}</span><i></i><small>${escapeHtml(formatPrice(value))}</small></div>`).join("")}</div><div class="detail-grid">${[
    ["Entry level basis", findValue(signal, ["Entry POI"])],
    ["Target level basis", findValue(signal, ["Target POI"])],
    ["Invalidation basis", findValue(signal, ["Invalidation POI"])],
    ["Target upside", findValue(signal, ["Target Upside %", "Upside %"])],
    ["R/R", findValue(signal, ["R/R"])],
    ["Support", stock.supportLevels?.find(validValue)],
    ["Resistance", stock.resistanceLevels?.find(validValue)],
    ["VWAP", stock.technical?.vwap],
  ].map(([label, value]) => `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${valueHtml(value, null, label.includes("upside") ? formatPercent : label === "R/R" ? (item) => formatNumber(item, 2) : validValue(asNumber(value)) ? formatPrice : String, { source: "workbook" })}</strong></div>`).join("")}</div>`;
}

function renderTickerSourceStatus(stock) {
  const provenance = state.data.technical.provenance || {};
  const referenceDate = state.data.fundamental.isReference || state.data.news.isReference
    ? state.data.fundamental.referenceMarketDate || state.data.news.referenceMarketDate
    : null;
  const reference = referenceDate
    ? ` Fundamentals and news use a clearly labelled latest-reference workbook dated ${referenceDate}; price, technical values, and signals remain capped to ${state.marketDate}.`
    : " Fundamentals and news are from the selected point-in-time workbook.";
  els.tickerSourceStatus.innerHTML = `<strong>Source note.</strong> Price and technical: ${escapeHtml(sourceLabel(provenance.priceTechnical?.source || stock.provenance?.source || "derived"))}. Signals: ${escapeHtml(sourceLabel(provenance.signals?.source || "workbook"))}.${escapeHtml(reference)} TradingView mode is display-only and can differ by source or timestamp.`;
}

function renderTechnical(stock) {
  const moving = stock.movingAverages || {};
  const technical = stock.technical || {};
  const rows = [
    ["Internal trend", stock.trend?.internal, null],
    ["Swing trend", stock.trend?.swing, null],
    ["Internal structure", stock.structure?.internal, null],
    ["Swing structure", stock.structure?.swing, null],
    ["EMA 25", moving.ema25, stock._meta?.ema25],
    ["EMA 50", moving.ema50, stock._meta?.ema50],
    ["SMA 200", moving.sma200, stock._meta?.sma200],
    ["MA position", moving.zone, null],
    ["RSI 14", technical.rsi14, stock._meta?.rsi14],
    ["RSI status", technical.rsiStatus, null],
    ["MACD line", technical.macdLine, stock._meta?.macdLine],
    ["MACD position", technical.macdPosition, null],
    ["VWAP", technical.vwap, stock._meta?.vwap],
    ["VWAP position", technical.vwapPosition, stock._meta?.vwap],
    ["ADR %", technical.adr, null],
    ["ATR %", technical.atr, null],
  ];
  const ids = {
    "EMA 25": "ema", "EMA 50": "ema", "SMA 200": "ma200", "RSI 14": "rsi",
    "MACD line": "macd", "VWAP": "vwap-default", "VWAP position": "vwap-default",
    "ADR %": "adr-percent", "Internal structure": "bos", "Swing structure": "bos",
  };
  els.technicalGrid.innerHTML = rows.map(([label, value, meta]) => {
    const conceptId = ids[label];
    return `<div class="detail-item" ${conceptId ? `title="${escapeHtml(shortTooltip(conceptId))}"` : ""}><span>${escapeHtml(label)}${conceptId ? ` ${guideLink(conceptId, "?")}` : ""}</span><strong>${valueHtml(value, meta, validValue(asNumber(value)) ? (item) => formatNumber(item, 2) : String, { showSource: true, source: meta?.source || "derived" })}</strong></div>`;
  }).join("");
}

function renderFundamental(ticker) {
  const row = state.maps.fundamental.get(ticker) || {};
  const isReference = state.data.fundamental.isReference;
  els.fundamentalModeBadge.hidden = true;
  const metrics = [
    ["Market cap", findValue(row, ["Market Cap"])],
    ["PE ratio TTM", findValue(row, ["Current PE Ratio (TTM)", "P/E Ratio"])],
    ["Price to book", findValue(row, ["Current Price to Book Value", "Current PBV", "P/B Ratio"])],
    ["Price to sales", findValue(row, ["Current Price to Sales (TTM)"])],
    ["Return on equity", findValue(row, ["Return on Equity (TTM)", "ROE"])],
    ["Current ratio", findValue(row, ["Current Ratio (Quarter)"])],
    ["Debt to equity", findValue(row, ["Debt to Equity Ratio (Quarter)", "Debt to Equity"])],
    ["Free cash flow TTM", findValue(row, ["Free cash flow (TTM)", "Free Cash Flow"])],
    ["Revenue TTM", findValue(row, ["Revenue (TTM)"])],
    ["Net income TTM", findValue(row, ["Net Income (TTM)"])],
    ["PBV regime", findValue(row, ["PBV Regime"])],
    ["Industry", findValue(row, ["Industry"])],
  ];
  const source = isReference ? "workbook" : "workbook";
  const reason = state.data.fundamental.referenceLoadStatus === "failed" ? "source_unavailable" : "field_not_found";
  els.fundamentalGrid.innerHTML = metrics.map(([label, value]) => `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${valueHtml(value, null, validValue(asNumber(value)) ? (item) => formatNumber(item, 2) : String, { showSource: true, source, reason })}</strong></div>`).join("");
}

function renderNews(ticker) {
  const rows = state.maps.news.get(ticker) || [];
  const isReference = state.data.news.isReference;
  els.newsModeBadge.hidden = true;
  const useful = rows.filter((row) => Object.values(row).some(validValue));
  if (!useful.length) {
    els.newsPanel.innerHTML = `<div class="empty-state"><h3>Published news data is unavailable.</h3><p><span class="missing-value" title="Status: missing | Reason: source_unavailable | Source: workbook | As of: ${escapeHtml(state.data.news.referenceMarketDate || state.marketDate)}">— workbook · source unavailable</span></p></div>`;
    return;
  }
  els.newsPanel.innerHTML = useful.slice(0, 8).map((row) => {
    const title = findValue(row, ["Latest News Title", "Headline", "Title", "Sentiment News"]) || "Published workbook event";
    const detail = findValue(row, ["Summary", "Description", "Corp. Action"]) || "No additional workbook description.";
    const url = findValue(row, ["URL", "News URL", "Link"]);
    return `<article class="news-item"><strong>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>` : escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p><small class="source-chip">Workbook</small></article>`;
  }).join("");
}

const GUIDE_GLOSSARY = {
  VWAP: "Volume Weighted Average Price",
  EMA: "Exponential Moving Average",
  SMA: "Simple Moving Average",
  RSI: "Relative Strength Index",
  MACD: "Moving Average Convergence Divergence",
  RVOL: "Relative Volume",
  ADR: "Average Daily Range",
  RS: "Relative Strength rating",
  BOS: "Break of Structure",
  CHoCH: "Change of Character",
  POI: "Point of Interest, shown as a workbook level basis",
  "EQH/EQL": "Equal High / Equal Low",
  FVG: "Fair Value Gap",
  OB: "OHLCV pivot-derived order-block box",
  "R/R": "Risk / Reward distance ratio",
  TTM: "Trailing Twelve Months",
  YoY: "Year over Year",
  PBV: "Price to Book Value",
  PER: "Price Earnings Ratio",
  EV: "Enterprise Value",
  EBIT: "Earnings Before Interest and Tax",
  EBITDA: "Earnings Before Interest, Tax, Depreciation and Amortisation",
  CFO: "Cash Flow from Operations",
  FCF: "Free Cash Flow",
};

function filteredGuideRecords() {
  const query = state.guideSearch.trim().toLowerCase();
  return state.logicReference.records.filter((item) => {
    if (state.guideCategory !== "ALL" && item.category !== state.guideCategory) return false;
    if (!query) return true;
    return [
      item.id, item.category, item.displayName, item.shortDefinition,
      item.plainEnglishExplanation, item.formulaPlainEnglish,
      item.formulaTechnical, item.source, ...(item.inputs || []),
      ...(item.outputColumns || []), ...(item.relatedConcepts || []),
    ].join(" ").toLowerCase().includes(query);
  });
}

function renderGuide() {
  const records = filteredGuideRecords();
  const categories = [...new Set(state.logicReference.records.map((item) => item.category))];
  els.guideCount.textContent = `${records.length} of ${state.logicReference.records.length} concepts`;
  els.guideCategories.innerHTML = [
    `<button type="button" data-guide-category="ALL" class="${state.guideCategory === "ALL" ? "active" : ""}">All concepts <span>${state.logicReference.records.length}</span></button>`,
    ...categories.map((category) => {
      const count = state.logicReference.records.filter((item) => item.category === category).length;
      return `<button type="button" data-guide-category="${escapeHtml(category)}" class="${state.guideCategory === category ? "active" : ""}">${escapeHtml(category)} <span>${count}</span></button>`;
    }),
  ].join("");
  els.guideGlossary.innerHTML = `<span class="panel-kicker">GLOSSARY</span><h3>Common abbreviations</h3><div>${Object.entries(GUIDE_GLOSSARY).map(([term, definition]) => `<span title="${escapeHtml(definition)}"><strong>${escapeHtml(term)}</strong> ${escapeHtml(definition)}</span>`).join("")}</div>`;
  els.guideResults.innerHTML = records.map((item) => `<details id="guide-${escapeHtml(item.id)}" class="guide-card panel">
    <summary>
      <span><small>${escapeHtml(item.category)}</small><strong>${escapeHtml(item.displayName)}</strong><em>${escapeHtml(item.shortDefinition)}</em></span>
      <span class="source-chip">${escapeHtml(sourceLabel(item.source))}</span>
    </summary>
    <div class="guide-detail">
      <section><h4>Plain-English explanation</h4><p>${escapeHtml(item.plainEnglishExplanation)}</p></section>
      <section><h4>Why it matters</h4><p>${escapeHtml(item.whyItMatters)}</p></section>
      <section class="formula-block"><h4>How it is calculated</h4><p>${escapeHtml(item.formulaPlainEnglish)}</p><code>${escapeHtml(item.formulaTechnical)}</code></section>
      <section><h4>How to read it</h4><p>${escapeHtml(item.interpretation)}</p><p><strong>Rule:</strong> ${escapeHtml(item.thresholds)}</p></section>
      <section><h4>Source & inputs</h4><p><strong>Source:</strong> ${escapeHtml(item.source)}</p><p><strong>Priority:</strong> ${escapeHtml((item.sourcePriority || []).join(" → "))}</p><p><strong>Inputs:</strong> ${escapeHtml((item.inputs || []).join(", ") || "No calculated inputs")}</p></section>
      <section><h4>Missing data</h4><p>${escapeHtml(item.missingDataRules)}</p></section>
      <section><h4>Limitations</h4><p>${escapeHtml(item.limitations)}</p></section>
      <section><h4>Example</h4><p>${escapeHtml(item.example)}</p></section>
      <footer><span>Formula version · ${escapeHtml(item.formulaVersion)}</span><span>Reviewed · ${escapeHtml(item.lastReviewed)}</span></footer>
    </div>
  </details>`).join("");
  els.guideEmpty.hidden = records.length > 0;
}

function openGuideConcept(id) {
  state.guideSearch = "";
  state.guideCategory = "ALL";
  els.guideSearch.value = "";
  showView("guide");
  renderGuide();
  const target = document.getElementById(`guide-${id}`);
  if (!target) return;
  target.open = true;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function loadIndicatorSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(INDICATOR_SETTINGS_KEY) || "{}");
  } catch {
    saved = {};
  }
  if ((saved.schemaVersion || 0) < 3 && saved.smc) {
    saved.smc.showInternals = false;
    saved.smc.showOrderBlocks = false;
    saved.smc.showEqualHighLow = false;
  }
  state.indicatorSettings = IDXIndicators.deepMerge(IDXIndicators.DEFAULTS, saved);
  state.indicatorSettings.schemaVersion = IDXIndicators.DEFAULTS.schemaVersion;
  state.chartMode = state.indicatorSettings.chart.mode || "research";
  state.chartInterval = state.indicatorSettings.chart.interval || "1D";
  state.chartRange = state.indicatorSettings.chart.range || "1Y";
}

function saveIndicatorSettings() {
  localStorage.setItem(INDICATOR_SETTINGS_KEY, JSON.stringify(state.indicatorSettings));
  els.settingsSavedState.textContent = "Saved globally for every ticker and market date.";
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
  els.indicatorSettingsForm.querySelectorAll("[name]").forEach((input) => {
    const value = objectPathValue(state.indicatorSettings, input.name);
    if (input.type === "checkbox") input.checked = Boolean(value);
    else input.value = value;
  });
}

function updateActiveIndicatorStrip() {
  const settings = state.indicatorSettings;
  const labels = [];
  if (settings.ema25.show) labels.push(`EMA ${settings.ema25.period}`);
  if (settings.ema50.show) labels.push(`EMA ${settings.ema50.period}`);
  if (settings.sma200.show) labels.push(`MA ${settings.sma200.period}`);
  if (settings.vwap.show) labels.push(`${settings.vwap.anchor} VWAP`);
  if (settings.volume.show) labels.push(settings.volume.maShow ? `VOL + MA ${settings.volume.period}` : "VOL");
  if (settings.rsi.show) labels.push(`RSI ${settings.rsi.length}`);
  if (settings.macd.show) labels.push(`MACD 4C ${settings.macd.fastLength}/${settings.macd.slowLength}/${settings.macd.signalLength}`);
  if (settings.initialBalance.show) labels.push(`IB ${settings.initialBalance.initialBalanceDays}D`);
  if (settings.anchorVwap.show) labels.push("Q/PQ/PY VWAP");
  if (settings.smc.show) labels.push("SMC-style OHLCV overlay");
  els.activeIndicatorStrip.innerHTML = labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("");
}

function drawingKey(ticker = state.selectedTicker) {
  return `${DRAWINGS_KEY_PREFIX}${ticker}`;
}

function savedDrawings(ticker = state.selectedTicker) {
  if (!ticker) return [];
  try {
    const value = JSON.parse(localStorage.getItem(drawingKey(ticker)) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveDrawings(drawings, ticker = state.selectedTicker) {
  if (!ticker) return;
  localStorage.setItem(drawingKey(ticker), JSON.stringify(drawings));
}

function chartTimeText(time) {
  if (typeof time === "string") return time;
  if (time && typeof time === "object" && "year" in time) {
    return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
  }
  return null;
}

function drawingPointFromEvent(event) {
  if (!state.chart || !state.chartCandles) return null;
  const time = chartTimeText(state.chart.timeScale().coordinateToTime(event.offsetX));
  const price = state.chartCandles.coordinateToPrice(event.offsetY);
  if (!time || !Number.isFinite(price)) return null;
  return { time, price };
}

function renderSavedDrawings() {
  if (!state.chart || !state.chartCandles || !els.chartDrawingLayer) return;
  const drawings = savedDrawings();
  const parts = [];
  const point = (item) => ({
    x: state.chart.timeScale().timeToCoordinate(item.time),
    y: state.chartCandles.priceToCoordinate(item.price),
  });
  drawings.forEach((drawing) => {
    const points = (drawing.points || []).map(point);
    if (points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) return;
    const [a, b] = points;
    if (drawing.type === "trendline" && b) {
      parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="drawing-line" />`);
    } else if (drawing.type === "rectangle" && b) {
      parts.push(`<rect x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}" width="${Math.abs(b.x - a.x)}" height="${Math.abs(b.y - a.y)}" class="drawing-rectangle" />`);
    } else if (drawing.type === "fibonacci" && b) {
      [0, 0.236, 0.382, 0.5, 0.618, 1].forEach((ratio) => {
        const y = a.y + ((b.y - a.y) * ratio);
        parts.push(`<line x1="${Math.min(a.x, b.x)}" y1="${y}" x2="${Math.max(a.x, b.x)}" y2="${y}" class="drawing-fib" /><text x="${Math.max(a.x, b.x) + 4}" y="${y - 3}" class="drawing-label">${ratio}</text>`);
      });
    } else if (drawing.type === "annotation") {
      parts.push(`<circle cx="${a.x}" cy="${a.y}" r="3" class="drawing-anchor" /><text x="${a.x + 7}" y="${a.y - 7}" class="drawing-label">${escapeHtml(drawing.text || "Note")}</text>`);
    }
  });
  els.chartDrawingLayer.innerHTML = parts.join("");
}

function handleDrawingClick(event) {
  const tool = state.activeDrawingTool;
  if (!tool || tool === "crosshair") return;
  const selected = drawingPointFromEvent(event);
  if (!selected) return;
  if (tool === "annotation") {
    const text = window.prompt("Annotation text");
    if (!text?.trim()) return;
    saveDrawings([...savedDrawings(), { type: tool, points: [selected], text: text.trim() }]);
    renderSavedDrawings();
    return;
  }
  if (!state.drawingDraft || state.drawingDraft.type !== tool) {
    state.drawingDraft = { type: tool, points: [selected] };
    els.historyMeta.textContent = `${tool} start selected. Choose the second chart point.`;
    return;
  }
  const drawing = { ...state.drawingDraft, points: [...state.drawingDraft.points, selected] };
  state.drawingDraft = null;
  saveDrawings([...savedDrawings(), drawing]);
  renderSavedDrawings();
  els.historyMeta.textContent = `${tool} saved locally for ${state.selectedTicker}.`;
}

function destroyChart() {
  state.chartResizeObserver?.disconnect();
  state.chartResizeObserver = null;
  state.chart?.remove();
  state.chart = null;
  state.chartCandles = null;
  state.chartRows = [];
  if (els.priceChart) els.priceChart.innerHTML = "";
  if (els.chartOverlayLayer) els.chartOverlayLayer.innerHTML = "";
  if (els.chartDrawingLayer) els.chartDrawingLayer.innerHTML = "";
}

function chartColors() {
  const light = document.documentElement.dataset.theme === "light";
  return {
    background: light ? "#ffffff" : "#05070a",
    text: light ? "#52647a" : "#98a8bd",
    grid: light ? "rgba(71,85,105,.12)" : "rgba(148,163,184,.10)",
  };
}

async function renderPriceChart(ticker) {
  els.chartTickerSearch.value = ticker;
  if (state.chartMode === "tradingview") {
    renderTradingViewWidget(ticker);
    return;
  }
  const marketDate = state.marketDate;
  const cacheKey = `${marketDate}:${ticker}`;
  els.historyStatus.className = "status-badge info";
  els.historyStatus.textContent = "Loading";
  try {
    let payload = state.ohlcvCache.get(cacheKey);
    if (!payload) {
      payload = await fetchJson(`${state.entry.ohlcv}/${ticker}.json`);
      state.ohlcvCache.set(cacheKey, payload);
    }
    if (state.selectedTicker !== ticker || state.marketDate !== marketDate) return;
    state.chartPayload = payload;
    const source = payload.source || payload.provenance?.source || "yfinance";
    const rows = (payload.rows || [])
      .filter((row) => row.date <= marketDate)
      .map((row) => ({
        date: row.date,
        open: asNumber(row.open),
        high: asNumber(row.high),
        low: asNumber(row.low),
        close: asNumber(row.close),
        volume: asNumber(row.volume),
        source: row.source || source,
      }))
      .filter((row) => row.date && [row.open, row.high, row.low, row.close].every((value) => value !== null));
    renderInteractiveChart(ticker, IDXIndicatorEngine.aggregate(rows, state.chartInterval), source);
  } catch (error) {
    renderChartEmpty(ticker, `History load failed: ${error.message}`);
  }
}

function renderChartEmpty(ticker, detail) {
  destroyChart();
  els.historyStatus.className = "status-badge warning";
  els.historyStatus.textContent = "Missing history";
  els.historyMeta.textContent = detail;
  els.chartLegend.innerHTML = `<strong>${escapeHtml(ticker)} · OHLCV unavailable</strong>`;
  els.priceChart.innerHTML = `<div class="chart-empty"><h3>Not enough price history available</h3><p>This ticker needs at least two published OHLCV records to render a candlestick chart. Upload more historical workbook runs or connect an approved historical OHLCV source.</p><div><button class="secondary-button" type="button" data-reload-chart>Reload data</button> <button class="secondary-button" type="button" data-go-view="screener">Change ticker</button></div></div>`;
}

function rangeStart(rows) {
  if (state.chartRange === "ALL") return 0;
  const start = new Date(`${rows.at(-1).date}T00:00:00Z`);
  if (state.chartRange === "YTD") start.setUTCMonth(0, 1);
  else start.setUTCMonth(start.getUTCMonth() - ({ "3M": 3, "6M": 6, "1Y": 12 }[state.chartRange] || 12));
  const index = rows.findIndex((row) => row.date >= start.toISOString().slice(0, 10));
  return index < 0 ? 0 : index;
}

function renderStructureOverlays(chart, candles, smcResult, hiddenLabels = 0) {
  if (!smcResult) {
    els.chartOverlayLayer.innerHTML = "";
    return;
  }
  requestAnimationFrame(() => {
    els.chartOverlayLayer.innerHTML = "";
    const settings = state.indicatorSettings.smc;
    const addBox = ({ top, bottom, start, end, label, className, fullWidth = false }) => {
      const topCoordinate = candles.priceToCoordinate(top);
      const bottomCoordinate = candles.priceToCoordinate(bottom);
      if (!Number.isFinite(topCoordinate) || !Number.isFinite(bottomCoordinate)) return;
      const element = document.createElement("div");
      element.className = `technical-zone ${className}`;
      element.style.top = `${Math.min(topCoordinate, bottomCoordinate)}px`;
      element.style.height = `${Math.max(2, Math.abs(bottomCoordinate - topCoordinate))}px`;
      element.style.opacity = String(settings.opacity);
      if (!fullWidth) {
        const left = chart.timeScale().timeToCoordinate(start);
        const right = chart.timeScale().timeToCoordinate(end || state.chartRows.at(-1)?.date);
        if (!Number.isFinite(left) || !Number.isFinite(right)) return;
        element.style.left = `${Math.min(left, right)}px`;
        element.style.width = `${Math.max(8, Math.abs(right - left))}px`;
        element.style.right = "auto";
      }
      element.innerHTML = `<span>${escapeHtml(label)}</span>`;
      els.chartOverlayLayer.append(element);
    };
    if (settings.showZones && smcResult.zones) {
      [
        ["premium", "zone-premium"],
        ["equilibrium", "zone-equilibrium"],
        ["discount", "zone-discount"],
      ].forEach(([key, className]) => addBox({ ...smcResult.zones[key], className, fullWidth: true }));
    }
    if (settings.showOrderBlocks) smcResult.orderBlocks.forEach((box) => addBox({
      ...box,
      end: state.chartRows.at(-1)?.date,
      label: box.bias > 0 ? "↑ OB" : "↓ OB",
      className: box.bias > 0 ? "zone-ob-bullish" : "zone-ob-bearish",
    }));
    if (settings.showFairValueGaps) smcResult.fvg.slice(-12).forEach((box) => addBox({
      ...box,
      start: box.time,
      end: state.chartRows.at(-1)?.date,
      label: "FVG",
      className: box.bias > 0 ? "zone-fvg-bullish" : "zone-fvg-bearish",
    }));
    if (hiddenLabels > 0) {
      const badge = document.createElement("span");
      badge.className = "overlay-density-badge";
      badge.textContent = `${hiddenLabels} older structure labels hidden`;
      els.chartOverlayLayer.append(badge);
    }
  });
}

function renderInteractiveChart(ticker, rows, source = "yfinance") {
  destroyChart();
  if (rows.length < 2 || typeof LightweightCharts === "undefined") {
    renderChartEmpty(ticker, rows.length < 2 ? `${rows.length} published OHLCV record` : "Chart library unavailable");
    return;
  }
  const colors = chartColors();
  const settings = state.indicatorSettings;
  state.chartRows = rows;
  const chart = LightweightCharts.createChart(els.priceChart, {
    autoSize: true,
    layout: { background: { color: colors.background }, textColor: colors.text, panes: { separatorColor: colors.grid } },
    grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
    rightPriceScale: { borderColor: colors.grid, scaleMargins: { top: 0.08, bottom: 0.18 } },
    timeScale: { borderColor: colors.grid, timeVisible: false, rightOffset: 8 },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    handleScroll: true,
    handleScale: true,
  });
  state.chart = chart;
  const candles = chart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: "#3b82f6",
    downColor: "#ef4444",
    borderUpColor: "#3b82f6",
    borderDownColor: "#ef4444",
    wickUpColor: "#60a5fa",
    wickDownColor: "#f87171",
    priceLineVisible: true,
    lastValueVisible: true,
  });
  state.chartCandles = candles;
  candles.setData(rows.map((row) => ({ time: row.date, open: row.open, high: row.high, low: row.low, close: row.close })));

  const addLine = (data, color, title, pane = 0, priceScaleId = "right", width = 1) => {
    if (!data.length) return null;
    const series = chart.addSeries(LightweightCharts.LineSeries, {
      color,
      lineWidth: width,
      title,
      priceScaleId,
      priceLineVisible: false,
      lastValueVisible: true,
    }, pane);
    series.setData(data);
    return series;
  };

  if (settings.ema25.show) addLine(IDXIndicators.movingAverage(rows, settings.ema25.period), settings.ema25.color, `EMA ${settings.ema25.period}`, 0, "right", settings.ema25.width);
  if (settings.ema50.show) addLine(IDXIndicators.movingAverage(rows, settings.ema50.period), settings.ema50.color, `EMA ${settings.ema50.period}`, 0, "right", settings.ema50.width);
  if (settings.sma200.show) addLine(IDXIndicators.movingAverage(rows, settings.sma200.period, "sma"), settings.sma200.color, `MA ${settings.sma200.period}`, 0, "right", settings.sma200.width);
  if (settings.vwap.show) {
    const result = IDXIndicatorEngine.vwap(rows, settings.vwap);
    addLine(result.vwap, settings.vwap.color, `${settings.vwap.anchor} VWAP`, 0, "right", settings.vwap.width);
    result.bands.forEach((band, index) => {
      if (!settings.vwap[`showBand${index + 1}`]) return;
      addLine(band.upper, "rgba(34,211,238,.48)", `VWAP +${index + 1}`);
      addLine(band.lower, "rgba(34,211,238,.48)", `VWAP -${index + 1}`);
    });
  }
  if (settings.initialBalance.show) {
    const balance = IDXIndicatorEngine.initialBalance(rows, settings.initialBalance);
    addLine(balance.high, settings.initialBalance.color, "IBH", 0, "right", settings.initialBalance.width);
    addLine(balance.low, settings.initialBalance.color, "IBL", 0, "right", settings.initialBalance.width);
  }
  if (settings.anchorVwap.show) {
    const anchorLevels = IDXIndicatorEngine.anchoredLevels(rows);
    [
      ...(settings.anchorVwap.showCurrentQ && anchorLevels.currentQ ? [anchorLevels.currentQ] : []),
      ...(settings.anchorVwap.showNearest ? anchorLevels.nearest : []),
    ].forEach(({ label, value }) => candles.createPriceLine({
      price: value,
      color: settings.anchorVwap.color,
      lineWidth: settings.anchorVwap.width,
      lineStyle: LightweightCharts.LineStyle.Dotted,
      axisLabelVisible: true,
      title: label,
    }));
  }

  let pane = 1;
  if (settings.volume.show) {
    const volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      title: "Volume",
      priceLineVisible: false,
      lastValueVisible: false,
    }, pane);
    volumeSeries.setData(rows.map((row) => ({
      time: row.date,
      value: row.volume || 0,
      color: row.close >= row.open ? `rgba(41,98,255,${settings.volume.opacity})` : `rgba(239,68,68,${settings.volume.opacity})`,
    })));
    if (settings.volume.maShow) addLine(IDXIndicators.movingAverage(rows, settings.volume.period, "sma", "volume"), settings.volume.maColor, `Vol MA ${settings.volume.period}`, pane, "volume", 2);
    pane += 1;
  }
  if (settings.rsi.show) {
    const result = IDXIndicatorEngine.rsi(rows, settings.rsi);
    const rsiSeries = addLine(result.values, settings.rsi.color, `RSI ${settings.rsi.length}`, pane, "rsi", settings.rsi.width);
    addLine(result.smooth, "#ff5050", "RSI smoothing", pane, "rsi");
    if (rsiSeries) {
      [70, 50, 30].forEach((price) => rsiSeries.createPriceLine({
        price,
        color: price === 70 ? "rgba(59,130,246,.55)" : price === 30 ? "rgba(239,68,68,.55)" : "rgba(148,163,184,.28)",
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
      }));
    }
    pane += 1;
  }
  if (settings.macd.show) {
    const result = IDXIndicatorEngine.macd4c(rows, settings.macd);
    const histogram = chart.addSeries(LightweightCharts.HistogramSeries, {
      priceScaleId: "macd",
      title: "MACD histogram",
      priceLineVisible: false,
      lastValueVisible: false,
    }, pane);
    histogram.setData(result.histogram);
    addLine(result.line, settings.macd.lineColor, "MACD", pane, "macd", 2);
    addLine(result.signal, settings.macd.signalColor, "Signal", pane, "macd", 2);
  }
  const smcResult = settings.smc.show ? IDXIndicatorEngine.smc(rows, settings.smc) : null;
  state.smcHiddenLabels = 0;
  if (smcResult && LightweightCharts.createSeriesMarkers) {
    const markers = [];
    smcResult.events.forEach((event) => {
      if (event.scope === "internal" && !settings.smc.showInternals) return;
      if (event.scope === "swing" && !settings.smc.showStructure) return;
      markers.push({
        time: event.time,
        position: event.bias > 0 ? "belowBar" : "aboveBar",
        color: event.bias > 0 ? "#2962ff" : "#ff5050",
        shape: event.bias > 0 ? "arrowUp" : "arrowDown",
        text: settings.smc.showLabels ? event.type : "",
      });
    });
    if (settings.smc.showEqualHighLow) smcResult.equalLevels.forEach((event) => markers.push({
      time: event.time,
      position: event.type === "EQH" ? "aboveBar" : "belowBar",
      color: event.type === "EQH" ? "#2962ff" : "#ff5050",
      shape: "circle",
      text: event.type,
    }));
    Object.values(smcResult.extremes || {}).filter(Boolean).forEach((event) => markers.push({
      time: event.time,
      position: event.label.includes("High") ? "aboveBar" : "belowBar",
      color: event.label.includes("Weak") ? "#ff5050" : "#2962ff",
      shape: "circle",
      text: settings.smc.showLabels ? event.label : "",
    }));
    markers.sort((a, b) => a.time.localeCompare(b.time));
    const markerLimit = 15;
    const visibleMarkers = markers.slice(-markerLimit);
    state.smcHiddenLabels = Math.max(0, markers.length - visibleMarkers.length);
    LightweightCharts.createSeriesMarkers(candles, visibleMarkers);
  }

  const stock = state.maps.technical.get(ticker) || {};
  const signal = (state.maps.signals.get(ticker) || [])[0] || {};
  [
    ["Entry", asNumber(findValue(signal, ["Entry"])), "#3b82f6"],
    ["Target", asNumber(findValue(signal, ["Target"])), "#60a5fa"],
    ["Invalidation", asNumber(findValue(signal, ["Invalidation"])), "#ef4444"],
    ["Support", asNumber(stock.supportLevels?.find(validValue)), "#64748b"],
    ["Resistance", asNumber(stock.resistanceLevels?.find(validValue)), "#94a3b8"],
  ].filter(([, price]) => price !== null).forEach(([title, price, color]) => candles.createPriceLine({
    price,
    color,
    lineWidth: title === "Invalidation" ? 2 : 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    axisLabelVisible: true,
    title,
  }));

  const byDate = new Map(rows.map((row, index) => [row.date, { row, index }]));
  const updateLegend = (row, index) => {
    const previous = index ? rows[index - 1].close : null;
    const change = previous ? ((row.close / previous) - 1) * 100 : 0;
    els.chartLegend.innerHTML = `<strong>${escapeHtml(ticker)} · ${escapeHtml(row.date)}</strong><span>O ${formatPrice(row.open)}</span><span>H ${formatPrice(row.high)}</span><span>L ${formatPrice(row.low)}</span><span>C ${formatPrice(row.close)}</span><span class="${change >= 0 ? "positive" : "negative"}">${change >= 0 ? "+" : ""}${change.toFixed(2)}%</span><span>Vol ${formatNumber(row.volume, 0) || "—"}</span>`;
  };
  updateLegend(rows.at(-1), rows.length - 1);
  chart.subscribeCrosshairMove((param) => {
    if (!param.time) return updateLegend(rows.at(-1), rows.length - 1);
    const key = typeof param.time === "string"
      ? param.time
      : `${param.time.year}-${String(param.time.month).padStart(2, "0")}-${String(param.time.day).padStart(2, "0")}`;
    const point = byDate.get(key);
    if (point) updateLegend(point.row, point.index);
  });
  chart.timeScale().setVisibleRange({
    from: rows[rangeStart(rows)].date,
    to: rows.at(-1).date,
  });
  state.chartResizeObserver = new ResizeObserver(() => {
    chart.timeScale().applyOptions({});
    renderSavedDrawings();
  });
  state.chartResizeObserver.observe(els.priceChart);
  const partial = rows.length < 60;
  els.historyStatus.className = `status-badge ${partial ? "warning" : "ok"}`;
  els.historyStatus.textContent = partial ? "Partial price history" : "History loaded";
  els.historyMeta.textContent = `${formatNumber(rows.length, 0)} ${state.chartInterval} bars · ${rows[0].date} to ${rows.at(-1).date} · ${sourceLabel(source)} · formula chart-v4`;
  els.chartSourceBadge.textContent = "Website Calculated";
  els.chartSourceBadge.className = "status-badge ok";
  renderStructureOverlays(chart, candles, smcResult, state.smcHiddenLabels || 0);
  renderSavedDrawings();
  chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
    renderStructureOverlays(chart, candles, smcResult, state.smcHiddenLabels || 0);
    renderSavedDrawings();
  });
  updateActiveIndicatorStrip();
}

function renderTradingViewWidget(ticker) {
  destroyChart();
  const symbol = `IDX:${ticker}`;
  state.tradingViewSymbol = symbol;
  els.chartSourceBadge.textContent = "TradingView Display";
  els.chartSourceBadge.className = "status-badge info";
  els.historyStatus.textContent = "External display";
  els.historyStatus.className = "status-badge info";
  els.historyMeta.textContent = `${symbol} · TradingView-managed data and toolbar`;
  els.tradingViewWidget.innerHTML = "";
  const container = document.createElement("div");
  container.className = "tradingview-widget-container__widget";
  els.tradingViewWidget.append(container);
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  script.async = true;
  script.textContent = JSON.stringify({
    autosize: true,
    symbol,
    interval: state.chartInterval === "1D" ? "D" : state.chartInterval === "1W" ? "W" : "M",
    timezone: "Asia/Jakarta",
    theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
    style: "1",
    locale: "en",
    hide_top_toolbar: false,
    hide_side_toolbar: false,
    hide_legend: false,
    hide_volume: false,
    allow_symbol_change: true,
    save_image: true,
    support_host: "https://www.tradingview.com",
  });
  els.tradingViewWidget.append(script);
}

function setChartMode(mode) {
  state.chartMode = mode === "tradingview" ? "tradingview" : "research";
  state.indicatorSettings.chart.mode = state.chartMode;
  saveIndicatorSettings();
  document.querySelectorAll("[data-chart-mode]").forEach((button) => button.classList.toggle("active", button.dataset.chartMode === state.chartMode));
  els.researchChartView.hidden = state.chartMode !== "research";
  els.tradingViewChartView.hidden = state.chartMode !== "tradingview";
  els.researchChartView.classList.toggle("active", state.chartMode === "research");
  els.tradingViewChartView.classList.toggle("active", state.chartMode === "tradingview");
  if (state.selectedTicker) renderPriceChart(state.selectedTicker);
}

function kseiPercent(value) {
  const parsed = asNumber(value);
  return parsed === null ? "—" : `${parsed.toFixed(2)}%`;
}

function kseiMetric(label, value, detail) {
  return `<article class="ownership-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></article>`;
}

function filteredKseiRecords() {
  const filters = state.kseiFilters;
  const needle = filters.search.trim().toLowerCase();
  let records = [...(state.kseiData?.records || [])].filter((item) => {
    if (filters.sector !== "ALL" && item.sector !== filters.sector) return false;
    if (filters.type !== "ALL" && item.ownershipType !== filters.type) return false;
    if (!needle) return true;
    return [
      item.ticker, item.companyName, item.sector, item.industry,
      ...item.investors.flatMap((holder) => [holder.name, holder.type]),
    ].some((value) => String(value || "").toLowerCase().includes(needle));
  });
  const sorters = {
    hhi: (a, b) => (asNumber(b.hhi) || -Infinity) - (asNumber(a.hhi) || -Infinity),
    freeFloat: (a, b) => (asNumber(b.freeFloat) || -Infinity) - (asNumber(a.freeFloat) || -Infinity),
    cr1: (a, b) => (asNumber(b.cr1) || -Infinity) - (asNumber(a.cr1) || -Infinity),
    ticker: (a, b) => a.ticker.localeCompare(b.ticker),
  };
  return records.sort(sorters[filters.sort] || sorters.hhi);
}

function renderKseiOwnership() {
  const payload = state.kseiData;
  els.kseiUnavailable.hidden = Boolean(payload);
  els.kseiContent.hidden = !payload;
  els.kseiUpdateButton.disabled = !payload;
  if (!payload) {
    els.kseiAsOfBadge.textContent = `No snapshot on or before ${state.marketDate}`;
    return;
  }
  const stats = payload.summary;
  els.kseiAsOfBadge.textContent = `KSEI as of ${payload.asOf}`;
  els.kseiSourceNote.textContent = `Point-in-time snapshot ${payload.asOf}. Selected market date ${state.marketDate}. Concentration describes the published ownership register, not transaction flow.`;
  els.kseiMetricGrid.innerHTML = [
    kseiMetric("Listed issuers", formatNumber(stats.totalIssuers, 0) || "0", `${formatNumber(stats.okIssuers, 0) || 0} complete records`),
    kseiMetric("Average free float", kseiPercent(stats.averageFreeFloat), "Across records with a published value"),
    kseiMetric("Average HHI", formatNumber(stats.averageHHI, 0) || "—", "Higher values indicate greater concentration"),
    kseiMetric("High concentration", formatNumber(stats.highConcentrationIssuers, 0) || "0", "HHI at or above 2,500"),
  ].join("");

  const ownershipEntries = Object.entries(stats.ownershipTypes || {});
  const ownershipMax = Math.max(1, ...ownershipEntries.map(([, value]) => value));
  els.kseiOwnershipTypes.innerHTML = ownershipEntries.map(([label, value]) => `
    <div class="ownership-bar-row">
      <span><strong>${escapeHtml(label)}</strong><b>${formatNumber(value, 0)}</b></span>
      <i><u style="--width:${(value / ownershipMax) * 100}%"></u></i>
    </div>`).join("");

  const ccsEntries = Object.entries(stats.ccsCategories || {});
  const total = Math.max(1, ccsEntries.reduce((sum, [, value]) => sum + value, 0));
  let offset = 0;
  const colors = ["#16884a", "#d2a236", "#c95656", "#758276"];
  const stops = ccsEntries.map(([, value], index) => {
    const start = offset;
    offset += (value / total) * 100;
    return `${colors[index % colors.length]} ${start}% ${offset}%`;
  }).join(", ");
  els.kseiCcsDonut.innerHTML = `
    <div class="ownership-donut" style="--segments:conic-gradient(${stops})"><strong>${formatNumber(total, 0)}</strong><span>issuers</span></div>
    <div class="ownership-donut-legend">${ccsEntries.map(([label, value], index) => `<span><i style="--dot:${colors[index % colors.length]}"></i>${escapeHtml(label)} <b>${formatNumber(value, 0)}</b></span>`).join("")}</div>`;

  const sectors = new Map();
  payload.records.forEach((item) => {
    const sector = item.sector || "Unclassified";
    if (!sectors.has(sector)) sectors.set(sector, []);
    if (asNumber(item.hhi) !== null) sectors.get(sector).push(asNumber(item.hhi));
  });
  const sectorRows = [...sectors.entries()].map(([sector, values]) => ({
    sector,
    value: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length),
    count: values.length,
  })).sort((a, b) => b.value - a.value);
  const sectorMax = Math.max(1, ...sectorRows.map((item) => item.value));
  els.kseiSectorConcentration.innerHTML = sectorRows.map((item) => `
    <button type="button" data-ksei-sector="${escapeHtml(item.sector)}">
      <span><strong>${escapeHtml(item.sector)}</strong><small>${item.count} issuers</small></span>
      <i><u style="--width:${(item.value / sectorMax) * 100}%"></u></i>
      <b>${formatNumber(item.value, 0)}</b>
    </button>`).join("");

  const sectorsList = [...new Set(payload.records.map((item) => item.sector || "Unclassified"))].sort();
  const types = [...new Set(payload.records.map((item) => item.ownershipType || "Unclassified"))].sort();
  els.kseiSectorFilter.innerHTML = `<option value="ALL">All sectors</option>${sectorsList.map((item) => `<option ${item === state.kseiFilters.sector ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}`;
  els.kseiTypeFilter.innerHTML = `<option value="ALL">All types</option>${types.map((item) => `<option ${item === state.kseiFilters.type ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}`;
  const records = filteredKseiRecords();
  els.kseiResultCount.textContent = `${formatNumber(records.length, 0)} of ${formatNumber(payload.records.length, 0)}`;
  els.kseiTableBody.innerHTML = records.slice(0, 956).map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.ticker)}</strong></td>
      <td><span class="ownership-company">${escapeHtml(item.companyName)}</span></td>
      <td>${escapeHtml(item.sector || "Unclassified")}</td>
      <td class="numeric">${kseiPercent(item.freeFloat)}</td>
      <td class="numeric"><span class="ownership-score ${asNumber(item.hhi) >= 2500 ? "high" : "moderate"}" title="${escapeHtml(concentrationLabel(item.hhi))}">${formatNumber(item.hhi, 0) || "—"}</span><small class="concentration-label">${escapeHtml(concentrationLabel(item.hhi))}</small></td>
      <td class="numeric">${kseiPercent(item.cr1)}</td>
      <td class="numeric">${kseiPercent(item.cr3)}</td>
      <td class="numeric">${formatNumber(item.holderCount, 0) || "—"}</td>
      <td class="numeric">${formatNumber(item.ccs, 0) || "—"}<small class="concentration-label">${escapeHtml(item.ccsCategory || "Unavailable")}</small></td>
      <td><span class="ownership-type">${escapeHtml(item.ownershipType)}</span></td>
      <td><button class="ownership-detail-button" type="button" data-ksei-ticker="${escapeHtml(item.ticker)}">Detail</button></td>
    </tr>`).join("");
}

function renderKseiUpdateModal() {
  const comparison = state.kseiData?.comparison;
  if (!comparison) return;
  const changed = comparison.changedTickers.length;
  const additions = comparison.investorAdditions.length;
  const removals = comparison.investorRemovals.length;
  els.kseiUpdateDates.textContent = comparison.previousAsOf
    ? `${state.kseiData.asOf} vs ${comparison.previousAsOf}`
    : `First published snapshot ${state.kseiData.asOf}`;
  els.kseiUpdateSummary.innerHTML = [
    ["New issuers", comparison.newTickers.length],
    ["Changed issuers", changed],
    ["Holder additions", additions],
  ].map(([label, value]) => `<div><strong>${formatNumber(value, 0)}</strong><span>${escapeHtml(label)}</span></div>`).join("");
  const noChanges = !changed && !additions && !removals && !comparison.newTickers.length && !comparison.removedTickers.length;
  els.kseiUpdateDetails.innerHTML = noChanges
    ? `<section><h3>No ownership changes detected</h3><p>The June 6 workbook contains the same issuer-level ownership values as the May 14 workbook. The newer source date is published without inventing changes.</p></section>`
    : `<section><h3>Published changes</h3><p>${changed} issuers changed, ${additions} holders entered the published &gt;1% list, and ${removals} left it.</p><div class="ksei-change-tags">${comparison.changedTickers.slice(0, 80).map((ticker) => `<span>${escapeHtml(ticker)}</span>`).join("")}</div></section>`;
  openModal(els.kseiUpdateModal);
}

function openKseiDetail(ticker) {
  const item = state.kseiData?.records.find((record) => record.ticker === ticker);
  if (!item) return;
  els.kseiDetailTitle.textContent = `${item.ticker} · ${item.companyName}`;
  els.kseiDetailSubtitle.textContent = `${item.sector} · ${item.industry} · KSEI ${item.asOf}`;
  const top = Math.max(1, ...item.investors.map((holder) => holder.percentage));
  els.kseiDetailBody.innerHTML = `
    <div class="ownership-detail-metrics">
      ${kseiMetric("Free float", kseiPercent(item.freeFloat), "Published KSEI value")}
      ${kseiMetric("HHI", formatNumber(item.hhi, 0) || "—", "Ownership concentration")}
      ${kseiMetric("CR1 / CR3", `${kseiPercent(item.cr1)} / ${kseiPercent(item.cr3)}`, "Top-holder concentration")}
      ${kseiMetric("CCS", formatNumber(item.ccs, 0) || "—", `${item.ccsCategory} · ${item.ownershipType}`)}
    </div>
    <section class="ownership-holder-list"><h3>Published investors above the source threshold</h3>${item.investors.length ? item.investors.map((holder) => `
      <div><span><strong>${escapeHtml(holder.name)}</strong><small>${escapeHtml(holder.type)}</small></span><i><u style="--width:${(holder.percentage / top) * 100}%"></u></i><b>${kseiPercent(holder.percentage)}</b></div>`).join("") : `<p>No parsed holder rows are available in this source record.</p>`}</section>
    <p class="ownership-source-note">This view describes the published ownership register. It does not infer trading activity, participant intent, or transaction flow.</p>`;
  openModal(els.kseiDetailModal);
}

function renderDataQuality() {
  const stats = summary();
  const qa = state.data.qa.summary || {};
  els.lastSuccessfulLoad.textContent = `Last successful dataset load · ${state.manifest.lastSuccessfulDatasetLoad}`;
  els.qualityMetricGrid.innerHTML = [
    metricCard("OK tickers", formatNumber(stats.ok, 0) || "0", `${formatNumber(stats.totalScanned, 0) || 0} scanned`, "positive"),
    metricCard("Partial tickers", formatNumber(stats.partial, 0) || "0", "Fields missing but record usable", stats.partial ? "negative" : ""),
    metricCard("No-data tickers", formatNumber(stats.noData, 0) || "0", "No valid record for selected date", stats.noData ? "negative" : ""),
    metricCard("QA failures", formatNumber(qa.fail, 0) || "0", `${formatNumber(qa.checks, 0) || 0} checks`, qa.fail ? "negative" : "positive"),
  ].join("");

  const coverage = new Counter();
  Object.values(state.data.technical.fieldDefinitions || {}).forEach((definition) => coverage.add(definition.source || "missing"));
  state.maps.technical.forEach((stock) => Object.values(stock._meta || {}).forEach((meta) => coverage.add(meta?.source || "missing")));
  const coverageRows = coverage.entries();
  const maximum = Math.max(1, ...coverageRows.map(([, count]) => count));
  els.sourceCoverage.innerHTML = coverageRows.map(([source, count]) => `<div class="bar-row"><strong>${escapeHtml(sourceLabel(source))}</strong><span class="bar-track"><i style="--width:${(count / maximum) * 100}%"></i></span><b>${formatNumber(count, 0)}</b></div>`).join("");
  const qaRows = [["Pass", qa.pass || 0], ["Warnings", qa.warn || 0], ["Failures", qa.fail || 0]];
  const qaMaximum = Math.max(1, ...qaRows.map(([, count]) => count));
  els.qaSummary.innerHTML = qaRows.map(([label, count]) => `<div class="bar-row"><strong>${escapeHtml(label)}</strong><span class="bar-track"><i style="--width:${(count / qaMaximum) * 100}%"></i></span><b>${formatNumber(count, 0)}</b></div>`).join("");

  const exceptions = (state.data.processing.records || []).filter((row) => {
    const status = String(row.status || row["Processing Status"] || "").trim().toUpperCase();
    return status && !["OK", "FULL", "SUCCESS"].includes(status);
  });
  if (!exceptions.length) {
    els.qualityExceptions.innerHTML = `<div class="empty-state"><h3>No processing exceptions published.</h3><p>All selected-date records passed the current processing status gate.</p></div>`;
  } else {
    els.qualityExceptions.innerHTML = `<table class="data-table"><thead><tr><th>Ticker</th><th>${guideHeading("Status")}</th><th>Missing fields / reason</th><th>${guideHeading("Source")}</th><th>${guideHeading("As of")}</th></tr></thead><tbody>${exceptions.slice(0, 1000).map((row) => {
      const field = row.field || {};
      return `<tr data-open-ticker="${escapeHtml(tickerOf(row))}"><td>${escapeHtml(tickerOf(row))}</td><td><span class="status-badge ${escapeHtml(String(row.status || "NO_DATA").toLowerCase())}">${escapeHtml(row.status || "NO_DATA")}</span></td><td>${escapeHtml((row.missingFields || []).join(", ") || field.reason || "source_unavailable")}</td><td>${escapeHtml(sourceLabel(field.source || "workbook"))}</td><td>${escapeHtml(field.asOf || state.marketDate)}</td></tr>`;
    }).join("")}</tbody></table>`;
  }
}

class Counter {
  constructor() { this.map = new Map(); }
  add(key) { this.map.set(key, (this.map.get(key) || 0) + 1); }
  entries() { return [...this.map.entries()].sort((a, b) => b[1] - a[1]); }
}

function sourceAuditRows() {
  const rows = [];
  const definitions = state.data.technical.fieldDefinitions || {};
  const valueAt = (stock, field) => ({
    lastPrice: stock.lastPrice,
    changePercent: stock.changePercent,
    volume: stock.volume,
    rvol: stock.rvol,
    rsRating: stock.rsRating,
    ema25: stock.movingAverages?.ema25,
    ema50: stock.movingAverages?.ema50,
    sma200: stock.movingAverages?.sma200,
    rsi14: stock.technical?.rsi14,
    macdLine: stock.technical?.macdLine,
    vwap: stock.technical?.vwap,
  })[field];
  state.maps.technical.forEach((stock, ticker) => {
    const fields = new Set([...Object.keys(definitions), ...Object.keys(stock._meta || {})]);
    fields.forEach((field) => {
      const definition = definitions[field] || {};
      const observedValue = valueAt(stock, field);
      const meta = stock._meta?.[field] || {
        value: observedValue,
        display: observedValue,
        source: definition.source || stock.provenance?.source || "workbook",
        sourceMode: "point_in_time",
        asOf: state.marketDate,
        status: validValue(observedValue) ? "ok" : "missing",
        reason: validValue(observedValue) ? null : "field_not_found",
        formula: definition.formula || null,
        formulaVersion: definition.formulaVersion || "source-limited-v3",
      };
      rows.push({
        "Market Date": state.marketDate,
        Ticker: ticker,
        Field: field,
        Value: meta.value,
        "Display Value": meta.display,
        Source: meta.source,
        "Source Mode": meta.sourceMode,
        "As Of Date": meta.asOf,
        Status: meta.status,
        "Missing Reason": meta.reason,
        Formula: meta.formula,
        "Formula Version": meta.formulaVersion,
      });
    });
  });
  return rows;
}

function explorerDatasets() {
  return {
    Overview: [state.data.overview.summary || {}],
    Screener: state.data.screener.records || [],
    Technical: [...state.maps.technical.values()],
    Fundamental: activeFundamentalRecords(),
    News: activeNewsRecords(),
    "Processing Results": state.data.processing.records || [],
    "QA Audit": state.data.qa.issues || [],
    "Data Source Audit": sourceAuditRows(),
  };
}

function flattenCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function renderExplorer() {
  const datasets = explorerDatasets();
  const names = Object.keys(datasets);
  if (!names.includes(state.explorerSheet)) state.explorerSheet = names[0];
  els.explorerSheet.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  els.explorerSheet.value = state.explorerSheet;
  const allRows = datasets[state.explorerSheet] || [];
  const needle = state.explorerSearch.trim().toLowerCase();
  const rows = allRows.filter((row) => !needle || Object.values(row).some((value) => flattenCell(value).toLowerCase().includes(needle)));
  const columns = [...new Set(allRows.slice(0, 100).flatMap((row) => Object.keys(row)))].slice(0, 80);
  els.explorerCount.textContent = `${rows.length} rows · ${columns.length} fields`;
  const referenceDomain = (state.explorerSheet === "Fundamental" && state.data.fundamental.isReference)
    || (state.explorerSheet === "News" && state.data.news.isReference);
  els.explorerReferenceBadge.hidden = !referenceDomain;
  if (referenceDomain) {
    const date = state.explorerSheet === "Fundamental" ? state.data.fundamental.referenceMarketDate : state.data.news.referenceMarketDate;
    els.explorerReferenceBadge.textContent = `Latest-reference data from ${date}; it is not point-in-time for selected market date ${state.marketDate}.`;
  }
  els.explorerHead.innerHTML = `<tr>${columns.map((column) => `<th>${guideHeading(column)}</th>`).join("")}</tr>`;
  els.explorerBody.innerHTML = rows.slice(0, 1000).map((row) => `<tr ${tickerOf(row) ? `data-open-ticker="${escapeHtml(tickerOf(row))}"` : ""}>${columns.map((column) => `<td>${valueHtml(row[column], null, flattenCell, { source: "workbook" })}</td>`).join("")}</tr>`).join("");
  els.explorerEmpty.hidden = rows.length > 0;
  if (!rows.length) els.explorerEmpty.innerHTML = `<h3>No published rows match this search.</h3><p>The sheet loaded successfully.</p>`;
}

function renderAll() {
  renderDatasetStatus();
  renderDashboard();
  renderMarket();
  renderScreener();
  renderWatchlist();
  renderKseiOwnership();
  renderDataQuality();
  renderExplorer();
  renderGuide();
  if (state.selectedTicker) renderTicker();
}

function csvValue(value) {
  const text = flattenCell(value).replaceAll('"', '""');
  return `"${text}"`;
}

function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const csv = [
    columns.map(csvValue).join(","),
    ...rows.map((row) => columns.map((column) => csvValue(row[column])).join(",")),
  ].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function openModal(element) {
  element.hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal(element) {
  element.hidden = true;
  if ([els.datePickerModal, els.indicatorSettingsModal, els.kseiUpdateModal, els.kseiDetailModal].every((modal) => modal.hidden)) {
    document.body.classList.remove("modal-open");
  }
}

function renderCalendar() {
  if (!state.calendarMonth || !state.manifest) return;
  const year = state.calendarMonth.getUTCFullYear();
  const month = state.calendarMonth.getUTCMonth();
  const published = new Set(state.manifest.availableMarketDates || []);
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  els.calendarMonthLabel.textContent = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(state.calendarMonth);
  const cells = Array.from({ length: firstDay }, () => `<span class="calendar-blank"></span>`);
  for (let day = 1; day <= dayCount; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const enabled = published.has(date);
    cells.push(`<button type="button" class="${date === state.marketDate ? "selected" : ""}" data-market-date="${date}" ${enabled ? "" : "disabled"}>${day}</button>`);
  }
  els.calendarGrid.innerHTML = cells.join("");
}

function openCalendar() {
  state.calendarMonth = new Date(`${state.marketDate.slice(0, 7)}-01T00:00:00Z`);
  renderCalendar();
  openModal(els.datePickerModal);
}

function handleIndicatorInput(event) {
  const input = event.target.closest("[name]");
  if (!input) return;
  const value = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
  if (input.type === "number" && (!Number.isFinite(value) || !input.validity.valid)) return;
  objectPathValue(state.indicatorSettings, input.name, value);
  saveIndicatorSettings();
  updateActiveIndicatorStrip();
  if (state.selectedTicker) renderPriceChart(state.selectedTicker);
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  document.addEventListener("click", (event) => {
    const guideTarget = event.target.closest("[data-guide-id]");
    if (guideTarget) return openGuideConcept(guideTarget.dataset.guideId);
    const guideCategory = event.target.closest("[data-guide-category]");
    if (guideCategory) {
      state.guideCategory = guideCategory.dataset.guideCategory;
      renderGuide();
      return;
    }
    const chartMode = event.target.closest("[data-chart-mode]");
    if (chartMode) return setChartMode(chartMode.dataset.chartMode);
    const interval = event.target.closest("[data-chart-interval]");
    if (interval) {
      state.chartInterval = interval.dataset.chartInterval;
      state.indicatorSettings.chart.interval = state.chartInterval;
      saveIndicatorSettings();
      document.querySelectorAll("[data-chart-interval]").forEach((button) => button.classList.toggle("active", button.dataset.chartInterval === state.chartInterval));
      return renderPriceChart(state.selectedTicker);
    }
    const range = event.target.closest("[data-chart-range]");
    if (range) {
      state.chartRange = range.dataset.chartRange;
      state.indicatorSettings.chart.range = state.chartRange;
      saveIndicatorSettings();
      document.querySelectorAll("[data-chart-range]").forEach((button) => button.classList.toggle("active", button.dataset.chartRange === state.chartRange));
      return renderPriceChart(state.selectedTicker);
    }
    const drawing = event.target.closest("[data-drawing-tool]");
    if (drawing?.dataset.drawingTool === "clear") {
      localStorage.removeItem(drawingKey());
      state.drawingDraft = null;
      renderSavedDrawings();
      drawing.closest(".drawing-toolbar").querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.drawingTool === "crosshair"));
      state.activeDrawingTool = "crosshair";
      els.historyMeta.textContent = `Saved drawings cleared for ${state.selectedTicker}.`;
      return;
    }
    if (drawing) {
      state.activeDrawingTool = drawing.dataset.drawingTool;
      state.drawingDraft = null;
      drawing.closest(".drawing-toolbar").querySelectorAll("button").forEach((button) => button.classList.toggle("active", button === drawing));
      els.historyMeta.textContent = state.activeDrawingTool === "crosshair"
        ? "Crosshair tool active."
        : `${state.activeDrawingTool} tool active. Select a chart point${state.activeDrawingTool === "annotation" ? "" : ", then select the endpoint"}.`;
      return;
    }
    const watchTarget = event.target.closest("[data-toggle-watch]");
    if (watchTarget) return toggleWatchlist(watchTarget.dataset.toggleWatch);
    const removeTarget = event.target.closest("[data-remove-watch]");
    if (removeTarget) return toggleWatchlist(removeTarget.dataset.removeWatch);
    const sectorTarget = event.target.closest("[data-filter-sector]");
    if (sectorTarget) {
      state.filters.sector = sectorTarget.dataset.filterSector;
      state.filters.signal = "ALL";
      showView("screener");
      renderScreener();
      return;
    }
    const dashboardSignal = event.target.closest("[data-dashboard-signal]");
    if (dashboardSignal) {
      state.filters.signal = dashboardSignal.dataset.dashboardSignal;
      state.filters.sector = "ALL";
      showView("screener");
      renderScreener();
      return;
    }
    if (event.target.closest("[data-open-calendar]")) {
      openCalendar();
      return;
    }
    const downloadShortcut = event.target.closest("[data-download-shortcut]");
    if (downloadShortcut) {
      event.preventDefault();
      if (!els.workbookDownload.classList.contains("disabled")) els.workbookDownload.click();
      return;
    }
    const tickerTarget = event.target.closest("[data-open-ticker]");
    if (tickerTarget) return selectTicker(tickerTarget.dataset.openTicker);
    const kseiTicker = event.target.closest("[data-ksei-ticker]");
    if (kseiTicker) return openKseiDetail(kseiTicker.dataset.kseiTicker);
    const kseiSector = event.target.closest("[data-ksei-sector]");
    if (kseiSector) {
      state.kseiFilters.sector = kseiSector.dataset.kseiSector;
      els.kseiSectorFilter.value = state.kseiFilters.sector;
      renderKseiOwnership();
      return;
    }
    const dateTarget = event.target.closest("[data-market-date]");
    if (dateTarget && !dateTarget.disabled) {
      closeModal(els.datePickerModal);
      loadDate(dateTarget.dataset.marketDate).catch((error) => showError(error.message));
      return;
    }
    const closeTarget = event.target.closest("[data-close-modal]");
    if (closeTarget) {
      const modals = {
        date: els.datePickerModal,
        indicators: els.indicatorSettingsModal,
        "ksei-update": els.kseiUpdateModal,
        "ksei-detail": els.kseiDetailModal,
      };
      closeModal(modals[closeTarget.dataset.closeModal] || els.indicatorSettingsModal);
      return;
    }
    const lens = event.target.closest("[data-lens]");
    if (lens) {
      state.filters.signal = lens.dataset.lens;
      els.signalSelect.value = state.filters.signal;
      renderScreener();
      return;
    }
    const heat = event.target.closest("[data-sector-filter]");
    if (heat) {
      state.filters.sector = heat.dataset.sectorFilter;
      state.filters.signal = heat.dataset.signalFilter;
      showView("screener");
      renderScreener();
      return;
    }
    if (event.target.closest("[data-reset-filters]")) return resetFilters();
    if (event.target.closest("[data-reload-chart]")) return renderPriceChart(state.selectedTicker);
    const viewTarget = event.target.closest("[data-go-view]");
    if (viewTarget) return showView(viewTarget.dataset.goView);
  });
  els.menuButton.addEventListener("click", () => document.body.classList.toggle("nav-open"));
  els.priceChart.addEventListener("click", handleDrawingClick);
  els.themeToggle.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  els.refreshData.addEventListener("click", () => loadDate(state.marketDate).catch((error) => showError(error.message)));
  els.datePickerButton.addEventListener("click", openCalendar);
  els.calendarPrevious.addEventListener("click", () => {
    state.calendarMonth = new Date(Date.UTC(state.calendarMonth.getUTCFullYear(), state.calendarMonth.getUTCMonth() - 1, 1));
    renderCalendar();
  });
  els.calendarNext.addEventListener("click", () => {
    state.calendarMonth = new Date(Date.UTC(state.calendarMonth.getUTCFullYear(), state.calendarMonth.getUTCMonth() + 1, 1));
    renderCalendar();
  });
  els.calendarLatest.addEventListener("click", () => {
    closeModal(els.datePickerModal);
    loadDate(state.manifest.latestMarketDate).catch((error) => showError(error.message));
  });
  els.tickerCommand.addEventListener("change", (event) => selectTicker(event.target.value));
  els.tickerCommand.addEventListener("keydown", (event) => {
    if (event.key === "Enter") selectTicker(event.currentTarget.value);
  });
  els.mobileTickerCommand.addEventListener("change", (event) => selectTicker(event.target.value));
  els.mobileTickerCommand.addEventListener("keydown", (event) => {
    if (event.key === "Enter") selectTicker(event.currentTarget.value);
  });
  els.chartTickerSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") selectTicker(event.currentTarget.value);
  });
  els.screenerSearch.addEventListener("input", (event) => { state.filters.search = event.target.value; renderScreener(); });
  els.sectorSelect.addEventListener("change", (event) => { state.filters.sector = event.target.value; renderScreener(); });
  els.signalSelect.addEventListener("change", (event) => { state.filters.signal = event.target.value; renderScreener(); });
  els.rvolMinimum.addEventListener("input", (event) => { state.filters.rvol = event.target.value === "" ? null : Number(event.target.value); renderScreener(); });
  els.rsMinimum.addEventListener("input", (event) => { state.filters.rs = event.target.value === "" ? null : Number(event.target.value); renderScreener(); });
  els.qualitySelect.addEventListener("change", (event) => { state.filters.quality = event.target.value; renderScreener(); });
  els.sortSelect.addEventListener("change", (event) => { state.filters.sort = event.target.value; renderScreener(); });
  els.resetFilters.addEventListener("click", resetFilters);
  els.densityToggle.addEventListener("click", () => { state.density = state.density === "compact" ? "comfortable" : "compact"; renderScreener(); });
  els.exportScreener.addEventListener("click", () => downloadCsv(`idx-screener-${state.marketDate}.csv`, filteredSignals()));
  els.exportWatchlist.addEventListener("click", () => downloadCsv(`idx-watchlist-${state.marketDate}.csv`, watchlist().map((ticker) => state.maps.technical.get(ticker) || { ticker })));
  els.heatmapMode.addEventListener("click", () => { state.heatmapMode = state.heatmapMode === "tickers" ? "rows" : "tickers"; renderSectorSignalHeatmap(); });
  els.explorerSheet.addEventListener("change", (event) => { state.explorerSheet = event.target.value; renderExplorer(); });
  els.explorerSearch.addEventListener("input", (event) => { state.explorerSearch = event.target.value; renderExplorer(); });
  els.exportExplorer.addEventListener("click", () => downloadCsv(`idx-${state.explorerSheet.toLowerCase().replaceAll(" ", "-")}-${state.marketDate}.csv`, explorerDatasets()[state.explorerSheet] || []));
  els.kseiUpdateButton.addEventListener("click", renderKseiUpdateModal);
  els.kseiSearch.addEventListener("input", (event) => { state.kseiFilters.search = event.target.value; renderKseiOwnership(); });
  els.kseiSectorFilter.addEventListener("change", (event) => { state.kseiFilters.sector = event.target.value; renderKseiOwnership(); });
  els.kseiTypeFilter.addEventListener("change", (event) => { state.kseiFilters.type = event.target.value; renderKseiOwnership(); });
  els.kseiSort.addEventListener("change", (event) => { state.kseiFilters.sort = event.target.value; renderKseiOwnership(); });
  els.indicatorSettingsButton.addEventListener("click", () => { populateIndicatorSettingsForm(); openModal(els.indicatorSettingsModal); });
  els.resetChartLayout.addEventListener("click", () => {
    state.chartInterval = "1D";
    state.chartRange = "1Y";
    state.indicatorSettings.chart.interval = "1D";
    state.indicatorSettings.chart.range = "1Y";
    saveIndicatorSettings();
    document.querySelectorAll("[data-chart-interval]").forEach((button) => button.classList.toggle("active", button.dataset.chartInterval === "1D"));
    document.querySelectorAll("[data-chart-range]").forEach((button) => button.classList.toggle("active", button.dataset.chartRange === "1Y"));
    renderPriceChart(state.selectedTicker);
  });
  els.fullscreenChart.addEventListener("click", () => els.chartWorkspace.requestFullscreen?.());
  els.indicatorSettingsForm.addEventListener("change", handleIndicatorInput);
  els.indicatorSettingsForm.addEventListener("input", handleIndicatorInput);
  els.guideSearch.addEventListener("input", (event) => {
    state.guideSearch = event.target.value;
    renderGuide();
  });
  els.guideClear.addEventListener("click", () => {
    state.guideSearch = "";
    state.guideCategory = "ALL";
    els.guideSearch.value = "";
    renderGuide();
  });
  els.resetIndicatorSettings.addEventListener("click", () => {
    state.indicatorSettings = IDXIndicators.deepMerge(IDXIndicators.DEFAULTS, {});
    saveIndicatorSettings();
    populateIndicatorSettingsForm();
    updateActiveIndicatorStrip();
    if (state.selectedTicker) renderPriceChart(state.selectedTicker);
  });
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeModal(backdrop);
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeModal(els.datePickerModal);
      closeModal(els.indicatorSettingsModal);
      closeModal(els.kseiUpdateModal);
      closeModal(els.kseiDetailModal);
    }
  });
  window.addEventListener("hashchange", () => routeFromHash());
  window.addEventListener("popstate", (event) => {
    restoreNavigation(event).catch((error) => showError(error.message));
  });
}

async function init() {
  initTheme();
  loadIndicatorSettings();
  document.querySelectorAll("[data-chart-mode]").forEach((button) => button.classList.toggle("active", button.dataset.chartMode === state.chartMode));
  document.querySelectorAll("[data-chart-interval]").forEach((button) => button.classList.toggle("active", button.dataset.chartInterval === state.chartInterval));
  document.querySelectorAll("[data-chart-range]").forEach((button) => button.classList.toggle("active", button.dataset.chartRange === state.chartRange));
  els.researchChartView.hidden = state.chartMode !== "research";
  els.tradingViewChartView.hidden = state.chartMode !== "tradingview";
  populateIndicatorSettingsForm();
  updateActiveIndicatorStrip();
  bindEvents();
  loading(8);
  [state.manifest, state.logicReference, state.kseiManifest, state.updateLog] = await Promise.all([
    fetchJson("data/manifest.json"),
    fetchJson("data/logic-reference.json"),
    fetchJson("data/ksei/manifest.json"),
    fetchJson("data/update-log.json").catch(() => ({ entries: [] })),
  ]);
  if (state.logicReference.schemaVersion !== 1 || !state.logicReference.records?.length) {
    throw new Error("Logic reference registry is unavailable.");
  }
  if (state.kseiManifest.schemaVersion !== 1) throw new Error("KSEI ownership manifest is unavailable.");
  hydrateGuideTooltips();
  if (state.manifest.schemaVersion !== 5) throw new Error("Published manifest is not schema version 5.");
  if (!state.manifest.dates?.length) throw new Error("No market dates are published.");
  const requestedDate = new URL(window.location.href).searchParams.get("date");
  const marketDate = state.manifest.availableMarketDates.includes(requestedDate)
    ? requestedDate
    : state.manifest.latestMarketDate;
  await loadDate(marketDate, { historyMode: "replace" });
  routeFromHash({ scroll: false });
  state.navigationReady = true;
  history.replaceState({ ...(history.state || {}), scrollY: window.scrollY }, "", window.location.href);
}

init().catch((error) => {
  loading(100);
  showError(error.message);
  els.datasetState.className = "status-badge error";
  els.datasetState.textContent = "Failed load";
  els.datasetLine.textContent = "The last published dataset could not be loaded. Check manifest, schema, and network status.";
  els.footerFreshness.textContent = "Dataset load failed";
});
