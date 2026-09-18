/* AV Inventory Hub v7.03 parser core
 * Global rules: evidence-only fields, stable source-row identity, independent extraction,
 * optional serials, no SKU invention, classification before completeness, and V7-primary evidence verification.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.AVParserV7=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const GLOBAL_RULES=Object.freeze({
    noInventedValues:true,
    sourceRowIdentity:true,
    keepExtractionSourcesSeparate:true,
    provenanceRequired:true,
    serialOptional:true,
    repeatedSkuRowsRemainDistinct:true,
    classifyBeforeCompleteness:true,
    microphoneStandIncluded:true,
    genericStandExcluded:true,
    currentReviewValuesBeforeSaveValidation:true,
    aiShadowOnlyByDefault:false,
    v7PrimarySourceOfTruth:true,
    legacyEmergencyFallbackOnly:true,
    actualPdfRegressionRequired:true
  });

  const clean=(v='')=>String(v??'').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').trim();
  const norm=(v='')=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const compact=(v='')=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const money=(v)=>{if(v===null||v===undefined||v==='')return null;const s=String(v).replace(/(?:SGD|S\$|\$)/gi,'').replace(/\s/g,'').replace(/,(?=\d{3}(?:\.\d{2})?$)/g,'').replace(/,(?=\d{2}$)/,'.').replace(/[^0-9.-]/g,'');const n=Number(s);return Number.isFinite(n)?n:null;};
  const qtyNumber=(v)=>{const s=clean(v);if(/^[Iil|]$/.test(s))return 1;const n=Number(s.replace(/[^0-9.]/g,''));return Number.isFinite(n)&&n>0?n:null;};
  const uniq=(xs,key=x=>x)=>{const out=[],seen=new Set();for(const x of xs||[]){const k=key(x);if(seen.has(k))continue;seen.add(k);out.push(x);}return out;};
  const words=(s='')=>new Set(norm(s).split(' ').filter(x=>x.length>2));
  const similarity=(a,b)=>{const A=words(a),B=words(b);if(!A.size&&!B.size)return 1;if(!A.size||!B.size)return 0;let inter=0;for(const x of A)if(B.has(x))inter++;return inter/Math.max(A.size,B.size);};
  const round2=n=>Number.isFinite(Number(n))?Math.round(Number(n)*100)/100:null;

  function normalizeSerial(v=''){
    return clean(v).replace(/^[([{]+|[\])}.:,;]+$/g,'').toUpperCase().replace(/\s+/g,'');
  }
  function extractSerialTail(tail=''){
    const chunks=String(tail||'').split(/[,;]+/),out=[];
    for(const chunk of chunks){
      const parts=clean(chunk).split(/\s+/).map(x=>x.replace(/^[([{]+|[\])}.:,;]+$/g,'')).filter(Boolean);
      let acc='';
      for(const part of parts){
        if(!/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(part))break;
        const hasDigit=/\d/.test(part),hasPunct=/[._\/-]/.test(part);
        if(!hasDigit&&!hasPunct){
          // Once a serial has started, short alphabetic OCR debris is a stop marker, not serial content.
          if(acc)break;
          continue;
        }
        acc+=part;
        if(acc.length>40)break;
      }
      if(acc&&/\d/.test(acc)&&acc.length>=6)out.push(acc);
    }
    return uniq(out,x=>normalizeSerial(x));
  }
  function serialList(v=''){
    if(Array.isArray(v))return uniq(v.map(clean).filter(Boolean).filter(x=>!/^N\/?A$/i.test(x)),x=>normalizeSerial(x));
    const s=String(v||'');
    if(!s.trim())return [];
    // If this looks like a labelled OCR tail, use the conservative token extractor.
    if(/(?:S\s*[/.-]?\s*N|S\.?N\.?|Serial)/i.test(s))return extractSerialTail(s.replace(/^.*?(?:S\s*[/.-]?\s*N|S\.?N\.?|Serial(?:\s*(?:No\.?|Number))?)\s*[:#.-]?\s*/i,''));
    return uniq(s.split(/[,;\n]+/).map(clean).filter(Boolean).filter(x=>!/^N\/?A$/i.test(x)),x=>normalizeSerial(x));
  }

  function reassignOptionalSerials(rows=[]){
    const out=(rows||[]).map(r=>({...r}));
    for(let i=0;i<out.length;i++){
      const r=out[i],cls=(r.classification||classifyRow(r)).type,ss=serialList(r.serials);
      if(!ss.length)continue;
      if(cls==='warranty'){
        for(let j=i-1;j>=0;j--){
          const prev=out[j],pcls=(prev.classification||classifyRow(prev)).type;
          if(pcls!=='equipment')continue;
          prev.serials=uniq([...serialList(prev.serials),...ss],x=>normalizeSerial(x)).join(', ');
          r.serials='';
          if(r.provenance?.serials)r.provenance.serials={...r.provenance.serials,value:'',movedToRowId:prev.rowId,reason:'serial printed under warranty row belongs to preceding equipment row'};
          break;
        }
      }
    }
    return out;
  }

  function classifyRow(row={}){
    const sku=clean(row.sku||''),name=clean(row.item_name||row.description||''),desc=clean(row.description||row.item_name||'');
    const t=norm([sku,name,desc].join(' '));
    if(!t)return {type:'uncertain',reason:'No readable line-item evidence.'};

    // Specific tracked-item exception must run before generic stand exclusions.
    if(/\b(?:microphone|mic) stand(?:s)?\b/i.test(t))return {type:'equipment',reason:'Microphone stands are tracked inventory.'};

    // Warranty wording may be OCR-joined onto a real equipment row. Treat it as warranty-only
    // only when the row lacks strong equipment identity/economic evidence.
    const equipmentEvidence=/\b(?:projector|microphone|head(?:set)?\s+mic|speaker|controller|control panel|camera|mixer|display|monitor|transmitter|receiver|screen|wireless system|audio tester|amplifier|processor|switcher|visualizer|document camera|lighting controller|dmx[- ]?\d+)\b/i.test(t);
    const hasMoney=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v));
    const hasEconomics=Number(row.quantity)>0&&(hasMoney(row.unit_price)||hasMoney(row.amount));
    const warrantyEvidence=/\b(?:warranty|extended warranty|warranty cost|support coverage|support plan|maintenance plan|service contract|subscription)\b/i.test(t);
    if(warrantyEvidence&&!equipmentEvidence&&!hasEconomics)
      return {type:'warranty',reason:'Warranty/support coverage is not a separate inventory item.'};

    if(/\b(?:installation|installing|labou?r|service work|services? only|commissioning|testing and commission|delivery fee|delivery charge|courier|freight|transport|return trip|dismount|dismantle|relocation|reinstatement)\b/i.test(t)
       || /(?:INSTALLATION|LABOU?R|SERVICE|DELIVERY|FREIGHT|TRANSPORT|COURIER)/i.test(sku))
      return {type:'service',reason:'Service/labour/delivery rows are excluded from inventory.'};

    const accessory = /\b(?:power adapt(?:er|or)|ac adapt(?:er|or)|adapt(?:er|or)|security lock|projector lock|kensington lock|safety wire|safety cable|bracket|mounting bracket|speaker bracket|projector bracket|display bracket|ceiling mount|wall mount|lamp kit|replacement projector lamp|projector lamp|cart|trolley|cable|cord|patch lead|fly lead|fastener)\b/i.test(t)
      || /\b(?:cat\s*6a?|sftp|awg\s*\d*)\b[\s\S]{0,80}\b\d+(?:\.\d+)?\s*m\b/i.test(t)
      || (/\bstand(?:s)?\b/i.test(t)&&!/\b(?:microphone|mic) stand(?:s)?\b/i.test(t));
    if(accessory)return {type:'accessory',reason:'Configured accessory exclusion.'};

    if(equipmentEvidence)return {type:'equipment',reason:warrantyEvidence?'Tracked AV equipment row with attached warranty wording.':'Tracked AV equipment evidence.'};

    return {type:'uncertain',reason:'Physical inventory classification requires review.'};
  }

  function sourceRowId(source,page,table,row){return `${source||'src'}:P${page||1}:T${table||1}:R${row||1}`;}
  function field(value,meta={}){return {value:value===undefined?null:value,...meta};}
  function rowWithProvenance(row={},meta={}){
    const id=row.rowId||sourceRowId(meta.source,meta.page,meta.table,meta.row);
    const provenance=row.provenance||{};
    const mk=(k,v,col)=>provenance[k]||field(v,{source:meta.source||'unknown',page:meta.page||1,rowId:id,column:col||k,confidence:meta.confidence??null});
    const out={...row,rowId:id,source:meta.source||row.source||'unknown',page:meta.page||row.page||1,table:meta.table||row.table||1,row:meta.row||row.row||1};
    out.provenance={
      sku:mk('sku',out.sku,'SKU / model'),item_name:mk('item_name',out.item_name,'Description'),description:mk('description',out.description,'Description'),
      quantity:mk('quantity',out.quantity,'Qty'),unit_price:mk('unit_price',out.unit_price,'Unit price'),amount:mk('amount',out.amount,'Amount'),serials:mk('serials',out.serials,'Serial')
    };
    return out;
  }

  function headerColumns(page={}){
    const rows=(page.rows||[]).filter(r=>Array.isArray(r.items));
    let best=null;
    for(let i=0;i<rows.length;i++){
      const band=rows.filter(r=>Math.abs(Number(r.y||0)-Number(rows[i].y||0))<=20);
      const items=band.flatMap(r=>r.items||[]).map(x=>({...x,text:clean(x.text),label:clean(x.text).replace(/[^A-Za-z0-9]+$/g,'')})).filter(x=>x.text).sort((a,b)=>Number(a.x||0)-Number(b.x||0));
      const text=items.map(x=>x.label||x.text).join(' ');
      if(!/\bdescription\b/i.test(text)||!/\b(?:qty|quantity|units?)\b/i.test(text)||!/\b(?:price|unit price)\b/i.test(text)||!/\b(?:amount|total)\b/i.test(text))continue;
      const findX=(re)=>{const x=items.find(it=>re.test(it.label||it.text));return x?Number(x.x):null;};
      const cols={
        code:findX(/^(?:product|product no|sku|model|item|item no)$/i),
        description:findX(/^description$/i),
        qty:findX(/^(?:qty|quantity|units?)$/i),
        price:findX(/^(?:unit\s*)?price$/i),
        amount:findX(/^(?:amount|total)$/i),
        y:Math.max(...band.map(r=>Number(r.y||0)))
      };
      if(cols.description===null||cols.qty===null||cols.price===null||cols.amount===null)continue;
      const quality=[cols.description,cols.qty,cols.price,cols.amount].every(Number.isFinite)&&cols.description<cols.qty&&cols.qty<cols.price&&cols.price<cols.amount?10:1;
      if(!best||quality>best.quality)best={...cols,quality};
    }
    return best;
  }

  function inferLayoutColumns(page={}){
    const rows=(page.rows||[]).filter(r=>Array.isArray(r.items)&&r.items.length),all=rows.flatMap(r=>r.items||[]).filter(it=>Number.isFinite(Number(it.x)));
    if(!all.length)return null;
    const xs=all.map(it=>Number(it.x)),minX=Math.min(...xs),maxX=Math.max(...xs),width=Number(page.width)||Math.max(1,maxX-minX);
    const moneyItems=all.filter(it=>/^(?:SGD\s*|S?\$\s*)?\d[\d,]*[.]\d{2}$/i.test(clean(it.text))&&Number(it.x)>minX+width*.55);
    const cluster=(vals,tol=18)=>{const cs=[];for(const v of vals.sort((a,b)=>a-b)){let c=cs.find(x=>Math.abs(x.mean-v)<=tol);if(!c){c={values:[],mean:v};cs.push(c);}c.values.push(v);c.mean=c.values.reduce((a,b)=>a+b,0)/c.values.length;}return cs.sort((a,b)=>b.values.length-a.values.length);};
    const mcs=cluster(moneyItems.map(it=>Number(it.x))).filter(c=>c.values.length>=2).sort((a,b)=>a.mean-b.mean);
    if(!mcs.length)return null;
    const price=mcs[0].mean,amount=mcs.length>1?mcs[mcs.length-1].mean:null;
    const codeCandidates=all.filter(it=>Number(it.x)<minX+width*.25&&/^[A-Z0-9][A-Z0-9+._\/'-]{2,30}$/i.test(clean(it.text))&&!/^\d+$/.test(clean(it.text)));
    const descCandidates=all.filter(it=>Number(it.x)>=minX+width*.20&&Number(it.x)<minX+width*.60&&/[A-Za-z]{3}/.test(clean(it.text)));
    if(!codeCandidates.length||!descCandidates.length)return null;
    const code=cluster(codeCandidates.map(it=>Number(it.x)),12)[0]?.mean;
    const description=cluster(descCandidates.map(it=>Number(it.x)),18)[0]?.mean;
    if(!Number.isFinite(code)||!Number.isFinite(description)||!(code<description&&description<price))return null;
    const qty=description+(price-description)*.72;
    const amt=Number.isFinite(amount)&&amount>price+20?amount:price+(maxX-price)*.72;
    const maxAnchorY=Math.max(...rows.filter(r=>(r.items||[]).some(it=>Math.abs(Number(it.x)-code)<25)).map(r=>Number(r.y)||0),0);
    return {code,description,qty,price,amount:amt,y:maxAnchorY+20,quality:4,inferred:true};
  }

  function parseLayout(layout=[],source='pdf-layout'){
    const out=[];
    for(let p=0;p<(layout||[]).length;p++){
      const page=layout[p]||{},rows=(page.rows||[]).filter(r=>Array.isArray(r.items)&&r.items.length);
      const h=headerColumns(page)||inferLayoutColumns(page);if(!h)continue;
      // Numbered-table mode: some scanned invoices have Description/Qty/Unit Price/Total but no SKU column.
      if(h.code===null||!Number.isFinite(Number(h.code))){
        const body=rows.filter(r=>Number(r.y)<h.y).sort((a,b)=>Number(b.y)-Number(a.y));
        const qtyLeft=h.qty-Math.max(80,(h.price-h.qty)*.8), bQP=(h.qty+h.price)/2, bPA=(h.price+h.amount)/2;
        let nr=0;
        for(const r of body){
          const rowText=clean(r.text||'');if(/^(?:total\b|sub\s*total|subtotal|terms\s*&?\s*conditions)/i.test(rowText))break;
          const its=[...(r.items||[])].sort((a,b)=>Number(a.x)-Number(b.x));if(!its.length)continue;
          const first=clean(its[0].text).replace(/[^0-9]/g,'');if(!/^\d{1,3}$/.test(first))continue;
          const desc=clean(its.filter((it,idx)=>idx>0&&Number(it.x)<qtyLeft).map(it=>it.text).join(' ')).replace(/^[|\[]+/, '').trim();if(!desc)continue;
          const qvals=its.filter(it=>Number(it.x)>=qtyLeft&&Number(it.x)<bQP).map(it=>qtyNumber(it.text)).filter(v=>v!==null&&v<=999);
          const pvals=its.filter(it=>Number(it.x)>=bQP&&Number(it.x)<bPA).map(it=>money(it.text)).filter(Number.isFinite);
          const avals=its.filter(it=>Number(it.x)>=bPA).map(it=>money(it.text)).filter(Number.isFinite);
          const row=rowWithProvenance({sku:'',item_name:desc,description:desc,quantity:qvals[0]??null,unit_price:pvals.at(-1)??null,amount:avals.at(-1)??null,serials:''},{source,page:p+1,table:1,row:++nr});
          row.classification=classifyRow(row);out.push(row);
        }
        continue;
      }
      const bCD=(h.code+h.description)/2, qtyStart=h.qty-Math.max(10,(h.price-h.qty)*0.22), bQP=(h.qty+h.price)/2, bPA=(h.price+h.amount)/2;
      const body=rows.filter(r=>Number(r.y)<h.y).sort((a,b)=>Number(b.y)-Number(a.y));
      const anchors=[];
      for(const r of body){
        const left=(r.items||[]).filter(it=>Number(it.x)>=h.code-80&&Number(it.x)<bCD).map(it=>clean(it.text)).filter(Boolean).join(' ');
        const desc=(r.items||[]).filter(it=>Number(it.x)>=bCD&&Number(it.x)<qtyStart).map(it=>clean(it.text)).filter(Boolean).join(' ');
        const qTokens=(r.items||[]).filter(it=>Number(it.x)>=qtyStart&&Number(it.x)<bQP).map(it=>clean(it.text));
        const pTokens=(r.items||[]).filter(it=>Number(it.x)>=bQP&&Number(it.x)<bPA).map(it=>clean(it.text));
        const aTokens=(r.items||[]).filter(it=>Number(it.x)>=bPA).map(it=>clean(it.text));
        const hasEconomics=qTokens.some(x=>qtyNumber(x)!==null)||pTokens.some(x=>money(x)!==null)||aTokens.some(x=>money(x)!==null);
        const codeLike=left&&/^[A-Z0-9][A-Z0-9+._\/' -]{1,30}$/i.test(left)&&!/^\d+$/.test(left)&&!/^(?:DATE|TERMS|TOTAL|SUBTOTAL|SERIAL|WARRANTY)$/i.test(left);
        const numbered=/^\d{1,3}$/.test(left);
        if((codeLike&&desc)||(numbered&&desc)||(desc&&hasEconomics))anchors.push({r,left,desc});
      }
      const uniqAnchors=[];
      for(const a of anchors){if(uniqAnchors.every(u=>Math.abs(Number(u.r.y)-Number(a.r.y))>3))uniqAnchors.push(a);}
      uniqAnchors.sort((a,b)=>Number(b.r.y)-Number(a.r.y));
      for(let i=0;i<uniqAnchors.length;i++){
        const a=uniqAnchors[i], top=Number(a.r.y)+4, bottom=i+1<uniqAnchors.length?Number(uniqAnchors[i+1].r.y)+4:-Infinity;
        const group=body.filter(r=>Number(r.y)<=top&&Number(r.y)>bottom);
        const descParts=[];let qty=null,unitPrice=null,amount=null;const serials=[];
        for(const r of group){
          const full=clean((r.items||[]).map(it=>it.text).join(' '));
          const serialMatch=full.match(/(?:^|\s)(?:S\s*[/.-]?\s*N|S\.?N\.?|Serial(?:\s*(?:No\.?|Number))?)\s*[:#.-]?\s*(.+)$/i);
          if(serialMatch){serials.push(...extractSerialTail(serialMatch[1]));continue;}
          const desc=(r.items||[]).filter(it=>Number(it.x)>=bCD&&Number(it.x)<qtyStart).map(it=>clean(it.text)).filter(Boolean).join(' ');
          if(desc)descParts.push(desc);
          if(qty===null){for(const it of (r.items||[]).filter(it=>Number(it.x)>=qtyStart&&Number(it.x)<bQP)){const q=qtyNumber(it.text);if(q!==null&&q<=999){qty=q;break;}}}
          if(unitPrice===null){const vs=(r.items||[]).filter(it=>Number(it.x)>=bQP&&Number(it.x)<bPA).map(it=>money(it.text)).filter(Number.isFinite);if(vs.length)unitPrice=vs[vs.length-1];}
          if(amount===null){const vs=(r.items||[]).filter(it=>Number(it.x)>=bPA).map(it=>money(it.text)).filter(Number.isFinite);if(vs.length)amount=vs[vs.length-1];}
        }
        const rawLeft=clean(a.left);const sku=/^\d+$/.test(rawLeft)?'':rawLeft.replace(/\s+/g,'');
        const description=clean(descParts.join(' '));
        if(!description)continue;
        // Amount/price cross-check catches narrow OCR Qty glyphs (for example 5 read as 4).
        // The value remains explicitly marked as derived provenance rather than pretending it was read directly.
        let qtyDerived=false;if(unitPrice>0&&amount>=0){const r=amount/unitPrice,n=Math.round(r);if(n>=1&&n<=999&&Math.abs(r-n)<0.01&&(qty===null||Math.abs(qty-n)>0.001)){qty=n;qtyDerived=true;}}
        const row=rowWithProvenance({sku,item_name:description,description,quantity:qty,unit_price:unitPrice,amount,serials:serialList(serials).join(', ')},{source,page:p+1,table:1,row:i+1});
        if(qtyDerived)row.provenance.quantity={...row.provenance.quantity,source:'economic-cross-check',column:'derived amount÷unit price',confidence:0.8};
        row.classification=classifyRow(row);out.push(row);
      }
    }
    return out;
  }

  function parseEconomicTextRow(line=''){
    const raw=clean(line);if(!raw)return null;
    const matches=[...raw.matchAll(/(?:SGD\s*|S?\$\s*)?([0-9][0-9,]*(?:[.,][0-9]{2}))/gi)];
    if(matches.length<2)return null;
    const pMatch=matches[matches.length-2],aMatch=matches[matches.length-1];
    const unitPrice=money(pMatch[0]),amount=money(aMatch[0]);if(!Number.isFinite(unitPrice)||!Number.isFinite(amount))return null;
    // Text after the second money value must be punctuation/noise only; otherwise this is probably not a table row.
    if(clean(raw.slice((aMatch.index||0)+aMatch[0].length)).replace(/[|/\\,.;:'"`()\[\]{}<>+=_*~-]+/g,'').trim())return null;
    let left=clean(raw.slice(0,pMatch.index)).replace(/[|/$]+$/g,'').trim();
    left=left.replace(/^\s*\d{1,3}\s*[|\[]\s*/,'').trim(); // printed row number, not SKU
    let quantity=null,quantityDerived=false;
    let qm=left.match(/(?:^|\s)([0-9]{1,3}|[Iil|])\s*$/);
    if(qm){quantity=qtyNumber(qm[1]);left=clean(left.slice(0,qm.index));}
    if(unitPrice>0){const ratio=amount/unitPrice,n=Math.round(ratio);if(n>=1&&n<=999&&Math.abs(ratio-n)<0.015){if(quantity===null||Math.abs(quantity-n)>0.001){quantity=n;quantityDerived=true;}left=left.replace(/\s+(?:[-–—]|[A-Za-z]{1,2}|[\]|}])\s*$/,'').trim();}}
    if(!(quantity>0)||!left)return null;
    let sku='',description=left;
    // Fix only spacing that clearly split a model code at a hyphen boundary (e.g. PT-V W540 -> PT-VW540).
    description=description.replace(/^([A-Z0-9]{1,12}-[A-Z0-9]{0,8})\s+([A-Z]*\d+[A-Z0-9]*)(?=\s+[A-Za-z])/i,(m,a,b)=>a+b+' ');
    const first=description.match(/^([^\s]+)\s+(.+)$/);
    if(first){const tok=clean(first[1]).replace(/[,:;|]+$/,'');if(tok.length<=35&&/^[A-Z0-9][A-Z0-9+._\/'-]*$/i.test(tok)&&/\d/.test(tok)){sku=tok;description=clean(first[2]);}}
    return {sku,item_name:description,description,quantity,unit_price:unitPrice,amount,serials:'',quantityDerived};
  }

  function parseBareTextRow(line=''){
    let raw=clean(line);if(!raw)return null;
    raw=raw.replace(/^\s*\d{1,3}\s*[|\[]\s*/,'').trim();
    // Require an explicit model-like first token and a final quantity. This is intentionally conservative.
    const m=raw.match(/^([^\s]+)\s+(.+?)\s+([0-9]{1,3}|[Iil|])\s*[|.;:]*$/i);if(!m)return null;
    let sku=clean(m[1]).replace(/[,:;|]+$/,'');if(!/^[A-Z0-9][A-Z0-9+._\/'-]{1,34}$/i.test(sku)||!(/\d/.test(sku)||/-/.test(sku)))return null;
    const quantity=qtyNumber(m[3]);if(!(quantity>0))return null;
    const description=clean(m[2]);return {sku,item_name:description,description,quantity,unit_price:null,amount:null,serials:''};
  }

  function parseTextPage(text='',source='text-ocr',page=1){
    const lines=String(text||'').split(/\r?\n/).map(clean).filter(Boolean);const out=[];
    let inTable=false,rowN=0,current=null;
    const finish=()=>{if(!current)return;current.item_name=clean(current.item_name||current.description);current.description=clean(current.description||current.item_name);current.serials=serialList(current.serials).join(', ');current.classification=classifyRow(current);const wrapped=rowWithProvenance(current,{source,page,row:++rowN,table:1});if(current.quantityDerived)wrapped.provenance.quantity={...wrapped.provenance.quantity,source:'economic-cross-check',column:'derived amount÷unit price',confidence:0.8};out.push(wrapped);current=null;};
    const stop=/\b(?:sub\s*total|subtotal|gst\s*\d*%?|amount\s+due|grand\s+total|terms\s*&\s*conditions)\b/i;
    for(const line of lines){
      if(/\bdescription\b/i.test(line)&&/\b(?:qty|quantity|units?)\b/i.test(line)&&/\b(?:unit\s*)?price\b/i.test(line)){finish();inTable=true;continue;}
      if(!inTable)continue;
      if(stop.test(line)){finish();inTable=false;continue;}
      const serial=line.match(/^(?:S\s*[/.-]?\s*N|S\.?N\.?|Serial(?:\s*(?:No\.?|Number))?)\s*[:#.-]?\s*(.+)$/i);
      if(serial&&current){current.serials=[...(Array.isArray(current.serials)?current.serials:serialList(current.serials)),...extractSerialTail(serial[1])];continue;}
      if(/^Shipment\s+No\b/i.test(line))continue;
      const econ=parseEconomicTextRow(line);
      if(econ){finish();current=econ;continue;}
      const bare=parseBareTextRow(line);
      if(bare){finish();current=bare;continue;}
      if(current&&!/^(?:invoice|customer|date|ref\.|p\/o|salesman|terms)\b/i.test(line)){
        // Continuation is description/evidence only; isolated spec numbers are never promoted to Qty.
        if(!/^[\d,.]+$/.test(line)&&/[A-Za-z]{3}/.test(line))current.description=clean(current.description+' '+line);
      }
    }
    finish();return reassignOptionalSerials(out);
  }

  function parseText(text='',source='text-ocr',page=1){
    // Form-feed is the explicit page boundary used by the browser OCR recovery and test harness.
    // Keeping pages separate prevents rows/serials from different pages being merged into synthetic evidence.
    const pages=String(text||'').split(/\f/);
    if(pages.length<=1)return parseTextPage(text,source,page);
    const out=[];
    for(let i=0;i<pages.length;i++)out.push(...parseTextPage(pages[i],source,page+i));
    return out;
  }

  function rowMatchScore(a,b){
    let s=0;const sa=compact(a.sku||''),sb=compact(b.sku||'');if(sa&&sb){if(sa===sb)s+=8;else if(sa.replace(/[^A-Z0-9]/g,'')===sb.replace(/[^A-Z0-9]/g,''))s+=6;}
    const sim=similarity(a.description||a.item_name,b.description||b.item_name);s+=sim*5;
    if(Number(a.quantity)>0&&Number(b.quantity)>0&&Number(a.quantity)===Number(b.quantity))s+=3;
    if(Number.isFinite(Number(a.unit_price))&&Number.isFinite(Number(b.unit_price))&&Math.abs(Number(a.unit_price)-Number(b.unit_price))<0.02)s+=2;
    if(Number.isFinite(Number(a.amount))&&Number.isFinite(Number(b.amount))&&Math.abs(Number(a.amount)-Number(b.amount))<0.02)s+=2;
    return s;
  }

  function verifyIndependent(primary=[],secondary=[]){
    const used=new Set(),out=[];
    for(const p of primary||[]){
      let best=-1,bestScore=-1;for(let i=0;i<(secondary||[]).length;i++){if(used.has(i))continue;const sc=rowMatchScore(p,secondary[i]);if(sc>bestScore){bestScore=sc;best=i;}}
      const q=best>=0?secondary[best]:null;if(q&&bestScore>=6)used.add(best);
      const verified=q&&bestScore>=6;
      const r={...p,verification:{independentMatched:!!verified,score:round2(bestScore),secondaryRowId:q?.rowId||null,disagreements:[]}};
      if(verified){
        for(const k of ['sku','quantity','unit_price','amount']){
          const a=p[k],b=q[k],aMissing=a===null||a===undefined||a==='',bMissing=b===null||b===undefined||b==='';
          if(aMissing||bMissing){
            if(aMissing!==bMissing){r.verification.disagreements.push(k);if(k==='sku'){r.sku='';r.skuReviewRequired=true;}else if(k==='unit_price'||k==='amount'){r[k]=null;r[`${k}ReviewRequired`]=true;}}
            continue;
          }
          const same=typeof a==='number'||typeof b==='number'?Math.abs(Number(a)-Number(b))<0.02:compact(a)===compact(b);
          if(!same){r.verification.disagreements.push(k);if(k==='sku'){r.sku='';r.skuReviewRequired=true;}else if(k==='unit_price'||k==='amount'){r[k]=null;r[`${k}ReviewRequired`]=true;}}
        }
        const ps=serialList(p.serials),qs=serialList(q.serials);
        if(ps.length!==qs.length||ps.some(x=>!qs.some(y=>normalizeSerial(x)===normalizeSerial(y)))){if(ps.length||qs.length){r.verification.disagreements.push('serials');r.serials='';r.serialReviewRequired=true;}}
      }
      // Item identity + quantity are the required save facts. SKU, price, amount and serial are optional;
      // disagreement in an optional field blanks/flags that field instead of deleting a real equipment row.
      r.verification.coreVerified=!!verified&&!r.verification.disagreements.includes('quantity');
      r.needsReview=!r.verification.coreVerified||r.verification.disagreements.length>0;out.push(r);
    }
    return {rows:out,unmatchedSecondary:(secondary||[]).filter((_,i)=>!used.has(i))};
  }

  function serialIntegrity(rows=[]){
    const out=(rows||[]).map(r=>({...r,serials:serialList(r.serials).join(', ')})),seen=new Map(),conflicts=[];
    for(let i=0;i<out.length;i++){
      delete out[i].serialConflict;const ss=serialList(out[i].serials);
      for(const sn of ss){const k=normalizeSerial(sn);if(!k)continue;if(seen.has(k)&&seen.get(k)!==i){const j=seen.get(k);out[i].serialConflict=true;out[j].serialConflict=true;conflicts.push({serial:sn,rows:[out[j].rowId,out[i].rowId]});}else seen.set(k,i);}
      const q=Number(out[i].quantity);if(Number.isInteger(q)&&q>0&&ss.length>q)out[i].serialCountReview=true;
    }
    return {rows:out,conflicts};
  }

  function inventoryRows(rows=[]){return (rows||[]).filter(r=>(r.classification||classifyRow(r)).type==='equipment');}

  function completeness(rows=[]){
    const classified=(rows||[]).map(r=>({...r,classification:r.classification||classifyRow(r)}));
    const expected=classified.filter(r=>r.classification.type==='equipment');
    return {sourceRows:classified.length,expectedInventoryCount:expected.length,expectedRowIds:expected.map(r=>r.rowId),excluded:classified.filter(r=>r.classification.type!=='equipment').map(r=>({rowId:r.rowId,type:r.classification.type}))};
  }

  function validateAiShadow(aiRows=[],sourceText='',detRows=[]){
    const normalized=(aiRows||[]).map((r,i)=>rowWithProvenance({...r},{source:'ai-shadow',page:r.page||1,row:i+1,table:r.table||1}));
    const unsupported=[];
    for(const r of normalized){
      for(const k of ['sku','item_name','quantity','unit_price','amount','serials']){
        const v=r[k];if(v===null||v===undefined||v==='')continue;const evidence=clean(r?.provenance?.[k]?.sourceText||r?.sourceText||'');
        if(!evidence||!norm(sourceText).includes(norm(evidence)))unsupported.push({rowId:r.rowId,field:k,value:v});
      }
    }
    const comparison=verifyIndependent(detRows,normalized);
    return {enabled:false,mode:'shadow',rows:normalized,unsupported,comparison,canAutoApply:false};
  }


  function mergeLegacyItems(legacyItems=[],v7Rows=[]){
    const legacy=(legacyItems||[]).map(x=>({...x})), used=new Set();
    const safeV7=(v7Rows||[]).filter(r=>(r.classification||classifyRow(r)).type==='equipment'&&!r.serialConflict);
    for(let li=0;li<legacy.length;li++){
      const l=legacy[li];let best=-1,bestScore=-1;
      for(let i=0;i<safeV7.length;i++){
        if(used.has(i))continue;const sc=rowMatchScore(l,safeV7[i]);if(sc>bestScore){best=i;bestScore=sc;}
      }
      if(best<0||bestScore<5)continue;
      used.add(best);const r=safeV7[best], verified=!!(r.verification?.coreVerified??!r.needsReview);
      // V7 may correct economics only when independent evidence agrees. Descriptive fields are conservative.
      if(verified){
        if(Number(r.quantity)>0)l.quantity=Number(r.quantity);
        if(Number.isFinite(Number(r.unit_price)))l.unit_price=Number(r.unit_price);
        if(Number.isFinite(Number(r.amount)))l.amount=Number(r.amount);
        if(!r.serialReviewRequired&&serialList(r.serials).length)l.serials=serialList(r.serials).join(', ');
      }
      if(!clean(l.sku)&&clean(r.sku))l.sku=clean(r.sku);
      if(!clean(l.item_name)&&clean(r.item_name||r.description))l.item_name=clean(r.item_name||r.description);
      if(!clean(l.description)&&clean(r.description||r.item_name))l.description=clean(r.description||r.item_name);
      l.v7RowId=r.rowId;l.v7Provenance=r.provenance;l.v7Verified=verified;
      if(verified){delete l.quantityReviewRequired;delete l.priceReviewRequired;delete l.amountReviewRequired;}
    }
    for(let i=0;i<safeV7.length;i++){
      if(used.has(i))continue;const r=safeV7[i];
      // Recovery of a missing line requires independent agreement; a single extractor may only flag review.
      if(!(r.verification?.coreVerified??!r.needsReview))continue;
      legacy.push({sku:clean(r.sku),item_name:clean(r.item_name||r.description),description:clean(r.description||r.item_name),category:r.category||'',unit:r.unit||'pcs',quantity:Number(r.quantity),unit_price:r.unit_price??null,amount:r.amount??null,warranty:r.warranty||'',serials:r.serials||'',v7RowId:r.rowId,v7Provenance:r.provenance,v7Verified:true});
    }
    return legacy;
  }

  function prepareSave(rows=[]){
    const integrity=serialIntegrity(rows);const errors=[];
    for(const r of integrity.rows){
      if(!clean(r.item_name||r.description))errors.push({rowId:r.rowId,field:'item_name',message:'Item name is required.'});
      if(!(Number(r.quantity)>0))errors.push({rowId:r.rowId,field:'quantity',message:'Quantity must be greater than zero.'});
      if(r.serialConflict)errors.push({rowId:r.rowId,field:'serials',message:'Confirmed duplicate serial appears on another inventory row.'});
      // SKU, category, warranty, serial, price and amount stay optional.
    }
    return {ok:errors.length===0,rows:integrity.rows.map(r=>({...r,sku:clean(r.sku||''),serials:serialList(r.serials).join(', ')})),errors,conflicts:integrity.conflicts};
  }

  function choosePrimary({layout=[],texts=[]}={}){
    const layoutRows=parseLayout(layout,'pdf-layout');
    const textCandidates=(texts||[]).filter(x=>x&&x.text).map(x=>({source:x.source||'text',rows:parseText(x.text,x.source||'text',x.page||1),text:x.text}));
    const ranked=[{source:'pdf-layout',rows:layoutRows,text:''},...textCandidates].sort((a,b)=>{
      const qa=inventoryRows(a.rows).length*10+a.rows.filter(r=>Number(r.quantity)>0).length*2;
      const qb=inventoryRows(b.rows).length*10+b.rows.filter(r=>Number(r.quantity)>0).length*2;
      return qb-qa;
    });
    return {primary:ranked[0]||{source:'none',rows:[]},candidates:ranked};
  }

  function structuralInvoiceNumber(layout=[],texts=[]){
    const labelRe=/\b(?:tax\s+)?invoice\s*(?:no\.?|number|#)\s*[:#-]?\s*(.*)$/i;
    const cleanValue=v=>clean(v).replace(/^[\s:#-]+/,'').trim();
    for(const page of layout||[])for(const r of (page?.rows||[])){const items=[...(r.items||[])].sort((a,b)=>Number(a.x||0)-Number(b.x||0));for(let i=0;i<items.length;i++){const m=clean(items[i].text).match(labelRe);if(!m)continue;const inline=cleanValue(m[1]);if(inline)return {value:inline,source:'layout-label-inline',attempted:true};const x=Number(items[i].x||0),right=items.slice(i+1).filter(it=>Number(it.x||0)>x).map(it=>cleanValue(it.text)).find(Boolean);if(right)return {value:right,source:'layout-label-right',attempted:true};return {value:'',source:'layout-label-no-value',attempted:true};}}
    for(const src of texts||[]){const lines=String(src?.text||'').split(/\r?\n/).map(clean);for(let i=0;i<lines.length;i++){const m=lines[i].match(labelRe);if(!m)continue;const inline=cleanValue(m[1]);if(inline)return {value:inline,source:(src.source||'text')+':label-inline',attempted:true};const next=cleanValue(lines[i+1]||'');if(next)return {value:next,source:(src.source||'text')+':label-next-line',attempted:true};return {value:'',source:(src.source||'text')+':label-no-value',attempted:true};}}
    return {value:'',source:'not-found',attempted:false};
  }
  function toInventoryItem(r){return {sku:clean(r.sku||''),item_name:clean(r.item_name||r.description),description:clean(r.description||r.item_name),category:r.category||'',unit:r.unit||'pcs',quantity:r.quantity??null,unit_price:r.unit_price??null,amount:r.amount??null,warranty:r.warranty||'',serials:r.serials||'',rowId:r.rowId,provenance:r.provenance,verification:r.verification,needsReview:!!r.needsReview,serialConflict:!!r.serialConflict,serialCountReview:!!r.serialCountReview,serialReviewRequired:!!r.serialReviewRequired};}
  function enhanceParsed({parsed={},raw='',layout=[],evidenceSources=[]}={}){
    const texts=[...evidenceSources];if(raw&&!texts.some(x=>x.text===raw))texts.push({source:'raw',text:raw,page:1});
    const chosen=choosePrimary({layout,texts}),primary=chosen.primary.rows,secondaryCandidate=chosen.candidates.find(x=>x!==chosen.primary&&x.rows.length),secondary=secondaryCandidate?.rows||[];
    const verified=verifyIndependent(primary,secondary),serial=serialIntegrity(verified.rows),inv=inventoryRows(serial.rows),useV7=inv.length>0;
    const header=structuralInvoiceNumber(layout,texts),doc={...(parsed.doc||{})};if(header.attempted)doc.invoice_number=header.value||'';
    const items=useV7?inv.map(toInventoryItem):(parsed.items||[]);
    return {...parsed,doc,items,v7:{globalRules:GLOBAL_RULES,mode:useV7?'primary':'legacy-fallback',sourceParser:chosen.primary.source,secondaryParser:secondaryCandidate?.source||null,sourceRows:chosen.primary.rows,verification:verified,serialIntegrity:serial,completeness:completeness(chosen.primary.rows),invoiceNumberEvidence:header,promoted:useV7,mergeMode:useV7?'v7-source-of-truth':'legacy-emergency-fallback',fallbackUsed:!useV7,fallbackReason:useV7?'':'V7 produced no verified equipment rows.'}};
  }

  return {GLOBAL_RULES,clean,norm,compact,money,qtyNumber,normalizeSerial,extractSerialTail,serialList,reassignOptionalSerials,classifyRow,sourceRowId,rowWithProvenance,headerColumns,inferLayoutColumns,parseLayout,parseText,rowMatchScore,verifyIndependent,serialIntegrity,inventoryRows,completeness,validateAiShadow,mergeLegacyItems,prepareSave,choosePrimary,structuralInvoiceNumber,enhanceParsed};
});
