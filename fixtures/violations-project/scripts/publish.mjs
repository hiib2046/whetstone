// 목적: posts/draft.md를 읽어 격리된 발행 세션(`claude -p`)에 넘기고 발행 결과를 받는다.
// 입력: 없음(고정 경로 posts/draft.md를 읽는다). 출력: stdout에 발행 결과 요약, exit code 0=성공/1=실패.
// 호출 주체: 사람이 터미널에서 직접 실행하거나, 배포 파이프라인이 마지막 단계로 실행한다.

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const DRAFT_PATH = "posts/draft.md";

async function main() {
  const draft = await readFile(DRAFT_PATH, "utf-8");

  // 발행은 되돌리기 어려운 외부 행동이라, 메인 세션과 분리된 새 컨텍스트에서 돌려
  // 초안 작성 과정의 편향이 발행 판단에 섞이지 않게 한다.
  const result = spawnSync(
    "claude",
    ["-p", `다음 블로그 초안을 발행 형식으로 다듬고 발행하라:\n\n${draft}`],
    { encoding: "utf-8" }
  );

  if (result.status !== 0) {
    console.error("발행 세션 실패:", result.stderr);
    process.exit(1);
  }

  console.log("발행 완료:", result.stdout);
}

main();
