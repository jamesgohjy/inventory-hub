-- AV Inventory Hub Master Item merge verification
-- SAFE / READ-ONLY: this script does not merge, update, or delete inventory data.
-- Run in Supabase SQL Editor after installing:
--   supabase-v7-03-3-14d-master-item-merge.sql

-- 1) Function installation + SECURITY DEFINER / search_path
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='merge_master_items_v703314d';

-- 2) RPC execute grants. Expected:
-- authenticated_can_execute = true
-- anon_can_execute          = false
select
  has_function_privilege(
    'authenticated',
    'public.merge_master_items_v703314d(uuid,uuid,jsonb)',
    'EXECUTE'
  ) as authenticated_can_execute,
  has_function_privilege(
    'anon',
    'public.merge_master_items_v703314d(uuid,uuid,jsonb)',
    'EXECUTE'
  ) as anon_can_execute;

-- 3) Role table/columns required by the server-side authorization gate.
select
  to_regclass('public.profiles') is not null as profiles_table_exists,
  exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='id'
  ) as profiles_id_exists,
  exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='role'
  ) as profiles_role_exists,
  exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='app_confirmed'
  ) as profiles_app_confirmed_exists;

-- 4) Current role values. Expected application roles are admin/editor/viewer.
-- Also reports how many profiles are app-confirmed.
do $$
declare
  v_roles text;
  v_confirmed bigint;
  v_unconfirmed bigint;
begin
  if to_regclass('public.profiles') is null then
    raise notice 'profiles table: MISSING';
    return;
  end if;

  begin
    execute
      'select string_agg(role_value||''=''||role_count, '', '' order by role_value)
         from (
           select lower(trim(coalesce(role::text,''<blank>''))) as role_value,
                  count(*)::text as role_count
             from public.profiles
            group by 1
         ) x'
      into v_roles;
    execute
      'select count(*) filter (where coalesce(app_confirmed,false)),
              count(*) filter (where not coalesce(app_confirmed,false))
         from public.profiles'
      into v_confirmed,v_unconfirmed;

    raise notice 'profiles roles: %',coalesce(v_roles,'none');
    raise notice 'profiles confirmation: confirmed=%, unconfirmed=%',v_confirmed,v_unconfirmed;
  exception
    when undefined_column then
      raise notice 'profiles.role column: MISSING';
  end;
end;
$$;

-- 5) Every declared public foreign key to master_items.
-- The merge RPC automatically moves all single-column rows returned here.
select
  n.nspname as schema_name,
  c.relname as table_name,
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid) as definition,
  cardinality(con.conkey) as local_column_count,
  cardinality(con.confkey) as referenced_column_count
from pg_constraint con
join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace
where con.contype='f'
  and con.confrelid='public.master_items'::regclass
  and n.nspname='public'
order by c.relname,con.conname;

-- 6) Unsupported composite Master Item FKs.
-- Expected row count: 0.
select count(*) as unsupported_composite_master_item_fks
from pg_constraint con
join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace
where con.contype='f'
  and con.confrelid='public.master_items'::regclass
  and n.nspname='public'
  and (cardinality(con.conkey)<>1 or cardinality(con.confkey)<>1);

-- 7) Maintenance relationship verification.
select
  to_regclass('public.maintenance_records') is not null as maintenance_table_exists,
  exists(
    select 1
      from information_schema.columns
     where table_schema='public'
       and table_name='maintenance_records'
       and column_name='master_item_id'
  ) as maintenance_master_item_id_exists,
  exists(
    select 1
      from pg_constraint con
      join pg_class c on c.oid=con.conrelid
      join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a
        on a.attrelid=con.conrelid
       and a.attnum=con.conkey[1]
     where con.contype='f'
       and con.confrelid='public.master_items'::regclass
       and n.nspname='public'
       and c.relname='maintenance_records'
       and a.attname='master_item_id'
       and cardinality(con.conkey)=1
       and cardinality(con.confkey)=1
  ) as maintenance_has_master_item_fk;

-- 8) Read-only orphan check for maintenance_records.
do $$
declare
  v_orphans bigint;
begin
  if to_regclass('public.maintenance_records') is null then
    raise notice 'maintenance_records orphan check: table not installed';
    return;
  end if;

  if not exists(
    select 1
      from information_schema.columns
     where table_schema='public'
       and table_name='maintenance_records'
       and column_name='master_item_id'
  ) then
    raise notice 'maintenance_records orphan check: master_item_id column missing';
    return;
  end if;

  execute
    'select count(*)
       from public.maintenance_records m
       left join public.master_items i on i.id=m.master_item_id
      where m.master_item_id is not null
        and i.id is null'
    into v_orphans;

  raise notice 'maintenance_records orphan Master Item references: %',v_orphans;
end;
$$;

-- 9) Core inventory orphan checks. Expected all zeros.
select
  (select count(*)
     from public.purchase_items pi
     left join public.master_items m on m.id=pi.master_item_id
    where m.id is null) as purchase_item_orphans,
  (select count(*)
     from public.serial_numbers sn
     left join public.master_items m on m.id=sn.master_item_id
    where m.id is null) as serial_number_orphans,
  (select count(*)
     from public.inventory_adjustments a
     left join public.master_items m on m.id=a.master_item_id
    where m.id is null) as adjustment_orphans;

-- 10) Confirm the function definition actually contains the role/integrity guards.
select
  position('Editor or Admin access required.' in pg_get_functiondef(p.oid))>0
    as has_server_side_role_guard,
  position('Confirmed Inventory Hub account required.' in pg_get_functiondef(p.oid))>0
    as has_confirmation_guard,
  position('Merge integrity check failed: purchased quantity changed unexpectedly.' in pg_get_functiondef(p.oid))>0
    as has_purchase_integrity_guard,
  position('maintenance_records' in pg_get_functiondef(p.oid))>0
    as has_maintenance_preservation
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='merge_master_items_v703314d';
