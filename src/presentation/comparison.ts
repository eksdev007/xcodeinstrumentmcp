import type { TimeProfilerComparison } from '../domain/comparison.js';

export function renderTimeProfilerComparison(
  comparison: TimeProfilerComparison,
  format: 'json' | 'markdown' | 'table',
): string {
  if (format === 'json') {
    return `${JSON.stringify(comparison, null, 2)}\n`;
  }

  if (format === 'table') {
    return renderTable(comparison);
  }

  return renderMarkdown(comparison);
}

function renderMarkdown(comparison: TimeProfilerComparison): string {
  const lines: string[] = ['# Trace Comparison', '## Selection'];
  lines.push(`- Baseline process: ${comparison.baseline.processSelection.name}`);
  lines.push(`- Candidate process: ${comparison.candidate.processSelection.name}`);
  lines.push('', '## Confidence');
  lines.push(`- ${comparison.confidence.toFixed(2)}`);
  lines.push('', '## Regressions');
  lines.push(...renderDeltaList(comparison.regressions));
  lines.push('', '## Improvements');
  lines.push(...renderDeltaList(comparison.improvements));
  lines.push('', '## Unchanged Major Hotspots');
  lines.push(...renderDeltaList(comparison.unchangedTopHotspots));
  lines.push('', '## Comparability Notes');
  if (comparison.comparabilityNotes.length === 0) {
    lines.push('- None.');
  } else {
    lines.push(...comparison.comparabilityNotes.map((note) => `- ${note}`));
  }
  return `${lines.join('\n')}\n`;
}

function renderTable(comparison: TimeProfilerComparison): string {
  const lines: string[] = ['Trace Comparison', '[Selection]'];
  lines.push(`Baseline: ${comparison.baseline.processSelection.name}`);
  lines.push(`Candidate: ${comparison.candidate.processSelection.name}`);
  lines.push('', '[Confidence]', comparison.confidence.toFixed(2), '', '[Regressions]');
  lines.push(...renderDeltaList(comparison.regressions).map((line) => line.replace(/^- /, '')));
  lines.push('', '[Improvements]');
  lines.push(...renderDeltaList(comparison.improvements).map((line) => line.replace(/^- /, '')));
  lines.push('', '[Unchanged Major Hotspots]');
  lines.push(...renderDeltaList(comparison.unchangedTopHotspots).map((line) => line.replace(/^- /, '')));
  lines.push('', '[Comparability Notes]');
  lines.push(comparison.comparabilityNotes.length === 0 ? 'None' : comparison.comparabilityNotes.join(' | '));
  return `${lines.join('\n')}\n`;
}

function renderDeltaList(items: TimeProfilerComparison['regressions']): string[] {
  if (items.length === 0) {
    return ['- None.'];
  }
  return items.map(
    (item) =>
      `- \`${item.symbol}\` (${item.module ?? 'unknown'}) deltaTotal=${item.deltaTotalPct.toFixed(1)}pp deltaSelf=${item.deltaSelfPct.toFixed(1)}pp`,
  );
}
