-- Original SQL for dynrep_income_daterange
SELECT
    t0.or_chig AS or_chig,
    t5.name AS chig,
    t0.or_torol AS or_torol,
    t2.name AS torol,
    t0.or_type_id AS or_type_id,
    t4.name AS or_type,
    t0.orcash_or_id AS orcash_or_id,
    t6.name AS cashier,
    t0.or_date AS or_date,
    SUM(IFNULL(t0.or_or, 0)) AS orlogiin_dun,
    COUNT(*) AS too
  FROM (SELECT * FROM transactions_income WHERE or_date >= start_date AND or_date < end_date AND (ortr_transbranch = session_branch_id OR or_chig = session_branch_id OR or_torol = session_branch_id OR branch_id = session_branch_id) AND company_id = session_company_id AND or_or > 0) t0
  LEFT JOIN code_transaction t1 ON t0.TransType = t1.UITransType
  LEFT JOIN code_chiglel t5 ON t0.or_chig = t5.id
  LEFT JOIN code_torol t2 ON t0.or_torol = t2.id
  LEFT JOIN code_incometype t4 ON t0.or_type_id = t4.id
  LEFT JOIN code_cashier t6 ON t0.orcash_or_id = t6.id
  GROUP BY or_chig, chig, or_torol, torol, or_type_id, or_type, orcash_or_id, cashier, or_date;


-- Transformed SQL for dynrep_income_daterange
SELECT * FROM (SELECT t0.or_chig AS or_chig, t5.name AS chig, t0.or_torol AS or_torol, t2.name AS torol, t0.or_type_id AS or_type_id, t4.name AS or_type, t0.orcash_or_id AS orcash_or_id, t6.name AS cashier, t0.or_date AS or_date, IFNULL(t0.or_or, 0) AS orlogiin_dun, t0.or_g_id, t0.or_burtgel, t0.or_av_now, t0.or_vallut_id, t0.or_valut_choice, t0.or_bcode, t0.or_orderid, t0.or_tailbar1, t0.or_eb, t0.or_emp_receiver, t0.or_tur_receiver, t0.or_other_receiver, t0.or_org_id, t0.sp_primary_code, t0.sp_selling_code, t0.sp_pm_name, t0.sp_pm_unit_id, t0.sp_manufacturer_id, t0.sp_cost, t0.company_id, t0.branch_id, t0.ortr_confirm_emp FROM (SELECT * FROM transactions_income WHERE or_date >= '2025-01-01' AND or_date < '2026-01-01' AND (ortr_transbranch = 3 OR or_chig = 3 OR or_torol = 3 OR branch_id = 3) AND company_id = 2 AND or_or > 0) t0
  LEFT JOIN code_transaction t1 ON t0.TransType = t1.UITransType
  LEFT JOIN code_chiglel t5 ON t0.or_chig = t5.id
  LEFT JOIN code_torol t2 ON t0.or_torol = t2.id
  LEFT JOIN code_incometype t4 ON t0.or_type_id = t4.id
  LEFT JOIN code_cashier t6 ON t0.orcash_or_id = t6.id
  ) AS _raw WHERE or_chig = 1 AND or_chig = 1 AND or_torol = 3 AND or_type_id = 17 AND orcash_or_id = 11 AND or_date = '2025-06-28'
