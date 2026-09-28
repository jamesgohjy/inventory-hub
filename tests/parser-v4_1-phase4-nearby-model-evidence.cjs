const V=require('../v7033-core.js');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');

const make=(x={})=>({
  sku:x.sku||'',model:x.model||x.sku||'',item_name:x.name||'',description:x.desc||x.name||'',
  quantity:x.q??1,unit_price:x.p??null,amount:x.a??null,
  v703312kSource:x.source||'ocr-auto',v703312kSourceLine:x.sourceLine||'',
  v703314zOrdinal:x.ordinal||null
});

// 1) Exact live wall-receptacle failure shape:
// one OCR row has corrupted BADIC; another has no SKU; retained invoice evidence has Model: Neutrik nearby.
{
  const raw=`TAX INVOICE
7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00
Model: Neutrik
8 Scope of Work 1 1800.00 1800.00`;
  const sources=[
    {source:'psm3',kind:'ocr',text:raw},
    {source:'psm4',kind:'ocr',text:raw.replace('Receptacle','Receplacie')},
    {source:'psm6',kind:'ocr',text:raw.replace('Outdoor Dual','Quidoar Dual')}
  ];
  const rows=[
    make({sku:'BADiC',name:'Outdoor Dual Microphone Wall Receptacle',q:1,p:450,a:450,ordinal:7,source:'psm3',
      sourceLine:'7 Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00'}),
    make({sku:'',name:'Quidoar Dual Microphone Wall Receplacie Neutrik Neutrik may',desc:'Outdoor Dual Microphone Wall Receptacle',q:1,p:450,a:450,ordinal:7,source:'psm6',
      sourceLine:'7 Quidoar Dual Microphone Wall Receplacie 1 450.00 450.00'})
  ];
  const enriched=rows.map(r=>V.v703314zeAttachNearbyModelEvidence(r,raw,sources));
  const out=V.v703314zdConsolidateRecoveredWitnesses(enriched);
  assert(out.length===1,'case1 wall receptacle did not consolidate: '+JSON.stringify(out));
  assert(norm(out[0].sku)==='NEUTRIK','case1 nearby Model: Neutrik did not replace BADIC: '+JSON.stringify(out[0]));
}

// 2) Correct loudspeaker model appears on 2/3 nearby Model lines; one witness is corrupted.
{
  const a=`3 Passive Loudspeakers with mounting brackets 6 800.00 4800.00
Model: Electrovoice ZX1I-90`;
  const b=a.replace('ZX1I-90','ZX11-90');
  const c=a.replace('Passive Loudspeakers','Passive Loudspeaker');
  const row=make({sku:'ZX11-90',name:'Passive Loudspeakers with mounting brackets',q:6,p:800,a:4800,ordinal:3,source:'psm4',
    sourceLine:'3 Passive Loudspeakers with mounting brackets 6 800.00 4800.00'});
  const out=V.v703314zeAttachNearbyModelEvidence(row,a,[
    {source:'psm3',kind:'ocr',text:a},
    {source:'psm4',kind:'ocr',text:b},
    {source:'psm6',kind:'ocr',text:c}
  ]);
  assert(norm(out.sku)==='ZX1I90','case2 2-of-3 nearby model consensus failed: '+JSON.stringify(out));
  assert(out.humanReviewRequired,'case2 disagreement should remain review-visible');
}

// 3) Model two lines below description.
{
  const raw=`5 PTZ Camera with optical zoom 2 2200.00 4400.00
Brand: ExampleVision
Model: EV-PTZ400
6 HDMI Switcher 1 900.00 900.00`;
  const row=make({sku:'',name:'PTZ Camera with optical zoom',q:2,p:2200,a:4400,ordinal:5,source:'native'});
  const out=V.v703314zeAttachNearbyModelEvidence(row,raw,[{source:'native',kind:'native',text:raw}]);
  assert(norm(out.sku)==='EVPTZ400','case3 two-lines-below model recovery failed: '+JSON.stringify(out));
}

// 4) Do not cross into next numbered row's Model line.
{
  const raw=`5 PTZ Camera with optical zoom 2 2200.00 4400.00
6 HDMI Switcher 1 900.00 900.00
Model: MX-0808`;
  const row=make({sku:'',name:'PTZ Camera with optical zoom',q:2,p:2200,a:4400,ordinal:5,source:'native'});
  const out=V.v703314zeAttachNearbyModelEvidence(row,raw,[{source:'native',kind:'native',text:raw}]);
  assert(!String(out.sku||'').trim(),'case4 crossed into next invoice row and stole MX-0808: '+JSON.stringify(out));
}

// 5) Unseen invoice without ordinal: anchor by description+economics, then read nearby Model line.
{
  const raw=`Wireless Receiver Rackmount 1 500.00 500.00
Model No: RX-900
Delivery fee 1 50.00 50.00`;
  const row=make({sku:'',name:'Wireless Receiver Rackmount',q:1,p:500,a:500,source:'ocr'});
  const out=V.v703314zeAttachNearbyModelEvidence(row,raw,[{source:'ocr',kind:'ocr',text:raw}]);
  assert(norm(out.sku)==='RX900','case5 non-ordinal row-local recovery failed: '+JSON.stringify(out));
}

// 6) Negative: unrelated nearby model with weak/no anchor must not be attached.
{
  const raw=`Tax Invoice
Project consultation 1 500.00 500.00
Model: NOT-A-PRODUCT
Wireless Receiver 1 900.00 900.00`;
  const row=make({sku:'',name:'Wireless Receiver',q:1,p:900,a:900,source:'ocr'});
  const out=V.v703314zeAttachNearbyModelEvidence(row,raw,[{source:'ocr',kind:'ocr',text:raw}]);
  assert(!String(out.sku||'').trim(),'case6 unrelated nearby model leaked into row: '+JSON.stringify(out));
}

console.log('PHASE4 NEARBY MODEL EVIDENCE: PASS 6/6 cases');
