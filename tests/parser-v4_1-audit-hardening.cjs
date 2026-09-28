const fs=require('fs');
const V=require('../v7033-core.js');
require('../modules/parser-v4_1-shadow.js');
const V41=globalThis.InventoryHubParserV41Shadow;
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const key=r=>norm([r.sku,r.model,r.item_name,r.description].filter(Boolean).join(' '));
const near=(a,b)=>a!=null&&Math.abs(Number(a)-Number(b))<=.06;

// 1. Explicit prohibited document title must beat stray "TAX INVOICE" OCR elsewhere.
const schedule=`SCHEDULES OF PRICES AND TECHNICAL DATA
Quotation Validity 90 days
Description Make Model Country Qty Unit Price Amount
OCR footer artifact TAX INVOICE
Model: Shure SLXD24/SM58`;
const sv=V.classifyInvoicePage(schedule);
assert(sv.allowed===false&&sv.type==='non-invoice','explicit schedule title leaked through authority gate: '+JSON.stringify(sv));

const invoiceWithPoRef=`TAX INVOICE
Invoice No: 2407/015
Order Ref: PO2024/000134
Description Qty Unit Price Amount
Projector Controller AVS-320 1 350.00 350.00`;
assert(V.classifyInvoicePage(invoiceWithPoRef).allowed===true,'real invoice with PO reference was incorrectly rejected');

// 2. Serial continuation must not absorb a later equipment/model description.
const serialText=`TAX INVOICE
Panasonic PT-VW540 projector
S/N: DC2210037
Abtus AVS320 HDMI Control panel
S/N: 320-T1-08078
Active Speaker in pair`;
const serial=V.v703315ExtractSerialBlocks(serialText);
assert(serial.blocks.length===2,'expected two serial blocks');
assert(serial.blocks[0].serials.length===1&&serial.blocks[0].serials[0]==='DC2210037',
  'first serial block absorbed later product text: '+JSON.stringify(serial.blocks[0]));
assert(!serial.blocks[0].serials.some(x=>/AVS320/i.test(x)),'AVS320 leaked into projector serials');

// 3. Concept-style multi-OCR row recovery: no prebuilt rows, raw OCR witnesses only.
const ocrA=`TAX INVOICE
No. Description Qty Unit Price Amount
1 RE: Sound System Replacement Setup for Y14 Parade Square 1 1,400.00 1,400.00
(A) Section 2: Technical Specifications for AV Equipment
Digital Mixer console. Support up to 12 channels with 7” Multi Touch Screen
Model: Allen & Heath CQ12T
2 Digital Power Amplifier with DSP 1 2,500.00 2,500.00
Model: Powersoft Duecanali 1604DSP
3 Passive Loudspeakers with mounting brackets 6 800.00 4,800.00
Model: Electrovoice ZX1I-90
4 Single Channel Digital Wireless Handheld Microphone System 2 OCR-DAMAGED OCR-DAMAGED
Model: Shure SLXD24/SM58
5 Monitor Speaker at the console 1 OCR-DAMAGED OCR-DAMAGED
Model: Yamaha MS101-4
6 Dual CD and MP3 player with USB supported Playback 1 OCR-DAMAGED OCR-DAMAGED
Model: Omnitronic XDP-3002
Note: replaced with XDP-3001
7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00
Model: Neutrik
8 (B) Scope of Work 1 1,800.00 1,800.00
9 Supply and install cabling 1 300.00 300.00`;
const ocrB=ocrA.replace('ZX1I-90','Z2X1I-90');
const ocrC=ocrA.replace('Support up to 12 channels','Supports up to 12 channels');
const targeted1=`TAX INVOICE
TARGETED NUMERIC ROW EVIDENCE
ROW 4 | 2 950.00 1,900.00
ROW 5 | 1 200.00 200.00
ROW 6 | 1 950.00 950.00`;
const targeted2=`TAX INVOICE
TARGETED NUMERIC ROW EVIDENCE
ROW 4 | Qty 2 SGD 950.00 SGD 1,900.00
ROW 5 | Qty 1 SGD 200.00 SGD 200.00
ROW 6 | Qty 1 SGD 950.00 SGD 950.00`;
const sources=[
 {source:'ocr-auto',kind:'ocr',text:ocrA,layout:[]},
 {source:'ocr-block',kind:'ocr',text:ocrB,layout:[]},
 {source:'ocr-column',kind:'ocr',text:ocrC,layout:[]},
 {source:'invoice-targeted-row-block-p2',kind:'ocr-targeted',text:targeted1,layout:[]},
 {source:'invoice-targeted-row-sparse-p2',kind:'ocr-targeted',text:targeted2,layout:[]}
];
const rows=V.v703312jRecoverNumberedEquipmentRows(ocrA,sources);
assert(rows.length===7,'expected 7 Concept equipment rows after raw OCR consensus, got '+rows.length);
const req=(id,q,p,a)=>{
 const r=rows.find(x=>key(x).includes(norm(id)));assert(r,'missing '+id);
 assert(Number(r.quantity)===q,id+' qty '+r.quantity+' != '+q);
 assert(near(r.unit_price,p)&&near(r.amount,a),id+' economics '+r.unit_price+'/'+r.amount+' != '+p+'/'+a);
 return r;
};
req('CQ12T',1,1400,1400);
req('1604DSP',1,2500,2500);
req('ZX1I90',6,800,4800);
req('SLXD24SM58',2,950,1900);
req('MS1014',1,200,200);
const xdp=req('XDP3002',1,950,950);
assert(norm(xdp.v703314zReplacementModel)==='XDP3001','XDP replacement note lost');
req('NEUTRIK',1,450,450);
assert(!rows.some(r=>/scope of work|cabling/i.test(String(r.item_name||r.description||''))),'service row leaked');

// A 1-vs-1 explicit model disagreement must fail closed rather than selecting the
// OCR mode with the higher source reliability label.
const tieRows=V.v703312jRecoverNumberedEquipmentRows(ocrA,[
 {source:'ocr-auto',kind:'ocr',text:ocrA,layout:[]},
 {source:'ocr-block',kind:'ocr',text:ocrB,layout:[]}
]);
const tieSpeaker=tieRows.find(r=>Number(r.v703314zOrdinal)===3);
assert(tieSpeaker,'tie test loudspeaker row missing');
assert(!String(tieSpeaker.sku||tieSpeaker.model||'').trim()&&tieSpeaker.skuReviewRequired===true,
  '1-vs-1 explicit model conflict was guessed instead of failed closed: '+JSON.stringify(tieSpeaker));
const audit=V41.auditRows(rows,{raw:ocrA,sources});
assert(audit.randomCharacterFailureCount===0,'V4.1 contamination after consensus: '+JSON.stringify(audit.hardFailures));

// 4. Runtime contracts for audited extraction weaknesses.
const runtime=fs.readFileSync(require('path').join(__dirname,'..','runtime-v7.03.3.14z.js'),'utf8');
assert(runtime.includes('function v703316PhysicalEquipmentSignalCount'),'column-major/incomplete-native OCR trigger missing');
assert(runtime.includes('physicalSignals>=2&&items.length<Math.min(physicalSignals,8)'),'incomplete-native deep recovery guard missing');
assert(runtime.includes('const ocrAllowed=ocrVerdicts.some'),'scanned OCR-authorized hires eligibility missing');
assert(runtime.includes('function v703316TargetedNumericBands'),'targeted numeric row-band OCR missing');
assert(runtime.includes("source='invoice-targeted-'+tm.key+'-p'+pageNo"),'targeted row OCR evidence source missing');
assert(runtime.includes("{key:'row-block'")&&runtime.includes("{key:'row-sparse'"),'independent targeted row OCR modes missing');

console.log('AUDIT AUTHORITY PRECEDENCE: PASS');
console.log('AUDIT SERIAL OWNERSHIP: PASS');
console.log('AUDIT CONCEPT RAW OCR CONSENSUS: 7/7 rows with complete economics PASS');
console.log('AUDIT MODEL CONFLICT: explicit 1-vs-1 tie fails closed; independent majority resolves PASS');
console.log('AUDIT COLUMN-MAJOR FAIL-SAFE: independent OCR trigger contract PASS');
console.log('AUDIT SCANNED HIRES/TARGETED OCR: runtime contract PASS');
console.log('V4.1 AUDIT HARDENING SUMMARY: PASS');
