-- AV Inventory Hub v7.03.3.14x
-- Persistent Data Health resolution for valid exceptions (for example equipment with no serial number).

alter table if exists public.health_issue_reviews
  add column if not exists resolution_status text not null default 'reviewed',
  add column if not exists resolution_note text not null default '',
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid;

create or replace function public.resolve_health_issue_v703314x(
  p_issue_key text,
  p_issue_type text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_title text default '',
  p_detail text default '',
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := '';
  v_confirmed boolean := false;
  v_now timestamptz := now();
  v_row public.health_issue_reviews%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='Authentication required.';
  end if;
  if trim(coalesce(p_issue_key,''))='' then
    raise exception using errcode='22023', message='Data Health issue key is required.';
  end if;

  select lower(trim(coalesce(role::text,''))),coalesce(app_confirmed,false)
    into v_role,v_confirmed
    from public.profiles
   where id=auth.uid();

  if v_confirmed is not true or v_role not in ('admin','editor') then
    raise exception using errcode='42501', message='Editor or Admin access required.';
  end if;

  update public.health_issue_reviews
     set issue_type=coalesce(nullif(p_issue_type,''),issue_type),
         entity_type=coalesce(p_entity_type,entity_type),
         entity_id=coalesce(p_entity_id,entity_id),
         title=coalesce(nullif(p_title,''),title),
         detail=coalesce(nullif(p_detail,''),detail),
         resolution_status='resolved',
         resolution_note=coalesce(p_note,''),
         resolved_at=v_now,
         resolved_by=auth.uid()
   where issue_key=p_issue_key
   returning * into v_row;

  if not found then
    insert into public.health_issue_reviews(
      issue_key,issue_type,entity_type,entity_id,title,detail,reviewed_by,reviewed_at,
      resolution_status,resolution_note,resolved_at,resolved_by
    ) values (
      p_issue_key,coalesce(p_issue_type,'Finding'),p_entity_type,p_entity_id,coalesce(p_title,''),coalesce(p_detail,''),
      auth.uid(),v_now,'resolved',coalesce(p_note,''),v_now,auth.uid()
    ) returning * into v_row;
  end if;

  insert into public.audit_log(entity_type,entity_id,action,old_data,new_data,changed_by)
  values('health_issue_reviews',p_issue_key,'RESOLVE',null,to_jsonb(v_row),auth.uid());

  return jsonb_build_object('resolved',true,'issue_key',p_issue_key,'resolved_at',v_now);
end;
$$;

revoke execute on function public.resolve_health_issue_v703314x(text,text,text,text,text,text,text) from public;
revoke execute on function public.resolve_health_issue_v703314x(text,text,text,text,text,text,text) from anon;
grant execute on function public.resolve_health_issue_v703314x(text,text,text,text,text,text,text) to authenticated;

comment on function public.resolve_health_issue_v703314x(text,text,text,text,text,text,text)
is 'Persists an explicit user resolution for a Data Health finding so valid exceptions do not remain active.';
