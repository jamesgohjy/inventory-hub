/* Parser V4.1.1 targeted table-cell OCR bridge.
 * Shadow-only integration for fixes 1-15.
 * Detects incomplete numbered invoice rows from OCR geometry and returns RAW OCR evidence only.
 * It never resolves quantity/price/amount values itself.
 */
(function(global){
  'use strict';
  const VERSION='4.1.1-cell-ocr-bridge-r8';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const moneyCount=v=>(String(v||'').match(/\d[\d,]*[.,]\d{2}/g)||[]).length;
  const rowOrdinal=v=>{
    const m=clean(v).match(/^[|)\]}>;,:\s]*(\d{1,2})\b/);
    return m?Number(m[1]):null;
  };
  const center=item=>Number(item?.x||0)+(Number(item?.width??item?.w??0)/2);
  const itemHeight=item=>Number(item?.height??item?.h??0)||18;
  const descriptionHeader=v=>/^(?:description|escription|descriptio[nr]?|d[e]?scription)$/i.test(clean(v));

  function findHeader(layout={}){
    const rows=layout.rows||[];
    // Invoice table headers are often stacked (for example, "Unit" above
    // "Price SGD") and OCR can split them into adjacent baselines. Anchor on
    // the description label, then resolve the numeric columns from a bounded
    // header band. A clipped initial D is a common scan/OCR error.
    const anchors=rows.filter(r=>(r.items||[]).some(x=>descriptionHeader(x.text)));
    const candidates=[];
    for(const header of anchors){
      const anchorHeight=Math.max(18,...(header.items||[]).map(itemHeight));
      const band=Math.max(100,anchorHeight*2.1);
      const nearby=rows.filter(r=>Math.abs(Number(r.y)-Number(header.y))<=band);
      const items=nearby.flatMap(r=>r.items||[]);
      const desc=items.find(x=>descriptionHeader(x.text));
      // Do not mistake the stacked "Unit Price" label for a quantity header;
      // scans often reduce the actual Qty label to a single "Q".
      const qty=items.find(x=>/^(?:q|qty|aty|q[yv]|quantity|units)$/i.test(clean(x.text)));
      // Some suppliers label the final invoice value column "Total" instead
      // of "Amount", and OCR may collapse "Unit Price" to "UnitPrice".
      // These are equivalent table headers, not assumptions about row values.
      const amount=[...items].reverse().find(x=>/\b(?:amount|total)\b/i.test(x.text||''));
      let price=[...items].reverse().find(x=>/\bprice\b|unitprice/i.test(x.text||''));
      if(!price)price=items.find(x=>/^unit$/i.test(clean(x.text)));
      if(desc&&price&&amount)candidates.push({row:header,items,desc,qty,price,amount,band,
        score:(qty?2:0)+(Number(header.items?.length)||0)});
    }
    candidates.sort((a,b)=>b.score-a.score);
    const chosen=candidates[0];if(!chosen)return null;
    const {row:header,items}=chosen;let {desc,qty,price,amount}=chosen;
    // Lost Qty text does not prevent raw cell OCR when the ordered money
    // columns independently establish the table's numeric column spacing.
    if(!qty){const x=2*center(price)-center(amount);if(x<=center(desc))return null;qty={x,width:0,inferred:true};}
    if(!qty)return null;
    const dc=center(desc),qc=center(qty),pc=center(price),ac=center(amount);
    if(!(dc<qc&&qc<pc&&pc<ac))return null;
    return {row:header,items,desc,qty,price,amount,centers:{desc:dc,qty:qc,price:pc,amount:ac}};
  }

  function bandRuleScore(imageData,x,y0,y1){
    const W=Number(imageData?.width),H=Number(imageData?.height),data=imageData?.data;
    if(!W||!H||!data||x<1||x>=W-1||y1<=y0)return 0;
    y0=Math.max(0,Math.floor(y0));y1=Math.min(H,Math.ceil(y1));let ink=0,total=(y1-y0)*3;
    for(let y=y0;y<y1;y++)for(let xx=x-1;xx<=x+1;xx++){
      const i=(y*W+xx)*4,g=Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2]);
      if(g<190)ink++;
    }
    return ink/total;
  }
  function traceColumnRule(imageData,bands,minX,maxX){
    const W=Number(imageData?.width),lo=Math.max(1,Math.ceil(minX)),hi=Math.min(W-2,Math.floor(maxX));
    if(!bands?.length||lo>hi)return null;
    let previous=null,used=0,total=0,weightedX=0,weightSum=0;const points=[];
    for(const band of bands){
      const centerY=(band.y0+band.y1)/2,drift=previous?Math.max(5,Math.ceil((centerY-previous.y)*.04)):Infinity;
      const x0=previous?Math.max(lo,previous.x-drift):lo,x1=previous?Math.min(hi,previous.x+drift):hi;
      let best=null;
      for(let x=x0;x<=x1;x++){
        const score=bandRuleScore(imageData,x,band.y0,band.y1);
        if(!best||score>best.score)best={x,score};
      }
      total++;
      if(best&&best.score>=.08){used++;weightedX+=best.x*best.score;weightSum+=best.score;previous={...best,y:centerY};points.push(previous);}
      else if(previous)previous={...previous,y:centerY};
    }
    if(used<Math.min(3,Math.ceil(total*.6))||used/total<.6)return null;
    if(!weightSum)return null;
    const meanY=points.reduce((s,p)=>s+p.y,0)/points.length,meanX=points.reduce((s,p)=>s+p.x,0)/points.length;
    const denom=points.reduce((s,p)=>s+(p.y-meanY)**2,0);
    const slope=denom?points.reduce((s,p)=>s+(p.y-meanY)*(p.x-meanX),0)/denom:0;
    return {x:Math.round(weightedX/weightSum),y:meanY,slope};
  }
  function detectColumnBounds(imageData,layout={},header=findHeader(layout)){
    // Trace column borders through blank gaps between numbered rows. Fitting
    // across the page handles mild scan skew; following the same rule from
    // gap to gap avoids stamp borders that appear only in part of the table.
    if(!header||!imageData?.data||Number(imageData.width)!==Number(layout.width))return null;
    const H=Number(layout.height),rows=layout.rows||[],descCenter=header.centers.desc,byOrdinal=new Map();
    const heights=(header.row.items||[]).map(itemHeight),hh=Math.max(18,...heights);
    for(const r of rows){
      const ordinal=rowOrdinal(r.text);if(ordinal===null||Number(r.y)>=Number(header.row.y))continue;
      const mark=(r.items||[]).filter(x=>clean(x.text).replace(/^[|({[;,]+|[|)}\];,]+$/g,'')===String(ordinal)
        &&center(x)<descCenter*.75).sort((a,b)=>center(a)-center(b))[0];
      if(!mark)continue;
      const h=itemHeight(mark),top=H-Number(mark.y)-(/^ocr/.test(String(layout.source||''))?0:h);
      const old=byOrdinal.get(ordinal);
      if(!old||((r.items||[]).length>(old.row.items||[]).length))byOrdinal.set(ordinal,{top,h,row:r});
    }
    const marks=[...byOrdinal.entries()].sort((a,b)=>a[1].top-b[1].top);
    if(marks.length<4)return null;
    const bands=[];
    for(let i=0;i<marks.length-1;i++){
      const [ord,a]=marks[i],[nextOrd,b]=marks[i+1];
      if(nextOrd!==ord+1)continue;
      const y0=Math.ceil(a.top+a.h*1.25),y1=Math.floor(b.top-b.h*.75);
      if(y1-y0>=Math.max(16,hh*.8))bands.push({y0,y1});
    }
    if(bands.length<3)return null;
    const c=header.centers;
    const radius=(gap,cap=260)=>Math.min(cap,Math.max(70,gap*.75));
    const qL=traceColumnRule(imageData,bands,c.qty-radius(c.qty-c.desc),c.qty-3);
    const qR=traceColumnRule(imageData,bands,c.qty+3,c.qty+radius(c.price-c.qty));
    const pR=traceColumnRule(imageData,bands,c.price+3,c.price+radius(c.amount-c.price));
    // The right edge belongs to the outer table border. Scale its search by
    // the Price-to-Amount header spacing instead of the fixed 260 px cap used
    // for interior separators. At high render DPI that cap can stop just
    // before the true border and select a stamp edge inside the Amount cell.
    const amountRightRadius=Math.max(70,(c.amount-c.price)*.75);
    const aR=traceColumnRule(imageData,bands,c.amount+3,c.amount+amountRightRadius);
    if(qL===null||qR===null||pR===null||aR===null)return null;
    const at=(line,y)=>line.x+line.slope*(y-line.y),headerY=H-Number(header.row.y);
    const bounds={qtyLeft:at(qL,headerY),unitLeft:at(qR,headerY),amountLeft:at(pR,headerY),amountRight:at(aR,headerY),lines:{qtyLeft:qL,unitLeft:qR,amountLeft:pR,amountRight:aR}};
    const quantityWidth=bounds.unitLeft-bounds.qtyLeft,amountWidth=bounds.amountRight-bounds.amountLeft;
    // A stamp can add a strong inner rule inside a numeric column. Reject a
    // traced pair that makes the narrow Qty column implausibly wide or leaves
    // the Amount heading far from the center of its detected cell.
    if(quantityWidth>(c.price-c.qty)*1.05||Math.abs((bounds.amountLeft+bounds.amountRight)/2-c.amount)>amountWidth*.4)return null;
    return bounds.qtyLeft<c.qty&&c.qty<bounds.unitLeft&&bounds.unitLeft<c.price
      &&c.price<bounds.amountLeft&&bounds.amountLeft<c.amount&&c.amount<bounds.amountRight?bounds:null;
  }

  function planTableCells(layout={},columnBounds=null){
    const header=findHeader(layout);
    if(!header||!Number(layout.width)||!Number(layout.height))return [];
    const H=Number(layout.height),W=Number(layout.width),hr=header.row;
    const rows=(layout.rows||[]).filter(r=>Number(r.y)<Number(hr.y));
    // Some OCR layouts lose the invoice's bottom Total row. Without a second
    // boundary, numbered Terms & Conditions paragraphs can be mistaken for
    // invoice lines (especially with PSM 6). Treat common post-table legal and
    // payment sections as hard table terminators too.
    const stop=rows.find(r=>/^(?:remarks?|sub\s*total|subtotal|gst\b|total\b|amount\s+due|terms\s*(?:&|and)\s*conditions|payment\s+terms|bank\s+details|please\s+make\s+(?:payment|cheques?)|buyers\s+purchasing)/i.test(clean(r.text).replace(/^[^A-Za-z]+/,'')));
    const stopY=stop?Number(stop.y):-Infinity;
    const c=header.centers;
    const qtyPredecessor=(header.items||[]).filter(x=>center(x)>c.desc&&center(x)<c.qty)
      .sort((a,b)=>center(b)-center(a))[0];
    // A Serial No. column may sit between Description and Qty. Using the
    // Description/Qty midpoint then includes the row ordinal and description
    // in a very wide quantity crop, producing tokens such as 11. Anchor the
    // crop at the nearest intervening column header when present.
    const qtyBoundary=qtyPredecessor?(center(qtyPredecessor)+c.qty)/2:(c.desc+c.qty)/2;
    const fallback={qtyLeft:qtyBoundary,unitLeft:(c.qty+c.price)/2,
      amountLeft:(c.price+c.amount)/2,amountRight:Math.min(W,c.amount+Math.max(100,(c.amount-c.price)*0.85))};
    const validBounds=columnBounds&&columnBounds.qtyLeft>0&&columnBounds.qtyLeft<columnBounds.unitLeft
      &&columnBounds.unitLeft<columnBounds.amountLeft&&columnBounds.amountLeft<columnBounds.amountRight
      &&columnBounds.amountRight<=W;
    const boundsAt=y=>validBounds?Object.fromEntries(['qtyLeft','unitLeft','amountLeft','amountRight'].map(k=>{
      const line=columnBounds.lines?.[k];return [k,line?line.x+line.slope*(y-line.y):columnBounds[k]];
    })):fallback;
    const {qtyLeft,unitLeft,amountLeft,amountRight}=boundsAt(H-Number(hr.y));
    const productHeader=(header.items||[]).filter(x=>/^(?:product\s*no\.?|item\s*no\.?|sku)$/i.test(clean(x.text)));
    const codeRight=productHeader.length?Math.max(...productHeader.map(x=>Number(x.x||0)+Number(x.width??x.w??0))):null;
    const descLeft=codeRight!==null?Math.min(Number(header.desc.x||0),codeRight+40):Math.max(0,Number(header.desc.x||0)-Math.max(40,(Number(header.qty.x||0)-Number(header.desc.x||0))*.55));
    const equipment=/\b(?:mixers?|amplifiers?|loudspeakers?|speakers?|microphones?|projectors?|displays?|monitors?|players?|cameras?|receivers?|transmitters?|processors?|controllers?|consoles?|receptacles?)\b/i;
    const numbered=rows.filter(r=>rowOrdinal(r.text)!==null&&equipment.test(r.text||''))
      .sort((a,b)=>Number(b.y)-Number(a.y));
    const third=numbered.find(r=>rowOrdinal(r.text)===3),fifth=numbered.find(r=>rowOrdinal(r.text)===5);
    if(third&&fifth)console.info('Certification cell OCR gap geometry',JSON.stringify(rows
      .filter(r=>Number(r.y)<Number(third.y)&&Number(r.y)>Number(fifth.y))
      .map(r=>({y:r.y,text:clean(r.text),items:(r.items||[]).map(x=>({text:clean(x.text),x:x.x,y:x.y}))}))));
    const inferred=new Map();
    for(let i=0;i<numbered.length-1;i++){
      const upper=numbered[i],lower=numbered[i+1];
      if(rowOrdinal(lower.text)!==rowOrdinal(upper.text)+2)continue;
      const between=rows.filter(r=>Number(r.y)<Number(upper.y)&&Number(r.y)>Number(lower.y)
        &&rowOrdinal(r.text)===null&&equipment.test(r.text||'')
        &&!/\bmodel\s*:/i.test(r.text||'')
        &&(r.items||[]).some(x=>center(x)>=descLeft&&center(x)<qtyLeft&&equipment.test(x.text||'')));
      // Infer only one missing ordinal from exactly one description line between
      // two independently numbered equipment rows. Ambiguity stays in Review.
      if(between.length===1)inferred.set(between[0],rowOrdinal(upper.text)+1);
    }
    const plans=[];
    for(const r of rows){
      if(Number(r.y)<=stopY)continue;
      const ord=rowOrdinal(r.text)??inferred.get(r)??null;
      if(ord===null)continue;
      // A table number in the Qty column or a repeated OCR fragment is not a
      // physical item row. Do not run expensive cell OCR on it, nor on an
      // explicitly described service row. Unrecognised item descriptions
      // remain eligible; this is a geometry and service boundary, not a
      // fixed list of equipment names or invoice ordinals.
      const descItems=(r.items||[]).filter(x=>center(x)>=descLeft&&center(x)<qtyLeft&&/[A-Za-z]{3}/.test(x.text||''));
      if(!descItems.length&&!equipment.test(r.text||''))continue;
      const descText=clean(r.text);
      if(/\b(?:installation|dismantle|remove\s+old|labell?ing|tidying|scope\s+of\s+work)\b/i.test(descText))continue;
      // "Supply & install" can describe a supplied physical product as well
      // as a service. Keep it eligible only when the same row names equipment;
      // downstream service classification remains authoritative.
      if(/\bsupply\s*(?:&|and)?\s*install\b/i.test(descText)&&!equipment.test(descText))continue;
      // A complete-looking whole-page pair can still be wrong under a stamp.
      // Check every numbered table row; completeness is not proof of accuracy.
      const items=r.items||[];
      if(!items.length)continue;
      const hs=items.map(itemHeight).filter(x=>x>0);
      const ordinalMarks=items.filter(x=>clean(x.text)===String(ord)&&center(x)<center(header.desc)*0.75)
        .sort((a,b)=>center(a)-center(b));
      let top,h;
      if(ordinalMarks.length){
        // OCR rows can merge several text baselines around a stamp or border.
        // Anchor the numeric strip on the printed row number, which shares a
        // baseline with quantity and price, instead of the merged row's union.
        const mark=ordinalMarks[0],markHeight=itemHeight(mark),markTop=H-Number(mark.y);
        top=Math.max(0,Math.floor(markTop-markHeight*.35));
        h=Math.min(H-top,Math.max(44,Math.ceil(markHeight*2.4)));
      }else{
        const tops=items.map(x=>H-Number(x.y||0)).filter(Number.isFinite);
        top=Math.max(0,Math.min(...tops)-Math.max(8,(Math.max(...hs)||18)*0.45));
        h=Math.min(H-top,Math.max(38,(Math.max(...hs)||18)*2.1));
      }
      const rowBounds=boundsAt(top+h/2);
      const box=(x0,x1)=>({x:Math.max(0,Math.floor(x0)),y:Math.max(0,Math.floor(top)),w:Math.max(10,Math.ceil(x1-x0)),h:Math.max(20,Math.ceil(h))});
      // Keep the printed vertical grid rules outside the numeric glyph crop.
      const numericBox=(x0,x1)=>{const pad=Math.min(10,Math.max(2,Math.round((x1-x0)*.025)));return box(x0+pad,x1-pad);};
      plans.push({
        ordinal:ord,
        rowText:clean(r.text),
        description:box(descLeft,qtyLeft),
        quantity:numericBox(rowBounds.qtyLeft,rowBounds.unitLeft),
        unit_price:numericBox(rowBounds.unitLeft,rowBounds.amountLeft),
        amount:numericBox(rowBounds.amountLeft,rowBounds.amountRight)
      });
    }
    return plans;
  }

  // Some invoice tables number only the product-code column, so a valid row
  // such as "AVS-320 ... 1 350.00 350.00" has no leading ordinal. Build a
  // second plan from the OCR word positions: description words must sit left
  // of Qty, and one printed value must fall inside each numeric column.
  function planUnnumberedPositionedRows(layout={},columnBounds=null){
    const header=findHeader(layout);if(!header||!Number(layout.width)||!Number(layout.height))return [];
    const H=Number(layout.height),W=Number(layout.width),c=header.centers,rows=layout.rows||[];
    const qtyPredecessor=(header.items||[]).filter(x=>center(x)>c.desc&&center(x)<c.qty)
      .sort((a,b)=>center(b)-center(a))[0];
    const qtyBoundary=qtyPredecessor?(center(qtyPredecessor)+c.qty)/2:(c.desc+c.qty)/2;
    const fallback={qtyLeft:qtyBoundary,unitLeft:(c.qty+c.price)/2,
      amountLeft:(c.price+c.amount)/2,amountRight:Math.min(W,c.amount+Math.max(100,(c.amount-c.price)*.85))};
    const valid=columnBounds&&columnBounds.qtyLeft>0&&columnBounds.qtyLeft<columnBounds.unitLeft
      &&columnBounds.unitLeft<columnBounds.amountLeft&&columnBounds.amountLeft<columnBounds.amountRight&&columnBounds.amountRight<=W;
    const bounds=valid?columnBounds:fallback;
    const productHeader=(header.items||[]).filter(x=>/^(?:product\s*no\.?|item\s*no\.?|sku)$/i.test(clean(x.text)));
    const codeRight=productHeader.length?Math.max(...productHeader.map(x=>Number(x.x||0)+Number(x.width??x.w??0))):null;
    const descLeft=codeRight!==null?Math.min(Number(header.desc.x||0),codeRight+40):Math.max(0,Number(header.desc.x||0)-Math.max(40,(Number(header.qty.x||0)-Number(header.desc.x||0))*.55));
    const equipment=/\b(?:mixers?|amplifiers?|loudspeakers?|speakers?|microphones?|headsets?|head\s*mics?|projectors?|displays?|monitors?|players?|cameras?|receivers?|transmitters?|processors?|controllers?|consoles?|receptacles?|trolleys?|adapters?)\b/i;
    const money=/^[|$]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\s*[|/$]{0,3}$/;
    const stop=rows.find(r=>Number(r.y)<Number(header.row.y)&&/^(?:remarks?|sub\s*total|subtotal|gst\b|total\b|amount\s+due)/i.test(clean(r.text).replace(/^[^A-Za-z]+/,'')));
    const stopY=stop?Number(stop.y):-Infinity,plans=[];
    for(const r of rows){
      if(Number(r.y)>=Number(header.row.y)||Number(r.y)<=stopY||rowOrdinal(r.text)!==null)continue;
      const items=r.items||[],descItems=items.filter(x=>center(x)>=descLeft&&center(x)<bounds.qtyLeft&&/[A-Za-z]{3}/.test(x.text||''));
      if(!descItems.length)continue;
      const desc=clean(descItems.sort((a,b)=>center(a)-center(b)).map(x=>x.text).join(' '));
      if(!equipment.test(desc)||/\b(?:installation|labou?r|delivery|shipping|freight|dismantle|remove\s+old|maintenance|service\s+fee)\b/i.test(desc))continue;
      const inColumn=(left,right)=>items.filter(x=>center(x)>=left&&center(x)<right);
      const qItems=inColumn(bounds.qtyLeft,bounds.unitLeft).filter(x=>/^\d{1,2}$/.test(clean(x.text)));
      const uItems=inColumn(bounds.unitLeft,bounds.amountLeft).filter(x=>money.test(clean(x.text)));
      const aItems=inColumn(bounds.amountLeft,bounds.amountRight).filter(x=>money.test(clean(x.text)));
      // If OCR loses the quantity glyph in its word layout, the description
      // and both money columns still localize the physical row. Plan the Qty
      // crop from the table header geometry and let cell OCR read it; never
      // synthesize the quantity from the amount and unit price.
      if(qItems.length>1||uItems.length!==1||aItems.length!==1)continue;
      const all=[...items],top=Math.max(0,Math.floor(Math.min(...all.map(x=>H-Number(x.y||0)))-3));
      const bottom=Math.min(H,Math.ceil(Math.max(...all.map(x=>H-Number(x.y||0)+itemHeight(x)))+3));
      const h=Math.max(24,bottom-top);
      const box=(x0,x1)=>({x:Math.max(0,Math.floor(x0)),y:top,w:Math.max(10,Math.ceil(x1-x0)),h});
      const numericBox=(x0,x1)=>{const pad=Math.min(10,Math.max(2,Math.round((x1-x0)*.025)));return box(x0+pad,x1-pad);};
      plans.push({ordinal:null,rowText:`${desc}${qItems[0]?` ${qItems[0].text}`:''} ${uItems[0].text} ${aItems[0].text}`,
        description:box(descLeft,bounds.qtyLeft),quantity:numericBox(bounds.qtyLeft,bounds.unitLeft),
        unit_price:numericBox(bounds.unitLeft,bounds.amountLeft),amount:numericBox(bounds.amountLeft,bounds.amountRight)});
    }
    return plans;
  }

  function positionedNumericEvidence(layout={},plan={},pageNumber=1,renderDpi=0,ocrVariant='page'){
    if(!Number.isFinite(renderDpi)||renderDpi<300||!Number(layout.height))return {quantity_ocr:[],unit_price_ocr:[],amount_ocr:[]};
    const H=Number(layout.height),items=layout.items||[];
    const rowKey=String(plan.ordinal??clean(plan.rowText).toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,80));
    const read=(box,kind)=>{
      const rowCenter=box.y+box.h/2,rowTolerance=Math.max(12,Math.min(30,box.h*.35));
      const hits=items.filter(x=>{
        const cx=center(x),top=H-Number(x.y||0),cy=top+itemHeight(x)/2;
        return cx>=box.x&&cx<box.x+box.w&&Math.abs(cy-rowCenter)<=rowTolerance;
      }).map(x=>clean(x.text)).filter(t=>kind==='quantity'?/^\d{1,2}(?:\.00)?$/.test(t):/^(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(t));
      return hits.length===1?[{text:hits[0],variant:`positioned-${ocrVariant}-${kind}`,evidenceType:'positioned-cell',evidenceGroupId:`p${pageNumber}:${ocrVariant}:${rowKey}:${kind}:positioned`,scope:'cell',page:pageNumber,renderDpi}]:[];
    };
    return {quantity_ocr:read(plan.quantity,'quantity'),unit_price_ocr:read(plan.unit_price,'money'),amount_ocr:read(plan.amount,'money')};
  }

  function cropCanvas(source,box){
    const c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(box.w));c.height=Math.max(1,Math.round(box.h));
    const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(source,box.x,box.y,box.w,box.h,0,0,c.width,c.height);
    return c;
  }
  function thresholdCanvas(source,threshold){
    const c=document.createElement('canvas');c.width=source.width;c.height=source.height;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
    const img=ctx.getImageData(0,0,c.width,c.height),d=img.data;
    for(let i=0;i<d.length;i+=4){
      const g=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]),v=g<threshold?0:255;
      d[i]=d[i+1]=d[i+2]=v;
    }
    ctx.putImageData(img,0,0);return c;
  }
  async function recognize(worker,canvas,psm,Tesseract,meta={}){
    await worker.setParameters({
      tessedit_pageseg_mode:psm,
      preserve_interword_spaces:'1',
      user_defined_dpi:'300',
      tessedit_char_whitelist:meta.numeric?'0123456789.,':''
    });
    const r=await worker.recognize(canvas,{}, {text:true});
    const text=clean(r?.data?.text||'');
    return text?{text,confidence:Number(r?.data?.confidence||0),...meta}:null;
  }
  // A separately printed warranty product code can corroborate a priced row's
  // identity. Crop the two printed lines independently; never create a priced
  // row or infer an identity from the warranty line alone.
  function planProductCodeWitnesses(layout={}){
    const H=Number(layout.height),rows=layout.rows||[];
    if(!H||!rows.some(r=>/\bPRODUCT\s*(?:NO\.?|NUMBER|CODE)\b/i.test(r.text||'')))return [];
    const header=rows.find(r=>/\bPRODUCT\s*(?:NO\.?|NUMBER|CODE)\b/i.test(r.text||''));
    const desc=(header.items||[]).find(x=>/description/i.test(x.text||''));
    if(!desc)return [];
    const candidates=rows.filter(r=>Number(r.y)<Number(header.y)).sort((a,b)=>Number(b.y)-Number(a.y));
    const codeLine=(r,right)=>{
      const items=(r.items||[]).filter(x=>Number(x.x)<right);
      if(!items.length)return null;
      const top=Math.max(0,Math.floor(Math.min(...items.map(x=>H-Number(x.y)))-8));
      const bottom=Math.min(H,Math.ceil(Math.max(...items.map(x=>H-Number(x.y)+itemHeight(x)))+8));
      return {x:Math.max(0,Math.floor(Math.min(...items.map(x=>Number(x.x)))-12)),y:top,
        w:Math.max(10,Math.ceil(right-Math.min(...items.map(x=>Number(x.x)))+12)),h:Math.max(20,bottom-top)};
    };
    const plans=[];
    for(let i=1;i<candidates.length;i++){
      const companion=candidates[i],primary=candidates[i-1];
      if(!/\b(?:WT\s+FOR|WARRANTY)\b/i.test(companion.text||''))continue;
      if(!/\b\d{1,4}\s+\d[\d,]*\.\d{2}\s+\d[\d,]*\.\d{2}\b/.test(primary.text||''))continue;
      const gap=Number(primary.y)-Number(companion.y);
      if(gap<=0||gap>Math.max(100,itemHeight((primary.items||[])[0])*3.2))continue;
      const warrantyDescription=(companion.items||[]).find(x=>/^(?:FOC|WARRANTY)$/i.test(clean(x.text))&&Number(x.x)>Number(desc.x)*.35);
      const right=Math.min(Number(desc.x)-12,warrantyDescription?Number(warrantyDescription.x)-12:Infinity);
      if(right<80)continue;
      const first=codeLine(primary,right),second=codeLine(companion,right);
      if(first&&second)plans.push({primary:first,companion:second,rowText:clean(primary.text),warrantyText:clean(companion.text)});
    }
    return plans;
  }
  // A priced product-code cell is stronger than whole-page OCR for a final
  // model revision. It is retained as row-bound evidence only; the runtime
  // still sends any identity change to Review and blocks automatic saving.
  function planPricedProductCodeCells(layout={}){
    const H=Number(layout.height),rows=layout.rows||[];
    if(!H)return [];
    const header=findHeader(layout);
    if(!header?.desc)return [];
    const right=Math.max(20,Math.floor(Number(header.desc.x)-12));
    const plans=[];
    for(const row of rows){
      if(Number(row.y)>=Number(header.row.y))continue;
      const rowText=clean(row.text);
      if(!/\b\d{1,4}(?:\.\d+)?\s+(?:S?\$?\s*)?\d[\d,]*\.\d{2}\s+(?:S?\$?\s*)?\d[\d,]*\.\d{2}\b/.test(rowText))continue;
      const items=(row.items||[]).filter(x=>Number(x.x)<right).sort((a,b)=>Number(a.x)-Number(b.x));
      if(!items.length)continue;
      // Keep only the leftmost contiguous token group. A product code can be
      // split into a base and a detached revision digit, but the following
      // description normally begins after a much larger printed gap.
      const codeItems=[items[0]];
      for(let i=1;i<items.length;i++){
        const prev=codeItems.at(-1),gap=Number(items[i].x)-(Number(prev.x)+Number(prev.width??prev.w??0));
        if(gap>Math.max(50,itemHeight(prev)*3))break;
        codeItems.push(items[i]);
      }
      const top=Math.max(0,Math.floor(Math.min(...codeItems.map(x=>H-Number(x.y)))-10));
      const bottom=Math.min(H,Math.ceil(Math.max(...codeItems.map(x=>H-Number(x.y)+itemHeight(x)))+10));
      const left=Math.max(0,Math.floor(Number(codeItems[0].x)-14));
      const codeRight=Math.min(right,Math.ceil(Math.max(...codeItems.map(x=>Number(x.x)+Number(x.width??x.w??0)))+14));
      if(codeRight-left<20||bottom-top<16)continue;
      plans.push({primary:{x:left,y:top,w:Math.ceil(codeRight-left),h:Math.ceil(bottom-top)},rowText});
    }
    return plans;
  }
  function productCodeToken(raw='',warranty=false){
    let s=clean(raw).toUpperCase().replace(/^[|:;,.\s]+/,'');
    if(warranty){const mark=s.search(/\s*-\s*(?:WT\s+FOR|WARRANTY)\b/);if(mark<0)return '';s=s.slice(0,mark);}
    else s=s.split(/\s{2,}/)[0];
    s=s.replace(/\s+/g,'').replace(/[^A-Z0-9/.-]/g,'');
    return /^[A-Z][A-Z0-9/.-]{4,}$/.test(s)?s:'';
  }
  const sameProductCodeShape=(a,b)=>!!a&&!!b&&a.length===b.length
    &&a.replace(/S/g,'5').replace(/O/g,'0').replace(/[IL]/g,'1')===b.replace(/S/g,'5').replace(/O/g,'0').replace(/[IL]/g,'1');
  async function extractProductCodeWitnesses({canvas,layout,worker,Tesseract,pageNumber=1}={}){
    const out=[];
    const plans=planProductCodeWitnesses(layout).slice(0,8);
    for(const plan of plans){
      const first=await recognize(worker,cropCanvas(canvas,plan.primary),Tesseract?.PSM?.SINGLE_LINE??'7',Tesseract,{variant:'product-code-primary'});
      const second=await recognize(worker,cropCanvas(canvas,plan.companion),Tesseract?.PSM?.SINGLE_LINE??'7',Tesseract,{variant:'product-code-warranty'});
      const primary=productCodeToken(first?.text),companion=productCodeToken(second?.text,true);
      // The companion is a different printed line. Permit only common OCR
      // glyph-shape substitutions, retain both raw readings, and leave any
      // correction in Review instead of treating it as certified identity.
      if(sameProductCodeShape(primary,companion))out.push({page:pageNumber,sku:primary,rowText:plan.rowText,
        primaryRaw:first.text,companionRaw:second.text,primaryBox:plan.primary,companionBox:plan.companion});
    }
    // These crops do not certify a model by themselves. They give the runtime
    // a row-bound reading to compare with whole-page OCR under its Review gate.
    for(const plan of planPricedProductCodeCells(layout).slice(0,12)){
      const reading=await recognize(worker,cropCanvas(canvas,plan.primary),Tesseract?.PSM?.SINGLE_LINE??'7',Tesseract,{variant:'product-code-priced-cell'});
      const sku=productCodeToken(reading?.text);
      if(!sku)continue;
      const key=sku+'|'+plan.rowText;
      if(out.some(x=>(x.sku+'|'+x.rowText)===key))continue;
      out.push({page:pageNumber,sku,rowText:plan.rowText,primaryRaw:reading.text,companionRaw:'',primaryBox:plan.primary,pricedCell:true});
    }
    return out;
  }
  function referenceShapeCorrection(token,widths,labelO){
    if(!/^[A-Z]0[A-Z0-9._\/-]+$/.test(token||'')||widths.length!==token.length||!labelO)return null;
    const slash=token.indexOf('/');
    const zeroWidths=[...token].flatMap((c,i)=>c==='0'&&i>2&&i>slash?[widths[i]]:[]);
    if(slash<3||zeroWidths.length<2)return null;
    const candidate=widths[1],maxZero=Math.max(...zeroWidths);
    if(candidate<maxZero+2||Math.abs(candidate-labelO)>2)return null;
    return token[0]+'O'+token.slice(2);
  }
  function referenceShapeWitness(source,token,threshold){
    const {width,height}=source,ctx=source.getContext('2d',{willReadFrequently:true});
    const d=ctx.getImageData(0,0,width,height).data,runs=[];let start=-1;
    for(let x=0;x<=width;x++){
      let dark=0;
      if(x<width)for(let y=0;y<height;y++){const i=(y*width+x)*4;if(.299*d[i]+.587*d[i+1]+.114*d[i+2]<threshold)dark++;}
      if(dark>=2&&start<0)start=x;
      if((dark<2||x===width)&&start>=0){runs.push({x:start,w:x-start});start=-1;}
    }
    if(runs.length<token.length+2)return null;
    let gap=-1,split=-1;
    for(let i=1;i<runs.length;i++){const g=runs[i].x-runs[i-1].x-runs[i-1].w;if(g>gap){gap=g;split=i;}}
    console.info('Certification reference glyph geometry',JSON.stringify({token,threshold,gap,split,first:runs[0]?.w,tokenWidths:runs.slice(split).map(r=>r.w)}));
    if(gap<20||split<2||runs.length-split!==token.length)return null;
    return referenceShapeCorrection(token,runs.slice(split).map(r=>r.w),runs[0].w);
  }
  async function numericEnsemble(worker,source,Tesseract){
    const out=[],line=Tesseract?.PSM?.SINGLE_LINE??'7',block=Tesseract?.PSM?.SINGLE_BLOCK??'6';
    const variants=[
      {canvas:source,psm:line,label:'raw-line'},
      {canvas:thresholdCanvas(source,75),psm:line,label:'t75-line'},
      {canvas:thresholdCanvas(source,100),psm:line,label:'t100-line'},
      {canvas:thresholdCanvas(source,125),psm:line,label:'t125-line'},
      {canvas:thresholdCanvas(source,165),psm:line,label:'t165-line'},
      {canvas:thresholdCanvas(source,195),psm:line,label:'t195-line'},
      {canvas:thresholdCanvas(source,210),psm:block,label:'t210-block'}
    ];
    for(const v of variants){
      const hit=await recognize(worker,v.canvas,v.psm,Tesseract,{variant:v.label,numeric:true});
      if(hit)out.push(hit);
    }
    return out;
  }

  function cleanNumericVotes(hits,quantity=false){
    const counts=new Map();
    for(const h of hits){
      const s=clean(h.text).replace(/^[|()[\]{},;:.\s]+|[|()[\]{},;:.\s]+$/g,'');
      if(!(quantity?/^\d{1,2}(?:\.00)?$/:/^(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/).test(s))continue;
      const v=Number(s.replace(/,/g,'')),set=counts.get(v)||new Set();set.add(h.variant);counts.set(v,set);
    }
    return counts.size===1&&[...counts.values()][0].size>=2;
  }

  // Long straight rules from a table or overlaid stamp can join otherwise
  // printed digits. Remove only lines that continue well beyond this cell,
  // then OCR narrow bands. This supplies raw alternatives, never a value.
  function ruleRemovedCell(canvas,box,pixels,preserveGlyph=false){
    const W=canvas.width,H=canvas.height,gray=(x,y)=>{
      const i=(y*W+x)*4,d=pixels.data;return .299*d[i]+.587*d[i+1]+.114*d[i+2];
    };
    const x0=Math.max(0,box.x-Math.max(45,box.w*1.5)),x1=Math.min(W,box.x+box.w+45);
    const y0=Math.max(0,box.y-box.h*2),y1=Math.min(H,box.y+box.h*3);
    const vertical=[];
    for(let x=box.x;x<Math.min(W,box.x+box.w);x++){
      let dark=0;for(let y=Math.floor(y0);y<Math.ceil(y1);y++)if(gray(x,y)<145)dark++;
      if(dark/(y1-y0)>.52)vertical.push(x);
    }
    const horizontal=[];
    for(let y=box.y;y<Math.min(H,box.y+box.h);y++){
      let dark=0;for(let x=Math.floor(x0);x<Math.ceil(x1);x++)if(gray(x,y)<145)dark++;
      if(dark/(x1-x0)>.50)horizontal.push(y);
    }
    const retainThin=positions=>{
      const out=[];let run=[];
      for(const p of positions){if(run.length&&p>run[run.length-1]+1){if(run.length<=8)out.push(...run);run=[];}run.push(p);}
      if(run.length&&run.length<=8)out.push(...run);return out;
    };
    const vx=retainThin(vertical),hy=retainThin(horizontal);
    console.info('Certification rule geometry',JSON.stringify({box,vertical:vx,horizontal:hy}));
    if(!vx.length&&!hy.length)return null;
    const c=cropCanvas(canvas,box),ctx=c.getContext('2d',{willReadFrequently:true}),im=ctx.getImageData(0,0,c.width,c.height);
    const whiten=(x,y)=>{if(x<0||y<0||x>=c.width||y>=c.height)return;const i=(y*c.width+x)*4;im.data[i]=im.data[i+1]=im.data[i+2]=255;};
    for(const x of vx)for(let dx=-2;dx<=2;dx++)for(let y=0;y<c.height;y++){
      // A continued stamp rule may cross the leading printed digit. Keep
      // ink in the baseline itself in this alternative reading.
      if(preserveGlyph&&y>=c.height*.28&&y<=c.height*.84)continue;
      whiten(x-box.x+dx,y);
    }
    for(const y of hy)for(let dy=-1;dy<=1;dy++)for(let x=0;x<c.width;x++)whiten(x,y-box.y+dy);
    ctx.putImageData(im,0,0);return c;
  }
  async function ruleBandEnsemble(worker,canvas,box,pixels,Tesseract,kind='amount'){
    const cleaned=ruleRemovedCell(canvas,box,pixels);if(!cleaned)return [];
    const out=[],psm=Tesseract?.PSM?.SINGLE_LINE??'7';
    const [left,right]=kind==='quantity'?[.32,.80]:kind==='unit'?[0,.98]:[.28,.83];
    const sx=Math.round(cleaned.width*left),sw=Math.max(15,Math.round(cleaned.width*(right-left)));
    for(const [i,fraction] of [.28,.38,.48].entries()){
      const c=document.createElement('canvas');
      c.width=sw;c.height=Math.max(24,Math.round(cleaned.height*(cleaned.height>90?.42:.68)));
      const sy=Math.round(cleaned.height*fraction),sh=Math.min(c.height,cleaned.height-sy);
      c.getContext('2d').drawImage(cleaned,sx,sy,sw,sh,0,0,c.width,c.height);
      for(const threshold of [100,130,150]){
        const hit=await recognize(worker,thresholdCanvas(c,threshold),psm,Tesseract,{variant:`rule-band-${i}-t${threshold}`,numeric:true});
        if(hit)out.push({...hit,scope:'cell'});
      }
    }
    // The stamp may occupy most of a tall planned row while the printed
    // figure occupies one narrow baseline. Keep these reads separate from
    // the broad band variants so the parser can detect disagreement.
    const ranges=kind==='quantity'?[[.47,.61]]:kind==='unit'?[[.10,.83]]:[[.33,.77]];
    for(const [leftEdge,rightEdge] of ranges){
      const x=Math.round(cleaned.width*leftEdge),width=Math.round(cleaned.width*(rightEdge-leftEdge));
      for(const [i,fraction] of [.35,.43,.51].entries()){
        const y=Math.round(cleaned.height*fraction),height=Math.min(Math.max(24,Math.round(cleaned.height*.34)),cleaned.height-y);
        const c=document.createElement('canvas');c.width=width;c.height=height;
        c.getContext('2d').drawImage(cleaned,x,y,width,height,0,0,width,height);
        for(const threshold of [85,110,140]){
          const hit=await recognize(worker,thresholdCanvas(c,threshold),psm,Tesseract,{variant:`tight-band-${i}-t${threshold}`,numeric:true});
          if(hit)out.push({...hit,scope:'cell'});
        }
      }
    }
    return out;
  }

  // Read the printed numeric baseline at enlarged scale. A low-resolution
  // approval stamp can fill the rest of the row, so broad crops are retained
  // as contradictory evidence while these independent spatial reads identify
  // intact glyphs. No numeric value is manufactured by this stage.
  async function baselineEnsemble(worker,source,Tesseract,kind){
    const out=[],line=Tesseract?.PSM?.SINGLE_LINE??'7',rawLine=Tesseract?.PSM?.RAW_LINE??'13';
    const ranges=kind==='quantity'?[[.47,.58],[.48,.59]]:kind==='unit'?[[0,.88],[.05,.80],[.08,.80]]:[[.31,.76],[.315,.76],[.35,.78]];
    const fractions=kind==='quantity'?[.35,.40,.45]:[.36,.46];
    const thresholds=kind==='quantity'?[80,110,140]:[80,100,130,160,180,200];
    for(const [ri,[left,right]] of ranges.entries())for(const [fi,fraction] of fractions.entries()){
      const sx=Math.round(source.width*left),sw=Math.max(12,Math.round(source.width*right)-sx);
      const sy=Math.round(source.height*fraction),sh=Math.min(source.height-sy,kind==='quantity'?35:Math.min(40,Math.round(source.height*.51)));
      if(sh<20)continue;
      const c=document.createElement('canvas');c.width=sw*3;c.height=sh*3;
      c.getContext('2d').drawImage(source,sx,sy,sw,sh,0,0,c.width,c.height);
      for(const threshold of thresholds)for(const [pi,psm] of (kind==='quantity'?[line]:[line,rawLine]).entries()){
        const hit=await recognize(worker,thresholdCanvas(c,threshold),psm,Tesseract,{variant:`baseline-${ri}-${fi}-${threshold}-${pi}`,numeric:true});
        if(hit)out.push({...hit,scope:'cell'});
      }
    }
    return out;
  }
  async function ruleBaselineEnsemble(worker,cleaned,Tesseract,prefix='baseline-rule'){
    if(!cleaned)return [];
    const out=[];
    const preserved=prefix==='baseline-preserved';
    const ranges=preserved?[[.27,.76],[.28,.76],[.29,.76],[.35,.78]]:[[.28,.76],[.35,.78]];
    const fractions=preserved?[.38,.40,.42,.44]:[.40,.44,.50];
    for(const [ri,[left,right]] of ranges.entries())for(const [fi,fraction] of fractions.entries()){
      const sx=Math.round(cleaned.width*left),sw=Math.round(cleaned.width*right)-sx;
      const sy=Math.round(cleaned.height*fraction),sh=Math.min(cleaned.height-sy,Math.min(40,Math.round(cleaned.height*.51)));
      if(sh<20)continue;
      const c=document.createElement('canvas');c.width=sw*3;c.height=sh*3;
      c.getContext('2d').drawImage(cleaned,sx,sy,sw,sh,0,0,c.width,c.height);
      for(const threshold of (preserved?[115,125,130,135,145]:[100,130,160,180]))for(const [pi,psm] of (preserved?[Tesseract?.PSM?.SINGLE_LINE??'7']:[Tesseract?.PSM?.SINGLE_LINE??'7',Tesseract?.PSM?.RAW_LINE??'13']).entries()){
        const hit=await recognize(worker,thresholdCanvas(c,threshold),psm,Tesseract,{variant:`${prefix}-${ri}-${fi}-${threshold}-${pi}`,numeric:true});
        if(hit)out.push({...hit,scope:'cell'});
      }
    }
    return out;
  }

  async function extractReference({canvas,layout,worker,Tesseract,pageNumber=1,renderDpi=0}={}){
    if(!canvas||!layout||!worker||renderDpi<300)return [];
    const rows=(layout.rows||[]).filter(r=>/\b(?:order\s*ref(?:erence)?|reference\s*(?:no\.?|number)?)\s*:/i.test(r.text||''));
    if(rows.length!==1)return [];
    const row=rows[0],items=row.items||[];
    if(!items.length)return [];
    const label=items.find(i=>/\b(?:order|reference|ref\.?)/i.test(i.text||''));
    const x=Math.max(0,Math.floor((label?Number(label.x||0):Math.min(...items.map(i=>Number(i.x||0))))-55));
    const right=Math.min(canvas.width,Math.ceil(Math.max(...items.map(i=>Number(i.x||0)+Number(i.width??i.w??0)))+95));
    const height=Math.max(18,...items.map(itemHeight));
    const y=Math.max(0,Math.floor(canvas.height-Number(row.y)-height*1.25));
    const baselineY=y+Math.round(Math.max(40,height*2.5)*.50);
    const box={x,y:baselineY,w:Math.min(canvas.width-x,Math.max(100,right-x)),h:Math.min(canvas.height-baselineY,Math.max(52,Math.round(height*1.7)))};
    const source=cropCanvas(canvas,box),hits=[];
    for(const [variant,c] of [['raw',source],...[105,125,145,165].map(t=>['threshold-'+t,thresholdCanvas(source,t)])]){
      const hit=await recognize(worker,c,Tesseract?.PSM?.SINGLE_LINE??'7',Tesseract,{variant:'header-'+variant});
      const token=hit?.text.match(/\b(?:order\s*ref(?:erence)?|reference\s*(?:no\.?|number)?)\s*[:#.-]?\s*([A-Z0-9][A-Z0-9._\/-]{2,})/i)?.[1];
      if(token)hits.push({variant:'header-'+variant,text:token,page:pageNumber,renderDpi,confidence:hit.confidence});
    }
    const rawToken=hits.find(h=>h.variant==='header-raw')?.text;
    if(rawToken&&/\border\s+ref/i.test(row.text||''))for(const threshold of [125,165]){
      const corrected=referenceShapeWitness(source,rawToken,threshold);
      if(corrected)hits.push({variant:'header-shape-'+threshold,text:corrected,page:pageNumber,renderDpi});
    }
    console.info('Certification reference cell OCR',JSON.stringify({page:pageNumber,row:row.text,box,hits}));
    return hits;
  }

  function chooseReferenceEvidence(hits=[]){
    const votes=new Map();
    for(const h of hits){
      if(h?.renderDpi<300||!h.variant||!/^[A-Z0-9][A-Z0-9._\/-]{2,}$/i.test(h.text||''))continue;
      const set=votes.get(h.text)||new Set();set.add(h.variant);votes.set(h.text,set);
    }
    const strong=[...votes].filter(([,variants])=>variants.size>=2);
    const shaped=strong.filter(([,variants])=>[...variants].filter(v=>/(?:^|-)header-shape-/.test(v)).length>=2);
    if(shaped.length===1&&strong.every(([value])=>value===shaped[0][0]||value.replace(/O/g,'0')===shaped[0][0].replace(/O/g,'0')))return shaped[0][0];
    return strong.length===1?strong[0][0]:null;
  }

  async function extractPage({canvas,layout,worker,Tesseract,pageNumber=1,renderDpi=0,ocrVariant='page'}={}){
    if(!canvas||!layout||!worker)return [];
    if(!Number.isFinite(renderDpi)||renderDpi<300)throw new Error('Cell OCR requires measured render DPI >= 300.');
    const header=findHeader(layout),pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height);
    const columnBounds=detectColumnBounds(pixels,layout,header),plans=[...planTableCells(layout,columnBounds),...planUnnumberedPositionedRows(layout,columnBounds)],out=[];
    console.info('Certification numeric column geometry',JSON.stringify({page:pageNumber,bounds:columnBounds||'ocr-center-fallback'}));
    console.info('Certification cell OCR plan',JSON.stringify({page:pageNumber,header:findHeader(layout)?.row?.text||'',plans:plans.map(x=>({ordinal:x.ordinal,anchor:x.rowText,quantity:x.quantity,unit:x.unit_price,amount:x.amount}))}));
    for(const plan of plans){
      const descCanvas=cropCanvas(canvas,plan.description);
      const qtyCanvas=cropCanvas(canvas,plan.quantity);
      const unitCanvas=cropCanvas(canvas,plan.unit_price);
      const amountCanvas=cropCanvas(canvas,plan.amount);
      const desc=await recognize(worker,descCanvas,Tesseract?.PSM?.SINGLE_BLOCK??'6',Tesseract,{variant:'description'});
      const q=await numericEnsemble(worker,qtyCanvas,Tesseract),u=await numericEnsemble(worker,unitCanvas,Tesseract),a=await numericEnsemble(worker,amountCanvas,Tesseract);
      const positioned=positionedNumericEvidence(layout,plan,pageNumber,renderDpi,ocrVariant);
      for(const [hits,box,kind] of [[q,plan.quantity,'quantity'],[u,plan.unit_price,'unit'],[a,plan.amount,'amount']]){
        if(!cleanNumericVotes(hits,kind==='quantity')){
          hits.push(...await ruleBandEnsemble(worker,canvas,box,pixels,Tesseract,kind));
          hits.push(...await baselineEnsemble(worker,kind==='quantity'?qtyCanvas:kind==='unit'?unitCanvas:amountCanvas,Tesseract,kind));
          if(kind==='amount'){
            hits.push(...await ruleBaselineEnsemble(worker,ruleRemovedCell(canvas,box,pixels),Tesseract));
            hits.push(...await ruleBaselineEnsemble(worker,ruleRemovedCell(canvas,box,pixels,true),Tesseract,'baseline-preserved'));
          }
        }
      }
      const rowKey=String(plan.ordinal??clean(plan.rowText).toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,80));
      const typed=(hits,field)=>hits.map(x=>{
        const baseline=/(?:^|-)baseline(?:-|$)/.test(x.variant||'');
        const cleaned=/^(?:rule-band|tight-band|baseline-rule|baseline-preserved)/.test(x.variant||'');
        const evidenceType=baseline?'targeted-baseline-crop':cleaned?'targeted-cleaned-crop':'targeted-cell-crop';
        // Transform thresholds over a single crop are correlated. For spatial
        // subcrops, retain their geometry index as a group so distinct reads
        // can be considered separately without counting threshold siblings.
        const geometry=String(x.variant||'').match(/^(?:baseline(?:-(?:rule|preserved))?|rule-band|tight-band)-(\d+)-(\d+)-/);
        const groupKey=geometry?`${evidenceType}:${geometry[1]}:${geometry[2]}`:evidenceType;
        return {...x,variant:`${ocrVariant}-cell-${x.variant}`,evidenceType,
          evidenceGroupId:`p${pageNumber}:${ocrVariant}:${rowKey}:${field}:${groupKey}`,scope:'cell',renderDpi};
      });
      out.push({
        ordinal:plan.ordinal,
        page:pageNumber,
        anchor_text:plan.rowText,
        // Review display metadata only. The original 300 DPI page is rendered
        // again on demand; no image pixels or candidate values enter the save.
        review_geometry:{width:canvas.width,height:canvas.height,boxes:{description:plan.description,quantity:plan.quantity,unit_price:plan.unit_price,amount:plan.amount}},
        description_ocr:desc?[desc]:[],
        quantity_ocr:[...positioned.quantity_ocr,...typed(q,'quantity')],
        unit_price_ocr:[...positioned.unit_price_ocr,...typed(u,'unit_price')],
        amount_ocr:[...positioned.amount_ocr,...typed(a,'amount')]
      });
    }
    console.info('Certification cell OCR result',JSON.stringify(out.map(x=>({page:x.page,ordinal:x.ordinal,anchor:x.anchor_text,quantity:x.quantity_ocr.map(v=>[v.variant,v.text]),unit:x.unit_price_ocr.map(v=>[v.variant,v.text]),amount:x.amount_ocr.map(v=>[v.variant,v.text])}))));
    return out;
  }

  function selfTest(){
    const layout={width:1200,height:1800,rows:[
      {y:1500,text:'No. Description Qty Unit Price Amount',items:[
        {text:'Description',x:120,y:1500,w:180,h:24},
        {text:'Qty',x:650,y:1500,w:55,h:24},
        {text:'Price',x:820,y:1500,w:70,h:24},
        {text:'Amount',x:1020,y:1500,w:100,h:24}
      ]},
      {y:1400,text:'1 Projector 1 100.00 100.00',items:[{text:'1',x:40,y:1400,w:20,h:24},{text:'Projector',x:130,y:1400,w:110,h:24}]},
      {y:1320,text:'4 Wireless Microphone 2 corrupted',items:[{text:'4',x:40,y:1320,w:20,h:24},{text:'Wireless',x:130,y:1320,w:100,h:24}]},
      {y:1200,text:'7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00',items:[{text:'7',x:40,y:1200,w:20,h:24},{text:'Supply',x:130,y:1200,w:65,h:24},{text:'Receptacle',x:200,y:1200,w:100,h:24}]},
      {y:500,text:'SUBTOTAL 100.00',items:[{text:'SUBTOTAL',x:800,y:500,w:100,h:24}]}
    ]};
    const p=planTableCells(layout);
    const failures=[];
    if(p.length!==3||p[0].ordinal!==1||p[1].ordinal!==4||p[2].ordinal!==7)failures.push('all-numbered-row-planning');
    const legalTail={...layout,rows:[...layout.rows.filter(r=>!/^SUBTOTAL/i.test(r.text||'')),
      {y:450,text:'TERMS & CONDITIONS',items:[{text:'TERMS',x:40,y:450,w:70,h:24},{text:'CONDITIONS',x:115,y:450,w:110,h:24}]},
      {y:420,text:'1 Buyers purchasing products must apply for license',items:[{text:'1',x:40,y:420,w:18,h:24},{text:'Buyers',x:90,y:420,w:80,h:24}]}]};
    if(planTableCells(legalTail).some(x=>/buyers purchasing/i.test(x.rowText)))failures.push('post-table-terms-excluded');
    if(!p[0]?.unit_price||p[0].unit_price.w<=0)failures.push('unit-price-box');
    if(p[0]?.quantity.y!==Math.floor(1800-1400-24*.35))failures.push('ordinal-baseline-crop');
    const serialHeader={...layout,rows:layout.rows.map((r,i)=>i? r:{...r,items:[...r.items,{text:'Serial No.',x:400,y:r.y,w:80,h:24}]})};
    if((planTableCells(serialHeader)[0]?.quantity.x||0)<550)failures.push('quantity-crop-skips-intervening-serial-column');
    const raster={width:1200,height:600,data:new Uint8ClampedArray(1200*600*4)};
    for(let i=0;i<raster.data.length;i+=4)raster.data[i]=raster.data[i+1]=raster.data[i+2]=255,raster.data[i+3]=255;
    for(let y=70;y<560;y++)for(const base of [400,520,740,920])for(let dx=-1;dx<=1;dx++){
      const x=Math.round(base-(y-70)*.02)+dx,i=(y*raster.width+x)*4;raster.data[i]=raster.data[i+1]=raster.data[i+2]=80;
    }
    // Short stamp rules must not override skewed, persistent table columns.
    for(let y=310;y<365;y++)for(const x of [350,580,780,980]){
      const i=(y*raster.width+x)*4;raster.data[i]=raster.data[i+1]=raster.data[i+2]=20;
    }
    const ruled={width:1200,height:600,source:'ocr-tsv',rows:[
      {y:520,text:'No Description Qty Unit Price Amount',items:[
        {text:'Description',x:110,y:520,w:100,h:20},{text:'Qty',x:450,y:520,w:30,h:20},
        {text:'Price',x:605,y:520,w:50,h:20},{text:'Amount',x:810,y:520,w:60,h:20}]},
      {y:400,text:'1 Projector 1 100.00 100.00',items:[{text:'1',x:20,y:400,w:18,h:20},{text:'Projector',x:120,y:400,w:80,h:20}]},
      {y:300,text:'2 Amplifier 1 200.00 200.00',items:[{text:'2',x:20,y:300,w:18,h:20},{text:'Amplifier',x:120,y:300,w:80,h:20}]},
      {y:200,text:'3 Monitor 1 300.00 300.00',items:[{text:'3',x:20,y:200,w:18,h:20},{text:'Monitor',x:120,y:200,w:80,h:20}]},
      {y:100,text:'4 Speaker 1 400.00 400.00',items:[{text:'4',x:20,y:100,w:18,h:20},{text:'Speaker',x:120,y:100,w:80,h:20}]}
    ]};
    const detected=detectColumnBounds(raster,ruled),ruledPlans=planTableCells(ruled,detected);
    if(!detected||detected.qtyLeft<390||detected.qtyLeft>401||detected.unitLeft<510||detected.unitLeft>521
      ||detected.amountLeft<730||detected.amountLeft>741||detected.amountRight<910||detected.amountRight>921)
      failures.push('persistent-table-rules-refine-unequal-column-widths');
    const sampleY=(ruledPlans[0]?.quantity.y||0)+(ruledPlans[0]?.quantity.h||0)/2;
    const expectedLeft=400-(sampleY-70)*.02,expectedRight=520-(sampleY-70)*.02;
    const expectedPad=Math.min(10,Math.max(2,Math.round((expectedRight-expectedLeft)*.025)));
    if(Math.abs((ruledPlans[0]?.quantity.x||0)-(expectedLeft+expectedPad))>2
      ||Math.abs((ruledPlans[0]?.quantity.x+ruledPlans[0]?.quantity.w||0)-(expectedRight-expectedPad))>2)
      failures.push('rule-aligned-quantity-cell-crop');
    const wideRightRaster={width:1200,height:600,data:new Uint8ClampedArray(1200*600*4)};
    for(let i=0;i<wideRightRaster.data.length;i+=4)wideRightRaster.data[i]=wideRightRaster.data[i+1]=wideRightRaster.data[i+2]=255,wideRightRaster.data[i+3]=255;
    for(let y=70;y<560;y++)for(const base of [300,400,700,1040]){
      const i=(y*wideRightRaster.width+base)*4;wideRightRaster.data[i]=wideRightRaster.data[i+1]=wideRightRaster.data[i+2]=80;
    }
    for(let y=70;y<560;y++)for(let x=1134;x<=1136;x++){
      const i=(y*wideRightRaster.width+x)*4;wideRightRaster.data[i]=wideRightRaster.data[i+1]=wideRightRaster.data[i+2]=20;
    }
    const wideRightLayout={width:1200,height:600,source:'ocr-tsv',rows:[
      {y:520,text:'Description Qty Price Amount',items:[
        {text:'Description',x:110,y:520,w:100,h:20},{text:'Qty',x:330,y:520,w:40,h:20},
        {text:'Price',x:440,y:520,w:60,h:20},{text:'Amount',x:840,y:520,w:60,h:20}]},
      ...[[1,400],[2,300],[3,200],[4,100]].map(([n,y])=>({y,text:`${n} Projector 1 100.00 100.00`,items:[
        {text:String(n),x:20,y,w:18,h:20},{text:'Projector',x:120,y,w:80,h:20}]}))
    ]};
    const wideRight=detectColumnBounds(wideRightRaster,wideRightLayout);
    if(!wideRight||wideRight.amountRight<1132||wideRight.amountRight>1138)
      failures.push('outer-amount-rule-beyond-fixed-radius');
    const stacked={width:1200,height:1800,rows:[
      {y:1500,text:'No. escription Amount',items:[
        {text:'escription',x:120,y:1500,w:180,h:24},
        {text:'Amount',x:1020,y:1500,w:100,h:24}]},
      {y:1540,text:'Unit Price',items:[
        {text:'Unit',x:780,y:1540,w:45,h:24},
        {text:'Price',x:830,y:1540,w:70,h:24}]},
      {y:1400,text:'1 Projector 1 100.00 100.00',items:[
        {text:'1',x:40,y:1400,w:20,h:24},
        {text:'Projector',x:130,y:1400,w:110,h:24}]}
    ]};
    const sp=planTableCells(stacked);
    if(sp.length!==1||sp[0].ordinal!==1)failures.push('stacked-clipped-header-recovery');
    const qClipped={...stacked,rows:[
      {y:1500,text:'No. escription Q Amount',items:[
        {text:'escription',x:120,y:1500,w:180,h:24},
        {text:'Q',x:650,y:1500,w:25,h:24},
        {text:'Amount',x:1020,y:1500,w:100,h:24}]},
      {y:1540,text:'Unit Price',items:[
        {text:'Unit',x:780,y:1540,w:45,h:24},
        {text:'Price',x:830,y:1540,w:70,h:24}]},
      ...stacked.rows.slice(2)
    ]};
    const qHeader=findHeader(qClipped);
    if(!qHeader||Math.abs(qHeader.centers.qty-662.5)>1)failures.push('single-letter-qty-header');
    const totalHeader={...layout,rows:layout.rows.map(r=>({...r,text:String(r.text||'').replace(/Amount/g,'Total'),items:(r.items||[]).map(x=>({...x,text:x.text==='Amount'?'Total':x.text}))}))};
    totalHeader.rows[0].items[2].text='UnitPrice';
    const totalHeaderResult=findHeader(totalHeader);
    if(!totalHeaderResult||totalHeaderResult.amount.text!=='Total'||totalHeaderResult.price.text!=='UnitPrice')failures.push('total-and-compact-unit-price-headers');
    const positionedLayout={width:1200,height:1800,source:'ocr-tsv',rows:[
      {y:1500,text:'Description Qty Unit Price Amount',items:[
        {text:'Description',x:120,y:1500,w:120,h:24},{text:'Qty',x:630,y:1500,w:40,h:24},
        {text:'Price',x:800,y:1500,w:60,h:24},{text:'Amount',x:1010,y:1500,w:80,h:24}]},
      {y:1400,text:'AVS-320 ABtUS HDMI Projector Controller With USB 1 350.00 350.00',items:[
        {text:'ABtUS',x:140,y:1400,w:60,h:24},{text:'HDMI',x:205,y:1400,w:50,h:24},
        {text:'Projector',x:260,y:1400,w:85,h:24},{text:'Controller',x:350,y:1400,w:95,h:24},
        {text:'1',x:650,y:1400,w:14,h:24},{text:'350.00',x:820,y:1400,w:60,h:24},{text:'350.00',x:1030,y:1400,w:60,h:24}]},
      {y:1360,text:'Wireless Microphone 1 100.00 100.00',items:[
        {text:'Wireless',x:140,y:1360,w:80,h:24},{text:'Microphone',x:225,y:1360,w:100,h:24},
        {text:'1',x:650,y:1360,w:14,h:24},{text:'100.00',x:820,y:1360,w:60,h:24},{text:'100.00',x:1030,y:1360,w:60,h:24}]}
    ],items:[
      {text:'ABtUS',x:140,y:1400,w:60,h:24},{text:'HDMI',x:205,y:1400,w:50,h:24},
      {text:'Projector',x:260,y:1400,w:85,h:24},{text:'Controller',x:350,y:1400,w:95,h:24},
      {text:'1',x:650,y:1400,w:14,h:24},{text:'350.00',x:820,y:1400,w:60,h:24},{text:'350.00',x:1030,y:1400,w:60,h:24},
      {text:'1',x:650,y:1360,w:14,h:24},{text:'100.00',x:820,y:1360,w:60,h:24},{text:'100.00',x:1030,y:1360,w:60,h:24}
    ]};
    const positionedPlans=planUnnumberedPositionedRows(positionedLayout);
    if(positionedPlans.length!==2||!positionedPlans.some(x=>/Controller/.test(x.rowText)))failures.push('unnumbered-priced-equipment-position-plan');
    const quantityOmitted={...positionedLayout,rows:positionedLayout.rows.map(r=>({...r,items:(r.items||[]).filter(x=>!(clean(x.text)==='1'&&center(x)>600&&center(x)<700))})),
      items:positionedLayout.items.filter(x=>!(clean(x.text)==='1'&&center(x)>600&&center(x)<700))};
    if(!planUnnumberedPositionedRows(quantityOmitted).some(x=>/Controller/.test(x.rowText)))failures.push('positioned-row-planned-when-quantity-word-is-missing');
    const positionedPlan=positionedPlans.find(x=>/Controller/.test(x.rowText));
    const positioned=positionedNumericEvidence(positionedLayout,positionedPlan,1,300,'block');
    if(positioned.quantity_ocr[0]?.text!=='1'||positioned.unit_price_ocr[0]?.text!=='350.00'||positioned.amount_ocr[0]?.text!=='350.00')failures.push('positioned-numeric-cell-binding');
    const missing={...layout,rows:[layout.rows[0],
      {y:1400,text:'3 Passive Loudspeakers',items:[{text:'3',x:40,y:1400,w:20,h:24},{text:'Loudspeakers',x:130,y:1400,w:110,h:24}]},
      {y:1340,text:'Single Channel Digital Wireless Microphone System',items:[{text:'Microphone',x:130,y:1340,w:120,h:24}]},
      {y:1280,text:'5 Monitor Speaker',items:[{text:'5',x:40,y:1280,w:20,h:24},{text:'Speaker',x:130,y:1280,w:100,h:24}]},layout.rows[layout.rows.length-1]]};
    if(!planTableCells(missing).some(x=>x.ordinal===4&&/Microphone/.test(x.rowText)))failures.push('single-missing-ordinal-between-equipment');
    const withNoise={...missing,rows:[...missing.rows,
      {y:1270,text:'6 800.00 4,800.00',items:[{text:'6',x:650,y:1270,w:20,h:24},{text:'800.00',x:820,y:1270,w:70,h:24}]},
      {y:1200,text:'7 Supply & Install Cabling Work',items:[{text:'7',x:40,y:1200,w:20,h:24},{text:'Supply',x:130,y:1200,w:90,h:24},{text:'Install',x:230,y:1200,w:90,h:24}]}]};
    if(planTableCells(withNoise).some(x=>x.ordinal===6||x.ordinal===7))failures.push('exclude-numeric-fragment-and-service');
    const sparse={...layout,rows:[layout.rows[0],
      {y:1380,text:'2 Digital Power Amplifier with DSP',items:[{text:'2',x:40,y:1380,w:20,h:24}]},
      {y:1300,text:'5 Monitor Speaker at the console',items:[{text:'5',x:40,y:1300,w:20,h:24}]}]};
    if(planTableCells(sparse).length!==2)failures.push('retain-equipment-despite-sparse-word-geometry');
    return {ok:failures.length===0,failures};
  }

  const api={VERSION,findHeader,planTableCells,planUnnumberedPositionedRows,planProductCodeWitnesses,planPricedProductCodeCells,productCodeToken,sameProductCodeShape,extractProductCodeWitnesses,positionedNumericEvidence,detectColumnBounds,extractPage,extractReference,chooseReferenceEvidence,referenceShapeCorrection,selfTest};
  global.InventoryHubV411CellOcrBridge=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
