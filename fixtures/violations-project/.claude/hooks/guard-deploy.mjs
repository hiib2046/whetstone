// 목적: prod 배포 명령이 CONFIRM_PROD=1 없이 실행되지 않도록 막는다.
// 입력: stdin으로 훅 이벤트 JSON(tool_input.command 포함). 출력: 차단 시 exit code 2 + stderr에 사유, 통과 시 exit code 0.
// 호출 주체: PreToolUse 훅으로 Bash 도구 실행 전 클로드 코드 런타임이 호출한다.

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const event = JSON.parse(input);
  const command = event.tool_input?.command ?? "";

  // prod 배포만 막는다 — staging 등 다른 환경은 그대로 통과.
  const isProdDeploy = /deploy\.sh\s+prod/.test(command);
  if (isProdDeploy && process.env.CONFIRM_PROD !== "1") {
    console.error("prod 배포는 CONFIRM_PROD=1 없이 실행할 수 없습니다.");
    process.exit(2);
  }

  process.exit(0);
});
