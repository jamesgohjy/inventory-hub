// Inventory Hub parser table module — v7.03.3.14s
(function(global){
  'use strict';
  function parseHeaderAlignedLayout({
    pdfLayout=[],
    sourceText='',
    resolveEconomics,
    cleanInventoryDescription,
    cleanVerifiedSku,
    normalizeParsedInvoiceItem,
    isServiceLine
  }={}){
    const out=[];
    if(typeof resolveEconomics!=='function'||typeof cleanInventoryDescription!=='function'||typeof cleanVerifiedSku!=='function'||typeof normalizeParsedInvoiceItem!=='function')return out;
    const center=it=>(Number(it?.x)||0)+(Number(it?.width)||0)/2;
    const cleanToken=v=>String(v||'').trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9+._\/-]+$/g,'');
    for(const pg of pdfLayout||[]){
      const rows=(pg?.rows||[]).filter(r=>Array.isArray(r.items)&&r.items.length);
      for(const seed of rows){
        if(!/\bDESCRIPTION\b/i.test(seed.text||'')&&!seed.items.some(it=>/^DESCRIPTION$/i.test(cleanToken(it.text))))continue;
        const band=rows.filter(r=>Math.abs((Number(r.y)||0)-(Number(seed.y)||0))<=30),items=band.flatMap(r=>r.items||[]),first=re=>items.find(it=>re.test(cleanToken(it.text)));
        const code=first(/^(?:PRODUCT|SKU|MODEL|ITEM)$/i)||items.find(it=>/\bPRODUCT\b/i.test(cleanToken(it.text))),desc=first(/^DESCRIPTION$/i),qty=first(/^(?:QTY|QUANTITY|UNITS?)$/i),price=first(/^PRICE$/i)||items.find(it=>/PRICE/i.test(cleanToken(it.text))),amount=first(/^AMOUNT$/i);
        if(!code||!desc||!qty||!price||!amount)continue;
        const xCode=center(code),xDesc=center(desc),xQty=center(qty),xPrice=center(price),xAmount=center(amount);
        if(![xCode,xDesc,xQty,xPrice,xAmount].every(Number.isFinite)||!(xCode<xDesc&&xDesc<xQty&&xQty<xPrice&&xPrice<xAmount))continue;
        const headerY=Number(seed.y)||0,totals=rows.filter(r=>/\b(?:SUB\s*TOTAL|SUBTOTAL|GST|AMOUNT\s+DUE|GRAND\s+TOTAL|INVOICE\s+TOTAL)\b/i.test(r.text||'')),totalRow=totals.sort((a,b)=>Math.abs((Number(a.y)||0)-headerY)-Math.abs((Number(b.y)||0)-headerY))[0];
        let dir=totalRow?Math.sign((Number(totalRow.y)||0)-headerY):0;if(!dir){const plus=rows.filter(r=>(Number(r.y)||0)>headerY&&/\d/.test(r.text||'')).length,minus=rows.filter(r=>(Number(r.y)||0)<headerY&&/\d/.test(r.text||'')).length;dir=plus>=minus?1:-1;}
        const pos=r=>((Number(r.y)||0)-headerY)*dir,totalPos=totalRow?pos(totalRow):Infinity,body=rows.filter(r=>pos(r)>2&&pos(r)<totalPos-1).sort((a,b)=>pos(a)-pos(b)),bCD=(xCode+xDesc)/2,qtyStart=xQty-Math.max(16,(xPrice-xQty)*.35),anchors=[];
        for(const r of body){
          const codeText=(r.items||[]).filter(it=>center(it)<bCD).map(it=>cleanToken(it.text)).filter(Boolean).join(' ').trim(),description=(r.items||[]).filter(it=>center(it)>=bCD&&center(it)<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ').trim(),right=(r.items||[]).some(it=>(Number(it.x)||0)+(Number(it.width)||0)>=qtyStart&&/\d/.test(String(it.text||''))),codeLike=codeText&&/\d/.test(codeText)&&(/[A-Za-z]/.test(codeText)||/^\d{4,}(?:[-/][A-Za-z0-9]+)?$/.test(codeText))&&!/^(?:SERIAL|SHIPMENT|DATE|TERMS|TOTAL|SUBTOTAL)$/i.test(codeText);
          if(codeLike&&(description||right))anchors.push({row:r,code:codeText});
        }
        const uniq=[];for(const a of anchors)if(uniq.every(u=>Math.abs(pos(u.row)-pos(a.row))>Math.max(3,Number(pg.yTolerance)||3)))uniq.push(a);
        for(let i=0;i<uniq.length;i++){
          const p0=pos(uniq[i].row)-Math.max(4,Number(pg.yTolerance)||3),p1=i+1<uniq.length?pos(uniq[i+1].row)-Math.max(4,Number(pg.yTolerance)||3):totalPos,group=body.filter(r=>pos(r)>=p0&&pos(r)<p1),rightItems=group.flatMap(r=>r.items||[]).filter(it=>(Number(it.x)||0)+(Number(it.width)||0)>=qtyStart),econ=resolveEconomics(rightItems,{qty:xQty,price:xPrice,amount:xAmount});
          if(!econ?.ok)continue;
          const descParts=[];let warranty='';
          for(const r of group){const d=(r.items||[]).filter(it=>center(it)>=bCD&&center(it)<qtyStart).map(it=>String(it.text||'').trim()).filter(Boolean).join(' ').trim();if(!d)continue;if(/\bwarranty\b|\bWT\s+FOR\b/i.test(d)){const y=d.match(/\b(\d+)\s*years?\b/i);warranty=y?y[1]+' Years':warranty;continue;}if(!/^\s*(?:s\/?n|serial|shipment\s*no)\b/i.test(d))descParts.push(d);}
          const description=cleanInventoryDescription(descParts.join(' '));if(!description)continue;
          const sku=cleanVerifiedSku(uniq[i].code,sourceText||group.map(r=>r.text||'').join('\n')),line=normalizeParsedInvoiceItem({sku,item_name:description,description,category:'',unit:'pcs',quantity:econ.quantity,unit_price:econ.unit_price,amount:econ.amount,warranty,serials:''});
          line.layoutEvidenceVerified=true;line.economicEvidenceVerified=true;line.v703314rHeaderAligned=true;line.v703314sHeaderAligned=true;line.quantityReviewRequired=false;line.priceReviewRequired=false;line.amountReviewRequired=false;
          if(typeof isServiceLine==='function'&&isServiceLine(line))continue;
          out.push(line);
        }
        if(out.length)return out;
      }
    }
    return out;
  }
  global.InventoryHubParserTable=Object.freeze({version:'7.03.3.14s',parseHeaderAlignedLayout});
})(window);
