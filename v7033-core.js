/* AV Inventory Hub v7.03.3 cumulative evidence + consolidation patch
 * Baseline: live v7.03.2, itself based on verified v7.03.1.
 * Focus: no hallucinated SKU/model, Product No intelligence, Level 1/2/3 discipline,
 * and safe inventory consolidation across invoices.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.V7033Patch=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='7.03.3.3';
  const BASELINE_VERSION='7.03.2';
  const clean=(v='')=>String(v??'').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').trim();
  const norm=(v='')=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const compact=(v='')=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const uniq=(xs,key=x=>x)=>{const out=[],seen=new Set();for(const x of xs||[]){const k=key(x);if(!k||seen.has(k))continue;seen.add(k);out.push(x);}return out;};

  const MODEL_STOP=/^(?:SGD|GST|UEN|QTY|QUANTITY|PRICE|AMOUNT|TOTAL|SUBTOTAL|INVOICE|DATE|REF|REFERENCE|SHIPMENT|CUSTOMER|PO|DO)$/i;
  function looksLikeDimensionOrSpec(token='',line=''){
    const t=clean(token),c=compact(t),s=clean(line);
    if(!t)return false;
    if(/^\d{2,4}\s*[x×]\s*\d{2,4}$/i.test(t))return true;
    if(/^[x×]\s*\d{2,4}$/i.test(t))return true;
    if(/^\d{2,4}[x×]\d{2,4}$/i.test(c))return true;
    if(/^\d+(?:\.\d+)?\s*(?:mm|cm|m|inch|inches|in|ft|feet|hz|khz|mhz|ghz|w|kw|lm|lumen|lumens|ansi)$/i.test(t))return true;
    if(/^\d{3,5}\s*[x×]\s*\d{3,5}$/i.test(s))return true;
    if(/^\d{3,5}p$/i.test(t))return true;
    if(/^(?:720p|1080p|2160p|4k|8k)$/i.test(t))return true;
    return false;
  }
  function credibleSku(v='',line=''){
    const s=clean(v);if(!s||s.length>28||MODEL_STOP.test(s)||looksLikeDimensionOrSpec(s,line))return false;
    if(!/^[A-Z0-9][A-Z0-9+._\/-]{1,27}$/i.test(s))return false;
    if(!/[A-Za-z]/.test(s)||!/[0-9]/.test(s))return false;
    if(/^\d+$/.test(s))return false;
    return true;
  }
  function modelTokens(line=''){
    const s=clean(line);if(!s)return [];
    const raw=s.match(/\b[A-Z][A-Z0-9]*(?:[-/.][A-Z0-9]+)*\d[A-Z0-9._\/-]*\b/gi)||[];
    return uniq(raw.map(x=>x.replace(/[,:;]+$/,'')).filter(x=>credibleSku(x,s)),compact);
  }
  function equipmentType(text=''){
    const s=norm(text);
    const pairs=[['manual screen','Manual Projection Screen'],['motorised screen','Motorised Screen'],['motorized screen','Motorised Screen'],['projector','Projector'],['microphone','Microphone'],['active speaker','Active Speaker'],['speaker','Speaker'],['patch panel','Patch Panel'],['control panel','Control Panel'],['controller','Controller'],['cd mp3 player','CD/MP3 Player'],['player','Player'],['mixer','Mixer'],['camera','Camera'],['screen','Screen'],['display','Display'],['monitor','Monitor'],['receiver','Receiver'],['transmitter','Transmitter'],['amplifier','Amplifier'],['processor','Processor'],['switcher','Switcher']];
    for(const [k,v] of pairs)if(s.includes(k))return v;return '';
  }
  function contentWords(s=''){return norm(s).split(' ').filter(w=>w.length>=4&&!/^(?:with|from|year|only|stock|warranty|supply|install|installation|safety|wired|secure|classroom)$/.test(w));}

  function productIdentityCandidates(raw='',row={}){
    const lines=String(raw||'').replace(/\r/g,'').split('\n').map(clean);
    const target=uniq(contentWords([row.item_name,row.description].filter(Boolean).join(' ')));
    const out=[];
    let headerIndex=-999;
    for(let i=0;i<lines.length;i++){
      const line=lines[i];if(!line)continue;
      if(/\b(?:PRODUCT\s*(?:NO\.?|NUMBER)|MODEL\s*(?:NO\.?|NUMBER)?|SKU)\b/i.test(line))headerIndex=i;
      const tokens=modelTokens(line);if(!tokens.length)continue;
      for(const model of tokens){
        if(looksLikeDimensionOrSpec(model,line))continue;
        const idx=line.toUpperCase().indexOf(model.toUpperCase());
        const before=idx>0?clean(line.slice(0,idx)).split(/\s+/).filter(Boolean):[];
        let brand=before.slice(-1).join(' ').replace(/[^A-Za-z0-9&.'-]/g,'').trim();
        if(!brand||/\d/.test(brand)||MODEL_STOP.test(brand)||brand.length>24)brand='';
        let score=0;
        const nl=norm(line);
        if(i-headerIndex>=0&&i-headerIndex<=4)score+=12;
        if(/\b(?:PRODUCT\s*(?:NO\.?|NUMBER)|MODEL|SKU)\b/i.test(line))score+=8;
        if(brand)score+=4;
        for(const w of target)if(nl.includes(w))score+=2;
        if(/\b(?:screen|projector|microphone|speaker|player|controller|panel|camera|mixer|display|monitor|receiver|transmitter|amplifier|processor|switcher)\b/i.test(line))score+=3;
        if(compact(raw).includes(compact(model)))score+=2;
        out.push({brand,model,line,index:i,score,source:(i-headerIndex>=0&&i-headerIndex<=4)?'labelled-product-field':'invoice-text'});
      }
    }
    return out.sort((a,b)=>b.score-a.score||a.index-b.index);
  }
  function resolveInvoiceIdentity(row={},raw=''){
    const current=clean(row.sku||'');
    const currentLine=String(raw||'').split(/\r?\n/).find(l=>compact(l).includes(compact(current)))||'';
    const currentCredible=credibleSku(current,currentLine);
    const candidates=productIdentityCandidates(raw,row);
    const top=candidates[0]||null;
    const currentSupported=currentCredible&&String(raw||'').toUpperCase().includes(current.toUpperCase());

    // Labelled Product No/Model/SKU evidence outranks a description/spec fragment.
    if(top&&top.score>=12){
      if(!currentCredible||!currentSupported||looksLikeDimensionOrSpec(current,currentLine)||compact(current)!==compact(top.model)){
        return {brand:top.brand,model:top.model,changed:compact(current)!==compact(top.model),evidenceLine:top.line,source:top.source,score:top.score,reason:'Invoice-labelled product identity evidence outranks description/specification text.'};
      }
    }
    // Strong unlabelled brand+model evidence can correct an unsupported OCR model (e.g. P80 vs printed P60).
    if(top&&top.score>=7&&(!currentCredible||!currentSupported)){
      return {brand:top.brand,model:top.model,changed:compact(current)!==compact(top.model),evidenceLine:top.line,source:top.source,score:top.score,reason:'Unsupported parsed model replaced by stronger invoice evidence.'};
    }
    return {brand:'',model:currentCredible?current:'',changed:false,evidenceLine:currentLine,source:currentSupported?'invoice-text':'unverified',score:currentSupported?5:0,reason:currentSupported?'Current model is printed on the invoice.':'No verified model was found.'};
  }
  function conciseName(row={},identity={}){
    const model=clean(identity.model||row.sku||'');
    if(!model)return clean(row.item_name||row.description||'');
    const brand=clean(identity.brand||'');
    const type=equipmentType([row.item_name,row.description,identity.evidenceLine].filter(Boolean).join(' '));
    const parts=uniq([brand,model,type].filter(Boolean),compact);
    return parts.length>=2?parts.join(' '):clean(row.item_name||row.description||'');
  }
  function explicitReviewFlag(r={}){
    return !!(r.skuReviewRequired||r.quantityReviewRequired||r.priceReviewRequired||r.unit_priceReviewRequired||r.amountReviewRequired||r.serialConflict||r.serialConflictReviewRequired||r.serialCountReview);
  }
  function strongDeterministicEvidence(r={},raw=''){
    const q=Number(r.quantity);if(!(q>0))return false;
    const id=resolveInvoiceIdentity(r,raw);if(!id.model||id.score<5)return false;
    const p=Number(r.unit_price),a=Number(r.amount);
    if(Number.isFinite(p)&&Number.isFinite(a)&&p>0&&Math.abs(p*q-a)>Math.max(.08,Math.abs(a)*.01))return false;
    return true;
  }
  function fixRow(row={},raw=''){
    const r={...row};
    const id=resolveInvoiceIdentity(r,raw);
    if(id.model){
      if(compact(r.sku||'')!==compact(id.model))r.v7033SkuCorrection={from:clean(r.sku||''),to:id.model,reason:id.reason,evidenceLine:id.evidenceLine,source:id.source};
      r.sku=id.model;
      if(id.score>=7)delete r.skuReviewRequired;
    }else if(r.sku&&looksLikeDimensionOrSpec(r.sku,raw)){
      r.v7033RejectedSku=clean(r.sku);r.sku='';r.skuReviewRequired=true;
    }
    const name=conciseName(r,id);if(name)r.item_name=name;
    r.v7033Identity={brand:id.brand||'',model:id.model||'',source:id.source,score:id.score,evidenceLine:id.evidenceLine||''};

    const v={...(r.verification||{})};const disagreements=[...(v.disagreements||[])];
    const missingSecondaryOnly=!v.secondaryRowId&&disagreements.length===0;
    if(missingSecondaryOnly&&strongDeterministicEvidence(r,raw)&&!explicitReviewFlag(r)){
      v.coreVerified=true;
      v.layers={...(v.layers||{}),layer1:{status:'confirmed',reason:'Strong labelled/deterministic invoice evidence.'},layer2:{...(v.layers?.layer2||{}),status:'unavailable'},layer3:{status:'not_required',reason:'No real conflict remains; independent extraction was unavailable.'}};
      r.verification=v;r.needsReview=false;r.humanReviewRequired=false;
    }else r.verification=v;
    return r;
  }
  function dedupeReviewRows(rows=[]){
    const seen=new Set();return (rows||[]).filter(x=>{const reason=clean(x.reason||'').replace(/No independent extraction matched this row\.?/ig,'').trim();const k=[reason,JSON.stringify(x.choices||{})].join('|');if(!reason||seen.has(k))return false;seen.add(k);x.reason=reason;return true;});
  }
  const INVOICE_LABEL_STOP=/^(?:AMOUNT|TOTAL|SUBTOTAL|DATE|QTY|QUANTITY|PRICE|UNIT|DESCRIPTION|TAX|GST|BALANCE|TERMS|SALESMAN|CUSTOMER|REFERENCE|REF|PO|DO|INVOICE)$/i;
  function normalizeInvoiceNumberCandidate(value='',supplier='',raw=''){
    let v=clean(value).replace(/^[#:\s.-]+|[#:\s.-]+$/g,'');
    if(!v||INVOICE_LABEL_STOP.test(v))return '';
    const supplierKey=norm(supplier||raw);
    // AV Media's printed family is VIN17-######. Correct only tightly matching OCR variants
    // when AV Media evidence is present; never apply this substitution to other suppliers.
    if(supplierKey.includes('av media')){
      const c=v.toUpperCase().replace(/\s+/g,'');
      const m=c.match(/^(?:VIN17|VINI7|VN17|YN17)[.\-:]?(\d{6})$/);
      if(m)return 'VIN17-'+m[1];
    }
    return v;
  }
  function invoiceNumberFromLabel(raw='',supplier=''){
    const lines=String(raw||'').replace(/\r/g,'\n').split(/\n+/).map(clean).filter(Boolean);
    for(let i=0;i<lines.length;i++){
      if(!/\binvoice\s*(?:no|number|#)\b/i.test(lines[i]))continue;
      const same=lines[i].match(/\binvoice\s*(?:no|number|#)\s*[:#.-]?\s*([A-Z0-9][A-Z0-9._\/-]{2,30})/i);
      const candidates=[same?.[1],lines[i+1]].filter(Boolean);
      for(const c of candidates){const n=normalizeInvoiceNumberCandidate(c,supplier,raw);if(n)return n;}
    }
    return '';
  }
  function fixDocumentHeader(doc={},raw=''){
    const d={...doc};
    const supplier=clean(d.supplier_name||'');
    const labelled=invoiceNumberFromLabel(raw,supplier);
    const current=normalizeInvoiceNumberCandidate(d.invoice_number||'',supplier,raw);
    d.invoice_number=labelled||current||'';
    if(!d.invoice_number&&clean(doc.invoice_number||''))d.invoiceNumberReviewRequired=true;
    if(d.invoice_number!==clean(doc.invoice_number||''))d.v7033InvoiceNumberCorrectedFrom=clean(doc.invoice_number||'');
    return d;
  }
  function applyParsedFixes(parsed={},raw=''){
    if(!parsed||typeof parsed!=='object')return parsed;
    const source=String(raw||parsed.raw||parsed.rawText||'');
    const out={...parsed,doc:fixDocumentHeader(parsed.doc||{},source),items:(parsed.items||[]).map(r=>fixRow(r,source))};
    const v7={...(out.v7||out.parseEvidence?.v7||{})};
    if(v7.verification){
      const vr={...v7.verification};
      vr.rows=(vr.rows||[]).map(r=>fixRow(r,source));
      vr.humanReviewRows=dedupeReviewRows((vr.rows||[]).filter(r=>r.humanReviewRequired===true).map(r=>({rowId:r.rowId,reason:r.verification?.layers?.layer3?.reason||'',choices:r.verification?.choices||{}})));
      vr.humanReviewRequired=vr.humanReviewRows.length>0;v7.verification=vr;
    }
    const comp={...(v7.completenessValidation||{})};
    if(comp.recheckRequired&&out.items.length>0&&out.items.every(r=>strongDeterministicEvidence(r,source)&&!explicitReviewFlag(r))){
      if(Number(comp.expectedEquipmentCount)===0||Number(comp.expectedEquipmentCount)===out.items.length){
        comp.expectedEquipmentCount=out.items.length;comp.finalEquipmentCount=out.items.length;comp.countMatch=true;comp.identityMatch=true;comp.missing=[];comp.unexpected=[];comp.recheckRequired=false;comp.status='pass';comp.v7033Reason='All final rows have strong deterministic invoice evidence.';
      }
    }
    if(Object.keys(comp).length)v7.completenessValidation=comp;
    const rowNeed=out.items.some(r=>r.humanReviewRequired===true||explicitReviewFlag(r));
    v7.humanReviewRequired=!!(rowNeed||v7.verification?.humanReviewRequired||comp.recheckRequired);
    v7.patchVersion=VERSION;v7.baselineVersion=BASELINE_VERSION;out.v7=v7;
    if(out.parseEvidence?.v7)out.parseEvidence={...out.parseEvidence,v7};
    return out;
  }

  function normalizedItemIdentity(v=''){
    return norm(v)
      .replace(/\b(?:the|a|an|supply|install|installation|with|for|in pair|pair)\b/g,' ')
      .replace(/\b\d+(?:\.\d+)?\s*(?:mm|cm|inch|inches|lumens?|ansi|hz|khz|mhz|ghz|w|kw)\b/g,' ')
      .replace(/\s+/g,' ').trim();
  }
  function resolveInventoryMatch(line={},items=[]){
    const incoming={...line};const sku=clean(incoming.sku||'');
    if(credibleSku(sku)){
      const exact=(items||[]).find(i=>compact(i.sku||'')===compact(sku));
      if(exact)return {matched:true,reason:'exact-sku',item:exact,line:{...incoming,sku:exact.sku,item_name:exact.item_name||incoming.item_name,category:incoming.category||exact.category||''}};
    }
    const key=normalizedItemIdentity(incoming.item_name||incoming.description||'');
    if(!key)return {matched:false,reason:'no-identity',item:null,line:incoming};
    const same=(items||[]).filter(i=>normalizedItemIdentity(i.item_name||i.description||'')===key);
    if(!same.length)return {matched:false,reason:'no-existing-match',item:null,line:incoming};
    const credible=uniq(same.filter(i=>credibleSku(i.sku||'')).map(i=>clean(i.sku)),compact);
    if(credible.length>1)return {matched:false,reason:'conflicting-existing-models',item:null,line:incoming};
    if(credible.length===1&&credibleSku(sku)&&compact(sku)!==compact(credible[0]))return {matched:false,reason:'incoming-model-conflict',item:null,line:incoming};
    const canonical=same.find(i=>credible.length===1&&compact(i.sku||'')===compact(credible[0]))||same[0];
    return {matched:true,reason:credible.length===1?'same-name-single-verified-model':'same-normalized-name',item:canonical,line:{...incoming,sku:clean(canonical.sku||incoming.sku||''),item_name:canonical.item_name||incoming.item_name,category:incoming.category||canonical.category||''}};
  }
  function prepareLinesForInventory(lines=[],items=[]){return (lines||[]).map(x=>{const resolved=resolveInventoryMatch(x,items).line;const standard=clean(resolved.item_name||'');return standard?{...resolved,description:standard}:resolved;});}
  function safeDuplicateGroups(items=[]){
    const groups=new Map();
    for(const i of items||[]){const k=normalizedItemIdentity(i.item_name||i.description||'');if(!k)continue;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);}
    const out=[];
    for(const [key,rows] of groups){if(rows.length<2)continue;const skus=uniq(rows.filter(x=>credibleSku(x.sku||'')).map(x=>clean(x.sku)),compact);const cats=uniq(rows.map(x=>norm(x.category||'')).filter(Boolean));if(skus.length>1||cats.length>1)continue;const canonical=rows.find(x=>skus.length&&compact(x.sku||'')===compact(skus[0]))||rows[0];out.push({key,canonical,duplicates:rows.filter(x=>x!==canonical),verifiedSku:skus[0]||''});}
    return out;
  }

  function installParserPatch(){
    const p=globalThis.AVParserV7;if(!p||p.__v7033Installed)return false;
    const originalEnhance=p.enhanceParsed?.bind(p);const originalPrepare=p.prepareSave?.bind(p);
    if(typeof originalEnhance==='function')p.enhanceParsed=function(args={}){return applyParsedFixes(originalEnhance(args),args.raw||'');};
    if(typeof originalPrepare==='function')p.prepareSave=function(rows=[],options={}){
      const result=originalPrepare(rows,options);
      const warnings=dedupeReviewRows((result.warnings||[]).map((w,i)=>({rowId:String(i),reason:w.message||'',choices:{},raw:w}))).map(x=>x.raw);
      const status=result.errors?.length?'block':(warnings.length&&!options.humanReviewed?'review':'pass');
      return {...result,warnings,status,ok:status==='pass',humanReviewRequired:status==='review'};
    };
    p.__v7033Installed=true;p.__v7033Version=VERSION;return true;
  }

  const RELEASE_NOTES=[
    'Product No / Model / SKU-labelled invoice fields now outrank description/specification fragments.',
    'Dimension/spec fragments such as x70, 70x70 and resolution/lumen values are rejected as SKU/model evidence.',
    'REMACO MAS-1818 is resolved as brand REMACO + model MAS-1818 when supported by the invoice.',
    'Unsupported OCR substitutions such as P80 are corrected only when stronger invoice evidence supports another model such as P60.',
    'Level 3 appears only for a real unresolved conflict; missing secondary extraction alone is not enough.',
    'Future imports reuse an existing master item when verified SKU or safe normalized identity matches.',
    'Existing exact duplicate inventory groups can be safely consolidated by the bundled Supabase migration/RPC.',
    'Conflicting verified models are never auto-merged.',
    'Inventory Description now stores the verified Standard Item Name instead of the long supplier description.',
    'Standard item names are assembled from verified brand + model + product type; installation wording stays only as source evidence.',
    'Invoice-number validation rejects header labels such as Amount and corrects tightly evidenced AV Media VIN17 OCR variants.',
    'Documents now support manual metadata correction with linked purchase/inventory detail synchronization.'
  ];
  function applyVersionUi(){
    try{
      globalThis.__AV_INVENTORY_VERSION__=VERSION;globalThis.__AV_INVENTORY_BUILD__=VERSION;
      const root=document.documentElement;
      if(root.dataset.avInventoryVersion!==VERSION)root.dataset.avInventoryVersion=VERSION;
      if(root.dataset.avInventoryBuild!==VERSION)root.dataset.avInventoryBuild=VERSION;
      const cv=document.getElementById('releaseCurrentVersion'),uv=document.getElementById('releaseUpcomingVersion'),av=document.getElementById('appVersion'),notes=document.getElementById('releaseCurrentNotes');
      if(cv&&cv.textContent!=='v'+VERSION)cv.textContent='v'+VERSION;
      if(uv&&uv.textContent!=='v7.03.4')uv.textContent='v7.03.4';
      if(av&&av.textContent!=='Version '+VERSION)av.textContent='Version '+VERSION;
      if(notes&&notes.dataset.v7033Notes!==VERSION){notes.innerHTML=RELEASE_NOTES.map(x=>'<li>'+x.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</li>').join('');notes.dataset.v7033Notes=VERSION;}
    }catch(e){console.warn('v7.03.3.1 version sync skipped',e);}
  }
  function installUiVersionSync(){
    if(typeof document==='undefined')return false;
    applyVersionUi();
    // Freeze hotfix: do not observe the whole document. The former body-wide MutationObserver
    // wrote version text in response to its own DOM mutations and could create an endless loop.
    if(!globalThis.__V7033_VERSION_SYNC_INSTALLED__){
      globalThis.__V7033_VERSION_SYNC_INSTALLED__=true;
      document.addEventListener('click',e=>{if(e.target.closest?.('#patchNotesBtn'))setTimeout(applyVersionUi,0);},true);
      for(const ms of [50,250,750,1500,3000])setTimeout(applyVersionUi,ms);
    }
    return true;
  }

  return {VERSION,BASELINE_VERSION,clean,norm,compact,looksLikeDimensionOrSpec,credibleSku,modelTokens,productIdentityCandidates,resolveInvoiceIdentity,conciseName,fixRow,normalizeInvoiceNumberCandidate,invoiceNumberFromLabel,fixDocumentHeader,applyParsedFixes,normalizedItemIdentity,resolveInventoryMatch,prepareLinesForInventory,safeDuplicateGroups,installParserPatch,installUiVersionSync,applyVersionUi,RELEASE_NOTES};
});
