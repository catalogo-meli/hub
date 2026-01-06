import HUB from "./api.js";

const $ = (sel) => document.querySelector(sel);

const TABS = [
  { key: "operativa", label: "Operativa diaria" },
  { key: "colaboradores", label: "Colaboradores" },
  { key: "habilitaciones", label: "Habilitaciones" },
  { key: "presentismo", label: "Presentismo" },
];

const state = {
  tab: "operativa",
  cache: {},
  filtros: {
    q: "",
    rol: "ALL",
    equipo: "ALL",
    ubicacion: "ALL",
  },
};

init();

function init() {
  renderTabs();
  $("#healthBtn").addEventListener("click", async () => {
    await HUB.health();
    toast("Health OK");
  });

  $("#themeBtn").addEventListener("click", () => {
    document.body.classList.toggle("light");
  });

  loadTab("operativa");
}

function renderTabs() {
  const el = $("#tabs");
  el.innerHTML = "";
  TABS.forEach((t) => {
    const b = document.createElement("button");
    b.className = `tab ${state.tab === t.key ? "active" : ""}`;
    b.textContent = t.label;
    b.onclick = () => {
      state.tab = t.key;
      state.filtros = { q: "", rol: "ALL", equipo: "ALL", ubicacion: "ALL" };
      renderTabs();
      loadTab(t.key);
    };
    el.appendChild(b);
  });
}

function setCards(cards) {
  const el = $("#cards");
  el.innerHTML = "";
  cards.forEach((c) => {
    const div = document.createElement("div");
    div.className = `card kpi ${c.onClick ? "clickable" : ""}`;
    div.innerHTML = `<div class="label">${esc(c.label)}</div><div class="value">${esc(c.value)}</div><div class="muted">${esc(c.sub || "")}</div>`;
    if (c.onClick) div.onclick = c.onClick;
    el.appendChild(div);
  });
}

function setControls(html) {
  $("#controls").innerHTML = html;
}

function setContent(html) {
  $("#content").innerHTML = html;
}

function setStatus(msg) {
  $("#status").textContent = msg || "";
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function applyFilters(rows) {
  const q = (state.filtros.q || "").toLowerCase().trim();
  const rol = state.filtros.rol;
  const equipo = state.filtros.equipo;
  const ubic = state.filtros.ubicacion;

  return rows.filter((r) => {
    if (rol !== "ALL" && String(r.Rol) !== rol) return false;
    if (equipo !== "ALL" && String(r.Equipo) !== equipo) return false;
    if (ubic !== "ALL" && String(r["Ubicación"]) !== ubic) return false;

    if (!q) return true;
    const hay = [
      r.ID_MELI, r.Nombre, r.TAG, r.Rol, r.Equipo, r["Ubicación"],
      r["Mail Productora"], r["Mail Externo"], r["Fecha Ingreso"]
    ].map(x => String(x || "").toLowerCase());
    return hay.some(v => v.includes(q));
  });
}

function clickFilter(key, value) {
  if (!value) return;
  if (key === "Rol") state.filtros.rol = value;
  if (key === "Equipo") state.filtros.equipo = value;
  if (key === "Ubicación") state.filtros.ubicacion = value;
  loadTab(state.tab);
}

function copyCell(value) {
  navigator.clipboard?.writeText(String(value ?? ""));
  toast("Copiado");
}

/* =========================
   TABS
========================= */

async function loadTab(tab) {
  setStatus("");
  setControls("");
  setCards([]);
  setContent("Cargando...");

  if (tab === "operativa") return tabOperativa();
  if (tab === "colaboradores") return tabColaboradores();
  if (tab === "habilitaciones") return tabHabilitaciones();
  if (tab === "presentismo") return tabPresentismo();
}

/* -------------------------
   Operativa diaria (unificada)
   1) Flujos (autosave)
   2) Planificación (agrupada)
   3) Slack Outbox (editar/copy/enviar)
------------------------- */
async function tabOperativa() {
  const [stats, flujos, canales] = await Promise.all([
    HUB.presentismoStats(),
    HUB.flujosList(),
    HUB.canalesList(),
  ]);

  // Cards: Analistas totales, Licencias hoy, Perfiles disponibles (hoy)
  setCards([
    { label: "Analistas totales", value: String(stats.analistas || 0) },
    { label: "Licencias hoy", value: String(stats.licencias || 0) },
    { label: "Perfiles disponibles (hoy)", value: String(stats.disponibles || 0) },
  ]);

  // Flujos UI
  const channelOptions = canales.map(c => ({
    label: c.Canal || c.Slack_channel,
    value: c.Slack_channel || c.Canal
  }));

  setControls(`
    <button class="btn primary" id="btnPlan">Generar planificación</button>
    <button class="btn" id="btnOutbox">Generar Outbox</button>
    <button class="btn" id="btnEnviar">Enviar pendientes</button>
  `);

  $("#btnPlan").onclick = async () => {
    await HUB.planificacionGenerar();
    toast("Planificación generada");
    return tabOperativa();
  };
  $("#btnOutbox").onclick = async () => {
    await HUB.slackOutboxGenerar();
    toast("Outbox generado");
    return tabOperativa();
  };
  $("#btnEnviar").onclick = async () => {
    const r = await HUB.slackOutboxEnviar({ all: true });
    toast(`Enviados: ${r.sent || 0}`);
    return tabOperativa();
  };

  // Render 1) Flujos
  const flujosHtml = `
    <div class="card" style="margin-bottom:12px;">
      <h3 style="margin:0 0 10px 0;">1) Flujos (Perfiles requeridos)</h3>
      <div class="muted">Autosave: se guarda al cambiar Slack channel o Perfiles requeridos.</div>
      <div style="margin-top:10px; overflow:auto;">
        <table>
          <thead>
            <tr>
              <th>Flujo</th>
              <th>Slack channel</th>
              <th>Perfiles requeridos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${flujos.map(f => flujoRow_(f, channelOptions)).join("")}
            ${nuevoFlujoRow_(channelOptions)}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Render 2) Planificación agrupada
  const plan = await HUB.planificacionList();
  const planByFlujo = {};
  plan.forEach(p => {
    const k = String(p.Flujo || "").trim();
    if (!k) return;
    if (!planByFlujo[k]) planByFlujo[k] = [];
    planByFlujo[k].push(p);
  });

  const fechaPlan = plan?.[0]?.Fecha || "";
  const planHtml = `
    <div class="card" style="margin-bottom:12px;">
      <h3 style="margin:0 0 10px 0;">2) Planificación (resultado) ${fechaPlan ? `— ${esc(fechaPlan)}` : ""}</h3>
      ${Object.keys(planByFlujo).length === 0 ? `<div class="muted">Sin datos. Generá planificación.</div>` : `
        <div class="grid2">
          ${Object.entries(planByFlujo).map(([flujo, rows]) => `
            <div class="card">
              <div style="font-weight:700; margin-bottom:8px;">${esc(flujo)}</div>
              <div class="muted">Perfiles requeridos: ${esc(rows?.[0]?.Perfiles_requeridos ?? "")}</div>
            </div>
          `).join("")}
        </div>
      `}
    </div>
  `;

  // Render 3) Slack Outbox
  const outbox = await HUB.slackOutboxList();
  const outHtml = `
    <div class="card">
      <h3 style="margin:0 0 10px 0;">3) Slack Outbox (pendientes)</h3>
      ${outbox.length === 0 ? `<div class="muted">Sin datos. Generá Outbox.</div>` : `
        <div style="overflow:auto;">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Canal</th>
                <th>Mensaje</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${outbox.map((r, i) => outboxRow_(r, i+2, channelOptions)).join("")}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  setContent(flujosHtml + planHtml + outHtml);

  bindFlujosAutosave_(channelOptions);
  bindOutboxActions_();
}

function flujoRow_(f, channelOptions) {
  const flujo = String(f.Flujo || "");
  const slack = String(f.Slack_channel || "");
  const req = Number(f.Perfiles_requeridos || 0);

  return `
    <tr data-flujo="${esc(flujo)}">
      <td>
        <input class="input flujoName" value="${esc(flujo)}" disabled />
      </td>
      <td>
        <select class="slackSel">
          <option value="">—</option>
          ${channelOptions.map(o => `<option value="${esc(o.value)}" ${o.value===slack?"selected":""}>${esc(o.label)}</option>`).join("")}
        </select>
      </td>
      <td>
        <input class="input reqInp" type="number" min="0" value="${esc(req)}" style="width:120px;" />
      </td>
      <td>
        <button class="btn btnDel" data-del="${esc(flujo)}" style="border-color:rgba(255,80,80,.35);">Borrar</button>
      </td>
    </tr>
  `;
}

function nuevoFlujoRow_(channelOptions) {
  return `
    <tr data-new="1">
      <td><input class="input newFlujo" placeholder="+ Nuevo flujo..." /></td>
      <td>
        <select class="newSlack">
          <option value="">—</option>
          ${channelOptions.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}
        </select>
      </td>
      <td><input class="input newReq" type="number" min="0" value="0" style="width:120px;" /></td>
      <td><button class="btn primary newAdd">Agregar</button></td>
    </tr>
  `;
}

function bindFlujosAutosave_() {
  // autosave on change
  document.querySelectorAll("tr[data-flujo]").forEach(tr => {
    const flujo = tr.getAttribute("data-flujo");
    const sel = tr.querySelector(".slackSel");
    const inp = tr.querySelector(".reqInp");
    const del = tr.querySelector(".btnDel");

    sel.onchange = debounce(async () => {
      await HUB.flujosUpsert({ flujo, slack_channel: sel.value, perfiles_requeridos: Number(inp.value || 0) });
      toast("Guardado");
    }, 250);

    inp.oninput = debounce(async () => {
      await HUB.flujosUpsert({ flujo, slack_channel: sel.value, perfiles_requeridos: Number(inp.value || 0) });
      toast("Guardado");
    }, 350);

    del.onclick = async () => {
      if (!confirm(`Borrar flujo "${flujo}"?`)) return;
      await HUB.flujosDelete({ flujo });
      toast("Flujo borrado");
      await tabOperativa();
    };
  });

  // add new flow
  const newRow = document.querySelector("tr[data-new='1']");
  if (newRow) {
    newRow.querySelector(".newAdd").onclick = async () => {
      const flujo = String(newRow.querySelector(".newFlujo").value || "").trim();
      const slack = String(newRow.querySelector(".newSlack").value || "").trim();
      const req = Number(newRow.querySelector(".newReq").value || 0);
      if (!flujo) return toast("Ingresá un nombre de flujo");
      await HUB.flujosUpsert({ flujo, slack_channel: slack, perfiles_requeridos: req });
      toast("Flujo creado");
      await tabOperativa();
    };
  }
}

function outboxRow_(r, rowNum, channelOptions) {
  const fecha = String(r.Fecha || "");
  const canal = String(r.Canal || "");
  const msg = String(r.Mensaje || "");
  const estado = String(r.Estado || "");

  return `
    <tr data-outrow="${rowNum}">
      <td>${esc(fecha)}</td>
      <td>
        <select class="outCanal">
          <option value="">—</option>
          ${channelOptions.map(o => `<option value="${esc(o.value)}" ${o.value===canal?"selected":""}>${esc(o.label)}</option>`).join("")}
        </select>
      </td>
      <td>
        <textarea class="input outMsg" rows="3" style="min-width:420px;">${esc(msg)}</textarea>
        <div class="row" style="margin-top:6px;">
          <button class="btn outCopy">Copiar</button>
          <button class="btn primary outSend">Enviar</button>
        </div>
      </td>
      <td>${esc(estado)}</td>
      <td></td>
    </tr>
  `;
}

function bindOutboxActions_() {
  document.querySelectorAll("tr[data-outrow]").forEach(tr => {
    const row = Number(tr.getAttribute("data-outrow"));
    const copy = tr.querySelector(".outCopy");
    const send = tr.querySelector(".outSend");
    const msg = tr.querySelector(".outMsg");

    copy.onclick = () => copyCell(msg.value);
    send.onclick = async () => {
      const r = await HUB.slackOutboxEnviar({ row });
      toast(`Enviados: ${r.sent || 0}`);
      await tabOperativa();
    };
  });
}

/* -------------------------
   Colaboradores
------------------------- */
async function tabColaboradores() {
  const all = await HUB.colaboradoresList();

  // filtros disponibles
  const roles = uniq(all.map(r => r.Rol));
  const equipos = uniq(all.map(r => r.Equipo));
  const ubics = uniq(all.map(r => r["Ubicación"]));

  const filtered = applyFilters(all);

  // cards dinámicas según filtros: total analistas + por rol (PM/KV/QA)
  const analistas = filtered.filter(r => String(r.Rol).toLowerCase().includes("analista"));
  const pm = analistas.filter(r => String(r.Rol).includes("PM")).length;
  const kv = analistas.filter(r => String(r.Rol).includes("KV")).length;
  const qa = analistas.filter(r => String(r.Rol).includes("QA")).length;

  setCards([
    { label: "Colaboradores (Analistas)", value: String(analistas.length) },
    { label: "Analistas PM", value: String(pm), onClick: () => clickFilter("Rol", "Analista PM") },
    { label: "Analistas KV", value: String(kv), onClick: () => clickFilter("Rol", "Analista KV") },
    { label: "Analistas QA", value: String(qa), onClick: () => clickFilter("Rol", "Analista QA") },
  ]);

  setControls(`
    <input id="q" class="input" placeholder="Buscar..." style="min-width:300px;" value="${esc(state.filtros.q)}"/>
    <select id="rol" class="input">
      <option value="ALL">Rol (todos)</option>
      ${roles.map(x => `<option ${x===state.filtros.rol?"selected":""}>${esc(x)}</option>`).join("")}
    </select>
    <select id="equipo" class="input">
      <option value="ALL">Equipo (todos)</option>
      ${equipos.map(x => `<option ${x===state.filtros.equipo?"selected":""}>${esc(x)}</option>`).join("")}
    </select>
    <select id="ubic" class="input">
      <option value="ALL">Ubicación (todas)</option>
      ${ubics.map(x => `<option ${x===state.filtros.ubicacion?"selected":""}>${esc(x)}</option>`).join("")}
    </select>
  `);

  $("#q").oninput = (e) => { state.filtros.q = e.target.value; tabColaboradores(); };
  $("#rol").onchange = (e) => { state.filtros.rol = e.target.value; tabColaboradores(); };
  $("#equipo").onchange = (e) => { state.filtros.equipo = e.target.value; tabColaboradores(); };
  $("#ubic").onchange = (e) => { state.filtros.ubicacion = e.target.value; tabColaboradores(); };

  const rows = analistas;

  setContent(`
    <div style="overflow:auto;">
      <table>
        <thead>
          <tr>
            <th>ID_MELI</th>
            <th>TAG</th>
            <th>Rol</th>
            <th>Equipo</th>
            <th>Ubicación</th>
            <th>Mail Productora</th>
            <th>Mail Externo</th>
            <th>Fecha ingreso</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              ${cellCopy_(r.ID_MELI)}
              ${cellCopy_(r.TAG)}
              ${cellFilterOrCopy_("Rol", r.Rol)}
              ${cellFilterOrCopy_("Equipo", r.Equipo)}
              ${cellFilterOrCopy_("Ubicación", r["Ubicación"])}
              ${cellCopy_(r["Mail Productora"])}
              ${cellCopy_(r["Mail Externo"])}
              ${cellCopy_(r["Fecha Ingreso"])}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `);

  setStatus(`Mostrando ${rows.length}/${all.length}`);
}

/* -------------------------
   Habilitaciones
------------------------- */
async function tabHabilitaciones() {
  const { flujos, rows } = await HUB.habilitacionesList();

  // Solo filtro por Equipo (vos pediste eliminar rol/ubic)
  const equipos = uniq(rows.map(r => r.Equipo));
  const q = (state.filtros.q || "").toLowerCase().trim();
  const equipo = state.filtros.equipo;

  const filtered = rows.filter(r => {
    if (equipo !== "ALL" && String(r.Equipo) !== equipo) return false;
    if (!q) return true;
    return [r.ID_MELI, r.Nombre, r.Equipo].some(x => String(x||"").toLowerCase().includes(q));
  });

  setCards([
    { label: "Colaboradores (Analistas)", value: String(filtered.length) },
    { label: "Flujos", value: String(flujos.length) },
    { label: "", value: "", sub: "" },
  ]);

  setControls(`
    <input id="q" class="input" placeholder="Buscar..." style="min-width:300px;" value="${esc(state.filtros.q)}"/>
    <select id="equipo" class="input">
      <option value="ALL">Equipo (todos)</option>
      ${equipos.map(x => `<option ${x===equipo?"selected":""}>${esc(x)}</option>`).join("")}
    </select>
  `);

  $("#q").oninput = (e) => { state.filtros.q = e.target.value; tabHabilitaciones(); };
  $("#equipo").onchange = (e) => { state.filtros.equipo = e.target.value; tabHabilitaciones(); };

  // tabla: ID, Nombre, Equipo + por flujo (H/F)
  setContent(`
    <div style="overflow:auto;">
      <table>
        <thead>
          <tr>
            <th>ID_MELI</th>
            <th>Nombre</th>
            <th>Equipo</th>
            ${flujos.map(f => `<th>${esc(f)}<div class="muted">H / F</div></th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${filtered.map(r => `
            <tr data-id="${esc(r.ID_MELI)}">
              ${cellCopy_(r.ID_MELI)}
              ${cellCopy_(r.Nombre)}
              <td class="clickcopy" data-filter="Equipo" data-value="${esc(r.Equipo)}">${esc(r.Equipo)}</td>
              ${flujos.map(f => {
                const v = r.perFlujo?.[f] || { habilitado:false, fijo:false };
                return `
                  <td>
                    <label><input type="checkbox" data-flow="${esc(f)}" data-kind="H" ${v.habilitado?"checked":""}/> H</label>
                    <label style="margin-left:8px;"><input type="checkbox" data-flow="${esc(f)}" data-kind="F" ${v.fijo?"checked":""}/> F</label>
                  </td>
                `;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `);

  // bind checkboxes
  document.querySelectorAll("tr[data-id] input[type='checkbox']").forEach(cb => {
    cb.onchange = async (e) => {
      const tr = e.target.closest("tr");
      const idMeli = tr.getAttribute("data-id");
      const flujo = e.target.getAttribute("data-flow");
      const kind = e.target.getAttribute("data-kind");
      const checked = e.target.checked;

      try {
        if (kind === "H") await HUB.habilitacionesSet({ idMeli, flujo, habilitado: checked });
        else await HUB.habilitacionesSet({ idMeli, flujo, fijo: checked });
        toast("Guardado");
      } catch (err) {
        toast("Error guardando");
        e.target.checked = !checked;
      }
    };
  });

  // click filter equipo
  document.querySelectorAll("[data-filter='Equipo']").forEach(td => {
    td.onclick = () => clickFilter("Equipo", td.getAttribute("data-value"));
  });

  setStatus(`Mostrando ${filtered.length}/${rows.length}`);
}

/* -------------------------
   Presentismo (semana hábil + panel licencias)
------------------------- */
async function tabPresentismo() {
  const week = await HUB.presentismoWeek();
  const stats = await HUB.presentismoStats();

  // cards: presentes hoy, fecha hoy, licencias hoy
  setCards([
    { label: "Colaboradores presentes (hoy)", value: String(stats.presentes || 0) },
    { label: "Fecha", value: String(stats.date || "") },
    { label: "Licencias hoy", value: String(stats.licencias || 0) },
  ]);

  // filtros + panel licencias
  const equipos = uniq(week.rows.map(r => r.Equipo));
  const roles = uniq(week.rows.map(r => r.Rol));
  const ubics = uniq(week.rows.map(r => r["Ubicación"]));

  setControls(`
    <input id="q" class="input" placeholder="Buscar..." style="min-width:280px;" value="${esc(state.filtros.q)}"/>
    <select id="rol" class="input">
      <option value="ALL">Rol (todos)</option>
      ${roles.map(x => `<option ${x===state.filtros.rol?"selected":""}>${esc(x)}</option>`).join("")}
    </select>
    <select id="equipo" class="input">
      <option value="ALL">Equipo (todos)</option>
      ${equipos.map(x => `<option ${x===state.filtros.equipo?"selected":""}>${esc(x)}</option>`).join("")}
    </select>
    <select id="ubic" class="input">
      <option value="ALL">Ubicación (todas)</option>
      ${ubics.map(x => `<option ${x===state.filtros.ubicacion?"selected":""}>${esc(x)}</option>`).join("")}
    </select>
  `);

  $("#q").oninput = (e) => { state.filtros.q = e.target.value; tabPresentismo(); };
  $("#rol").onchange = (e) => { state.filtros.rol = e.target.value; tabPresentismo(); };
  $("#equipo").onchange = (e) => { state.filtros.equipo = e.target.value; tabPresentismo(); };
  $("#ubic").onchange = (e) => { state.filtros.ubicacion = e.target.value; tabPresentismo(); };

  const filtered = applyFilters(week.rows.map(r => ({
    ID_MELI: r.ID_MELI,
    Nombre: r.Nombre,
    Rol: r.Rol,
    Equipo: r.Equipo,
    "Ubicación": r["Ubicación"],
    Dias_trabajados: r.Dias_trabajados,
    days: r.days
  })));

  setContent(`
    <div class="card" style="margin-bottom:12px;">
      <h3 style="margin:0 0 10px 0;">Cargar licencia</h3>
      <div class="row">
        <select id="licId" class="input" style="min-width:280px;">
          <option value="">Colaborador...</option>
          ${week.rows.map(r => `<option value="${esc(r.ID_MELI)}">${esc(r.Nombre)} — ${esc(r.ID_MELI)}</option>`).join("")}
        </select>
        <input id="licDesde" class="input" type="date"/>
        <input id="licHasta" class="input" type="date"/>
        <select id="licTipo" class="input">
          <option value="E">E = Día de Estudio</option>
          <option value="M">M = Licencia Médica</option>
          <option value="MM">MM = Licencia Médica Menor</option>
          <option value="AI">AI = Ausencia Injustificada</option>
          <option value="V">V = Vacaciones</option>
          <option value="P">P = Presente</option>
        </select>
        <button id="licSave" class="btn primary">Guardar</button>
      </div>
    </div>

    <div style="overflow:auto;">
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>ID_MELI</th>
            <th>Rol</th>
            <th>Equipo</th>
            <th>Ubicación</th>
            <th>Días trabajados</th>
            ${week.days.map(d => `<th>${esc(d.short)}<div class="muted">${esc(d.label)}</div></th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${filtered.map(r => `
            <tr>
              ${cellCopy_(r.Nombre)}
              ${cellCopy_(r.ID_MELI)}
              ${cellFilterOrCopy_("Rol", r.Rol)}
              ${cellFilterOrCopy_("Equipo", r.Equipo)}
              ${cellFilterOrCopy_("Ubicación", r["Ubicación"])}
              ${cellCopy_(r.Dias_trabajados)}
              ${week.days.map(d => cellCopy_(r.days?.[d.key] || "")).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `);

  $("#licSave").onclick = async () => {
    const idMeli = $("#licId").value;
    const desde = $("#licDesde").value;
    const hasta = $("#licHasta").value;
    const tipo = $("#licTipo").value;
    if (!idMeli || !desde || !hasta || !tipo) return toast("Completar todos los campos");
    await HUB.presentismoLicenciasSet({ idMeli, desde, hasta, tipo });
    toast("Licencia guardada");
    await tabPresentismo();
  };

  // filtros clickeables en tabla
  document.querySelectorAll("[data-filter]").forEach(td => {
    td.onclick = () => clickFilter(td.getAttribute("data-filter"), td.getAttribute("data-value"));
  });

  setStatus(`Mostrando ${filtered.length}/${week.rows.length}`);
}

/* =========================
   cells helpers
========================= */
function cellCopy_(value) {
  return `<td class="clickcopy" data-copy="${esc(value)}">${esc(value)}</td>`;
}
function cellFilterOrCopy_(key, value) {
  return `<td class="clickcopy" data-filter="${esc(key)}" data-value="${esc(value)}">${esc(value)}</td>`;
}

// bind copy behavior globally
document.addEventListener("click", (e) => {
  const td = e.target.closest(".clickcopy");
  if (!td) return;

  const filterKey = td.getAttribute("data-filter");
  if (filterKey) {
    clickFilter(filterKey, td.getAttribute("data-value"));
    return;
  }

  const v = td.getAttribute("data-copy") ?? td.textContent;
  copyCell(v);
});

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
