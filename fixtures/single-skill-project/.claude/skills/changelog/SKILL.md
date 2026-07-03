---
name: write-changelog
description: 최근 git 커밋을 모아 CHANGELOG.md에 새 릴리즈 항목을 작성한다. 릴리즈 준비 중 "체인지로그 써줘", "release note 정리해줘"라고 할 때 사용한다.
---

# Changelog 작성

1. `git describe --tags --abbrev=0`로 최근 태그를 찾는다. 태그가 없으면 첫 커밋부터 전체 로그를 쓴다.
2. `git log <최근태그>..HEAD --oneline`으로 태그 이후 커밋 목록을 가져온다.
3. 각 커밋 메시지를 Added/Changed/Fixed/Removed 카테고리로 분류한다. Conventional Commits 접두사(`feat:`→Added, `fix:`→Fixed, `chore:`/`refactor:`→Changed, `revert:`→Removed)를 기준으로 분류하고, 접두사가 없는 커밋은 Changed로 둔다 — 카테고리가 없으면 릴리즈 노트를 읽는 사용자가 무엇이 새로 생겼고 무엇이 고쳐졌는지 구분하지 못한다.
4. 분류한 목록을 `## [날짜] 버전` 헤더 아래 카테고리별 불릿으로 CHANGELOG.md 최상단에 삽입한다(기존 항목은 그 아래로 밀려난다).
5. 버전 번호는 추측하지 않는다 — `package.json`의 `version` 필드가 있으면 그 값을 쓰고, 없으면 ask 도구로 사용자에게 버전을 묻는다.

## 입력·출력 예시

**태그 있고 버전 있음**

입력: 태그 `v1.2.0` 이후 커밋 3개(`feat: add dark mode`, `fix: crash on empty list`, `chore: bump deps`), `package.json`의 `version`이 `1.3.0`

출력:

```
## [2026-07-02] v1.3.0

### Added
- add dark mode

### Fixed
- crash on empty list

### Changed
- bump deps
```

**태그 없음**

입력: 태그 없음, 첫 커밋부터 전체 로그 2개(`feat: init project`, `docs: add readme`), `package.json`의 `version`이 `0.1.0`

출력:

```
## [2026-07-02] v0.1.0

### Added
- init project

### Changed
- add readme
```

**버전 정보 없음**

입력: 태그 `v1.2.0` 이후 커밋 1개(`fix: null pointer`), `package.json`이 없음

동작: ask 도구로 "이번 릴리즈 버전을 알려주세요"라고 묻는다. 사용자가 `v1.2.1`이라 답하면 그 값으로 `## [2026-07-02] v1.2.1` 헤더를 써서 이후는 위와 동일하게 진행한다.

## 완료조건

체인지로그 항목이 깔끔하고 보기 좋게 정리되면 완료.
