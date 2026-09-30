const fs=require('fs');
const vm=require('vm');
const assert=require('node:assert/strict');

require('../modules/document-authority-v411-recovery1.js');
const A=globalThis.InventoryHubDocumentAuthorityV411Recovery1;
assert.ok(A,'Recovery1 document authority did not initialise');
const self=A.selfTest(); assert.equal(self.ok,true,'Recovery1 document-authority self-test failed: '+JSON.stringify(self.failures));

const ctx={console,setTimeout,clearTimeout,Date,JSON,Math,Number,String,Array,Object,Set,Map,RegExp,Intl};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync('v7033-core.js','utf8'),ctx,{filename:'v7033-core.js'});
const core=ctx.V7033Patch;
assert.ok(core,'V7033Patch did not initialise');

for(const title of ['PURCHASE ORDER','DELIVERY ORDER','QUOTATION','PROFORMA INVOICE','PACKING LIST','SERVICE REPORT','SERVICE INVOICE','CREDIT NOTE','DEBIT NOTE']){
  const text=[title,'Invoice No: INV-12345','Description Qty Unit Price Amount','PT-VW540 Projector 1 804.00 804.00','Subtotal 804.00','GST 72.36','Grand Total 876.36'].join('\n');
  const r=core.classifyInvoicePage(text);
  assert.equal(r.allowed,false,title+' must be rejected even when invoice-like fields/equipment rows are present');
}

const legitimate=['TAX INVOICE','Invoice No: INV-12345','P/O NO. PO/2026/1234','Sold To: Example School','PRODUCT NO. DESCRIPTION QUANTITY UNIT PRICE AMOUNT','PT-VW540 Panasonic Projector 1 804.00 804.00','SUBTOTAL 804.00','GST 72.36','AMOUNT DUE 876.36'].join('\n');
assert.equal(core.classifyInvoicePage(legitimate).allowed,true,'P/O reference field inside a genuine Tax Invoice must not cause false rejection');

const serviceOnly=['TAX INVOICE','Invoice No.: INV-050430','PRODUCT NO. DESCRIPTION QUANTITY UNIT PRICE AMOUNT','DISMANTLE & RELOCATE Supply labour to dismantle the existing AV 1 700.00 700.00','SALES - INSTALLATION Supply Labour to re-instate back the existing AV 1 3,100.00 3,100.00','SUB TOTAL 3,800.00','GST 342.00','AMOUNT 4,142.00'].join('\n');
const badPromoted=[{sku:'R2002',item_name:'Raffles Institution Lane',description:'Raffles Institution Lane',quantity:1,unit_price:700,amount:700}];
assert.equal(A.classifyContent({evidence:serviceOnly,rawRows:[
  {sku:'DISMANTLE',item_name:'Supply labour to dismantle the existing AV',quantity:1,unit_price:700,amount:700},
  {sku:'SALES-INSTALLATION',item_name:'Supply Labour to re-instate back the existing AV',quantity:1,unit_price:3100,amount:3100}
],inventoryRows:badPromoted}).type,'service','one contaminated/metadata row must not promote a service-only invoice');

const mixed=['TAX INVOICE','PT-VW540 Panasonic Projector 1 804.00 804.00','INSTALLATION Labour to install projector 1 200.00 200.00'].join('\n');
assert.equal(A.classifyContent({evidence:mixed,rawRows:[
  {sku:'PT-VW540',item_name:'Panasonic Projector',quantity:1,unit_price:804,amount:804},
  {sku:'INSTALLATION',item_name:'Labour to install projector',quantity:1,unit_price:200,amount:200}
]}).type,'equipment','mixed invoice must keep real equipment and exclude service');

const bundled=['TAX INVOICE','Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00'].join('\n');
assert.equal(A.classifyContent({evidence:bundled,rawRows:[{item_name:'Supply & Install Outdoor Dual Microphone Wall Receptacle',quantity:1,unit_price:450,amount:450}]}).type,'equipment','physical equipment must not be rejected merely because description says Supply & Install');

for(const a of ['1 Raffles Institution Lane Singapore 575954','Blk 2023 Bukit Batok Industrial Park A St.23 #02-104 Singapore 659528','10 Ubi Crescent #06-93 Singapore 408564','Customer Code R2002 Sold To Example School'])
  assert.equal(A.strongPhysicalRow({item_name:a,quantity:1,unit_price:100,amount:100}),false,'metadata/address must not be physical evidence: '+a);

console.log('V4.1.1 RECOVERY1 DOCUMENT AUTHORITY: SIMULATION PASS');
