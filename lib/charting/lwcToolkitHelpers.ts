// Adapted from TradingView's own official `@tradingview/lwc-toolkit` package
// (Apache-2.0, https://github.com/tradingview/lightweight-charts, package at
// packages/lwc-toolkit) -- the small set of helpers their own plugin-examples
// (trend-line, rectangle-drawing-tool) build on: a plugin base class handling
// the chart/series/requestUpdate wiring every ISeriesPrimitive needs, plus
// the bitmap-position math for centering a line or box at a media coordinate
// under a given pixel ratio. Not published to npm as an installable package,
// so inlined here rather than duplicated by hand per plugin file.

import type {
  DataChangedScope, IChartApi, IPrimitivePaneRenderer, ISeriesApi, ISeriesPrimitive,
  SeriesAttachedParameter, SeriesOptionsMap, Time,
} from "lightweight-charts";

// `fancy-canvas` (the package these types actually come from) is a transitive
// dependency of lightweight-charts, not a direct one of ours -- pnpm doesn't
// hoist it, so `import ... from "fancy-canvas"` doesn't resolve here.
// Extracting the type from a signature lightweight-charts DOES export sidesteps
// that without adding a dependency just for its types.
export type PaneRendererTarget = Parameters<IPrimitivePaneRenderer["draw"]>[0];

export function ensureDefined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Value is undefined");
  return value;
}

export abstract class PluginBase implements ISeriesPrimitive<Time> {
  private _chart: IChartApi | undefined = undefined;
  private _series: ISeriesApi<keyof SeriesOptionsMap> | undefined = undefined;
  protected dataUpdated?(scope: DataChangedScope): void;
  private _requestUpdate?: () => void;
  protected requestUpdate(): void { this._requestUpdate?.(); }

  public attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
    this._chart = chart;
    this._series = series;
    this._series.subscribeDataChanged(this._fireDataUpdated);
    this._requestUpdate = requestUpdate;
    this.requestUpdate();
  }

  public detached() {
    this._series?.unsubscribeDataChanged(this._fireDataUpdated);
    this._chart = undefined;
    this._series = undefined;
    this._requestUpdate = undefined;
  }

  public get chart(): IChartApi { return ensureDefined(this._chart); }
  public get series(): ISeriesApi<keyof SeriesOptionsMap> { return ensureDefined(this._series); }

  private _fireDataUpdated = (scope: DataChangedScope) => { this.dataUpdated?.(scope); };
}

export type BitmapPositionLength = { position: number; length: number };

/** Bitmap position+length for a fixed-width line centered on a media coordinate. */
export function positionsLine(positionMedia: number, pixelRatio: number, desiredWidthMedia = 1): BitmapPositionLength {
  const scaledPosition = Math.round(pixelRatio * positionMedia);
  const lineBitmapWidth = Math.round(desiredWidthMedia * pixelRatio);
  const offset = Math.floor(lineBitmapWidth * 0.5);
  return { position: scaledPosition - offset, length: lineBitmapWidth };
}

/** Bitmap position+length spanning between two media coordinates (a box edge). */
export function positionsBox(position1Media: number, position2Media: number, pixelRatio: number): BitmapPositionLength {
  const scaledPosition1 = Math.round(pixelRatio * position1Media);
  const scaledPosition2 = Math.round(pixelRatio * position2Media);
  return { position: Math.min(scaledPosition1, scaledPosition2), length: Math.abs(scaledPosition2 - scaledPosition1) + 1 };
}
