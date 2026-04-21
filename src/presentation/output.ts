type OutputSection = {
  title: string;
  lines: string[];
};

type OutputEnvelope = {
  format: 'markdown' | 'table';
  title: string;
  intro?: string;
  sections: OutputSection[];
};

export function formatOutput(envelope: OutputEnvelope): string {
  if (envelope.format === 'table') {
    return toTable(envelope);
  }

  return toMarkdown(envelope);
}

function toMarkdown(envelope: OutputEnvelope): string {
  const lines: string[] = [`# ${envelope.title}`];

  if (envelope.intro) {
    lines.push('', envelope.intro);
  }

  for (const section of envelope.sections) {
    lines.push('', `## ${section.title}`);
    lines.push(...section.lines.map((line) => `- ${line}`));
  }

  return `${lines.join('\n')}\n`;
}

function toTable(envelope: OutputEnvelope): string {
  const lines: string[] = [envelope.title];

  if (envelope.intro) {
    lines.push(envelope.intro);
  }

  for (const section of envelope.sections) {
    lines.push('');
    lines.push(`[${section.title}]`);
    lines.push(...section.lines);
  }

  return `${lines.join('\n')}\n`;
}
