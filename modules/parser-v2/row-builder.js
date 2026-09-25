// Inventory Hub Parser V2 — geometry-first physical row reconstruction
(function(global){
  'use strict';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const center=it=>Number(it?.x)+(Number(it?.width)||0)/2;
  const finite=v=>Number.isFinite(Number(v));
  const round2=v=>finite(v)?Math.round(Number(v)*100)/100:null;
  const META_RE=/^\s*(?:SERIAL(?:\s*(?:NO|NUMBER|NUMBERS))?|S\/?N|SHIPMENT\s*(?:NO|NUMBER)|REMARKS?|NOTES?)\b/i;
  const WARRANTY_RE=/\b(?:WARRANTY|WT\s+FOR)\b/i;

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
  function economicsFromGroup(group,columns){
    const qs=[],ps=[],as=[];
    for(const row of group){
      const q=strictQuantity(cellText(row,columns.boundaries.quantity));
      const p=strictMoney(cellText(row,columns.boundaries.unit_price));
      const a=strictMoney(cellText(row,columns.boundaries.amount));
      if(q!==null)qs.push({value:q,row});if(p!==null)ps.push({value:p,row});if(a!==null)as.push({value:a,row});
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
  function buildTableRows(table){
    const body=(table?.bodyRows||[]).slice().sort((a,b)=>((Number(a.y)-table.headerY)*table.direction)-((Number(b.y)-table.headerY)*table.direction));
    if(!body.length)return [];
    let anchors=[];
    for(let i=0;i<body.length;i++)if(rowLooksLikeStart(body[i],table.columns))anchors.push(i);
    if(!anchors.length){
      // Preserve the table as an unexplained physical segment rather than silently returning no rows.
      return [{sourceRowId:table.id+':r1',sku:'',item_name:clean(body.map(r=>r.text).join(' ')),description:clean(body.map(r=>r.text).join(' ')),quantity:null,unit_price:null,amount:null,
        classification:{type:'unknown'},layoutEvidenceVerified:true,economicEvidenceVerified:false,
        provenance:{engine:'parser-v2',tableId:table.id,source:table.source,page:table.page,rowIndexes:body.map(r=>r.rowIndex)}}];
    }
    // Lines before the first economic/code anchor belong to that first row when they contain description-column text.
    const rows=[];
    for(let ai=0;ai<anchors.length;ai++){
      const start=ai===0?0:anchors[ai],end=ai+1<anchors.length?anchors[ai+1]:body.length;
      const group=body.slice(start,end);
      const anchor=body[anchors[ai]];
      const economics=economicsFromGroup(group,table.columns),sku=codeFromRow(anchor,table.columns),description=descriptionFromGroup(group,table.columns);
      const raw=clean(group.map(r=>r.text).join(' '));
      if(!sku&&!description&&!/[0-9]/.test(raw))continue;
      rows.push({
        sourceRowId:table.id+':r'+(ai+1),
        sku,
        model:sku,
        item_name:description||raw,
        description:description||raw,
        quantity:economics.quantity,
        unit_price:economics.unit_price,
        amount:economics.amount,
        layoutEvidenceVerified:true,
        economicEvidenceVerified:!!economics.verified,
        parserV2PhysicalRow:true,
        provenance:{engine:'parser-v2',tableId:table.id,source:table.source,sourceKind:table.sourceKind,page:table.page,rowIndexes:group.map(r=>r.rowIndex),rawText:raw}
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
  global.InventoryHubParserV2RowBuilder=Object.freeze({version:'2.0-shadow',parseNumericTokens,strictQuantity,strictMoney,economicsFromGroup,codeFromRow,descriptionFromGroup,rowLooksLikeStart,buildTableRows,buildRows});
})(typeof window!=='undefined'?window:globalThis);
