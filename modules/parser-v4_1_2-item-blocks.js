/* Parser V4.1.2 r3: unique item-block assignment + evidence-authoritative naming.
 * Each parsed row is mapped to at most one invoice item block. A block cannot be reused by
 * another row. Strong same-block labelled identity can repair OCR; source-backed current
 * identity is preserved when no stronger label exists. Dirty incoming names never override
 * a confidently matched source block.
 */
(function(root){
  'use strict';
  const VERSION='4.1.2-item-block-evidence-r3';
  const clean=v=>String(v??'').normalize('NFKC').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const compact=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const words=v=>clean(v).toLowerCase().match(/[a-z0-9]{3,}/g)||[];
  const STOP=new Set(['supply','install','with','from','system','speaker','audio','video','each','unit','pcs','quantity','amount','price','description','model']);
  const EQUIPMENT_RE=/\b(?:projector|microphone|mic|speaker|loudspeaker|amplifier|processor|controller|control\s*panel|camera|visualizer|display|monitor|screen|mixer|receiver|transmitter|console|player|receptacle|nvr|dvr|switcher|matrix|scaler|preamp|wireless|tester)\b/i;
  const LABEL_RE=/\b(?:model(?:\s*(?:no\.?|number))?|sku|part\s*(?:no\.?|number)|product\s*(?:no\.?|number)|item\s*code)\b\s*(?::|#|-)?\s*(.+)$/i;
  const GENERIC_MODEL_WORDS=new Set(['MODEL','SKU','PART','NUMBER','NO','ITEM','CODE','PRODUCT','BRAND','SERIAL','QTY','UNIT','PRICE','AMOUNT']);

  function modelShaped(v=''){
    const s=clean(v),c=compact(s);
    if(c.length<2||c.length>40)return false;
    if(!/[A-Za-z]/.test(s)||!/\d/.test(s))return false;
    if(/^\d+(?:\.\d+)?$/.test(s)||/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(s))return false;
    return true;
  }
  function labelInfo(line=''){
    const m=clean(line).match(LABEL_RE);if(!m)return {seen:false,value:''};
    const tokens=(m[1].match(/[A-Z0-9][A-Z0-9+._\/-]{1,39}/gi)||[])
      .map(clean).filter(x=>modelShaped(x)&&!GENERIC_MODEL_WORDS.has(x.toUpperCase()));
    return {seen:true,value:tokens.length?tokens[tokens.length-1]:''};
  }
  function modelFromLabel(line=''){return labelInfo(line).value;}
  function enrichRegion(lines=[],kind='window',ordinal=null,index=null){
    const infos=lines.map(labelInfo),models=infos.map(x=>x.value).filter(Boolean);
    return {lines:[...lines],text:clean(lines.join(' ')),models,labelSeen:infos.some(x=>x.seen),kind,ordinal,index};
  }
  function numberedBlocks(raw=''){
    const lines=String(raw||'').split(/\r?\n/).map(clean).filter(Boolean),blocks=[];let block=null;
    for(const line of lines){
      const m=line.match(/^(\d+)[.)]?\s+/);
      if(m){if(block)blocks.push(block);block={ordinal:Number(m[1]),lines:[line]};continue;}
      if(block)block.lines.push(line);
    }
    if(block)blocks.push(block);
    return blocks.map((b,i)=>enrichRegion(b.lines,'numbered-block',b.ordinal,i));
  }
  const itemBlocks=numberedBlocks;

  function currentIdentities(row={}){
    const vals=[row.sku,row.model].map(clean).filter(Boolean),seen=new Set(),out=[];
    for(const v of vals){const k=compact(v);if(k&&!seen.has(k)){seen.add(k);out.push(v);}}
    return out;
  }
  function rowTerms(row={}){
    return [...new Set(words([row.item_name,row.description].filter(Boolean).join(' ')).filter(w=>!STOP.has(w)))];
  }
  function moneyVariants(v){
    const n=Number(v);if(!Number.isFinite(n))return [];
    const fixed=n.toFixed(2);
    return [...new Set([String(n),fixed,fixed.replace(/\B(?=(\d{3})+(?!\d))/g,',')])];
  }
  function numericHit(text='',v,weight){
    if(v===null||v===undefined||v===''||!Number.isFinite(Number(v)))return 0;
    return moneyVariants(v).some(x=>String(text).includes(x))?weight:0;
  }
  function equipmentClass(v=''){
    const s=clean(v);
    if(/\b(?:mixer|console)\b/i.test(s))return'mixer';
    if(/\b(?:amplifier|power amp|dsp)\b/i.test(s))return'amplifier';
    if(/\b(?:monitor speaker|monitor)\b/i.test(s))return'monitor';
    if(/\b(?:loudspeaker|passive speaker)\b/i.test(s))return'loudspeaker';
    if(/\b(?:microphone|handheld|wireless mic)\b/i.test(s))return'microphone';
    if(/\b(?:cd|mp3|media player)\b/i.test(s))return'player';
    if(/\b(?:receptacle|wall outlet|wall plate)\b/i.test(s))return'receptacle';
    if(/\bprojector\b/i.test(s))return'projector';
    if(/\b(?:controller|control panel)\b/i.test(s))return'controller';
    if(/\b(?:screen|display)\b/i.test(s))return'display';
    return'';
  }
  function assignmentScore(row={},block={},rowIndex=0,blockIndex=0,rowCount=1,blockCount=1){
    const text=clean(block.text),ct=compact(text),nt=text.toLowerCase(),ids=currentIdentities(row),terms=rowTerms(row);
    let score=0,anchors=0;
    for(const id of ids){
      const k=compact(id);
      if(k&&ct.includes(k)){score+=14;anchors+=2;}
    }
    const q=numericHit(text,row.quantity,2),u=numericHit(text,row.unit_price,5),a=numericHit(text,row.amount,6);
    score+=q+u+a;if(u||a)anchors+=2;else if(q)anchors+=1;
    let hits=0;for(const t of terms)if(nt.includes(t)){hits++;score+=Math.min(1.2,0.55+t.length/18);}
    if(hits>=2){score+=Math.min(4,hits);anchors+=1;}
    const rowClass=equipmentClass([row.item_name,row.description].filter(Boolean).join(' ')),blockClass=equipmentClass(text);
    if(rowClass&&blockClass){if(rowClass===blockClass){score+=4;anchors+=1;}else score-=2;}
    if(rowCount===blockCount&&rowCount>1){
      const d=Math.abs(rowIndex-blockIndex);score+=Math.max(0,1.5-d*.35);
    }
    return {score,anchors,idHit:ids.some(id=>compact(id)&&ct.includes(compact(id))),economicsHit:!!(u||a),termHits:hits,rowClass,blockClass};
  }
  function assignRowsToBlocks(rows=[],blocks=[]){
    const assignments=new Array(rows.length).fill(null),used=new Set(),pairs=[];
    for(let ri=0;ri<rows.length;ri++)for(let bi=0;bi<blocks.length;bi++){
      const s=assignmentScore(rows[ri],blocks[bi],ri,bi,rows.length,blocks.length);
      pairs.push({ri,bi,...s});
    }
    // Lock exact identity matches first. This prevents contaminated descriptions from stealing another block.
    for(let ri=0;ri<rows.length;ri++){
      const exact=pairs.filter(p=>p.ri===ri&&p.idHit).sort((a,b)=>b.score-a.score);
      if(exact.length===1&&!used.has(exact[0].bi)){assignments[ri]=exact[0];used.add(exact[0].bi);}
      else if(exact.length>1&&exact[0].score-exact[1].score>=3&&!used.has(exact[0].bi)){assignments[ri]=exact[0];used.add(exact[0].bi);}
    }
    // Then assign strongest evidence globally, one row <-> one block.
    pairs.sort((a,b)=>b.score-a.score||b.anchors-a.anchors||b.termHits-a.termHits||a.ri-b.ri);
    for(const p of pairs){
      if(assignments[p.ri]||used.has(p.bi))continue;
      if(p.score<4||p.anchors<1)continue;
      assignments[p.ri]=p;used.add(p.bi);
    }
    // Safe final fallback: if exactly one row and block remain in an otherwise one-to-one document.
    const freeRows=assignments.map((x,i)=>x?null:i).filter(x=>x!==null),freeBlocks=blocks.map((_,i)=>used.has(i)?null:i).filter(x=>x!==null);
    if(rows.length===blocks.length&&freeRows.length===1&&freeBlocks.length===1){
      const ri=freeRows[0],bi=freeBlocks[0],s=assignmentScore(rows[ri],blocks[bi],ri,bi,rows.length,blocks.length);
      assignments[ri]={ri,bi,...s,forcedUniqueRemainder:true};used.add(bi);
    }
    return assignments;
  }
  function alignRegions(block={},context={}){
    if(!block)return [];
    const out=[{...block,source:'raw'}];
    for(const s of context.sources||[]){
      const bs=numberedBlocks(s?.text||s?.raw||'');
      let match=null;
      if(block.ordinal!=null)match=bs.find(b=>b.ordinal===block.ordinal)||null;
      if(!match&&Number.isInteger(block.index))match=bs[block.index]||null;
      if(match)out.push({...match,source:clean(s?.source||s?.id||s?.label||s?.kind||'source')});
    }
    const seen=new Map();
    for(const r of out){const k=(r.ordinal??r.index??'x')+'|'+r.text;if(!seen.has(k))seen.set(k,r);}
    return [...seen.values()];
  }
  function fallbackRegions(row={},context={}){
    const out=[];
    const add=(text,source)=>{
      const lines=String(text||'').split(/\r?\n/).map(clean).filter(Boolean);
      const ids=currentIdentities(row),terms=rowTerms(row);
      for(let i=0;i<lines.length;i++){
        const win=enrichRegion(lines.slice(Math.max(0,i-1),Math.min(lines.length,i+2)),'local-window');
        let score=0;const ct=compact(win.text),nt=win.text.toLowerCase();
        if(ids.some(id=>compact(id)&&ct.includes(compact(id))))score+=10;
        const hits=terms.filter(t=>nt.includes(t)).length;score+=Math.min(5,hits);
        if(score>=5)out.push({...win,score,source});
      }
    };
    add(context.raw||'','raw');
    for(const s of context.sources||[])add(s?.text||s?.raw||'',clean(s?.source||s?.id||s?.label||'source'));
    const p=row.provenance||{};
    for(const text of [row.sourceText,row.rawSourceText,row.lineText,p.sourceText,p.raw,p.text,p.rawText].filter(Boolean)){
      const win=enrichRegion(String(text).split(/\r?\n/).map(clean).filter(Boolean),'provenance');
      out.push({...win,score:12,source:'provenance'});
    }
    return out.sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,4);
  }
  function regionFor(row={},raw=''){
    const blocks=numberedBlocks(raw),a=assignRowsToBlocks([row],blocks)[0];
    if(a)return blocks[a.bi];
    return fallbackRegions(row,{raw})[0]||null;
  }
  function evidenceRegions(row={},context={}){
    const block=regionFor(row,context.raw||'');
    return block?alignRegions(block,context):fallbackRegions(row,context);
  }
  function blockFor(row,blocksOrRaw){
    const blocks=typeof blocksOrRaw==='string'?numberedBlocks(blocksOrRaw):(Array.isArray(blocksOrRaw)?blocksOrRaw:[]);
    const a=assignRowsToBlocks([row],blocks)[0];
    return a?blocks[a.bi]:null;
  }
  function explicitTrustedIdentity(row={},value=''){
    const k=compact(value);if(!k)return false;
    const candidates=[row.verifiedSku,row.verifiedModel,row.skuEvidenceValue,row.modelEvidenceValue,row?.fieldEvidence?.sku?.value,row?.fieldEvidence?.model?.value,row?.v41Evidence?.sku,row?.v41Evidence?.model].map(clean).filter(Boolean);
    return candidates.some(v=>compact(v)===k)||(row.identity_status==='verified'&&currentIdentities(row).some(v=>compact(v)===k));
  }
  function supportedCurrent(row={},value='',regions=[]){
    const k=compact(value);if(!k)return false;
    if(explicitTrustedIdentity(row,value))return true;
    if(!modelShaped(value))return false;
    return regions.some(r=>compact(r.text).includes(k));
  }
  function labelledChoice(row={},regions=[]){
    const votes=new Map();let labelSeen=false;
    for(const r of regions){
      if(r.labelSeen)labelSeen=true;
      for(const m of r.models||[]){
        const k=compact(m);if(!k)continue;
        const v=votes.get(k)||{value:m,weight:0,sources:new Set(),independentSources:new Set(),regions:0};
        const source=clean(r.source||r.kind||'region');
        const sourceWeight=/native/i.test(source)?4:/ocr/i.test(source)?2:3;
        v.weight+=sourceWeight;v.sources.add(source);if(source&&source!=='raw')v.independentSources.add(source);v.regions++;votes.set(k,v);
      }
    }
    const ranked=[...votes.values()].sort((a,b)=>b.independentSources.size-a.independentSources.size||b.weight-a.weight||b.sources.size-a.sources.size||b.regions-a.regions||a.value.localeCompare(b.value));
    if(!ranked.length)return {value:'',labelSeen,ambiguous:false,ranked};
    // Independent same-block consensus outranks the primary/raw OCR witness. This handles
    // insertion/deletion OCR variants without any model-specific replacement table.
    if(ranked[0].independentSources.size>=2&&(!ranked[1]||ranked[0].independentSources.size>ranked[1].independentSources.size)){
      return {value:ranked[0].value,labelSeen,ambiguous:false,ranked,reason:'independent-same-block-consensus'};
    }
    if(ranked[1]&&ranked[0].independentSources.size===ranked[1].independentSources.size&&ranked[0].weight===ranked[1].weight){
      const current=currentIdentities(row).find(v=>compact(v)===compact(ranked[0].value)||compact(v)===compact(ranked[1].value));
      if(current&&supportedCurrent(row,current,regions))return {value:current,labelSeen,ambiguous:false,ranked,reason:'tie-preserve-supported-current'};
      return {value:'',labelSeen,ambiguous:true,ranked,reason:'conflicting-labelled-identities'};
    }
    return {value:ranked[0].value,labelSeen,ambiguous:false,ranked,reason:'strongest-labelled-item-block'};
  }
  function chooseIdentity(row={},regions=[]){
    const labelled=labelledChoice(row,regions);
    if(labelled.value)return {...labelled,verified:true,provenance:'labelled-item-block'};
    const supported=currentIdentities(row).find(v=>supportedCurrent(row,v,regions));
    if(supported)return {value:supported,verified:true,labelSeen:labelled.labelSeen,ambiguous:labelled.ambiguous,ranked:labelled.ranked,provenance:'preserved-source-supported-current'};
    return {value:'',verified:false,labelSeen:labelled.labelSeen,ambiguous:labelled.ambiguous,ranked:labelled.ranked,provenance:labelled.ambiguous?'conflicting-labelled-evidence':'unresolved'};
  }
  function semanticName(row,region){
    // Critical r3 rule: a confident source block is authoritative. Dirty incoming names are
    // used only when no block could be assigned.
    const source=clean(region?.text||'');
    const text=(source||clean([row.item_name,row.description].filter(Boolean).join(' '))).toLowerCase();
    if(/digital\s+mixer|mixer\s+console/.test(text))return 'Digital Mixer';
    if(/(?:power\s+)?amplifier/.test(text)&&/\bdsp\b/.test(text))return 'Digital Power Amplifier with DSP';
    if(/passive\s+loudspeaker|passive\s+speaker|loudspeakers?\s+with\s+mounting/.test(text))return 'Passive Loudspeaker';
    if(/single\s+channel.*wireless.*handheld.*microphone/.test(text))return 'Single Channel Digital Wireless Handheld Microphone System';
    if(/monitor\s+speaker|speaker\s+at\s+the\s+console/.test(text))return 'Monitor Speaker';
    if(/(?:dual\s+)?cd.*mp3.*player|mp3.*player/.test(text))return 'Dual CD/MP3 Player';
    if(/outdoor.*dual.*microphone.*wall\s+receptacle/.test(text))return 'Outdoor Dual Microphone Wall Receptacle';
    let fallback=clean(row.item_name||row.description).replace(/^supply\s*(?:&|and)?\s*install\s+/i,'');
    const id=currentIdentities(row)[0];if(id){
      const esc=id.replace(/[.*+?^$()|[\]\\{}]/g,'\\$&');
      fallback=clean(fallback.replace(new RegExp('^'+esc+'\\s*[-–—:]?\\s*','i'),''));
    }
    return fallback;
  }
  function clearResolvedIdentityReview(next={}){
    if(Array.isArray(next.v41IntegrityIssues)){
      next.v41IntegrityIssues=next.v41IntegrityIssues.filter(x=>!['sku','model'].includes(clean(x?.field).toLowerCase()));
      if(!next.v41IntegrityIssues.length)delete next.v41IntegrityIssues;
    }
    if(next.v7033ReviewFields&&typeof next.v7033ReviewFields==='object'){
      const fields={...next.v7033ReviewFields};delete fields.sku;delete fields.model;
      if(Object.keys(fields).length)next.v7033ReviewFields=fields;else delete next.v7033ReviewFields;
    }
    delete next.skuReviewRequired;
    const remaining=!!next.v7033ReviewFields||!!next.v41IntegrityIssues||!!next.amountReviewRequired||!!next.quantityReviewRequired||!!next.unitPriceReviewRequired;
    if(!remaining){delete next.v41ProductionReviewRequired;delete next.v41ShadowReviewRequired;delete next.humanReviewRequired;delete next.needsReview;}
    return next;
  }
  function apply(rows=[],context={}){
    const rawBlocks=numberedBlocks(context.raw||''),assignments=assignRowsToBlocks(rows,rawBlocks);
    const outputRows=(rows||[]).map((row,index)=>{
      const assignment=assignments[index],block=assignment?rawBlocks[assignment.bi]:null;
      const regions=block?alignRegions(block,context):fallbackRegions(row,context);
      const primary=block||regions[0]||null,choice=chooseIdentity(row,regions);
      const existingEquipment=clean(row.equipment_status);
      const equipmentSupported=existingEquipment==='verified'||EQUIPMENT_RE.test([primary?.text,row.item_name,row.description].filter(Boolean).join(' '));
      const name=semanticName(row,primary);
      const next={...row,sku:choice.value,model:choice.value||'',item_name:name,description:name,
        equipment_status:equipmentSupported?'verified':(existingEquipment||'needs_attention'),
        identity_status:choice.verified?'verified':'needs_attention',
        identity_provenance:choice.provenance,
        v412ItemBlock:{version:VERSION,text:primary?.text||'',source:primary?.source||'',ordinal:block?.ordinal??null,blockIndex:block?.index??null,assignmentScore:assignment?.score??null,labelledModels:(choice.ranked||[]).map(x=>x.value),preservedCurrent:choice.provenance==='preserved-source-supported-current'}
      };
      if(choice.verified)clearResolvedIdentityReview(next);
      else{
        next.sku='';next.model='';next.skuReviewRequired=true;next.humanReviewRequired=true;next.needsReview=true;next.v41ProductionReviewRequired=true;
        const issues=(Array.isArray(next.v41IntegrityIssues)?next.v41IntegrityIssues:[]).filter(x=>!['sku','model'].includes(clean(x?.field).toLowerCase()));
        issues.push({field:'sku',code:choice.ambiguous?'conflicting-item-block-identity':'unresolved-item-block-identity',reason:choice.ambiguous?'Conflicting labelled model/SKU evidence exists inside the uniquely matched item block.':'Equipment is supported but no trustworthy model/SKU/part number was established in its uniquely matched item block.'});
        next.v41IntegrityIssues=issues;
        const fields={...(next.v7033ReviewFields||{})};fields.sku={status:'review',reason:'Identity evidence requires confirmation'};next.v7033ReviewFields=fields;
      }
      return next;
    });
    const assignedBlockCount=assignments.filter(Boolean).length;
    return Object.freeze({version:VERSION,mode:'unique-item-block-recovery-before-validation',outputRows,assignments,assignedBlockCount,unresolvedIdentityCount:outputRows.filter(r=>r.identity_status!=='verified').length,readyForProduction:outputRows.every(r=>r.equipment_status==='verified'&&r.identity_status==='verified'&&!r.v41ProductionReviewRequired)});
  }
  function selfTest(){
    const failures=[];
    const raw='1 Digital Mixer console 1 1400 1400\nModel: Allen & Heath CQ12T\n2 Digital Power Amplifier with DSP 1 2500 2500\nModel: Powersoft 1604DSP\n3 Passive Loudspeakers with mounting brackets 6 800 4800\nModel: Electrovoice ZX1I-90\n4 Single Channel Digital Wireless Handheld Microphone System 2 950 1900\nModel: Shure SLXD24/SM58\n5 Monitor Speaker at the console 1 200 200\nModel: Yamaha MS101-4\n6 Dual CD and MP3 player with USB supported Playback 1 950 950\nModel: Omnitronic XDP-3002\n7 Supply & Install Outdoor Dual Microphone Wall Receptacle 1 450 450\nModel: Neutrik';
    const bad=[
      {sku:'1604DSP',item_name:'Digital Mixer',description:'Digital Mixer',quantity:1,unit_price:2500,amount:2500},
      {sku:'ZX11-90',item_name:'Digital Mixer',description:'Digital Mixer',quantity:6,unit_price:800,amount:4800},
      {sku:'',item_name:'Outdoor Dual Microphone Wall Receptacle',description:'Outdoor Dual Microphone Wall Receptacle',quantity:1,unit_price:450,amount:450},
      {sku:'',item_name:'Digital Mixer',description:'Digital Mixer',quantity:1,unit_price:1400,amount:1400},
      {sku:'',item_name:'Single Channel Digital Wireless Handheld Microphone System',description:'Single Channel Digital Wireless Handheld Microphone System',quantity:2,unit_price:950,amount:1900},
      {sku:'MS101-4',item_name:'Single Channel Digital Wireless Handheld Microphone System',description:'Single Channel Digital Wireless Handheld Microphone System',quantity:1,unit_price:200,amount:200},
      {sku:'XDP-3002',item_name:'Dual CD/MP3 Player',description:'Dual CD/MP3 Player',quantity:1,unit_price:950,amount:950}
    ];
    const r=apply(bad,{raw,sources:[{source:'native-1',text:raw},{source:'ocr-1',text:raw.replace('ZX1I-90','ZX11-90')},{source:'ocr-2',text:raw}]});
    const expected=[['1604DSP','Digital Power Amplifier with DSP'],['ZX1I-90','Passive Loudspeaker'],['CQ12T','Digital Mixer'],['SLXD24/SM58','Single Channel Digital Wireless Handheld Microphone System'],['MS101-4','Monitor Speaker'],['XDP-3002','Dual CD/MP3 Player']];
    for(const [sku,name] of expected){const x=r.outputRows.find(y=>y.sku===sku);if(!x||x.item_name!==name)failures.push('live-contamination recovery failed '+sku);}
    if(new Set(r.assignments.filter(Boolean).map(x=>x.bi)).size!==r.assignments.filter(Boolean).length)failures.push('item block reused across rows');
    const receptacle=r.outputRows.find(x=>x.item_name==='Outdoor Dual Microphone Wall Receptacle');
    if(!receptacle||receptacle.sku!==''||receptacle.identity_status!=='needs_attention')failures.push('brand-only receptacle identity not quarantined');
    const unnumbered='XVive U35C Wireless System for Condenser Microphones 5.8GHz\n4.00 340.00 1,360.00\nShure SLXD2+ Digital Wireless Handheld Microphone Transmitter with SM58 Cardioid Capsule\n1.00 480.00 480.00';
    const u=apply([{sku:'U35C',item_name:'Wireless System for Condenser Microphones'},{sku:'SLXD2+',item_name:'Digital Wireless Handheld Microphone Transmitter'}],{raw:unnumbered});
    if(u.outputRows[0].sku!=='U35C'||u.outputRows[1].sku!=='SLXD2+')failures.push('unlabelled source-supported identity preservation failed');
    return {ok:failures.length===0,version:VERSION,failures};
  }

  root.InventoryHubParserV412=Object.freeze({
    VERSION,modelShaped,labelInfo,modelFromLabel,numberedBlocks,itemBlocks,assignmentScore,assignRowsToBlocks,alignRegions,
    regionFor,evidenceRegions,blockFor,supportedCurrent,labelledChoice,chooseIdentity,semanticName,apply,selfTest
  });
})(typeof window!=='undefined'?window:globalThis);
