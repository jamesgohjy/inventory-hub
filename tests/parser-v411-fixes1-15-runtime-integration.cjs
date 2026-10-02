'use strict';
const fs=require('fs');
const path=require('path');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};

require('../modules/parser-v411-fixes1-5-shadow.js');
require('../modules/parser-v411-cell-ocr-bridge.js');
const Parser=globalThis.InventoryHubV411Fixes1to5Shadow;
const Cell=globalThis.InventoryHubV411CellOcrBridge;
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const runtime=fs.readFileSync(path.join(__dirname,'..','runtime-v7.03.3.14z.js'),'utf8');
const parserSrc=fs.readFileSync(path.join(__dirname,'..','modules/parser-v411-fixes1-5-shadow.js'),'utf8');
const cellSrc=fs.readFileSync(path.join(__dirname,'..','modules/parser-v411-cell-ocr-bridge.js'),'utf8');

assert(Parser.selfTest().ok,'fixes 1-15 parser self-test failed');
assert(Cell.selfTest().ok,'cell OCR bridge self-test failed');

// Loader must actually load the new modules before runtime.
assert(app.includes("modules/parser-v411-cell-ocr-bridge.js"),'cell OCR bridge is not loaded by app.js');
assert(app.includes("modules/parser-v411-fixes1-5-shadow.js"),'fixes 1-15 parser is not loaded by app.js');
assert(app.indexOf("modules/parser-v411-fixes1-5-shadow.js")<app.indexOf("runtime-v7.03.3.14z.js"),'fixes 1-15 loads after runtime');

// Extraction -> parser integration.
assert(runtime.includes('state.v411NumericCellOcrEvidence=[]'),'PDF extraction does not reset targeted cell evidence');
assert(runtime.includes('InventoryHubV411CellOcrBridge.extractPage'),'runtime does not invoke targeted cell OCR bridge');
assert(runtime.includes("ocrAllowed=modes.some"),'OCR-authorised scanned invoice pages cannot enter high-res recovery');
assert(runtime.includes('InventoryHubV411Fixes1to5Shadow'),'runtime does not reference certified fixes 1-15');
assert(runtime.includes('certified.run(sourceText'),'runtime does not invoke fixes 1-15 at Review boundary');
assert(runtime.includes('numericCellOcrEvidence:Array.isArray(state.v411NumericCellOcrEvidence)'), 'runtime does not pass targeted cell evidence to fixes 1-15');

// Review/save boundary must be fail-closed.
assert(runtime.includes('pendingV411='),'Review eligibility does not include fixes 1-15 gate');
assert(runtime.includes("Fixes 1-15 validation has not cleared this invoice. Save is blocked."),'Confirm & Save lacks fixes 1-15 defence-in-depth guard');

// Parser/extraction modules must never persist data.
assert(!/\.(?:insert|update|upsert|rpc)\s*\(/i.test(parserSrc),'fixes 1-15 parser contains persistence call');
assert(!/\.(?:insert|update|upsert|rpc)\s*\(/i.test(cellSrc),'cell OCR bridge contains persistence call');

// Existing production persistence remains one atomic RPC call downstream of Review.
const rpcCalls=(runtime.match(/this\.sb\.rpc\('confirm_and_save_invoice_v703314v'/g)||[]).length;
assert(rpcCalls===1,'expected exactly one production atomic Confirm & Save RPC call, found '+rpcCalls);

// OCR-tolerant invoice authority must accept a split heading.
let p=Parser.run([
  'TAX INVOIC E',
  '1 Projector Model: PT-VMZ71 1 100.00 100.00',
  'SUBTOTAL 100.00',
  'GST 9.00',
  'TOTAL 109.00'
].join('\n'),{transactionId:'integration-clean'});
assert(p.ready,'OCR-tolerant TAX INVOICE heading did not reach ready');
assert(p.rows.length===1&&p.rows[0].sku==='PT-VMZ71','clean integration invoice row mismatch');
assert(p.reviewGate?.allClear,'clean integration invoice did not clear Review gate');
assert(p.atomicSave?.canCommit,'clean integration invoice atomic plan is blocked');
assert(p.atomicSave.operations.length===1,'clean integration invoice atomic operation count mismatch');
assert(p.atomicSave.committedOperations===0,'shadow parser reported a committed operation');
assert(p.atomicSave.partialWriteAllowed===false,'partial writes are enabled');

// One bad row must block every requested write.
p=Parser.run([
  'TAX INVOICE',
  '1 Projector Model: PT-VMZ71 1 100.00 100.00',
  '2 Control Panel Model: AVS-320A 2 350.00 999.00',
  'SUBTOTAL 1099.00',
  'GST 98.91',
  'TOTAL 1197.91'
].join('\n'),{transactionId:'integration-bad'});
assert(!p.ready,'bad arithmetic invoice incorrectly marked ready');
assert(!p.atomicSave.canCommit,'bad arithmetic invoice atomic plan can commit');
assert(p.atomicSave.requestedOperations===2,'bad arithmetic requested operation count mismatch');
assert(p.atomicSave.operations.length===0,'partial atomic operations survived a blocked invoice');
assert(p.atomicSave.partialWriteAllowed===false,'partial-write flag changed on blocked invoice');

// Prohibited documents remain fail-closed.
p=Parser.run('PURCHASE ORDER\n1 Projector Model: PT-VMZ71 1 100.00 100.00',{transactionId:'integration-po'});
assert(!p.ready&&p.rows.length===0&&!p.atomicSave.canCommit,'purchase order was not rejected');

console.log(JSON.stringify({
  ok:true,
  parserVersion:Parser.VERSION,
  cellBridgeVersion:Cell.VERSION,
  atomicRpcCalls:rpcCalls,
  liveWrites:0,
  liveRpcInvocations:0
},null,2));
