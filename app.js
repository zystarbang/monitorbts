"use strict";

const cfg = window.MONITOR_CONFIG;
const $ = (selector) => document.querySelector(selector);
let previousStatuses = JSON.parse(sessionStorage.getItem("monitor-statuses") || "{}");
let audioEnabled = localStorage.getItem("monitor-audio") === "true";
let audioContext = null;
let alarmInterval = null;
let nextRefreshAt = Date.now() + 60000;

function cloneDefault() {
  return JSON.parse(JSON.stringify(cfg.DEFAULT_DATA));
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[c]);
}
function publicFileUrl() {
  const base = cfg.SUPABASE_URL.replace(/\/$/, "");
  const bucket = encodeURIComponent(cfg.PUBLIC_BUCKET);
  const file = cfg.PUBLIC_FILE.split("/").map(encodeURIComponent).join("/");
  const minute = Math.floor(Date.now() / 60000);
  return `${base}/storage/v1/object/public/${bucket}/${file}?v=${minute}`;
}
function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"
    }).format(new Date(value));
  } catch { return "—"; }
}
function beep() {
  if (!audioEnabled) return;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  audioContext ||= new Context();
  if (audioContext.state === "suspended") audioContext.resume();
  [0,.24,.48].forEach((offset,index)=>{
    const osc=audioContext.createOscillator();
    const gain=audioContext.createGain();
    osc.frequency.value=index===1?960:730;
    gain.gain.setValueAtTime(.0001,audioContext.currentTime+offset);
    gain.gain.exponentialRampToValueAtTime(.22,audioContext.currentTime+offset+.02);
    gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+offset+.2);
    osc.connect(gain);gain.connect(audioContext.destination);
    osc.start(audioContext.currentTime+offset);osc.stop(audioContext.currentTime+offset+.23);
  });
}
function startAlarm(){stopAlarm();beep();alarmInterval=setInterval(beep,3500)}
function stopAlarm(){if(alarmInterval)clearInterval(alarmInterval);alarmInterval=null}

function render(data, firstLoad=false) {
  const safe = {...cloneDefault(), ...data};
  safe.shows = Array.isArray(data?.shows) && data.shows.length ? data.shows : cloneDefault().shows;
  safe.infoCards = Array.isArray(data?.infoCards) && data.infoCards.length ? data.infoCards : cloneDefault().infoCards;

  document.title = safe.siteTitle || "Monitor Ticket BTS";
  $("#siteTitle").textContent = safe.siteTitle;
  $("#siteSubtitle").textContent = safe.siteSubtitle;
  $("#alertText").textContent = safe.headerAlertText || "Ativar alerta";
  $("#instagramLink").href = safe.instagramUrl || "#";
  $("#telegramLink").href = safe.telegramUrl || "#";
  $("#xLink").hidden = !safe.xUrl;
  $("#xLink").href = safe.xUrl || "#";
  $("#footerText").textContent = safe.footerText || "BTS Ticket Monitor Brasil";

  if (safe.coverImage) {
    $("#hero").style.backgroundImage = `url("${String(safe.coverImage).replace(/"/g,"%22")}")`;
  } else {
    $("#hero").style.backgroundImage = "linear-gradient(145deg,#222,#0a0a0a)";
  }

  const notice = String(safe.manualNotice || "").trim();
  $("#manualNoticeSection").hidden = !notice;
  $("#manualNotice").textContent = notice;

  const testAlert = safe.testAlert && safe.testAlert.active ? safe.testAlert : null;
  const shows = safe.shows
    .filter(s => s.enabled !== false)
    .map(s => testAlert && testAlert.showId === s.id ? {
      ...s,
      status: testAlert.status || "available",
      label: testAlert.label || "Disponível",
      details: testAlert.details || "Alerta de teste temporário.",
      statusChangedAt: testAlert.startedAt || new Date().toISOString(),
      __testMode: true
    } : s);
  $("#showsGrid").innerHTML = shows.map(show => `
    <article class="show-card status-${escapeHtml(show.status || "unknown")}">
      <div class="show-date-block">
        <div class="show-day">${escapeHtml(show.date)}</div>
        <div class="show-date-meta">
          <div class="show-month">${escapeHtml(show.month || "")}</div>
          <div class="show-city">${escapeHtml(show.subtitle || "")}</div>
        </div>
      </div>

      <p class="status-label">${show.__testMode ? "MODO DE TESTE — STATUS NÃO REAL" : "STATUS DO INGRESSO"}</p>
      <div class="status-bar">
        <span class="status-dot"></span>
        <span class="status-text">${escapeHtml(show.label || "Aguardando")}</span>
      </div>

      <p class="show-details">${escapeHtml(show.details || "")}</p>

      <div class="show-bottom">
        <div class="show-divider"></div>
        <div class="last-check-row">
          <span class="last-check-label">ÚLTIMA VERIFICAÇÃO</span>
          <span class="last-check-time">${escapeHtml(formatDate(show.statusChangedAt))}</span>
        </div>
        <a class="official-button" href="${escapeHtml(show.url || "#")}" target="_blank" rel="noopener">
          <span>ABRIR SITE OFICIAL</span><span>↗</span>
        </a>
      </div>
    </article>
  `).join("");

  $("#infoGrid").innerHTML = safe.infoCards.map(card => `
    <article class="info-card">
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.text)}</p>
      ${card.linkText ? `<a href="${escapeHtml(card.linkUrl || "#")}" ${String(card.linkUrl||"").startsWith("http")?'target="_blank" rel="noopener"':''}>${escapeHtml(card.linkText)}</a>` : ""}
    </article>
  `).join("");

  for (const show of shows) {
    const previous = previousStatuses[show.id];
    if (!firstLoad && show.status === "available" && previous !== "available") {
      $("#officialModalLink").href = show.url;
      $("#availableMessage").textContent = `${show.date} DE ${show.month}: confirme agora na Ticketmaster.`;
      $("#availableModal").hidden = false;
      startAlarm();
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Ingressos disponíveis!", {body:`${show.date} de ${show.month}: confirme na Ticketmaster.`});
      }
    }
    previousStatuses[show.id] = show.status;
  }
  sessionStorage.setItem("monitor-statuses", JSON.stringify(previousStatuses));
}

async function loadData(firstLoad=false) {
  if (document.hidden && !firstLoad) return;
  try {
    const response = await fetch(publicFileUrl(), {cache:"default",headers:{Accept:"application/json"}});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json(), firstLoad);
  } catch (error) {
    console.warn("data.json indisponível; usando conteúdo padrão.", error);
    render(cloneDefault(), firstLoad);
  } finally {
    nextRefreshAt = Date.now() + Math.max(60, Number(cfg.REFRESH_SECONDS || 60))*1000;
  }
}
function updateCountdown() {
  const seconds = Math.max(0,Math.ceil((nextRefreshAt-Date.now())/1000));
  $("#countdown").textContent = `${seconds} SEGUNDOS`;
}
$("#audioButton").addEventListener("click", async ()=>{
  audioEnabled=!audioEnabled;
  localStorage.setItem("monitor-audio",String(audioEnabled));
  $("#audioButton").classList.toggle("active",audioEnabled);
  if(audioEnabled){
    beep();
    if("Notification" in window && Notification.permission==="default") await Notification.requestPermission();
  } else stopAlarm();
});
$("#closeModal").addEventListener("click",()=>{$("#availableModal").hidden=true;stopAlarm()});
document.addEventListener("visibilitychange",()=>{if(!document.hidden)loadData(false)});
$("#audioButton").classList.toggle("active",audioEnabled);
render(cloneDefault(), true);
loadData(true);
setInterval(()=>loadData(false),Math.max(60,Number(cfg.REFRESH_SECONDS||60))*1000);
setInterval(updateCountdown,1000);
