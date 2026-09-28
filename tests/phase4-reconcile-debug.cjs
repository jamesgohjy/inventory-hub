const V=require('../v7033-core.js');
const show=(name,raw,items)=>{
  const rec=V.v703312jRecoverNumberedEquipmentRows(raw,[]);
  const out=V.applyParsedFixes({doc:{},items},raw,[]);
  console.log('PH4DEBUG '+name+' RECOVERED '+JSON.stringify(rec.map(r=>({sku:r.sku,item:r.item_name,q:r.quantity,p:r.unit_price,a:r.amount}))));
  console.log('PH4DEBUG '+name+' FINAL '+JSON.stringify(out.items.map(r=>({sku:r.sku,item:r.item_name,q:r.quantity,p:r.unit_price,a:r.amount}))));
};
const loudRaw='TAX INVOICE\nInvoice Number INV LTA-00215840\nXVive U35C Wireless System for Condenser Microphones 5.8GHz 4 340.00 1360.00\nShure SLXD2+ Digital Wireless Handheld Microphone Transmitter 1 480.00 480.00\nXVive AT-2 Portable Audio Tester 1 270.00 270.00\nXvive Audio U3 2.4 GHz Digital Wireless Microphone System 4 275.00 1100.00\nDEL, Delivery Services with return Trip for Signed Delivery Order 1 50.00 50.00';
show('LOUD',loudRaw,[
{sku:'U35C',item_name:'XVive U35C Wireless System for Condenser Microphones 5.8GHz',description:'XVive U35C Wireless System for Condenser Microphones 5.8GHz',quantity:4,unit_price:340,amount:1360},
{sku:'SLXD2+',item_name:'Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter',description:'Shure SLXD2+ Digital Wireless Handheld Microphone Transmitter',quantity:1,unit_price:480,amount:480},
{sku:'AT-2',item_name:'XVive AT-2 Portable Audio Tester',description:'XVive AT-2 Portable Audio Tester',quantity:1,unit_price:270,amount:270},
{sku:'U3',item_name:'Xvive Audio U3 Digital Wireless Microphone System',description:'Xvive Audio U3 Digital Wireless Microphone System',quantity:4,unit_price:275,amount:1100},
{sku:'DEL',item_name:'Delivery Services with return Trip for Signed Delivery Order',description:'Delivery Services with return Trip for Signed Delivery Order',quantity:1,unit_price:50,amount:50}
]);
const avRaw='TAX INVOICE\nInvoice No: VIN17-038478\nRef. No. VSO17-026212/V17-041821 DATE 15/12/23 P/O NO. PO/23/000056\nPT-MZI7K Replacement of AV Projector and control Panel 4 9,588.00 38,352.00\nET-EMT750 Projector Zoom Lens 4 3,080.00 12,320.00\nVS-442H2A Matrix Switcher 3 3,500.00 10,500.00\nRC-208/UK I/O Control Button Keypad 6 800.00 4,800.00\nTP-583TXR HDMI-HDBaseT Transmitter 8 590.00 4,720.00\nTP-583RXR Kramer 4K HDR HDMI Receiver 8 590.00 4,720.00\nSALES-INSTALLATION Cabling, Installation, Services 1 13,000.00 13,000.00';
show('AVMEDIA',avRaw,[
{sku:'PT-MZI7K',item_name:'Replacement of AV Projector and control Panel',description:'Replacement of AV Projector and control Panel',quantity:4,unit_price:9588,amount:38352},
{sku:'ET-EMT750',item_name:'Projector Zoom Lens',description:'Projector Zoom Lens',quantity:4,unit_price:3080,amount:12320},
{sku:'VS-442H2A',item_name:'Matrix Switcher',description:'Matrix Switcher',quantity:3,unit_price:3500,amount:10500},
{sku:'RC-208/UK',item_name:'I/O Control Button Keypad',description:'I/O Control Button Keypad',quantity:6,unit_price:800,amount:4800},
{sku:'TP-583TXR',item_name:'HDMI-HDBaseT Transmitter',description:'HDMI-HDBaseT Transmitter',quantity:8,unit_price:590,amount:4720},
{sku:'TP-583RXR',item_name:'Kramer 4K HDR HDMI Receiver',description:'Kramer 4K HDR HDMI Receiver',quantity:8,unit_price:590,amount:4720}
]);
