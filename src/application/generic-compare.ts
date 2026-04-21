import type { GenericComparison, GenericComparisonDelta, GenericSummary } from '../domain/analysis.js';

export function compareGenericSummaries(input: {
  baseline: GenericSummary;
  candidate: GenericSummary;
  topDeltas?: number;
}): GenericComparison {
  const topDeltas = input.topDeltas ?? 20;
  const baselineMetrics = new Map(input.baseline.metrics.map((metric) => [`${metric.name}|${metric.subject}|${metric.unit}`, metric]));
  const candidateMetrics = new Map(input.candidate.metrics.map((metric) => [`${metric.name}|${metric.subject}|${metric.unit}`, metric]));
  const keys = [...new Set([...baselineMetrics.keys(), ...candidateMetrics.keys()])];

  const deltas = keys.map((key) => {
    const baseline = baselineMetrics.get(key);
    const candidate = candidateMetrics.get(key);
    return {
      metric: candidate?.name ?? baseline?.name ?? 'unknown',
      subject: candidate?.subject ?? baseline?.subject ?? 'unknown',
      baselineValue: baseline?.value ?? 0,
      candidateValue: candidate?.value ?? 0,
      deltaValue: (candidate?.value ?? 0) - (baseline?.value ?? 0),
      unit: candidate?.unit ?? baseline?.unit ?? 'count',
    } satisfies GenericComparisonDelta;
  });

  const sorted = deltas.sort((left, right) => Math.abs(right.deltaValue) - Math.abs(left.deltaValue));
  const regressions = sorted.filter((delta) => delta.deltaValue > 0).slice(0, topDeltas);
  const improvements = sorted.filter((delta) => delta.deltaValue < 0).slice(0, topDeltas);
  const unchanged = sorted.filter((delta) => delta.deltaValue === 0).slice(0, topDeltas);

  const compatibilityNotes: string[] = [];
  if (input.baseline.family !== input.candidate.family) {
    compatibilityNotes.push('Baseline and candidate families differ.');
  }
  if (input.baseline.experimental || input.candidate.experimental) {
    compatibilityNotes.push('Experimental analyzer output reduces comparison confidence.');
  }

  const comparable = compatibilityNotes.length === 0;
  return {
    family: input.baseline.family,
    supportLevel: input.baseline.supportLevel,
    experimental: input.baseline.experimental,
    comparable,
    confidence: comparable ? 0.8 : 0.4,
    headline: `${input.baseline.family} comparison`,
    baselineSummary: input.baseline,
    candidateSummary: input.candidate,
    compatibilityNotes,
    regressions,
    improvements,
    unchanged,
  };
}
