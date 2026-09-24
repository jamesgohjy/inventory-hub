-- AV Inventory Hub v7.03.3.14o
-- Parser intelligence: Correction Memory, Supplier Layout Profiles,
-- exact PDF fingerprint duplicate detection and Parser Quality Dashboard.
-- Additive migration: no inventory/purchase relationships are changed.

create extension if not exists pgcrypto;

alter table public.documents add column if not exists file_sha256 text;
alter table public.documents add column if not exists parser_version text;
alter table public.documents add column if not exists parse_audit jsonb;
create index if not exists ix_documents_file_sha256_v703314o
  on public.documents (lower(file_sha256))
  where nullif(trim(file_sha256),'') is not null;

create table if not exists public.parser_correction_memory (
  id uuid primary key default gen_random_uuid(),
  supplier_key text not null,
  supplier_name text not null default '',
  invoice_number text not null default '',
  field_name text not null,
  source_value text not null default '',
  corrected_value text not null,
  item_identity text not null default '',
  evidence_text text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz
);
create index if not exists ix_parser_correction_memory_lookup_v703314o
  on public.parser_correction_memory (supplier_key, field_name, status, created_at desc);

create table if not exists public.parser_supplier_profiles (
  id uuid primary key default gen_random_uuid(),
  supplier_key text not null unique,
  supplier_name text not null default '',
  labels jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','active','disabled')),
  sample_count integer not null default 1 check (sample_count > 0),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  created_by uuid default auth.uid(),
  approved_by uuid,
  approved_at timestamptz
);

create table if not exists public.parser_quality_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  supplier_key text not null default '',
  supplier_name text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists ix_parser_quality_events_created_v703314o on public.parser_quality_events (created_at desc);
create index if not exists ix_parser_quality_events_supplier_v703314o on public.parser_quality_events (supplier_key, created_at desc);

alter table public.parser_correction_memory enable row level security;
alter table public.parser_supplier_profiles enable row level security;
alter table public.parser_quality_events enable row level security;

create or replace function public.parser_supplier_key_v703314o(p_value text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(
    regexp_replace(lower(coalesce(p_value,'')), '\m(pte|ltd|limited|private|co|company)\M', ' ', 'gi'),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

create or replace function public.parser_actor_role_v703314o()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := '';
  v_confirmed boolean := false;
begin
  if auth.uid() is null or to_regclass('public.profiles') is null then return ''; end if;
  begin
    execute 'select lower(trim(coalesce(role::text, ''''))), coalesce(app_confirmed,false) from public.profiles where id=$1'
      into v_role,v_confirmed using auth.uid();
  exception when undefined_column then
    return '';
  end;
  if v_confirmed is not true then return ''; end if;
  return coalesce(v_role,'');
end;
$$;

create or replace function public.get_parser_intelligence_v703314o()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_role text := public.parser_actor_role_v703314o(); v_corrections jsonb; v_profiles jsonb;
begin
  if v_role not in ('admin','editor','viewer') then raise exception using errcode='42501',message='Confirmed Inventory Hub account required.'; end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc),'[]'::jsonb) into v_corrections
    from public.parser_correction_memory c where c.status='approved';
  select coalesce(jsonb_agg(to_jsonb(p) order by p.last_seen desc),'[]'::jsonb) into v_profiles
    from public.parser_supplier_profiles p where p.status='active';
  return jsonb_build_object('corrections',v_corrections,'profiles',v_profiles);
end;
$$;

create or replace function public.find_document_by_hash_v703314o(p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_role text := public.parser_actor_role_v703314o(); v_hash text := lower(trim(coalesce(p_hash,''))); v_result jsonb;
begin
  if v_role not in ('admin','editor') then raise exception using errcode='42501',message='Editor or Admin access required.'; end if;
  if v_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select jsonb_build_object('id',d.id,'file_name',d.file_name,'supplier_name',d.supplier_name,'invoice_number',d.invoice_number,'uploaded_at',d.uploaded_at)
    into v_result from public.documents d where lower(coalesce(d.file_sha256,''))=v_hash order by d.uploaded_at desc limit 1;
  return v_result;
end;
$$;

create or replace function public.record_parser_corrections_v703314o(
  p_supplier_name text,
  p_invoice_number text,
  p_corrections jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.parser_actor_role_v703314o();
  v_supplier text := trim(coalesce(p_supplier_name,''));
  v_key text := public.parser_supplier_key_v703314o(p_supplier_name);
  v_item jsonb; v_field text; v_source text; v_corrected text; v_identity text; v_evidence text; v_added integer := 0;
begin
  if v_role not in ('admin','editor') then raise exception using errcode='42501',message='Editor or Admin access required.'; end if;
  if jsonb_typeof(coalesce(p_corrections,'[]'::jsonb)) <> 'array' then raise exception using errcode='22023',message='Corrections must be a JSON array.'; end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_corrections,'[]'::jsonb)) loop
    v_field := trim(coalesce(v_item->>'field_name',''));
    v_source := trim(coalesce(v_item->>'source_value',''));
    v_corrected := trim(coalesce(v_item->>'corrected_value',''));
    v_identity := trim(coalesce(v_item->>'item_identity',''));
    v_evidence := left(trim(coalesce(v_item->>'evidence_text','')),1200);
    if v_field not in ('supplier_name','invoice_number','invoice_date','sku','item_name','quantity','unit_price','amount','serials') then continue; end if;
    if v_corrected='' or v_corrected=v_source then continue; end if;
    if not exists (
      select 1 from public.parser_correction_memory c
      where c.supplier_key=v_key and c.field_name=v_field
        and lower(c.source_value)=lower(v_source) and lower(c.corrected_value)=lower(v_corrected)
        and c.status in ('pending','approved')
    ) then
      insert into public.parser_correction_memory(
        supplier_key,supplier_name,invoice_number,field_name,source_value,corrected_value,item_identity,evidence_text,status,created_by
      ) values (
        v_key,v_supplier,trim(coalesce(p_invoice_number,'')),v_field,v_source,v_corrected,v_identity,v_evidence,'pending',auth.uid()
      );
      v_added := v_added + 1;
    end if;
  end loop;
  return jsonb_build_object('added',v_added,'status','pending');
end;
$$;

create or replace function public.review_parser_correction_v703314o(p_id uuid,p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_role text := public.parser_actor_role_v703314o(); v_action text := lower(trim(coalesce(p_action,''))); v_old jsonb; v_new jsonb;
begin
  if v_role <> 'admin' then raise exception using errcode='42501',message='Admin access required.'; end if;
  if v_action not in ('approve','reject') then raise exception using errcode='22023',message='Action must be approve or reject.'; end if;
  select to_jsonb(c) into v_old from public.parser_correction_memory c where c.id=p_id for update;
  if v_old is null then raise exception using errcode='P0002',message='Correction Memory record not found.'; end if;
  update public.parser_correction_memory set status=case when v_action='approve' then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now() where id=p_id returning to_jsonb(parser_correction_memory.*) into v_new;
  insert into public.audit_log(entity_type,entity_id,action,old_data,new_data,changed_by) values ('parser_correction_memory',p_id::text,upper(v_action),v_old,v_new,auth.uid());
  return v_new;
end;
$$;

create or replace function public.upsert_supplier_profile_observation_v703314o(p_supplier_name text,p_labels jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_role text := public.parser_actor_role_v703314o(); v_name text := trim(coalesce(p_supplier_name,'')); v_key text := public.parser_supplier_key_v703314o(p_supplier_name); v_row jsonb;
begin
  if v_role not in ('admin','editor') then raise exception using errcode='42501',message='Editor or Admin access required.'; end if;
  if v_key='' then return jsonb_build_object('skipped',true,'reason','supplier blank'); end if;
  insert into public.parser_supplier_profiles(supplier_key,supplier_name,labels,status,sample_count,first_seen,last_seen,created_by)
  values(v_key,v_name,coalesce(p_labels,'{}'::jsonb),'pending',1,now(),now(),auth.uid())
  on conflict (supplier_key) do update set
    supplier_name=case when excluded.supplier_name<>'' then excluded.supplier_name else parser_supplier_profiles.supplier_name end,
    labels=coalesce(parser_supplier_profiles.labels,'{}'::jsonb)||coalesce(excluded.labels,'{}'::jsonb),
    sample_count=parser_supplier_profiles.sample_count+1,
    last_seen=now()
  returning to_jsonb(parser_supplier_profiles.*) into v_row;
  return v_row;
end;
$$;

create or replace function public.review_supplier_profile_v703314o(p_id uuid,p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_role text := public.parser_actor_role_v703314o(); v_action text := lower(trim(coalesce(p_action,''))); v_old jsonb; v_new jsonb;
begin
  if v_role <> 'admin' then raise exception using errcode='42501',message='Admin access required.'; end if;
  if v_action not in ('activate','disable') then raise exception using errcode='22023',message='Action must be activate or disable.'; end if;
  select to_jsonb(p) into v_old from public.parser_supplier_profiles p where p.id=p_id for update;
  if v_old is null then raise exception using errcode='P0002',message='Supplier profile not found.'; end if;
  update public.parser_supplier_profiles set status=case when v_action='activate' then 'active' else 'disabled' end,approved_by=case when v_action='activate' then auth.uid() else approved_by end,approved_at=case when v_action='activate' then now() else approved_at end where id=p_id returning to_jsonb(parser_supplier_profiles.*) into v_new;
  insert into public.audit_log(entity_type,entity_id,action,old_data,new_data,changed_by) values ('parser_supplier_profiles',p_id::text,upper(v_action),v_old,v_new,auth.uid());
  return v_new;
end;
$$;

create or replace function public.record_parser_quality_event_v703314o(p_event_type text,p_supplier_name text,p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_role text := public.parser_actor_role_v703314o(); v_id bigint;
begin
  if v_role not in ('admin','editor') then raise exception using errcode='42501',message='Editor or Admin access required.'; end if;
  insert into public.parser_quality_events(event_type,supplier_key,supplier_name,payload,created_by)
  values(left(trim(coalesce(p_event_type,'event')),64),public.parser_supplier_key_v703314o(p_supplier_name),trim(coalesce(p_supplier_name,'')),coalesce(p_payload,'{}'::jsonb),auth.uid())
  returning id into v_id;
  return jsonb_build_object('id',v_id);
end;
$$;

create or replace function public.admin_parser_quality_snapshot_v703314o()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_role text := public.parser_actor_role_v703314o(); v_corrections jsonb; v_profiles jsonb; v_events jsonb;
begin
  if v_role <> 'admin' then raise exception using errcode='42501',message='Admin access required.'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_corrections from (select * from public.parser_correction_memory order by created_at desc limit 100) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.last_seen desc),'[]'::jsonb) into v_profiles from (select * from public.parser_supplier_profiles order by last_seen desc limit 100) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_events from (select * from public.parser_quality_events order by created_at desc limit 100) x;
  return jsonb_build_object('corrections',v_corrections,'profiles',v_profiles,'events',v_events);
end;
$$;

revoke all on table public.parser_correction_memory from anon, authenticated;
revoke all on table public.parser_supplier_profiles from anon, authenticated;
revoke all on table public.parser_quality_events from anon, authenticated;

revoke execute on function public.parser_supplier_key_v703314o(text) from public, anon;
revoke execute on function public.parser_actor_role_v703314o() from public, anon;
revoke execute on function public.get_parser_intelligence_v703314o() from public, anon;
revoke execute on function public.find_document_by_hash_v703314o(text) from public, anon;
revoke execute on function public.record_parser_corrections_v703314o(text,text,jsonb) from public, anon;
revoke execute on function public.review_parser_correction_v703314o(uuid,text) from public, anon;
revoke execute on function public.upsert_supplier_profile_observation_v703314o(text,jsonb) from public, anon;
revoke execute on function public.review_supplier_profile_v703314o(uuid,text) from public, anon;
revoke execute on function public.record_parser_quality_event_v703314o(text,text,jsonb) from public, anon;
revoke execute on function public.admin_parser_quality_snapshot_v703314o() from public, anon;

grant execute on function public.parser_supplier_key_v703314o(text) to authenticated;
grant execute on function public.parser_actor_role_v703314o() to authenticated;
grant execute on function public.get_parser_intelligence_v703314o() to authenticated;
grant execute on function public.find_document_by_hash_v703314o(text) to authenticated;
grant execute on function public.record_parser_corrections_v703314o(text,text,jsonb) to authenticated;
grant execute on function public.review_parser_correction_v703314o(uuid,text) to authenticated;
grant execute on function public.upsert_supplier_profile_observation_v703314o(text,jsonb) to authenticated;
grant execute on function public.review_supplier_profile_v703314o(uuid,text) to authenticated;
grant execute on function public.record_parser_quality_event_v703314o(text,text,jsonb) to authenticated;
grant execute on function public.admin_parser_quality_snapshot_v703314o() to authenticated;

comment on table public.parser_correction_memory is 'Pending/approved parser corrections. Only approved evidence-backed SKU/invoice-number memories may auto-apply.';
comment on table public.parser_supplier_profiles is 'Observed supplier labels/layout hints. Only Admin-activated profiles are returned to the parser.';
comment on column public.documents.file_sha256 is 'Exact source-file SHA-256 used for duplicate prevention.';
