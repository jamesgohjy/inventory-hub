// Inventory Hub Parser V2 — geometry-first physical row reconstruction
(function(global){
  'use strict';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const center=it=>Number(it?.x)+(Number(it?.width)||0)/2;
  const finite=v=>Number.isFinite(Number(v));
  const round2=v=>finite(v)?Math.round(Number(v)*100)/100:null;
  const META_RE=/^\s*(?:SERIAL(?:\s*(?:NO|NUMBER|NUMBERS))?|S\/?N|SHIPMENT\s*(?:NO|NUMBER)|REMARKS?|NOTES?|ATTENTION|ATTN|COMPANY|ADDRESS|EMAIL(?:\s+ADDRESS)?|CONTACT(?:\s+NUMBER)?|CUSTOMER|SOLD\s+TO|BILL\s+TO|SHIP\s+TO|DELIVERED\s+TO|IN\s+STOCK|SERVICE\s+CENTRE|SERVICE\s+CENTER)\b/i;
  const WARRANTY_RE=/\b(?:WARRANTY|WT\s+FOR)\b/i;

  function mergeBodyBands(rows=[],tolerance=3){
    const sorted=(rows||[]).slice().sort((a,b)=>Number(a.y)-Number(b.y)),bands=[];
    for(const row of sorted){
      const y=Number(row.y);if(!Number.isFinite(y))continue;
      let band=bands.find(b=>Math.abs(b.y-y)<=Math.max(2,Number(tolerance)||3));
      if(!band){band={y,rows:[],items:[],textParts:[],rowIndexes:[]};bands.push(band);}
      band.rows.push(row);band.items.push(...(row.items||[]));if(clean(row.text))band.textParts.push(clean(row.text));if(row.rowIndex!==undefined)band.rowIndexes.push(row.rowIndex);
      band.y=band.rows.reduce((n,r)=>n+Number(r.y),0)/band.rows.length;
    }
    return bands.sort((a,b)=>a.y-b.y).map((b,index)=>({
      y:b.y,rowIndex:index,sourceRowIndexes:b.rowIndexes,
      text:clean(b.textParts.join(' ')),
      items:b.items.slice().sort((a,c)=>(Number(a.x)||0)-(Number(c.x)||0))
    }));
  }
  function parseNumericTokens(text=''){
    return [...String(text).matchAll(/-?\d[\d,]*(?:\.\d{1,2})?/g)].map(m=>Number(m[0].replace(/,/g,''))).filter(Number.isFinite);
  }
  function cellText(row,bounds){
    const [lo,hi]=bounds||[-Infinity,Infinity];
    return (row.items||[]).filter(it=>{const c=center(it);return Number.isFinite(c)&&c>=lo&&c<hi;})
      .sort((a,b)=>(Number(a.x)||0)-(Number(b.x)||0)).map(it=>clean(it.text)).filter(Boolean).join(' ').trim();
  }
  function strictQuantity(text=''){
    const t=clean(text);if(!t)return null;
    const m=t.match(/^(\d+(?:\.\d+)?)\s*(?:PCS?|UNITS?|SETS?)?$/i);if(!m)return null;
    const n=Number(m[1]);return n>0&&n<=100000?n:null;
  }
  function strictMoney(text=''){
    let t=clean(text).replace(/(?:SGD|S\$|\$)/ig,'').trim();if(!t)return null;
    // OCR may turn a decimal separator into comma/colon while retaining exactly two decimal digits.
    t=t.replace(/(\d),(\d{2})(?![\d.])/g,'$1.$2').replace(/(\d):(\d{2})(?!\d)/g,'$1.$2');
    const vals=parseNumericTokens(t);if(vals.length!==1)return null;
    const match=t.match(/-?\d[\d,]*(?:\.\d{1,2})?/);if(!match)return null;
    const residue=clean(t.replace(match[0],'').replace(/[|_~"':;,.()\[\]{}<>\-]/g,' '));
    if(residue&&!(residue.length===1&&/^[A-Za-z]$/.test(residue)))return null;
    return vals[0]>=0?round2(vals[0]):null;
  }
  function numericCellCandidates(row,bounds,parser){
    const [lo,hi]=bounds||[-Infinity,Infinity],out=[];
    for(const item of row.items||[]){
      const c=center(item);if(!Number.isFinite(c)||c<lo||c>=hi)continue;
      const value=parser(clean(item.text));if(value!==null&&!out.some(x=>x.value===value))out.push({value,row,item});
    }
    // Fallback for PDFs that expose a whole cell as one positioned text object.
    if(!out.length){const value=parser(cellText(row,bounds));if(value!==null)out.push({value,row,item:null});}
    return out;
  }
  function economicsFromGroup(group,columns){
    const qs=[],ps=[],as=[];
    for(const row of group){
      qs.push(...numericCellCandidates(row,columns.boundaries.quantity,strictQuantity));
      ps.push(...numericCellCandidates(row,columns.boundaries.unit_price,strictMoney));
      as.push(...numericCellCandidates(row,columns.boundaries.amount,strictMoney));
    }
    const triples=[];
    for(const q of qs)for(const p of ps)for(const a of as){
      const delta=Math.abs(q.value*p.value-a.value),tol=Math.max(.03,Math.abs(a.value)*.003);
      if(delta<=tol)triples.push({quantity:q.value,unit_price:p.value,amount:a.value,delta:round2(delta),rowDistance:Math.abs(Number(q.row.y)-Number(a.row.y))+Math.abs(Number(p.row.y)-Number(a.row.y))});
    }
    triples.sort((a,b)=>a.delta-b.delta||a.rowDistance-b.rowDistance);
    if(triples[0])return {...triples[0],verified:true,derived:false};

    // Conservative recovery: derive only Amount from a unique Qty + Unit Price pair.
    // Never derive price from a possibly corrupted OCR amount.
    const uq=[...new Set(qs.map(x=>x.value))],up=[...new Set(ps.map(x=>x.value))];
    if(uq.length===1&&up.length===1&&uq[0]>0&&up[0]>=0){
      const amount=round2(uq[0]*up[0]),explicit=[...new Set(as.map(x=>x.value))];
      const compatible=explicit.filter(v=>Math.abs(v-amount)<=Math.max(.03,Math.abs(amount)*.003));
      if(!explicit.length||compatible.length){
        return {quantity:uq[0],unit_price:up[0],amount,delta:0,rowDistance:0,verified:true,derived:true,derivedField:'amount',evidencePair:['quantity','unit_price']};
      }
    }
    const ua=[...new Set(as.map(x=>x.value))];
    if(uq.length===1&&up.length===0&&ua.length===1&&uq[0]>0&&ua[0]>0&&!columns?.ignoredColumns?.discount){
      const unitPrice=round2(ua[0]/uq[0]);
      if(unitPrice>=0&&Math.abs(unitPrice*uq[0]-ua[0])<=Math.max(.03,Math.abs(ua[0])*.003)){
        return {quantity:uq[0],unit_price:unitPrice,amount:ua[0],delta:0,rowDistance:0,verified:true,derived:true,derivedField:'unit_price',evidencePair:['quantity','amount']};
      }
    }
    return {quantity:null,unit_price:null,amount:null,verified:false,derived:false};
  }
  function codeFromRow(row,columns){
    if(!columns.hasCode)return '';
    const value=clean(cellText(row,columns.boundaries.code)).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
    if(!value||value.length>80)return '';
    if(/^(?:SERIAL|SHIPMENT|DATE|TERMS|TOTAL|SUBTOTAL|GST)$/i.test(value))return '';
    const pieces=value.split(/\s+/);if(pieces.length>3)return '';
    // OCR/table boundaries can slightly spill the first description/vendor token into the code cell.
    // When the first token is already a strong alphanumeric model/SKU, keep that token only.
    if(pieces.length>1){
      const first=pieces[0];
      if(/^[A-Z0-9][A-Z0-9+._\/-]{2,}$/i.test(first)&&/[A-Z]/i.test(first)&&/\d/.test(first))return first;
    }
    return /[A-Za-z0-9]/.test(value)?value:'';
  }
  function descriptionFromGroup(group,columns){
    const parts=[];
    for(const row of group){
      const d=clean(cellText(row,columns.boundaries.description));
      if(!d||META_RE.test(d)||WARRANTY_RE.test(d))continue;
      if(!parts.includes(d))parts.push(d);
    }
    return clean(parts.join(' '));
  }
  function rowLooksLikeStart(row,columns){
    const code=codeFromRow(row,columns),q=strictQuantity(cellText(row,columns.boundaries.quantity)),p=strictMoney(cellText(row,columns.boundaries.unit_price)),a=strictMoney(cellText(row,columns.boundaries.amount));
    const econCount=[q,p,a].filter(v=>v!==null).length;
    const desc=clean(cellText(row,columns.boundaries.description));
    return !!(code&&desc)||(econCount>=2&&!!desc)||(econCount===3);
  }
  function stripItemOrdinal(v=''){
    return clean(v).replace(/^\d+(?:\.\d+)?\s+/, '').trim();
  }
  function modelEvidenceFromRows(rows=[],columns={}){
    let printed='',replacement='',labelSeen=false;
    for(const row of rows||[]){
      const t=clean(cellText(row,columns.boundaries?.description)||row.text);
      const m=t.match(/\bMODEL\s*:\s*(.+)$/i);
      if(m){
        labelSeen=true;
        if(!printed){
          const tail=clean(m[1]),tokens=tail.match(/[A-Z0-9][A-Z0-9+._\/-]{2,}/gi)||[];
          const ids=tokens.filter(x=>/[A-Za-z]/.test(x)&&/\d/.test(x));
          printed=ids.length?ids[ids.length-1]:'';
        }
      }
      const r=t.match(/\bREPLACED\s+WITH\s+([A-Z0-9][A-Z0-9+._\/-]{2,})\b/i);
      if(r){labelSeen=true;if(/[A-Za-z]/.test(r[1])&&/\d/.test(r[1]))replacement=r[1];}
    }
    return {printed,replacement,selected:replacement||printed,replacementExplicit:!!replacement,labelSeen};
  }
  function continuationDescription(rows=[],columns={}){
    const parts=[];
    for(const row of rows||[]){
      const d=stripItemOrdinal(cellText(row,columns.boundaries?.description));
      if(!d)continue;
      if(/^\(?[A-Z]\)?\s*SECTION\b/i.test(d)||/^\(?[A-Z]\)?\s*SCOPE\s+OF\s+WORK\s*:?$/i.test(d))continue;
      if(/^MODEL\s*:/i.test(d)||/^NOTE\s*:/i.test(d)||META_RE.test(d)||WARRANTY_RE.test(d))continue;
      if(!parts.includes(d))parts.push(d);
    }
    return clean(parts.join(' '));
  }
  function genericAnchorDescription(v=''){
    const t=stripItemOrdinal(v);
    return !t||/^(?:RE\s*:|REFERENCE\b|\(?[A-Z]\)?\s*SECTION\b|\(?[A-Z]\)?\s*SCOPE\s+OF\s+WORK\s*:?$)/i.test(t);
  }
  function itemStartRow(row,columns){
    const t=clean(row?.text||'');
    if(/^[|)\]}>\s]*\d{1,3}(?:[.)]|\s|\|)/.test(t))return true;
    const e=economicsFromGroup([row],columns);
    return e.verified&&!!clean(cellText(row,columns.boundaries.description));
  }
  function economicCandidateSummary(group,columns){
    const q=[],p=[],a=[];
    for(const row of group||[]){
      q.push(...numericCellCandidates(row,columns.boundaries.quantity,strictQuantity).map(x=>x.value));
      p.push(...numericCellCandidates(row,columns.boundaries.unit_price,strictMoney).map(x=>x.value));
      a.push(...numericCellCandidates(row,columns.boundaries.amount,strictMoney).map(x=>x.value));
    }
    return {quantity:[...new Set(q)],unit_price:[...new Set(p)],amount:[...new Set(a)]};
  }
  function buildEconomicBandRows(table,body){
    const starts=[];
    for(let i=0;i<body.length;i++)if(itemStartRow(body[i],table.columns))starts.push(i);
    if(!starts.length)return [];
    const rows=[];
    for(let si=0;si<starts.length;si++){
      const start=starts[si],end=si+1<starts.length?starts[si+1]:body.length,group=body.slice(start,end),anchor=group[0];
      const economics=economicsFromGroup(group,table.columns),economicCandidates=economicCandidateSummary(group,table.columns);
      const anchorDescription=stripItemOrdinal(cellText(anchor,table.columns.boundaries.description));
      const continuation=continuationDescription(group.slice(1),table.columns);
      const baseDescription=genericAnchorDescription(anchorDescription)&&continuation?continuation:(anchorDescription||continuation);
      const modelEvidence=modelEvidenceFromRows(group,table.columns);
      const sku=modelEvidence.selected||'';
      const raw=clean(group.map(r=>r.text).join(' '));
      const description=clean(baseDescription||raw);
      if(!description&&!sku)continue;
      rows.push({
        sourceRowId:table.id+':r'+(si+1),sku,model:sku,item_name:description,description,
        quantity:economics.verified?economics.quantity:null,
        unit_price:economics.verified?economics.unit_price:null,
        amount:economics.verified?economics.amount:null,
        economicCandidates,economicDerivation:economics.derived?{derivedField:economics.derivedField,evidencePair:economics.evidencePair}:null,
        modelEvidence,layoutEvidenceVerified:true,economicEvidenceVerified:economics.verified===true,parserV2PhysicalRow:true,
        provenance:{engine:'parser-v2',tableId:table.id,source:table.source,sourceKind:table.sourceKind,page:table.page,rowIndexes:group.flatMap(r=>r.sourceRowIndexes||[]),rawText:raw}
      });
    }
    return rows;
  }
  function buildTableRows(table){
    const body=mergeBodyBands(table?.bodyRows||[],table?.yTolerance||3)
      .sort((a,b)=>((Number(a.y)-table.headerY)*table.direction)-((Number(b.y)-table.headerY)*table.direction));
    if(!body.length)return [];
    if(table?.detectionMode==='economic-band')return buildEconomicBandRows(table,body);

    // Economic anchors are verified independently. Text preceding an anchor belongs to that priced row;
    // this supports invoices where description wraps across lines before Qty/Price/Amount.
    const anchors=[];
    for(let i=0;i<body.length;i++){
      const econ=economicsFromGroup([body[i]],table.columns);
      if(econ.verified)anchors.push({index:i,econ});
    }
    if(!anchors.length){
      return [{sourceRowId:table.id+':r1',sku:'',item_name:clean(body.map(r=>r.text).join(' ')),description:clean(body.map(r=>r.text).join(' ')),quantity:null,unit_price:null,amount:null,
        classification:{type:'unknown'},layoutEvidenceVerified:true,economicEvidenceVerified:false,
        provenance:{engine:'parser-v2',tableId:table.id,source:table.source,page:table.page,rowIndexes:body.flatMap(r=>r.sourceRowIndexes||[])}}];
    }

    const rows=[];
    let previousAnchor=-1;
    for(let ai=0;ai<anchors.length;ai++){
      const anchorInfo=anchors[ai],anchor=body[anchorInfo.index],economics=anchorInfo.econ;
      const nextAnchorIndex=ai+1<anchors.length?anchors[ai+1].index:body.length;
      const preGroup=body.slice(previousAnchor+1,anchorInfo.index+1);
      const postGroup=body.slice(anchorInfo.index,nextAnchorIndex);
      previousAnchor=anchorInfo.index;

      let sku='';
      for(let gi=preGroup.length-1;gi>=0&&!sku;gi--)sku=codeFromRow(preGroup[gi],table.columns);
      const anchorDescription=stripItemOrdinal(cellText(anchor,table.columns.boundaries.description));
      const anchorCodeText=table.columns.hasCode?clean(cellText(anchor,table.columns.boundaries.code)):'';
      let codeSpill='';
      if(sku&&anchorCodeText&&anchorCodeText.toUpperCase().startsWith(String(sku).toUpperCase())){
        codeSpill=clean(anchorCodeText.slice(String(sku).length));
        if(codeSpill&&(/\d/.test(codeSpill)||codeSpill.length>60))codeSpill='';
      }

      const postDescription=continuationDescription(postGroup.slice(1),table.columns);
      const preDescription=stripItemOrdinal(descriptionFromGroup(preGroup,table.columns));
      let baseDescription='';
      if(genericAnchorDescription(anchorDescription)&&postDescription)baseDescription=postDescription;
      else if(anchorDescription&&!META_RE.test(anchor.text||''))baseDescription=anchorDescription;
      else baseDescription=postDescription||preDescription;

      const postModelEvidence=modelEvidenceFromRows(postGroup,table.columns);
      const preModelEvidence=modelEvidenceFromRows(preGroup,table.columns);
      const modelEvidence=postModelEvidence.labelSeen?postModelEvidence:preModelEvidence;
      if(!sku&&modelEvidence.selected)sku=modelEvidence.selected;
      const description=clean([codeSpill,baseDescription].filter(Boolean).join(' '));
      const evidenceGroup=[...new Set([...preGroup,...postGroup])];
      const raw=clean(evidenceGroup.map(r=>r.text).join(' '));
      if(!sku&&!description&&!/[0-9]/.test(raw))continue;

      rows.push({
        sourceRowId:table.id+':r'+(ai+1),
        sku,model:sku,
        item_name:description||raw,
        description:description||raw,
        quantity:economics.quantity,
        unit_price:economics.unit_price,
        amount:economics.amount,
        modelEvidence,
        layoutEvidenceVerified:true,
        economicEvidenceVerified:true,
        parserV2PhysicalRow:true,
        provenance:{engine:'parser-v2',tableId:table.id,source:table.source,sourceKind:table.sourceKind,page:table.page,rowIndexes:evidenceGroup.flatMap(r=>r.sourceRowIndexes||[]),rawText:raw}
      });
    }
    return rows;
  }
  function buildRows(evidence={},tables=[]){
    const tableRows=(tables||[]).map(table=>({table,rows:buildTableRows(table)}));
    return {
      rows:tableRows.flatMap(x=>x.rows),
      tables:tableRows.map(x=>({id:x.table.id,source:x.table.source,page:x.table.page,rowCount:x.rows.length,rows:x.rows})),
      tableCount:tableRows.length,
      rowCount:tableRows.reduce((n,x)=>n+x.rows.length,0)
    };
  }
  global.InventoryHubParserV2RowBuilder=Object.freeze({version:'2.8-economic-band-segments',mergeBodyBands,parseNumericTokens,strictQuantity,strictMoney,numericCellCandidates,economicsFromGroup,codeFromRow,descriptionFromGroup,rowLooksLikeStart,buildTableRows,buildRows});
})(typeof window!=='undefined'?window:globalThis);
