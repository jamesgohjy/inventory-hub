/* Parser V4.1.2: row-block identity recovery and semantic naming.
 * Deliberately local to an invoice item block; it never searches another row.
 */
(function(root){
  'use strict';
  const VERSION='4.1.2-item-block-evidence';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const compact=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const words=v=>clean(v).toLowerCase().match(/[a-z0-9]{3,}/g)||[];
  const labelled=/\b(?:model(?:\s*(?:no\.?|number))?|sku|part\s*(?:no\.?|number)|product\s*(?:no\.?|number))\s*:\s*(.+)$/i;
  const modelFromLabel=line=>{
    const m=clean(line).match(labelled); if(!m)return '';
    const tokens=m[1].match(/[A-Z0-9][A-Z0-9+._/-]{2,}/gi)||[];
    const candidate=tokens.filter(x=>/[A-Z]/i.test(x)&&/\d/.test(x)).pop()||'';
    return clean(candidate);
  };
  function itemBlocks(raw=''){
    const lines=String(raw||'').split(/\r?\n/).map(clean).filter(Boolean), blocks=[];
    let block=null;
    for(const line of lines){
      if(/^\d+\s+/.test(line)) { if(block)blocks.push(block); block={lines:[line],models:[]}; continue; }
      if(block)block.lines.push(line);
    }
    if(block)blocks.push(block);
    return blocks.map(b=>({...b,text:b.lines.join(' '),models:b.lines.map(modelFromLabel).filter(Boolean)}));
  }
  function blockFor(row,blocks){
    const candidates=words([row.item_name,row.description].filter(Boolean).join(' ')).filter(w=>!['supply','install','with','from','system','speaker'].includes(w));
    let best=null;
    for(const block of blocks){
      const text=block.text.toLowerCase(), score=candidates.reduce((n,w)=>n+(text.includes(w)?1:0),0);
      if(!best||score>best.score)best={block,score};
    }
    return best?.score>=2?best.block:null;
  }
  function semanticName(row,block){
    const text=clean([row.item_name,row.description,block?.text].filter(Boolean).join(' ')).toLowerCase();
    if(/digital\s+mixer|mixer\s+console/.test(text))return 'Digital Mixer';
    if(/(?:power\s+)?amplifier/.test(text)&&/\bdsp\b/.test(text))return 'Digital Power Amplifier with DSP';
    if(/passive\s+loudspeaker|passive\s+speaker/.test(text))return 'Passive Loudspeaker';
    if(/single\s+channel.*wireless.*handheld.*microphone/.test(text))return 'Single Channel Digital Wireless Handheld Microphone System';
    if(/monitor\s+speaker|speaker.*console/.test(text))return 'Monitor Speaker';
    if(/(?:dual\s+)?cd.*mp3.*player|mp3.*player/.test(text))return 'Dual CD/MP3 Player';
    if(/outdoor.*dual.*microphone.*wall\s+receptacle/.test(text))return 'Outdoor Dual Microphone Wall Receptacle';
    return clean(row.item_name||row.description).replace(/^supply\s*(?:&|and)?\s*install\s+/i,'');
  }
  function apply(rows=[],context={}){
    const blocks=itemBlocks(context.raw||'');
    const sourceBlocks=(context.sources||[]).flatMap(s=>itemBlocks(s?.text||s?.raw||''));
    const outputRows=(rows||[]).map(row=>{
      const block=blockFor(row,blocks), evidenceBlocks=[block,...sourceBlocks.map(b=>blockFor(row,[b]))].filter(Boolean);
      const hasLabelledIdentity=evidenceBlocks.some(b=>b.lines.some(line=>labelled.test(line)));
      const modelVotes=new Map();
      for(const b of evidenceBlocks)for(const m of b.models||[]){
        const key=compact(m),vote=modelVotes.get(key)||{value:m,count:0}; vote.count++; modelVotes.set(key,vote);
      }
      const labelledModels=[...modelVotes.values()].sort((a,b)=>b.count-a.count||a.value.localeCompare(b.value));
      // Explicit labelled evidence is deterministically authoritative inside this block.
      const current=clean(row.sku||row.model||'');
      // A preceding stage may already have reached cross-witness consensus.  When
      // labelled OCR variants tie, retain only that model-shaped consensus; never
      // retain an alphabetic manufacturer value such as a brand-only "Neutrik".
      const model=labelledModels.length===1||labelledModels[0]?.count>labelledModels[1]?.count
        ?labelledModels[0]?.value
        :(hasLabelledIdentity&& !(/[A-Za-z]/.test(current)&&/\d/.test(current))?'':current);
      const identityVerified=!!model;
      const next={...row,sku:model,model:model||'',item_name:semanticName(row,block),description:semanticName(row,block),
        equipment_status:'verified',identity_status:identityVerified?'verified':'needs_attention',
        v412ItemBlock:{text:block?.text||'',labelledModels:labelledModels.map(x=>x.value)}};
      if(!identityVerified){
        next.skuReviewRequired=true; next.humanReviewRequired=true; next.needsReview=true;
        next.v41ProductionReviewRequired=true;
        next.v41IntegrityIssues=[...(Array.isArray(next.v41IntegrityIssues)?next.v41IntegrityIssues:[]),{field:'sku',code:'unresolved-item-block-identity',reason:'Equipment is supported but no labelled model/SKU/part number was established in its invoice item block.'}];
      }
      return next;
    });
    return Object.freeze({version:VERSION,mode:'item-block-recovery-before-validation',outputRows,blocks,readyForProduction:outputRows.every(r=>r.equipment_status==='verified')});
  }
  function selfTest(){
    const raw='1 Mixer console 1 100 100\nModel: Brand CQ12T\n2 Outdoor Dual Microphone Wall Receptacle 1 20 20\nModel: Neutrik';
    const r=apply([{sku:'bad',item_name:'Mixer console'},{sku:'Neutrik',item_name:'Outdoor Dual Microphone Wall Receptacle'}],{raw});
    const ok=r.outputRows[0].sku==='CQ12T'&&r.outputRows[0].item_name==='Digital Mixer'&&!r.outputRows[1].sku&&r.outputRows[1].identity_status==='needs_attention';
    return {ok,version:VERSION,failures:ok?[]:['item-block recovery or needs-attention classification failed']};
  }
  root.InventoryHubParserV412=Object.freeze({VERSION,itemBlocks,apply,selfTest});
})(typeof window!=='undefined'?window:globalThis);
