# violations-project 정답지

이 픽스처를 분석한 리포트와 기계적으로 대조하기 위한 문서. `guides/`의 원칙 블록 제목·점검 질문은
2026-07-02 기준 `guides/common-guide.md`·`guides/skill-guide.md`·`guides/agent-guide.md`·`guides/harness-guide.md`
원문을 그대로 인용한다.

---

## 1. 기대 하네스 묶음

### 하네스 A — 블로그 (문제 많음)

**부품:**

| 부품 | 경로 | 구성 방식 |
| --- | --- | --- |
| 초안 스킬 | `.claude/skills/blog-draft/SKILL.md` | 문서형 |
| writer 서브에이전트 본문 | `.claude/skills/blog-draft/agents/writer.md` | 분업형-즉석 (스킬이 프롬프트로 디스패치, 미등록) |
| 검토 에이전트 | `.claude/agents/reviewer.md` | 분업형-등록 (`name`·`description` 있음) |
| 발행 스크립트 | `scripts/publish.mjs` | 독립세션·코드형 (`claude -p` 호출) |
| 초안 저장 훅 | `.claude/settings.json`의 `PostToolUse` → `.claude/hooks/check-draft.mjs` | 훅 |
| 공유 상태 | `posts/draft.md` | — |

**연결 근거:**

| 무엇 → 무엇 | 종류 | 근거 |
| --- | --- | --- |
| `blog-draft/SKILL.md` → `blog-draft/agents/writer.md` | 위임(분업형-즉석) | SKILL.md 절차 2: "`agents/writer.md`에 적힌 프롬프트로 서브에이전트 하나를 띄워 초안 작성을 맡긴다" — 경로로 직접 가리킴 |
| `blog-draft/agents/writer.md` → `posts/draft.md` | 공유 상태(쓰기) | SKILL.md 절차 3: 서브에이전트가 돌려준 본문을 `posts/draft.md`에 저장 |
| `blog-draft/SKILL.md` → `.claude/agents/reviewer.md` | 직접 참조 | SKILL.md 절차 4: "`.claude/agents/reviewer.md`가 이 `posts/draft.md`를 검토용으로 읽어 품질을 확인하는 별도 에이전트로 프로젝트에 등록돼 있다" |
| `reviewer.md` ↔ `posts/draft.md` | 공유 상태(읽기+쓰기) | reviewer.md 절차 1·3: `posts/draft.md`를 읽고, 미달이면 덮어씀 |
| `scripts/publish.mjs` → `posts/draft.md` | 공유 상태(읽기) | publish.mjs: `readFile(DRAFT_PATH)` (`DRAFT_PATH = "posts/draft.md"`) |
| `scripts/publish.mjs` → `claude -p` 세션 | 코드 호출 | publish.mjs: `spawnSync("claude", ["-p", ...])` |
| `settings.json`(`PostToolUse`/`Write`) → `check-draft.mjs` → `posts/draft.md` | 훅 감시 | settings.json의 `PostToolUse` 훅이 `check-draft.mjs`를 실행하고, 스크립트가 `tool_input.file_path`가 `posts/draft.md`로 끝나는 경우만 검사 |

**실행 순서:**

1. 사용자가 `blog-draft` 스킬 호출 (문서형 진입점)
2. 스킬이 `agents/writer.md` 프롬프트로 writer 서브에이전트를 즉석 디스패치 → `posts/draft.md` 저장
3. (훅) `Write` 도구 호출 직후 `check-draft.mjs`가 분량을 검사해 콘솔에만 출력
4. 스킬이 자기 판단으로 완료 표시 (reviewer 결과를 기다리지 않음)
5. (별도 트리거, 순서 고정 아님) `reviewer.md`가 메인 루프에 의해 호출되면 `posts/draft.md`를 읽고 미달 시 재작성 — **루프 위치**
6. `scripts/publish.mjs`가 `posts/draft.md`를 읽어 `claude -p` 격리 세션으로 발행

**루프 위치:** `reviewer.md` 절차 3→4 (품질 기준 미달이면 다시 쓰고 다시 검토, 반복).

### 하네스 B — 배포 (튼튼)

**부품:**

| 부품 | 경로 | 구성 방식 |
| --- | --- | --- |
| 배포 스킬 | `.claude/skills/deploy/SKILL.md` | 문서형 |
| prod 가드 훅 | `.claude/settings.json`의 `PreToolUse` → `.claude/hooks/guard-deploy.mjs` | 훅 |

**연결 근거:**

| 무엇 → 무엇 | 종류 | 근거 |
| --- | --- | --- |
| `deploy/SKILL.md` → `guard-deploy.mjs` | 직접 참조 + 훅 감시 | SKILL.md 절차 4: "`prod`로 배포할 때는 `.claude/hooks/guard-deploy.mjs` 훅이 실행 전에 `CONFIRM_PROD=1` ... 확인" / settings.json `PreToolUse`(`Bash`) → `guard-deploy.mjs`가 `deploy.sh prod` 명령을 가로챔 |

**실행 순서:** 테스트 → 빌드 → 환경 확인(빈칸이면 질문) → `deploy.sh <env>` 실행 시도 → (훅 게이트) `prod`면 `CONFIRM_PROD=1` 없으면 차단 → 완료(종료 코드 0/비0).
루프 없음.

**상태:** 위반-5(사소) 제외 건강.

### 외톨이

`.claude/agents/lonely-helper.md`(`changelog-summarizer`) — `CHANGELOG.md`만 다루며 블로그·배포 하네스의 어떤 파일도 참조·공유하지 않음. 위반 없음.

---

## 2. 심은 위반 목록

### 위반-1

- **파일:** `.claude/skills/blog-draft/SKILL.md` (완료조건 절)
- **내용:** 완료조건이 "글이 충분히 매끄러우면 완료"라는 형용사·주관적 표현으로만 돼 있어 기계가 통과/실패를 판정할 수 없다.
- **걸려야 할 가이드:** `guides/common-guide.md` — 원칙 블록 "완료조건은 검증 가능하게 (형용사 금지)"
  - 점검 질문: "완료조건이 형용사·주관적 표현("깨끗·충분·잘")으로 돼 있나?"
- **기대 심각도:** 보통 (±1 허용)

### 위반-2

- **파일:** `.claude/skills/blog-draft/SKILL.md` (완료조건 절)
- **내용:** 초안을 쓴 스킬 자신이 스스로 다시 읽고 통과를 판정하며, 프로젝트에 있는 `reviewer.md`의 검토 결과나 다른 세션·사람의 확인을 기다리지 않고 완료로 넘어간다(self-report).
- **걸려야 할 가이드:** `guides/harness-guide.md` — 원칙 블록 "검증은 필요한 곳에 (self-report를 믿지 마라)"
  - 점검 질문: "완료가 self-report로 확정되는 자리가 있나?"
- **기대 심각도:** 심각 (±1 허용)

### 위반-3

- **파일:** `.claude/agents/reviewer.md` (절차 4)
- **내용:** "모든 기준을 만족할 때까지 반복한다"만 있고 종료 게이트(더 돌 필요가 있는지 사전 확인)도, 최대 N사이클 안전밸브도, 강제 종료와 성공 종료의 구분도 없다.
- **걸려야 할 가이드:** `guides/harness-guide.md` — 원칙 블록 "루프엔 Stop Rule을 (성공 종료·강제 종료 둘 다)"
  - 점검 질문: "루프에 종료 게이트가 앞단에 있나? 최대 N사이클 안전밸브가 있나? 강제 종료(N 도달)와 성공 종료가 구분되나 — 강제 종료 결과가 조용히 완료로 넘어가진 않나?"
- **기대 심각도:** 심각 (±1 허용)

### 위반-4

- **파일:** `.claude/settings.json`(`PostToolUse` 훅) + `.claude/hooks/check-draft.mjs`
- **내용:** 훅이 `posts/draft.md`의 분량을 검사하지만 결과(PASS/FAIL)를 `console.log`로만 출력하고 어떤 파일에도 남기지 않는다. 다음 회차나 다른 세션(예: `reviewer.md`, `publish.mjs`)이 이미 검사됐는지, 결과가 무엇이었는지 읽을 방법이 없다.
- **걸려야 할 가이드:** `guides/harness-guide.md` — 원칙 블록 "상태는 대화 밖으로 (멱등·재개·SSOT)"
  - 점검 질문: "대화·메모리 밖(다음 회차·다른 세션·코드·검증자)에서 읽혀야 할 상태를 대화·메모리에만 들고 있나?"
- **기대 심각도:** 보통 (±1 허용)

### 위반-5

- **파일:** `.claude/skills/deploy/SKILL.md`
- **내용:** 입출력 예시가 하나도 없다(절차·완료조건만 서술).
- **걸려야 할 가이드:** `guides/common-guide.md` — 원칙 블록 "입출력 예시는 필수"
  - 점검 질문: "가장 적합한 대표 입출력 예시가 있나?"
- **기대 심각도:** 낮음 (±1 허용)

---

## 3. 기대 리포트 행동

- **블로그 하네스와 배포 하네스가 서로 다른 블록(탭)으로 분리**돼 나타난다 — 부품이 겹치지 않고 공유 상태(`posts/draft.md`)나 참조도 서로 섞이지 않으므로 하나로 묶이면 안 된다.
- **외톨이(`lonely-helper.md`)는 하네스 A·B 어디에도 속하지 않고 별도로 표시**된다(요약 스펙의 "외톨이" 탭). 이름·주제상으로도 블로그·배포와 유사하지 않으므로 "관련 추정"으로도 안 묶인다.
- **블로그 하네스는 "손봐야 함" 상태**로 표시된다 — 위반-1·2·3·4 네 건(그중 둘은 심각)이 걸려 있다.
- **배포 하네스는 건강한 상태로 표시**된다 — 위반-5 한 건(낮음)만 걸려 있고 나머지는 가이드를 준수한다.
- 개선 리스트의 다섯 항목 모두 위 표의 파일 경로·가이드 파일·원칙 블록 제목·점검 질문과 **1:1로 추적**돼야 하며, 정답지에 없는 여섯 번째 위반이 나오면 오탐이다.
