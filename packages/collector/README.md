# harness-craft

내 Claude Code·Codex·Pi 하네스(MCP·스킬·훅·서브에이전트)와 사용 기록을 픽셀 RPG 캐릭터 시트로 만든다.
결과는 혼자 열리는 HTML 한 장이고, 그 파일만 보내면 된다. 네트워크는 쓰지 않는다.

Turn your Claude Code, Codex and Pi harness into a pixel-RPG character sheet: one self-contained HTML file, no network.

## 쓰는 법

```bash
npx harness-craft share --name <닉네임>
# → ./harness-sheet.html
```

| 옵션 | 동작 |
|---|---|
| `--name <이름>` | 시트에 보일 이름(닉네임). 한글·이모지도 되고 32자까지. 기본 `player` |
| `--hide <glob>` | 이름이 맞는 MCP·스킬·에이전트·플러그인·훅을 파일에서 아예 뺀다. `*` 와일드카드, 대소문자 무시, 여러 번 쓸 수 있다 |
| `--descriptions` | 스킬·에이전트 설명을 넣는다. 기본은 뺀다 |
| `--out <파일>` | 저장 위치. 기본 `./harness-sheet.html` |
| `--no-usage` | 대화 기록 집계를 건너뛴다(빠르지만 레벨·사용 횟수가 0) |

회사 도구처럼 보이고 싶지 않은 이름은 `--hide` 로 뺀다. 예: `--hide 'acme-*' --hide internal-wiki`.

원본 데이터만 필요하면 `npx harness-craft` 로 `harness-profile.json` 을 만든다.

## 무엇을 읽고, 무엇을 담나

| 읽는 곳 | 담는 것 |
|---|---|
| `~/.claude.json`, `~/.claude/settings.json` | MCP 서버 이름, 훅 이벤트, 모델, 플러그인 |
| `~/.claude/skills`, `~/.claude/agents`, 플러그인 | 스킬·에이전트 이름(설명은 `--descriptions` 일 때만) |
| `~/.claude/projects/**/*.jsonl` | 도구·스킬·에이전트·MCP 호출 횟수와 활동일 |
| `~/.codex/config.toml`, `hooks.json`, `AGENTS.md`(`AGENTS.override.md` 우선) | 같은 항목의 Codex 쪽 값. `enabled = false` 인 MCP·스킬·훅·플러그인은 뺀다 |
| `~/.codex/skills`(`.system` 포함), `~/.agents/skills` | Codex 스킬 이름. 시스템 스킬은 쓴 적이 있을 때만 |
| `~/.codex/plugins/cache/**/.codex-plugin/plugin.json` | Codex 플러그인 이름·버전, 플러그인 스킬·훅 |
| `~/.codex/sessions/**/*.jsonl` | 세션 수(대화형·exec), 스킬·MCP·명령 호출 횟수, 가장 많이 쓴 모델, 활동일 |
| `~/.codex/agents/*.toml`, `config.toml` 의 `[agents.*]` | Codex 커스텀 에이전트 이름·설명·모델(`developer_instructions` 는 담지 않음) |
| `~/.pi/agent/settings.json`, `mcp.json`, `AGENTS.md`, `prompts/*.md` | Pi 모델, MCP 서버 이름(`env`·`headers` 값은 담지 않음), 패키지·확장 이름·버전, 프롬프트 템플릿 이름 |
| `~/.pi/agent/skills`, `~/.agents/skills`, 설정의 `skills` 경로, Pi 패키지 스킬 | Pi 스킬 이름 |
| `~/.pi/agent/sessions/**/*.jsonl` | Pi 세션 수, 도구·MCP·스킬 호출 횟수, subagent 실행 수, 가장 많이 쓴 모델, 활동일 |
| 위 도구들의 날짜 | 활동일 수와 첫날·마지막 날(날짜 목록은 담지 않음) |

환경변수 값, 헤더, 명령 인자, 파일 본문, 절대 경로, 대화 내용은 담지 않는다.
`~/.codex/auth.json`, `~/.claude/.credentials.json`, Pi 의 `auth.json`·`mcp-auth.json`·`models.json`, sqlite 파일은 열지 않는다.
`$CODEX_HOME` 을 정해 두었으면 `~/.codex` 대신 그 폴더를, `$PI_CODING_AGENT_DIR` 를 정해 두었으면 `~/.pi/agent` 대신 그 폴더를 읽는다.
Pi 세션은 `$PI_CODING_AGENT_SESSION_DIR` 나 설정의 `sessionDir` 가 있으면 그 폴더도 함께 읽는다.
MCP 서버 주소는 공개 서비스로 알려진 곳만 남기고, 공유 파일에서는 그마저 뺀다.

## 라이선스

MIT. 공유 HTML 에 들어가는 폰트 NeoDunggeunmo 와 Press Start 2P 는 SIL Open Font License 1.1 이며,
원문은 패키지의 `dist/licenses/` 에 있다. React 의 MIT 고지는 공유 HTML 안에 그대로 남는다.
