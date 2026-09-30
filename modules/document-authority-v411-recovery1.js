/* Inventory Hub V4.1.1 Recovery Candidate 1
 * Generic document/content authority. No supplier-specific mappings.
 */
(function(root){
  'use strict';
  const VERSION='4.1.1-recovery1-document-authority';
  const clean=v=>String(v??'').normalize('NFKC').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  const rowText=r=>clean([r?.sku,r?.model,r?.item_name,r?.description].filter(Boolean).join(' '));
  const EQUIPMENT=/\b(?:projectors?|microphones?|mics?|speakers?|loudspeakers?|cameras?|mixers?|consoles?|displays?|monitors?|receivers?|transmitters?|amplifiers?|pre\s*amplifiers?|preamplifiers?|processors?|switchers?|visuali[sz]ers?|document\s+cameras?|control\s+panels?|controllers?|keypads?|lighting\s+controllers?|media\s+players?|cd\/?mp3\s+players?|receptacles?|audio\s+testers?|signal\s+testers?|scalers?|matrix|nvr|dvr|network\s+video\s+recorders?|digital\s+video\s+recorders?)\b/i;
  const SERVICE_SKU=/\b(?:INSTALL(?:ATION)?|LABOU?R|SERVICE|REPAIR|DISMOUNT(?:ING)?|DISMANTL(?:E|ING)|RE-?INSTAT(?:E|EMENT)|RELOCAT(?:E|ION)|REMOV(?:E|AL)|TEST(?:ING)?|COMMISSION(?:ING)?|DELIVERY|FREIGHT|TRANSPORT|COURIER)\b/i;
  const LABOUR=/\b(?:supply\s+)?labou?r\b|\bmanpower\b|\bprofessional\s+services?\b|\bconsult(?:ancy|ing)\b/i;
  const SERVICE_ACTION=/\b(?:dismantl(?:e|ed|ing)|dismount(?:ed|ing)?|de-?mount(?:ed|ing)?|re-?instat(?:e|ement|ing)|relocat(?:e|ion|ing)|remov(?:e|al|ing)|repair(?:ing|ed)?|testing|commissioning|programming|calibration|system\s+tuning|training|knowledge\s+transfer)\b/i;
  const SERVICE_START=/^(?:sales\s*[-:]\s*)?(?:installation|installing|installed|services?|service\s+work|repair(?:ing|ed)?|dismantl(?:e|ed|ing)|dismount(?:ed|ing)?|re-?instat(?:e|ement|ing)|relocat(?:e|ion|ing)|remov(?:e|al|ing)|testing|commissioning|programming|calibration|training|manpower|on[- ]?site\s+support)\b/i;
  const PURCHASE_BUNDLE=/^(?:supply|provide)\s*(?:&|and)?\s*(?:install|installation)?\b/i;

  function prohibitedTitle(text=''){
    const lines=String(text||'').replace(/\r/g,'\n').split(/\n+/).map(clean).filter(Boolean).slice(0,80);
    const normalize=v=>clean(v).toUpperCase().replace(/[^A-Z0-9/#&().: -]+/g,' ').replace(/\s+/g,' ').trim();
    const re=/^(?:PRO\s*FORMA\s+INVOICE|PROFORMA\s+INVOICE|QUOTATION|QUOTE|DELIVERY\s+ORDER|DELIVERY\s+NOTE|DELIVERY\s+SLIP|PACKING\s+LIST|PACKING\s*\/?\s*DELIVERY\s+SLIP|PURCHASE\s+REQUISITION|PURCHASE\s+REQUEST|PURCHASE\s+ORDER|GOODS\s+RECEIVED\s+NOTE|SERVICE\s+REPORT|SERVICE\s+INVOICE|INSTALLATION\s+REPORT|CREDIT\s+NOTE|DEBIT\s+NOTE|STATEMENT|SCHEDULES?\s+OF\s+PRICES(?:\s+AND\s+TECHNICAL\s+DATA)?|PRICE\s+SCHEDULE|SCHEDULE\s+OF\s+PRICES|BILL\s+OF\s+QUANTITIES|BOQ|TECHNICAL\s+PROPOSAL|TECHNICAL\s+DATA\s+SHEET|TENDER\s+SCHEDULE)(?:\s+(?:NO|NUMBER|#)?\s*[A-Z0-9./-]+)?$/i;
    for(const line of lines){
      const n=normalize(line);
      if(re.test(n))return {matched:true,title:n};
    }
    return {matched:false,title:''};
  }
  function metadataText(value=''){
    const s=clean(value);if(!s)return true;
    if(/\b(?:invoice\s*(?:no|number|date)?|tax\s+invoice|reference\s*(?:no|number)?|ref\.?\s*(?:no|number)?|p\/?o\s*(?:no|number)?|customer(?:\s+code|\s+copy)?|sold\s+to|bill\s+to|ship\s+to|delivered\s+to|attention|attn\.?|terms|salesman|gst\s*(?:reg|registration)|uen|company\s*(?:reg|registration)|co\.?\s*reg|telephone|tel\.?|fax|e-?mail|email|website|www\.|postal(?:\s+code)?|page\s+\d+|sub\s*total|subtotal|amount\s+due|grand\s+total|total\s+amount)\b/i.test(s))return true;
    if(/\b(?:pte\.?\s*ltd\.?|private\s+limited|limited|ltd\.?|llp|llc|inc\.?|corporation|corp\.?)\b/i.test(s))return true;
    if(/\bsingapore\s*\d{5,6}\b/i.test(s)||/#\s*\d{1,3}\s*[-/]\s*\d{1,5}\b/.test(s))return true;
    if(/\b\d{1,4}\s+[A-Za-z][A-Za-z0-9 .'-]{1,70}\s+(?:road|rd\.?|street|st\.?|avenue|ave\.?|drive|dr\.?|lane|ln\.?|crescent|cres\.?|close|way|walk|place|plaza|boulevard|terrace|industrial\s+park|centre|center)\b/i.test(s))return true;
    if(/\b(?:road|rd\.?|street|st\.?|avenue|ave\.?|drive|dr\.?|lane|ln\.?|crescent|cres\.?|industrial\s+park)\b[^\n]{0,40}\b\d{5,6}\b/i.test(s))return true;
    if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(s))return true;
    return false;
  }
  function isServiceLine(row={}){
    const text=rowText(row),primary=clean(row.item_name||row.description||''),sku=clean(row.sku||row.model||'');
    if(!text)return false;
    if(LABOUR.test(text)||SERVICE_SKU.test(sku))return true;
    const physical=EQUIPMENT.test(primary||text);
    const bundle=PURCHASE_BUNDLE.test(primary)&&physical&&!LABOUR.test(primary);
    if(bundle&&!/\b(?:cabling|wiring|labelling|labeling|tidying|training|commissioning|system\s+tuning)\b/i.test(primary))return false;
    if(SERVICE_START.test(primary))return true;
    if(SERVICE_ACTION.test(primary)&&!bundle)return true;
    if(/\b(?:delivery|freight|courier|transport)\s+(?:fee|charge|service|cost)\b/i.test(text))return true;
    return false;
  }
  function credibleSku(v=''){
    const s=clean(v);
    return !!s&&s.length>=3&&s.length<=40&&/^[A-Z0-9][A-Z0-9+._\/-]*$/i.test(s)&&(/[A-Za-z]/.test(s)&&/\d/.test(s));
  }
  function economicEvidence(row={}){
    const q=Number(row.quantity),p=Number(row.unit_price),a=Number(row.amount);
    if(!(q>0))return false;
    if(Number.isFinite(p)&&Number.isFinite(a)&&p>=0&&a>=0)return Math.abs(q*p-a)<=Math.max(.08,Math.abs(a)*.01);
    return false;
  }
  function strongPhysicalRow(row={}){
    const text=rowText(row),primary=clean(row.item_name||row.description||'');
    if(!text||metadataText(text)||isServiceLine(row))return false;
    if(!EQUIPMENT.test(primary||text))return false;
    return economicEvidence(row)||credibleSku(row.sku||row.model||'');
  }
  function textServiceEvidence(evidence=''){
    const lines=String(evidence||'').replace(/\r/g,'\n').split(/\n+/).map(clean).filter(Boolean);
    return lines.some(line=>{
      if(metadataText(line))return false;
      if(LABOUR.test(line))return true;
      if(SERVICE_START.test(line))return true;
      if(SERVICE_ACTION.test(line)&&!PURCHASE_BUNDLE.test(line))return true;
      return false;
    });
  }
  function classifyContent({evidence='',rawRows=[],inventoryRows=[]}={}){
    const prohibited=prohibitedTitle(evidence);
    if(prohibited.matched)return {type:'noninventory',equipmentScore:0,serviceScore:0,reason:'Explicit prohibited document title: '+prohibited.title,authority:'document-title'};
    const all=[...(rawRows||[]),...(inventoryRows||[])];
    const physical=[],service=[];
    for(const row of all){
      if(strongPhysicalRow(row)){if(!physical.some(x=>rowText(x)===rowText(row)&&Number(x.amount)===Number(row.amount)))physical.push(row);continue;}
      if(isServiceLine(row)){if(!service.some(x=>rowText(x)===rowText(row)&&Number(x.amount)===Number(row.amount)))service.push(row);}
    }
    if(physical.length)return {type:'equipment',equipmentScore:10+physical.length*2,serviceScore:service.length?6+service.length:0,reason:'At least one row has independent row-local physical equipment evidence. Service rows remain excluded.',authority:'physical-row',physicalCount:physical.length,serviceCount:service.length};
    const serviceText=textServiceEvidence(evidence);
    if(service.length||serviceText)return {type:'service',equipmentScore:0,serviceScore:10+service.length*2,reason:'Service/labour evidence is present and no independently verified physical equipment row exists.',authority:'service-only',physicalCount:0,serviceCount:service.length};
    return {type:'uncertain',equipmentScore:0,serviceScore:0,reason:'No independently verified physical equipment row was established.',authority:'fail-closed',physicalCount:0,serviceCount:0};
  }
  function selfTest(){
    const failures=[],expect=(name,actual,want)=>{if(actual!==want)failures.push(name+': expected '+want+' got '+actual);};
    const svcEvidence='TAX INVOICE\nPRODUCT NO. DESCRIPTION QUANTITY UNIT PRICE AMOUNT\nDISMANTLE & RELOCATE Supply labour to dismantle the existing AV 1 700.00 700.00\nSALES - INSTALLATION Supply Labour to re-instate back the existing AV 1 3,100.00 3,100.00';
    expect('service-only tax invoice',classifyContent({evidence:svcEvidence,rawRows:[
      {sku:'DISMANTLE',item_name:'Supply labour to dismantle the existing AV',quantity:1,unit_price:700,amount:700},
      {sku:'SALES-INSTALLATION',item_name:'Supply Labour to re-instate back the existing AV',quantity:1,unit_price:3100,amount:3100}
    ]}).type,'service');
    expect('service mentioning projector',classifyContent({evidence:'TAX INVOICE\nProjector relocation and re-installation 1 500.00 500.00',rawRows:[{item_name:'Projector relocation and re-installation',quantity:1,unit_price:500,amount:500}]}).type,'service');
    expect('mixed equipment invoice',classifyContent({evidence:'TAX INVOICE',rawRows:[
      {sku:'PT-VW540',item_name:'Panasonic projector',quantity:1,unit_price:804,amount:804},
      {item_name:'Installation labour',quantity:1,unit_price:200,amount:200}
    ]}).type,'equipment');
    expect('supply install physical item',classifyContent({evidence:'TAX INVOICE',rawRows:[{item_name:'Supply & Install Outdoor Dual Microphone Wall Receptacle',quantity:1,unit_price:450,amount:450}]}).type,'equipment');
    expect('address cannot promote invoice',classifyContent({evidence:'TAX INVOICE\n1 Raffles Institution Lane Singapore 575954',inventoryRows:[{item_name:'1 Raffles Institution Lane Singapore 575954',quantity:1,unit_price:10,amount:10}]}).type,'uncertain');
    for(const title of ['PURCHASE ORDER','DELIVERY ORDER','QUOTATION','PROFORMA INVOICE','PACKING LIST','SERVICE REPORT','SERVICE INVOICE','CREDIT NOTE']){
      expect('prohibited '+title,classifyContent({evidence:title+'\nPT-VW540 Projector 1 804.00 804.00',rawRows:[{sku:'PT-VW540',item_name:'Projector',quantity:1,unit_price:804,amount:804}]}).type,'noninventory');
    }
    expect('normal equipment tax invoice',classifyContent({evidence:'TAX INVOICE\nPT-VW540 Projector 1 804.00 804.00',rawRows:[{sku:'PT-VW540',item_name:'Projector',quantity:1,unit_price:804,amount:804}]}).type,'equipment');
    return {ok:failures.length===0,version:VERSION,failures};
  }
  root.InventoryHubDocumentAuthorityV411Recovery1=Object.freeze({VERSION,prohibitedTitle,metadataText,isServiceLine,strongPhysicalRow,classifyContent,selfTest});
})(typeof window!=='undefined'?window:globalThis);
