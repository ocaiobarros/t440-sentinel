/**
 * Canonical telemetry envelope — v1.
 * One payload serves stat, gauge, timeseries, table, and text widgets.
 */

export const TELEMETRY_CONTRACT_VERSION = 1;

export type TelemetryType = "stat" | "gauge" | "timeseries" | "table" | "text";

export interface TelemetryPoint {
  ts: number;   // epoch ms
  value: number;
}

export interface TelemetryStatData {
  value: number;
  unit?: string;
  trend?: number;
  min?: number;
  max?: number;
}

export interface TelemetryGaugeData {
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  thresholds?: number[];
}

export interface TelemetryTimeseriesData {
  points: TelemetryPoint[];
  unit?: string;
  label?: string;
}

export interface TelemetryTableData {
  columns: string[];
  rows: unknown[][];
}

export interface TelemetryTextData {
  text: string;
  format?: "plain" | "markdown";
}

export type TelemetryData =
  | TelemetryStatData
  | TelemetryGaugeData
  | TelemetryTimeseriesData
  | TelemetryTableData
  | TelemetryTextData;

/** Canonical envelope — what producers send to the Reactor */
export interface TelemetryEnvelope {
  tenant_id: string;
  dashboard_id: string;
  key: string;            // dedupe-stable, e.g. "zbx:host=123:item=456:avg1m"
  type: TelemetryType;
  data: TelemetryData;
  ts: number;             // epoch ms (server sets if missing)
  v: number;              // contract version
  meta?: Record<string, unknown>;
}

/** What the Reactor broadcasts via Realtime */
export interface TelemetryBroadcast {
  event: "DATA_UPDATE";
  key: string;
  type: TelemetryType;
  data: TelemetryData;
  ts: number;
  v: number;
}

/** Replay response shape */
export interface TelemetryReplayEntry {
  key: string;
  type: TelemetryType;
  data: TelemetryData;
  ts: number;
  v: number;
}
