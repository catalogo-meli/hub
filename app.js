// app.js (ESM)
import { API } from "./api.js";

const $ = (sel) => document.querySelector(sel);

function safeEl(sel) { return $(sel) || null; }

function toast(msg, isError = false) {
  const el = safeEl("#toast");
  if (!el) return;
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

function fmtDateDMY(d) {
  if (!d) return "";
  const dd = new Date(d);
  if (Number.isNaN(dd.getTime())) return String(d);
  const day = String(dd.getDate()).padStart(2, "0");
  const mon = String(dd.getMonth() + 1).padStart(2, "0");
  const yr = dd.getFullYear();
  return `${day}-${mon}-${yr}`;
}

function fmtDateSlash(d) {
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

function uniq(arr) { return Array.from(new Set(arr.filter(Boolean))); }

function getMultiValues(selectEl) {
  if (!selectEl) return [];
  return Array.from(selectEl.selectedOptions || []).map(o => o.value).filter(Boolean);
}

const ROUTES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "operativa", label: "Operativa diaria" },
  { id: "comunicaciones", label: "Comunicaciones" },
  { id: "colaboradores", label: "Colaboradores" },
  { id: "habilitaciones", label: "Habilitaciones" },
  { id: "presentismo", label: "Presentismo" },
  { id: "calidad", label: "Calidad" },
  { id: "productividad", label: "Productividad" },
];

let STATE = {
  dashboard: null,
  templates: [],
  canales: [],
  colaboradores: [],
  flujos: [],
  habilitaciones: [],
  plan: [],
  outbox: [],
  presWeek: null,
  calidad: [],
};

let FILTERS = {
  search: "",
  roles: [],
  equipos: [],
  soloSlack: false,
};

function currentRoute() {
  const h = (location.hash || "#dashboard").replace("#", "");
  return ROUTES.some(r => r.id === h) ? h : "dashboard";
}

function setRoute(r) { location.hash = `#${r}`; }

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

function applyFiltersToColabs(colabs) {
  const s = (FILTERS.search || "").trim().toLowerCase();
  const roles = new Set(FILTERS.roles || []);
  const equipos = new Set(FILTERS.equipos || []);
  const soloSlack = !!FILTERS.soloSlack;

  return (colabs || []).filter(c => {
    const haySlack = (c.slackId || "").trim() !== "";
    if (soloSlack && !haySlack) return false;

    if (roles.size && !roles.has(c.rol || "")) return false;
    if (equipos.size && !equipos.has(c.equipo || "")) return false;

    if (s) {
      const blob = `${c.idMeli||""} ${c.nombre||""} ${c.slackId||""} ${c.rol||""} ${c.equipo||""}`.toLowerCase();
      if (!blob.includes(s)) return false;
    }
    return true;
  });
}

function renderGlobalFilters() {
  const rolesSel = safeEl("#fRoles");
  const equiposSel = safeEl("#fEquipos");
  const search = safeEl("#fSearch");
  const soloSlack = safeEl("#fSoloSlack");
  const clear = safeEl("#btnClearFilters");

  const roles = uniq(STATE.colaboradores.map(c => c.rol).filter(Boolean)).sort();
  const equipos = uniq(STATE.colaboradores.map(c => c.equipo).filter(Boolean)).sort();

  if (rolesSel) {
    rolesSel.innerHTML = roles.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
  }
  if (equiposSel) {
    equiposSel.innerHTML = equipos.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
  }

  // restore values
  if (search) search.value = FILTERS.search || "";
  if (soloSlack) soloSlack.checked = !!FILTERS.soloSlack;

  // re-select multi
  if (rolesSel) {
    for (const opt of Array.from(rolesSel.options)) opt.selected = (FILTERS.roles || []).includes(opt.value);
  }
  if (equiposSel) {
    for (const opt of Array.from(equiposSel.options)) opt.selected = (FILTERS.equipos || []).includes(opt.value);
  }

  const onChange = () => {
    FILTERS.search = search?.value || "";
    FILTERS.roles = getMultiValues(rolesSel);
    FILTERS.equipos = getMultiValues(equiposSel);
    FILTERS.soloSlack = !!soloSlack?.checked;
    render(); // dinámica y sin drama
  };

  if (search) search.oninput = onChange;
  if (rolesSel) rolesSel.onchange = onChange;
  if (equiposSel) equiposSel.onchange = onChange;
  if (soloSlack) soloSlack.onchange = onChange;

  if (clear) {
    clear.onclick = () => {
      FILTERS = { search: "", roles: [], equipos: [], soloSlack: false };
      renderGlobalFilters();
      render();
    };
  }
}

async function loadAll() {
  const [
    dash, templates, canales, colabs, flujos, habs,
    plan, outbox, presWeek, calidad
  ] = await Promise.all([
    API.dashboard().catch(() => null),
    API.comunicacionesTemplatesList().catch(() => []),
    API.canalesList().catch(() => []),
    API.colaboradoresList().catch(() => []),
    API.flujosList().catch(() => []),
    API.habilitacionesList().catch(() => []),
    API.planificacionList().catch(() => []),
    API.slackOutboxList().catch(() => []),
    API.presentismoWeek().catch(() => null),
    API.calidadPmList().catch(() => []),
  ]);

  STATE.dashboard = dash;
  STATE.templates = templates || [];
  STATE.canales = canales || [];
  STATE.colaboradores = colabs || [];
  STATE.flujos = flujos || [];
  STATE.habilitaciones = habs || [];
  STATE.plan = plan || [];
  STATE.outbox = outbox || [];
  STATE.presWeek = presWeek;
  STATE.calidad = calidad || [];
}

function render() {
  renderTabs();
  renderGlobalFilters();

  const app = safeEl("#app");
  if (!app) return;

  const r = currentRoute();
  if (r === "dashboard") return renderDashboard(app);
  if (r === "operativa") return renderOperativa(app);
  if (r === "comunicaciones") return renderComunicaciones(app);
  if (r === "colaboradores") return renderColaboradores(app);
  if (r === "habilitaciones") return renderHabilitaciones(app);
  if (r === "presentismo") return renderPresentismo(app);
  if (r === "calidad") return renderCalidad(app);
  if (r === "productividad") return renderProductividad(app);
}

function renderDashboard(app) {
  const colabsF = applyFiltersToColabs(STATE.colaboradores);
  const rolesCount = new Map();
  for (const c of colabsF) {
    const k = c.rol || "Sin rol";
    rolesCount.set(k, (rolesCount.get(k) || 0) + 1);
  }
  const rolesSorted = Array.from(rolesCount.entries()).sort((a,b) => b[1]-a[1]);

  const presentes = (STATE.presWeek?.rows || []).filter(r => r.hoy === "P");
  const presentesMap = new Map(presentes.map(x => [x.idMeli, x]));
  const presentesFiltrados = colabsF.filter(c => presentesMap.has(c.idMeli)).length;

  const outboxPend = (STATE.outbox || []).filter(x => String(x.estado||"").startsWith("PENDIENTE")).length;

  app.innerHTML = `
    <div class="sectionTitle">Dashboard</div>
    <div class="muted">Los KPIs respetan los filtros globales.</div>
    <div class="sep"></div>

    <div class="grid kpis">
      <div class="kpi"><div class="muted">Colaboradores (filtrados)</div><div class="v">${esc(colabsF.length)}</div></div>
      <div class="kpi"><div class="muted">Presentes hoy (filtrados)</div><div class="v">${esc(presentesFiltrados)}</div></div>
      <div class="kpi"><div class="muted">Flujos</div><div class="v">${esc(STATE.flujos.length)}</div></div>
      <div class="kpi"><div class="muted">Outbox pendientes</div><div class="v">${esc(outboxPend)}</div></div>
    </div>

    <div class="sep"></div>
    <div class="sectionTitle" style="font-size:16px;">Distribución por rol</div>
    <div class="row" style="gap:8px; flex-wrap:wrap;">
      ${rolesSorted.length ? rolesSorted.map(([rol, n]) => `<span class="pill"><strong>${esc(rol)}</strong> ${esc(n)}</span>`).join("") : `<span class="muted">Sin datos de rol.</span>`}
    </div>
  `;
}

function renderOperativa(app) {
  app.innerHTML = `
    <div class="sectionTitle">Operativa diaria</div>
    <div class="muted">Flujos + planificación + outbox. Todo consistente con Slack Channel ID.</div>

    <div class="sep"></div>

    <div class="sectionTitle" style="font-size:16px;">Flujos</div>
    <table>
      <thead>
        <tr>
          <th style="width:34%;">Flujo</th>
          <th style="width:18%;">Perfiles requeridos</th>
          <th style="width:34%;">Canal de Slack (Channel ID)</th>
          <th style="width:14%;">Acción</th>
        </tr>
      </thead>
      <tbody id="tbFlujos"></tbody>
    </table>

    <div class="row">
      <input id="newFlujo" placeholder="+ Nuevo flujo…" style="flex:2; min-width:180px;" />
      <input id="newPerfiles" type="number" min="0" value="0" style="flex:1; min-width:140px;" />
      <select id="newChannel" style="flex:2; min-width:220px;"></select>
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
    <div id="planCols">${STATE.plan.length ? "" : `<div class="muted">Sin planificación cargada.</div>`}</div>

    <div class="sep"></div>

    <div class="sectionTitle" style="font-size:16px;">Slack Outbox (pendientes)</div>
    <div class="muted">Editá canal/mensaje y enviá por fila o “Enviar todos”.</div>
    <div id="outBox" style="margin-top:10px;"></div>
  `;

  const sel = safeEl("#newChannel");
  if (sel) {
    sel.innerHTML = `<option value="">—</option>` + STATE.canales
      .map(c => `<option value="${esc(c.channel_id)}">${esc(c.canal)} (${esc(c.channel_id)})</option>`)
      .join("");
  }

  const tb = safeEl("#tbFlujos");
  if (tb) {
    tb.innerHTML = (STATE.flujos || []).map(f => `
      <tr data-flujo="${esc(f.flujo)}">
        <td><strong>${esc(f.flujo)}</strong></td>
        <td><input data-field="perfiles_requeridos" type="number" min="0" value="${esc(f.perfiles_requeridos ?? 0)}"/></td>
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
        <td><button class="btn danger" data-del="1">Borrar</button></td>
      </tr>
    `).join("");
  }

  renderPlanAsColumns();
  renderOutbox();

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
      render();
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
        render();
      } catch (err) { toast(err.message || String(err), true); }
      return;
    }

    if (e.target.id === "btnAddFlujo") {
      const nf = safeEl("#newFlujo")?.value?.trim();
      const np = Number(safeEl("#newPerfiles")?.value || 0);
      const nc = safeEl("#newChannel")?.value?.trim() || "";
      if (!nf) return toast("Poné un nombre de flujo", true);

      try {
        await API.flujosUpsert(nf, np, nc);
        toast("Flujo agregado");
        await refreshOperativa();
        render();
      } catch (err) { toast(err.message || String(err), true); }
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
        await API.slackOutboxEnviar();
        STATE.outbox = await API.slackOutboxList().catch(() => []);
      });
      render();
      return;
    }

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

function renderPlanAsColumns() {
  const box = safeEl("#planCols");
  if (!box) return;
  if (!STATE.plan?.length) return;

  // aplica filtros globales (sobre colaboradores asignados)
  const colabsF = applyFiltersToColabs(STATE.colaboradores);
  const allowedIds = new Set(colabsF.map(c => c.idMeli));

  const plan = (STATE.plan || []).filter(p => p.idMeli && p.idMeli !== "SIN PERFILES DISPONIBLES");

  const byFlujo = new Map();
  for (const r of plan) {
    if (!byFlujo.has(r.flujo)) byFlujo.set(r.flujo, []);
    if (allowedIds.size === 0 || allowedIds.has(r.idMeli)) byFlujo.get(r.flujo).push(r);
  }

  // orden: por cantidad desc para que quede visualmente “balanceado”
  const cols = Array.from(byFlujo.entries())
    .map(([flujo, rows]) => ({ flujo, rows }))
    .sort((a,b) => b.rows.length - a.rows.length);

  if (!cols.length) {
    box.innerHTML = `<div class="muted">No hay asignaciones visibles con los filtros actuales.</div>`;
    return;
  }

  // grid responsive: cantidad de columnas según ancho
  const maxRows = Math.max(...cols.map(c => c.rows.length));
  const colCount = cols.length;

  box.innerHTML = `
    <div style="overflow:auto;">
      <table>
        <thead>
          <tr>
            ${cols.map(c => `<th style="min-width:220px;">${esc(c.flujo)} <span class="muted">(${c.rows.length})</span></th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: maxRows }).map((_, i) => `
            <tr>
              ${cols.map(c => {
                const r = c.rows[i];
                if (!r) return `<td class="muted">—</td>`;
                const label = r.nombre ? `${esc(r.nombre)}` : `${esc(r.idMeli)}`;
                const fijo = r.esFijo === "SI" ? ` <span class="pill">Fijo</span>` : "";
                return `<td><strong>${label}</strong><div class="muted" style="font-size:12px;">${esc(r.idMeli)}</div>${fijo}</td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function runOp(msg, fn) {
  const st = safeEl("#opStatus");
  if (st) st.textContent = msg;
  try { await fn(); toast("OK"); }
  catch (err) { toast(err.message || String(err), true); }
  finally { if (st) st.textContent = ""; }
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
          <th style="width:140px;">Estado</th>
          <th style="width:120px;">Acción</th>
        </tr>
      </thead>
      <tbody>
        ${pendientes.map(r => `
          <tr>
            <td>${esc(fmtDateSlash(r.fecha))}</td>
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
        `).join("")}
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
    } catch (err) { toast(err.message || String(err), true); }
  };
}

function renderComunicaciones(app) {
  const templatesMap = new Map((STATE.templates || []).map(t => [t.key, t.template]));

  const colabsF = applyFiltersToColabs(STATE.colaboradores)
    .filter(c => (c.slackId || "").trim() !== "");

  app.innerHTML = `
    <div class="sectionTitle">Comunicaciones</div>
    <div class="muted">1) Personalizá templates de generación. 2) Enviá mensajes manuales a canales con @mentions.</div>

    <div class="sep"></div>

    <div class="sectionTitle" style="font-size:16px;">Templates de planificación</div>
    <div class="muted">Usados por “Generar Outbox”. Variables: {{lineas}} (solo GENERAL), {{flujo}}, {{mentions}}.</div>

    <div class="grid" style="grid-template-columns:1fr 1fr; gap:10px;">
      <div class="card">
        <div class="muted">GENERAL</div>
        <textarea id="tplGeneral">${esc(templatesMap.get("OUTBOX_GENERAL") || "")}</textarea>
        <div class="row" style="margin-top:10px;">
          <button class="btn primary" id="saveTplGeneral">Guardar</button>
          <button class="btn" id="resetTplGeneral">Default</button>
        </div>
      </div>
      <div class="card">
        <div class="muted">POR_FLUJO</div>
        <textarea id="tplPorFlujo">${esc(templatesMap.get("OUTBOX_POR_FLUJO") || "")}</textarea>
        <div class="row" style="margin-top:10px;">
          <button class="btn primary" id="saveTplPorFlujo">Guardar</button>
          <button class="btn" id="resetTplPorFlujo">Default</button>
        </div>
      </div>
    </div>

    <div class="sep"></div>

    <div class="sectionTitle" style="font-size:16px;">Enviar mensaje manual</div>
    <div class="row">
      <div style="flex:2; min-width:240px;">
        <label class="muted">Canal</label>
        <select id="cmChannel">
          <option value="">Elegí un canal…</option>
          ${STATE.canales.map(c => `<option value="${esc(c.channel_id)}">${esc(c.canal)} (${esc(c.channel_id)})</option>`).join("")}
        </select>
      </div>
      <div style="flex:2; min-width:240px;">
        <label class="muted">Mencionar (multi)</label>
        <select id="cmMentions" multiple size="6">
          ${colabsF.map(c => `<option value="${esc(c.slackId)}">${esc(c.nombre || c.idMeli)} (${esc(c.rol||"")})</option>`).join("")}
        </select>
        <div class="hint muted">Se insertan como &lt;@SLACK_ID&gt;.</div>
      </div>
      <div style="flex:3; min-width:280px;">
        <label class="muted">Mensaje</label>
        <textarea id="cmMsg" placeholder="Escribí tu mensaje…"></textarea>
      </div>
    </div>
    <div class="row" style="margin-top:10px;">
      <button class="btn primary" id="cmSend">Enviar a Slack</button>
      <span class="muted" id="cmStatus"></span>
    </div>
  `;

  const defaultGeneral =
`Muy buenos días equipo! :sunny: Les comparto cómo quedamos organizados para hoy:
{{lineas}}

Que tengan una excelente jornada :pepe_love:`;

  const defaultPorFlujo =
`*{{flujo}}*
{{mentions}}`;

  app.onclick = async (e) => {
    if (e.target.id === "resetTplGeneral") {
      safeEl("#tplGeneral").value = defaultGeneral;
      return;
    }
    if (e.target.id === "resetTplPorFlujo") {
      safeEl("#tplPorFlujo").value = defaultPorFlujo;
      return;
    }

    if (e.target.id === "saveTplGeneral") {
      try {
        await API.comunicacionesTemplatesUpsert("OUTBOX_GENERAL", safeEl("#tplGeneral").value || "");
        toast("Template GENERAL guardado");
        STATE.templates = await API.comunicacionesTemplatesList().catch(() => []);
        render();
      } catch (err) { toast(err.message || String(err), true); }
      return;
    }

    if (e.target.id === "saveTplPorFlujo") {
      try {
        await API.comunicacionesTemplatesUpsert("OUTBOX_POR_FLUJO", safeEl("#tplPorFlujo").value || "");
        toast("Template POR_FLUJO guardado");
        STATE.templates = await API.comunicacionesTemplatesList().catch(() => []);
        render();
      } catch (err) { toast(err.message || String(err), true); }
      return;
    }

    if (e.target.id === "cmSend") {
      const st = safeEl("#cmStatus");
      const channel_id = safeEl("#cmChannel")?.value || "";
      if (!channel_id) return toast("Elegí un canal", true);

      const mentions = getMultiValues(safeEl("#cmMentions"))
        .map(id => `<@${id}>`).join(" ");
      const msg = safeEl("#cmMsg")?.value || "";

      const text = `${mentions ? mentions + "\n" : ""}${msg}`.trim();
      if (!text) return toast("Escribí un mensaje", true);

      try {
        if (st) st.textContent = "Enviando…";
        await API.slackSend(channel_id, text);
        toast("Enviado");
        if (st) st.textContent = "";
        safeEl("#cmMsg").value = "";
      } catch (err) {
        if (st) st.textContent = "";
        toast(err.message || String(err), true);
      }
    }
  };
}

function renderColaboradores(app) {
  const colabsF = applyFiltersToColabs(STATE.colaboradores);

  app.innerHTML = `
    <div class="sectionTitle">Colaboradores</div>
    <div class="muted">Columnas: ID_MELI, Nombre, Rol, Equipo, Slack_ID, Activo (si existe). Respetan filtros globales.</div>
    <div class="sep"></div>

    <table>
      <thead>
        <tr>
          <th style="width:160px;">ID_MELI</th>
          <th>Nombre</th>
          <th style="width:180px;">Rol</th>
          <th style="width:180px;">Equipo</th>
          <th style="width:220px;">Slack_ID</th>
          <th style="width:110px;">Activo</th>
        </tr>
      </thead>
      <tbody>
        ${colabsF.map(c => `
          <tr>
            <td><strong>${esc(c.idMeli)}</strong></td>
            <td>${esc(c.nombre || "")}</td>
            <td>${esc(c.rol || "")}</td>
            <td>${esc(c.equipo || "")}</td>
            <td>${esc(c.slackId || "")}</td>
            <td>${c.activo == null ? "" : (c.activo ? "SI" : "NO")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderHabilitaciones(app) {
  const flujos = (STATE.flujos || []).map(f => f.flujo);
  const colabsF = applyFiltersToColabs(STATE.colaboradores);

  const habMap = new Map();
  for (const h of (STATE.habilitaciones || [])) {
    habMap.set(`${h.idMeli}||${h.flujo}`, { habilitado: !!h.habilitado, fijo: !!h.fijo });
  }

  app.innerHTML = `
    <div class="sectionTitle">Habilitaciones</div>
    <div class="muted">Habilitar y/o marcar fijo a cada usuario en cada flujo. Respetan filtros globales.</div>
    <div class="sep"></div>

    <div style="overflow:auto;">
      <table>
        <thead>
          <tr>
            <th style="min-width:220px;">Colaborador</th>
            ${flujos.map(f => `<th style="min-width:200px;">${esc(f)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${colabsF.map(c => `
            <tr>
              <td>
                <strong>${esc(c.nombre || c.idMeli)}</strong>
                <div class="muted" style="font-size:12px;">${esc(c.idMeli)} · ${esc(c.rol||"")} · ${esc(c.equipo||"")}</div>
              </td>
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
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  app.onchange = async (e) => {
    const el = e.target;
    if (!el?.matches?.("input[data-h-id]")) return;

    const idMeli = el.getAttribute("data-h-id");
    const flujo = el.getAttribute("data-h-flujo");

    const hab = app.querySelector(`input[data-h-id="${CSS.escape(idMeli)}"][data-h-flujo="${CSS.escape(flujo)}"][data-h-field="habilitado"]`)?.checked || false;
    const fijo = app.querySelector(`input[data-h-id="${CSS.escape(idMeli)}"][data-h-flujo="${CSS.escape(flujo)}"][data-h-field="fijo"]`)?.checked || false;

    try {
      await API.habilitacionesSet(idMeli, flujo, hab, fijo);
      toast("Guardado");
      STATE.habilitaciones = await API.habilitacionesList().catch(() => []);
    } catch (err) { toast(err.message || String(err), true); }
  };
}

function renderPresentismo(app) {
  const colabsF = applyFiltersToColabs(STATE.colaboradores);

  const week = STATE.presWeek;
  const headers = (week?.dates || []).map(d => fmtDateDMY(d));

  app.innerHTML = `
    <div class="sectionTitle">Presentismo</div>
    <div class="muted">Registrar licencia por rango. Vista semana hábil (5 días). Respetan filtros globales.</div>
    <div class="sep"></div>

    <div class="row">
      <div style="flex:2; min-width:240px;">
        <label class="muted">Colaborador</label>
        <select id="pColab">
          <option value="">Elegí colaborador…</option>
          ${colabsF.map(c => `<option value="${esc(c.idMeli)}">${esc(c.nombre || c.idMeli)} (${esc(c.idMeli)})</option>`).join("")}
        </select>
      </div>

      <div style="flex:1; min-width:180px;">
        <label class="muted">Desde</label>
        <input id="pDesde" type="date" />
        <div class="hint muted">Podés escribir también (yyyy-mm-dd).</div>
      </div>

      <div style="flex:1; min-width:180px;">
        <label class="muted">Hasta</label>
        <input id="pHasta" type="date" />
      </div>

      <div style="flex:1; min-width:170px;">
        <label class="muted">Tipo</label>
        <select id="pTipo">
          <option value="V">Vacaciones (V)</option>
          <option value="E">Enfermedad (E)</option>
          <option value="M">Médico (M)</option>
          <option value="MM">Mudanza (MM)</option>
          <option value="AI">Ausencia injustificada (AI)</option>
        </select>
      </div>

      <div style="min-width:140px;">
        <label class="muted">&nbsp;</label>
        <button id="pGuardar" class="btn primary" style="width:100%;">Guardar</button>
      </div>
    </div>

    <div class="sep"></div>

    <div class="sectionTitle" style="font-size:16px;">Semana hábil</div>
    ${week ? `
      <div style="overflow:auto;">
        <table>
          <thead>
            <tr>
              <th style="min-width:240px;">Colaborador</th>
              ${headers.map(h => `<th style="min-width:120px;">${esc(h)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${week.rows
              .filter(r => colabsF.some(c => c.idMeli === r.idMeli))
              .map(r => `
              <tr>
                <td>
                  <strong>${esc(r.nombre || r.idMeli)}</strong>
                  <div class="muted" style="font-size:12px;">${esc(r.idMeli)}</div>
                </td>
                ${r.estados.map(x => `<td>${esc(x || "")}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : `<div class="muted">No pude cargar semana. Revisá hoja Presentismo.</div>`}
  `;

  app.onclick = async (e) => {
    if (e.target.id !== "pGuardar") return;

    const idMeli = safeEl("#pColab")?.value || "";
    const desde = safeEl("#pDesde")?.value || "";
    const hasta = safeEl("#pHasta")?.value || "";
    const tipo = safeEl("#pTipo")?.value || "V";

    if (!idMeli) return toast("Elegí colaborador", true);
    if (!desde) return toast("Poné fecha desde", true);

    try {
      await API.habilitacionesList(); // noop: deja el fetch “caliente”
      await API.presentismoWeek(); // noop: valida backend
      await API.planificacionList(); // noop

      await API.post; // nothing

      // registro real
      await API.presentismoSetRango?.(idMeli, desde, hasta, tipo); // si existe
    } catch (e2) {
      // fallback al endpoint real (api.js lo tiene como presentismoSetRango)
    }

    try {
      await API.presentismoSetRango(idMeli, desde, hasta, tipo);
      toast("Ausencia registrada");
      STATE.presWeek = await API.presentismoWeek().catch(() => null);
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
    `;
    return;
  }

  app.innerHTML = `
    <div class="sectionTitle">Calidad PM</div>
    <div class="muted">Fuente: hoja “Calidad_PM”. Respetan filtros globales solo por búsqueda.</div>
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
        ${STATE.calidad.map(r => `
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
    <div class="muted">Placeholder: definimos fuente (Sheets/Looker/API) y métricas. Hoy no invento números.</div>
  `;
}

async function init() {
  window.addEventListener("error", (e) => toast(e?.message || "Error", true));
  window.addEventListener("unhandledrejection", (e) => toast(e?.reason?.message || String(e.reason || "Promise error"), true));

  const btnHealth = safeEl("#btnHealth");
  if (btnHealth) {
    btnHealth.onclick = async () => {
      try {
        const x = await API.health();
        toast(`OK: ${x?.spreadsheetId || "health"}`);
      } catch (err) { toast(err.message || String(err), true); }
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
