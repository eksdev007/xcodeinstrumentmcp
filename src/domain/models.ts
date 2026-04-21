export type CapabilityCheck = {
  name: string;
  ok: boolean;
  details: string;
};

export type CapabilityReport = {
  ok: boolean;
  nodeVersion: string;
  platform: NodeJS.Platform;
  xctracePath: string | null;
  xctraceVersionRaw: string | null;
  checks: CapabilityCheck[];
  templates: string[];
  swiftHelperPresent: boolean;
  databasePathWritable: boolean;
};
