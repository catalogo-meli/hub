// app.js (ESM)
import { API } from "./api.js";

const $ = (sel) => document.querySelector(sel);

let BUSY = false;
function setBusy(v) {
  BUSY = !!v;
  document.querySelectorAll("button").forEach(b => (b.disabled = BUSY));
}

function toast(msg, isError = false) {
  const el = $("#toast");
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

function by(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

let STATE = {
  canales: [],
  canalesById: new Map(),
  flujos: [],
  plan: [],
  outbox: [],
};

async function loadAll() {
  const [canales, flujos, plan, outbox] = await Promise.all([
    API.canalesList(),
    API.flujosList(),
    API.planificacionList().catch(() => []),
    API.slackOutboxList().catch(() => []),
  ]);

  STATE.canales = canales || [];
  STATE.canalesById = new Map(STATE.canales.map(c => [String(c.channel_id), c.canal]));
  STATE.flujos = flujos || [];
  STATE.plan = plan || [];
  STATE.outbox = outbox || [];

  $("#lastLoad").textContent = new Date().toLocaleString();
}

function render() {
  const app = $("#app");
  app.innerHTML = `
    <div class="sectionTitle">1) Flujos (Perfiles requeridos)</div>
    <div class="muted">Se guarda al cambiar Slack channel o Perfiles requeridos.</div>

    <div class="grid3 gridFlujosHead" style="margin-top:12px;">
      <div class="small">Flujo</div>
      <div class="small">Slack channel</div>
      <div class="small">Perfiles requeridos</div>
    </div>

    <div id="flujosList" style="margin-top:10px;"></div>

    <div class="row" style="margin-top:12px;">
      <button id="btnPlan" class="btn primary">Generar planificación</button>
      <button id="btnOutbox" class="btn">Generar Outbox</button>
      <button id="btnSendAll" class="btn success">Enviar todos</button>
      <div id="opStatus" class="muted"></div>
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

  renderFlujos();
  renderPlan();
  renderOutbox();

  $("#btnPlan").onclick = onGenerarPlan;
  $("#btnOutbox").onclick = onGenerarOutbox;
  $("#btnSendAll").onclick = onEnviarTodos;
}

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

function renderFlujos() {
  const wrap = $("#flujosList");
  const rows = STATE.flujos.slice().sort((a,b)=>String(a.flujo).localeCompare(String(b.flujo)));

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
          value="${Number(f.perfiles_requeridos || 0)}" />
        <button class="btn danger" data-action="delete" data-flujo="${escapeHtml(f.flujo)}">Borrar</button>
      </div>
    </div>
  `).join("") + `
    <div class="grid3" style="gap:10px; margin-top: 16px;">
      <input id="newFlujo" placeholder="+ Nuevo flujo…" />
      <select id="newChannel">
        ${canalesOptions("")}
      </select>
      <div class="row" style="gap:10px;">
        <input id="newPerfiles" type="number" min="0" value="0" />
        <button id="btnAddFlujo" class="btn primary">Agregar</button>
      </div>
    </div>
  `;

  // autosave handlers
  wrap.querySelectorAll('select[data-field="channel_id"]').forEach(sel => {
    sel.onchange = async (ev) => {
      const flujo = ev.target.dataset.flujo;
      const channel_id = ev.target.value;
      const current = STATE.flujos.find(x => x.flujo === flujo);
      const perfiles = Number(current?.perfiles_requeridos || 0);

      try {
        setBusy(true);
        await API.flujosUpsert(flujo, perfiles, channel_id);
        toast(`Guardado: ${flujo}`);
        await refreshFlujosOnly();
      } catch (e) {
        toast(e.message, true);
      } finally {
        setBusy(false);
      }
    };
  });

  wrap.querySelectorAll('input[data-field="perfiles"]').forEach(inp => {
    inp.onchange = async (ev) => {
      const flujo = ev.target.dataset.flujo;
      const perfiles = Number(ev.target.value || 0);
      const current = STATE.flujos.find(x => x.flujo === flujo);
      const channel_id = String(current?.channel_id || "");

      try {
        setBusy(true);
        await API.flujosUpsert(flujo, perfiles, channel_id);
        toast(`Guardado: ${flujo}`);
        await refreshFlujosOnly();
      } catch (e) {
        toast(e.message, true);
      } finally {
        setBusy(false);
      }
    };
  });

  wrap.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.onclick = async (ev) => {
      const flujo = ev.target.dataset.flujo;
      try {
        setBusy(true);
        await API.flujosDelete(flujo);
        toast(`Borrado: ${flujo}`);
        await reloadAndRender();
      } catch (e) {
        toast(e.message, true);
      } finally {
        setBusy(false);
      }
    };
  });

  $("#btnAddFlujo").onclick = async () => {
    const flujo = ($("#newFlujo").value || "").trim();
    const channel_id = ($("#newChannel").value || "").trim();
    const perfiles = Number($("#newPerfiles").value || 0);

    if (!flujo) return toast("Flujo requerido", true);
    if (!channel_id) return toast("Slack channel requerido", true);
    if (Number.isNaN(perfiles) || perfiles < 0) return toast("Perfiles inválidos", true);

    try {
      setBusy(true);
      await API.flujosUpsert(flujo, perfiles, channel_id);
      toast("Flujo agregado");
      await reloadAndRender();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  };
}

function renderPlan() {
  const box = $("#planBox");
  if (!STATE.plan || STATE.plan.length === 0) {
    box.innerHTML = `<div class="muted">Sin planificación cargada.</div>`;
    return;
  }

  const grouped = by(STATE.plan, x => String(x.flujo || ""));
  const cards = [];

  const flujosOrden = Array.from(grouped.keys()).sort((a,b)=>a.localeCompare(b));

  for (const flujo of flujosOrden) {
    const items = grouped.get(flujo) || [];
    const nombres = items.map(x => x.nombre).filter(Boolean);
    const fijos = items.filter(x => x.es_fijo).map(x => x.nombre).filter(Boolean);

    cards.push(`
      <div class="card" style="margin: 10px 0;">
        <div style="font-weight:900; margin-bottom: 8px;">${escapeHtml(flujo)}</div>
        <div>${nombres.length ? escapeHtml(nombres.join(", ")) : `<span class="muted">•</span>`}</div>
        <div class="small" style="margin-top:6px;">
          Total: ${nombres.length}${fijos.length ? ` • Fijos: ${fijos.length}` : ""}
        </div>
      </div>
    `);
  }

  box.innerHTML = cards.join("");
}

function isEnviado(estado) {
  const s = String(estado || "").toUpperCase();
  return s.startsWith("ENVIADO");
}

function renderOutbox() {
  const box = $("#outboxBox");
  const rows = (STATE.outbox || []).filter(x => !isEnviado(x.estado));

  if (!rows.length) {
    box.innerHTML = `<div class="muted">Sin pendientes.</div>`;
    return;
  }

  box.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width:170px;">Fecha</th>
          <th style="width:220px;">Canal</th>
          <th>Mensaje</th>
          <th style="width:110px;">Estado</th>
          <th style="width:220px;">Error</th>
          <th style="width:120px;"></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${escapeHtml(String(r.fecha || ""))}</td>
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
  `;

  // Change channel => update outbox row
  box.querySelectorAll('select[data-field="channel_id"]').forEach(sel => {
    sel.onchange = async (ev) => {
      const row = Number(ev.target.dataset.outboxRow);
      const channel_id = ev.target.value;
      const canal = STATE.canalesById.get(String(channel_id)) || "";
      try {
        setBusy(true);
        await API.slackOutboxUpdate(row, canal, channel_id, "");
        toast("Outbox actualizado");
        await refreshOutboxOnly();
      } catch (e) {
        toast(e.message, true);
      } finally {
        setBusy(false);
      }
    };
  });

  // Change message => update outbox row (on blur)
  box.querySelectorAll('textarea[data-field="mensaje"]').forEach(tx => {
    tx.onblur = async (ev) => {
      const row = Number(ev.target.dataset.outboxRow);
      const mensaje = ev.target.value || "";
      const current = STATE.outbox.find(x => x.row === row);
      const channel_id = String(current?.channel_id || "");
      const canal = String(current?.canal || "");
      try {
        setBusy(true);
        await API.slackOutboxUpdate(row, canal, channel_id, mensaje);
        toast("Mensaje guardado");
      } catch (e) {
        toast(e.message, true);
      } finally {
        setBusy(false);
      }
    };
  });

  // Copy
  box.querySelectorAll('button[data-action="copy"]').forEach(btn => {
    btn.onclick = async (ev) => {
      const row = Number(ev.target.dataset.row);
      const current = STATE.outbox.find(x => x.row === row);
      const msg = current?.mensaje || "";
      try {
        await navigator.clipboard.writeText(msg);
        toast("Copiado");
      } catch {
        toast("No se pudo copiar", true);
      }
    };
  });

  // Send row
  box.querySelectorAll('button[data-action="send"]').forEach(btn => {
    btn.onclick = async (ev) => {
      const row = Number(ev.target.dataset.row);
      try {
        setBusy(true);
        await API.slackOutboxEnviar(row);
        toast("Enviado");
        await refreshOutboxOnly();
      } catch (e) {
        toast(e.message, true);
      } finally {
        setBusy(false);
      }
    };
  });
}

async function onGenerarPlan() {
  $("#opStatus").textContent = "Generando planificación…";
  try {
    setBusy(true);
    await API.planificacionGenerar();
    toast("Planificación generada");
    STATE.plan = await API.planificacionList();
    renderPlan();
  } catch (e) {
    toast(e.message, true);
  } finally {
    $("#opStatus").textContent = "";
    setBusy(false);
  }
}

async function onGenerarOutbox() {
  $("#opStatus").textContent = "Generando Outbox…";
  try {
    setBusy(true);
    await API.slackOutboxGenerar();
    toast("Outbox generado");
    await refreshOutboxOnly();
  } catch (e) {
    toast(e.message, true);
  } finally {
    $("#opStatus").textContent = "";
    setBusy(false);
  }
}

async function onEnviarTodos() {
  $("#opStatus").textContent = "Enviando…";
  try {
    setBusy(true);
    await API.slackOutboxEnviar();
    toast("Envío masivo ejecutado");
    await refreshOutboxOnly();
  } catch (e) {
    toast(e.message, true);
  } finally {
    $("#opStatus").textContent = "";
    setBusy(false);
  }
}

async function refreshFlujosOnly() {
  STATE.flujos = await API.flujosList();
  renderFlujos();
}

async function refreshOutboxOnly() {
  STATE.outbox = await API.slackOutboxList();
  renderOutbox();
}

async function reloadAndRender() {
  try {
    setBusy(true);
    await loadAll();
    render();
  } catch (e) {
    $("#app").innerHTML = `<div class="errorBox">Error: ${escapeHtml(e.message)}</div>`;
  } finally {
    setBusy(false);
  }
}

async function health() {
  try {
    const h = await API.health();
    $("#healthPill").textContent = `OK • ${h.ts || "health"}`;
  } catch (e) {
    $("#healthPill").textContent = `ERROR`;
    toast(e.message, true);
  }
}

(async function init() {
  $("#btnHealth").onclick = health;
  await reloadAndRender();
  await health();
})();
