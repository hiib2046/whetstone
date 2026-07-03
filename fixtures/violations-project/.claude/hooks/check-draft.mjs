// 목적: posts/draft.md가 저장될 때마다 최소 분량 기준(50단어 이상)을 확인한다.
// 입력: stdin으로 훅 이벤트 JSON(tool_input.file_path 포함)을 받는다. 출력: 콘솔에 PASS/FAIL만 출력, exit code는 항상 0(막지 않음).
// 호출 주체: PostToolUse 훅으로 Write 도구 실행 뒤 클로드 코드 런타임이 호출한다.

import { readFileSync } from "node:fs";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const event = JSON.parse(input);

  // posts/draft.md 저장이 아니면 아무 것도 하지 않는다.
  if (!event.tool_input?.file_path?.endsWith("posts/draft.md")) {
    process.exit(0);
  }

  const content = readFileSync(event.tool_input.file_path, "utf-8");
  const wordCount = content.trim().split(/\s+/).length;

  if (wordCount >= 50) {
    console.log("PASS: draft.md word count", wordCount);
  } else {
    console.log("FAIL: draft.md too short", wordCount);
  }

  process.exit(0);
});
