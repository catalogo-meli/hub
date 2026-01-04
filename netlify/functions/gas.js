// netlify/functions/gas.js
export async function handler(event) {
  const GAS_URL = process.env.GAS_URL;       // https://script.google.com/macros/s/.../exec
  const API_TOKEN = process.env.API_TOKEN;   // mismo valor que pusiste en Script Properties (Apps Script)

  if (!GAS_URL) return resp(500, { ok: false, error: "Missing GAS_URL env var" });
  if (!API_TOKEN) return resp(500, { ok: false, error: "Missing API_TOKEN env var" });

  // Preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors(event), body: "" };
  }

  try {
    if (event.httpMethod === "GET") {
      const qs = event.queryStringParameters || {};
      const url = new URL(GAS_URL);

      // Reenvía query params + agrega token
      url.search = new URLSearchParams({ ...qs, token: API_TOKEN }).toString();

      const r = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "accept": event.headers?.accept || "*/*"
        }
      });

      const body = await r.text();
      return {
        statusCode: r.status,
        headers: {
          ...cors(event),
          "content-type": r.headers.get("content-type") || "application/json; charset=utf-8",
          "cache-control": "no-store"
        },
        body
      };
    }

    if (event.httpMethod === "POST") {
      const isJson = (event.headers?.["content-type"] || event.headers?.["Content-Type"] || "")
        .toLowerCase()
        .includes("application/json");

      const bodyIn = event.body
        ? (isJson ? JSON.parse(event.body) : safeParseJson(event.body))
        : {};

      // Agrega token al body
      const bodyOut = { ...(bodyIn || {}), token: API_TOKEN };

      const r = await fetch(GAS_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bodyOut)
      });

      const body = await r.text();
      return {
        statusCode: r.status,
        headers: {
          ...cors(event),
          "content-type": r.headers.get("content-type") || "application/json; charset=utf-8",
          "cache-control": "no-store"
        },
        body
      };
    }

    return resp(405, { ok: false, error: `Method not allowed: ${event.httpMethod}` });
  } catch (err) {
    return resp(500, { ok: false, error: err?.message || String(err) });
  }
}

function safeParseJson(s) {
  try { return JSON.parse(s); } catch { return { raw: s }; }
}

function cors(event) {
  // Si querés cerrar más: cambiá "*" por "https://hub-catalogo.netlify.app"
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  };
}

function resp(code, obj) {
  return {
    statusCode: code,
    headers: { ...cors({}), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    body: JSON.stringify(obj)
  };
}
