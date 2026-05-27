import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  try {
    const message =
      req.method === "POST"
        ? req.body?.message
        : "přidej aviváž do nákupu";

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
Jsi osobní AI asistent. Zprávu uživatele převeď na JSON.

Povolený výstup:
{
  "actions": [
    {"type":"shopping","item":"..."},
    {"type":"task","title":"..."},
    {"type":"health","subtype":"water","value":1000}
  ],
  "response":"krátká odpověď česky"
}

Pravidla:
- Vrať pouze validní JSON.
- Pokud uživatel chce něco koupit, použij type shopping.
- Pokud uživatel vypil vodu, použij type health, subtype water, value v ml.
- Pokud uživatel zadá úkol, použij type task.
- Pokud si nejsi jistá, vrať actions: [] a zeptej se v response.

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

    const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    for (const action of parsed.actions || []) {
      if (action.type === "shopping") {
        await supabase
          .from("shopping")
          .insert([{ item: action.item, status: "open" }]);
      }

      if (action.type === "task") {
        await supabase
          .from("tasks")
          .insert([{ title: action.title, status: "open", priority: "normal" }]);
      }

      if (action.type === "health") {
        await supabase.from("health").insert([
          {
            type: action.subtype,
            value: action.value,
            date: new Date()
          }
        ]);
      }
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
