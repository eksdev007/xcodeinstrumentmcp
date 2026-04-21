import os from 'node:os';
import path from 'node:path';

import packageJson from '../../package.json' with { type: 'json' };

export const packageVersion = packageJson.version;

export const defaultCachePath = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'xcodeinstrumentmcp',
  'cache.db',
);
