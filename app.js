// app.js (ESM) — HUB Catálogo
// Robusto (no revienta por nodos inexistentes), UX prolija, sin null crashes.
// Requiere: api.js exporte `API` (tu versión ya calza).

import { API } from "./api.js";

/* -----------------------------
 * DOM helpers (seguros)
 * ----------------------------- */
const qs = (sel, root = document) => root.querySelector(sel);

function must(sel, root = document) {
  const el = qs(sel, root);
  if (!el) throw new Error(`Falta el nodo requerido en el DOM: ${sel}`);
  return el;
}

function safeText(el, text) {
  if (!el) return;
  el.textContent = text ?? "";
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr || []) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

/* -----------------------------
 * Toast (crea contenedor si no existe)
 * ----------------------------- */
function ensureToastEl() {
  let el = qs("#toast");
  if (el) return el;

  el = document.createElement("div");
  el.id = "toast";
  el.className = "toast";
  document.body.appendChild(el);
  return el;
}

function toast(msg, isError = false) {
  const el = ensureToastEl();
  safeText(el, msg);

  el.classList.add("show");
  el.style.borderColor = isError ? "rgba(255,70,70,.35)" : "rgba(255,255,255,.14)";
  el.style.background = isError ? "rgba(80,10,10,.85)" : "rgba(15,20,30,.85)";

  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove("show"), isError ? 5200 : 2600);
}

/* -----------------------------
 * Estado
 * ----------------------------- */
const STATE = {
  canales: [], // [{canal, channel_id}]
  canalesById: new Map(), // channel_id -> canal
  flujos: [], // [{flujo, perfiles_requeridos, channel_id}]
  plan: [], // [{fecha, flujo, nombre/id}]
  outbox: [], // [{row, fecha, canal, channel_id, mensaje, estado, error}]
  busy: { loading: false, plan: false, outbox: false, sendAll: false },
};

/* -----------------------------
 * Normalizadores
 * ----------------------------- */
function normCanalRow(r) {
  return {
    canal: String(r?.canal ?? r?.Canal ?? r?.name ?? "").trim(),
    channel_id: String(r?.channel_id ?? r?.Channel_ID ?? r?.Slack_channel ?? r?.Slack_Channel_ID ?? r?.id ?? "").trim(),
  };
}

function normFlujoRow(r) {
  return {
    flujo: String(r?.flujo ?? r?.Flujo ?? "").trim(),
    perfiles_requeridos: Number(r?.perfiles_requeridos ?? r?.Perfiles_requeridos ?? r?.perfiles ?? 0) || 0,
    channel_id: String(r?.channel_id ?? r?.Channel_ID ?? r?.Slack_channel ?? r?.Slack_Channel_ID ?? "").trim(),
  };
}

function normPlanRow(r) {
  return {
    fecha: r?.fecha ?? r?.Fecha ?? "",
    flujo: String(r?.flujo ?? r?.Flujo ?? "").trim(),
    nombre: String(r?.nombre ?? r?.Nombre ?? r?.ID_MELI ?? "").trim(),
    id_meli: String(r?.id_meli ?? r?.ID_MELI ?? "").trim(),
    es_fijo: String(r?.es_fijo ?? r?.Es_Fijo ?? "").trim(),
  };
}

function normOutboxRow(r) {
  return {
    row: Number(r?.row ?? r?.Row ?? r?.fila ?? r?.Fila ?? 0) || 0,
    fecha: r?.fecha ?? r?.Fecha ?? "",
    canal: String(r?.canal ?? r?.Canal ?? "").trim(),
    channel_id: String(r?.channel_id ?? r?.Channel_ID ?? r?.Slack_channel_id ?? r?.Slack_Channel_ID ?? "").trim(),
    mensaje: String(r?.mensaje ?? r?.Mensaje ?? "").trim(),
    estado: String(r?.estado ?? r?.Estado ?? "").trim(),
    error: String(r?.error ?? r?.Error ?? "").trim(),
  };
}

/* -----------------------------
 * Render base
 * ----------------------------- */
function renderShell() {
  const app = must("#app");

  app.innerHTML = `
    <div class="sectionTitle">1) Flujos (Perfiles requeridos)</div>
    <div class="muted">Se guarda al cambiar Slack channel o Perfiles requeridos.</div>

    <div class="grid3 gridFlujosHead" style="margin-top:12px;">
      <div class="small">Flujo</div>
      <div class="small">Slack channel</div>
      <div class="small">Perfiles requeridos</div>
    </div>

    <div id="flujosList" style="margin-top:10px;"></div>

    <div class="row" style="margin-top:12px; align-items:center; flex-wrap:wrap; gap:10px;">
      <button id="btnPlan" class="btn primary">Generar planificación</button>
      <button id="btnOutbox" class="btn">Generar Outbox</button>
      <button id="btnSendAll" class="btn success">Enviar todos</button>
      <div id="opStatus" class="muted" style="margin-left:6px;"></div>
    </div>

    <div class="sep"></div>

    <div class="sectionTitle">2) Planificación (resultado)</div>
    <div class="muted">Agrupado por flujo.</div>
    <div id="planBox" style="margin-top:10px;"></div>

    <div class="sep"></div>

    <div class="sectionTitle">3) Slack Outbox (pendientes)</div>
    <div class="muted">Editá canal/mensaje y enviá por fila o “Enviar todos”.</div>
    <div id="outboxBox" style="margin-top:10px;"></div>
  `;
}

function renderButtonsState() {
  const btnPlan = qs("#btnPlan");
  const btnOut = qs("#btnOutbox");
  const btnSend = qs("#btnSendAll");
  const op = qs("#opStatus");

  if (btnPlan) btnPlan.disabled = STATE.busy.plan || STATE.busy.loading;
  if (btnOut) btnOut.disabled = STATE.busy.outbox || STATE.busy.loading;
  if (btnSend) btnSend.disabled = STATE.busy.sendAll || STATE.busy.loading;

  if (!op) return;

  if (STATE.busy.loading) safeText(op, "Cargando…");
  else if (STATE.busy.plan) safeText(op, "Generando planificación…");
  else if (STATE.busy.outbox) safeText(op, "Generando Outbox…");
  else if (STATE.busy.sendAll) safeText(op, "Enviando…");
  else safeText(op, "");
}

function canalesOptions(selectedChannelId) {
  const sel = String(selectedChannelId || "").trim();
  const opts = [`<option value="">—</option>`].concat(
    (STATE.canales || []).map((c) => {
      const v = String(c.channel_id || "").trim();
      const label = String(c.canal || "").trim();
      const s = v && v === sel ? "selected" : "";
      return `<option value="${escapeHtml(v)}" ${s}>${escapeHtml(label)}</option>`;
    })
  );
  return opts.join("");
}

/* -----------------------------
 * Flujos
 * ----------------------------- */
function renderFlujos() {
  const wrap = must("#flujosList");
  const rows = (STATE.flujos || [])
    .slice()
    .filter((f) => f.flujo)
    .sort((a, b) => String(a.flujo).localeCompare(String(b.flujo)));

  wrap.innerHTML = `
    ${rows
      .map(
        (f) => `
      <div class="grid3" style="gap:10px; margin: 10px 0;">
        <div class="pill"><strong>${escapeHtml(f.flujo)}</strong></div>

        <div>
          <select data-flujo="${escapeHtml(f.flujo)}" data-field="channel_id">
            ${canalesOptions(f.channel_id)}
          </select>
        </div>

        <div class="row" style="gap:10px; flex-wrap:wrap;">
          <input data-flujo="${escapeHtml(f.flujo)}" data-field="perfiles_requeridos" type="number" min="0"
            value="${Number(f.perfiles_requeridos || 0)}" />
          <button class="btn danger" data-action="delete" data-flujo="${escapeHtml(f.flujo)}">Borrar</button>
        </div>
      </div>
    `
      )
      .join("")}

    <div class="grid3" style="gap:10px; margin-top: 16px;">
      <input id="newFlujo" placeholder="+ Nuevo flujo…" />
      <select id="newChannel">
        ${canalesOptions("")}
      </select>
      <div class="row" style="gap:10px; flex-wrap:wrap;">
        <input id="newPerfiles" type="number" min="0" value="0" />
        <button id="btnAddFlujo" class="btn primary">Agregar</button>
      </div>
    </div>
  `;

  wrap.onchange = async (ev) => {
    const t = ev.target;

    // change channel
    if (t && t.matches('select[data-field="channel_id"]')) {
      const flujo = t.dataset.flujo;
      const channel_id = String(t.value || "").trim();
      const current = (STATE.flujos || []).find((x) => x.flujo === flujo);
      const perfiles_requeridos = Number(current?.perfiles_requeridos || 0);

      try {
        await API.flujosUpsert(flujo, perfiles_requeridos, channel_id);
        toast(`Guardado: ${flujo}`);
        await refreshFlujosOnly();
      } catch (e) {
        toast(e.message || String(e), true);
      }
    }

    // change perfiles_requeridos
    if (t && t.matches('input[data-field="perfiles_requeridos"]')) {
      const flujo = t.dataset.flujo;
      const perfiles_requeridos = Number(t.value || 0);
      const current = (STATE.flujos || []).find((x) => x.flujo === flujo);
      const channel_id = String(current?.channel_id || "");

      if (Number.isNaN(perfiles_requeridos) || perfiles_requeridos < 0) return toast("Perfiles inválidos", true);

      try {
        await API.flujosUpsert(flujo, perfiles_requeridos, channel_id);
        toast(`Guardado: ${flujo}`);
        await refreshFlujosOnly();
      } catch (e) {
        toast(e.message || String(e), true);
      }
    }
  };

  wrap.onclick = async (ev) => {
    const t = ev.target;

    // delete
    if (t && t.matches('button[data-action="delete"]')) {
      const flujo = t.dataset.flujo;
      try {
        await API.flujosDelete(flujo);
        toast(`Borrado: ${flujo}`);
        await reloadAndRender();
      } catch (e) {
        toast(e.message || String(e), true);
      }
      return;
    }

    // add
    if (t && t.id === "btnAddFlujo") {
      const flujo = String(qs("#newFlujo")?.value || "").trim();
      const channel_id = String(qs("#newChannel")?.value || "").trim();
      const perfiles_requeridos = Number(qs("#newPerfiles")?.value || 0);

      if (!flujo) return toast("Flujo requerido", true);
      if (!channel_id) return toast("Slack channel requerido", true);
      if (Number.isNaN(perfiles_requeridos) || perfiles_requeridos < 0) return toast("Perfiles inválidos", true);

      try {
        await API.flujosUpsert(flujo, perfiles_requeridos, channel_id);
        toast("Flujo agregado");
        await reloadAndRender();
      } catch (e) {
        toast(e.message || String(e), true);
      }
    }
  };
}

/* -----------------------------
 * Planificación
 * ----------------------------- */
function renderPlan() {
  const box = must("#planBox");
  const plan = (STATE.plan || []).map(normPlanRow).filter((r) => r.flujo);

  if (!plan.length) {
    box.innerHTML = `<div class="muted">Sin planificación cargada.</div>`;
    return;
  }

  const grouped = groupBy(plan, (x) => String(x.flujo || ""));
  const flujosOrden = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

  const cards = flujosOrden.map((flujo) => {
    const items = grouped.get(flujo) || [];
    const list = items
      .map((x) => x.nombre || x.id_meli || "")
      .map((s) => String(s).trim())
      .filter(Boolean);

    return `
      <div class="card" style="margin: 10px 0;">
        <div style="font-weight:800; margin-bottom: 8px;">${escapeHtml(flujo)}</div>
        <div style="word-break: break-word;">${list.length ? escapeHtml(list.join(", ")) : `<span class="muted">•</span>`}</div>
        <div class="small" style="margin-top:6px;">Total: ${list.length}</div>
      </div>
    `;
  });

  box.innerHTML = cards.join("");
}

/* -----------------------------
 * Outbox
 * ----------------------------- */
function renderOutbox() {
  const box = must("#outboxBox");

  const rows = (STATE.outbox || [])
    .map(normOutboxRow)
    .filter((x) => String(x.estado || "").toUpperCase() !== "ENVIADO");

  if (!rows.length) {
    box.innerHTML = `<div class="muted">Sin pendientes.</div>`;
    return;
  }

  box.innerHTML = `
    <div style="overflow:auto; border:1px solid rgba(255,255,255,.08); border-radius:14px;">
      <table style="min-width: 980px; margin:0;">
        <thead>
          <tr>
            <th style="width:170px;">Fecha</th>
            <th style="width:220px;">Canal</th>
            <th>Mensaje</th>
            <th style="width:110px;">Estado</th>
            <th style="width:240px;">Error</th>
            <th style="width:120px;"></th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${escapeHtml(String(r.fecha || ""))}</td>

              <td>
                <select data-outbox-row="${r.row}" data-field="channel_id">
                  ${canalesOptions(r.channel_id)}
                </select>
              </td>

              <td>
                <textarea data-outbox-row="${r.row}" data-field="mensaje">${escapeHtml(r.mensaje || "")}</textarea>
                <div class="row" style="margin-top:8px; gap:10px; flex-wrap:wrap;">
                  <button class="btn" data-action="copy" data-row="${r.row}">Copiar</button>
                </div>
              </td>

              <td>${escapeHtml(String(r.estado || ""))}</td>

              <td>${r.error ? `<div class="errorBox">${escapeHtml(r.error)}</div>` : ""}</td>

              <td>
                <button class="btn primary" data-action="send" data-row="${r.row}">Enviar</button>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  box.onchange = async (ev) => {
    const t = ev.target;
    if (!t || !t.matches('select[data-field="channel_id"]')) return;

    const row = Number(t.dataset.outboxRow || 0);
    const channel_id = String(t.value || "").trim();
    const canal = STATE.canalesById.get(String(channel_id)) || "";

    try {
      await API.slackOutboxUpdate(row, canal, channel_id, "");
      toast("Outbox actualizado");
      await refreshOutboxOnly();
    } catch (e) {
      toast(e.message || String(e), true);
    }
  };

  box.addEventListener(
    "blur",
    async (ev) => {
      const t = ev.target;
      if (!t || !t.matches('textarea[data-field="mensaje"]')) return;

      const row = Number(t.dataset.outboxRow || 0);
      const mensaje = String(t.value || "");

      const current = (STATE.outbox || []).map(normOutboxRow).find((x) => x.row === row);
      const channel_id = String(current?.channel_id || "");
      const canal = String(current?.canal || "");

      try {
        await API.slackOutboxUpdate(row, canal, channel_id, mensaje);
      } catch (e) {
        toast(e.message || String(e), true);
      }
    },
    true
  );

  box.onclick = async (ev) => {
    const t = ev.target;
    if (!t) return;

    if (t.matches('button[data-action="copy"]')) {
      const row = Number(t.dataset.row || 0);
      const current = (STATE.outbox || []).map(normOutboxRow).find((x) => x.row === row);
      const msg = String(current?.mensaje || "");

      try {
        await navigator.clipboard.writeText(msg);
        toast("Copiado");
      } catch {
        toast("No se pudo copiar", true);
      }
      return;
    }

    if (t.matches('button[data-action="send"]')) {
      const row = Number(t.dataset.row || 0);
      try {
        await API.slackOutboxEnviar(row);
        toast("Enviado");
        await refreshOutboxOnly();
      } catch (e) {
        toast(e.message || String(e), true);
      }
      return;
    }
  };
}

/* -----------------------------
 * Loaders
 * ----------------------------- */
async function loadAll() {
  STATE.busy.loading = true;
  renderButtonsState();

  const [canales, flujos, plan, outbox] = await Promise.all([
    API.canalesList(),
    API.flujosList(),
    API.planificacionList().catch(() => []),
    API.slackOutboxList().catch(() => []),
  ]);

  STATE.canales = (canales || []).map(normCanalRow).filter((c) => c.canal || c.channel_id);
  STATE.canalesById = new Map(STATE.canales.map((c) => [String(c.channel_id), c.canal]));

  STATE.flujos = (flujos || []).map(normFlujoRow).filter((f) => f.flujo);

  STATE.plan = (plan || []).map(normPlanRow);
  STATE.outbox = (outbox || []).map(normOutboxRow);

  STATE.busy.loading = false;
  renderButtonsState();
}

/* -----------------------------
 * Acciones
 * ----------------------------- */
async function onGenerarPlan() {
  STATE.busy.plan = true;
  renderButtonsState();
  try {
    await API.planificacionGenerar();
    toast("Planificación generada");
    STATE.plan = (await API.planificacionList().catch(() => [])).map(normPlanRow);
    renderPlan();
  } catch (e) {
    toast(e.message || String(e), true);
  } finally {
    STATE.busy.plan = false;
    renderButtonsState();
  }
}

async function onGenerarOutbox() {
  STATE.busy.outbox = true;
  renderButtonsState();
  try {
    await API.slackOutboxGenerar();
    toast("Outbox generado");
    await refreshOutboxOnly();
  } catch (e) {
    toast(e.message || String(e), true);
  } finally {
    STATE.busy.outbox = false;
    renderButtonsState();
  }
}

async function onEnviarTodos() {
  STATE.busy.sendAll = true;
  renderButtonsState();
  try {
    await API.slackOutboxEnviar();
    toast("Envío masivo ejecutado");
    await refreshOutboxOnly();
  } catch (e) {
    toast(e.message || String(e), true);
  } finally {
    STATE.busy.sendAll = false;
    renderButtonsState();
  }
}

async function refreshFlujosOnly() {
  const flujos = await API.flujosList().catch(() => []);
  STATE.flujos = (flujos || []).map(normFlujoRow).filter((f) => f.flujo);
  renderFlujos();
}

async function refreshOutboxOnly() {
  const outbox = await API.slackOutboxList().catch(() => []);
  STATE.outbox = (outbox || []).map(normOutboxRow);
  renderOutbox();
}

/* -----------------------------
 * Bind top buttons (si existen)
 * ----------------------------- */
function bindTopButtons() {
  const btnHealth = qs("#btnHealth");
  const btnMode = qs("#btnMode");

  if (btnHealth) {
    btnHealth.onclick = async () => {
      try {
        const h = await API.health();
        toast(`OK: ${h?.ts || "health"}`);
      } catch (e) {
        toast(e.message || String(e), true);
      }
    };
  }

  if (btnMode) {
    btnMode.onclick = () => toast("Modo: pendiente.", false);
  }
}

/* -----------------------------
 * Boot
 * ----------------------------- */
async function reloadAndRender() {
  try {
    renderShell();
    bindTopButtons();

    const btnPlan = qs("#btnPlan");
    const btnOut = qs("#btnOutbox");
    const btnSend = qs("#btnSendAll");

    if (btnPlan) btnPlan.onclick = onGenerarPlan;
    if (btnOut) btnOut.onclick = onGenerarOutbox;
    if (btnSend) btnSend.onclick = onEnviarTodos;

    renderButtonsState();

    await loadAll();

    renderFlujos();
    renderPlan();
    renderOutbox();

    renderButtonsState();
  } catch (e) {
    const app = qs("#app");
    if (app) app.innerHTML = `<div class="errorBox">Error: ${escapeHtml(e.message || String(e))}</div>`;
    toast(e.message || String(e), true);
  }
}

function boot() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", reloadAndRender, { once: true });
  } else {
    reloadAndRender();
  }
}

boot();
