// AV Inventory Hub V6.79 — no-AUTO SKU enforcement and self-rectifying invoice validation
// This patch loader applies V6.76 safely on top of the verified V6.55 source.
const ORIGINAL_APP_URL='https://raw.githubusercontent.com/jamesgohjy/inventory-hub/d45233b134921b3085a1318b10443d488fd832a0/app.js';

function replaceOnce(src,needle,replacement,label=needle){
  const i=src.indexOf(needle);
  if(i<0)throw new Error('V6.76 patch marker not found: '+label);
  return src.slice(0,i)+replacement+src.slice(i+needle.length);
}
function replaceSection(src,startMarker,endMarker,replacement,label=startMarker){
  const s=src.indexOf(startMarker),e=src.indexOf(endMarker,s+startMarker.length);
  if(s<0||e<0)throw new Error('V6.76 patch section not found: '+label);
  return src.slice(0,s)+replacement+src.slice(e);
}
function asPatchedFunction(fn,newName){
  const source=fn.toString();
  const patched=source.replace(/^(async\s+)?function\s+[^\s(]+/,(_m,asyncPrefix='')=>`${asyncPrefix||''}function ${newName}`);
  const expected=(source.startsWith('async function ')?'async function ':'function ')+newName+'(';
  if(!patched.startsWith(expected))throw new Error('V6.76 helper rename failed for '+newName);
  return patched;
}

function v661DetectInvoiceDate(text,invoice=''){
  const flat=normalizePdfText(text);
  const compact=flat.replace(/[ \t]+/g,' ');
  const labelled=[
    /(?:invoice|document|tax\s*invoice)\s*date\s*[:#.-]?\s*([0-3]?\d\s*[/\.\-]\s*[01]?\d\s*[/\.\-]\s*\d{2,4})/i,
    /(?:invoice|document|tax\s*invoice)\s*date\s*[:#.-]?\s*([0-3]?\d\s+[A-Za-z]{3,9}\s+\d{2,4})/i,
    /(?:invoice|document|tax\s*invoice)\s*date\s*[:#.-]?\s*([0-3]?\d\s*[-/.]\s*[A-Za-z]{3,9}\s*[-/.]\s*\d{2,4})/i
  ];
  for(const source of [flat,compact])for(const re of labelled){const m=source.match(re);if(m){const d=parseDate(m[1]);if(d)return d;}}
  const lines=flat.split('\n').map(x=>x.trim()).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    if(/\binvoice\s*date\b/i.test(lines[i])){
      const direct=parseDate(lines[i]);if(direct)return direct;const same=dateCandidateFromText(lines[i]);if(same){const d=parseDate(same);if(d)return d;}
      for(let j=i+1;j<=Math.min(lines.length-1,i+8);j++){
        const direct=parseDate(lines[j]);if(direct)return direct;const c=dateCandidateFromText(lines[j]);if(c){const d=parseDate(c);if(d)return d;}
      }
    }
  }
  // V6.67: many AV Media invoices use a compact header labelled only "DATE".
  // Accept that label only when the same header row also contains invoice-header fields,
  // never when it is a due/delivery/payment/warranty date.
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(!/\bDATE\b/i.test(line)||/\b(?:due|delivery|payment|warranty)\b/i.test(line))continue;
    const headerLike=/\b(?:ref\.?\s*(?:no\.?|number)?|invoice\s*(?:no\.?|number|#)|p\/?o\s*(?:no\.?|number)?|salesman|terms)\b/i.test(line);
    if(!headerLike)continue;
    const same=dateCandidateFromText(line);if(same){const d=parseDate(same);if(d)return d;}
    for(let j=i+1;j<=Math.min(lines.length-1,i+5);j++){
      if(/\b(?:due|delivery|payment|warranty)\s*date\b/i.test(lines[j]))continue;
      const c=dateCandidateFromText(lines[j]);if(c){const d=parseDate(c);if(d)return d;}
    }
  }
  const idx=compact.search(/\binvoice\s*date\b/i);
  if(idx>=0){const near=compact.slice(idx,idx+180);const c=dateCandidateFromText(near);if(c){const d=parseDate(c);if(d)return d;}}
  if(invoice){
    const pos=compact.toLowerCase().indexOf(String(invoice).toLowerCase());
    if(pos>=0){const near=compact.slice(Math.max(0,pos-120),pos+500);const c=dateCandidateFromText(near);if(c){const d=parseDate(c);if(d)return d;}}
  }
  const all=[...compact.matchAll(/\b([0-3]?\d\s*[/.\-]\s*[01]?\d\s*[/.\-]\s*\d{2,4})\b/g)].map(m=>m[1]);
  if(all.length===1){const d=parseDate(all[0]);if(d)return d;}
  return '';
}

function v661ParseDate(v=''){
  let s=normalizePdfText(v).trim().replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi,'$1').replace(/\s*([/.])\s*/g,'$1');
  s=s.replace(/\b(\d{1,2})\s*[-/.]\s*([A-Za-z]{3,9})\s*[-/.]\s*(\d{2,4})\b/g,'$1 $2 $3')
     .replace(/\b([A-Za-z]{3,9})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})\b/g,'$1 $2 $3');
  const valid=(y,m,d)=>{y=Number(y);m=Number(m);d=Number(d);if(y<100)y+=2000;if(y<1900||y>2200||m<1||m>12||d<1||d>31)return'';const md=[31,((y%4===0&&y%100!==0)||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];if(d>md[m-1])return'';return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;};
  let m=s.match(/\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/);if(m){const d=valid(m[1],m[2],m[3]);if(d)return d;}
  m=s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);if(m){const d=valid(m[3],m[2],m[1]);if(d)return d;}
  const months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
  m=s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/);if(m&&months[m[2].toLowerCase()]){const d=valid(m[3],months[m[2].toLowerCase()],m[1]);if(d)return d;}
  m=s.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})\b/);if(m&&months[m[1].toLowerCase()]){const d=valid(m[3],months[m[1].toLowerCase()],m[2]);if(d)return d;}
  return '';
}

function v661DetectInvoiceDateFromLayout(){
  const pages=state.pdfLayout||[];
  const loose=(v='')=>{const t=normalizePdfText(v).replace(/\s+/g,' ');const direct=parseDate(t);if(direct)return direct;const m=t.match(/([0-3]?\d\s*[/.-]\s*[01]?\d\s*[/.-]\s*\d{2,4})/);return m?parseDate(m[1]):'';};
  const headerCtx=/\b(?:REF\.?\s*(?:NO\.?|NUMBER)?|P\/?O\s*(?:NO\.?|NUMBER)?|SALESMAN|TERMS|INVOICE\s*(?:NO\.?|NUMBER|#)|CUSTOMER\s*CODE)\b/i;
  for(const pg of pages){
    const rows=(pg.rows||[]).filter(r=>Array.isArray(r.items));
    for(let i=0;i<rows.length;i++){
      const row=rows[i],txt=String(row.text||'');
      const isDateHeader=/\bDATE\b/i.test(txt)||(row.items||[]).some(it=>/^\s*(?:invoice\s*)?date\.?\s*$/i.test(String(it.text||'')));
      if(!isDateHeader)continue;
      const ctx=rows.filter(r=>Math.abs((Number(r.y)||0)-(Number(row.y)||0))<=45).map(r=>r.text||'').join(' ');
      if(!/\binvoice\s+date\b/i.test(txt)&&!headerCtx.test(ctx))continue;
      const direct=loose(txt);if(direct)return direct;
      // OCR often merges the DATE value into the Ref No token, so Y alignment is stronger than X alignment here.
      const nearby=rows.map(r=>({r,dy:Math.abs((Number(r.y)||0)-(Number(row.y)||0)),d:loose(r.text||'')})).filter(x=>x.d&&x.dy<=80).sort((a,b)=>a.dy-b.dy);
      if(nearby.length)return nearby[0].d;
    }
  }
  return '';
}

function v661FlexibleProductLayoutItems(){
  const pages=state.pdfLayout||[],out=[];
  const cleanToken=v=>String(v||'').trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
  const numeric=v=>{const z=String(v??'').replace(/\s/g,'').replace(/,(?=\d{3}(?:\D|$))/g,'').replace(/,(?=\d{2}(?:\D|$))/g,'.').replace(/[^0-9.-]/g,'');const n=Number(z);return Number.isFinite(n)?n:null;};
  const moneyVals=v=>{
    const vals=decimalMoneyCandidates(String(v||''));if(vals.length)return vals;
    const n=numeric(v);return n===null?[]:[n];
  };
  const reconcile=(q,p,a)=>{if(p>0&&a>=0){const r=a/p,n=Math.round(r);if(n>=1&&n<=999&&Math.abs(r-n)<.02&&(q===null||q<=0||Math.abs(q-n)>.001))return n;}return q;};
  const labelX=(items,re,fallback=null)=>{const hits=items.filter(it=>re.test(cleanToken(it.text)));return hits.length?Math.min(...hits.map(x=>Number(x.x)||0)):fallback;};

  for(const pg of pages){
    const rows=(pg.rows||[]).filter(r=>Array.isArray(r.items)&&r.items.length);
    const descRows=rows.filter(r=>/\bdescription\b/i.test(r.text||'')||(r.items||[]).some(it=>/^description$/i.test(cleanToken(it.text))));
    for(const dr of descRows){
      const band=rows.filter(r=>Math.abs((r.y||0)-(dr.y||0))<=26);
      const items=band.flatMap(r=>r.items||[]).sort((a,b)=>(a.x||0)-(b.x||0));
      const bandText=band.map(r=>r.text||'').join(' ');
      if(!/\b(?:product|sku|model|item)\b/i.test(bandText)||!/\b(?:qty|quantity|units?)\b/i.test(bandText)||!/\bprice\b/i.test(bandText)||!/\bamount\b/i.test(bandText))continue;

      const xDesc=labelX(items,/^description$/i),xQty=labelX(items,/^(?:qty|quantity|units?)$/i),xPrice=labelX(items,/^price$/i,labelX(items,/price/i)),xAmount=labelX(items,/^amount$/i);
      let xCode=labelX(items,/^(?:product|sku|model|item)$/i);
      if(xCode===null){const p=items.find(it=>/\bproduct\b/i.test(String(it.text||'')));if(p)xCode=Number(p.x);}
      if(xCode===null)xCode=Math.min(...items.map(i=>Number(i.x)).filter(Number.isFinite));
      if(![xCode,xDesc,xQty,xPrice,xAmount].every(Number.isFinite))continue;
      if(!(xCode<xDesc&&xDesc<xQty&&xQty<xPrice&&xPrice<xAmount))continue;

      const headerY=Math.max(...band.map(r=>Number(r.y)||0));
      const bCD=(xCode+xDesc)/2,qtyStart=xQty-Math.max(14,(xPrice-xQty)*.18),bQP=(xQty+xPrice)/2,bPA=(xPrice+xAmount)/2;
      const totalRows=rows.filter(r=>r.y<headerY&&/\b(?:sub\s*total|subtotal|gst\s*\d*\s*%?|amount\s+due|grand\s+total|invoice\s+total)\b/i.test(r.text||'')).sort((a,b)=>b.y-a.y);
      const stopY=totalRows[0]?.y??-Infinity;
      const body=rows.filter(r=>r.y<headerY&&r.y>stopY).sort((a,b)=>b.y-a.y);

      const anchors=[];
      for(const r of body){
        const left=(r.items||[]).filter(it=>it.x>=xCode-12&&it.x<bCD).map(it=>cleanToken(it.text)).filter(Boolean).join('').trim();
        const desc=(r.items||[]).filter(it=>it.x>=bCD&&it.x<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ').trim();
        const q=(r.items||[]).filter(it=>it.x>=qtyStart&&it.x<bQP).map(it=>numeric(it.text)).find(Number.isFinite);
        const p=(r.items||[]).filter(it=>it.x>=bQP&&it.x<bPA).flatMap(it=>moneyVals(it.text));
        const a=(r.items||[]).filter(it=>it.x>=bPA).flatMap(it=>moneyVals(it.text));
        const codeLike=left&&/^[A-Z0-9][A-Z0-9+._\/-]{2,}$/i.test(left)&&!/^(?:DATE|TERMS|TOTAL|SUBTOTAL|SERIAL|WARRANTY)$/i.test(left);
        if(codeLike||(desc&&(p.length||a.length)))anchors.push({row:r,code:codeLike?left:''});
      }
      const uniq=[];
      for(const a of anchors){if(uniq.every(u=>Math.abs((u.row.y||0)-(a.row.y||0))>Math.max(3,pg.yTolerance||3)))uniq.push(a);}
      for(let i=0;i<uniq.length;i++){
        const tol=Math.max(5,pg.yTolerance||3),topY=(uniq[i].row.y||0)+tol,bottomY=i+1<uniq.length?(uniq[i+1].row.y||0)+tol:stopY;
        const group=body.filter(r=>r.y<=topY&&r.y>bottomY);
        const descParts=[];let qty=null,price=null,amount=null,warranty='';
        for(const r of group){
          const d=(r.items||[]).filter(it=>it.x>=bCD&&it.x<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ').trim();
          if(d){
            if(/\bwarranty\b/i.test(d)){const y=d.match(/\b(\d+)\s*years?\b/i);warranty=y?`${y[1]} Years`:d;}
            else if(!/^\s*(?:s\/?n|serial\s*(?:no|number)?)\b/i.test(d)){
              const detail=d.replace(/^\s*shipment\s*no\.?\s*[:#.-]?\s*[A-Z0-9._\/-]+\s*[:;,-]?\s*/i,'').trim();
              if(detail)descParts.push(detail);
            }
          }
          if(qty===null){const q=(r.items||[]).filter(it=>it.x>=qtyStart&&it.x<bQP).map(it=>numeric(it.text)).find(v=>Number.isFinite(v)&&v>0&&v<10000);if(Number.isFinite(q))qty=q;}
          if(price===null){const p=(r.items||[]).filter(it=>it.x>=bQP&&it.x<bPA).flatMap(it=>moneyVals(it.text)).filter(v=>Number.isFinite(v)&&v>=0);if(p.length)price=p[p.length-1];}
          if(amount===null){const a=(r.items||[]).filter(it=>it.x>=bPA).flatMap(it=>moneyVals(it.text)).filter(v=>Number.isFinite(v)&&v>=0);if(a.length)amount=a[a.length-1];}
        }
        qty=reconcile(qty,price,amount);
        const desc=cleanInvoiceDescription(descParts.join(' ').replace(/\s+/g,' ').trim());
        const code=String(uniq[i].code||'').trim();
        if(!desc||!(qty>0)||(price===null&&amount===null))continue;
        out.push(normalizeParsedInvoiceItem({sku:code,item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty,serials:''}));
      }
      if(out.length)break;
    }
  }
  return out;
}

function v661LayoutMoney(labelRe,{exclude=null}={}){
  const rows=getPdfLayoutRows(),re=labelRe instanceof RegExp?labelRe:new RegExp(labelRe,'i');
  const parseRaw=v=>{let x=String(v||'').trim().replace(/\s/g,'');if(!x)return null;x=x.replace(/(?<=\d),(?=\d{3}(?:\.|,|$))/g,'').replace(/,(?=\d{2}$)/,'.');const n=Number(x.replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null;};
  for(const row of rows){
    if(!re.test(row.text||'')||(exclude&&exclude.test(row.text||'')))continue;
    const items=[...(row.items||[])].sort((a,b)=>(Number(a.x)||0)-(Number(b.x)||0));
    const labelHits=items.filter(it=>re.test(String(it.text||''))),labelX=labelHits.length?Math.min(...labelHits.map(it=>Number(it.x)||0)):Math.min(...items.map(i=>Number(i.x)).filter(Number.isFinite),0);
    const band=rows.filter(r=>r.page===row.page&&Math.abs((Number(r.y)||0)-(Number(row.y)||0))<=7);
    const vals=[];for(const r of band)for(const it of r.items||[]){if((Number(it.x)||0)<labelX+6)continue;const n=parseRaw(it.text);if(n!==null)vals.push({n,x:Number(it.x)||0});}
    vals.sort((a,b)=>b.x-a.x);if(vals.length)return vals[0].n;
    const fallback=decimalMoneyCandidates(row.text||'');if(fallback.length)return fallback[fallback.length-1];
  }
  return null;
}
function v661RepairInvoiceMoneyFromLayout(doc={}){
  const s=v661LayoutMoney(/\b(?:Sub\s*Total|Subtotal)\b/i),g=v661LayoutMoney(/\b(?:Add\s+)?GST(?:\s*@?\s*\d+(?:\.\d+)?\s*%|\s*\d+\s*%)?\b/i,{exclude:/GST\s+Reg(?:istration)?\s*(?:No|Number)?/i}),t=v661LayoutMoney(/\b(?:Amount\s+Due|Grand\s*Total|Invoice\s*Total|Total\s*Amount)\b/i,{exclude:/Sub\s*Total|Subtotal/i});
  if(s!==null)doc.subtotal=Number(s);if(g!==null)doc.gst=Number(g);if(t!==null)doc.total_amount=Number(t);
  let sn=Number(doc.subtotal),gn=Number(doc.gst),tn=Number(doc.total_amount);
  if(Number.isFinite(tn)&&Number.isFinite(gn)){
    const calc=Math.round((tn-gn)*100)/100;
    if(calc>=0&&(!Number.isFinite(sn)||Math.abs((sn+gn)-tn)>.05)){doc.subtotal=calc;sn=calc;doc.moneyRecovery='amount_due_minus_gst';}
  }
  if(Number.isFinite(sn)&&Number.isFinite(gn)&&!Number.isFinite(tn)){doc.total_amount=Math.round((sn+gn)*100)/100;doc.moneyRecovery='subtotal_plus_gst';}
  if([Number(doc.subtotal),Number(doc.gst),Number(doc.total_amount)].every(Number.isFinite)&&Math.abs((Number(doc.subtotal)+Number(doc.gst))-Number(doc.total_amount))>.05)doc.total_amount=null;
  return doc;
}

function v661NeedsDeepRecovery(parsed={}){
  const d=parsed.doc||{},items=validParsedItems(parsed.items||[]),c=parsed?.invoiceClassification?.type||'uncertain';
  const a=Number(d.subtotal),b=Number(d.gst),z=Number(d.total_amount),moneyOk=[a,b,z].every(Number.isFinite)&&Math.abs((a+b)-z)<=.06;
  // Service-only invoices do not need inventory rows, but their invoice number/date/totals still do.
  if(c==='service')return !d.invoice_number||!d.invoice_date||!moneyOk;
  if(!d.invoice_number||!d.invoice_date||!items.length||c==='uncertain')return true;
  if(!moneyOk)return true;
  return false;
}

async function v661EnsureTesseract(){
  if(window.Tesseract)return window.Tesseract;
  await new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-v661-tesseract]');if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';sc.async=true;sc.dataset.v661Tesseract='1';sc.onload=resolve;sc.onerror=()=>reject(new Error('Recovery OCR library could not be loaded.'));document.head.appendChild(sc);});
  if(!window.Tesseract)throw new Error('Recovery OCR library did not initialise.');return window.Tesseract;
}
async function v661ForceOcrRecovery(file){
  const kind=v662FileKind(file);if(kind==='docx')return false;const T=await v661EnsureTesseract();setProgress(40,'Key invoice fields need a deeper scan — running recovery OCR…');
  const modes=[{key:'recovery-auto',label:'AUTO',psm:T.PSM?.AUTO??'3',texts:[],layouts:[]},{key:'recovery-block',label:'SINGLE_BLOCK',psm:T.PSM?.SINGLE_BLOCK??'6',texts:[],layouts:[]},{key:'recovery-column',label:'SINGLE_COLUMN',psm:T.PSM?.SINGLE_COLUMN??'4',texts:[],layouts:[]},{key:'recovery-sparse',label:'SPARSE_TEXT',psm:T.PSM?.SPARSE_TEXT??'11',texts:[],layouts:[]}];
  const canvases=[];
  if(kind==='pdf'){const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';const data=new Uint8Array(await file.arrayBuffer()),pdf=await pdfjs.getDocument({data}).promise;for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),vp=p.getViewport({scale:3.2}),c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);await p.render({canvasContext:c.getContext('2d',{willReadFrequently:true}),viewport:vp}).promise;canvases.push({c,page:i});}}
  else if(kind==='image'){const bmp=await createImageBitmap(file),c=document.createElement('canvas'),scale=Math.min(3,Math.max(1,2400/Math.max(bmp.width,bmp.height)));c.width=Math.round(bmp.width*scale);c.height=Math.round(bmp.height*scale);c.getContext('2d',{willReadFrequently:true}).drawImage(bmp,0,0,c.width,c.height);canvases.push({c,page:1});bmp.close?.();}
  const worker=await T.createWorker('eng');try{for(let ci=0;ci<canvases.length;ci++){for(let mi=0;mi<modes.length;mi++){const {c,page}=canvases[ci],m=modes[mi],pct=42+Math.round(45*((ci*modes.length+mi+1)/(canvases.length*modes.length)));setProgress(pct,`Recovery OCR ${m.label}… page ${page} of ${canvases.length}`);await worker.setParameters({tessedit_pageseg_mode:m.psm,preserve_interword_spaces:'1',user_defined_dpi:'240'});const r=await worker.recognize(c,{}, {text:true,tsv:true,hocr:true,blocks:true});const layout=ocrResultToLayout(r.data||{},page,c.height);m.layouts.push(layout);m.texts.push(String(r.data?.text||'').trim()||layout.rows?.map(x=>x.text).join('\n').trim());}}}finally{await worker.terminate();}
  const recovered=modes.map(m=>{const text=m.texts.join('\n').trim();return{source:m.key,label:m.label,text,layout:m.layouts,score:ocrTextQuality(text)+m.layouts.reduce((n,l)=>n+layoutInvoiceQuality(l),0)};}).filter(x=>x.text);state.ocrCandidates=[...(state.ocrCandidates||[]),...recovered].sort((a,b)=>b.score-a.score);return recovered.length>0;
}

function v661IsNonInventoryServiceLine(x={}){
  const text=normalizePdfText([x.item_name,x.description].filter(Boolean).join(' ')).replace(/\s+/g,' ').trim();
  const sku=normalizePdfText(x.sku||'').replace(/\s+/g,' ').trim();
  if(!text&&!sku)return false;
  const serviceSku=/\b(?:INSTALL(?:ATION)?|LABOU?R|SERVICE|REPAIR|DISMOUNT(?:ING)?|DISMANTL(?:E|ING)|RE-?INSTAT(?:E|EMENT)|RELOCAT(?:E|ION)|REMOV(?:E|AL)|TEST(?:ING)?|COMMISSION(?:ING)?)\b/i.test(sku);
  const strongStart=/^(?:sales\s*[-:]\s*)?(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|labou?r|installation|installing|services?|professional\s+services?|consultancy|consulting|training|testing|commissioning|setup|configuration|delivery|freight|transport|manpower|on[- ]?site\s+support)\b/i.test(text);
  const labourPhrase=/\b(?:supply\s+)?labou?r\s+(?:for|to|and|&)\s+(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|installation|install|services?|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|testing|commissioning)\b/i.test(text);
  const workPhrase=/\b(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|installation|testing|commissioning)\s*(?:work|works|service|services|job|labou?r)\b/i.test(text);
  const actionChain=/\b(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|remove|relocate|reinstate)\b[\s\S]{0,180}\b(?:install(?:ation|ing)?|test(?:ing)?|commission(?:ing)?)\b/i.test(text);
  const installBundle=/\b(?:installation|testing|commissioning)\s*(?:and|&|\/|,)+\s*(?:services?|testing|commissioning)\b/i.test(text);
  return serviceSku||strongStart||labourPhrase||workPhrase||actionChain||installBundle;
}

function v661ParseProductCodeLayoutItems(){
  const pages=state.pdfLayout||[],out=[];
  const token=(v='')=>String(v||'').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'').trim();
  const toNum=(v)=>{const n=Number(String(v??'').replace(/,(?=\d{2}(?:\D|$))/g,'.').replace(/,/g,'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null;};
  const reconcileQty=(qty,price,amount)=>{
    if(!(price>0)||!(amount>=0))return qty;
    const ratio=amount/price,rounded=Math.round(ratio);
    if(rounded>=1&&rounded<=999&&Math.abs(ratio-rounded)<0.015&&(qty===null||qty<=0||Math.abs(qty-rounded)>0.001))return rounded;
    return qty;
  };
  for(const pg of pages){
    const rows=pg.rows||[];
    const header=rows.find(r=>/\b(?:product\s*no\.?|product|sku|model|item\s*no\.?)\b/i.test(r.text)&&/\bdescription\b/i.test(r.text)&&/\b(?:qty|quantity|units?)\b/i.test(r.text)&&/\bprice\b/i.test(r.text)&&/\bamount\b/i.test(r.text));
    if(!header)continue;
    const pickX=(re)=>{const it=header.items.find(x=>re.test(token(x.text)));return it?it.x:null;};
    const xCode=Math.min(...header.items.map(i=>i.x));
    const xDesc=pickX(/^description$/i),xQty=pickX(/^(?:units?|qty|quantity)$/i),xPrice=pickX(/^(?:unit\s*)?price$/i)??pickX(/price/i),xAmount=pickX(/^amount$/i);
    if(!Number.isFinite(xCode)||[xDesc,xQty,xPrice,xAmount].some(v=>v===null))continue;
    const bCD=(xCode+xDesc)/2,qtyStart=xQty-Math.max(18,(xPrice-xQty)*0.28),bQP=(xQty+xPrice)/2,bPA=(xPrice+xAmount)/2;
    const stop=rows.filter(r=>r.y<header.y&&/^(?:remarks?|sub\s*total|subtotal|add\s+gst|gst\b|grand\s+total|total\b|amount\s+due)/i.test(r.text.replace(/^[^A-Za-z]+/,''))).sort((a,b)=>b.y-a.y)[0];
    const stopY=stop?stop.y:-Infinity;
    const body=rows.filter(r=>r.y<header.y&&r.y>stopY).sort((a,b)=>b.y-a.y);
    const anchors=[];
    for(const r of body){
      const left=r.items.filter(it=>it.x<bCD).map(it=>token(it.text)).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
      if(!left||left.length<3||/^(?:s\/?n|serial|shipment|remarks?|date|ref|subtotal|total)$/i.test(left))continue;
      const codeLike=(/[A-Za-z]/.test(left)&&/\d/.test(left))||/\b(?:installation|service|labou?r)\b/i.test(left);
      if(!codeLike)continue;
      const hasDesc=r.items.some(it=>it.x>=bCD&&it.x<qtyStart&&String(it.text||'').trim());
      const hasRight=r.items.some(it=>it.x>=qtyStart&&/[0-9]/.test(String(it.text||'')));
      if(hasDesc||hasRight)anchors.push({row:r,code:left});
    }
    const seenY=[];
    const uniq=anchors.filter(a=>seenY.every(y=>Math.abs(y-a.row.y)>Math.max(2,pg.yTolerance||2))&&(seenY.push(a.row.y),true));
    for(let i=0;i<uniq.length;i++){
      const tol=Math.max(3,pg.yTolerance||3),topY=uniq[i].row.y+tol,bottomY=i+1<uniq.length?uniq[i+1].row.y+tol:stopY;
      const group=body.filter(r=>r.y<=topY&&r.y>bottomY);
      const descParts=[];let qty=null,price=null,amount=null;
      for(const r of group){
        const descTokens=r.items.filter(it=>it.x>=bCD&&it.x<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean);
        if(descTokens.length){const part=descTokens.join(' ');if(!/^\s*(?:s\/?n|serial\s*(?:no|number)?|shipment\s*no)\b/i.test(part))descParts.push(part);}
        if(qty===null){const qVals=r.items.filter(it=>it.x>=qtyStart&&it.x<bQP).map(it=>toNum(token(it.text))).filter(v=>v!==null);if(qVals.length)qty=qVals[0];}
        if(price===null){const vals=r.items.filter(it=>it.x>=bQP&&it.x<bPA).flatMap(it=>decimalMoneyCandidates(token(it.text)));if(vals.length)price=vals[vals.length-1];}
        if(amount===null){const vals=r.items.filter(it=>it.x>=bPA).flatMap(it=>decimalMoneyCandidates(token(it.text)));if(vals.length)amount=vals[vals.length-1];}
      }
      qty=reconcileQty(qty,price,amount);
      const code=uniq[i].code.replace(/\s+/g,' ').trim();
      const desc=cleanInvoiceDescription(descParts.join(' '));
      const warrantyLike=/\b(?:warranty|wt\b|\d+\s*years?\s*warranty)\b/i.test(code+' '+desc);
      if(warrantyLike&&(amount===null||amount===0)){
        if(out.length){const years=(code+' '+desc).match(/\b(\d+)\s*years?\b/i);out[out.length-1].warranty=years?`${years[1]} Years`:(desc||'Warranty');}
        continue;
      }
      if(!desc||!(qty>0))continue;
      if(price===null&&amount===null)continue;
      out.push(normalizeParsedInvoiceItem({sku:code,item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:''}));
    }
  }
  return out;
}


function v665CleanVerifiedSku(value='',sourceText=''){
  const MAX_SKU_LENGTH=13;
  let raw=normalizePdfText(value).replace(/\s+/g,' ').trim();
  if(!raw)return '';
  raw=raw.split(/\b(?:WARRANTY|WT\s+FOR|S\s*[/\\.-]?\s*N|S\.?N\.?|SERIAL(?:\s+(?:NO\.?|NUMBER))?|IN\s+STOCK|CARRY\s+IN|SERVICE\s+CENTRE|SERVICE\s+CENTER)\b/i)[0].trim();
  raw=raw.replace(/[-,:;|]+$/g,'').trim();
  if(!raw)return '';
  const compact=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  const sourceCompact=compact(sourceText);
  const printed=c=>{const x=compact(c);return !!x&&x.length>=3&&(!sourceCompact||sourceCompact.includes(x));};
  const acceptable=c=>{c=String(c||'').trim();return !!c&&c.length<=MAX_SKU_LENGTH&&/^[A-Z0-9][A-Z0-9+._\/-]{2,}$/i.test(c)&&(/[A-Za-z]/.test(c)||/^\d{3,12}$/.test(c))&&printed(c);};
  if(acceptable(raw))return raw;
  const tokens=raw.split(/\s+/).map(x=>x.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'')).filter(Boolean);
  const candidates=[...new Set(tokens.filter(t=>acceptable(t)&&(/[A-Za-z]/.test(t)&&/\d/.test(t))))];
  if(candidates.length===1)return candidates[0];
  return '';
}

function v674IsExcludedInventoryAccessoryLine(x={}){
  const itemName=normalizePdfText(x.item_name||'').replace(/\s+/g,' ').trim();
  const description=normalizePdfText(x.description||'').replace(/\s+/g,' ').trim();
  const sku=normalizePdfText(x.sku||'').replace(/\s+/g,' ').trim();
  const primary=itemName||description;
  const evidence=[sku,primary].filter(Boolean).join(' ');
  if(!evidence)return false;

  // Explicit accessory/support identities. Keep this narrow so equipment is not removed merely
  // because a longer description says a cable/bracket is included in the box.
  const explicit=new RegExp('\\b(?:security\\s+(?:lock|cable)|projector\\s+lock|kensington\\s+lock|safety\\s+(?:wire|cable)|(?:projector|ceiling|wall|speaker|display|monitor|tv)\\s+(?:ceiling\\s+)?mount|ceiling\\s+mount|wall\\s+mount|mounting\\s+bracket|speaker\\s+bracket|projector\\s+bracket|display\\s+bracket|lamp\\s*kits?|lampkits?|replacement\\s+(?:projector\\s+)?lamp|projector\\s+lamp|(?:gravity|rolling|mobile|equipment|av|projector|display|monitor)\\s+cart|trolley|(?:rolling|mobile|floor|speaker|microphone|display|monitor|projector|equipment|av)\\s+stand)\\b','i');
  if(explicit.test(evidence))return true;

  const target=primary||evidence;
  if(/\b(?:bracket|mount)\b/i.test(target))return true;
  if(/\b(?:cart|trolley)\b/i.test(target))return true;
  if(/\bstands?\b/i.test(target)&&!/\bstandalone\b/i.test(target))return true;
  if(/\b(?:lamp\s*kits?|lampkits?)\b/i.test(target))return true;

  const cableWord=/\b(?:cables?|cords?|patch\s+leads?|fly\s+leads?)\b/i;
  const trackedDevice=/\b(?:projector|microphone|speaker|camera|mixer|display|monitor|transmitter|receiver|control\s+panel|amplifier|processor|switcher|visualizer|document\s+camera|audio\s+tester)\b/i;
  if(cableWord.test(itemName)){
    const accessoryMentionOnly=trackedDevice.test(itemName)&&/\b(?:with|includes?|including|supplied\s+with)\b/i.test(itemName);
    if(!accessoryMentionOnly)return true;
  }
  if(!itemName&&cableWord.test(description)&&!trackedDevice.test(description))return true;
  return false;
}

function v665IsNonInventoryServiceLine(x={}){
  const text=normalizePdfText([x.item_name,x.description].filter(Boolean).join(' ')).replace(/\s+/g,' ').trim();
  const sku=normalizePdfText(x.sku||'').replace(/\s+/g,' ').trim();
  if(!text&&!sku)return false;
  const physical=/\b(?:projector|microphone|speaker|camera|mixer|display|monitor|trolley|transmitter|receiver|screen|audio\s+tester|amplifier|processor|switcher|rack|stand|control\s+panel|wireless\s+system)\b/i.test(text);
  const deliveryOnly=/^(?:return\s+trip|trip\s+for|signed\s+delivery\s+order|delivery\s+order|delivery\s+fee|delivery\s+charge|collection|courier|freight|transport)\b/i.test(text)||(/\bsigned\s+delivery\s+order\b/i.test(text)&&!physical);
  const serviceSku=/\b(?:INSTALL(?:ATION)?|LABOU?R|SERVICE|REPAIR|DISMOUNT(?:ING)?|DISMANTL(?:E|ING)|RE-?INSTAT(?:E|EMENT)|RELOCAT(?:E|ION)|REMOV(?:E|AL)|TEST(?:ING)?|COMMISSION(?:ING)?|DELIVERY|FREIGHT|TRANSPORT|COURIER)\b/i.test(sku);
  const strongStart=/^(?:sales\s*[-:]\s*)?(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|labou?r|installation|installing|services?|professional\s+services?|consultancy|consulting|training|testing|commissioning|setup|configuration|delivery|freight|transport|manpower|on[- ]?site\s+support)\b/i.test(text);
  const labourPhrase=/\b(?:supply\s+)?labou?r\s+(?:for|to|and|&)\s+(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|installation|install|services?|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|testing|commissioning|replace)\b/i.test(text);
  const workPhrase=/\b(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|installation|testing|commissioning)\s*(?:work|works|service|services|job|labou?r)\b/i.test(text);
  const actionChain=/\b(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|remove|relocate|reinstate)\b[\s\S]{0,180}\b(?:install(?:ation|ing)?|test(?:ing)?|commission(?:ing)?)\b/i.test(text);
  const installBundle=/\b(?:installation|testing|commissioning)\s*(?:and|&|\/|,)+\s*(?:services?|testing|commissioning)\b/i.test(text);
  return deliveryOnly||serviceSku||strongStart||labourPhrase||workPhrase||actionChain||installBundle;
}

function v665ClassifyDocumentType(text=''){
  const t=normalizePdfText(text).replace(/\r/g,'\n');
  const lines=t.split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,120);
  let invoiceScore=0,deliveryScore=0,otherScore=0;
  for(const line of lines){
    const u=line.toUpperCase().replace(/[^A-Z0-9/# ]+/g,' ').replace(/\s+/g,' ').trim();
    if(/^(?:TAX\s+INVOICE|INVOICE|SALES\s+INVOICE|COMMERCIAL\s+INVOICE|GST\s+INVOICE)$/.test(u))invoiceScore+=12;
    else if(/\bTAX\s+INVOICE\b/.test(u))invoiceScore+=8;
    if(/^(?:SIGNED\s+)?DELIVERY\s+ORDER$/.test(u)||/^(?:DELIVERY\s+NOTE|PACKING\s+LIST|RETURN\s+NOTE|GOODS\s+RECEIVED\s+NOTE)$/.test(u))deliveryScore+=14;
    else if(/\b(?:SIGNED\s+)?DELIVERY\s+ORDER\b/.test(u)&&!/(?:\bNO\b|\bNUMBER\b|#|\bREF\b|\bREFERENCE\b)/.test(u))deliveryScore+=8;
    if(/^(?:QUOTATION|QUOTE|PURCHASE\s+ORDER|STATEMENT|RECEIPT)$/.test(u))otherScore+=12;
  }
  if(/\binvoice\s*(?:no\.?|number|#)\s*[:#.-]?\s*[A-Z0-9]/i.test(t))invoiceScore+=5;
  if(/\b(?:invoice\s*)?date\s*[:#.-]?\s*[0-3]?\d[/.\-][01]?\d[/.\-]\d{2,4}/i.test(t))invoiceScore+=3;
  if(/\b(?:sub\s*total|subtotal)\b/i.test(t)&&/\bgst\b/i.test(t)&&/\b(?:amount\s+due|grand\s+total|invoice\s+total|total\s+amount)\b/i.test(t))invoiceScore+=4;
  if(/\bdescription\b/i.test(t)&&/\b(?:qty|quantity)\b/i.test(t)&&/\b(?:unit\s*)?price\b/i.test(t)&&/\bamount\b/i.test(t))invoiceScore+=3;
  if(deliveryScore>=12&&invoiceScore<12)return{type:'delivery_order',invoiceScore,deliveryScore,otherScore,reason:'Document header identifies a Delivery Order / Delivery Note rather than an invoice.'};
  if(otherScore>=12&&invoiceScore<12)return{type:'non_invoice',invoiceScore,deliveryScore,otherScore,reason:'Document header identifies a non-invoice document.'};
  if(invoiceScore>=10&&invoiceScore>=deliveryScore)return{type:'invoice',invoiceScore,deliveryScore,otherScore,reason:'Invoice title/header and invoice fields were verified.'};
  if(deliveryScore>invoiceScore)return{type:'delivery_order',invoiceScore,deliveryScore,otherScore,reason:'Delivery Order evidence is stronger than invoice evidence.'};
  return{type:'uncertain',invoiceScore,deliveryScore,otherScore,reason:'The document could not be proven to be an invoice.'};
}

function v665DetectImportDocumentType(raw=''){
  const sources=typeof v661EvidenceSources==='function'?v661EvidenceSources(raw):[{text:String(raw||'')}];
  const checks=sources.map(x=>v665ClassifyDocumentType(x.text||''));
  const invoice=checks.filter(x=>x.type==='invoice').sort((a,b)=>b.invoiceScore-a.invoiceScore)[0];
  const delivery=checks.filter(x=>x.type==='delivery_order').sort((a,b)=>b.deliveryScore-a.deliveryScore)[0];
  const other=checks.find(x=>x.type==='non_invoice');
  if(delivery&&(!invoice||delivery.deliveryScore>invoice.invoiceScore+2))return delivery;
  if(invoice)return invoice;
  if(delivery)return delivery;
  if(other)return other;
  return checks.sort((a,b)=>(b.invoiceScore+b.deliveryScore+b.otherScore)-(a.invoiceScore+a.deliveryScore+a.otherScore))[0]||{type:'uncertain',reason:'No readable document evidence.'};
}

async function v665EnsureInvoiceDocument(file,raw=''){
  let verdict=detectImportDocumentType(raw);
  const kind=v662FileKind(file);
  if(verdict.type==='uncertain'&&(kind==='pdf'||kind==='image')){
    const already=(state.ocrCandidates||[]).some(x=>String(x.source||'').startsWith('recovery-'));
    if(!already){try{await forceOcrRecovery(file);}catch(e){console.warn('Invoice-type recovery OCR could not complete.',e);}}
    verdict=detectImportDocumentType(raw);
  }
  state.importDocumentType=verdict;
  if(verdict.type==='invoice')return verdict;
  if(verdict.type==='delivery_order')throw new Error('Only invoices can be imported. This document was identified as a Delivery Order / Delivery Note.');
  if(verdict.type==='non_invoice')throw new Error('Only invoices can be imported. This document is not an invoice.');
  throw new Error('Only invoices can be imported. The document could not be verified as an Invoice / Tax Invoice after repeated checks.');
}

function v665DisplayDocumentFilename(doc={},invoiceDate=''){
  const m=String(invoiceDate||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const supplier=String(doc.supplier_name||'').replace(/\s+/g,' ').trim();
  if(!m||!supplier)return String(doc.file_name||'');
  const ext=(String(doc.file_name||'').match(/\.(pdf|png|jpe?g|webp|docx)$/i)||[])[0]||'.pdf';
  return `${m[3]}/${m[2]}/${m[1]}-${supplier}${ext.toLowerCase().replace('.jpeg','.jpg')}`;
}

function v665StoredDocumentFilename(doc={},file=null){
  const m=String(doc.invoice_date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date=m?`${m[3]}-${m[2]}-${m[1]}`:'';
  const supplier=String(doc.supplier_name||'Unknown-Supplier').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim().replace(/\s/g,'-').replace(/-+/g,'-');
  const source=String(file?.name||'').toLowerCase();
  const ext=(source.match(/\.(pdf|png|jpe?g|webp|docx)$/i)||[])[1]||'pdf';
  return [date,supplier].filter(Boolean).join('-')+'.'+ext.replace('jpeg','jpg');
}

function v661CleanVerifiedSku(value='',sourceText=''){
  let raw=normalizePdfText(value).replace(/\s+/g,' ').trim();
  if(!raw)return '';
  // Metadata is never part of a SKU/model. Stop at explicit metadata markers.
  raw=raw.split(/\b(?:WARRANTY|WT\s+FOR|S\s*[/\\.-]?\s*N|S\.?N\.?|SERIAL(?:\s+(?:NO\.?|NUMBER))?|IN\s+STOCK|CARRY\s+IN|SERVICE\s+CENTRE|SERVICE\s+CENTER)\b/i)[0].trim();
  raw=raw.replace(/[,:;|]+$/g,'').replace(/\s+-\s*$/,'').trim();
  if(!raw)return '';
  const compact=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  const sourceCompact=compact(sourceText);
  const directlyPrinted=(candidate)=>{
    const c=compact(candidate);return !!c&&c.length>=3&&(!sourceCompact||sourceCompact.includes(c));
  };
  // A clean SKU/model cell is preserved when it is itself code-like and appears in the source.
  if(/^[A-Z0-9][A-Z0-9+._\/-]{2,}$/i.test(raw)&&(/[A-Za-z]/.test(raw)||/^\d{3,20}$/.test(raw))&&directlyPrinted(raw))return raw;
  const tokens=raw.split(/\s+/).map(x=>x.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'')).filter(Boolean);
  const modelToken=t=>/^[A-Z0-9][A-Z0-9+._\/-]{2,}$/i.test(t)&&/[A-Za-z]/.test(t)&&/\d/.test(t);
  const modelIndex=tokens.findIndex(modelToken);
  if(tokens.length>=2&&tokens.length<=3&&modelIndex>=0&&directlyPrinted(raw)){
    const before=tokens.slice(0,modelIndex).every(t=>/^[A-Z]{1,12}$/.test(t));
    const after=tokens.slice(modelIndex+1).every(t=>/^[A-Z0-9]{1,3}$/.test(t));
    if(before&&after)return raw;
  }
  // If OCR merged brand/description/serial text into the SKU field, keep only one explicitly printed model-like token.
  const codeLike=t=>modelToken(t)&&directlyPrinted(t);
  const candidates=[...new Set(tokens.filter(codeLike))];
  if(candidates.length===1)return candidates[0];
  // Do not invent a SKU from a description when the printed SKU/model cannot be proven.
  return '';
}

function v661CleanInventoryDescription(value=''){
  let out=cleanInvoiceDescription(value)
    .replace(/\bShipment\s+No\.?\s*[:#.-]?\s*[A-Z0-9._\/-]+\s*[:;,-]?/gi,' ')
    .replace(/\s*\bS\s*[/\\.-]?\s*N\s*[:#.-]?\s*[A-Z0-9,._\/-\s]+$/i,' ')
    .replace(/\s+/g,' ').trim();
  out=out.replace(/\s+\d+(?:\.\d+)?\s+(?:UNIT|UNITS|PCS?|EA|EACH|SET|SETS|PAIR|PAIRS)\b[\s\S]*$/i,' ')
         .replace(/\s+\b(?:QTY|QUANTITY|UOM|UNIT\s+PRICE|UNITPRICE|AMOUNT(?:\s+IN\s+SGD)?|CURRENCY|SUB\s*TOTAL|SUBTOTAL|GST(?:\s*\d+(?:\.\d+)?\s*%?)?|TOTAL(?:\s+AMOUNT)?|AMOUNT\s+DUE|TAX)\b[\s\S]*$/i,' ')
         .replace(/\s+(?:SGD|S\$|\$)\s*\d[\d,.]*[\s\S]*$/i,' ')
         .replace(/[|]+/g,' ')
         .replace(/\s+/g,' ').trim();
  return out.slice(0,180).trim();
}


function v667PlausibleItemName(value=''){
  const s=String(value||'').replace(/\s+/g,' ').trim();
  if(s.length<3||s.length>160)return false;
  // Never allow invoice-header/contact/address fragments to become inventory items.
  if(/\b(?:sub\s*total|subtotal|amount\s+due|gst\s*\d*\s*%?|currency|unit\s+price|invoice\s*(?:no|number)|customer\s+code|customer\s+copy|shipment\s+no|company\s+reg|gst\s+reg|sold\s+to|delivered\s+to|salesman|terms|ref\.?\s*no|p\/?o\s*no|page\s+\d|e-?mail|tel\.?|telephone|fax\.?|postal|singapore\s+\d{5,6})\b/i.test(s))return false;
  if(/^(?:installation|labou?r|delivery|return\s+trip|signed\s+delivery\s+order|freight|courier|transport)\b/i.test(s))return false;
  const words=s.split(/\s+/).filter(Boolean),single=words.filter(w=>/^[A-Za-z0-9]$/.test(w)).length;
  if(single>=3&&single/Math.max(1,words.length)>=0.30)return false;
  if(/(?:\b[A-Za-z]\s+){3,}[A-Za-z]\b/.test(s)||/(?:\b\d\s+){3,}\d\b/.test(s))return false;
  if(/^\d(?:\s+\d){2,}$/i.test(s))return false;
  return s.replace(/[^A-Za-z0-9]/g,'').length>=3;
}
function v667ShortItemName(value=''){
  let s=cleanInventoryDescription(value).replace(/^[-–—]+\s*/,'').replace(/\s+/g,' ').trim();
  s=s.replace(/\b(?:S\/?N|Serial(?:\s+(?:No|Number))?)\s*[:#.-].*$/i,'').trim();
  const cut=s.search(/\s+-\s*(?:\d|WXGA|HD|FHD|UHD|resolution|lumens?|ansi)\b/i);if(cut>10)s=s.slice(0,cut).trim();
  return s.slice(0,96).trim();
}
function v667InferCategory(line={}){
  const t=normalizePdfText([line.sku,line.item_name,line.description].filter(Boolean).join(' ')).replace(/\s+/g,' ').toLowerCase();
  if(/\b(?:projector|visualizer|document\s+camera)\b/.test(t))return 'Projection / Video';
  if(/\b(?:control\s+panel|controller|control\s+processor|hdmi\s+control)\b/.test(t))return 'AV Control';
  if(/\b(?:active\s+speaker|speaker|loudspeaker)\b/.test(t))return 'Audio / Speakers';
  if(/\b(?:microphone|transmitter|receiver|wireless\s+system)\b/.test(t))return 'Audio / Wireless';
  if(/\b(?:audio\s+tester|signal\s+tester)\b/.test(t))return 'Audio / Test Equipment';
  if(/\b(?:trolley|cart|stand|mount|bracket)\b/.test(t))return 'AV Accessories';
  if(/\b(?:mixer|amplifier|processor|dsp)\b/.test(t))return 'Audio / Equipment';
  if(/\b(?:ideahub|collaboration\s+device|display|monitor|led\s+screen|lcd\s+screen)\b/.test(t))return 'Display / Video';
  return '';
}
function v667ParseAvMediaTargetedText(text=''){
  const lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),out=[];
  let inTable=false,current=null;
  const num=v=>{let raw=String(v||'').trim();if(/^[Iil|!]{1,2}$/.test(raw))return 1;const z=raw.replace(/,/g,'').replace(/[^0-9.]/g,'');const n=Number(z);return Number.isFinite(n)?n:null;};
  const row=/^[|.,;:\-]*\s*(?:[jIl]\s+)?([A-Z0-9][A-Z0-9+._\/-]{2,}(?:\s*-?\s*WT\s+FOR\s+\d+YR)?)\s+(.+?)\s+(\d{1,4}|[Iil|!]{1,2})\s+(\d[\d,]*(?:\.\d{1,2})?)\s+(\d[\d,]*(?:\.\d{0,2})?)\s*$/i;
  const warranty=/^([A-Z0-9][A-Z0-9+._\/-]{2,}.*?)\s+(\d+)\s+years?\s+warranty\s+(\d+)\s*$/i;
  for(const line of lines){
    if(/\bPRODUCT\s*NO\.?\b/i.test(line)&&/\bDESCRIPTION\b/i.test(line)&&/\bQUANTITY\b/i.test(line)){inTable=true;continue;}
    if(!inTable)continue;
    if(/\b(?:SUB\s*TOTAL|SUBTOTAL|GST\s*\d*\s*%?|AMOUNT\s+DUE)\b/i.test(line))break;
    let m=line.match(row);
    if(m){
      const sku=cleanVerifiedSku(m[1].replace(/\s+/g,''),text),rawName=v667ShortItemName(m[2]),qty=num(m[3]),price=num(m[4]);let amount=num(m[5]);
      if(Number.isFinite(qty)&&Number.isFinite(price)&&(!Number.isFinite(amount)||Math.abs(amount-qty*price)>Math.max(.06,price*.03)))amount=Math.round(qty*price*100)/100;
      current=normalizeParsedInvoiceItem({sku,item_name:rawName,description:rawName,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:''});
      if(v667PlausibleItemName(rawName))out.push(current);else current=null;
      continue;
    }
    m=line.match(warranty);
    if(m&&out.length){const years=Number(m[2]);if(years>0&&years<20)out[out.length-1].warranty=`${years} Years`;continue;}
    const sn=line.match(/^S\s*\/?\s*N\s*[:#.-]?\s*(.+)$/i);
    if(sn&&out.length){const vals=(sn[1].match(/\b[A-Z0-9][A-Z0-9._\/-]{5,31}\b/gi)||[]);if(vals.length)out[out.length-1].serials=[...new Set([...(parseSerials(out[out.length-1].serials||'')),...vals])].join(', ');continue;}
    if(current&&/^[-–—]/.test(line)&&!/(?:price|amount|subtotal|gst|shipment)/i.test(line)){
      const spec=line.replace(/^[-–—]+\s*/,'').trim();if(spec&&current.description.length<140)current.description=cleanInventoryDescription((current.description+'; '+spec).trim());
    }
  }
  return out;
}
async function v667AddAvMediaTargetedOcr(file){
  if(v662FileKind(file)!=='pdf')return false;
  const T=await v661EnsureTesseract();
  const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
  const data=new Uint8Array(await file.arrayBuffer()),pdf=await pdfjs.getDocument({data}).promise;if(!pdf.numPages)return false;
  const p=await pdf.getPage(1),vp=p.getViewport({scale:3.4}),pageCanvas=document.createElement('canvas');pageCanvas.width=Math.round(vp.width);pageCanvas.height=Math.round(vp.height);await p.render({canvasContext:pageCanvas.getContext('2d',{willReadFrequently:true}),viewport:vp}).promise;
  const makeCrop=(x0,y0,x1,y1)=>{const c=document.createElement('canvas'),sx=Math.round(pageCanvas.width*x0),sy=Math.round(pageCanvas.height*y0),sw=Math.round(pageCanvas.width*(x1-x0)),sh=Math.round(pageCanvas.height*(y1-y0));c.width=sw;c.height=sh;c.getContext('2d',{willReadFrequently:true}).drawImage(pageCanvas,sx,sy,sw,sh,0,0,sw,sh);return c;};
  const crops=[makeCrop(.03,.18,.97,.35),makeCrop(.025,.32,.975,.90)],texts=[];const worker=await T.createWorker('eng');
  try{await worker.setParameters({tessedit_pageseg_mode:T.PSM?.SINGLE_BLOCK??'6',preserve_interword_spaces:'1',user_defined_dpi:'240'});for(let i=0;i<crops.length;i++){setProgress(38+i*6,i?'Reading AV Media product table…':'Reading AV Media invoice header…');const r=await worker.recognize(crops[i],{}, {text:true});texts.push(String(r.data?.text||'').trim());}}finally{await worker.terminate();}
  const text=texts.filter(Boolean).join('\n');if(!text)return false;
  state.ocrCandidates=[...(state.ocrCandidates||[]).filter(x=>x.source!=='avmedia-targeted'),{source:'avmedia-targeted',text,layout:[],score:1500}];
  return true;
}

function v661ParseAvMediaMixedLayoutItems(){
  const pages=state.pdfLayout||[],out=[];
  const token=v=>String(v||'').trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
  const numVal=v=>{const z=String(v??'').replace(/\s/g,'').replace(/,(?=\d{3}(?:\D|$))/g,'').replace(/,(?=\d{2}(?:\D|$))/g,'.').replace(/[^0-9.-]/g,'');const n=Number(z);return Number.isFinite(n)?n:null;};
  const moneyVals=v=>{const raw=String(v||'').replace(/\s/g,'');const normalized=raw.replace(/(?<=\d)[,.](?=\d{3}(?:[,.]\d{2})?$)/g,'').replace(/,(?=\d{2}$)/,'.');const n=Number(normalized.replace(/[^0-9.-]/g,''));const vals=decimalMoneyCandidates(String(v||''));return vals.length?vals:(Number.isFinite(n)?[n]:[]);};
  const allSource=(pages.flatMap(pg=>(pg.rows||[]).map(r=>r.text||'')).join('\n'));
  for(const pg of pages){
    const rows=(pg.rows||[]).filter(r=>Array.isArray(r.items)&&r.items.length);
    const headerRows=rows.filter(r=>/\bDESCRIPTION\b/i.test(r.text||'')||/\bPRODUCT\s*NO\.?\b/i.test(r.text||''));
    for(const seed of headerRows){
      const band=rows.filter(r=>Math.abs((Number(r.y)||0)-(Number(seed.y)||0))<=32);
      const headerItems=band.flatMap(r=>r.items||[]).sort((a,b)=>(Number(a.x)||0)-(Number(b.x)||0));
      const bandText=band.map(r=>r.text||'').join(' ');
      if(!/\bPRODUCT\b/i.test(bandText)||!/\bDESCRIPTION\b/i.test(bandText)||!/(?:\bQUANTITY\b|\bQTY\b)/i.test(bandText)||!/\bPRICE\b/i.test(bandText)||!/\bAMOUNT\b/i.test(bandText))continue;
      const findX=re=>{const h=headerItems.filter(it=>re.test(String(it.text||'').trim()));return h.length?Math.min(...h.map(it=>Number(it.x)||0)):null;};
      let xCode=findX(/PRODUCT/i);if(xCode===null)xCode=Math.min(...headerItems.map(it=>Number(it.x)).filter(Number.isFinite));
      const xDesc=findX(/DESCRIPTION/i),xQty=findX(/QUANTITY|\bQTY\b/i),xAmount=findX(/AMOUNT/i);let xPrice=findX(/PRICE/i);
      if(![xCode,xDesc,xQty,xPrice,xAmount].every(Number.isFinite)||!(xCode<xDesc&&xDesc<xQty&&xQty<xPrice&&xPrice<xAmount))continue;
      const headerY=Number(seed.y)||0;
      const totals=rows.filter(r=>/\b(?:SUB\s*TOTAL|SUBTOTAL|GST\s*\d*\s*%?|AMOUNT\s+DUE|GRAND\s+TOTAL|INVOICE\s+TOTAL)\b/i.test(r.text||''));
      let totalRow=null;if(totals.length)totalRow=totals.sort((a,b)=>Math.abs((Number(a.y)||0)-headerY)-Math.abs((Number(b.y)||0)-headerY))[0];
      let dir=totalRow?Math.sign((Number(totalRow.y)||0)-headerY):0;
      if(!dir){
        const below=rows.filter(r=>(Number(r.y)||0)>headerY&&/\d/.test(r.text||'')).length;
        const above=rows.filter(r=>(Number(r.y)||0)<headerY&&/\d/.test(r.text||'')).length;dir=below>=above?1:-1;
      }
      const logical=r=>((Number(r.y)||0)-headerY)*dir;
      const totalLogical=totalRow?logical(totalRow):Infinity;
      const body=rows.filter(r=>logical(r)>2&&logical(r)<totalLogical-1).sort((a,b)=>logical(a)-logical(b));
      if(!body.length)continue;
      const bCD=(xCode+xDesc)/2,qtyStart=xQty-Math.max(12,(xPrice-xQty)*.22),bQP=(xQty+xPrice)/2,bPA=(xPrice+xAmount)/2;
      const anchors=[];
      for(const r of body){
        const code=(r.items||[]).filter(it=>(Number(it.x)||0)>=xCode-22&&(Number(it.x)||0)<bCD).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
        if(!code||/^(?:S\/?N|SERIAL|WARRANTY|SHIPMENT|DATE|REF\.?|TERMS|GST|TOTAL)$/i.test(code))continue;
        const desc=(r.items||[]).filter(it=>(Number(it.x)||0)>=bCD&&(Number(it.x)||0)<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ');
        const hasMoney=(r.items||[]).some(it=>(Number(it.x)||0)>=qtyStart&&/\d/.test(String(it.text||'')));
        const codeLike=/\d/.test(code)&&(/[A-Za-z]/.test(code)||/^\d{4,}(?:[-/][A-Za-z0-9]+)?$/.test(code));
        if(codeLike&&(desc||hasMoney))anchors.push({row:r,code});
      }
      const uniq=[];for(const a of anchors){if(uniq.every(u=>Math.abs(logical(u.row)-logical(a.row))>Math.max(3,pg.yTolerance||3)))uniq.push(a);}
      for(let i=0;i<uniq.length;i++){
        const p0=logical(uniq[i].row)-Math.max(4,pg.yTolerance||3),p1=i+1<uniq.length?logical(uniq[i+1].row)-Math.max(4,pg.yTolerance||3):totalLogical;
        const group=body.filter(r=>logical(r)>=p0&&logical(r)<p1);
        const descParts=[];let qty=null,price=null,amount=null,warranty='',serials=[];
        for(const r of group){
          const d=(r.items||[]).filter(it=>(Number(it.x)||0)>=bCD&&(Number(it.x)||0)<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ').trim();
          if(d){
            if(/\bwarranty\b|\bWT\s+FOR\b/i.test(d)){const y=d.match(/\b(\d+)\s*years?\b/i);warranty=y?`${y[1]} Years`:warranty;}
            else descParts.push(d);
            const sn=d.match(/\bS\s*\/?\s*N\s*[:#.-]?\s*(.+)$/i);if(sn)serials.push(...(sn[1].match(/\b[A-Z0-9][A-Z0-9._\/-]{5,31}\b/gi)||[]));
          }
          if(qty===null){const q=(r.items||[]).filter(it=>(Number(it.x)||0)>=qtyStart&&(Number(it.x)||0)<bQP).map(it=>numVal(it.text)).find(v=>Number.isFinite(v)&&v>0&&v<10000);if(Number.isFinite(q))qty=q;}
          if(price===null){const ps=(r.items||[]).filter(it=>(Number(it.x)||0)>=bQP&&(Number(it.x)||0)<bPA).flatMap(it=>moneyVals(it.text)).filter(Number.isFinite);if(ps.length)price=ps[ps.length-1];}
          if(amount===null){const as=(r.items||[]).filter(it=>(Number(it.x)||0)>=bPA).flatMap(it=>moneyVals(it.text)).filter(Number.isFinite);if(as.length)amount=as[as.length-1];}
        }
        if(price>0&&amount>=0){const q=Math.round(amount/price);if(q>=1&&q<=999&&Math.abs(amount/price-q)<.02)qty=q;}
        const codeRaw=uniq[i].code,rawDesc=cleanInvoiceDescription(descParts.join(' '));
        const warrantyRow=/\b(?:WARRANTY|WT\s+FOR|\d+\s*YEARS?\s+WARRANTY)\b/i.test(codeRaw+' '+rawDesc)&&(amount===null||amount===0);
        if(warrantyRow){if(out.length){if(warranty)out[out.length-1].warranty=warranty;}continue;}
        if(!(qty>0)||(price===null&&amount===null)||!rawDesc)continue;
        const sku=cleanVerifiedSku(codeRaw,allSource),description=cleanInventoryDescription(rawDesc);
        out.push(normalizeParsedInvoiceItem({sku,item_name:description,description,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty,serials:[...new Set(serials)].join(', ')}));
      }
      if(out.length)return out;
    }
  }
  return out;
}

function v661ParseAvMediaTextItems(text=''){
  const lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const moneyVal=v=>{const z=String(v||'').replace(/(?:SGD|S\$|\$)/gi,'').replace(/\s/g,'').replace(/,(?=\d{3}(?:\.\d{2})?$)/g,'').replace(/,(?=\d{2}$)/,'.').replace(/[^0-9.-]/g,'');const n=Number(z);return Number.isFinite(n)?n:null;};
  const money='(?:S?\\$?\\s*\\d[\\d,]*(?:[.]\\d{2}))';
  const rowRe=new RegExp('^([A-Z0-9][A-Z0-9+._\\/-]{2,}(?:\\s+(?:[A-Z0-9]{1,8})){0,3})\\s+(.+?)\\s+(\\d+(?:[.]\\d+)?)\\s+('+money+')\\s+('+money+')$','i');
  let header=-1;
  for(let i=0;i<lines.length;i++){
    const l=lines[i];
    if(/\b(?:PROD(?:UCT|OUCT)|STOCK)\s*(?:NO\.?|NUMBER|CODE)?\b/i.test(l)&&/\bDESCRIPTION\b/i.test(l)&&/\b(?:QUANTITY|QTY)\b/i.test(l)&&/\b(?:UNIT\s*)?PRICE\b/i.test(l)&&/\bAMOUNT\b/i.test(l)){header=i;break;}
  }
  const from=header>=0?header+1:0,out=[];let current=null;
  for(let i=from;i<lines.length;i++){
    const line=lines[i];
    if(/\b(?:SUB\s*TOTAL|SUBTOTAL|GST\s*\d*\s*%|AMOUNT\s+DUE|GRAND\s+TOTAL|TOTAL\s+DUE)\b/i.test(line))break;
    const m=line.match(rowRe);
    if(m){
      const qty=moneyVal(m[3]),price=moneyVal(m[4]),amount=moneyVal(m[5]);
      if(!(qty>0)||price===null||amount===null)continue;
      const code=String(m[1]||'').trim(),desc=cleanInventoryDescription(m[2]);if(!desc)continue;
      current=normalizeParsedInvoiceItem({sku:cleanVerifiedSku(code,text),item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:''});out.push(current);continue;
    }
    // Preserve useful continuations beneath the last priced item but never append totals/header metadata.
    if(current&&!/^(?:S\s*\/?\s*N|SERIAL|SHIPMENT\s+NO|WARRANTY|REF\.?\s*NO|DATE|P\/?O|SALESMAN|TERMS)\b/i.test(line)&&!/^[-–—]?\s*\d[\d,]*[.]\d{2}\s*$/.test(line)){
      if(!/^(?:PRODUCT|DESCRIPTION|QUANTITY|QTY|UNIT\s+PRICE|AMOUNT)\b/i.test(line))current.description=cleanInventoryDescription((current.description+' '+line).trim());
    }
  }
  return out;
}

function v661ParseGenericPricedRows(text=''){
  const lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),out=[];
  const n=v=>{let z=String(v||'').replace(/(?:SGD|S\$|\$)/gi,'').replace(/\s/g,'').replace(/,(?=\d{3}(?:\.\d{2})?$)/g,'').replace(/,(?=\d{2}$)/,'.').replace(/[^0-9.-]/g,'');const q=Number(z);return Number.isFinite(q)?q:null;};
  const money='(?:S?\\$?\\s*\\d[\\d,]*(?:[.]\\d{2}))';
  const re=new RegExp('^([A-Z0-9][A-Z0-9+._\\/-]{2,}(?:\\s+[A-Z0-9]{1,8}){0,2})\\s+(.+?)\\s+(\\d+(?:[.]\\d+)?)\\s+('+money+')\\s+('+money+')$','i');
  for(const line of lines){const m=line.match(re);if(!m)continue;const qty=n(m[3]),price=n(m[4]),amount=n(m[5]);if(!(qty>0)||price===null||amount===null)continue;const desc=cleanInventoryDescription(m[2]);if(!desc||/^(?:subtotal|gst|total|amount due)/i.test(desc))continue;out.push(normalizeParsedInvoiceItem({sku:cleanVerifiedSku(m[1],text),item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:''}));}
  return out;
}
function v661EvidenceSources(raw=''){
  const arr=[{source:'chosen',text:String(raw||''),layout:state.pdfLayout||[]}];
  for(const c of state.ocrCandidates||[])arr.push({source:c.source||'ocr',text:String(c.text||''),layout:c.layout||[]});
  const seen=new Set();return arr.filter(x=>{const k=x.text.replace(/\s+/g,' ').slice(0,2500);if(!k||seen.has(k))return false;seen.add(k);return true;});
}

function v668CompactIdentifier(value=''){
  return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}
function v668ModelIdentifierKeys(items=[]){
  const keys=new Set(),add=v=>{const k=v668CompactIdentifier(v);if(k.length>=3)keys.add(k);};
  for(const line of items||[]){
    add(line?.sku||'');
    const name=String(line?.item_name||'');
    const tokens=name.match(/\b[A-Z0-9][A-Z0-9+._\/-]{2,}\b/gi)||[];
    for(const token of tokens)if(/[A-Za-z]/.test(token)&&/\d/.test(token))add(token);
  }
  return keys;
}
function v668ExplicitSerialEvidence(sourceText='',modelKeys=new Set()){
  const evidence=new Set(),lines=normalizePdfText(sourceText).split('\n').map(x=>x.trim()).filter(Boolean);
  const label=/\b(?:S\s*\/?\s*N|S\.?N\.?|Serial\s*(?:No\.?|Number(?:s)?))\s*[:#.-]?\s*(.*)$/i;
  for(const line of lines){
    const m=line.match(label);if(!m)continue;
    const candidates=String(m[1]||'').match(/\b[A-Z0-9][A-Z0-9._\/-]{4,31}\b/gi)||[];
    for(const token of candidates){const k=v668CompactIdentifier(token);if(k&&!modelKeys.has(k)&&/\d/.test(token))evidence.add(k);}
  }
  return evidence;
}
function v668SanitizeSerialAssignments(items=[],sourceText=''){
  const out=(items||[]).map(x=>({...x})),modelKeys=v668ModelIdentifierKeys(out),evidence=v668ExplicitSerialEvidence(sourceText,modelKeys);
  for(const line of out){
    const original=parseSerials(line.serials||''),kept=[];let removedModel=false;
    for(const raw of original){
      const token=String(raw||'').trim(),key=v668CompactIdentifier(token);if(!key)continue;
      if(modelKeys.has(key)){removedModel=true;continue;}
      if(/^(?:SKU|MODEL|ITEM|PRODUCT)$/i.test(token))continue;
      if(!kept.some(x=>v668CompactIdentifier(x)===key))kept.push(token);
    }
    line.serials=kept.join(', ');
    if(kept.length&&kept.every(x=>evidence.has(v668CompactIdentifier(x))))line.serialReviewRequired=false;
    else if(!kept.length&&removedModel)line.serialReviewRequired=false;
  }
  return out;
}


function v677VerifyQuantities(items=[]){
  return (items||[]).map(x=>{
    const line={...x},q=Number(line.quantity),p=Number(line.unit_price),a=Number(line.amount);
    let verified=false;
    if(Number.isInteger(q)&&q>0&&Number.isFinite(p)&&p>=0&&Number.isFinite(a)&&a>=0){
      verified=Math.abs(q*p-a)<=Math.max(.06,Math.abs(a)*.005);
    }
    if(!verified&&Number.isFinite(p)&&p>0&&Number.isFinite(a)&&a>=0){
      const derived=a/p,rounded=Math.round(derived);
      if(rounded>0&&Math.abs(derived-rounded)<=.01){line.quantity=rounded;verified=true;}
    }
    line.quantityReviewRequired=!verified;
    return line;
  });
}
function v677ReassignSerialsByEvidence(items=[],sourceText=''){
  const out=(items||[]).map(x=>({...x,serials:''}));
  const lines=normalizePdfText(sourceText).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const serialRe=/\b(?:S\s*\/?\s*N|S\.?N\.?|Serial\s*(?:No\.?|Number(?:s)?))\s*[:#.-]?\s*(.*)$/i;
  const serialEvents=[];
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(serialRe);if(!m)continue;
    const vals=(String(m[1]||'').match(/\b[A-Z0-9][A-Z0-9._\/-]{4,31}\b/gi)||[]).filter(v=>/\d/.test(v));
    if(vals.length)serialEvents.push({i,vals:[...new Set(vals)]});
  }
  const occurrences=out.map((item,idx)=>{
    const keys=[item.sku,...(String(item.item_name||'').match(/\b[A-Z0-9][A-Z0-9+._\/-]{2,}\b/gi)||[])].map(v=>v668CompactIdentifier(v)).filter(k=>k.length>=3);
    const pos=[];for(let i=0;i<lines.length;i++){const compact=v668CompactIdentifier(lines[i]);if(keys.some(k=>compact.includes(k)))pos.push(i);}
    return {idx,pos};
  });
  const owners=new Map();
  for(const ev of serialEvents){
    let best=null;
    for(const oc of occurrences)for(const pos of oc.pos){const d=Math.abs(ev.i-pos),after=ev.i>=pos?0:3,score=d+after;if(d<=8&&(!best||score<best.score))best={idx:oc.idx,score};}
    for(const sn of ev.vals){const key=v668CompactIdentifier(sn);if(!key)continue;if(!best){owners.set(key,{conflict:true});continue;}const prev=owners.get(key);if(prev&&prev.idx!==best.idx)owners.set(key,{conflict:true});else owners.set(key,{idx:best.idx,sn});}
  }
  for(const [key,owner] of owners){if(owner.conflict||owner.idx==null)continue;const item=out[owner.idx],arr=parseSerials(item.serials||'');if(!arr.some(v=>v668CompactIdentifier(v)===key))arr.push(owner.sn);item.serials=arr.join(', ');}
  for(const item of out)item.serialConflictReviewRequired=false;
  for(const owner of owners.values())if(owner.conflict)for(const item of out)item.serialConflictReviewRequired=true;
  return out;
}
function v677ValidateInvoiceLines(items=[],sourceText=''){
  let out=v677ReassignSerialsByEvidence(items,sourceText);
  out=v677VerifyQuantities(out);
  return out.filter(x=>!isNonInventoryServiceLine(x)&&!/(?:^|\b)repair(?:s|ed|ing)?\b/i.test(normalizePdfText([x.sku,x.item_name,x.description].join(' '))));
}


function v676IsForbiddenAutoSku(value=''){
  return /^AUTO(?:[-_]|$)/i.test(String(value||'').trim());
}
function v676ModelCandidatesFromText(value='',sourceText=''){
  const text=normalizePdfText(value).replace(/\s+/g,' ').trim();
  const sourceCompact=String(sourceText||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
  const stop=/^(?:SGD|GST|QTY|UNIT|UNITS|PRICE|AMOUNT|TOTAL|SUBTOTAL|INVOICE|SERIAL|WARRANTY|MONTH|MONTHS|YEAR|YEARS|HUAWEI|IDEAHUB|KEY|CARE|BASIC)$/i;
  const seen=new Set(),out=[];
  for(const raw of text.match(/\b[A-Z0-9][A-Z0-9+._\/-]{2,12}\b/gi)||[]){
    const token=String(raw||'').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
    const compact=token.toLowerCase().replace(/[^a-z0-9]+/g,'');
    if(!compact||seen.has(compact)||stop.test(token))continue;
    if(v676IsForbiddenAutoSku(token))continue;
    if(!/[A-Za-z]/.test(token)||!/\d/.test(token))continue;
    if(/^\d+(?:[._/-]\d+)+$/.test(token))continue;
    if(/^\d+(?:[-_.]?(?:inches?|inch|in|cm|mm|hz|khz|mhz|ghz|months?|mos?|years?|yrs?))$/i.test(token))continue;
    if(/^(?:19|20)\d{2}$/.test(token))continue;
    if(sourceCompact&&!sourceCompact.includes(compact))continue;
    seen.add(compact);out.push(token);
  }
  return out;
}
function v676EmbeddedVerifiedSku(line={},sourceText=''){
  const text=[line.sku,line.item_name,line.description].filter(Boolean).join(' ');
  const candidates=v676ModelCandidatesFromText(text,sourceText);
  if(!candidates.length)return '';
  // Prefer a compact model/code with punctuation (e.g. IHK3-86SA, PT-VW540) over generic mixed tokens.
  const ranked=candidates.map(token=>({token,score:(/[-_/+.]/.test(token)?4:0)+(token.length<=10?2:0)+(/\d/.test(token)&&/[A-Za-z]/.test(token)?2:0)})).sort((a,b)=>b.score-a.score||a.token.length-b.token.length);
  const top=ranked[0];if(!top)return '';
  // If two unrelated candidates have the same confidence, do not guess.
  if(ranked[1]&&ranked[1].score===top.score&&ranked[1].token.toLowerCase()!==top.token.toLowerCase())return '';
  return top.token;
}
function v676SafeFallbackSku(itemName='',existingItems=[],usedSkus=new Map()){
  const clean=v667ShortItemName(itemName).replace(/\s+/g,' ').trim();
  if(!clean)return '';
  const candidate=clean.slice(0,13).trim();
  if(!candidate||v676IsForbiddenAutoSku(candidate))return '';
  if(!/[A-Za-z0-9]/.test(candidate))return '';
  const key=norm(candidate),nameKey=norm(clean);
  const conflict=(existingItems||[]).find(i=>norm(i.sku)===key&&norm(i.item_name)!==nameKey&&!v676IsForbiddenAutoSku(i.sku));
  if(conflict)return '';
  if(usedSkus instanceof Map){const prior=usedSkus.get(key);if(prior&&prior!==nameKey)return '';usedSkus.set(key,nameKey);}
  else {if(usedSkus.has(key))return '';usedSkus.add(key);}
  return candidate;
}
function v676IsSupportCoverageLine(line={}){
  const text=normalizePdfText([line.sku,line.item_name,line.description].filter(Boolean).join(' ')).replace(/\s+/g,' ').trim();
  if(!text)return false;
  return /\b(?:hi[- ]?care|care\s*pack|support\s*(?:plan|service|coverage)?|maintenance\s*(?:plan|service|contract)?|service\s*contract|extended\s+warranty|warranty\s*(?:extension|coverage|service)?|subscription|software\s+assurance|\d+\s*months?\s*(?:support|warranty|care))\b/i.test(text)
    || /\b(?:basic|premium|standard)\s+.*\b\d{1,3}\s*months?\b/i.test(text);
}
function v676CanonicalItemName(line={}){
  let s=v667ShortItemName(line.item_name||line.description||'');
  if(/\bHUAWEI\s+IdeaHub\s+K3\b/i.test(s))return 'HUAWEI IdeaHub K3';
  if(/\bIdeaShare\s+Key\b/i.test(s))return 'IdeaShare Key';
  return s;
}
function v676ValidateAndRectifyItems(items=[],sourceText=''){
  const existingItems=state?.data?.items||[],used=new Map(),out=[];
  for(const original of items||[]){
    let line={...original};
    if(isNonInventoryServiceLine(line)||isExcludedInventoryAccessoryLine(line)||v676IsSupportCoverageLine(line))continue;
    const description=cleanInventoryDescription(line.description||line.item_name||'');
    const itemName=v676CanonicalItemName({...line,description});
    if(!v667PlausibleItemName(itemName))continue;
    let sku=v676IsForbiddenAutoSku(line.sku)?'':cleanVerifiedSku(line.sku||'',sourceText);
    if(!sku){const matched=v679MatchExistingSku({...line,item_name:itemName,description},sourceText);if(matched.sku){sku=matched.sku;line.skuMatchMethod=matched.method;}}
    if(!sku)sku=v676EmbeddedVerifiedSku({...line,item_name:itemName,description},sourceText);
    if(sku)used.set(norm(sku),norm(itemName));
    const category=String(line.category||'').trim()||v667InferCategory({...line,sku,item_name:itemName,description});
    line={...line,sku:String(sku||'').trim().slice(0,13),item_name:itemName,description,category,skuReviewRequired:!sku};
    if(v676IsForbiddenAutoSku(line.sku))line.sku='';
    out.push(line);
  }
  return sanitizeSerialAssignments(out,sourceText);
}
async function v676RepairLegacyAutoSkuMatches(db,lines=[]){
  const items=state?.data?.items||[];
  for(const line of lines||[]){
    const newSku=String(line.sku||'').trim();if(!newSku||v676IsForbiddenAutoSku(newSku))continue;
    const skuKey=norm(newSku),nameKey=norm(line.item_name||'');
    if(items.some(i=>!v676IsForbiddenAutoSku(i.sku)&&norm(i.sku)===skuKey))continue;
    const legacy=items.find(i=>v676IsForbiddenAutoSku(i.sku)&&(norm(i.item_name)===nameKey||norm(i.item_name).includes(skuKey)||norm(i.description).includes(skuKey)));
    if(!legacy)continue;
    try{
      await db.updateItem(legacy.id,{sku:newSku,description:line.description||legacy.description||'',category:line.category||legacy.category||''});
      legacy.sku=newSku;if(line.description)legacy.description=line.description;if(line.category)legacy.category=line.category;
    }catch(err){console.warn('Legacy AUTO SKU repair skipped:',err);}
  }
}

function v661SanitizeParsedInventoryItems(items=[],sourceText=''){
  // V6.76 self-rectification: reject AUTO-* and repair using printed model evidence first,
  // then the user-approved deterministic 13-character item-name fallback only when collision-free.
  return v676ValidateAndRectifyItems(items,sourceText);
}
const sanitizeSerialAssignments=v668SanitizeSerialAssignments;

function v661PrepareInventoryLinesForSave(items=[]){
  const source=state.parsed?.raw||state.parsed?.rawText||'';
  const lines=v676ValidateAndRectifyItems(items,source).filter(line=>!isExcludedInventoryAccessoryLine(line)&&!v676IsSupportCoverageLine(line));
  const unresolved=lines.find(line=>!String(line.sku||'').trim()||v676IsForbiddenAutoSku(line.sku));
  if(unresolved)throw new Error('SKU/model could not be verified safely for "'+String(unresolved.item_name||'this item')+'". Review the item and enter a verified SKU/model before saving.');
  return lines.map(line=>({...line,sku:String(line.sku||'').trim().slice(0,13),item_name:String(line.item_name||line.description||'').replace(/\s+/g,' ').trim(),description:cleanInventoryDescription(line.description||line.item_name||'')}));
}

function v661RecoverAvMediaHeader(doc={},rawText=''){
  const sources=v661EvidenceSources(rawText),all=sources.map(x=>x.text).join('\n'),isAv=/\bAV\s+MEDIA\b/i.test(all)||/av\s+media/i.test(String(doc.supplier_name||''));
  if(isAv)doc.supplier_name='AV Media Pte Ltd';
  const cleanInv=v=>String(v||'').replace(/\s+/g,'').replace(/[–—]/g,'-').replace(/^YIN/i,'VIN').replace(/^Y1N/i,'VIN').replace(/^V1N/i,'VIN').replace(/^YlN/i,'VIN').replace(/^VINI(?=\d)/i,'VIN1').replace(/^VINl(?=\d)/i,'VIN1');
  const bad=/^(?:CUSTOMER|CODE|DATE|TERMS|SOLD|DELIVERED|REFERENCE|REF|INVOICE|NO)$/i;
  let invoice='';
  for(const src of sources){
    const text=normalizePdfText(src.text||'');
    const labelled=[
      /(?:invoice|invo[i1l]ce|tnvo[i1l]ce)\s*(?:no\.?|number|#)\s*[:#.-]?\s*([A-Z0-9][A-Z0-9._\/-]{3,})/ig,
      /\b(?:INV|VIN|YIN|V1N|Y1N)\s*[- ]?\s*\d{2,}[-/]?\d{3,}\b/ig
    ];
    for(const re of labelled){const ms=[...text.matchAll(re)];for(const m of ms){const c=cleanInv(m[1]||m[0]);if(c&&!bad.test(c)&&!parseDate(c)){invoice=c;break;}}if(invoice)break;}
    if(invoice)break;
  }
  if(invoice){if(isAv&&/^(?:YIN|V1N|Y1N|VIN)/i.test(invoice))invoice=cleanInv(invoice);doc.invoice_number=invoice;}
  // Date: labelled Invoice Date wins; then the DATE column in an invoice-header row; never footer timestamps.
  let date='';
  for(const src of sources){
    const text=normalizePdfText(src.text||'');
    let m=text.match(/\b(?:invoice\s*)?date\s*[:#.-]?\s*([0-3]?\d\s*[/.-]\s*[01]?\d\s*[/.-]\s*\d{2,4})/i);if(m){date=parseDate(m[1]);if(date)break;}
    const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
    for(let i=0;i<lines.length;i++){
      if(!/\bDATE\b/i.test(lines[i])||/\b(?:DUE|DELIVERY|PAYMENT|WARRANTY)\b/i.test(lines[i]))continue;
      const ctx=[lines[i-1]||'',lines[i],lines[i+1]||'',lines[i+2]||''].join(' ');
      if(!/\b(?:REF\.?\s*NO|P\/?O|SALESMAN|TERMS|INVOICE\s*(?:NO|NUMBER)|CUSTOMER\s*CODE)\b/i.test(ctx))continue;
      const dm=ctx.match(/(?:^|[^A-Za-z0-9])([0-3]?\d\s*[/.-]\s*[01]?\d\s*[/.-]\s*\d{2,4})(?![A-Za-z0-9])/);if(dm){date=parseDate(dm[1]);if(date)break;}
    }
    if(date)break;
    const saved=state.pdfLayout;state.pdfLayout=src.layout||[];date=detectInvoiceDateFromLayout();state.pdfLayout=saved;if(date)break;
  }
  if(date)doc.invoice_date=date;else if(isAv)doc.invoice_date='';
  if(/^(?:sold|sold\s*to|delivered|delivered\s*to|customer|customer\s*code|reference|ref|date|invoice)$/i.test(String(doc.delivery_order_number||'').trim()))doc.delivery_order_number='';
  if(/^(?:sold|sold\s*to|delivered|delivered\s*to|customer|customer\s*code|date|invoice|terms)$/i.test(String(doc.reference_number||'').trim()))doc.reference_number='';
  return doc;
}

function v661ClassifyInvoiceDocument(text='',extractedItems=[],inventoryItems=[]){
  const evidence=v661EvidenceSources(text).map(x=>x.text).join('\n'),t=normalizePdfText(evidence).replace(/\s+/g,' ').trim();
  let rawRows=[];for(const src of v661EvidenceSources(text)){rawRows.push(...parseAvMediaTextItems(src.text),...v661ParseGenericPricedRows(src.text),...v662ParsePhysicalEvidenceRows(src.text));}
  rawRows=[...(extractedItems||[]),...rawRows];
  const accessoryRows=rawRows.filter(isExcludedInventoryAccessoryLine);
  let rows=sanitizeParsedInventoryItems(rawRows,evidence);
  const physical=[...(inventoryItems||[]),...rows.filter(x=>!isNonInventoryServiceLine(x)&&!isExcludedInventoryAccessoryLine(x))].filter((x,i,a)=>a.findIndex(y=>norm(y.sku||y.item_name)===norm(x.sku||x.item_name)&&Number(y.amount)===Number(x.amount))===i);
  const service=rows.filter(isNonInventoryServiceLine);
  if(physical.length)return{type:'equipment',equipmentScore:10+physical.length*2,serviceScore:service.length?3:0,reason:'Verified priced tracked-equipment rows were found; service and excluded accessory rows are not added to inventory.'};
  if(rows.length&&service.length===rows.length)return{type:'service',equipmentScore:0,serviceScore:10+service.length*2,reason:'Every verified priced row is labour/service/installation work.'};
  const productHeader=/\b(?:PRODUCT|STOCK)\s*(?:NO\.?|NUMBER|CODE)?\b/i.test(t)&&/\bDESCRIPTION\b/i.test(t)&&/\b(?:QTY|QUANTITY)\b/i.test(t)&&/\b(?:UNIT\s*)?PRICE\b/i.test(t)&&/\bAMOUNT\b/i.test(t);
  const physicalWords=/\b(?:projector|microphone|speaker|control\s+panel|camera|mixer|display|monitor|transmitter|receiver|screen|wireless\s+system|audio\s+tester|amplifier|processor|switcher|rack|visualizer|document\s+camera)\b/i.test(t);
  const rowShape=(evidence.match(/^[A-Z0-9][A-Z0-9+._\/-]{2,}[^\n]*\s\d+(?:\.\d+)?\s+(?:S?\$?\s*)?\d[\d,]*\.\d{2}\s+(?:S?\$?\s*)?\d[\d,]*\.\d{2}\s*$/gmi)||[]).length;
  const serviceStrong=/\b(?:supply\s+)?labou?r\b/i.test(t)||/\b(?:supply\s+to\s+)?replace\b[\s\S]{0,120}\b(?:projector|microphone|speaker|display|screen|equipment)\b/i.test(t)||/\b(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al))\b[\s\S]{0,180}\b(?:install|replace|test|commission)/i.test(t)||/\b(?:service|installation|labou?r)\s+(?:work|works|job|charge|charges|services?)\b/i.test(t);
  const codePhysical=evidence.split(/\n+/).some(line=>/^[|.,;:\-]*\s*[A-Z0-9][A-Z0-9+._\/-]{2,}\s+/.test(line.trim())&&/\b(?:projector|microphone|speaker|control\s+panel|camera|mixer|display|monitor|transmitter|receiver|screen|audio\s+tester|amplifier|processor|switcher|rack|visualizer|document\s+camera)\b/i.test(line)&&!isExcludedInventoryAccessoryLine({item_name:line,description:line})&&/\b\d{1,4}\b/.test(line));
  let equipmentScore=(productHeader?4:0)+(physicalWords?2:0)+(rowShape>=2?5:rowShape===1?2:0)+(codePhysical?6:0),serviceScore=serviceStrong?6:0;
  if(serviceStrong&&!codePhysical&&rowShape<=1)serviceScore+=4;
  if((equipmentScore>=7&&equipmentScore>=serviceScore+2)||(productHeader&&physicalWords&&equipmentScore>=6))return{type:'equipment',equipmentScore,serviceScore,reason:'Independent scans found an invoice product table with tracked-equipment evidence; excluded accessory/service wording is filtered only at line-item level.'};
  if(serviceScore>=8&&!codePhysical&&rowShape<=1)return{type:'service',equipmentScore,serviceScore,reason:'Independent scans found service/labour/installation work and no verified priced tracked-equipment row.'};
  const accessoryEvidence=accessoryRows.length||evidence.split(/\n+/).some(line=>isExcludedInventoryAccessoryLine({item_name:line,description:line}));
  if(accessoryEvidence&&!codePhysical)return{type:'uncertain',equipmentScore,serviceScore,reason:'Excluded accessory/support wording was found, but accessory terms are line-item filters only and cannot reject the invoice. Confirm the invoice type if tracked equipment cannot be verified automatically.'};
  return{type:'uncertain',equipmentScore,serviceScore,reason:'Native text, layout and OCR evidence still conflict or are insufficient.'};
}

function v662MoneyNumber(v=''){const z=String(v||'').replace(/(?:SGD|S\$|\$)/gi,'').replace(/\s/g,'').replace(/,(?=\d{3}(?:\.\d{2})?$)/g,'').replace(/,(?=\d{2}$)/,'.').replace(/[^0-9.-]/g,'');const n=Number(z);return Number.isFinite(n)?n:null;}
function v662RecoverMoneyFromText(doc={},text=''){
  const lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const pick=(re)=>{for(const l of lines){if(!re.test(l))continue;const vals=[...l.matchAll(/(?:SGD\s*|S?\$\s*)?(\d[\d,]*[.]\d{2})/gi)].map(m=>v662MoneyNumber(m[1])).filter(Number.isFinite);if(vals.length)return vals[vals.length-1];}return null;};
  const s=pick(/\b(?:SUB\s*TOTAL|SUBTOTAL)\b/i),g=pick(/\bGST(?:\s*\d+(?:\.\d+)?\s*%)?\b/i),t=pick(/\b(?:AMOUNT\s+DUE|GRAND\s+TOTAL|INVOICE\s+TOTAL|TOTAL\s+AMOUNT)\b/i);
  if(s!==null)doc.subtotal=s;if(g!==null)doc.gst=g;if(t!==null)doc.total_amount=t;
  let a=Number(doc.subtotal),b=Number(doc.gst),c=Number(doc.total_amount);
  if(Number.isFinite(c)&&Number.isFinite(b)&&(!Number.isFinite(a)||Math.abs((a+b)-c)>.06)){const x=Math.round((c-b)*100)/100;if(x>=0)doc.subtotal=x;}
  a=Number(doc.subtotal);b=Number(doc.gst);c=Number(doc.total_amount);
  if(Number.isFinite(a)&&Number.isFinite(b)&&(!Number.isFinite(c)||Math.abs((a+b)-c)>.06))doc.total_amount=Math.round((a+b)*100)/100;
  return doc;
}
async function v662FileSha256(file){try{const buf=await file.arrayBuffer(),dig=await crypto.subtle.digest('SHA-256',buf);return [...new Uint8Array(dig)].map(b=>b.toString(16).padStart(2,'0')).join('');}catch(_){return '';}}
function v662FileKind(file){const n=String(file?.name||'').toLowerCase(),t=String(file?.type||'').toLowerCase();if(t==='application/pdf'||n.endsWith('.pdf'))return'pdf';if(t.startsWith('image/')||/\.(?:png|jpe?g|webp|bmp|tiff?)$/.test(n))return'image';if(t.includes('wordprocessingml')||n.endsWith('.docx'))return'docx';return'unsupported';}
async function v662EnsureJSZip(){if(window.JSZip)return window.JSZip;await new Promise((res,rej)=>{const old=document.querySelector('script[data-v662-jszip]');if(old){old.addEventListener('load',res,{once:true});old.addEventListener('error',rej,{once:true});return;}const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';sc.async=true;sc.dataset.v662Jszip='1';sc.onload=res;sc.onerror=()=>rej(new Error('DOCX reader could not be loaded.'));document.head.appendChild(sc);});return window.JSZip;}
async function v662OcrBlob(blob,source='image-ocr'){
  const T=await v661EnsureTesseract(),worker=await T.createWorker('eng');
  try{await worker.setParameters({tessedit_pageseg_mode:T.PSM?.AUTO??'3',preserve_interword_spaces:'1',user_defined_dpi:'220'});const r=await worker.recognize(blob,{}, {text:true,tsv:true,hocr:true,blocks:true});const layout=ocrResultToLayout(r.data||{},1,0),text=String(r.data?.text||'').trim()||layout.rows?.map(x=>x.text).join('\n').trim();if(text)state.ocrCandidates=[...(state.ocrCandidates||[]),{source,text,layout:[layout],score:ocrTextQuality(text)+layoutInvoiceQuality(layout)}];if(layout?.rows?.length)state.pdfLayout=[layout];return text;}finally{await worker.terminate();}
}
async function v662ExtractDocx(file){
  const JSZip=await v662EnsureJSZip(),zip=await JSZip.loadAsync(await file.arrayBuffer()),xml=await zip.file('word/document.xml')?.async('text');if(!xml)throw new Error('DOCX document.xml was not found.');
  const doc=new DOMParser().parseFromString(xml,'application/xml'),paras=[...doc.getElementsByTagNameNS('*','p')].map(p=>[...p.getElementsByTagNameNS('*','t')].map(t=>t.textContent||'').join(' ').trim()).filter(Boolean),texts=[paras.join('\n')];
  if(texts[0].length<700||!/(?:invoice|tax invoice)/i.test(texts[0])){const media=Object.keys(zip.files).filter(n=>/^word\/media\//i.test(n)).slice(0,8);for(const name of media){const b=await zip.file(name).async('blob');try{const t=await v662OcrBlob(b,'docx-image:'+name);if(t)texts.push(t);}catch(e){console.warn('Embedded DOCX image OCR skipped',name,e);}}}
  return texts.filter(Boolean).join('\n');
}
async function v662TryServerInvoiceProcessing(file){
  const url=String(CFG.invoiceParserUrl||'').trim();if(!url)return null;
  try{const fd=new FormData();fd.append('file',file,file.name);fd.append('parser_version','6.68');const headers={};if(state.session?.access_token)headers.Authorization='Bearer '+state.session.access_token;const r=await fetch(url,{method:'POST',headers,body:fd});if(!r.ok)throw new Error('Server parser '+r.status);const j=await r.json();if(j?.file_sha256)state.importFileHash=j.file_sha256;if(j?.text){state.ocrCandidates=[...(state.ocrCandidates||[]),{source:'server',text:String(j.text),layout:j.layout||[],score:999}];if(j.layout?.length)state.pdfLayout=j.layout;state.serverParseResult=j;return String(j.text);}return null;}catch(e){console.warn('Server parser unavailable; using local extraction.',e);return null;}
}
async function v662ExtractInvoiceFile(file){
  const kind=v662FileKind(file);if(kind==='unsupported')throw new Error('Unsupported invoice format. Use PDF, JPG/JPEG, PNG, WEBP or DOCX.');
  state.importFileKind=kind;state.importFileHash=await v662FileSha256(file);state.serverParseResult=null;
  const serverText=await v662TryServerInvoiceProcessing(file);
  if(kind==='pdf'){const local=await extractPdf(file);return [local,serverText].filter(Boolean).join('\n');}
  if(kind==='image'){const local=await v662OcrBlob(file,'image-primary');return [local,serverText].filter(Boolean).join('\n');}
  if(kind==='docx'){const local=await v662ExtractDocx(file);return [local,serverText].filter(Boolean).join('\n');}
  return serverText||'';
}
function v662ParsePhysicalEvidenceRows(text=''){
  const out=[],lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const physical=/\b(?:projector|microphone|speaker|control\s+panel|camera|mixer|display|monitor|trolley|transmitter|receiver|screen|audio\s+tester|amplifier|processor|switcher|rack|stand|mount)\b/i;
  const service=/\b(?:labou?r|dismount|dismantl|replace|installation|installing|commission|testing|service\s+work)\b/i;
  for(const line of lines){if(!physical.test(line)||service.test(line))continue;const m=line.match(/^[|.,;:\-]*\s*([A-Z0-9][A-Z0-9+._\/-]{2,})\s+(.+?)\s+(\d{1,4})(?:\s+.*)?$/i);if(!m)continue;const sku=cleanVerifiedSku(m[1],text),desc=cleanInventoryDescription(m[2]);if(!sku||!desc)continue;const vals=[...line.matchAll(/(?:S?[$#]?\s*)?(\d[\d,]*[ .]\d{2})/g)].map(x=>v662MoneyNumber(x[1].replace(/ (\d{2})$/,'.$1'))).filter(Number.isFinite);out.push(normalizeParsedInvoiceItem({sku,item_name:desc,description:desc,category:'',unit:'pcs',quantity:Number(m[3]),unit_price:vals.length>=2?vals[vals.length-2]:null,amount:vals.length?vals[vals.length-1]:null,warranty:'',serials:''}));}
  return out;
}
function v662ParseAuditPayload(){const d=state.parsed?.doc||{},c=state.parsed?.invoiceClassification||{};return{parser_version:'6.79',file_sha256:state.importFileHash||'',file_kind:state.importFileKind||'',classification:c.type||'uncertain',classification_reason:c.reason||'',supplier:d.supplier_name||'',invoice_number:d.invoice_number||'',invoice_date:d.invoice_date||'',line_item_count:(state.parsed?.items||[]).length,excluded_service_count:Number(state.parsed?.excludedServiceCount||0),ocr_sources:(state.ocrCandidates||[]).map(x=>x.source).filter(Boolean),created_at:new Date().toISOString()};}
function v662InstallAuditWrappers(){
  if(typeof LocalDB!=='undefined'&&!LocalDB.prototype.__v662Import){const orig=LocalDB.prototype.importPurchase;LocalDB.prototype.importPurchase=async function(doc,purchase,lines,file){const safeLines=prepareInventoryLinesForSave(lines);await v676RepairLegacyAutoSkuMatches(this,safeLines);const audit=v662ParseAuditPayload(),r=await orig.call(this,{...doc,file_sha256:audit.file_sha256,parser_version:'6.79',parse_audit:audit},purchase,safeLines,file);return r;};LocalDB.prototype.__v662Import=true;}
  if(typeof SupabaseDB!=='undefined'&&!SupabaseDB.prototype.__v662Import){const orig=SupabaseDB.prototype.importPurchase;SupabaseDB.prototype.importPurchase=async function(doc,purchase,lines,file){const safeLines=prepareInventoryLinesForSave(lines);await v676RepairLegacyAutoSkuMatches(this,safeLines);const r=await orig.call(this,doc,purchase,safeLines,file);try{const audit=v662ParseAuditPayload();if(r?.document_id){const u=await this.sb.from('documents').update({file_sha256:audit.file_sha256,parser_version:'6.79',parse_audit:audit}).eq('id',r.document_id);if(u.error&&!/column|schema cache/i.test(String(u.error.message||'')))console.warn('Parse audit update failed',u.error);}}catch(e){console.warn('Parse audit metadata could not be stored.',e);}return r;};SupabaseDB.prototype.__v662Import=true;}
}
function v662ConfigureInvoiceFileInputs(){setTimeout(()=>{document.querySelectorAll('input[type="file"]').forEach(el=>{el.accept='.pdf,.png,.jpg,.jpeg,.webp,.docx,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document';});},0);}
function v661EffectiveInvoiceType(){
  const detected=state.parsed?.invoiceClassification?.type||'uncertain';
  return detected==='uncertain'?(state.importClassificationChoice||'uncertain'):detected;
}
function v661ApplyParsedReviewToForm(){
  const d=state.parsed?.doc||{};
  if($('pSupplier'))$('pSupplier').value=d.supplier_name||'';if($('pInvoice'))$('pInvoice').value=d.invoice_number||'';if($('pDate'))$('pDate').value=d.invoice_date||'';
  ['pSupplier','pInvoice','pDate'].forEach(id=>$(id)?.classList.toggle('low-confidence',!$(id)?.value));
  if($('invoiceDateStatus')){const x=$('invoiceDateStatus');x.textContent=d.invoice_date?'Auto-detected from invoice: '+fmtDate(d.invoice_date)+' — verify against the PDF before saving.':'Invoice date was not confidently detected — please enter it manually.';x.className='date-status '+(d.invoice_date?'detected':'review');}
  if($('pDo'))$('pDo').value=d.delivery_order_number||'';if($('pRef'))$('pRef').value=d.reference_number||'';if($('pCurrency'))$('pCurrency').value=d.currency||'SGD';
  if($('pSubtotal'))$('pSubtotal').value=d.subtotal??'';if($('pGst'))$('pGst').value=d.gst??'';if($('pTotal'))$('pTotal').value=d.total_amount??'';
  if($('rawText'))$('rawText').textContent=state.parsed?.raw||state.parsed?.rawText||'';
  renderParsedItems();
}
async function v661RefreshDuplicateWarning(){
  const d=state.parsed?.doc||{};if(!$('duplicateWarning'))return;
  const dupe=d.supplier_name&&d.invoice_number?await state.db.duplicateInvoice(d.supplier_name,d.invoice_number,d.invoice_date):null;state.possibleDuplicate=dupe;state.allowDuplicate=false;
  $('duplicateWarning').classList.toggle('hidden',!dupe);$('duplicateWarning').innerHTML=dupe?`<strong>This invoice may already exist.</strong> Supplier, Invoice Number and Invoice Date match an existing purchase. <button type="button" id="viewDuplicateBtn">View existing</button> <button type="button" id="continueDuplicateBtn">Continue anyway</button>`:'';
  if(dupe){setTimeout(()=>{const v=$('viewDuplicateBtn'),c=$('continueDuplicateBtn');if(v)v.onclick=()=>showView('documents');if(c)c.onclick=()=>{state.allowDuplicate=true;$('duplicateWarning').innerHTML='<strong>Duplicate override enabled.</strong> Confirm & save will continue.';}},0);}
}


// V6.79 universal invoice intelligence: coordinate-first table extraction.
// Supplier-specific parsers remain optional recovery helpers; this parser is deliberately supplier-neutral.
function v679StrictLayoutItems(){
  const pages=state.pdfLayout||[],out=[];
  const txt=v=>String(v??'').replace(/\s+/g,' ').trim();
  const clean=v=>txt(v).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
  const strictNum=v=>{const z=txt(v).replace(/[$SGD£€¥]/gi,'').replace(/,/g,'');if(!/^-?\d+(?:\.\d{1,2})?$/.test(z))return null;const n=Number(z);return Number.isFinite(n)?n:null;};
  const center=it=>(Number(it.x)||0)+(Number(it.width)||0)/2;
  const findHeader=(rows)=>{
    for(let i=0;i<rows.length;i++){
      const band=rows.filter(r=>Math.abs((Number(r.y)||0)-(Number(rows[i].y)||0))<=18);
      const its=band.flatMap(r=>r.items||[]);
      const hit=re=>its.find(it=>re.test(clean(it.text)));
      const code=hit(/^(?:product(?:no)?|product|sku|model|item(?:no)?)$/i)||its.find(it=>/product/i.test(clean(it.text)));
      const desc=hit(/^description$/i),qty=hit(/^(?:qty|quantity|units?)$/i),price=hit(/^(?:unitprice|price)$/i)||its.find(it=>/price/i.test(clean(it.text))),amount=hit(/^amount$/i);
      if(code&&desc&&qty&&price&&amount){const xs=[code,desc,qty,price,amount].map(x=>Number(x.x));if(xs.every(Number.isFinite)&&xs.every((x,j)=>j===0||x>xs[j-1]))return{y:Math.max(...band.map(r=>Number(r.y)||0)),xs};}
    }return null;
  };
  for(const pg of pages){
    const rows=(pg.rows||[]).filter(r=>Array.isArray(r.items)&&r.items.length).sort((a,b)=>(Number(b.y)||0)-(Number(a.y)||0));
    const h=findHeader(rows);if(!h)continue;const [x0,x1,x2,x3,x4]=h.xs;
    const bounds=[-Infinity,(x0+x1)/2,(x1+x2)/2,(x2+x3)/2,(x3+x4)/2,Infinity];
    const stop=rows.filter(r=>(Number(r.y)||0)<h.y&&/\b(?:sub\s*total|subtotal|gst|amount\s+due|grand\s+total|invoice\s+total)\b/i.test(r.text||'')).sort((a,b)=>(Number(b.y)||0)-(Number(a.y)||0))[0];
    const stopY=stop?Number(stop.y):-Infinity,body=rows.filter(r=>(Number(r.y)||0)<h.y&&(Number(r.y)||0)>stopY);
    const cell=(r,col)=> (r.items||[]).filter(it=>{const c=center(it);return c>=bounds[col]&&c<bounds[col+1];});
    const anchors=[];
    for(const r of body){
      const code=cell(r,0).map(it=>clean(it.text)).filter(Boolean).join('').trim();
      const desc=cell(r,1).map(it=>txt(it.text)).filter(Boolean).join(' ').trim();
      const q=cell(r,2).map(it=>strictNum(it.text)).find(v=>Number.isInteger(v)&&v>0&&v<=9999);
      const p=cell(r,3).map(it=>strictNum(it.text)).find(v=>v!==null&&v>=0);
      const a=cell(r,4).map(it=>strictNum(it.text)).find(v=>v!==null&&v>=0);
      const codeLike=code&&/[A-Za-z]/.test(code)&&/^[A-Za-z0-9][A-Za-z0-9+._\/-]{1,30}$/.test(code)&&!/^(?:SN|SERIAL|DATE|TERMS|TOTAL|SUBTOTAL)$/i.test(code);
      if(codeLike&&(desc||q!==undefined||p!==undefined||a!==undefined))anchors.push({r,code});
    }
    const uniq=[];for(const a of anchors){if(uniq.every(u=>Math.abs((Number(u.r.y)||0)-(Number(a.r.y)||0))>Math.max(3,Number(pg.yTolerance)||3)))uniq.push(a);}
    for(let i=0;i<uniq.length;i++){
      const top=(Number(uniq[i].r.y)||0)+Math.max(4,Number(pg.yTolerance)||3),bottom=i+1<uniq.length?(Number(uniq[i+1].r.y)||0)+Math.max(4,Number(pg.yTolerance)||3):stopY;
      const group=body.filter(r=>(Number(r.y)||0)<=top&&(Number(r.y)||0)>bottom);
      let qty=null,price=null,amount=null,warranty='';const desc=[];
      for(const r of group){
        const d=cell(r,1).map(it=>txt(it.text)).filter(Boolean).join(' ').trim();
        if(d){if(/\bwarranty\b/i.test(d)){const m=d.match(/\b(\d+)\s*years?\b/i);warranty=m?m[1]+' Years':d;}else if(!/^\s*(?:s\/?n|serial|shipment\s*no)\b/i.test(d))desc.push(d);}
        if(qty===null){const vals=cell(r,2).map(it=>strictNum(it.text)).filter(v=>Number.isInteger(v)&&v>0&&v<=9999);if(vals.length===1)qty=vals[0];}
        if(price===null){const vals=cell(r,3).map(it=>strictNum(it.text)).filter(v=>v!==null&&v>=0);if(vals.length===1)price=vals[0];}
        if(amount===null){const vals=cell(r,4).map(it=>strictNum(it.text)).filter(v=>v!==null&&v>=0);if(vals.length===1)amount=vals[0];}
      }
      // Never "repair" three mutually consistent OCR hallucinations. Values must come from their own columns.
      // Arithmetic may fill only one missing field when the other two were independently observed.
      if(qty===null&&price>0&&amount>=0){const r=amount/price,n=Math.round(r);if(n>=1&&n<=9999&&Math.abs(r-n)<.001)qty=n;}
      else if(price===null&&qty>0&&amount>=0)price=Math.round((amount/qty)*100)/100;
      else if(amount===null&&qty>0&&price>=0)amount=Math.round((qty*price)*100)/100;
      const economicOk=qty>0&&price!==null&&amount!==null&&Math.abs(qty*price-amount)<=Math.max(.02,Math.abs(amount)*.001);
      const description=cleanInventoryDescription(desc.join(' '));
      if(!description)continue;
      const line=normalizeParsedInvoiceItem({sku:cleanVerifiedSku(uniq[i].code,(state.ocrCandidates||[]).map(x=>x.text||'').join('\n')),item_name:description,description,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty,serials:''});
      line.economicEvidenceVerified=!!economicOk;line.quantityReviewRequired=!economicOk;line.priceReviewRequired=!economicOk;line.amountReviewRequired=!economicOk;
      out.push(line);
    }
  }
  return out;
}
function v679EconomicQuality(items=[]){
  if(!items.length)return-999;let score=0;
  for(const x of items){const q=Number(x.quantity),p=Number(x.unit_price),a=Number(x.amount);if(q>0&&p>=0&&a>=0&&Math.abs(q*p-a)<=Math.max(.02,Math.abs(a)*.001))score+=40;else score-=80;if(String(x.sku||'').trim())score+=8;if(String(x.item_name||'').trim())score+=5;}
  return score;
}
function v679MatchExistingSku(line={},sourceText=''){
  const existing=state?.data?.items||[];if(!existing.length)return{sku:'',method:'none'};
  const compact=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const printed=cleanVerifiedSku(line.sku||'',sourceText);if(printed){const k=compact(printed),hits=existing.filter(i=>compact(i.sku)===k&&!v676IsForbiddenAutoSku(i.sku));if(hits.length===1)return{sku:String(hits[0].sku),method:'exact-normalized-sku'};return{sku:printed,method:'printed-sku'};}
  const models=v676ModelCandidatesFromText([line.item_name,line.description].filter(Boolean).join(' '),sourceText).map(compact).filter(x=>x.length>=4);
  const hits=existing.filter(i=>{const hay=[i.sku,i.item_name,i.description].map(compact);return models.some(m=>hay.some(h=>h===m||h.includes(m)||m.includes(h)&&h.length>=4));});
  const unique=[...new Map(hits.map(i=>[String(i.id||i.sku),i])).values()];if(unique.length===1&&String(unique[0].sku||'').trim()&&!v676IsForbiddenAutoSku(unique[0].sku))return{sku:String(unique[0].sku),method:'unique-model-match'};
  return{sku:'',method:unique.length>1?'ambiguous-model-match':'no-confident-match'};
}
function v679ImproveSkuMatches(items=[],sourceText=''){
  return (items||[]).map(x=>{const m=v679MatchExistingSku(x,sourceText);if(!String(x.sku||'').trim()&&m.sku)return{...x,sku:m.sku,skuMatchMethod:m.method,skuReviewRequired:false};return{...x,skuMatchMethod:m.method||'printed'};});
}

function v661FinalizeParsedInvoice(parsed={},raw=''){
  const sources=v661EvidenceSources(parsed.rawText||raw||''),evidence=sources.map(x=>x.text).join('\n');
  let doc=recoverAvMediaHeader({...parsed.doc},evidence);doc=v662RecoverMoneyFromText(doc,evidence);
  const savedLayout=state.pdfLayout;let moneyCandidates=[];
  for(const src of sources){state.pdfLayout=src.layout||[];let d=v661RepairInvoiceMoneyFromLayout({...doc});d=v662RecoverMoneyFromText(d,src.text||'');const a=Number(d.subtotal),b=Number(d.gst),c=Number(d.total_amount),ok=[a,b,c].every(Number.isFinite)&&Math.abs((a+b)-c)<=.06;moneyCandidates.push({d,ok,score:(Number.isFinite(a)?1:0)+(Number.isFinite(b)?1:0)+(Number.isFinite(c)?1:0)+(ok?8:0)});}
  state.pdfLayout=savedLayout;moneyCandidates.sort((a,b)=>b.score-a.score);if(moneyCandidates[0])doc=moneyCandidates[0].d;
  const candidates=[];const add=(arr,origin,srcText)=>{const xs=sanitizeParsedInventoryItems((arr||[]).map(normalizeParsedInvoiceItem),srcText||evidence).filter(x=>String(x.item_name||'').trim()&&Number(x.quantity)>0);if(xs.length){const targetedBoost=/^av-targeted:avmedia-targeted$/i.test(String(origin||''))?120:0;candidates.push({origin,items:xs,score:invoiceItemsQuality(xs,doc.subtotal)+targetedBoost});}};
  add(parsed.items||[],'base',parsed.rawText||raw);
  for(const src of sources){const old=state.pdfLayout;state.pdfLayout=src.layout||[];const strict=v679StrictLayoutItems();if(strict.length){const xs=sanitizeParsedInventoryItems(strict,src.text);candidates.push({origin:'strict-layout:'+src.source,items:xs,score:invoiceItemsQuality(xs,doc.subtotal)+v679EconomicQuality(xs)+220});}if(/\bAV\s+MEDIA\b/i.test(src.text)||/av\s+media/i.test(String(doc.supplier_name||''))){add(parseAvMediaTargetedText(src.text),'av-targeted:'+src.source,src.text);add(parseAvMediaMixedLayoutItems(),'av-layout:'+src.source,src.text);add(parseAvMediaTextItems(src.text),'av-text:'+src.source,src.text);}add(v661ParseGenericPricedRows(src.text),'generic-text:'+src.source,src.text);add(v662ParsePhysicalEvidenceRows(src.text),'physical-evidence:'+src.source,src.text);if(typeof parseFlexibleProductLayoutItems==='function')add(parseFlexibleProductLayoutItems(),'flex-layout:'+src.source,src.text);if(typeof parseProductCodeLayoutItems==='function')add(parseProductCodeLayoutItems(),'product-layout:'+src.source,src.text);state.pdfLayout=old;}
  candidates.sort((a,b)=>b.score-a.score);let extracted=candidates[0]?.items||[];extracted=v679ImproveSkuMatches(extracted,evidence);const withSerials=v677ValidateInvoiceLines(attachSerialBlocks(extracted,evidence),evidence),inventory=sanitizeParsedInventoryItems(inventoryOnlyItems(withSerials),evidence);
  const physicalSum=inventory.reduce((n,x)=>n+(Number(x.amount)||0),0);
  if(physicalSum>0&&!Number.isFinite(Number(doc.subtotal)))doc.subtotal=Math.round(physicalSum*100)/100;
  doc=v662RecoverMoneyFromText(doc,evidence);
  const classification=classifyInvoiceDocument(evidence,withSerials,inventory);
  const finalItems=['service','noninventory'].includes(classification.type)?[]:inventory;
  return {...parsed,doc,items:finalItems,excludedServiceCount:Math.max(0,withSerials.length-finalItems.length),invoiceClassification:classification,serviceOnlyInvoice:classification.type==='service',nonInventoryOnlyInvoice:classification.type==='noninventory',dateReviewRequired:!doc.invoice_date,rawText:evidence,parseEvidence:{...(parsed.parseEvidence||{}),itemSource:candidates[0]?.origin||'none',candidateCounts:candidates.map(c=>({origin:c.origin,count:c.items.length,score:c.score})),file_sha256:state.importFileHash||'',file_kind:state.importFileKind||''}};
}

async function v661ReprocessConfirmedEquipmentInvoice(){
  if(!state.parsed)return;state.importClassificationChoice='equipment';
  setProgress(70,'Re-checking existing scan results…');$('importProgress')?.classList.remove('hidden');
  try{
    const raw=state.parsed.raw||state.parsed.rawText||'';
    // Initial import already ran native extraction plus up to three OCR modes. Reuse that evidence immediately; do not hang on another OCR pass.
    const reparsed=v661FinalizeParsedInvoice(parseBestInvoice(raw),raw);reparsed.raw=reparsed.rawText||reparsed.raw||raw;state.parsed=reparsed;
    applyParsedReviewToForm();await refreshDuplicateWarning();renderImportEligibility();
    if((state.parsed.items||[]).length)toast('Equipment invoice selected and extracted fields refreshed. Verify them against the PDF.');
    else toast('Equipment selected. The completed scans found no line item reliable enough to auto-fill; add only verified values manually.');
  }catch(err){console.warn('Equipment re-check failed.',err);toast('Equipment selected. Existing parsed values were kept for manual review.');}
  finally{setTimeout(()=>$('importProgress')?.classList.add('hidden'),180);}
}
function v661RenderImportEligibility(){
  const parsed=state.parsed,detected=parsed?.invoiceClassification?.type||'uncertain',effective=effectiveInvoiceType(),saveBtn=$('saveImportBtn');
  let note=$('invoiceEligibilityWarning');if(!note&&$('parsedItems')){note=document.createElement('div');note.id='invoiceEligibilityWarning';$('parsedItems').parentNode.insertBefore(note,$('parsedItems'));}
  const setStyle=(kind)=>{if(!note)return;const map={danger:['#f5c2c0','#fff1f0','#912018'],warn:['#f6d88a','#fff8df','#854d0e'],info:['#b9d9ff','#eff7ff','#175cd3']},v=map[kind];note.style.cssText=`margin:0 0 14px;padding:12px 14px;border:1px solid ${v[0]};border-radius:10px;background:${v[1]};color:${v[2]};font-size:12px;line-height:1.45`};
  if(note){note.classList.remove('hidden');if(detected==='service'||effective==='service'){setStyle('danger');note.innerHTML='<strong>Equipment invoices only.</strong> This document contains service / labour / installation charges only and cannot be imported.';}else if(detected==='noninventory'||effective==='noninventory'){setStyle('danger');note.innerHTML='<strong>No tracked equipment found.</strong> Security locks, safety wires, mounts, brackets, cables, lamp kits, carts and stands are excluded from Inventory.';}else if(detected==='uncertain'&&!state.importClassificationChoice){setStyle('warn');note.innerHTML='<strong>Invoice type needs confirmation.</strong> The parser cannot prove whether this document contains physical equipment. Check the PDF and choose the correct type.<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" class="secondary small-btn" id="chooseEquipmentInvoiceBtn">Equipment invoice</button><button type="button" class="secondary small-btn" id="chooseServiceInvoiceBtn">Service invoice</button></div>';}else if(detected==='uncertain'&&effective==='equipment'){setStyle('info');note.innerHTML='<strong>Equipment invoice selected.</strong> The app will re-check the invoice fields and physical line items before saving. <button type="button" class="link-btn" id="changeInvoiceTypeBtn">Change</button>';}else{note.classList.add('hidden');note.innerHTML='';}}
  if(saveBtn){const blocked=effective!=='equipment';saveBtn.disabled=blocked||!!state.importSaving;saveBtn.title=effective==='service'?'Service-only invoices cannot be imported.':effective==='noninventory'?'This invoice contains no tracked equipment.':effective==='uncertain'?'Confirm the invoice type before saving.':'';saveBtn.setAttribute('aria-disabled',blocked?'true':'false');}
  const eq=$('chooseEquipmentInvoiceBtn'),svc=$('chooseServiceInvoiceBtn'),chg=$('changeInvoiceTypeBtn');
  if(eq)eq.onclick=async()=>{eq.disabled=true;await reprocessConfirmedEquipmentInvoice();};
  if(svc)svc.onclick=()=>{state.importClassificationChoice='service';renderImportEligibility();toast('Marked as service invoice. Saving to inventory is disabled.');};
  if(chg)chg.onclick=()=>{state.importClassificationChoice=null;renderImportEligibility();};
}

function v661LooksServiceOnlyDocument(text='',extractedItems=[],inventoryItems=[]){
  return classifyInvoiceDocument(text,extractedItems,inventoryItems).type==='service';
}


function v672SketchKind(item){
  const c=norm([item?.sku,item?.item_name,item?.description,item?.category].join(' '));
  if(/\b(?:rolling stand|mobile stand|floor stand|trolley|cart|tripod stand|display stand)\b/.test(c))return'stand';
  if(/\b(?:projector|projection)\b/.test(c))return'projector';
  if(/\b(?:active speaker|speaker|loudspeaker|soundbar)\b/.test(c))return'speaker';
  if(/\b(?:control panel|controller|switcher|matrix|processor|av control)\b/.test(c))return'control';
  if(/\b(?:microphone|wireless handheld|transmitter|receiver|bodypack)\b/.test(c))return'microphone';
  if(/\b(?:visualizer|document camera)\b/.test(c))return'visualizer';
  if(/\b(?:camera|camcorder|ptz)\b/.test(c))return'camera';
  if(/\b(?:hdmi|usb|cat6|cable|adapter|dongle|ideashare key)\b/.test(c))return'cable';
  if(/\b(?:display|monitor|screen|ideahub|television|tv)\b/.test(c))return'display';
  return'generic';
}
function v672SketchSvg(item){
  const kind=v672SketchKind(item),identity=String(item?.sku||item?.item_name||item?.description||kind);
  let hash=2166136261;for(let i=0;i<identity.length;i++){hash^=identity.charCodeAt(i);hash=Math.imul(hash,16777619)>>>0;}
  const wobble=(hash%5)-2,tilt=((hash>>>3)%5)-2;
  const stroke='#395269',soft='#7890a5',paper='#f3f7fb';
  const common=`fill="none" stroke="${stroke}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"`;
  const faint=`fill="none" stroke="${soft}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity=".48"`;
  const sketches={
    projector:`<g transform="translate(${wobble} ${tilt})"><rect x="112" y="92" width="256" height="102" rx="18" ${common}/><circle cx="304" cy="143" r="32" ${common}/><circle cx="304" cy="143" r="17" ${faint}/><path d="M140 117h93M140 133h74M141 166h54M127 194l-9 18M353 194l10 18" ${faint}/><path d="M145 88l22-20h154l21 20" ${faint}/></g>`,
    microphone:`<g transform="translate(${wobble} ${tilt}) rotate(-8 240 130)"><ellipse cx="184" cy="78" rx="45" ry="34" ${common}/><path d="M161 101l20 101M207 101l20 101M176 203h58" ${common}/><path d="M151 72h66M157 59h53M165 47h37" ${faint}/><path d="M268 64c24 10 34 28 29 53l-19 91M260 58c34 9 54 31 54 62" ${faint}/></g>`,
    speaker:`<g transform="translate(${wobble} ${tilt})"><rect x="145" y="45" width="190" height="174" rx="16" ${common}/><circle cx="240" cy="148" r="50" ${common}/><circle cx="240" cy="148" r="25" ${faint}/><circle cx="240" cy="82" r="15" ${common}/><path d="M161 210h158M164 54l-9 14M316 54l9 14" ${faint}/></g>`,
    control:`<g transform="translate(${wobble} ${tilt})"><rect x="88" y="72" width="304" height="120" rx="12" ${common}/><rect x="112" y="96" width="112" height="70" rx="7" ${faint}/><circle cx="268" cy="112" r="9" ${common}/><circle cx="307" cy="112" r="9" ${common}/><circle cx="346" cy="112" r="9" ${common}/><path d="M254 147h103M254 163h77M105 192l-12 19M375 192l12 19" ${faint}/></g>`,
    cable:`<g transform="translate(${wobble} ${tilt})"><path d="M125 143c0-54 50-82 104-64 65 21 73 91 20 110-47 17-91-6-88-44 3-38 44-57 78-41 27 13 30 41 11 55" ${common}/><path d="M112 142h-38v-29h31l20 14M250 160l55 28" ${common}/><rect x="305" y="176" width="72" height="30" rx="5" ${common}/><path d="M322 176v-16h38v16M86 113V96" ${faint}/></g>`,
    display:`<g transform="translate(${wobble} ${tilt})"><rect x="96" y="42" width="288" height="154" rx="12" ${common}/><path d="M240 197v28M188 226h104" ${common}/><path d="M118 67l119 0M118 84h70M335 174h26" ${faint}/><rect x="116" y="62" width="248" height="111" rx="5" ${faint}/></g>`,
    camera:`<g transform="translate(${wobble} ${tilt})"><rect x="120" y="86" width="202" height="110" rx="18" ${common}/><circle cx="235" cy="141" r="43" ${common}/><circle cx="235" cy="141" r="22" ${faint}/><path d="M322 110l70-31v123l-70-30zM151 86l18-30h87l19 30" ${common}/></g>`,
    visualizer:`<g transform="translate(${wobble} ${tilt})"><rect x="106" y="181" width="268" height="34" rx="8" ${common}/><path d="M186 181V79c0-20 14-34 34-34h46" ${common}/><rect x="257" y="31" width="93" height="55" rx="9" ${common}/><circle cx="316" cy="58" r="10" ${faint}/><path d="M138 197h84M272 197h61" ${faint}/></g>`,
    stand:`<g transform="translate(${wobble} ${tilt})"><rect x="126" y="43" width="228" height="112" rx="9" ${common}/><path d="M240 155v55M240 179h-72M240 179h72M169 179l-27 35M311 179l27 35" ${common}/><circle cx="138" cy="219" r="9" ${faint}/><circle cx="342" cy="219" r="9" ${faint}/><path d="M145 57h190M145 73h117" ${faint}/></g>`,
    generic:`<g transform="translate(${wobble} ${tilt})"><rect x="105" y="72" width="270" height="126" rx="16" ${common}/><circle cx="154" cy="135" r="17" ${common}/><circle cx="207" cy="135" r="17" ${common}/><path d="M251 112h88M251 132h68M251 152h96M124 87l16-18h201l15 18" ${faint}/></g>`
  };
  const art=sketches[kind]||sketches.generic;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 260" role="img" aria-label="Generated AV equipment sketch"><rect width="480" height="260" rx="24" fill="${paper}"/><path d="M43 218c72 8 143 9 216 3 72-5 129-4 176 2" ${faint}/>${art}</svg>`;
  return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);
}
function v672ImageForItem(item){
  const manual=String(item?.image_url||'').trim();
  if(manual)return manual;
  return v672SketchSvg(item);
}

async function launch(){
  try{
    const r=await fetch(ORIGINAL_APP_URL,{cache:'no-store'});
    if(!r.ok)throw new Error('Unable to load verified V6.55 source ('+r.status+').');
    let src=await r.text();
    if(!src.includes("const APP_VERSION='6.55';"))throw new Error('Verified V6.55 source signature was not found.');

    src=replaceOnce(src,"function imageForItem(item){if(item.image_url)return item.image_url;const c=norm([item.category,item.item_name,item.description,item.sku].join(' '));if(c.includes('projector'))return DASH_ASSETS.projector;if(c.includes('microphone')||c.includes('wireless')||c.includes('audio'))return DASH_ASSETS.microphone;if(c.includes('cable')||c.includes('hdmi'))return DASH_ASSETS.cable;if(c.includes('display')||c.includes('monitor')||c.includes('screen'))return DASH_ASSETS.monitor;return'';}",asPatchedFunction(v672SketchKind,'v672SketchKind')+'\n'+asPatchedFunction(v672SketchSvg,'v672SketchSvg')+'\n'+asPatchedFunction(v672ImageForItem,'imageForItem'),'copyright-safe identity sketch images');
    src=replaceOnce(src,"const toast=(msg)=>{const t=$('toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2500)};","const toast=(msg)=>{const openDialogs=[...document.querySelectorAll('dialog[open]')];const dlg=openDialogs[openDialogs.length-1];if(dlg){let t=dlg.querySelector('.v667-modal-toast');if(!t){t=document.createElement('div');t.className='v667-modal-toast';t.setAttribute('role','status');t.style.cssText='position:fixed;top:22px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:min(720px,calc(100vw - 40px));background:#10253f;color:#fff;border:1px solid #4c6f96;border-radius:10px;padding:12px 16px;box-shadow:0 10px 30px rgba(0,0,0,.32);font:600 14px/1.4 system-ui,sans-serif;text-align:center;';dlg.appendChild(t);}t.textContent=msg;t.style.display='block';clearTimeout(t._hideTimer);t._hideTimer=setTimeout(()=>{t.style.display='none';},3500);return;}const t=$('toast');if(!t)return;t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),3000)};",'modal-visible toast');
    src=replaceOnce(src,"// AV Inventory Hub V6.55 — evidence-only inventory parsing and verified invoice dates","// AV Inventory Hub V6.79 — no-AUTO SKU enforcement and self-rectifying invoice validation",'version header');
    src=replaceOnce(src,"const APP_VERSION='6.55';","const APP_VERSION='6.79';",'APP_VERSION');
    src=replaceOnce(src,"const RELEASE_CURRENT_NOTES=[","const RELEASE_CURRENT_NOTES=[\n  'Serial numbers are re-associated to verified SKU/model evidence and duplicate cross-SKU ownership is blocked',\n  'Quantities are cross-checked against unit price and amount; unresolved quantities block save instead of being guessed',\n  'Rows containing repair/repairing/repaired are excluded from Inventory imports',\n  'Startup hotfix: accessory-exclusion helper is injected exactly once to prevent duplicate identifier failure',\n  'Service-only invoices are blocked before Review and are not saved to Documents or Inventory',\n  'Security locks, safety wires, mounts, brackets, cables, lamp kits, carts and stands are excluded from Inventory imports',\n  'Accessory exclusion is checked during parse cleanup, inventory filtering and final save preparation',\n  'Scanned AV Media service invoices no longer create gibberish inventory rows from FAX/address/header OCR fragments',\n  'Full-page SINGLE_BLOCK OCR is added as a recovery candidate for low-quality scanned PDFs',\n  'Clear labour/installation-only invoices are classified as Service even when descriptions mention existing AV equipment',\n  'Service-only invoices show no inventory line cards and Confirm & save remains disabled',\n  'AV Media dates are left blank for manual review when only an unlabelled/footer date is readable, instead of guessing',\n  'Inventory cards now use original identity-based sketch illustrations instead of downloading or tracing web product photos',\n  'Manual image URLs remain authoritative and are never overwritten by generated sketches',\n  'Startup hotfix: corrected the verified V6.55 Inventory-row patch marker so the patch loader can initialise normally',\n  'SKU/model maximum increased from 12 to 13 characters',\n  'Inventory edited Description is displayed beneath SKU/item after save and refresh',\n  'Serial-number fields exclude SKU/model identifiers from the same invoice',\n  'Recent Activities All users filter now matches the date filter width',\n  'AV Media invoices use targeted high-resolution header/table OCR when native PDF text is corrupted',\n  'Gibberish OCR item names are rejected before SKU fallback or inventory save',\n  'AV Media product codes, descriptions, quantities and prices are parsed from verified row evidence',\n  'Warranty rows attach to equipment instead of creating separate inventory items',\n  'Installation/service rows remain excluded from physical inventory',\n  'Categories are filled only from clear equipment nouns such as projector, control panel or speaker',\n  'Import drop zone is centred and reduced to 50% width on desktop',\n  'Missing SKU/model stays blank unless a printed identifier is verified in the invoice',\n  'Header/contact OCR fragments are blocked from becoming inventory items',\n  'Visible Edit button added beside SKU/item and Category for quick corrections',\n  'Import alerts display above the active modal instead of behind the blurred backdrop',\n  'Invoice dates such as 7-Dec-20 and 07-Dec-2020 are now recognised',\n  'Inventory descriptions remove quantity/UOM/price/currency/subtotal/GST/total contamination',\n  'Invoice-only import gate blocks Delivery Orders, Delivery Notes, packing lists and other non-invoice documents',\n  'Delivery Order references inside a verified invoice remain allowed',\n  'Return-trip, signed-delivery-order, courier, freight and transport rows are excluded from inventory',\n  'SKU/model values are limited to 13 characters maximum',\n  'Documents display DD/MM/YYYY-Company name and stored files use DD-MM-YYYY-Company-name',\n  'Golden-corpus regression testing added for real invoice layouts',\n  'PDF, JPG/JPEG, PNG, WEBP and DOCX use one normalised import pipeline',\n  'Native text is preferred and OCR is used as fallback/recovery for scanned content',\n  'SHA-256 file hashing and parser audit metadata are supported',\n  'Header, totals, line items and invoice type are validated across independent scans',\n  'Extraction completes before Equipment/Service classification is evaluated',\n  'Clear equipment invoices are auto-classified from verified priced product rows',\n  'Clear service/labour invoices are blocked without unnecessary confirmation prompts',\n  'Equipment confirmation re-runs extraction and refreshes all review fields',\n  'AV Media Invoice No. and DATE use labelled header coordinates plus OCR fallback',\n  'AV Media PRODUCT NO. tables are parsed in either PDF coordinate direction',\n  'Serial numbers and warranty text never contaminate SKU/item identifiers',\n  'Subtotal, GST and Amount Due are recovered from labelled total rows and arithmetic checked',\n  'Recovery OCR runs automatically when key header fields or physical line items are missing',",'release notes');

    src=replaceSection(src,"function detectInvoiceDate(text,invoice=''){","\nfunction first(",asPatchedFunction(v661DetectInvoiceDate,'detectInvoiceDate')+'\n','detectInvoiceDate');
    src=replaceSection(src,"function parseDate(v=''){","\nfunction invoiceSignals",asPatchedFunction(v661ParseDate,'parseDate')+'\n','calendar-safe parseDate');
    src=replaceSection(src,'function detectInvoiceDateFromLayout(){','\nfunction layoutMoneyForLabel',asPatchedFunction(v661DetectInvoiceDateFromLayout,'detectInvoiceDateFromLayout')+'\n','coordinate invoice-date parser');
    src=replaceSection(src,'function isNonInventoryServiceLine(x={}){','\nfunction inventoryOnlyItems',asPatchedFunction(v665IsNonInventoryServiceLine,'isNonInventoryServiceLine')+'\n','service-line classifier');
    src=replaceOnce(src,"function inventoryOnlyItems(items=[]){return validParsedItems(items).filter(x=>!isNonInventoryServiceLine(x));}",asPatchedFunction(v674IsExcludedInventoryAccessoryLine,'isExcludedInventoryAccessoryLine')+'\n'+"function inventoryOnlyItems(items=[]){return validParsedItems(items).filter(x=>!isNonInventoryServiceLine(x)&&!isExcludedInventoryAccessoryLine(x)&&!v676IsSupportCoverageLine(x));}",'non-inventory accessory filter');
    src=replaceOnce(src,"  return {...x,sku:x.sku||skuFromDescription(description),item_name:standardItemNameFromDescription(description),description};","  return {...x,sku:String(x.sku||'').trim(),item_name:standardItemNameFromDescription(description),description};",'do not infer SKU from description');
    src=replaceOnce(src,"        current.sku=current.sku||skuFromDescription(current.description);","        current.sku=String(current.sku||'').trim();",'remove continuation SKU guessing');
    src=replaceOnce(src,"    item.serialReviewRequired=!!item.serialReviewRequired||block.uncertain||!observed.length;","    item.serialReviewRequired=!!item.serialReviewRequired||block.uncertain;",'optional serial numbers stay optional');
    src=replaceOnce(src,'function parseGenericInvoiceItems(text){',asPatchedFunction(v661ParseProductCodeLayoutItems,'parseProductCodeLayoutItems')+'\nfunction parseGenericInvoiceItems(text){','product-code layout parser insertion');
    src=replaceOnce(src,'function parseGenericInvoiceItems(text){',asPatchedFunction(v661FlexibleProductLayoutItems,'parseFlexibleProductLayoutItems')+'\nfunction parseGenericInvoiceItems(text){','flexible product table parser insertion');
    src=replaceOnce(src,'function parseGenericInvoiceItems(text){',asPatchedFunction(v661ParseAvMediaMixedLayoutItems,'parseAvMediaMixedLayoutItems')+'\n'+asPatchedFunction(v661ParseAvMediaTextItems,'parseAvMediaTextItems')+'\nfunction parseGenericInvoiceItems(text){','AV Media layout + text table parser insertion');
    src=replaceOnce(src,"  const layout=(state.pdfLayout?.length?parseLayoutInvoiceItems():[]).map(normalizeParsedInvoiceItem);\n  let items=[supplierSpecific,generic,numbered,layout].sort((a,b)=>invoiceItemsQuality(b,subtotal)-invoiceItemsQuality(a,subtotal))[0]||[];","  const layout=(state.pdfLayout?.length?parseLayoutInvoiceItems():[]).map(normalizeParsedInvoiceItem);\n  const productLayout=(state.pdfLayout?.length?parseProductCodeLayoutItems():[]).map(normalizeParsedInvoiceItem);\n  const flexibleLayout=(state.pdfLayout?.length?parseFlexibleProductLayoutItems():[]).map(normalizeParsedInvoiceItem);\n  const avMediaLayout=(state.pdfLayout?.length&&/AV\\s+MEDIA/i.test(flat)?parseAvMediaMixedLayoutItems():[]).map(normalizeParsedInvoiceItem);\n  const avMediaText=(/AV\\s+MEDIA/i.test(flat)?parseAvMediaTextItems(flat):[]).map(normalizeParsedInvoiceItem);\n  let items=[supplierSpecific,generic,numbered,layout,productLayout,flexibleLayout,avMediaLayout,avMediaText].sort((a,b)=>invoiceItemsQuality(b,subtotal)-invoiceItemsQuality(a,subtotal))[0]||[];",'parser candidate list');
    src=replaceOnce(src,"  if(/^(sold\\s*to|bill\\s*to|ship\\s*to|invoice|inv|invoice\\s*(no|number)|date)$/i.test(invoice))invoice='';","  if(/^(sold\\s*to|bill\\s*to|ship\\s*to|invoice|inv|invoice\\s*(no|number)|date|customer|customer\\s*code|reference|ref|terms)$/i.test(invoice))invoice='';",'invoice-header contamination guard');

    src=replaceOnce(src,"return `<tr><td><button class=\"item-link\" data-detail=\"${i.id}\"><strong>${esc(i.sku)}</strong><span>${esc(i.item_name)}</span></button>","const skuLabel=String(i.sku||'').trim().length<=13?String(i.sku||'').trim():'—';const itemDisplayDescription=String(i.description||i.item_name||'').trim();return `<tr><td><button class=\"item-link\" data-detail=\"${i.id}\"><strong>${esc(skuLabel)}</strong><span>${esc(itemDisplayDescription)}</span></button>",'13-character SKU display guard');
    src=replaceOnce(src,"</button></td><td>${esc(i.category||'—')}</td><td class=\"qty\">","</button></td><td>${esc(i.category||'—')}</td><td>${editable?`<button class=\"secondary small-btn\" data-edit=\"${i.id}\">Edit</button>`:'—'}</td><td class=\"qty\">",'visible inventory edit button');
    src=replaceOnce(src,"<th>SKU / item</th><th>Category</th><th>Total purchased","<th>SKU / item</th><th>Category</th><th>Edit</th><th>Total purchased",'inventory edit column header');
    src=replaceOnce(src,"return `<tr><td>${esc(d.file_name)}</td><td>${esc(d.supplier_name||'—')}</td>","const displayFile=displayDocumentFilename(d,invoiceDate);return `<tr><td>${esc(displayFile)}</td><td>${esc(d.supplier_name||'—')}</td>",'date-company document display name');
    src=replaceOnce(src,"  const chosen=itemChoice?.r||best;state.pdfLayout=chosen.layout||best.layout||originalLayout;","  const chosen=itemChoice?.r||best;state.pdfLayout=chosen.layout||best.layout||originalLayout;if(!confirmedDate){const strongLayoutDate=detectInvoiceDateFromLayout();if(strongLayoutDate){confirmedDate=strongLayoutDate;doc.invoice_date=strongLayoutDate;}}recoverAvMediaHeader(doc,chosen.text);v661RepairInvoiceMoneyFromLayout(doc);if(doc.invoice_date)confirmedDate=doc.invoice_date;",'strong AV Media header/date/money repair');
    src=replaceOnce(src,"  const items=inventoryOnlyItems(extractedItems);","  const items=sanitizeParsedInventoryItems(inventoryOnlyItems(extractedItems),itemChoice?.r?.text||best.text);",'evidence-only SKU sanitization');
    src=replaceOnce(src,"  return {...best.parsed,doc,items,excludedServiceCount:Math.max(0,extractedItems.length-items.length),dateReviewRequired:!confirmedDate,rawText:chosen.text,ocrSelection:{source:chosen.source,score:chosen.score,candidates:results.map(r=>({source:r.source,score:r.score,items:validParsedItems(r.parsed.items).length}))}};","  const invoiceClassification=classifyInvoiceDocument(chosen.text,extractedItems,items);\n  const serviceOnlyInvoice=invoiceClassification.type==='service';\n  return {...best.parsed,doc,items,excludedServiceCount:Math.max(0,extractedItems.length-items.length),invoiceClassification,serviceOnlyInvoice,dateReviewRequired:!confirmedDate,rawText:chosen.text,ocrSelection:{source:chosen.source,score:chosen.score,candidates:results.map(r=>({source:r.source,score:r.score,items:validParsedItems(r.parsed.items).length}))}};",'evidence-based invoice classification');

    src=replaceSection(src,'function standardPdfFilename(doc={}){','\nfunction openIdb',`function standardPdfFilename(doc={},file=null){
  return v665StoredDocumentFilename(doc,file);
}
async function autoNamedPdf(file,doc){
  const base=standardPdfFilename(doc,file);
  let name=base,n=2;
  while(await state.db.duplicateFilename(name)){
    const dot=base.lastIndexOf('.'),stem=dot>0?base.slice(0,dot):base,ext=dot>0?base.slice(dot):'';
    name=stem+'-'+n+ext;n++;
  }
  if(name===file.name)return file;
  return new File([file],name,{type:file.type||'application/octet-stream',lastModified:file.lastModified});
}
`,'date-company source filename');

    src=replaceOnce(src,'function cleanupPdfPreview(){',asPatchedFunction(v665CleanVerifiedSku,'cleanVerifiedSku')+'\n'+asPatchedFunction(v661CleanInventoryDescription,'cleanInventoryDescription')+'\n'+asPatchedFunction(v667PlausibleItemName,'v667PlausibleItemName')+'\n'+asPatchedFunction(v667ShortItemName,'v667ShortItemName')+'\n'+asPatchedFunction(v667InferCategory,'v667InferCategory')+'\n'+asPatchedFunction(v667ParseAvMediaTargetedText,'parseAvMediaTargetedText')+'\n'+asPatchedFunction(v667AddAvMediaTargetedOcr,'addAvMediaTargetedOcr')+'\n'+asPatchedFunction(v661ParseGenericPricedRows,'v661ParseGenericPricedRows')+'\n'+asPatchedFunction(v662MoneyNumber,'v662MoneyNumber')+'\n'+asPatchedFunction(v662RecoverMoneyFromText,'v662RecoverMoneyFromText')+'\n'+asPatchedFunction(v662FileSha256,'v662FileSha256')+'\n'+asPatchedFunction(v662FileKind,'v662FileKind')+'\n'+asPatchedFunction(v662EnsureJSZip,'v662EnsureJSZip')+'\n'+asPatchedFunction(v662OcrBlob,'v662OcrBlob')+'\n'+asPatchedFunction(v662ExtractDocx,'v662ExtractDocx')+'\n'+asPatchedFunction(v662TryServerInvoiceProcessing,'v662TryServerInvoiceProcessing')+'\n'+asPatchedFunction(v662ExtractInvoiceFile,'extractInvoiceFile')+'\n'+asPatchedFunction(v662ParsePhysicalEvidenceRows,'v662ParsePhysicalEvidenceRows')+'\n'+asPatchedFunction(v662ParseAuditPayload,'v662ParseAuditPayload')+'\n'+asPatchedFunction(v662InstallAuditWrappers,'installParseAuditWrappers')+'\n'+asPatchedFunction(v662ConfigureInvoiceFileInputs,'configureInvoiceFileInputs')+'\n'+asPatchedFunction(v661EvidenceSources,'v661EvidenceSources')+'\n'+asPatchedFunction(v668CompactIdentifier,'v668CompactIdentifier')+'\n'+asPatchedFunction(v668ModelIdentifierKeys,'v668ModelIdentifierKeys')+'\n'+asPatchedFunction(v668ExplicitSerialEvidence,'v668ExplicitSerialEvidence')+'\n'+asPatchedFunction(v668SanitizeSerialAssignments,'sanitizeSerialAssignments')+'\n'+asPatchedFunction(v677VerifyQuantities,'v677VerifyQuantities')+'\n'+asPatchedFunction(v677ReassignSerialsByEvidence,'v677ReassignSerialsByEvidence')+'\n'+asPatchedFunction(v677ValidateInvoiceLines,'v677ValidateInvoiceLines')+'\n'+asPatchedFunction(v679StrictLayoutItems,'v679StrictLayoutItems')+'\n'+asPatchedFunction(v679EconomicQuality,'v679EconomicQuality')+'\n'+asPatchedFunction(v679MatchExistingSku,'v679MatchExistingSku')+'\n'+asPatchedFunction(v679ImproveSkuMatches,'v679ImproveSkuMatches')+'\n'+asPatchedFunction(v676IsForbiddenAutoSku,'v676IsForbiddenAutoSku')+'\n'+asPatchedFunction(v676ModelCandidatesFromText,'v676ModelCandidatesFromText')+'\n'+asPatchedFunction(v676EmbeddedVerifiedSku,'v676EmbeddedVerifiedSku')+'\n'+asPatchedFunction(v676SafeFallbackSku,'v676SafeFallbackSku')+'\n'+asPatchedFunction(v676IsSupportCoverageLine,'v676IsSupportCoverageLine')+'\n'+asPatchedFunction(v676CanonicalItemName,'v676CanonicalItemName')+'\n'+asPatchedFunction(v676ValidateAndRectifyItems,'v676ValidateAndRectifyItems')+'\n'+asPatchedFunction(v676RepairLegacyAutoSkuMatches,'v676RepairLegacyAutoSkuMatches')+'\n'+asPatchedFunction(v661SanitizeParsedInventoryItems,'sanitizeParsedInventoryItems')+'\n'+asPatchedFunction(v661PrepareInventoryLinesForSave,'prepareInventoryLinesForSave')+'\n'+asPatchedFunction(v661RecoverAvMediaHeader,'recoverAvMediaHeader')+'\n'+asPatchedFunction(v661ClassifyInvoiceDocument,'classifyInvoiceDocument')+'\n'+asPatchedFunction(v661EffectiveInvoiceType,'effectiveInvoiceType')+'\n'+asPatchedFunction(v661ApplyParsedReviewToForm,'applyParsedReviewToForm')+'\n'+asPatchedFunction(v661RefreshDuplicateWarning,'refreshDuplicateWarning')+'\n'+asPatchedFunction(v661FinalizeParsedInvoice,'v661FinalizeParsedInvoice')+'\n'+asPatchedFunction(v661ReprocessConfirmedEquipmentInvoice,'reprocessConfirmedEquipmentInvoice')+'\n'+asPatchedFunction(v661RenderImportEligibility,'renderImportEligibility')+'\n'+asPatchedFunction(v661LooksServiceOnlyDocument,'looksServiceOnlyDocument')+'\n'+asPatchedFunction(v661LayoutMoney,'v661LayoutMoney')+'\n'+asPatchedFunction(v661RepairInvoiceMoneyFromLayout,'v661RepairInvoiceMoneyFromLayout')+'\n'+asPatchedFunction(v661NeedsDeepRecovery,'needsDeepRecovery')+'\n'+asPatchedFunction(v661EnsureTesseract,'v661EnsureTesseract')+'\n'+asPatchedFunction(v661ForceOcrRecovery,'forceOcrRecovery')+'\n'+asPatchedFunction(v665ClassifyDocumentType,'v665ClassifyDocumentType')+'\n'+asPatchedFunction(v665DetectImportDocumentType,'detectImportDocumentType')+'\n'+asPatchedFunction(v665EnsureInvoiceDocument,'ensureInvoiceDocument')+'\n'+asPatchedFunction(v665DisplayDocumentFilename,'displayDocumentFilename')+'\n'+asPatchedFunction(v665StoredDocumentFilename,'v665StoredDocumentFilename')+'\nfunction cleanupPdfPreview(){','import classification, verified SKU, AV Media recovery and OCR helpers');

    src=replaceOnce(src,"async function startImport(file){if(!file)return;if(!requireEdit())return;cleanupPdfPreview();","async function startImport(file){if(!file)return;if(!requireEdit())return;cleanupPdfPreview();state.parsed=null;state.importClassificationChoice=null;",'reset invoice-type choice');

    src=replaceOnce(src,"$('dropZone').ondrop=e=>{e.preventDefault();$('dropZone').classList.remove('drag');const f=e.dataTransfer.files[0];if(f?.type==='application/pdf')startImport(f);else toast('Please drop a PDF file.')}","$('dropZone').ondrop=e=>{e.preventDefault();$('dropZone').classList.remove('drag');const f=e.dataTransfer.files[0];if(f&&v662FileKind(f)!=='unsupported')startImport(f);else toast('Supported invoice formats: PDF, JPG/JPEG, PNG, WEBP or DOCX.')}",'multi-format drag and drop');

    src=replaceOnce(src,"const text=await extractPdf(file);const parsedBest=parseBestInvoice(text);state.parsed={...parsedBest,raw:parsedBest.rawText||text};","let text=await extractInvoiceFile(file);if(v662FileKind(file)==='pdf'&&/AV\s+MEDIA/i.test(text)){try{await addAvMediaTargetedOcr(file);}catch(targetErr){console.warn('AV Media targeted OCR skipped',targetErr);}}await ensureInvoiceDocument(file,text);let parsedBest=v661FinalizeParsedInvoice(parseBestInvoice(text),text);if(parsedBest.invoiceClassification?.type==='service')throw new Error('Service invoice detected. Equipment invoices only; this document was not imported.');if(needsDeepRecovery(parsedBest)){try{const recovered=await forceOcrRecovery(file);if(recovered)parsedBest=v661FinalizeParsedInvoice(parseBestInvoice(text),text);}catch(recoveryError){console.warn('Recovery OCR could not complete; keeping best verified parse.',recoveryError);}}state.parsed={...parsedBest,raw:parsedBest.rawText||text};if(state.parsed.invoiceClassification?.type==='service')throw new Error('Service invoice detected. Equipment invoices only; this document was not imported.');",'automatic recovery OCR');

    src=replaceOnce(src,"console.info('Invoice OCR selection',state.parsed.ocrSelection||{source:'text-pdf'});renderParsedItems();const dupe=", "console.info('Invoice OCR selection',state.parsed.ocrSelection||{source:'text-pdf'});state.parsed.items=sanitizeParsedInventoryItems(state.parsed.items||[],state.parsed.raw||text);renderParsedItems();renderImportEligibility();if(state.parsed.invoiceClassification?.type==='service')toast('Equipment invoices only. This service-work invoice cannot be saved.');else if(state.parsed.invoiceClassification?.type==='uncertain')toast('Invoice type is uncertain. Confirm Equipment or Service before saving.');const dupe=",'eligibility rendering');
    src=replaceOnce(src,",d,state.parsed.items,namedFile);state.lastImportCount=state.parsed.items.length;",",d,prepareInventoryLinesForSave(state.parsed.items),namedFile);state.lastImportCount=state.parsed.items.length;",'verified SKU and no-AUTO save enforcement');
    src=replaceOnce(src,"finally{state.importSaving=false;const saveBtn=$('saveImportBtn');if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Confirm & save';}if($('importProgress'))$('importProgress').classList.add('hidden');}","finally{state.importSaving=false;const saveBtn=$('saveImportBtn');if(saveBtn){saveBtn.textContent='Confirm & save';}renderImportEligibility();if($('importProgress'))$('importProgress').classList.add('hidden');}",'save-button final state');

    const gate="\n// V6.67 invoice-only + equipment-only save gate.\n$('saveImportBtn').addEventListener('click',e=>{\n  if(!state.parsed)return;\n  const docType=detectImportDocumentType(state.parsed.raw||state.parsed.rawText||'');\n  if(docType.type!=='invoice'){e.preventDefault();e.stopImmediatePropagation();toast(docType.type==='delivery_order'?'Only invoices can be imported. Delivery Orders are blocked.':'Only verified invoices can be saved.');return;}\n  const detected=state.parsed.invoiceClassification?.type||'uncertain';\n  const effective=detected==='uncertain'?(state.importClassificationChoice||'uncertain'):detected;\n  if(effective==='equipment'){const badQty=(state.parsed.items||[]).find(x=>x.quantityReviewRequired);const badSerial=(state.parsed.items||[]).find(x=>x.serialConflictReviewRequired);if(badQty||badSerial){e.preventDefault();e.stopImmediatePropagation();toast(badSerial?'Serial-number ownership is conflicting. Re-check the invoice before saving.':'One or more quantities could not be independently verified from unit price and amount. Review them before saving.');return;}return;}\n  e.preventDefault();e.stopImmediatePropagation();\n  renderImportEligibility();\n  toast(effective==='service'?'Equipment invoices only. Service-work invoices cannot be imported.':effective==='noninventory'?'No tracked equipment found. Excluded accessory-only invoices cannot be imported.':'Confirm whether this is an Equipment invoice or Service invoice before saving.');\n},true);\n";
    src=replaceOnce(src,'// Final evidence gate runs before the existing save handler.',gate+'// Final evidence gate runs before the existing save handler.','invoice classification save gate');

    src+='\ntry{installParseAuditWrappers();configureInvoiceFileInputs();}catch(e){console.warn(\'V6.69 optional audit/file-input setup skipped\',e);}\n';
    const blob=new Blob([src],{type:'text/javascript'}),url=URL.createObjectURL(blob);
    try{await import(url);}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(err){
    console.error('AV Inventory Hub V6.79 startup error:',err);
    const box=document.createElement('div');
    box.style.cssText='position:fixed;inset:20px;z-index:99999;background:#fff;border:1px solid #d33;border-radius:12px;padding:20px;font:14px/1.5 Arial;color:#222;box-shadow:0 10px 30px #0002';
    box.innerHTML='<b>AV Inventory Hub V6.79 could not start.</b><br>The verified V6.55 base was left untouched in Git history.<br><br><code>'+String(err.message||err).replace(/[&<>]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[s]))+'</code>';
    document.body.appendChild(box);
  }
}


const V667_RELEASE_NOTES=[
  'AUTO-* SKU values are rejected at parse, review and save; no random SKU is generated',
  'Printed model codes are recovered only when supported by invoice evidence',
  'Support/coverage, stands and labour rows are excluded before physical inventory save',
  'Legacy AUTO-* items can be repaired on a future matching import only when the replacement is collision-free',
  'Startup hotfix: accessory-exclusion helper is injected exactly once to prevent duplicate identifier failure',
  'Service-only invoices are blocked before Review and nothing is imported',
  'Security locks, safety wires, mounts, brackets, cables, lamp kits, carts and stands are excluded from Inventory imports',
  'Accessory-only invoices are blocked when no tracked AV equipment remains',
  'Scanned AV Media service invoices no longer create gibberish inventory rows from FAX/address/header OCR fragments',
  'Full-page SINGLE_BLOCK OCR is added as a recovery candidate for low-quality scanned PDFs',
  'Clear labour/installation-only invoices are classified as Service even when descriptions mention existing AV equipment',
  'Service-only invoices show no inventory line cards and Confirm & save remains disabled',
  'AV Media dates are left blank for manual review when only an unlabelled/footer date is readable, instead of guessing',
  'OCR variants such as VINI7-047976 are normalised to VIN17-047976 when the pattern is unambiguous',
  'Inventory cards now use original identity-based sketch illustrations instead of downloading or tracing web product photos',
  'Manual image URLs remain authoritative and are never overwritten by generated sketches',
  'Startup hotfix: corrected the verified V6.55 Inventory-row patch marker so the patch loader can initialise normally',
  'SKU/model maximum increased from 12 to 13 characters across import fallback, review inputs and Inventory display',
  'Inventory edited Description now appears immediately beneath SKU/item without changing item identity or purchase matching',
  'Import processing now has a real Cancel processing button that safely stops unsaved work by reloading before any save stage',
  'Cancel processing is hidden during Confirm & save so database writes cannot be interrupted mid-save',
  'Documents can be reorganised into collapsible supplier/company groups without moving or rewriting stored files',
  'Reorganise supports Standard list, Group by company, and Company A–Z / Z–A display order',
  'Document search and existing newest/oldest sorting continue to work before supplier grouping is applied',
  'Serial-number fields now remove SKU/model identifiers accidentally merged by OCR',
  'Serial confidence warnings clear when the remaining serial is explicitly labelled in the invoice',
  'Recent Activities All users filter width matches the date filter without changing the global layout',
  'Actual AV Media PDF fix: targeted high-resolution OCR for header and product table',
  'Rejects letter-spaced/gibberish OCR names before inventory save',
  'Verified AV Media rows keep real printed product codes and exclude installation work',
  'Conservative automatic categories for clear equipment types',
  'Import drop zone reduced to 50% width and centred',
  'Safe 13-character SKU fallback from verified standard item names when no printed model is available',
  'Visible inventory Edit button for correcting SKU/item/category/details',
  'Modal alerts moved into the active dialog top layer for clear visibility',
  'Invoice date recovery supports 7-Dec-20 and related month-name formats',
  'Inventory descriptions strip accounting and table metadata contamination',
  'Invoice-only validation restored: Delivery Orders / Delivery Notes and non-invoice documents are blocked',
  'A Delivery Order number/reference inside a genuine invoice is still allowed',
  'Delivery/return-trip/courier/freight/transport rows are excluded from inventory',
  'SKU/model is capped at 13 characters and long description text is no longer stored as SKU',
  'Documents display DD/MM/YYYY-Company name; stored/downloaded filenames use DD-MM-YYYY-Company-name',
  'Import hotfix: async extraction helpers are now registered under the names the import workflow calls',
  'extractInvoiceFile undefined error is fixed for PDF, image and DOCX imports',
  'Startup compatibility fixed: app.js now works with both classic and module script tags',
  'Patch Notes content is repopulated defensively after startup',
  'Invoice import controls are restored when the previous script tag was not a module',
  'PDF, JPG/JPEG, PNG, WEBP and DOCX drag-and-drop routing is enabled',
  'Non-PDF source files keep their real extension instead of being renamed to .pdf',
  'Golden-corpus parsing, OCR fallback, invoice classification, hashing and audit improvements from v6.62 are retained'
];
function v667EnsurePatchNotesUi(){
  try{
    window.__AV_INVENTORY_VERSION__='6.79';
    const cv=document.getElementById('releaseCurrentVersion'),av=document.getElementById('appVersion'),notes=document.getElementById('releaseCurrentNotes');
    if(cv)cv.textContent='v6.79';if(av)av.textContent='Version 6.79';
    if(notes&&!notes.children.length)notes.innerHTML=V667_RELEASE_NOTES.map(x=>'<li>'+x.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</li>').join('');
  }catch(e){console.warn('V6.79 patch-notes fallback skipped',e);}
}
document.addEventListener('click',e=>{if(e.target.closest?.('#patchNotesBtn'))setTimeout(v667EnsurePatchNotesUi,0);},true);
setTimeout(v667EnsurePatchNotesUi,0);

function v667ApplySkuInputLimits(){
  document.querySelectorAll('#itemSku,#parsedItems input[data-field="sku"],#parsedItems input[name*="sku" i]').forEach(el=>{el.maxLength=13;if(el.value.length>13)el.value=el.value.slice(0,13);});
  document.querySelectorAll('#parsedItems input').forEach(el=>{const wrap=el.closest('label,.field,.parsed-field,.parsed-line,.line-item,.parsed-item');const text=wrap?.textContent||'';if(/SKU\s*\/\s*model/i.test(text)){el.maxLength=13;if(el.value.length>13)el.value=el.value.slice(0,13);}});
}
document.addEventListener('input',e=>{const el=e.target;if(!(el instanceof HTMLInputElement))return;if(el.id==='itemSku'||el.dataset?.field==='sku'||/sku/i.test(el.name||'')){if(el.value.length>13)el.value=el.value.slice(0,13);}},true);
const v667SkuObserver=new MutationObserver(v667ApplySkuInputLimits);
document.addEventListener('DOMContentLoaded',()=>{v667SkuObserver.observe(document.body,{childList:true,subtree:true});v667ApplySkuInputLimits();},{once:true});


function v667ApplyImportUi(){
  const dz=document.getElementById('dropZone');if(dz){dz.style.width='50%';dz.style.maxWidth='760px';dz.style.minWidth='320px';dz.style.marginLeft='auto';dz.style.marginRight='auto';dz.style.boxSizing='border-box';const strong=dz.querySelector('strong');if(strong&&/Drop a PDF here/i.test(strong.textContent||''))strong.textContent='Drop an invoice file here';}
}
document.addEventListener('click',e=>{if(e.target.closest?.('#importBtn,#sidebarImportBtn,[data-empty-import]'))setTimeout(v667ApplyImportUi,0);},true);
setTimeout(v667ApplyImportUi,0);
const v667UiObserver=new MutationObserver(v667ApplyImportUi);document.addEventListener('DOMContentLoaded',()=>v667UiObserver.observe(document.body,{childList:true,subtree:true}),{once:true});


function v668MatchAuditFilterWidths(){
  const user=document.getElementById('auditUser'),date=document.getElementById('auditDate');
  if(!user||!date)return;
  const width=Math.round(date.getBoundingClientRect().width);
  if(width>0){
    user.style.setProperty('width',width+'px','important');
    user.style.setProperty('max-width',width+'px','important');
    user.style.setProperty('min-width','0','important');
  }
}
document.addEventListener('click',e=>{if(e.target.closest?.('[data-view="audit"],[data-go="audit"]'))setTimeout(v668MatchAuditFilterWidths,0);},true);
window.addEventListener('resize',()=>v668MatchAuditFilterWidths(),{passive:true});
setTimeout(v668MatchAuditFilterWidths,0);


// V6.69 — non-invasive UI enhancements.
// Cancellation deliberately uses a page reload only while extraction/OCR is running.
// This avoids touching the existing parser transaction/save code and guarantees no
// half-completed client-side OCR worker can continue after cancellation.
const V669_DOC_LAYOUT_KEY='av-inventory-doc-layout-v669';
const V669_DOC_GROUP_ORDER_KEY='av-inventory-doc-group-order-v669';
const V669_CANCEL_REOPEN_KEY='av-inventory-reopen-import-v669';

function v669SupplierGroupKey(name=''){
  return String(name||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('en-SG');
}
function v669EscapeHtml(v=''){
  return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function v669InstallStyles(){
  if(document.getElementById('v669Styles'))return;
  const st=document.createElement('style');st.id='v669Styles';st.textContent=`
    #v669ImportCancelBtn{margin:10px auto 0;display:flex;align-items:center;justify-content:center;gap:6px;min-width:150px}
    #v669ImportCancelBtn.hidden{display:none!important}
    #documentsReorganiseWrap{position:relative;display:inline-flex;align-items:center}
    #documentsReorganiseWrap details{position:relative}
    #documentsReorganiseWrap summary{list-style:none;cursor:pointer;display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
    #documentsReorganiseWrap summary::-webkit-details-marker{display:none}
    #v669ReorganiseMenu{position:absolute;right:0;top:calc(100% + 8px);z-index:80;min-width:245px;padding:10px;background:#fff;border:1px solid #dbe4ef;border-radius:12px;box-shadow:0 14px 34px rgba(15,23,42,.16)}
    #v669ReorganiseMenu button{display:flex;width:100%;border:0;background:transparent;padding:9px 10px;border-radius:8px;text-align:left;cursor:pointer;font:inherit;color:inherit}
    #v669ReorganiseMenu button:hover{background:#f3f7fb}
    #v669ReorganiseMenu button.active{background:#edf5ff;color:#075cca;font-weight:700}
    #v669ReorganiseMenu hr{border:0;border-top:1px solid #e5ebf2;margin:8px 0}
    #v669ReorganiseMenu label{display:grid;gap:6px;padding:3px 10px 7px;font-size:12px;color:#526171}
    #v669ReorganiseMenu select{width:100%;padding:8px 10px;border:1px solid #d6dfeb;border-radius:8px;background:#fff;font:inherit;color:#152238}
    .v669-doc-groups{display:grid;gap:12px}
    .v669-doc-group{border:1px solid #dfe7f1;border-radius:12px;overflow:hidden;background:#fff}
    .v669-doc-group-toggle{width:100%;display:flex;justify-content:space-between;align-items:center;gap:12px;border:0;background:#f7faff;padding:12px 14px;text-align:left;cursor:pointer;color:#152238;font:inherit}
    .v669-doc-group-toggle strong{font-size:14px}.v669-doc-group-toggle span{font-size:12px;color:#607087;white-space:nowrap}
    .v669-doc-group-body.hidden{display:none}
    .v669-doc-group-body .table-wrap,.v669-doc-group-body table{margin:0}
    @media(max-width:760px){#documentsReorganiseWrap{width:100%}#documentsReorganiseWrap details,#documentsReorganiseWrap summary{width:100%}#v669ReorganiseMenu{left:0;right:auto;min-width:min(280px,90vw)}}
  `;document.head.appendChild(st);
}

function v669ImportIsCancellable(){
  const progress=document.getElementById('importProgress'),steps=document.getElementById('importSteps');
  if(!progress||progress.classList.contains('hidden'))return false;
  const text=String(document.getElementById('progressText')?.textContent||'').toLowerCase();
  const step=String(steps?.dataset?.step||'').toLowerCase();
  // Never interrupt database/storage writes.
  if(step==='save'||/\b(?:saving|saved|uploading to storage|writing|confirm & save)\b/i.test(text))return false;
  return true;
}
function v669EnsureImportCancelButton(){
  const progress=document.getElementById('importProgress');if(!progress)return;
  let btn=document.getElementById('v669ImportCancelBtn');
  if(!btn){
    btn=document.createElement('button');btn.id='v669ImportCancelBtn';btn.type='button';btn.className='secondary';btn.textContent='Cancel processing';
    btn.addEventListener('click',()=>{
      if(!v669ImportIsCancellable())return;
      btn.disabled=true;btn.textContent='Cancelling…';
      try{sessionStorage.setItem(V669_CANCEL_REOPEN_KEY,String(Date.now()));}catch(_){ }
      // A full reload is intentionally used here: it tears down PDF.js/Tesseract workers,
      // pending client tasks and object URLs without interrupting the existing save path.
      setTimeout(()=>window.location.reload(),30);
    });
    progress.appendChild(btn);
  }
  btn.classList.toggle('hidden',!v669ImportIsCancellable());
}
function v669ResumeImportAfterCancel(){
  let ts=0;try{ts=Number(sessionStorage.getItem(V669_CANCEL_REOPEN_KEY)||0);}catch(_){return;}
  if(!ts)return;if(Date.now()-ts>30000){try{sessionStorage.removeItem(V669_CANCEL_REOPEN_KEY);}catch(_){}return;}
  let tries=0;const timer=setInterval(()=>{
    tries++;
    const dialog=document.getElementById('importDialog');
    if(dialog?.open){try{sessionStorage.removeItem(V669_CANCEL_REOPEN_KEY);}catch(_){}clearInterval(timer);return;}
    const gate=document.getElementById('authGate');if(gate&&!gate.classList.contains('hidden')){if(tries>80)clearInterval(timer);return;}
    const btn=document.getElementById('sidebarImportBtn')||document.getElementById('importBtn');
    if(btn)btn.click();
    if(tries>80){try{sessionStorage.removeItem(V669_CANCEL_REOPEN_KEY);}catch(_){}clearInterval(timer);}
  },250);
}

function v669DocumentLayoutMode(){try{return localStorage.getItem(V669_DOC_LAYOUT_KEY)||'standard';}catch(_){return'standard';}}
function v669DocumentGroupOrder(){try{return localStorage.getItem(V669_DOC_GROUP_ORDER_KEY)||'az';}catch(_){return'az';}}
function v669RequestDocumentsRender(){
  const sort=document.getElementById('documentSort');if(!sort)return;
  sort.dispatchEvent(new Event('change',{bubbles:true}));
}
function v669UpdateReorganiseMenu(){
  const mode=v669DocumentLayoutMode();
  document.querySelectorAll('[data-v669-doc-layout]').forEach(b=>b.classList.toggle('active',b.dataset.v669DocLayout===mode));
  const sel=document.getElementById('v669CompanyOrder');if(sel){sel.value=v669DocumentGroupOrder();sel.disabled=mode!=='company';}
  const label=document.getElementById('v669ReorganiseLabel');if(label)label.textContent=mode==='company'?'Grouped by company':'Reorganise';
}
function v669EnsureReorganiseControls(){
  const toolbar=document.querySelector('#documentsView .documents-toolbar'),sort=document.getElementById('documentSort');if(!toolbar||!sort)return;
  if(document.getElementById('documentsReorganiseWrap')){v669UpdateReorganiseMenu();return;}
  const wrap=document.createElement('div');wrap.id='documentsReorganiseWrap';
  wrap.innerHTML=`<details id="v669ReorganiseDetails"><summary class="secondary toolbar-btn" type="button"><span id="v669ReorganiseLabel">Reorganise</span><span aria-hidden="true">▾</span></summary><div id="v669ReorganiseMenu"><button type="button" data-v669-doc-layout="standard">Standard list</button><button type="button" data-v669-doc-layout="company">Group by company</button><hr><label>Company order<select id="v669CompanyOrder"><option value="az">Company A → Z</option><option value="za">Company Z → A</option></select></label></div></details>`;
  sort.insertAdjacentElement('afterend',wrap);
  wrap.addEventListener('click',e=>{
    const b=e.target.closest('[data-v669-doc-layout]');if(!b)return;
    try{localStorage.setItem(V669_DOC_LAYOUT_KEY,b.dataset.v669DocLayout);}catch(_){}
    v669UpdateReorganiseMenu();v669RequestDocumentsRender();
    const d=document.getElementById('v669ReorganiseDetails');if(d)d.open=false;
  });
  wrap.querySelector('#v669CompanyOrder')?.addEventListener('change',e=>{try{localStorage.setItem(V669_DOC_GROUP_ORDER_KEY,e.target.value);}catch(_){}v669RequestDocumentsRender();});
  v669UpdateReorganiseMenu();
}
function v669ApplyDocumentGrouping(){
  v669EnsureReorganiseControls();
  if(v669DocumentLayoutMode()!=='company')return;
  const host=document.getElementById('documentsTable');if(!host)return;
  const table=host.querySelector(':scope > table');if(!table||host.querySelector(':scope > .v669-doc-groups'))return;
  const head=table.querySelector('thead');const rows=[...table.querySelectorAll('tbody > tr')];if(!rows.length)return;
  const groups=new Map();
  for(const row of rows){
    const supplier=String(row.children?.[1]?.textContent||'Unknown supplier').replace(/\s+/g,' ').trim()||'Unknown supplier';
    const key=v669SupplierGroupKey(supplier);if(!groups.has(key))groups.set(key,{name:supplier,rows:[]});groups.get(key).rows.push(row);
  }
  let list=[...groups.values()];const dir=v669DocumentGroupOrder()==='za'?-1:1;list.sort((a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'})*dir);
  const holder=document.createElement('div');holder.className='v669-doc-groups';
  for(const g of list){
    const section=document.createElement('section');section.className='v669-doc-group';
    const toggle=document.createElement('button');toggle.type='button';toggle.className='v669-doc-group-toggle';toggle.setAttribute('aria-expanded','true');toggle.innerHTML=`<strong>${v669EscapeHtml(g.name)}</strong><span>${g.rows.length} invoice${g.rows.length===1?'':'s'} ▾</span>`;
    const body=document.createElement('div');body.className='v669-doc-group-body';
    const groupedTable=document.createElement('table');if(head)groupedTable.appendChild(head.cloneNode(true));const tb=document.createElement('tbody');g.rows.forEach(r=>tb.appendChild(r));groupedTable.appendChild(tb);body.appendChild(groupedTable);
    toggle.addEventListener('click',()=>{const hidden=body.classList.toggle('hidden');toggle.setAttribute('aria-expanded',String(!hidden));const span=toggle.querySelector('span');if(span)span.textContent=`${g.rows.length} invoice${g.rows.length===1?'':'s'} ${hidden?'▸':'▾'}`;});
    section.append(toggle,body);holder.appendChild(section);
  }
  host.replaceChildren(holder);
}
function v669InstallDocumentObserver(){
  const host=document.getElementById('documentsTable');if(!host||host.dataset.v669Observed==='1')return;host.dataset.v669Observed='1';
  let queued=false;const obs=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;v669ApplyDocumentGrouping();});});obs.observe(host,{childList:true});v669ApplyDocumentGrouping();
}
function v669InstallImportObserver(){
  const progress=document.getElementById('importProgress'),steps=document.getElementById('importSteps');
  if(progress&&progress.dataset.v669Observed!=='1'){progress.dataset.v669Observed='1';const obs=new MutationObserver(v669EnsureImportCancelButton);obs.observe(progress,{attributes:true,childList:true,subtree:true,characterData:true});}
  if(steps&&steps.dataset.v669Observed!=='1'){steps.dataset.v669Observed='1';const obs=new MutationObserver(v669EnsureImportCancelButton);obs.observe(steps,{attributes:true});}
  v669EnsureImportCancelButton();
}
function v669InstallUiEnhancements(){
  v669InstallStyles();v669EnsureReorganiseControls();v669InstallDocumentObserver();v669InstallImportObserver();v669ResumeImportAfterCancel();
  document.addEventListener('click',e=>{
    if(e.target.closest?.('[data-view="documents"],[data-go="documents"]'))setTimeout(()=>{v669EnsureReorganiseControls();v669ApplyDocumentGrouping();},0);
    if(e.target.closest?.('#importBtn,#sidebarImportBtn,[data-empty-import]'))setTimeout(v669EnsureImportCancelButton,0);
    if(!e.target.closest?.('#v669ReorganiseDetails'))document.getElementById('v669ReorganiseDetails')?.removeAttribute('open');
  },true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(v669InstallUiEnhancements,0),{once:true});else setTimeout(v669InstallUiEnhancements,0);

launch();
