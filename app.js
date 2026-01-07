// app.js (ESM)
import { API } from "./api.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const VIEWS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "operativa", label: "Operativa diaria" },
  { id: "colaboradores", label: "Colaboradores" },
  { id: "habilitaciones", label: "Habilitaciones" },
  { id: "presentismo", label: "Presentismo" },
  { id: "productividad", label: "Productividad" },
  { id: "calidad", label: "Calidad" },
];

const state = {
  view: "dashboard",
  loading: false,
  cache: {
    colaboradores: null,
    flujos: null,
    canales: null,
    habilitaciones: null,
    planificacion: null,
    outbox: null,
    presentismoWeek: null,
    dashboard: null,
    productividad: null,
    calidad: null,
  },
};

init();

function init() {
  const fromHash = (location.hash || "").replace("#/", "");
  state.view = VIEWS.some(v => v.id === fromHash) ? fromHash : "dashboard";

  window.addEventListener("hashchange", () => {
    const v = (location.hash || "").replace("#/", "");
    state.view = VIEWS.some(x => x.id === v) ? v : "dashboard";
    render();
    bootView();
  });

  render();
  bootView();
}

function setView(id) {
  location.hash = `#/${id}`;
}

function ymdLocal(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toast(title, msg = "") {
  const host = $("#toast");
  const el = document.createElement("div");
  el.className = "t";
  el.innerHTML = `<b>${escapeHtml(title)}</b>${msg ? `<div>${escapeHtml(msg)}</div>` : ""}`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setLoading(on, label = "Cargando…") {
  state.loading = on;
  const app = $("#app");
  const old = $("#_loading");
  if (on) {
    if (!old) {
      const div = document.createElement("div");
      div.id = "_loading";
      div.className = "pill";
      div.style.position = "fixed";
      div.style.left = "18px";
      div.style.bottom = "18px";
      div.style.zIndex = "55";
      div.innerHTML = `⏳ <span>${escapeHtml(label)}</span>`;
      document.body.appendChild(div);
    } else {
      old.innerHTML = `⏳ <span>${escapeHtml(label)}</span>`;
    }
  } else {
    if (old) old.remove();
  }
  if (!app) return;
}

function openModal(title, bodyHtml, onMount) {
  const overlay = $("#overlay");
  const modal = $("#modal");
  modal.innerHTML = `
    <div class="h">
      <h2>${escapeHtml(title)}</h2>
      <button class="btn" id="_closeModal">Cerrar</button>
    </div>
    <div>${bodyHtml}</div>
  `;
  overlay.classList.add("show");
  $("#_closeModal").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  }, { once: true });
  if (onMount) onMount(modal);
}

function closeModal() {
  $("#overlay").classList.remove("show");
  $("#modal").innerHTML = "";
}

function render() {
  const app = $("#app");
  app.innerHTML = `
    <div class="wrap">
      <div class="top">
        <div class="brand">
          <div class="dot"></div>
          <div class="title">
            <b>HUB Catálogo</b>
            <span>Netlify + Front JS + Apps Script</span>
          </div>
        </div>

        <div class="nav">
          ${VIEWS.map(v => `
            <button class="tab" data-view="${v.id}" aria-current="${state.view === v.id ? "page" : "false"}">
              ${escapeHtml(v.label)}
            </button>
          `).join("")}
        </div>
      </div>

      <div id="content"></div>
    </div>
  `;

  $$(".tab", app).forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  const content = $("#content", app);
  content.innerHTML = viewHtml(state.view);
}

function viewHtml(view) {
  switch (view) {
    case "dashboard": return dashboardHtml();
    case "operativa": return operativaHtml();
    case "colaboradores": return colaboradoresHtml();
    case "habilitaciones": return habilitacionesHtml();
    case "presentismo": return presentismoHtml();
    case "productividad": return productividadHtml();
    case "calidad": return calidadHtml();
    default: return `<div class="panel">Vista inválida.</div>`;
  }
}

async function bootView() {
  try {
    if (state.view === "dashboard") return bootDashboard();
    if (state.view === "operativa") return bootOperativa();
    if (state.view === "colaboradores") return bootColaboradores();
    if (state.view === "habilitaciones") return bootHabilitaciones();
    if (state.view === "presentismo") return bootPresentismo();
    if (state.view === "productividad") return bootProductividad();
    if (state.view === "calidad") return bootCalidad();
  } catch (e) {
    toast("Error", e?.message || String(e));
  }
}

/* =========================
   DASHBOARD
========================= */

function dashboardHtml() {
  return `
    <div class="grid grid-3">
      <div class="panel">
        <div class="h"><h2>Estado</h2><span class="muted" id="db_ts"></span></div>
        <div id="db_health" class="muted">—</div>
      </div>

      <div class="panel">
        <div class="h"><h2>Presentismo (hoy)</h2><span class="muted">${escapeHtml(ymdLocal())}</span></div>
        <div id="db_pres" class="muted">—</div>
      </div>

      <div class="panel">
        <div class="h"><h2>Slack Outbox</h2><span class="muted">pendientes</span></div>
        <div id="db_outbox" class="muted">—</div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:12px">
      <div class="panel">
        <div class="h"><h2>Planificación</h2><span class="muted">última</span></div>
        <div id="db_plan" class="muted">—</div>
      </div>

      <div class="panel">
        <div class="h"><h2>Configuración</h2><span class="muted">flujos</span></div>
        <div id="db_cfg" class="muted">—</div>
      </div>
    </div>

    <div class="panel" style="margin-top:12px">
      <div class="h">
        <h2>Acciones rápidas</h2>
        <div class="row">
          <button class="btn primary" id="db_gen_plan">Generar planificación</button>
          <button class="btn" id="db_gen_outbox">Generar Slack Outbox</button>
          <button class="btn" id="db_send_outbox">Enviar pendientes</button>
        </div>
      </div>
      <div class="muted">Si esto falla, no “toca botones”: arreglá datos (Presentismo/Habilitaciones/Flujos) o el backend.</div>
    </div>
  `;
}

async function bootDashboard() {
  setLoading(true, "Cargando dashboard…");

  const [health, stats] = await Promise.all([
    API.health().catch(e => ({ status: "error", error: e?.message || String(e) })),
    API.dashboardStats().catch(e => ({ ok: false, error: e?.message || String(e) })),
  ]);

  $("#db_ts").textContent = new Date().toLocaleString();

  $("#db_health").innerHTML = health?.status === "ok"
    ? `<span class="ok">OK</span> <span class="muted">(${escapeHtml(health.ts || "")})</span>`
    : `<span class="bad">ERROR</span> <span class="muted">${escapeHtml(health?.error || "")}</span>`;

  const pres = stats.presentismo || {};
  $("#db_pres").innerHTML = `
    <div class="kpi"><b>${escapeHtml(pres.presentes ?? "—")}</b><span class="muted">presentes</span></div>
    <div class="kpi" style="margin-top:8px"><b>${escapeHtml(pres.ausentes ?? "—")}</b><span class="muted">no presentes</span></div>
  `;

  const ob = stats.outbox || {};
  $("#db_outbox").innerHTML = `
    <div class="kpi"><b>${escapeHtml(ob.pendientes ?? "—")}</b><span class="muted">pendientes</span></div>
    <div class="kpi" style="margin-top:8px"><b>${escapeHtml(ob.errores ?? "—")}</b><span class="muted">errores</span></div>
  `;

  const pl = stats.planificacion || {};
  $("#db_plan").innerHTML = `
    <div class="kpi"><b>${escapeHtml(pl.asignaciones ?? "—")}</b><span class="muted">asignaciones</span></div>
    <div class="muted" style="margin-top:8px">${escapeHtml(pl.fecha || "")}</div>
  `;

  const cfg = stats.config || {};
  $("#db_cfg").innerHTML = `
    <div class="kpi"><b>${escapeHtml(cfg.flujos ?? "—")}</b><span class="muted">flujos</span></div>
    <div class="kpi" style="margin-top:8px"><b>${escapeHtml(cfg.colaboradores ?? "—")}</b><span class="muted">colaboradores</span></div>
  `;

  $("#db_gen_plan").addEventListener("click", async () => {
    setLoading(true, "Generando planificación…");
    try {
      const r = await API.planificacionGenerar();
      toast("Planificación generada", `Asignaciones: ${r?.asignaciones ?? "—"}`);
      await bootDashboard();
    } catch (e) {
      toast("Error", e?.message || String(e));
    } finally {
      setLoading(false);
    }
  });

  $("#db_gen_outbox").addEventListener("click", async () => {
    setLoading(true, "Generando Slack Outbox…");
    try {
      const r = await API.slackOutboxGenerar();
      toast("Outbox generado", `Filas: ${r?.rows ?? "—"}`);
      await bootDashboard();
    } catch (e) {
      toast("Error", e?.message || String(e));
    } finally {
      setLoading(false);
    }
  });

  $("#db_send_outbox").addEventListener("click", async () => {
    setLoading(true, "Enviando pendientes…");
    try {
      const r = await API.slackOutboxEnviar();
      toast("Slack Outbox", `Enviados: ${r?.sent ?? "—"}`);
      await bootDashboard();
    } catch (e) {
      toast("Error", e?.message || String(e));
    } finally {
      setLoading(false);
    }
  });

  setLoading(false);
}

/* =========================
   OPERATIVA
========================= */

function operativaHtml() {
  return `
    <div class="grid grid-2">
      <div class="panel">
        <div class="h">
          <h2>Planificación</h2>
          <div class="row">
            <button class="btn primary" id="op_gen_plan">Generar</button>
            <button class="btn" id="op_refresh_plan">Actualizar</button>
          </div>
        </div>
        <div class="muted" id="op_plan_meta">—</div>
        <div class="table-wrap" style="margin-top:10px">
          <table>
            <thead>
              <tr>
                <th>Fecha</th><th>Flujo</th><th>ID</th><th>Nombre</th><th>Fijo</th><th>Canal</th>
              </tr>
            </thead>
            <tbody id="op_plan_rows"></tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="h">
          <h2>Slack Outbox</h2>
          <div class="row">
            <button class="btn" id="op_gen_outbox">Generar</button>
            <button class="btn primary" id="op_send_all">Enviar pendientes</button>
            <button class="btn" id="op_refresh_outbox">Actualizar</button>
          </div>
        </div>
        <div class="muted" id="op_outbox_meta">—</div>
        <div class="table-wrap" style="margin-top:10px">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Tipo</th><th>Canal</th><th>Channel ID</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody id="op_outbox_rows"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:12px">
      <div class="h">
        <h2>Flujos</h2>
        <div class="row">
          <button class="btn" id="op_refresh_flujos">Actualizar</button>
          <button class="btn primary" id="op_add_flujo">Agregar flujo</button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Flujo</th><th>Perfiles requeridos</th><th>Slack channel</th><th>Notas</th><th></th>
            </tr>
          </thead>
          <tbody id="op_flujos_rows"></tbody>
        </table>
      </div>
    </div>
  `;
}

async function bootOperativa() {
  setLoading(true, "Cargando operativa…");
  await Promise.all([loadPlanificacionOperativa(), loadOutboxOperativa(), loadFlujosOperativa()]);
  wireOperativa();
  setLoading(false);
}

function wireOperativa() {
  $("#op_gen_plan").onclick = async () => {
    setLoading(true, "Generando planificación…");
    try {
      const r = await API.planificacionGenerar();
      toast("Planificación generada", `Asignaciones: ${r?.asignaciones ?? "—"}`);
      await loadPlanificacionOperativa();
    } catch (e) {
      toast("Error", e?.message || String(e));
    } finally { setLoading(false); }
  };

  $("#op_refresh_plan").onclick = loadPlanificacionOperativa;

  $("#op_gen_outbox").onclick = async () => {
    setLoading(true, "Generando outbox…");
    try {
      const r = await API.slackOutboxGenerar();
      toast("Outbox generado", `Filas: ${r?.rows ?? "—"}`);
      await loadOutboxOperativa();
    } catch (e) {
      toast("Error", e?.message || String(e));
    } finally { setLoading(false); }
  };

  $("#op_send_all").onclick = async () => {
    setLoading(true, "Enviando pendientes…");
    try {
      const r = await API.slackOutboxEnviar();
      toast("Slack", `Enviados: ${r?.sent ?? "—"}`);
      await loadOutboxOperativa();
    } catch (e) {
      toast("Error", e?.message || String(e));
    } finally { setLoading(false); }
  };

  $("#op_refresh_outbox").onclick = loadOutboxOperativa;
  $("#op_refresh_flujos").onclick = loadFlujosOperativa;

  $("#op_add_flujo").onclick = () => {
    openModal("Agregar flujo", `
      <div class="grid" style="gap:10px">
        <div class="field"><label>Flujo</label><input id="m_flujo" placeholder="Ej: Enhancement"></div>
        <div class="field"><label>Perfiles requeridos</label><input id="m_cant" type="number" min="0" placeholder="Ej: 5"></div>
        <div class="field"><label>Slack channel (ID o nombre)</label><input id="m_ch" placeholder="Ej: C07... o team-catalogo"></div>
        <div class="field"><label>Notas default</label><input id="m_notas" placeholder="Opcional"></div>
        <div class="row">
          <button class="btn primary" id="m_save">Guardar</button>
          <button class="btn" id="m_cancel">Cancelar</button>
        </div>
      </div>
    `, (root) => {
      $("#m_cancel", root).onclick = closeModal;
      $("#m_save", root).onclick = async () => {
        try {
          const flujo = $("#m_flujo", root).value.trim();
          const cant = Number($("#m_cant", root).value || 0);
          const ch = $("#m_ch", root).value.trim();
          const notas = $("#m_notas", root).value.trim();
          if (!flujo) throw new Error("Flujo requerido");
          await API.flujosUpsert(flujo, cant, ch, notas);
          toast("Flujo guardado");
          closeModal();
          await loadFlujosOperativa();
        } catch (e) {
          toast("Error", e?.message || String(e));
        }
      };
    });
  };
}

async function loadPlanificacionOperativa() {
  try {
    const rows = await API.planificacionList();
    state.cache.planificacion = rows || [];
    $("#op_plan_meta").textContent = `Filas: ${state.cache.planificacion.length}`;
    const tb = $("#op_plan_rows");
    tb.innerHTML = state.cache.planificacion.map(r => `
      <tr>
        <td>${escapeHtml(r.fecha || "")}</td>
        <td><b>${escapeHtml(r.flujo || "")}</b></td>
        <td>${escapeHtml(r.id_meli || "")}</td>
        <td>${escapeHtml(r.nombre || "")}</td>
        <td>${r.es_fijo ? "SI" : "NO"}</td>
        <td>${escapeHtml(r.canal || r.slack_channel || "")}</td>
      </tr>
    `).join("") || `<tr><td colspan="6" class="muted">Sin datos</td></tr>`;
  } catch (e) {
    toast("Error planificacion.list", e?.message || String(e));
  }
}

async function loadOutboxOperativa() {
  try {
    const rows = await API.slackOutboxList();
    state.cache.outbox = rows || [];
    const pending = state.cache.outbox.filter(x => String(x.estado || "").startsWith("PENDIENTE")).length;
    $("#op_outbox_meta").textContent = `Filas: ${state.cache.outbox.length} | Pendientes: ${pending}`;

    const tb = $("#op_outbox_rows");
    tb.innerHTML = state.cache.outbox.map(r => `
      <tr>
        <td>${escapeHtml(r.row)}</td>
        <td>${escapeHtml(r.tipo || "")}</td>
        <td>${escapeHtml(r.canal || "")}</td>
        <td>${escapeHtml(r.slack_channel || "")}</td>
        <td>${escapeHtml(r.estado || "")}</td>
        <td class="row" style="gap:8px">
          <button class="btn" data-act="edit" data-row="${escapeHtml(r.row)}">Editar</button>
          <button class="btn primary" data-act="send" data-row="${escapeHtml(r.row)}">Enviar</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="6" class="muted">Sin datos</td></tr>`;

    $$("#op_outbox_rows [data-act='edit']").forEach(btn => {
      btn.onclick = () => openEditOutbox(Number(btn.dataset.row));
    });
    $$("#op_outbox_rows [data-act='send']").forEach(btn => {
      btn.onclick = async () => {
        setLoading(true, "Enviando…");
        try {
          await API.slackOutboxEnviar(Number(btn.dataset.row));
          toast("Enviado", `Fila ${btn.dataset.row}`);
          await loadOutboxOperativa();
        } catch (e) {
          toast("Error", e?.message || String(e));
        } finally {
          setLoading(false);
        }
      };
    });

  } catch (e) {
    toast("Error slack.outbox.list", e?.message || String(e));
  }
}

function openEditOutbox(rowNumber) {
  const row = (state.cache.outbox || []).find(r => Number(r.row) === Number(rowNumber));
  if (!row) return toast("No encontré la fila", String(rowNumber));

  openModal(`Editar Outbox (#${rowNumber})`, `
    <div class="grid" style="gap:10px">
      <div class="field"><label>Tipo</label><input id="o_tipo" value="${escapeHtml(row.tipo || "")}" placeholder="GENERAL / POR_FLUJO"></div>
      <div class="field"><label>Canal (nombre)</label><input id="o_canal" value="${escapeHtml(row.canal || "")}"></div>
      <div class="field"><label>Slack channel (ID o nombre)</label><input id="o_ch" value="${escapeHtml(row.slack_channel || "")}"></div>
      <div class="field"><label>Mensaje</label><textarea id="o_msg">${escapeHtml(row.mensaje || "")}</textarea></div>
      <div class="row">
        <button class="btn primary" id="o_save">Guardar</button>
        <button class="btn" id="o_cancel">Cancelar</button>
      </div>
      ${row.error ? `<div class="muted"><b>Error:</b> ${escapeHtml(row.error)}</div>` : ""}
    </div>
  `, (root) => {
    $("#o_cancel", root).onclick = closeModal;
    $("#o_save", root).onclick = async () => {
      try {
        const tipo = $("#o_tipo", root).value.trim();
        const canal = $("#o_canal", root).value.trim();
        const channel_id = $("#o_ch", root).value.trim();
        const mensaje = $("#o_msg", root).value;
        await API.slackOutboxUpdate(rowNumber, canal, channel_id, mensaje, tipo);
        toast("Outbox actualizada", `Fila ${rowNumber}`);
        closeModal();
        await loadOutboxOperativa();
      } catch (e) {
        toast("Error", e?.message || String(e));
      }
    };
  });
}

async function loadFlujosOperativa() {
  try {
    const [flujos, canales] = await Promise.all([API.flujosList(), API.canalesList()]);
    state.cache.flujos = flujos || [];
    state.cache.canales = canales || [];

    const tb = $("#op_flujos_rows");
    tb.innerHTML = state.cache.flujos.map(f => `
      <tr>
        <td><b>${escapeHtml(f.flujo)}</b></td>
        <td><input data-f="cant" data-flujo="${escapeHtml(f.flujo)}" type="number" min="0" value="${escapeHtml(f.perfiles_requeridos)}"></td>
        <td><input data-f="ch" data-flujo="${escapeHtml(f.flujo)}" value="${escapeHtml(f.slack_channel || "")}" placeholder="C07... o nombre"></td>
        <td><input data-f="notas" data-flujo="${escapeHtml(f.flujo)}" value="${escapeHtml(f.notas_default || "")}" placeholder="Opcional"></td>
        <td class="row" style="gap:8px">
          <button class="btn primary" data-act="save" data-flujo="${escapeHtml(f.flujo)}">Guardar</button>
          <button class="btn danger" data-act="del" data-flujo="${escapeHtml(f.flujo)}">Eliminar</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="5" class="muted">No hay flujos</td></tr>`;

    $$("#op_flujos_rows [data-act='save']").forEach(btn => {
      btn.onclick = async () => {
        const flujo = btn.dataset.flujo;
        const cant = Number($(`#op_flujos_rows input[data-f="cant"][data-flujo="${CSS.escape(flujo)}"]`).value || 0);
        const ch = $(`#op_flujos_rows input[data-f="ch"][data-flujo="${CSS.escape(flujo)}"]`).value.trim();
        const notas = $(`#op_flujos_rows input[data-f="notas"][data-flujo="${CSS.escape(flujo)}"]`).value.trim();
        try {
          await API.flujosUpsert(flujo, cant, ch, notas);
          toast("Flujo guardado", flujo);
          await loadFlujosOperativa();
        } catch (e) {
          toast("Error", e?.message || String(e));
        }
      };
    });

    $$("#op_flujos_rows [data-act='del']").forEach(btn => {
      btn.onclick = async () => {
        const flujo = btn.dataset.flujo;
        try {
          await API.flujosDelete(flujo);
          toast("Flujo eliminado", flujo);
          await loadFlujosOperativa();
        } catch (e) {
          toast("Error", e?.message || String(e));
        }
      };
    });

  } catch (e) {
    toast("Error flujos/canales", e?.message || String(e));
  }
}

/* =========================
   COLABORADORES
========================= */

function colaboradoresHtml() {
  return `
    <div class="panel">
      <div class="h">
        <h2>Colaboradores</h2>
        <div class="row">
          <input id="col_q" placeholder="Buscar por nombre / ID / equipo…" style="min-width:320px">
          <button class="btn" id="col_refresh">Actualizar</button>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Nombre</th><th>Rol</th><th>Equipo</th><th>Slack</th><th>Ubicación</th>
            </tr>
          </thead>
          <tbody id="col_rows"></tbody>
        </table>
      </div>
    </div>
  `;
}

async function bootColaboradores() {
  setLoading(true, "Cargando colaboradores…");
  await loadColaboradores();
  $("#col_refresh").onclick = loadColaboradores;
  $("#col_q").oninput = () => renderColaboradores();
  setLoading(false);
}

async function loadColaboradores() {
  try {
    state.cache.colaboradores = await API.colaboradoresList();
    renderColaboradores();
    toast("Colaboradores", `Filas: ${state.cache.colaboradores.length}`);
  } catch (e) {
    toast("Error", e?.message || String(e));
  }
}

function renderColaboradores() {
  const q = ($("#col_q").value || "").trim().toLowerCase();
  const rows = (state.cache.colaboradores || []).filter(r => {
    if (!q) return true;
    const hay = `${r.id_meli} ${r.nombre} ${r.rol} ${r.equipo} ${r.tag}`.toLowerCase();
    return hay.includes(q);
  });

  $("#col_rows").innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.id_meli)}</td>
      <td><b>${escapeHtml(r.nombre)}</b></td>
      <td>${escapeHtml(r.rol || "")}</td>
      <td>${escapeHtml(r.equipo || "")}</td>
      <td>${escapeHtml(r.slack_id || "")}</td>
      <td>${escapeHtml(r.ubicacion || "")}</td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="muted">Sin resultados</td></tr>`;
}

/* =========================
   HABILITACIONES
========================= */

function habilitacionesHtml() {
  return `
    <div class="panel">
      <div class="h">
        <h2>Habilitaciones</h2>
        <div class="row">
          <input id="hab_q" placeholder="Buscar colaborador…" style="min-width:320px">
          <button class="btn" id="hab_refresh">Actualizar</button>
        </div>
      </div>
      <div class="muted" id="hab_meta">—</div>
      <div class="table-wrap" style="margin-top:10px">
        <table>
          <thead id="hab_head"></thead>
          <tbody id="hab_body"></tbody>
        </table>
      </div>
    </div>
  `;
}

async function bootHabilitaciones() {
  setLoading(true, "Cargando habilitaciones…");
  await loadHabilitaciones();
  $("#hab_refresh").onclick = loadHabilitaciones;
  $("#hab_q").oninput = renderHabilitaciones;
  setLoading(false);
}

async function loadHabilitaciones() {
  try {
    const data = await API.habilitacionesList();
    state.cache.habilitaciones = data;
    renderHabilitaciones();
  } catch (e) {
    toast("Error", e?.message || String(e));
  }
}

function renderHabilitaciones() {
  const data = state.cache.habilitaciones;
  if (!data) return;

  const q = ($("#hab_q").value || "").trim().toLowerCase();
  const flujos = data.flujos || [];
  const rows = (data.rows || []).filter(r => {
    if (!q) return true;
    const hay = `${r.id_meli} ${r.nombre}`.toLowerCase();
    return hay.includes(q);
  });

  $("#hab_meta").textContent = `Colaboradores: ${rows.length} | Flujos: ${flujos.length}`;

  $("#hab_head").innerHTML = `
    <tr>
      <th>ID</th><th>Nombre</th>
      ${flujos.map(f => `<th>${escapeHtml(f)}<div class="muted" style="font-weight:400">H / F</div></th>`).join("")}
    </tr>
  `;

  $("#hab_body").innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.id_meli)}</td>
      <td><b>${escapeHtml(r.nombre || "")}</b></td>
      ${flujos.map(f => {
        const v = r.per_flows?.[f] || { habilitado:false, fijo:false };
        const hid = `${r.id_meli}||${f}`;
        return `
          <td>
            <div class="row" style="gap:10px;align-items:center">
              <label class="pill" style="padding:6px 8px">
                <input type="checkbox" data-id="${escapeHtml(r.id_meli)}" data-flujo="${escapeHtml(f)}" data-k="h" ${v.habilitado ? "checked" : ""}>
                H
              </label>
              <label class="pill" style="padding:6px 8px">
                <input type="checkbox" data-id="${escapeHtml(r.id_meli)}" data-flujo="${escapeHtml(f)}" data-k="f" ${v.fijo ? "checked" : ""}>
                F
              </label>
            </div>
          </td>
        `;
      }).join("")}
    </tr>
  `).join("") || `<tr><td colspan="${2 + flujos.length}" class="muted">Sin resultados</td></tr>`;

  // Wire toggles
  $$("#hab_body input[type='checkbox']").forEach(cb => {
    cb.onchange = async () => {
      const idMeli = cb.dataset.id;
      const flujo = cb.dataset.flujo;
      const kind = cb.dataset.k;

      const cell = cb.closest("td");
      const hCb = $("input[data-k='h']", cell);
      const fCb = $("input[data-k='f']", cell);

      // regla: si fijo=true => habilitado=true
      if (kind === "f" && fCb.checked) hCb.checked = true;
      // regla: si habilitado=false => fijo=false
      if (kind === "h" && !hCb.checked) fCb.checked = false;

      try {
        await API.habilitacionesSet(idMeli, flujo, hCb.checked, fCb.checked);
        toast("Guardado", `${idMeli} · ${flujo} (H:${hCb.checked ? "1" : "0"} F:${fCb.checked ? "1" : "0"})`);
      } catch (e) {
        toast("Error", e?.message || String(e));
        // rollback visual (lo mínimo para no mentirte)
        await loadHabilitaciones();
      }
    };
  });
}

/* =========================
   PRESENTISMO
========================= */

function presentismoHtml() {
  const today = ymdLocal();
  return `
    <div class="grid grid-2">
      <div class="panel">
        <div class="h">
          <h2>Semana</h2>
          <div class="row">
            <input id="pr_date" type="date" value="${escapeHtml(today)}">
            <button class="btn" id="pr_load">Cargar</button>
          </div>
        </div>

        <div class="muted" id="pr_meta">—</div>
        <div class="table-wrap" style="margin-top:10px">
          <table>
            <thead id="pr_head"></thead>
            <tbody id="pr_body"></tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="h"><h2>Registrar licencia/ausencia</h2><span class="muted">impacta Presentismo</span></div>

        <div class="grid" style="gap:10px">
          <div class="field">
            <label>Colaborador</label>
            <select id="pr_user"></select>
          </div>
          <div class="row">
            <div class="field"><label>Desde</label><input id="pr_from" type="date" value="${escapeHtml(today)}"></div>
            <div class="field"><label>Hasta</label><input id="pr_to" type="date" value="${escapeHtml(today)}"></div>
          </div>
          <div class="field">
            <label>Tipo</label>
            <select id="pr_tipo">
              <option value="V">V - Vacaciones</option>
              <option value="E">E - Enfermedad</option>
              <option value="M">M - Médico</option>
              <option value="MM">MM - Mudanza</option>
              <option value="AI">AI - Asuntos internos</option>
              <option value="P">P - Presente</option>
            </select>
          </div>
          <div class="row">
            <button class="btn primary" id="pr_save">Guardar</button>
            <button class="btn" id="pr_refresh_users">Actualizar lista</button>
          </div>

          <div class="muted">
            Si “no aparecen presentes”, no es magia: revisá que <b>Presentismo</b> tenga columna <b>ID_MELI</b> y que los IDs coincidan con Habilitaciones.
          </div>
        </div>
      </div>
    </div>
  `;
}

async function bootPresentismo() {
  setLoading(true, "Cargando presentismo…");
  await Promise.all([loadPresentismoWeek(), loadPresentismoUsers()]);
  wirePresentismo();
  setLoading(false);
}

function wirePresentismo() {
  $("#pr_load").onclick = loadPresentismoWeek;
  $("#pr_refresh_users").onclick = loadPresentismoUsers;

  $("#pr_save").onclick = async () => {
    setLoading(true, "Guardando…");
    try {
      const idMeli = $("#pr_user").value;
      const desde = $("#pr_from").value;
      const hasta = $("#pr_to").value;
      const tipo = $("#pr_tipo").value;
      if (!idMeli) throw new Error("Seleccioná un colaborador");
      await API.presentismoLicenciasSet(idMeli, desde, hasta, tipo);
      toast("Presentismo", "Registro guardado");
      await loadPresentismoWeek();
    } catch (e) {
      toast("Error", e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };
}

async function loadPresentismoUsers() {
  try {
    const colabs = await API.colaboradoresList();
    state.cache.colaboradores = colabs;

    const sel = $("#pr_user");
    sel.innerHTML = colabs
      .slice()
      .sort((a,b) => String(a.nombre||"").localeCompare(String(b.nombre||"")))
      .map(c => `<option value="${escapeHtml(c.id_meli)}">${escapeHtml(c.nombre)} (${escapeHtml(c.id_meli)})</option>`)
      .join("");
  } catch (e) {
    toast("Error colaboradores", e?.message || String(e));
  }
}

async function loadPresentismoWeek() {
  try {
    const date = $("#pr_date")?.value || ymdLocal();
    const data = await API.presentismoWeek(date);
    state.cache.presentismoWeek = data;

    $("#pr_meta").textContent = `Semana: ${data.week_start} → ${data.week_end} | Colaboradores: ${data.rows.length}`;

    $("#pr_head").innerHTML = `
      <tr>
        <th>ID</th><th>Nombre</th>
        ${data.days.map(d => `<th>${escapeHtml(d.label)}<div class="muted" style="font-weight:400">${escapeHtml(d.key)}</div></th>`).join("")}
      </tr>
    `;

    $("#pr_body").innerHTML = data.rows.map(r => `
      <tr>
        <td>${escapeHtml(r.id_meli)}</td>
        <td><b>${escapeHtml(r.nombre || "")}</b></td>
        ${data.days.map(d => {
          const v = (r.values && r.values[d.key]) ? String(r.values[d.key]) : "";
          const cls = v === "P" ? "ok" : (v ? "warn" : "muted");
          return `<td class="${cls}">${escapeHtml(v || "")}</td>`;
        }).join("")}
      </tr>
    `).join("") || `<tr><td colspan="${2 + data.days.length}" class="muted">Sin datos</td></tr>`;

  } catch (e) {
    toast("Error presentismo.week", e?.message || String(e));
  }
}

/* =========================
   PRODUCTIVIDAD / CALIDAD
========================= */

function productividadHtml() {
  return `
    <div class="panel">
      <div class="h">
        <h2>Productividad</h2>
        <button class="btn" id="pd_refresh">Actualizar</button>
      </div>
      <div class="muted" id="pd_meta">—</div>
      <div class="table-wrap" style="margin-top:10px">
        <table>
          <thead id="pd_head"></thead>
          <tbody id="pd_body"></tbody>
        </table>
      </div>
    </div>
  `;
}

async function bootProductividad() {
  setLoading(true, "Cargando productividad…");
  await loadProductividad();
  $("#pd_refresh").onclick = loadProductividad;
  setLoading(false);
}

async function loadProductividad() {
  try {
    const data = await API.productividadList();
    state.cache.productividad = data;
    renderGenericTable("pd", data);
  } catch (e) {
    toast("Productividad", e?.message || String(e));
    renderEmptyGeneric("pd", "No hay datos (o falta hoja Productividad)");
  }
}

function calidadHtml() {
  return `
    <div class="panel">
      <div class="h">
        <h2>Calidad</h2>
        <button class="btn" id="ql_refresh">Actualizar</button>
      </div>
      <div class="muted" id="ql_meta">—</div>
      <div class="table-wrap" style="margin-top:10px">
        <table>
          <thead id="ql_head"></thead>
          <tbody id="ql_body"></tbody>
        </table>
      </div>
    </div>
  `;
}

async function bootCalidad() {
  setLoading(true, "Cargando calidad…");
  await loadCalidad();
  $("#ql_refresh").onclick = loadCalidad;
  setLoading(false);
}

async function loadCalidad() {
  try {
    const data = await API.calidadPmList();
    state.cache.calidad = data;
    renderGenericTable("ql", data);
  } catch (e) {
    toast("Calidad", e?.message || String(e));
    renderEmptyGeneric("ql", "No hay datos (o falta hoja Calidad_PM)");
  }
}

function renderEmptyGeneric(prefix, msg) {
  $(`#${prefix}_meta`).textContent = msg;
  $(`#${prefix}_head`).innerHTML = `<tr><th>—</th></tr>`;
  $(`#${prefix}_body`).innerHTML = `<tr><td class="muted">${escapeHtml(msg)}</td></tr>`;
}

function renderGenericTable(prefix, data) {
  const rows = (data && data.rows) ? data.rows : [];
  const headers = (data && data.headers) ? data.headers : [];

  $(`#${prefix}_meta`).textContent = `Filas: ${rows.length}`;

  $(`#${prefix}_head`).innerHTML = `<tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  $(`#${prefix}_body`).innerHTML = rows.map(r => `
    <tr>${headers.map(h => `<td>${escapeHtml(r[h] ?? "")}</td>`).join("")}</tr>
  `).join("") || `<tr><td colspan="${Math.max(1, headers.length)}" class="muted">Sin datos</td></tr>`;
}
