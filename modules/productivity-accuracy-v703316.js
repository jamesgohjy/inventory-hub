/* Inventory Hub v7.03.3.16 productivity + accuracy module
 * Selected scope: evidence ledger, dual-extraction consensus, safe identity matching,
 * import summary, review draft autosave, release/runtime decomposition support.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.InventoryHubProductivityAccuracy=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='7.03.3.16';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const compact=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const near=(a,b,t=.06)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<=t;
  const numberLike=v=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v));
  const textContains=(haystack,value)=>{const h=compact(haystack),v=compact(value);return !!(h&&v&&h.includes(v));};

  function sourceWitnesses(value,sources=[]){
    const out=[];
    if(value===null||value===undefined||value==='')return out;
    for(const src of sources||[]){
      if(textContains(src?.text||'',value))out.push({source:clean(src?.source||src?.kind||'source'),kind:clean(src?.kind||''),match:'exact-normalized'});
    }
    return out;
  }

  function independentKinds(witnesses=[]){
    return new Set((witnesses||[]).map(w=>w.kind||w.source).filter(Boolean)).size;
  }

  function fieldStatus(value,{sources=[],reviewRequired=false,secondaryEvidence=false,arithmetic=false}={}){
    if(value===null||value===undefined||value==='')return {status:'missing',confidence:'low',witnesses:[]};
    const witnesses=sourceWitnesses(value,sources);
    const kinds=independentKinds(witnesses);
    if(reviewRequired)return {status:'review',confidence:'low',witnesses};
    if(kinds>=2||secondaryEvidence||arithmetic)return {status:'verified',confidence:'high',witnesses};
    if(witnesses.length)return {status:'supported',confidence:'medium',witnesses};
    return {status:'review',confidence:'low',witnesses};
  }

  function arithmeticEvidence(row={}){
    const q=Number(row.quantity),p=Number(row.unit_price),a=Number(row.amount);
    if(!Number.isFinite(q)||!Number.isFinite(p)||!Number.isFinite(a))return {checked:false,passed:false};
    const delta=Math.abs(q*p-a);
    return {checked:true,passed:delta<=Math.max(.06,Math.abs(a)*.002),expected:q*p,actual:a,delta};
  }

  function consensusForRow(row={},sources=[]){
    const v41Issues=Array.isArray(row.v41IntegrityIssues)?row.v41IntegrityIssues:[];
    const issueFor=field=>v41Issues.some(x=>(x?.field==='model'?'sku':x?.field)===field);
    const v41Review=!!(row.v41ShadowReviewRequired||row.v41ProductionReviewRequired||v41Issues.length);
    const flags=!!(row.quantityReviewRequired||row.priceReviewRequired||row.amountReviewRequired||row.serialConflictReviewRequired||row.serialReviewRequired||row.contaminatedField||row.randomCharacterFailure||row.humanReviewRequired||row.needsReview||row.parserReviewRequired||v41Review);
    const arithmetic=arithmeticEvidence(row);
    const fields={
      sku:fieldStatus(row.sku,{sources,reviewRequired:(flags&&!!row.sku)||issueFor('sku')}),
      item_name:fieldStatus(row.item_name,{sources,reviewRequired:issueFor('item_name')||(!clean(row.item_name))}),
      quantity:fieldStatus(row.quantity,{sources,reviewRequired:!!row.quantityReviewRequired||issueFor('quantity'),arithmetic:arithmetic.passed}),
      unit_price:fieldStatus(row.unit_price,{sources,reviewRequired:!!row.priceReviewRequired||issueFor('unit_price'),arithmetic:arithmetic.passed}),
      amount:fieldStatus(row.amount,{sources,reviewRequired:!!row.amountReviewRequired||issueFor('amount'),arithmetic:arithmetic.passed}),
      serials:fieldStatus(row.serials,{sources,reviewRequired:!!(row.serialConflictReviewRequired||row.serialReviewRequired)||issueFor('serials')})
    };
    const statuses=Object.values(fields).map(x=>x.status);
    return {
      fields,
      arithmetic,
      status:v41Review||statuses.includes('review')||statuses.includes('missing')?'review':(statuses.every(x=>x==='verified')?'verified':'supported')
    };
  }
  function buildEvidenceLedger(parsed={},sources=[]){
    const rows=(parsed.items||[]).map((row,index)=>({index,line:index+1,identity:clean(row.sku||row.model||row.item_name||('row-'+(index+1))),...consensusForRow(row,sources)}));
    const doc=parsed.doc||{};
    const document={
      supplier:fieldStatus(doc.supplier_name,{sources}),
      invoice_number:fieldStatus(doc.invoice_number,{sources}),
      invoice_date:fieldStatus(doc.invoice_date,{sources}),
      subtotal:fieldStatus(doc.subtotal,{sources}),
      gst:fieldStatus(doc.gst,{sources}),
      total_amount:fieldStatus(doc.total_amount,{sources})
    };
    const reviewRows=rows.filter(r=>r.status==='review').length;
    return {
      version:VERSION,
      generated_at:new Date().toISOString(),
      document,
      rows,
      verification_coverage:{
        rows_total:rows.length,
        rows_verified:rows.filter(r=>r.status==='verified').length,
        rows_supported:rows.filter(r=>r.status==='supported').length,
        rows_review:reviewRows
      },
      requires_review:reviewRows>0||Object.values(document).some(x=>x.status==='review'||x.status==='missing')
    };
  }

  function applyDualExtractionConsensus(parsed={},sources=[]){
    const eligible=(sources||[]).filter(s=>clean(s?.text));
    const kinds=new Set(eligible.map(s=>s.kind||s.source).filter(Boolean));
    const ledger=buildEvidenceLedger(parsed,eligible);
    return {
      ...parsed,
      evidenceLedger:ledger,
      extractionConsensus:{
        source_count:eligible.length,
        independent_source_kinds:kinds.size,
        sources:eligible.map(s=>({source:s.source||'',kind:s.kind||'',score:Number(s.score)||null})),
        dual_path_available:kinds.size>=2
      }
    };
  }

  function safeMasterMatch(line={},items=[]){
    const sku=compact(line.sku||line.model||'');
    if(sku){
      const exact=(items||[]).find(i=>compact(i.sku||i.canonical_model||'')===sku);
      return exact?{action:'merge',reason:'exact-sku-or-model',item:exact}:{action:'create',reason:'no-exact-identity'};
    }
    const brand=compact(line.canonical_identity?.brand||line.brand||'');
    const model=compact(line.canonical_identity?.model||line.model||'');
    if(brand&&model){
      const exact=(items||[]).find(i=>compact(i.canonical_brand||'')===brand&&compact(i.canonical_model||'')===model);
      return exact?{action:'merge',reason:'exact-brand-model',item:exact}:{action:'create',reason:'no-exact-brand-model'};
    }
    const name=norm(line.item_name||'');
    const possible=name?(items||[]).filter(i=>norm(i.item_name||'')===name):[];
    return {action:'create',reason:possible.length?'name-only-match-not-safe':'no-stable-identity',review_candidates:possible.map(i=>({id:i.id,sku:i.sku,item_name:i.item_name}))};
  }

  function importSummary(parsed={}){
    const ledger=parsed.evidenceLedger||buildEvidenceLedger(parsed,parsed._evidenceSources||[]);
    const rows=ledger.rows||[];
    return {
      item_count:(parsed.items||[]).length,
      verified_rows:rows.filter(r=>r.status==='verified').length,
      supported_rows:rows.filter(r=>r.status==='supported').length,
      review_rows:rows.filter(r=>r.status==='review').length,
      excluded_count:Number(parsed.excludedServiceCount||0)+Number(parsed.excludedAccessoryCount||0)+Number(parsed.excludedCount||0),
      source_paths:Number(parsed.extractionConsensus?.independent_source_kinds||0),
      requires_review:!!ledger.requires_review
    };
  }

  const DRAFT_PREFIX='inventory-hub-import-draft-v703316:';
  function draftKey(identity='default'){return DRAFT_PREFIX+compact(identity||'default').slice(0,120);}
  function saveDraft(identity,payload,storage){
    const s=storage||globalThis.localStorage;if(!s)return false;
    s.setItem(draftKey(identity),JSON.stringify({version:VERSION,saved_at:new Date().toISOString(),payload}));
    return true;
  }
  function loadDraft(identity,storage){
    const s=storage||globalThis.localStorage;if(!s)return null;
    try{return JSON.parse(s.getItem(draftKey(identity))||'null');}catch(_){return null;}
  }
  function clearDraft(identity,storage){
    const s=storage||globalThis.localStorage;if(!s)return false;
    s.removeItem(draftKey(identity));return true;
  }

  function selfTest(){
    const failures=[];
    const items=[{id:'1',sku:'A-100',item_name:'Projector'},{id:'2',sku:'B-200',item_name:'Projector'}];
    if(safeMasterMatch({item_name:'Projector'},items).action!=='create')failures.push('name-only matching must never auto-merge');
    if(safeMasterMatch({sku:'A100',item_name:'Projector'},items).item?.id!=='1')failures.push('normalized exact SKU should merge');
    const parsed={doc:{supplier_name:'ACME',invoice_number:'INV-1'},items:[{sku:'A-100',item_name:'Projector',quantity:2,unit_price:100,amount:200}]};
    const dual=applyDualExtractionConsensus(parsed,[{source:'native',kind:'native',text:'ACME INV-1 A-100 Projector 2 100 200'},{source:'ocr',kind:'ocr',text:'ACME INV-1 A-100 Projector 2 100 200'}]);
    if(dual.extractionConsensus.independent_source_kinds!==2)failures.push('dual extraction kinds not counted');
    if(!dual.evidenceLedger?.rows?.length)failures.push('evidence ledger missing');
    const memory={v:{},setItem(k,v){this.v[k]=v},getItem(k){return this.v[k]||null},removeItem(k){delete this.v[k]}};
    saveDraft('INV-1',{x:1},memory);if(loadDraft('INV-1',memory)?.payload?.x!==1)failures.push('draft save/load failed');clearDraft('INV-1',memory);if(loadDraft('INV-1',memory)!==null)failures.push('draft clear failed');
    return {ok:!failures.length,failures};
  }

  return {VERSION,buildEvidenceLedger,applyDualExtractionConsensus,safeMasterMatch,importSummary,saveDraft,loadDraft,clearDraft,selfTest};
});
