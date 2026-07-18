# Git

## 브랜치

`main` 하나로 간다. 작업은 바로 `main`에 커밋한다. 솔로 관리라 브랜치 격리 비용이 이득보다 크다 — 실험이 커지면 그때 브랜치를 판다. (릴리스 태그는 SemVer 도입 후부터, [versioning.md](versioning.md) 참조.)

## 커밋 메시지 — Conventional Commits (한글로 쓴다)

형식:

```
<type>(<scope>): <제목>

<본문>

<푸터>
```

**type** — 무슨 종류의 변경인가:

- `feat` 기능 추가 · `fix` 버그 수정 · `docs` 문서 · `refactor` 동작 불변 구조 개선 · `test` 픽스처·검증 · `chore` 잡무(버전 올림·설정)

**scope**(선택) — 어디를 건드렸나. 최상위 디렉토리명을 쓴다: `guides`·`skills`·`docs`·`plugin`(메타 파일). 레포 전체에 걸치면 생략.

**제목** — `type(scope):` 뒤 한 줄 요약. **한글로 쓴다.** 명령형·현재형, 마침표 없음, 50자 안팎. 무엇을 했는지 한눈에 들어오게.

**본문**(선택) — 제목과 **빈 줄**로 구분한다. 제목 한 줄로 부족할 때만 쓴다. **"무엇"보다 "왜"** — 코드 diff가 무엇(what)은 이미 보여주니, 왜 바꿨나·무슨 문제를 풀었나·왜 이 방식을 골랐나를 적는다. 한글 문장, 줄바꿈 자유.

**푸터**(선택) — 하위호환을 깨면 `BREAKING CHANGE: <설명>`을 적는다. 이게 MAJOR 올림의 근거가 된다.

**타입과 버전의 연결:** `feat` → 보통 MINOR · `fix` → 보통 PATCH · `BREAKING CHANGE`(또는 `feat!`처럼 `type!`) → MAJOR. (버전 자리 의미는 [versioning.md](versioning.md).)

예시:

```
feat(guides): 입출력 원칙에 반례 조이기 추가
```
