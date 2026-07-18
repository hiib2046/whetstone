# 버전 관리

## 단일 제품 버전

가이드와 `harness-craft` 스킬은 두 런타임이 공유하는 하나의 제품이다. 따라서 아래 두 매니페스트에 같은 SemVer(`MAJOR.MINOR.PATCH`)를 기록하고 한 릴리스에서 함께 올린다.

- Claude Code: `.claude-plugin/plugin.json`
- Codex: `.codex-plugin/plugin.json`

현재 버전은 `0.1.0`이다. 런타임별 패키징만 고친 경우에도 제품의 PATCH 버전을 함께 올리며, Claude Code용과 Codex용 버전을 따로 운영하지 않는다. 마켓플레이스 정의에는 버전을 중복해서 적지 않는다.

## SemVer 기준

- **MAJOR** — 기존 사용법이 깨지는 변경. 스킬 이름·호출 방식 변경, 가이드 구조를 갈아엎어 `harness-craft`의 결과가 달라짐.
- **MINOR** — 하위 호환되는 추가. 새 가이드·스킬·원칙 추가.
- **PATCH** — 기존 사용법을 유지하는 수정. 문구 다듬기, 오타, 런타임별 패키징 수정.

커밋 타입과의 연결은 [git.md](git.md) 참조(`feat`→MINOR, `fix`→PATCH, `BREAKING CHANGE`→MAJOR).

## 로컬 개발

Codex에서 재설치를 강제하기 위한 build metadata(`0.1.0+codex.local...`)는 로컬 테스트용 사본에만 쓴다. 저장소의 두 매니페스트에는 정식 버전을 유지하고, 저장소를 직접 테스트했다면 커밋 전에 두 값이 다시 같은지 확인한다.

## 릴리스 절차

1. 변경 성격에 맞는 다음 버전을 정한다.
2. 두 `plugin.json`의 `version`을 같은 값으로 수정한다.
3. Claude Code·Codex 플러그인 검증과 스킬 검증을 실행한다.
4. `chore(plugin): vX.Y.Z` 커밋 후 push하고 같은 이름의 태그를 만든다.

```powershell
git tag vX.Y.Z
git push origin vX.Y.Z
```
