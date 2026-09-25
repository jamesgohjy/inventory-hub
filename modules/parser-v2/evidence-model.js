// Inventory Hub Parser V2 — immutable document evidence model
(function(global){
  'use strict';
  const clean=v=>String(v??'').replace(/\u00a0/g,' ').replace(/\r/g,'\n').replace(/[\t ]+/g,' ').trim();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const textKey=v=>clean(v).replace(/\s+/g,' ').slice(0,1600);
  function normalizeLayout(layout=[]){
    return (Array.isArray(layout)?layout:[]).map((page,pageIndex)=>({
      page:Number(page?.page)||pageIndex+1,
      width:Number(page?.width)||null,
      height:Number(page?.height)||null,
      yTolerance:Number(page?.yTolerance)||3,
      rows:(Array.isArray(page?.rows)?page.rows:[]).map((row,rowIndex)=>({
        page:Number(row?.page)||Number(page?.page)||pageIndex+1,
        rowIndex,
        y:Number(row?.y),
        text:clean(row?.text),
        items:(Array.isArray(row?.items)?row.items:[]).map((item,itemIndex)=>({
          itemIndex,
          text:clean(item?.text),
          x:Number(item?.x),
          y:Number(item?.y),
          width:Number(item?.width),
          height:Number(item?.height)
        }))
      }))
    }));
  }
  function normalizeSource(source={},index=0){
    return {
      id:clean(source.source||source.id||('source-'+(index+1))),
      label:clean(source.label||source.source||source.id||('Source '+(index+1))),
      page:Number(source.page)||null,
      text:clean(source.text),
      layout:normalizeLayout(source.layout||[]),
      score:Number.isFinite(Number(source.score))?Number(source.score):null,
      kind:clean(source.kind||(/ocr|recovery|tesseract/i.test(String(source.source||''))?'ocr':'native'))||'native'
    };
  }
  function buildDocumentEvidence({sources=[],raw='',layout=[]}={}){
    const input=[...(Array.isArray(sources)?sources:[])];
    if(clean(raw))input.push({source:'raw',label:'Raw text',text:raw,kind:'native'});
    if(Array.isArray(layout)&&layout.length)input.push({source:'pdf-layout',label:'PDF layout',text:'',layout,kind:'layout'});
    const seen=new Set(),normalized=[];
    input.map(normalizeSource).forEach(src=>{
      const key=[src.id,textKey(src.text),JSON.stringify(src.layout).slice(0,2000)].join('|');
      if(seen.has(key))return;seen.add(key);normalized.push(src);
    });
    const frozen=normalized.map(src=>Object.freeze({...src,layout:Object.freeze(src.layout.map(pg=>Object.freeze({...pg,rows:Object.freeze(pg.rows.map(r=>Object.freeze({...r,items:Object.freeze(r.items.map(Object.freeze))}))) })))}));
    return Object.freeze({
      version:'2.0-shadow',
      sources:Object.freeze(frozen),
      createdAt:new Date().toISOString(),
      sourceCount:frozen.length,
      textSourceCount:frozen.filter(x=>x.text).length,
      layoutPageCount:frozen.reduce((n,x)=>n+x.layout.length,0)
    });
  }
  function allRows(evidence={}){
    return (evidence.sources||[]).flatMap(src=>(src.layout||[]).flatMap(pg=>(pg.rows||[]).map(row=>({...clone(row),source:src.id,sourceKind:src.kind,page:row.page||pg.page}))));
  }
  function allTexts(evidence={}){
    return (evidence.sources||[]).filter(x=>x.text).map(x=>({source:x.id,kind:x.kind,text:x.text,score:x.score}));
  }
  global.InventoryHubParserV2Evidence=Object.freeze({version:'2.0-shadow',clean,normalizeLayout,buildDocumentEvidence,allRows,allTexts});
})(typeof window!=='undefined'?window:globalThis);
