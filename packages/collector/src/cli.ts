#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { collectProfile, type CollectOptions } from './collect.js';
import { writeShareSheet, formatShareSummary } from './shareCommand.js';
import { DEFAULT_SHARE_HANDLE, SHARE_NAME_MAX_LENGTH, validateShareName } from './shareFormat.js';
import { formatSummary } from './summary.js';

const DEFAULT_OUT = 'harness-profile.json';
const DEFAULT_SHARE_OUT = 'harness-sheet.html';
const USAGE = `사용법: harness-craft [scan] [--out <file>] [--json] [--no-usage] [--home <dir>]
       harness-craft share [--out <file>] [--name <이름>] [--hide <glob>]... [--descriptions] [--no-usage] [--home <dir>]

scan (기본) — 설정과 사용 기록을 읽어 harness-profile.json 을 만든다
  --out <file>      저장 위치 (기본 ./${DEFAULT_OUT})
  --json            JSON 을 stdout 으로만 내보내고 파일은 쓰지 않음

share — 혼자 열리는 캐릭터 시트 HTML 한 장을 만든다
  --out <file>      저장 위치 (기본 ./${DEFAULT_SHARE_OUT})
  --name <이름>     시트에 보일 이름(닉네임). 한글 가능, ${SHARE_NAME_MAX_LENGTH}자까지 (기본 ${DEFAULT_SHARE_HANDLE})
  --hide <glob>     이름이 맞는 MCP·스킬·에이전트·플러그인·명령·훅을 파일에서 뺌 (대소문자 무시, * 가능, 여러 번)
  --descriptions    설명을 파일에 넣음 (기본은 뺌)

공통
  --no-usage        대화 기록 집계를 건너뜀 (usage 는 null)
  --home <dir>      홈 디렉터리 대신 쓸 경로 (테스트·디버그용). 주면 $CODEX_HOME 대신 <dir>/.codex,
                    $PI_CODING_AGENT_DIR 대신 <dir>/.pi/agent 를 읽고 $PI_CODING_AGENT_SESSION_DIR 는 무시함

Codex 설정은 $CODEX_HOME (없으면 ~/.codex) 에서 읽는다.
Pi 설정은 $PI_CODING_AGENT_DIR (없으면 ~/.pi/agent) 에서, 세션은 $PI_CODING_AGENT_SESSION_DIR 가 있으면 거기서도 읽는다.
`;

type CommonOptions = { usage: boolean; home: string; codexHome: string; piAgentDir: string; piSessionDir?: string };
type ScanOptions = CommonOptions & { command: 'scan'; out: string; json: boolean };
type ShareCliOptions = CommonOptions & { command: 'share'; out: string; handle: string; hide: string[]; descriptions: boolean };
type CliOptions = ScanOptions | ShareCliOptions;

class UsageError extends Error {}

const SCAN_ONLY = ['json'] as const;
const SHARE_ONLY = ['name', 'handle', 'hide', 'descriptions'] as const;

function parseCli(argv: readonly string[]): CliOptions | 'help' {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      out: { type: 'string' },
      json: { type: 'boolean' },
      'no-usage': { type: 'boolean', default: false },
      home: { type: 'string' },
      name: { type: 'string' },
      // Old spelling of --name, kept working but no longer documented.
      handle: { type: 'string' },
      hide: { type: 'string', multiple: true },
      descriptions: { type: 'boolean' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) return 'help';
  const command = positionals[0] ?? 'scan';
  if (positionals.length > 1 || (command !== 'scan' && command !== 'share')) {
    throw new UsageError(`알 수 없는 명령: ${positionals.join(' ')}`);
  }
  const foreign = (command === 'scan' ? SHARE_ONLY : SCAN_ONLY).filter((key) => values[key] !== undefined);
  if (foreign.length > 0) throw new UsageError(`${command} 에는 쓸 수 없는 옵션: ${foreign.map((k) => `--${k}`).join(' ')}`);
  const home = resolve(values.home ?? homedir());
  const piSessionDir = envDirFor(values.home, 'PI_CODING_AGENT_SESSION_DIR', home);
  const common: CommonOptions = {
    usage: values['no-usage'] !== true,
    home,
    codexHome: codexHomeFor(values.home, home),
    piAgentDir: envDirFor(values.home, 'PI_CODING_AGENT_DIR', home) ?? join(home, '.pi', 'agent'),
    ...(piSessionDir !== undefined ? { piSessionDir } : {}),
  };
  if (command === 'scan') {
    return { ...common, command, out: resolve(values.out ?? DEFAULT_OUT), json: values.json === true };
  }
  return {
    ...common,
    command,
    out: resolve(values.out ?? DEFAULT_SHARE_OUT),
    handle: shareName(values.name, values.handle),
    hide: values.hide ?? [],
    descriptions: values.descriptions === true,
  };
}

/** --home pins everything under it (tests, debugging); otherwise $CODEX_HOME, else ~/.codex. */
function codexHomeFor(homeFlag: string | undefined, home: string): string {
  const env = process.env.CODEX_HOME;
  return homeFlag === undefined && env !== undefined && env.trim() !== '' ? resolve(env) : join(home, '.codex');
}

/** A directory from the environment (`~/` expanded, as Pi does), unless --home pins everything under it. */
function envDirFor(homeFlag: string | undefined, name: string, home: string): string | undefined {
  const env = process.env[name]?.trim();
  if (homeFlag !== undefined || env === undefined || env === '') return undefined;
  if (env === '~') return home;
  return env.startsWith('~/') ? join(home, env.slice(2)) : resolve(env);
}

/** --name, or its old alias --handle. Both at once is an error. */
function shareName(name: string | undefined, alias: string | undefined): string {
  if (name !== undefined && alias !== undefined) throw new UsageError('--name 과 --handle 은 같은 옵션입니다. 하나만 쓰세요.');
  const flag = alias !== undefined ? '--handle' : '--name';
  const result = validateShareName(name ?? alias ?? '');
  if (!result.ok) throw new UsageError(`${flag} 값이 올바르지 않습니다: ${result.error}`);
  return result.name;
}

function progressReporter(label: string) {
  return (done: number, total: number): void => {
    process.stderr.write(`\r${label} ${done}/${total}`);
    if (done === total) process.stderr.write('\n');
  };
}

function collectOptions(options: CommonOptions): CollectOptions {
  const { home, codexHome, piAgentDir, piSessionDir, usage } = options;
  return { home, codexHome, piAgentDir, usage, ...(piSessionDir !== undefined ? { piSessionDir } : {}) };
}

async function runScan(options: ScanOptions): Promise<number> {
  const profile = await collectProfile({ ...collectOptions(options), onProgress: progressReporter });
  const json = JSON.stringify(profile, null, 2) + '\n';
  if (options.json) {
    process.stdout.write(json);
    process.stderr.write(formatSummary(profile, null));
  } else {
    await writeFile(options.out, json, 'utf8');
    process.stderr.write(formatSummary(profile, options.out));
  }
  return 0;
}

async function runShare(options: ShareCliOptions): Promise<number> {
  const profile = await collectProfile({ ...collectOptions(options), onProgress: progressReporter });
  const result = await writeShareSheet(profile, options);
  process.stderr.write(formatShareSummary(result, options.descriptions));
  return 0;
}

async function main(argv: readonly string[]): Promise<number> {
  let options: CliOptions | 'help';
  try {
    options = parseCli(argv);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`);
    return 2;
  }
  if (options === 'help') {
    process.stdout.write(USAGE);
    return 0;
  }
  return options.command === 'share' ? runShare(options) : runScan(options);
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`harness-craft 실패: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exitCode = 1;
  },
);
