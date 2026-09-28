const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const AV=require('../parser-v7-core.js');
globalThis.AVParserV7=AV;
const V=require('../v7033-core.js');
assert(V.installParserPatch()===true||AV.__v7033Installed===true,'Unable to install V4 production patch');
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

const page1=`TAX INVOICE
Invoice Number INV TEST-STACKED
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

const page2=`Description Quantity Unit Price Tax Amount SGD
XVive AT-2 Portable Audio Tester
Warranty: 1 Year, Carry In to Service Centre
IN STOCK
S/N: AT2SER001
1.00 270.00 9% 270.00
Xvive Audio U3 2.4 GHz Digital Wireless Microphone System for Dynamic Microphones
Warranty: 1 Year, Carry In to Service Centre
IN STOCK
S/N: U3SER001, U3SER002, U3SER003, U3SER004
4.00 275.00 9% 1,100.00
DEL, Delivery Services with return Trip for Signed Delivery Order
Delivery only to loading bay/guardhouse.
1.00 50.00 9% 50.00
Subtotal 3,600.00
Invoice Total SGD 3,924.00`;

const page3=`PACKING/DELIVERY SLIP
Description Quantity
XVive U35C Wireless System for Condenser Microphones 5.8GHz
S/N: PACKING-SLIP-SHOULD-NOT-BIND
4.00`;

const page4=`Description Quantity
NOTE: Supply and delivery only.`;

const pages=[page1,page2,page3,page4];
const authority=V.filterInvoicePages(pages,[]);
assert(authority.decisions[0].allowed===true&&authority.decisions[1].allowed===true,'Invoice pages 1-2 must be accepted');
assert(authority.decisions[2].allowed===false&&authority.decisions[3].allowed===false,'Packing slip pages 3-4 must be rejected');

const raw=authority.text;
const evidence=pages.map((text,i)=>authority.decisions[i].allowed?{source:'stacked-page-'+(i+1),kind:'native',text,page:i+1,layout:[]}:null).filter(Boolean);

// FAIRNESS CONTRACT: only raw invoice text enters the parser. No prebuilt item rows.
const rawRows=AV.parseText(raw,'stacked-shadow-native',1);
const base={doc:{supplier_name:'Loud Technologies Asia Pte. Ltd.',invoice_number:'INV TEST-STACKED'},items:rawRows,invoiceClassification:{type:'equipment'},raw};
const enhanced=AV.enhanceParsed({parsed:base,raw,layout:[],evidenceSources:evidence});

const bySku=(rows,sku)=>rows.find(r=>String(r.sku||r.model||'').toUpperCase()===sku.toUpperCase());
const near=(a,b)=>Math.abs(Number(a)-Number(b))<=0.01;
const serials=r=>String(r.serials||r.serial_numbers||'').split(',').map(x=>x.trim()).filter(Boolean);

const expected=[
  ['U35C',4,340,1360,4],
  ['SLXD2+',1,480,480,2],
  ['AT-2',1,270,270,1],
  ['U3',4,275,1100,4]
];
assert(enhanced.items.length===4,'Expected four tracked equipment rows before V2, got '+enhanced.items.length+' '+JSON.stringify(enhanced.items));
for(const [sku,qty,unit,amount,serialCount] of expected){
  const r=bySku(enhanced.items,sku);assert(r,'Missing '+sku+' after stacked recovery: '+JSON.stringify(enhanced.items));
  assert(Number(r.quantity)===qty,sku+' qty mismatch '+r.quantity);
  assert(near(r.unit_price,unit)&&near(r.amount,amount),sku+' economics mismatch '+r.unit_price+'/'+r.amount);
  assert(serials(r).length===serialCount,sku+' serial count mismatch '+serials(r).length);
}
assert(bySku(enhanced.items,'SLXD2+').serialReviewRequired===true,'SLXD2+ Qty 1 with two serials must remain review flagged');
assert(!enhanced.items.some(r=>/delivery services/i.test(String(r.item_name||r.description||''))),'Delivery service leaked into tracked rows');
assert(!enhanced.items.some(r=>/trolley/i.test(String(r.item_name||r.description||''))),'Current trolley accessory policy was bypassed');
assert(!enhanced.items.some(r=>/PACKING-SLIP/i.test(String(r.serials||''))),'Packing slip serial leaked across authority boundary');

(async()=>{
  const v2=await V2.verifyParsed(enhanced,{raw,inventoryItems:[],supplierName:'Loud Technologies Asia Pte. Ltd.',doc:enhanced.doc||base.doc,webVerifier:null});
  assert((v2.parsed?.v2Verification?.rejected||[]).length===0,'V2 rejected recovered equipment: '+JSON.stringify(v2.parsed?.v2Verification?.rejected||[]));
  const v3=await V3.evaluate(v2.parsed,{fullEvidence:evidence,inventoryItems:[],verifyGate:V2,webVerifier:null});
  const review=V4.materialize(v3.parsed,enhanced.items||[]);
  assert(review.items.length===4,'Review expected four tracked rows, got '+review.items.length+' '+JSON.stringify(review.items));
  for(const [sku] of expected)assert(bySku(review.items,sku),'Review missing '+sku);
  const final=V41.recoverRows(review.items,{raw,sources:evidence});
  assert(final.randomCharacterFailureCount===0,'V4.1 contamination hard failure: '+JSON.stringify(final.hardFailures));
  assert(final.outputRows.length===4,'V4.1 final expected four rows, got '+final.outputRows.length);
  console.log('STACKED ROW FAIRNESS: raw invoice text only; no prebuilt/post-extraction rows');
  console.log('STACKED ROW AUTHORITY: invoice pages 2/2 accepted; packing-slip pages 0/2 accepted');
  console.log('STACKED ROW IDENTITIES: U35C, SLXD2+, AT-2, U3 PASS');
  console.log('STACKED ROW ECONOMICS: 4/4 PASS');
  console.log('STACKED ROW SERIAL BINDING: U35C 4/4, SLXD2+ 2/1 review, AT-2 1/1, U3 4/4 PASS');
  console.log('STACKED ROW FILTERS: trolley accessory excluded; delivery service excluded');
  console.log('STACKED ROW CONTAMINATION: 0 hard failures');
  console.log('STACKED ROW + EARLY ROW-LOCAL IDENTITY SHADOW: PASS');
})().catch(err=>{console.error(err.stack||err);process.exit(1);});
