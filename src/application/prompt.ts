import type { TimeProfilerSummary } from '../domain/time-profiler.js';
import type { TimeProfilerComparison } from '../domain/comparison.js';

export function buildOptimizationPrompt(input: {
  summary: TimeProfilerSummary;
  goal: 'latency' | 'cpu' | 'startup' | 'throughput' | 'generic';
  budgetChars: number;
}): string {
  const { summary } = input;
  const hotspots = summary.hotspots.slice(0, 10);
  const findings = summary.findings.slice(0, 5);
  const thread = summary.threadSummaries[0]?.thread ?? 'unknown-thread';
  const dominantModule = summarizeDominantModule(hotspots);
  const lowSignalTrace = summary.findings.some((finding) => finding.kind === 'sparse_trace_warning') && (hotspots[0]?.totalPct ?? 0) < 5;

  let prompt = [
    '# Goal',
    `${goalLine(input.goal)}`,
    '',
    '# Context',
    `This summary comes from a Time Profiler trace for process \`${summary.processSelection.name}\`, focused on the \`${thread}\` thread, with system libraries hidden for ranking and bounded hotspot output.`,
    '',
    '# Evidence',
    ...hotspots.map(
      (hotspot, index) =>
        `- Hotspot ${index + 1}: \`${hotspot.symbol}\` in \`${hotspot.module ?? 'unknown'}\` with ${hotspot.totalPct.toFixed(1)}% total and ${hotspot.selfPct.toFixed(1)}% self.`,
    ),
    '',
    '# Hypotheses',
    ...(findings.length > 0
      ? findings.map((finding) => `- ${finding.summary}`)
      : ['- Most cost appears concentrated in the top-ranked hotspots; verify whether that work is user-visible and avoidable.']),
    ...(dominantModule ? [`- Non-wrapper cost is concentrated in \`${dominantModule}\`; verify whether SDK or persistence work there can be deferred, batched, or disabled for this workload.`] : []),
    '',
    '# Suggested next changes',
    ...(lowSignalTrace
      ? [
          '1. Re-record a tighter trace around one concrete user action so the hotspot set reflects real work instead of wrapper or idle time.',
          '2. After the tighter capture, target the highest-ranked non-wrapper hotspot or move it off the main thread if it is user-visible work.',
          '3. Measure after each targeted change instead of batching speculative refactors.',
        ]
      : [
          '1. Reduce the highest-ranked hotspot or move it off the main thread if it is user-visible work.',
          '2. Measure after each targeted change instead of batching speculative refactors.',
          '3. Keep the workload and selection identical when validating the next trace.',
        ]),
    '',
    '# Verification',
    'After making changes, rerun the same trace and compare against this baseline. Keep the workload and filters identical.',
    '',
  ].join('\n');

  if (prompt.length > input.budgetChars) {
    prompt = prompt.slice(0, Math.max(0, input.budgetChars - 4)).trimEnd() + '\n...';
  }

  return prompt;
}

function summarizeDominantModule(hotspots: TimeProfilerSummary['hotspots']): string | null {
  const moduleWeights = new Map<string, number>();

  for (const hotspot of hotspots) {
    const moduleName = hotspot.module?.trim();
    if (!moduleName) {
      continue;
    }
    moduleWeights.set(moduleName, (moduleWeights.get(moduleName) ?? 0) + hotspot.totalPct);
  }

  const top = [...moduleWeights.entries()].sort((left, right) => right[1] - left[1])[0];
  return top?.[0] ?? null;
}

export function buildComparisonPrompt(input: {
  comparison: TimeProfilerComparison;
  budgetChars: number;
}): string {
  const regressions = input.comparison.regressions.slice(0, 10);
  const improvements = input.comparison.improvements.slice(0, 10);

  let prompt = [
    '# Goal',
    'Reduce regressions while preserving improvements in the compared workload.',
    '',
    '# Context',
    `This prompt compares baseline \`${input.comparison.baseline.processSelection.name}\` against candidate \`${input.comparison.candidate.processSelection.name}\`.`,
    '',
    '# Evidence',
    ...regressions.map(
      (delta, index) =>
        `- Regression ${index + 1}: \`${delta.symbol}\` in \`${delta.module ?? 'unknown'}\` changed by ${delta.deltaTotalPct.toFixed(1)} percentage points.`,
    ),
    ...improvements.slice(0, 3).map(
      (delta, index) =>
        `- Improvement ${index + 1}: \`${delta.symbol}\` in \`${delta.module ?? 'unknown'}\` changed by ${delta.deltaTotalPct.toFixed(1)} percentage points.`,
    ),
    '',
    '# Hypotheses',
    ...(regressions.length > 0
      ? regressions.map((delta) => `- Investigate why \`${delta.symbol}\` gained ${delta.deltaTotalPct.toFixed(1)} percentage points.`)
      : ['- No large regressions were detected in the bounded hotspot set.']),
    '',
    '# Suggested next changes',
    '1. Keep the improvements that reduced cost in the candidate trace.',
    '2. Target the largest regression first and remeasure before broad refactors.',
    '3. If the same symbol appears in both regressions and unchanged hotspots, inspect call path changes rather than just leaf cost.',
    '',
    '# Verification',
    'Rerun the same workload and compare against both the baseline and the current candidate after each targeted fix.',
    '',
  ].join('\n');

  if (prompt.length > input.budgetChars) {
    prompt = prompt.slice(0, Math.max(0, input.budgetChars - 4)).trimEnd() + '\n...';
  }

  return prompt;
}

function goalLine(goal: 'latency' | 'cpu' | 'startup' | 'throughput' | 'generic'): string {
  switch (goal) {
    case 'latency':
      return 'Reduce latency in the selected workload.';
    case 'cpu':
      return 'Reduce CPU cost in the selected workload.';
    case 'startup':
      return 'Reduce startup cost in the selected workload.';
    case 'throughput':
      return 'Improve throughput in the selected workload.';
    case 'generic':
    default:
      return 'Reduce CPU / latency cost in the selected workload.';
  }
}
