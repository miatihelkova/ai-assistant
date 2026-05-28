const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  return apiKey;
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeAiResult(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return {
      actions: [],
      response: "AI vrátila neplatnou odpověď.",
    };
  }

  return {
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    response: typeof parsed.response === "string"
      ? parsed.response
      : "",
  };
}

export async function getAiActions(message, today) {
  const apiKey = getGeminiApiKey();

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
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
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    return {
      actions: [],
      response: "Nepodařilo se spojit s AI modelem.",
      debug: data,
    };
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (!text) {
    return {
      actions: [],
      response: "AI nevrátila žádný text.",
      debug: data,
    };
  }

  const parsed = safeParseJson(text);

  if (!parsed) {
    return {
      actions: [],
      response: "AI vrátila neplatný JSON. Zkus to prosím formulovat znovu.",
      debug: text,
    };
  }

  return normalizeAiResult(parsed);
}

function buildPrompt(message, today) {
  return `
Jsi osobní AI asistent pro životní organizaci.

Styl:
- proaktivní kouč
- lehce přátelský tón
- jednoduché a praktické odpovědi
- 70 % osobní život, 30 % práce
- ne moc terapeutický
- ne moc corporate
- praktický, lidský, lehce motivační

Vrať POUZE JSON bez markdownu.

Formát:
{
  "actions": [],
  "response": ""
}

Povolené akce:

1. shopping:
{
  "type": "shopping",
  "item": "...",
  "requires_confirmation": false
}

2. health:
{
  "type": "health",
  "subtype": "water",
  "value": 1000,
  "note": "",
  "requires_confirmation": false
}

3. task:
{
  "type": "task",
  "title": "...",
  "priority": "normal",
  "requires_confirmation": false
}

4. event:
{
  "type": "event",
  "title": "...",
  "datetime": "${today}T15:00:00",
  "requires_confirmation": false
}

5. memory:
{
  "type": "memory",
  "subtype": "preference",
  "content": "...",
  "requires_confirmation": false
}

6. plan_change:
{
  "type": "plan_change",
  "title": "...",
  "details": "...",
  "requires_confirmation": true
}

7. focus:
{
  "type": "focus",
  "content": "...",
  "priority": "high",
  "source": "ai",
  "requires_confirmation": false
}

Pravidla:
- Přidání nákupu = shopping.
- Vypitá voda = health subtype water.
- litr = 1000 ml.
- půl litru = 500 ml.
- Jednoduchý úkol = task.
- Jasná schůzka s datem a časem = event.
- Jasně řečená dlouhodobá preference = memory.
- Pokud uživatel explicitně řekne, že je něco důležité, priorita dne nebo hlavní fokus, VŽDY vytvoř focus akci.
- Focus používej pro priority dne, důležité úkoly, wellbeing nebo věci vyžadující pozornost dnes.
- Pokud uživatel chce přeplánovat den, přesunout trénink, změnit rutinu, změnit existující plán, změnit rozpočet nebo přesunout schůzku, vrať akci typu plan_change s requires_confirmation true.
- Pokud je potřeba potvrzení, nevracej běžnou ukládací akci. Vrať pouze plan_change nebo akci s requires_confirmation true.
- Pokud jde o brainstorming, neukládej žádné akce. Vrať actions: [] a v response se zeptej, jestli chce uživatel něco z toho uložit.
- Pokud si nejsi jistá, actions nech prázdné a zeptej se v response.
- Odpověz česky.

Důležité:
Dnes je ${today}.
Pokud uživatel použije relativní datum jako "zítra", "dnes", "pozítří", přepočítej ho podle dnešního data ${today}.

Zpráva uživatele:
${message}
`;
}
