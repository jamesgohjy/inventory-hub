const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const AV=require('../parser-v7-core.js');
globalThis.AVParserV7=AV;
const V=require('../v7033-core.js');
V.installParserPatch();
for(const path of [
  '../modules/parser-v2/evidence-model.js',
  '../modules/parser-v2/table-detector.js',
  '../modules/parser-v2/numbered-schedule.js',
  '../modules/parser-v2/verification-gate.js',
  '../modules/parser-v3/engine.js',
  '../modules/parser-v4-review-bridge.js',
  '../modules/parser-v4_1-shadow.js'
]) require(path);
const V2=globalThis.InventoryHubParserV2VerificationGate;
const V3=globalThis.InventoryHubParserV3;
const V4=globalThis.InventoryHubParserV4ReviewBridge;
const V41=globalThis.InventoryHubParserV41Shadow;
const near=(a,b)=>Math.abs(Number(a)-Number(b))<=0.01;
const serials=r=>String(r.serials||r.serial_numbers||'').split(',').map(x=>x.trim()).filter(Boolean);
const key=r=>String(r.sku||r.model||'').toUpperCase();
const sortRows=rows=>[...(rows||[])].sort((a,b)=>key(a).localeCompare(key(b))).map(r=>({
  sku:key(r),qty:Number(r.quantity),unit:r.unit_price==null?null:Number(r.unit_price),
  amount:r.amount==null?null:Number(r.amount),serials:serials(r),
  serialReview:!!r.serialReviewRequired
}));

const page1=`PAYMENT ADVICE
Customer Example School
Invoice Number INV PREPROD-STACKED
TAX INVOICE
Description Quantity Unit Price Tax Amount SGD
Attention: Accounts
Company: Example School
Address: Example Lane
575954
XVive U35C Wireless System for Condenser Microphones 5.8GHz
Warranty: 1 Year, Carry In to Service Centre
IN STOCK
S/N: U35SER001, U35SER002, U35SER003, U35SER004
4.00 340.00 9% 1,360.00
Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter with SM58 Cardioid Capsule (Freq: G66)
Warranty: 2 Years, Carry In to Service Centre
IN STOCK
S/N: SHURESER001, SHURESER002
1.00 480.00 9% 480.00
Gravity CART M 01 B Multifunctional Trolley (Medium)
IN STOCK
S/N: N/A
2.00 170.00 9% 340.00`;
const page2=`Signature & Company Stamp
Description Quantity Unit Price Tax Amount SGD
XVive AT-2 Portable Audio Tester
Warranty: 1 Year, Carry In to Service Centre
IN STOCK
Serial Number: AT2SER001
1.00 270.00 9% 270.00
Xvive Audio U3 2.4 GHz Digital Wireless Microphone System for Dynamic Microphones
Warranty: 1 Year, Carry In to Service Centre
IN STOCK
Serial No: U3SER001, U3SER002,
U3SER003, U3SER004
4.00 275.00 9% 1,100.00
DEL, Delivery Services with return Trip for Signed Delivery Order
Delivery only to loading bay/guardhouse.
1.00 50.00 9% 50.00
Subtotal 3,600.00
Invoice Total SGD 3,924.00`;
const page3=`PACKING/DELIVERY SLIP
Description Quantity
XVive U35C Wireless System for Condenser Microphones 5.8GHz
S/N: PACKING999999
4.00`;
const page4=`Description Quantity
NOTE: Supply and delivery only.`;

const layoutPage1=`TAX INVOICE
Description Quantity Unit Price Tax Amount SGD
Attention: Accounts
Company: Example School
Address: Example Lane
575954
XVive U35C Wireless System for Condenser
Microphones 5.8GHz
Warranty: 1 Year, Carry In to Service
4.00 340.00 9% 1,360.00
Centre
IN STOCK
S/N: U35SER001, U35SER002,
U35SER003, U35SER004
Shure SLXD2+ Digital Wireless Handheld
Microphone Transmitter with SM58 Cardioid
Capsule (Freq: G66)
1.00 480.00 9% 480.00
Warranty: 2 Years, Carry In to Service
Centre
IN STOCK
S/N: SHURESER001, SHURESER002
Gravity CART M 01 B Multifunctional Trolley
(Medium)
2.00 170.00 9% 340.00
IN STOCK
S/N: N/A`;
const layoutPage2=`Description Quantity Unit Price Tax Amount SGD
XVive AT-2 Portable Audio Tester
Warranty: 1 Year, Carry In to Service
1.00 270.00 9% 270.00
Centre
IN STOCK
Serial Number: AT2SER001
Xvive Audio U3 2.4 GHz Digital Wireless
Microphone System for Dynamic
Microphones
Warranty: 1 Year, Carry In to Service
4.00 275.00 9% 1,100.00
Centre
IN STOCK
Serial No: U3SER001, U3SER002,
U3SER003,
U3SER004
DEL, Delivery Services with return Trip for
Signed Delivery Order
Delivery only to loading bay/guardhouse.
1.00 50.00 9% 50.00
Subtotal 3,600.00
Invoice Total SGD 3,924.00`;

async function productionBoundary(pages){
  const authority=V.filterInvoicePages(pages,[]);
  const raw=authority.text;
  const evidence=pages.map((text,i)=>authority.decisions[i].allowed?{source:'preprod-page-'+(i+1),kind:'native',text,page:i+1,layout:[]}:null).filter(Boolean);
  // FAIRNESS: raw text only; no expected/prebuilt item rows.
  const rawRows=AV.parseText(raw,'preprod-native',1);
  const base={doc:{supplier_name:'Loud Technologies Asia Pte Ltd',invoice_number:'INV PREPROD-STACKED'},items:rawRows,invoiceClassification:{type:'equipment'},raw};
  const finalized=AV.enhanceParsed({parsed:base,raw,layout:[],evidenceSources:evidence});
  const v2=await V2.verifyParsed(finalized,{raw,inventoryItems:[],supplierName:base.doc.supplier_name,doc:finalized.doc||base.doc,webVerifier:null});
  const v3=await V3.evaluate(v2.parsed,{fullEvidence:evidence,inventoryItems:[],verifyGate:V2,webVerifier:null});
  const review=V4.materialize(v3.parsed,finalized.items||[]);
  // This is the critical production V4.1 boundary: normalize again, then integrity recovery.
  const normalized=V.applyParsedFixes(review,raw,evidence);
  const integrity=V41.recoverRows(normalized.items||[],{raw,sources:evidence,layout:[]});
  return {authority,raw,evidence,rawRows,finalized,v2,v3,review,normalized,integrity,items:integrity.outputRows||normalized.items||[]};
}

(async()=>{
  const run=await productionBoundary([page1,page2,page3,page4]);
  assert(run.authority.decisions.map(x=>!!x.allowed).join(',')==='true,true,false,false','Authority parity failed: '+JSON.stringify(run.authority.decisions));
  const expected=[
    ['AT-2',1,270,270,1,false],
    ['SLXD2+',1,480,480,2,true],
    ['U3',4,275,1100,4,false],
    ['U35C',4,340,1360,4,false]
  ];
  assert(run.items.length===4,'Production boundary expected 4 tracked rows, got '+run.items.length+' '+JSON.stringify(run.items));
  for(const [sku,qty,unit,amount,snCount,serialReview] of expected){
    const r=run.items.find(x=>key(x)===sku);
    assert(r,'Missing '+sku+' at production boundary: '+JSON.stringify(sortRows(run.items)));
    assert(Number(r.quantity)===qty,sku+' qty mismatch');
    assert(near(r.unit_price,unit)&&near(r.amount,amount),sku+' economics mismatch');
    assert(serials(r).length===snCount,sku+' serial count mismatch '+serials(r).length);
    assert(!!r.serialReviewRequired===serialReview,sku+' serial review mismatch');
  }
  assert(!run.items.some(r=>/delivery services/i.test(String(r.item_name||r.description||''))),'Delivery service leaked');
  assert(!run.items.some(r=>/trolley/i.test(String(r.item_name||r.description||''))),'Trolley accessory leaked');
  assert(!run.items.some(r=>serials(r).includes('PACKING999999')),'Packing-slip serial leaked');
  assert(run.integrity.randomCharacterFailureCount===0,'Contamination hard failure '+JSON.stringify(run.integrity.hardFailures));

  // Real PDF text layers can place Qty/Price/Amount between a wrapped Warranty line and
  // its continuation/stock/serial lines. The same invoice must remain semantically identical.
  const layoutRun=await productionBoundary([layoutPage1,layoutPage2,page3,page4]);
  assert(layoutRun.authority.decisions.map(x=>!!x.allowed).join(',')==='true,true,false,false',
    'Interleaved layout authority failed: '+JSON.stringify(layoutRun.authority.decisions));
  assert(JSON.stringify(sortRows(layoutRun.items))===JSON.stringify(sortRows(run.items)),
    'Interleaved economics layout changed accepted rows: '+JSON.stringify(sortRows(layoutRun.items)));
  assert(layoutRun.integrity.randomCharacterFailureCount===0,
    'Interleaved layout contamination hard failure '+JSON.stringify(layoutRun.integrity.hardFailures));

  // Idempotence: the production boundary may normalize more than once during Review edits.
  const normalized2=V.applyParsedFixes({...run.review,items:run.items},run.raw,run.evidence);
  const integrity2=V41.recoverRows(normalized2.items||[],{raw:run.raw,sources:run.evidence,layout:[]});
  assert(JSON.stringify(sortRows(integrity2.outputRows))===JSON.stringify(sortRows(run.items)),
    'Second normalization changed accepted rows: '+JSON.stringify(sortRows(integrity2.outputRows)));

  // Negative: a normal inline priced row must not be duplicated by stacked recovery.
  const inline='TAX INVOICE\nDescription Quantity Unit Price Amount\nAVS-320 Projector Controller 2 350.00 700.00\nSubtotal 700.00';
  assert(V.v703315RecoverDescriptionFirstStackedRows(inline,[]).length===0,'Inline row was incorrectly treated as stacked');

  // Negative: arithmetic mismatch must fail closed.
  const badMoney='TAX INVOICE\nDescription Quantity Unit Price Amount\nBrand AT-2 Portable Audio Tester\n1 270.00 999.00\nSubtotal 999.00';
  assert(V.v703315RecoverDescriptionFirstStackedRows(badMoney,[]).length===0,'Arithmetic mismatch was recovered');

  // Negative: non-invoice authority must not create rows when filtered first.
  const nonInvoice=['PURCHASE ORDER\nDescription Quantity Unit Price Amount\nBrand AT-2 Portable Audio Tester\n1 270.00 270.00'];
  const rejected=V.filterInvoicePages(nonInvoice,[]);
  assert(rejected.text.trim()===''&&rejected.decisions[0].allowed===false,'PO authority was accepted');

  // Negative: service-only stacked row can be detected by recovery but must be filtered as service.
  const service='TAX INVOICE\nDescription Quantity Unit Price Amount\nDEL, Delivery Services with return Trip\n1 50.00 50.00\nSubtotal 50.00';
  const serviceRows=V.v703315RecoverDescriptionFirstStackedRows(service,[]);
  assert(serviceRows.length===1&&V.v703312jIsServiceRow(serviceRows[0])===true,'Service row classification failed');

  // Model token formats required by early row-local identity.
  for(const [line,model] of [
    ['XVive AT-2 Portable Audio Tester','AT-2'],
    ['Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter','SLXD2+'],
    ['XVive U35C Wireless System','U35C'],
    ['Xvive Audio U3 Wireless Microphone System','U3']
  ]) assert(V.modelTokens(line).includes(model),'Model token '+model+' not recognized from '+line);
  const hilongTokens=V.modelTokens('HIKVISION NVR 4CH POE DS-7604NI-Q1 4P(D)');
  assert(hilongTokens.includes('DS-7604NI-Q1'),'Legacy HI-LONG model DS-7604NI-Q1 was lost');
  assert(!hilongTokens.includes('4CH')&&!hilongTokens.includes('4P'),'Specification/count tokens were promoted as models: '+JSON.stringify(hilongTokens));
  assert(!V.modelTokens('Speaker JBL 218S').includes('218S'),'Numeric-leading Studio Craft token 218S must not be newly promoted as SKU');

  console.log('PREPROD FAIRNESS: raw text only, zero prebuilt expected rows PASS');
  console.log('PREPROD PRODUCTION BOUNDARY: finalize -> V2 -> V3 -> V4 -> normalize -> V4.1 PASS');
  console.log('PREPROD AUTHORITY: invoice pages 2/2 accepted; non-invoice pages 0/2 accepted PASS');
  console.log('PREPROD TRACKED ITEMS: U35C, SLXD2+, AT-2, U3 4/4 PASS');
  console.log('PREPROD ECONOMICS: 4/4 PASS');
  console.log('PREPROD SERIALS: U35C 4/4, SLXD2+ 2/1 review, AT-2 1/1, U3 4/4 PASS');
  console.log('PREPROD FILTERS: trolley accessory + delivery service excluded PASS');
  console.log('PREPROD IDEMPOTENCE: repeated Review-boundary normalization stable PASS');
  console.log('PREPROD INTERLEAVED LAYOUT: economics between warranty/serial lines PASS');
  console.log('PREPROD NEGATIVES: inline/no-duplicate, arithmetic fail-closed, PO authority, service-only, legacy model-scope guards PASS');
  console.log('PREPROD CONTAMINATION: 0 hard failures');
  console.log('STACKED ROW PRE-PRODUCTION PARITY: PASS');
})().catch(err=>{console.error(err.stack||err);process.exit(1);});
