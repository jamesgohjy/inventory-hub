-- AV Inventory Hub v7.03.3.14t
-- Automated Supabase/database and document backup verification.
-- Run once in Supabase SQL Editor before enabling the GitHub scheduled verifier.
--
-- This migration does NOT copy Storage objects. Supabase managed database backups
-- do not contain Storage file contents. The scheduled verifier separately checks
-- inventory-documents object existence and SHA-256 content integrity where hashes exist.

create extension if not exists pgcrypto;

create table if not exists public.backup_verification_runs (
  id uuid primary key default gen_random_uuid(),
  run_source text not null default 'github-actions',
  overall_status text not null check (overall_status in ('PASS','WARN','FAIL')),
  managed_backup_status text not null default 'UNKNOWN' check (managed_backup_status in ('PASS','WARN','FAIL','UNKNOWN')),
  database_status text not null default 'UNKNOWN' check (database_status in ('PASS','WARN','FAIL','UNKNOWN')),
  document_status text not null default 'UNKNOWN' check (document_status in ('PASS','WARN','FAIL','UNKNOWN')),
  latest_backup_at timestamptz,
  latest_backup_age_hours numeric(12,2),
  backup_type text not null default '',
  pitr_enabled boolean,
  walg_enabled boolean,
  table_counts jsonb not null default '{}'::jsonb,
  integrity_summary jsonb not null default '{}'::jsonb,
  document_summary jsonb not null default '{}'::jsonb,
  management_summary jsonb not null default '{}'::jsonb,
  error_text text not null default '',
  external_run_id text not null default '',
  verified_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists ix_backup_verification_runs_verified_v703314t
  on public.backup_verification_runs (verified_at desc);

alter table public.backup_verification_runs enable row level security;
revoke all on table public.backup_verification_runs from anon, authenticated;

create or replace function public.backup_actor_role_v703314t()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := '';
  v_confirmed boolean := false;
begin
  if auth.uid() is null or to_regclass('public.profiles') is null then
    return '';
  end if;

  begin
    select lower(trim(coalesce(role::text,''))), coalesce(app_confirmed,false)
      into v_role,v_confirmed
      from public.profiles
     where id=auth.uid();
  exception
    when undefined_column then
      return '';
  end;

  if v_confirmed is not true then
    return '';
  end if;
  return coalesce(v_role,'');
end;
$$;

create or replace function public.service_backup_integrity_snapshot_v703314t()
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_required_tables text[] := array[
    'master_items','documents','purchases','purchase_items','serial_numbers',
    'inventory_adjustments','maintenance_records','audit_log','profiles',
    'health_issue_reviews','parser_correction_memory','parser_supplier_profiles',
    'parser_quality_events','backup_verification_runs'
  ];
  v_optional_tables text[] := array['feedback_submissions','admin_notifications'];
  v_table text;
  v_count bigint;
  v_table_counts jsonb := '{}'::jsonb;
  v_missing_required text[] := array[]::text[];
  v_missing_optional text[] := array[]::text[];

  v_pi_without_purchase bigint := 0;
  v_pi_without_item bigint := 0;
  v_serial_without_pi bigint := 0;
  v_serial_without_item bigint := 0;
  v_adjust_without_item bigint := 0;
  v_maintenance_without_item bigint := 0;
  v_duplicate_serial_groups bigint := 0;

  v_document_rows bigint := 0;
  v_storage_objects bigint := 0;
  v_storage_total_bytes bigint := 0;
  v_missing_storage_objects bigint := 0;
  v_orphan_storage_objects bigint := 0;
  v_zero_byte_storage_objects bigint := 0;
  v_documents_without_hash bigint := 0;
  v_bucket_exists boolean := false;

  v_feedback_bucket_exists boolean := false;
  v_feedback_storage_objects bigint := 0;

  v_database_status text := 'PASS';
  v_document_status text := 'PASS';
  v_integrity jsonb;
  v_storage jsonb;
begin
  foreach v_table in array v_required_tables loop
    if to_regclass('public.'||v_table) is null then
      v_missing_required := array_append(v_missing_required,v_table);
    else
      execute format('select count(*) from public.%I',v_table) into v_count;
      v_table_counts := v_table_counts || jsonb_build_object(v_table,v_count);
    end if;
  end loop;

  foreach v_table in array v_optional_tables loop
    if to_regclass('public.'||v_table) is null then
      v_missing_optional := array_append(v_missing_optional,v_table);
    else
      execute format('select count(*) from public.%I',v_table) into v_count;
      v_table_counts := v_table_counts || jsonb_build_object(v_table,v_count);
    end if;
  end loop;

  if to_regclass('public.purchase_items') is not null
     and to_regclass('public.purchases') is not null then
    select count(*) into v_pi_without_purchase
      from public.purchase_items pi
      left join public.purchases p on p.id=pi.purchase_id
     where p.id is null;
  end if;

  if to_regclass('public.purchase_items') is not null
     and to_regclass('public.master_items') is not null then
    select count(*) into v_pi_without_item
      from public.purchase_items pi
      left join public.master_items m on m.id=pi.master_item_id
     where m.id is null;
  end if;

  if to_regclass('public.serial_numbers') is not null
     and to_regclass('public.purchase_items') is not null then
    select count(*) into v_serial_without_pi
      from public.serial_numbers s
      left join public.purchase_items pi on pi.id=s.purchase_item_id
     where pi.id is null;
  end if;

  if to_regclass('public.serial_numbers') is not null
     and to_regclass('public.master_items') is not null then
    select count(*) into v_serial_without_item
      from public.serial_numbers s
      left join public.master_items m on m.id=s.master_item_id
     where m.id is null;

    select count(*) into v_duplicate_serial_groups
      from (
        select lower(trim(serial_number)) as serial_key
          from public.serial_numbers
         where nullif(trim(serial_number),'') is not null
         group by lower(trim(serial_number))
        having count(*) > 1
      ) q;
  end if;

  if to_regclass('public.inventory_adjustments') is not null
     and to_regclass('public.master_items') is not null then
    select count(*) into v_adjust_without_item
      from public.inventory_adjustments a
      left join public.master_items m on m.id=a.master_item_id
     where m.id is null;
  end if;

  if to_regclass('public.maintenance_records') is not null
     and to_regclass('public.master_items') is not null then
    execute '
      select count(*)
        from public.maintenance_records r
        left join public.master_items m on m.id=r.master_item_id
       where r.master_item_id is not null and m.id is null'
      into v_maintenance_without_item;
  end if;

  select exists(
    select 1 from storage.buckets where id='inventory-documents'
  ) into v_bucket_exists;

  if to_regclass('public.documents') is not null then
    select count(*) into v_document_rows from public.documents;

    if exists (
      select 1 from information_schema.columns
       where table_schema='public'
         and table_name='documents'
         and column_name='file_sha256'
    ) then
      execute '
        select count(*)
          from public.documents
         where coalesce(file_sha256,'''') !~* ''^[0-9a-f]{64}$'''
        into v_documents_without_hash;
    else
      v_documents_without_hash := v_document_rows;
    end if;
  end if;

  if v_bucket_exists then
    select count(*),
           coalesce(sum(
             case
               when coalesce(metadata->>'size','') ~ '^[0-9]+$'
               then (metadata->>'size')::bigint
               else 0
             end
           ),0)
      into v_storage_objects,v_storage_total_bytes
      from storage.objects
     where bucket_id='inventory-documents';

    select count(*)
      into v_zero_byte_storage_objects
      from storage.objects
     where bucket_id='inventory-documents'
       and (
         coalesce(metadata->>'size','') !~ '^[0-9]+$'
         or coalesce((metadata->>'size')::bigint,0) <= 0
       );

    if to_regclass('public.documents') is not null then
      select count(*)
        into v_missing_storage_objects
        from public.documents d
        left join storage.objects o
          on o.bucket_id='inventory-documents'
         and o.name=d.storage_path
       where nullif(trim(d.storage_path),'') is null
          or o.id is null;

      select count(*)
        into v_orphan_storage_objects
        from storage.objects o
        left join public.documents d
          on d.storage_path=o.name
       where o.bucket_id='inventory-documents'
         and d.id is null;
    end if;
  else
    v_missing_storage_objects := v_document_rows;
  end if;

  select exists(
    select 1 from storage.buckets where id='feedback-attachments'
  ) into v_feedback_bucket_exists;

  if v_feedback_bucket_exists then
    select count(*) into v_feedback_storage_objects
      from storage.objects where bucket_id='feedback-attachments';
  end if;

  v_integrity := jsonb_build_object(
    'missing_required_tables',to_jsonb(v_missing_required),
    'missing_optional_tables',to_jsonb(v_missing_optional),
    'purchase_items_without_purchase',v_pi_without_purchase,
    'purchase_items_without_master_item',v_pi_without_item,
    'serials_without_purchase_item',v_serial_without_pi,
    'serials_without_master_item',v_serial_without_item,
    'adjustments_without_master_item',v_adjust_without_item,
    'maintenance_without_master_item',v_maintenance_without_item,
    'duplicate_serial_groups',v_duplicate_serial_groups
  );

  v_storage := jsonb_build_object(
    'bucket','inventory-documents',
    'bucket_exists',v_bucket_exists,
    'document_rows',v_document_rows,
    'storage_objects',v_storage_objects,
    'storage_total_bytes',v_storage_total_bytes,
    'missing_storage_objects',v_missing_storage_objects,
    'orphan_storage_objects',v_orphan_storage_objects,
    'zero_byte_storage_objects',v_zero_byte_storage_objects,
    'documents_without_sha256',v_documents_without_hash,
    'feedback_bucket_exists',v_feedback_bucket_exists,
    'feedback_storage_objects',v_feedback_storage_objects
  );

  if cardinality(v_missing_required) > 0
     or v_pi_without_purchase > 0
     or v_pi_without_item > 0
     or v_serial_without_pi > 0
     or v_serial_without_item > 0
     or v_adjust_without_item > 0
     or v_maintenance_without_item > 0
     or v_duplicate_serial_groups > 0 then
    v_database_status := 'FAIL';
  end if;

  if not v_bucket_exists
     or v_missing_storage_objects > 0
     or v_zero_byte_storage_objects > 0 then
    v_document_status := 'FAIL';
  elsif v_orphan_storage_objects > 0
        or v_documents_without_hash > 0 then
    v_document_status := 'WARN';
  end if;

  return jsonb_build_object(
    'database_status',v_database_status,
    'document_status',v_document_status,
    'table_counts',v_table_counts,
    'integrity',v_integrity,
    'storage',v_storage,
    'checked_at',now()
  );
end;
$$;

create or replace function public.service_record_backup_verification_v703314t(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text := upper(coalesce(p_payload->>'overall_status','FAIL'));
  v_managed text := upper(coalesce(p_payload->>'managed_backup_status','UNKNOWN'));
  v_database text := upper(coalesce(p_payload->>'database_status','UNKNOWN'));
  v_document text := upper(coalesce(p_payload->>'document_status','UNKNOWN'));
  v_row public.backup_verification_runs%rowtype;
begin
  if v_status not in ('PASS','WARN','FAIL') then v_status := 'FAIL'; end if;
  if v_managed not in ('PASS','WARN','FAIL','UNKNOWN') then v_managed := 'UNKNOWN'; end if;
  if v_database not in ('PASS','WARN','FAIL','UNKNOWN') then v_database := 'UNKNOWN'; end if;
  if v_document not in ('PASS','WARN','FAIL','UNKNOWN') then v_document := 'UNKNOWN'; end if;

  insert into public.backup_verification_runs(
    run_source,overall_status,managed_backup_status,database_status,document_status,
    latest_backup_at,latest_backup_age_hours,backup_type,pitr_enabled,walg_enabled,
    table_counts,integrity_summary,document_summary,management_summary,error_text,
    external_run_id,verified_at,created_by
  )
  values (
    left(coalesce(nullif(trim(p_payload->>'run_source'),''),'github-actions'),80),
    v_status,v_managed,v_database,v_document,
    nullif(p_payload->>'latest_backup_at','')::timestamptz,
    nullif(p_payload->>'latest_backup_age_hours','')::numeric,
    left(coalesce(p_payload->>'backup_type',''),80),
    case when p_payload ? 'pitr_enabled' then (p_payload->>'pitr_enabled')::boolean else null end,
    case when p_payload ? 'walg_enabled' then (p_payload->>'walg_enabled')::boolean else null end,
    coalesce(p_payload->'table_counts','{}'::jsonb),
    coalesce(p_payload->'integrity_summary','{}'::jsonb),
    coalesce(p_payload->'document_summary','{}'::jsonb),
    coalesce(p_payload->'management_summary','{}'::jsonb),
    left(coalesce(p_payload->>'error_text',''),2000),
    left(coalesce(p_payload->>'external_run_id',''),160),
    coalesce(nullif(p_payload->>'verified_at','')::timestamptz,now()),
    null
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_backup_verification_history_v703314t(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.backup_actor_role_v703314t();
  v_limit integer := greatest(1,least(coalesce(p_limit,20),100));
  v_latest jsonb;
  v_runs jsonb;
begin
  if v_role <> 'admin' then
    raise exception using errcode='42501',message='Admin access required.';
  end if;

  select to_jsonb(x) into v_latest
    from (
      select *
        from public.backup_verification_runs
       order by verified_at desc
       limit 1
    ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.verified_at desc),'[]'::jsonb)
    into v_runs
    from (
      select *
        from public.backup_verification_runs
       order by verified_at desc
       limit v_limit
    ) x;

  return jsonb_build_object(
    'latest',v_latest,
    'runs',v_runs,
    'schedule','Daily at 02:30 Singapore time via GitHub Actions',
    'storage_note','Supabase database backups do not contain Storage object contents.'
  );
end;
$$;

revoke execute on function public.backup_actor_role_v703314t() from public, anon;
revoke execute on function public.service_backup_integrity_snapshot_v703314t() from public, anon, authenticated;
revoke execute on function public.service_record_backup_verification_v703314t(jsonb) from public, anon, authenticated;
revoke execute on function public.admin_backup_verification_history_v703314t(integer) from public, anon;

grant execute on function public.backup_actor_role_v703314t() to authenticated;
grant execute on function public.service_backup_integrity_snapshot_v703314t() to service_role;
grant execute on function public.service_record_backup_verification_v703314t(jsonb) to service_role;
grant execute on function public.admin_backup_verification_history_v703314t(integer) to authenticated;

comment on table public.backup_verification_runs is
'Admin-visible history of automated managed-backup, database-integrity and document-storage verification runs.';

comment on function public.service_backup_integrity_snapshot_v703314t() is
'Service-role-only inventory database and Storage metadata integrity snapshot used by the automated backup verifier.';

comment on function public.admin_backup_verification_history_v703314t(integer) is
'Admin-only backup verification history for Inventory Hub.';
