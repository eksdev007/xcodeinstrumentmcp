import fs from 'node:fs/promises';
import path from 'node:path';

import type { GenericSummary, InstrumentFamily } from '../domain/analysis.js';
import { parseTraceRows } from '../parsers/xml-rows.js';
import { exportTableXml, exportTrackDetailXml } from '../infrastructure/xctrace-export.js';
import { parseTraceToc } from '../parsers/trace-toc-parser.js';
import { supportLevelForFamily } from './instrument-family.js';
import { exportTocXml } from '../infrastructure/xctrace-export.js';

export async function summarizeGenericFamily(input: {
  family: Exclude<InstrumentFamily, 'time-profiler'>;
  sourcePath: string;
  includeSensitiveNetworkFields?: boolean;
}): Promise<GenericSummary> {
  switch (input.family) {
    case 'allocations':
      return summarizeAllocations(input.sourcePath);
    case 'leaks':
      return summarizeLeaks(input.sourcePath);
    case 'hangs':
      return summarizeHangs(input.sourcePath);
    case 'network':
      return summarizeHar(input.sourcePath, input.includeSensitiveNetworkFields ?? false);
    case 'energy-log':
      return summarizeSimpleXmlFamily(input.sourcePath, 'energy-log', 'energy-impact', 'Energy impact summary');
    case 'processor-trace':
      return summarizeSimpleXmlFamily(input.sourcePath, 'processor-trace', 'execution-concentration', 'Processor trace summary');
    case 'memory-graph':
      return summarizeMemoryGraph(input.sourcePath);
  }
}

async function summarizeAllocations(sourcePath: string): Promise<GenericSummary> {
  const rows = sourcePath.endsWith('.trace')
    ? parseTraceRows(await exportTrackDetailXml(sourcePath, 1, 'Allocations', 'Statistics'))
    : parseTraceRows(await fs.readFile(sourcePath, 'utf8'));
  const filtered = rows.filter((row) => row.category && !row.category.includes('All '));
  const topRows = filtered
    .map((row) => ({
      category: row.category,
      persistentBytes: asNumber(row['persistent-bytes']),
      transientBytes: asNumber(row['transient-bytes']),
      totalBytes: asNumber(row['total-bytes']),
      countEvents: asNumber(row['count-events']),
    }))
    .sort((left, right) => right.persistentBytes - left.persistentBytes)
    .slice(0, 12);
  const totalPersistent = topRows.reduce((sum, row) => sum + row.persistentBytes, 0);
  const churnLeader = [...topRows].sort((left, right) => right.transientBytes - left.transientBytes)[0];
  const retainedLeader = topRows[0];
  return {
    family: 'allocations',
    supportLevel: supportLevelForFamily('allocations'),
    metadata: {
      sourcePath,
      sourceKind: sourcePath.endsWith('.trace') ? 'trace' : 'xml',
      runNumber: sourcePath.endsWith('.trace') ? 1 : null,
      processName: null,
      templateName: 'Allocations',
    },
    headline: 'Allocations summary',
    metrics: [
      { name: 'persistent-bytes', subject: 'top-categories', value: totalPersistent, unit: 'bytes' },
      { name: 'transient-churn-bytes', subject: churnLeader?.category ?? 'none', value: churnLeader?.transientBytes ?? 0, unit: 'bytes' },
      { name: 'allocation-events', subject: retainedLeader?.category ?? 'none', value: retainedLeader?.countEvents ?? 0, unit: 'count' },
    ],
    findings: [
      retainedLeader
        ? {
            kind: 'retained-growth',
            title: `Largest retained category: ${retainedLeader.category}`,
            summary: `${retainedLeader.persistentBytes} bytes remain live in the highest retained category.`,
            severity: retainedLeader.persistentBytes > 500_000 ? 'warning' : 'info',
            confidence: 'medium',
          }
        : emptyFinding('No allocation rows were exported.'),
      churnLeader
        ? {
            kind: 'allocation-churn',
            title: `Highest transient churn: ${churnLeader.category}`,
            summary: `${churnLeader.transientBytes} transient bytes and ${churnLeader.countEvents} allocation events were observed.`,
            severity: churnLeader.transientBytes > 1_000_000 ? 'warning' : 'info',
            confidence: 'medium',
          }
        : emptyFinding('No churn rows were exported.'),
    ],
    notes: [
      'Allocations findings are constrained to exported table semantics rather than heap-diff modeling.',
    ],
    sections: [
      {
        title: 'Top Categories',
        rows: topRows.map((row) => ({
          category: row.category,
          persistent_bytes: row.persistentBytes,
          transient_bytes: row.transientBytes,
          total_bytes: row.totalBytes,
          events: row.countEvents,
        })),
      },
    ],
    limitations: ['Call-tree allocation-site attribution is not emitted unless the current trace exports it cleanly.'],
    experimental: false,
  };
}

async function summarizeLeaks(sourcePath: string): Promise<GenericSummary> {
  const rows = sourcePath.endsWith('.trace')
    ? parseTraceRows(await exportTrackDetailXml(sourcePath, 1, 'Leaks', 'Leaks'))
    : parseTraceRows(await fs.readFile(sourcePath, 'utf8'));
  const leakRows = rows.map((row, index) => ({
    category: row.category ?? row.type ?? `Leak ${index + 1}`,
    size: asNumber(row.size ?? row.bytes ?? row['persistent-bytes']),
    responsibleCaller: row['responsible-caller'] ?? row.backtrace ?? row.stack ?? 'unknown',
  }));
  const likelyAppOwned = leakRows.filter((row) => !row.responsibleCaller.startsWith('/System'));
  return {
    family: 'leaks',
    supportLevel: supportLevelForFamily('leaks'),
    metadata: {
      sourcePath,
      sourceKind: sourcePath.endsWith('.trace') ? 'trace' : 'xml',
      runNumber: sourcePath.endsWith('.trace') ? 1 : null,
      processName: null,
      templateName: 'Leaks',
    },
    headline: 'Leaks summary',
    metrics: [{ name: 'leak-count', subject: 'trace', value: leakRows.length, unit: 'count' }],
    findings:
      leakRows.length === 0
        ? [
            {
              kind: 'no-leaks',
              title: 'No leak rows were exported',
              summary: 'The export did not contain confirmed leak rows. Treat this as absence of evidence, not proof of leak-free behavior.',
              severity: 'info',
              confidence: 'low',
            },
          ]
        : [
            {
              kind: 'app-owned-likely',
              title: `Leak candidates: ${likelyAppOwned.length}/${leakRows.length}`,
              summary: `${likelyAppOwned.length} exported leak rows appear app-owned or mixed-ownership based on the exported caller context.`,
              severity: likelyAppOwned.length > 0 ? 'warning' : 'info',
              confidence: 'medium',
            },
          ],
    notes: ['Leak summaries intentionally avoid byte-accurate leak delta claims unless explicit exported bytes are present.'],
    sections: [
      {
        title: 'Leak Rows',
        rows: leakRows.slice(0, 20).map((row) => ({
          category: row.category,
          bytes: row.size,
          responsible_caller: row.responsibleCaller,
        })),
      },
    ],
    limitations: ['Leaks compare support is limited to count/signature changes.'],
    experimental: false,
  };
}

async function summarizeHangs(sourcePath: string): Promise<GenericSummary> {
  const rows = sourcePath.endsWith('.trace')
    ? parseTraceRows(await exportTableXml(sourcePath, 1, 'potential-hangs'))
    : parseTraceRows(await fs.readFile(sourcePath, 'utf8'));
  const riskRows =
    sourcePath.endsWith('.trace') ? parseTraceRows(await exportTableXml(sourcePath, 1, 'hang-risks')) : [];
  const incidents = rows.map((row) => ({
    start: row.start ?? 'unknown',
    durationMs: Math.round(asNumber(row.duration) * 1000),
    type: row['hang-type'] ?? 'unknown',
    thread: row.thread ?? 'unknown',
    process: row.process ?? 'unknown',
  }));
  const worst = [...incidents].sort((left, right) => right.durationMs - left.durationMs)[0];
  return {
    family: 'hangs',
    supportLevel: supportLevelForFamily('hangs'),
    metadata: {
      sourcePath,
      sourceKind: sourcePath.endsWith('.trace') ? 'trace' : 'xml',
      runNumber: sourcePath.endsWith('.trace') ? 1 : null,
      processName: incidents[0]?.process ?? null,
      templateName: sourcePath.endsWith('.trace') ? 'Time Profiler' : null,
    },
    headline: 'Hang and stall summary',
    metrics: [
      { name: 'hang-count', subject: 'trace', value: incidents.length, unit: 'count' },
      { name: 'hang-risk-count', subject: 'trace', value: riskRows.length, unit: 'count' },
      { name: 'worst-hang-duration', subject: worst?.type ?? 'none', value: worst?.durationMs ?? 0, unit: 'ms' },
    ],
    findings:
      incidents.length === 0
        ? [
            {
              kind: 'no-hangs',
              title: 'No hang incidents were exported',
              summary: 'No potential hang rows were found in the supplied source.',
              severity: 'info',
              confidence: 'medium',
            },
          ]
        : [
            {
              kind: 'worst-hang',
              title: `Worst stall: ${worst?.type ?? 'unknown'}`,
              summary: `${worst?.durationMs ?? 0} ms on ${worst?.thread ?? 'unknown'}.`,
              severity: (worst?.durationMs ?? 0) >= 1000 ? 'warning' : 'info',
              confidence: 'medium',
            },
          ],
    notes: riskRows.length > 0 ? ['Hang risk diagnostics were exported alongside incident rows.'] : [],
    sections: [
      {
        title: 'Incidents',
        rows: incidents.slice(0, 20).map((incident) => ({
          start: incident.start,
          duration_ms: incident.durationMs,
          type: incident.type,
          thread: incident.thread,
        })),
      },
      {
        title: 'Risk Events',
        rows: riskRows.slice(0, 20).map((row) => ({
          time: row.time ?? '',
          severity: row.severity ?? '',
          event_type: row['event-type'] ?? '',
          thread: row.thread ?? '',
          message: row.message ?? '',
        })),
      },
    ],
    limitations: ['Busy-vs-blocked classification is limited to what the exported hang table exposes.'],
    experimental: false,
  };
}

async function summarizeHar(sourcePath: string, includeSensitiveFields: boolean): Promise<GenericSummary> {
  const parsed = JSON.parse(await fs.readFile(sourcePath, 'utf8')) as {
    log?: {
      entries?: Array<{
        request?: { method?: string; url?: string; headers?: Array<{ name: string; value: string }>; queryString?: Array<{ name: string; value: string }> };
        response?: { status?: number; content?: { size?: number } };
        time?: number;
      }>;
    };
  };
  const entries = parsed.log?.entries ?? [];
  const grouped = new Map<string, { count: number; totalTime: number; totalBytes: number; methods: Set<string>; statuses: Set<string> }>();

  for (const entry of entries) {
    const url = new URL(entry.request?.url ?? 'https://invalid.local/');
    const pathPattern = url.pathname.replace(/\/\d+/g, '/:id');
    const key = `${url.protocol}//${url.host}${pathPattern}`;
    const existing = grouped.get(key) ?? { count: 0, totalTime: 0, totalBytes: 0, methods: new Set(), statuses: new Set() };
    existing.count += 1;
    existing.totalTime += entry.time ?? 0;
    existing.totalBytes += entry.response?.content?.size ?? 0;
    if (entry.request?.method) {
      existing.methods.add(entry.request.method);
    }
    if (entry.response?.status !== undefined) {
      existing.statuses.add(String(Math.floor(entry.response.status / 100)) + 'xx');
    }
    grouped.set(key, existing);
  }

  const rows = [...grouped.entries()]
    .map(([endpoint, value]) => ({
      endpoint,
      count: value.count,
      avgLatencyMs: value.count === 0 ? 0 : Math.round(value.totalTime / value.count),
      transferredBytes: value.totalBytes,
      methods: [...value.methods].join(','),
      statuses: [...value.statuses].join(','),
    }))
    .sort((left, right) => right.avgLatencyMs - left.avgLatencyMs);
  const slowest = rows[0];
  const chatty = [...rows].sort((left, right) => right.count - left.count)[0];

  return {
    family: 'network',
    supportLevel: supportLevelForFamily('network'),
    metadata: {
      sourcePath,
      sourceKind: 'har',
      runNumber: null,
      processName: null,
      templateName: 'HAR import',
    },
    headline: 'Network summary',
    metrics: [
      { name: 'request-count', subject: 'trace', value: entries.length, unit: 'count' },
      { name: 'slowest-endpoint-latency', subject: slowest?.endpoint ?? 'none', value: slowest?.avgLatencyMs ?? 0, unit: 'ms' },
      { name: 'largest-endpoint-transfer', subject: slowest?.endpoint ?? 'none', value: slowest?.transferredBytes ?? 0, unit: 'bytes' },
    ],
    findings: [
      slowest
        ? {
            kind: 'tail-latency',
            title: `Slowest endpoint group: ${slowest.endpoint}`,
            summary: `Average latency is ${slowest.avgLatencyMs} ms with ${slowest.count} requests.`,
            severity: slowest.avgLatencyMs > 800 ? 'warning' : 'info',
            confidence: 'medium',
          }
        : emptyFinding('No HAR entries were loaded.'),
      chatty
        ? {
            kind: 'chatty-endpoint',
            title: `Chattiest endpoint group: ${chatty.endpoint}`,
            summary: `${chatty.count} requests were grouped under this endpoint pattern.`,
            severity: chatty.count >= 10 ? 'warning' : 'info',
            confidence: 'medium',
          }
        : emptyFinding('No endpoint groups were created.'),
    ],
    notes: includeSensitiveFields
      ? ['Sensitive request fields were explicitly allowed for this import.']
      : ['Headers, query values, and bodies remain redacted by default.'],
    sections: [
      {
        title: 'Endpoint Groups',
        rows: rows.slice(0, 20).map((row) => ({
          endpoint: row.endpoint,
          count: row.count,
          avg_latency_ms: row.avgLatencyMs,
          transferred_bytes: row.transferredBytes,
          methods: row.methods,
          statuses: row.statuses,
        })),
      },
    ],
    limitations: ['Default network outputs exclude headers, bodies, auth, and sensitive query values.'],
    experimental: false,
  };
}

async function summarizeSimpleXmlFamily(
  sourcePath: string,
  family: 'energy-log' | 'processor-trace',
  metricName: string,
  headline: string,
): Promise<GenericSummary> {
  const rows = parseTraceRows(await fs.readFile(sourcePath, 'utf8'));
  const normalized = rows.map((row, index) => ({
    subject: row.subject ?? row.category ?? row.symbol ?? `row-${index + 1}`,
    value: asNumber(row.value ?? row['impact-score'] ?? row['sample-count'] ?? row.count ?? row.duration ?? '0'),
    unit: row.unit ?? (family === 'energy-log' ? 'score' : 'samples'),
    detail: row.detail ?? row.thread ?? row.module ?? '',
  }));
  const top = [...normalized].sort((left, right) => right.value - left.value)[0];
  return {
    family,
    supportLevel: supportLevelForFamily(family),
    metadata: {
      sourcePath,
      sourceKind: 'xml',
      runNumber: null,
      processName: null,
      templateName: family === 'energy-log' ? 'Power Profiler' : 'Processor Trace',
    },
    headline,
    metrics: normalized.slice(0, 10).map((row) => ({ name: metricName, subject: row.subject, value: row.value, unit: row.unit })),
    findings: top
      ? [
          {
            kind: `${family}-leader`,
            title: `Top ${family} region: ${top.subject}`,
            summary: `${top.value} ${top.unit} were attributed to the top exported region.`,
            severity: 'info',
            confidence: family === 'processor-trace' ? 'low' : 'medium',
          },
        ]
      : [emptyFinding(`No ${family} rows were exported.`)],
    notes: family === 'processor-trace' ? ['Processor Trace remains experimental and capability-gated.'] : [],
    sections: [
      {
        title: 'Exported Rows',
        rows: normalized.slice(0, 20).map((row) => ({
          subject: row.subject,
          value: row.value,
          unit: row.unit,
          detail: row.detail,
        })),
      },
    ],
    limitations: [
      family === 'processor-trace'
        ? 'Processor Trace values are not numerically comparable to Time Profiler sample counts.'
        : 'Energy summaries do not claim exact joule precision.',
    ],
    experimental: family === 'processor-trace',
  };
}

async function summarizeMemoryGraph(sourcePath: string): Promise<GenericSummary> {
  const parsed = JSON.parse(await fs.readFile(sourcePath, 'utf8')) as {
    roots?: Array<{ type: string; retainedCount: number; chain: string[] }>;
    cycles?: Array<{ types: string[]; count: number }>;
  };
  const roots = parsed.roots ?? [];
  const cycles = parsed.cycles ?? [];
  return {
    family: 'memory-graph',
    supportLevel: supportLevelForFamily('memory-graph'),
    metadata: {
      sourcePath,
      sourceKind: 'memgraph',
      runNumber: null,
      processName: null,
      templateName: null,
    },
    headline: 'Memory graph summary',
    metrics: [
      { name: 'root-count', subject: 'trace', value: roots.length, unit: 'count' },
      { name: 'retain-cycle-count', subject: 'trace', value: cycles.length, unit: 'count' },
    ],
    findings: [
      cycles.length > 0
        ? {
            kind: 'retain-cycles',
            title: `Retain cycle candidates: ${cycles.length}`,
            summary: 'The imported memory graph contains probable retain-cycle clusters.',
            severity: 'warning',
            confidence: 'medium',
          }
        : emptyFinding('No retain cycles were found in the imported memory graph fixture.'),
    ],
    notes: ['Memory graph compare support is intentionally limited to high-level root and cycle counts.'],
    sections: [
      {
        title: 'Root Objects',
        rows: roots.slice(0, 20).map((root) => ({
          type: root.type,
          retained_count: root.retainedCount,
          chain: root.chain.join(' -> '),
        })),
      },
      {
        title: 'Cycle Candidates',
        rows: cycles.slice(0, 20).map((cycle) => ({
          types: cycle.types.join(' -> '),
          count: cycle.count,
        })),
      },
    ],
    limitations: ['Ownership chains are intentionally shallow and summary-oriented.'],
    experimental: false,
  };
}

function asNumber(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  return Number.parseFloat(value.replaceAll(',', '').replace(' KiB', ''));
}

function emptyFinding(summary: string) {
  return {
    kind: 'empty',
    title: 'No exported rows',
    summary,
    severity: 'info',
    confidence: 'low',
  } as const;
}
