// app.js (ESM)
import { API } from "./api.js";

/* -----------------------
   Helpers DOM
------------------------ */
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    if (typeof c === "string") n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  });
  return n;
};

function toast(msg, type = "info") {
  const t = $("#toast");
  t.textContent = msg;
  t.dataset.type = type;
  t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove("show"), type === "error" ? 5200 : 2600);
}

function fmt(v) {
  if (v == null) return "";
  if (v instanceof Date) return v.toLocaleDateString("es-AR");
  return String(v);
}

function tableFromMatrix(matrix) {
  if (!matrix || !matrix.length) return el("div", { class: "muted" }, "Sin datos");
  const [headers, ...rows] = matrix;

  const thead = el("thead", {}, el("tr", {}, headers.map(h => el("th", {}, fmt(h)))));
  const tbody = el("tbody", {}, rows.map(r => el("tr", {}, headers.map((_, i) => el("td", {}, fmt(r[i]))))));
  return el("table", { class: "tbl" }, [thead, tbody]);
}

function tableFromObjectTable(headers, rows) {
  const thead = el("thead", {}, el("tr", {}, headers.map(h => el("th", {}, fmt(h)))));
  const tbody = el("tbody", {}, rows.map(r => el("tr", {}, headers.map((_, i) => el("td", {}, fmt(r[i]))))));
  return el("table", { class: "tbl" }, [thead, tbody]);
}

/* -----------------------
   State
------------------------ */
const state = {
  tab: "operativa",
  data: {
    colaboradores: [],
    canales: [],
    flujos: [],
    habil: null, // {headers, rows}
    plan: [],
    outbox: [],
    presWeek: null,
    presStats: null,
  },
};

function setTab(tab) {
  state.tab = tab;
  render();
}

async function loadAll() {
  $("#content").innerHTML = `<div class="card"><div class="muted">Cargando datos…</div></div>`;
  try {
    const [colaboradores, canales, flujos, habil, plan, outbox] = await Promise.all([
      API.colaboradoresList(),
      API.canalesList(),
      API.flujosList(),
      API.habilitacionesList(),
      API.planificacionList(),
      API.slackOutboxList(),
    ]);
    state.data.colaboradores = colaboradores || [];
    state.data.canales = canales || [];
    state.data.flujos = flujos || [];
    state.data.habil = habil || { headers: [], rows: [] };
    state.data.plan = plan || [];
    state.data.outbox = outbox || [];
    toast("Datos actualizados");
    render();
  } catch (e) {
    toast(e.message || String(e), "error");
    $("#content").innerHTML = `<div class="card"><pre class="pre">${e.message || String(e)}</pre></div>`;
  }
}

/* -----------------------
   Views
------------------------ */
function viewOperativa() {
  const wrap = el("div", { class: "grid2" }, []);

  const cardA = el("div", { class: "card" }, [
    el("div", { class: "cardTitle" }, "Operativa diaria"),
    el("div", { class: "row" }, [
      el("button", {
        class: "btn primary",
        onclick: async () => {
          try {
            toast("Generando planificación…");
            await API.planificacionGenerar();
            toast("Planificación generada");
            state.data.plan = await API.planificacionList();
            render();
          } catch (e) { toast(e.message, "error"); }
        }
      }, "Generar planificación"),
      el("button", {
        class: "btn",
        onclick: async () => {
          try {
            toast("Generando Slack Outbox…");
            await API.slackOutboxGenerar();
            toast("Outbox generado");
            state.data.outbox = await API.slackOutboxList();
            render();
          } catch (e) { toast(e.message, "error"); }
        }
      }, "Generar Outbox"),
      el("button", {
        class: "btn success",
        onclick: async () => {
          try {
            toast("Enviando pendientes…");
            await API.slackOutboxEnviar();
            toast("Outbox procesado");
            state.data.outbox = await API.slackOutboxList();
            render();
          } catch (e) { toast(e.message, "error"); }
        }
      }, "Enviar pendientes"),
      el("button", {
        class: "btn",
        onclick: async () => {
          try {
            const h = await API.health();
            toast(`OK · ${h.tz}`);
          } catch (e) { toast(e.message, "error"); }
        }
      }, "Health"),
    ]),
    el("div", { class: "hint" }, "Tip: el orden recomendado es Planificación → Outbox → Envío."),
  ]);

  const cardB = el("div", { class: "card" }, [
    el("div", { class: "cardTitle" }, "Resumen rápido"),
    el("div", { class: "kpis" }, [
      kpi("Colaboradores", state.data.colaboradores.length),
      kpi("Flujos", state.data.flujos.length),
      kpi("Planificación (filas)", Math.max(0, (state.data.plan?.length || 0) - 1)),
      kpi("Outbox (filas)", Math.max(0, (state.data.outbox?.length || 0) - 1)),
    ]),
  ]);

  wrap.appendChild(cardA);
  wrap.appendChild(cardB);

  // Planificación table
  const planCard = el("div", { class: "card" }, [
    el("div", { class: "cardTitle" }, "Planificación diaria"),
    tableFromMatrix(state.data.plan),
  ]);

  // Outbox table
  const outCard = el("div", { class: "card" }, [
    el("div", { class: "cardTitle" }, "Slack Outbox"),
    el("div", { class: "hint" }, "Columnas: Fecha, Tipo, Canal, Slack_Channel_ID, Mensaje, Estado"),
    tableFromMatrix(state.data.outbox),
  ]);

  return el("div", { class: "stack" }, [wrap, planCard, outCard]);
}

function kpi(label, value) {
  return el("div", { class: "kpi" }, [
    el("div", { class: "kpiLabel" }, label),
    el("div", { class: "kpiValue" }, String(value)),
  ]);
}

function viewColaboradores() {
  const list = state.data.colaboradores || [];
  const card = el("div", { class: "card" }, [
    el("div", { class: "cardTitle" }, "Colaboradores"),
    el("div", { class: "hint" }, "Fuente: hoja Colaboradores (ID_MELI, Slack_ID, Nombre)"),
    el("table", { class: "tbl" }, [
      el("thead", {}, el("tr", {}, ["ID_MELI", "Nombre", "Slack_ID"].map(h => el("th", {}, h)))),
      el("tbody", {}, list.map(c => el("tr", {}, [
        el("td", {}, fmt(c.ID_MELI)),
        el("td", {}, fmt(c.Nombre)),
        el("td", {}, fmt(c.Slack_ID)),
      ])))
    ]),
  ]);
  return el("div", { class: "stack" }, [card]);
}

function viewFlujos() {
  const flujos = state.data.flujos || [];

  const form = el("div", { class: "row wrap" }, [
    el("input", { class: "inp", id: "newFlujo", placeholder: "Flujo (ej: Enhancement)" }),
    el("input", { class: "inp", id: "newPerfiles", placeholder: "Perfiles requeridos (número)", type: "number", min: "0" }),
    el("input", { class: "inp", id: "newChannel", placeholder: "Slack Channel (nombre exacto de la hoja Config_Flujos)" }),
    el("button", {
      class: "btn primary",
      onclick: async () => {
        try {
          const flujo = $("#newFlujo").value.trim();
          const perfiles = Number($("#newPerfiles").value || 0);
          const channel = $("#newChannel").value.trim();

          if (!flujo) return toast("Falta Flujo", "error");
          await API.flujosUpsert(flujo, perfiles, channel);
          toast("Flujo guardado");
          state.data.flujos = await API.flujosList();
          render();
        } catch (e) { toast(e.message, "error"); }
      }
    }, "Guardar"),
  ]);

  const tbl = el("table", { class: "tbl" }, [
    el("thead", {}, el("tr", {}, ["Flujo", "Perfiles_requeridos", "Slack_Channel", "Acciones"].map(h => el("th", {}, h)))),
    el("tbody", {}, flujos.map(f => el("tr", {}, [
      el("td", {}, fmt(f.Flujo)),
      el("td", {}, fmt(f.Perfiles_requeridos)),
      el("td", {}, fmt(f.Slack_Channel)),
      el("td", {}, el("button", {
        class: "btn danger sm",
        onclick: async () => {
          try {
            const name = String(f.Flujo || "").trim();
            if (!name) return;
            if (!confirm(`Eliminar flujo "${name}"?`)) return;
            await API.flujosDelete(name);
            toast("Flujo eliminado");
            state.data.flujos = await API.flujosList();
            render();
          } catch (e) { toast(e.message, "error"); }
        }
      }, "Eliminar")),
    ]))),
  ]);

  return el("div", { class: "stack" }, [
    el("div", { class: "card" }, [
      el("div", { class: "cardTitle" }, "Configurar flujos"),
      el("div", { class: "hint" }, "Esto impacta directamente en Planificación + Outbox."),
      form,
    ]),
    el("div", { class: "card" }, [el("div", { class: "cardTitle" }, "Listado de flujos"), tbl]),
  ]);
}

function viewHabilitaciones() {
  const hab = state.data.habil || { headers: [], rows: [] };
  const headers = hab.headers || [];
  const rows = hab.rows || [];

  if (!headers.length) {
    return el("div", { class: "card" }, [
      el("div", { class: "cardTitle" }, "Habilitaciones"),
      el("div", { class: "muted" }, "No hay datos o la hoja está vacía."),
    ]);
  }

  // UI: selector de ID y flujo para set rápido (evita editar matriz gigante)
  const idOptions = rows.map(r => String(r[headers.indexOf("ID_MELI")] || "")).filter(Boolean);

  const flujoOptions = (state.data.flujos || []).map(f => String(f.Flujo || "").trim()).filter(Boolean);

  const quick = el("div", { class: "row wrap" }, [
    el("select", { class: "inp", id: "habId" }, [
      el("option", { value: "" }, "ID_MELI…"),
      ...idOptions.map(id => el("option", { value: id }, id)),
    ]),
    el("select", { class: "inp", id: "habFlujo" }, [
      el("option", { value: "" }, "Flujo…"),
      ...flujoOptions.map(fl => el("option", { value: fl }, fl)),
    ]),
    el("label", { class: "chk" }, [
      el("input", { type: "checkbox", id: "habEn" }),
      el("span", {}, "Habilitado"),
    ]),
    el("label", { class: "chk" }, [
      el("input", { type: "checkbox", id: "habFijo" }),
      el("span", {}, "Fijo"),
    ]),
    el("button", {
      class: "btn primary",
      onclick: async () => {
        try {
          const id = $("#habId").value.trim();
          const flujo = $("#habFlujo").value.trim();
          const habilitado = $("#habEn").checked;
          const fijo = $("#habFijo").checked;
          if (!id || !flujo) return toast("Falta ID o Flujo", "error");

          await API.habilitacionesSet(id, flujo, habilitado, fijo);
          toast("Habilitación actualizada");
          state.data.habil = await API.habilitacionesList();
          render();
        } catch (e) { toast(e.message, "error"); }
      }
    }, "Aplicar"),
  ]);

  const card = el("div", { class: "card" }, [
    el("div", { class: "cardTitle" }, "Habilitaciones"),
    el("div", { class: "hint" }, "UI rápida para setear sin editar la matriz completa. La tabla abajo es referencia."),
    quick,
  ]);

  const tableCard = el("div", { class: "card" }, [
    el("div", { class: "cardTitle" }, "Vista tabla (referencia)"),
    el("div", { class: "hint" }, "Si esto te queda enorme: normal. Por eso existe el set rápido arriba."),
    tableFromObjectTable(headers, rows),
  ]);

  return el("div", { class: "stack" }, [card, tableCard]);
}

function viewPresentismo() {
  const cardTop = el("div", { class: "card" }, [
    el("div", { class: "cardTitle" }, "Presentismo"),
    el("div", { class: "row wrap" }, [
      el("input", { class: "inp", id: "presDate", placeholder: "Fecha (YYYY-MM-DD o DD/MM/YYYY)" }),
      el("button", {
        class: "btn",
        onclick: async () => {
          try {
            const d = $("#presDate").value.trim();
            state.data.presStats = await API.presentismoStats(d || undefined);
            state.data.presWeek = await API.presentismoWeek(d || undefined);
            toast("Presentismo actualizado");
            render();
          } catch (e) { toast(e.message, "error"); }
        }
      }, "Actualizar"),
    ]),
    el("div", { class: "divider" }),
    el("div", { class: "cardTitle small" }, "Registrar licencia/ausencia"),
    el("div", { class: "row wrap" }, [
      el("input", { class: "inp", id: "licId", placeholder: "ID_MELI" }),
      el("input", { class: "inp", id: "licDesde", placeholder: "Desde (YYYY-MM-DD o DD/MM/YYYY)" }),
      el("input", { class: "inp", id: "licHasta", placeholder: "Hasta (opcional)" }),
      el("select", { class: "inp", id: "licTipo" }, [
        el("option", { value: "V" }, "V (Vacaciones)"),
        el("option", { value: "E" }, "E"),
        el("option", { value: "M" }, "M"),
        el("option", { value: "MM" }, "MM"),
        el("option", { value: "AI" }, "AI"),
        el("option", { value: "P" }, "P (Presente)"),
      ]),
      el("button", {
        class: "btn primary",
        onclick: async () => {
          try {
            const idMeli = $("#licId").value.trim();
            const desde = $("#licDesde").value.trim();
            const hasta = $("#licHasta").value.trim();
            const tipo = $("#licTipo").value.trim();
            if (!idMeli || !desde) return toast("Falta ID o Desde", "error");

            await API.presentismoLicenciasSet(idMeli, desde, hasta || "", tipo);
            toast("Registro guardado");
          } catch (e) { toast(e.message, "error"); }
        }
      }, "Guardar"),
    ]),
  ]);

  const stats = state.data.presStats;
  const statsCard = el("div", { class: "card" }, [
    el("div", { class: "cardTitle" }, "Stats día"),
    stats
      ? el("div", { class: "kpis" }, [
          kpi("Fecha", stats.fecha || "-"),
          kpi("Total", stats.total ?? 0),
          kpi("Presentes", stats.presentes ?? 0),
          kpi("Ausentes", stats.ausentes ?? 0),
        ])
      : el("div", { class: "muted" }, "Sin stats todavía. Tocá Actualizar."),
  ]);

  const week = state.data.presWeek;
  const weekCard = el("div", { class: "card" }, [
    el("div", { class: "cardTitle" }, "Semana (últimas 7 columnas fecha)"),
    week ? tableFromObjectTable(week.headers, week.rows) : el("div", { class: "muted" }, "Sin datos todavía."),
  ]);

  return el("div", { class: "stack" }, [cardTop, statsCard, weekCard]);
}

function viewDashboards() {
  // placeholders para que no te autoengañes: esto no se “inventa”, se conecta a datos reales.
  return el("div", { class: "stack" }, [
    el("div", { class: "card" }, [
      el("div", { class: "cardTitle" }, "Dashboard (Productividad / Calidad)"),
      el("div", { class: "hint" }, "Esto es el siguiente paso: conectarlo a tus fuentes reales (auditorías, volumen, efectividad, etc.)."),
      el("ul", { class: "ul" }, [
        el("li", {}, "Productividad: tareas/día por flujo, por colaborador, tendencia semanal."),
        el("li", {}, "Calidad: efectividad global, % graves, top motivos, top perfiles en riesgo."),
        el("li", {}, "Alertas: baja cobertura, flujos sin perfiles, outbox con errores."),
      ]),
      el("div", { class: "muted" }, "Cuando me pases la estructura de tus hojas de productividad/calidad, lo cierro en serio."),
    ]),
  ]);
}

/* -----------------------
   Render root
------------------------ */
function render() {
  const content = $("#content");
  content.innerHTML = "";
  const view =
    state.tab === "operativa" ? viewOperativa()
    : state.tab === "colaboradores" ? viewColaboradores()
    : state.tab === "flujos" ? viewFlujos()
    : state.tab === "habilitaciones" ? viewHabilitaciones()
    : state.tab === "presentismo" ? viewPresentismo()
    : viewDashboards();

  content.appendChild(view);

  // nav active
  document.querySelectorAll("[data-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === state.tab);
  });
}

/* -----------------------
   Boot
------------------------ */
function boot() {
  // nav events
  document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

  $("#btnRefresh").addEventListener("click", loadAll);

  loadAll();
}

boot();
