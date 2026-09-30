const V=require('../v7033-core.js');
require('../modules/parser-v4_1-shadow.js');
require('../modules/parser-v4_1_2-item-blocks.js');
const V41=globalThis.InventoryHubParserV41Shadow;
const V412=globalThis.InventoryHubParserV412;
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const key=r=>norm([r.sku,r.model,r.item_name,r.description].filter(Boolean).join(' '));
const near=(a,b)=>a!=null&&Math.abs(Number(a)-Number(b))<=.06;

// Fresh OCR witnesses generated directly from the actual Concept Tax Invoice page.
// Customer/contact/bank details are intentionally omitted; the equipment/service table
// text and OCR corruption are retained verbatim enough for parser evaluation.
// No parsed rows are supplied to the parser.

const ocr3=`TAX INVOICE
No. Description Qty Unit Price Amount
SGD SGD
1 RE: Sound System Replacement Setup for Y14 Parade Square 1 1,400.00 1,400.00
(A) Section 2: Technical Specifications for AV Equipment
Digital Mixer console. Support up to 12 channels with 7” Multi Touch Screen
Model: Allen & Heath CQ12T
2 Digital Power Amplifier with DSP 1 2,500.00 2,500.00
Model: Powersoft Duecanali 1604DSP
3 Passive Loudspeakers with mounting brackets 6 800.00 4,800.00
Model: Electrovoice Z2X1I-90
4 Single Channel Digital Wireless Handheld Microphone System vol 2 { Fie liy Sina 750-00; baig 00.00
Model: Shure SLXD24/SM58
5 Monitor Speaker at the console 1 1) odBlggtA iB20! boo.00
Model: Yamaha MS101-4
6 Dual CD and MP3 player with USB supported Playback 1 950.004) yiyeti4 850.00
Model: Omnitronic XDP-3002
Note: replaced with XDP-3001
7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00
Model: Neutrik
8 (B) Scope of Work: 1 1,800:00 41,800.00
Dismantle, remove old speakers, AV equipment and speakers from mounted spaces and equipment racks.
9 Supply and install the new equipment specified in Section 2. Includes racking, mounting kits 1 500:008 Eoo.00
10 Supply and install cabling (electrical / audio / data signal) for the required setup for equipment specified in Section 2. 1 300.00 300.00
11 Provide labelling and tidying the cabling setups. 1 100.00 100.00`;

const ocr4=`TAX INVOICE
No. Description Qty Unit Price Amount
SGD SGD
1 RE: Sound System Replacement Setup for Y14 Parade Square 1 1,400.00 1,400.00
(A) Section 2: Technical Specifications for AV Equipment
Digital Mixer console. Support up to 12 channels with 7” Multi Touch Screen
Model: Allen & Heath CQ12T
2 Digital Power Amplifier with DSP 1 2,500.00 2,500.00
Model: Powersoft Duecanali 1604DSP
3 Passive Loudspeakers with mounting brackets 6 800.00 4,800.00
Model: Electrovoice ZX1I-90
4 Single Channel Digital Wireless Handheld Microphone System 2 lig Favs Signe ON 00.00
Model: Shure SLXD24/SM58
5 Monitor Speaker at the console 1 21 odflpaiNA if boo.00
Model: Yamaha MS101-4
6 Dual CD and MP3 player with USB supported Playback 1 950.001 iy) BS0.00
Model: Omnitronic XDP-3002
Note: replaced with XDP-3001
7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00
Model: Neutrik
8 (B) Scope of Work: 1 1,800:00 41,800.00
Dismantle, remove old speakers, AV equipment and speakers from mounted spaces and equipment racks.
9 Supply and install the new equipment specified in Section 2. Includes racking, mounting kits 1 500:008 Eoo.00
10 Supply and install cabling (electrical / audio / data signal) for the required setup for equipment specified in Section 2. 1 300.00 300.00
11 Provide labelling and tidying the cabling setups. 1 100.00 100.00`;

const ocr6=`TAX INVOICE
No. Description Qty Unit Price Amount
SGD SGD
1 RE: Sound System Replacement Setup for Y14 Parade Square 1 1,400.00 1,400.00
(A) Section 2: Technical Specifications for AV Equipment
Digital Mixer console. Support up to 12 channels with 7” Multi Touch Screen
Model: Allen & Heath CQ12T
2 Digital Power Amplifier with DSP 1 2,500.00 2,500.00
Model: Powersoft Duecanali 1604DSP
3 Passive Loudspeakers with mounting brackets 6 800.00 4,800.00
Model: Electrovoice ZX1I-90
4 Single Channel Digital Wireless Handheld Microphone System 2 lg istiedw sinatinocbeald 00.00
Model: Shure SLXD24/SM58
5 Monitor Speaker at the console 1 21 odflpaiNA if boo.00
Model: Yamaha MS101-4
6 Dual CD and MP3 player with USB supported Playback 1 950.004) yiyeti4 850.00
Model: Omnitronic XDP-3002
Note: replaced with XDP-3001
7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00
Model: Neutrik
8 (B) Scope of Work: 1 1,800:00 41,800.00
Dismantle, remove old speakers, AV equipment and speakers from mounted spaces and equipment racks.
9 Supply and install the new equipment specified in Section 2. Includes racking, mounting kits 1 500:008 Eoo.00
10 Supply and install cabling (electrical / audio / data signal) for the required setup for equipment specified in Section 2. 1 300.00 300.00
11 Provide labelling and tidying the cabling setups. 1 100.00 100.00`;

const page3=`TAX INVOICE
No. Description Qty Unit Price Amount
12 System tuning and calibration and DSP programming. 1 500.00 500.00
13 Provide operational training and knowledge transfer after commissioning. 1 300.00 300.00
14 All Installation work must include the necessary tools and safety documents. 1 800.00 800.00
15 24 months equipment and workmanship on-site warranty 1 0.00 0.00
Subtotal 16,500.00
GST 9% 1,485.00
Invoice Total 17,985.00`;

const pages=[
 'PURCHASE ORDER\nPO Date 14/05/2024\nPO Number PO2024/000134\nDescription Quantity Unit Cost Extended Price',
 ocr3,
 page3,
 'DELIVERY ORDER\nDO No. 2407/015\nDescription Qty\nDigital Mixer console\nModel: Allen & Heath CQ12T',
 'DELIVERY ORDER\nDescription Qty\nSystem tuning and calibration and DSP programming.',
 'SCHEDULES OF PRICES AND TECHNICAL DATA\nQuotation Validity - 90 days\nDescription Make Model Country Qty Unit Price Amount'
];

const authority=V.filterInvoicePages(pages,[]);
assert(authority.decisions.length===6,'expected six Concept pages');
assert(authority.decisions[0].allowed===false,'purchase order must be rejected');
assert(authority.decisions[1].allowed===true&&authority.decisions[2].allowed===true,'only Tax Invoice pages must be authoritative');
assert(authority.decisions[3].allowed===false&&authority.decisions[4].allowed===false&&authority.decisions[5].allowed===false,'DO/quotation must be rejected');

const evidence=[
 {source:'concept-fresh-ocr-psm3',kind:'ocr',text:ocr3,layout:[]},
 {source:'concept-fresh-ocr-psm4',kind:'ocr',text:ocr4,layout:[]},
 {source:'concept-fresh-ocr-psm6',kind:'ocr',text:ocr6,layout:[]}
];
const rows=V.v703312jRecoverNumberedEquipmentRows(ocr3,evidence);
const find=id=>rows.find(r=>key(r).includes(norm(id)));
const failures=[];
function req(id,q,p,a,{allowBlankEconomics=false}={}){
 const r=find(id);
 if(!r){failures.push('missing '+id);return;}
 if(Number(r.quantity)!==q)failures.push(id+' qty '+r.quantity+' != '+q);
 if(allowBlankEconomics){
   const blank=r.unit_price==null&&r.amount==null;
   const correct=near(r.unit_price,p)&&near(r.amount,a);
   if(!blank&&!correct)failures.push(id+' economics wrong unit='+r.unit_price+' amount='+r.amount);
   if(blank&&!(r.humanReviewRequired||r.needsReview||r.priceReviewRequired||r.amountReviewRequired))failures.push(id+' blank economics not review flagged');
 }else if(!near(r.unit_price,p)||!near(r.amount,a))failures.push(id+' economics unit='+r.unit_price+' amount='+r.amount+' expected '+p+'/'+a);
}
req('CQ12T',1,1400,1400);
req('1604DSP',1,2500,2500);
req('ZX1I90',6,800,4800);
req('SLXD24SM58',2,950,1900,{allowBlankEconomics:true});
req('MS1014',1,200,200,{allowBlankEconomics:true});
req('XDP3002',1,950,950,{allowBlankEconomics:true});
const xdp=find('XDP3002');
if(!xdp||norm(xdp.v703314zReplacementModel)!==norm('XDP-3001'))failures.push('XDP-3002 replacement note XDP-3001 not retained');
req('NEUTRIK',1,450,450);

if(rows.length!==7)failures.push('expected 7 equipment rows, got '+rows.length);
if(rows.some(r=>/scope of work|dismantle|racking|cabling|labelling|training|installation|warranty/i.test(String(r.item_name||r.description||''))))failures.push('service/work row leaked into equipment output');

const audit=V41.recoverRows(rows,{raw:ocr3,sources:evidence});
if(audit.randomCharacterFailureCount!==0)failures.push('V4.1 hard contamination survived recovery='+JSON.stringify(audit.hardFailures));
const finalReceptacle=audit.outputRows.find(r=>/microphone wall receptacle/i.test(String(r.item_name||r.description||'')));
if(!finalReceptacle)failures.push('V4.1 final receptacle row missing');
else{
  if(String(finalReceptacle.sku||finalReceptacle.model||'').trim())failures.push('brand-only Neutrik survived V4.1 as SKU/model');
  if(finalReceptacle.v41ProductionReviewRequired!==true)failures.push('brand-only receptacle identity not routed to review');
}

const final=V412.apply(audit.outputRows,{raw:ocr3,sources:evidence});
const finalRows=final.outputRows;
const expectedNames={CQ12T:'Digital Mixer','1604DSP':'Digital Power Amplifier with DSP','ZX1I-90':'Passive Loudspeaker','SLXD24/SM58':'Single Channel Digital Wireless Handheld Microphone System','MS101-4':'Monitor Speaker','XDP-3002':'Dual CD/MP3 Player'};
for(const [sku,name] of Object.entries(expectedNames)){const r=finalRows.find(x=>String(x.sku||'')===sku);if(!r||r.item_name!==name)failures.push('V4.1.2 canonical Review mismatch '+sku+'='+JSON.stringify(r?.item_name));}
const finalReceptacleV412=finalRows.find(r=>/outdoor\s+dual\s+microphone\s+wall\s+receptacle/i.test(String(r.item_name||r.description||'')));
if(!finalReceptacleV412||finalReceptacleV412.identity_status!=='needs_attention'||finalReceptacleV412.equipment_status!=='verified')failures.push('V4.1.2 Needs Attention status split missing');
const resultRows=finalRows.map(r=>({
 sku:r.sku||r.model||'',
 item:r.item_name||r.description||'',
 qty:r.quantity,
 unit_price:r.unit_price,
 amount:r.amount,
 review:!!(r.humanReviewRequired||r.needsReview||r.priceReviewRequired||r.amountReviewRequired),
 replacement:r.v703314zReplacementModel||''
}));
console.log('CONCEPT ACTUAL OCR AUTHORITY: accepted='+authority.decisions.filter(x=>x.allowed).map(x=>x.page).join(',')+' rejected='+authority.decisions.filter(x=>!x.allowed).map(x=>x.page).join(','));
console.log('CONCEPT ACTUAL OCR ROWS: '+JSON.stringify(resultRows));
console.log('CONCEPT ACTUAL OCR CONTAMINATION: hard='+audit.randomCharacterFailureCount+' unresolved='+audit.unresolvedRecoveryCount);
console.log('CONCEPT ACTUAL OCR SERVICE LEAKAGE: '+(failures.some(x=>/service\/work/.test(x))?'FAIL':'0'));
console.log('CONCEPT ACTUAL OCR FAIRNESS: fresh PSM3/4/6 OCR witnesses from actual Tax Invoice; no post-extraction rows supplied');
console.log('CONCEPT ACTUAL OCR PHASE3 SUMMARY: '+(failures.length?'FAIL':'PASS')+' rows='+rows.length+'/7 failures='+JSON.stringify(failures));
if(failures.length)process.exitCode=11;
