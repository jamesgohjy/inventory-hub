/* AV Inventory Hub v7.03.2 — optional Level 2B web product validation
 * No search API key is required by the browser client. It calls the bundled
 * Supabase Edge Function `product-verify`, which uses public web-search result pages.
 * IMPORTANT: web evidence validates invoice-supported candidates only. It never invents
 * or silently replaces SKU/model values.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.V7032WebVerify=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='7.03.2';
  const clean=(v='')=>String(v??'').replace(/\u00a0/g,' ').replace(/[\t ]+/g,' ').trim();
  const norm=(v='')=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const compact=(v='')=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const uniq=(xs,key=x=>x)=>{const out=[],seen=new Set();for(const x of xs||[]){const k=key(x);if(!k||seen.has(k))continue;seen.add(k);out.push(x);}return out;};
  const MARKETPLACE_RE=/(?:amazon\.|ebay\.|aliexpress\.|shopee\.|lazada\.|carousell\.)/i;

  function safeHost(url=''){try{return new URL(url).hostname.replace(/^www\./,'').toLowerCase();}catch{return '';}}
  function categoryWords(text=''){
    return uniq(norm(text).split(' ').filter(w=>w.length>=4&&/^(?:projector|microphone|speaker|controller|camera|mixer|display|monitor|transmitter|receiver|screen|amplifier|processor|switcher|visualizer|player|wireless|audio)$/.test(w)));
  }
  function scoreWebResult(result={},candidate={}){
    const brand=clean(candidate.brand),model=clean(candidate.model),description=clean(candidate.description);
    const title=clean(result.title),snippet=clean(result.snippet),url=clean(result.url),host=safeHost(url);
    const hay=compact(title+' '+snippet),m=compact(model),b=norm(brand),hostNorm=host.replace(/[^a-z0-9]/g,'');
    const exactModel=!!m&&hay.includes(m);
    const brandText=!!b&&norm(title+' '+snippet).includes(b);
    const brandInHost=!!b&&b.replace(/[^a-z0-9]/g,'').length>=4&&hostNorm.includes(b.replace(/[^a-z0-9]/g,''));
    const marketplace=MARKETPLACE_RE.test(host);
    const cats=categoryWords(description);const catHits=cats.filter(w=>norm(title+' '+snippet).includes(w)).length;
    let score=0;if(exactModel)score+=55;if(brandText)score+=18;if(brandInHost)score+=18;if(catHits)score+=Math.min(8,catHits*4);if(marketplace)score-=20;
    return {...result,host,score,exactModel,brandText,brandInHost,marketplace,categoryHits:catHits};
  }
  function aggregateWebEvidence(results=[],candidate={}){
    const scored=(results||[]).map(r=>scoreWebResult(r,candidate)).sort((a,b)=>b.score-a.score);
    const exact=scored.filter(r=>r.exactModel);
    const trustedExact=exact.filter(r=>!r.marketplace&&(r.brandText||r.brandInHost));
    const domains=uniq(trustedExact.map(r=>r.host).filter(Boolean));
    const brandDomain=trustedExact.some(r=>r.brandInHost);
    const confirmed=brandDomain||domains.length>=2;
    const confidence=confirmed?Math.min(.99,.72+(brandDomain?0.12:0)+Math.min(.15,domains.length*.06)):Math.min(.69,Math.max(0,(scored[0]?.score||0)/100));
    return {
      status:confirmed?'confirmed':'unconfirmed',confidence:Number(confidence.toFixed(2)),
      reason:confirmed?(brandDomain?'Exact model found on a brand-matching domain.':'Exact brand/model found on at least two independent non-marketplace domains.'):'No sufficiently strong independent web confirmation was found.',
      sources:scored.slice(0,3),distinctTrustedDomains:domains
    };
  }
  function brandFromInvoiceEvidence(row={},raw=''){
    const model=clean(row.sku||'');if(!model)return '';
    const lines=String(raw||'').replace(/\r/g,'').split('\n').map(clean);
    const mc=compact(model);
    for(const line of lines){
      const c=compact(line),idx=c.indexOf(mc);if(idx<0)continue;
      const originalIdx=line.toUpperCase().indexOf(model.toUpperCase());
      if(originalIdx>0){
        const before=clean(line.slice(0,originalIdx)).split(/\s+/).filter(Boolean);
        const b=before.slice(-2).join(' ').replace(/[^A-Za-z0-9&.' -]/g,'').trim();
        if(b&&!/\d/.test(b)&&b.length<=30)return b;
      }
    }
    return '';
  }
  function candidateForRow(row={},raw=''){
    const model=clean(row.sku||'');if(!model||!/\d/.test(model))return null;
    return {brand:brandFromInvoiceEvidence(row,raw),model,description:clean(row.item_name||row.description||'').slice(0,140)};
  }
  function endpointConfig(){
    const c=(typeof window!=='undefined'&&window.INVENTORY_CONFIG)||{};
    const base=clean(c.supabaseUrl||'').replace(/\/$/,'');const anon=clean(c.supabaseAnonKey||'');
    return {url:base?base+'/functions/v1/product-verify':'',anon};
  }
  async function requestWebEvidence(candidate={},opts={}){
    const cfg=endpointConfig();
    if(!cfg.url||!cfg.anon)return {status:'unavailable',reason:'Supabase product-verify function is not configured.',sources:[]};
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),Number(opts.timeoutMs)||7000);
    try{
      const r=await fetch(cfg.url,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.anon,'Authorization':'Bearer '+cfg.anon},body:JSON.stringify(candidate),signal:ctl.signal});
      if(!r.ok)throw new Error('product-verify returned HTTP '+r.status);
      const data=await r.json();
      if(!Array.isArray(data.results))return {status:'unavailable',reason:'Web verification returned no result set.',sources:[]};
      return {...aggregateWebEvidence(data.results,candidate),query:data.query||'',provider:data.provider||'public-web-search'};
    }catch(e){return {status:'unavailable',reason:e?.name==='AbortError'?'Web verification timed out.':clean(e?.message||e),sources:[]};}
    finally{clearTimeout(timer);}
  }
  async function verifyParsed(parsed={},raw='',opts={}){
    const out={...parsed,items:(parsed.items||[]).map(r=>({...r}))};const checks=[];
    for(let i=0;i<out.items.length;i++){
      const row=out.items[i],candidate=candidateForRow(row,raw);
      if(!candidate)continue;
      const web=await requestWebEvidence(candidate,opts);row.webVerification={...web,candidate,checkedAt:new Date().toISOString(),rule:'validation-only; invoice evidence remains primary'};
      checks.push({rowId:row.rowId||row.v7RowId||String(i+1),model:candidate.model,brand:candidate.brand,status:web.status,confidence:web.confidence??null,reason:web.reason,sources:web.sources||[]});
      // Safety rule: web confirmation may remove only a missing-independent-extraction review.
      // It never clears a real disagreement, quantity/price/serial conflict, or changes SKU/model.
      const v=row.verification||{},disagreements=v.disagreements||[];
      const onlyMissingSecondary=!v.secondaryRowId&&!disagreements.length;
      const explicit=!!(row.quantityReviewRequired||row.priceReviewRequired||row.unit_priceReviewRequired||row.amountReviewRequired||row.serialConflict||row.serialConflictReviewRequired||row.serialCountReview);
      if(web.status==='confirmed'&&onlyMissingSecondary&&!explicit){
        row.humanReviewRequired=false;row.needsReview=false;
        row.verification={...v,coreVerified:true,layers:{...(v.layers||{}),layer2b:{status:'confirmed',reason:web.reason,confidence:web.confidence},layer3:{status:'not_required',reason:'Invoice evidence plus Level 2B web validation confirmed the model; no genuine field conflict remains.'}}};
      }else row.verification={...v,layers:{...(v.layers||{}),layer2b:{status:web.status,reason:web.reason,confidence:web.confidence??null}}};
    }
    out.v7032WebVerification={version:VERSION,checks,completedAt:new Date().toISOString()};
    if(out.v7){
      const v7={...out.v7};
      if(v7.verification){
        const vr={...v7.verification};
        const byId=new Map(out.items.map((r,i)=>[r.rowId||r.v7RowId||String(i+1),r]));
        vr.humanReviewRows=(vr.humanReviewRows||[]).filter(x=>byId.get(x.rowId)?.humanReviewRequired!==false);
        vr.humanReviewRequired=vr.humanReviewRows.length>0;v7.verification=vr;
      }
      const rowNeed=out.items.some(r=>r.humanReviewRequired===true);v7.humanReviewRequired=!!(rowNeed||v7.verification?.humanReviewRequired||v7.completenessValidation?.recheckRequired);out.v7=v7;
    }
    return {parsed:out,checks};
  }
  function escapeHtml(s=''){return clean(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function renderNotice(result={}){
    if(typeof document==='undefined')return;
    const host=document.querySelector('.parsed-review-pane')||document.getElementById('reviewArea');if(!host)return;
    let box=document.getElementById('v7032WebVerificationNotice');if(!box){box=document.createElement('div');box.id='v7032WebVerificationNotice';box.style.cssText='margin:0 0 12px;padding:10px 12px;border-radius:10px;border:1px solid #b9d9ff;background:#eff7ff;color:#174f8a;font-size:12px;line-height:1.45';const anchor=document.getElementById('parsedItems');host.insertBefore(box,anchor||host.firstChild);}
    const checks=result.checks||[];if(!checks.length){box.innerHTML='<b>Level 2B — Web validation</b><br>No model candidate required web checking.';return;}
    const rows=checks.map(c=>{const status=c.status==='confirmed'?'Confirmed':c.status==='unavailable'?'Unavailable':'Not independently confirmed';const domains=uniq((c.sources||[]).map(x=>x.host||safeHost(x.url)).filter(Boolean)).slice(0,3).join(', ');return '• <b>'+escapeHtml(c.model)+'</b>: '+escapeHtml(status)+(domains?' — '+escapeHtml(domains):'');});
    box.innerHTML='<b>Level 2B — Web model validation</b><br>Checks public web sources using only brand/model/product description. Web results never overwrite the invoice.<br>'+rows.join('<br>');
  }
  return {VERSION,safeHost,scoreWebResult,aggregateWebEvidence,brandFromInvoiceEvidence,candidateForRow,requestWebEvidence,verifyParsed,renderNotice};
});
