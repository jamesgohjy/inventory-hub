-- Inventory Hub v7.03.3.14v — canonical identity + atomic Confirm & Save
-- Relational writes are one PostgreSQL function call/transaction.
alter table public.master_items add column if not exists canonical_brand text not null default '';
alter table public.master_items add column if not exists canonical_model text not null default '';
alter table public.master_items add column if not exists verified_aliases jsonb not null default '[]'::jsonb;
alter table public.purchase_items add column if not exists invoice_evidence jsonb not null default '{}'::jsonb;

create unique index if not exists uq_master_items_canonical_identity
on public.master_items (
  upper(regexp_replace(canonical_brand,'[^A-Z0-9]','','g')),
  upper(regexp_replace(canonical_model,'[^A-Z0-9]','','g'))
) where canonical_brand<>'' and canonical_model<>'';

create or replace function public.confirm_and_save_invoice_v703314v(
  p_document jsonb,
  p_purchase jsonb,
  p_lines jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_document_id uuid;
  v_purchase_id uuid;
  v_item_id uuid;
  v_purchase_item_id uuid;
  v_line jsonb;
  v_alias text;
  v_serial text;
  v_brand text;
  v_model text;
  v_sku text;
  v_item_name text;
  v_qty numeric;
  v_unit_price numeric;
  v_amount numeric;
  v_aliases jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication required.'; end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_lines,'[]'::jsonb))=0 then
    raise exception using errcode='22023',message='At least one canonical inventory line is required.';
  end if;

  insert into public.documents(file_name,storage_path,mime_type,supplier_name,invoice_number,uploaded_by)
  values (p_document->>'file_name',p_document->>'storage_path',coalesce(nullif(p_document->>'mime_type',''),'application/pdf'),
          coalesce(p_document->>'supplier_name',''),coalesce(p_document->>'invoice_number',''),auth.uid())
  returning id into v_document_id;

  insert into public.purchases(supplier_name,invoice_number,invoice_date,delivery_order_number,purchase_order_number,reference_number,currency,subtotal,gst,total_amount,document_id,created_by)
  values (p_purchase->>'supplier_name',p_purchase->>'invoice_number',nullif(p_purchase->>'invoice_date','')::date,
          coalesce(p_purchase->>'delivery_order_number',''),coalesce(p_purchase->>'purchase_order_number',''),coalesce(p_purchase->>'reference_number',''),
          coalesce(nullif(p_purchase->>'currency',''),'SGD'),nullif(p_purchase->>'subtotal','')::numeric,nullif(p_purchase->>'gst','')::numeric,
          nullif(p_purchase->>'total_amount','')::numeric,v_document_id,auth.uid())
  returning id into v_purchase_id;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_brand:=trim(coalesce(v_line#>>'{canonical_identity,brand}',''));
    v_model:=trim(coalesce(v_line#>>'{canonical_identity,model}',''));
    v_sku:=trim(coalesce(v_line->>'sku',''));
    v_item_name:=trim(coalesce(v_line->>'item_name',v_line->>'description',''));
    v_qty:=nullif(v_line->>'quantity','')::numeric;
    v_unit_price:=nullif(v_line->>'unit_price','')::numeric;
    v_amount:=nullif(v_line->>'amount','')::numeric;
    v_aliases:=coalesce(v_line#>'{canonical_identity,verifiedAliases}','[]'::jsonb);
    if v_qty is null or v_qty<=0 or v_item_name='' then raise exception using errcode='22023',message='Invalid canonical inventory line.'; end if;
    if v_unit_price is not null and v_amount is not null and abs((v_qty*v_unit_price)-v_amount)>.06 then
      raise exception using errcode='22023',message='Economic reconciliation failed for canonical inventory line.';
    end if;

    if v_brand<>'' and v_model<>'' then
      select id into v_item_id from public.master_items
       where upper(regexp_replace(canonical_brand,'[^A-Z0-9]','','g'))=upper(regexp_replace(v_brand,'[^A-Z0-9]','','g'))
         and upper(regexp_replace(canonical_model,'[^A-Z0-9]','','g'))=upper(regexp_replace(v_model,'[^A-Z0-9]','','g'))
       limit 1 for update;
    else v_item_id:=null; end if;
    if v_item_id is null and v_sku<>'' then select id into v_item_id from public.master_items where lower(sku)=lower(v_sku) limit 1 for update; end if;

    if v_item_id is null then
      insert into public.master_items(sku,item_name,description,category,unit,canonical_brand,canonical_model,verified_aliases,created_by)
      values (v_sku,v_item_name,coalesce(v_line->>'description',''),coalesce(v_line->>'category',''),coalesce(nullif(v_line->>'unit',''),'pcs'),
              v_brand,v_model,v_aliases,auth.uid()) returning id into v_item_id;
    elsif v_brand<>'' and v_model<>'' then
      update public.master_items set
        canonical_brand=case when canonical_brand='' then v_brand else canonical_brand end,
        canonical_model=case when canonical_model='' then v_model else canonical_model end,
        verified_aliases=(select coalesce(jsonb_agg(distinct x),'[]'::jsonb) from jsonb_array_elements(coalesce(verified_aliases,'[]'::jsonb)||v_aliases) x)
      where id=v_item_id;
    end if;

    insert into public.purchase_items(purchase_id,master_item_id,raw_description,quantity,unit_price,amount,warranty,invoice_evidence,created_by)
    values(v_purchase_id,v_item_id,coalesce(v_line#>>'{invoice_evidence,original_description}',v_line->>'description',''),v_qty,v_unit_price,v_amount,
           coalesce(v_line->>'warranty',''),coalesce(v_line->'invoice_evidence','{}'::jsonb),auth.uid())
    returning id into v_purchase_item_id;

    for v_serial in select jsonb_array_elements_text(coalesce(v_line->'serial_numbers','[]'::jsonb)) loop
      insert into public.serial_numbers(purchase_item_id,master_item_id,serial_number) values(v_purchase_item_id,v_item_id,trim(v_serial));
    end loop;
  end loop;
  return jsonb_build_object('document_id',v_document_id,'purchase_id',v_purchase_id,'line_count',jsonb_array_length(p_lines));
end $$;

revoke execute on function public.confirm_and_save_invoice_v703314v(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.confirm_and_save_invoice_v703314v(jsonb,jsonb,jsonb) to authenticated;
