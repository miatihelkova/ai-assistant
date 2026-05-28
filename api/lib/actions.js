import { supabase } from "./supabase.js";
import { createConfirmationToken, normalizeText } from "./utils.js";
import { validateAction } from "./validation.js";

function getSafeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function getSafePriority(value) {
  const allowed = ["low", "normal", "high"];
  const priority = String(value || "normal").trim().toLowerCase();

  return allowed.includes(priority) ? priority : "normal";
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
        item: getSafeText(action.item),
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
        type: getSafeText(action.subtype),
        value: action.value,
        note: action.note ? String(action.note).trim() : null,
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
        title: getSafeText(action.title, "Nový úkol"),
        status: "open",
        priority: getSafePriority(action.priority),
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
        title: getSafeText(action.title, "Nová událost"),
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
        type: getSafeText(action.subtype, "note"),
        content: getSafeText(action.content),
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
  const content = getSafeText(action.content);
  const normalizedContent = normalizeText(content);

  const { data: existingFocus, error: fetchError } = await supabase
    .from("focus_today")
    .select("id, content, normalized_content")
    .eq("date", today)
    .eq("completed", false)
    .eq("normalized_content", normalizedContent)
    .limit(1);

  if (fetchError) {
    return {
      ...action,
      saved: false,
      error: fetchError.message,
    };
  }

  if (existingFocus?.length > 0) {
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
        content,
        normalized_content: normalizedContent,
        priority: getSafePriority(action.priority),
        source: getSafeText(action.source, "ai"),
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

const actionHandlers = {
  shopping: saveShopping,
  health: saveHealth,
  task: saveTask,
  event: saveEvent,
  memory: saveMemory,
  focus: saveFocus,
};

export async function executeAction(action, today) {
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
    return savePendingAction({
      ...action,
      requires_confirmation: true,
    });
  }

  const handler = actionHandlers[action.type];

  if (!handler) {
    return {
      ...action,
      saved: false,
      skipped: true,
      reason: "Akce nebyla zpracována.",
    };
  }

  return handler(action, today);
}
