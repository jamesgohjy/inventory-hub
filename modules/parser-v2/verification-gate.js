// Inventory Hub Parser V2 — authoritative equipment verification gate
(function(global){
  'use strict';
  const VERSION='2.1-authoritative-verification';

  const clean=v=>String(v??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const compact=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const round=n=>Math.round(Number(n)*100)/100;
  const EQUIPMENT_RE=/\b(?:projector|microphone|speaker|loudspeaker|controller|control panel|keypad|camera|mixer|display|monitor|transmitter|receiver|screen|wireless system|amplifier|processor|switcher|visualizer|document camera|console|player|receptacle|audio tester|signal tester|tester|analyzer|analyser|meter|dsp|video processor|matrix|scaler)\b/i;
  const SERVICE_RE=/\b(?:installation|installing|labou?r|professional services?|commissioning|testing|programming|dismantle|dismount|transport|delivery(?: fee| charge| service)?|return trip|redelivery|courier|freight|service charge|repair(?: service| work)?|system tuning|calibration|training|consultancy|consulting|manpower|on[- ]?site support)\b/i;
  const ACCESSORY_RE=/\b(?:security lock|kensington lock|safety (?:wire|cable)|cables?|wires?|cords?|patch leads?|brackets?|mounts?|lamp kits?|lampkits?|replacement projector lamp|projector lamp|carts?|trolleys?|power adapt(?:er|or)s?|ac adapt(?:er|or)s?)\b/i;
  const WARRANTY_RE=/\b(?:warranty|extended warranty|support coverage|maintenance coverage|service contract)\b/i;
  const HEADER_META_RE=/\b(?:invoice\s*(?:no|number|date)?|tax invoice|customer(?: code)?|sold to|bill to|ship to|delivered to|attention|attn\.?|terms|salesman|reference|ref\.?\s*no|p\/?o\s*no|purchase order|gst\s*(?:reg|registration)|uen|company\s*(?:reg|registration)|co\.?\s*reg|telephone|tel\.?|fax\.?|e-?mail|email|website|www\.|postal(?: code)?|amount due|sub\s*total|subtotal|grand total|total amount)\b/i;
  const COMPANY_RE=/\b(?:pte\.?\s*ltd\.?|private limited|limited|ltd\.?|llp|llc|inc\.?|corporation|corp\.?)\b/i;
  const ADDRESS_RE=/(?:\b(?:blk|block)\s*\d+\b|#\d{1,2}-\d{1,4}\b|\bsingapore\s+\d{5,6}\b|\b\d{1,4}\s+[a-z][a-z .'-]{2,40}\s+(?:road|rd\.?|street|st\.?|avenue|ave\.?|drive|lane|crescent|close|way)\b)/i;
  const MODEL_RE=/^[A-Z0-9][A-Z0-9+._\/-]{2,31}$/i;
  const STOP=new Set(['the','and','with','for','from','into','supply','including','include','set','pcs','piece','unit','units','each']);

  function economics(row={}){
    const q=Number(row.quantity),p=Number(row.unit_price),a=Number(row.amount);
    if(!(q>0)||!Number.isFinite(p)||!Number.isFinite(a))return {complete:false,ok:false,delta:null};
    const delta=Math.abs(q*p-a),tol=Math.max(.06,Math.abs(a)*.005);
    return {complete:true,ok:delta<=tol,delta:round(delta)};
  }
  function textFor(row={}){return clean([row.sku,row.model,row.item_name,row.description].filter(Boolean).join(' '));}
  function isDefiniteNonEquipment(row={}){
    const text=textFor(row);
    if(!text)return {reject:true,reason:'empty-row'};
    if(HEADER_META_RE.test(text))return {reject:true,reason:'header-or-contact-metadata'};
    if(COMPANY_RE.test(text)&&!EQUIPMENT_RE.test(text))return {reject:true,reason:'company-header'};
    if(ADDRESS_RE.test(text))return {reject:true,reason:'address-metadata'};
    if(WARRANTY_RE.test(text))return {reject:true,reason:'warranty-or-support'};
    const sku=clean(row.sku||row.model||'');
    const serviceSku=/^(?:INSTALL(?:ATION)?|LABOU?R|SERVICE|REPAIR|DELIVERY|FREIGHT|TRANSPORT|COURIER|DISMOUNT|DISMANTLE)/i.test(sku);
    const strongServiceStart=/^(?:installation|installing|labou?r|professional services?|service|repair|delivery|freight|transport|courier|commissioning|testing|programming|dismantle|dismount)\b/i.test(clean(row.item_name||row.description||''));
    if(serviceSku||strongServiceStart||(SERVICE_RE.test(text)&&!EQUIPMENT_RE.test(text)))return {reject:true,reason:'service-or-labour'};
    if(ACCESSORY_RE.test(text)&&!/\b(?:microphone|mic)\s+stands?\b/i.test(text)&&!EQUIPMENT_RE.test(text))return {reject:true,reason:'excluded-accessory'};
    return {reject:false,reason:''};
  }
  function rowTokens(row={}){return norm([row.item_name,row.description].filter(Boolean).join(' ')).split(' ').filter(t=>t.length>=3&&!STOP.has(t));}
  function sourceProof(row={},raw=''){
    if(row.layoutEvidenceVerified===true||row.economicEvidenceVerified===true||row.v690NumberedEvidence===true)return {ok:true,method:'structured-evidence'};
    const lines=String(raw||'').replace(/\r/g,'').split('\n').map(clean).filter(Boolean);
    if(!lines.length)return {ok:false,method:'no-source-text'};
    const sku=compact(row.sku||row.model||''),tokens=rowTokens(row),q=Number(row.quantity);
    const matchLine=line=>{
      const lc=compact(line);if(sku.length>=3&&lc.includes(sku))return true;
      if(tokens.length){const n=norm(line),hits=tokens.filter(t=>n.includes(t)).length;return hits>=Math.min(2,tokens.length);}
      return false;
    };
    for(let i=0;i<lines.length;i++){
      if(!matchLine(lines[i]))continue;
      const windowText=lines.slice(Math.max(0,i-1),Math.min(lines.length,i+3)).join(' ');
      const money=[...windowText.matchAll(/(?:SGD\s*|S?\$\s*)?\d[\d,]*(?:\.\d{2})/gi)];
      const qToken=String(q).replace(/[.*+?^$()|[\]\\{}]/g,'\\$&');
      const quantityOk=Number.isFinite(q)&&q>0?new RegExp('(?:^|\\s)'+qToken+'(?:\\s|$)').test(windowText):true;
      if(money.length>=2&&quantityOk)return {ok:true,method:'source-neighbourhood',line:i+1};
    }
    return {ok:false,method:'no-priced-source-row'};
  }
  function level1(row={},ctx={}){
    const blocked=isDefiniteNonEquipment(row);if(blocked.reject)return {status:'reject',reason:blocked.reason};
    const text=textFor(row),econ=economics(row),proof=sourceProof(row,ctx.raw||'');
    const model=clean(row.sku||row.model||''),modelLike=MODEL_RE.test(model)&&/\d/.test(model),equipmentWord=EQUIPMENT_RE.test(text);
    if(!proof.ok){
      if(equipmentWord||modelLike)return {status:'review',reason:'source-row-not-proven',proof,economics:econ};
      return {status:'reject',reason:'not-proven-as-line-item',proof,economics:econ};
    }
    if(!econ.ok){
      if(equipmentWord||modelLike)return {status:'review',reason:'line-item-economics-unverified',proof,economics:econ};
      return {status:'reject',reason:'unverified-economics',proof,economics:econ};
    }
    if(equipmentWord)return {status:'verified',reason:'physical-equipment-description',proof,economics:econ};
    if(modelLike)return {status:'candidate',reason:'model-and-priced-row-proven',proof,economics:econ};
    return {status:'review',reason:'physical-equipment-identity-unproven',proof,economics:econ};
  }

  const CONFUSABLE=new Set(['0O','O0','1I','I1','1L','L1','5S','S5','8B','B8','2Z','Z2','6G','G6']);
  function weightedDistance(a='',b=''){
    const x=compact(a),y=compact(b),m=x.length,n=y.length;if(!m&&!n)return 0;if(!m)return n;if(!n)return m;
    let prev=Array.from({length:n+1},(_,j)=>j),cur=new Array(n+1);
    for(let i=1;i<=m;i++){cur[0]=i;for(let j=1;j<=n;j++){const pair=x[i-1]+y[j-1],sub=x[i-1]===y[j-1]?0:(CONFUSABLE.has(pair)?.15:1);cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+sub);}const tmp=prev;prev=cur;cur=tmp;}
    return prev[n];
  }
  function skuSimilarity(a='',b=''){const x=compact(a),y=compact(b);if(!x||!y)return 0;if(x===y)return 1;return Math.max(0,1-weightedDistance(x,y)/Math.max(x.length,y.length));}
  function tokenSimilarity(a='',b=''){
    const A=new Set(norm(a).split(' ').filter(x=>x.length>=3&&!STOP.has(x))),B=new Set(norm(b).split(' ').filter(x=>x.length>=3&&!STOP.has(x)));
    if(!A.size||!B.size)return 0;let shared=0;for(const t of A)if(B.has(t))shared++;return shared/Math.max(A.size,B.size);
  }
  function inventoryMatches(row={},inventoryItems=[],supplierName=''){
    const candidateSku=clean(row.sku||row.model||'');if(!candidateSku)return [];
    const dedup=new Map();for(const item of inventoryItems||[]){const sku=clean(item?.sku||item?.model||'');if(!sku)continue;const key=compact(sku);if(!key||dedup.has(key))continue;dedup.set(key,item);}
    const out=[];
    for(const item of dedup.values()){
      const sku=clean(item.sku||item.model||''),ss=skuSimilarity(candidateSku,sku),ns=tokenSimilarity(row.item_name||row.description||'',item.item_name||item.description||'');
      const supplierA=norm(supplierName),supplierB=norm(item.supplier||item.vendor||''),supplierBonus=supplierA&&supplierB&&(supplierA.includes(supplierB)||supplierB.includes(supplierA))?3:0;
      let score=compact(candidateSku)===compact(sku)?100:ss*85+ns*12+supplierBonus;score=Math.min(100,Math.round(score*10)/10);
      out.push({item,score,skuSimilarity:Math.round(ss*1000)/10,nameSimilarity:Math.round(ns*1000)/10});
    }
    return out.sort((a,b)=>b.score-a.score);
  }
  function chooseInventoryMatch(row={},inventoryItems=[],supplierName=''){
    const ranked=inventoryMatches(row,inventoryItems,supplierName),best=ranked[0],second=ranked[1];if(!best)return {status:'none',score:0,secondScore:0};
    const margin=best.score-(second?.score||0),exact=compact(row.sku||row.model||'')===compact(best.item.sku||best.item.model||''),accepted=exact||(best.score>=96&&margin>=8);
    return {status:accepted?'confirmed':'unconfirmed',score:best.score,secondScore:second?.score||0,margin:Math.round(margin*10)/10,exact,item:best.item,ranked:ranked.slice(0,3)};
  }
  function canonicalizeFromInventory(row={},match={}){
    const item=match.item||{};
    return {...row,sku:clean(item.sku||row.sku||row.model||''),item_name:clean(item.item_name||row.item_name||row.description||''),category:clean(item.category||row.category||''),parserV2Verification:{level:'2A',status:'confirmed',method:match.exact?'exact-inventory-sku':'high-confidence-inventory-sku',score:match.score,matchedInventoryId:item.id??null,matchedSku:clean(item.sku||'')},humanReviewRequired:false,needsReview:false,parserReviewRequired:false};
  }
  async function verifyOne(row={},ctx={}){
    const l1=level1(row,ctx);if(l1.status==='reject')return {bucket:'rejected',row,level1:l1,reason:l1.reason};
    if(l1.status==='review')return {bucket:'pending',row:{...row,humanReviewRequired:true,needsReview:true,parserReviewRequired:true},level1:l1,reason:l1.reason};
    const inv=chooseInventoryMatch(row,ctx.inventoryItems||[],ctx.supplierName||'');if(inv.status==='confirmed')return {bucket:'verified',row:canonicalizeFromInventory(row,inv),level1:l1,inventory:inv,reason:'inventory-confirmed'};
    if(l1.status==='verified'&&!clean(row.sku||row.model||''))return {bucket:'pending',row:{...row,humanReviewRequired:true,needsReview:true,parserReviewRequired:true},level1:l1,inventory:inv,reason:'equipment-description-proven-model-unavailable'};
    const web=ctx.webVerifier;
    if(web&&typeof web.candidateForRow==='function'&&typeof web.requestWebEvidence==='function'){
      const candidate=web.candidateForRow(row,ctx.raw||'');
      if(candidate){
        const result=await web.requestWebEvidence(candidate,{timeoutMs:6500});
        if(result?.status==='confirmed')return {bucket:'verified',row:{...row,parserV2Verification:{level:'2B',status:'confirmed',method:'public-web',confidence:result.confidence??null,sources:(result.sources||[]).slice(0,3)},humanReviewRequired:false,needsReview:false,parserReviewRequired:false},level1:l1,inventory:inv,web:result,reason:'web-confirmed'};
        return {bucket:'pending',row:{...row,humanReviewRequired:true,needsReview:true,parserReviewRequired:true},level1:l1,inventory:inv,web:result,reason:result?.status==='unavailable'?'web-unavailable':'web-unconfirmed'};
      }
    }
    return {bucket:'pending',row:{...row,humanReviewRequired:true,needsReview:true,parserReviewRequired:true},level1:l1,inventory:inv,reason:l1.status==='verified'?'equipment-proven-model-needs-user-check':'equipment-candidate-needs-user-check'};
  }
  async function mapLimit(list=[],limit=3,fn=async x=>x){
    const out=new Array(list.length);let cursor=0;
    async function worker(){for(;;){const i=cursor++;if(i>=list.length)return;out[i]=await fn(list[i],i);}}
    await Promise.all(Array.from({length:Math.min(limit,list.length)},()=>worker()));return out;
  }
  async function verifyParsed(parsed={},ctx={}){
    const verified=[],pending=[],rejected=[],decisions=[],items=parsed.items||[];
    const results=await mapLimit(items,3,async(original,i)=>({original:{...(original||{})},result:await verifyOne({...original},{...ctx,supplierName:ctx.supplierName||parsed?.doc?.supplier_name||''}),i}));
    for(const entry of results){
      const original=entry.original,result=entry.result,i=entry.i,id=String(original.rowId||original.v7RowId||'candidate-'+(i+1));
      const decision={id,index:i+1,bucket:result.bucket,reason:result.reason,level1:result.level1,inventory:result.inventory?{status:result.inventory.status,score:result.inventory.score,secondScore:result.inventory.secondScore,margin:result.inventory.margin,matchedSku:clean(result.inventory.item?.sku||'')}:null,web:result.web?{status:result.web.status,confidence:result.web.confidence??null,reason:result.web.reason||'',sources:(result.web.sources||[]).slice(0,3)}:null};
      decisions.push(decision);
      if(result.bucket==='verified')verified.push({...result.row,v2CandidateId:id});
      else if(result.bucket==='pending')pending.push({...result.row,v2CandidateId:id,v2VerificationReason:result.reason,v2InventoryMatch:decision.inventory,v2WebMatch:decision.web});
      else rejected.push({...original,v2CandidateId:id,v2RejectionReason:result.reason});
    }
    const report={version:VERSION,mode:'authoritative',verifiedCount:verified.length,pendingCount:pending.length,rejectedCount:rejected.length,pending,rejected,decisions,completedAt:new Date().toISOString()};
    return {parsed:{...parsed,items:verified,v2Verification:report,parserV2Mode:'authoritative'},report};
  }
  function selfTest(){
    const failures=[],addr={item_name:'123 Example Road Singapore 123456',description:'123 Example Road Singapore 123456',quantity:1,unit_price:100,amount:100};
    if(level1(addr,{raw:'123 Example Road Singapore 123456 1 100.00 100.00'}).status!=='reject')failures.push('address metadata rejection');
    const svc={sku:'INSTALL',item_name:'Installation labour',quantity:1,unit_price:100,amount:100};if(level1(svc,{raw:'INSTALL Installation labour 1 100.00 100.00'}).status!=='reject')failures.push('service rejection');
    const eq={sku:'CQ12T',item_name:'Digital mixer console',quantity:1,unit_price:1400,amount:1400},l1=level1(eq,{raw:'CQ12T Digital mixer console 1 1400.00 1400.00'});if(!['verified','candidate'].includes(l1.status))failures.push('valid equipment level1');
    const inv=chooseInventoryMatch({sku:'SLXD24-SM5B',item_name:'Digital wireless microphone system'},[{id:1,sku:'SLXD24/SM58',item_name:'Digital wireless microphone system'}],'');if(inv.status!=='confirmed'||inv.score<96)failures.push('ocr-aware inventory sku match');
    const bad=chooseInventoryMatch({sku:'ZX11-90',item_name:'Passive loudspeaker'},[{id:1,sku:'ZX11-80',item_name:'Passive loudspeaker'}],'');if(bad.status==='confirmed')failures.push('real model digit difference must not auto-match');
    return {ok:failures.length===0,failures};
  }
  global.InventoryHubParserV2VerificationGate=Object.freeze({VERSION,economics,isDefiniteNonEquipment,sourceProof,level1,skuSimilarity,tokenSimilarity,inventoryMatches,chooseInventoryMatch,verifyOne,verifyParsed,selfTest});
})(typeof window!=='undefined'?window:globalThis);
