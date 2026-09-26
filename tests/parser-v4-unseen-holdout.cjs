const fs=require('fs'),vm=require('vm');
const V7033=require('../v7033-core.js');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const read=p=>fs.readFileSync(p,'utf8');
const ctx={console,Date,JSON,Math,Number,String,Array,Object,Set,Map,RegExp,Intl,setTimeout,clearTimeout};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);
for(const [path,name] of [
  ['modules/parser-v2/evidence-model.js','evidence'],
  ['modules/parser-v2/table-detector.js','table'],
  ['modules/parser-v2/numbered-schedule.js','schedule'],
  ['modules/parser-v2/verification-gate.js','v2'],
  ['modules/parser-v3/engine.js','v3']
]) vm.runInContext(read(path),ctx,{filename:path});

const V2=ctx.InventoryHubParserV2VerificationGate,V3=ctx.InventoryHubParserV3;
assert(V2?.selfTest?.().ok,'V2 self-test failed');
assert(V3?.selfTest?.().ok,'V3 self-test failed');

const cases=[
{
 id:'hi-long-hl26ti-0450',supplier:'HI-LONG PTE LTD',invoice:'HL26TI-0450',
 source:'public holdout — Hi-Long Pte Ltd',
 raw:`TAX INVOICE
HI-LONG PTE LTD
Invoice Number: HL26TI-0450
Invoice Date: March 7, 2026
Items Quantity Price Amount
HIKVISION NVR 4CH POE DS-7604NI-Q1/4P(D) 1 $150.00 $150.00
SUPPLY CCTV MONITOR WIDE SCREEN 21inch HDMI 1 $160.00 $160.00
HIKVISION WIDE ANGLE CAMERA DS-2CD1363G2P-LIUF/SL 6 MP 2 $180.00 $360.00
CABLE CAT6 FR 0 $150.00 $0.00
Delivery 1 $150.00 $150.00
CCTV INSTALLATION ON BOARD 1 $1,600.00 $1,600.00
CCTV COMMISSIONING ON BOARD VESSEL 1 $900.00 $900.00
Total: $3,586.00`,
 expected:[
   {contains:'NVR',qty:1,unit:150,amount:150},
   {contains:'MONITOR',qty:1,unit:160,amount:160},
   {contains:'CAMERA',qty:2,unit:180,amount:360}
 ],
 forbidden:['DELIVERY','INSTALLATION ON BOARD','COMMISSIONING','CABLE CAT6']
},
{
 id:'studio-craft-inv2329',supplier:'Studio Craft',invoice:'INV2329',
 source:'public holdout — Studio Craft',
 raw:`TAX INVOICE
Studio Craft
Invoice# INV2329
Invoice Date : 05/11/2024
Item & Description Qty Rate Amount
1 Speaker JBL 218S 2.00 43,550.00 87,100.00
2 Amplifier Crown XLi 3500 1.00 63,000.00 63,000.00
3 Speaker JBL Control 25 8.00 21,060.00 168,480.00
4 Amplifier XLi 800 2.00 27,140.00 54,280.00
5 G2 HH Dual Wireless Mic 1.00 12,554.00 12,554.00
6 JTS 21 inch Gooseneck Mic 1.00 12,550.00 12,550.00
7 DBX Speaker Processor 1.00 57,250.00 57,250.00
9 Speaker Cabling 1.00 42,500.00 42,500.00
10 connectors and accessories 1.00 18,250.00 18,250.00
11 Installation and commissioning 1.00 12,000.00 12,000.00
Sub Total 544,964.00`,
 expected:[
   {contains:'JBL 218S',qty:2,unit:43550,amount:87100},
   {contains:'CROWN XLI 3500',qty:1,unit:63000,amount:63000},
   {contains:'JBL CONTROL 25',qty:8,unit:21060,amount:168480},
   {contains:'XLI 800',qty:2,unit:27140,amount:54280},
   {contains:'WIRELESS MIC',qty:1,unit:12554,amount:12554},
   {contains:'GOOSENECK MIC',qty:1,unit:12550,amount:12550},
   {contains:'SPEAKER PROCESSOR',qty:1,unit:57250,amount:57250}
 ],
 forbidden:['CABLING','CONNECTORS AND ACCESSORIES','INSTALLATION AND COMMISSIONING']
},
{
 id:'new-ns-electronics-301',supplier:'NEW N S ELECTRONICS',invoice:'301',
 source:'public holdout — New N S Electronics',
 raw:`Tax Invoice
NEW N S ELECTRONICS
Invoice No. 301 Dated 17-Feb-24
Sl Description of Goods HSN/SAC Quantity Rate per Amount
1 DIGITEK WIRELESS MICROPHONE DWM102 85181000 1 PCS 5,254.24 PCS 5,254.24
SGST 472.88
CGST 472.88
Total 1 PCS 6,200.00`,
 expected:[{contains:'DIGITEK WIRELESS MICROPHONE',qty:1,unit:5254.24,amount:5254.24}],
 forbidden:['SGST','CGST']
},
{
 id:'designer-audio-1008',supplier:'Designer Audio India Pvt. Ltd.',invoice:'1008',
 source:'public holdout — Designer Audio India Pvt Ltd',
 raw:`TAX INVOICE
DESIGNER AUDIO INDIA PVT. LTD.
Invoice No. 1008
Dated 21-DEC-2012
Description of Goods Quantity Rate Per Amount
1 Marantz SR 7005 Pre Amplifier 1 81,700.00 81,700.00
VAT 14.5% Sales 11,846.00
Total 93,546.00`,
 expected:[{contains:'PRE AMPLIFIER',qty:1,unit:81700,amount:81700}],
 forbidden:['VAT']
},
{
 id:'dipanjali-xgimi-bom7-47',supplier:'DIPANJALI BEDI',invoice:'BOM7-47',
 source:'public holdout — XGIMI projector tax invoice',
 raw:`Tax Invoice Bill of Supply Cash Memo
Sold By DIPANJALI BEDI
Invoice Number BOM7-47
Invoice Date 02.01.2022
Description Unit Price Qty Net Amount Tax Rate Tax Amount Total Amount
1 XGIMI MOGO Pro True 1080P Smart Portable Projector B084WWPGHF PS-73Z1-5K9S 43,402.34 1 43,402.34 28% IGST 12,152.66 55,555.00
TOTAL 12,152.66 55,555.00`,
 expected:[{contains:'XGIMI MOGO',qty:1,unit:43402.34,amount:43402.34}],
 forbidden:['IGST']
}
];

const key=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]+/g,' ');
const near=(a,b)=>Math.abs(Number(a)-Number(b))<=.06;
function recover(raw){
  return V7033.v703314pRecoverEquipmentRows(raw,'v4-holdout');
}
async function runV4(test,raw=test.raw){
  const rows=recover(raw);
  const parsed={doc:{supplier_name:test.supplier,invoice_number:test.invoice},items:rows,invoiceClassification:{type:'equipment'},raw};
  const v2=await V2.verifyParsed(parsed,{raw,inventoryItems:[],supplierName:test.supplier,doc:parsed.doc,webVerifier:null});
  const v3=await V3.evaluate(v2.parsed,{fullEvidence:[{source:'holdout-native',kind:'native',text:raw,layout:[]}],inventoryItems:[],verifyGate:V2,webVerifier:null});
  const pending=v3.parsed?.v2Verification?.pending||[];
  return {parsed:v3.parsed,verified:v3.parsed.items||[],pending,rejected:v3.parsed?.v2Verification?.rejected||[],all:[...(v3.parsed.items||[]),...pending],report:v3.report};
}
function findExpected(rows,ex){
  const needle=key(ex.contains);
  return rows.find(r=>key([r.sku,r.model,r.item_name,r.description].filter(Boolean).join(' ')).includes(needle));
}
function score(test,result){
  const failures=[];
  for(const ex of test.expected){
    const row=findExpected(result.all,ex);
    if(!row){failures.push('missing '+ex.contains);continue;}
    if(Number(row.quantity)!==Number(ex.qty))failures.push(ex.contains+' qty expected '+ex.qty+' got '+row.quantity);
    if(!near(row.unit_price,ex.unit))failures.push(ex.contains+' unit expected '+ex.unit+' got '+row.unit_price);
    if(!near(row.amount,ex.amount))failures.push(ex.contains+' amount expected '+ex.amount+' got '+row.amount);
  }
  const allText=key(result.all.map(r=>[r.sku,r.item_name,r.description].join(' ')).join(' | '));
  for(const bad of test.forbidden||[])if(allText.includes(key(bad)))failures.push('forbidden row leaked: '+bad);
  const skuKeys=result.all.map(r=>V2.normalizedSkuKey(r)).filter(Boolean),dupes=skuKeys.filter((x,i)=>skuKeys.indexOf(x)!==i);
  if(dupes.length)failures.push('duplicate normalized SKU '+[...new Set(dupes)].join(','));
  return {pass:failures.length===0,failures};
}
function mutate(test,variant){
  const r=test.raw;
  switch(variant){
    case 'metadata-noise': return r.replace(/Description|Items|Item & Description/,'Supplier Address 88 Example Road Singapore 123456\nReference No REF-TEST-991\n$&');
    case 'service-noise': return r.replace(/(?:Sub Total|TOTAL|Total:)/,'Dismantle dismount install and commissioning service 1 999.00 999.00\n$&');
    case 'duplicate-row': {const line=r.split('\n').find(x=>test.expected.some(e=>key(x).includes(key(e.contains))));return line?r.replace(line,line+'\n'+line):r;}
    case 'ocr-spacing': return r.replace(/([A-Z]{2,})-([A-Z0-9])/g,'$1- $2').replace(/WIRELESS MICROPHONE/g,'WIRELESS  MICROPHONE');
    case 'header-number-noise': return 'Invoice No INV-99999\nDate 12/12/2025\nReference No 123456\n'+r;
    case 'money-conflict': {const line=r.split('\n').find(x=>test.expected.some(e=>key(x).includes(key(e.contains))));if(!line)return r;return r.replace(line,line.replace(/(\d[\d,]*\.\d{2})\s*$/,'999,999.99'));}
    default:return r;
  }
}

(async()=>{
  const baseline=[];
  for(const test of cases){
    const result=await runV4(test),s=score(test,result);
    baseline.push({id:test.id,supplier:test.supplier,pass:s.pass,failures:s.failures,verified:result.verified.length,pending:result.pending.length,rejected:result.rejected.length,v3Status:result.report?.status||''});
    console.log('V4 HOLDOUT '+test.id+': '+(s.pass?'PASS':'FAIL')+' verified='+result.verified.length+' pending='+result.pending.length+' rejected='+result.rejected.length+(s.failures.length?' :: '+s.failures.join(' | '):''));
  }
  const baselinePass=baseline.every(x=>x.pass);
  console.log('V4 HOLDOUT SUMMARY: '+baseline.filter(x=>x.pass).length+'/'+baseline.length+' PASS');
  if(!baselinePass){
    console.log('V4 MUTATION: SKIPPED — holdout baseline must reach full pass first.');
    process.exitCode=2;return;
  }
  const variants=['metadata-noise','service-noise','duplicate-row','ocr-spacing','header-number-noise','money-conflict'];
  let mutPass=0,mutTotal=0;const mutationFailures=[];
  for(const test of cases)for(const variant of variants){
    mutTotal++;const result=await runV4(test,mutate(test,variant)),s=score(test,result);
    let pass=s.pass;
    if(variant==='money-conflict'){
      // Fail closed is correct: it may keep the row only if original economics survive independently;
      // otherwise the row must become review/rejected, never silently accept 999,999.99.
      const corrupt=result.all.some(r=>near(r.amount,999999.99)||near(r.unit_price,999999.99));
      pass=!corrupt;
      if(corrupt)s.failures.push('corrupted money was silently accepted');
    }
    if(pass)mutPass++;else mutationFailures.push(test.id+' / '+variant+': '+s.failures.join(' | '));
    console.log('V4 MUTATION '+test.id+' / '+variant+': '+(pass?'PASS':'FAIL')+(s.failures.length?' :: '+s.failures.join(' | '):''));
  }
  console.log('V4 MUTATION SUMMARY: '+mutPass+'/'+mutTotal+' PASS');
  if(mutationFailures.length){console.log(mutationFailures.join('\n'));process.exitCode=3;}
})();
