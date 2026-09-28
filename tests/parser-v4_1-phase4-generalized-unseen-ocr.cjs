const V=require('../v7033-core.js');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');

const row=(x)=>({
  sku:x.sku||'',model:x.model||x.sku||'',item_name:x.name,description:x.desc||x.name,
  quantity:x.q??1,unit_price:x.p??null,amount:x.a??null,
  v703312kSource:x.source||'ocr-auto',v703312kSourceLine:x.line||x.name,
  v703314zPrintedModel:x.printed||'',v703314zOrdinal:x.ordinal||null,
  ...(x.printed?{v703314zPrintedModelEvidence:[{model:x.printed,source:x.source||'ocr-auto',line:x.line||x.name}]}:{})
});
const con=rows=>V.v703314zdConsolidateRecoveredWitnesses(rows);

// Case 1: printed model must beat an inferred corrupted token for the same physical mixer.
{
  const out=con([
    row({sku:'caIZr',name:'Digital Mixer console Support up to 12 channels with 7 Multi Touch Screen',q:1,p:1400,a:1400,source:'table',ordinal:1}),
    row({sku:'CQ12T',printed:'CQ12T',name:'Digital Mixer console',desc:'Digital Mixer console Support up to 12 channels with 7 Multi Touch Screen',q:1,p:1400,a:1400,source:'model-ocr',ordinal:1})
  ]);
  assert(out.length===1,'case1 mixer duplicate did not collapse');
  assert(norm(out[0].sku)==='CQ12T','case1 printed CQ12T did not beat inferred caIZr: '+JSON.stringify(out[0]));
}

// Case 2: printed model must beat a corrupted inferred token for a wall receptacle.
{
  const out=con([
    row({sku:'BADIC',name:'Outdoor Dual Microphone Wall Receptacle',q:1,p:450,a:450,source:'table',ordinal:7}),
    row({sku:'Neutrik',printed:'Neutrik',name:'Outdoor Dual Microphone Wall Receptacle',q:1,p:450,a:450,source:'model-ocr',ordinal:7})
  ]);
  assert(out.length===1,'case2 receptacle duplicate did not collapse');
  assert(norm(out[0].sku)==='NEUTRIK','case2 printed Neutrik did not beat BADIC: '+JSON.stringify(out[0]));
}

// Case 3: two independent explicit reads beat one corrupted explicit OCR read.
{
  const out=con([
    row({sku:'AW-UE40',printed:'AW-UE40',name:'PTZ Camera',q:2,p:2200,a:4400,source:'psm3',ordinal:3}),
    row({sku:'AW-UE4O',printed:'AW-UE4O',name:'PTZ Camera',q:2,p:2200,a:4400,source:'psm4',ordinal:3}),
    row({sku:'AW-UE40',printed:'AW-UE40',name:'PTZ Camera',q:2,p:2200,a:4400,source:'psm6',ordinal:3})
  ]);
  assert(out.length===1,'case3 camera witnesses did not collapse');
  assert(norm(out[0].sku)==='AWUE40','case3 explicit majority did not select AW-UE40: '+JSON.stringify(out[0]));
}

// Case 4: conflicting explicit tie must fail closed into one review row, never two rows and never a guess.
{
  const out=con([
    row({sku:'MODEL-A1',printed:'MODEL-A1',name:'Digital Signal Processor',q:1,p:900,a:900,source:'psm3',ordinal:4}),
    row({sku:'MODEL-B1',printed:'MODEL-B1',name:'Digital Signal Processor',q:1,p:900,a:900,source:'psm6',ordinal:4})
  ]);
  assert(out.length===1,'case4 explicit tie must still represent one physical row');
  assert(!String(out[0].sku||'').trim(),'case4 explicit tie guessed a model: '+JSON.stringify(out[0]));
  assert(out[0].humanReviewRequired&&out[0].skuReviewRequired,'case4 explicit tie must require review');
}

// Case 5: different invoice line positions must never merge even with same type/qty/economics.
{
  const out=con([
    row({sku:'RX-A100',printed:'RX-A100',name:'Wireless Receiver',q:1,p:500,a:500,source:'psm3',ordinal:5}),
    row({sku:'RX-B200',printed:'RX-B200',name:'Wireless Receiver',q:1,p:500,a:500,source:'psm3',ordinal:6})
  ]);
  assert(out.length===2,'case5 distinct invoice rows were over-merged');
}

// Case 6: one model-backed witness plus a no-SKU table witness should consolidate.
{
  const out=con([
    row({sku:'',name:'4K HDMI Matrix Switcher',q:1,p:1800,a:1800,source:'table',ordinal:8}),
    row({sku:'MX-0808',printed:'MX-0808',name:'4K HDMI Matrix Switcher',q:1,p:1800,a:1800,source:'model-ocr',ordinal:8})
  ]);
  assert(out.length===1&&norm(out[0].sku)==='MX0808','case6 blank/model witness merge failed: '+JSON.stringify(out));
}

// Case 7: current live Concept symptom: 9 recovered OCR rows must become 7 physical items.
{
  const rows=[
    row({sku:'1604DSP',printed:'1604DSP',name:'Digital Power Amplifier with DSP',q:1,p:2500,a:2500,source:'model',ordinal:2}),
    row({sku:'ZX1I-90',printed:'ZX1I-90',name:'Passive Loudspeakers with mounting brackets',q:6,p:800,a:4800,source:'model',ordinal:3}),
    row({sku:'caIZr',name:'Digital Mixer console Support up to 12 channels with 7 Multi Touch Screen',q:1,p:1400,a:1400,source:'table',ordinal:1}),
    row({sku:'CQ12T',printed:'CQ12T',name:'Digital Mixer console',desc:'Digital Mixer console Support up to 12 channels with 7 Multi Touch Screen',q:1,p:1400,a:1400,source:'model',ordinal:1}),
    row({sku:'SLXD24/SM58',printed:'SLXD24/SM58',name:'Single Channel Digital Wireless Handheld Microphone System',q:2,source:'model',ordinal:4}),
    row({sku:'MS101-4',printed:'MS101-4',name:'Monitor Speaker at the console',q:1,source:'model',ordinal:5}),
    row({sku:'XDP-3002',printed:'XDP-3002',name:'Dual CD and MP3 player with USB supported Playback',q:1,source:'model',ordinal:6}),
    row({sku:'BADIC',name:'Outdoor Dual Microphone Wall Receptacle',q:1,p:450,a:450,source:'table',ordinal:7}),
    row({sku:'Neutrik',printed:'Neutrik',name:'Outdoor Dual Microphone Wall Receptacle',q:1,p:450,a:450,source:'model',ordinal:7})
  ];
  const out=con(rows);
  assert(out.length===7,'case7 live Concept 9->7 failed: '+JSON.stringify(out.map(x=>({sku:x.sku,item:x.item_name}))));
  for(const id of ['1604DSP','ZX1I90','CQ12T','SLXD24SM58','MS1014','XDP3002','NEUTRIK']){
    assert(out.some(r=>norm(r.sku)===id),'case7 missing '+id);
  }
  assert(!out.some(r=>['CAIZR','BADIC'].includes(norm(r.sku))),'case7 corrupted OCR model survived');
}

console.log('PHASE4 GENERALIZED UNSEEN OCR: PASS 7/7 cases');
