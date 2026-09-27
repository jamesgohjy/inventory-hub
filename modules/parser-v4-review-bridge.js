/* Parser V4 review bridge.
 * Keeps V2/V3 verification semantics intact while ensuring unresolved candidates
 * remain visible in the same Review model used by real imports.
 */
(function(global){
  'use strict';
  const VERSION='4.1-review-bridge';
  const clean=(v='')=>String(v??'').replace(/\s+/g,' ').trim();
  const compact=(v='')=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  function candidateId(row={},index=0){
    return clean(row.v2CandidateId||row.v3CandidateId||row.rowId||row.v7RowId)||[
      compact(row.sku||row.model||''),compact(row.item_name||row.description||''),
      Number(row.quantity)||0,Number(row.amount)||0,index
    ].join('|');
  }
  function sameCandidate(a={},b={}){
    const aid=clean(a.v2CandidateId||a.v3CandidateId||a.rowId||a.v7RowId),bid=clean(b.v2CandidateId||b.v3CandidateId||b.rowId||b.v7RowId);
    if(aid&&bid)return aid===bid;
    const asku=compact(a.sku||a.model||''),bsku=compact(b.sku||b.model||'');
    if(asku&&bsku&&asku!==bsku)return false;
    const an=compact(a.item_name||a.description||''),bn=compact(b.item_name||b.description||'');
    const qSame=Number(a.quantity||0)===Number(b.quantity||0);
    const aa=Number(a.amount),ba=Number(b.amount),amountSame=(!Number.isFinite(aa)&&!Number.isFinite(ba))||(Number.isFinite(aa)&&Number.isFinite(ba)&&Math.abs(aa-ba)<=.06);
    return !!((asku&&bsku&&asku===bsku)||(an&&bn&&(an===bn||an.includes(bn)||bn.includes(an))))&&qSame&&amountSame;
  }
  function materialize(parsed={},incomingCandidates=[]){
    const verified=(parsed.items||[]).map(r=>({...r,v4ReviewState:r.v4ReviewState||'verified'}));
    const pending=[...(parsed?.v2Verification?.pending||[])];
    const items=[...verified];
    for(let i=0;i<pending.length;i++){
      const p=pending[i]||{};
      if(items.some(x=>sameCandidate(x,p)))continue;
      items.push({...p,v4ReviewState:'pending',v4PendingReview:true,humanReviewRequired:true,needsReview:true,parserReviewRequired:true});
    }
    const trace={
      version:VERSION,
      inputCount:(incomingCandidates||[]).length,
      verifiedCount:Number(parsed?.v2Verification?.verifiedCount??verified.length),
      pendingCount:pending.length,
      rejectedCount:Number(parsed?.v2Verification?.rejectedCount??(parsed?.v2Verification?.rejected||[]).length),
      reviewCount:items.length,
      inputCandidates:(incomingCandidates||[]).map((r,i)=>({
        id:candidateId(r,i),sku:clean(r.sku||r.model||''),item_name:clean(r.item_name||r.description||''),
        quantity:r.quantity??null,unit_price:r.unit_price??null,amount:r.amount??null
      }))
    };
    return {...parsed,items,v4ReviewMaterialized:true,v4CandidateTrace:trace};
  }
  function rebuildDiagnostics(parsed={},raw='',incomingCandidates=[],patch=null){
    if(!patch?.buildParserDiagnostics14l)return parsed;
    const incoming=[...(incomingCandidates||[])];
    const excludedService=patch.v703312jIsServiceRow?incoming.filter(patch.v703312jIsServiceRow):[];
    const excludedAccessory=patch.v703312jIsAccessoryRow?incoming.filter(patch.v703312jIsAccessoryRow):[];
    const recovered=(parsed?.v3Verification?.recovered||[]).map(x=>x?.row).filter(Boolean);
    const diagnostics=patch.buildParserDiagnostics14l(parsed,raw,{incoming,excludedService,excludedAccessory,recovered,evidenceSources:[]});
    diagnostics.v4_candidate_trace={...(parsed.v4CandidateTrace||{})};
    return {...parsed,v703314lDiagnostics:diagnostics};
  }
  function materializeAndDiagnose(parsed={},raw='',incomingCandidates=[],patch=null){
    return rebuildDiagnostics(materialize(parsed,incomingCandidates),raw,incomingCandidates,patch);
  }
  function resolveCandidate(parsed={},id,accept){
    const report={...(parsed.v2Verification||{}),pending:[...(parsed?.v2Verification?.pending||[])],rejected:[...(parsed?.v2Verification?.rejected||[])]};
    const idx=report.pending.findIndex(x=>String(x.v2CandidateId||'')===String(id||''));if(idx<0)return parsed;
    const candidate=report.pending[idx];report.pending.splice(idx,1);report.pendingCount=report.pending.length;
    let items=[...(parsed.items||[])],at=items.findIndex(x=>String(x.v2CandidateId||'')===String(candidate.v2CandidateId||''));
    if(accept){
      const explicit=!!(candidate.quantityReviewRequired||candidate.priceReviewRequired||candidate.unit_priceReviewRequired||candidate.amountReviewRequired||candidate.serialConflict||candidate.serialConflictReviewRequired||candidate.serialCountReview||candidate.skuReviewRequired);
      const approved={...candidate,v2Level3Confirmed:true,v2VerificationReason:'user-confirmed-equipment',v4ReviewState:'verified',v4PendingReview:false,humanReviewRequired:explicit,needsReview:explicit,parserReviewRequired:explicit};
      delete approved.v2InventoryMatch;delete approved.v2WebMatch;
      if(at>=0)items.splice(at,1,approved);else items.push(approved);
    }else{
      if(at>=0)items.splice(at,1);
      report.rejected.push({...candidate,v2RejectionReason:'user-rejected-level3'});report.rejectedCount=report.rejected.length;
    }
    report.verifiedCount=items.filter(x=>!x.v4PendingReview).length;
    return {...parsed,items,v2Verification:report};
  }
  function confirmHumanReview(parsed={}){
    const pending=[...(parsed?.v2Verification?.pending||[])];
    if(!pending.length)return parsed;
    const ids=new Set(pending.map(x=>String(x.v2CandidateId||'')).filter(Boolean));
    const items=(parsed.items||[]).map(row=>{
      if(!ids.has(String(row.v2CandidateId||''))&&!row.v4PendingReview)return row;
      return {...row,v2Level3Confirmed:true,v2VerificationReason:'user-confirmed-equipment',v4ReviewState:'verified',v4PendingReview:false,humanReviewRequired:false,needsReview:false,parserReviewRequired:false};
    });
    const report={...parsed.v2Verification,pending:[],pendingCount:0,verifiedCount:items.length,humanReviewedPendingCount:pending.length};
    return {...parsed,items,v2Verification:report,v4HumanReviewConfirmed:true};
  }
  function selfTest(){
    const failures=[];
    const input=[
      {sku:'MIC-58',item_name:'Dynamic microphone',quantity:10,unit_price:64.69,amount:646.9},
      {sku:'AMP-1',item_name:'Power amplifier',quantity:1,unit_price:500,amount:500}
    ];
    const base={items:[{...input[0],v2CandidateId:'candidate-1'}],v2Verification:{verifiedCount:1,pendingCount:1,rejectedCount:0,pending:[{...input[1],v2CandidateId:'candidate-2',v2VerificationReason:'mandatory-web-unconfirmed'}],rejected:[]}};
    const m=materialize(base,input);
    if(m.items.length!==2)failures.push('pending candidate was not retained in Review');
    if(m.v4CandidateTrace?.inputCount!==2)failures.push('live input count was not preserved');
    if(!m.items.find(x=>x.v2CandidateId==='candidate-2')?.v4PendingReview)failures.push('pending candidate is not marked reviewable');
    const accepted=confirmHumanReview(m);
    if(accepted.v2Verification?.pendingCount!==0||accepted.items.length!==2)failures.push('human review did not resolve pending rows without data loss');
    const rejected=resolveCandidate(m,'candidate-2',false);
    if(rejected.items.some(x=>x.v2CandidateId==='candidate-2')||rejected.v2Verification?.rejectedCount!==1)failures.push('rejected pending candidate was not removed consistently');
    return {ok:failures.length===0,version:VERSION,failures};
  }
  global.InventoryHubParserV4ReviewBridge=Object.freeze({VERSION,candidateId,sameCandidate,materialize,rebuildDiagnostics,materializeAndDiagnose,resolveCandidate,confirmHumanReview,selfTest});
})(typeof window!=='undefined'?window:globalThis);
