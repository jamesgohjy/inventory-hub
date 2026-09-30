const fs=require('fs'),vm=require('vm');
const V7033=require('../v7033-core.js');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const read=p=>fs.readFileSync(p,'utf8');

const ctx={console,Date,JSON,Math,Number,String,Array,Object,Set,Map,RegExp,Intl,setTimeout,clearTimeout};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);
for(const path of [
  'modules/parser-v2/evidence-model.js',
  'modules/parser-v2/table-detector.js',
  'modules/parser-v2/numbered-schedule.js',
  'modules/parser-v2/verification-gate.js',
  'modules/parser-v3/engine.js',
  'modules/parser-v4-review-bridge.js',
  'modules/parser-v4_1-shadow.js'
]) vm.runInContext(read(path),ctx,{filename:path});

const V2=ctx.InventoryHubParserV2VerificationGate;
const V3=ctx.InventoryHubParserV3;
const V4Review=ctx.InventoryHubParserV4ReviewBridge;
const V41=ctx.InventoryHubParserV41Shadow;
assert(V2?.selfTest?.().ok,'V2 self-test failed');
assert(V3?.selfTest?.().ok,'V3 self-test failed');
assert(V4Review?.selfTest?.().ok,'V4 review self-test failed');
assert(V41?.selfTest?.().ok,'V4.1 shadow self-test failed');

// Regression: source presence alone must not certify structurally weak identifiers.
{
  const raw='TAX INVOICE\nca1zr CQ12T Mixer 1 900.00 900.00';
  const result=V41.recoverRows([{sku:'ca1zr',item_name:'CQ12T Mixer',description:'CQ12T Mixer',quantity:1,unit_price:900,amount:900,provenance:{rawText:'ca1zr CQ12T Mixer 1 900.00 900.00'}}],{raw});
  assert(result.outputRows[0].sku==='CQ12T','same-row CQ12T did not replace weak OCR identifier ca1zr');
  assert(!result.outputRows[0].v41ProductionReviewRequired,'fully recovered CQ12T row should not remain blocked');
}
{
  const raw='TAX INVOICE\n88s Single Channel Digital Wireless Handheld Microphone System 1 480.00 480.00';
  const result=V41.recoverRows([{sku:'88s',item_name:'Single Channel Digital Wireless Handheld Microphone System',description:'Single Channel Digital Wireless Handheld Microphone System',quantity:1,unit_price:480,amount:480,provenance:{rawText:'88s Single Channel Digital Wireless Handheld Microphone System 1 480.00 480.00'}}],{raw});
  assert(result.outputRows[0].sku==='','weak 88s identifier survived V4.1');
  assert(result.outputRows[0].v41ProductionReviewRequired===true,'unresolved 88s identity must require review');
  assert((result.outputRows[0].v41IntegrityIssues||[]).some(x=>x.field==='sku'),'88s review did not preserve field-level integrity evidence');
}
{
  const raw='TAX INVOICE\nNeutrik Outdoor Dual Microphone Wall Receptacle 2 120.00 240.00';
  const result=V41.recoverRows([{sku:'Neutrik',item_name:'Outdoor Dual Microphone Wall Receptacle',description:'Outdoor Dual Microphone Wall Receptacle',quantity:2,unit_price:120,amount:240,provenance:{rawText:'Neutrik Outdoor Dual Microphone Wall Receptacle 2 120.00 240.00'}}],{raw});
  assert(result.outputRows[0].sku==='','brand-only Neutrik token survived as SKU/model');
  assert(result.outputRows[0].v41ProductionReviewRequired===true,'brand-only identity must require review when no model is proven');
}
{
  const raw='TAX INVOICE\nSingle Channel Digital Wireless Handheld Microphone System ol 1 480.00 480.00';
  const result=V41.recoverRows([{item_name:'Single Channel Digital Wireless Handheld Microphone System ol',description:'Single Channel Digital Wireless Handheld Microphone System ol',quantity:1,unit_price:480,amount:480,provenance:{rawText:'Single Channel Digital Wireless Handheld Microphone System ol 1 480.00 480.00'}}],{raw});
  assert(result.outputRows[0].item_name==='Single Channel Digital Wireless Handheld Microphone System','trailing OCR fragment was not trimmed from item name');
  assert(result.outputRows[0].description==='Single Channel Digital Wireless Handheld Microphone System','trailing OCR fragment was not trimmed from description');
}
{
  const raw='TAX INVOICE\n1604DSP Digital Power Amplifier with DSP 1 1200.00 1200.00';
  const result=V41.recoverRows([{sku:'1604DSP',item_name:'Digital Power Amplifier with DSP',description:'Digital Power Amplifier with DSP',quantity:1,unit_price:1200,amount:1200,provenance:{rawText:'1604DSP Digital Power Amplifier with DSP 1 1200.00 1200.00'}}],{raw});
  assert(result.outputRows[0].sku==='1604DSP','valid numeric-leading 1604DSP identifier regressed');
}

function loadExistingSupplierCases(){
  const src=read('tests/parser-v4-unseen-holdout.cjs');
  const marker='const cases=';
  const start=src.indexOf(marker);
  const end=src.indexOf('];\n\nconst key=',start);
  assert(start>=0&&end>start,'Unable to reuse V4 unseen supplier cases');
  const arr=src.slice(start+marker.length,end+1);
  return vm.runInNewContext('('+arr+')');
}
const supplierCases=loadExistingSupplierCases();
assert(supplierCases.length>=5,'Expected at least five supplier holdout cases');

function recover(raw){
  return V7033.v703314pRecoverEquipmentRows(raw,'v4.1-shadow-random-character-test');
}
async function runV4(test){
  const rows=recover(test.raw);
  const parsed={doc:{supplier_name:test.supplier,invoice_number:test.invoice},items:rows,invoiceClassification:{type:'equipment'},raw:test.raw};
  const v2=await V2.verifyParsed(parsed,{raw:test.raw,inventoryItems:[],supplierName:test.supplier,doc:parsed.doc,webVerifier:null});
  const v3=await V3.evaluate(v2.parsed,{
    fullEvidence:[{source:'holdout-native',kind:'native',text:test.raw,layout:[]}],
    inventoryItems:[],verifyGate:V2,webVerifier:null
  });
  return V4Review.materialize(v3.parsed,rows);
}
function clone(v){return JSON.parse(JSON.stringify(v));}
function rng(seed=0x41c0ffee){
  let x=seed>>>0;
  return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};
}
const random=rng();
function shuffle(a){
  const out=[...a];
  for(let i=out.length-1;i>0;i--){
    const j=Math.floor(random()*(i+1));
    [out[i],out[j]]=[out[j],out[i]];
  }
  return out;
}
function randomToken(){
  const letters='BCDFGHJKLMNPQRSTVWXYZ';
  const digits='23456789';
  const len=8+Math.floor(random()*5);
  let s='';
  for(let i=0;i<len;i++)s+=i%2===0?letters[Math.floor(random()*letters.length)]:digits[Math.floor(random()*digits.length)];
  return s;
}
function mutateRow(rows){
  assert(rows.length>0,'Cannot mutate empty V4 output');
  const out=clone(rows);
  const rowIndex=Math.floor(random()*out.length);
  const row=out[rowIndex];
  const token=randomToken();
  const variants=['replace-sku','replace-name','append-name','set-model','replace-description'];
  const variant=variants[Math.floor(random()*variants.length)];
  let field='';
  if(variant==='replace-sku'){
    field='sku';row.sku=token;
  }else if(variant==='replace-name'){
    field='item_name';row.item_name=token;
  }else if(variant==='append-name'){
    field='item_name';row.item_name=String(row.item_name||row.description||'Equipment').trim()+' '+token;
  }else if(variant==='set-model'){
    field='model';row.model=token;
  }else{
    field='description';row.description=token;
  }
  return {rows:out,rowIndex,field,token,variant};
}

(async()=>{
  const ordered=shuffle(supplierCases);
  const baselineResults=[];
  let cleanRows=0;
  for(const test of ordered){
    const v4=await runV4(test);
    const audit=V41.auditRows(v4.items||[],{
      raw:test.raw,
      sources:[{source:'holdout-native',kind:'native',text:test.raw}]
    });
    const hard=audit.hardFailures||[];
    if(hard.length){
      console.error('V4.1 BASELINE RANDOM-CHARACTER FAIL supplier='+test.supplier+' issues='+JSON.stringify(hard));
      throw new Error('Baseline supplier '+test.supplier+' produced random/untraceable line-item characters');
    }
    cleanRows+=audit.inputCount;
    baselineResults.push({supplier:test.supplier,invoice:test.invoice,rows:audit.inputCount,reviewIssues:audit.reviewIssueCount});
    console.log('V4.1 BASELINE '+test.supplier+': PASS rows='+audit.inputCount+' hardRandom=0 review='+audit.reviewIssueCount);
  }

  let mutationPass=0;
  const mutationsPerSupplier=8;
  for(const test of ordered){
    const v4=await runV4(test);
    const original=v4.items||[];
    assert(original.length>0,'No V4 line items available for random mutation: '+test.supplier);
    for(let i=0;i<mutationsPerSupplier;i++){
      const m=mutateRow(original);
      const audit=V41.auditRows(m.rows,{
        raw:test.raw,
        sources:[{source:'holdout-native',kind:'native',text:test.raw}]
      });
      const hit=(audit.hardFailures||[]).find(x=>x.rowIndex===m.rowIndex&&x.field===m.field);
      if(!hit){
        console.error('V4.1 MUTATION MISSED supplier='+test.supplier+' variant='+m.variant+' field='+m.field+' token='+m.token);
        throw new Error('Random-character mutation escaped V4.1 shadow');
      }
      assert(audit.outputRows[m.rowIndex][m.field]===''||(m.field==='serials'&&Array.isArray(audit.outputRows[m.rowIndex].serials)),
        'Flagged random field was not blanked in shadow output');
      const reAudit=V41.auditRows(audit.outputRows,{
        raw:test.raw,
        sources:[{source:'holdout-native',kind:'native',text:test.raw}]
      });
      if(reAudit.randomCharacterFailureCount!==0){
        console.error('V4.1 SELF-FIX RECHECK FAIL supplier='+test.supplier+' variant='+m.variant+' remaining='+JSON.stringify(reAudit.hardFailures));
        throw new Error('V4.1 shadow self-fix did not clear random-character failure before next test');
      }
      mutationPass++;
    }
    console.log('V4.1 RANDOMIZED '+test.supplier+': '+mutationsPerSupplier+'/'+mutationsPerSupplier+' PASS');
  }

  console.log('V4.1 SHADOW SUPPLIER BASELINE SUMMARY: '+baselineResults.length+'/'+baselineResults.length+' PASS');
  console.log('V4.1 SHADOW CLEAN LINE ITEMS: '+cleanRows+' rows, random-character failures=0');
  console.log('V4.1 RANDOM-CHARACTER MUTATION SUMMARY: '+mutationPass+'/'+(baselineResults.length*mutationsPerSupplier)+' PASS');
  console.log('V4.1 SELF-FIX RECHECK SUMMARY: '+mutationPass+'/'+mutationPass+' PASS');
  console.log('V4.1 MODE: SHADOW ONLY; production Parser V4 unchanged');
})().catch(err=>{console.error(err.stack||err);process.exit(1);});
