import type { DeltaHotspot, TimeProfilerComparison } from '../domain/comparison.js';
import type { Hotspot, TimeProfilerSummary } from '../domain/time-profiler.js';

export function compareTimeProfilerSummaries(input: {
  baseline: TimeProfilerSummary;
  candidate: TimeProfilerSummary;
  regressionThresholdPct?: number;
  regressionThresholdMs?: number;
  topDeltas?: number;
}): TimeProfilerComparison {
  const regressionThresholdPct = input.regressionThresholdPct ?? 10;
  const regressionThresholdMs = input.regressionThresholdMs ?? 10;
  const topDeltas = input.topDeltas ?? 20;

  const baselineMap = new Map(input.baseline.hotspots.map((hotspot) => [hotspot.frameKey, hotspot]));
  const candidateMap = new Map(input.candidate.hotspots.map((hotspot) => [hotspot.frameKey, hotspot]));
  const keys = [...new Set([...baselineMap.keys(), ...candidateMap.keys()])];
  const deltas = keys.map((key) => compareHotspot(baselineMap.get(key), candidateMap.get(key)));

  const regressions = deltas
    .filter(
      (delta) =>
        delta.deltaTotalPct >= regressionThresholdPct || delta.deltaTotalNs >= regressionThresholdMs * 1_000_000,
    )
    .sort((left, right) => right.deltaTotalPct - left.deltaTotalPct)
    .slice(0, topDeltas);

  const improvements = deltas
    .filter(
      (delta) =>
        delta.deltaTotalPct <= -regressionThresholdPct || delta.deltaTotalNs <= -(regressionThresholdMs * 1_000_000),
    )
    .sort((left, right) => left.deltaTotalPct - right.deltaTotalPct)
    .slice(0, topDeltas);

  const unchangedTopHotspots = deltas
    .filter((delta) => Math.abs(delta.deltaTotalPct) < regressionThresholdPct)
    .slice(0, topDeltas);

  const comparabilityNotes: string[] = [];
  if (input.baseline.processSelection.name !== input.candidate.processSelection.name) {
    comparabilityNotes.push('Selected process names differ between baseline and candidate.');
  }
  if (input.baseline.metadata.totalSamples === 0 || input.candidate.metadata.totalSamples === 0) {
    comparabilityNotes.push('One side has no samples, lowering confidence.');
  }

  return {
    baseline: input.baseline,
    candidate: input.candidate,
    confidence: compareConfidence(input.baseline, input.candidate),
    comparabilityNotes,
    regressions,
    improvements,
    unchangedTopHotspots,
  };
}

function compareHotspot(baseline: Hotspot | undefined, candidate: Hotspot | undefined): DeltaHotspot {
  const baselineSelfNs = baseline?.selfWeightNs ?? 0;
  const baselineTotalNs = baseline?.totalWeightNs ?? 0;
  const candidateSelfNs = candidate?.selfWeightNs ?? 0;
  const candidateTotalNs = candidate?.totalWeightNs ?? 0;
  const baselineSelfPct = baseline?.selfPct ?? 0;
  const baselineTotalPct = baseline?.totalPct ?? 0;
  const candidateSelfPct = candidate?.selfPct ?? 0;
  const candidateTotalPct = candidate?.totalPct ?? 0;

  return {
    frameKey: candidate?.frameKey ?? baseline?.frameKey ?? 'unknown::unknown',
    symbol: candidate?.symbol ?? baseline?.symbol ?? 'unknown',
    module: candidate?.module ?? baseline?.module ?? null,
    deltaSelfPct: candidateSelfPct - baselineSelfPct,
    deltaTotalPct: candidateTotalPct - baselineTotalPct,
    deltaSelfNs: candidateSelfNs - baselineSelfNs,
    deltaTotalNs: candidateTotalNs - baselineTotalNs,
    relativeTotalChangePct:
      baselineTotalNs === 0 ? (candidateTotalNs === 0 ? 0 : 100) : ((candidateTotalNs - baselineTotalNs) / baselineTotalNs) * 100,
  };
}

function compareConfidence(baseline: TimeProfilerSummary, candidate: TimeProfilerSummary): number {
  let confidence = 1;

  if (baseline.processSelection.name !== candidate.processSelection.name) {
    confidence -= 0.2;
  }

  const sampleRatio =
    baseline.metadata.totalSamples === 0 ? 0 : candidate.metadata.totalSamples / baseline.metadata.totalSamples;
  if (sampleRatio < 0.5 || sampleRatio > 2) {
    confidence -= 0.15;
  }

  if (baseline.notes.some((note) => note.includes('fallback')) || candidate.notes.some((note) => note.includes('fallback'))) {
    confidence -= 0.1;
  }

  return Math.max(0, Math.min(1, confidence));
}
