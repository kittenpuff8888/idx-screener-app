export type JsonRecord = Record<string, unknown>;

export type ManifestEntry = {
  marketDate: string;
  path?: string;
  totalScanned?: number;
  okTickers?: number;
  partialTickers?: number;
  noDataTickers?: number;
  signalRows?: number;
  uniqueSignalTickers?: number;
  status?: string;
};

export type Manifest = {
  schemaVersion: number;
  latestMarketDate: string;
  latest?: string;
  generatedAt?: string;
  lastSuccessfulDatasetLoad?: string;
  availableMarketDates: string[];
  dataCoverageStart: string;
  dates: ManifestEntry[];
};

export type OverviewPayload = {
  marketDate: string;
  generatedAt?: string;
  summary?: JsonRecord;
  overview?: {
    breadth?: JsonRecord;
    signals?: JsonRecord;
    sectors?: JsonRecord[] | JsonRecord;
    topGainers?: JsonRecord[];
    topDecliners?: JsonRecord[];
    marketContext?: JsonRecord;
  };
};

export type ScreenerRow = {
  ticker: string;
  companyName: string;
  sector: string;
  idxSectorRaw: string;
  industry: string;
  price: number | null;
  changePct: number | null;
  beta: number | null;
  rvol: number | null;
  rvolChangePct: number | null;
  liquidityCategory: string;
  smc: string;
  vwapZone: string;
  marketProfileZone: string;
  maZone: string;
  summary: string;
  signalLabel: string;
  kongloGroups: string[];
  tradePlan?: TradePlan;
  raw: JsonRecord;
};

export type TradePlan = {
  entryPoi?: string;
  entry?: number | null;
  entryDistancePct?: number | null;
  targetPoi?: string;
  target?: number | null;
  targetUpsidePct?: number | null;
  invalidationPoi?: string;
  invalidation?: number | null;
  invalidationDownPct?: number | null;
  rr?: number | null;
};

export type TechnicalRecord = {
  ticker: string;
  companyName?: string;
  sector?: string;
  industry?: string;
  lastPrice?: number;
  changePercent?: number;
  volume?: number;
  rvol?: number;
  rvolChangePercent?: number;
  rsRating?: number;
  beta?: number;
  liquidityCategory?: string;
  trend?: JsonRecord;
  structure?: JsonRecord;
  movingAverages?: JsonRecord;
  supportLevels?: number[];
  resistanceLevels?: number[];
  entry?: number;
  entryPoi?: string;
  entryDistancePercent?: number;
  target?: number;
  targetPoi?: string;
  invalidation?: number;
  invalidationPoi?: string;
  riskReward?: number;
  upsidePercent?: number;
  downsidePercent?: number;
  signalExplanation?: string;
  summaryScreener?: string;
  signalCount?: number;
  technical?: JsonRecord;
  fundamentals?: JsonRecord;
  news?: JsonRecord[];
  volumeDisplay?: string;
  averageVolume20?: number;
  dataStatus?: string;
  raw?: JsonRecord;
};

export type ResearchBundle = {
  marketDate: string;
  overview: OverviewPayload;
  screener: ScreenerRow[];
  technical: Map<string, TechnicalRecord>;
  fundamentals: Map<string, JsonRecord>;
  news: Map<string, JsonRecord>;
};

export type InvestorEntry = {
  rank: number;
  name: string;
  type: string;
  percentage: number;
  originalLine?: string;
};

export type KseiIssuer = {
  ticker: string;
  companyName: string;
  sector: string;
  idxSectorRaw: string;
  industry: string;
  investors: InvestorEntry[];
  freeFloat: number | null;
  hhi: number | null;
  cr1: number | null;
  cr3: number | null;
  holderCount: number | null;
  ccs: number | null;
  ownershipType: string;
  ccsCategory: string;
  idxSectorWeight: number | null;
  composition?: OwnershipComposition | null;
  raw: JsonRecord;
};

export type OwnershipComposition = {
  retailPct: number;
  institutionalPct: number;
  corporatePct: number;
  otherPct: number;
};

export type KseiChange = {
  changeType: string;
  ticker: string;
  companyName: string;
  investor: string;
  oldPercentage?: number;
  newPercentage?: number;
  notes?: string;
};

export type KseiComparison = {
  previousAsOf: string;
  newTickers: string[];
  removedTickers: string[];
  changedTickers: string[];
  newInvestors: number;
  exitedInvestors: number;
};

export type KseiPayload = {
  asOf: string;
  generatedAt?: string;
  summary: JsonRecord;
  records: KseiIssuer[];
  investorChanges: KseiChange[];
  comparison?: KseiComparison;
};

export type IndexConstituent = {
  ticker: string;
  category?: string;
  sector?: string;
  industry?: string;
  weight?: number;
  marketCap?: number;
};

export type IndexPoint = {
  date: string;
  value: number;
};

export type IndexGroup = {
  id: string;
  label: string;
  section: string;
  type: "local-research-index";
  weightMethod?: string;
  baseDate?: string;
  formula?: string;
  constituents: IndexConstituent[];
  series: IndexPoint[];
};

export type ExternalIndex = {
  id: string;
  label: string;
  symbol: string;
  type: "live-reference";
};

export type IndexPayload = {
  generatedAt?: string;
  marketDateRange?: { start?: string; end?: string };
  externalIndexes: Record<string, ExternalIndex[]>;
  groups: IndexGroup[];
};

export type OhlcvRow = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type OhlcvPayload = {
  ticker: string;
  date: string;
  rows: OhlcvRow[];
};
