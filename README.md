# ROBOSENSE · 로보틱스 마켓 인텔리전스

레인보우로보틱스 / 현대오토에버 Robot SI 등 경력직 지원용 포트폴리오 데모 웹서비스입니다.
정적 대시보드(`index.html`) + JARVIS 챗봇용 Vercel 서버리스 함수(`api/chat.js`)로 구성되어 있고,
Gemini API 키는 브라우저에 노출되지 않고 서버(Vercel Function) 안에서만 사용됩니다.

## 파일 구조

```
.
├── index.html        # 대시보드 전체 (정적 페이지, 그대로 배포)
├── api/
│   └── chat.js        # JARVIS 챗봇 → Gemini API 프록시 (Vercel 서버리스 함수)
├── package.json
├── .env.example       # 로컬 테스트용 환경변수 예시
└── .gitignore
```

## 1. Gemini API 키 발급

1. https://aistudio.google.com/apikey 접속 (구글 계정 로그인)
2. **Create API key** 클릭 → 발급된 키 복사 (무료 티어로 바로 사용 가능)

> 무료 티어는 입력한 프롬프트/응답이 구글 모델 개선에 활용될 수 있다는 정책이 있습니다. 민감한 내용은 넣지 않는 걸 권장합니다.

## 2. GitHub에 올리기

이 폴더를 그대로 저장소 루트에 두고:

```bash
git init
git add .
git commit -m "Initial commit: ROBOSENSE dashboard"
git branch -M main
git remote add origin https://github.com/<내-깃허브계정>/robosense.git
git push -u origin main
```

## 3. Vercel 배포

1. https://vercel.com 접속 → GitHub 계정으로 로그인
2. **Add New... → Project** → 방금 push한 저장소 Import
3. Framework Preset은 **Other**로 두면 됩니다 (별도 빌드 과정 없이 정적 파일 + `/api` 폴더를 그대로 인식합니다)
4. **Environment Variables**에 아래 값을 추가:
   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | 1번에서 발급받은 키 |
5. **Deploy** 클릭 → 1분 내외로 배포 완료

배포가 끝나면 `https://your-project.vercel.app` 형태의 주소가 생성됩니다. 접속해서 우측 JARVIS 챗봇에 질문하면
`/api/chat` → Gemini API를 거쳐 실제 응답이 돌아옵니다.

## 4. 로컬에서 테스트하기 (선택)

```bash
npm i -g vercel
vercel dev
```

프로젝트 루트에 `.env` 파일을 만들고 `.env.example`을 참고해 `GEMINI_API_KEY`를 넣으면
`http://localhost:3000`에서 챗봇까지 동일하게 동작합니다.

## 데이터 갱신하는 법

이 대시보드의 뉴스·시장 수치는 `index.html` 안의 `DATA` 객체(스크립트 최상단)에 하드코딩되어 있는
목업/추정치입니다. 최신 정보로 갱신하고 싶을 때는:

- 직접 `DATA.news`, `DATA.globalMarket`, `DATA.koreaMarket`, `DATA.competitors` 값을 수정하거나
- Claude에게 "오늘자로 갱신해줘"라고 요청해 최신 뉴스/수치를 리서치한 새 버전을 받은 뒤, 그 `index.html`로 교체하고 다시 push하면 Vercel이 자동으로 재배포합니다.

완전 자동(매일 아침 6시 크론) 갱신을 원하면 Vercel Cron Jobs + 별도 데이터 수집 스크립트가 필요합니다 —
필요하면 이어서 구성해드릴 수 있어요.

## 보안 관련 주의사항

- `GEMINI_API_KEY`는 **절대** `index.html`이나 다른 클라이언트 코드에 직접 넣지 마세요. 반드시 `api/chat.js`를 통해
  서버 사이드에서만 호출되어야 안전합니다 (지금 구조가 이미 그렇게 되어 있습니다).
- `.env` 파일은 `.gitignore`에 포함되어 있어 GitHub에 올라가지 않습니다. 실수로 커밋하지 않도록 주의하세요.
