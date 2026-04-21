#!/usr/bin/env node

import { runCli } from './cli/index.js';

const exitCode = await runCli(process.argv);

if (exitCode !== 0) {
  process.exitCode = exitCode;
}
