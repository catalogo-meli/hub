// netlify/functions/gas.js
export async function handler(event) {
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  const GAS_URL = process.env.GAS_URL;      // URL del WebApp de Apps Script
  const API_TOKEN = process.env.API_TOKEN;  // mismo valor que Script Properties: API_TOKEN

  if (!GAS_URL) return { statusCode: 500, headers: cors, body: JSON.stringify({ ok:false, error:"Missing env GAS_URL" }) };
  if (!API_TOKEN) return { statusCode: 500, headers: cors, body: JSON.stringify({ ok:false, error:"Missing env API_TOKEN" }) };

  try {
    const method = event.httpMethod || "GET";

    if (method === "GET") {
      const qs = new URLSearchParams(event.queryStringParameters || {});
      // inyecta token SIEMPRE
      qs.set("token", API_TOKEN);

      const url = `${GAS_URL}?${qs.toString()}`;
      const r = await fetch(url, { method: "GET" });
      const text = await r.text();
      return { statusCode: r.status, headers: { ...cors, "content-type": "application/json" }, body: text };
    }

    if (method === "POST") {
      const bodyIn = event.body ? JSON.parse(event.body) : {};
      const bodyOut = { ...bodyIn, token: API_TOKEN };

      const r = await fetch(GAS_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bodyOut),
      });

      const text = await r.text();
      return { statusCode: r.status, headers: { ...cors, "content-type": "application/json" }, body: text };
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ ok:false, error:"Method not allowed" }) };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ ok:false, error: String(e?.message || e) }) };
  }
}
