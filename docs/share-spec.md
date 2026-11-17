# 공유 파일(share) 명세 v1

`harness-craft share` 는 캐릭터 시트를 **혼자 열리는 HTML 한 장**(`harness-sheet.html`)으로 만든다.
서버도 네트워크도 쓰지 않는다. 사용자는 이 파일만 보내면 되고, 받는 사람은 브라우저로 연다.
툴팁 같은 상호작용이 살아 있도록 정적 캡처가 아니라 React 번들을 넣는다.

## 명령

```
harness-craft share [--out <file>] [--name <이름>] [--hide <glob>]... [--descriptions] [--no-usage] [--home <dir>]
```

| 옵션 | 동작 |
|---|---|
| (없음) | 스캔 → 공유용 프로필로 줄임 → `./harness-sheet.html` 에 저장 → 요약을 stderr 에 출력 |
| `--out <file>` | 저장 위치 변경 |
| `--name <이름>` | 시트에 보일 이름(닉네임). 아무 글자나 된다(한글·이모지 포함). 앞뒤 공백과 앞쪽 `@` 를 떼고, 비면 기본 `player`. 제어 문자(U+0000–U+001F, U+007F)가 있거나 32자(코드 포인트 기준)를 넘으면 exit 2. 확인하거나 어디로 보내는 값이 아니라 화면에 쓰는 이름일 뿐이다. 예전 이름 `--handle` 도 같은 뜻으로 받지만 도움말에는 없다. 둘을 함께 주면 exit 2 |
| `--hide <glob>` | 이름이 맞는 항목을 파일에서 뺀다. 대소문자 무시, `*` 만 와일드카드. 여러 번 줄 수 있다 |
| `--descriptions` | 설명을 파일에 넣는다. 없으면 모든 설명을 비운다 |
| `--no-usage`, `--home` | `scan` 과 같다 |

`scan` 전용 옵션(`--json`)과 `share` 전용 옵션을 섞으면 exit 2. 기존 `scan` 동작은 그대로다.

요약은 저장 경로·파일 크기, 담긴 항목 수(MCP·스킬·에이전트·훅, 모든 도구 합계), 숨긴 항목 수, 설명 포함 여부를 쓰고,
마지막 줄은 늘 "이 파일 하나만 보내면 됩니다. 아무것도 업로드하지 않았습니다." 다.

## 파일에 담기는 것

`{ handle, profile }` JSON 하나다. `handle` 은 `--name` 값이다(템플릿과의 약속이라 키 이름은 그대로 둔다).
이름에 `<`·`>`·`&` 가 있어도 JSON 을 `<script>` 에 넣을 때 이스케이프하므로(아래 「템플릿」) 태그로 해석되지 않는다.
시트는 이름의 공백을 `-` 로 바꾸고 32자에서 자른다(`normalizeHandle`). `profile` 은 `harness-profile.json` 과 같은 스키마에서 아래만 바뀐다(`prepareShareProfile`).

| 항목 | 처리 |
|---|---|
| 숨긴 MCP·스킬·에이전트(Claude Code·Codex)·플러그인·명령(Pi 는 프롬프트 템플릿) | 배열에서 **아예 뺀다**. 표시만 숨기는 것이 아니라 JSON 에 남지 않는다 |
| 숨긴 훅 | `label` 이나 `event` 가 맞으면 뺀다 |
| 훅 `matcher` | 늘 `null` 로 비운다. 시트가 쓰지 않고 `mcp__<서버>__*` 처럼 숨긴 이름이 들어 있을 수 있다 |
| 숨긴 MCP 이름 | 에이전트 `mcpServers` 에서도 뺀다 |
| 숨긴 플러그인 | Claude Code·Codex·Pi(패키지·확장) 어느 쪽 플러그인이든 그 플러그인의 스킬·에이전트(`source: plugin:<이름>`)도 함께 뺀다. Codex 플러그인 훅은 출처 표시가 없어 함께 빠지지 않는다(훅 라벨로 따로 숨긴다) |
| 설명 (`--descriptions` 없음) | 스킬·에이전트·명령 `description` 을 `''` 로, MCP 의 `package`·`host`·`command` 를 생략 |
| `warnings` | 늘 비운다. 시트가 쓰지 않고 파일·항목 이름이 들어 있다 |
| 그 밖 | 사용 횟수, 모델, 사용 기록 집계, `activity`(활동일 합계), 가림 처리 개수는 그대로 |

Claude Code·Codex·Pi 세 소스에 똑같이 적용한다. `pi` 키가 없는 예전 프로필은 키 없이 그대로 둔다. 입력 프로필은 바꾸지 않는다.

## 템플릿

`packages/collector` 의 `build` 가 `tsc` 다음에 `scripts/build-share-template.mjs` 로 `dist/share-template.html` 을 만든다.
`share/entry.tsx` 를 esbuild 로 번들한다(React 19 production, minify, CSS Modules 는 `local-css`, CSS 는 인라인).

| 부분 | 내용 |
|---|---|
| `<head>` | `charset=utf-8`, viewport, `<title>`(entry 가 `@핸들 · DEV.QUEST` 로 바꿈), `color-scheme: dark` |
| `<style>` | 두 폰트 `@font-face`(WOFF2 data URI)와 `--font-press-start`·`--font-neodgm` 변수, `/preview` 와 같은 점무늬 바탕, 좌우 여백 `max(16px, env(safe-area-inset-*))`, `prefers-reduced-motion` 이면 애니메이션 끔, 시트 CSS |
| `<main id="harness-share-root">` | 시트가 그려지는 자리 |
| `<script type="application/json" id="harness-share-data">` | 자리표시자 `__HARNESS_SHARE_DATA__` 가 정확히 한 번 |
| `<script>` | 번들 JS. `</script`·`<!--` 가 들어 있으면 빌드가 실패한다 |

entry 는 JSON 을 읽어 `parseProfile` 로 검사한 뒤 `toSheet(profile, { handle, showDescriptions: true, hidden: 빈 목록 })` 을
`<CharacterSheet scanlines={false} share={null} />` 로 그린다. 숨김·설명 처리는 CLI 가 이미 했으므로 받은 것을 다 그린다.
템플릿은 400KB 를 넘으면 빌드가 실패한다.

CLI 는 템플릿을 `new URL('./share-template.html', import.meta.url)` 로 읽고, 자리표시자 한 곳만 데이터로 바꾼다
(없거나 두 번 이상이면 오류). 데이터는 `JSON.stringify` 뒤 `<`·`>`·`&`·U+2028·U+2029 를 `\uXXXX` 로 바꿔,
이름에 `</script>` 가 있어도 문서 구조가 깨지지 않는다.

React·`@harness-craft/sheet`·`@harness-craft/sheet-ui`·esbuild 는 collector 의 devDependencies 다.
번들이 템플릿에 들어가므로 런타임 의존성은 `yaml`, `smol-toml` 둘뿐이다.

## 화면 맞춤

창 폭이 600px 이상이면 시트를 폭 1440px(3열 배치)로 그린 뒤 창에 맞게 줄여, 시트 전체가 한 화면에 들어오게 한다.
높이까지 맞추면 배율이 0.55 아래로 내려갈 때는 폭만 맞추고 세로로 스크롤한다. 600px 미만(휴대폰)에서는 줄이지 않고
시트의 세로 배치를 그대로 쓴다. 구현은 `packages/collector/share/entry.tsx` 의 `FitToScreen` 이다.

## 폰트

`packages/sheet-ui/fonts/` 에 둔다. 둘 다 SIL OFL 1.1 이고 라이선스 파일을 같이 둔다.

| 파일 | 출처 |
|---|---|
| `neodgm.woff2`, `NEODGM-OFL.txt` | NeoDunggeunmo v1.601. 웹(`app/fonts.ts`)도 이 파일을 쓴다 |
| `PressStart2P-Regular.ttf`, `PRESSSTART2P-OFL.txt` | google/fonts `ofl/pressstart2p/` 커밋 `e06fe11c39051bddaef73ec338a9d1c8175723f1` 원본 |
| `PressStart2P-Regular.woff2` | 위 TTF 를 fontTools 4.67.0 `woff2.compress` 로 바꾼 것. 글리프는 같고 서명(`DSIG`) 테이블만 빠진다. TTF 로는 템플릿이 400KB 를 넘는다 |
