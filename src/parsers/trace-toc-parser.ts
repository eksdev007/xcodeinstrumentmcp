import { XMLParser } from 'fast-xml-parser';

import type { TraceProcess, TraceRun, TraceTable, TraceToc } from '../domain/time-profiler.js';

const parser = new XMLParser({
  attributeNamePrefix: '',
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

export function parseTraceToc(xml: string): TraceToc {
  const parsed = parser.parse(xml) as {
    'trace-toc': {
      run?: unknown;
    };
  };

  return {
    runs: toArray(parsed['trace-toc']?.run).map(parseRun),
  };
}

function parseRun(run: unknown): TraceRun {
  const value = asObject(run);
  return {
    runNumber: Number.parseInt(String(value.number ?? '0'), 10),
    processes: toArray(asObject(value.processes).process).map(parseProcess),
    tables: toArray(asObject(value.data).table).map(parseTable),
  };
}

function parseProcess(process: unknown): TraceProcess {
  const value = asObject(process);
  return {
    name: String(value.name ?? 'unknown'),
    pid: value.pid ? String(value.pid) : null,
    path: value.path ? String(value.path) : null,
  };
}

function parseTable(table: unknown): TraceTable {
  const value = asObject(table);
  const attributes: Record<string, string> = {};

  for (const [key, attribute] of Object.entries(value)) {
    attributes[key] = String(attribute);
  }

  return {
    schema: attributes.schema ?? 'unknown',
    attributes,
  };
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}
