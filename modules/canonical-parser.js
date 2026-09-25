// Inventory Hub canonical parser API — v7.03.3.14x
(function(global){
  'use strict';
  const API_VERSION='1.1';
  const ENGINE_VERSION='7.03.3.14x';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const compact=v=>clean(v).normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const normalizeBrand=v=>clean(v).normalize('NFKC').toUpperCase().replace(/\b(?:PTE|LTD|LIMITED|INC|CORP|CORPORATION)\b/g,' ').replace(/[^A-Z0-9]+/g,' ').trim();
  const normalizeModel=v=>compact(v);
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const serials=v=>[...new Set(String(v||'').split(',').map(clean).filter(Boolean))];

  function canonicalIdentity(row={}){
    const brand=clean(row.brand||row.manufacturer||'');
    const model=clean(row.model||row.sku||'');
    const explicitAliases=Array.isArray(row.verified_aliases)?row.verified_aliases.map(clean).filter(Boolean):[];
    const aliases=[row.sku,row.model,...explicitAliases].map(clean).filter(Boolean);
    const verifiedAliases=[...new Set(aliases.filter(a=>explicitAliases.includes(a)||compact(a)===compact(model)))];
    const brandKey=normalizeBrand(brand),modelKey=normalizeModel(model);
    return {brand,model,brandKey,modelKey,key:brandKey&&modelKey?brandKey+'::'+modelKey:'',verifiedAliases};
  }

  function rowEvidence(row={},index=0){
    const existing=row.invoice_evidence&&typeof row.invoice_evidence==='object'?row.invoice_evidence:null;
    if(existing)return clone(existing);
    return {
      row_index:index,
      original_sku:clean(row.sku),
      original_model:clean(row.model),
      original_brand:clean(row.brand),
      original_description:clean(row.description||row.item_name),
      original_quantity:row.quantity??null,
      original_unit_price:row.unit_price??null,
      original_amount:row.amount??null,
      source:row.provenance||row.parserEvidence14u||null
    };
  }

  function reviewReasons(parsed={},rows=[]){
    const ranked=parsed?.parseEvidence?.evidenceRanking?.review;
    const existing=Array.isArray(parsed.review)?parsed.review:[];
    const reasons=[...(Array.isArray(ranked)?ranked:[]),...existing];
    rows.forEach((row,index)=>{
      if(row?.humanReviewRequired||row?.needsReview||row?.serialReviewRequired||row?.serialConflictReviewRequired||row?.serialCountReview){
        reasons.push({index,reason:'row-review-required'});
      }
    });
    const seen=new Set();
    return reasons.filter(x=>{const key=JSON.stringify(x);if(seen.has(key))return false;seen.add(key);return true;});
  }

  function normalizeRows(rows=[]){
    return (rows||[]).map((input,index)=>{
      const row={...input};
      row.sku=clean(row.sku);
      row.model=clean(row.model);
      row.brand=clean(row.brand||row.manufacturer);
      row.item_name=clean(row.item_name||row.description);
      row.description=clean(row.description||row.item_name);
      row.serials=serials(row.serials).join(', ');
      row.canonical_identity=canonicalIdentity(row);
      row.invoice_evidence=rowEvidence(input,index);
      return row;
    });
  }

  function normalizeResult(parsed={},context={}){
    const source=parsed&&typeof parsed==='object'?parsed:{};
    const doc={...(source.doc||{})};
    const evidence=clean(source.rawEvidence||source.rawText||source.raw||context.raw||'');
    const rows=normalizeRows(source.items||[]);
    const review=reviewReasons(source,rows);
    const humanReviewed=!!source.humanReviewed;
    const status=review.length&&!humanReviewed?'review':'accepted';
    return {
      ...source,
      apiVersion:API_VERSION,
      engineVersion:ENGINE_VERSION,
      canonical:true,
      status,
      doc,
      items:rows,
      review,
      humanReviewed,
      rawEvidence:evidence,
      rawText:source.rawText||evidence,
      parseEvidence:source.parseEvidence||{}
    };
  }

  function fromPipeline(parsed={},context={}){
    return normalizeResult(parsed,context);
  }

  function reviewMaterial(canonical={}){
    const d=canonical.doc||{};
    const doc={
      supplier_name:clean(d.supplier_name),invoice_number:clean(d.invoice_number),invoice_date:clean(d.invoice_date),
      delivery_order_number:clean(d.delivery_order_number),reference_number:clean(d.reference_number),currency:clean(d.currency),
      subtotal:d.subtotal??null,gst:d.gst??null,total_amount:d.total_amount??null
    };
    const items=(canonical.items||[]).map(row=>({
      sku:clean(row.sku),model:clean(row.model),brand:clean(row.brand),item_name:clean(row.item_name),description:clean(row.description),
      category:clean(row.category),unit:clean(row.unit),quantity:row.quantity??null,unit_price:row.unit_price??null,amount:row.amount??null,
      warranty:clean(row.warranty),serials:serials(row.serials).join(', ')
    }));
    return JSON.stringify({doc,items});
  }

  function applyReviewEdits(canonical={},edits={}){
    if(!isCanonicalResult(canonical))throw new Error('Canonical parser result is required before applying review edits.');
    const before=reviewMaterial(canonical);
    const next={
      ...canonical,
      doc:{...canonical.doc,...(edits.doc||{})},
      items:Array.isArray(edits.items)?edits.items.map((row,index)=>({...canonical.items[index],...row,invoice_evidence:canonical.items[index]?.invoice_evidence||row.invoice_evidence})):canonical.items,
      humanReviewed:!!canonical.humanReviewed
    };
    let normalized=normalizeResult(next,{raw:canonical.rawEvidence});
    const materiallyChanged=reviewMaterial(normalized)!==before;
    if(materiallyChanged&&canonical.humanReviewed){
      normalized=normalizeResult({...normalized,humanReviewed:false},{raw:canonical.rawEvidence});
    }
    return normalized;
  }

  function markHumanReviewed(canonical={}){
    if(!isCanonicalResult(canonical))throw new Error('Canonical parser result is required before resolving review.');
    return normalizeResult({...canonical,humanReviewed:true},{raw:canonical.rawEvidence});
  }

  function validateCanonical(canonical={}){
    const errors=[],warnings=[];
    if(!isCanonicalResult(canonical))errors.push({message:'Canonical parser result is required.'});
    const rows=Array.isArray(canonical.items)?canonical.items:[];
    rows.forEach((row,index)=>{
      if(!clean(row.item_name||row.description))errors.push({index,message:'Item name is required.'});
      if(!(Number(row.quantity)>0))errors.push({index,message:'Quantity must be greater than zero.'});
      const values=serials(row.serials),q=Number(row.quantity);
      if(Number.isInteger(q)&&q>0&&values.length>q)warnings.push({index,message:'Serial count exceeds quantity and requires review.'});
    });
    const owners=new Map();
    rows.forEach((row,index)=>serials(row.serials).forEach(sn=>{const key=compact(sn);if(!key)return;if(owners.has(key)&&owners.get(key)!==index)errors.push({index,message:'Duplicate serial number across line items: '+sn});else owners.set(key,index);}));
    return {ok:errors.length===0,errors,warnings};
  }

  function prepareSave(canonical,{humanReviewed=false}={}){
    const validation=validateCanonical(canonical);
    if(!validation.ok)return {ok:false,status:'block',errors:validation.errors,warnings:validation.warnings,rows:[]};
    const reviewed=!!(humanReviewed||canonical.humanReviewed);
    if(canonical.status==='review'&&!reviewed)return {ok:false,status:'review',errors:[],warnings:[...(canonical.review||[]),...validation.warnings],rows:canonical.items};
    return {ok:true,status:'pass',errors:[],warnings:validation.warnings,rows:canonical.items.map(row=>({...row}))};
  }

  function isCanonicalResult(value){
    return !!value&&value.canonical===true&&value.apiVersion===API_VERSION&&Array.isArray(value.items)&&value.doc&&typeof value.doc==='object';
  }

  function diagnostics(canonical={}){
    return {
      apiVersion:canonical.apiVersion||'',
      engineVersion:canonical.engineVersion||'',
      canonical:isCanonicalResult(canonical),
      status:canonical.status||'block',
      itemCount:Array.isArray(canonical.items)?canonical.items.length:0,
      reviewCount:Array.isArray(canonical.review)?canonical.review.length:0,
      humanReviewed:!!canonical.humanReviewed
    };
  }

  global.InventoryHubCanonicalParser=Object.freeze({
    version:ENGINE_VERSION,
    apiVersion:API_VERSION,
    canonicalIdentity,
    normalizeResult,
    fromPipeline,
    applyReviewEdits,
    markHumanReviewed,
    prepareSave,
    validateCanonical,
    isCanonicalResult,
    diagnostics,
    normalizeBrand,
    normalizeModel
  });
})(typeof window!=='undefined'?window:globalThis);
