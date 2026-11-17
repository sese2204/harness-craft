# harness-craft

내 Claude Code·Codex 하네스(MCP·스킬·훅·서브에이전트)와 사용 기록을 픽셀 RPG 캐릭터 시트로 만든다.

```bash
npx harness-craft share --name <닉네임>
# → ./harness-sheet.html  (혼자 열리는 HTML 한 장. 이 파일만 보내면 된다)
```

- MCP 는 장비 6칸, 스킬은 인벤토리, 서브에이전트는 파티, 훅은 패시브 스킬이 된다.
- 레어도·레벨·스탯은 실제 사용 횟수로 정해진다.
- 네트워크를 쓰지 않는다. 환경변수 값·헤더·명령 인자·파일 본문·대화 내용은 담지 않는다.
- 보이고 싶지 않은 이름은 `--hide 'acme-*'` 처럼 빼면 파일 데이터에서도 지워진다.

옵션과 읽는 파일 목록은 [packages/collector/README.md](packages/collector/README.md) 에 있다.

## 저장소 구성

| 경로 | 내용 |
|---|---|
| `packages/collector` | npm 패키지 `harness-craft`. 스캔 CLI 와 `share` 명령 |
| `packages/schema` | 수집 결과(`harness-profile.json`) 타입 |
| `packages/sheet` | 수집 결과를 시트 값으로 바꾸는 규칙(레어도·스탯·레벨) |
| `packages/sheet-ui` | 시트 화면 React 컴포넌트와 폰트 |
| `apps/web` | Next.js 미리보기(`/preview` 에서 파일을 브라우저 안에서만 열어 본다) |
| `docs` | [수집기 명세](docs/collector-spec.md), [시트 변환 규칙](docs/sheet-mapping.md), [공유 HTML 명세](docs/share-spec.md) |

## 개발

```bash
pnpm install
pnpm -r build
pnpm -r test
pnpm --filter web dev   # http://localhost:3000/preview
```

Node 20 이상, pnpm 11.

## 라이선스

MIT. 폰트 NeoDunggeunmo·Press Start 2P 는 SIL Open Font License 1.1.
