-- Duplicate existing rows for each company after introducing company_id columns
-- Adjust lists of columns if schema changes
INSERT INTO SOrlogo (company_id, or_num, or_o_barimt, or_g_id, or_burtgel, or_chig,
  or_torol, or_h_b, or_type_id, or_av_now, or_date, orcash_or_id, or_or,
  or_valut_choice, or_orderid, or_eb, or_emp_receiver, or_tur_receiver,
  or_org_id, trtypename, trtype, uitranstypename, organization, roomid, userid)
SELECT c.id, s.or_num, s.or_o_barimt, s.or_g_id, s.or_burtgel, s.or_chig,
  s.or_torol, s.or_h_b, s.or_type_id, s.or_av_now, s.or_date, s.orcash_or_id, s.or_or,
  s.or_valut_choice, s.or_orderid, s.or_eb, s.or_emp_receiver, s.or_tur_receiver,
  s.or_org_id, s.trtypename, s.trtype, s.uitranstypename, s.organization, s.roomid,
  s.userid
FROM SOrlogo s CROSS JOIN companies c;

INSERT INTO SZardal (company_id, z_num, z_barimt, z_tosov_code, z_tosov_zuil,
  z_taibar, z_angilal_b, z_angilal, z_torol, z_utga, z_from, z_emp_receiver,
  z_tur_receiver, z_other_receiver, z_org_id, z_date, z, z_valut_choice,
  z_mat_code, z_tailbar1, z_eb, z_orderid, z_month, z_noat_oor_month,
  zar_uglug_eseh_code, zar_uglug_month, trtypename, trtype, uitranstypename,
  organization, roomid, userid)
SELECT c.id, s.z_num, s.z_barimt, s.z_tosov_code, s.z_tosov_zuil,
  s.z_taibar, s.z_angilal_b, s.z_angilal, s.z_torol, s.z_utga, s.z_from,
  s.z_emp_receiver, s.z_tur_receiver, s.z_other_receiver, s.z_org_id, s.z_date,
  s.z, s.z_valut_choice, s.z_mat_code, s.z_tailbar1, s.z_eb, s.z_orderid,
  s.z_month, s.z_noat_oor_month, s.zar_uglug_eseh_code, s.zar_uglug_month,
  s.trtypename, s.trtype, s.uitranstypename, s.organization, s.roomid,
  s.userid
FROM SZardal s CROSS JOIN companies c;

-- Repeat similar INSERT ... SELECT for tusuv, BMBurtgel, MMorder, SGereeJ, form_submissions
-- ensuring company_id is included
