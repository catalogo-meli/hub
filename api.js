const BASE = "/.netlify/functions/gas";

async function http(method, action, body, query = {}) {
  const url = new URL(BASE, window.location.origin);

  if (action) url.searchParams.set("action", action);
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    url.searchParams.set(k, String(v));
  });

  const opt = { method, headers: { "content-type": "application/json" } };
  if (method === "POST") opt.body = JSON.stringify(body || {});

  const r = await fetch(url.toString(), opt);
  const txt = await r.text();

  let data;
  try {
    data = JSON.parse(txt);
  } catch {
    throw new Error(`Respuesta no JSON (${r.status}): ${txt.slice(0, 200)}`);
  }

  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  if (!data.ok) throw new Error(data?.error || "Error");

  return data.data;
}

export const API = {
  health: () => http("GET", "health"),

  colaboradoresList: () => http("GET", "colaboradores.list"),
  canalesList: () => http("GET", "canales.list"),
  flujosList: () => http("GET", "flujos.list"),
  habilitacionesList: () => http("GET", "habilitaciones.list"),

  presentismoWeek: (dateYmd = "") => http("GET", "presentismo.week", null, dateYmd ? { date: dateYmd } : {}),
  presentismoStats: (dateYmd = "") => http("GET", "presentismo.stats", null, dateYmd ? { date: dateYmd } : {}),
  presentismoLicenciasSet: (payload) => http("POST", null, { action: "presentismo.licencias.set", ...payload }),

  flujosUpsert: (payload) => http("POST", null, { action: "flujos.upsert", ...payload }),
  flujosDelete: (payload) => http("POST", null, { action: "flujos.delete", ...payload }),

  habilitacionesSet: (payload) => http("POST", null, { action: "habilitaciones.set", ...payload }),

  planificacionGenerar: () => http("POST", null, { action: "planificacion.generar" }),
  planificacionList: () => http("GET", "planificacion.list"),

  slackOutboxList: () => http("GET", "slack.outbox.list"),
  slackOutboxGenerar: () => http("POST", null, { action: "slack.outbox.generar" }),
  slackOutboxUpdate: (payload) => http("POST", null, { action: "slack.outbox.update", ...payload }),
  slackOutboxEnviar: (payload) => http("POST", null, { action: "slack.outbox.enviar", ...payload }), // {row} o {}
};
