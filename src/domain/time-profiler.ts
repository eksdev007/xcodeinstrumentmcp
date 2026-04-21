export type TraceToc = {
  runs: TraceRun[];
};

export type TraceRun = {
  runNumber: number;
  processes: TraceProcess[];
  tables: TraceTable[];
};

export type TraceProcess = {
  name: string;
  pid: string | null;
  path: string | null;
};

export type TraceTable = {
  schema: string;
  attributes: Record<string, string>;
};

export type ParsedSample = {
  sampleTimeNs: number | null;
  threadName: string | null;
  threadId: string | null;
  processName: string | null;
  processId: string | null;
  weightNs: number | null;
  frames: ParsedFrame[];
};

export type ParsedFrame = {
  index: number;
  symbol: string;
  module: string | null;
  binaryPath: string | null;
  rawAddress: string | null;
  canonicalKey: string;
  isSystem: boolean;
};

export type Hotspot = {
  rank: number;
  frameKey: string;
  symbol: string;
  module: string | null;
  selfWeightNs: number;
  totalWeightNs: number;
  selfPct: number;
  totalPct: number;
  isSystem: boolean;
  dominantThreads: Array<{ thread: string; weightNs: number; pct: number }>;
  exampleCallPaths: string[];
  reasonCodes: string[];
};

export type Finding = {
  kind: string;
  title: string;
  summary: string;
};

export type TimeProfilerSummary = {
  metadata: {
    tracePath: string;
    runNumber: number;
    totalSamples: number;
    totalWeightNs: number;
  };
  processSelection: {
    name: string;
    pid: string | null;
    reason: string;
  };
  threadSummaries: Array<{ thread: string; weightNs: number; pct: number }>;
  hotspots: Hotspot[];
  intervalSummaries: Array<{ name: string; count: number }>;
  findings: Finding[];
  notes: string[];
};
