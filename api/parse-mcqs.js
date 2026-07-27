// Vercel serverless function.
// Runs on the server only — the Gemini key never reaches the browser.
// Set GEMINI_API_KEY in Vercel: Project -> Settings -> Environment Variables.
// Get a free key (no credit card needed) at https://aistudio.google.com/apikey

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing GEMINI_API_KEY. Add it in Vercel project settings and redeploy." });
    return;
  }

  const { text } = req.body || {};
  if (!text || !text.trim()) {
    res.status(400).json({ error: "No text provided." });
    return;
  }

  const prompt = `You will be given raw text extracted from a PDF of multiple-choice questions (MCQs) for a medical/pre-medical entrance exam (MDCAT/MBBS/BSN level).

Extract every distinct MCQ you can find in the text. For each one, produce an object with:
- "question": the question text, cleaned up (no leading numbers like "12." or "Q12.")
- "options": an array of EXACTLY 4 answer choices as plain strings (no "A)", "B)" prefixes)
- "correct": the 0-based index (0, 1, 2, or 3) of the correct option
- "explanation": a short 1-2 sentence explanation of why that option is correct
- "answer_source": "text" if the correct answer was explicitly marked/given in the source text (e.g. an answer key, bolded option, or "Answer: B"), or "ai" if no answer was marked in the text and you had to determine the correct answer yourself using subject knowledge

If the correct answer is not explicitly marked in the text, use your own expert knowledge of the subject to determine the single best answer — do not skip the question.

Ignore anything that is not a real MCQ (headers, page numbers, instructions, etc).

Return ONLY a JSON object of this exact shape, with no markdown fences and no extra commentary:
{"mcqs": [ { "question": "...", "options": ["...","...","...","..."], "correct": 0, "explanation": "...", "answer_source": "text" } ]}

TEXT TO PROCESS:
"""
${text.slice(0, 45000)}
"""`;

  try {
    const model = "gemini-2.0-flash";
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      res.status(502).json({ error: `Gemini request failed: ${errText.slice(0, 500)}` });
      return;
    }

    const data = await geminiRes.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      res.status(502).json({ error: "AI response was not valid JSON.", raw: raw.slice(0, 500) });
      return;
    }

    const mcqs = Array.isArray(parsed.mcqs) ? parsed.mcqs : [];
    res.status(200).json({ mcqs });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
