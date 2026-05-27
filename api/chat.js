import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const message = body.message || "přidej aviváž do nákupu";

    const aiResult = await getAiActions(message);

    const savedActions = [];

    for (const action of aiResult.actions || []) {
      if (action.requires_confirmation === true) {
        continue;
      }

      if (action.type === "shopping") {
        const { data, error } = await supabase
          .from("shopping")
          .insert([{ item: action.item, status: "open" }])
          .select();

        if (!error) savedActions.push({ ...action, saved: true, data });
      }

      if (action.type === "task") {
        const { data, error } = await supabase
          .from("tasks")
          .insert([
            {
              title: action.title,
              status: "open",
              priority: action.priority || "normal"
            }
          ])
          .select();

        if (!error) savedActions.push({ ...action, saved: true, data });
      }

      if (action.type === "health") {
        const { data, error } = await supabase
          .from("health")
          .insert([
            {
              type: action.subtype,
              value: action.value,
              note: action.note || null,
              date: new Date()
            }
          ])
          .select();

        if (!error) savedActions.push({ ...action, saved: true, data });
      }

      if (action.type === "event") {
        const { data, error } = await supabase
          .from("events")
          .insert([
            {
              title: action.title,
              datetime: action.datetime
            }
          ])
          .select();

        if (!error) savedActions.push({ ...action, saved: true, data });
      }

      if (action.type === "memory") {
        const { data, error } = await supabase
          .from("memory")
          .insert([
            {
              type: action.subtype,
              content: action.content
            }
          ])
          .select();

        if (!error) savedActions.push({ ...action, saved: true, data });
      }
    }

    return res.status(200).json({
      actions: aiResult.actions || [],
      savedActions,
      response: aiResult.response
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}

async function getAiActions(message) {
  const ai = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `
Jsi osobní AI asistent pro životní organizaci.

Tvůj styl:
- proaktivní kouč
- lehce přátelský
- 70 % osobní život, 30 % práce
- jednoduchý a praktický tón

Tvůj úkol:
Převeď zprávu uživatele na strukturované akce.

Vrať POUZE validní JSON v tomto tvaru:

{
  "actions": [
    {
      "type": "shopping",
      "item": "...",
      "requires_confirmation": false
    },
    {
      "type": "task",
      "title": "...",
      "priority": "normal",
      "requires_confirmation": false
    },
    {
      "type": "health",
      "subtype": "water",
      "value": 1000,
      "note": "...",
      "requires_confirmation": false
    },
    {
      "type": "event",
      "title": "...",
      "datetime": "2026-05-28T15:00:00",
      "requires_confirmation": false
    },
    {
      "type": "memory",
      "subtype": "preference",
      "content": "...",
      "requires_confirmation": false
    }
  ],
  "response": "krátká odpověď česky"
}

Pravidla rozhodování:

1. Automaticky proveď:
- přidání nákupu
- uložení vody
- jednoduchý úkol
- jednoduchou poznámku do paměti
- jasně zadanou událost

2. Vyžádej potvrzení, pokud:
- máš změnit existující plán
- máš přesunout schůzku
- máš přeplánovat den
- máš změnit rozpočet
- máš změnit rutinu
- jde o brainstorming
- nejsi si jistá významem

3. Pokud je potřeba potvrzení:
- nastav "requires_confirmation": true
- nic se pak automaticky neuloží
- v response se zeptej na potvrzení

4. Pokud jde o brainstorming:
- neukládej žádné akce
- vrať actions: []
- na konci se zeptej, jestli chce uživatel něco uložit

5. Voda:
- "litr" = 1000 ml
- "půl litru" = 500 ml
- ukládej jako health subtype water

6. Jídlo zatím ukládej jako health subtype food s orientační hodnotou kalorií, pokud ji umíš odhadnout.

Zpráva uživatele:
${message}
`
              }
            ]
          }
        ]
      })
    }
  );

const aiData = await ai.json();
const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

return {
  debug: true,
  rawText: text,
  rawGeminiResponse: aiData,
  actions: [],
  response: "Debug režim"
};
}
