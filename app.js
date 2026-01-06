import { HUB } from "./api.js";

const $ = (s) => document.querySelector(s);

const state = {
  tab: "operativa",
  cache: {
    colaboradores: null,
    canales: null,
    flujos: null,
    habilitaciones: null,
    planificacion: null,
    outbox: null,
    presentismoToday: null,
    presentismoDay: null,
  },
  // filtros globales
  filters: { equipo: "", rol: "", ubicacion: "" },
  // presentismo
  presentismoDayKey: null,
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
  $("#healthBtn").addEventListener("click", runHealth);
  loadTab(state.tab, true);
  runHealth().catch(() => {});
}

function setStatus(msg) { $("#status").textContent = msg; }
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function toast(type, title, msg) {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<div class="t">${escapeHtml(title)}</div><div class="m">${escapeHtml(msg)}</div>`;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 3800);
}
function setCards(cards) {
  const el = $("#cards");
  el.innerHTML = "";
  cards.forEach(c => {
    const node = document.createElement("div");
    node.className = "kpi";
    node.innerHTML = `<div class="label">${escapeHtml(c.label)}</div><div class="value">${escapeHtml(c.value)}</div>${c.sub ? `<div class="small">${escapeHtml(c.sub)}</div>` : ""}`;
    el.appendChild(node);
  });
}

function renderTabs() {
  const el = $("#tabs");
  el.innerHTML = "";
  TABS.forEach(t => {
    const b = document.createElement("button");
    b.className = `tab ${state.tab === t.key ? "active" : ""}`;
    b.textContent = t.label;
    b.addEventListener("click", () => {
      state.tab = t.key;
      renderTabs();
      loadTab(t.key, false);
    });
    el.appendChild(b);
  });
}

async function runHealth() {
  $("#healthDot").className = "dot";
  $("#healthText").textContent = "…";
  try {
    await HUB.health();
    $("#healthDot").className = "dot ok";
    $("#healthText").textContent = "ok";
    return true;
  } catch (e) {
    $("#healthDot").className = "dot bad";
    $("#healthText").textContent = "fail";
    toast("bad", "Health FAIL", e.message || "No responde");
    throw e;
  }
}

async function loadTab(tab, force) {
  $("#controls").innerHTML = "";
  $("#content").innerHTML = "";
  $("#cards").innerHTML = "";
  setStatus("Cargando…");

  try {
    if (tab === "operativa") return await tabOperativa(force);
    if (tab === "colaboradores") return await tabColaboradores(force);
    if (tab === "habilitaciones") return await tabHabilitaciones(force);
    if (tab === "presentismo") return await tabPresentismo(force);
  } catch (e) {
    setStatus("Error.");
    $("#content").innerHTML = `<div class="empty">Falló: <span class="mono">${escapeHtml(e.message || String(e))}</span></div>`;
    toast("bad", "Error", e.message || String(e));
  }
}

/* ----------------------------
   Helpers UI
---------------------------- */

function copyText(txt) {
  navigator.clipboard.writeText(String(txt ?? "")).then(
    () => toast("good", "Copiado", "Al portapapeles."),
    () => toast("bad", "Error", "No pude copiar.")
  );
}

function fmtDateDDMMYYYY(x) {
  // recibe string o Date; si es string yyyy-mm-dd -> dd/mm/yyyy
  if (!x) return "";
  const s = String(x);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y,m,d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  // fallback: si viene "dd/MM/yyyy" ya está
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2,"0");
      const mm = String(d.getMonth()+1).padStart(2,"0");
      const yy = d.getFullYear();
      return `${dd}/${mm}/${yy}`;
    }
  } catch {}
  return s;
}

function unique(arr) { return [...new Set(arr.filter(Boolean))]; }

/* ----------------------------
   TAB: Operativa diaria
   (Flujos -> Generar planificación -> Slack Outbox)
---------------------------- */
async function tabOperativa(force) {
  setStatus("Cargando operativa…");

  const [presentismo, flujos, canales] = await Promise.all([
    (force || !state.cache.presentismoToday) ? HUB.presentismoSummaryToday() : state.cache.presentismoToday,
    (force || !state.cache.flujos) ? HUB.flujosList() : state.cache.flujos,
    (force || !state.cache.canales) ? HUB.canalesList() : state.cache.canales,
  ]);

  state.cache.presentismoToday = presentismo;
  state.cache.flujos = flujos;
  state.cache.canales = canales;

  setCards([
    { label: "Perfiles disponibles (hoy)", value: String(presentismo.disponibles ?? 0), sub: `Fecha: ${presentismo.label || "-"}` },
    { label: "Licencias hoy", value: String(presentismo.licencias ?? 0) },
    { label: "Analistas totales", value: String(presentismo.totalAnalistas ?? 0) },
  ]);

  const channelOptions = unique(canales.map(c => c.Canal || c.Channel || c.Nombre)).sort();

  $("#controls").innerHTML = `
    <div class="row">
      <div class="badge">Paso 1: definí perfiles por flujo (autosave)</div>
      <div class="badge">Paso 2: generá planificación (recalcula todo)</div>
      <div class="badge">Paso 3: generá outbox y enviá</div>
    </div>
    <div class="row">
      <button class="btn" id="btnGenPlan">Generar planificación</button>
      <button class="btn" id="btnGenOut">Generar Outbox</button>
      <button class="btn primary" id="btnSendAll">Enviar pendientes</button>
    </div>
  `;

  $("#btnGenPlan").addEventListener("click", async () => {
    setStatus("Generando planificación…");
    const r = await HUB.planificacionGenerar();
    toast("good", "Planificación generada", `${r.rows} filas para ${r.fecha}`);
    // refrescar vistas
    state.cache.planificacion = null;
    await renderOperativaSections(channelOptions);
  });

  $("#btnGenOut").addEventListener("click", async () => {
    setStatus("Generando outbox…");
    const r = await HUB.slackOutboxGenerar();
    toast("good", "Outbox generado", `${r.rows} mensajes`);
    state.cache.outbox = null;
    await renderOperativaSections(channelOptions);
  });

  $("#btnSendAll").addEventListener("click", async () => {
    setStatus("Enviando…");
    const r = await HUB.slackOutboxEnviar();
    toast("good", "Slack", `Enviados: ${r.sent} | Errores: ${r.errors}`);
    state.cache.outbox = null;
    await renderOperativaSections(channelOptions);
  });

  await renderOperativaSections(channelOptions);

  setStatus("Listo.");
}

async function renderOperativaSections(channelOptions) {
  const [flujos, plan, outbox] = await Promise.all([
    HUB.flujosList(),
    HUB.planificacionList(),
    HUB.slackOutboxList(),
  ]);

  state.cache.flujos = flujos;
  state.cache.planificacion = plan;
  state.cache.outbox = outbox;

  const container = $("#content");
  container.innerHTML = `
    <div class="section">
      <h3>1) Flujos (Perfiles requeridos)</h3>
      <div id="flujosTable"></div>
      <div class="row">
        <button class="btn" id="btnAddFlujo">+ Nuevo flujo…</button>
      </div>
    </div>

    <div class="section">
      <h3>2) Planificación (resultado)</h3>
      <div id="planWrap"></div>
    </div>

    <div class="section">
      <h3>3) Slack Outbox (pendientes)</h3>
      <div id="outboxWrap"></div>
    </div>
  `;

  renderFlujosInline(flujos, channelOptions);
  renderPlanificacionGrouped(plan);
  renderOutbox(outbox, channelOptions);

  $("#btnAddFlujo").addEventListener("click", async () => {
    const flujo = prompt("Nombre del flujo (nuevo):");
    if (!flujo) return;
    await HUB.flujosUpsert({ flujo, slack_channel: "", perfiles_requeridos: 0 });
    toast("good", "Flujo creado", flujo);
    await renderOperativaSections(channelOptions);
  });
}

/* ---------- Flujos inline autosave ---------- */
function renderFlujosInline(flujos, channelOptions) {
  const el = $("#flujosTable");

  const rows = flujos.map(f => ({
    Flujo: String(f.Flujo || ""),
    Slack_channel: String(f.Slack_channel || ""),
    Perfiles_requeridos: String(f.Perfiles_requeridos ?? ""),
  }));

  el.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Flujo</th>
          <th>Slack channel</th>
          <th>Perfiles requeridos</th>
          <th style="width:120px"></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr data-flujo="${escapeHtml(r.Flujo)}">
            <td>
              <input class="in flujo" value="${escapeHtml(r.Flujo)}" disabled />
            </td>
            <td>
              <select class="in slack">
                <option value="">—</option>
                ${channelOptions.map(c => `<option value="${escapeHtml(c)}" ${c===r.Slack_channel?"selected":""}>${escapeHtml(c)}</option>`).join("")}
              </select>
            </td>
            <td>
              <input class="in perf" type="number" min="0" value="${escapeHtml(r.Perfiles_requeridos)}" />
            </td>
            <td>
              <button class="btn danger del">Borrar</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div class="small">Autosave: se guarda al cambiar Slack channel o Perfiles requeridos.</div>
  `;

  // autosave
  el.querySelectorAll("tr[data-flujo]").forEach(tr => {
    const flujo = tr.getAttribute("data-flujo");
    const sel = tr.querySelector("select.slack");
    const perf = tr.querySelector("input.perf");
    const del = tr.querySelector("button.del");

    const save = async () => {
      const slack_channel = sel.value || "";
      const perfiles_requeridos = perf.value === "" ? "" : Number(perf.value);
      try {
        await HUB.flujosUpsert({ flujo, slack_channel, perfiles_requeridos });
        toast("good", "Guardado", `${flujo}`);
      } catch (e) {
        toast("bad", "Error guardando", e.message || String(e));
      }
    };

    sel.addEventListener("change", save);
    perf.addEventListener("change", save);
    perf.addEventListener("blur", save);

    del.addEventListener("click", async () => {
      if (!confirm(`Borrar flujo "${flujo}"?`)) return;
      await HUB.flujosDelete({ flujo });
      toast("warn", "Flujo borrado", flujo);
      // refrescar
      const canales = state.cache.canales ? unique(state.cache.canales.map(c => c.Canal || c.Channel || c.Nombre)).sort() : [];
      renderOperativaSections(canales);
    });
  });
}

/* ---------- Planificación: integrada por flujo ---------- */
function renderPlanificacionGrouped(plan) {
  const wrap = $("#planWrap");
  if (!plan.length) { wrap.innerHTML = `<div class="empty">Sin planificación.</div>`; return; }

  // tomar header fecha
  const dayKey = plan[0].DayKey || "";
  const fecha = fmtDateDDMMYYYY(plan[0].Fecha || dayKey);

  // agrupar por flujo
  const by = {};
  plan.forEach(r => {
    const flujo = String(r.Flujo || "");
    if (!by[flujo]) by[flujo] = [];
    by[flujo].push(r);
  });

  wrap.innerHTML = `
    <div class="badge">Planificación del día: <span class="mono">${escapeHtml(fecha)}</span></div>
    ${Object.keys(by).sort().map(flujo => `
      <div class="card">
        <div class="card-h">
          <div class="card-title">${escapeHtml(flujo)}</div>
          <div class="small">Asignados: ${by[flujo].length}</div>
        </div>
        <div class="list">
          ${by[flujo].map(x => `
            <div class="li">
              <span class="mono">${escapeHtml(x.ID_MELI || "")}</span>
              <span>${escapeHtml(x.Nombre || "")}</span>
              <span class="muted">${escapeHtml(x.Equipo || "")}</span>
              <button class="btn tiny" data-copy="${escapeHtml(`${x.Nombre} (${x.ID_MELI})`)}">Copiar</button>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("")}
  `;

  wrap.querySelectorAll("button[data-copy]").forEach(b => {
    b.addEventListener("click", () => copyText(b.getAttribute("data-copy")));
  });
}

/* ---------- Slack Outbox: Copiar + Enviar por fila ---------- */
function renderOutbox(outbox, channelOptions) {
  const wrap = $("#outboxWrap");
  if (!outbox.length) { wrap.innerHTML = `<div class="empty">Sin outbox.</div>`; return; }

  // solo pendientes
  const rows = outbox.filter(r => String(r.Estado || "").toUpperCase().startsWith("PEND"));

  wrap.innerHTML = `
    ${rows.length ? "" : `<div class="empty">No hay pendientes.</div>`}
    ${rows.map(r => `
      <div class="card" data-row="${escapeHtml(r.Row)}">
        <div class="card-h">
          <div class="card-title">Row ${escapeHtml(r.Row)} — ${escapeHtml(r.Flujo || "")}</div>
          <div class="small">${escapeHtml(fmtDateDDMMYYYY(r.Fecha || r.DayKey))}</div>
        </div>

        <div class="row">
          <label class="small">Canal</label>
          <select class="in canal">
            <option value="">—</option>
            ${channelOptions.map(c => `<option value="${escapeHtml(c)}" ${c===String(r.Canal||"")?"selected":""}>${escapeHtml(c)}</option>`).join("")}
          </select>
          <button class="btn tiny save">Guardar</button>
        </div>

        <textarea class="in msg" rows="6">${escapeHtml(r.Mensaje || "")}</textarea>

        <div class="row">
          <button class="btn tiny copy">Copiar</button>
          <button class="btn primary tiny send">Enviar</button>
        </div>
      </div>
    `).join("")}
  `;

  wrap.querySelectorAll(".card[data-row]").forEach(card => {
    const Row = card.getAttribute("data-row");
    const canal = card.querySelector("select.canal");
    const msg = card.querySelector("textarea.msg");
    const btnSave = card.querySelector("button.save");
    const btnCopy = card.querySelector("button.copy");
    const btnSend = card.querySelector("button.send");

    btnCopy.addEventListener("click", () => copyText(msg.value));

    btnSave.addEventListener("click", async () => {
      await HUB.slackOutboxUpdate({ Row, canal: canal.value, mensaje: msg.value });
      toast("good", "Guardado", `Row ${Row}`);
    });

    btnSend.addEventListener("click", async () => {
      // guardar antes de enviar
      await HUB.slackOutboxUpdate({ Row, canal: canal.value, mensaje: msg.value });
      await HUB.slackOutboxEnviarUno(Row);
      toast("good", "Enviado", `Row ${Row}`);
      // refrescar
      state.cache.outbox = null;
      const canales = state.cache.canales ? unique(state.cache.canales.map(c => c.Canal || c.Channel || c.Nombre)).sort() : [];
      renderOperativaSections(canales);
    });
  });
}

/* ----------------------------
   TAB: Colaboradores
---------------------------- */
async function tabColaboradores(force) {
  setStatus("Cargando colaboradores…");

  const data = (force || !state.cache.colaboradores) ? await HUB.colaboradoresList() : state.cache.colaboradores;
  state.cache.colaboradores = data;

  const analistas = data.filter(r => isAnalista_(r.Rol));
  const byRol = {
    PM: analistas.filter(r => /pm/i.test(r.Rol)).length,
    KV: analistas.filter(r => /kv/i.test(r.Rol)).length,
    QA: analistas.filter(r => /qa/i.test(r.Rol)).length,
  };

  setCards([
    { label: "Colaboradores (Analistas)", value: String(analistas.length) },
    { label: "Analistas PM", value: String(byRol.PM) },
    { label: "Analistas KV", value: String(byRol.KV) },
    { label: "Analistas QA", value: String(byRol.QA) },
  ]);

  const equipos = unique(analistas.map(r => r.Equipo)).sort();
  const roles = unique(analistas.map(r => r.Rol)).sort();
  const ubicaciones = unique(analistas.map(r => r.Ubicación || r.Ubicacion)).sort();

  $("#controls").innerHTML = `
    <div class="row">
      <input id="qColabs" placeholder="Buscar por ID_MELI / TAG / mail…" style="min-width:320px" />
      <select id="fEquipo" class="in"><option value="">Equipo (todos)</option>${equipos.map(x=>`<option>${escapeHtml(x)}</option>`).join("")}</select>
      <select id="fRol" class="in"><option value="">Rol (todos)</option>${roles.map(x=>`<option>${escapeHtml(x)}</option>`).join("")}</select>
      <select id="fUbic" class="in"><option value="">Ubicación (todas)</option>${ubicaciones.map(x=>`<option>${escapeHtml(x)}</option>`).join("")}</select>
    </div>
  `;

  const q = $("#qColabs");
  const fEquipo = $("#fEquipo");
  const fRol = $("#fRol");
  const fUbic = $("#fUbic");

  const content = $("#content");

  function render() {
    const needle = (q.value || "").toLowerCase().trim();
    const fe = fEquipo.value || "";
    const fr = fRol.value || "";
    const fu = fUbic.value || "";

    let rows = analistas.slice();

    if (fe) rows = rows.filter(r => String(r.Equipo||"") === fe);
    if (fr) rows = rows.filter(r => String(r.Rol||"") === fr);
    if (fu) rows = rows.filter(r => String(r.Ubicación||r.Ubicacion||"") === fu);

    if (needle) {
      rows = rows.filter(r => {
        const blob = [
          r.ID_MELI, r.TAG, r.Rol, r.Equipo, (r.Ubicación||r.Ubicacion),
          r["Mail Productora"], r["Mail Externo"], r["Fecha Ingreso"], r["Fecha ingreso"]
        ].map(v => String(v||"").toLowerCase()).join(" | ");
        return blob.includes(needle);
      });
    }

    // tabla con reorden + click filters en headers “Equipo/Rol/Ubicación”
    content.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>ID_MELI</th>
            <th>TAG</th>
            <th class="clickable" data-h="rol">Rol</th>
            <th class="clickable" data-h="equipo">Equipo</th>
            <th class="clickable" data-h="ubicacion">Ubicación</th>
            <th>Mail Productora</th>
            <th>Mail Externo</th>
            <th>Fecha ingreso</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="mono copy">${escapeHtml(r.ID_MELI||"")}</td>
              <td class="copy">${escapeHtml(r.TAG||"")}</td>
              <td class="copy">${escapeHtml(r.Rol||"")}</td>
              <td class="copy">${escapeHtml(r.Equipo||"")}</td>
              <td class="copy">${escapeHtml(r.Ubicación||r.Ubicacion||"")}</td>
              <td class="copy">${escapeHtml(r["Mail Productora"]||"")}</td>
              <td class="copy">${escapeHtml(r["Mail Externo"]||"")}</td>
              <td class="copy">${escapeHtml(fmtDateDDMMYYYY(r["Fecha ingreso"]||r["Fecha Ingreso"]||""))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="small muted">Tip: click sobre una celda para copiar el valor.</div>
    `;

    // copy on click
    content.querySelectorAll("td.copy").forEach(td => td.addEventListener("click", () => copyText(td.textContent)));

    // header filters click
    content.querySelectorAll("th.clickable").forEach(th => {
      th.addEventListener("click", () => {
        const k = th.getAttribute("data-h");
        if (k === "equipo") fEquipo.focus();
        if (k === "rol") fRol.focus();
        if (k === "ubicacion") fUbic.focus();
      });
    });

    setStatus(`Listo. Mostrando ${rows.length}/${analistas.length}.`);
  }

  q.addEventListener("input", render);
  fEquipo.addEventListener("change", render);
  fRol.addEventListener("change", render);
  fUbic.addEventListener("change", render);

  render();
}

function isAnalista_(rol) { return /analista/i.test(String(rol||"")); }

/* ----------------------------
   TAB: Habilitaciones
---------------------------- */
async function tabHabilitaciones(force) {
  setStatus("Cargando habilitaciones…");

  const [hab, colabs] = await Promise.all([
    (force || !state.cache.habilitaciones) ? HUB.habilitacionesList() : state.cache.habilitaciones,
    (force || !state.cache.colaboradores) ? HUB.colaboradoresList() : state.cache.colaboradores,
  ]);

  state.cache.habilitaciones = hab;
  state.cache.colaboradores = colabs;

  // solo analistas
  const analistas = colabs.filter(c => isAnalista_(c.Rol));
  const equipos = unique(analistas.map(a => a.Equipo)).sort();

  setCards([
    { label: "Colaboradores (Analistas)", value: String(analistas.length) },
  ]);

  $("#controls").innerHTML = `
    <div class="row">
      <input id="qHab" placeholder="Buscar por Nombre/ID_MELI" style="min-width:300px" />
      <select id="fEquipoHab" class="in"><option value="">Equipo (todos)</option>${equipos.map(x=>`<option>${escapeHtml(x)}</option>`).join("")}</select>
    </div>
  `;

  const q = $("#qHab");
  const fEq = $("#fEquipoHab");
  const content = $("#content");

  // index colabs por id
  const colById = {};
  analistas.forEach(a => colById[String(a.ID_MELI||"").trim()] = a);

  function render() {
    const needle = (q.value || "").toLowerCase().trim();
    const eq = fEq.value || "";

    // filas habilitaciones enriquecidas
    let rows = hab
      .map(r => {
        const id = String(r.ID_MELI||"").trim();
        const c = colById[id];
        return {
          ID_MELI: id,
          Nombre: c?.Nombre || "",
          Equipo: c?.Equipo || "",
          Flujo: String(r.Flujo||""),
          Habilitado: String(r.Habilitado||""),
          Fijo: String(r.Fijo||""),
        };
      })
      .filter(r => r.ID_MELI && colById[r.ID_MELI]); // solo analistas

    if (eq) rows = rows.filter(r => r.Equipo === eq);
    if (needle) {
      rows = rows.filter(r => (`${r.Nombre} ${r.ID_MELI}`.toLowerCase().includes(needle)));
    }

    content.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>ID_MELI</th>
            <th>Nombre</th>
            <th class="clickable">Equipo</th>
            <th>Flujo</th>
            <th>H</th>
            <th>F</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr data-id="${escapeHtml(r.ID_MELI)}" data-flujo="${escapeHtml(r.Flujo)}">
              <td class="mono">${escapeHtml(r.ID_MELI)}</td>
              <td>${escapeHtml(r.Nombre)}</td>
              <td class="copy">${escapeHtml(r.Equipo)}</td>
              <td>${escapeHtml(r.Flujo)}</td>
              <td><input type="checkbox" class="chk h" ${truthy(r.Habilitado) ? "checked":""} /></td>
              <td><input type="checkbox" class="chk f" ${truthy(r.Fijo) ? "checked":""} /></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="small muted">Click en Equipo para filtrar. Checkboxes guardan al instante.</div>
    `;

    // click equipo => filtro
    content.querySelectorAll("td.copy").forEach(td => {
      td.addEventListener("click", () => {
        fEq.value = td.textContent;
        render();
      });
    });

    // autosave checkbox
    content.querySelectorAll("tr[data-id]").forEach(tr => {
      const idMeli = tr.getAttribute("data-id");
      const flujo = tr.getAttribute("data-flujo");
      const h = tr.querySelector("input.h");
      const f = tr.querySelector("input.f");

      const save = async () => {
        try {
          await HUB.habilitacionesSet(idMeli, flujo, { habilitado: h.checked, fijo: f.checked });
          toast("good", "Guardado", `${idMeli} · ${flujo}`);
        } catch (e) {
          toast("bad", "Error", e.message || String(e));
          // rollback visual: recargo del cache
          h.checked = !h.checked;
          f.checked = !f.checked;
        }
      };

      h.addEventListener("change", save);
      f.addEventListener("change", save);
    });

    setStatus(`Listo. Filas: ${rows.length}`);
  }

  q.addEventListener("input", render);
  fEq.addEventListener("change", render);
  render();
}

function truthy(v) {
  const s = String(v||"").trim().toUpperCase();
  return s === "TRUE" || s === "SI" || s === "1" || s === "Y";
}

/* ----------------------------
   TAB: Presentismo
---------------------------- */
async function tabPresentismo(force) {
  setStatus("Cargando presentismo…");

  // hoy por defecto
  const today = new Date();
  const dd = String(today.getDate()).padStart(2,"0");
  const mm = String(today.getMonth()+1).padStart(2,"0");
  const yyyy = today.getFullYear();
  const ymd = `${yyyy}-${mm}-${dd}`;

  state.presentismoDayKey = state.presentismoDayKey || ymd;

  const [meta, day, colabs, summary] = await Promise.all([
    HUB.presentismoMeta(),
    HUB.presentismoDay(state.presentismoDayKey),
    HUB.colaboradoresList(),
    HUB.presentismoSummaryToday(),
  ]);

  state.cache.presentismoDay = day;
  state.cache.colaboradores = colabs;

  setCards([
    { label: "Colaboradores presentes (hoy)", value: String(summary.presentes ?? 0), sub: summary.label || "" },
    { label: "Licencias hoy", value: String(summary.licencias ?? 0) },
  ]);

  const analistas = colabs.filter(c => isAnalista_(c.Rol));
  const equipos = unique(analistas.map(a => a.Equipo)).sort();
  const roles = unique(analistas.map(a => a.Rol)).sort();
  const ubic = unique(analistas.map(a => a.Ubicación || a.Ubicacion)).sort();

  $("#controls").innerHTML = `
    <div class="row">
      <input id="dayKey" class="in" type="date" value="${escapeHtml(state.presentismoDayKey)}" />
      <input id="qPres" placeholder="Buscar por Nombre/ID" style="min-width:260px" />
      <select id="fEquipoP" class="in"><option value="">Equipo</option>${equipos.map(x=>`<option>${escapeHtml(x)}</option>`).join("")}</select>
      <select id="fRolP" class="in"><option value="">Rol</option>${roles.map(x=>`<option>${escapeHtml(x)}</option>`).join("")}</select>
      <select id="fUbicP" class="in"><option value="">Ubicación</option>${ubic.map(x=>`<option>${escapeHtml(x)}</option>`).join("")}</select>
    </div>

    <div class="card">
      <div class="card-h">
        <div class="card-title">Cargar licencia (panel)</div>
        <div class="small muted">Aplica E/M/MM/AI a un rango de fechas</div>
      </div>
      <div class="row">
        <select id="licId" class="in" style="min-width:280px">
          <option value="">Colaborador…</option>
          ${analistas
            .sort((a,b)=>String(a.Nombre||"").localeCompare(String(b.Nombre||"")))
            .map(a => `<option value="${escapeHtml(a.ID_MELI)}">${escapeHtml(a.Nombre)} (${escapeHtml(a.ID_MELI)})</option>`)
            .join("")}
        </select>
        <input id="licFrom" class="in" type="date" />
        <input id="licTo" class="in" type="date" />
        <select id="licTipo" class="in">
          <option value="E">E</option>
          <option value="M">M</option>
          <option value="MM">MM</option>
          <option value="AI">AI</option>
        </select>
        <button class="btn primary" id="licApply">Guardar</button>
      </div>
    </div>
  `;

  $("#licApply").addEventListener("click", async () => {
    const idMeli = $("#licId").value;
    const from = $("#licFrom").value;
    const to = $("#licTo").value;
    const tipo = $("#licTipo").value;

    if (!idMeli || !from || !to) {
      toast("warn", "Faltan datos", "Completá colaborador + desde/hasta.");
      return;
    }
    const r = await HUB.presentismoApplyLicense({ idMeli, from, to, tipo });
    toast("good", "Licencia aplicada", `Días actualizados: ${r.updated}`);
    // refrescar día actual
    await tabPresentismo(true);
  });

  const content = $("#content");
  const q = $("#qPres");
  const fEquipo = $("#fEquipoP");
  const fRol = $("#fRolP");
  const fUbic = $("#fUbicP");

  $("#dayKey").addEventListener("change", async (ev) => {
    state.presentismoDayKey = ev.target.value;
    await tabPresentismo(true);
  });

  function render() {
    const needle = (q.value || "").toLowerCase().trim();
    const fe = fEquipo.value || "";
    const fr = fRol.value || "";
    const fu = fUbic.value || "";

    let rows = day.slice();

    if (fe) rows = rows.filter(r => String(r.Equipo||"") === fe);
    if (fr) rows = rows.filter(r => String(r.Rol||"") === fr);
    if (fu) rows = rows.filter(r => String(r.Ubicación||"") === fu);

    if (needle) {
      rows = rows.filter(r => (`${r.Nombre} ${r.ID_MELI}`.toLowerCase().includes(needle)));
    }

    // ordenar columnas: Nombre luego ID
    content.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>ID_MELI</th>
            <th>Equipo</th>
            <th>Rol</th>
            <th>Ubicación</th>
            <th>Días trabajados</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr data-id="${escapeHtml(r.ID_MELI)}">
              <td class="copy">${escapeHtml(r.Nombre||"")}</td>
              <td class="mono copy">${escapeHtml(r.ID_MELI||"")}</td>
              <td class="copy">${escapeHtml(r.Equipo||"")}</td>
              <td class="copy">${escapeHtml(r.Rol||"")}</td>
              <td class="copy">${escapeHtml(r.Ubicación||"")}</td>
              <td>${escapeHtml(String(r.Dias_trabajados ?? ""))}</td>
              <td>
                <select class="in code">
                  <option value=""></option>
                  ${["P","V","E","M","MM","AI"].map(c => `<option value="${c}" ${c===String(r.Code||"")?"selected":""}>${c}</option>`).join("")}
                </select>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="small muted">Click en una celda para copiar. Cambiar Estado guarda al instante.</div>
    `;

    // copy on click
    content.querySelectorAll("td.copy").forEach(td => td.addEventListener("click", () => copyText(td.textContent)));

    // autosave code
    content.querySelectorAll("tr[data-id]").forEach(tr => {
      const idMeli = tr.getAttribute("data-id");
      const sel = tr.querySelector("select.code");
      sel.addEventListener("change", async () => {
        try {
          await HUB.presentismoSet({ dayKey: state.presentismoDayKey, idMeli, code: sel.value });
          toast("good", "Guardado", `${idMeli} = ${sel.value || "vacío"}`);
        } catch (e) {
          toast("bad", "Error", e.message || String(e));
        }
      });
    });

    setStatus(`Listo. Filas: ${rows.length}`);
  }

  q.addEventListener("input", render);
  fEquipo.addEventListener("change", render);
  fRol.addEventListener("change", render);
  fUbic.addEventListener("change", render);

  render();
}
