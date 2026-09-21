/* AV Inventory Hub v7.03.2 targeted patch core
 * Baseline: v7.03.1 @ f088a9602929d24165fd1ab98fc6744cbada1cb3
 * Purpose: serial block recovery, evidence-only SKU/model correction,
 * false Level-3 suppression, service-only blocking, concise item naming, and version synchronisation.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.V7032Patch=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION='7.03.2';
  const BASELINE_VERSION='7.03.1';
  const BASELINE_SHA='f088a9602929d24165fd1ab98fc6744cbada1cb3';
  const clean=(v='')=>String(v??'').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').trim();
  const norm=(v='')=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const compact=(v='')=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const uniq=(xs,key=x=>x)=>{const out=[],seen=new Set();for(const x of xs||[]){const k=key(x);if(!k||seen.has(k))continue;seen.add(k);out.push(x);}return out;};

  function normalizeSerial(v=''){return clean(v).toUpperCase().replace(/^[([{]+|[\])}.:,;]+$/g,'').replace(/\s+/g,'');}
  function isSerialToken(v=''){
    const s=normalizeSerial(v);
    if(s.length<6||s.length>40||!/\d/.test(s))return false;
    if(!/^[A-Z0-9][A-Z0-9._\/-]*$/.test(s))return false;
    if(/^\d+(?:[.,]\d{2})$/.test(s))return false;
    if(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(s))return false;
    if(/^(?:SGD|TOTAL|SUBTOTAL|AMOUNT|QUANTITY|INVOICE|DELIVERY)$/i.test(s))return false;
    return true;
  }
  function serialList(v=''){
    if(Array.isArray(v))return uniq(v.map(normalizeSerial).filter(isSerialToken),normalizeSerial);
    return uniq(String(v||'').split(/[,;\n]+/).map(normalizeSerial).filter(isSerialToken),normalizeSerial);
  }
  function serialsFromTail(tail=''){
    const raw=clean(tail);if(!raw)return [];
    const commaParts=raw.split(/[,;]+/).map(clean).filter(Boolean);
    const out=[];
    for(const part of commaParts){
      const tokens=part.split(/\s+/).map(x=>x.replace(/^[([{]+|[\])}.:,;]+$/g,'')).filter(Boolean);
      if(tokens.length===1&&isSerialToken(tokens[0]))out.push(normalizeSerial(tokens[0]));
      else{
        for(const t of tokens){if(isSerialToken(t))out.push(normalizeSerial(t));}
      }
    }
    return uniq(out,normalizeSerial);
  }
  function extractSerialBlocks(raw=''){
    const lines=String(raw||'').replace(/\r/g,'').split('\n').map(clean);
    const out=[];
    for(let i=0;i<lines.length;i++){
      const m=lines[i].match(/^(?:S\s*[/.-]?\s*N|S\.?N\.?|SN|Serial(?:\s*(?:No\.?|Number))?)\s*[:#.-]?\s*(.*)$/i);
      if(!m)continue;
      const serials=[...serialsFromTail(m[1])];let end=i;
      for(let j=i+1;j<Math.min(lines.length,i+40);j++){
        const line=lines[j];
        if(!line){if(j===i+1)continue;break;}
        if(/^(?:delivery|subtotal|total\b|gst\b|payment|amount\s+due|due\s+date|invoice\b|warranty\b|terms\b|note\b|company\b|attention\b|required\b|\*important)/i.test(line))break;
        const vals=serialsFromTail(line);
        const residue=line.replace(/[A-Za-z0-9._\/-]+/g,'').replace(/[,;\s]+/g,'');
        if(!vals.length||residue)break;
        // A continuation line must be entirely serial-like. This prevents prices/quantities/specs entering the serial block.
        const atoms=line.split(/[,;\s]+/).filter(Boolean);
        if(atoms.some(x=>!isSerialToken(x)))break;
        serials.push(...vals);end=j;
      }
      const deduped=uniq(serials,normalizeSerial);
      if(deduped.length)out.push({start:i,end,serials:deduped,labelLine:lines[i]});
    }
    return out;
  }

  function modelCandidates(line=''){
    const s=clean(line);if(!s)return [];
    const tokens=s.match(/\b[A-Z][A-Z0-9]*(?:[-/.][A-Z0-9]+)*\d[A-Z0-9._\/-]*\b/gi)||[];
    return uniq(tokens.map(x=>x.replace(/[,:;]+$/,'')).filter(x=>{
      const c=compact(x);if(c.length<2||c.length>24)return false;
      if(/^\d+$/.test(c))return false;
      if(/^\d{1,2}[A-Z]{3}\d{2,4}$/.test(c))return false;
      if(/^(?:SGD|GST|UEN)\d+/i.test(c))return false;
      return /\d/.test(c);
    }),compact);
  }
  function contentWords(s=''){return norm(s).split(' ').filter(w=>w.length>=4&&!/^(?:with|from|year|only|stock|warranty|dynamic|audio|video)$/.test(w));}
  function bestEvidenceLine(row={},raw=''){
    const lines=String(raw||'').replace(/\r/g,'').split('\n').map(clean);
    const targetWords=uniq(contentWords([row.item_name,row.description].filter(Boolean).join(' ')));
    const current=compact(row.sku||'');let best={index:-1,line:'',score:-1,candidates:[]};
    for(let i=0;i<lines.length;i++){
      const line=lines[i];if(!line||/^(?:invoice|subtotal|total|payment|amount|due date|s\/n|serial)/i.test(line))continue;
      const cands=modelCandidates(line);if(!cands.length)continue;
      let score=0;const nl=norm(line),cl=compact(line);
      for(const w of targetWords)if(nl.includes(w))score+=2;
      if(current&&cl.includes(current))score+=4;
      if(/\b(?:projector|microphone|speaker|controller|player|mixer|camera|screen|display|monitor|receiver|transmitter|amplifier|processor|switcher)\b/i.test(line))score+=2;
      if(score>best.score)best={index:i,line,score,candidates:cands};
    }
    return best;
  }
  function chooseSupportedModel(row={},raw=''){
    const current=clean(row.sku||'');const rawCompact=compact(raw);const currentSupported=current&&rawCompact.includes(compact(current));
    const ev=bestEvidenceLine(row,raw);if(ev.index<0||!ev.candidates.length)return {model:current||'',changed:false,evidenceLine:'',reason:''};
    // Prefer a candidate already present in the current SKU when the invoice literally supports it.
    const exact=ev.candidates.find(x=>compact(x)===compact(current));
    if(exact&&currentSupported)return {model:exact,changed:false,evidenceLine:ev.line,reason:'Current model is supported by invoice evidence.'};
    // Brand-only values contain no digits. A model/SKU is expected to have model-like evidence on the same product line.
    const brandOnly=current&&!/\d/.test(current);
    if(!current||brandOnly||!currentSupported){
      // A single strong candidate is safest. If several exist, use the first only when it is the only candidate with product-line context.
      const candidate=ev.candidates[0];
      if(candidate&&compact(raw).includes(compact(candidate))){
        return {model:candidate,changed:compact(candidate)!==compact(current),evidenceLine:ev.line,reason:brandOnly?'Brand-only SKU replaced by invoice-supported model.':(!current?'Invoice-supported model recovered.':'Unsupported parsed model replaced by invoice-supported model.')};
      }
    }
    return {model:current||'',changed:false,evidenceLine:ev.line,reason:''};
  }
  function brandFromEvidenceLine(line='',model=''){
    const s=clean(line);if(!s||!model)return '';
    const idx=s.toUpperCase().indexOf(String(model).toUpperCase());if(idx<=0)return '';
    const before=clean(s.slice(0,idx)).split(/\s+/).filter(Boolean);
    const brand=before.slice(-2).join(' ');
    if(!brand||/\d/.test(brand)||brand.length>28)return '';
    return brand.replace(/[^A-Za-z0-9&.' -]/g,'').trim();
  }
  function equipmentType(text=''){
    const s=norm(text);
    const pairs=[['projector','Projector'],['microphone','Microphone'],['speaker','Speaker'],['controller','Controller'],['control panel','Control Panel'],['player','Player'],['mixer','Mixer'],['camera','Camera'],['screen','Screen'],['display','Display'],['monitor','Monitor'],['receiver','Receiver'],['transmitter','Transmitter'],['amplifier','Amplifier'],['processor','Processor'],['switcher','Switcher']];
    for(const [k,v] of pairs)if(s.includes(k))return v;return '';
  }
  function conciseItemName(row={},evidenceLine=''){
    const model=clean(row.sku||'');if(!model)return clean(row.item_name||row.description||'');
    const brand=brandFromEvidenceLine(evidenceLine,model);
    const type=equipmentType([row.item_name,row.description,evidenceLine].filter(Boolean).join(' '));
    const parts=uniq([brand,model,type].filter(Boolean),x=>compact(x));
    return parts.length>=2?parts.join(' '):clean(row.item_name||row.description||'');
  }

  function rowLineIndex(row={},raw=''){
    const ev=bestEvidenceLine(row,raw);return ev.index;
  }
  function recoverRowSerials(row={},raw='',blocks=extractSerialBlocks(raw)){
    const existing=serialList(row.serials);const qty=Number(row.quantity);let best=null,bestScore=-1;
    const itemLine=rowLineIndex(row,raw);
    for(const b of blocks){
      let score=0;
      if(existing.length&&existing.some(x=>b.serials.includes(normalizeSerial(x))))score+=20;
      if(itemLine>=0&&b.start>=itemLine&&b.start-itemLine<=18)score+=Math.max(1,12-(b.start-itemLine));
      if(Number.isInteger(qty)&&qty>0&&b.serials.length===qty)score+=7;
      if(existing.length&&b.serials.length>=existing.length)score+=3;
      if(score>bestScore){bestScore=score;best=b;}
    }
    if(!best||bestScore<5)return {...row,serials:existing.join(', ')};
    const merged=uniq([...existing,...best.serials],normalizeSerial);
    const out={...row,serials:merged.join(', '),v7032SerialEvidence:{startLine:best.start+1,endLine:best.end+1,count:merged.length,source:'explicit S/N block'}};
    if(Number.isInteger(qty)&&qty>0&&merged.length>qty){out.serialReviewRequired=true;out.serialCountReview=true;}
    else if(out.serialReviewRequired&&!out.serialConflict&&!out.serialConflictReviewRequired)delete out.serialReviewRequired;
    return out;
  }

  function hasExplicitReviewFlag(r={}){
    return !!(r.skuReviewRequired||r.quantityReviewRequired||r.priceReviewRequired||r.unit_priceReviewRequired||r.amountReviewRequired||r.serialConflict||r.serialConflictReviewRequired||r.serialCountReview);
  }
  function strongCoreEvidence(r={},raw=''){
    const name=clean(r.item_name||r.description),q=Number(r.quantity);if(!name||!(q>0))return false;
    const ev=bestEvidenceLine(r,raw);if(ev.index<0||ev.score<2)return false;
    const p=Number(r.unit_price),a=Number(r.amount);
    if(Number.isFinite(p)&&Number.isFinite(a)&&p>0){const expected=p*q;if(Math.abs(expected-a)>Math.max(.08,Math.abs(a)*.01))return false;}
    return true;
  }
  function fixRow(row={},raw='',blocks=[]){
    let r={...row};
    const model=chooseSupportedModel(r,raw);
    if(model.model&&compact(model.model)!==compact(r.sku||'')){
      r.sku=model.model;r.v7032SkuCorrection={from:clean(row.sku||''),to:model.model,reason:model.reason,evidenceLine:model.evidenceLine,source:'invoice'};
      delete r.skuReviewRequired;
    }
    r=recoverRowSerials(r,raw,blocks);
    const evLine=model.evidenceLine||bestEvidenceLine(r,raw).line;
    const concise=conciseItemName(r,evLine);if(concise)r.item_name=concise;

    const v={...(r.verification||{})};const disagreements=[...(v.disagreements||[])];
    const missingSecondaryOnly=!v.secondaryRowId&&disagreements.length===0;
    if(missingSecondaryOnly&&strongCoreEvidence(r,raw)&&!hasExplicitReviewFlag(r)){
      v.coreVerified=true;
      v.layers={...(v.layers||{}),layer2:{...(v.layers?.layer2||{}),status:'unavailable'},layer3:{status:'not_required',reason:'Deterministic invoice evidence is complete; independent extraction was unavailable.'}};
      r.verification=v;r.needsReview=false;r.humanReviewRequired=false;
    }else{
      r.verification=v;
    }
    return r;
  }



  const SERVICE_RE=/\b(?:installation|installing|labou?r|services?\s+only|service\s+(?:charge|fee|work)|commissioning|testing\s+and\s+commission|delivery\s+(?:service|fee|charge)|courier|freight|transport|return\s+trip|repair(?:s|ing)?|maintenance\s+(?:service|work)|dismount|dismantle|relocation|reinstatement)\b/i;
  const EQUIPMENT_RE=/\b(?:projector|microphone|speaker|controller|control\s+panel|camera|mixer|display|monitor|transmitter|receiver|screen|wireless\s+system|audio\s+tester|amplifier|processor|switcher|visualizer|document\s+camera|lighting\s+controller|cd\/?mp3\s+player|media\s+player)\b/i;
  function patchRowType(row={}){
    const text=clean([row.sku,row.item_name,row.description].filter(Boolean).join(' '));
    if(!text)return 'uncertain';
    const service=SERVICE_RE.test(text),equipment=EQUIPMENT_RE.test(text),modelLike=/\d/.test(clean(row.sku||''));
    // Explicit repair/labour/delivery/installation rows remain service even when they name the equipment being serviced.
    if(service&&(!modelLike||/\b(?:repair|labou?r|delivery|installation|service\s+(?:only|charge|fee|work)|maintenance\s+(?:service|work))\b/i.test(text)))return 'service';
    if(equipment)return 'equipment';
    if(service)return 'service';
    return 'uncertain';
  }
  function enforceServiceOnlyRule(parsed={},raw=''){
    const out={...parsed};
    const source=clean(raw||parsed.raw||parsed.rawText||'');
    const items=[...(parsed.items||[])];
    const kept=[],excluded=[];
    for(const row of items){
      const t=patchRowType(row);
      if(t==='service')excluded.push(row);else kept.push(row);
    }
    const hasServiceEvidence=SERVICE_RE.test(source)||excluded.length>0;
    const sourceHasEquipmentLine=String(raw||parsed.raw||parsed.rawText||'').replace(/\r/g,'').split('\n').map(clean).some(line=>EQUIPMENT_RE.test(line)&&!SERVICE_RE.test(line));
    const hasEquipmentEvidence=kept.some(r=>patchRowType(r)==='equipment')||sourceHasEquipmentLine;
    // Mixed invoice: exclude only clearly service rows and retain equipment/uncertain rows for normal review.
    if(excluded.length&&kept.length){
      out.items=kept;out.excludedServiceCount=Number(out.excludedServiceCount||0)+excluded.length;
      out.v7032ServiceFilter={mode:'mixed',excludedCount:excluded.length};
      return out;
    }
    // Service-only: there must be service evidence and no equipment evidence. Never invent a physical item to make it savable.
    if(hasServiceEvidence&&!hasEquipmentEvidence){
      out.items=[];out.serviceOnlyInvoice=true;out.nonInventoryOnlyInvoice=false;
      out.invoiceClassification={...(out.invoiceClassification||{}),type:'service',reason:'v7.03.2 deterministic service-only rule: no physical equipment evidence.'};
      out.v7032ServiceFilter={mode:'service-only',excludedCount:Math.max(excluded.length,items.length)};
    }
    return out;
  }

  function dedupeReviewRows(rows=[]){
    const seen=new Set();return (rows||[]).filter(x=>{const k=[x.rowId||'',x.reason||'',JSON.stringify(x.choices||{})].join('|');if(seen.has(k))return false;seen.add(k);return true;});
  }
  function applyParsedFixes(parsed={},raw=''){
    if(!parsed||typeof parsed!=='object')return parsed;
    const source=String(raw||parsed.raw||parsed.rawText||'');const blocks=extractSerialBlocks(source);
    let out=enforceServiceOnlyRule({...parsed},source);out.items=(out.items||[]).map(r=>fixRow(r,source,blocks));
    const v7={...(parsed.v7||{})};
    if(v7.verification){
      const verification={...v7.verification};
      verification.rows=(verification.rows||[]).map(r=>fixRow(r,source,blocks));
      verification.humanReviewRows=dedupeReviewRows(verification.rows.filter(r=>r.humanReviewRequired).map(r=>({rowId:r.rowId,reason:r.verification?.layers?.layer3?.reason||'Review required',choices:r.verification?.choices||{}})));
      verification.humanReviewRequired=verification.humanReviewRows.length>0;
      v7.verification=verification;
    }
    // The v7.03.1 completeness bug can report expected 0/final N when a clear row was recovered by the legacy/evidence parser.
    // Accept that recovery only when every final row has strong deterministic evidence and no explicit review flags.
    const comp={...(v7.completenessValidation||{})};
    if(comp.recheckRequired&&Number(comp.expectedEquipmentCount)===0&&out.items.length>0&&out.items.every(r=>strongCoreEvidence(r,source)&&!hasExplicitReviewFlag(r))){
      comp.expectedEquipmentCount=out.items.length;comp.finalEquipmentCount=out.items.length;comp.countMatch=true;comp.identityMatch=true;comp.missing=[];comp.unexpected=[];comp.recheckRequired=false;comp.status='pass';comp.v7032Reason='Recovered equipment rows are fully supported by invoice evidence.';
    }
    if(Object.keys(comp).length)v7.completenessValidation=comp;
    const rowNeeds=out.items.some(r=>r.humanReviewRequired||hasExplicitReviewFlag(r));
    const verifyNeeds=!!v7.verification?.humanReviewRequired;
    v7.humanReviewRequired=!!(rowNeeds||verifyNeeds||comp.recheckRequired);
    v7.patchVersion=VERSION;v7.baselineVersion=BASELINE_VERSION;
    out.v7=v7;
    if(out.parseEvidence?.v7)out.parseEvidence={...out.parseEvidence,v7};
    return out;
  }

  function installParserPatch(){
    const p=globalThis.AVParserV7;if(!p||p.__v7032Installed)return false;
    const originalEnhance=p.enhanceParsed?.bind(p);const originalPrepare=p.prepareSave?.bind(p);
    if(typeof originalEnhance==='function')p.enhanceParsed=function(args={}){const result=originalEnhance(args);return applyParsedFixes(result,args.raw||'');};
    if(typeof originalPrepare==='function')p.prepareSave=function(rows=[],options={}){
      const raw=options.raw||'';
      const safeRows=(rows||[]).map(r=>{const x={...r};if(x.humanReviewRequired===false&&!hasExplicitReviewFlag(x))x.needsReview=false;return x;});
      const result=originalPrepare(safeRows,options);
      // Remove only the known false-positive warning: no secondary extraction by itself is not a Level-3 reason.
      const warnings=(result.warnings||[]).filter(w=>!/No independent extraction matched this row/i.test(w.message||''));
      const status=result.errors?.length?'block':(warnings.length&&!options.humanReviewed?'review':'pass');
      return {...result,warnings,status,ok:status==='pass',humanReviewRequired:status==='review'};
    };
    p.__v7032Installed=true;p.__v7032Baseline=BASELINE_VERSION;p.__v7032Version=VERSION;
    return true;
  }

  const RELEASE_NOTES=[
    'Serial-number blocks now capture every printed serial instead of stopping after the first line.',
    'Brand names are not used as SKU/model when invoice-supported model evidence is present.',
    'Unsupported OCR model substitutions are corrected only when the invoice clearly supports the replacement.',
    'Level 3 no longer appears globally just because an independent extraction is unavailable.',
    'Repeated Level-3 reasons are deduplicated and genuine conflicts still remain review-required.',
    'Recovered clear equipment rows no longer trigger the false expected-0/final-1 completeness warning.',
    'Service-only invoices are blocked deterministically; mixed invoices exclude only clear service/labour/delivery/repair rows.',
    'Inventory item names are shortened to brand + model + equipment type while the full source description is retained.',
    'Optional Level 2B web validation can confirm invoice-supported brand/model candidates without overwriting invoice evidence.',
    'Runtime version labels and build markers are synchronised to v7.03.2.'
  ];
  function applyVersionUi(){
    try{
      globalThis.__AV_INVENTORY_VERSION__=VERSION;
      globalThis.__AV_INVENTORY_BUILD__=VERSION;
      globalThis.__AV_INVENTORY_BASELINE__=BASELINE_VERSION+'@'+BASELINE_SHA;
      const root=document.documentElement;root.dataset.avInventoryVersion=VERSION;root.dataset.avInventoryBuild=VERSION;root.dataset.avInventoryBaseline=BASELINE_VERSION;
      const cv=document.getElementById('releaseCurrentVersion'),uv=document.getElementById('releaseUpcomingVersion'),av=document.getElementById('appVersion'),notes=document.getElementById('releaseCurrentNotes');
      if(cv&&cv.textContent!=='v'+VERSION)cv.textContent='v'+VERSION;if(uv&&uv.textContent!=='v7.03.3')uv.textContent='v7.03.3';if(av&&av.textContent!=='Version '+VERSION)av.textContent='Version '+VERSION;
      if(notes&&notes.dataset.v7032Notes!==VERSION){notes.innerHTML=RELEASE_NOTES.map(x=>'<li>'+x.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</li>').join('');notes.dataset.v7032Notes=VERSION;}
    }catch(e){console.warn('v7.03.2 version UI sync skipped',e);}
  }
  function installUiVersionSync(){
    if(typeof document==='undefined')return false;
    applyVersionUi();
    if(!globalThis.__V7032_VERSION_OBSERVER__){
      const obs=new MutationObserver(()=>applyVersionUi());
      const start=()=>{if(document.body)obs.observe(document.body,{childList:true,subtree:true});applyVersionUi();};
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
      globalThis.__V7032_VERSION_OBSERVER__=obs;
      for(const ms of [50,250,750,1500,3000])setTimeout(applyVersionUi,ms);
    }
    return true;
  }
  function selfCheck(){return {version:VERSION,baselineVersion:BASELINE_VERSION,baselineSha:BASELINE_SHA,parserPatched:!!globalThis.AVParserV7?.__v7032Installed};}

  return {VERSION,BASELINE_VERSION,BASELINE_SHA,normalizeSerial,isSerialToken,serialList,extractSerialBlocks,modelCandidates,bestEvidenceLine,chooseSupportedModel,conciseItemName,recoverRowSerials,strongCoreEvidence,patchRowType,enforceServiceOnlyRule,applyParsedFixes,installParserPatch,installUiVersionSync,applyVersionUi,selfCheck,RELEASE_NOTES};
});
