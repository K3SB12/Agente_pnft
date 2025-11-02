/* app.js — Agente Soldado PNFT (integración n8n + cola offline) */

/* ---------- CONFIG ---------- */
const AVAILABLE_AREAS = [
  "Apropiación tecnológica y Digital",
  "Programación y Algoritmos",
  "Computación física y Robótica",
  "Ciencia de datos e Inteligencia Artificial"
];
const OFFLINE_QUEUE_KEY = "mi_al_ia_queue_v1";
const N8N_URL_KEY = "mi_al_ia_n8n_url_v1";

/* ---------- UTIL ---------- */
function $(id){ return document.getElementById(id); }
function toast(msg){ console.log(msg); /* puedes reemplazar con UI real */ }

/* ---------- CARGA UI ---------- */
function populateLevels(){
  const levelsSelect = $("levels");
  if(!window.PNFT_DATA){ levelsSelect.innerHTML='<option value="">No hay PNFT_DATA cargado</option>'; return; }
  Object.keys(PNFT_DATA).forEach(level=>{
    const o = document.createElement("option"); o.value=level; o.textContent=level; levelsSelect.appendChild(o);
  });
}
function renderAreaChips(){
  const c = $("areasContainer"); c.innerHTML="";
  AVAILABLE_AREAS.forEach(a=>{
    const div=document.createElement("div"); div.className="chip"; div.textContent=a;
    div.addEventListener("click", ()=>{
      // toggle selected
      div.classList.toggle("selected");
      renderSaberes();
    });
    c.appendChild(div);
  });
}
function renderSaberes(){
  const selLevels = Array.from($("levels").selectedOptions).map(o=>o.value);
  const selectedAreas = Array.from(document.querySelectorAll(".chip.selected")).map(x=>x.textContent).slice(0,4);
  const box = $("saberesContainer"); box.innerHTML="";
  if(selLevels.length===0){ box.innerHTML='<p class="hint">Seleccione al menos un nivel arriba para ver saberes.</p>'; return; }
  // show for first selected level (simpler UI). Can extend to multi-level later.
  const level = selLevels[0];
  selectedAreas.forEach(area=>{
    const div = document.createElement("div");
    div.innerHTML = `<h4>${area}</h4>`;
    const saberes = PNFT_DATA[level] && PNFT_DATA[level][area] && PNFT_DATA[level][area].saberes ? PNFT_DATA[level][area].saberes : [];
    saberes.forEach(s=>{
      const id = `chk_${area}_${s.nombre}`.replace(/\s+/g,'_');
      const el = document.createElement("div"); el.className="saber-checkbox";
      el.innerHTML = `<label><input type="checkbox" data-area="${area}" value="${s.nombre}" id="${id}" /> ${s.nombre}</label>`;
      div.appendChild(el);
    });
    box.appendChild(div);
  });
}

/* ---------- OFFLINE QUEUE ---------- */
function loadQueue(){ try{ return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]"); }catch(e){ return []; } }
function saveQueue(q){ localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)); renderQueue(); }
function enqueue(payload){
  const q = loadQueue(); q.push({payload, ts: Date.now()}); saveQueue(q); toast("Guardado en cola offline.");
}
function dequeueAndSendAll(){
  const q = loadQueue();
  if(q.length===0) return;
  // send sequentially
  (async ()=>{
    const newQ=[];
    for(const item of q){
      const ok = await sendToN8n(item.payload);
      if(!ok) newQ.push(item);
    }
    saveQueue(newQ);
  })();
}
function renderQueue(){
  const q = loadQueue();
  const box = $("queueList"); box.innerHTML = q.length? q.map(i=>`<div>Pendiente ${new Date(i.ts).toLocaleString()}</div>`).join("") : "<div>Cola vacía</div>";
}

/* ---------- n8n integration ---------- */
async function sendToN8n(payload){
  const saved = localStorage.getItem(N8N_URL_KEY);
  if(!saved){ toast("No hay webhook n8n configurado."); return false; }
  try {
    const res = await fetch(saved, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload), timeout: 20000 });
    if(!res.ok){ toast("Webhook n8n respondió con error: "+res.status); return false; }
    const json = await res.json();
    if(json && json.textoGenerado){
      // returned AI text -> show
      showGeneratedResult({origin:"n8n", text: json.textoGenerado, payload});
      return true;
    } else {
      toast("Respuesta n8n sin campo textoGenerado, guardada en cola.");
      return false;
    }
  } catch(err){
    console.error("Error enviando a n8n:", err);
    return false;
  }
}

/* ---------- FALLBACK: Generador local (simulación IA) ---------- */
function localGenerate(payload){
  // simple template generator — mejora esto si quieres
  const {nivel, areas} = payload;
  let text = `PLANEAMIENTO SINTÉTICO (Generador local)\nNivel: ${nivel}\n\n`;
  for(const a of Object.keys(areas)){
    text += `Área: ${a}\n`;
    for(const s of areas[a]){
      text += ` - Saber: ${s}\n   Indicador: (Autogenerado) El estudiante será capaz de... \n`;
    }
    text += `\n`;
  }
  text += `\nMetodología: ABJ\nGenerado por: AGENTE_LOCAL\n`;
  showGeneratedResult({origin:"local", text, payload});
}

/* ---------- UI: show generated plan ---------- */
function showGeneratedResult({origin, text, payload}){
  const container = $("plansContainer");
  const wrap = document.createElement("div"); wrap.className="plan";
  wrap.innerHTML = `<h4>${payload.nivel} · Generado por ${origin}</h4><pre>${escapeHtml(text)}</pre>
    <div style="display:flex;gap:8px">
      <button class="btn saveHtml">Descargar HTML</button>
      <button class="btn alt copyBtn">Copiar</button>
    </div>`;
  wrap.querySelector(".saveHtml").addEventListener("click", ()=>{
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Planeamiento ${payload.nivel}</title></head><body><pre>${escapeHtml(text)}</pre></body></html>`;
    const blob = new Blob([html], {type:"text/html"}); const url = URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`planeamiento_${payload.nivel}.html`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });
  wrap.querySelector(".copyBtn").addEventListener("click", ()=>{ navigator.clipboard.writeText(text); toast("Copiado al portapapeles"); });
  container.prepend(wrap);
}

/* ---------- GENERAR (ui -> payload -> send) ---------- */
async function handleGenerate(){
  const selLevels = Array.from($("levels").selectedOptions).map(o=>o.value);
  if(selLevels.length===0){ alert("Seleccione al menos un nivel."); return; }
  const nivel = selLevels[0]; // toma el primero por ahora
  // collect selected saberes
  const checks = Array.from(document.querySelectorAll('#saberesContainer input[type="checkbox"]:checked'));
  if(checks.length===0){ alert("Seleccione al menos un saber."); return; }
  const areas = {};
  checks.forEach(c=>{
    const area = c.dataset.area;
    if(!areas[area]) areas[area]=[];
    areas[area].push(c.value);
  });
  const rda = $("rda").value || "";
  const payload = { nivel, areas, rda, timestamp: Date.now(), persona:"AgenteSoldadoFull" };

  const mode = $("agentMode").value;
  if(mode === "soldado"){
    // try send to n8n; if not reachable -> enqueue
    const ok = await sendToN8n(payload);
    if(!ok){
      enqueue(payload);
      // local fallback generator too (optional)
      localGenerate(payload);
    }
  } else {
    // local generation
    localGenerate(payload);
  }
}

/* ---------- HELPERS ---------- */
function escapeHtml(s){ return (s+"").replace(/[&<>'"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

/* ---------- EVENT BINDINGS ---------- */
document.addEventListener("DOMContentLoaded", ()=>{
  populateLevels();
  renderAreaChips();
  renderQueue();
  // load webhook saved
  const saved = localStorage.getItem(N8N_URL_KEY) || "";
  $("n8nUrl").value = saved;
  $("saveWebhook").addEventListener("click", ()=>{
    const v = $("n8nUrl").value.trim();
    if(v){ localStorage.setItem(N8N_URL_KEY, v); toast("Webhook guardado."); } else { localStorage.removeItem(N8N_URL_KEY); toast("Webhook eliminado."); }
  });
  $("generateBtn").addEventListener("click", handleGenerate);
  $("exportBtn").addEventListener("click", ()=>{ /* puedes añadir export general */ alert("Usa los botones individuales para exportar."); });

  // online event -> attempt to flush queue
  window.addEventListener("online", ()=>{ toast("Online: reintentando cola..."); dequeueAndSendAll(); });
  // try at start
  if(navigator.onLine) dequeueAndSendAll();
});
