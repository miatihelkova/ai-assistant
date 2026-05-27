import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const message = body.message || "přidej aviváž do nákupu";

    const aiResult = await getAiActions(message);
    const savedActions = [];

    for (const action of aiResult.actions || []) {
      if (action.requires_confirmation) continue;

      if (action.type === "shopping") {
        const { data, error } = await supabase
          .from("shopping")
          .insert([{ item: action.item, status: "open" }])
          .select();

        if (error) savedActions.push({ ...action, saved: false, error: error.message });
        else savedActions.push({ ...action, saved: true, data });
      }

      if (action.type === "health") {
        const { data, error } = await supabase
          .from("health")
          .insert([{
            type: action.subtype,
            value: action.value,
            note: action.note || null,
            date: new Date()
          }])
          .select();

        if (error) savedActions.push({ ...action, saved: false, error: error.message });
        else savedActions.push({ ...action, saved: true, data });
      }

      if (action.type === "task") {
        const { data, error } = await supabase
          .from("tasks")
          .insert([{
            title: action.title,
            status: "open",
            priority: action.priority || "normal"
          }])
          .select();

        if (error) savedActions.push({ ...action, saved: false, error: error.message });
        else savedActions.push({ ...action, saved: true, data });
      }

      if (action.type === "event") {
        const { data, error } = await supabase
          .from("events")
          .insert([{
            title: action.title,
            datetime: action.datetime
          }])
          .select();

        if (error) savedActions.push({ ...action, saved: false, error: error.message });
        else savedActions.push({ ...action, saved: true, data });
      }

      if (action.type === "memory") {
        const { data, error } = await supabase
          .from("memory")
          .insert([{
            type: action.subtype,
            content: action.content
          }])
          .select();

        if (error) savedActions.push({ ...action, saved: false, error: error.message });
        else savedActions.push({ ...action, saved: true, data });
      }
    }

    return res.status(200).json({
      input: message,
      actions: aiResult.actions || [],
      savedActions,
      response: aiResult.response || ""
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
        generationConfig: {
          responseMimeType: "application/json"
        },
        contents: [
          {
            parts: [
              {
                text: `
Jsi osobní AI asistent pro životní organizaci.

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
  "datetime": "2026-05-28T15:00:00",
  "requires_confirmation": false
}

5. memory:
{
  "type": "memory",
  "subtype": "preference",
  "content": "...",
  "requires_confirmation": false
}

Pravidla:
- přidání nákupu = shopping
- vypitá voda = health subtype water
- litr = 1000 ml
- půl litru = 500 ml
- jednoduchý úkol = task
- jasná schůzka s datem a časem = event
- pokud si nejsi jistá, actions nech prázdné a zeptej se v response
- odpověz česky

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

  if (!text) {
    return {
      actions: [],
      response: "AI nevrátila žádný text.",
      debug: aiData
    };
  }

  return JSON.parse(text);
}
