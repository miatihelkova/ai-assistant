import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const token = body.confirmation_token;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Missing confirmation_token"
      });
    }

    const { data: pending, error: fetchError } = await supabase
      .from("pending_actions")
      .select("*")
      .eq("confirmation_token", token)
      .eq("status", "pending")
      .single();

    if (fetchError || !pending) {
      return res.status(404).json({
        success: false,
        error: "Pending action not found"
      });
    }

    const action = pending.payload;
    const executed = [];

    if (action.type === "plan_change") {
      const { data, error } = await supabase
        .from("tasks")
        .insert([
          {
            title: action.title || "Upravit plán",
            status: "open",
            priority: "normal"
          }
        ])
        .select();

      if (error) {
        executed.push({
          type: "task",
          saved: false,
          error: error.message
        });
      } else {
        executed.push({
          type: "task",
          saved: true,
          data
        });
      }
    }

    await supabase
      .from("pending_actions")
      .update({ status: "confirmed" })
      .eq("id", pending.id);

    return res.status(200).json({
      success: true,
      message: "Akce potvrzena a provedena.",
      confirmedAction: action,
      executed
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}
