// api.js (ESM) - CORREGIDO
// Front importa: import { API } from "./api.js"

const BASE = "/.netlify/functions/gas";

async function request(action, { method = "GET", query = {}, body } = {}) {
  const qs = new URLSearchParams({ ...query, action });
  const url = `${BASE}?${qs.toString()}`;
  const opts = { method, headers: {} };

  if (method !== "GET") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify({ action, ...(body || {}) });
  }

  const res = await fetch(url, opts);
  const json = await res.json().catch(() => null);

  if (!json) throw new Error("Respuesta inválida (no JSON)");
  if (!json.ok) throw new Error(json.error || "Error API");

  return json.data;
}

function get(action, query) {
  return request(action, { method: "GET", query });
}

function post(action, body) {
  return request(action, { method: "POST", body });
}

export const API = {
  // Health
  health: () => get("health"),

  // Datos base
  colaboradoresList: () => get("colaboradores.list"),
  canalesList: () => get("canales.list"),
  flujosList: () => get("flujos.list"),
  habilitacionesList: () => get("habilitaciones.list"),

  // Flujos
  flujosUpsert: (flujo, perfiles_requeridos, channel_id) =>
    post("flujos.upsert", { flujo, perfiles_requeridos, channel_id }),
  flujosDelete: (flujo) => post("flujos.delete", { flujo }),

  // Habilitaciones
  habilitacionesSet: (idMeli, flujo, habilitado, fijo) =>
    post("habilitaciones.set", { idMeli, flujo, habilitado, fijo }),

  // Presentismo
  presentismoWeek: (date) => get("presentismo.week", { date }),
  presentismoStats: (date) => get("presentismo.stats", { date }),
  presentismoSetLicencia: (idMeli, desde, hasta, tipo) =>
    post("presentismo.licencias.set", { idMeli, desde, hasta, tipo }),

  // Planificación
  planificacionList: () => get("planificacion.list"),
  planificacionGenerar: () => post("planificacion.generar", {}),

  // Slack Outbox
  slackOutboxGenerar: () => post("slack.outbox.generar", {}),
  slackOutboxList: () => get("slack.outbox.list"),
  slackOutboxUpdate: (row, canal, channel_id, mensaje) =>
    post("slack.outbox.update", { row, canal, channel_id, mensaje }),
  slackOutboxAppend: (fechaISO, tipo, canal, channel_id, mensaje, estado) =>
    post("slack.outbox.append", { fechaISO, tipo, canal, channel_id, mensaje, estado }),
  slackOutboxEnviar: (row) => post("slack.outbox.enviar", row ? { row } : {}),

  // Slack Direct (Netlify manda a Slack y luego setea estado)
  slackOutboxGetRow: (row) => post("slack.outbox.getRow", { row }),
  slackOutboxSetStatus: (row, estado) => post("slack.outbox.setStatus", { row, estado }),

  // Scheduler (programar / desprogramar / listar vencidos)
  slackOutboxProgramar: (row, programado_para) =>
    post("slack.outbox.programar", { row, programado_para }),
  slackOutboxDesprogramar: (row) =>
    post("slack.outbox.desprogramar", { row }),
  slackOutboxListDue: () => post("slack.outbox.listDue", {}),
};

// ✅ FIX: Exponer en window de forma segura (evita race conditions)
if (typeof window !== "undefined") {
  window.API = API;
  console.log("[api.js] API expuesto en window.API");
}
