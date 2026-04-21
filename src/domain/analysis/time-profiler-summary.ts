import type { Finding, Hotspot, ParsedSample, TimeProfilerSummary } from '../time-profiler.js';
import { ANALYSIS_THRESHOLDS } from '../../shared/constants/analysis.js';

type Aggregate = {
  frameKey: string;
  symbol: string;
  module: string | null;
  isSystem: boolean;
  selfWeightNs: number;
  totalWeightNs: number;
  threadWeights: Map<string, number>;
  callPaths: string[];
};

export function buildTimeProfilerSummary(input: {
  tracePath: string;
  runNumber: number;
  selectedProcessName: string;
  selectedProcessId: string | null;
  selectedProcessPath?: string | null;
  samples: ParsedSample[];
  notes: string[];
}): TimeProfilerSummary {
  const totalWeightNs = input.samples.reduce((sum, sample) => sum + (sample.weightNs ?? 1), 0);
  const threadSummaries = summarizeThreads(input.samples, totalWeightNs);
  const hotspotSummary = summarizeHotspots(input.samples, totalWeightNs, buildAppModuleHints(input.selectedProcessName, input.selectedProcessPath));
  const hotspots = hotspotSummary.hotspots;
  const notes = [...input.notes, 'System-library frames remain in the trace model for continuity, but hotspot ranking prefers app-owned frames and call paths are compressed.'];
  if (hotspotSummary.excludedWrapperCount > 0) {
    notes.push('Wrapper-style entrypoint frames were excluded from actionable hotspot ranking when more specific app-owned work was available.');
  }
  if (hotspotSummary.excludedNonAppCount > 0) {
    notes.push('Third-party and non-app modules were excluded from the primary hotspot list because app-binary symbols were available.');
  }

  return {
    metadata: {
      tracePath: input.tracePath,
      runNumber: input.runNumber,
      totalSamples: input.samples.length,
      totalWeightNs,
    },
    processSelection: {
      name: input.selectedProcessName,
      pid: input.selectedProcessId,
      reason: 'dominant non-system process from trace metadata',
    },
    threadSummaries,
    hotspots,
    intervalSummaries: [],
    findings: summarizeFindings(hotspots, threadSummaries, input.samples.length, hotspotSummary),
    notes,
  };
}

function summarizeHotspots(
  samples: ParsedSample[],
  totalWeightNs: number,
  appModuleHints: string[],
): { hotspots: Hotspot[]; excludedWrapperCount: number; excludedTopWrapperSymbol: string | null; excludedNonAppCount: number } {
  const aggregates = new Map<string, Aggregate>();

  for (const sample of samples) {
    const weight = sample.weightNs ?? 1;
    const orderedFrames = sample.frames.slice().sort((left, right) => left.index - right.index);
    const thread = normalizeThread(sample.threadName, sample.threadId);
    const callPath = compressCallPath(orderedFrames);

    orderedFrames.forEach((frame, index) => {
      const aggregate =
        aggregates.get(frame.canonicalKey) ??
        ({
          frameKey: frame.canonicalKey,
          symbol: frame.symbol,
          module: frame.module,
          isSystem: frame.isSystem,
          selfWeightNs: 0,
          totalWeightNs: 0,
          threadWeights: new Map<string, number>(),
          callPaths: [],
        } satisfies Aggregate);

      aggregate.totalWeightNs += weight;
      aggregate.threadWeights.set(thread, (aggregate.threadWeights.get(thread) ?? 0) + weight);

      if (index === 0) {
        aggregate.selfWeightNs += weight;
      }

      if (!aggregate.callPaths.includes(callPath) && aggregate.callPaths.length < 5) {
        aggregate.callPaths.push(callPath);
      }

      aggregates.set(frame.canonicalKey, aggregate);
    });
  }

  const ranked = [...aggregates.values()]
    .map((aggregate) => {
      const selfPct = totalWeightNs === 0 ? 0 : (aggregate.selfWeightNs / totalWeightNs) * 100;
      const totalPct = totalWeightNs === 0 ? 0 : (aggregate.totalWeightNs / totalWeightNs) * 100;
      return {
        score: totalPct * 0.65 + selfPct * 0.35,
        hotspot: {
          rank: 0,
          frameKey: aggregate.frameKey,
          symbol: aggregate.symbol,
          module: aggregate.module,
          selfWeightNs: aggregate.selfWeightNs,
          totalWeightNs: aggregate.totalWeightNs,
          selfPct,
          totalPct,
          isSystem: aggregate.isSystem,
          dominantThreads: [...aggregate.threadWeights.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, 3)
            .map(([thread, weightNs]) => ({
              thread,
              weightNs,
              pct: totalWeightNs === 0 ? 0 : (weightNs / totalWeightNs) * 100,
            })),
          exampleCallPaths: aggregate.callPaths,
          reasonCodes: summarizeReasonCodes(selfPct, totalPct, aggregate.isSystem, aggregate.threadWeights.has('main')),
        } satisfies Hotspot,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.hotspot.totalWeightNs !== left.hotspot.totalWeightNs) {
        return right.hotspot.totalWeightNs - left.hotspot.totalWeightNs;
      }
      if (right.hotspot.selfWeightNs !== left.hotspot.selfWeightNs) {
        return right.hotspot.selfWeightNs - left.hotspot.selfWeightNs;
      }
      return left.hotspot.frameKey.localeCompare(right.hotspot.frameKey);
    });

  const appOwned = ranked.filter((value) => !value.hotspot.isSystem);
  const actionable = appOwned.filter((value) => !isLikelyWrapperHotspot(value.hotspot));
  const appRelevant = actionable.filter((value) => isAppRelevantHotspot(value.hotspot, appModuleHints));
  const appNative = appRelevant.filter((value) => !isLikelyVendorSymbol(value.hotspot.symbol));
  const ordered =
    appNative.length > 0 ? appNative : appRelevant.length > 0 ? appRelevant : actionable.length > 0 ? actionable : appOwned.length > 0 ? appOwned : ranked;
  const excludedWrapperCount = actionable.length > 0 ? appOwned.length - actionable.length : 0;
  const excludedTopWrapperSymbol = actionable.length > 0 && appOwned[0] && isLikelyWrapperHotspot(appOwned[0].hotspot) ? appOwned[0].hotspot.symbol : null;
  const excludedNonAppCount = appRelevant.length > 0 ? actionable.length - appRelevant.length : 0;

  return {
    hotspots: ordered
      .slice(0, 15)
      .map((value, index) => ({
        ...value.hotspot,
        rank: index + 1,
      })),
    excludedWrapperCount,
    excludedTopWrapperSymbol,
    excludedNonAppCount,
  };
}

function summarizeThreads(samples: ParsedSample[], totalWeightNs: number): Array<{ thread: string; weightNs: number; pct: number }> {
  const weights = new Map<string, number>();

  for (const sample of samples) {
    const weight = sample.weightNs ?? 1;
    const thread = normalizeThread(sample.threadName, sample.threadId);
    weights.set(thread, (weights.get(thread) ?? 0) + weight);
  }

  return [...weights.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([thread, weightNs]) => ({
      thread,
      weightNs,
      pct: totalWeightNs === 0 ? 0 : (weightNs / totalWeightNs) * 100,
    }));
}

function summarizeFindings(
  hotspots: Hotspot[],
  threadSummaries: Array<{ thread: string; weightNs: number; pct: number }>,
  sampleCount: number,
  hotspotSummary: { excludedWrapperCount: number; excludedTopWrapperSymbol: string | null; excludedNonAppCount: number },
): Finding[] {
  const findings: Finding[] = [];
  const topHotspot = hotspots[0];
  const mainThread = threadSummaries.find((entry) => entry.thread === 'main');

  if (topHotspot && topHotspot.totalPct >= ANALYSIS_THRESHOLDS.dominantHotspotTotalPct) {
    findings.push({
      kind: 'dominant_hotspot',
      title: `Dominant hotspot: ${topHotspot.symbol}`,
      summary: `${topHotspot.totalPct.toFixed(1)}% of total sampled weight is concentrated here.`,
    });
  }

  if (mainThread && mainThread.pct >= ANALYSIS_THRESHOLDS.mainThreadPressurePct) {
    findings.push({
      kind: 'main_thread_pressure',
      title: 'Main thread pressure is high',
      summary: `Main thread activity represents ${mainThread.pct.toFixed(1)}% of selected sample weight.`,
    });
  }

  if (sampleCount < ANALYSIS_THRESHOLDS.sparseTraceSampleCount) {
    const wrapperContext = hotspotSummary.excludedTopWrapperSymbol
      ? ' Wrapper entrypoint frames were excluded from actionable ranking; rerun around a narrower user action for clearer attribution.'
      : '';
    findings.push({
      kind: 'sparse_trace_warning',
      title: 'Trace sample count is sparse',
      summary: `Only ${sampleCount} samples were available after filtering.${wrapperContext}`,
    });
  }

  return findings;
}

function isLikelyWrapperHotspot(hotspot: Pick<Hotspot, 'symbol' | 'module' | 'exampleCallPaths'>): boolean {
  const symbol = hotspot.symbol.trim();
  if (/^(__debug_main_executable_dylib_entry_point|UIApplicationMain|NSApplicationMain|wmain|main|start)$/i.test(symbol)) {
    return true;
  }
  if (symbol.includes('entry_point')) {
    return true;
  }
  return hotspot.exampleCallPaths.some((path) => path === `[system] -> ${hotspot.module ?? 'unknown'}::${hotspot.symbol} -> [system]`);
}

function isAppRelevantHotspot(hotspot: Pick<Hotspot, 'module'>, appModuleHints: string[]): boolean {
  const module = hotspot.module?.toLowerCase();
  if (!module) {
    return false;
  }

  return appModuleHints.some((hint) => module === hint || module.startsWith(`${hint}.`) || module.includes(hint));
}

function buildAppModuleHints(processName: string, processPath?: string | null): string[] {
  const hints = new Set<string>();
  const normalizedName = processName.trim().toLowerCase();
  if (normalizedName) {
    hints.add(normalizedName);
  }

  const executableName = processPath?.split('/').filter(Boolean).at(-1)?.trim().toLowerCase();
  if (executableName) {
    hints.add(executableName);
  }

  return [...hints];
}

function isLikelyVendorSymbol(symbol: string): boolean {
  const normalized = symbol.replace(/^[^A-Za-z]+/, '');
  return [
    /^(FIR|GUL|GTM|IBG|APM)[A-Z]/,
    /^plcrash/i,
    /^nanopb/i,
    /^grpc/i,
    /^Realm/i,
    /Crashlytics/i,
    /Firebase/i,
    /GoogleUtilities/i,
    /GoogleDataTransport/i,
    /BoringSSL/i,
  ].some((pattern) => pattern.test(normalized) || pattern.test(symbol));
}

function summarizeReasonCodes(selfPct: number, totalPct: number, isSystem: boolean, hasMainThreadWeight: boolean): string[] {
  const codes: string[] = [];
  if (selfPct >= 1) {
    codes.push('HIGH_SELF_TIME');
  }
  if (totalPct >= 2) {
    codes.push('HIGH_TOTAL_TIME');
  }
  if (hasMainThreadWeight) {
    codes.push('MAIN_THREAD_HEAVY');
  }
  if (!isSystem) {
    codes.push('APP_OWNED_ROOT');
  }
  if (codes.length === 0) {
    codes.push('SYSTEM_ONLY_FALLBACK');
  }
  return codes;
}

function normalizeThread(threadName: string | null, threadId: string | null): string {
  const candidate = threadName?.trim() || threadId || 'unknown-thread';
  if (candidate === 'Main Thread' || candidate === 'com.apple.main-thread' || candidate === 'main') {
    return 'main';
  }
  return candidate;
}

function compressCallPath(frames: ParsedSample['frames']): string {
  const tokens: string[] = [];

  for (const frame of frames) {
    const token = frame.isSystem ? '[system]' : `${frame.module ?? 'unknown'}::${frame.symbol}`;
    if (token !== tokens.at(-1)) {
      tokens.push(token);
    }
  }

  const deduped = tokens;
  if (deduped.length <= 12) {
    return deduped.join(' -> ');
  }
  return [...deduped.slice(0, 6), '…', ...deduped.slice(-5)].join(' -> ');
}
