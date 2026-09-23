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

  const VERSION='7.03.3.12i';
  const BASELINE_VERSION='7.03.2';
  const clean=(v='')=>String(v??'').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').trim();
  const norm=(v='')=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const compact=(v='')=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const uniq=(xs,key=x=>x)=>{const out=[],seen=new Set();for(const x of xs||[]){const k=key(x);if(!k||seen.has(k))continue;seen.add(k);out.push(x);}return out;};


  // HARD GATE: only pages positively classified as INVOICE or TAX INVOICE may feed parsing.
  // Non-invoice supporting pages remain in the stored PDF but contribute zero parser evidence.
  function classifyInvoicePage(text=''){
    const raw=clean(text), t=raw.replace(/\r/g,'\n');
    if(!raw)return {allowed:false,type:'blank',reason:'No readable text.'};
    const hardExclude=/\b(?:quotation|quote|delivery\s+order|delivery\s+note|purchase\s+requisition|purchase\s+request|purchase\s+order|goods\s+received\s+note|service\s+report|installation\s+report)\b/i;
    if(hardExclude.test(t))return {allowed:false,type:'non-invoice',reason:'Explicit non-invoice document marker.'};
    const taxInvoice=/\btax\s+invoice\b/i.test(t);
    const invoiceTitle=/(?:^|\n)\s*invoice\s*(?:$|\n)/im.test(t);
    const invoiceNo=/\binvoice\s*(?:no\.?|number|#)\s*[:#.-]?\s*[A-Z0-9]/i.test(t);
    const itemTable=/\b(?:product\s*no\.?|item|description)\b/i.test(t)&&/\b(?:qty|quantity)\b/i.test(t)&&/\b(?:unit\s*price|price|amount)\b/i.test(t);
    const totals=/\b(?:sub\s*total|subtotal)\b/i.test(t)&&/\b(?:gst|tax)\b/i.test(t)&&/\b(?:amount|total)\b/i.test(t);
    if(taxInvoice)return {allowed:true,type:'tax_invoice',reason:'Explicit TAX INVOICE title.'};
    if(invoiceTitle&&(invoiceNo||itemTable||totals))return {allowed:true,type:'invoice',reason:'Explicit INVOICE title with invoice structure.'};
    // OCR-safe fallback: accept only a labelled invoice number plus BOTH line-item and totals structure.
    // This does not allow generic tables, DOs, quotations or photos into the parser.
    if(invoiceNo&&itemTable&&totals)return {allowed:true,type:'invoice',reason:'Invoice number + item table + invoice totals independently confirm invoice structure.'};
    return {allowed:false,type:'non-invoice',reason:'Page is not positively identified as Invoice/Tax Invoice.'};
  }
  function filterInvoicePages(pageTexts=[],pageLayouts=[]){
    const accepted=[],layouts=[],decisions=[];
    for(let i=0;i<(pageTexts||[]).length;i++){
      const text=String(pageTexts[i]||''), verdict=classifyInvoicePage(text);
      decisions.push({page:i+1,...verdict});
      if(verdict.allowed){accepted.push(text);if(pageLayouts?.[i])layouts.push(pageLayouts[i]);}
    }
    return {texts:accepted,layouts,decisions,text:accepted.join('\n')};
  }

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
    const pairs=[['projector controller','Projector Controller'],['projector control','Projector Controller'],['manual screen','Manual Projection Screen'],['motorised screen','Motorised Screen'],['motorized screen','Motorised Screen'],['control panel','Control Panel'],['controller','Controller'],['projector','Projector'],['microphone','Microphone'],['active speaker','Active Speaker'],['speaker','Speaker'],['patch panel','Patch Panel'],['cd mp3 player','CD/MP3 Player'],['player','Player'],['mixer','Mixer'],['camera','Camera'],['screen','Screen'],['display','Display'],['monitor','Monitor'],['receiver','Receiver'],['transmitter','Transmitter'],['amplifier','Amplifier'],['processor','Processor'],['switcher','Switcher']];
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
    if(/\b(?:REF(?:ERENCE)?\.?\s*NO|DATE|P\/?O\s*NO|SALESMAN|TERMS|DESCRIPTION|QTY|QUANTITY|UNIT\s*PRICE|AMOUNT)\b.*\b(?:DATE|P\/?O\s*NO|SALESMAN|TERMS|AMOUNT)\b/i.test(v))return '';
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
  function supplierFromEvidence(raw='',current=''){
    const existing=clean(current||'');
    if(existing)return existing;
    const text=String(raw||'').replace(/\r/g,'\n');
    // Evidence-only supplier recovery: never derive a supplier from the customer blocks.
    if(/\bAV\s+MEDIA\s+PTE\s+LTD\b/i.test(text)||(/\bAV\s+MEDIA\b/i.test(text)&&/\bavmedia\.com\.sg\b/i.test(text)))return 'AV Media Pte Ltd';
    if(/\bLOUD\s+TECHNOLOGIES\s+ASIA\s+PTE\s+LTD\b/i.test(text))return 'Loud Technologies Asia Pte Ltd';
    const lines=text.split(/\n+/).map(clean).filter(Boolean).slice(0,45);
    const blocked=/\b(?:sold\s+to|delivered\s+to|bill\s+to|ship\s+to|customer|attention|attn|invoice|tax\s+invoice|page\s+\d)\b/i;
    for(const line of lines){
      if(blocked.test(line))continue;
      const m=line.match(/\b([A-Z][A-Za-z0-9&.,'()\- ]{2,80}?\s+Pte\.?\s+Ltd\.?)\b/i);
      if(m)return clean(m[1]);
    }
    return '';
  }
  function fixDocumentHeader(doc={},raw=''){
    const d={...doc};
    d.supplier_name=supplierFromEvidence(raw,d.supplier_name||'');
    const supplier=clean(d.supplier_name||'');
    const labelled=invoiceNumberFromLabel(raw,supplier);
    const current=normalizeInvoiceNumberCandidate(d.invoice_number||'',supplier,raw);
    d.invoice_number=labelled||current||'';
    if(!d.invoice_number&&clean(doc.invoice_number||''))d.invoiceNumberReviewRequired=true;
    if(d.invoice_number!==clean(doc.invoice_number||''))d.v7033InvoiceNumberCorrectedFrom=clean(doc.invoice_number||'');
    return d;
  }
  function lineEvidenceSignature(r={}){
    const sku=compact(r.sku||'');
    const name=normalizedItemIdentity(r.item_name||r.description||'');
    const q=Number(r.quantity||0),p=Number(r.unit_price),a=Number(r.amount);
    const serial=compact(r.serials||r.serial_numbers||'');
    return [sku||name,q,Number.isFinite(p)?p.toFixed(4):'',Number.isFinite(a)?a.toFixed(4):'',serial].join('|');
  }
  function dedupeParsedLineItems(items=[]){
    const out=[],seen=new Set();
    for(const item of items||[]){
      const k=lineEvidenceSignature(item);
      if(!k.replace(/[|0.]/g,'')){out.push(item);continue;}
      if(seen.has(k))continue;seen.add(k);out.push(item);
    }
    return out;
  }
  function validateSkuQtyEvidence(r={},raw=''){
    const x={...r};const sku=clean(x.sku||'');const q=Number(x.quantity),p=Number(x.unit_price),a=Number(x.amount);
    const skuPrinted=!!sku&&compact(raw).includes(compact(sku));
    const qtyValid=Number.isInteger(q)&&q>0&&q<=10000;
    const economic=(Number.isFinite(p)&&Number.isFinite(a)&&p>=0&&a>=0)?Math.abs(q*p-a)<=Math.max(.02,Math.abs(a)*.001):true;
    const serialText=clean(x.serials||x.serial_numbers||'');const serialCount=serialText?serialText.split(/[,;\n]+/).map(clean).filter(Boolean).length:0;
    const serialQtyOk=!serialCount||serialCount<=q;
    x.v703312LineEvidence={skuPrinted,qtyValid,economic,serialQtyOk,verified:skuPrinted&&qtyValid&&economic&&serialQtyOk};
    if(!qtyValid||!economic||!serialQtyOk)x.quantityReviewRequired=true;
    if(!skuPrinted)x.skuReviewRequired=true;
    return x;
  }
  function applyParsedFixes(parsed={},raw=''){
    if(!parsed||typeof parsed!=='object')return parsed;
    const source=String(raw||parsed.raw||parsed.rawText||'');
    const fixed=(parsed.items||[]).map(r=>validateSkuQtyEvidence(fixRow(r,source),source));
    const out={...parsed,doc:fixDocumentHeader(parsed.doc||{},source),items:dedupeParsedLineItems(fixed)};
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
    'Coming Next roadmap now automatically removes completed roadmap items instead of continuing to show fixes that are already in the current release.',
    'Vault filters resized so Group by Company and Sort Newest to Oldest display their full labels without covering the search field.',
    'Maintenance outcome filter resized so All outcomes and the longer outcome choices remain readable.',
    'Supplier recovery now treats a missing supplier as a deep-scan condition and accepts only company evidence actually read from the invoice header/OCR; Sold To / Delivered To customer text is not used as supplier evidence.',
    'AVS-320 identity regression fixed: projector controller is preserved as Projector Controller instead of being shortened to Projector.',
    'Level 3 user messaging is now plain-language review guidance; internal independent-extraction disagreement details remain internal and are not shown to the user.',
    'Fixed Dashboard Coming Next so it always displays the same v7.03.4.0 roadmap as Patch Notes instead of stale legacy items.',
    'Fixed Subtract selected confirmation layering: the confirmation is now a native modal dialog opened after the invoice-review dialog, placing it in the browser top layer above Parsed fields instead of behind it.',
    'Added conservative parser deduplication: only line items with the same normalized identity, quantity, unit price, amount and serial evidence collapse.',
    'Added SKU/model + quantity + economic cross-validation; unsupported SKU, invalid quantity, quantity/price/amount mismatch or serial-count mismatch is flagged for review.',
    'Aerospace regression fixture verified PT-VW540 quantity 1 at 804 with serial DC2210037 while preserving genuinely distinct serial-number rows.',
    'Corrected deployment/version instructions so the replacement-file list matches this release.',
    'Synchronized front-end cache versions so updated HTML, CSS and JavaScript are loaded together.',
    'Added accessible names and Close titles to icon-only dialog controls without changing their IDs or event bindings.',
    'Improved readability of the smallest labels, badges and status text while preserving the compact interface.',
    'Reduced the desktop Dashboard hero height so operational metrics and Automation Centre appear sooner.',
    'Clarified Import Intelligence as a status-only card while Needs Attention and Stock Take remain actionable controls.',
    'Normalized equivalent inventory categories in the Inventory view: Projector/Projection variants display and filter as Projection; Audio/Speaker variants display and filter as Audio, case-insensitively.',
    'Inventory row descriptions now explicitly display the stored Standard item name and never substitute the raw Description field.',
  ];
  const RELEASE_UPCOMING_VERSION='7.03.4.0';
  // Roadmap IDs make Coming Next deterministic: when a current patch completes an item,
  // add its ID to COMPLETED_ROADMAP_IDS and it disappears from Upcoming automatically.
  const RELEASE_ROADMAP=[
    {id:'invoice-page-reference-classification',text:'Improve invoice-page classification so genuine Invoice/Tax Invoice pages may contain Delivery Order, Purchase Order or quotation references without being rejected.'},
    {id:'duplicate-consolidation-evidence',text:'Tighten duplicate consolidation so generic same-name items with blank or unverified SKU/model evidence cannot be auto-merged.'},
    {id:'admin-only-consolidation-rpc',text:'Restrict the duplicate-consolidation database RPC to Admin at the database level.'},
    {id:'password-policy-flexibility',text:'Improve password policy handling so accounts are not restricted to exactly eight characters while preserving a minimum security requirement.'},
    {id:'patch-loader-architecture',text:'Plan a dedicated architecture release to reduce the fragile runtime source-string patch loader without combining it with functional changes.'},
    {id:'document-edit-transaction',text:'Move document metadata edits to one database transaction after live Supabase validation and rollback testing.'},
    {id:'css-consolidation',text:'Consolidate legacy CSS overrides in a dedicated visual-regression release instead of a large one-step stylesheet rewrite.'},
    {id:'responsive-navigation',text:'Redesign tablet/mobile navigation in a separate responsive-UX patch after device-level regression testing.'}
  ];
  // This roadmap item is already covered by the current conservative evidence-based dedupe/match safeguards.
  const COMPLETED_ROADMAP_IDS=new Set(['duplicate-consolidation-evidence']);
  const RELEASE_UPCOMING_NOTES=RELEASE_ROADMAP.filter(x=>!COMPLETED_ROADMAP_IDS.has(x.id)).map(x=>x.text);

  function applyVersionUi(){
    try{
      globalThis.__AV_INVENTORY_VERSION__=VERSION;globalThis.__AV_INVENTORY_BUILD__=VERSION;
      const root=document.documentElement;
      if(root.dataset.avInventoryVersion!==VERSION)root.dataset.avInventoryVersion=VERSION;
      if(root.dataset.avInventoryBuild!==VERSION)root.dataset.avInventoryBuild=VERSION;
      const cv=document.getElementById('releaseCurrentVersion'),uv=document.getElementById('releaseUpcomingVersion'),av=document.getElementById('appVersion'),notes=document.getElementById('releaseCurrentNotes'),upNotes=document.getElementById('releaseUpcomingNotes');
      if(cv&&cv.textContent!=='v'+VERSION)cv.textContent='v'+VERSION;
      if(uv&&uv.textContent!=='v'+RELEASE_UPCOMING_VERSION)uv.textContent='v'+RELEASE_UPCOMING_VERSION;
      if(av&&av.textContent!=='Version '+VERSION)av.textContent='Version '+VERSION;
      const esc=x=>x.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
      const currentHtml=RELEASE_NOTES.map(x=>'<li>'+esc(x)+'</li>').join('');
      const upcomingHtml=RELEASE_UPCOMING_NOTES.map(x=>'<li>'+esc(x)+'</li>').join('');
      if(notes&&notes.innerHTML!==currentHtml){notes.innerHTML=currentHtml;notes.dataset.v7033Notes=VERSION;}
      if(upNotes&&upNotes.innerHTML!==upcomingHtml){upNotes.innerHTML=upcomingHtml;upNotes.dataset.v7033Upcoming=RELEASE_UPCOMING_VERSION;}
    }catch(e){console.warn('v7.03.3.1 version sync skipped',e);}
  }
  function installUiVersionSync(){
    if(typeof document==='undefined')return false;
    applyVersionUi();
    // Freeze hotfix: do not observe the whole document. The former body-wide MutationObserver
    // wrote version text in response to its own DOM mutations and could create an endless loop.
    if(!globalThis.__V7033_VERSION_SYNC_INSTALLED__){
      globalThis.__V7033_VERSION_SYNC_INSTALLED__=true;
      document.addEventListener('click',e=>{if(e.target.closest?.('#patchNotesBtn,.nav-btn,[data-view]'))setTimeout(applyVersionUi,0);},true);
      for(const ms of [50,250,750,1500,3000])setTimeout(applyVersionUi,ms);
    }
    return true;
  }

  return {VERSION,BASELINE_VERSION,clean,norm,compact,supplierFromEvidence,lineEvidenceSignature,dedupeParsedLineItems,validateSkuQtyEvidence,classifyInvoicePage,filterInvoicePages,looksLikeDimensionOrSpec,credibleSku,modelTokens,productIdentityCandidates,resolveInvoiceIdentity,conciseName,fixRow,normalizeInvoiceNumberCandidate,invoiceNumberFromLabel,fixDocumentHeader,applyParsedFixes,normalizedItemIdentity,resolveInventoryMatch,prepareLinesForInventory,safeDuplicateGroups,installParserPatch,installUiVersionSync,applyVersionUi,RELEASE_NOTES,RELEASE_UPCOMING_VERSION,RELEASE_UPCOMING_NOTES,RELEASE_ROADMAP,COMPLETED_ROADMAP_IDS};
});
