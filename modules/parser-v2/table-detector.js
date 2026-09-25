// Inventory Hub Parser V2 — supplier-neutral table detector
(function(global){
  'use strict';
  const E=global.InventoryHubParserV2Evidence;
  const clean=v=>E?.clean?E.clean(v):String(v??'').replace(/\s+/g,' ').trim();
  const center=it=>Number(it?.x)+(Number(it?.width)||0)/2;
  const token=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
  const HEADER_RULES=Object.freeze({
    code:/^(?:PRODUCT(?: NO| NUMBER| CODE)?|ITEM(?: NO| NUMBER| CODE)?|SKU|MODEL|PART(?: NO| NUMBER)?)$/,
    description:/^(?:DESCRIPTION|ITEM DESCRIPTION|PRODUCT DESCRIPTION|DETAILS?)$/,
    quantity:/^(?:QTY|QUANTITY|UNITS?|PCS)$/,
    unit_price:/^(?:UNIT PRICE|UNIT RATE|PRICE|RATE|U PRICE)$/,
    amount:/^(?:AMOUNT|LINE TOTAL|TOTAL PRICE|NET AMOUNT)$/,
    tax:/^(?:TAX|GST|VAT|TAX RATE|GST RATE|VAT RATE)$/,
    discount:/^(?:DISC(?:OUNT)?|DISCOUNT %|DISC %)$/
  });
  const TOTAL_RE=/\b(?:SUB\s*TOTAL|SUBTOTAL|GRAND\s+TOTAL|AMOUNT\s+DUE|INVOICE\s+TOTAL|TOTAL\s+AMOUNT)\b/i;
  const TAX_SUMMARY_RE=/\b(?:GST|VAT|TAX)\b/i;
  const TAX_REGISTRATION_RE=/\b(?:GST|VAT|TAX)\s+(?:REG(?:ISTRATION)?|REG\.?\s*(?:NO|NUMBER)?|NO\.?|NUMBER)\b/i;
  function isTotalRowText(text=''){
    const t=clean(text);if(!t)return false;
    if(TAX_REGISTRATION_RE.test(t))return false;
    if(TOTAL_RE.test(t))return true;
    if(!TAX_SUMMARY_RE.test(t))return false;
    return /\d+(?:\.\d+)?\s*%/.test(t)||/(?:SGD|S\$|\$)\s*\d/i.test(t)||/\d[\d,]*\.\d{2}\b/.test(t);
  }
  const HEADERLESS_META_RE=/\b(?:ACCOUNT\s*(?:NO|NUMBER)?|CUSTOMER\s*(?:NO|NUMBER|CODE)?|INVOICE\s*(?:NO|NUMBER|DATE)?|PURCHASE\s+ORDER|P\/?O\s*(?:NO|NUMBER)?|D\/?O\s*(?:NO|NUMBER)?|ORDERED\s+BY|SALES\s+REP|SALESMAN|TERMS|PAYMENT|DUE\s+DATE|ADDRESS|CONTACT|EMAIL|PHONE|TEL|FAX|GST\s+REG|COMPANY\s+REG|UEN)\b/i;

  function mergedHeaderItems(rows=[],seedIndex=0,yTolerance=3){
    const seed=rows[seedIndex];if(!seed)return [];
    const sy=Number(seed.y),tol=Math.max(8,Number(yTolerance)||3)*3;
    const band=rows.filter(r=>Number.isFinite(Number(r.y))&&Number.isFinite(sy)&&Math.abs(Number(r.y)-sy)<=tol);
    return band.flatMap(r=>r.items||[]).filter(it=>clean(it.text));
  }
  function findHeaderColumns(items=[]){
    const words=items.map(it=>({...it,_token:token(it.text)})).filter(it=>it._token);
    const find=re=>words.filter(it=>re.test(it._token)).sort((a,b)=>center(a)-center(b))[0]||null;
    let code=find(HEADER_RULES.code),description=find(HEADER_RULES.description),quantity=find(HEADER_RULES.quantity),unit_price=find(HEADER_RULES.unit_price),amount=find(HEADER_RULES.amount),
        tax=find(HEADER_RULES.tax),discount=find(HEADER_RULES.discount);
    // Some PDFs split "UNIT" and "PRICE" into separate tokens. Join only geometrically adjacent header tokens.
    if(!unit_price){
      const units=words.filter(it=>/^UNIT$/.test(it._token)),prices=words.filter(it=>/^PRICE$/.test(it._token));
      outer:for(const u of units)for(const p of prices){
        if(center(p)>center(u)&&Math.abs(center(p)-center(u))<160){unit_price={text:'UNIT PRICE',x:Number(u.x),width:(Number(p.x)||0)+(Number(p.width)||0)-Number(u.x)};break outer;}
      }
    }
    if(!description||!quantity||!unit_price||!amount)return null;
    const xs={description:center(description),quantity:center(quantity),unit_price:center(unit_price),amount:center(amount)};
    if(code)xs.code=center(code);if(tax)xs.tax=center(tax);if(discount)xs.discount=center(discount);
    const semantic=[
      code&&{name:'code',x:xs.code},description&&{name:'description',x:xs.description},quantity&&{name:'quantity',x:xs.quantity},
      unit_price&&{name:'unit_price',x:xs.unit_price},tax&&{name:'tax',x:xs.tax},discount&&{name:'discount',x:xs.discount},amount&&{name:'amount',x:xs.amount}
    ].filter(Boolean).sort((a,b)=>a.x-b.x);
    if(!semantic.every(x=>Number.isFinite(x.x)))return null;
    const requiredOrder=['description','quantity','unit_price','amount'].map(name=>semantic.findIndex(x=>x.name===name));
    if(requiredOrder.some(i=>i<0)||requiredOrder.some((x,i)=>i&&x<=requiredOrder[i-1]))return null;
    const leftEdge=code?Math.min(Number(code.x)||xs.code,Number(description.x)||xs.description):Math.max(0,(Number(description.x)||xs.description)-Math.max(80,(xs.quantity-xs.description)*.75));
    const interval=name=>{
      const idx=semantic.findIndex(x=>x.name===name),cur=semantic[idx];
      const lo=idx>0?(semantic[idx-1].x+cur.x)/2:leftEdge;
      const defaultRight=name==='amount'?cur.x+Math.max(60,(Number(amount.width)||0)*2,(cur.x-xs.unit_price)*.9):cur.x+80;
      const hi=idx+1<semantic.length?(cur.x+semantic[idx+1].x)/2:defaultRight;
      return [lo,hi];
    };
    return {
      hasCode:!!code,
      x:xs,
      boundaries:{
        code:code?interval('code'):[leftEdge,leftEdge],
        description:interval('description'),
        quantity:interval('quantity'),
        unit_price:interval('unit_price'),
        amount:interval('amount')
      },
      ignoredColumns:{
        tax:tax?interval('tax'):null,
        discount:discount?interval('discount'):null
      },
      labels:{code:clean(code?.text),description:clean(description.text),quantity:clean(quantity.text),unit_price:clean(unit_price.text),tax:clean(tax?.text),discount:clean(discount?.text),amount:clean(amount.text)}
    };
  }
  function rowPosition(row,headerY,direction){return (Number(row.y)-headerY)*direction;}
  function detectDirection(rows,headerY){
    const totals=rows.filter(r=>isTotalRowText(r.text||'')&&Number.isFinite(Number(r.y)));
    const sideScore=(direction,total)=>{
      if(!total)return -1;
      const ty=Number(total.y);
      const between=rows.filter(r=>{
        const y=Number(r.y);if(!Number.isFinite(y)||isTotalRowText(r.text||''))return false;
        return direction>0?(y>headerY&&y<ty):(y<headerY&&y>ty);
      });
      // A real table body normally contains both descriptive text and numeric/economic rows.
      // This prevents a previous table's subtotal from pulling a later table upward.
      const numeric=between.filter(r=>/\d/.test(r.text||'')).length;
      const textual=between.filter(r=>/[A-Za-z]/.test(r.text||'')).length;
      return numeric*3+textual;
    };
    if(totals.length){
      const below=totals.filter(r=>Number(r.y)>headerY).sort((a,b)=>Number(a.y)-Number(b.y))[0]||null;
      const above=totals.filter(r=>Number(r.y)<headerY).sort((a,b)=>Number(b.y)-Number(a.y))[0]||null;
      if(below&&!above)return 1;
      if(above&&!below)return -1;
      if(below&&above){
        const downScore=sideScore(1,below),upScore=sideScore(-1,above);
        if(downScore!==upScore)return downScore>upScore?1:-1;
        return Math.abs(Number(below.y)-headerY)<=Math.abs(Number(above.y)-headerY)?1:-1;
      }
    }
    const plus=rows.filter(r=>Number(r.y)>headerY&&/\d/.test(r.text||'')).length;
    const minus=rows.filter(r=>Number(r.y)<headerY&&/\d/.test(r.text||'')).length;
    return plus>=minus?1:-1;
  }
  function numericTokenValue(text=''){
    const raw=clean(text).replace(/(?:SGD|S\$|\$)/ig,'').replace(/,/g,'').trim();
    if(!/^-?\d+(?:\.\d+)?$/.test(raw))return null;
    const n=Number(raw);return Number.isFinite(n)?n:null;
  }
  function moneyLike(text=''){
    const t=clean(text);
    return /(?:SGD|S\$|\$)/i.test(t)||/\d[\d,]*\.\d{2}$/.test(t);
  }
  function inferEconomicColumns(row){
    const items=(row?.items||[]).filter(it=>clean(it.text)).sort((a,b)=>center(a)-center(b));
    if(items.length<4)return null;
    const numeric=items.map((it,index)=>({it,index,x:center(it),value:numericTokenValue(it.text),money:moneyLike(it.text)})).filter(x=>x.value!==null);
    const matches=[];
    for(let qi=0;qi<numeric.length;qi++)for(let pi=qi+1;pi<numeric.length;pi++)for(let ai=pi+1;ai<numeric.length;ai++){
      const q=numeric[qi],p=numeric[pi],a=numeric[ai];
      if(!(q.value>0)||q.value>100000||p.value<0||a.value<0)continue;
      if(!p.money&&!a.money)continue;
      const delta=Math.abs(q.value*p.value-a.value),tol=Math.max(.03,Math.abs(a.value)*.003);
      if(delta>tol)continue;
      const before=items.filter(it=>center(it)<q.x);
      if(!before.length)continue;
      matches.push({q,p,a,delta,before});
    }
    matches.sort((a,b)=>a.delta-b.delta||a.q.x-b.q.x);
    const best=matches[0];if(!best)return null;

    const before=best.before.slice().sort((a,b)=>center(a)-center(b));
    let splitX=Math.min(...before.map(it=>Number(it.x)||center(it))),hasCode=false;
    if(before.length>=2){
      let bestGap={gap:-Infinity,index:-1};
      for(let i=0;i<before.length-1;i++){
        const right=(Number(before[i].x)||0)+(Number(before[i].width)||0),left=Number(before[i+1].x)||0,gap=left-right;
        if(gap>bestGap.gap)bestGap={gap,index:i};
      }
      const first=clean(before[0].text);
      const codeish=/^[A-Z0-9][A-Z0-9+._\/-]{2,}$/i.test(first)&&/[A-Z]/i.test(first)&&/\d/.test(first);
      if(codeish&&bestGap.gap>=Math.max(18,(Number(before[0].width)||0)*.25)){
        hasCode=true;
        const right=(Number(before[bestGap.index].x)||0)+(Number(before[bestGap.index].width)||0),left=Number(before[bestGap.index+1].x)||0;
        splitX=(right+left)/2;
      }
    }
    const leftEdge=Math.max(0,Math.min(...before.map(it=>Number(it.x)||0))-10);
    const qx=best.q.x,px=best.p.x,ax=best.a.x;
    const descriptionCandidates=before.filter(it=>!hasCode||center(it)>=splitX);
    const descriptionRight=Math.max(...(descriptionCandidates.length?descriptionCandidates:before).map(it=>(Number(it.x)||0)+(Number(it.width)||0)));
    const bDescQty=(descriptionRight+qx)/2;
    const bQtyPrice=(qx+px)/2,bPriceAmount=(px+ax)/2;
    const amountWidth=Math.max(60,(Number(best.a.it.width)||0)*2,(ax-px)*.9);
    return {
      hasCode,
      x:{description:hasCode?(splitX+bDescQty)/2:(leftEdge+bDescQty)/2,quantity:qx,unit_price:px,amount:ax,code:hasCode?(leftEdge+splitX)/2:null},
      boundaries:{
        code:hasCode?[leftEdge,splitX]:[leftEdge,leftEdge],
        description:[hasCode?splitX:leftEdge,bDescQty],
        quantity:[bDescQty,bQtyPrice],
        unit_price:[bQtyPrice,bPriceAmount],
        amount:[bPriceAmount,ax+amountWidth]
      },
      labels:{code:'',description:'',quantity:'',unit_price:'',amount:''},
      inferredFromEconomics:true,
      proof:{quantity:best.q.value,unit_price:best.p.value,amount:best.a.value,delta:best.delta}
    };
  }
  function median(values=[]){
    const a=(values||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);
    if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;
  }
  function detectEconomicBandTable(source,page){
    const rows=(page?.rows||[]).filter(r=>Array.isArray(r.items)&&r.items.length&&Number.isFinite(Number(r.y))).sort((a,b)=>Number(a.y)-Number(b.y));
    if(rows.length<3)return null;
    const width=Number(page?.width)||0,proofs=[];
    for(const row of rows){
      if(isTotalRowText(row.text||'')||HEADERLESS_META_RE.test(row.text||''))continue;
      const columns=inferEconomicColumns(row);if(!columns)continue;
      const qx=Number(columns.x?.quantity),px=Number(columns.x?.unit_price),ax=Number(columns.x?.amount);
      if(!(Number.isFinite(qx)&&Number.isFinite(px)&&Number.isFinite(ax)&&qx<px&&px<ax))continue;
      if(width&&qx<width*.48)continue;
      proofs.push({row,columns,qx,px,ax});
    }
    if(proofs.length<2)return null;
    const qx=median(proofs.map(x=>x.qx)),px=median(proofs.map(x=>x.px)),ax=median(proofs.map(x=>x.ax));
    if(![qx,px,ax].every(Number.isFinite)||!(qx<px&&px<ax))return null;
    const consistent=proofs.filter(x=>Math.abs(x.qx-qx)<=Math.max(90,width*.07)&&Math.abs(x.px-px)<=Math.max(90,width*.07)&&Math.abs(x.ax-ax)<=Math.max(100,width*.08));
    if(consistent.length<2)return null;
    const firstY=Math.min(...consistent.map(x=>Number(x.row.y))),lastY=Math.max(...consistent.map(x=>Number(x.row.y)));
    const headerCandidates=rows.filter(r=>Number(r.y)<firstY&&/\bDESCRIPTION\b/i.test(r.text||'')&&/\b(?:QTY|QUANTITY)\b/i.test(r.text||'')).sort((a,b)=>Number(b.y)-Number(a.y));
    const headerY=headerCandidates[0]?Number(headerCandidates[0].y):firstY-Math.max(12,Number(page.yTolerance)||3)*4;
    const totals=rows.filter(r=>Number(r.y)>lastY&&isTotalRowText(r.text||'')).sort((a,b)=>Number(a.y)-Number(b.y));
    const endY=totals[0]?Number(totals[0].y):Infinity;
    const bodyRows=rows.filter(r=>Number(r.y)>headerY&&Number(r.y)<endY-Math.max(1,Number(page.yTolerance)||3));
    if(!bodyRows.length)return null;
    const qLo=Math.max(0,qx-Math.max(180,(px-qx)*1.05)),qHi=(qx+px)/2,pHi=(px+ax)/2;
    const xs=bodyRows.flatMap(r=>(r.items||[]).map(i=>Number(i.x)).filter(Number.isFinite));
    const leftEdge=xs.length?Math.max(0,Math.min(...xs)-8):0;
    const columns={
      hasCode:false,x:{description:(leftEdge+qLo)/2,quantity:qx,unit_price:px,amount:ax},
      boundaries:{code:[leftEdge,leftEdge],description:[leftEdge,qLo],quantity:[qLo,qHi],unit_price:[qHi,pHi],amount:[pHi,ax+Math.max(100,(ax-px)*.9)]},
      ignoredColumns:{tax:null,discount:null},
      labels:{code:'',description:'DESCRIPTION',quantity:'QTY',unit_price:'UNIT PRICE',amount:'AMOUNT'},
      inferredFromEconomicBand:true,proofRows:consistent.length
    };
    return {id:[source.id,'p'+page.page,'band'+Math.round(headerY)].join(':'),source:source.id,sourceKind:source.kind,page:page.page,headerY,direction:1,
      yTolerance:Number(page.yTolerance)||3,columns,bodyRows,totalRow:totals[0]||null,confidence:.78,detectionMode:'economic-band'};
  }
  function detectHeaderlessTables(source,page){
    const rows=(page?.rows||[]).filter(r=>Array.isArray(r.items)&&r.items.length&&Number.isFinite(Number(r.y)));
    const out=[];
    for(const row of rows){
      if(isTotalRowText(row.text||'')||HEADERLESS_META_RE.test(row.text||''))continue;
      const columns=inferEconomicColumns(row);if(!columns)continue;
      out.push({
        id:[source.id,'p'+page.page,'econ'+Math.round(Number(row.y))].join(':'),
        source:source.id,sourceKind:source.kind,page:page.page,
        headerY:Number(row.y)-1,direction:1,yTolerance:Number(page.yTolerance)||3,
        columns,bodyRows:[row],totalRow:null,confidence:.72,detectionMode:'economic-row'
      });
    }
    return out;
  }

  function detectPageTables(source,page){
    const rows=(page?.rows||[]).filter(r=>Array.isArray(r.items)&&r.items.length&&Number.isFinite(Number(r.y)));
    const out=[],usedHeaderY=[];
    for(let i=0;i<rows.length;i++){
      const row=rows[i],txt=token(row.text||'');
      // Header labels are frequently emitted as separate PDF text objects at the same Y coordinate.
      // DESCRIPTION is only the seed; the merged horizontal band must prove Qty/Price/Amount.
      if(!/DESCRIPTION/.test(txt))continue;
      const items=mergedHeaderItems(rows,i,page.yTolerance),columns=findHeaderColumns(items);if(!columns)continue;
      const headerY=Number(row.y);
      if(usedHeaderY.some(y=>Math.abs(y-headerY)<=Math.max(6,Number(page.yTolerance)||3)*3))continue;
      usedHeaderY.push(headerY);
      const direction=detectDirection(rows,headerY);
      const positions=rows.map(r=>({row:r,pos:rowPosition(r,headerY,direction)})).filter(x=>x.pos>Math.max(2,Number(page.yTolerance)||3));
      const totalCandidates=positions.filter(x=>isTotalRowText(x.row.text||'')).sort((a,b)=>a.pos-b.pos);
      const endPos=totalCandidates[0]?.pos??Infinity;
      const body=positions.filter(x=>x.pos<endPos-Math.max(1,Number(page.yTolerance)||3)).sort((a,b)=>a.pos-b.pos).map(x=>x.row);
      if(!body.length)continue;
      out.push({
        id:[source.id,'p'+page.page,'h'+Math.round(headerY)].join(':'),
        source:source.id,
        sourceKind:source.kind,
        page:page.page,
        headerY,
        direction,
        yTolerance:Number(page.yTolerance)||3,
        columns,
        bodyRows:body,
        totalRow:totalCandidates[0]?.row||null,
        confidence:columns.hasCode?1:.9
      });
    }
    return out;
  }
  function detectTables(evidence={}){
    const all=[];
    for(const source of evidence.sources||[])for(const page of source.layout||[]){
      const headerTables=detectPageTables(source,page);
      if(headerTables.length)all.push(...headerTables);
      else{
        const band=detectEconomicBandTable(source,page);
        if(band)all.push(band);
        else all.push(...detectHeaderlessTables(source,page));
      }
    }
    return all;
  }
  global.InventoryHubParserV2TableDetector=Object.freeze({version:'2.5-economic-band',HEADER_RULES,TOTAL_RE,TAX_SUMMARY_RE,TAX_REGISTRATION_RE,isTotalRowText,HEADERLESS_META_RE,numericTokenValue,moneyLike,inferEconomicColumns,detectEconomicBandTable,detectHeaderlessTables,findHeaderColumns,detectPageTables,detectTables});
})(typeof window!=='undefined'?window:globalThis);
