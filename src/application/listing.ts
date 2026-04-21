import { runXctrace } from '../infrastructure/xctrace.js';

type DiscoveryKind = 'templates' | 'devices' | 'instruments';

export type DiscoveryDevice = {
  name: string;
  udid: string;
  kind: 'device' | 'simulator';
  runtime?: string;
  selector: string;
};

export async function listDiscoverySurface(kind: DiscoveryKind): Promise<{ items: string[] }> {
  const args = kind === 'instruments' ? ['list', 'instruments'] : ['list', kind];
  const raw = await runXctrace(args);

  return {
    items: raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('==')),
  };
}

export async function listDiscoveryDevices(): Promise<{ devices: DiscoveryDevice[] }> {
  const raw = await runXctrace(['list', 'devices']);

  return {
    devices: raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('=='))
      .map(parseDiscoveryDevice)
      .filter((device): device is DiscoveryDevice => device !== null),
  };
}

export function normalizeDeviceSelector(selector?: string): string | undefined {
  if (!selector) {
    return selector;
  }

  const parsed = parseDiscoveryDevice(selector);
  if (parsed) {
    return parsed.udid;
  }

  const match = selector.match(/\(([0-9A-F-]{8,})\)\s*$/i);
  return match?.[1] ?? selector;
}

function parseDiscoveryDevice(line: string): DiscoveryDevice | null {
  const simulatorMatch = line.match(/^(.*) Simulator \(([^()]+)\) \(([0-9A-F-]+)\)$/i);
  if (simulatorMatch) {
    const [, name, runtime, udid] = simulatorMatch;
    return {
      name: name.trim(),
      runtime: runtime.trim(),
      udid,
      kind: 'simulator',
      selector: udid,
    };
  }

  const deviceMatch = line.match(/^(.*) \(([0-9A-F-]+)\)$/i);
  if (deviceMatch) {
    const [, name, udid] = deviceMatch;
    return {
      name: name.trim(),
      udid,
      kind: 'device',
      selector: udid,
    };
  }

  return null;
}
