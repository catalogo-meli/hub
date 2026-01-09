// netlify/functions/gas.js
export async function handler(event) {
  try {
    const url = process.env.GAS_WEBAPP_URL; // tu WebApp URL
    const token = process.env.API_TOKEN;    // tu token

    if (!url) return json(500, { ok: false, error: "Missing GAS_WEBAPP_URL" });
    if (!token) return json(500, { ok: false, error: "Missing API_TOKEN" });

    const method = event.httpMethod || "GET";
    const headers = { "Content-Type": "application/json" };

    if (method === "GET") {
      const qs = event.queryStringParameters || {};
      const u = new URL(url);
      Object.entries(qs).forEach(([k, v]) => u.searchParams.set(k, v));
      u.searchParams.set("token", token);

      const resp = await fetch(u.toString(), { method: "GET" });
      const text = await resp.text();
      return { statusCode: resp.status, headers, body: text };
    }

    if (method === "POST") {
      const body = event.body ? JSON.parse(event.body) : {};
      body.token = token;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await resp.text();
      return { statusCode: resp.status, headers, body: text };
    }

    return json(405, { ok: false, error: "Method not allowed" });
  } catch (e) {
    return json(500, { ok: false, error: e.message || String(e) });
  }
}

function json(statusCode, obj) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) };
}
