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

const SUPPORTED_CONFIRMED_ACTION_TYPES = ["plan_change"];

function setCorsHeaders(res) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

function sendJson(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
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

  if (typeof req.body === "object") {
    return req.body;
  }

  return {};
}

function getPublicErrorMessage(error, fallback = "Nastala neočekávaná chyba.") {
  if (!error) {
    return fallback;
  }

  if (typeof error === "string") {
    return error;
  }

  return error.message || fallback;
}

function normalizeAction(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const type = String(payload.type || "").trim();

  if (!type) {
    return null;
  }

  return {
    ...payload,
    type,
  };
}

function getSafeText(value, fallback = "") {
  const text = String(value || "").trim();

  return text || fallback;
}

function getSafeTitle(value, fallback = "Upravit plán") {
  return getSafeText(value, fallback);
}

function getSafePriority(value) {
  const allowedPriorities = ["low", "normal", "high"];
  const priority = String(value || "normal").trim().toLowerCase();

  return allowedPriorities.includes(priority)
    ? priority
    : "normal";
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

function validateConfirmationToken(token) {
  const normalizedToken = String(token || "").trim();

  if (!normalizedToken) {
    return {
      valid: false,
      token: "",
      error: "Missing confirmation_token",
    };
  }

  if (normalizedToken.length < 12) {
    return {
      valid: false,
      token: normalizedToken,
      error: "Neplatný confirmation_token.",
    };
  }

  return {
    valid: true,
    token: normalizedToken,
    error: null,
  };
}

function isSupportedConfirmedAction(action) {
  return SUPPORTED_CONFIRMED_ACTION_TYPES.includes(action.type);
}

async function executePlanChange(action) {
  const title =
    getSafeText(action.title) ||
    getSafeText(action.content) ||
    getSafeText(action.description) ||
    "Upravit plán";

  const priority = getSafePriority(action.priority);

  const { data, error } = await supabase
    .from("tasks")
    .insert([
      {
        title: getSafeTitle(title),
        status: "open",
        priority,
      },
    ])
    .select();

  if (error) {
    return {
      success: false,
      executed: [
        {
          type: "plan_change",
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
        type: "plan_change",
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

  if (!isSupportedConfirmedAction(action)) {
    return {
      success: false,
      executed: [],
      error: `Nepodporovaný typ potvrzované akce: ${action.type}`,
    };
  }

  if (action.type === "plan_change") {
    return executePlanChange(action);
  }

  return {
    success: false,
    executed: [],
    error: `Chybí handler pro potvrzovanou akci: ${action.type}`,
  };
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

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, {
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const body = parseBody(req);
    const tokenValidation = validateConfirmationToken(body.confirmation_token);

    if (!tokenValidation.valid) {
      return sendJson(res, 400, {
        success: false,
        error: tokenValidation.error,
      });
    }

    const { data: pending, error: fetchError } =
      await getPendingActionByToken(tokenValidation.token);

    if (fetchError) {
      return sendJson(res, 500, {
        success: false,
        error: "Nepodařilo se načíst čekající akci.",
      });
    }

    if (!pending) {
      return sendJson(res, 404, {
        success: false,
        error: "Čekající akce nebyla nalezena.",
      });
    }

    if (pending.status !== PENDING_STATUS) {
      return sendJson(res, 409, {
        success: false,
        error: getAlreadyHandledMessage(pending.status),
        status: pending.status,
      });
    }

    const { data: lockedPending, error: lockError } =
      await lockPendingAction(pending.id);

    if (lockError) {
      return sendJson(res, 500, {
        success: false,
        error: "Akci se nepodařilo uzamknout.",
      });
    }

    if (!lockedPending) {
      return sendJson(res, 409, {
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

      return sendJson(res, 400, {
        success: false,
        error: "Čekající akce má neplatný obsah.",
      });
    }

    const result = await executeConfirmedAction(action);

    if (!result.success) {
      const errorMessage = result.error || "Unknown confirmation error";

      await markPendingActionAsFailed(
        lockedPending.id,
        errorMessage,
        result
      );

      return sendJson(res, 400, {
        success: false,
        message: "Akci se nepodařilo potvrdit.",
        confirmedAction: action,
        executed: result.executed || [],
        error: errorMessage,
      });
    }

    const { error: updateError } = await markPendingActionAsConfirmed(
      lockedPending.id,
      result
    );

    if (updateError) {
      return sendJson(res, 500, {
        success: false,
        error: "Akce byla provedena, ale nepodařilo se uložit stav potvrzení.",
      });
    }

    return sendJson(res, 200, {
      success: true,
      message: "Akce potvrzena a provedena.",
      confirmedAction: action,
      executed: result.executed || [],
    });
  } catch (err) {
    return sendJson(res, 500, {
      success: false,
      error: getPublicErrorMessage(err),
    });
  }
}
