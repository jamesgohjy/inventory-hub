// AV Inventory Hub V6.45 — corrected invoice import loader
// This loader keeps the full V6.45 application from the verified GitHub commit,
// applies the invoice parser/OCR safety update in-memory, then starts the app.

const ORIGINAL_APP_URL = 'https://raw.githubusercontent.com/jamesgohjy/inventory-hub/3e16c6b235fbcf7e2a7419f2a9675f7f2c93687d/app.js';

const NEW_EXTRACT_PDF = String.raw`async function extractPdf(file){
  setProgress(5,'Loading PDF…');
  const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
  const data=new Uint8Array(await file.arrayBuffer());
  const pdf=await pdfjs.getDocument({data}).promise;
  const orderedPageText=async(page)=>{
    const tc=await page.getTextContent();
    const words=(tc.items||[]).filter(x=>String(x.str||'').trim()).map(x=>({
      text:String(x.str||'').trim(),
      x:Number(x.transform?.[4]||0),
      y:Number(x.transform?.[5]||0),
      w:Number(x.width||0)
    }));
    words.sort((a,b)=>Math.abs(b.y-a.y)>2?b.y-a.y:a.x-b.x);
    const rows=[];
    for(const word of words){
      let row=rows.find(r=>Math.abs(r.y-word.y)<=2.5);
      if(!row){row={y:word.y,items:[]};rows.push(row);}
      row.items.push(word);
    }
    rows.sort((a,b)=>b.y-a.y);
    return rows.map(row=>{
      row.items.sort((a,b)=>a.x-b.x);
      let out='',end=null;
      for(const w of row.items){
        const gap=end==null?0:w.x-end;
        if(out && gap>18) out+=' | ';
        else if(out) out+=' ';
        out+=w.text;
        end=w.x+Math.max(0,w.w);
      }
      return out.replace(/\s+/g,' ').replace(/\s*\|\s*/g,' | ').trim();
    }).filter(Boolean).join('\n');
  };
  let pages=[],chars=0;
  for(let i=1;i<=pdf.numPages;i++){
    setProgress(10+Math.round(35*i/pdf.numPages),\`Extracting page \${i} of \${pdf.numPages}…\`);
    const p=await pdf.getPage(i);
    const text=await orderedPageText(p);
    pages.push(text);chars+=text.replace(/\s/g,'').length;
  }
  let text=pages.join('\n\n');
  const needsOcr=chars<100 || (!/\b(?:tax\s+)?invoice\b/i.test(text) && chars<500);
  if(needsOcr){
    if(!window.Tesseract)throw new Error('This PDF appears scanned and OCR could not be loaded.');
    pages=[];
    for(let i=1;i<=pdf.numPages;i++){
      setProgress(45+Math.round(30*i/pdf.numPages),\`Running OCR… page \${i} of \${pdf.numPages}\`);
      const p=await pdf.getPage(i),vp=p.getViewport({scale:2.1}),c=document.createElement('canvas');
      c.width=Math.ceil(vp.width);c.height=Math.ceil(vp.height);
      await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
      const r=await Tesseract.recognize(c,'eng');pages.push(r.data.text||'');
    }
    text=pages.join('\n\n');
  }
  setProgress(82,'Validating invoice…');
  await new Promise(r=>setTimeout(r,80));
  setProgress(90,'Detecting invoice fields…');
  return text;
}`;

const NEW_PARSE_INVOICE = String.raw`function invoiceTextClean(text=''){return String(text||'').replace(/\r/g,'').replace(/[\u00a0\t]+/g,' ').replace(/[ ]{2,}/g,' ').trim();}
function classifyInvoiceDocument(text=''){
  const t=invoiceTextClean(text),u=t.toUpperCase();
  const heading=/\bTAX\s+INVOICE\b|\bINVOICE\b/.test(u);
  const commercial=[/\bINVOICE\s*(?:NO\.?|NUMBER|#)/,/\bINVOICE\s+DATE\b/,/\bUNIT\s+PRICE\b/,/\bAMOUNT\b/,/\bSUB\s*TOTAL\b/,/\bTOTAL\b/,/\bGST\b/,/\bQUANT(?:ITY|ITY\.)\b|\bQTY\b/,/\bDESCRIPTION\b/].filter(r=>r.test(u)).length;
  let score=(/\bTAX\s+INVOICE\b/.test(u)?6:heading?4:0)+Math.min(6,commercial);
  const first=t.split('\n').slice(0,20).join(' ').toUpperCase();
  if(!heading && /\bQUOTATION\b|\bQUOTE\b/.test(first)) score-=6;
  if(!heading && /\bPURCHASE\s+ORDER\b/.test(first)) score-=6;
  if(!heading && /\bSTATEMENT\b/.test(first)) score-=4;
  if(!heading && /\bDELIVERY\s+(?:ORDER|NOTE)\b/.test(first)) score-=4;
  return {ok:heading&&commercial>=2&&score>=6,score,heading,commercial};
}
function moneyNearLabel(text,labels){
  const escaped=labels.map(x=>x.replace(/[.*+?^()|[\]{}$\\]/g,'\\$&')).join('|');
  const re=new RegExp('(?:'+escaped+')\\s*(?:SGD|S\\$|\\$)?\\s*[:|-]?\\s*([0-9][0-9,]*(?:\\.[0-9]{2})?)','i');
  const m=String(text||'').match(re);return m?num(m[1]):null;
}
function firstUseful(re,text){const m=String(text||'').match(re);return m?String(m[1]||'').replace(/\s+/g,' ').trim():'';}
function parseGenericInvoiceLines(text=''){
  const lines=String(text||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const out=[];
  const headerIndex=lines.findIndex(l=>/description/i.test(l)&&/(qty|quantity)/i.test(l)&&/(unit\s*price|price)/i.test(l)&&/amount/i.test(l));
  const start=headerIndex>=0?headerIndex+1:0;
  for(let i=start;i<Math.min(lines.length,start+35);i++){
    const line=lines[i];
    if(/sub\s*total|gst|amount\s*due|invoice\s*total|grand\s*total/i.test(line)) break;
    const cols=line.split(/\s*\|\s*/).map(x=>x.trim()).filter(Boolean);
    if(cols.length>=4){
      let amountIndex=-1,unitIndex=-1,qtyIndex=-1;
      for(let j=cols.length-1;j>=0;j--){if(/^[\d,]+\.\d{2}$/.test(cols[j])){if(amountIndex<0)amountIndex=j;else if(unitIndex<0){unitIndex=j;break;}}}
      if(unitIndex>0){for(let j=unitIndex-1;j>=0;j--){if(/^\d+(?:\.\d+)?$/.test(cols[j])){qtyIndex=j;break;}}}
      if(qtyIndex>=0&&unitIndex>qtyIndex&&amountIndex>unitIndex){
        const qty=Number(cols[qtyIndex]),unit=num(cols[unitIndex]),amount=num(cols[amountIndex]);
        const lead=cols.slice(0,qtyIndex),sku=lead.length>1?lead[0]:'',desc=(lead.length>1?lead.slice(1):lead).join(' ').trim();
        if(qty>0&&desc&&!/description|product\s*no/i.test(desc))out.push({sku,item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:unit,amount,warranty:'',serials:''});
      }
    }
  }
  return out;
}
function parseInvoice(text){
  const flat=invoiceTextClean(text),classification=classifyInvoiceDocument(flat);
  if(!classification.ok)throw new Error('This document does not appear to be an invoice. Please upload an invoice PDF.');
  let supplier='';
  if(/Loud Technologies Asia/i.test(flat))supplier='Loud Technologies Asia Pte Ltd';
  else if(/AV\s+MEDIA\s+PTE\s+LTD/i.test(flat))supplier='AV Media Pte Ltd';
  else supplier=firstUseful(/([A-Z][A-Za-z0-9 &.,'()-]{2,}(?:Pte\.?\s*Ltd\.?|Private\s+Limited))/i,flat);
  let invoice='';
  if(/Loud Technologies Asia/i.test(flat))invoice=firstUseful(/\b(INV\s+LTA[- ]?\d+)\b/i,flat);
  const invoicePatterns=[
    /(?:Invoice\s*(?:No\.?|Number|#)|Inv\s*(?:No\.?|#))\s*[:#.-]?\s*(?:\n\s*)?([A-Z0-9][A-Z0-9._\/-]{2,})/i,
    /\b((?:INV|VIN|VI|V)[A-Z0-9._\/-]*[-/]\d{2,})\b/i,
    /\b([A-Z]{1,6}\d{1,4}[-/]\d{2,})\b/i
  ];
  if(!invoice){for(const re of invoicePatterns){const c=firstUseful(re,flat);if(c&&!/^(INV|INVOICE)$/i.test(c)){invoice=c;break;}}}
  invoice=invoice.replace(/\s+/g,' ').trim();
  let date=detectInvoiceDate(flat,invoice);
  const subtotal=moneyNearLabel(flat,['Subtotal','Sub Total','Sub-Total']);
  const gst=moneyNearLabel(flat,['GST 9%','GST 8%','GST 7%','GST']);
  let total=moneyNearLabel(flat,['Amount Due','Invoice Total','Grand Total','Total Amount','Total SGD']);
  if(total==null) total=moneyNearLabel(flat,['TOTAL']);
  const delivery=firstUseful(/(?:Delivery\s*(?:Order|DO)\s*(?:No\.?|Number|#)?|D\/?O\s*(?:No\.?|#)?)\s*[:#.-]?\s*([A-Z0-9._\/-]+)/i,flat);
  const ref=firstUseful(/(?:Reference|Ref\.?\s*No\.?)\s*[:#.-]?\s*([^\n|]+)/i,flat);
  const doc={supplier_name:canonicalSupplier(supplier),invoice_number:invoice,invoice_date:date,delivery_order_number:delivery,purchase_order_number:'',reference_number:ref,currency:/\bUSD\b|US\$/i.test(flat)?'USD':'SGD',subtotal,gst,total_amount:total};
  let items=[];
  if(/Loud Technologies Asia/i.test(flat))items=parseLoud(flat);
  if(!items.length)items=parseGenericInvoiceLines(flat);
  if(!items.length&&/AV\s+MEDIA/i.test(flat))items=parseAvMedia(flat);
  if(!items.length)items=[{sku:'',item_name:'',description:'',category:'',unit:'pcs',quantity:1,unit_price:null,amount:null,warranty:'',serials:''}];
  return{doc,items,rule:supplierRuleForText(flat),classification};
}`;

const NEW_PARSE_AVMEDIA = String.raw`function parseAvMedia(text){
  const generic=parseGenericInvoiceLines(text);
  if(generic.length)return generic;
  const lines=String(text||'').split('\n').map(x=>x.trim()).filter(Boolean);
  for(const line of lines){
    if(/REMACO|MAS[- ]?2121/i.test(line)){
      const nums=line.match(/\b\d+(?:\.\d{2})?\b/g)||[];
      const moneyVals=nums.filter(x=>/\.\d{2}$/.test(x));
      const qtyVals=nums.filter(x=>! /\.\d{2}$/.test(x));
      const qty=Number(qtyVals.at(-1)||1),unit=num(moneyVals.at(-2)||moneyVals.at(-1)||''),amount=num(moneyVals.at(-1)||'');
      return[{sku:(firstUseful(/\b(REMACO\s+MAS[- ]?\d+)\b/i,line)||'REMACO MAS-2121').replace(/\s+/g,' ').replace('MAS 2121','MAS-2121'),item_name:'Manual Projection Screen',description:line,category:'AV / Display',unit:'pcs',quantity:qty||1,unit_price:unit,amount,warranty:'',serials:''}];
    }
  }
  return[];
}`;

function replaceSection(src,startMarker,endMarker,replacement){
  const s=src.indexOf(startMarker),e=src.indexOf(endMarker,s+startMarker.length);
  if(s<0||e<0)return {src,ok:false};
  return {src:src.slice(0,s)+replacement+src.slice(e),ok:true};
}

async function launch(){
  try{
    const r=await fetch(ORIGINAL_APP_URL,{cache:'no-store'});
    if(!r.ok)throw new Error('Unable to load verified V6.45 source ('+r.status+').');
    let src=await r.text(),ok=true,res;
    res=replaceSection(src,'async function extractPdf(file){','\nfunction friendlyError',NEW_EXTRACT_PDF);src=res.src;ok&&=res.ok;
    res=replaceSection(src,'function parseInvoice(text){','\nfunction parseLoud',NEW_PARSE_INVOICE);src=res.src;ok&&=res.ok;
    res=replaceSection(src,'function parseAvMedia(text){','\n\nfunction confidenceBadge',NEW_PARSE_AVMEDIA);src=res.src;ok&&=res.ok;
    if(!ok){console.warn('Invoice update markers were not found; launching verified original V6.45 instead.');src=await (await fetch(ORIGINAL_APP_URL,{cache:'no-store'})).text();}
    const blob=new Blob([src],{type:'text/javascript'}),url=URL.createObjectURL(blob);
    try{await import(url);}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(err){
    console.error('AV Inventory Hub startup error:',err);
    const box=document.createElement('div');
    box.style.cssText='position:fixed;inset:20px;z-index:99999;background:#fff;border:1px solid #d33;border-radius:12px;padding:20px;font:14px/1.5 Arial;color:#222;box-shadow:0 10px 30px #0002';
    box.innerHTML='<b>AV Inventory Hub could not start.</b><br>Please restore the previous app.js and refresh.<br><br><code>'+String(err.message||err).replace(/[&<>]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[s]))+'</code>';
    document.body.appendChild(box);
  }
}

await launch();
