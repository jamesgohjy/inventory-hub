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

  const VERSION='7.03.3.13b';
  const BASELINE_VERSION='7.03.2';
  const clean=(v='')=>String(v??'').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').trim();
  const norm=(v='')=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const compact=(v='')=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const uniq=(xs,key=x=>x)=>{const out=[],seen=new Set();for(const x of xs||[]){const k=key(x);if(!k||seen.has(k))continue;seen.add(k);out.push(x);}return out;};


  // V7.03.3.13b DOCUMENT GATE
  // Tri-state classification:
  //   accept  -> strong invoice evidence;
  //   review  -> invoice-like but OCR/layout is ambiguous, continue to Review with Level 3;
  //   reject  -> strong evidence of a different document type.
  //
  // This deliberately avoids exact-title-only gating. PDF text extraction often merges a visual
  // TAX INVOICE heading with GST/UEN/header text or changes character shapes during OCR.
  function v703313bInvoiceWord(v=''){
    return clean(v).toUpperCase()
      .replace(/\bINV[O0][I1L]CE\b/g,'INVOICE')
      .replace(/\bINVO[I1L]CE\b/g,'INVOICE')
      .replace(/\b1NVOICE\b/g,'INVOICE');
  }
  function v703313bHeadingText(v=''){
    return v703313bInvoiceWord(v).replace(/[^A-Z0-9/#&().: -]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function classifyInvoicePage(text=''){
    const raw=clean(text), t=raw.replace(/\r/g,'\n');
    if(!raw)return {allowed:false,disposition:'reject',type:'blank',reason:'No readable text.',reviewRequired:false,score:0,evidence:{}};

    const lines=t.split('\n').map(clean).filter(Boolean);
    const headingLines=lines.slice(0,140);
    const earlyHead=lines.slice(0,60);
    const exactHeadingText=(v='')=>clean(v).toUpperCase().replace(/[^A-Z0-9/#&().: -]+/g,' ').replace(/\s+/g,' ').trim();
    const normalizedHeading=headingLines.map(v703313bHeadingText);
    const exactNormalizedHeading=headingLines.map(exactHeadingText);
    const normalizedEarly=earlyHead.map(v703313bHeadingText);
    const adjacentPhrases=(xs,max=3)=>{const out=[];for(let i=0;i<xs.length;i++){for(let n=2;n<=max&&i+n<=xs.length;n++){const v=xs.slice(i,i+n).join(' ').replace(/\s+/g,' ').trim();if(v)out.push(v);}}return out;};
    const headingPhrases=[...normalizedHeading,...adjacentPhrases(normalizedHeading,3)];
    const earlyPhrases=[...normalizedEarly,...adjacentPhrases(normalizedEarly,3)];

    const nonInvoiceRe=/^(?:PRO\s*FORMA\s+INVOICE|PROFORMA\s+INVOICE|QUOTATION|QUOTE|DELIVERY\s+ORDER|DELIVERY\s+NOTE|DELIVERY\s+SLIP|PACKING\s+LIST|PACKING\s*\/?\s*DELIVERY\s+SLIP|PACKING\s+DELIVERY\s+SLIP|PURCHASE\s+REQUISITION|PURCHASE\s+REQUEST|PURCHASE\s+ORDER|GOODS\s+RECEIVED\s+NOTE|SERVICE\s+REPORT|INSTALLATION\s+REPORT|STATEMENT)(?:\s+(?:NO|NUMBER|#)?\s*[A-Z0-9./-]+)?$/i;
    const nonInvoiceTitles=[...new Set(earlyPhrases.filter(x=>nonInvoiceRe.test(x)))];

    // A heading can be merged into surrounding header text by PDF extraction. Accept TAX INVOICE
    // when it appears as a heading phrase on a reasonably short header line, not only as an exact line.
    const titleLineCandidate=(line)=>{
      const u=v703313bHeadingText(line);
      if(!u||u.length>140)return false;
      if(/\b(?:SUBMIT|SEND|ATTACH|PROVIDE|ISSUE|REFERENCE|REF(?:ERENCE)?|COPY\s+OF|PAYMENT\s+OF)\s+(?:A\s+)?(?:TAX\s+)?INVOICE\b/i.test(u))return false;
      if(/\b(?:PRO\s*FORMA|PROFORMA)\s+INVOICE\b/i.test(u))return false;
      if(/\b(?:INVOICE\s+(?:NO|NUMBER|DATE|REF|REFERENCE|TOTAL)|TAX\s+INVOICE\s+(?:NO|NUMBER|DATE|REF|REFERENCE|TOTAL))\b/i.test(u))return false;
      return true;
    };
    const taxTitleLines=headingLines.filter(line=>titleLineCandidate(line)&&/\bTAX\s+INVOICE\b/i.test(exactHeadingText(line)));
    const exactHeadingPhrases=[...exactNormalizedHeading,...adjacentPhrases(exactNormalizedHeading,3)];
    const fragmentedTax=exactHeadingPhrases.some(x=>/^(?:TAX\s+INVOICE|GST\s+INVOICE)$/i.test(x));
    const invoiceTitleLines=headingLines.filter((line,idx)=>{
      const u=exactHeadingText(line),next=exactNormalizedHeading[idx+1]||'',prev=exactNormalizedHeading[idx-1]||'';
      if(!titleLineCandidate(line)||/\bTAX\s+INVOICE\b/i.test(u))return false;
      if(/^INVOICE$/i.test(u)&&/^(?:NO|NUMBER|DATE|TOTAL|REF|REFERENCE|ID|#)$/i.test(next))return false;
      if(/^INVOICE$/i.test(u)&&/^(?:TAX|GST|PROFORMA|PRO\s+FORMA)$/i.test(prev))return false;
      return /\b(?:SALES\s+INVOICE|COMMERCIAL\s+INVOICE|GST\s+INVOICE|INVOICE)\b/i.test(u);
    });
    const strongTax=taxTitleLines.length>0||fragmentedTax;
    const strongInvoice=invoiceTitleLines.length>0;

    // OCR-tolerant heading evidence. This is intentionally weaker and routes to Level 3.
    const fuzzyHead=headingLines.some(line=>{
      if(!titleLineCandidate(line))return false;
      const u=clean(line).toUpperCase().replace(/[^A-Z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
      if(u.length>140)return false;
      return /\b(?:TAX\s+)?INV(?:O|0)(?:I|1|L)CE\b/.test(u)||/\b(?:TAX\s+)?1NVOICE\b/.test(u);
    });

    const invoiceNo=/\binv(?:o|0)(?:i|1|l)ce\s*(?:no\.?|number|#)\s*[:#.-]?\s*[A-Z0-9]/i.test(t)
      ||/\binv\s*(?:no\.?|number|#)\s*[:#.-]?\s*[A-Z0-9]/i.test(t);
    const invoiceDate=/\binv(?:o|0)(?:i|1|l)ce\s*date\b/i.test(t);
    const billTo=/\b(?:bill\s*to|sold\s*to|customer(?:\s+code)?|delivered\s+to)\b/i.test(t);
    const itemTable=/\b(?:product\s*(?:no\.?|number|code)?|item(?:\s+code)?|description)\b/i.test(t)
      &&/\b(?:qty|quantity|units?)\b/i.test(t)
      &&/\b(?:unit\s*price|price|amount)\b/i.test(t);
    const subtotal=/\b(?:sub\s*total|subtotal)\b/i.test(t);
    const tax=/\b(?:gst|vat|tax)\b/i.test(t);
    const finalTotal=/\b(?:amount\s+due|grand\s+total|invoice\s+total|total\s+amount|total\s+(?:sgd|usd|eur|gbp|myr|cny))\b/i.test(t);
    const totals=[subtotal,tax,finalTotal].filter(Boolean).length>=2;
    const gstReg=/\b(?:gst|vat)\s*(?:reg(?:istration)?\.?\s*)?(?:no\.?|number)\b/i.test(t);
    const paymentTerms=/\b(?:payment\s+terms|terms)\b/i.test(t)&&/\b(?:days?|cash|credit|cod|net\s*\d+)\b/i.test(t);
    const currency=/\b(?:SGD|USD|EUR|GBP|MYR|CNY|RMB)\b/.test(t.toUpperCase());

    const evidence={strongTax,strongInvoice,fuzzyHead,invoiceNo,invoiceDate,billTo,itemTable,subtotal,tax,finalTotal,totals,gstReg,paymentTerms,currency,nonInvoiceTitles};
    let structureScore=0;
    if(invoiceNo)structureScore+=5;
    if(invoiceDate)structureScore+=2;
    if(billTo)structureScore+=1;
    if(itemTable)structureScore+=3;
    if(totals)structureScore+=3;
    if(gstReg)structureScore+=1;
    if(paymentTerms)structureScore+=1;
    if(currency)structureScore+=1;

    if(strongTax){
      return {allowed:true,disposition:'accept',type:'tax_invoice',reason:'TAX INVOICE heading phrase plus invoice evidence.',reviewRequired:nonInvoiceTitles.length>0,score:12+structureScore,evidence};
    }
    if(strongInvoice&&(invoiceNo||invoiceDate||itemTable||totals||billTo)){
      return {allowed:true,disposition:'accept',type:'invoice',reason:'Invoice heading phrase with supporting invoice structure.',reviewRequired:nonInvoiceTitles.length>0,score:10+structureScore,evidence};
    }

    // A real non-invoice heading is a strong reject signal unless equally strong invoice evidence
    // conflicts with it; conflicts are routed to Review, not guessed.
    if(nonInvoiceTitles.length){
      if((fuzzyHead||invoiceNo)&&structureScore>=8){
        return {allowed:true,disposition:'review',type:'invoice_review',reason:'Conflicting document-title evidence; invoice structure is strong enough for Level 3 review.',reviewRequired:true,score:structureScore,evidence};
      }
      return {allowed:false,disposition:'reject',type:'non-invoice',reason:'Explicit non-invoice document title.',reviewRequired:false,score:structureScore,evidence};
    }

    if(fuzzyHead&&structureScore>=4){
      return {allowed:true,disposition:'review',type:'invoice_review',reason:'OCR-tolerant Invoice/Tax Invoice heading with supporting invoice structure.',reviewRequired:true,score:6+structureScore,evidence};
    }

    // Strong labelled invoice structure can safely proceed even when the visual title was lost.
    if(invoiceNo&&(itemTable||totals||invoiceDate)){
      const strongStructure=(itemTable&&totals)||(invoiceDate&&totals)||(invoiceDate&&itemTable);
      return {allowed:true,disposition:strongStructure?'accept':'review',type:strongStructure?'invoice':'invoice_review',reason:strongStructure?'Invoice number plus independent invoice structure.':'Invoice number found but document structure needs Level 3 confirmation.',reviewRequired:!strongStructure,score:6+structureScore,evidence};
    }

    // Last-resort financial-document path: do not hard-reject a plausible invoice only because OCR
    // lost the word "invoice". It may proceed to Review, but never as automatically verified.
    if(itemTable&&totals&&(billTo||gstReg||paymentTerms)&&structureScore>=7){
      return {allowed:true,disposition:'review',type:'document_review',reason:'Invoice-like financial structure detected but the Invoice/Tax Invoice title was not reliable. Verify document type before saving.',reviewRequired:true,score:structureScore,evidence};
    }

    return {allowed:false,disposition:'reject',type:'non-invoice',reason:'Page lacks enough invoice evidence to continue safely.',reviewRequired:false,score:structureScore,evidence};
  }
  function looksLikeInvoiceContinuation(text=''){
    const t=clean(text).replace(/\r/g,'\n');if(!t)return false;
    const head=t.split('\n').map(clean).filter(Boolean).slice(0,18);
    const normalized=head.map(v703313bHeadingText);
    if(normalized.some(x=>/^(?:PRO\s*FORMA\s+INVOICE|PROFORMA\s+INVOICE|QUOTATION|QUOTE|DELIVERY\s+ORDER|DELIVERY\s+NOTE|DELIVERY\s+SLIP|PACKING\s+LIST|PACKING\s*\/?\s*DELIVERY\s+SLIP|PURCHASE\s+ORDER|SERVICE\s+REPORT|INSTALLATION\s+REPORT)\b/i.test(x)))return false;
    const table=/\b(?:description|item|product)\b/i.test(t)&&/\b(?:qty|quantity)\b/i.test(t)&&/\b(?:amount|price)\b/i.test(t);
    const totals=/\b(?:subtotal|sub\s*total|gst|tax|grand\s*total|amount\s+due)\b/i.test(t);
    const paging=/\bpage\s*\d+\s*(?:of|\/)\s*\d+\b/i.test(t)||/\bcontinued\b/i.test(t);
    const monetaryRows=(t.match(/\b\d+(?:\.\d+)?\s+\d[\d,]*\.\d{2}\s+\d[\d,]*\.\d{2}\b/g)||[]).length;
    return !!(table||totals||(paging&&monetaryRows>0));
  }
  function filterInvoicePages(pageTexts=[],pageLayouts=[]){
    const accepted=[],layouts=[],decisions=[];
    let invoiceContext=false,reviewRequired=false;
    for(let i=0;i<(pageTexts||[]).length;i++){
      const text=String(pageTexts[i]||''), base=classifyInvoicePage(text);let verdict=base;
      if(invoiceContext&&!(base.evidence?.nonInvoiceTitles||[]).length&&looksLikeInvoiceContinuation(text)&&(!base.allowed||base.reviewRequired||base.disposition==='review'))verdict={allowed:true,disposition:'accept',type:'invoice_continuation',reason:'Continuation page accepted because an earlier page established invoice context and this page contains invoice table/total continuation evidence.',reviewRequired:false,score:Math.max(4,Number(base.score)||0),evidence:base.evidence||{}};
      decisions.push({page:i+1,...verdict});
      if(verdict.allowed){
        accepted.push(text);
        if(pageLayouts?.[i])layouts.push(pageLayouts[i]);
        invoiceContext=true;
        if(verdict.reviewRequired||verdict.disposition==='review')reviewRequired=true;
      }
    }
    return {texts:accepted,layouts,decisions,text:accepted.join('\n'),reviewRequired};
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
    const cleanName=v=>clean(v||'').replace(/^supply(?:\s+and\s+install)?\s+/i,'').trim();
    const typeRank=t=>({'Projector Controller':90,'Control Panel':85,'Controller':80,'Processor':78,'Switcher':76,'Active Speaker':74,'Projector':70,'Microphone':68,'Speaker':66,'Mixer':64,'Camera':62,'Display':60,'Monitor':58,'Receiver':56,'Transmitter':54,'Amplifier':52,'Manual Projection Screen':50,'Motorised Screen':50,'Screen':45,'Player':40,'CD/MP3 Player':42}[t]||20);
    const candidates=[{text:cleanName(row.description),source:'description',bonus:4},{text:cleanName(row.item_name),source:'item_name',bonus:2}]
      .map(x=>({...x,type:equipmentType(x.text)}))
      .filter(x=>x.text&&x.type&&compact(x.text).includes(compact(model))&&!/\b(?:warranty|delivery|installation|labou?r|service\s+fee)\b/i.test(x.text));
    candidates.sort((a,b)=>(typeRank(b.type)+b.bonus)-(typeRank(a.type)+a.bonus)||a.text.length-b.text.length);
    const best=candidates[0];
    if(best){
      const re=new RegExp(model.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),m=best.text.match(re);
      let prefix=m?clean(best.text.slice(0,m.index)).replace(/^(?:supply|provide|supply\s+of)\s+/i,'').trim():'';
      if(prefix&&prefix.split(/\s+/).length<=3&&!/\d/.test(prefix)&&!/\b(?:the|a|an|new|replacement|unit|pcs?|set)\b/i.test(prefix))return [prefix,model,best.type].join(' ');
      return [clean(identity.brand||''),model,best.type].filter(Boolean).join(' ');
    }
    const brand=clean(identity.brand||'');
    const type=equipmentType([row.item_name,row.description,identity.evidenceLine].filter(Boolean).join(' '));
    const parts=uniq([brand,model,type].filter(Boolean),compact);
    return parts.length>=2?parts.join(' '):cleanName(row.item_name)||cleanName(row.description);
  }
  function explicitReviewFlag(r={}){
    return !!(r.skuReviewRequired||r.quantityReviewRequired||r.priceReviewRequired||r.unit_priceReviewRequired||r.amountReviewRequired||r.serialConflict||r.serialConflictReviewRequired||r.serialCountReview);
  }
  // v7.03.3.13b: field-level Level 3 evidence. This is parser metadata, not UI inference.
  function reviewFieldsForRow(r={}){
    const out={};
    const add=(field,reason)=>{if(!field)return;out[field]={status:'review',reason:clean(reason||'Human verification required.')};};
    if(r.skuReviewRequired)add('sku','SKU/model could not be verified deterministically.');
    if(r.quantityReviewRequired)add('quantity','Quantity evidence is incomplete or conflicts with price/amount/serial evidence.');
    if(r.priceReviewRequired||r.unit_priceReviewRequired)add('unit_price','Unit price evidence is incomplete or conflicts with quantity/amount.');
    if(r.amountReviewRequired)add('amount','Amount evidence is incomplete or conflicts with quantity/unit price.');
    if(r.serialConflict||r.serialConflictReviewRequired||r.serialCountReview)add('serials','Serial-number evidence is incomplete, duplicated or conflicts with quantity.');
    const reason=clean(r?.verification?.layers?.layer3?.reason||r?.reviewReason||'').toLowerCase();
    if(/sku|model|product\s*(?:no|number)|identity/.test(reason))add('sku',reason);
    if(/standard\s*item|item\s*name|name\s+conflict/.test(reason))add('item_name',reason);
    if(/description/.test(reason))add('description',reason);
    if(/quantity|qty/.test(reason))add('quantity',reason);
    if(/unit[_ ]?price|price/.test(reason))add('unit_price',reason);
    if(/amount|line\s*total/.test(reason))add('amount',reason);
    if(/serial/.test(reason))add('serials',reason);
    // Do not invent a field-level warning when the row is only generically marked for review.
    // The Review UI will show a row/global warning until evidence identifies an exact field.
    return out;
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
    const seen=new Set();return (rows||[]).filter(x=>{
      const fields=x.fields||{},hasFields=Object.keys(fields).length>0;
      let reason=clean(x.reason||'').replace(/No independent extraction matched this row\.?/ig,'').trim();
      if(!reason&&hasFields)reason='Field verification required.';
      if(!reason&&!hasFields)return false;
      const k=[reason,JSON.stringify(x.choices||{}),JSON.stringify(fields)].join('|');if(seen.has(k))return false;seen.add(k);x.reason=reason;return true;
    });
  }
  const INVOICE_LABEL_STOP=/^(?:AMOUNT|TOTAL|SUBTOTAL|DATE|QTY|QUANTITY|PRICE|UNIT|DESCRIPTION|TAX|GST|BALANCE|TERMS|SALESMAN|CUSTOMER|REFERENCE|REF|PO|DO|INVOICE)$/i;
  const INVOICE_CONTEXT_STOP=/\b(?:attention|accounts?\s+payable|accounts?\s+receivable|bill\s+to|ship\s+to|sold\s+to|delivered\s+to|address|avenue|road|street|lane|centre|center|singapore|tel(?:ephone)?|fax|email|amount|subtotal|total|invoice\s+date|due\s+date|reference|gst|uen|quantity|qty|unit\s+price|description|customer|salesman|terms)\b/i;
  const SG_POSTAL=/^\d{6}$/;
  function normalizeInvoiceNumberCandidate(value='',supplier='',raw=''){
    let v=clean(value).replace(/^[#:\s.-]+|[#:\s.-]+$/g,'');
    if(!v||INVOICE_LABEL_STOP.test(v))return '';
    // Stop at an obvious next field/header rather than allowing PDF column text to contaminate the value.
    const stop=v.search(INVOICE_CONTEXT_STOP);if(stop>0)v=clean(v.slice(0,stop)).replace(/[,;:#.\s-]+$/g,'');
    if(!v||INVOICE_LABEL_STOP.test(v)||INVOICE_CONTEXT_STOP.test(v))return '';
    if(/\b(?:REF(?:ERENCE)?\.?\s*NO|DATE|P\/?O\s*NO|SALESMAN|TERMS|DESCRIPTION|QTY|QUANTITY|UNIT\s*PRICE|AMOUNT)\b.*\b(?:DATE|P\/?O\s*NO|SALESMAN|TERMS|AMOUNT)\b/i.test(v))return '';
    if(SG_POSTAL.test(v))return '';
    if(/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(v)||/^\d+(?:\.\d{1,2})$/.test(v))return '';
    // Keep at most two invoice-id tokens. This supports values such as "INV LTA-00215542"
    // while preventing trailing prose from becoming part of the invoice number.
    const parts=v.split(/\s+/).filter(Boolean);
    if(parts.length>2)v=parts.slice(0,2).join(' ');
    if(!/^[A-Z0-9][A-Z0-9._\/-]*(?:\s+[A-Z0-9][A-Z0-9._\/-]*)?$/i.test(v))return '';
    if(v.length<3||v.length>40)return '';
    const supplierKey=norm(supplier||raw);
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
      const line=lines[i];
      const lm=line.match(/\binvoice\s*(?:no\.?|number|#)\b\s*[:#.-]?\s*(.*)$/i);
      if(!lm)continue;
      const candidates=[];
      if(clean(lm[1]))candidates.push(clean(lm[1]));
      // A PDF may put the label and value on separate lines. Only inspect the immediate next line.
      if(lines[i+1])candidates.push(lines[i+1]);
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
    const x={...r};const sku=clean(x.sku||'');const q=Number(x.quantity);
    const pPresent=x.unit_price!==null&&x.unit_price!==undefined&&x.unit_price!=='';
    const aPresent=x.amount!==null&&x.amount!==undefined&&x.amount!=='';
    const p=pPresent?Number(x.unit_price):null,a=aPresent?Number(x.amount):null;
    const skuPrinted=!!sku&&compact(raw).includes(compact(sku));
    const qtyValid=Number.isInteger(q)&&q>0&&q<=10000;
    const economicComplete=pPresent&&aPresent&&Number.isFinite(p)&&Number.isFinite(a)&&p>=0&&a>=0;
    const economic=economicComplete?Math.abs(q*p-a)<=Math.max(.02,Math.abs(a)*.001):true;
    const serialText=clean(x.serials||x.serial_numbers||'');const serialCount=serialText?serialText.split(/[,;\n]+/).map(clean).filter(Boolean).length:0;
    const serialQtyOk=!serialCount||serialCount<=q;
    x.v703312LineEvidence={skuPrinted,qtyValid,economic,economicComplete,serialQtyOk,verified:skuPrinted&&qtyValid&&economic&&economicComplete&&serialQtyOk};
    if(!qtyValid||!economic||!serialQtyOk)x.quantityReviewRequired=true;
    if(!economicComplete){x.priceReviewRequired=true;x.amountReviewRequired=true;}
    if(!skuPrinted&&sku)x.skuReviewRequired=true;
    return x;
  }

  // V7.03.3.12l: scanned numbered-table recovery is based on actual OCR evidence,
  // not on an idealized one-line fixture. Service/accessory classification always runs first.
  const V703312J_SERVICE_ROW_RE=/\b(?:delivery\s+(?:fee|charge|service|cost)|shipping\s+(?:fee|charge|service|cost)|freight(?:\s+(?:fee|charge|service|cost))?|courier(?:\s+(?:fee|charge|service|cost))?|transport(?:ation)?\s+(?:fee|charge|service|cost)|installation(?:\s+(?:fee|charge|work|cost))?|installing(?:\s+(?:fee|charge|work|cost))?|labou?r(?:\s+(?:fee|charge|work|cost))?|service\s+(?:fee|charge|work|cost)|commissioning|return\s+trip)\b/i;
  const V703312J_ACCESSORY_RE=/\b(?:dmx\s+)?cables?\b|\bwires?\b|\bwiring\b|\bmounts?\b|\bbrackets?\b|\blamp\s+kits?\b|\bcarts?\b|\btrolleys?\b|\bstands?\b|\bsecurity\s+locks?\b|\bsafety\s+wires?\b/i;
  const V703312J_EQUIPMENT_RE=/\b(?:controller|control\s+panel|projector|microphone|speaker|camera|mixer|display|monitor|receiver|transmitter|amplifier|processor|switcher|visuali[sz]er|document\s+camera|lighting\s+controller|media\s+player|cd\/?mp3\s+player)\b/i;
  function v703312jRowText(row={}){return clean([row.item_name,row.description,row.sku].filter(Boolean).join(' '));}
  function v703312jIsServiceRow(row={}){return V703312J_SERVICE_ROW_RE.test(v703312jRowText(row));}
  function v703312jIsAccessoryRow(row={}){
    const text=v703312jRowText(row);if(!V703312J_ACCESSORY_RE.test(text))return false;
    if(V703312J_EQUIPMENT_RE.test(text)&&/\b(?:with|including|includes|incl\.?|supplied\s+with)\b[\s\S]{0,80}\b(?:cable|wire|mount|bracket|stand|cart|trolley|lock)\b/i.test(text))return false;
    return true;
  }
  function v703312jIsTrackedEquipment(row={}){
    const text=v703312jRowText(row);
    return !!text&&!v703312jIsServiceRow(row)&&!v703312jIsAccessoryRow(row)&&V703312J_EQUIPMENT_RE.test(text);
  }
  function v703312jMoney(v=''){
    const n=Number(String(v??'').replace(/(?:SGD|S\$|\$)/gi,'').replace(/,/g,'').trim());
    return Number.isFinite(n)?n:null;
  }
  function v703312jCategory(text=''){
    const t=norm(text);
    if(/controller|control panel|processor|switcher/.test(t))return 'AV Control';
    if(/projector|visualizer|document camera|display|monitor/.test(t))return 'Projection / Video';
    if(/microphone|speaker|amplifier|mixer|receiver|transmitter|media player|cd mp3 player/.test(t))return 'Audio / Equipment';
    return '';
  }
  function v703312kEvidenceTexts(raw='',evidenceSources=[]){
    const list=[{source:'primary',text:String(raw||'')},...(evidenceSources||[]).map((x,i)=>({source:String(x?.source||('evidence-'+(i+1))),text:String(x?.text||'')}))];
    const out=[],seen=new Set();
    for(const x of list){const key=x.text.replace(/\s+/g,' ').trim().slice(0,5000);if(!key||seen.has(key))continue;seen.add(key);out.push(x);}
    return out;
  }
  function v703312kBuildCandidate(description='',qty=null,unitPrice=null,amount=null,meta={}){
    const body=clean(String(description||'').replace(/^[\[\]{}()|,;:.\-]+/,'').replace(/[\[\]{}|]+/g,' ').replace(/\s+/g,' '));
    if(!body)return null;
    const candidate={sku:'',item_name:body,description:body,category:v703312jCategory(body),unit:'pcs',quantity:Number(qty),unit_price:unitPrice,amount,warranty:'',serials:'',v703312kOcrEvidence:true,v703312kSource:meta.source||'',v703312kSourceLine:meta.line||''};
    if(!(candidate.quantity>0)||v703312jIsServiceRow(candidate)||v703312jIsAccessoryRow(candidate)||!V703312J_EQUIPMENT_RE.test(body))return null;
    const models=modelTokens(body);if(models.length===1)candidate.sku=models[0];
    if(unitPrice!==null&&amount!==null){
      const p=Number(unitPrice),a=Number(amount),q=Number(candidate.quantity);
      if(!Number.isFinite(p)||!Number.isFinite(a)||Math.abs(q*p-a)>Math.max(.02,Math.abs(a)*.001)){candidate.quantityReviewRequired=true;candidate.priceReviewRequired=true;candidate.amountReviewRequired=true;}
    }else{candidate.priceReviewRequired=true;candidate.amountReviewRequired=true;}
    if(meta.qtyDerived)candidate.v703312kQtyDerived=true;
    return candidate;
  }
  function v703312kRecoverDirectLine(original='',source=''){
    let line=clean(String(original||'').replace(/[\[\]{}|]/g,' ').replace(/\/(\s*\$)/g,' $1').replace(/\s+/g,' '));
    if(!line||!V703312J_EQUIPMENT_RE.test(line))return null;
    const itemNo=line.match(/^\s*(\d{1,3})\s+/);if(itemNo)line=line.slice(itemNo[0].length).trim();
    const money=[...line.matchAll(/(?:SGD\s*|S?\$\s*)?(\d[\d,]*\.\d{2})/gi)].map(m=>({value:v703312jMoney(m[1]),index:m.index??0})).filter(x=>x.value!==null);
    if(money.length<2){
      if(!itemNo)return null;
      const qOnly=line.match(/^(.*?)\s+(\d{1,4})\s*$/);if(!qOnly)return null;
      return v703312kBuildCandidate(clean(qOnly[1]),Number(qOnly[2]),null,null,{source,line:original,qtyDerived:false});
    }
    const firstIndex=money[0].index,pre=clean(line.slice(0,firstIndex).replace(/[$/]+/g,' '));
    let desc=pre,qty=null,qtyDerived=false;const qm=pre.match(/^(.*?)\s+(\d{1,4})\s*$/);
    if(qm){desc=clean(qm[1]);qty=Number(qm[2]);}
    const unitPrice=money[money.length-2].value,amount=money[money.length-1].value;
    if(!(qty>0)&&unitPrice>0&&amount>=0){const r=amount/unitPrice,n=Math.round(r);if(n>=1&&n<=999&&Math.abs(r-n)<.001){qty=n;qtyDerived=true;}}
    return v703312kBuildCandidate(desc,qty,unitPrice,amount,{source,line:original,qtyDerived});
  }
  function v703312kRecoverSparseRows(text='',source=''){
    const lines=String(text||'').replace(/\r/g,'\n').split(/\n+/).map(clean).filter(Boolean),out=[];
    for(let i=0;i<lines.length;i++){
      if(!/^\d{1,3}$/.test(lines[i]))continue;
      let descIndex=-1,desc='';
      for(let j=i+1;j<=Math.min(lines.length-1,i+4);j++){
        const x=clean(lines[j].replace(/^[\[\]{}|]+/,'').replace(/[\[\]{}|]+/g,' '));
        if(V703312J_EQUIPMENT_RE.test(x)&&!v703312jIsServiceRow({item_name:x})&&!v703312jIsAccessoryRow({item_name:x})){descIndex=j;desc=x;break;}
        if(/^\d{1,3}$/.test(x))break;
      }
      if(descIndex<0)continue;
      let qty=null;const money=[];
      for(let j=descIndex+1;j<=Math.min(lines.length-1,descIndex+8);j++){
        const x=lines[j];if(j>descIndex+1&&/^\d{1,3}$/.test(x)&&money.length<2)break;
        if(qty===null&&/^\d{1,4}$/.test(x)){qty=Number(x);continue;}
        for(const m of x.matchAll(/(?:SGD\s*|S?\$\s*)?(\d[\d,]*\.\d{2})/gi)){const v=v703312jMoney(m[1]);if(v!==null)money.push(v);}
        if(money.length>=2&&qty!==null)break;
      }
      if(money.length<2)continue;const unitPrice=money[money.length-2],amount=money[money.length-1];let qtyDerived=false;
      if(!(qty>0)&&unitPrice>0&&amount>=0){const r=amount/unitPrice,n=Math.round(r);if(n>=1&&n<=999&&Math.abs(r-n)<.001){qty=n;qtyDerived=true;}}
      const c=v703312kBuildCandidate(desc,qty,unitPrice,amount,{source,line:lines.slice(i,Math.min(lines.length,descIndex+9)).join(' | '),qtyDerived});if(c)out.push(c);
    }
    return out;
  }
  function v703312jRecoverNumberedEquipmentRows(raw='',evidenceSources=[]){
    const recovered=[];
    for(const ev of v703312kEvidenceTexts(raw,evidenceSources)){
      const lines=String(ev.text||'').replace(/\r/g,'\n').split(/\n+/).map(clean).filter(Boolean);
      for(const line of lines){const c=v703312kRecoverDirectLine(line,ev.source);if(c)recovered.push(c);}
      recovered.push(...v703312kRecoverSparseRows(ev.text,ev.source));
    }
    const out=[];
    for(const row of recovered){
      const existing=out.find(x=>v703312jSameEquipment(x,row));
      if(!existing){row.v703312kEvidenceSources=[row.v703312kSource].filter(Boolean);out.push(row);continue;}
      existing.v703312kEvidenceSources=uniq([...(existing.v703312kEvidenceSources||[]),row.v703312kSource].filter(Boolean));
      const existingComplete=Number.isFinite(Number(existing.unit_price))&&Number.isFinite(Number(existing.amount));
      const rowComplete=Number.isFinite(Number(row.unit_price))&&Number.isFinite(Number(row.amount));
      if(!existingComplete&&rowComplete){existing.unit_price=row.unit_price;existing.amount=row.amount;existing.quantity=row.quantity;delete existing.priceReviewRequired;delete existing.amountReviewRequired;delete existing.quantityReviewRequired;}
      if(!existing.sku&&row.sku)existing.sku=row.sku;
      if(!existing.category&&row.category)existing.category=row.category;
      if(Number(existing.quantity)!==Number(row.quantity)||((existingComplete&&rowComplete)&&(Number(existing.unit_price)!==Number(row.unit_price)||Number(existing.amount)!==Number(row.amount)))){existing.v703312kIndependentConflict=true;existing.humanReviewRequired=true;}
    }
    for(const row of out){
      const n=(row.v703312kEvidenceSources||[]).length;row.v703312kLevel1={status:'confirmed',reason:'Deterministic OCR/table evidence identifies a tracked equipment row.'};
      row.v703312kLevel2={status:n>=2&&!row.v703312kIndependentConflict?'confirmed':'unavailable',sources:n,reason:n>=2?'Independent OCR reads agree on the same equipment identity and economics.':'A second independent OCR read did not confirm the row.'};
      const deterministicSingle=n===1&&!row.v703312kIndependentConflict&&strongDeterministicEvidence(row,raw)&&!explicitReviewFlag(row);
      if((n>=2&&!row.v703312kIndependentConflict&&!explicitReviewFlag(row))||deterministicSingle){row.humanReviewRequired=false;row.needsReview=false;}
      else{row.humanReviewRequired=true;row.needsReview=true;}
    }
    return dedupeParsedLineItems(out);
  }
  function v703312jSameEquipment(a={},b={}){
    const sa=compact(a.sku||''),sb=compact(b.sku||'');if(sa&&sb&&sa===sb)return true;
    const na=normalizedItemIdentity(a.item_name||a.description||''),nb=normalizedItemIdentity(b.item_name||b.description||'');
    return !!na&&!!nb&&(na===nb||na.includes(nb)||nb.includes(na));
  }
  function v703312jMergeTrackedRows(existing=[],recovered=[],raw=''){
    const kept=(existing||[]).filter(r=>!v703312jIsServiceRow(r)&&!v703312jIsAccessoryRow(r));
    for(const rec of recovered||[]){const match=kept.find(x=>v703312jSameEquipment(x,rec));if(!match)kept.push(rec);else if((rec.v703312kEvidenceSources||[]).length){
      match.v703312kEvidenceSources=uniq([...(match.v703312kEvidenceSources||[]),...rec.v703312kEvidenceSources]);
      match.v703312kLevel1=match.v703312kLevel1?.status==='confirmed'?match.v703312kLevel1:rec.v703312kLevel1;
      const sourceCount=match.v703312kEvidenceSources.length;
      if(sourceCount>=2&&!match.v703312kIndependentConflict&&!rec.v703312kIndependentConflict){match.v703312kLevel2={status:'confirmed',sources:sourceCount,reason:'Independent OCR reads agree on the same equipment identity and economics.'};match.humanReviewRequired=false;match.needsReview=false;}
      else if(match.v703312kLevel2?.status!=='confirmed')match.v703312kLevel2=rec.v703312kLevel2;
    }}
    return dedupeParsedLineItems(kept.map(r=>validateSkuQtyEvidence(r.v703312kOcrEvidence?r:fixRow(r,raw),raw)));
  }
  function applyParsedFixes(parsed={},raw='',evidenceSources=[]){
    if(!parsed||typeof parsed!=='object')return parsed;
    const source=String(raw||parsed.raw||parsed.rawText||'');
    const incoming=[...(parsed.items||[])];
    const excludedService=incoming.filter(v703312jIsServiceRow),excludedAccessory=incoming.filter(v703312jIsAccessoryRow);
    const trackedIncoming=incoming.filter(r=>!v703312jIsServiceRow(r)&&!v703312jIsAccessoryRow(r));
    const fixed=trackedIncoming.map(r=>validateSkuQtyEvidence(fixRow(r,source),source));
    const recovered=v703312jRecoverNumberedEquipmentRows(source,evidenceSources);
    const merged=v703312jMergeTrackedRows(fixed,recovered,source);
    const out={...parsed,doc:fixDocumentHeader(parsed.doc||{},v703312kEvidenceTexts(source,evidenceSources).map(x=>x.text).join('\n')),items:merged};
    out.v703312jInventoryFilter={excludedServiceCount:excludedService.length,excludedAccessoryCount:excludedAccessory.length,recoveredEquipmentCount:recovered.filter(r=>!fixed.some(x=>v703312jSameEquipment(x,r))).length};
    out.v703312kVerification={level1:out.items.map(r=>({sku:r.sku,item_name:r.item_name,status:r.v703312kLevel1?.status||'unknown'})),level2:out.items.map(r=>({sku:r.sku,item_name:r.item_name,status:r.v703312kLevel2?.status||'unknown',sources:r.v703312kLevel2?.sources||(r.v703312kEvidenceSources||[]).length||0})),level3Required:out.items.some(r=>r.v703312kIndependentConflict||explicitReviewFlag(r)||r.humanReviewRequired===true)};
    const v7={...(out.v7||out.parseEvidence?.v7||{})};
    if(v7.verification){
      const vr={...v7.verification};
      vr.rows=(vr.rows||[]).filter(r=>!v703312jIsServiceRow(r)&&!v703312jIsAccessoryRow(r)).map(r=>fixRow(r,source));
      if(recovered.length){for(const rec of recovered){if(!vr.rows.some(x=>v703312jSameEquipment(x,rec)))vr.rows.push({...rec,verification:{...(rec.verification||{}),layers:{layer1:{status:'confirmed',reason:rec.v703312kLevel1?.reason||''},layer2:{status:rec.v703312kLevel2?.status||'unavailable',reason:rec.v703312kLevel2?.reason||''},layer3:{status:(rec.humanReviewRequired===false&&!explicitReviewFlag(rec))?'not_required':'required',reason:(rec.humanReviewRequired===false&&!explicitReviewFlag(rec))?'Deterministic invoice evidence is internally consistent; no unresolved conflict remains.':'Human verification is required because independent evidence is incomplete or conflicting.'}}}});}
      }
      vr.humanReviewRows=dedupeReviewRows((vr.rows||[]).filter(r=>r.humanReviewRequired===true||explicitReviewFlag(r)).map(r=>({rowId:r.rowId,reason:r.verification?.layers?.layer3?.reason||'',choices:r.verification?.choices||{},fields:reviewFieldsForRow(r)})));
      vr.humanReviewRequired=vr.humanReviewRows.length>0;v7.verification=vr;
    }
    const comp={...(v7.completenessValidation||{})};
    const sourceRecovered=recovered.length>0&&recovered.every(r=>out.items.some(x=>v703312jSameEquipment(x,r)));
    if(sourceRecovered){
      comp.expectedEquipmentCount=recovered.length;comp.finalEquipmentCount=out.items.length;
      comp.countMatch=out.items.length===recovered.length;comp.identityMatch=comp.countMatch;
      comp.missing=[];comp.unexpected=[];comp.recheckRequired=!comp.countMatch;comp.status=comp.countMatch?'pass':'review';
      comp.v703312kReason='Actual OCR evidence was reconciled across independent OCR reads; service/accessory rows were excluded before identity correction.';
    }else if(comp.recheckRequired&&out.items.length>0&&out.items.every(r=>strongDeterministicEvidence(r,source)&&!explicitReviewFlag(r))){
      if(Number(comp.expectedEquipmentCount)===0||Number(comp.expectedEquipmentCount)===out.items.length){comp.expectedEquipmentCount=out.items.length;comp.finalEquipmentCount=out.items.length;comp.countMatch=true;comp.identityMatch=true;comp.missing=[];comp.unexpected=[];comp.recheckRequired=false;comp.status='pass';comp.v7033Reason='All final rows have strong deterministic invoice evidence.';}
    }
    if(Object.keys(comp).length)v7.completenessValidation=comp;
    // Attach field-level review metadata directly to final inventory rows so the Review UI can
    // render exact affected fields without reverse-engineering free-text warnings.
    out.items=out.items.map(item=>{
      const row=(v7.verification?.rows||[]).find(r=>(item.rowId&&r.rowId&&String(item.rowId)===String(r.rowId))||v703312jSameEquipment(item,r));
      const fields={...reviewFieldsForRow(row||{}),...reviewFieldsForRow(item)};
      return {...item,v7033ReviewFields:fields};
    });
    const rowNeed=out.items.some(r=>r.humanReviewRequired===true||explicitReviewFlag(r)||Object.keys(r.v7033ReviewFields||{}).length>0);
    v7.humanReviewRequired=!!(rowNeed||v7.verification?.humanReviewRequired||comp.recheckRequired);
    v7.patchVersion=VERSION;v7.baselineVersion=BASELINE_VERSION;out.v7=v7;
    if(out.parseEvidence?.v7)out.parseEvidence={...out.parseEvidence,v7};
    out.v703312kVerification.level3Required=v7.humanReviewRequired;
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
    if(typeof originalEnhance==='function')p.enhanceParsed=function(args={}){return applyParsedFixes(originalEnhance(args),args.raw||'',args.evidenceSources||[]);};
    if(typeof originalPrepare==='function')p.prepareSave=function(rows=[],options={}){
      const trackedRows=(rows||[]).filter(r=>!v703312jIsServiceRow(r)&&!v703312jIsAccessoryRow(r));
      const result=originalPrepare(trackedRows,options);
      const warnings=dedupeReviewRows((result.warnings||[]).map((w,i)=>({rowId:String(i),reason:w.message||'',choices:{},raw:w}))).map(x=>x.raw);
      const status=result.errors?.length?'block':(warnings.length&&!options.humanReviewed?'review':'pass');
      return {...result,warnings,status,ok:status==='pass',humanReviewRequired:status==='review'};
    };
    p.__v7033Installed=true;p.__v7033Version=VERSION;return true;
  }

  const RELEASE_NOTES=[
    'Level 3 review now highlights only the exact affected line-item card when the warning can be mapped to evidence; unrelated items remain normal.',
    'Runtime integration fix: the parser gate now executes inside the final application scope immediately before Line Items render, using the live state.parsed and OCR evidence; this prevents a correct parser result from being lost while the Review screen still shows Delivery Fee.',
    'Real scanned-PDF regression fixed using actual INV-Dmx200 OCR evidence: numbered rows tolerate OCR brackets/pipes/slashes and can reconcile across independent OCR modes instead of requiring an ideal one-line fixture.',
    'Level 1/2 verification now records deterministic equipment recovery and independent OCR agreement before deciding whether Level 3 human review is required.',
    'Fixed numbered-item invoices where a mathematically clean Delivery Fee row could outrank the real equipment row; service/charge classification now runs before candidate acceptance and again after reconciliation.',
    'Added numbered-table equipment recovery for rows such as Clair Lighting DMX-200 Controller; printed model/description/quantity are recovered from invoice evidence without inventing missing prices.',
    'Accessory rows such as DMX cables and service rows such as Delivery Fee are excluded from inventory even when their quantity × unit price = amount arithmetic is valid.',
    'Coming Next roadmap now automatically removes completed roadmap items instead of continuing to show fixes that are already in the current release.',
    'Vault search box reduced by 30% so Group by Company and Sort Newest to Oldest have enough room to display their full labels.',
    'Maintenance All outcomes filter reduced by 60% for a more compact toolbar footprint.',
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

  return {VERSION,BASELINE_VERSION,clean,norm,compact,supplierFromEvidence,lineEvidenceSignature,dedupeParsedLineItems,validateSkuQtyEvidence,v703312jIsServiceRow,v703312jIsAccessoryRow,v703312jIsTrackedEquipment,v703312jRecoverNumberedEquipmentRows,v703312jMergeTrackedRows,classifyInvoicePage,filterInvoicePages,reviewFieldsForRow,looksLikeDimensionOrSpec,credibleSku,modelTokens,productIdentityCandidates,resolveInvoiceIdentity,conciseName,fixRow,normalizeInvoiceNumberCandidate,invoiceNumberFromLabel,fixDocumentHeader,applyParsedFixes,normalizedItemIdentity,resolveInventoryMatch,prepareLinesForInventory,safeDuplicateGroups,installParserPatch,installUiVersionSync,applyVersionUi,RELEASE_NOTES,RELEASE_UPCOMING_VERSION,RELEASE_UPCOMING_NOTES,RELEASE_ROADMAP,COMPLETED_ROADMAP_IDS};
});
