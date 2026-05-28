const ALLOWED_TYPES = [
  "shopping",
  "health",
  "task",
  "event",
  "memory",
  "focus",
  "plan_change",
];

export function validateAction(action) {
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

  if (!ALLOWED_TYPES.includes(action.type)) {
    return {
      valid: false,
      reason: `Nepodporovaný typ akce: ${action.type}`,
    };
  }

  if (
    action.requires_confirmation ||
    action.type === "plan_change"
  ) {
    return {
      valid: true,
    };
  }

  switch (action.type) {
    case "shopping":
      if (!action.item) {
        return {
          valid: false,
          reason: "Shopping akci chybí item.",
        };
      }
      break;

    case "health":
      if (!action.subtype) {
        return {
          valid: false,
          reason: "Health akci chybí subtype.",
        };
      }

      if (typeof action.value !== "number") {
        return {
          valid: false,
          reason: "Health akci chybí value.",
        };
      }

      break;

    case "task":
      if (!action.title) {
        return {
          valid: false,
          reason: "Task akci chybí title.",
        };
      }
      break;

    case "event":
      if (!action.title || !action.datetime) {
        return {
          valid: false,
          reason: "Event akci chybí title nebo datetime.",
        };
      }
      break;

    case "memory":
      if (!action.subtype || !action.content) {
        return {
          valid: false,
          reason: "Memory akce je nevalidní.",
        };
      }
      break;

    case "focus":
      if (!action.content) {
        return {
          valid: false,
          reason: "Focus akci chybí content.",
        };
      }
      break;
  }

  return {
    valid: true,
  };
}
