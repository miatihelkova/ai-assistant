import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

function getTodayPragueDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
  }).format(new Date());
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?;:()[\]{}"'“”„]/g, "")
    .replace(/\s+/g, " ");
}

function createConfirmationToken() {
  return (
    Math.random().toString(36).substring(2, 10) +
    Date.now().toString(36)
  );
}

function validateAction(action) {
  if (!action || typeof action !== "object") {
    return {
      valid: false,
      reason: "Akce není objekt.",
    };
  }

  if (!action.type) {
    return {
      valid: false,
      reason: "Akci chybí type.",
    };
  }

  const allowedTypes = [
    "shopping",
    "health",
    "task",
    "event",
    "memory",
    "focus",
    "plan_change",
  ];

  if (!allowedTypes.includes(action.type)) {
    return {
      valid: false,
      reason: `Nepodporovaný typ akce: ${action.type}`,
    };
  }

  if (action.type === "plan_change") {
    return {
      valid: true,
    };
  }

  if (action.requires_confirmation) {
    return {
      valid: true,
    };
  }

  if (action.type === "shopping" && !action.item) {
    return {
      valid: false,
      reason: "Nákupní akci chybí item.",
    };
  }

  if (action.type === "health") {
    if (!action.subtype) {
      return {
        valid: false,
        reason: "Health akci chybí subtype.",
      };
    }

    if (typeof action.value !== "number") {
      return {
        valid: false,
        reason: "Health akci chybí číselná value.",
      };
    }
  }

  if (action.type === "task" && !action.title) {
    return {
      valid: false,
      reason: "Task akci chybí title.",
    };
  }

  if (action.type === "event") {
    if (!action.title) {
      return {
        valid: false,
        reason: "Event akci chybí title.",
      };
    }

    if (!action.datetime) {
      return {
        valid: false,
        reason: "Event akci chybí datetime.",
      };
    }
  }

  if (action.type === "memory") {
    if (!action.subtype) {
      return {
        valid: false,
        reason: "Memory akci chybí subtype.",
      };
    }

    if (!action.content) {
      return {
        valid: false,
        reason: "Memory akci chybí content.",
      };
    }
  }

  if (action.type === "focus" && !action.content) {
    return {
      valid: false,
      reason: "Focus akci chybí content.",
    };
  }

  return {
    valid: true,
  };
}

async function savePendingAction(action) {
  const token = createConfirmationToken();

  const { data, error } = await supabase
    .from("pending_actions")
    .insert([
      {
        type: action.type,
        payload: action,
        status: "pending",
        confirmation_token: token,
      },
    ])
    .select();

  if (error) {
    return {
      ...action,
      saved: false,
      pending: true,
      error: error.message,
    };
  }

  return {
    ...action,
    saved: true,
    pending: true,
    confirmation_token: token,
    data,
  };
}

async function saveShopping(action) {
  const { data, error } = await supabase
    .from("shopping")
    .insert([
      {
        item: action.item,
        status: "open",
      },
    ])
    .select();

  if (error) {
    return {
      ...action,
      saved: false,
      error: error.message,
    };
  }

  return {
    ...action,
    saved: true,
    data,
  };
}

async function saveHealth(action, today) {
  const { data, error } = await supabase
    .from("health")
    .insert([
      {
        type: action.subtype,
        value: action.value,
        note: action.note || null,
        date: today,
      },
    ])
    .select();

  if (error) {
    return {
      ...action,
      saved: false,
      error: error.message,
    };
  }

  return {
    ...action,
    saved: true,
    data,
  };
}

async function saveTask(action) {
  const { data, error } = await supabase
    .from("tasks")
    .insert([
      {
        title: action.title,
        status: "open",
        priority: action.priority || "normal",
      },
    ])
    .select();

  if (error) {
    return {
      ...action,
      saved: false,
      error: error.message,
    };
  }

  return {
    ...action,
    saved: true,
    data,
  };
}

async function saveEvent(action) {
  const { data, error } = await supabase
    .from("events")
    .insert([
      {
        title: action.title,
        datetime: action.datetime,
      },
    ])
    .select();

  if (error) {
    return {
      ...action,
      saved: false,
      error: error.message,
    };
  }

  return {
    ...action,
    saved: true,
    data,
  };
}

async function saveMemory(action) {
  const { data, error } = await supabase
    .from("memory")
    .insert([
      {
        type: action.subtype,
        content: action.content,
      },
    ])
    .select();

  if (error) {
    return {
      ...action,
      saved: false,
      error: error.message,
    };
  }

  return {
    ...action,
    saved: true,
    data,
  };
}

async function saveFocus(action, today) {
  const normalizedNewFocus = normalizeText(action.content);

  const { data: existingFocus, error: fetchError } = await supabase
    .from("focus_today")
    .select("id, content, normalized_content")
    .eq("date", today)
    .eq("completed", false)
    .eq("normalized_content", normalizedNewFocus)
    .limit(1);

  if (fetchError) {
    return {
      ...action,
      saved: false,
      error: fetchError.message,
    };
  }

  if (existingFocus && existingFocus.length > 0) {
    return {
      ...action,
      saved: false,
      skipped: true,
      duplicate: true,
      reason: "Tento focus už dnes existuje.",
      existing_id: existingFocus[0].id,
    };
  }

  const { data, error } = await supabase
    .from("focus_today")
    .insert([
      {
        type: "focus",
        content: action.content,
        normalized_content: normalizedNewFocus,
        priority: action.priority || "normal",
        source: action.source || "ai",
        completed: false,
        date: today,
      },
    ])
    .select();

  if (error) {
    if (error.code === "23505") {
      return {
        ...action,
        saved: false,
        skipped: true,
        duplicate: true,
        reason: "Tento focus už dnes existuje.",
      };
    }

    return {
      ...action,
      saved: false,
      error: error.message,
    };
  }

  return {
    ...action,
    saved: true,
    data,
  };
}

async function executeAction(action, today) {
  const validation = validateAction(action);

  if (!validation.valid) {
    return {
      ...action,
      saved: false,
      skipped: true,
      validation_error: validation.reason,
    };
  }

  if (action.requires_confirmation || action.type === "plan_change") {
    return await savePendingAction({
      ...action,
      requires_confirmation: true,
    });
  }

  if (action.type === "shopping") {
    return await saveShopping(action);
  }

  if (action.type === "health") {
    return await saveHealth(action, today);
  }

  if (action.type === "task") {
    return await saveTask(action);
  }

  if (action.type === "event") {
    return await saveEvent(action);
  }

  if (action.type === "memory") {
    return await saveMemory(action);
  }

  if (action.type === "focus") {
    return await saveFocus(action, today);
  }

  return {
    ...action,
    saved: false,
    skipped: true,
    reason: "Akce nebyla zpracována.",
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const message = body.message;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing message",
      });
    }

    const today = getTodayPragueDate();

    const aiResult = await getAiActions(message, today);
    const savedActions = [];

    for (const action of aiResult.actions || []) {
      const savedAction = await executeAction(action, today);
      savedActions.push(savedAction);
    }

    return res.status(200).json({
      success: true,
      date: today,
      input: message,
      actions: aiResult.actions || [],
      savedActions,
      response: aiResult.response || "",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}

async function getAiActions(message, today) {
  const ai = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        generationConfig: {
          responseMimeType: "application/json",
        },
        contents: [
          {
            parts: [
              {
                text: `
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
`,
              },
            ],
          },
        ],
      }),
    }
  );

  const aiData = await ai.json();

  if (!ai.ok) {
    return {
      actions: [],
      response: "Nepodařilo se spojit s AI modelem.",
      debug: aiData,
    };
  }

  const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (!text) {
    return {
      actions: [],
      response: "AI nevrátila žádný text.",
      debug: aiData,
    };
  }

  try {
    const parsed = JSON.parse(text);

    return {
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      response: parsed.response || "",
    };
  } catch (error) {
    return {
      actions: [],
      response: "AI vrátila neplatný JSON. Zkus to prosím formulovat znovu.",
      debug: text,
    };
  }
}
