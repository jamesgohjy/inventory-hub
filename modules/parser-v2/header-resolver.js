// Inventory Hub Parser V2 — evidence-only header resolver
(function(global){
  'use strict';
  const E=global.InventoryHubParserV2Evidence;
  const clean=v=>E?.clean?E.clean(v):String(v??'').replace(/\s+/g,' ').trim();
  const compact=v=>clean(v).toUpperCase().replace(/\s+/g,'');
  const companySuffix=/\b(?:PTE\.?\s*LTD\.?|PRIVATE\s+LIMITED|LIMITED|LTD\.?|LLP|LLC|INC\.?|CORP(?:ORATION)?\.?|CO\.?\s*LTD\.?)\b/i;
  const rejectParty=/\b(?:SOLD\s+TO|BILL\s+TO|SHIP\s+TO|DELIVERED\s+TO|CUSTOMER|ATTN|ATTENTION)\b/i;
  const valueToken=/^[A-Z0-9][A-Z0-9._\/-]{2,}$/i;
  // Some suppliers print a purchase-order reference as "Ref PO Number".
  // It is still a labelled document reference, but must be recognised as a
  // whole label so an unrelated PO value cannot be picked up from body text.
  const refLabel=/(?:\bREF(?:ERENCE)?\s+P\/?O\s*(?:NUMBER|NO\.?|#)?|\bREFERENCE(?:\s*(?:NUMBER|NO\.?|#))?|\bREF\.?\s*(?:NUMBER|NO\.?|#)?)(?=\s*[:#.-]|\s|$)/i;
  const invoiceLabel=/(?:\bINVOICE\s*(?:NO\.?|NUMBER|#)|\bINV\s*(?:NO\.?|#))(?=\s*[:#.-]|\s|$)/i;
  const dateLabel=/\b(?:INVOICE\s+DATE|DATE)\b/i;

  function parseDateStrict(v=''){
    const named=clean(v).match(/^([0-3]?\d)\s*([A-Za-z]{3,9})\s*,?\s*(\d{4})$/);
    const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    if(named){const mo=months.indexOf(named[2].slice(0,3).toLowerCase())+1;return mo?parseDateStrict(named[1]+'/'+mo+'/'+named[3]):'';}
    const m=clean(v).match(/^([0-3]?\d)\s*[/.\-]\s*([01]?\d)\s*[/.\-]\s*(\d{2}|\d{4})$/);
    if(!m)return '';
    let y=Number(m[3]);if(y<100)y=y<70?2000+y:1900+y;
    const d=Number(m[1]),mo=Number(m[2]);if(!(y>=1990&&y<=2100&&mo>=1&&mo<=12&&d>=1&&d<=31))return '';
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
    const tail=clean(value),m=tail.match(/^([A-Z0-9][A-Z0-9._\/-]{2,})(?=\s|$)/i);
    return m&&/\d/.test(m[1])?m[1]:'';
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
  function supplierCandidates(evidence){
    const out=[];
    const addLine=(line,source,kind,index)=>{
      const v=clean(line);if(!v||rejectParty.test(v))return;
      const labelled=v.match(/^\s*(?:SUPPLIER|VENDOR|FROM|ISSUED\s+BY)\s*[:#.-]?\s*(.+)$/i);
      if(labelled&&clean(labelled[1]))pushCandidate(out,'supplier_name',labelled[1],{source,kind,score:140-index,evidence:v});
      if(companySuffix.test(v))pushCandidate(out,'supplier_name',v,{source,kind,score:105-index,evidence:v});
    };
    for(const src of evidence.sources||[]){
      clean(src.text).split(/\n+/).filter(Boolean).slice(0,35).forEach((line,i)=>addLine(line,src.id,src.kind,i));
      for(const pg of src.layout||[])(pg.rows||[]).slice(0,24).forEach((row,i)=>addLine(row.text,src.id,'geometry',i));
    }
    return out;
  }
  function invoiceCandidates(evidence){
    const out=[...geometryValues(evidence,invoiceLabel,'invoice_number')];
    for(const src of evidence.sources||[])for(const line of clean(src.text).split(/\n+/).filter(Boolean)){
      const v=lineValueAfterLabel(line,invoiceLabel);if(v)pushCandidate(out,'invoice_number',v,{source:src.id,kind:src.kind,score:100,evidence:line});
    }
    return out.map(x=>({...x,value:identifierFromTail(x.value)})).filter(x=>x.value&&valueToken.test(compact(x.value))&&!/^(?:DATE|CUSTOMER|CODE|TERMS|SALESMAN|REF|REFERENCE)$/i.test(compact(x.value)));
  }
  function dateCandidates(evidence){
    const out=[...geometryValues(evidence,dateLabel,'invoice_date')];
    for(const src of evidence.sources||[])for(const line of clean(src.text).split(/\n+/).filter(Boolean)){
      if(!dateLabel.test(line)||/\b(?:DUE|DELIVERY|PAYMENT|WARRANTY)\b/i.test(line))continue;
      const tail=lineValueAfterLabel(line,dateLabel),m=(tail||line).match(/([0-3]?\d\s*(?:[/.\-]\s*[01]?\d\s*[/.\-]\s*(?:\d{4}|\d{2})|[A-Za-z]{3,9}\s*,?\s*\d{4}))/);
      if(m)pushCandidate(out,'invoice_date',m[1],{source:src.id,kind:src.kind,score:105,evidence:line});
    }
    return out.map(x=>({...x,value:parseDateStrict((x.value.match(/([0-3]?\d\s*(?:[/.\-]\s*[01]?\d\s*[/.\-]\s*(?:\d{4}|\d{2})|[A-Za-z]{3,9}\s*,?\s*\d{4}))/)||[])[1]||x.value)})).filter(x=>x.value);
  }
  function referenceCandidates(evidence){
    const out=[...geometryValues(evidence,refLabel,'reference_number')];
    for(const src of evidence.sources||[]){
      const lines=clean(src.text).split(/\n+/).filter(Boolean);
      for(let i=0;i<lines.length;i++){
        const line=lines[i],v=lineValueAfterLabel(line,refLabel);
        if(v)pushCandidate(out,'reference_number',v,{source:src.id,kind:src.kind,score:100,evidence:line});
        // A table header may put "Ref. No." above its value. Read only the
        // first cell of the immediately following row, never a later row.
        if(/\bREF\.?\s*NO\.?\s/i.test(line)&&/\bDATE\b/i.test(line)&&lines[i+1]){
          const next=lines[i+1];
          const first=next.match(/^\s*[|({_\.]*\s*([A-Z][A-Z0-9/-]*)(?=\s|$)/i)?.[1];
          const token=first&&(first.match(/\d/g)||[]).length>=4?first
            :next.slice(0,65).match(/\b([A-Z][A-Z0-9]{1,12}-\d{4,}(?:\/[A-Z0-9-]+)*)\b/i)?.[1];
          // A separated header/value row is weaker than a same-line label.
          // Reject clipped segments and isolated OCR fragments such as "vsot7".
          if(token&&(token.match(/\d/g)||[]).length>=4&&/[-/]/.test(token)
            &&token.split('/').every(part=>part.length>=5&&!/-$/.test(part)))
            pushCandidate(out,'reference_number',token,{source:src.id,kind:src.kind,score:110,evidence:line+'\n'+lines[i+1]});
        }
      }
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
    if(field==='reference_number'){
      const tail=v=>String(v||'').match(/\d{5,}$/)?.[0]||'';
      if(ranked.some(x=>x!==best&&x.key!==best.key&&tail(x.value)&&tail(x.value)===tail(best.value)))
        return {field,value:'',status:'blank',reason:'conflicting-reference-glyphs',candidates:ranked};
    }
    if(strictConflict&&second&&second.maxScore>=minScore&&second.key!==best.key&&Math.abs(best.maxScore-second.maxScore)<20)return {field,value:'',status:'blank',reason:'conflicting-evidence',candidates:ranked};
    return {field,value:best.value,status:'resolved',reason:'evidence-supported',support:best.support,candidates:ranked};
  }
  function resolveHeaders(evidence){
    const supplier=choose('supplier_name',supplierCandidates(evidence),{minScore:90});
    const invoice=choose('invoice_number',invoiceCandidates(evidence),{minScore:95});
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
  global.InventoryHubParserV2Header=Object.freeze({version:'2.0-shadow',parseDateStrict,identifierFromTail,supplierCandidates,invoiceCandidates,dateCandidates,referenceCandidates,choose,resolveHeaders});
})(typeof window!=='undefined'?window:globalThis);
