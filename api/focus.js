import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_FOCUS_ITEMS = 20;

function setCorsHeaders(res) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

function getTodayPragueDate() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Prague",
    }).format(new Date());

  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

function normalizeFocusItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  return {
    id: item.id || null,
    content: String(item.content || "").trim(),
    type: String(item.type || "focus"),
    priority: String(item.priority || "normal"),
    source: String(item.source || "unknown"),
    created_at: item.created_at || null,
    completed: Boolean(item.completed),
    date: item.date || null,
    normalized_content: item.normalized_content || null,
  };
}

async function getTodayFocus(today) {
  return supabase
    .from("focus_today")
    .select(`
      id,
      content,
      type,
      priority,
      source,
      created_at,
      completed,
      date,
      normalized_content
    `)
    .eq("completed", false)
    .eq("date", today)
    .order("created_at", {
      ascending: false,
    })
    .limit(MAX_FOCUS_ITEMS);
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const today = getTodayPragueDate();

    if (!today || typeof today !== "string") {
      return res.status(500).json({
        success: false,
        error: "Invalid generated date",
      });
    }

    const { data, error } = await getTodayFocus(today);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    const focus = Array.isArray(data)
      ? data
          .map(normalizeFocusItem)
          .filter(Boolean)
      : [];

    return res.status(200).json({
      success: true,
      date: today,
      count: focus.length,
      focus,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || "Unexpected server error",
    });
  }
}
