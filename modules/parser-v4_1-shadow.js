/* Inventory Hub Parser V4.1 — Evidence Integrity Shadow
 * Shadow-only guard for random-character / fragmented-text contamination.
 * Production Parser V4 remains authoritative and unchanged.
 */
(function(global){
  'use strict';
  const VERSION='4.1-evidence-integrity-shadow';
  const clean=(v='')=>String(v??'').normalize('NFKC').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const norm=(v='')=>clean(v).toLowerCase().replace(/[^a-z0-9+._\/-]+/g,' ').replace(/\s+/g,' ').trim();
  const compact=(v='')=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const STOP=new Set(['the','a','an','of','for','and','with','to','in','on','by','per','each','unit','pcs','pc','set']);
  const EQUIPMENT_RE=/\b(?:projector|microphone|mic|speaker|amplifier|processor|controller|control|camera|visualizer|display|monitor|screen|mixer|receiver|transmitter|console|player|receptacle|nvr|dvr|switcher|matrix|scaler|preamp|preamplifier|wireless|audio|video)\b/i;

  function evidenceTexts({raw='',sources=[],row={}}={}){
    const out=[];
    const add=v=>{const s=String(v??'');if(s.trim())out.push(s);};
    add(raw);
    for(const s of sources||[])add(s?.text||s?.raw||'');
    add(row?.sourceText);
    add(row?.rawSourceText);
    add(row?.lineText);
    add(row?.provenance?.sourceText);
    add(row?.provenance?.raw);
    add(row?.provenance?.text);
    return [...new Set(out)];
  }
  function lineWindows(text=''){
    const lines=String(text||'').split(/\r?\n/).map(clean).filter(Boolean);
    const out=[];
    for(let i=0;i<lines.length;i++){
      out.push(lines[i]);
      if(i+1<lines.length)out.push(lines[i]+' '+lines[i+1]);
      if(i+2<lines.length)out.push(lines[i]+' '+lines[i+1]+' '+lines[i+2]);
    }
    return out;
  }
  function significantTokens(v=''){
    return norm(v).split(/\s+/).filter(t=>t&&t.length>=2&&!STOP.has(t));
  }
  function explicitEvidence(row={},field='',value=''){
    const target=clean(value);
    if(!target)return false;
    const values=[];
    const add=v=>{if(v!==undefined&&v!==null&&clean(v))values.push(clean(v));};
    const cap=field.replace(/(^|_)([a-z])/g,(_,a,b)=>b.toUpperCase());
    add(row[field+'EvidenceValue']);
    add(row['verified'+cap]);
    add(row?.v41Evidence?.[field]);
    add(row?.fieldEvidence?.[field]?.value);
    if(field==='sku'||field==='model'){
      add(row.verifiedSku);add(row.verifiedModel);add(row.modelEvidenceValue);add(row.skuEvidenceValue);
    }
    if(field==='item_name'||field==='description'){
      add(row.verifiedItemName);add(row.verifiedDescription);add(row.standardNameEvidenceValue);
    }
    if(field==='serial_number'||field==='serials'){
      add(row.verifiedSerial);add(row.serialEvidenceValue);
    }
    const key=(field==='sku'||field==='model'||field==='serial_number'||field==='serials')?compact(target):norm(target);
    return values.some(v=>((field==='sku'||field==='model'||field==='serial_number'||field==='serials')?compact(v):norm(v))===key);
  }
  function sourceSupport(value,field,texts=[]){
    const v=clean(value);
    if(!v)return {supported:true,mode:'blank',coverage:1};
    const wins=(texts||[]).flatMap(lineWindows);
    if(field==='sku'||field==='model'||field==='serial_number'||field==='serials'){
      const key=compact(v);
      if(key.length<2)return {supported:false,mode:'too-short',coverage:0};
      for(const w of wins){
        const wk=compact(w);
        if(wk.includes(key))return {supported:true,mode:'contiguous-token',coverage:1};
      }
      return {supported:false,mode:'not-in-source-region',coverage:0};
    }
    const nv=norm(v);
    for(const w of wins)if(norm(w).includes(nv))return {supported:true,mode:'contiguous-phrase',coverage:1};
    const tokens=significantTokens(v);
    if(!tokens.length)return {supported:false,mode:'no-semantic-token',coverage:0};
    let best=0;
    for(const w of wins){
      const wn=' '+norm(w)+' ';
      const hit=tokens.filter(t=>wn.includes(' '+t+' ')||wn.includes(t)).length;
      best=Math.max(best,hit/tokens.length);
    }
    const minHits=tokens.length===1?1:2;
    const supported=best>=0.67&&Math.ceil(best*tokens.length)>=minHits;
    return {supported,mode:supported?'same-region-token-coverage':'insufficient-region-coverage',coverage:best};
  }
  function randomSignature(value='',field=''){
    const v=clean(value);
    if(!v)return {random:false,reasons:[]};
    const reasons=[];
    if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/.test(v))reasons.push('invalid-control-or-replacement');
    const c=compact(v);
    const tokens=v.split(/\s+/).filter(Boolean);
    if((field==='sku'||field==='model'||field==='serial_number'||field==='serials')&&c.length>=4){
      reasons.push('unsupported-identifier-token');
    }else if(field==='item_name'||field==='description'){
      const single=tokens.length===1?v:'';
      if(single&&/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9._+\/-]{6,}$/.test(single)&&!EQUIPMENT_RE.test(single))
        reasons.push('random-alphanumeric-single-token');
      if(single&&/^[A-Za-z]{7,}$/.test(single)&&!/[AEIOUYaeiouy]/.test(single)&&!EQUIPMENT_RE.test(single))
        reasons.push('vowelless-letter-run');
      const nonWord=(v.match(/[^A-Za-z0-9\s+._\/-]/g)||[]).length;
      if(v.length>=6&&nonWord/v.length>.25)reasons.push('high-symbol-ratio');
    }
    return {random:reasons.length>0,reasons};
  }
  function unsupportedRandomFragments(value='',field='',texts=[]){
    if(field!=='item_name'&&field!=='description')return [];
    const wins=(texts||[]).flatMap(lineWindows).map(compact);
    const rawTokens=clean(value).split(/\s+/).filter(Boolean);
    const bad=[];
    for(const token of rawTokens){
      const key=compact(token);
      if(key.length<6)continue;
      const suspicious=(
        /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9._+\/-]{6,}$/.test(token)||
        (/^[A-Za-z]{7,}$/.test(token)&&!/[AEIOUYaeiouy]/.test(token))
      );
      if(!suspicious)continue;
      if(!wins.some(w=>w.includes(key)))bad.push(token);
    }
    return bad;
  }
  function inspectField(row,field,value,texts){
    const support=sourceSupport(value,field,texts);
    const fragments=unsupportedRandomFragments(value,field,texts);
    if(fragments.length&&!explicitEvidence(row,field))return {
      field,value:clean(value),status:'fail',severity:'hard',
      code:'random-fragment-contamination',support,
      reasons:fragments.map(x=>'unsupported-random-fragment:'+x)
    };
    if(support.supported)return {field,value:clean(value),status:'pass',support};
    if(explicitEvidence(row,field))return {field,value:clean(value),status:'pass',support:{...support,mode:'explicit-verified-evidence'}};
    const sig=randomSignature(value,field);
    if(sig.random)return {
      field,value:clean(value),status:'fail',severity:'hard',
      code:'random-or-untraceable-field',support,reasons:sig.reasons
    };
    return {
      field,value:clean(value),status:'review',severity:'review',
      code:'untraceable-field',support,reasons:['not-proven-in-single-source-region']
    };
  }
  function auditRow(row={},context={}){
    const texts=evidenceTexts({...context,row});
    const checks=[];
    const fields=['sku','model','item_name','description','serial_number'];
    for(const field of fields){
      const value=row?.[field];
      if(clean(value))checks.push(inspectField(row,field,value,texts));
    }
    for(const serial of Array.isArray(row?.serials)?row.serials:[]){
      if(clean(serial))checks.push(inspectField(row,'serials',serial,texts));
    }
    const hard=checks.filter(x=>x.status==='fail');
    const review=checks.filter(x=>x.status==='review');
    const sanitized={...row};
    for(const issue of hard){
      if(issue.field==='serials'){
        sanitized.serials=(sanitized.serials||[]).filter(x=>clean(x)!==issue.value);
      }else if(clean(sanitized[issue.field])===issue.value){
        sanitized[issue.field]='';
      }
    }
    if(hard.length){
      sanitized.v41ShadowRandomCharacterFail=true;
      sanitized.v41ShadowReviewRequired=true;
    }else if(review.length){
      sanitized.v41ShadowReviewRequired=true;
    }
    return {row:sanitized,checks,hardFailures:hard,reviewIssues:review,ok:hard.length===0};
  }
  function auditRows(rows=[],context={}){
    const audited=(rows||[]).map((row,index)=>({index,...auditRow(row,context)}));
    const hardFailures=audited.flatMap(a=>a.hardFailures.map(issue=>({rowIndex:a.index,...issue})));
    const reviewIssues=audited.flatMap(a=>a.reviewIssues.map(issue=>({rowIndex:a.index,...issue})));
    return Object.freeze({
      version:VERSION,mode:'shadow',productionMutation:false,
      ok:hardFailures.length===0,
      inputCount:(rows||[]).length,
      outputRows:audited.map(a=>a.row),
      hardFailures,reviewIssues,
      randomCharacterFailureCount:hardFailures.length,
      reviewIssueCount:reviewIssues.length
    });
  }
  function selfTest(){
    const failures=[];
    const raw='TAX INVOICE\nAVS-320 Projector controller 2 350.00 700.00\nShure PGA58-LC Dynamic microphone 1 90.00 90.00';
    const good=auditRows([{sku:'AVS-320',item_name:'Projector controller'}],{raw});
    if(!good.ok)failures.push('valid source-backed row rejected');
    const bad=auditRows([{sku:'Q7XZ9K2P',item_name:'Projector controller'}],{raw});
    if(bad.ok||bad.randomCharacterFailureCount!==1||bad.outputRows[0].sku!=='')failures.push('unsupported random identifier not rejected/blanked');
    const badName=auditRows([{sku:'AVS-320',item_name:'Q7XZ9K2P'}],{raw});
    if(badName.ok||badName.outputRows[0].item_name!=='')failures.push('random item name not rejected/blanked');
    const model=auditRows([{sku:'PGA58-LC',item_name:'Dynamic microphone'}],{raw});
    if(!model.ok)failures.push('legitimate AV model token rejected');
    return {ok:failures.length===0,version:VERSION,failures};
  }
  global.InventoryHubParserV41Shadow=Object.freeze({
    VERSION,evidenceTexts,lineWindows,significantTokens,sourceSupport,randomSignature,
    unsupportedRandomFragments,inspectField,auditRow,auditRows,selfTest
  });
})(typeof window!=='undefined'?window:globalThis);
