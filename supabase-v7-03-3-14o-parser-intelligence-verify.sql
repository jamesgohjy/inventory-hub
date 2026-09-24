-- AV Inventory Hub v7.03.3.14o verification
select
  to_regclass('public.parser_correction_memory') is not null as correction_memory_table,
  to_regclass('public.parser_supplier_profiles') is not null as supplier_profiles_table,
  to_regclass('public.parser_quality_events') is not null as parser_quality_events_table,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='file_sha256') as document_fingerprint_column,
  to_regprocedure('public.get_parser_intelligence_v703314o()') is not null as intelligence_rpc,
  to_regprocedure('public.find_document_by_hash_v703314o(text)') is not null as fingerprint_rpc,
  to_regprocedure('public.review_parser_correction_v703314o(uuid,text)') is not null as correction_review_rpc,
  to_regprocedure('public.review_supplier_profile_v703314o(uuid,text)') is not null as profile_review_rpc,
  to_regprocedure('public.admin_parser_quality_snapshot_v703314o()') is not null as admin_dashboard_rpc;
