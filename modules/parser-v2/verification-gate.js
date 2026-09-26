// Inventory Hub Parser V2 — authoritative equipment verification gate
(function(global){
  'use strict';
  const VERSION='2.1-authoritative-verification';

  const clean=v=>String(v??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const compact=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const round=n=>Math.round(Number(n)*100)/100;
  const EQUIPMENT_RE=/\b(?:projector|microphone|speaker|loudspeaker|controller|control panel|keypad|camera|mixer|display|monitor|transmitter|receiver|screen|wireless system|amplifier|processor|switcher|visualizer|document camera|console|player|receptacle|audio tester|signal tester|tester|analyzer|analyser|meter|dsp|video processor|matrix|scaler)\b/i;
  const SERVICE_RE=/\b(?:install(?:ation|ing|ed)?|labou?r|professional services?|commission(?:ing|ed)?|test(?:ing|ed)?|programming|dismantl(?:e|ing|ed)|dismount(?:ing|ed)?|transport|delivery(?: fee| charge| service)?|return trip|redelivery|courier|freight|service charge|repair(?:ing|ed| service| work)?|remove|removal|relocat(?:e|ion|ing)|re-?instat(?:e|ement|ing)|system tuning|calibration|training|consultancy|consulting|manpower|on[- ]?site support|setup|configuration)\b/i;
  const SERVICE_ACTION_RE=/\b(?:install(?:ation|ing|ed)?|dismantl(?:e|ing|ed)|dismount(?:ing|ed)?|repair(?:ing|ed)?|remove|removal|relocat(?:e|ion|ing)|re-?instat(?:e|ement|ing)|test(?:ing|ed)?|commission(?:ing|ed)?|programming|setup|configuration)\b/i;
  const ACCESSORY_RE=/\b(?:security lock|kensington lock|safety (?:wire|cable)|cables?|wires?|cords?|patch leads?|brackets?|mounts?|lamp kits?|lampkits?|replacement projector lamp|projector lamp|carts?|trolleys?|power adapt(?:er|or)s?|ac adapt(?:er|or)s?)\b/i;
  const WARRANTY_RE=/\b(?:warranty|extended warranty|support coverage|maintenance coverage|service contract)\b/i;
  const HEADER_META_RE=/\b(?:invoice\s*(?:no|number|date)?|tax invoice|customer(?: code|copy)?|sold to|bill to|ship to|delivered to|attention|attn\.?|terms|salesman|reference\s*(?:no|number)?|ref\.?\s*(?:no|number)?|p\/?o\s*(?:no|number)?|purchase order|delivery order|quotation|gst\s*(?:reg|registration)|uen|company\s*(?:reg|registration)|co\.?\s*reg|telephone|tel\.?|fax\.?|e-?mail|email|website|www\.|postal(?: code)?|amount due|sub\s*total|subtotal|grand total|total amount|page\s+\d+)\b/i;
  const COMPANY_RE=/\b(?:pte\.?\s*ltd\.?|private limited|limited|ltd\.?|llp|llc|inc\.?|corporation|corp\.?)\b/i;
  const ADDRESS_RE=/(?:\b(?:blk|block)\s*\d+[a-z]?\b|#\s*\d{1,3}\s*[-/]\s*\d{1,5}\b|\bsingapore\s*\d{5,6}\b|\b\d{1,4}\s*[a-z][a-z0-9 .'-]{1,55}\s*(?:road|rd\.?|street|st\.?|avenue|ave\.?|drive|lane|crescent|close|way|walk|place|plaza|boulevard|terrace|industrial\s+park)\b)/i;
  const DATE_LABEL_RE=/\b(?:invoice\s+date|date\s+of\s+invoice|document\s+date|delivery\s+date|date)\s*[:#.-]/i;
  const DATE_VALUE_RE=/^(?:\d{1,2}[\/.-]\d{1,2}[\/.-](?:\d{2}|\d{4})|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}|\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{2,4})$/i;
  const MODEL_RE=/^[A-Z0-9][A-Z0-9+._\/-]{2,31}$/i;
  const STOP=new Set(['the','and','with','for','from','into','supply','including','include','set','pcs','piece','unit','units','each']);

  function economics(row={}){
    const q=Number(row.quantity),p=Number(row.unit_price),a=Number(row.amount);
    if(!(q>0)||!Number.isFinite(p)||!Number.isFinite(a))return {complete:false,ok:false,delta:null};
    const delta=Math.abs(q*p-a),tol=Math.max(.06,Math.abs(a)*.005);
    return {complete:true,ok:delta<=tol,delta:round(delta)};
  }
  function textFor(row={}){return clean([row.sku,row.model,row.item_name,row.description].filter(Boolean).join(' '));}
  function compactMetadata(v=''){return clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');}
  function matchesDocumentMetadata(row={},ctx={}){
    const fields=[row.sku,row.model,row.item_name,row.description].map(clean).filter(Boolean),joined=clean(fields.join(' ')),joinedCompact=compactMetadata(joined);
    const doc=ctx.doc||{};
    const checks=[
      ['supplier',ctx.supplierName||doc.supplier_name],
      ['invoice-number',doc.invoice_number],
      ['reference-number',doc.reference_number],
      ['delivery-order-number',doc.delivery_order_number],
      ['invoice-date',doc.invoice_date]
    ];
    for(const [kind,value0] of checks){
      const value=clean(value0);if(!value)continue;
      const vc=compactMetadata(value);if(vc.length<4)continue;
      if(fields.some(f=>compactMetadata(f)===vc))return {match:true,reason:'document-'+kind};
      if((kind==='supplier'||kind==='invoice-number'||kind==='reference-number'||kind==='delivery-order-number')&&joinedCompact===vc)return {match:true,reason:'document-'+kind};
      if(kind==='supplier'&&vc.length>=8&&joinedCompact.includes(vc)&&!EQUIPMENT_RE.test(joined))return {match:true,reason:'document-supplier'};
    }
    return {match:false,reason:''};
  }
  function isDefiniteNonEquipment(row={},ctx={}){
    const text=textFor(row),primary=clean(row.item_name||row.description||''),sku=clean(row.sku||row.model||'');
    if(!text)return {reject:true,reason:'empty-row'};
    const docMeta=matchesDocumentMetadata(row,ctx);if(docMeta.match)return {reject:true,reason:docMeta.reason};
    if(HEADER_META_RE.test(text))return {reject:true,reason:'header-or-contact-metadata'};
    if(COMPANY_RE.test(text)&&!EQUIPMENT_RE.test(text))return {reject:true,reason:'company-header'};
    if(ADDRESS_RE.test(text)||ADDRESS_RE.test(primary)||ADDRESS_RE.test(sku+' '+primary))return {reject:true,reason:'address-metadata'};
    if(DATE_LABEL_RE.test(text)||DATE_VALUE_RE.test(primary)||DATE_VALUE_RE.test(sku))return {reject:true,reason:'date-metadata'};
    if(WARRANTY_RE.test(text))return {reject:true,reason:'warranty-or-support'};
    const serviceSku=/^(?:INSTALL(?:ATION)?|LABOU?R|SERVICE|REPAIR|DELIVERY|FREIGHT|TRANSPORT|COURIER|DISMOUNT|DISMANTL|REMOV|RELOCAT|REINSTAT|TEST|COMMISSION|PROGRAM)/i.test(sku);
    const strongServiceStart=/^(?:installation|installing|installed|labou?r|professional services?|services?|repair|delivery|freight|transport|courier|commissioning|testing|programming|dismantle|dismantling|dismount|dismounting|remove|removal|relocate|relocation|reinstate|reinstatement|setup|configuration)\b/i.test(primary);
    if(serviceSku||strongServiceStart||SERVICE_ACTION_RE.test(primary)||(SERVICE_RE.test(text)&&!EQUIPMENT_RE.test(text)))return {reject:true,reason:'service-or-labour'};
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
    const blocked=isDefiniteNonEquipment(row,ctx);if(blocked.reject)return {status:'reject',reason:blocked.reason};
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
    const margin=best.score-(second?.score||0),exact=compact(row.sku||row.model||'')===compact(best.item.sku||best.item.model||''),accepted=exact||(best.score>=95&&margin>=8);
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
  function normalizedSkuKey(row={}){
    const value=clean(row.sku||row.model||''),key=compact(value);
    return key.length>=3?key:'';
  }
  function economicsKey(row={}){
    const n=v=>Number.isFinite(Number(v))?round(Number(v)).toFixed(2):'';
    return [n(row.quantity),n(row.unit_price),n(row.amount)].join('|');
  }
  function verificationRank(entry={}){
    const row=entry.row||{},v=row.parserV2Verification||{};let score=entry.bucket==='verified'?100:0;
    if(v.level==='2A')score+=40;if(v.level==='2B')score+=30;
    if(v.method==='exact-inventory-sku')score+=15;
    if(String(row.item_name||'').trim())score+=3;if(String(row.description||'').trim())score+=2;
    return score;
  }
  function consolidateUniqueSku(verified=[],pending=[],rejected=[]){
    const groups=new Map(),passthrough=[];
    for(const entry of [
      ...(verified||[]).map(row=>({bucket:'verified',row})),
      ...(pending||[]).map(row=>({bucket:'pending',row}))
    ]){
      const key=normalizedSkuKey(entry.row);
      if(!key){passthrough.push(entry);continue;}
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(entry);
    }
    const outVerified=[],outPending=[],outRejected=[...(rejected||[])];
    for(const entry of passthrough)(entry.bucket==='verified'?outVerified:outPending).push(entry.row);
    let collapsedCount=0,conflictCount=0;
    for(const [key,entries] of groups.entries()){
      if(entries.length===1){const e=entries[0];(e.bucket==='verified'?outVerified:outPending).push(e.row);continue;}
      const ranked=[...entries].sort((a,b)=>verificationRank(b)-verificationRank(a)),best=ranked[0],economics=[...new Set(entries.map(e=>economicsKey(e.row)))],ids=entries.map(e=>String(e.row.v2CandidateId||'')).filter(Boolean),displaySku=clean(best.row.sku||best.row.model||'');
      if(economics.length===1){
        const kept={...best.row,parserV2Dedup:{status:'collapsed',sku:displaySku,normalizedSku:key,duplicateCount:entries.length-1,candidateIds:ids}};
        (best.bucket==='verified'?outVerified:outPending).push(kept);collapsedCount+=entries.length-1;
        for(const e of ranked.slice(1))outRejected.push({...e.row,v2RejectionReason:'duplicate-sku-collapsed',duplicateOf:String(kept.v2CandidateId||''),duplicateSku:displaySku});
      }else{
        const variants=entries.map(e=>({candidateId:String(e.row.v2CandidateId||''),quantity:e.row.quantity??null,unit_price:e.row.unit_price??null,amount:e.row.amount??null,bucket:e.bucket}));
        const conflict={...best.row,humanReviewRequired:true,needsReview:true,parserReviewRequired:true,v2VerificationReason:'duplicate-sku-economic-conflict',parserV2Dedup:{status:'conflict',sku:displaySku,normalizedSku:key,duplicateCount:entries.length-1,candidateIds:ids,variants}};
        outPending.push(conflict);conflictCount++;
        for(const e of ranked.slice(1))outRejected.push({...e.row,v2RejectionReason:'duplicate-sku-conflict-member',duplicateOf:String(conflict.v2CandidateId||''),duplicateSku:displaySku});
      }
    }
    return {verified:outVerified,pending:outPending,rejected:outRejected,collapsedCount,conflictCount};
  }
  async function verifyParsed(parsed={},ctx={}){
    const verified=[],pending=[],rejected=[],decisions=[],items=parsed.items||[];
    const results=await mapLimit(items,3,async(original,i)=>({original:{...(original||{})},result:await verifyOne({...original},{...ctx,doc:parsed?.doc||{},supplierName:ctx.supplierName||parsed?.doc?.supplier_name||''}),i}));
    for(const entry of results){
      const original=entry.original,result=entry.result,i=entry.i,id=String(original.rowId||original.v7RowId||'candidate-'+(i+1));
      const decision={id,index:i+1,bucket:result.bucket,reason:result.reason,level1:result.level1,inventory:result.inventory?{status:result.inventory.status,score:result.inventory.score,secondScore:result.inventory.secondScore,margin:result.inventory.margin,matchedSku:clean(result.inventory.item?.sku||'')}:null,web:result.web?{status:result.web.status,confidence:result.web.confidence??null,reason:result.web.reason||'',sources:(result.web.sources||[]).slice(0,3)}:null};
      decisions.push(decision);
      if(result.bucket==='verified')verified.push({...result.row,v2CandidateId:id});
      else if(result.bucket==='pending')pending.push({...result.row,v2CandidateId:id,v2VerificationReason:result.reason,v2InventoryMatch:decision.inventory,v2WebMatch:decision.web});
      else rejected.push({...original,v2CandidateId:id,v2RejectionReason:result.reason});
    }
    const unique=consolidateUniqueSku(verified,pending,rejected);
    const report={version:VERSION,mode:'authoritative',verifiedCount:unique.verified.length,pendingCount:unique.pending.length,rejectedCount:unique.rejected.length,pending:unique.pending,rejected:unique.rejected,decisions,deduplicatedSkuCount:unique.collapsedCount,duplicateSkuConflictCount:unique.conflictCount,completedAt:new Date().toISOString()};
    return {parsed:{...parsed,items:unique.verified,v2Verification:report,parserV2Mode:'authoritative'},report};
  }
  function selfTest(){
    const failures=[],addr={sku:'1RafflesInstitution',item_name:'Lane',description:'Lane',quantity:1,unit_price:4,amount:4};
    if(level1(addr,{raw:'1RafflesInstitution Lane 1 4.00 4.00'}).status!=='reject')failures.push('collapsed address metadata rejection');
    const addr2={item_name:'123 Example Road Singapore 123456',description:'123 Example Road Singapore 123456',quantity:1,unit_price:100,amount:100};
    if(level1(addr2,{raw:'123 Example Road Singapore 123456 1 100.00 100.00'}).status!=='reject')failures.push('address metadata rejection');
    const supplier={item_name:'Example AV Pte Ltd',description:'Example AV Pte Ltd',quantity:1,unit_price:20,amount:20};
    if(level1(supplier,{raw:'Example AV Pte Ltd 1 20.00 20.00',supplierName:'Example AV Pte Ltd',doc:{supplier_name:'Example AV Pte Ltd'}}).status!=='reject')failures.push('supplier metadata rejection');
    const invNo={sku:'INV-12345',item_name:'INV-12345',quantity:1,unit_price:1,amount:1};
    if(level1(invNo,{raw:'INV-12345 1 1.00 1.00',doc:{invoice_number:'INV-12345'}}).status!=='reject')failures.push('invoice number metadata rejection');
    const refNo={sku:'VSO17-035483',item_name:'VSO17-035483',quantity:1,unit_price:1,amount:1};
    if(level1(refNo,{raw:'VSO17-035483 1 1.00 1.00',doc:{reference_number:'VSO17-035483'}}).status!=='reject')failures.push('reference number metadata rejection');
    const dateRow={item_name:'15/12/2023',description:'15/12/2023',quantity:1,unit_price:1,amount:1};
    if(level1(dateRow,{raw:'15/12/2023 1 1.00 1.00',doc:{invoice_date:'2023-12-15'}}).status!=='reject')failures.push('date metadata rejection');
    const svc={sku:'',item_name:'Dismantle existing projector and install replacement projector',quantity:1,unit_price:100,amount:100};if(level1(svc,{raw:'Dismantle existing projector and install replacement projector 1 100.00 100.00'}).status!=='reject')failures.push('service action rejection');
    const eq={sku:'CQ12T',item_name:'Digital mixer console',quantity:1,unit_price:1400,amount:1400},l1=level1(eq,{raw:'CQ12T Digital mixer console 1 1400.00 1400.00'});if(!['verified','candidate'].includes(l1.status))failures.push('valid equipment level1');
    const inv=chooseInventoryMatch({sku:'SLXD24-SM5B',item_name:'Digital wireless microphone system'},[{id:1,sku:'SLXD24/SM58',item_name:'Digital wireless microphone system'}],'');if(inv.status!=='confirmed'||inv.score<95)failures.push('ocr-aware inventory sku match');
    const bad=chooseInventoryMatch({sku:'ZX11-90',item_name:'Passive loudspeaker'},[{id:1,sku:'ZX11-80',item_name:'Passive loudspeaker'}],'');if(bad.status==='confirmed')failures.push('real model digit difference must not auto-match');
    const dupeSame=consolidateUniqueSku(
      [{sku:'PT-VW540',item_name:'Panasonic projector',quantity:1,unit_price:804,amount:804,v2CandidateId:'a',parserV2Verification:{level:'2A',method:'exact-inventory-sku'}},{sku:'pt vw540',item_name:'Panasonic projector',quantity:1,unit_price:804,amount:804,v2CandidateId:'b'}],
      [],[]
    );
    if(dupeSame.verified.length!==1||dupeSame.pending.length!==0||dupeSame.collapsedCount!==1)failures.push('same sku exact duplicate collapse');
    const dupeConflict=consolidateUniqueSku(
      [{sku:'PT-VW540',item_name:'Panasonic projector',quantity:1,unit_price:804,amount:804,v2CandidateId:'c',parserV2Verification:{level:'2A',method:'exact-inventory-sku'}}],
      [{sku:'PT/VW540',item_name:'Panasonic projector',quantity:2,unit_price:804,amount:1608,v2CandidateId:'d'}],[]
    );
    if(dupeConflict.verified.length!==0||dupeConflict.pending.length!==1||dupeConflict.conflictCount!==1||dupeConflict.pending[0].v2VerificationReason!=='duplicate-sku-economic-conflict')failures.push('same sku conflicting economics level3');
    return {ok:failures.length===0,failures};
  }
  global.InventoryHubParserV2VerificationGate=Object.freeze({VERSION,economics,isDefiniteNonEquipment,sourceProof,level1,skuSimilarity,tokenSimilarity,inventoryMatches,chooseInventoryMatch,normalizedSkuKey,consolidateUniqueSku,verifyOne,verifyParsed,selfTest});
})(typeof window!=='undefined'?window:globalThis);
