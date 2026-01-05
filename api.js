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

    // Lecturas
    colaboradoresList: () => request("colaboradores.list"),
    flujosList: () => request("flujos.list"),
    feriadosList: () => request("feriados.list"),

    // Habilitaciones
    habilitacionesList: () => request("habilitaciones.list"),
    habilitacionesGet: (idMeli) => request("habilitaciones.get", { query: { idMeli } }),

    // Planificación / Slack OUTBOX (lecturas)
    planificacionGet: () => request("planificacion.get"),
    slackOutboxList: () => request("slack.outbox.list"),

    // === EDITS ===

    // Flujos: set Perfiles_requeridos
    flujosSetPerfiles: (flujo, perfiles_requeridos) =>
      request("flujos.setPerfiles", {
        method: "POST",
        body: { flujo, perfiles_requeridos },
      }),

    // Habilitaciones: modo legacy (field/value)
    habilitacionesSetField: (idMeli, flujo, field, value) =>
      request("habilitaciones.set", {
        method: "POST",
        body: { idMeli, flujo, field, value },
      }),

    // Habilitaciones: modo nuevo (habilitado/fijo)
    habilitacionesSet: (idMeli, flujo, { habilitado, fijo } = {}) =>
      request("habilitaciones.set", {
        method: "POST",
        body: { idMeli, flujo, habilitado, fijo },
      }),

    // Acciones
    planificacionGenerar: () => request("planificacion.generar", { method: "POST" }),
    slackOutboxGenerar: () => request("slack.outbox.generar", { method: "POST" }),
    slackOutboxEnviar: () => request("slack.outbox.enviar", { method: "POST" }),

    // =========================
    // PRESENTISMO (MATRIZ)
    // =========================
    // meta => { fixedCols, days:[{key,label}], codeMap }
    presentismoMeta: () => request("presentismo.meta"),

    // day => { dayKey, rows:[{ID_MELI,Nombre,Rol,Equipo,Dias_trabajados,Code}] }
    presentismoDay: (dayKey) => request("presentismo.day", { query: { dayKey } }),

    // set => { updated:true, dayKey, idMeli, code }
    presentismoSet: ({ dayKey, idMeli, code }) =>
      request("presentismo.set", {
        method: "POST",
        body: { dayKey, idMeli, code },
      }),
  };
})();

export { HUB };
export default HUB;
