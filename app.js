// app.js
import { HUB } from "./api.js";

const $ = (sel) => document.querySelector(sel);

const state = {
  tab: "operativa",
  canales: [],
  flujos: [],
  colaboradores: [],
  habil: null,
  plan: [],
  outbox: [],
  presentismo: null,
  presentismoStats: null,

  // filtros
  colabFilter: { rol: "", equipo: "", ubic: "", q: "" },
  habFilter: { equipo: "", q: "" },
};

function htmlEscape(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toast(msg, type = "ok") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.style.opacity = "1";
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => (el.style.opacity = "0"), 2200);
}

function copyText(txt) {
  navigator.clipboard.writeText(String(txt ?? "")).then(
    () => toast("Copiado"),
    () => toast("No se pudo copiar", "err")
  );
}

async function boot() {
  // health
  try {
    const h = await HUB.health();
    $("#healthDot").textContent = "●";
    $("#healthDot").className = "dot ok";
    $("#healthText").textContent = h.status || "ok";
  } catch (e) {
    $("#healthDot").textContent = "●";
    $("#healthDot").className = "dot err";
    $("#healthText").textContent = "error";
  }

  // carga base
  await loadBase();
  bindNav();
  render();
}

async function loadBase() {
  $("#main").innerHTML = `<div class="card"><div class="muted">Cargando...</div></div>`;
  try {
    const [canales, flujos, colaboradores] = await Promise.all([
      HUB.canalesList(),
      HUB.flujosList(),
      HUB.colaboradoresList(),
    ]);
    state.canales = canales;
    state.flujos = flujos;
    state.colaboradores = colaboradores;
  } catch (e) {
    $("#main").innerHTML = `<div class="card errbox">Error cargando base: ${htmlEscape(e.message)}</div>`;
    throw e;
  }
}

function bindNav() {
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.addEventListener("click", async () => {
      state.tab = b.dataset.tab;
      document.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("active", x.dataset.tab === state.tab));
      await ensureTabData();
      render();
    });
  });
}

async function ensureTabData() {
  if (state.tab === "operativa") {
    // stats hoy + plan + outbox
    const [stats, plan, out] = await Promise.all([
      HUB.presentismoStats(""),
      HUB.planificacionList(),
      HUB.slackOutboxList(),
    ]);
    state.presentismoStats = stats;
    state.plan = plan;
    state.outbox = out;
    return;
  }

  if (state.tab === "colaboradores") return;

  if (state.tab === "habilitaciones") {
    state.habil = await HUB.habilitacionesList();
    return;
  }

  if (state.tab === "presentismo") {
    const [wk, stats] = await Promise.all([HUB.presentismoWeek(""), HUB.presentismoStats("")]);
    state.presentismo = wk;
    state.presentismoStats = stats;
    return;
  }
}

function render() {
  if (state.tab === "operativa") return renderOperativa();
  if (state.tab === "colaboradores") return renderColaboradores();
  if (state.tab === "habilitaciones") return renderHabilitaciones();
  if (state.tab === "presentismo") return renderPresentismo();
}

function onlyAnalistas(colabs) {
  return colabs.filter((c) => String(c.Rol || "").toLowerCase().includes("analista"));
}

/* --------------------------
   OPERATIVA DIARIA
-------------------------- */
function renderOperativa() {
  const analistas = onlyAnalistas(state.colaboradores);
  const st = state.presentismoStats || { licencias: 0, disponibles: 0 };
  const cards = `
    <div class="cards">
      <div class="kpi" data-kpi="analistas">
        <div class="kpiLabel">Analistas totales</div>
        <div class="kpiVal">${analistas.length}</div>
      </div>
      <div class="kpi">
        <div class="kpiLabel">Licencias hoy</div>
        <div class="kpiVal">${Number(st.licencias || 0)}</div>
      </div>
      <div class="kpi">
        <div class="kpiLabel">Perfiles disponibles (hoy)</div>
        <div class="kpiVal">${Number(st.disponibles || 0)}</div>
      </div>
    </div>
  `;

  const canalesOptions = channelOptionsHtml();

  const flujosRows = state.flujos
    .map((f) => {
      const flujo = f.Flujo || f.flujo || "";
      const req = Number(f.Perfiles_requeridos || f.perfiles_requeridos || 0);
      const slack = String(f.Slack_channel || f.slack_channel || "");
      return `
        <tr data-flujo="${htmlEscape(flujo)}">
          <td><input class="in" value="${htmlEscape(flujo)}" data-edit="flujo" disabled></td>
          <td>
            <select class="in" data-edit="slack">
              ${canalesOptions(slack)}
            </select>
          </td>
          <td><input class="in" type="number" min="0" value="${req}" data-edit="req"></td>
          <td style="text-align:right">
            <button class="btn danger" data-action="flujo-del">Borrar</button>
          </td>
        </tr>
      `;
    })
    .join("");

  const flujosAdd = `
    <tr data-new="1">
      <td><input class="in" placeholder="+ Nuevo flujo..." data-new="flujo"></td>
      <td><select class="in" data-new="slack">${canalesOptions("")}</select></td>
      <td><input class="in" type="number" min="0" value="0" data-new="req"></td>
      <td style="text-align:right"><button class="btn primary" data-action="flujo-add">Agregar</button></td>
    </tr>
  `;

  const planByFlujo = groupBy(state.plan, "Flujo");
  const planHtml = Object.keys(planByFlujo).length
    ? Object.entries(planByFlujo)
        .map(([flujo, rows]) => {
          const items = rows
            .map((r) => `<li>${htmlEscape(r.Nombre || r.ID_MELI || "")}</li>`)
            .join("");
          return `
            <div class="card">
              <div class="cardTitle">${htmlEscape(flujo)}</div>
              <ul class="list">${items || "<li class='muted'>Sin asignaciones</li>"}</ul>
            </div>
          `;
        })
        .join("")
    : `<div class="muted">Sin planificación cargada.</div>`;

  const outRows = (state.outbox || []).map((r, idx) => {
    const rowN = idx + 2; // asumiendo header row 1
    const canalName = String(r.Canal || r.Slack_channel || "");
    const msg = String(r.Mensaje || "");
    const estado = String(r.Estado || "");
    const err = String(r.LastError || "");
    return `
      <tr>
        <td>${htmlEscape(r.Fecha || "")}</td>
        <td>
          <select class="in" data-outbox-row="${rowN}" data-outbox-field="Canal">
            ${canalesOptions(canalName)}
          </select>
        </td>
        <td>
          <textarea class="ta" data-outbox-row="${rowN}" data-outbox-field="Mensaje">${htmlEscape(msg)}</textarea>
          <div class="rowActions">
            <button class="btn" data-action="copy" data-copy="${htmlEscape(msg)}">Copiar</button>
            <button class="btn primary" data-action="sendRow" data-row="${rowN}">Enviar</button>
          </div>
        </td>
        <td>${htmlEscape(estado)}</td>
        <td class="muted">${htmlEscape(err)}</td>
      </tr>
    `;
  }).join("");

  $("#main").innerHTML = `
    ${cards}

    <div class="card">
      <div class="cardTitle">1) Flujos (Perfiles requeridos)</div>
      <div class="muted">Autosave: se guarda al cambiar Slack channel o Perfiles requeridos.</div>
      <div class="tableWrap">
        <table>
          <thead><tr><th>Flujo</th><th>Slack channel</th><th>Perfiles requeridos</th><th></th></tr></thead>
          <tbody>${flujosRows}${flujosAdd}</tbody>
        </table>
      </div>
    </div>

    <div class="row">
      <button class="btn primary" id="btnPlan">Generar planificación</button>
      <button class="btn" id="btnOutbox">Generar Outbox</button>
      <button class="btn success" id="btnSendAll">Enviar todos</button>
    </div>

    <div class="card">
      <div class="cardTitle">2) Planificación (resultado)</div>
      <div class="muted">Agrupado por flujo.</div>
      <div class="grid">${planHtml}</div>
    </div>

    <div class="card">
      <div class="cardTitle">3) Slack Outbox (pendientes)</div>
      <div class="tableWrap">
        <table>
          <thead><tr><th>Fecha</th><th>Canal</th><th>Mensaje</th><th>Estado</th><th>Error</th></tr></thead>
          <tbody>${outRows || `<tr><td colspan="5" class="muted">Sin outbox.</td></tr>`}</tbody>
        </table>
      </div>
      <div class="muted">Nota: si un canal no tiene al bot agregado, Slack devuelve <b>channel_not_found</b>.</div>
    </div>
  `;

  // handlers: autosave flujos
  $("#main").querySelectorAll('tr[data-flujo] select[data-edit="slack"], tr[data-flujo] input[data-edit="req"]').forEach((el) => {
    el.addEventListener("change", () => saveFlujoRow(el.closest("tr")));
  });

  $("#main").querySelectorAll('[data-action="flujo-del"]').forEach((b) => {
    b.addEventListener("click", async () => {
      const tr = b.closest("tr[data-flujo]");
      const flujo = tr.dataset.flujo;
      if (!flujo) return;
      try {
        await HUB.flujosDelete({ flujo });
        state.flujos = await HUB.flujosList();
        toast("Flujo borrado");
        renderOperativa();
      } catch (e) {
        toast(`Error: ${e.message}`, "err");
      }
    });
  });

  $("#main").querySelector('[data-action="flujo-add"]').addEventListener("click", async () => {
    const tr = $("#main").querySelector('tr[data-new="1"]');
    const flujo = tr.querySelector('[data-new="flujo"]').value.trim();
    const slack = tr.querySelector('[data-new="slack"]').value.trim();
    const req = Number(tr.querySelector('[data-new="req"]').value || 0);
    if (!flujo) return toast("Falta nombre de flujo", "err");
    try {
      await HUB.flujosUpsert({ flujo, perfiles_requeridos: req, slack_channel: slack });
      state.flujos = await HUB.flujosList();
      toast("Flujo agregado");
      renderOperativa();
    } catch (e) {
      toast(`Error: ${e.message}`, "err");
    }
  });

  $("#btnPlan").addEventListener("click", async () => {
    try {
      await HUB.planificacionGenerar();
      const [plan, stats] = await Promise.all([HUB.planificacionList(), HUB.presentismoStats("")]);
      state.plan = plan;
      state.presentismoStats = stats;
      toast("Planificación generada");
      renderOperativa();
    } catch (e) {
      toast(`Error: ${e.message}`, "err");
    }
  });

  $("#btnOutbox").addEventListener("click", async () => {
    try {
      await HUB.slackOutboxGenerar();
      state.outbox = await HUB.slackOutboxList();
      toast("Outbox generado");
      renderOperativa();
    } catch (e) {
      toast(`Error: ${e.message}`, "err");
    }
  });

  $("#btnSendAll").addEventListener("click", async () => {
    try {
      const r = await HUB.slackOutboxEnviarAll();
      toast(`Enviados: ${r.sent || 0}`);
      state.outbox = await HUB.slackOutboxList();
      renderOperativa();
    } catch (e) {
      toast(`Error: ${e.message}`, "err");
    }
  });

  $("#main").querySelectorAll('[data-action="sendRow"]').forEach((b) => {
    b.addEventListener("click", async () => {
      const row = Number(b.dataset.row);
      try {
        const r = await HUB.slackOutboxEnviarRow(row);
        toast(`Enviado: ${r.sent || 0}`);
        state.outbox = await HUB.slackOutboxList();
        renderOperativa();
      } catch (e) {
        toast(`Error: ${e.message}`, "err");
      }
    });
  });

  $("#main").querySelectorAll('[data-action="copy"]').forEach((b) => {
    b.addEventListener("click", () => copyText(b.dataset.copy));
  });
}

async function saveFlujoRow(tr) {
  const flujo = tr.dataset.flujo;
  const slack = tr.querySelector('select[data-edit="slack"]').value.trim();
  const req = Number(tr.querySelector('input[data-edit="req"]').value || 0);
  try {
    await HUB.flujosUpsert({ flujo, perfiles_requeridos: req, slack_channel: slack });
    toast("Guardado");
    // refresco flujos (por si normaliza)
    state.flujos = await HUB.flujosList();
  } catch (e) {
    toast(`Error guardando: ${e.message}`, "err");
  }
}

function channelOptionsHtml() {
  const opts = state.canales
    .map((c) => {
      const name = String(c.Canal || c.Channel || "").trim();
      if (!name) return null;
      return name;
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"));

  return (selected) => {
    const s = String(selected || "");
    return [
      `<option value="">—</option>`,
      ...opts.map((n) => `<option value="${htmlEscape(n)}" ${n === s ? "selected" : ""}>${htmlEscape(n)}</option>`),
    ].join("");
  };
}

function groupBy(rows, key) {
  const m = {};
  (rows || []).forEach((r) => {
    const k = String(r[key] || "").trim() || "Sin flujo";
    (m[k] ||= []).push(r);
  });
  return m;
}

/* --------------------------
   COLABORADORES
-------------------------- */
function renderColaboradores() {
  const all = onlyAnalistas(state.colaboradores);

  let rows = all.slice();
  const f = state.colabFilter;

  if (f.q) {
    const q = f.q.toLowerCase();
    rows = rows.filter((r) => String(r.ID_MELI).toLowerCase().includes(q) || String(r.Nombre).toLowerCase().includes(q));
  }
  if (f.rol) rows = rows.filter((r) => String(r.Rol) === f.rol);
  if (f.equipo) rows = rows.filter((r) => String(r.Equipo) === f.equipo);
  if (f.ubic) rows = rows.filter((r) => String(r["Ubicación"] || r.Ubicación) === f.ubic);

  const countByRol = (rol) => rows.filter((r) => String(r.Rol) === rol).length;

  const roles = ["Analista PM", "Analista KV", "Analista QA"];
  const equipos = uniq(all.map((r) => r.Equipo).filter(Boolean)).sort((a, b) => a.localeCompare(b, "es"));
  const ubics = uniq(all.map((r) => r.Ubicación).filter(Boolean)).sort((a, b) => a.localeCompare(b, "es"));

  const cards = `
    <div class="cards four">
      <div class="kpi clickable" data-set="rol" data-val="">
        <div class="kpiLabel">Colaboradores (Analistas)</div><div class="kpiVal">${rows.length}</div>
      </div>
      ${roles
        .map(
          (r) => `
        <div class="kpi clickable" data-set="rol" data-val="${htmlEscape(r)}">
          <div class="kpiLabel">${htmlEscape(r)}</div><div class="kpiVal">${countByRol(r)}</div>
        </div>`
        )
        .join("")}
    </div>
  `;

  const tableRows = rows
    .map((r) => {
      const cells = [
        cellCopy(r.ID_MELI),
        cellCopy(r.TAG),
        cellFilter("rol", r.Rol),
        cellFilter("equipo", r.Equipo),
        cellFilter("ubic", r.Ubicación),
        cellCopy(r["Mail Productora"]),
        cellCopy(r["Mail Externo"]),
        cellCopy(r["Fecha Ingreso"]),
      ].join("");

      return `<tr>${cells}</tr>`;
    })
    .join("");

  $("#main").innerHTML = `
    ${cards}

    <div class="card">
      <div class="row">
        <input class="in grow" id="qColab" placeholder="Buscar por Nombre/ID_MELI" value="${htmlEscape(f.q)}">
        <select class="in" id="selEquipo">
          <option value="">Equipo (todos)</option>
          ${equipos.map((e) => `<option ${e === f.equipo ? "selected" : ""}>${htmlEscape(e)}</option>`).join("")}
        </select>
        <select class="in" id="selRol">
          <option value="">Rol (todos)</option>
          ${uniq(all.map((x) => x.Rol).filter(Boolean)).sort((a,b)=>a.localeCompare(b,"es")).map((e) => `<option ${e === f.rol ? "selected" : ""}>${htmlEscape(e)}</option>`).join("")}
        </select>
        <select class="in" id="selUbic">
          <option value="">Ubicación (todas)</option>
          ${ubics.map((e) => `<option ${e === f.ubic ? "selected" : ""}>${htmlEscape(e)}</option>`).join("")}
        </select>
      </div>

      <div class="tableWrap">
        <table>
          <thead>
            <tr>
              <th>ID_MELI</th><th>TAG</th><th>Rol</th><th>Equipo</th><th>Ubicación</th><th>Mail Productora</th><th>Mail Externo</th><th>Fecha ingreso</th>
            </tr>
          </thead>
          <tbody>${tableRows || `<tr><td colspan="8" class="muted">Sin resultados.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  // cards click -> filtro rol
  $("#main").querySelectorAll(".clickable").forEach((c) => {
    c.addEventListener("click", async () => {
      const set = c.dataset.set;
      const val = c.dataset.val || "";
      state.colabFilter[set] = val;
      renderColaboradores();
    });
  });

  $("#qColab").addEventListener("input", (e) => {
    state.colabFilter.q = e.target.value.trim();
    renderColaboradores();
  });
  $("#selEquipo").addEventListener("change", (e) => {
    state.colabFilter.equipo = e.target.value;
    renderColaboradores();
  });
  $("#selRol").addEventListener("change", (e) => {
    state.colabFilter.rol = e.target.value;
    renderColaboradores();
  });
  $("#selUbic").addEventListener("change", (e) => {
    state.colabFilter.ubic = e.target.value;
    renderColaboradores();
  });

  // clicks in table
  $("#main").querySelectorAll("[data-copy]").forEach((el) => el.addEventListener("click", () => copyText(el.dataset.copy)));
  $("#main").querySelectorAll("[data-filter]").forEach((el) =>
    el.addEventListener("click", () => {
      const k = el.dataset.filter;
      const v = el.dataset.val || "";
      state.colabFilter[k] = v;
      renderColaboradores();
    })
  );
}

function cellCopy(v) {
  const s = String(v ?? "");
  return `<td><span class="copy" data-copy="${htmlEscape(s)}">${htmlEscape(s)}</span></td>`;
}
function cellFilter(key, v) {
  const s = String(v ?? "");
  return `<td><span class="chip" data-filter="${htmlEscape(key)}" data-val="${htmlEscape(s)}">${htmlEscape(s)}</span></td>`;
}
function uniq(arr) {
  return Array.from(new Set(arr.map((x) => String(x))));
}

/* --------------------------
   HABILITACIONES
-------------------------- */
function renderHabilitaciones() {
  const data = state.habil;
  if (!data) return ($("#main").innerHTML = `<div class="card"><div class="muted">Cargando...</div></div>`);

  const flujos = data.flujos || [];
  const rowsAll = (data.rows || []).map((r) => ({
    ID_MELI: r.ID_MELI,
    Nombre: r.Nombre,
    Equipo: r.Equipo,
    perFlujo: r.perFlujo || {},
  }));

  const f = state.habFilter;
  let rows = rowsAll.slice();
  if (f.q) {
    const q = f.q.toLowerCase();
    rows = rows.filter((r) => String(r.ID_MELI).toLowerCase().includes(q) || String(r.Nombre).toLowerCase().includes(q));
  }
  if (f.equipo) rows = rows.filter((r) => String(r.Equipo) === f.equipo);

  const equipos = uniq(rowsAll.map((r) => r.Equipo).filter(Boolean)).sort((a, b) => a.localeCompare(b, "es"));

  const head = `
    <tr>
      <th>ID_MELI</th><th>Nombre</th><th>Equipo</th>
      ${flujos.map((x) => `<th>${htmlEscape(x)}<div class="muted tiny">H / F</div></th>`).join("")}
    </tr>
  `;

  const body = rows
    .map((r) => {
      const cols = flujos
        .map((flujo) => {
          const v = r.perFlujo[flujo] || { habilitado: false, fijo: false };
          return `
            <td class="hf">
              <label><input type="checkbox" data-hab="H" data-id="${htmlEscape(r.ID_MELI)}" data-flujo="${htmlEscape(flujo)}" ${v.habilitado ? "checked" : ""}> H</label>
              <label><input type="checkbox" data-hab="F" data-id="${htmlEscape(r.ID_MELI)}" data-flujo="${htmlEscape(flujo)}" ${v.fijo ? "checked" : ""}> F</label>
            </td>
          `;
        })
        .join("");

      return `
        <tr>
          ${cellCopy(r.ID_MELI)}
          ${cellCopy(r.Nombre)}
          ${cellFilter("equipo", r.Equipo)}
          ${cols}
        </tr>
      `;
    })
    .join("");

  $("#main").innerHTML = `
    <div class="card">
      <div class="row">
        <input class="in grow" id="qHab" placeholder="Buscar por Nombre/ID_MELI" value="${htmlEscape(f.q)}">
        <select class="in" id="selHabEquipo">
          <option value="">Equipo (todos)</option>
          ${equipos.map((e) => `<option ${e === f.equipo ? "selected" : ""}>${htmlEscape(e)}</option>`).join("")}
        </select>
      </div>

      <div class="tableWrap">
        <table>
          <thead>${head}</thead>
          <tbody>${body || `<tr><td colspan="${3 + flujos.length}" class="muted">Sin resultados.</td></tr>`}</tbody>
        </table>
      </div>
      <div class="muted tiny">Tip: click en “Equipo” aplica filtro. Click en otros campos copia.</div>
    </div>
  `;

  $("#qHab").addEventListener("input", (e) => {
    state.habFilter.q = e.target.value.trim();
    renderHabilitaciones();
  });
  $("#selHabEquipo").addEventListener("change", async (e) => {
    state.habFilter.equipo = e.target.value;
    renderHabilitaciones();
  });

  $("#main").querySelectorAll("[data-copy]").forEach((el) => el.addEventListener("click", () => copyText(el.dataset.copy)));
  $("#main").querySelectorAll("[data-filter]").forEach((el) =>
    el.addEventListener("click", () => {
      state.habFilter.equipo = el.dataset.val || "";
      renderHabilitaciones();
    })
  );

  $("#main").querySelectorAll("input[type=checkbox][data-hab]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const idMeli = cb.dataset.id;
      const flujo = cb.dataset.flujo;
      const type = cb.dataset.hab; // H or F
      try {
        if (type === "H") await HUB.habilitacionesSet({ idMeli, flujo, habilitado: cb.checked });
        if (type === "F") await HUB.habilitacionesSet({ idMeli, flujo, fijo: cb.checked });
        toast("Guardado");
      } catch (e) {
        toast(`Error: ${e.message}`, "err");
        cb.checked = !cb.checked;
      }
    });
  });
}

/* --------------------------
   PRESENTISMO
-------------------------- */
function renderPresentismo() {
  const wk = state.presentismo;
  const stats = state.presentismoStats || { presentes: 0, licencias: 0 };

  if (!wk) {
    $("#main").innerHTML = `<div class="card"><div class="muted">Cargando...</div></div>`;
    return;
  }

  const days = wk.days || []; // 5 días hábiles
  const rows = wk.rows || [];

  const cards = `
    <div class="cards">
      <div class="kpi">
        <div class="kpiLabel">Colaboradores presentes (hoy)</div>
        <div class="kpiVal">${Number(stats.presentes || 0)}</div>
      </div>
      <div class="kpi">
        <div class="kpiLabel">Licencias hoy</div>
        <div class="kpiVal">${Number(stats.licencias || 0)}</div>
      </div>
    </div>
  `;

  const head = `
    <tr>
      <th>Nombre</th><th>ID_MELI</th><th>Rol</th><th>Equipo</th><th>Ubicación</th><th>Días trabajados</th>
      ${days.map((d) => `<th>${htmlEscape(d.short || d.label || d.key)}</th>`).join("")}
    </tr>
  `;

  const body = rows
    .map((r) => {
      const cols = days
        .map((d) => {
          const code = String((r.days || {})[d.key] || "");
          return `<td class="code">${htmlEscape(code)}</td>`;
        })
        .join("");
      return `
        <tr>
          ${cellCopy(r.Nombre)}
          ${cellCopy(r.ID_MELI)}
          ${cellFilter("rol", r.Rol)}
          ${cellFilter("equipo", r.Equipo)}
          ${cellFilter("ubic", r.Ubicación)}
          ${cellCopy(r.Dias_trabajados)}
          ${cols}
        </tr>
      `;
    })
    .join("");

  $("#main").innerHTML = `
    ${cards}

    <div class="card">
      <div class="cardTitle">Cargar licencia</div>
      <div class="row">
        <select class="in grow" id="licId">
          <option value="">Colaborador…</option>
          ${rows.map((r) => `<option value="${htmlEscape(r.ID_MELI)}">${htmlEscape(r.Nombre)} — ${htmlEscape(r.ID_MELI)}</option>`).join("")}
        </select>
        <input class="in" id="licDesde" type="date">
        <input class="in" id="licHasta" type="date">
        <select class="in" id="licTipo">
          <option value="E">E — Día de Estudio</option>
          <option value="M">M — Licencia Médica</option>
          <option value="MM">MM — Licencia Médica Menor</option>
          <option value="AI">AI — Ausencia Injustificada</option>
          <option value="V">V — Vacaciones</option>
        </select>
        <button class="btn primary" id="btnLic">Guardar</button>
      </div>
      <div class="muted tiny">Se escribe en la hoja Presentismo sobre las columnas de fechas existentes.</div>
    </div>

    <div class="card">
      <div class="cardTitle">Semana en curso (5 días hábiles)</div>
      <div class="tableWrap">
        <table>
          <thead>${head}</thead>
          <tbody>${body || `<tr><td colspan="${6 + days.length}" class="muted">Sin datos.</td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;

  $("#btnLic").addEventListener("click", async () => {
    const idMeli = $("#licId").value.trim();
    const desde = $("#licDesde").value;
    const hasta = $("#licHasta").value;
    const tipo = $("#licTipo").value;
    if (!idMeli || !desde || !hasta || !tipo) return toast("Completar todos los campos", "err");

    try {
      await HUB.presentismoLicenciasSet({ idMeli, desde, hasta, tipo });
      toast("Licencia guardada");
      // recarga
      const [wk2, st2] = await Promise.all([HUB.presentismoWeek(""), HUB.presentismoStats("")]);
      state.presentismo = wk2;
      state.presentismoStats = st2;
      renderPresentismo();
    } catch (e) {
      toast(`Error: ${e.message}`, "err");
    }
  });

  // clicks: filtros en rol/equipo/ubic (no hay dropdown global aún)
  $("#main").querySelectorAll("[data-copy]").forEach((el) => el.addEventListener("click", () => copyText(el.dataset.copy)));
  $("#main").querySelectorAll("[data-filter]").forEach((el) =>
    el.addEventListener("click", () => {
      // reutilizo filtros de colaboradores para no inventar otra UX ahora
      const k = el.dataset.filter;
      const v = el.dataset.val || "";
      state.colabFilter[k] = v;
      state.tab = "colaboradores";
      document.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("active", x.dataset.tab === state.tab));
      renderColaboradores();
    })
  );
}

/* --------------------------
   START
-------------------------- */
window.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("active", x.dataset.tab === state.tab));
  await ensureTabData().catch(() => {});
  await boot().catch(() => {});
});
