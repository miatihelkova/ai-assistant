import crypto from "crypto";

export function getTodayPragueDate() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Prague",
    }).format(new Date());

  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?;:()[\]{}"'“”„]/g, "")
    .replace(/\s+/g, " ");
}

export function createConfirmationToken() {
  return crypto.randomUUID();
}

export function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
}

export function parseBody(req) {
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
