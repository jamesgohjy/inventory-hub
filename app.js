// AV Inventory Hub v7.03.3.6 — freeze hotfix + cumulative patch loader
// Live baseline: v7.03.2. Verified underlying source: v7.03.1 @ f088a9602929d24165fd1ab98fc6744cbada1cb3
(function(){
  'use strict';
  if(window.__AV_V7033_LOADER_STARTED__)return;
  window.__AV_V7033_LOADER_STARTED__=true;

  const VERSION='7.03.3.6';
  const BASELINE_VERSION='7.03.1';
  const BASELINE_SHA='f088a9602929d24165fd1ab98fc6744cbada1cb3';
  const BASELINE_APP_URL='https://raw.githubusercontent.com/jamesgohjy/inventory-hub/'+BASELINE_SHA+'/app.js';

  async function loadScriptOnce(src,globalName){
    if(window[globalName])return window[globalName];
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=resolve;s.onerror=()=>reject(new Error('Unable to load '+src));document.head.appendChild(s);});
    if(!window[globalName])throw new Error(globalName+' did not initialise.');return window[globalName];
  }
  async function loadPatchModules(){
    const v7032=await loadScriptOnce('v7032-core.js?v='+encodeURIComponent(VERSION),'V7032Patch');
    await loadScriptOnce('v7032-web-verify.js?v='+encodeURIComponent(VERSION),'V7032WebVerify');
    const v7033=await loadScriptOnce('v7033-core.js?v='+encodeURIComponent(VERSION),'V7033Patch');
    return {v7032,v7033};
  }

  async function launch(){
    try{
      const {v7032,v7033}=await loadPatchModules();
      v7032.installParserPatch();
      v7033.installParserPatch();
      v7033.installUiVersionSync();

      const r=await fetch(BASELINE_APP_URL,{cache:'no-store'});
      if(!r.ok)throw new Error('Unable to load verified v7.03.1 baseline ('+r.status+').');
      let src=await r.text();
      if(!src.includes('AV Inventory Hub V7.03.1')||!src.includes("const APP_VERSION='7.03.1';"))throw new Error('Baseline signature mismatch. Expected exact v7.03.1 source; patch stopped for safety.');
      src=src.replaceAll('7.03.1',VERSION);
      const v70336InnerMarker="    src+='\\ntry{installParseAuditWrappers();configureInvoiceFileInputs();}catch(e){console.warn(\\'V6.69 optional audit/file-input setup skipped\\',e);}\\n';";
      const v70336InnerPatch="    // V7.03.3.6 Documents Edit: patch the real/original application source before import.\n    const v70336DocActionOld='<td class=\"actions\"><button data-doc-view=\"${d.id}\">View</button><button data-doc-download=\"${d.id}\">Download</button>${editable?`<button class=\"danger-outline\" data-doc-delete=\"${d.id}\">Delete</button>`:\\'\\'}</td>';\n    const v70336DocActionNew='<td class=\"actions\"><button data-doc-view=\"${d.id}\">View</button>${editable?`<button data-doc-edit=\"${d.id}\">Edit</button>`:\\'\\'}<button data-doc-download=\"${d.id}\">Download</button>${editable?`<button class=\"danger-outline\" data-doc-delete=\"${d.id}\">Delete</button>`:\\'\\'}</td>';\n    src=replaceOnce(src,v70336DocActionOld,v70336DocActionNew,'V7.03.3.6 document Edit action');\n    const v70336HandlerOld=\"for(const id of ['documentsTable','detailBody'])$(id).onclick=async e=>{const el=e.target.closest('[data-doc-view],[data-doc-download],[data-doc-delete]');if(!el)return;try{if(el.dataset.docDelete){\";\n    const v70336Editor=String.raw`\nfunction v70336EnsureDocumentEditor(){\n  let overlay=document.getElementById('v70336DocumentEditor');if(overlay)return overlay;\n  overlay=document.createElement('div');overlay.id='v70336DocumentEditor';overlay.hidden=true;overlay.style.cssText='position:fixed;inset:0;z-index:2147483600;background:rgba(15,23,42,.52);display:none;align-items:center;justify-content:center;padding:20px';\n  overlay.innerHTML='<section role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"v70336DocumentEditorTitle\" style=\"width:min(560px,96vw);max-height:90vh;overflow:auto;background:#fff;color:#172033;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.32)\"><div style=\"display:flex;justify-content:space-between;gap:16px\"><div><h3 id=\"v70336DocumentEditorTitle\" style=\"margin:0 0 6px\">Edit document details</h3><p style=\"margin:0;color:#64748b\">Updates this document and its linked purchase details.</p></div><button type=\"button\" id=\"v70336DocumentEditorClose\" aria-label=\"Close\">\u00d7</button></div><input id=\"v70336DocumentId\" type=\"hidden\"><label style=\"display:grid;gap:6px;margin-top:18px\">Supplier<input id=\"v70336DocumentSupplier\" required></label><label style=\"display:grid;gap:6px;margin-top:14px\">Invoice No.<input id=\"v70336DocumentInvoice\" required></label><label style=\"display:grid;gap:6px;margin-top:14px\">Invoice Date<input id=\"v70336DocumentDate\" type=\"date\"></label><div style=\"display:flex;justify-content:flex-end;gap:10px;margin-top:22px\"><button type=\"button\" id=\"v70336DocumentCancel\" class=\"secondary\">Cancel</button><button type=\"button\" id=\"v70336DocumentSave\">Save changes</button></div></section>';\n  document.body.appendChild(overlay);const close=()=>{overlay.style.display='none';overlay.hidden=true;};$('v70336DocumentEditorClose').onclick=close;$('v70336DocumentCancel').onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close();});\n  $('v70336DocumentSave').onclick=async()=>{const btn=$('v70336DocumentSave'),docId=$('v70336DocumentId').value,supplier=$('v70336DocumentSupplier').value.trim(),invoice=$('v70336DocumentInvoice').value.trim(),date=$('v70336DocumentDate').value.trim();if(!supplier){toast('Supplier cannot be blank.');return;}if(!invoice){toast('Invoice number cannot be blank.');return;}const linked=(state.data.purchases||[]).filter(x=>String(x.document_id)===String(docId));const duplicate=(state.data.purchases||[]).find(x=>!linked.some(y=>String(y.id)===String(x.id))&&norm(x.supplier_name)===norm(supplier)&&norm(x.invoice_number)===norm(invoice)&&String(x.invoice_date||'')===date);if(duplicate){toast('Another invoice already uses the same Supplier + Invoice No + Invoice Date.');return;}setBusy(btn,true);try{if(CFG.mode==='supabase'){const du=await state.db.sb.from('documents').update({supplier_name:supplier,invoice_number:invoice}).eq('id',docId);if(du.error)throw du.error;if(linked.length){const pu=await state.db.sb.from('purchases').update({supplier_name:supplier,invoice_number:invoice,invoice_date:date||null}).eq('document_id',docId);if(pu.error)throw pu.error;}}else{const data=state.db.data(),di=data.documents.findIndex(x=>String(x.id)===String(docId));if(di<0)throw new Error('Document not found.');const old={...data.documents[di]};data.documents[di]={...data.documents[di],supplier_name:supplier,invoice_number:invoice};state.db.audit(data,'documents',docId,'UPDATE',old,data.documents[di]);for(let i=0;i<data.purchases.length;i++)if(String(data.purchases[i].document_id)===String(docId)){const before={...data.purchases[i]};data.purchases[i]={...data.purchases[i],supplier_name:supplier,invoice_number:invoice,invoice_date:date||''};state.db.audit(data,'purchases',data.purchases[i].id,'UPDATE',before,data.purchases[i]);}state.db.save(data);}await reload();close();toast('Document and linked inventory details updated.');}catch(err){console.error('Document edit failed',err);toast(friendlyError(err));}finally{setBusy(btn,false);}};return overlay;\n}\nfunction openDocumentMetadataEdit(docId){if(!requireEdit())return;const doc=(state.data.documents||[]).find(x=>String(x.id)===String(docId));if(!doc){toast('Document not found.');return;}const overlay=v70336EnsureDocumentEditor();$('v70336DocumentId').value=doc.id;$('v70336DocumentSupplier').value=doc.supplier_name||'';$('v70336DocumentInvoice').value=doc.invoice_number||'';$('v70336DocumentDate').value=documentInvoiceDate(doc)||'';overlay.hidden=false;overlay.style.display='flex';requestAnimationFrame(()=>$('v70336DocumentSupplier')?.focus());}\n`;\n    const v70336HandlerNew=v70336Editor+\"\\\\nfor(const id of ['documentsTable','detailBody'])$(id).onclick=async e=>{const el=e.target.closest('[data-doc-view],[data-doc-edit],[data-doc-download],[data-doc-delete]');if(!el)return;if(el.dataset.docEdit){openDocumentMetadataEdit(el.dataset.docEdit);return;}try{if(el.dataset.docDelete){\";\n    src=replaceOnce(src,v70336HandlerOld,v70336HandlerNew,'V7.03.3.6 document Edit handler');\n";
      if(!src.includes(v70336InnerMarker))throw new Error('V7.03.3.6 inner application patch marker not found.');
      src=src.replace(v70336InnerMarker,v70336InnerPatch+'\n'+v70336InnerMarker);
      src+=`\n
;try{globalThis.V7032Patch?.installParserPatch();globalThis.V7033Patch?.installParserPatch();globalThis.V7033Patch?.installUiVersionSync();}catch(e){console.warn('v7.03.3.6 post-launch patch install skipped',e);}

function v7033PrepareImportLines(lines=[]){
  try{return globalThis.V7033Patch?.prepareLinesForInventory(lines,state?.data?.items||[])||lines;}catch(e){console.warn('v7.03.3.6 inventory match preparation skipped',e);return lines;}
}
(function v7033WrapImports(){
  try{
    if(typeof LocalDB!=='undefined'&&!LocalDB.prototype.__v7033Import){const orig=LocalDB.prototype.importPurchase;LocalDB.prototype.importPurchase=async function(doc,purchase,lines,file){return orig.call(this,doc,purchase,v7033PrepareImportLines(lines),file);};LocalDB.prototype.__v7033Import=true;}
    if(typeof SupabaseDB!=='undefined'&&!SupabaseDB.prototype.__v7033Import){const orig=SupabaseDB.prototype.importPurchase;SupabaseDB.prototype.importPurchase=async function(doc,purchase,lines,file){return orig.call(this,doc,purchase,v7033PrepareImportLines(lines),file);};SupabaseDB.prototype.__v7033Import=true;}
  }catch(e){console.warn('v7.03.3.6 import matching wrapper skipped',e);}
})();

async function v7033AutoWebVerify(){
  try{
    if(!globalThis.V7032WebVerify||!state?.parsed)return;
    const raw=state.parsed.raw||state.parsed.rawText||'';
    // Re-apply deterministic v7.03.3 identity fixes before any web validation.
    state.parsed=globalThis.V7033Patch?.applyParsedFixes(state.parsed,raw)||state.parsed;
    if(typeof renderParsedItems==='function')renderParsedItems();
    if(typeof v703RenderVerificationNotice==='function')v703RenderVerificationNotice();
    const d=state.parsed.doc||{};const sig=[d.invoice_number||'',...(state.parsed.items||[]).map(x=>[x.sku,x.item_name,x.quantity].join(':'))].join('|');
    if(state.parsed.__v7033WebSig===sig)return;state.parsed.__v7033WebSig=sig;
    const result=await globalThis.V7032WebVerify.verifyParsed(state.parsed,raw,{timeoutMs:7000});
    // Re-apply deterministic evidence AFTER Level 2 as well, so an unavailable web/secondary match cannot recreate a false Level 3 warning.
    state.parsed=globalThis.V7033Patch?.applyParsedFixes(result.parsed,raw)||result.parsed;
    result.parsed=state.parsed;
    globalThis.V7032WebVerify.renderNotice(result);if(typeof v703RenderVerificationNotice==='function')v703RenderVerificationNotice();if(typeof v661RenderImportEligibility==='function')v661RenderImportEligibility();
  }catch(e){console.warn('v7.03.3.6 Level 2B web verification skipped',e);}
}
function v7033InstallReviewObserver(){const area=document.getElementById('reviewArea');if(!area)return;const run=()=>{if(!area.classList.contains('hidden'))setTimeout(v7033AutoWebVerify,250);};new MutationObserver(run).observe(area,{attributes:true,attributeFilter:['class']});document.addEventListener('click',e=>{if(e.target.closest?.('#addParsedItemBtn,#saveImportBtn'))setTimeout(v7033AutoWebVerify,150);},true);run();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',v7033InstallReviewObserver,{once:true});else v7033InstallReviewObserver();


let __v7033ConsolidationTried=false;
async function v7033ConsolidateExistingSafeDuplicates(){
  if(__v7033ConsolidationTried||CFG.mode!=='supabase'||!state?.db?.sb)return;__v7033ConsolidationTried=true;
  try{const {data,error}=await state.db.sb.rpc('consolidate_inventory_duplicates_v7033');if(error){if(/function|schema cache|not found|PGRST202|42883/i.test(String(error.message||'')))return;throw error;}const merged=Number(data?.merged_items||0);if(merged>0){state.data=await state.db.load();renderAll();toast('Consolidated '+merged+' verified duplicate inventory record'+(merged===1?'':'s')+'.');}}catch(e){console.warn('v7.03.3.6 duplicate consolidation skipped',e);}
}
// Existing duplicate consolidation is intentionally NOT run automatically at startup.
// Run the bundled Supabase consolidation function only as an explicit maintenance step.
window.v7033ConsolidateExistingSafeDuplicates=v7033ConsolidateExistingSafeDuplicates;
\n`;

      const blob=new Blob([src],{type:'text/javascript'}),url=URL.createObjectURL(blob);
      try{await import(url);}finally{setTimeout(()=>URL.revokeObjectURL(url),1500);}
      v7032.installParserPatch();v7033.installParserPatch();v7033.installUiVersionSync();
      window.__AV_INVENTORY_VERSION__=VERSION;window.__AV_INVENTORY_BUILD__=VERSION;window.__AV_INVENTORY_BASELINE__='7.03.2 cumulative on '+BASELINE_VERSION+'@'+BASELINE_SHA;
      console.info('AV Inventory Hub v'+VERSION+' loaded cumulatively from live v7.03.2 logic with freeze hotfix.');
    }catch(err){
      console.error('AV Inventory Hub v7.03.3.6 startup error:',err);
      const box=document.createElement('div');box.style.cssText='position:fixed;inset:20px;z-index:2147483647;background:#fff;border:1px solid #d33;border-radius:12px;padding:20px;font:14px/1.5 Arial;color:#222;box-shadow:0 10px 30px #0002';
      const msg=String(err?.message||err).replace(/[&<>]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]));box.innerHTML='<b>AV Inventory Hub v7.03.3.6 could not start.</b><br>No database changes were made by this loader.<br><br><code>'+msg+'</code>';document.body.appendChild(box);
    }
  }
  launch();
})();
