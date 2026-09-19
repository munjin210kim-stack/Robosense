// /api/chat.js
// Vercel Serverless Function (Node.js runtime).
// Keeps the Gemini API key on the server — never expose it in client-side code.
//
// Required environment variable (set in Vercel Project Settings -> Environment Variables):
//   GEMINI_API_KEY = <your Gemini API key from https://aistudio.google.com/apikey>
// Optional:
//   GEMINI_MODEL   = gemini-3.6-flash (default) | gemini-2.5-flash | gemini-3.1-flash-lite | ...

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY가 설정되지 않았습니다. Vercel 프로젝트의 Environment Variables에 GEMINI_API_KEY를 추가한 뒤 다시 배포해주세요.'
    });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const prompt = body.prompt;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt(문자열)가 필요합니다.' });
  }
  if (prompt.length > 12000) {
    return res.status(400).json({ error: 'prompt가 너무 깁니다.' });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 640 }
      })
    });

    const data = await upstream.json().catch(function () { return {}; });

    if (!upstream.ok) {
      const msg = (data && data.error && data.error.message) || ('Gemini API 오류 (HTTP ' + upstream.status + ')');
      return res.status(upstream.status).json({ error: msg });
    }

    const candidate = data && data.candidates && data.candidates[0];
    const parts = candidate && candidate.content && candidate.content.parts;
    const text = Array.isArray(parts) ? parts.map(function (p) { return p.text || ''; }).join('').trim() : '';

    if (!text) {
      // Common cause: response was blocked by safety filters (finishReason: SAFETY), or empty output.
      const finishReason = candidate && candidate.finishReason;
      return res.status(502).json({
        error: finishReason
          ? ('Gemini 응답이 비어 있습니다 (finishReason: ' + finishReason + ').')
          : 'Gemini 응답에서 텍스트를 찾지 못했습니다.'
      });
    }

    return res.status(200).json({ text: text });
  } catch (err) {
    return res.status(500).json({ error: (err && err.message) || '서버에서 오류가 발생했습니다.' });
  }
};
