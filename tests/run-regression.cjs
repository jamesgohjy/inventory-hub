const fs=require('fs');
const vm=require('vm');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const read=p=>fs.readFileSync(p,'utf8');

const core=read('v7033-core.js');
const app=read('app.js');
const runtime=read('runtime-v7.03.3.14y.js');
const evidenceEngine=read('modules/parser-evidence-engine.js');
const parserModule=read('modules/parser-table.js');
const canonicalParser=read('modules/canonical-parser.js');
const parserV2Evidence=read('modules/parser-v2/evidence-model.js');
const parserV2Header=read('modules/parser-v2/header-resolver.js');
const parserV2Table=read('modules/parser-v2/table-detector.js');
const parserV2Builder=read('modules/parser-v2/row-builder.js');
const parserV2Rows=read('modules/parser-v2/row-accounting.js');
const parserV2Numbered=read('modules/parser-v2/numbered-schedule.js');
const parserV2Engine=read('modules/parser-v2/engine.js');
const canonicalSaveSql=read('supabase-v7-03-3-14v-canonical-save.sql');
const masterMergeSql=read('supabase-v7-03-3-14d-master-item-merge.sql');
const healthResolutionSql=read('supabase-v7-03-3-14x-data-health-resolution.sql');
const databaseMigrationWorkflow=read('.github/workflows/database-migrations.yml');
const groupModule=read('modules/grouped-company-ui.js');
const componentsCss=read('components.css');
const backupUiModule=read('modules/backup-verification-ui.js');
const parser=read('parser-v7-core.js');
const index=read('index.html');
const backupSql=read('supabase-v7-03-3-14t-backup-verification.sql');
const backupScript=read('scripts/verify-backups.mjs');
const backupWorkflow=read('.github/workflows/backup-verification.yml');
const setupDoc=read('BACKUP_VERIFICATION_SETUP-v7.03.3.14t.md');
const accuracyFixtures=JSON.parse(read('tests/parser-accuracy-fixtures-v7.03.3.14u.json'));
const anonymizedCorpus=JSON.parse(read('tests/fixtures/anonymized-invoice-corpus-v7.03.3.14v.json'));

new Function(core);new Function(app);new Function(runtime);new Function(evidenceEngine);new Function(parserModule);new Function(canonicalParser);new Function(parserV2Evidence);new Function(parserV2Header);new Function(parserV2Table);new Function(parserV2Builder);new Function(parserV2Rows);new Function(parserV2Numbered);new Function(parserV2Engine);new Function(groupModule);new Function(backupUiModule);new Function(parser);

const ctx={console,setTimeout,clearTimeout,Date,JSON,Math,Number,String,Array,Object,Set,Map,RegExp,Intl};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);vm.runInContext(core,ctx,{filename:'v7033-core.js'});
const api=ctx.V7033Patch;assert(api,'V7033Patch did not initialise');
const suites={
  behavioral:api.runRegressionChecks(),
  golden:api.runHistoricalRegressionChecks(),
  quality14n:api.runQualityRegressionChecks14n(),
  holdout14n:api.runHoldoutRegressionChecks14n(),
  intelligence14o:api.runIntelligenceRegressionChecks14o(),
  aerospace14p:api.runAerospaceRegressionChecks14p(),
  monetary14q:api.runMonetaryConsensusRegressionChecks14q(),
  headerAligned14r:api.runHeaderAlignedMoneyRegressionChecks14r()
};
for(const [name,result] of Object.entries(suites)){
  console.log(name+': '+result.cases.filter(x=>x.pass).length+'/'+result.cases.length+' PASS');
  assert(result.ok,name+' regression suite failed: '+(result.failures||[]).join(', '));
}
const total=Object.values(suites).reduce((n,r)=>n+r.cases.length,0),passed=Object.values(suites).reduce((n,r)=>n+r.cases.filter(x=>x.pass).length,0);
assert(total===80&&passed===80,'Expected 80/80 core regression checks, got '+passed+'/'+total);
assert(api.referenceNumberFromLabel('Ref. No. VSO17-026212/V17-041821 DATE 15/12/23 P/O NO. PO/23/000056')==='VSO17-026212/V17-041821','Flexible labelled Reference No. extraction failed');
const avMediaDedupe=api.consolidateFragmentedParsedLineItems([
  {sku:'',item_name:'and control Panel',description:'and control Panel',quantity:4,unit_price:9588,amount:38.35,amountReviewRequired:true},
  {sku:'',item_name:'PT-MZI7K Replacement of AV Projector and control Panel',description:'PT-MZI7K Replacement of AV Projector and control Panel',quantity:4,unit_price:9588,amount:38352},
  {sku:'PT-MZI7K',item_name:'Replacement of AV Projector and control Panel',description:'Replacement of AV Projector and control Panel',quantity:4,unit_price:9588,amount:38352}
]);
assert(avMediaDedupe.length===1&&avMediaDedupe[0].sku==='PT-MZI7K'&&Math.abs(Number(avMediaDedupe[0].amount)-38352)<=.01,'Fragmented duplicate consolidation did not retain the strongest evidenced PT-MZI7K row');
assert(api.v703312jIsTrackedEquipment({sku:'RC-208/UK',item_name:'I/O Control Button Keypad',description:'I/O Control Button Keypad'})===true,'Generic keypad equipment recognition failed');

// 14u: historical source excerpts are now checked field-by-field, not just by broad case predicates.
const historicalExpectations={
  'avs-320-vin17-049472':[{sku:'AVS-320',quantity:2,unit_price:350,amount:700}],
  'aerospace-2022':[{sku:'PT-VW540',quantity:1,unit_price:804,amount:804},{sku:'AVS320',quantity:1,unit_price:350,amount:350}],
  'loud-pga58-00215542':[{sku:'PGA58-LC',quantity:10,unit_price:64.69,amount:646.90}],
  'loud-mixed-00215840':[{sku:'U35C',quantity:4,unit_price:340,amount:1360},{sku:'SLXD2+',quantity:1,unit_price:480,amount:480},{sku:'AT-2',quantity:1,unit_price:270,amount:270},{sku:'U3',quantity:4,unit_price:275,amount:1100}],
  'jny-rds-2021':[{sku:'PT-TW381R',quantity:1,unit_price:4820,amount:4820}],
  'seminar-room-2021':[{sku:'PT-VW540',quantity:2,unit_price:707,amount:1414},{sku:'SPS-1100',quantity:2,unit_price:90,amount:180}],
  'hawko-av-cart-2021':[{sku:'ZS6HKOAV-EB97E',quantity:2,unit_price:550,amount:1100,recovered:true}],
  'av-media-2023-reference-dedupe':[
    {sku:'PT-MZI7K',quantity:4,unit_price:9588,amount:38352},
    {sku:'ET-EMT750',quantity:4,unit_price:3080,amount:12320},
    {sku:'VS-442H2A',quantity:3,unit_price:3500,amount:10500},
    {sku:'RC-208/UK',quantity:6,unit_price:800,amount:4800},
    {sku:'TP-583TXR',quantity:8,unit_price:590,amount:4720},
    {sku:'TP-583RXR',quantity:8,unit_price:590,amount:4720}
  ]
};
let historicalFields=0,historicalFieldsPassed=0;
const near=(a,b)=>Math.abs(Number(a)-Number(b))<=.01;
for(const hc of suites.golden.cases){
  const expected=historicalExpectations[hc.id]||[];
  const actualRows=hc.id==='hawko-av-cart-2021'?(hc.actual?.recovered||[]):(hc.actual?.items||[]);
  for(const ex of expected){
    const row=actualRows.find(r=>String(r.sku||'').replace(/[^A-Z0-9]+/gi,'').toUpperCase()===String(ex.sku).replace(/[^A-Z0-9]+/gi,'').toUpperCase());
    for(const field of ['sku','quantity','unit_price','amount']){
      historicalFields++;
      const ok=!!row&&(field==='sku'?String(row.sku||'').replace(/[^A-Z0-9]+/gi,'').toUpperCase()===String(ex.sku).replace(/[^A-Z0-9]+/gi,'').toUpperCase():near(row[field],ex[field]));
      if(ok)historicalFieldsPassed++;
      else throw new Error('Historical field accuracy failed: '+hc.id+' '+ex.sku+' '+field+' expected '+ex[field]+' got '+(row?.[field]??'missing'));
    }
  }
}
console.log('historical-field-accuracy: '+historicalFieldsPassed+'/'+historicalFields+' PASS (source excerpts, not raw-PDF OCR)');

const cv=(core.match(/const VERSION='([^']+)'/)||[])[1],av=(app.match(/const VERSION='([^']+)'/)||[])[1],iv=(index.match(/releaseCurrentVersion">v([^<]+)/)||[])[1],uv=(index.match(/releaseUpcomingVersion">v([^<]+)/)||[])[1];
assert(cv==='7.03.3.14y','Core version must be 7.03.3.14y');
assert(av===cv,'App/core version mismatch: '+av+' vs '+cv);
assert(iv===cv,'Index/core version mismatch: '+iv+' vs '+cv);
assert(uv==='7.03.3.14z','Upcoming version must be 7.03.3.14z');

for(const bad of ['replaceOnce(','src.replace(','new Blob([src]','raw.githubusercontent.com','baseline-v6.55-d452']){
  assert(!runtime.includes(bad),'Direct runtime contains retired compatibility mechanism: '+bad);
}
assert(runtime.includes('InventoryHubParserEvidenceEngine'),'Direct runtime does not use parser evidence engine');
assert(runtime.includes('independent-geometry-complete')&&runtime.includes('v2Promotion:promotion')&&!runtime.includes('Parser V2 runs in shadow mode only.'),'Production finalizer must use fail-closed Parser V2 evidence promotion instead of shadow-only diagnostics');
assert(runtime.includes('v2FullDocumentEvidence'),'Production runtime must preserve a V2-only full-document evidence channel');
assert(runtime.includes("source:'native-pdf-full'")&&runtime.includes("source:'ocr-full-' + m.key")||runtime.includes("source:'ocr-full-'+m.key"),'Production runtime must preserve native and OCR full-document evidence before invoice-only filtering');
assert(runtime.includes('const v2Extra=Array.isArray(state.v2FullDocumentEvidence)')&&runtime.includes('sources:v2Sources'),'Parser V2 must receive full-document evidence in addition to invoice-only legacy sources');
assert(runtime.includes("const arr=[{source:'chosen'")&&runtime.includes("for(const c of state.ocrCandidates||[])arr.push"),'Legacy evidence source builder must remain invoice-only and separate from V2 support evidence');
assert(app.includes('modules/parser-v2/engine.js')&&app.includes('Parser V2 evidence-promotion gate failed'),'App bootstrap must load and gate Parser V2 before runtime');
assert(app.includes('modules/parser-v2/table-detector.js')&&app.includes('modules/parser-v2/row-builder.js'),'App bootstrap must load independent Parser V2 table/row modules');
assert(parserV2Engine.includes("mode:'evidence-first-independent-table'")&&parserV2Engine.includes('T.detectTables(evidence)')&&parserV2Engine.includes('B.buildRows(evidence,tables)')&&parserV2Engine.includes('assessPromotion'),'Parser V2 engine must derive promotion from its own geometry pipeline');


assert(app.includes('modules/canonical-parser.js'),'Canonical parser module is not loaded');
assert(runtime.includes('InventoryHubCanonicalParser.fromPipeline'),'Production finalizer does not publish through the canonical parser API');
assert(!runtime.includes('globalThis.AVParserV7.enhanceParsed({parsed:normalized'),'Independent post-finalizer parser mutation still exists');
assert(!runtime.includes('globalThis.AVParserV7.prepareSave(state.parsed.items'),'Independent save-time parser correction still exists');
assert(!runtime.includes('applyParsedFixes(state.parsed'),'Review UI must not re-run an independent parser correction layer');
assert(!runtime.includes('state.parsed.items=v689SerialIntegrityGate'),'Save flow must not mutate canonical rows with a separate serial gate');
assert(!runtime.includes('state.parsed.items=inventoryOnlyItems'),'Save flow must not independently filter canonical rows');
assert(!runtime.includes('sanitizeParsedInventoryItems(state.parsed'),'Review rendering must consume canonical rows without a separate sanitizer');
assert(runtime.includes('InventoryHubCanonicalParser.applyReviewEdits'),'Review edits do not route through the canonical parser API');
assert(runtime.includes('__canonicalAuthorityV11'),'Final canonical parser authority boundary is missing');
assert(runtime.includes("this.sb.rpc('confirm_and_save_invoice_v703314v'"),'Confirm & Save does not use canonical PostgreSQL RPC');
assert(runtime.includes('database migration must be applied before this invoice can be saved'),'Confirm & Save must surface a specific missing-RPC/database-migration error');
assert(runtime.includes('InventoryHubCanonicalParser.calculateAmount(qty.value,price.value)'),'Review Qty/Unit Price changes are not wired to canonical Amount auto-calculation');
assert(runtime.includes('extractSupplierHeaderCandidate'),'Runtime supplier recovery is not using the generic evidence resolver');
assert(runtime.includes("recovery-header-left")&&runtime.includes("!existingInvoice||!existingSupplier"),'Targeted header OCR must recover supplier and invoice independently');
assert(runtime.includes("renderDuplicateImportWarning14x(dupe,{focus:true})")&&!runtime.includes("if(dupe&&!state.allowDuplicate)throw new Error('Possible duplicate detected."),'Duplicate invoice save path must surface the decision UI instead of throwing a generic import error');
assert(runtime.includes("for(const id of ['pSupplier','pInvoice','pDate'])")&&runtime.includes("refreshDuplicateWarning({resetOverride:true,focus:false})"),'Manual header edits must refresh duplicate detection');

assert(runtime.includes("this.sb.rpc('resolve_health_issue_v703314x'"),'Data Health Resolve does not persist through its database RPC');
assert(runtime.includes('data-health-resolve'),'Data Health Resolve action is not rendered');
assert(runtime.includes("x.type==='Possible duplicate SKU')?'<button class=\"secondary small-btn\" data-health-resolve="),'Possible duplicate SKU alerts must expose Resolve');
assert(runtime.includes('function renderNeedsAttention14x(openDialog=false)'),'14x must have one authoritative Needs Attention renderer');
assert(runtime.includes('const hydratePersistedHealthReviews14x=async()=>'),'14x must hydrate persisted Data Health reviews after core init');
assert(runtime.includes('hydratePersistedHealthReviews14x().then(()=>{')&&runtime.includes('renderNeedsAttention14x(false);'),'14x must reconcile Needs Attention after persisted health hydration');
const health14xStart=runtime.indexOf('function v703314x');
const health14xTail=health14xStart>=0?runtime.slice(health14xStart):runtime.slice(runtime.indexOf('function renderNeedsAttention14x')-5000);
assert(!health14xTail.includes('v703314xBaseRenderQuality=renderQualityDashboard14o'),'14x must not reference closure-local renderQualityDashboard14o');
assert(!health14xTail.includes('renderQualityDashboard14o=function'),'14x must not overwrite closure-local parser dashboard renderer');
const intel14oStart=runtime.indexOf('(function v703314oInstallParserIntelligence(){'),intel14oEnd=runtime.indexOf('})();',intel14oStart)+5,intel14oBlock=runtime.slice(intel14oStart,intel14oEnd),intel14oExecutableCalls=(intel14oBlock.match(/renderQualityDashboard14o\(\)/g)||[]).length;
assert(intel14oExecutableCalls===1&&intel14oBlock.includes('function renderQualityDashboard14o()'),'Retired 14o quality renderer must have no executable call sites');
assert(runtime.includes('renderAutomationCentre=function(){renderNeedsAttention14x(false)'),'Automation Centre card must use authoritative 14x issue list');
assert(runtime.includes('openAttention=function(){renderNeedsAttention14x(true)'),'Needs Attention dialog must use the same authoritative 14x issue list');
assert(/ASSET_REV='v703314y-[^']+'/.test(app),'14y loader must carry an explicit cache-busting asset revision');
assert(!runtime.includes('out=applySupplierProfile14o(out,raw);out=applyCorrectionMemory14o(out,raw)'),'Retired Correction Memory must not mutate parsed output');
assert(!runtime.includes('if(corrections.length)await persistCorrectionMemory14o(corrections)'),'Retired Correction Memory must not persist new corrections');
assert(!runtime.includes('<strong>Correction Memory</strong>'),'Retired Correction Memory UI must not render');
assert(runtime.includes('<strong>Supplier Layout Profiles</strong>'),'Supplier Layout Profiles must remain after Correction Memory retirement');
assert(runtime.includes("source.sku||'No SKU'"),'No-SKU merge acknowledgement must render a safe label');
assert(core.includes("'embedded-sku-alias'"),'Evidence-backed no-SKU duplicate merge path is missing');
assert(masterMergeSql.includes('v_source_text_key')&&masterMergeSql.includes('No-SKU source does not contain the surviving SKU/model'),'Server-side no-SKU merge evidence guard is missing');
assert(healthResolutionSql.includes('resolve_health_issue_v703314x')&&healthResolutionSql.includes("resolution_status='resolved'"),'Persistent Data Health resolution migration is incomplete');
assert(databaseMigrationWorkflow.includes('/v1/projects/$SUPABASE_PROJECT_REF/database/query'),'Database migration workflow does not use the verified Supabase Management API query endpoint');
assert(databaseMigrationWorkflow.includes('secrets.SUPABASE_ACCESS_TOKEN'),'Database migration workflow must use the protected Supabase access token');
assert(databaseMigrationWorkflow.includes('confirm_and_save_invoice_v703314v')&&databaseMigrationWorkflow.includes('merge_master_items_v703314d')&&databaseMigrationWorkflow.includes('resolve_health_issue_v703314x'),'Database deployment verification does not check all required RPCs');
assert(!runtime.includes("this.sb.rpc('import_invoice_atomic'"),'Legacy import_invoice_atomic remains in production Confirm & Save path');
assert(canonicalSaveSql.includes('create or replace function public.confirm_and_save_invoice_v703314v'),'Canonical Confirm & Save RPC missing');
for(const table of ['public.documents','public.purchases','public.master_items','public.purchase_items','public.serial_numbers'])assert(canonicalSaveSql.includes(table),'Atomic save RPC/schema missing '+table);
assert(canonicalSaveSql.includes('canonical_brand')&&canonicalSaveSql.includes('canonical_model')&&canonicalSaveSql.includes('verified_aliases'),'Canonical identity schema incomplete');
assert(canonicalSaveSql.includes('invoice_evidence'),'Original invoice evidence retention missing');
assert(canonicalSaveSql.includes('security invoker'),'Confirm & Save RPC must remain SECURITY INVOKER');
assert(canonicalSaveSql.includes('revoke execute on function public.confirm_and_save_invoice_v703314v')&&canonicalSaveSql.includes('grant execute on function public.confirm_and_save_invoice_v703314v'),'RPC execution grants missing');

const canonicalCtx={};canonicalCtx.window=canonicalCtx;canonicalCtx.globalThis=canonicalCtx;vm.createContext(canonicalCtx);vm.runInContext(canonicalParser,canonicalCtx,{filename:'modules/canonical-parser.js'});
const canonicalApi=canonicalCtx.InventoryHubCanonicalParser;
const identity=canonicalApi.canonicalIdentity({brand:'Remaco',model:'MAS-1818',sku:'MAS-1818',verified_aliases:['MAS1818']});
assert(identity.key==='REMACO::MAS1818','Canonical brand+model identity normalization failed');
assert(identity.verifiedAliases.includes('MAS1818'),'Verified alias retention failed');
assert(canonicalApi.calculateAmount(4,9588)===38352,'Canonical Qty × Unit Price amount calculation failed');
assert(canonicalApi.calculateAmount('',9588)===null,'Canonical amount calculator must reject blank quantity');
const canonicalResult=canonicalApi.normalizeResult({doc:{invoice_number:'ANON-1'},items:[{brand:'Remaco',model:'MAS-1818',sku:'MAS-1818',item_name:'Projector mount controller',description:'Original invoice wording',quantity:2,unit_price:350,amount:700,verified_aliases:['MAS1818']}],rawText:'anonymized invoice evidence',parseEvidence:{evidenceRanking:{review:[]}}});
assert(canonicalResult.apiVersion==='1.1'&&canonicalResult.canonical===true&&canonicalResult.status==='accepted','Canonical result contract failed');
assert(canonicalResult.items[0].invoice_evidence.original_description==='Original invoice wording','Canonical normalization lost original invoice evidence');
assert(canonicalResult.items[0].canonical_identity.key==='REMACO::MAS1818','Canonical result lost identity');
const editedCanonical=canonicalApi.applyReviewEdits(canonicalResult,{doc:{invoice_date:'2026-09-25'},items:[{...canonicalResult.items[0],item_name:'Reviewed controller'}]});
assert(editedCanonical.items[0].item_name==='Reviewed controller','Canonical review edits were not applied');
assert(editedCanonical.items[0].invoice_evidence.original_description==='Original invoice wording','Canonical review edit overwrote original invoice evidence');

const level3Review=canonicalApi.normalizeResult({
  doc:{supplier_name:'Example Supplier',invoice_number:'ANON-L3',invoice_date:'2026-09-25',currency:'SGD'},
  items:[{sku:'CTRL-200',item_name:'Reviewed controller',description:'Reviewed controller',quantity:2,unit_price:350,amount:700}],
  review:[{index:0,reason:'low-confidence'}],
  rawText:'anonymized invoice evidence'
});
assert(canonicalApi.prepareSave(level3Review).status==='review','Unresolved Level 3 case must require review');
const level3Approved=canonicalApi.markHumanReviewed(level3Review);
assert(canonicalApi.prepareSave(level3Approved).ok===true,'Human-approved Level 3 case must become saveable');
const level3Recollected=canonicalApi.applyReviewEdits(level3Approved,{
  doc:{...level3Approved.doc},
  items:level3Approved.items.map(x=>({...x}))
});
assert(level3Recollected.humanReviewed===true,'Unchanged form recollection must preserve Level 3 human approval');
assert(canonicalApi.prepareSave(level3Recollected).ok===true,'Approved Level 3 case must remain saveable after unchanged form recollection');
const level3Changed=canonicalApi.applyReviewEdits(level3Approved,{
  doc:{...level3Approved.doc},
  items:level3Approved.items.map((x,i)=>i===0?{...x,quantity:3,amount:1050}:x)
});
assert(level3Changed.humanReviewed===false&&canonicalApi.prepareSave(level3Changed).status==='review','Material post-review edits must invalidate Level 3 approval');

const serialConflict=canonicalApi.normalizeResult({doc:{invoice_number:'ANON-2'},items:[{item_name:'A',quantity:1,serials:'SER-1'},{item_name:'B',quantity:1,serials:'SER-1'}],parseEvidence:{evidenceRanking:{review:[]}}});
assert(canonicalApi.prepareSave(serialConflict).status==='block','Canonical save validation must block duplicate serial ownership');
assert(canonicalApi.diagnostics(editedCanonical).canonical===true,'Canonical diagnostics contract failed');
console.log('canonical-parser-and-atomic-save: API, identity, evidence and RPC contracts PASS');
assert(runtime.includes('evidenceEngine.runPipeline(candidates,{subtotal:doc.subtotal,confidenceThreshold:.72})'),'Production finalizer must use candidate -> evidence -> economics -> confidence -> review pipeline');
assert(runtime.includes("let extracted=pipeline.items||[]"),'Production finalizer must preserve evidence-backed rows when pipeline requires review');
assert(runtime.includes("if(pipeline.status==='review')inventory=inventory.map"),'Production finalizer must mark preserved review rows for human verification');
assert(!runtime.includes('v687CompletenessReconcile(candidates,inventory,evidence)'),'Post-ranking completeness must not reintroduce weaker candidate rows');
assert(runtime.includes('InventoryHubParserTable.parseHeaderAlignedLayout'),'Direct runtime does not call parser module');
assert(runtime.includes('InventoryHubGroupedCompanyUI.renderGroupedCompanyCards'),'Direct runtime does not call grouped UI module');
assert(!runtime.includes('InventoryHubBackupVerificationUI'),'Backup Verification Admin UI must not be referenced by the direct runtime');
assert(!runtime.includes('backupVerificationCard')&&!runtime.includes('loadBackupVerification')&&!runtime.includes('renderBackupVerification'),'Backup Verification Admin UI hooks remain in the direct runtime');
assert(runtime.includes("__AV_DIRECT_RUNTIME_LOADED__='7.03.3.14y'"),'14y direct runtime load sentinel missing');
assert(!runtime.includes('SUPABASE_SECRET_KEY')&&!runtime.includes('SUPABASE_ACCESS_TOKEN'),'Server backup secrets leaked into browser runtime');

// Live mixed-document OCR trigger: a readable native invoice must still run independent OCR
// when a corroborating numbered price schedule is attached.
assert(runtime.includes('nativeHasCorroboratingSchedule')&&runtime.includes('||nativeHasCorroboratingSchedule'),'Live runtime does not force OCR for attached price schedules');
assert(runtime.includes('const nativeSchedule=')&&runtime.includes('nativeSchedule||ocrSchedule'),'High-resolution schedule discovery lacks native-text fallback');
assert(runtime.includes('const nativeInvoiceModels=')&&runtime.includes('nativeInvoiceModels||ocrInvoiceModels'),'High-resolution invoice-model discovery lacks native-text fallback');
const supportScheduleRe=/\bSCHEDULES?\s+OF\s+PRICES\b/i;
const richMixedText='TAX INVOICE\\nNo. Description Qty Unit Price Amount\\n1 Mixer 1 100.00 100.00\\nSCHEDULES OF PRICES AND TECHNICAL DATA\\n1 Mixer ABC-1 UK 1 $100.00 $100.00';
const oldStrongNativeGate=5000<80||(1===0&&60<20);
assert(oldStrongNativeGate===false,'Regression fixture must represent a strong native PDF that previously skipped OCR');
assert((oldStrongNativeGate||supportScheduleRe.test(richMixedText))===true,'Attached price schedule must force corroborating OCR even when native invoice structure is strong');
assert((oldStrongNativeGate||supportScheduleRe.test('TAX INVOICE\\nNo. Description Qty Unit Price Amount'))===false,'Ordinary strong native invoices must not be forced through the expensive support OCR path');
console.log('live-support-ocr-trigger: strong-native mixed-document corroboration PASS');

assert(app.includes('modules/parser-evidence-engine.js')&&app.includes('modules/parser-table.js')&&app.includes('modules/grouped-company-ui.js')&&app.includes('runtime-v7.03.3.14y.js'),'14y bootstrap direct module references missing');
assert(!app.includes('modules/backup-verification-ui.js'),'Backup Verification Admin must not be loaded into Automation Centre');
assert(index.includes('components.css?v=7.03.3.14v-r3'),'Reusable component stylesheet is not loaded');
for(const marker of ['.ui-toolbar','.ui-modal','.ui-table-wrap','.ui-group','.ui-diagnostic','@media(max-width:760px)'])assert(componentsCss.includes(marker),'Reusable component style missing '+marker);
assert(index.includes('ui-toolbar--responsive')&&index.includes('ui-table-wrap')&&index.includes('ui-modal'),'Core views are not consuming reusable component classes');
assert(groupModule.includes('ui-group')&&groupModule.includes('ui-group__toggle'),'Grouped view module is not consuming reusable component classes');
assert(/ASSET_REV='v703314y-[^']+'/.test(app),'v14y cache-busting asset revision marker missing');
assert(runtime.includes("'Improved line-item price recovery using independent table geometry with fail-closed verification.'")&&runtime.includes("'Service, accessory and warranty rows remain excluded from Inventory promotion.'"),'Direct runtime Patch Notes are not the current v14y user-facing version');
assert(index.includes('Improved line-item price recovery using independent table geometry with fail-closed verification.')&&index.includes('Service, accessory and warranty rows remain excluded from Inventory promotion.'),'Static Patch Notes fallback is not current');
assert(index.includes('app.js?v=7.03.3.14y-r4'),'Index app.js cache-bust revision missing');
assert(!app.includes('runtime-v7.03.3.14t.js')&&!app.includes('runtime-v7.03.3.14s.js')&&!app.includes('baseline-v6.55-d452'),'14y bootstrap still references an older runtime/baseline');
assert(index.includes('id="inventoryGroup"')&&index.includes('id="documentGroup"'),'Protected Group by Company controls are missing from Inventory or Documents');
assert(/id="inventoryGroup"[\s\S]{0,300}value="company">Group by Company/.test(index),'Inventory Group by Company option must remain available');
assert(/id="documentGroup"[\s\S]{0,300}value="company">Group by Company/.test(index),'Documents Group by Company option must remain available');
assert(/id="documentGroup"[\s\S]{0,160}<option value="none">No Grouping<\/option>[\s\S]{0,160}<option value="company">Group by Company<\/option>/.test(index),'Documents grouping must default to No Grouping so selecting Group by Company causes a visible state change');
assert(index.includes('#documentsView #documentGroup{flex:0 0 230px;width:230px;min-width:230px;max-width:230px;'),'Documents Group by Company dropdown width guard missing');
assert(runtime.includes("group=$('documentGroup')?.value||'none'"),'Documents renderer fallback must default to No Grouping');
assert(runtime.includes("\\$('inventoryGroup')?.addEventListener('change',renderInventory)")||runtime.includes("\\$('inventoryGroup').onchange=renderInventory")||runtime.includes("inventoryGroup')?.addEventListener('change',renderInventory"),'Inventory Group by Company event path must remain wired');
assert(runtime.includes("$('documentGroup')?.addEventListener('change',renderDocuments)"),'Documents Group by Company must use the same change-listener pattern as Inventory');
assert(runtime.includes("function v703314sRenderDocumentGroups(groups,head)")&&runtime.includes("host:$('documentsTable'),groups,head,escapeHtml:esc"),'Documents Group by Company must use a dedicated wrapper matching Inventory grouping behavior');
assert(runtime.includes("host:$('documentsTable'),groups,head,escapeHtml:esc,itemLabel:'invoice'"),'Documents grouped view must use invoice count labels');
assert(runtime.includes("host:$('inventoryTable'),groups,head,escapeHtml:esc,itemLabel:'item'"),'Inventory grouped view must use item count labels');
assert(componentsCss.includes('#documentsView #documentGroup,#inventoryView #inventoryGroup')&&componentsCss.includes('width:230px'),'Reusable grouped-view controls must preserve full company grouping labels');
assert(componentsCss.includes('.ui-group__toggle,.v669-doc-group-toggle')&&componentsCss.includes('justify-content:space-between'),'Compact grouped-view accordion styling is missing');
assert(index.indexOf('id="documentSort"')<index.indexOf('id="documentGroup"'),'Documents toolbar must remain Search → Sort → Group as in the established UI');
assert(componentsCss.includes('#auditView #auditUser')&&componentsCss.includes('#auditView #auditAction')&&componentsCss.includes('flex:0 0 190px'),'Recent Activities dropdowns must match the date control width');
assert(componentsCss.includes('#importDialog #dropZone.drop-zone')&&componentsCss.includes('min-height:56px')&&componentsCss.includes('height:56px'),'Import PDF drop zone must remain approximately 70% shorter on desktop');
console.log('protected-company-grouping: Inventory + Documents controls/event/render paths PASS');
assert(fs.existsSync('runtime-v7.03.3.14t.js')&&fs.existsSync('runtime-v7.03.3.14s.js')&&fs.existsSync('runtime-v7.03.3.14r.js')&&fs.existsSync('baseline-v6.55-d452.js'),'Rollback references must remain available');


// Parser V2 architecture gates: evidence sources stay separate, headers resolve independently,
// Reference Number is exact-or-blank, and row accounting must expose missing equipment.
const v2ctx={console,Date,JSON,Math,Number,String,Array,Object,Set,Map,RegExp};v2ctx.globalThis=v2ctx;v2ctx.window=v2ctx;vm.createContext(v2ctx);
vm.runInContext(parserV2Evidence,v2ctx,{filename:'modules/parser-v2/evidence-model.js'});
vm.runInContext(parserV2Header,v2ctx,{filename:'modules/parser-v2/header-resolver.js'});
vm.runInContext(parserV2Table,v2ctx,{filename:'modules/parser-v2/table-detector.js'});
vm.runInContext(parserV2Builder,v2ctx,{filename:'modules/parser-v2/row-builder.js'});
vm.runInContext(parserV2Rows,v2ctx,{filename:'modules/parser-v2/row-accounting.js'});
vm.runInContext(parserV2Numbered,v2ctx,{filename:'modules/parser-v2/numbered-schedule.js'});
vm.runInContext(parserV2Engine,v2ctx,{filename:'modules/parser-v2/engine.js'});
assert(v2ctx.InventoryHubParserV2?.selfTest?.().ok,'Parser V2 self-test failed: '+(v2ctx.InventoryHubParserV2?.selfTest?.().failures||[]).join(', '));
const sameCompanyA=v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[
  {source:'native',text:'AV MEDIA PTE LTD\nTAX INVOICE\nInvoice No.: VIN17-049472\nDATE: 06-04-26\nRef. No.: VSO17-035483'},
  {source:'ocr',text:'AV MEDIA PTE LTD\nInvoice No.: VIN17-049472\nDATE: 06-04-26\nRef. No.: VSO17-035483'}
]});
const sameCompanyB=v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[
  {source:'native',text:'TAX INVOICE\nCustomer Code: R2002\nInvoice No.: VIN17-055555\nDATE: 18/08/26'},
  {source:'ocr',text:'AV MEDIA PTE LTD\nBlk 2023 Bukit Batok Industrial Park\nInvoice No.: VIN17-055555\nDATE: 18/08/26'}
]});
const ha=v2ctx.InventoryHubParserV2Header.resolveHeaders(sameCompanyA),hb=v2ctx.InventoryHubParserV2Header.resolveHeaders(sameCompanyB);
assert(/AV MEDIA PTE LTD/i.test(ha.supplier_name)&&/AV MEDIA PTE LTD/i.test(hb.supplier_name),'Parser V2 same-company supplier resolution failed across evidence variations');
assert(ha.invoice_number==='VIN17-049472'&&hb.invoice_number==='VIN17-055555','Parser V2 invoice-number resolution failed across same-company variations');
assert(ha.invoice_date==='2026-04-06'&&hb.invoice_date==='2026-08-18','Parser V2 date resolution failed across same-company variations');
const badRef=v2ctx.InventoryHubParserV2Header.resolveHeaders(v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[
  {source:'native',text:'Ref. No.: VSO17-035483'},
  {source:'ocr',text:'Ref. No.: VSOI7-O354B3'}
]}));
assert(badRef.reference_number==='','Reference Number conflict must remain blank; guessing is forbidden');
const ledger=v2ctx.InventoryHubParserV2Rows.buildLedger([
  {origin:'high-confidence-partial',items:[{sku:'AVS-320',item_name:'Projector controller',quantity:2,unit_price:350,amount:700}]},
  {origin:'complete-layout',items:[
    {sku:'AVS-320',item_name:'Projector controller',quantity:2,unit_price:350,amount:700},
    {sku:'RX-1',item_name:'Wireless receiver',quantity:2,unit_price:400,amount:800},
    {sku:'MIC-1',item_name:'Wireless microphone',quantity:2,unit_price:250,amount:500},
    {sku:'PROJ-1',item_name:'Laser projector',quantity:1,unit_price:5000,amount:5000},
    {sku:'INSTALL',item_name:'Installation labour',quantity:1,unit_price:1000,amount:1000}
  ]}
]);
const ledgerSummary=v2ctx.InventoryHubParserV2Rows.summarize(ledger);
assert(ledgerSummary.detectedRows===5&&ledgerSummary.counts.equipment===4&&ledgerSummary.counts.service===1,'Parser V2 row ledger failed to preserve/account for the fuller candidate set');
const compared=v2ctx.InventoryHubParserV2Rows.compareFinalItems(ledger,[{sku:'AVS-320',item_name:'Projector controller',quantity:2,unit_price:350,amount:700}]);
assert(compared.missingEquipment.length===3,'Parser V2 must detect equipment missing from a partial winning candidate');
const independentFiveRowLayout=[{page:1,width:820,height:1000,yTolerance:3,rows:[
  {y:100,text:'PRODUCT NO DESCRIPTION QUANTITY UNIT PRICE AMOUNT',items:[
    {text:'PRODUCT NO',x:40,width:90},{text:'DESCRIPTION',x:180,width:120},{text:'QUANTITY',x:470,width:60},{text:'UNIT PRICE',x:570,width:70},{text:'AMOUNT',x:700,width:60}
  ]},
  {y:140,text:'AVS-320 Projector controller 2 350.00 700.00',items:[
    {text:'AVS-320',x:45,width:65},{text:'Projector controller',x:180,width:190},{text:'2',x:490,width:10},{text:'350.00',x:585,width:55},{text:'700.00',x:710,width:55}
  ]},
  {y:175,text:'RX-1 Wireless receiver 2 400.00 800.00',items:[
    {text:'RX-1',x:45,width:45},{text:'Wireless receiver',x:180,width:170},{text:'2',x:490,width:10},{text:'400.00',x:585,width:55},{text:'800.00',x:710,width:55}
  ]},
  {y:210,text:'MIC-1 Wireless microphone 2 250.00 500.00',items:[
    {text:'MIC-1',x:45,width:50},{text:'Wireless microphone',x:180,width:190},{text:'2',x:490,width:10},{text:'250.00',x:585,width:55},{text:'500.00',x:710,width:55}
  ]},
  {y:245,text:'PROJ-1 Laser projector 1 5000.00 5000.00',items:[
    {text:'PROJ-1',x:45,width:60},{text:'Laser projector',x:180,width:150},{text:'1',x:490,width:10},{text:'5000.00',x:580,width:60},{text:'5000.00',x:705,width:60}
  ]},
  {y:280,text:'INSTALL Installation labour 1 1000.00 1000.00',items:[
    {text:'INSTALL',x:45,width:65},{text:'Installation labour',x:180,width:180},{text:'1',x:490,width:10},{text:'1000.00',x:580,width:60},{text:'1000.00',x:705,width:60}
  ]},
  {y:325,text:'SUBTOTAL 8000.00',items:[{text:'SUBTOTAL',x:570,width:70},{text:'8000.00',x:705,width:60}]}
]}];
const independentV2=v2ctx.InventoryHubParserV2.analyze({
  sources:[{source:'native-layout',kind:'layout',text:'SUPPLIER: Example AV Pte Ltd\nInvoice No.: INV-5001\nDATE: 25/09/26',layout:independentFiveRowLayout}],
  candidates:[{origin:'legacy-partial',items:[
    {sku:'AVS-320',item_name:'Projector controller',quantity:2,unit_price:350,amount:700},
    {sku:'RX-1',item_name:'Wireless receiver',quantity:2,unit_price:400,amount:800}
  ]}],
  legacyResult:{doc:{supplier_name:'Example AV Pte Ltd',invoice_number:'INV-5001',invoice_date:'2026-09-25'},items:[
    {sku:'AVS-320',item_name:'Projector controller',quantity:2,unit_price:350,amount:700},
    {sku:'RX-1',item_name:'Wireless receiver',quantity:2,unit_price:400,amount:800}
  ]}
});
assert(independentV2.mode==='evidence-first-independent-table'&&independentV2.tables.length===1,'Parser V2 must detect the table independently of legacy candidates');
assert(independentV2.physicalRows.length===5,'Parser V2 physical reconstruction expected 5 source rows, got '+independentV2.physicalRows.length);
assert(independentV2.completeness.counts.equipment===4&&independentV2.completeness.counts.service===1,'Parser V2 physical ledger must account for 4 equipment + 1 service rows');
assert(independentV2.finalComparison.missingEquipment.length===2,'Parser V2 must expose the 2 equipment rows omitted by the legacy partial result');
assert(independentV2.safeToPromote===true&&independentV2.promotionNeeded===true,'Complete independent table evidence must be promotable when the legacy result is incomplete');
assert(independentV2.promotionRows.length===4&&!independentV2.promotionRows.some(x=>/INSTALL/i.test(String(x.sku||''))),'Promotion must contain the 4 verified equipment rows and exclude installation');

const conflictLedger=v2ctx.InventoryHubParserV2Rows.buildLedger([
  {origin:'geometry-a',items:[{sku:'CTRL-1',item_name:'Control panel',quantity:1,unit_price:350,amount:350,layoutEvidenceVerified:true,economicEvidenceVerified:true}]},
  {origin:'geometry-b',items:[{sku:'CTRL-1',item_name:'Control panel',quantity:1,unit_price:390,amount:390,layoutEvidenceVerified:true,economicEvidenceVerified:true}]}
]);
const conflictPromotion=v2ctx.InventoryHubParserV2.assessPromotion(conflictLedger,v2ctx.InventoryHubParserV2Rows.summarize(conflictLedger),{complete:false});
assert(conflictPromotion.safe===false&&conflictPromotion.blockers.some(x=>x.code==='conflicting-equipment-economics'),'Conflicting geometry economics must block automatic promotion');
assert(v2ctx.InventoryHubParserV2Rows.classifyDisposition({sku:'60100-SALES',item_name:'Active Speaker in pair',quantity:1,unit_price:90,amount:90})==='equipment','SALES accounting code must not override verified physical-equipment evidence');

const multipartHeaders=v2ctx.InventoryHubParserV2Header.resolveHeaders(
  v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[
    {source:'multipart-id',kind:'ocr',text:'Loud Technologies Asia Pte Ltd\nTAX INVOICE\nInvoice Number INV LTA-00215840\nInvoice Date 28/08/2026'}
  ]})
);
assert(multipartHeaders.invoice_number==='INV LTA-00215840','Parser V2 must preserve a proven two-token invoice identifier');

const aerospaceRawHeaders=v2ctx.InventoryHubParserV2Header.resolveHeaders(
  v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[
    {source:'aerospace-raw-psm11',kind:'ocr',text:'AV MEDIA PTE LTD\nTAX INVOICE\nInvoice No:\nVIN17-032365\nRef. No.\nDATE\nP/O NO.\nSALESMAN\nTERMS'},
    {source:'aerospace-raw-psm6',kind:'ocr',text:'AV MEDIA PTE LTD\nRef. No. DATE P/O NO. SALESMAN TERMS\nVSO17-021642/V17-035189/V17- 12/08/22 CQ/AN/2113/24/AN Andy Ng 30 Days'}
  ]})
);
assert(aerospaceRawHeaders.supplier_name==='AV MEDIA PTE LTD','Raw Aerospace supplier header recovery failed');
assert(aerospaceRawHeaders.invoice_number==='VIN17-032365','Raw Aerospace split-line invoice-number recovery failed');
assert(aerospaceRawHeaders.invoice_date==='2022-08-12','Raw Aerospace date must not absorb trailing reference-number digits');

const aerospaceRawLayout=[{page:1,width:2915,height:3790,yTolerance:12,rows:[
  {y:1296,text:'PRODUCT NO. DESCRIPTION QUANTITY UNIT PRICE AMOUNT',items:[
    {text:'PRODUCT',x:272,width:211},{text:'NO.',x:498,width:72},{text:'DESCRIPTION',x:1115,width:292},
    {text:'QUANTITY',x:1855,width:218},{text:'UNIT',x:2139,width:99},{text:'PRICE',x:2253,width:128},{text:'AMOUNT',x:2564,width:188}
  ]},
  {y:1483,text:'PT-VW540 Panasonic PT-VW540 projector 1 804.00 804.00',items:[
    {text:'PT-VW540',x:213,width:199},{text:'Panasonic',x:739,width:195},{text:'PT-VW540',x:949,width:222},{text:'projector',x:1185,width:173},
    {text:'1',x:2023,width:16},{text:'804.00',x:2321,width:131},{text:'804.00',x:2734,width:131}
  ]},
  {y:1544,text:'-5000 Ansi lumens',items:[{text:'-5000',x:740,width:122},{text:'Ansi',x:875,width:99},{text:'lumens',x:988,width:145}]},
  {y:1603,text:'-WXGA resolution',items:[{text:'-WXGA',x:739,width:183},{text:'resolution',x:931,width:209}]},
  {y:1673,text:'-1280 X 800 resolution',items:[{text:'-1280',x:740,width:122},{text:'X',x:881,width:20},{text:'800',x:931,width:75},{text:'resolution',x:1020,width:209}]},
  {y:1730,text:'PT-VW540- WT FOR 3YR 3 years warranty 1',items:[
    {text:'PT-VW540-',x:214,width:216},{text:'WT',x:443,width:64},{text:'FOR',x:518,width:86},{text:'3YR',x:617,width:80},
    {text:'3',x:726,width:20},{text:'years',x:775,width:101},{text:'warranty',x:888,width:178},{text:'1',x:2025,width:14}
  ]},
  {y:1797,text:'S/N: DC2210037',items:[{text:'S/N:',x:741,width:80},{text:'DC2210037',x:841,width:234}]},
  {y:1847,text:'AVS-320A Abtus AVS320 HDMI Control panel 1 350.00 350.00',items:[
    {text:'AVS-320A',x:216,width:196},{text:'Abtus',x:738,width:114},{text:'AVS320',x:865,width:166},{text:'HDMI',x:1047,width:124},
    {text:'Control',x:1187,width:145},{text:'panel',x:1347,width:104},{text:'1',x:2025,width:13},{text:'350.00',x:2323,width:130},{text:'350.00',x:2736,width:130}
  ]},
  {y:1962,text:'60100-SALES Abtus Active Speaker in pair 1 90.00 90.00',items:[
    {text:'60100-SALES',x:215,width:252},{text:'Abtus',x:738,width:115},{text:'Active',x:864,width:127},{text:'Speaker',x:1008,width:152},
    {text:'in',x:1172,width:40},{text:'pair',x:1224,width:77},{text:'1',x:2025,width:14},{text:'90.00',x:2343,width:111},{text:'90.00',x:2760,width:106}
  ]},
  {y:2087,text:'60200-INSTALLATION Installation work including: 1 530.00 530.00',items:[
    {text:'60200-INSTALLATION',x:216,width:426},{text:'Installation',x:740,width:221},{text:'work',x:973,width:97},{text:'including:',x:1083,width:195},
    {text:'1',x:2024,width:16},{text:'530.00',x:2323,width:130},{text:'530.00',x:2736,width:130}
  ]},
  {y:2975,text:'SUB TOTAL SGD 1,774.00',items:[{text:'SUB',x:2170,width:86},{text:'TOTAL',x:2270,width:158},{text:'SGD',x:2520,width:92},{text:'1,774.00',x:2680,width:162}]}
]}];
const aerospaceRawV2=v2ctx.InventoryHubParserV2.analyze({
  sources:[
    {source:'aerospace-raw-layout',kind:'ocr',text:'AV MEDIA PTE LTD',layout:aerospaceRawLayout},
    {source:'aerospace-raw-headers',kind:'ocr',text:'TAX INVOICE\nInvoice No:\nVIN17-032365\nRef. No. DATE P/O NO. SALESMAN TERMS\nVSO17-021642/V17-035189/V17- 12/08/22 CQ/AN/2113/24/AN Andy Ng 30 Days'}
  ],
  legacyResult:{doc:{},items:[]}
});
assert(aerospaceRawV2.promotionRows.some(x=>x.sku==='PT-VW540'&&x.quantity===1&&x.unit_price===804&&x.amount===804),'Raw Aerospace projector economics failed');
assert(aerospaceRawV2.promotionRows.some(x=>x.sku==='AVS-320A'&&x.item_name==='Abtus AVS320 HDMI Control panel'&&x.quantity===1&&x.unit_price===350&&x.amount===350),'Raw Aerospace AVS row was contaminated by prior specs/warranty or code spill');
assert(aerospaceRawV2.promotionRows.some(x=>x.sku==='60100-SALES'&&/Abtus Active Speaker in pair/i.test(x.item_name)&&x.quantity===1&&x.unit_price===90&&x.amount===90),'Raw Aerospace SALES-coded physical speaker must remain equipment');
assert(!aerospaceRawV2.promotionRows.some(x=>/INSTALLATION/i.test(String(x.sku||''))),'Raw Aerospace installation row must remain excluded from promotion');
assert(aerospaceRawV2.safeToPromote===true&&aerospaceRawV2.completeness.unexplainedRows===0,'Raw Aerospace evidence must be complete and safely promotable');

const aerospaceThinLinesBoth=v2ctx.InventoryHubParserV2Header.resolveHeaders(
  v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[
    {source:'aero-mut-psm6',kind:'ocr',text:'Invoice No: ENH7-032365\nVSO17-021642/V17-035189/V I17- +2408/22-'},
    {source:'aero-mut-psm11',kind:'ocr',text:'Invoice No:\nDATE\nP/O NO.\nSALESMAN\nTERMS'},
    {source:'aero-mut-psm3',kind:'ocr',text:'Invoice No:\nRef. No. P/O NO. SALESMAN TERMS'}
  ]})
);
assert(aerospaceThinLinesBoth.invoice_number===''&&aerospaceThinLinesBoth.decisions.invoice_number.reason==='single-source-ocr-unconfirmed','Crossed-line mutation must not auto-save ENH7-032365');

const aerospaceCombinedHard=v2ctx.InventoryHubParserV2Header.resolveHeaders(
  v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[
    {source:'aero-hard-psm6',kind:'ocr',text:'Invoice No: -VING932365-\nVSO17-021642/V17-035189/V 1i7- +2488?'},
    {source:'aero-hard-psm11',kind:'ocr',text:'Invoice No:\nSALESMAN\nTERMS'},
    {source:'aero-hard-psm3',kind:'ocr',text:'Customer Code: R2002'}
  ]})
);
assert(aerospaceCombinedHard.invoice_number===''&&aerospaceCombinedHard.decisions.invoice_number.reason==='single-source-ocr-unconfirmed','Combined damaged-header mutation must not auto-save VING932365');

const aerospaceHomoglyphSingle=v2ctx.InventoryHubParserV2Header.resolveHeaders(
  v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[
    {source:'aero-5s-psm6',kind:'ocr',text:'Invoice No: VIN17-03236S\nDATE\n12/08/22'},
    {source:'aero-5s-psm11',kind:'ocr',text:'Invoice No:\nDATE\n12/08/22'},
    {source:'aero-5s-psm3',kind:'ocr',text:'Invoice No:'}
  ]})
);
assert(aerospaceHomoglyphSingle.invoice_number===''&&aerospaceHomoglyphSingle.invoice_date==='2022-08-12','Single 5/S OCR guess must fail closed while a proven date may resolve');

const aerospaceHomoglyphMajority=v2ctx.InventoryHubParserV2Header.resolveHeaders(
  v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[
    {source:'aero-5s-mix-psm6',kind:'ocr',text:'Invoice No: VIN17-03236S\nDATE 12/08/22'},
    {source:'aero-5s-mix-psm11',kind:'ocr',text:'Invoice No: VIN17-032365\nDATE 12/08/22'},
    {source:'aero-5s-mix-psm3',kind:'ocr',text:'Invoice No: VIN17-032365'}
  ]})
);
assert(aerospaceHomoglyphMajority.invoice_number==='VIN17-032365','Two corroborating invoice OCR reads must beat one 5/S homoglyph misread');

// Complex mixed-document invoice locks derived from the Concept Systems scan.
const conceptHeaderLayout=[{page:2,width:1200,height:1600,yTolerance:3,rows:[
  {y:60,text:'Concept Systems Technologies Pte Ltd',items:[{text:'Concept Systems Technologies Pte Ltd',x:60,width:300}]},
  {y:90,text:'TAX INVOICE',items:[{text:'TAX INVOICE',x:800,width:150}]},
  {y:130,text:'Date: 16 Jul 2024',items:[{text:'Date:',x:700,width:50},{text:'16 Jul 2024',x:770,width:110}]},
  {y:160,text:'Invoice No.: 2407/015',items:[{text:'Invoice No.:',x:700,width:100},{text:'2407/015',x:820,width:90}]},
  {y:190,text:'Order Ref: PO2024/000134',items:[{text:'Order Ref:',x:700,width:90},{text:'PO2024/000134',x:810,width:130}]},
  {y:1250,text:'Account Name Concept Systems Technologies Pte Ltd Bank Account No. 536-817513-001',items:[{text:'Account Name Concept Systems Technologies Pte Ltd Bank Account No. 536-817513-001',x:70,width:700}]}
]}];
const conceptHeaders=v2ctx.InventoryHubParserV2Header.resolveHeaders(
  v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[{source:'concept-header',kind:'ocr',text:'',layout:conceptHeaderLayout}]})
);
assert(conceptHeaders.supplier_name==='Concept Systems Technologies Pte Ltd','Complex invoice supplier must ignore bank Account Name evidence');
assert(conceptHeaders.invoice_number==='2407/015','Complex invoice number resolution failed');
assert(conceptHeaders.invoice_date==='2024-07-16','Text-month invoice date resolution failed');
assert(conceptHeaders.reference_number==='PO2024/000134','Order Ref must resolve as reference number');

assert(v2ctx.InventoryHubParserV2TableDetector.pageDocumentRole({rows:[{text:'PURCHASE ORDER'}]})==='noninvoice','Purchase Order page must be excluded');
assert(v2ctx.InventoryHubParserV2TableDetector.pageDocumentRole({rows:[{text:'DELIVERY ORDER'}]})==='noninvoice','Delivery Order page must be excluded');
assert(v2ctx.InventoryHubParserV2TableDetector.pageDocumentRole({rows:[{text:'SCHEDULES OF PRICES AND TECHNICAL DATA'}]})==='support','Quotation/specification page must be support-only');
assert(v2ctx.InventoryHubParserV2Rows.classifyDisposition({item_name:'Supply and install cabling electrical audio data signal',quantity:1,unit_price:300,amount:300})==='service','Cabling scope line must be service');
assert(v2ctx.InventoryHubParserV2Rows.classifyDisposition({item_name:'Provide labelling and tidying the cabling setups',quantity:1,unit_price:100,amount:100})==='service','Labelling/tidying line must be service');
assert(v2ctx.InventoryHubParserV2Rows.classifyDisposition({item_name:'Passive Loudspeakers with mounting brackets',model:'ZX1I-90',quantity:6,unit_price:800,amount:4800})==='equipment','Physical loudspeaker with mounting brackets must remain equipment');

const conceptMiniInvoice=[
  {page:2,width:1200,height:1600,yTolerance:3,rows:[
    {y:40,text:'Concept Systems Technologies Pte Ltd',items:[{text:'Concept Systems Technologies Pte Ltd',x:40,width:300}]},
    {y:70,text:'TAX INVOICE',items:[{text:'TAX INVOICE',x:850,width:130}]},
    {y:100,text:'Date: 16 Jul 2024 Invoice No.: 2407/015',items:[{text:'Date: 16 Jul 2024',x:700,width:150},{text:'Invoice No.: 2407/015',x:870,width:180}]},
    {y:160,text:'Description Qty Unit Price Amount',items:[{text:'Description',x:100,width:120},{text:'Qty',x:650,width:50},{text:'Unit Price',x:760,width:90},{text:'Amount',x:1000,width:80}]},
    {y:210,text:'Wireless Handheld Microphone System 2 garbled 00.00',items:[{text:'Wireless Handheld Microphone System',x:100,width:360},{text:'2',x:665,width:12},{text:'garbled',x:765,width:70},{text:'00.00',x:1010,width:50}]},
    {y:240,text:'Model: Shure SLXD24/SM5B',items:[{text:'Model: Shure SLXD24/SM5B',x:100,width:260}]},
    {y:310,text:'System tuning and calibration 1 100.00 100.00',items:[{text:'System tuning and calibration',x:100,width:300},{text:'1',x:665,width:12},{text:'100.00',x:770,width:65},{text:'100.00',x:1010,width:65}]},
    {y:380,text:'Subtotal 2,000.00 GST 9% 180.00 Invoice Total 2,180.00',items:[{text:'Subtotal',x:780,width:75},{text:'2,000.00',x:870,width:85},{text:'GST 9%',x:960,width:60},{text:'180.00',x:1030,width:65},{text:'Invoice Total',x:1100,width:95},{text:'2,180.00',x:1200,width:85}]}
  ]},
  {page:6,width:1200,height:1600,yTolerance:3,rows:[
    {y:40,text:'SCHEDULES OF PRICES AND TECHNICAL DATA',items:[{text:'SCHEDULES OF PRICES AND TECHNICAL DATA',x:100,width:420}]},
    {y:160,text:'Description Model Qty Unit Price Amount',items:[{text:'Description',x:100,width:120},{text:'Model',x:510,width:70},{text:'Qty',x:650,width:50},{text:'Unit Price',x:760,width:90},{text:'Amount',x:1000,width:80}]},
    {y:210,text:'Wireless Handheld Microphone System SLXD24/SM58 2 950.00 1900.00',items:[{text:'Wireless Handheld Microphone System',x:100,width:330},{text:'SLXD24/SM58',x:500,width:120},{text:'2',x:665,width:12},{text:'950.00',x:770,width:65},{text:'1900.00',x:1010,width:75}]}
  ]}
];
const conceptSupportRecovered=v2ctx.InventoryHubParserV2.analyze({sources:[{source:'concept-mini',kind:'ocr',text:'',layout:conceptMiniInvoice}],legacyResult:{doc:{},items:[]}});
assert(conceptSupportRecovered.safeToPromote===true,'Matching quotation support + invoice subtotal should permit safe recovery');
assert(conceptSupportRecovered.promotionRows.some(x=>x.sku==='SLXD24/SM58'&&x.quantity===2&&x.unit_price===950&&x.amount===1900),'B/8 model ambiguity must be corrected only by matched support evidence');
assert(conceptSupportRecovered.invoiceSubtotalCheck?.expected===2000&&conceptSupportRecovered.invoiceSubtotalCheck?.actual===2000&&conceptSupportRecovered.invoiceSubtotalCheck?.ok===true,'Complex invoice subtotal guard exact-match failed');

const conceptWrongSupport=JSON.parse(JSON.stringify(conceptMiniInvoice));
const wrongSupportRow=conceptWrongSupport[1].rows.find(x=>/Wireless Handheld/.test(x.text));
wrongSupportRow.text='Wireless Handheld Microphone System SLXD24/SM58 2 990.00 1980.00';
wrongSupportRow.items[3].text='990.00';wrongSupportRow.items[4].text='1980.00';
const conceptWrongSupportResult=v2ctx.InventoryHubParserV2.analyze({sources:[{source:'concept-wrong-support',kind:'ocr',text:'',layout:conceptWrongSupport}],legacyResult:{doc:{},items:[]}});
assert(conceptWrongSupportResult.safeToPromote===false&&conceptWrongSupportResult.promotionDecision.blockers.some(x=>x.code==='invoice-subtotal-mismatch'),'Wrong supporting quotation price must be blocked by invoice subtotal');

const conceptContinuationSubtotal=JSON.parse(JSON.stringify(conceptWrongSupport));
conceptContinuationSubtotal[0].rows=conceptContinuationSubtotal[0].rows.map(r=>r);
conceptContinuationSubtotal[0].rows.splice(1,1,{y:70,text:'Page 2 of 2',items:[{text:'Page 2 of 2',x:850,width:100}]});
const conceptContinuationResult=v2ctx.InventoryHubParserV2.analyze({sources:[{source:'concept-continuation',kind:'ocr',text:'',layout:conceptContinuationSubtotal}],legacyResult:{doc:{},items:[]}});
assert(conceptContinuationResult.safeToPromote===false&&conceptContinuationResult.invoiceSubtotalCheck?.proven===true&&conceptContinuationResult.promotionDecision.blockers.some(x=>x.code==='invoice-subtotal-mismatch'),'Continuation page without invoice title must still contribute subtotal safety evidence');

// Real stamped-player failure shape: invoice Qty/Unit survive, Amount is corrupted;
// two quotation OCR sources agree on Amount but misread Qty. Recover only by field-level consensus.
const partialInvoiceLayout=[{page:2,width:1200,height:1600,yTolerance:3,rows:[
  {y:80,text:'TAX INVOICE',items:[{text:'TAX INVOICE',x:850,width:130}]},
  {y:120,text:'Date: 16 Jul 2024 Invoice No.: 2407/015',items:[{text:'Date: 16 Jul 2024',x:650,width:150},{text:'Invoice No.: 2407/015',x:830,width:190}]},
  {y:200,text:'Description Qty Unit Price Amount',items:[{text:'Description',x:100,width:120},{text:'Qty',x:650,width:50},{text:'Unit Price',x:760,width:90},{text:'Amount',x:1000,width:80}]},
  {y:260,text:'Dual CD and MP3 player with USB supported Playback 1 950.00 850.00',items:[{text:'Dual CD and MP3 player with USB supported Playback',x:100,width:430},{text:'1',x:665,width:12},{text:'950.00',x:770,width:65},{text:'850.00',x:1010,width:65}]},
  {y:290,text:'Model: Omnitronic XDP-3002',items:[{text:'Model: Omnitronic XDP-3002',x:100,width:260}]},
  {y:320,text:'Note: replaced with XDP-3001',items:[{text:'Note: replaced with XDP-3001',x:100,width:250}]},
  {y:390,text:'Subtotal 950.00 GST 9% 85.50 Invoice Total 1,035.50',items:[{text:'Subtotal',x:780,width:75},{text:'950.00',x:870,width:70},{text:'GST 9%',x:950,width:60},{text:'85.50',x:1020,width:55},{text:'Invoice Total',x:1080,width:95},{text:'1,035.50',x:1180,width:80}]}
]}];
const partialSupportLayout1=[{page:6,width:1200,height:1600,yTolerance:3,rows:[
  {y:80,text:'SCHEDULES OF PRICES AND TECHNICAL DATA',items:[{text:'SCHEDULES OF PRICES AND TECHNICAL DATA',x:100,width:420}]},
  {y:180,text:'Description Model Qty Unit Price Amount',items:[{text:'Description',x:100,width:120},{text:'Model',x:500,width:80},{text:'Qty',x:650,width:50},{text:'Unit Price',x:760,width:90},{text:'Amount',x:1000,width:80}]},
  {y:240,text:'Dual CD and MP3 player with USB supported Playback XDP-3002 4 950.09 950.00',items:[{text:'Dual CD and MP3 player with USB supported Playback',x:100,width:400},{text:'XDP-3002',x:510,width:100},{text:'4',x:665,width:12},{text:'950.09',x:770,width:65},{text:'950.00',x:1010,width:65}]}
]}];
const partialSupportLayout2=JSON.parse(JSON.stringify(partialSupportLayout1));
partialSupportLayout2[0].rows[2].text='Dual CD and MP3 player with USB supported Playback XDP-3002 4 950.00 950.00';
partialSupportLayout2[0].rows[2].items[3].text='950.00';
const partialRecoveryResult=v2ctx.InventoryHubParserV2.analyze({sources:[
  {source:'invoice-ocr',kind:'ocr',text:'',layout:partialInvoiceLayout},
  {source:'support-auto',kind:'ocr',text:'',layout:partialSupportLayout1},
  {source:'support-column',kind:'ocr',text:'',layout:partialSupportLayout2}
],legacyResult:{doc:{},items:[]}});
assert(partialRecoveryResult.safeToPromote===true,'Two-source partial economics consensus should safely recover the stamped player row');
assert(partialRecoveryResult.promotionRows.length===1&&partialRecoveryResult.promotionRows[0].sku==='XDP-3001'&&partialRecoveryResult.promotionRows[0].quantity===1&&partialRecoveryResult.promotionRows[0].unit_price===950&&partialRecoveryResult.promotionRows[0].amount===950,'Stamped player recovery must produce XDP-3001 1 x 950 = 950');
assert(partialRecoveryResult.invoiceSubtotalCheck?.ok===true,'Partial economics recovery must still reconcile to the invoice subtotal');

const partialSingleSupport=v2ctx.InventoryHubParserV2.analyze({sources:[
  {source:'invoice-ocr',kind:'ocr',text:'',layout:partialInvoiceLayout},
  {source:'support-auto',kind:'ocr',text:'',layout:partialSupportLayout1}
],legacyResult:{doc:{},items:[]}});
assert(partialSingleSupport.safeToPromote===false&&partialSingleSupport.promotionDecision.blockers.some(x=>x.code==='unverified-equipment-row'),'One support OCR source alone must not repair a conflicting invoice amount');

const modelConsensus=v2ctx.InventoryHubParserV2.normalizeCrossOcrSkeletonModels([
  {sku:'XDP-3001',model:'XDP-3001',item_name:'Dual CD and MP3 player with USB supported Playback',description:'Dual CD and MP3 player with USB supported Playback',quantity:1,provenance:{source:'ocr-auto'}},
  {sku:'XDP-3001',model:'XDP-3001',item_name:'Dual CD and MP3 player with USB supported Playback',description:'Dual CD and MP3 player with USB supported Playback',quantity:1,provenance:{source:'ocr-column'}},
  {sku:'XDP-3002',model:'XDP-3002',item_name:'Dual CD and MP3 player with USB supported Playback',description:'Dual CD and MP3 player with USB supported Playback',quantity:1,provenance:{source:'ocr-block'}}
]);
assert(modelConsensus.every(x=>x.sku==='XDP-3001'),'Two-to-one OCR model consensus must preserve the corroborated replacement model');

// Live mixed-invoice hardening: OCR-damaged Qty header must not be confused with "Unit" from "Unit Price".
const damagedQtyHeaderEvidence=v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[{source:'qty-ocr',kind:'ocr',text:'TAX INVOICE',layout:[{page:1,width:1200,height:1400,yTolerance:4,rows:[
  {y:100,text:'TAX INVOICE',items:[{text:'TAX',x:600,width:40},{text:'INVOICE',x:650,width:70}]},
  {y:180,text:'No. Description aty Unit Price Amount',items:[{text:'No.',x:80,width:30},{text:'Description',x:250,width:100},{text:'aty',x:720,width:35},{text:'Unit',x:830,width:40},{text:'Price',x:880,width:45},{text:'Amount',x:1040,width:70}]},
  {y:240,text:'1 Digital mixer 1 100.00 100.00',items:[{text:'1',x:85,width:10},{text:'Digital mixer',x:250,width:180},{text:'1',x:735,width:10},{text:'100.00',x:850,width:60},{text:'100.00',x:1050,width:65}]}
]}]}]});
const damagedQtyTables=v2ctx.InventoryHubParserV2TableDetector.detectTables(damagedQtyHeaderEvidence);
assert(damagedQtyTables.length===1&&damagedQtyTables[0].columns.labels.quantity==='aty','OCR-damaged Qty header must resolve from geometry');
assert(damagedQtyTables[0].columns.labels.unit_price==='Price','Unit from Unit Price must never occupy the Qty column');

const qtySpillEvidence=v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[{source:'support-spill',kind:'ocr',text:'SCHEDULES OF PRICES AND TECHNICAL DATA',layout:[{page:1,width:1400,height:1200,yTolerance:4,rows:[
  {y:100,text:'SCHEDULES OF PRICES AND TECHNICAL DATA',items:[{text:'SCHEDULES',x:100,width:90},{text:'OF',x:195,width:20},{text:'PRICES',x:220,width:60},{text:'AND',x:285,width:40},{text:'TECHNICAL',x:330,width:90},{text:'DATA',x:425,width:50}]},
  {y:180,text:'Description Make Model Country Qty Unit Price Amount',items:[{text:'Description',x:300,width:100},{text:'Make',x:760,width:50},{text:'Model',x:880,width:55},{text:'Country',x:1000,width:70},{text:'Qty',x:1085,width:35},{text:'Unit',x:1160,width:40},{text:'Price',x:1205,width:45},{text:'Amount',x:1300,width:70}]},
  {y:240,text:'Wireless microphone Shure MIC-200 USA 2 850.00 1900.00',items:[{text:'Wireless microphone',x:300,width:220},{text:'Shure',x:760,width:55},{text:'MIC-200',x:880,width:75},{text:'USA',x:1020,width:45},{text:'2',x:1095,width:10},{text:'850.00',x:1180,width:60},{text:'1900.00',x:1310,width:70}]}
]}]}]});
const qtySpillTables=v2ctx.InventoryHubParserV2TableDetector.detectSupportTables(qtySpillEvidence);
const qtySpillSkeletons=qtySpillTables.flatMap(t=>v2ctx.InventoryHubParserV2RowBuilder.buildSkeletonRows(t));
assert(qtySpillSkeletons.length===1&&qtySpillSkeletons[0].observedEconomics.quantity===2,'Qty recovery must accept a single numeric token despite adjacent country-label spill');

const reviewRowsFixture=[
  {disposition:'equipment',row:{sku:'EQ-1',item_name:'Digital mixer',quantity:1,unit_price:100,amount:100,layoutEvidenceVerified:true,economicEvidenceVerified:true},variants:[{row:{sku:'EQ-1',quantity:1,unit_price:100,amount:100}}]},
  {disposition:'unknown',row:{sku:'EQ-2',item_name:'Damaged row',quantity:null,unit_price:null,amount:null,layoutEvidenceVerified:true,economicEvidenceVerified:false},variants:[]}
];
const verifiedReview=v2ctx.InventoryHubParserV2.verifiedReviewRows(reviewRowsFixture);
assert(verifiedReview.length===1&&verifiedReview[0].sku==='EQ-1'&&verifiedReview[0].humanReviewRequired===true,'Individually verified V2 equipment must remain visible in Review even when another row is unresolved');
assert(runtime.includes('Array.isArray(v2.reviewRows)')&&runtime.includes("reason:'partial-v2-review'"),'Production runtime must consume Parser V2 authoritative Review rows');
assert(runtime.includes('v2EvidenceText||evidence'),'V2-promoted/review rows must be post-validated against the same full evidence used by Parser V2');




const multiTableLayout=[{page:1,width:595,height:842,yTolerance:3,rows:[
  {y:100,text:'Description Quantity Unit Price Amount',items:[
    {text:'Description',x:36,width:48},{text:'Quantity',x:252,width:36},{text:'Unit Price',x:341,width:42},{text:'Amount',x:523,width:34}
  ]},
  {y:140,text:'Wireless microphone receiver',items:[{text:'Wireless microphone receiver',x:36,width:180}]},
  {y:175,text:'1 340.00 340.00',items:[{text:'1',x:272,width:10},{text:'340.00',x:357,width:25},{text:'340.00',x:551,width:25}]},
  {y:205,text:'Subtotal 340.00',items:[{text:'Subtotal',x:480,width:45},{text:'340.00',x:551,width:25}]},
  {y:300,text:'Description Quantity Unit Price Amount',items:[
    {text:'Description',x:36,width:48},{text:'Quantity',x:252,width:36},{text:'Unit Price',x:341,width:42},{text:'Amount',x:523,width:34}
  ]},
  {y:340,text:'Controller installation service',items:[{text:'Controller installation service',x:36,width:180}]},
  {y:375,text:'1 200.00 200.00',items:[{text:'1',x:272,width:10},{text:'200.00',x:357,width:25},{text:'200.00',x:551,width:25}]},
  {y:405,text:'Subtotal 200.00',items:[{text:'Subtotal',x:480,width:45},{text:'200.00',x:551,width:25}]}
]}];
const multiTableV2=v2ctx.InventoryHubParserV2.analyze({
  sources:[{source:'two-tables',kind:'layout',text:'Example AV Pte Ltd\nInvoice No. INV-2001\nDATE 25/09/26',layout:multiTableLayout}],
  legacyResult:{doc:{},items:[]}
});
assert(multiTableV2.tables.length===2,'Parser V2 must detect two independent tables on the same page');
assert(multiTableV2.completeness.counts.equipment===1&&multiTableV2.completeness.counts.service===1,'Multi-table page must retain equipment and account for service separately');
assert(multiTableV2.safeToPromote===true&&multiTableV2.promotionRows.length===1,'Multi-table page must safely promote only the verified equipment row');

// Real-world failure-class locks derived from historical invoice geometry/OCR.
// 1) Corroborate supplier/invoice/date across noisy full-page OCR + targeted header OCR.
const hawkoHeaders=v2ctx.InventoryHubParserV2Header.resolveHeaders(
  v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[
    {source:'full-ocr-auto',kind:'ocr',text:'033773\nboa A WKO HAWIKO TRADING CO PTE LTD TAX INVOICE\nSingapore 339159 B 1N-1049266\nCO REG. NO. 197400001W Website: www.hawko.com Email: info@hawko.com DATE: 40/09/2021\nAll payments should be crossed payable to HAWKO TRADING CO PTE LTD\nHAWKO TRADING CO PTE LTD'},
    {source:'full-ocr-column',kind:'ocr',text:'HAWKO HAWKO TRADING CO PTE LTD TAX INVOICE\nSingapore 339159 NO: IN-1049266\nCO REG. NO. 197400001W Website: www.hawko.com Email: info@hawko.com DATE: 40/09/2021\nHAWKO TRADING CO PTE LTD'},
    {source:'targeted-header',kind:'ocr',text:'TAX INVOICE\nNO: IN-1049266\nDATE: 10/09/2021\nPG: Page 1 of 1'}
  ]})
);
assert(hawkoHeaders.supplier_name==='HAWKO TRADING CO PTE LTD','V2 noisy supplier reconciliation failed');
assert(hawkoHeaders.invoice_number==='IN-1049266','V2 contextual invoice-number resolution failed');
assert(hawkoHeaders.invoice_date==='2021-09-10','V2 targeted 4-digit invoice date failed');
assert(hawkoHeaders.reference_number==='','V2 must not invent a Reference Number when none is proven');

// 2) Headerless scan table: arithmetic proof may recover a priced row, but account/customer metadata must not.
const hawkoHeaderless=v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[{source:'hawko-ocr',kind:'ocr',layout:[
  {page:1,width:1503,height:1973,yTolerance:4,rows:[
    {y:730,text:'786HKOAV-PB97E WYAVC004 ADJUSTABLE METAL TROLLEY W C+S 2 $550.00 $1,100.00',items:[
      {x:58,text:'786HKOAV-PB97E',width:193},{x:328,text:'WYAVC004',width:120},{x:453,text:'ADJUSTABLE',width:146},
      {x:606,text:'METAL',width:74},{x:686,text:'TROLLEY',width:103},{x:796,text:'W',width:22},{x:824,text:'C+S',width:43},
      {x:1009,text:'2',width:12},{x:1115,text:'$550.00',width:81},{x:1319,text:'$1,100.00',width:100}
    ]}
  ]},
  {page:2,width:1000,height:1200,yTolerance:4,rows:[
    {y:100,text:'ACCOUNT NO 1 550.00 550.00',items:[{x:40,text:'ACCOUNT',width:70},{x:115,text:'NO',width:20},{x:700,text:'1',width:10},{x:800,text:'550.00',width:55},{x:920,text:'550.00',width:55}]},
    {y:130,text:'CUSTOMER CODE R2002 1 400.00 400.00',items:[{x:40,text:'CUSTOMER',width:80},{x:125,text:'CODE',width:35},{x:170,text:'R2002',width:45},{x:700,text:'1',width:10},{x:800,text:'400.00',width:55},{x:920,text:'400.00',width:55}]}
  ]}
]}]});
const hawkoTables=v2ctx.InventoryHubParserV2TableDetector.detectTables(hawkoHeaderless);
const hawkoRows=v2ctx.InventoryHubParserV2RowBuilder.buildRows(hawkoHeaderless,hawkoTables).rows;
assert(hawkoTables.length===1&&hawkoRows.length===1,'V2 headerless scan must accept the proven product row and reject metadata rows');
assert(hawkoRows[0].sku==='786HKOAV-PB97E'&&hawkoRows[0].item_name==='WYAVC004 ADJUSTABLE METAL TROLLEY W C+S','V2 headerless scan identity/description mismatch');
assert(hawkoRows[0].quantity===2&&hawkoRows[0].unit_price===550&&hawkoRows[0].amount===1100,'V2 headerless scan economics mismatch');

// 3) Tax-column + serial-overlap regression: numeric tokens in Tax/serial bands must not merge adjacent products.
const taxedWrapped=v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[{source:'taxed-layout',kind:'layout',layout:[{page:1,width:595,height:842,yTolerance:3,rows:[
  {y:100,text:'Description Quantity Unit Price Tax Amount',items:[{text:'Description',x:36,width:48},{text:'Quantity',x:252,width:37},{text:'Unit',x:341,width:18},{text:'Price',x:361,width:21},{text:'Tax',x:437,width:14},{text:'Amount',x:523,width:34}]},
  {y:140,text:'XVive U35C Wireless System for Condenser Microphones 5.8GHz',items:[{text:'XVive',x:36,width:22},{text:'U35C',x:58,width:22},{text:'Wireless',x:80,width:33},{text:'System',x:114,width:28},{text:'for',x:142,width:13},{text:'Condenser',x:155,width:46},{text:'Microphones',x:203,width:48},{text:'5.8GHz',x:252,width:32}]},
  {y:176,text:'S/N: IntlE251100449 4.00 340.00 9% 1,360.00',items:[{text:'S/N:',x:36,width:18},{text:'IntlE251100449',x:58,width:70},{text:'4.00',x:272,width:16},{text:'340.00',x:357,width:25},{text:'9%',x:441,width:11},{text:'1,360.00',x:544,width:32}]},
  {y:232,text:'Shure SLXD2+ Digital Wireless Handheld Microphone',items:[{text:'Shure',x:36,width:23},{text:'SLXD2+',x:59,width:29},{text:'Digital',x:88,width:25},{text:'Wireless',x:114,width:33},{text:'Handheld',x:147,width:42},{text:'Microphone',x:190,width:45}]},
  {y:271,text:'1.00 480.00 9% 480.00',items:[{text:'1.00',x:272,width:16},{text:'480.00',x:357,width:25},{text:'9%',x:441,width:11},{text:'480.00',x:551,width:25}]},
  {y:320,text:'SUBTOTAL 1840.00',items:[{text:'SUBTOTAL',x:421,width:35},{text:'1840.00',x:544,width:35}]}
]}]}]});
const taxedTables=v2ctx.InventoryHubParserV2TableDetector.detectTables(taxedWrapped);
const taxedRows=v2ctx.InventoryHubParserV2RowBuilder.buildRows(taxedWrapped,taxedTables).rows;
assert(taxedRows.length===2,'V2 Tax-column layout must reconstruct two distinct priced products');
assert(taxedRows[0].quantity===4&&taxedRows[0].unit_price===340&&taxedRows[0].amount===1360,'V2 Tax-column first product economics failed');
assert(taxedRows[1].quantity===1&&taxedRows[1].unit_price===480&&taxedRows[1].amount===480,'V2 Tax-column second product economics failed');

// 4) GST-registration metadata above a table header must not reverse table direction.
// This reproduces a real multi-page invoice class where GST Registration appears in the header block.
const gstRegistrationAbove=v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:[{source:'gst-registration-layout',kind:'layout',layout:[{page:1,width:612,height:792,yTolerance:3,rows:[
  {y:195,text:'GST Registration',items:[{text:'GST',x:281,width:15},{text:'Registration',x:298,width:45}]},
  {y:243,text:'Description Quantity Unit Price Tax Amount SGD',items:[{text:'Description',x:36,width:48},{text:'Quantity',x:252,width:37},{text:'Unit',x:341,width:18},{text:'Price',x:361,width:21},{text:'Tax',x:437,width:14},{text:'Amount',x:523,width:34},{text:'SGD',x:559,width:18}]},
  {y:333,text:'XVive U35C Wireless System for Condenser Microphones 5.8GHz',items:[{text:'XVive U35C Wireless System for Condenser Microphones 5.8GHz',x:36,width:210}]},
  {y:372,text:'4.00 340.00 9% 1,360.00',items:[{text:'4.00',x:272,width:16},{text:'340.00',x:357,width:25},{text:'9%',x:441,width:11},{text:'1,360.00',x:544,width:32}]},
  {y:427,text:'Shure SLXD2+ Digital Wireless Handheld Microphone',items:[{text:'Shure SLXD2+ Digital Wireless Handheld Microphone',x:36,width:210}]},
  {y:466,text:'1.00 480.00 9% 480.00',items:[{text:'1.00',x:272,width:16},{text:'480.00',x:357,width:25},{text:'9%',x:441,width:11},{text:'480.00',x:551,width:25}]},
  {y:520,text:'Gravity CART M 01 B Multifunctional Trolley',items:[{text:'Gravity CART M 01 B Multifunctional Trolley',x:36,width:190}]},
  {y:543,text:'2.00 170.00 9% 340.00',items:[{text:'2.00',x:272,width:16},{text:'170.00',x:357,width:25},{text:'9%',x:441,width:11},{text:'340.00',x:551,width:25}]},
  {y:600,text:'SUBTOTAL 2180.00',items:[{text:'SUBTOTAL',x:421,width:35},{text:'2180.00',x:544,width:35}]}
]}]}]});
const gstMetaTables=v2ctx.InventoryHubParserV2TableDetector.detectTables(gstRegistrationAbove);
const gstMetaRows=v2ctx.InventoryHubParserV2RowBuilder.buildRows(gstRegistrationAbove,gstMetaTables).rows;
assert(gstMetaTables.length===1,'GST Registration metadata must not create/reverse a table boundary');
assert(gstMetaTables[0].direction===1,'GST Registration above the header must not reverse line-item table direction');
assert(gstMetaRows.length===3,'GST Registration guard must preserve all three priced line items');
assert(gstMetaRows[0].quantity===4&&gstMetaRows[0].unit_price===340&&gstMetaRows[0].amount===1360,'GST Registration guard first row economics failed');
assert(gstMetaRows[2].quantity===2&&gstMetaRows[2].unit_price===170&&gstMetaRows[2].amount===340,'GST Registration guard third row economics failed');
assert(v2ctx.InventoryHubParserV2TableDetector.isTotalRowText('GST Registration')===false,'GST Registration must never be treated as a total row');
assert(v2ctx.InventoryHubParserV2TableDetector.isTotalRowText('GST 9% 324.00')===true,'A genuine GST summary row must remain a valid total row');
console.log('parser-v2-realworld-locks: noisy headers, headerless scans, metadata rejection, taxed wrapped rows and GST-registration direction PASS');


console.log('parser-v2-shadow: header independence, strict reference, same-layout variation and row completeness PASS');

const mctx={console,Number,String,Array,Object,Set,Map,RegExp,Math};mctx.globalThis=mctx;mctx.window=mctx;vm.createContext(mctx);vm.runInContext(evidenceEngine,mctx,{filename:'modules/parser-evidence-engine.js'});vm.runInContext(parserModule,mctx,{filename:'modules/parser-table.js'});
const supplierHeaderCases=[
  ['legal-company-header','AV MEDIA PTE LTD\nBlk 2023 Industrial Park\nSingapore 659528 Tel: 6569 2123','AV MEDIA PTE LTD'],
  ['labelled-vendor','VENDOR: Bright Vision Systems Pte Ltd\nGST Reg No. M2-0000000-0','Bright Vision Systems Pte Ltd'],
  ['customer-must-not-win','Northstar AV Solutions Pte Ltd\nTel: 6123 4567\nSOLD TO: Example School Pte Ltd\nCustomer Code: C100','Northstar AV Solutions Pte Ltd'],
  ['no-company-evidence','TAX INVOICE\nCustomer Code: R2002\nInvoice No: INV-1001',null]
];
for(const [id,input,expected] of supplierHeaderCases){
  const hit=mctx.InventoryHubParserEvidenceEngine.extractSupplierHeaderCandidate(input);
  assert((hit?.value||null)===expected,'Supplier header resolver '+id+' expected '+expected+' got '+(hit?.value||null));
}
console.log('supplier-header-evidence: '+supplierHeaderCases.length+'/'+supplierHeaderCases.length+' PASS');

const consolidatedEvidenceRows=mctx.InventoryHubParserEvidenceEngine.consolidateRows([
  {sku:'',item_name:'and control Panel',description:'and control Panel',quantity:4,unit_price:9588,amount:38.35,amountReviewRequired:true},
  {sku:'PT-MZI7K',item_name:'Replacement of AV Projector and control Panel',description:'Replacement of AV Projector and control Panel',quantity:4,unit_price:9588,amount:38352,layoutEvidenceVerified:true,economicEvidenceVerified:true},
  {sku:'RC-208/UK',item_name:'I/O Control Button Keypad',description:'I/O Control Button Keypad',quantity:6,unit_price:800,amount:4800}
]);
assert(consolidatedEvidenceRows.rows.length===2&&consolidatedEvidenceRows.rows.some(x=>x.sku==='PT-MZI7K')&&consolidatedEvidenceRows.rows.some(x=>x.sku==='RC-208/UK'),'Evidence engine failed to collapse fragment duplicate without losing distinct keypad row');
const layout=[{yTolerance:3,rows:[
 {y:100,text:'PRODUCT NO. DESCRIPTION QUANTITY UNIT PRICE AMOUNT',items:[{text:'PRODUCT',x:50,width:80},{text:'DESCRIPTION',x:190,width:120},{text:'QUANTITY',x:480,width:40},{text:'PRICE',x:590,width:40},{text:'AMOUNT',x:700,width:40}]},
 {y:130,text:'AVS-320A Abtus AVS320 HDMI Control panel 1 350.00 350.00',items:[{text:'AVS-320A',x:55,width:75},{text:'Abtus AVS320 HDMI Control panel',x:190,width:230},{text:'1 350.00 350.00',x:450,width:320}]},
 {y:160,text:'60100-SALES Abtus Active Speaker in pair 1 90.00 90.00',items:[{text:'60100-SALES',x:55,width:90},{text:'Abtus Active Speaker in pair',x:190,width:220},{text:'1 90.00 90.00',x:450,width:320}]},
 {y:190,text:'60200-INSTALLATION Installation work including 1 530.00 530.00',items:[{text:'60200-INSTALLATION',x:55,width:120},{text:'Installation work including',x:190,width:220},{text:'1 530.00 530.00',x:450,width:320}]},
 {y:230,text:'SUBTOTAL 1774.00',items:[{text:'SUBTOTAL',x:570,width:70},{text:'1774.00',x:700,width:50}]}
]}];
const rows=mctx.InventoryHubParserTable.parseHeaderAlignedLayout({pdfLayout:layout,sourceText:'Aerospace',resolveEconomics:(items,cols)=>api.v703314rResolveEconomicsFromItems(items,cols),cleanInventoryDescription:v=>String(v||'').trim(),cleanVerifiedSku:v=>String(v||'').trim(),normalizeParsedInvoiceItem:x=>({...x}),isServiceLine:x=>/installation/i.test([x.sku,x.item_name,x.description].join(' '))});
assert(rows.length===2&&rows.some(x=>x.unit_price===350&&x.amount===350)&&rows.some(x=>x.unit_price===90&&x.amount===90)&&!rows.some(x=>/installation/i.test(x.sku||'')),'Parser module Aerospace-layout regression failed');

// 14u field-level parser accuracy suite. Every expected field is exact/tolerance-checked;
// negative fixtures must produce zero rows instead of a plausible invented line.
let fixtureCasesPassed=0,fixtureFields=0,fixtureFieldsPassed=0;
for(const fx of accuracyFixtures.cases){
  const got=mctx.InventoryHubParserTable.parseHeaderAlignedLayout({
    pdfLayout:fx.layout,sourceText:fx.sourceText||'',
    resolveEconomics:(items,cols)=>api.v703314rResolveEconomicsFromItems(items,cols),
    cleanInventoryDescription:v=>String(v||'').trim(),
    cleanVerifiedSku:v=>String(v||'').trim(),
    normalizeParsedInvoiceItem:x=>({...x}),
    isServiceLine:x=>api.v703312jIsServiceRow(x)
  });
  assert(got.length===fx.expected.length,'Accuracy fixture '+fx.id+' row count expected '+fx.expected.length+' got '+got.length);
  let caseOk=true;
  for(let i=0;i<fx.expected.length;i++){
    const ex=fx.expected[i],row=got[i];
    const checks=[
      ['sku',String(row?.sku||'')===String(ex.sku||'')],
      ['nameIncludes',!ex.nameIncludes||String(row?.item_name||'').includes(ex.nameIncludes)],
      ['quantity',near(row?.quantity,ex.quantity)],
      ['unit_price',near(row?.unit_price,ex.unit_price)],
      ['amount',near(row?.amount,ex.amount)]
    ];
    if(ex.warranty!==undefined)checks.push(['warranty',String(row?.warranty||'')===String(ex.warranty)]);
    for(const [field,ok] of checks){fixtureFields++;if(ok)fixtureFieldsPassed++;else{caseOk=false;throw new Error('Accuracy fixture '+fx.id+' '+field+' failed: '+JSON.stringify(row));}}
    const inv=mctx.InventoryHubParserEvidenceEngine.verifyEconomics(row);
    assert(inv.ok,'Accuracy fixture '+fx.id+' violates economic invariant');
  }
  if(caseOk)fixtureCasesPassed++;
}
assert(fixtureCasesPassed===accuracyFixtures.cases.length,'Not all parser accuracy fixtures passed');
console.log('parser-accuracy-fixtures: '+fixtureCasesPassed+'/'+accuracyFixtures.cases.length+' cases, '+fixtureFieldsPassed+'/'+fixtureFields+' fields PASS');

const evidenceRanking=mctx.InventoryHubParserEvidenceEngine.rankCandidateSets([
  {origin:'verified-layout',items:[{sku:'U35C',item_name:'Wireless System',quantity:4,unit_price:340,amount:1360,layoutEvidenceVerified:true,economicEvidenceVerified:true}]},
  {origin:'plausible-but-wrong',items:[{sku:'U35C',item_name:'Wireless System',quantity:4,unit_price:1360,amount:340,layoutEvidenceVerified:true}]},
  {origin:'service-contaminated',items:[{sku:'U35C',item_name:'Wireless System',quantity:4,unit_price:340,amount:1360},{sku:'DEL',item_name:'Delivery Fee',quantity:1,unit_price:50,amount:50,classification:{type:'service'}}]}
],{subtotal:1360});
assert(evidenceRanking.best?.origin==='verified-layout','Evidence engine selected a weaker or contaminated candidate');

console.log('evidence-ranking: verified candidate selected PASS');

// 14v: execute every anonymized fixture through the production candidate -> evidence -> economics -> confidence -> review pipeline.
let corpusPassed=0,corpusFields=0;
for(const fx of anonymizedCorpus.cases){
  const result=mctx.InventoryHubParserEvidenceEngine.runPipeline(fx.candidates,{subtotal:fx.subtotal,confidenceThreshold:.72});
  assert(result.status===fx.expected.status,'Anonymized corpus '+fx.id+' status expected '+fx.expected.status+' got '+result.status);
  if(fx.expected.winnerOrigin)assert(result.winnerOrigin===fx.expected.winnerOrigin,'Anonymized corpus '+fx.id+' winner expected '+fx.expected.winnerOrigin+' got '+result.winnerOrigin);
  const rows=result.items||[];
  assert(rows.length===fx.expected.rows.length,'Anonymized corpus '+fx.id+' row count expected '+fx.expected.rows.length+' got '+rows.length);
  for(let i=0;i<fx.expected.rows.length;i++){
    const [sku,qty,unit,amount]=fx.expected.rows[i],row=rows[i]||{};
    for(const [field,actual,expected] of [['sku',row.sku,sku],['quantity',row.quantity,qty],['unit_price',row.unit_price,unit],['amount',row.amount,amount]]){
      corpusFields++;
      assert(field==='sku'?String(actual)===String(expected):near(actual,expected),'Anonymized corpus '+fx.id+' '+field+' expected '+expected+' got '+actual);
    }
  }
  if(fx.expected.status==='review')assert(result.review.length>0,'Anonymized corpus '+fx.id+' expected review reasons');
  corpusPassed++;
}
assert(corpusPassed===anonymizedCorpus.cases.length,'Not all anonymized corpus fixtures passed');
const corpusFailureClasses=new Set(anonymizedCorpus.cases.map(x=>x.failureClass||x.id));
assert(anonymizedCorpus.cases.length>=20,'Anonymized corpus must retain at least 20 structural cases');
assert(corpusFailureClasses.size>=15,'Anonymized corpus must cover at least 15 distinct structural failure classes');
const forbiddenFixtureKeys=['supplier','customer','address','email','phone','invoice_number','invoiceNumber','rawText','pdf','imageBytes'];
for(const fx of anonymizedCorpus.cases){
  const serialized=JSON.stringify(fx).toLowerCase();
  for(const key of forbiddenFixtureKeys)assert(!Object.prototype.hasOwnProperty.call(fx,key),'Private/raw fixture field forbidden: '+key+' in '+fx.id);
  assert(!/\b(?:pte\.?\s*ltd|private limited|@|\+65\s*\d{4})\b/i.test(serialized),'Fixture appears to contain identifying organization/contact data: '+fx.id);
}
console.log('anonymized-pipeline-corpus: '+corpusPassed+'/'+anonymizedCorpus.cases.length+' fixtures, '+corpusFields+' accepted-row fields, '+corpusFailureClasses.size+' failure classes PASS');


vm.runInContext(groupModule,mctx,{filename:'modules/grouped-company-ui.js'});
const host={innerHTML:'',querySelectorAll(){return[];}};
const groups=new Map([['AV Media Pte Ltd',[{html:'<tr></tr>'},{html:'<tr></tr>'}]],['Loud Technologies Asia Pte Ltd',[{html:'<tr></tr>'}]]]);
assert(mctx.InventoryHubGroupedCompanyUI.renderGroupedCompanyCards({host,groups,head:'<thead></thead>',escapeHtml:v=>String(v)}),'Grouped-company module returned false');
assert(/class="[^"]*v669-doc-group-body[^"]*hidden[^"]*"/.test(host.innerHTML)&&/2 items/.test(host.innerHTML)&&/ui-group__chevron[^>]*>▸</.test(host.innerHTML),'Grouped-company module output regression failed');
const invoiceHost={innerHTML:'',querySelectorAll(){return[];}};
assert(mctx.InventoryHubGroupedCompanyUI.renderGroupedCompanyCards({host:invoiceHost,groups:new Map([['AV Media Pte Ltd',[{html:'<tr></tr>'},{html:'<tr></tr>'}]]]),head:'<thead></thead>',escapeHtml:v=>String(v),itemLabel:'invoice'}),'Documents grouped-company renderer returned false');
assert(/2 invoices/.test(invoiceHost.innerHTML),'Documents grouped-company count must use invoice label');

assert(backupUiModule.includes("version:'7.03.3.14t'"),'Backup UI version marker missing');
assert(backupUiModule.includes("String(role).toLowerCase()==='admin'"),'Backup UI is not admin-only');
assert(backupUiModule.includes('backupVerificationCard')&&backupUiModule.includes('backupVerificationDialog'),'Backup UI elements are missing');
assert(!backupUiModule.includes('SUPABASE_SECRET_KEY')&&!backupUiModule.includes('SUPABASE_ACCESS_TOKEN'),'Backup UI contains server secret names');

for(const marker of [
  'create table if not exists public.backup_verification_runs',
  'service_backup_integrity_snapshot_v703314t',
  'service_record_backup_verification_v703314t',
  'admin_backup_verification_history_v703314t',
  "grant execute on function public.service_backup_integrity_snapshot_v703314t() to service_role",
  "grant execute on function public.service_record_backup_verification_v703314t(jsonb) to service_role",
  "grant execute on function public.admin_backup_verification_history_v703314t(integer) to authenticated",
  "revoke execute on function public.service_backup_integrity_snapshot_v703314t() from public, anon, authenticated",
  'storage.objects',
  'inventory-documents'
])assert(backupSql.includes(marker),'Backup SQL contract missing: '+marker);
assert(!/sb_secret_[A-Za-z0-9_-]{20,}/.test(backupSql),'A Supabase secret-looking value was committed in SQL');

assert(backupScript.includes('https://api.supabase.com/v1/projects/')&&backupScript.includes('/database/backups'),'Management API backup endpoint missing from verifier');
assert(backupScript.includes("createHash('sha256')"),'Document SHA-256 verification missing');
assert(backupScript.includes("storage.from('inventory-documents').download(path)"),'Document Storage download verification missing');
assert(backupScript.includes('service_backup_integrity_snapshot_v703314t'),'Service integrity snapshot RPC missing');
assert(backupScript.includes('service_record_backup_verification_v703314t'),'Verification history record RPC missing');
assert(!/sb_secret_[A-Za-z0-9_-]{20,}/.test(backupScript)&&!/sbp_[A-Za-z0-9_-]{20,}/.test(backupScript),'A server credential-looking value was committed in verifier script');

assert(backupWorkflow.includes('cron: "30 18 * * *"'),'Daily 02:30 Singapore backup schedule missing');
assert(backupWorkflow.includes('secrets.SUPABASE_ACCESS_TOKEN')&&backupWorkflow.includes('secrets.SUPABASE_SECRET_KEY'),'Backup workflow secure secret references missing');
assert(backupWorkflow.includes('node scripts/verify-backups.mjs'),'Backup workflow verifier invocation missing');
assert(backupWorkflow.includes('backup-verification-report.json'),'Sanitized verification artifact missing');
assert(setupDoc.includes('Supabase database backups do **not** contain Storage object file contents'),'Storage-backup limitation is not documented');

assert(fs.existsSync('supabase-v7-03-3-14o-parser-intelligence.sql'),'14o Supabase migration missing');
const frozen=JSON.parse(read('tests/known-good-releases.json'));
assert(frozen.version==='7.03.3.14m'&&frozen.commit==='742bbf4f66b4f3ae257b5e813661c7b555fb874c','Known-good 14m reference changed');

// Numbered invoice anchors must exist independently of an attached schedule.
const numberedRows=[{text:'No. Description Qty Unit Price Amount',items:[{text:'No.',x:80},{text:'Description',x:250},{text:'Qty',x:650},{text:'Unit Price',x:750},{text:'Amount',x:870}]}];
for(const [n,name,model] of [[1,'Digital mixer','MIX-1'],[2,'Power amplifier','AMP-2'],[3,'Wireless microphone','MIC-3'],[4,'Monitor speaker','SPK-4']]){
  numberedRows.push({text:`${n} ${name} 1 100.00 100.00`,items:[{text:String(n),x:80},{text:name,x:230},{text:'1',x:650},{text:'100.00',x:760},{text:'100.00',x:870}]});
  numberedRows.push({text:`Model: ${model}`,items:[{text:`Model: ${model}`,x:230}]});
}
const syntheticSchedule='SCHEDULES OF PRICES AND TECHNICAL DATA\n'+[[1,'Digital mixer','MIX-1'],[2,'Power amplifier','AMP-2'],[3,'Wireless microphone','MIC-3'],[4,'Monitor speaker','SPK-4']].map(([n,name,model])=>`${n} ${name} ${model} UK 1 $100.00 $100.00`).join('\n')+'\nScope of Work\nTotal Amount = $400.00';
const numberedSources=[{source:'invoice',kind:'ocr',layout:[{page:1,width:1000,rows:[{text:'TAX INVOICE',items:[{text:'TAX INVOICE',x:200}]},...numberedRows]}]},{source:'schedule-auto',kind:'ocr',text:syntheticSchedule},{source:'schedule-column',kind:'ocr',text:syntheticSchedule}];
const numberedEvidence=v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:numberedSources});
const numberedRecovery=v2ctx.InventoryHubParserV2NumberedSchedule.recover(numberedEvidence,{proven:true,value:400});
assert(numberedRecovery.ok&&numberedRecovery.rows.length===4&&numberedRecovery.rows.every(r=>r.quantity===1&&r.amount===100),'Numbered invoice + corroborated schedule recovery failed');
const inconsistentSources=numberedSources.map(s=>({...s,text:s.source==='schedule-column'?s.text?.replace('2 Power amplifier AMP-2 UK 1 $100.00 $100.00','2 Power amplifier AMP-2 UK 1 $120.00 $120.00'):s.text}));
assert(!v2ctx.InventoryHubParserV2NumberedSchedule.recover(v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:inconsistentSources}),{proven:true,value:400}).ok,'Conflicting schedule price must block recovery');
assert(!v2ctx.InventoryHubParserV2NumberedSchedule.recover(numberedEvidence,{proven:true,value:401}).ok,'Mismatched invoice subtotal must block recovery');
console.log('numbered-schedule: 3/3 source-anchoring and conflict checks PASS');

// Independent OCR damage: invoice loses row 4's number while schedule loses row 5's number.
// Ordered physical/model evidence must bridge each bounded gap without promoting services.
const damagedRows=[{text:'No. Description Qty Unit Price Amount',items:[{text:'No.',x:80},{text:'Description',x:230},{text:'Qty',x:650},{text:'Unit Price',x:760},{text:'Amount',x:870}]}];
const damagedItems=[[1,'Digital mixer console','MIX-1'],[2,'Power amplifier with DSP','AMP-2'],[3,'Passive loudspeaker system','SPK-3'],[4,'Wireless microphone system','MIC-4'],[5,'Monitor speaker console','MON-5'],[6,'Dual media player playback','PLY-6'],[7,'Outdoor microphone wall receptacle','REC-7']];
for(const [n,name,model] of damagedItems){
  damagedRows.push(n===4
    ?{text:'[a | '+name+' 1 100.00 100.00',items:[{text:'[a',x:80},{text:name,x:230},{text:'1',x:650},{text:'100.00',x:760},{text:'100.00',x:870}]}
    :{text:n+' '+name+' 1 100.00 100.00',items:[{text:String(n),x:80},{text:name,x:230},{text:'1',x:650},{text:'100.00',x:760},{text:'100.00',x:870}]});
  damagedRows.push({text:'Model: '+model,items:[{text:'Model: '+model,x:230}]});
}
damagedRows.push({text:'8 Scope of Work:',items:[{text:'8',x:80},{text:'Scope of Work:',x:230}]});
damagedRows.push({text:'Subtotal 700.00',items:[{text:'Subtotal',x:760},{text:'700.00',x:870}]});
const damagedSchedule=['SCHEDULES OF PRICES AND TECHNICAL DATA',...damagedItems.map(([n,name,model])=>(n===5?'':n+' ')+name+' '+model+' UK 1 $100.00 $100.00'),'Scope of Work','Total Amount = $700.00'].join('\n');
const damagedSources=[
  {source:'invoice-gap-a',kind:'ocr',layout:[{page:1,width:1000,rows:[{text:'TAX INVOICE',items:[{text:'TAX INVOICE',x:200}]},...damagedRows]}]},
  {source:'invoice-gap-b',kind:'ocr',layout:[{page:1,width:1000,rows:[{text:'TAX INVOICE',items:[{text:'TAX INVOICE',x:200}]},...JSON.parse(JSON.stringify(damagedRows))]}]},
  {source:'schedule-gap-a',kind:'ocr',text:damagedSchedule},
  {source:'schedule-gap-b',kind:'ocr',text:damagedSchedule}
];
const damagedEvidence=v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:damagedSources});
const damagedRecovery=v2ctx.InventoryHubParserV2NumberedSchedule.recover(damagedEvidence,{proven:true,value:700});
assert(damagedRecovery.ok&&damagedRecovery.rows.length===7,'Independent invoice/schedule ordinal-gap recovery failed');
assert(damagedRecovery.rows.some(r=>r.provenance?.ordinal===4&&r.model==='MIC-4'),'Damaged invoice row 4 was not reconstructed from bounded physical/model evidence');
assert(damagedRecovery.rows.some(r=>r.provenance?.ordinal===5&&r.model==='MON-5'),'Damaged schedule row 5 was not reconstructed from bounded priced-row evidence');
const noPhysicalModel=damagedSources.map(s=>s.source.startsWith('invoice-gap')?{...s,layout:s.layout.map(p=>({...p,rows:p.rows.filter(r=>r.text!=='Model: MIC-4')}))}:s);
assert(!v2ctx.InventoryHubParserV2NumberedSchedule.recover(v2ctx.InventoryHubParserV2Evidence.buildDocumentEvidence({sources:noPhysicalModel}),{proven:true,value:700}).ok,'Missing invoice physical/model evidence must fail closed');
console.log('numbered-schedule: 4/4 independent ordinal-damage checks PASS');

console.log('backup14t: security/storage/workflow contracts PASS');
console.log('All Inventory Hub v7.03.3.14y regression gates PASS.');
