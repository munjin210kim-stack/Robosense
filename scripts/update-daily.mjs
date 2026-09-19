// scripts/update-daily.mjs
//
// Run by .github/workflows/daily-update.yml on a daily cron schedule.
//
// Design (important): Gemini's "Google Search grounding" tool has a very low/zero
// free-tier quota in practice (confirmed 429 RESOURCE_EXHAUSTED on first call even
// on a fresh key). So this script does NOT ask Gemini to search the web. Instead:
//   1. Real news comes from GNews.io (a real news-search API, 100 free requests/day).
//   2. Real FX rate comes from the Frankfurter API (free, no key required).
//   3. Gemini (plain generateContent, no tools) is used ONLY to categorize the
//      already-real headlines and write the daily briefing text — it never invents
//      article titles, dates or URLs.
// This keeps everything on free tiers with no billing risk.
//
// Required env vars (GitHub repository secrets):
//   GEMINI_API_KEY  - from https://aistudio.google.com/apikey
//   GNEWS_API_KEY   - from https://gnews.io (free signup, no credit card)
// Optional:
//   GEMINI_MODEL    - default: gemini-3.6-flash

import fs from 'node:fs';
import path from 'node:path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY 환경변수가 없습니다. (GitHub 저장소 Settings > Secrets and variables > Actions)');
  process.exit(1);
}
if (!GNEWS_API_KEY) {
  console.error('GNEWS_API_KEY 환경변수가 없습니다. https://gnews.io 에서 무료 키를 발급받아 Actions 시크릿에 추가해주세요.');
  process.exit(1);
}

const now = new Date();
const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000); // KST = UTC+9
const y = kst.getUTCFullYear();
const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
const d = String(kst.getUTCDate()).padStart(2, '0');
const todayDot = `${y}.${m}.${d}`;
const weekday = ['일', '월', '화', '수', '목', '금', '토'][kst.getUTCDay()];

const FALLBACK_CAT = '시장';
const CATS = ['시장', '경쟁', '기술', '정책'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- 1. Real news via GNews ----------
async function fetchGNews(query, lang, max, attempt = 1) {
  const url =
    'https://gnews.io/api/v4/search?q=' + encodeURIComponent(query) +
    '&lang=' + lang + '&max=' + max + '&sortby=publishedAt&apikey=' + GNEWS_API_KEY;
  const res = await fetch(url);
  if (res.status === 429 && attempt < 3) {
    console.warn(`GNews 429(요청 과다), ${attempt}차 재시도 전 대기...`);
    await sleep(4000 * attempt);
    return fetchGNews(query, lang, max, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('GNews API 오류 (' + lang + '): ' + res.status + ' ' + body.slice(0, 300));
  }
  const data = await res.json();
  const articles = Array.isArray(data.articles) ? data.articles : [];
  return articles.map((a) => ({
    date: (a.publishedAt || '').slice(0, 10) || todayIsoFallback(),
    title: (a.title || '').trim(),
    url: a.url || '',
    cat: FALLBACK_CAT
  })).filter((a) => a.title);
}
function todayIsoFallback() {
  return `${y}-${m}-${d}`;
}

// ---------- 2. Real FX rate via Frankfurter (no key needed) ----------
async function fetchUsdKrw() {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=KRW');
    if (!res.ok) throw new Error('FX API ' + res.status);
    const data = await res.json();
    const rate = data && data.rates && data.rates.KRW;
    if (typeof rate === 'number' && rate > 0) return Math.round(rate);
  } catch (e) {
    console.warn('환율 조회 실패, 기본값 유지:', e.message);
  }
  return null; // caller keeps previous value
}

// ---------- 3. Gemini: categorize + write briefing (no search tool) ----------
async function categorizeAndBrief(krItems, globalItems) {
  const listText = (items, label) =>
    label + ':\n' + items.map((it, i) => `${i + 1}. (${it.date}) ${it.title}`).join('\n');

  const prompt = `다음은 방금 실제 뉴스 API로 가져온 로보틱스 산업 관련 기사 목록입니다. 제목/날짜는 이미 확정된 실제 데이터이므로 절대 새로 만들거나 바꾸지 마세요.

${listText(krItems, '[한국 기사]')}

${listText(globalItems, '[해외 기사]')}

작업:
1. 각 기사를 "시장" | "경쟁" | "기술" | "정책" 중 하나로 분류 (기사 순서를 그대로 유지한 배열로)
2. 위 기사들 전체를 참고해서 오늘(${todayDot}, ${weekday}요일)의 로보틱스 시장 브리핑을 작성:
   - headline: 오늘의 핵심 헤드라인 한 문장
   - summary: 로보틱스 시장 현황 요약 한 문장
   - points: 핵심 뉴스/트렌드 3개 (배열)

다른 설명 없이 아래 JSON 형식으로만 출력하세요:
{
  "krCats": ["시장", "기술", ...],
  "globalCats": ["경쟁", "정책", ...],
  "briefing": {
    "headline": "...",
    "summary": "...",
    "points": ["...", "...", "..."]
  }
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
    })
  });

  if (!res.ok) {
    console.warn('Gemini 카테고리/브리핑 생성 실패 (' + res.status + '), 기본값으로 진행합니다.');
    return null;
  }
  const data = await res.json();
  const candidate = data && data.candidates && data.candidates[0];
  const parts = candidate && candidate.content && candidate.content.parts;
  let text = Array.isArray(parts) ? parts.map((p) => p.text || '').join('') : '';
  text = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');

  try {
    const parsed = JSON.parse(text);
    return parsed;
  } catch (e) {
    console.warn('Gemini 응답 JSON 파싱 실패, 기본값으로 진행합니다. 원본:', text.slice(0, 500));
    return null;
  }
}

function applyCats(items, cats) {
  if (!Array.isArray(cats)) return items;
  return items.map((it, i) => ({ ...it, cat: CATS.includes(cats[i]) ? cats[i] : FALLBACK_CAT }));
}

function defaultBriefing(krItems, globalItems) {
  return {
    headline: '로보틱스 산업 최신 동향',
    summary: `${todayDot} 기준 국내외 로보틱스 업계 주요 뉴스 ${krItems.length + globalItems.length}건을 정리했습니다.`,
    points: [krItems[0], globalItems[0], krItems[1]].filter(Boolean).map((it) => it.title)
  };
}

async function main() {
  const krItems = await fetchGNews('로봇 OR 로보틱스 OR 협동로봇 OR 휴머노이드', 'ko', 10);
  await sleep(2000); // GNews 무료 플랜은 초당 요청 수 제한이 있어 한 박자 쉬고 다음 요청
  const globalItems = await fetchGNews('robotics OR "humanoid robot" OR "industrial robot"', 'en', 10);
  const fxRate = await fetchUsdKrw(); // 다른 호스트라 GNews 제한과 무관, 바로 호출

  if (krItems.length === 0 && globalItems.length === 0) {
    console.error('GNews에서 기사를 하나도 가져오지 못했습니다. 쿼리나 API 키 상태를 확인해주세요.');
    process.exit(1);
  }

  const enrichment = await categorizeAndBrief(krItems, globalItems);

  const finalKr = enrichment ? applyCats(krItems, enrichment.krCats) : krItems;
  const finalGlobal = enrichment ? applyCats(globalItems, enrichment.globalCats) : globalItems;
  const briefing = enrichment && enrichment.briefing
    ? enrichment.briefing
    : defaultBriefing(krItems, globalItems);

  const outPath = path.join(process.cwd(), 'data', 'daily.json');
  const prevRaw = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf-8')) : null;
  const prevFx = (prevRaw && prevRaw.fx && prevRaw.fx.usdkrw) || 1470;

  const daily = {
    asOfDate: todayDot,
    fx: { usdkrw: fxRate || prevFx },
    briefing: {
      dateLabel: `${todayDot} (${weekday})`,
      headline: briefing.headline,
      summary: briefing.summary,
      points: Array.isArray(briefing.points) && briefing.points.length ? briefing.points.slice(0, 3) : []
    },
    news: { kr: finalKr, global: finalGlobal }
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(daily, null, 2) + '\n');
  console.log(
    'data/daily.json 갱신 완료:', todayDot,
    '| kr:', finalKr.length, '| global:', finalGlobal.length,
    '| fx:', daily.fx.usdkrw,
    '| gemini 보강:', enrichment ? '성공' : '실패(기본값 사용)'
  );
}

main().catch((err) => {
  console.error('스크립트 실행 중 오류:', err);
  process.exit(1);
});
