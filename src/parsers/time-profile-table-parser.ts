import fs from 'node:fs';

import { SaxesParser } from 'saxes';

import type { ParsedSample } from '../domain/time-profiler.js';

type BinaryRef = {
  name: string | null;
  path: string | null;
};

type FrameRef = {
  symbol: string;
  module: string | null;
  binaryPath: string | null;
  rawAddress: string | null;
};

type ProcessRef = {
  processName: string | null;
  processId: string | null;
};

type ThreadRef = {
  threadName: string | null;
  threadId: string | null;
};

type RowState = {
  sampleTimeNs: number | null;
  threadName: string | null;
  threadId: string | null;
  processName: string | null;
  processId: string | null;
  weightNs: number | null;
  frames: FrameRef[];
};

export async function parseTimeProfileTable(filePath: string): Promise<ParsedSample[]> {
  const binaries = new Map<string, BinaryRef>();
  const frames = new Map<string, FrameRef>();
  const backtraces = new Map<string, FrameRef[]>();
  const processes = new Map<string, ProcessRef>();
  const threads = new Map<string, ThreadRef>();
  const samples: ParsedSample[] = [];

  let currentRow: RowState | null = null;
  let currentBacktrace: FrameRef[] | null = null;
  let currentFrame: FrameRef | null = null;
  let currentBinary: BinaryRef | null = null;
  let currentProcess: ProcessRef | null = null;
  let currentThread: ThreadRef | null = null;
  let currentTag: string | null = null;

  let currentBinaryId: string | null = null;
  let currentFrameId: string | null = null;
  let currentBacktraceId: string | null = null;
  let currentProcessId: string | null = null;
  let currentThreadId: string | null = null;

  const parser = new SaxesParser();

  parser.on('opentag', (node) => {
    currentTag = node.name;

    if (node.name === 'row') {
      currentRow = { sampleTimeNs: null, threadName: null, threadId: null, processName: null, processId: null, weightNs: null, frames: [] };
      return;
    }

    if (node.name === 'process') {
      if (node.attributes.ref && currentRow) {
        const reference = processes.get(String(node.attributes.ref));
        if (reference) {
          currentRow.processName = reference.processName;
          currentRow.processId = reference.processId;
        }
        return;
      }

      currentProcessId = node.attributes.id ? String(node.attributes.id) : null;
      currentProcess = {
        processName: typeof node.attributes.fmt === 'string' ? decodeXml(node.attributes.fmt).split(' (')[0] ?? null : null,
        processId: null,
      };
      return;
    }

    if (node.name === 'thread') {
      if (node.attributes.ref && currentRow) {
        const reference = threads.get(String(node.attributes.ref));
        if (reference) {
          currentRow.threadName = reference.threadName;
          currentRow.threadId = reference.threadId;
        }
        return;
      }

      currentThreadId = node.attributes.id ? String(node.attributes.id) : null;
      currentThread = {
        threadName: typeof node.attributes.fmt === 'string' ? decodeXml(node.attributes.fmt).split(' 0x')[0] ?? null : null,
        threadId: null,
      };
      return;
    }

    if (node.name === 'backtrace') {
      if (node.attributes.ref && currentRow) {
        currentRow.frames = (backtraces.get(String(node.attributes.ref)) ?? []).slice();
        return;
      }

      currentBacktraceId = node.attributes.id ? String(node.attributes.id) : null;
      currentBacktrace = [];
      return;
    }

    if (node.name === 'frame') {
      if (node.attributes.ref) {
        const reference = frames.get(String(node.attributes.ref));
        if (reference && currentBacktrace) {
          currentBacktrace.push(reference);
        }
        return;
      }

      currentFrameId = node.attributes.id ? String(node.attributes.id) : null;
      currentFrame = {
        symbol: typeof node.attributes.name === 'string' ? decodeXml(node.attributes.name) : 'unknown',
        module: null,
        binaryPath: null,
        rawAddress: typeof node.attributes.addr === 'string' ? node.attributes.addr : null,
      };
      return;
    }

    if (node.name === 'binary') {
      if (node.attributes.ref) {
        const reference = binaries.get(String(node.attributes.ref));
        if (reference && currentFrame) {
          currentFrame.module = reference.name;
          currentFrame.binaryPath = reference.path;
        }
        return;
      }

      currentBinaryId = node.attributes.id ? String(node.attributes.id) : null;
      currentBinary = {
        name: typeof node.attributes.name === 'string' ? decodeXml(node.attributes.name) : null,
        path: typeof node.attributes.path === 'string' ? decodeXml(node.attributes.path) : null,
      };
    }
  });

  parser.on('text', (text) => {
    const value = text.trim();
    if (value.length === 0 || currentRow === null) {
      return;
    }

    if (currentTag === 'sample-time') {
      currentRow.sampleTimeNs = Number.parseInt(value, 10);
    } else if (currentTag === 'weight') {
      currentRow.weightNs = Number.parseInt(value, 10);
    } else if (currentTag === 'pid' && currentProcess) {
      currentProcess.processId = value;
      currentRow.processId ??= value;
    } else if (currentTag === 'tid' && currentThread) {
      currentThread.threadId = value;
      currentRow.threadId ??= value;
    }
  });

  parser.on('closetag', (name) => {
    const tagName = typeof name === 'string' ? name : name.name;

    if (tagName === 'binary' && currentBinary && currentBinaryId) {
      binaries.set(currentBinaryId, currentBinary);
      if (currentFrame) {
        currentFrame.module = currentBinary.name;
        currentFrame.binaryPath = currentBinary.path;
      }
      currentBinary = null;
      currentBinaryId = null;
    } else if (tagName === 'frame' && currentFrame) {
      if (currentBacktrace) {
        currentBacktrace.push(currentFrame);
      }
      if (currentFrameId) {
        frames.set(currentFrameId, currentFrame);
      }
      currentFrame = null;
      currentFrameId = null;
    } else if (tagName === 'backtrace' && currentBacktrace) {
      if (currentBacktraceId) {
        backtraces.set(currentBacktraceId, currentBacktrace.slice());
      }
      if (currentRow && currentRow.frames.length === 0) {
        currentRow.frames = currentBacktrace.slice();
      }
      currentBacktrace = null;
      currentBacktraceId = null;
    } else if (tagName === 'process' && currentProcess) {
      if (currentProcessId) {
        processes.set(currentProcessId, currentProcess);
      }
      if (currentRow) {
        currentRow.processName ??= currentProcess.processName;
        currentRow.processId ??= currentProcess.processId;
      }
      currentProcess = null;
      currentProcessId = null;
    } else if (tagName === 'thread' && currentThread) {
      if (currentThreadId) {
        threads.set(currentThreadId, currentThread);
      }
      if (currentRow) {
        currentRow.threadName ??= currentThread.threadName;
        currentRow.threadId ??= currentThread.threadId;
      }
      currentThread = null;
      currentThreadId = null;
    } else if (tagName === 'row' && currentRow) {
      const orderedFrames = currentRow.frames.map((frame, index, allFrames) => ({
        index: allFrames.length - index - 1,
        symbol: frame.symbol,
        module: frame.module,
        binaryPath: frame.binaryPath,
        rawAddress: frame.rawAddress,
        canonicalKey: `${frame.module ?? 'unknown'}::${frame.symbol.trim().replace(/\s+/g, ' ')}`,
        isSystem: isSystemFrame(frame.module, frame.binaryPath),
      }));

      samples.push({
        sampleTimeNs: currentRow.sampleTimeNs,
        threadName: currentRow.threadName,
        threadId: currentRow.threadId,
        processName: currentRow.processName,
        processId: currentRow.processId,
        weightNs: currentRow.weightNs,
        frames: orderedFrames,
      });
      currentRow = null;
    }

    currentTag = null;
  });

  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath, 'utf8');
    stream.on('data', (chunk) => parser.write(chunk));
    stream.on('end', () => {
      parser.close();
      resolve();
    });
    stream.on('error', reject);
    parser.on('error', reject);
  });

  return samples;
}

function isSystemFrame(moduleName: string | null, binaryPath: string | null): boolean {
  const moduleValue = moduleName ?? '';
  const pathValue = binaryPath ?? '';
  return (
    pathValue.startsWith('/System/') ||
    pathValue.startsWith('/usr/') ||
    pathValue.includes('.simruntime/') ||
    moduleValue.startsWith('lib') ||
    moduleValue.startsWith('dyld') ||
    moduleValue.startsWith('Foundation') ||
    moduleValue.startsWith('Core')
  );
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"');
}
