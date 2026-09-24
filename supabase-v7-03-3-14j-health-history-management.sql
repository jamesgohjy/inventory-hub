-- AV Inventory Hub v7.03.3.14j
-- Persistent Data Health review-history management.
-- Run once in Supabase SQL Editor before using Reopen/Delete history controls.

create or replace function public.manage_health_issue_reviews_v703314j(
  p_issue_keys text[],
  p_action text default 'delete'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_role text := '';
  v_app_confirmed boolean := false;
  v_action text := lower(trim(coalesce(p_action,'delete')));
  v_key text;
  v_old jsonb;
  v_affected integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='Authentication required.';
  end if;

  if to_regclass('public.profiles') is null then
    raise exception using errcode='42501', message='Inventory member roles are not installed.';
  end if;

  begin
    execute
      'select lower(trim(coalesce(role::text, ''''))), coalesce(app_confirmed,false)
         from public.profiles
        where id=$1'
      into v_actor_role,v_app_confirmed
      using auth.uid();
  exception
    when undefined_column then
      raise exception using errcode='42501', message='Inventory member authorization information is unavailable.';
  end;

  if v_app_confirmed is not true then
    raise exception using errcode='42501', message='Confirmed Inventory Hub account required.';
  end if;

  if coalesce(v_actor_role,'') not in ('admin','editor') then
    raise exception using errcode='42501', message='Editor or Admin access required.';
  end if;

  if v_action not in ('delete','reopen') then
    raise exception using errcode='22023', message='Unsupported Data Health history action.';
  end if;

  if p_issue_keys is null or cardinality(p_issue_keys)=0 then
    return jsonb_build_object('affected',0,'action',v_action);
  end if;

  if to_regclass('public.health_issue_reviews') is null then
    raise exception using errcode='42P01', message='Data Health review history is not installed.';
  end if;

  foreach v_key in array p_issue_keys loop
    if nullif(trim(v_key),'') is null then
      continue;
    end if;

    v_old := null;
    execute
      'select to_jsonb(h)
         from public.health_issue_reviews h
        where h.issue_key=$1
        for update'
      into v_old
      using v_key;

    if v_old is null then
      continue;
    end if;

    execute 'delete from public.health_issue_reviews where issue_key=$1' using v_key;

    insert into public.audit_log(entity_type,entity_id,action,old_data,new_data,changed_by)
    values (
      'health_issue_reviews',
      v_key,
      upper(v_action),
      v_old,
      jsonb_build_object('management_action',v_action),
      auth.uid()
    );

    v_affected := v_affected + 1;
  end loop;

  return jsonb_build_object('affected',v_affected,'action',v_action);
end;
$$;

revoke execute on function public.manage_health_issue_reviews_v703314j(text[],text) from public;
revoke execute on function public.manage_health_issue_reviews_v703314j(text[],text) from anon;
grant execute on function public.manage_health_issue_reviews_v703314j(text[],text) to authenticated;

comment on function public.manage_health_issue_reviews_v703314j(text[],text)
is 'Admin/Editor-only Data Health review-history management. Reopen/Delete removes selected review records and records the action in audit_log.';
