// app.js (ESM)
import { API } from "./api.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function safeEl(sel) {
  const el = $(sel);
  return el || null;
}

function toast(msg, isError = false) {
  const el = safeEl("#toast");
  if (!el) return; // NO CRASHEA
  el.textContent = msg;
  el.style.borderColor = isError ? "rgba(255,70,70,.40)" : "rgba(255,255,255,.14)";
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), isError ? 5200 : 2600);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

function fmtDate(d) {
  if (!d) return "";
  const dd = new Date(d);
  if (Number.isNaN(dd.getTime())) return String(d);
  const day = String(dd.getDate()).padStart(2, "0");
  const mon = String(dd.getMonth() + 1).padStart(2, "0");
  const yr = dd.getFullYear();
  return `${day}/${mon}/${yr}`;
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

const ROUTES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "operativa", label: "Operativa diaria" },
  { id: "colaboradores", label: "Colaboradores" },
  { id: "habilitaciones", label: "Habilitaciones" },
  { id: "presentismo", label: "Presentismo" },
  { id: "calidad", label: "Calidad" },
  { id: "productividad", label: "Productividad" },
];

let STATE = {
  dashboard: null,
  canales: [],
  colaboradores: [],
  flujos: [],
  habilitaciones: [], // [{idMeli, flujo, habilitado, fijo}]
  plan: [],
  outbox: [],
  presentismo: [],
  calidad: [],
};

function currentRoute() {
  const h = (location.hash || "#dashboard").replace("#", "");
  return ROUTES.some(r => r.id === h) ? h : "dashboard";
}

function setRoute(r) {
  location.hash = `#${r}`;
}

function renderTabs() {
  const tabs = safeEl("#tabs");
  if (!tabs) return;
  const r = currentRoute();
  tabs.innerHTML = ROUTES.map(x =>
    `<button class="tab ${x.id === r ? "active" : ""}" data-route="${x.id}">${esc(x.label)}</button>`
  ).join("");
  tabs.onclick = (e) => {
    const b = e.target.closest("[data-route]");
    if (!b) return;
    setRoute(b.dataset.route);
  };
}

async function loadAll() {
  const [dash, canales, colabs, flujos, habs, plan, outbox, pres, calidad] = await Promise.all([
    API.dashboard().catch(() => null),
    API.canalesList().catch(() => []),
    API.colaboradoresList().catch(() => []),
    API.flujosList().catch(() => []),
    API.habilitacionesList().catch(() => []),
    API.planificacionList().catch(() => []),
    API.slackOutboxList().catch(() => []),
    API.presentismoHoy().catch(() => []),
    API.calidadPmList().catch(() => []),
  ]);

  STATE.dashboard = dash;
  STATE.canales = canales || [];
  STATE.colaboradores = colabs || [];
  STATE.flujos = flujos || [];
  STATE.habilitaciones = habs || [];
  STATE.plan = plan || [];
  STATE.outbox = outbox || [];
  STATE.presentismo = pres || [];
  STATE.calidad = calidad || [];
}

function render() {
  renderTabs();

  const app = safeEl("#app");
  if (!app) return;

  const r = currentRoute();
  if (r === "dashboard") return renderDashboard(app);
  if (r === "operativa") return renderOperativa(app);
  if (r === "colaboradores") return renderColaboradores(app);
  if (r === "habilitaciones") return renderHabilitaciones(app);
  if (r === "presentismo") return renderPresentismo(app);
  if (r === "calidad") return renderCalidad(app);
  if (r === "productividad") return renderProductividad(app);
}

function renderDashboard(app) {
  const d = STATE.dashboard || {};
  app.innerHTML = `
    <div class="sectionTitle">Dashboard</div>
    <div class="muted">Estado general del HUB.</div>
    <div class="sep"></div>

    <div class="grid kpis">
      <div class="kpi">
        <div class="muted">Colaboradores</div>
        <div class="v">${esc(d.colaboradores_total ?? STATE.colaboradores.length)}</div>
      </div>
      <div class="kpi">
        <div class="muted">Presentes hoy</div>
        <div class="v">${esc(d.presentes_hoy ?? STATE.presentismo.filter(x => x.estado === "P").length)}</div>
      </div>
      <div class="kpi">
        <div class="muted">Flujos activos</div>
        <div class="v">${esc(d.flujos_total ?? STATE.flujos.length)}</div>
      </div>
      <div class="kpi">
        <div class="muted">Outbox pendientes</div>
        <div class="v">${esc(d.outbox_pendientes ?? STATE.outbox.filter(x => String(x.estado||"").startsWith("PENDIENTE")).length)}</div>
      </div>
    </div>

    <div class="sep"></div>
    <div class="row">
      <span class="pill">Planificación: ${STATE.plan.length ? "cargada" : "vacía"}</span>
      <span class="pill">Outbox: ${STATE.outbox.length ? "cargada" : "vacía"}</span>
      <span class="pill">Canales: ${STATE.canales.length}</span>
    </div>
  `;
}

function renderOperativa(app) {
  app.innerHTML = `
    <div class="sectionTitle">Operativa diaria</div>
    <div class="muted">Config de flujos + generación de planificación + Slack outbox.</div>

    <div class="sep"></div>

    <div class="sectionTitle" style="font-size:16px;">Flujos</div>
    <div class="muted">Se guarda automáticamente al editar.</div>

    <table>
      <thead>
        <tr>
          <th style="width:30%;">Flujo</th>
          <th style="width:35%;">Slack channel</th>
          <th style="width:20%;">Perfiles</th>
          <th style="width:15%;">Acción</th>
        </tr>
      </thead>
      <tbody id="tbFlujos"></tbody>
    </table>

    <div class="row">
      <input id="newFlujo" placeholder="+ Nuevo flujo…" style="flex:2; min-width:180px;" />
      <select id="newChannel" style="flex:2; min-width:180px;"></select>
      <input id="newPerfiles" type="number" min="0" value="0" style="flex:1; min-width:120px;" />
      <button id="btnAddFlujo" class="btn primary">Agregar</button>
    </div>

    <div class="sep"></div>

    <div class="row">
      <button id="btnPlan" class="btn primary">Generar planificación</button>
      <button id="btnOutbox" class="btn">Generar Outbox</button>
      <button id="btnSendAll" class="btn success">Enviar todos</button>
      <span id="opStatus" class="muted"></span>
    </div>

    <div class="sep"></div>

    <div class="sectionTitle" style="font-size:16px;">Planificación (resultado)</div>
    <div id="planBox" class="muted">${STATE.plan.length ? "" : "Sin planificación cargada."}</div>

    <div class="sep"></div>

    <div class="sectionTitle" style="font-size:16px;">Slack Outbox (pendientes)</div>
    <div class="muted">Editá canal/mensaje y enviá por fila o “Enviar todos”.</div>
    <div id="outBox" style="margin-top:10px;"></div>
  `;

  // canales select
  const sel = safeEl("#newChannel");
  if (sel) {
    sel.innerHTML = `<option value="">—</option>` + STATE.canales
      .map(c => `<option value="${esc(c.channel_id)}">${esc(c.canal)} (${esc(c.channel_id)})</option>`)
      .join("");
  }

  // tabla flujos
  const tb = safeEl("#tbFlujos");
  if (tb) {
    tb.innerHTML = (STATE.flujos || []).map(f => {
      return `
        <tr data-flujo="${esc(f.flujo)}">
          <td><strong>${esc(f.flujo)}</strong></td>
          <td>
            <select data-field="channel_id">
              <option value="">—</option>
              ${STATE.canales.map(c =>
                `<option value="${esc(c.channel_id)}" ${String(c.channel_id)===String(f.channel_id) ? "selected":""}>
                  ${esc(c.canal)} (${esc(c.channel_id)})
                </option>`
              ).join("")}
            </select>
          </td>
          <td><input data-field="perfiles_requeridos" type="number" min="0" value="${esc(f.perfiles_requeridos ?? 0)}"/></td>
          <td><button class="btn danger" data-del="1">Borrar</button></td>
        </tr>
      `;
    }).join("");
  }

  // render plan
  const planBox = safeEl("#planBox");
  if (planBox && STATE.plan.length) {
    const g = groupBy(STATE.plan, x => x.flujo);
    planBox.classList.remove("muted");
    planBox.innerHTML = Array.from(g.entries()).map(([flujo, rows]) => {
      const ppl = rows
        .filter(r => r.idMeli && r.idMeli !== "SIN PERFILES DISPONIBLES")
        .map(r => r.nombre ? `${esc(r.nombre)} (${esc(r.idMeli)})` : esc(r.idMeli))
        .join(" • ");
      return `
        <div style="margin:10px 0;">
          <div class="pill"><strong>${esc(flujo)}</strong> <span class="muted">(${rows.length})</span></div>
          <div style="margin-top:8px;">${ppl || `<span class="muted">Sin perfiles</span>`}</div>
        </div>
      `;
    }).join("");
  }

  // render outbox
  renderOutbox();

  // handlers
  app.addEventListener("change", async (e) => {
    const tr = e.target.closest("tr[data-flujo]");
    if (!tr) return;

    const flujo = tr.dataset.flujo;
    const field = e.target.getAttribute("data-field");
    if (!field) return;

    const channel_id = tr.querySelector('select[data-field="channel_id"]')?.value || "";
    const perfiles_requeridos = Number(tr.querySelector('input[data-field="perfiles_requeridos"]')?.value || 0);

    try {
      await API.flujosUpsert(flujo, perfiles_requeridos, channel_id);
      toast("Flujo guardado");
      await refreshOperativa();
    } catch (err) {
      toast(err.message || String(err), true);
    }
  }, { passive: true });

  app.addEventListener("click", async (e) => {
    const delBtn = e.target.closest("[data-del]");
    if (delBtn) {
      const tr = delBtn.closest("tr[data-flujo]");
      const flujo = tr?.dataset?.flujo;
      if (!flujo) return;
      if (!confirm(`Borrar flujo "${flujo}"?`)) return;

      try {
        await API.flujosDelete(flujo);
        toast("Flujo borrado");
        await refreshOperativa();
      } catch (err) {
        toast(err.message || String(err), true);
      }
      return;
    }

    if (e.target.id === "btnAddFlujo") {
      const nf = safeEl("#newFlujo")?.value?.trim();
      const nc = safeEl("#newChannel")?.value?.trim() || "";
      const np = Number(safeEl("#newPerfiles")?.value || 0);
      if (!nf) return toast("Poné un nombre de flujo", true);

      try {
        await API.flujosUpsert(nf, np, nc);
        toast("Flujo agregado");
        await refreshOperativa();
      } catch (err) {
        toast(err.message || String(err), true);
      }
      return;
    }

    if (e.target.id === "btnPlan") {
      await runOp("Generando planificación…", async () => {
        await API.planificacionGenerar();
        STATE.plan = await API.planificacionList().catch(() => []);
      });
      render();
      return;
    }

    if (e.target.id === "btnOutbox") {
      await runOp("Generando Outbox…", async () => {
        await API.slackOutboxGenerar();
        STATE.outbox = await API.slackOutboxList().catch(() => []);
      });
      render();
      return;
    }

    if (e.target.id === "btnSendAll") {
      await runOp("Enviando…", async () => {
        await API.slackOutboxEnviar(); // envía todos pendientes
        STATE.outbox = await API.slackOutboxList().catch(() => []);
      });
      render();
      return;
    }

    // enviar fila
    const sendRow = e.target.closest("[data-send-row]");
    if (sendRow) {
      const row = Number(sendRow.dataset.sendRow);
      if (!row) return;
      await runOp("Enviando fila…", async () => {
        await API.slackOutboxEnviar(row);
        STATE.outbox = await API.slackOutboxList().catch(() => []);
      });
      render();
      return;
    }
  });
}

async function runOp(msg, fn) {
  const st = safeEl("#opStatus");
  if (st) st.textContent = msg;
  try {
    await fn();
    toast("OK");
  } catch (err) {
    toast(err.message || String(err), true);
  } finally {
    if (st) st.textContent = "";
  }
}

async function refreshOperativa() {
  const [canales, flujos, plan, outbox] = await Promise.all([
    API.canalesList().catch(() => []),
    API.flujosList().catch(() => []),
    API.planificacionList().catch(() => []),
    API.slackOutboxList().catch(() => []),
  ]);
  STATE.canales = canales || [];
  STATE.flujos = flujos || [];
  STATE.plan = plan || [];
  STATE.outbox = outbox || [];
}

function renderOutbox() {
  const box = safeEl("#outBox");
  if (!box) return;

  const pendientes = (STATE.outbox || []).filter(x => String(x.estado || "").startsWith("PENDIENTE") || x.estado === "ERROR");
  if (!pendientes.length) {
    box.innerHTML = `<div class="muted">Sin pendientes.</div>`;
    return;
  }

  box.innerHTML = `
    <table>
      <thead>
        <tr>
          <th style="width:110px;">Fecha</th>
          <th style="width:260px;">Canal</th>
          <th>Mensaje</th>
          <th style="width:110px;">Estado</th>
          <th style="width:120px;">Acción</th>
        </tr>
      </thead>
      <tbody>
        ${pendientes.map(r => {
          return `
            <tr>
              <td>${esc(fmtDate(r.fecha))}</td>
              <td>
                <select data-outbox-row="${esc(r.row)}" data-outbox-field="channel_id">
                  <option value="">—</option>
                  ${STATE.canales.map(c =>
                    `<option value="${esc(c.channel_id)}" ${String(c.channel_id)===String(r.channel_id) ? "selected":""}>
                      ${esc(c.canal)} (${esc(c.channel_id)})
                    </option>`
                  ).join("")}
                </select>
                <div class="muted" style="font-size:12px; margin-top:6px;">${esc(r.canal || "")}</div>
              </td>
              <td>
                <textarea data-outbox-row="${esc(r.row)}" data-outbox-field="mensaje">${esc(r.mensaje || "")}</textarea>
                ${r.error ? `<div class="errorBox" style="margin-top:8px;">${esc(r.error)}</div>` : ``}
              </td>
              <td>${esc(r.estado || "")}</td>
              <td>
                <div class="row">
                  <button class="btn" data-save-row="${esc(r.row)}">Guardar</button>
                  <button class="btn primary" data-send-row="${esc(r.row)}">Enviar</button>
                </div>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  box.onclick = async (e) => {
    const save = e.target.closest("[data-save-row]");
    if (!save) return;
    const row = Number(save.dataset.saveRow);
    if (!row) return;

    const channel_id = box.querySelector(`[data-outbox-row="${row}"][data-outbox-field="channel_id"]`)?.value || "";
    const mensaje = box.querySelector(`[data-outbox-row="${row}"][data-outbox-field="mensaje"]`)?.value || "";
    const canal = STATE.canales.find(c => String(c.channel_id) === String(channel_id))?.canal || "";

    try {
      await API.slackOutboxUpdate(row, canal, channel_id, mensaje);
      toast("Outbox guardada");
      STATE.outbox = await API.slackOutboxList().catch(() => []);
      render();
    } catch (err) {
      toast(err.message || String(err), true);
    }
  };
}

function renderColaboradores(app) {
  app.innerHTML = `
    <div class="sectionTitle">Colaboradores</div>
    <div class="muted">Listado desde hoja “Colaboradores”.</div>
    <div class="sep"></div>

    <table>
      <thead>
        <tr>
          <th style="width:180px;">ID_MELI</th>
          <th>Nombre</th>
          <th style="width:220px;">Slack_ID</th>
        </tr>
      </thead>
      <tbody>
        ${(STATE.colaboradores || []).map(c => `
          <tr>
            <td><strong>${esc(c.idMeli)}</strong></td>
            <td>${esc(c.nombre || "")}</td>
            <td>${esc(c.slackId || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderHabilitaciones(app) {
  const flujos = (STATE.flujos || []).map(f => f.flujo);
  const habMap = new Map(); // key: id|flujo -> {habilitado,fijo}
  for (const h of (STATE.habilitaciones || [])) {
    habMap.set(`${h.idMeli}||${h.flujo}`, { habilitado: !!h.habilitado, fijo: !!h.fijo });
  }

  app.innerHTML = `
    <div class="sectionTitle">Habilitaciones</div>
    <div class="muted">Toggle por colaborador y flujo (habilitado + fijo).</div>
    <div class="sep"></div>

    <div class="muted" style="margin-bottom:10px;">
      Consejo: si esto te parece largo, es porque lo es. Es una matriz.
    </div>

    <div style="overflow:auto;">
      <table>
        <thead>
          <tr>
            <th style="min-width:180px;">Colaborador</th>
            ${flujos.map(f => `<th style="min-width:180px;">${esc(f)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${(STATE.colaboradores || []).map(c => {
            return `
              <tr>
                <td><strong>${esc(c.nombre || c.idMeli)}</strong><div class="muted" style="font-size:12px;">${esc(c.idMeli)}</div></td>
                ${flujos.map(f => {
                  const st = habMap.get(`${c.idMeli}||${f}`) || { habilitado:false, fijo:false };
                  return `
                    <td>
                      <div class="row">
                        <label class="pill">
                          <input type="checkbox" data-h-id="${esc(c.idMeli)}" data-h-flujo="${esc(f)}" data-h-field="habilitado" ${st.habilitado ? "checked":""}/>
                          habilitado
                        </label>
                        <label class="pill">
                          <input type="checkbox" data-h-id="${esc(c.idMeli)}" data-h-flujo="${esc(f)}" data-h-field="fijo" ${st.fijo ? "checked":""}/>
                          fijo
                        </label>
                      </div>
                    </td>
                  `;
                }).join("")}
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  app.onchange = async (e) => {
    const el = e.target;
    if (!el?.matches?.("input[data-h-id]")) return;

    const idMeli = el.getAttribute("data-h-id");
    const flujo = el.getAttribute("data-h-flujo");
    const field = el.getAttribute("data-h-field");

    // obtenemos ambos checks (habilitado/fijo) para guardar consistente
    const hab = app.querySelector(`input[data-h-id="${CSS.escape(idMeli)}"][data-h-flujo="${CSS.escape(flujo)}"][data-h-field="habilitado"]`)?.checked || false;
    const fijo = app.querySelector(`input[data-h-id="${CSS.escape(idMeli)}"][data-h-flujo="${CSS.escape(flujo)}"][data-h-field="fijo"]`)?.checked || false;

    try {
      await API.habilitacionesSet(idMeli, flujo, hab, fijo);
      toast("Guardado");
      STATE.habilitaciones = await API.habilitacionesList().catch(() => []);
    } catch (err) {
      toast(err.message || String(err), true);
    }
  };
}

function renderPresentismo(app) {
  app.innerHTML = `
    <div class="sectionTitle">Presentismo</div>
    <div class="muted">Estado de hoy (TZ del spreadsheet). Registrar ausencia por rango.</div>
    <div class="sep"></div>

    <div class="row">
      <select id="pColab" style="flex:2; min-width:220px;"></select>
      <input id="pDesde" placeholder="Desde (yyyy-mm-dd o dd/mm/yyyy)" style="flex:1; min-width:180px;" />
      <input id="pHasta" placeholder="Hasta (opcional)" style="flex:1; min-width:180px;" />
      <select id="pTipo" style="flex:1; min-width:140px;">
        <option value="V">Vacaciones (V)</option>
        <option value="E">Enfermedad (E)</option>
        <option value="M">Médico (M)</option>
        <option value="MM">Mudanza (MM)</option>
        <option value="AI">Ausencia injustificada (AI)</option>
      </select>
      <button id="pGuardar" class="btn primary">Guardar</button>
    </div>

    <div class="sep"></div>

    <table>
      <thead>
        <tr>
          <th style="width:180px;">ID_MELI</th>
          <th>Nombre</th>
          <th style="width:120px;">Estado</th>
        </tr>
      </thead>
      <tbody>
        ${(STATE.presentismo || []).map(r => `
          <tr>
            <td><strong>${esc(r.idMeli)}</strong></td>
            <td>${esc(r.nombre || "")}</td>
            <td>${esc(r.estado || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  const sel = safeEl("#pColab");
  if (sel) {
    sel.innerHTML = `<option value="">Elegí colaborador…</option>` + (STATE.colaboradores || [])
      .map(c => `<option value="${esc(c.idMeli)}">${esc(c.nombre || c.idMeli)} (${esc(c.idMeli)})</option>`)
      .join("");
  }

  app.onclick = async (e) => {
    if (e.target.id !== "pGuardar") return;
    const idMeli = safeEl("#pColab")?.value || "";
    const desde = safeEl("#pDesde")?.value?.trim() || "";
    const hasta = safeEl("#pHasta")?.value?.trim() || "";
    const tipo = safeEl("#pTipo")?.value || "V";

    if (!idMeli) return toast("Elegí colaborador", true);
    if (!desde) return toast("Poné fecha desde", true);

    try {
      await API.presentismoSetRango(idMeli, desde, hasta, tipo);
      toast("Ausencia registrada");
      STATE.presentismo = await API.presentismoHoy().catch(() => []);
      render();
    } catch (err) {
      toast(err.message || String(err), true);
    }
  };
}

function renderCalidad(app) {
  if (!STATE.calidad?.length) {
    app.innerHTML = `
      <div class="sectionTitle">Calidad</div>
      <div class="muted">No hay datos (o no existe la hoja Calidad_PM).</div>
      <div class="sep"></div>
      <div class="pill">Tip: si querés, conectamos esto a Looker / KPI real.</div>
    `;
    return;
  }

  app.innerHTML = `
    <div class="sectionTitle">Calidad PM</div>
    <div class="muted">Fuente: hoja “Calidad_PM”.</div>
    <div class="sep"></div>

    <table>
      <thead>
        <tr>
          <th>Semana</th>
          <th>Usuario</th>
          <th>Total</th>
          <th>Errores</th>
          <th>Correctas</th>
          <th>Efectividad</th>
        </tr>
      </thead>
      <tbody>
        ${(STATE.calidad || []).map(r => `
          <tr>
            <td>${esc(r.semana)}</td>
            <td><strong>${esc(r.usuario)}</strong></td>
            <td>${esc(r.total_sugerencias)}</td>
            <td>${esc(r.sugerencias_con_error)}</td>
            <td>${esc(r.sugerencias_correctas)}</td>
            <td>${r.efectividad != null ? esc((Number(r.efectividad) * 100).toFixed(2) + "%") : ""}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderProductividad(app) {
  app.innerHTML = `
    <div class="sectionTitle">Productividad</div>
    <div class="muted">Placeholder: esta sección depende de tu fuente (Looker / Sheets / API MELI).</div>
    <div class="sep"></div>
    <div class="pill">Si querés “KPI real”, definí: fuente, granularidad y métricas.</div>
  `;
}

async function init() {
  // errores globales => toast en vez de “pantalla en blanco”
  window.addEventListener("error", (e) => toast(e?.message || "Error", true));
  window.addEventListener("unhandledrejection", (e) => toast(e?.reason?.message || String(e.reason || "Promise error"), true));

  const btnHealth = safeEl("#btnHealth");
  if (btnHealth) {
    btnHealth.onclick = async () => {
      try {
        const x = await API.health();
        toast(`OK: ${x?.spreadsheetId || "health"}`);
      } catch (err) {
        toast(err.message || String(err), true);
      }
    };
  }

  await loadAll();
  renderTabs();
  render();

  window.addEventListener("hashchange", () => {
    renderTabs();
    render();
  });
}

init();
