const API_TIMEOUT_MS = 30000;

const chat = document.getElementById("chat");
const form = document.getElementById("messageForm");
const input = document.getElementById("message");
const sendButton = document.getElementById("sendButton");

let isSending = false;
let lastSentMessage = "";

function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

function addMessage(role, text, meta = "") {
  const bubble = document.createElement("div");

  bubble.className = `message ${role}`;
  bubble.textContent = text;

  if (meta) {
    const metaDiv = document.createElement("div");

    metaDiv.className = "meta";
    metaDiv.textContent = meta;

    bubble.appendChild(metaDiv);
  }

  chat.appendChild(bubble);
  scrollToBottom();

  return bubble;
}

function createLoadingBubble() {
  return addMessage("assistant", "Zpracovávám zprávu...");
}

function restoreLastMessage() {
  if (!input.value.trim() && lastSentMessage) {
    input.value = lastSentMessage;
    resizeTextarea();
  }
}

function resizeTextarea() {
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
}

function buildMeta(savedActions = []) {
  if (!Array.isArray(savedActions)) {
    return "";
  }

  const counts = {
    saved: 0,
    pending: 0,
    duplicate: 0,
    skipped: 0,
    errors: 0
  };

  savedActions.forEach(action => {
    if (!action || typeof action !== "object") {
      counts.errors++;
      return;
    }

    if (action.error || action.validation_error) {
      counts.errors++;
      return;
    }

    if (action.duplicate === true) {
      counts.duplicate++;
      return;
    }

    if (action.pending === true && action.confirmation_token) {
      counts.pending++;
      return;
    }

    if (action.skipped === true) {
      counts.skipped++;
      return;
    }

    if (action.saved === true) {
      counts.saved++;
    }
  });

  const meta = [];

  if (counts.saved > 0) {
    meta.push(`Uloženo: ${counts.saved}`);
  }

  if (counts.pending > 0) {
    meta.push(`Čeká na potvrzení: ${counts.pending}`);
  }

  if (counts.duplicate > 0) {
    meta.push(`Už existuje: ${counts.duplicate}`);
  }

  if (counts.skipped > 0) {
    meta.push(`Přeskočeno: ${counts.skipped}`);
  }

  if (counts.errors > 0) {
    meta.push(`Chyba u akcí: ${counts.errors}`);
  }

  return meta.join(" • ");
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function postJson(url, payload) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const data = await safeJson(response);

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getReadableError(error, fallbackMessage) {
  if (error?.name === "AbortError") {
    return "Server neodpověděl včas. Zkus to prosím znovu.";
  }

  if (error?.message) {
    return `${fallbackMessage}: ${error.message}`;
  }

  return fallbackMessage;
}

function handleApiError(result, fallbackMessage) {
  if (!result.data || typeof result.data !== "object") {
    return "Server vrátil neplatnou odpověď.";
  }

  return (
    result.data.error ||
    result.data.message ||
    fallbackMessage
  );
}

function renderPendingConfirmations(savedActions, assistantBubble) {
  const pendingActions = savedActions.filter(action => {
    return (
      action &&
      action.pending === true &&
      action.confirmation_token
    );
  });

  pendingActions.forEach(action => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "confirm-button";
    button.textContent = "Potvrdit akci";

    button.addEventListener("click", () => {
      confirmAction(action.confirmation_token, button);
    });

    assistantBubble.appendChild(button);
  });
}

async function confirmAction(confirmationToken, button) {
  button.disabled = true;
  button.textContent = "Potvrzuji...";

  try {
    const result = await postJson("/api/confirm", {
      confirmation_token: confirmationToken
    });

    if (!result.ok || result.data?.success === false) {
      button.textContent = "Chyba";

      addMessage(
        "assistant",
        handleApiError(result, "Potvrzení se nepovedlo.")
      );

      return;
    }

    button.textContent = "Potvrzeno";

    addMessage(
      "assistant",
      result.data?.message || "Akce potvrzena."
    );

  } catch (error) {
    button.textContent = "Chyba";

    addMessage(
      "assistant",
      getReadableError(error, "Potvrzení se nepovedlo")
    );
  }
}

async function sendMessage() {
  const message = input.value.trim();

  if (!message || isSending) {
    return;
  }

  isSending = true;
  lastSentMessage = message;

  addMessage("user", message);

  input.value = "";
  resizeTextarea();

  sendButton.disabled = true;

  const loadingBubble = createLoadingBubble();

  try {
    const result = await postJson("/api/chat", { message });

    loadingBubble.remove();

    if (!result.ok || result.data?.success === false) {
      restoreLastMessage();

      addMessage(
        "assistant",
        handleApiError(result, "Zpracování zprávy se nepovedlo.")
      );

      return;
    }

    if (!result.data || typeof result.data !== "object") {
      restoreLastMessage();

      addMessage(
        "assistant",
        "Server vrátil neplatnou odpověď."
      );

      return;
    }

    const savedActions = Array.isArray(result.data.savedActions)
      ? result.data.savedActions
      : [];

    const assistantBubble = addMessage(
      "assistant",
      result.data.response || "Hotovo.",
      buildMeta(savedActions)
    );

    renderPendingConfirmations(savedActions, assistantBubble);

    lastSentMessage = "";

  } catch (error) {
    loadingBubble.remove();

    restoreLastMessage();

    addMessage(
      "assistant",
      getReadableError(error, "Zprávu se nepodařilo odeslat")
    );

  } finally {
    isSending = false;
    sendButton.disabled = false;
    input.focus();
  }
}

function quickSend(text) {
  input.value = text;
  resizeTextarea();
  input.focus();
}

function initializeQuickActions() {
  const buttons = document.querySelectorAll("[data-quick-message]");

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      quickSend(button.dataset.quickMessage || "");
    });
  });
}

form.addEventListener("submit", event => {
  event.preventDefault();
  sendMessage();
});

input.addEventListener("input", resizeTextarea);

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

initializeQuickActions();
resizeTextarea();
