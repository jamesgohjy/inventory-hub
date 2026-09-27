const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};

// Phase 2 fairness contract:
// - Raw text below was extracted directly from the actual uploaded PDF bytes with pdftotext -layout.
// - No prebuilt/post-extraction item rows are supplied to the parser.
// - Expected values are assertions only and never parser inputs.
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

const cases=[
{
  id:'actual-hawko-inv-avcart-native-pdf',
  supplier:'HAWKO TRADING CO PTE LTD',
  invoice:'IN-1049266',
  expectedCount:1,
  expected:[{contains:'METAL TROLLEY',qty:2,unit:550,amount:1100}],
  forbidden:['Delivery Fee','Delivery Services'],
  raw:String.raw`                                                                                                                                  033773
HAWKO
TFIADINQCO    PTE LTD
                                                          HAWKO TFADING CO PTE LTt]
                                                          3tl Kallang Ph=ce #O5-1 6/17
                                                          Singapone 3391 59
                                                                                                                      TAX INVOICE
                                                                                                                    No:     fl$1049266
        GST REG. NO. M2-0017571-9                         Tel:
             co REG. NO. 197400001W                       Website: wunru.hawko.corn Ernail: info@hawko.com          DATE: I O[ggl2021
                                                                                                                    PG:      Page 1 of 1


   AccouNTNCf: , 1R077                                                                   DELIVERTo:
     Rffic. hsfftrdon
       OrERffieslnditulion Lene
       siii6;ed;-5t56d,r--'r    ''J','s                                                  ffiffi}3*fon
                                                                                                             Len€

                                                                                         HIP:97t70i19i2




                                                                  HAWKGAVO92O21425 Mr. James Goh                            JAIIIES          30DAY




      zS6HKoAV-eB97E                                                   METAL TRoLLEY w      c+s              2            15s0.00          f1,100.00
                                  ffivcwnouusTABLE
                                  A$ustable height 77$970mm
                                  Lockable Socttrity Cabinat with key
                                  Sirgle pull out shelf for PC keyboard
                                  4' caster rvheels (2 locking)
                                  Solid eteel consffrrcfion will not topple over
                                  Dirnensimg 610460 fadiustable height 77o,970l
                                  run, (cabinet size 515€7f460) mm




                                                                                                                     SUBT3TAL               11,100'00


                                                                                                                     GST 7 U.                  177.00


 Ar paymenrs shourd be cnossed q#i;*'jo;--d&e payabte to HA\A/Ko TFADING co prE LTD.                                 TOTAL                 Slrf Tf 'u
 All goods sold nemain rhe pnopeFy of HAWKd TPifl,DlNG CO PTE LTD, until all invoices ane paid in full.
                                       a1s e d
 E:il= :1"?"ff:fl::::# tlf qn                    " ",:l
                                                          :r#
                                                           Tl                                                 HAWKO TF]ADING CO PTE LTD
       Goods neceved
                                                                          30 Kcbm   Pbcc          I
                             " =.ii,o..,ario.


       CUSTOMER'S STA                 SIGNATUFT
`
},
{
  id:'actual-lta-00215840-native-pdf',
  supplier:'Loud Technologies Asia Pte. Ltd.',
  invoice:'INV LTA-00215840',
  expectedCount:5,
  expected:[
    {contains:'U35C',qty:4,unit:340,amount:1360},
    {contains:'SLXD2',qty:1,unit:480,amount:480},
    {contains:'CART M 01 B',qty:2,unit:170,amount:340},
    {contains:'AT-2',qty:1,unit:270,amount:270},
    {contains:'U3',qty:4,unit:275,amount:1100}
  ],
  forbidden:['Delivery Services with return Trip','DEL, Delivery Services'],
  expectedUniqueSerials:11,
  raw:String.raw`TAX INVOICE
                                                                             Invoice Date                                         Loud Technologies Asia Pte. Ltd.
                                                                             28 Aug 2026                                          Attention: Accounts
                                                                                                                                  Payable/Receivable
   Raffles Institution                                                       Invoice Number                                       50, Serangoon North Avenue 4
   Attention: Accounts                                                       INV LTA-00215840                                     #07-03 First Centre
   1 Raffles Institution Lane                                                                                                     555856
   Raffles Institution                                                       Reference                                            SINGAPORE
   SINGAPORE SINGAPORE 575954                                                KKY| Raffles Institution
   SGP
                                                                             GST Registration
                                                                             201528112W



Description                                                        Quantity                      Unit Price                      Tax                     Amount SGD
Attention: Mr James Goh Junyi
Company: Raffles Institution
Address: 1 Raffles Institution Ln, Singapore
575954
Email Address: junyi.goh@ri.edu.sg
Contact Number: (65) 9797 6792
XVive U35C Wireless System for Condenser
Microphones 5.8GHz

Warranty: 1 Year, Carry In to LTAPL Service
                                                                          4.00                        340.00                      9%                           1,360.00
Centre
IN STOCK
S/N: IntlE251100449, Intle251100452,
Intle251000719, Intle251100448
Shure SLXD2+ Digital Wireless Handheld
Microphone Transmitter with SM58 Cardioid
Capsule (Freq: G66)
                                                                          1.00                        480.00                      9%                             480.00
Warranty: 2 Years, Carry In to SHURE Asia
Service Centre
IN STOCK
S/N: 3EL26704289, 3FA0985618
Gravity CART M 01 B Multifunctional Trolley
(Medium)
                                                                          2.00                        170.00                      9%                             340.00
IN STOCK
S/N: N/A




PAYMENT ADVICE                                                                   Customer
                                                                                 Invoice Number
                                                                                                                Raffles Institution
                                                                                                                INV LTA-00215840
     To:   Loud Technologies Asia Pte. Ltd.                                      Amount Due                     3,924.00
           Attention: Accounts Payable/Receivable                                                                                                        Elizabeth Khoo
           50, Serangoon North Avenue 4                                          Due Date                       30 Sep 2026
           #07-03 First Centre                                                   Amount Enclosed
           555856
           SINGAPORE                                                                                            Enter the amount you are paying above




                     Company Registration No: UEN: 201528112W. Registered Office: 50, Serangoon North Avenue 4, #07-03 First Centre, 555856, Singapore
Description                                                          Quantity                      Unit Price                      Tax                     Amount SGD
XVive AT-2 Portable Audio Tester

Warranty: 1 Year, Carry In to LTAPL Service
                                                                            1.00                        270.00                      9%                          270.00
Centre
IN STOCK
S/N: IntL260500638
Xvive Audio U3 2.4 GHz Digital Wireless
Microphone System for Dynamic
Microphones

Warranty: 1 Year, Carry In to LTAPL Service
                                                                            4.00                        275.00                      9%                         1,100.00
Centre
IN STOCK
S/N: Int1241204279, Int1241204276,
Int1241204210,
Int1241203023
DEL, Delivery Services with return Trip for
Signed Delivery Order
Required for GeBiz or Vendors.Gov billing or
accounts on payment terms.
Delivery only to loading bay/guardhouse, no
break bulk.
                                                                            1.00                         50.00                      9%                           50.00
*Important Note: Once delivery slot has been
arranged and notified to the person(s) in
charge, every failed delivery due to
consignee being uncontactable or rejection
of delivery at site will incur REDELIVERY
charges.
-
NOTE: Supply and delivery only.
                                                                                                                             Subtotal                          3,600.00
                                                                                   Total Local supply of goods and services 9%                                  324.00
                                                                                                                  Invoice Total SGD                            3,924.00
                                                           Elizabeth Khoo                                 Total Net Payments SGD                                   0.00
                                                                                                                  Amount Due SGD                              3,924.00
All cheques shall be made out to "Loud Technologies Asia Pte Ltd"
Electronic payments may be made to our UEN via "PayNow", direct bank transfer or Credit Card (Additional service fee of 3.5% applies)
Overdue accounts attract a account servicing service fee of 5% per month.
Discounts (if any) are valid only for payment within the stated terms. Once the payment deadline is missed, any discount will be rendered invalid.

Due Date: 30 Sep 2026




Signature & Company Stamp
We hereby acknowledge receipt of these items and/or services as stated

                       Company Registration No: UEN: 201528112W. Registered Office: 50, Serangoon North Avenue 4, #07-03 First Centre, 555856, Singapore
PACKING/DELIVERY SLIP
                                                                              Invoice Date                                              Loud Technologies Asia Pte.
                                                                              28 Aug 2026                                               Ltd.
                                                                                                                                        Attention: Accounts
    Raffles Institution                                                       Invoice Number                                            Payable/Receivable
    Attention: Accounts                                                       INV LTA-00215840                                          50, Serangoon North Avenue
    1 Raffles Institution Lane                                                                                                          4
    Raffles Institution                                                       Reference                                                 #07-03 First Centre
    SINGAPORE SINGAPORE 575954                                                KKY| Raffles Institution                                  555856
    SGP                                                                                                                                 SINGAPORE
                                                                              GST Registration
                                                                              201528112W



Description                                                                                                                                                  Quantity
Attention: Mr James Goh Junyi
Company: Raffles Institution
Address: 1 Raffles Institution Ln, Singapore 575954
Email Address: junyi.goh@ri.edu.sg
Contact Number: (65) 9797 6792
XVive U35C Wireless System for Condenser Microphones 5.8GHz

Warranty: 1 Year, Carry In to LTAPL Service Centre                                                                                                                4.00
IN STOCK
S/N: IntlE251100449, Intle251100452, Intle251000719, Intle251100448
Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter with SM58 Cardioid Capsule (Freq: G66)

Warranty: 2 Years, Carry In to SHURE Asia Service Centre                                                                                                          1.00
IN STOCK
S/N: 3EL26704289, 3FA0985618
Gravity CART M 01 B Multifunctional Trolley (Medium)
                                                                                                                                                                  2.00
IN STOCK
S/N: N/A
XVive AT-2 Portable Audio Tester

Warranty: 1 Year, Carry In to LTAPL Service Centre                                                                                                                1.00
IN STOCK
S/N: IntL260500638
Xvive Audio U3 2.4 GHz Digital Wireless Microphone System for Dynamic Microphones

Warranty: 1 Year, Carry In to LTAPL Service Centre
                                                                                                                                                                  4.00
IN STOCK
S/N: Int1241204279, Int1241204276, Int1241204210,
Int1241203023
DEL, Delivery Services with return Trip for Signed Delivery Order
Required for GeBiz or Vendors.Gov billing or accounts on payment terms.
Delivery only to loading bay/guardhouse, no break bulk.
                                                                                                                                                                  1.00
*Important Note: Once delivery slot has been arranged and notified to the person(s) in charge, every failed
delivery due to consignee being uncontactable or rejection of delivery at site will incur REDELIVERY
charges.
-

Signature & Company Stamp
We hereby acknowledge receipt of these items and/or services as stated

                      Company Registration No: UEN: 201528112W. Registered Office: 50, Serangoon North Avenue 4, #07-03 First Centre, 555856, Singapore
Description                                                                                                                                               Quantity
NOTE: Supply and delivery only.
`
}
];

const key=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]+/g,' ');
const near=(a,b)=>Math.abs(Number(a)-Number(b))<=0.06;
function combined(r){return key([r.sku,r.model,r.item_name,r.description].filter(Boolean).join(' '));}
function findExpected(rows,ex){const n=key(ex.contains);return rows.find(r=>combined(r).includes(n));}
function serials(rows){
  const out=[];
  for(const r of rows||[]){
    if(String(r.serial_number||'').trim())out.push(String(r.serial_number).trim());
    for(const s of Array.isArray(r.serials)?r.serials:[])if(String(s||'').trim()&&!/^N\/?A$/i.test(String(s).trim()))out.push(String(s).trim());
  }
  return out;
}
async function parse(test){
  const rawSourceRows=globalThis.AVParserV7.parseText(test.raw,'phase2-actual-pdf-native',1);
  const base={doc:{supplier_name:test.supplier,invoice_number:test.invoice},items:rawSourceRows,invoiceClassification:{type:'equipment'},raw:test.raw};
  const evidence=[{source:'phase2-actual-pdf-native',kind:'native',text:test.raw,page:1,layout:[]}];
  const enhanced=globalThis.AVParserV7.enhanceParsed({parsed:base,raw:test.raw,layout:[],evidenceSources:evidence});
  const v2=await V2.verifyParsed(enhanced,{raw:test.raw,inventoryItems:[],supplierName:test.supplier,doc:enhanced.doc||base.doc,webVerifier:null});
  const v3=await V3.evaluate(v2.parsed,{fullEvidence:evidence,inventoryItems:[],verifyGate:V2,webVerifier:null});
  const review=V4Review.materialize(v3.parsed,enhanced.items||[]);
  const before=V41.auditRows(review.items||[],{raw:test.raw,sources:evidence});
  const recovered=V41.recoverRows(review.items||[],{raw:test.raw,sources:evidence});
  return {rawSourceRows,review,before,recovered,rows:recovered.outputRows||[]};
}

(async()=>{
  let passCount=0;
  for(const test of cases){
    const result=await parse(test);
    const rows=result.rows;
    const problems=[];
    if(rows.length!==test.expectedCount)problems.push('expected '+test.expectedCount+' final equipment rows, got '+rows.length);
    for(const ex of test.expected){
      const row=findExpected(rows,ex);
      if(!row){problems.push('missing '+ex.contains);continue;}
      if(Number(row.quantity)!==Number(ex.qty))problems.push(ex.contains+' qty expected '+ex.qty+' got '+row.quantity);
      if(!near(row.unit_price,ex.unit))problems.push(ex.contains+' unit expected '+ex.unit+' got '+row.unit_price);
      if(!near(row.amount,ex.amount))problems.push(ex.contains+' amount expected '+ex.amount+' got '+row.amount);
    }
    const all=key(rows.map(combined).join(' | '));
    for(const bad of test.forbidden||[])if(all.includes(key(bad)))problems.push('forbidden service row leaked: '+bad);
    if(result.recovered.randomCharacterFailureCount!==0)problems.push('contaminated/random characters survived: '+JSON.stringify(result.recovered.hardFailures));
    if(test.expectedUniqueSerials!=null){
      const ss=serials(rows),uniq=new Set(ss.map(key));
      if(uniq.size!==test.expectedUniqueSerials)problems.push('expected '+test.expectedUniqueSerials+' unique serials, got '+uniq.size+' ('+ss.join(', ')+')');
      if(ss.length!==uniq.size)problems.push('duplicate serials survived final rows');
    }
    const pass=problems.length===0;
    if(pass)passCount++;
    console.log('PHASE2 ACTUAL PDF RAW '+test.id+': '+(pass?'PASS':'FAIL')+
      ' rawSourceRows='+result.rawSourceRows.length+
      ' finalRows='+rows.length+
      ' beforeRandomFlags='+result.before.randomCharacterFailureCount+
      ' targetedRecovery='+result.recovered.targetedRecoveryCount+
      (problems.length?' :: '+problems.join(' | '):''));
  }
  console.log('PHASE2 FAIRNESS CONTRACT: actual PDF-derived raw text only; expected values are scoring-only; no prebuilt/post-extraction rows supplied');
  console.log('PHASE2 ACTUAL PDF RAW SUMMARY: '+passCount+'/'+cases.length+' PASS');
  if(passCount!==cases.length)process.exitCode=9;
})().catch(err=>{console.error(err.stack||err);process.exit(1);});
