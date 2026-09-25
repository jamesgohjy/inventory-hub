// AV Inventory Hub v7.03.3.14u — evidence-ranked parser architecture
(function(){
  'use strict';
  if(window.__AV_V703314T_BOOTSTRAP_STARTED__)return;
  window.__AV_V703314T_BOOTSTRAP_STARTED__=true;
  const VERSION='7.03.3.14u',ASSET_REV='v703314u-parser-evidence-20260925-1';
  async function loadScript(src,globalName){
    if(globalName&&window[globalName])return window[globalName];
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=()=>reject(new Error('Unable to load '+src));document.head.appendChild(s);});
    if(globalName&&!window[globalName])throw new Error(globalName+' did not initialise.');
    return globalName?window[globalName]:true;
  }
  async function launch(){
    try{
      const key=encodeURIComponent(VERSION+'-'+ASSET_REV),v7032=await loadScript('v7032-core.js?v='+key,'V7032Patch');
      await loadScript('v7032-web-verify.js?v='+key,'V7032WebVerify');
      const v7033=await loadScript('v7033-core.js?v='+key,'V7033Patch');
      const gates=[['behavioral',v7033.runRegressionChecks()],['historical',v7033.runHistoricalRegressionChecks()],['quality',v7033.runQualityRegressionChecks14n()],['holdout',v7033.runHoldoutRegressionChecks14n()],['intelligence',v7033.runIntelligenceRegressionChecks14o()],['aerospace',v7033.runAerospaceRegressionChecks14p()],['monetary',v7033.runMonetaryConsensusRegressionChecks14q()],['header-aligned-money',v7033.runHeaderAlignedMoneyRegressionChecks14r()]];
      const failed=gates.filter(([,r])=>!r?.ok).map(([n,r])=>n+': '+(r?.failures||[]).join(', '));if(failed.length)throw new Error('Regression gate failed: '+failed.join(' | '));
      await loadScript('modules/parser-evidence-engine.js?v='+key,'InventoryHubParserEvidenceEngine');
      await loadScript('modules/canonical-parser.js?v='+key,'InventoryHubCanonicalParser');
      await loadScript('modules/parser-table.js?v='+key,'InventoryHubParserTable');
      await loadScript('modules/grouped-company-ui.js?v='+key,'InventoryHubGroupedCompanyUI');
      await loadScript('runtime-v7.03.3.14u.js?v='+key);
      if(!window.__AV_DIRECT_RUNTIME_READY__?.then)throw new Error('Direct runtime readiness promise was not created.');
      await window.__AV_DIRECT_RUNTIME_READY__;
      if(window.__AV_DIRECT_RUNTIME_LOADED__!==VERSION)throw new Error('Direct runtime did not initialise as '+VERSION+'.');
      v7032.installParserPatch();v7033.installParserPatch();v7033.installUiVersionSync();
      window.__AV_INVENTORY_VERSION__=VERSION;window.__AV_INVENTORY_BUILD__=VERSION;window.__AV_INVENTORY_BASELINE__='direct repository modules v7.03.3.14u';
      console.info('AV Inventory Hub '+VERSION+' loaded with evidence-ranked parsing.',Object.fromEntries(gates));
    }catch(err){
      console.error('AV Inventory Hub '+VERSION+' startup error:',err);
      const box=document.createElement('div');box.style.cssText='position:fixed;inset:20px;z-index:2147483647;background:#fff;border:1px solid #d33;border-radius:12px;padding:20px;font:14px/1.5 Arial;color:#222;box-shadow:0 10px 30px #0002';
      const msg=String(err?.message||err).replace(/[&<>]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]));box.innerHTML='<b>AV Inventory Hub '+VERSION+' could not start.</b><br>No database changes were made by this loader.<br><br><code>'+msg+'</code>';document.body.appendChild(box);
    }
  }
  launch();
})();
