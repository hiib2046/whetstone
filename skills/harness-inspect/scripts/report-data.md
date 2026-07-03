# 리포트 데이터 계약

`render-report.mjs`의 입력 JSON 형식. 이 문서 + 아래 완전한 예시만 읽고 올바른 입력 JSON을 만들 수 있어야 한다.

실행: `node render-report.mjs <입력.json> <출력.html>`

## 최상위 필드

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `project` | string | O | 표시용 프로젝트 이름 |
| `scanDate` | string | O | 점검일 (예: `2026-07-02`) |
| `guideRef` | string | X (기본 `"guides/"`) | 판정 기준으로 쓴 가이드 경로, 헤더에 표시 |
| `harnesses` | Harness[] | O (빈 배열 가능) | 발견한 하네스들 |
| `loners` | LonerArtifact[] | O (빈 배열 가능) | 어디에도 안 묶인 단독 아티팩트 |
| `relatedGuesses` | RelatedGuess[] | O (빈 배열 가능) | 이름·주제만 비슷하고 연결 증거는 없는 쌍 |

`harnesses`와 `loners`가 **둘 다 빈 배열**이면 리포트는 탭 구성 대신 "하네스를 못 찾음" 안내 화면 하나만 낸다(에러 아님, 정상 케이스).

프로젝트 요약 통계(하네스 수·외톨이 수·개선 항목 수·심각 수)는 스크립트가 아래 데이터에서 직접 계산한다 — JSON에 따로 넣지 않는다.

## Harness

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | O | 하네스 내 고유 id. 영문/숫자/하이픈만 (탭 id·앵커로 씀) |
| `name` | string | O | 표시 이름 (예: `"블로그 하네스"`) |
| `status` | `"ok"｜"warn"｜"bad"` | O | 튼튼 / 주의 / 손봐야 함 |
| `summary` | string | O | 구성 방식 한 줄 요약 (문서형/분업형/코드형 혼합 여부, 공유 상태 등) |
| `nodes` | Node[] | O | 부품 노드 |
| `edges` | Edge[] | O (빈 배열 가능) | 연결 |
| `improvements` | Improvement[] | O (빈 배열 가능) | 개선 항목. 급한 순으로 정렬해서 줄 필요 없음(스크립트가 severity로 정렬) |
| `toBeChanges` | ToBeChanges \| null | X | 구조 관련 지적이 있을 때만. 없으면 생략하거나 `null` — 그러면 현재↔권장 토글이 렌더링되지 않는다 |

## Node (부품 노드)

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | O | 하네스 내 고유 id |
| `type` | `"skill"｜"agent"｜"hook"｜"script"｜"state"` | O | 스킬/에이전트/훅/스크립트/상태파일 — 이 다섯 종류만 |
| `label` | string | O | 노드에 표시할 이름 |
| `sub` | string | X | 부제 (예: `"문서형 스킬"`, `"즉석 디스패치"`) |
| `file` | string | X (권장) | 실제 파일 경로 |
| `order` | number | O | 레이아웃 열(가로) 위치. 작을수록 왼쪽 — 실행 순서를 그대로 반영한다. 같은 값이면 같은 열. |
| `lane` | number | X | 같은 열 안에서 세로 정렬 순서(작을수록 위). **정렬 키일 뿐 실제 좌표 간격에는 안 쓰인다.** 생략하면 등장 순서대로 자동 배정. |
| `step` | string | X | 실행 순서 배지에 표시할 문자열. 배지는 원(circle) 모양이 이미 그려지므로 안에 들어갈 텍스트는 **일반 숫자**(`"1"`, `"2"`, ...)를 쓸 것 — 원문자 유니코드(`①②③`)는 폰트에 따라 깨져 보일 수 있어 피한다. 주요 단계 노드에만 붙인다 — 모든 노드에 붙일 필요 없음. |
| `issue` | string | X | 이 노드 자체가 문제라면 해당 improvement의 `id`. 다이어그램에 경고 표시가 뜨고 클릭하면 개선 리스트로 이동한다. |
| `ghost` | boolean | X | 격리 세션처럼 흐릿하게 표시(예: `claude -p`로 뜨는 별도 세션) |
| `added` | boolean | X | **`toBeChanges.addNodes`에만 씀.** 권장 그림에서 "+ 추가됨" 표시가 붙는다. |

## Edge (연결)

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | X (권장) | 이 연결의 고유 id. **`toBeChanges.removeEdgeIds`가 참조하려면 반드시 명시할 것.** |
| `from` | string | O | 출발 노드 id |
| `to` | string | O | 도착 노드 id |
| `kind` | `"ref"｜"deleg"｜"code"｜"shared"｜"watch"` | O | 참조 / 서브에이전트 위임 / 코드 호출 / 공유 상태 / 훅 감시 |
| `label` | string | X | 연결선 위에 붙는 짧은 태그(예: `"쓰기"`, `"읽기"`, `"위임"`) |
| `evidence` | string | O | **근거 한 줄.** 왜 이 둘이 연결됐다고 판단했는지. 다이어그램에서 마우스오버(title)로 노출된다. |
| `loop` | boolean | X | 되돌아가는 루프 구간이면 `true` — 되돌아가는 곡선 화살표로 그려진다 |
| `gate` | `{ state: "ok"｜"missing", label: string, issue?: string }` | X | 검증 게이트 표시. `missing`이면 "게이트가 있어야 하는데 없다"는 뜻으로 빨간 표시 |
| `issue` | string | X | 이 연결 자체가 문제라면 해당 improvement의 `id` |

## Improvement (개선 항목)

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | O | 지목용 번호. 관례: `<하네스이름>-<순번>` (예: `블로그-1`) |
| `severity` | `"high"｜"mid"｜"low"` | O | 심각 / 보통 / 낮음. 급한 순 정렬 키 |
| `title` | string | O | 한 줄 제목 |
| `where` | string | O | 어디 — 파일·위치 |
| `why` | string | O | 왜 문제인가 |
| `how` | string | O | 어떻게 고치나 |
| `guideFile` | string | O | 추적 — 근거로 쓴 가이드 파일 (예: `guides/harness-guide.md`) |
| `principleBlock` | string | O | 추적 — 그 가이드의 원칙 블록 제목 |
| `question` | string | O | 추적 — 그 블록의 어느 점검 질문에서 나왔나 |
| `relatedNodeIds` | string[] | X | 다이어그램에서 이 항목과 함께 하이라이트할 노드 id들 |
| `relatedEdgeIds` | string[] | X | 다이어그램에서 이 항목과 함께 하이라이트할 연결 id들 |

## ToBeChanges (구조 변화 — 구조 지적이 있을 때만)

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `fromIssue` | string | O | 이 구조 변화가 나온 improvement의 `id` |
| `addNodes` | Node[] | X | 권장 그림에 추가되는 노드 (각자 `order`/`lane` 포함) |
| `removeNodeIds` | string[] | X | 권장 그림에서 제거되는 노드 id |
| `addEdges` | Edge[] | X | 권장 그림에 추가되는 연결 |
| `removeEdgeIds` | string[] | X | 권장 그림에서 제거되는 연결 id (반드시 `id`가 있는 연결만 참조 가능) |

상상으로 재설계한 그림 금지 — 여기 들어가는 변화는 실제 improvement 텍스트에 있는 것만 반영한다.

## LonerArtifact (외톨이 아티팩트)

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | O | 고유 id |
| `type` | `"skill"｜"agent"｜"hook"｜"script"｜"state"` | O | 종류 |
| `label` | string | O | 표시 이름 |
| `file` | string | X (권장) | 파일 경로 |
| `reasons` | string[] | O | 하네스로 안 묶인 이유 (근거 나열 — 직접 참조 없음, 공유 상태 없음 등) |
| `improvements` | Improvement[] | X (빈 배열 가능) | 개선 항목. Harness의 `improvements`와 동일 스키마 — 외톨이도 부품 품질 점검은 그대로 받으므로 위반이 있으면 여기 싣는다 |

## RelatedGuess (관련 추정 쌍)

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `a` | `{ label: string, file?: string }` | O | 첫 번째 아티팩트 |
| `b` | `{ label: string, file?: string }` | O | 두 번째 아티팩트 |
| `evidence` | string | O | 왜 관련 있어 보이는데 묶지 않았는지 근거 (예: "이름만 유사, 참조·공유 상태 흔적 없음") |

## 완전한 예시

`sample-data.json`이 실제로 돌아가는 완전한 예시다. 하네스 2개(하나는 손봐야 함 + 구조 지적으로 to-be 토글 있음, 하나는 튼튼), 외톨이 1개, 관련 추정 1쌍을 담고 있다. 그대로 복사해 필드만 바꿔도 된다.
