(function(root){
'use strict';
const VERSION='4.1.1-shadow-fixes1-5-r1';
const clean=v=>String(v??'').normalize('NFKC').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
const compact=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
const money=v=>{const n=Number(String(v??'').replace(/[,\s$]/g,''));return Number.isFinite(n)?n:null};
const EQUIPMENT=/\b(?:projector|microphone|wireless|speaker|loudspeaker|amplifier|mixer|console|monitor|display|camera|visualizer|controller|control\s*panel|processor|switcher|player|receptacle|audio\s*tester|video\s*recorder|nvr|dvr|trolley)\b/i;
const SERVICE=/\b(?:labou?r|installation\s+work|install(?:ation|ing)?\s+(?:service|work)|dismantl|dismount|relocat|re-?instat|repair\s+service|testing\s+and\s+commissioning|commissioning\s+service|delivery\s+service|freight|courier)\b/i;
const ACCESSORY=/\b(?:cable|bracket|mounting\s+kit|safety\s+wire|lamp\s+kit|stand\b|cart\b)\b/i;
const META=/\b(?:invoice\s*(?:no|number|date)?|tax\s+invoice|purchase\s+order|delivery\s+(?:order|slip|note)|quotation|quote|customer|sold\s+to|bill\s+to|ship\s+to|attention|attn|address|email|telephone|tel\.?|fax|uen|gst\s*(?:reg|registration)|company\s+(?:reg|registration)|subtotal|amount\s+due|grand\s+total|payment\s+advice|terms|salesman|reference)\b/i;
const PROHIBITED=/^(?:PURCHASE\s+ORDER|DELIVERY\s+(?:ORDER|NOTE|SLIP)|PACKING(?:\/DELIVERY)?\s+SLIP|QUOTATION|QUOTE|PRO\s*FORMA\s+INVOICE|SERVICE\s+REPORT|SERVICE\s+INVOICE|CREDIT\s+NOTE|DEBIT\s+NOTE|STATEMENT)\b/i;
const INVOICE=/\b(?:TAX\s+INVOICE|INVOICE)\b/i;
function isAddress(s=''){
  s=clean(s);
  return /\bsingapore\s*\d{5,6}\b/i.test(s)||/#\s*\d{1,3}[-/]\d{1,5}\b/.test(s)||/\b\d{1,4}\s+[A-Za-z][A-Za-z0-9 .'-]{1,70}\s+(?:road|rd\.?|street|st\.?|avenue|ave\.?|drive|dr\.?|lane|ln\.?|crescent|close|industrial\s+park|centre|center)\b/i.test(s);
}
function pageAuthority(text=''){
  const lines=String(text).split(/\r?\n/).map(clean).filter(Boolean);
  for(const l of lines.slice(0,80)){if(PROHIBITED.test(l))return {allowed:false,type:'noninvoice',reason:l};}
  return INVOICE.test(lines.slice(0,120).join(' '))?{allowed:true,type:'invoice'}:{allowed:false,type:'unknown'};
}
function modelShaped(v=''){
  const s=clean(v); if(s.length<3||s.length>40||!/[A-Za-z]/.test(s)||!/[0-9]/.test(s))return false;
  if(/^(?:INV|VIN|PO|DO|GST|UEN|TEL|FAX|SGD)/i.test(s))return false;
  if(/^\d+(?:\.\d+)?$/.test(s))return false;
  return /^[A-Za-z0-9][A-Za-z0-9+._\/-]*$/.test(s);
}
function modelFromBlock(text=''){
  const lines=String(text).split(/\r?\n|\s+\|\s+/).map(clean).filter(Boolean);
  for(const l of lines){
    const m=l.match(/\b(?:model|sku|part\s*(?:no\.?|number)|item\s*code)\b\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9+._\/-]{2,39})/i);
    if(m&&modelShaped(m[1]))return m[1];
  }
  for(const l of lines){
    const toks=l.match(/[A-Za-z0-9][A-Za-z0-9+._\/-]{2,39}/g)||[];
    for(const t of toks){
      if(modelShaped(t)&&!META.test(l)&&!/^(?:SGD|GST|UEN)$/i.test(t))return t;
    }
  }
  return '';
}
function economicsFromBlock(text=''){
  const s=String(text), lines=s.split(/\r?\n/).map(clean).filter(Boolean);
  let qty=null,unit=null,amount=null;
  for(const line of lines){
    const matches=[...line.matchAll(/(?:SGD\s*|S?\$\s*)?(\d[\d,]*\.\d{2})/gi)];
    const vals=matches.map(m=>money(m[1])).filter(Number.isFinite);
    if(vals.length>=3){
      const a=vals[0],b=vals[1],z=vals[vals.length-1];
      if(a>0&&a<1000&&Number.isInteger(a)&&b>0&&Math.abs(a*b-z)<=Math.max(0.08,Math.abs(z)*0.01)){
        qty=a;unit=b;amount=z;break;
      }
    }
    if(vals.length>=2){
      const z=vals[vals.length-1],b=vals[vals.length-2],prefix=line.slice(0,matches[0]?.index||0);
      const ints=[...prefix.matchAll(/(?:^|\s)(\d{1,3})(?=\s|$)/g)].map(m=>Number(m[1])).filter(n=>n>0&&n<1000);
      const q=ints.length?ints[ints.length-1]:null;
      if(q&&Math.abs(q*b-z)<=Math.max(0.08,Math.abs(z)*0.01)){qty=q;unit=b;amount=z;break;}
      if(Math.abs(b-z)<=0.01){qty=1;unit=b;amount=z;break;}
    }
    if(vals.length===1&&modelFromBlock(line)&&EQUIPMENT.test(line)){
      qty=1;unit=vals[0];amount=vals[0];break;
    }
  }
  if(qty===null&&unit!==null&&amount!==null&&unit>0){const x=amount/unit;if(Number.isInteger(x)&&x>0&&x<1000)qty=x;}
  return {quantity:qty,unit_price:unit,amount};
}
function canonicalDesc(lines=[]){
  for(const l0 of lines){
    let l=clean(l0).replace(/^[|\[\](){}\s]*\d{1,2}\s*[|.)\-:]?\s*/,'');
    l=l.replace(/\s+(?:\d{1,3}(?:\.00)?\s+)?(?:SGD\s*|S?\$\s*)?\d[\d,]*\.\d{2}.*$/i,'').trim();
    if(!l||META.test(l)||isAddress(l)||/^\s*(?:model|sku|part\s*(?:no|number)|warranty|s\/n|serial)\b/i.test(l))continue;
    if(EQUIPMENT.test(l)&&!SERVICE.test(l))return l;
  }
  return '';
}
function numberedBlocks(lines=[]){
  const starts=[];
  for(let i=0;i<lines.length;i++){const m=lines[i].match(/^[|\[\](){}\s]*(\d{1,2})(?:\s*[|.)\-:]\s*|\s+)(?=[A-Za-z])(.+)/);if(m)starts.push({i,n:Number(m[1])});}
  const out=[];
  for(let x=0;x<starts.length;x++){
    const a=starts[x].i,b=starts[x+1]?.i??lines.length,bl=lines.slice(a,b);
    if(bl.length)out.push(bl);
  }
  return out;
}
function paragraphBlocks(lines=[]){
  const out=[];let cur=[];
  const flush=()=>{if(cur.length){out.push(cur);cur=[];}};
  for(const l of lines){
    if(!l){flush();continue;}
    if(/^(?:subtotal|gst|amount\s+due|invoice\s+total|total\b)/i.test(l)){flush();continue;}
    cur.push(l);
  }flush();return out;
}
function equipmentAnchorBlocks(lines=[]){
  const starts=[];
  for(let i=0;i<lines.length;i++){
    const line=clean(lines[i]);
    if(!line||META.test(line)||isAddress(line)||SERVICE.test(line)||!EQUIPMENT.test(line))continue;
    const hasModel=!!modelFromBlock(line);
    const moneyCount=[...line.matchAll(/\d[\d,]*\.\d{2}/g)].length;
    if(!hasModel&&moneyCount===0)continue;
    const prev=clean(lines[i-1]||'');
    if(i>0&&EQUIPMENT.test(prev)&&modelFromBlock(prev))continue;
    starts.push(i);
  }
  const out=[];
  for(let x=0;x<starts.length;x++){
    const a=starts[x],b=starts[x+1]??Math.min(lines.length,a+12);
    out.push(lines.slice(a,b));
  }
  return out;
}
function scoreBlock(lines=[]){
  const text=lines.join('\n'), desc=canonicalDesc(lines);
  if(!desc||SERVICE.test(desc)||isAddress(text))return null;
  const econ=economicsFromBlock(text), model=modelFromBlock(text);
  const evidence=(model?4:0)+(econ.amount!==null?3:0)+(econ.unit_price!==null?2:0)+(econ.quantity!==null?1:0)+(EQUIPMENT.test(desc)?3:0);
  if(evidence<4)return null;
  return {sku:model,model,item_name:desc,description:desc,...econ,source_block:text,evidence_score:evidence};
}
function dedupeBlocks(rows=[]){
  const out=[];
  for(const r of rows){
    const key=compact(r.sku||r.model||'');
    let hit=key?out.find(x=>compact(x.sku||x.model||'')===key):null;
    if(!hit){
      const words=clean(r.item_name).toLowerCase().split(/\W+/).filter(x=>x.length>3);
      hit=out.find(x=>{const s=clean(x.item_name).toLowerCase();return words.length>=2&&words.filter(w=>s.includes(w)).length>=Math.min(2,words.length);});
    }
    if(!hit){out.push({...r});continue;}
    if(!hit.sku&&r.sku){hit.sku=r.sku;hit.model=r.model;}
    for(const f of ['quantity','unit_price','amount'])if((hit[f]===null||hit[f]===undefined)&&r[f]!==null&&r[f]!==undefined)hit[f]=r[f];
    if((r.evidence_score||0)>(hit.evidence_score||0)){hit.source_block=r.source_block;hit.evidence_score=r.evidence_score;if(r.item_name)hit.item_name=hit.description=r.item_name;}
  }
  return out;
}
function extractSourceRows(pages=[]){
  const rows=[];
  for(const page of pages){
    const text=String(page?.text??page??'');
    const auth=pageAuthority(text); if(!auth.allowed)continue;
    const lines=text.split(/\r?\n/).map(clean);
    const numbered=numberedBlocks(lines);
    const anchors=equipmentAnchorBlocks(lines);
    const groups=numbered.length?numbered:(anchors.length?anchors:paragraphBlocks(lines));
    for(const g of groups){const r=scoreBlock(g);if(r&&!ACCESSORY.test(r.item_name))rows.push(r);}
  }
  return dedupeBlocks(rows);
}
function similarity(a='',b=''){
  const aw=new Set(clean(a).toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>3&&!['with','from','system'].includes(x)));
  const bw=new Set(clean(b).toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>3&&!['with','from','system'].includes(x)));
  if(!aw.size||!bw.size)return 0; let n=0; for(const w of aw)if(bw.has(w))n++; return n/Math.max(aw.size,bw.size);
}
function findMatch(row,sourceRows,used){
  const id=compact(row.sku||row.model||'');
  if(id){const exact=sourceRows.map((x,i)=>({x,i})).find(o=>!used.has(o.i)&&compact(o.x.sku||o.x.model||'')===id);if(exact)return exact;}
  const ranked=sourceRows.map((x,i)=>({x,i,s:used.has(i)?-1:similarity(row.item_name||row.description,x.item_name)})).sort((a,b)=>b.s-a.s);
  if(ranked[0]?.s>=0.5&&(ranked.length<2||ranked[0].s-ranked[1].s>=0.15))return ranked[0];
  return null;
}
function reconcile(upstreamRows=[],pages=[]){
  const sourceRows=extractSourceRows(pages),used=new Set(),out=[],conflicts=[];
  for(const row0 of upstreamRows||[]){
    const row={...row0},m=findMatch(row,sourceRows,used);
    if(!m){out.push(row);continue;} used.add(m.i); const src=m.x;
    const current=clean(row.sku||row.model||''),printed=clean(src.sku||src.model||'');
    if(!current&&printed){row.sku=printed;row.model=printed;row.shadow_recovered_identity=true;}
    else if(current&&printed&&compact(current)!==compact(printed)){row.shadow_conflict=true;conflicts.push({field:'sku',current,source:printed,item:row.item_name||row.description||''});}
    for(const f of ['quantity','unit_price','amount']){
      const a=row[f],b=src[f];
      if((a===null||a===undefined||a==='')&&b!==null&&b!==undefined){row[f]=b;row['shadow_recovered_'+f]=true;}
      else if(a!==null&&a!==undefined&&a!==''&&b!==null&&b!==undefined&&Math.abs(Number(a)-Number(b))>0.01){row.shadow_conflict=true;conflicts.push({field:f,current:a,source:b,item:row.item_name||row.description||''});}
    }
    row.shadow_source_block=src.source_block; out.push(row);
  }
  sourceRows.forEach((src,i)=>{if(!used.has(i))out.push({...src,shadow_recovered_missing_row:true,needsReview:true,humanReviewRequired:true});});
  const mapped=sourceRows.filter(src=>out.some(r=>compact(src.sku||src.model||'')&&compact(r.sku||r.model||'')===compact(src.sku||src.model||''))).length;
  return {
    version:VERSION,mode:'shadow-only',outputRows:out,sourceRows,
    completeness:{expectedEquipmentCount:sourceRows.length,finalEquipmentCount:out.filter(r=>EQUIPMENT.test(r.item_name||r.description||'')&&!SERVICE.test(r.item_name||r.description||'')).length,sourceIdentityCoverage:mapped,countMatch:out.filter(r=>EQUIPMENT.test(r.item_name||r.description||'')&&!SERVICE.test(r.item_name||r.description||'')).length===sourceRows.length},
    conflicts,
    ready:conflicts.length===0&&sourceRows.length>0&&out.filter(r=>EQUIPMENT.test(r.item_name||r.description||'')&&!SERVICE.test(r.item_name||r.description||'')).length===sourceRows.length
  };
}
function selfTest(){
  const failures=[];
  const pages=[{text:'TAX INVOICE\n1 Digital Mixer console 1 1400.00 1400.00\nModel: CQ12T\n2 Passive Loudspeaker 6 800.00 4800.00\nModel: ZX1I-90'}];
  let r=reconcile([{sku:'',item_name:'Digital Mixer console',quantity:1,unit_price:1400,amount:1400}],pages);
  if(!r.outputRows.some(x=>compact(x.sku)==='CQ12T'))failures.push('printed sku recovery');
  if(!r.outputRows.some(x=>compact(x.sku)==='ZX1I90'&&x.shadow_recovered_missing_row))failures.push('missing row recovery');
  r=reconcile([{sku:'WRONG1',item_name:'Digital Mixer console'}],pages);
  if(!r.conflicts.some(x=>x.field==='sku'))failures.push('cross-row/conflict fail-closed');
  return {ok:!failures.length,failures,version:VERSION};
}
root.InventoryHubV411Fixes15Shadow=Object.freeze({VERSION,pageAuthority,extractSourceRows,reconcile,selfTest});
})(typeof window!=='undefined'?window:globalThis);
