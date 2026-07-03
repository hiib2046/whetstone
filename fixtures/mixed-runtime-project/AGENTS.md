# AGENTS.md

코덱스 에이전트에게 로그 리포트 데이터를 사람이 읽을 요약 문서로 정리하는 일을 맡긴다. 데이터 집계는 Claude Code의 report 스킬이 이미 끝냈다고 가정하고, 이 문서는 그 결과물을 요약본으로 옮기는 절차만 다룬다.

## 리포트 요약 작성

- `out/data.json`(Claude Code의 report 스킬이 로그를 집계해 만들어 둔 파일)을 읽어 `out/summary.md`에 사람이 읽을 요약을 작성한다.
- `out/data.json`이 없으면 먼저 report 스킬을 실행해 데이터를 만들어야 한다고 안내하고 멈춘다 — 데이터를 추측해서 만들지 않는다.
- `summary.md` 형식: `총 로그 수: {total}` 한 줄 + 카테고리별 개수를 표로 정리.

### 입력·출력 예시

**정상**

입력(`out/data.json`):

```json
{ "total": 3, "byCategory": { "ERROR": 1, "WARN": 1, "INFO": 1 } }
```

출력(`out/summary.md`):

```
총 로그 수: 3

| 카테고리 | 개수 |
| --- | --- |
| ERROR | 1 |
| WARN | 1 |
| INFO | 1 |
```

**`out/data.json` 없음**

출력: `summary.md`를 만들지 않고, report 스킬을 먼저 실행해 데이터를 만들어야 한다고 안내하고 멈춘다.

## 커밋

- `summary.md` 변경은 별도 커밋으로 남긴다 — 데이터 집계(`out/data.json`)와 요약 문서 변경을 한 커밋에 섞으면 나중에 어느 쪽이 원인인지 추적하기 어렵다.
