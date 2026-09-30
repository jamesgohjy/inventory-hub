-- Inventory Hub v7.03.3.16 — allow multiple distinct master items with blank SKU.
-- Exact non-blank SKU values remain case-insensitively unique.
drop index if exists public.uq_master_items_sku_ci;
create unique index if not exists uq_master_items_sku_ci
on public.master_items (lower(sku))
where nullif(trim(sku),'') is not null;
