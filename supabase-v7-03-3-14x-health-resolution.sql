-- Inventory Hub v7.03.3.14x — durable Data Health resolution
alter table public.health_issue_reviews
  add column if not exists resolution_status text not null default 'reviewed',
  add column if not exists resolution_note text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null;

create or replace function public.resolve_health_issue_v703314x(
  p_issue_key text,
  p_issue_type text default null,
  p_entity_type text default null,
  p_entity_id text default null,
  p_title text default null,
  p_detail text default null,
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare v_user uuid:=auth.uid(); v_row public.health_issue_reviews%rowtype;
begin
  if v_user is null then raise exception using errcode='42501',message='Authentication required.'; end if;
  if coalesce(trim(p_issue_key),'')='' then raise exception using errcode='22023',message='Issue key is required.'; end if;
  insert into public.health_issue_reviews(issue_key,issue_type,entity_type,entity_id,title,detail,reviewed_by,reviewed_at,resolution_status,resolution_note,resolved_at,resolved_by)
  values(p_issue_key,p_issue_type,p_entity_type,p_entity_id,p_title,p_detail,v_user,now(),'resolved',nullif(trim(coalesce(p_note,'')),''),now(),v_user)
  on conflict (issue_key) do update set
    issue_type=excluded.issue_type,entity_type=excluded.entity_type,entity_id=excluded.entity_id,title=excluded.title,detail=excluded.detail,
    resolution_status='resolved',resolution_note=excluded.resolution_note,resolved_at=now(),resolved_by=v_user
  returning * into v_row;
  return jsonb_build_object('issue_key',v_row.issue_key,'resolution_status',v_row.resolution_status,'resolved_at',v_row.resolved_at);
end $$;

revoke execute on function public.resolve_health_issue_v703314x(text,text,text,text,text,text,text) from public,anon;
grant execute on function public.resolve_health_issue_v703314x(text,text,text,text,text,text,text) to authenticated;