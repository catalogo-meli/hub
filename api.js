// api.js (ESM) — exporta HUB (lo que tu app.js importa)

const HUB = (() => {
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
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "API error");
      return j.data;
    }

    // POST
    const payload = { action, ...(body || {}) };
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

    // Lecturas
    colaboradoresList: () => request("colaboradores.list"),
    flujosList: () => request("flujos.list"),
    canalesList: () => request("canales.list"),
    habilitacionesList: () => request("habilitaciones.list"),
    feriadosList: () => request("feriados.list"),

    planificacionList: () => request("planificacion.list"),
    slackOutboxList: () => request("slack.outbox.list"),

    // Flujos (autosave / CRUD)
    flujosUpsert: ({ flujo, perfiles_requeridos, slack_channel }) =>
      request("flujos.upsert", {
        method: "POST",
        body: { flujo, perfiles_requeridos, slack_channel },
      }),
    flujosDelete: ({ flujo }) =>
      request("flujos.delete", { method: "POST", body: { flujo } }),

    // Habilitaciones
    habilitacionesSet: ({ idMeli, flujo, habilitado, fijo }) =>
      request("habilitaciones.set", {
        method: "POST",
        body: { idMeli, flujo, habilitado, fijo },
      }),

    // Operativa diaria
    planificacionGenerar: () => request("planificacion.generar", { method: "POST" }),
    slackOutboxGenerar: () => request("slack.outbox.generar", { method: "POST" }),
    slackOutboxEnviar: ({ row, all } = {}) =>
      request("slack.outbox.enviar", { method: "POST", body: { row, all } }),

    // Presentismo
    presentismoWeek: (date /* yyyy-mm-dd */) => request("presentismo.week", { query: { date } }),
    presentismoStats: (date /* yyyy-mm-dd */) => request("presentismo.stats", { query: { date } }),
    presentismoLicenciasSet: ({ idMeli, desde, hasta, tipo }) =>
      request("presentismo.licencias.set", {
        method: "POST",
        body: { idMeli, desde, hasta, tipo },
      }),
  };
})();

export { HUB };
export default HUB;
