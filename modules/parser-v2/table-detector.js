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
  const TOTAL_RE=/\b(?:SUB\s*TOTAL|SUBTOTAL|GST|GRAND\s+TOTAL|AMOUNT\s+DUE|INVOICE\s+TOTAL|TOTAL\s+AMOUNT)\b/i;

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
    const totals=rows.filter(r=>TOTAL_RE.test(r.text||'')&&Number.isFinite(Number(r.y)));
    if(totals.length){
      const nearest=totals.sort((a,b)=>Math.abs(Number(a.y)-headerY)-Math.abs(Number(b.y)-headerY))[0];
      const d=Math.sign(Number(nearest.y)-headerY);if(d)return d;
    }
    const plus=rows.filter(r=>Number(r.y)>headerY&&/\d/.test(r.text||'')).length;
    const minus=rows.filter(r=>Number(r.y)<headerY&&/\d/.test(r.text||'')).length;
    return plus>=minus?1:-1;
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
      const totalCandidates=positions.filter(x=>TOTAL_RE.test(x.row.text||'')).sort((a,b)=>a.pos-b.pos);
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
    for(const source of evidence.sources||[])for(const page of source.layout||[])all.push(...detectPageTables(source,page));
    return all;
  }
  global.InventoryHubParserV2TableDetector=Object.freeze({version:'2.0-shadow',HEADER_RULES,TOTAL_RE,findHeaderColumns,detectPageTables,detectTables});
})(typeof window!=='undefined'?window:globalThis);
