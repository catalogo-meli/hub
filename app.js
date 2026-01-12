/* app.js - FULL (fixed: removed stray duplicated block causing "Illegal return statement") */

(() => {
  "use strict";

  /************************************************************
   * Global App State
   ************************************************************/
  const S = {
    tab: "dashboard",
    dark: true,
    data: {
      colaboradores: [],
      canales: [],
      flujos: [],
      habilitaciones: null,
      presentismoWeek: null,
      presentismoStats: null,
      planificacion: [],
      outbox: [],
    },
    // Filters per section
    fColabs: { q: "", roles: new Set() },
    fDaily: { q: "", flows: new Set() },
    fHab: { q: "", flows: new Set() },
    fPres: { q: "" },
    // UI caches
    caches: {
      roles: [],
      flows: [],
    },
  };

  /************************************************************
   * DOM helpers
   ************************************************************/
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function setText(id, txt) {
    const el = $(id);
    if (el) el.textContent = txt;
  }

  function setHTML(id, html) {
    const el = $(id);
    if (el) el.innerHTML = html;
  }

  function show(id, yes = true) {
    const el = $(id);
    if (!el) return;
    el.classList.toggle("hidden", !yes);
  }

  function toast(msg, kind = "info") {
    const wrap = $("toastWrap");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = `toast toast-${kind}`;
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => el.classList.add("in"), 10);
    setTimeout(() => {
      el.classList.remove("in");
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  /************************************************************
   * API wrapper (uses window.API from api.js)
   ************************************************************/
  async function apiGet(action, params = {}) {
    return window.API.get(action, params);
  }

  async function apiPost(action, body = {}) {
    return window.API.post(action, body);
  }

  /************************************************************
   * INIT
   ************************************************************/
  document.addEventListener("DOMContentLoaded", main);

  async function main() {
    wireTabs_();
    wireTheme_();
    wireButtons_();

    // Search inputs
    mountSearch("searchColabs", (v) => {
      S.fColabs.q = v;
      renderColaboradores_();
    });
    mountSearch("searchDaily", (v) => {
      S.fDaily.q = v;
      renderOperativa_();
    });
    mountSearch("searchHab", (v) => {
      S.fHab.q = v;
      renderHabilitaciones_();
    });

    // Multi-selects
    mountMultiSelect("msRolesColabs", {
      title: "Roles",
      items: [],
      onChange: (set) => {
        S.fColabs.roles = set;
        renderColaboradores_();
        renderDashboard_(); // role dist depends on filtered base? (keep as before)
      },
    });
    mountMultiSelect("msFlowsDaily", {
      title: "Flujos",
      items: [],
      onChange: (set) => {
        S.fDaily.flows = set;
        renderOperativa_();
      },
    });
    mountMultiSelect("msFlowsHab", {
      title: "Flujos",
      items: [],
      onChange: (set) => {
        S.fHab.flows = set;
        renderHabilitaciones_();
      },
    });

    // Initial load
    await refreshAll_();

    // Default tab
    selectTab_(S.tab);
  }

  /************************************************************
   * Tabs / Theme / Buttons
   ************************************************************/
  function wireTabs_() {
    $$("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => selectTab_(btn.dataset.tab));
    });
  }

  function selectTab_(tab) {
    S.tab = tab;
    $$("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $$("[data-panel]").forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== tab));
  }

  function wireTheme_() {
    const btn = $("btnTheme");
    if (!btn) return;
    btn.addEventListener("click", () => {
      S.dark = !S.dark;
      document.documentElement.classList.toggle("dark", S.dark);
    });
  }

  function wireButtons_() {
    const btnRefresh = $("btnRefresh");
    if (btnRefresh) btnRefresh.addEventListener("click", refreshAll_);

    const btnGenPlan = $("btnGenPlan");
    if (btnGenPlan)
      btnGenPlan.addEventListener("click", async () => {
        try {
          btnGenPlan.disabled = true;
          await apiPost("planificacion.generar", {});
          await loadPlanificacion_();
          toast("Planificación generada.");
        } catch (e) {
          toast(e.message || String(e), "error");
        } finally {
          btnGenPlan.disabled = false;
        }
      });

    const btnGenOutbox = $("btnGenOutbox");
    if (btnGenOutbox)
      btnGenOutbox.addEventListener("click", async () => {
        try {
          btnGenOutbox.disabled = true;
          await apiPost("slack.outbox.generar", {});
          await loadOutbox_();
          toast("Outbox generada.");
        } catch (e) {
          toast(e.message || String(e), "error");
        } finally {
          btnGenOutbox.disabled = false;
        }
      });

    const btnPresRefresh = $("btnPresRefresh");
    if (btnPresRefresh)
      btnPresRefresh.addEventListener("click", async () => {
        const d = $("presDate")?.value || "";
        await loadPresentismo_(d);
        toast("Presentismo actualizado.");
      });
  }

  /************************************************************
   * Refresh / Load
   ************************************************************/
  async function refreshAll_() {
    try {
      show("loading", true);
      await apiGet("health");
      await Promise.all([
        loadColaboradores_(),
        loadCanales_(),
        loadFlujos_(),
        loadHabilitaciones_(),
        loadPlanificacion_(),
        loadOutbox_(),
        loadPresentismo_($("presDate")?.value || ""),
      ]);
      buildCaches_();
      hydrateFilters_();
      renderAll_();
    } catch (e) {
      toast(e.message || String(e), "error");
      console.error(e);
    } finally {
      show("loading", false);
    }
  }

  async function loadColaboradores_() {
    const r = await apiGet("colaboradores.list");
    S.data.colaboradores = Array.isArray(r) ? r : [];
  }

  async function loadCanales_() {
    const r = await apiGet("canales.list");
    S.data.canales = Array.isArray(r) ? r : [];
  }

  async function loadFlujos_() {
    const r = await apiGet("flujos.list");
    S.data.flujos = Array.isArray(r) ? r : [];
  }

  async function loadHabilitaciones_() {
    const r = await apiGet("habilitaciones.list");
    S.data.habilitaciones = r || null;
  }

  async function loadPresentismo_(date) {
    const [week, stats] = await Promise.all([
      apiGet("presentismo.week", { date }),
      apiGet("presentismo.stats", { date }),
    ]);
    S.data.presentismoWeek = week || null;
    S.data.presentismoStats = stats || null;
  }

  async function loadPlanificacion_() {
    const r = await apiGet("planificacion.list");
    S.data.planificacion = Array.isArray(r) ? r : [];
  }

  async function loadOutbox_() {
    const r = await apiGet("slack.outbox.list");
    S.data.outbox = Array.isArray(r) ? r : [];
  }

  /************************************************************
   * Caches / Filters
   ************************************************************/
  function buildCaches_() {
    // Roles from colaboradores
    const roles = new Set();
    S.data.colaboradores.forEach((c) => {
      const r = String(c.Rol || c.ROL || c.rol || "").trim();
      if (r) roles.add(r);
    });
    S.caches.roles = Array.from(roles).sort((a, b) => a.localeCompare(b));

    // Flows from flujos list
    S.caches.flows = (S.data.flujos || [])
      .map((f) => String(f.flujo || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  function hydrateFilters_() {
    // Update multi-select items without resetting selections
    updateMultiSelectItems_("msRolesColabs", S.caches.roles);
    updateMultiSelectItems_("msFlowsDaily", S.caches.flows);
    updateMultiSelectItems_("msFlowsHab", S.caches.flows);
  }

  /************************************************************
   * Render All
   ************************************************************/
  function renderAll_() {
    renderDashboard_();
    renderOperativa_();
    renderColaboradores_();
    renderHabilitaciones_();
    renderPresentismo_();
    renderPlanificacion_();
    renderOutbox_();
  }

  /************************************************************
   * MultiSelect Component
   ************************************************************/
  function mountMultiSelect(hostId, cfg) {
    const host = typeof hostId === "string" ? $(hostId) : hostId;
    if (!host) return;

    const title = cfg?.title || "Filtro";
    const items = Array.isArray(cfg?.items) ? cfg.items : [];
    const onChange = typeof cfg?.onChange === "function" ? cfg.onChange : null;

    const state = {
      open: false,
      selected: new Set(), // selected values; empty => no filter
      items: items.slice(),
    };

    host.innerHTML = `
      <div class="ms">
        <button class="ms-btn" type="button" aria-haspopup="listbox" aria-expanded="false">
          <span class="ms-title">${escapeHtml(title)}</span>
          <span class="ms-value"></span>
          <span class="ms-caret">▾</span>
        </button>
        <div class="ms-panel hidden" role="listbox" aria-multiselectable="true">
          <div class="ms-actions">
            <button class="ms-act" data-act="all" type="button">Todos</button>
            <button class="ms-act" data-act="none" type="button">Ninguno</button>
          </div>
          <div class="ms-list"></div>
        </div>
      </div>
    `;

    const btn = host.querySelector(".ms-btn");
    const panel = host.querySelector(".ms-panel");
    const list = host.querySelector(".ms-list");
    const valueEl = host.querySelector(".ms-value");

    function renderValue() {
      const n = state.selected.size;
      if (n === 0) valueEl.textContent = "Todos";
      else if (n === 1) valueEl.textContent = Array.from(state.selected)[0];
      else valueEl.textContent = `${n} seleccionados`;
      btn.setAttribute("aria-expanded", String(state.open));
    }

    function buildMenu() {
      list.innerHTML = state.items
        .map((it) => {
          const checked = state.selected.has(it) ? "checked" : "";
          return `
            <label class="ms-item">
              <input type="checkbox" value="${escapeAttr(it)}" ${checked} />
              <span>${escapeHtml(it)}</span>
            </label>
          `;
        })
        .join("");

      $$("input[type=checkbox]", list).forEach((cb) => {
        cb.addEventListener("change", () => {
          const v = cb.value;
          if (cb.checked) state.selected.add(v);
          else state.selected.delete(v);
          renderValue();
          onChange?.(new Set(state.selected));
        });
      });
    }

    function open() {
      state.open = true;
      panel.classList.remove("hidden");
      renderValue();
    }

    function close() {
      state.open = false;
      panel.classList.add("hidden");
      renderValue();
    }

    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      state.open ? close() : open();
    });

    host.querySelectorAll(".ms-act").forEach((b) => {
      b.addEventListener("click", () => {
        const act = b.dataset.act;
        if (act === "all") state.selected.clear(); // no filter
        if (act === "none") state.selected.clear(); // keep minimal; "none" => empty selection
        buildMenu();
        renderValue();
        onChange?.(new Set(state.selected));
      });
    });

    document.addEventListener("click", (ev) => {
      if (!state.open) return;
      if (!host.contains(ev.target)) close();
    });

    // Expose updater on host
    host.__ms = {
      setItems(newItems) {
        state.items = Array.isArray(newItems) ? newItems.slice() : [];
        // Prune selections that no longer exist
        const allowed = new Set(state.items);
        Array.from(state.selected).forEach((v) => {
          if (!allowed.has(v)) state.selected.delete(v);
        });
        buildMenu();
        renderValue();
      },
      setSelected(set) {
        state.selected = new Set(set || []);
        buildMenu();
        renderValue();
        onChange?.(new Set(state.selected));
      },
      getSelected() {
        return new Set(state.selected);
      },
      clear() {
        state.selected.clear();
        buildMenu();
        renderValue();
        onChange?.(new Set(state.selected));
      },
    };

    // initial
    buildMenu();
    renderValue();
  }

  function updateMultiSelectItems_(hostId, items) {
    const host = $(hostId);
    if (!host || !host.__ms) return;
    host.__ms.setItems(items);
  }

  /************************************************************
   * Search component
   ************************************************************/
  function mountSearch(inputId, onChange) {
    const el = $(inputId);
    if (!el) return;
    el.addEventListener("input", () => onChange(el.value || ""));
  }

  /************************************************************
   * Dashboard
   ************************************************************/
  function renderDashboard_() {
    const colabs = applyColabsFilter_(S.data.colaboradores, S.fColabs);
    setText("dashTotalColabs", String(colabs.length));

    // Role distribution
    const byRole = {};
    colabs.forEach((c) => {
      const r = String(c.Rol || c.ROL || c.rol || "Sin rol").trim() || "Sin rol";
      byRole[r] = (byRole[r] || 0) + 1;
    });

    const rows = Object.entries(byRole)
      .sort((a, b) => b[1] - a[1])
      .map(([role, n]) => `<tr><td>${escapeHtml(role)}</td><td class="num">${n}</td></tr>`)
      .join("");

    setHTML("dashRoleTable", rows || `<tr><td colspan="2" class="muted">Sin datos</td></tr>`);
  }

  /************************************************************
   * Operativa diaria (Flujos)
   ************************************************************/
  function renderOperativa_() {
    const flows = applyFlowsFilter_(S.data.flujos, S.fDaily);
    const rows = flows
      .map((f) => {
        const flujo = String(f.flujo || "");
        const req = Number(f.perfiles_requeridos || 0);
        const ch = String(f.channel_id || "");
        return `
          <tr>
            <td>${escapeHtml(flujo)}</td>
            <td class="num">${req}</td>
            <td class="mono">${escapeHtml(ch)}</td>
          </tr>`;
      })
      .join("");

    setHTML("dailyFlowsTable", rows || `<tr><td colspan="3" class="muted">Sin flujos</td></tr>`);
  }

  /************************************************************
   * Colaboradores
   ************************************************************/
  function renderColaboradores_() {
    const rowsData = applyColabsFilter_(S.data.colaboradores, S.fColabs);
    const rows = rowsData
      .map((c) => {
        const id = String(c.ID_MELI || c.Id || c.id || "");
        const nombre = String(c.Nombre || c.nombre || "");
        const rol = String(c.Rol || c.ROL || c.rol || "");
        const slackId = String(c.Slack_ID || c.SLACK_ID || c.slack_id || "");
        return `
          <tr>
            <td class="mono">${escapeHtml(id)}</td>
            <td>${escapeHtml(nombre)}</td>
            <td>${escapeHtml(rol)}</td>
            <td class="mono">${escapeHtml(slackId)}</td>
          </tr>`;
      })
      .join("");

    setHTML("colabsTable", rows || `<tr><td colspan="4" class="muted">Sin resultados</td></tr>`);
    setText("colabsCount", String(rowsData.length));
  }

  /************************************************************
   * Habilitaciones
   ************************************************************/
  function renderHabilitaciones_() {
    const payload = S.data.habilitaciones;
    if (!payload) {
      setHTML("habTable", `<tr><td class="muted">Sin datos</td></tr>`);
      return;
    }
    const flujos = payload.flujos || [];
    const rows = payload.rows || [];

    const filtered = applyHabsFilter_(rows, flujos, S.fHab);

    // Header
    const head = `
      <tr>
        <th>ID_MELI</th>
        ${flujos.map((f) => `<th>${escapeHtml(f)}</th>`).join("")}
      </tr>
    `;
    setHTML("habHead", head);

    // Body
    const body = filtered
      .map((r) => {
        const id = String(r.id_meli || "");
        const cols = flujos
          .map((f) => {
            const h = !!r[`H_${f}`];
            const fi = !!r[`F_${f}`];
            const cls = h ? (fi ? "tag tag-on tag-fijo" : "tag tag-on") : "tag tag-off";
            const txt = h ? (fi ? "ON • FIJO" : "ON") : "OFF";
            return `<td><span class="${cls}">${txt}</span></td>`;
          })
          .join("");
        return `<tr><td class="mono">${escapeHtml(id)}</td>${cols}</tr>`;
      })
      .join("");

    setHTML("habTable", body || `<tr><td class="muted">Sin resultados</td></tr>`);
    setText("habCount", String(filtered.length));
  }

  /************************************************************
   * Presentismo
   ************************************************************/
  function renderPresentismo_() {
    const week = S.data.presentismoWeek;
    const stats = S.data.presentismoStats;

    if (stats) {
      setText("presDateLabel", String(stats.date || ""));
      setText("presPresentes", String(stats.presentes ?? 0));
      setText("presAusentes", String(stats.ausentes ?? 0));
      setText("presTotal", String(stats.total ?? 0));
    }

    if (!week || !Array.isArray(week.days) || !Array.isArray(week.rows)) {
      setHTML("presHead", "");
      setHTML("presTable", `<tr><td class="muted">Sin datos</td></tr>`);
      return;
    }

    const days = week.days;
    const rows = week.rows;

    // Header
    const head = `
      <tr>
        <th>ID</th>
        <th>Nombre</th>
        ${days
          .map((d) => {
            const cls = d.isFeriado ? "feriado" : "";
            return `<th class="${cls}" title="${escapeAttr(d.key)}">${escapeHtml(d.label)}</th>`;
          })
          .join("")}
      </tr>`;
    setHTML("presHead", head);

    // Body
    const q = (S.fPres.q || "").trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (!q) return true;
      const id = String(r.id_meli || "").toLowerCase();
      const n = String(r.nombre || "").toLowerCase();
      return id.includes(q) || n.includes(q);
    });

    const body = filtered
      .map((r) => {
        const id = String(r.id_meli || "");
        const nombre = String(r.nombre || "");
        const cols = days
          .map((d) => {
            const v = r.vals?.[d.key];
            const txt = v == null ? "" : String(v);
            const cls = txt === "P" ? "p-ok" : txt ? "p-bad" : "";
            return `<td class="${cls}">${escapeHtml(txt)}</td>`;
          })
          .join("");
        return `<tr><td class="mono">${escapeHtml(id)}</td><td>${escapeHtml(nombre)}</td>${cols}</tr>`;
      })
      .join("");

    setHTML("presTable", body || `<tr><td class="muted">Sin resultados</td></tr>`);
    setText("presCount", String(filtered.length));
  }

  /************************************************************
   * Planificación
   ************************************************************/
  function renderPlanificacion_() {
    const rows = (S.data.planificacion || [])
      .map((r) => {
        return `
          <tr>
            <td>${escapeHtml(String(r.fecha || ""))}</td>
            <td>${escapeHtml(String(r.flujo || ""))}</td>
            <td class="mono">${escapeHtml(String(r.id_meli || ""))}</td>
            <td>${escapeHtml(String(r.nombre || ""))}</td>
            <td>${escapeHtml(String(r.rol || ""))}</td>
            <td>${escapeHtml(String(r.es_fijo || ""))}</td>
          </tr>`;
      })
      .join("");

    setHTML("planTable", rows || `<tr><td colspan="6" class="muted">Sin datos</td></tr>`);
    setText("planCount", String((S.data.planificacion || []).length));
  }

  /************************************************************
   * Slack Outbox
   ************************************************************/
  function renderOutbox_() {
    const rows = (S.data.outbox || [])
      .map((r) => {
        const prog = String(r.programado_para || "");
        const estado = String(r.estado || "");
        const btns = `
          <button class="btn btn-xs" data-act="edit" data-row="${r.row}">Editar</button>
          <button class="btn btn-xs" data-act="send" data-row="${r.row}">Enviar</button>
          <button class="btn btn-xs" data-act="program" data-row="${r.row}">Programar</button>
          <button class="btn btn-xs" data-act="unprogram" data-row="${r.row}">Desprogramar</button>
        `;

        return `
          <tr>
            <td class="num">${r.row}</td>
            <td>${escapeHtml(String(r.fecha || ""))}</td>
            <td>${escapeHtml(String(r.canal || ""))}</td>
            <td class="mono">${escapeHtml(String(r.channel_id || ""))}</td>
            <td class="wrap">${escapeHtml(String(r.mensaje || ""))}</td>
            <td>${escapeHtml(estado)}</td>
            <td class="mono">${escapeHtml(prog)}</td>
            <td class="actions">${btns}</td>
          </tr>`;
      })
      .join("");

    setHTML("outboxTable", rows || `<tr><td colspan="8" class="muted">Sin datos</td></tr>`);
    setText("outboxCount", String((S.data.outbox || []).length));
    wireOutboxActions_();
  }

  function wireOutboxActions_() {
    $$("[data-act]", $("outboxTableWrap") || document).forEach((b) => {
      b.addEventListener("click", async () => {
        const act = b.dataset.act;
        const row = Number(b.dataset.row);
        if (!row) return;

        if (act === "edit") return openOutboxEdit_(row);
        if (act === "send") return sendOutbox_(row);
        if (act === "program") return openOutboxProgram_(row);
        if (act === "unprogram") return unprogramOutbox_(row);
      });
    });
  }

  async function openOutboxEdit_(row) {
    const item = (S.data.outbox || []).find((x) => Number(x.row) === Number(row));
    if (!item) return;

    const canal = prompt("Canal:", item.canal || "");
    if (canal == null) return;
    const channel_id = prompt("Channel ID:", item.channel_id || "");
    if (channel_id == null) return;
    const mensaje = prompt("Mensaje:", item.mensaje || "");
    if (mensaje == null) return;

    try {
      await apiPost("slack.outbox.update", { row, canal, channel_id, mensaje });
      await loadOutbox_();
      renderOutbox_();
      toast("Outbox actualizada.");
    } catch (e) {
      toast(e.message || String(e), "error");
    }
  }

  async function sendOutbox_(row) {
    try {
      // If Netlify sends directly, this is typically handled there.
      // Keeping current behavior: call backend "slack.outbox.enviar"
      await apiPost("slack.outbox.enviar", { row });
      await loadOutbox_();
      renderOutbox_();
      toast("Envío ejecutado.");
    } catch (e) {
      toast(e.message || String(e), "error");
    }
  }

  async function openOutboxProgram_(row) {
    const item = (S.data.outbox || []).find((x) => Number(x.row) === Number(row));
    if (!item) return;

    const val = prompt("Programado para (YYYY-MM-DDTHH:mm):", item.programado_para || "");
    if (val == null) return;

    try {
      await apiPost("slack.outbox.programar", { row, programado_para: val });
      await loadOutbox_();
      renderOutbox_();
      toast("Programado.");
    } catch (e) {
      toast(e.message || String(e), "error");
    }
  }

  async function unprogramOutbox_(row) {
    try {
      await apiPost("slack.outbox.desprogramar", { row });
      await loadOutbox_();
      renderOutbox_();
      toast("Desprogramado.");
    } catch (e) {
      toast(e.message || String(e), "error");
    }
  }

  /************************************************************
   * Filters apply
   ************************************************************/
  function applyColabsFilter_(rows, f) {
    const q = (f.q || "").trim().toLowerCase();
    const rolesSel = f.roles || new Set();

    return (rows || []).filter((c) => {
      const id = String(c.ID_MELI || "").toLowerCase();
      const n = String(c.Nombre || "").toLowerCase();
      const r = String(c.Rol || c.ROL || "").trim();

      if (q && !id.includes(q) && !n.includes(q) && !String(r).toLowerCase().includes(q)) return false;

      if (rolesSel.size > 0 && !rolesSel.has(r)) return false;

      return true;
    });
  }

  function applyFlowsFilter_(rows, f) {
    const q = (f.q || "").trim().toLowerCase();
    const sel = f.flows || new Set();
    return (rows || []).filter((x) => {
      const name = String(x.flujo || "").trim();
      if (q && !name.toLowerCase().includes(q)) return false;
      if (sel.size > 0 && !sel.has(name)) return false;
      return true;
    });
  }

  function applyHabsFilter_(rows, flujos, f) {
    const q = (f.q || "").trim().toLowerCase();
    const sel = f.flows || new Set();

    return (rows || []).filter((r) => {
      const id = String(r.id_meli || "").toLowerCase();
      if (q && !id.includes(q)) return false;

      // If flow filter selected: keep only rows that have at least one of those flows enabled?
      if (sel.size > 0) {
        let ok = false;
        sel.forEach((flow) => {
          if (r[`H_${flow}`]) ok = true;
        });
        if (!ok) return false;
      }
      return true;
    });
  }

  /************************************************************
   * Escape helpers
   ************************************************************/
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function escapeAttr(s) {
    // minimal attr escape
    return escapeHtml(s).replace(/`/g, "&#096;");
  }

  /************************************************************
   * Styles for toasts (injected if not present)
   ************************************************************/
  (function injectToastCss() {
    if (document.getElementById("toastCss")) return;
    const css = document.createElement("style");
    css.id = "toastCss";
    css.textContent = `
      #toastWrap{position:fixed;right:16px;bottom:16px;display:flex;flex-direction:column;gap:10px;z-index:9999}
      .toast{opacity:0;transform:translateY(8px);transition:.25s ease;max-width:360px;padding:10px 12px;border-radius:10px;
        background:rgba(255,255,255,.08);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:13px}
      .toast.in{opacity:1;transform:translateY(0)}
      .toast-error{border-color:rgba(255,80,80,.35)}
      .toast-info{border-color:rgba(120,170,255,.35)}
    `;
    document.head.appendChild(css);
  })();

  /************************************************************
   * End
   ************************************************************/
})();
