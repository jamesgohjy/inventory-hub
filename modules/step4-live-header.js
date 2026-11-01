(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.InventoryHubStep4LiveHeader=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  'use strict';
  const money=s=>{const v=Number(String(s||'').replace(/,/g,''));return Number.isFinite(v)?v:null;};
  const date=s=>{
    const m=String(s||'').match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s*,?\s*(\d{4})\b/);
    if(m){const month={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12}[m[2].slice(0,3).toLowerCase()];if(month&&Number(m[1])<=31)return `${m[3]}-${String(month).padStart(2,'0')}-${m[1].padStart(2,'0')}`;}
    const n=String(s||'').match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/);
    if(n&&Number(n[1])<=31&&Number(n[2])<=12)return `${n[3].length===2?'20'+n[3]:n[3]}-${n[2].padStart(2,'0')}-${n[1].padStart(2,'0')}`;
    return '';
  };
  function reconcile(doc={},nativeText=''){
    const out={...doc},invoicePage=String(nativeText||'').split('\f')[0];
    const lines=invoicePage.split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
    if(!lines.some(x=>/\b(?:tax\s+)?invoice\b/i.test(x)))return out;
    for(let i=0;i<Math.min(lines.length,45);i++){
      const line=lines[i];if(!/\binvoice\s+date\b/i.test(line)||/\bdue\s+date\b/i.test(line))continue;
      // Column extraction may put the supplier beside the label and the value
      // at the start of the next line. Never search as far as payment terms.
      const hit=date(line)||date(lines[i+1]||'')||date(lines[i+2]||'');
      if(hit){out.invoice_date=hit;out.dateReviewRequired=false;break;}
    }
    const doLine=lines.find(x=>/^(?:d\s*\/?\s*o|delivery\s+order)\s*(?:no\.?|number|#)\s*[:#.-]?\s*[A-Z0-9]/i.test(x));
    const doMatch=doLine?.match(/^(?:d\s*\/?\s*o|delivery\s+order)\s*(?:no\.?|number|#)\s*[:#.-]?\s*([A-Z0-9][A-Z0-9._\/-]{2,})\b/i);
    out.delivery_order_number=doMatch?.[1]||'';
    const labelled=(re)=>{const line=lines.find(x=>re.test(x));if(!line)return null;const vals=[...line.matchAll(/\b(\d[\d,]*\.\d{2})\b/g)].map(x=>money(x[1])).filter(x=>x!==null);return vals.length?vals[vals.length-1]:null;};
    const subtotal=labelled(/^sub\s*total\b/i);
    const total=labelled(/^(?:grand\s+total|invoice\s+total|total\s+(?:sgd|amount)|amount\s+due)\b/i);
    let tax=labelled(/^(?:gst|tax)(?:\s|\b)/i);
    if(tax===null){
      const idx=lines.findIndex(x=>/^total\s+local\s+supply\s+of\s+goods\b/i.test(x));
      if(idx>=0&&/\band\s+services\s+\d+(?:\.\d+)?\s*%/i.test(lines.slice(idx,idx+3).join(' ')))tax=labelled(/^total\s+local\s+supply\s+of\s+goods\b/i);
    }
    if([subtotal,tax,total].every(x=>x!==null)&&Math.abs(subtotal+tax-total)<.03){out.subtotal=subtotal;out.gst=tax;out.total_amount=total;out.moneyRecovery='labelled-invoice-page';}
    else if(subtotal!==null&&total!==null&&subtotal>total){
      // A repeated page/read must never become an apparently valid negative GST.
      out.subtotal=null;out.gst=null;out.total_amount=total;out.moneyReviewRequired=true;
    }
    return out;
  }
  return {reconcile};
});
