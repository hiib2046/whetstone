#!/usr/bin/env node
/**
 * 목적: 하네스 점검 분석 결과 JSON을 읽어 오프라인 단일 HTML 대시보드 리포트로 렌더링한다.
 * 동작 요약: 데이터 계약(report-data.md)에 맞는 JSON을 입력받아, 요약/하네스별/외톨이 탭과
 *   하네스별 구조 다이어그램(레이아웃·라벨 배치는 이 스크립트가 계산), 개선 리스트를 서버 사이드에서
 *   전부 정적 마크업으로 생성한다. 다이어그램 도형·선은 직선·정확한 좌표의 매끈한 정적 SVG 패스로
 *   그린다(손그림 질감 없음). 노드/엣지 라벨 크기는 실측(문자 폭 어림) 기반이라 격자 크기·엣지 라벨
 *   위치가 내용에 맞게 늘어나며 겹치지 않는다.
 *   클라이언트 JS는 탭 전환·아코디언·하이라이트·as-is/to-be 토글·다이어그램 휠 줌/드래그 팬/전체 보기 같은
 *   순수 표시 전환만 담당하고 그림을 다시 계산하거나 그리지 않는다(재계산 없음).
 * 입출력: 인자 2개 — [1] 입력 JSON 경로, [2] 출력 HTML 경로. stdin/stdout 미사용.
 *   성공 시 exit 0, 인자 누락·파일 읽기 실패·JSON 파싱 실패 시 stderr에 메시지 후 exit 1.
 * 호출 주체: 하네스 점검 스킬(harness-inspect)의 마지막 단계에서 실행된다.
 */

import { readFileSync, writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// 진입점
// ---------------------------------------------------------------------------

function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error("사용: node render-report.mjs <입력.json> <출력.html>");
    process.exit(1);
  }

  let raw;
  try {
    raw = readFileSync(inputPath, "utf8");
  } catch (err) {
    console.error(`입력 파일을 읽을 수 없음: ${inputPath} (${err.message})`);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`입력 JSON 파싱 실패: ${err.message}`);
    process.exit(1);
  }

  const html = buildReportHtml(normalizeInput(data));

  try {
    writeFileSync(outputPath, html, "utf8");
  } catch (err) {
    console.error(`출력 파일을 쓸 수 없음: ${outputPath} (${err.message})`);
    process.exit(1);
  }
}

// 필수 배열 필드가 없으면 빈 배열로 채운다 — 나머지 필드 누락은 사용자 입력 오류로 그대로 드러나게 둔다.
function normalizeInput(data) {
  return {
    project: data.project || "(이름 없음)",
    scanDate: data.scanDate || "",
    guideRef: data.guideRef || "guides/",
    harnesses: Array.isArray(data.harnesses) ? data.harnesses : [],
    loners: Array.isArray(data.loners) ? data.loners : [],
    relatedGuesses: Array.isArray(data.relatedGuesses) ? data.relatedGuesses : [],
  };
}

// ---------------------------------------------------------------------------
// 공통 유틸
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJs(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

const SEV_RANK = { high: 0, mid: 1, low: 2 };
const SEV_LABEL = { high: "심각", mid: "보통", low: "낮음" };
const SEV_CLASS = { high: "high", mid: "mid", low: "low" };
const SEV_COLOR = { high: "var(--red)", mid: "var(--amber)", low: "var(--dim)" };

const STATUS_LABEL = { ok: "튼튼", warn: "주의", bad: "손봐야 함" };
const STATUS_DOT = { ok: "green", warn: "amber", bad: "red" };

const TYPE_META = {
  skill: { label: "스킬", shape: "roundrect", color: "var(--skill)" },
  agent: { label: "에이전트", shape: "hexagon", color: "var(--agent)" },
  hook: { label: "훅", shape: "diamond", color: "var(--hook)" },
  script: { label: "스크립트", shape: "parallelogram", color: "var(--script)" },
  state: { label: "상태파일", shape: "cylinder", color: "var(--state)" },
};

const EDGE_META = {
  ref: { label: "참조", color: "var(--dim)", dash: "", w: 1.6 },
  deleg: { label: "서브에이전트 위임", color: "var(--deleg)", dash: "", w: 1.8 },
  code: { label: "코드 호출", color: "var(--code)", dash: "", w: 2.6 },
  shared: { label: "공유 상태", color: "var(--dim)", dash: "7 5", w: 1.6 },
  watch: { label: "훅 감시", color: "var(--hook)", dash: "1.5 5", w: 1.6 },
};

function sevOfFactory(improvements) {
  const map = new Map(improvements.map((f) => [f.id, f.severity]));
  return (issueId) => map.get(issueId);
}

// ---------------------------------------------------------------------------
// 텍스트 실측(어림) — 브라우저 DOM 없이 서버 사이드에서 겹침을 막는 기준선.
// 정확한 픽셀값이 목적이 아니라 "절대 과소평가하지 않는" 안전한 상한을 어림한다.
// ---------------------------------------------------------------------------

function charWidth(ch, fontSize, mono) {
  const code = ch.codePointAt(0);
  const isWide =
    (code >= 0xac00 && code <= 0xd7a3) || // 한글 음절
    (code >= 0x1100 && code <= 0x11ff) || // 한글 자모
    (code >= 0x3130 && code <= 0x318f) || // 한글 호환 자모
    (code >= 0x3000 && code <= 0x303f) || // CJK 기호·구두점
    (code >= 0xff00 && code <= 0xffef); // 전각 형태
  if (isWide) return fontSize * 1.02;
  if (mono) return fontSize * 0.62;
  if ("iIl.,:;'`|!()[]{}".includes(ch)) return fontSize * 0.34;
  if ("mMWw@%#".includes(ch)) return fontSize * 0.82;
  return fontSize * 0.58;
}

function measureText(text, fontSize, { mono = false, letterSpacing = 0 } = {}) {
  const s = String(text ?? "");
  let w = 0;
  for (const ch of s) w += charWidth(ch, fontSize, mono);
  if (s.length > 1) w += (s.length - 1) * letterSpacing;
  return w;
}

// ---------------------------------------------------------------------------
// 노드 크기 실측 + 다이어그램 레이아웃
// order(열) 기준 왼→오 배치, 열 안에서는 lane 정렬 키로 행 배정 — 실행 순서를 그대로 반영하는
// 자리(order/lane)는 사람이 심은 값을 그대로 존중하고, 칸 크기만 내용에 맞게 늘려 겹침을 없앤다.
// (dagre 같은 자동 랭크 배치는 시도했으나, 이 데이터의 엣지 방향이 order와 반대로 가는 경우
//  — 예: 훅이 이미 쓰여진 상태파일을 감시하는 엣지 — 가 있어 자동 랭크가 order를 뒤집어버림을
//  실험으로 확인. 그래서 order/lane을 그대로 존중하는 자체 격자 계산 + 라벨 충돌 회피로 겹침을 잡는다.)
// ---------------------------------------------------------------------------

const NODE_MIN_W = 132;
const NODE_PAD_TOP = 20;
const LINE_GAP1 = 19;
const LINE_GAP2 = 16;
const BOTTOM_PAD = 16;
const SHAPE_PAD = { roundrect: 26, cylinder: 30 }; // 마름모·육각형·평행사변형은 requiredWidthForLine이 y위치별로 계산
const TEXT_EDGE_MARGIN = 10; // 도형 경계에 텍스트가 닿지 않도록 두는 여유
const HEX_CUT = 20; // hexagonPath의 모서리 컷 상한과 동일한 값(보수적으로 사용)
const PARA_SKEW = 18; // parallelogramPath의 기울임 상한과 동일한 값(보수적으로 사용)
const STEP_R = 13;
const ISSUE_R = 10;
const BADGE_OVERHANG = 22; // 단계 배지·"+ 추가됨" 라벨이 박스 밖으로 삐져나오는 만큼 칸에 여백을 더 준다

// 마름모는 세로 중심(h/2)에서 가장 넓고 위아래 꼭짓점에서 폭이 0이 되며, 육각형도 정도는 약하지만
// 같은 모양으로 좁아진다. 평행사변형은 폭 자체는 일정하지만 텍스트 중심축(cx)과 도형의 실제 좌우
// 경계가 y에 따라 어긋난다. 텍스트가 놓이는 y위치마다 필요한 도형 폭을 구해야 어떤 줄도 도형
// 밖으로 삐져나오지 않는다 — 고정 패딩 하나로는 텍스트가 길어질수록 부족해진다.
// 텍스트는 기준점(baseline y)이 아니라 폰트 높이만큼 세로로 퍼져 있어, 그 줄의 bbox 중 도형이 더
// 좁아지는 바깥쪽 끝(중심 반대 방향으로 fontSize/2 만큼 더 간 지점)을 기준으로 역산해야 글자
// 위·아래 가장자리가 도형 밖으로 삐져나오지 않는다.
function requiredWidthForLine(shape, h, y, textW, fontSize) {
  const need = textW + TEXT_EDGE_MARGIN;
  const half = fontSize / 2;
  if (shape === "diamond") {
    const dy = Math.abs(y - h / 2) + half;
    const avail = Math.max(1 - (2 * dy) / h, 0.15); // 꼭짓점 근접 시 폭 요구량이 발산하지 않도록 하한
    return need / avail;
  }
  if (shape === "hexagon") {
    const dy = Math.abs(y - h / 2) + half;
    return need + (4 * HEX_CUT * dy) / h;
  }
  if (shape === "parallelogram") {
    const yFar = y >= h / 2 ? y + half : y - half; // 중심에서 먼 쪽으로 반 폰트높이만큼 더 밀어 계산
    const offset = Math.abs(PARA_SKEW * (0.5 - yFar / h));
    return need + PARA_SKEW + 2 * offset;
  }
  return need + SHAPE_PAD[shape];
}

function measureNode(n) {
  const meta = TYPE_META[n.type];
  const typeW = measureText(meta.label, 9.5, { letterSpacing: 1.5 });
  const mainW = measureText(n.label, 13.5, { mono: true }) * 1.06; // 굵게(bold) 보정
  const subW = n.sub ? measureText(n.sub, 10, {}) : 0;
  const mainY = NODE_PAD_TOP + LINE_GAP1;
  const subY = mainY + LINE_GAP2;
  const h = Math.ceil((n.sub ? subY : mainY) + BOTTOM_PAD);
  const lines = [
    { y: NODE_PAD_TOP, textW: typeW, fontSize: 9.5 },
    { y: mainY, textW: mainW, fontSize: 13.5 },
  ];
  if (n.sub) lines.push({ y: subY, textW: subW, fontSize: 10 });
  const neededW = Math.max(...lines.map((l) => requiredWidthForLine(meta.shape, h, l.y, l.textW, l.fontSize)));
  const w = Math.max(NODE_MIN_W, Math.ceil(neededW));
  const hasTopBadge = !!(n.step || n.added);
  const padL = n.step ? BADGE_OVERHANG : 0;
  const padT = hasTopBadge ? BADGE_OVERHANG : 0;
  return {
    w,
    h,
    padL,
    padT,
    cellW: w + padL,
    cellH: h + padT,
    typeY: NODE_PAD_TOP,
    mainY,
    subY: n.sub ? subY : null,
  };
}

const COL_GAP = 96;
const ROW_GAP = 42;
const MARGIN_L = 60;
const MARGIN_T = 56;
const MARGIN_R = 60;
const MARGIN_B = 56;
const LOOP_DIP_GAP = 78; // 루프 되돌이 곡선이 내려갈 여유 한 겹

function layoutGraph(nodes, edges) {
  const measured = nodes.map((n) => ({ ...n, ...measureNode(n) }));
  const cols = [...new Set(measured.map((n) => n.order))].sort((a, b) => a - b);
  const colIndex = new Map(cols.map((v, i) => [v, i]));

  const byCol = new Map();
  measured.forEach((n, i) => {
    const c = colIndex.get(n.order);
    if (!byCol.has(c)) byCol.set(c, []);
    byCol.get(c).push({ node: n, laneKey: n.lane ?? 1000 + i, appear: i });
  });

  let maxRows = 1;
  const colWidth = new Array(cols.length).fill(0);
  const rowHeight = [];
  const rowOfId = new Map();
  const colOfId = new Map();
  for (const [c, entries] of byCol) {
    entries.sort((a, b) => a.laneKey - b.laneKey || a.appear - b.appear);
    entries.forEach((e, row) => {
      colWidth[c] = Math.max(colWidth[c], e.node.cellW);
      rowHeight[row] = Math.max(rowHeight[row] || 0, e.node.cellH);
      rowOfId.set(e.node.id, row);
      colOfId.set(e.node.id, c);
    });
    maxRows = Math.max(maxRows, entries.length);
  }

  // 같은 열 안에서 위아래로 바로 붙는 엣지에 게이트·라벨이 있으면, 그 사이 행 간격을 내용이 들어갈
  // 만큼 늘린다 — 기본 ROW_GAP만으로는 세로로 붙은 두 노드 사이 좁은 틈에 게이트가 노드와 겹친다.
  const rowGap = new Array(Math.max(0, maxRows - 1)).fill(ROW_GAP);
  edges.forEach((e) => {
    const c1 = colOfId.get(e.from);
    const c2 = colOfId.get(e.to);
    if (c1 === undefined || c2 === undefined || c1 !== c2) return;
    const r1 = rowOfId.get(e.from);
    const r2 = rowOfId.get(e.to);
    if (Math.abs(r1 - r2) !== 1) return;
    const need = e.gate ? 100 : e.label ? 46 : 0;
    if (need <= 0) return;
    const idx = Math.min(r1, r2);
    rowGap[idx] = Math.max(rowGap[idx], need);
  });

  const colX = [];
  {
    let x = MARGIN_L;
    cols.forEach((_, c) => {
      colX[c] = x;
      x += colWidth[c] + COL_GAP;
    });
  }
  const rowY = [];
  {
    let y = MARGIN_T;
    for (let r = 0; r < maxRows; r++) {
      rowY[r] = y;
      y += (rowHeight[r] || 0) + (rowGap[r] ?? ROW_GAP);
    }
  }

  const placed = new Map();
  for (const [c, entries] of byCol) {
    entries.forEach((e, row) => {
      const n = e.node;
      placed.set(n.id, { ...n, col: c, row, x: colX[c] + n.padL, y: rowY[row] + n.padT });
    });
  }

  const laidNodes = measured.map((n) => placed.get(n.id));
  const loopCount = edges.filter((e) => e.loop).length;
  const lastCol = cols.length - 1;
  const lastRow = maxRows - 1;
  const width = (colX[lastCol] || MARGIN_L) + (colWidth[lastCol] || 0) + MARGIN_R;
  const height =
    (rowY[lastRow] || MARGIN_T) +
    (rowHeight[lastRow] || 0) +
    MARGIN_B +
    (loopCount ? LOOP_DIP_GAP + (loopCount - 1) * 44 : 0);

  return { nodes: laidNodes, nodeById: new Map(laidNodes.map((n) => [n.id, n])), width, height };
}

// to-be 그래프 = as-is 노드/연결에서 removeNodeIds/removeEdgeIds를 빼고 addNodes/addEdges를 더한 것.
// 상상으로 재설계하지 않는다 — 여기 들어오는 변화는 입력 JSON의 toBeChanges 그대로다.
function buildToBeNodesEdges(harness) {
  const tb = harness.toBeChanges;
  if (!tb) return null;
  const removeNodeIds = new Set(tb.removeNodeIds || []);
  const removeEdgeIds = new Set(tb.removeEdgeIds || []);
  const nodes = harness.nodes
    .filter((n) => !removeNodeIds.has(n.id))
    .concat((tb.addNodes || []).map((n) => ({ ...n, added: true })));
  const edges = harness.edges.filter((e) => !e.id || !removeEdgeIds.has(e.id)).concat(tb.addEdges || []);
  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// 정적 SVG 패스 렌더링 — 직선·정확한 좌표의 매끈한 도형/선. 손그림 질감 없음.
// ---------------------------------------------------------------------------

// 채워진 도형(노드 박스·라벨 알약·게이트 박스) — fill + 또렷한 outline.
function filledPath(d, { stroke, fill, strokeWidth = 1.5, dash } = {}) {
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dashAttr} stroke-linejoin="round"/>`;
}

// 선(엣지·상단 실린더 테두리) — 채움 없는 매끈한 스트로크만.
function strokePath(d, { stroke, strokeWidth = 1.5, dash } = {}) {
  const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"${dashAttr} stroke-linecap="round" stroke-linejoin="round"/>`;
}

// ---------------------------------------------------------------------------
// 도형 기하 — 경로(d) 문자열만 만든다. 실측 크기(measureNode)로 계산한 실제 w/h를 그대로 쓴다.
// ---------------------------------------------------------------------------

function roundRectPath(x, y, w, h, r) {
  r = Math.max(2, Math.min(r, w / 2, h / 2));
  return `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`;
}

function polyPath(pts) {
  return "M " + pts.map((p) => p.join(",")).join(" L ") + " Z";
}

function hexagonPath(x, y, w, h) {
  const o = Math.min(20, w / 3);
  return polyPath([
    [x + o, y],
    [x + w - o, y],
    [x + w, y + h / 2],
    [x + w - o, y + h],
    [x + o, y + h],
    [x, y + h / 2],
  ]);
}

function diamondPath(x, y, w, h) {
  return polyPath([
    [x + w / 2, y],
    [x + w, y + h / 2],
    [x + w / 2, y + h],
    [x, y + h / 2],
  ]);
}

function parallelogramPath(x, y, w, h) {
  const s = Math.min(18, w / 4);
  return polyPath([
    [x + s, y],
    [x + w, y],
    [x + w - s, y + h],
    [x, y + h],
  ]);
}

function cylinderPaths(x, y, w, h, ry) {
  ry = Math.min(ry, h / 3);
  const body = `M ${x} ${y + ry} A ${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry} L ${x + w} ${y + h - ry} A ${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry} Z`;
  const top = `M ${x} ${y + ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + ry}`;
  return { body, top };
}

function shapeMarkup(n, color) {
  const meta = TYPE_META[n.type];
  const { x, y, w, h } = n;
  const fill = n.ghost ? "var(--panel)" : "var(--panel2)";
  const dash = n.ghost ? "5 4" : undefined;
  let inner;
  switch (meta.shape) {
    case "roundrect":
      inner = filledPath(roundRectPath(x, y, w, h, 10), { stroke: color, fill, dash });
      break;
    case "hexagon":
      inner = filledPath(hexagonPath(x, y, w, h), { stroke: color, fill, dash });
      break;
    case "diamond":
      inner = filledPath(diamondPath(x, y, w, h), { stroke: color, fill, dash });
      break;
    case "parallelogram":
      inner = filledPath(parallelogramPath(x, y, w, h), { stroke: color, fill, dash });
      break;
    case "cylinder": {
      const { body, top } = cylinderPaths(x, y, w, h, 11);
      inner =
        filledPath(body, { stroke: color, fill, dash }) +
        strokePath(top, { stroke: color, strokeWidth: 1.5 });
      break;
    }
    default:
      inner = "";
  }
  return `<g class="shape">${inner}</g>`;
}

// ---------------------------------------------------------------------------
// 앵커·엣지 기하 — 같은 변에 엣지가 몰리면 그 변을 따라 고르게 분산시켜 한 점에서 선이 뭉치지 않게 한다.
// ---------------------------------------------------------------------------

function anchorSide(n, side) {
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  if (side === "r") return { x: n.x + n.w, y: cy };
  if (side === "l") return { x: n.x, y: cy };
  if (side === "t") return { x: cx, y: n.y };
  return { x: cx, y: n.y + n.h };
}

function pickSides(a, b, isLoop) {
  if (isLoop) return ["b", "b"];
  if (a.col !== b.col) return a.col < b.col ? ["r", "l"] : ["l", "r"];
  return a.row <= b.row ? ["b", "t"] : ["t", "b"];
}

function spreadPoint(n, side, idx, count) {
  const p = anchorSide(n, side);
  if (count <= 1) return p;
  const frac = (idx + 1) / (count + 1);
  const len = side === "l" || side === "r" ? n.h : n.w;
  const offset = (frac - 0.5) * len * 0.6;
  return side === "l" || side === "r" ? { x: p.x, y: p.y + offset } : { x: p.x + offset, y: p.y };
}

function computeAnchors(nodeById, edges) {
  const sides = edges.map((e) => {
    const a = nodeById.get(e.from);
    const b = nodeById.get(e.to);
    if (!a || !b) return null;
    return pickSides(a, b, !!e.loop);
  });
  const counters = new Map();
  edges.forEach((e, i) => {
    const s = sides[i];
    if (!s) return;
    const fk = e.from + "|" + s[0];
    const tk = e.to + "|" + s[1];
    counters.set(fk, (counters.get(fk) || 0) + 1);
    counters.set(tk, (counters.get(tk) || 0) + 1);
  });
  const seen = new Map();
  return edges.map((e, i) => {
    const s = sides[i];
    if (!s) return null;
    const [fs, ts] = s;
    const fk = e.from + "|" + fs;
    const tk = e.to + "|" + ts;
    const fi = seen.get(fk) || 0;
    seen.set(fk, fi + 1);
    const ti = seen.get(tk) || 0;
    seen.set(tk, ti + 1);
    const a = nodeById.get(e.from);
    const b = nodeById.get(e.to);
    const p1 = spreadPoint(a, fs, fi, counters.get(fk));
    const p2 = spreadPoint(b, ts, ti, counters.get(tk));
    return { p1, p2, fs, ts };
  });
}

function dirOf(side) {
  return side === "r" ? [1, 0] : side === "l" ? [-1, 0] : side === "t" ? [0, -1] : [0, 1];
}

function edgeGeometry(an, isLoop, diagramHeight, loopSlot) {
  const { p1, p2, fs, ts } = an;
  if (isLoop) {
    const dip = diagramHeight - MARGIN_B - 24 - loopSlot * 44;
    const d = `M ${p1.x} ${p1.y} C ${p1.x} ${dip}, ${p2.x} ${dip}, ${p2.x} ${p2.y}`;
    return { d, mid: { x: (p1.x + p2.x) / 2, y: dip - 16 } };
  }
  const off = 60;
  const [dx1, dy1] = dirOf(fs);
  const [dx2, dy2] = dirOf(ts);
  const c1 = { x: p1.x + dx1 * off, y: p1.y + dy1 * off };
  const c2 = { x: p2.x + dx2 * off, y: p2.y + dy2 * off };
  const d = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  // 3차 베지어의 t=0.5 지점 — 라벨을 곡선 중앙에 놓는 기준점.
  const mid = {
    x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8,
    y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8,
  };
  return { d, mid };
}

// ---------------------------------------------------------------------------
// 라벨·게이트 충돌 회피 배치 — 노드 박스들을 장애물로 깔아두고, 원하는 중심점에서 시작해
// 겹치면 상하로, 그래도 안 되면 좌우로 점점 크게 밀어내며 빈 자리를 찾는다.
// ---------------------------------------------------------------------------

const PLACER_MARGIN = 6; // 딱 안 겹치는 것과 눈에 보이는 여백을 두는 것은 다르다 — 판정에 여유를 더한다

function makePlacer(nodeRects) {
  const placed = nodeRects.map((r) => ({ ...r }));
  function overlaps(r) {
    const m = PLACER_MARGIN;
    return placed.some(
      (p) => r.x < p.x + p.w + m && r.x + r.w > p.x - m && r.y < p.y + p.h + m && r.y + r.h > p.y - m
    );
  }
  function rectAt(cx, cy, w, h) {
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  function place(cx, cy, w, h) {
    let r = rectAt(cx, cy, w, h);
    if (!overlaps(r)) {
      placed.push(r);
      return { x: cx, y: cy };
    }
    const steps = [18, 34, 50, 66, 84, 104, 126, 150];
    for (const dy of steps) {
      for (const sign of [1, -1]) {
        r = rectAt(cx, cy + sign * dy, w, h);
        if (!overlaps(r)) {
          placed.push(r);
          return { x: cx, y: cy + sign * dy };
        }
      }
    }
    for (const dx of steps) {
      for (const sign of [1, -1]) {
        r = rectAt(cx + sign * dx, cy, w, h);
        if (!overlaps(r)) {
          placed.push(r);
          return { x: cx + sign * dx, y: cy };
        }
      }
    }
    // 극단적으로 밀집된 경우에만 도달 — 그래도 자리는 잡아준다(무한정 찾지 않음).
    placed.push(rectAt(cx, cy, w, h));
    return { x: cx, y: cy };
  }
  return { place };
}

// ---------------------------------------------------------------------------
// SVG 조각 렌더링
// ---------------------------------------------------------------------------

function tagLabel(x, y, text, color) {
  const w = Math.max(34, measureText(text, 10.5) + 22);
  const h = 20;
  const box = filledPath(roundRectPath(x - w / 2, y - h / 2, w, h, 5), {
    stroke: "var(--line2)",
    fill: "var(--panel3)",
    strokeWidth: 1.3,
  });
  return `<g class="tag">${box}<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="10.5" font-family="var(--sans)" fill="${color}">${escapeHtml(text)}</text></g>`;
}

function tagSize(text) {
  return { w: Math.max(34, measureText(text, 10.5) + 22), h: 20 };
}

function nodeMarkup(n, hid, sevOf) {
  const meta = TYPE_META[n.type];
  const cx = n.x + n.w / 2;
  const clickable = !!n.issue;
  const onclick = clickable ? ` onclick="goIssue('${hid}','${escapeJs(n.issue)}')"` : "";
  const dataIssue = clickable ? ` data-issue="${escapeHtml(n.issue)}"` : "";
  const cursorClass = clickable ? " node-hit" : "";

  let extra = "";
  if (clickable) {
    const sev = sevOf(n.issue);
    const sc = SEV_COLOR[sev] || "var(--dim)";
    const bx = n.x + n.w - 15;
    const by = n.y + 15;
    extra += `<circle cx="${bx}" cy="${by}" r="${ISSUE_R}" fill="${sc}" opacity="0.22"/><text x="${bx}" y="${by + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="${sc}">!</text>`;
  }
  if (n.added) {
    extra += `<text x="${cx}" y="${n.y - 10}" text-anchor="middle" font-size="10" fill="var(--green)" letter-spacing="1">+ 추가됨</text>`;
  }
  if (n.step) {
    const bx = n.x - 3;
    const by = n.y - 3;
    extra += `<circle cx="${bx}" cy="${by}" r="${STEP_R}" fill="var(--bg)" stroke="${meta.color}" stroke-width="1.4"/><text x="${bx}" y="${by + 4}" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--tx)" font-family="var(--mono)">${escapeHtml(n.step)}</text>`;
  }

  const title = n.file ? `<title>${escapeHtml(n.file)}</title>` : "";
  const labelColor = n.ghost ? "var(--dim)" : "var(--tx)";
  return `<g class="node${cursorClass}"${onclick}${dataIssue}>${title}
    ${shapeMarkup(n, meta.color)}
    <text x="${cx}" y="${n.y + n.typeY}" text-anchor="middle" font-size="9.5" letter-spacing="1.5" fill="${meta.color}">${meta.label}</text>
    <text x="${cx}" y="${n.y + n.mainY}" text-anchor="middle" font-size="13.5" font-weight="600" font-family="var(--mono)" fill="${labelColor}">${escapeHtml(n.label)}</text>
    ${n.subY ? `<text x="${cx}" y="${n.y + n.subY}" text-anchor="middle" font-size="10" fill="var(--dim)">${escapeHtml(n.sub)}</text>` : ""}
    ${extra}
  </g>`;
}

const GATE_BOX_W = 30;
const GATE_BOX_H = 36;
const GATE_LABEL_GAP = 15; // 게이트 박스 아래 가장자리와 라벨 태그 중심 사이 간격

function gateMarkup(gx, gy, gate, hid) {
  const bad = gate.state === "missing";
  const color = bad ? "var(--red)" : "var(--green)";
  const glyph = bad ? "⊘" : "⛨";
  const issue = gate.issue;
  const onclick = issue ? ` onclick="event.stopPropagation();goIssue('${hid}','${escapeJs(issue)}')"` : "";
  const dataIssue = issue ? ` data-issue="${escapeHtml(issue)}"` : "";
  const cursorClass = issue ? " node-hit" : "";
  const box = filledPath(roundRectPath(gx - GATE_BOX_W / 2, gy - GATE_BOX_H / 2, GATE_BOX_W, GATE_BOX_H, 6), {
    stroke: color,
    fill: "var(--panel)",
    dash: bad ? "3 3" : undefined,
  });
  return `<g class="gate${cursorClass}"${onclick}${dataIssue}>
    ${box}
    <text x="${gx}" y="${gy + 5}" text-anchor="middle" font-size="15" fill="${color}">${glyph}</text>
    ${tagLabel(gx, gy + GATE_BOX_H / 2 + GATE_LABEL_GAP, gate.label, color)}
  </g>`;
}

function defsMarkup() {
  const m = Object.entries(EDGE_META)
    .map(
      ([k, v]) =>
        `<marker id="arrow-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 Z" fill="${v.color}"/></marker>`
    )
    .join("");
  return `<defs>${m}</defs>`;
}

function edgeMarkup(e, geom, placement, hid, sevOf) {
  const meta = EDGE_META[e.kind] || EDGE_META.ref;
  const problemSev = e.issue ? sevOf(e.issue) : null;
  const color = problemSev ? SEV_COLOR[problemSev] : meta.color;
  const w = problemSev ? meta.w + 0.6 : meta.w;

  const clickable = !!e.issue && !e.gate;
  const onclick = clickable ? ` onclick="goIssue('${hid}','${escapeJs(e.issue)}')"` : "";
  const dataIssue = e.issue && !e.gate ? ` data-issue="${escapeHtml(e.issue)}"` : "";
  const cursorClass = clickable ? " edge-hit" : "";
  const title = `<title>${escapeHtml(e.evidence || "")}</title>`;

  // 매끈한 단일 패스라 화살촉 마커를 선 자체에 바로 단다(별도 기준 경로 불필요).
  const linePath = `<path d="${geom.d}" fill="none" stroke="${color}" stroke-width="${w}" ${meta.dash ? `stroke-dasharray="${meta.dash}"` : ""} stroke-linecap="round" marker-end="url(#arrow-${e.kind})"/>`;
  const hitPath = clickable ? `<path d="${geom.d}" fill="none" stroke="transparent" stroke-width="20"/>` : "";

  let tag = "";
  if (placement) {
    if (e.gate) {
      tag = gateMarkup(placement.x, placement.y, e.gate, hid);
    } else if (e.loop) {
      tag = tagLabel(placement.x, placement.y, `${e.label || "루프"} ↻`, color);
    } else if (e.label) {
      tag = tagLabel(placement.x, placement.y, e.label, "var(--dim)");
    }
  }

  let out = `<g class="edge${cursorClass}"${onclick}${dataIssue}>${title}${linePath}${hitPath}${clickable ? tag : ""}</g>`;
  if (!clickable) out += tag;
  return out;
}

function renderDiagramSvg(hid, mode, nodesIn, edgesIn, sevOf) {
  const layout = layoutGraph(nodesIn, edgesIn);
  const anchors = computeAnchors(layout.nodeById, edgesIn);

  let loopSlot = 0;
  const geoms = edgesIn.map((e, i) => {
    const an = anchors[i];
    if (!an) return null;
    const g = edgeGeometry(an, !!e.loop, layout.height, e.loop ? loopSlot : 0);
    if (e.loop) loopSlot++;
    return g;
  });

  // 장애물은 노드의 보이는 도형 박스가 아니라 칸 전체(padL/padT로 예약해둔 배지·"+ 추가됨" 자리 포함)로
  // 잡는다 — 안 그러면 게이트·라벨이 그 배지 자리에 끼어들어 겹친다.
  const placer = makePlacer(
    layout.nodes.map((n) => ({ x: n.x - n.padL, y: n.y - n.padT, w: n.w + n.padL, h: n.h + n.padT }))
  );

  // 배치 우선순위: 게이트 > 루프 라벨 > 일반 라벨 — 의미상 중요한 표시부터 자리를 먼저 잡는다.
  const rank = { gate: 0, loop: 1, label: 2 };
  const order = edgesIn
    .map((e, i) => ({ e, i, kind: e.gate ? "gate" : e.loop ? "loop" : e.label ? "label" : null }))
    .filter((x) => x.kind && geoms[x.i]);
  order.sort((a, b) => rank[a.kind] - rank[b.kind] || a.i - b.i);

  const placements = new Map();
  order.forEach(({ e, i, kind }) => {
    const mid = geoms[i].mid;
    if (kind === "gate") {
      // 게이트는 박스 아래에 라벨 태그가 비대칭으로 붙는다(gateMarkup) — 장애물 회피도 박스 중심이
      // 아니라 박스+라벨을 합친 실제 자리의 중심으로 잡아야 라벨이 다른 요소와 겹치지 않는다.
      const labelSz = tagSize(e.gate.label);
      const topHalf = GATE_BOX_H / 2;
      const bottomHalf = GATE_BOX_H / 2 + GATE_LABEL_GAP + labelSz.h / 2;
      const centerOffset = (bottomHalf - topHalf) / 2;
      const boxW = Math.max(GATE_BOX_W, labelSz.w);
      const placed = placer.place(mid.x, mid.y + centerOffset, boxW, topHalf + bottomHalf);
      placements.set(i, { x: placed.x, y: placed.y - centerOffset });
    } else {
      const text = e.loop ? `${e.label || "루프"} ↻` : e.label;
      const sz = tagSize(text);
      placements.set(i, placer.place(mid.x, mid.y, sz.w, sz.h));
    }
  });

  let body = defsMarkup();
  edgesIn.forEach((e, i) => {
    if (!geoms[i]) return;
    body += edgeMarkup(e, geoms[i], placements.get(i), hid, sevOf);
  });
  layout.nodes.forEach((n) => {
    body += nodeMarkup(n, hid, sevOf);
  });

  return `<svg class="diagram svg-${mode}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="${hid} 구조 다이어그램 (${mode === "asis" ? "현재" : "권장"})">${body}</svg>`;
}

function usedTypesAndKinds(nodesSets, edgesSets) {
  const types = new Set();
  const kinds = new Set();
  nodesSets.forEach((n) => types.add(n.type));
  edgesSets.forEach((e) => kinds.add(e.kind));
  return { types: [...types], kinds: [...kinds] };
}

// 범례 아이콘은 캔버스 도형과 같은 정적 SVG 패스 방식이지만, 14px 안팎의 작은 크기라
// 여기서는 도형별 지오메트리 함수 대신 좌표를 직접 적은 고정 마크업을 쓴다.
function legendShapeSwatch(type) {
  const meta = TYPE_META[type];
  const c = meta.color;
  switch (meta.shape) {
    case "roundrect":
      return `<rect x="1" y="2" width="24" height="14" rx="3" fill="none" stroke="${c}" stroke-width="1.4"/>`;
    case "hexagon":
      return `<polygon points="6,2 20,2 25,9 20,16 6,16 1,9" fill="none" stroke="${c}" stroke-width="1.4"/>`;
    case "diamond":
      return `<polygon points="13,2 25,9 13,16 1,9" fill="none" stroke="${c}" stroke-width="1.4"/>`;
    case "parallelogram":
      return `<polygon points="6,2 25,2 20,16 1,16" fill="none" stroke="${c}" stroke-width="1.4"/>`;
    case "cylinder":
      return `<path d="M2 5 A11 3 0 0 1 24 5 L24 13 A11 3 0 0 1 2 13 Z" fill="none" stroke="${c}" stroke-width="1.4"/>`;
    default:
      return "";
  }
}

function renderLegend(types, kinds) {
  const nodeItems = types
    .map((t) => `<span class="lg"><svg width="26" height="18" viewBox="0 0 26 18">${legendShapeSwatch(t)}</svg>${TYPE_META[t].label}</span>`)
    .join("");
  const edgeItems = kinds
    .map((k) => {
      const m = EDGE_META[k];
      return `<span class="lg"><svg width="34" height="10"><line x1="2" y1="5" x2="32" y2="5" stroke="${m.color}" stroke-width="${m.w}" ${m.dash ? `stroke-dasharray="${m.dash}"` : ""}/></svg>${m.label}</span>`;
    })
    .join("");
  return `<div class="diag-legend">
    <div class="grp">${nodeItems}</div>
    <div class="grp">${edgeItems}
      <span class="lg"><svg width="18" height="18" viewBox="0 0 18 18"><circle cx="9" cy="9" r="8" fill="var(--red)" opacity="0.22"/><text x="9" y="13" text-anchor="middle" font-size="11" font-weight="700" fill="var(--red)">!</text></svg>아픈 곳 (클릭 시 개선 항목)</span>
      <span class="lg"><svg width="22" height="18" viewBox="0 0 22 18"><rect x="4" y="1" width="14" height="16" rx="3" fill="none" stroke="var(--green)" stroke-width="1.4"/><text x="11" y="12" text-anchor="middle" font-size="10" fill="var(--green)">⛨</text></svg>검증 게이트</span>
      <span class="lg mono">1-2-3 실행 순서(원 배지) · ↻ 재작성 루프</span>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// 개선 리스트 (전체 폭, 접기/펼치기)
// ---------------------------------------------------------------------------

// listDomId: 감쌈 div의 id를 hid와 다르게 주고 싶을 때(예: 외톨이 카드마다 별도 리스트가 여럿 있을 때
// 각각 고유 DOM id가 필요하지만, 항목 자체는 여전히 hid 소속 탭으로 이동해야 함). 생략하면 `imp-${hid}`.
function renderFixList(hid, improvements, listDomId) {
  const wrapId = listDomId || `imp-${hid}`;
  const sorted = [...improvements].sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9));
  if (sorted.length === 0) {
    return `<div class="imp-list" id="${wrapId}"><div class="imp-empty">발견된 개선 항목 없음.</div></div>`;
  }
  const items = sorted
    .map((f) => {
      const sevCls = SEV_CLASS[f.severity] || "low";
      const related = [...(f.relatedNodeIds || []), ...(f.relatedEdgeIds || [])];
      return `<div class="imp pain-marked" id="item-${hid}-${escapeHtml(f.id)}" data-related="${escapeHtml(related.join(","))}">
        <div class="imp-head" onclick="toggleItem(this)">
          <span class="chev">▸</span>
          <span class="id-badge">${escapeHtml(f.id)}</span>
          <span class="sev ${sevCls}">${SEV_LABEL[f.severity] || f.severity}</span>
          <span class="title">${escapeHtml(f.title)}</span>
        </div>
        <div class="imp-body">
          <dl>
            <dt>어디</dt><dd><code>${escapeHtml(f.where)}</code></dd>
            <dt>왜</dt><dd>${escapeHtml(f.why)}</dd>
            <dt>어떻게</dt><dd>${escapeHtml(f.how)}</dd>
          </dl>
          <div class="basis">
            근거 · <code>${escapeHtml(f.guideFile)}</code> <b>${escapeHtml(f.principleBlock)}</b>
            <span class="q">점검: ${escapeHtml(f.question)}</span>
          </div>
        </div>
      </div>`;
    })
    .join("");
  return `<div class="imp-list" id="${wrapId}">${items}</div>`;
}

// ---------------------------------------------------------------------------
// 하네스 섹션
// ---------------------------------------------------------------------------

function renderHarnessSection(h) {
  const sevOf = sevOfFactory(h.improvements || []);
  const asis = { nodes: h.nodes, edges: h.edges || [] };
  const tobe = buildToBeNodesEdges(h);

  const asisSvg = renderDiagramSvg(h.id, "asis", asis.nodes, asis.edges, sevOf);
  const tobeSvg = tobe ? renderDiagramSvg(h.id, "tobe", tobe.nodes, tobe.edges, sevOf) : "";

  const { types, kinds } = usedTypesAndKinds(
    asis.nodes.concat(tobe ? tobe.nodes : []),
    asis.edges.concat(tobe ? tobe.edges : [])
  );
  const legend = renderLegend(types, kinds);

  const toggle = tobe
    ? `<span class="toggle">
        <button class="on" onclick="setMode('${h.id}','asis',this)">현재 (as-is)</button>
        <button onclick="setMode('${h.id}','tobe',this)">권장 (to-be)</button>
      </span>`
    : "";

  const fixCount = (h.improvements || []).length;

  return `<section class="panel" id="p-${h.id}">
    <div class="harness-head">
      <h2>${escapeHtml(h.name)}</h2>
      <span class="status-chip ${STATUS_DOT[h.status]}"><span class="dot ${STATUS_DOT[h.status]}"></span>${STATUS_LABEL[h.status] || h.status}</span>
    </div>
    <div class="kind-line">${escapeHtml(h.summary || "")}</div>

    <div class="diagram-box">
      <div class="diagram-bar">
        <span class="cap">구조 다이어그램 · 왼쪽→오른쪽 실행 순서 · 노드/연결/게이트 클릭 시 해당 개선 항목으로</span>
        <span class="canvas-hint">휠 줌 · 드래그 이동 · 더블클릭·전체 보기로 리셋</span>
        <button class="fit-btn" type="button">전체 보기</button>
        ${toggle}
      </div>
      <div class="svg-wrap" id="diagram-${h.id}">
        ${asisSvg}
        ${tobeSvg}
      </div>
      ${legend}
    </div>

    <div class="section-h" style="margin-top:30px">개선 항목 · 급한 순 (${fixCount})</div>
    ${renderFixList(h.id, h.improvements || [])}
  </section>`;
}

// ---------------------------------------------------------------------------
// 요약 / 외톨이 / 빈 프로젝트
// ---------------------------------------------------------------------------

function renderSummarySection(model) {
  const allFixes = [];
  model.harnesses.forEach((h) => (h.improvements || []).forEach((f) => allFixes.push({ ...f, hid: h.id })));
  // 외톨이도 부품 품질 점검을 받으므로 외톨이 improvements도 전체 집계·TOP 3에 합산한다.
  model.loners.forEach((l) => (l.improvements || []).forEach((f) => allFixes.push({ ...f, hid: "lonely" })));
  const highCount = allFixes.filter((f) => f.severity === "high").length;
  const top3 = [...allFixes].sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9)).slice(0, 3);

  const goLabel = (f) => (f.hid === "lonely" ? "외톨이" : model.harnesses.find((h) => h.id === f.hid)?.name || f.hid);

  const top3Html = top3.length
    ? top3
        .map(
          (f, i) => `<div class="row" onclick="goIssue('${f.hid}','${escapeJs(f.id)}')">
        <span class="rank">${i + 1}</span>
        <span class="id-badge">${escapeHtml(f.id)}</span>
        <span class="sev ${SEV_CLASS[f.severity]}">${SEV_LABEL[f.severity]}</span>
        <span class="txt">${escapeHtml(f.title)}</span>
        <span class="go">${escapeHtml(goLabel(f))} →</span>
      </div>`
        )
        .join("")
    : `<div class="row" style="cursor:default"><span class="txt" style="color:var(--dim)">개선 항목 없음.</span></div>`;

  return `<section class="panel on" id="p-summary">
    <div class="stat-row">
      <div class="stat"><div class="n">${model.harnesses.length}</div><div class="k">하네스</div></div>
      <div class="stat"><div class="n">${model.loners.length}</div><div class="k">외톨이 아티팩트</div></div>
      <div class="stat"><div class="n">${allFixes.length}</div><div class="k">개선 항목</div></div>
      <div class="stat"><div class="n${highCount ? " red" : ""}">${highCount} <small>심각</small></div><div class="k">즉시 손봐야 함</div></div>
    </div>
    <div class="section-h">지금 급한 것 · TOP 3</div>
    <div class="top3">${top3Html}</div>
    <p class="muted-note">항목 번호로 지목해 적용을 요청할 수 있습니다 — 예: "${escapeHtml(top3[0]?.id || "블로그-1")} 적용해줘". 점검 스킬은 읽고 분석만 하며, 파일은 건드리지 않습니다.</p>
  </section>`;
}

function renderLonelySection(model) {
  const cards = model.loners
    .map((l) => {
      const meta = TYPE_META[l.type];
      const measured = measureNode(l);
      const padTop = measured.padT + 14;
      const padSide = 14;
      const miniNode = { ...l, ...measured, x: padSide + measured.padL, y: padTop };
      const miniW = padSide + measured.padL + measured.w + padSide;
      const miniH = padTop + measured.h + 14;
      const miniSvg = `<svg class="diagram mini" viewBox="0 0 ${miniW} ${miniH}" role="img" aria-label="${escapeHtml(l.label)}">${defsMarkup()}${nodeMarkup(miniNode, "lonely", () => undefined)}</svg>`;
      // improvements가 없거나 비면 기존과 동일 — 하네스와 같은 형식(접기/펼치기·심각도 배지)으로만 추가.
      const fixCount = (l.improvements || []).length;
      const fixesHtml = fixCount
        ? `<div class="section-h" style="margin-top:18px">개선 항목 · 급한 순 (${fixCount})</div>
          ${renderFixList("lonely", l.improvements, `imp-lonely-${l.id}`)}`
        : "";
      return `<div class="loner-card">
        <div class="lc-h"><span class="dot gray"></span><span class="mono">${escapeHtml(l.label)}</span><span class="id-badge">${meta ? meta.label : l.type}</span></div>
        ${l.file ? `<div class="kind-line" style="margin:6px 0 0"><code>${escapeHtml(l.file)}</code></div>` : ""}
        <div class="mini-canvas">${miniSvg}</div>
        <div class="why">
          <b>하네스로 안 묶인 이유</b>
          <ul>${(l.reasons || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
        </div>
        ${fixesHtml}
      </div>`;
    })
    .join("");

  const guesses = model.relatedGuesses
    .map(
      (g) => `<div class="guess-card">
        <div class="guess-pair">
          <span class="id-badge">${escapeHtml(g.a.label)}</span>
          <span class="guess-tilde">≈</span>
          <span class="id-badge">${escapeHtml(g.b.label)}</span>
        </div>
        <div class="kind-line" style="margin-top:6px">${g.a.file ? `<code>${escapeHtml(g.a.file)}</code>` : ""}${g.a.file && g.b.file ? " · " : ""}${g.b.file ? `<code>${escapeHtml(g.b.file)}</code>` : ""}</div>
        <div class="why" style="margin-top:12px">${escapeHtml(g.evidence)}</div>
      </div>`
    )
    .join("");

  const emptyMsg = model.loners.length === 0 && model.relatedGuesses.length === 0
    ? `<p class="muted-note">외톨이 아티팩트도, 관련 추정 쌍도 없습니다 — 발견된 아티팩트가 모두 하네스로 묶였습니다.</p>`
    : "";

  return `<section class="panel" id="p-lonely">
    <div class="harness-head">
      <h2>외톨이 · 관련 추정</h2>
      <span class="status-chip gray"><span class="dot gray"></span>하네스 미소속</span>
    </div>
    <div class="kind-line">억지로 소속시키지 않고 따로 표시함. 부품 품질 점검은 그대로 받는다.</div>
    ${model.loners.length ? `<div class="section-h">외톨이 아티팩트 (${model.loners.length})</div><div class="loner-grid">${cards}</div>` : ""}
    ${model.relatedGuesses.length ? `<div class="section-h">관련 추정 (${model.relatedGuesses.length})</div><div class="loner-grid">${guesses}</div>` : ""}
    ${emptyMsg}
  </section>`;
}

function renderEmptyStateHtml(model) {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>하네스 점검 리포트</title>
<style>${baseCss()}</style></head>
<body><div class="wrap">
  <header>
    <div class="h-title">하네스 점검 리포트</div>
    <div class="h-sub">대상 <code>${escapeHtml(model.project)}</code> · 점검일 ${escapeHtml(model.scanDate)} · 판정 기준 <code>${escapeHtml(model.guideRef)}</code></div>
  </header>
  <section class="panel on empty-state">
    <div class="empty-box">
      <div class="empty-title">하네스를 찾지 못함</div>
      <p class="empty-desc">프로젝트에서 스킬·에이전트·훅·스크립트 등 하네스로 묶일 만한 아티팩트를 발견하지 못했습니다.<br>단독 아티팩트도, 서로 엮인 하네스도 없습니다.</p>
    </div>
  </section>
</div></body></html>`;
}

// ---------------------------------------------------------------------------
// CSS + 전체 문서 조립
// ---------------------------------------------------------------------------

function baseCss() {
  return `
  :root{
    --bg:#17181b; --panel:#1e2023; --panel2:#24272b; --panel3:#2b2e33;
    --line:#33363b; --line2:#40444a;
    --tx:#dcd8ce; --dim:#938d80; --dim2:#6f6a5f;
    --skill:#87a8c4; --agent:#9bb488; --hook:#b79bc4; --script:#c9a670; --state:#7fb6a8;
    --deleg:#8fa6c4; --code:#d8d3c4;
    --red:#c96f66; --green:#7cae7a; --amber:#c79a5c; --accent:#c9a86a;
    --mono:"SF Mono",ui-monospace,"Cascadia Code",Consolas,"DejaVu Sans Mono",monospace;
    --sans:ui-sans-serif,system-ui,"Segoe UI",Roboto,"Malgun Gothic","Helvetica Neue",sans-serif;
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{background:var(--bg); color:var(--tx); font-family:var(--sans); font-size:14px; line-height:1.55; -webkit-font-smoothing:antialiased}
  .wrap{max-width:1440px; margin:0 auto; padding:0 32px 90px}
  code,.mono{font-family:var(--mono)}

  header{padding:26px 0 18px; border-bottom:1px solid var(--line)}
  .h-title{font-size:15px; letter-spacing:.02em; font-weight:600}
  .h-sub{color:var(--dim); font-size:12.5px; margin-top:3px}
  .h-sub code{color:var(--dim); font-size:12px}

  nav{display:flex; gap:2px; margin-top:20px; border-bottom:1px solid var(--line); flex-wrap:wrap}
  .tab{appearance:none; background:none; border:none; cursor:pointer; color:var(--dim); font-family:var(--sans); font-size:13px; letter-spacing:.01em; padding:9px 16px; border-bottom:2px solid transparent; margin-bottom:-1px; display:inline-flex; align-items:center; gap:7px}
  .tab:hover{color:var(--tx)}
  .tab.on{color:var(--tx); border-bottom-color:var(--accent)}
  .dot{width:7px; height:7px; border-radius:50%; display:inline-block}
  .dot.red{background:var(--red)} .dot.green{background:var(--green)} .dot.amber{background:var(--amber)} .dot.gray{background:var(--dim2)}

  .panel{display:none; padding-top:26px}
  .panel.on{display:block}

  .stat-row{display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:var(--line); border:1px solid var(--line); border-radius:6px; overflow:hidden}
  .stat{background:var(--panel); padding:16px 18px}
  .stat .n{font-size:26px; font-weight:600; font-family:var(--mono); letter-spacing:-.01em}
  .stat .n small{font-size:13px; color:var(--dim); font-weight:400; margin-left:8px; font-family:var(--sans)}
  .stat .k{color:var(--dim); font-size:12px; margin-top:2px; letter-spacing:.02em}
  .n.red{color:var(--red)}

  .section-h{font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--dim); margin:34px 0 12px; font-weight:600}
  .top3{border:1px solid var(--line); border-radius:6px; overflow:hidden}
  .top3 .row{display:flex; align-items:center; gap:14px; padding:13px 16px; cursor:pointer; background:var(--panel); border-top:1px solid var(--line)}
  .top3 .row:first-child{border-top:none}
  .top3 .row:hover{background:var(--panel2)}
  .rank{font-family:var(--mono); color:var(--dim2); font-size:13px; width:18px}
  .id-badge{font-family:var(--mono); font-size:11.5px; color:var(--dim); background:var(--panel3); border:1px solid var(--line2); padding:1px 7px; border-radius:3px; white-space:nowrap}
  .sev{font-size:11px; padding:1px 7px; border-radius:3px; white-space:nowrap; letter-spacing:.02em}
  .sev.high{color:var(--red); border:1px solid #4a3330; background:#211615}
  .sev.mid{color:var(--amber); border:1px solid #493b20; background:#201a10}
  .sev.low{color:var(--dim); border:1px solid var(--line2); background:var(--panel3)}
  .top3 .txt{flex:1; font-size:13.5px}
  .top3 .go{color:var(--dim2); font-size:12px; white-space:nowrap}
  .top3 .row:hover .go{color:var(--tx)}

  .harness-head{display:flex; align-items:baseline; gap:14px; margin-bottom:4px}
  .harness-head h2{font-size:19px; font-weight:600; margin:0}
  .status-chip{display:inline-flex; align-items:center; gap:7px; font-size:12.5px; padding:3px 11px; border-radius:4px}
  .status-chip.red{color:var(--red); background:#211615; border:1px solid #4a3330}
  .status-chip.green{color:var(--green); background:#151d16; border:1px solid #2a3f2c}
  .status-chip.amber{color:var(--amber); background:#201a10; border:1px solid #493b20}
  .status-chip.gray{color:var(--dim); background:var(--panel3); border:1px solid var(--line2)}
  .kind-line{color:var(--dim); font-size:12.5px; margin-bottom:22px}
  .kind-line code{color:var(--dim); font-size:12px}

  .diagram-box{border:1px solid var(--line); border-radius:6px; background:var(--panel); overflow:hidden}
  .diagram-bar{display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--line); background:var(--panel2); flex-wrap:wrap; gap:10px}
  .diagram-bar .cap{font-size:12px; color:var(--dim); letter-spacing:.02em}
  .diagram-bar .canvas-hint{font-size:11px; color:var(--dim2); white-space:nowrap; margin-left:auto}
  .fit-btn{appearance:none; background:var(--panel3); border:1px solid var(--line2); color:var(--tx); font-family:var(--sans); font-size:12px; padding:5px 12px; border-radius:5px; cursor:pointer}
  .fit-btn:hover{background:var(--panel); border-color:var(--dim2)}
  .toggle{display:inline-flex; border:1px solid var(--line2); border-radius:5px; overflow:hidden}
  .toggle button{appearance:none; background:var(--panel); border:none; color:var(--dim); font-family:var(--sans); font-size:12px; padding:5px 13px; cursor:pointer}
  .toggle button.on{background:var(--panel3); color:var(--tx)}
  .toggle button+button{border-left:1px solid var(--line2)}

  .svg-wrap{position:relative; height:min(70vh,620px); min-height:420px; background:var(--bg); overflow:hidden}
  svg.diagram{width:100%; height:100%; display:block; cursor:grab; touch-action:none}
  svg.diagram.grabbing{cursor:grabbing}
  svg.diagram.svg-tobe{display:none}
  .svg-wrap.tobe-mode svg.svg-asis{display:none}
  .svg-wrap.tobe-mode svg.svg-tobe{display:block}
  svg.mini{width:100%; height:auto; display:block; cursor:default}

  .diag-legend{display:flex; flex-wrap:wrap; gap:10px 22px; padding:12px 16px; border-top:1px solid var(--line); background:var(--panel2); font-size:11.5px; color:var(--dim)}
  .diag-legend .grp{display:flex; gap:16px; flex-wrap:wrap; align-items:center}
  .lg{display:inline-flex; align-items:center; gap:7px}
  .lg svg{display:inline-block; flex:none}
  .lg.mono{font-family:var(--mono); color:var(--dim2)}

  .node.node-hit{cursor:pointer}
  .node.node-hit:hover .shape path{filter:brightness(1.28)}
  .edge.edge-hit{cursor:pointer}
  .edge.edge-hit:hover path{filter:brightness(1.28)}
  .gate.node-hit{cursor:pointer}
  [data-issue].hl .shape path{stroke:var(--accent)}
  [data-issue].hl text{fill:var(--accent)}
  [data-issue].hl.tag path{stroke:var(--accent)}

  .imp-list{margin-top:8px; border:1px solid var(--line); border-radius:6px; overflow:hidden}
  .imp-empty{padding:16px; color:var(--dim); font-size:13px; background:var(--panel)}
  .imp{border-top:1px solid var(--line); background:var(--panel)}
  .imp:first-child{border-top:none}
  .imp-head{display:flex; align-items:center; gap:12px; padding:13px 16px; cursor:pointer}
  .imp-head:hover{background:var(--panel2)}
  .imp-head .chev{color:var(--dim2); font-size:11px; width:12px; transition:transform .12s; font-family:var(--mono)}
  .imp.open .chev{transform:rotate(90deg)}
  .imp-head .title{flex:1; font-size:13.5px}
  .imp-body{display:none; padding:2px 16px 18px 40px; font-size:13px; color:var(--tx)}
  .imp.open .imp-body{display:block}
  .imp-body dl{display:grid; grid-template-columns:64px 1fr; gap:8px 14px; margin:10px 0 0}
  .imp-body dt{color:var(--dim); font-size:12px; letter-spacing:.02em}
  .imp-body dd{margin:0}
  .imp-body dd code{color:#cfc7b3; background:var(--panel3); padding:1px 5px; border-radius:3px; font-size:12px}
  .basis{margin-top:14px; padding:11px 13px; border:1px solid var(--line2); border-left:2px solid var(--dim2); border-radius:4px; background:var(--panel2); font-size:12.5px; color:var(--dim)}
  .basis code{font-size:11.5px}
  .basis b{color:var(--tx); font-weight:600}
  .basis .q{color:var(--dim); font-style:italic; display:block; margin-top:4px}
  .imp.flash{animation:flash 1.4s ease-out}
  @keyframes flash{0%{background:#2a220f}40%{background:#2a220f}100%{background:var(--panel)}}
  .imp.pain-marked .imp-head .title::before{content:"\\25CF "; color:var(--dim2); font-size:9px; vertical-align:middle}

  .loner-grid{display:grid; grid-template-columns:repeat(auto-fill, minmax(300px,1fr)); gap:16px}
  .loner-card,.guess-card{border:1px solid var(--line); border-radius:6px; background:var(--panel); padding:18px 20px}
  .loner-card .lc-h{display:flex; align-items:center; gap:10px; font-size:14.5px; font-weight:600; flex-wrap:wrap}
  .loner-card .why,.guess-card .why{margin-top:14px; color:var(--dim); font-size:13px}
  .loner-card .why b{color:var(--tx)}
  .loner-card ul{margin:8px 0 0; padding-left:18px}
  .loner-card li{margin:3px 0}
  .mini-canvas{margin-top:12px; background:var(--bg); border:1px solid var(--line); border-radius:5px; padding:6px}
  .guess-pair{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
  .guess-tilde{color:var(--dim2)}
  .muted-note{color:var(--dim2); font-size:12px; margin-top:16px; max-width:720px; line-height:1.6}

  .empty-state{display:flex !important; align-items:center; justify-content:center; min-height:50vh; padding-top:0}
  .empty-box{text-align:center; max-width:480px}
  .empty-title{font-size:18px; font-weight:600; margin-bottom:12px}
  .empty-desc{color:var(--dim); font-size:13.5px; line-height:1.7}
  `;
}

function baseScript() {
  return `
  const MAX_FIT_SCALE = 1.25; // 무한 캔버스 초기 fit·전체 보기 배율 상한 — 축소 방향은 무제한
  const tabs = document.querySelectorAll('.tab');
  function showTab(id){
    tabs.forEach(t => t.classList.toggle('on', t.dataset.tab === id));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('on', p.id === 'p-'+id));
    // 처음 보이는 탭의 캔버스는 fit이 원본 크기 그대로 저장돼 있다(숨겨진 채로 setupCanvas가 돌아
    // 크기를 잴 수 없었으므로) — 딱 한 번만 실제 크기로 다시 재서 배율 상한을 적용한다.
    // 이미 정착된(사용자가 조작했을 수 있는) 캔버스는 건드리지 않는다.
    document.querySelectorAll('#p-'+id+' svg.diagram').forEach(s => { if(s._ensureFit) s._ensureFit(); });
  }
  tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

  function toggleItem(head){ head.parentElement.classList.toggle('open'); }

  function clearHighlight(hid){
    document.querySelectorAll('#diagram-'+hid+' [data-issue]').forEach(el => el.classList.remove('hl'));
  }
  function highlightDiagram(hid, issueId){
    clearHighlight(hid);
    document.querySelectorAll('#diagram-'+hid+' [data-issue="'+issueId+'"]').forEach(el => el.classList.add('hl'));
  }

  // 다이어그램 노드/연결/게이트 클릭, 요약 TOP3 클릭이 공용으로 쓰는 이동 함수:
  // 탭 전환 + 개선 항목 펼침·스크롤·플래시 + 다이어그램 하이라이트를 한 번에 한다.
  function goIssue(hid, issueId){
    showTab(hid);
    const list = document.getElementById('imp-'+hid);
    if(list) list.querySelectorAll('.imp').forEach(el => el.classList.remove('open','flash'));
    const el = document.getElementById('item-'+hid+'-'+issueId);
    if(el){
      el.classList.add('open');
      void el.offsetWidth;
      el.classList.add('flash');
      el.scrollIntoView({behavior:'smooth', block:'center'});
    }
    highlightDiagram(hid, issueId);
  }

  function setMode(hid, mode, btn){
    const wrap = document.getElementById('diagram-'+hid);
    wrap.classList.toggle('tobe-mode', mode === 'tobe');
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    wrap.querySelectorAll('svg.diagram').forEach(s => { if(s.offsetParent && s._fit) s._fit(); });
  }

  // 무한 캔버스 — 휠 줌(커서 기준)·드래그 팬·전체 보기·더블클릭 리셋. SVG viewBox만 조작하는
  // 바닐라 구현이라 별도 라이브러리가 필요 없다. 렌더링 로직 없음(정적 마크업을 옮겨 보기만 한다).
  function setupCanvas(svg){
    const parts = svg.getAttribute('viewBox').split(' ').map(Number);
    const orig = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };

    // 원본 viewBox가 컨테이너보다 훨씬 작은 그래프(예: 노드 2개)는 그대로 채우면 과확대된다.
    // 표시 시점의 실제 크기로 배율을 재서 상한을 넘으면 여백을 더해 배율을 낮춘다 — 축소 방향
    // (큰 그래프를 화면에 맞추는 쪽)은 그대로 무제한. display:none 상태(to-be 미표시 등)라 크기를
    // 잴 수 없으면 원본 그대로 둔다 — 보이게 되는 시점(setMode)에 다시 fit이 호출된다.
    function computeFit(){
      const rect = svg.getBoundingClientRect();
      if(rect.width === 0 || rect.height === 0) return { ...orig };
      const scale = Math.min(rect.width / orig.w, rect.height / orig.h);
      if(scale <= MAX_FIT_SCALE) return { ...orig };
      const w = rect.width / MAX_FIT_SCALE, h = rect.height / MAX_FIT_SCALE;
      const cx = orig.x + orig.w / 2, cy = orig.y + orig.h / 2;
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    }

    let fit = computeFit();
    let cur = { x: fit.x, y: fit.y, w: fit.w, h: fit.h };
    function apply(){ svg.setAttribute('viewBox', cur.x+' '+cur.y+' '+cur.w+' '+cur.h); }
    // fit이 한 번이라도 실제 크기로 계산되면(숨김 상태가 아니었으면) 정착된 것으로 표시한다 —
    // 전체 보기 버튼·더블클릭·as-is/to-be 토글 등 어느 경로로 fit이 걸렸든 동일하게 취급해야,
    // 탭을 나갔다 돌아왔을 때 _ensureFit이 그 자리를 다시 리셋해버리지 않는다.
    let fitSettled = false;
    svg._fit = function(){
      const rect = svg.getBoundingClientRect();
      fit = computeFit();
      if(rect.width > 0 && rect.height > 0) fitSettled = true; // 보이는 채로 쟀을 때만 정착 처리
      cur = { x: fit.x, y: fit.y, w: fit.w, h: fit.h };
      apply();
    };

    // 탭이 숨겨진 채로 페이지가 로드되면 이 시점의 computeFit은 크기를 못 재 원본 그대로 저장된다.
    // 탭이 실제로 보여지는 첫 순간에만(탭을 여러 번 오가도 한 번만) 다시 재서 배율 상한을 적용한다 —
    // 매번 다시 적용하면 사용자가 조작해둔 줌·팬이 탭을 오갈 때마다 날아간다.
    svg._ensureFit = function(){
      if(fitSettled) return;
      const rect = svg.getBoundingClientRect();
      if(rect.width === 0 || rect.height === 0) return; // 아직 안 보임 — 다음에 다시 시도
      fitSettled = true;
      svg._fit();
    };

    svg.addEventListener('wheel', function(e){
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if(rect.width === 0 || rect.height === 0) return;
      const mx = cur.x + (e.clientX - rect.left) / rect.width * cur.w;
      const my = cur.y + (e.clientY - rect.top) / rect.height * cur.h;
      const scale = Math.exp((e.deltaY > 0 ? 1 : -1) * 0.12);
      let newW = cur.w * scale, newH = cur.h * scale;
      const minW = fit.w * 0.12, maxW = fit.w * 4.5;
      if(newW < minW){ newW = minW; newH = cur.h * (minW / cur.w); }
      if(newW > maxW){ newW = maxW; newH = cur.h * (maxW / cur.w); }
      cur = { x: mx - (mx - cur.x) * (newW / cur.w), y: my - (my - cur.y) * (newH / cur.h), w: newW, h: newH };
      apply();
    }, { passive: false });

    // 드래그 임계값을 넘기 전에는 pointer capture를 걸지 않는다 — 미리 걸면 그 아래 눌린 게
    // 노드였든 빈 캔버스였든 뒤이은 click 이벤트의 대상이 svg 자신으로 바뀌어(브라우저 표준 동작)
    // 단순 클릭(노드/엣지/게이트 클릭 → 개선 항목 이동)까지 먹혀버린다.
    let dragging = false, dragStarted = false, downX = 0, downY = 0, lastX = 0, lastY = 0, pointerId = null;
    const DRAG_THRESHOLD = 4;
    svg.addEventListener('pointerdown', function(e){
      dragging = true; dragStarted = false;
      downX = lastX = e.clientX; downY = lastY = e.clientY;
      pointerId = e.pointerId;
    });
    svg.addEventListener('pointermove', function(e){
      if(!dragging) return;
      if(!dragStarted){
        if(Math.abs(e.clientX - downX) < DRAG_THRESHOLD && Math.abs(e.clientY - downY) < DRAG_THRESHOLD) return;
        dragStarted = true;
        svg.setPointerCapture(pointerId);
        svg.classList.add('grabbing');
      }
      const rect = svg.getBoundingClientRect();
      if(rect.width === 0 || rect.height === 0) return;
      const dx = (e.clientX - lastX) / rect.width * cur.w;
      const dy = (e.clientY - lastY) / rect.height * cur.h;
      cur.x -= dx; cur.y -= dy; lastX = e.clientX; lastY = e.clientY;
      apply();
    });
    function endDrag(){ dragging = false; dragStarted = false; svg.classList.remove('grabbing'); }
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('dblclick', function(){ svg._fit(); });

    apply();
  }
  document.querySelectorAll('.svg-wrap svg.diagram').forEach(setupCanvas);
  document.querySelectorAll('.fit-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      btn.closest('.diagram-box').querySelectorAll('svg.diagram').forEach(function(s){ if(s._fit) s._fit(); });
    });
  });
  `;
}

function buildReportHtml(model) {
  if (model.harnesses.length === 0 && model.loners.length === 0) {
    return renderEmptyStateHtml(model);
  }

  const tabsHtml = [
    `<button class="tab on" data-tab="summary">요약</button>`,
    ...model.harnesses.map(
      (h) => `<button class="tab" data-tab="${h.id}">${escapeHtml(h.name)} <span class="dot ${STATUS_DOT[h.status]}"></span></button>`
    ),
    `<button class="tab" data-tab="lonely">외톨이 <span class="dot gray"></span></button>`,
  ].join("\n");

  const harnessSections = model.harnesses.map((h) => renderHarnessSection(h)).join("\n");

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>하네스 점검 리포트</title>
<style>${baseCss()}</style></head>
<body>
<div class="wrap">
  <header>
    <div class="h-title">하네스 점검 리포트</div>
    <div class="h-sub">대상 <code>${escapeHtml(model.project)}</code> · 하네스 ${model.harnesses.length} · 외톨이 ${model.loners.length} · 점검일 ${escapeHtml(model.scanDate)} · 판정 기준 <code>${escapeHtml(model.guideRef)}</code></div>
    <nav id="tabs">${tabsHtml}</nav>
  </header>

  ${renderSummarySection(model)}
  ${harnessSections}
  ${renderLonelySection(model)}
</div>
<script>${baseScript()}</script>
</body></html>`;
}

main();
