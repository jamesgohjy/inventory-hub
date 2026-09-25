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
    const t=clean(text).replace(/(?:SGD|S\$|\$)/ig,'').trim();if(!t)return null;
    const vals=parseNumericTokens(t);if(vals.length!==1)return null;
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
    if(triples[0])return {...triples[0],verified:true};
    // Do not manufacture a coherent triple from conflicting numbers.
    return {quantity:null,unit_price:null,amount:null,verified:false};
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
  const EQUIPMENT_HINT_RE=/\b(?:projector|microphone|speaker|loudspeaker|controller|control panel|camera|mixer|monitor|amplifier|receiver|transmitter|player|receptacle|wireless)\b/i;
  const GENERIC_DESC_RE=/^(?:RE\s*:|REFERENCE\b|(?:\([A-Z]\)\s*)?SECTION\b|TECHNICAL\s+SPECIFICATIONS\b|SCOPE\s+OF\s+WORK\b|.*\bREPLACEMENT\s+SETUP\b)/i;
  function modelTokenFromValue(v=''){
    const s=clean(v).replace(/[|;,]+$/,'');if(!s)return '';
    const toks=s.split(/\s+/).filter(Boolean);
    for(let i=toks.length-1;i>=0;i--){
      const t=toks[i].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
      if(/^[A-Za-z0-9][A-Za-z0-9+._\/-]{1,}$/i.test(t)&&/\d/.test(t))return t;
    }
    if(toks.length===1){
      const t=toks[0].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
      if(/^[A-Za-z][A-Za-z0-9+._\/-]{2,}$/i.test(t))return t;
    }
    return '';
  }
  function printedModelFromRows(rows=[],columns={}){
    let printed='',replacement='';
    for(const row of rows||[]){
      const d=clean(cellText(row,columns.boundaries?.description||[-Infinity,Infinity]));
      if(!d)continue;
      const rep=d.match(/\breplac(?:ed|ement)\s+with\s+([A-Za-z0-9][A-Za-z0-9+._\/-]{1,})/i);
      if(rep)replacement=modelTokenFromValue(rep[1])||replacement;
      const m=d.match(/\bMODEL\s*:\s*(.+)$/i);
      if(m&&!printed)printed=modelTokenFromValue(m[1]);
    }
    return replacement||printed;
  }
  function cleanItemDescription(v=''){
    return clean(v).replace(/\s*\bMODEL\s*:\s*.+$/i,'').replace(/^\d+\s+(?=[A-Za-z(])/,'').trim();
  }
  function continuationEquipmentDescription(rows=[],columns={}){
    for(const row of rows||[]){
      const d=clean(cellText(row,columns.boundaries?.description||[-Infinity,Infinity]));
      if(!d||META_RE.test(d)||WARRANTY_RE.test(d)||GENERIC_DESC_RE.test(d)||/^MODEL\s*:/i.test(d))continue;
      if(EQUIPMENT_HINT_RE.test(d))return cleanItemDescription(d);
    }
    return '';
  }
  function rowLooksLikeStart(row,columns){
    const code=codeFromRow(row,columns),q=strictQuantity(cellText(row,columns.boundaries.quantity)),p=strictMoney(cellText(row,columns.boundaries.unit_price)),a=strictMoney(cellText(row,columns.boundaries.amount));
    const econCount=[q,p,a].filter(v=>v!==null).length;
    const desc=clean(cellText(row,columns.boundaries.description));
    return !!(code&&desc)||(econCount>=2&&!!desc)||(econCount===3);
  }
  function buildTableRows(table){
    const body=mergeBodyBands(table?.bodyRows||[],table?.yTolerance||3)
      .sort((a,b)=>((Number(a.y)-table.headerY)*table.direction)-((Number(b.y)-table.headerY)*table.direction));
    if(!body.length)return [];

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
      const anchorInfo=anchors[ai],group=body.slice(previousAnchor+1,anchorInfo.index+1),anchor=body[anchorInfo.index],economics=anchorInfo.econ;
      const nextAnchorIndex=anchors[ai+1]?.index??body.length,following=body.slice(anchorInfo.index+1,nextAnchorIndex);
      previousAnchor=anchorInfo.index;

      let sku='';
      // Prefer a printed code from the same segment, nearest the economic anchor.
      for(let gi=group.length-1;gi>=0&&!sku;gi--)sku=codeFromRow(group[gi],table.columns);
      const anchorDescription=clean(cellText(anchor,table.columns.boundaries.description));
      const anchorCodeText=table.columns.hasCode?clean(cellText(anchor,table.columns.boundaries.code)):'';
      let codeSpill='';
      if(sku&&anchorCodeText&&anchorCodeText.toUpperCase().startsWith(String(sku).toUpperCase())){
        codeSpill=clean(anchorCodeText.slice(String(sku).length));
        if(codeSpill&&(/\d/.test(codeSpill)||codeSpill.length>60))codeSpill='';
      }
      let baseDescription=(anchorDescription&&!META_RE.test(anchor.text||'')&&!WARRANTY_RE.test(anchor.text||''))
        ?anchorDescription:descriptionFromGroup(group,table.columns);
      const continuationDescription=continuationEquipmentDescription(following,table.columns);
      if(continuationDescription&&(GENERIC_DESC_RE.test(baseDescription)||!EQUIPMENT_HINT_RE.test(baseDescription)))baseDescription=continuationDescription;
      const printedModel=printedModelFromRows([...group,...following],table.columns);
      if(!sku&&printedModel)sku=printedModel;
      const description=cleanItemDescription([codeSpill,baseDescription].filter(Boolean).join(' '));
      const raw=clean([...group,...following].map(r=>r.text).join(' '));
      if(!sku&&!description&&!/[0-9]/.test(raw))continue;

      rows.push({
        sourceRowId:table.id+':r'+(ai+1),
        sku,model:sku,
        item_name:description||raw,
        description:description||raw,
        quantity:economics.quantity,
        unit_price:economics.unit_price,
        amount:economics.amount,
        layoutEvidenceVerified:true,
        economicEvidenceVerified:true,
        parserV2PhysicalRow:true,
        provenance:{engine:'parser-v2',tableId:table.id,source:table.source,sourceKind:table.sourceKind,page:table.page,rowIndexes:[...group,...following].flatMap(r=>r.sourceRowIndexes||[]),rawText:raw,printedModel:printedModel||''}
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
  global.InventoryHubParserV2RowBuilder=Object.freeze({version:'2.5-continuation-model-evidence',mergeBodyBands,parseNumericTokens,strictQuantity,strictMoney,numericCellCandidates,economicsFromGroup,codeFromRow,descriptionFromGroup,rowLooksLikeStart,buildTableRows,buildRows});
})(typeof window!=='undefined'?window:globalThis);
