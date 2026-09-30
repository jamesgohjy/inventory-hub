/* Inventory Hub Parser V4.1 — Evidence Integrity + Targeted Recovery Shadow
 * Shadow-only protection against random-character / fragmented-text contamination.
 * Production Parser V4 remains authoritative and unchanged.
 */
(function(global){
  'use strict';
  const VERSION='4.1.1-evidence-integrity-audit-hardening-shadow';
  const clean=(v='')=>String(v??'').normalize('NFKC').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const norm=(v='')=>clean(v).toLowerCase().replace(/[^a-z0-9+._\/-]+/g,' ').replace(/\s+/g,' ').trim();
  const compact=(v='')=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const STOP=new Set(['the','a','an','of','for','and','with','to','in','on','by','per','each','unit','pcs','pc','set']);
  const EQUIPMENT_RE=/\b(?:projector|microphone|mic|speaker|amplifier|processor|controller|control|camera|visualizer|display|monitor|screen|mixer|receiver|transmitter|console|player|receptacle|nvr|dvr|switcher|matrix|scaler|preamp|preamplifier|wireless|audio|video)\b/i;
  const MODEL_TOKEN_RE=/^[A-Z0-9][A-Z0-9+._\/-]{2,}$/i;
  const numeric=v=>Number.isFinite(Number(v))?Number(v):null;

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
  function equipmentClass(v=''){
    const s=clean(v);
    if(/\b(?:microphone|mic|handheld|gooseneck|transmitter|receiver|bodypack)\b/i.test(s))return'microphone';
    if(/\b(?:amplifier|power amp|pre\s*amplifier|dsp)\b/i.test(s))return'amplifier';
    if(/\b(?:speaker|loudspeaker|speeker|soundbar)\b/i.test(s))return'speaker';
    if(/\b(?:projector|projection)\b/i.test(s))return'projector';
    if(/\b(?:visualizer|document camera)\b/i.test(s))return'visualizer';
    if(/\b(?:controller|control panel|switcher|matrix)\b/i.test(s))return'controller';
    if(/\b(?:cd|mp3|media player|player)\b/i.test(s))return'player';
    if(/\b(?:trolley|cart)\b/i.test(s))return'trolley';
    if(/\b(?:screen|display|monitor)\b/i.test(s))return'display';
    return'';
  }
  function numericFragmentCount(v=''){
    return (clean(v).match(/\b\d+(?:[.,]\d+)?\b/g)||[]).length;
  }
  function keyFor(field,value=''){
    return (field==='sku'||field==='model'||field==='serial_number'||field==='serials')?compact(value):norm(value);
  }
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
    add(row?.provenance?.rawText);
    return [...new Set(out)];
  }
  function layoutPages(context={}){
    const pages=[];
    const add=(layout,source='layout')=>{
      for(let pi=0;pi<(Array.isArray(layout)?layout:[]).length;pi++){
        const page=layout[pi]||{};
        const rows=(Array.isArray(page.rows)?page.rows:[]).map((r,ri)=>({
          ...r,rowIndex:Number.isFinite(Number(r?.rowIndex))?Number(r.rowIndex):ri,
          page:Number(r?.page)||Number(page?.page)||pi+1,
          items:Array.isArray(r?.items)?r.items:[]
        }));
        pages.push({source,page:Number(page?.page)||pi+1,rows});
      }
    };
    add(context.layout||[],'context-layout');
    for(const s of context.sources||[])add(s?.layout||[],clean(s?.source||s?.id||s?.label||'source-layout'));
    return pages;
  }
  function matchingLayoutRows(row={},context={}){
    const p=row?.provenance||{},wantedPage=Number(p.page)||null;
    const indexes=new Set((Array.isArray(p.rowIndexes)?p.rowIndexes:[]).map(Number).filter(Number.isFinite));
    const sourceKey=clean(p.source||'');
    const matches=[];
    for(const pg of layoutPages(context)){
      if(wantedPage&&Number(pg.page)!==wantedPage)continue;
      if(sourceKey&&pg.source&&pg.source!=='context-layout'&&clean(pg.source)!==sourceKey)continue;
      const rows=indexes.size?pg.rows.filter(r=>indexes.has(Number(r.rowIndex))):[];
      if(rows.length)matches.push({page:pg.page,source:pg.source,rows,allRows:pg.rows});
    }
    return matches;
  }
  function rowProvenanceTexts(row={},context={}){
    const out=[];
    const add=v=>{const s=clean(v);if(s)out.push(s);};
    add(row?.sourceText);add(row?.rawSourceText);add(row?.lineText);add(row?.v703312kSourceLine);
    add(row?.provenance?.sourceText);add(row?.provenance?.raw);
    add(row?.provenance?.text);add(row?.provenance?.rawText);
    for(const m of matchingLayoutRows(row,context))for(const r of m.rows)add(r.text||r.items?.map(x=>x.text).join(' '));
    return [...new Set(out)];
  }
  function moneyVariants(v){
    const n=numeric(v);if(n===null)return [];
    const fixed=n.toFixed(2);
    return [...new Set([String(n),fixed,fixed.replace(/\B(?=(\d{3})+(?!\d))/g,',')])];
  }
  function otherFieldTokens(row={},field=''){
    const values=[];
    if(field!=='sku'&&field!=='model'){values.push(row.sku,row.model);}
    if(field!=='item_name'&&field!=='description'){values.push(row.item_name,row.description);}
    return [...new Set(values.flatMap(significantTokens).filter(Boolean))];
  }
  function rawSourceTexts(context={}){
    const out=[];
    const add=(text,source)=>{if(clean(text))out.push({text:String(text),source});};
    add(context.raw||'','raw');
    for(const s of context.sources||[])add(s?.text||s?.raw||'',clean(s?.source||s?.id||s?.label||'source'));
    return out;
  }
  function bestRawRegion(row={},field='',context={}){
    const scored=[];
    const otherTokens=otherFieldTokens(row,field);
    const q=numeric(row.quantity),unit=numeric(row.unit_price),amount=numeric(row.amount);
    for(const src of rawSourceTexts(context)){
      const lines=String(src.text).split(/\r?\n/).map(clean).filter(Boolean);
      for(let i=0;i<lines.length;i++){
        for(let span=1;span<=3&&i+span<=lines.length;span++){
          const text=lines.slice(i,i+span).join(' '),ntext=norm(text),ctext=compact(text);
          let score=0;
          if(q!==null&&new RegExp('(?:^|\\D)'+String(q).replace('.','\\.')+'(?:\\D|$)').test(text))score+=1.2;
          if(unit!==null&&moneyVariants(unit).some(x=>text.includes(x)))score+=2;
          if(amount!==null&&moneyVariants(amount).some(x=>text.includes(x)))score+=2.5;
          if(field!=='sku'&&field!=='model'){
            for(const v of [row.sku,row.model].filter(Boolean))if(ctext.includes(compact(v)))score+=2;
          }
          const hits=otherTokens.filter(t=>ntext.includes(t)).length;
          if(otherTokens.length)score+=Math.min(3,(hits/otherTokens.length)*3);
          if(score>=2.5)scored.push({score,text,source:src.source,start:i,span});
        }
      }
    }
    scored.sort((a,b)=>b.score-a.score||a.span-b.span);
    if(!scored.length)return null;
    const top=scored[0],runner=scored.find(x=>x.text!==top.text||x.source!==top.source);
    if(runner&&Math.abs(top.score-runner.score)<0.35&&top.text!==runner.text){
      const overlap=top.source===runner.source&&top.start<runner.start+runner.span&&runner.start<top.start+top.span;
      if(!overlap)return null;
    }
    return top;
  }
  function scopedEvidenceTexts(row={},field='',context={}){
    const direct=rowProvenanceTexts(row,context),targeted=targetedEvidenceTexts(row,field,context);
    if(direct.length||targeted.length)return [...new Set([...direct,...targeted])];
    const region=bestRawRegion(row,field,context);
    if(region)return [region.text,...targeted];
    return context.allowGlobalFallback?[...evidenceTexts({...context,row}),...targeted]:targeted;
  }
  function targetedEvidenceTexts(row={},field='',context={}){
    const p=row?.provenance||{},page=Number(p.page)||null,indexes=new Set((p.rowIndexes||[]).map(Number).filter(Number.isFinite)),out=[];
    for(const e of context.targetedEvidence||[]){
      if(clean(e?.field)!==field)continue;
      if(page&&Number(e?.page)&&Number(e.page)!==page)continue;
      const er=(e?.rowIndexes||[]).map(Number).filter(Number.isFinite);
      if(indexes.size&&er.length&&!er.some(x=>indexes.has(x)))continue;
      const value=clean(e?.value||e?.text||'');if(value)out.push(value);
    }
    return [...new Set(out)];
  }
  function explicitEvidence(row={},field='',value=''){
    const target=clean(value);if(!target)return false;
    const values=[],add=v=>{if(v!==undefined&&v!==null&&clean(v))values.push(clean(v));};
    const cap=field.replace(/(^|_)([a-z])/g,(_,a,b)=>b.toUpperCase());
    add(row[field+'EvidenceValue']);add(row['verified'+cap]);add(row?.v41Evidence?.[field]);add(row?.fieldEvidence?.[field]?.value);
    if(field==='sku'||field==='model'){add(row.verifiedSku);add(row.verifiedModel);add(row.modelEvidenceValue);add(row.skuEvidenceValue);}
    if(field==='item_name'||field==='description'){add(row.verifiedItemName);add(row.verifiedDescription);add(row.standardNameEvidenceValue);}
    if(field==='serial_number'||field==='serials'){add(row.verifiedSerial);add(row.serialEvidenceValue);}
    const key=keyFor(field,target);
    return values.some(v=>keyFor(field,v)===key);
  }
  function sourceSupport(value,field,texts=[]){
    const v=clean(value);if(!v)return {supported:true,mode:'blank',coverage:1};
    const wins=(texts||[]).flatMap(lineWindows);
    if(field==='sku'||field==='model'||field==='serial_number'||field==='serials'){
      const key=compact(v);if(key.length<2)return {supported:false,mode:'too-short',coverage:0};
      for(const w of wins)if(compact(w).includes(key))return {supported:true,mode:'contiguous-token',coverage:1};
      return {supported:false,mode:'not-in-source-region',coverage:0};
    }
    const nv=norm(v);
    for(const w of wins)if(norm(w).includes(nv))return {supported:true,mode:'contiguous-phrase',coverage:1};
    const tokens=significantTokens(v);if(!tokens.length)return {supported:false,mode:'no-semantic-token',coverage:0};
    let best=0;
    for(const w of wins){
      const wn=' '+norm(w)+' ',hit=tokens.filter(t=>wn.includes(' '+t+' ')||wn.includes(t)).length;
      best=Math.max(best,hit/tokens.length);
    }
    const minHits=tokens.length===1?1:2,supported=best>=0.67&&Math.ceil(best*tokens.length)>=minHits;
    return {supported,mode:supported?'same-region-token-coverage':'insufficient-region-coverage',coverage:best};
  }
  function identifierRisk(value='',field='',texts=[]){
    if(field!=='sku'&&field!=='model')return {risky:false,reasons:[]};
    const v=clean(value),reasons=[];if(!v)return {risky:false,reasons};
    const windows=(texts||[]).flatMap(lineWindows);
    const labelled=windows.some(w=>/\b(?:model(?:\s*(?:no\.?|number))?|sku|product\s*(?:no\.?|number)|part\s*(?:no\.?|number)|item\s*code)\b/i.test(w)&&compact(w).includes(compact(v)));
    const mixed=/[A-Za-z]/.test(v)&&/\d/.test(v);
    if(!labelled&&mixed&&v===v.toLowerCase()&&!/[-/+._]/.test(v)&&v.length<=8)reasons.push('lowercase-mixed-ocr-identifier');
    if(!labelled&&/^\d{2,}[A-Za-z]{1,2}$/i.test(v)&&v.length<=5)reasons.push('short-numeric-leading-identifier');
    if(!labelled&&/^[A-Za-z]{3,24}$/.test(v))reasons.push('untyped-alpha-identifier');
    return {risky:reasons.length>0,reasons,labelled};
  }
  function trailingTextNoise(value='',field=''){
    if(field!=='item_name'&&field!=='description')return null;
    const v=clean(value),parts=v.split(/\s+/).filter(Boolean);if(parts.length<3)return null;
    const last=parts[parts.length-1],lower=last.toLowerCase();
    if(!/^[a-z]{1,2}$/.test(last)||STOP.has(lower))return null;
    const trimmed=clean(parts.slice(0,-1).join(' '));
    if(!EQUIPMENT_RE.test(trimmed))return null;
    return {token:last,trimmed};
  }
  function randomSignature(value='',field=''){
    const v=clean(value);if(!v)return {random:false,reasons:[]};
    const reasons=[];if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/.test(v))reasons.push('invalid-control-or-replacement');
    const c=compact(v),tokens=v.split(/\s+/).filter(Boolean);
    if((field==='sku'||field==='model'||field==='serial_number'||field==='serials')&&c.length>=4)reasons.push('unsupported-identifier-token');
    else if(field==='item_name'||field==='description'){
      const single=tokens.length===1?v:'';
      if(single&&/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9._+\/-]{6,}$/.test(single)&&!EQUIPMENT_RE.test(single))reasons.push('random-alphanumeric-single-token');
      if(single&&/^[A-Za-z]{7,}$/.test(single)&&!/[AEIOUYaeiouy]/.test(single)&&!EQUIPMENT_RE.test(single))reasons.push('vowelless-letter-run');
      const nonWord=(v.match(/[^A-Za-z0-9\s+._\/-]/g)||[]).length;if(v.length>=6&&nonWord/v.length>.25)reasons.push('high-symbol-ratio');
    }
    return {random:reasons.length>0,reasons};
  }
  function unsupportedRandomFragments(value='',field='',texts=[]){
    if(field!=='item_name'&&field!=='description')return [];
    const wins=(texts||[]).flatMap(lineWindows).map(compact),bad=[];
    for(const token of clean(value).split(/\s+/).filter(Boolean)){
      const key=compact(token);if(key.length<6)continue;
      const suspicious=/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9._+\/-]{6,}$/.test(token)||(/^[A-Za-z]{7,}$/.test(token)&&!/[AEIOUYaeiouy]/.test(token));
      if(suspicious&&!wins.some(w=>w.includes(key)))bad.push(token);
    }
    return bad;
  }
  function inspectField(row,field,value,texts){
    const support=sourceSupport(value,field,texts),fragments=unsupportedRandomFragments(value,field,texts);
    const explicit=explicitEvidence(row,field,value),idRisk=identifierRisk(value,field,texts),tail=trailingTextNoise(value,field);
    if(fragments.length&&!explicitEvidence(row,field,value))return {field,value:clean(value),status:'fail',severity:'hard',code:'random-fragment-contamination',support,reasons:fragments.map(x=>'unsupported-random-fragment:'+x)};
    if(support.supported)return {field,value:clean(value),status:'pass',support};
    if(explicitEvidence(row,field,value))return {field,value:clean(value),status:'pass',support:{...support,mode:'explicit-verified-evidence'}};

    // Field-content integrity: catch legitimate-looking text pulled from a different row/column.
    // This intentionally runs only after the field fails its own row-source support.
    if(field==='description'){
      const itemClass=equipmentClass(row?.item_name),descClass=equipmentClass(value),sourceClass=equipmentClass((texts||[]).join(' '));
      const classConflict=!!(itemClass&&descClass&&itemClass!==descClass&&(!sourceClass||sourceClass===itemClass));
      const numericPollution=significantTokens(value).length>=3&&support.coverage<0.5&&numericFragmentCount(value)>=3;
      if(classConflict||numericPollution)return {
        field,value:clean(value),status:'fail',severity:'hard',
        code:classConflict?'cross-row-equipment-class-contamination':'source-region-content-contamination',
        support,
        reasons:[
          ...(classConflict?['item-class:'+itemClass,'description-class:'+descClass,...(sourceClass?['source-class:'+sourceClass]:[])]:[]),
          ...(numericPollution?['low-source-coverage-with-excess-numeric-fragments']:[])
        ]
      };
    }

    const sig=randomSignature(value,field);
    if(sig.random)return {field,value:clean(value),status:'fail',severity:'hard',code:'random-or-untraceable-field',support,reasons:sig.reasons};
    return {field,value:clean(value),status:'review',severity:'review',code:'untraceable-field',support,reasons:['not-proven-in-single-source-region']};
  }
  function auditRow(row={},context={}){
    const checks=[],fields=['sku','model','item_name','description','serial_number'];
    for(const field of fields){
      const value=row?.[field];if(!clean(value))continue;
      checks.push(inspectField(row,field,value,scopedEvidenceTexts(row,field,context)));
    }
    for(const serial of Array.isArray(row?.serials)?row.serials:[])if(clean(serial))checks.push(inspectField(row,'serials',serial,scopedEvidenceTexts(row,'serials',context)));
    const hard=checks.filter(x=>x.status==='fail'),review=checks.filter(x=>x.status==='review'),sanitized={...row};
    for(const issue of hard){
      if(issue.field==='serials')sanitized.serials=(sanitized.serials||[]).filter(x=>clean(x)!==issue.value);
      else if(clean(sanitized[issue.field])===issue.value)sanitized[issue.field]='';
    }
    if(hard.length){sanitized.v41ShadowRandomCharacterFail=true;sanitized.v41ShadowReviewRequired=true;}
    else if(review.length)sanitized.v41ShadowReviewRequired=true;
    return {row:sanitized,checks,hardFailures:hard,reviewIssues:review,ok:hard.length===0};
  }
  function auditRows(rows=[],context={}){
    const audited=(rows||[]).map((row,index)=>({index,...auditRow(row,context)}));
    const hardFailures=audited.flatMap(a=>a.hardFailures.map(issue=>({rowIndex:a.index,...issue})));
    const reviewIssues=audited.flatMap(a=>a.reviewIssues.map(issue=>({rowIndex:a.index,...issue})));
    return Object.freeze({version:VERSION,mode:'shadow',productionMutation:false,ok:hardFailures.length===0&&reviewIssues.length===0,inputCount:(rows||[]).length,outputRows:audited.map(a=>a.row),hardFailures,reviewIssues,randomCharacterFailureCount:hardFailures.length,reviewIssueCount:reviewIssues.length,readyForProduction:hardFailures.length===0&&reviewIssues.length===0});
  }

  function center(it){return Number(it?.x)+(Number(it?.width)||0)/2;}
  function headerColumns(allRows=[],targetIndexes=[]){
    const targetMin=targetIndexes.length?Math.min(...targetIndexes):Infinity;
    const candidates=allRows.filter(r=>Number(r.rowIndex)<targetMin&&/description|particulars|details/i.test(String(r.text||''))&&/(qty|quantity)/i.test(String(r.text||''))&&/(amount|price|rate)/i.test(String(r.text||''))).sort((a,b)=>Number(b.rowIndex)-Number(a.rowIndex));
    const h=candidates[0];if(!h)return null;
    const items=(h.items||[]).map(it=>({text:clean(it.text),c:center(it)})).filter(x=>Number.isFinite(x.c)).sort((a,b)=>a.c-b.c);
    const find=re=>items.find(x=>re.test(x.text));
    const code=find(/^(?:product|sku|model|code|item)$/i),desc=find(/description|particulars|details/i),qty=find(/^(?:qty|quantity)$/i),price=find(/price|rate/i),amount=[...items].reverse().find(x=>/amount|total/i.test(x.text));
    if(!desc||!qty||!price||!amount)return null;
    const mid=(a,b)=>(a+b)/2;
    return {
      code:code?[mid(Math.min(code.c,desc.c)-(desc.c-code.c||80),code.c),mid(code.c,desc.c)]:null,
      description:[code?mid(code.c,desc.c):desc.c-120,mid(desc.c,qty.c)],
      quantity:[mid(desc.c,qty.c),mid(qty.c,price.c)],
      unit_price:[mid(qty.c,price.c),mid(price.c,amount.c)],
      amount:[mid(price.c,amount.c),Infinity]
    };
  }
  function cellText(row,bounds){
    if(!bounds)return '';
    const [lo,hi]=bounds;
    return (row?.items||[]).filter(it=>{const c=center(it);return Number.isFinite(c)&&c>=lo&&c<hi;}).sort((a,b)=>(Number(a.x)||0)-(Number(b.x)||0)).map(x=>clean(x.text)).filter(Boolean).join(' ').trim();
  }
  function uniqueModelToken(text=''){
    const hits=[...String(text||'').matchAll(/\b[A-Z0-9][A-Z0-9+._\/-]{2,}\b/gi)].map(x=>clean(x[0])).filter(x=>MODEL_TOKEN_RE.test(x)&&/[A-Za-z]/.test(x)&&/\d/.test(x)&&!/^\d+[.,]\d+$/.test(x)&&!identifierRisk(x,'model',[]).risky);
    const keys=new Map();for(const h of hits)keys.set(compact(h),h);
    return keys.size===1?[...keys.values()][0]:'';
  }
  function layoutCandidate(row={},field='',context={}){
    for(const match of matchingLayoutRows(row,context)){
      const indexes=match.rows.map(r=>Number(r.rowIndex)),cols=headerColumns(match.allRows,indexes);
      if(!cols)continue;
      if(field==='sku'||field==='model'){
        let vals=[];
        if(cols.code)vals=match.rows.map(r=>cellText(r,cols.code)).filter(Boolean);
        if(!vals.length)vals=match.rows.map(r=>uniqueModelToken(cellText(r,cols.description))).filter(Boolean);
        vals=[...new Map(vals.map(v=>[compact(v),v])).values()];
        if(vals.length===1)return {value:vals[0],lane:'layout-cell',source:match.source,page:match.page,rowIndexes:indexes};
      }else if(field==='item_name'||field==='description'){
        const vals=match.rows.map(r=>cellText(r,cols.description)).filter(v=>v&&!/^\s*(?:model|warranty|serial|s\/?n)\b/i.test(v));
        const value=clean(vals.join(' '));if(value)return {value,lane:'layout-cell',source:match.source,page:match.page,rowIndexes:indexes};
      }
    }
    return null;
  }
  function targetedEvidenceCandidates(row={},field='',context={}){
    const p=row?.provenance||{},page=Number(p.page)||null,indexes=new Set((p.rowIndexes||[]).map(Number).filter(Number.isFinite)),out=[];
    for(const e of context.targetedEvidence||[]){
      if(clean(e?.field)!==field)continue;
      if(page&&Number(e?.page)&&Number(e.page)!==page)continue;
      const er=(e?.rowIndexes||[]).map(Number).filter(Number.isFinite);
      if(indexes.size&&er.length&&!er.some(x=>indexes.has(x)))continue;
      const value=clean(e?.value||e?.text||'');if(value)out.push({value,lane:'targeted-evidence',source:clean(e?.source||e?.id||'targeted'),page:e?.page||page,rowIndexes:er});
    }
    return out;
  }
  function provenanceCandidate(row={},field='',context={}){
    const p=row?.provenance||{},texts=rowProvenanceTexts(row,context);
    if(field==='sku'||field==='model'){
      const twin=field==='sku'?row.model:row.sku;
      if(clean(twin)&&sourceSupport(twin,field,texts).supported)return {value:clean(twin),lane:'twin-field',source:'row'};
      if(clean(p.printedModel)&&sourceSupport(p.printedModel,field,texts).supported)return {value:clean(p.printedModel),lane:'printed-model',source:clean(p.source||'provenance')};
      const m=uniqueModelToken(texts.join(' '));if(m)return {value:m,lane:'provenance-region',source:clean(p.source||'provenance')};
    }
    if(field==='item_name'||field==='description'){
      const twin=field==='item_name'?row.description:row.item_name;
      if(clean(twin)&&sourceSupport(twin,field,texts).supported)return {value:clean(twin),lane:'twin-field',source:'row'};
      if(field==='description'&&clean(twin)){
        const twinClass=equipmentClass(twin),sourceClass=equipmentClass(texts.join(' '));
        if(twinClass&&sourceClass&&twinClass===sourceClass)return {value:clean(twin),lane:'twin-field-class-supported',source:'row'};
      }
    }
    return null;
  }
  function rawRegionCandidate(row={},field='',context={}){
    const region=bestRawRegion(row,field,context);if(!region)return null;
    if(field==='sku'||field==='model'){
      const twin=field==='sku'?row.model:row.sku;
      if(clean(twin)&&sourceSupport(twin,field,[region.text]).supported)return {value:clean(twin),lane:'raw-region-twin',source:region.source};
      const m=uniqueModelToken(region.text);if(m)return {value:m,lane:'raw-region-model',source:region.source};
    }
    if(field==='item_name'||field==='description'){
      const twin=field==='item_name'?row.description:row.item_name;
      if(clean(twin)&&sourceSupport(twin,field,[region.text]).supported)return {value:clean(twin),lane:'raw-region-twin',source:region.source};
      if(field==='description'&&clean(twin)){
        const twinClass=equipmentClass(twin),sourceClass=equipmentClass(region.text);
        if(twinClass&&sourceClass&&twinClass===sourceClass)return {value:clean(twin),lane:'raw-region-twin-class-supported',source:region.source};
      }
    }
    return null;
  }
  function serialCandidates(row={},field='',context={}){
    const texts=scopedEvidenceTexts(row,field,context),out=[];
    const add=(value,lane,source='row-local')=>{value=clean(value);if(value&&compact(value).length>=4)out.push({value,lane,source});};
    for(const text of texts){
      const re=/\b(?:serial(?:\s*(?:no\.?|number))?|s\/?n)\s*[:#-]?\s*([A-Z0-9][A-Z0-9._\/-]{3,})\b/gi;
      let m;while((m=re.exec(String(text||''))))add(m[1],'serial-label','row-local');
    }
    for(const c of targetedEvidenceCandidates(row,field,context))add(c.value,'targeted-serial',c.source);
    return [...new Map(out.map(x=>[compact(x.value),x])).values()];
  }
  function targetedRecoverField(row={},issue={},context={}){
    const field=issue.field;
    if(field==='item_name'||field==='description'){
      const tail=trailingTextNoise(issue.value,field);
      if(tail?.trimmed){
        const probe={...row,[field]:tail.trimmed};
        const check=inspectField(probe,field,tail.trimmed,scopedEvidenceTexts(probe,field,context));
        if(check.status==='pass')return {recovered:true,field,value:tail.trimmed,reason:'trimmed-row-local-ocr-fragment',support:['row-local-trim']};
      }
    }
    if(field==='serials'||field==='serial_number'){
      const candidates=serialCandidates(row,field,context);
      if(candidates.length!==1)return {recovered:false,field,reason:candidates.length?'conflicting-serial-evidence':'no-row-local-serial-evidence',candidates};
      const candidate=candidates[0],probe={...row,[field]:candidate.value};
      const check=inspectField(probe,field,candidate.value,scopedEvidenceTexts(probe,field,context));
      return check.status==='pass'?{recovered:true,field,value:candidate.value,reason:'explicit-row-local-serial-label',support:[candidate.lane],candidates}:{recovered:false,field,reason:'serial-evidence-check-failed',candidate:candidate.value,check,candidates};
    }
    const candidates=[];
    const add=c=>{if(c&&clean(c.value))candidates.push(c);};
    add(layoutCandidate(row,field,context));add(provenanceCandidate(row,field,context));add(rawRegionCandidate(row,field,context));
    for(const c of targetedEvidenceCandidates(row,field,context))add(c);
    const groups=new Map();
    for(const c of candidates){
      const k=keyFor(field,c.value);if(!k)continue;
      if(!groups.has(k))groups.set(k,{value:c.value,candidates:[],lanes:new Set(),sources:new Set()});
      const g=groups.get(k);g.candidates.push(c);g.lanes.add(c.lane);g.sources.add(c.source||c.lane);
    }
    const ranked=[...groups.values()].sort((a,b)=>{
      const directA=a.lanes.has('layout-cell')||a.lanes.has('twin-field')||a.lanes.has('twin-field-class-supported')||a.lanes.has('raw-region-twin-class-supported')||a.lanes.has('printed-model')||a.lanes.has('provenance-region');
      const directB=b.lanes.has('layout-cell')||b.lanes.has('twin-field')||b.lanes.has('twin-field-class-supported')||b.lanes.has('raw-region-twin-class-supported')||b.lanes.has('printed-model')||b.lanes.has('provenance-region');
      return Number(directB)-Number(directA)||b.sources.size-a.sources.size||b.candidates.length-a.candidates.length;
    });
    if(!ranked.length)return {recovered:false,field,reason:'no-targeted-candidate',candidates:[]};
    const top=ranked[0],direct=top.lanes.has('layout-cell')||top.lanes.has('twin-field')||top.lanes.has('twin-field-class-supported')||top.lanes.has('raw-region-twin-class-supported')||top.lanes.has('printed-model')||top.lanes.has('provenance-region');
    const independentSources=new Set(top.candidates.map(c=>clean(c.evidenceRoot||c.source||'')).filter(x=>x&&x!=='row'&&x!=='raw'));
    const consensus=independentSources.size>=2;
    if(!direct&&!consensus)return {recovered:false,field,reason:'insufficient-independent-support',candidates};
    if(ranked[1]&&keyFor(field,ranked[1].value)!==keyFor(field,top.value)&&ranked[1].sources.size>=top.sources.size&&!direct)
      return {recovered:false,field,reason:'conflicting-targeted-evidence',candidates};
    const candidate=clean(top.value),probe={...row,[field]:candidate};
    const check=inspectField(probe,field,candidate,scopedEvidenceTexts(probe,field,context));
    if(check.status==='fail')return {recovered:false,field,reason:'recovered-value-failed-evidence-check',candidate,check,candidates};
    return {recovered:true,field,value:candidate,reason:direct?'direct-source-region':'multi-source-consensus',support:[...top.lanes],candidates};
  }
  function recoverRow(row={},context={}){
    const before=auditRow(row,context),out={...before.row},recoveries=[],unresolved=[];
    for(const issue of before.hardFailures){
      const r=targetedRecoverField(row,issue,context);
      if(r.recovered){out[issue.field]=r.value;recoveries.push({...r,original:issue.value});}
      else unresolved.push({...issue,recoveryReason:r.reason,recoveryCandidates:r.candidates||[]});
    }
    const after=auditRow(out,context),safe={...after.row};
    for(const issue of after.hardFailures){
      if(issue.field==='serials')safe.serials=(safe.serials||[]).filter(x=>clean(x)!==issue.value);
      else safe[issue.field]='';
    }
    delete safe.v41ShadowRandomCharacterFail;delete safe.v41ShadowReviewRequired;delete safe.v41ProductionReviewRequired;
    const integrityIssues=[
      ...unresolved.map(x=>({field:x.field,code:x.code||'unresolved-recovery',reason:x.recoveryReason||'',value:x.value||''})),
      ...after.hardFailures.map(x=>({field:x.field,code:x.code||'evidence-integrity-failure',reason:(x.reasons||[]).join(', '),value:x.value||''})),
      ...after.reviewIssues.map(x=>({field:x.field,code:x.code||'evidence-review',reason:(x.reasons||[]).join(', '),value:x.value||''}))
    ];
    if(integrityIssues.length)safe.v41IntegrityIssues=integrityIssues;else delete safe.v41IntegrityIssues;
    if(recoveries.length)safe.v41TargetedRecoveryApplied=true;
    if(integrityIssues.length){safe.v41ShadowReviewRequired=true;safe.v41ProductionReviewRequired=true;}
    return {row:safe,before,after,recoveries,unresolved,ok:after.hardFailures.length===0&&after.reviewIssues.length===0&&unresolved.length===0};
  }
  function recoverRows(rows=[],context={}){
    const results=(rows||[]).map((row,index)=>({index,...recoverRow(row,context)}));
    const recoveries=results.flatMap(r=>r.recoveries.map(x=>({rowIndex:r.index,...x})));
    const unresolved=results.flatMap(r=>r.unresolved.map(x=>({rowIndex:r.index,...x})));
    const finalAudit=auditRows(results.map(r=>r.row),context);
    return Object.freeze({
      version:VERSION,mode:'shadow-targeted-recovery',productionMutation:false,
      inputCount:(rows||[]).length,outputRows:results.map(r=>r.row),
      recoveries,targetedRecoveryCount:recoveries.length,
      unresolvedRecoveries:unresolved,unresolvedRecoveryCount:unresolved.length,
      hardFailures:finalAudit.hardFailures,randomCharacterFailureCount:finalAudit.randomCharacterFailureCount,
      reviewIssues:finalAudit.reviewIssues,reviewIssueCount:finalAudit.reviewIssueCount,
      ok:finalAudit.randomCharacterFailureCount===0&&finalAudit.reviewIssueCount===0&&unresolved.length===0,
      readyForProduction:finalAudit.randomCharacterFailureCount===0&&finalAudit.reviewIssueCount===0&&unresolved.length===0
    });
  }
  function recoveryRequest(row={},field='',reason=''){
    const p=row?.provenance||{};
    return {field,page:Number(p.page)||null,rowIndexes:[...(p.rowIndexes||[])],tableId:clean(p.tableId||''),source:clean(p.source||''),reason:reason||'targeted-field-recovery'};
  }
  function selfTest(){
    const failures=[],raw='TAX INVOICE\nAVS-320 Projector controller 2 350.00 700.00\nShure PGA58-LC Dynamic microphone 1 90.00 90.00';
    const good=auditRows([{sku:'AVS-320',item_name:'Projector controller',quantity:2,unit_price:350,amount:700}],{raw});
    if(!good.ok)failures.push('valid source-backed row rejected');
    const bad=auditRows([{sku:'Q7XZ9K2P',item_name:'Projector controller',quantity:2,unit_price:350,amount:700}],{raw});
    if(bad.ok||bad.randomCharacterFailureCount!==1||bad.outputRows[0].sku!=='')failures.push('unsupported random identifier not rejected/blanked');
    const contaminatedElsewhere=auditRows([{sku:'Q7XZ9K2P',model:'AVS-320',item_name:'Projector controller',quantity:2,unit_price:350,amount:700,provenance:{rawText:'AVS-320 Projector controller 2 350.00 700.00'}}],{raw:raw+'\nQ7XZ9K2P unrelated footer'});
    if(contaminatedElsewhere.ok)failures.push('global-page token incorrectly satisfied row-local evidence');
    const recovered=recoverRows([{sku:'Q7XZ9K2P',model:'AVS-320',item_name:'Projector controller',description:'Projector controller',quantity:2,unit_price:350,amount:700,provenance:{rawText:'AVS-320 Projector controller 2 350.00 700.00'}}],{raw});
    if(!recovered.ok||recovered.outputRows[0].sku!=='AVS-320')failures.push('targeted twin/source recovery failed');
    const crossRow=recoverRows([{sku:'SLXD24/SM58',item_name:'Single Channel Digital Wireless Handheld Mic',description:'Digital Power Amplifier with DSP',quantity:1,unit_price:480,amount:480,provenance:{rawText:'Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter with SM58 Cardioid Capsule 1 480.00 480.00'}}],{raw:'Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter with SM58 Cardioid Capsule 1 480.00 480.00'});
    if(crossRow.outputRows[0].description==='Digital Power Amplifier with DSP')failures.push('cross-row equipment-class contamination was not removed');
    if(crossRow.reviewIssueCount>0&&crossRow.ok)failures.push('cross-row unresolved evidence incorrectly reported ready');
    const numericPollution=recoverRows([{sku:'HZMZ-84X84',item_name:'Motorized Screen',description:'(Synchronous) 84 motorised 1 230.00 230.00 plifier 5 29.50 147.50',quantity:2,unit_price:430,amount:860,provenance:{rawText:'HZMZ-84X84 ABTUS 84 x 84 Motorized Screen (Synchronous) c/w Abtus SSR8 screen switch'}}],{raw:'HZMZ-84X84 ABTUS 84 x 84 Motorized Screen (Synchronous) c/w Abtus SSR8 screen switch'});
    if(numericPollution.outputRows[0].description.includes('230.00'))failures.push('numeric cross-row contamination was not removed');
    if(numericPollution.ok&&numericPollution.reviewIssueCount>0)failures.push('review issue incorrectly reported ready');
    const serial=recoverRows([{serial_number:'Q7XZ9K2P',item_name:'PTZ Camera',description:'PTZ Camera',quantity:1,provenance:{rawText:'PTZ Camera Serial No: CAM-88421'}}],{raw:'PTZ Camera Serial No: CAM-88421'});
    if(serial.outputRows[0].serial_number!=='CAM-88421')failures.push('row-local labelled serial recovery failed');
    const unresolved=recoverRows([{sku:'Q7XZ9K2P',item_name:'Wireless microphone',description:'Wireless microphone',quantity:1,provenance:{rawText:'Wireless microphone'}}],{raw:'Wireless microphone'});
    if(unresolved.ok||unresolved.readyForProduction)failures.push('unresolved recovery incorrectly reported ready');
    return {ok:failures.length===0,version:VERSION,failures};
  }

  global.InventoryHubParserV41Shadow=Object.freeze({
    VERSION,evidenceTexts,lineWindows,significantTokens,layoutPages,matchingLayoutRows,rowProvenanceTexts,
    bestRawRegion,targetedEvidenceTexts,scopedEvidenceTexts,sourceSupport,serialCandidates,randomSignature,unsupportedRandomFragments,equipmentClass,numericFragmentCount,inspectField,
    auditRow,auditRows,headerColumns,cellText,uniqueModelToken,layoutCandidate,targetedEvidenceCandidates,
    provenanceCandidate,rawRegionCandidate,targetedRecoverField,recoverRow,recoverRows,recoveryRequest,selfTest
  });
})(typeof window!=='undefined'?window:globalThis);
