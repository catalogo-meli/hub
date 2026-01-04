// app.js
import { HubAPI } from "./api.js";

const $ = (sel) => document.querySelector(sel);

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function setStatus(msg, isError = false) {
  const el = $("#status");
  el.textContent = msg;
  el.className = isError ? "status error" : "status";
}

function renderTable(rows) {
  const tbody = $("#tbody");
  tbody.innerHTML = "";

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Sin registros</td></tr>`;
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.colaborador || r.nombre || r.usuario || "-")}</td>
      <td>${escapeHtml(r.tipo || "-")}</td>
      <td>${escapeHtml(r.desde || r.from || "-")}</td>
      <td>${escapeHtml(r.hasta || r.to || "-")}</td>
      <td>${escapeHtml(r.comentario || "")}</td>
    `;
    tbody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

async function refreshList() {
  try {
    setStatus("Cargando…");
    const from = $("#from").value;
    const to = $("#to").value;

    const data = await HubAPI.listarAusencias(from, to);
    renderTable(Array.isArray(data) ? data : (data.rows || data.items || []));
    setStatus("OK");
  } catch (e) {
    console.error(e);
    setStatus(e.message || String(e), true);
  }
}

async function init() {
  $("#from").value = todayISO();
  $("#to").value = addDaysISO(todayISO(), 14);

  $("#btnHealth").addEventListener("click", async () => {
    try {
      setStatus("Probando health…");
      const r = await HubAPI.health();
      setStatus(`Health OK: ${JSON.stringify(r)}`);
    } catch (e) {
      setStatus(e.message || String(e), true);
    }
  });

  $("#btnRefresh").addEventListener("click", refreshList);

  $("#formCreate").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      setStatus("Creando…");

      const payload = {
        colaborador: $("#colaborador").value.trim(),
        tipo: $("#tipo").value,
        desde: $("#desde").value,
        hasta: $("#hasta").value,
        comentario: $("#comentario").value.trim(),
      };

      // Validación mínima (el resto lo validás en la API)
      if (!payload.colaborador) throw new Error("Falta colaborador");
      if (!payload.desde || !payload.hasta) throw new Error("Faltan fechas");
      if (payload.desde > payload.hasta) throw new Error("desde no puede ser mayor que hasta");

      await HubAPI.crearAusencia(payload);

      setStatus("Creado. Refrescando…");
      await refreshList();
      setStatus("Creado OK");
      $("#formCreate").reset();
      $("#desde").value = todayISO();
      $("#hasta").value = todayISO();
      $("#tipo").value = "VAC";
    } catch (e) {
      console.error(e);
      setStatus(e.message || String(e), true);
    }
  });

  // defaults form
  $("#desde").value = todayISO();
  $("#hasta").value = todayISO();
  $("#tipo").value = "VAC";

  // carga inicial
  await refreshList();
}

init();
