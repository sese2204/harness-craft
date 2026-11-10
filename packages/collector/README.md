# harness-craft

내 Claude Code·Codex 하네스(MCP·스킬·훅·서브에이전트)와 사용 기록을 픽셀 RPG 캐릭터 시트로 만든다.
결과는 혼자 열리는 HTML 한 장이고, 그 파일만 보내면 된다. 네트워크는 쓰지 않는다.

Turn your Claude Code and Codex harness into a pixel-RPG character sheet: one self-contained HTML file, no network.

## 쓰는 법

```bash
npx harness-craft share --handle <내-아이디>
# → ./harness-sheet.html
```

| 옵션 | 동작 |
|---|---|
| `--handle <이름>` | 시트에 보일 이름. 영문·숫자·`_.-` 39자까지. 기본 `player` |
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
| `~/.codex/config.toml`, `hooks.json`, `skills`, `sessions` | 같은 항목의 Codex 쪽 값 |

환경변수 값, 헤더, 명령 인자, 파일 본문, 절대 경로, 대화 내용은 담지 않는다.
`~/.codex/auth.json`, `~/.claude/.credentials.json`, sqlite 파일은 열지 않는다.
MCP 서버 주소는 공개 서비스로 알려진 곳만 남기고, 공유 파일에서는 그마저 뺀다.

## 라이선스

MIT. 공유 HTML 에 들어가는 폰트 NeoDunggeunmo 와 Press Start 2P 는 SIL Open Font License 1.1 이며,
원문은 패키지의 `dist/licenses/` 에 있다. React 의 MIT 고지는 공유 HTML 안에 그대로 남는다.
