-- AV Inventory Hub v7.03.3.14d
-- Generic transactional Master Item merge.
-- Hardened for v7.03.3.14g preflight: server-side role enforcement,
-- relationship preservation, and post-merge integrity checks.
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
  v_patch jsonb := coalesce(p_target_patch,'{}'::jsonb);
  v_actor_role text := '';
  v_requested_sku text := '';

  v_expected_total_purchased numeric := 0;
  v_expected_total_adjusted numeric := 0;
  v_expected_serial_count bigint := 0;
  v_expected_maintenance_count bigint := null;

  v_total_purchased numeric := 0;
  v_total_adjusted numeric := 0;
  v_serial_count bigint := 0;
  v_maintenance_count bigint := null;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='Authentication required.';
  end if;

  -- SECURITY DEFINER bypasses ordinary client-side/UI checks, so the database
  -- must independently enforce the same Admin/Editor rule used by the app.
  if to_regclass('public.profiles') is null then
    raise exception using errcode='42501',
      message='Inventory member roles are not installed. Merge was blocked.';
  end if;

  begin
    execute
      'select lower(trim(coalesce(role::text, '''')))
         from public.profiles
        where id=$1'
      into v_actor_role
      using auth.uid();
  exception
    when undefined_column then
      raise exception using errcode='42501',
        message='Inventory member role information is unavailable. Merge was blocked.';
  end;

  if coalesce(v_actor_role,'') not in ('admin','editor') then
    raise exception using errcode='42501',
      message='Editor or Admin access required.';
  end if;

  if p_source_id is null or p_target_id is null or p_source_id=p_target_id then
    raise exception using errcode='22023',
      message='Source and target Master Item IDs must be different.';
  end if;

  v_requested_sku := coalesce(trim(v_patch->>'requested_sku'),'');
  if v_requested_sku='' then
    raise exception using errcode='22023',
      message='Requested target SKU is required for a safe merge.';
  end if;

  -- Lock in deterministic order. This prevents the source/target from changing
  -- during the merge and reduces deadlock risk.
  perform id
    from public.master_items
   where id in (p_source_id,p_target_id)
   order by id
   for update;

  select * into v_source
    from public.master_items
   where id=p_source_id;
  if not found then
    raise exception using errcode='P0002',
      message='Source Master Item was not found.';
  end if;

  select * into v_target
    from public.master_items
   where id=p_target_id;
  if not found then
    raise exception using errcode='P0002',
      message='Target Master Item was not found.';
  end if;

  if regexp_replace(upper(v_requested_sku),'[^A-Z0-9]','','g') <>
     regexp_replace(upper(v_target.sku),'[^A-Z0-9]','','g') then
    raise exception using errcode='22023',
      message='Target SKU no longer matches the requested SKU identity. Reload Inventory and try again.';
  end if;

  -- Refuse an FK shape this generic routine cannot safely rewrite.
  if exists (
    select 1
      from pg_constraint fk
      join pg_namespace n on n.oid=(select relnamespace from pg_class where oid=fk.conrelid)
     where fk.contype='f'
       and fk.confrelid='public.master_items'::regclass
       and n.nspname='public'
       and (cardinality(fk.conkey)<>1 or cardinality(fk.confkey)<>1)
  ) then
    raise exception using errcode='55000',
      message='Unsupported composite Master Item relationship detected. Merge was blocked.';
  end if;

  -- Capture invariants before any changes. The final values must match exactly.
  select coalesce(sum(quantity),0)
    into v_expected_total_purchased
    from public.purchase_items
   where master_item_id in (p_source_id,p_target_id);

  select coalesce(sum(quantity),0)
    into v_expected_total_adjusted
    from public.inventory_adjustments
   where master_item_id in (p_source_id,p_target_id);

  select count(*)
    into v_expected_serial_count
    from public.serial_numbers
   where master_item_id in (p_source_id,p_target_id);

  if to_regclass('public.maintenance_records') is not null
     and exists (
       select 1
         from information_schema.columns
        where table_schema='public'
          and table_name='maintenance_records'
          and column_name='master_item_id'
     ) then
    execute
      'select count(*)
         from public.maintenance_records
        where master_item_id in ($1,$2)'
      into v_expected_maintenance_count
      using p_source_id,p_target_id;
  end if;

  update public.master_items
     set item_name = case
                       when v_patch ? 'item_name'
                        and trim(coalesce(v_patch->>'item_name',''))<>''
                       then trim(v_patch->>'item_name')
                       else item_name
                     end,
         category = case
                      when v_patch ? 'category'
                      then coalesce(v_patch->>'category','')
                      else category
                    end,
         unit = case
                  when v_patch ? 'unit'
                   and trim(coalesce(v_patch->>'unit',''))<>''
                  then trim(v_patch->>'unit')
                  else unit
                end,
         description = case
                         when v_patch ? 'description'
                         then coalesce(v_patch->>'description','')
                         else description
                       end,
         updated_at = now()
   where id=p_target_id;

  if v_patch ? 'image_url' and exists (
    select 1
      from information_schema.columns
     where table_schema='public'
       and table_name='master_items'
       and column_name='image_url'
  ) then
    execute 'update public.master_items set image_url=$1 where id=$2'
      using nullif(trim(coalesce(v_patch->>'image_url','')),''), p_target_id;
  end if;

  -- Move every declared public single-column FK that references master_items.
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
     order by n.nspname,c.relname,a.attname
  loop
    execute format(
      'update %I.%I set %I=$1 where %I=$2',
      v_rel.schema_name,v_rel.table_name,v_rel.column_name,v_rel.column_name
    ) using p_target_id,p_source_id;

    get diagnostics v_rows = row_count;
    v_moved := jsonb_set(
      v_moved,
      array[v_rel.table_name||'.'||v_rel.column_name],
      to_jsonb(v_rows),
      true
    );
  end loop;

  -- The app uses maintenance_records.master_item_id. Preserve those records even
  -- on an older database where that column exists but the FK was never created.
  if to_regclass('public.maintenance_records') is not null
     and exists (
       select 1
         from information_schema.columns
        where table_schema='public'
          and table_name='maintenance_records'
          and column_name='master_item_id'
     ) then
    execute
      'update public.maintenance_records
          set master_item_id=$1
        where master_item_id=$2'
      using p_target_id,p_source_id;

    get diagnostics v_rows = row_count;
    if v_rows>0 then
      v_moved := jsonb_set(
        v_moved,
        array['maintenance_records.master_item_id'],
        to_jsonb(v_rows),
        true
      );
    end if;
  end if;

  -- health_issue_reviews stores entity IDs as text rather than as a declared FK.
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
        v_moved := jsonb_set(
          v_moved,
          array['health_issue_reviews.entity_id'],
          to_jsonb(v_rows),
          true
        );
      end if;
    exception
      when undefined_column then
        null;
    end;
  end if;

  delete from public.master_items
   where id=p_source_id;
  if not found then
    raise exception using errcode='P0002',
      message='Source Master Item disappeared before merge completion.';
  end if;

  select * into v_target_after
    from public.master_items
   where id=p_target_id;

  select coalesce(sum(quantity),0)
    into v_total_purchased
    from public.purchase_items
   where master_item_id=p_target_id;

  select coalesce(sum(quantity),0)
    into v_total_adjusted
    from public.inventory_adjustments
   where master_item_id=p_target_id;

  select count(*)
    into v_serial_count
    from public.serial_numbers
   where master_item_id=p_target_id;

  if v_expected_maintenance_count is not null then
    execute
      'select count(*)
         from public.maintenance_records
        where master_item_id=$1'
      into v_maintenance_count
      using p_target_id;
  end if;

  -- Fail closed. Any mismatch raises an exception and PostgreSQL rolls back the
  -- entire function call, including all FK moves and the source deletion.
  if v_total_purchased<>v_expected_total_purchased then
    raise exception using errcode='55000',
      message='Merge integrity check failed: purchased quantity changed unexpectedly.';
  end if;

  if v_total_adjusted<>v_expected_total_adjusted then
    raise exception using errcode='55000',
      message='Merge integrity check failed: inventory adjustments changed unexpectedly.';
  end if;

  if v_serial_count<>v_expected_serial_count then
    raise exception using errcode='55000',
      message='Merge integrity check failed: serial-number record count changed unexpectedly.';
  end if;

  if v_expected_maintenance_count is not null
     and coalesce(v_maintenance_count,-1)<>v_expected_maintenance_count then
    raise exception using errcode='55000',
      message='Merge integrity check failed: maintenance record count changed unexpectedly.';
  end if;

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
      'actor_role',v_actor_role,
      'moved_rows',v_moved,
      'total_purchased',v_total_purchased,
      'total_adjusted',v_total_adjusted,
      'serial_count',v_serial_count,
      'maintenance_count',v_maintenance_count,
      'current_inventory',v_total_purchased-v_total_adjusted
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'merged',true,
    'source_id',p_source_id,
    'target_id',p_target_id,
    'target_sku',v_target_after.sku,
    'actor_role',v_actor_role,
    'moved_rows',v_moved,
    'total_purchased',v_total_purchased,
    'total_adjusted',v_total_adjusted,
    'serial_count',v_serial_count,
    'maintenance_count',v_maintenance_count,
    'current_inventory',v_total_purchased-v_total_adjusted
  );
end;
$$;

revoke all on function public.merge_master_items_v703314d(uuid,uuid,jsonb) from public;
grant execute on function public.merge_master_items_v703314d(uuid,uuid,jsonb) to authenticated;

comment on function public.merge_master_items_v703314d(uuid,uuid,jsonb)
is 'Atomically merges one Master Item into another. Requires Editor/Admin, preserves declared Master Item relationships plus maintenance records, and rolls back on integrity mismatch.';
