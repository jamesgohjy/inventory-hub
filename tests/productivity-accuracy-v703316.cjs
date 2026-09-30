const fs=require('fs');
const path=require('path');
const P=require('../modules/productivity-accuracy-v703316.js');
require('../modules/canonical-parser.js');
const Canonical=globalThis.InventoryHubCanonicalParser;
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};

const self=P.selfTest();
assert(self.ok,'productivity module self-test failed: '+(self.failures||[]).join(', '));

const rows=[{id:'1',sku:'A-100',item_name:'Projector'},{id:'2',sku:'B-200',item_name:'Projector'}];
assert(P.safeMasterMatch({item_name:'Projector'},rows).action==='create','name-only match must not auto-merge');
assert(P.safeMasterMatch({sku:'A100',item_name:'Projector'},rows).item?.id==='1','normalized exact SKU must merge');

const parsed={doc:{supplier_name:'ACME Pte Ltd',invoice_number:'INV-1',invoice_date:'2026-09-30'},items:[{sku:'A-100',item_name:'Projector',quantity:2,unit_price:100,amount:200}]};
const sources=[
  {source:'native-invoice-pages',kind:'native',text:'TAX INVOICE ACME Pte Ltd INV-1 2026-09-30 A-100 Projector 2 100 200'},
  {source:'ocr-invoice-auto',kind:'ocr',text:'TAX INVOICE ACME Pte Ltd INV-1 2026-09-30 A-100 Projector 2 100 200'}
];
const enhanced=P.applyDualExtractionConsensus(parsed,sources);
assert(enhanced.extractionConsensus.dual_path_available===true,'dual extraction consensus unavailable');
assert(enhanced.evidenceLedger.rows.length===1,'evidence ledger row missing');
assert(enhanced.evidenceLedger.rows[0].arithmetic.passed===true,'row arithmetic evidence missing');

const integrityParsed={doc:{supplier_name:'ACME Pte Ltd',invoice_number:'INV-2',invoice_date:'2026-09-30'},items:[{sku:'',item_name:'Wireless Microphone System',description:'Wireless Microphone System',quantity:1,unit_price:480,amount:480,serials:'SN-1',v41ShadowReviewRequired:true,v41ProductionReviewRequired:true,v41IntegrityIssues:[{field:'sku',code:'implausible-identifier-role',reason:'unresolved weak OCR identifier'}]}]};
const integritySources=[{source:'native',kind:'native',text:'ACME Pte Ltd INV-2 2026-09-30 Wireless Microphone System 1 480 480 SN-1'}];
const integrityEnhanced=P.applyDualExtractionConsensus(integrityParsed,integritySources);
assert(integrityEnhanced.evidenceLedger.rows[0].status==='review','V4.1 integrity issue escaped Evidence Ledger review state');
assert(integrityEnhanced.evidenceLedger.requires_review===true,'Evidence Ledger did not require review for V4.1 issue');

const canonicalIntegrity=Canonical.fromPipeline(integrityParsed,{raw:integritySources[0].text});
assert(canonicalIntegrity.status==='review','canonical parser did not propagate V4.1 review state');
const blocked=Canonical.prepareSave(canonicalIntegrity,{humanReviewed:false});
assert(blocked.ok===false&&blocked.status==='review','canonical save did not fail closed on unresolved V4.1 integrity issue');

const runtime=fs.readFileSync(path.join(__dirname,'..','runtime-v7.03.3.16.js'),'utf8');
assert(runtime.includes('v703316EnhanceParsed'),'runtime does not attach v7.03.3.16 evidence ledger');
assert(runtime.includes('v703316ScheduleDraftSave'),'runtime draft autosave integration missing');
assert(runtime.includes('safeMasterMatch(line,d.items)'),'unsafe local name-only merge was not replaced');
assert(runtime.includes('v703316ApplyDiagnosticVisibility'),'normal-user parser diagnostic visibility gate missing');

const manifest=fs.readFileSync(path.join(__dirname,'..','release-manifest.js'),'utf8');
assert(manifest.includes("appVersion:'7.03.3.16'"),'release manifest version mismatch');
assert(manifest.includes("runtimeFile:'runtime-v7.03.3.16.js'"),'release manifest runtime mismatch');

console.log('V7.03.3.16 PRODUCTIVITY + ACCURACY: PASS');
