const fs=require('fs');
const vm=require('vm');
const assert=require('node:assert/strict');

require('../modules/document-authority-v411-recovery1.js');
const A=globalThis.InventoryHubDocumentAuthorityV411Recovery1;
assert.ok(A,'Recovery1 document authority did not initialise');
const self=A.selfTest();
assert.equal(self.ok,true,'Recovery1 self-test failed: '+JSON.stringify(self.failures));

const ctx={console,setTimeout,clearTimeout,Date,JSON,Math,Number,String,Array,Object,Set,Map,RegExp,Intl};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync('v7033-core.js','utf8'),ctx,{filename:'v7033-core.js'});
const core=ctx.V7033Patch;
assert.ok(core,'V7033Patch did not initialise');

for(const title of ['PURCHASE ORDER','DELIVERY ORDER','QUOTATION','PROFORMA INVOICE','PACKING LIST','SERVICE REPORT','SERVICE INVOICE','CREDIT NOTE','DEBIT NOTE']){
  const text=title+'\nInvoice No: INV-12345\nDescription Qty Unit Price Amount\nPT-VW540 Projector 1 804.00 804.00\nSubtotal 804.00\nGST 72.36\nGrand Total 876.36';
  const r=core.classifyInvoicePage(text);
  assert.equal(r.allowed,false,title+' must be rejected even with invoice-like fields/equipment rows');
}

const legitimate=['TAX INVOICE','Invoice No: INV-12345','P/O NO. PO/2026/1234','Sold To: Example School','PRODUCT NO. DESCRIPTION QUANTITY UNIT PRICE AMOUNT','PT-VW540 Panasonic Projector 1 804.00 804.00','SUBTOTAL 804.00','GST 72.36','AMOUNT DUE 876.36'].join('\n');
assert.equal(core.classifyInvoicePage(legitimate).allowed,true,'P/O reference field inside genuine Tax Invoice must not cause false rejection');

const serviceOnly=['TAX INVOICE','Invoice No.: INV-050430','PRODUCT NO. DESCRIPTION QUANTITY UNIT PRICE AMOUNT','DISMANTLE & RELOCATE Supply labour to dismantle the existing AV 1 700.00 700.00','SALES - INSTALLATION Supply Labour to re-instate back the existing AV 1 3,100.00 3,100.00','SUB TOTAL 3,800.00','GST 342.00','AMOUNT 4,142.00'].join('\n');
const contaminated=[{sku:'R2002',item_name:'Raffles Institution Lane',description:'Raffles Institution Lane',quantity:1,unit_price:700,amount:700}];
assert.equal(A.classifyContent({evidence:serviceOnly,rawRows:[
  {sku:'DISMANTLE',item_name:'Supply labour to dismantle the existing AV',quantity:1,unit_price:700,amount:700},
  {sku:'SALES-INSTALLATION',item_name:'Supply Labour to re-instate back the existing AV',quantity:1,unit_price:3100,amount:3100}
],inventoryRows:contaminated}).type,'service','contaminated metadata row must not promote a service-only invoice');

const mixed='TAX INVOICE\nPT-VW540 Panasonic Projector 1 804.00 804.00\nINSTALLATION Labour to install projector 1 200.00 200.00';
assert.equal(A.classifyContent({evidence:mixed,rawRows:[
  {sku:'PT-VW540',item_name:'Panasonic Projector',quantity:1,unit_price:804,amount:804},
  {sku:'INSTALLATION',item_name:'Labour to install projector',quantity:1,unit_price:200,amount:200}
]}).type,'equipment','mixed invoice must keep real equipment and exclude service');

const bundled='TAX INVOICE\nSupply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00';
assert.equal(A.classifyContent({evidence:bundled,rawRows:[{item_name:'Supply & Install Outdoor Dual Microphone Wall Receptacle',quantity:1,unit_price:450,amount:450}]}).type,'equipment','physical equipment must survive Supply & Install wording');

for(const a of ['1 Raffles Institution Lane Singapore 575954','Blk 2023 Bukit Batok Industrial Park A St.23 #02-104 Singapore 659528','10 Ubi Crescent #06-93 Singapore 408564','Customer Code R2002 Sold To Example School']){
  assert.equal(A.strongPhysicalRow({item_name:a,quantity:1,unit_price:100,amount:100},a),false,'metadata/address must not be physical evidence: '+a);
}

const fakePhysical='TAX INVOICE\nSupply labour to dismantle existing AV projector 1 700.00 700.00\nSupply labour to reinstate existing AV projector 1 3100.00 3100.00';
assert.equal(A.classifyContent({evidence:fakePhysical,rawRows:[{item_name:'Projector',quantity:1,unit_price:700,amount:700}]}).type,'service','unsupported contaminated physical row must not promote service invoice');


// Unseen-document stress matrix: title variants and service wording must not depend on supplier/model.
for(const text of [
  'PURCHASE ORDER\nInvoice No INV-9\nPT-VW540 Projector 1 804.00 804.00',
  'DELIVERY NOTE\nCQ12T Digital Mixer 1 1400.00 1400.00',
  'DELIVERY SLIP\nSLXD24/SM58 Wireless Microphone 2 950.00 1900.00',
  'SERVICE REPORT\nPT-VW540 Projector 1 804.00 804.00',
  'SERVICE INVOICE\nCQ12T Digital Mixer 1 1400.00 1400.00'
]){
  const r=core.classifyInvoicePage(text);
  assert.equal(r.allowed,false,'prohibited document title escaped page authority: '+text.split('\\n')[0]);
}

for(const desc of [
  'Supply labour to dismantle the existing projector',
  'Labour to relocate existing AV system',
  'Dismount and reinstate existing display',
  'Testing and commissioning of existing audio system',
  'Repair service for existing mixer',
  'On-site support for wireless microphone system'
]){
  const ev='TAX INVOICE\nPRODUCT NO. DESCRIPTION QUANTITY UNIT PRICE AMOUNT\nSERVICE '+desc+' 1 500.00 500.00';
  const r=A.classifyContent({evidence:ev,rawRows:[{sku:'SERVICE',item_name:desc,description:desc,quantity:1,unit_price:500,amount:500}]});
  assert.equal(r.type,'service','service wording containing equipment escaped: '+desc);
}

for(const row of [
  {sku:'CQ12T',item_name:'Allen & Heath Digital Mixer',quantity:1,unit_price:1400,amount:1400},
  {sku:'PT-VW540',item_name:'Panasonic Projector',quantity:1,unit_price:804,amount:804},
  {sku:'SLXD24/SM58',item_name:'Shure Wireless Microphone System',quantity:2,unit_price:950,amount:1900}
]){
  const ev='TAX INVOICE\n'+row.sku+' '+row.item_name+' '+row.quantity+' '+row.unit_price.toFixed(2)+' '+row.amount.toFixed(2);
  assert.equal(A.classifyContent({evidence:ev,rawRows:[row]}).type,'equipment','real physical equipment was falsely rejected: '+row.sku);
}

console.log('V4.1.1 RECOVERY1 DOCUMENT AUTHORITY: SIMULATION PASS');