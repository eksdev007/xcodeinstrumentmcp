import type { TimeProfilerSummary } from './time-profiler.js';

export type DeltaHotspot = {
  frameKey: string;
  symbol: string;
  module: string | null;
  deltaSelfPct: number;
  deltaTotalPct: number;
  deltaSelfNs: number;
  deltaTotalNs: number;
  relativeTotalChangePct: number;
};

export type TimeProfilerComparison = {
  baseline: TimeProfilerSummary;
  candidate: TimeProfilerSummary;
  confidence: number;
  comparabilityNotes: string[];
  regressions: DeltaHotspot[];
  improvements: DeltaHotspot[];
  unchangedTopHotspots: DeltaHotspot[];
};
