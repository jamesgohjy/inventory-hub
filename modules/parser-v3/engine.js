// Inventory Hub Parser V3 — Evidence Recovery Engine
// V2 remains primary. V3 counterchecks every valid equipment invoice, recovers
// only independently proven missing rows, and routes disagreements to Level 3.
(function(global){
  'use strict';
  const VERSION='3.0-evidence-recovery';
  const clean=v=>String(v??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const compact=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const nearly=(a,b,t=.03)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<=t;
  const EQUIPMENT_RE=/\b(?:projector|microphone|speaker|loudspeaker|controller|control panel|keypad|camera|mixer|display|monitor|transmitter|receiver|screen|wireless system|amplifier|processor|switcher|visualizer|document camera|console|player|receptacle|audio tester|signal tester|tester|analyzer|analyser|meter|dsp|video processor|matrix|scaler)\b/i;
  const SERVICE_RE=/\b(?:scope of work|installation|installing|labou?r|commissioning|testing|programming|dismantle|dismount|delivery|freight|repair|relocate|reinstatement|training|warranty|service contract)\b/i;
  const MODEL_RE=/\bmodel\s*:\s*(?:[A-Za-z][A-Za-z &.]*?\s+)?([A-Z0-9][A-Z0-9+._\/-]*\d[A-Z0-9+._\/-]*)\b/i;
  const money=v=>{let s=String(v??'').replace(/[$\s}\])]/g,'');if(/,\d{2}$/.test(s)&&!s.includes('.'))s=s.replace(',','.');else s=s.replace(/,/g,'');const n=Number(s);return Number.isFinite(n)?n:null;};
  const hashText=v=>norm(String(v||'')).slice(0,9000);
  const sourceId=s=>String(s?.id||s?.source||'source');

  function asEvidence(sources=[]){
    const built=global.InventoryHubParserV2Evidence?.buildDocumentEvidence?.({sources});
    if(built?.sources?.length)return built;
    return {sources:(sources||[]).map((s,i)=>({id:sourceId(s)||('source-'+(i+1)),kind:s.kind||'unknown',text:String(s.text||''),layout:Array.isArray(s.layout)?s.layout:[]}))};
  }
  function distinctSources(rows=[]){
    const seen=new Set(),out=[];
    for(const row of rows){
      const key=String(row.source||'')+'|'+hashText(row.text||row.raw||'');
      if(seen.has(key))continue;seen.add(key);out.push(row);
    }
    return out;
  }
  function scheduleDescription(text=''){
    let s=clean(text);
    s=s.replace(/^\|?\s*\d{1,2}\s*[|. -]+/,'');
    const moneyHits=[...s.matchAll(/\$?\s*\d{1,3}(?:,\d{3})*(?:[.,]\d{2})/g)];
    if(moneyHits.length){
      const first=moneyHits[0].index??s.length;s=clean(s.slice(0,first));
    }
    s=s.replace(/\b\d{1,3}\s*$/,'').replace(/[|]+$/,'').trim();
    return s;
  }
  function supportScheduleSources(evidence){
    return (evidence.sources||[]).filter(s=>/\bSCHEDULES?\s+OF\s+PRICES\b/i.test(String(s.text||''))&&!/\bPURCHASE\s+ORDER\b/i.test(String(s.text||'')));
  }
  function corroboratedScheduleTotal(evidence,doc={}){
    const target=[doc.subtotal,doc.total_amount,doc.total].map(Number).find(n=>Number.isFinite(n)&&n>0);
    if(!(target>0))return {ok:false,target:null,witnesses:0};
    const seen=new Set(),hits=[];
    for(const s of supportScheduleSources(evidence)){
      const text=String(s.text||''),m=text.match(/\bTOTAL\s+AMOUNT\s*[=|:\s]*\$?\s*([\d,]+\.\d{2})/i);
      if(!m||!nearly(money(m[1]),target,.03))continue;
      const key=sourceId(s);if(seen.has(key))continue;seen.add(key);hits.push(key);
    }
    return {ok:hits.length>=2,target,witnesses:hits.length,sources:hits};
  }
  function scheduleConsensus(evidence){
    const S=global.InventoryHubParserV2NumberedSchedule;
    if(!S?.schedules)return [];
    const raw=distinctSources(S.schedules(evidence)||[]);
    const groups=new Map();
    for(const r of raw){
      const n=Number(r.ordinal);if(!(n>0))continue;
      if(!groups.has(n))groups.set(n,[]);groups.get(n).push(r);
    }
    const out=[];
    for(const [ordinal,rows] of [...groups].sort((a,b)=>a[0]-b[0])){
      const amountVotes=new Map();
      for(const r of rows){
        if(!(Number(r.amount)>0))continue;
        const key=Number(r.amount).toFixed(2);
        if(!amountVotes.has(key))amountVotes.set(key,new Set());
        amountVotes.get(key).add(String(r.source||''));
      }
      const ar=[...amountVotes].sort((a,b)=>b[1].size-a[1].size);
      if(!ar.length||ar[0][1].size<2||ar[0][1].size===Number(ar[1]?.[1].size||0))continue;
      const amount=Number(ar[0][0]),matching=rows.filter(r=>nearly(r.amount,amount,.03));
      const qtyVotes=new Map();
      for(const r of matching)if(Number(r.quantity)>0){const q=Number(r.quantity);if(!qtyVotes.has(q))qtyVotes.set(q,new Set());qtyVotes.get(q).add(String(r.source||''));}
      const qr=[...qtyVotes].sort((a,b)=>b[1].size-a[1].size);
      const quantity=qr[0]?.[1].size>=2&&qr[0][1].size>Number(qr[1]?.[1].size||0)?Number(qr[0][0]):null;
      const unitVotes=new Map();
      for(const r of matching)if(Number(r.unit)>0){const k=Number(r.unit).toFixed(2);if(!unitVotes.has(k))unitVotes.set(k,new Set());unitVotes.get(k).add(String(r.source||''));}
      const ur=[...unitVotes].sort((a,b)=>b[1].size-a[1].size);
      let unit=ur[0]?.[1].size>=2&&ur[0][1].size>Number(ur[1]?.[1].size||0)?Number(ur[0][0]):null;
      if(!(unit>0)&&quantity>0)unit=Math.round(amount/quantity*100)/100;
      if(!(quantity>0)||!(unit>0)||!nearly(quantity*unit,amount,.06))continue;
      const best=[...matching].sort((a,b)=>String(b.text||'').length-String(a.text||'').length)[0];
      out.push({ordinal,quantity,unit_price:unit,amount,description:scheduleDescription(best?.text||''),supportWitnesses:ar[0][1].size,supportSources:[...ar[0][1]],rawRows:matching});
    }
    return out;
  }
  function anchorConsensus(evidence){
    const S=global.InventoryHubParserV2NumberedSchedule;
    const anchors=S?.invoiceAnchors?.(evidence)||[],groups=new Map();
    for(const a of anchors){const n=Number(a.ordinal);if(!(n>0))continue;if(!groups.has(n))groups.set(n,[]);groups.get(n).push(a);}
    return groups;
  }
  function completeInvoiceModelVotes(evidence,expectedOrdinals=[]){
    const count=expectedOrdinals.length,modelsByOrdinal=new Map(),replacementsByOrdinal=new Map();
    if(!count)return {modelsByOrdinal,replacementsByOrdinal};
    const seen=new Set();
    for(const src of evidence.sources||[]){
      const text=String(src.text||'');if(!/\b(?:TAX\s+)?INVOICE\b/i.test(text))continue;
      const beforeScope=text.split(/\bSCOPE\s+OF\s+WORK\b/i)[0],key=sourceId(src);
      if(!key||seen.has(key))continue;seen.add(key);
      const lines=beforeScope.split(/\r?\n/),hits=[];
      for(let li=0;li<lines.length;li++){
        const m=clean(lines[li]).match(MODEL_RE);if(m?.[1])hits.push({model:clean(m[1]),line:li});
      }
      const dedup=hits.filter((h,i)=>i===0||compact(h.model)!==compact(hits[i-1].model));
      if(dedup.length!==count)continue;
      expectedOrdinals.forEach((ord,i)=>{
        const hit=dedup[i],mk=compact(hit.model);
        if(mk){
          if(!modelsByOrdinal.has(ord))modelsByOrdinal.set(ord,new Map());
          const vm=modelsByOrdinal.get(ord);if(!vm.has(mk))vm.set(mk,{model:hit.model,count:0,sources:[]});
          const entry=vm.get(mk);entry.count++;entry.sources.push(sourceId(src));
        }
        const nextModelLine=dedup[i+1]?.line??Math.min(lines.length,hit.line+4);
        const local=clean(lines.slice(hit.line,Math.max(hit.line+1,nextModelLine)).join(' '));
        const rm=local.match(/\breplac(?:ed|ement)\s+with\s+([A-Z0-9][A-Z0-9+._\/-]{2,})/i);
        if(rm?.[1]){
          const rk=compact(rm[1]);if(!replacementsByOrdinal.has(ord))replacementsByOrdinal.set(ord,new Map());
          const rv=replacementsByOrdinal.get(ord);if(!rv.has(rk))rv.set(rk,{model:clean(rm[1]),count:0,sources:[]});
          const re=rv.get(rk);re.count++;re.sources.push(sourceId(src));
        }
      });
    }
    return {modelsByOrdinal,replacementsByOrdinal};
  }
  function modelDecision(ordinal,anchors,modelEvidence){
    const direct=(anchors.get(ordinal)||[]).map(a=>clean(a.model)).filter(Boolean),variants=new Map();
    for(const m of direct){const k=compact(m);if(!variants.has(k))variants.set(k,{model:m,count:0,sources:[]});variants.get(k).count+=2;}
    for(const e of modelEvidence.modelsByOrdinal.get(ordinal)?.values?.()||[]){
      const k=compact(e.model);if(!variants.has(k))variants.set(k,{model:e.model,count:0,sources:[]});
      const v=variants.get(k);v.count+=e.count;v.sources.push(...e.sources);
    }
    const ranked=[...variants.values()].sort((a,b)=>b.count-a.count);
    let model=ranked[0]?.count>=2&&ranked[0].count>Number(ranked[1]?.count||0)?ranked[0].model:'';
    const replacements=[...(modelEvidence.replacementsByOrdinal.get(ordinal)?.values?.()||[])].sort((a,b)=>b.count-a.count);
    const replacement=replacements[0]?.count>=2&&replacements[0].count>Number(replacements[1]?.count||0)?replacements[0].model:'';
    const conflict=[];
    if(ranked.length>1&&ranked[0].count===ranked[1].count)conflict.push(...ranked.slice(0,3).map(x=>x.model));
    if(replacement&&model&&compact(replacement)!==compact(model))conflict.push(model,replacement);
    if(conflict.length)model='';
    return {model,variants:[...new Set((conflict.length?conflict:ranked.map(x=>x.model)).filter(Boolean))],replacement:replacement||''};
  }
  function titleFor(ordinal,anchors,scheduleRow){
    const rows=anchors.get(ordinal)||[];
    const titles=rows.map(x=>clean(x.title)).filter(x=>x&&!SERVICE_RE.test(x));
    const best=titles.sort((a,b)=>b.length-a.length)[0]||clean(scheduleRow.description);
    return best;
  }
  function tokenScore(a='',b=''){
    const A=new Set(norm(a).split(' ').filter(x=>x.length>=4)),B=new Set(norm(b).split(' ').filter(x=>x.length>=4));
    if(!A.size||!B.size)return 0;let shared=0;for(const x of A)if(B.has(x))shared++;
    return shared/Math.max(A.size,B.size);
  }
  function existingMatch(candidate,items=[]){
    let best=null;
    for(const row of items||[]){
      const econ=nearly(row.quantity,candidate.quantity,.001)&&nearly(row.amount,candidate.amount,.06);
      const sku=compact(row.sku||row.model||''),csku=compact(candidate.sku||candidate.model||'');
      const ss=sku&&csku?(sku===csku?1:0):0,ts=tokenScore(row.item_name||row.description||'',candidate.item_name||candidate.description||'');
      const score=(econ?60:0)+ss*35+ts*20;
      if(!best||score>best.score)best={row,score,econ,skuSame:ss===1,titleScore:ts};
    }
    return best&&best.score>=65?best:null;
  }
  function basicCountercheck(parsed={},evidence={},gate=null){
    const conflicts=[],warnings=[],sources=evidence.sources||[],doc=parsed.doc||{};
    const pendingCount=Number(parsed?.v2Verification?.pendingCount||0);
    for(const row of parsed.items||[]){
      const blocked=gate?.isDefiniteNonEquipment?.(row,{doc,supplierName:String(doc.supplier_name||'')});
      if(blocked?.reject){
        conflicts.push({id:'v3-reject-'+(compact(row.sku||row.model||row.item_name)||'unknown-row'),type:'reject-conflict',v2Row:row,v3Row:null,reason:'v3-countercheck-'+blocked.reason,resolved:false});
        continue;
      }
      const sku=compact(row.sku||row.model||'');
      if(sku.length>=3){
        const witnesses=sources.filter(src=>compact(src.text||'').includes(sku)).map(sourceId);
        if(!witnesses.length)warnings.push({type:'identity-not-found-in-full-document-evidence',sku:clean(row.sku||row.model||''),item_name:clean(row.item_name||row.description||'')});
      }
    }
    const anchors=anchorConsensus(evidence);
    const strongAnchors=[...anchors.values()].filter(rows=>rows.some(r=>clean(r.model)||EQUIPMENT_RE.test(r.title||r.raw||'')));
    if(strongAnchors.length>(parsed.items||[]).length+pendingCount){
      warnings.push({type:'possible-missing-numbered-equipment-rows',detected:strongAnchors.length,accounted:(parsed.items||[]).length+pendingCount});
    }
    return {conflicts,warnings};
  }
  function isValidEquipmentInvoice(parsed={}){
    const type=String(parsed?.invoiceClassification?.type||'').toLowerCase();
    return type==='equipment'||(parsed.items||[]).length>0;
  }
  function isIncomplete(parsed={},scheduleRows=[]){
    const current=(parsed.items||[]).length;
    const pending=Number(parsed?.v2Verification?.pendingCount||0);
    const evidenceFlag=!!parsed?.parseEvidence?.completeness?.recheckRequired;
    return evidenceFlag||scheduleRows.length>current+pending;
  }
  function makeCandidate(row,identity,anchors){
    const title=titleFor(row.ordinal,anchors,row);
    const invoiceWitness=(anchors.get(row.ordinal)||[]).length>0||identity.variants.length>0||!!identity.model;
    return {
      sku:identity.model||'',model:identity.model||'',
      item_name:title||row.description||'Recovered equipment',
      description:title||row.description||'Recovered equipment',
      quantity:row.quantity,unit_price:row.unit_price,amount:row.amount,
      v3RecoveryEvidenceVerified:true,
      v3Provenance:{engine:VERSION,ordinal:row.ordinal,supportWitnesses:row.supportWitnesses,supportSources:row.supportSources,invoiceWitness,modelVariants:identity.variants,replacement:identity.replacement||''},
      humanReviewRequired:!identity.model,needsReview:!identity.model,parserReviewRequired:!identity.model
    };
  }
  async function evaluate(parsed={},ctx={}){
    if(!isValidEquipmentInvoice(parsed))return {parsed,report:{version:VERSION,modes:['countercheck'],status:'not-applicable',reason:'not-valid-equipment-invoice',recovered:[],conflicts:[]}};
    const evidence=asEvidence(ctx.fullEvidence||[]);
    const supportSources=supportScheduleSources(evidence);
    const scheduleRows=scheduleConsensus(evidence);
    const report={version:VERSION,modes:['countercheck'],status:'agree',supportScheduleDetected:supportSources.length>0,supportScheduleCorroborated:false,scheduleRowCount:scheduleRows.length,v2VerifiedCount:(parsed.items||[]).length,recovered:[],conflicts:[],countercheckWarnings:[]};
    const basic=basicCountercheck(parsed,evidence,ctx.verifyGate||null);
    report.conflicts.push(...basic.conflicts);report.countercheckWarnings.push(...basic.warnings);
    if(!supportSources.length){
      if(report.conflicts.length)report.modes.push('conflict-review');
      report.unresolvedConflictCount=report.conflicts.filter(x=>!x.resolved).length;
      report.status=report.conflicts.length?'conflict-review':report.countercheckWarnings.length?'countercheck-warning':'agree-no-secondary-schedule';
      return {parsed:{...parsed,v3Verification:report,parserV3Mode:report.modes.join('+')},report};
    }
    const total=corroboratedScheduleTotal(evidence,parsed.doc||{});
    report.supportScheduleCorroborated=total.ok;report.scheduleTotal=total;
    if(!total.ok){
      report.status='countercheck-only';report.countercheckWarnings.push('support-schedule-total-not-corroborated');
      return {parsed:{...parsed,v3Verification:report,parserV3Mode:'countercheck'},report};
    }
    const anchors=anchorConsensus(evidence),ordinals=scheduleRows.map(r=>r.ordinal).sort((a,b)=>a-b);
    const contiguous=ordinals.length>=2&&ordinals.every((n,i)=>i===0||n===ordinals[i-1]+1);
    if(!contiguous){
      report.status='countercheck-only';report.countercheckWarnings.push('support-schedule-sequence-not-contiguous');
      return {parsed:{...parsed,v3Verification:report,parserV3Mode:'countercheck'},report};
    }
    const modelEvidence=completeInvoiceModelVotes(evidence,ordinals);
    const candidates=scheduleRows.map(row=>makeCandidate(row,modelDecision(row.ordinal,anchors,modelEvidence),anchors));
    let nextItems=[...(parsed.items||[])],pending=[...(parsed?.v2Verification?.pending||[])],rejected=[...(parsed?.v2Verification?.rejected||[])];
    for(const candidate of candidates){
      const match=existingMatch(candidate,nextItems);
      if(match){
        const csku=compact(candidate.sku||candidate.model||''),vsku=compact(match.row.sku||match.row.model||'');
        const modelAmbiguous=!csku&&Array.isArray(candidate?.v3Provenance?.modelVariants)&&candidate.v3Provenance.modelVariants.length>1;
        if((csku&&vsku&&csku!==vsku)||modelAmbiguous){
          let checked={bucket:'pending',row:candidate,reason:'v3-conflict-needs-level3'};
          if(ctx.verifyGate?.verifyOne){
            checked=await ctx.verifyGate.verifyOne(candidate,{raw:(evidence.sources||[]).map(s=>String(s.text||'')).join('\n'),inventoryItems:ctx.inventoryItems||[],supplierName:String(parsed?.doc?.supplier_name||''),doc:parsed?.doc||{},webVerifier:ctx.webVerifier||null});
          }
          report.conflicts.push({id:'v3-conflict-'+candidate.v3Provenance.ordinal,type:'identity-conflict',ordinal:candidate.v3Provenance.ordinal,v2Row:match.row,v3Row:checked?.row||candidate,v3VerificationStatus:checked?.bucket||'pending',v3VerificationReason:checked?.reason||'v3-conflict-needs-level3',reason:modelAmbiguous?'v3-secondary-evidence-ambiguous':'v2-v3-identity-disagreement',resolved:false});
        }
        continue;
      }
      if(!isIncomplete(parsed,scheduleRows))continue;
      const gate=ctx.verifyGate;
      let result=null;
      if(gate?.verifyOne){
        result=await gate.verifyOne(candidate,{raw:(evidence.sources||[]).map(s=>String(s.text||'')).join('\n'),inventoryItems:ctx.inventoryItems||[],supplierName:String(parsed?.doc?.supplier_name||''),doc:parsed?.doc||{},webVerifier:ctx.webVerifier||null});
      }
      if(result?.bucket==='verified'){
        const row={...result.row,v3Recovered:true,v3CandidateId:'v3-recovery-'+candidate.v3Provenance.ordinal};
        nextItems.push(row);report.recovered.push({ordinal:candidate.v3Provenance.ordinal,status:'auto-filled',row});
      }else if(result?.bucket==='rejected'){
        rejected.push({...candidate,v2RejectionReason:result.reason||'v3-recovery-rejected'});
        report.recovered.push({ordinal:candidate.v3Provenance.ordinal,status:'rejected',reason:result.reason||'verification-rejected'});
      }else{
        const row={...(result?.row||candidate),v2CandidateId:'v3-recovery-'+candidate.v3Provenance.ordinal,v3RecoveredCandidate:true,v2VerificationReason:result?.reason||'v3-recovery-needs-level3'};
        pending.push(row);report.recovered.push({ordinal:candidate.v3Provenance.ordinal,status:'level3',row});
      }
    }
    if(report.recovered.length)report.modes.push('recovery');
    if(report.conflicts.length)report.modes.push('conflict-review');
    const v2Report={...(parsed.v2Verification||{}),pending,rejected,pendingCount:pending.length,rejectedCount:rejected.length,verifiedCount:nextItems.length};
    const dedup=ctx.verifyGate?.consolidateUniqueSku?.(nextItems,pending,rejected);
    if(dedup){
      nextItems=dedup.verified;
      v2Report.pending=dedup.pending;v2Report.pendingCount=dedup.pending.length;
      v2Report.rejected=dedup.rejected;v2Report.rejectedCount=dedup.rejected.length;v2Report.verifiedCount=nextItems.length;
    }
    report.v3FinalVerifiedCount=nextItems.length;
    report.unresolvedConflictCount=report.conflicts.filter(x=>!x.resolved).length;
    report.status=report.conflicts.length?'conflict-review':report.recovered.some(x=>x.status==='auto-filled')?'recovered':report.recovered.some(x=>x.status==='level3')?'recovery-needs-review':report.countercheckWarnings.length?'countercheck-warning':'agree';
    return {parsed:{...parsed,items:nextItems,v2Verification:v2Report,v3Verification:report,parserV3Mode:report.modes.join('+')},report};
  }
  function selfTest(){
    const failures=[];
    const fakeEvidence={sources:[
      {id:'a',text:'SCHEDULES OF PRICES\n1 Projector 1 100.00 100.00\n2 Mixer 1 200.00 200.00\nTOTAL AMOUNT = 300.00',layout:[]},
      {id:'b',text:'SCHEDULES OF PRICES\n1 Projector 1 100.00 100.00\n2 Mixer 1 200.00 200.00\nTOTAL AMOUNT = 300.00',layout:[]}
    ]};
    const rows=scheduleConsensus(fakeEvidence);
    if(rows.length!==2||rows[0].amount!==100||rows[1].amount!==200)failures.push('schedule consensus');
    const total=corroboratedScheduleTotal(fakeEvidence,{subtotal:300});
    if(!total.ok)failures.push('schedule total corroboration');
    if(isValidEquipmentInvoice({invoiceClassification:{type:'service'},items:[]}))failures.push('service invoice must not activate');
    const basicOk=basicCountercheck({doc:{supplier_name:'Supplier Pte Ltd'},items:[{sku:'PT-VW540',item_name:'Projector',quantity:1,unit_price:804,amount:804}],v2Verification:{pendingCount:0}},{sources:[{id:'full',text:'TAX INVOICE PT-VW540 Projector 1 804.00 804.00',layout:[]}]},{isDefiniteNonEquipment:()=>({reject:false})});
    if(basicOk.conflicts.length||basicOk.countercheckWarnings?.length)failures.push('normal invoice countercheck agreement');
    const basicBad=basicCountercheck({doc:{},items:[{sku:'ADDR1',item_name:'123 Example Road',quantity:1,unit_price:4,amount:4}],v2Verification:{pendingCount:0}},{sources:[{id:'full',text:'123 Example Road',layout:[]}]},{isDefiniteNonEquipment:()=>({reject:true,reason:'address-metadata'})});
    if(basicBad.conflicts.length!==1||basicBad.conflicts[0].type!=='reject-conflict')failures.push('countercheck must flag metadata leakage');
    if(!isIncomplete({items:[{sku:'A'}],v2Verification:{pendingCount:0}},[{ordinal:1},{ordinal:2}]))failures.push('missing-row recovery trigger');
    const match=existingMatch({sku:'PT-VW540',item_name:'Projector',quantity:1,amount:804},[{sku:'PT-VW540',item_name:'Projector',quantity:1,amount:804}]);
    if(!match?.skuSame)failures.push('countercheck exact agreement');
    const replacementEvidence={sources:[
      {id:'inv-a',text:'TAX INVOICE\nMixer\nModel: CQ12T\nPlayer\nModel: XDP-3002\nNote: replaced with XDP-3001\nSCOPE OF WORK',layout:[]},
      {id:'inv-b',text:'TAX INVOICE\nMixer\nModel: CQ12T\nPlayer\nModel: XDP-3002\nNote: replaced with XDP-3001\nSCOPE OF WORK',layout:[]}
    ]};
    const me=completeInvoiceModelVotes(replacementEvidence,[1,2]),emptyAnchors=new Map();
    const first=modelDecision(1,emptyAnchors,me),second=modelDecision(2,emptyAnchors,me);
    if(first.model!=='CQ12T'||first.replacement)failures.push('replacement evidence leaked into unrelated ordinal');
    if(second.model!==''||!second.variants.includes('XDP-3002')||!second.variants.includes('XDP-3001'))failures.push('replacement conflict not isolated to affected ordinal');
    return {ok:failures.length===0,failures};
  }
  global.InventoryHubParserV3=Object.freeze({VERSION,mode:'countercheck+recovery+conflict-review',evaluate,selfTest,scheduleConsensus,corroboratedScheduleTotal,isIncomplete});
})(typeof window!=='undefined'?window:globalThis);
