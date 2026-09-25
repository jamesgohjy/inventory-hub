// Inventory Hub parser evidence engine — v7.03.3.14x
(function(global){
  'use strict';

  const clean=v=>String(v??'').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').trim();
  const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const round2=n=>Number.isFinite(Number(n))?Math.round(Number(n)*100)/100:null;
  const finite=v=>Number.isFinite(Number(v));
  const reviewFlag=row=>!!(row?.humanReviewRequired||row?.quantityReviewRequired||row?.priceReviewRequired||row?.amountReviewRequired);
  const identityKey=row=>{
    const sku=norm(row?.sku||'').replace(/\s+/g,'');
    if(sku)return 'sku:'+sku;
    const name=norm(row?.item_name||row?.description||'')
      .replace(/\b(?:supply|with|including|the|a|an|pcs?|piece|set)\b/g,' ')
      .replace(/\s+/g,' ').trim();
    return name?'name:'+name:'';
  };

  function verifyEconomics(row={}){
    const q=Number(row.quantity),p=Number(row.unit_price),a=Number(row.amount);
    const complete=q>0&&finite(p)&&finite(a);
    if(!complete)return {ok:false,complete:false,delta:null,tolerance:null,reason:'Missing quantity, unit price or amount evidence.'};
    const expected=q*p,delta=Math.abs(expected-a),tolerance=Math.max(.03,Math.abs(a)*.003);
    return {ok:delta<=tolerance,complete:true,delta:round2(delta),tolerance:round2(tolerance),expected:round2(expected),reason:delta<=tolerance?'Qty × Unit Price reconciles with Amount.':'Qty × Unit Price does not reconcile with Amount.'};
  }

  function assessRow(row={}){
    const econ=verifyEconomics(row);
    let score=0;
    const reasons=[];
    if(clean(row.item_name||row.description)){score+=18;reasons.push('description');}else{score-=50;reasons.push('missing-description');}
    if(clean(row.sku)){score+=10;reasons.push('sku-evidence');}
    if(econ.ok){score+=42;reasons.push('economic-reconciliation');}
    else if(econ.complete){score-=70;reasons.push('economic-conflict');}
    else{score-=18;reasons.push('incomplete-economics');}
    if(row.layoutEvidenceVerified){score+=12;reasons.push('layout-evidence');}
    if(row.economicEvidenceVerified){score+=12;reasons.push('economic-evidence');}
    if(row.provenance&&Object.keys(row.provenance).length){score+=8;reasons.push('provenance');}
    if(reviewFlag(row)){score-=45;reasons.push('review-required');}
    const nonInventory=row.classification?.type==='service'||row.classification?.type==='accessory'||row.classification?.type==='noninventory';
    const metadataLike=/^(?:serial(?:\s*(?:no|number|numbers))?|s\/n|warranty|remark|remarks|note|notes)\b/i.test(clean(row.item_name||row.description||''));
    if(nonInventory){score-=100;reasons.push('non-inventory-classification');}
    if(metadataLike){score-=120;reasons.push('metadata-like-row');}
    return {score,economics:econ,identity:identityKey(row),reviewRequired:reviewFlag(row)||nonInventory||metadataLike,reasons};
  }

  function rowAgreementSupport(candidate={},all=[]){
    const rows=candidate.items||[];
    if(all.length<2||!rows.length)return {score:0,supportedRows:0,fieldAgreements:0};
    let supportedRows=0,fieldAgreements=0;
    for(const row of rows){
      const key=identityKey(row); if(!key)continue;
      let supported=false,field=false;
      for(const other of all){
        if(other===candidate)continue;
        const hit=(other.items||[]).find(r=>identityKey(r)===key);
        if(!hit)continue;
        supported=true;
        const qOk=!finite(row.quantity)||!finite(hit.quantity)||Number(row.quantity)===Number(hit.quantity);
        const pOk=!finite(row.unit_price)||!finite(hit.unit_price)||Math.abs(Number(row.unit_price)-Number(hit.unit_price))<=.01;
        const aOk=!finite(row.amount)||!finite(hit.amount)||Math.abs(Number(row.amount)-Number(hit.amount))<=.01;
        if(qOk&&pOk&&aOk)field=true;
      }
      if(supported)supportedRows++;
      if(field)fieldAgreements++;
    }
    return {score:supportedRows*10+fieldAgreements*10,supportedRows,fieldAgreements};
  }

  function assessCandidate(candidate={},all=[],options={}){
    const rows=(candidate.items||[]).filter(Boolean);
    const rowAssessments=rows.map(assessRow);
    const rowScore=rowAssessments.reduce((n,r)=>n+r.score,0);
    const agreement=rowAgreementSupport(candidate,all);
    const subtotal=Number(options.subtotal);
    const amountSum=round2(rows.reduce((n,r)=>n+(finite(r.amount)?Number(r.amount):0),0));
    let subtotalScore=0,subtotalDelta=null;
    if(Number.isFinite(subtotal)&&subtotal>=0&&rows.some(r=>finite(r.amount))){
      subtotalDelta=Math.abs(amountSum-subtotal);
      const tol=Math.max(.05,Math.abs(subtotal)*.004);
      subtotalScore=subtotalDelta<=tol?55:-25;
    }
    const unique=new Set(rows.map(identityKey).filter(Boolean));
    const duplicatePenalty=Math.max(0,rows.length-unique.size)*35;
    const unresolved=rowAssessments.filter(r=>r.reviewRequired||!r.economics.ok).length;
    const total=rowScore+agreement.score+subtotalScore-duplicatePenalty-(unresolved*8);
    return {
      origin:candidate.origin||'unknown',
      score:total,
      rows:rows.length,
      amountSum,
      subtotal:Number.isFinite(subtotal)?subtotal:null,
      subtotalDelta:subtotalDelta===null?null:round2(subtotalDelta),
      agreement,
      unresolvedRows:unresolved,
      duplicatePenalty,
      rowAssessments
    };
  }

  function rankCandidateSets(candidates=[],options={}){
    const list=(candidates||[]).filter(c=>Array.isArray(c?.items)&&c.items.length);
    const ranked=list.map((candidate,index)=>({candidate,index,evidence:assessCandidate(candidate,list,options)}))
      .sort((a,b)=>b.evidence.score-a.evidence.score||a.index-b.index);
    const best=ranked[0]||null,second=ranked[1]||null;
    const margin=best?(best.evidence.score-(second?.evidence.score??best.evidence.score)):0;
    const confidence=!best?0:Math.max(0,Math.min(1,(best.evidence.score+80)/260))*Math.max(.45,Math.min(1,.55+Math.max(0,margin)/180));
    return {ok:!!best,best:best?.candidate||null,ranked,confidence:Math.round(confidence*1000)/1000,margin:round2(margin)};
  }


  function duplicateDescription(row={}){
    return norm(row.item_name||row.description||'')
      .replace(/\b(?:the|a|an|in|with|for|of)\b/g,' ')
      .replace(/\s+/g,' ').trim();
  }

  function sameEconomicBasis(a={},b={}){
    const qa=Number(a.quantity),qb=Number(b.quantity),pa=Number(a.unit_price),pb=Number(b.unit_price);
    return qa>0&&qb>0&&finite(pa)&&finite(pb)&&Math.abs(qa-qb)<1e-9&&Math.abs(pa-pb)<=.01;
  }

  function duplicateRowPair(a={},b={}){
    if(!sameEconomicBasis(a,b))return false;
    const sa=norm(a.sku||'').replace(/\s+/g,''),sb=norm(b.sku||'').replace(/\s+/g,'');
    if(sa&&sb)return sa===sb;
    const da=duplicateDescription(a),db=duplicateDescription(b);
    if(!da||!db)return false;
    const short=da.length<=db.length?da:db,long=da.length<=db.length?db:da;
    return short.length>=12&&(short===long||long.includes(short));
  }

  function duplicateRowStrength(row={}){
    let score=0;
    if(clean(row.sku))score+=30;
    if(verifyEconomics(row).ok)score+=40;
    score+=Math.min(20,duplicateDescription(row).length/5);
    if(reviewFlag(row))score-=10;
    if(row.layoutEvidenceVerified)score+=8;
    if(row.economicEvidenceVerified)score+=8;
    return score;
  }

  function consolidateRows(rows=[]){
    const kept=[],removed=[];
    for(const raw of rows||[]){
      const row={...raw};
      const matches=[];
      for(let i=0;i<kept.length;i++)if(duplicateRowPair(kept[i],row))matches.push(i);
      if(!matches.length){kept.push(row);continue;}
      const indexes=[...matches],candidates=[row,...indexes.map(i=>kept[i])];
      candidates.sort((a,b)=>duplicateRowStrength(b)-duplicateRowStrength(a));
      const winner={...candidates[0]};
      const first=indexes[0];
      kept[first]=winner;
      for(let j=indexes.length-1;j>=1;j--)kept.splice(indexes[j],1);
      removed.push(...candidates.slice(1));
    }
    return {rows:kept,removed};
  }

  function reconcileCandidate(candidate={},options={}){
    const consolidation=consolidateRows(Array.isArray(candidate.items)?candidate.items:[]);
    const rows=consolidation.rows;
    const assessments=rows.map(assessRow);
    const accepted=[],review=[];
    for(let i=0;i<rows.length;i++){
      const row=rows[i],a=assessments[i];
      if(a.economics.complete&&!a.economics.ok){review.push({index:i,row,reason:'economic-mismatch',assessment:a});continue;}
      if(a.reviewRequired||!a.economics.complete){review.push({index:i,row,reason:a.reviewRequired?'structural-review':'incomplete-economics',assessment:a});continue;}
      accepted.push(row);
    }
    const subtotal=finite(options.subtotal)?Number(options.subtotal):null;
    const amountSum=round2(accepted.reduce((n,r)=>n+(finite(r.amount)?Number(r.amount):0),0));
    const subtotalDelta=subtotal===null?null:round2(Math.abs(amountSum-subtotal));
    const subtotalOk=subtotal===null||subtotalDelta<=Math.max(.06,Math.abs(subtotal)*.002);
    return {rows,accepted,review,subtotal,amountSum,subtotalDelta,subtotalOk,assessments,duplicateRowsRemoved:consolidation.removed.length};
  }

  function runPipeline(candidates=[],options={}){
    const ranking=rankCandidateSets(candidates,options),winner=ranking.best;
    if(!winner)return {ok:false,status:'review',items:[],review:[{reason:'no-candidate'}],ranking,confidence:0};
    const reconciliation=reconcileCandidate(winner,options);
    const confidence=ranking.confidence;
    const threshold=finite(options.confidenceThreshold)?Number(options.confidenceThreshold):.72;
    const review=[...reconciliation.review];
    if(!reconciliation.subtotalOk)review.push({reason:'subtotal-mismatch',delta:reconciliation.subtotalDelta});
    if(confidence<threshold)review.push({reason:'low-confidence',confidence,threshold});
    const status=review.length?'review':'accepted';
    // Review is a presentation/safety state, not a data-destruction state.
    // Keep evidence-backed rows visible so Level 3 can correct/approve them.
    const rowReviewReasons=new Map();
    for(const entry of reconciliation.review||[]){
      if(!Number.isInteger(entry?.index))continue;
      if(!rowReviewReasons.has(entry.index))rowReviewReasons.set(entry.index,[]);
      rowReviewReasons.get(entry.index).push(entry.reason||'review-required');
    }
    const globalReviewReasons=review.filter(x=>!Number.isInteger(x?.index)).map(x=>x.reason||'review-required');
    const items=status==='accepted'
      ? reconciliation.accepted
      : (reconciliation.rows||[]).map((row,index)=>({
          ...row,
          humanReviewRequired:true,
          needsReview:true,
          parserReviewRequired:true,
          parserReviewReasons:[...(rowReviewReasons.get(index)||[]),...globalReviewReasons]
        }));
    return {ok:status==='accepted',status,items,review,ranking,reconciliation,confidence,winnerOrigin:winner.origin||'unknown'};
  }

  function runReviewPreservationRegressionCheck(){
    const failures=[],cases=[];
    const run=(name,candidates,options,expect)=>{
      const result=runPipeline(candidates,options);
      const actual={status:result.status,itemCount:(result.items||[]).length,reviewRequired:!!result.items?.[0]?.humanReviewRequired};
      cases.push({name,actual});
      if(actual.status!==expect.status)failures.push(name+': expected status '+expect.status+', got '+actual.status);
      if(actual.itemCount!==expect.itemCount)failures.push(name+': expected '+expect.itemCount+' visible item(s), got '+actual.itemCount);
      if(expect.reviewRequired!==undefined&&actual.reviewRequired!==expect.reviewRequired)failures.push(name+': review flag mismatch');
    };
    run('accepted-row',[{origin:'self-test',items:[{sku:'TEST-100',item_name:'Test projector',quantity:1,unit_price:100,amount:100}]}],{subtotal:100,confidenceThreshold:0},{status:'accepted',itemCount:1,reviewRequired:false});
    run('level3-row-preserved',[{origin:'self-test',items:[{sku:'TEST-200',item_name:'Test controller',quantity:1,unit_price:200,amount:200,humanReviewRequired:true}]}],{subtotal:200,confidenceThreshold:0},{status:'review',itemCount:1,reviewRequired:true});
    run('low-confidence-row-preserved',[{origin:'self-test',items:[{sku:'TEST-300',item_name:'Test display',quantity:1,unit_price:300,amount:300}]}],{subtotal:300,confidenceThreshold:1},{status:'review',itemCount:1,reviewRequired:true});
    return {ok:failures.length===0,failures,cases};
  }

  function validateRows(rows=[]){
    const results=(rows||[]).map((row,index)=>({index,row,assessment:assessRow(row)}));
    const failures=[];
    for(const r of results){
      if(!clean(r.row.item_name||r.row.description))failures.push({index:r.index,code:'missing-description'});
      if(finite(r.row.quantity)&&Number(r.row.quantity)<=0)failures.push({index:r.index,code:'invalid-quantity'});
      if(r.assessment.economics.complete&&!r.assessment.economics.ok)failures.push({index:r.index,code:'economic-mismatch'});
    }
    return {ok:failures.length===0,results,failures};
  }

  global.InventoryHubParserEvidenceEngine=Object.freeze({
    version:'7.03.3.14x',
    verifyEconomics,
    assessRow,
    assessCandidate,
    rankCandidateSets,
    reconcileCandidate,
    runPipeline,
    runReviewPreservationRegressionCheck,
    validateRows,
    consolidateRows,
    duplicateRowPair,
    identityKey
  });
})(typeof window!=='undefined'?window:globalThis);
