/* Parser V4.1.2 r2: item-block identity recovery with authoritative-identity preservation.
 * Local evidence only: labelled same-item evidence may override weaker OCR, while a valid
 * source-supported identity is preserved when no stronger label exists.
 */
(function(root){
  'use strict';
  const VERSION='4.1.2-item-block-evidence-r2';
  const clean=v=>String(v??'').normalize('NFKC').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const compact=v=>clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,'');
  const words=v=>clean(v).toLowerCase().match(/[a-z0-9]{3,}/g)||[];
  const STOP=new Set(['supply','install','with','from','system','speaker','audio','video','each','unit','pcs','quantity','amount','price']);
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
      .map(clean)
      .filter(x=>modelShaped(x)&&!GENERIC_MODEL_WORDS.has(x.toUpperCase()));
    return {seen:true,value:tokens.length?tokens[tokens.length-1]:''};
  }
  function modelFromLabel(line=''){return labelInfo(line).value;}

  function enrichRegion(lines=[],kind='window'){
    const infos=lines.map(labelInfo),models=infos.map(x=>x.value).filter(Boolean);
    return {lines:[...lines],text:clean(lines.join(' ')),models,labelSeen:infos.some(x=>x.seen),kind};
  }
  function numberedBlocks(raw=''){
    const lines=String(raw||'').split(/\r?\n/).map(clean).filter(Boolean),blocks=[];let block=null;
    for(const line of lines){
      if(/^\d+[.)]?\s+/.test(line)){if(block)blocks.push(block);block={lines:[line]};continue;}
      if(block)block.lines.push(line);
    }
    if(block)blocks.push(block);
    return blocks.map(b=>enrichRegion(b.lines,'numbered-block'));
  }
  function rowTerms(row={}){
    return [...new Set(words([row.item_name,row.description].filter(Boolean).join(' ')).filter(w=>!STOP.has(w)))];
  }
  function currentIdentities(row={}){
    const vals=[row.sku,row.model].map(clean).filter(Boolean),seen=new Set(),out=[];
    for(const v of vals){const k=compact(v);if(k&&!seen.has(k)){seen.add(k);out.push(v);}}
    return out;
  }
  function regionScore(row={},region={}){
    const text=clean(region.text),nt=text.toLowerCase(),ct=compact(text),terms=rowTerms(row),ids=currentIdentities(row);
    let score=0,hits=0;
    for(const term of terms)if(nt.includes(term)){hits++;score+=1;}
    if(terms.length)score+=Math.min(2,(hits/terms.length)*2);
    for(const id of ids)if(compact(id)&&ct.includes(compact(id)))score+=5;
    if(EQUIPMENT_RE.test([row.item_name,row.description].filter(Boolean).join(' '))&&EQUIPMENT_RE.test(text))score+=1;
    if(region.labelSeen)score+=0.5;
    return score;
  }
  function fallbackWindows(raw='',row={}){
    const lines=String(raw||'').split(/\r?\n/).map(clean).filter(Boolean),out=[];
    for(let i=0;i<lines.length;i++){
      for(const radius of [1,2]){
        const lo=Math.max(0,i-radius),hi=Math.min(lines.length,i+radius+1);
        const r=enrichRegion(lines.slice(lo,hi),'local-window');
        const score=regionScore(row,r);
        if(score>=3)out.push({...r,score,start:lo,end:hi});
      }
    }
    const unique=new Map();
    for(const r of out){const k=r.text;if(!unique.has(k)||unique.get(k).score<r.score)unique.set(k,r);}
    return [...unique.values()].sort((a,b)=>b.score-a.score||(a.end-a.start)-(b.end-b.start)).slice(0,3);
  }
  function regionFor(row={},raw=''){
    const numbered=numberedBlocks(raw).map(r=>({...r,score:regionScore(row,r)})).filter(r=>r.score>=3);
    const windows=fallbackWindows(raw,row);
    const all=[...numbered,...windows].sort((a,b)=>b.score-a.score||(a.kind==='numbered-block'?-1:1));
    if(!all.length)return null;
    if(all[1]&&Math.abs(all[0].score-all[1].score)<0.25&&all[0].text!==all[1].text){
      const a=all[0],b=all[1],aIds=currentIdentities(row).some(id=>compact(a.text).includes(compact(id))),bIds=currentIdentities(row).some(id=>compact(b.text).includes(compact(id)));
      if(aIds!==bIds)return aIds?a:b;
    }
    return all[0];
  }
  function evidenceRegions(row={},context={}){
    const out=[],add=(text,source)=>{
      const r=regionFor(row,text);if(r)out.push({...r,source});
    };
    add(context.raw||'','raw');
    for(const s of context.sources||[])add(s?.text||s?.raw||'',clean(s?.source||s?.id||s?.label||'source'));
    const p=row.provenance||{};
    for(const text of [row.sourceText,row.rawSourceText,row.lineText,p.sourceText,p.raw,p.text,p.rawText].filter(Boolean)){
      const r=enrichRegion(String(text).split(/\r?\n/).map(clean).filter(Boolean),'provenance');
      r.score=regionScore(row,r)+4;out.push({...r,source:'provenance'});
    }
    const seen=new Map();
    for(const r of out){const k=clean(r.source)+'|'+r.text;if(!seen.has(k)||seen.get(k).score<r.score)seen.set(k,r);}
    return [...seen.values()].sort((a,b)=>b.score-a.score);
  }
  function blockFor(row,blocksOrRaw){
    if(typeof blocksOrRaw==='string')return regionFor(row,blocksOrRaw);
    const blocks=Array.isArray(blocksOrRaw)?blocksOrRaw:[];
    let best=null;
    for(const block of blocks){const score=regionScore(row,block);if(!best||score>best.score)best={block,score};}
    return best?.score>=3?best.block:null;
  }
  function explicitTrustedIdentity(row={},value=''){
    const k=compact(value);if(!k)return false;
    const candidates=[
      row.verifiedSku,row.verifiedModel,row.skuEvidenceValue,row.modelEvidenceValue,
      row?.fieldEvidence?.sku?.value,row?.fieldEvidence?.model?.value,
      row?.v41Evidence?.sku,row?.v41Evidence?.model
    ].map(clean).filter(Boolean);
    if(candidates.some(v=>compact(v)===k))return true;
    return row.identity_status==='verified'&&currentIdentities(row).some(v=>compact(v)===k);
  }
  function supportedCurrent(row={},value='',regions=[]){
    const k=compact(value);if(!k)return false;
    if(explicitTrustedIdentity(row,value))return true;
    if(!modelShaped(value))return false;
    return regions.some(r=>r.score>=3&&compact(r.text).includes(k));
  }
  function labelledChoice(row={},regions=[]){
    const votes=new Map();let labelSeen=false;
    for(const r of regions){
      if(r.labelSeen)labelSeen=true;
      for(const m of r.models||[]){
        const k=compact(m);if(!k)continue;
        const v=votes.get(k)||{value:m,weight:0,sources:new Set(),regions:0};
        const sourceKey=clean(r.source||r.kind||'region');
        v.weight+=Math.max(1,Math.min(4,Number(r.score)||1));v.sources.add(sourceKey);v.regions++;
        votes.set(k,v);
      }
    }
    const ranked=[...votes.values()].sort((a,b)=>b.weight-a.weight||b.sources.size-a.sources.size||b.regions-a.regions||a.value.localeCompare(b.value));
    if(!ranked.length)return {value:'',labelSeen,ambiguous:false,ranked};
    if(ranked[1]&&Math.abs(ranked[0].weight-ranked[1].weight)<0.5&&ranked[0].sources.size===ranked[1].sources.size){
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
    const text=clean([row.item_name,row.description,region?.text].filter(Boolean).join(' ')).toLowerCase();
    if(/digital\s+mixer|mixer\s+console/.test(text))return 'Digital Mixer';
    if(/(?:power\s+)?amplifier/.test(text)&&/\bdsp\b/.test(text))return 'Digital Power Amplifier with DSP';
    if(/passive\s+loudspeaker|passive\s+speaker|loudspeakers?\s+with\s+mounting/.test(text))return 'Passive Loudspeaker';
    if(/single\s+channel.*wireless.*handheld.*microphone/.test(text))return 'Single Channel Digital Wireless Handheld Microphone System';
    if(/monitor\s+speaker|speaker.*console/.test(text))return 'Monitor Speaker';
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
    const remainingFieldReview=!!next.v7033ReviewFields||!!next.v41IntegrityIssues||!!next.amountReviewRequired||!!next.quantityReviewRequired||!!next.unitPriceReviewRequired;
    if(!remainingFieldReview){
      delete next.v41ProductionReviewRequired;delete next.v41ShadowReviewRequired;
      delete next.humanReviewRequired;delete next.needsReview;
    }
    return next;
  }
  function apply(rows=[],context={}){
    const outputRows=(rows||[]).map(row=>{
      const regions=evidenceRegions(row,context),primary=regions[0]||null,choice=chooseIdentity(row,regions);
      const existingEquipment=clean(row.equipment_status);
      const equipmentSupported=existingEquipment==='verified'||EQUIPMENT_RE.test([row.item_name,row.description,primary?.text].filter(Boolean).join(' '));
      const name=semanticName(row,primary);
      const next={...row,
        sku:choice.value,model:choice.value||'',item_name:name,description:name,
        equipment_status:equipmentSupported?'verified':(existingEquipment||'needs_attention'),
        identity_status:choice.verified?'verified':'needs_attention',
        identity_provenance:choice.provenance,
        v412ItemBlock:{
          version:VERSION,
          text:primary?.text||'',
          source:primary?.source||'',
          labelledModels:(choice.ranked||[]).map(x=>x.value),
          preservedCurrent:choice.provenance==='preserved-source-supported-current'
        }
      };
      if(choice.verified){
        clearResolvedIdentityReview(next);
      }else{
        next.sku='';next.model='';next.skuReviewRequired=true;next.humanReviewRequired=true;next.needsReview=true;next.v41ProductionReviewRequired=true;
        const issues=(Array.isArray(next.v41IntegrityIssues)?next.v41IntegrityIssues:[]).filter(x=>!['sku','model'].includes(clean(x?.field).toLowerCase()));
        issues.push({field:'sku',code:choice.ambiguous?'conflicting-item-block-identity':'unresolved-item-block-identity',reason:choice.ambiguous?'Conflicting labelled model/SKU evidence exists inside the matched item evidence region.':'Equipment is supported but no trustworthy model/SKU/part number was established in its item evidence region.'});
        next.v41IntegrityIssues=issues;
        const fields={...(next.v7033ReviewFields||{})};fields.sku={status:'review',reason:'Identity evidence requires confirmation'};next.v7033ReviewFields=fields;
      }
      return next;
    });
    return Object.freeze({
      version:VERSION,mode:'item-block-recovery-before-validation-with-preservation',
      outputRows,
      unresolvedIdentityCount:outputRows.filter(r=>r.identity_status!=='verified').length,
      readyForProduction:outputRows.every(r=>r.equipment_status==='verified'&&r.identity_status==='verified'&&!r.v41ProductionReviewRequired)
    });
  }
  function selfTest(){
    const failures=[];
    const conceptRaw='1 Mixer console 1 100 100\nModel: Brand CQ12T\n2 Outdoor Dual Microphone Wall Receptacle 1 20 20\nModel: Neutrik';
    const c=apply([{sku:'ca1zr',item_name:'Mixer console'},{sku:'Neutrik',item_name:'Outdoor Dual Microphone Wall Receptacle'}],{raw:conceptRaw});
    if(c.outputRows[0].sku!=='CQ12T'||c.outputRows[0].item_name!=='Digital Mixer')failures.push('labelled same-block recovery failed');
    if(c.outputRows[1].sku!==''||c.outputRows[1].identity_status!=='needs_attention')failures.push('brand-only identity was not quarantined');
    const unnumberedRaw='XVive U35C Wireless System for Condenser Microphones 5.8GHz\n4.00 340.00 1,360.00\nShure SLXD2+ Digital Wireless Handheld Microphone Transmitter with SM58 Cardioid Capsule\n1.00 480.00 480.00';
    const u=apply([{sku:'U35C',item_name:'Wireless System for Condenser Microphones'},{sku:'SLXD2+',item_name:'Digital Wireless Handheld Microphone Transmitter'}],{raw:unnumberedRaw});
    if(u.outputRows[0].sku!=='U35C'||u.outputRows[1].sku!=='SLXD2+')failures.push('source-supported unlabelled identities were not preserved');
    const noHijack='1 Digital Mixer console\nModel: Brand CQ12T\n2 Passive Loudspeaker\nModel: Brand ZX1I-90';
    const h=apply([{sku:'bad',item_name:'Digital Mixer console'},{sku:'bad2',item_name:'Passive Loudspeaker'}],{raw:noHijack});
    if(h.outputRows[0].sku!=='CQ12T'||h.outputRows[1].sku!=='ZX1I-90')failures.push('row-local model isolation failed');
    return {ok:failures.length===0,version:VERSION,failures};
  }
  root.InventoryHubParserV412=Object.freeze({
    VERSION,modelShaped,labelInfo,modelFromLabel,numberedBlocks,itemBlocks:numberedBlocks,regionFor,evidenceRegions,blockFor,
    supportedCurrent,labelledChoice,chooseIdentity,semanticName,apply,selfTest
  });
})(typeof window!=='undefined'?window:globalThis);
