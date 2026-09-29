const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const fs=require('fs');
const path=require('path');
const AV=require('../parser-v7-core.js');
globalThis.AVParserV7=AV;
const V=require('../v7033-core.js');
V.installParserPatch();
for(const p of [
  '../modules/parser-v2/evidence-model.js',
  '../modules/parser-v2/table-detector.js',
  '../modules/parser-v2/numbered-schedule.js',
  '../modules/parser-v2/verification-gate.js',
  '../modules/parser-v3/engine.js',
  '../modules/parser-v4-review-bridge.js',
  '../modules/parser-v4_1-shadow.js'
]) require(p);
const V2=globalThis.InventoryHubParserV2VerificationGate;
const V3=globalThis.InventoryHubParserV3;
const V4=globalThis.InventoryHubParserV4ReviewBridge;
const V41=globalThis.InventoryHubParserV41Shadow;
const runtime=fs.readFileSync(path.join(__dirname,'..','runtime-v7.03.3.14z.js'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const key=r=>String(r.sku||r.model||'').trim().toUpperCase();
const serials=r=>Array.isArray(r.serials)?r.serials:String(r.serials||r.serial_numbers||'').split(',').map(x=>x.trim()).filter(Boolean);
const near=(a,b)=>Math.abs(Number(a)-Number(b))<=.01;

// Final shadow gate must never call production persistence. This test only imports pure parser modules.
// It also proves the live runtime keeps persistence downstream of Review/Confirm rather than inside V4.1.
assert(!/InventoryHubParserV41Shadow[\s\S]{0,240}\.(insert|update|upsert|rpc)\s*\(/i.test(runtime),'V4.1 runtime boundary contains a persistence call');
assert(!/parser-v4_1-shadow[\s\S]{0,240}\.(insert|update|upsert|rpc)\s*\(/i.test(app),'V4.1 loader contains a persistence call');

const pages=[
`TAX INVOICE
Invoice No LIVE-SHADOW-001
Description Quantity Unit Price Amount
XVive U35C Wireless System for Condenser Microphones 5.8GHz
S/N: U35LIVE001, U35LIVE002, U35LIVE003, U35LIVE004
4.00 340.00 1,360.00
Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter
Serial No: SHLIVE001, SHLIVE002
1.00 480.00 480.00
Gravity CART M 01 B Multifunctional Trolley
2.00 170.00 340.00`,
`TAX INVOICE
Description Quantity Unit Price Amount
XVive AT-2 Portable Audio Tester
Serial Number: ATLIVE001
1.00 270.00 270.00
Xvive Audio U3 2.4 GHz Digital Wireless Microphone System
S/N: U3LIVE001, U3LIVE002, U3LIVE003, U3LIVE004
4.00 275.00 1,100.00
DEL, Delivery Services with return Trip
1.00 50.00 50.00`,
`DELIVERY ORDER
XVive U35C Wireless System
S/N: LEAK999999
4.00`,
`PURCHASE ORDER
XVive AT-2 Portable Audio Tester
1.00 270.00 270.00`
];

async function liveBoundary(inputPages){
 const authority=V.filterInvoicePages(inputPages,[]);
 const raw=authority.text;
 const evidence=inputPages.map((text,i)=>authority.decisions[i].allowed?{source:'final-live-shadow-page-'+(i+1),kind:'native',text,page:i+1,layout:[]}:null).filter(Boolean);
 const rawRows=AV.parseText(raw,'final-live-shadow-native',1);
 const base={doc:{supplier_name:'Shadow AV Supplier',invoice_number:'LIVE-SHADOW-001'},items:rawRows,invoiceClassification:{type:'equipment'},raw};
 const finalized=AV.enhanceParsed({parsed:base,raw,layout:[],evidenceSources:evidence});
 const v2=await V2.verifyParsed(finalized,{raw,inventoryItems:[],supplierName:base.doc.supplier_name,doc:finalized.doc||base.doc,webVerifier:null});
 const v3=await V3.evaluate(v2.parsed,{fullEvidence:evidence,inventoryItems:[],verifyGate:V2,webVerifier:null});
 const review=V4.materialize(v3.parsed,finalized.items||[]);
 const normalized=V.applyParsedFixes(review,raw,evidence);
 const integrity=V41.recoverRows(normalized.items||[],{raw,sources:evidence,layout:[]});
 return {authority,raw,evidence,review,normalized,integrity,items:integrity.outputRows||[]};
}

(async()=>{
 const run=await liveBoundary(pages);
 assert(run.authority.decisions.map(x=>!!x.allowed).join(',')==='true,true,false,false','authority mismatch '+JSON.stringify(run.authority.decisions));
 assert(run.items.length===4,'expected 4 tracked equipment rows, got '+run.items.length+' '+JSON.stringify(run.items));
 const expected=[['U35C',4,340,1360,4],['SLXD2+',1,480,480,2],['AT-2',1,270,270,1],['U3',4,275,1100,4]];
 for(const [sku,q,p,a,sn] of expected){
   const r=run.items.find(x=>key(x)===sku);
   assert(r,'missing '+sku+' '+JSON.stringify(run.items.map(x=>({sku:x.sku,item:x.item_name}))));
   assert(Number(r.quantity)===q,sku+' qty mismatch');
   assert(near(r.unit_price,p)&&near(r.amount,a),sku+' economics mismatch');
   assert(serials(r).length===sn,sku+' serial mismatch '+JSON.stringify(serials(r)));
 }
 assert(!run.items.some(r=>/trolley/i.test(String(r.item_name||r.description||''))),'accessory leaked');
 assert(!run.items.some(r=>/delivery services/i.test(String(r.item_name||r.description||''))),'service leaked');
 assert(!run.items.some(r=>serials(r).includes('LEAK999999')),'delivery-order serial leaked');
 assert(run.integrity.randomCharacterFailureCount===0,'hard contamination survived');

 // Inject plausible-looking contamination at the exact Review -> V4.1 boundary.
 const contaminated=run.normalized.items.map((r,i)=>i===0?{...r,sku:'R4ND0M9X',provenance:{...(r.provenance||{}),rawText:String(r.sku||r.model||'')+' '+String(r.item_name||r.description||'')}}:r);
 const repaired=V41.recoverRows(contaminated,{raw:run.raw,sources:run.evidence,layout:[]});
 assert(repaired.randomCharacterFailureCount===0,'contamination hard failure remained');
 assert(!repaired.outputRows.some(r=>String(r.sku||'')==='R4ND0M9X'),'contaminated identifier survived');

 // Idempotence at live Review boundary.
 const normalized2=V.applyParsedFixes({...run.review,items:run.items},run.raw,run.evidence);
 const integrity2=V41.recoverRows(normalized2.items||[],{raw:run.raw,sources:run.evidence,layout:[]});
 const compact=rows=>rows.map(r=>({sku:key(r),q:Number(r.quantity),p:r.unit_price==null?null:Number(r.unit_price),a:r.amount==null?null:Number(r.amount),s:serials(r)})).sort((a,b)=>a.sku.localeCompare(b.sku));
 assert(JSON.stringify(compact(integrity2.outputRows))===JSON.stringify(compact(run.items)),'second live normalization changed output');

 console.log('FINAL LIVE SHADOW WRITE ISOLATION: PASS parser-only execution; production persistence not invoked');
 console.log('FINAL LIVE SHADOW BOUNDARY: finalize -> V2 -> V3 -> V4 -> normalize -> V4.1 PASS');
 console.log('FINAL LIVE SHADOW AUTHORITY: invoice 2/2 accepted; DO/PO 0/2 accepted PASS');
 console.log('FINAL LIVE SHADOW TRACKED EQUIPMENT: U35C, SLXD2+, AT-2, U3 4/4 PASS');
 console.log('FINAL LIVE SHADOW ECONOMICS: 4/4 PASS');
 console.log('FINAL LIVE SHADOW SERIALS: 11/11 invoice-authority serials PASS; non-invoice leakage=0');
 console.log('FINAL LIVE SHADOW FILTERS: accessory/service leakage=0 PASS');
 console.log('FINAL LIVE SHADOW CONTAMINATION: injected bad identifier removed; hard failures=0 PASS');
 console.log('FINAL LIVE SHADOW IDEMPOTENCE: PASS');
 console.log('FINAL LIVE-PRODUCTION-PARITY SHADOW SUMMARY: PASS');
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
