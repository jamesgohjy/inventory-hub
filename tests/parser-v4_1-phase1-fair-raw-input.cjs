const fs=require('fs'),vm=require('vm');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const read=p=>fs.readFileSync(p,'utf8');

// Load the actual production parser entrypoint first, then install the current V4 patch.
const AV=require('../parser-v7-core.js');
globalThis.AVParserV7=AV;
const Patch=require('../v7033-core.js');
assert(Patch.installParserPatch()===true||globalThis.AVParserV7.__v7033Installed===true,'Unable to install production V4 parser patch');

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
const V4Review=globalThis.InventoryHubParserV4ReviewBridge;
const V41=globalThis.InventoryHubParserV41Shadow;
assert(V2?.selfTest?.().ok,'V2 self-test failed');
assert(V3?.selfTest?.().ok,'V3 self-test failed');
assert(V4Review?.selfTest?.().ok,'V4 review self-test failed');
assert(V41?.selfTest?.().ok,'V4.1 shadow self-test failed');

function loadRawSupplierCases(){
  const src=read('tests/parser-v4-unseen-holdout.cjs');
  const marker='const cases=',start=src.indexOf(marker),end=src.indexOf('];\n\nconst key=',start);
  assert(start>=0&&end>start,'Unable to load raw supplier holdouts');
  const cases=vm.runInNewContext('('+src.slice(start+marker.length,end+1)+')');
  for(const t of cases){
    assert(typeof t.raw==='string'&&t.raw.trim(),'Supplier fixture must contain raw invoice text');
    assert(!Object.prototype.hasOwnProperty.call(t,'items'),'FAIRNESS FAIL: prebuilt item rows supplied for '+t.supplier);
    assert(!Object.prototype.hasOwnProperty.call(t,'rows'),'FAIRNESS FAIL: prebuilt rows supplied for '+t.supplier);
  }
  return cases;
}

const key=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]+/g,' ');
const near=(a,b)=>Math.abs(Number(a)-Number(b))<=.06;
function findExpected(rows,ex){
  const needle=key(ex.contains);
  return rows.find(r=>key([r.sku,r.model,r.item_name,r.description].filter(Boolean).join(' ')).includes(needle));
}
function scoreExpected(test,rows){
  const failures=[];
  for(const ex of test.expected||[]){
    const row=findExpected(rows,ex);
    if(!row){failures.push('missing '+ex.contains);continue;}
    if(Number(row.quantity)!==Number(ex.qty))failures.push(ex.contains+' qty expected '+ex.qty+' got '+row.quantity);
    if(!near(row.unit_price,ex.unit))failures.push(ex.contains+' unit expected '+ex.unit+' got '+row.unit_price);
    if(!near(row.amount,ex.amount))failures.push(ex.contains+' amount expected '+ex.amount+' got '+row.amount);
  }
  const allText=key(rows.map(r=>[r.sku,r.model,r.item_name,r.description].join(' ')).join(' | '));
  for(const bad of test.forbidden||[])if(allText.includes(key(bad)))failures.push('forbidden row leaked: '+bad);
  return failures;
}

async function parseRawInvoice(test){
  // FAIRNESS CONTRACT:
  // Input begins only as raw invoice text. No hand-built/post-extraction rows are passed in.
  const rawSourceRows=globalThis.AVParserV7.parseText(test.raw,'phase1-raw-native',1);
  assert(Array.isArray(rawSourceRows),'parseText did not generate source rows');
  const base={
    doc:{supplier_name:test.supplier,invoice_number:test.invoice},
    items:rawSourceRows,
    invoiceClassification:{type:'equipment'},
    raw:test.raw
  };
  const evidence=[{source:'phase1-raw-native',kind:'native',text:test.raw,page:1,layout:[]}];
  const enhanced=globalThis.AVParserV7.enhanceParsed({parsed:base,raw:test.raw,layout:[],evidenceSources:evidence});
  const v2=await V2.verifyParsed(enhanced,{
    raw:test.raw,inventoryItems:[],supplierName:test.supplier,doc:enhanced.doc||base.doc,webVerifier:null
  });
  const v3=await V3.evaluate(v2.parsed,{fullEvidence:evidence,inventoryItems:[],verifyGate:V2,webVerifier:null});
  const review=V4Review.materialize(v3.parsed,enhanced.items||[]);
  const reviewRows=review.items||[];

  // V4.1 only receives rows created above by the parser. No fixture rows are injected.
  const before=V41.auditRows(reviewRows,{raw:test.raw,sources:evidence});
  const recovered=V41.recoverRows(reviewRows,{raw:test.raw,sources:evidence});
  return {rawSourceRows,enhanced,v2,v3,review,reviewRows,before,recovered};
}

(async()=>{
  const cases=loadRawSupplierCases();
  let passes=0,totalRows=0;
  const failures=[];
  for(const test of cases){
    const result=await parseRawInvoice(test);
    const problems=scoreExpected(test,result.reviewRows);
    if(result.before.randomCharacterFailureCount!==0){
      problems.push('V4.1 flagged random/untraceable characters before recovery: '+JSON.stringify(result.before.hardFailures));
    }
    if(result.recovered.randomCharacterFailureCount!==0){
      problems.push('random characters survived V4.1 recovery: '+JSON.stringify(result.recovered.hardFailures));
    }
    // A clean Phase 1 invoice must not need random-character repair.
    if(result.recovered.targetedRecoveryCount!==0){
      problems.push('clean raw invoice unexpectedly required targeted recovery count='+result.recovered.targetedRecoveryCount);
    }
    totalRows+=result.reviewRows.length;
    const pass=problems.length===0;
    if(pass)passes++; else failures.push(test.id+': '+problems.join(' | '));
    console.log(
      'PHASE1 FAIR RAW '+test.id+': '+(pass?'PASS':'FAIL')+
      ' rawSourceRows='+result.rawSourceRows.length+
      ' reviewRows='+result.reviewRows.length+
      ' randomFlags='+result.before.randomCharacterFailureCount+
      ' targetedRecovery='+result.recovered.targetedRecoveryCount+
      (problems.length?' :: '+problems.join(' | '):'')
    );
  }
  console.log('PHASE1 FAIRNESS CONTRACT: raw invoice text only; no prebuilt/post-extraction fixture rows supplied to parser');
  console.log('PHASE1 FAIR RAW SUPPLIER SUMMARY: '+passes+'/'+cases.length+' PASS');
  console.log('PHASE1 FAIR RAW REVIEW ROWS: '+totalRows);
  console.log('PHASE1 FAIR RANDOM-CHARACTER FLAGS: '+failures.filter(x=>/random|targeted recovery/i.test(x)).length);
  if(failures.length){
    console.log('PHASE1 FAIR FAILURES:\n'+failures.join('\n'));
    process.exitCode=7;
  }
})().catch(err=>{console.error(err.stack||err);process.exit(1);});
