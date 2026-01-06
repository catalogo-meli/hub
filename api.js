// api.js (ESM)
const HUB = (() => {
  const BASE = "/.netlify/functions/gas";

  async function request(path, { method = "GET", query, body } = {}) {
    let url = BASE;
    const qs = new URLSearchParams();

    if (method === "GET") {
      if (path) qs.set("action", path);
      if (query) {
        Object.entries(query).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
        });
      }
      url += "?" + qs.toString();

      const r = await fetch(url, { method: "GET" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "API error");
      return j.data;
    }

    // POST
    const payload = { action: path, ...(body || {}) };
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "API error");
    return j.data;
  }

  return {
    // Health
    health: () => request("health"),

    // Lists
    colaboradoresList: () => request("colaboradores.list"),
    canalesList: () => request("canales.list"),
    flujosList: () => request("flujos.list"),
    habilitacionesList: () => request("habilitaciones.list"),
    habilitacionesGet: (idMeli) => request("habilitaciones.get", { query: { idMeli } }),

    // Presentismo
    presentismoSummaryToday: () => request("presentismo.summaryToday"),
    presentismoMeta: () => request("presentismo.meta"),
    presentismoDay: (dayKey) => request("presentismo.day", { query: { dayKey } }),
    presentismoSet: ({ dayKey, idMeli, code }) =>
      request("presentismo.set", { method: "POST", body: { dayKey, idMeli, code } }),
    presentismoApplyLicense: ({ idMeli, from, to, tipo }) =>
      request("presentismo.applyLicense", { method: "POST", body: { idMeli, from, to, tipo } }),

    // Flujos autosave
    flujosUpsert: ({ flujo, slack_channel, perfiles_requeridos }) =>
      request("flujos.upsert", { method: "POST", body: { flujo, slack_channel, perfiles_requeridos } }),
    flujosDelete: ({ flujo }) =>
      request("flujos.delete", { method: "POST", body: { flujo } }),

    // Habilitaciones
    habilitacionesSet: (idMeli, flujo, { habilitado, fijo } = {}) =>
      request("habilitaciones.set", { method: "POST", body: { idMeli, flujo, habilitado, fijo } }),

    // Planificación
    planificacionList: () => request("planificacion.list"),
    planificacionGenerar: () => request("planificacion.generar", { method: "POST" }),

    // Slack
    slackOutboxList: () => request("slack.outbox.list"),
    slackOutboxGenerar: () => request("slack.outbox.generar", { method: "POST" }),
    slackOutboxEnviar: () => request("slack.outbox.enviar", { method: "POST" }),
    slackOutboxEnviarUno: (Row) => request("slack.outbox.enviarUno", { method: "POST", body: { Row } }),
    slackOutboxUpdate: ({ Row, canal, mensaje }) =>
      request("slack.outbox.update", { method: "POST", body: { Row, canal, mensaje } }),
  };
})();

export { HUB };
export default HUB;
