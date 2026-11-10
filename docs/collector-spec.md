# 수집기(collector) 명세 v1

사용자 PC 의 Claude Code·Codex 설정과 사용 기록을 읽어, 캐릭터 시트가 쓸 `harness-profile.json` 한 파일로 만든다.
이 버전은 **네트워크를 전혀 쓰지 않는다.** 업로드는 서버가 생긴 뒤 `sync` 명령으로 붙인다.

## 원칙

1. **내보내는 것은 이름·개수·짧은 설명뿐이다.** 파일 본문, 환경변수 값, 헤더, 명령 인자, 절대 경로는 내보내지 않는다.
2. **허용 목록 방식으로 고른다.** 원본 객체를 복사한 뒤 지우는 방식이 아니라, 필요한 필드만 골라 새 객체를 만든다.
3. **읽지 않는 파일:** `~/.codex/auth.json`, `~/.claude/.credentials.json`, `*.sqlite*`, `history.jsonl`, `session-env/`, `shell-snapshots/`.
4. 파일이 없거나 깨져 있으면 그 항목만 비우고 계속 간다. 경고는 `warnings[]` 에 남긴다(경로는 `~` 로 줄여서).
5. 결과는 결정적이어야 한다. 배열은 이름순(사용량이 있는 배열도 이름순, 정렬은 화면이 한다).

## 명령

```
harness-craft [scan] [--out <file>] [--json] [--no-usage] [--home <dir>]
```

| 옵션 | 동작 |
|---|---|
| (없음) | 스캔 → 사람이 읽는 요약을 stderr 에 출력 → `./harness-profile.json` 에 저장 |
| `--out <file>` | 저장 위치 변경 |
| `--json` | JSON 을 stdout 으로만 내보내고 파일은 쓰지 않음. 요약·진행률은 stderr |
| `--no-usage` | 대화 기록 집계(느린 부분)를 건너뜀. `usage` 는 `null` |
| `--home <dir>` | 홈 디렉터리 대신 쓸 경로(테스트·디버그용). `~/.claude`, `~/.claude.json`, `~/.codex` 를 여기서 찾음 |

요약 마지막 줄에 "아무것도 업로드하지 않았습니다" 를 반드시 쓴다.

혼자 열리는 시트 HTML 을 만드는 `share` 명령도 있다. [share-spec.md](./share-spec.md) 참고.

## 출력 스키마 (`schemaVersion: 1`)

```ts
type HarnessProfile = {
  schemaVersion: 1;
  generatedAt: string;                 // ISO
  collector: { name: 'harness-craft'; version: string };
  claudeCode: ClaudeCodeSource | null; // ~/.claude 와 ~/.claude.json 이 둘 다 없으면 null
  codex: CodexSource | null;           // ~/.codex 가 없으면 null
  redactions: { paths: number; emails: number; secrets: number; urls: number };
  warnings: string[];
};

type ClaudeCodeSource = {
  model: string | null;                // settings.json model
  since: string | null;                // ~/.claude.json claudeCodeFirstTokenDate ?? firstStartTime
  startups: number | null;             // ~/.claude.json numStartups
  mcpServers: McpServer[];
  skills: Skill[];
  agents: Agent[];
  hooks: Hook[];
  plugins: Plugin[];
  commands: Command[];                 // ~/.claude/commands/**/*.md
  instructions: Instructions;          // ~/.claude/CLAUDE.md
  usage: ClaudeUsage | null;
};

type CodexSource = {
  model: string | null;                // config.toml model
  reasoningEffort: string | null;      // config.toml model_reasoning_effort
  mcpServers: McpServer[];             // config.toml [mcp_servers.*]
  skills: Skill[];                     // ~/.codex/skills/*/SKILL.md
  hooks: Hook[];                       // ~/.codex/hooks.json
  commands: Command[];                 // ~/.codex/prompts/*.md
  instructions: Instructions;          // ~/.codex/AGENTS.md
  rulesFiles: number;                  // ~/.codex/rules/* 개수만
  usage: CodexUsage | null;
};

type McpServer = {
  name: string;
  transport: 'stdio' | 'http' | 'sse' | 'unknown';
  scope: 'user' | 'project';           // project = ~/.claude.json projects[*].mcpServers (경로는 내보내지 않음, 이름으로 중복 제거)
  host?: string;                       // http/sse: URL 의 hostname 만. 「MCP host 허용 목록」에 든 것만, 아니면 필드 생략
  command?: string;                    // stdio: command 의 basename 만 ('/x/y/acme-mcp-proxy' → 'acme-mcp-proxy')
  package?: string;                    // stdio 이고 command 가 npx/bunx/uvx/pnpm dlx 일 때, args 중 첫 패키지 이름(버전 표기 제거)
  calls: number;                       // usage 집계 결과, 없으면 0
};

type Skill = {
  name: string;                        // frontmatter name ?? 폴더 이름. 플러그인이면 '<plugin>:<name>'
  description: string;                 // 가림 처리 후 280자 자르기
  source: 'user' | `plugin:${string}`;
  uses: number;                        // 아래 「사용 횟수」
  lastUsedAt: string | null;           // ISO
};

type Agent = {
  name: string; description: string;
  model: string | null; effort: string | null;
  toolCount: number | null;            // frontmatter tools 를 쉼표로 나눈 개수, 없으면 null(=전부 허용)
  mcpServers: string[];                // tools 안의 mcp__<server>__* 에서 server 만 모아 중복 제거
  source: 'user' | `plugin:${string}`;
  uses: number;                        // Agent/Task tool_use 의 subagent_type 집계
};

type Hook = {
  event: string;                       // PreToolUse 등
  matcher: string | null;              // '*' 와 '.*' 와 빈 문자열은 null
  type: string;                        // command | prompt | http ...
  label: string;                       // 아래 「훅 라벨」
};

type Plugin = { name: string; marketplace: string; version: string | null; enabled: boolean; uses: number };
type Command = { name: string; description: string };
type Instructions = { present: boolean; lines: number; bytes: number };   // 본문은 절대 내보내지 않음

type ClaudeUsage = {
  sessions: number;                    // projects/<dir>/<uuid>.jsonl (깊이 1) 개수
  subagentRuns: number;                // projects/<dir>/<uuid>/subagents/*.jsonl 개수
  projects: number;                    // projects/ 아래 디렉터리 개수 (이름은 내보내지 않음)
  toolCalls: number;                   // 중복 제거한 tool_use 전체
  builtinTools: Record<string, number>;// mcp__ 가 아닌 도구 이름별
  firstActivity: string | null; lastActivity: string | null;   // YYYY-MM-DD
  activeDays: number;                  // timestamp 날짜(로컬 아님, UTC) 고유 개수
};

type CodexUsage = {
  sessions: number;                    // sessions/**/*.jsonl 개수
  mcpCalls: number; subagentActivities: number; commandExecutions: number;
  firstActivity: string | null; lastActivity: string | null; activeDays: number;
};
```

## 데이터 출처별 규칙

### Claude Code

- `~/.claude/skills` 는 심볼릭 링크일 수 있다. 따라간다. 스킬은 **바로 아래 폴더 중 `SKILL.md` 가 있는 것만** 센다(`synced/` 처럼 SKILL.md 가 없는 폴더는 건너뜀).
- 플러그인: `~/.claude/plugins/installed_plugins.json` 의 `plugins["<name>@<marketplace>"][0].installPath`, `version`.
  `enabled` 는 `settings.json` 의 `enabledPlugins["<name>@<marketplace>"] === true`. `uses` 는 `~/.claude.json` `pluginUsage[...].usageCount`.
  플러그인 스킬은 `<installPath>/skills/*/SKILL.md`, 플러그인 에이전트는 `<installPath>/agents/*.md`.
- 에이전트: `~/.claude/agents/*.md` 의 frontmatter(`name`, `description`, `model`, `effort`, `tools`).
- frontmatter 는 YAML 로 읽는다. 엄격한 YAML 로 안 읽히면(따옴표 없는 `: ` 가 든 description 등, Claude Code 는 받아 준다)
  최상위 한 줄 `key: value` 만 읽는 대체 파서로 다시 읽는다. 값을 감싼 따옴표는 걷고, `|`·`>` 블록 값은 건너뛴다.
  대체 파서로도 키가 하나도 안 나오면 그 항목은 빈 frontmatter 로 두고 `warnings[]` 에 남긴다.
- 훅: `settings.json` 의 `hooks: { [event]: [{ matcher?, hooks: [{ type, command?, timeout? }] }] }`. 핸들러 하나가 Hook 하나.
- MCP: `~/.claude.json` 의 `mcpServers`(scope user) 와 `projects[*].mcpServers`(scope project).
  `type` 이 없으면 `url` 이 있으면 http, `command` 가 있으면 stdio.

### Claude Code 사용 기록 (`~/.claude/projects/**/*.jsonl`)

- 전체가 수 GB 일 수 있다. 줄 단위 스트리밍으로 읽고, **`"tool_use"` 나 `<command-name>` 가 들어 있는 줄만 JSON.parse 한다.**
  날짜는 모든 줄에서 정규식 `"timestamp":"(\d{4}-\d{2}-\d{2})` 로만 뽑는다.
- 한 줄 = 한 레코드. `type === 'assistant'` 이면 `message.content[]` 의 `{type:'tool_use', id, name, input}` 을 센다. **`id` 로 중복 제거.**
  - `name` 이 `mcp__<server>__<tool>` → 해당 McpServer.calls 에 더함(서버 이름에 `__` 가 없다고 가정, 첫 `__` 와 두 번째 `__` 사이)
  - `name === 'Skill'` → `input.skill` 이름별 집계
  - `name === 'Agent' || name === 'Task'` → `input.subagent_type` 이름별 집계
  - 그 외 → `builtinTools[name]`
- `type === 'user'` 이고 `message.content` 가 문자열이며 `<command-name>/x</command-name>` 이 있으면 `x` 를 슬래시 호출로 센다.
- 진행률: 파일 100개마다 stderr 에 `대화 기록 읽는 중 300/1050` 를 덮어쓰기로 출력(`--json` 일 때도 stderr).

### 스킬 사용 횟수

`~/.claude.json` 의 `skillUsage[name].usageCount` 와, 대화 기록의 (Skill 호출 + 같은 이름 슬래시 호출) 중 **큰 값**을 쓴다.
`skillUsage` 는 지워지거나 일부만 남을 수 있고, 대화 기록은 오래된 것이 지워질 수 있어서 둘 중 큰 쪽이 실제에 가깝다.
`lastUsedAt` 은 `skillUsage[name].lastUsedAt`(ms) 를 ISO 로. 플러그인 스킬은 `'<plugin>:<name>'` 과 `'<name>'` 두 키를 모두 찾아본다.

플러그인 스킬·에이전트의 키 합산 규칙:

| 항목 | 찾는 키 | 합산 |
|---|---|---|
| 스킬 | `'<plugin>:<name>'`, `'<name>'` | `skillUsage` 쪽은 두 키의 `usageCount` 를 더하고, 대화 기록 쪽은 두 키의 (Skill 호출 + 슬래시 호출) 을 더한 뒤, 두 합 중 큰 값. `lastUsedAt` 은 두 키 중 늦은 것 |
| 에이전트 | `'<plugin>:<name>'`, `'<name>'` | 두 키의 `subagent_type` 집계를 더함 |

같은 `<name>` 의 사용자 스킬·에이전트가 있으면 맨 이름 `'<name>'` 은 사용자 항목 몫이다. 플러그인 항목은 `'<plugin>:<name>'` 만 센다.

### MCP host 허용 목록

http/sse 서버의 `host` 는 아래 공개 서비스일 때만 남긴다. 그 밖의 host(사내 도메인, IP, `localhost`)는 `host` 필드를 뺀다.
hostname 은 소문자로 바꾸고 끝의 `.` 을 뗀 뒤 비교한다. 목록은 `src/mcpHosts.ts` 한 곳에 둔다.

| 방식 | host |
|---|---|
| 정확 일치 | `mcp.exa.ai`, `mcp.notion.com`, `api.githubcopilot.com`, `mcp.linear.app`, `mcp.sentry.dev`, `mcp.atlassian.com`, `mcp.stripe.com`, `mcp.vercel.com`, `mcp.supabase.com`, `mcp.context7.com`, `mcp.deepwiki.com`, `mcp.asana.com`, `mcp.intercom.com`, `mcp.zapier.com`, `mcp.canva.com`, `mcp.paypal.com`, `huggingface.co` |
| 접미사 일치 | `*.mcp.cloudflare.com` (하위 도메인만. `mcp.cloudflare.com` 자체는 아님) |

### Codex

- `config.toml` 은 TOML. `[mcp_servers.<name>]` 에 `url` 이 있으면 http, `command` 가 있으면 stdio.
- `hooks.json` 은 `{ hooks: { [event]: [{ matcher?, hooks: [...] }] } }` — Claude Code 와 같은 모양.
- 사용 기록 `sessions/YYYY/MM/DD/*.jsonl`: `type === 'event_msg' && payload.type === 'item_completed'` 인 줄의 `payload.item.type` 으로 센다.
  `McpToolCall`(→ `payload.item.server` 별로 McpServer.calls 에 더함, `item.id` 로 중복 제거), `SubAgentActivity`, `CommandExecution`.
  `"item_completed"` 가 들어 있는 줄만 parse 한다. 날짜는 경로의 `YYYY/MM/DD` 로.

## 가림 처리 (`redact`)

모든 자유 텍스트(description 등)에 적용하고, 종류별 건수를 `redactions` 에 더한다.

| 종류 | 패턴 | 바꿈 |
|---|---|---|
| secrets | `sk-[A-Za-z0-9_-]{16,}`, `gh[pousr]_[A-Za-z0-9]{20,}`, `github_pat_\w{20,}`, `xox[abprs]-[\w-]{10,}`, `AKIA[0-9A-Z]{16}`, `eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}`, 32자 이상 hex, `Bearer\s+\S{16,}` | `<secret>` |
| urls | `https?://\S+` | hostname 만 남김 |
| emails | 일반 이메일 | `<email>` |
| paths | 홈 경로(`/Users/<x>`, `/home/<x>`, `C:\Users\<x>`) 로 시작하는 경로 | 홈 부분을 `~` 로 |

순서: secrets → urls → emails → paths. 그 뒤 공백을 한 칸으로 줄이고 280자에서 자르며 `…` 을 붙인다.

## 훅 라벨

command 문자열에서 사람이 알아볼 이름 하나만 뽑는다. 명령 전체는 내보내지 않는다.

1. 앞쪽 `KEY=value` 대입과 따옴표를 걷어낸 첫 토큰을 본다.
2. 첫 토큰이 `node|python|python3|bash|sh|zsh|bun|deno|npx|uvx` 이면 다음 토큰 중 처음으로 `-` 로 시작하지 않는 것을 쓴다.
3. 그 토큰이 경로처럼 보이면(`/` 포함) basename 을, 아니면 토큰 그대로.
4. command 가 `if `, `: `, `[ `, `case ` 처럼 셸 구문으로 시작하거나 위에서 아무것도 못 얻으면 `'inline'`.
   2번에서 스크립트 이름보다 인라인 코드 플래그가 먼저 나와도 `'inline'` 이다(코드 본문은 이름이 아니다).

   | 인터프리터 | 인라인 코드 플래그 |
   |---|---|
   | `bash`, `sh`, `zsh` | `c` 가 든 짧은 플래그 묶음(`-c`, `-lc`, `-ec`) |
   | `python`, `python3` | `-c` |
   | `node`, `bun` | `-e`, `-p`, `--eval`, `--print` |
   | `deno` | `eval` |
   | `npx` | `-c`, `--call` |
5. type 이 command 가 아니면 type 을 그대로 라벨로.

예: `"/Applications/AgentPet.app/Contents/MacOS/agentpet" hook --` → `agentpet`,
`node /Users/x/.config/clauseum/codex-hook-stop.js` → `codex-hook-stop.js`, `if [ -z "$HOME" ]; then …` → `inline`,
`bash -lc 'echo hi'` → `inline`.
