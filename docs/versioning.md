# 버전 관리

## 지금: `version` 필드 없음 (활발한 개발 단계)

`.claude-plugin/plugin.json`에 `version`을 **두지 않는다.** 그러면 Claude Code가 git 커밋 SHA로 버전을 판단해 **커밋할 때마다 새 버전으로 인식**한다 — 설치본에서 `/plugin marketplace update whetstone` 한 번이면 최신이 된다(수동 bump 불필요). 혼자 빠르게 고치는 지금 단계에 맞는 설정이다.

`version`을 박아 두면 그 숫자를 올리기 전엔 커밋을 push해도 설치본이 업데이트되지 않는다. 그 통제가 필요 없는 단계라 아예 뺀다.

## 나중: 정식 배포 단계로 가면 SemVer 도입

남들이 설치해 쓰기 시작하면 `plugin.json`에 `version`(`MAJOR.MINOR.PATCH`)을 넣어 릴리스를 통제한다. 단일 출처는 `plugin.json` 하나 — `marketplace.json`엔 버전을 적지 않는다(두 곳을 맞추다 어긋나는 실수 방지).

이 플러그인의 "제품"은 가이드 + `harness-craft` 스킬이므로 각 자리의 의미는:

- **MAJOR** — 기존 사용법이 깨지는 변경. 스킬 이름·호출 방식 변경, 가이드 구조를 갈아엎어 `harness-craft`의 결과가 달라짐.
- **MINOR** — 하위호환되는 추가. 새 가이드·스킬·원칙 추가.
- **PATCH** — 가이드 적용 결과를 바꾸지 않는 수정. 문구 다듬기, 오타.

커밋 타입과의 연결은 [git.md](git.md) 참조(`feat`→MINOR, `fix`→PATCH, `BREAKING CHANGE`→MAJOR).

### 릴리스 절차 (SemVer 도입 후)

1. `plugin.json`의 `version`을 SemVer 규칙대로 올린다.
2. `chore(plugin): vX.Y.Z` 커밋 후 `git push`.
3. `git tag vX.Y.Z && git push --tags`.

태그가 있으면 사용자가 특정 버전을 고정해 설치할 수 있다:

```
/plugin marketplace add hiib2046/whetstone@v0.2.0
```
