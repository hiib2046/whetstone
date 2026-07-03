# 컨벤션 — 버전 관리 · Git

whetstone는 설치해서 쓰는 플러그인이라 두 가지가 고정돼야 한다: **`main`은 항상 설치 가능한 상태여야 하고, 버전이 곧 릴리스 신호다.** 이 문서는 버전을 언제·어떻게 올리나와 Git을 어떻게 쓰나를 정한다.

## 버전 관리 (SemVer)

**버전의 단일 출처는 `.claude-plugin/plugin.json`의 `version`.** `marketplace.json`에는 버전을 적지 않는다 — 두 곳을 맞추다 어긋나는 실수를 애초에 없앤다. Claude Code는 이 값이 바뀔 때 업데이트를 감지한다(값이 없으면 커밋 SHA로 대체).

형식은 `MAJOR.MINOR.PATCH`. 이 플러그인의 "제품"은 가이드 + 두 스킬(craft·inspect)이므로 각 자리의 의미는:

- **MAJOR** — 기존 사용법이 깨지는 변경. 스킬 이름·호출 방식 변경, 리포트 데이터 계약(`skills/harness-inspect/scripts/report-data.md`)의 하위호환 깨짐, 가이드 구조를 갈아엎어 craft·inspect의 판정 결과가 달라짐.
- **MINOR** — 하위호환되는 추가. 새 가이드·스킬·런타임 reference 추가, 새 점검 항목.
- **PATCH** — 판정·동작을 바꾸지 않는 수정. 문구 다듬기, 스크립트 버그 픽스, 오타.

**언제 올리나:** 사용자가 설치해서 체감할 변경을 `main`에 넣을 때 함께 올린다. 내부 픽스처·리포트 산출물만 바뀐 커밋은 버전을 올리지 않는다.

## Git

### 브랜치
- `main` — 항상 설치 가능한 안정 상태. 사용자는 여기서 바로 설치한다.
- 작업은 브랜치에서 하고(`feat/...`·`fix/...`·`docs/...`) `main`으로 합친다.

### 커밋 메시지
`<범위>: <요약>` 한 줄, 명령형. 범위는 최상위 디렉토리명을 쓴다: `guides`·`skills`·`fixtures`·`docs`·`plugin`(메타 파일). 예:

- `guides: 입출력 원칙에 반례 조이기 추가`
- `skills: harness-inspect 묶기 규칙 오탐 수정`
- `plugin: v0.2.0`

본문은 필요할 때만 "왜"를 적는다.

### 태그 = 릴리스
버전을 올린 커밋에 `vX.Y.Z` 태그를 단다(plugin.json의 version과 일치). 태그가 있으면 사용자가 특정 버전을 고정해 설치할 수 있다:

```
/plugin marketplace add hiib2046/whetstone@v0.2.0
```

### 회귀 검증 게이트
`harness-inspect`의 탐지·묶기·판정 동작을 바꿨으면 커밋 전에 `fixtures/`로 회귀 검증한다(각 픽스처의 `answers.md`와 대조). 판정 로직이 바뀌면 픽스처 정답지도 함께 갱신한다. (AGENTS.md 원칙)

## 릴리스 절차

1. `plugin.json`의 `version`을 SemVer 규칙대로 올린다.
2. `plugin: vX.Y.Z` 커밋.
3. `git tag vX.Y.Z && git push --tags`.
