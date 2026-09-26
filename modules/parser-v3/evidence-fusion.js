// Parser V3 — Evidence Fusion Recovery
(function(global){
  'use strict';

  const VERSION='3.0-experimental-evidence-fusion';
  const clean=v=>String(v??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const round2=n=>Math.round(Number(n)*100)/100;
  const SUPPORT_RE=/SCHEDULES?\s+OF\s+PRICES(?:\s+AND\s+TECHNICAL\s+DATA)?/i;
  const SCOPE_RE=/\bSCOPE\s+OF\s+WORK\b/i;
  const MODEL_RE=/\bMODEL\s*:\s*([^\n\r|]+)/ig;
  const REPLACEMENT_RE=/\bREPLAC(?:ED|EMENT)\s+WITH\s+([A-Z0-9][A-Z0-9+._\/-]{2,})/ig;
  const SERVICE_RE=/\b(?:dismantl|dismount|installation|installing|labou?r|commissioning|training|cabling|delivery\s+(?:fee|service|charge)|system\s+tuning|programming|warranty)\b/i;
  const PHYSICAL_RE=/\b(?:mixer|amplifier|speaker|loudspeaker|microphone|receptacle|player|projector|controller|camera|receiver|transmitter|display|monitor|processor|switcher|console)\b/i;
  const COUNTRY_RE=/^(?:UK|ITALY|USA|US|JAPAN|CHINA|MY|MALAYSIA|SINGAPORE|LOCAL)$/i;

  function money(v){
    const n=Number(String(v??'').replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?round2(n):null;
  }
  function economicsOk(q,p,a){
    q=Number(q);p=Number(p);a=Number(a);
    if(!(q>0)||!Number.isFinite(p)||!Number.isFinite(a))return false;
    return Math.abs(q*p-a)<=Math.max(.05,Math.abs(a)*.005);
  }
  function uniqueTextSources(sources=[]){
    const seen=new Set(),out=[];
    for(const src of sources){
      const text=String(src?.text||src||'');
      const key=clean(text).toUpperCase().replace(/\s+/g,' ');
      if(!text||seen.has(key))continue;
      seen.add(key);out.push(typeof src==='string'?{id:'source-'+out.length,text}:src);
    }
    return out;
  }
  function supportSection(text=''){
    const s=String(text||''),m=s.match(SUPPORT_RE);if(!m)return '';
    const tail=s.slice(m.index+m[0].length);
    const scope=tail.search(SCOPE_RE);
    return scope>=0?tail.slice(0,scope):tail;
  }
  function invoiceSection(text=''){
    const s=String(text||''),tax=s.search(/\bTAX\s+INVOICE\b/i);
    if(tax<0)return '';
    const tail=s.slice(tax);
    const support=tail.search(SUPPORT_RE);
    return support>=0?tail.slice(0,support):tail;
  }
  function parseMoneyTokens(line=''){
    const out=[];
    for(const m of String(line).matchAll(/(?:SGD\s*|S?\$\s*)?([0-9][0-9,]*\.\d{2})/gi)){
      const value=money(m[1]);if(value!==null)out.push({value,index:m.index??0,raw:m[0]});
    }
    return out;
  }
  function likelyModelToken(line='',invoiceModel=''){
    const beforeMoney=String(line).split(/(?:SGD\s*|S?\$\s*)?[0-9][0-9,]*\.\d{2}/i)[0];
    const tokens=beforeMoney.replace(/[|()[\]]/g,' ').split(/\s+/).map(x=>x.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'')).filter(Boolean);
    const inv=norm(invoiceModel);
    if(inv&&tokens.some(t=>norm(t)===inv))return tokens.find(t=>norm(t)===inv)||'';
    const candidates=tokens.filter(t=>/[A-Za-z]/.test(t)&&/\d/.test(t)&&t.length>=4&&!COUNTRY_RE.test(t));
    return candidates.at(-1)||'';
  }
  function parseScheduleRows(text='',invoiceModels=[]){
    const section=supportSection(text);if(!section)return [];
    const lines=section.split(/\r?\n/).map(clean).filter(Boolean),rows=[];
    for(let i=0;i<lines.length;i++){
      const line=lines[i];if(SCOPE_RE.test(line))break;
      const vals=parseMoneyTokens(line);if(vals.length<2)continue;
      const unit=vals.at(-2).value,amount=vals.at(-1).value;
      const prefix=line.slice(0,vals.at(-2).index);
      const ints=[...prefix.matchAll(/(?:^|\s|\|)(\d{1,3})(?=\s|\||$)/g)].map(m=>({n:Number(m[1]),index:m.index??0}));
      const quantity=ints.length?ints.at(-1).n:null;
      const om=line.match(/^\s*[^A-Za-z0-9]*([1-8])(?:\s|\||\[|\])/);
      const ordinal=om?Number(om[1]):null;
      if(!(quantity>0)||quantity>100)continue;
      const desc=clean(prefix.replace(/^\s*[^A-Za-z0-9]*[1-8](?:\s|\||\[|\])?/,'').replace(/\b(?:UK|ITALY|USA|US|JAPAN|CHINA|MY|MALAYSIA|SINGAPORE|LOCAL)\b/ig,' '));
      rows.push({ordinal,description:desc,quantity,unit_price:unit,amount,raw:line,modelCandidate:''});
    }
    const explicit=rows.map((r,i)=>({r,i})).filter(x=>x.r.ordinal!==null);
    for(let j=0;j<explicit.length-1;j++){
      const a=explicit[j],b=explicit[j+1],gap=b.r.ordinal-a.r.ordinal-1;
      if(gap<=0)continue;
      const missing=rows.map((r,i)=>({r,i})).filter(x=>x.i>a.i&&x.i<b.i&&x.r.ordinal===null);
      if(missing.length!==gap)continue;
      missing.forEach((x,k)=>x.r.ordinal=a.r.ordinal+k+1);
    }
    for(const r of rows){
      if(r.ordinal!==null&&r.ordinal>=1&&r.ordinal<=7)r.modelCandidate=likelyModelToken(r.raw,invoiceModels[r.ordinal-1]||'');
    }
    return rows.filter(r=>r.ordinal!==null&&r.ordinal>=1&&r.ordinal<=7);
  }
  function modelFromInvoiceValue(v=''){
    const s=clean(v).replace(/\s{2,}.*/,'').replace(/[|;,]+$/,'');
    const tokens=s.split(/\s+/).map(x=>x.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'')).filter(Boolean);
    const coded=tokens.filter(t=>/[A-Za-z]/.test(t)&&/\d/.test(t)&&t.length>=3);
    return coded.at(-1)||tokens.at(-1)||'';
  }
  function extractInvoiceModels(text=''){
    const section=invoiceSection(text),models=[];
    MODEL_RE.lastIndex=0;
    let m;while((m=MODEL_RE.exec(section))){
      const model=modelFromInvoiceValue(m[1]);if(!model)continue;
      if(!models.length||norm(models.at(-1))!==norm(model))models.push(model);
      if(models.length>=7)break;
    }
    return models;
  }
  function extractReplacementMap(text='',invoiceModels=[]){
    const section=invoiceSection(text),out=new Map();
    const hits=[];MODEL_RE.lastIndex=0;let m;
    while((m=MODEL_RE.exec(section))){
      const model=modelFromInvoiceValue(m[1]);if(model)hits.push({model,index:m.index??0,end:MODEL_RE.lastIndex});
    }
    for(let i=0;i<hits.length;i++){
      const hit=hits[i],band=section.slice(hit.end,hits[i+1]?.index??section.length);
      REPLACEMENT_RE.lastIndex=0;const r=REPLACEMENT_RE.exec(band);if(!r)continue;
      const ordinal=invoiceModels.findIndex(x=>norm(x)===norm(hit.model))+1;
      if(ordinal>0&&!out.has(ordinal))out.set(ordinal,clean(r[1]));
    }
    return out;
  }
  function vote(values=[]){
    const counts=new Map();
    for(const v of values){
      if(v===null||v===undefined||v==='')continue;
      const key=String(v);
      counts.set(key,(counts.get(key)||0)+1);
    }
    const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
    return ranked.length?{value:ranked[0][0],count:ranked[0][1],runnerUp:ranked[1]?.[1]||0}:null;
  }
  function modelSimilarity(a='',b=''){
    const x=norm(a),y=norm(b);if(!x||!y)return 0;if(x===y)return 1;
    const m=x.length,n=y.length,dp=Array.from({length:m+1},()=>Array(n+1).fill(0));
    for(let i=0;i<=m;i++)dp[i][0]=i;for(let j=0;j<=n;j++)dp[0][j]=j;
    for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(x[i-1]===y[j-1]?0:1));
    return Math.max(0,1-dp[m][n]/Math.max(m,n));
  }
  function aggregateSupport(sources=[],invoiceModels=[]){
    const unique=uniqueTextSources(sources),groups=new Map();
    for(const src of unique){
      for(const row of parseScheduleRows(src.text||src,invoiceModels)){
        if(!groups.has(row.ordinal))groups.set(row.ordinal,[]);
        groups.get(row.ordinal).push({...row,source:src.id||'support'});
      }
    }
    const out=[];
    for(let ordinal=1;ordinal<=7;ordinal++){
      const rows=groups.get(ordinal)||[];if(!rows.length)continue;
      const q=vote(rows.map(r=>r.quantity)),p=vote(rows.map(r=>r.unit_price)),a=vote(rows.map(r=>r.amount));
      const quantity=q?Number(q.value):null,unit_price=p?Number(p.value):null,amount=a?Number(a.value):null;
      const modelVotes=vote(rows.map(r=>norm(r.modelCandidate)?r.modelCandidate:''));
      out.push({ordinal,rows,quantity,unit_price,amount,
        quantityVotes:q?.count||0,unitVotes:p?.count||0,amountVotes:a?.count||0,
        modelCandidate:modelVotes?.value||'',modelVotes:modelVotes?.count||0,
        economicsVerified:economicsOk(quantity,unit_price,amount),
        description:rows.sort((x,y)=>y.description.length-x.description.length)[0]?.description||''});
    }
    return out;
  }
  function rowKey(row={}){return norm(row.sku||row.model||row.item_name||row.description||'');}
  function baselineMatch(rows=[],model=''){
    const key=norm(model);if(!key)return null;
    return rows.find(r=>rowKey(r)===key||norm(r.sku||r.model||'')===key)||null;
  }
  function supportTotals(sources=[]){
    const vals=[];
    for(const src of uniqueTextSources(sources)){
      const text=String(src.text||src||'');
      const m=text.match(/\bTOTAL\s+AMOUNT\s*[=|:\s]*\$?\s*([\d,]+\.\d{2})/i);
      if(m){const n=money(m[1]);if(n!==null)vals.push(n);}
    }
    return vote(vals);
  }
  function recover(input={}){
    const baseline=(input.baselineRows||[]).map(r=>({...r}));
    const evidence=uniqueTextSources(input.evidenceSources||[]);
    const support=evidence.filter(s=>SUPPORT_RE.test(String(s.text||'')));
    if(!support.length)return {version:VERSION,mode:'dormant',rows:baseline,recovered:[],pending:[],rejected:[],reason:'no-support-schedule'};
    const invoiceText=String(input.invoiceText||evidence.map(s=>s.text||'').find(t=>/\bTAX\s+INVOICE\b/i.test(t))||'');
    const invoiceModels=extractInvoiceModels(invoiceText);
    if(invoiceModels.length<4)return {version:VERSION,mode:'blocked',rows:baseline,recovered:[],pending:[],rejected:[],reason:'insufficient-invoice-model-witnesses',invoiceModels};
    const totalVote=supportTotals(support),invoiceSubtotal=money(input.invoiceSubtotal);
    if(invoiceSubtotal!==null&&(!totalVote||Number(totalVote.value)!==invoiceSubtotal)){
      return {version:VERSION,mode:'blocked',rows:baseline,recovered:[],pending:[],rejected:[],reason:'support-total-mismatch',supportTotal:totalVote?.value??null,invoiceSubtotal};
    }
    const aggregated=aggregateSupport(support,invoiceModels);
    if(aggregated.length<4)return {version:VERSION,mode:'blocked',rows:baseline,recovered:[],pending:[],rejected:[],reason:'insufficient-support-rows',aggregated};
    const replacements=extractReplacementMap(invoiceText,invoiceModels);
    const recovered=[],pending=[],rejected=[];
    for(const row of aggregated){
      const model=invoiceModels[row.ordinal-1]||'';
      if(!model){pending.push({...row,reason:'invoice-model-missing'});continue;}
      const existing=baselineMatch(baseline,model);
      if(existing)continue;
      if(!row.economicsVerified||row.quantityVotes<2||row.amountVotes<2||row.unitVotes<2){
        pending.push({...row,sku:model,reason:'economics-not-corroborated'});continue;
      }
      const supportModel=row.modelCandidate;
      const sim=supportModel?modelSimilarity(model,supportModel):0;
      if(supportModel&&row.modelVotes>=2&&sim>=.65&&sim<1){
        pending.push({...row,sku:model,reason:'model-source-conflict',invoiceModel:model,supportModel,modelSimilarity:round2(sim)});continue;
      }
      const replacement=replacements.get(row.ordinal);
      if(replacement&&norm(replacement)!==norm(model)){
        pending.push({...row,sku:model,reason:'replacement-note-conflict',invoiceModel:model,replacementModel:replacement});continue;
      }
      const physical=PHYSICAL_RE.test(row.description)||!!model;
      if(!physical|| (SERVICE_RE.test(row.description)&&!PHYSICAL_RE.test(row.description))){
        rejected.push({...row,sku:model,reason:'not-proven-physical-equipment'});continue;
      }
      recovered.push({sku:model,model,item_name:row.description,description:row.description,quantity:row.quantity,unit_price:row.unit_price,amount:row.amount,
        parserV3Recovery:{ordinal:row.ordinal,source:'support-schedule+invoice-model',evidenceCount:Math.min(row.quantityVotes,row.unitVotes,row.amountVotes)}});
    }
    const rows=[...baseline,...recovered];
    const equipmentTotal=round2([...rows,...pending.filter(x=>x.quantity&&x.unit_price&&x.amount)].reduce((s,r)=>s+(Number(r.amount)||0),0));
    if(invoiceSubtotal!==null&&equipmentTotal>invoiceSubtotal+.05){
      return {version:VERSION,mode:'blocked',rows:baseline,recovered:[],pending,rejected,reason:'equipment-exceeds-invoice-subtotal',equipmentTotal,invoiceSubtotal};
    }
    return {version:VERSION,mode:'active',rows,recovered,pending,rejected,reason:'recovery-evaluated',invoiceModels,aggregated,supportSourceCount:support.length,equipmentTotal,invoiceSubtotal};
  }
  function selfTest(){
    const failures=[];
    const noSupport=recover({baselineRows:[{sku:'A',quantity:1,unit_price:1,amount:1}],evidenceSources:[{id:'i',text:'TAX INVOICE'}]});
    if(noSupport.mode!=='dormant'||noSupport.rows.length!==1)failures.push('dormant pass-through');
    const duplicate=uniqueTextSources([{id:'a',text:'X'},{id:'b',text:' X '}]);if(duplicate.length!==1)failures.push('duplicate support source dedupe');
    if(!economicsOk(2,950,1900)||economicsOk(2,850,1900))failures.push('economics verification');
    return {ok:failures.length===0,failures};
  }

  global.InventoryHubParserV3=Object.freeze({VERSION,recover,selfTest,extractInvoiceModels,extractReplacementMap,parseScheduleRows,aggregateSupport,modelSimilarity});
})(typeof window!=='undefined'?window:globalThis);
