-- Original SQL for dynrep_inventory_warehouse
SELECT
    t4.primary_code AS primary_code,
    t4.pm_name AS pm_name,
    t2.unit AS unit,
    SUM(CASE WHEN (t1.inventory_stock = 1) AND (t0.bmtr_date = start_date) THEN IFNULL(t0.bmtr_acc, 0) ELSE 0 END) AS opening_acc,
    SUM(CASE WHEN (t1.inventory_stock = 1) AND (t0.bmtr_date = start_date) THEN IFNULL(t0.bmtr_sub, 0) ELSE 0 END) AS opening_sub,
    SUM(CASE WHEN (t1.trn_affects_stock = 1) AND (t1.trn_inventory_change = 'increase') THEN IFNULL(t0.bmtr_acc, 0) ELSE 0 END) AS increase_acc,
    SUM(CASE WHEN (t1.trn_affects_stock = 1) AND (t1.trn_inventory_change = 'increase') THEN IFNULL(t0.bmtr_sub, 0) ELSE 0 END) AS increase_sub,
    SUM(CASE WHEN (t1.trn_affects_stock = 1) AND (t1.trn_inventory_change = 'decrease') THEN IFNULL(t0.bmtr_acc, 0) ELSE 0 END) AS decrease_acc,
    SUM(CASE WHEN (t1.trn_affects_stock = 1) AND (t1.trn_inventory_change = 'decrease') THEN IFNULL(t0.bmtr_sub, 0) ELSE 0 END) AS decrease_sub,
    SUM(CASE WHEN (t1.inventory_stock = 1) AND (t0.bmtr_date = end_date) THEN IFNULL(t0.bmtr_acc, 0) ELSE 0 END) AS closing_acc,
    SUM(CASE WHEN (t1.inventory_stock = 1) AND (t0.bmtr_date = end_date) THEN IFNULL(t0.bmtr_sub, 0) ELSE 0 END) AS closing_sub,
    (SUM(CASE WHEN (t1.inventory_stock = 1) AND (t0.bmtr_date = start_date) THEN IFNULL(t0.bmtr_sub, 0) ELSE 0 END)) + (SUM(CASE WHEN (t1.trn_affects_stock = 1) AND (t1.trn_inventory_change = 'increase') THEN IFNULL(t0.bmtr_sub, 0) ELSE 0 END)) - (SUM(CASE WHEN (t1.trn_affects_stock = 1) AND (t1.trn_inventory_change = 'decrease') THEN IFNULL(t0.bmtr_sub, 0) ELSE 0 END)) AS calculated_closing_sub
  FROM (SELECT * FROM transactions_inventory WHERE bmtr_date >= start_date AND bmtr_date < end_date AND company_id = session_company_id AND (branch_id = session_branch_id OR bmtr_transbranch = session_branch_id OR bmtr_branchid = session_branch_id OR bmtr_frombranchid = session_branch_id)) t0
  LEFT JOIN code_transaction t1 ON t0.TransType = t1.UITransType
  LEFT JOIN unified_lookup t4 ON t0.bmtr_pmid = t4.cost_code
  LEFT JOIN code_unit t2 ON t4.pm_unit_id = t2.id
  GROUP BY t4.primary_code, t4.pm_name, t2.unit, primary_code, pm_name, unit
  HAVING
    opening_sub <> 0
    OR increase_sub <> 0
    OR decrease_sub <> 0
    OR closing_sub <> 0;


-- Transformed SQL for dynrep_inventory_warehouse
SELECT t4.primary_code AS primary_code, t4.pm_name AS pm_name, t2.unit AS unit, CASE WHEN (t1.trn_affects_stock = 1) AND (t1.trn_inventory_change = 'decrease') THEN IFNULL(t0.bmtr_sub, 0) ELSE 0 END AS decrease_sub, t0.bmtr_pmid, t0.bmtr_acc, t0.bmtr_up, t0.bmtr_ap, t0.bmtr_Saleap, t0.bmtr_MM_sale, t0.bmtr_BN_sale, t0.bmtr_idname, t0.sp_primary_code, t0.sp_pm_name, t0.sp_pm_unit_id, t0.sp_cost, t0.sp_current_stock, t0.bmtr_annot, t0.bmtr_date, t0.bmtr_empid, t0.bmtr_branchid, t0.TRTYPENAME, t0.company_id, t0.branch_id, t0.bmtr_transbranch, t0.bmtr_frombranchid, t0.bmtr_consumerid, t0.bmtr_confirm_emp, t0.sp_manufacturer_id, t0.sp_total_cost, t0.bmtr_sellerid, t0.bmtr_orderedp, t0.ROOMID, t0.USERID FROM (SELECT * FROM transactions_inventory WHERE bmtr_date >= '2025-01-01' AND bmtr_date < '2026-01-01' AND company_id = 2 AND (branch_id = 3 OR bmtr_transbranch = 3 OR bmtr_branchid = 3 OR bmtr_frombranchid = 3)) t0
  LEFT JOIN code_transaction t1 ON t0.TransType = t1.UITransType
  LEFT JOIN unified_lookup t4 ON t0.bmtr_pmid = t4.cost_code
  LEFT JOIN code_unit t2 ON t4.pm_unit_id = t2.id
  
