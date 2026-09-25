// Inventory Hub Parser V2 — independent geometry-first shadow engine
(function(global){
  'use strict';
  const E=global.InventoryHubParserV2Evidence,H=global.InventoryHubParserV2Header,T=global.InventoryHubParserV2TableDetector,B=global.InventoryHubParserV2RowBuilder,R=global.InventoryHubParserV2Rows;

  function analyze({sources=[],raw='',layout=[],candidates=[],legacyResult=null}={}){
    if(!E||!H||!T||!B||!R)throw new Error('Parser V2 dependencies are not loaded.');
    const evidence=E.buildDocumentEvidence({sources,raw,layout});
    const headers=H.resolveHeaders(evidence);

    // Independent V2 path: geometry -> table -> physical row -> accounting.
    const tables=T.detectTables(evidence);
    const physical=B.buildRows(evidence,tables);
    const physicalCandidates=physical.tables.map(t=>({origin:'v2-physical:'+t.id,items:t.rows}));
    const rowLedger=R.buildLedger(physicalCandidates);
    const completeness=R.summarize(rowLedger);

    // Legacy candidates are retained only for diagnostic comparison and are never used to make V2 complete.
    const legacyCandidateLedger=R.buildLedger(candidates);
    const legacyCandidateSummary=R.summarize(legacyCandidateLedger);
    const finalItems=legacyResult?.items||[];
    const finalComparison=R.compareFinalItems(rowLedger,finalItems);

    const legacyDoc=legacyResult?.doc||{},headerDiff={};
    for(const field of ['supplier_name','invoice_number','invoice_date','reference_number']){
      const legacy=String(legacyDoc[field]??'').trim(),v2=String(headers[field]??'').trim();
      headerDiff[field]={legacy,v2,same:legacy===v2,legacyMissing:!legacy,v2Missing:!v2};
    }

    const issues=[];
    if(!tables.length)issues.push({code:'no-independent-table-evidence'});
    if(tables.length&&!physical.rowCount)issues.push({code:'table-detected-no-physical-rows'});
    if(!completeness.complete)issues.push({code:'unaccounted-source-rows',count:completeness.unexplainedRows});
    if(tables.length&&!finalComparison.complete)issues.push({code:'legacy-final-items-incomplete',missingEquipment:finalComparison.missingEquipment.map(x=>({key:x.key,row:x.row,evidenceOrigins:x.evidenceOrigins}))});
    if(!headers.supplier_name)issues.push({code:'supplier-not-proven'});
    if(!headers.invoice_number)issues.push({code:'invoice-number-not-proven'});
    if(!headers.invoice_date)issues.push({code:'invoice-date-not-proven'});

    return Object.freeze({
      version:'2.1-shadow',
      mode:'shadow-independent-table',
      headers,
      tables,
      physicalRows:physical.rows,
      rowLedger,
      completeness,
      finalComparison,
      headerDiff,
      legacyCandidateSummary,
      issues,
      independentTableEvidence:tables.length>0,
      safeToPromote:tables.length>0&&issues.length===0
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
    const conflict=H.resolveHeaders(E.buildDocumentEvidence({sources:[
      {source:'a',text:'Ref. No.: REF-1001'},
      {source:'b',text:'Ref. No.: REF-1OOI'}
    ]}));
    if(conflict.reference_number!=='')failures.push('reference conflict must stay blank');
    return {ok:failures.length===0,failures};
  }

  global.InventoryHubParserV2=Object.freeze({version:'2.1-shadow',analyze,selfTest});
})(typeof window!=='undefined'?window:globalThis);
