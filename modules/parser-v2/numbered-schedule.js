// Recover a damaged invoice table from numbered invoice rows and an attached price schedule.
// A schedule may corroborate economics only; every output row starts on an invoice page.
(function(global){
  'use strict';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const money=v=>{let s=String(v||'').replace(/[$\s}\])]/g,'');if(/,\d{2}$/.test(s)&&!s.includes('.'))s=s.replace(',','.');else s=s.replace(/,/g,'');const n=Number(s);return Number.isFinite(n)?n:null;};
  const moneyRe=/\$?\s*\d{1,3}(?:,\d{3})*(?:[.,]\d{2})/g;
  const serviceRe=/\b(?:scope of work|dismantle|labou?r|cabling|labelling|tidying|calibration|commissioning|training|warranty|safety documents)\b/i;
  const modelRe=/\bmodel\s*:\s*(?:[A-Za-z][A-Za-z &.]*?\s+)?([A-Z0-9][A-Z0-9+._/-]*\d[A-Z0-9+._/-]*)\b/i;
  const modelFrom=text=>text.match(modelRe)?.[1]||text.match(/\bmodel\s*:\s*([A-Za-z]{4,})\b/i)?.[1]||'';
  function numberedAnchor(row,page){
    const left=(row.items||[]).filter(x=>Number(x.x)<Number(page.width||1500)*.15);
    const hits=left.map(x=>clean(x.text)).filter(x=>/^\d{1,2}$/.test(x));
    return hits.length===1?Number(hits[0]):null;
  }
  function invoiceAnchors(evidence){
    const T=global.InventoryHubParserV2TableDetector,out=[];
    for(const src of evidence.sources||[])for(const page of src.layout||[]){
      if(T.pageDocumentRole(page)!=='invoice')continue;
      const rows=page.rows||[],header=rows.findIndex(r=>/\bNO\.?\b/i.test(r.text)&&/\bDESCRIPTION\b/i.test(r.text));
      if(header<0)continue;
      const starts=[];
      for(let i=header+1;i<rows.length;i++){
        if(/\bSUB\s*TOTAL\b|\bPAGE\s+\d+\s+OF\s+\d+\b/i.test(rows[i].text))break;
        if(/\bMODEL\s*:/i.test(rows[i].text))continue;
        const ordinal=numberedAnchor(rows[i],page);
        if(ordinal&&ordinal<=20&&starts.at(-1)?.ordinal!==ordinal)starts.push({ordinal,index:i});
      }
      if(starts.length<4)continue;
      const scope=starts.find(s=>/\bSCOPE\s+OF\s+WORK\b/i.test(rows[s.index].text));
      for(let j=0;j<starts.length;j++){
        const {ordinal,index}=starts[j];if((scope&&index>=scope.index)||ordinal>starts[0].ordinal+30)break;
        const band=rows.slice(index,starts[j+1]?.index??rows.length),text=clean(band.map(r=>r.text).join(' '));
        if(serviceRe.test(clean(rows[index].text))&& !/\breceptacle\b/i.test(text))continue;
        const model=modelFrom(text);
        const title=clean((rows[index].items||[]).filter(x=>Number(x.x)>page.width*.13&&Number(x.x)<page.width*.59).map(x=>x.text).join(' ')).replace(/^[|\s]*\d{1,2}[.\s|]*/,'').replace(/^\|\s*/, '');
        const qtyItems=(rows[index].items||[]).filter(x=>{const center=Number(x.x)+Number(x.width||0)/2;return center>page.width*.59&&center<page.width*.69&&/^\W*\d{1,3}\W*$/.test(clean(x.text));});
        const quantity=qtyItems.length===1?Number(clean(qtyItems[0].text).replace(/\D/g,'')):null;
        out.push({source:src.id,page:page.page,ordinal,model,title,quantity,anchorLine:rows[index].text,raw:text});
      }
      // The first numbered line may be a project heading; its physical product
      // and model follow before item 2. Bind that continuation to invoice row 1.
      if(starts[0]?.ordinal===2){
        const lead=rows.slice(header+1,starts[0].index),text=clean(lead.map(r=>r.text).join(' '));
        const model=modelFrom(text);
        const product=lead.find(r=>/\b(?:mixer|projector|speaker|microphone|camera|amplifier|controller|player|receiver|display)\b/i.test(r.text)&&!/(?:replacement setup|technical specifications)/i.test(r.text));
        const qty=lead.flatMap(r=>r.items||[]).filter(x=>{const c=Number(x.x)+Number(x.width||0)/2;return c>page.width*.59&&c<page.width*.69&&/^\d{1,3}$/.test(clean(x.text));});
        if(model&&product&&qty.length===1)out.push({source:src.id,page:page.page,ordinal:1,model,title:clean(product.text).replace(/^[|\s]*/,''),quantity:Number(qty[0].text),anchorLine:lead[0]?.text||'',raw:text});
      }
    }
    return out;
  }
  function schedules(evidence){
    const out=[];
    for(const src of evidence.sources||[]){
      const text=String(src.text||'');if(!/SCHEDULES?\s+OF\s+PRICES/i.test(text))continue;
      const lines=text.split(/\r?\n/),start=lines.findIndex(x=>/SCHEDULES?\s+OF\s+PRICES/i.test(x));
      let current=null;
      for(let i=start+1;i<lines.length;i++){
        const line=clean(lines[i]);if(/\b(?:SCOPE\s+OF\s+WORK|TERMS\s*&\s*CONDITIONS)\b/i.test(line))break;
        const m=line.match(/^\|?\s*([1-9]|[1-9]\d)\s*[|. -]+(.+)$/);
        if(!m)continue;
        const ordinal=Number(m[1]);if(ordinal>50)continue;
        const prices=[...line.matchAll(moneyRe)].map(x=>money(x[0])).filter(x=>x!==null);
        if(prices.length<2)continue;
        const amount=prices.at(-1),unit=prices.at(-2);
        if(!(amount>0)||!(unit>0))continue;
        const beforeMoney=line.slice(0,line.indexOf([...line.matchAll(moneyRe)][0][0]));
        const q=beforeMoney.match(/(?:^|\s)(\d{1,3})\s*\|?\s*$/)?.[1];
        out.push({source:src.id,ordinal,text:line,quantity:q?Number(q):null,unit,amount});
        current=ordinal;
      }
    }
    return out;
  }
  function recover(evidence,invoiceSubtotal){
    if(!invoiceSubtotal?.proven)return {ok:false,reason:'invoice-subtotal-unproven',rows:[]};
    const anchors=invoiceAnchors(evidence),support=schedules(evidence);
    const scheduleTotals=new Set();
    for(const src of evidence.sources||[])if(/SCHEDULES?\s+OF\s+PRICES/i.test(src.text||'')){
      const m=String(src.text||'').match(/\bTOTAL\s+AMOUNT\s*[=|:\s]*\$?\s*([\d,]+\.\d{2})/i);
      if(m&&money(m[1])===invoiceSubtotal.value)scheduleTotals.add(src.id);
    }
    if(scheduleTotals.size<2)return {ok:false,reason:'schedule-total-not-corroborated',rows:[]};
    const byOrdinal=new Map();for(const a of anchors){if(!byOrdinal.has(a.ordinal))byOrdinal.set(a.ordinal,[]);byOrdinal.get(a.ordinal).push(a);}
    const ordinals=[...byOrdinal.keys()].filter(n=>n<=8).sort((a,b)=>a-b);
    if(ordinals.length<4||!ordinals.every((n,i)=>i===0||n===ordinals[i-1]+1))return {ok:false,reason:'invoice-numbered-sequence-incomplete',rows:[]};
    const supportOrdinals=[...new Set(support.map(s=>s.ordinal))].filter(n=>n>=ordinals[0]&&n<=ordinals.at(-1)+1).sort((a,b)=>a-b);
    if(supportOrdinals.some(n=>!byOrdinal.has(n)))return {ok:false,reason:'support-row-missing-from-invoice',missing:supportOrdinals.filter(n=>!byOrdinal.has(n)),rows:[]};
    const highModels=new Map();
    const replacementVotes=new Map();
    for(const src of evidence.sources||[]){
      if(src.kind==='ocr'&&/\bTAX\s+INVOICE\b/i.test(src.text||'')){
        for(const hit of String(src.text||'').matchAll(/\breplac(?:ed|ement)\s+with\s+([A-Z0-9][A-Z0-9+._/-]{2,})/gi)){
          const key=hit[1].toUpperCase();if(!replacementVotes.has(key))replacementVotes.set(key,new Set());replacementVotes.get(key).add(src.id);
        }
      }
      if(!/^invoice-hires-/.test(src.id))continue;
      const section=String(src.text||'').split(/\bSECTION\s+2\s*:/i).slice(1).join(' ').split(/\bSCOPE\s+OF\s+WORK\b/i)[0];
      const models=[...section.matchAll(/\bMODEL\s*:\s*([^\n]+)/gi)].map(m=>modelFrom('Model: '+m[1]));
      if(models.length!==ordinals.length||models.some(x=>!x))continue;
      ordinals.forEach((n,i)=>highModels.set(n,models[i]));
    }
    const rows=[];
    for(const ordinal of ordinals){
      const witnesses=byOrdinal.get(ordinal),best=witnesses.sort((a,b)=>(b.model?10:0)+(b.quantity?5:0)-(a.model?10:0)-(a.quantity?5:0))[0];
      if(serviceRe.test(best.title)&&!/\breceptacle\b/i.test(best.title))continue;
      const genericTitle=/^(?:RE\s*:|SCOPE\s+OF\s+WORK|SECTION\b)/i.test(best.title);
      const invoiceIdentity=norm(genericTitle?best.raw:best.title);
      const matched=support.filter(s=>s.ordinal===ordinal&&norm(s.text).split(' ').filter(w=>w.length>4&&invoiceIdentity.includes(w)).length>=(genericTitle?3:2));
      const amounts=new Map();for(const s of matched){const key=s.amount.toFixed(2);if(!amounts.has(key))amounts.set(key,new Set());amounts.get(key).add(s.source);}
      const amountRank=[...amounts].sort((a,b)=>b[1].size-a[1].size);
      if(amountRank.length!==1||amountRank[0][1].size<2)return {ok:false,reason:'schedule-amount-not-corroborated',ordinal,rows:[]};
      const amount=Number(amountRank[0][0]);
      const qtyVotes=new Map();for(const s of matched)if(s.quantity>0){if(!qtyVotes.has(s.quantity))qtyVotes.set(s.quantity,new Set());qtyVotes.get(s.quantity).add(s.source);}
      const qtyRank=[...qtyVotes].sort((a,b)=>b[1].size-a[1].size);
      const corroboratedQty=qtyRank[0]?.[1].size>=2&&qtyRank[0][1].size>Number(qtyRank[1]?.[1].size||0)?qtyRank[0][0]:null;
      const quantity=best.quantity||corroboratedQty;
      if(!(quantity>0))return {ok:false,reason:'invoice-quantity-unproven',ordinal,rows:[]};
      const unit=Math.round(amount/quantity*100)/100;
      if(!matched.some(s=>Math.abs(s.unit-unit)<=.02))return {ok:false,reason:'schedule-unit-price-conflict',ordinal,rows:[]};
      const invoiceConflicts=new Set();
      for(const witness of witnesses){
        const cells=[...String(witness.anchorLine||'').matchAll(moneyRe)].map(x=>money(x[0])).filter(Number.isFinite);
        if(cells.length<2)continue;
        const [printedUnit,printedAmount]=cells.slice(-2);
        if(Math.abs(quantity*printedUnit-printedAmount)>.03)continue;
        if(Math.abs(printedAmount-amount)>.03)invoiceConflicts.add(witness.source);
      }
      if(invoiceConflicts.size>=2)return {ok:false,reason:'schedule-conflicts-with-invoice-economics',ordinal,rows:[]};
      if(!best.model)return {ok:false,reason:'invoice-model-unproven',ordinal,rows:[]};
      const localReplacement=best.raw.match(/\breplac(?:ed|ement)\s+with\s+([A-Z0-9][A-Z0-9+._/-]{2,})/i)?.[1];
      const voted=[...replacementVotes].sort((a,b)=>b[1].size-a[1].size);
      const replacement=localReplacement&&voted[0]?.[1].size>=2&&voted[0][1].size>Number(voted[1]?.[1].size||0)&&
        voted[0][0].replace(/[^A-Z0-9]/g,'').slice(-4)===localReplacement.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(-4)?voted[0][0]:null;
      const candidates=[...new Set(witnesses.map(w=>w.model).concat(highModels.get(ordinal)||'').filter(Boolean).map(x=>x.toUpperCase().replace(/[^A-Z0-9]/g,'')))];
      // A single plausible OCR rendering cannot settle a disputed model token.
      // Keep the equipment and verified economics while leaving its SKU blank.
      const modelUncertain=!replacement&&candidates.length>1;
      const model=replacement||(modelUncertain?'':highModels.get(ordinal)||best.model);
      let continuation='';
      for(const src of evidence.sources||[]){
        if(!/^invoice-hires-/.test(src.id))continue;
        const lines=String(src.text||'').split(/\r?\n/),at=lines.findIndex(x=>/\bMODEL\s*:/i.test(x)&&x.toUpperCase().includes(best.model.toUpperCase()));
        if(at<1)continue;
        const segments=lines[at-1].split('|').flatMap(x=>x.split(/\s{3,}/)).map(x=>clean(x).replace(/^\d{1,2}\s*/,''));
        const prior=(segments.filter(x=>/[A-Za-z]{3}/.test(x)).sort((a,b)=>b.length-a.length)[0]||'')
          .replace(/(\b(?:system|console|playback|receptacle)\b)\s+(?:or\s+)?\d+\b.*$/i,'$1');
        const shared=norm(prior).split(' ').filter(w=>w.length>4&&norm(best.raw).includes(w)).length;
        if(shared>=2&&/\b(?:mixer|speaker|microphone|projector|controller|amplifier|player|camera|display|receiver|receptacle)\b/i.test(prior)){continuation=prior;break;}
      }
      const title=clean(continuation||best.title).replace(/^[|\[\s]+|[|\]\s]+$/g,'');
      rows.push({sku:model,model,item_name:title,description:title,quantity,unit_price:unit,amount,layoutEvidenceVerified:true,economicEvidenceVerified:true,parserV2PhysicalRow:true,parserReviewRequired:true,humanReviewRequired:true,needsReview:true,modelReviewRequired:modelUncertain,provenance:{engine:'parser-v2-numbered-schedule',source:best.source,page:best.page,ordinal,invoiceText:best.raw,replacementOf:replacement?best.model:null,modelVariants:modelUncertain?candidates:[],scheduleSources:[...amountRank[0][1]]}});
    }
    if(rows.length<4)return {ok:false,reason:'too-few-equipment-rows',rows:[]};
    if(rows.reduce((n,r)=>n+r.amount,0)>invoiceSubtotal.value+.02)return {ok:false,reason:'equipment-exceeds-invoice-subtotal',rows:[]};
    return {ok:true,rows};
  }
  global.InventoryHubParserV2NumberedSchedule=Object.freeze({invoiceAnchors,schedules,recover});
})(typeof window!=='undefined'?window:globalThis);
