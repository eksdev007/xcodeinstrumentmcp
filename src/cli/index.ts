import { Command } from 'commander';

import { executeDoctorCommand } from './commands/doctor.js';
import {
  executeDbListSnapshotsCommand,
  executeDbShowComparisonCommand,
  executeDbShowSnapshotCommand,
  executeDbStatsCommand,
  executeDbVacuumCommand,
} from './commands/db.js';
import { executeCompareCommand } from './commands/compare.js';
import { executeImportCommand } from './commands/import.js';
import { executeListCommand } from './commands/list.js';
import { executeMcpCommand } from './commands/mcp.js';
import { executePromptCommand } from './commands/prompt.js';
import { executeRecordCommand } from './commands/record.js';
import {
  executeSignpostApplyCommand,
  executeSignpostPlanCommand,
  executeSignpostRevertCommand,
  executeSignpostScanCommand,
  executeSignpostStatusCommand,
} from './commands/signpost.js';
import { executeSummarizeCommand } from './commands/summarize.js';
import { packageVersion } from '../shared/version.js';

const DEFAULT_FORMAT = 'markdown';

export async function runCli(argv: string[]): Promise<number> {
  const program = buildCli();

  try {
    await program.parseAsync(argv);
    return 0;
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      return 1;
    }

    console.error('Unknown CLI failure');
    return 1;
  }
}

export function buildCli(): Command {
  const program = new Command();

  program
    .name('xcodeinstrumentmcp')
    .description('Analyze Xcode Instruments traces with bounded CLI and MCP workflows.')
    .version(packageVersion)
    .showHelpAfterError();

  addDoctorCommand(program);
  addListCommand(program);
  addRecordCommand(program);
  addSummarizeCommand(program);
  addCompareCommand(program);
  addPromptCommand(program);
  addImportCommand(program);
  addDbCommand(program);
  addSignpostCommand(program);
  addMcpCommand(program);

  return program;
}

function addCommonOutputOptions(command: Command, overrides?: { includeOutput?: boolean }): Command {
  const includeOutput = overrides?.includeOutput ?? true;
  const configured = command
    .option('--json', 'Shorthand for --format json.')
    .option('--format <json|markdown|table>', 'Select the output format.', DEFAULT_FORMAT)
    .option('--quiet', 'Suppress non-essential output.')
    .option('--verbose', 'Enable debug-oriented output.');

  if (includeOutput) {
    configured.option('--output <path>', 'Write the rendered output to a file.');
  }

  return configured;
}

function addSourceSelectionOptions(command: Command): Command {
  return command
    .option('--input <path>', 'Analyze a local source artifact.')
    .option('--snapshot <id>', 'Reuse an existing normalized snapshot.');
}

function addInstrumentOption(command: Command): Command {
  return command.option(
    '--instrument <family>',
    'Select one of: time-profiler, allocations, leaks, hangs, network, processor-trace, energy-log, memory-graph.',
  );
}

function addDoctorCommand(program: Command): void {
  addCommonOutputOptions(program.command('doctor').description('Verify local Xcode, xctrace, Swift helper, and cache capabilities.')).action(
    executeDoctorCommand,
  );
}

function addListCommand(program: Command): void {
  const list = addCommonOutputOptions(
    program.command('list').description('List minimal xctrace-backed discovery surfaces.'),
  );

  list.command('templates').description('List available Xcode Instruments templates.').action(() =>
    executeListCommand('templates'),
  );
  list.command('devices').description('List connected or simulator devices known to xctrace.').action(() =>
    executeListCommand('devices'),
  );
  list.command('instruments').description('List Instruments provided by xctrace.').action(() =>
    executeListCommand('instruments'),
  );
}

function addRecordCommand(program: Command): void {
  const record = addCommonOutputOptions(
    addInstrumentOption(program.command('record').description('Record a new profiling artifact for a supported instrument family.')),
    { includeOutput: false },
  )
    .option('--template <nameOrPath>', 'Template name or custom template path.')
    .option('--device <nameOrUDID>', 'Target a specific device or simulator.')
    .requiredOption('--output <path>', 'Write the recorded artifact to this path.')
    .option('--time-limit <duration>', 'Stop automatically after the given duration.')
    .option('--manual-stop', 'Keep recording until interrupted with SIGINT.')
    .option('--run-name <name>', 'Attach a user-visible run name.')
    .option('--attach <pidOrProcessName>', 'Attach to an existing process.')
    .option('--launch <bundleIdOrCommand>', 'Launch a target process.')
    .option('--all-processes', 'Record all visible processes.')
    .option('--save-snapshot', 'Persist the recorded snapshot when the cache is enabled.', true)
    .option('--summarize', 'Analyze the recorded artifact immediately.')
    .option('--summary-format <json|markdown|table>', 'Render the immediate summary in the selected format.')
    .option('--no-prompt', 'Pass through --no-prompt to xctrace.');

  record.action(executeRecordCommand);
}

function addSummarizeCommand(program: Command): void {
  const summarize = addCommonOutputOptions(
    addInstrumentOption(
      addSourceSelectionOptions(program.command('summarize').description('Normalize and summarize a trace, HAR, or memgraph source.')),
    ),
  )
    .option('--run <number>', 'Select a specific run number.')
    .option('--process <nameOrPid>', 'Select a specific process.')
    .option('--focus-thread <main|id|name>', 'Focus reporting on a specific thread.')
    .option('--hide-system-libraries', 'Hide system-owned frames by default.', true)
    .option('--include-module <name>', 'Force-include a module.', collectRepeatable, [])
    .option('--exclude-module <name>', 'Exclude a module from ranking.', collectRepeatable, [])
    .option('--top-hotspots <n>', 'Maximum hotspots to render.', parseInteger, 15)
    .option('--top-callpaths <n>', 'Maximum example call paths per hotspot.', parseInteger, 5)
    .option('--max-intervals <n>', 'Maximum interval or signpost summaries to render.', parseInteger, 20);

  summarize.action(executeSummarizeCommand);
}

function addCompareCommand(program: Command): void {
  const compare = addCommonOutputOptions(
    addInstrumentOption(program.command('compare').description('Compare two snapshots or source artifacts using one instrument family.')),
  )
    .option('--baseline-input <path>', 'Baseline source path.')
    .option('--candidate-input <path>', 'Candidate source path.')
    .option('--baseline-snapshot <id>', 'Baseline snapshot identifier.')
    .option('--candidate-snapshot <id>', 'Candidate snapshot identifier.')
    .option('--process <nameOrPid>', 'Select a specific process.')
    .option('--focus-thread <main|id|name>', 'Focus reporting on a specific thread.')
    .option('--hide-system-libraries', 'Hide system-owned frames by default.', true)
    .option('--top-deltas <n>', 'Maximum delta entries to render.', parseInteger, 20)
    .option('--regression-threshold-pct <number>', 'Minimum percentage change to call out as a regression.', parseFloat)
    .option('--regression-threshold-ms <number>', 'Minimum millisecond change to call out as a regression.', parseFloat);

  compare.action(executeCompareCommand);
}

function addPromptCommand(program: Command): void {
  const prompt = addCommonOutputOptions(
    program.command('prompt').description('Generate a bounded optimization prompt from a snapshot or comparison.'),
  )
    .option('--snapshot <id>', 'Reuse an existing snapshot.')
    .option('--comparison <id>', 'Reuse an existing comparison.')
    .option('--trace <path>', 'Analyze a single source path before composing the prompt.')
    .option('--baseline <path>', 'Baseline source path for compare prompt generation.')
    .option('--candidate <path>', 'Candidate source path for compare prompt generation.')
    .option('--goal <latency|cpu|startup|throughput|generic>', 'Primary optimization goal.', 'generic')
    .option('--budget-chars <n>', 'Maximum character count.', parseInteger, 8000)
    .option('--size <small|medium|large>', 'Prompt pack size preset.');

  prompt.action(executePromptCommand);
}

function addImportCommand(program: Command): void {
  const importCommand = addCommonOutputOptions(
    addInstrumentOption(
      addSourceSelectionOptions(program.command('import').description('Import, normalize, analyze, and optionally persist a local source artifact.')),
    ),
  )
    .option('--persist', 'Persist the imported snapshot when caching is enabled.', true)
    .option(
      '--include-sensitive-network-fields',
      'Allow sensitive request metadata in network-family outputs when explicitly requested.',
      false,
    );

  importCommand.action(executeImportCommand);
}

function addDbCommand(program: Command): void {
  const db = addCommonOutputOptions(program.command('db').description('Inspect and maintain the local analysis cache.'));

  db.command('stats').description('Show cache counts and storage usage.').action(executeDbStatsCommand);
  db.command('list-snapshots').description('List stored snapshots.').action(executeDbListSnapshotsCommand);
  db.command('show-snapshot <id>').description('Show one stored snapshot.').action(executeDbShowSnapshotCommand);
  db.command('show-comparison <id>').description('Show one stored comparison.').action(executeDbShowComparisonCommand);
  db.command('vacuum').description('Run database vacuum maintenance.').action(executeDbVacuumCommand);
}

function addSignpostCommand(program: Command): void {
  const signpost = addCommonOutputOptions(
    program.command('signpost').description('Scan, plan, apply, revert, and inspect Swift-only signpost patches.'),
  );

  signpost
    .command('scan')
    .description('Scan a Swift project for signpost insertion candidates.')
    .requiredOption('--project-root <path>', 'Swift project root to scan.')
    .action(executeSignpostScanCommand);
  signpost
    .command('plan')
    .description('Build a signpost insertion plan from snapshot evidence.')
    .requiredOption('--project-root <path>', 'Swift project root to scan.')
    .requiredOption(
      '--strategy <top-hot-functions|top-app-functions|explicit-symbols|file-scope>',
      'Planning strategy.',
    )
    .option('--snapshot <id>', 'Source snapshot identifier.')
    .option('--symbol <symbol>', 'Explicit symbol to plan.', collectRepeatable, [])
    .option('--max-insertions <n>', 'Maximum insertions to propose.', parseInteger, 10)
    .option('--max-files-touched <n>', 'Maximum files to touch.', parseInteger, 8)
    .action(executeSignpostPlanCommand);
  signpost
    .command('apply')
    .description('Apply a stored signpost insertion plan.')
    .requiredOption('--plan <id>', 'Plan identifier.')
    .option('--subsystem <name>', 'OSLog subsystem.', 'xcodeinstrumentmcp')
    .option('--category <name>', 'OSLog category.', 'Performance')
    .option('--allow-low-confidence', 'Apply low-confidence matches.', false)
    .option('--best-effort', 'Apply files that validate and skip files that fail validation.', false)
    .action(executeSignpostApplyCommand);
  signpost
    .command('revert')
    .description('Revert a previously applied signpost patch.')
    .requiredOption('--patch <id>', 'Patch identifier.')
    .action(executeSignpostRevertCommand);
  signpost
    .command('status')
    .description('Inspect signpost patch state for a project.')
    .requiredOption('--project-root <path>', 'Swift project root to inspect.')
    .action(executeSignpostStatusCommand);
}

function addMcpCommand(program: Command): void {
  addCommonOutputOptions(
    program.command('mcp').description('Start the stdio MCP server for coding-agent workflows.'),
  ).action(executeMcpCommand);
}

function collectRepeatable(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Expected an integer, received "${value}".`);
  }

  return parsed;
}
