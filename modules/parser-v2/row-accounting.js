// Inventory Hub Parser V2 — candidate-union row accounting
(function(global){
  'use strict';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const finite=v=>Number.isFinite(Number(v));
  const round2=v=>finite(v)?Math.round(Number(v)*100)/100:null;
  function economics(row={}){
    const q=Number(row.quantity),p=Number(row.unit_price),a=Number(row.amount);
    if(!(q>0)||!finite(p)||!finite(a))return {complete:false,ok:false};
    const delta=Math.abs(q*p-a),tol=Math.max(.03,Math.abs(a)*.003);
    return {complete:true,ok:delta<=tol,delta:round2(delta)};
  }
  function baseIdentity(row={}){
    const sku=norm(row.sku||row.model||'').replace(/\s+/g,'');
    const desc=norm(row.item_name||row.description||'').replace(/\b(?:supply|with|including|the|a|an|pcs?|piece|set)\b/g,' ').replace(/\s+/g,' ').trim();
    const q=finite(row.quantity)?Number(row.quantity):'';
    const p=finite(row.unit_price)?round2(row.unit_price):'';
    const a=finite(row.amount)?round2(row.amount):'';
    const geo=row.sourceRowId||row.rowId||row?.provenance?.rowId||row?.invoice_evidence?.source?.rowId||'';
    // Semantic/economic identity comes first so the same physical row from native-layout and OCR-layout can reconcile.
    // Occurrence ordinals in buildLedger still preserve repeated identical rows within one invoice.
    if(sku)return 'sku:'+sku+'|q:'+q+'|p:'+p+'|a:'+a;
    if(desc)return 'desc:'+desc.slice(0,90)+'|q:'+q+'|p:'+p+'|a:'+a;
    if(geo)return 'row:'+String(geo);
    return '';
  }
  function classifyDisposition(row={}){
    const explicit=String(row?.classification?.type||'').toLowerCase();
    if(['equipment','service','accessory','warranty','metadata','noninventory'].includes(explicit))return explicit==='noninventory'?'accessory':explicit;
    const text=norm([row.sku,row.model,row.item_name,row.description].filter(Boolean).join(' '));
    if(!text)return 'unknown';
    if(/\b(?:serial|s n|shipment no|remarks?|notes?)\b/.test(text)&&!finite(row.amount))return 'metadata';
    if(/\b(?:warranty|extended warranty|support coverage|maintenance coverage)\b/.test(text))return 'warranty';
    const code=norm(row.sku||row.model||'');
    if(/^\d{4,}\s+(?:installation|labour|labor|service)\b/.test(code))return 'service';
    if(/\b(?:installation|labour|labor|commissioning|testing|programming|dismantle|dismount|transport|delivery(?: fee| service| services)?|return trip|redelivery|courier|freight|service charge|repair service)\b/.test(text))return 'service';
    if(/\b(?:cable|wire|bracket|mount|lamp kit|cart|trolley|generic stand|power adaptor|adapter)\b/.test(text)&&!/\bmicrophone stand\b/.test(text))return 'accessory';
    const eq=/\b(?:projector|microphone|speaker|controller|control panel|keypad|camera|mixer|display|monitor|transmitter|receiver|screen|wireless system|amplifier|processor|switcher|visualizer|document camera|console|player|audio tester|signal tester|tester|analyzer|analyser|meter)\b/.test(text);
    if(eq&&economics(row).ok)return 'equipment';
    if(clean(row.sku||row.model)&&economics(row).ok)return 'equipment';
    return 'unknown';
  }
  function rowStrength(row={}){
    const e=economics(row);let s=0;
    if(clean(row.sku||row.model))s+=20;
    if(clean(row.item_name||row.description))s+=15;
    if(e.ok)s+=45;
    if(row.layoutEvidenceVerified)s+=12;
    if(row.economicEvidenceVerified)s+=12;
    if(row.provenance||row.invoice_evidence)s+=8;
    return s;
  }
  function buildLedger(candidates=[]){
    const groups=new Map();
    for(const candidate of candidates||[]){
      const occurrence=new Map(),origin=clean(candidate?.origin||'unknown');
      for(let index=0;index<(candidate?.items||[]).length;index++){
        const row={...(candidate.items[index]||{})},base=baseIdentity(row)||('anonymous:'+origin+':'+index);
        const ordinal=(occurrence.get(base)||0)+1;occurrence.set(base,ordinal);
        const key=base+'|occ:'+ordinal;
        if(!groups.has(key))groups.set(key,{key,variants:[],origins:new Set()});
        const g=groups.get(key);g.variants.push({origin,index,row,strength:rowStrength(row)});g.origins.add(origin);
      }
    }
    const ledger=[];
    for(const g of groups.values()){
      g.variants.sort((a,b)=>b.strength-a.strength);
      const representative={...g.variants[0].row},disposition=classifyDisposition(representative);
      ledger.push({
        key:g.key,
        row:representative,
        disposition,
        accounted:disposition!=='unknown',
        evidenceOrigins:[...g.origins],
        variantCount:g.variants.length,
        variants:g.variants
      });
    }
    return ledger;
  }
  function summarize(ledger=[]){
    const counts={equipment:0,service:0,accessory:0,warranty:0,metadata:0,unknown:0};
    for(const x of ledger)counts[x.disposition]=(counts[x.disposition]||0)+1;
    const detectedRows=ledger.length,accountedRows=ledger.filter(x=>x.accounted).length;
    return {detectedRows,accountedRows,unexplainedRows:detectedRows-accountedRows,complete:detectedRows===accountedRows,counts};
  }
  function compareFinalItems(ledger=[],finalItems=[]){
    const finalKeys=new Set(),occurrence=new Map();
    for(let i=0;i<(finalItems||[]).length;i++){
      const row=finalItems[i]||{},base=baseIdentity(row)||('final:'+i),ordinal=(occurrence.get(base)||0)+1;occurrence.set(base,ordinal);finalKeys.add(base+'|occ:'+ordinal);
    }
    const equipment=ledger.filter(x=>x.disposition==='equipment');
    const missingEquipment=equipment.filter(x=>!finalKeys.has(x.key));
    return {expectedEquipmentCount:equipment.length,finalEquipmentCount:(finalItems||[]).length,missingEquipment,complete:missingEquipment.length===0&&equipment.length===(finalItems||[]).length};
  }
  global.InventoryHubParserV2Rows=Object.freeze({version:'2.2-sales-equipment-evidence',economics,baseIdentity,classifyDisposition,rowStrength,buildLedger,summarize,compareFinalItems});
})(typeof window!=='undefined'?window:globalThis);
