const V4=require('../v7033-core.js');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};

// Sanitized transcription from the uploaded LTA Tax Invoice pages.
// It intentionally preserves wrapped S/N lines and quantity/economic rows.
// No parsed line-item rows or serial arrays are supplied to V4.
const raw=`TAX INVOICE
Description Quantity Unit Price Tax Amount SGD
XVive U35C Wireless System for Condenser
Microphones 5.8GHz
Warranty: 1 Year, Carry In to LTAPL Service
Centre
IN STOCK
S/N: IntlE251100449, Intle251100452,
Intle251000719, Intle251100448
4.00 340.00 9% 1,360.00
Shure SLXD2+ Digital Wireless Handheld
Microphone Transmitter with SM58 Cardioid
Capsule (Freq: G66)
Warranty: 2 Years, Carry In to SHURE Asia
Service Centre
IN STOCK
S/N: 3EL26704289, 3FA0985618
1.00 480.00 9% 480.00
Gravity CART M 01 B Multifunctional Trolley
(Medium)
IN STOCK
S/N: N/A
2.00 170.00 9% 340.00
XVive AT-2 Portable Audio Tester
Warranty: 1 Year, Carry In to LTAPL Service
Centre
IN STOCK
S/N: IntL260500638
1.00 270.00 9% 270.00
Xvive Audio U3 2.4 GHz Digital Wireless
Microphone System for Dynamic
Microphones
Warranty: 1 Year, Carry In to LTAPL Service
Centre
IN STOCK
S/N: Int1241204279, Int1241204276,
Int1241204210,
Int1241203023
4.00 275.00 9% 1,100.00
DEL, Delivery Services with return Trip for Signed Delivery Order
1.00 50.00 9% 50.00
Subtotal 3,600.00
Invoice Total SGD 3,924.00`;

const econ=/^\s*(\d+(?:[.]\d+)?)\s+\d[\d,]*[.]\d{2}\s+(?:\d+(?:[.]\d+)?%\s+)?\d[\d,]*[.]\d{2}\s*$/;
const meta=/^(?:TAX INVOICE|Description\b|Warranty:|IN STOCK|Centre$|Service Centre$|Subtotal\b|Invoice Total\b)/i;
const serialLabel=/^(?:S\s*[/\\.\-]?\s*N|S\.?N\.?|Serial\s*(?:No\.?|Number(?:s)?))\s*[:#.\-]?/i;

function deriveRowsFromRaw(text){
  const parsed=V4.v703315ExtractSerialBlocks(text),rows=[];
  for(const block of parsed.blocks){
    let qty=1;
    for(let j=block.endLineIndex+1;j<Math.min(parsed.lines.length,block.endLineIndex+7);j++){
      const m=parsed.lines[j].match(econ);if(m){qty=Math.max(1,Math.round(Number(m[1])));break;}
      if(serialLabel.test(parsed.lines[j]))break;
    }
    const desc=[];
    for(let j=block.lineIndex-1;j>=Math.max(0,block.lineIndex-12);j--){
      const line=parsed.lines[j];
      if(econ.test(line)||serialLabel.test(line)||/^(?:DEL,|Subtotal\b|Invoice Total\b)/i.test(line))break;
      if(meta.test(line))continue;
      desc.unshift(line);
    }
    const description=desc.join(' ').replace(/\s+/g,' ').trim();
    if(description)rows.push({sku:'',item_name:description,description,quantity:qty,serials:''});
  }
  return rows;
}

const sourceRows=deriveRowsFromRaw(raw);
assert(sourceRows.length===5,'Expected five source-derived serial-bearing equipment rows, got '+sourceRows.length);
const bound=V4.v703315BindSerialBlocks(sourceRows,raw);
const by=re=>bound.find(x=>re.test(String(x.description||x.item_name||'')));
const serials=row=>String(row?.serials||'').split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean);
const same=(a,b)=>a.length===b.length&&a.every(v=>b.includes(v));

const u35=by(/U35C/i),shure=by(/SLXD2/i),cart=by(/CART M 01 B/i),at2=by(/AT-2/i),u3=by(/Audio U3/i);
assert(u35&&same(serials(u35),['IntlE251100449','Intle251100452','Intle251000719','Intle251100448']),'U35C wrapped serials not recovered/bound correctly: '+JSON.stringify(u35));
assert(shure&&same(serials(shure),['3EL26704289','3FA0985618']),'Shure serials not recovered/bound correctly: '+JSON.stringify(shure));
assert(shure.serialCountReview===true&&shure.serialReviewRequired===true,'Shure qty 1 / two printed serials must be preserved and flagged for review');
assert(cart&&serials(cart).length===0&&cart.serialNotApplicable===true,'N/A serial evidence must remain blank/not-applicable');
assert(at2&&same(serials(at2),['IntL260500638']),'AT-2 serial not bound correctly: '+JSON.stringify(at2));
assert(u3&&same(serials(u3),['Int1241204279','Int1241204276','Int1241204210','Int1241203023']),'U3 wrapped serials not recovered/bound correctly: '+JSON.stringify(u3));

const all=bound.flatMap(serials);
assert(all.length===11,'Expected all 11 printed non-N/A serial numbers, got '+all.length);
assert(new Set(all.map(V4.compact)).size===11,'Duplicate serial introduced by binding');

// Label spelling/format variants must work through the same raw-input path.
for(const label of ['S/N:','S/N','SN:','S.N.:','Serial No:','Serial No.','Serial Number:','Serial Numbers:']){
  const text=`TAX INVOICE
Description Quantity Unit Price Tax Amount SGD
Acme MX-100 Test Device
IN STOCK
${label} ABC12345
1.00 10.00 9% 10.00`;
  const rows=deriveRowsFromRaw(text),result=V4.v703315BindSerialBlocks(rows,text);
  assert(result.length===1&&serials(result[0])[0]==='ABC12345','Serial label variant failed: '+label+' => '+JSON.stringify(result));
}

// Packing/Delivery Slip is not an authoritative serial source.
const slip=`PACKING/DELIVERY SLIP
Description Quantity
XVive U35C Wireless System for Condenser Microphones 5.8GHz
S/N: IntlE251100449, Intle251100452, Intle251000719, Intle251100448`;
const slipDecision=V4.classifyInvoicePage(slip);
assert(slipDecision.allowed===false,'Packing/Delivery Slip must not be authorised as invoice serial evidence: '+JSON.stringify(slipDecision));

console.log('V4 SERIAL RAW-INPUT ROWS: '+JSON.stringify(bound.map(x=>({item:x.item_name,quantity:x.quantity,serials:serials(x),serialCountReview:!!x.serialCountReview,serialNotApplicable:!!x.serialNotApplicable}))));
console.log('V4 SERIAL LABEL VARIANTS: 8/8 PASS');
console.log('V4 SERIAL PACKING-SLIP AUTHORITY: PASS');
console.log('V4 SERIAL RAW-INPUT SUMMARY: PASS rows='+bound.length+' serials='+all.length+'/11');
