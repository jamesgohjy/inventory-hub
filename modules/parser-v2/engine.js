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
  function reconcileSupportingEconomics(skeletons=[],supportRows=[]){
    const validSupport=(supportRows||[]).filter(r=>(R?.economics?.(r)||{}).ok===true&&r.layoutEvidenceVerified===true&&r.economicEvidenceVerified===true);
    const used=new Set(),out=[];
    for(const skeleton of skeletons||[]){
      const ranked=validSupport.map((row,index)=>({row,index,score:supportMatchScore(skeleton,row)}))
        .filter(x=>x.score>=0&&!used.has(x.index)).sort((a,b)=>b.score-a.score);
      const best=ranked[0],second=ranked[1];
      if(!best){out.push(skeleton);continue;}
      const bestSig=economicSignature(best.row),secondSig=second?economicSignature(second.row):'';
      if(second&&Math.abs(best.score-second.score)<8&&bestSig&&secondSig&&bestSig!==secondSig){out.push(skeleton);continue;}
      used.add(best.index);
      out.push({
        ...skeleton,
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
            economics:economicSignature(best.row)
          }
        }
      });
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
    const skeletons=typeof B.buildSkeletonRows==='function'?tables.flatMap(t=>B.buildSkeletonRows(t)):[];
    const reconciledSkeletons=reconcileSupportingEconomics(skeletons,supportPhysical.rows);
    const physicalCandidates=physical.tables.map(t=>({origin:'v2-physical:'+t.id,items:t.rows}));
    if(reconciledSkeletons.length)physicalCandidates.push({origin:'v2-invoice-skeleton-recovery',items:reconciledSkeletons});
    const rowLedger=R.buildLedger(physicalCandidates);
    const completeness=R.summarize(rowLedger);
    const invoiceRows=[...physical.rows,...reconciledSkeletons];

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
    // Promotion blockers are merged immutably; source evidence must remain complete.
    const promotionBlockers=[
      ...promotion.blockers,
      ...sourceIssues.filter(issue=>!promotion.blockers.some(x=>x.code===issue.code))
    ];
    const safeToPromote=promotion.safe&&sourceIssues.length===0;
    const promotionRows=safeToPromote?promotion.rows:[];

    return Object.freeze({
      version:'2.3-support-reconciliation',
      mode:'evidence-first-independent-table',
      headers,
      tables,
      physicalRows:invoiceRows,
      rowLedger,
      supportEvidence:Object.freeze({tableCount:supportTables.length,rowCount:supportPhysical.rows.length,recoveredRowCount:reconciledSkeletons.filter(x=>x.supportingDocumentEvidenceVerified).length,pendingRowCount:reconciledSkeletons.filter(x=>!x.supportingDocumentEvidenceVerified).length}),
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
    version:'2.3-support-reconciliation',
    analyze,
    reconcileSupportingEconomics,
    supportMatchScore,
    assessPromotion,
    promotionIdentity,
    economicSignature,
    selfTest
  });
})(typeof window!=='undefined'?window:globalThis);
