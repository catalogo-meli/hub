// api.js
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
    flujosList: () => request("flujos.list"),
    canalesList: () => request("canales.list"),

    // Flujos CRUD
    flujosUpsert: (payload) => request("flujos.upsert", { method: "POST", body: payload }),
    flujosDelete: (flujo) => request("flujos.delete", { method: "POST", body: { flujo } }),
    flujosBatchSet: (updates = []) => request("flujos.batchSet", { method: "POST", body: { updates } }),

    // Planificación
    planificacionGet: () => request("planificacion.get"),
    planificacionGenerar: () => request("planificacion.generar", { method: "POST" }),
    planificacionBatchSet: (updates = []) => request("planificacion.batchSet", { method: "POST", body: { updates } }),

    // Slack
    slackOutboxList: () => request("slack.outbox.list"),
    slackOutboxGenerar: () => request("slack.outbox.generar", { method: "POST" }),
    slackOutboxBatchSet: (updates = []) => request("slack.outbox.batchSet", { method: "POST", body: { updates } }),
    slackOutboxEnviar: () => request("slack.outbox.enviar", { method: "POST" }),

    // Habilitaciones
    habilitacionesMatrix: () => request("habilitaciones.matrix"),
    habilitacionesSet: (idMeli, flujo, { habilitado, fijo } = {}) =>
      request("habilitaciones.set", { method: "POST", body: { idMeli, flujo, habilitado, fijo } }),

    // Presentismo
    presentismoMatrix: (query) => request("presentismo.matrix", { query }),
    presentismoBatchSet: (updates = []) => request("presentismo.batchSet", { method: "POST", body: { updates } }),
    presentismoSummaryToday: () => request("presentismo.summaryToday"),
  };
})();

export { HUB };
export default HUB;
