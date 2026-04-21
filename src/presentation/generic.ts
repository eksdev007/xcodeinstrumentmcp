import type { GenericComparison, GenericSummary } from '../domain/analysis.js';

export function renderGenericSummary(summary: GenericSummary, format: 'json' | 'markdown' | 'table'): string {
  if (format === 'json') {
    return `${JSON.stringify(summary, null, 2)}\n`;
  }

  const lines: string[] = [];
  const heading = format === 'markdown' ? `# ${summary.headline}` : summary.headline;
  lines.push(heading);

  const addSection = (title: string, content: string[]) => {
    if (format === 'markdown') {
      lines.push(`## ${title}`);
    } else {
      lines.push(`[${title}]`);
    }
    lines.push(...content, '');
  };

  addSection('Summary', [
    `Family: ${summary.family}`,
    `Support: ${summary.supportLevel}`,
    `Source: ${summary.metadata.sourcePath}`,
  ]);

  addSection(
    'Metrics',
    summary.metrics.length === 0
      ? ['None']
      : summary.metrics.map((metric) => `${metric.name} | ${metric.subject} | ${metric.value} ${metric.unit}`),
  );

  addSection(
    'Findings',
    summary.findings.length === 0
      ? ['No findings generated.']
      : summary.findings.map((finding) => `${finding.title}: ${finding.summary}`),
  );

  for (const section of summary.sections) {
    addSection(
      section.title,
      section.rows.length === 0 ? ['None'] : section.rows.map((row) => Object.entries(row).map(([k, v]) => `${k}=${v}`).join(' | ')),
    );
  }

  addSection('Notes', summary.notes.length === 0 ? ['None.'] : summary.notes);
  addSection('Limitations', summary.limitations.length === 0 ? ['None.'] : summary.limitations);

  return `${lines.join('\n')}\n`;
}

export function renderGenericComparison(comparison: GenericComparison, format: 'json' | 'markdown' | 'table'): string {
  if (format === 'json') {
    return `${JSON.stringify(comparison, null, 2)}\n`;
  }

  const lines: string[] = [];
  lines.push(format === 'markdown' ? `# ${comparison.headline}` : comparison.headline);
  lines.push(format === 'markdown' ? '## Summary' : '[Summary]');
  lines.push(`Family: ${comparison.family}`);
  lines.push(`Comparable: ${comparison.comparable}`);
  lines.push(`Confidence: ${comparison.confidence.toFixed(2)}`);
  lines.push('');

  const renderBucket = (title: string, values: typeof comparison.regressions) => {
    lines.push(format === 'markdown' ? `## ${title}` : `[${title}]`);
    if (values.length === 0) {
      lines.push('None');
    } else {
      for (const value of values) {
        lines.push(
          `${value.metric} | ${value.subject} | baseline=${value.baselineValue} ${value.unit} | candidate=${value.candidateValue} ${value.unit} | delta=${value.deltaValue} ${value.unit}`,
        );
      }
    }
    lines.push('');
  };

  renderBucket('Regressions', comparison.regressions);
  renderBucket('Improvements', comparison.improvements);
  renderBucket('Unchanged', comparison.unchanged);

  lines.push(format === 'markdown' ? '## Compatibility Notes' : '[Compatibility Notes]');
  lines.push(...(comparison.compatibilityNotes.length === 0 ? ['None'] : comparison.compatibilityNotes));

  return `${lines.join('\n')}\n`;
}
