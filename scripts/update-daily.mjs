// scripts/update-daily.mjs
//
// Run by .github/workflows/daily-update.yml on a daily cron schedule.
// Calls the Gemini API WITH Google Search grounding (tools: [{google_search:{}}])
// so the model actually searches the live web instead of answering from training
// data, then writes the result to data/daily.json. index.html fetches that file
// at load time and overlays it on top of the built-in defaults.
//
// Required env var: GEMINI_API_KEY (set as a GitHub repository secret)
// Optional env var: GEMINI_MODEL (default: gemini-3.6-flash)

import fs from 'node:fs';
import path from 'node:path';

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('GEMINI_API_KEY 환경변수가 없습니다. GitHub 저장소 Settings > Secrets and variables > Actions 에 등록해주세요.');
  process.exit(1);
}
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

// Compute "today" in KST (UTC+9) regardless of the runner's local timezone.
const now = new Date();
const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
const y = kst.getUTCFullYear();
const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
const d = String(kst.getUTCDate()).padStart(2, '0');
const todayDot = `${y}.${m}.${d}`;
const weekday = ['일', '월', '화', '수', '목', '금', '토'][kst.getUTCDay()];

const SCHEMA_EXAMPLE = `{
  "asOfDate": "${todayDot}",
  "fx": {"usdkrw": 1470},
  "briefing": {
    "dateLabel": "${todayDot} (${weekday})",
    "headline": "오늘자 로보틱스 시장 핵심 헤드라인 한 문장",
    "summary": "오늘 기준 로보틱스 시장 현황을 요약한 한 문장",
    "points": ["핵심 뉴스/트렌드 1", "핵심 뉴스/트렌드 2", "핵심 뉴스/트렌드 3"]
  },
  "news": {
    "kr": [
      {"date": "YYYY-MM-DD", "cat": "시장", "title": "실제 기사 제목"}
    ],
    "global": [
      {"date": "YYYY-MM-DD", "cat": "기술", "title": "실제 기사 제목"}
    ]
  }
}`;

const prompt = `당신은 로보틱스 산업 전문 리서처입니다. 오늘(${todayDot}, ${weekday}요일) 기준으로 웹 검색을 실제로 수행해서
로보틱스 산업 관련 최신 뉴스를 조사하세요.

요구사항:
- news.kr: 최근 3개월 이내의 실제 한국 로보틱스 산업 뉴스 12~15개 (한국어 매체 기준)
- news.global: 최근 3개월 이내의 실제 해외(미국/중국/유럽/일본 등) 로보틱스 산업 뉴스 12~15개
- 각 뉴스 항목의 cat은 "시장" | "경쟁" | "기술" | "정책" 중 하나
- 두 배열 모두 date 기준 최신순으로 정렬
- briefing.headline / summary / points 는 오늘 조사한 뉴스를 바탕으로 작성
- fx.usdkrw 는 오늘자 원/달러 환율(숫자, 콤마 없이)을 검색해서 채울 것
- title은 실제로 검색된 기사 제목을 최대한 그대로 사용 (지어내지 말 것)

아래 JSON 스키마와 정확히 동일한 구조로, **다른 설명 없이 JSON 객체 하나만** 출력하세요:
${SCHEMA_EXAMPLE}`;

const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function main() {
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 4096 }
    })
  });

  if (!upstream.ok) {
    console.error('Gemini API 오류:', upstream.status, await upstream.text());
    process.exit(1);
  }

  const data = await upstream.json();
  const candidate = data && data.candidates && data.candidates[0];
  const parts = candidate && candidate.content && candidate.content.parts;
  let text = Array.isArray(parts) ? parts.map((p) => p.text || '').join('') : '';

  // Gemini sometimes wraps JSON in ```json ... ``` fences even when told not to.
  text = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.error('JSON 파싱 실패. Gemini 원본 응답:\n', text);
    process.exit(1);
  }

  if (
    !parsed.news ||
    !Array.isArray(parsed.news.kr) || parsed.news.kr.length === 0 ||
    !Array.isArray(parsed.news.global) || parsed.news.global.length === 0 ||
    !parsed.briefing
  ) {
    console.error('예상한 스키마가 아닙니다:', JSON.stringify(parsed).slice(0, 800));
    process.exit(1);
  }

  const outPath = path.join(process.cwd(), 'data', 'daily.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2) + '\n');
  console.log('data/daily.json 갱신 완료:', todayDot, '| kr:', parsed.news.kr.length, '| global:', parsed.news.global.length);
}

main().catch((err) => {
  console.error('스크립트 실행 중 오류:', err);
  process.exit(1);
});
