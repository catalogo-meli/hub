import { API } from "./api.js";

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined) return;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return n;
}

function toast(msg, type = "info") {
  const box = el("div", { class: `toast ${type}` }, msg);
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3500);
}

function groupBy(arr, key) {
  const m = new Map();
  arr.forEach((x) => {
    const k = x[key] ?? "";
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  });
  return m;
}

async function main() {
  const root = $("#app");
  root.innerHTML = "";

  const header = el("div", { class: "page-header" }, [
    el("h1", {}, "Catálogo"),
    el("div", { class: "sub" }, "HUB Equipo & Planificación"),
  ]);

  const tabs = ["Operativa diaria"]; // por ahora te dejo solo lo crítico
  let active = "Operativa diaria";

  const tabBar = el(
    "div",
    { class: "tabs" },
    tabs.map((t) =>
      el(
        "button",
        {
          class: `tab ${t === active ? "active" : ""}`,
          onclick: () => {
            active = t;
            render();
          },
        },
        t
      )
    )
  );

  const content = el("div", { class: "content" });

  root.append(header, tabBar, content);

  let canales = [];
  let flujos = [];
  let plan = [];
  let outbox = [];
  let stats = null;

  const debounce = (fn, ms = 350) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  async function loadAll() {
    const [c, f, s] = await Promise.all([API.canalesList(), API.flujosList(), API.presentismoStats()]);
    canales = c;
    flujos = f;
    stats = s;
    plan = await API.planificacionList().catch(() => []);
    outbox = await API.slackOutboxList().catch(() => []);
  }

  const saveFlujo = debounce(async (flujo, perfiles, channel_id) => {
    try {
      await API.flujosUpsert({ flujo, perfiles_requeridos: Number(perfiles || 0), channel_id: String(channel_id || "") });
      toast("Flujo guardado", "ok");
      flujos = await API.flujosList();
      render();
    } catch (e) {
      toast(e.message || String(e), "err");
    }
  }, 400);

  function canalSelect(currentId, onChange) {
    const select = el(
      "select",
      {
        class: "select",
        onchange: (ev) => onChange(ev.target.value),
      },
      [
        el("option", { value: "" }, "—"),
        ...canales.map((c) => el("option", { value: c.channel_id, selected: c.channel_id === currentId ? "selected" : null }, c.canal)),
      ]
    );
    return select;
  }

  function cardRow(cards) {
    return el(
      "div",
      { class: "cards-row" },
      cards.map((c) =>
        el("div", { class: "card" }, [
          el("div", { class: "card-title" }, c.title),
          el("div", { class: "card-value" }, String(c.value ?? "0")),
          c.subtitle ? el("div", { class: "card-sub" }, c.subtitle) : null,
        ])
      )
    );
  }

  function renderFlujos() {
    const table = el("div", { class: "box" }, [
      el("h2", {}, "1) Flujos (Perfiles requeridos)"),
      el("div", { class: "muted" }, "Autosave: se guarda al cambiar Slack channel o Perfiles requeridos."),
    ]);

    const hdr = el("div", { class: "grid-hdr" }, [
      el("div", { class: "col" }, "Flujo"),
      el("div", { class: "col" }, "Slack channel"),
      el("div", { class: "col" }, "Perfiles requeridos"),
      el("div", { class: "col" }, ""),
    ]);

    const rows = flujos.map((f) => {
      const flujoName = f.flujo;

      const nameCell = el("div", { class: "cell" }, [
        el("input", { class: "input", value: flujoName, disabled: "disabled" }),
      ]);

      const chanCell = el("div", { class: "cell" }, [
        canalSelect(f.channel_id || "", (v) => saveFlujo(flujoName, f.perfiles_requeridos, v)),
      ]);

      const reqCell = el("div", { class: "cell" }, [
        el("input", {
          class: "input",
          type: "number",
          min: "0",
          value: String(f.perfiles_requeridos ?? 0),
          onchange: (ev) => saveFlujo(flujoName, ev.target.value, f.channel_id),
        }),
      ]);

      const delBtn = el(
        "button",
        {
          class: "btn danger",
          onclick: async () => {
            if (!confirm(`Borrar flujo "${flujoName}"?`)) return;
            try {
              await API.flujosDelete({ flujo: flujoName });
              flujos = await API.flujosList();
              render();
            } catch (e) {
              toast(e.message || String(e), "err");
            }
          },
        },
        "Borrar"
      );

      return el("div", { class: "grid-row" }, [nameCell, chanCell, reqCell, el("div", { class: "cell" }, delBtn)]);
    });

    // add row
    let newFlujo = "";
    let newReq = 0;
    let newCh = "";

    const addRow = el("div", { class: "grid-row" }, [
      el("div", { class: "cell" }, [
        el("input", {
          class: "input",
          placeholder: "+ Nuevo flujo...",
          oninput: (e) => (newFlujo = e.target.value),
        }),
      ]),
      el("div", { class: "cell" }, [canalSelect("", (v) => (newCh = v))]),
      el("div", { class: "cell" }, [
        el("input", {
          class: "input",
          type: "number",
          min: "0",
          value: "0",
          onchange: (e) => (newReq = Number(e.target.value || 0)),
        }),
      ]),
      el(
        "div",
        { class: "cell" },
        el(
          "button",
          {
            class: "btn primary",
            onclick: async () => {
              try {
                if (!newFlujo.trim()) return toast("Nuevo flujo vacío", "err");
                if (!newCh) return toast("Elegí un canal", "err");
                await API.flujosUpsert({ flujo: newFlujo.trim(), perfiles_requeridos: Number(newReq || 0), channel_id: newCh });
                flujos = await API.flujosList();
                render();
              } catch (e) {
                toast(e.message || String(e), "err");
              }
            },
          },
          "Agregar"
        )
      ),
    ]);

    table.append(hdr, ...rows, addRow);
    return table;
  }

  function renderPlanificacion() {
    const box = el("div", { class: "box" }, [
      el("h2", {}, "2) Planificación (resultado)"),
      el("div", { class: "muted" }, plan.length ? "Agrupado por flujo." : "Sin planificación cargada."),
    ]);

    if (!plan.length) return box;

    const byFlujo = groupBy(plan, "flujo");
    const grid = el("div", { class: "plan-grid" });

    [...byFlujo.keys()].sort().forEach((flujo) => {
      const items = byFlujo.get(flujo) || [];
      const card = el("div", { class: "plan-card" }, [
        el("div", { class: "plan-title" }, flujo),
        el("ul", { class: "plan-list" }, items.map((x) => el("li", {}, `${x.nombre}${x.es_fijo ? " (F)" : ""}`))),
      ]);
      grid.appendChild(card);
    });

    box.appendChild(grid);
    return box;
  }

  function renderOutbox() {
    const box = el("div", { class: "box" }, [el("h2", {}, "3) Slack Outbox (pendientes)")]);
    if (!outbox.length) {
      box.appendChild(el("div", { class: "muted" }, "Sin outbox."));
      return box;
    }

    const table = el("div", { class: "outbox" });

    outbox.forEach((r) => {
      const canalSel = canalSelect(r.channel_id || "", async (v) => {
        try {
          await API.slackOutboxUpdate({ row: r.row, channel_id: v });
          outbox = await API.slackOutboxList();
          render();
        } catch (e) {
          toast(e.message || String(e), "err");
        }
      });

      const msg = el("textarea", {
        class: "textarea",
        rows: "4",
        value: r.mensaje || "",
        onblur: async (e) => {
          try {
            await API.slackOutboxUpdate({ row: r.row, mensaje: e.target.value });
            outbox = await API.slackOutboxList();
          } catch (err) {
            toast(err.message || String(err), "err");
          }
        },
      });

      const sendBtn = el(
        "button",
        {
          class: "btn primary",
          onclick: async () => {
            try {
              await API.slackOutboxEnviar({ row: r.row });
              outbox = await API.slackOutboxList();
              render();
              toast("Enviado", "ok");
            } catch (e) {
              toast(e.message || String(e), "err");
            }
          },
        },
        "Enviar"
      );

      table.appendChild(
        el("div", { class: "outbox-row" }, [
          el("div", { class: "ob-date" }, r.fecha || ""),
          el("div", { class: "ob-canal" }, canalSel),
          el("div", { class: "ob-msg" }, msg),
          el("div", { class: "ob-state" }, `${r.estado || ""}${r.error ? ` — ${r.error}` : ""}`),
          el("div", { class: "ob-actions" }, sendBtn),
        ])
      );
    });

    box.appendChild(table);
    return box;
  }

  function renderButtons() {
    return el("div", { class: "btn-row" }, [
      el(
        "button",
        {
          class: "btn primary",
          onclick: async () => {
            try {
              const res = await API.planificacionGenerar();
              toast(`Planificación OK: ${res.asignaciones} asignaciones`, "ok");
              plan = await API.planificacionList();
              stats = await API.presentismoStats();
              render();
            } catch (e) {
              toast(e.message || String(e), "err");
            }
          },
        },
        "Generar planificación"
      ),
      el(
        "button",
        {
          class: "btn",
          onclick: async () => {
            try {
              const res = await API.slackOutboxGenerar();
              toast(`Outbox OK: ${res.filas} filas`, "ok");
              outbox = await API.slackOutboxList();
              render();
            } catch (e) {
              toast(e.message || String(e), "err");
            }
          },
        },
        "Generar Outbox"
      ),
      el(
        "button",
        {
          class: "btn success",
          onclick: async () => {
            try {
              const res = await API.slackOutboxEnviar({});
              toast(`Enviados: ${res.sent}`, "ok");
              outbox = await API.slackOutboxList();
              render();
            } catch (e) {
              toast(e.message || String(e), "err");
            }
          },
        },
        "Enviar todos"
      ),
    ]);
  }

  function render() {
    // update tab styles
    [...tabBar.querySelectorAll("button.tab")].forEach((b) => b.classList.toggle("active", b.textContent === active));

    content.innerHTML = "";

    const analistas = Number(stats?.analistas || 0);
    const licencias = Number(stats?.licencias || 0);
    const disponibles = Number(stats?.disponibles || 0);

    content.appendChild(
      cardRow([
        { title: "Analistas totales", value: analistas },
        { title: "Licencias hoy", value: licencias, subtitle: stats?.date || "" },
        { title: "Perfiles disponibles (hoy)", value: disponibles },
      ])
    );

    content.appendChild(renderFlujos());
    content.appendChild(renderButtons());
    content.appendChild(renderPlanificacion());
    content.appendChild(renderOutbox());
  }

  // Init
  content.innerHTML = "Cargando...";
  await loadAll();
  render();
}

main().catch((e) => {
  console.error(e);
  document.querySelector("#app").textContent = `Error: ${e.message || e}`;
});
