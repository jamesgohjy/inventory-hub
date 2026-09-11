-- Inventory Hub: shared-team production database
-- Run this once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.master_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  item_name text not null,
  description text default '',
  category text default '',
  unit text not null default 'pcs',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_master_items_sku_ci on public.master_items (lower(sku));

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  storage_path text not null,
  mime_type text default 'application/pdf',
  supplier_name text default '',
  invoice_number text default '',
  uploaded_by uuid default auth.uid(),
  uploaded_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  invoice_number text not null,
  invoice_date date,
  delivery_order_number text default '',
  purchase_order_number text default '',
  reference_number text default '',
  currency text not null default 'SGD',
  subtotal numeric(14,2),
  gst numeric(14,2),
  total_amount numeric(14,2),
  document_id uuid references public.documents(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists uq_purchase_supplier_invoice_ci on public.purchases (lower(supplier_name), lower(invoice_number));

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  master_item_id uuid not null references public.master_items(id) on delete restrict,
  raw_description text default '',
  quantity numeric(14,2) not null check (quantity > 0),
  unit_price numeric(14,2),
  amount numeric(14,2),
  warranty text default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.serial_numbers (
  id uuid primary key default gen_random_uuid(),
  purchase_item_id uuid not null references public.purchase_items(id) on delete cascade,
  master_item_id uuid not null references public.master_items(id) on delete cascade,
  serial_number text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_serial_number_ci on public.serial_numbers (lower(serial_number));

create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  master_item_id uuid not null references public.master_items(id) on delete cascade,
  adjustment_type text not null check (adjustment_type in ('Damaged','Missing','Disposed','Other')),
  quantity numeric(14,2) not null check (quantity > 0),
  reason text default '',
  adjustment_date date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create or replace view public.inventory_summary as
select
  m.id, m.sku, m.item_name, m.description, m.category, m.unit,
  coalesce((select sum(pi.quantity) from public.purchase_items pi where pi.master_item_id=m.id),0) as total_purchased,
  coalesce((select sum(a.quantity) from public.inventory_adjustments a where a.master_item_id=m.id),0) as total_adjusted,
  coalesce((select sum(pi.quantity) from public.purchase_items pi where pi.master_item_id=m.id),0)
  - coalesce((select sum(a.quantity) from public.inventory_adjustments a where a.master_item_id=m.id),0) as current_inventory
from public.master_items m;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_master_touch on public.master_items;
create trigger trg_master_touch before update on public.master_items for each row execute function public.touch_updated_at();

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log(entity_type,entity_id,action,old_data,new_data,changed_by)
  values (TG_TABLE_NAME, coalesce((case when TG_OP='DELETE' then OLD.id else NEW.id end)::text,''), TG_OP,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(NEW) else null end,
    auth.uid());
  return case when TG_OP='DELETE' then OLD else NEW end;
end $$;

do $$ declare t text; begin
  foreach t in array array['master_items','purchases','purchase_items','serial_numbers','inventory_adjustments','documents'] loop
    execute format('drop trigger if exists trg_audit_%I on public.%I',t,t);
    execute format('create trigger trg_audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',t,t);
  end loop;
end $$;

alter table public.master_items enable row level security;
alter table public.documents enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.serial_numbers enable row level security;
alter table public.inventory_adjustments enable row level security;
alter table public.audit_log enable row level security;

do $$ declare t text; begin
  foreach t in array array['master_items','documents','purchases','purchase_items','serial_numbers','inventory_adjustments'] loop
    execute format('drop policy if exists authenticated_all on public.%I',t);
    execute format('create policy authenticated_all on public.%I for all to authenticated using (true) with check (true)',t);
  end loop;
end $$;
drop policy if exists authenticated_read_audit on public.audit_log;
create policy authenticated_read_audit on public.audit_log for select to authenticated using (true);

insert into storage.buckets (id,name,public)
values ('inventory-documents','inventory-documents',false)
on conflict (id) do nothing;

drop policy if exists inventory_docs_read on storage.objects;
create policy inventory_docs_read on storage.objects for select to authenticated using (bucket_id='inventory-documents');
drop policy if exists inventory_docs_insert on storage.objects;
create policy inventory_docs_insert on storage.objects for insert to authenticated with check (bucket_id='inventory-documents');
drop policy if exists inventory_docs_delete on storage.objects;
create policy inventory_docs_delete on storage.objects for delete to authenticated using (bucket_id='inventory-documents');
