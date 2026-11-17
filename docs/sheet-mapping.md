# 수집 데이터 → 캐릭터 시트 변환 규칙 v1

`harness-profile.json`(docs/collector-spec.md)을 설계안 「Character Sheet」 화면 값으로 바꾸는 규칙이다.
순수 함수로 `packages/sheet` 에 두고, 웹 화면과 나중의 README SVG 카드가 함께 쓴다.

입력은 `HarnessProfile` 과 `Visibility`(사용자가 숨긴 항목) 두 개다. 숨긴 항목은 변환 **전에** 빼서,
순위·레어도·스탯에도 영향을 주지 않는다. 같은 입력이면 같은 출력이어야 한다(난수·현재 시각 금지, 색은 이름 해시로).

## 합치기

Claude Code 와 Codex 를 한 캐릭터로 합친다. MCP 는 이름이 같으면 하나로 합치고 `calls` 를 더한다.
스킬·에이전트는 `source` 가 달라도 이름이 같으면 합치고 `uses` 를 더한다. 어느 도구에서 왔는지는 `origins: ('claude'|'codex')[]` 로 남긴다.
에이전트는 `claudeCode.agents` 와 `codex.agents`(예전 파일에는 없을 수 있음)를 합친다. 설명은 먼저 나온 빈 문자열이 아닌 것,
모델은 먼저 나온 null 이 아닌 것을 쓴다(Claude Code 쪽이 먼저). 기본 에이전트(`source: 'builtin'`)도 같은 규칙으로 합친다.

## 레어도 (스킬·장비 공통)

사용 횟수가 1 이상인 항목만 순위를 매긴다. 0회는 항상 커먼.
사용 항목 수를 n 이라 할 때 순위 상위 `max(1, round(n×0.1))` 개 레전더리, 다음 `round(n×0.2)` 에픽, 다음 `round(n×0.3)` 레어, 나머지 커먼.
동률은 이름순으로 끊는다.

## 칸별 규칙

| 칸 | 규칙 |
|---|---|
| 장비 6칸 | MCP 를 calls 내림차순(동률 이름순) 상위 6개. 슬롯 순서 투구·갑옷·보조·주무기·장신구·신발. 6개 미만이면 빈 슬롯("빈 칸")을 그린다. 아이콘은 이름 키워드(github→shield, postgres·sql·db·data→gear, notion·obsidian·doc·wiki→book, slack·mail·notify→bolt, playwright·browser·chrome·aside→eye, file·fs→key, search·exa→scroll) 없으면 이름 해시로 10종 중 하나 |
| 장비 요약 | `MCP 장비 {장착}/6 장착 · 스킬 {전체}개 보유` |
| 스킬 인벤토리 | uses 내림차순 상위 9개. 제목 옆 `{9 또는 그 이하} / {전체}`. 아이콘은 이름 해시. 툴팁: 설명, 사용 횟수, 획득(`직접 제작` 또는 `플러그인 {이름}`, 둘 다 아니면 `기본 제공`) |
| 파티 | 에이전트 uses 내림차순 상위 4개. 역할 배지 = 이름에서 `opus-`·`sonnet-`·`haiku-` 접두어를 뗀 뒤 대문자(최대 12자). 직업 = 모델 이름에 든 글자로(아래 「직업」). 머리·옷 색은 이름 해시로 팔레트에서. 제목 옆 `서브에이전트 {전체}` |
| 패시브 | 훅을 이벤트별로 묶어 이벤트 4개까지(PreToolUse, PostToolUse, Stop, Notification, SessionStart, SessionEnd, UserPromptSubmit 순 우선). 이름은 그 이벤트 훅 중 `inline` 이 아닌 라벨 하나, 없으면 기본 이름(아래). 설명 = `핸들러 {n}개` |
| 스탯 6축 | 아래 |
| 레벨 | 아래 |
| 칭호 | 가장 높은 스탯에 따라(아래). 동률이면 축 순서상 앞선 것 |

### 직업

모델 이름을 소문자로 바꿔 아래 순서대로 찾고, 처음 맞은 것을 쓴다. Claude 계열을 먼저 본다.
Claude 계열은 글자가 어디 들어 있든 맞는다. Codex 의 `luna`·`sol`·`astra` 는 `-`·`_`·`.` 나 처음·끝으로 둘러싸인
한 토막일 때만 맞는다(`/(^|[-_.])sol([-_.]|$)/`). 그래서 `console-…` 은 마법사가 아니다.

| 모델 이름에 든 글자 | 직업 |
|---|---|
| `opus` | 마법사 |
| `sonnet` | 궁수 |
| `haiku` | 도적 |
| `fable` | 현자 |
| `luna` (Codex) | 궁수 |
| `sol` (Codex) | 마법사 |
| `astra` (Codex) | 도적 |
| `gpt`, `codex`, `o3`, `o4` (그 밖의 Codex 모델) | 전사 |
| 그 외·모델 없음 | 전사 |

### 패시브 기본 이름

PreToolUse 도구 사용 전 검문 · PostToolUse 사용 후 정리 · Stop 마무리 의식 · Notification 알림 종 ·
SessionStart 출정 준비 · SessionEnd 귀환 기록 · UserPromptSubmit 명령 해석 · 그 외 이벤트 이름 그대로.

### 스탯 6축 (0~100)

`score(x, cap) = round(100 × min(1, log10(1 + x) / log10(1 + cap)))`

| 축 | x | cap | 칭호 |
|---|---|---|---|
| 자동화 | 훅 핸들러 수 × 20 + 스킬 uses 합 | 2,000 | 자동화 장인 |
| 지침력 | CLAUDE.md 줄 + AGENTS.md 줄 + 스킬 수 × 10 | 1,500 | 규칙 설계자 |
| 에이전트 지휘 | 에이전트 uses 합(Claude Code + Codex) + subagentRuns + Codex subagentActivities(서브에이전트를 띄운 횟수) | 2,000 | 파티 지휘관 |
| 도구 활용 | MCP calls 합 | 10,000 | 장비 수집가 |
| 실행력 | builtinTools 의 Bash + Read + Edit + Write + Grep + Glob + Codex commandExecutions | 50,000 | 터미널 전사 |
| 꾸준함 | `activity.activeDays`(두 도구 활동일의 합집합, 같은 날은 하루). `activity` 가 없거나 null 이면 Claude activeDays 와 Codex activeDays 중 큰 값 | 120 | 성실한 모험가 |

설계안의 「프롬프트력·디버깅·문서화」는 수집 데이터로 잴 수 없어서 「지침력·실행력·꾸준함」으로 바꿨다.
usage 가 없으면(`--no-usage`) 사용 기반 축은 0 이다.

### 레벨

`exp = Claude toolCalls + Codex commandExecutions + Codex mcpCalls`
`level = floor(sqrt(exp / 25))`, 다음 레벨까지 진행률 = `(exp − 25·L²) / (25·((L+1)² − L²))`.
EXP 표시는 `EXP {exp − 25·L²} / {25·((L+1)² − L²)}`.
