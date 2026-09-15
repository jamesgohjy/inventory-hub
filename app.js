// AV Inventory Hub V6.57 — calendar-safe invoice dates, resilient AV Media table recovery and evidence validation
// This patch loader applies V6.57 safely on top of the verified V6.55 source.
const ORIGINAL_APP_URL='https://raw.githubusercontent.com/jamesgohjy/inventory-hub/d45233b134921b3085a1318b10443d488fd832a0/app.js';

function replaceOnce(src,needle,replacement,label=needle){
  const i=src.indexOf(needle);
  if(i<0)throw new Error('V6.57 patch marker not found: '+label);
  return src.slice(0,i)+replacement+src.slice(i+needle.length);
}
function replaceSection(src,startMarker,endMarker,replacement,label=startMarker){
  const s=src.indexOf(startMarker),e=src.indexOf(endMarker,s+startMarker.length);
  if(s<0||e<0)throw new Error('V6.57 patch section not found: '+label);
  return src.slice(0,s)+replacement+src.slice(e);
}
function asPatchedFunction(fn,newName){
  return fn.toString().replace(/^function\s+[^\s(]+/,`function ${newName}`);
}

function v657DetectInvoiceDate(text,invoice=''){
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
  // V6.57: many AV Media invoices use a compact header labelled only "DATE".
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

function v657ParseDate(v=''){
  const s=normalizePdfText(v).trim().replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi,'$1').replace(/\s*([/.\-])\s*/g,'$1');
  const valid=(y,m,d)=>{y=Number(y);m=Number(m);d=Number(d);if(y<100)y+=2000;if(y<1900||y>2200||m<1||m>12||d<1||d>31)return'';const md=[31,((y%4===0&&y%100!==0)||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];if(d>md[m-1])return'';return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;};
  let m=s.match(/\b(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})\b/);if(m){const d=valid(m[1],m[2],m[3]);if(d)return d;}
  m=s.match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/);if(m){const d=valid(m[3],m[2],m[1]);if(d)return d;}
  const months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
  m=s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/);if(m&&months[m[2].toLowerCase()]){const d=valid(m[3],months[m[2].toLowerCase()],m[1]);if(d)return d;}
  m=s.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})\b/);if(m&&months[m[1].toLowerCase()]){const d=valid(m[3],months[m[1].toLowerCase()],m[2]);if(d)return d;}
  return '';
}

function v657DetectInvoiceDateFromLayout(){
  const pages=state.pdfLayout||[];
  const dateFrom=(v)=>{const c=dateCandidateFromText(v);return c?parseDate(c):'';};
  for(const pg of pages){
    const rows=pg.rows||[];
    for(const row of rows){
      const labelItems=(row.items||[]).filter(it=>/^(?:invoice\s*)?date\.?$/i.test(String(it.text||'').trim()));
      const rowHasInvoiceDate=/\binvoice\s*date\b/i.test(row.text||'');
      if(!labelItems.length&&!rowHasInvoiceDate)continue;
      const direct=dateFrom(row.text||'');if(direct)return direct;
      const label=labelItems[0]||{x:Math.min(...(row.items||[]).map(i=>i.x).filter(Number.isFinite),0)};
      const context=rows.filter(r=>Math.abs((r.y||0)-(row.y||0))<=22).map(r=>r.text||'').join(' ');
      if(!rowHasInvoiceDate&&!/\b(?:ref\.?\s*(?:no\.?|number)?|invoice\s*(?:no\.?|number|#)|p\/?o\s*(?:no\.?|number)?|salesman|terms)\b/i.test(context))continue;
      const nearby=[];
      for(const r of rows){
        const dy=(row.y||0)-(r.y||0);if(dy<-4||dy>70)continue;
        const rowDirect=dateFrom(r.text||'');
        if(rowDirect){
          const dateItems=(r.items||[]).filter(it=>dateCandidateFromText(String(it.text||'')));
          const x=dateItems.length?dateItems[0].x:Math.min(...(r.items||[]).map(i=>i.x).filter(Number.isFinite),label.x);
          nearby.push({d:rowDirect,dx:Math.abs((x||0)-(label.x||0)),dy:Math.abs(dy)});
        }
        for(const it of r.items||[]){const d=dateFrom(String(it.text||''));if(d)nearby.push({d,dx:Math.abs((it.x||0)-(label.x||0)),dy:Math.abs(dy)});}
      }
      nearby.sort((a,b)=>(a.dx+a.dy*.65)-(b.dx+b.dy*.65));
      if(nearby.length&&nearby[0].dx<=110)return nearby[0].d;
    }
  }
  // Last resort: one unambiguous date in the invoice-header band only.
  for(const pg of pages){
    const rows=pg.rows||[];const header=rows.filter(r=>/\b(?:ref\.?\s*no|invoice\s*(?:no|number)|p\/?o\s*no|salesman|terms|customer\s*code)\b/i.test(r.text||''));
    if(!header.length)continue;const top=Math.max(...header.map(r=>r.y)),bottom=Math.min(...header.map(r=>r.y))-55;
    const dates=[];for(const r of rows.filter(r=>r.y<=top+15&&r.y>=bottom)){const d=dateFrom(r.text||'');if(d)dates.push(d);}
    const uniq=[...new Set(dates)];if(uniq.length===1)return uniq[0];
  }
  return '';
}

function v657FlexibleProductLayoutItems(){
  const pages=state.pdfLayout||[],out=[];
  const cleanToken=v=>String(v||'').trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
  const plainNum=v=>{const s=String(v??'').replace(/,/g,'').replace(/[^0-9.-]/g,'');const n=Number(s);return Number.isFinite(n)?n:null;};
  const reconcile=(q,p,a)=>{if(p>0&&a>=0){const r=a/p,n=Math.round(r);if(n>=1&&n<=999&&Math.abs(r-n)<.02&&(q===null||q<=0||Math.abs(q-n)>.001))return n;}return q;};
  for(const pg of pages){
    const rows=pg.rows||[];
    const descRows=rows.filter(r=>/\bdescription\b/i.test(r.text||''));
    for(const dr of descRows){
      const band=rows.filter(r=>Math.abs((r.y||0)-(dr.y||0))<=18);
      const bandText=band.map(r=>r.text||'').join(' ');
      if(!/\b(?:qty|quantity|units?)\b/i.test(bandText)||!/\bprice\b/i.test(bandText)||!/\bamount\b/i.test(bandText))continue;
      const items=band.flatMap(r=>r.items||[]).sort((a,b)=>(a.x||0)-(b.x||0));
      const findX=re=>{const a=items.find(it=>re.test(cleanToken(it.text)));return a?.x??null;};
      let xDesc=findX(/^description$/i),xQty=findX(/^(?:qty|quantity|units?)$/i),xPrice=findX(/price/i),xAmount=findX(/^amount$/i);
      let xCode=findX(/^(?:product|sku|model|item)$/i);
      if(xCode===null){const p=items.find(it=>/product/i.test(String(it.text||'')));if(p)xCode=p.x;}
      if(xCode===null)xCode=Math.min(...items.map(i=>i.x).filter(Number.isFinite));
      if([xDesc,xQty,xPrice,xAmount].some(v=>v===null)||!Number.isFinite(xCode))continue;
      const headerY=dr.y,bCD=(xCode+xDesc)/2,qtyStart=xQty-Math.max(18,(xPrice-xQty)*.30),bQP=(xQty+xPrice)/2,bPA=(xPrice+xAmount)/2;
      const stops=rows.filter(r=>r.y<headerY&&/\b(?:sub\s*total|subtotal|gst\b|grand\s*total|amount\s+due)\b/i.test(r.text||'')).sort((a,b)=>b.y-a.y);const stopY=stops[0]?.y??-Infinity;
      const body=rows.filter(r=>r.y<headerY&&r.y>stopY).sort((a,b)=>b.y-a.y);
      const anchors=[];
      for(const r of body){
        const code=(r.items||[]).filter(it=>it.x<bCD).map(it=>cleanToken(it.text)).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
        const desc=(r.items||[]).filter(it=>it.x>=bCD&&it.x<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ').trim();
        const right=(r.items||[]).filter(it=>it.x>=qtyStart).map(it=>String(it.text||'')).join(' ');
        const codeLike=code&&/^[A-Z0-9][A-Z0-9+._\/-]*(?:\s+[A-Z0-9+._\/-]+)*$/i.test(code)&&!/^\d+(?:\.\d+)?$/.test(code)&&!/^(?:s\/?n|serial|warranty|shipment|remarks?|subtotal|total)$/i.test(code);
        // Product code, description, quantity and money often land on slightly different PDF text baselines.
        // Treat a proven code in the PRODUCT NO. column as the row anchor even when the same reconstructed row
        // contains no description/number. The following group then collects the nearby baselines by coordinates.
        if(codeLike)anchors.push({row:r,code});
        else if(!code&&desc&&/\d/.test(right))anchors.push({row:r,code:''});
      }
      const uniq=[];for(const a of anchors){if(uniq.every(u=>Math.abs(u.row.y-a.row.y)>Math.max(2,pg.yTolerance||2)))uniq.push(a);}      
      for(let i=0;i<uniq.length;i++){
        const topY=uniq[i].row.y+Math.max(3,pg.yTolerance||3),bottomY=i+1<uniq.length?uniq[i+1].row.y+Math.max(3,pg.yTolerance||3):stopY;
        const group=body.filter(r=>r.y<=topY&&r.y>bottomY);const descParts=[];let qty=null,price=null,amount=null,warranty='';
        for(const r of group){
          const d=(r.items||[]).filter(it=>it.x>=bCD&&it.x<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ').trim();
          if(d){
            if(/\bwarranty\b/i.test(d)){const y=d.match(/\b(\d+)\s*years?\b/i);warranty=y?`${y[1]} Years`:d;}
            else if(!/^\s*(?:s\/?n|serial\s*(?:no|number)?)\b/i.test(d)){
              // AV Media descriptions often begin with "Shipment No. <value>:" on the same visual line.
              // Remove only that logistics prefix and preserve the actual equipment description after it.
              const detail=d.replace(/^\s*shipment\s*no\.?\s*[:#.-]?\s*[A-Z0-9._\/-]+\s*[:;,-]?\s*/i,'').trim();
              if(detail)descParts.push(detail);
            }
          }
          if(qty===null){const q=(r.items||[]).filter(it=>it.x>=qtyStart&&it.x<bQP).map(it=>plainNum(cleanToken(it.text))).filter(v=>v!==null);if(q.length)qty=q[0];}
          if(price===null){const p=(r.items||[]).filter(it=>it.x>=bQP&&it.x<bPA).flatMap(it=>decimalMoneyCandidates(String(it.text||'')));if(p.length)price=p[p.length-1];}
          if(amount===null){const a=(r.items||[]).filter(it=>it.x>=bPA).flatMap(it=>decimalMoneyCandidates(String(it.text||'')));if(a.length)amount=a[a.length-1];}
        }
        qty=reconcile(qty,price,amount);const desc=cleanInvoiceDescription(descParts.join(' '));
        if(!desc||!(qty>0)||(price===null&&amount===null))continue;
        const code=uniq[i].code.trim();out.push(normalizeParsedInvoiceItem({sku:code,item_name:desc,description:desc,category:'',unit:'pcs',quantity:qty,unit_price:price,amount,warranty,serials:''}));
      }
      if(out.length)break;
    }
  }
  return out;
}

function v657LayoutMoney(labelRe,{exclude=null}={}){
  const rows=getPdfLayoutRows(),re=labelRe instanceof RegExp?labelRe:new RegExp(labelRe,'i');
  for(const row of rows){
    if(!re.test(row.text||'')||(exclude&&exclude.test(row.text||'')))continue;
    const labelXs=(row.items||[]).filter(it=>re.test(String(it.text||''))).map(it=>it.x).filter(Number.isFinite);const labelX=labelXs.length?Math.min(...labelXs):Math.min(...(row.items||[]).map(i=>i.x).filter(Number.isFinite),0);
    const ownVals=[];for(const it of row.items||[]){for(const v of decimalMoneyCandidates(String(it.text||'')))ownVals.push({v,x:it.x||0});}
    const ownRight=ownVals.filter(x=>x.x>=labelX+8).sort((a,b)=>b.x-a.x);if(ownRight.length)return ownRight[0].v;
    const own=decimalMoneyCandidates(row.text||'');if(own.length)return own[own.length-1];
    // Only if the amount was split onto a neighbouring baseline, inspect a very tight Y band.
    const band=rows.filter(r=>r.page===row.page&&r!==row&&Math.abs((r.y||0)-(row.y||0))<=5);const vals=[];
    for(const r of band)for(const it of r.items||[]){for(const v of decimalMoneyCandidates(String(it.text||'')))vals.push({v,x:it.x||0});}
    const right=vals.filter(x=>x.x>=labelX+8).sort((a,b)=>b.x-a.x);if(right.length)return right[0].v;
  }
  return null;
}
function v657RepairInvoiceMoneyFromLayout(doc={}){
  const s=v657LayoutMoney(/\b(?:Sub\s*Total|Subtotal)\b/i),g=v657LayoutMoney(/\b(?:Add\s+)?GST(?:\s*@?\s*\d+(?:\.\d+)?%)?\b/i,{exclude:/GST\s+Reg(?:istration)?\s*(?:No|Number)?/i}),t=v657LayoutMoney(/\b(?:Amount\s+Due|Grand\s*Total|Invoice\s*Total|Total\s*Amount|TOTAL)\b/i,{exclude:/Sub\s*Total|Subtotal/i});
  if(s!==null&&Number.isFinite(s))doc.subtotal=s;if(g!==null&&Number.isFinite(g))doc.gst=g;if(t!==null&&Number.isFinite(t))doc.total_amount=t;
  return doc;
}

function v657NeedsDeepRecovery(parsed={}){
  const d=parsed.doc||{},items=validParsedItems(parsed.items||[]);if(!d.invoice_date||!items.length||!d.invoice_number)return true;
  const s=Number(d.subtotal),g=Number(d.gst),t=Number(d.total_amount);if([s,g,t].every(Number.isFinite)&&Math.abs((s+g)-t)>0.05)return true;
  return false;
}

async function v657ForceOcrRecovery(file){
  if(!window.Tesseract)return false;
  setProgress(40,'Invoice fields need a deeper scan — running recovery OCR…');
  const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
  const data=new Uint8Array(await file.arrayBuffer()),pdf=await pdfjs.getDocument({data}).promise;
  const modes=[{key:'recovery-auto',label:'AUTO',psm:Tesseract.PSM?.AUTO??'3',texts:[],layouts:[]},{key:'recovery-column',label:'SINGLE_COLUMN',psm:Tesseract.PSM?.SINGLE_COLUMN??'4',texts:[],layouts:[]},{key:'recovery-sparse',label:'SPARSE_TEXT',psm:Tesseract.PSM?.SPARSE_TEXT??'11',texts:[],layouts:[]}];
  const worker=await Tesseract.createWorker('eng');
  try{for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),vp=p.getViewport({scale:3.0}),c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);await p.render({canvasContext:c.getContext('2d',{willReadFrequently:true}),viewport:vp}).promise;for(let mi=0;mi<modes.length;mi++){const m=modes[mi],pct=42+Math.round(45*((i-1)*modes.length+mi+1)/(pdf.numPages*modes.length));setProgress(pct,`Recovery OCR ${m.label}… page ${i} of ${pdf.numPages}`);await worker.setParameters({tessedit_pageseg_mode:m.psm,preserve_interword_spaces:'1',user_defined_dpi:'220'});const r=await worker.recognize(c,{}, {text:true,tsv:true,hocr:true,blocks:true});const layout=ocrResultToLayout(r.data||{},i,c.height);m.layouts.push(layout);m.texts.push(String(r.data?.text||'').trim()||layout.rows?.map(x=>x.text).join('\n').trim());}}}finally{await worker.terminate();}
  const recovered=modes.map(m=>{const text=m.texts.join('\n').trim();return{source:m.key,label:m.label,text,layout:m.layouts,score:ocrTextQuality(text)+m.layouts.reduce((n,l)=>n+layoutInvoiceQuality(l),0)};}).filter(x=>x.text);
  state.ocrCandidates=[...(state.ocrCandidates||[]),...recovered].sort((a,b)=>b.score-a.score);return recovered.length>0;
}

function v657IsNonInventoryServiceLine(x={}){
  const text=normalizePdfText([x.item_name,x.description].filter(Boolean).join(' ')).replace(/\s+/g,' ').trim();
  const sku=normalizePdfText(x.sku||'').replace(/\s+/g,' ').trim();
  if(!text&&!sku)return false;
  const serviceSku=/\b(?:INSTALL(?:ATION)?|LABOU?R|SERVICE|DISMANTL(?:E|ING)|RE-?INSTAT(?:E|EMENT)|RELOCAT(?:E|ION)|REMOV(?:E|AL)|TEST(?:ING)?|COMMISSION(?:ING)?)\b/i.test(sku);
  const strongStart=/^(?:sales\s*[-:]\s*)?(?:dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|labou?r|installation|installing|services?|professional\s+services?|consultancy|consulting|training|testing|commissioning|setup|configuration|delivery|freight|transport|manpower|on[- ]?site\s+support)\b/i.test(text);
  const labourPhrase=/\b(?:supply\s+)?labou?r\s+(?:for|to|and|&)\s+(?:dismantl(?:e|ing)|installation|install|services?|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|testing|commissioning)\b/i.test(text);
  const workPhrase=/\b(?:dismantl(?:e|ing)|re-?instat(?:e|ement)|relocat(?:e|ion)|remov(?:e|al)|installation|testing|commissioning)\s*(?:work|works|service|services|job|labou?r)\b/i.test(text);
  const installBundle=/\b(?:installation|testing|commissioning)\s*(?:and|&|\/|,)+\s*(?:services?|testing|commissioning)\b/i.test(text);
  return serviceSku||strongStart||labourPhrase||workPhrase||installBundle;
}

function v657ParseProductCodeLayoutItems(){
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

function v657PrepareInventoryLinesForSave(items=[]){
  return (items||[]).map(line=>{
    const printedSku=String(line.sku||'').trim();
    const printedDescription=cleanInvoiceDescription(line.description||line.item_name||'').trim();
    const fallback=printedDescription||String(line.item_name||'').trim();
    return {...line,sku:printedSku||fallback};
  });
}

function v657RenderImportEligibility(){
  const parsed=state.parsed,blocked=!!parsed?.serviceOnlyInvoice,saveBtn=$('saveImportBtn');
  let note=$('invoiceEligibilityWarning');
  if(!note&&$('parsedItems')){
    note=document.createElement('div');note.id='invoiceEligibilityWarning';
    note.style.cssText='margin:0 0 14px;padding:12px 14px;border:1px solid #f5c2c0;border-radius:10px;background:#fff1f0;color:#912018;font-size:12px;line-height:1.45';
    $('parsedItems').parentNode.insertBefore(note,$('parsedItems'));
  }
  if(note){
    note.classList.toggle('hidden',!blocked);
    note.innerHTML=blocked?'<strong>Equipment invoices only.</strong> This document appears to contain service / installation work only. It cannot be added to inventory. Upload an invoice that contains physical equipment items.':'';
  }
  if(saveBtn){
    saveBtn.disabled=blocked||!!state.importSaving;
    saveBtn.title=blocked?'Only equipment invoices can be saved. Service / installation-only invoices are not allowed.':'';
    saveBtn.setAttribute('aria-disabled',blocked?'true':'false');
  }
}

function v657LooksServiceOnlyDocument(text='',extractedItems=[],inventoryItems=[]){
  if((inventoryItems||[]).length)return false;
  if((extractedItems||[]).some(isNonInventoryServiceLine))return true;
  const t=normalizePdfText(text).replace(/\s+/g,' ');
  const serviceHits=[/\bdismantl(?:e|ing)\b/i,/\bre-?instat(?:e|ement)\b/i,/\blabou?r\b/i,/\binstallation\b/i,/\bcommissioning\b/i,/\bservice(?:s)?\b/i].filter(re=>re.test(t)).length;
  const physicalHits=[/\bprojector\b/i,/\bmicrophone\b/i,/\bspeaker\b/i,/\bcamera\b/i,/\bmixer\b/i,/\bdisplay\b/i,/\bmonitor\b/i,/\bcable\b/i,/\bstand\b/i,/\btrolley\b/i,/\btransmitter\b/i,/\breceiver\b/i].filter(re=>re.test(t)).length;
  return serviceHits>=2&&physicalHits===0;
}

async function launch(){
  try{
    const r=await fetch(ORIGINAL_APP_URL,{cache:'no-store'});
    if(!r.ok)throw new Error('Unable to load verified V6.55 source ('+r.status+').');
    let src=await r.text();
    if(!src.includes("const APP_VERSION='6.55';"))throw new Error('Verified V6.55 source signature was not found.');

    src=replaceOnce(src,"// AV Inventory Hub V6.55 — evidence-only inventory parsing and verified invoice dates","// AV Inventory Hub V6.57 — calendar-safe invoice dates, resilient AV Media table recovery and evidence validation",'version header');
    src=replaceOnce(src,"const APP_VERSION='6.55';","const APP_VERSION='6.57';",'APP_VERSION');
    src=replaceOnce(src,"const RELEASE_CURRENT_NOTES=[","const RELEASE_CURRENT_NOTES=[\n  'Calendar-safe invoice dates no longer shift one day because of UTC timezone conversion',\n  'DATE header values are read by PDF coordinates when labels and values are split into different text rows',\n  'AV Media PRODUCT NO. tables use flexible header bands and coordinate columns to recover line items reliably',\n  'Poor parses automatically trigger a higher-resolution recovery OCR pass before review',\n  'Subtotal, GST and total are re-read from the rightmost values on their labelled PDF rows to avoid quantity-column contamination',\n  'Equipment-only import gate blocks service / installation-only invoices and disables Confirm & save',\n  'Items with no printed SKU use their printed description as the deterministic SKU fallback at save time; no random AUTO-* SKU is generated',",'release notes');

    src=replaceSection(src,"function detectInvoiceDate(text,invoice=''){","\nfunction first(",asPatchedFunction(v657DetectInvoiceDate,'detectInvoiceDate')+'\n','detectInvoiceDate');
    src=replaceSection(src,"function parseDate(v=''){","\nfunction invoiceSignals",asPatchedFunction(v657ParseDate,'parseDate')+'\n','calendar-safe parseDate');
    src=replaceSection(src,'function detectInvoiceDateFromLayout(){','\nfunction layoutMoneyForLabel',asPatchedFunction(v657DetectInvoiceDateFromLayout,'detectInvoiceDateFromLayout')+'\n','coordinate invoice-date parser');
    src=replaceSection(src,'function isNonInventoryServiceLine(x={}){','\nfunction inventoryOnlyItems',asPatchedFunction(v657IsNonInventoryServiceLine,'isNonInventoryServiceLine')+'\n','service-line classifier');
    src=replaceOnce(src,'function parseGenericInvoiceItems(text){',asPatchedFunction(v657ParseProductCodeLayoutItems,'parseProductCodeLayoutItems')+'\nfunction parseGenericInvoiceItems(text){','product-code layout parser insertion');
    src=replaceOnce(src,'function parseGenericInvoiceItems(text){',asPatchedFunction(v657FlexibleProductLayoutItems,'parseFlexibleProductLayoutItems')+'\nfunction parseGenericInvoiceItems(text){','flexible product table parser insertion');
    src=replaceOnce(src,"  const layout=(state.pdfLayout?.length?parseLayoutInvoiceItems():[]).map(normalizeParsedInvoiceItem);\n  let items=[supplierSpecific,generic,numbered,layout].sort((a,b)=>invoiceItemsQuality(b,subtotal)-invoiceItemsQuality(a,subtotal))[0]||[];","  const layout=(state.pdfLayout?.length?parseLayoutInvoiceItems():[]).map(normalizeParsedInvoiceItem);\n  const productLayout=(state.pdfLayout?.length?parseProductCodeLayoutItems():[]).map(normalizeParsedInvoiceItem);\n  const flexibleLayout=(state.pdfLayout?.length?parseFlexibleProductLayoutItems():[]).map(normalizeParsedInvoiceItem);\n  let items=[supplierSpecific,generic,numbered,layout,productLayout,flexibleLayout].sort((a,b)=>invoiceItemsQuality(b,subtotal)-invoiceItemsQuality(a,subtotal))[0]||[];",'parser candidate list');
    src=replaceOnce(src,"  if(/^(sold\\s*to|bill\\s*to|ship\\s*to|invoice|inv|invoice\\s*(no|number)|date)$/i.test(invoice))invoice='';","  if(/^(sold\\s*to|bill\\s*to|ship\\s*to|invoice|inv|invoice\\s*(no|number)|date|customer|customer\\s*code|reference|ref|terms)$/i.test(invoice))invoice='';",'invoice-header contamination guard');

    src=replaceOnce(src,"  const chosen=itemChoice?.r||best;state.pdfLayout=chosen.layout||best.layout||originalLayout;","  const chosen=itemChoice?.r||best;state.pdfLayout=chosen.layout||best.layout||originalLayout;if(!confirmedDate){const strongLayoutDate=detectInvoiceDateFromLayout();if(strongLayoutDate){confirmedDate=strongLayoutDate;doc.invoice_date=strongLayoutDate;}}v657RepairInvoiceMoneyFromLayout(doc);",'strong date and money repair');
    src=replaceOnce(src,"  return {...best.parsed,doc,items,excludedServiceCount:Math.max(0,extractedItems.length-items.length),dateReviewRequired:!confirmedDate,rawText:chosen.text,ocrSelection:{source:chosen.source,score:chosen.score,candidates:results.map(r=>({source:r.source,score:r.score,items:validParsedItems(r.parsed.items).length}))}};","  const serviceOnlyInvoice=items.length===0&&looksServiceOnlyDocument(chosen.text,extractedItems,items);\n  return {...best.parsed,doc,items,excludedServiceCount:Math.max(0,extractedItems.length-items.length),serviceOnlyInvoice,dateReviewRequired:!confirmedDate,rawText:chosen.text,ocrSelection:{source:chosen.source,score:chosen.score,candidates:results.map(r=>({source:r.source,score:r.score,items:validParsedItems(r.parsed.items).length}))}};",'service-only result flag');

    src=replaceOnce(src,'function cleanupPdfPreview(){',asPatchedFunction(v657PrepareInventoryLinesForSave,'prepareInventoryLinesForSave')+'\n'+asPatchedFunction(v657RenderImportEligibility,'renderImportEligibility')+'\n'+asPatchedFunction(v657LooksServiceOnlyDocument,'looksServiceOnlyDocument')+'\n'+asPatchedFunction(v657LayoutMoney,'v657LayoutMoney')+'\n'+asPatchedFunction(v657RepairInvoiceMoneyFromLayout,'v657RepairInvoiceMoneyFromLayout')+'\n'+asPatchedFunction(v657NeedsDeepRecovery,'needsDeepRecovery')+'\n'+asPatchedFunction(v657ForceOcrRecovery,'forceOcrRecovery')+'\nfunction cleanupPdfPreview(){','import gate and recovery helpers');

    src=replaceOnce(src,"const text=await extractPdf(file);const parsedBest=parseBestInvoice(text);state.parsed={...parsedBest,raw:parsedBest.rawText||text};","let text=await extractPdf(file);let parsedBest=parseBestInvoice(text);if(needsDeepRecovery(parsedBest)){try{const recovered=await forceOcrRecovery(file);if(recovered)parsedBest=parseBestInvoice(text);}catch(recoveryError){console.warn('Recovery OCR could not complete; keeping best verified parse.',recoveryError);}}state.parsed={...parsedBest,raw:parsedBest.rawText||text};",'automatic recovery OCR');

    src=replaceOnce(src,"console.info('Invoice OCR selection',state.parsed.ocrSelection||{source:'text-pdf'});renderParsedItems();const dupe=", "console.info('Invoice OCR selection',state.parsed.ocrSelection||{source:'text-pdf'});renderParsedItems();renderImportEligibility();if(state.parsed.serviceOnlyInvoice)toast('Equipment invoices only. Service / installation-only invoices cannot be saved.');const dupe=",'eligibility rendering');
    src=replaceOnce(src,",d,state.parsed.items,namedFile);state.lastImportCount=state.parsed.items.length;",",d,prepareInventoryLinesForSave(state.parsed.items),namedFile);state.lastImportCount=state.parsed.items.length;",'deterministic SKU fallback');
    src=replaceOnce(src,"finally{state.importSaving=false;const saveBtn=$('saveImportBtn');if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Confirm & save';}if($('importProgress'))$('importProgress').classList.add('hidden');}","finally{state.importSaving=false;const saveBtn=$('saveImportBtn');if(saveBtn){saveBtn.textContent='Confirm & save';}renderImportEligibility();if($('importProgress'))$('importProgress').classList.add('hidden');}",'save-button final state');

    const gate="\n// V6.57 equipment-only save gate. The source-document classification is immutable during review.\n$('saveImportBtn').addEventListener('click',e=>{\n  if(!state.parsed?.serviceOnlyInvoice)return;\n  e.preventDefault();e.stopImmediatePropagation();\n  renderImportEligibility();\n  toast('Equipment invoices only. Service / installation-only invoices cannot be saved.');\n},true);\n\n";
    src=replaceOnce(src,'// Final evidence gate runs before the existing save handler.',gate+'// Final evidence gate runs before the existing save handler.','equipment-only click gate');

    const blob=new Blob([src],{type:'text/javascript'}),url=URL.createObjectURL(blob);
    try{await import(url);}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(err){
    console.error('AV Inventory Hub V6.57 startup error:',err);
    const box=document.createElement('div');
    box.style.cssText='position:fixed;inset:20px;z-index:99999;background:#fff;border:1px solid #d33;border-radius:12px;padding:20px;font:14px/1.5 Arial;color:#222;box-shadow:0 10px 30px #0002';
    box.innerHTML='<b>AV Inventory Hub V6.57 could not start.</b><br>The verified V6.55 base was left untouched in Git history.<br><br><code>'+String(err.message||err).replace(/[&<>]/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[s]))+'</code>';
    document.body.appendChild(box);
  }
}

await launch();
