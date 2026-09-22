// AV Inventory Hub v7.03.3.4 — freeze hotfix + cumulative patch loader
// Live baseline: v7.03.2. Verified underlying source: v7.03.1 @ f088a9602929d24165fd1ab98fc6744cbada1cb3
(function(){
  'use strict';
  if(window.__AV_V7033_LOADER_STARTED__)return;
  window.__AV_V7033_LOADER_STARTED__=true;

  const VERSION='7.03.3.4';
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
      src+=`\n
;try{globalThis.V7032Patch?.installParserPatch();globalThis.V7033Patch?.installParserPatch();globalThis.V7033Patch?.installUiVersionSync();}catch(e){console.warn('v7.03.3.4 post-launch patch install skipped',e);}

function v7033PrepareImportLines(lines=[]){
  try{return globalThis.V7033Patch?.prepareLinesForInventory(lines,state?.data?.items||[])||lines;}catch(e){console.warn('v7.03.3.4 inventory match preparation skipped',e);return lines;}
}
(function v7033WrapImports(){
  try{
    if(typeof LocalDB!=='undefined'&&!LocalDB.prototype.__v7033Import){const orig=LocalDB.prototype.importPurchase;LocalDB.prototype.importPurchase=async function(doc,purchase,lines,file){return orig.call(this,doc,purchase,v7033PrepareImportLines(lines),file);};LocalDB.prototype.__v7033Import=true;}
    if(typeof SupabaseDB!=='undefined'&&!SupabaseDB.prototype.__v7033Import){const orig=SupabaseDB.prototype.importPurchase;SupabaseDB.prototype.importPurchase=async function(doc,purchase,lines,file){return orig.call(this,doc,purchase,v7033PrepareImportLines(lines),file);};SupabaseDB.prototype.__v7033Import=true;}
  }catch(e){console.warn('v7.03.3.4 import matching wrapper skipped',e);}
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
  }catch(e){console.warn('v7.03.3.4 Level 2B web verification skipped',e);}
}
function v7033InstallReviewObserver(){const area=document.getElementById('reviewArea');if(!area)return;const run=()=>{if(!area.classList.contains('hidden'))setTimeout(v7033AutoWebVerify,250);};new MutationObserver(run).observe(area,{attributes:true,attributeFilter:['class']});document.addEventListener('click',e=>{if(e.target.closest?.('#addParsedItemBtn,#saveImportBtn'))setTimeout(v7033AutoWebVerify,150);},true);run();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',v7033InstallReviewObserver,{once:true});else v7033InstallReviewObserver();


// v7.03.3.4 Documents metadata editor. Runs inside the baseline module so it can safely
// use state/renderAll/toast and update both document + linked purchase metadata.
async function v70333UpdateDocumentMetadata(docId,changes){
  const doc=state.data.documents.find(d=>String(d.id)===String(docId));
  if(!doc)throw new Error('Document not found.');
  const supplier=String(changes.supplier_name||'').trim(), invoice=String(changes.invoice_number||'').trim(), date=String(changes.invoice_date||'').trim();
  if(!supplier)throw new Error('Supplier cannot be blank.');
  if(!invoice)throw new Error('Invoice number cannot be blank.');
  const linked=(state.data.purchases||[]).filter(x=>String(x.document_id)===String(docId));
  const duplicate=(state.data.purchases||[]).find(x=>!linked.some(y=>String(y.id)===String(x.id))&&norm(x.supplier_name)===norm(supplier)&&norm(x.invoice_number)===norm(invoice)&&String(x.invoice_date||'')===date);
  if(duplicate)throw new Error('Another invoice already uses the same Supplier + Invoice No + Invoice Date.');
  if(CFG.mode==='supabase'){
    const du=await state.db.sb.from('documents').update({supplier_name:supplier,invoice_number:invoice,invoice_date:date||null}).eq('id',docId);
    if(du.error)throw du.error;
    if(linked.length){const pu=await state.db.sb.from('purchases').update({supplier_name:supplier,invoice_number:invoice,invoice_date:date||null}).eq('document_id',docId);if(pu.error)throw pu.error;}
  }else{
    const d=state.db.data(),di=d.documents.findIndex(x=>String(x.id)===String(docId));if(di<0)throw new Error('Document not found.');
    const old={...d.documents[di]};d.documents[di]={...d.documents[di],supplier_name:supplier,invoice_number:invoice,invoice_date:date||''};state.db.audit(d,'documents',docId,'UPDATE',old,d.documents[di]);
    for(let i=0;i<d.purchases.length;i++)if(String(d.purchases[i].document_id)===String(docId)){const po={...d.purchases[i]};d.purchases[i]={...d.purchases[i],supplier_name:supplier,invoice_number:invoice,invoice_date:date||''};state.db.audit(d,'purchases',d.purchases[i].id,'UPDATE',po,d.purchases[i]);}
    state.db.save(d);
  }
  state.data=await state.db.load();renderAll();toast('Document and linked inventory details updated.');
}
function v70333EnsureEditDialog(){
  if(document.getElementById('v70333DocEditDialog'))return;
  const d=document.createElement('dialog');d.id='v70333DocEditDialog';d.innerHTML='<form method="dialog" class="dialog-card" style="min-width:min(520px,92vw)"><div class="dialog-head"><div><h3>Edit document details</h3><p>Corrections update this document and its linked Inventory - View Details record.</p></div><button value="cancel" class="icon-btn" aria-label="Close">×</button></div><input type="hidden" id="v70333DocId"><label>Supplier<input id="v70333Supplier" required></label><label>Invoice No.<input id="v70333Invoice" required></label><label>Invoice Date<input id="v70333Date" type="date"></label><div class="dialog-actions"><button value="cancel" class="secondary">Cancel</button><button type="button" id="v70333SaveDoc">Save changes</button></div></form>';document.body.appendChild(d);
  document.getElementById('v70333SaveDoc').addEventListener('click',async()=>{const b=document.getElementById('v70333SaveDoc');try{b.disabled=true;b.textContent='Saving…';await v70333UpdateDocumentMetadata(document.getElementById('v70333DocId').value,{supplier_name:document.getElementById('v70333Supplier').value,invoice_number:document.getElementById('v70333Invoice').value,invoice_date:document.getElementById('v70333Date').value});d.close();}catch(e){toast(String(e.message||e));}finally{b.disabled=false;b.textContent='Save changes';}});
}
function v70333OpenDocumentEdit(id){const x=state.data.documents.find(d=>String(d.id)===String(id));if(!x){toast('Document not found.');return;}v70333EnsureEditDialog();document.getElementById('v70333DocId').value=x.id;document.getElementById('v70333Supplier').value=x.supplier_name||'';document.getElementById('v70333Invoice').value=x.invoice_number||'';document.getElementById('v70333Date').value=String(x.invoice_date||'').slice(0,10);document.getElementById('v70333DocEditDialog').showModal();}
function v70333InstallDocumentEdit(){
  v70333EnsureEditDialog();const table=document.getElementById('documentsTable');if(!table||table.dataset.v70333Edit==='1')return;table.dataset.v70333Edit='1';
  const decorate=()=>table.querySelectorAll('button[data-doc-view]').forEach(view=>{const id=view.dataset.docView,cell=view.closest('td')||view.parentElement;if(!cell||cell.querySelector('[data-doc-edit="'+CSS.escape(id)+'"]'))return;const b=document.createElement('button');b.textContent='Edit';b.dataset.docEdit=id;b.className='secondary';const dl=cell.querySelector('button[data-doc-download]');cell.insertBefore(b,dl||cell.querySelector('button[data-doc-delete]')||null);});
  new MutationObserver(decorate).observe(table,{childList:true,subtree:true});decorate();document.addEventListener('click',e=>{const b=e.target.closest?.('[data-doc-edit]');if(b){e.preventDefault();v70333OpenDocumentEdit(b.dataset.docEdit);}},true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(v70333InstallDocumentEdit,300),{once:true});else setTimeout(v70333InstallDocumentEdit,300);

let __v7033ConsolidationTried=false;
async function v7033ConsolidateExistingSafeDuplicates(){
  if(__v7033ConsolidationTried||CFG.mode!=='supabase'||!state?.db?.sb)return;__v7033ConsolidationTried=true;
  try{const {data,error}=await state.db.sb.rpc('consolidate_inventory_duplicates_v7033');if(error){if(/function|schema cache|not found|PGRST202|42883/i.test(String(error.message||'')))return;throw error;}const merged=Number(data?.merged_items||0);if(merged>0){state.data=await state.db.load();renderAll();toast('Consolidated '+merged+' verified duplicate inventory record'+(merged===1?'':'s')+'.');}}catch(e){console.warn('v7.03.3.4 duplicate consolidation skipped',e);}
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
      console.error('AV Inventory Hub v7.03.3.4 startup error:',err);
      const box=document.createElement('div');box.style.cssText='position:fixed;inset:20px;z-index:2147483647;background:#fff;border:1px solid #d33;border-radius:12px;padding:20px;font:14px/1.5 Arial;color:#222;box-shadow:0 10px 30px #0002';
      const msg=String(err?.message||err).replace(/[&<>]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]));box.innerHTML='<b>AV Inventory Hub v7.03.3.4 could not start.</b><br>No database changes were made by this loader.<br><br><code>'+msg+'</code>';document.body.appendChild(box);
    }
  }
  launch();
})();
