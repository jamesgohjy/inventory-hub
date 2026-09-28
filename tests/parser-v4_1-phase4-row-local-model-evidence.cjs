const V=require('../v7033-core.js');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,'');

function row(x={}){return {
  sku:x.sku||'',model:x.model||x.sku||'',item_name:x.name||'',
  description:x.desc||x.name||'',quantity:x.q??1,unit_price:x.p??null,amount:x.a??null,
  v703312kSource:x.source||'ocr-auto',v703312kSourceLine:x.line||'',v703314zPrintedModel:x.printed||''
};}

// 1. Exact live BADIC failure pattern: inferred SKU is wrong, but row-local source explicitly prints Model: Neutrik.
{
  const r=row({
    sku:'BADIC',name:'Outdoor Dual Microphone Wall Receptacle',q:1,p:450,a:450,
    line:'7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00 | Model: Neutrik'
  });
  const out=V.v703314zdResolveModelConsensus(r);
  assert(norm(out.sku)==='NEUTRIK','row-local printed model did not override BADIC: '+JSON.stringify(out));
  assert(out.humanReviewRequired,'conflicting inferred BADIC must remain review-visible');
}

// 2. Same physical row split across two OCR witnesses should become one Neutrik row.
{
  const rows=[
    row({sku:'BADIC',name:'Outdoor Dual Microphone Wall Receptacle',q:1,p:450,a:450,
      source:'table',line:'7 Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00'}),
    row({sku:'',name:'Quidoar Dual Microphone Wall Receptacle Neutrik',desc:'Outdoor Dual Microphone Wall Receptacle',q:1,p:450,a:450,
      source:'model-block',line:'7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450.00 450.00 | Model: Neutrik'})
  ];
  const out=V.v703314zdConsolidateRecoveredWitnesses(rows);
  assert(out.length===1,'BADIC/Neutrik split row did not consolidate: '+JSON.stringify(out));
  assert(norm(out[0].sku)==='NEUTRIK','correct row-local model did not win: '+JSON.stringify(out[0]));
}

// 3. Generic explicit-label formats.
{
  const samples=[
    ['Model: PTZ-400','PTZ400'],
    ['Model No: MX-0808','MX0808'],
    ['Model Number: DSP-44','DSP44'],
    ['M/N: RX-900','RX900'],
    ['SKU: AVS-320','AVS320'],
    ['Part No: SLX-D2+','SLXD2'],
    ['Item Code: CAM_12A','CAM12A']
  ];
  for(const [line,id] of samples){
    const got=V.v703314zdExplicitModelFromText(line);
    assert(got.length>=1&&norm(got[0].model)===id,'explicit model format failed '+line+' => '+JSON.stringify(got));
  }
}

// 4. No label = no invented model.
{
  const got=V.v703314zdExplicitModelFromText('Outdoor Dual Microphone Wall Receptacle Neutrik may be used');
  assert(got.length===0,'unlabelled description must not create a model: '+JSON.stringify(got));
}

// 5. N/A model is ignored.
{
  const got=V.v703314zdExplicitModelFromText('Model: N/A');
  assert(got.length===0,'N/A model should be ignored');
}

// 6. Equal-strength conflicting printed models remain fail-closed.
{
  const out=V.v703314zdConsolidateRecoveredWitnesses([
    row({sku:'ABC-100',printed:'ABC-100',name:'Audio Processor',q:1,p:1000,a:1000,source:'psm3',line:'4 Audio Processor 1 1000.00 1000.00 | Model: ABC-100'}),
    row({sku:'ABC-10O',printed:'ABC-10O',name:'Audio Processor',q:1,p:1000,a:1000,source:'psm6',line:'4 Audio Processor 1 1000.00 1000.00 | Model: ABC-10O'})
  ]);
  assert(out.length===1,'conflicting explicit pair should still be one physical row');
  assert(!String(out[0].sku||'').trim(),'equal-strength printed conflict must not guess a model: '+JSON.stringify(out[0]));
  assert(out[0].humanReviewRequired,'equal-strength conflict must require review');
}

console.log('PHASE4 ROW-LOCAL MODEL EVIDENCE: PASS 6/6 cases');
