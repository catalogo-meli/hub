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
          if (v !== undefined && v !== null && v !== "") {
            qs.set(k, String(v));
          }
        });
      }
      url += "?" + qs.toString();
    }

    const opts =
      method === "GET"
        ? { method: "GET" }
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: path, ...(body || {}) }),
          };

    const r = await fetch(url, opts);
    const txt = await r.text();

    let j;
    try {
      j = JSON.parse(txt);
    } catch (err) {
      console.error("API devolvió respuesta NO JSON:", txt);
      throw new Error("Respuesta inválida del backend");
    }

    if (!j.ok) {
      console.error("API error:", j);
      throw new Error(j.error || "API error");
    }

    return j.data;
  }

  return {
    // Health
    health: () => request("health"),

    // Lecturas
    colaboradoresList: () => request("colaboradores.list"),
    flujosList: () => request("flujos.list"),
    feriadosList: () => request("feriados.list"),

    habilitacionesList: () => request("habilitaciones.list"),
    habilitacionesGet: (idMeli) =>
      request("habilitaciones.get", { query: { idMeli } }),

    // === EDITS ===

    // A) Flujos: set Perfiles_requeridos en Config_Flujos
    flujosSetPerfiles: (flujo, perfiles_requeridos) =>
      request("flujos.setPerfiles", {
        method: "POST",
        body: { flujo, perfiles_requeridos },
      }),

    // B1) Habilitaciones (legacy)
    habilitacionesSetField: (idMeli, flujo, field, value) =>
      request("habilitaciones.set", {
        method: "POST",
        body: { idMeli, flujo, field, value },
      }),

    // B2) Habilitaciones (nuevo)
    habilitacionesSet: (idMeli, flujo, { habilitado, fijo } = {}) =>
      request("habilitaciones.set", {
        method: "POST",
        body: { idMeli, flujo, habilitado, fijo },
      }),

    // Acciones
    planificacionGenerar: () =>
      request("planificacion.generar", { method: "POST" }),

    slackOutboxGenerar: () =>
      request("slack.outbox.generar", { method: "POST" }),

    slackOutboxEnviar: () =>
      request("slack.outbox.enviar", { method: "POST" }),
  };
})();

// 🔴 ESTO ERA LO QUE FALTABA
export { HUB };
export default HUB;
