# ROBOSENSE · 로보틱스 마켓 인텔리전스

레인보우로보틱스 / 현대오토에버 Robot SI 등 경력직 지원용 포트폴리오 데모 웹서비스입니다.

- **대시보드**: 정적 페이지(`index.html`) — Vercel에 그대로 배포
- **JARVIS 챗봇**: `api/chat.js` (Vercel 서버리스 함수)가 브라우저 대신 Gemini API를 호출. API 키는 서버에만 존재하고 브라우저에는 절대 노출되지 않음
- **매일 아침 자동 갱신**: GitHub Actions가 매일 06:00 KST에 깨어나서, Gemini의 **Google Search 연동(grounding)** 기능으로 실제 최신 로보틱스 뉴스를 검색 → `data/daily.json`을 다시 씀 → 자동 커밋·푸시 → Vercel이 그 커밋을 감지해서 자동 재배포

즉 "브라우저가 Gemini를 직접 부르는 부분"과 "매일 데이터를 새로 만드는 부분"은 서로 다른 두 파이프라인입니다. 이 둘 다 같은 `GEMINI_API_KEY`를 쓰지만, **저장 위치가 다릅니다** (Vercel 환경변수 vs GitHub Actions 시크릿) — 아래에서 둘 다 등록합니다.

## 파일 구조

```
.
├── index.html                        # 대시보드 (로딩 시 data/daily.json을 fetch해서 오늘자 뉴스·브리핑으로 덮어씀)
├── data/
│   └── daily.json                     # 매일 자동 갱신되는 날짜·브리핑·뉴스 (GitHub Actions가 덮어씀)
├── api/
│   └── chat.js                        # JARVIS 챗봇 → Gemini API 프록시 (Vercel 서버리스 함수)
├── scripts/
│   └── update-daily.mjs               # Gemini(Google Search grounding)로 오늘자 뉴스를 조사해 data/daily.json을 다시 쓰는 스크립트
├── .github/
│   └── workflows/
│       └── daily-update.yml           # 위 스크립트를 매일 06:00 KST에 실행하는 GitHub Actions 워크플로우
├── package.json
├── .env.example
└── .gitignore
```

## 1. Gemini API 키 발급

1. https://aistudio.google.com/apikey 접속 (구글 계정 로그인)
2. **Create API key** 클릭 → 발급된 키 복사 (무료 티어로 바로 사용 가능)

> 무료 티어는 입력한 프롬프트/응답이 구글 모델 개선에 활용될 수 있다는 정책이 있습니다. 민감한 내용은 넣지 않는 걸 권장합니다.

## 2. GitHub에 올리기

이 폴더 전체(숨김 폴더 `.github` 포함)를 저장소 루트에 그대로 올립니다.

```bash
git init
git add .
git commit -m "Initial commit: ROBOSENSE dashboard + daily auto-update"
git branch -M main
git remote add origin https://github.com/<내-깃허브계정>/robosense.git
git push -u origin main
```

GitHub 웹 화면의 "uploading an existing file" 방식으로 올릴 경우, `.github/workflows/daily-update.yml`처럼
점(`.`)으로 시작하는 폴더는 탐색기에서 "숨김 파일 표시"를 켜야 보일 수 있습니다. 안 보이면 파일 탐색기에서
숨긴 항목 보기를 켜주세요.

## 3. Vercel 배포 + 환경변수 등록 (챗봇용)

1. https://vercel.com 접속 → GitHub 계정으로 로그인
2. **Add New... → Project** → 방금 push한 저장소 Import
3. Framework Preset은 **Other**로 두면 됩니다
4. **Environment Variables**에 추가:
   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | 1번에서 발급받은 키 |
5. **Deploy** 클릭 → 1분 내외로 배포 완료

이제 `https://your-project.vercel.app`에서 JARVIS에게 질문하면 `/api/chat` → Gemini API를 거쳐 실제 응답이 옵니다.

## 4. GitHub Actions 시크릿 등록 (매일 자동 갱신용)

Vercel 환경변수와는 **별도로**, GitHub 저장소에도 같은 키를 한 번 더 등록해야 자동 갱신이 동작합니다.

1. GitHub 저장소 → **Settings** → 좌측 **Secrets and variables → Actions**
2. **New repository secret** 클릭
3. Name: `GEMINI_API_KEY`, Secret: 1번에서 발급받은 키 → **Add secret**

## 5. 자동 갱신 동작 확인 (수동으로 한 번 실행해보기)

매일 새벽까지 기다리지 않고 바로 테스트할 수 있습니다.

1. GitHub 저장소 → 상단 **Actions** 탭
2. 좌측 목록에서 **Daily news & briefing update** 클릭
3. 우측 **Run workflow** 버튼 → **Run workflow** 한 번 더 클릭
4. 30초~1분 정도 후 초록색 체크가 뜨면 성공. 저장소에 `chore: 데일리 뉴스·브리핑 자동 갱신 [skip ci]` 커밋이 새로 생긴 걸 확인할 수 있습니다
5. 그 커밋을 Vercel이 감지해서 자동으로 재배포합니다 (Vercel 대시보드 Deployments 탭에서 확인)
6. 사이트를 새로고침하면 오늘 날짜·뉴스로 바뀌어 있어야 합니다

이후로는 별다른 조작 없이 매일 06:00 KST에 자동으로 반복됩니다. (GitHub Actions 스케줄은 UTC 기준이라
워크플로우 파일에는 `21:00 UTC`로 적혀 있는데, 이게 한국시간 06:00입니다.)

> GitHub Actions 스케줄은 트래픽이 몰리면 몇 분 정도 늦게 실행될 수 있습니다 — 정각에 딱 맞지 않아도 정상입니다.

## 6. 로컬에서 테스트하기 (선택)

```bash
npm i -g vercel
vercel dev
```

프로젝트 루트에 `.env` 파일을 만들고 `.env.example`을 참고해 `GEMINI_API_KEY`를 넣으면
`http://localhost:3000`에서 챗봇까지 동일하게 동작합니다.

수집 스크립트만 따로 테스트하려면:

```bash
GEMINI_API_KEY=발급받은키 node scripts/update-daily.mjs
```

## 문제가 생겼을 때

- **Actions가 빨간 X로 실패**: Actions 탭 → 실패한 실행 클릭 → 로그 확인. 대부분 `GEMINI_API_KEY` 시크릿 미등록이거나,
  Gemini가 JSON이 아닌 형식으로 답해서 파싱에 실패한 경우입니다. 후자는 몇 번 재실행하면 대개 해결됩니다.
- **자동 갱신은 됐는데 사이트에 반영이 안 됨**: Vercel이 그 커밋을 실제로 감지해서 재배포했는지 Vercel Deployments 탭에서 확인하세요.
- **JARVIS 챗봇이 모델 관련 오류를 냄**: Gemini 쪽 모델명이 또 바뀌었을 수 있습니다. `api/chat.js`와
  `scripts/update-daily.mjs` 안의 기본 모델명(`gemini-3.6-flash`)을 최신 모델명으로 바꿔주세요.

## 보안 관련 주의사항

- `GEMINI_API_KEY`는 **절대** `index.html`이나 다른 클라이언트 코드에 직접 넣지 마세요. `api/chat.js`와
  `scripts/update-daily.mjs`처럼 서버(Vercel Function / GitHub Actions) 안에서만 호출되어야 안전합니다.
- `.env` 파일은 `.gitignore`에 포함되어 있어 GitHub에 올라가지 않습니다. 실수로 커밋하지 않도록 주의하세요.
