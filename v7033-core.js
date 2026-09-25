/* AV Inventory Hub v7.03.3.14x reference, duplicate-row and review arithmetic patch
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

  const VERSION='7.03.3.14x';
  const BASELINE_VERSION='7.03.2';
  const clean=(v='')=>String(v??'').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').trim();
  const norm=(v='')=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const compact=(v='')=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const uniq=(xs,key=x=>x)=>{const out=[],seen=new Set();for(const x of xs||[]){const k=key(x);if(!k||seen.has(k))continue;seen.add(k);out.push(x);}return out;};


  // V7.03.3.14c — additive exception for a complete equipment trolley.
  // A generic trolley remains excluded. Promotion requires printed SKU + consistent economics
  // + multiple physical construction features, so older accessory behavior stays unchanged.
  function isStructuredPhysicalAssetRow(row={}){
    const sku=clean(row.sku||''),text=clean([row.item_name,row.description].filter(Boolean).join(' '));
    if(!/\btrolleys?\b/i.test(text))return false;
    if(/\b(?:mount|bracket|cable|wire|lamp\s*kit|adapter|adaptor)\b/i.test(text))return false;
    const credibleSku=/^[A-Z0-9][A-Z0-9+._\/-]{2,27}$/i.test(sku)&&/[A-Za-z]/.test(sku)&&/\d/.test(sku);
    const q=Number(row.quantity),p=Number(row.unit_price),a=Number(row.amount);
    const economic=Number.isFinite(q)&&q>0&&Number.isFinite(p)&&p>0&&Number.isFinite(a)&&a>=0&&Math.abs((q*p)-a)<=Math.max(.08,Math.abs(a)*.002);
    const features=new Set((text.match(/\b(?:adjustable|metal|steel|cabinet|tray|shelf|caster|wheel|wheels|lockable|security|enclosure|keyboard|workstation|rack|drawer|door)\b/gi)||[]).map(x=>x.toLowerCase().replace(/s$/,'')));
    return !!(credibleSku&&economic&&features.size>=3);
  }


  // V7.03.3.13c DOCUMENT GATE
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
  function contentWords(s=''){return norm(s).split(' ').filter(w=>w.length>=4&&!/^(?:with|from|year|only|stock|warranty|supply|install|installation|dismantle|dismantled|dismantling|dismount|dismounted|dismounting|commissioning|labour|labor|service|services|safety|wired|secure|classroom)$/.test(w));}

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
        const nl=norm(line),targetHits=target.reduce((n,w)=>n+(nl.includes(w)?1:0),0);
        const rowType=equipmentType([row.item_name,row.description].filter(Boolean).join(' ')),lineType=equipmentType(line),typeMatch=!!rowType&&!!lineType&&rowType===lineType;
        if(i-headerIndex>=0&&i-headerIndex<=4)score+=12;
        if(/\b(?:PRODUCT\s*(?:NO\.?|NUMBER)|MODEL|SKU)\b/i.test(line))score+=8;
        if(brand)score+=4;
        score+=targetHits*2;
        if(/\b(?:screen|projector|microphone|speaker|player|controller|panel|camera|mixer|display|monitor|receiver|transmitter|amplifier|processor|switcher)\b/i.test(line))score+=3;
        if(compact(raw).includes(compact(model)))score+=2;
        const relevant=targetHits>0||typeMatch;
        out.push({brand,model,line,index:i,score,targetHits,typeMatch,relevant,source:(i-headerIndex>=0&&i-headerIndex<=4)?'labelled-product-field':'invoice-text'});
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

    // Never let an unrelated model elsewhere on the invoice overwrite a credible model that is directly printed.
    if(currentCredible&&currentSupported&&!looksLikeDimensionOrSpec(current,currentLine)){
      return {brand:'',model:current,changed:false,evidenceLine:currentLine,source:'invoice-text',score:5,reason:'Current model is directly printed on the invoice.'};
    }
    // Global Product No/Model/SKU evidence may correct a row only when it is relevant to that row.
    if(top&&top.relevant&&top.score>=12){
      if(!currentCredible||!currentSupported||looksLikeDimensionOrSpec(current,currentLine)||compact(current)!==compact(top.model)){
        return {brand:top.brand,model:top.model,changed:compact(current)!==compact(top.model),evidenceLine:top.line,source:top.source,score:top.score,reason:'Relevant labelled product identity evidence outranks unsupported row text.'};
      }
    }
    // Strong unlabelled brand+model evidence can correct an unsupported OCR model only with row relevance.
    if(top&&top.relevant&&top.score>=7&&(!currentCredible||!currentSupported)){
      return {brand:top.brand,model:top.model,changed:compact(current)!==compact(top.model),evidenceLine:top.line,source:top.source,score:top.score,reason:'Unsupported parsed model replaced by stronger relevant invoice evidence.'};
    }
    return {brand:'',model:currentCredible?current:'',changed:false,evidenceLine:currentLine,source:currentSupported?'invoice-text':'unverified',score:currentSupported?5:0,reason:currentSupported?'Current model is printed on the invoice.':'No verified relevant model was found.'};
  }
  function conciseName(row={},identity={}){
    const model=clean(identity.model||row.sku||'');
    if(!model)return clean(row.item_name||row.description||'');
    const cleanName=v=>clean(v||'').replace(/^supply(?:\s+and\s+install)?\s+/i,'').trim();
    const typeRank=t=>({'Projector Controller':90,'Control Panel':85,'Controller':80,'Processor':78,'Switcher':76,'Active Speaker':74,'Projector':70,'Microphone':68,'Speaker':66,'Mixer':64,'Camera':62,'Display':60,'Monitor':58,'Receiver':56,'Transmitter':54,'Amplifier':52,'Manual Projection Screen':50,'Motorised Screen':50,'Screen':45,'Player':40,'CD/MP3 Player':42}[t]||20);
    const candidates=[{text:cleanName(row.description),source:'description',bonus:4},{text:cleanName(row.item_name),source:'item_name',bonus:2}]
      .map(x=>({...x,type:equipmentType(x.text)}))
      .filter(x=>x.text&&x.type&&compact(x.text).includes(compact(model))&&!/\b(?:warranty|delivery|installation|labou?r|service\s+fee|dismantl(?:e|ed|ing)|dismount(?:ed|ing)?|de-?mount(?:ed|ing)?|commissioning)\b/i.test(x.text));
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
  // v7.03.3.14f: field-level Level 3 evidence. This is parser metadata, not UI inference.
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
      if(lines[i+1])candidates.push(lines[i+1]);
      for(const c of candidates){const n=normalizeInvoiceNumberCandidate(c,supplier,raw);if(n)return n;}
    }
    const heading=v=>{const h=clean(v).replace(/[^A-Za-z ]+/g,' ').replace(/\s+/g,' ').trim();if(!h||h.length>120||h.split(/\s+/).length>6||/\b(?:PRO\s*FORMA|PROFORMA|COPY\s+OF|REFERENCE|PAYMENT)\b/i.test(h))return false;return /(?:^|\s)(?:TAX\s+INVOICE|INVOICE|SALES\s+INVOICE|COMMERCIAL\s+INVOICE|GST\s+INVOICE)$/i.test(h);};
    for(let i=0;i<Math.min(lines.length,80);i++){
      if(!heading(lines[i]))continue;
      for(let j=i+1;j<Math.min(lines.length,i+6);j++){
        const m=lines[j].match(/^(?:N[O0]\.?|NUMBER|#|O)\s*[:#.-]?\s*(.*)$/i);
        if(!m)continue;
        const candidates=[];
        if(clean(m[1]))candidates.push(clean(m[1]));
        if(!clean(m[1])&&lines[j+1])candidates.push(lines[j+1]);
        for(const c of candidates){const n=normalizeInvoiceNumberCandidate(c,supplier,raw);if(n)return n;}
      }
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
  function referenceNumberFromLabel(raw=''){
    const text=String(raw||'').replace(/\r/g,'\n');
    const re=/\b(?:Reference(?:\s*(?:No\.?|Number|#))?|Ref\.?\s*(?:No\.?|Number|#)?)\s*[:#.-]?\s*([A-Z0-9][A-Z0-9._\/-]{2,})/ig;
    const blocked=/^(?:DATE|INVOICE|NO|NUMBER|P\/?O|PO|TERMS|SALESMAN|CUSTOMER|CODE)$/i;
    for(const m of text.matchAll(re)){
      const value=clean(m[1]||'').replace(/[,:;]+$/,'');
      if(value&&/\d/.test(value)&&!blocked.test(value)&&!parseDateLike(value))return value;
    }
    return '';
  }
  function parseDateLike(value=''){
    const s=clean(value);
    return /^(?:\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2})$/.test(s);
  }
  function fixDocumentHeader(doc={},raw=''){
    const d={...doc};
    d.supplier_name=supplierFromEvidence(raw,d.supplier_name||'');
    const supplierParts=clean(d.supplier_name||'').split(/\s+/).filter(Boolean);
    if(supplierParts.length>=3&&supplierParts[0].toLowerCase()===supplierParts[1].toLowerCase())d.supplier_name=supplierParts.slice(1).join(' ');
    const supplier=clean(d.supplier_name||'');
    const labelled=invoiceNumberFromLabel(raw,supplier);
    const current=normalizeInvoiceNumberCandidate(d.invoice_number||'',supplier,raw);
    d.invoice_number=labelled||current||'';
    if(!d.invoice_number&&clean(doc.invoice_number||''))d.invoiceNumberReviewRequired=true;
    if(d.invoice_number!==clean(doc.invoice_number||''))d.v7033InvoiceNumberCorrectedFrom=clean(doc.invoice_number||'');
    const delivery=clean(d.delivery_order_number||'');
    if(/^(?:D\s*\/?\s*O(?:\s*(?:NO\.?|NUMBER))?|DELIVERY\s+ORDER(?:\s*(?:NO\.?|NUMBER))?)$/i.test(delivery))d.delivery_order_number='';
    const labelledReference=referenceNumberFromLabel(raw),previousReference=clean(d.reference_number||d.reference||'');
    if(labelledReference){
      d.reference_number=labelledReference;
      if(previousReference&&previousReference!==labelledReference)d.v7033ReferenceCorrectedFrom=previousReference;
    }else d.reference_number=previousReference;
    return d;
  }
  function lineEvidenceSignature(r={}){
    const sku=compact(r.sku||'');
    const name=normalizedItemIdentity(r.item_name||r.description||'');
    const q=Number(r.quantity||0),p=Number(r.unit_price),a=Number(r.amount);
    const serial=compact(r.serials||r.serial_numbers||'');
    return [sku||name,q,Number.isFinite(p)?p.toFixed(4):'',Number.isFinite(a)?a.toFixed(4):'',serial].join('|');
  }
  function v703314xDuplicateDescription(row={}){
    return normalizedItemIdentity(row.item_name||row.description||'').replace(/\b(?:the|a|an|in|with|for|of)\b/g,' ').replace(/\s+/g,' ').trim();
  }
  function v703314xEconomicOk(row={}){
    const q=Number(row.quantity),p=Number(row.unit_price),a=Number(row.amount);
    return q>0&&Number.isFinite(p)&&Number.isFinite(a)&&Math.abs(q*p-a)<=Math.max(.06,Math.abs(a)*.005);
  }
  function v703314xDuplicatePair(a={},b={}){
    const qa=Number(a.quantity),qb=Number(b.quantity),pa=Number(a.unit_price),pb=Number(b.unit_price);
    if(!(qa>0&&qb>0&&Number.isFinite(pa)&&Number.isFinite(pb)&&Math.abs(qa-qb)<1e-9&&Math.abs(pa-pb)<=.01))return false;
    const sa=compact(a.sku||''),sb=compact(b.sku||'');
    if(sa&&sb)return sa===sb;
    const da=v703314xDuplicateDescription(a),db=v703314xDuplicateDescription(b);if(!da||!db)return false;
    const short=da.length<=db.length?da:db,long=da.length<=db.length?db:da;
    return short.length>=12&&(short===long||long.includes(short));
  }
  function v703314xRowStrength(row={}){
    let score=0;if(clean(row.sku))score+=30;if(v703314xEconomicOk(row))score+=40;
    score+=Math.min(20,v703314xDuplicateDescription(row).length/5);
    if(row.humanReviewRequired||row.needsReview||row.quantityReviewRequired||row.priceReviewRequired||row.amountReviewRequired)score-=10;
    if(row.layoutEvidenceVerified)score+=8;if(row.economicEvidenceVerified)score+=8;return score;
  }
  function dedupeParsedLineItems(items=[]){
    const out=[];
    for(const raw of items||[]){
      const item={...raw},matches=[];for(let i=0;i<out.length;i++)if(v703314xDuplicatePair(out[i],item))matches.push(i);
      if(!matches.length){out.push(item);continue;}
      const candidates=[item,...matches.map(i=>out[i])].sort((a,b)=>v703314xRowStrength(b)-v703314xRowStrength(a));
      out[matches[0]]={...candidates[0]};for(let j=matches.length-1;j>=1;j--)out.splice(matches[j],1);
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
  const V703312J_SERVICE_ROW_RE=/\b(?:delivery\s+(?:fee|charge|service|cost)|shipping\s+(?:fee|charge|service|cost)|freight(?:\s+(?:fee|charge|service|cost))?|courier(?:\s+(?:fee|charge|service|cost))?|transport(?:ation)?\s+(?:fee|charge|service|cost)|installation(?:\s+(?:fee|charge|work|cost))?|installing(?:\s+(?:fee|charge|work|cost))?|labou?r(?:\s+(?:fee|charge|work|cost))?|service\s+(?:fee|charge|work|cost)|commissioning|return\s+trip|dismantl(?:e|ed|ing)|dismount(?:ed|ing)?|de-?mount(?:ed|ing)?|remov(?:e|al|ing)\s+(?:of\s+)?existing)\b/i;
  const V703312J_ACCESSORY_RE=/\b(?:dmx\s+)?cables?\b|\bwires?\b|\bwiring\b|\bmounts?\b|\bbrackets?\b|\blamp\s+kits?\b|\bcarts?\b|\btrolleys?\b|\bstands?\b|\bsecurity\s+locks?\b|\bsafety\s+wires?\b/i;
  const V703312J_EQUIPMENT_RE=/\b(?:controller|control\s+panel|keypad|button\s+keypad|projector|microphone|speaker|camera|mixer|display|monitor|receiver|transmitter|amplifier|processor|switcher|visuali[sz]er|document\s+camera|lighting\s+controller|media\s+player|cd\/?mp3\s+player)\b/i;
  function v703312jRowText(row={}){return clean([row.item_name,row.description,row.sku].filter(Boolean).join(' '));}
  function v703314kHasStrongEquipmentIdentity(row={}){
    const text=v703312jRowText(row),sku=clean(row.sku||''),primary=clean(row.item_name||'');
    if(/^(?:professional\s+services?|services?|installation|installing|dismantl(?:e|ed|ing)|dismount(?:ed|ing)?|de-?mount(?:ed|ing)?|remov(?:e|al|ing)|testing|commissioning|labou?r)\b/i.test(primary))return false;
    return !!text&&credibleSku(sku,text)&&V703312J_EQUIPMENT_RE.test(text);
  }
  function v703312jIsServiceRow(row={}){
    const text=v703312jRowText(row);
    if(!V703312J_SERVICE_ROW_RE.test(text))return false;
    // Keep a bundled equipment row only when its primary identity is equipment, not a work action.
    return !v703314kHasStrongEquipmentIdentity(row);
  }
  function v703312jIsAccessoryRow(row={}){
    const text=v703312jRowText(row);if(!V703312J_ACCESSORY_RE.test(text))return false;
    if(isStructuredPhysicalAssetRow(row))return false;
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
    if(/controller|control panel|keypad|button keypad|processor|switcher/.test(t))return 'AV Control';
    if(/projector|visualizer|document camera|display|monitor/.test(t))return 'Projection / Video';
    if(/microphone|speaker|amplifier|mixer|receiver|transmitter|media player|cd mp3 player/.test(t))return 'Audio / Equipment';
    return '';
  }

  // V7.03.3.14c — recover a complete physical trolley from a priced OCR row plus its continuation lines.
  // This does not relax generic trolley/accessory exclusions: the row must have a directly printed
  // mixed alphanumeric SKU, internally consistent quantity/price/amount, and >=3 construction features.
  function v703314aRecoverStructuredPricedAssetRows(text='',source=''){
    const lines=String(text||'').replace(/\r/g,'\n').split(/\n+/).map(clean).filter(Boolean),out=[];
    const rowRe=/^([A-Z0-9][A-Z0-9+._\/-]{2,27})\s+(.+?)\s+(\d{1,4})\s+(?:SGD\s*|S?\$\s*)?(\d[\d,]*\.\d{2})\s+(?:SGD\s*|S?\$\s*)?(\d[\d,]*\.\d{2})\s*$/i;
    const stopRe=/^(?:SUB\s*TOTAL|SUBTOTAL|GST\b|TOTAL\b|GRAND\s+TOTAL|AMOUNT\s+DUE|D\/?O\s+NO\b|PURCHASE\s+ORDER\b|ORDERED\s+BY\b|SALES\s+REP\b|TERMS\b|CUSTOMER'?S?\s+STAMP|AUTHORI[ZS]ED\s+SIGNATURE|ALL\s+PAYMENTS|GOODS\s+SOLD|PAGE\s+\d)/i;
    for(let i=0;i<lines.length;i++){
      const m=lines[i].match(rowRe);if(!m)continue;
      const sku=clean(m[1]);if(!credibleSku(sku,lines[i]))continue;
      const quantity=Number(m[3]),unitPrice=v703312jMoney(m[4]),amount=v703312jMoney(m[5]);
      if(!(quantity>0)||!Number.isFinite(unitPrice)||!Number.isFinite(amount)||unitPrice<=0||Math.abs(quantity*unitPrice-amount)>Math.max(.08,Math.abs(amount)*.002))continue;
      const descParts=[clean(m[2])];let itemName=descParts[0];
      for(let j=i+1;j<=Math.min(lines.length-1,i+10);j++){
        const next=clean(lines[j]);if(!next)continue;
        rowRe.lastIndex=0;if(rowRe.test(next)||stopRe.test(next)||/(?:SGD\s*|S?\$\s*)?\d[\d,]*\.\d{2}[\s|/]+(?:SGD\s*|S?\$\s*)?\d[\d,]*\.\d{2}\s*$/i.test(next))break;
        if(/^(?:S\s*\/?\s*N|S\.?N\.?|SERIAL(?:\s+(?:NO|NUMBER))?)\b/i.test(next))continue;
        if(next.length>220)break;
        descParts.push(next);
        if(j===i+1&&next.length<=24&&next.split(/\s+/).length<=4)itemName=clean(itemName+' '+next);
      }
      const description=clean(descParts.join(' '));
      const candidate={sku,item_name:itemName,description,category:v703312jCategory(description)||'AV Accessories',unit:'pcs',quantity,unit_price:unitPrice,amount,warranty:'',serials:'',v703312kOcrEvidence:true,v703312kSource:source||'',v703312kSourceLine:lines[i],v703314aStructuredPricedAsset:true};
      if(v703312jIsServiceRow(candidate)||!isStructuredPhysicalAssetRow(candidate))continue;
      out.push(candidate);
    }
    return out;
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
      recovered.push(...v703314aRecoverStructuredPricedAssetRows(ev.text,ev.source));
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

  const v703314nRound2=n=>Number.isFinite(Number(n))?Math.round(Number(n)*100)/100:null;
  const v703314nFinite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  function v703314nTolerance(value,min=.02,rate=.0005){return Math.max(min,Math.abs(Number(value)||0)*rate);}
  function v703314nLineArithmetic(row={}){
    const q=Number(row.quantity),p=Number(row.unit_price),a=Number(row.amount);
    if(!(q>0)||!Number.isFinite(p)||!Number.isFinite(a))return {status:'unavailable',reason:'Qty, unit price and amount are not all available.',quantity:v703314nFinite(row.quantity)?q:null,unit_price:v703314nFinite(row.unit_price)?p:null,amount:v703314nFinite(row.amount)?a:null};
    const expected=v703314nRound2(q*p),difference=v703314nRound2(Math.abs(a-expected)),tolerance=v703314nTolerance(expected,.02,.0005),pass=difference<=tolerance;
    return {status:pass?'pass':'review',quantity:q,unit_price:p,amount:a,expected_amount:expected,difference,tolerance:Number(tolerance.toFixed(2)),reason:pass?'Qty × Unit Price agrees with Amount.':'Qty × Unit Price does not agree with Amount.'};
  }
  function v703314nDocumentArithmetic(doc={},rows=[]){
    const subtotal=v703314nFinite(doc.subtotal)?Number(doc.subtotal):null,gst=v703314nFinite(doc.gst)?Number(doc.gst):null,total=v703314nFinite(doc.total_amount??doc.total)?Number(doc.total_amount??doc.total):null;
    const out={subtotal_gst_total:{status:'unavailable',reason:'Subtotal, GST and Total are not all available.'},line_sum_subtotal:{status:'unavailable',advisory:true,reason:'A complete numeric line amount set is not available.'}};
    if(subtotal!==null&&gst!==null&&total!==null){
      const expected=v703314nRound2(subtotal+gst),difference=v703314nRound2(Math.abs(total-expected)),tolerance=v703314nTolerance(total,.05,.0001),pass=difference<=tolerance;
      out.subtotal_gst_total={status:pass?'pass':'review',subtotal,gst,total,expected_total:expected,difference,tolerance:Number(tolerance.toFixed(2)),reason:pass?'Subtotal + GST agrees with Total.':'Subtotal + GST does not agree with Total.'};
    }
    const numeric=(rows||[]).filter(r=>v703314nFinite(r.amount)),eligible=(rows||[]).length>0&&numeric.length===(rows||[]).length;
    if(eligible&&subtotal!==null){
      const sum=v703314nRound2(numeric.reduce((n,r)=>n+Number(r.amount),0)),difference=v703314nRound2(Math.abs(sum-subtotal)),tolerance=v703314nTolerance(subtotal,.05,.0005),pass=difference<=tolerance;
      out.line_sum_subtotal={status:pass?'pass':'review',advisory:true,line_amount_sum:sum,subtotal,difference,tolerance:Number(tolerance.toFixed(2)),reason:pass?'Parsed line amounts agree with Subtotal.':'Parsed line amounts do not fully reconcile with Subtotal. This is advisory because intentionally excluded service/accessory rows may contribute to Subtotal.'};
    }
    return out;
  }
  function v703314nEvidenceMatch(value,field,row={},raw='',evidenceSources=[]){
    if(value===null||value===undefined||value==='')return {found:false,source:'',page:null,line:null,text:'',method:'blank'};
    const prov=row?.v7Provenance?.[field]||row?.provenance?.[field]||{};
    if(clean(prov.sourceText||''))return {found:true,source:clean(prov.source||row.source||'provenance'),page:prov.page??row.page??null,line:prov.rowId||row.rowId||null,text:clean(prov.sourceText),method:'provenance'};
    const sources=v703312kEvidenceTexts(raw,evidenceSources);
    const direct=field==='sku'||field==='serials',target=direct?compact(value):norm(String(value));
    const numericField=['quantity','unit_price','amount'].includes(field);
    for(const ev of sources){
      const lines=String(ev.text||'').replace(/\r/g,'').split('\n');
      let candidateIndexes=lines.map((_,i)=>i);
      if(numericField){
        const skuKey=compact(row.sku||''),nameWords=norm(row.item_name||row.description||'').split(' ').filter(w=>w.length>=4).slice(0,4),anchors=[];
        for(let i=0;i<lines.length;i++){const c=compact(lines[i]),n=norm(lines[i]);if((skuKey&&c.includes(skuKey))||(!skuKey&&nameWords.length>=2&&nameWords.filter(w=>n.includes(w)).length>=2))anchors.push(i);}
        if(anchors.length){const set=new Set();for(const a of anchors)for(let j=Math.max(0,a-2);j<=Math.min(lines.length-1,a+3);j++)set.add(j);candidateIndexes=[...set].sort((a,b)=>a-b);}
      }
      for(const i of candidateIndexes){
        const line=clean(lines[i]);if(!line)continue;const hay=direct?compact(line):norm(line);
        let matched=!!target&&hay.includes(target);
        if(!matched&&['quantity','unit_price','amount','subtotal','gst','total_amount'].includes(field)&&Number.isFinite(Number(value))){
          const n=Number(value),forms=[String(n),n.toFixed(2),n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})].map(x=>norm(x));matched=forms.some(x=>x&&hay.includes(x));
        }
        if(matched)return {found:true,source:ev.source||'evidence',page:ev.page??null,line:i+1,text:line.slice(0,320),method:numericField?'row-local-source-line':'source-line'};
      }
    }
    return {found:false,source:'',page:null,line:null,text:'',method:'not-found'};
  }
  function v703314nConfidence(score,reason,evidence={}){
    const s=score===null?null:Math.max(0,Math.min(.99,Number(score)||0));return {score:s,label:s===null?'optional':s>=.95?'high':s>=.75?'medium':'low',reason,evidence};
  }
  function v703314nFieldQuality(row={},raw='',evidenceSources=[]){
    const arithmetic=v703314nLineArithmetic(row),layer2=row.v703312kLevel2?.status||row.verification?.layers?.layer2?.status||'unavailable',out={};
    const review=(field)=>field==='unit_price'?row.priceReviewRequired:field==='amount'?row.amountReviewRequired:field==='quantity'?row.quantityReviewRequired:field==='sku'?row.skuReviewRequired:field==='serials'?row.serialReviewRequired:false;
    for(const field of ['sku','item_name','quantity','unit_price','amount','serials']){
      const value=row[field],ev=v703314nEvidenceMatch(value,field,row,raw,evidenceSources);
      if((value===null||value===undefined||value==='')&&(field==='serials'||field==='sku'||field==='unit_price'||field==='amount')){out[field]=v703314nConfidence(null,field==='serials'?'Serial number is optional and blank.':field==='sku'?'SKU/model is optional when not printed on the invoice.':'Optional economic field is blank.',ev);continue;}
      if(value===null||value===undefined||value===''){out[field]=v703314nConfidence(0,'Required field is blank.',ev);continue;}
      let score=ev.found?.90:.58,reason=ev.found?'Value is traceable to invoice evidence.':'Value is not directly traceable to a retained source line.';
      if(field==='sku'&&credibleSku(value,v703312jRowText(row))&&ev.found){score=.98;reason='Credible SKU/model is directly supported by invoice evidence.';}
      if(field==='item_name'&&ev.found)score=.94;
      if(field==='item_name'&&!ev.found&&credibleSku(row.sku||'',v703312jRowText(row))){score=Math.max(score,.78);reason='Standard Item Name is normalized from a row with verified SKU/model evidence.';}
      if(['quantity','unit_price','amount'].includes(field)&&arithmetic.status==='pass'){if(ev.found){score=Math.max(score,.97);reason+=' Row arithmetic also agrees.';}else{score=Math.max(score,.70);reason+=' Row arithmetic agrees, but direct source evidence is still weak.';}}
      if(['quantity','unit_price','amount'].includes(field)&&arithmetic.status==='review'){score=Math.min(score,.35);reason='Row arithmetic conflicts; human verification is required.';}
      if(field==='serials'&&ev.found){const count=String(value).split(/[,;\n]+/).map(clean).filter(Boolean).length,q=Number(row.quantity);score=Number.isInteger(q)&&q>0&&count<=q?.96:.84;reason=count&&Number.isInteger(q)&&count<=q?'Serial evidence is printed and serial count does not exceed Qty.':'Serial evidence is printed but count/ownership needs review.';}
      if(layer2==='confirmed')score=Math.min(.99,score+.02);
      if(review(field)||row.v703312kIndependentConflict){score=Math.min(score,.45);reason+=' Existing verification flags require review.';}
      out[field]=v703314nConfidence(score,reason,ev);
    }
    return {fields:out,arithmetic};
  }
  function v703314nDocumentQuality(doc={},raw='',evidenceSources=[],incoming=[]){
    const fields={};for(const field of ['supplier_name','invoice_number','invoice_date','subtotal','gst','total_amount']){
      const value=field==='total_amount'?(doc.total_amount??doc.total):doc[field],ev=v703314nEvidenceMatch(value,field,doc,raw,evidenceSources);
      if(value===null||value===undefined||value===''){fields[field]=v703314nConfidence(null,'Document field is unavailable; no value was invented.',ev);continue;}
      let score=ev.found?.94:.62,reason=ev.found?'Document field is traceable to invoice evidence.':'Document field lacks direct retained-line evidence.';
      if(field==='invoice_number'&&ev.found&&!doc.invoiceNumberReviewRequired){score=.99;reason='Invoice number is directly supported by invoice evidence.';}if(field==='supplier_name'&&ev.found)score=.97;if(['subtotal','gst','total_amount'].includes(field)&&ev.found)score=.97;fields[field]=v703314nConfidence(score,reason,ev);
    }return {fields,arithmetic:v703314nDocumentArithmetic(doc,incoming)};
  }
  function v703314nApplyQualityGuards(parsed={},raw='',context={}){
    const evidenceSources=context.evidenceSources||[],incoming=context.incoming||[],rows=(parsed.items||[]).map(r=>({...r})),reviews=[];
    const items=rows.map((row,i)=>{const q=v703314nFieldQuality(row,raw,evidenceSources),r={...row,v703314nFieldConfidence:q.fields,v703314nArithmetic:q.arithmetic};if(q.arithmetic.status==='review'){r.quantityReviewRequired=true;r.priceReviewRequired=true;r.amountReviewRequired=true;r.humanReviewRequired=true;r.needsReview=true;r.v7033ReviewFields={...(r.v7033ReviewFields||{}),quantity:true,unit_price:true,amount:true};reviews.push({rowId:r.rowId||r.v7RowId||String(i+1),reason:'Qty × Unit Price does not agree with Amount.',fields:{quantity:true,unit_price:true,amount:true}});}return r;});
    const document=v703314nDocumentQuality(parsed.doc||{},raw,evidenceSources,incoming);
    if(document.arithmetic.subtotal_gst_total.status==='review')reviews.push({rowId:'invoice',reason:'Subtotal + GST does not agree with Total.',fields:{subtotal:true,gst:true,total_amount:true}});
    const lowRequired=[];for(const [i,r] of items.entries()){for(const field of ['item_name','quantity']){const c=r.v703314nFieldConfidence?.[field];if(c&&c.score!==null&&c.score<.75)lowRequired.push({rowId:r.rowId||r.v7RowId||String(i+1),field,score:c.score});}const skuC=r.v703314nFieldConfidence?.sku;if(clean(r.sku||'')&&skuC&&skuC.score!==null&&skuC.score<.75)lowRequired.push({rowId:r.rowId||r.v7RowId||String(i+1),field:'sku',score:skuC.score});}
    return {items,document,reviewRows:reviews,lowRequired,humanReviewRequired:reviews.length>0||lowRequired.length>0,summary:{version:VERSION,generated_at:new Date().toISOString(),document,rows:items.map(r=>({rowId:r.rowId||r.v7RowId||'',sku:r.sku,item_name:r.item_name,confidence:r.v703314nFieldConfidence,arithmetic:r.v703314nArithmetic})),reviewRows:reviews,lowRequired}};
  }
  function runQualityRegressionChecks14n(){
    const cases=[];const check=(name,pass,actual,expected)=>cases.push({name,pass:!!pass,actual,expected});
    const good={sku:'TEST-100',item_name:'Test projector',quantity:2,unit_price:350,amount:700},bad={sku:'TEST-100',item_name:'Test projector',quantity:8,unit_price:350,amount:700};
    const goodA=v703314nLineArithmetic(good),badA=v703314nLineArithmetic(bad);check('row arithmetic accepts valid economics',goodA.status==='pass',goodA,'pass');check('row arithmetic catches mismatched quantity',badA.status==='review',badA,'review');
    const docGood=v703314nDocumentArithmetic({subtotal:700,gst:63,total_amount:763},[{amount:700}]),docBad=v703314nDocumentArithmetic({subtotal:700,gst:63,total_amount:900},[{amount:700}]);check('document arithmetic accepts subtotal plus GST',docGood.subtotal_gst_total.status==='pass',docGood.subtotal_gst_total,'pass');check('document arithmetic catches total mismatch',docBad.subtotal_gst_total.status==='review',docBad.subtotal_gst_total,'review');
    const raw='TAX INVOICE\nTEST-100 Test projector 2 350.00 700.00\nSubtotal 700.00\nGST 63.00\nTotal 763.00',applied=v703314nApplyQualityGuards({doc:{subtotal:700,gst:63,total_amount:763},items:[good]},raw,{incoming:[good],evidenceSources:[{source:'fixture',text:raw}]});
    check('evidence trace finds printed SKU',applied.items[0].v703314nFieldConfidence.sku.evidence.found===true,applied.items[0].v703314nFieldConfidence.sku.evidence,'found');check('arithmetic plus evidence raises economics confidence',applied.items[0].v703314nFieldConfidence.quantity.score>=.95,applied.items[0].v703314nFieldConfidence.quantity,'>=0.95');check('optional blank serial is not treated as an error',applied.items[0].v703314nFieldConfidence.serials.score===null,applied.items[0].v703314nFieldConfidence.serials,'optional/null');
    const noSku=v703314nApplyQualityGuards({doc:{},items:[{sku:'',item_name:'Projector controller',quantity:1}]},'Projector controller 1',{incoming:[{sku:'',item_name:'Projector controller',quantity:1}],evidenceSources:[]});check('missing SKU remains optional',noSku.lowRequired.every(x=>x.field!=='sku'),noSku.lowRequired,'no sku review solely because blank');
    const weak=v703314nApplyQualityGuards({doc:{},items:[{sku:'TEST-200',item_name:'Test mixer',quantity:2,unit_price:50,amount:100}]},'Unrelated invoice text',{incoming:[],evidenceSources:[]});check('arithmetic alone cannot create high confidence',weak.items[0].v703314nFieldConfidence.quantity.score<.95,weak.items[0].v703314nFieldConfidence.quantity,'<0.95');
    const guarded=v703314nApplyQualityGuards({doc:{},items:[bad]},'TEST-100 Test projector 8 350.00 700.00',{incoming:[bad],evidenceSources:[]});check('arithmetic mismatch forces review flags',guarded.items[0].quantityReviewRequired&&guarded.items[0].priceReviewRequired&&guarded.items[0].amountReviewRequired,guarded.items[0].v7033ReviewFields,'quantity/unit_price/amount review');check('mismatch never silently changes values',guarded.items[0].quantity===8&&guarded.items[0].unit_price===350&&guarded.items[0].amount===700,{quantity:guarded.items[0].quantity,unit_price:guarded.items[0].unit_price,amount:guarded.items[0].amount},bad);
    const subtotalAdvisory=v703314nDocumentArithmetic({subtotal:800,gst:72,total_amount:872},[{amount:700}]);check('line-sum mismatch is advisory only',subtotalAdvisory.line_sum_subtotal.status==='review'&&subtotalAdvisory.line_sum_subtotal.advisory===true,subtotalAdvisory.line_sum_subtotal,'review/advisory');
    return {ok:cases.every(x=>x.pass),version:VERSION,cases,failures:cases.filter(x=>!x.pass).map(x=>x.name)};
  }
  function runHoldoutRegressionChecks14n(){
    const cases=[];const check=(name,pass,actual,expected)=>cases.push({name,pass:!!pass,actual,expected});
    const loudDoc=v703314nDocumentArithmetic({subtotal:3600,gst:324,total_amount:3924},[{amount:1360},{amount:480},{amount:340},{amount:270},{amount:1100},{amount:50}]);check('holdout multi-line invoice totals reconcile',loudDoc.subtotal_gst_total.status==='pass'&&loudDoc.line_sum_subtotal.status==='pass',loudDoc,'pass/pass');
    const service=v703312jIsServiceRow({sku:'DEL',item_name:'Delivery Services with return Trip for Signed Delivery Order',quantity:1,unit_price:50,amount:50});check('holdout delivery row remains service',service===true,service,true);
    const bundle=v703312jIsServiceRow({sku:'PT-TW381R',item_name:'Panasonic PT-TW381R Short Throw Projector',description:'Professional Services including dismantle, installation, testing and commissioning',quantity:1,unit_price:4820,amount:4820});check('holdout bundled equipment remains inventory candidate',bundle===false,bundle,false);
    const noSku=v703314nApplyQualityGuards({doc:{},items:[{sku:'',item_name:'Lighting controller',quantity:1,unit_price:100,amount:100}]},'Lighting controller 1 100.00 100.00',{incoming:[{item_name:'Lighting controller',quantity:1,unit_price:100,amount:100}],evidenceSources:[]});check('holdout no-SKU equipment is not rejected for missing SKU',noSku.lowRequired.every(x=>x.field!=='sku'),noSku.lowRequired,'no sku low-required');
    const spec=v703314nLineArithmetic({sku:'P-5000',item_name:'5000 lumens projector',quantity:5000,unit_price:700,amount:700});check('holdout specification-as-quantity is caught economically',spec.status==='review',spec,'review');
    const serialOptional=v703314nFieldQuality({sku:'MIC-1',item_name:'Microphone',quantity:1,unit_price:100,amount:100,serials:''},'MIC-1 Microphone 1 100.00 100.00',[]);check('holdout blank serial stays optional',serialOptional.fields.serials.score===null,serialOptional.fields.serials,'optional');
    return {ok:cases.every(x=>x.pass),version:VERSION,cases,failures:cases.filter(x=>!x.pass).map(x=>x.name)};
  }

  function applyParsedFixes(parsed={},raw='',evidenceSources=[]){
    if(!parsed||typeof parsed!=='object')return parsed;
    const source=String(raw||parsed.raw||parsed.rawText||'');
    const incoming=[...(parsed.items||[])];
    const excludedService=incoming.filter(v703312jIsServiceRow),excludedAccessory=incoming.filter(v703312jIsAccessoryRow);
    const trackedIncoming=incoming.filter(r=>!v703312jIsServiceRow(r)&&!v703312jIsAccessoryRow(r));
    const fixed=trackedIncoming.map(r=>validateSkuQtyEvidence(fixRow(r,source),source));
    const evidence14p=v703312kEvidenceTexts(source,evidenceSources);
    let recovered=v703312jRecoverNumberedEquipmentRows(source,evidenceSources);
    if(!fixed.length&&!recovered.length){const extra=[];for(const ev of evidence14p)extra.push(...v703314pRecoverEquipmentRows(ev.text,ev.source));recovered=dedupeParsedLineItems(extra);}
    const merged=v703312jMergeTrackedRows(fixed,recovered,source);
    let doc14p=fixDocumentHeader(parsed.doc||{},evidence14p.map(x=>x.text).join('\n'));doc14p=v703314pReconcileHeader(doc14p,evidence14p);
    const out={...parsed,doc:doc14p,items:merged};
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
    const quality14n=v703314nApplyQualityGuards(out,source,{incoming,excludedService,excludedAccessory,recovered,evidenceSources});
    out.items=quality14n.items;out.v703314nQuality=quality14n.summary;
    if(quality14n.reviewRows.length){const vr={...(v7.verification||{})};vr.humanReviewRows=dedupeReviewRows([...(vr.humanReviewRows||[]),...quality14n.reviewRows]);vr.humanReviewRequired=true;v7.verification=vr;}
    const rowNeed=out.items.some(r=>r.humanReviewRequired===true||explicitReviewFlag(r)||Object.keys(r.v7033ReviewFields||{}).length>0)||quality14n.humanReviewRequired;
    v7.humanReviewRequired=!!(rowNeed||v7.verification?.humanReviewRequired||comp.recheckRequired);
    v7.patchVersion=VERSION;v7.baselineVersion=BASELINE_VERSION;out.v7=v7;
    if(out.parseEvidence?.v7)out.parseEvidence={...out.parseEvidence,v7};
    out.v703312kVerification.level3Required=v7.humanReviewRequired;
    out.v703314lDiagnostics=buildParserDiagnostics14l(out,source,{incoming,excludedService,excludedAccessory,recovered,evidenceSources});
    return out;
  }

  function normalizedItemIdentity(v=''){
    return norm(v)
      .replace(/\b(?:the|a|an|supply|install|installation|dismantle|dismantled|dismantling|dismount|dismounted|dismounting|commissioning|service|services|labour|labor|with|for|in pair|pair)\b/g,' ')
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
  function analyzeDuplicatePair(a={},b={},items=[]){
    const skuA=clean(a.sku||''),skuB=clean(b.sku||''),keyA=compact(skuA),keyB=compact(skuB);
    if(!keyA||!keyB||keyA!==keyB)return {candidate:false,mergeEligible:false,reason:'different-sku-identity',score:0,blockers:[],warnings:[],a,b};
    const exact=skuA.toLowerCase()===skuB.toLowerCase();
    const catA=norm(a.category||''),catB=norm(b.category||'');
    const blockers=[],warnings=[];
    if(catA&&catB&&catA!==catB)blockers.push('Categories conflict: '+clean(a.category)+' vs '+clean(b.category)+'.');
    const sameKey=(items||[]).filter(i=>compact(i.sku||'')===keyA);
    if(sameKey.length>2)blockers.push('More than two Master Items share this SKU identity. Review the full duplicate group first.');
    const nameA=normalizedItemIdentity(a.item_name||a.description||''),nameB=normalizedItemIdentity(b.item_name||b.description||'');
    if(nameA&&nameB&&nameA!==nameB)warnings.push('Item names differ. Confirm both records refer to the same physical model before merging.');
    return {
      candidate:true,
      mergeEligible:blockers.length===0,
      reason:exact?'exact-sku':'format-normalized-sku',
      confidence:exact?'exact':'high',
      score:exact?1:0.98,
      normalizedSku:keyA,
      blockers,
      warnings,
      a,b
    };
  }

  function duplicateCandidates(items=[]){
    const out=[],rows=items||[];
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
      const candidate=analyzeDuplicatePair(rows[i],rows[j],rows);
      if(candidate.candidate)out.push(candidate);
    }
    return out;
  }

  function safeDuplicateGroups(items=[]){
    const groups=new Map();
    for(const i of items||[]){const k=compact(i.sku||'');if(!k)continue;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);}
    const out=[];
    for(const [key,rows] of groups){
      if(rows.length!==2)continue;
      const analysis=analyzeDuplicatePair(rows[0],rows[1],items);
      if(!analysis.candidate||!analysis.mergeEligible)continue;
      const canonical=rows.slice().sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')))[0]||rows[0];
      out.push({key,canonical,duplicates:rows.filter(x=>x!==canonical),verifiedSku:clean(canonical.sku||''),analysis});
    }
    return out;
  }

  function runRegressionChecks(){
    const cases=[];const check=(name,actual,expected=true)=>{const pass=typeof expected==='function'?!!expected(actual):actual===expected;cases.push({name,pass,actual,expected:typeof expected==='function'?'predicate':expected});return pass;};
    check('delivery fee is service',v703312jIsServiceRow({item_name:'Delivery Fee'}),true);
    check('installation is service',v703312jIsServiceRow({item_name:'Installation work'}),true);
    check('dismantle-only row is service',v703312jIsServiceRow({item_name:'Dismantle existing projector'}),true);
    check('dismount-only row is service',v703312jIsServiceRow({item_name:'Dismount existing projector'}),true);
    check('SKU-tagged dismantle action remains service',v703312jIsServiceRow({sku:'PT-TW381R',item_name:'Dismantle existing PT-TW381R projector'}),true);
    check('verified equipment survives bundled service text',v703312jIsServiceRow({sku:'PT-TW381R',item_name:'Panasonic PT-TW381R Short Throw Projector',description:'Professional Services including dismantle of existing projectors, installation, testing and commissioning'}),false);
    check('HDMI cable is accessory',v703312jIsAccessoryRow({item_name:'HDMI Cable'}),true);
    const avsRaw='PRODUCT NO. DESCRIPTION QUANTITY UNIT PRICE AMOUNT\nAVS-320 Supply Abtus AVS-320 projector controller 2 350.00 700.00';
    const avs=fixRow({sku:'AVS-320',item_name:'Supply Abtus AVS-320 projector controller',description:'Supply Abtus AVS-320 projector controller',quantity:2,unit_price:350,amount:700},avsRaw);
    check('AVS-320 identity preserved',avs.sku==='AVS-320'&&/projector controller/i.test(avs.item_name||''),true);
    const p60Raw='PRODUCT NO. DESCRIPTION QUANTITY UNIT PRICE AMOUNT\nP60 Voxoa P60 media player 1 100.00 100.00';
    const p60=fixRow({sku:'P80',item_name:'Voxoa media player',description:'Voxoa media player',quantity:1,unit_price:100,amount:100},p60Raw);
    check('unsupported P80 corrected to printed P60',p60.sku,'P60');
    const unrelated=fixRow({sku:'PT-VW540',item_name:'Panasonic Projector',description:'Panasonic Projector',quantity:1,unit_price:1000,amount:1000},'PRODUCT NO. DESCRIPTION\nSW12-120E Power Adaptor For HDMI Panel 12V\nPanasonic Projector');
    check('unrelated global model cannot hijack credible row',unrelated.sku,'PT-VW540');
    const d=dedupeParsedLineItems([{sku:'PT-VW540',item_name:'Projector',quantity:1,unit_price:804,amount:804,serials:'DC2210037'},{sku:'PT-VW540',item_name:'Projector',quantity:1,unit_price:804,amount:804,serials:'DC2210037'},{sku:'PT-VW540',item_name:'Projector',quantity:1,unit_price:804,amount:804,serials:'DIFFERENT'}]);
    check('dedupe removes exact duplicate only',d.length,2);
    const match=resolveInventoryMatch({sku:'AVS320',item_name:'AVS-320 projector controller'},[{id:'1',sku:'AVS-320',item_name:'AVS-320 projector controller',category:'AV Control'}]);
    check('format-equivalent SKU reuses existing item',!!match.matched&&match.line?.sku==='AVS-320',true);
    const invoice='TAX INVOICE\nInvoice Number INV-1001\nInvoice Date 24 Sep 2026\nDelivery Order Number D100\nDescription Quantity Unit Price Amount\nPT-TW381R Projector 1 1000.00 1000.00\nSubtotal 1000.00\nGST 90.00\nTotal 1090.00';
    check('invoice remains valid with delivery-order reference',classifyInvoicePage(invoice).allowed,true);
    check('current and upcoming versions differ',RELEASE_UPCOMING_VERSION!==VERSION,true);
    return {ok:cases.every(x=>x.pass),version:VERSION,upcoming:RELEASE_UPCOMING_VERSION,cases,failures:cases.filter(x=>!x.pass).map(x=>x.name)};
  }


  function v703314lRowDecision(row={}){
    const text=v703312jRowText(row);
    if(v703312jIsServiceRow(row))return {classification:'service-excluded',reason:'Service/work language matched and no protected equipment identity applies.',text};
    if(v703312jIsAccessoryRow(row))return {classification:'accessory-excluded',reason:'Accessory/support identity matched the exclusion rules.',text};
    if(v703312jIsTrackedEquipment(row)||credibleSku(row.sku||'',text))return {classification:'tracked-candidate',reason:'Equipment type and/or credible printed SKU/model evidence is present.',text};
    return {classification:'unclassified',reason:'No service/accessory exclusion and no strong equipment identity was established.',text};
  }
  function buildParserDiagnostics14l(parsed={},raw='',context={}){
    const source=String(raw||parsed?.raw||parsed?.rawText||''),incoming=[...(context.incoming||[])],items=[...(parsed?.items||[])];
    const classification=classifyInvoicePage(source),doc=parsed?.doc||{},v7=parsed?.v7||parsed?.parseEvidence?.v7||{},comp=v7.completenessValidation||{},verify=parsed?.v703312kVerification||{};
    const decisionRows=incoming.map((r,i)=>({index:i+1,sku:clean(r.sku||''),item_name:clean(r.item_name||''),quantity:r.quantity??null,...v703314lRowDecision(r)}));
    const finalItems=items.map((r,i)=>({index:i+1,sku:clean(r.sku||''),item_name:clean(r.item_name||''),quantity:r.quantity??null,unit_price:r.unit_price??null,amount:r.amount??null,identity:{...(r.v7033Identity||{})},line_evidence:{...(r.v703312LineEvidence||{})},field_confidence:{...(r.v703314nFieldConfidence||{})},arithmetic:{...(r.v703314nArithmetic||{})},level1:r.v703312kLevel1||verify.level1?.[i]||null,level2:r.v703312kLevel2||verify.level2?.[i]||null,review_fields:{...(r.v7033ReviewFields||{})},human_review_required:!!(r.humanReviewRequired||r.needsReview||Object.keys(r.v7033ReviewFields||{}).length)}));
    const excludedService=[...(context.excludedService||[])],excludedAccessory=[...(context.excludedAccessory||[])],recovered=[...(context.recovered||[])];
    const level3=!!(verify.level3Required||v7.humanReviewRequired||comp.recheckRequired||finalItems.some(x=>x.human_review_required));
    const status=!classification.allowed?'BLOCK':(!items.length?'BLOCK':(level3?'REVIEW':'PASS'));
    const reasons=[];
    if(!classification.allowed)reasons.push('Document classification did not establish an Invoice / Tax Invoice.');
    if(classification.reviewRequired)reasons.push('Document-title evidence requires review.');
    if(excludedService.length)reasons.push(excludedService.length+' service/work row(s) excluded.');
    if(excludedAccessory.length)reasons.push(excludedAccessory.length+' accessory/support row(s) excluded.');
    if(recovered.length)reasons.push(recovered.length+' equipment row(s) recovered from OCR/table evidence.');
    if(level3)reasons.push('Level 3 review is still required for unresolved evidence.');
    if(!reasons.length)reasons.push('Parser evidence is internally consistent.');
    return {version:VERSION,generated_at:new Date().toISOString(),overall_status:status,patch_focus:'Golden invoices + evidence tracing + arithmetic validation + field confidence + OCR preprocessing + holdout testing',quality14n:parsed.v703314nQuality||null,source:{character_count:source.length,line_count:source?source.split(/\r?\n/).length:0,evidence_source_count:(context.evidenceSources||[]).length,evidence_sources:(context.evidenceSources||[]).map((x,i)=>String(x?.source||('evidence-'+(i+1))))},document:{classification:{allowed:classification.allowed,disposition:classification.disposition,type:classification.type,reason:classification.reason,review_required:classification.reviewRequired,score:classification.score,evidence:classification.evidence},header:{supplier_name:doc.supplier_name||'',invoice_number:doc.invoice_number||'',invoice_date:doc.invoice_date||'',delivery_order_number:doc.delivery_order_number||'',reference:doc.reference||doc.reference_number||'',currency:doc.currency||'',subtotal:doc.subtotal??null,gst:doc.gst??null,total_amount:doc.total_amount??doc.total??null},corrections:{invoice_number_corrected_from:doc.v7033InvoiceNumberCorrectedFrom||'',invoice_number_review_required:!!doc.invoiceNumberReviewRequired}},filtering:{incoming_count:incoming.length,tracked_count:items.length,excluded_service_count:excludedService.length,excluded_accessory_count:excludedAccessory.length,recovered_equipment_count:recovered.length,incoming_rows:decisionRows},final_items:finalItems,verification:{level3_required:level3,completeness:comp,level1:verify.level1||[],level2:verify.level2||[]},decision_reasons:reasons};
  }
  function runHistoricalRegressionChecks(){
    const cases=[];const add=cfg=>{const actual=cfg.run(),pass=!!cfg.pass(actual);cases.push({id:cfg.id,source_files:cfg.source_files,source_kind:'historical-source-excerpt',expected:cfg.expected,actual,evidence:cfg.evidence(actual),pass,reason:pass?cfg.pass_reason:(cfg.fail_reason(actual)||'Actual parser result did not match the historical expectation.')});};
    add({id:'avs-320-vin17-049472',source_files:['VIN17-049472(signed).pdf','VIN17-049472(signed)(1).pdf'],expected:{final_skus:['AVS-320'],service_excluded:1,accessory_excluded:1},run:()=>{const raw='PRODUCT NO. DESCRIPTION QUANTITY UNIT PRICE AMOUNT\nAVS-320 Supply Abtus AVS-320 projector controller 2 350.00 700.00\nS/N: 320-T1-11638,320-T1-11639\nSALES - INSTALLATION Installation: 2 750.00 1,500.00\nCHD-AG28-2.0M/M-3R ABtUS HDMI Cable Round AWG28 M-M 3M V2.0 2\nTAX INVOICE\nInvoice No.: VIN17-049472';return applyParsedFixes({doc:{},items:[{sku:'AVS-320',item_name:'Supply Abtus AVS-320 projector controller',description:'Supply Abtus AVS-320 projector controller',quantity:2,unit_price:350,amount:700,serials:'320-T1-11638,320-T1-11639'},{sku:'SALES-INSTALLATION',item_name:'Installation',description:'Installation',quantity:2,unit_price:750,amount:1500},{sku:'CHD-AG28-2.0M/M-3R',item_name:'ABtUS HDMI Cable Round AWG28 M-M 3M V2.0',description:'ABtUS HDMI Cable Round AWG28 M-M 3M V2.0',quantity:2}]},raw);},pass:x=>x.items.length===1&&x.items[0]?.sku==='AVS-320'&&x.v703312jInventoryFilter?.excludedServiceCount===1&&x.v703312jInventoryFilter?.excludedAccessoryCount===1,evidence:x=>({final_items:x.items.map(i=>({sku:i.sku,item_name:i.item_name})),filter:x.v703312jInventoryFilter,diagnostics:x.v703314lDiagnostics}),pass_reason:'AVS-320 equipment is retained while installation and HDMI cable rows are excluded.',fail_reason:x=>'Expected only AVS-320; got '+x.items.map(i=>i.sku||i.item_name).join(', ')});
    add({id:'aerospace-2022',source_files:['INV-Aerospace.pdf','INV-Aerospace(1).pdf','12-08-2022-AV-Media-Pte-Ltd.pdf'],expected:{must_include:['PT-VW540','AVS320'],must_exclude:'installation work'},run:()=>{const raw='TAX INVOICE\nPT-VW540\nAVS320\nPanasonic PT-VW540 projector\n5000 ANSI lumens\nSN: DC2210037\nAbtus AVS320 HDMI Control panel\nS/N: 320-T1-08078\nInstallation work including:\nSupply and install bracket for projector\ntesting and commission';return applyParsedFixes({doc:{},items:[{sku:'PT-VW540',item_name:'Panasonic PT-VW540 projector',description:'Panasonic PT-VW540 projector 5000 ANSI lumens',quantity:1,unit_price:804,amount:804,serials:'DC2210037'},{sku:'AVS320',item_name:'Abtus AVS320 HDMI Control panel',description:'Abtus AVS320 HDMI Control panel',quantity:1,unit_price:350,amount:350,serials:'320-T1-08078'},{sku:'',item_name:'Installation work including supply and install bracket for projector',description:'Installation work including supply and install bracket for projector',quantity:1,unit_price:530,amount:530}]},raw);},pass:x=>x.items.some(i=>i.sku==='PT-VW540')&&x.items.some(i=>i.sku==='AVS320')&&x.items.every(i=>!/installation work/i.test(i.item_name||'')),evidence:x=>({final_items:x.items.map(i=>({sku:i.sku,item_name:i.item_name,identity:i.v7033Identity})),filter:x.v703312jInventoryFilter,diagnostics:x.v703314lDiagnostics}),pass_reason:'Credible PT-VW540 and AVS320 identities survive noisy OCR while installation work is excluded.',fail_reason:x=>'Aerospace identities/filtering differ: '+x.items.map(i=>(i.sku||'')+' '+(i.item_name||'')).join(' | ')});
    add({id:'loud-pga58-00215542',source_files:['Invoice INV LTA-00215542_Signed.pdf','Invoice INV LTA-00215542_Signed(1).pdf','Invoice INV LTA-00215542_Signed(2).pdf'],expected:{final_skus:['PGA58-LC'],delivery_excluded:true},run:()=>{const raw='TAX INVOICE\nInvoice Number INV LTA-00215542\nSHURE PGA58-LC Cardioid Dynamic Vocal Microphone\n10.00 64.69 646.90\nDelivery Services with return Trip for Signed Delivery Order\n1.00 45.00 45.00';return applyParsedFixes({doc:{},items:[{sku:'PGA58-LC',item_name:'SHURE PGA58-LC Cardioid Dynamic Vocal Microphone',description:'SHURE PGA58-LC Cardioid Dynamic Vocal Microphone',quantity:10,unit_price:64.69,amount:646.90},{sku:'',item_name:'Delivery Services with return Trip for Signed Delivery Order',description:'Delivery Services with return Trip for Signed Delivery Order',quantity:1,unit_price:45,amount:45}]},raw);},pass:x=>x.items.length===1&&x.items[0]?.sku==='PGA58-LC'&&x.v703312jInventoryFilter?.excludedServiceCount===1,evidence:x=>({final_items:x.items.map(i=>({sku:i.sku,item_name:i.item_name})),filter:x.v703312jInventoryFilter,diagnostics:x.v703314lDiagnostics}),pass_reason:'PGA58-LC remains inventory and delivery service is excluded.',fail_reason:x=>'Expected PGA58-LC only; got '+x.items.map(i=>i.sku||i.item_name).join(', ')});
    add({id:'loud-mixed-00215840',source_files:['Invoice INV LTA-00215840_Signed.pdf'],expected:{retain:['U35C','SLXD2+','AT-2','U3'],delivery_excluded:true},run:()=>{const raw='TAX INVOICE\nInvoice Number INV LTA-00215840\nXVive U35C Wireless System for Condenser Microphones 5.8GHz 4 340.00 1360.00\nShure SLXD2+ Digital Wireless Handheld Microphone Transmitter 1 480.00 480.00\nXVive AT-2 Portable Audio Tester 1 270.00 270.00\nXvive Audio U3 2.4 GHz Digital Wireless Microphone System 4 275.00 1100.00\nDEL, Delivery Services with return Trip for Signed Delivery Order 1 50.00 50.00';return applyParsedFixes({doc:{},items:[{sku:'U35C',item_name:'XVive U35C Wireless System for Condenser Microphones 5.8GHz',description:'XVive U35C Wireless System for Condenser Microphones 5.8GHz',quantity:4,unit_price:340,amount:1360},{sku:'SLXD2+',item_name:'Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter',description:'Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter',quantity:1,unit_price:480,amount:480},{sku:'AT-2',item_name:'XVive AT-2 Portable Audio Tester',description:'XVive AT-2 Portable Audio Tester',quantity:1,unit_price:270,amount:270},{sku:'U3',item_name:'Xvive Audio U3 Digital Wireless Microphone System',description:'Xvive Audio U3 Digital Wireless Microphone System',quantity:4,unit_price:275,amount:1100},{sku:'DEL',item_name:'Delivery Services with return Trip for Signed Delivery Order',description:'Delivery Services with return Trip for Signed Delivery Order',quantity:1,unit_price:50,amount:50}]},raw);},pass:x=>['U35C','SLXD2+','AT-2','U3'].every(z=>x.items.some(i=>i.sku===z))&&x.items.every(i=>i.sku!=='DEL'),evidence:x=>({final_items:x.items.map(i=>({sku:i.sku,item_name:i.item_name})),filter:x.v703312jInventoryFilter,diagnostics:x.v703314lDiagnostics}),pass_reason:'Four equipment identities remain while the delivery line is removed.',fail_reason:x=>'Mixed Loud invoice retained/excluded rows differ: '+x.items.map(i=>i.sku||i.item_name).join(', ')});
    add({id:'jny-rds-2021',source_files:['INV-RDSMar21.pdf'],expected:{sku:'PT-TW381R',clean_name:true,invoice_allowed:true},run:()=>{const raw='Tax Invoice\nInvoice Number IV20210040\nDelivery Order Number D20210026\nAV Projection system replacement @ RDS Room3 & Room 5 including below hardware and services:\nPanasonic PT-TW381R Short Throw 3300 Lumens Projector\nProfessional Services including dismantle of existing projectors,\ninstallation of new projectors, HDMI cabling works,\nTesting & Commissioning';return applyParsedFixes({doc:{},items:[{sku:'PT-TW381R',item_name:'Panasonic PT-TW381R Short Throw 3300 Lumens Projector',description:'Panasonic PT-TW381R Short Throw 3300 Lumens Projector. Professional Services including dismantle of existing projectors, installation of new projectors, Testing & Commissioning',quantity:1,unit_price:4820,amount:4820}]},raw);},pass:x=>x.items.length===1&&x.items[0]?.sku==='PT-TW381R'&&!/dismant|dismount|installation|commissioning/i.test(x.items[0]?.item_name||'')&&x.v703314lDiagnostics?.document?.classification?.allowed===true,evidence:x=>({final_items:x.items.map(i=>({sku:i.sku,item_name:i.item_name})),classification:x.v703314lDiagnostics?.document?.classification,diagnostics:x.v703314lDiagnostics}),pass_reason:'Bundled projector remains tracked, work verbs stay out of Standard Item Name, and D/O reference does not reject the Tax Invoice.',fail_reason:x=>'JNY bundled-equipment behavior differs from expectation.'});
    add({id:'seminar-room-2021',source_files:['INV-SeminarRoom123.pdf','INV-SeminarRoom123(1).pdf'],expected:{must_include:['PT-VW540','SPS-1100'],no_bracket:true,no_unrelated_model_hijack:true},run:()=>{const raw='TAX INVOICE\nPT-VW540\nSPS-1100\nPanasonic Projector WXGA 5500 Lumens\nABTUS Active Speaker 20W\nSupply and install bracket for projector\nSW12-120E Power Adaptor For ABTUS AVS-318 HDMI Panel 12V 1A';return applyParsedFixes({doc:{},items:[{sku:'PT-VW540',item_name:'Panasonic Projector WXGA 5500 Lumens',description:'Panasonic Projector WXGA 5500 Lumens',quantity:2,unit_price:707,amount:1414},{sku:'SPS-1100',item_name:'ABTUS Active Speaker 20W',description:'ABTUS Active Speaker 20W',quantity:2,unit_price:90,amount:180},{sku:'',item_name:'Supply and install bracket for projector',description:'Supply and install bracket for projector',quantity:2,unit_price:0,amount:0}]},raw);},pass:x=>x.items.some(i=>i.sku==='PT-VW540')&&x.items.some(i=>i.sku==='SPS-1100')&&x.items.every(i=>!/bracket/i.test(i.item_name||''))&&!x.items.some(i=>/l2v/i.test(i.sku||'')),evidence:x=>({final_items:x.items.map(i=>({sku:i.sku,item_name:i.item_name,identity:i.v7033Identity})),filter:x.v703312jInventoryFilter,diagnostics:x.v703314lDiagnostics}),pass_reason:'Projector and speaker identities survive; bracket is excluded and unrelated OCR tokens do not hijack SKU/model.',fail_reason:x=>'Seminar identities/accessory filtering differ from expectation.'});
    add({id:'hawko-av-cart-2021',source_files:['INV-AVcart.pdf'],expected:{structured_asset_recovered:true},run:()=>{const raw='TAX INVOICE\nZS6HKOAV-EB97E METAL TROLLEY W C+S 2 550.00 1100.00\nAdjustable height 770-970mm\nLockable Security Cabinet with key\nSingle pull out shelf for PC keyboard\n4 caster wheels 2 locking\nSolid steel construction will not topple over\nSUBTOTAL 1100.00';return {raw,recovered:v703314aRecoverStructuredPricedAssetRows(raw,'historical-hawko')};},pass:x=>x.recovered.length===1&&compact(x.recovered[0]?.sku)==='ZS6HKOAVEB97E',evidence:x=>({recovered:x.recovered.map(i=>({sku:i.sku,item_name:i.item_name,quantity:i.quantity,amount:i.amount,structured:!!i.v703314aStructuredPricedAsset}))}),pass_reason:'Strongly evidenced priced trolley is recovered as a structured physical asset despite generic cart/trolley exclusions.',fail_reason:x=>'Expected one structured HAWKO trolley; recovered '+x.recovered.length+' with '+(x.recovered[0]?.sku||'no SKU')});
    add({id:'av-media-2023-reference-dedupe',source_files:['15-12-2023-AV-Media-Pte-Ltd.pdf'],expected:{reference_number:'VSO17-026212/V17-041821',tracked_skus:['PT-MZI7K','ET-EMT750','VS-442H2A','RC-208/UK','TP-583TXR','TP-583RXR'],tracked_count:6},run:()=>{
      const raw='TAX INVOICE\nInvoice No: VIN17-038478\nRef. No. VSO17-026212/V17-041821 DATE 15/12/23 P/O NO. PO/23/000056\nPT-MZI7K Replacement of AV Projector and control Panel 4 9,588.00 38,352.00\nET-EMT750 Projector Zoom Lens 4 3,080.00 12,320.00\nVS-442H2A Matrix Switcher 3 3,500.00 10,500.00\nRC-208/UK I/O Control Button Keypad 6 800.00 4,800.00\nTP-583TXR HDMI-HDBaseT Transmitter 8 590.00 4,720.00\nTP-583RXR Kramer 4K HDR HDMI Receiver 8 590.00 4,720.00\nSALES-INSTALLATION Cabling, Installation, Services 1 13,000.00 13,000.00\nSALES-INSTALLATION Cabling, Installation, Services 1 1,500.00 1,500.00';
      const items=[
        {sku:'',item_name:'PT-MZI7K Replacement of AV Projector and control Panel',description:'PT-MZI7K Replacement of AV Projector and control Panel',quantity:4,unit_price:9588,amount:38352},
        {sku:'',item_name:'and control Panel',description:'and control Panel',quantity:4,unit_price:9588,amount:38.35,amountReviewRequired:true},
        {sku:'PT-MZI7K',item_name:'Replacement of AV Projector and control Panel',description:'Replacement of AV Projector and control Panel',quantity:4,unit_price:9588,amount:38352},
        {sku:'ET-EMT750',item_name:'Projector Zoom Lens',description:'Projector Zoom Lens',quantity:4,unit_price:3080,amount:12320},
        {sku:'VS-442H2A',item_name:'Matrix Switcher',description:'Matrix Switcher',quantity:3,unit_price:3500,amount:10500},
        {sku:'RC-208/UK',item_name:'I/O Control Button Keypad',description:'I/O Control Button Keypad',quantity:6,unit_price:800,amount:4800},
        {sku:'TP-583TXR',item_name:'HDMI-HDBaseT Transmitter',description:'HDMI-HDBaseT Transmitter',quantity:8,unit_price:590,amount:4720},
        {sku:'TP-583RXR',item_name:'Kramer 4K HDR HDMI Receiver',description:'Kramer 4K HDR HDMI Receiver',quantity:8,unit_price:590,amount:4720},
        {sku:'SALES-INSTALLATION',item_name:'Cabling, Installation, Services',description:'Cabling, Installation, Services',quantity:1,unit_price:13000,amount:13000},
        {sku:'SALES-INSTALLATION',item_name:'Cabling, Installation, Services',description:'Cabling, Installation, Services',quantity:1,unit_price:1500,amount:1500}
      ];
      return applyParsedFixes({doc:{supplier_name:'AV Media Pte Ltd',invoice_number:'VIN17-038478',reference_number:'wrong-neighbour'},items},raw);
    },pass:x=>x.doc.reference_number==='VSO17-026212/V17-041821'&&x.items.length===6&&['PT-MZI7K','ET-EMT750','VS-442H2A','RC-208/UK','TP-583TXR','TP-583RXR'].every(s=>x.items.some(i=>compact(i.sku)===compact(s)))&&!x.items.some(i=>norm(i.item_name)==='and control panel'),evidence:x=>({reference_number:x.doc.reference_number,final_items:x.items.map(i=>({sku:i.sku,item_name:i.item_name,quantity:i.quantity,unit_price:i.unit_price,amount:i.amount}))}),pass_reason:'Labelled Reference No. wins over neighbouring header values; fragmented PT-MZI7K duplicates collapse while the keypad remains tracked.',fail_reason:x=>'Reference/duplicate/keypad regression differs: ref='+x.doc.reference_number+' rows='+x.items.map(i=>(i.sku||'No SKU')+' '+i.item_name).join(' | ')});
    const represented=cases.reduce((n,c)=>n+c.source_files.length,0);return {ok:cases.every(x=>x.pass),version:VERSION,generated_at:new Date().toISOString(),logical_cases:cases.length,represented_files:represented,cases,failures:cases.filter(x=>!x.pass).map(x=>x.id)};
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


  function v703314oSupplierKey(v=''){return norm(v).replace(/\b(?:pte|ltd|limited|private|co|company)\b/g,' ').replace(/\s+/g,' ').trim();}
  function v703314oEvidenceContains(raw='',value=''){const needle=compact(value);if(!needle||needle.length<2)return false;return compact(raw).includes(needle);}
  function v703314oCorrectionDecision(correction={},context={}){
    const status=norm(correction.status||''),field=clean(correction.field_name||correction.field||''),source=clean(correction.source_value||''),corrected=clean(correction.corrected_value||'');
    const supplierMatch=!correction.supplier_key||v703314oSupplierKey(correction.supplier_key)===v703314oSupplierKey(context.supplier_name||''),current=clean(context.current_value||''),raw=String(context.raw||''),autoFields=new Set(['sku','invoice_number']);
    const sourceMatch=field==='sku'||field==='invoice_number'?compact(source)===compact(current):norm(source)===norm(current),evidenceMatch=v703314oEvidenceContains(raw,corrected),autoApply=status==='approved'&&supplierMatch&&autoFields.has(field)&&!!source&&!!corrected&&sourceMatch&&evidenceMatch;
    return {autoApply,supplierMatch,sourceMatch,evidenceMatch,field,status,reason:autoApply?'Approved correction matches supplier/current value and corrected value is printed in invoice evidence.':status!=='approved'?'Correction is not approved.':!supplierMatch?'Supplier does not match.':!autoFields.has(field)?'This field is suggestion-only and cannot auto-apply.':!sourceMatch?'Current value does not match the learned source value.':!evidenceMatch?'Corrected value is not present in invoice evidence.':'Correction is not eligible.'};
  }
  function v703314oExtractProfileCandidate(raw='',labels=[],kind='invoice_number'){
    const lines=String(raw||'').replace(/\r/g,'').split('\n').map(clean),wanted=(labels||[]).map(x=>clean(x)).filter(Boolean);
    for(let i=0;i<lines.length;i++){const line=lines[i];if(!line)continue;for(const label of wanted){const escaped=label.split('').map(ch=>'\\^$.*+?()[]{}|'.includes(ch)?'\\'+ch:ch).join(''),re=new RegExp('^'+escaped+'\\s*[:#.-]?\\s*(.*)$','i'),m=line.match(re);if(!m)continue;let candidate=clean(m[1]||'');if(!candidate){for(let j=i+1;j<Math.min(lines.length,i+4);j++){if(lines[j]){candidate=lines[j];break;}}}if(kind==='invoice_number'){candidate=normalizeInvoiceNumberCandidate(candidate);if(candidate&&/\d/.test(candidate)&&candidate.length<=64)return {value:candidate,label,line:i+1,evidence:line};}else if(kind==='invoice_date'){const d=String(candidate||'').match(/\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b/);if(d)return {value:d[1],label,line:i+1,evidence:line};}}}
    return null;
  }
  function v703314oValidFingerprint(v=''){return /^[a-f0-9]{64}$/i.test(clean(v));}
  function runIntelligenceRegressionChecks14o(){
    const cases=[],check=(name,actual,expected=true)=>{const pass=typeof expected==='function'?!!expected(actual):actual===expected;cases.push({name,pass,actual,expected:typeof expected==='function'?'predicate':expected});},base={status:'approved',supplier_key:'AV Media',field_name:'sku',source_value:'P80',corrected_value:'P60'};
    check('approved printed SKU correction is eligible',v703314oCorrectionDecision(base,{supplier_name:'AV MEDIA PTE LTD',current_value:'P80',raw:'Voxoa P60 media player'}).autoApply,true);
    check('pending correction cannot auto-apply',v703314oCorrectionDecision({...base,status:'pending'},{supplier_name:'AV Media',current_value:'P80',raw:'P60'}).autoApply,false);
    check('supplier mismatch cannot auto-apply',v703314oCorrectionDecision(base,{supplier_name:'Other Supplier',current_value:'P80',raw:'P60'}).autoApply,false);
    check('unprinted correction cannot auto-apply',v703314oCorrectionDecision(base,{supplier_name:'AV Media',current_value:'P80',raw:'P80'}).autoApply,false);
    check('quantity memory is suggestion-only',v703314oCorrectionDecision({...base,field_name:'quantity',source_value:'8',corrected_value:'2'},{supplier_name:'AV Media',current_value:'8',raw:'Qty 2'}).autoApply,false);
    check('supplier profile extracts invoice number from following line',v703314oExtractProfileCandidate('TAX INVOICE\nInvoice Number\nINV-2048\nDescription Qty',['Invoice Number'],'invoice_number')?.value,'INV-2048');
    check('supplier profile rejects non-identifier invoice value',v703314oExtractProfileCandidate('Invoice Number\nAccounts Payable',['Invoice Number'],'invoice_number')===null,true);
    check('valid SHA-256 fingerprint accepted',v703314oValidFingerprint('a'.repeat(64)),true);
    check('short fingerprint rejected',v703314oValidFingerprint('abc123'),false);
    return {ok:cases.every(x=>x.pass),version:VERSION,cases,failures:cases.filter(x=>!x.pass).map(x=>x.name)};
  }


  function v703314pIsoDate(day,month,year){
    let d=Number(day),m=Number(month),y=Number(year);
    if(!Number.isInteger(d)||!Number.isInteger(m)||!Number.isInteger(y))return '';
    if(y<100)y+=(y<=69?2000:1900);
    if(y<1990||y>2100||m<1||m>12||d<1||d>31)return '';
    const dt=new Date(Date.UTC(y,m-1,d));
    if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)return '';
    return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  }
  function v703314pDateFromLabel(raw=''){
    const lines=String(raw||'').replace(/\r/g,'\n').split(/\n+/).map(clean).filter(Boolean);
    const parseWindow=(value='')=>{
      const t=clean(value);
      let m=t.match(/(?:^|[^0-9])([0-3]?\d)\s*[\/.-]\s*([01]?\d)\s*[\/.-]\s*(\d{2,4})(?:[^0-9]|$)/);
      if(m){const x=v703314pIsoDate(m[1],m[2],m[3]);if(x)return x;}
      m=t.match(/(?:^|[^0-9])([0-3]?\d)\s*[\/.-]\s*([01]?\d)\s*[1Il|]\s*(\d{2})(?:[^0-9]|$)/);
      if(m){const x=v703314pIsoDate(m[1],m[2],m[3]);if(x)return x;}
      m=t.match(/(?:^|[^0-9])([0-3]?\d)\s*[1Il|]\s*([01]?\d)\s*[\/.-]\s*(\d{2})(?:[^0-9]|$)/);
      if(m){const x=v703314pIsoDate(m[1],m[2],m[3]);if(x)return x;}
      return '';
    };
    for(let i=0;i<Math.min(lines.length,140);i++){
      if(!/^(?:invoice\s+)?date\b/i.test(lines[i])&&!/^date\s*[:#.-]?$/i.test(lines[i]))continue;
      for(let j=i;j<=Math.min(lines.length-1,i+3);j++){const hit=parseWindow(lines[j]);if(hit)return hit;}
    }
    return '';
  }
  function v703314pInvoiceCandidate(raw='',supplier=''){
    const value=invoiceNumberFromLabel(raw,supplier);if(!value)return {value:'',strong:false,suspicious:false};
    const v=clean(value),basic=/^[A-Z0-9][A-Z0-9._\/-]*(?:\s+[A-Z0-9][A-Z0-9._\/-]*)?$/i.test(v)&&/\d/.test(v)&&v.length>=3&&v.length<=40;
    const mixedCase=/[A-Z]/.test(v)&&/[a-z]/.test(v),numeric=/^\d{4,20}$/.test(v),upper=/^[A-Z0-9][A-Z0-9._\/-]*(?:\s+[A-Z0-9][A-Z0-9._\/-]*)?$/.test(v);
    const supplierKey=norm(supplier||raw),compactValue=v.toUpperCase().replace(/\s+/g,''),avMediaLike=supplierKey.includes('av media')&&/^VIN17/.test(compactValue),avMediaCanonical=/^VIN17-\d{6}$/.test(compactValue);
    const suspicious=!basic||mixedCase||(avMediaLike&&!avMediaCanonical);
    return {value:v,strong:basic&&(numeric||upper)&&!suspicious,suspicious};
  }
  function v703314pReconcileHeader(doc={},sources=[]){
    const list=(sources||[]).map((x,i)=>({source:String(x?.source||('evidence-'+(i+1))),text:String(x?.text||'')})).filter(x=>x.text.trim());
    const out={...doc},all=list.map(x=>x.text).join('\n'),supplier=supplierFromEvidence(all,out.supplier_name||'');
    if(supplier)out.supplier_name=supplier;
    const candidates=[];
    for(const src of list){const c=v703314pInvoiceCandidate(src.text,out.supplier_name||'');if(c.value)candidates.push({...c,source:src.source});}
    const current=clean(out.invoice_number||'');
    if(current){const meta=v703314pInvoiceCandidate('Invoice No: '+current,out.supplier_name||'');if(meta.value)candidates.push({...meta,source:'current'});}
    const groups=new Map();
    for(const c of candidates){if(!c.strong)continue;const key=compact(c.value);if(!key)continue;let g=groups.get(key);if(!g){g={key,value:c.value,count:0,targeted:0,sources:[]};groups.set(key,g);}g.count++;if(/header|target/i.test(c.source))g.targeted++;g.sources.push(c.source);}
    const ranked=[...groups.values()].sort((a,b)=>(b.count-a.count)||(b.targeted-a.targeted));
    let chosen='';
    if(ranked[0]){
      if(ranked[0].count>=2)chosen=ranked[0].value;
      else if(ranked[0].targeted>=1&&!(ranked[1]?.targeted>=1))chosen=ranked[0].value;
      else if(candidates.some(c=>c.source==='current'&&c.strong&&compact(c.value)===ranked[0].key))chosen=ranked[0].value;
    }
    const suspicious=candidates.some(c=>c.suspicious);
    if(chosen){out.invoice_number=chosen;out.invoiceNumberReviewRequired=false;}
    else if(suspicious||current){out.invoice_number='';out.invoiceNumberReviewRequired=true;}
    if(!clean(out.invoice_date||'')){
      const dates=[];for(const src of list){const d=v703314pDateFromLabel(src.text);if(d)dates.push({value:d,source:src.source});}
      if(dates.length){const counts=new Map();for(const d of dates)counts.set(d.value,(counts.get(d.value)||0)+1);const best=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0];if(best){out.invoice_date=best[0];out.dateReviewRequired=false;out.v703314pDateEvidence=dates.filter(x=>x.value===best[0]);}}
    }
    out.v703314pHeaderEvidence={invoice_candidates:candidates.map(c=>({value:c.value,strong:c.strong,suspicious:c.suspicious,source:c.source})),selected_invoice_number:out.invoice_number||'',date:out.invoice_date||''};
    return out;
  }
  function v703314pStrongEquipmentInvoice(raw=''){
    const text=String(raw||''),invoice=classifyInvoicePage(text);
    if(!invoice.allowed||invoice.disposition!=='accept')return {strong:false,count:0,types:[],reason:'Document is not a strongly accepted Invoice/Tax Invoice.'};
    const lines=text.replace(/\r/g,'\n').split(/\n+/).map(clean).filter(Boolean),types=new Set(),evidence=[];
    const patterns=[
      [/\bprojectors?\b/i,'projector'],[/\b(?:control|confiol)\s+panels?\b/i,'control-panel'],[/\bcontrollers?\b/i,'controller'],[/\bmicrophones?\b/i,'microphone'],
      [/\bspeak(?:er|a)s?\b/i,'speaker'],[/\bmixers?\b/i,'mixer'],[/\bcameras?\b/i,'camera'],[/\bdisplays?\b/i,'display'],[/\bmonitors?\b/i,'monitor'],
      [/\breceivers?\b/i,'receiver'],[/\btransmitters?\b/i,'transmitter'],[/\bamplifiers?\b/i,'amplifier'],[/\bprocessors?\b/i,'processor'],
      [/\bswitchers?\b/i,'switcher'],[/\bvisuali[sz]ers?\b/i,'visualizer'],[/\bmedia\s+players?\b/i,'player']
    ];
    const service=/\b(?:installation|install(?:ing|ed)?|labou?r|professional\s+services?|service\s+work|dismantl(?:e|ed|ing)|dismount(?:ed|ing)?|commission(?:ing)?|testing\s+and\s+commission|relocat(?:e|ion)|remov(?:e|al|ing))\b/i;
    for(const line of lines){if(service.test(line))continue;for(const [re,type] of patterns){if(re.test(line)){types.add(type);evidence.push(line.slice(0,240));break;}}}
    return {strong:types.size>=2,count:types.size,types:[...types],evidence:evidence.slice(0,8),reason:types.size>=2?'Multiple non-service physical equipment descriptions are printed in a strongly accepted invoice.':'Not enough independent physical-equipment description evidence.'};
  }
  function v703314pRecoverEquipmentRows(text='',source=''){
    const out=[];
    for(const original of String(text||'').replace(/\r/g,'\n').split(/\n+/)){
      const row=v703312kRecoverDirectLine(original,source);if(!row)continue;
      if(v703312jIsServiceRow(row)||v703312jIsAccessoryRow(row)||!v703312jIsTrackedEquipment(row))continue;
      out.push(validateSkuQtyEvidence(row,text));
    }
    return dedupeParsedLineItems(out);
  }
  function runAerospaceRegressionChecks14p(){
    const cases=[],check=(name,actual,expected)=>{const pass=typeof expected==='function'?!!expected(actual):actual===expected;cases.push({name,pass,actual,expected:typeof expected==='function'?'predicate':expected});};
    const corrupted='AV MEDIA PTE LTD\nGST Reg. No. M2-01 10202-2 TAX INVOICE\nInvoice No: VIN 17-A3n65\nRef. No.\nVS017-021642/V17-035189/V\nDATE\n7- 12/08122\nPT-VW540\nAVS320\nPanasonic PT-VW540 projector\nAbtus AVS320 HDMI Confiol panel\nAbtus Active Speaka in pair\nInstallation work including supply and install bracket for projector\nGST 7% SGD 124.18\nAMOUNT DUE SGD 1,898.18';
    check('Aerospace OCR date repair',v703314pDateFromLabel(corrupted),'2022-08-12');
    const bad=v703314pReconcileHeader({supplier_name:'AV Media Pte Ltd',invoice_number:'VIN 17-A3n65',invoice_date:''},[{source:'primary',text:corrupted}]);
    check('corrupted invoice number is cleared',bad.invoice_number,'');
    check('corrupted invoice number requires review',bad.invoiceNumberReviewRequired,true);
    check('date is recovered independently of invoice number',bad.invoice_date,'2022-08-12');
    const good=v703314pReconcileHeader({supplier_name:'AV Media Pte Ltd',invoice_number:'VIN 17-A3n65',invoice_date:''},[{source:'primary',text:corrupted},{source:'recovery-header-hi',text:'TAX INVOICE\nInvoice No: VIN17-032365\nDATE\n12/08/22'}]);
    check('verified targeted header OCR recovers printed invoice number',good.invoice_number,'VIN17-032365');
    const loud=v703314pReconcileHeader({supplier_name:'Loud Technologies Asia Pte Ltd',invoice_number:'INV LTA-00215542'},[{source:'primary',text:'TAX INVOICE\nInvoice Number INV LTA-00215542'}]);
    check('valid spaced invoice IDs remain valid',loud.invoice_number,'INV LTA-00215542');
    const numeric=v703314pReconcileHeader({supplier_name:'Example Pte Ltd',invoice_number:'88260492'},[{source:'primary',text:'TAX INVOICE\nInvoice No: 88260492'}]);
    check('valid numeric invoice IDs remain valid',numeric.invoice_number,'88260492');
    check('strong mixed equipment invoice does not need type confirmation',v703314pStrongEquipmentInvoice(corrupted).strong,true);
    check('service-only invoice is not promoted to equipment',v703314pStrongEquipmentInvoice('TAX INVOICE\nProfessional Services including dismantle of existing projector, installation, testing and commissioning\nSubtotal 530.00\nGST 47.70\nAmount Due 577.70').strong,false);
    const table='PT-VW540 Panasonic PT-VW540 projector 1 804.00 804.00\nAVS-320A Abtus AVS-320A HDMI Control panel 1 350.00 350.00\n60100-SALES Abtus Active Speaker in pair 1 90.00 90.00\n60200-INSTALLATION Installation work including projector bracket 1 530.00 530.00';
    const rows=v703314pRecoverEquipmentRows(table,'recovery-table-hi');
    check('targeted table OCR recovers three physical rows',rows.length,3);
    check('targeted table OCR excludes installation',rows.some(x=>/installation/i.test(v703312jRowText(x))),false);
    check('recovered rows preserve economic evidence',rows.every(x=>x.v703312LineEvidence?.economic===true),true);
    return {ok:cases.every(x=>x.pass),version:VERSION,cases,failures:cases.filter(x=>!x.pass).map(x=>x.name)};
  }


  function v703314qEconomicValues(row={}){
    const q=Number(row.quantity),p=Number(row.unit_price),a=Number(row.amount);
    const finite=Number.isInteger(q)&&q>0&&q<=999&&Number.isFinite(p)&&p>=0&&Number.isFinite(a)&&a>=0;
    const tolerance=Math.max(.03,Math.abs(a)*.002),ok=finite&&Math.abs(q*p-a)<=tolerance;
    return {q,p,a,finite,ok,tolerance};
  }
  function v703314qDescriptionTokens(v=''){
    const stop=new Set(['with','from','this','that','unit','units','each','pair','set','the','and','for','hdmi','audio','video']);
    return new Set(norm(v).split(' ').filter(x=>x.length>=4&&!stop.has(x)));
  }
  function v703314qIdentityScore(target={},candidate={}){
    const tSku=compact(target.sku||''),cSku=compact(candidate.sku||'');let skuScore=0;
    if(tSku&&cSku){
      if(tSku===cSku)skuScore=80;
      else if(Math.min(tSku.length,cSku.length)>=5&&Math.abs(tSku.length-cSku.length)<=1&&(tSku.startsWith(cSku)||cSku.startsWith(tSku)))skuScore=62;
      else if(tSku.length>=5&&cSku.length>=5&&(tSku.includes(cSku)||cSku.includes(tSku)))skuScore=48;
    }
    const a=v703314qDescriptionTokens([target.item_name,target.description].filter(Boolean).join(' ')),b=v703314qDescriptionTokens([candidate.item_name,candidate.description].filter(Boolean).join(' '));
    let overlap=0;for(const x of a)if(b.has(x))overlap++;
    const descScore=overlap>=4?64:overlap===3?54:overlap===2?36:overlap===1?12:0,skuConflict=!!(tSku&&cSku&&!skuScore);
    return {score:skuConflict?Math.min(30,descScore):Math.max(skuScore,skuScore+Math.min(24,descScore),descScore),skuScore,descriptionOverlap:overlap,skuConflict};
  }
  function v703314qMoneySignature(row={}){
    const e=v703314qEconomicValues(row);return e.ok?e.q+'|'+e.p.toFixed(2)+'|'+e.a.toFixed(2):'';
  }
  function v703314qChooseMoneyCandidate(target={},candidates=[]){
    const current=v703314qEconomicValues(target),currentSig=v703314qMoneySignature(target),usable=[];
    for(const raw of candidates||[]){
      const row={...raw},econ=v703314qEconomicValues(row);if(!econ.ok)continue;
      const id=v703314qIdentityScore(target,row);if(id.score<48)continue;
      const source=clean(row.v703314qSource||row.source||'candidate'),sourceBase=clean(source.split('|')[0]||source),strict=!!(row.layoutEvidenceVerified||row.v703314qStrictLayout||/table.*hi|strict-layout/i.test(source));
      const observed=Number(row.v703314qObservedFields||3),sourceWeight=/table.*hi/i.test(source)?28:/recovery|ocr/i.test(source)?16:8,score=100+id.score+(strict?28:0)+Math.min(18,Math.max(0,observed)*6)+sourceWeight;
      usable.push({row,econ,id,source,sourceBase,strict,score,signature:v703314qMoneySignature(row)});
    }
    if(!usable.length)return {changed:false,review:!current.ok,reason:'No economically consistent OCR/layout candidate matched this item.',current};
    const groups=new Map();
    for(const x of usable){let g=groups.get(x.signature);if(!g){g={signature:x.signature,rows:[],sources:new Set(),bestScore:0,strict:false};groups.set(x.signature,g);}g.rows.push(x);g.sources.add(x.sourceBase);g.bestScore=Math.max(g.bestScore,x.score);g.strict=g.strict||x.strict;}
    const ranked=[...groups.values()].sort((a,b)=>(b.sources.size-a.sources.size)||(Number(b.strict)-Number(a.strict))||(b.bestScore-a.bestScore)),best=ranked[0],second=ranked[1]||null,representative=best.rows.sort((a,b)=>b.score-a.score)[0];
    const targetFlagged=!!(target.quantityReviewRequired||target.priceReviewRequired||target.unit_priceReviewRequired||target.amountReviewRequired||!current.ok),independentAgreement=best.sources.size>=2,strongIdentity=representative.id.skuScore>=62||(!representative.id.skuConflict&&representative.id.descriptionOverlap>=4),strongSingle=best.strict&&strongIdentity&&targetFlagged;
    const conflict=!!(second&&best.strict&&second.strict&&second.sources.size>=best.sources.size&&second.bestScore>=best.bestScore-30);
    if(conflict)return {changed:false,review:true,reason:'Strong OCR/layout candidates disagree on the monetary values.',current};
    if(best.signature===currentSig)return {changed:false,review:false,reason:'Current monetary values agree with the strongest OCR/layout evidence.',current,evidence:{signature:best.signature,sources:[...best.sources]}};
    if(!(independentAgreement||strongSingle))return {changed:false,review:true,reason:'A different economic value was found, but evidence is not strong enough to auto-correct it.',current,evidence:{signature:best.signature,sources:[...best.sources],strict:best.strict}};
    const rr=representative.row;
    return {changed:true,review:false,reason:independentAgreement?'Independent OCR/layout candidates agree on the corrected monetary values.':'Strict row-layout evidence resolves the currently flagged monetary values.',values:{quantity:Number(rr.quantity),unit_price:Number(rr.unit_price),amount:Number(rr.amount)},evidence:{signature:best.signature,sources:[...best.sources],strict:best.strict,identity:representative.id}};
  }
  function runMonetaryConsensusRegressionChecks14q(){
    const cases=[],check=(name,pass,actual,expected)=>cases.push({name,pass:!!pass,actual,expected});
    const avs={sku:'AVS320',item_name:'Abtus AVS320 Control Panel',quantity:1,unit_price:1.35,amount:0,priceReviewRequired:true,amountReviewRequired:true};
    const avsPick=v703314qChooseMoneyCandidate(avs,[{sku:'AVS-320A',item_name:'Abtus AVS-320A HDMI Control panel',quantity:1,unit_price:350,amount:350,layoutEvidenceVerified:true,v703314qSource:'recovery-table-hi|strict-layout'},{sku:'AVS320',item_name:'Abtus AVS320 HDMI Control panel',quantity:1,unit_price:350,amount:350,v703314qStrictLayout:true,v703314qSource:'recovery-block|product-layout'}]);
    check('Aerospace AVS320 wrong decimals are corrected',avsPick.changed&&avsPick.values?.unit_price===350&&avsPick.values?.amount===350,avsPick,'350 / 350');
    const spk={sku:'60100-SALES',item_name:'Abtus Active Speaker in pair',quantity:1,unit_price:1.9,amount:.9,priceReviewRequired:true,amountReviewRequired:true};
    const spkPick=v703314qChooseMoneyCandidate(spk,[{sku:'60100-SALES',item_name:'Abtus Active Speaker in pair',quantity:1,unit_price:90,amount:90,layoutEvidenceVerified:true,v703314qSource:'recovery-table-hi|strict-layout'},{sku:'60100-SALES',item_name:'Abtus Active Speaker in pair',quantity:1,unit_price:90,amount:90,v703314qSource:'recovery-auto|product-layout'}]);
    check('Aerospace speaker wrong decimals are corrected',spkPick.changed&&spkPick.values?.unit_price===90&&spkPick.values?.amount===90,spkPick,'90 / 90');
    const noSku={sku:'',item_name:'Wireless handheld microphone receiver',quantity:2,unit_price:3.5,amount:7,priceReviewRequired:true,amountReviewRequired:true};
    const noSkuPick=v703314qChooseMoneyCandidate(noSku,[{sku:'',item_name:'Wireless handheld microphone receiver system',quantity:2,unit_price:350,amount:700,layoutEvidenceVerified:true,v703314qSource:'recovery-table-hi|strict-layout'}]);
    check('future invoice without SKU can use strong description evidence',noSkuPick.changed&&noSkuPick.values?.unit_price===350&&noSkuPick.values?.amount===700,noSkuPick,'350 / 700');
    const generic={sku:'',item_name:'Projector',quantity:1,unit_price:1,amount:0,priceReviewRequired:true};
    const genericPick=v703314qChooseMoneyCandidate(generic,[{sku:'',item_name:'Projector',quantity:1,unit_price:800,amount:800,layoutEvidenceVerified:true,v703314qSource:'recovery-table-hi|strict-layout'}]);
    check('generic one-word description is not enough identity evidence',genericPick.changed===false,genericPick,'unchanged');
    const skuConflict=v703314qChooseMoneyCandidate({sku:'MODEL-A1',item_name:'Wireless microphone receiver',quantity:1,unit_price:1,amount:0,priceReviewRequired:true},[{sku:'MODEL-B2',item_name:'Wireless microphone receiver',quantity:1,unit_price:500,amount:500,layoutEvidenceVerified:true,v703314qSource:'recovery-table-hi|strict-layout'}]);
    check('conflicting printed SKUs cannot be overridden by similar descriptions',skuConflict.changed===false,skuConflict,'unchanged');
    const good={sku:'TEST-1',item_name:'Test projector',quantity:2,unit_price:350,amount:700};
    const same=v703314qChooseMoneyCandidate(good,[{...good,layoutEvidenceVerified:true,v703314qSource:'strict-layout'}]);
    check('correct current economics are preserved',same.changed===false&&same.review===false,same,'unchanged');
    const conflict=v703314qChooseMoneyCandidate({...good,priceReviewRequired:true},[{...good,layoutEvidenceVerified:true,v703314qSource:'recovery-table-hi|strict-layout'},{...good,unit_price:360,amount:720,layoutEvidenceVerified:true,v703314qSource:'recovery-block|strict-layout'}]);
    check('conflicting strong candidates do not auto-correct',conflict.changed===false&&conflict.review===true,conflict,'review');
    const weak=v703314qChooseMoneyCandidate({...good,unit_price:3.5,amount:7,priceReviewRequired:true},[{...good,v703314qSource:'weak-text|text-physical'}]);
    check('one weak candidate cannot silently replace values',weak.changed===false&&weak.review===true,weak,'review');
    const unrelated=v703314qChooseMoneyCandidate(avs,[{sku:'OTHER-99',item_name:'Network switch',quantity:1,unit_price:350,amount:350,layoutEvidenceVerified:true,v703314qSource:'recovery-table-hi|strict-layout'}]);
    check('unrelated row cannot repair money',unrelated.changed===false,unrelated,'unchanged');
    const zeroAmount=v703314qEconomicValues({quantity:1,unit_price:350,amount:0});
    check('price with zero mismatched amount is not economically valid',zeroAmount.ok===false,zeroAmount,false);
    return {ok:cases.every(x=>x.pass),version:VERSION,cases,failures:cases.filter(x=>!x.pass).map(x=>x.name)};
  }


  function v703314rNumericFragments(item={}){
    const text=clean(item.text||''),x=Number(item.x)||0,width=Math.max(0,Number(item.width)||0);
    const matches=[...text.matchAll(/-?\d[\d,]*(?:\.\d{1,2})?/g)],out=[];
    for(let i=0;i<matches.length;i++){const raw=matches[i][0],value=Number(raw.replace(/,/g,''));if(!Number.isFinite(value))continue;const virtualX=matches.length>1&&width>0?x+width*((i+.5)/matches.length):x+width/2;out.push({id:String(x)+'|'+String(width)+'|'+String(i)+'|'+raw,raw,value,x:virtualX,decimal:/[.,]\d{1,2}$/.test(raw)});}
    return out;
  }
  function v703314rResolveEconomicsFromItems(items=[],columns={}){
    const qtyX=Number(columns.qty),priceX=Number(columns.price),amountX=Number(columns.amount);
    if(![qtyX,priceX,amountX].every(Number.isFinite)||!(qtyX<priceX&&priceX<amountX))return {ok:false,reason:'Invalid numeric column geometry.'};
    const spacing=Math.min(priceX-qtyX,amountX-priceX),radius=Math.max(18,spacing*.72),fragments=(items||[]).flatMap(v703314rNumericFragments);
    const pool=(name,cx)=>fragments.map(f=>({...f,distance:Math.abs(f.x-cx),column:name})).filter(f=>f.distance<=radius).filter(f=>name==='qty'?Number.isInteger(f.value)&&f.value>0&&f.value<=999:f.value>=0).sort((a,b)=>(a.distance-b.distance)||(Number(b.decimal)-Number(a.decimal))).slice(0,8);
    const q=pool('qty',qtyX),p=pool('price',priceX),a=pool('amount',amountX);let best=null;
    for(const qq of q)for(const pp of p)for(const aa of a){if(new Set([qq.id,pp.id,aa.id]).size<3)continue;const tolerance=Math.max(.03,Math.abs(aa.value)*.003),delta=Math.abs(qq.value*pp.value-aa.value);if(delta>tolerance)continue;const positional=(qq.distance+pp.distance+aa.distance)/Math.max(1,spacing),decimalBonus=(pp.decimal?12:0)+(aa.decimal?12:0),score=1000-(positional*80)+decimalBonus;if(!best||score>best.score)best={score,quantity:qq.value,unit_price:pp.value,amount:aa.value,delta,tolerance,evidence:[qq,pp,aa]};}
    return best?{ok:true,...best}:{ok:false,reason:'No complete column-aligned Qty × Unit Price = Amount combination was verified.',fragmentCount:fragments.length};
  }
  function runHeaderAlignedMoneyRegressionChecks14r(){
    const cases=[],check=(name,actual,expected)=>{const pass=typeof expected==='function'?!!expected(actual):actual===expected;cases.push({name,pass,actual,expected:typeof expected==='function'?'predicate':expected});},cols={qty:500,price:610,amount:720};
    let r=v703314rResolveEconomicsFromItems([{text:'1',x:492,width:16},{text:'350.00',x:585,width:50},{text:'350.00',x:695,width:50}],cols);check('separate Qty/Price/Amount tokens',r,x=>x.ok&&x.quantity===1&&x.unit_price===350&&x.amount===350);
    r=v703314rResolveEconomicsFromItems([{text:'1 350.00 350.00',x:450,width:320}],cols);check('single OCR block spanning all numeric columns',r,x=>x.ok&&x.quantity===1&&x.unit_price===350&&x.amount===350);
    r=v703314rResolveEconomicsFromItems([{text:'1 90.00',x:455,width:210},{text:'90.00',x:698,width:45}],cols);check('merged Qty plus Unit Price token',r,x=>x.ok&&x.quantity===1&&x.unit_price===90&&x.amount===90);
    r=v703314rResolveEconomicsFromItems([{text:'2 1,414.00 2,828.00',x:450,width:320}],cols);check('thousands separators remain monetary values',r,x=>x.ok&&x.quantity===2&&x.unit_price===1414&&x.amount===2828);
    r=v703314rResolveEconomicsFromItems([{text:'1.35',x:585,width:45},{text:'0',x:710,width:12}],cols);check('collapsed decimal fragment cannot invent missing digits',r,x=>x.ok===false);
    r=v703314rResolveEconomicsFromItems([{text:'5000',x:490,width:30},{text:'804.00',x:590,width:48},{text:'804.00',x:700,width:48}],cols);check('specification-sized quantity is rejected',r,x=>x.ok===false);
    r=v703314rResolveEconomicsFromItems([{text:'1',x:492,width:16},{text:'350.00',x:590,width:48},{text:'0.00',x:700,width:42}],cols);check('inconsistent amount remains unverified',r,x=>x.ok===false);
    return {ok:cases.every(x=>x.pass),version:VERSION,cases,failures:cases.filter(x=>!x.pass).map(x=>x.name)};
  }

  const RELEASE_NOTES=[
    'Improved Reference No. parsing from labelled invoice fields.',
    'Removed duplicate or fragmented parsed item rows more safely.',
    'Added automatic Amount calculation when Qty or Unit Price changes.'
  ];
  const RELEASE_UPCOMING_VERSION='7.03.3.14y';
  const RELEASE_ROADMAP=[
    {id:'quality-retention',text:'Improve parsing accuracy across more invoice layouts.'},
    {id:'module-decomposition',text:'Improve automatic item matching and consolidation.'},
    {id:'review-workflow',text:'Simplify review messages and workflow.'}
  ];
  const COMPLETED_ROADMAP_IDS=new Set(['sku-merge-detection','merge-confirmation-errors','regression-protection','ui-regression','health-resolution','merge-audit-visibility','health-history-controls','activity-detail-expansion','parser-workflow-hardening','regression-evidence-reporting','admin-only-parser-diagnostics','golden-invoice-quality-guards','ocr-preprocessing','holdout-validation','known-good-14m-freeze','automatic-regression-ci','correction-memory','supplier-layout-profiles','pdf-fingerprint-dedupe','admin-parser-quality-dashboard','operational-backups']);
  const RELEASE_UPCOMING_NOTES=RELEASE_ROADMAP.map(x=>x.text);

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

  return {VERSION,BASELINE_VERSION,clean,norm,compact,supplierFromEvidence,lineEvidenceSignature,referenceNumberFromLabel,dedupeParsedLineItems,v703314xDuplicatePair,validateSkuQtyEvidence,isStructuredPhysicalAssetRow,v703314aRecoverStructuredPricedAssetRows,v703312jIsServiceRow,v703312jIsAccessoryRow,v703312jIsTrackedEquipment,v703312jRecoverNumberedEquipmentRows,v703312jMergeTrackedRows,classifyInvoicePage,filterInvoicePages,reviewFieldsForRow,looksLikeDimensionOrSpec,credibleSku,modelTokens,productIdentityCandidates,resolveInvoiceIdentity,conciseName,fixRow,normalizeInvoiceNumberCandidate,invoiceNumberFromLabel,fixDocumentHeader,applyParsedFixes,normalizedItemIdentity,resolveInventoryMatch,prepareLinesForInventory,analyzeDuplicatePair,duplicateCandidates,safeDuplicateGroups,v703314kHasStrongEquipmentIdentity,v703314lRowDecision,v703314nLineArithmetic,v703314nDocumentArithmetic,v703314nEvidenceMatch,v703314nFieldQuality,v703314nDocumentQuality,v703314nApplyQualityGuards,runQualityRegressionChecks14n,runHoldoutRegressionChecks14n,v703314oSupplierKey,v703314oEvidenceContains,v703314oCorrectionDecision,v703314oExtractProfileCandidate,v703314oValidFingerprint,runIntelligenceRegressionChecks14o,v703314pDateFromLabel,v703314pInvoiceCandidate,v703314pReconcileHeader,v703314pStrongEquipmentInvoice,v703314pRecoverEquipmentRows,runAerospaceRegressionChecks14p,v703314qEconomicValues,v703314qIdentityScore,v703314qMoneySignature,v703314qChooseMoneyCandidate,runMonetaryConsensusRegressionChecks14q,v703314rNumericFragments,v703314rResolveEconomicsFromItems,runHeaderAlignedMoneyRegressionChecks14r,buildParserDiagnostics14l,runRegressionChecks,runHistoricalRegressionChecks,installParserPatch,installUiVersionSync,applyVersionUi,RELEASE_NOTES,RELEASE_UPCOMING_VERSION,RELEASE_UPCOMING_NOTES,RELEASE_ROADMAP,COMPLETED_ROADMAP_IDS};
});
