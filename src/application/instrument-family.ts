import path from 'node:path';

import type { InstrumentFamily, SupportLevel } from '../domain/analysis.js';

export function isSupportedInstrumentFamily(value: string): value is InstrumentFamily {
  return (
    value === 'time-profiler' ||
    value === 'allocations' ||
    value === 'leaks' ||
    value === 'hangs' ||
    value === 'network' ||
    value === 'processor-trace' ||
    value === 'energy-log' ||
    value === 'memory-graph'
  );
}

export function defaultTemplateForFamily(family: InstrumentFamily): string | null {
  switch (family) {
    case 'time-profiler':
      return 'Time Profiler';
    case 'allocations':
      return 'Allocations';
    case 'leaks':
      return 'Leaks';
    case 'hangs':
      return 'Time Profiler';
    case 'network':
      return 'Network';
    case 'processor-trace':
      return 'Processor Trace';
    case 'energy-log':
      return 'Power Profiler';
    case 'memory-graph':
      return null;
  }
}

export function supportLevelForFamily(family: InstrumentFamily): SupportLevel {
  switch (family) {
    case 'time-profiler':
    case 'allocations':
    case 'hangs':
    case 'network':
      return 'first-class';
    case 'processor-trace':
      return 'experimental';
    case 'leaks':
    case 'energy-log':
    case 'memory-graph':
      return 'summary';
  }
}

export function inferFamilyFromPath(inputPath: string): InstrumentFamily | null {
  const ext = path.extname(inputPath).toLowerCase();
  const basename = path.basename(inputPath).toLowerCase();

  if (ext === '.har') {
    return 'network';
  }
  if (ext === '.memgraph') {
    return 'memory-graph';
  }
  if (basename.includes('alloc')) {
    return 'allocations';
  }
  if (basename.includes('hang')) {
    return 'hangs';
  }
  if (basename.includes('leak')) {
    return 'leaks';
  }
  if (basename.includes('network')) {
    return 'network';
  }
  if (basename.includes('energy') || basename.includes('power')) {
    return 'energy-log';
  }
  if (basename.includes('processor') || basename.includes('ptrace')) {
    return 'processor-trace';
  }
  if (ext === '.trace' || ext === '.zip') {
    return 'time-profiler';
  }
  return null;
}
