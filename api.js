// api.js (ESM)
const BASE = "/.netlify/functions/gas";

async function safeJson(resp) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: `Non-JSON response (${resp.status}): ${text.slice(0, 250)}` };
  }
}

async function get(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const resp = await fetch(`${BASE}?${qs.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await safeJson(resp);
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `GET ${action} failed (${resp.status})`);
  return data.data;
}

async function post(action, payload = {}) {
  const resp = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await safeJson(resp);
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `POST ${action} failed (${resp.status})`);
  return data.data;
}

export const API = {
  // Core
  health: () => get("health"),
  dashboardStats: () => get("dashboard.stats"),

  // Lists
  colaboradoresList: () => get("colaboradores.list"),
  canalesList: () => get("canales.list"),
  flujosList: () => get("flujos.list"),
  habilitacionesList: () => get("habilitaciones.list"),

  // Flujos
  flujosUpsert: (flujo, perfiles_requeridos, channel_id, notas_default = "") =>
    post("flujos.upsert", { flujo, perfiles_requeridos, channel_id, notas_default }),
  flujosDelete: (flujo) => post("flujos.delete", { flujo }),

  // Habilitaciones
  habilitacionesSet: (idMeli, flujo, habilitado, fijo) =>
    post("habilitaciones.set", { idMeli, flujo, habilitado, fijo }),

  // Planificación
  planificacionGenerar: () => post("planificacion.generar", {}),
  planificacionList: () => get("planificacion.list"),

  // Slack Outbox
  slackOutboxGenerar: () => post("slack.outbox.generar", {}),
  slackOutboxList: () => get("slack.outbox.list"),
  slackOutboxUpdate: (row, canal, channel_id, mensaje, tipo) =>
    post("slack.outbox.update", { row, canal, channel_id, mensaje, tipo }),
  slackOutboxEnviar: (row) => post("slack.outbox.enviar", row ? { row } : {}),

  // Presentismo
  presentismoWeek: (dateYmd) => get("presentismo.week", { date: dateYmd }),
  presentismoStats: (dateYmd) => get("presentismo.stats", { date: dateYmd }),
  presentismoLicenciasSet: (idMeli, desde, hasta, tipo) =>
    post("presentismo.licencias.set", { idMeli, desde, hasta, tipo }),

  // Opcional
  productividadList: () => get("productividad.list"),
  calidadPmList: () => get("calidadpm.list"),
};
