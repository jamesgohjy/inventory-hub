// AV Inventory Hub V6.60 — calendar-safe invoice dates, resilient AV Media table recovery and evidence validation
// This patch loader applies V6.60 safely on top of the verified V6.55 source.
const ORIGINAL_APP_URL='https://raw.githubusercontent.com/jamesgohjy/inventory-hub/d45233b134921b3085a1318b10443d488fd832a0/app.js';

function replaceOnce(src,needle,replacement,label=needle){
  const i=src.indexOf(needle);
  if(i<0)throw new Error('V6.60 patch marker not found: '+label);
  return src.slice(0,i)+replacement+src.slice(i+needle.length);
}
function replaceSection(src,startMarker,endMarker,replacement,label=startMarker){
  const s=src.indexOf(startMarker),e=src.indexOf(endMarker,s+startMarker.length);
  if(s<0||e<0)throw new Error('V6.60 patch section not found: '+label);
  return src.slice(0,s)+replacement+src.slice(e);
}
function asPatchedFunction(fn,newName){
  return fn.toString().replace(/^function\s+[^\s(]+/,`function ${newName}`);
}

function v660DetectInvoiceDate(text,invoice=''){
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
  // V6.60: many AV Media invoices use a compact header labelled only "DATE".
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

function v660ParseDate(v=''){
  const s=normalizePdfText(v).trim().replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi,'$1').replace(/\s*([/.\-])\s*/g,'$1');
  const valid=(y,m,d)=>{y=Number(y);m=Number(m);d=Number(d);if(y<100)y+=2000;if(y<1900||y>2200||m<1||m>12||d<1||d>31)return'';const md=[31,((y%4===0&&y%100!==0)||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];if(d>md[m-1])return'';return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;};
  let m=s.match(/\b(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})\b/);if(m){const d=valid(m[1],m[2],m[3]);if(d)return d;}
  m=s.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/);if(m){const d=valid(m[3],m[2],m[1]);if(d)return d;}
  const months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
  m=s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/);if(m&&months[m[2].toLowerCase()]){const d=valid(m[3],months[m[2].toLowerCase()],m[1]);if(d)return d;}
  m=s.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})\b/);if(m&&months[m[1].toLowerCase()]){const d=valid(m[3],months[m[1].toLowerCase()],m[2]);if(d)return d;}
  return '';
}

function v660DetectInvoiceDateFromLayout(){
  const pages=state.pdfLayout||[];
  const parseCandidate=(v)=>{const c=dateCandidateFromText(String(v||''));return c?parseDate(c):'';};
  const headerContext=/\b(?:ref\.?\s*(?:no\.?|number)?|invoice\s*(?:no\.?|number|#)|p\/?o\s*(?:no\.?|number)?|salesman|terms|customer\s*code)\b/i;
  for(const pg of pages){
    const rows=(pg.rows||[]).filter(r=>Array.isArray(r.items));
    for(const row of rows){
      const dateLabels=(row.items||[]).filter(it=>/^\s*(?:invoice\s*)?date\.?\s*$/i.test(String(it.text||'')));
      const rowHasLabel=/\b(?:invoice\s+date|\bdate\b)\b/i.test(row.text||'');
      if(!dateLabels.length&&!rowHasLabel)continue;
      const neighborhood=rows.filter(r=>Math.abs((Number(r.y)||0)-(Number(row.y)||0))<=34).map(r=>r.text||'').join(' ');
      const explicitInvoice=/\binvoice\s+date\b/i.test(row.text||'');
      if(!explicitInvoice&&!headerContext.test(neighborhood))continue;
      const direct=parseCandidate(row.text||'');if(direct)return direct;
      const labels=dateLabels.length?dateLabels:[{x:Math.min(...(row.items||[]).map(i=>Number(i.x)).filter(Number.isFinite),0)}];
      const candidates=[];
      for(const label of labels){
        for(const r of rows){
          const dy=Math.abs((Number(r.y)||0)-(Number(row.y)||0));if(dy>55)continue;
          for(const it of r.items||[]){
            const d=parseCandidate(it.text);if(!d)continue;
            const dx=Math.abs((Number(it.x)||0)-(Number(label.x)||0));
            // DATE values in AV Media headers can be on the same row or immediately below the label.
            if(dx<=125)candidates.push({d,score:dx+dy*.7,dx,dy});
          }
          const d=parseCandidate(r.text||'');if(d){
            const xs=(r.items||[]).filter(it=>parseCandidate(it.text)).map(it=>Number(it.x)||0);
            const dx=xs.length?Math.min(...xs.map(x=>Math.abs(x-(Number(label.x)||0)))):70;
            if(dx<=125)candidates.push({d,score:dx+dy*.7,dx,dy});
          }
        }
      }
      candidates.sort((a,b)=>a.score-b.score);
      if(candidates.length)return candidates[0].d;
    }
  }
  // Text-layout fallback: DATE is accepted only inside a recognisable invoice-header block.
  for(const pg of pages){
    const lines=(pg.rows||[]).map(r=>String(r.text||'').trim()).filter(Boolean);
    for(let i=0;i<lines.length;i++){
      if(!/\bDATE\b/i.test(lines[i]))continue;
      const ctx=lines.slice(Math.max(0,i-2),Math.min(lines.length,i+4)).join(' ');
      if(!headerContext.test(ctx))continue;
      for(const piece of [lines[i],...lines.slice(i+1,i+4)]){const d=parseCandidate(piece);if(d)return d;}
    }
  }
  return '';
}

function v660FlexibleProductLayoutItems(){
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

function v660LayoutMoney(labelRe,{exclude=null}={}){
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
function v660RepairInvoiceMoneyFromLayout(doc={}){
  const s=v660LayoutMoney(/\b(?:Sub\s*Total|Subtotal)\b/i),g=v660LayoutMoney(/\b(?:Add\s+)?GST(?:\s*@?\s*\d+(?:\.\d+)?\s*%|\s*\d+\s*%)?\b/i,{exclude:/GST\s+Reg(?:istration)?\s*(?:No|Number)?/i}),t=v660LayoutMoney(/\b(?:Amount\s+Due|Grand\s*Total|Invoice\s*Total|Total\s*Amount)\b/i,{exclude:/Sub\s*Total|Subtotal/i});
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

function v660NeedsDeepRecovery(parsed={}){
  if(parsed?.invoiceClassification?.type==='service')return false;
  const d=parsed.doc||{},items=validParsedItems(parsed.items||[]),isAv=/av\s+media/i.test(String(d.supplier_name||''))||/\bAV\s+MEDIA\b/i.test(String(parsed.rawText||parsed.raw||''));
  if(!d.invoice_number||!d.invoice_date||!items.length)return true;
  if(isAv&&(!Number.isFinite(Number(d.subtotal))||!Number.isFinite(Number(d.gst))||!Number.isFinite(Number(d.total_amount))))return true;
  const a=Number(d.subtotal),b=Number(d.gst),c=Number(d.total_amount);if([a,b,c].every(Number.isFinite)&&Math.abs((a+b)-c)>.05)return true;
  return false;
}

async function v660EnsureTesseract(){
  if(window.Tesseract)return window.Tesseract;
  await new Promise((resolve,reject)=>{const existing=document.querySelector('script[data-v660-tesseract]');if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';sc.async=true;sc.dataset.v660Tesseract='1';sc.onload=resolve;sc.onerror=()=>reject(new Error('Recovery OCR library could not be loaded.'));document.head.appendChild(sc);});
  if(!window.Tesseract)throw new Error('Recovery OCR library did not initialise.');return window.Tesseract;
}
async function v660ForceOcrRecovery(file){
  const T=await v660EnsureTesseract();
  setProgress(40,'Invoice fields need a deeper scan — running recovery OCR…');
  const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
  const data=new Uint8Array(await file.arrayBuffer()),pdf=await pdfjs.getDocument({data}).promise;
  const modes=[{key:'recovery-auto',label:'AUTO',psm:T.PSM?.AUTO??'3',texts:[],layouts:[]},{key:'recovery-column',label:'SINGLE_COLUMN',psm:T.PSM?.SINGLE_COLUMN??'4',texts:[],layouts:[]},{key:'recovery-sparse',label:'SPARSE_TEXT',psm:T.PSM?.SPARSE_TEXT??'11',texts:[],layouts:[]}];
  const worker=await T.createWorker('eng');
  try{for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),vp=p.getViewport({scale:3.0}),c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);await p.render({canvasContext:c.getContext('2d',{willReadFrequently:true}),viewport:vp}).promise;for(let mi=0;mi<modes.length;mi++){const m=modes[mi],pct=42+Math.round(45*((i-1)*modes.length+mi+1)/(pdf.numPages*modes.length));setProgress(pct,`Recovery OCR ${m.label}… page ${i} of ${pdf.numPages}`);await worker.setParameters({tessedit_pageseg_mode:m.psm,preserve_interword_spaces:'1',user_defined_dpi:'220'});const r=await worker.recognize(c,{}, {text:true,tsv:true,hocr:true,blocks:true});const layout=ocrResultToLayout(r.data||{},i,c.height);m.layouts.push(layout);m.texts.push(String(r.data?.text||'').trim()||layout.rows?.map(x=>x.text).join('\n').trim());}}}finally{await worker.terminate();}
  const recovered=modes.map(m=>{const text=m.texts.join('\n').trim();return{source:m.key,label:m.label,text,layout:m.layouts,score:ocrTextQuality(text)+m.layouts.reduce((n,l)=>n+layoutInvoiceQuality(l),0)};}).filter(x=>x.text);
  state.ocrCandidates=[...(state.ocrCandidates||[]),...recovered].sort((a,b)=>b.score-a.score);return recovered.length>0;
}

function v660IsNonInventoryServiceLine(x={}){
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

function v660ParseProductCodeLayoutItems(){
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

function v660CleanVerifiedSku(value='',sourceText=''){
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

function v660CleanInventoryDescription(value=''){
  return cleanInvoiceDescription(value)
    .replace(/\bShipment\s+No\.?\s*[:#.-]?\s*[A-Z0-9._\/-]+\s*[:;,-]?/gi,' ')
    .replace(/\s*\bS\s*[/\\.-]?\s*N\s*[:#.-]?\s*[A-Z0-9,._\/-\s]+$/i,'')
    .replace(/\s+/g,' ').trim();
}

function v660ParseAvMediaMixedLayoutItems(){
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

function v660ParseAvMediaTextItems(text=''){
  const lines=normalizePdfText(text).split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const header=lines.findIndex(l=>/\bPRODUCT\s*NO\.?\b/i.test(l)&&/\bDESCRIPTION\b/i.test(l)&&/(?:\bQUANTITY\b|\bQTY\b)/i.test(l)&&/\bPRICE\b/i.test(l)&&/\bAMOUNT\b/i.test(l));
  if(header<0)return [];
  const body=[];for(let i=header+1;i<lines.length;i++){if(/\b(?:SUB\s*TOTAL|SUBTOTAL|GST\s*\d*\s*%|AMOUNT\s+DUE|GRAND\s+TOTAL)\b/i.test(lines[i]))break;body.push(lines[i]);}
  const isCode=l=>{const x=String(l||'').trim();return /^[A-Z0-9][A-Z0-9+._\/-]{2,}(?:\s+[A-Z0-9]{1,4})?$/i.test(x)&&/\d/.test(x)&&!/^\d+(?:[.,]\d+)?$/.test(x);};
  const num=v=>{const z=String(v||'').replace(/,/g,'');const n=Number(z);return Number.isFinite(n)?n:null;};
  const moneyRe=/\b\d{1,3}(?:,\d{3})*\.\d{2}\b|\b\d+\.\d{2}\b/g;
  const out=[];let cur=null;
  const finish=()=>{if(!cur)return;const textAll=cur.parts.join(' ').replace(/\s+/g,' ').trim();const nums=cur.nums;let qty=null,price=null,amount=null;if(nums.length>=3){qty=num(nums[nums.length-3]);price=num(nums[nums.length-2]);amount=num(nums[nums.length-1]);}else if(nums.length>=2){price=num(nums[nums.length-2]);amount=num(nums[nums.length-1]);if(price>0&&amount>=0){const q=Math.round(amount/price);if(q>=1&&q<=999&&Math.abs(amount/price-q)<.02)qty=q;}}if(!(qty>0)||price===null||amount===null||!textAll){cur=null;return;}const warrantyOnly=/\b(?:WARRANTY|WT\s+FOR)\b/i.test(cur.code+' '+textAll);if(warrantyOnly){cur=null;return;}const description=cleanInventoryDescription(textAll);out.push(normalizeParsedInvoiceItem({sku:cleanVerifiedSku(cur.code,text),item_name:description,description,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty:'',serials:''}));cur=null;};
  for(const line of body){
    // Full row preserved on one text line.
    const one=line.match(/^([A-Z0-9][A-Z0-9+._\/-]{2,}(?:\s+[A-Z0-9]{1,4})?)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s+(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})$/i);
    if(one){finish();const description=cleanInventoryDescription(one[2]);out.push(normalizeParsedInvoiceItem({sku:cleanVerifiedSku(one[1],text),item_name:description,description,category:'',unit:'pcs',quantity:Number(one[3]),unit_price:num(one[4]),amount:num(one[5]),warranty:'',serials:''}));continue;}
    if(isCode(line)){finish();cur={code:line,parts:[],nums:[]};continue;}
    if(!cur)continue;
    const ms=line.match(moneyRe)||[];const pureQty=/^\d+(?:\.\d+)?$/.test(line);
    if(ms.length)cur.nums.push(...ms);else if(pureQty)cur.nums.push(line);else cur.parts.push(line);
  }
  finish();return out;
}

function v660SanitizeParsedInventoryItems(items=[],sourceText=''){
  return (items||[]).map(line=>{
    const description=cleanInventoryDescription(line.description||line.item_name||'');
    const itemName=standardItemNameFromDescription(description);
    const printedSku=cleanVerifiedSku(line.sku||'',sourceText);
    return {...line,sku:printedSku||itemName,description,item_name:itemName};
  });
}

function v660PrepareInventoryLinesForSave(items=[]){
  const source=state.parsed?.raw||state.parsed?.rawText||'';
  return sanitizeParsedInventoryItems(items,source).map(line=>{
    const itemName=String(line.item_name||line.description||'').replace(/\s+/g,' ').trim();
    const printedSku=cleanVerifiedSku(line.sku||'',source);
    // User rule: when no printed SKU/model exists, use the verified equipment name; never AUTO-*.
    return {...line,sku:printedSku||itemName};
  });
}

function v660RecoverAvMediaHeader(doc={},rawText=''){
  const pages=state.pdfLayout||[],rows=pages.flatMap(pg=>(pg.rows||[]).map(r=>({...r,page:pg.page||1})));
  const text=normalizePdfText(rawText||rows.map(r=>r.text||'').join('\n')),allText=rows.map(r=>r.text||'').join('\n')+'\n'+text;
  if(!/\bAV\s+MEDIA\b/i.test(allText)&&!/av\s+media/i.test(String(doc.supplier_name||'')))return doc;
  doc.supplier_name='AV Media Pte Ltd';
  const invoiceRes=[/\b((?:VIN|V)\s*\d{2}\s*[-–]\s*\d{4,})\b/i,/\b([A-Z]{2,5}\d{1,4}[-/]\d{4,})\b/i];
  let invoice='';
  for(const re of invoiceRes){const labelled=text.match(new RegExp('invoice\\s*no\\.?\\s*[:#.-]?\\s*'+re.source,'i'));if(labelled){invoice=labelled[1];break;}}
  if(!invoice){
    for(const r of rows){if(!/invoice\s*no\.?/i.test(r.text||''))continue;const sorted=[...(r.items||[])].sort((a,b)=>(Number(a.x)||0)-(Number(b.x)||0));const label=sorted.find(it=>/invoice\s*no\.?/i.test(String(it.text||'')));const lx=Number(label?.x)||Math.min(...sorted.map(i=>Number(i.x)).filter(Number.isFinite),0);for(const it of sorted){if((Number(it.x)||0)<=lx)continue;const v=String(it.text||'').trim();for(const re of invoiceRes){const m=v.match(re);if(m){invoice=m[1];break;}}if(invoice)break;}if(invoice)break;}
  }
  if(!invoice){for(const re of invoiceRes){const m=allText.match(re);if(m){invoice=m[1];break;}}}
  if(invoice)doc.invoice_number=invoice.replace(/\s+/g,'').replace(/–/g,'-');
  else if(!invoiceRes.some(re=>re.test(String(doc.invoice_number||''))))doc.invoice_number='';
  const headerDate=detectInvoiceDateFromLayout();if(headerDate)doc.invoice_date=headerDate;
  if(!doc.invoice_date){
    const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
    for(let i=0;i<lines.length;i++){
      if(!/\bDATE\b/i.test(lines[i]))continue;const ctx=lines.slice(Math.max(0,i-2),Math.min(lines.length,i+4)).join(' ');if(!/\b(?:REF\.?\s*NO|P\/?O\s*NO|SALESMAN|TERMS|INVOICE\s*NO)\b/i.test(ctx))continue;
      for(const p of [lines[i],...lines.slice(i+1,i+4)]){const c=dateCandidateFromText(p);if(c){const d=parseDate(c);if(d){doc.invoice_date=d;break;}}}if(doc.invoice_date)break;
    }
  }
  if(/^(?:sold|sold\s*to|delivered|delivered\s*to|customer|customer\s*code|reference|ref|date|invoice)$/i.test(String(doc.delivery_order_number||'').trim()))doc.delivery_order_number='';
  if(/^(?:sold|sold\s*to|delivered|delivered\s*to|customer|customer\s*code|date|invoice|terms)$/i.test(String(doc.reference_number||'').trim()))doc.reference_number='';
  return doc;
}

function v660ClassifyInvoiceDocument(text='',extractedItems=[],inventoryItems=[]){
  const t=normalizePdfText(text).replace(/\s+/g,' ').trim();
  const physical=(inventoryItems||[]).filter(x=>!isNonInventoryServiceLine(x));
  const serviceLines=(extractedItems||[]).filter(isNonInventoryServiceLine);
  if(physical.length)return{type:'equipment',reason:'Verified physical equipment line items were extracted; separate service rows are excluded.'};
  if((extractedItems||[]).length&&serviceLines.length===(extractedItems||[]).length)return{type:'service',reason:'All verified charge rows are service/labour/installation work.'};
  // Before asking the user, make one more evidence-only table scan.
  const textRows=/\bAV\s+MEDIA\b/i.test(t)?parseAvMediaTextItems(text):[];
  const textPhysical=textRows.filter(x=>!isNonInventoryServiceLine(x));
  if(textPhysical.length)return{type:'equipment',reason:'The product table contains priced physical-equipment rows.'};
  if(textRows.length&&textRows.every(isNonInventoryServiceLine))return{type:'service',reason:'The product table contains only priced service-work rows.'};
  const table=/\bPRODUCT\s*NO\.?\b/i.test(t)&&/\bDESCRIPTION\b/i.test(t)&&/(?:\bQUANTITY\b|\bQTY\b)/i.test(t)&&/\b(?:UNIT\s*PRICE|PRICE)\b/i.test(t)&&/\bAMOUNT\b/i.test(t);
  const physicalRow=/\b(?:projector|microphone|speaker|control\s+panel|camera|mixer|display|monitor|trolley|transmitter|receiver|screen|wireless\s+system|audio\s+tester)\b[\s\S]{0,160}\b\d+(?:\.\d+)?\b[\s\S]{0,40}\b(?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2}\b/i.test(t);
  if(table&&physicalRow)return{type:'equipment',reason:'A priced physical-equipment row is visible in the invoice product table.'};
  const strongService=/\b(?:supply\s+)?labou?r\s+(?:to|for|and|&)\b/i.test(t)||/\b(?:dismount(?:ing)?|dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al))\b[\s\S]{0,220}\b(?:install(?:ation|ing)?|testing|commission(?:ing)?)\b/i.test(t)||/\b(?:service|installation|labou?r)\s+(?:work|works|job|charge|charges|services?)\b/i.test(t);
  if(strongService&&!physicalRow)return{type:'service',reason:'Explicit service/labour work was found and no priced physical equipment row was verified.'};
  return{type:'uncertain',reason:'After header, table and line-item checks, the document type still cannot be proven.'};
}
function v660EffectiveInvoiceType(){
  const detected=state.parsed?.invoiceClassification?.type||'uncertain';
  return detected==='uncertain'?(state.importClassificationChoice||'uncertain'):detected;
}
function v660ApplyParsedReviewToForm(){
  const d=state.parsed?.doc||{};
  if($('pSupplier'))$('pSupplier').value=d.supplier_name||'';if($('pInvoice'))$('pInvoice').value=d.invoice_number||'';if($('pDate'))$('pDate').value=d.invoice_date||'';
  ['pSupplier','pInvoice','pDate'].forEach(id=>$(id)?.classList.toggle('low-confidence',!$(id)?.value));
  if($('invoiceDateStatus')){const x=$('invoiceDateStatus');x.textContent=d.invoice_date?'Auto-detected from invoice: '+fmtDate(d.invoice_date)+' — verify against the PDF before saving.':'Invoice date was not confidently detected — please enter it manually.';x.className='date-status '+(d.invoice_date?'detected':'review');}
  if($('pDo'))$('pDo').value=d.delivery_order_number||'';if($('pRef'))$('pRef').value=d.reference_number||'';if($('pCurrency'))$('pCurrency').value=d.currency||'SGD';
  if($('pSubtotal'))$('pSubtotal').value=d.subtotal??'';if($('pGst'))$('pGst').value=d.gst??'';if($('pTotal'))$('pTotal').value=d.total_amount??'';
  if($('rawText'))$('rawText').textContent=state.parsed?.raw||state.parsed?.rawText||'';
  renderParsedItems();
}
async function v660RefreshDuplicateWarning(){
  const d=state.parsed?.doc||{};if(!$('duplicateWarning'))return;
  const dupe=d.supplier_name&&d.invoice_number?await state.db.duplicateInvoice(d.supplier_name,d.invoice_number,d.invoice_date):null;state.possibleDuplicate=dupe;state.allowDuplicate=false;
  $('duplicateWarning').classList.toggle('hidden',!dupe);$('duplicateWarning').innerHTML=dupe?`<strong>This invoice may already exist.</strong> Supplier, Invoice Number and Invoice Date match an existing purchase. <button type="button" id="viewDuplicateBtn">View existing</button> <button type="button" id="continueDuplicateBtn">Continue anyway</button>`:'';
  if(dupe){setTimeout(()=>{const v=$('viewDuplicateBtn'),c=$('continueDuplicateBtn');if(v)v.onclick=()=>showView('documents');if(c)c.onclick=()=>{state.allowDuplicate=true;$('duplicateWarning').innerHTML='<strong>Duplicate override enabled.</strong> Confirm & save will continue.';}},0);}
}
function v660FinalizeParsedInvoice(parsed={},raw=''){
  const source=String(parsed.rawText||raw||'');
  let doc=recoverAvMediaHeader({...parsed.doc},source);doc=v660RepairInvoiceMoneyFromLayout(doc);
  const av=/\bAV\s+MEDIA\b/i.test(source)||/av\s+media/i.test(String(doc.supplier_name||''));
  const candidates=[];
  const add=(arr,origin)=>{const xs=sanitizeParsedInventoryItems((arr||[]).map(normalizeParsedInvoiceItem),source);if(xs.length)candidates.push({origin,items:xs,score:invoiceItemsQuality(xs,doc.subtotal)});};
  add(parsed.items||[],'base');if(av){add(parseAvMediaMixedLayoutItems(),'av-layout');add(parseAvMediaTextItems(source),'av-text');}
  candidates.sort((a,b)=>b.score-a.score);const extracted=candidates[0]?.items||[];
  const withSerials=attachSerialBlocks(extracted,source),inventory=sanitizeParsedInventoryItems(inventoryOnlyItems(withSerials),source);
  if(inventory.length&&(!Number.isFinite(Number(doc.subtotal))||Number(doc.subtotal)<=0)){const sum=inventory.reduce((n,x)=>n+(Number(x.amount)||0),0);if(sum>0)doc.subtotal=Math.round(sum*100)/100;}
  if(Number.isFinite(Number(doc.subtotal))&&Number.isFinite(Number(doc.gst))&&!Number.isFinite(Number(doc.total_amount)))doc.total_amount=Math.round((Number(doc.subtotal)+Number(doc.gst))*100)/100;
  const classification=classifyInvoiceDocument(source,withSerials,inventory);
  return {...parsed,doc,items:inventory,excludedServiceCount:Math.max(0,withSerials.length-inventory.length),invoiceClassification:classification,serviceOnlyInvoice:classification.type==='service',dateReviewRequired:!doc.invoice_date,rawText:source,parseEvidence:{...(parsed.parseEvidence||{}),itemSource:candidates[0]?.origin||'none',candidateCounts:candidates.map(c=>({origin:c.origin,count:c.items.length,score:c.score}))}};
}

async function v660ReprocessConfirmedEquipmentInvoice(){
  if(!state.parsed)return;state.importClassificationChoice='equipment';renderImportEligibility();setProgress(45,'Re-checking equipment invoice fields and line items…');$('importProgress')?.classList.remove('hidden');
  try{const raw=state.parsed.raw||state.parsed.rawText||'';let reparsed=v660FinalizeParsedInvoice(parseBestInvoice(raw),raw);if(needsDeepRecovery(reparsed)&&state.file){try{const recovered=await forceOcrRecovery(state.file);if(recovered)reparsed=v660FinalizeParsedInvoice(parseBestInvoice(raw),raw);}catch(err){console.warn('Confirmed-equipment recovery OCR did not complete.',err);}}reparsed.raw=reparsed.rawText||raw;state.parsed=reparsed;applyParsedReviewToForm();await refreshDuplicateWarning();renderImportEligibility();if((state.parsed.items||[]).length)toast('Equipment invoice re-checked and extracted. Verify the recovered fields against the PDF.');else toast('Equipment was selected, but no physical line item could be verified automatically. Add only verified items manually.');}finally{setTimeout(()=>$('importProgress')?.classList.add('hidden'),300);}
}
function v660RenderImportEligibility(){
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

function v660LooksServiceOnlyDocument(text='',extractedItems=[],inventoryItems=[]){
  return classifyInvoiceDocument(text,extractedItems,inventoryItems).type==='service';
}

async function launch(){
  try{
    const r=await fetch(ORIGINAL_APP_URL,{cache:'no-store'});
    if(!r.ok)throw new Error('Unable to load verified V6.55 source ('+r.status+').');
    let src=await r.text();
    if(!src.includes("const APP_VERSION='6.55';"))throw new Error('Verified V6.55 source signature was not found.');

    src=replaceOnce(src,"// AV Inventory Hub V6.55 — evidence-only inventory parsing and verified invoice dates","// AV Inventory Hub V6.60 — calendar-safe invoice dates, resilient AV Media table recovery and evidence validation",'version header');
    src=replaceOnce(src,"const APP_VERSION='6.55';","const APP_VERSION='6.60';",'APP_VERSION');
        src=replaceOnce(src,"const RELEASE_CURRENT_NOTES=[","const RELEASE_CURRENT_NOTES=[\n  'Extraction completes before Equipment/Service classification is evaluated',\n  'Clear equipment invoices are auto-classified from verified priced product rows',\n  'Clear service/labour invoices are blocked without unnecessary confirmation prompts',\n  'Equipment confirmation re-runs extraction and refreshes all review fields',\n  'AV Media Invoice No. and DATE use labelled header coordinates plus OCR fallback',\n  'AV Media PRODUCT NO. tables are parsed in either PDF coordinate direction',\n  'Missing SKU/model uses the verified equipment name instead of AUTO-*',\n  'Serial numbers and warranty text never contaminate SKU/item identifiers',\n  'Subtotal, GST and Amount Due are recovered from labelled total rows and arithmetic checked',\n  'Recovery OCR runs automatically when key header fields or physical line items are missing',",'release notes');

    src=replaceSection(src,"function detectInvoiceDate(text,invoice=''){","\nfunction first(",asPatchedFunction(v660DetectInvoiceDate,'detectInvoiceDate')+'\n','detectInvoiceDate');
    src=replaceSection(src,"function parseDate(v=''){","\nfunction invoiceSignals",asPatchedFunction(v660ParseDate,'parseDate')+'\n','calendar-safe parseDate');
    src=replaceSection(src,'function detectInvoiceDateFromLayout(){','\nfunction layoutMoneyForLabel',asPatchedFunction(v660DetectInvoiceDateFromLayout,'detectInvoiceDateFromLayout')+'\n','coordinate invoice-date parser');
    src=replaceSection(src,'function isNonInventoryServiceLine(x={}){','\nfunction inventoryOnlyItems',asPatchedFunction(v660IsNonInventoryServiceLine,'isNonInventoryServiceLine')+'\n','service-line classifier');
    src=replaceOnce(src,"  return {...x,sku:x.sku||skuFromDescription(description),item_name:standardItemNameFromDescription(description),description};","  return {...x,sku:String(x.sku||'').trim(),item_name:standardItemNameFromDescription(description),description};",'do not infer SKU from description');
    src=replaceOnce(src,"        current.sku=current.sku||skuFromDescription(current.description);","        current.sku=String(current.sku||'').trim();",'remove continuation SKU guessing');
    src=replaceOnce(src,"    item.serialReviewRequired=!!item.serialReviewRequired||block.uncertain||!observed.length;","    item.serialReviewRequired=!!item.serialReviewRequired||block.uncertain;",'optional serial numbers stay optional');
    src=replaceOnce(src,'function parseGenericInvoiceItems(text){',asPatchedFunction(v660ParseProductCodeLayoutItems,'parseProductCodeLayoutItems')+'\nfunction parseGenericInvoiceItems(text){','product-code layout parser insertion');
    src=replaceOnce(src,'function parseGenericInvoiceItems(text){',asPatchedFunction(v660FlexibleProductLayoutItems,'parseFlexibleProductLayoutItems')+'\nfunction parseGenericInvoiceItems(text){','flexible product table parser insertion');
    src=replaceOnce(src,'function parseGenericInvoiceItems(text){',asPatchedFunction(v660ParseAvMediaMixedLayoutItems,'parseAvMediaMixedLayoutItems')+'\n'+asPatchedFunction(v660ParseAvMediaTextItems,'parseAvMediaTextItems')+'\nfunction parseGenericInvoiceItems(text){','AV Media layout + text table parser insertion');
    src=replaceOnce(src,"  const layout=(state.pdfLayout?.length?parseLayoutInvoiceItems():[]).map(normalizeParsedInvoiceItem);\n  let items=[supplierSpecific,generic,numbered,layout].sort((a,b)=>invoiceItemsQuality(b,subtotal)-invoiceItemsQuality(a,subtotal))[0]||[];","  const layout=(state.pdfLayout?.length?parseLayoutInvoiceItems():[]).map(normalizeParsedInvoiceItem);\n  const productLayout=(state.pdfLayout?.length?parseProductCodeLayoutItems():[]).map(normalizeParsedInvoiceItem);\n  const flexibleLayout=(state.pdfLayout?.length?parseFlexibleProductLayoutItems():[]).map(normalizeParsedInvoiceItem);\n  const avMediaLayout=(state.pdfLayout?.length&&/AV\\s+MEDIA/i.test(flat)?parseAvMediaMixedLayoutItems():[]).map(normalizeParsedInvoiceItem);\n  const avMediaText=(/AV\\s+MEDIA/i.test(flat)?parseAvMediaTextItems(flat):[]).map(normalizeParsedInvoiceItem);\n  let items=[supplierSpecific,generic,numbered,layout,productLayout,flexibleLayout,avMediaLayout,avMediaText].sort((a,b)=>invoiceItemsQuality(b,subtotal)-invoiceItemsQuality(a,subtotal))[0]||[];",'parser candidate list');
    src=replaceOnce(src,"  if(/^(sold\\s*to|bill\\s*to|ship\\s*to|invoice|inv|invoice\\s*(no|number)|date)$/i.test(invoice))invoice='';","  if(/^(sold\\s*to|bill\\s*to|ship\\s*to|invoice|inv|invoice\\s*(no|number)|date|customer|customer\\s*code|reference|ref|terms)$/i.test(invoice))invoice='';",'invoice-header contamination guard');

    src=replaceOnce(src,"  const chosen=itemChoice?.r||best;state.pdfLayout=chosen.layout||best.layout||originalLayout;","  const chosen=itemChoice?.r||best;state.pdfLayout=chosen.layout||best.layout||originalLayout;if(!confirmedDate){const strongLayoutDate=detectInvoiceDateFromLayout();if(strongLayoutDate){confirmedDate=strongLayoutDate;doc.invoice_date=strongLayoutDate;}}recoverAvMediaHeader(doc,chosen.text);v660RepairInvoiceMoneyFromLayout(doc);if(doc.invoice_date)confirmedDate=doc.invoice_date;",'strong AV Media header/date/money repair');
    src=replaceOnce(src,"  const items=inventoryOnlyItems(extractedItems);","  const items=sanitizeParsedInventoryItems(inventoryOnlyItems(extractedItems),itemChoice?.r?.text||best.text);",'evidence-only SKU sanitization');
    src=replaceOnce(src,"  return {...best.parsed,doc,items,excludedServiceCount:Math.max(0,extractedItems.length-items.length),dateReviewRequired:!confirmedDate,rawText:chosen.text,ocrSelection:{source:chosen.source,score:chosen.score,candidates:results.map(r=>({source:r.source,score:r.score,items:validParsedItems(r.parsed.items).length}))}};","  const invoiceClassification=classifyInvoiceDocument(chosen.text,extractedItems,items);\n  const serviceOnlyInvoice=invoiceClassification.type==='service';\n  return {...best.parsed,doc,items,excludedServiceCount:Math.max(0,extractedItems.length-items.length),invoiceClassification,serviceOnlyInvoice,dateReviewRequired:!confirmedDate,rawText:chosen.text,ocrSelection:{source:chosen.source,score:chosen.score,candidates:results.map(r=>({source:r.source,score:r.score,items:validParsedItems(r.parsed.items).length}))}};",'evidence-based invoice classification');

    src=replaceOnce(src,'function cleanupPdfPreview(){',asPatchedFunction(v660CleanVerifiedSku,'cleanVerifiedSku')+'\n'+asPatchedFunction(v660CleanInventoryDescription,'cleanInventoryDescription')+'\n'+asPatchedFunction(v660SanitizeParsedInventoryItems,'sanitizeParsedInventoryItems')+'\n'+asPatchedFunction(v660PrepareInventoryLinesForSave,'prepareInventoryLinesForSave')+'\n'+asPatchedFunction(v660RecoverAvMediaHeader,'recoverAvMediaHeader')+'\n'+asPatchedFunction(v660ClassifyInvoiceDocument,'classifyInvoiceDocument')+'\n'+asPatchedFunction(v660EffectiveInvoiceType,'effectiveInvoiceType')+'\n'+asPatchedFunction(v660ApplyParsedReviewToForm,'applyParsedReviewToForm')+'\n'+asPatchedFunction(v660RefreshDuplicateWarning,'refreshDuplicateWarning')+'\n'+asPatchedFunction(v660FinalizeParsedInvoice,'v660FinalizeParsedInvoice')+'\n'+asPatchedFunction(v660ReprocessConfirmedEquipmentInvoice,'reprocessConfirmedEquipmentInvoice')+'\n'+asPatchedFunction(v660RenderImportEligibility,'renderImportEligibility')+'\n'+asPatchedFunction(v660LooksServiceOnlyDocument,'looksServiceOnlyDocument')+'\n'+asPatchedFunction(v660LayoutMoney,'v660LayoutMoney')+'\n'+asPatchedFunction(v660RepairInvoiceMoneyFromLayout,'v660RepairInvoiceMoneyFromLayout')+'\n'+asPatchedFunction(v660NeedsDeepRecovery,'needsDeepRecovery')+'\n'+asPatchedFunction(v660EnsureTesseract,'v660EnsureTesseract')+'\n'+asPatchedFunction(v660ForceOcrRecovery,'forceOcrRecovery')+'\nfunction cleanupPdfPreview(){','import classification, verified SKU, AV Media recovery and OCR helpers');

    src=replaceOnce(src,"async function startImport(file){if(!file)return;if(!requireEdit())return;cleanupPdfPreview();","async function startImport(file){if(!file)return;if(!requireEdit())return;cleanupPdfPreview();state.importClassificationChoice=null;",'reset invoice-type choice');

    src=replaceOnce(src,"const text=await extractPdf(file);const parsedBest=parseBestInvoice(text);state.parsed={...parsedBest,raw:parsedBest.rawText||text};","let text=await extractPdf(file);let parsedBest=v660FinalizeParsedInvoice(parseBestInvoice(text),text);if(needsDeepRecovery(parsedBest)){try{const recovered=await forceOcrRecovery(file);if(recovered)parsedBest=v660FinalizeParsedInvoice(parseBestInvoice(text),text);}catch(recoveryError){console.warn('Recovery OCR could not complete; keeping best verified parse.',recoveryError);}}state.parsed={...parsedBest,raw:parsedBest.rawText||text};",'automatic recovery OCR');

    src=replaceOnce(src,"console.info('Invoice OCR selection',state.parsed.ocrSelection||{source:'text-pdf'});renderParsedItems();const dupe=", "console.info('Invoice OCR selection',state.parsed.ocrSelection||{source:'text-pdf'});state.parsed.items=sanitizeParsedInventoryItems(state.parsed.items||[],state.parsed.raw||text);renderParsedItems();renderImportEligibility();if(state.parsed.invoiceClassification?.type==='service')toast('Equipment invoices only. This service-work invoice cannot be saved.');else if(state.parsed.invoiceClassification?.type==='uncertain')toast('Invoice type is uncertain. Confirm Equipment or Service before saving.');const dupe=",'eligibility rendering');
    src=replaceOnce(src,",d,state.parsed.items,namedFile);state.lastImportCount=state.parsed.items.length;",",d,prepareInventoryLinesForSave(state.parsed.items),namedFile);state.lastImportCount=state.parsed.items.length;",'deterministic SKU fallback');
    src=replaceOnce(src,"finally{state.importSaving=false;const saveBtn=$('saveImportBtn');if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Confirm & save';}if($('importProgress'))$('importProgress').classList.add('hidden');}","finally{state.importSaving=false;const saveBtn=$('saveImportBtn');if(saveBtn){saveBtn.textContent='Confirm & save';}renderImportEligibility();if($('importProgress'))$('importProgress').classList.add('hidden');}",'save-button final state');

    const gate="\n// V6.60 evidence-based equipment-only save gate.\n$('saveImportBtn').addEventListener('click',e=>{\n  if(!state.parsed)return;\n  const detected=state.parsed.invoiceClassification?.type||'uncertain';\n  const effective=detected==='uncertain'?(state.importClassificationChoice||'uncertain'):detected;\n  if(effective==='equipment')return;\n  e.preventDefault();e.stopImmediatePropagation();\n  renderImportEligibility();\n  toast(effective==='service'?'Equipment invoices only. Service-work invoices cannot be saved.':'Confirm whether this is an Equipment invoice or Service invoice before saving.');\n},true);\n\n";
    src=replaceOnce(src,'// Final evidence gate runs before the existing save handler.',gate+'// Final evidence gate runs before the existing save handler.','invoice classification save gate');

    const blob=new Blob([src],{type:'text/javascript'}),url=URL.createObjectURL(blob);
    try{await import(url);}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(err){
    console.error('AV Inventory Hub V6.60 startup error:',err);
    const box=document.createElement('div');
    box.style.cssText='position:fixed;inset:20px;z-index:99999;background:#fff;border:1px solid #d33;border-radius:12px;padding:20px;font:14px/1.5 Arial;color:#222;box-shadow:0 10px 30px #0002';
    box.innerHTML='<b>AV Inventory Hub V6.60 could not start.</b><br>The verified V6.55 base was left untouched in Git history.<br><br><code>'+String(err.message||err).replace(/[&<>]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[s]))+'</code>';
    document.body.appendChild(box);
  }
}

await launch();
