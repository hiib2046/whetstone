# 코덱스(OpenAI Codex CLI) 아티팩트 탐지 카탈로그

**목적**: `harness-inspect` 스킬이 프로젝트에서 OpenAI Codex CLI 하네스 부품을 "모양으로" 알아보기 위한 참고 자료. `SKILL.md`의 탐지 표(2단계)를 코덱스 한정으로 확장한다.

**조사 기준일**: 2026-07-02. 주요 출처: `developers.openai.com/codex/*`(공식 문서, `.md` 접미사로 원문 확인) 및 `github.com/openai/codex`, `github.com/openai/skills`. 코덱스는 변경이 빠른 제품이라, 아래 내용은 이 기준일 시점 값이다 — 버전에 따라 달라질 수 있는 항목은 각 절에 명시했다.

**출처가 갈린 부분**: 일부 서드파티 블로그·`WebSearch` 요약은 스킬 경로를 `~/.codex/skills`, `.codex/skills`로 설명한다. 하지만 공식 문서 원문(`developers.openai.com/codex/skills.md`)과 마이그레이션 가이드(`openai/skills` 저장소)를 직접 확인한 결과, 현재 표준 경로는 `.agents/skills`(레포)·`$HOME/.agents/skills`(사용자)다. 아래 표는 공식 원문을 따르되, 구버전 프로젝트에서 `~/.codex/skills`가 여전히 보일 수 있다는 점도 남겨둔다.

---

## 1. AGENTS.md — 상시 로드 지침 문서

**알아보는 모양**: 파일명 `AGENTS.md` 또는 `AGENTS.override.md`. 위치는 두 스코프:
- 전역: `~/.codex/AGENTS.override.md` 없으면 `~/.codex/AGENTS.md` (`CODEX_HOME` 환경변수로 위치 변경 가능)
- 프로젝트: Git 루트부터 현재 디렉토리까지 내려오며 각 레벨에서 `AGENTS.override.md` → `AGENTS.md` → (설정된 경우) `project_doc_fallback_filenames` 순으로 탐색. 같은 레벨에서 override가 있으면 나머지는 건너뜀.

여러 레벨에서 발견된 파일은 루트→현재 순으로 이어붙여 하나의 프롬프트가 된다(뒤에 오는, 즉 현재 디렉토리에 가까운 파일이 우선). 기본 합산 상한은 `project_doc_max_bytes`(기본 32KiB) — 넘으면 이후 파일은 잘림.

**하네스 부품으로서의 성격**: 클로드 코드의 `CLAUDE.md`와 동일한 역할 — 스킬(온디맨드 로드)이 아니라 **세션마다 항상 주입되는 규약 문서**. `guides/skill-guide.md` 기준이 아니라 "항상 로드되는 지침"으로서 harness-guide/common-guide 관점(범위·최신성·과도한 분량)으로 봐야 한다.

**연결 근거**: 다른 부품(스킬·훅·서브에이전트)이 AGENTS.md 안에서 이름·경로로 언급되면 직접 참조로 인정. `@path` 임포트 문법은 코덱스 AGENTS.md에서 공식 지원되지 않으므로(클로드 코드와 다름), 본문에 파일 경로가 텍스트로만 적혀 있어도 실제 로드 여부는 확정하지 말고 "언급"으로만 취급.

**탐지 시 주의**: `~/.codex/AGENTS.md`(전역)는 사용자가 전역 점검을 명시했을 때만 후보에 넣는다(SKILL.md 1단계 규칙과 동일).

---

## 2. config.toml — 설정/구성 파일

**알아보는 모양**:
- 전역: `~/.codex/config.toml`
- 프로젝트: `.codex/config.toml` — 현재 디렉토리부터 프로젝트 루트까지 걸어 올라가며 발견되는 모든 `.codex/config.toml`을 레이어링(가까운 파일이 우선). **신뢰(trust)된 프로젝트에서만 로드된다** — 즉 프로젝트 config.toml이 있어도 실제로 적용 안 될 수 있음을 감안.
- 프로파일: `~/.codex/<profile-name>.config.toml` (또는 base config 안 `[profiles.<name>]` 테이블), `codex --profile <name>`로 활성화.

주요 키(내용 특징으로 식별): `model`, `model_provider`, `model_providers.<id>`, `approval_policy`, `sandbox_mode`, `sandbox_workspace_write.*`, `mcp_servers.<id>`, `project_doc_fallback_filenames`, `project_doc_max_bytes`, `notify`, `[hooks.*]`, `[agents]`(서브에이전트 전역 설정: `max_threads`·`max_depth`), `permissions.<name>.*`, `features.*`.

**하네스 부품으로서의 성격**: 상태/설정 파일. 그 자체로는 동작하지 않지만 다른 부품(훅·MCP 서버·프로파일·서브에이전트)의 **연결 근거**로 쓰인다.

**연결 근거로 쓸 수 있는 흔적**:
- `mcp_servers.<id>`에 정의된 서버 이름이 스킬의 `agents/openai.yaml`의 `tools` 배열에서 참조되면 직접 참조.
- `[hooks.*]` 테이블이 통째로 여기 있으면 훅이 이 파일에 인라인으로 정의된 것 — 별도 `hooks.json` 없이도 훅으로 인정.
- `notify = [...]`가 가리키는 스크립트 경로 — 아래 4절 참고.

---

## 3. 스킬 — SKILL.md (`.agents/skills`)

**알아보는 모양**: `SKILL.md` 파일(YAML frontmatter에 `name`·`description` 필수). 디렉토리 구조는 클로드 코드와 동일한 관례: `scripts/`(실행 스크립트), `references/`(온디맨드 참고문서), `assets/`(템플릿), 추가로 코덱스 고유의 `agents/openai.yaml`(선택, UI 메타데이터·`allow_implicit_invocation`·`tools` 의존성 선언).

**위치(스코프별)**:
- 레포(현재): 현재 디렉토리부터 부모·레포 루트까지의 `.agents/skills`
- 사용자: `$HOME/.agents/skills`
- 관리자: `/etc/codex/skills`
- 시스템: 코덱스에 번들된 내장 스킬(예: `skill-creator`)

구버전이거나 마이그레이션 전 프로젝트에서는 `~/.codex/skills`, `.codex/skills` 경로가 남아 있을 수 있다 — 발견 시 후보에서 빼지 말고, 어느 경로였는지 그대로 기록한다.

**하네스 부품으로서의 성격**: 클로드 코드 `SKILL.md`와 동일 — 문서형 스킬. `guides/skill-guide.md` 기준을 그대로 적용 가능(프로그레시브 디스클로저·명시/암묵 호출 개념이 동일하게 존재).

**연결 근거**: `agents/openai.yaml`의 `tools` 배열이 가리키는 MCP 서버가 `config.toml`의 `mcp_servers.<id>`와 이름이 일치하면 직접 참조. `SKILL.md` 본문이 `scripts/*` 경로를 실행 지시로 가리키면 그 스크립트와 연결.

---

## 4. 커스텀 프롬프트 — `~/.codex/prompts/*.md` (레거시)

**알아보는 모양**: `~/.codex/prompts/` 디렉토리 바로 아래(하위 디렉토리 없이) 놓인 `.md` 파일. 파일명(확장자 제외)이 곧 슬래시 명령 이름(`deploy.md` → `/deploy` 또는 `/prompts:deploy`). frontmatter에 `description`·`argument-hint` 등 메타데이터, 본문에 `$1`~`$9`·`$ARGUMENTS`·대문자 이름 placeholder(`$FILE` 등) 사용.

**하네스 부품으로서의 성격**: 공식 문서가 **"deprecated in favor of skills"**로 명시. 명시적 슬래시 호출만 가능(암묵 호출 없음)하고 레포 공유가 안 되는(사용자 홈 전용) 구식 메커니즘. 발견하면 스킬(3절)과 구분해서 기록하고, 점검 리포트에서는 "스킬로 이전 검토" 소재로 다룰 수 있다 — 단 이건 harness-inspect의 개선 제안 영역이지 탐지 자체의 문제는 아니다.

**연결 근거**: 프롬프트 본문이 다른 프롬프트/스크립트 경로를 텍스트로 언급하면 참조로 취급(코덱스가 이를 자동 실행하는 건 아니므로 "직접 참조"보다는 약한 근거로 다룬다).

---

## 5. 훅 — `hooks.json` / `[hooks.*]`, 그리고 레거시 `notify`

코덱스에는 두 세대의 훅 메커니즘이 공존한다. 둘 다 훅으로 인정하되 성격이 다르다는 점을 리포트에 남긴다.

### 5-1. 현행 훅 (`hooks.json` / config.toml의 `[hooks.*]`)

**알아보는 모양**: 파일 `~/.codex/hooks.json`(전역) 또는 `<repo>/.codex/hooks.json`(프로젝트), 혹은 `config.toml` 안의 `[[hooks.<EventName>]]` TOML 테이블. 여러 레이어(전역+프로젝트)가 발견되면 **병합**된다(상위가 하위를 덮어쓰지 않음) — 클로드 코드 설정 병합과 다른 지점이므로 묶기 단계에서 유의.

이벤트 이름으로 식별: `SessionStart`, `SubagentStart`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStop`, `Stop`. 구조는 `이벤트 → matcher → hooks[](type="command", command=...)` 3단 계층.

**하네스 부품으로서의 성격**: 클로드 코드 훅과 동일 매핑 — 라이프사이클에 코드를 끼우는 훅. `matcher`가 도구 이름(`Bash`, `apply_patch`, MCP 도구명)을 정규식으로 필터링하는 점, `PreToolUse`에서 `permissionDecision: deny/allow` + `updatedInput`으로 입력을 재작성할 수 있는 점은 클로드 코드보다 세밀하다.

**연결 근거**: `command` 필드가 가리키는 스크립트 경로가 프로젝트 안에 실재하면 직접 참조. 신뢰되지 않은 훅은 `/hooks`로 승인 전까지 실행되지 않으므로("Codex requires you to review and trust the exact hook definition"), 정의만 있고 신뢰 안 된 훅도 아티팩트로는 기록하되 "미신뢰 상태일 수 있음"을 덧붙인다.

### 5-2. 레거시 `notify` (config.toml 단일 키)

**알아보는 모양**: `config.toml`의 `notify = ["명령어", "인자", ...]` 한 줄. `hooks.json`보다 오래된 방식으로, 이벤트가 훨씬 단순(주로 `agent-turn-complete` 하나)하고 외부 프로그램에 JSON(`type`·`thread-id`·`turn-id`·`cwd`·`input-messages`·`last-assistant-message` 등)을 인자로 던지기만 한다 — 승인/차단 같은 제어 흐름은 없음(단방향 알림).

**하네스 부품으로서의 성격**: 훅이지만 "차단·재작성 가능한 훅"이 아니라 "알림 전용 훅"이라는 점을 5-1과 구분해서 표기.

**탐지 시 주의**: `notify`와 `hooks.json`이 둘 다 있는 프로젝트도 정상이다(하위 호환 유지 목적) — 하나로 합치라는 지적을 임의로 달지 말고, 실제로 같은 이벤트를 중복 처리하는지 근거(둘 다 같은 스크립트를 가리키는지 등) 없이는 문제로 보지 않는다.

---

## 6. 서브에이전트 — `.codex/agents/*.toml`

**알아보는 모양**: 독립 `.toml` 파일 하나당 에이전트 하나. 위치는 `~/.codex/agents/`(개인) 또는 `.codex/agents/`(프로젝트) — **스킬의 `.agents/skills`와 디렉토리 명명이 다르다**(`.codex/agents` vs `.agents/skills`). 이 불일치는 공식 문서에서도 그대로 관찰되는 것이라 임의로 통일해서 서술하지 않는다.

필수 필드: `name`, `description`, `developer_instructions`. 선택 필드: `model`, `sandbox_mode`, `mcp_servers`(생략 시 부모 세션 설정 상속). 내장 에이전트 3종(`default`·`worker`·`explorer`)은 파일 없이 코덱스에 내장되어 있으므로 탐지 대상이 아니다.

**하네스 부품으로서의 성격**: 클로드 코드의 "정식 등록 에이전트"(frontmatter `name`+`description` 있는 `.md`)와 동일한 자리 — `guides/agent-guide.md` 전체 적용. 단 위임 트리거가 `description` 텍스트 매칭이 아니라 사용자의 명시적 요청 또는 `/agent` 명령이라는 점은 다르므로, agent-guide의 "설명(description)만으로 라우팅되는가" 류 점검 질문은 코덱스 서브에이전트에 기계적으로 적용하지 말고 실제 호출 방식을 확인한 뒤 판단한다.

**연결 근거**: `config.toml`의 `[agents]`(`max_threads`·`max_depth`)가 있으면 서브에이전트 기능이 활성 구성되어 있다는 방증. 서브에이전트 TOML의 `mcp_servers` 필드가 `config.toml`의 `mcp_servers.<id>`와 이름이 일치하면 직접 참조.

---

## 7. `codex exec` — 코드형 하네스에서 호출되는 형태

**알아보는 모양**: 스크립트(`.mjs`·`.py`·쉘 등) 안에서 `codex exec "..."` 또는 `codex exec --json`/`--output-schema <schema>` 형태의 비대화형 호출. `CODEX_API_KEY=... codex exec ...`처럼 환경변수와 함께 쓰이기도 함. GitHub Actions 맥락이면 `openai/codex-action` 사용도 동급으로 취급.

**하네스 부품으로서의 성격**: 클로드 코드의 `claude -p`/`claude --print`와 동일한 자리 — SKILL.md 탐지 표의 "스크립트(독립세션·코드형)" 행. 진행 상황은 stderr로 스트리밍되고 최종 메시지만 stdout에 찍히는 것이 특징이라, 호출부 코드가 stdout만 파싱하는지 stderr까지 섞어 읽는지가 harness-guide 관점(핸드오프 신뢰성)의 점검거리가 될 수 있다.

**연결 근거**: 호출 시 넘기는 프롬프트 문자열이 특정 스킬/에이전트를 명시적으로 지목하면(`$skill-name` 멘션, `--profile` 플래그로 특정 프로파일 지정 등) 그 스킬·프로파일과 직접 참조로 묶는다.

---

## 8. 탐지 시 공통 주의사항

- **전역 스코프 기본 제외**: `~/.codex/`(AGENTS.md·config.toml·prompts·skills·agents·hooks.json 전부)는 SKILL.md 1단계 규칙대로 사용자가 전역 점검을 명시할 때만 후보에 넣는다. 프로젝트 안의 `.codex/`·`.agents/`는 항상 대상.
- **버전 의존 표시**: 훅의 `PreToolUse`/`PostToolUse`, `UserPromptSubmit`은 비교적 최근(2026년 상반기) 추가된 이벤트로 보고됨 — 오래된 코덱스 버전의 프로젝트에서는 `hooks.json`이 있어도 이 이벤트들이 없을 수 있다. 발견한 이벤트 이름을 그대로 기록하고 지어내지 않는다.
- **스킬 경로 이중성**: 같은 프로젝트에 `.agents/skills`와 `.codex/skills`가 동시에 있으면 둘 다 후보로 잡고, 어느 쪽이 실제로 로드되는지는 확인 못 했다는 사실을 판정에 남긴다(추측 금지).
