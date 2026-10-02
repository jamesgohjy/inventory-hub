/* Parser V4.1.1 targeted table-cell OCR bridge.
 * Shadow-only integration for fixes 1-15.
 * Detects incomplete numbered invoice rows from OCR geometry and returns RAW OCR evidence only.
 * It never resolves quantity/price/amount values itself.
 */
(function(global){
  'use strict';
  const VERSION='4.1.1-cell-ocr-bridge-r1';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const moneyCount=v=>(String(v||'').match(/\d[\d,]*[.,]\d{2}/g)||[]).length;
  const rowOrdinal=v=>{
    const m=clean(v).match(/^[|)\]}>;,:\s]*(\d{1,2})\b/);
    return m?Number(m[1]):null;
  };
  const center=item=>Number(item?.x||0)+(Number(item?.width??item?.w||0)/2);
  const itemHeight=item=>Number(item?.height??item?.h||0)||18;

  function findHeader(layout={}){
    const rows=layout.rows||[];
    let header=rows.find(r=>/\bdescription\b/i.test(r.text||'')&&/\b(?:qty|quantity|units?)\b/i.test(r.text||'')&&/\bprice\b/i.test(r.text||'')&&/\bamount\b/i.test(r.text||''));
    if(!header)return null;
    const items=header.items||[];
    const desc=items.find(x=>/description/i.test(x.text||''));
    const qty=items.find(x=>/^(?:qty|quantity|units?)$/i.test(clean(x.text)));
    const amount=[...items].reverse().find(x=>/amount/i.test(x.text||''));
    let price=[...items].reverse().find(x=>/price/i.test(x.text||''));
    if(!price){
      const unit=items.find(x=>/^unit$/i.test(clean(x.text)));
      if(unit)price=unit;
    }
    if(!desc||!qty||!price||!amount)return null;
    const dc=center(desc),qc=center(qty),pc=center(price),ac=center(amount);
    if(!(dc<qc&&qc<pc&&pc<ac))return null;
    return {row:header,desc,qty,price,amount,centers:{desc:dc,qty:qc,price:pc,amount:ac}};
  }

  function planTableCells(layout={}){
    const header=findHeader(layout);
    if(!header||!Number(layout.width)||!Number(layout.height))return [];
    const H=Number(layout.height),W=Number(layout.width),hr=header.row;
    const rows=(layout.rows||[]).filter(r=>Number(r.y)<Number(hr.y));
    const stop=rows.find(r=>/^(?:remarks?|sub\s*total|subtotal|gst\b|total\b|amount\s+due)/i.test(clean(r.text).replace(/^[^A-Za-z]+/,'')));
    const stopY=stop?Number(stop.y):-Infinity;
    const c=header.centers;
    const qtyLeft=(c.desc+c.qty)/2;
    const unitLeft=(c.qty+c.price)/2;
    const amountLeft=(c.price+c.amount)/2;
    const amountRight=Math.min(W,c.amount+Math.max(100,(c.amount-c.price)*0.85));
    const descLeft=Math.max(0,Number(header.desc.x||0)-40);
    const plans=[];
    for(const r of rows){
      if(Number(r.y)<=stopY)continue;
      const ord=rowOrdinal(r.text);
      if(ord===null)continue;
      // Only expensive-fallback rows whose whole-row OCR is economically incomplete.
      if(moneyCount(r.text)>=2)continue;
      const items=r.items||[];
      if(!items.length)continue;
      const tops=items.map(x=>H-Number(x.y||0)).filter(Number.isFinite);
      const hs=items.map(itemHeight).filter(x=>x>0);
      const top=Math.max(0,Math.min(...tops)-Math.max(8,(Math.max(...hs)||18)*0.45));
      const h=Math.min(H-top,Math.max(38,(Math.max(...hs)||18)*2.1));
      const box=(x0,x1)=>({x:Math.max(0,Math.floor(x0)),y:Math.max(0,Math.floor(top)),w:Math.max(10,Math.ceil(x1-x0)),h:Math.max(20,Math.ceil(h))});
      plans.push({
        ordinal:ord,
        rowText:clean(r.text),
        description:box(descLeft,qtyLeft),
        quantity:box(qtyLeft,unitLeft),
        unit_price:box(unitLeft,amountLeft),
        amount:box(amountLeft,amountRight)
      });
    }
    return plans;
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
      user_defined_dpi:'300'
    });
    const r=await worker.recognize(canvas,{}, {text:true});
    const text=clean(r?.data?.text||'');
    return text?{text,confidence:Number(r?.data?.confidence||0),...meta}:null;
  }
  async function numericEnsemble(worker,source,Tesseract){
    const out=[],line=Tesseract?.PSM?.SINGLE_LINE??'7',block=Tesseract?.PSM?.SINGLE_BLOCK??'6';
    const variants=[
      {canvas:source,psm:line,label:'raw-line'},
      {canvas:thresholdCanvas(source,165),psm:line,label:'t165-line'},
      {canvas:thresholdCanvas(source,195),psm:line,label:'t195-line'},
      {canvas:thresholdCanvas(source,210),psm:block,label:'t210-block'}
    ];
    for(const v of variants){
      const hit=await recognize(worker,v.canvas,v.psm,Tesseract,{variant:v.label});
      if(hit)out.push(hit);
    }
    return out;
  }

  async function extractPage({canvas,layout,worker,Tesseract,pageNumber=1}={}){
    if(!canvas||!layout||!worker)return [];
    const plans=planTableCells(layout),out=[];
    for(const plan of plans){
      const descCanvas=cropCanvas(canvas,plan.description);
      const qtyCanvas=cropCanvas(canvas,plan.quantity);
      const unitCanvas=cropCanvas(canvas,plan.unit_price);
      const amountCanvas=cropCanvas(canvas,plan.amount);
      const desc=await recognize(worker,descCanvas,Tesseract?.PSM?.SINGLE_BLOCK??'6',Tesseract,{variant:'description'});
      out.push({
        ordinal:plan.ordinal,
        page:pageNumber,
        anchor_text:plan.rowText,
        description_ocr:desc?[desc]:[],
        quantity_ocr:await numericEnsemble(worker,qtyCanvas,Tesseract),
        unit_price_ocr:await numericEnsemble(worker,unitCanvas,Tesseract),
        amount_ocr:await numericEnsemble(worker,amountCanvas,Tesseract)
      });
    }
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
      {y:1400,text:'1 Projector 1 100.00 100.00',items:[{text:'1',x:40,y:1400,w:20,h:24}]},
      {y:1320,text:'4 Wireless Microphone 2 corrupted',items:[{text:'4',x:40,y:1320,w:20,h:24},{text:'Wireless',x:130,y:1320,w:100,h:24}]},
      {y:500,text:'SUBTOTAL 100.00',items:[{text:'SUBTOTAL',x:800,y:500,w:100,h:24}]}
    ]};
    const p=planTableCells(layout);
    const failures=[];
    if(p.length!==1||p[0].ordinal!==4)failures.push('incomplete-row-planning');
    if(!p[0]?.unit_price||p[0].unit_price.w<=0)failures.push('unit-price-box');
    return {ok:failures.length===0,failures};
  }

  const api={VERSION,findHeader,planTableCells,extractPage,selfTest};
  global.InventoryHubV411CellOcrBridge=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
