const fs=require('fs');
require('../modules/parser-v4_1-shadow.js');
const V41=globalThis.InventoryHubParserV41Shadow;
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};

const app=fs.readFileSync(require('path').join(__dirname,'..','app.js'),'utf8');
const runtime=fs.readFileSync(require('path').join(__dirname,'..','runtime-v7.03.3.14z.js'),'utf8');
const index=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');

assert(app.includes("loadScript('modules/parser-v4_1-shadow.js?v='+key,'InventoryHubParserV41Shadow')"),
  'production loader does not load V4.1');
assert(app.includes('Parser V4.1 evidence-integrity startup gate failed'),
  'V4.1 startup self-test gate missing');
assert(runtime.includes('function applyParserV41ProductionIntegrity14z'),
  'production V4.1 integrity wrapper missing');
assert(runtime.includes('state.parsed=applyParserV41ProductionIntegrity14z(state.parsed,state.parsed.raw||state.parsed.rawText||text);applyParsedReviewToForm();'),
  'V4.1 is not enforced between V3 countercheck and Review');
assert(app.includes("ASSET_REV='v703315-release-r1'"),'v7.03.3.15 diagnostic-parity asset revision missing');
assert(index.includes('app.js?v=7.03.3.15-r1'),
  'v7.03.3.15 browser cache-bust version was not advanced');

const self=V41.selfTest();
assert(self?.ok,'V4.1 self-test failed: '+JSON.stringify(self?.failures||[]));

const raw='TAX INVOICE\nAVS-320 Projector controller 2 350.00 700.00';
const result=V41.recoverRows([{
  sku:'R4ND0M9X',
  model:'AVS-320',
  item_name:'Projector controller',
  description:'Projector controller',
  quantity:2,
  unit_price:350,
  amount:700,
  provenance:{rawText:'AVS-320 Projector controller 2 350.00 700.00'}
}],{raw});
assert(result.randomCharacterFailureCount===0,'hard contamination survived production recovery');
assert(result.outputRows[0].sku==='AVS-320','valid row-local model did not replace contaminated SKU');

console.log('PHASE4 V4.1 PRODUCTION LOADER: PASS');
console.log('PHASE4 V4.1 REVIEW BOUNDARY: PASS');
console.log('PHASE4 V4.1 SELF TEST: PASS');
console.log('PHASE4 V4.1 FAIL-CLOSED ENFORCEMENT: PASS');
console.log('PHASE4 V4.1 PRODUCTION INTEGRATION SUMMARY: PASS');
