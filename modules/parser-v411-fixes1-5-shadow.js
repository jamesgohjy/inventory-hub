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
  const VERSION='4.1.1-shadow-fixes1-10-r11-regression';
  const clean=v=>String(v??'').normalize('NFKC').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const ocrLex=v=>clean(v)
    .replace(/\bSPEAKA\b/ig,'speaker')
    .replace(/\bCONFIOL\b/ig,'control')
    .replace(/\bPROJCC?TOR\b/ig,'projector')
    .replace(/\bWONK\b/ig,'work')
    .replace(/\bBRACKCT\b/ig,'bracket');
  const key=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const linesOf=v=>String(v||'').replace(/\r/g,'\n').split(/\n+/).map(clean).filter(Boolean);
  const EQUIPMENT=/\b(?:projectors?|visuali[sz]ers?|document\s+cameras?|cameras?|microphones?|mics?|wireless|transmitters?|receivers?|speakers?|loudspeakers?|monitors?|mixers?|consoles?|amplifiers?|processors?|controllers?|control\s+panels?|displays?|screens?|players?|receptacles?|testers?|switchers?|matri(?:x|ces)|scalers?|nvr|dvr|ideahub|ideashare\s+key|presentation\s+(?:key|dongle)|trolleys?|rolling\s+stands?|av\s+carts?)\b/i;
  const SERVICE=/\b(?:labou?r|installation\s+(?:work|service)|service\s+(?:fee|charge|work)|dismantl(?:e|ing|ed)|dismount|relocat(?:e|ion|ing)|re-?instat(?:e|ement|ing)|repair(?:ing|ed)?|testing\s+and\s+commissioning|commissioning|programming|training|delivery\s+(?:fee|service|charge)|freight|courier|transport\s+fee)\b/i;
  const SERVICE_CODE=/^(?:[A-Z0-9]+[-_/])?(?:INSTALLATION|INSTALL|LABOU?R|SERVICE|DELIVERY|FREIGHT|DISMANTLE|DISMOUNT|RELOCATE|REINSTATE|RE-INSTATE|REPAIR|TESTING|COMMISSIONING)\b/i;
  const ACCESSORY=/\b(?:security\s+lock|safety\s+wire|mounting\s+bracket|bracket|cable|lamp\s+kit|cart|trolley|stand|mount)\b/i;
  const CORE_EQUIPMENT=/\b(?:projectors?|visuali[sz]ers?|document\s+cameras?|cameras?|microphones?|mics?|wireless|transmitters?|receivers?|speakers?|loudspeakers?|monitors?|mixers?|consoles?|amplifiers?|processors?|controllers?|control\s+panels?|displays?|screens?|players?|receptacles?|testers?|switchers?|matri(?:x|ces)|scalers?|nvr|dvr|ideahub|ideashare\s+key|presentation\s+(?:key|dongle))\b/i;
  const META=/\b(?:tax\s+invoice|invoice\s*(?:no|number|date)?|customer|sold\s+to|bill\s+to|ship\s+to|delivered\s+to|attention|attn\.?|company\s+reg|gst\s+reg|uen|address|telephone|tel\.?|fax|e-?mail|email|website|reference|ref\.?\s*no|p\/?o\s*no|purchase\s+order|delivery\s+order|quotation|payment\s+advice|subtotal|sub\s+total|amount\s+due|invoice\s+total|grand\s+total|total\s+local|page\s+\d+|warranty|in\s+stock|signature|company\s+stamp|shipment\s*(?:no|number))\b/i;
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
    if(s.length<2||s.length>42||/\s/.test(s))return false;
    if(s.length===2&&!/^(?:[A-Za-z]\d|\d[A-Za-z])$/.test(s))return false;
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
    const s=ocrLex(text),lead=s.replace(/^[^A-Za-z0-9]+/,'');
    const serviceScan=s.replace(/[_\r\n]+/g,' ');
    if(/^SERVICE\s+CENT(?:RE|ER)\b/i.test(lead))return false;
    if(/\b(?:HI\s*-?\s*CARE|CARE\s+PACK|SUPPORT\s+(?:PLAN|CONTRACT)|MAINTENANCE\s+CONTRACT|SUBSCRIPTION)\b/i.test(serviceScan))return true;
    if(SERVICE_CODE.test(lead))return true;
    // The object being supplied controls classification. Cable/bracket/mount/labour work
    // stays non-inventory even when an AV product is mentioned later as context.
    if(/^(?:supply|provide|install)\b.*\b(?:cable|cabling|wiring|bracket|mount|labou?r)\b/i.test(lead))return true;
    if(!SERVICE.test(s))return false;
    if(/^(?:supply|provide)\s*(?:&|and)?\s*install\b/i.test(lead)
      &&CORE_EQUIPMENT.test(lead)
      &&!/\b(?:labou?r|cabling|wiring|testing|commissioning|training)\b/i.test(lead))return false;
    return true;
  }
  function isAccessoryOnly(text=''){
    const s=ocrLex(text);
    const bundled=/\b(?:projectors?|speakers?|loudspeakers?|displays?|monitors?)\b.*\bwith\b.*\b(?:mounting\s+)?brackets?\b/i.test(s);
    const strongAccessory=/\b(?:rolling\s+stands?|av\s+carts?|security\s+locks?|ceiling\s+mounts?|speaker\s+brackets?|lamp\s+kits?|fasteners?|(?:hdmi|vga|usb|cat\s*\d*|audio|power|signal)?\s*cables?|wires?)\b/i.test(s);
    if(strongAccessory&&!bundled)return true;
    if(!ACCESSORY.test(s))return false;
    const core=s.search(CORE_EQUIPMENT),acc=s.search(ACCESSORY);
    if(core<0)return true;
    const supply=/^[^A-Za-z0-9]*(?:supply|provide|install)\b/i.test(s);
    if(supply&&acc>=0&&acc<core)return true;
    return false;
  }
  function isPhysical(text=''){
    const s=ocrLex(text);
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
    const chunks=raw.split(/(?:\f|\n\s*<PARSED\s+TEXT\s+FOR\s+PAGE:\s*\d+\s*\/\s*\d+>\s*\n|\n\s*={3,}\s*PAGE\s+\d+\s*={3,}\s*\n|\n\s*={3,}\s*page[-_ ]?\d+(?:\.txt)?\s*={3,}\s*\n)/i).filter(x=>clean(x));
    return chunks.length?chunks:[raw];
  }
  function invoiceText(text=''){
    const pages=splitPages(text),accepted=[];let invoiceActive=false;
    for(const page of pages){
      const authority=pageAuthority(page);
      if(authority==='reject'){invoiceActive=false;continue;}
      if(authority==='invoice'){invoiceActive=true;accepted.push(page);continue;}
      if(invoiceActive){
        const ls=linesOf(page);
        const continuation=/\bDESCRIPTION\b.*\bQUANTITY\b/i.test(ls.slice(0,20).join(' '))
          ||ls.some(x=>isPhysical(x))
          ||ls.some(x=>moneyTokens(x).length>=2);
        if(continuation)accepted.push(page);
      }
    }
    if(accepted.length)return accepted.join('\n');
    if(pages.length>1)return '';
    return pageAuthority(text)==='invoice'?text:'';
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
  function normalizeSkuCandidate(v=''){
    const raw=clean(v).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/$-]+$/g,'');
    if(!raw)return '';
    const repaired=raw.replace(/\$/g,'S');
    if(/^\d+(?:\.\d+)?-?(?:INCH|INCHES|IN|CM|MM)$/i.test(repaired))return '';
    return plausibleSku(repaired)?repaired:'';
  }
  function leadingSku(line=''){
    const tokens=clean(line).split(/\s+/).slice(0,4);
    if(tokens.length>=2){
      const joined=(tokens[0]||'')+(tokens[1]||'');
      if(/[A-Za-z]-[A-Za-z]$/i.test(tokens[0]||'')&&/^[A-Za-z]*\d[A-Za-z0-9+._\/-]*$/i.test(tokens[1]||'')){
        const repaired=normalizeSkuCandidate(joined);
        if(repaired)return repaired;
      }
    }
    for(const t of tokens){const v=normalizeSkuCandidate(t);if(v)return v;}
    return '';
  }
  function modelPricedLine(line=''){
    const sku=leadingSku(line);
    return !!sku&&moneyTokens(line).length>=1&&!isMetadata(line)&&!isPureService(line)&&!isAccessoryOnly(line);
  }
  function rowOrdinal(line=''){
    const m=clean(line).match(/^[\[\]{}|()\s]*([1-9]\d?)\s*[|.)\-:]?\s+/);
    return m?Number(m[1]):null;
  }
  function sequentialItemBlocks(lines=[]){
    const out=[];let cur=null,suppressSpan=false;
    const close=()=>{if(cur&&(cur.lines.some(x=>isPhysical(x))||cur.modelPriced)){cur.end=cur.start+cur.lines.length-1;out.push(cur);}cur=null;};
    for(let i=0;i<lines.length;i++){
      const line=lines[i],modelPriced=modelPricedLine(line),physical=isPhysical(line)||modelPriced,service=isPureService(line),accessory=isAccessoryOnly(line);
      const totals=/\b(?:SUBTOTAL|SUB\s+TOTAL|AMOUNT\s+DUE|INVOICE\s+TOTAL|GRAND\s+TOTAL|TOTAL\s+LOCAL|PAYMENT\s+ADVICE)\b/i.test(line);
      const ord=rowOrdinal(line),strongInventoryBoundary=modelPriced
        ||(!service&&!accessory&&physical&&!!leadingSku(line))
        ||(!service&&!accessory&&physical&&moneyTokens(line).length>=2)
        ||(physical&&ord!==null&&moneyTokens(line).length>=1);
      if(PROHIBITED_TITLE.test(line)||totals){close();suppressSpan=false;continue;}
      if(service||accessory){
        if(cur&&cur.seenEconomics)close();
        suppressSpan=true;
        continue;
      }
      if(suppressSpan){
        if(strongInventoryBoundary)suppressSpan=false;
        else continue;
      }
      if(physical){
        if(cur){
          const newOrdinal=ord!==null&&cur.ordinal!==null&&ord!==cur.ordinal;
          const numberedAfterUnnumbered=ord!==null&&cur.ordinal===null&&cur.lines.some(x=>/\b(?:MODEL(?:\s*(?:NO\.?|NUMBER))?|SKU|PRODUCT\s*(?:NO\.?|NUMBER))\b\s*[:#-]?/i.test(x));
          const newSku=leadingSku(line),curSku=leadingSku(cur.lines[0]||'');
          const identityBoundary=!cur.seenEconomics&&!!newSku&&!!curSku&&key(newSku)!==key(curSku);
          const numberedContinuation=cur.ordinal!==null&&ord===null;
          if((cur.seenEconomics&&!numberedContinuation)||newOrdinal||numberedAfterUnnumbered||identityBoundary)close();
        }
        if(!cur){
          let start=i,prefix=[];
          if(ord===null){
            for(let d=1;d<=4&&i-d>=0;d++){
              const prev=lines[i-d];
              if(PROHIBITED_TITLE.test(prev)||isPhysical(prev)||isPureService(prev)||isAccessoryOnly(prev))break;
              const prevOrd=rowOrdinal(prev),prevMoney=moneyTokens(prev);
              const cleanEconomicPrelude=d>=2&&prevMoney.length>=2
                &&!isMetadata(prev)&&!isPureService(prev)&&!isAccessoryOnly(prev)
                &&!/(?:SUBTOTAL|SUB\s+TOTAL|GST|AMOUNT\s+DUE|INVOICE\s+TOTAL|GRAND\s+TOTAL)/i.test(prev);
              if((prevOrd!==null&&prevMoney.length>=2)||cleanEconomicPrelude){
                start=i-d;prefix=lines.slice(start,i);break;
              }
            }
          }
          cur={start,end:i,ordinal:ord,lines:prefix,seenEconomics:prefix.some(x=>amountAnchors([x]).length>0),sequential:true,modelPriced};
        }
      }
      if(!cur)continue;
      if(ord!==null&&cur.lines.length&&cur.ordinal!==null&&ord!==cur.ordinal){
        close();
        if(physical)cur={start:i,end:i,ordinal:ord,lines:[],seenEconomics:false,sequential:true,modelPriced};
        else continue;
      }
      cur.lines.push(line);
      if(amountAnchors([line]).length)cur.seenEconomics=true;
      if(cur.lines.length>=14)close();
    }
    close();
    return out;
  }
  function serviceContinuationMask(lines=[]){
    const blocked=new Set();let active=false;
    for(let i=0;i<lines.length;i++){
      const line=lines[i],service=isPureService(line),accessory=isAccessoryOnly(line);
      const total=/\b(?:SUBTOTAL|SUB\s+TOTAL|GST|AMOUNT\s+DUE|INVOICE\s+TOTAL|GRAND\s+TOTAL)\b/i.test(line);
      const physical=!service&&!accessory&&isPhysical(line);
      const strongInventory=physical&&(!!leadingSku(line)||moneyTokens(line).length>=2||rowOrdinal(line)!==null);
      if(PROHIBITED_TITLE.test(line)||total){active=false;continue;}
      if(active){
        if(strongInventory)active=false;
        else {blocked.add(i);continue;}
      }
      if(service||accessory){blocked.add(i);active=true;}
    }
    return blocked;
  }
  function sourceBlocks(raw=''){
    const text=invoiceText(raw);
    if(pageAuthority(text)==='reject')return [];
    const lines=linesOf(text);
    const blocked=serviceContinuationMask(lines);
    // A complete numbered row outranks partial alternate candidates, but only when
    // the document actually contains a verified consecutive numbered item table.
    const numbered=numberedBlocks(lines),numberedTableRows=new Set();
    let run=[];
    const flushRun=()=>{if(run.length>=3)for(const r of run)numberedTableRows.add(r);run=[];};
    for(const nb of numbered){
      if(!run.length||nb.ordinal===run[run.length-1].ordinal+1)run.push(nb);
      else {flushRun();run=[nb];}
    }
    flushRun();
    for(const nb of numberedTableRows){
      const whole=nb.lines.join(' ');
      if(moneyTokens(whole).length<2)continue;
      if(isPureService(whole)||isAccessoryOnly(whole)){
        for(let i=nb.start;i<=nb.end;i++)blocked.add(i);
      }
    }
    const anchors=amountAnchors(lines).filter(a=>!blocked.has(a.index));
    const candidates=[...sequentialItemBlocks(lines)].filter(b=>!blocked.has(b.start));
    for(let i=0;i<lines.length;i++)if(!blocked.has(i)&&modelPricedLine(lines[i]))candidates.push({start:i,end:i,lines:[lines[i]],anchor:i,modelPriced:true});
    for(let i=0;i<anchors.length;i++)candidates.push(blockFromAnchor(lines,anchors[i],anchors[i-1],anchors[i+1]));
    for(const b of numberedBlocks(lines)){
      if(!blocked.has(b.start)&&b.lines.some(x=>isPhysical(x)&&!isAccessoryOnly(x))&&moneyTokens(b.lines.join(' ')).length)candidates.push(b);
    }
    // Add description-anchored candidates so table layouts with economics on the next line
    // are not dependent on a money token being on the description line.
    const physicalIdx=[];
    for(let i=0;i<lines.length;i++)if(!blocked.has(i)&&isPhysical(lines[i])&&!isAccessoryOnly(lines[i]))physicalIdx.push(i);
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
      const physicalLines=b.lines.filter(x=>isPhysical(x));
      const modelPriced=!!b.modelPriced||b.lines.some(modelPricedLine);
      const econ=economics(text);
      const hasEconomics=econ.quantity!==null||econ.unit_price!==null||econ.amount!==null;
      const hasExplicitIdentity=/\b(?:MODEL(?:\s*(?:NO\.?|NUMBER))?|SKU|PRODUCT\s*(?:NO\.?|NUMBER)|PART\s*(?:NO\.?|NUMBER))\b\s*[:#-]?/i.test(text);
      const hasSerial=/\b(?:S\/N|SN|SERIAL(?:\s*NO\.?)?)\s*[:#-]?/i.test(text);
      if((!physicalLines.length&&!modelPriced)||isPureService(b.lines.join(' ')))continue;
      if(!hasEconomics&&!hasExplicitIdentity&&!hasSerial)continue;
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
    const escRe=v=>String(v).replace(/[.*+?^$()|[\]{}\\]/g,'\\$&');
    for(const line of ls){
      if(/\b(?:S\/N|SN|SERIAL(?:\s*NO\.?)?)\s*[:#-]?/i.test(line)){serialMode=true;continue;}
      if(serialMode){
        if(moneyTokens(line).length||isPhysical(line)||/\b(?:WARRANTY|IN\s+STOCK)\b/i.test(line))serialMode=false;
        else continue;
      }
      if(isMetadata(line))continue;
      eligible.push(line);
      const m=line.match(/\b(?:MODEL(?:\s*(?:NO\.?|NUMBER))?|SKU|PRODUCT\s*(?:NO\.?|NUMBER)|PART\s*(?:NO\.?|NUMBER))\b\s*(?::|#|-)?\s*(.+)$/i);
      if(m){
        const toks=(m[1].match(/[A-Z0-9][A-Z0-9+._\/-]{2,41}/gi)||[]).filter(plausibleSku);
        if(toks.length){
          const ranked=toks.map((t,idx)=>{
            let score=100;
            if(/[\/_-]/.test(t))score+=18;
            if((t.match(/\d/g)||[]).length>=2)score+=8;
            if(/[A-Z]{2,}/i.test(t)&&/\d/.test(t))score+=4;
            score-=idx*0.5;
            return {t,score};
          }).sort((a,b)=>b.score-a.score);
          votes.push({value:ranked[0].t,line,rank:ranked[0].score});
        } else {
          const words=(m[1].match(/[A-Za-z][A-Za-z-]{2,31}/g)||[])
            .filter(x=>!/^(?:MODEL|UNKNOWN|NONE|NIL|NA)$/i.test(x));
          if(words.length)votes.push({value:words[0],line,rank:96});
        }
      }
    }
    for(const line of eligible){
      const lead=leadingSku(line);if(lead)votes.push({value:lead,line,rank:58});
      const textTokens=(line.match(/[A-Z0-9][A-Z0-9+._\/-]{2,41}/gi)||[]).filter(plausibleSku);
      for(const t of textTokens){
        let rank=10;
        if(EQUIPMENT.test(line))rank+=30;
        if(new RegExp('^\\s*'+escRe(t)+'\\b','i').test(line))rank+=14;
        if(/\b(?:MODEL|SKU|PRODUCT\s+NO)\b/i.test(line))rank+=40;
        if(/^(?:\d+(?:\.\d+)?(?:-?\s*(?:INCH|INCHES|IN|CM|MM))?|\d+[Xx]\d+)$/i.test(t))rank-=70;
        if(/^[A-Za-z0-9]+[-_/][A-Za-z0-9+._/-]+$/.test(t)&&/[A-Za-z]/.test(t)&&/\d/.test(t))rank+=16;
        const pos=line.toUpperCase().indexOf(t.toUpperCase());
        const prefix=pos>0?line.slice(Math.max(0,pos-18),pos):'';
        if(/\b(?:FOR|WITH|TO)\s*$/i.test(prefix))rank-=55;
        votes.push({value:t,line,rank});
      }
    }
    votes.sort((a,b)=>b.rank-a.rank);
    return (votes[0]&&votes[0].rank>0)?votes[0]:{value:'',line:'',rank:0};
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
      else if(money.length===1&&/\bAMOUNT\b/i.test(line)){amount=money[0].value;}
      if(q===null&&unit!==null&&amount!==null&&unit>0){
        const derived=amount/unit;
        const exact=qCandidates.find(x=>Math.abs(x.value-derived)<=0.001);
        if(exact)q=exact.value;
        else if(derived>0&&derived<=999&&Math.abs(derived-Math.round(derived))<=0.001)q=Math.round(derived);
      }
      if(q===null&&qCandidates.length)q=qCandidates[0].value;
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
      let score=0;if(EQUIPMENT.test(ocrLex(line)))score+=10;if(isPureService(line))score-=12;
      score+=Math.min(8,line.split(/\s+/).length/2);
      if(score>0)ranked.push({line,score});
    }
    ranked.sort((a,b)=>b.score-a.score||b.line.length-a.line.length);
    return ranked[0]?.line||'';
  }
  function serials(blockText=''){
    const out=[];
    for(const line of linesOf(blockText)){
      const m=line.match(/\b(?:S\/N|SN|SERIAL(?:\s*NO\.?)?)\s*[:#-]?\s*(.+)$/i)
        ||line.match(/^\s*S\s*[\/\\|]\s*[A-Za-z0-9]{1,2}\s*[:#-]?\s*(.+)$/i);
      if(!m)continue;
      for(const t of m[1].split(/[,;]\s*/).map(clean).filter(Boolean))if(!/^N\/?A$/i.test(t))out.push(t);
    }
    return [...new Set(out)];
  }
  function pageForEvidence(raw='',evidence=''){
    const needle=clean(evidence);
    if(!needle)return null;
    const pages=splitPages(raw);
    for(let i=0;i<pages.length;i++){
      const hay=clean(pages[i]);
      if(hay.includes(needle))return i+1;
      const short=needle.slice(0,Math.min(80,needle.length));
      if(short.length>=12&&hay.includes(short))return i+1;
    }
    return null;
  }
  function serialEvidenceLine(blockText=''){
    return linesOf(blockText).find(x=>/\b(?:S\/N|SN|SERIAL(?:\s*NO\.?)?)\s*[:#-]?/i.test(x))||'';
  }
  function nearMoney(a,b,tolerance=0.02){
    if(!Number.isFinite(a)||!Number.isFinite(b))return false;
    const tol=Math.max(0.02,Math.abs(b)*tolerance);
    return Math.abs(a-b)<=tol;
  }
  function rowArithmetic(row={}){
    if(row.quantity===null||row.quantity===undefined||row.unit_price===null||row.unit_price===undefined||row.amount===null||row.amount===undefined){
      return {status:'unverified',reason:'missing-economics'};
    }
    const q=Number(row.quantity),u=Number(row.unit_price),a=Number(row.amount);
    if(!Number.isFinite(q)||!Number.isFinite(u)||!Number.isFinite(a))return {status:'unverified',reason:'invalid-economics'};
    const expected=q*u,ok=nearMoney(expected,a,0.01);
    return {status:ok?'pass':'fail',expected,actual:a,delta:a-expected,tolerance:Math.max(0.02,Math.abs(a)*0.01)};
  }
  function labelledTotal(raw='',kind='subtotal'){
    const text=invoiceText(raw),ls=linesOf(text);
    const patterns={
      subtotal:/\bSUB\s*TOTAL\b/i,
      gst:/\bGST\b/i,
      total:/\b(?:AMOUNT\s+DUE|INVOICE\s+TOTAL|GRAND\s+TOTAL|\bTOTAL\b)\b/i
    };
    const re=patterns[kind];if(!re)return null;
    for(const line of ls){
      if(!re.test(line))continue;
      if(kind==='total'&&/\bSUB\s*TOTAL\b/i.test(line))continue;
      const vals=moneyTokens(line).map(x=>x.value).filter(Number.isFinite);
      if(vals.length)return {value:vals[vals.length-1],line};
    }
    return null;
  }
  function invoiceArithmetic(raw=''){
    const subtotal=labelledTotal(raw,'subtotal'),gst=labelledTotal(raw,'gst'),total=labelledTotal(raw,'total');
    if(!subtotal||!gst||!total)return {status:'unverified',subtotal,gst,total};
    const expected=subtotal.value+gst.value,ok=nearMoney(expected,total.value,0.005);
    return {status:ok?'pass':'fail',subtotal,gst,total,expected,actual:total.value,delta:total.value-expected};
  }

  function confidenceBand(score){
    return score>=0.9?'high':(score>=0.7?'medium':'low');
  }
  function fieldConfidence(row={}){
    const prov=row.provenance||{},arith=row.validation?.arithmetic||{status:'unverified'};
    const scoreObj=(field,score,reason)=>({
      field,
      score:Number(Math.max(0,Math.min(1,score)).toFixed(3)),
      band:confidenceBand(score),
      reason
    });
    const escapeRe=v=>String(v).replace(/[.*+?^$()|[\]{}\\]/g,'\\$&');
    const identityScore=(p,value)=>{
      if(!value)return scoreObj(p?.field||'identity',0,'not-present');
      const text=clean(p?.text||'');
      if(!p?.evidenceBound)return scoreObj(p?.field||'identity',0.45,'value-without-bound-evidence');
      if(/\b(?:MODEL|SKU|PRODUCT\s*(?:NO\.?|NUMBER)|PART\s*(?:NO\.?|NUMBER))\b/i.test(text))return scoreObj(p.field,0.99,'explicit-labelled-identity');
      if(new RegExp('^\\s*'+escapeRe(value)+'\\b','i').test(text))return scoreObj(p.field,0.96,'row-leading-identity');
      return scoreObj(p.field,0.86,'row-local-identity');
    };
    const econScore=(field,value)=>{
      const p=prov[field];
      if(value===null||value===undefined)return scoreObj(field,0,'not-present');
      if(!p?.evidenceBound)return scoreObj(field,0.4,'economics-without-bound-evidence');
      if(arith.status==='pass')return scoreObj(field,0.99,'row-arithmetic-validated');
      if(arith.status==='fail')return scoreObj(field,0.15,'row-arithmetic-conflict');
      return scoreObj(field,0.78,'row-local-economics-unverified');
    };
    const desc=(()=>{
      if(!row.item_name)return scoreObj('item_name',0,'not-present');
      if(!prov.item_name?.evidenceBound)return scoreObj('item_name',0.45,'description-without-bound-evidence');
      if(descriptionContaminated(row.item_name))return scoreObj('item_name',0.45,'description-contaminated');
      return scoreObj('item_name',0.94,'row-local-description');
    })();
    const serial=(()=>{
      if(!Array.isArray(row.serials)||!row.serials.length)return scoreObj('serials',0,'not-present');
      if(!prov.serials?.evidenceBound)return scoreObj('serials',0.45,'serial-without-labelled-evidence');
      return scoreObj('serials',0.98,'labelled-serial-evidence');
    })();
    return {
      sku:identityScore(prov.sku,row.sku),
      model:identityScore(prov.model,row.model),
      item_name:desc,
      quantity:econScore('quantity',row.quantity),
      unit_price:econScore('unit_price',row.unit_price),
      amount:econScore('amount',row.amount),
      serials:serial
    };
  }

  function buildFieldProvenance(raw='',row={}){
    const identityText=clean(row.evidence?.identity||'');
    const economicsText=clean(row.evidence?.economics||'');
    const descriptionText=clean(row.item_name||'');
    const serialText=serialEvidenceLine(row.sourceText||'');
    const prov=(field,value,text,method)=>({
      field,
      value:value??null,
      sourceBlockId:row.sourceBlockId||null,
      sourceRange:Array.isArray(row.sourceRange)?[...row.sourceRange]:null,
      page:pageForEvidence(raw,text||row.sourceText||''),
      text:clean(text||''),
      method:(row.extractionMethod?row.extractionMethod+':':'')+method,
      preprocess:row.extractionPreprocess||null,
      evidenceBound:!!clean(text||'')
    });
    return {
      sku:prov('sku',row.sku,identityText,'row-local-identity'),
      model:prov('model',row.model,identityText,'row-local-identity'),
      item_name:prov('item_name',row.item_name,descriptionText,'row-local-description'),
      quantity:prov('quantity',row.quantity,economicsText,'row-local-economics'),
      unit_price:prov('unit_price',row.unit_price,economicsText,'row-local-economics'),
      amount:prov('amount',row.amount,economicsText,'row-local-economics'),
      serials:prov('serials',row.serials,serialText,'row-local-serial')
    };
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
  function evidenceKey(v=''){return key(String(v||'').replace(/\$/g,'S'));}
  function presentInBlock(value,blockText){const k=evidenceKey(value);return !k||evidenceKey(blockText).includes(k);}
  function printedIdentityInBlock(blockText=''){return explicitIdentity(blockText).value;}
  function descriptionContaminated(v=''){
    const s=clean(v);
    if(!s)return false;
    const suspiciousSymbols=(s.match(/[¥€£©®<>\\{}@$%]/g)||[]).length;
    if(suspiciousSymbols>=2)return true;
    const nonWord=(s.match(/[^A-Za-z0-9\s.,()\/_+:-]/g)||[]).length;
    if(nonWord>=3&&nonWord/Math.max(1,s.length)>0.04)return true;
    if(/[|]{2,}|[)!]{2,}|[;:,.]{3,}/.test(s))return true;
    const toks=s.split(/\s+/).filter(Boolean);
    const mixed=toks.filter(t=>(/[A-Z].*[a-z].*[A-Z]|[a-z].*[A-Z].*[a-z]/.test(t))&&/\d/.test(t));
    const digitNoise=toks.filter(t=>/[A-Za-z]\d{2,}|\d+[A-Za-z]{2,}/.test(t)&&!plausibleSku(t));
    return mixed.length>=1||digitNoise.length>=2;
  }

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
    else if(block.lines.some(x=>isPhysical(x))&&!isPhysical(row.item_name))issues.push('description-not-equipment');
    if(descriptionContaminated(row.item_name))issues.push('description-contaminated');
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
  function columnarTableRecovery(raw=''){
    const text=invoiceText(raw),ls=linesOf(text);
    const firstMoney=ls.findIndex(line=>/^\s*(?:SGD\s*)?\d+(?:,\d{3})*\.\d{2}\s*$/i.test(line));
    if(firstMoney<0)return null;
    const bodyEnd=firstMoney;
    const firstRow=ls.findIndex((line,i)=>i<bodyEnd&&isPhysical(line)&&!isMetadata(line));
    if(firstRow<0)return null;
    const codeCandidates=[];
    for(let i=Math.max(0,firstRow-18);i<firstRow;i++){
      const line=clean(ls[i]);
      const normalized=normalizeSkuCandidate(line);
      if(!normalized)continue;
      if(/\b(?:WARRANTY|WT\s+FOR|YEAR|YR)\b/i.test(line))continue;
      if(isMetadata(line))continue;
      codeCandidates.push({lineIndex:i,raw:line,sku:normalized,service:/INSTALL|LABOU?R|SERVICE|DELIVERY|FREIGHT|RELOCAT|DISMANT|DISMOUNT|COMMISSION/i.test(normalized)});
    }
    if(codeCandidates.length<2)return null;

    const starts=[];
    for(let i=0;i<bodyEnd;i++){
      const line=ls[i];
      if(i<firstRow)continue;
      if(isPhysical(line)||isPureService(line)){
        if(starts.length&&i-starts[starts.length-1]<2)continue;
        starts.push(i);
      }
    }
    if(starts.length<2)return null;

    const priceValues=[];
    for(let i=firstMoney;i<ls.length;i++){
      const s=clean(ls[i]);
      if(/\b(?:SUBTOTAL|SUB\s+TOTAL|GST|AMOUNT\s+DUE|INVOICE\s+TOTAL|GRAND\s+TOTAL)\b/i.test(s))break;
      const m=s.match(/^(?:SGD\s*)?(\d+(?:,\d{3})*\.\d{2})$/i);
      if(m)priceValues.push(Number(m[1].replace(/,/g,'')));
    }
    const pricedCodes=codeCandidates;
    if(priceValues.length<pricedCodes.length)return null;

    const unit=priceValues.slice(0,pricedCodes.length);
    let amount=null;
    const tail=priceValues.slice(pricedCodes.length);
    if(tail.length===pricedCodes.length)amount=tail.slice();
    else if(tail.length===pricedCodes.length-1&&tail.every((v,i)=>Math.abs(v-unit[i+1])<0.001))amount=unit.slice();
    else {
      const same=unit.every(v=>Number.isFinite(v));
      if(same)amount=unit.slice();
    }
    if(!amount)return null;

    const rowSpans=[];
    for(let i=0;i<starts.length;i++){
      const start=starts[i],end=(starts[i+1]??firstMoney)-1;
      rowSpans.push({start,end,lines:ls.slice(start,end+1)});
    }

    const n=Math.min(pricedCodes.length,rowSpans.length,unit.length,amount.length);
    if(n<2)return null;
    const blocks=[],rows=[];
    for(let i=0;i<n;i++){
      const code=pricedCodes[i],span=rowSpans[i],descText=span.lines.join('\n');
      const service=code.service||isPureService(descText);
      const accessory=isAccessoryOnly(descText);
      if(service||accessory)continue;
      const syntheticLines=[code.sku,...span.lines,'1 '+unit[i].toFixed(2)+' '+amount[i].toFixed(2)];
      const block=normalizeBlock({start:span.start,end:span.end,lines:syntheticLines,columnar:true,columnarEvidence:{printedProductNo:code.raw,unit_price:unit[i],amount:amount[i]}},blocks.length);
      let row=parseBlock(block);
      row.sku=code.sku;
      row.model=code.sku;
      row.quantity=1;
      row.unit_price=unit[i];
      row.amount=amount[i];
      row.evidence={...(row.evidence||{}),identity:code.raw,economics:'columnar OCR sequence: '+unit[i].toFixed(2)+' / '+amount[i].toFixed(2)};
      row.v411ColumnarRecovery=true;
      blocks.push(block);rows.push(row);
    }
    if(rows.length<2)return null;
    return {blocks,rows,confidence:'structural-column-sequence'};
  }

  function extractionCandidateScore(text=''){
    const s=String(text||''),invoice=invoiceText(s),ls=linesOf(invoice);
    const usable=clean(invoice).replace(/\s+/g,'').length;
    const authority=pageAuthority(invoice);
    const physical=ls.filter(x=>isPhysical(x)&&!isAccessoryOnly(x)).length;
    const econ=ls.filter(x=>moneyTokens(x).length>=2).length;
    const labelledModels=(invoice.match(/\b(?:MODEL|SKU|PRODUCT\s*(?:NO\.?|NUMBER)|PART\s*(?:NO\.?|NUMBER))\b/gi)||[]).length;
    const table=/\b(?:DESCRIPTION|ITEM)\b/i.test(invoice)&&/\b(?:QTY|QUANTITY|UNITS?)\b/i.test(invoice);
    const suspicious=(invoice.match(/[�□◇◆¤]/g)||[]).length;
    let score=0;
    if(authority==='invoice')score+=40;
    if(authority==='reject')score-=120;
    if(/\bTAX\s+INVOICE\b|^\s*INVOICE\b/im.test(invoice))score+=25;
    if(table)score+=15;
    score+=Math.min(30,physical*5);
    score+=Math.min(25,econ*4);
    score+=Math.min(15,labelledModels*3);
    score+=Math.min(20,usable/120);
    score-=Math.min(30,suspicious*3);
    return {score:Number(score.toFixed(3)),usable,authority,physical,econ,labelledModels,table,suspicious};
  }
  function selectExtractionCandidate(raw='',opts={}){
    const candidates=[{
      text:String(raw||''),
      method:opts.rawMethod||'native-or-provided',
      preprocess:'none',
      source:'raw'
    }];
    for(const [i,c] of (Array.isArray(opts.ocrCandidates)?opts.ocrCandidates:[]).entries()){
      if(!c||!String(c.text||'').trim())continue;
      candidates.push({
        text:String(c.text),
        method:String(c.method||c.source||('ocr-'+(i+1))),
        preprocess:String(c.preprocess||c.mode||'ocr'),
        source:String(c.source||('ocr-'+(i+1)))
      });
    }
    const scored=candidates.map((c,i)=>({...c,index:i,quality:extractionCandidateScore(c.text)}));
    scored.sort((a,b)=>b.quality.score-a.quality.score||b.quality.usable-a.quality.usable||a.index-b.index);
    const selected=scored[0]||candidates[0];
    return {
      text:selected.text,
      method:selected.method,
      preprocess:selected.preprocess,
      source:selected.source,
      quality:selected.quality||extractionCandidateScore(selected.text),
      candidates:scored.map(x=>({method:x.method,preprocess:x.preprocess,source:x.source,quality:x.quality}))
    };
  }

  const CORRECTION_HIGH_RISK=new Set(['sku','model','quantity','unit_price','amount','serials','invoice_number','invoice_date','supplier']);
  function memoryMatch(row={},entry={},raw=''){
    if(!entry||entry.approved!==true)return false;
    if(entry.supplier&& !key(raw).includes(key(entry.supplier)))return false;
    const m=entry.match||{};
    if(m.sku&&key(row.sku)!==key(m.sku))return false;
    if(m.model&&key(row.model)!==key(m.model))return false;
    if(m.item_name&& !key(row.item_name).includes(key(m.item_name)))return false;
    if(m.contains&& !key(row.sourceText).includes(key(m.contains)))return false;
    if(!m.sku&&!m.model&&!m.item_name&&!m.contains)return false;
    return true;
  }
  function correctionMemorySuggestions(row={},opts={},raw=''){
    const entries=Array.isArray(opts.correctionMemory)?opts.correctionMemory:[];
    const suggestions=[];
    for(const entry of entries){
      if(!memoryMatch(row,entry,raw))continue;
      const corrections=entry.corrections||entry.fields||{};
      const evidence=clean(entry.evidence?.text||entry.evidenceText||row.sourceText||'');
      const evidenceBound=entry.evidenceBound===true||!!evidence;
      if(!evidenceBound)continue;
      for(const [field,value] of Object.entries(corrections)){
        if(value===undefined||value===null||value==='')continue;
        suggestions.push({
          field,
          current:row[field]??null,
          suggested:value,
          risk:CORRECTION_HIGH_RISK.has(field)?'high':'normal',
          mode:'suggestion-only',
          approved:true,
          evidenceBound:true,
          evidence:{
            text:evidence,
            sourceBlockId:row.sourceBlockId||null,
            page:pageForEvidence(raw,evidence||row.sourceText||''),
            memoryId:entry.id||entry.memoryId||null,
            approvedBy:entry.approvedBy||null,
            approvedAt:entry.approvedAt||null
          }
        });
      }
    }
    return suggestions;
  }

  function descSimilarity(a='',b=''){
    const stop=new Set(['with','from','system','support','supply','install','the','and','for']);
    const toks=v=>new Set(clean(v).toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>3&&!stop.has(x)));
    const A=toks(a),B=toks(b); if(!A.size||!B.size)return 0;
    let hit=0; for(const x of A)if(B.has(x))hit++;
    return hit/Math.max(1,Math.min(A.size,B.size));
  }
  function verificationIdentityConflicts(rows=[],texts=[]){
    const out=[];
    for(const text of texts){
      if(!String(text||'').trim())continue;
      const vBlocks=sourceBlocks(String(text));
      const vRows=vBlocks.map(parseBlock).filter(v=>{
        const physicalLines=linesOf(v.sourceText||'').filter(x=>isPhysical(x));
        return physicalLines.length<=1;
      });
      for(const row of rows){
        if(!row.sku)continue;
        const matches=vRows
          .map(v=>({v,sim:descSimilarity(row.item_name,v.item_name)}))
          .filter(x=>x.sim>=0.6&&x.v.sku);
        for(const {v,sim} of matches){
          if(key(v.sku)!==key(row.sku)){
            out.push({
              blockId:row.sourceBlockId,
              issue:'identity-conflict-between-extractions',
              current:row.sku,
              alternate:v.sku,
              similarity:Number(sim.toFixed(3))
            });
            break;
          }
        }
      }
    }
    return out;
  }

  function rawQuantityCandidates(entries=[]){
    const vals=[];
    for(const e of (Array.isArray(entries)?entries:[])){
      const s=clean(e?.text??e);
      for(const m of s.matchAll(/(?<!\d)(\d{1,2})(?!\d)/g)){
        const v=Number(m[1]);
        if(Number.isInteger(v)&&v>=1&&v<=50)vals.push(v);
      }
    }
    const count=new Map();
    for(const v of vals)count.set(v,(count.get(v)||0)+1);
    return [...count.entries()].map(([value,votes])=>({value,votes})).sort((a,b)=>b.votes-a.votes||a.value-b.value);
  }
  function rawMoneyCandidates(entries=[]){
    const vals=[];
    for(const e of (Array.isArray(entries)?entries:[])){
      let s=clean(e?.text??e).replace(/\s+/g,'');
      if(!s)continue;
      if(s.includes(',')&&!s.includes('.'))s=s.replace(/,/g,'.');
      const re=/(\d{1,5})[.,](\d{2})(?:\d)?/g;
      let m;
      while((m=re.exec(s))){
        const v=Number(m[1]+'.'+m[2]);
        if(Number.isFinite(v)&&v>=1&&v<=100000)vals.push(v);
      }
    }
    const count=new Map();
    for(const v of vals)count.set(v,(count.get(v)||0)+1);
    return [...count.entries()].map(([value,votes])=>({value,votes})).sort((a,b)=>b.votes-a.votes||a.value-b.value);
  }
  function recoverQuantityFromBlock(block,row){
    if(row.quantity!==null&&row.quantity!==undefined)return row.quantity;
    const ls=linesOf(block?.text||'');
    for(const line of ls){
      if(!isPhysical(line))continue;
      let s=line.replace(/^[\[\]{}|()\s]*[1-9]\d?\s*[|.)\-:]?\s+/,' ');
      const firstMoney=s.search(/\d[\d,]*\.\d{2}/);
      if(firstMoney>=0)s=s.slice(0,firstMoney);
      const nums=[...s.matchAll(/(?:^|\s)(\d{1,2})(?=\s|[|,;:]|$)/g)].map(m=>Number(m[1])).filter(n=>n>=1&&n<=50);
      if(nums.length)return nums[0];
    }
    return null;
  }
  function applyNumericCellEvidence(block,row,entry){
    if(!entry)return {...row,item_name:sanitizeItemName(row.item_name),description:sanitizeItemName(row.description||row.item_name)};
    const desc=descriptionCellCandidate(entry.description_ocr);
    row={...row,item_name:desc?.text||sanitizeItemName(row.item_name),description:desc?.text||sanitizeItemName(row.description||row.item_name)};
    const Q=rawQuantityCandidates(entry.quantity_ocr);
    const existingQ=(row.quantity!==null&&row.quantity!==undefined&&Number.isFinite(Number(row.quantity)))?Number(row.quantity):null;
    let q=existingQ!==null?existingQ:((Q[0]&&Q[0].votes>=2)?Q[0].value:recoverQuantityFromBlock(block,row));
    const U=rawMoneyCandidates(entry.unit_price_ocr);
    const A=rawMoneyCandidates(entry.amount_ocr);
    const uExisting=Number.isFinite(Number(row.unit_price))&&row.unit_price!==null?Number(row.unit_price):null;
    const aExisting=Number.isFinite(Number(row.amount))&&row.amount!==null?Number(row.amount):null;
    if(uExisting!==null)U.unshift({value:uExisting,votes:100});
    if(aExisting!==null)A.unshift({value:aExisting,votes:100});
    let best=null;
    if(q){
      for(const u of U.slice(0,8)){
        for(const a of A.slice(0,8)){
          if(Math.abs(q*u.value-a.value)<=Math.max(.02,Math.abs(a.value)*.002)){
            const score=u.votes+a.votes;
            if(!best||score>best.score)best={score,unit:u.value,amount:a.value,method:'cell-ocr-arithmetic'};
          }
        }
      }
      if(!best&&U[0]&&U[0].votes>=2)best={score:U[0].votes,unit:U[0].value,amount:q*U[0].value,method:'cell-ocr-unit-derived-amount'};
      if(A[0]&&A[0].votes>=2){
        const candidate={score:A[0].votes,unit:A[0].value/q,amount:A[0].value,method:'cell-ocr-amount-derived-unit'};
        if(!best||candidate.score>best.score)best=candidate;
      }
    }
    if(!best)return row;
    const cellText=[
      ...(entry.quantity_ocr||[]).map(x=>x?.text||x),
      ...(entry.unit_price_ocr||[]).map(x=>x?.text||x),
      ...(entry.amount_ocr||[]).map(x=>x?.text||x)
    ].filter(Boolean).join(' | ');
    return {
      ...row,
      quantity:q,
      unit_price:Number(best.unit.toFixed(2)),
      amount:Number(best.amount.toFixed(2)),
      evidence:{...(row.evidence||{}),economics:cellText||row.evidence?.economics||''},
      cellOcrRecovery:{
        ordinal:block?.ordinal??null,
        method:best.method,
        quantityCandidates:Q.slice(0,5),
        unitCandidates:U.slice(0,5),
        amountCandidates:A.slice(0,5),
        anchorText:clean(entry.anchor_text||'')
      }
    };
  }

  function sanitizeItemName(v=''){
    let s=clean(v).replace(/^\|+\s*/,'').replace(/\s*\|+$/,'').trim();
    s=s.replace(/\s*\|\s*\d{1,3}\s*(?:\|\s*)+$/,'').trim();
    return s.replace(/\s*\|\s*/g,' ').replace(/\s{2,}/g,' ').trim();
  }
  function descriptionCellCandidate(entries=[]){
    const count=new Map();
    for(const e of (Array.isArray(entries)?entries:[])){
      for(const line of linesOf(e?.text??e)){
        const s=sanitizeItemName(line);
        if(!s||isMetadata(s)||isPureService(s)||isAccessoryOnly(s))continue;
        if(!isPhysical(s))continue;
        const k=key(s),prev=count.get(k)||{text:s,votes:0};
        prev.votes++; if(s.length<prev.text.length)prev.text=s;
        count.set(k,prev);
      }
    }
    return [...count.values()].sort((a,b)=>b.votes-a.votes||a.text.length-b.text.length)[0]||null;
  }

  function run(raw='',opts={}){
    const extraction=selectExtractionCandidate(raw,opts);
    raw=extraction.text;
    let blocks=sourceBlocks(raw);
    let rows=blocks.map(parseBlock).map((r,i)=>recoverMissingFields(r,blocks[i]));
    const cellEvidence=Array.isArray(opts.numericCellOcrEvidence)?opts.numericCellOcrEvidence:[];
    if(cellEvidence.length){
      rows=rows.map((r,i)=>{
        const ord=blocks[i]?.ordinal??rowOrdinal(blocks[i]?.lines?.[0]||'');
        const ev=cellEvidence.find(x=>Number(x?.ordinal)===Number(ord));
        return applyNumericCellEvidence(blocks[i],r,ev);
      });
    }
    rows=rows.map(r=>{
      const withMethod={...r,extractionMethod:extraction.method,extractionPreprocess:extraction.preprocess};
      const enriched={...withMethod,provenance:buildFieldProvenance(raw,withMethod),validation:{arithmetic:rowArithmetic(withMethod)}};
      enriched.confidence=fieldConfidence(enriched);
      enriched.correctionSuggestions=correctionMemorySuggestions(enriched,opts,raw);
      return enriched;
    });
    const columnar=columnarTableRecovery(raw);
    if(columnar&&columnar.rows.length>rows.length){blocks=columnar.blocks;rows=columnar.rows;}
    const failures=[];
    for(let i=0;i<blocks.length;i++){
      const issues=sourceCompleteness(blocks[i],rows[i]);
      if(issues.length){rows[i].review=[...new Set([...(rows[i].review||[]),...issues])];for(const issue of issues)failures.push({blockId:blocks[i].id,issue});}
    }
    const uniqueBlockIds=new Set(rows.map(r=>r.sourceBlockId));
    if(uniqueBlockIds.size!==rows.length)failures.push({issue:'source-block-reused'});
    const sourceBlockCount=blocks.length,outputRowCount=rows.length;
    const sourceInvoiceText=invoiceText(raw);
    const schema={quantity:/\bQUANTITY\b|\bQTY\b/i.test(sourceInvoiceText),unitPrice:/\bUNIT\s+PRICE\b/i.test(sourceInvoiceText),amount:/\bAMOUNT\b/i.test(sourceInvoiceText)};
    const physicalCueCount=linesOf(sourceInvoiceText).filter(x=>isPhysical(x)&&!isAccessoryOnly(x)).length;
    const usableSourceChars=clean(raw).replace(/\s+/g,'').length;
    const authority=pageAuthority(sourceInvoiceText);
    if(sourceBlockCount===0){
      if(usableSourceChars<220)failures.push({issue:'insufficient-source-text',usableSourceChars});
      else if(authority==='reject')failures.push({issue:'prohibited-document-type'});
      else if(authority==='invoice')failures.push({issue:'invoice-has-no-inventory-equipment'});
      else failures.push({issue:'no-source-blocks-detected',physicalCueCount,usableSourceChars});
    }
    if(sourceBlockCount!==outputRowCount)failures.push({issue:'row-count-mismatch',sourceBlockCount,outputRowCount});
    for(const row of rows){
      if(schema.quantity&&row.quantity===null)failures.push({blockId:row.sourceBlockId,issue:'quantity-unresolved'});
      if(schema.unitPrice&&row.unit_price===null)failures.push({blockId:row.sourceBlockId,issue:'unit-price-unresolved'});
      if(schema.amount&&row.amount===null)failures.push({blockId:row.sourceBlockId,issue:'amount-unresolved'});
      if(row.validation?.arithmetic?.status==='fail')failures.push({blockId:row.sourceBlockId,issue:'row-arithmetic-mismatch',detail:row.validation.arithmetic});
      for(const [field,cf] of Object.entries(row.confidence||{})){
        const value=row[field];
        const populated=Array.isArray(value)?value.length>0:(value!==null&&value!==undefined&&value!=='');
        if(populated&&cf.score<0.6)failures.push({blockId:row.sourceBlockId,issue:'low-field-confidence',field,confidence:cf});
      }
    }
    const invoiceValidation=invoiceArithmetic(raw);
    if(invoiceValidation.status==='fail')failures.push({issue:'invoice-total-arithmetic-mismatch',detail:invoiceValidation});
    const verificationTexts=[
      ...(Array.isArray(opts.verificationTexts)?opts.verificationTexts:[]),
      ...(Array.isArray(opts.ocrCandidates)?opts.ocrCandidates.map(x=>x?.text).filter(Boolean):[])
    ].filter(x=>String(x||'').trim()&&String(x)!==String(raw));
    failures.push(...verificationIdentityConflicts(rows,verificationTexts));
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
    const reviewOnlyIssues=new Set(['quantity-unresolved','unit-price-unresolved','amount-unresolved','description-contaminated','low-field-confidence','identity-conflict-between-extractions']);
    const hardFailures=failures.filter(f=>!reviewOnlyIssues.has(f.issue));
    const reviewFailures=failures.filter(f=>reviewOnlyIssues.has(f.issue));
    const disposition=hardFailures.length?'fail':(reviewFailures.length?'review':'ready');
    const correctionMemory={
      approvedSuggestionCount:rows.reduce((n,r)=>n+(r.correctionSuggestions?.length||0),0),
      autoAppliedCount:0,
      policy:'approved-evidence-bound-suggestion-only'
    };
    return {version:VERSION,mode:'shadow',extraction,blocks,rows,failures,hardFailures,reviewFailures,metrics,validation:{invoice:invoiceValidation},correctionMemory,ready:disposition==='ready',safe:hardFailures.length===0,disposition};
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
    if(r.rows.some(x=>!x.provenance||!x.provenance.item_name?.evidenceBound||!x.provenance.quantity?.evidenceBound))f.push('field provenance');
    if(r.rows.some(x=>x.validation?.arithmetic?.status!=='pass'))f.push('row arithmetic');
    if(r.rows.some(x=>!x.confidence||x.confidence.item_name?.band!=='high'||x.confidence.quantity?.band!=='high'))f.push('per-field confidence');
    const weak='TAX INVOICE\nUnreadable scan';
    const strong=['TAX INVOICE','1 Digital Mixer Model: CQ12T 1 100.00 100.00','SUBTOTAL 100.00','GST 9.00','TOTAL 109.00'].join('\n');
    const recovered=run(weak,{ocrCandidates:[{text:strong,method:'ocr-psm6',preprocess:'grayscale-300dpi'}]});
    if(recovered.extraction?.method!=='ocr-psm6'||!recovered.rows.some(x=>x.sku==='CQ12T'))f.push('ocr candidate selection');
    const memoryRun=run(sample,{correctionMemory:[
      {id:'approved-1',approved:true,approvedBy:'admin',match:{sku:'CQ12T'},corrections:{sku:'CQ12T-CANON',item_name:'Digital Mixer'},evidenceBound:true,evidenceText:'1 Digital Mixer console Model: CQ12T 1 1400.00 1400.00'},
      {id:'unapproved-1',approved:false,match:{sku:'ZX1I-90'},corrections:{sku:'BAD'}}
    ]});
    const memRow=memoryRun.rows.find(x=>x.sku==='CQ12T');
    if(!memRow||memRow.sku!=='CQ12T'||!memRow.correctionSuggestions?.some(x=>x.field==='sku'&&x.suggested==='CQ12T-CANON')||memoryRun.correctionMemory.autoAppliedCount!==0)f.push('correction memory safety');
    const bad=run(['TAX INVOICE','1 Digital Mixer Model: CQ12T 2 100.00 250.00','SUBTOTAL 250.00','GST 22.50','TOTAL 272.50'].join('\n'));
    if(!bad.failures.some(x=>x.issue==='row-arithmetic-mismatch'))f.push('arithmetic mismatch gate');
    if(r.metrics.crossRowContaminationCount)f.push('cross-row');
    if(!r.ready||r.failures.length)f.push('shadow readiness gate');
    return {ok:!f.length,failures:f,metrics:r.metrics};
  }
  root.InventoryHubV411Fixes1to5Shadow=Object.freeze({
    VERSION,sourceBlocks,explicitIdentity,economics,description,parseBlock,recoverMissingFields,sourceCompleteness,buildFieldProvenance,rowArithmetic,invoiceArithmetic,fieldConfidence,extractionCandidateScore,selectExtractionCandidate,correctionMemorySuggestions,verificationIdentityConflicts,rawQuantityCandidates,rawMoneyCandidates,applyNumericCellEvidence,run,selfTest
  });
})(typeof window!=='undefined'?window:globalThis);
