/* V4.1.1 Shadow Fixes 1-5
 * 1 missing-row recovery
 * 2 printed SKU/model recovery
 * 3 strict row-local evidence binding
 * 4 field completeness recovery
 * 5 source-based completeness gate
 *
 * SHADOW ONLY: this module is not loaded by app.js.
 */
(function(root){
  'use strict';
  const VERSION='4.1.1-shadow-fixes1-5-r1';
  const clean=v=>String(v??'').normalize('NFKC').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const key=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const linesOf=v=>String(v||'').replace(/\r/g,'\n').split(/\n+/).map(clean).filter(Boolean);
  const EQUIPMENT=/\b(?:projector|visuali[sz]er|document\s+camera|camera|microphone|wireless|transmitter|receiver|speaker|loudspeaker|monitor|mixer|console|amplifier|processor|controller|control\s+panel|display|screen|player|receptacle|tester|switcher|matrix|scaler|nvr|dvr|ideahub|trolley|rolling\s+stand|av\s+cart)\b/i;
  const SERVICE=/\b(?:labou?r|installation\s+(?:work|service)|service\s+(?:fee|charge|work)|dismantl(?:e|ing|ed)|dismount|relocat(?:e|ion|ing)|re-?instat(?:e|ement|ing)|repair(?:ing|ed)?|testing\s+and\s+commissioning|commissioning|programming|training|delivery\s+(?:fee|service|charge)|freight|courier|transport\s+fee)\b/i;
  const ACCESSORY=/\b(?:security\s+lock|safety\s+wire|mounting\s+bracket|bracket|cable|lamp\s+kit|cart|trolley|stand|mount)\b/i;
  const CORE_EQUIPMENT=/\b(?:projector|visuali[sz]er|document\s+camera|camera|microphone|wireless|transmitter|receiver|speaker|loudspeaker|monitor|mixer|console|amplifier|processor|controller|control\s+panel|display|screen|player|receptacle|tester|switcher|matrix|scaler|nvr|dvr|ideahub)\b/i;
  const META=/\b(?:tax\s+invoice|invoice\s*(?:no|number|date)?|customer|sold\s+to|bill\s+to|ship\s+to|delivered\s+to|attention|attn\.?|company\s+reg|gst\s+reg|uen|address|telephone|tel\.?|fax|e-?mail|email|website|reference|ref\.?\s*no|p\/?o\s*no|purchase\s+order|delivery\s+order|quotation|payment\s+advice|subtotal|sub\s+total|amount\s+due|invoice\s+total|grand\s+total|total\s+local|page\s+\d+|warranty|in\s+stock|signature|company\s+stamp)\b/i;
  const PROHIBITED_TITLE=/^(?:PURCHASE\s+ORDER|DELIVERY\s+ORDER|DELIVERY\s+NOTE|DELIVERY\s+SLIP|PACKING\s*\/?\s*DELIVERY\s+SLIP|PACKING\s+LIST|QUOTATION|QUOTE|PRO\s*FORMA\s+INVOICE|PROFORMA\s+INVOICE|SERVICE\s+REPORT|SERVICE\s+INVOICE|CREDIT\s+NOTE|DEBIT\s+NOTE|STATEMENT)\b/i;

  function moneyTokens(text=''){
    const out=[];
    for(const m of String(text).matchAll(/(?<![A-Za-z0-9])(?:SGD\s*)?(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})(?!\d)/gi)){
      const n=Number((m[1]+'.'+m[2]).replace(/,/g,''));
      if(Number.isFinite(n))out.push({raw:m[0],value:n,index:m.index||0});
    }
    return out;
  }
  function numberTokens(text=''){
    return [...String(text).matchAll(/(?<![A-Za-z0-9])(\d+(?:\.\d{1,2})?)(?![A-Za-z0-9])/g)]
      .map(m=>({raw:m[1],value:Number(m[1]),index:m.index||0}))
      .filter(x=>Number.isFinite(x.value));
  }
  function plausibleSku(v=''){
    const s=clean(v).replace(/^[,;:()[\]{}]+|[,;:()[\]{}]+$/g,'');
    if(s.length<3||s.length>42||/\s/.test(s))return false;
    if(!/^[A-Z0-9][A-Z0-9+._\/-]*$/i.test(s))return false;
    if(!/[A-Za-z]/.test(s)||!/\d/.test(s))return false;
    if(/^(?:SGD|GST|UEN|S\/N|SN|QTY|DATE|PAGE|INV|INVOICE)$/i.test(s))return false;
    if(/^\d+(?:\.\d+)?$/.test(s))return false;
    if(/^\d+(?:\.\d+)?(?:GHZ|MHZ|KHZ|HZ)$/i.test(s))return false;
    if(/^[0-9OILSB$.,]+$/i.test(s)&&/[.,]\d{2}$/.test(s))return false;
    return true;
  }
  function isAddress(text=''){
    const s=clean(text);
    return /\bsingapore\s*\d{5,6}\b/i.test(s)
      ||/#\s*\d{1,3}\s*[-/]\s*\d{1,5}\b/.test(s)
      ||/\b\d{1,4}\s+[A-Za-z][A-Za-z0-9 .'-]{1,70}\s+(?:road|rd\.?|street|st\.?|avenue|ave\.?|drive|dr\.?|lane|ln\.?|crescent|cres\.?|close|way|walk|place|plaza|boulevard|terrace|industrial\s+park|centre|center)\b/i.test(s);
  }
  function isMetadata(text=''){
    const s=clean(text);
    return !s||isAddress(s)||META.test(s)||/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(s);
  }
  function isPureService(text=''){
    const s=clean(text);
    if(!SERVICE.test(s))return false;
    // "Supply & Install <physical equipment>" is a purchased object, not service-only.
    if(/^(?:supply|provide)\s*(?:&|and)?\s*install\b/i.test(s)&&EQUIPMENT.test(s)&&!/\b(?:labou?r|cabling|wiring|testing|commissioning|training)\b/i.test(s))return false;
    return true;
  }
  function isAccessoryOnly(text=''){
    const s=clean(text);
    if(!ACCESSORY.test(s))return false;
    return !CORE_EQUIPMENT.test(s);
  }
  function isPhysical(text=''){
    const s=clean(text);
    return !!s&&EQUIPMENT.test(s)&&!isMetadata(s)&&!isPureService(s)&&!isAccessoryOnly(s);
  }
  function pageAuthority(text=''){
    const ls=linesOf(text).slice(0,120);
    const titles=ls.map(clean);
    if(titles.some(x=>PROHIBITED_TITLE.test(x)))return 'reject';
    if(titles.some(x=>/\bTAX\s+INVOICE\b/i.test(x))||titles.some(x=>/^INVOICE\b/i.test(x)))return 'invoice';
    return 'unknown';
  }
  function splitPages(text=''){
    const raw=String(text||'');
    const chunks=raw.split(/(?:\f|\n\s*<PARSED\s+TEXT\s+FOR\s+PAGE:\s*\d+\s*\/\s*\d+>\s*\n|\n\s*={3,}\s*PAGE\s+\d+\s*={3,}\s*\n)/i).filter(x=>clean(x));
    return chunks.length?chunks:[raw];
  }
  function invoiceText(text=''){
    const pages=splitPages(text);
    const accepted=pages.filter(p=>pageAuthority(p)==='invoice');
    return accepted.length?accepted.join('\n'):text;
  }
  function economicLineScore(line=''){
    const money=moneyTokens(line),nums=numberTokens(line);
    let score=0;
    if(money.length>=2)score+=8;
    if(money.length>=1)score+=3;
    if(nums.some(x=>x.value>0&&x.value<=999))score+=2;
    if(EQUIPMENT.test(line))score+=3;
    if(isMetadata(line)||isPureService(line))score-=8;
    return score;
  }
  function amountAnchors(lines=[]){
    const out=[];
    for(let i=0;i<lines.length;i++){
      const line=lines[i],money=moneyTokens(line);
      if(money.length<1)continue;
      const score=economicLineScore(line);
      if(score<3)continue;
      out.push({index:i,line,money,score});
    }
    return out;
  }
  function blockFromAnchor(lines,anchor,prevAnchor,nextAnchor){
    let lo=anchor.index,hi=anchor.index;
    const prev=prevAnchor?.index??-1,next=nextAnchor?.index??lines.length;
    for(let d=1;d<=6&&anchor.index-d>prev;d++){
      const s=lines[anchor.index-d];
      if(PROHIBITED_TITLE.test(s)||/\b(?:SUBTOTAL|AMOUNT\s+DUE|INVOICE\s+TOTAL|GRAND\s+TOTAL)\b/i.test(s))break;
      lo=anchor.index-d;
      if(isPhysical(s)||/\b(?:MODEL|SKU|PRODUCT\s+NO|S\/N|SN)\b/i.test(s))continue;
      if(isMetadata(s)&&!/\b(?:WARRANTY|IN\s+STOCK)\b/i.test(s))break;
    }
    for(let d=1;d<=5&&anchor.index+d<next;d++){
      const s=lines[anchor.index+d];
      if(/\b(?:SUBTOTAL|AMOUNT\s+DUE|INVOICE\s+TOTAL|GRAND\s+TOTAL)\b/i.test(s))break;
      if(amountAnchors([s]).length)break;
      hi=anchor.index+d;
      if(isMetadata(s)&&!/\b(?:WARRANTY|IN\s+STOCK|S\/N|SN)\b/i.test(s))break;
    }
    return {start:lo,end:hi,lines:lines.slice(lo,hi+1),anchor:anchor.index};
  }
  function numberedBlocks(lines=[]){
    const starts=[];
    for(let i=0;i<lines.length;i++){
      const m=lines[i].match(/^[\[\]{}|()\s]*([1-9]\d?)\s*[|.)\-:]?\s+(.+)/);
      if(m)starts.push({ordinal:Number(m[1]),index:i});
    }
    const out=[];
    for(let i=0;i<starts.length;i++){
      const st=starts[i],end=(starts[i+1]?.index??lines.length)-1;
      out.push({start:st.index,end,ordinal:st.ordinal,lines:lines.slice(st.index,end+1)});
    }
    return out;
  }
  function normalizeBlock(b,index){
    const text=b.lines.join('\n');
    return {...b,id:'B'+String(index+1).padStart(2,'0'),text};
  }
  function rowOrdinal(line=''){
    const m=clean(line).match(/^[\[\]{}|()\s]*([1-9]\d?)\s*[|.)\-:]?\s+/);
    return m?Number(m[1]):null;
  }
  function sequentialItemBlocks(lines=[]){
    const out=[];let cur=null;
    const close=()=>{if(cur&&cur.lines.some(x=>isPhysical(x)&&!isAccessoryOnly(x))){cur.end=cur.start+cur.lines.length-1;out.push(cur);}cur=null;};
    for(let i=0;i<lines.length;i++){
      const line=lines[i],physical=isPhysical(line)&&!ACCESSORY.test(line),service=isPureService(line),accessory=isAccessoryOnly(line);
      const totals=/\b(?:SUBTOTAL|SUB\s+TOTAL|AMOUNT\s+DUE|INVOICE\s+TOTAL|GRAND\s+TOTAL|TOTAL\s+LOCAL|PAYMENT\s+ADVICE)\b/i.test(line);
      if(PROHIBITED_TITLE.test(line)||totals){close();continue;}
      if(service||accessory){if(cur&&cur.seenEconomics)close();continue;}
      const ord=rowOrdinal(line);
      if(physical){
        if(cur){
          const newOrdinal=ord!==null&&cur.ordinal!==null&&ord!==cur.ordinal;
          const lineIds=(line.match(/[A-Z0-9][A-Z0-9+._\/-]{2,41}/gi)||[]).filter(plausibleSku);
          const curIds=(cur.lines.join(' ').match(/[A-Z0-9][A-Z0-9+._\/-]{2,41}/gi)||[]).filter(plausibleSku);
          const independentIdentityBoundary=!cur.seenEconomics&&lineIds.length>0&&curIds.length>0;
          if(cur.seenEconomics||newOrdinal||independentIdentityBoundary){close();}
        }
        if(!cur)cur={start:i,end:i,ordinal:ord,lines:[],seenEconomics:false,sequential:true};
      }
      if(!cur)continue;
      // A fresh numbered row is always a hard boundary, even when the previous OCR lost economics.
      if(ord!==null&&cur.lines.length&&cur.ordinal!==null&&ord!==cur.ordinal){
        close();
        if(physical)cur={start:i,end:i,ordinal:ord,lines:[],seenEconomics:false,sequential:true};
        else continue;
      }
      cur.lines.push(line);
      if(amountAnchors([line]).length)cur.seenEconomics=true;
      if(cur.lines.length>=14)close();
    }
    close();
    return out;
  }
  function sourceBlocks(raw=''){
    const text=invoiceText(raw),lines=linesOf(text);
    const anchors=amountAnchors(lines);
    const candidates=[...sequentialItemBlocks(lines)];
    for(let i=0;i<anchors.length;i++)candidates.push(blockFromAnchor(lines,anchors[i],anchors[i-1],anchors[i+1]));
    for(const b of numberedBlocks(lines)){
      if(b.lines.some(x=>isPhysical(x)&&!isAccessoryOnly(x))&&moneyTokens(b.lines.join(' ')).length)candidates.push(b);
    }
    // Add description-anchored candidates so table layouts with economics on the next line
    // are not dependent on a money token being on the description line.
    const physicalIdx=[];
    for(let i=0;i<lines.length;i++)if(isPhysical(lines[i])&&!isAccessoryOnly(lines[i]))physicalIdx.push(i);
    for(let p=0;p<physicalIdx.length;p++){
      const idx=physicalIdx[p],next=physicalIdx[p+1]??lines.length;
      let lo=Math.max(0,idx-1),hi=idx;
      while(lo<idx&&isMetadata(lines[lo])&&!plausibleSku((lines[lo].match(/[A-Z0-9][A-Z0-9+._\/-]{2,41}/i)||[])[0]||''))lo++;
      for(let j=idx+1;j<Math.min(next,idx+9);j++){
        const s=lines[j];
        if(/\b(?:SUBTOTAL|AMOUNT\s+DUE|INVOICE\s+TOTAL|GRAND\s+TOTAL)\b/i.test(s))break;
        hi=j;
        if(amountAnchors([s]).length)break;
      }
      candidates.push({start:lo,end:hi,lines:lines.slice(lo,hi+1),anchor:idx,physicalAnchor:true});
    }
    candidates.sort((a,b)=>a.start-b.start||a.end-b.end);
    const merged=[];
    for(const b of candidates){
      const text=b.lines.join(' ');
      const physicalLines=b.lines.filter(x=>isPhysical(x)&&!isAccessoryOnly(x));
      if(!physicalLines.length||isPureService(physicalLines.join(' ')))continue;
      if(isAccessoryOnly(physicalLines.join(' ')))continue;
      const overlap=merged.find(x=>Math.max(x.start,b.start)<=Math.min(x.end,b.end));
      if(overlap){
        // Prefer the sequential block because it respects item/economics boundaries.
        if(b.sequential&&!overlap.sequential){overlap.start=b.start;overlap.end=b.end;overlap.lines=b.lines;overlap.ordinal=b.ordinal;overlap.sequential=true;}
        continue;
      }
      merged.push({...b});
    }
    return merged.map(normalizeBlock);
  }
  function explicitIdentity(blockText=''){
    const ls=linesOf(blockText),votes=[],eligible=[];let serialMode=false;
    for(const line of ls){
      if(/\b(?:S\/N|SN|SERIAL(?:\s*NO\.?)?)\s*[:#-]?/i.test(line)){serialMode=true;continue;}
      if(serialMode){
        if(moneyTokens(line).length||isPhysical(line)||/\b(?:WARRANTY|IN\s+STOCK)\b/i.test(line))serialMode=false;
        else continue;
      }
      eligible.push(line);
      const m=line.match(/\b(?:MODEL(?:\s*(?:NO\.?|NUMBER))?|SKU|PRODUCT\s*(?:NO\.?|NUMBER)|PART\s*(?:NO\.?|NUMBER))\b\s*(?::|#|-)?\s*(.+)$/i);
      if(m){
        const toks=(m[1].match(/[A-Z0-9][A-Z0-9+._\/-]{2,41}/gi)||[]).filter(plausibleSku);
        if(toks.length)votes.push({value:toks[toks.length-1],line,rank:100});
      }
    }
    for(const line of eligible){
      const textTokens=(line.match(/[A-Z0-9][A-Z0-9+._\/-]{2,41}/gi)||[]).filter(plausibleSku);
      for(const t of textTokens){
        let rank=10;
        if(EQUIPMENT.test(line))rank+=30;
        if(new RegExp('^\\s*'+t.replace(/[.*+?^$()|[\]{}\\]/g,'\\  function explicitIdentity(blockText=''){
    const ls=linesOf(blockText),votes=[];
    for(const line of ls){
      const m=line.match(/\b(?:MODEL(?:\s*(?:NO\.?|NUMBER))?|SKU|PRODUCT\s*(?:NO\.?|NUMBER)|PART\s*(?:NO\.?|NUMBER))\b\s*(?::|#|-)?\s*(.+)$/i);
      if(m){
        const toks=(m[1].match(/[A-Z0-9][A-Z0-9+._\/-]{2,41}/gi)||[]).filter(plausibleSku);
        if(toks.length)votes.push({value:toks[toks.length-1],line,rank:100});
      }
    }
    const textTokens=(String(blockText).match(/[A-Z0-9][A-Z0-9+._\/-]{2,41}/gi)||[]).filter(plausibleSku);
    for(const t of textTokens){
      if(/\b(?:S\/N|SN|SERIAL)\b/i.test(ls.find(x=>x.includes(t))||''))continue;
      let rank=10;
      const line=ls.find(x=>x.includes(t))||'';
      if(EQUIPMENT.test(line))rank+=30;
      if(/^[A-Z0-9+._\/-]+\b/i.test(line))rank+=10;
      if(/\b(?:MODEL|SKU|PRODUCT\s+NO)\b/i.test(line))rank+=40;
      votes.push({value:t,line,rank});
    }
    votes.sort((a,b)=>b.rank-a.rank);
    return votes[0]||{value:'',line:'',rank:0};
  }')+'\\b','i').test(line))rank+=14;
        if(/\b(?:MODEL|SKU|PRODUCT\s+NO)\b/i.test(line))rank+=40;
        votes.push({value:t,line,rank});
      }
    }
    votes.sort((a,b)=>b.rank-a.rank);
    return votes[0]||{value:'',line:'',rank:0};
  }
  function economics(blockText=''){
    const ls=linesOf(blockText);
    let best=null;
    for(const line of ls){
      const money=moneyTokens(line);
      if(!money.length)continue;
      const ordinalMatch=line.match(/^[\[\]{}|()\s]*([1-9]\d?)\s*[|.)\-:]?\s+/);
      const ordinal=ordinalMatch?Number(ordinalMatch[1]):null;
      const nums=numberTokens(line);
      let qCandidates=nums.filter(x=>x.value>0&&x.value<=999&&!money.some(m=>x.index>=m.index&&x.index<m.index+String(m.raw).length));
      if(ordinal!==null){
        const ordinalEnd=(ordinalMatch?.[0]||'').length;
        qCandidates=qCandidates.filter(x=>!(x.value===ordinal&&x.index<ordinalEnd));
      }
      let unit=null,amount=null,q=null;
      if(money.length>=3&&money[0].value>0&&money[0].value<=999&&Number.isInteger(money[0].value)){
        unit=money[money.length-2].value;amount=money[money.length-1].value;
        const derived=unit?amount/unit:null;
        if(derived!==null&&Math.abs(derived-money[0].value)<=0.001)q=money[0].value;
      }else if(money.length>=2){unit=money[money.length-2].value;amount=money[money.length-1].value;}
      else if(money.length===1){amount=money[0].value;}
      if(q===null&&unit!==null&&amount!==null){
        const derived=amount/unit;
        const exact=qCandidates.find(x=>Math.abs(x.value-derived)<=0.001);
        if(exact)q=exact.value;
      }
      if(q===null&&qCandidates.length)q=qCandidates[qCandidates.length-1].value;
      const calc=(q&&unit!==null&&amount!==null)?Math.abs(q*unit-amount):Infinity;
      const score=(money.length>=2?10:4)+(q?4:0)+(calc<=Math.max(.1,(amount||1)*.015)?8:0)+economicLineScore(line);
      if(!best||score>best.score)best={quantity:q,unit_price:unit,amount,sourceLine:line,score};
    }
    return best||{quantity:null,unit_price:null,amount:null,sourceLine:'',score:0};
  }
  function description(blockText=''){
    const ls=linesOf(blockText);
    const ranked=[];
    for(const original of ls){
      if(isMetadata(original)||/^\s*(?:MODEL|SKU|PRODUCT\s+NO|S\/N|SN)\b/i.test(original))continue;
      let line=original
        .replace(/^[\[\]{}|()\s]*[1-9]\d?\s*[|.)\-:]?\s+/,'')
        .replace(/\b(?:MODEL(?:\s*(?:NO\.?|NUMBER))?|SKU|PRODUCT\s*(?:NO\.?|NUMBER)|PART\s*(?:NO\.?|NUMBER))\b\s*(?::|#|-)?\s*[A-Z0-9][A-Z0-9+._\/-]{2,41}/ig,' ')
        .replace(/(?:SGD\s*)?\d+(?:,\d{3})*\.\d{2}/g,' ')
        .replace(/\b\d+(?:\.\d{1,2})?\b\s*$/g,' ')
        .replace(/\s+/g,' ').trim();
      if(!line||isMetadata(line))continue;
      let score=0;if(EQUIPMENT.test(line))score+=10;if(isPureService(line))score-=12;
      score+=Math.min(8,line.split(/\s+/).length/2);
      if(score>0)ranked.push({line,score});
    }
    ranked.sort((a,b)=>b.score-a.score||b.line.length-a.line.length);
    return ranked[0]?.line||'';
  }
  function serials(blockText=''){
    const out=[];
    for(const line of linesOf(blockText)){
      const m=line.match(/\b(?:S\/N|SN|SERIAL(?:\s*NO\.?)?)\s*[:#-]?\s*(.+)$/i);
      if(!m)continue;
      for(const t of m[1].split(/[,;]\s*/).map(clean).filter(Boolean))if(!/^N\/?A$/i.test(t))out.push(t);
    }
    return [...new Set(out)];
  }
  function parseBlock(block){
    const identity=explicitIdentity(block.text),econ=economics(block.text),name=description(block.text);
    return {
      sourceBlockId:block.id,
      sourceRange:[block.start,block.end],
      sourceText:block.text,
      sku:identity.value,
      model:identity.value,
      item_name:name,
      description:name,
      quantity:econ.quantity,
      unit_price:econ.unit_price,
      amount:econ.amount,
      serials:serials(block.text),
      evidence:{identity:identity.line,economics:econ.sourceLine},
      review:[]
    };
  }
  function presentInBlock(value,blockText){const k=key(value);return !k||key(blockText).includes(k);}
  function printedIdentityInBlock(blockText=''){return explicitIdentity(blockText).value;}
  function sourceCompleteness(block,row){
    const issues=[];
    const printed=printedIdentityInBlock(block.text);
    if(printed&&!row.sku)issues.push('printed-identity-missing');
    if(row.sku&&!presentInBlock(row.sku,block.text))issues.push('cross-row-identity-contamination');
    const econ=economics(block.text);
    if(econ.quantity!==null&&row.quantity===null)issues.push('quantity-missing');
    if(econ.unit_price!==null&&row.unit_price===null)issues.push('unit-price-missing');
    if(econ.amount!==null&&row.amount===null)issues.push('amount-missing');
    if(!row.item_name)issues.push('description-missing');
    return issues;
  }
  function recoverMissingFields(row,block){
    const next={...row,review:[...(row.review||[])]},identity=explicitIdentity(block.text),econ=economics(block.text);
    if(!next.sku&&identity.value){next.sku=identity.value;next.model=identity.value;next.evidence={...(next.evidence||{}),identity:identity.line};}
    if(next.quantity===null&&econ.quantity!==null)next.quantity=econ.quantity;
    if(next.unit_price===null&&econ.unit_price!==null)next.unit_price=econ.unit_price;
    if(next.amount===null&&econ.amount!==null)next.amount=econ.amount;
    if(!next.item_name){next.item_name=description(block.text);next.description=next.item_name;}
    return next;
  }
  function run(raw='',opts={}){
    const blocks=sourceBlocks(raw);
    const rows=blocks.map(parseBlock).map((r,i)=>recoverMissingFields(r,blocks[i]));
    const failures=[];
    for(let i=0;i<blocks.length;i++){
      const issues=sourceCompleteness(blocks[i],rows[i]);
      if(issues.length){rows[i].review=[...new Set([...(rows[i].review||[]),...issues])];for(const issue of issues)failures.push({blockId:blocks[i].id,issue});}
    }
    const uniqueBlockIds=new Set(rows.map(r=>r.sourceBlockId));
    if(uniqueBlockIds.size!==rows.length)failures.push({issue:'source-block-reused'});
    const sourceBlockCount=blocks.length,outputRowCount=rows.length;
    const sourceInvoiceText=invoiceText(raw);
    const physicalCueCount=linesOf(sourceInvoiceText).filter(x=>isPhysical(x)&&!isAccessoryOnly(x)).length;
    if(sourceBlockCount===0&&physicalCueCount>0)failures.push({issue:'no-source-blocks-detected',physicalCueCount});
    if(sourceBlockCount!==outputRowCount)failures.push({issue:'row-count-mismatch',sourceBlockCount,outputRowCount});
    const printedIdentityCount=blocks.filter(b=>printedIdentityInBlock(b.text)).length;
    const recoveredPrintedIdentityCount=blocks.filter((b,i)=>printedIdentityInBlock(b.text)&&rows[i]?.sku).length;
    const metrics={
      sourceBlockCount,outputRowCount,
      rowRecall:sourceBlockCount?outputRowCount/sourceBlockCount:(physicalCueCount?0:1),
      printedIdentityCount,recoveredPrintedIdentityCount,
      printedIdentityRecall:printedIdentityCount?recoveredPrintedIdentityCount/printedIdentityCount:1,
      incompleteFieldCount:failures.filter(x=>/missing$/.test(x.issue||'')).length,
      crossRowContaminationCount:failures.filter(x=>x.issue==='cross-row-identity-contamination').length
    };
    return {version:VERSION,mode:'shadow',blocks,rows,failures,metrics,ready:failures.length===0};
  }
  function selfTest(){
    const sample=[
      'TAX INVOICE',
      '1 Digital Mixer console Model: CQ12T 1 1400.00 1400.00',
      '2 Passive Loudspeaker Model: ZX1I-90 6 800.00 4800.00',
      '3 Labour to install equipment 1 200.00 200.00',
      'SUBTOTAL 6400.00'
    ].join('\n');
    const r=run(sample),f=[];
    if(r.rows.length!==2)f.push('service row filtering / row recovery');
    if(!r.rows.some(x=>x.sku==='CQ12T'))f.push('CQ12T');
    if(!r.rows.some(x=>x.sku==='ZX1I-90'))f.push('ZX1I-90');
    if(r.rows.find(x=>x.sku==='ZX1I-90')?.quantity!==6)f.push('numbered-row quantity');
    if(r.rows.some(x=>!x.item_name))f.push('description recovery');
    if(r.metrics.crossRowContaminationCount)f.push('cross-row');
    if(!r.ready||r.failures.length)f.push('shadow readiness gate');
    return {ok:!f.length,failures:f,metrics:r.metrics};
  }
  root.InventoryHubV411Fixes1to5Shadow=Object.freeze({
    VERSION,sourceBlocks,explicitIdentity,economics,description,parseBlock,recoverMissingFields,sourceCompleteness,run,selfTest
  });
})(typeof window!=='undefined'?window:globalThis);
