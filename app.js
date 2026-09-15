// AV Inventory Hub V6.62 — calendar-safe invoice dates, resilient AV Media table recovery and evidence validation
// This patch loader applies V6.62 safely on top of the verified V6.55 source.
const ORIGINAL_APP_URL='https://raw.githubusercontent.com/jamesgohjy/inventory-hub/d45233b134921b3085a1318b10443d488fd832a0/app.js';

function replaceOnce(src,needle,replacement,label=needle){
  const i=src.indexOf(needle);
  if(i<0)throw new Error('V6.62 patch marker not found: '+label);
  return src.slice(0,i)+replacement+src.slice(i+needle.length);
}
function replaceSection(src,startMarker,endMarker,replacement,label=startMarker){
  const s=src.indexOf(startMarker),e=src.indexOf(endMarker,s+startMarker.length);
  if(s<0||e<0)throw new Error('V6.62 patch section not found: '+label);
  return src.slice(0,s)+replacement+src.slice(e);
}
function asPatchedFunction(fn,newName){
  return fn.toString().replace(/^function\s+[^\s(]+/,`function ${newName}`);
}

function v661DetectInvoiceDate(text,invoice=''){
  const flat=normalizePdfText(text);
  const compact=flat.replace(/[ \t]+/g,' ');
  const labelled=[
    /(?:invoice|document|tax\s*invoice)\s*date\s*[:#.-]?\s*([0-3]?\d\s*[/.\-]\s*[01]?\d\s*[/.\-]\s*\d{2,4})/i,
    /(?:invoice|document|tax\s*invoice)\s*date\s*[:#.-]?\s*([0-3]?\d\s+[A-Za-z]{3,9}\s+\d{2,4})/i
  ];
  for(const source of [flat,compact])for(const re of labelled){const m=source.match(re);if(m){const d=parseDate(m[1]);if(d)return d;}}
  const lines=flat.split('\n').map(x=>x.trim()).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    if(/\binvoice\s*date\b/i.test(lines[i])){
      const same=dateCandidateFromText(lines[i]);if(same){const d=parseDate(same);if(d)return d;}
      for(let j=i+1;j<=Math.min(lines.length-1,i+8);j++){
        const c=dateCandidateFromText(lines[j]);if(c){const d=parseDate(c);if(d)return d;}
      }
    }
  }
  // V6.62: many AV Media invoices use a compact header labelled only "DATE".
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
  const s=normalizePdfText(v).trim().replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi,'$1').replace(/\s*([/.\-])\s*/g,'$1');
  const valid=(y,m,d)=>{y=Number(y);m=Number(m);d=Number(d);if(y<100)y+=2000;if(y<1900||y>2200||m<1||m>12||d<1||d>31)return'';const md=[31,((y%4===0&&y%100!==0)||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];if(d>md[m-1])return'';return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;};
  let m=s.match(/\b(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})\b/);if(m){const d=valid(m[1],m[2],m[3]);if(d)return d;}
  m=s.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/);if(m){const d=valid(m[3],m[2],m[1]);if(d)return d;}
  const months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
  m=s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/);if(m&&months[m[2].toLowerCase()]){const d=valid(m[3],months[m[2].toLowerCase()],m[1]);if(d)return d;}
  m=s.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})\b/);if(m&&months[m[1].toLowerCase()]){const d=valid(m[3],months[m[1].toLowerCase()],m[2]);if(d)return d;}
  return '';
}

function v661DetectInvoiceDateFromLayout(){
  const pages=state.pdfLayout||[];
  const loose=(v='')=>{const t=normalizePdfText(v).replace(/\s+/g,' ');const m=t.match(/([0-3]?\d\s*[/.\-]\s*[01]?\d\s*[/.\-]\s*\d{2,4})/);return m?parseDate(m[1]):'';};
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
  if(parsed?.invoiceClassification?.type==='service')return false;
  const d=parsed.doc||{},items=validParsedItems(parsed.items||[]),c=parsed?.invoiceClassification?.type||'uncertain';
  if(!d.invoice_number||!d.invoice_date||!items.length||c==='uncertain')return true;
  const a=Number(d.subtotal),b=Number(d.gst),z=Number(d.total_amount);if(![a,b,z].every(Number.isFinite)||Math.abs((a+b)-z)>.06)return true;
  return false;
}

async function v661EnsureTesseract(){
  if(window.Tesseract)return window.Tesseract;
  await new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-v661-tesseract]');if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';sc.async=true;sc.dataset.v661Tesseract='1';sc.onload=resolve;sc.onerror=()=>reject(new Error('Recovery OCR library could not be loaded.'));document.head.appendChild(sc);});
  if(!window.Tesseract)throw new Error('Recovery OCR library did not initialise.');return window.Tesseract;
}
async function v661ForceOcrRecovery(file){
  const kind=v662FileKind(file);if(kind==='docx')return false;const T=await v661EnsureTesseract();setProgress(40,'Key invoice fields need a deeper scan — running recovery OCR…');
  const modes=[{key:'recovery-auto',label:'AUTO',psm:T.PSM?.AUTO??'3',texts:[],layouts:[]},{key:'recovery-column',label:'SINGLE_COLUMN',psm:T.PSM?.SINGLE_COLUMN??'4',texts:[],layouts:[]},{key:'recovery-sparse',label:'SPARSE_TEXT',psm:T.PSM?.SPARSE_TEXT??'11',texts:[],layouts:[]}];
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
  const serviceSku=/\b(?:INSTALL(?:ATION)?|LABOU?R|SERVICE|DISMOUNT(?:ING)?|DISMANTL(?:E|ING)|RE-?INSTAT(?:E|EMENT)|RELOCAT(?:E|ION)|REMOV(?:E|AL)|TEST(?:ING)?|COMMISSION(?:ING)?)\b/i.test(sku);
  const strongStart=/^(?:sales\s*[-:]\s*)?(?:dismount(?:ing)?|dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|labou?r|installation|installing|services?|professional\s+services?|consultancy|consulting|training|testing|commissioning|setup|configuration|delivery|freight|transport|manpower|on[- ]?site\s+support)\b/i.test(text);
  const labourPhrase=/\b(?:supply\s+)?labou?r\s+(?:for|to|and|&)\s+(?:dismount(?:ing)?|dismantl(?:e|ing)|installation|install|services?|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|testing|commissioning)\b/i.test(text);
  const workPhrase=/\b(?:dismount(?:ing)?|dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|installation|testing|commissioning)\s*(?:work|works|service|services|job|labou?r)\b/i.test(text);
  const actionChain=/\b(?:dismount(?:ing)?|dismantl(?:e|ing)|remove|relocate|reinstate)\b[\s\S]{0,180}\b(?:install(?:ation|ing)?|test(?:ing)?|commission(?:ing)?)\b/i.test(text);
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
  return cleanInvoiceDescription(value)
    .replace(/\bShipment\s+No\.?\s*[:#.-]?\s*[A-Z0-9._\/-]+\s*[:;,-]?/gi,' ')
    .replace(/\s*\bS\s*[/\\.-]?\s*N\s*[:#.-]?\s*[A-Z0-9,._\/-\s]+$/i,'')
    .replace(/\s+/g,' ').trim();
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

function v661SanitizeParsedInventoryItems(items=[],sourceText=''){
  return (items||[]).map(line=>{
    const description=cleanInventoryDescription(line.description||line.item_name||'');
    const itemName=standardItemNameFromDescription(description);
    const printedSku=cleanVerifiedSku(line.sku||'',sourceText);
    return {...line,sku:printedSku||itemName,description,item_name:itemName};
  });
}

function v661PrepareInventoryLinesForSave(items=[]){
  const source=state.parsed?.raw||state.parsed?.rawText||'';
  return sanitizeParsedInventoryItems(items,source).map(line=>{
    const itemName=String(line.item_name||line.description||'').replace(/\s+/g,' ').trim();
    const printedSku=cleanVerifiedSku(line.sku||'',source);
    // User rule: when no printed SKU/model exists, use the verified equipment name; never AUTO-*.
    return {...line,sku:printedSku||itemName};
  });
}

function v661RecoverAvMediaHeader(doc={},rawText=''){
  const sources=v661EvidenceSources(rawText),all=sources.map(x=>x.text).join('\n'),isAv=/\bAV\s+MEDIA\b/i.test(all)||/av\s+media/i.test(String(doc.supplier_name||''));
  if(isAv)doc.supplier_name='AV Media Pte Ltd';
  const cleanInv=v=>String(v||'').replace(/\s+/g,'').replace(/[–—]/g,'-').replace(/^YIN/i,'VIN').replace(/^Y1N/i,'VIN').replace(/^V1N/i,'VIN').replace(/^YlN/i,'VIN');
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
      const dm=ctx.match(/([0-3]?\d\s*[/.-]\s*[01]?\d\s*[/.-]\s*\d{2,4})/);if(dm){date=parseDate(dm[1]);if(date)break;}
    }
    if(date)break;
    const saved=state.pdfLayout;state.pdfLayout=src.layout||[];date=detectInvoiceDateFromLayout();state.pdfLayout=saved;if(date)break;
  }
  if(date)doc.invoice_date=date;
  if(/^(?:sold|sold\s*to|delivered|delivered\s*to|customer|customer\s*code|reference|ref|date|invoice)$/i.test(String(doc.delivery_order_number||'').trim()))doc.delivery_order_number='';
  if(/^(?:sold|sold\s*to|delivered|delivered\s*to|customer|customer\s*code|date|invoice|terms)$/i.test(String(doc.reference_number||'').trim()))doc.reference_number='';
  return doc;
}

function v661ClassifyInvoiceDocument(text='',extractedItems=[],inventoryItems=[]){
  const evidence=v661EvidenceSources(text).map(x=>x.text).join('\n'),t=normalizePdfText(evidence).replace(/\s+/g,' ').trim();
  let rows=[];for(const src of v661EvidenceSources(text)){rows.push(...parseAvMediaTextItems(src.text),...v661ParseGenericPricedRows(src.text),...v662ParsePhysicalEvidenceRows(src.text));}
  rows=sanitizeParsedInventoryItems([...(extractedItems||[]),...rows],evidence);
  const physical=[...(inventoryItems||[]),...rows.filter(x=>!isNonInventoryServiceLine(x))].filter((x,i,a)=>a.findIndex(y=>norm(y.sku||y.item_name)===norm(x.sku||x.item_name)&&Number(y.amount)===Number(x.amount))===i);
  const service=rows.filter(isNonInventoryServiceLine);
  if(physical.length)return{type:'equipment',equipmentScore:10+physical.length*2,serviceScore:service.length?3:0,reason:'Verified priced physical-equipment rows were found; service rows, if any, are excluded from inventory.'};
  if(rows.length&&service.length===rows.length)return{type:'service',equipmentScore:0,serviceScore:10+service.length*2,reason:'Every verified priced row is labour/service/installation work.'};
  const productHeader=/\b(?:PRODUCT|STOCK)\s*(?:NO\.?|NUMBER|CODE)?\b/i.test(t)&&/\bDESCRIPTION\b/i.test(t)&&/\b(?:QTY|QUANTITY)\b/i.test(t)&&/\b(?:UNIT\s*)?PRICE\b/i.test(t)&&/\bAMOUNT\b/i.test(t);
  const physicalWords=/\b(?:projector|microphone|speaker|control\s+panel|camera|mixer|display|monitor|trolley|transmitter|receiver|screen|wireless\s+system|audio\s+tester|amplifier|processor|switcher|rack|stand|mount|cable)\b/i.test(t);
  const rowShape=(evidence.match(/^[A-Z0-9][A-Z0-9+._\/-]{2,}[^\n]*\s\d+(?:\.\d+)?\s+(?:S?\$?\s*)?\d[\d,]*\.\d{2}\s+(?:S?\$?\s*)?\d[\d,]*\.\d{2}\s*$/gmi)||[]).length;
  const serviceStrong=/\b(?:supply\s+)?labou?r\b/i.test(t)||/\b(?:supply\s+to\s+)?replace\b[\s\S]{0,120}\b(?:projector|microphone|speaker|display|screen|equipment)\b/i.test(t)||/\b(?:dismount(?:ing)?|dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al))\b[\s\S]{0,180}\b(?:install|replace|test|commission)/i.test(t)||/\b(?:service|installation|labou?r)\s+(?:work|works|job|charge|charges|services?)\b/i.test(t);
  const codePhysical=evidence.split(/\n+/).some(line=>/^[|.,;:\-]*\s*[A-Z0-9][A-Z0-9+._\/-]{2,}\s+/.test(line.trim())&&/\b(?:projector|microphone|speaker|control\s+panel|camera|mixer|display|monitor|trolley|transmitter|receiver|screen|audio\s+tester|amplifier|processor|switcher|rack|stand|mount)\b/i.test(line)&&/\b\d{1,4}\b/.test(line));let equipmentScore=(productHeader?4:0)+(physicalWords?2:0)+(rowShape>=2?5:rowShape===1?2:0)+(codePhysical?6:0),serviceScore=serviceStrong?6:0;
  if(serviceStrong&&!codePhysical&&rowShape<=1)serviceScore+=4;
  if(equipmentScore>=7&&equipmentScore>=serviceScore+2)return{type:'equipment',equipmentScore,serviceScore,reason:'Independent scans found a product table and priced physical-equipment evidence.'};
  if(serviceScore>=8&&equipmentScore<5)return{type:'service',equipmentScore,serviceScore,reason:'Independent scans found service-only work and no priced physical-equipment row.'};
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
  try{const fd=new FormData();fd.append('file',file,file.name);fd.append('parser_version','6.62');const headers={};if(state.session?.access_token)headers.Authorization='Bearer '+state.session.access_token;const r=await fetch(url,{method:'POST',headers,body:fd});if(!r.ok)throw new Error('Server parser '+r.status);const j=await r.json();if(j?.file_sha256)state.importFileHash=j.file_sha256;if(j?.text){state.ocrCandidates=[...(state.ocrCandidates||[]),{source:'server',text:String(j.text),layout:j.layout||[],score:999}];if(j.layout?.length)state.pdfLayout=j.layout;state.serverParseResult=j;return String(j.text);}return null;}catch(e){console.warn('Server parser unavailable; using local extraction.',e);return null;}
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
function v662ParseAuditPayload(){const d=state.parsed?.doc||{},c=state.parsed?.invoiceClassification||{};return{parser_version:'6.62',file_sha256:state.importFileHash||'',file_kind:state.importFileKind||'',classification:c.type||'uncertain',classification_reason:c.reason||'',supplier:d.supplier_name||'',invoice_number:d.invoice_number||'',invoice_date:d.invoice_date||'',line_item_count:(state.parsed?.items||[]).length,excluded_service_count:Number(state.parsed?.excludedServiceCount||0),ocr_sources:(state.ocrCandidates||[]).map(x=>x.source).filter(Boolean),created_at:new Date().toISOString()};}
function v662InstallAuditWrappers(){
  if(typeof LocalDB!=='undefined'&&!LocalDB.prototype.__v662Import){const orig=LocalDB.prototype.importPurchase;LocalDB.prototype.importPurchase=async function(doc,purchase,lines,file){const audit=v662ParseAuditPayload(),r=await orig.call(this,{...doc,file_sha256:audit.file_sha256,parser_version:'6.62',parse_audit:audit},purchase,lines,file);return r;};LocalDB.prototype.__v662Import=true;}
  if(typeof SupabaseDB!=='undefined'&&!SupabaseDB.prototype.__v662Import){const orig=SupabaseDB.prototype.importPurchase;SupabaseDB.prototype.importPurchase=async function(doc,purchase,lines,file){const r=await orig.call(this,doc,purchase,lines,file);try{const audit=v662ParseAuditPayload();if(r?.document_id){const u=await this.sb.from('documents').update({file_sha256:audit.file_sha256,parser_version:'6.62',parse_audit:audit}).eq('id',r.document_id);if(u.error&&!/column|schema cache/i.test(String(u.error.message||'')))console.warn('Parse audit update failed',u.error);}}catch(e){console.warn('Parse audit metadata could not be stored.',e);}return r;};SupabaseDB.prototype.__v662Import=true;}
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
function v661FinalizeParsedInvoice(parsed={},raw=''){
  const sources=v661EvidenceSources(parsed.rawText||raw||''),evidence=sources.map(x=>x.text).join('\n');
  let doc=recoverAvMediaHeader({...parsed.doc},evidence);doc=v662RecoverMoneyFromText(doc,evidence);
  const savedLayout=state.pdfLayout;let moneyCandidates=[];
  for(const src of sources){state.pdfLayout=src.layout||[];let d=v661RepairInvoiceMoneyFromLayout({...doc});d=v662RecoverMoneyFromText(d,src.text||'');const a=Number(d.subtotal),b=Number(d.gst),c=Number(d.total_amount),ok=[a,b,c].every(Number.isFinite)&&Math.abs((a+b)-c)<=.06;moneyCandidates.push({d,ok,score:(Number.isFinite(a)?1:0)+(Number.isFinite(b)?1:0)+(Number.isFinite(c)?1:0)+(ok?8:0)});}
  state.pdfLayout=savedLayout;moneyCandidates.sort((a,b)=>b.score-a.score);if(moneyCandidates[0])doc=moneyCandidates[0].d;
  const candidates=[];const add=(arr,origin,srcText)=>{const xs=sanitizeParsedInventoryItems((arr||[]).map(normalizeParsedInvoiceItem),srcText||evidence).filter(x=>String(x.item_name||'').trim()&&Number(x.quantity)>0);if(xs.length)candidates.push({origin,items:xs,score:invoiceItemsQuality(xs,doc.subtotal)});};
  add(parsed.items||[],'base',parsed.rawText||raw);
  for(const src of sources){const old=state.pdfLayout;state.pdfLayout=src.layout||[];if(/\bAV\s+MEDIA\b/i.test(src.text)||/av\s+media/i.test(String(doc.supplier_name||''))){add(parseAvMediaMixedLayoutItems(),'av-layout:'+src.source,src.text);add(parseAvMediaTextItems(src.text),'av-text:'+src.source,src.text);}add(v661ParseGenericPricedRows(src.text),'generic-text:'+src.source,src.text);add(v662ParsePhysicalEvidenceRows(src.text),'physical-evidence:'+src.source,src.text);if(typeof parseFlexibleProductLayoutItems==='function')add(parseFlexibleProductLayoutItems(),'flex-layout:'+src.source,src.text);if(typeof parseProductCodeLayoutItems==='function')add(parseProductCodeLayoutItems(),'product-layout:'+src.source,src.text);state.pdfLayout=old;}
  candidates.sort((a,b)=>b.score-a.score);const extracted=candidates[0]?.items||[],withSerials=attachSerialBlocks(extracted,evidence),inventory=sanitizeParsedInventoryItems(inventoryOnlyItems(withSerials),evidence);
  const physicalSum=inventory.reduce((n,x)=>n+(Number(x.amount)||0),0);
  if(physicalSum>0&&!Number.isFinite(Number(doc.subtotal)))doc.subtotal=Math.round(physicalSum*100)/100;
  doc=v662RecoverMoneyFromText(doc,evidence);
  const classification=classifyInvoiceDocument(evidence,withSerials,inventory);
  return {...parsed,doc,items:inventory,excludedServiceCount:Math.max(0,withSerials.length-inventory.length),invoiceClassification:classification,serviceOnlyInvoice:classification.type==='service',dateReviewRequired:!doc.invoice_date,rawText:evidence,parseEvidence:{...(parsed.parseEvidence||{}),itemSource:candidates[0]?.origin||'none',candidateCounts:candidates.map(c=>({origin:c.origin,count:c.items.length,score:c.score})),file_sha256:state.importFileHash||'',file_kind:state.importFileKind||''}};
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
  if(note){note.classList.remove('hidden');if(detected==='service'||effective==='service'){setStyle('danger');note.innerHTML='<strong>Equipment invoices only.</strong> This document contains service / labour / installation charges only and cannot be added to inventory.';}else if(detected==='uncertain'&&!state.importClassificationChoice){setStyle('warn');note.innerHTML='<strong>Invoice type needs confirmation.</strong> The parser cannot prove whether this document contains physical equipment. Check the PDF and choose the correct type.<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" class="secondary small-btn" id="chooseEquipmentInvoiceBtn">Equipment invoice</button><button type="button" class="secondary small-btn" id="chooseServiceInvoiceBtn">Service invoice</button></div>';}else if(detected==='uncertain'&&effective==='equipment'){setStyle('info');note.innerHTML='<strong>Equipment invoice selected.</strong> The app will re-check the invoice fields and physical line items before saving. <button type="button" class="link-btn" id="changeInvoiceTypeBtn">Change</button>';}else{note.classList.add('hidden');note.innerHTML='';}}
  if(saveBtn){const blocked=effective!=='equipment';saveBtn.disabled=blocked||!!state.importSaving;saveBtn.title=effective==='service'?'Service-only invoices cannot be saved to inventory.':effective==='uncertain'?'Confirm the invoice type before saving.':'';saveBtn.setAttribute('aria-disabled',blocked?'true':'false');}
  const eq=$('chooseEquipmentInvoiceBtn'),svc=$('chooseServiceInvoiceBtn'),chg=$('changeInvoiceTypeBtn');
  if(eq)eq.onclick=async()=>{eq.disabled=true;await reprocessConfirmedEquipmentInvoice();};
  if(svc)svc.onclick=()=>{state.importClassificationChoice='service';renderImportEligibility();toast('Marked as service invoice. Saving to inventory is disabled.');};
  if(chg)chg.onclick=()=>{state.importClassificationChoice=null;renderImportEligibility();};
}

function v661LooksServiceOnlyDocument(text='',extractedItems=[],inventoryItems=[]){
  return classifyInvoiceDocument(text,extractedItems,inventoryItems).type==='service';
}

async function launch(){
  try{
    const r=await fetch(ORIGINAL_APP_URL,{cache:'no-store'});
    if(!r.ok)throw new Error('Unable to load verified V6.55 source ('+r.status+').');
    let src=await r.text();
    if(!src.includes("const APP_VERSION='6.55';"))throw new Error('Verified V6.55 source signature was not found.');

    src=replaceOnce(src,"// AV Inventory Hub V6.55 — evidence-only inventory parsing and verified invoice dates","// AV Inventory Hub V6.62 — calendar-safe invoice dates, resilient AV Media table recovery and evidence validation",'version header');
    src=replaceOnce(src,"const APP_VERSION='6.55';","const APP_VERSION='6.62';",'APP_VERSION');
        src=replaceOnce(src,"const RELEASE_CURRENT_NOTES=[","const RELEASE_CURRENT_NOTES=[\n  'Golden-corpus regression testing added for real invoice layouts',\n  'PDF, JPG/JPEG, PNG, WEBP and DOCX use one normalised import pipeline',\n  'Native text is preferred and OCR is used as fallback/recovery for scanned content',\n  'SHA-256 file hashing and parser audit metadata are supported',\n  'Optional server invoice processor hook is available through config.js',\n  'Header, totals, line items and invoice type are validated across independent scans',\n  'Extraction completes before Equipment/Service classification is evaluated',\n  'Clear equipment invoices are auto-classified from verified priced product rows',\n  'Clear service/labour invoices are blocked without unnecessary confirmation prompts',\n  'Equipment confirmation re-runs extraction and refreshes all review fields',\n  'AV Media Invoice No. and DATE use labelled header coordinates plus OCR fallback',\n  'AV Media PRODUCT NO. tables are parsed in either PDF coordinate direction',\n  'Missing SKU/model uses the verified equipment name instead of AUTO-*',\n  'Serial numbers and warranty text never contaminate SKU/item identifiers',\n  'Subtotal, GST and Amount Due are recovered from labelled total rows and arithmetic checked',\n  'Recovery OCR runs automatically when key header fields or physical line items are missing',",'release notes');

    src=replaceSection(src,"function detectInvoiceDate(text,invoice=''){","\nfunction first(",asPatchedFunction(v661DetectInvoiceDate,'detectInvoiceDate')+'\n','detectInvoiceDate');
    src=replaceSection(src,"function parseDate(v=''){","\nfunction invoiceSignals",asPatchedFunction(v661ParseDate,'parseDate')+'\n','calendar-safe parseDate');
    src=replaceSection(src,'function detectInvoiceDateFromLayout(){','\nfunction layoutMoneyForLabel',asPatchedFunction(v661DetectInvoiceDateFromLayout,'detectInvoiceDateFromLayout')+'\n','coordinate invoice-date parser');
    src=replaceSection(src,'function isNonInventoryServiceLine(x={}){','\nfunction inventoryOnlyItems',asPatchedFunction(v661IsNonInventoryServiceLine,'isNonInventoryServiceLine')+'\n','service-line classifier');
    src=replaceOnce(src,"  return {...x,sku:x.sku||skuFromDescription(description),item_name:standardItemNameFromDescription(description),description};","  return {...x,sku:String(x.sku||'').trim(),item_name:standardItemNameFromDescription(description),description};",'do not infer SKU from description');
    src=replaceOnce(src,"        current.sku=current.sku||skuFromDescription(current.description);","        current.sku=String(current.sku||'').trim();",'remove continuation SKU guessing');
    src=replaceOnce(src,"    item.serialReviewRequired=!!item.serialReviewRequired||block.uncertain||!observed.length;","    item.serialReviewRequired=!!item.serialReviewRequired||block.uncertain;",'optional serial numbers stay optional');
    src=replaceOnce(src,'function parseGenericInvoiceItems(text){',asPatchedFunction(v661ParseProductCodeLayoutItems,'parseProductCodeLayoutItems')+'\nfunction parseGenericInvoiceItems(text){','product-code layout parser insertion');
    src=replaceOnce(src,'function parseGenericInvoiceItems(text){',asPatchedFunction(v661FlexibleProductLayoutItems,'parseFlexibleProductLayoutItems')+'\nfunction parseGenericInvoiceItems(text){','flexible product table parser insertion');
    src=replaceOnce(src,'function parseGenericInvoiceItems(text){',asPatchedFunction(v661ParseAvMediaMixedLayoutItems,'parseAvMediaMixedLayoutItems')+'\n'+asPatchedFunction(v661ParseAvMediaTextItems,'parseAvMediaTextItems')+'\nfunction parseGenericInvoiceItems(text){','AV Media layout + text table parser insertion');
    src=replaceOnce(src,"  const layout=(state.pdfLayout?.length?parseLayoutInvoiceItems():[]).map(normalizeParsedInvoiceItem);\n  let items=[supplierSpecific,generic,numbered,layout].sort((a,b)=>invoiceItemsQuality(b,subtotal)-invoiceItemsQuality(a,subtotal))[0]||[];","  const layout=(state.pdfLayout?.length?parseLayoutInvoiceItems():[]).map(normalizeParsedInvoiceItem);\n  const productLayout=(state.pdfLayout?.length?parseProductCodeLayoutItems():[]).map(normalizeParsedInvoiceItem);\n  const flexibleLayout=(state.pdfLayout?.length?parseFlexibleProductLayoutItems():[]).map(normalizeParsedInvoiceItem);\n  const avMediaLayout=(state.pdfLayout?.length&&/AV\\s+MEDIA/i.test(flat)?parseAvMediaMixedLayoutItems():[]).map(normalizeParsedInvoiceItem);\n  const avMediaText=(/AV\\s+MEDIA/i.test(flat)?parseAvMediaTextItems(flat):[]).map(normalizeParsedInvoiceItem);\n  let items=[supplierSpecific,generic,numbered,layout,productLayout,flexibleLayout,avMediaLayout,avMediaText].sort((a,b)=>invoiceItemsQuality(b,subtotal)-invoiceItemsQuality(a,subtotal))[0]||[];",'parser candidate list');
    src=replaceOnce(src,"  if(/^(sold\\s*to|bill\\s*to|ship\\s*to|invoice|inv|invoice\\s*(no|number)|date)$/i.test(invoice))invoice='';","  if(/^(sold\\s*to|bill\\s*to|ship\\s*to|invoice|inv|invoice\\s*(no|number)|date|customer|customer\\s*code|reference|ref|terms)$/i.test(invoice))invoice='';",'invoice-header contamination guard');

    src=replaceOnce(src,"  const chosen=itemChoice?.r||best;state.pdfLayout=chosen.layout||best.layout||originalLayout;","  const chosen=itemChoice?.r||best;state.pdfLayout=chosen.layout||best.layout||originalLayout;if(!confirmedDate){const strongLayoutDate=detectInvoiceDateFromLayout();if(strongLayoutDate){confirmedDate=strongLayoutDate;doc.invoice_date=strongLayoutDate;}}recoverAvMediaHeader(doc,chosen.text);v661RepairInvoiceMoneyFromLayout(doc);if(doc.invoice_date)confirmedDate=doc.invoice_date;",'strong AV Media header/date/money repair');
    src=replaceOnce(src,"  const items=inventoryOnlyItems(extractedItems);","  const items=sanitizeParsedInventoryItems(inventoryOnlyItems(extractedItems),itemChoice?.r?.text||best.text);",'evidence-only SKU sanitization');
    src=replaceOnce(src,"  return {...best.parsed,doc,items,excludedServiceCount:Math.max(0,extractedItems.length-items.length),dateReviewRequired:!confirmedDate,rawText:chosen.text,ocrSelection:{source:chosen.source,score:chosen.score,candidates:results.map(r=>({source:r.source,score:r.score,items:validParsedItems(r.parsed.items).length}))}};","  const invoiceClassification=classifyInvoiceDocument(chosen.text,extractedItems,items);\n  const serviceOnlyInvoice=invoiceClassification.type==='service';\n  return {...best.parsed,doc,items,excludedServiceCount:Math.max(0,extractedItems.length-items.length),invoiceClassification,serviceOnlyInvoice,dateReviewRequired:!confirmedDate,rawText:chosen.text,ocrSelection:{source:chosen.source,score:chosen.score,candidates:results.map(r=>({source:r.source,score:r.score,items:validParsedItems(r.parsed.items).length}))}};",'evidence-based invoice classification');

    src=replaceOnce(src,'function cleanupPdfPreview(){',asPatchedFunction(v661CleanVerifiedSku,'cleanVerifiedSku')+'\n'+asPatchedFunction(v661CleanInventoryDescription,'cleanInventoryDescription')+'\n'+asPatchedFunction(v661ParseGenericPricedRows,'v661ParseGenericPricedRows')+'\n'+asPatchedFunction(v662MoneyNumber,'v662MoneyNumber')+'\n'+asPatchedFunction(v662RecoverMoneyFromText,'v662RecoverMoneyFromText')+'\n'+asPatchedFunction(v662FileSha256,'v662FileSha256')+'\n'+asPatchedFunction(v662FileKind,'v662FileKind')+'\n'+asPatchedFunction(v662EnsureJSZip,'v662EnsureJSZip')+'\n'+asPatchedFunction(v662OcrBlob,'v662OcrBlob')+'\n'+asPatchedFunction(v662ExtractDocx,'v662ExtractDocx')+'\n'+asPatchedFunction(v662TryServerInvoiceProcessing,'v662TryServerInvoiceProcessing')+'\n'+asPatchedFunction(v662ExtractInvoiceFile,'extractInvoiceFile')+'\n'+asPatchedFunction(v662ParsePhysicalEvidenceRows,'v662ParsePhysicalEvidenceRows')+'\n'+asPatchedFunction(v662ParseAuditPayload,'v662ParseAuditPayload')+'\n'+asPatchedFunction(v662InstallAuditWrappers,'installParseAuditWrappers')+'\n'+asPatchedFunction(v662ConfigureInvoiceFileInputs,'configureInvoiceFileInputs')+'\n'+asPatchedFunction(v661EvidenceSources,'v661EvidenceSources')+'\n'+asPatchedFunction(v661SanitizeParsedInventoryItems,'sanitizeParsedInventoryItems')+'\n'+asPatchedFunction(v661PrepareInventoryLinesForSave,'prepareInventoryLinesForSave')+'\n'+asPatchedFunction(v661RecoverAvMediaHeader,'recoverAvMediaHeader')+'\n'+asPatchedFunction(v661ClassifyInvoiceDocument,'classifyInvoiceDocument')+'\n'+asPatchedFunction(v661EffectiveInvoiceType,'effectiveInvoiceType')+'\n'+asPatchedFunction(v661ApplyParsedReviewToForm,'applyParsedReviewToForm')+'\n'+asPatchedFunction(v661RefreshDuplicateWarning,'refreshDuplicateWarning')+'\n'+asPatchedFunction(v661FinalizeParsedInvoice,'v661FinalizeParsedInvoice')+'\n'+asPatchedFunction(v661ReprocessConfirmedEquipmentInvoice,'reprocessConfirmedEquipmentInvoice')+'\n'+asPatchedFunction(v661RenderImportEligibility,'renderImportEligibility')+'\n'+asPatchedFunction(v661LooksServiceOnlyDocument,'looksServiceOnlyDocument')+'\n'+asPatchedFunction(v661LayoutMoney,'v661LayoutMoney')+'\n'+asPatchedFunction(v661RepairInvoiceMoneyFromLayout,'v661RepairInvoiceMoneyFromLayout')+'\n'+asPatchedFunction(v661NeedsDeepRecovery,'needsDeepRecovery')+'\n'+asPatchedFunction(v661EnsureTesseract,'v661EnsureTesseract')+'\n'+asPatchedFunction(v661ForceOcrRecovery,'forceOcrRecovery')+'\nfunction cleanupPdfPreview(){','import classification, verified SKU, AV Media recovery and OCR helpers');

    src=replaceOnce(src,"async function startImport(file){if(!file)return;if(!requireEdit())return;cleanupPdfPreview();","async function startImport(file){if(!file)return;if(!requireEdit())return;cleanupPdfPreview();state.importClassificationChoice=null;",'reset invoice-type choice');

    src=replaceOnce(src,"const text=await extractPdf(file);const parsedBest=parseBestInvoice(text);state.parsed={...parsedBest,raw:parsedBest.rawText||text};","let text=await extractInvoiceFile(file);let parsedBest=v661FinalizeParsedInvoice(parseBestInvoice(text),text);if(needsDeepRecovery(parsedBest)){try{const recovered=await forceOcrRecovery(file);if(recovered)parsedBest=v661FinalizeParsedInvoice(parseBestInvoice(text),text);}catch(recoveryError){console.warn('Recovery OCR could not complete; keeping best verified parse.',recoveryError);}}state.parsed={...parsedBest,raw:parsedBest.rawText||text};",'automatic recovery OCR');

    src=replaceOnce(src,"console.info('Invoice OCR selection',state.parsed.ocrSelection||{source:'text-pdf'});renderParsedItems();const dupe=", "console.info('Invoice OCR selection',state.parsed.ocrSelection||{source:'text-pdf'});state.parsed.items=sanitizeParsedInventoryItems(state.parsed.items||[],state.parsed.raw||text);renderParsedItems();renderImportEligibility();if(state.parsed.invoiceClassification?.type==='service')toast('Equipment invoices only. This service-work invoice cannot be saved.');else if(state.parsed.invoiceClassification?.type==='uncertain')toast('Invoice type is uncertain. Confirm Equipment or Service before saving.');const dupe=",'eligibility rendering');
    src=replaceOnce(src,",d,state.parsed.items,namedFile);state.lastImportCount=state.parsed.items.length;",",d,prepareInventoryLinesForSave(state.parsed.items),namedFile);state.lastImportCount=state.parsed.items.length;",'deterministic SKU fallback');
    src=replaceOnce(src,"finally{state.importSaving=false;const saveBtn=$('saveImportBtn');if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Confirm & save';}if($('importProgress'))$('importProgress').classList.add('hidden');}","finally{state.importSaving=false;const saveBtn=$('saveImportBtn');if(saveBtn){saveBtn.textContent='Confirm & save';}renderImportEligibility();if($('importProgress'))$('importProgress').classList.add('hidden');}",'save-button final state');

    const gate="\n// V6.62 evidence-based equipment-only save gate.\n$('saveImportBtn').addEventListener('click',e=>{\n  if(!state.parsed)return;\n  const detected=state.parsed.invoiceClassification?.type||'uncertain';\n  const effective=detected==='uncertain'?(state.importClassificationChoice||'uncertain'):detected;\n  if(effective==='equipment')return;\n  e.preventDefault();e.stopImmediatePropagation();\n  renderImportEligibility();\n  toast(effective==='service'?'Equipment invoices only. Service-work invoices cannot be saved.':'Confirm whether this is an Equipment invoice or Service invoice before saving.');\n},true);\n\n";
    src=replaceOnce(src,'// Final evidence gate runs before the existing save handler.',gate+'// Final evidence gate runs before the existing save handler.','invoice classification save gate');

    src+='\ntry{installParseAuditWrappers();configureInvoiceFileInputs();}catch(e){console.warn(\'V6.62 optional audit/file-input setup skipped\',e);}\n';
    const blob=new Blob([src],{type:'text/javascript'}),url=URL.createObjectURL(blob);
    try{await import(url);}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(err){
    console.error('AV Inventory Hub V6.62 startup error:',err);
    const box=document.createElement('div');
    box.style.cssText='position:fixed;inset:20px;z-index:99999;background:#fff;border:1px solid #d33;border-radius:12px;padding:20px;font:14px/1.5 Arial;color:#222;box-shadow:0 10px 30px #0002';
    box.innerHTML='<b>AV Inventory Hub V6.62 could not start.</b><br>The verified V6.55 base was left untouched in Git history.<br><br><code>'+String(err.message||err).replace(/[&<>]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[s]))+'</code>';
    document.body.appendChild(box);
  }
}

await launch();
