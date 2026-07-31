"use strict";

const cfg=window.MONITOR_CONFIG;
const {createClient}=window.supabase;
const client=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
const $=(s)=>document.querySelector(s);
let session=null,data=null;

const cloneDefault=()=>JSON.parse(JSON.stringify(cfg.DEFAULT_DATA));
const esc=(v)=>String(v??"").replace(/[&"<>'`]/g,c=>({"&":"&amp;",'"':"&quot;","<":"&lt;",">":"&gt;","'":"&#39;","`":"&#96;"}[c]));
function message(text,error=false){const el=$("#adminMessage");el.textContent=text;el.classList.toggle("error",error)}
async function ensureAdmin(){
  const {data:row,error}=await client.from("admin_users").select("user_id").eq("user_id",session.user.id).maybeSingle();
  if(error||!row)throw new Error("Esta conta não está autorizada no painel.");
}
async function loadPublicData(){
  const {data:blob,error}=await client.storage.from(cfg.PUBLIC_BUCKET).download(cfg.PUBLIC_FILE);
  if(error||!blob)return cloneDefault();
  const parsed=JSON.parse(await blob.text());
  return {...cloneDefault(),...parsed};
}
async function uploadPublicData(next){
  next.updatedAt=new Date().toISOString();
  const body=new Blob([JSON.stringify(next,null,2)],{type:"application/json;charset=utf-8"});
  const {error}=await client.storage.from(cfg.PUBLIC_BUCKET).upload(cfg.PUBLIC_FILE,body,{upsert:true,contentType:"application/json",cacheControl:"60"});
  if(error)throw error;
}
function showDashboard(){
  $("#loginPanel").hidden=true;$("#dashboard").hidden=false;$("#sessionEmail").textContent=session.user.email||"Administrador";
}
function render(){
  $("#siteTitle").value=data.siteTitle||"";
  $("#siteSubtitle").value=data.siteSubtitle||"";
  $("#headerAlertText").value=data.headerAlertText||"";
  $("#instagramUrl").value=data.instagramUrl||"";
  $("#xUrl").value=data.xUrl||"";
  $("#telegramUrl").value=data.telegramUrl||"";
  $("#coverImage").value=data.coverImage||"";
  $("#monitorEnabled").checked=Boolean(data.monitorEnabled);
  $("#checkIntervalSeconds").value=data.checkIntervalSeconds||60;
  $("#manualNotice").value=data.manualNotice||"";
  data.testAlert=data.testAlert||{active:false,showId:"",status:"available",label:"Disponível",details:"Alerta de teste temporário.",startedAt:null};
  $("#footerTextInput").value=data.footerText||"";
  $("#coverPreview").hidden=!data.coverImage;
  $("#coverPreview").src=data.coverImage||"";

  $("#showsEditor").innerHTML=(data.shows||[]).map((show,i)=>`
    <div class="show-editor" data-show="${i}">
      <div class="editor-head"><strong>Show ${i+1}</strong><button class="admin-button danger remove-show" type="button">Excluir</button></div>
      <div class="form-grid">
        <label>Dia<input class="show-date" value="${esc(show.date)}"></label>
        <label>Mês<input class="show-month" value="${esc(show.month)}"></label>
        <label>Cidade<input class="show-subtitle" value="${esc(show.subtitle)}"></label>
        <label>URL oficial<input class="show-url" value="${esc(show.url)}"></label>
        <label class="checkbox"><input class="show-enabled" type="checkbox" ${show.enabled!==false?"checked":""}>Monitorar</label>
      </div>
    </div>`).join("");

  $("#infoEditor").innerHTML=(data.infoCards||[]).map((card,i)=>`
    <div class="info-editor" data-info="${i}">
      <div class="editor-head"><strong>Card ${i+1}</strong><button class="admin-button danger remove-info" type="button">Excluir</button></div>
      <div class="form-grid">
        <label>Título<input class="info-title" value="${esc(card.title)}"></label>
        <label>Texto do link<input class="info-link-text" value="${esc(card.linkText)}"></label>
        <label class="full">Descrição<textarea class="info-text">${String(card.text??"")}</textarea></label>
        <label class="full">URL do link<input class="info-link-url" value="${esc(card.linkUrl)}"></label>
      </div>
    </div>`).join("");

  $("#testShowSelect").innerHTML=(data.shows||[]).map(s=>`<option value="${esc(s.id)}" ${data.testAlert.showId===s.id?"selected":""}>${esc(s.date)} ${esc(s.month)}</option>`).join("");
  $("#testStatusSelect").value=data.testAlert.status||"available";
  $("#stateList").innerHTML=(data.shows||[]).map(s=>`<div class="state-item"><strong>${esc(s.date)} ${esc(s.month)}</strong><br>${esc(s.label||"Aguardando")}<br><span class="muted">${esc(s.details||"")}</span></div>`).join("");
}
function collect(){
  data.siteTitle=$("#siteTitle").value.trim();
  data.siteSubtitle=$("#siteSubtitle").value.trim();
  data.headerAlertText=$("#headerAlertText").value.trim();
  data.instagramUrl=$("#instagramUrl").value.trim();
  data.xUrl=$("#xUrl").value.trim();
  data.telegramUrl=$("#telegramUrl").value.trim();
  data.coverImage=$("#coverImage").value.trim();
  data.monitorEnabled=$("#monitorEnabled").checked;
  data.checkIntervalSeconds=Math.max(60,Number($("#checkIntervalSeconds").value||60));
  data.manualNotice=$("#manualNotice").value.trim();
  data.footerText=$("#footerTextInput").value.trim();
  data.shows=[...document.querySelectorAll("[data-show]")].map((el,i)=>{
    const old=data.shows[i]||{};
    return {
      id:old.id||`show-${Date.now()}-${i}`,
      date:el.querySelector(".show-date").value.trim(),
      month:el.querySelector(".show-month").value.trim(),
      subtitle:el.querySelector(".show-subtitle").value.trim(),
      url:el.querySelector(".show-url").value.trim(),
      enabled:el.querySelector(".show-enabled").checked,
      status:old.status||"sold_out",
      label:old.label||"Esgotado",
      details:old.details||"Nenhuma atualização confirmada no site oficial.",
      statusChangedAt:old.statusChangedAt||null
    };
  });
  data.infoCards=[...document.querySelectorAll("[data-info]")].map(el=>({
    title:el.querySelector(".info-title").value.trim(),
    text:el.querySelector(".info-text").value.trim(),
    linkText:el.querySelector(".info-link-text").value.trim(),
    linkUrl:el.querySelector(".info-link-url").value.trim()
  }));
}
async function openDashboard(){await ensureAdmin();data=await loadPublicData();showDashboard();render()}
async function uploadCover(){
  const file=$("#coverFile").files?.[0];
  if(!file)throw new Error("Selecione uma imagem.");
  if(!file.type.startsWith("image/"))throw new Error("O arquivo precisa ser uma imagem.");
  if(file.size>8*1024*1024)throw new Error("A imagem deve ter no máximo 8 MB.");
  const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
  const path=`covers/capa-${Date.now()}.${ext}`;
  const {error}=await client.storage.from(cfg.MEDIA_BUCKET).upload(path,file,{upsert:true,contentType:file.type,cacheControl:"3600"});
  if(error)throw error;
  const {data:urlData}=client.storage.from(cfg.MEDIA_BUCKET).getPublicUrl(path);
  $("#coverImage").value=urlData.publicUrl;
  $("#coverPreview").src=urlData.publicUrl;
  $("#coverPreview").hidden=false;
  data.coverImage=urlData.publicUrl;
}
async function invokeMonitor(){
  const {data:result,error}=await client.functions.invoke("ticket-monitor",{body:{source:"admin"}});
  if(error)throw error;return result;
}

$("#loginButton").addEventListener("click",async()=>{
  $("#loginMessage").textContent="";
  try{
    const {data:auth,error}=await client.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});
    if(error)throw error;session=auth.session;await openDashboard();
  }catch(e){$("#loginMessage").textContent=e.message;$("#loginMessage").classList.add("error")}
});
$("#logoutButton").addEventListener("click",async()=>{await client.auth.signOut();location.reload()});
$("#uploadCoverButton").addEventListener("click",async()=>{
  const msg=$("#uploadCoverMessage");msg.textContent="Enviando...";
  try{await uploadCover();msg.textContent="Imagem enviada. Agora clique em salvar."}catch(e){msg.textContent=e.message;msg.classList.add("error")}
});
$("#addShow").addEventListener("click",()=>{data.shows.push({id:`show-${Date.now()}`,date:"NOVO",month:"MÊS",subtitle:"SÃO PAULO",url:"https://www.ticketmaster.com.br/",enabled:true,status:"sold_out",label:"Esgotado",details:"Nenhuma atualização confirmada no site oficial.",statusChangedAt:null});render()});
$("#addInfo").addEventListener("click",()=>{data.infoCards.push({title:"NOVO CARD",text:"Descrição",linkText:"",linkUrl:""});render()});
$("#showsEditor").addEventListener("click",e=>{const b=e.target.closest(".remove-show");if(!b)return;data.shows.splice(Number(b.closest("[data-show]").dataset.show),1);render()});
$("#infoEditor").addEventListener("click",e=>{const b=e.target.closest(".remove-info");if(!b)return;data.infoCards.splice(Number(b.closest("[data-info]").dataset.info),1);render()});
$("#saveButton").addEventListener("click",async()=>{try{collect();message("Publicando...");await uploadPublicData(data);message("Alterações publicadas.");data=await loadPublicData();render()}catch(e){message(e.message,true)}});
$("#checkNow").addEventListener("click",async()=>{try{message("Verificando...");const r=await invokeMonitor();message(r?.message||"Concluído.");data=await loadPublicData();render()}catch(e){message(e.message,true)}});
$("#testAlert").addEventListener("click",async()=>{
  try{
    collect();
    if(!data.shows.length)throw new Error("Cadastre um show.");
    const showId=$("#testShowSelect").value||data.shows[0].id;
    const status=$("#testStatusSelect").value==="sold_out"?"sold_out":"available";
    data.testAlert={
      active:true,
      showId,
      status,
      label:status==="available"?"Disponível":"Esgotado",
      details:"Alerta de teste temporário publicado pelo painel.",
      startedAt:new Date().toISOString()
    };
    await uploadPublicData(data);
    message("Teste temporário publicado. Os status reais não foram alterados.");
    data=await loadPublicData();
    render();
  }catch(e){message(e.message,true)}
});

$("#clearTestAlert").addEventListener("click",async()=>{
  try{
    collect();
    data.testAlert={
      active:false,
      showId:"",
      status:"available",
      label:"Disponível",
      details:"Alerta de teste temporário.",
      startedAt:null
    };
    data.manualNotice="";
    $("#manualNotice").value="";
    await uploadPublicData(data);
    message("Teste removido. O site voltou aos status reais.");
    data=await loadPublicData();
    render();
  }catch(e){message(e.message,true)}
});

client.auth.getSession().then(async({data:auth})=>{if(!auth.session)return;session=auth.session;try{await openDashboard()}catch(e){await client.auth.signOut();$("#loginMessage").textContent=e.message;$("#loginMessage").classList.add("error")}});
