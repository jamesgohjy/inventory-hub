// AV Inventory Hub V7.03.3.14r — Startup hotfix + evidence verification + human review gate
// This patch loader applies V6.76 safely on top of the verified V6.55 source.
const ORIGINAL_APP_URL='baseline-v6.55-d452.js?v=7.03.3.14r';

// V6.82 deployment marker: set the visible version before the runtime patch loader starts.
const V682_DEPLOYMENT_BUILD='7.03.3.14r';
function v682MarkDeployment(){
  try{
    window.__AV_INVENTORY_VERSION__='7.03.3.14r';
    window.__AV_INVENTORY_BUILD__=V682_DEPLOYMENT_BUILD;
    const cv=document.getElementById('releaseCurrentVersion'),av=document.getElementById('appVersion');
    if(cv)cv.textContent='v7.03.3.14r';
    if(av)av.textContent='Version 7.03.3.14r';
    document.documentElement.dataset.avInventoryVersion='7.03.3.14r';
    document.documentElement.dataset.avInventoryBuild=V682_DEPLOYMENT_BUILD;
  }catch(e){console.warn('V6.82 deployment marker skipped',e);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',v682MarkDeployment,{once:true});else v682MarkDeployment();

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
        if(!desc||!(qty>0))continue;
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
  // V6.81: a mathematically-consistent row can still be a broken PDF text-layer split (e.g. 201 x 4 = 804 instead of 1 x 804).
  // Treat extreme quantity/price splits as a reason to obtain independent image OCR evidence, never as a reason to auto-correct.
  const needsIndependentRowCheck=items.some(x=>{const q=Number(x.quantity),p=Number(x.unit_price),a=Number(x.amount);return x.quantityReviewRequired||x.priceReviewRequired||x.amountReviewRequired||(q>=100&&p>0&&p<10&&a>=100);});
  if(needsIndependentRowCheck)return true;
  const a=Number(d.subtotal),b=Number(d.gst),z=Number(d.total_amount),moneyOk=[a,b,z].every(Number.isFinite)&&Math.abs((a+b)-z)<=.06;
  // Service-only invoices do not need inventory rows, but their invoice number/date/totals still do.
  if(c==='service')return !d.invoice_number||!d.invoice_date||!moneyOk;
  if(!d.supplier_name||!d.invoice_number||!d.invoice_date||!items.length||c==='uncertain')return true;
  if(!moneyOk)return true;
  return false;
}

async function v661EnsureTesseract(){
  if(window.Tesseract)return window.Tesseract;
  await new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-v661-tesseract]');if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';sc.async=true;sc.dataset.v661Tesseract='1';sc.onload=resolve;sc.onerror=()=>reject(new Error('Recovery OCR library could not be loaded.'));document.head.appendChild(sc);});
  if(!window.Tesseract)throw new Error('Recovery OCR library did not initialise.');return window.Tesseract;
}
function v703314nPreprocessCanvas(input){
  const c=document.createElement('canvas');c.width=input.width;c.height=input.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(input,0,0);
  try{const img=ctx.getImageData(0,0,c.width,c.height),d=img.data,hist=new Uint32Array(256);let pixels=0;for(let i=0;i<d.length;i+=4){const g=Math.max(0,Math.min(255,Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2])));hist[g]++;pixels++;}const percentile=p=>{let n=0,target=Math.max(1,Math.floor(pixels*p));for(let i=0;i<256;i++){n+=hist[i];if(n>=target)return i;}return p<.5?0:255;};const low=percentile(.02),high=percentile(.98),span=Math.max(32,high-low);for(let i=0;i<d.length;i+=4){let g=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);g=Math.max(0,Math.min(255,Math.round((g-low)*255/span)));if(g>244)g=255;else if(g<18)g=0;d[i]=d[i+1]=d[i+2]=g;}ctx.putImageData(img,0,0);}catch(err){console.warn('OCR preprocessing could not complete; original image remains available.',err);}return c;
}
async function v661ForceOcrRecovery(file){
  const kind=v662FileKind(file);if(kind==='docx')return false;const T=await v661EnsureTesseract();setProgress(40,'Key invoice fields need a deeper scan — running recovery OCR…');
  const modes=[{key:'recovery-auto',label:'AUTO',psm:T.PSM?.AUTO??'3',texts:[],layouts:[]},{key:'recovery-block',label:'SINGLE_BLOCK',psm:T.PSM?.SINGLE_BLOCK??'6',texts:[],layouts:[]},{key:'recovery-column',label:'SINGLE_COLUMN',psm:T.PSM?.SINGLE_COLUMN??'4',texts:[],layouts:[]},{key:'recovery-sparse',label:'SPARSE_TEXT',psm:T.PSM?.SPARSE_TEXT??'11',texts:[],layouts:[]},{key:'recovery-prep-auto',label:'PREP_AUTO',psm:T.PSM?.AUTO??'3',texts:[],layouts:[],preprocess:true},{key:'recovery-prep-block',label:'PREP_BLOCK',psm:T.PSM?.SINGLE_BLOCK??'6',texts:[],layouts:[],preprocess:true}];
  const canvases=[];
  if(kind==='pdf'){const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';const data=new Uint8Array(await file.arrayBuffer()),pdf=await pdfjs.getDocument({data}).promise;for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),vp=p.getViewport({scale:3.2}),c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);await p.render({canvasContext:c.getContext('2d',{willReadFrequently:true}),viewport:vp}).promise;canvases.push({c,page:i});}}
  else if(kind==='image'){const bmp=await createImageBitmap(file),c=document.createElement('canvas'),scale=Math.min(3,Math.max(1,2400/Math.max(bmp.width,bmp.height)));c.width=Math.round(bmp.width*scale);c.height=Math.round(bmp.height*scale);c.getContext('2d',{willReadFrequently:true}).drawImage(bmp,0,0,c.width,c.height);canvases.push({c,page:1});bmp.close?.();}
  const worker=await T.createWorker('eng');try{for(let ci=0;ci<canvases.length;ci++){for(let mi=0;mi<modes.length;mi++){const {c,page}=canvases[ci],m=modes[mi],pct=42+Math.round(45*((ci*modes.length+mi+1)/(canvases.length*modes.length))),input=m.preprocess?v703314nPreprocessCanvas(c):c;setProgress(pct,`Recovery OCR ${m.label}… page ${page} of ${canvases.length}`);await worker.setParameters({tessedit_pageseg_mode:m.psm,preserve_interword_spaces:'1',user_defined_dpi:'240'});const r=await worker.recognize(input,{}, {text:true,tsv:true,hocr:true,blocks:true});const layout=ocrResultToLayout(r.data||{},page,input.height);m.layouts.push(layout);m.texts.push(String(r.data?.text||'').trim()||layout.rows?.map(x=>x.text).join('\n').trim());}}}finally{await worker.terminate();}
  const recovered=modes.map(m=>{const text=m.texts.join('\n\f\n').trim();return{source:m.key,label:m.label,text,layout:m.layouts,score:ocrTextQuality(text)+m.layouts.reduce((n,l)=>n+layoutInvoiceQuality(l),0)};}).filter(x=>x.text);
  const headerRecovered=[];
  try{
    const existingHeader=recovered.some(x=>globalThis.V7033Patch?.fixDocumentHeader?.({invoice_number:''},x.text)?.invoice_number);
    if(!existingHeader&&canvases[0]?.c){
      const pageCanvas=canvases[0].c,specs=[{key:'recovery-header-right',x:.52,y:0,w:.48,h:.30},{key:'recovery-header-top',x:0,y:0,w:1,h:.36}],hw=await T.createWorker('eng');
      try{outer:for(const spec of specs){const sx=Math.round(pageCanvas.width*spec.x),sy=Math.round(pageCanvas.height*spec.y),sw=Math.max(1,Math.round(pageCanvas.width*spec.w)),sh=Math.max(1,Math.round(pageCanvas.height*spec.h)),c=document.createElement('canvas');c.width=sw;c.height=sh;c.getContext('2d',{willReadFrequently:true}).drawImage(pageCanvas,sx,sy,sw,sh,0,0,sw,sh);for(const psm of [T.PSM?.AUTO??'3',T.PSM?.SINGLE_BLOCK??'6']){await hw.setParameters({tessedit_pageseg_mode:psm,preserve_interword_spaces:'1',user_defined_dpi:'240'});const rr=await hw.recognize(c,{},{text:true}),tx=String(rr.data?.text||'').trim(),hit=globalThis.V7033Patch?.fixDocumentHeader?.({invoice_number:''},tx);if(hit?.invoice_number){headerRecovered.push({source:spec.key,label:'HEADER',text:tx,layout:[],score:1200+ocrTextQuality(tx)});break outer;}}}}finally{await hw.terminate();}
    }
  }catch(headerErr){console.warn('Automatic targeted invoice-header OCR could not complete.',headerErr);}
  const allRecovered=[...recovered,...headerRecovered];state.ocrCandidates=[...(state.ocrCandidates||[]),...allRecovered].sort((a,b)=>b.score-a.score);return allRecovered.length>0;
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
  const acceptable=c=>{c=String(c||'').trim();const legacy=c.length<=MAX_SKU_LENGTH&&(/[A-Za-z]/.test(c)||/^\d{3,12}$/.test(c)),extended=c.length>MAX_SKU_LENGTH&&c.length<=28&&/[A-Za-z]/.test(c)&&/\d/.test(c);return !!c&&/^[A-Z0-9][A-Z0-9+._\/-]{2,}$/i.test(c)&&(legacy||extended)&&printed(c);};
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
  try{if(globalThis.V7033Patch?.isStructuredPhysicalAssetRow?.(x))return false;}catch(_e){}

  // Explicit accessory/support identities. Keep this narrow so equipment is not removed merely
  // because a longer description says a cable/bracket is included in the box.
  // V6.90: microphone stands are tracked inventory. This specific exception must run before generic stand exclusions.
  if(/\b(?:microphone|mic)\s+stands?\b/i.test(evidence))return false;
  const explicit=new RegExp('\\b(?:(?:power\\s+)?adapt(?:er|or)s?|ac\\s+adapt(?:er|or)s?|security\\s+(?:lock|cable)|projector\\s+lock|kensington\\s+lock|safety\\s+(?:wire|cable)|(?:projector|ceiling|wall|speaker|display|monitor|tv)\\s+(?:ceiling\\s+)?mount|ceiling\\s+mount|wall\\s+mount|mounting\\s+bracket|speaker\\s+bracket|projector\\s+bracket|display\\s+bracket|lamp\\s*kits?|lampkits?|replacement\\s+(?:projector\\s+)?lamp|projector\\s+lamp|(?:gravity|rolling|mobile|equipment|av|projector|display|monitor)\\s+cart|trolley|(?:rolling|mobile|floor|speaker|display|monitor|projector|equipment|av)\\s+stand)\\b','i');
  if(explicit.test(evidence))return true;

  const target=primary||evidence;
  if(/\b(?:bracket|mount)\b/i.test(target))return true;
  if(/\b(?:cart|trolley)\b/i.test(target))return true;
  if(/\bstands?\b/i.test(target)&&!/\bstandalone\b/i.test(target)&&!/\b(?:microphone|mic)\s+stands?\b/i.test(target))return true;
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
  const classifySources=()=>{
    const sources=typeof v661EvidenceSources==='function'?v661EvidenceSources(raw):[{source:'raw',text:String(raw||'')}];
    const checks=sources.map(x=>({source:x?.source||'evidence',verdict:globalThis.V7033Patch?.classifyInvoicePage(String(x?.text||''))})).filter(x=>x.verdict);
    const accepted=checks.filter(x=>x.verdict.allowed).sort((a,b)=>(Number(b.verdict.score)||0)-(Number(a.verdict.score)||0));
    return {checks,best:accepted[0]||null};
  };
  let evidence=classifySources();
  if(evidence.best){
    const c=evidence.best.verdict,review=!!(c.reviewRequired||c.disposition==='review');
    state.importDocumentReviewRequired=review;state.importDocumentReviewReason=review?(c.reason||'Invoice-like document needs confirmation.'):'';
    state.importDocumentType={type:review?'invoice_review':'invoice',reason:c.reason||'',invoiceScore:c.score||0,source:evidence.best.source,reviewRequired:review};
    return state.importDocumentType;
  }
  let verdict=detectImportDocumentType(raw);
  const kind=v662FileKind(file);
  if(verdict.type==='uncertain'&&(kind==='pdf'||kind==='image')){
    const already=(state.ocrCandidates||[]).some(x=>String(x.source||'').startsWith('recovery-'));
    if(!already){try{await forceOcrRecovery(file);}catch(e){console.warn('Invoice-type recovery OCR could not complete.',e);}}
    evidence=classifySources();
    if(evidence.best){
      const c=evidence.best.verdict,review=!!(c.reviewRequired||c.disposition==='review');
      state.importDocumentReviewRequired=review;state.importDocumentReviewReason=review?(c.reason||'Invoice-like document needs confirmation.'):'';
      state.importDocumentType={type:review?'invoice_review':'invoice',reason:c.reason||'',invoiceScore:c.score||0,source:evidence.best.source,reviewRequired:review};
      return state.importDocumentType;
    }
    verdict=detectImportDocumentType(raw);
  }
  state.importDocumentReviewRequired=false;state.importDocumentReviewReason='';state.importDocumentType=verdict;
  if(verdict.type==='invoice')return verdict;
  if(verdict.type==='delivery_order')throw new Error('Only invoices can be imported. This document was identified as a Delivery Order / Delivery Note.');
  if(verdict.type==='non_invoice')throw new Error('Only invoices can be imported. This document is not an invoice.');
  throw new Error('The document could not be verified as an Invoice / Tax Invoice after repeated checks. If this is an invoice, confirm the PDF is readable or use a clearer copy.');
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
  const row=/^[|.,;:\-]*\s*(?:[jIl]\s+)?([A-Z0-9][A-Z0-9+._\/-]{2,}(?:\s*-?\s*WT\s+FOR\s+\d+YR)?)\s+(.+?)\s+(\d{1,4}|[Iil|!]{1,2})\s+(\d[\d,]*(?:\.\d{1,2})?)\s+(\d[\d,]*(?:\.\d{0,2})?)\s*[|.,;:]*\s*$/i;
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
    if(sn&&out.length){const serialMatch=String(sn[1]||'').match(/\b([A-Z0-9][A-Z0-9._\/-]{2,}(?:\s+[A-Z0-9][A-Z0-9._\/-]{2,})?)\b/i);const serialEvidence=serialMatch?serialMatch[1].replace(/\s+/g,''):'';const vals=serialEvidence?[serialEvidence]:[];if(vals.length)out[out.length-1].serials=[...new Set([...(parseSerials(out[out.length-1].serials||'')),...vals])].join(', ');continue;}
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
  try{for(let i=0;i<crops.length;i++){const psm=i===0?(T.PSM?.SINGLE_BLOCK??'6'):(T.PSM?.SINGLE_COLUMN??'4');await worker.setParameters({tessedit_pageseg_mode:psm,preserve_interword_spaces:'1',user_defined_dpi:'240'});setProgress(38+i*6,i?'Reading AV Media product table columns…':'Reading AV Media invoice header…');const r=await worker.recognize(crops[i],{}, {text:true});texts.push(String(r.data?.text||'').trim());}}finally{await worker.terminate();}
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

function v690ParseNumberedPricedRows(text=''){
  // Image/OCR fallback for invoices whose first table column is an item number rather than a SKU.
  // Example shape: "1 Clair Lighting DMX-200 Controller 1 $350.00 $350.00".
  const out=[],lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const money=v=>v662MoneyNumber(String(v||'').replace(/\|(\$)/g,'$1'));
  for(const line0 of lines){
    const line=line0.replace(/[\[\]{}]/g,' ').replace(/\s+/g,' ').trim();
    const m=line.match(/^\s*(\d{1,3})\s+(.+?)\s+(\d{1,4})\s+[|/]?\s*(?:S?\$\s*)?(\d[\d,]*[.]\d{2})\s*[|/]?\s*(?:S?\$\s*)?(\d[\d,]*[.]\d{2})\s*$/i);
    if(!m)continue;
    const desc=cleanInventoryDescription(m[2]),qty=Number(m[3]),price=money(m[4]),amount=money(m[5]);
    if(!desc||!(qty>0)||price===null||amount===null||/^(?:subtotal|gst|total|amount due)/i.test(desc))continue;
    // A model token printed inside the description is valid model evidence; otherwise SKU stays blank.
    const models=(desc.match(/\b[A-Z]{1,8}[-_/][A-Z0-9][A-Z0-9._/-]{1,15}\b/gi)||[]).filter(x=>/[A-Za-z]/.test(x)&&/\d/.test(x));
    const sku=models.length===1?models[0]:'';
    out.push(normalizeParsedInvoiceItem({sku,item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:'',v690NumberedEvidence:true}));
  }
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
// V6.86: serial ownership is anchored to the printed SKU/model row, not generic description words.
function v686SerialValuesFromLabelTail(value=''){
  const out=[];
  for(const chunk of String(value||'').split(/[,;]+/)){
    const tokens=String(chunk||'').trim().split(/\s+/),parts=[];
    for(const raw of tokens){
      const t=raw.replace(/^[,;:]+|[,;:]+$/g,'');if(!t)continue;
      if(!/^[A-Z0-9][A-Z0-9._\/-]{1,31}$/i.test(t)||!/\d/.test(t))break;
      parts.push(t);if(parts.join('').length>=32)break;
    }
    const joined=parts.join('');if(joined&&joined.length>=5&&!out.some(v=>v668CompactIdentifier(v)===v668CompactIdentifier(joined)))out.push(joined);
  }
  return out;
}
function v677ReassignSerialsByEvidence(items=[],sourceText=''){
  const out=(items||[]).map(x=>({...x,serials:''}));
  const lines=normalizePdfText(sourceText).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const serialRe=/\b(?:S\s*\/?\s*N|S\.?N\.?|Serial\s*(?:No\.?|Number(?:s)?))\s*[:#.-]?\s*(.*)$/i;
  const serialEvents=[];
  for(let i=0;i<lines.length;i++){const m=lines[i].match(serialRe);if(!m)continue;const vals=v686SerialValuesFromLabelTail(m[1]);if(vals.length)serialEvents.push({i,vals:[...new Set(vals)]});}
  const identity=x=>{const sku=v668CompactIdentifier(x.sku||'');if(sku){const stem=/\d[A-Z]$/i.test(sku)?sku.slice(0,-1):sku;return 'sku:'+stem;}const toks=(String(x.item_name||x.description||'').match(/[A-Z0-9][A-Z0-9+._\/-]{2,}/gi)||[]).map(v668CompactIdentifier).filter(k=>k.length>=4&&!/^(?:ABTUS|PANASONIC|ACTIVE|SPEAKER|PROJECTOR|CONTROL|CONTROLLER|PANEL|WITH|USB)$/i.test(k));return 'desc:'+toks.slice(0,4).join('');};
  const anchors=x=>{const a=[];const sku=v668CompactIdentifier(x.sku||'');if(sku.length>=3){a.push(sku);if(/\d[A-Z]$/i.test(sku))a.push(sku.slice(0,-1));}const toks=(String(x.item_name||x.description||'').match(/[A-Z0-9][A-Z0-9+._\/-]{2,}/gi)||[]).map(v668CompactIdentifier).filter(k=>k.length>=4&&!/^(?:ABTUS|PANASONIC|ACTIVE|SPEAKER|PROJECTOR|CONTROL|CONTROLLER|PANEL|WITH|USB)$/i.test(k));if(toks.length)a.push(toks.slice(0,4).join(''));return [...new Set(a.filter(k=>k.length>=4))];};
  const groups=new Map();for(let i=0;i<out.length;i++){const k=identity(out[i]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);}
  const occurrences=[];
  for(const idxs of groups.values()){
    const keys=[...new Set(idxs.flatMap(i=>anchors(out[i])))];const pos=[];
    for(let i=0;i<lines.length;i++){const compact=v668CompactIdentifier(lines[i]);if(keys.some(k=>compact.includes(k)))pos.push(i);}
    const positions=[...new Set(pos)].sort((a,b)=>a-b);
    if(positions.length<idxs.length){for(const idx of idxs)out[idx].serialReviewRequired=true;continue;}
    for(let gi=0;gi<idxs.length;gi++)occurrences.push({idx:idxs[gi],pos:positions[gi]});
  }
  occurrences.sort((a,b)=>a.pos-b.pos);const seen=new Map();
  for(const ev of serialEvents){
    let owner=null;for(const oc of occurrences){if(oc.pos>=ev.i)break;if(ev.i-oc.pos<=8)owner=oc;}
    if(!owner)continue;const arr=[];
    for(const sn of ev.vals){const key=v668CompactIdentifier(sn);if(!key||arr.some(v=>v668CompactIdentifier(v)===key))continue;const prev=seen.get(key);if(prev!==undefined&&prev!==owner.idx){out[owner.idx].serialReviewRequired=true;out[prev].serialReviewRequired=true;continue;}seen.set(key,owner.idx);arr.push(sn);}
    const existing=String(out[owner.idx].serials||'').split(',').map(x=>x.trim()).filter(Boolean);for(const sn of arr)if(!existing.some(v=>v668CompactIdentifier(v)===v668CompactIdentifier(sn)))existing.push(sn);out[owner.idx].serials=existing.join(', ');
  }
  for(const item of out){const vals=String(item.serials||'').split(',').map(x=>x.trim()).filter(Boolean),q=Number(item.quantity);if(Number.isInteger(q)&&q>0&&vals.length>q){item.serials='';item.serialReviewRequired=true;item.serialCountReview=true;}}
  return out;
}

function v689SerialIntegrityGate(items=[],sourceText=''){
  // V7.03: serials are optional. Blank serials are valid. Preserve uncertainty only when a
  // non-empty serial needs ownership review; recreate blocking conflicts only for confirmed
  // duplicate non-empty normalized serials on different rows.
  const out=(items||[]).map(x=>{const y={...x};delete y.serialConflictReviewRequired;delete y.serialCountReview;if(!parseSerials(y.serials||'').length)delete y.serialReviewRequired;return y;}),seen=new Map();
  for(let i=0;i<out.length;i++){
    const vals=parseSerials(out[i].serials||''),kept=[];
    for(const raw of vals){
      const sn=String(raw||'').trim(),key=v668CompactIdentifier(sn);if(!key)continue;
      if(kept.some(v=>v668CompactIdentifier(v)===key))continue;
      const prev=seen.get(key);
      if(prev!==undefined&&prev!==i){out[i].serialConflictReviewRequired=true;out[prev].serialConflictReviewRequired=true;continue;}
      seen.set(key,i);kept.push(sn);
    }
    out[i].serials=kept.join(', ');
    const q=Number(out[i].quantity);if(Number.isInteger(q)&&q>0&&kept.length>q){out[i].serialCountReview=true;out[i].serialReviewRequired=true;}
  }
  return out;
}

function v689QuantityIntegrityGate(items=[],sourceText=''){
  const lines=normalizePdfText(sourceText).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  return (items||[]).map(raw=>{
    const x={...raw},q=Number(x.quantity),sku=v668CompactIdentifier(x.sku||''),desc=String(x.description||x.item_name||'');
    // Description/spec numbers (lumens, resolution, wattage) are never sufficient quantity evidence.
    if(q>0&&/\b(?:lumens?|ansi|watts?|hz|inch(?:es)?|mm|cm|meters?|metres?)\b/i.test(desc)){
      const qInSpec=new RegExp('\\b'+String(q).replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')+'\\s*(?:lumens?|ansi|watts?|hz|inch(?:es)?|mm|cm|meters?|metres?)\\b','i').test(desc);
      if(qInSpec){
        const evidence=lines.filter(line=>!sku||v668CompactIdentifier(line).includes(sku));
        const confirmed=evidence.some(line=>new RegExp('(?:^|\\s)'+q+'(?:\\s|$)').test(line)&&!new RegExp(q+'\\s*(?:lumens?|ansi|watts?|hz|inch(?:es)?|mm|cm|meters?|metres?)','i').test(line));
        if(!confirmed){x.quantity=null;x.quantityReviewRequired=true;x.quantitySpecCollision=true;}
      }
    }
    return x;
  });
}

function v677ValidateInvoiceLines(items=[],sourceText=''){
  let out=v677ReassignSerialsByEvidence(items,sourceText);
  out=v677VerifyQuantities(out);
  out=v689QuantityIntegrityGate(out,sourceText);
  out=v689SerialIntegrityGate(out,sourceText);
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
    line={...line,sku:String(sku||'').trim().slice(0,28),item_name:itemName,description,category,skuReviewRequired:!sku};
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
  // V6.90: SKU/model and serial numbers are optional. Never fabricate either merely to satisfy save validation.
  // AUTO-* remains forbidden; a missing SKU is preserved as blank and the item name/description remains authoritative.
  return lines.map(line=>{
    const rawSku=String(line.sku||'').trim();
    return {...line,sku:v676IsForbiddenAutoSku(rawSku)?'':rawSku.slice(0,28),serials:String(line.serials||'').trim(),item_name:String(line.item_name||line.description||'').replace(/\s+/g,' ').trim(),description:cleanInventoryDescription(line.description||line.item_name||'')};
  }).filter(line=>String(line.item_name||line.description||'').trim()&&Number(line.quantity)>0);
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
  let rawRows=[];for(const src of v661EvidenceSources(text)){rawRows.push(...parseAvMediaTextItems(src.text),...v661ParseGenericPricedRows(src.text),...v690ParseNumberedPricedRows(src.text),...v662ParsePhysicalEvidenceRows(src.text));}
  rawRows=[...(extractedItems||[]),...rawRows];
  const accessoryRows=rawRows.filter(isExcludedInventoryAccessoryLine);
  let rows=sanitizeParsedInventoryItems(rawRows,evidence);
  const physical=[...(inventoryItems||[]),...rows.filter(x=>!isNonInventoryServiceLine(x)&&!isExcludedInventoryAccessoryLine(x))].filter((x,i,a)=>a.findIndex(y=>norm(y.sku||y.item_name)===norm(x.sku||x.item_name)&&Number(y.amount)===Number(x.amount))===i);
  const service=rows.filter(isNonInventoryServiceLine);
  if(physical.length)return{type:'equipment',equipmentScore:10+physical.length*2,serviceScore:service.length?3:0,reason:'Verified priced tracked-equipment rows were found; service and excluded accessory rows are not added to inventory.'};
  if(rows.length&&service.length===rows.length)return{type:'service',equipmentScore:0,serviceScore:10+service.length*2,reason:'Every verified priced row is labour/service/installation work.'};
  const productHeader=/\b(?:PRODUCT|STOCK)\s*(?:NO\.?|NUMBER|CODE)?\b/i.test(t)&&/\bDESCRIPTION\b/i.test(t)&&/\b(?:QTY|QUANTITY)\b/i.test(t)&&/\b(?:UNIT\s*)?PRICE\b/i.test(t)&&/\bAMOUNT\b/i.test(t);
  const physicalWords=/\b(?:projector|microphone|speaker|control\s+panel|controller|camera|mixer|display|monitor|transmitter|receiver|screen|wireless\s+system|audio\s+tester|amplifier|processor|switcher|rack|visualizer|document\s+camera)\b/i.test(t);
  const rowShape=(evidence.match(/^[A-Z0-9][A-Z0-9+._\/-]{2,}[^\n]*\s\d+(?:\.\d+)?\s+(?:S?\$?\s*)?\d[\d,]*\.\d{2}\s+(?:S?\$?\s*)?\d[\d,]*\.\d{2}\s*$/gmi)||[]).length;
  const serviceStrong=/\b(?:supply\s+)?labou?r\b/i.test(t)||/\b(?:supply\s+to\s+)?replace\b[\s\S]{0,120}\b(?:projector|microphone|speaker|display|screen|equipment)\b/i.test(t)||/\b(?:repair(?:ing|ed)?|dismount(?:ing)?|dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al))\b[\s\S]{0,180}\b(?:install|replace|test|commission)/i.test(t)||/\b(?:service|installation|labou?r)\s+(?:work|works|job|charge|charges|services?)\b/i.test(t);
  const codePhysical=evidence.split(/\n+/).some(line=>/^[|.,;:\-]*\s*[A-Z0-9][A-Z0-9+._\/-]{2,}\s+/.test(line.trim())&&/\b(?:projector|microphone|speaker|control\s+panel|controller|camera|mixer|display|monitor|transmitter|receiver|screen|audio\s+tester|amplifier|processor|switcher|rack|visualizer|document\s+camera)\b/i.test(line)&&!isExcludedInventoryAccessoryLine({item_name:line,description:line})&&/\b\d{1,4}\b/.test(line));
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
  try{const fd=new FormData();fd.append('file',file,file.name);fd.append('parser_version','7.03');const headers={};if(state.session?.access_token)headers.Authorization='Bearer '+state.session.access_token;const r=await fetch(url,{method:'POST',headers,body:fd});if(!r.ok)throw new Error('Server parser '+r.status);const j=await r.json();if(j?.file_sha256)state.importFileHash=j.file_sha256;if(j?.text){state.ocrCandidates=[...(state.ocrCandidates||[]),{source:'server',text:String(j.text),layout:j.layout||[],score:999}];if(j.layout?.length)state.pdfLayout=j.layout;state.serverParseResult=j;return String(j.text);}return null;}catch(e){console.warn('Server parser unavailable; using local extraction.',e);return null;}
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
  const physical=/\b(?:projector|microphone|speaker|control\s+panel|controller|camera|mixer|display|monitor|trolley|transmitter|receiver|screen|audio\s+tester|amplifier|processor|switcher|rack|stand|mount)\b/i;
  const service=/\b(?:labou?r|dismount|dismantl|replace|installation|installing|commission|testing|service\s+work)\b/i;
  for(const line of lines){if(!physical.test(line)||service.test(line))continue;const m=line.match(/^[|.,;:\-]*\s*([A-Z0-9][A-Z0-9+._\/-]{2,})\s+(.+?)\s+(\d{1,4})(\s+.*)?$/i);if(!m)continue;const tail=String(m[4]||'');if(/^\s*(?:ansi\s*)?(?:lumens?|lm|watts?|w|hz|khz|mhz|inch(?:es)?|mm|cm|meters?|metres?|gb|tb|mah)\b/i.test(tail))continue;const sku=cleanVerifiedSku(m[1],text),desc=cleanInventoryDescription(m[2]);if(!sku||!desc)continue;const vals=[...line.matchAll(/(?:S?[$#]?\s*)?(\d[\d,]*[ .]\d{2})/g)].map(x=>v662MoneyNumber(x[1].replace(/ (\d{2})$/,'.$1'))).filter(Number.isFinite);out.push(normalizeParsedInvoiceItem({sku,item_name:desc,description:desc,category:'',unit:'pcs',quantity:Number(m[3]),unit_price:vals.length>=2?vals[vals.length-2]:null,amount:vals.length?vals[vals.length-1]:null,warranty:'',serials:''}));}
  return out;
}
function v662ParseAuditPayload(){const d=state.parsed?.doc||{},c=state.parsed?.invoiceClassification||{};return{parser_version:'7.03',file_sha256:state.importFileHash||'',file_kind:state.importFileKind||'',classification:c.type||'uncertain',classification_reason:c.reason||'',supplier:d.supplier_name||'',invoice_number:d.invoice_number||'',invoice_date:d.invoice_date||'',line_item_count:(state.parsed?.items||[]).length,excluded_service_count:Number(state.parsed?.excludedServiceCount||0),ocr_sources:(state.ocrCandidates||[]).map(x=>x.source).filter(Boolean),created_at:new Date().toISOString()};}
function v662InstallAuditWrappers(){
  if(typeof LocalDB!=='undefined'&&!LocalDB.prototype.__v662Import){const orig=LocalDB.prototype.importPurchase;LocalDB.prototype.importPurchase=async function(doc,purchase,lines,file){const safeLines=prepareInventoryLinesForSave(lines);await v676RepairLegacyAutoSkuMatches(this,safeLines);const audit=v662ParseAuditPayload(),r=await orig.call(this,{...doc,file_sha256:audit.file_sha256,parser_version:'7.03',parse_audit:audit},purchase,safeLines,file);return r;};LocalDB.prototype.__v662Import=true;}
  if(typeof SupabaseDB!=='undefined'&&!SupabaseDB.prototype.__v662Import){const orig=SupabaseDB.prototype.importPurchase;SupabaseDB.prototype.importPurchase=async function(doc,purchase,lines,file){const safeLines=prepareInventoryLinesForSave(lines);await v676RepairLegacyAutoSkuMatches(this,safeLines);const r=await orig.call(this,doc,purchase,safeLines,file);try{const audit=v662ParseAuditPayload();if(r?.document_id){const u=await this.sb.from('documents').update({file_sha256:audit.file_sha256,parser_version:'7.03',parse_audit:audit}).eq('id',r.document_id);if(u.error&&!/column|schema cache/i.test(String(u.error.message||'')))console.warn('Parse audit update failed',u.error);}}catch(e){console.warn('Parse audit metadata could not be stored.',e);}return r;};SupabaseDB.prototype.__v662Import=true;}
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
function v703RenderVerificationNotice(){
  const host=$('parsedItems')?.parentElement||$('reviewArea');if(!host)return;
  const parsed=state.parsed||{},items=parsed.items||[],v7=parsed.v7||parsed.parseEvidence?.v7||{},vr=v7.verification||{},rows=vr.humanReviewRows||[],verificationRows=vr.rows||[];
  const preChoiceType=parsed?.invoiceClassification?.type||'uncertain',preChoiceIncomplete=preChoiceType==='equipment'&&(!items.length||!String(parsed?.doc?.invoice_number||'').trim());
  if(preChoiceIncomplete&&!state.importClassificationChoice){const ph=$('parsedItems');ph?.querySelectorAll('.v703313-level3-item').forEach(x=>x.classList.remove('v703313-level3-item'));ph?.querySelectorAll('.v703313-level3-badge,.v703313-field-warning').forEach(x=>x.remove());ph?.querySelectorAll('.v703313-level3-field').forEach(x=>x.classList.remove('v703313-level3-field'));const pending=$('v703VerificationNotice');if(pending){pending.classList.add('hidden');pending.textContent='';}return;}
  const comp=v7.completenessValidation||parsed.parseEvidence?.completeness||{};
  const documentReview=!!(v7.documentReviewRequired||parsed.documentReviewRequired||state.importDocumentReviewRequired);
  const documentReviewReason=String(v7.documentReviewReason||parsed.documentReviewReason||state.importDocumentReviewReason||'').trim();
  const needs=!!(documentReview||v7.humanReviewRequired||comp.recheckRequired||rows.length);
  const normIdentity=(v='')=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const itemId=(x)=>String(x?.rowId??x?.row_id??x?.verification?.rowId??'').trim();
  const sameIdentity=(a,b)=>{const as=normIdentity(a?.sku),bs=normIdentity(b?.sku);if(as&&bs&&as===bs)return true;const an=normIdentity(a?.item_name||a?.description),bn=normIdentity(b?.item_name||b?.description);return !!an&&!!bn&&(an===bn||an.includes(bn)||bn.includes(an));};
  const allowedFields=new Set(['sku','item_name','description','quantity','unit_price','amount','serials']);
  const fieldMap=new Map(),rowOnly=new Set();
  const addFields=(i,fields={})=>{if(!Number.isInteger(i)||i<0||i>=items.length)return;let set=fieldMap.get(i);if(!set){set=new Set();fieldMap.set(i,set);}for(const [k,v] of Object.entries(fields||{})){if(allowedFields.has(k)&&(v===true||v?.status==='review'))set.add(k);}if(!set.size)rowOnly.add(i);};
  items.forEach((item,i)=>{const f=item?.v7033ReviewFields||{};if(Object.keys(f).length)addFields(i,f);else if(item?.humanReviewRequired===true||item?.needsReview===true)rowOnly.add(i);});
  for(const rr of rows){
    const rid=String(rr?.rowId??'').trim();let matches=[];
    if(rid)matches=items.map((item,i)=>itemId(item)===rid?i:-1).filter(i=>i>=0);
    const sourceRow=rid?verificationRows.find(x=>String(x?.rowId??'').trim()===rid):null;
    if(!matches.length&&sourceRow){const cand=items.map((item,i)=>sameIdentity(item,sourceRow)?i:-1).filter(i=>i>=0);if(cand.length===1)matches=cand;}
    if(!matches.length){const c=rr?.choices||{},probe={sku:c.sku||c.model||c.sku_model||'',item_name:c.item_name||c.standard_item_name||c.name||'',description:c.description||''};if(probe.sku||probe.item_name||probe.description){const cand=items.map((item,i)=>sameIdentity(item,probe)?i:-1).filter(i=>i>=0);if(cand.length===1)matches=cand;}}
    const fields=rr?.fields||sourceRow?.v7033ReviewFields||{};
    if(matches.length===1)addFields(matches[0],fields);else if(matches.length>1){/* ambiguous identity: do not falsely highlight multiple rows */}
  }
  const affected=new Set([...fieldMap.keys(),...rowOnly]);
  const parsedHost=$('parsedItems');
  const fieldLabels={sku:'SKU / model',item_name:'Standard item name',description:'Description',quantity:'Quantity',unit_price:'Unit price',amount:'Amount',serials:'Serial numbers'};
  if(parsedHost)parsedHost.querySelectorAll(':scope > .parsed-row[data-pi]').forEach(row=>{
    const i=Number(row.dataset.pi),on=affected.has(i);row.classList.remove('v703312q-level3-item');row.classList.toggle('v703313-level3-item',on);row.setAttribute('data-level3-review',on?'true':'false');
    row.querySelectorAll('.v703312q-level3-badge,.v703313-level3-badge,.v703313-field-warning').forEach(x=>x.remove());
    row.querySelectorAll('.v703313-level3-field').forEach(x=>x.classList.remove('v703313-level3-field'));
    if(on){const badge=document.createElement('div');badge.className='v703313-level3-badge';badge.textContent='Level 3 — verify highlighted field'+((fieldMap.get(i)?.size||0)===1?'':'s');row.prepend(badge);}
    for(const field of fieldMap.get(i)||[]){const input=row.querySelector('[data-f="'+field+'"]');if(!input)continue;input.classList.add('v703313-level3-field');const label=input.closest('label');if(label){label.classList.add('v703313-level3-field');const w=document.createElement('span');w.className='v703313-field-warning';w.textContent='Verify '+(fieldLabels[field]||field);label.appendChild(w);}}
  });
  let box=$('v703VerificationNotice');
  if(!box){box=document.createElement('div');box.id='v703VerificationNotice';box.style.cssText='margin:0 0 12px;padding:10px 12px;border-radius:10px;border:1px solid #d7a72d;background:#fff8df;color:#5c4700;font-size:13px;line-height:1.45';host.insertBefore(box,$('parsedItems')||host.firstChild);}
  if(!needs){box.classList.add('hidden');box.textContent='';return;}
  const highlighted=[...fieldMap.entries()].flatMap(([i,set])=>[...set].map(f=>'Item '+(i+1)+': '+(fieldLabels[f]||f)));
  const checks=[];
  if(documentReview)checks.push('Confirm that this document is an Invoice / Tax Invoice before saving.'+(documentReviewReason?' '+documentReviewReason:''));
  if(highlighted.length)checks.push('Check the highlighted field(s): '+highlighted.join(', ')+'.');
  if(comp.recheckRequired)checks.push('Check that all physical equipment line items shown on the invoice are included once.');
  if(rows.length&&!affected.size)checks.push('The warning could not be mapped safely to one exact item, so no unrelated field was highlighted. Compare the Parsed Fields with the PDF.');
  box.classList.remove('hidden');
  const intro=documentReview?'The document looks invoice-like, but its document type could not be verified automatically.':'Compare the highlighted Parsed Fields with the source invoice before saving.';
  box.innerHTML='<b>Level 3 — Verification required</b><br>'+intro+(checks.length?'<br><small>'+checks.map(x=>'• '+x).join('<br>')+'</small>':'');
}
async function v661RefreshDuplicateWarning(){
  const d=state.parsed?.doc||{};if(!$('duplicateWarning'))return;
  const dupe=d.supplier_name&&d.invoice_number?await state.db.duplicateInvoice(d.supplier_name,d.invoice_number,d.invoice_date):null;state.possibleDuplicate=dupe;state.allowDuplicate=false;
  $('duplicateWarning').classList.toggle('hidden',!dupe);$('duplicateWarning').innerHTML=dupe?`<strong>This invoice may already exist.</strong> Supplier, Invoice Number and Invoice Date match an existing purchase. <button type="button" id="viewDuplicateBtn">View existing</button> <button type="button" id="continueDuplicateBtn">Continue anyway</button>`:'';
  if(dupe){setTimeout(()=>{const v=$('viewDuplicateBtn'),c=$('continueDuplicateBtn');if(v)v.onclick=()=>showView('documents');if(c)c.onclick=()=>{state.allowDuplicate=true;$('duplicateWarning').innerHTML='<strong>Duplicate override enabled.</strong> Confirm & save will continue.';}},0);}
}


// V6.81 universal invoice intelligence: multi-evidence coordinate/OCR consensus.
// Supplier-specific parsers remain optional recovery helpers; this parser is deliberately supplier-neutral.
function v679StrictLayoutItems(){
  const pages=state.pdfLayout||[],out=[];
  const txt=v=>String(v??'').replace(/\s+/g,' ').trim();
  const clean=v=>txt(v).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
  const strictNum=v=>{const z=txt(v).replace(/(?:SGD|S\$|[$£€¥])/gi,'').replace(/,/g,'');if(!/^-?\d+(?:\.\d{1,2})?$/.test(z))return null;const n=Number(z);return Number.isFinite(n)?n:null;};
  const center=it=>(Number(it.x)||0)+(Number(it.width)||0)/2;
  const headerFor=rows=>{for(const seed of rows){const band=rows.filter(r=>Math.abs((Number(r.y)||0)-(Number(seed.y)||0))<=20),its=band.flatMap(r=>r.items||[]);const first=re=>its.find(it=>re.test(clean(it.text)));const code=first(/^(?:product(?:no)?|product|sku|model|item(?:no)?)$/i)||its.find(it=>/product/i.test(clean(it.text))),desc=first(/^description$/i),qty=first(/^(?:qty|quantity|units?)$/i),price=first(/^(?:unitprice|price)$/i)||its.find(it=>/price/i.test(clean(it.text))),amount=first(/^amount$/i);if(code&&desc&&qty&&price&&amount){const xs=[code,desc,qty,price,amount].map(center);if(xs.every(Number.isFinite)&&xs.every((x,i)=>!i||x>xs[i-1]))return{y:Number(seed.y)||0,xs};}}return null;};
  for(const pg of pages){
    const rows=(pg.rows||[]).filter(r=>Array.isArray(r.items)&&r.items.length),h=headerFor(rows);if(!h)continue;
    const [x0,x1,x2,x3,x4]=h.xs,bounds=[-Infinity,(x0+x1)/2,(x1+x2)/2,(x2+x3)/2,(x3+x4)/2,Infinity];
    const totals=rows.filter(r=>/\b(?:sub\s*total|subtotal|gst|amount\s+due|grand\s+total|invoice\s+total)\b/i.test(r.text||''));
    const total=totals.sort((a,b)=>Math.abs((Number(a.y)||0)-h.y)-Math.abs((Number(b.y)||0)-h.y))[0];
    let dir=total?Math.sign((Number(total.y)||0)-h.y):0;if(!dir){const plus=rows.filter(r=>(Number(r.y)||0)>h.y&&/\d/.test(r.text||'')).length,minus=rows.filter(r=>(Number(r.y)||0)<h.y&&/\d/.test(r.text||'')).length;dir=plus>=minus?1:-1;}
    const pos=r=>((Number(r.y)||0)-h.y)*dir,totalPos=total?pos(total):Infinity;
    const body=rows.filter(r=>pos(r)>2&&pos(r)<totalPos-1).sort((a,b)=>pos(a)-pos(b));
    const cell=(r,col)=>(r.items||[]).filter(it=>{const c=center(it);return c>=bounds[col]&&c<bounds[col+1];});
    const anchors=[];for(const r of body){const code=cell(r,0).map(it=>clean(it.text)).filter(Boolean).join('').trim(),desc=cell(r,1).map(it=>txt(it.text)).filter(Boolean).join(' ').trim();const codeLike=code&&/[A-Za-z]/.test(code)&&/^[A-Za-z0-9][A-Za-z0-9+._\/-]{1,30}$/.test(code)&&!/^(?:SN|SERIAL|DATE|TERMS|TOTAL|SUBTOTAL)$/i.test(code);if(codeLike&&desc)anchors.push({r,code});}
    const uniq=[];for(const a of anchors)if(uniq.every(u=>Math.abs(pos(u.r)-pos(a.r))>Math.max(3,Number(pg.yTolerance)||3)))uniq.push(a);
    for(let i=0;i<uniq.length;i++){
      const p0=pos(uniq[i].r)-Math.max(4,Number(pg.yTolerance)||3),p1=i+1<uniq.length?pos(uniq[i+1].r)-Math.max(4,Number(pg.yTolerance)||3):totalPos,group=body.filter(r=>pos(r)>=p0&&pos(r)<p1);
      let qty=null,price=null,amount=null,warranty='';const desc=[];
      for(const r of group){const d=cell(r,1).map(it=>txt(it.text)).filter(Boolean).join(' ').trim();if(d){if(/\bwarranty\b/i.test(d)){const m=d.match(/\b(\d+)\s*years?\b/i);warranty=m?m[1]+' Years':d;}else if(!/^\s*(?:s\/?n|serial|shipment\s*no)\b/i.test(d))desc.push(d);}if(qty===null){const v=cell(r,2).map(it=>strictNum(it.text)).filter(v=>Number.isInteger(v)&&v>0&&v<=999);if(v.length===1)qty=v[0];}if(price===null){const v=cell(r,3).map(it=>strictNum(it.text)).filter(v=>v!==null&&v>=0);if(v.length===1)price=v[0];}if(amount===null){const v=cell(r,4).map(it=>strictNum(it.text)).filter(v=>v!==null&&v>=0);if(v.length===1)amount=v[0];}}
      // Never derive a value when all three columns were populated: inconsistent source values stay flagged.
      const observed={qty:qty!==null,price:price!==null,amount:amount!==null};
      if(!observed.qty&&price>0&&amount>=0){const r=amount/price,n=Math.round(r);if(n>=1&&n<=999&&Math.abs(r-n)<.001)qty=n;}
      else if(!observed.price&&qty>0&&amount>=0)price=Math.round(amount/qty*100)/100;
      else if(!observed.amount&&qty>0&&price>=0)amount=Math.round(qty*price*100)/100;
      const economicOk=qty>0&&price!==null&&amount!==null&&Math.abs(qty*price-amount)<=Math.max(.02,Math.abs(amount)*.001),description=cleanInventoryDescription(desc.join(' '));if(!description)continue;
      const line=normalizeParsedInvoiceItem({sku:cleanVerifiedSku(uniq[i].code,(state.ocrCandidates||[]).map(x=>x.text||'').join('\n')),item_name:description,description,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty,serials:''});
      line.economicEvidenceVerified=!!economicOk;line.quantityReviewRequired=!economicOk;line.priceReviewRequired=!economicOk;line.amountReviewRequired=!economicOk;line.layoutEvidenceVerified=true;out.push(line);
    }
  }return out;
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



// V6.82 Invoice Normalization Engine.
// Structured data is authoritative. Markdown is a derived, human-readable diagnostic view only.
function v682FieldEvidence(value='',sourceText='',labels=[]){
  const v=String(value??'').trim();if(!v)return{status:'not_found',value:'',labels:[],evidence:[]};
  const lines=normalizePdfText(sourceText||'').split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),hits=[];
  const compact=x=>String(x||'').toLowerCase().replace(/\s+/g,' ');
  for(let i=0;i<lines.length;i++){const line=lines[i],hasValue=compact(line).includes(compact(v)),hasLabel=(labels||[]).some(l=>l&&new RegExp(l,'i').test(line));if(hasValue||hasLabel){hits.push({line:i+1,text:line});if(hits.length>=4)break;}}
  return{status:hits.length?'confirmed':'uncertain',value:v,labels:[...(labels||[])],evidence:hits};
}
function v682NormalizeInvoice(parsed={},sourceText=''){
  const d=parsed.doc||{},raw=normalizePdfText(sourceText||parsed.rawText||parsed.raw||''),classification=parsed.invoiceClassification||{};
  const rows=(parsed.items||[]).map((x,index)=>{
    const serials=parseSerials(x.serials||'');
    const sku=String(x.sku||'').trim(),description=String(x.description||x.item_name||'').trim(),qty=Number(x.quantity);
    const review=!!(x.quantityReviewRequired||x.priceReviewRequired||x.amountReviewRequired||x.serialConflictReviewRequired||x.serialReviewRequired);
    return{line:index+1,sku:sku||null,description:description||null,category:String(x.category||'').trim()||null,quantity:Number.isFinite(qty)&&qty>0?qty:null,unit:String(x.unit||'').trim()||null,unit_price:Number.isFinite(Number(x.unit_price))?Number(x.unit_price):null,amount:Number.isFinite(Number(x.amount))?Number(x.amount):null,warranty:String(x.warranty||'').trim()||null,serial_numbers:serials,evidence_status:review?'uncertain':'confirmed',review_required:review,source:{sku:v682FieldEvidence(sku,raw,['PRODUCT\\s*(?:NO|NUMBER)','SKU','MODEL']),description:v682FieldEvidence(description,raw,['DESCRIPTION']),serial_numbers:serials.map(sn=>v682FieldEvidence(sn,raw,['S\\s*\\/?\\s*N','SERIAL']))}};
  });
  const normalized={schema_version:'1.0',parser_version:'7.03',document:{type:classification.type||'uncertain',classification_reason:classification.reason||'',supplier:d.supplier_name||null,invoice_number:d.invoice_number||null,invoice_date:d.invoice_date||null,currency:d.currency||'SGD',subtotal:Number.isFinite(Number(d.subtotal))?Number(d.subtotal):null,gst:Number.isFinite(Number(d.gst))?Number(d.gst):null,total_amount:Number.isFinite(Number(d.total_amount))?Number(d.total_amount):null},line_items:rows,validation:{invoice_number:v682FieldEvidence(d.invoice_number||'',raw,['INVOICE\\s*(?:NO|NUMBER|#)']),invoice_date:v682FieldEvidence(d.invoice_date||'',raw,['INVOICE\\s*DATE','\\bDATE\\b']),supplier:v682FieldEvidence(d.supplier_name||'',raw,[]),review_required:!d.invoice_number||!d.invoice_date||rows.some(r=>r.review_required),missing_fields:[...(!d.invoice_number?['invoice_number']:[]),...(!d.invoice_date?['invoice_date']:[])]},source:{file_sha256:state.importFileHash||'',file_kind:state.importFileKind||'',ocr_sources:(state.ocrCandidates||[]).map(x=>x.source).filter(Boolean)}};
  return normalized;
}
function v682MarkdownCell(v){return String(v??'').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ').trim();}
function v682InvoiceMarkdown(n={}){
  const d=n.document||{},rows=n.line_items||[],money=v=>v==null?'':Number(v).toFixed(2),out=['# Normalized Invoice','','## Header',`- Document Type: ${v682MarkdownCell(d.type||'uncertain')}`,`- Supplier: ${v682MarkdownCell(d.supplier||'')}`,`- Invoice Number: ${v682MarkdownCell(d.invoice_number||'')}`,`- Invoice Date: ${v682MarkdownCell(d.invoice_date||'')}`,`- Currency: ${v682MarkdownCell(d.currency||'')}`,'','## Line Items','','| # | SKU | Description | Qty | Unit Price | Amount | Serial Number(s) | Evidence |','|---:|---|---|---:|---:|---:|---|---|'];
  for(const r of rows)out.push(`| ${r.line} | ${v682MarkdownCell(r.sku||'')} | ${v682MarkdownCell(r.description||'')} | ${r.quantity??''} | ${money(r.unit_price)} | ${money(r.amount)} | ${v682MarkdownCell((r.serial_numbers||[]).join(', '))} | ${r.evidence_status||'uncertain'} |`);
  out.push('','## Totals',`- Subtotal: ${money(d.subtotal)}`,`- GST: ${money(d.gst)}`,`- Total: ${money(d.total_amount)}`,'','## Validation',`- Review Required: ${n.validation?.review_required?'Yes':'No'}`,`- Missing Fields: ${(n.validation?.missing_fields||[]).join(', ')||'None'}`);
  return out.join('\n');
}
function v682AttachNormalization(parsed={},sourceText=''){
  const normalized=v682NormalizeInvoice(parsed,sourceText);return{...parsed,normalizedInvoice:normalized,normalizedMarkdown:v682InvoiceMarkdown(normalized),parseEvidence:{...(parsed.parseEvidence||{}),normalization_schema:'1.0',normalization_parser:'6.90'}};
}

// V6.84: reconcile independently verified equipment rows across parser candidates.
// A high-scoring candidate may no longer erase a valid row found by another parser.
function v684EconomicSignature(x={}){
  const q=Number(x.quantity),p=Number(x.unit_price),a=Number(x.amount);
  if(!(q>0)||!Number.isFinite(p)||!Number.isFinite(a))return'';
  if(Math.abs(q*p-a)>Math.max(.02,Math.abs(a)*.001))return'';
  return`${q}|${p.toFixed(2)}|${a.toFixed(2)}`;
}
function v684DescriptionKey(x={}){
  return String(x.description||x.item_name||'').toLowerCase().replace(/\b(?:the|a|an|in|with|for|of)\b/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ').slice(0,100);
}
function v684ReconcileCandidateItems(candidates=[],sourceText=''){
  const groups=new Map(),originSet=new Set();
  for(const c of candidates||[]){
    for(const raw of c.items||[]){
      const x=normalizeParsedInvoiceItem(raw),sig=v684EconomicSignature(x);
      if(!sig||x.quantityReviewRequired||x.priceReviewRequired||x.amountReviewRequired)continue;
      const sku=cleanVerifiedSku(x.sku||'',sourceText),desc=v684DescriptionKey(x);
      // Require a printed SKU/model or a substantial description before accepting a union row.
      if(!sku&&desc.length<12)continue;
      const key=sku?'sku:'+sku.toLowerCase().replace(/[^a-z0-9]/g,''):'desc:'+desc;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({x:{...x,sku:sku||''},sig,origin:String(c.origin||'unknown'),score:Number(c.consensusScore||c.score||0)});
    }
  }
  const out=[];
  for(const entries of groups.values()){
    const sigCounts=new Map();for(const e of entries)sigCounts.set(e.sig,(sigCounts.get(e.sig)||0)+1);
    const ranked=[...entries].sort((a,b)=>{const ca=sigCounts.get(a.sig)||0,cb=sigCounts.get(b.sig)||0;return cb-ca||b.score-a.score;});
    const best=ranked[0];if(!best)continue;const agreed=(sigCounts.get(best.sig)||0)>1||entries.length===1;
    const merged={...best.x};
    // Fill only genuinely missing descriptive fields; never overwrite conflicting observed economics.
    for(const e of ranked.slice(1))for(const k of ['sku','item_name','description','category','unit','warranty'])if(!String(merged[k]??'').trim()&&String(e.x[k]??'').trim())merged[k]=e.x[k];
    if(!agreed&&new Set(entries.map(e=>e.sig)).size>1){merged.quantityReviewRequired=true;merged.priceReviewRequired=true;merged.amountReviewRequired=true;merged.reconciliationConflict=true;}
    merged.reconciledOrigins=[...new Set(entries.map(e=>e.origin))];for(const o of merged.reconciledOrigins)originSet.add(o);out.push(merged);
  }
  return{items:out,origins:[...originSet]};
}


// V6.88: evidence-safe recovery for OCR-confused SKU/model glyphs.
// This never creates a row. It only normalizes the first printed identifier token when
// the same line has verified economics and its description independently supports the model stem.
function v687EvidenceSkuToken(rawToken='',description='',sourceText=''){
  const raw=String(rawToken||'').trim();
  let sku=cleanVerifiedSku(raw,sourceText);if(sku)return sku;
  if(!raw.includes('$'))return '';
  const corrected=raw.replace(/\$/g,'S');
  if(!/^[A-Z0-9][A-Z0-9+._\/-]{2,13}$/i.test(corrected))return '';
  const compact=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const c=compact(corrected),d=compact(description);
  // Require the independently printed description to support at least the model stem.
  // Example: AV$320A + "AVS320 HDMI Control panel" => AVS-320A is evidence-supported.
  const stem=c.replace(/[A-Z]$/,'');
  if(stem.length<5||!d.includes(stem))return '';
  return corrected;
}

function v687ParseEvidencePricedRows(text=''){
  const out=[],lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const moneyNumber=v=>{const z=String(v||'').replace(/(?:SGD|S\$|\$)/gi,'').replace(/,/g,'').trim();const n=Number(z);return Number.isFinite(n)?n:null;};
  const physical=/\b(?:projector|microphone|speaker|control\s+panel|controller|camera|mixer|display|monitor|trolley|transmitter|receiver|screen|audio\s+tester|amplifier|processor|switcher|rack|stand|mount)\b/i;
  const service=/\b(?:labou?r|dismount|dismantl|replace|installation|installing|commission|testing|service\s+work)\b/i;
  for(const line of lines){
    if(!physical.test(line)||service.test(line))continue;
    const vals=[...line.matchAll(/(?:S?\$?\s*)?(\d[\d,]*[.]\d{2})/g)].map(m=>moneyNumber(m[1])).filter(Number.isFinite);
    if(vals.length<2)continue;
    const m=line.match(/^[|.,;:\-]*\s*([^\s]+)\s+(.+?)\s+(\d{1,4})\s+(?:S?\$?\s*)?\d[\d,]*[.]\d{2}\s+(?:S?\$?\s*)?\d[\d,]*[.]\d{2}\s*$/i);
    if(!m)continue;
    const qty=Number(m[3]),price=vals[vals.length-2],amount=vals[vals.length-1],desc=cleanInventoryDescription(m[2]);
    if(!(qty>0)||!desc||Math.abs(qty*price-amount)>Math.max(.02,Math.abs(amount)*.001))continue;
    const sku=v687EvidenceSkuToken(m[1],desc,text);
    // A missing/uncertain SKU is allowed in review, but never fabricated. The line itself is still genuine evidence.
    out.push(normalizeParsedInvoiceItem({sku,item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:'',v687SourceEvidence:true}));
  }
  return out;
}

function v687DetectSourceEquipmentEvidence(sourceText=''){
  const found=new Map(),lines=normalizePdfText(sourceText).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const physical=/\b(?:projector|microphone|speak\w*|panel|camera|mixer|display|monitor|trolley|transmitter|receiver|screen|audio\s+tester|amplifier|processor|switcher|rack|stand|mount)\b/i;
  const service=/\b(?:labou?r|dismount|dismantl|replace|installation|installing|commission|testing|service\s+work)\b/i;
  for(const line of lines){
    if(!physical.test(line)||service.test(line))continue;
    const m=line.match(/^[|.,;:\-]*\s*([^\s]+)\s+(.+)$/);if(!m)continue;
    const rawToken=m[1],desc=m[2],money=[...line.matchAll(/(?:S?\$?\s*)?(\d[\d,]*[.]\d{2})/g)];if(!money.length)continue;
    const rawKey=String(rawToken).toUpperCase().replace(/\$/g,'S').replace(/[^A-Z0-9]/g,'');
    if(rawKey.length<3)continue;
    found.set(rawKey,{rawToken,description:cleanInventoryDescription(desc),evidence:line});
  }
  return [...found.values()];
}

function v687CompletenessReconcile(candidates=[],currentItems=[],sourceText=''){
  const current=(currentItems||[]).map(x=>({...x})),key=x=>{const sig=v684EconomicSignature(x),sku=v668CompactIdentifier(x.sku||''),desc=v684DescriptionKey(x);return sku?'sku:'+sku+'|'+sig:'desc:'+desc+'|'+sig;};
  const have=new Set(current.map(key)),support=new Map();
  for(const c of candidates||[]){
    for(const raw of c.items||[]){
      const x=normalizeParsedInvoiceItem(raw);if(isNonInventoryServiceLine(x)||isExcludedInventoryAccessoryLine(x)||v676IsSupportCoverageLine(x))continue;
      const sig=v684EconomicSignature(x);if(!sig)continue;const k=key(x);if(!support.has(k))support.set(k,[]);support.get(k).push({x,origin:String(c.origin||'unknown')});
    }
  }
  const recovered=[];
  for(const [k,entries] of support){
    if(have.has(k))continue;
    const origins=new Set(entries.map(e=>e.origin));const best=entries[0]?.x;if(!best)continue;
    // Re-add only if two parser origins agree OR the dedicated source-evidence parser verified the priced row.
    const sourceVerified=entries.some(e=>e.x.v687SourceEvidence===true||/^source-evidence:/i.test(e.origin));
    if(origins.size<2&&!sourceVerified)continue;
    const checked=v677ValidateInvoiceLines(attachSerialBlocks([{...best}],sourceText),sourceText)[0];if(!checked)continue;
    recovered.push(checked);current.push(checked);have.add(k);
  }
  const sourceEvidence=v687DetectSourceEquipmentEvidence(sourceText);return{items:sanitizeParsedInventoryItems(inventoryOnlyItems(current),sourceText),expectedEquipmentCount:Math.max(support.size,sourceEvidence.length),candidateExpectedCount:support.size,sourceEvidenceCount:sourceEvidence.length,recoveredCount:recovered.length,recovered,sourceEvidence};
}

function v661FinalizeParsedInvoice(parsed={},raw=''){
  const sources=v661EvidenceSources(parsed.rawText||raw||''),evidence=sources.map(x=>x.text).join('\n');
  let doc=recoverAvMediaHeader({...parsed.doc},evidence);for(const es of sources){const fixed=globalThis.V7033Patch?.fixDocumentHeader?.(doc,es.text||'');if(fixed)doc={...doc,...fixed};if(String(doc.invoice_number||'').trim())break;}doc=v662RecoverMoneyFromText(doc,evidence);
  const savedLayout=state.pdfLayout;let moneyCandidates=[];
  for(const src of sources){state.pdfLayout=src.layout||[];let d=v661RepairInvoiceMoneyFromLayout({...doc});d=v662RecoverMoneyFromText(d,src.text||'');const a=Number(d.subtotal),b=Number(d.gst),c=Number(d.total_amount),ok=[a,b,c].every(Number.isFinite)&&Math.abs((a+b)-c)<=.06;moneyCandidates.push({d,ok,score:(Number.isFinite(a)?1:0)+(Number.isFinite(b)?1:0)+(Number.isFinite(c)?1:0)+(ok?8:0)});}
  state.pdfLayout=savedLayout;moneyCandidates.sort((a,b)=>b.score-a.score);if(moneyCandidates[0])doc=moneyCandidates[0].d;
  const candidates=[];const add=(arr,origin,srcText)=>{const xs=sanitizeParsedInventoryItems((arr||[]).map(normalizeParsedInvoiceItem),srcText||evidence).filter(x=>String(x.item_name||'').trim()&&Number(x.quantity)>0);if(xs.length){const targetedBoost=/^av-targeted:avmedia-targeted$/i.test(String(origin||''))?120:0;candidates.push({origin,items:xs,score:invoiceItemsQuality(xs,doc.subtotal)+targetedBoost});}};
  add(parsed.items||[],'base',parsed.rawText||raw);
  for(const src of sources){const old=state.pdfLayout;state.pdfLayout=src.layout||[];const strict=v679StrictLayoutItems();if(strict.length){const xs=sanitizeParsedInventoryItems(strict,src.text);candidates.push({origin:'strict-layout:'+src.source,items:xs,score:invoiceItemsQuality(xs,doc.subtotal)+v679EconomicQuality(xs)+220});}if(/\bAV\s+MEDIA\b/i.test(src.text)||/av\s+media/i.test(String(doc.supplier_name||''))){add(parseAvMediaTargetedText(src.text),'av-targeted:'+src.source,src.text);add(parseAvMediaMixedLayoutItems(),'av-layout:'+src.source,src.text);add(parseAvMediaTextItems(src.text),'av-text:'+src.source,src.text);}add(v661ParseGenericPricedRows(src.text),'generic-text:'+src.source,src.text);add(globalThis.V7033Patch?.v703314aRecoverStructuredPricedAssetRows?.(src.text,src.source)||[],'stacked-priced:'+src.source,src.text);add(v662ParsePhysicalEvidenceRows(src.text),'physical-evidence:'+src.source,src.text);add(v687ParseEvidencePricedRows(src.text),'source-evidence:'+src.source,src.text);if(typeof parseFlexibleProductLayoutItems==='function')add(parseFlexibleProductLayoutItems(),'flex-layout:'+src.source,src.text);if(typeof parseProductCodeLayoutItems==='function')add(parseProductCodeLayoutItems(),'product-layout:'+src.source,src.text);state.pdfLayout=old;}
  // V6.81: never let a corrupted native PDF text layer win merely because it produced a table-shaped result.
  // Prefer independent image-OCR table evidence when it is internally verified. This is supplier-neutral.
  const econStats=c=>{const rows=c?.items||[];let verified=0,bad=0;for(const x of rows){const q=Number(x.quantity),p=Number(x.unit_price),a=Number(x.amount),ok=q>0&&p>=0&&a>=0&&Math.abs(q*p-a)<=Math.max(.02,Math.abs(a)*.001)&&!x.quantityReviewRequired&&!x.priceReviewRequired&&!x.amountReviewRequired;if(ok)verified++;else bad++;}return{verified,bad};};
  const sourceBoost=o=>/stacked-priced:recovery-block/i.test(o)?760:/stacked-priced:recovery-auto/i.test(o)?720:/stacked-priced:recovery-column/i.test(o)?680:/stacked-priced:recovery-sparse/i.test(o)?620:/strict-layout:recovery-column/i.test(o)?700:/strict-layout:recovery-auto/i.test(o)?600:/strict-layout:recovery-block/i.test(o)?550:/strict-layout:recovery-sparse/i.test(o)?450:/strict-layout:server/i.test(o)?350:0;
  for(const c of candidates){const st=econStats(c);c.verifiedRows=st.verified;c.badRows=st.bad;c.consensusScore=c.score+sourceBoost(c.origin)+(st.verified*80)-(st.bad*220);}
  const strictCandidates=candidates.filter(c=>String(c.origin||'').startsWith('strict-layout:')&&c.items?.length&&c.verifiedRows>0&&c.badRows===0);
  strictCandidates.sort((a,b)=>b.consensusScore-a.consensusScore);candidates.sort((a,b)=>b.consensusScore-a.consensusScore);
  const chosen=strictCandidates[0]||candidates.find(c=>c.verifiedRows>0&&c.badRows===0)||candidates[0];const reconciled=v684ReconcileCandidateItems(candidates,evidence);let extracted=reconciled.items.length?reconciled.items:(chosen?.items||[]);extracted=v679ImproveSkuMatches(extracted,evidence);const withSerials=v677ValidateInvoiceLines(attachSerialBlocks(extracted,evidence),evidence);let inventory=sanitizeParsedInventoryItems(inventoryOnlyItems(withSerials),evidence);const completeness=v687CompletenessReconcile(candidates,inventory,evidence);inventory=completeness.items;
  const physicalSum=inventory.reduce((n,x)=>n+(Number(x.amount)||0),0);
  if(physicalSum>0&&!Number.isFinite(Number(doc.subtotal)))doc.subtotal=Math.round(physicalSum*100)/100;
  doc=v662RecoverMoneyFromText(doc,evidence);
  const classification=classifyInvoiceDocument(evidence,withSerials,inventory);
  const finalItems=['service','noninventory'].includes(classification.type)?[]:inventory;
  const finalized={...parsed,doc,items:finalItems,excludedServiceCount:Math.max(0,withSerials.length-finalItems.length),invoiceClassification:classification,serviceOnlyInvoice:classification.type==='service',nonInventoryOnlyInvoice:classification.type==='noninventory',dateReviewRequired:!doc.invoice_date,rawText:evidence,parseEvidence:{...(parsed.parseEvidence||{}),itemSource:reconciled?.items?.length?'reconciled:'+reconciled.origins.join(','):(chosen?.origin||'none'),candidateCounts:candidates.map(c=>({origin:c.origin,count:c.items.length,score:c.score,verifiedRows:c.verifiedRows,badRows:c.badRows})),completeness:{expectedEquipmentCount:completeness.expectedEquipmentCount,candidateExpectedCount:completeness.candidateExpectedCount,sourceEvidenceCount:completeness.sourceEvidenceCount,finalEquipmentCount:finalItems.length,recoveredCount:completeness.recoveredCount,recheckRequired:completeness.expectedEquipmentCount!==finalItems.length},file_sha256:state.importFileHash||'',file_kind:state.importFileKind||''}};let normalized=v682AttachNormalization(finalized,evidence);try{if(globalThis.AVParserV7){normalized=globalThis.AVParserV7.enhanceParsed({parsed:normalized,raw:parsed.rawText||raw||'',layout:savedLayout||[],evidenceSources:sources.map(x=>({source:x.source||'evidence',text:x.text||'',page:1}))});normalized.parseEvidence={...(normalized.parseEvidence||{}),v7:normalized.v7||null};}}catch(v7err){console.warn('V7 structured parser shadow/merge skipped',v7err);}return normalized;
}

async function v661ReprocessConfirmedEquipmentInvoice(){
  if(!state.parsed)return;state.importClassificationChoice='equipment';
  setProgress(70,'Re-checking line items…');$('importProgress')?.classList.remove('hidden');
  const previous=state.parsed;
  try{
    let raw=previous.raw||previous.rawText||'';
    let reparsed=v661FinalizeParsedInvoice(parseBestInvoice(raw),raw);
    // V6.90: confirming Equipment is an instruction to recover physical line items, not merely change a banner.
    // If the completed evidence still has no tracked item, run the independent page-image OCR route when the source file is available.
    if(!(reparsed.items||[]).length&&state.importSourceFile&&v662FileKind(state.importSourceFile)!=='docx'){
      setProgress(76,'Equipment confirmed — running independent image/table scan…');
      const recovered=await forceOcrRecovery(state.importSourceFile);
      if(recovered){
        const evidence=v661EvidenceSources(raw).map(x=>x.text).filter(Boolean).join('\n');
        raw=evidence||raw;
        reparsed=v661FinalizeParsedInvoice(parseBestInvoice(raw),raw);
      }
    }
    if(!String(reparsed?.doc?.invoice_number||'').trim()&&state.importSourceFile&&v662FileKind(state.importSourceFile)!=='docx'){
      try{
        setProgress(86,'Invoice number still unclear — checking the invoice header…');
        const T=await v661EnsureTesseract(),file=state.importSourceFile,kind=v662FileKind(file);let pageCanvas=null;
        if(kind==='pdf'){
          const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
          const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,p=await pdf.getPage(1),vp=p.getViewport({scale:3.2});
          pageCanvas=document.createElement('canvas');pageCanvas.width=Math.round(vp.width);pageCanvas.height=Math.round(vp.height);await p.render({canvasContext:pageCanvas.getContext('2d',{willReadFrequently:true}),viewport:vp}).promise;
        }else if(kind==='image'){
          const bmp=await createImageBitmap(file),scale=Math.min(3,Math.max(1,2400/Math.max(bmp.width,bmp.height)));pageCanvas=document.createElement('canvas');pageCanvas.width=Math.round(bmp.width*scale);pageCanvas.height=Math.round(bmp.height*scale);pageCanvas.getContext('2d',{willReadFrequently:true}).drawImage(bmp,0,0,pageCanvas.width,pageCanvas.height);bmp.close?.();
        }
        if(pageCanvas){
          const specs=[{key:'recovery-header-right',x:.52,y:0,w:.48,h:.30},{key:'recovery-header-top',x:0,y:0,w:1,h:.36}],worker=await T.createWorker('eng');let recoveredHeader=false;
          try{
            for(const spec of specs){
              const c=document.createElement('canvas'),sx=Math.round(pageCanvas.width*spec.x),sy=Math.round(pageCanvas.height*spec.y),sw=Math.max(1,Math.round(pageCanvas.width*spec.w)),sh=Math.max(1,Math.round(pageCanvas.height*spec.h));c.width=sw;c.height=sh;c.getContext('2d',{willReadFrequently:true}).drawImage(pageCanvas,sx,sy,sw,sh,0,0,sw,sh);
              await worker.setParameters({tessedit_pageseg_mode:T.PSM?.AUTO??'3',preserve_interword_spaces:'1',user_defined_dpi:'240'});
              const rr=await worker.recognize(c,{}, {text:true}),tx=String(rr.data?.text||'').trim(),hit=globalThis.V7033Patch?.fixDocumentHeader?.({invoice_number:''},tx);
              if(hit?.invoice_number){
                state.ocrCandidates=[...(state.ocrCandidates||[]),{source:spec.key,label:'HEADER',text:tx,layout:[],score:1000+ocrTextQuality(tx)}].sort((a,b)=>(b.score||0)-(a.score||0));recoveredHeader=true;break;
              }
            }
          }finally{await worker.terminate();}
          if(recoveredHeader){
            const evidence=v661EvidenceSources(raw).map(x=>x.text).filter(Boolean).join('\n');raw=evidence||raw;
            reparsed=v661FinalizeParsedInvoice(parseBestInvoice(raw),raw);reparsed=globalThis.V7033Patch?.applyParsedFixes?.(reparsed,raw,v661EvidenceSources(raw))||reparsed;
          }
        }
      }catch(headerErr){console.warn('Targeted invoice-header OCR could not complete.',headerErr);}
    }
    // Never destroy already-reviewed valid rows because a reparse produced fewer/no rows.
    if(!(reparsed.items||[]).length&&(previous.items||[]).length)reparsed={...reparsed,items:previous.items};
    reparsed.raw=reparsed.rawText||reparsed.raw||raw;state.parsed=reparsed;
    applyParsedReviewToForm();if(typeof v703RenderVerificationNotice==='function')v703RenderVerificationNotice();await refreshDuplicateWarning();renderImportEligibility();
    if((state.parsed.items||[]).length)toast('Equipment invoice confirmed. Line items and quantities were refreshed automatically.');
    else toast('Equipment confirmed, but no physical line item could be verified. No item was invented.');
  }catch(err){console.warn('Equipment re-check failed.',err);state.parsed=previous;renderImportEligibility();toast('Equipment selected. Existing parsed values were kept because the independent re-check could not complete.');}
  finally{setTimeout(()=>$('importProgress')?.classList.add('hidden'),180);}
}
function v661RenderImportEligibility(){
  const parsed=state.parsed,detected=parsed?.invoiceClassification?.type||'uncertain',hasItems=!!(parsed?.items||[]).length,missingInvoice=!String(parsed?.doc?.invoice_number||'').trim(),incompleteEquipment=detected==='equipment'&&(!hasItems||missingInvoice),isVault=typeof v70339IsVaultDate==='function'&&v70339IsVaultDate(parsed?.doc?.invoice_date||''),effective=incompleteEquipment?(state.importClassificationChoice||'uncertain'):effectiveInvoiceType(),saveBtn=$('saveImportBtn');
  let note=$('invoiceEligibilityWarning');if(!note&&$('parsedItems')){note=document.createElement('div');note.id='invoiceEligibilityWarning';$('parsedItems').parentNode.insertBefore(note,$('parsedItems'));}
  const setStyle=(kind)=>{if(!note)return;const map={danger:['#f5c2c0','#fff1f0','#912018'],warn:['#f6d88a','#fff8df','#854d0e'],info:['#b9d9ff','#eff7ff','#175cd3']},v=map[kind];note.style.cssText=`margin:0 0 14px;padding:12px 14px;border:1px solid ${v[0]};border-radius:10px;background:${v[1]};color:${v[2]};font-size:12px;line-height:1.45`};
  if(note){
    note.classList.remove('hidden');
    if(detected==='service'||effective==='service'){setStyle('danger');note.innerHTML='<strong>Equipment invoices only.</strong> This document contains service / labour / installation charges only and cannot be imported.';}
    else if(detected==='noninventory'||effective==='noninventory'){setStyle('danger');note.innerHTML='<strong>No tracked equipment found.</strong> Security locks, safety wires, mounts, brackets, cables, lamp kits, carts and stands are excluded from Inventory.';}
    else if((detected==='uncertain'||incompleteEquipment)&&!state.importClassificationChoice){setStyle('warn');note.innerHTML='<strong>Invoice type needs confirmation.</strong> '+(incompleteEquipment?'Equipment evidence was found, but one or more required invoice fields or physical line items are still incomplete. Confirm the invoice type to run the recovery scan.':'The parser cannot prove whether this document contains physical equipment. Check the PDF and choose the correct type.')+'<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" class="secondary small-btn" id="chooseEquipmentInvoiceBtn">Equipment invoice</button><button type="button" class="secondary small-btn" id="chooseServiceInvoiceBtn">Service invoice</button></div>';}
    else if((detected==='uncertain'||incompleteEquipment||state.importClassificationChoice==='equipment')&&effective==='equipment'){setStyle('info');note.innerHTML='<strong>Equipment invoice selected.</strong> The app re-checks invoice fields and physical line items before saving. <button type="button" class="link-btn" id="changeInvoiceTypeBtn">Change</button>';}
    else{note.classList.add('hidden');note.innerHTML='';}
  }
  if(saveBtn){const blocked=effective!=='equipment'||(!isVault&&!hasItems);saveBtn.disabled=blocked||!!state.importSaving;saveBtn.title=effective==='service'?'Service-only invoices cannot be imported.':effective==='noninventory'?'This invoice contains no tracked equipment.':effective==='uncertain'?'Confirm the invoice type before saving.':(!isVault&&!hasItems)?'No verified physical inventory line item is available to save.':'';saveBtn.setAttribute('aria-disabled',blocked?'true':'false');}
  const eq=$('chooseEquipmentInvoiceBtn'),svc=$('chooseServiceInvoiceBtn'),chg=$('changeInvoiceTypeBtn');
  if(eq)eq.onclick=async()=>{eq.disabled=true;await reprocessConfirmedEquipmentInvoice();};
  if(svc)svc.onclick=()=>{state.importClassificationChoice='service';renderImportEligibility();const box=$('v703VerificationNotice');if(box){box.classList.add('hidden');box.textContent='';}toast('Marked as service invoice. Saving to inventory is disabled.');};
  if(chg)chg.onclick=()=>{state.importClassificationChoice=null;renderImportEligibility();if(typeof v703RenderVerificationNotice==='function')v703RenderVerificationNotice();};
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

const V703314R_HEADER_ALIGNED_HELPER="function v703314rHeaderAlignedLayoutItems(sourceText=''){\n  const pages=state.pdfLayout||[],out=[],api=globalThis.V7033Patch;if(!api?.v703314rResolveEconomicsFromItems)return out;\n  const center=it=>(Number(it.x)||0)+(Number(it.width)||0)/2,cleanToken=v=>String(v||'').trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\\/-]+$/g,'');\n  for(const pg of pages){const rows=(pg.rows||[]).filter(r=>Array.isArray(r.items)&&r.items.length);for(const seed of rows){\n    if(!/\\bDESCRIPTION\\b/i.test(seed.text||'')&&!seed.items.some(it=>/^DESCRIPTION$/i.test(cleanToken(it.text))))continue;\n    const band=rows.filter(r=>Math.abs((Number(r.y)||0)-(Number(seed.y)||0))<=30),items=band.flatMap(r=>r.items||[]),first=re=>items.find(it=>re.test(cleanToken(it.text)));\n    const code=first(/^(?:PRODUCT|SKU|MODEL|ITEM)$/i)||items.find(it=>/\\bPRODUCT\\b/i.test(cleanToken(it.text))),desc=first(/^DESCRIPTION$/i),qty=first(/^(?:QTY|QUANTITY|UNITS?)$/i),price=first(/^PRICE$/i)||items.find(it=>/PRICE/i.test(cleanToken(it.text))),amount=first(/^AMOUNT$/i);if(!code||!desc||!qty||!price||!amount)continue;\n    const xCode=center(code),xDesc=center(desc),xQty=center(qty),xPrice=center(price),xAmount=center(amount);if(![xCode,xDesc,xQty,xPrice,xAmount].every(Number.isFinite)||!(xCode<xDesc&&xDesc<xQty&&xQty<xPrice&&xPrice<xAmount))continue;\n    const headerY=Number(seed.y)||0,totals=rows.filter(r=>/\\b(?:SUB\\s*TOTAL|SUBTOTAL|GST|AMOUNT\\s+DUE|GRAND\\s+TOTAL|INVOICE\\s+TOTAL)\\b/i.test(r.text||'')),totalRow=totals.sort((a,b)=>Math.abs((Number(a.y)||0)-headerY)-Math.abs((Number(b.y)||0)-headerY))[0];let dir=totalRow?Math.sign((Number(totalRow.y)||0)-headerY):0;if(!dir){const plus=rows.filter(r=>(Number(r.y)||0)>headerY&&/\\d/.test(r.text||'')).length,minus=rows.filter(r=>(Number(r.y)||0)<headerY&&/\\d/.test(r.text||'')).length;dir=plus>=minus?1:-1;}\n    const pos=r=>((Number(r.y)||0)-headerY)*dir,totalPos=totalRow?pos(totalRow):Infinity,body=rows.filter(r=>pos(r)>2&&pos(r)<totalPos-1).sort((a,b)=>pos(a)-pos(b)),bCD=(xCode+xDesc)/2,qtyStart=xQty-Math.max(16,(xPrice-xQty)*.35),anchors=[];\n    for(const r of body){const codeText=(r.items||[]).filter(it=>center(it)<bCD).map(it=>cleanToken(it.text)).filter(Boolean).join(' ').trim(),description=(r.items||[]).filter(it=>center(it)>=bCD&&center(it)<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ').trim(),right=(r.items||[]).some(it=>(Number(it.x)||0)+(Number(it.width)||0)>=qtyStart&&/\\d/.test(String(it.text||''))),codeLike=codeText&&/\\d/.test(codeText)&&(/[A-Za-z]/.test(codeText)||/^\\d{4,}(?:[-/][A-Za-z0-9]+)?$/.test(codeText))&&!/^(?:SERIAL|SHIPMENT|DATE|TERMS|TOTAL|SUBTOTAL)$/i.test(codeText);if(codeLike&&(description||right))anchors.push({row:r,code:codeText});}\n    const uniq=[];for(const a of anchors)if(uniq.every(u=>Math.abs(pos(u.row)-pos(a.row))>Math.max(3,Number(pg.yTolerance)||3)))uniq.push(a);\n    for(let i=0;i<uniq.length;i++){const p0=pos(uniq[i].row)-Math.max(4,Number(pg.yTolerance)||3),p1=i+1<uniq.length?pos(uniq[i+1].row)-Math.max(4,Number(pg.yTolerance)||3):totalPos,group=body.filter(r=>pos(r)>=p0&&pos(r)<p1),rightItems=group.flatMap(r=>r.items||[]).filter(it=>(Number(it.x)||0)+(Number(it.width)||0)>=qtyStart),econ=api.v703314rResolveEconomicsFromItems(rightItems,{qty:xQty,price:xPrice,amount:xAmount});if(!econ.ok)continue;const descParts=[];let warranty='';for(const r of group){const d=(r.items||[]).filter(it=>center(it)>=bCD&&center(it)<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ').trim();if(!d)continue;if(/\\bwarranty\\b|\\bWT\\s+FOR\\b/i.test(d)){const y=d.match(/\\b(\\d+)\\s*years?\\b/i);warranty=y?y[1]+' Years':warranty;continue;}if(!/^\\s*(?:s\\/?n|serial|shipment\\s*no)\\b/i.test(d))descParts.push(d);}const description=cleanInventoryDescription(descParts.join(' '));if(!description)continue;const sku=cleanVerifiedSku(uniq[i].code,sourceText||group.map(r=>r.text||'').join('\\n')),line=normalizeParsedInvoiceItem({sku,item_name:description,description,category:'',unit:'pcs',quantity:econ.quantity,unit_price:econ.unit_price,amount:econ.amount,warranty,serials:''});line.layoutEvidenceVerified=true;line.economicEvidenceVerified=true;line.v703314rHeaderAligned=true;line.quantityReviewRequired=false;line.priceReviewRequired=false;line.amountReviewRequired=false;if(typeof v661IsNonInventoryServiceLine==='function'&&v661IsNonInventoryServiceLine(line))continue;out.push(line);}\n    if(out.length)return out;\n  }}return out;\n}";
const V703314R_INVENTORY_GROUP_HELPER="function v703314rRenderInventoryGroups(groups,head){\n  const host=$('inventoryTable');\n  host.innerHTML='<div class=\"v669-doc-groups\">'+[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'})).map(([company,list])=>`<section class=\"v669-doc-group inventory-company-group\"><button type=\"button\" class=\"v669-doc-group-toggle\" aria-expanded=\"false\"><strong>${esc(company)}</strong><span>${list.length} item${list.length===1?'':'s'} ▸</span></button><div class=\"v669-doc-group-body hidden\"><table>${head}<tbody>${list.map(x=>x.html).join('')}</tbody></table></div></section>`).join('')+'</div>';\n  host.querySelectorAll('.inventory-company-group').forEach(section=>{const toggle=section.querySelector('.v669-doc-group-toggle'),body=section.querySelector('.v669-doc-group-body'),span=toggle?.querySelector('span');if(!toggle||!body)return;toggle.addEventListener('click',()=>{const hidden=body.classList.toggle('hidden');toggle.setAttribute('aria-expanded',String(!hidden));if(span)span.textContent=span.textContent.replace(/[▾▸]\\s*$/,'').trim()+(hidden?' ▸':' ▾');});});\n}";
async function launch(){
  try{
    const r=await fetch(ORIGINAL_APP_URL,{cache:'no-store'});
    if(!r.ok)throw new Error('Unable to load verified V6.55 source ('+r.status+').');
    let src=await r.text();
    if(!src.includes("const APP_VERSION='6.55';"))throw new Error('Verified V6.55 source signature was not found.');

    src=replaceOnce(src,"function imageForItem(item){if(item.image_url)return item.image_url;const c=norm([item.category,item.item_name,item.description,item.sku].join(' '));if(c.includes('projector'))return DASH_ASSETS.projector;if(c.includes('microphone')||c.includes('wireless')||c.includes('audio'))return DASH_ASSETS.microphone;if(c.includes('cable')||c.includes('hdmi'))return DASH_ASSETS.cable;if(c.includes('display')||c.includes('monitor')||c.includes('screen'))return DASH_ASSETS.monitor;return'';}",asPatchedFunction(v672SketchKind,'v672SketchKind')+'\n'+asPatchedFunction(v672SketchSvg,'v672SketchSvg')+'\n'+asPatchedFunction(v672ImageForItem,'imageForItem'),'copyright-safe identity sketch images');
    src=replaceOnce(src,"const toast=(msg)=>{const t=$('toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2500)};","const toast=(msg)=>{const openDialogs=[...document.querySelectorAll('dialog[open]')];const dlg=openDialogs[openDialogs.length-1];if(dlg){let t=dlg.querySelector('.v667-modal-toast');if(!t){t=document.createElement('div');t.className='v667-modal-toast';t.setAttribute('role','status');t.style.cssText='position:fixed;top:22px;left:50%;transform:translateX(-50%);z-index:2147483647;max-width:min(720px,calc(100vw - 40px));background:#10253f;color:#fff;border:1px solid #4c6f96;border-radius:10px;padding:12px 16px;box-shadow:0 10px 30px rgba(0,0,0,.32);font:600 14px/1.4 system-ui,sans-serif;text-align:center;';dlg.appendChild(t);}t.textContent=msg;t.style.display='block';clearTimeout(t._hideTimer);t._hideTimer=setTimeout(()=>{t.style.display='none';},3500);return;}const t=$('toast');if(!t)return;t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),3000)};",'modal-visible toast');
    src=replaceOnce(src,"// AV Inventory Hub V6.55 — evidence-only inventory parsing and verified invoice dates","// AV Inventory Hub V7.00 — Structured parser core + regression-safe migration",'version header');
    src=replaceOnce(src,"const APP_VERSION='6.55';","const APP_VERSION='7.03.3.14r';",'APP_VERSION');
    src=replaceOnce(src,"const currentRole=()=>CFG.mode==='supabase'?(state.profile?.role||'viewer'):'admin';","const currentRole=()=>CFG.mode==='supabase'?String(state.profile?.role||'viewer').trim().toLowerCase():'admin';",'normalize account role');
    src=replaceOnce(src,"if(raw.includes('row-level security')||raw.includes('permission')||raw.includes('admin access required')||raw.includes('editor or admin access required'))return 'Your account role does not allow this action. Please contact an Admin.';","if(raw.includes('row-level security')||raw.includes('permission')||raw.includes('admin access required')||raw.includes('editor or admin access required'))return canEdit()?('Your account is '+currentRole().replace(/^./,c=>c.toUpperCase())+', but Supabase rejected the database/storage write. This is a database policy permission error, not an account-role restriction.'):'Your account role does not allow this action. Please contact an Admin.';",'accurate permission error');
    src=replaceOnce(src,"if(state.importSaving)return;if(!requireEdit())return;collectParsed();","if(state.importSaving)return;if(CFG.mode==='supabase'&&state.session?.user?.id&&state.db?.profileForUser){try{const freshProfile=await state.db.profileForUser(state.session.user.id);if(freshProfile){state.profile=freshProfile;setUserIdentity(state.session);}}catch(roleErr){console.warn('Could not refresh role before import save',roleErr);}}if(!requireEdit())return;collectParsed();",'refresh role before invoice save');
    src=src.replace(/const RELEASE_CURRENT_NOTES=\[[\s\S]*?\];/,`const RELEASE_CURRENT_NOTES=[
  'Improved invoice item detection',
  'Improved quantity accuracy',
  'Improved serial number checks',
  'Better multi-page invoice verification',
  'Microphone stands can be tracked as inventory',
  'Excluded accessories remain excluded',
  'Stronger checks to prevent incorrect auto-filled fields'
];`);

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
    src=replaceOnce(src,"  const layout=(state.pdfLayout?.length?parseLayoutInvoiceItems():[]).map(normalizeParsedInvoiceItem);\n  let items=[supplierSpecific,generic,numbered,layout].sort((a,b)=>invoiceItemsQuality(b,subtotal)-invoiceItemsQuality(a,subtotal))[0]||[];","  const layout=(state.pdfLayout?.length?parseLayoutInvoiceItems():[]).map(normalizeParsedInvoiceItem);\n  const productLayout=(state.pdfLayout?.length?parseProductCodeLayoutItems():[]).map(normalizeParsedInvoiceItem);\n  const flexibleLayout=(state.pdfLayout?.length?parseFlexibleProductLayoutItems():[]).map(normalizeParsedInvoiceItem);\n  const avMediaLayout=(state.pdfLayout?.length&&/AV\\s+MEDIA/i.test(flat)?parseAvMediaMixedLayoutItems():[]).map(normalizeParsedInvoiceItem);\n  const avMediaText=(/AV\\s+MEDIA/i.test(flat)?parseAvMediaTextItems(flat):[]).map(normalizeParsedInvoiceItem);\n  const numberedOcr=v690ParseNumberedPricedRows(flat).map(normalizeParsedInvoiceItem);\n  let items=[supplierSpecific,generic,numbered,layout,productLayout,flexibleLayout,avMediaLayout,avMediaText,numberedOcr].sort((a,b)=>invoiceItemsQuality(b,subtotal)-invoiceItemsQuality(a,subtotal))[0]||[];",'parser candidate list');
    src=replaceOnce(src,"  if(/^(sold\\s*to|bill\\s*to|ship\\s*to|invoice|inv|invoice\\s*(no|number)|date)$/i.test(invoice))invoice='';","  if(/^(sold\\s*to|bill\\s*to|ship\\s*to|invoice|inv|invoice\\s*(no|number)|date|customer|customer\\s*code|reference|ref|terms)$/i.test(invoice))invoice='';",'invoice-header contamination guard');
    src=replaceOnce(src,"  if(/^(sold\\s*to|bill\\s*to|ship\\s*to|invoice|inv|invoice\\s*(no|number)|date|customer|customer\\s*code|reference|ref|terms)$/i.test(invoice))invoice='';","  if(/^(sold\\s*to|bill\\s*to|ship\\s*to|invoice|inv|invoice\\s*(no|number)|date|customer|customer\\s*code|reference|ref|terms)$/i.test(invoice)||!/\\d/.test(invoice)||/(?:payable|receivable|accounts?|attention|address|currency|gst|registration|reference)/i.test(invoice))invoice='';",'invoice number must be identifier-like and contain a digit');
    src=replaceOnce(src,"        if(!token||bad.test(token[1])||parseDate(token[1]))continue;","        if(!token||bad.test(token[1])||parseDate(token[1])||!/\\d/.test(token[1])||/(?:payable|receivable|accounts?|attention|address|currency|gst|registration|reference)/i.test(token[1]))continue;",'do not scan account/header words as invoice numbers');
    src=replaceOnce(src,"    if((!invoice||invoice.length<5||/^(?:V?IN|INV)$/i.test(invoice))&&layoutInvoice&&!/^(?:INV|INVOICE|DATE)$/i.test(layoutInvoice))invoice=layoutInvoice;","    if((!invoice||invoice.length<5||/^(?:V?IN|INV)$/i.test(invoice))&&layoutInvoice&&/\\d/.test(layoutInvoice)&&!/^(?:INV|INVOICE|DATE)$/i.test(layoutInvoice)&&!/(?:payable|receivable|accounts?|attention|address|currency|gst|registration|reference)/i.test(layoutInvoice))invoice=layoutInvoice;",'layout invoice number must contain a digit');

    src=replaceOnce(src,"return `<tr><td><button class=\"item-link\" data-detail=\"${i.id}\"><strong>${esc(i.sku)}</strong><span>${esc(i.item_name)}</span></button>","const skuLabel=String(i.sku||'').trim().length<=28?String(i.sku||'').trim():'—';const itemDisplayDescription=String(i.description||i.item_name||'').trim();return `<tr><td><button class=\"item-link\" data-detail=\"${i.id}\"><strong>${esc(skuLabel)}</strong><span>${esc(itemDisplayDescription)}</span></button>",'13-character SKU display guard');
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

    src=replaceOnce(src,'function cleanupPdfPreview(){',asPatchedFunction(v682FieldEvidence,'v682FieldEvidence')+'\n'+asPatchedFunction(v682NormalizeInvoice,'v682NormalizeInvoice')+'\n'+asPatchedFunction(v682MarkdownCell,'v682MarkdownCell')+'\n'+asPatchedFunction(v682InvoiceMarkdown,'v682InvoiceMarkdown')+'\n'+asPatchedFunction(v682AttachNormalization,'v682AttachNormalization')+'\n'+asPatchedFunction(v665CleanVerifiedSku,'cleanVerifiedSku')+'\n'+asPatchedFunction(v661CleanInventoryDescription,'cleanInventoryDescription')+'\n'+asPatchedFunction(v667PlausibleItemName,'v667PlausibleItemName')+'\n'+asPatchedFunction(v667ShortItemName,'v667ShortItemName')+'\n'+asPatchedFunction(v667InferCategory,'v667InferCategory')+'\n'+asPatchedFunction(v667ParseAvMediaTargetedText,'parseAvMediaTargetedText')+'\n'+asPatchedFunction(v667AddAvMediaTargetedOcr,'addAvMediaTargetedOcr')+'\n'+asPatchedFunction(v661ParseGenericPricedRows,'v661ParseGenericPricedRows')+'\n'+asPatchedFunction(v690ParseNumberedPricedRows,'v690ParseNumberedPricedRows')+'\n'+asPatchedFunction(v662MoneyNumber,'v662MoneyNumber')+'\n'+asPatchedFunction(v662RecoverMoneyFromText,'v662RecoverMoneyFromText')+'\n'+asPatchedFunction(v662FileSha256,'v662FileSha256')+'\n'+asPatchedFunction(v662FileKind,'v662FileKind')+'\n'+asPatchedFunction(v662EnsureJSZip,'v662EnsureJSZip')+'\n'+asPatchedFunction(v662OcrBlob,'v662OcrBlob')+'\n'+asPatchedFunction(v662ExtractDocx,'v662ExtractDocx')+'\n'+asPatchedFunction(v662TryServerInvoiceProcessing,'v662TryServerInvoiceProcessing')+'\n'+asPatchedFunction(v662ExtractInvoiceFile,'extractInvoiceFile')+'\n'+asPatchedFunction(v662ParsePhysicalEvidenceRows,'v662ParsePhysicalEvidenceRows')+'\n'+asPatchedFunction(v662ParseAuditPayload,'v662ParseAuditPayload')+'\n'+asPatchedFunction(v662InstallAuditWrappers,'installParseAuditWrappers')+'\n'+asPatchedFunction(v662ConfigureInvoiceFileInputs,'configureInvoiceFileInputs')+'\n'+asPatchedFunction(v661EvidenceSources,'v661EvidenceSources')+'\n'+asPatchedFunction(v668CompactIdentifier,'v668CompactIdentifier')+'\n'+asPatchedFunction(v668ModelIdentifierKeys,'v668ModelIdentifierKeys')+'\n'+asPatchedFunction(v668ExplicitSerialEvidence,'v668ExplicitSerialEvidence')+'\n'+asPatchedFunction(v668SanitizeSerialAssignments,'sanitizeSerialAssignments')+'\n'+asPatchedFunction(v677VerifyQuantities,'v677VerifyQuantities')+'\n'+asPatchedFunction(v686SerialValuesFromLabelTail,'v686SerialValuesFromLabelTail')+'\n'+asPatchedFunction(v677ReassignSerialsByEvidence,'v677ReassignSerialsByEvidence')+'\n'+asPatchedFunction(v689SerialIntegrityGate,'v689SerialIntegrityGate')+'\n'+asPatchedFunction(v703RenderVerificationNotice,'v703RenderVerificationNotice')+'\n'+asPatchedFunction(v689QuantityIntegrityGate,'v689QuantityIntegrityGate')+'\n'+asPatchedFunction(v677ValidateInvoiceLines,'v677ValidateInvoiceLines')+'\n'+asPatchedFunction(v679StrictLayoutItems,'v679StrictLayoutItems')+'\n'+asPatchedFunction(v679EconomicQuality,'v679EconomicQuality')+'\n'+asPatchedFunction(v679MatchExistingSku,'v679MatchExistingSku')+'\n'+asPatchedFunction(v679ImproveSkuMatches,'v679ImproveSkuMatches')+'\n'+asPatchedFunction(v684EconomicSignature,'v684EconomicSignature')+'\n'+asPatchedFunction(v684DescriptionKey,'v684DescriptionKey')+'\n'+asPatchedFunction(v684ReconcileCandidateItems,'v684ReconcileCandidateItems')+'\n'+asPatchedFunction(v687EvidenceSkuToken,'v687EvidenceSkuToken')+'\n'+asPatchedFunction(v687ParseEvidencePricedRows,'v687ParseEvidencePricedRows')+'\n'+asPatchedFunction(v687DetectSourceEquipmentEvidence,'v687DetectSourceEquipmentEvidence')+'\n'+asPatchedFunction(v687CompletenessReconcile,'v687CompletenessReconcile')+'\n'+asPatchedFunction(v676IsForbiddenAutoSku,'v676IsForbiddenAutoSku')+'\n'+asPatchedFunction(v676ModelCandidatesFromText,'v676ModelCandidatesFromText')+'\n'+asPatchedFunction(v676EmbeddedVerifiedSku,'v676EmbeddedVerifiedSku')+'\n'+asPatchedFunction(v676SafeFallbackSku,'v676SafeFallbackSku')+'\n'+asPatchedFunction(v676IsSupportCoverageLine,'v676IsSupportCoverageLine')+'\n'+asPatchedFunction(v676CanonicalItemName,'v676CanonicalItemName')+'\n'+asPatchedFunction(v676ValidateAndRectifyItems,'v676ValidateAndRectifyItems')+'\n'+asPatchedFunction(v676RepairLegacyAutoSkuMatches,'v676RepairLegacyAutoSkuMatches')+'\n'+asPatchedFunction(v661SanitizeParsedInventoryItems,'sanitizeParsedInventoryItems')+'\n'+asPatchedFunction(v661PrepareInventoryLinesForSave,'prepareInventoryLinesForSave')+'\n'+asPatchedFunction(v661RecoverAvMediaHeader,'recoverAvMediaHeader')+'\n'+asPatchedFunction(v661ClassifyInvoiceDocument,'classifyInvoiceDocument')+'\n'+asPatchedFunction(v661EffectiveInvoiceType,'effectiveInvoiceType')+'\n'+asPatchedFunction(v661ApplyParsedReviewToForm,'applyParsedReviewToForm')+'\n'+asPatchedFunction(v661RefreshDuplicateWarning,'refreshDuplicateWarning')+'\n'+asPatchedFunction(v661FinalizeParsedInvoice,'v661FinalizeParsedInvoice')+'\n'+asPatchedFunction(v661ReprocessConfirmedEquipmentInvoice,'reprocessConfirmedEquipmentInvoice')+'\n'+asPatchedFunction(v661RenderImportEligibility,'renderImportEligibility')+'\n'+asPatchedFunction(v661LooksServiceOnlyDocument,'looksServiceOnlyDocument')+'\n'+asPatchedFunction(v661LayoutMoney,'v661LayoutMoney')+'\n'+asPatchedFunction(v661RepairInvoiceMoneyFromLayout,'v661RepairInvoiceMoneyFromLayout')+'\n'+asPatchedFunction(v661NeedsDeepRecovery,'needsDeepRecovery')+'\n'+asPatchedFunction(v661EnsureTesseract,'v661EnsureTesseract')+'\n'+asPatchedFunction(v661ForceOcrRecovery,'forceOcrRecovery')+'\n'+asPatchedFunction(v665ClassifyDocumentType,'v665ClassifyDocumentType')+'\n'+asPatchedFunction(v665DetectImportDocumentType,'detectImportDocumentType')+'\n'+asPatchedFunction(v665EnsureInvoiceDocument,'ensureInvoiceDocument')+'\n'+asPatchedFunction(v665DisplayDocumentFilename,'displayDocumentFilename')+'\n'+asPatchedFunction(v665StoredDocumentFilename,'v665StoredDocumentFilename')+'\nfunction cleanupPdfPreview(){','import classification, verified SKU, AV Media recovery and OCR helpers');

    src=replaceOnce(src,"async function startImport(file){if(!file)return;if(!requireEdit())return;cleanupPdfPreview();","async function startImport(file){if(!file)return;if(!requireEdit())return;cleanupPdfPreview();state.parsed=null;state.importClassificationChoice=null;state.importSourceFile=file;",'reset invoice-type choice');

    src=replaceOnce(src,"$('dropZone').ondrop=e=>{e.preventDefault();$('dropZone').classList.remove('drag');const f=e.dataTransfer.files[0];if(f?.type==='application/pdf')startImport(f);else toast('Please drop a PDF file.')}","$('dropZone').ondrop=e=>{e.preventDefault();$('dropZone').classList.remove('drag');const f=e.dataTransfer.files[0];if(f&&v662FileKind(f)!=='unsupported')startImport(f);else toast('Supported invoice formats: PDF, JPG/JPEG, PNG, WEBP or DOCX.')}",'multi-format drag and drop');

    src=replaceOnce(src,"const text=await extractPdf(file);const parsedBest=parseBestInvoice(text);state.parsed={...parsedBest,raw:parsedBest.rawText||text};","let text=await extractInvoiceFile(file);if(v662FileKind(file)==='pdf'&&/AV\s+MEDIA/i.test(text)){try{await addAvMediaTargetedOcr(file);}catch(targetErr){console.warn('AV Media targeted OCR skipped',targetErr);}}await ensureInvoiceDocument(file,text);let parsedBest=v661FinalizeParsedInvoice(parseBestInvoice(text),text);if(parsedBest.invoiceClassification?.type==='service')throw new Error('Service invoice detected. Equipment invoices only; this document was not imported.');if(needsDeepRecovery(parsedBest)){try{const recovered=await forceOcrRecovery(file);if(recovered)parsedBest=v661FinalizeParsedInvoice(parseBestInvoice(text),text);}catch(recoveryError){console.warn('Recovery OCR could not complete; keeping best verified parse.',recoveryError);}}state.parsed={...parsedBest,raw:parsedBest.rawText||text};if(state.parsed.invoiceClassification?.type==='service')throw new Error('Service invoice detected. Equipment invoices only; this document was not imported.');",'automatic recovery OCR');

    src=replaceOnce(src,"console.info('Invoice OCR selection',state.parsed.ocrSelection||{source:'text-pdf'});renderParsedItems();const dupe=", "console.info('Invoice OCR selection',state.parsed.ocrSelection||{source:'text-pdf'});state.parsed.items=sanitizeParsedInventoryItems(state.parsed.items||[],state.parsed.raw||text);renderParsedItems();v703RenderVerificationNotice();renderImportEligibility();if(state.parsed.invoiceClassification?.type==='service')toast('Equipment invoices only. This service-work invoice cannot be saved.');else if(state.parsed.invoiceClassification?.type==='uncertain')toast('Invoice type is uncertain. Confirm Equipment or Service before saving.');const dupe=",'eligibility rendering');
    src=replaceOnce(src,",d,state.parsed.items,namedFile);state.lastImportCount=state.parsed.items.length;",",d,prepareInventoryLinesForSave(state.parsed.items),namedFile);state.lastImportCount=state.parsed.items.length;",'verified SKU and no-AUTO save enforcement');
    src=replaceOnce(src,"finally{state.importSaving=false;const saveBtn=$('saveImportBtn');if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Confirm & save';}if($('importProgress'))$('importProgress').classList.add('hidden');}","finally{state.importSaving=false;const saveBtn=$('saveImportBtn');if(saveBtn){saveBtn.textContent='Confirm & save';}renderImportEligibility();if($('importProgress'))$('importProgress').classList.add('hidden');}",'save-button final state');

    const gate=String.raw`
// V7.03 invoice-only + equipment-only + three-layer verification save gate.
$('saveImportBtn').addEventListener('click',e=>{
  if(!state.parsed)return;
  try{collectParsed();}catch(collectErr){console.warn('V7.03 could not collect current review fields',collectErr);}
  const docType=detectImportDocumentType(state.parsed.raw||state.parsed.rawText||'');
  if(docType.type!=='invoice'){e.preventDefault();e.stopImmediatePropagation();toast(docType.type==='delivery_order'?'Only invoices can be imported. Delivery Orders are blocked.':'Only verified invoices can be saved.');return;}
  const detected=state.parsed.invoiceClassification?.type||'uncertain';
  const effective=detected==='uncertain'?(state.importClassificationChoice||'uncertain'):detected;
  if(effective!=='equipment'){e.preventDefault();e.stopImmediatePropagation();renderImportEligibility();toast(effective==='service'?'Equipment invoices only. Service-work invoices cannot be imported.':effective==='noninventory'?'No tracked equipment found. Excluded accessory-only invoices cannot be imported.':'Confirm whether this is an Equipment invoice or Service invoice before saving.');return;}
  state.parsed.items=v689SerialIntegrityGate(state.parsed.items||[],state.parsed.raw||state.parsed.rawText||'');
  if(!(state.parsed.items||[]).length){e.preventDefault();e.stopImmediatePropagation();toast('No verified physical inventory line item is available to save.');return;}
  if(globalThis.AVParserV7){try{
    const completeness=state.parsed?.v7?.completenessValidation||state.parsed?.parseEvidence?.v7?.completenessValidation||state.parsed?.parseEvidence?.completeness||null;
    let prep=globalThis.AVParserV7.prepareSave(state.parsed.items||[],{humanReviewed:false,completeness});state.parsed.items=prep.rows;
    if(prep.status==='block'){e.preventDefault();e.stopImmediatePropagation();toast(prep.errors[0]?.message||'A confirmed validation error prevents saving.');return;}
    if(prep.status==='review'){
      const documentReview=!!(state.parsed?.v7?.documentReviewRequired||state.parsed?.documentReviewRequired||state.importDocumentReviewRequired);
      const accepted=window.confirm(documentReview?'Level 3 — Verify document type.\n\nThis file has invoice-like structure, but the Invoice / Tax Invoice document type was not fully verified automatically. Compare it with the PDF and select OK only if it is genuinely an Invoice / Tax Invoice.':'Level 3 — Please verify this item.\n\nBefore saving, confirm that the highlighted field(s) match the source invoice. Also check quantity, unit price, amount and serial number(s) where shown.\n\nSelect OK only after checking these values against the PDF.');
      if(!accepted){e.preventDefault();e.stopImmediatePropagation();toast('Save paused for human review.');v703RenderVerificationNotice();return;}
      prep=globalThis.AVParserV7.prepareSave(state.parsed.items||[],{humanReviewed:true,completeness});state.parsed.items=prep.rows;
      if(prep.status==='block'){e.preventDefault();e.stopImmediatePropagation();toast(prep.errors[0]?.message||'A confirmed validation error prevents saving.');return;}
    }
  }catch(v7SaveErr){console.warn('V7.03 save validation error',v7SaveErr);e.preventDefault();e.stopImmediatePropagation();toast('Parser validation could not complete. Save has been stopped for safety.');return;}}
  return;
},true);
`;

    src=replaceOnce(src,'// Final evidence gate runs before the existing save handler.',gate+'// Final evidence gate runs before the existing save handler.','invoice classification save gate');

    // V7.03.3.9 Documents Edit: patch the real/original application source before import.
    const v70336DocActionOld='<td class="actions"><button data-doc-view="${d.id}">View</button><button data-doc-download="${d.id}">Download</button>${editable?`<button class="danger-outline" data-doc-delete="${d.id}">Delete</button>`:\'\'}</td>';
    const v70336DocActionNew='<td class="actions"><button data-doc-view="${d.id}">View</button>${editable?`<button data-doc-edit="${d.id}">Edit</button>`:\'\'}<button data-doc-download="${d.id}">Download</button>${editable?`<button class="danger-outline" data-doc-delete="${d.id}">Delete</button>`:\'\'}</td>';
    src=replaceOnce(src,v70336DocActionOld,v70336DocActionNew,'V7.03.3.9 document Edit action');
    const v70336HandlerOld="for(const id of ['documentsTable','detailBody'])$(id).onclick=async e=>{const el=e.target.closest('[data-doc-view],[data-doc-download],[data-doc-delete]');if(!el)return;try{if(el.dataset.docDelete){";
    const v70336Editor=String.raw`
function v70336EnsureDocumentEditor(){
  let overlay=document.getElementById('v70336DocumentEditor');if(overlay)return overlay;
  overlay=document.createElement('div');overlay.id='v70336DocumentEditor';overlay.hidden=true;overlay.style.cssText='position:fixed;inset:0;z-index:2147483600;background:rgba(15,23,42,.52);display:none;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="v70336DocumentEditorTitle" style="width:min(560px,96vw);max-height:90vh;overflow:auto;background:#fff;color:#172033;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.32)"><div style="display:flex;justify-content:space-between;gap:16px"><div><h3 id="v70336DocumentEditorTitle" style="margin:0 0 6px">Edit document details</h3><p style="margin:0;color:#64748b">Updates this document and its linked purchase details.</p></div><button type="button" id="v70336DocumentEditorClose" aria-label="Close">×</button></div><input id="v70336DocumentId" type="hidden"><label style="display:grid;gap:6px;margin-top:18px">Supplier<input id="v70336DocumentSupplier" required></label><label style="display:grid;gap:6px;margin-top:14px">Invoice No.<input id="v70336DocumentInvoice" required></label><label style="display:grid;gap:6px;margin-top:14px">Invoice Date<input id="v70336DocumentDate" type="date"></label><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px"><button type="button" id="v70336DocumentCancel" class="secondary">Cancel</button><button type="button" id="v70336DocumentSave">Save changes</button></div></section>';
  document.body.appendChild(overlay);const close=()=>{overlay.style.display='none';overlay.hidden=true;};$('v70336DocumentEditorClose').onclick=close;$('v70336DocumentCancel').onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  $('v70336DocumentSave').onclick=async()=>{const btn=$('v70336DocumentSave'),docId=$('v70336DocumentId').value,supplier=$('v70336DocumentSupplier').value.trim(),invoice=$('v70336DocumentInvoice').value.trim(),date=$('v70336DocumentDate').value.trim();if(!supplier){toast('Supplier cannot be blank.');return;}if(!invoice){toast('Invoice number cannot be blank.');return;}const linked=(state.data.purchases||[]).filter(x=>String(x.document_id)===String(docId));const duplicate=(state.data.purchases||[]).find(x=>!linked.some(y=>String(y.id)===String(x.id))&&norm(x.supplier_name)===norm(supplier)&&norm(x.invoice_number)===norm(invoice)&&String(x.invoice_date||'')===date);if(duplicate){toast('Another invoice already uses the same Supplier + Invoice No + Invoice Date.');return;}setBusy(btn,true);try{if(CFG.mode==='supabase'){const du=await state.db.sb.from('documents').update({supplier_name:supplier,invoice_number:invoice}).eq('id',docId);if(du.error)throw du.error;if(linked.length){const pu=await state.db.sb.from('purchases').update({supplier_name:supplier,invoice_number:invoice,invoice_date:date||null}).eq('document_id',docId);if(pu.error)throw pu.error;}}else{const data=state.db.data(),di=data.documents.findIndex(x=>String(x.id)===String(docId));if(di<0)throw new Error('Document not found.');const old={...data.documents[di]};data.documents[di]={...data.documents[di],supplier_name:supplier,invoice_number:invoice};state.db.audit(data,'documents',docId,'UPDATE',old,data.documents[di]);for(let i=0;i<data.purchases.length;i++)if(String(data.purchases[i].document_id)===String(docId)){const before={...data.purchases[i]};data.purchases[i]={...data.purchases[i],supplier_name:supplier,invoice_number:invoice,invoice_date:date||''};state.db.audit(data,'purchases',data.purchases[i].id,'UPDATE',before,data.purchases[i]);}state.db.save(data);}await reload();close();toast('Document and linked inventory details updated.');}catch(err){console.error('Document edit failed',err);toast(friendlyError(err));}finally{setBusy(btn,false);}};return overlay;
}
function openDocumentMetadataEdit(docId){if(!requireEdit())return;const doc=(state.data.documents||[]).find(x=>String(x.id)===String(docId));if(!doc){toast('Document not found.');return;}const overlay=v70336EnsureDocumentEditor();$('v70336DocumentId').value=doc.id;$('v70336DocumentSupplier').value=doc.supplier_name||'';$('v70336DocumentInvoice').value=doc.invoice_number||'';$('v70336DocumentDate').value=documentInvoiceDate(doc)||'';overlay.hidden=false;overlay.style.display='flex';requestAnimationFrame(()=>$('v70336DocumentSupplier')?.focus());}
`;
    const v70336HandlerNew=v70336Editor+"\nfor(const id of ['documentsTable','detailBody'])$(id).onclick=async e=>{const el=e.target.closest('[data-doc-view],[data-doc-edit],[data-doc-download],[data-doc-delete]');if(!el)return;if(el.dataset.docEdit){openDocumentMetadataEdit(el.dataset.docEdit);return;}try{if(el.dataset.docDelete){";
    src=replaceOnce(src,v70336HandlerOld,v70336HandlerNew,'V7.03.3.9 document Edit handler');
    const v70338PrimaryOld="let text=pages.join('\\n');state.pdfLayout=layouts;";
    const v70338PrimaryNew="const v70338PrimaryGate=globalThis.V7033Patch?.filterInvoicePages(pages,layouts);if(!v70338PrimaryGate)throw new Error('Invoice-only parser gate is unavailable.');if(chars>=80&&!v70338PrimaryGate.texts.length)throw new Error('No Invoice or Tax Invoice page was positively identified. Non-invoice pages were ignored.');let text=(v70338PrimaryGate.texts.length?v70338PrimaryGate.texts:pages).join('\\n');state.pdfLayout=v70338PrimaryGate.layouts.length?v70338PrimaryGate.layouts:layouts;state.invoicePageDecisions=v70338PrimaryGate.decisions;state.importDocumentReviewRequired=!!v70338PrimaryGate.reviewRequired;state.importDocumentReviewReason=v70338PrimaryGate.reviewRequired?'One or more invoice pages need document-type verification.':'';";
    src=replaceOnce(src,v70338PrimaryOld,v70338PrimaryNew,'V7.03.3.9 primary invoice-only page gate');
    const v70338OcrOld="const candidateText=m.texts.join('\\n').trim();\n      const score=ocrTextQuality(candidateText)+m.layouts.reduce((n,l)=>n+layoutInvoiceQuality(l),0);\n      return {source:m.key,label:m.label,text:candidateText,layout:m.layouts,score};";
    const v70338OcrNew="const gated=globalThis.V7033Patch?.filterInvoicePages(m.texts,m.layouts);if(!gated)return {source:m.key,label:m.label,text:'',layout:[],score:-1};const candidateText=gated.text.trim();const candidateLayouts=gated.layouts;\n      const score=ocrTextQuality(candidateText)+candidateLayouts.reduce((n,l)=>n+layoutInvoiceQuality(l),0);\n      return {source:m.key,label:m.label,text:candidateText,layout:candidateLayouts,score,invoicePageDecisions:gated.decisions,documentReviewRequired:!!gated.reviewRequired};";
    src=replaceOnce(src,v70338OcrOld,v70338OcrNew,'V7.03.3.9 OCR invoice-only page gate');
    const v70338NoOcrOld="if(!candidates.length)throw new Error('OCR could not read enough text from this PDF.');";
    const v70338NoOcrNew="if(!candidates.length)throw new Error('No Invoice or Tax Invoice page was positively identified. Quotations, delivery documents, forms and photos were ignored.');";
    src=replaceOnce(src,v70338NoOcrOld,v70338NoOcrNew,'V7.03.3.9 invoice-only OCR failure message');

    src=replaceOnce(src,"const docs=state.data.documents\n    .filter(d=>!q||norm([d.file_name,d.supplier_name,d.invoice_number,documentInvoiceDate(d),...linkedItemsForDocument(d.id).map(i=>i.sku+' '+i.item_name)].join(' ')).includes(q))","const docs=state.data.documents\n    .filter(d=>!(d.is_vault===true||String(d.is_vault)==='true'))\n    .filter(d=>!q||norm([d.file_name,d.supplier_name,d.invoice_number,documentInvoiceDate(d),...linkedItemsForDocument(d.id).map(i=>i.sku+' '+i.item_name)].join(' ')).includes(q))","V7.03.3.9 exclude Vault from Documents");
    src=replaceOnce(src,"maintenance:['Maintenance','Track equipment faults, repairs and service history.'],audit:['Recent Activities','Track recent inventory, document and system changes.']","maintenance:['Maintenance','Track equipment faults, repairs and service history.'],vault:['Vault','Invoices before Year 2020 stored here'],audit:['Recent Activities','Track recent inventory, document and system changes.']","V7.03.3.9 Vault view title");
    src=replaceOnce(src,"renderDocuments();renderMaintenance();","renderDocuments();renderVault();renderMaintenance();","V7.03.3.9 render Vault");
    src=replaceOnce(src,"if(!state.parsed.items.length){\n    e.preventDefault();e.stopImmediatePropagation();\n    toast('No physical inventory items were detected. Labour, installation and service lines are excluded.');\n  }","if(!v70339IsVaultDate(state.parsed.doc.invoice_date)&&!state.parsed.items.length){\n    e.preventDefault();e.stopImmediatePropagation();\n    toast('No physical inventory items were detected. Labour, installation and service lines are excluded.');\n  }","V7.03.3.9 Vault bypass inventory-only final gate");
    src += "\n// V7.03.3.9 Vault \u2014 historical invoices before 2020 are archive-only.\nfunction v70339IsVaultDate(v=''){return /^\\d{4}-\\d{2}-\\d{2}$/.test(String(v||''))&&Number(String(v).slice(0,4))<2020;}\nfunction v70339VaultDocs(){return (state.data?.documents||[]).filter(d=>d.is_vault===true||String(d.is_vault)==='true');}\nasync function v70339ImportVault(doc,purchase,file){\n  if(!v70339IsVaultDate(purchase?.invoice_date))throw new Error('Vault accepts only invoices dated before 2020.');\n  if(CFG.mode==='supabase'){\n    const path=`vault/${String(purchase.invoice_date).slice(0,4)}/${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;let uploaded=false;\n    try{const up=await state.db.sb.storage.from('inventory-documents').upload(path,file,{contentType:'application/pdf'});if(up.error)throw up.error;uploaded=true;\n      const rec={...doc,storage_path:path,is_vault:true,invoice_date:purchase.invoice_date,uploaded_at:nowIso(),uploaded_by:state.session?.user?.id||null};const ins=await state.db.sb.from('documents').insert(rec).select('id').single();if(ins.error)throw ins.error;return ins.data;\n    }catch(err){if(uploaded){try{await state.db.sb.storage.from('inventory-documents').remove([path]);}catch(_e){}}throw err;}\n  }\n  const d=state.db.data(),docRec={id:uid(),...doc,is_vault:true,invoice_date:purchase.invoice_date,uploaded_at:nowIso(),uploaded_by:state.db.user,storage_path:'indexeddb:'+uid()};d.documents.push(docRec);await saveBlob(docRec.id,file);state.db.audit(d,'documents',docRec.id,'INSERT',null,docRec);state.db.save(d);return docRec;\n}\nasync function v70339DuplicateVault(supplier,invoice,date){\n  if(CFG.mode==='supabase'){const q=await state.db.sb.from('documents').select('id,supplier_name,invoice_number,invoice_date,is_vault').eq('is_vault',true).ilike('supplier_name',supplier).ilike('invoice_number',invoice).eq('invoice_date',date).limit(1);if(q.error)throw q.error;return q.data?.[0]||null;}\n  return v70339VaultDocs().find(d=>norm(d.supplier_name)===norm(supplier)&&norm(d.invoice_number)===norm(invoice)&&String(d.invoice_date||'')===String(date))||null;\n}\nasync function v70339DeleteVault(id){\n  const d=v70339VaultDocs().find(x=>String(x.id)===String(id));if(!d)throw new Error('Vault invoice not found.');\n  if(CFG.mode==='supabase'){const del=await state.db.sb.from('documents').delete().eq('id',id).eq('is_vault',true);if(del.error)throw del.error;if(d.storage_path){const rm=await state.db.sb.storage.from('inventory-documents').remove([d.storage_path]);if(rm.error)console.warn('Vault record deleted but storage cleanup failed',rm.error);}return;}\n  const data=state.db.data();data.documents=data.documents.filter(x=>String(x.id)!==String(id));state.db.audit(data,'documents',id,'DELETE',d,null);state.db.save(data);await deleteBlob(id);\n}\nfunction v70339VaultFileUrl(id,download=false){return state.db.fileUrl(id,download);}\nfunction renderVault(){\n  const q=norm($('vaultSearch')?.value||''),sort=$('vaultSort')?.value||'newest',group=$('vaultGroup')?.value||'company',editable=canEdit();\n  const docs=v70339VaultDocs().filter(d=>!q||norm([d.file_name,d.supplier_name,d.invoice_number,d.invoice_date].join(' ')).includes(q)).slice().sort((a,b)=>{const at=Date.parse(a.invoice_date||'')||0,bt=Date.parse(b.invoice_date||'')||0;if(at===bt)return String(a.file_name||'').localeCompare(String(b.file_name||''));return sort==='oldest'?at-bt:bt-at;});\n  const row=d=>`<tr><td>${d.invoice_date?fmtDate(d.invoice_date):'\u2014'}</td><td>${esc(d.supplier_name||'\u2014')}</td><td>${esc(d.invoice_number||'\u2014')}</td><td>${esc(d.file_name||'\u2014')}</td><td>${fmtDT(d.uploaded_at)}</td><td class=\"actions\"><button data-vault-view=\"${d.id}\">View</button><button data-vault-download=\"${d.id}\">Download</button>${editable?`<button class=\"danger-outline\" data-vault-delete=\"${d.id}\">Delete</button>`:''}</td></tr>`;\n  if(!docs.length){$('vaultTable').innerHTML='<div class=\"empty\">No archived invoices found.</div>';return;}\n  const head='<thead><tr><th>Invoice date</th><th>Supplier</th><th>Invoice</th><th>File</th><th>Uploaded</th><th>Actions</th></tr></thead>';\n  if(group==='none'){$('vaultTable').innerHTML=`<table>${head}<tbody>${docs.map(row).join('')}</tbody></table>`;return;}\n  const groups=new Map();for(const d of docs){const k=d.supplier_name||'Unknown company';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(d);} $('vaultTable').innerHTML=[...groups.entries()].map(([company,list])=>`<section class=\"document-group\"><div class=\"document-group-head\"><strong>${esc(company)}</strong><span>${list.length} invoice${list.length===1?'':'s'}</span></div><table>${head}<tbody>${list.map(row).join('')}</tbody></table></section>`).join('');\n}\n$('vaultSearch')?.addEventListener('input',renderVault);$('vaultSort')?.addEventListener('change',renderVault);$('vaultGroup')?.addEventListener('change',renderVault);\n$('vaultTable')?.addEventListener('click',async e=>{const el=e.target.closest('[data-vault-view],[data-vault-download],[data-vault-delete]');if(!el)return;try{if(el.dataset.vaultDelete){if(!requireEdit()||!confirm('Delete this archived invoice from Vault?'))return;await v70339DeleteVault(el.dataset.vaultDelete);await reload();renderVault();toast('Vault invoice deleted.');return;}const id=el.dataset.vaultView||el.dataset.vaultDownload;const url=await v70339VaultFileUrl(id,!!el.dataset.vaultDownload);if(url)window.open(url,'_blank');}catch(err){console.error(err);toast(friendlyError(err));}});\n// V7.03.3.9b historical invoice save interception.\n$('saveImportBtn')?.addEventListener('click',async e=>{\n  if(!state.parsed)return;collectParsed();const d=state.parsed.doc||{};if(!v70339IsVaultDate(d.invoice_date))return;\n  e.preventDefault();e.stopImmediatePropagation();if(state.importSaving||!requireEdit())return;\n  if(!d.supplier_name||!d.invoice_number){toast('Supplier and invoice number are required.');return;}\n  const ok=confirm('Old invoice detected ('+fmtDate(d.invoice_date)+'). Invoices before Year 2020 are stored in Vault and will not be added to Inventory or Documents. Save to Vault?');if(!ok)return;\n  const saveBtn=$('saveImportBtn');try{state.importSaving=true;saveBtn.disabled=true;saveBtn.textContent='Saving to Vault...';setProgress(96,'Saving historical invoice to Vault...');\n    const oldDupe=await v70339DuplicateVault(d.supplier_name,d.invoice_number,d.invoice_date);if(oldDupe)throw new Error('This historical invoice already exists in Vault.');\n    const namedFile=await autoNamedPdf(state.file,d);await v70339ImportVault({file_name:namedFile.name,mime_type:namedFile.type,supplier_name:d.supplier_name,invoice_number:d.invoice_number},d,namedFile);\n    state.lastImportCount=0;state.lastImportFilename=namedFile.name;cleanupPdfPreview();$('importDialog').close();state.file=null;state.parsed=null;state.allowDuplicate=false;await reload();renderVault();showView('vault');toast('Old invoice saved to Vault. PDF: '+(state.lastImportFilename||'saved')+'.');\n  }catch(err){console.error('Vault import failed',err);toast(friendlyError(err,'import'));}finally{state.importSaving=false;if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Confirm & save';}if($('importProgress'))$('importProgress').classList.add('hidden');}\n},true);\n\n";

    const v703311InventoryUiSection="function v703311CanonicalCategory(value=''){\n  const raw=String(value||'').trim().replace(/\\s+/g,' ');\n  if(!raw)return '';\n  const key=raw.toLowerCase().replace(/\\s*\\/\\s*/g,'/');\n  if(/\\bproject(?:or|ion)\\b/.test(key))return 'Projection';\n  if(/\\baudio\\b/.test(key)||/^speakers?$/.test(key)||/(?:^|\\/)speakers?(?:\\/|$)/.test(key))return 'Audio';\n  return raw;\n}\nfunction v703311StandardItemName(item={}){\n  return String(item.item_name||'').trim()||'Unnamed item';\n}\nfunction renderCategories(){\n  const cur=v703311CanonicalCategory($('categoryFilter').value);\n  const byKey=new Map();\n  for(const item of state.data.items||[]){\n    const label=v703311CanonicalCategory(item.category);\n    if(!label)continue;\n    const key=label.toLowerCase();\n    if(!byKey.has(key))byKey.set(key,label);\n  }\n  const cats=[...byKey.values()].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));\n  $('categoryFilter').innerHTML='<option value=\"\">All categories</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');\n  $('categoryFilter').value=cats.some(c=>c.toLowerCase()===cur.toLowerCase())?cats.find(c=>c.toLowerCase()===cur.toLowerCase()):'';\n}\nfunction renderInventory(){\n  const q=norm($('inventorySearch').value),cat=v703311CanonicalCategory($('categoryFilter').value),editable=canEdit(),group=$('inventoryGroup')?.value||'none';\n  const filtered=state.data.items.filter(i=>{\n    const canonicalCategory=v703311CanonicalCategory(i.category);\n    const standardName=v703311StandardItemName(i);\n    const hay=[i.sku,standardName,i.description,i.category,canonicalCategory,...itemSerials(i.id),...itemSuppliers(i.id),...itemInvoices(i.id).map(p=>p.invoice_number)].join(' ');\n    return(!q||norm(hay).includes(q))&&(!cat||canonicalCategory.toLowerCase()===cat.toLowerCase());\n  });\n  const head='<thead><tr><th>SKU / item</th><th>Category</th><th>Total purchased <span class=\"info-tip\" title=\"Everything ever purchased from saved invoices.\">\u24d8</span></th><th>Current inventory <span class=\"info-tip\" title=\"Total Purchased minus inventory adjustments.\">\u24d8</span></th><th>Supplier</th><th>Quick actions</th></tr></thead>';\n  const row=i=>{\n    const s=summary(i),serials=itemSerials(i.id),hasInvoice=itemInvoices(i.id).some(p=>p.document_id),standardName=v703311StandardItemName(i),canonicalCategory=v703311CanonicalCategory(i.category),suppliers=itemSuppliers(i.id),supplierLabel=suppliers.join(', ')||'\u2014';\n    return {company:suppliers[0]||'Unknown company',html:`<tr><td><button class=\"item-link\" data-detail=\"${i.id}\"><strong>${esc(i.sku)}</strong><span>${esc(standardName)}</span></button></td><td>${esc(canonicalCategory||'\u2014')}</td><td class=\"qty\">${s.purchased}</td><td class=\"qty ${s.current<0?'negative':''}\"><strong>${s.current}</strong></td><td>${esc(supplierLabel)}</td><td class=\"actions-menu-cell\"><details class=\"action-menu\"><summary aria-label=\"Actions\">\u22ef</summary><div><button data-detail=\"${i.id}\">View details</button>${editable?`<button data-quick-maint=\"${i.id}\">Add maintenance</button>`:''}<button data-quick-invoice=\"${i.id}\" ${hasInvoice?'':'disabled'}>View invoice</button><button data-copy-serials=\"${i.id}\" ${serials.length?'':'disabled'}>Copy serial${serials.length===1?'':'s'}</button>${editable?`<button data-adjust=\"${i.id}\">Adjust inventory</button><button data-edit=\"${i.id}\">Edit</button><button data-delete=\"${i.id}\">Delete</button>`:''}</div></details></td></tr>`};\n  };\n  const rendered=filtered.map(row);\n  if(!rendered.length){$('inventoryTable').innerHTML=`<div class=\"empty-state\"><strong>No inventory items found.</strong><span>Try clearing your search${editable?' or import an invoice':''}.</span>${editable?'<button class=\"primary\" data-empty-import>Import invoice</button>':''}</div>`;return;}\n  if(group!=='company'){$('inventoryTable').innerHTML=`<table>${head}<tbody>${rendered.map(x=>x.html).join('')}</tbody></table>`;return;}\n  const groups=new Map();\n  for(const x of rendered){if(!groups.has(x.company))groups.set(x.company,[]);groups.get(x.company).push(x);}\n  $('inventoryTable').innerHTML=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'})).map(([company,list])=>`<section class=\"document-group inventory-company-group\"><div class=\"document-group-head\"><strong>${esc(company)}</strong><span>${list.length} item${list.length===1?'':'s'}</span></div><table>${head}<tbody>${list.map(x=>x.html).join('')}</tbody></table></section>`).join('');\n}\n$('inventoryGroup')?.addEventListener('change',renderInventory);\n";
    src=replaceSection(src,"function renderCategories(){","function documentInvoiceDate(d){",v703311InventoryUiSection,"V7.03.3.14f native Inventory company grouping + category normalization + Standard Item Name display");
    src += "\n// V7.03.3.14f \u2014 hard runtime parser gate inside the REAL application scope.\n(function v703312lInstallRuntimeParserGate(){\n  if(window.__V703312L_RUNTIME_PARSER_GATE__)return;\n  if(typeof renderParsedItems!=='function'||typeof state==='undefined'){\n    console.error('V7.03.3.14f runtime parser gate could not bind to the real review runtime.');\n    return;\n  }\n  window.__V703312L_RUNTIME_PARSER_GATE__=true;\n  const originalRenderParsedItems=renderParsedItems;\n  function applyRuntimeParserGate(){\n    if(!state.parsed||state.parsed.__v703312lRuntimeGateApplied)return state.parsed;\n    const raw=String(state.parsed.raw||state.parsed.rawText||'');\n    const evidence=(typeof v661EvidenceSources==='function'?v661EvidenceSources(raw):[]).map((x,i)=>({source:String(x?.source||('runtime-'+(i+1))),text:String(x?.text||''),page:1}));\n    const before=(state.parsed.items||[]).map(x=>({sku:x.sku||'',item_name:x.item_name||'',quantity:x.quantity,unit_price:x.unit_price,amount:x.amount}));\n    const fixed=globalThis.V7033Patch?.applyParsedFixes(state.parsed,raw,evidence)||state.parsed;\n    if(state.importDocumentReviewRequired){fixed.v7=fixed.v7||{};fixed.v7.documentReviewRequired=true;fixed.v7.documentReviewReason=String(state.importDocumentReviewReason||'Verify this file is an Invoice / Tax Invoice.');fixed.v7.humanReviewRequired=true;fixed.documentReviewRequired=true;fixed.documentReviewReason=fixed.v7.documentReviewReason;}\n    fixed.__v703312lRuntimeGateApplied=true;\n    fixed.__v703312lRuntimeGateDiagnostics={version:'7.03.3.14f',evidenceCount:evidence.length,before,after:(fixed.items||[]).map(x=>({sku:x.sku||'',item_name:x.item_name||'',quantity:x.quantity,unit_price:x.unit_price,amount:x.amount})),level1:fixed.v703312kVerification?.level1||[],level2:fixed.v703312kVerification?.level2||[],level3Required:!!fixed.v703312kVerification?.level3Required};\n    state.parsed=fixed;\n    const d=fixed.doc||{};\n    if(document.getElementById('pSupplier'))document.getElementById('pSupplier').value=d.supplier_name||'';\n    if(document.getElementById('pInvoice'))document.getElementById('pInvoice').value=d.invoice_number||'';\n    if(document.getElementById('pDate'))document.getElementById('pDate').value=d.invoice_date||'';\n    return fixed;\n  }\n  renderParsedItems=function(){applyRuntimeParserGate();return originalRenderParsedItems();};\n  window.__AV_PARSER_RUNTIME_DIAGNOSTICS__={version:'7.03.3.14f',runtime:'inner-application',installed:true,apply:applyRuntimeParserGate,status:()=>({applied:!!state.parsed?.__v703312lRuntimeGateApplied,diagnostics:state.parsed?.__v703312lRuntimeGateDiagnostics||null,items:(state.parsed?.items||[]).map(x=>({sku:x.sku||'',item_name:x.item_name||'',quantity:x.quantity,unit_price:x.unit_price,amount:x.amount}))})};\n})();\n";

    // V7.03.3.14f: inject Subtract Line into the final application runtime, not this loader scope.
    src += "\n// V7.03.3.14f \u2014 Subtract Line runs inside the REAL application runtime.\n(function v703312hInstallSubtractLine(){\n  if(window.__V703312H_SUBTRACT_INSTALLED__)return;\n  const add=document.getElementById('addParsedItemBtn'),box=document.getElementById('parsedItems');\n  if(!add||!box||typeof renderParsedItems!=='function'||typeof collectParsed!=='function'){\n    console.error('V7.03.3.14f Subtract Line could not bind to the real review runtime.');\n    return;\n  }\n  window.__V703312H_SUBTRACT_INSTALLED__=true;\n  const existing=document.getElementById('subtractParsedItemBtn');if(existing)existing.remove();\n  const oldActions=document.getElementById('v703312LineActions');if(oldActions){oldActions.parentNode?.insertBefore(add,oldActions);oldActions.remove();}\n  const actions=document.createElement('div');actions.id='v703312LineActions';actions.style.cssText='display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap';\n  const parent=add.parentNode;parent.insertBefore(actions,add);actions.appendChild(add);\n  const btn=document.createElement('button');btn.id='subtractParsedItemBtn';btn.type='button';btn.className='secondary small-btn';btn.textContent='\u2212 Subtract line';btn.title='Select one or more line items to remove from this invoice review.';actions.appendChild(btn);\n  let selecting=false;const selected=new Set();\n  const notify=(m)=>{try{toast(m);}catch(_e){console.info(m);}};\n  function rows(){return [...box.querySelectorAll(':scope > .parsed-row[data-pi]')].sort((a,b)=>Number(a.dataset.pi)-Number(b.dataset.pi));}\n  function syncButton(){const items=state.parsed?.items||[];btn.disabled=!items.length;btn.textContent=selecting?(selected.size?'\u2212 Subtract selected ('+selected.size+')':'\u2212 Subtract line \u2014 select items'):'\u2212 Subtract line';}\n  function clearControls(){box.querySelectorAll('.v703312-select-wrap').forEach(x=>x.remove());box.querySelectorAll('.parsed-row[data-pi]').forEach(r=>{r.style.outline='';r.style.outlineOffset='';r.querySelectorAll('[data-remove-line]').forEach(b=>b.disabled=false);});}\n  function refresh(){\n    clearControls();\n    const items=state.parsed?.items||[];\n    for(const i of [...selected])if(i<0||i>=items.length)selected.delete(i);\n    if(!selecting){syncButton();return;}\n    const rs=rows();\n    if(rs.length!==items.length){console.error('V7.03.3.14f Subtract Line row/item mismatch',{rows:rs.length,items:items.length});syncButton();return;}\n    rs.forEach((row,pos)=>{\n      const i=Number(row.dataset.pi);if(!Number.isInteger(i)||i!==pos)return;\n      const label=document.createElement('label');label.className='v703312-select-wrap';label.style.cssText='display:flex!important;align-items:center;gap:8px;margin:0 0 10px;padding:9px 10px;border:2px solid #94a3b8;border-radius:8px;background:#f8fafc;color:#334155;font-size:12px;font-weight:700;position:relative;z-index:3;cursor:pointer';\n      const cb=document.createElement('input');cb.type='checkbox';cb.className='v703312-select-check';cb.setAttribute('aria-label','Select line '+(i+1)+' for removal');cb.style.cssText='display:inline-block!important;appearance:auto!important;width:18px!important;height:18px!important;opacity:1!important;visibility:visible!important;position:static!important;margin:0!important';cb.checked=selected.has(i);\n      const name=items[i]?.item_name||items[i]?.description||items[i]?.sku||('Line '+(i+1));label.append(cb,document.createTextNode(' Select line '+(i+1)+': '+name));row.prepend(label);\n      row.querySelectorAll('[data-remove-line]').forEach(b=>b.disabled=true);\n      if(selected.has(i)){row.style.outline='2px solid #2563eb';row.style.outlineOffset='2px';}\n      cb.addEventListener('change',()=>{if(cb.checked)selected.add(i);else selected.delete(i);row.style.outline=cb.checked?'2px solid #2563eb':'';row.style.outlineOffset=cb.checked?'2px':'';syncButton();});\n    });\n    syncButton();\n  }\n  function closeModal(){const overlay=document.getElementById('v703312SubtractOverlay');if(overlay?.open)overlay.close();btn.focus();}\n  function ensureModal(){\n    let overlay=document.getElementById('v703312SubtractOverlay');\n    if(overlay&&overlay.tagName!=='DIALOG'){overlay.remove();overlay=null;}\n    if(overlay)return overlay;\n    overlay=document.createElement('dialog');overlay.id='v703312SubtractOverlay';overlay.setAttribute('aria-labelledby','v703312SubtractTitle');overlay.style.cssText='border:0;border-radius:16px;padding:0;width:min(460px,94vw);max-width:94vw;background:transparent;box-shadow:none;overflow:visible';\n    overlay.innerHTML='<section style=\"background:#fff;color:#172033;border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.32)\"><h3 id=\"v703312SubtractTitle\" style=\"margin:0 0 8px\">Remove selected line items?</h3><p id=\"v703312SubtractText\" style=\"margin:0;color:#64748b\"></p><p style=\"margin:14px 0 0;padding:12px;border:1px solid #dbe4f0;border-radius:10px;font-size:13px\">This removes only the selected rows from the current invoice review. Saved Inventory Hub records are not affected.</p><div style=\"display:flex;justify-content:flex-end;gap:10px;margin-top:20px\"><button type=\"button\" id=\"v703312SubtractCancel\" class=\"secondary\">Cancel</button><button type=\"button\" id=\"v703312SubtractConfirm\">Remove selected</button></div></section>';\n    document.body.appendChild(overlay);\n    if(!document.getElementById('v703312SubtractBackdropStyle')){const st=document.createElement('style');st.id='v703312SubtractBackdropStyle';st.textContent='#v703312SubtractOverlay::backdrop{background:rgba(15,23,42,.48)}';document.head.appendChild(st);}\n    document.getElementById('v703312SubtractCancel').addEventListener('click',closeModal);\n    overlay.addEventListener('cancel',e=>{e.preventDefault();closeModal();});\n    overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal();});\n    document.getElementById('v703312SubtractConfirm').addEventListener('click',()=>{\n      collectParsed();const items=state.parsed?.items||[],indexes=[...selected].sort((a,b)=>b-a);if(!indexes.length){closeModal();return;}\n      for(const i of indexes)if(i>=0&&i<items.length)items.splice(i,1);\n      const count=indexes.length;selected.clear();selecting=false;closeModal();renderParsedItems();notify('Removed '+count+' selected line item'+(count===1?'':'s')+' from this review.');\n    });\n    return overlay;\n  }\n  btn.addEventListener('click',e=>{\n    e.preventDefault();e.stopPropagation();\n    const items=state.parsed?.items||[];if(!items.length){notify('There are no line items to subtract.');return;}\n    if(!selecting){collectParsed();selecting=true;selected.clear();refresh();notify('Selection mode is on. Tick the line items to remove.');return;}\n    if(!selected.size){refresh();notify('Select at least one line item using the checkbox first.');return;}\n    const overlay=ensureModal(),count=selected.size;document.getElementById('v703312SubtractText').textContent=count===items.length?'You selected all '+count+' line items. No line items will remain after removal.':'You selected '+count+' line item'+(count===1?'':'s')+' for removal.';if(!overlay.open)overlay.showModal();document.getElementById('v703312SubtractCancel').focus();\n  },true);\n  const previousRender=renderParsedItems;\n  renderParsedItems=function(){previousRender();refresh();};\n  document.getElementById('importDialog')?.addEventListener('close',()=>{selected.clear();selecting=false;clearControls();syncButton();});\n  window.__AV_SUBTRACT_LINE_DIAGNOSTICS__={version:'7.03.3.14f',runtime:'inner-application',installed:true,status:()=>({selecting,selected:[...selected],items:(state.parsed?.items||[]).length,rows:rows().length,checkboxes:box.querySelectorAll('.v703312-select-check').length,buttonDisabled:btn.disabled,overlayOpen:!!document.getElementById('v703312SubtractOverlay')?.open,overlayTag:document.getElementById('v703312SubtractOverlay')?.tagName||''})};\n  refresh();\n})();\n";

    // V7.03.3.14f: patch the FINAL d452 runtime from inside the v7.03.1 inner loader.
    const v703314fItemSubmitOld="$('itemForm').addEventListener('submit',async e=>{e.preventDefault();if(!requireEdit())return;const x={sku:$('itemSku').value.trim(),item_name:$('itemName').value.trim(),category:$('itemCategory').value.trim(),unit:$('itemUnit').value.trim()||'pcs',image_url:$('itemImageUrl')?.value.trim()||null,description:$('itemDescription').value.trim()};try{if(!$('itemId').value)throw new Error('New inventory items are created through invoice import.');await state.db.updateItem($('itemId').value,x);$('itemDialog').close();await reload();toast('Item saved.');}catch(err){toast(err.message)}});";
    const v703314fItemSubmitNew="function v703314dSkuKey(v=''){try{return globalThis.V7033Patch?.compact?.(v)||String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');}catch(_e){return String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');}}\nfunction v703314dFindMergeTarget(sourceId,proposedSku){\n  const source=(state.data?.items||[]).find(i=>String(i.id)===String(sourceId));\n  if(!source)return {source:null,target:null,ambiguous:false,matches:[]};\n  const proposed=String(proposedSku||'').trim(),current=String(source.sku||'').trim();\n  if(!proposed||proposed===current)return {source,target:null,ambiguous:false,matches:[]};\n  const key=v703314dSkuKey(proposed);if(!key)return {source,target:null,ambiguous:false,matches:[]};\n  const matches=(state.data?.items||[]).filter(i=>String(i.id)!==String(sourceId)&&v703314dSkuKey(i.sku)===key);\n  if(!matches.length)return {source,target:null,ambiguous:false,matches:[]};\n  const exact=matches.filter(i=>String(i.sku||'').trim().toLowerCase()===proposed.toLowerCase());\n  if(exact.length===1)return {source,target:exact[0],ambiguous:false,matches};\n  if(matches.length===1)return {source,target:matches[0],ambiguous:false,matches};\n  return {source,target:null,ambiguous:true,matches};\n}\nfunction v703314dMergeDialog(source,target,payload){\n  return new Promise(resolve=>{\n    let d=document.getElementById('mergeMasterItemDialog');if(!d){d=document.createElement('dialog');d.id='mergeMasterItemDialog';d.className='modal';document.body.appendChild(d);}\n    const ss=summary(source),ts=summary(target),purchased=Number(ss.purchased||0)+Number(ts.purchased||0),adjusted=Number(ss.adjusted||0)+Number(ts.adjusted||0),current=purchased-adjusted;\n    d.innerHTML='<div class=\"modal-card\" style=\"max-width:620px\"><div class=\"modal-head\"><div><h2 style=\"margin:0\">Merge master items?</h2><p class=\"muted\" style=\"margin:6px 0 0\">The SKU you entered already resolves to an existing master item.</p></div><button type=\"button\" class=\"icon-btn\" id=\"mergeMasterClose\" aria-label=\"Close\">×</button></div>'+\n      '<div style=\"padding:16px 0\"><div class=\"warning-card\" style=\"margin:0 0 14px\"><strong>'+esc(source.sku)+' · '+esc(source.item_name)+'</strong> will be merged into <strong>'+esc(target.sku)+' · '+esc(target.item_name)+'</strong>.</div>'+\n      '<p>Purchase history, serial numbers, inventory adjustments, maintenance records and other database records linked by Master Item ID will move to <strong>'+esc(target.sku)+'</strong>.</p>'+\n      '<p>The surviving SKU remains <strong>'+esc(target.sku)+'</strong>. Your edited item name, category, unit, photo and description will be applied to the surviving item.</p>'+\n      '<div class=\"detail-cards\" style=\"margin-top:14px\"><div class=\"detail-card\"><span>Combined purchased</span><strong>'+purchased+'</strong></div><div class=\"detail-card\"><span>Combined adjustments</span><strong>-'+adjusted+'</strong></div><div class=\"detail-card\"><span>Expected current</span><strong>'+current+'</strong></div></div>'+\n      '<p class=\"muted\" style=\"margin-top:14px\">Nothing is changed unless you confirm. The database merge is all-or-nothing.</p></div>'+\n      '<div class=\"actions\" style=\"justify-content:flex-end\"><button type=\"button\" id=\"mergeMasterCancel\">Cancel</button><button type=\"button\" class=\"primary\" id=\"mergeMasterConfirm\">Merge items</button></div></div>';\n    let done=false;const finish=v=>{if(done)return;done=true;try{d.close();}catch(_e){}resolve(v);};\n    d.querySelector('#mergeMasterClose').onclick=()=>finish(false);d.querySelector('#mergeMasterCancel').onclick=()=>finish(false);d.querySelector('#mergeMasterConfirm').onclick=()=>finish(true);d.oncancel=e=>{e.preventDefault();finish(false);};d.showModal();\n  });\n}\nasync function v703314dMergeMasterItems(source,target,payload){\n  if(!source||!target)throw new Error('Merge source or target item is missing.');if(String(source.id)===String(target.id))throw new Error('Source and target item cannot be the same.');\n  if(CFG.mode==='supabase'){\n    if(!state.db?.sb)throw new Error('Database connection is unavailable.');\n    const patch={requested_sku:String(payload.sku||'').trim(),item_name:String(payload.item_name||'').trim(),category:String(payload.category||'').trim(),unit:String(payload.unit||'pcs').trim()||'pcs',description:String(payload.description||'').trim(),image_url:payload.image_url??null};\n    const {data,error}=await state.db.sb.rpc('merge_master_items_v703314d',{p_source_id:source.id,p_target_id:target.id,p_target_patch:patch});\n    if(error){const msg=String(error.message||error||'');if(/merge_master_items_v703314d|PGRST202|42883|schema cache|function .* does not exist/i.test(msg))throw new Error('Master item merge database update is not installed yet. Run supabase-v7-03-3-14d-master-item-merge.sql once in Supabase SQL Editor. No inventory records were changed.');throw error;}return data;\n  }\n  const d=state.db.data(),si=d.items.findIndex(i=>String(i.id)===String(source.id)),ti=d.items.findIndex(i=>String(i.id)===String(target.id));if(si<0||ti<0)throw new Error('Merge source or target item no longer exists.');\n  const oldSource={...d.items[si]},oldTarget={...d.items[ti]};for(const key of ['purchaseItems','serials','adjustments','maintenance'])for(const row of d[key]||[])if(String(row.master_item_id)===String(source.id))row.master_item_id=target.id;\n  const targetRec=d.items[ti];Object.assign(targetRec,{item_name:payload.item_name||targetRec.item_name,category:payload.category??targetRec.category,unit:payload.unit||targetRec.unit||'pcs',description:payload.description??targetRec.description,image_url:payload.image_url??targetRec.image_url,updated_at:nowIso()});\n  d.items.splice(si,1);state.db.audit(d,'master_items_merge',String(target.id),'MERGE',{source:oldSource,target:oldTarget},{target:d.items.find(i=>String(i.id)===String(target.id))});state.db.save(d);return {source_id:source.id,target_id:target.id,merged:true};\n}\n$('itemForm').addEventListener('submit',async e=>{\n  e.preventDefault();if(!requireEdit())return;const submit=e.submitter||$('itemForm').querySelector('[type=\"submit\"]');\n  const x={sku:$('itemSku').value.trim(),item_name:$('itemName').value.trim(),category:$('itemCategory').value.trim(),unit:$('itemUnit').value.trim()||'pcs',image_url:$('itemImageUrl')?.value.trim()||null,description:$('itemDescription').value.trim()};const id=$('itemId').value;\n  try{\n    if(!id)throw new Error('New inventory items are created through invoice import.');const candidate=v703314dFindMergeTarget(id,x.sku);\n    if(candidate.ambiguous){const labels=candidate.matches.map(i=>i.sku+' · '+i.item_name).join(', ');throw new Error('More than one existing master item matches this SKU format: '+labels+'. No changes were made. Choose the exact target SKU before merging.');}\n    if(candidate.target){const ok=await v703314dMergeDialog(candidate.source,candidate.target,x);if(!ok){toast('Merge cancelled. No changes were made.');return;}setBusy(submit,true,'Merging…');const result=await v703314dMergeMasterItems(candidate.source,candidate.target,x);$('itemDialog').close();await reload();toast('✓ Merged '+candidate.source.sku+' into '+candidate.target.sku+'. Purchase and inventory history were preserved.');console.info('Master item merge completed',result);return;}\n    setBusy(submit,true);await state.db.updateItem(id,x);$('itemDialog').close();await reload();toast('Item saved.');\n  }catch(err){console.error(err);toast(err.message||String(err));}finally{setBusy(submit,false);}\n});";
    const v703314fItemSubmitCount=src.split(v703314fItemSubmitOld).length-1;
    if(v703314fItemSubmitCount!==1)throw new Error('V7.03.3.14f final Master SKU submit marker mismatch ('+v703314fItemSubmitCount+').');
    src=src.replace(v703314fItemSubmitOld,v703314fItemSubmitNew);
    if(!src.includes('function v703314dFindMergeTarget(')||!src.includes('merge_master_items_v703314d'))throw new Error('V7.03.3.14f final Master SKU merge injection failed.');
    src += "\n(function v703314gInstallDuplicateMergeSafety(){\n  const diagnostics=window.__AV_MASTER_MERGE_14G_DIAGNOSTICS__={\n    version:'7.03.3.14i',\n    installed:false,\n    stage:'boot',\n    analyzer:'pending',\n    error:null\n  };\n  if(window.__V703314G_DUPLICATE_MERGE_SAFETY__){diagnostics.installed=true;diagnostics.stage='already-installed';return;}\n  if(typeof state==='undefined'||!state||!state.data){\n    diagnostics.stage='state-unavailable';\n    diagnostics.error='Inventory state is unavailable.';\n    console.warn('V7.03.3.14i duplicate merge safety deferred: Inventory state is unavailable.');\n    return;\n  }\n\n  const fallbackCompact=v=>String(v??'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'');\n  const fallbackNorm=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();\n  const fallbackAnalyze=(a={},b={},items=[])=>{\n    const skuA=String(a.sku||'').trim(),skuB=String(b.sku||'').trim(),keyA=fallbackCompact(skuA),keyB=fallbackCompact(skuB);\n    if(!keyA||!keyB||keyA!==keyB)return {candidate:false,mergeEligible:false,reason:'different-sku-identity',score:0,blockers:[],warnings:[],a,b};\n    const blockers=[],warnings=[],catA=fallbackNorm(a.category||''),catB=fallbackNorm(b.category||'');\n    if(catA&&catB&&catA!==catB)blockers.push('Categories conflict: '+String(a.category||'').trim()+' vs '+String(b.category||'').trim()+'.');\n    const sameKey=(items||[]).filter(i=>fallbackCompact(i.sku||'')===keyA);\n    if(sameKey.length>2)blockers.push('More than two Master Items share this SKU identity. Review the full duplicate group first.');\n    const nameA=fallbackNorm(a.item_name||a.description||''),nameB=fallbackNorm(b.item_name||b.description||'');\n    if(nameA&&nameB&&nameA!==nameB)warnings.push('Item names differ. Confirm both records refer to the same physical model before merging.');\n    const exact=skuA.toLowerCase()===skuB.toLowerCase();\n    return {candidate:true,mergeEligible:blockers.length===0,reason:exact?'exact-sku':'format-normalized-sku',confidence:exact?'exact':'high',score:exact?1:0.98,normalizedSku:keyA,blockers,warnings,a,b};\n  };\n  const fallbackCandidates=items=>{\n    const rows=items||[],out=[];\n    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const x=fallbackAnalyze(rows[i],rows[j],rows);if(x.candidate)out.push(x);}\n    return out;\n  };\n  const suppliedCore=globalThis.V7033Patch;\n  const coreApi=(suppliedCore&&typeof suppliedCore.analyzeDuplicatePair==='function'&&typeof suppliedCore.duplicateCandidates==='function')\n    ? suppliedCore\n    : {analyzeDuplicatePair:fallbackAnalyze,duplicateCandidates:fallbackCandidates};\n  diagnostics.analyzer=coreApi===suppliedCore?'V7033Patch':'built-in-fallback';\n  window.__V703314G_DUPLICATE_MERGE_SAFETY__=true;\n\n  function v703314gMetrics(item){\n    const id=String(item?.id||'');\n    const purchaseItems=(state.data?.purchaseItems||[]).filter(x=>String(x.master_item_id)===id);\n    const purchased=purchaseItems.reduce((n,x)=>n+Number(x.quantity||0),0);\n    const adjusted=(state.data?.adjustments||[]).filter(x=>String(x.master_item_id)===id).reduce((n,x)=>n+Number(x.quantity||0),0);\n    const serials=(state.data?.serials||[]).filter(x=>String(x.master_item_id)===id).map(x=>x.serial_number).filter(Boolean);\n    const purchaseIds=new Set(purchaseItems.map(x=>String(x.purchase_id||'')));\n    const invoices=(state.data?.purchases||[]).filter(x=>purchaseIds.has(String(x.id||'')));\n    const maintenance=(state.data?.maintenance||[]).filter(x=>String(x.master_item_id)===id);\n    return {\n      purchased:Number(purchased||0),\n      adjusted:Number(adjusted||0),\n      current:Number(purchased-adjusted),\n      serialCount:serials.length,\n      invoiceCount:invoices.length,\n      maintenanceCount:maintenance.length,\n      suppliers:[...new Set(invoices.map(x=>String(x.supplier_name||'').trim()).filter(Boolean))]\n    };\n  }\n\n  function v703314gEvaluateDirection(source,target){\n    const analysis=coreApi.analyzeDuplicatePair(source,target,state.data?.items||[]);\n    const sourceMetrics=v703314gMetrics(source),targetMetrics=v703314gMetrics(target);\n    const blockers=[...(analysis.blockers||[])],warnings=[...(analysis.warnings||[])];\n    if(!analysis.candidate)blockers.unshift('The source and surviving SKU do not resolve to the same normalized SKU identity.');\n    const combined={\n      purchased:sourceMetrics.purchased+targetMetrics.purchased,\n      adjusted:sourceMetrics.adjusted+targetMetrics.adjusted,\n      current:sourceMetrics.current+targetMetrics.current,\n      serialCount:sourceMetrics.serialCount+targetMetrics.serialCount,\n      invoiceCount:sourceMetrics.invoiceCount+targetMetrics.invoiceCount,\n      maintenanceCount:sourceMetrics.maintenanceCount+targetMetrics.maintenanceCount\n    };\n    for(const [name,value] of Object.entries(combined)){\n      if(!Number.isFinite(Number(value)))blockers.push('Combined '+name+' is not a valid number.');\n    }\n    if(combined.current<0)blockers.push('Combined current inventory would be negative ('+combined.current+'). Review adjustments before merging.');\n    const sourceSerials=new Set(itemSerials(source.id).map(x=>String(x).trim().toLowerCase()).filter(Boolean));\n    const duplicateSerials=itemSerials(target.id).map(x=>String(x).trim().toLowerCase()).filter(x=>x&&sourceSerials.has(x));\n    if(duplicateSerials.length)blockers.push('The two Master Items contain overlapping serial numbers. Resolve serial ownership before merging.');\n    return {analysis,sourceMetrics,targetMetrics,combined,blockers:[...new Set(blockers)],warnings:[...new Set(warnings)],allowed:analysis.candidate&&blockers.length===0};\n  }\n\n  function v703314gMetricCard(item,metrics,label){\n    const supplier=metrics.suppliers.length?metrics.suppliers.join(', '):'—';\n    return '<section style=\"border:1px solid #dbe4f0;border-radius:12px;padding:14px;min-width:0\">'+\n      '<small style=\"display:block;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.04em\">'+esc(label)+'</small>'+\n      '<h3 style=\"margin:5px 0 2px;font-size:16px\">'+esc(item.sku||'No SKU')+'</h3>'+\n      '<p style=\"margin:0 0 12px;color:#475569\">'+esc(item.item_name||'Unnamed item')+'</p>'+\n      '<div style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;font-size:12px\">'+\n        '<span>Purchased <strong style=\"float:right\">'+metrics.purchased+'</strong></span>'+\n        '<span>Current <strong style=\"float:right\">'+metrics.current+'</strong></span>'+\n        '<span>Adjustments <strong style=\"float:right\">'+metrics.adjusted+'</strong></span>'+\n        '<span>Serials <strong style=\"float:right\">'+metrics.serialCount+'</strong></span>'+\n        '<span>Invoices <strong style=\"float:right\">'+metrics.invoiceCount+'</strong></span>'+\n        '<span>Maintenance <strong style=\"float:right\">'+metrics.maintenanceCount+'</strong></span>'+\n      '</div>'+\n      '<p style=\"margin:10px 0 0;color:#64748b;font-size:12px\">Supplier: '+esc(supplier)+'</p>'+\n    '</section>';\n  }\n\n  function v703314gEnsureMergeDialog(){\n    let d=document.getElementById('mergeMasterItemDialog');\n    if(!d){d=document.createElement('dialog');d.id='mergeMasterItemDialog';d.className='modal';document.body.appendChild(d);}\n    return d;\n  }\n\n  v703314dMergeDialog=function(source,target,payload){\n    return new Promise(resolve=>{\n      const d=v703314gEnsureMergeDialog(),review=v703314gEvaluateDirection(source,target);\n      const blockers=review.blockers,warnings=review.warnings;\n      const issueHtml=blockers.length\n        ? '<div style=\"border:1px solid #f5c2c0;background:#fff1f0;color:#912018;border-radius:10px;padding:12px;margin-top:14px\"><strong>Merge blocked</strong><ul style=\"margin:8px 0 0;padding-left:18px\">'+blockers.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>'\n        : warnings.length\n          ? '<div style=\"border:1px solid #f6d88a;background:#fff8df;color:#854d0e;border-radius:10px;padding:12px;margin-top:14px\"><strong>Check before merging</strong><ul style=\"margin:8px 0 0;padding-left:18px\">'+warnings.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>'\n          : '<div style=\"border:1px solid #b7dfc2;background:#f0fff4;color:#166534;border-radius:10px;padding:12px;margin-top:14px\"><strong>Identity check passed.</strong> Both records resolve to the same normalized SKU identity.</div>';\n      d.innerHTML='<div class=\"modal-card\" style=\"max-width:760px\">'+\n        '<div class=\"modal-head\"><div><h2 style=\"margin:0\">Review Master Item merge</h2><p class=\"muted\" style=\"margin:6px 0 0\">Nothing changes until you confirm. The surviving Master Item is shown on the right.</p></div><button type=\"button\" class=\"icon-btn\" id=\"mergeMasterClose\" aria-label=\"Close\">×</button></div>'+\n        '<div style=\"padding:16px 0\">'+\n          '<div style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px\">'+\n            v703314gMetricCard(source,review.sourceMetrics,'Merge / remove')+\n            v703314gMetricCard(target,review.targetMetrics,'Keep / surviving item')+\n          '</div>'+\n          '<div class=\"detail-cards\" style=\"margin-top:14px\"><div class=\"detail-card\"><span>Combined purchased</span><strong>'+review.combined.purchased+'</strong></div><div class=\"detail-card\"><span>Combined adjustments</span><strong>-'+review.combined.adjusted+'</strong></div><div class=\"detail-card\"><span>Expected current</span><strong>'+review.combined.current+'</strong></div></div>'+\n          issueHtml+\n          '<label style=\"display:flex;gap:9px;align-items:flex-start;margin-top:16px;padding:12px;border:1px solid #dbe4f0;border-radius:10px\"><input id=\"mergeMasterAcknowledgement\" type=\"checkbox\" '+(blockers.length?'disabled':'')+'><span>I checked both records and confirm that <strong>'+esc(source.sku)+'</strong> should be merged into <strong>'+esc(target.sku)+'</strong>.</span></label>'+\n        '</div>'+\n        '<div class=\"actions\" style=\"justify-content:flex-end\"><button type=\"button\" id=\"mergeMasterCancel\">Cancel</button><button type=\"button\" class=\"primary\" id=\"mergeMasterConfirm\" disabled>Merge items</button></div>'+\n      '</div>';\n      let done=false;\n      const confirm=d.querySelector('#mergeMasterConfirm'),ack=d.querySelector('#mergeMasterAcknowledgement');\n      const finish=v=>{if(done)return;done=true;try{d.close();}catch(_e){}resolve(v);};\n      d.querySelector('#mergeMasterClose').onclick=()=>finish(false);\n      d.querySelector('#mergeMasterCancel').onclick=()=>finish(false);\n      ack.onchange=()=>{confirm.disabled=blockers.length>0||!ack.checked;};\n      confirm.onclick=()=>finish(true);\n      d.oncancel=e=>{e.preventDefault();finish(false);};\n      d.showModal();\n    });\n  };\n\n  const v703314gBaseMergeMasterItems=v703314dMergeMasterItems;\n  v703314dMergeMasterItems=async function(source,target,payload){\n    const pre=v703314gEvaluateDirection(source,target);\n    if(!pre.allowed)throw new Error('Master Item merge blocked: '+pre.blockers.join(' '));\n    const result=await v703314gBaseMergeMasterItems(source,target,payload);\n    let fresh;\n    try{fresh=await state.db.load();}\n    catch(loadErr){\n      const e=new Error('Merge completed, but refreshed-data verification could not run. Reload Inventory and review Data Health before making another merge.');\n      e.cause=loadErr;e.mergeCompleted=true;throw e;\n    }\n    const sourceStill=(fresh.items||[]).some(x=>String(x.id)===String(source.id));\n    const targetFresh=(fresh.items||[]).find(x=>String(x.id)===String(target.id));\n    const targetPurchase=(fresh.purchaseItems||[]).filter(x=>String(x.master_item_id)===String(target.id)).reduce((n,x)=>n+Number(x.quantity||0),0);\n    const targetAdjusted=(fresh.adjustments||[]).filter(x=>String(x.master_item_id)===String(target.id)).reduce((n,x)=>n+Number(x.quantity||0),0);\n    const targetSerials=(fresh.serials||[]).filter(x=>String(x.master_item_id)===String(target.id)).length;\n    const targetMaintenance=(fresh.maintenance||[]).filter(x=>String(x.master_item_id)===String(target.id)).length;\n    const staleRefs=[\n      ...(fresh.purchaseItems||[]),\n      ...(fresh.adjustments||[]),\n      ...(fresh.serials||[]),\n      ...(fresh.maintenance||[])\n    ].filter(x=>String(x.master_item_id)===String(source.id)).length;\n    const mismatches=[];\n    if(sourceStill)mismatches.push('source Master Item still exists');\n    if(!targetFresh)mismatches.push('surviving Master Item is missing');\n    if(staleRefs)mismatches.push(staleRefs+' relationship(s) still reference the source');\n    if(targetPurchase!==pre.combined.purchased)mismatches.push('purchased quantity expected '+pre.combined.purchased+' but refreshed '+targetPurchase);\n    if(targetAdjusted!==pre.combined.adjusted)mismatches.push('adjustments expected '+pre.combined.adjusted+' but refreshed '+targetAdjusted);\n    if(targetPurchase-targetAdjusted!==pre.combined.current)mismatches.push('current inventory expected '+pre.combined.current+' but refreshed '+(targetPurchase-targetAdjusted));\n    if(targetSerials!==pre.combined.serialCount)mismatches.push('serial count expected '+pre.combined.serialCount+' but refreshed '+targetSerials);\n    if(targetMaintenance!==pre.combined.maintenanceCount)mismatches.push('maintenance count expected '+pre.combined.maintenanceCount+' but refreshed '+targetMaintenance);\n    if(result&&result.total_purchased!==undefined&&Number(result.total_purchased)!==targetPurchase)mismatches.push('RPC/refreshed purchased totals disagree');\n    if(result&&result.total_adjusted!==undefined&&Number(result.total_adjusted)!==targetAdjusted)mismatches.push('RPC/refreshed adjustment totals disagree');\n    if(result&&result.serial_count!==undefined&&Number(result.serial_count)!==targetSerials)mismatches.push('RPC/refreshed serial totals disagree');\n    if(result&&result.maintenance_count!==undefined&&result.maintenance_count!==null&&Number(result.maintenance_count)!==targetMaintenance)mismatches.push('RPC/refreshed maintenance totals disagree');\n    const verification={ok:mismatches.length===0,mismatches,source_id:source.id,target_id:target.id,purchased:targetPurchase,adjusted:targetAdjusted,current:targetPurchase-targetAdjusted,serials:targetSerials,maintenance:targetMaintenance};\n    window.__AV_MASTER_MERGE_14G_LAST_VERIFY__=verification;\n    if(!verification.ok){\n      state.data=fresh;\n      try{renderAll();}catch(_e){}\n      const e=new Error('Merge completed, but refreshed-data verification needs review: '+mismatches.join('; ')+'. Do not perform another merge until this is checked.');\n      e.mergeCompleted=true;e.verification=verification;throw e;\n    }\n    return {...(result||{}),post_verify:verification};\n  };\n\n  duplicateLookingPairs=function(){\n    return coreApi.duplicateCandidates(state.data?.items||[]).map(x=>({a:x.a,b:x.b,score:x.score,v703314g:x}));\n  };\n\n  const v703314gBaseIssueReviewButton=issueReviewButton;\n  issueReviewButton=function(x){\n    if(x&&x.type==='Possible duplicate SKU'&&x.entity_type==='master_items_pair'){\n      const ids=String(x.entity_id||'').split('+').filter(Boolean);\n      if(ids.length===2){\n        const label=canEdit()?'Compare / merge':'Compare';\n        return '<button class=\"secondary small-btn\" data-health-merge=\"'+esc(ids.join('|'))+'\" data-health-key=\"'+esc(x.key||'')+'\">'+label+'</button>';\n      }\n    }\n    return v703314gBaseIssueReviewButton(x);\n  };\n\n  function v703314gEnsureDuplicateReviewDialog(){\n    let d=document.getElementById('v703314gDuplicateReviewDialog');\n    if(!d){d=document.createElement('dialog');d.id='v703314gDuplicateReviewDialog';d.className='dialog wide';document.body.appendChild(d);}\n    return d;\n  }\n\n  async function v703314gOpenDuplicateReview(idA,idB){\n    const a=(state.data?.items||[]).find(x=>String(x.id)===String(idA));\n    const b=(state.data?.items||[]).find(x=>String(x.id)===String(idB));\n    if(!a||!b){toast('One of the duplicate candidates no longer exists. Run Data Health again.');return;}\n    const analysis=coreApi.analyzeDuplicatePair(a,b,state.data?.items||[]);\n    const am=v703314gMetrics(a),bm=v703314gMetrics(b),d=v703314gEnsureDuplicateReviewDialog(),editable=canEdit();\n    d.innerHTML='<div class=\"dialog-head\"><div><h2>Potential duplicate Master Items</h2><p>Compare both records. No automatic merge will be performed.</p></div><button id=\"v703314gDupClose\" class=\"icon-btn\" type=\"button\" aria-label=\"Close\">×</button></div>'+\n      '<div style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px\">'+\n        '<label style=\"display:block\">'+(editable?'<input type=\"radio\" name=\"v703314gKeep\" value=\"'+esc(a.id)+'\"> <strong>Keep this item</strong>':'<strong>Record A</strong>')+v703314gMetricCard(a,am,'Master Item A')+'</label>'+\n        '<label style=\"display:block\">'+(editable?'<input type=\"radio\" name=\"v703314gKeep\" value=\"'+esc(b.id)+'\"> <strong>Keep this item</strong>':'<strong>Record B</strong>')+v703314gMetricCard(b,bm,'Master Item B')+'</label>'+\n      '</div>'+\n      '<div style=\"margin-top:14px;padding:12px;border:1px solid '+(analysis.blockers?.length?'#f5c2c0':'#dbe4f0')+';border-radius:10px\">'+\n        '<strong>Detection: '+esc(analysis.reason==='exact-sku'?'Exact SKU match':'Same normalized SKU')+'</strong>'+\n        (analysis.blockers?.length?'<p style=\"margin:6px 0 0;color:#912018\">'+esc(analysis.blockers.join(' '))+'</p>':'<p style=\"margin:6px 0 0;color:#64748b\">Choose which Master Item should survive, then review the final merge before confirming.</p>')+\n      '</div>'+\n      '<div class=\"dialog-actions\"><button id=\"v703314gDupCancel\" class=\"secondary\" type=\"button\">Close</button>'+(editable?'<button id=\"v703314gDupNext\" class=\"primary\" type=\"button\" disabled>Review merge</button>':'')+'</div>';\n    const close=()=>{try{d.close();}catch(_e){}};\n    d.querySelector('#v703314gDupClose').onclick=close;\n    d.querySelector('#v703314gDupCancel').onclick=close;\n    if(editable){\n      const next=d.querySelector('#v703314gDupNext');\n      d.querySelectorAll('input[name=\"v703314gKeep\"]').forEach(r=>r.onchange=()=>{next.disabled=!d.querySelector('input[name=\"v703314gKeep\"]:checked')||!!analysis.blockers?.length;});\n      next.onclick=async()=>{\n        const selected=d.querySelector('input[name=\"v703314gKeep\"]:checked');\n        if(!selected)return;\n        const target=String(selected.value)===String(a.id)?a:b,source=target===a?b:a;\n        const payload={sku:target.sku,item_name:target.item_name,category:target.category,unit:target.unit||'pcs',image_url:target.image_url??null,description:target.description||''};\n        close();\n        const ok=await v703314dMergeDialog(source,target,payload);\n        if(!ok){toast('Merge cancelled. No changes were made.');return;}\n        try{\n          const result=await v703314dMergeMasterItems(source,target,payload);\n          await reload();\n          if($('attentionDialog')?.open)$('attentionDialog').close();\n          if($('healthDialog')?.open)$('healthDialog').close();\n          toast('✓ Merged '+source.sku+' into '+target.sku+'. Refreshed inventory data verified.');\n          console.info('V7.03.3.14g Data Health merge completed',result);\n        }catch(err){\n          console.error('V7.03.3.14g Data Health merge failed',err);\n          toast(err.message||String(err));\n        }\n      };\n    }\n    d.showModal();\n    window.lucide?.createIcons();\n  }\n\n  for(const id of ['attentionList','healthIssueTable']){\n    const el=document.getElementById(id);\n    if(!el)continue;\n    el.addEventListener('click',e=>{\n      const b=e.target.closest('[data-health-merge]');\n      if(!b)return;\n      e.preventDefault();e.stopImmediatePropagation();\n      const ids=String(b.dataset.healthMerge||'').split('|');\n      if(ids.length===2)v703314gOpenDuplicateReview(ids[0],ids[1]);\n    },true);\n  }\n\n  Object.assign(diagnostics,{\n    version:'7.03.3.14i',\n    installed:true,\n    stage:'ready',\n    candidates:()=>coreApi.duplicateCandidates(state.data?.items||[]).map(x=>({a:x.a?.sku,b:x.b?.sku,reason:x.reason,mergeEligible:x.mergeEligible,blockers:x.blockers})),\n    lastVerification:()=>window.__AV_MASTER_MERGE_14G_LAST_VERIFY__||null\n  });\n})();\n";

    src += "\n(function v703314hInstallWorkflowHardening(){\n  if(window.__V703314H_WORKFLOW_HARDENING__)return;\n  if(typeof v703314dMergeDialog!=='function'||typeof v703314dMergeMasterItems!=='function'){\n    console.error('V7.03.3.14i workflow hardening could not bind to the verified Master Item merge workflow.');\n    window.__AV_UI_WORKFLOW_14H__={version:'7.03.3.14i',installed:false,error:'merge workflow unavailable'};\n    return;\n  }\n  window.__V703314H_WORKFLOW_HARDENING__=true;\n\n  let mergeDialogPromise=null;\n  let mergeInFlight=false;\n  let lastAudit=null;\n\n  const baseMergeDialog=v703314dMergeDialog;\n  v703314dMergeDialog=function(...args){\n    if(mergeDialogPromise){\n      try{document.getElementById('mergeMasterItemDialog')?.focus();}catch(_e){}\n      return mergeDialogPromise;\n    }\n    mergeDialogPromise=Promise.resolve().then(()=>baseMergeDialog(...args)).finally(()=>{mergeDialogPromise=null;});\n    return mergeDialogPromise;\n  };\n\n  const baseMergeMasterItems=v703314dMergeMasterItems;\n  v703314dMergeMasterItems=async function(...args){\n    if(mergeInFlight)throw new Error('A Master Item merge is already in progress. Wait for it to finish before starting another merge.');\n    mergeInFlight=true;\n    try{return await baseMergeMasterItems(...args);}\n    finally{mergeInFlight=false;}\n  };\n\n  function v703314hDuplicateIds(){\n    const seen=new Set(),dupes=[];\n    document.querySelectorAll('[id]').forEach(el=>{\n      const id=String(el.id||'').trim();\n      if(!id)return;\n      if(seen.has(id))dupes.push(id);else seen.add(id);\n    });\n    return [...new Set(dupes)];\n  }\n\n  function v703314hLayoutStatus(){\n    const toolbar=document.querySelector('#inventoryView .toolbar');\n    const group=document.getElementById('inventoryGroup');\n    const search=document.querySelector('#inventoryView .toolbar .input-icon');\n    const issues=[];\n    if(group&&group.getClientRects().length&&group.clientWidth>0&&group.scrollWidth>group.clientWidth+1)issues.push('Inventory grouping control is horizontally clipped.');\n    if(toolbar&&toolbar.getClientRects().length){\n      const tb=toolbar.getBoundingClientRect();\n      if(toolbar.scrollWidth>toolbar.clientWidth+2)issues.push('Inventory toolbar has horizontal overflow.');\n      const visible=[...toolbar.children].filter(el=>el.getClientRects().length);\n      for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){\n        const a=visible[i].getBoundingClientRect(),b=visible[j].getBoundingClientRect();\n        const xOverlap=Math.min(a.right,b.right)-Math.max(a.left,b.left);\n        const yOverlap=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);\n        if(xOverlap>2&&yOverlap>2)issues.push('Inventory toolbar controls overlap.');\n      }\n      if(search&&search.getClientRects().length&&search.getBoundingClientRect().right>tb.right+2)issues.push('Inventory search extends outside the toolbar.');\n    }\n    return {ok:issues.length===0,issues};\n  }\n\n  function v703314hAudit(){\n    const criticalIds=['inventoryView','inventorySearch','categoryFilter','inventoryGroup','inventoryHealthBtn','itemDialog','itemForm','saveItemBtn','importDialog','parsedItems','saveImportBtn','maintenanceDialog','healthDialog','attentionDialog','appVersion','releaseCurrentVersion','releaseUpcomingVersion'];\n    const missing=criticalIds.filter(id=>!document.getElementById(id));\n    const duplicateIds=v703314hDuplicateIds();\n    const currentVersion=String(document.getElementById('releaseCurrentVersion')?.textContent||'').trim();\n    const appVersion=String(document.getElementById('appVersion')?.textContent||'').trim();\n    const groupLabel=String(document.querySelector('#inventoryGroup option[value=\"company\"]')?.textContent||'').trim();\n    const version='7.03.3.14i';\n    const versionIssues=[];\n    if(currentVersion&&currentVersion!=='v'+version)versionIssues.push('Release Notes current version does not match '+version+'.');\n    if(appVersion&&!appVersion.includes(version))versionIssues.push('Dashboard version does not match '+version+'.');\n    if(groupLabel!=='Group by Company')versionIssues.push('Inventory group label changed or is missing.');\n    const layout=v703314hLayoutStatus();\n    const issues=[\n      ...missing.map(x=>'Missing critical UI element: '+x),\n      ...duplicateIds.map(x=>'Duplicate DOM id: '+x),\n      ...versionIssues,\n      ...layout.issues\n    ];\n    lastAudit={version,ok:issues.length===0,issues,missing,duplicateIds,layout,mergeInFlight,mergeDialogPending:!!mergeDialogPromise,checkedAt:new Date().toISOString()};\n    if(issues.length)console.warn('V7.03.3.14h UI/workflow regression audit',lastAudit);\n    return lastAudit;\n  }\n\n  let resizeTimer=null;\n  window.addEventListener('resize',()=>{\n    clearTimeout(resizeTimer);\n    resizeTimer=setTimeout(v703314hAudit,120);\n  },{passive:true});\n\n  const runAudit=()=>requestAnimationFrame(()=>requestAnimationFrame(v703314hAudit));\n  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',runAudit,{once:true});else runAudit();\n\n  window.__AV_UI_WORKFLOW_14H__={\n    version:'7.03.3.14i',\n    installed:true,\n    audit:v703314hAudit,\n    status:()=>lastAudit||v703314hAudit(),\n    mergeState:()=>({inFlight:mergeInFlight,dialogPending:!!mergeDialogPromise})\n  };\n})();\n";

    src += "\n(function v703314iInstallDataHealthAndMergeHistory(){\n  const diagnostics=window.__AV_14I_DIAGNOSTICS__={version:'7.03.3.14i',installed:false,stage:'boot',error:null};\n  try{\n    if(window.__V703314I_DATA_HEALTH_HISTORY__){diagnostics.installed=true;diagnostics.stage='already-installed';return;}\n    if(typeof state==='undefined'||!state?.data||typeof buildAllHealthIssues!=='function'||typeof markHealthIssueReviewed!=='function'){\n      diagnostics.stage='dependencies-unavailable';\n      diagnostics.error='Data Health runtime dependencies are unavailable.';\n      console.warn('V7.03.3.14i Data Health/history enhancement skipped: runtime dependencies are unavailable.');\n      return;\n    }\n    window.__V703314I_DATA_HEALTH_HISTORY__=true;\n\n    let healthTab='open';\n    const previousIssueReviewButton=issueReviewButton;\n    const previousAuditIcon=auditIcon;\n    const previousAuditLabel=auditLabel;\n    const previousFriendlyAudit=friendlyAudit;\n    const previousConsolidatedAudit=consolidatedAudit;\n    const previousRenderDashboard=renderDashboard;\n\n    function reviewMap(){\n      return new Map((state.data?.healthReviews||[]).filter(r=>r?.issue_key).map(r=>[String(r.issue_key),r]));\n    }\n    function currentIssueMap(){\n      return new Map((buildAllHealthIssues()||[]).map(x=>[String(x.key),x]));\n    }\n    function currentHealthIssues(){\n      const reviews=reviewMap();\n      return (buildAllHealthIssues()||[]).map(x=>({...x,review:reviews.get(String(x.key))||null}));\n    }\n    function reviewWho(r){\n      if(!r)return '—';\n      try{return profileName(r.reviewed_by)||String(r.reviewed_by||'Team Member');}catch(_e){return String(r.reviewed_by||'Team Member');}\n    }\n    function healthHistory(){\n      const current=currentIssueMap();\n      return [...(state.data?.healthReviews||[])]\n        .sort((a,b)=>new Date(b.reviewed_at||0)-new Date(a.reviewed_at||0))\n        .map(r=>({...r,resolution_status:current.has(String(r.issue_key))?'still-detected':'resolved',current_issue:current.get(String(r.issue_key))||null,reviewed_by_name:reviewWho(r)}));\n    }\n\n    // A review is now an acknowledgement/history record, not a permanent suppression.\n    // The finding remains Open until its underlying condition is genuinely corrected.\n    buildHealthIssues=function(){return currentHealthIssues();};\n\n    function reviewedBadge(x){\n      return x?.review?'<span class=\"health-review-state reviewed\" title=\"Reviewed '+esc(fmtDT(x.review.reviewed_at))+'\">Reviewed</span>':'';\n    }\n    issueReviewButton=function(x){\n      if(x?.type==='Possible duplicate SKU'&&x?.entity_type==='master_items_pair'){\n        const base=previousIssueReviewButton(x);\n        return '<div class=\"health-actions\">'+reviewedBadge(x)+base+'</div>';\n      }\n      const open='<button class=\"secondary small-btn\" type=\"button\" data-health-open=\"'+esc(x.key)+'\">Open</button>';\n      const reviewed=reviewedBadge(x);\n      const acknowledge=canEdit()&&!x.review?'<button class=\"secondary small-btn\" type=\"button\" data-health-review=\"'+esc(x.key)+'\">Mark reviewed</button>':'';\n      return '<div class=\"health-actions\">'+reviewed+open+acknowledge+'</div>';\n    };\n\n    function issueRow14i(x){\n      const reviewNote=x.review?'<span class=\"health-review-note\">Reviewed previously · still detected</span>':'';\n      return '<div class=\"attention-row '+esc(x.severity)+'\"><span class=\"attention-severity\"><i data-lucide=\"'+(x.severity==='high'?'triangle-alert':x.severity==='medium'?'circle-alert':'info')+'\"></i></span><div><strong>'+esc(x.type)+' · '+esc(x.title)+'</strong><p>'+esc(x.detail)+'</p>'+reviewNote+'</div>'+issueReviewButton(x)+'</div>';\n    }\n\n    openAttention=function(){\n      const issues=buildHealthIssues(),score=healthScore(issues),reviewed=issues.filter(x=>x.review).length;\n      $('attentionSummary').innerHTML='<strong>'+issues.length+' active finding'+(issues.length===1?'':'s')+'</strong><span>Data health score: '+score+'%'+(reviewed?' · '+reviewed+' reviewed but still detected':'')+'</span>';\n      $('attentionList').innerHTML=issues.length?issues.map(issueRow14i).join(''):'<div class=\"empty\">No active findings. Your records look healthy.</div>';\n      $('attentionDialog').showModal();window.lucide?.createIcons();\n    };\n\n    function renderHealthOpen(){\n      const issues=buildHealthIssues();\n      const rows=issues.map(x=>'<tr><td><span class=\"health-pill '+esc(x.severity)+'\">'+esc(x.severity)+'</span></td><td>'+(x.review?'<span class=\"health-history-status still\">Reviewed · still detected</span>':'<span class=\"health-history-status open\">Open</span>')+'</td><td>'+esc(x.type)+'</td><td>'+esc(x.title)+'</td><td>'+esc(x.detail)+'</td><td>'+issueReviewButton(x)+'</td></tr>').join('');\n      $('healthIssueTable').innerHTML=rows?'<table><thead><tr><th>Priority</th><th>Status</th><th>Check</th><th>Record</th><th>Finding</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class=\"empty\">No active findings.</div>';\n    }\n    function renderHealthHistory(){\n      const history=healthHistory();\n      const rows=history.map(r=>{\n        const current=r.current_issue;\n        const status=r.resolution_status==='resolved'\n          ?'<span class=\"health-history-status resolved\">Resolved</span>'\n          :'<span class=\"health-history-status still\">Still detected</span>';\n        const open=current?'<button class=\"secondary small-btn\" type=\"button\" data-health-open=\"'+esc(current.key)+'\">Open current</button>':'';\n        return '<tr><td>'+status+'</td><td>'+esc(r.issue_type||'Finding')+'</td><td>'+esc(r.title||'—')+'</td><td>'+esc(r.detail||'—')+'</td><td>'+esc(r.reviewed_by_name)+'<br><span class=\"muted\">'+esc(fmtDT(r.reviewed_at))+'</span></td><td>'+open+'</td></tr>';\n      }).join('');\n      $('healthIssueTable').innerHTML=rows?'<table><thead><tr><th>Resolution</th><th>Check</th><th>Record</th><th>Reviewed finding</th><th>Reviewed by</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class=\"empty\">No reviewed Data Health history yet.</div>';\n    }\n\n    function renderHealthDialog14i(){\n      const issues=buildHealthIssues(),score=healthScore(issues),history=healthHistory(),resolved=history.filter(x=>x.resolution_status==='resolved').length,still=history.length-resolved;\n      $('healthDialogSummary').innerHTML='<div class=\"health-overview health-overview-14i\"><div class=\"health-overview-score\"><strong>'+score+'%</strong><span>'+esc(healthLabel(score))+'</span></div><div class=\"health-resolution-summary\"><span><strong>'+issues.length+'</strong> active</span><span><strong>'+resolved+'</strong> resolved</span><span><strong>'+still+'</strong> reviewed / still detected</span></div><div class=\"health-tabs\"><button type=\"button\" class=\"'+(healthTab==='open'?'active':'')+'\" data-health-tab=\"open\">Open findings</button><button type=\"button\" class=\"'+(healthTab==='history'?'active':'')+'\" data-health-tab=\"history\">Review history ('+history.length+')</button></div></div>';\n      healthTab==='history'?renderHealthHistory():renderHealthOpen();\n      window.lucide?.createIcons();\n    }\n\n    openHealth=function(){healthTab='open';renderHealthDialog14i();$('healthDialog').showModal();};\n\n    function openCurrentIssue(key){\n      const issue=(buildAllHealthIssues()||[]).find(x=>String(x.key)===String(key));\n      if(!issue){toast('This finding is no longer detected. It is now resolved.');renderHealthDialog14i();return;}\n      if($('attentionDialog')?.open)$('attentionDialog').close();\n      if($('healthDialog')?.open)$('healthDialog').close();\n      showView(issue.view||'inventory');\n      if(issue.item_id)setTimeout(()=>openDetail(issue.item_id),50);\n    }\n\n    for(const id of ['attentionList','healthIssueTable','healthDialogSummary']){\n      const el=document.getElementById(id);if(!el||el.dataset.v703314iHealthBound==='1')continue;\n      el.dataset.v703314iHealthBound='1';\n      el.addEventListener('click',async e=>{\n        const tab=e.target.closest('[data-health-tab]');\n        if(tab){e.preventDefault();e.stopImmediatePropagation();healthTab=tab.dataset.healthTab==='history'?'history':'open';renderHealthDialog14i();return;}\n        const open=e.target.closest('[data-health-open]');\n        if(open){e.preventDefault();e.stopImmediatePropagation();openCurrentIssue(open.dataset.healthOpen);return;}\n        const review=e.target.closest('[data-health-review]');\n        if(review){\n          e.preventDefault();e.stopImmediatePropagation();\n          const issue=(buildAllHealthIssues()||[]).find(x=>String(x.key)===String(review.dataset.healthReview));\n          if(!issue){toast('This finding is no longer detected.');renderHealthDialog14i();return;}\n          review.disabled=true;\n          const saved=await markHealthIssueReviewed(issue);\n          if(saved){\n            toast('Review recorded. The finding stays open until the underlying condition is corrected.');\n            if($('healthDialog')?.open)renderHealthDialog14i();\n            if($('attentionDialog')?.open)openAttention();\n          }else review.disabled=false;\n          return;\n        }\n      },true);\n    }\n\n    function isMergeAudit(a){return a?.entity_type==='master_items_merge'||String(a?.action||'').toUpperCase()==='MERGE';}\n    function mergeDetails(a){\n      const o=a?.old_data||{},n=a?.new_data||{},source=o.source||{},targetBefore=o.target_before||{},target=n.target||{};\n      const targetSku=target.sku||targetBefore.sku||'Master Item';\n      const moved=n.moved_rows&&typeof n.moved_rows==='object'?n.moved_rows:{};\n      return {\n        sourceSku:source.sku||'Master Item',\n        sourceName:source.item_name||'',\n        targetSku,\n        targetName:target.item_name||targetBefore.item_name||'',\n        totalPurchased:Number(n.total_purchased||0),\n        totalAdjusted:Number(n.total_adjusted||0),\n        currentInventory:Number(n.current_inventory||0),\n        serialCount:Number(n.serial_count||0),\n        maintenanceCount:n.maintenance_count==null?null:Number(n.maintenance_count||0),\n        movedRows:moved\n      };\n    }\n\n    auditIcon=function(a){return isMergeAudit(a)?['git-merge','merge']:previousAuditIcon(a);};\n    auditLabel=function(a){return isMergeAudit(a)?['Merged','merged']:previousAuditLabel(a);};\n    friendlyAudit=function(a){\n      if(!isMergeAudit(a))return previousFriendlyAudit(a);\n      const d=mergeDetails(a);\n      return 'Merged '+d.sourceSku+' into '+d.targetSku+' — '+d.totalPurchased+' purchased, '+d.currentInventory+' current, '+d.serialCount+' serial'+(d.serialCount===1?'':'s');\n    };\n\n    consolidatedAudit=function(){\n      const list=previousConsolidatedAudit();\n      const merges=list.filter(isMergeAudit);\n      if(!merges.length)return list;\n      return list.filter(row=>{\n        if(isMergeAudit(row))return true;\n        for(const merge of merges){\n          if(!sameAuditActor(merge,row)||!nearAuditTime(merge,row,15000))continue;\n          const d=mergeDetails(merge),o=row.old_data||{},n=row.new_data||{};\n          const sourceId=String((merge.old_data||{}).source?.id||''),targetId=String((merge.new_data||{}).target?.id||(merge.old_data||{}).target_before?.id||'');\n          const rowId=String(row.entity_id||n.id||o.id||'');\n          if(row.entity_type==='master_items'&&row.action==='DELETE'&&sourceId&&rowId===sourceId)return false;\n          if(row.entity_type==='master_items'&&row.action==='UPDATE'&&targetId&&rowId===targetId)return false;\n          if(['purchase_items','serial_numbers','inventory_adjustments','maintenance_records'].includes(row.entity_type)&&row.action==='UPDATE'&&sourceId&&targetId&&String(o.master_item_id||'')===sourceId&&String(n.master_item_id||'')===targetId)return false;\n        }\n        return true;\n      });\n    };\n\n    function mergeDetailHtml(a){\n      const d=mergeDetails(a),moved=Object.entries(d.movedRows||{}).filter(([,v])=>Number(v)>0);\n      const movedText=moved.length?moved.map(([k,v])=>esc(k.replaceAll('.master_item_id','').replaceAll('_',' '))+': <strong>'+Number(v)+'</strong>').join(' · '):'No relationship counts reported.';\n      return '<div class=\"merge-audit-detail\"><div><span>Removed source</span><strong>'+esc(d.sourceSku)+'</strong><small>'+esc(d.sourceName||'—')+'</small></div><div><span>Surviving item</span><strong>'+esc(d.targetSku)+'</strong><small>'+esc(d.targetName||'—')+'</small></div><div><span>Purchased</span><strong>'+d.totalPurchased+'</strong></div><div><span>Adjustments</span><strong>'+d.totalAdjusted+'</strong></div><div><span>Current inventory</span><strong>'+d.currentInventory+'</strong></div><div><span>Serials</span><strong>'+d.serialCount+'</strong></div><div><span>Maintenance</span><strong>'+(d.maintenanceCount==null?'—':d.maintenanceCount)+'</strong></div><p class=\"merge-audit-moved\"><span>Relationships moved</span>'+movedText+'</p></div>';\n    }\n\n    renderAudit=function(){\n      const q=norm($('auditSearch').value),uf=$('auditUser')?.value||'',af=$('auditAction')?.value||'',df=$('auditDate')?.value||'',prepared=consolidatedAudit();\n      const list=prepared.filter(a=>{\n        const actionGroup=isMergeAudit(a)?'MERGE':a.entity_type==='inventory_adjustments'?'ADJUST':a.action;\n        return(!q||norm([friendlyAudit(a),auditWho(a),JSON.stringify(a.new_data),JSON.stringify(a.old_data)].join(' ')).includes(q))&&(!uf||auditWho(a)===uf)&&(!af||actionGroup===af)&&(!df||singaporeDateKey(a.changed_at)===df);\n      });\n      const users=[...new Set(prepared.map(auditWho).filter(Boolean))].sort();\n      if($('auditUser')){const keep=$('auditUser').value;$('auditUser').innerHTML='<option value=\"\">All users</option>'+users.map(u=>'<option '+(u===keep?'selected':'')+' value=\"'+esc(u)+'\">'+esc(u)+'</option>').join('');}\n      const rows=list.map(a=>{\n        const [label,cls]=auditLabel(a),merge=isMergeAudit(a),detailId='mergeAudit-'+String(a.id||a.entity_id||Math.random()).replace(/[^a-zA-Z0-9_-]/g,'');\n        return '<tr><td>'+fmtDT(a.changed_at)+'</td><td>'+esc(auditWho(a))+'</td><td><span class=\"badge '+cls+'\">'+esc(label)+'</span></td><td>'+esc(friendlyAudit(a))+'</td><td>'+(merge?'<button type=\"button\" class=\"secondary small-btn\" data-merge-audit-toggle=\"'+detailId+'\">Details</button>':'')+'</td></tr>'+(merge?'<tr id=\"'+detailId+'\" class=\"merge-audit-detail-row hidden\"><td colspan=\"5\">'+mergeDetailHtml(a)+'</td></tr>':'');\n      }).join('');\n      $('auditTable').innerHTML=rows?'<table><thead><tr><th>Date / time</th><th>Who</th><th>Status</th><th>What</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class=\"empty\">No recent activities.</div>';\n    };\n\n    renderDashboard=function(){\n      previousRenderDashboard();\n      const list=consolidatedAudit().slice(0,6);\n      $('recentAudit').innerHTML=list.map(a=>{const [icon,cls]=auditIcon(a);return '<div class=\"activity\"><div class=\"activity-icon '+cls+'\"><i data-lucide=\"'+icon+'\"></i></div><div class=\"activity-body\"><strong>'+esc(friendlyAudit(a))+'</strong><span>'+esc(auditWho(a))+' · '+fmtDT(a.changed_at)+'</span></div></div>';}).join('')||'<div class=\"empty\">No activity yet.</div>';\n      window.lucide?.createIcons();\n    };\n\n    const auditTable=document.getElementById('auditTable');\n    if(auditTable&&auditTable.dataset.v703314iMergeBound!=='1'){\n      auditTable.dataset.v703314iMergeBound='1';\n      auditTable.addEventListener('click',e=>{\n        const b=e.target.closest('[data-merge-audit-toggle]');if(!b)return;\n        const row=document.getElementById(b.dataset.mergeAuditToggle);if(!row)return;\n        const opening=row.classList.contains('hidden');row.classList.toggle('hidden',!opening);b.textContent=opening?'Hide details':'Details';\n      });\n    }\n\n    try{renderAutomationCentre();renderAudit();renderDashboard();}catch(refreshErr){console.warn('V7.03.3.14i initial UI refresh skipped',refreshErr);}\n    Object.assign(diagnostics,{installed:true,stage:'ready',currentIssues:()=>currentHealthIssues(),history:()=>healthHistory(),mergeDetails,consolidated:()=>consolidatedAudit()});\n  }catch(err){\n    diagnostics.stage='failed';diagnostics.error=String(err?.message||err);\n    console.warn('V7.03.3.14i Data Health / merge-history enhancement failed non-fatally.',err);\n  }\n})();\n";

    src += "\n(function v703314jInstallHealthManagementAndActivitySummaries(){\n  const diagnostics=window.__AV_14J_DIAGNOSTICS__={version:'7.03.3.14j',installed:false,stage:'boot',error:null};\n  try{\n    if(window.__V703314J_HEALTH_ACTIVITY__){diagnostics.installed=true;diagnostics.stage='already-installed';return;}\n    if(typeof state==='undefined'||!state?.data||typeof buildHealthIssues!=='function'||!window.__AV_14I_DIAGNOSTICS__?.installed){\n      diagnostics.stage='dependencies-unavailable';\n      diagnostics.error='V7.03.3.14i Data Health runtime is unavailable.';\n      console.warn('V7.03.3.14j history/activity enhancement skipped: dependencies are unavailable.');\n      return;\n    }\n    window.__V703314J_HEALTH_ACTIVITY__=true;\n\n    if(typeof LocalDB!=='undefined'&&!LocalDB.prototype.manageHealthIssueReviews){\n      LocalDB.prototype.manageHealthIssueReviews=async function(keys=[],action='delete'){\n        const wanted=new Set((keys||[]).map(String).filter(Boolean)),d=this.data();\n        d.healthReviews=d.healthReviews||[];\n        const removed=d.healthReviews.filter(r=>wanted.has(String(r.issue_key)));\n        d.healthReviews=d.healthReviews.filter(r=>!wanted.has(String(r.issue_key)));\n        for(const r of removed)this.audit(d,'health_issue_reviews',String(r.issue_key||''),String(action||'delete').toUpperCase(),r,{management_action:String(action||'delete').toLowerCase()});\n        this.save(d);\n        return {affected:removed.length,action:String(action||'delete').toLowerCase()};\n      };\n    }\n    if(typeof SupabaseDB!=='undefined'&&!SupabaseDB.prototype.manageHealthIssueReviews){\n      SupabaseDB.prototype.manageHealthIssueReviews=async function(keys=[],action='delete'){\n        const issueKeys=[...new Set((keys||[]).map(String).filter(Boolean))];\n        if(!issueKeys.length)return {affected:0,action:String(action||'delete').toLowerCase()};\n        const {data,error}=await this.sb.rpc('manage_health_issue_reviews_v703314j',{p_issue_keys:issueKeys,p_action:String(action||'delete').toLowerCase()});\n        if(error)throw error;\n        return data||{affected:issueKeys.length,action:String(action||'delete').toLowerCase()};\n      };\n    }\n\n    const previousFriendlyAudit14j=friendlyAudit;\n    const previousAuditIcon14j=auditIcon;\n    const previousAuditLabel14j=auditLabel;\n    const previousAuditWho14j=auditWho;\n    const previousConsolidatedAudit14j=consolidatedAudit;\n\n    function healthReviewWho14j(r){\n      if(!r)return 'Team Member';\n      try{return profileName(r.reviewed_by)||String(r.reviewed_by||'Team Member');}\n      catch(_e){return String(r.reviewed_by||'Team Member');}\n    }\n    function currentHealthMap14j(){\n      return new Map((buildAllHealthIssues()||[]).map(x=>[String(x.key),x]));\n    }\n    function healthHistory14j(){\n      const current=currentHealthMap14j();\n      return [...(state.data?.healthReviews||[])]\n        .sort((a,b)=>new Date(b.reviewed_at||0)-new Date(a.reviewed_at||0))\n        .map(r=>({...r,resolution_status:current.has(String(r.issue_key))?'still-detected':'resolved',current_issue:current.get(String(r.issue_key))||null,reviewed_by_name:healthReviewWho14j(r)}));\n    }\n    function virtualHealthAudits14j(){\n      return healthHistory14j().map(r=>({\n        id:'health-review:'+String(r.issue_key||'')+':'+String(r.reviewed_at||''),\n        entity_type:'health_issue_reviews',\n        entity_id:String(r.issue_key||''),\n        action:'REVIEW',\n        old_data:null,\n        new_data:{...r,current_issue:undefined},\n        changed_by:r.reviewed_by||null,\n        changed_at:r.reviewed_at||nowIso(),\n        _healthActorName:r.reviewed_by_name,\n        _virtualHealthReview:true\n      }));\n    }\n    function itemForAudit14j(d={}){\n      const id=d.master_item_id||d.id;\n      return (state.data?.items||[]).find(x=>String(x.id)===String(id||''))||null;\n    }\n    function purchaseForAudit14j(d={}){\n      return (state.data?.purchases||[]).find(x=>String(x.id)===String(d.purchase_id||''))||null;\n    }\n    function shortValue14j(v){\n      if(v===null||v===undefined||v==='')return '—';\n      const s=String(v).replace(/\\s+/g,' ').trim();\n      return s.length>48?s.slice(0,45)+'…':s;\n    }\n    function changed14j(o={},n={},fields=[]){\n      const labels={sku:'SKU',item_name:'Name',category:'Category',unit:'Unit',description:'Description',image_url:'Photo',quantity:'Quantity',raw_description:'Description',serial_number:'Serial',adjustment_type:'Type',reason:'Reason',outcome:'Outcome',issue:'Issue',action_taken:'Action',notes:'Notes'};\n      const out=[];\n      for(const k of fields){\n        if(JSON.stringify(o?.[k])===JSON.stringify(n?.[k]))continue;\n        if(k==='description'||k==='image_url'||k==='raw_description'||k==='notes')out.push((labels[k]||k)+' updated');\n        else out.push((labels[k]||k)+': '+shortValue14j(o?.[k])+' → '+shortValue14j(n?.[k]));\n      }\n      return out;\n    }\n    function healthAuditText14j(a){\n      const d=a.new_data?.issue_key?a.new_data:(a.old_data||a.new_data||{}),type=d.issue_type||'Data Health finding',title=d.title||d.entity_id||a.entity_id||'record';\n      if(a.action==='REVIEW'){\n        const status=d.resolution_status==='resolved'?'resolved':'still detected';\n        return 'Reviewed Data Health: '+type+' — '+title+' ('+status+')';\n      }\n      if(a.action==='REOPEN')return 'Reopened Data Health review: '+type+' — '+title;\n      if(a.action==='DELETE')return 'Removed Data Health history: '+type+' — '+title;\n      return (a.action||'Updated')+' Data Health: '+type+' — '+title;\n    }\n\n    auditWho=function(a){return a?._healthActorName||previousAuditWho14j(a);};\n    auditIcon=function(a){\n      if(a?.entity_type==='health_issue_reviews'){\n        if(a.action==='REOPEN')return['rotate-ccw','edited'];\n        if(a.action==='DELETE')return['trash-2','delete'];\n        return['shield-check',''];\n      }\n      return previousAuditIcon14j(a);\n    };\n    auditLabel=function(a){\n      if(a?.entity_type==='health_issue_reviews'){\n        if(a.action==='REOPEN')return['Reopened','edited'];\n        if(a.action==='DELETE')return['Removed','deleted'];\n        return['Reviewed','imported'];\n      }\n      return previousAuditLabel14j(a);\n    };\n    friendlyAudit=function(a){\n      const n=a?.new_data||{},o=a?.old_data||{},d=a?.new_data||a?.old_data||{};\n      if(a?.entity_type==='health_issue_reviews')return healthAuditText14j(a);\n      if(a?.entity_type==='master_items'){\n        const sku=n.sku||o.sku||'No SKU',name=n.item_name||o.item_name||'';\n        if(a.action==='INSERT')return 'Added item '+sku+(name?' — '+name:'');\n        if(a.action==='DELETE')return 'Deleted item '+sku+(name?' — '+name:'');\n        if(a.action==='UPDATE'){\n          const parts=changed14j(o,n,['sku','item_name','category','unit','description','image_url']);\n          return 'Edited '+sku+(parts.length?' — '+parts.slice(0,4).join('; '):'');\n        }\n      }\n      if(a?.entity_type==='inventory_adjustments'){\n        const item=itemForAudit14j(d),sku=item?.sku||d.master_item_id||'inventory item',qty=Number(d.quantity||0),type=d.adjustment_type||'Adjustment',reason=String(d.reason||'').trim();\n        if(a.action==='INSERT')return 'Recorded '+type+' adjustment for '+sku+' — −'+qty+(reason?' · '+reason:'');\n        if(a.action==='DELETE')return 'Removed '+type+' adjustment for '+sku+' — '+qty;\n        if(a.action==='UPDATE'){\n          const parts=changed14j(o,n,['adjustment_type','quantity','reason']);\n          return 'Edited inventory adjustment for '+sku+(parts.length?' — '+parts.join('; '):'');\n        }\n      }\n      if(a?.entity_type==='purchase_items'){\n        const item=itemForAudit14j(d),purchase=purchaseForAudit14j(d),sku=item?.sku||d.master_item_id||'item',qty=Number(d.quantity||0),inv=purchase?.invoice_number||'';\n        if(a.action==='INSERT')return 'Added invoice line: '+sku+' × '+qty+(inv?' — '+inv:'');\n        if(a.action==='DELETE')return 'Removed invoice line: '+sku+' × '+qty+(inv?' — '+inv:'');\n        if(a.action==='UPDATE'){\n          const parts=changed14j(o,n,['quantity','raw_description']);\n          return 'Edited invoice line: '+sku+(parts.length?' — '+parts.join('; '):'');\n        }\n      }\n      if(a?.entity_type==='serial_numbers'){\n        const item=itemForAudit14j(d),sku=item?.sku||d.master_item_id||'item',serial=n.serial_number||o.serial_number||'';\n        if(a.action==='INSERT')return 'Added serial '+serial+' to '+sku;\n        if(a.action==='DELETE')return 'Removed serial '+serial+' from '+sku;\n        if(a.action==='UPDATE'){\n          const parts=changed14j(o,n,['serial_number']);\n          return 'Edited serial for '+sku+(parts.length?' — '+parts.join('; '):'');\n        }\n      }\n      if(a?.entity_type==='maintenance_records'&&a.action==='UPDATE'){\n        const item=itemForAudit14j(d),sku=item?.sku||d.master_item_id||'equipment',parts=changed14j(o,n,['issue','action_taken','outcome','notes']);\n        return 'Updated maintenance for '+sku+(parts.length?' — '+parts.slice(0,3).join('; '):'');\n      }\n      return previousFriendlyAudit14j(a);\n    };\n    consolidatedAudit=function(){\n      const base=previousConsolidatedAudit14j();\n      const actualReviews=new Set(base.filter(a=>a?.entity_type==='health_issue_reviews'&&a.action==='REVIEW').map(a=>String(a.entity_id||'')));\n      const virtual=virtualHealthAudits14j().filter(a=>!actualReviews.has(String(a.entity_id||'')));\n      return [...base,...virtual].sort((a,b)=>new Date(b.changed_at||0)-new Date(a.changed_at||0));\n    };\n\n    let healthTab14j='open';\n    let healthSelection14j=new Set();\n    const healthFilters14j={query:'',status:'',type:'',user:'',from:'',to:''};\n\n    function filteredHistory14j(){\n      const q=norm(healthFilters14j.query||'');\n      return healthHistory14j().filter(r=>{\n        const day=singaporeDateKey(r.reviewed_at);\n        const hay=norm([r.issue_type,r.title,r.detail,r.reviewed_by_name,r.entity_type,r.entity_id].join(' '));\n        return(!q||hay.includes(q))\n          &&(!healthFilters14j.status||r.resolution_status===healthFilters14j.status)\n          &&(!healthFilters14j.type||String(r.issue_type||'')===healthFilters14j.type)\n          &&(!healthFilters14j.user||String(r.reviewed_by_name||'')===healthFilters14j.user)\n          &&(!healthFilters14j.from||day>=healthFilters14j.from)\n          &&(!healthFilters14j.to||day<=healthFilters14j.to);\n      });\n    }\n    function options14j(values,current,label){\n      return '<option value=\"\">'+esc(label)+'</option>'+values.map(v=>'<option value=\"'+esc(v)+'\" '+(String(v)===String(current)?'selected':'')+'>'+esc(v)+'</option>').join('');\n    }\n    function renderHealthOpen14j(){\n      const issues=buildHealthIssues();\n      const rows=issues.map(x=>'<tr><td><span class=\"health-pill '+esc(x.severity)+'\">'+esc(x.severity)+'</span></td><td>'+(x.review?'<span class=\"health-history-status still\">Reviewed · still detected</span>':'<span class=\"health-history-status open\">Open</span>')+'</td><td>'+esc(x.type)+'</td><td>'+esc(x.title)+'</td><td>'+esc(x.detail)+'</td><td>'+issueReviewButton(x)+'</td></tr>').join('');\n      $('healthIssueTable').innerHTML=rows?'<table><thead><tr><th>Priority</th><th>Status</th><th>Check</th><th>Record</th><th>Finding</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class=\"empty\">No active findings.</div>';\n    }\n    function renderHealthHistoryResults14j(){\n      const host=document.getElementById('healthHistoryResults14j');if(!host)return;\n      const history=filteredHistory14j(),canManage=canEdit()&&typeof state.db?.manageHealthIssueReviews==='function';\n      for(const key of [...healthSelection14j])if(!history.some(r=>String(r.issue_key)===key))healthSelection14j.delete(key);\n      const selected=history.filter(r=>healthSelection14j.has(String(r.issue_key))),reopenable=selected.filter(r=>r.resolution_status==='still-detected');\n      const rows=history.map(r=>{\n        const key=String(r.issue_key||''),checked=healthSelection14j.has(key),current=r.current_issue;\n        const status=r.resolution_status==='resolved'?'<span class=\"health-history-status resolved\">Resolved</span>':'<span class=\"health-history-status still\">Still detected</span>';\n        const open=current?'<button class=\"secondary small-btn\" type=\"button\" data-health-open=\"'+esc(current.key)+'\">Open current</button>':'';\n        const select=canManage?'<input type=\"checkbox\" data-health14j-select=\"'+esc(key)+'\" '+(checked?'checked':'')+' aria-label=\"Select history record\">':'';\n        return '<tr><td>'+select+'</td><td>'+status+'</td><td>'+esc(r.issue_type||'Finding')+'</td><td>'+esc(r.title||'—')+'</td><td>'+esc(r.detail||'—')+'</td><td>'+esc(r.reviewed_by_name)+'<br><span class=\"muted\">'+esc(fmtDT(r.reviewed_at))+'</span></td><td>'+open+'</td></tr>';\n      }).join('');\n      const allChecked=!!history.length&&history.every(r=>healthSelection14j.has(String(r.issue_key)));\n      const manage=canManage?'<div class=\"health-history-manage\"><label><input type=\"checkbox\" data-health14j-select-all '+(allChecked?'checked':'')+'> Select all shown</label><span>'+selected.length+' selected</span><button type=\"button\" class=\"secondary small-btn\" data-health14j-manage=\"reopen\" '+(!reopenable.length?'disabled':'')+'>Reopen active ('+reopenable.length+')</button><button type=\"button\" class=\"danger small-btn\" data-health14j-manage=\"delete\" '+(!selected.length?'disabled':'')+'>Delete history ('+selected.length+')</button></div>':'';\n      host.innerHTML=manage+(rows?'<div class=\"table-wrap\"><table><thead><tr><th></th><th>Resolution</th><th>Check</th><th>Record</th><th>Reviewed finding</th><th>Reviewed by</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<div class=\"empty\">No Data Health history matches these filters.</div>');\n    }\n    function renderHealthHistory14j(){\n      const history=healthHistory14j(),types=[...new Set(history.map(r=>r.issue_type).filter(Boolean))].sort(),users=[...new Set(history.map(r=>r.reviewed_by_name).filter(Boolean))].sort();\n      $('healthIssueTable').innerHTML='<div class=\"health-history-toolbar\"><div class=\"input-icon\"><i data-lucide=\"search\"></i><input id=\"healthHistorySearch14j\" class=\"search\" type=\"search\" autocomplete=\"off\" placeholder=\"Search history...\" value=\"'+esc(healthFilters14j.query)+'\"></div><select id=\"healthHistoryStatus14j\">'+options14j(['resolved','still-detected'],healthFilters14j.status,'All statuses').replace('>resolved<','>Resolved<').replace('>still-detected<','>Still detected<')+'</select><select id=\"healthHistoryType14j\">'+options14j(types,healthFilters14j.type,'All checks')+'</select><select id=\"healthHistoryUser14j\">'+options14j(users,healthFilters14j.user,'All reviewers')+'</select><input id=\"healthHistoryFrom14j\" type=\"date\" title=\"From date\" value=\"'+esc(healthFilters14j.from)+'\"><input id=\"healthHistoryTo14j\" type=\"date\" title=\"To date\" value=\"'+esc(healthFilters14j.to)+'\"><button type=\"button\" class=\"secondary small-btn\" data-health14j-clear>Clear</button></div><div id=\"healthHistoryResults14j\"></div>';\n      renderHealthHistoryResults14j();\n      window.lucide?.createIcons();\n    }\n    function renderHealthDialog14j(){\n      const issues=buildHealthIssues(),score=healthScore(issues),history=healthHistory14j(),resolved=history.filter(x=>x.resolution_status==='resolved').length,still=history.length-resolved;\n      $('healthDialogSummary').innerHTML='<div class=\"health-overview health-overview-14i\"><div class=\"health-overview-score\"><strong>'+score+'%</strong><span>'+esc(healthLabel(score))+'</span></div><div class=\"health-resolution-summary\"><span><strong>'+issues.length+'</strong> active</span><span><strong>'+resolved+'</strong> resolved</span><span><strong>'+still+'</strong> reviewed / still detected</span></div><div class=\"health-tabs\"><button type=\"button\" class=\"'+(healthTab14j==='open'?'active':'')+'\" data-health14j-tab=\"open\">Open findings</button><button type=\"button\" class=\"'+(healthTab14j==='history'?'active':'')+'\" data-health14j-tab=\"history\">Review history ('+history.length+')</button></div></div>';\n      healthTab14j==='history'?renderHealthHistory14j():renderHealthOpen14j();\n      window.lucide?.createIcons();\n    }\n    openHealth=function(){healthTab14j='open';healthSelection14j.clear();renderHealthDialog14j();$('healthDialog').showModal();};\n\n    async function manageHealthSelection14j(action){\n      if(!canEdit()||typeof state.db?.manageHealthIssueReviews!=='function')return;\n      const selected=healthHistory14j().filter(r=>healthSelection14j.has(String(r.issue_key)));\n      const records=action==='reopen'?selected.filter(r=>r.resolution_status==='still-detected'):selected;\n      if(!records.length){toast(action==='reopen'?'Select at least one still-detected review.':'Select at least one history record.');return;}\n      const verb=action==='reopen'?'reopen '+records.length+' active review'+(records.length===1?'':'s'):'delete '+records.length+' history record'+(records.length===1?'':'s');\n      if(!confirm('Confirm '+verb+'?'))return;\n      try{\n        const result=await state.db.manageHealthIssueReviews(records.map(r=>r.issue_key),action);\n        state.data=await state.db.load();\n        healthSelection14j.clear();\n        renderAll();\n        healthTab14j='history';\n        renderHealthDialog14j();\n        toast((action==='reopen'?'Reopened ':'Deleted ')+Number(result?.affected??records.length)+' Data Health record'+(Number(result?.affected??records.length)===1?'':'s')+'.');\n      }catch(err){\n        console.error(err);\n        const msg=String(err?.message||err||'');\n        if(/manage_health_issue_reviews_v703314j|PGRST202|42883|schema cache|not found/i.test(msg))toast('Data Health management SQL is not installed yet. Run the v7.03.3.14j Supabase SQL patch.');\n        else toast(friendlyError(err));\n      }\n    }\n\n    document.addEventListener('click',e=>{\n      const tab=e.target.closest?.('[data-health14j-tab]');\n      if(tab){\n        e.preventDefault();e.stopImmediatePropagation();\n        healthTab14j=tab.dataset.health14jTab==='history'?'history':'open';\n        healthSelection14j.clear();\n        renderHealthDialog14j();\n        return;\n      }\n      const clear=e.target.closest?.('[data-health14j-clear]');\n      if(clear){\n        e.preventDefault();e.stopImmediatePropagation();\n        Object.assign(healthFilters14j,{query:'',status:'',type:'',user:'',from:'',to:''});\n        healthSelection14j.clear();\n        renderHealthHistory14j();\n        return;\n      }\n      const all=e.target.closest?.('[data-health14j-select-all]');\n      if(all){\n        const shown=filteredHistory14j();\n        if(all.checked)shown.forEach(r=>healthSelection14j.add(String(r.issue_key)));\n        else shown.forEach(r=>healthSelection14j.delete(String(r.issue_key)));\n        renderHealthHistoryResults14j();\n        return;\n      }\n      const row=e.target.closest?.('[data-health14j-select]');\n      if(row){\n        const key=String(row.dataset.health14jSelect||'');\n        row.checked?healthSelection14j.add(key):healthSelection14j.delete(key);\n        renderHealthHistoryResults14j();\n        return;\n      }\n      const manage=e.target.closest?.('[data-health14j-manage]');\n      if(manage){\n        e.preventDefault();e.stopImmediatePropagation();\n        manageHealthSelection14j(manage.dataset.health14jManage);\n        return;\n      }\n      if(e.target.closest?.('[data-health-review]')&&$('healthDialog')?.open){\n        setTimeout(()=>{if($('healthDialog')?.open){healthTab14j='open';renderHealthDialog14j();}},250);\n      }\n    },true);\n    document.addEventListener('input',e=>{\n      if(e.target?.id!=='healthHistorySearch14j')return;\n      healthFilters14j.query=e.target.value||'';\n      healthSelection14j.clear();\n      renderHealthHistoryResults14j();\n    },true);\n    document.addEventListener('change',e=>{\n      const map={healthHistoryStatus14j:'status',healthHistoryType14j:'type',healthHistoryUser14j:'user',healthHistoryFrom14j:'from',healthHistoryTo14j:'to'};\n      const key=map[e.target?.id];if(!key)return;\n      healthFilters14j[key]=e.target.value||'';\n      healthSelection14j.clear();\n      renderHealthHistoryResults14j();\n    },true);\n\n    try{renderAudit();renderDashboard();}catch(refreshErr){console.warn('V7.03.3.14j initial activity refresh skipped',refreshErr);}\n    Object.assign(diagnostics,{installed:true,stage:'ready',history:healthHistory14j,filteredHistory:filteredHistory14j,summary:friendlyAudit});\n  }catch(err){\n    diagnostics.stage='failed';diagnostics.error=String(err?.message||err);\n    console.warn('V7.03.3.14j Data Health management/activity enhancement failed non-fatally.',err);\n  }\n})();\n";

    src += "\n(function v703314lInstallParserDiagnostics(){\n  if(window.__AV_14L_DIAGNOSTICS__?.installed)return;\n  const api=globalThis.V7033Patch;\n  const adminDiagnosticsVisible=()=>typeof currentRole==='function'&&currentRole()==='admin';\n  const diagnostics=window.__AV_14L_DIAGNOSTICS__={version:'7.03.3.14n',installed:false,stage:'boot',last:null,error:null,behavioral:null,historical:null};\n  try{\n    if(!api||typeof api.buildParserDiagnostics14l!=='function'||typeof api.runHistoricalRegressionChecks!=='function'||typeof renderParsedItems!=='function'){\n      diagnostics.stage='dependencies-unavailable';diagnostics.error='Parser diagnostic dependencies are unavailable.';console.warn('V7.03.3.14n parser diagnostics skipped: dependencies unavailable.');return;\n    }\n    function esc14l(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));}\n    function compactJson14l(v){try{return JSON.stringify(v,null,2);}catch(_e){return String(v);}}\n    function statusClass14l(v){const s=String(v||'').toLowerCase();return s==='pass'?'pass':(s==='review'?'review':'block');}\n    function render14l(){\n      const existing=document.getElementById('v703314lParserDiagnostics');\n      if(!adminDiagnosticsVisible()){if(existing)existing.remove();diagnostics.last=null;diagnostics.behavioral=null;diagnostics.historical=null;diagnostics.stage='hidden-for-role';return;}\n      const parsed=state?.parsed;if(!parsed)return;\n      const raw=String(parsed.raw||parsed.rawText||''),diag=parsed.v703314lDiagnostics||api.buildParserDiagnostics14l(parsed,raw,{});\n      parsed.v703314lDiagnostics=diag;\n      const behavior=diagnostics.behavioral||(diagnostics.behavioral=api.runRegressionChecks()),history=diagnostics.historical||(diagnostics.historical=api.runHistoricalRegressionChecks());\n      diagnostics.last={generated_at:new Date().toISOString(),parse:diag};\n      const pane=document.querySelector('.parsed-review-pane')||document.getElementById('reviewArea');if(!pane)return;\n      let host=document.getElementById('v703314lParserDiagnostics');\n      if(!host){host=document.createElement('details');host.id='v703314lParserDiagnostics';host.open=true;host.className='parser-diagnostics-14l';const rawDetails=document.getElementById('rawText')?.closest('details');if(rawDetails?.parentNode)rawDetails.parentNode.insertBefore(host,rawDetails);else pane.appendChild(host);}\n      const actualDoc=diag.document?.classification?.type||'unclassified',actualFilter=(diag.filtering?.excluded_service_count||0)+' service / '+(diag.filtering?.excluded_accessory_count||0)+' accessory excluded',actualItems=(diag.final_items||[]).map(x=>(x.sku||'No SKU')+' — '+(x.item_name||'')).join('; ')||'No tracked items',actualReview=diag.verification?.level3_required?'Level 3 required':'No unresolved Level 3';\n      const rawOutput={timestamp:diagnostics.last.generated_at,parse:diag,behavioral:{ok:behavior.ok,failures:behavior.failures,cases:behavior.cases},historical:{ok:history.ok,represented_files:history.represented_files,logical_cases:history.logical_cases,failures:history.failures,cases:history.cases.map(x=>({id:x.id,source_files:x.source_files,pass:x.pass,expected:x.expected,evidence:x.evidence,reason:x.reason}))}};\n      host.innerHTML='<summary><span>Parser diagnostics</span><span class=\"parser-diag-status '+statusClass14l(diag.overall_status)+'\">'+esc14l(diag.overall_status)+'</span></summary><div class=\"parser-diag-body\"><div class=\"parser-diag-summary\"><div><b>Patch Focus</b><span>Golden invoices + evidence tracing + arithmetic validation + field confidence + OCR preprocessing + holdout testing</span></div><div><b>Test Suite / Input</b><span>Current invoice + '+behavior.cases.length+' behavioral checks + '+history.logical_cases+' historical cases / '+history.represented_files+' represented files</span></div><div><b>Overall Status</b><span>Current parse: '+esc14l(diag.overall_status)+' · Behavioral: '+(behavior.ok?'PASS':'FAIL')+' · Historical: '+(history.ok?'PASS':'FAIL')+'</span></div><div><b>Timestamp</b><span>'+esc14l(diagnostics.last.generated_at)+'</span></div></div><div class=\"table-wrap\"><table class=\"parser-diag-table\"><thead><tr><th>Check</th><th>Expected</th><th>Actual</th></tr></thead><tbody><tr><td>Document</td><td>Invoice / Tax Invoice</td><td>'+esc14l(actualDoc)+' — '+esc14l(diag.document?.classification?.reason||'')+'</td></tr><tr><td>Filtering</td><td>Exclude service/accessory rows only</td><td>'+esc14l(actualFilter)+'</td></tr><tr><td>Tracked items</td><td>Evidence-backed inventory rows</td><td>'+esc14l(actualItems)+'</td></tr><tr><td>Level 3</td><td>Only unresolved evidence needs review</td><td>'+esc14l(actualReview)+'</td></tr></tbody></table></div><div class=\"parser-diag-trace\"><b>Evidence trace</b><div class=\"parser-diag-chips\"><span>Input '+(diag.filtering?.incoming_count||0)+'</span><span>Final '+(diag.filtering?.tracked_count||0)+'</span><span>Recovered '+(diag.filtering?.recovered_equipment_count||0)+'</span><span>L1 '+(diag.verification?.level1?.length||0)+'</span><span>L2 '+(diag.verification?.level2?.length||0)+'</span></div><p>'+esc14l((diag.decision_reasons||[]).join(' '))+'</p></div><details class=\"parser-diag-raw\"><summary>Raw parser test execution output</summary><pre>'+esc14l(compactJson14l(rawOutput))+'</pre></details></div>';\n    }\n    const original=renderParsedItems;renderParsedItems=function(){const result=original.apply(this,arguments);try{render14l();}catch(err){console.warn('v7.03.3.14n diagnostic render failed',err);}return result;};\n    document.addEventListener('click',e=>{if(e.target.closest?.('#addParsedItemBtn,#subtractParsedItemBtn,#chooseEquipmentInvoiceBtn,#chooseServiceInvoiceBtn,#changeInvoiceTypeBtn'))setTimeout(()=>{try{render14l();}catch(_e){}},200);},true);\n    diagnostics.render=render14l;const startupBehavioral=api.runRegressionChecks(),startupHistorical=api.runHistoricalRegressionChecks();diagnostics.installed=true;if(adminDiagnosticsVisible()){diagnostics.behavioral=startupBehavioral;diagnostics.historical=startupHistorical;diagnostics.stage='ready';}else{diagnostics.behavioral=null;diagnostics.historical=null;diagnostics.last=null;diagnostics.stage='hidden-for-role';}try{if(state?.parsed)render14l();}catch(_e){}\n  }catch(err){diagnostics.stage='failed';diagnostics.error=String(err?.message||err);console.warn('V7.03.3.14n parser diagnostics failed non-fatally.',err);}\n})();\n";

    src += "\n(function v703314oInstallParserIntelligence(){\n  if(window.__AV_14O_DIAGNOSTICS__?.installed)return;\n  const api=globalThis.V7033Patch;\n  const diagnostics=window.__AV_14O_DIAGNOSTICS__={version:'7.03.3.14o',installed:false,stage:'boot',error:null};\n  try{\n    if(!api||typeof api.runIntelligenceRegressionChecks14o!=='function'){diagnostics.stage='dependencies-unavailable';diagnostics.error='V7.03.3.14o core intelligence helpers are unavailable.';return;}\n    if(window.__V703314O_PARSER_INTELLIGENCE__){diagnostics.installed=true;diagnostics.stage='already-installed';return;}\n    window.__V703314O_PARSER_INTELLIGENCE__=true;\n    const intel=window.__AV_14O_STATE__={corrections:[],profiles:[],adminSnapshot:null,migrationReady:false,lastError:'',fingerprint:'',fingerprintDuplicate:null,fingerprintOverride:false,duplicateBlocks:0,parseSnapshot:null,parseSnapshotSig:'',pendingCorrections:[],lastRegression:null,lastRefresh:0,userTouched:false};\n    const role14o=()=>{try{return typeof currentRole==='function'?String(currentRole()||'viewer').toLowerCase():'viewer';}catch(_e){return'viewer';}},isAdmin14o=()=>role14o()==='admin',canImport14o=()=>['admin','editor'].includes(role14o());\n    const clean14o=v=>String(v??'').replace(/\\s+/g,' ').trim(),norm14o=v=>clean14o(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),esc14o=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c])),clone14o=v=>{try{return JSON.parse(JSON.stringify(v));}catch(_e){return v;}};\n    const localKey='av_inventory_parser_intelligence_14o',localData=()=>{try{return JSON.parse(localStorage.getItem(localKey)||'{\"corrections\":[],\"profiles\":[],\"events\":[]}');}catch(_e){return{corrections:[],profiles:[],events:[]};}},saveLocal=d=>{try{localStorage.setItem(localKey,JSON.stringify(d));}catch(_e){}};\n    const supplierKey14o=v=>{try{return api.v703314oSupplierKey(v);}catch(_e){return norm14o(v);}},currentRaw14o=()=>String(state?.parsed?.raw||state?.parsed?.rawText||''),sqlUnavailable14o=err=>/function|schema cache|does not exist|42P01|42883|PGRST202|column .* does not exist/i.test(String(err?.message||err||''));\n    async function rpc14o(name,args={}){if(CFG.mode!=='supabase'||!state?.db?.sb)throw new Error('Supabase is unavailable.');const {data,error}=await state.db.sb.rpc(name,args);if(error)throw error;return data;}\n    async function refreshIntelligence14o(){\n      try{if(CFG.mode==='supabase'&&state?.db?.sb){const data=await rpc14o('get_parser_intelligence_v703314o',{});intel.corrections=Array.isArray(data?.corrections)?data.corrections:[];intel.profiles=Array.isArray(data?.profiles)?data.profiles:[];intel.migrationReady=true;intel.lastError='';}else{const d=localData();intel.corrections=(d.corrections||[]).filter(x=>x.status==='approved');intel.profiles=(d.profiles||[]).filter(x=>x.status==='active');intel.migrationReady=true;}intel.lastRefresh=Date.now();}catch(err){intel.lastError=String(err?.message||err);if(sqlUnavailable14o(err))intel.migrationReady=false;console.warn('v7.03.3.14o parser intelligence load skipped',err);}if(isAdmin14o())await refreshAdminSnapshot14o(false);renderQualityDashboard14o();return intel;\n    }\n    async function refreshAdminSnapshot14o(render=true){\n      if(!isAdmin14o())return null;try{if(CFG.mode==='supabase'&&state?.db?.sb){intel.adminSnapshot=await rpc14o('admin_parser_quality_snapshot_v703314o',{});intel.migrationReady=true;intel.lastError='';}else{const d=localData();intel.adminSnapshot={corrections:d.corrections||[],profiles:d.profiles||[],events:(d.events||[]).slice(-100).reverse()};}}catch(err){intel.lastError=String(err?.message||err);if(sqlUnavailable14o(err))intel.migrationReady=false;console.warn('v7.03.3.14o Admin parser snapshot unavailable',err);}if(render)renderQualityDashboard14o();return intel.adminSnapshot;\n    }\n    function applyCorrectionMemory14o(parsed={},raw=''){\n      if(!parsed||!Array.isArray(intel.corrections)||!intel.corrections.length)return parsed;const out={...parsed,doc:{...(parsed.doc||{})},items:(parsed.items||[]).map(x=>({...x}))},supplier=out.doc.supplier_name||'',used=[],suggestions=[];\n      for(const c of intel.corrections){const field=String(c.field_name||'');if(field==='invoice_number'){const decision=api.v703314oCorrectionDecision(c,{supplier_name:supplier,current_value:out.doc.invoice_number||'',raw});if(decision.autoApply){out.doc.invoice_number=c.corrected_value;used.push({id:c.id,field,from:c.source_value,to:c.corrected_value,reason:decision.reason});}else if(decision.supplierMatch&&decision.sourceMatch)suggestions.push({id:c.id,field,from:c.source_value,to:c.corrected_value,reason:decision.reason});continue;}for(const item of out.items){if(field!=='sku'){if(supplierKey14o(c.supplier_key)===supplierKey14o(supplier))suggestions.push({id:c.id,field,from:c.source_value,to:c.corrected_value,item:item.sku||item.item_name||'',reason:'Approved memory is suggestion-only for this field.'});continue;}const decision=api.v703314oCorrectionDecision(c,{supplier_name:supplier,current_value:item.sku||'',raw});if(decision.autoApply){const before=item.sku||'';item.sku=c.corrected_value;item.v703314oCorrectionMemory={id:c.id,from:before,to:c.corrected_value,evidence:'approved + printed'};used.push({id:c.id,field,from:before,to:c.corrected_value,item:item.item_name||'',reason:decision.reason});}}}\n      if(used.length||suggestions.length)out.v703314oCorrectionMemory={used,suggestions};return out;\n    }\n    function activeProfile14o(parsed={},raw=''){const supplier=parsed?.doc?.supplier_name||'',key=supplierKey14o(supplier);return (intel.profiles||[]).find(p=>String(p.status||'active')==='active'&&(supplierKey14o(p.supplier_key||p.supplier_name||'')===key||(!key&&clean14o(p.supplier_name)&&norm14o(raw).includes(norm14o(p.supplier_name)))))||null;}\n    function applySupplierProfile14o(parsed={},raw=''){\n      if(!parsed)return parsed;const p=activeProfile14o(parsed,raw);if(!p)return parsed;const out={...parsed,doc:{...(parsed.doc||{})}},labels=p.labels||{},evidence=[];\n      if(!clean14o(out.doc.invoice_number)){const hit=api.v703314oExtractProfileCandidate(raw,labels.invoice_labels||[],'invoice_number');if(hit){out.doc.invoice_number=hit.value;evidence.push({field:'invoice_number',...hit});}}\n      if(!clean14o(out.doc.invoice_date)){const hit=api.v703314oExtractProfileCandidate(raw,labels.date_labels||[],'invoice_date');if(hit){try{const parsedDate=typeof parseDate==='function'?parseDate(hit.value):hit.value;if(parsedDate){out.doc.invoice_date=parsedDate;evidence.push({field:'invoice_date',...hit});}}catch(_e){}}}\n      if(evidence.length)out.v703314oSupplierProfile={profile_id:p.id,supplier:p.supplier_name||p.supplier_key,evidence};return out;\n    }\n    if(typeof v661FinalizeParsedInvoice==='function'&&!v661FinalizeParsedInvoice.__v703314o){const prev=v661FinalizeParsedInvoice,wrapped=function(){let out=prev.apply(this,arguments);const raw=String(arguments[1]||out?.raw||out?.rawText||'');out=applySupplierProfile14o(out,raw);out=applyCorrectionMemory14o(out,raw);return out;};wrapped.__v703314o=true;v661FinalizeParsedInvoice=wrapped;}\n    function parseSig14o(){const d=state?.parsed?.doc||{},items=state?.parsed?.items||[];return [d.supplier_name||'',d.invoice_number||'',d.invoice_date||'',items.length,...items.map(x=>[x.rowId||x.v7RowId||'',x.sku||'',x.item_name||'',x.quantity??''].join(':'))].join('|');}\n    function snapshotParse14o(){if(intel.userTouched||!state?.parsed)return;const sig=parseSig14o();intel.parseSnapshot={doc:clone14o(state.parsed.doc||{}),items:clone14o(state.parsed.items||[])};intel.parseSnapshotSig=sig;intel.pendingCorrections=[];}\n    function resetImportIntelligence14o(){intel.parseSnapshot=null;intel.parseSnapshotSig='';intel.pendingCorrections=[];intel.fingerprint='';intel.fingerprintDuplicate=null;intel.fingerprintOverride=false;intel.userTouched=false;renderFingerprintWarning14o();}\n    function correctionDiff14o(){\n      if(!intel.parseSnapshot||!state?.parsed)return[];const before=intel.parseSnapshot,after=state.parsed,supplier=after.doc?.supplier_name||before.doc?.supplier_name||'',invoice=after.doc?.invoice_number||before.doc?.invoice_number||'',out=[],add=(field,a,b,item='')=>{a=clean14o(a);b=clean14o(b);if(a===b||!b)return;out.push({field_name:field,source_value:a,corrected_value:b,item_identity:item,evidence_text:'',supplier_name:supplier,invoice_number:invoice});};\n      for(const f of ['supplier_name','invoice_number','invoice_date'])add(f,before.doc?.[f],after.doc?.[f],'header');const oldItems=before.items||[],newItems=after.items||[];\n      for(let i=0;i<Math.min(oldItems.length,newItems.length);i++){const a=oldItems[i],b=newItems[i],identity=clean14o(b.sku||a.sku||b.item_name||a.item_name||('row '+(i+1)));for(const f of ['sku','item_name','quantity','unit_price','amount','serials'])add(f,a?.[f],b?.[f],identity);}return out.slice(0,50);\n    }\n    function profileObservation14o(){\n      const d=state?.parsed?.doc||{},raw=currentRaw14o(),lines=raw.replace(/\\r/g,'').split('\\n').map(clean14o).filter(Boolean),invoiceLabels=[],dateLabels=[];\n      for(const line of lines.slice(0,120)){if(/^(?:invoice\\s*(?:number|no\\.?|#)|inv\\s*(?:number|no\\.?|#))\\b/i.test(line)){const m=line.match(/^([^:#]{2,40}?)(?:\\s*[:#.-]|\\s{2,}|$)/);invoiceLabels.push(clean14o(m?.[1]||line.split(/\\s{2,}/)[0]));}if(/^(?:invoice\\s+date|date)\\b/i.test(line)){const m=line.match(/^([^:#]{2,30}?)(?:\\s*[:#.-]|\\s{2,}|$)/);dateLabels.push(clean14o(m?.[1]||'Invoice Date'));}}\n      const tableHeader=lines.find(x=>/\\bdescription\\b/i.test(x)&&/\\b(?:qty|quantity)\\b/i.test(x)&&/\\b(?:price|unit price)\\b/i.test(x)&&/\\b(?:amount|total)\\b/i.test(x))||'',uniq=a=>[...new Set(a.filter(Boolean))].slice(0,8);\n      return {supplier_name:d.supplier_name||'',labels:{invoice_labels:uniq(invoiceLabels),date_labels:uniq(dateLabels),table_header_tokens:tableHeader?uniq(tableHeader.split(/\\s+/).filter(x=>x.length>2)):[]}};\n    }\n    async function sha256File14o(file){if(!file||!globalThis.crypto?.subtle)return'';const buf=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',buf),hex=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');return api.v703314oValidFingerprint(hex)?hex:'';}\n    async function findFingerprintDuplicate14o(hash){if(!api.v703314oValidFingerprint(hash)||!canImport14o())return null;try{if(CFG.mode==='supabase'&&state?.db?.sb)return await rpc14o('find_document_by_hash_v703314o',{p_hash:hash});return (state?.data?.documents||[]).find(d=>String(d.file_sha256||'').toLowerCase()===hash.toLowerCase())||null;}catch(err){if(sqlUnavailable14o(err))intel.migrationReady=false;console.warn('Fingerprint duplicate check unavailable',err);return null;}}\n    function renderFingerprintWarning14o(){\n      const review=document.getElementById('reviewArea');if(!review)return;let box=document.getElementById('v703314oFingerprintWarning');if(!box){box=document.createElement('div');box.id='v703314oFingerprintWarning';box.className='warning-box hidden';const dupe=document.getElementById('duplicateWarning');(dupe?.parentNode||review).insertBefore(box,dupe||review.firstChild);}const d=intel.fingerprintDuplicate;\n      if(!d){box.classList.add('hidden');box.innerHTML='';enforceFingerprintGate14o();return;}const override=isAdmin14o()&&!intel.fingerprintOverride?'<button type=\"button\" class=\"secondary small-btn\" data-14o-fingerprint-override>Admin override</button>':'';\n      box.classList.remove('hidden');box.innerHTML='<strong>Exact PDF duplicate detected.</strong> This file has the same SHA-256 fingerprint as <b>'+esc14o(d.file_name||d.invoice_number||'an existing document')+'</b>.'+(intel.fingerprintOverride?' <b>Admin override enabled.</b>':' Import is blocked to prevent an accidental duplicate.')+' '+override;enforceFingerprintGate14o();\n    }\n    function enforceFingerprintGate14o(){const btn=document.getElementById('saveImportBtn'),blocked=!!intel.fingerprintDuplicate&&!intel.fingerprintOverride;if(btn&&blocked){btn.disabled=true;btn.setAttribute('aria-disabled','true');btn.title='Exact PDF duplicate detected. Admin override is required.';}}\n    async function inspectFile14o(file){try{intel.fingerprint=await sha256File14o(file);intel.fingerprintDuplicate=intel.fingerprint?await findFingerprintDuplicate14o(intel.fingerprint):null;intel.fingerprintOverride=false;if(intel.fingerprintDuplicate)intel.duplicateBlocks++;renderFingerprintWarning14o();renderQualityDashboard14o();}catch(err){console.warn('PDF fingerprint check failed non-fatally',err);}}\n    if(typeof v661RenderImportEligibility==='function'&&!v661RenderImportEligibility.__v703314o){const prevEligibility=v661RenderImportEligibility;v661RenderImportEligibility=function(){const r=prevEligibility.apply(this,arguments);try{renderFingerprintWarning14o();}catch(_e){}return r;};v661RenderImportEligibility.__v703314o=true;}\n    if(typeof renderParsedItems==='function'&&!renderParsedItems.__v703314oSnapshot){const prevRender=renderParsedItems;renderParsedItems=function(){const r=prevRender.apply(this,arguments);try{if(!intel.userTouched)snapshotParse14o();}catch(_e){}return r;};renderParsedItems.__v703314oSnapshot=true;}\n    async function persistCorrectionMemory14o(rows=[]){if(!rows.length)return;if(CFG.mode==='supabase'&&state?.db?.sb)await rpc14o('record_parser_corrections_v703314o',{p_supplier_name:state.parsed?.doc?.supplier_name||'',p_invoice_number:state.parsed?.doc?.invoice_number||'',p_corrections:rows});else{const d=localData(),now=new Date().toISOString();for(const x of rows)d.corrections.push({id:'local-'+Date.now()+'-'+Math.random(),supplier_key:supplierKey14o(x.supplier_name),supplier_name:x.supplier_name,status:'pending',created_at:now,...x});saveLocal(d);}}\n    async function persistProfile14o(obs){if(!obs?.supplier_name)return;if(CFG.mode==='supabase'&&state?.db?.sb)await rpc14o('upsert_supplier_profile_observation_v703314o',{p_supplier_name:obs.supplier_name,p_labels:obs.labels});else{const d=localData(),key=supplierKey14o(obs.supplier_name),old=(d.profiles||[]).find(x=>x.supplier_key===key);if(old){old.labels={...(old.labels||{}),...(obs.labels||{})};old.sample_count=(old.sample_count||0)+1;old.last_seen=new Date().toISOString();}else d.profiles.push({id:'local-profile-'+Date.now(),supplier_key:key,supplier_name:obs.supplier_name,labels:obs.labels,status:'pending',sample_count:1,last_seen:new Date().toISOString()});saveLocal(d);}}\n    async function recordQualityEvent14o(type,payload={}){try{if(CFG.mode==='supabase'&&state?.db?.sb)await rpc14o('record_parser_quality_event_v703314o',{p_event_type:type,p_supplier_name:state.parsed?.doc?.supplier_name||'',p_payload:payload});else{const d=localData();d.events=d.events||[];d.events.push({event_type:type,supplier_name:state.parsed?.doc?.supplier_name||'',payload,created_at:new Date().toISOString()});d.events=d.events.slice(-300);saveLocal(d);}}catch(err){console.warn('Parser quality event not recorded',err);}}\n    async function persistFingerprint14o(result,doc={},purchase={}){\n      if(!intel.fingerprint||CFG.mode!=='supabase'||!state?.db?.sb)return;try{let documentId=result?.document_id||result?.document?.id||null;if(!documentId){const q=await state.db.sb.from('documents').select('id').ilike('supplier_name',purchase.supplier_name||doc.supplier_name||'').ilike('invoice_number',purchase.invoice_number||doc.invoice_number||'').order('uploaded_at',{ascending:false}).limit(1);if(!q.error)documentId=q.data?.[0]?.id||null;}if(documentId){const audit={parser_version:'7.03.3.14o',file_sha256:intel.fingerprint,quality:state.parsed?.v703314nQuality||null,correction_memory:state.parsed?.v703314oCorrectionMemory||null,supplier_profile:state.parsed?.v703314oSupplierProfile||null,created_at:new Date().toISOString()},u=await state.db.sb.from('documents').update({file_sha256:intel.fingerprint,parser_version:'7.03.3.14o',parse_audit:audit}).eq('id',documentId);if(u.error&&!sqlUnavailable14o(u.error))throw u.error;}}catch(err){console.warn('Document fingerprint metadata could not be stored',err);}}\n    function wrapImport14o(Proto){if(!Proto||Proto.prototype.__v703314oImport)return;const orig=Proto.prototype.importPurchase;if(typeof orig!=='function')return;Proto.prototype.importPurchase=async function(doc,purchase,lines,file){const corrections=[...(intel.pendingCorrections||[])],profile=profileObservation14o(),fingerprint=intel.fingerprint,result=await orig.call(this,doc,purchase,lines,file);try{if(corrections.length)await persistCorrectionMemory14o(corrections);await persistProfile14o(profile);if(fingerprint)await persistFingerprint14o(result,doc,purchase);await recordQualityEvent14o(state.parsed?.v7?.humanReviewRequired?'review':'pass',{invoice_number:purchase.invoice_number||'',line_items:(lines||[]).length,file_sha256:fingerprint||'',corrections_recorded:corrections.length});await refreshIntelligence14o();}catch(postErr){console.warn('v7.03.3.14o post-import intelligence update skipped',postErr);}return result;};Proto.prototype.__v703314oImport=true;}\n    try{if(typeof LocalDB!=='undefined')wrapImport14o(LocalDB);if(typeof SupabaseDB!=='undefined')wrapImport14o(SupabaseDB);}catch(wrapErr){console.warn('v7.03.3.14o import wrapper skipped',wrapErr);}\n    function runRegression14o(){const suites={behavioral:api.runRegressionChecks(),golden:api.runHistoricalRegressionChecks(),quality:api.runQualityRegressionChecks14n(),holdout:api.runHoldoutRegressionChecks14n(),intelligence:api.runIntelligenceRegressionChecks14o()},ok=Object.values(suites).every(x=>x?.ok===true);intel.lastRegression={ok,suites,at:new Date().toISOString()};return intel.lastRegression;}\n    function qualityPanel14o(){const dash=document.getElementById('dashboardView');if(!dash)return null;let panel=document.getElementById('parserQualityDashboard14o');if(!isAdmin14o()){if(panel)panel.remove();return null;}if(!panel){panel=document.createElement('article');panel.id='parserQualityDashboard14o';panel.className='panel parser-quality-dashboard-14o';const auto=document.getElementById('automationCentre');(auto?.parentNode||dash).insertBefore(panel,auto?.nextSibling||dash.firstChild);}return panel;}\n    function renderQualityDashboard14o(){\n      const panel=qualityPanel14o();if(!panel)return;const reg=intel.lastRegression||runRegression14o(),snap=intel.adminSnapshot||{},corrections=snap.corrections||[],profiles=snap.profiles||[],events=snap.events||[],pending=corrections.filter(x=>x.status==='pending').length,approved=corrections.filter(x=>x.status==='approved').length,active=profiles.filter(x=>x.status==='active').length,migration=intel.migrationReady?'<span style=\"color:#16794b;font-weight:700\">Ready</span>':'<span style=\"color:#9a6700;font-weight:700\">SQL patch required</span>';\n      const correctionRows=corrections.slice(0,12).map(x=>'<tr><td>'+esc14o(x.supplier_name||x.supplier_key||'—')+'</td><td>'+esc14o(x.field_name||'—')+'</td><td>'+esc14o(x.source_value||'—')+' → '+esc14o(x.corrected_value||'—')+'</td><td>'+esc14o(x.status||'pending')+'</td><td>'+(x.status==='pending'?'<button class=\"secondary small-btn\" data-14o-correction=\"'+esc14o(x.id)+'\" data-action=\"approve\">Approve</button> <button class=\"secondary small-btn\" data-14o-correction=\"'+esc14o(x.id)+'\" data-action=\"reject\">Reject</button>':'—')+'</td></tr>').join(''),profileRows=profiles.slice(0,12).map(x=>'<tr><td>'+esc14o(x.supplier_name||x.supplier_key||'—')+'</td><td>'+esc14o(x.status||'pending')+'</td><td>'+Number(x.sample_count||0)+'</td><td>'+esc14o((x.labels?.invoice_labels||[]).join(', ')||'—')+'</td><td><button class=\"secondary small-btn\" data-14o-profile=\"'+esc14o(x.id)+'\" data-action=\"'+(x.status==='active'?'disable':'activate')+'\">'+(x.status==='active'?'Disable':'Activate')+'</button></td></tr>').join(''),lastEvents=events.slice(0,5).map(x=>esc14o((x.event_type||'event')+' · '+(x.supplier_name||'Unknown supplier'))).join('<br>')||'No parser quality events yet.';\n      panel.innerHTML='<div class=\"panel-head\"><div><h2>Parser Quality Dashboard <span style=\"font-size:11px;padding:3px 7px;border-radius:999px;background:#eef4ff;color:#2457a7;vertical-align:middle\">Admin only</span></h2><p class=\"muted\">Regression protection, correction learning, supplier profiles and exact-file duplicate controls.</p></div><div><button type=\"button\" class=\"secondary small-btn\" data-14o-run-regression>Run regression</button> <button type=\"button\" class=\"secondary small-btn\" data-14o-refresh>Refresh</button></div></div><div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:12px 0\"><div class=\"metric\"><div><span>Regression</span><strong>'+(reg.ok?'PASS':'FAIL')+'</strong><small>'+esc14o(reg.at||'')+'</small></div></div><div class=\"metric\"><div><span>Correction Memory</span><strong>'+pending+' pending</strong><small>'+approved+' approved</small></div></div><div class=\"metric\"><div><span>Supplier Profiles</span><strong>'+active+' active</strong><small>'+profiles.length+' total</small></div></div><div class=\"metric\"><div><span>Exact PDF blocks</span><strong>'+intel.duplicateBlocks+'</strong><small>this session</small></div></div><div class=\"metric\"><div><span>Database</span><strong>'+migration+'</strong><small>14o intelligence schema</small></div></div></div>'+(!intel.migrationReady?'<div class=\"warning-box\"><strong>Parser intelligence database patch is not installed.</strong> Run <code>supabase-v7-03-3-14o-parser-intelligence.sql</code>. Core inventory remains available; learning/profile persistence and server-side fingerprint lookup stay disabled until then.</div>':'')+'<details open><summary><strong>Correction Memory</strong></summary><div class=\"table-wrap\"><table><thead><tr><th>Supplier</th><th>Field</th><th>Correction</th><th>Status</th><th>Action</th></tr></thead><tbody>'+(correctionRows||'<tr><td colspan=\"5\">No corrections recorded.</td></tr>')+'</tbody></table></div></details><details><summary><strong>Supplier Layout Profiles</strong></summary><div class=\"table-wrap\"><table><thead><tr><th>Supplier</th><th>Status</th><th>Samples</th><th>Invoice labels</th><th>Action</th></tr></thead><tbody>'+(profileRows||'<tr><td colspan=\"5\">No supplier profiles recorded.</td></tr>')+'</tbody></table></div></details><details><summary><strong>Recent parser quality events</strong></summary><p class=\"muted\">'+lastEvents+'</p></details><p class=\"muted\" style=\"margin-top:10px\">Known-good recovery baseline: <code>v7.03.3.14m · 742bbf4f66b4f3ae257b5e813661c7b555fb874c</code></p>';window.lucide?.createIcons();\n    }\n    async function reviewCorrection14o(id,action){if(!isAdmin14o())return;if(CFG.mode==='supabase'&&state?.db?.sb)await rpc14o('review_parser_correction_v703314o',{p_id:id,p_action:action});else{const d=localData(),x=(d.corrections||[]).find(r=>String(r.id)===String(id));if(x)x.status=action==='approve'?'approved':'rejected';saveLocal(d);}await refreshIntelligence14o();}\n    async function reviewProfile14o(id,action){if(!isAdmin14o())return;if(CFG.mode==='supabase'&&state?.db?.sb)await rpc14o('review_supplier_profile_v703314o',{p_id:id,p_action:action});else{const d=localData(),x=(d.profiles||[]).find(r=>String(r.id)===String(id));if(x)x.status=action==='activate'?'active':'disabled';saveLocal(d);}await refreshIntelligence14o();}\n    document.addEventListener('change',e=>{const el=e.target;if(!(el instanceof HTMLInputElement)||el.type!=='file'||!el.files?.[0])return;resetImportIntelligence14o();setTimeout(()=>inspectFile14o(el.files[0]),0);},true);\n    document.addEventListener('input',e=>{if(e.target?.closest?.('#reviewArea')&&e.target?.type!=='file')intel.userTouched=true;},true);\n    document.addEventListener('click',e=>{const override=e.target.closest?.('[data-14o-fingerprint-override]');if(override){if(isAdmin14o()){intel.fingerprintOverride=true;renderFingerprintWarning14o();toast('Admin override enabled for this exact PDF duplicate.');}return;}const run=e.target.closest?.('[data-14o-run-regression]');if(run){runRegression14o();renderQualityDashboard14o();return;}const refresh=e.target.closest?.('[data-14o-refresh]');if(refresh){refreshIntelligence14o();return;}const correction=e.target.closest?.('[data-14o-correction]');if(correction){reviewCorrection14o(correction.dataset['14oCorrection'],correction.dataset.action).catch(err=>toast(friendlyError(err)));return;}const profile=e.target.closest?.('[data-14o-profile]');if(profile){reviewProfile14o(profile.dataset['14oProfile'],profile.dataset.action).catch(err=>toast(friendlyError(err)));return;}const save=e.target.closest?.('#saveImportBtn');if(save){if(intel.fingerprintDuplicate&&!intel.fingerprintOverride){e.preventDefault();e.stopImmediatePropagation();intel.duplicateBlocks++;renderQualityDashboard14o();toast('Exact PDF duplicate blocked.');return;}try{if(typeof collectParsed==='function')collectParsed();intel.pendingCorrections=correctionDiff14o();}catch(err){console.warn('Correction Memory diff skipped',err);}}},true);\n    const observeReview14o=()=>{const area=document.getElementById('reviewArea');if(!area)return;const capture=()=>{if(!area.classList.contains('hidden')&&state?.parsed&&!intel.userTouched)setTimeout(snapshotParse14o,120);};new MutationObserver(capture).observe(area,{attributes:true,attributeFilter:['class']});capture();};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observeReview14o,{once:true});else observeReview14o();\n    if(typeof renderDashboard==='function'&&!renderDashboard.__v703314o){const prevDashboard=renderDashboard;renderDashboard=function(){const r=prevDashboard.apply(this,arguments);try{if(isAdmin14o()&&Date.now()-intel.lastRefresh>30000)refreshIntelligence14o();else renderQualityDashboard14o();}catch(_e){}return r;};renderDashboard.__v703314o=true;}\n    runRegression14o();setTimeout(()=>refreshIntelligence14o(),600);diagnostics.installed=true;diagnostics.stage='ready';diagnostics.state=intel;diagnostics.runRegression=runRegression14o;diagnostics.refresh=refreshIntelligence14o;\n  }catch(err){diagnostics.stage='failed';diagnostics.error=String(err?.message||err);console.warn('V7.03.3.14o parser intelligence enhancement failed non-fatally.',err);}\n})();\n";

    src += "\n(function v703314pInstallAerospaceRecovery(){\n  if(window.__AV_14P_DIAGNOSTICS__?.installed)return;\n  const api=globalThis.V7033Patch,diagnostics=window.__AV_14P_DIAGNOSTICS__={version:'7.03.3.14p',installed:false,stage:'boot',error:null,lastTargetedOcr:null};\n  try{\n    if(!api||typeof api.v703314pReconcileHeader!=='function'||typeof api.runAerospaceRegressionChecks14p!=='function'){diagnostics.stage='dependencies-unavailable';diagnostics.error='14p recovery helpers unavailable.';return;}\n    async function targetedRecovery14p(file){\n      if(!file||typeof v662FileKind!=='function'||v662FileKind(file)!=='pdf')return false;\n      const T=await v661EnsureTesseract(),pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';\n      const data=new Uint8Array(await file.arrayBuffer()),pdf=await pdfjs.getDocument({data}).promise;if(!pdf.numPages)return false;\n      const page=await pdf.getPage(1),vp=page.getViewport({scale:4.8}),canvas=document.createElement('canvas');canvas.width=Math.round(vp.width);canvas.height=Math.round(vp.height);await page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport:vp}).promise;\n      const crop=(x,y,w,h)=>{const c=document.createElement('canvas'),sx=Math.round(canvas.width*x),sy=Math.round(canvas.height*y),sw=Math.max(1,Math.round(canvas.width*w)),sh=Math.max(1,Math.round(canvas.height*h));c.width=sw;c.height=sh;c.getContext('2d',{willReadFrequently:true}).drawImage(canvas,sx,sy,sw,sh,0,0,sw,sh);return c;};\n      const specs=[\n        {key:'recovery-header-hi',label:'HEADER HIGH RES',x:.02,y:.05,w:.96,h:.53,psm:T.PSM?.SPARSE_TEXT??'11',prep:false},\n        {key:'recovery-header-prep-hi',label:'HEADER PREP HIGH RES',x:.02,y:.05,w:.96,h:.53,psm:T.PSM?.SPARSE_TEXT??'11',prep:true},\n        {key:'recovery-header-right-hi',label:'HEADER RIGHT HIGH RES',x:.45,y:.30,w:.53,h:.31,psm:T.PSM?.SINGLE_BLOCK??'6',prep:false},\n        {key:'recovery-table-hi',label:'TABLE HIGH RES',x:.02,y:.48,w:.96,h:.49,psm:T.PSM?.SINGLE_BLOCK??'6',prep:false},\n        {key:'recovery-table-prep-hi',label:'TABLE PREP HIGH RES',x:.02,y:.48,w:.96,h:.49,psm:T.PSM?.SINGLE_BLOCK??'6',prep:true}\n      ],out=[],worker=await T.createWorker('eng');\n      try{\n        for(let i=0;i<specs.length;i++){\n          const s=specs[i],rawCrop=crop(s.x,s.y,s.w,s.h),input=s.prep&&typeof v703314nPreprocessCanvas==='function'?v703314nPreprocessCanvas(rawCrop):rawCrop;\n          setProgress(86+Math.round(((i+1)/specs.length)*8),'Deep recovery '+s.label+'…');await worker.setParameters({tessedit_pageseg_mode:s.psm,preserve_interword_spaces:'1',user_defined_dpi:'300'});\n          const r=await worker.recognize(input,{}, {text:true,tsv:true,hocr:true,blocks:true}),layout=typeof ocrResultToLayout==='function'?ocrResultToLayout(r.data||{},1,input.height):null,text=String(r.data?.text||'').trim()||(layout?.rows||[]).map(x=>x.text).join('\\n').trim();\n          if(text)out.push({source:s.key,label:s.label,text,layout:layout?[layout]:[],score:1800+(typeof ocrTextQuality==='function'?ocrTextQuality(text):0)+(layout&&typeof layoutInvoiceQuality==='function'?layoutInvoiceQuality(layout):0)});\n        }\n      }finally{await worker.terminate();}\n      if(out.length){const existing=[...(state.ocrCandidates||[])],seen=new Set(existing.map(x=>String(x.source||'')+'|'+String(x.text||'').replace(/\\s+/g,' ').slice(0,500)));for(const x of out){const key=x.source+'|'+x.text.replace(/\\s+/g,' ').slice(0,500);if(!seen.has(key)){seen.add(key);existing.push(x);}}state.ocrCandidates=existing.sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));}\n      diagnostics.lastTargetedOcr={at:new Date().toISOString(),candidates:out.map(x=>({source:x.source,chars:x.text.length,rows:x.layout?.[0]?.rows?.length||0}))};return out.length>0;\n    }\n    if(typeof forceOcrRecovery==='function'&&!forceOcrRecovery.__v703314p){\n      const previousForce=forceOcrRecovery,wrapped=async function(file){let base=false,extra=false;try{base=await previousForce(file);}catch(err){console.warn('Base recovery OCR failed; 14p targeted recovery will still be attempted.',err);}try{extra=await targetedRecovery14p(file);}catch(err){console.warn('14p targeted recovery OCR could not complete.',err);}return !!(base||extra);};wrapped.__v703314p=true;forceOcrRecovery=wrapped;\n    }\n    function collectRecovered14p(sources=[]){\n      const combined=(sources||[]).map(x=>String(x?.text||'')).filter(Boolean).join('\\n'),rows=[];\n      for(const src of sources||[]){\n        rows.push(...(api.v703314pRecoverEquipmentRows(String(src?.text||''),String(src?.source||'evidence'))||[]));\n        if(Array.isArray(src?.layout)&&src.layout.length){const old=state.pdfLayout;try{state.pdfLayout=src.layout;for(const fn of [typeof v679StrictLayoutItems==='function'?v679StrictLayoutItems:null,typeof v661ParseProductCodeLayoutItems==='function'?v661ParseProductCodeLayoutItems:null,typeof v661FlexibleProductLayoutItems==='function'?v661FlexibleProductLayoutItems:null]){if(fn)try{rows.push(...(fn()||[]));}catch(_e){}}}finally{state.pdfLayout=old;}}\n      }\n      let safe=rows;try{if(typeof inventoryOnlyItems==='function')safe=inventoryOnlyItems(safe);}catch(_e){}try{if(typeof sanitizeParsedInventoryItems==='function')safe=sanitizeParsedInventoryItems(safe,combined);}catch(_e){}try{if(typeof v677ValidateInvoiceLines==='function')safe=v677ValidateInvoiceLines(safe,combined);}catch(_e){}\n      const seen=new Set(),out=[];for(const x of safe||[]){const key=[String(x.sku||'').toLowerCase().replace(/[^a-z0-9]/g,''),String(x.item_name||x.description||'').toLowerCase().replace(/[^a-z0-9]/g,''),Number(x.quantity)||0,Number(x.amount)||0].join('|');if(!key.replace(/[|0]/g,'')||seen.has(key))continue;seen.add(key);out.push(x);}return out;\n    }\n    if(typeof v661FinalizeParsedInvoice==='function'&&!v661FinalizeParsedInvoice.__v703314p){\n      const previousFinalizer=v661FinalizeParsedInvoice,wrapped=function(){let out=previousFinalizer.apply(this,arguments),raw=String(arguments[1]||out?.raw||out?.rawText||''),sources=typeof v661EvidenceSources==='function'?v661EvidenceSources(raw):[{source:'primary',text:raw,layout:[]}];out={...out,doc:api.v703314pReconcileHeader(out?.doc||{},sources)};\n        if(!(out.items||[]).length){const recovered=collectRecovered14p(sources);if(recovered.length)out={...out,items:recovered,excludedServiceCount:Number(out.excludedServiceCount)||0};}\n        const combined=sources.map(x=>String(x?.text||'')).filter(Boolean).join('\\n'),strong=api.v703314pStrongEquipmentInvoice(combined);if(strong.strong&&!['service','noninventory'].includes(out?.invoiceClassification?.type||'')){out.invoiceClassification={...(out.invoiceClassification||{}),type:'equipment',reason:strong.reason,v703314pAutoEquipment:true};out.serviceOnlyInvoice=false;out.nonInventoryOnlyInvoice=false;}\n        try{out=api.applyParsedFixes(out,raw,sources.map(x=>({source:x.source||'evidence',text:x.text||'',page:1})));}catch(err){console.warn('14p deterministic final pass skipped',err);}return out;};wrapped.__v703314p=true;v661FinalizeParsedInvoice=wrapped;\n    }\n    if(typeof renderImportEligibility==='function'&&!renderImportEligibility.__v703314p){\n      const previousEligibility=renderImportEligibility,wrapped=function(){const parsed=state?.parsed,raw=String(parsed?.raw||parsed?.rawText||''),strong=parsed?.invoiceClassification?.type==='equipment'||api.v703314pStrongEquipmentInvoice(raw).strong;if(strong&&parsed&&!['service','noninventory'].includes(parsed?.invoiceClassification?.type||'')){parsed.invoiceClassification={...(parsed.invoiceClassification||{}),type:'equipment',reason:parsed.invoiceClassification?.reason||'Strong physical equipment evidence.',v703314pAutoEquipment:true};state.importClassificationChoice='equipment';}\n        const result=previousEligibility.apply(this,arguments);if(strong&&parsed){const note=document.getElementById('invoiceEligibilityWarning'),items=parsed.items||[],missingInvoice=!String(parsed.doc?.invoice_number||'').trim();if(note&&(items.length===0||missingInvoice)){note.classList.remove('hidden');note.style.cssText='margin:0 0 14px;padding:12px 14px;border:1px solid #b9d9ff;border-radius:10px;background:#eff7ff;color:#175cd3;font-size:12px;line-height:1.45';note.innerHTML='<strong>Equipment invoice detected.</strong> Physical equipment evidence is clear, so no Equipment/Service confirmation is needed. '+(items.length?'Review the remaining invoice fields before saving.':'The app is running evidence-based line-item recovery; no guessed inventory row will be created.');}}return result;};wrapped.__v703314p=true;renderImportEligibility=wrapped;\n    }\n    diagnostics.regression=api.runAerospaceRegressionChecks14p();diagnostics.installed=true;diagnostics.stage=diagnostics.regression.ok?'ready':'regression-failed';\n  }catch(err){diagnostics.stage='failed';diagnostics.error=String(err?.message||err);console.warn('V7.03.3.14p Aerospace recovery enhancement failed non-fatally.',err);}\n})();\n";

    src += "\n(function v703314qInstallMoneyAndGroupHardening(){\n  if(window.__AV_14Q_DIAGNOSTICS__?.installed)return;\n  const api=globalThis.V7033Patch,diagnostics=window.__AV_14Q_DIAGNOSTICS__={version:'7.03.3.14r',installed:false,stage:'boot',error:null};\n  try{\n    if(!api||typeof api.v703314qChooseMoneyCandidate!=='function'){diagnostics.stage='dependencies-unavailable';diagnostics.error='14q monetary consensus helpers unavailable.';return;}\n    function candidateRows14q(raw=''){\n      const sources=typeof v661EvidenceSources==='function'?v661EvidenceSources(raw):[{source:'chosen',text:raw,layout:state.pdfLayout||[]}],rows=[],oldLayout=state.pdfLayout;\n      const add=(items,source,strict=false,observed=3)=>{for(const x of items||[])rows.push({...x,v703314qSource:source,v703314qStrictLayout:strict,v703314qObservedFields:observed});};\n      try{\n        for(const src of sources){\n          if(Array.isArray(src.layout)&&src.layout.length){\n            state.pdfLayout=src.layout;\n            if(typeof v679StrictLayoutItems==='function')try{add(v679StrictLayoutItems(),src.source+'|strict-layout',true,3);}catch(_e){}\n            if(typeof v661ParseProductCodeLayoutItems==='function')try{add(v661ParseProductCodeLayoutItems(),src.source+'|product-layout',/table.*hi/i.test(src.source),3);}catch(_e){}\n            if(typeof v661FlexibleProductLayoutItems==='function')try{add(v661FlexibleProductLayoutItems(),src.source+'|flex-layout',/table.*hi/i.test(src.source),3);}catch(_e){}\n          }\n          if(typeof v662ParsePhysicalEvidenceRows==='function')try{add(v662ParsePhysicalEvidenceRows(src.text||''),src.source+'|text-physical',false,3);}catch(_e){}\n          if(typeof v690ParseNumberedPricedRows==='function')try{add(v690ParseNumberedPricedRows(src.text||''),src.source+'|numbered-text',false,3);}catch(_e){}\n        }\n      }finally{state.pdfLayout=oldLayout;}\n      return {sources,rows};\n    }\n    function reconcileMoney14q(parsed={},raw=''){\n      if(!parsed||!Array.isArray(parsed.items)||!parsed.items.length)return parsed;\n      const evidence=candidateRows14q(raw),out={...parsed,items:parsed.items.map(x=>({...x}))},repairs=[],reviews=[];\n      for(let i=0;i<out.items.length;i++){\n        const row=out.items[i],choice=api.v703314qChooseMoneyCandidate(row,evidence.rows);\n        if(choice.changed){\n          const before={quantity:row.quantity,unit_price:row.unit_price,amount:row.amount};\n          row.quantity=choice.values.quantity;row.unit_price=choice.values.unit_price;row.amount=choice.values.amount;\n          row.quantityReviewRequired=false;row.priceReviewRequired=false;row.unit_priceReviewRequired=false;row.amountReviewRequired=false;\n          if(row.v7033ReviewFields){delete row.v7033ReviewFields.quantity;delete row.v7033ReviewFields.unit_price;delete row.v7033ReviewFields.amount;}\n          row.v703314qMoneyRecovery={before,after:{quantity:row.quantity,unit_price:row.unit_price,amount:row.amount},reason:choice.reason,evidence:choice.evidence};repairs.push({index:i,sku:row.sku||'',...row.v703314qMoneyRecovery});\n        }else if(choice.review){\n          const economics=api.v703314qEconomicValues(row);\n          row.quantityReviewRequired=!!row.quantityReviewRequired||!economics.ok;row.priceReviewRequired=true;row.amountReviewRequired=true;row.humanReviewRequired=true;row.needsReview=true;\n          row.v7033ReviewFields={...(row.v7033ReviewFields||{}),unit_price:{status:'review',reason:choice.reason},amount:{status:'review',reason:choice.reason}};reviews.push({index:i,sku:row.sku||'',reason:choice.reason});\n        }\n      }\n      if(repairs.length||reviews.length)out.v703314qMoneyConsensus={repairs,reviews,candidate_rows:evidence.rows.length,sources:evidence.sources.map(x=>x.source)};\n      return out;\n    }\n    if(typeof v661FinalizeParsedInvoice==='function'&&!v661FinalizeParsedInvoice.__v703314q){\n      const previous=v661FinalizeParsedInvoice,wrapped=function(){let out=previous.apply(this,arguments);const raw=String(arguments[1]||out?.raw||out?.rawText||'');out=reconcileMoney14q(out,raw);try{out=api.applyParsedFixes(out,raw,(typeof v661EvidenceSources==='function'?v661EvidenceSources(raw):[]).map(x=>({source:x.source||'evidence',text:x.text||'',page:1})));}catch(err){console.warn('14q deterministic validation refresh skipped',err);}return out;};wrapped.__v703314q=true;v661FinalizeParsedInvoice=wrapped;\n    }\n    function collapseDocumentGroups14q(root=document){\n      root.querySelectorAll?.('.v669-doc-group').forEach(section=>{if(section.dataset.v703314qCollapsed==='1')return;const toggle=section.querySelector('.v669-doc-group-toggle'),body=section.querySelector('.v669-doc-group-body');if(!toggle||!body)return;body.classList.add('hidden');toggle.setAttribute('aria-expanded','false');const span=toggle.querySelector('span');if(span)span.textContent=span.textContent.replace(/[▾▸]\\s*$/,'').trim()+' ▸';section.dataset.v703314qCollapsed='1';});\n    }\n    function initialiseInventoryGroups14q(root=document){\n      root.querySelectorAll?.('#inventoryTable .inventory-company-group').forEach(section=>{if(section.dataset.v703314qCollapsed==='1')return;const head=section.querySelector('.document-group-head'),table=section.querySelector('table');if(!head||!table)return;table.hidden=true;head.setAttribute('role','button');head.setAttribute('tabindex','0');head.setAttribute('aria-expanded','false');head.style.cursor='pointer';const count=head.querySelector('span');if(count)count.textContent=count.textContent.replace(/[▾▸]\\s*$/,'').trim()+' ▸';const toggle=()=>{const hidden=!table.hidden;table.hidden=hidden;head.setAttribute('aria-expanded',String(!hidden));if(count)count.textContent=count.textContent.replace(/[▾▸]\\s*$/,'').trim()+(hidden?' ▸':' ▾');};head.addEventListener('click',toggle);head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});section.dataset.v703314qCollapsed='1';});\n    }\n    function enforceCollapsedGroups14q(){collapseDocumentGroups14q();initialiseInventoryGroups14q();}\n    const groupObserver=new MutationObserver(()=>queueMicrotask(enforceCollapsedGroups14q)),startObserver=()=>{const docs=document.getElementById('documentsTable'),inv=document.getElementById('inventoryTable');if(docs)groupObserver.observe(docs,{childList:true,subtree:true});if(inv)groupObserver.observe(inv,{childList:true,subtree:true});enforceCollapsedGroups14q();};\n    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startObserver,{once:true});else startObserver();\n    if(typeof renderInventory==='function'&&!renderInventory.__v703314q){const prev=renderInventory;renderInventory=function(){const r=prev.apply(this,arguments);initialiseInventoryGroups14q();return r;};renderInventory.__v703314q=true;}\n    document.addEventListener('change',e=>{if(e.target?.id==='inventoryGroup')setTimeout(initialiseInventoryGroups14q,0);},true);\n    document.addEventListener('click',e=>{if(e.target.closest?.('[data-v669-doc-layout=\"company\"]'))setTimeout(collapseDocumentGroups14q,0);},true);\n    diagnostics.regression=api.runMonetaryConsensusRegressionChecks14q();diagnostics.installed=true;diagnostics.stage=diagnostics.regression.ok?'ready':'regression-failed';diagnostics.reconcileMoney=reconcileMoney14q;diagnostics.enforceGroups=enforceCollapsedGroups14q;\n  }catch(err){diagnostics.stage='failed';diagnostics.error=String(err?.message||err);console.warn('V7.03.3.14r money/group hardening failed non-fatally.',err);}\n})();\n";

    src+='\ntry{installParseAuditWrappers();configureInvoiceFileInputs();}catch(e){console.warn(\'V6.69 optional audit/file-input setup skipped\',e);}\n';

      // V7.03.3.14r direct final-runtime hardening; remaining inner compatibility patching is temporary.
      src=replaceOnce(src,"function v661FinalizeParsedInvoice",V703314R_HEADER_ALIGNED_HELPER+"\n"+V703314R_INVENTORY_GROUP_HELPER+"\nfunction v661FinalizeParsedInvoice",'14r final-runtime helpers');
      src=replaceOnce(src,"const candidates=[];const add=(arr,origin,srcText)=>{const xs=sanitizeParsedInventoryItems((arr||[]).map(normalizeParsedInvoiceItem),srcText||evidence).filter(x=>String(x.item_name||'').trim()&&Number(x.quantity)>0);if(xs.length){const targetedBoost=/^av-targeted:avmedia-targeted$/i.test(String(origin||''))?120:0;candidates.push({origin,items:xs,score:invoiceItemsQuality(xs,doc.subtotal)+targetedBoost});}};","const candidates=[];const add=(arr,origin,srcText)=>{const xs=sanitizeParsedInventoryItems((arr||[]).map(normalizeParsedInvoiceItem),srcText||evidence).filter(x=>String(x.item_name||'').trim()&&Number(x.quantity)>0);if(xs.length)candidates.push({origin,items:xs,score:invoiceItemsQuality(xs,doc.subtotal)});};",'14r remove text-only AV monetary boost');
      src=replaceOnce(src,"for(const src of sources){const old=state.pdfLayout;state.pdfLayout=src.layout||[];const strict=v679StrictLayoutItems();","for(const src of sources){const old=state.pdfLayout;state.pdfLayout=src.layout||[];const aligned=v703314rHeaderAlignedLayoutItems(src.text||'');if(aligned.length){const xs=sanitizeParsedInventoryItems(aligned,src.text);candidates.push({origin:'header-aligned:'+src.source,items:xs,score:invoiceItemsQuality(xs,doc.subtotal)+v679EconomicQuality(xs)+420});}const strict=v679StrictLayoutItems();",'14r header-aligned monetary candidate');
      src=replaceOnce(src,"const sourceBoost=o=>/stacked-priced:recovery-block/i.test(o)?760:","const sourceBoost=o=>/^header-aligned:/i.test(o)?980:/stacked-priced:recovery-block/i.test(o)?760:",'14r header-aligned candidate priority');
      src=replaceOnce(src,"const strictCandidates=candidates.filter(c=>String(c.origin||'').startsWith('strict-layout:')&&c.items?.length&&c.verifiedRows>0&&c.badRows===0);","const strictCandidates=candidates.filter(c=>(String(c.origin||'').startsWith('header-aligned:')||String(c.origin||'').startsWith('strict-layout:'))&&c.items?.length&&c.verifiedRows>0&&c.badRows===0);",'14r preferred verified layout candidates');
      src=replaceOnce(src,"  $('inventoryTable').innerHTML=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{sensitivity:'base'})).map(([company,list])=>`<section class=\"document-group inventory-company-group\"><div class=\"document-group-head\"><strong>${esc(company)}</strong><span>${list.length} item${list.length===1?'':'s'}</span></div><table>${head}<tbody>${list.map(x=>x.html).join('')}</tbody></table></section>`).join('');","  v703314rRenderInventoryGroups(groups,head);",'14r Inventory grouped card layout');
    const blob=new Blob([src],{type:'text/javascript'}),url=URL.createObjectURL(blob);
    try{await import(url);}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(err){
    window.__AV_STATIC_RUNTIME_ERROR__=String(err?.message||err);console.error('AV Inventory Hub V7.03.3.14r startup error:',err);
    const box=document.createElement('div');
    box.style.cssText='position:fixed;inset:20px;z-index:99999;background:#fff;border:1px solid #d33;border-radius:12px;padding:20px;font:14px/1.5 Arial;color:#222;box-shadow:0 10px 30px #0002';
    box.innerHTML='<b>AV Inventory Hub V7.03.3.14r could not start.</b><br>The verified V6.55 base was left untouched in Git history.<br><br><code>'+String(err.message||err).replace(/[&<>]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[s]))+'</code>';
    document.body.appendChild(box);
  }
}


const V667_RELEASE_NOTES=[
  'V7.03.3.14r startup hotfix: built directly from verified V7.02 Startup Fix baseline with the reviewed V7.03 parser delta',
  'Three-layer verification: primary evidence parser, independent re-check, then human review only when unresolved',
  'Blank serial numbers are valid and no longer create duplicate/review failures by themselves',
  'Only confirmed duplicate non-empty serials are hard-blocked; uncertain ownership is routed to human review',
  'Completeness validation checks expected equipment count plus row identity instead of count alone',
  'Independent-parser disagreements retain review choices/evidence and are never silently guessed',
  'Final save gate uses PASS / REVIEW / BLOCK: only confirmed blocking violations prevent save automatically',

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
    window.__AV_INVENTORY_VERSION__='7.03.3.14r';
    const cv=document.getElementById('releaseCurrentVersion'),av=document.getElementById('appVersion'),notes=document.getElementById('releaseCurrentNotes');
    if(cv)cv.textContent='v7.03.3.14r';if(av)av.textContent='Version 7.03.3.14r';
    if(notes&&!notes.children.length)notes.innerHTML=V667_RELEASE_NOTES.map(x=>'<li>'+x.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</li>').join('');
  }catch(e){console.warn('V6.81 patch-notes fallback skipped',e);}
}
document.addEventListener('click',e=>{if(e.target.closest?.('#patchNotesBtn'))setTimeout(v667EnsurePatchNotesUi,0);},true);
setTimeout(v667EnsurePatchNotesUi,0);

function v667ApplySkuInputLimits(){
  document.querySelectorAll('#itemSku,#parsedItems input[data-field="sku"],#parsedItems input[name*="sku" i]').forEach(el=>{el.maxLength=28;if(el.value.length>28)el.value=el.value.slice(0,28);});
  document.querySelectorAll('#parsedItems input').forEach(el=>{const wrap=el.closest('label,.field,.parsed-field,.parsed-line,.line-item,.parsed-item');const text=wrap?.textContent||'';if(/SKU\s*\/\s*model/i.test(text)){el.maxLength=28;if(el.value.length>28)el.value=el.value.slice(0,28);}});
}
document.addEventListener('input',e=>{const el=e.target;if(!(el instanceof HTMLInputElement))return;if(el.id==='itemSku'||el.dataset?.field==='sku'||/sku/i.test(el.name||'')){if(el.value.length>28)el.value=el.value.slice(0,28);}},true);
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
    const toggle=document.createElement('button');toggle.type='button';toggle.className='v669-doc-group-toggle';toggle.setAttribute('aria-expanded','false');toggle.innerHTML=`<strong>${v669EscapeHtml(g.name)}</strong><span>${g.rows.length} invoice${g.rows.length===1?'':'s'} ▸</span>`;
    const body=document.createElement('div');body.className='v669-doc-group-body hidden';
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

window.__AV_STATIC_RUNTIME_READY__=launch().then(()=>{if(window.__AV_STATIC_RUNTIME_ERROR__)throw new Error(window.__AV_STATIC_RUNTIME_ERROR__);window.__AV_STATIC_RUNTIME_LOADED__='7.03.3.14r';return true;});


;try{globalThis.V7032Patch?.installParserPatch();globalThis.V7033Patch?.installParserPatch();globalThis.V7033Patch?.installUiVersionSync();}catch(e){console.warn('v7.03.3.9 post-launch patch install skipped',e);}

function v7033PrepareImportLines(lines=[]){
  try{return globalThis.V7033Patch?.prepareLinesForInventory(lines,state?.data?.items||[])||lines;}catch(e){console.warn('v7.03.3.9 inventory match preparation skipped',e);return lines;}
}
(function v7033WrapImports(){
  try{
    if(typeof LocalDB!=='undefined'&&!LocalDB.prototype.__v7033Import){const orig=LocalDB.prototype.importPurchase;LocalDB.prototype.importPurchase=async function(doc,purchase,lines,file){return orig.call(this,doc,purchase,v7033PrepareImportLines(lines),file);};LocalDB.prototype.__v7033Import=true;}
    if(typeof SupabaseDB!=='undefined'&&!SupabaseDB.prototype.__v7033Import){const orig=SupabaseDB.prototype.importPurchase;SupabaseDB.prototype.importPurchase=async function(doc,purchase,lines,file){return orig.call(this,doc,purchase,v7033PrepareImportLines(lines),file);};SupabaseDB.prototype.__v7033Import=true;}
  }catch(e){console.warn('v7.03.3.9 import matching wrapper skipped',e);}
})();

async function v7033AutoWebVerify(){
  try{
    if(!globalThis.V7032WebVerify||!state?.parsed)return;
    const raw=state.parsed.raw||state.parsed.rawText||'';
    // Re-apply deterministic v7.03.3 identity fixes before any web validation.
    state.parsed=globalThis.V7033Patch?.applyParsedFixes(state.parsed,raw)||state.parsed;
    if(typeof renderParsedItems==='function')renderParsedItems();
    if(typeof v703RenderVerificationNotice==='function')v703RenderVerificationNotice();
    const d=state.parsed.doc||{};const sig=[d.invoice_number||'',...(state.parsed.items||[]).map(x=>[x.sku,x.item_name,x.quantity].join(':'))].join('|');
    if(state.parsed.__v7033WebSig===sig)return;state.parsed.__v7033WebSig=sig;
    const result=await globalThis.V7032WebVerify.verifyParsed(state.parsed,raw,{timeoutMs:7000});
    // Re-apply deterministic evidence AFTER Level 2 as well, so an unavailable web/secondary match cannot recreate a false Level 3 warning.
    state.parsed=globalThis.V7033Patch?.applyParsedFixes(result.parsed,raw)||result.parsed;
    result.parsed=state.parsed;
    globalThis.V7032WebVerify.renderNotice(result);if(typeof v703RenderVerificationNotice==='function')v703RenderVerificationNotice();if(typeof v661RenderImportEligibility==='function')v661RenderImportEligibility();
  }catch(e){console.warn('v7.03.3.9 Level 2B web verification skipped',e);}
}
function v7033InstallReviewObserver(){const area=document.getElementById('reviewArea');if(!area)return;const run=()=>{if(!area.classList.contains('hidden'))setTimeout(v7033AutoWebVerify,250);};new MutationObserver(run).observe(area,{attributes:true,attributeFilter:['class']});document.addEventListener('click',e=>{if(e.target.closest?.('#addParsedItemBtn,#saveImportBtn'))setTimeout(v7033AutoWebVerify,150);},true);run();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',v7033InstallReviewObserver,{once:true});else v7033InstallReviewObserver();



let __v7033ConsolidationTried=false;
async function v7033ConsolidateExistingSafeDuplicates(){
  if(__v7033ConsolidationTried||CFG.mode!=='supabase'||!state?.db?.sb)return;__v7033ConsolidationTried=true;
  try{const {data,error}=await state.db.sb.rpc('consolidate_inventory_duplicates_v7033');if(error){if(/function|schema cache|not found|PGRST202|42883/i.test(String(error.message||'')))return;throw error;}const merged=Number(data?.merged_items||0);if(merged>0){state.data=await state.db.load();renderAll();toast('Consolidated '+merged+' verified duplicate inventory record'+(merged===1?'':'s')+'.');}}catch(e){console.warn('v7.03.3.9 duplicate consolidation skipped',e);}
}
// Existing duplicate consolidation is intentionally NOT run automatically at startup.
// Run the bundled Supabase consolidation function only as an explicit maintenance step.
window.v7033ConsolidateExistingSafeDuplicates=v7033ConsolidateExistingSafeDuplicates;

