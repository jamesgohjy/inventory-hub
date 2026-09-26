// Inventory Hub Parser V2 — evidence analysis for authoritative verification
(function(global){
  'use strict';
  const E=global.InventoryHubParserV2Evidence,H=global.InventoryHubParserV2Header,R=global.InventoryHubParserV2Rows;
  function analyze({sources=[],raw='',layout=[],candidates=[],legacyResult=null}={}){
    if(!E||!H||!R)throw new Error('Parser V2 dependencies are not loaded.');
    const evidence=E.buildDocumentEvidence({sources,raw,layout});
    const headers=H.resolveHeaders(evidence);
    const ledger=R.buildLedger(candidates);
    const completeness=R.summarize(ledger);
    const finalItems=legacyResult?.items||[];
    const finalComparison=R.compareFinalItems(ledger,finalItems);
    const legacyDoc=legacyResult?.doc||{};
    const headerDiff={};
    for(const field of ['supplier_name','invoice_number','invoice_date','reference_number']){
      const legacy=String(legacyDoc[field]??'').trim(),v2=String(headers[field]??'').trim();
      headerDiff[field]={legacy,v2,same:legacy===v2,legacyMissing:!legacy,v2Missing:!v2};
    }
    const issues=[];
    if(!completeness.complete)issues.push({code:'unaccounted-source-rows',count:completeness.unexplainedRows});
    if(!finalComparison.complete)issues.push({code:'legacy-final-items-incomplete',missingEquipment:finalComparison.missingEquipment.map(x=>({key:x.key,row:x.row,evidenceOrigins:x.evidenceOrigins}))});
    if(!headers.supplier_name)issues.push({code:'supplier-not-proven'});
    if(!headers.invoice_number)issues.push({code:'invoice-number-not-proven'});
    if(!headers.invoice_date)issues.push({code:'invoice-date-not-proven'});
    return Object.freeze({
      version:'2.1-authoritative-verification',
      mode:'authoritative-verification',
      authoritative:true,
      headers,
      rowLedger:ledger,
      completeness,
      finalComparison,
      headerDiff,
      issues,
      safeToPromote:issues.length===0
    });
  }
  function selfTest(){
    const failures=[];
    const sources=[
      {source:'native',text:'TAX INVOICE\nSUPPLIER: Northstar AV Pte Ltd\nInvoice No.: INV-1001\nDATE: 25/09/26\nRef. No.: REF-7788'},
      {source:'ocr',text:'Northstar AV Pte Ltd\nInvoice No.: INV-1001\nDATE: 25/09/26\nRef. No.: REF-7788'}
    ];
    const candidates=[
      {origin:'layout',items:[
        {sku:'PROJ-1',item_name:'Laser projector',quantity:1,unit_price:1000,amount:1000},
        {sku:'MIC-1',item_name:'Wireless microphone receiver',quantity:2,unit_price:300,amount:600},
        {sku:'INSTALL',item_name:'Installation labour',quantity:1,unit_price:200,amount:200}
      ]},
      {origin:'text',items:[
        {sku:'PROJ-1',item_name:'Laser projector',quantity:1,unit_price:1000,amount:1000}
      ]}
    ];
    const r=analyze({sources,candidates,legacyResult:{doc:{supplier_name:'Northstar AV Pte Ltd',invoice_number:'INV-1001',invoice_date:'2026-09-25',reference_number:'REF-7788'},items:[candidates[0].items[0]]}});
    if(r.headers.reference_number!=='REF-7788')failures.push('strict reference resolver');
    if(r.completeness.counts.equipment!==2)failures.push('equipment row accounting');
    if(r.completeness.counts.service!==1)failures.push('service row accounting');
    if(r.finalComparison.missingEquipment.length!==1)failures.push('missing equipment detection');
    const conflict=H.resolveHeaders(E.buildDocumentEvidence({sources:[
      {source:'a',text:'Ref. No.: REF-1001'},
      {source:'b',text:'Ref. No.: REF-1OOI'}
    ]}));
    if(conflict.reference_number!=='')failures.push('reference conflict must stay blank');
    return {ok:failures.length===0,failures};
  }
  global.InventoryHubParserV2=Object.freeze({version:'2.1-authoritative-verification',mode:'authoritative-verification',authoritative:true,analyze,selfTest});
})(typeof window!=='undefined'?window:globalThis);
