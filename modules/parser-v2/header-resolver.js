// Inventory Hub Parser V2 — evidence-only header resolver
(function(global){
  'use strict';
  const E=global.InventoryHubParserV2Evidence;
  const clean=v=>E?.clean?E.clean(v):String(v??'').replace(/\s+/g,' ').trim();
  const compact=v=>clean(v).toUpperCase().replace(/\s+/g,'');
  const companySuffix=/\b(?:PTE\.?\s*LTD\.?|PRIVATE\s+LIMITED|LIMITED|LTD\.?|LLP|LLC|INC\.?|CORP(?:ORATION)?\.?|CO\.?\s*LTD\.?)\b/i;
  const rejectParty=/\b(?:SOLD\s+TO|BILL\s+TO|SHIP\s+TO|DELIVERED\s+TO|CUSTOMER|ATTN|ATTENTION)\b/i;
  const valueToken=/^[A-Z0-9][A-Z0-9._\/-]{2,}$/i;
  const refLabel=/(?:\bREFERENCE(?:\s*(?:NO\.?|NUMBER|#))?|\bREF\.?\s*(?:NO\.?|NUMBER|#)?)(?=\s*[:#.-]|\s|$)/i;
  const invoiceLabel=/(?:\bINVOICE\s*(?:NO\.?|NUMBER|#)|\bINV\s*(?:NO\.?|#))(?=\s*[:#.-]|\s|$)/i;
  const dateLabel=/\b(?:INVOICE\s+DATE|DATE)\b/i;

  function dateToken(v=''){
    const m=clean(v).match(/(?:^|[^A-Za-z0-9\/.-])([0-3]?\d\s*[/.-]\s*[01]?\d\s*[/.-]\s*(?:\d{4}|\d{2}))(?![A-Za-z0-9])/);
    return m?m[1]:'';
  }
  function namedDateToken(v=''){
    const m=clean(v).match(/(?:^|[^A-Za-z0-9])([0-3]?\d\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(?:\d{4}|\d{2}))(?![A-Za-z0-9])/i);
    return m?m[1]:'';
  }
  function parseDateStrict(v=''){
    const s=clean(v);
    let m=s.match(/^([0-3]?\d)\s*[/\.\-]\s*([01]?\d)\s*[/\.\-]\s*(\d{2}|\d{4})$/),d,mo,y;
    if(m){
      d=Number(m[1]);mo=Number(m[2]);y=Number(m[3]);if(y<100)y=y<70?2000+y:1900+y;
    }else{
      m=s.match(/^([0-3]?\d)\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{2}|\d{4})$/i);
      if(!m)return '';
      const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
      d=Number(m[1]);mo=months[m[2].slice(0,3).toLowerCase()]||0;y=Number(m[3]);if(y<100)y=y<70?2000+y:1900+y;
    }
    if(!(y>=1990&&y<=2100&&mo>=1&&mo<=12&&d>=1&&d<=31))return '';
    const dt=new Date(Date.UTC(y,mo-1,d));if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==mo-1||dt.getUTCDate()!==d)return '';
    return String(y).padStart(4,'0')+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  }
  function pushCandidate(out,field,value,meta={}){
    const v=clean(value);if(!v)return;
    out.push({field,value:v,source:meta.source||'',kind:meta.kind||'text',score:Number(meta.score)||0,evidence:meta.evidence||'',page:meta.page||null});
  }
  function lineValueAfterLabel(line,label){
    const m=String(line||'').match(new RegExp(label.source,'i'));if(!m)return '';
    return clean(String(line).slice(m.index+m[0].length).replace(/^[\s:#.\-]+/,''));
  }
  function identifierFromTail(value=''){
    const tail=clean(value),m=tail.match(/^([A-Z0-9][A-Z0-9._\/-]{2,})(?:\s+([A-Z0-9][A-Z0-9._\/-]{2,}))?(?=\s|$)/i);
    if(!m)return '';
    const first=m[1],second=m[2]||'';
    if(/\d/.test(first))return first;
    // Allow a short alphabetic prefix plus one identifier token, e.g. "INV LTA-00215840".
    // Do not absorb arbitrary trailing prose or field labels.
    if(second&&/^[A-Z]{2,8}$/i.test(first)&&/\d/.test(second))return first+' '+second;
    return '';
  }
  function geometryValues(evidence,labelRe,field){
    const out=[];
    for(const src of evidence.sources||[])for(const pg of src.layout||[])for(const row of pg.rows||[]){
      const items=row.items||[];if(!items.length)continue;
      const labelItems=items.filter(it=>labelRe.test(clean(it.text)));if(!labelItems.length&&!labelRe.test(row.text||''))continue;
      const lx=labelItems.length?Math.min(...labelItems.map(it=>Number(it.x)||0)):Math.min(...items.map(it=>Number(it.x)||0));
      const lw=labelItems.length?Math.max(...labelItems.map(it=>(Number(it.x)||0)+(Number(it.width)||0)))-lx:0;
      const right=items.filter(it=>(Number(it.x)||0)>lx+lw-2).sort((a,b)=>(Number(a.x)||0)-(Number(b.x)||0)).map(it=>clean(it.text)).filter(Boolean);
      if(right.length)pushCandidate(out,field,right.join(' '),{source:src.id,kind:'geometry',score:120,evidence:row.text,page:pg.page});
      const inline=lineValueAfterLabel(row.text||'',labelRe);if(inline)pushCandidate(out,field,inline,{source:src.id,kind:'geometry-text',score:105,evidence:row.text,page:pg.page});
    }
    return out;
  }
  function legalCompanyFromLine(line='',domainStems=new Set()){
    const v=clean(line);if(!v)return '';
    const suffixMatch=v.match(/\b(?:PTE\.?\s*LTD\.?|PRIVATE\s+LIMITED|LIMITED|LTD\.?|LLP|LLC|INC\.?|CORP(?:ORATION)?\.?|CO\.?\s*LTD\.?)\b/i);
    if(!suffixMatch)return '';
    const end=suffixMatch.index+suffixMatch[0].length;
    let prefix=v.slice(0,end).trim();
    let bestStart=-1;
    for(const stem of domainStems||[]){
      const escaped=String(stem).replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\  function supplierCandidates(evidence){');
      const re=new RegExp('\\b'+escaped+'\\b','ig');
      let m;while((m=re.exec(prefix)))bestStart=m.index;
    }
    if(bestStart>=0)prefix=prefix.slice(bestStart).trim();
    const toks=prefix.split(/\s+/);
    if(toks.length>2&&toks[0].toUpperCase()===toks[1].toUpperCase())prefix=toks.slice(1).join(' ');
    return prefix.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.)]+$/g,'').trim();
  }
  function supplierCandidates(evidence){
    const out=[];
    for(const src of evidence.sources||[]){
      const allText=clean(src.text),lines=allText.split(/\n+/).filter(Boolean).slice(0,140);
      const domainStems=new Set();
      for(const m of allText.matchAll(/(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]{2,})\.[a-z]{2,}(?:\.[a-z]{2,})?/gi))domainStems.add(String(m[1]||'').toUpperCase());
      for(const m of allText.matchAll(/[A-Z0-9._%+-]+@([a-z0-9][a-z0-9-]{2,})\.[a-z]{2,}(?:\.[a-z]{2,})?/gi))domainStems.add(String(m[1]||'').toUpperCase());

      const addLine=(line,kind,index)=>{
        const v=clean(line);if(!v||rejectParty.test(v))return;
        const labelled=v.match(/^\s*(?:SUPPLIER|VENDOR|FROM|ISSUED\s+BY)\s*[:#.-]?\s*(.+)$/i);
        if(labelled&&clean(labelled[1]))pushCandidate(out,'supplier_name',labelled[1],{source:src.id,kind,score:Math.max(100,145-index),evidence:v});
        if(companySuffix.test(v)){
          const legal=legalCompanyFromLine(v,domainStems);if(!legal)return;
          const first=(legal.match(/^\s*([A-Z0-9][A-Z0-9&._-]*)/i)||[])[1]||'';
          const domainBoost=domainStems.has(first.toUpperCase())?40:0;
          pushCandidate(out,'supplier_name',legal,{source:src.id,kind,score:Math.max(80,108-Math.min(index,28))+domainBoost,evidence:v});
        }
      };
      lines.forEach((line,i)=>addLine(line,src.kind,i));
      for(const pg of src.layout||[])(pg.rows||[]).slice(0,60).forEach((row,i)=>addLine(row.text,'geometry',i));
    }
    return out;
  }
  function invoiceCandidates(evidence){
    const out=[...geometryValues(evidence,invoiceLabel,'invoice_number')];
    for(const src of evidence.sources||[]){
      const lines=clean(src.text).split(/\n+/).filter(Boolean);
      for(let i=0;i<lines.length;i++){
        const line=lines[i],v=lineValueAfterLabel(line,invoiceLabel);
        if(v)pushCandidate(out,'invoice_number',v,{source:src.id,kind:src.kind,score:100,evidence:line});
        // OCR frequently separates a boxed label and its value onto adjacent lines.
        // Recover only a tightly adjacent identifier-looking value; never absorb another field label.
        if(invoiceLabel.test(line)&&!identifierFromTail(v)){
          for(let j=i+1;j<=Math.min(lines.length-1,i+2);j++){
            const next=clean(lines[j]);
            if(!next)continue;
            if(/^(?:REF(?:ERENCE)?|DATE|P\/?O|PURCHASE\s+ORDER|SALESMAN|TERMS|CUSTOMER|ACCOUNT|GST|UEN)\b/i.test(next))break;
            const id=identifierFromTail(next);
            if(id){pushCandidate(out,'invoice_number',id,{source:src.id,kind:src.kind,score:108,evidence:line+' -> '+next});break;}
          }
        }
        // Some invoice boxes use only "NO:" beneath/next to TAX INVOICE.
        // Accept this only with local invoice-title context; a generic account/customer NO remains rejected.
        const bare=line.match(/\bNO\.?\s*[:#.-]\s*([A-Z0-9][A-Z0-9._\/-]{2,})/i);
        const nearby=lines.slice(Math.max(0,i-3),Math.min(lines.length,i+2)).join(' ');
        const forbiddenBare=/\b(?:REG(?:ISTRATION)?|GST|UEN|ACCOUNT|CUSTOMER|REF(?:ERENCE)?|D\/?O|P\/?O|ORDER|PHONE|TEL|FAX)\s*(?:NO\.?|NUMBER)?\b/i.test(line);
        if(bare&&!forbiddenBare&&/\b(?:TAX\s+INVOICE|SALES\s+INVOICE|COMMERCIAL\s+INVOICE|GST\s+INVOICE|INVOICE)\b/i.test(nearby)){
          pushCandidate(out,'invoice_number',bare[1],{source:src.id,kind:src.kind,score:112,evidence:line});
        }
      }
    }
    return out.map(x=>({...x,value:identifierFromTail(x.value)})).filter(x=>x.value&&valueToken.test(compact(x.value))&&!/^(?:DATE|CUSTOMER|CODE|TERMS|SALESMAN|REF|REFERENCE)$/i.test(compact(x.value)));
  }
  function dateCandidates(evidence){
    const out=[...geometryValues(evidence,dateLabel,'invoice_date')];
    for(const src of evidence.sources||[]){
      const lines=clean(src.text).split(/\n+/).filter(Boolean);
      for(let i=0;i<lines.length;i++){
        const line=lines[i];
        if(!dateLabel.test(line)||/\b(?:DUE|DELIVERY|PAYMENT|WARRANTY)\b/i.test(line))continue;
        const tail=lineValueAfterLabel(line,dateLabel),token=dateToken(tail||line)||namedDateToken(tail||line);
        if(token){pushCandidate(out,'invoice_date',token,{source:src.id,kind:src.kind,score:105,evidence:line});continue;}
        for(let j=i+1;j<=Math.min(lines.length-1,i+2);j++){
          const next=clean(lines[j]),nextToken=dateToken(next)||namedDateToken(next);
          if(nextToken){pushCandidate(out,'invoice_date',nextToken,{source:src.id,kind:src.kind,score:102,evidence:line+' -> '+next});break;}
          if(/^(?:INVOICE|REF(?:ERENCE)?|P\/?O|PURCHASE\s+ORDER|SALESMAN|TERMS|CUSTOMER|ACCOUNT)\b/i.test(next))break;
        }
      }
    }
    return out.map(x=>({...x,value:parseDateStrict(dateToken(x.value)||namedDateToken(x.value)||x.value)})).filter(x=>x.value);
  }
  function referenceCandidates(evidence){
    const out=[...geometryValues(evidence,refLabel,'reference_number')];
    for(const src of evidence.sources||[])for(const line of clean(src.text).split(/\n+/).filter(Boolean)){
      const v=lineValueAfterLabel(line,refLabel);if(v)pushCandidate(out,'reference_number',v,{source:src.id,kind:src.kind,score:100,evidence:line});
    }
    return out.map(x=>({...x,value:identifierFromTail(x.value)})).filter(x=>x.value&&valueToken.test(compact(x.value))&&/\d/.test(x.value)&&!parseDateStrict(x.value)&&!/^(?:DATE|INVOICE|NO|NUMBER|P\/?O|PO|TERMS|SALESMAN|CUSTOMER|CODE)$/i.test(compact(x.value)));
  }
  function choose(field,candidates,{strictConflict=true,minScore=90}={}){
    const grouped=new Map();
    for(const c of candidates||[]){
      const key=field==='supplier_name'?clean(c.value).toUpperCase():compact(c.value);
      if(!key)continue;
      if(!grouped.has(key))grouped.set(key,{key,value:c.value,score:0,maxScore:0,sources:new Set(),evidence:[]});
      const g=grouped.get(key);g.score+=Math.max(0,c.score);g.maxScore=Math.max(g.maxScore,c.score);g.sources.add(c.source);g.evidence.push(c);
    }
    const ranked=[...grouped.values()].map(g=>({...g,sources:[...g.sources],support:g.sources.size})).sort((a,b)=>(b.maxScore+Math.min(30,b.score/10)+b.support*8)-(a.maxScore+Math.min(30,a.score/10)+a.support*8));
    const best=ranked[0],second=ranked[1];
    if(!best||best.maxScore<minScore)return {field,value:'',status:'blank',reason:'insufficient-evidence',candidates:ranked};
    if(strictConflict&&second&&second.maxScore>=minScore&&second.key!==best.key&&Math.abs(best.maxScore-second.maxScore)<20){
      // For invoice IDs, two or more independent sources agreeing on the same value can
      // outweigh one conflicting OCR read. A 1-vs-1 conflict still fails closed.
      const corroboratedInvoice=field==='invoice_number'&&Number(best.support)>=2&&Number(best.support)>Number(second.support||0);
      if(!corroboratedInvoice)return {field,value:'',status:'blank',reason:'conflicting-evidence',candidates:ranked};
    }
    return {field,value:best.value,status:'resolved',reason:'evidence-supported',support:best.support,candidates:ranked};
  }
  function guardSingleSourceOcrInvoice(evidence,decision){
    if(!decision||decision.status!=='resolved'||Number(decision.support)!==1)return decision;
    const best=decision.candidates?.[0];
    if(!best)return decision;
    const bestSources=new Set(best.sources||[]);
    const kinds=(best.evidence||[]).map(x=>String(x.kind||'').toLowerCase()).filter(Boolean);
    if(kinds.length&&!kinds.every(k=>k.includes('ocr')))return decision;
    const labelSources=(evidence.sources||[])
      .filter(src=>String(src.kind||'').toLowerCase().includes('ocr')&&invoiceLabel.test(String(src.text||'')))
      .map(src=>src.id);
    if(labelSources.length<2)return decision;
    const unconfirmed=labelSources.some(id=>!bestSources.has(id));
    if(!unconfirmed)return decision;
    return {...decision,value:'',status:'blank',reason:'single-source-ocr-unconfirmed'};
  }
  function resolveHeaders(evidence){
    const supplier=choose('supplier_name',supplierCandidates(evidence),{minScore:90});
    const rawInvoice=choose('invoice_number',invoiceCandidates(evidence),{minScore:95});
    const invoice=guardSingleSourceOcrInvoice(evidence,rawInvoice);
    const date=choose('invoice_date',dateCandidates(evidence),{minScore:95});
    // Reference Number policy: exact evidence or blank. No repair, no review state, no guessing.
    const reference=choose('reference_number',referenceCandidates(evidence),{strictConflict:true,minScore:98});
    return Object.freeze({
      supplier_name:supplier.value,
      invoice_number:invoice.value,
      invoice_date:date.value,
      reference_number:reference.value,
      decisions:Object.freeze({supplier_name:supplier,invoice_number:invoice,invoice_date:date,reference_number:reference})
    });
  }
  global.InventoryHubParserV2Header=Object.freeze({version:'2.6-written-month-dates',parseDateStrict,identifierFromTail,legalCompanyFromLine,supplierCandidates,invoiceCandidates,dateCandidates,referenceCandidates,choose,resolveHeaders});
})(typeof window!=='undefined'?window:globalThis);
