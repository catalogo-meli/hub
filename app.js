import { HUB } from "./api.js";

const $ = (sel) => document.querySelector(sel);

const state = {
  tab: "colaboradores",
  cache: {
    colaboradores: null,
    flujos: null,
    feriados: null,
    habilitacionesAll: null,
    planificacion: null,
    slackOutbox: null,
    presentismoMeta: null,
    presentismoDay: null, // {dayKey, rows}
  },
  habilitacionesSelected: null, // {idMeli, perFlujo, raw}
  habilitacionesDirty: new Map(), // key: flujo -> {habilitado,fijo}
  flujosDirty: new Map(), // flujo -> perfiles_requeridos

  // Presentismo
  presentismoDayKey: null,
  presentismoDirty: new Map(), // idMeli -> code
};

const TABS = [
  { key: "colaboradores", label: "Colaboradores" },
  { key: "flujos", label: "Flujos" },
  { key: "habilitaciones", label: "Habilitaciones" },
  { key: "planificacion", label: "Planificación" },
  { key: "slack", label: "Slack" },
  { key: "feriados", label: "Feriados" },
  { key: "presentismo", label: "Presentismo" }, // ✅ nuevo
];

init();

function init() {
  renderTabs();
  $("#reloadBtn").addEventListener("click", () => loadTab(state.tab, { force: true }));
  $("#healthChip").addEventListener("click", runHealth);

  loadTab(state.tab, { force: true });
  runHealth().catch(() => {});
}

function setStatus(msg) {
  $("#status").textContent = msg;
}

function toast(type, title, msg) {
  const wrap = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<p class="t">${escapeHtml(title)}</p><p class="m">${escapeHtml(msg)}</p>`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function confirmDanger(title, msg) {
  return window.confirm(`${title}\n\n${msg}\n\nOK = Confirmar · Cancel = Abort`);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTabs() {
  const el = $("#tabs");
  el.innerHTML = "";
  TABS.forEach((t) => {
    const b = document.createElement("button");
    b.className = `tab ${state.tab === t.key ? "active" : ""}`;
    b.textContent = t.label;
    b.addEventListener("click", () => {
      state.tab = t.key;
      state.habilitacionesSelected = null;
      state.habilitacionesDirty.clear();
      state.flujosDirty.clear();
      state.presentismoDirty.clear();
      renderTabs();
      loadTab(t.key, { force: false });
    });
    el.appendChild(b);
  });
}

async function runHealth() {
  const dot = $("#healthDot");
  const txt = $("#healthText");
  txt.textContent = "…";
  dot.className = "dot";

  try {
    const data = await HUB.health();
    txt.textContent = "ok";
    dot.className = "dot ok";
    toast("good", "Health OK", "Backend responde correctamente.");
    return data;
  } catch (e) {
    txt.textContent = "fail";
    dot.className = "dot bad";
    toast("bad", "Health FAIL", e.message || "No responde");
    throw e;
  }
}

async function loadTab(tab, { force }) {
  $("#content").innerHTML = "";
  $("#controls").innerHTML = "";
  $("#cards").innerHTML = "";

  try {
    switch (tab) {
      case "colaboradores":
        return await tabColaboradores(force);
      case "flujos":
        return await tabFlujos(force);
      case "habilitaciones":
        return await tabHabilitaciones(force);
      case "planificacion":
        return await tabPlanificacion(force);
      case "slack":
        return await tabSlack(force);
      case "feriados":
        return await tabFeriados(force);
      case "presentismo":
        return await tabPresentismo(force);
      default:
        setStatus("Tab inválido.");
    }
  } catch (e) {
    setStatus("Error.");
    toast("bad", "Error", e.message || String(e));
    $("#content").innerHTML = `<div class="empty">Falló la carga: <span class="mono">${escapeHtml(
      e.message || String(e)
    )}</span></div>`;
  }
}

/* ----------------------------
   Cards helpers
---------------------------- */
function setCards(cards) {
  const el = $("#cards");
  el.innerHTML = "";
  cards.forEach(({ label, value, sub }) => {
    const c = document.createElement("div");
    c.className = "kpi";
    c.innerHTML = `
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(value)}</div>
      ${sub ? `<div class="small">${escapeHtml(sub)}</div>` : ""}
    `;
    el.appendChild(c);
  });
}

function renderTable({ columns, rows }) {
  if (!rows || rows.length === 0) return `<div class="empty">Sin datos para mostrar.</div>`;
  const thead = `<tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
  const tbody = rows
    .map(
      (r) =>
        `<tr>${columns.map((c) => `<td>${escapeHtml(r[c] ?? "")}</td>`).join("")}</tr>`
    )
    .join("");
  return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

/* ----------------------------
   TAB: Colaboradores
---------------------------- */
async function tabColaboradores(force) {
  setStatus("Cargando colaboradores…");

  const data = force || !state.cache.colaboradores
    ? await HUB.colaboradoresList()
    : state.cache.colaboradores;

  state.cache.colaboradores = data;

  const total = data.length;
  const conSlack = data.filter((x) => (x.Slack_ID || "").trim() !== "").length;

  setCards([
    { label: "Colaboradores", value: String(total) },
    { label: "Con Slack_ID", value: String(conSlack), sub: "Detectado desde hoja Colaboradores" },
    { label: "Sin Slack_ID", value: String(total - conSlack) },
  ]);

  const controls = $("#controls");
  controls.innerHTML = `
    <input id="qColabs" placeholder="Buscar por Nombre / ID_MELI / Slack_ID" style="min-width:340px" />
    <span class="badge">Fuente: hoja <span class="mono">Colaboradores</span></span>
  `;

  const content = $("#content");
  const q = $("#qColabs");
  q.addEventListener("input", () => render());

  function render() {
    const needle = (q.value || "").toLowerCase().trim();
    const filtered = needle
      ? data.filter((r) =>
          [r.Nombre, r.ID_MELI, r.Slack_ID]
            .map((v) => String(v || "").toLowerCase())
            .some((v) => v.includes(needle))
        )
      : data;

    const rows = filtered.map((r) => ({
      Nombre: r.Nombre ?? "",
      ID_MELI: r.ID_MELI ?? "",
      Slack_ID: r.Slack_ID ?? "",
    }));

    content.innerHTML = renderTable({
      columns: ["Nombre", "ID_MELI", "Slack_ID"],
      rows,
    });

    setStatus(`Listo. Mostrando ${rows.length}/${total}.`);
  }

  render();
}

/* ----------------------------
   TAB: Flujos
---------------------------- */
async function tabFlujos(force) {
  setStatus("Cargando flujos…");

  const data = force || !state.cache.flujos
    ? await HUB.flujosList()
    : state.cache.flujos;

  state.cache.flujos = data;

  const total = data.length;
  const reqSum = data.reduce((a, x) => a + Number(x.Perfiles_requeridos || 0), 0);

  setCards([
    { label: "Flujos", value: String(total) },
    { label: "Perfiles requeridos (suma)", value: String(reqSum) },
    { label: "Editados (pendientes)", value: String(state.flujosDirty.size) },
  ]);

  const controls = $("#controls");
  controls.innerHTML = `
    <input id="qFlujos" placeholder="Buscar flujo…" style="min-width:260px" />
    <button class="btn primary" id="saveFlujos">Guardar cambios</button>
    <span class="badge">Edición segura: valida números ≥ 0</span>
  `;

  $("#saveFlujos").addEventListener("click", async () => {
    if (state.flujosDirty.size === 0) {
      toast("warn", "Nada que guardar", "No hay cambios pendientes.");
      return;
    }
    const preview = [...state.flujosDirty.entries()]
      .slice(0, 10)
      .map(([flujo, val]) => `• ${flujo}: ${val}`)
      .join("\n");
    if (
      !confirmDanger(
        "Guardar Flujos",
        `Vas a escribir en Config_Flujos.\n\nCambios (hasta 10):\n${preview}\n\n¿Confirmás?`
      )
    ) return;

    setStatus("Guardando…");
    try {
      for (const [flujo, perfiles] of state.flujosDirty.entries()) {
        await HUB.flujosSetPerfiles(flujo, perfiles);
      }
      state.flujosDirty.clear();
      toast("good", "Guardado", "Flujos actualizados.");
      await tabFlujos(true);
    } catch (e) {
      toast("bad", "Error guardando", e.message || String(e));
      setStatus("Error al guardar.");
    }
  });

  const content = $("#content");
  const q = $("#qFlujos");
  q.addEventListener("input", () => render());

  function render() {
    const needle = (q.value || "").toLowerCase().trim();
    const filtered = needle
      ? data.filter((r) => String(r.Flujo || "").toLowerCase().includes(needle))
      : data;

    const rows = filtered.map((r) => ({
      Flujo: r.Flujo ?? "",
      Perfiles_requeridos: r.Perfiles_requeridos ?? 0,
      Slack_Channel: r.Slack_Channel ?? "",
      Notas_default: r.Notas_default ?? "",
    }));

    const html = `
      <table>
        <thead>
          <tr>
            <th>Flujo</th>
            <th>Perfiles requeridos</th>
            <th>Slack channel</th>
            <th>Notas</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              const key = r.Flujo;
              const dirty = state.flujosDirty.has(key);
              const val = dirty ? state.flujosDirty.get(key) : Number(r.Perfiles_requeridos || 0);
              return `
                <tr>
                  <td>${escapeHtml(r.Flujo)}</td>
                  <td>
                    <input data-flujo="${escapeHtml(key)}" class="inpReq" type="number" min="0" step="1"
                      value="${escapeHtml(val)}" style="width:120px" />
                    ${dirty ? `<span class="badge">editado</span>` : ""}
                  </td>
                  <td class="mono">${escapeHtml(r.Slack_Channel)}</td>
                  <td>${escapeHtml(r.Notas_default)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;

    content.innerHTML = html;
    content.querySelectorAll(".inpReq").forEach((inp) => {
      inp.addEventListener("input", () => {
        const flujo = inp.getAttribute("data-flujo");
        const n = Number(inp.value);
        if (!Number.isFinite(n) || n < 0) {
          inp.style.borderColor = "rgba(255,92,108,.6)";
          return;
        }
        inp.style.borderColor = "rgba(255,255,255,.10)";
        state.flujosDirty.set(flujo, n);
        setCards([
          { label: "Flujos", value: String(total) },
          { label: "Perfiles requeridos (suma)", value: String(reqSum) },
          { label: "Editados (pendientes)", value: String(state.flujosDirty.size) },
        ]);
      });
    });

    setStatus(`Listo. ${rows.length}/${total}.`);
  }

  render();
}

/* ----------------------------
   TAB: Habilitaciones
---------------------------- */
async function tabHabilitaciones(force) {
  setStatus("Preparando…");

  const [colabs, flujos] = await Promise.all([
    force || !state.cache.colaboradores ? HUB.colaboradoresList() : state.cache.colaboradores,
    force || !state.cache.flujos ? HUB.flujosList() : state.cache.flujos,
  ]);

  state.cache.colaboradores = colabs;
  state.cache.flujos = flujos;

  setCards([
    { label: "Colaboradores", value: String(colabs.length) },
    { label: "Flujos", value: String(flujos.length) },
    { label: "Cambios pendientes", value: String(state.habilitacionesDirty.size) },
  ]);

  const controls = $("#controls");
  controls.innerHTML = `
    <input id="qId" placeholder="Buscar ID_MELI / Nombre…" style="min-width:320px" />
    <select id="idSelect" style="min-width:260px"></select>
    <button class="btn primary" id="loadHab">Cargar</button>
    <button class="btn good" id="saveHab">Guardar cambios</button>
    <span class="badge">Checkboxes: Habilitado / Fijo</span>
  `;

  const q = $("#qId");
  const sel = $("#idSelect");

  function fillSelect() {
    const needle = (q.value || "").toLowerCase().trim();
    const list = needle
      ? colabs.filter((r) => {
          const s = `${r.ID_MELI || ""} ${r.Nombre || ""}`.toLowerCase();
          return s.includes(needle);
        })
      : colabs;

    const prev = sel.value;
    sel.innerHTML = list
      .slice(0, 200)
      .map((r) => {
        const label = `${r.ID_MELI || ""} — ${r.Nombre || ""}`;
        return `<option value="${escapeHtml(r.ID_MELI)}">${escapeHtml(label)}</option>`;
      })
      .join("");

    if (prev) sel.value = prev;
  }

  q.addEventListener("input", fillSelect);
  fillSelect();

  $("#loadHab").addEventListener("click", async () => {
    const idMeli = sel.value;
    if (!idMeli) return;
    state.habilitacionesDirty.clear();
    await loadHabilitaciones(idMeli);
  });

  $("#saveHab").addEventListener("click", async () => {
    if (!state.habilitacionesSelected) {
      toast("warn", "Nada para guardar", "Primero cargá un ID_MELI.");
      return;
    }
    if (state.habilitacionesDirty.size === 0) {
      toast("warn", "Sin cambios", "No hay cambios pendientes.");
      return;
    }

    const id = state.habilitacionesSelected.idMeli;
    const preview = [...state.habilitacionesDirty.entries()]
      .slice(0, 12)
      .map(([flujo, v]) => `• ${flujo}: habilitado=${v.habilitado ? "SI" : "NO"}, fijo=${v.fijo ? "SI" : "NO"}`)
      .join("\n");

    if (
      !confirmDanger(
        "Guardar Habilitaciones",
        `Vas a escribir en hoja Habilitaciones para ${id}.\n\nCambios (hasta 12):\n${preview}\n\n¿Confirmás?`
      )
    ) return;

    setStatus("Guardando habilitaciones…");
    try {
      for (const [flujo, v] of state.habilitacionesDirty.entries()) {
        await HUB.habilitacionesSet(id, flujo, v);
      }
      state.habilitacionesDirty.clear();
      toast("good", "Guardado", "Habilitaciones actualizadas.");
      await loadHabilitaciones(id);
    } catch (e) {
      toast("bad", "Error", e.message || String(e));
      setStatus("Error al guardar.");
    }
  });

  $("#content").innerHTML = `<div class="empty">Elegí un ID_MELI y tocá <b>Cargar</b>.</div>`;
  setStatus("Listo.");
}

async function loadHabilitaciones(idMeli) {
  setStatus(`Cargando habilitaciones de ${idMeli}…`);
  const data = await HUB.habilitacionesGet(idMeli);
  if (!data) {
    $("#content").innerHTML = `<div class="empty">No se encontró el ID <span class="mono">${escapeHtml(
      idMeli
    )}</span> en Habilitaciones.</div>`;
    setStatus("Sin datos.");
    return;
  }

  state.habilitacionesSelected = data;

  const flujos = state.cache.flujos || [];
  const perFlujo = data.perFlujo || {};

  const enabledCount = Object.values(perFlujo).filter((x) => x?.habilitado).length;
  const fixedCount = Object.values(perFlujo).filter((x) => x?.fijo).length;

  setCards([
    { label: "ID_MELI", value: idMeli },
    { label: "Habilitados", value: String(enabledCount), sub: `sobre ${flujos.length} flujos` },
    { label: "Fijos", value: String(fixedCount) },
    { label: "Cambios pendientes", value: String(state.habilitacionesDirty.size) },
  ]);

  const rows = flujos.map((f) => {
    const flujo = f.Flujo || f.flujo || "";
    const v = perFlujo[flujo] || { habilitado: false, fijo: false };
    const dirty = state.habilitacionesDirty.get(flujo);
    const cur = dirty || v;
    return { flujo, habilitado: !!cur.habilitado, fijo: !!cur.fijo, dirty: !!dirty };
  });

  $("#content").innerHTML = `
    <table>
      <thead>
        <tr><th>Flujo</th><th>Habilitado</th><th>Fijo</th><th>Estado</th></tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td>${escapeHtml(r.flujo)}</td>
            <td><input type="checkbox" class="chkHab" data-flujo="${escapeHtml(r.flujo)}" ${
              r.habilitado ? "checked" : ""
            } /></td>
            <td><input type="checkbox" class="chkFijo" data-flujo="${escapeHtml(r.flujo)}" ${
              r.fijo ? "checked" : ""
            } /></td>
            <td>${r.dirty ? `<span class="badge">editado</span>` : `<span class="small">ok</span>`}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  $("#content").querySelectorAll(".chkHab").forEach((el) => {
    el.addEventListener("change", () => {
      const flujo = el.getAttribute("data-flujo");
      const base = state.habilitacionesSelected.perFlujo[flujo] || { habilitado: false, fijo: false };
      const cur = state.habilitacionesDirty.get(flujo) || { ...base };
      cur.habilitado = el.checked;
      state.habilitacionesDirty.set(flujo, cur);
      loadHabilitaciones(idMeli);
    });
  });

  $("#content").querySelectorAll(".chkFijo").forEach((el) => {
    el.addEventListener("change", () => {
      const flujo = el.getAttribute("data-flujo");
      const base = state.habilitacionesSelected.perFlujo[flujo] || { habilitado: false, fijo: false };
      const cur = state.habilitacionesDirty.get(flujo) || { ...base };
      cur.fijo = el.checked;
      state.habilitacionesDirty.set(flujo, cur);
      loadHabilitaciones(idMeli);
    });
  });

  setStatus("Listo.");
}

/* ----------------------------
   TAB: Planificación
---------------------------- */
async function tabPlanificacion(force) {
  setStatus("Cargando planificación…");

  const data = force || !state.cache.planificacion
    ? await HUB.planificacionGet()
    : state.cache.planificacion;

  state.cache.planificacion = data;

  const total = data.length;
  const hoy = new Date().toISOString().slice(0, 10);
  const deHoy = data.filter((r) => String(r.Fecha || "").includes(hoy)).length;

  setCards([
    { label: "Filas en Planificación", value: String(total) },
    { label: "Filas detectadas hoy", value: String(deHoy), sub: "Aproximado por string yyyy-mm-dd" },
    { label: "Acción", value: "Generar", sub: "Escritura en Sheets (confirmación)" },
  ]);

  $("#controls").innerHTML = `
    <button class="btn primary" id="genPlan">Generar planificación</button>
    <span class="badge">Fuente: hoja <span class="mono">Planificacion_Diaria</span></span>
  `;

  $("#genPlan").addEventListener("click", async () => {
    if (
      !confirmDanger(
        "Generar Planificación",
        "Esto escribe Planificacion_Diaria y agrega historial.\nSi estás probando, no lo hagas ‘por deporte’."
      )
    ) return;

    setStatus("Generando planificación…");
    try {
      const res = await HUB.planificacionGenerar();
      toast("good", "Planificación generada", JSON.stringify(res));
      await tabPlanificacion(true);
    } catch (e) {
      toast("bad", "Error", e.message || String(e));
      setStatus("Error.");
    }
  });

  const content = $("#content");
  const cols = ["Fecha", "Flujo", "ID_MELI", "Es_Fijo", "Comentario", "Canal_destino"];
  const rows = data.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? ""])));
  content.innerHTML = renderTable({ columns: cols, rows });

  setStatus("Listo.");
}

/* ----------------------------
   TAB: Slack
---------------------------- */
async function tabSlack(force) {
  setStatus("Cargando Slack Outbox…");

  const data = force || !state.cache.slackOutbox
    ? await HUB.slackOutboxList()
    : state.cache.slackOutbox;

  state.cache.slackOutbox = data;

  const total = data.length;
  const pendientes = data.filter((r) => String(r.Estado || "").startsWith("PENDIENTE")).length;
  const enviados = data.filter((r) => String(r.Estado || "").startsWith("ENVIADO")).length;
  const errores = data.filter((r) => String(r.Estado || "").startsWith("ERROR")).length;

  setCards([
    { label: "Mensajes (Outbox)", value: String(total) },
    { label: "Pendientes", value: String(pendientes) },
    { label: "Enviados", value: String(enviados) },
    { label: "Errores", value: String(errores) },
  ]);

  $("#controls").innerHTML = `
    <button class="btn primary" id="genOut">Generar Outbox</button>
    <button class="btn good" id="sendPend">Enviar pendientes</button>
    <span class="badge">Fuente: hoja <span class="mono">Slack_Outbox</span></span>
  `;

  $("#genOut").addEventListener("click", async () => {
    if (
      !confirmDanger(
        "Generar Slack Outbox",
        "Esto escribe/actualiza Slack_Outbox en Sheets.\n¿Confirmás?"
      )
    ) return;

    setStatus("Generando Outbox…");
    try {
      const res = await HUB.slackOutboxGenerar();
      toast("good", "Outbox generado", JSON.stringify(res));
      await tabSlack(true);
    } catch (e) {
      toast("bad", "Error", e.message || String(e));
      setStatus("Error.");
    }
  });

  $("#sendPend").addEventListener("click", async () => {
    if (
      !confirmDanger(
        "Enviar pendientes",
        "Esto envía mensajes reales por Slack.\nSi mandás mal, no hay Ctrl+Z."
      )
    ) return;

    setStatus("Enviando pendientes…");
    try {
      const res = await HUB.slackOutboxEnviar();
      toast("good", "Envío ejecutado", JSON.stringify(res));
      await tabSlack(true);
    } catch (e) {
      toast("bad", "Error", e.message || String(e));
      setStatus("Error.");
    }
  });

  const cols = ["Fecha", "Tipo", "Canal", "Slack_Channel_ID", "Mensaje", "Estado"];
  const rows = data
    .slice()
    .reverse()
    .slice(0, 80)
    .map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? ""])));

  $("#content").innerHTML = renderTable({ columns: cols, rows });
  setStatus("Listo.");
}

/* ----------------------------
   TAB: Feriados
---------------------------- */
async function tabFeriados(force) {
  setStatus("Cargando feriados…");

  const data = force || !state.cache.feriados
    ? await HUB.feriadosList()
    : state.cache.feriados;

  state.cache.feriados = data;

  setCards([
    { label: "Feriados (AR)", value: String(data.length) },
    { label: "Fuente", value: "Feriados_AR", sub: "Formateado yyyy-mm-dd" },
    { label: "Próximo", value: nextHoliday(data) || "—" },
  ]);

  $("#controls").innerHTML = `
    <span class="badge">Listado ordenado</span>
  `;

  const rows = data
    .slice()
    .sort()
    .map((d) => ({ Fecha: d }));

  $("#content").innerHTML = renderTable({ columns: ["Fecha"], rows });
  setStatus("Listo.");
}

function nextHoliday(list) {
  const today = new Date().toISOString().slice(0, 10);
  const next = list.slice().sort().find((d) => d >= today);
  return next || null;
}

/* ----------------------------
   ✅ TAB: Presentismo (Matriz)
---------------------------- */
async function tabPresentismo(force) {
  setStatus("Cargando presentismo…");
  state.presentismoDirty.clear();

  // meta (days + codes)
  const meta = force || !state.cache.presentismoMeta
    ? await HUB.presentismoMeta()
    : state.cache.presentismoMeta;

  state.cache.presentismoMeta = meta;

  const days = meta.days || [];
  const codeMap = meta.codeMap || {};
  if (!days.length) {
    $("#content").innerHTML = `<div class="empty">No hay columnas de fecha detectadas en <span class="mono">Presentismo</span>.</div>`;
    setStatus("Sin días.");
    return;
  }

  // default: último día disponible
  if (!state.presentismoDayKey) state.presentismoDayKey = days[days.length - 1].key;

  $("#controls").innerHTML = `
    <select id="presDay" style="min-width:200px"></select>
    <input id="qPres" placeholder="Buscar por nombre / ID…" style="min-width:280px" />
    <button class="btn primary" id="loadPres">Cargar</button>
    <button class="btn good" id="savePres">Guardar todo</button>
    <span class="badge">Fuente: hoja <span class="mono">Presentismo</span></span>
  `;

  const sel = $("#presDay");
  sel.innerHTML = days.map(d => `<option value="${escapeHtml(d.key)}">${escapeHtml(d.label)} (${escapeHtml(d.key)})</option>`).join("");
  sel.value = state.presentismoDayKey;

  $("#loadPres").addEventListener("click", async () => {
    state.presentismoDayKey = sel.value;
    state.presentismoDirty.clear();
    await loadAndRender();
  });

  $("#savePres").addEventListener("click", async () => {
    if (state.presentismoDirty.size === 0) {
      toast("warn", "Sin cambios", "No hay cambios pendientes.");
      return;
    }

    const dayKey = state.presentismoDayKey;
    const preview = [...state.presentismoDirty.entries()]
      .slice(0, 12)
      .map(([id, code]) => `• ${id}: ${code || "(vacío)"}`)
      .join("\n");

    if (!confirmDanger("Guardar Presentismo", `Día: ${dayKey}\n\nCambios (hasta 12):\n${preview}\n\n¿Confirmás?`)) return;

    setStatus("Guardando…");
    try {
      // batch secuencial (simple y seguro)
      for (const [idMeli, code] of state.presentismoDirty.entries()) {
        await HUB.presentismoSet({ dayKey, idMeli, code });
      }
      state.presentismoDirty.clear();
      toast("good", "Guardado", "Presentismo actualizado.");
      await loadAndRender(true);
    } catch (e) {
      toast("bad", "Error", e.message || String(e));
      setStatus("Error al guardar.");
    }
  });

  const q = $("#qPres");
  q.addEventListener("input", () => render());

  await loadAndRender();

  async function loadAndRender(forceDay = false) {
    const dayKey = state.presentismoDayKey;

    const dayData = forceDay || !state.cache.presentismoDay || state.cache.presentismoDay.dayKey !== dayKey
      ? await HUB.presentismoDay(dayKey)
      : state.cache.presentismoDay;

    state.cache.presentismoDay = dayData;

    render();
  }

  function render() {
    const dayKey = state.presentismoDayKey;
    const rowsAll = (state.cache.presentismoDay?.rows || []).slice();

    // KPIs
    const total = rowsAll.length;
    const counts = {};
    for (const r of rowsAll) {
      const c = String(r.Code || "").trim();
      counts[c] = (counts[c] || 0) + 1;
    }

    const presentes = counts["P"] || 0;
    const vacaciones = counts["V"] || 0;
    const sinCarga = counts[""] || 0;
    const noPresentes = total - presentes; // todo lo demás (incluye vacío)
    const pctP = total ? Math.round((presentes / total) * 100) : 0;

    setCards([
      { label: "Día", value: dayKey },
      { label: "Total", value: String(total) },
      { label: "Presentes (P)", value: String(presentes), sub: `${pctP}%` },
      { label: "Vacaciones (V)", value: String(vacaciones) },
      { label: "Sin carga", value: String(sinCarga) },
      { label: "No presentes", value: String(noPresentes) },
      { label: "Cambios pendientes", value: String(state.presentismoDirty.size) },
    ]);

    const needle = ($("#qPres").value || "").toLowerCase().trim();
    const filtered = needle
      ? rowsAll.filter(r => (`${r.ID_MELI || ""} ${r.Nombre || ""}`).toLowerCase().includes(needle))
      : rowsAll;

    $("#content").innerHTML = filtered.length === 0
      ? `<div class="empty">Sin datos para mostrar.</div>`
      : `
        <table>
          <thead>
            <tr>
              <th>ID_MELI</th><th>Nombre</th><th>Rol</th><th>Equipo</th><th>Días trabajados</th>
              <th>Código</th><th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(r => {
              const id = String(r.ID_MELI || "").trim();
              const baseCode = String(r.Code || "").trim();
              const dirtyCode = state.presentismoDirty.has(id) ? state.presentismoDirty.get(id) : null;
              const curCode = dirtyCode !== null ? dirtyCode : baseCode;

              const options = Object.keys(codeMap)
                .filter(k => k !== "") // mapea los conocidos
                .map(k => `<option value="${escapeHtml(k)}" ${curCode === k ? "selected" : ""}>${escapeHtml(k)} — ${escapeHtml(codeMap[k])}</option>`)
                .join("");

              const optClear = `<option value="" ${curCode === "" ? "selected" : ""}>— Limpiar —</option>`;

              return `
                <tr>
                  <td class="mono">${escapeHtml(id)}</td>
                  <td>${escapeHtml(r.Nombre || "")}</td>
                  <td>${escapeHtml(r.Rol || "")}</td>
                  <td>${escapeHtml(r.Equipo || "")}</td>
                  <td>${escapeHtml(r.Dias_trabajados || "")}</td>
                  <td>
                    <select class="presCode" data-id="${escapeHtml(id)}" style="min-width:200px">
                      ${options}
                      ${optClear}
                    </select>
                  </td>
                  <td>${state.presentismoDirty.has(id) ? `<span class="badge">editado</span>` : `<span class="small">ok</span>`}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      `;

    $("#content").querySelectorAll(".presCode").forEach(sel => {
      sel.addEventListener("change", () => {
        const id = sel.getAttribute("data-id");
        const code = sel.value;

        state.presentismoDirty.set(id, code);

        // refresco solo cards (no rerender pesado)
        setCards([
          { label: "Día", value: dayKey },
          { label: "Total", value: String(total) },
          { label: "Presentes (P)", value: String(presentes), sub: `${pctP}%` },
          { label: "Vacaciones (V)", value: String(vacaciones) },
          { label: "Sin carga", value: String(sinCarga) },
          { label: "No presentes", value: String(noPresentes) },
          { label: "Cambios pendientes", value: String(state.presentismoDirty.size) },
        ]);
      });
    });

    setStatus(`Listo. Mostrando ${filtered.length}/${total}.`);
  }
}
