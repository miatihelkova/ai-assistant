import { getAiActions } from "./lib/ai.js";
import { executeAction } from "./lib/actions.js";
import {
  getTodayPragueDate,
  parseBody,
  setCorsHeaders,
} from "./lib/utils.js";

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
    const message = String(body.message || "").trim();

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Missing message",
      });
    }

    const today = getTodayPragueDate();

    const aiResult = await getAiActions(message, today);
    const actions = Array.isArray(aiResult.actions)
      ? aiResult.actions
      : [];

    const savedActions = [];

    for (const action of actions) {
      const savedAction = await executeAction(action, today);
      savedActions.push(savedAction);
    }

    return res.status(200).json({
      success: true,
      date: today,
      input: message,
      actions,
      savedActions,
      response: aiResult.response || "Hotovo.",
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || "Unexpected server error",
    });
  }
}
