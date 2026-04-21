import type { TimeProfilerSummary } from '../domain/time-profiler.js';

export function renderTimeProfilerSummary(summary: TimeProfilerSummary, format: 'json' | 'markdown' | 'table'): string {
  if (format === 'json') {
    return `${JSON.stringify(summary, null, 2)}\n`;
  }
  if (format === 'table') {
    return renderTable(summary);
  }
  return renderMarkdown(summary);
}

function renderMarkdown(summary: TimeProfilerSummary): string {
  const lines: string[] = ['# Trace Summary', '## Selection'];
  lines.push(`- Process: ${summary.processSelection.name}`);
  lines.push(`- Run: ${summary.metadata.runNumber}`);
  lines.push(`- Samples: ${summary.metadata.totalSamples}`);
  lines.push('', '## Top Hotspots');
  for (const hotspot of summary.hotspots) {
    lines.push(
      `- ${hotspot.rank}. ${hotspot.symbol} (${hotspot.module ?? 'unknown'}) self=${hotspot.selfPct.toFixed(1)}% total=${hotspot.totalPct.toFixed(1)}%`,
    );
    if (hotspot.exampleCallPaths[0]) {
      lines.push(`  path: ${hotspot.exampleCallPaths[0]}`);
    }
  }
  lines.push('', '## Thread Breakdown');
  for (const thread of summary.threadSummaries) {
    lines.push(`- ${thread.thread}: ${thread.pct.toFixed(1)}%`);
  }
  lines.push('', '## Intervals');
  lines.push(summary.intervalSummaries.length === 0 ? '- No interval summaries available.' : '- Interval summaries present.');
  lines.push('', '## Findings');
  if (summary.findings.length === 0) {
    lines.push('- No findings generated.');
  } else {
    for (const finding of summary.findings) {
      lines.push(`- ${finding.title}: ${finding.summary}`);
    }
  }
  lines.push('', '## Notes');
  if (summary.notes.length === 0) {
    lines.push('- None.');
  } else {
    for (const note of summary.notes) {
      lines.push(`- ${note}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function renderTable(summary: TimeProfilerSummary): string {
  const lines: string[] = ['Trace Summary', '[Selection]'];
  lines.push(`Process: ${summary.processSelection.name}`);
  lines.push(`Run: ${summary.metadata.runNumber}`);
  lines.push(`Samples: ${summary.metadata.totalSamples}`);
  lines.push('', '[Top Hotspots]');
  for (const hotspot of summary.hotspots) {
    lines.push(
      `${hotspot.rank}. ${hotspot.symbol} | ${hotspot.module ?? 'unknown'} | self ${hotspot.selfPct.toFixed(1)}% | total ${hotspot.totalPct.toFixed(1)}%`,
    );
    if (hotspot.exampleCallPaths[0]) {
      lines.push(`path: ${hotspot.exampleCallPaths[0]}`);
    }
  }
  lines.push('', '[Thread Breakdown]');
  for (const thread of summary.threadSummaries) {
    lines.push(`${thread.thread} | ${thread.pct.toFixed(1)}%`);
  }
  lines.push('', '[Intervals]', 'None', '', '[Findings]');
  lines.push(summary.findings.length === 0 ? 'None' : summary.findings.map((finding) => finding.title).join(' | '));
  lines.push('', '[Notes]');
  lines.push(summary.notes.length === 0 ? 'None' : summary.notes.join(' | '));
  return `${lines.join('\n')}\n`;
}
