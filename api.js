// api.js (ESM)
const BASE = "/.netlify/functions/gas";

async function safeJson(resp) {
  const text = await resp.text();
  const textLen = text.length;
  try {
    return { json: JSON.parse(text), textLen };
  } catch {
    return { json: { ok: false, error: `Non-JSON response (${resp.status}): ${text.slice(0, 200)}` }, textLen };
  }
}

function perfLog_(kind, action, ms, bytes) {
  try {
    const entry = { ts: Date.now(), kind, action, ms, bytes };
    window.__hubPerf = window.__hubPerf || [];
    window.__hubPerf.push(entry);
    // Solo consola (no UI)
    console.debug(`[perf] ${kind} ${action} ${ms.toFixed(0)}ms ${bytes}b`);
  } catch {}
}

async function get(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const t0 = performance.now();
  const resp = await fetch(`${BASE}?${qs.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const { json: data, textLen } = await safeJson(resp);
  perfLog_("GET", action, performance.now() - t0, textLen);
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `GET ${action} failed (${resp.status})`);
  return data.data;
}

async function post(action, payload = {}) {
  const t0 = performance.now();
  const resp = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const { json: data, textLen } = await safeJson(resp);
  perfLog_("POST", action, performance.now() - t0, textLen);
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `POST ${action} failed (${resp.status})`);
  return data.data;
}

function assertRow_(row) {
  const n = Number(row);
  if (!Number.isFinite(n) || n < 2) throw new Error("row inválida");
  return n;
}

function assertDatetimeLocal_(v) {
  const s = String(v || "").trim();
  // datetime-local suele venir "YYYY-MM-DDTHH:mm"
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    throw new Error("Fecha/hora inválida. Formato esperado: YYYY-MM-DDTHH:mm");
  }
  return s;
}

export const API = {
  health: () => get("health"),

  colaboradoresList: () => get("colaboradores.list"),
  canalesList: () => get("canales.list"),

  flujosList: () => get("flujos.list"),
  flujosUpsert: (flujo, perfiles_requeridos, channel_id = "") =>
    post("flujos.upsert", { flujo, perfiles_requeridos, channel_id }),
  flujosDelete: (flujo) => post("flujos.delete", { flujo }),

  habilitacionesList: () => get("habilitaciones.list"),
  habilitacionesSet: (idMeli, flujo, habilitado, fijo) =>
    post("habilitaciones.set", { idMeli, flujo, habilitado, fijo }),

  planificacionGenerar: () => post("planificacion.generar", {}),
  planificacionList: () => get("planificacion.list"),

  indicadoresPulso: (params = {}) => get("indicadores.pulso", params),

  slackOutboxGenerar: () => post("slack.outbox.generar", {}),
  // Solo GENERAL (sin POR_FLUJO)
  slackOutboxGenerarGeneral: () => post("slack.outbox.generarGeneral", {}),
  slackOutboxList: () => get("slack.outbox.list"),
  slackOutboxUpdate: (row, canal, channel_id, mensaje, mentions_json) => post("slack.outbox.update", { row: assertRow_(row), canal, channel_id, mensaje, mentions_json }),
  slackOutboxAppend: (fechaISO, tipo, canal, channel_id, mensaje, estado, mentions_json) => post("slack.outbox.append", { fechaISO, tipo, canal, channel_id, mensaje, estado, mentions_json }),
  slackOutboxDelete: (row) => post("slack.outbox.delete", { row: assertRow_(row) }),

  // ✅ NUEVO: Programar / Desprogramar (requiere actions en Code.gs)
  slackOutboxProgramar: (row, programado_para) =>
    post("slack.outbox.programar", {
      row: assertRow_(row),
      programado_para: assertDatetimeLocal_(programado_para),
    }),

  slackOutboxDesprogramar: (row) =>
    post("slack.outbox.desprogramar", { row: assertRow_(row) }),

  // Legacy (Apps Script intentaba enviar con UrlFetch) — queda por compatibilidad, pero no se usa.
  slackOutboxEnviar: (row) => post("slack.outbox.enviar", row ? { row: assertRow_(row) } : {}),

  // ✅ Slack se envía directo desde Netlify (sin UrlFetch en Apps Script)
  slackSendRow: (row) => post("slack.sendRow", { row: assertRow_(row) }),
  slackSendDue: () => post("slack.sendDue", {}),

  // ✅ Config Flujos: incluir/excluir en mensaje GENERAL
  configFlujosSetIncluirMensaje: (flujo, value) =>
    post("config.flujos.setIncluirMensaje", { flujo, value: !!value }),

  presentismoSemanas: () => get("presentismo.semanas"),
  presentismoWeek: (dateYMD) => get("presentismo.week", { date: dateYMD }),
  presentismoStats: (dateYMD) => get("presentismo.stats", { date: dateYMD }),
  presentismoWeekBySemana: (semana) => get("presentismo.weekBySemana", { semana }),
  presentismoStatsBySemana: (semana) => get("presentismo.statsBySemana", { semana }),
  presentismoSetLicencia: (idMeli, desdeYMD, hastaYMD, tipo) =>
    post("presentismo.licencias.set", { idMeli, desde: desdeYMD, hasta: hastaYMD, tipo }),
};
