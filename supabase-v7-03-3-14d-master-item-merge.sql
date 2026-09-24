-- AV Inventory Hub v7.03.3.14d
-- Generic transactional Master Item merge.
-- Run once in Supabase SQL Editor before using Edit Item -> merge.

create or replace function public.merge_master_items_v703314d(
  p_source_id uuid,
  p_target_id uuid,
  p_target_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.master_items%rowtype;
  v_target public.master_items%rowtype;
  v_target_after public.master_items%rowtype;
  v_rel record;
  v_rows bigint;
  v_moved jsonb := '{}'::jsonb;
  v_total_purchased numeric := 0;
  v_total_adjusted numeric := 0;
  v_requested_sku text := coalesce(trim(p_target_patch->>'requested_sku'),'');
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='Authentication required.';
  end if;

  if p_source_id is null or p_target_id is null or p_source_id=p_target_id then
    raise exception using errcode='22023', message='Source and target Master Item IDs must be different.';
  end if;

  perform id
    from public.master_items
   where id in (p_source_id,p_target_id)
   order by id
   for update;

  select * into v_source from public.master_items where id=p_source_id;
  if not found then
    raise exception using errcode='P0002', message='Source Master Item was not found.';
  end if;

  select * into v_target from public.master_items where id=p_target_id;
  if not found then
    raise exception using errcode='P0002', message='Target Master Item was not found.';
  end if;

  if v_requested_sku<>'' and
     regexp_replace(upper(v_requested_sku),'[^A-Z0-9]','','g') <>
     regexp_replace(upper(v_target.sku),'[^A-Z0-9]','','g') then
    raise exception using errcode='22023',
      message='Target SKU no longer matches the requested SKU identity. Reload Inventory and try again.';
  end if;

  update public.master_items
     set item_name = case
                       when p_target_patch ? 'item_name'
                        and trim(coalesce(p_target_patch->>'item_name',''))<>''
                       then trim(p_target_patch->>'item_name')
                       else item_name
                     end,
         category = case
                      when p_target_patch ? 'category'
                      then coalesce(p_target_patch->>'category','')
                      else category
                    end,
         unit = case
                  when p_target_patch ? 'unit'
                   and trim(coalesce(p_target_patch->>'unit',''))<>''
                  then trim(p_target_patch->>'unit')
                  else unit
                end,
         description = case
                         when p_target_patch ? 'description'
                         then coalesce(p_target_patch->>'description','')
                         else description
                       end,
         updated_at = now()
   where id=p_target_id;

  if p_target_patch ? 'image_url' and exists (
    select 1
      from information_schema.columns
     where table_schema='public'
       and table_name='master_items'
       and column_name='image_url'
  ) then
    execute 'update public.master_items set image_url=$1 where id=$2'
      using nullif(trim(coalesce(p_target_patch->>'image_url','')),''), p_target_id;
  end if;

  for v_rel in
    select n.nspname as schema_name,
           c.relname as table_name,
           a.attname as column_name
      from pg_constraint fk
      join pg_class c on c.oid=fk.conrelid
      join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a
        on a.attrelid=fk.conrelid
       and a.attnum=fk.conkey[1]
     where fk.contype='f'
       and fk.confrelid='public.master_items'::regclass
       and cardinality(fk.conkey)=1
       and cardinality(fk.confkey)=1
       and n.nspname='public'
  loop
    execute format(
      'update %I.%I set %I=$1 where %I=$2',
      v_rel.schema_name,v_rel.table_name,v_rel.column_name,v_rel.column_name
    ) using p_target_id,p_source_id;

    get diagnostics v_rows = row_count;
    v_moved := jsonb_set(v_moved,array[v_rel.table_name],to_jsonb(v_rows),true);
  end loop;

  if to_regclass('public.health_issue_reviews') is not null then
    begin
      execute
        'update public.health_issue_reviews
            set entity_id=$1
          where entity_id=$2
            and entity_type in (''master_items'',''master_item'')'
        using p_target_id::text,p_source_id::text;

      get diagnostics v_rows = row_count;
      if v_rows>0 then
        v_moved := jsonb_set(v_moved,array['health_issue_reviews'],to_jsonb(v_rows),true);
      end if;
    exception when undefined_column then
      null;
    end;
  end if;

  delete from public.master_items where id=p_source_id;
  if not found then
    raise exception using errcode='P0002',
      message='Source Master Item disappeared before merge completion.';
  end if;

  select * into v_target_after from public.master_items where id=p_target_id;

  select coalesce(sum(quantity),0)
    into v_total_purchased
    from public.purchase_items
   where master_item_id=p_target_id;

  select coalesce(sum(quantity),0)
    into v_total_adjusted
    from public.inventory_adjustments
   where master_item_id=p_target_id;

  insert into public.audit_log(
    entity_type,entity_id,action,old_data,new_data,changed_by
  )
  values (
    'master_items_merge',
    p_target_id::text,
    'MERGE',
    jsonb_build_object(
      'source',to_jsonb(v_source),
      'target_before',to_jsonb(v_target)
    ),
    jsonb_build_object(
      'target',to_jsonb(v_target_after),
      'moved_rows',v_moved,
      'total_purchased',v_total_purchased,
      'current_inventory',v_total_purchased-v_total_adjusted
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'merged',true,
    'source_id',p_source_id,
    'target_id',p_target_id,
    'target_sku',v_target_after.sku,
    'moved_rows',v_moved,
    'total_purchased',v_total_purchased,
    'total_adjusted',v_total_adjusted,
    'current_inventory',v_total_purchased-v_total_adjusted
  );
end;
$$;

revoke all on function public.merge_master_items_v703314d(uuid,uuid,jsonb) from public;
grant execute on function public.merge_master_items_v703314d(uuid,uuid,jsonb) to authenticated;

comment on function public.merge_master_items_v703314d(uuid,uuid,jsonb)
is 'Atomically merges one Master Item into another while preserving all public single-column foreign-key relationships.';
