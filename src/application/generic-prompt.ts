import type { GenericComparison, GenericSummary } from '../domain/analysis.js';

export function buildGenericSummaryPrompt(input: {
  summary: GenericSummary;
  goal: string;
  budgetChars: number;
}): string {
  const lines: string[] = [
    `Optimize this ${input.summary.family} result for goal: ${input.goal}.`,
    `Headline: ${input.summary.headline}`,
  ];

  for (const finding of input.summary.findings.slice(0, 6)) {
    lines.push(`Finding: ${finding.title} - ${finding.summary}`);
  }
  for (const note of input.summary.notes.slice(0, 4)) {
    lines.push(`Note: ${note}`);
  }
  for (const limitation of input.summary.limitations.slice(0, 3)) {
    lines.push(`Limit: ${limitation}`);
  }

  return trimPrompt(lines.join('\n'), input.budgetChars);
}

export function buildGenericComparisonPrompt(input: {
  comparison: GenericComparison;
  budgetChars: number;
}): string {
  const lines: string[] = [`Analyze this ${input.comparison.family} comparison.`];
  for (const delta of input.comparison.regressions.slice(0, 6)) {
    lines.push(`Regression: ${delta.metric} ${delta.subject} changed by ${delta.deltaValue} ${delta.unit}`);
  }
  for (const delta of input.comparison.improvements.slice(0, 4)) {
    lines.push(`Improvement: ${delta.metric} ${delta.subject} changed by ${delta.deltaValue} ${delta.unit}`);
  }
  for (const note of input.comparison.compatibilityNotes.slice(0, 4)) {
    lines.push(`Comparability note: ${note}`);
  }
  return trimPrompt(lines.join('\n'), input.budgetChars);
}

function trimPrompt(text: string, budgetChars: number): string {
  if (text.length <= budgetChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, budgetChars - 1)).trimEnd()}…`;
}
