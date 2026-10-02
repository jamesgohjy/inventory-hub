/* Parser V4.1.1 targeted table-cell OCR bridge.
 * Shadow-only integration for fixes 1-15.
 * Detects incomplete numbered invoice rows from OCR geometry and returns RAW OCR evidence only.
 * It never resolves quantity/price/amount values itself.
 */
(function(global){
  'use strict';
  const VERSION='4.1.1-cell-ocr-bridge-r2';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const moneyCount=v=>(String(v||'').match(/\d[\d,]*[.,]\d{2}/g)||[]).length;
  const rowOrdinal=v=>{
    const m=clean(v).match(/^[|)\]}>;,:\s]*(\d{1,2})\b/);
    return m?Number(m[1]):null;
  };
  const center=item=>Number(item?.x||0)+(Number(item?.width??item?.w??0)/2);
  const itemHeight=item=>Number(item?.height??item?.h??0)||18;

  function inferQuantityCenter(layout={},header={},descCenter=0,priceCenter=0){
    const rows=(layout.rows||[]).filter(r=>Number(r.y)<Number(header.y));
    const vals=[];
    for(const r of rows){
      for(const item of (r.items||[])){
        const cx=center(item),t=clean(item.text);
        if(cx<=descCenter+80||cx>=priceCenter-110)continue;
        if(!/^\d{1,3}$/.test(t))continue;
        const n=Number(t);if(!(n>=1&&n<=999))continue;
        vals.push(cx);
      }
    }
    if(!vals.length)return null;
    vals.sort((a,b)=>a-b);
    const clusters=[];
    for(const x of vals){
      let best=null,bestD=Infinity;
      for(const g of clusters){
        const d=Math.abs(x-g.center);
        if(d<=55&&d<bestD){best=g;bestD=d;}
      }
      if(!best){best={values:[],center:x};clusters.push(best);}
      best.values.push(x);
      best.center=best.values.reduce((a,v)=>a+v,0)/best.values.length;
    }
    clusters.sort((a,b)=>b.values.length-a.values.length||Math.abs(a.center-(priceCenter-260))-Math.abs(b.center-(priceCenter-260)));
    const best=clusters[0];if(!best)return null;
    const pool=[...best.values].sort((a,b)=>a-b);
    return pool[Math.floor(pool.length/2)]||null;
  }

  function findHeader(layout={}){
    const rows=layout.rows||[];
    let header=rows.find(r=>/\bdescription\b/i.test(r.text||'')&&/\bprice\b/i.test(r.text||'')&&/\bamount\b/i.test(r.text||''));
    if(!header)return null;
    const items=header.items||[];
    const desc=items.find(x=>/description/i.test(x.text||''));
    let qty=items.find(x=>/^(?:qty|quantity|units)$/i.test(clean(x.text)));
    const amount=[...items].reverse().find(x=>/amount/i.test(x.text||''));
    let price=[...items].reverse().find(x=>/price/i.test(x.text||''));
    if(!price){
      const unit=items.find(x=>/^unit$/i.test(clean(x.text)));
      if(unit)price=unit;
    }
    if(!desc||!price||!amount)return null;
    const dc=center(desc),pc=center(price),ac=center(amount);
    let qc=qty?center(qty):inferQuantityCenter(layout,header,dc,pc);
    if(!Number.isFinite(qc))return null;
    if(!qty)qty={text:'INFERRED_QTY',x:qc-1,w:2,height:Number(desc.height??desc.h??18)};
    if(!(dc<qc&&qc<pc&&pc<ac))return null;
    return {row:header,desc,qty,price,amount,centers:{desc:dc,qty:qc,price:pc,amount:ac},qtyInferred:clean(qty.text)==='INFERRED_QTY'};
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
    const numbered=[];
    for(const r of rows){
      if(Number(r.y)<=stopY)continue;
      const ord=rowOrdinal(r.text);if(ord===null)continue;
      const items=r.items||[];if(!items.length)continue;
      numbered.push({ord,r});
    }
    const plans=[];
    for(let i=0;i<numbered.length;i++){
      const {ord,r}=numbered[i],items=r.items||[];
      const tops=items.map(x=>H-Number(x.y||0)).filter(Number.isFinite);
      const hs=items.map(itemHeight).filter(x=>x>0);
      const top=Math.max(0,Math.min(...tops)-Math.max(8,(Math.max(...hs)||18)*0.45));
      const next=numbered.slice(i+1).find(x=>Number(x.r.y)<Number(r.y)-Math.max(6,Number(layout.yTolerance)||4));
      let bottom=next?Math.min(...(next.r.items||[]).map(x=>H-Number(x.y||0)).filter(Number.isFinite))-8:top+Math.max(80,(Math.max(...hs)||18)*5.5);
      if(!Number.isFinite(bottom))bottom=top+120;
      bottom=Math.min(H,Math.max(bottom,top+60));
      const h=bottom-top;
      const box=(x0,x1)=>({x:Math.max(0,Math.floor(x0)),y:Math.max(0,Math.floor(top)),w:Math.max(10,Math.ceil(x1-x0)),h:Math.max(20,Math.ceil(h))});
      // Run targeted fallback when the row is incomplete OR its visible economics are suspicious.
      const m=moneyCount(r.text);
      const compact=clean(r.text);
      const suspicious=m<2||/[A-Za-z][0-9][0-9.,]|[0-9][A-Za-z][0-9.,]/.test(compact);
      if(!suspicious&&m>=2)continue;
      plans.push({
        ordinal:ord,
        rowText:compact,
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
  function scaleCanvas(source,scale=1){
    if(!(scale>1))return source;
    const c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(source.width*scale));c.height=Math.max(1,Math.round(source.height*scale));
    const ctx=c.getContext('2d',{willReadFrequently:true});
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(source,0,0,c.width,c.height);
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
  function morphCloseCanvas(source,threshold=90,kx=3,ky=2){
    const base=thresholdCanvas(source,threshold),ctx=base.getContext('2d',{willReadFrequently:true});
    const img=ctx.getImageData(0,0,base.width,base.height),src=img.data,w=base.width,h=base.height;
    const bin=new Uint8Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)bin[y*w+x]=src[(y*w+x)*4]<128?0:255;
    const dil=new Uint8Array(w*h),out=new Uint8Array(w*h);
    const ax=Math.floor(kx/2),ay=Math.floor(ky/2);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let v=255;
      for(let yy=0;yy<ky;yy++)for(let xx=0;xx<kx;xx++){
        const sx=x+xx-ax,sy=y+yy-ay;if(sx<0||sy<0||sx>=w||sy>=h)continue;
        if(bin[sy*w+sx]===0){v=0;yy=ky;break;}
      }
      dil[y*w+x]=v;
    }
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let v=0;
      for(let yy=0;yy<ky;yy++)for(let xx=0;xx<kx;xx++){
        const sx=x+xx-ax,sy=y+yy-ay;if(sx<0||sy<0||sx>=w||sy>=h){v=255;yy=ky;break;}
        if(dil[sy*w+sx]===255){v=255;yy=ky;break;}
      }
      out[y*w+x]=v;
    }
    for(let i=0;i<out.length;i++){const v=out[i],j=i*4;src[j]=src[j+1]=src[j+2]=v;src[j+3]=255;}
    ctx.putImageData(img,0,0);return base;
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
  async function numericEnsemble(worker,source,Tesseract,kind='money'){
    const out=[],line=Tesseract?.PSM?.SINGLE_LINE??'7',block=Tesseract?.PSM?.SINGLE_BLOCK??'6',word=Tesseract?.PSM?.SINGLE_WORD??'8';
    const variants=kind==='quantity'?[
      {canvas:thresholdCanvas(scaleCanvas(source,2),150),psm:block,label:'q-s2-t150-block'},
      {canvas:thresholdCanvas(scaleCanvas(source,3),150),psm:block,label:'q-s3-t150-block'},
      {canvas:thresholdCanvas(scaleCanvas(source,4),135),psm:block,label:'q-s4-t135-block'},
      {canvas:thresholdCanvas(scaleCanvas(source,4),140),psm:block,label:'q-s4-t140-block'},
      {canvas:thresholdCanvas(scaleCanvas(source,4),150),psm:block,label:'q-s4-t150-block'}
    ]:[
      {canvas:thresholdCanvas(source,80),psm:block,label:'m-t80-block'},
      {canvas:thresholdCanvas(source,85),psm:block,label:'m-t85-block'},
      {canvas:thresholdCanvas(source,90),psm:block,label:'m-t90-block'},
      {canvas:thresholdCanvas(source,90),psm:Tesseract?.PSM?.SPARSE_TEXT??'11',label:'m-t90-sparse'},
      {canvas:morphCloseCanvas(source,90,3,2),psm:block,label:'m-t90-close-block'},
      {canvas:morphCloseCanvas(source,105,3,2),psm:block,label:'m-t105-close-block'},
      {canvas:morphCloseCanvas(source,110,3,2),psm:block,label:'m-t110-close-block'},
      {canvas:thresholdCanvas(source,120),psm:block,label:'m-t120-block'},
      {canvas:morphCloseCanvas(source,130,3,2),psm:block,label:'m-t130-close-block'}
    ];
    for(const v of variants){
      const hit=await recognize(worker,v.canvas,v.psm,Tesseract,{variant:v.label,numeric:true});
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
        quantity_ocr:await numericEnsemble(worker,qtyCanvas,Tesseract,'quantity'),
        unit_price_ocr:await numericEnsemble(worker,unitCanvas,Tesseract,'money'),
        amount_ocr:await numericEnsemble(worker,amountCanvas,Tesseract,'money')
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
    const corruptHeader={width:1200,height:1800,rows:[
      {y:1500,text:'No. Description x Unit Price Amount',items:[
        {text:'Description',x:120,y:1500,w:180,h:24},{text:'x',x:650,y:1500,w:20,h:24},
        {text:'Price',x:820,y:1500,w:70,h:24},{text:'Amount',x:1020,y:1500,w:100,h:24}]},
      {y:1400,text:'1 Projector 1',items:[{text:'1',x:40,y:1400,w:20,h:24},{text:'Projector',x:130,y:1400,w:120,h:24},{text:'1',x:650,y:1400,w:20,h:24}]},
      {y:1320,text:'4 Wireless Microphone corrupted',items:[{text:'4',x:40,y:1320,w:20,h:24},{text:'Wireless',x:130,y:1320,w:100,h:24}]},
      {y:1200,text:'5 Monitor 1',items:[{text:'5',x:40,y:1200,w:20,h:24},{text:'Monitor',x:130,y:1200,w:100,h:24},{text:'1',x:650,y:1200,w:20,h:24}]},
      {y:500,text:'SUBTOTAL 100.00',items:[{text:'SUBTOTAL',x:800,y:500,w:100,h:24}]}
    ]};
    const h=findHeader(corruptHeader),cp=planTableCells(corruptHeader);
    if(!h?.qtyInferred||Math.abs(h.centers.qty-660)>80)failures.push('corrupt-qty-header-inference');
    if(!cp.some(x=>x.ordinal===4&&x.quantity.h>=60))failures.push('multi-line-row-span');
    return {ok:failures.length===0,failures};
  }

  const api={VERSION,findHeader,planTableCells,extractPage,selfTest};
  global.InventoryHubV411CellOcrBridge=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
