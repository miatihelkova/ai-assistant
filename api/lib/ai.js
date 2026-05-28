export async function getAiActions(message, today) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.4,
        },

        contents: [
          {
            parts: [
              {
                text: buildPrompt(message, today),
              },
            ],
          },
        ],
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return {
      actions: [],
      response: "Nepodařilo se spojit s AI modelem.",
      debug: data,
    };
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (!text) {
    return {
      actions: [],
      response: "AI nevrátila žádný text.",
    };
  }

  try {
    const parsed = JSON.parse(text);

    return {
      actions:
