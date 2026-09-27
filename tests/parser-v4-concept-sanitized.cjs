const fs=require('fs'),vm=require('vm');
const V7033=require('../v7033-core.js');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const read=p=>fs.readFileSync(p,'utf8');
const ctx={console,Date,JSON,Math,Number,String,Array,Object,Set,Map,RegExp,Intl,setTimeout,clearTimeout};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);
for(const path of ['modules/parser-v2/evidence-model.js','modules/parser-v2/table-detector.js','modules/parser-v2/numbered-schedule.js','modules/parser-v2/verification-gate.js','modules/parser-v3/engine.js','modules/parser-v4-review-bridge.js'])vm.runInContext(read(path),ctx,{filename:path});
const V2=ctx.InventoryHubParserV2VerificationGate,V3=ctx.InventoryHubParserV3,V4Review=ctx.InventoryHubParserV4ReviewBridge;
assert(V4Review?.selfTest?.().ok,'V4 live-review self-test failed');

// Sanitized transcription of the authorised Tax Invoice page.
// Rows 4 and 5 intentionally retain the damaged/stamped primary OCR state.
const invoice=`TAX INVOICE
Supplier: CONCEPT SYSTEMS TECHNOLOGIES Pte Ltd.
Invoice No.: 2407/015
No. Description Qty Unit Price Amount
1 RE: Sound System Replacement Setup 1 1,400.00 1,400.00
(A) Section 2: Technical Specifications for AV Equipment
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
8 (B) Scope of Work: 1 1,800.00 1,800.00
Dismantle remove old speakers AV equipment and equipment racks
9 Supply and install the new equipment 1 500.00 500.00
10 Supply and install cabling 1 300.00 300.00
11 Provide labelling and tidying cabling 1 100.00 100.00
12 System tuning calibration DSP programming 1 500.00 500.00
13 Operational training after commissioning 1 300.00 300.00
14 Installation tools and safety documents 1 800.00 800.00
Subtotal 16,500.00`;

// Independent OCR witnesses of the SAME Tax Invoice page. They differ in spacing/noise,
// but contain no quotation, PO, DO or standalone price-schedule evidence.
const invoiceOcrColumn=invoice
  .replace('4 Single Channel Digital Wireless Handheld Microphone System 2 OCR-STAMP OCR-STAMP','4 | Single Channel Digital Wireless Handheld Microphone System | 2 | 950.00 | 1,900.00')
  .replace('5 Monitor Speaker at the console 1 OCR-STAMP OCR-STAMP','5 | Monitor Speaker at the console | 1 | 200.00 | 200.00');

const invoiceOcrBlock=invoice
  .replace('4 Single Channel Digital Wireless Handheld Microphone System 2 OCR-STAMP OCR-STAMP','4   Single Channel Digital Wireless Handheld Microphone System   2   950.00   1,900.00')
  .replace('5 Monitor Speaker at the console 1 OCR-STAMP OCR-STAMP','5   Monitor Speaker at the console   1   200.00   200.00')
  .replace('Model: Shure SLXD24/SM58','Model : Shure SLXD24/SM58')
  .replace('Model: Yamaha MS101-4','Model : Yamaha MS101-4');

// Poison evidence: this is intentionally a standalone non-invoice schedule and disagrees
// with the Tax Invoice. Parser V3 must ignore it completely for row promotion/repair.
const poisonSchedule=`SCHEDULES OF PRICES AND TECHNICAL DATA
1 Digital Mixer console Allen & Heath CQ12T 1 1400.00 1400.00
2 Digital Power Amplifier Powersoft 1604DSP 1 2500.00 2500.00
3 Passive Loudspeakers Electrovoice ZX11-80 6 800.00 4800.00
4 Wireless Microphone Shure SLXD24/SM58 2 900.00 1800.00
5 Monitor Speaker Yamaha MS101-4 1 175.00 175.00
6 Player Omnitronic XDP-3001 1 950.00 950.00
7 Receptacle Neutrik 1 450.00 450.00
TOTAL AMOUNT = 16425.00`;

const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const rowKey=r=>norm([r.sku,r.model,r.item_name,r.description].filter(Boolean).join(' '));
const expected=[
  {id:'CQ12T',q:1,p:1400,a:1400},
  {id:'1604DSP',q:1,p:2500,a:2500},
  {id:'ZX1190',q:6,p:800,a:4800},
  {id:'SLXD24SM58',q:2,p:950,a:1900},
  {id:'MS1014',q:1,p:200,a:200},
  {id:'XDP3002',q:1,p:950,a:950},
  {id:'NEUTRIK',q:1,p:450,a:450}
];

function checkRows(rows,label){
  const failures=[];
  if(rows.length!==7)failures.push(label+' expected 7 equipment rows, got '+rows.length);
  for(const ex of expected){
    const row=rows.find(r=>rowKey(r).includes(ex.id));
    if(!row){failures.push(label+' missing '+ex.id);continue;}
    if(Number(row.quantity)!==ex.q||Math.abs(Number(row.unit_price)-ex.p)>.06||Math.abs(Number(row.amount)-ex.a)>.06){
      failures.push(label+' economics mismatch '+ex.id+' got '+JSON.stringify({q:row.quantity,p:row.unit_price,a:row.amount}));
    }
  }
  const text=rows.map(rowKey).join(' ');
  if(text.includes('ZX1180'))failures.push(label+' leaked non-invoice ZX11-80 identity');
  for(const bad of ['DISMANTLE','CABLING','OPERATIONALTRAINING','SYSTEMTUNING'])if(text.includes(bad))failures.push(label+' service leaked '+bad);
  return failures;
}

async function main(){
  const invoiceEvidence=[
    {source:'invoice-ocr-column',kind:'ocr',text:invoiceOcrColumn,layout:[]},
    {source:'invoice-ocr-block',kind:'ocr',text:invoiceOcrBlock,layout:[]}
  ];
  const recovered=V7033.v703312jRecoverNumberedEquipmentRows(invoice,invoiceEvidence);
  const failures=checkRows(recovered,'invoice-only recovery');
  console.log('V4 CONCEPT INVOICE-ONLY ROWS: '+JSON.stringify(recovered.map(r=>({sku:r.sku||r.model||'',name:r.item_name||r.description||'',quantity:r.quantity,unit_price:r.unit_price,amount:r.amount,sources:r.v703312kEvidenceSources||[],replacement:r.v703314zReplacementModel||''}))));
  console.log('V4 CONCEPT INVOICE-ONLY PRIMARY: '+(failures.length?'FAIL':'PASS')+' recovered='+recovered.length+'/7');

  const xdp=recovered.find(r=>rowKey(r).includes('XDP3002'));
  if(!xdp||norm(xdp.v703314zReplacementModel)!=='XDP3001')failures.push('invoice replacement note XDP-3001 was not retained for review');
  if(!xdp?.humanReviewRequired)failures.push('invoice replacement note must remain review-required');

  const parsed={doc:{supplier_name:'CONCEPT SYSTEMS TECHNOLOGIES Pte Ltd.',invoice_number:'2407/015',subtotal:16500,total_amount:17985},items:recovered,invoiceClassification:{type:'equipment'},raw:invoice};
  const v2=await V2.verifyParsed(parsed,{raw:invoice,inventoryItems:[],supplierName:parsed.doc.supplier_name,doc:parsed.doc,webVerifier:null});
  const fullEvidence=[
    {source:'invoice-native',kind:'native',text:invoice,layout:[]},
    ...invoiceEvidence,
    {source:'poison-standalone-schedule',kind:'ocr',text:poisonSchedule,layout:[]}
  ];
  const v3=await V3.evaluate(v2.parsed,{fullEvidence,inventoryItems:[],verifyGate:V2,webVerifier:null});
  if(v3.report.supportScheduleDetected)failures.push('standalone non-invoice schedule activated V3 recovery');
  const review=V4Review.materialize(v3.parsed,recovered);
  failures.push(...checkRows(review.items||[],'live Review'));
  const reviewText=(review.items||[]).map(rowKey).join(' ');
  if(reviewText.includes('ZX1180'))failures.push('poison schedule changed invoice ZX11-90');
  const slxd=(review.items||[]).find(r=>rowKey(r).includes('SLXD24SM58'));
  if(slxd&&(Number(slxd.unit_price)!==950||Number(slxd.amount)!==1900))failures.push('poison schedule changed SLXD24/SM58 economics');

  console.log('V4 CONCEPT V2: verified='+(v2.parsed.items||[]).length+' pending='+(v2.report.pending||[]).length+' rejected='+(v2.report.rejected||[]).length);
  console.log('V4 CONCEPT V3: '+JSON.stringify({status:v3.report.status,supportScheduleDetected:v3.report.supportScheduleDetected,modes:v3.report.modes}));
  console.log('V4 CONCEPT REVIEW: input='+String(review.v4CandidateTrace?.inputCount||0)+' rows='+(review.items||[]).length);
  console.log('V4 CONCEPT INVOICE-AUTHORITY SUMMARY: '+(failures.length?'FAIL':'PASS')+' failures='+JSON.stringify(failures));
  if(failures.length)process.exitCode=4;
}
main().catch(e=>{console.error(e);process.exitCode=5;});
