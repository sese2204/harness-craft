#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { collectProfile } from './collect.js';
import { formatSummary } from './summary.js';

const DEFAULT_OUT = 'harness-profile.json';
const USAGE = `사용법: harness-craft [scan] [--out <file>] [--json] [--no-usage] [--home <dir>]

  --out <file>   저장 위치 (기본 ./${DEFAULT_OUT})
  --json         JSON 을 stdout 으로만 내보내고 파일은 쓰지 않음
  --no-usage     대화 기록 집계를 건너뜀 (usage 는 null)
  --home <dir>   홈 디렉터리 대신 쓸 경로 (테스트·디버그용)
`;

type CliOptions = { out: string; json: boolean; usage: boolean; home: string };

class UsageError extends Error {}

function parseCli(argv: readonly string[]): CliOptions | 'help' {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      out: { type: 'string' },
      json: { type: 'boolean', default: false },
      'no-usage': { type: 'boolean', default: false },
      home: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) return 'help';
  if (positionals.length > 1 || (positionals.length === 1 && positionals[0] !== 'scan')) {
    throw new UsageError(`알 수 없는 명령: ${positionals.join(' ')}`);
  }
  return {
    out: resolve(values.out ?? DEFAULT_OUT),
    json: values.json === true,
    usage: values['no-usage'] !== true,
    home: resolve(values.home ?? homedir()),
  };
}

function progressReporter(label: string) {
  return (done: number, total: number): void => {
    process.stderr.write(`\r${label} ${done}/${total}`);
    if (done === total) process.stderr.write('\n');
  };
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

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`harness-craft 실패: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exitCode = 1;
  },
);
