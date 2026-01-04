// api.js
const API = (() => {
  const BASE = "/.netlify/functions/gas";

  async function request(path, { method = "GET", query, body } = {}) {
    let url = BASE;
    const qs = new URLSearchParams();

    if (method === "GET") {
      if (path) qs.set("action", path);
      if (query) Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
      });
      url += "?" + qs.toString();

      const r = await fetch(url, { method });
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
    health: () => request("health"),

    colaboradoresList: () => request("colaboradores.list"),
    flujosList: () => request("flujos.list"),

    // ✅ Genérico: actualiza campos en Config_Flujos (por ejemplo Perfiles_requeridos)
    flujosSet: (flujo, patch) =>
      request("flujos.set", { method: "POST", body: { flujo, ...patch } }),

    // ✅ Alias explícito para el UI (más legible)
    flujosSetPerfiles: (flujo, perfiles_requeridos) =>
      request("flujos.setPerfiles", { method: "POST", body: { flujo, perfiles_requeridos } }),

    habilitacionesList: () => request("habilitaciones.list"),
    habilitacionesGet: (idMeli) => request("habilitaciones.get", { query: { idMeli } }),

    // ⚠️ Viejo (toggle). Lo dejo por compatibilidad si alguna parte lo usa.
    habilitacionesSetToggle: (idMeli, flujo, field, value) =>
      request("habilitaciones.set", { method: "POST", body: { idMeli, flujo, field, value } }),

    // ✅ Nuevo (set explícito habilitado + fijo en una sola llamada)
    habilitacionesSet: (idMeli, flujo, habilitado, fijo) =>
      request("habilitaciones.set", {
        method: "POST",
        body: { idMeli, flujo, habilitado: !!habilitado, fijo: !!fijo }
      }),

    planificacionGenerar: () => request("planificacion.generar", { method: "POST" }),
    slackOutboxGenerar: () => request("slack.outbox.generar", { method: "POST" }),
    slackOutboxEnviar: () => request("slack.outbox.enviar", { method: "POST" }),

    feriadosList: () => request("feriados.list"),
  };
})();
