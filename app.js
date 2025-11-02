/* app.js — Versión final: integración PNFT_DATA automática, límite 4 áreas, cola offline, n8n fallback local */

/* ---------- CONFIG y CLAVES ---------- */
const OFFLINE_QUEUE_KEY = "mi_al_ia_queue_v2";
const N8N_URL_KEY = "mi_al_ia_n8n_url_v2";
const MAX_AREAS = 4;

/* ---------- UTIL ---------- */
const $ = id => document.getElementById(id);
const toast = msg => { console.log(msg); }; // reemplazar luego por UI si querés

/* ---------- CHEQUEO PNFT_DATA ---------- */
if (typeof PNFT_DATA === "undefined") {
  // PNFT_DATA no encontrado -> aviso visible en UI
  document.addEventListener("DOMContentLoaded", ()=>{
    const levels = $("levels");
    levels.innerHTML = '<option value="">NO SE ENCONTRÓ PNFT_DATA — sube pnft-datos-js.js</option>';
  });
  throw new Error("PNFT_DATA no encontrado. Coloca pnft-datos-js.js que defina el objeto global PNFT_DATA.");
}

/* ---------- DERIVAR AREAS (únicas) ---------- */
function extractAreasFromPNFT() {
  const areasSet = new Set();
  Object.values(PNFT_DATA).forEach(levelObj => {
    if (!levelObj || typeof levelObj !== "object") return;
    Object.keys(levelObj).forEach(areaName => areasSet.add(areaName));
  });
  return Array.from(areasSet);
}

/* ---------- UI: llenar niveles y areas ---------- */
function populateLevels() {
  const levelsSelect = $("levels");
  levelsSelect.innerHTML = "";
  Object.keys(PNFT_DATA).forEach(level => {
    const o = document.createElement("option");
    o.value = level;
    o.textContent = level;
    levelsSelect.appendChild(o);
  });
}

function renderAreaChips() {
  const areas = extractAreasFromPNFT();
  const c = $("areasContainer"); c.innerHTML = "";
  areas.forEach(a => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = a;
    chip.addEventListener("click", () => {
      const selectedCount = document.querySelectorAll(".chip.selected").length;
      if (!chip.classList.contains("selected") && selectedCount >= MAX_AREAS) {
        alert(`Solo puedes seleccionar hasta ${MAX_AREAS} áreas.`);
        return;
      }
      chip.classList.toggle("selected");
      renderSaberes();
    });
    c.appendChild(chip);
  });
}

/* ---------- SABERES: combinar para niveles seleccionados + evitar duplicados ---------- */
function getSaberesForAreaAcrossLevels(area, selectedLevels) {
  const saberNames = new Map(); // nombre -> indicador array (merge)
  selectedLevels.forEach(lvl => {
    const lvlObj = PNFT_DATA[lvl];
    if (!lvlObj) return;
    const areaObj = lvlObj[area];
    if (!areaObj || !Array.isArray(areaObj.saberes)) return;
    areaObj.saberes.forEach(s => {
      // si ya existe, no duplicar; combinar indicadores si fuera necesario
      if (!saberNames.has(s.nombre)) {
        saberNames.set(s.nombre, Array.isArray(s.indicadores) ? s.indicadores.slice() : []);
      } else {
        const existing = saberNames.get(s.nombre);
        const newIndicadores = Array.isArray(s.indicadores) ? s.indicadores : [];
        newIndicadores.forEach(ni => { if (!existing.includes(ni)) existing.push(ni); });
        saberNames.set(s.nombre, existing);
      }
    });
  });
  // devolver array de objetos {nombre, indicadores}
  return Array.from(saberNames.entries()).map(([nombre, indicadores]) => ({ nombre, indicadores }));
}

function renderSaberes() {
  const selLevels = Array.from($("levels").selectedOptions).map(o => o.value);
  const box = $("saberesContainer");
  box.innerHTML = "";
  const selectedAreaChips = Array.from(document.querySelectorAll(".chip.selected")).map(c => c.textContent);
  if (selLevels.length === 0) {
    box.innerHTML = '<p class="hint">Seleccione al menos un nivel para ver saberes.</p>';
    return;
  }
  if (selectedAreaChips.length === 0) {
    box.innerHTML = '<p class="hint">Seleccione áreas (hasta 4) para ver los saberes disponibles.</p>';
    return;
  }
  // Para cada área seleccionada, mostrar su lista de saberes combinada para los niveles seleccionados
  selectedAreaChips.forEach(area => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `<h4>${area}</h4>`;
    const saberes = getSaberesForAreaAcrossLevels(area, selLevels);
    if (saberes.length === 0) {
      wrapper.innerHTML += `<p class="hint">No hay saberes definidos para esta área en los niveles seleccionados.</p>`;
    } else {
      saberes.forEach(s => {
        const id = `chk_${area}_${s.nombre}`.replace(/\s+/g,"_");
        const el = document.createElement("div");
        el.className = "saber-checkbox";
        el.innerHTML = `<label><input type="checkbox" data-area="${area}" data-indicadores='${JSON.stringify(s.indicadores)}' value="${s.nombre}" id="${id}" /> ${s.nombre}</label>`;
        wrapper.appendChild(el);
      });
    }
    box.appendChild(wrapper);
  });
}

/* ---------- COLA OFFLINE ---------- */
function loadQueue() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]"); }
  catch(e) { return []; }
}
function saveQueue(q) { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)); renderQueue(); }
function enqueue(payload) {
  const q = loadQueue();
  q.push({ payload, ts: Date.now() });
  saveQueue(q);
  toast("Guardado en cola offline.");
}
function renderQueue() {
  const q = loadQueue();
  const box = $("queueList");
  if (!box) return;
  if (q.length === 0) { box.innerHTML = "<div>Cola vacía</div>"; return; }
  box.innerHTML = q.map((i, idx) => `<div>Pendiente ${idx+1} — ${new Date(i.ts).toLocaleString()}</div>`).join("");
}
async function dequeueAndSendAll() {
  const q = loadQueue();
  if (q.length === 0) return;
  const remaining = [];
  for (const item of q) {
    const ok = await sendToN8n(item.payload);
    if (!ok) remaining.push(item);
  }
  saveQueue(remaining);
}

/* ---------- n8n integration ---------- */
async function sendToN8n(payload) {
  const url = localStorage.getItem(N8N_URL_KEY);
  if (!url) { toast("No hay webhook n8n configurado."); return false; }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      toast("Webhook n8n respondió con error: " + res.status);
      return false;
    }
    const json = await res.json();
    // n8n workflow debe devolver { textoGenerado: "..." } o similar
    if (json && (json.textoGenerado || json.body && json.body.textoGenerado)) {
      const text = json.textoGenerado || json.body.textoGenerado;
      showGeneratedResult({ origin: "n8n", text, payload });
      return true;
    } else {
      // Si no tiene el campo esperado, intenta detectar contenido en 'response'
      if (json && typeof json === "object") {
        const textGuess = JSON.stringify(json).slice(0,2000);
        showGeneratedResult({ origin: "n8n-raw", text: textGuess, payload });
        return true;
      }
      toast("Respuesta n8n sin textoGenerado.");
      return false;
    }
  } catch (err) {
    console.error("Error enviando a n8n:", err);
    return false;
  }
}

/* ---------- FALLBACK: Generador local (simulación IA) ---------- */
function localGenerate(payload) {
  const { nivel, areas, rda } = payload;
  let text = `PLANEAMIENTO SINTÉTICO (Generador local)\nNivel: ${nivel}\nRDA: ${rda || "-"}\n\n`;
  Object.keys(areas).forEach(area => {
    text += `Área: ${area}\n`;
    areas[area].forEach(saber => {
      text += ` - Saber: ${saber}\n   Indicador sugerido: ${generateIndicadorPlaceholder(saber)}\n`;
    });
    text += `\n`;
  });
  text += `Metodología: ABJ\nGenerado por: AGENTE_LOCAL\n`;
  showGeneratedResult({ origin: "local", text, payload });
}
function generateIndicadorPlaceholder(saber) {
  return `El/la estudiante será capaz de demostrar comprensión y aplicación básica del saber "${saber}".`;
}

/* ---------- RENDER / UI de resultado ---------- */
function showGeneratedResult({ origin, text, payload }) {
  const container = $("plansContainer");
  const wrap = document.createElement("div");
  wrap.className = "plan";
  const title = `${payload.nivel} · ${origin}`;
  wrap.innerHTML = `
    <h4>${escapeHtml(title)}</h4>
    <pre>${escapeHtml(text)}</pre>
    <div style="display:flex;gap:8px">
      <button class="btn saveHtml">Descargar HTML</button>
      <button class="btn alt copyBtn">Copiar texto</button>
    </div>
  `;
  wrap.querySelector(".saveHtml").addEventListener("click", () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Planeamiento ${payload.nivel}</title></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `planeamiento_${payload.nivel}.html`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });
  wrap.querySelector(".copyBtn").addEventListener("click", () => { navigator.clipboard.writeText(text); toast("Copiado al portapapeles"); });
  container.prepend(wrap);
}

/* ---------- MAIN: generar payload y enviar ---------- */
async function handleGenerate() {
  const selLevels = Array.from($("levels").selectedOptions).map(o => o.value);
  if (selLevels.length === 0) { alert("Selecciona al menos un nivel."); return; }
  // collect selected saberes grouped by area
  const checked = Array.from(document.querySelectorAll('#saberesContainer input[type="checkbox"]:checked'));
  if (checked.length === 0) { alert("Selecciona al menos un saber."); return; }
  const areas = {};
  checked.forEach(c => {
    const area = c.dataset.area;
    const nombre = c.value;
    if (!areas[area]) areas[area] = [];
    if (!areas[area].includes(nombre)) areas[area].push(nombre);
  });
  const nivel = selLevels[0]; // para encabezado usamos el primero (puedes ajustar)
  const rda = $("rda").value || "";
  const payload = { nivel, nivelesSeleccionados: selLevels, areas, rda, timestamp: Date.now(), origen: "AgenteSoldadoFull" };

  const mode = $("agentMode").value;
  if (mode === "soldado") {
    const ok = await sendToN8n(payload);
    if (!ok) {
      enqueue(payload);
      // fallback local generation to show a result inmediato
      localGenerate(payload);
    }
  } else {
    localGenerate(payload);
  }
}

/* ---------- EXPORTAR TODO (HTML) ---------- */
function exportAllAsHtml() {
  const plansHtml = $("plansContainer").innerHTML || "<p>No hay planeamientos generados.</p>";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Planeamientos Exportados</title></head><body>${plansHtml}</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = 'planeamientos_exportados.html'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/* ---------- HELPERS ---------- */
function escapeHtml(s) { return (s+"").replace(/[&<>'"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

/* ---------- EVENT BINDINGS ---------- */
document.addEventListener("DOMContentLoaded", () => {
  populateLevels();
  renderAreaChips();
  renderQueue();

  // cargar webhook si existe
  const saved = localStorage.getItem(N8N_URL_KEY) || "";
  $("n8nUrl").value = saved;

  $("saveWebhook").addEventListener("click", () => {
    const v = $("n8nUrl").value.trim();
    if (v) { localStorage.setItem(N8N_URL_KEY, v); toast("Webhook guardado."); } else alert("Pega la URL completa del webhook.");
  });
  $("clearWebhook").addEventListener("click", () => { localStorage.removeItem(N8N_URL_KEY); $("n8nUrl").value = ""; toast("Webhook eliminado."); });

  $("levels").addEventListener("change", renderSaberes);

  $("generateBtn").addEventListener("click", handleGenerate);
  $("exportAllBtn").addEventListener("click", exportAllAsHtml);

  // reintentar cola si estamos online
  window.addEventListener("online", () => { toast("Online: Reintentando cola..."); dequeueAndSendAll(); });

  if (navigator.onLine) { dequeueAndSendAll(); }
});
