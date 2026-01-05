import { HUB } from "./api.js";

const $ = (sel) => document.querySelector(sel);

const PRESENTISMO_CODES = ["", "P", "V", "E", "M", "MM", "AI"];

const state = {
  tab: "operativa",
  cache: {
    colaboradores: null,
    flujos: null,
    habilitacionesAll: null,
    planificacion: null,
    slackOutbox: null,
    presentismoMatrix: null,
  },
  // Edición
  flujosDirty: new Map(), // flujo -> perfiles_requeridos
  presentismoDirty: new Map(), // key `${idMeli}|${dayKey}` -> code
};

const TABS = [
  { key: "operativa", label: "Operativa diaria" },
  { key: "colaboradores", label: "Colaboradores" },
  { key: "habilitaciones", label: "Habilitaciones" },
  { key: "presentismo", label: "Presentismo" },
];

init();

function init() {
  renderTabs();
  $("#reloadBtn")?.addEventListener("click", () => loadTab(state.tab, { force: true }));
  $("#healthChip")?.addEventListener("click", runHealth);

  loadTab(state.tab, { force: true });
  runHealth().catch(() => {});
}

/* ----------------------------
   UI helpers
---------------------------- */
function setStatus(msg) {
  $("#status").textContent = msg;
}

function toast(type, title, msg) {
  const wrap = $("#toasts");
  if (!wrap) return;
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

function setCards(cards) {
  const el = $("#cards");
  if (!el) return;
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
    .map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(r[c] ?? "")}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function renderTabs() {
  const el = $("#tabs");
  if (!el) return;
  el.innerHTML = "";
  TABS.forEach((t) => {
    const b = document.createElement("button");
    b.className = `tab ${state.tab === t.key ? "active" : ""}`;
    b.textContent = t.label;
    b.addEventListener("click", () => {
      state.tab = t.key;
      // reset dirties por tab
      if (t.key !== "operativa") state.flujosDirty.clear();
      if (t.key !== "presentismo") state.presentismoDirty.clear();
      renderTabs();
      loadTab(t.key, { force: false });
    });
    el.appendChild(b);
  });
}

/* ----------------------------
   Health
---------------------------- */
async function runHealth() {
  const dot = $("#healthDot");
  const txt = $("#healthText");
  if (txt) txt.textContent = "…";
  if (dot) dot.className = "dot";

  try {
    await HUB.health();
    if (txt) txt.textContent = "ok";
    if (dot) dot.className = "dot ok";
    return true;
  } catch (e) {
    if (txt) txt.textContent = "fail";
    if (dot) dot.className = "dot bad";
    toast("bad", "Health FAIL", e.message || "No responde");
    throw e;
  }
}

/* ----------------------------
   Router
---------------------------- */
async function loadTab(tab, { force }) {
  $("#content").innerHTML = "";
  $("#controls").innerHTML = "";
  $("#cards").innerHTML = "";

  try {
    switch (tab) {
      case "operativa":
        return await tabOperativa(force);
      case "colaboradores":
        return await tabColaboradores(force);
      case "habilitaciones":
        return await tabHabilitaciones(force);
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
   TAB: Operativa diaria (Flujos -> Planificación -> Slack)
---------------------------- */
async function tabOperativa(force) {
  setStatus("Cargando Operativa diaria…");

  const [flujos, plan, outbox] = await Promise.all([
    force || !state.cache.flujos ? HUB.flujosList() : state.cache.flujos,
    force || !state.cache.planificacion ? HUB.planificacionGet().catch(() => []) : state.cache.planificacion,
    force || !state.cache.slackOutbox ? HUB.slackOutboxList().catch(() => []) : state.cache.slackOutbox,
  ]);

  state.cache.flujos = flujos;
  state.cache.planificacion = plan;
  state.cache.slackOutbox = outbox;

  const reqSum = flujos.reduce((a, x) => a + Number(x.Perfiles_requeridos || 0), 0);
  const planRows = Array.isArray(plan) ? plan.length : 0;
  const pendientesSlack = Array.isArray(outbox)
    ? outbox.filter((r) => String(r.Estado || "").startsWith("PENDIENTE")).length
    : 0;

  setCards([
    { label: "Perfiles requeridos (suma)", value: String(reqSum), sub: "Config_Flujos" },
    { label: "Planificación (filas)", value: String(planRows), sub: "Planificacion_Diaria" },
    { label: "Slack pendientes", value: String(pendientesSlack), sub: "Slack_Outbox" },
  ]);

  const controls = $("#controls");
  controls.innerHTML = `
    <span class="badge">Secuencia diaria: Flujos → Planificación → Slack</span>
    <button class="btn" id="opReload">Recargar datos</button>
    <button class="btn primary" id="opPlanGen">Generar planificación</button>
    <button class="btn" id="opSlackGen">Generar Outbox</button>
    <button class="btn good" id="opSlackSend">Enviar pendientes</button>
  `;

  $("#opReload").addEventListener("click", () => loadTab("operativa", { force: true }));

  $("#opPlanGen").addEventListener("click", async () => {
    if (!confirmDanger("Generar planificación", "Esto reescribe Planificacion_Diaria y agrega historial. ¿Confirmás?"))
      return;
    setStatus("Generando planificación…");
    await HUB.planificacionGenerar();
    toast("good", "OK", "Planificación generada.");
    await loadTab("operativa", { force: true });
  });

  $("#opSlackGen").addEventListener("click", async () => {
    setStatus("Generando Slack Outbox…");
    await HUB.slackOutboxGenerar();
    toast("good", "OK", "Outbox generado (Sheets actualizado).");
    await loadTab("operativa", { force: true });
  });

  $("#opSlackSend").addEventListener("click", async () => {
    if (!confirmDanger("Enviar Slack", "Vas a enviar todos los pendientes. Si te equivocás, no hay Ctrl+Z. ¿Confirmás?"))
      return;
    setStatus("Enviando pendientes…");
    const res = await HUB.slackOutboxEnviar();
    toast("good", "Slack", `Enviados: ${res.enviados ?? "?"} · Errores: ${res.errores ?? "?"}`);
    await loadTab("operativa", { force: true });
  });

  const content = $("#content");
  content.innerHTML = `
    <div class="section">
      <h3>1) Flujos (Perfiles requeridos)</h3>
      <div id="flujosBox"></div>
      <div style="display:flex; gap:10px; margin-top:10px;">
        <button class="btn primary" id="saveFlujos">Guardar cambios de Flujos</button>
        <span class="badge">Edición segura: números ≥ 0</span>
      </div>
    </div>

    <div class="section" style="margin-top:16px;">
      <h3>2) Planificación (resultado)</h3>
      <div id="planBox"></div>
    </div>

    <div class="section" style="margin-top:16px;">
      <h3>3) Slack Outbox (pendientes)</h3>
      <div id="slackBox"></div>
    </div>
  `;

  // Render Flujos table editable
  renderFlujosEditable_(flujos, $("#flujosBox"));

  $("#saveFlujos").addEventListener("click", async () => {
    if (state.flujosDirty.size === 0) {
      toast("warn", "Nada que guardar", "No hay cambios pendientes.");
      return;
    }
    const preview = [...state.flujosDirty.entries()]
      .slice(0, 12)
      .map(([flujo, val]) => `• ${flujo}: ${val}`)
      .join("\n");

    if (
      !confirmDanger(
        "Guardar Flujos",
        `Vas a escribir en Config_Flujos.\n\nCambios (hasta 12):\n${preview}\n\n¿Confirmás?`
      )
    ) return;

    setStatus("Guardando Flujos…");
    for (const [flujo, perfiles] of state.flujosDirty.entries()) {
      await HUB.flujosSetPerfiles(flujo, perfiles);
    }
    state.flujosDirty.clear();
    toast("good", "Guardado", "Flujos actualizados.");
    await loadTab("operativa", { force: true });
  });

  // Planificación table
  $("#planBox").innerHTML = renderTable({
    columns: planRows ? Object.keys(plan[0]) : ["Sin datos"],
    rows: planRows ? plan : [],
  });

  // Slack Outbox table (solo pendientes primero)
  const pending = Array.isArray(outbox)
    ? outbox
        .map((r) => ({ ...r, __estado: String(r.Estado || "") }))
        .sort((a, b) => (a.__estado.startsWith("PENDIENTE") ? -1 : 1) - (b.__estado.startsWith("PENDIENTE") ? -1 : 1))
    : [];

  $("#slackBox").innerHTML = renderTable({
    columns: pending.length ? ["Fecha", "Tipo", "Canal", "Slack_Channel_ID", "Estado"] : ["Sin datos"],
    rows: pending.length
      ? pending.map((r) => ({
          Fecha: r.Fecha ?? "",
          Tipo: r.Tipo ?? "",
          Canal: r.Canal ?? "",
          Slack_Channel_ID: r.Slack_Channel_ID ?? "",
          Estado: r.Estado ?? "",
        }))
      : [],
  });

  setStatus("Listo.");
}

function renderFlujosEditable_(data, mount) {
  const total = data.length;
  const rows = data.map((r) => ({
    Flujo: r.Flujo ?? "",
    Perfiles_requeridos: Number(r.Perfiles_requeridos || 0),
    Slack_Channel: r.Slack_Channel ?? "",
    Notas_default: r.Notas_default ?? "",
  }));

  mount.innerHTML = `
    <div style="overflow:auto; border:1px solid rgba(255,255,255,.08); border-radius:12px;">
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
    </div>
    <div class="small" style="margin-top:8px;">Flujos: ${total}</div>
  `;

  mount.querySelectorAll(".inpReq").forEach((inp) => {
    inp.addEventListener("input", () => {
      const flujo = inp.getAttribute("data-flujo");
      const n = Number(inp.value);
      if (!Number.isFinite(n) || n < 0) {
        inp.style.borderColor = "rgba(255,92,108,.6)";
        return;
      }
      inp.style.borderColor = "rgba(255,255,255,.10)";
      state.flujosDirty.set(flujo, n);
    });
  });
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
    { label: "Con Slack_ID", value: String(conSlack) },
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
   TAB: Habilitaciones (mantengo tu enfoque simple)
---------------------------- */
async function tabHabilitaciones(force) {
  setStatus("Cargando habilitaciones…");

  const [colabs, flujos, all] = await Promise.all([
    force || !state.cache.colaboradores ? HUB.colaboradoresList() : state.cache.colaboradores,
    force || !state.cache.flujos ? HUB.flujosList() : state.cache.flujos,
    force || !state.cache.habilitacionesAll ? HUB.habilitacionesList().catch(() => []) : state.cache.habilitacionesAll,
  ]);

  state.cache.colaboradores = colabs;
  state.cache.flujos = flujos;
  state.cache.habilitacionesAll = all;

  setCards([
    { label: "Colaboradores", value: String(colabs.length) },
    { label: "Flujos", value: String(flujos.length) },
    { label: "Filas habilitaciones", value: String(all.length || 0) },
  ]);

  const controls = $("#controls");
  controls.innerHTML = `
    <span class="badge">Vista raw (sheet). Edición por colaborador se gestiona con "Habilitaciones.get + set".</span>
  `;

  const content = $("#content");
  const cols = all.length ? Object.keys(all[0]) : ["Sin datos"];
  content.innerHTML = renderTable({ columns: cols, rows: all });

  setStatus("Listo.");
}

/* ----------------------------
   TAB: Presentismo (MATRIZ tipo hoja)
---------------------------- */
async function tabPresentismo(force) {
  setStatus("Cargando presentismo…");

  const matrix = force || !state.cache.presentismoMatrix
    ? await HUB.presentismoMatrix()
    : state.cache.presentismoMatrix;

  state.cache.presentismoMatrix = matrix;

  const total = matrix.rows?.length || 0;
  const dias = matrix.days?.length || 0;
  const dirty = state.presentismoDirty.size;

  setCards([
    { label: "Colaboradores", value: String(total) },
    { label: "Días visibles", value: String(dias), sub: "Columnas fecha en hoja Presentismo" },
    { label: "Cambios pendientes", value: String(dirty) },
  ]);

  const controls = $("#controls");
  controls.innerHTML = `
    <button class="btn" id="presReload">Recargar</button>
    <button class="btn primary" id="presSave">Guardar cambios</button>
    <span class="badge">Códigos: P / V / E / M / MM / AI (vacío = limpiar)</span>
  `;

  $("#presReload").addEventListener("click", () => loadTab("presentismo", { force: true }));

  $("#presSave").addEventListener("click", async () => {
    if (state.presentismoDirty.size === 0) {
      toast("warn", "Nada que guardar", "No hay cambios pendientes.");
      return;
    }

    const updates = [...state.presentismoDirty.entries()].map(([k, code]) => {
      const [idMeli, dayKey] = k.split("|");
      return { idMeli, dayKey, code };
    });

    const sample = updates.slice(0, 12).map((u) => `• ${u.idMeli} ${u.dayKey}: ${u.code || "(vacío)"}`).join("\n");

    if (!confirmDanger("Guardar Presentismo", `Cambios (hasta 12):\n${sample}\n\n¿Confirmás?`)) return;

    setStatus("Guardando presentismo…");
    const res = await HUB.presentismoBatchSet(updates);
    state.presentismoDirty.clear();

    toast("good", "Guardado", `Actualizados: ${res.updated} · Omitidos: ${res.skipped}`);
    await loadTab("presentismo", { force: true });
  });

  const content = $("#content");
  content.innerHTML = renderPresentismoMatrix_(matrix);

  // handlers: click en celda -> prompt -> set dirty
  content.querySelectorAll("[data-pres-cell='1']").forEach((cell) => {
    cell.addEventListener("click", () => {
      const idMeli = cell.getAttribute("data-id");
      const dayKey = cell.getAttribute("data-day");
      const cur = cell.getAttribute("data-code") || "";
      const next = prompt(
        `Código para ${idMeli} / ${dayKey}\n\nVálidos: ${PRESENTISMO_CODES.join(", ")}\nVacío = limpiar`,
        cur
      );
      if (next === null) return;

      const code = String(next).trim().toUpperCase();
      if (!PRESENTISMO_CODES.includes(code)) {
        toast("bad", "Código inválido", `Usá: ${PRESENTISMO_CODES.join(", ")}`);
        return;
      }

      // set dirty y UI
      const key = `${idMeli}|${dayKey}`;
      state.presentismoDirty.set(key, code);

      cell.textContent = code || "";
      cell.setAttribute("data-code", code);
      cell.classList.add("dirty");

      setCards([
        { label: "Colaboradores", value: String(total) },
        { label: "Días visibles", value: String(dias) },
        { label: "Cambios pendientes", value: String(state.presentismoDirty.size) },
      ]);
    });
  });

  setStatus("Listo.");
}

function renderPresentismoMatrix_(matrix) {
  const days = matrix.days || [];
  const rows = matrix.rows || [];

  if (!rows.length) return `<div class="empty">Sin datos en Presentismo.</div>`;

  // tabla scrolleable horizontalmente
  const head = `
    <tr>
      <th class="sticky">ID_MELI</th>
      <th class="sticky2">Nombre</th>
      ${days.map((d) => `<th class="day">${escapeHtml(d.label)}</th>`).join("")}
    </tr>
  `;

  const body = rows
    .map((r) => {
      const id = String(r.ID_MELI || "").trim();
      const nombre = r.Nombre || "";
      const codes = r.codes || {};
      return `
        <tr>
          <td class="sticky mono">${escapeHtml(id)}</td>
          <td class="sticky2">${escapeHtml(nombre)}</td>
          ${days
            .map((d) => {
              const code = (codes[d.key] || "").toString().trim();
              return `<td class="presCell ${code && code !== "P" ? "warn" : ""}"
                        data-pres-cell="1"
                        data-id="${escapeHtml(id)}"
                        data-day="${escapeHtml(d.key)}"
                        data-code="${escapeHtml(code)}"
                      >${escapeHtml(code)}</td>`;
            })
            .join("")}
        </tr>
      `;
    })
    .join("");

  // estilos mínimos (sin tocar tu CSS global)
  return `
    <style>
      .matrixWrap{ overflow:auto; border:1px solid rgba(255,255,255,.08); border-radius:14px; }
      .matrixWrap table{ min-width: 900px; }
      .presCell{ cursor:pointer; text-align:center; width:52px; }
      .presCell.warn{ background: rgba(255,190,80,.08); }
      .presCell.dirty{ outline:2px solid rgba(80,200,255,.35); }
      th.day{ min-width:52px; text-align:center; }
      th.sticky, td.sticky{ position:sticky; left:0; z-index:3; background: rgba(10,14,22,.95); }
      th.sticky2, td.sticky2{ position:sticky; left:140px; z-index:2; background: rgba(10,14,22,.95); }
      td.sticky{ min-width:140px; }
      td.sticky2{ min-width:220px; }
    </style>

    <div class="matrixWrap">
      <table>
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div class="small" style="margin-top:8px;">
      Tip: click en una celda → ingresás el código → queda marcado (dirty) hasta guardar.
    </div>
  `;
}
