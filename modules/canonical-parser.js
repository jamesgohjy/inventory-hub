// Inventory Hub canonical parser API — v7.03.3.14v
(function(global){
  'use strict';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const compact=v=>clean(v).normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const normalizeBrand=v=>clean(v).normalize('NFKC').toUpperCase().replace(/\b(?:PTE|LTD|LIMITED|INC|CORP|CORPORATION)\b/g,' ').replace(/[^A-Z0-9]+/g,' ').trim();
  const normalizeModel=v=>compact(v);
  function canonicalIdentity(row={}){
    const brand=clean(row.brand||row.manufacturer||'');
    const model=clean(row.model||row.sku||'');
    const aliases=[row.sku,row.model,...(Array.isArray(row.verified_aliases)?row.verified_aliases:[])].map(clean).filter(Boolean);
    const verifiedAliases=[...new Set(aliases.filter(a=>row.verified_aliases?.includes?.(a)||compact(a)===compact(model)))];
    const brandKey=normalizeBrand(brand),modelKey=normalizeModel(model);
    return {brand,model,brandKey,modelKey,key:brandKey&&modelKey?brandKey+'::'+modelKey:'',verifiedAliases};
  }
  function normalizeResult(parsed={},context={}){
    const doc={...(parsed.doc||{})};
    const evidence=clean(parsed.rawText||parsed.raw||context.raw||'');
    const rows=(parsed.items||[]).map((row,index)=>{
      const identity=canonicalIdentity(row);
      return {...row,canonical_identity:identity,invoice_evidence:{
        row_index:index,
        original_sku:clean(row.sku),
        original_model:clean(row.model),
        original_brand:clean(row.brand),
        original_description:clean(row.description||row.item_name),
        original_quantity:row.quantity??null,
        original_unit_price:row.unit_price??null,
        original_amount:row.amount??null,
        source:row.provenance||row.parserEvidence14u||null
      }};
    });
    const review=parsed?.parseEvidence?.evidenceRanking?.review||[];
    const status=review.length?'review':'accepted';
    return Object.freeze({apiVersion:'1.0',engineVersion:'7.03.3.14v',status,doc:Object.freeze(doc),items:Object.freeze(rows.map(Object.freeze)),review:Object.freeze(review),rawEvidence:evidence,parseEvidence:parsed.parseEvidence||{}});
  }
  function prepareSave(canonical,{humanReviewed=false}={}){
    if(!canonical||canonical.apiVersion!=='1.0')return {ok:false,status:'block',errors:[{message:'Canonical parser result is required.'}],rows:[]};
    if(canonical.status==='review'&&!humanReviewed)return {ok:false,status:'review',errors:[],warnings:canonical.review,rows:canonical.items};
    return {ok:true,status:'pass',errors:[],warnings:[],rows:canonical.items};
  }
  global.InventoryHubCanonicalParser=Object.freeze({version:'7.03.3.14v',canonicalIdentity,normalizeResult,prepareSave,normalizeBrand,normalizeModel});
})(typeof window!=='undefined'?window:globalThis);
