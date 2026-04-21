export const INSTRUMENT_FAMILIES = [
  'time-profiler',
  'allocations',
  'leaks',
  'hangs',
  'network',
  'processor-trace',
  'energy-log',
  'memory-graph',
] as const;

export type InstrumentFamily = (typeof INSTRUMENT_FAMILIES)[number];

export type SupportLevel = 'first-class' | 'summary' | 'experimental';

export type GenericFinding = {
  kind: string;
  title: string;
  summary: string;
  severity: 'info' | 'warning' | 'critical';
  confidence: 'low' | 'medium' | 'high';
};

export type GenericMetric = {
  name: string;
  subject: string;
  value: number;
  unit: string;
};

export type GenericSection = {
  title: string;
  rows: Array<Record<string, string | number | boolean | null>>;
};

export type GenericSummary = {
  family: InstrumentFamily;
  supportLevel: SupportLevel;
  metadata: {
    sourcePath: string;
    sourceKind: 'trace' | 'xml' | 'har' | 'memgraph';
    runNumber: number | null;
    processName: string | null;
    templateName: string | null;
  };
  headline: string;
  metrics: GenericMetric[];
  findings: GenericFinding[];
  notes: string[];
  sections: GenericSection[];
  limitations: string[];
  experimental: boolean;
};

export type GenericComparisonDelta = {
  metric: string;
  subject: string;
  baselineValue: number;
  candidateValue: number;
  deltaValue: number;
  unit: string;
};

export type GenericComparison = {
  family: InstrumentFamily;
  supportLevel: SupportLevel;
  experimental: boolean;
  comparable: boolean;
  confidence: number;
  headline: string;
  baselineSummary: GenericSummary;
  candidateSummary: GenericSummary;
  compatibilityNotes: string[];
  regressions: GenericComparisonDelta[];
  improvements: GenericComparisonDelta[];
  unchanged: GenericComparisonDelta[];
};
