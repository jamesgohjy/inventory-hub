const fs=require('fs');
const V=require('../v7033-core.js');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const key=r=>norm([r.sku,r.model,r.item_name,r.description].filter(Boolean).join(' '));

const invoice=`TAX INVOICE
Invoice No.: INV-TEST-701
No Description Qty Unit Price Amount
1 Digital Mixer console. Support up to 12 channels with 7 Multi Touch Screen 1 1400.00 1400.00
Model: Allen & Heath CQ12T
2 Digital Power Amplifier with DSP 1 2500.00 2500.00
Model: Powersoft Duecanali 1604DSP
3 Passive Loudspeakers with mounting brackets 6 800.00 4800.00
Model: Electrovoice ZX1I-90
4 Single Channel Digital Wireless Handheld Microphone System 2 OCR-DAMAGED OCR-DAMAGED
Model: Shure SLXD24/SM58
5 Monitor Speaker at the console 1 OCR-DAMAGED OCR-DAMAGED
Model: Yamaha MS101-4
6 Dual CD and MP3 player with USB supported Playback 1 OCR-DAMAGED OCR-DAMAGED
Model: Omnitronic XDP-3002
7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00
Model: Neutrik
Subtotal 12345.00
GST 9% 1111.05
Invoice Total 13456.05`;

const schedule=`SCHEDULES OF PRICES AND TECHNICAL DATA
Description Make Model Country Qty UnitPrice Amount
1 Digital Mixer console Support up to 12 channels with 7 Multi Touch Screen Allen & Heath ca1zr UK 1 1400.00 1400.00
2 Digilal Power Amplifier with DSP Powersoft Duecanail 1604DSP aly 1 2500.00 2500.00
3 Passive Loudspeakers with mounting brackets Electrovolce 2x1i-80 usa 6 800.00 4800.00
4 Single Channel Digital Wireless Handheld Microphone System Shure SLXD24/SM58 usa 2 850.00 1700.00
5 Monitor Speeker at the console Yamaha MS101-4 Japan 1 200.00 200.00
6 Dual CD and MP3 player with USB supported Playback Omitronic XDP-3002 China 1 950.00 950.00
7 Outdoor Dual Microphone Wall Receptacle Neutrik Neutrik Italy 1 450.00 450.00
Total Amount 16500.00`;

// Gate 1: a technical/price schedule after an invoice is never an invoice continuation.
const gate=V.filterInvoicePages([invoice,schedule],[]);
assert(gate.texts.length===1,'technical price schedule inherited invoice authority');
assert(/TAX INVOICE/.test(gate.texts[0]),'invoice page not retained');
assert(gate.decisions[1]&&!gate.decisions[1].allowed,'schedule page must be rejected');
console.log('PHASE4 AUTHORITY SCHEDULE REJECTION: PASS');

// Gate 2: final reconciliation must absorb OCR-noisy duplicates instead of appending them.
const sources=[
 {source:'invoice-primary',kind:'ocr',text:invoice,layout:[]},
 {source:'invoice-hires-column-p1',kind:'ocr',text:invoice.replace('Support up to 12 channels','Supports up to 12 channels'),layout:[]},
 {source:'invoice-hires-block-p1',kind:'ocr',text:invoice.replace('Passive Loudspeakers','Passive Loudspeaker'),layout:[]}
];
const recovered=V.v703312jRecoverNumberedEquipmentRows(invoice,sources);
assert(recovered.length===7,'authoritative invoice recovery must produce 7 rows, got '+recovered.length);

const contaminated=[
 {sku:'1604DSP',item_name:'Digilal Power Amplifier with DSP Powersoft Duecanail 1604DSP aly',description:'Digilal Power Amplifier with DSP Powersoft Duecanail 1604DSP aly',quantity:1,unit_price:2500,amount:2500},
 {sku:'',item_name:'Digital Power Amplifier with DSP',description:'Digital Power Amplifier with DSP',quantity:1,unit_price:2500,amount:2500},
 {sku:'ca1zr',item_name:'Digital Mixer console, Support up lo 12 channels with 7 Multi Touch Screen. Allen & Heath ca1zr UK',description:'Digital Mixer console Support up to 12 channels with 7 Multi Touch Screen',quantity:1,unit_price:1400,amount:1400},
 {sku:'ZX11-90',item_name:'Passive Loudspeakers with mounting brackets',description:'Passive Loudspeakers with mounting brackets',quantity:6,unit_price:800,amount:4800},
 {sku:'SLXD24/SM58',item_name:'Single Channel Digital Wireless Handheld Microphone System Shure SLXD24 SM58 usa',description:'Single Channel Digital Wireless Handheld Microphone System',quantity:2,unit_price:null,amount:null},
 {sku:'MS101-4',item_name:'LH Monitor Speeker at the console Yamaha MS101-4 Japan',description:'Monitor Speaker at the console',quantity:1,unit_price:null,amount:null},
 {sku:'XDP-3002',item_name:'Dual CD and MP3 player with USB supported Playback Omitronic XDP-3002 China',description:'Dual CD and MP3 player with USB supported Playback',quantity:1,unit_price:null,amount:null},
 {sku:'Neutrik',item_name:'Quidoar Dual Microphone Wall Receplacie Neutrik Neutrik may',description:'Outdoor Dual Microphone Wall Receptacle',quantity:1,unit_price:450,amount:450}
];

const final=V.v703314zcReconcileReviewRows(contaminated,recovered,invoice,sources);
assert(final.length===7,'final reconciliation must remain 7 physical rows, got '+final.length);
for(const id of ['1604DSP','ZX1I90','CQ12T','SLXD24SM58','MS1014','XDP3002','NEUTRIK']){
  assert(final.some(r=>norm(r.sku||r.model)===id),'missing final model '+id+' :: '+JSON.stringify(final.map(x=>({sku:x.sku,item:x.item_name}))));
}
assert(final.filter(r=>/power amplifier/i.test(String(r.item_name||r.description||''))).length===1,'duplicate amplifier survived');
const amp=final.find(r=>norm(r.sku)==='1604DSP');
assert(amp&&/Digital Power Amplifier with DSP/i.test(String(amp.item_name||''))&&!/Digilal|Duecanail|\baly\b/i.test(String(amp.item_name||'')),'amplifier name not cleaned: '+JSON.stringify(amp));
const recept=final.find(r=>norm(r.sku)==='NEUTRIK');
assert(recept&&/Outdoor Dual Microphone Wall Receptacle/i.test(String(recept.item_name||recept.description||''))&&!/Quidoar|Receplacie/i.test(String(recept.item_name||'')),'receptacle name not cleaned: '+JSON.stringify(recept));
console.log('PHASE4 FINAL OCR DEDUPE + NAME QUALITY: PASS rows=7/7');

// Gate 3: unseen non-invoice schedule titles must break continuation inheritance.
for(const title of ['PRICE SCHEDULE','SCHEDULE OF PRICES','BILL OF QUANTITIES','TECHNICAL PROPOSAL','TECHNICAL DATA SHEET','TENDER SCHEDULE']){
  const page=title+'\nDescription Qty Unit Price Amount\nCamera package 2 1000.00 2000.00\nTotal 2000.00';
  const g=V.filterInvoicePages([invoice,page],[]);
  assert(g.texts.length===1&&!g.decisions[1].allowed,'unseen schedule title inherited authority: '+title);
}
console.log('PHASE4 UNSEEN DOCUMENT-AUTHORITY NEGATIVES: PASS 6/6');

// Gate 4: runtime must activate high-resolution model OCR without requiring a colon.
const runtime=fs.readFileSync(require('path').join(__dirname,'..','runtime-v7.03.3.16.js'),'utf8');
assert(runtime.includes("MODEL(?:\\s*(?:NO\\.?|NUMBER))?"),'model-rich OCR trigger still requires exact Model: syntax');
assert(runtime.includes("invoice-hires-'+mode.key+'-p"),'two-mode high-resolution model OCR source missing');
assert(runtime.includes("SINGLE_BLOCK"),'high-resolution block OCR mode missing');
console.log('PHASE4 MODEL OCR ACQUISITION: PASS');

// Gate 5: row-local explicit Model evidence must outrank cross-row OCR noise only
// when at least two independent explicit sources confirm the same local model.
const rowLocal={
  sku:'',model:'',item_name:'Single Channel Digital Wireless Handheld Microphone System',
  description:'Single Channel Digital Wireless Handheld Microphone System',
  v703312kSourceLine:'4 Single Channel Digital Wireless Handheld Microphone System 2 OCR-DAMAGED OCR-DAMAGED | Model: Shure SLXD24/SM58',
  v703314zdModelCandidates:[
    {model:'ZX11-90',source:'ocr-a',explicit:true},
    {model:'ZX11-90',source:'ocr-b',explicit:true},
    {model:'SLXD24/SM58',source:'ocr-a',explicit:true},
    {model:'SLXD24/SM58',source:'ocr-b',explicit:true}
  ]
};
const rowLocalResolved=V.v703314zdResolveModelConsensus(rowLocal);
assert(norm(rowLocalResolved.sku)==='SLXD24SM58','row-local explicit majority did not beat cross-row OCR tie');

const rowLocalConflict={
  sku:'',model:'',item_name:'Wireless microphone system',description:'Wireless microphone system',
  v703312kSourceLine:'4 Wireless microphone system 2 900.00 1800.00 | Model: Shure SLXD24/SM58 | Model: Sennheiser EW-D 835-S',
  v703314zdModelCandidates:[
    {model:'SLXD24/SM58',source:'ocr-a',explicit:true},
    {model:'SLXD24/SM58',source:'ocr-b',explicit:true},
    {model:'EW-D',source:'ocr-a',explicit:true},
    {model:'EW-D',source:'ocr-b',explicit:true}
  ]
};
const rowLocalConflictResolved=V.v703314zdResolveModelConsensus(rowLocalConflict);
assert(!rowLocalConflictResolved.sku&&!rowLocalConflictResolved.model,'conflicting row-local models must remain unresolved');
console.log('PHASE4 ROW-LOCAL MODEL PRIORITY + FAIL-CLOSED CONFLICT: PASS');

console.log('PHASE4 IDENTITY QUALITY R8 SUMMARY: PASS');
