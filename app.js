// app.js (ESM) — HUB Catálogo (Full)
// Secciones: Operativa diaria, Colaboradores, Habilitaciones, Presentismo, Dashboard (placeholder)
// Compatible con tu index.html actual (dark UI) + tu Netlify function gas.js (token inyectado).
import { API } from "./api.js";

const BASE = "/.netlify/functions/gas";
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* -----------------------------
   UI helpers
------------------------------ */
function toast(msg, isError = false) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  el.style.borderColor = isError ? "rgba(255,70,70,.35)" : "rgba(255,255,255,.14)";
  setTimeout(() => el.classList.remove("show"), isError ? 5200 : 2600);
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}
function norm(s) { return String(s ?? "").trim().toLowerCase(); }
function fmtYMD(d = new Date()) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function safeInt(v, dflt = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}
function debounce(fn, ms = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* -----------------------------
   Raw calls (para acciones que no están en api.js)
------------------------------ */
async function safeJson(resp) {
  const text = await resp.text();
  try { return JSON.parse(text); }
  catch { return { ok: false, error: `Non-JSON response (${resp.status}): ${text.slice(0, 200)}` }; }
}
async function rawGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params });
  const resp = await fetch(`${BASE}?${qs.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await safeJson(resp);
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `GET ${action} failed (${resp.status})`);
  return data.data;
}
async function rawPost(action, payload = {}) {
  const resp = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await safeJson(resp);
  if (!resp.ok || data?.ok === false) throw new Error(data?.error || `POST ${action} failed (${resp.status})`);
  return data.data;
}

/* -----------------------------
   State
------------------------------ */
const VIEWS = [
  { id: "operativa", label: "Operativa diaria" },
  { id: "colaboradores", label: "Colaboradores" },
  { id: "habilitaciones", label: "Habilitaciones" },
  { id: "presentismo", label: "Presentismo" },
  { id: "dashboard", label: "Dashboard" },
];

let STATE = {
  view: (localStorage.getItem("hub_view") || "operativa"),
  loading: false,

  canales: [],
  canalesById: new Map(),

  flujos: [],

  colaboradores: [],

  // operativa
  plan: [],
  outbox: [],

  // habilitaciones
  hab: null, // {flujos, rows}

  // presentismo
  pres: {
    date: fmtYMD(new Date()),
    week: null,  // {from,to,labels,rows}
    stats: null, // {date, counts...}
  },
};

/* -----------------------------
   Boot + layout
------------------------------ */
function ensureLocalStyles() {
  // Evita “todo superpuesto” por layouts mal anidados: fuerza contención y scroll horizontal en tablas.
  const app = $("#app");
  if (!app) return;
  const styleId = "hub-inline-style";
  if ($(`#${styleId}`)) return;

  const st = document.createElement("style");
  st.id = styleId;
  st.textContent = `
    .hubNav { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin: 6px 0 12px; }
    .hubNav .tab { padding:10px 12px; border-radius: 14px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); cursor:pointer; user-select:none; }
    .hubNav .tab.active { background:#2d63ff; border-color:#2d63ff; }
    .hubGrid2 { display:grid; grid-template-columns: 1.1fr .9fr; gap: 12px; }
    @media (max-width: 980px){ .hubGrid2{ grid-template-columns: 1fr; } }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
    .tableWrap { width:100%; overflow:auto; border-radius: 14px; }
    .kpi { display:grid; grid-template-columns: repeat(4, minmax(140px, 1fr)); gap: 10px; }
    @media (max-width: 980px){ .kpi{ grid-template-columns: repeat(2, minmax(140px, 1fr)); } }
    .kpi .k { border:1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.03); border-radius: 16px; padding: 12px; }
    .k .v { font-size: 22px; font-weight: 800; margin-top: 4px; }
    .pillMini { display:inline-flex; gap:8px; align-items:center; padding: 8px 10px; border-radius: 999px; border:1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.03); }
    .switch { display:inline-flex; gap:8px; align-items:center; }
    .switch input { width: 18px; height: 18px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
    .right { margin-left:auto; }
    .muted2 { opacity:.6; font-size:12px; }
    .dangerText { color:#ffd2d2; }
  `;
  app.prepend(st);
}

function setView(viewId) {
  STATE.view = viewId;
  localStorage.setItem("hub_view", viewId);
  render();
}

function renderShell() {
  const app = $("#app");
  app.innerHTML = `
    <div class="hubNav">
      ${VIEWS.map(v => `
        <div class="tab ${v.id === STATE.view ? "active" : ""}" data-view="${escapeHtml(v.id)}">
          ${escapeHtml(v.label)}
        </div>
      `).join("")}

      <div class="right toolbar">
        <button id="btnReload" class="btn">Recargar</button>
        <button id="btnHealth" class="btn">Health</button>
      </div>
    </div>

    <div id="viewHost"></div>
  `;

  $$(".hubNav .tab", app).forEach(t => {
    t.onclick = () => setView(t.dataset.view);
  });

  $("#btnReload").onclick = async () => {
    await reloadAll();
    toast("Recargado");
  };

  $("#btnHealth").onclick = async () => {
    try {
      const h = await API.health();
      toast(`OK: ${h.ts || "health"}`);
    } catch (e) {
      toast(e.message, true);
    }
  };
}

function render() {
  ensureLocalStyles();
  renderShell();

  const host = $("#viewHost");
  if (!host) return;

  if (STATE.loading) {
    host.innerHTML = `<div class="muted">Cargando…</div>`;
    return;
  }

  switch (STATE.view) {
    case "operativa": host.innerHTML = viewOperativa(); wireOperativa(); break;
    case "colaboradores": host.innerHTML = viewColaboradores(); wireColaboradores(); break;
    case "habilitaciones": host.innerHTML = viewHabilitaciones(); wireHabilitaciones(); break;
    case "presentismo": host.innerHTML = viewPresentismo(); wirePresentismo(); break;
    case "dashboard": host.innerHTML = viewDashboard(); wireDashboard(); break;
    default: host.innerHTML = `<div class="errorBox">Vista inválida</div>`;
  }
}

/* -----------------------------
   Loaders
------------------------------ */
async function loadCommon() {
  const [canales, flujos, colaboradores] = await Promise.all([
    API.canalesList(),
    API.flujosList(),
    API.colaboradoresList(),
  ]);

  STATE.canales = canales || [];
  STATE.canalesById = new Map(STATE.canales.map(c => [String(c.channel_id), c.canal]));
  STATE.flujos = flujos || [];
  STATE.colaboradores = (colaboradores || []).slice().sort((a, b) =>
    String(a.nombre || a.id_meli || "").localeCompare(String(b.nombre || b.id_meli || ""))
  );
}

async function loadOperativa() {
  const [plan, outbox] = await Promise.all([
    API.planificacionList().catch(() => []),
    API.slackOutboxList().catch(() => []),
  ]);
  STATE.plan = plan || [];
  STATE.outbox = outbox || [];
}

async function loadHabilitaciones() {
  STATE.hab = await API.habilitacionesList();
}

async function loadPresentismo(dateYMD) {
  const date = (dateYMD || STATE.pres.date || fmtYMD(new Date())).trim();
  STATE.pres.date = date;

  const [week, stats] = await Promise.all([
    rawGet("presentismo.week", { date }).catch((e) => ({ _error: e.message })),
    rawGet("presentismo.stats", { date }).catch((e) => ({ _error: e.message })),
  ]);

  STATE.pres.week = week;
  STATE.pres.stats = stats;
}

async function reloadAll() {
  STATE.loading = true;
  render();
  try {
    await loadCommon();
    await Promise.all([
      loadOperativa(),
      loadHabilitaciones().catch(() => null),
      loadPresentismo(STATE.pres.date).catch(() => null),
    ]);
  } finally {
    STATE.loading = false;
    render();
  }
}

/* -----------------------------
   Components: Operativa diaria
------------------------------ */
function canalesOptions(selectedChannelId) {
  const sel = String(selectedChannelId || "");
  const opts = [`<option value="">—</option>`]
    .concat(STATE.canales.map(c => {
      const v = String(c.channel_id);
      const label = c.canal;
      const s = v === sel ? "selected" : "";
      return `<option value="${escapeHtml(v)}" ${s}>${escapeHtml(label)}</option>`;
    }));
  return opts.join("");
}

function viewOperativa() {
  return `
    <div class="hubGrid2">
      <div class="card">
        <div class="sectionTitle">Operativa diaria</div>
        <div class="muted">Flujos, planificación y Slack Outbox.</div>

        <div class="sep"></div>

        <div class="sectionTitle">Flujos</div>
        <div class="muted2">Se guarda al cambiar el canal o la cantidad de perfiles.</div>

        <div class="grid3 gridFlujosHead" style="margin-top:12px;">
          <div class="small">Flujo</div>
          <div class="small">Slack channel</div>
          <div class="small">Perfiles requeridos</div>
        </div>

        <div id="flujosList" style="margin-top:10px;"></div>

        <div class="sep"></div>

        <div class="toolbar">
          <button id="btnPlan" class="btn primary">Generar planificación</button>
          <button id="btnOutbox" class="btn">Generar Outbox</button>
          <button id="btnSendAll" class="btn success">Enviar pendientes</button>
          <div id="opStatus" class="muted right"></div>
        </div>
      </div>

      <div class="card">
        <div class="sectionTitle">Resultado</div>
        <div class="muted2">Planificación (por flujo) + pendientes de Slack.</div>

        <div class="sep"></div>

        <div class="sectionTitle">Planificación</div>
        <div id="planBox" style="margin-top:10px;"></div>

        <div class="sep"></div>

        <div class="sectionTitle">Slack Outbox (pendientes)</div>
        <div class="muted2">Editá canal y mensaje, enviá por fila o masivo.</div>
        <div id="outboxBox" style="margin-top:10px;"></div>
      </div>
    </div>
  `;
}

function wireOperativa() {
  renderFlujos();
  renderPlan();
  renderOutbox();

  $("#btnPlan").onclick = onGenerarPlan;
  $("#btnOutbox").onclick = onGenerarOutbox;
  $("#btnSendAll").onclick = onEnviarTodos;
}

function renderFlujos() {
  const wrap = $("#flujosList");
  if (!wrap) return;

  const rows = STATE.flujos.slice().sort((a, b) => String(a.flujo).localeCompare(String(b.flujo)));

  wrap.innerHTML = rows.map(f => `
    <div class="grid3" style="gap:10px; margin: 10px 0;">
      <div class="pill">
        <strong>${escapeHtml(f.flujo)}</strong>
      </div>

      <div>
        <select data-flujo="${escapeHtml(f.flujo)}" data-field="channel_id">
          ${canalesOptions(f.channel_id)}
        </select>
      </div>

      <div class="row" style="gap:10px;">
        <input data-flujo="${escapeHtml(f.flujo)}" data-field="perfiles" type="number" min="0"
          value="${safeInt(f.perfiles_requeridos, 0)}" />
        <button class="btn danger" data-action="delete" data-flujo="${escapeHtml(f.flujo)}">Borrar</button>
      </div>
    </div>
  `).join("") + `
    <div class="grid3" style="gap:10px; margin-top: 16px;">
      <input id="newFlujo" placeholder="+ Nuevo flujo…" />
      <select id="newChannel">${canalesOptions("")}</select>
      <div class="row" style="gap:10px;">
        <input id="newPerfiles" type="number" min="0" value="0" />
        <button id="btnAddFlujo" class="btn primary">Agregar</button>
      </div>
    </div>
  `;

  // autosave: channel
  $$('select[data-field="channel_id"]', wrap).forEach(sel => {
    sel.onchange = async (ev) => {
      const flujo = ev.target.dataset.flujo;
      const channel_id = ev.target.value;
      const current = STATE.flujos.find(x => x.flujo === flujo);
      const perfiles = safeInt(current?.perfiles_requeridos, 0);

      try {
        await API.flujosUpsert(flujo, perfiles, channel_id);
        toast(`Guardado: ${flujo}`);
        await refreshFlujosOnly();
      } catch (e) {
        toast(e.message, true);
      }
    };
  });

  // autosave: perfiles
  $$('input[data-field="perfiles"]', wrap).forEach(inp => {
    inp.onchange = async (ev) => {
      const flujo = ev.target.dataset.flujo;
      const perfiles = safeInt(ev.target.value, 0);
      const current = STATE.flujos.find(x => x.flujo === flujo);
      const channel_id = String(current?.channel_id || "");

      try {
        await API.flujosUpsert(flujo, perfiles, channel_id);
        toast(`Guardado: ${flujo}`);
        await refreshFlujosOnly();
      } catch (e) {
        toast(e.message, true);
      }
    };
  });

  // delete
  $$('button[data-action="delete"]', wrap).forEach(btn => {
    btn.onclick = async (ev) => {
      const flujo = ev.target.dataset.flujo;
      try {
        await API.flujosDelete(flujo);
        toast(`Borrado: ${flujo}`);
        await refreshFlujosOnly();
        await refreshHabilitacionesOnly(); // flujos impactan matriz
      } catch (e) {
        toast(e.message, true);
      }
    };
  });

  // add
  $("#btnAddFlujo").onclick = async () => {
    const flujo = ($("#newFlujo").value || "").trim();
    const channel_id = ($("#newChannel").value || "").trim();
    const perfiles = safeInt($("#newPerfiles").value, 0);

    if (!flujo) return toast("Flujo requerido", true);
    if (!channel_id) return toast("Slack channel requerido", true);
    if (perfiles < 0) return toast("Perfiles inválidos", true);

    try {
      await API.flujosUpsert(flujo, perfiles, channel_id);
      toast("Flujo agregado");
      await refreshFlujosOnly();
      await refreshHabilitacionesOnly();
    } catch (e) {
      toast(e.message, true);
    }
  };
}

function renderPlan() {
  const box = $("#planBox");
  if (!box) return;

  const plan = STATE.plan || [];
  if (!plan.length) {
    box.innerHTML = `<div class="muted">Sin planificación cargada.</div>`;
    return;
  }

  const byFlujo = new Map();
  for (const r of plan) {
    const f = String(r.flujo || "").trim();
    if (!f) continue;
    if (!byFlujo.has(f)) byFlujo.set(f, []);
    byFlujo.get(f).push(r);
  }

  const flujos = Array.from(byFlujo.keys()).sort((a, b) => a.localeCompare(b));
  box.innerHTML = flujos.map(flujo => {
    const items = byFlujo.get(flujo) || [];
    const nombres = items.map(x => x.nombre).filter(Boolean);
    return `
      <div class="card" style="margin: 10px 0;">
        <div style="font-weight:900; margin-bottom: 6px;">${escapeHtml(flujo)}</div>
        <div>${nombres.length ? escapeHtml(nombres.join(", ")) : `<span class="muted">—</span>`}</div>
        <div class="small" style="margin-top:8px;">Total: ${nombres.length}</div>
      </div>
    `;
  }).join("");
}

function renderOutbox() {
  const box = $("#outboxBox");
  if (!box) return;

  const rows = (STATE.outbox || []).filter(x => !String(x.estado || "").toUpperCase().startsWith("ENVIADO"));
  if (!rows.length) {
    box.innerHTML = `<div class="muted">Sin pendientes.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th style="width:150px;">Fecha</th>
            <th style="width:220px;">Canal</th>
            <th>Mensaje</th>
            <th style="width:140px;">Estado</th>
            <th style="width:260px;">Error</th>
            <th style="width:120px;"></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="mono">${escapeHtml(String(r.fecha || ""))}</td>
              <td>
                <select data-outbox-row="${r.row}" data-field="channel_id">
                  ${canalesOptions(r.channel_id)}
                </select>
              </td>
              <td>
                <textarea data-outbox-row="${r.row}" data-field="mensaje">${escapeHtml(r.mensaje || "")}</textarea>
                <div class="row" style="margin-top:8px; gap:10px;">
                  <button class="btn" data-action="copy" data-row="${r.row}">Copiar</button>
                </div>
              </td>
              <td>${escapeHtml(String(r.estado || ""))}</td>
              <td>${r.error ? `<div class="errorBox">${escapeHtml(r.error)}</div>` : ""}</td>
              <td>
                <button class="btn primary" data-action="send" data-row="${r.row}">Enviar</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  // change channel => update outbox row
  $$('select[data-field="channel_id"]', box).forEach(sel => {
    sel.onchange = async (ev) => {
      const row = safeInt(ev.target.dataset.outboxRow);
      const channel_id = ev.target.value;
      const canal = STATE.canalesById.get(String(channel_id)) || "";
      try {
        await API.slackOutboxUpdate(row, canal, channel_id, "");
        toast("Outbox actualizado");
        await refreshOutboxOnly();
      } catch (e) {
        toast(e.message, true);
      }
    };
  });

  // message update (debounced on input + final on blur)
  const debouncedSave = debounce(async (row, mensaje) => {
    const current = (STATE.outbox || []).find(x => x.row === row);
    const channel_id = String(current?.channel_id || "");
    const canal = String(current?.canal || "");
    await API.slackOutboxUpdate(row, canal, channel_id, mensaje);
  }, 420);

  $$('textarea[data-field="mensaje"]', box).forEach(tx => {
    tx.oninput = async (ev) => {
      const row = safeInt(ev.target.dataset.outboxRow);
      try {
        await debouncedSave(row, ev.target.value || "");
      } catch (e) {
        // silencioso para no spamear; se ve en el toast al blur
      }
    };
    tx.onblur = async (ev) => {
      const row = safeInt(ev.target.dataset.outboxRow);
      try {
        await API.slackOutboxUpdate(
          row,
          String((STATE.outbox || []).find(x => x.row === row)?.canal || ""),
          String((STATE.outbox || []).find(x => x.row === row)?.channel_id || ""),
          ev.target.value || ""
        );
        toast("Mensaje guardado");
        await refreshOutboxOnly();
      } catch (e) {
        toast(e.message, true);
      }
    };
  });

  // copy
  $$('button[data-action="copy"]', box).forEach(btn => {
    btn.onclick = async (ev) => {
      const row = safeInt(ev.target.dataset.row);
      const current = (STATE.outbox || []).find(x => x.row === row);
      const msg = current?.mensaje || "";
      try {
        await navigator.clipboard.writeText(msg);
        toast("Copiado");
      } catch {
        toast("No se pudo copiar", true);
      }
    };
  });

  // send row
  $$('button[data-action="send"]', box).forEach(btn => {
    btn.onclick = async (ev) => {
      const row = safeInt(ev.target.dataset.row);
      try {
        await API.slackOutboxEnviar(row);
        toast("Enviado");
        await refreshOutboxOnly();
      } catch (e) {
        toast(e.message, true);
      }
    };
  });
}

async function onGenerarPlan() {
  $("#opStatus").textContent = "Generando planificación…";
  try {
    await API.planificacionGenerar();
    toast("Planificación generada");
    STATE.plan = await API.planificacionList();
    renderPlan();
  } catch (e) {
    toast(e.message, true);
  } finally {
    $("#opStatus").textContent = "";
  }
}

async function onGenerarOutbox() {
  $("#opStatus").textContent = "Generando Outbox…";
  try {
    await API.slackOutboxGenerar();
    toast("Outbox generado");
    await refreshOutboxOnly();
  } catch (e) {
    toast(e.message, true);
  } finally {
    $("#opStatus").textContent = "";
  }
}

async function onEnviarTodos() {
  $("#opStatus").textContent = "Enviando…";
  try {
    await API.slackOutboxEnviar(); // sin row => envía todos pendientes
    toast("Envío masivo ejecutado");
    await refreshOutboxOnly();
  } catch (e) {
    toast(e.message, true);
  } finally {
    $("#opStatus").textContent = "";
  }
}

/* -----------------------------
   Components: Colaboradores
------------------------------ */
function viewColaboradores() {
  return `
    <div class="card">
      <div class="sectionTitle">Colaboradores</div>
      <div class="muted2">Listado desde la hoja Colaboradores (via backend).</div>

      <div class="sep"></div>

      <div class="toolbar">
        <div class="pillMini">Total: <strong>${STATE.colaboradores.length}</strong></div>
        <input id="colabSearch" placeholder="Buscar por nombre / ID / equipo / rol…" style="max-width: 420px;" />
      </div>

      <div class="sep"></div>

      <div id="colabTable"></div>
    </div>
  `;
}

function wireColaboradores() {
  const input = $("#colabSearch");
  const renderTable = () => {
    const q = norm(input?.value || "");
    const rows = (STATE.colaboradores || []).filter(c => {
      if (!q) return true;
      const blob = [
        c.id_meli, c.nombre, c.equipo, c.rol, c.ubicacion, c.slack_id
      ].map(x => norm(x)).join(" ");
      return blob.includes(q);
    });

    $("#colabTable").innerHTML = `
      <div class="tableWrap">
        <table>
          <thead>
            <tr>
              <th style="width:170px;">ID_MELI</th>
              <th style="width:280px;">Nombre</th>
              <th style="width:220px;">Equipo</th>
              <th style="width:220px;">Rol</th>
              <th style="width:180px;">Ubicación</th>
              <th style="width:180px;">Slack_ID</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(c => `
              <tr>
                <td class="mono">${escapeHtml(c.id_meli || "")}</td>
                <td>${escapeHtml(c.nombre || "")}</td>
                <td>${escapeHtml(c.equipo || "")}</td>
                <td>${escapeHtml(c.rol || "")}</td>
                <td>${escapeHtml(c.ubicacion || "")}</td>
                <td class="mono">${escapeHtml(c.slack_id || "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="muted2" style="margin-top:10px;">Mostrando: ${rows.length}</div>
    `;
  };

  if (input) input.oninput = debounce(renderTable, 120);
  renderTable();
}

/* -----------------------------
   Components: Habilitaciones
------------------------------ */
function viewHabilitaciones() {
  const hab = STATE.hab;
  if (!hab || hab?._error) {
    return `
      <div class="card">
        <div class="sectionTitle">Habilitaciones</div>
        <div class="errorBox">No pude cargar habilitaciones. ${escapeHtml(hab?._error || "Verificá backend/hoja.")}</div>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="sectionTitle">Habilitaciones</div>
      <div class="muted2">Matriz por colaborador y flujo (H_ / F_ en la hoja Habilitaciones).</div>

      <div class="sep"></div>

      <div class="toolbar">
        <div class="pillMini">Flujos: <strong>${hab.flujos.length}</strong></div>
        <div class="pillMini">Colaboradores: <strong>${hab.rows.length}</strong></div>
        <input id="habSearch" placeholder="Buscar por nombre / ID / equipo…" style="max-width: 420px;" />
        <select id="habFlujoFilter" style="max-width: 320px;">
          <option value="">Ver: todos los flujos</option>
          ${hab.flujos.map(f => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("")}
        </select>
        <div class="right muted2" id="habStatus"></div>
      </div>

      <div class="sep"></div>

      <div id="habTable"></div>
    </div>
  `;
}

function wireHabilitaciones() {
  const hab = STATE.hab;
  if (!hab || hab?._error) return;

  const search = $("#habSearch");
  const filtro = $("#habFlujoFilter");
  const status = $("#habStatus");

  const renderTable = () => {
    const q = norm(search?.value || "");
    const onlyFlujo = (filtro?.value || "").trim();

    const rows = (hab.rows || []).filter(r => {
      if (!q) return true;
      const blob = [r.id_meli, r.nombre, r.equipo, r.rol, r.ubicacion].map(x => norm(x)).join(" ");
      return blob.includes(q);
    });

    const flujos = onlyFlujo ? [onlyFlujo] : (hab.flujos || []);

    const headCols = flujos.map(f => `
      <th style="min-width: 220px;">${escapeHtml(f)}</th>
    `).join("");

    const body = rows.map(r => {
      const cols = flujos.map(f => {
        const cell = r.perFlujo?.[f] || { habilitado: false, fijo: false };
        return `
          <td>
            <div class="row" style="gap:14px;">
              <label class="switch">
                <input type="checkbox" data-kind="habilitado" data-id="${escapeHtml(r.id_meli)}" data-flujo="${escapeHtml(f)}" ${cell.habilitado ? "checked" : ""} />
                <span class="small">Habilitado</span>
              </label>
              <label class="switch">
                <input type="checkbox" data-kind="fijo" data-id="${escapeHtml(r.id_meli)}" data-flujo="${escapeHtml(f)}" ${cell.fijo ? "checked" : ""} />
                <span class="small">Fijo</span>
              </label>
            </div>
          </td>
        `;
      }).join("");

      return `
        <tr>
          <td class="mono">${escapeHtml(r.id_meli || "")}</td>
          <td>${escapeHtml(r.nombre || "")}</td>
          <td>${escapeHtml(r.equipo || "")}</td>
          ${cols}
        </tr>
      `;
    }).join("");

    $("#habTable").innerHTML = `
      <div class="tableWrap">
        <table>
          <thead>
            <tr>
              <th style="width:160px;">ID_MELI</th>
              <th style="width:260px;">Nombre</th>
              <th style="width:220px;">Equipo</th>
              ${headCols}
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <div class="muted2" style="margin-top:10px;">Mostrando: ${rows.length}</div>
    `;

    // wire toggles
    $$('input[type="checkbox"][data-kind]', $("#habTable")).forEach(chk => {
      chk.onchange = async (ev) => {
        const idMeli = ev.target.dataset.id;
        const flujo = ev.target.dataset.flujo;
        const kind = ev.target.dataset.kind;
        const value = ev.target.checked;

        status.textContent = `Guardando ${idMeli} / ${flujo}…`;

        try {
          if (kind === "habilitado") {
            await API.habilitacionesSet(idMeli, flujo, value, undefined);
          } else {
            await API.habilitacionesSet(idMeli, flujo, undefined, value);
          }
          toast("Guardado");
          await refreshHabilitacionesOnly(); // refresca matriz (verdad fuente)
        } catch (e) {
          toast(e.message, true);
          // rollback visual
          ev.target.checked = !value;
        } finally {
          status.textContent = "";
        }
      };
    });
  };

  if (search) search.oninput = debounce(renderTable, 120);
  if (filtro) filtro.onchange = renderTable;

  renderTable();
}

/* -----------------------------
   Components: Presentismo
------------------------------ */
function viewPresentismo() {
  const date = STATE.pres.date || fmtYMD(new Date());
  const stats = STATE.pres.stats;
  const week = STATE.pres.week;

  const statsBox = (() => {
    if (!stats || stats?._error) {
      return `<div class="errorBox">No pude cargar stats. ${escapeHtml(stats?._error || "")}</div>`;
    }
    return `
      <div class="kpi" style="margin-top:10px;">
        <div class="k"><div class="muted2">Fecha</div><div class="v mono">${escapeHtml(stats.date || date)}</div></div>
        <div class="k"><div class="muted2">Presentes (P)</div><div class="v">${safeInt(stats.presentes, 0)}</div></div>
        <div class="k"><div class="muted2">Licencias</div><div class="v">${safeInt(stats.licencias, 0)}</div></div>
        <div class="k"><div class="muted2">Sin marca</div><div class="v">${safeInt(stats.sin_marca, 0)}</div></div>
      </div>
    `;
  })();

  const weekBox = (() => {
    if (!week || week?._error) {
      return `<div class="errorBox">No pude cargar semana. ${escapeHtml(week?._error || "")}</div>`;
    }
    const labels = week.labels || [];
    const rows = week.rows || [];
    return `
      <div class="muted2" style="margin-top:10px;">
        Semana: <span class="mono">${escapeHtml(week.from || "")}</span> → <span class="mono">${escapeHtml(week.to || "")}</span>
      </div>

      <div class="tableWrap" style="margin-top:10px;">
        <table>
          <thead>
            <tr>
              <th style="width:200px;">Colaborador</th>
              <th style="width:160px;">ID_MELI</th>
              ${labels.map(l => `<th style="min-width: 140px;">${escapeHtml(l)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${escapeHtml(r.nombre || "")}</td>
                <td class="mono">${escapeHtml(r.id_meli || "")}</td>
                ${(r.dias || []).map(v => `<td class="mono">${escapeHtml(v || "")}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  })();

  return `
    <div class="hubGrid2">
      <div class="card">
        <div class="sectionTitle">Presentismo</div>
        <div class="muted2">Vista semanal + stats del día. También podés cargar licencias.</div>

        <div class="sep"></div>

        <div class="toolbar">
          <div class="pillMini">Fecha</div>
          <input id="presDate" value="${escapeHtml(date)}" class="mono" style="max-width: 200px;" />
          <button id="btnPresLoad" class="btn">Cargar</button>
          <div class="right muted2" id="presStatus"></div>
        </div>

        ${statsBox}

        <div class="sep"></div>

        <div class="sectionTitle">Semana</div>
        ${weekBox}
      </div>

      <div class="card">
        <div class="sectionTitle">Cargar licencia</div>
        <div class="muted2">Esto llama <span class="mono">presentismo.licencias.set</span> (desde/hasta, tipo).</div>

        <div class="sep"></div>

        <div class="row" style="gap:10px;">
          <div style="flex:1;">
            <div class="small">Colaborador</div>
            <select id="licId">
              ${STATE.colaboradores.map(c => `
                <option value="${escapeHtml(c.id_meli)}">${escapeHtml(`${c.nombre || c.id_meli} (${c.id_meli})`)}</option>
              `).join("")}
            </select>
          </div>
        </div>

        <div class="row" style="gap:10px; margin-top:10px;">
          <div style="flex:1;">
            <div class="small">Desde (YYYY-MM-DD)</div>
            <input id="licDesde" value="${escapeHtml(date)}" class="mono" />
          </div>
          <div style="flex:1;">
            <div class="small">Hasta (YYYY-MM-DD)</div>
            <input id="licHasta" value="${escapeHtml(date)}" class="mono" />
          </div>
        </div>

        <div class="row" style="gap:10px; margin-top:10px;">
          <div style="flex:1;">
            <div class="small">Tipo</div>
            <select id="licTipo">
              <option value="E">E — Enfermedad</option>
              <option value="M">M — Médico</option>
              <option value="MM">MM — Med. / Extendido</option>
              <option value="AI">AI — Ausencia Injustificada</option>
              <option value="V">V — Vacaciones</option>
            </select>
          </div>
        </div>

        <div class="sep"></div>

        <div class="toolbar">
          <button id="btnLicSave" class="btn primary">Guardar licencia</button>
          <div class="muted2 right" id="licStatus"></div>
        </div>

        <div class="sep"></div>

        <div class="muted2">
          Si esto falla: tu backend exige que exista la hoja <span class="mono">Presentismo</span> y que los IDs coincidan.
          Si te devuelve “Unauthorized”, tu Netlify env no está inyectando el token.
        </div>
      </div>
    </div>
  `;
}

function wirePresentismo() {
  const presDate = $("#presDate");
  const presStatus = $("#presStatus");

  $("#btnPresLoad").onclick = async () => {
    const d = (presDate.value || "").trim();
    presStatus.textContent = "Cargando…";
    try {
      await loadPresentismo(d);
      toast("Presentismo actualizado");
      render();
    } catch (e) {
      toast(e.message, true);
    } finally {
      presStatus.textContent = "";
    }
  };

  const licStatus = $("#licStatus");
  $("#btnLicSave").onclick = async () => {
    const idMeli = ($("#licId").value || "").trim();
    const desde = ($("#licDesde").value || "").trim();
    const hasta = ($("#licHasta").value || "").trim();
    const tipo = ($("#licTipo").value || "").trim();

    if (!idMeli) return toast("Elegí un colaborador", true);
    if (!desde) return toast("Desde requerido", true);
    if (!tipo) return toast("Tipo requerido", true);

    licStatus.textContent = "Guardando…";
    try {
      await rawPost("presentismo.licencias.set", { idMeli, desde, hasta, tipo });
      toast("Licencia guardada");
      await loadPresentismo(STATE.pres.date);
      render();
    } catch (e) {
      toast(e.message, true);
    } finally {
      licStatus.textContent = "";
    }
  };
}

/* -----------------------------
   Components: Dashboard (placeholder realista)
------------------------------ */
function viewDashboard() {
  // No invento endpoints que no existen: dejo dashboard “básico” con lo que hoy ya tenés.
  const pres = STATE.pres.stats && !STATE.pres.stats?._error ? STATE.pres.stats : null;
  const planCount = (STATE.plan || []).filter(r => String(r.flujo || "").trim()).length;
  const outPend = (STATE.outbox || []).filter(r => !String(r.estado || "").toUpperCase().startsWith("ENVIADO")).length;

  return `
    <div class="card">
      <div class="sectionTitle">Dashboard</div>
      <div class="muted2">Indicadores rápidos. (Productividad/Calidad: los sumamos cuando tengas endpoints o fuentes listas).</div>

      <div class="sep"></div>

      <div class="kpi">
        <div class="k">
          <div class="muted2">Planificación (rows)</div>
          <div class="v">${planCount}</div>
        </div>
        <div class="k">
          <div class="muted2">Slack pendientes</div>
          <div class="v">${outPend}</div>
        </div>
        <div class="k">
          <div class="muted2">Presentes (hoy)</div>
          <div class="v">${pres ? safeInt(pres.presentes, 0) : "—"}</div>
        </div>
        <div class="k">
          <div class="muted2">Licencias (hoy)</div>
          <div class="v">${pres ? safeInt(pres.licencias, 0) : "—"}</div>
        </div>
      </div>

      <div class="sep"></div>

      <div class="sectionTitle">Siguientes pasos (sin humo)</div>
      <div class="muted2">
        <ul>
          <li><span class="mono">productividad.summary</span> (GET): tasks, tareas/día, por flujo, por colaborador.</li>
          <li><span class="mono">calidad.pm.summary</span> (GET): efectividad por semana y usuario (ya tenés recalcular en el script “inspiración”).</li>
          <li>Cuando existan, los enchufamos acá con cards + tablas + filtros.</li>
        </ul>
      </div>
    </div>
  `;
}
function wireDashboard() {}

/* -----------------------------
   Refresh helpers
------------------------------ */
async function refreshFlujosOnly() {
  STATE.flujos = await API.flujosList();
  renderFlujos();
}
async function refreshOutboxOnly() {
  STATE.outbox = await API.slackOutboxList();
  renderOutbox();
}
async function refreshHabilitacionesOnly() {
  try {
    STATE.hab = await API.habilitacionesList();
    if (STATE.view === "habilitaciones") render();
  } catch (e) {
    toast(e.message, true);
  }
}

/* -----------------------------
   Init
------------------------------ */
(async function init() {
  try {
    STATE.loading = true;
    render();

    await loadCommon();
    await Promise.all([
      loadOperativa(),
      loadHabilitaciones().catch((e) => (STATE.hab = { _error: e.message })),
      loadPresentismo(STATE.pres.date).catch((e) => {
        STATE.pres.week = { _error: e.message };
        STATE.pres.stats = { _error: e.message };
      }),
    ]);
  } catch (e) {
    $("#app").innerHTML = `<div class="errorBox">Error inicial: ${escapeHtml(e.message)}</div>`;
    return;
  } finally {
    STATE.loading = false;
    render();
  }
})();
