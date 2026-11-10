#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { collectProfile } from './collect.js';
import { writeShareSheet, formatShareSummary } from './shareCommand.js';
import { DEFAULT_SHARE_HANDLE, SHARE_HANDLE_PATTERN } from './shareFormat.js';
import { formatSummary } from './summary.js';

const DEFAULT_OUT = 'harness-profile.json';
const DEFAULT_SHARE_OUT = 'harness-sheet.html';
const USAGE = `사용법: harness-craft [scan] [--out <file>] [--json] [--no-usage] [--home <dir>]
       harness-craft share [--out <file>] [--handle <name>] [--hide <glob>]... [--descriptions] [--no-usage] [--home <dir>]

scan (기본) — 설정과 사용 기록을 읽어 harness-profile.json 을 만든다
  --out <file>      저장 위치 (기본 ./${DEFAULT_OUT})
  --json            JSON 을 stdout 으로만 내보내고 파일은 쓰지 않음

share — 혼자 열리는 캐릭터 시트 HTML 한 장을 만든다
  --out <file>      저장 위치 (기본 ./${DEFAULT_SHARE_OUT})
  --handle <name>   시트에 쓸 이름 (영문·숫자·_.- 39자까지, 기본 ${DEFAULT_SHARE_HANDLE})
  --hide <glob>     이름이 맞는 MCP·스킬·에이전트·플러그인·명령·훅을 파일에서 뺌 (대소문자 무시, * 가능, 여러 번)
  --descriptions    설명을 파일에 넣음 (기본은 뺌)

공통
  --no-usage        대화 기록 집계를 건너뜀 (usage 는 null)
  --home <dir>      홈 디렉터리 대신 쓸 경로 (테스트·디버그용)
`;

type CommonOptions = { usage: boolean; home: string };
type ScanOptions = CommonOptions & { command: 'scan'; out: string; json: boolean };
type ShareCliOptions = CommonOptions & { command: 'share'; out: string; handle: string; hide: string[]; descriptions: boolean };
type CliOptions = ScanOptions | ShareCliOptions;

class UsageError extends Error {}

const SCAN_ONLY = ['json'] as const;
const SHARE_ONLY = ['handle', 'hide', 'descriptions'] as const;

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
  const common: CommonOptions = { usage: values['no-usage'] !== true, home: resolve(values.home ?? homedir()) };
  if (command === 'scan') {
    return { ...common, command, out: resolve(values.out ?? DEFAULT_OUT), json: values.json === true };
  }
  const handle = values.handle ?? DEFAULT_SHARE_HANDLE;
  if (!SHARE_HANDLE_PATTERN.test(handle)) {
    throw new UsageError(`--handle 은 영문·숫자·_.- 로 1~39자여야 합니다: ${JSON.stringify(handle)}`);
  }
  return {
    ...common,
    command,
    out: resolve(values.out ?? DEFAULT_SHARE_OUT),
    handle,
    hide: values.hide ?? [],
    descriptions: values.descriptions === true,
  };
}

function progressReporter(label: string) {
  return (done: number, total: number): void => {
    process.stderr.write(`\r${label} ${done}/${total}`);
    if (done === total) process.stderr.write('\n');
  };
}

async function runScan(options: ScanOptions): Promise<number> {
  const profile = await collectProfile({ home: options.home, usage: options.usage, onProgress: progressReporter });
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
  const profile = await collectProfile({ home: options.home, usage: options.usage, onProgress: progressReporter });
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
