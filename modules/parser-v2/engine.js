// Inventory Hub Parser V2 — independent geometry-first evidence engine
(function(global){
  'use strict';
  const E=global.InventoryHubParserV2Evidence,H=global.InventoryHubParserV2Header,T=global.InventoryHubParserV2TableDetector,B=global.InventoryHubParserV2RowBuilder,R=global.InventoryHubParserV2Rows;
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const keyText=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

  function promotionIdentity(row={}){
    const sku=keyText(row.sku||row.model||'').replace(/\s+/g,'');
    if(sku)return 'sku:'+sku;
    const desc=keyText(row.item_name||row.description||'')
      .replace(/\b(?:supply|with|including|the|a|an|pcs?|piece|set)\b/g,' ')
      .replace(/\s+/g,' ').trim();
    return desc?'desc:'+desc.slice(0,100):'';
  }
  function economicSignature(row={}){
    const e=R?.economics?.(row)||{complete:false,ok:false};
    if(!e.complete||!e.ok)return '';
    return [Number(row.quantity),Number(row.unit_price).toFixed(2),Number(row.amount).toFixed(2)].join('|');
  }
  const RECOVERY_STOP=new Set(['the','and','with','for','from','into','setup','support','supported','supply','install','system','digital','single','dual','new','equipment','specified','section','model','console']);
  function recoveryTokens(row={}){
    return new Set(keyText([row.sku,row.model,row.item_name,row.description].filter(Boolean).join(' '))
      .split(' ').filter(t=>t.length>=3&&!RECOVERY_STOP.has(t)));
  }
  function supportMatchScore(invoiceRow={},supportRow={}){
    const iq=Number(invoiceRow.quantity),sq=Number(supportRow.quantity),econ=R?.economics?.(supportRow)||{};
    if(!(iq>0)||iq!==sq||econ.ok!==true)return -1;
    const a=recoveryTokens(invoiceRow),b=recoveryTokens(supportRow);
    if(!a.size||!b.size)return -1;
    let shared=0;for(const t of a)if(b.has(t))shared++;
    const ratio=shared/Math.max(1,Math.min(a.size,b.size));
    const sku=keyText(invoiceRow.sku||invoiceRow.model||'').replace(/\s+/g,'');
    const supportText=keyText([supportRow.sku,supportRow.model,supportRow.item_name,supportRow.description].filter(Boolean).join(' ')).replace(/\s+/g,'');
    const exactModel=!!sku&&supportText.includes(sku);
    if(!exactModel&&(shared<3||ratio<.5))return -1;
    return (exactModel?100:0)+shared*12+ratio*50;
  }
  const CONFUSABLE_MODEL_PAIRS=new Set(['5S','S5','0O','O0','1I','I1','1L','L1','2Z','Z2','8B','B8','6G','G6']);
  function modelLikeTokens(row={}){
    const t=clean([row.sku,row.model,row.item_name,row.description,row?.provenance?.rawText].filter(Boolean).join(' '));
    const out=[];
    for(const m of t.matchAll(/\b[A-Z0-9][A-Z0-9+._\/-]{2,}\b/gi)){
      const v=String(m[0]||'').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
      if(/[A-Za-z]/.test(v)&&/\d/.test(v)&&!out.includes(v))out.push(v);
    }
    return out;
  }
  function oneConfusableModelDifference(a='',b=''){
    const x=String(a).toUpperCase(),y=String(b).toUpperCase();
    if(!x||x.length!==y.length||x===y)return false;
    let diffs=0,pair='';
    for(let i=0;i<x.length;i++)if(x[i]!==y[i]){diffs++;pair=x[i]+y[i];if(diffs>1)return false;}
    return diffs===1&&CONFUSABLE_MODEL_PAIRS.has(pair);
  }
  function corroboratedModel(invoiceRow={},supportRow={}){
    const current=clean(invoiceRow.sku||invoiceRow.model||'');if(!current)return '';
    for(const token of modelLikeTokens(supportRow)){
      if(oneConfusableModelDifference(current,token))return token;
    }
    return '';
  }
  function invoiceSubtotalEvidence(evidence={}){
    const values=[];
    for(const src of evidence.sources||[])for(const pg of src.layout||[]){
      // Continuation invoice pages may lose the invoice title in scans/OCR. Include "unknown"
      // pages for subtotal evidence, but never PO/DO/quotation/support pages.
      const role=typeof T.pageDocumentRole==='function'?T.pageDocumentRole(pg):'unknown';
      if(role==='noninvoice'||role==='support')continue;
      for(const row of pg.rows||[]){
        const text=clean(row.text||'');
        if(!/\bSUB\s*TOTAL\b|\bSUBTOTAL\b/i.test(text))continue;
        // A totals band may OCR as one line: "Subtotal 16,500.00 GST ... Invoice Total 17,985.00".
        // Bind the value specifically to SUBTOTAL instead of taking the last money token on the row.
        const direct=text.match(/\b(?:SUB\s*TOTAL|SUBTOTAL)\b\s*(?:SGD|S\$|\$)?\s*([\d,]+\.\d{2})/i);
        if(direct){
          const value=Number(direct[1].replace(/,/g,''));
          if(Number.isFinite(value))values.push({value,source:src.id,page:pg.page,evidence:row.text});
          continue;
        }
        // Geometry fallback: choose the first money-looking item to the right of the subtotal label.
        const items=(row.items||[]).slice().sort((a,b)=>(Number(a.x)||0)-(Number(b.x)||0));
        const labelIndex=items.findIndex(it=>/\b(?:SUB\s*TOTAL|SUBTOTAL)\b/i.test(clean(it.text||'')));
        if(labelIndex>=0){
          for(let i=labelIndex+1;i<items.length;i++){
            const m=clean(items[i].text||'').match(/(?:SGD|S\$|\$)?\s*([\d,]+\.\d{2})/i);
            if(!m)continue;
            const value=Number(m[1].replace(/,/g,''));
            if(Number.isFinite(value)){values.push({value,source:src.id,page:pg.page,evidence:row.text});break;}
          }
        }
      }
    }
    const unique=[...new Set(values.map(x=>Number(x.value).toFixed(2)))];
    if(unique.length!==1)return Object.freeze({proven:false,value:null,candidates:Object.freeze(values)});
    return Object.freeze({proven:true,value:Number(unique[0]),candidates:Object.freeze(values)});
  }
  function subtotalCheck(rowLedger=[],subtotalEvidence={}){
    if(!subtotalEvidence?.proven)return Object.freeze({proven:false,ok:null,expected:null,actual:null,delta:null});
    let actual=0,complete=true;
    for(const x of rowLedger||[]){
      const row=x.row||{},a=Number(row.amount);
      if(!Number.isFinite(a)){complete=false;continue;}
      actual+=a;
    }
    actual=Math.round(actual*100)/100;
    const expected=Number(subtotalEvidence.value),delta=Math.round(Math.abs(actual-expected)*100)/100,tolerance=Math.max(.06,Math.abs(expected)*.002);
    return Object.freeze({proven:true,complete,ok:complete&&delta<=tolerance,expected,actual,delta,tolerance});
  }

  function sourceId(row={}){return clean(row?.provenance?.source||row?.source||'');}
  function observed(row={},field){
    const raw=row?.observedEconomics?.[field];
    const fallback=row?.[field];
    const v=Number(raw===null||raw===undefined||raw===''?fallback:raw);
    return Number.isFinite(v)?Math.round(v*100)/100:null;
  }
  function descriptionMatchScore(a={},b={}){
    const at=recoveryTokens(a),bt=recoveryTokens(b);if(!at.size||!bt.size)return -1;
    let shared=0;for(const t of at)if(bt.has(t))shared++;
    const ratio=shared/Math.max(1,Math.min(at.size,bt.size));
    return shared>=3&&ratio>=.5?shared*12+ratio*50:-1;
  }
  function normalizeCrossOcrSkeletonModels(rows=[]){
    const out=(rows||[]).map(r=>({...r}));
    for(let i=0;i<out.length;i++){
      const row=out[i],q=Number(row.quantity);if(!(q>0))continue;
      const peers=out.filter((p,j)=>j!==i&&Number(p.quantity)===q&&descriptionMatchScore(row,p)>=70);
      const all=[row,...peers],byModel=new Map();
      for(const p of all){
        const model=clean(p.sku||p.model||'');if(!model)continue;
        const key=keyText(model).replace(/\s+/g,'');if(!key)continue;
        if(!byModel.has(key))byModel.set(key,{value:model,sources:new Set()});
        byModel.get(key).sources.add(sourceId(p)||('row-'+all.indexOf(p)));
      }
      const ranked=[...byModel.values()].map(x=>({...x,support:x.sources.size})).sort((a,b)=>b.support-a.support);
      if(ranked[0]?.support>=2&&ranked[0].support>Number(ranked[1]?.support||0)){
        row.sku=ranked[0].value;row.model=ranked[0].value;
        row.provenance={...(row.provenance||{}),modelConsensus:{value:ranked[0].value,support:ranked[0].support}};
      }
    }
    return out;
  }
  function consensusValue(rows=[],field,{minSupport=2,tolerance=.02}={}){
    const points=[];
    for(const row of rows||[]){
      const v=observed(row,field),src=sourceId(row);if(v===null||!src)continue;
      points.push({value:v,source:src});
    }
    const clusters=[];
    for(const p of points){
      let cluster=clusters.find(c=>Math.abs(c.center-p.value)<=tolerance);
      if(!cluster){cluster={values:[],sources:new Set(),center:p.value};clusters.push(cluster);}
      cluster.values.push(p.value);cluster.sources.add(p.source);cluster.center=cluster.values.reduce((a,v)=>a+v,0)/cluster.values.length;
    }
    clusters.sort((a,b)=>b.sources.size-a.sources.size||b.values.length-a.values.length);
    const best=clusters[0],second=clusters[1];
    if(!best||best.sources.size<minSupport||best.sources.size===Number(second?.sources?.size||0))return null;
    return {value:Math.round(best.center*100)/100,support:best.sources.size,sources:[...best.sources]};
  }
  function partialSupportRecovery(skeleton={},supportEvidenceRows=[]){
    const matches=(supportEvidenceRows||[]).filter(r=>descriptionMatchScore(skeleton,r)>=70);
    if(!matches.length)return null;
    const invoiceQ=Number(skeleton.quantity);
    const invoiceUnit=observed(skeleton,'unit_price');
    if(invoiceQ>0&&invoiceUnit!==null&&invoiceUnit>=0){
      const derivedAmount=Math.round(invoiceQ*invoiceUnit*100)/100,tol=Math.max(.03,Math.abs(derivedAmount)*.003);
      const corroborating=matches.filter(r=>{
        const a=observed(r,'amount');return a!==null&&Math.abs(a-derivedAmount)<=tol&&sourceId(r);
      });
      const sources=[...new Set(corroborating.map(sourceId).filter(Boolean))];
      if(sources.length>=1){
        return {
          quantity:invoiceQ,unit_price:invoiceUnit,amount:derivedAmount,
          support:sources.length,sources,
          invoiceObserved:{quantity:invoiceQ,unit_price:invoiceUnit,amount:observed(skeleton,'amount')},
          method:'invoice-arithmetic-support-amount'
        };
      }
    }
    const qtyConsensus=consensusValue(matches,'quantity',{minSupport:2,tolerance:.01});
    const q=invoiceQ>0?invoiceQ:Number(qtyConsensus?.value);
    if(!(q>0)||Math.abs(q-Math.round(q))>.001)return null;
    // When invoice Qty is unreadable, two independent support OCR sources must agree on it.
    if(!(invoiceQ>0)&&!qtyConsensus)return null;
    const amountConsensus=consensusValue(matches,'amount',{minSupport:2,tolerance:.02});
    if(!amountConsensus)return null;
    const derivedUnit=Math.round((amountConsensus.value/q)*100)/100;
    if(!(derivedUnit>=0))return null;
    const supportUnit=consensusValue(matches,'unit_price',{minSupport:1,tolerance:.12});
    const agrees=v=>v!==null&&Math.abs(v-derivedUnit)<=Math.max(.12,Math.abs(derivedUnit)*.001);
    // If Qty and Amount are each independently corroborated by >=2 OCR sources,
    // their arithmetic may determine Unit Price even when the printed price itself is damaged.
    const derivedFromDualConsensus=!!qtyConsensus&&qtyConsensus.support>=2&&amountConsensus.support>=2;
    if(!agrees(invoiceUnit)&&!agrees(supportUnit?.value??null)&&!derivedFromDualConsensus)return null;
    const invoiceAmount=observed(skeleton,'amount');
    const delta=Math.abs(q*derivedUnit-amountConsensus.value),tol=Math.max(.03,Math.abs(amountConsensus.value)*.003);
    if(delta>tol)return null;
    return {
      quantity:q,unit_price:derivedUnit,amount:amountConsensus.value,
      support:Math.min(Number(qtyConsensus?.support||amountConsensus.support),amountConsensus.support),
      sources:[...new Set([...(qtyConsensus?.sources||[]),...(amountConsensus.sources||[])])],
      invoiceObserved:{quantity:invoiceQ>0?invoiceQ:null,unit_price:invoiceUnit,amount:invoiceAmount},
      method:'partial-economics-consensus'
    };
  }

  function reconcileSupportingEconomics(skeletons=[],supportRows=[],supportSkeletons=[]){
    const normalizedSkeletons=normalizeCrossOcrSkeletonModels(skeletons);
    const validSupport=(supportRows||[]).filter(r=>(R?.economics?.(r)||{}).ok===true&&r.layoutEvidenceVerified===true&&r.economicEvidenceVerified===true);
    const used=new Set(),out=[];
    for(const skeleton of normalizedSkeletons){
      const ranked=validSupport.map((row,index)=>({row,index,score:supportMatchScore(skeleton,row)}))
        .filter(x=>x.score>=0&&!used.has(x.index)).sort((a,b)=>b.score-a.score);
      const best=ranked[0],second=ranked[1];
      if(best){
        const bestSig=economicSignature(best.row),secondSig=second?economicSignature(second.row):'';
        if(!(second&&Math.abs(best.score-second.score)<8&&bestSig&&secondSig&&bestSig!==secondSig)){
          used.add(best.index);
          const correctedModel=corroboratedModel(skeleton,best.row);
          out.push({
            ...skeleton,
            ...(correctedModel?{sku:correctedModel,model:correctedModel}:{ }),
            unit_price:Number(best.row.unit_price),
            amount:Number(best.row.amount),
            economicEvidenceVerified:true,
            supportingDocumentEvidenceVerified:true,
            supportRecoveryPending:false,
            provenance:{
              ...(skeleton.provenance||{}),
              supportingDocument:{
                source:best.row?.provenance?.source||'',
                page:best.row?.provenance?.page||null,
                rowId:best.row?.sourceRowId||'',
                score:Math.round(best.score*100)/100,
                economics:economicSignature(best.row),
                modelCorrection:correctedModel?{from:skeleton.sku||skeleton.model||'',to:correctedModel,reason:'supporting-document-homoglyph-corroboration'}:null
              }
            }
          });
          continue;
        }
      }
      const partial=partialSupportRecovery(skeleton,[...(supportSkeletons||[]),...(validSupport||[])]);
      if(partial){
        out.push({
          ...skeleton,
          unit_price:partial.unit_price,amount:partial.amount,
          economicEvidenceVerified:true,supportingDocumentEvidenceVerified:true,supportRecoveryPending:false,
          provenance:{...(skeleton.provenance||{}),supportingDocument:{method:partial.method,sources:partial.sources,support:partial.support,economics:`${partial.quantity}|${partial.unit_price}|${partial.amount}`,invoiceObserved:partial.invoiceObserved}}
        });
      }else out.push(skeleton);
    }
    return out;
  }

  function assessPromotion(rowLedger=[],completeness={},finalComparison={}){
    const blockers=[];
    const equipment=(rowLedger||[]).filter(x=>x.disposition==='equipment');
    const promotable=equipment.filter(x=>{
      const row=x.row||{},econ=R?.economics?.(row)||{};
      return econ.ok===true&&row.layoutEvidenceVerified===true&&row.economicEvidenceVerified===true;
    });
    if(!equipment.length)blockers.push({code:'no-equipment-rows'});
    if(Number(completeness?.unexplainedRows||0)>0)blockers.push({code:'unaccounted-source-rows',count:Number(completeness.unexplainedRows)});
    if(promotable.length!==equipment.length)blockers.push({code:'unverified-equipment-row',count:equipment.length-promotable.length});

    // Conflicting quantity/price/amount for the same printed identity must never auto-promote.
    // Legitimate repeated identical rows remain valid because their economics signature is the same.
    const variants=new Map();
    for(const x of promotable){
      const id=promotionIdentity(x.row);if(!id)continue;
      if(!variants.has(id))variants.set(id,new Set());
      const sig=economicSignature(x.row);if(sig)variants.get(id).add(sig);
    }
    const conflicts=[...variants.entries()].filter(([,s])=>s.size>1).map(([identity,s])=>({identity,variants:[...s]}));
    if(conflicts.length)blockers.push({code:'conflicting-equipment-economics',conflicts});

    const safe=blockers.length===0&&promotable.length>0;
    const needed=!finalComparison?.complete;
    const rows=safe?promotable.map(x=>({
      ...(x.row||{}),
      parserV2Promoted:true,
      parserV2PromotionEvidence:{
        disposition:x.disposition,
        evidenceOrigins:[...(x.evidenceOrigins||[])],
        variantCount:Number(x.variantCount)||1
      }
    })):[];
    return Object.freeze({safe,needed,rows:Object.freeze(rows),blockers:Object.freeze(blockers)});
  }

  function analyze({sources=[],raw='',layout=[],candidates=[],legacyResult=null}={}){
    if(!E||!H||!T||!B||!R)throw new Error('Parser V2 dependencies are not loaded.');
    const evidence=E.buildDocumentEvidence({sources,raw,layout});
    const headers=H.resolveHeaders(evidence);

    // Independent V2 path: invoice evidence -> geometry -> table -> physical row -> accounting.
    // Explicit quotation/support pages may corroborate damaged invoice economics, but can never create rows by themselves.
    const tables=T.detectTables(evidence);
    const physical=B.buildRows(evidence,tables);
    const supportTables=typeof T.detectSupportTables==='function'?T.detectSupportTables(evidence):[];
    const supportPhysical=supportTables.length?B.buildRows(evidence,supportTables):{rows:[],tables:[]};
    const supportSkeletons=typeof B.buildSkeletonRows==='function'?supportTables.flatMap(t=>B.buildSkeletonRows(t)):[];
    const skeletons=typeof B.buildSkeletonRows==='function'?tables.flatMap(t=>B.buildSkeletonRows(t)):[];
    const reconciledSkeletons=reconcileSupportingEconomics(skeletons,supportPhysical.rows,supportSkeletons);
    const skeletonTableIds=new Set(reconciledSkeletons.map(r=>clean(r?.provenance?.tableId||'')).filter(Boolean));
    const physicalCandidates=physical.tables.map(t=>{
      const rows=(t.rows||[]).filter(row=>{
        const missing=v=>v===null||v===undefined||String(v).trim()===''||!Number.isFinite(Number(v));
        const placeholder=String(row?.classification?.type||'').toLowerCase()==='unknown'&&missing(row?.quantity)&&missing(row?.unit_price)&&missing(row?.amount);
        return !(placeholder&&skeletonTableIds.has(t.id));
      });
      return {origin:'v2-physical:'+t.id,items:rows};
    }).filter(x=>x.items.length);
    if(reconciledSkeletons.length)physicalCandidates.push({origin:'v2-invoice-skeleton-recovery',items:reconciledSkeletons});
    const rowLedger=R.buildLedger(physicalCandidates);
    const completeness=R.summarize(rowLedger);
    const invoiceRows=[...physical.rows,...reconciledSkeletons];
    const invoiceSubtotal=invoiceSubtotalEvidence(evidence),invoiceSubtotalCheck=subtotalCheck(rowLedger,invoiceSubtotal);

    // Legacy candidates are retained for diagnostic comparison only.
    const legacyCandidateLedger=R.buildLedger(candidates);
    const legacyCandidateSummary=R.summarize(legacyCandidateLedger);
    const finalItems=legacyResult?.items||[];
    const finalComparison=R.compareFinalItems(rowLedger,finalItems);

    const sourceIssues=[];
    if(!tables.length)sourceIssues.push({code:'no-independent-table-evidence'});
    if(tables.length&&!invoiceRows.length)sourceIssues.push({code:'table-detected-no-physical-rows'});
    if(!completeness.complete)sourceIssues.push({code:'unaccounted-source-rows',count:completeness.unexplainedRows});

    const comparisonIssues=[];
    if(tables.length&&!finalComparison.complete)comparisonIssues.push({
      code:'legacy-final-items-incomplete',
      missingEquipment:finalComparison.missingEquipment.map(x=>({key:x.key,row:x.row,evidenceOrigins:x.evidenceOrigins}))
    });

    const headerIssues=[];
    if(!headers.supplier_name)headerIssues.push({code:'supplier-not-proven'});
    if(!headers.invoice_number)headerIssues.push({code:'invoice-number-not-proven'});
    if(!headers.invoice_date)headerIssues.push({code:'invoice-date-not-proven'});

    const promotion=assessPromotion(rowLedger,completeness,finalComparison);
    const subtotalBlockers=invoiceSubtotalCheck.proven&&invoiceSubtotalCheck.ok===false?[{code:'invoice-subtotal-mismatch',expected:invoiceSubtotalCheck.expected,actual:invoiceSubtotalCheck.actual,delta:invoiceSubtotalCheck.delta}]:[];
    // Promotion blockers are merged immutably; source evidence must remain complete.
    const promotionBlockers=[
      ...promotion.blockers,
      ...sourceIssues.filter(issue=>!promotion.blockers.some(x=>x.code===issue.code)),
      ...subtotalBlockers
    ];
    const safeToPromote=promotion.safe&&sourceIssues.length===0&&subtotalBlockers.length===0;
    const promotionRows=safeToPromote?promotion.rows:[];

    return Object.freeze({
      version:'3.1-invoice-arithmetic-support-corroboration',
      mode:'evidence-first-independent-table',
      headers,
      tables,
      physicalRows:invoiceRows,
      rowLedger,
      supportEvidence:Object.freeze({tableCount:supportTables.length,rowCount:supportPhysical.rows.length,skeletonCount:supportSkeletons.length,recoveredRowCount:reconciledSkeletons.filter(x=>x.supportingDocumentEvidenceVerified).length,pendingRowCount:reconciledSkeletons.filter(x=>!x.supportingDocumentEvidenceVerified).length}),
      invoiceSubtotalCheck,
      completeness,
      finalComparison,
      headerDiff:Object.fromEntries(['supplier_name','invoice_number','invoice_date','reference_number'].map(field=>{
        const legacy=String(legacyResult?.doc?.[field]??'').trim(),v2=String(headers[field]??'').trim();
        return [field,{legacy,v2,same:legacy===v2,legacyMissing:!legacy,v2Missing:!v2}];
      })),
      legacyCandidateSummary,
      issues:[...sourceIssues,...comparisonIssues,...headerIssues],
      sourceIssues,
      comparisonIssues,
      headerIssues,
      independentTableEvidence:tables.length>0,
      safeToPromote,
      promotionNeeded:promotion.needed,
      promotionRows:Object.freeze(promotionRows),
      promotionDecision:Object.freeze({
        safe:safeToPromote,
        needed:promotion.needed,
        promotedEquipmentCount:promotionRows.length,
        blockers:Object.freeze(promotionBlockers)
      })
    });
  }

  function selfTest(){
    const failures=[];
    const layout=[{page:1,width:800,height:1000,yTolerance:3,rows:[
      {y:100,text:'PRODUCT NO DESCRIPTION QUANTITY UNIT PRICE AMOUNT',items:[
        {text:'PRODUCT NO',x:40,width:90},{text:'DESCRIPTION',x:180,width:120},{text:'QUANTITY',x:470,width:60},{text:'UNIT PRICE',x:570,width:70},{text:'AMOUNT',x:700,width:60}
      ]},
      {y:140,text:'PROJ-1 Laser projector 1 1000.00 1000.00',items:[
        {text:'PROJ-1',x:45,width:70},{text:'Laser projector',x:180,width:180},{text:'1',x:490,width:10},{text:'1000.00',x:580,width:60},{text:'1000.00',x:705,width:60}
      ]},
      {y:175,text:'MIC-1 Wireless microphone receiver 2 300.00 600.00',items:[
        {text:'MIC-1',x:45,width:60},{text:'Wireless microphone receiver',x:180,width:240},{text:'2',x:490,width:10},{text:'300.00',x:585,width:55},{text:'600.00',x:710,width:55}
      ]},
      {y:210,text:'INSTALL Installation labour 1 200.00 200.00',items:[
        {text:'INSTALL',x:45,width:70},{text:'Installation labour',x:180,width:180},{text:'1',x:490,width:10},{text:'200.00',x:585,width:55},{text:'200.00',x:710,width:55}
      ]},
      {y:250,text:'SUBTOTAL 1800.00',items:[{text:'SUBTOTAL',x:570,width:70},{text:'1800.00',x:705,width:60}]}
    ]}];
    const sources=[
      {source:'native',text:'TAX INVOICE\nSUPPLIER: Northstar AV Pte Ltd\nInvoice No.: INV-1001\nDATE: 25/09/26\nRef. No.: REF-7788',layout},
      {source:'ocr',text:'Northstar AV Pte Ltd\nInvoice No.: INV-1001\nDATE: 25/09/26\nRef. No.: REF-7788'}
    ];
    const r=analyze({sources,candidates:[{origin:'legacy-partial',items:[{sku:'PROJ-1',item_name:'Laser projector',quantity:1,unit_price:1000,amount:1000}]}],
      legacyResult:{doc:{supplier_name:'Northstar AV Pte Ltd',invoice_number:'INV-1001',invoice_date:'2026-09-25',reference_number:'REF-7788'},items:[{sku:'PROJ-1',item_name:'Laser projector',quantity:1,unit_price:1000,amount:1000}]}});
    if(r.headers.reference_number!=='REF-7788')failures.push('strict reference resolver');
    if(r.tables.length!==1)failures.push('independent table detection');
    if(r.physicalRows.length!==3)failures.push('physical row reconstruction');
    if(r.completeness.counts.equipment!==2)failures.push('equipment row accounting');
    if(r.completeness.counts.service!==1)failures.push('service row accounting');
    if(r.finalComparison.missingEquipment.length!==1)failures.push('missing equipment detection');
    if(!r.safeToPromote||!r.promotionNeeded||r.promotionRows.length!==2)failures.push('safe evidence promotion');
    if(r.promotionRows.some(x=>/INSTALL/i.test(String(x.sku||''))))failures.push('service row promotion exclusion');
    const conflict=H.resolveHeaders(E.buildDocumentEvidence({sources:[
      {source:'a',text:'Ref. No.: REF-1001'},
      {source:'b',text:'Ref. No.: REF-1OOI'}
    ]}));
    if(conflict.reference_number!=='')failures.push('reference conflict must stay blank');
    return {ok:failures.length===0,failures};
  }

  global.InventoryHubParserV2=Object.freeze({
    version:'3.1-invoice-arithmetic-support-corroboration',
    analyze,
    partialSupportRecovery,
    normalizeCrossOcrSkeletonModels,
    reconcileSupportingEconomics,
    supportMatchScore,
    assessPromotion,
    promotionIdentity,
    economicSignature,
    selfTest
  });
})(typeof window!=='undefined'?window:globalThis);
