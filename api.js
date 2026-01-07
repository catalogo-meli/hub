// api.js (ESM) — contrato estable con /.netlify/functions/gas
// IMPORTANTE: exporta API (tu app.js hace: import { API } from "./api.js")

export const API = (() => {
  const BASE = "/.netlify/functions/gas";

  async function request(action, { method = "GET", query, body } = {}) {
    let url = BASE;

    if (method === "GET") {
      const qs = new URLSearchParams();
      if (action) qs.set("action", action);
      if (query) {
        Object.entries(query).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
        });
      }
      url += "?" + qs.toString();

      const r = await fetch(url, { method: "GET" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || `API error (${r.status})`);
      return j.data;
    }

    // POST
    const payload = { action, ...(body || {}) };

    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || `API error (${r.status})`);
    return j.data;
  }

  return {
    // Health
    health: () => request("health"),

    // Base data
    colaboradoresList: () => request("colaboradores.list"),
    canalesList: () => request("canales.list"),
    flujosList: () => request("flujos.list"),
    habilitacionesList: () => request("habilitaciones.list"),
    feriadosList: () => request("feriados.list"),

    // Presentismo
    presentismoWeek: (date /* yyyy-mm-dd opcional */) =>
      request("presentismo.week", { query: date ? { date } : undefined }),
    presentismoStats: (date /* yyyy-mm-dd opcional */) =>
      request("presentismo.stats", { query: date ? { date } : undefined }),
    presentismoLicenciasSet: ({ idMeli, desde, hasta, tipo }) =>
      request("presentismo.licencias.set", {
        method: "POST",
        body: { idMeli, desde, hasta, tipo },
      }),

    // Flujos autosave (CRUD)
    flujosUpsert: ({ flujo, perfiles_requeridos, slack_channel }) =>
      request("flujos.upsert", {
        method: "POST",
        body: { flujo, perfiles_requeridos, slack_channel },
      }),
    flujosDelete: (flujo) =>
      request("flujos.delete", { method: "POST", body: { flujo } }),

    // Habilitaciones
    habilitacionesSet: (idMeli, flujo, { habilitado, fijo } = {}) =>
      request("habilitaciones.set", {
        method: "POST",
        body: { idMeli, flujo, habilitado, fijo },
      }),

    // Planificación + Slack outbox
    planificacionList: () => request("planificacion.list"),
    planificacionGenerar: () => request("planificacion.generar", { method: "POST" }),

    slackOutboxList: () => request("slack.outbox.list"),
    slackOutboxGenerar: () => request("slack.outbox.generar", { method: "POST" }),
    slackOutboxEnviarTodos: () =>
      request("slack.outbox.enviar", { method: "POST", body: { all: true } }),
    slackOutboxEnviarFila: (row /* number */) =>
      request("slack.outbox.enviar", { method: "POST", body: { row } }),
  };
})();

// Si en algún punto tuviste "HUB" en el front, te lo dejo alias:
export const HUB = API;
