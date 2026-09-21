// AV Inventory Hub v7.03.2 — verified patch loader
// Exact baseline: v7.03.1 commit f088a9602929d24165fd1ab98fc6744cbada1cb3
(function(){
  'use strict';
  if(window.__AV_V7032_LOADER_STARTED__)return;
  window.__AV_V7032_LOADER_STARTED__=true;

  const VERSION='7.03.2';
  const BASELINE_VERSION='7.03.1';
  const BASELINE_SHA='f088a9602929d24165fd1ab98fc6744cbada1cb3';
  const BASELINE_APP_URL='https://raw.githubusercontent.com/jamesgohjy/inventory-hub/'+BASELINE_SHA+'/app.js';

  async function loadScriptOnce(src,globalName){
    if(window[globalName])return window[globalName];
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=src;s.async=false;s.onload=resolve;s.onerror=()=>reject(new Error('Unable to load '+src));
      document.head.appendChild(s);
    });
    if(!window[globalName])throw new Error(globalName+' did not initialise.');
    return window[globalName];
  }

  async function loadPatchModules(){
    const patch=await loadScriptOnce('v7032-core.js?v='+encodeURIComponent(VERSION),'V7032Patch');
    await loadScriptOnce('v7032-web-verify.js?v='+encodeURIComponent(VERSION),'V7032WebVerify');
    return patch;
  }

  async function launch(){
    try{
      const patch=await loadPatchModules();
      patch.installParserPatch();
      patch.installUiVersionSync();

      const r=await fetch(BASELINE_APP_URL,{cache:'no-store'});
      if(!r.ok)throw new Error('Unable to load verified v7.03.1 baseline ('+r.status+').');
      let src=await r.text();
      if(!src.includes('AV Inventory Hub V7.03.1')||!src.includes("const APP_VERSION='7.03.1';")){
        throw new Error('Baseline signature mismatch. Expected exact v7.03.1 source; patch stopped for safety.');
      }

      // Advance only the active build identity. Historical internal patch labels remain historical.
      src=src.replaceAll('7.03.1',VERSION);
      src+=`\n
;try{globalThis.V7032Patch?.installParserPatch();globalThis.V7032Patch?.installUiVersionSync();}catch(e){console.warn('v7.03.2 post-launch sync skipped',e);}

async function v7032AutoWebVerify(){
  try{
    if(!globalThis.V7032WebVerify||!state?.parsed)return;
    const raw=state.parsed.raw||state.parsed.rawText||'';
    const d=state.parsed.doc||{};
    const sig=[d.invoice_number||'',...(state.parsed.items||[]).map(x=>[x.sku,x.item_name,x.quantity].join(':'))].join('|');
    if(state.parsed.__v7032WebSig===sig)return;
    state.parsed.__v7032WebSig=sig;
    const result=await globalThis.V7032WebVerify.verifyParsed(state.parsed,raw,{timeoutMs:7000});
    state.parsed=result.parsed;
    globalThis.V7032WebVerify.renderNotice(result);
    if(typeof v703RenderVerificationNotice==='function')v703RenderVerificationNotice();
    if(typeof v661RenderImportEligibility==='function')v661RenderImportEligibility();
  }catch(e){console.warn('v7.03.2 Level 2B web verification skipped',e);}
}
function v7032InstallReviewObserver(){
  const area=document.getElementById('reviewArea');if(!area)return;
  const run=()=>{if(!area.classList.contains('hidden'))setTimeout(v7032AutoWebVerify,250);};
  new MutationObserver(run).observe(area,{attributes:true,attributeFilter:['class']});
  document.addEventListener('click',e=>{if(e.target.closest?.('#addParsedItemBtn,#saveImportBtn'))setTimeout(v7032AutoWebVerify,150);},true);
  run();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',v7032InstallReviewObserver,{once:true});else v7032InstallReviewObserver();
\n`;

      const blob=new Blob([src],{type:'text/javascript'}),url=URL.createObjectURL(blob);
      try{await import(url);}finally{setTimeout(()=>URL.revokeObjectURL(url),1500);}

      patch.installParserPatch();
      patch.installUiVersionSync();
      window.__AV_INVENTORY_VERSION__=VERSION;
      window.__AV_INVENTORY_BUILD__=VERSION;
      window.__AV_INVENTORY_BASELINE__=BASELINE_VERSION+'@'+BASELINE_SHA;
      console.info('AV Inventory Hub v'+VERSION+' loaded on verified v'+BASELINE_VERSION+' baseline '+BASELINE_SHA.slice(0,8));
    }catch(err){
      console.error('AV Inventory Hub v7.03.2 startup error:',err);
      const box=document.createElement('div');
      box.style.cssText='position:fixed;inset:20px;z-index:2147483647;background:#fff;border:1px solid #d33;border-radius:12px;padding:20px;font:14px/1.5 Arial;color:#222;box-shadow:0 10px 30px #0002';
      const msg=String(err?.message||err).replace(/[&<>]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]));
      box.innerHTML='<b>AV Inventory Hub v7.03.2 could not start.</b><br>No database changes were made by this loader.<br><br><code>'+msg+'</code>';
      document.body.appendChild(box);
    }
  }

  launch();
})();
