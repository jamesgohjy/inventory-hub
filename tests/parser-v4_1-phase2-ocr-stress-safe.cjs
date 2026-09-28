const V=require('../v7033-core.js');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');
const key=r=>norm([r.sku,r.model,r.item_name,r.description].filter(Boolean).join(' '));
const near=(a,b)=>Math.abs(Number(a)-Number(b))<=.06;

// Structure-preserving, de-identified OCR excerpts from actual PDFs.
// No parsed rows are supplied; OCR corruption is intentionally retained.

const hawko=`TAX INVOICE
INVOICE NO IN-1049266
786HKOAV-PB97E WYAVC004 ADJUSTABLE METAL TROLLEY W C+S 2 $550.00 $1,100.00
TRAY
Adjustable height 770-970mm
Lockable Security Cabinet with key
Single pull out shelf for PC keyboard
4" caster wheels (2 locking)
Solid steel construction, will not topple over
Dimensions 610*460 adjustable height 770-970 mm cabinet size 515*370*460 mm
SUBTOTAL $1,100.00
GST 7 % $77.00
TOTAL $1,177.00`;

const conceptAuto=`TAX INVOICE
No Description Qty Unit Price SGD Amount SGD
1 RE Sound System Replacement Setup for Parade Square 1 1,400.00 1,400.00
(A) Section 2 Technical Specifications for AV Equipment
Digital Mixer console. Support up to 12 channels with 7 Multi Touch Screen
Model Allen & Heath CQ12T
2 Digital Power Amplifier with DSP 1 2,500.00 2,500.00
Model Powersoft Duecanali 1604DSP
3 Passive Loudspeakers with mounting brackets 6 800.00 4,800.00
Model Electrovoice ZX11-90
4 Single Channel Digital Wireless Handheld Microphone System vol 2 iis Aral ST EspOUa re 600.00
Model Shure SLxD24/SM58 natitect bet
5 Monitor Speaker at the console 1 2 odBtnpiTA i20 bo0.00
Model Yamaha MS101-4
6 Dual CD and MP3 player with USB supported Playback 1 950,001 s)¥632)-)!|.4 850.00
Model Omnitronic XDP-3002
Note replaced with XDP-3001
7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00
Model Neutrik
8 (B) Scope of Work 1 1,809:00 {0% 9 4,800.00
Dismantle remove old speakers AV equipment and speakers from mounted spaces and equipment racks
9 Supply and install the new equipment specified in Section 2 Includes racking mounting kits 1 1¥500.005 3bu9 00.00
10 Supply and install cabling electrical audio data signal 1 300.00 300.00
11 Provide labelling and tidying the cabling setups 1 100.00 100.00
12 System tuning and calibration and DSP programming 1 500.00 500.00
13 Provide operational training and knowledge transfer after commissioning 1 300.00 300.00
14 Installation work tools scaffold and safety documents 1 800.00 800.00
15 24 months equipment and workmanship on-site warranty 1 0.00 0.00
Subtotal 16,500.00
GST 9% 1,485.00
Invoice Total 17,985.00`;

const conceptBlock=`TAX INVOICE
No Description Qty Unit Price SGD Amount SGD
1 RE Sound System Replacement Setup for Parade Square 1 1,400.00 1,400.00
(A) Section 2 Technical Specifications for AV Equipment
Digital Mixer console Support up to 12 channels with 7 Multi Touch Screen
Model Allen & Heath CQ12T
2 Digital Power Amplifier with DSP 1 2,509.00 2,500.00
Model Powersoft Duecanali 1604DSP
3 Passive Loudspeakers with mounting brackets 6 800.00 4,800.00
Model Electrovoice ZX1I-90
4 Single Channel Digital Wireless Handheld Microphone System 1) 2 il rrper fod saab eoe 14 10.00
Model Shure SLxD24/SM58 onilteod alarY i beta
5 Monitor Speaker at the console 1 FY dBtpevpA into bo0.00
Model Yamaha MS101-4
6 Dual CD and MP3 player with USB supported Playback 1 950.005)\\)i159-0\\/ 4 850.00
Model Omnitronic XDP-3002
Note replaced with XDP-3002
7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00
Model Neutrik
8 (B) Scope of Work 1 1,809:00 {0% 9 4,800.00
Dismantle remove old speakers AV equipment and speakers from mounted spaces and equipment racks
9 Supply and install the new equipment specified in Section 2 Includes racking mounting kits 1 1¥500:008 34035 Bo0.00
10 Supply and install cabling electrical audio data signal 1 300.00 300.00
11 Provide labelling and tidying the cabling setups 1 100.00 100.00
12 System tuning and calibration and DSP programming 1 500.00 500.00
13 Operational training after commissioning 1 300.00 300.00
14 Installation tools and safety documents 1 800.00 800.00
15 24 months equipment and workmanship on-site warranty 1 0.00 0.00
Subtotal 16,500.00
GST 9% 1,485.00
Invoice Total 17,985.00`;

function score(rows,expected,label){
 const failures=[];
 if(rows.length!==expected.length)failures.push('expected '+expected.length+' rows got '+rows.length);
 for(const ex of expected){
   const r=rows.find(x=>key(x).includes(norm(ex.id)));
   if(!r){failures.push('missing '+ex.id);continue;}
   if(Number(r.quantity)!==ex.q)failures.push(ex.id+' qty '+r.quantity+' != '+ex.q);
   if(ex.p!=null&&!near(r.unit_price,ex.p))failures.push(ex.id+' unit '+r.unit_price+' != '+ex.p);
   if(ex.a!=null&&!near(r.amount,ex.a))failures.push(ex.id+' amount '+r.amount+' != '+ex.a);
 }
 console.log(label+': '+(failures.length?'FAIL':'PASS')+' rows='+rows.length+(failures.length?' :: '+failures.join(' | '):''));
 if(failures.length)console.log(label+' ROWS '+JSON.stringify(rows.map(r=>({sku:r.sku||r.model||'',name:r.item_name||r.description||'',q:r.quantity,p:r.unit_price,a:r.amount,review:!!r.humanReviewRequired}))));
 return failures;
}

const hawkoRows=V.v703312jRecoverNumberedEquipmentRows(hawko,[{source:'phase2-actual-ocr-deidentified',kind:'ocr',text:hawko,layout:[]}]);
const hFail=score(hawkoRows,[{id:'786HKOAVPB97E',q:2,p:550,a:1100}],'PHASE2 OCR HAWKO');

const evidence=[
 {source:'ocr-auto-actual-deidentified',kind:'ocr',text:conceptAuto,layout:[]},
 {source:'ocr-block-actual-deidentified',kind:'ocr',text:conceptBlock,layout:[]}
];
const conceptRows=V.v703312jRecoverNumberedEquipmentRows(conceptAuto,evidence);
// Ground truth correction: official Electro-Voice model is ZX1i-90; the earlier ZX11-90 expectation was an OCR corruption, not source truth.\nconst expected=[
 {id:'CQ12T',q:1,p:1400,a:1400},
 {id:'1604DSP',q:1,p:2500,a:2500},
 {id:'ZX1I90',q:6,p:800,a:4800},
 {id:'SLXD24SM58',q:2,p:0,a:0},
 {id:'MS1014',q:1,p:0,a:0},
 {id:'XDP3002',q:1,p:0,a:0},
 {id:'RECEPTACLE',q:1,p:450,a:450}
];
const cFail=score(conceptRows,expected,'PHASE2 OCR CONCEPT');
for(const id of ['SLXD24SM58','MS1014','XDP3002']){
 const r=conceptRows.find(x=>key(x).includes(norm(id)));
 if(r && !(r.unit_price==null && r.amount==null && (r.humanReviewRequired||r.needsReview||r.priceReviewRequired||r.amountReviewRequired))) cFail.push(id+' must be blank+review under obscured OCR');
}
console.log('PHASE2 OCR STRESS FAIRNESS: de-identified actual OCR text; no post-extraction rows supplied');
console.log('PHASE2 OCR STRESS SUMMARY: '+((hFail.length?0:1)+(cFail.length?0:1))+'/2 PASS');
if(hFail.length||cFail.length)process.exitCode=9;
