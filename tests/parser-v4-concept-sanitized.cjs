const fs=require('fs'),vm=require('vm');
const V7033=require('../v7033-core.js');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const read=p=>fs.readFileSync(p,'utf8');
const ctx={console,Date,JSON,Math,Number,String,Array,Object,Set,Map,RegExp,Intl,setTimeout,clearTimeout};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);
for(const path of ['modules/parser-v2/evidence-model.js','modules/parser-v2/table-detector.js','modules/parser-v2/numbered-schedule.js','modules/parser-v2/verification-gate.js','modules/parser-v3/engine.js'])vm.runInContext(read(path),ctx,{filename:path});
const V2=ctx.InventoryHubParserV2VerificationGate,V3=ctx.InventoryHubParserV3;

const invoice=`TAX INVOICE
Supplier: CONCEPT SYSTEMS TECHNOLOGIES Pte Ltd.
Invoice No.: 2407/015
No. Description Qty Unit Price Amount
1 RE: Sound System Replacement Setup 1 1,400.00 1,400.00
Digital Mixer console. Support up to 12 channels with 7 Multi Touch Screen
Model: Allen & Heath CQ12T
2 Digital Power Amplifier with DSP 1 2,500.00 2,500.00
Model: Powersoft Duecanali 1604DSP
3 Passive Loudspeakers with mounting brackets 6 800.00 4,800.00
Model: Electrovoice ZX11-90
4 Single Channel Digital Wireless Handheld Microphone System 2 OCR-STAMP OCR-STAMP
Model: Shure SLXD24/SM58
5 Monitor Speaker at the console 1 OCR-STAMP OCR-STAMP
Model: Yamaha MS101-4
6 Dual CD and MP3 player with USB supported Playback 1 950.00 950.00
Model: Omnitronic XDP-3002
Note: replaced with XDP-3001
7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00
Model: Neutrik
SCOPE OF WORK
8 Dismantle remove old speakers AV equipment 1 1,800.00 1,800.00
9 Supply and install the new equipment 1 500.00 500.00
10 Supply and install cabling 1 300.00 300.00
11 Provide labelling and tidying cabling 1 100.00 100.00
12 System tuning calibration DSP programming 1 500.00 500.00
13 Operational training after commissioning 1 300.00 300.00
14 Installation tools and safety documents 1 800.00 800.00
Subtotal 16,500.00`;

const schedule=`SCHEDULES OF PRICES AND TECHNICAL DATA
Section 2 Technical Specifications for AV Equipment
1 Digital Mixer console Allen & Heath CQ12T UK 1 $1,400.00 $1,400.00
2 Digital Power Amplifier with DSP Powersoft Duecanali 1604DSP Italy 1 $2,500.00 $2,500.00
3 Passive Loudspeakers with mounting brackets Electrovoice ZX11-80 USA 6 $800.00 $4,800.00
4 Single Channel Digital Wireless Handheld Microphone System Shure SLXD24/SM58 USA 2 $950.00 $1,900.00
5 Monitor Speaker at the console Yamaha MS101-4 Japan 1 $200.00 $200.00
6 Dual CD and MP3 player with USB supported Playback Omnitronic XDP-3002 China 1 $950.00 $950.00
7 Supply & Install Outdoor Dual Microphone Wall Receptacle Neutrik Neutrik 1 $450.00 $450.00
SCOPE OF WORK
9.1 Dismantle remove old equipment 1 $1,800.00 $1,800.00
9.2 Supply install equipment 1 $500.00 $500.00
9.3 Supply install cabling 1 $300.00 $300.00
TOTAL AMOUNT = $16,500.00`;

const scheduleOcr=`SCHEDULES OF PRICES AND TECHNICAL DATA
1 Digital Mixer console Allen & Heath CQ12T UK 1 $1,400.00 $1,400.00
2 Digital Power Amplifier with DSP Powersoft Duecanali 1604DSP Italy 1 $2,500.00 $2,500.00
3 Passive Loudspeakers with mounting brackets Electrovoice ZX11-80 USA 6 $800.00 $4,800.00
4 Single Channel Digital Wireless Handheld Microphone System Shure SLXD24/SM58 USA 2 $950.00 $1,900.00
5 Monitor Speaker at the console Yamaha MS101-4 Japan 1 $200.00 $200.00
6 Dual CD and MP3 player with USB supported Playback Omnitronic XDP-3002 China 1 $950.00 $950.00
7 Supply & Install Outdoor Dual Microphone Wall Receptacle Neutrik Neutrik 1 $450.00 $450.00
SCOPE OF WORK
TOTAL AMOUNT = $16,500.00`;

const scheduleNoisy=`SCHEDULES OF PRICES AND TECHNICAL DATA
1 Digital Mixer console Allen & Heath CQ12T UK 1 $1,400.00 $1,400.00
2 Digital Power Amplifier with DSP Powersoft Duecanali 1604DSP Italy 1 $2,500.00 $2,500.00
3 Passive Loudspeakers with mounting brackets Electrovoice ZX11-80 USA 6 $800.00 $4,800.00
4 Single Channel Digital Wireless Handheld Microphone System Shure SLXD24/SM58 USA 2 $900.00 $1,800.00
5 Monitor Speaker at the console Yamaha MS101-4 Japan 1 $200.00 $200.00
6 Dual CD and MP3 player with USB supported Playback Omnitronic XDP-3002 China 1 $950.00 $950.00
7 Supply & Install Outdoor Dual Microphone Wall Receptacle Neutrik Neutrik 1 $450.00 $450.00
SCOPE OF WORK
TOTAL AMOUNT = $16,500.00`;

async function main(){
  const primary=V7033.v703314pRecoverEquipmentRows(invoice,'concept-invoice-native');
  console.log('V4 CONCEPT PRIMARY ROWS: '+JSON.stringify(primary.map(r=>({sku:r.sku,name:r.item_name,quantity:r.quantity,unit_price:r.unit_price,amount:r.amount}))));
  const parsed={doc:{supplier_name:'CONCEPT SYSTEMS TECHNOLOGIES Pte Ltd.',invoice_number:'2407/015',subtotal:16500,total_amount:17985},items:primary,invoiceClassification:{type:'equipment'},raw:invoice};
  const v2=await V2.verifyParsed(parsed,{raw:invoice,inventoryItems:[],supplierName:parsed.doc.supplier_name,doc:parsed.doc,webVerifier:null});
  console.log('V4 CONCEPT V2: verified='+v2.parsed.items.length+' pending='+(v2.report.pending||[]).length+' rejected='+(v2.report.rejected||[]).length);
  const fullEvidence=[
    {source:'invoice-native',kind:'native',text:invoice,layout:[]},
    {source:'invoice-ocr-column',kind:'ocr',text:invoice,layout:[]},
    {source:'schedule-native',kind:'native',text:schedule,layout:[]},
    {source:'schedule-ocr-column',kind:'ocr',text:scheduleOcr,layout:[]},
    {source:'schedule-hires-auto',kind:'ocr',text:scheduleNoisy,layout:[]}
  ];
  const v4=await V3.evaluate(v2.parsed,{fullEvidence,inventoryItems:[],verifyGate:V2,webVerifier:null});
  const verified=v4.parsed.items||[],pending=v4.parsed.v2Verification?.pending||[],conflicts=v4.report.conflicts||[],recovered=v4.report.recovered||[];
  console.log('V4 CONCEPT V3/V4 STATUS: '+JSON.stringify({status:v4.report.status,modes:v4.report.modes,verified:verified.length,pending:pending.length,conflicts:conflicts.length,recovered}));
  console.log('V4 CONCEPT VERIFIED: '+JSON.stringify(verified.map(r=>({sku:r.sku||r.model||'',name:r.item_name||r.description||'',quantity:r.quantity,unit_price:r.unit_price,amount:r.amount,v3Recovered:!!r.v3Recovered}))));
  console.log('V4 CONCEPT PENDING: '+JSON.stringify(pending.map(r=>({sku:r.sku||r.model||'',name:r.item_name||r.description||'',quantity:r.quantity,unit_price:r.unit_price,amount:r.amount,reason:r.v2VerificationReason||'',variants:r.v3Provenance?.modelVariants||[]}))));
  console.log('V4 CONCEPT CONFLICTS: '+JSON.stringify(conflicts.map(x=>({ordinal:x.ordinal,type:x.type,reason:x.reason,v2:x.v2Row?.sku||x.v2Row?.model||'',v3:x.v3Row?.sku||x.v3Row?.model||'',variants:x.v3Row?.v3Provenance?.modelVariants||[]}))));

  const accounted=[...verified,...pending];
  const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const expected=[
    {ids:['CQ12T'],q:1,p:1400,a:1400},
    {ids:['1604DSP'],q:1,p:2500,a:2500},
    {ids:['ZX1190','ZX1180'],q:6,p:800,a:4800},
    {ids:['SLXD24SM58'],q:2,p:950,a:1900},
    {ids:['MS1014'],q:1,p:200,a:200},
    {ids:['XDP3002','XDP3001'],q:1,p:950,a:950},
    {ids:['NEUTRIK'],q:1,p:450,a:450}
  ];
  const failures=[];
  for(const ex of expected){
    const row=accounted.find(r=>ex.ids.some(id=>norm([r.sku,r.model,r.item_name,r.description].filter(Boolean).join(' ')).includes(id)));
    if(!row){failures.push('missing '+ex.ids.join('/'));continue;}
    if(Number(row.quantity)!==ex.q||Math.abs(Number(row.unit_price)-ex.p)>.06||Math.abs(Number(row.amount)-ex.a)>.06)failures.push('economics mismatch '+ex.ids.join('/'));
  }
  const allText=accounted.map(r=>[r.sku,r.item_name,r.description].join(' ')).join(' ').toLowerCase();
  for(const bad of ['dismantle','cabling','operational training','system tuning'])if(allText.includes(bad))failures.push('service leaked '+bad);
  const hasZxConflict=conflicts.some(x=>x.ordinal===3||/ZX11/i.test(JSON.stringify(x)));
  const hasXdpConflict=conflicts.some(x=>x.ordinal===6||/XDP-3001/i.test(JSON.stringify(x)));
  if(!hasZxConflict)failures.push('ZX11-90 vs ZX11-80 conflict not detected');
  if(!hasXdpConflict)failures.push('XDP-3002 replacement XDP-3001 conflict not detected');
  console.log('V4 CONCEPT SUMMARY: '+(failures.length?'FAIL':'PASS')+' accounted='+accounted.length+'/7 conflicts='+conflicts.length+' failures='+JSON.stringify(failures));
  if(failures.length)process.exitCode=4;
}
main().catch(e=>{console.error(e);process.exitCode=5;});
