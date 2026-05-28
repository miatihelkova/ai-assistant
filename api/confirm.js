import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const PENDING_STATUS = "pending";
const PROCESSING_STATUS = "processing";
const CONFIRMED_STATUS = "confirmed";
const FAILED_STATUS = "failed";

function setCorsHeaders(res) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

function parseBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return req.body;
}

function normalizeAction(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  return payload;
}

function getSafeTitle(value, fallback = "Upravit plán") {
  const title = String(value || "").trim();

  return title || fallback;
}

function getSafePriority(value) {
  const allowedPriorities = ["low", "normal", "high"];
  const priority = String(value || "normal").trim().toLowerCase();

  return allowedPriorities.includes(priority)
    ? priority
    : "normal";
}

async function executePlanChange(action) {
  const { data, error } = await supabase
    .from("tasks")
    .insert([
      {
        title: getSafeTitle(action.title),
        status: "open",
        priority: getSafePriority(action.priority),
      },
    ])
    .select();

  if (error) {
    return {
      success: false,
      executed: [
        {
          type: "task",
          saved: false,
          error: error.message,
        },
      ],
      error: error.message,
    };
  }

  return {
    success: true,
    executed: [
      {
        type: "task",
        saved: true,
        data,
      },
    ],
  };
}

async function executeConfirmedAction(action) {
  if (!action?.type) {
    return {
      success: false,
      executed: [],
      error: "Potvrzovaná akce nemá typ.",
    };
  }

  const handlers = {
    plan_change: executePlanChange,
  };

  const handler = handlers[action.type];

  if (!handler) {
    return {
      success: false,
      executed: [],
      error: `Nepodporovaný typ potvrzované akce: ${action.type}`,
    };
  }

  return handler(action);
}

async function getPendingActionByToken(token) {
  return supabase
    .from("pending_actions")
    .select("*")
    .eq("confirmation_token", token)
    .maybeSingle();
}

async function lockPendingAction(pendingId) {
  const now = new Date().toISOString();

  return supabase
    .from("pending_actions")
    .update({
      status: PROCESSING_STATUS,
      processing_at: now,
    })
    .eq("id", pendingId)
    .eq("status", PENDING_STATUS)
    .select("*")
    .maybeSingle();
}

async function markPendingActionAsConfirmed(pendingId, result) {
  return supabase
    .from("pending_actions")
    .update({
      status: CONFIRMED_STATUS,
      confirmed_at: new Date().toISOString(),
      result,
    })
    .eq("id", pendingId);
}

async function markPendingActionAsFailed(pendingId, errorMessage, result = null) {
  return supabase
    .from("pending_actions")
    .update({
      status: FAILED_STATUS,
      failed_at: new Date().toISOString(),
      error_message: errorMessage,
      result,
    })
    .eq("id", pendingId);
}

function getAlreadyHandledMessage(status) {
  if (status === CONFIRMED_STATUS) {
    return "Tahle akce už byla potvrzena.";
  }

  if (status === PROCESSING_STATUS) {
    return "Tahle akce se právě zpracovává.";
  }

  if (status === FAILED_STATUS) {
    return "Tahle akce už jednou selhala. Vytvoř prosím novou akci.";
  }

  return "Tahle akce už není dostupná k potvrzení.";
}

export default async function handler(req, res) {
  setCorsHeaders(res);

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
    const body = parseBody(req);
    const token = String(body.confirmation_token || "").trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Missing confirmation_token",
      });
    }

    const { data: pending, error: fetchError } = await getPendingActionByToken(token);

    if (fetchError) {
      return res.status(500).json({
        success: false,
        error: fetchError.message,
      });
    }

    if (!pending) {
      return res.status(404).json({
        success: false,
        error: "Pending action not found",
      });
    }

    if (pending.status !== PENDING_STATUS) {
      return res.status(409).json({
        success: false,
        error: getAlreadyHandledMessage(pending.status),
        status: pending.status,
      });
    }

    const { data: lockedPending, error: lockError } = await lockPendingAction(pending.id);

    if (lockError) {
      return res.status(500).json({
        success: false,
        error: lockError.message,
      });
    }

    if (!lockedPending) {
      return res.status(409).json({
        success: false,
        error: "Akci se nepodařilo uzamknout. Možná už byla potvrzena.",
      });
    }

    const action = normalizeAction(lockedPending.payload);

    if (!action) {
      await markPendingActionAsFailed(
        lockedPending.id,
        "Pending action has invalid payload"
      );

      return res.status(400).json({
        success: false,
        error: "Pending action has invalid payload",
      });
    }

    const result = await executeConfirmedAction(action);

    if (!result.success) {
      await markPendingActionAsFailed(
        lockedPending.id,
        result.error || "Unknown confirmation error",
        result
      );

      return res.status(400).json({
        success: false,
        message: "Akci se nepodařilo potvrdit.",
        confirmedAction: action,
        executed: result.executed || [],
        error: result.error || "Unknown confirmation error",
      });
    }

    const { error: updateError } = await markPendingActionAsConfirmed(
      lockedPending.id,
      result
    );

    if (updateError) {
      return res.status(500).json({
        success: false,
        error: updateError.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Akce potvrzena a provedena.",
      confirmedAction: action,
      executed: result.executed || [],
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || "Unexpected server error",
    });
  }
}
