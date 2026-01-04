// api.js
const API_BASE = ""; // mismo dominio (Netlify)
const PROXY = `${API_BASE}/.netlify/functions/gas`;

async function apiGet(action, params = {}) {
  const url = new URL(PROXY, window.location.origin);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    url.searchParams.set(k, String(v));
  });

  const r = await fetch(url.toString(), { method: "GET" });
  const txt = await r.text();

  let json;
  try { json = JSON.parse(txt); } catch { throw new Error(`Respuesta no-JSON (${r.status}): ${txt.slice(0, 200)}`); }
  if (!r.ok || json.ok === false) throw new Error(json?.error || `HTTP ${r.status}`);
  return json.data;
}

async function apiPost(action, body = {}) {
  const r = await fetch(PROXY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...body })
  });

  const txt = await r.text();
  let json;
  try { json = JSON.parse(txt); } catch { throw new Error(`Respuesta no-JSON (${r.status}): ${txt.slice(0, 200)}`); }
  if (!r.ok || json.ok === false) throw new Error(json?.error || `HTTP ${r.status}`);
  return json.data;
}

// Endpoints del HUB
export const HUB = {
  health: () => apiGet("health"),
  colaboradoresList: () => apiGet("colaboradores.list"),
  flujosList: () => apiGet("flujos.list"),
  habilitacionesGet: (idMeli = "") => apiGet("habilitaciones.get", { idMeli }),
  habilitacionesSet: ({ idMeli, flujo, field, value }) =>
    apiPost("habilitaciones.set", { idMeli, flujo, field, value }),
  planificacionGenerar: () => apiPost("planificacion.generar"),
  slackOutboxGenerar: () => apiPost("slack.outbox.generar"),
  slackOutboxEnviar: () => apiPost("slack.outbox.enviar"),
  feriadosList: () => apiGet("feriados.list"),
};
