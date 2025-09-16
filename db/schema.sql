CREATE TABLE `audit_log` (
  `id` int NOT NULL,
  `table_name` varchar(255) DEFAULT NULL,
  `action` varchar(10) DEFAULT NULL,
  `changed_at` datetime DEFAULT NULL,
  `changed_by` varchar(255) DEFAULT NULL,
  `row_id` varchar(100) DEFAULT NULL,
  `old_data` text,
  `new_data` text,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_abhuvaari` (
  `id` int NOT NULL,
  `HBChig_id2` int NOT NULL,
  `HBTorol_id2` int NOT NULL,
  `Hbaitsaagch_id2` int NOT NULL,
  `less_100_2` int DEFAULT NULL,
  `more_100_2` int DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_bayarodor` (
  `id` int NOT NULL,
  `fest_year` int NOT NULL,
  `fest_month` int NOT NULL,
  `fest_day` int DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_bkod` (
  `id` int NOT NULL,
  `bkod` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `bkod_cost` decimal(10,2) NOT NULL,
  `bkod_prod` int NOT NULL,
  `bkod_spec` varchar(100) NOT NULL,
  `bkod_prim` varchar(100) NOT NULL,
  `bkod_date` date NOT NULL,
  `bkod_SKU` varchar(100) DEFAULT NULL,
  `category` int NOT NULL DEFAULT '2',
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_bkodprim` (
  `id` int NOT NULL,
  `bkod_Tk` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `bkod_Tk_name` varchar(100) NOT NULL,
  `bkod_Tk_muid` int NOT NULL,
  `bkod_tk_tkkod` varchar(50) NOT NULL,
  `bkod_Tk_SKU` varchar(50) NOT NULL,
  `bkod_Tk_date` date NOT NULL,
  `bkod_Tk_prod` int NOT NULL,
  `bkod_Tk_size` varchar(50) NOT NULL,
  `bkod_tk_length` varchar(50) NOT NULL,
  `bkod_tk_width` varchar(50) NOT NULL,
  `bkod_tk_thick` varchar(50) NOT NULL,
  `bkod_tk_slength` varchar(50) DEFAULT NULL,
  `bkod_tk_swidth` varchar(50) DEFAULT NULL,
  `bkod_tk_sthick` varchar(50) DEFAULT NULL,
  `bkod_Tk_color` varchar(50) DEFAULT NULL,
  `bkod_Tk_mat` varchar(50) DEFAULT NULL,
  `bkod_Tk_onts` varchar(50) DEFAULT NULL,
  `bkod_Tk_spec` varchar(50) DEFAULT NULL,
  `bkod_Tk_brand` varchar(50) DEFAULT NULL,
  `bkod_Tk_type` int DEFAULT NULL,
  `bkod_Tk_where` varchar(50) DEFAULT NULL,
  `category` int NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_branches` (
  `branch_id` int NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_cashier` (
  `id` int NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_chiglel` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_department` (
  `id` int NOT NULL,
  `department_id` int DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_edhorongo` (
  `id` int NOT NULL,
  `ehkod` varchar(21) NOT NULL,
  `company_id` int NOT NULL,
  `ehkod_name` varchar(255) DEFAULT NULL,
  `ehkod_mu` varchar(21) DEFAULT NULL,
  `ehkod_muid` int DEFAULT NULL,
  `ehkod_price` decimal(18,2) DEFAULT NULL,
  `ehkod_size` varchar(21) DEFAULT NULL,
  `ehkod_width` varchar(21) DEFAULT NULL,
  `ehkod_date` date DEFAULT NULL,
  `ehkod_slength` varchar(21) DEFAULT NULL,
  `ehkod_swidth` varchar(21) DEFAULT NULL,
  `ehkod_spec` varchar(255) DEFAULT NULL,
  `ehkod_balance` int DEFAULT NULL,
  `ehkod_desc` varchar(255) DEFAULT NULL,
  `ehkod_room` varchar(21) DEFAULT NULL,
  `ehkod_holder` varchar(21) DEFAULT NULL,
  `ehkod_tur` varchar(1) DEFAULT NULL,
  `ehkod_bairshil` varchar(21) DEFAULT NULL,
  `ehkod_negjtalbar` varchar(1) DEFAULT NULL,
  `ehkod_zoriulalt` varchar(255) DEFAULT NULL,
  `ehkod_type` varchar(1) DEFAULT NULL,
  `ehkod_angilal` varchar(1) DEFAULT NULL,
  `category` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_edhorongo_other` (
  `id` int NOT NULL,
  `ehkod` varchar(21) DEFAULT NULL,
  `company_id` int DEFAULT NULL,
  `ehkod_name` varchar(255) DEFAULT NULL,
  `ehkod_mu` varchar(21) DEFAULT NULL,
  `ehkod_muid` int DEFAULT NULL,
  `ehkod_price` decimal(18,2) DEFAULT NULL,
  `ehkod_size` varchar(21) DEFAULT NULL,
  `ehkod_width` varchar(21) DEFAULT NULL,
  `ehkod_date` date DEFAULT NULL,
  `ehkod_slength` varchar(21) DEFAULT NULL,
  `ehkod_swidth` varchar(21) DEFAULT NULL,
  `ehkod_spec` varchar(255) DEFAULT NULL,
  `ehkod_balance` int DEFAULT NULL,
  `ehkod_desc` varchar(255) DEFAULT NULL,
  `ehkod_room` varchar(21) DEFAULT NULL,
  `ehkod_holder` varchar(21) DEFAULT NULL,
  `ehkod_tur` varchar(1) DEFAULT NULL,
  `ehkod_bairshil` varchar(21) DEFAULT NULL,
  `ehkod_negjtalbar` varchar(1) DEFAULT NULL,
  `ehkod_zoriulalt` varchar(255) DEFAULT NULL,
  `ehkod_type` varchar(1) DEFAULT NULL,
  `ehkod_angilal` varchar(1) DEFAULT NULL,
  `error_description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_expenseangilal` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_expensebalancetype` (
  `id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_expensebaltype` (
  `id` int NOT NULL,
  `k1` int NOT NULL,
  `k2` int NOT NULL,
  `k3` int NOT NULL,
  `k4` int NOT NULL,
  `k5` int NOT NULL,
  `k6_` int NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_expensetype` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_expenseutga` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_frequency` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_huvaari` (
  `id` int NOT NULL,
  `position_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_incometype` (
  `id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_initiator` (
  `id` int NOT NULL,
  `initiator` int NOT NULL,
  `description` varchar(255) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_material` (
  `id` int NOT NULL,
  `xmkod` int NOT NULL,
  `xmkod_muid` int NOT NULL,
  `xmkod_cost` decimal(10,2) NOT NULL,
  `xmkod_tkkod` int NOT NULL,
  `xmkod_date` date DEFAULT NULL,
  `xmkod_from` varchar(50) DEFAULT NULL,
  `xmkod_ded` varchar(50) DEFAULT NULL,
  `xmkod_angil` varchar(200) DEFAULT NULL,
  `xmkod_where` varchar(200) DEFAULT NULL,
  `xmkod_dedic` varchar(200) DEFAULT NULL,
  `xmkod_seller` varchar(200) DEFAULT NULL,
  `xmkod_obtainer` varchar(200) DEFAULT NULL,
  `xmkod_SKU` varchar(50) DEFAULT NULL,
  `category` int NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_materialprim` (
  `id` int NOT NULL,
  `xmkodtk` int NOT NULL,
  `xmkodtk_name` varchar(255) NOT NULL,
  `xmkodtk_muid` int NOT NULL,
  `xmkodtk_type` int NOT NULL,
  `xmkodtk_tkkod` int NOT NULL,
  `xmkodtk_sort` varchar(255) DEFAULT NULL,
  `xmkodtk_len` int DEFAULT NULL,
  `xmkodtk_width` int DEFAULT NULL,
  `xmkodtk_thick` int DEFAULT NULL,
  `xmkodtk_spec` varchar(255) DEFAULT NULL,
  `xmkodtk_mat` varchar(50) DEFAULT NULL,
  `xmkodtk_angil` varchar(50) DEFAULT NULL,
  `xmkodtk_repid` int NOT NULL,
  `category` int NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_position` (
  `id` int NOT NULL,
  `position_id` int NOT NULL,
  `position_name` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `position_amcode` varchar(7) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_position_other` (
  `id` int NOT NULL,
  `workplace_id` int DEFAULT NULL,
  `workplace_ner` varchar(28) DEFAULT NULL,
  `workplace_position_id` int DEFAULT NULL,
  `error_description` varchar(255) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_room` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_status` (
  `id` int NOT NULL,
  `status` varchar(64) NOT NULL,
  `description` varchar(255) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_talbai` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_torol` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_transaction` (
  `id` int NOT NULL,
  `UITransType` int NOT NULL,
  `UITransTypeName` varchar(255) NOT NULL,
  `UITrtype` varchar(4) NOT NULL,
  `table_name` varchar(100) DEFAULT NULL,
  `UITransCode` varchar(10) DEFAULT NULL COMMENT 'New structured transaction code like INV01, FIN02',
  `trn_category` enum('inventory','finance','order','plan','asset','contract','hr','other') DEFAULT 'inventory' COMMENT 'Main transaction module',
  `trn_subtype` enum('purchase','sale','transfer','return','expense','income','production','adjustment','depreciation','writeoff','assignment','completion','receivable','payable','counting','registration','allocation','other') DEFAULT 'other' COMMENT 'Transaction subtype for logic',
  `inventory_stock` tinyint(1) NOT NULL DEFAULT '0',
  `trn_inventory_change` enum('increase','decrease','none') DEFAULT 'none' COMMENT 'Inventory movement direction',
  `trn_cash_flow` enum('in','out','none') DEFAULT 'none' COMMENT 'Cash flow direction',
  `trn_affects_stock` tinyint(1) DEFAULT '0' COMMENT 'Does this transaction affect inventory stock',
  `trn_affects_cash` tinyint(1) DEFAULT '0' COMMENT 'Does this transaction affect cash/bank',
  `trn_affects_payable` tinyint(1) DEFAULT '0' COMMENT 'Does this transaction affect accounts payable or receivable',
  `trn_affects_cogs` tinyint(1) DEFAULT '0' COMMENT 'Affects cost of goods sold',
  `trn_comment` text COMMENT 'Notes or logic for this transaction type',
  `trn_comment_mn` text COMMENT 'Transaction explanation in Mongolian',
  `image_benchmark` tinyint(1) DEFAULT NULL,
  `image_before` tinyint(1) NOT NULL DEFAULT '0',
  `image_after` tinyint(1) NOT NULL DEFAULT '0',
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_unit` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `unit` varchar(10) DEFAULT NULL,
  `Unitcode_wood` int DEFAULT NULL,
  `Unitcode_nonwood` int DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_userlevel_settings` (
  `id` int NOT NULL,
  `uls_id` int NOT NULL,
  `action` enum('button','module_key','function','API') NOT NULL,
  `ul_module_key` varchar(100) DEFAULT NULL,
  `function_name` varchar(100) NOT NULL,
  `Description` varchar(255) NOT NULL,
  `new_records` tinyint(1) NOT NULL DEFAULT '0',
  `edit_delete_request` tinyint(1) NOT NULL DEFAULT '0',
  `edit_records` tinyint(1) NOT NULL DEFAULT '0',
  `delete_records` tinyint(1) NOT NULL DEFAULT '0',
  `image_handler` tinyint(1) NOT NULL DEFAULT '0',
  `audition` tinyint(1) NOT NULL DEFAULT '0',
  `supervisor` tinyint(1) NOT NULL DEFAULT '0',
  `companywide` tinyint(1) NOT NULL DEFAULT '0',
  `branchwide` tinyint(1) NOT NULL DEFAULT '0',
  `departmentwide` tinyint(1) NOT NULL DEFAULT '0',
  `developer` tinyint(1) NOT NULL DEFAULT '0',
  `system_settings` tinyint(1) NOT NULL DEFAULT '0',
  `common_settings` tinyint(1) NOT NULL DEFAULT '0',
  `license_settings` tinyint(1) NOT NULL DEFAULT '0',
  `ai` tinyint(1) NOT NULL DEFAULT '0',
  `dashboard` tinyint(1) NOT NULL DEFAULT '0',
  `ai_dashboard` tinyint(1) NOT NULL DEFAULT '0',
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_valut` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_violation` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_woodprocctype` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_woodsort` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_woodtype` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_workplace` (
  `id` int NOT NULL,
  `workplace_id` int NOT NULL,
  `workplace_ner` varchar(28) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `workplace_position_id` int DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `code_workplace_other` (
  `id` int NOT NULL,
  `workplace_id` int DEFAULT NULL,
  `workplace_position_id` int DEFAULT NULL,
  `workplace_ner` varchar(28) DEFAULT NULL,
  `error_description` varchar(255) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `companies` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0',
  `Gov_Registration_number` varchar(50) NOT NULL,
  `Address` varchar(255) NOT NULL,
  `Telephone` varchar(50) NOT NULL,
  `website` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `company_licenses` (
  `id` int NOT NULL,
  `company_id` int DEFAULT NULL,
  `plan_id` int DEFAULT NULL,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `status` enum('active','expired','cancelled') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `company_module_licenses` (
  `company_id` int NOT NULL,
  `module_key` varchar(50) NOT NULL,
  `licensed` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `forms` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `schema_json` json NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `form_submissions` (
  `id` int NOT NULL,
  `form_id` varchar(100) NOT NULL,
  `data` json NOT NULL,
  `submitted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `InventoryStockPerBranch` (
`company_id` int
,`branch_id` int
,`item_code` varchar(255)
,`pm_name` varchar(255)
,`total_in_qty` double(19,2)
,`total_out_qty` double(19,2)
,`total_in_value` double(19,2)
,`on_hand_qty` double(22,2)
,`avg_cost` double(22,6)
,`inventory_value` double
);
CREATE TABLE `InventoryStockPerCompany` (
`company_id` int
,`fifo_lifo_qty` double(19,2)
,`fifo_lifo_value` double(19,2)
,`item_code` varchar(100)
,`pm_name` varchar(255)
,`total_in_qty` double(19,2)
,`total_out_qty` double(19,2)
,`total_in_value` double(19,2)
,`on_hand_qty` double(22,2)
,`avg_cost` double(22,6)
,`inventory_value` double
);
CREATE TABLE `InventoryTransactionView` (
);
CREATE TABLE `license_plans` (
  `id` int NOT NULL,
  `name` varchar(50) DEFAULT NULL,
  `modules` json DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `modules` (
  `module_key` varchar(50) NOT NULL,
  `label` varchar(100) NOT NULL,
  `parent_key` varchar(50) DEFAULT NULL,
  `show_in_sidebar` tinyint(1) DEFAULT '1',
  `show_in_header` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `notifications` (
  `notification_id` bigint NOT NULL,
  `recipient_empid` varchar(10) NOT NULL,
  `type` enum('request','response') NOT NULL,
  `related_id` bigint NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `payments` (
  `id` int NOT NULL,
  `company_license_id` int DEFAULT NULL,
  `provider` varchar(50) DEFAULT NULL,
  `provider_payment_id` varchar(255) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `status` varchar(30) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `pending_request` (
  `request_id` bigint NOT NULL,
  `table_name` varchar(100) NOT NULL,
  `record_id` bigint NOT NULL,
  `emp_id` varchar(10) NOT NULL,
  `senior_empid` varchar(10) NOT NULL,
  `request_type` enum('edit','delete') NOT NULL,
  `request_reason` text NOT NULL,
  `proposed_data` json DEFAULT NULL,
  `original_data` json DEFAULT NULL,
  `status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `responded_at` timestamp NULL DEFAULT NULL,
  `response_empid` varchar(10) DEFAULT NULL,
  `response_notes` text,
  `is_pending` tinyint(1) GENERATED ALWAYS AS ((case when (`status` = _utf8mb4'pending') then 1 else NULL end)) STORED,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `report_definitions` (
  `id` int NOT NULL,
  `report_key` varchar(100) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `query_definition` json NOT NULL,
  `parameter_definitions` json NOT NULL,
  `roles_allowed` json DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `request_seen_counts` (
  `emp_id` varchar(10) NOT NULL,
  `incoming_pending` int NOT NULL DEFAULT '0',
  `incoming_accepted` int NOT NULL DEFAULT '0',
  `incoming_declined` int NOT NULL DEFAULT '0',
  `outgoing_accepted` int NOT NULL DEFAULT '0',
  `outgoing_declined` int NOT NULL DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `role_default_modules` (
  `role_id` int NOT NULL,
  `module_key` varchar(50) NOT NULL,
  `allowed` tinyint(1) DEFAULT '1',
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `role_module_permissions` (
  `company_id` int NOT NULL,
  `position_id` int NOT NULL,
  `module_key` varchar(50) NOT NULL,
  `allowed` tinyint(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_beltgenniiluulegch` (
  `id` int NOT NULL,
  `manuf_id` varchar(10) NOT NULL,
  `manuf_agrdate` date DEFAULT NULL,
  `manuf_agrenddate` date DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_bhuvaari` (
  `BH_id` int NOT NULL,
  `bh_YM` int NOT NULL,
  `bh_empid` varchar(10) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_contracter` (
  `id` int NOT NULL,
  `manuf_id` varchar(10) NOT NULL,
  `manuf_rd` varchar(100) NOT NULL,
  `manuf_phone` int NOT NULL,
  `manuf_lname` varchar(100) DEFAULT NULL,
  `manuf_fname` varchar(100) DEFAULT NULL,
  `manuf_orgname` varchar(100) DEFAULT NULL,
  `brandname` varchar(100) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `manuf_address` varchar(255) DEFAULT NULL,
  `phone1` int DEFAULT NULL,
  `phone2` int DEFAULT NULL,
  `manuf_torol` varchar(255) DEFAULT NULL,
  `manuf_products` varchar(255) DEFAULT NULL,
  `manuf_agrdate` date DEFAULT NULL,
  `manuf_agrenddate` date DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_currate` (
  `Valutid` int NOT NULL,
  `CurDate` date NOT NULL,
  `ratenum` int NOT NULL,
  `Crate` decimal(10,2) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_discount` (
  `id` int NOT NULL,
  `inventory_code` varchar(50) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `discount_amount` double(10,2) NOT NULL,
  `manufacturer_id` varchar(50) NOT NULL,
  `coupon_code` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `branchid` int NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `department_id` int DEFAULT NULL,
  `inventory_name` varchar(100) DEFAULT NULL,
  `inventory_cost` double(10,2) DEFAULT NULL,
  `inventory_saleprice` double(10,2) DEFAULT NULL,
  `inventory_mu` varchar(20) DEFAULT NULL,
  `discount_percent` decimal(10,2) DEFAULT NULL,
  `discount_percent_amount` double(10,2) DEFAULT NULL,
  `manufacturer_name` varchar(100) DEFAULT NULL,
  `agreed_empid` varchar(255) DEFAULT NULL,
  `discount_reason` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `discount_campain` varchar(255) DEFAULT NULL,
  `initiator` int NOT NULL DEFAULT '1',
  `min_purchase` decimal(18,0) DEFAULT NULL,
  `sp_primary_code` varchar(50) DEFAULT NULL,
  `sp_selling_code` varchar(50) DEFAULT NULL,
  `sp_pm_name` varchar(255) DEFAULT NULL,
  `sp_pm_unit_id` int DEFAULT NULL,
  `sp_categories` int DEFAULT NULL,
  `sp_manufacturer_id` int DEFAULT NULL,
  `sp_cost` decimal(18,4) DEFAULT NULL,
  `sp_cost_date` date DEFAULT NULL,
  `sp_source_table` varchar(50) DEFAULT NULL,
  `sp_current_company_stock` decimal(18,2) DEFAULT NULL,
  `sp_current_branch_stock` decimal(18,4) DEFAULT NULL,
  `sp_selling_price` decimal(18,4) DEFAULT NULL,
  `sp_company_discount` decimal(18,4) DEFAULT NULL,
  `sp_supplier_discount` decimal(18,4) DEFAULT NULL,
  `sp_coupon_discount` decimal(18,4) DEFAULT NULL,
  `sp_total_discount` decimal(18,4) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_discount_other` (
  `id` int NOT NULL,
  `inventory_code` varchar(50) DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `discount_amount` double(10,2) DEFAULT NULL,
  `manufacturer_id` varchar(50) DEFAULT NULL,
  `coupon_code` varchar(10) DEFAULT NULL,
  `branchid` int DEFAULT NULL,
  `company_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `inventory_name` varchar(100) DEFAULT NULL,
  `inventory_cost` double(10,2) DEFAULT NULL,
  `inventory_saleprice` double(10,2) DEFAULT NULL,
  `inventory_mu` varchar(20) DEFAULT NULL,
  `discount_percent` decimal(10,2) DEFAULT NULL,
  `discount_percent_amount` double(10,2) DEFAULT NULL,
  `manufacturer_name` varchar(100) DEFAULT NULL,
  `agreed_empid` varchar(255) DEFAULT NULL,
  `discount_reason` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `discount_campain` varchar(255) DEFAULT NULL,
  `error_description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_employee` (
  `id` int NOT NULL,
  `emp_id` varchar(10) NOT NULL,
  `emp_lname` varchar(255) NOT NULL,
  `emp_fname` varchar(255) NOT NULL,
  `emp_rd` varchar(20) NOT NULL,
  `emp_nd` int DEFAULT NULL,
  `emp_tailankod` int DEFAULT NULL,
  `Company_id` int DEFAULT NULL,
  `emp_hiredate` date DEFAULT NULL,
  `emp_outdate` date DEFAULT NULL,
  `emp_birthdate` date DEFAULT NULL,
  `emp_gender` varchar(10) DEFAULT NULL,
  `emp_address` varchar(255) DEFAULT NULL,
  `emp_phone` int DEFAULT NULL,
  `emp_phone1` int DEFAULT NULL,
  `emp_education` varchar(255) DEFAULT NULL,
  `emp_major` varchar(255) DEFAULT NULL,
  `emp_family` varchar(255) DEFAULT NULL,
  `emp_fammember` int DEFAULT NULL,
  `emp_khanacc` varchar(20) DEFAULT NULL,
  `emp_xacacc` varchar(20) DEFAULT NULL,
  `emp_xacloan` int DEFAULT NULL,
  `emp_unitnumber` int DEFAULT NULL,
  `emp_TTD` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_employment` (
  `id` int NOT NULL,
  `employment_emp_id` varchar(4) NOT NULL,
  `employment_company_id` int NOT NULL,
  `employment_branch_id` int NOT NULL,
  `employment_department_id` int NOT NULL,
  `employment_position_id` int NOT NULL,
  `employment_workplace_id` int NOT NULL,
  `employment_date` date NOT NULL,
  `employment_user_level` int DEFAULT NULL,
  `employment_senior_empid` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_employment_other` (
  `id` int NOT NULL,
  `employment_emp_id` varchar(4) DEFAULT NULL,
  `employment_company_id` int DEFAULT NULL,
  `employment_at_id` int DEFAULT NULL,
  `employment_ab_id` int DEFAULT NULL,
  `employment_date` date DEFAULT NULL,
  `employment_department_id` int DEFAULT NULL,
  `employment_branch_id` int DEFAULT NULL,
  `error_description` varchar(255) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_expenseorg` (
  `id` int NOT NULL,
  `z_org_id` varchar(10) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_hongololt` (
  `hon_g_id` int NOT NULL,
  `hon_year` int NOT NULL,
  `hon_month` int NOT NULL,
  `hon_per` decimal(5,2) DEFAULT NULL,
  `hon_size` decimal(10,2) DEFAULT NULL,
  `tushaalnum` varchar(255) DEFAULT NULL,
  `decidedby` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_sale` (
  `id` int NOT NULL,
  `hkod` varchar(50) NOT NULL,
  `hstartmmdate` date NOT NULL,
  `hendmmdate` date NOT NULL,
  `hsalemmp` decimal(10,2) NOT NULL,
  `hsalepermm` decimal(10,2) NOT NULL,
  `hstartbndate` date NOT NULL,
  `hendbndate` date NOT NULL,
  `hsalepbn` int NOT NULL,
  `hsaleperbn` decimal(10,2) NOT NULL,
  `hcoupon` varchar(20) NOT NULL,
  `branchid` int NOT NULL,
  `hreason` varchar(255) DEFAULT NULL,
  `hannot` varchar(255) DEFAULT NULL,
  `primary_code` varchar(50) DEFAULT NULL,
  `selling_code` varchar(50) DEFAULT NULL,
  `pm_name` varchar(255) DEFAULT NULL,
  `pm_unit_id` int DEFAULT NULL,
  `categories` int DEFAULT NULL,
  `manufacturer_id` int DEFAULT NULL,
  `cost` decimal(18,4) DEFAULT NULL,
  `cost_date` date DEFAULT NULL,
  `source_table` varchar(50) DEFAULT NULL,
  `sp_primary_code` varchar(50) DEFAULT NULL,
  `sp_selling_code` varchar(50) DEFAULT NULL,
  `sp_pm_name` varchar(255) DEFAULT NULL,
  `sp_pm_unit_id` int DEFAULT NULL,
  `sp_categories` int DEFAULT NULL,
  `sp_manufacturer_id` int DEFAULT NULL,
  `sp_cost` decimal(18,4) DEFAULT NULL,
  `sp_cost_date` date DEFAULT NULL,
  `sp_source_table` varchar(50) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_sellingprice` (
  `id` int NOT NULL,
  `product_primary_code` varchar(50) NOT NULL,
  `price_date` date NOT NULL,
  `company_id` varchar(1) NOT NULL,
  `selling_price` double(10,2) DEFAULT NULL,
  `whole` double(10,2) DEFAULT NULL,
  `prod` double(10,2) DEFAULT NULL,
  `sp_primary_code` varchar(50) DEFAULT NULL,
  `sp_selling_code` varchar(50) DEFAULT NULL,
  `sp_pm_name` varchar(255) DEFAULT NULL,
  `sp_pm_unit_id` int DEFAULT NULL,
  `sp_categories` int DEFAULT NULL,
  `sp_manufacturer_id` int DEFAULT NULL,
  `sp_cost` decimal(18,4) DEFAULT NULL,
  `sp_cost_date` date DEFAULT NULL,
  `sp_source_table` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_sellingprice_other` (
  `id` int NOT NULL,
  `product_primary_code` varchar(50) NOT NULL,
  `price_date` date NOT NULL,
  `company_id` varchar(1) NOT NULL,
  `selling_price` double(10,2) DEFAULT NULL,
  `whole` double(10,2) DEFAULT NULL,
  `prod` double(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_workplace_schedule` (
  `id` int NOT NULL,
  `ws_id` int NOT NULL,
  `ws_workplace_id` int NOT NULL,
  `ws_emp_id` varchar(4) NOT NULL,
  `ws_date` date NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tbl_workplace_schedule_other` (
  `id` int NOT NULL,
  `ws_id` int DEFAULT NULL,
  `ws_workplace_id` int DEFAULT NULL,
  `ws_emp_id` varchar(4) DEFAULT NULL,
  `ws_date` date DEFAULT NULL,
  `error_description` varchar(255) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `tenant_tables` (
  `table_name` varchar(100) NOT NULL,
  `is_shared` tinyint(1) DEFAULT '0',
  `seed_on_create` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `transactions_contract` (
  `id` int NOT NULL,
  `g_num` varchar(50) NOT NULL,
  `g_id` int NOT NULL,
  `g_burtgel_id` varchar(10) NOT NULL,
  `g_chig` int NOT NULL,
  `g_torol` int NOT NULL,
  `g_sq` int NOT NULL,
  `g_start` date NOT NULL,
  `g_end` date NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `g_cancel` date NOT NULL,
  `g_daatgah` double(15,2) DEFAULT NULL,
  `g_baritsaa_must` double(10,2) DEFAULT NULL,
  `g_desc` varchar(255) DEFAULT NULL,
  `baitsaagch_id` varchar(50) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `sellerid` varchar(10) DEFAULT NULL,
  `branchid` int DEFAULT NULL,
  `coupcode` varchar(10) DEFAULT NULL,
  `TRTYPENAME` varchar(255) DEFAULT NULL,
  `trtype` varchar(4) DEFAULT NULL,
  `TransType` int DEFAULT NULL,
  `ORGANIZATION` varchar(100) DEFAULT NULL,
  `ROOMID` varchar(100) DEFAULT NULL,
  `USERID` varchar(100) DEFAULT NULL,
  `LOCATION` varchar(100) DEFAULT NULL,
  `rawdata` varchar(100) DEFAULT NULL,
  `deviceid` varchar(100) DEFAULT NULL,
  `devicename` varchar(100) DEFAULT NULL,
  `actime` varchar(100) DEFAULT NULL,
  `rectime` varchar(100) DEFAULT NULL,
  `count` int DEFAULT NULL,
  `state` int DEFAULT NULL,
  `transbranch` int DEFAULT NULL,
  `contract_id` varchar(50) DEFAULT NULL,
  `confirm` int DEFAULT NULL,
  `confirm_date` date DEFAULT NULL,
  `confirm_emp` varchar(10) DEFAULT NULL,
  `edit_date` date DEFAULT NULL,
  `edit_emp` varchar(10) DEFAULT NULL,
  `edit_cause` varchar(1000) DEFAULT NULL,
  `del_date` date DEFAULT NULL,
  `del_emp` varchar(10) DEFAULT NULL,
  `del_cause` varchar(1000) DEFAULT NULL,
  `check_date` date DEFAULT NULL,
  `checkyn` varchar(1000) DEFAULT NULL,
  `check_emp` varchar(10) DEFAULT NULL,
  `check_cause` varchar(1000) DEFAULT NULL,
  `g_ab_tur` int DEFAULT NULL,
  `g_ab_huviin` int DEFAULT NULL,
  `pos_session_id` varchar(64) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `transactions_contract_other` (
  `id` int NOT NULL,
  `g_num` varchar(50) NOT NULL,
  `g_id` int NOT NULL,
  `g_burtgel_id` varchar(10) NOT NULL,
  `g_chig` int NOT NULL,
  `g_torol` int NOT NULL,
  `g_sq` int NOT NULL,
  `g_start` date NOT NULL,
  `g_end` date NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `g_cancel` date NOT NULL,
  `g_daatgah` double(15,2) DEFAULT NULL,
  `g_baritsaa_must` double(10,2) DEFAULT NULL,
  `g_desc` varchar(255) DEFAULT NULL,
  `baitsaagch_id` varchar(50) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `sellerid` varchar(10) DEFAULT NULL,
  `branchid` int DEFAULT NULL,
  `coupcode` varchar(10) DEFAULT NULL,
  `TRTYPENAME` varchar(255) DEFAULT NULL,
  `trtype` varchar(4) DEFAULT NULL,
  `TransType` int DEFAULT NULL,
  `ORGANIZATION` varchar(100) DEFAULT NULL,
  `ROOMID` varchar(100) DEFAULT NULL,
  `USERID` varchar(100) DEFAULT NULL,
  `LOCATION` varchar(100) DEFAULT NULL,
  `rawdata` varchar(100) DEFAULT NULL,
  `deviceid` varchar(100) DEFAULT NULL,
  `devicename` varchar(100) DEFAULT NULL,
  `actime` varchar(100) DEFAULT NULL,
  `rectime` varchar(100) DEFAULT NULL,
  `count` int DEFAULT NULL,
  `state` int DEFAULT NULL,
  `transbranch` int DEFAULT NULL,
  `contract_id` varchar(50) DEFAULT NULL,
  `confirm` int DEFAULT NULL,
  `confirm_date` date DEFAULT NULL,
  `confirm_emp` varchar(10) DEFAULT NULL,
  `edit_date` date DEFAULT NULL,
  `edit_emp` varchar(10) DEFAULT NULL,
  `edit_cause` varchar(1000) DEFAULT NULL,
  `del_date` date DEFAULT NULL,
  `del_emp` varchar(10) DEFAULT NULL,
  `del_cause` varchar(1000) DEFAULT NULL,
  `check_date` date DEFAULT NULL,
  `checkyn` varchar(1000) DEFAULT NULL,
  `check_emp` varchar(10) DEFAULT NULL,
  `check_cause` varchar(1000) DEFAULT NULL,
  `g_ab_tur` int DEFAULT NULL,
  `g_ab_huviin` int DEFAULT NULL,
  `error_description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `transactions_expense` (
  `id` int NOT NULL,
  `z_num` varchar(50) NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `ztr_transbranch` int NOT NULL,
  `z_barimt` varchar(50) NOT NULL,
  `z_tosov_code` varchar(20) DEFAULT NULL,
  `z_tosov_zuil` varchar(20) DEFAULT NULL,
  `z_taibar` varchar(255) DEFAULT NULL,
  `z_angilal_b` int DEFAULT NULL,
  `z_angilal` int DEFAULT NULL,
  `z_torol` int DEFAULT NULL,
  `z_utga` int DEFAULT NULL,
  `z_from` int DEFAULT NULL,
  `z_emp_receiver` varchar(10) DEFAULT NULL,
  `z_tur_receiver` varchar(10) DEFAULT NULL,
  `z_other_receiver` varchar(255) DEFAULT NULL,
  `z_org_id` varchar(10) DEFAULT NULL,
  `z_date` date DEFAULT NULL,
  `z` double(15,2) DEFAULT NULL,
  `z_valut_id` int DEFAULT NULL,
  `z_valut_choice` int DEFAULT NULL,
  `z_mat_code` varchar(50) DEFAULT NULL,
  `z_tailbar1` varchar(255) DEFAULT NULL,
  `z_eb` int DEFAULT NULL,
  `z_orderid` varchar(10) DEFAULT NULL,
  `z_month` varchar(50) DEFAULT NULL,
  `z_noat_oor_month` varchar(50) DEFAULT NULL,
  `z_noat_month` int DEFAULT NULL,
  `zar_uglug_eseh_code` int DEFAULT NULL,
  `zar_uglug_eseh` int DEFAULT NULL,
  `zar_uglug_month` int DEFAULT NULL,
  `TRTYPENAME` varchar(255) DEFAULT NULL,
  `trtype` varchar(4) DEFAULT NULL,
  `TransType` int DEFAULT NULL,
  `UITransTypeName` varchar(255) DEFAULT NULL,
  `ORGANIZATION` varchar(50) DEFAULT NULL,
  `ROOMID` varchar(50) DEFAULT NULL,
  `USERID` varchar(50) DEFAULT NULL,
  `LOCATION` varchar(100) DEFAULT NULL,
  `rawdata` varchar(1000) DEFAULT NULL,
  `deviceid` varchar(100) DEFAULT NULL,
  `devicename` varchar(100) DEFAULT NULL,
  `actime` varchar(100) DEFAULT NULL,
  `rectime` varchar(100) DEFAULT NULL,
  `ztr_state` int DEFAULT NULL,
  `ztr_id` varchar(50) DEFAULT NULL,
  `ztr_confirm` int DEFAULT NULL,
  `ztr_confirm_date` date DEFAULT NULL,
  `ztr_confirm_emp` varchar(50) DEFAULT NULL,
  `ztr_edit_date` date DEFAULT NULL,
  `ztr_edit_emp` varchar(50) DEFAULT NULL,
  `ztr_edit_cause` varchar(1000) DEFAULT NULL,
  `ztr_del_date` date DEFAULT NULL,
  `ztr_del_emp` varchar(50) DEFAULT NULL,
  `ztr_del_cause` varchar(1000) DEFAULT NULL,
  `ztr_check_date` date DEFAULT NULL,
  `ztr_checkyn` varchar(1000) DEFAULT NULL,
  `ztr_check_emp` varchar(50) DEFAULT NULL,
  `ztr_check_cause` varchar(1000) DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `pos_session_id` varchar(64) DEFAULT NULL,
  `sp_primary_code` varchar(50) DEFAULT NULL,
  `sp_selling_code` varchar(50) DEFAULT NULL,
  `sp_pm_name` varchar(255) DEFAULT NULL,
  `sp_pm_unit_id` int DEFAULT NULL,
  `sp_categories` int DEFAULT NULL,
  `sp_manufacturer_id` int DEFAULT NULL,
  `sp_cost` decimal(18,4) DEFAULT NULL,
  `sp_cost_date` date DEFAULT NULL,
  `sp_source_table` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `transactions_expense_other` (
  `id` int NOT NULL,
  `z_num` varchar(50) DEFAULT NULL,
  `company_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `ztr_transbranch` int DEFAULT NULL,
  `z_barimt` varchar(50) DEFAULT NULL,
  `z_tosov_code` varchar(20) DEFAULT NULL,
  `z_tosov_zuil` varchar(20) DEFAULT NULL,
  `z_taibar` varchar(255) DEFAULT NULL,
  `z_angilal_b` int DEFAULT NULL,
  `z_angilal` int DEFAULT NULL,
  `z_torol` int DEFAULT NULL,
  `z_utga` int DEFAULT NULL,
  `z_from` int DEFAULT NULL,
  `z_emp_receiver` varchar(10) DEFAULT NULL,
  `z_tur_receiver` varchar(10) DEFAULT NULL,
  `z_other_receiver` varchar(255) DEFAULT NULL,
  `z_org_id` varchar(10) DEFAULT NULL,
  `z_date` date DEFAULT NULL,
  `z` double(15,2) DEFAULT NULL,
  `z_valut_id` int DEFAULT NULL,
  `z_valut_choice` int DEFAULT NULL,
  `z_mat_code` varchar(50) DEFAULT NULL,
  `z_tailbar1` varchar(255) DEFAULT NULL,
  `z_eb` int DEFAULT NULL,
  `z_orderid` varchar(10) DEFAULT NULL,
  `z_month` varchar(50) DEFAULT NULL,
  `z_noat_oor_month` varchar(50) DEFAULT NULL,
  `z_noat_month` int DEFAULT NULL,
  `zar_uglug_eseh_code` int DEFAULT NULL,
  `zar_uglug_eseh` int DEFAULT NULL,
  `zar_uglug_month` int DEFAULT NULL,
  `TRTYPENAME` varchar(255) DEFAULT NULL,
  `trtype` varchar(4) DEFAULT NULL,
  `TransType` int DEFAULT NULL,
  `ORGANIZATION` varchar(50) DEFAULT NULL,
  `ROOMID` varchar(50) DEFAULT NULL,
  `USERID` varchar(50) DEFAULT NULL,
  `LOCATION` varchar(100) DEFAULT NULL,
  `rawdata` varchar(1000) DEFAULT NULL,
  `deviceid` varchar(100) DEFAULT NULL,
  `devicename` varchar(100) DEFAULT NULL,
  `actime` varchar(100) DEFAULT NULL,
  `rectime` varchar(100) DEFAULT NULL,
  `ztr_state` int DEFAULT NULL,
  `ztr_id` varchar(50) DEFAULT NULL,
  `ztr_confirm` int DEFAULT NULL,
  `ztr_confirm_date` date DEFAULT NULL,
  `ztr_confirm_emp` varchar(50) DEFAULT NULL,
  `ztr_edit_date` date DEFAULT NULL,
  `ztr_edit_emp` varchar(50) DEFAULT NULL,
  `ztr_edit_cause` varchar(1000) DEFAULT NULL,
  `ztr_del_date` date DEFAULT NULL,
  `ztr_del_emp` varchar(50) DEFAULT NULL,
  `ztr_del_cause` varchar(1000) DEFAULT NULL,
  `ztr_check_date` date DEFAULT NULL,
  `ztr_checkyn` varchar(1000) DEFAULT NULL,
  `ztr_check_emp` varchar(50) DEFAULT NULL,
  `ztr_check_cause` varchar(1000) DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `error_description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `transactions_income` (
  `id` int NOT NULL,
  `or_num` varchar(50) NOT NULL,
  `ortr_transbranch` int NOT NULL,
  `or_o_barimt` varchar(50) NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `or_g_id` int DEFAULT NULL,
  `or_burtgel` int DEFAULT NULL,
  `or_chig` int DEFAULT NULL,
  `or_torol` int DEFAULT NULL,
  `or_type_id` int DEFAULT NULL,
  `or_av_now` int DEFAULT NULL,
  `or_av_time` varchar(50) DEFAULT NULL,
  `or_date` date DEFAULT NULL,
  `orcash_or_id` int DEFAULT NULL,
  `or_or` double(15,2) DEFAULT NULL,
  `or_vallut_id` int DEFAULT NULL,
  `or_valut_choice` int DEFAULT NULL,
  `or_bar_suu` varchar(17) DEFAULT NULL,
  `or_bcode` varchar(50) DEFAULT NULL,
  `or_orderid` varchar(102) DEFAULT NULL,
  `or_tailbar1` varchar(65) DEFAULT NULL,
  `orBurtgel_rd` varchar(27) DEFAULT NULL,
  `or_eb` int DEFAULT NULL,
  `or_bank` varchar(7) DEFAULT NULL,
  `or_uglug_id` varchar(15) DEFAULT NULL,
  `or_emp_receiver` varchar(10) DEFAULT NULL,
  `or_tur_receiver` varchar(10) DEFAULT NULL,
  `or_other_receiver` varchar(100) DEFAULT NULL,
  `or_org_id` varchar(10) DEFAULT NULL,
  `TRTYPENAME` varchar(100) DEFAULT NULL,
  `trtype` varchar(4) DEFAULT NULL,
  `TransType` int DEFAULT NULL,
  `ORGANIZATION` varchar(50) DEFAULT NULL,
  `ROOMID` varchar(10) DEFAULT NULL,
  `USERID` varchar(10) DEFAULT NULL,
  `LOCATION` varchar(50) DEFAULT NULL,
  `deviceid` varchar(50) DEFAULT NULL,
  `devicename` varchar(50) DEFAULT NULL,
  `rawdata` varchar(500) DEFAULT NULL,
  `actime` date DEFAULT NULL,
  `rectime` date DEFAULT NULL,
  `ortr_state` int DEFAULT NULL,
  `ortr_id` varchar(50) DEFAULT NULL,
  `ortr_confirm` int DEFAULT NULL,
  `ortr_confirm_date` date DEFAULT NULL,
  `ortr_confirm_emp` varchar(10) DEFAULT NULL,
  `ortr_edit_date` date DEFAULT NULL,
  `ortr_edit_emp` varchar(10) DEFAULT NULL,
  `ortr_edit_cause` varchar(500) DEFAULT NULL,
  `ortr_del_date` date DEFAULT NULL,
  `ortr_del_emp` varchar(10) DEFAULT NULL,
  `ortr_del_cause` varchar(500) DEFAULT NULL,
  `ortr_check_date` date DEFAULT NULL,
  `ortr_checkyn` varchar(500) DEFAULT NULL,
  `ortr_check_emp` varchar(10) DEFAULT NULL,
  `ortr_check_cause` varchar(500) DEFAULT NULL,
  `department_id` varchar(1) DEFAULT NULL,
  `pos_session_id` varchar(64) DEFAULT NULL,
  `sp_primary_code` varchar(50) DEFAULT NULL,
  `sp_selling_code` varchar(50) DEFAULT NULL,
  `sp_pm_name` varchar(255) DEFAULT NULL,
  `sp_pm_unit_id` int DEFAULT NULL,
  `sp_categories` int DEFAULT NULL,
  `sp_manufacturer_id` int DEFAULT NULL,
  `sp_cost` decimal(18,4) DEFAULT NULL,
  `sp_cost_date` date DEFAULT NULL,
  `sp_source_table` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
DELIMITER $$
CREATE TRIGGER `transactions_income_or_num_bi` BEFORE INSERT ON `transactions_income` FOR EACH ROW BEGIN
  IF NEW.or_num IS NULL OR NEW.or_num = '' THEN
    SET NEW.or_num = CONCAT(
      CONCAT(
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26)))
      ),
      '-',
      CONCAT(
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26)))
      ),
      '-',
      CONCAT(
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26)))
      ),
      '-',
      CONCAT(
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26))),
        CHAR(IF(RAND() < 0.5, FLOOR(65 + RAND() * 26), FLOOR(97 + RAND() * 26)))
      )
    );
  END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_resolve_income_inventory_metadata` BEFORE INSERT ON `transactions_income` FOR EACH ROW BEGIN
  DECLARE v_primary_code VARCHAR(50);
  DECLARE v_selling_code VARCHAR(50);
  DECLARE v_pm_name VARCHAR(255);
  DECLARE v_pm_unit_id INT;
  DECLARE v_categories INT;
  DECLARE v_manufacturer_id INT;
  DECLARE v_cost DECIMAL(18,4);
  DECLARE v_cost_date DATE;
  DECLARE v_source_table VARCHAR(50);

  CALL resolve_inventory_metadatas(
    NEW.or_bcode,
    v_primary_code,
    v_selling_code,
    v_pm_name,
    v_pm_unit_id,
    v_categories,
    v_manufacturer_id,
    v_cost,
    v_cost_date,
    v_source_table
  );

  SET NEW.sp_primary_code = v_primary_code;
  SET NEW.sp_selling_code = v_selling_code;
  SET NEW.sp_pm_name = v_pm_name;
  SET NEW.sp_pm_unit_id = v_pm_unit_id;
  SET NEW.sp_categories = v_categories;
  SET NEW.sp_manufacturer_id = v_manufacturer_id;
  SET NEW.sp_cost = v_cost;
  SET NEW.sp_cost_date = v_cost_date;
  SET NEW.sp_source_table = v_source_table;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_resolve_income_inventory_metadata_update` BEFORE UPDATE ON `transactions_income` FOR EACH ROW BEGIN
  DECLARE v_primary_code VARCHAR(50);
  DECLARE v_selling_code VARCHAR(50);
  DECLARE v_pm_name VARCHAR(255);
  DECLARE v_pm_unit_id INT;
  DECLARE v_categories INT;
  DECLARE v_manufacturer_id INT;
  DECLARE v_cost DECIMAL(18,4);
  DECLARE v_cost_date DATE;
  DECLARE v_source_table VARCHAR(50);

  CALL resolve_inventory_metadatas(
    NEW.or_bcode,
    v_primary_code,
    v_selling_code,
    v_pm_name,
    v_pm_unit_id,
    v_categories,
    v_manufacturer_id,
    v_cost,
    v_cost_date,
    v_source_table
  );

  SET NEW.sp_primary_code = v_primary_code;
  SET NEW.sp_selling_code = v_selling_code;
  SET NEW.sp_pm_name = v_pm_name;
  SET NEW.sp_pm_unit_id = v_pm_unit_id;
  SET NEW.sp_categories = v_categories;
  SET NEW.sp_manufacturer_id = v_manufacturer_id;
  SET NEW.sp_cost = v_cost;
  SET NEW.sp_cost_date = v_cost_date;
  SET NEW.sp_source_table = v_source_table;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_transactions_income_insert` BEFORE INSERT ON `transactions_income` FOR EACH ROW BEGIN
  DECLARE v_trtypename VARCHAR(100);
  DECLARE v_trtype VARCHAR(4);
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_trtypename = NULL, v_trtype = NULL;

  IF NEW.TransType IS NOT NULL THEN
    SELECT ct.UITransTypeName, ct.UITrtype
      INTO v_trtypename, v_trtype
      FROM code_transaction ct
     WHERE ct.UITransType = NEW.TransType
     LIMIT 1;
  ELSE
    SET v_trtypename = NULL;
    SET v_trtype = NULL;
  END IF;

  SET NEW.TRTYPENAME = v_trtypename;
  SET NEW.trtype = v_trtype;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_transactions_income_update` BEFORE UPDATE ON `transactions_income` FOR EACH ROW BEGIN
  DECLARE v_trtypename VARCHAR(100);
  DECLARE v_trtype VARCHAR(4);
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_trtypename = NULL, v_trtype = NULL;

  IF NEW.TransType IS NOT NULL THEN
    SELECT ct.UITransTypeName, ct.UITrtype
      INTO v_trtypename, v_trtype
      FROM code_transaction ct
     WHERE ct.UITransType = NEW.TransType
     LIMIT 1;
  ELSE
    SET v_trtypename = NULL;
    SET v_trtype = NULL;
  END IF;

  SET NEW.TRTYPENAME = v_trtypename;
  SET NEW.trtype = v_trtype;
END
$$
DELIMITER ;
CREATE TABLE `transactions_income_other` (
  `id` int NOT NULL,
  `or_num` varchar(50) DEFAULT NULL,
  `ortr_transbranch` int DEFAULT NULL,
  `or_o_barimt` varchar(50) DEFAULT NULL,
  `company_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `or_g_id` int DEFAULT NULL,
  `or_burtgel` int DEFAULT NULL,
  `or_chig` int DEFAULT NULL,
  `or_torol` int DEFAULT NULL,
  `or_type_id` int DEFAULT NULL,
  `or_av_now` int DEFAULT NULL,
  `or_av_time` varchar(50) DEFAULT NULL,
  `or_date` date DEFAULT NULL,
  `orcash_or_id` int DEFAULT NULL,
  `or_or` double(15,2) DEFAULT NULL,
  `or_vallut_id` int DEFAULT NULL,
  `or_valut_choice` int DEFAULT NULL,
  `or_bar_suu` varchar(17) DEFAULT NULL,
  `or_bcode` int DEFAULT NULL,
  `or_orderid` varchar(102) DEFAULT NULL,
  `or_tailbar1` varchar(65) DEFAULT NULL,
  `orBurtgel_rd` varchar(27) DEFAULT NULL,
  `or_eb` int DEFAULT NULL,
  `or_bank` varchar(7) DEFAULT NULL,
  `or_uglug_id` varchar(15) DEFAULT NULL,
  `or_emp_receiver` varchar(10) DEFAULT NULL,
  `or_tur_receiver` varchar(10) DEFAULT NULL,
  `or_other_receiver` varchar(100) DEFAULT NULL,
  `or_org_id` varchar(10) DEFAULT NULL,
  `TRTYPENAME` varchar(100) DEFAULT NULL,
  `trtype` varchar(4) DEFAULT NULL,
  `TransType` int DEFAULT NULL,
  `ORGANIZATION` varchar(50) DEFAULT NULL,
  `ROOMID` varchar(10) DEFAULT NULL,
  `USERID` varchar(10) DEFAULT NULL,
  `LOCATION` varchar(50) DEFAULT NULL,
  `deviceid` varchar(50) DEFAULT NULL,
  `devicename` varchar(50) DEFAULT NULL,
  `rawdata` varchar(500) DEFAULT NULL,
  `actime` date DEFAULT NULL,
  `rectime` date DEFAULT NULL,
  `ortr_state` int DEFAULT NULL,
  `ortr_id` varchar(50) DEFAULT NULL,
  `ortr_confirm` int DEFAULT NULL,
  `ortr_confirm_date` date DEFAULT NULL,
  `ortr_confirm_emp` varchar(10) DEFAULT NULL,
  `ortr_edit_date` date DEFAULT NULL,
  `ortr_edit_emp` varchar(10) DEFAULT NULL,
  `ortr_edit_cause` varchar(500) DEFAULT NULL,
  `ortr_del_date` date DEFAULT NULL,
  `ortr_del_emp` varchar(10) DEFAULT NULL,
  `ortr_del_cause` varchar(500) DEFAULT NULL,
  `ortr_check_date` date DEFAULT NULL,
  `ortr_checkyn` varchar(500) DEFAULT NULL,
  `ortr_check_emp` varchar(10) DEFAULT NULL,
  `ortr_check_cause` varchar(500) DEFAULT NULL,
  `department_id` varchar(1) DEFAULT NULL,
  `error_description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `transactions_inventory` (
  `id` int NOT NULL,
  `bmtr_num` varchar(50) NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `bmtr_transbranch` int NOT NULL,
  `bmtr_pid` varchar(50) DEFAULT NULL,
  `bmtr_cid` varchar(50) DEFAULT NULL,
  `bmtr_tid` varchar(50) DEFAULT NULL,
  `bmtr_actid` int DEFAULT NULL,
  `bmtr_pmid` varchar(255) DEFAULT NULL,
  `Plan_day` varchar(100) DEFAULT NULL,
  `Source` varchar(100) DEFAULT NULL,
  `bmtr_acc` double(10,2) DEFAULT NULL,
  `bmtr_sub` double(10,2) DEFAULT NULL,
  `bmtr_prod` int DEFAULT NULL,
  `bmtr_annot` varchar(255) DEFAULT NULL,
  `bmtr_date` date DEFAULT NULL,
  `bmtr_sellerid` varchar(100) DEFAULT NULL,
  `bmtr_empid` varchar(100) DEFAULT NULL,
  `bmtr_orderedp` varchar(255) DEFAULT NULL,
  `bmtr_orderid` varchar(50) DEFAULT NULL,
  `bmtr_orderdid` int DEFAULT NULL,
  `bmtr_branchid` int DEFAULT NULL,
  `bmtr_consumerid` int DEFAULT NULL,
  `bmtr_consumername` varchar(255) DEFAULT NULL,
  `bmtr_coupcode` varchar(10) DEFAULT NULL,
  `bmtr_return` int DEFAULT NULL,
  `bmtr_frombranchid` int DEFAULT NULL,
  `bmtr_AvUg` int DEFAULT NULL,
  `bmtr_Dupercent` decimal(5,2) DEFAULT NULL,
  `bmtr_frombranch_barimt` varchar(50) DEFAULT NULL,
  `TRTYPENAME` varchar(100) DEFAULT NULL,
  `trtype` varchar(4) DEFAULT NULL,
  `TransType` int DEFAULT NULL,
  `ORGANIZATION` varchar(50) DEFAULT NULL,
  `ROOMID` varchar(50) DEFAULT NULL,
  `USERID` varchar(50) DEFAULT NULL,
  `LOCATION` varchar(100) DEFAULT NULL,
  `rawdata` varchar(1000) DEFAULT NULL,
  `deviceid` varchar(100) DEFAULT NULL,
  `devicename` varchar(100) DEFAULT NULL,
  `actime` varchar(100) DEFAULT NULL,
  `rectime` varchar(100) DEFAULT NULL,
  `bmtr_count` int DEFAULT NULL,
  `bmtr_state` int DEFAULT NULL,
  `bmtr_id` varchar(50) DEFAULT NULL,
  `bmtr_confirm` int DEFAULT NULL,
  `bmtr_confirm_date` date DEFAULT NULL,
  `bmtr_confirm_emp` varchar(100) DEFAULT NULL,
  `bmtr_edit_date` date DEFAULT NULL,
  `bmtr_edit_emp` varchar(100) DEFAULT NULL,
  `bmtr_edit_cause` varchar(1000) DEFAULT NULL,
  `bmtr_del_date` date DEFAULT NULL,
  `bmtr_del_emp` varchar(100) DEFAULT NULL,
  `bmtr_del_cause` varchar(1000) DEFAULT NULL,
  `bmtr_check_date` date DEFAULT NULL,
  `bmtr_checkyn` varchar(1000) DEFAULT NULL,
  `bmtr_check_emp` varchar(100) DEFAULT NULL,
  `bmtr_check_cause` varchar(1000) DEFAULT NULL,
  `bmtr_up` double(15,2) DEFAULT NULL,
  `bmtr_ap` double(15,2) DEFAULT NULL,
  `bmtr_MM_sale` int DEFAULT NULL,
  `bmtr_BN_sale` int DEFAULT NULL,
  `bmtr_Saleap` int DEFAULT NULL,
  `bmtr_idname` varchar(100) DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `pos_session_id` varchar(64) DEFAULT NULL,
  `sp_primary_code` varchar(50) DEFAULT NULL,
  `sp_selling_code` varchar(50) DEFAULT NULL,
  `sp_pm_name` varchar(255) DEFAULT NULL,
  `sp_pm_unit_id` int DEFAULT NULL,
  `sp_categories` int DEFAULT NULL,
  `sp_manufacturer_id` int DEFAULT NULL,
  `sp_cost` decimal(18,4) DEFAULT NULL,
  `sp_cost_date` date DEFAULT NULL,
  `sp_source_table` varchar(50) DEFAULT NULL,
  `sp_current_stock` decimal(18,2) DEFAULT NULL,
  `sp_total_cost` decimal(18,2) GENERATED ALWAYS AS ((ifnull(`sp_cost`,0) * `bmtr_sub`)) STORED,
  `sp_selling_price` decimal(18,2) DEFAULT NULL,
  `sp_company_discount` decimal(18,2) DEFAULT NULL,
  `sp_supplier_discount` decimal(18,2) DEFAULT NULL,
  `sp_coupon_discount` decimal(18,4) DEFAULT NULL,
  `sp_total_discount` decimal(18,2) DEFAULT NULL,
  `sp_current_company_stock` decimal(18,2) DEFAULT NULL,
  `sp_current_branch_stock` decimal(18,4) DEFAULT NULL,
  `transaction_datetime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `transactions_inventory_other` (
  `id` int NOT NULL,
  `bmtr_num` varchar(50) DEFAULT NULL,
  `company_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `bmtr_transbranch` int DEFAULT NULL,
  `bmtr_pid` varchar(50) DEFAULT NULL,
  `bmtr_cid` varchar(50) DEFAULT NULL,
  `bmtr_tid` varchar(50) DEFAULT NULL,
  `bmtr_pmid` varchar(255) DEFAULT NULL,
  `Plan_day` varchar(100) DEFAULT NULL,
  `Source` varchar(100) DEFAULT NULL,
  `bmtr_acc` double(10,2) DEFAULT NULL,
  `bmtr_sub` double(10,2) DEFAULT NULL,
  `bmtr_prod` int DEFAULT NULL,
  `bmtr_annot` varchar(255) DEFAULT NULL,
  `bmtr_date` date DEFAULT NULL,
  `bmtr_sellerid` varchar(100) DEFAULT NULL,
  `bmtr_empid` varchar(100) DEFAULT NULL,
  `bmtr_orderedp` varchar(255) DEFAULT NULL,
  `bmtr_orderid` varchar(50) DEFAULT NULL,
  `bmtr_orderdid` int DEFAULT NULL,
  `bmtr_branchid` int DEFAULT NULL,
  `bmtr_consumerid` int DEFAULT NULL,
  `bmtr_consumername` varchar(255) DEFAULT NULL,
  `bmtr_coupcode` varchar(10) DEFAULT NULL,
  `bmtr_return` int DEFAULT NULL,
  `bmtr_frombranchid` int DEFAULT NULL,
  `bmtr_AvUg` int DEFAULT NULL,
  `bmtr_Dupercent` decimal(5,2) DEFAULT NULL,
  `bmtr_frombranch_barimt` varchar(50) DEFAULT NULL,
  `TRTYPENAME` varchar(100) DEFAULT NULL,
  `trtype` varchar(4) DEFAULT NULL,
  `TransType` int DEFAULT NULL,
  `ORGANIZATION` varchar(50) DEFAULT NULL,
  `ROOMID` varchar(50) DEFAULT NULL,
  `USERID` varchar(50) DEFAULT NULL,
  `LOCATION` varchar(100) DEFAULT NULL,
  `rawdata` varchar(1000) DEFAULT NULL,
  `deviceid` varchar(100) DEFAULT NULL,
  `devicename` varchar(100) DEFAULT NULL,
  `actime` varchar(100) DEFAULT NULL,
  `rectime` varchar(100) DEFAULT NULL,
  `bmtr_count` int DEFAULT NULL,
  `bmtr_state` int DEFAULT NULL,
  `bmtr_id` varchar(50) DEFAULT NULL,
  `bmtr_confirm` int DEFAULT NULL,
  `bmtr_confirm_date` date DEFAULT NULL,
  `bmtr_confirm_emp` varchar(100) DEFAULT NULL,
  `bmtr_edit_date` date DEFAULT NULL,
  `bmtr_edit_emp` varchar(100) DEFAULT NULL,
  `bmtr_edit_cause` varchar(1000) DEFAULT NULL,
  `bmtr_del_date` date DEFAULT NULL,
  `bmtr_del_emp` varchar(100) DEFAULT NULL,
  `bmtr_del_cause` varchar(1000) DEFAULT NULL,
  `bmtr_check_date` date DEFAULT NULL,
  `bmtr_checkyn` varchar(1000) DEFAULT NULL,
  `bmtr_check_emp` varchar(100) DEFAULT NULL,
  `bmtr_check_cause` varchar(1000) DEFAULT NULL,
  `bmtr_up` double(15,2) DEFAULT NULL,
  `bmtr_ap` double(15,2) DEFAULT NULL,
  `bmtr_MM_sale` int DEFAULT NULL,
  `bmtr_BN_sale` int DEFAULT NULL,
  `bmtr_Saleap` int DEFAULT NULL,
  `bmtr_idname` varchar(100) DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `error_description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `transactions_order` (
  `id` int NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `ordrid` varchar(10) NOT NULL,
  `ordrdid` int NOT NULL,
  `ordrtr_transbranch` int NOT NULL,
  `ordrcustomerid` int DEFAULT NULL,
  `ordrcustomername` varchar(27) DEFAULT NULL,
  `ordrdate` date DEFAULT NULL,
  `ordrsource` varchar(100) DEFAULT NULL,
  `ordrtooutdate` date DEFAULT NULL,
  `ordrpayment` varchar(100) DEFAULT NULL,
  `ordrprodid` varchar(10) DEFAULT NULL,
  `ordrbname` varchar(100) DEFAULT NULL,
  `ordrsub` int DEFAULT NULL,
  `ordrbsize` int DEFAULT NULL,
  `ordrmu` varchar(100) DEFAULT NULL,
  `ordrsize` varchar(255) DEFAULT NULL,
  `ordrlen` varchar(100) DEFAULT NULL,
  `ordrwidth` varchar(100) DEFAULT NULL,
  `ordrthick` varchar(100) DEFAULT NULL,
  `ordrmat` varchar(100) DEFAULT NULL,
  `ordrpaint` varchar(100) DEFAULT NULL,
  `ordrcolor` varchar(100) DEFAULT NULL,
  `ordrcarving` varchar(100) DEFAULT NULL,
  `ordraccs` varchar(100) DEFAULT NULL,
  `ordrbkod` varchar(100) DEFAULT NULL,
  `ordrpriceoffer` int DEFAULT NULL,
  `ordrretailsel` int DEFAULT NULL,
  `retail_up` decimal(18,0) NOT NULL,
  `retail_total` decimal(18,0) NOT NULL,
  `ordrwholesalesel` int DEFAULT NULL,
  `ordrprodsel` int DEFAULT NULL,
  `ordrap` decimal(10,2) DEFAULT NULL,
  `ordrnoatyn` varchar(10) DEFAULT NULL,
  `ordrpriceofferdate` date DEFAULT NULL,
  `ordrpriceaccdate` date DEFAULT NULL,
  `ordrordrconfirmed` date DEFAULT NULL,
  `ordrconfirmdate` date DEFAULT NULL,
  `ordrproddays` int DEFAULT NULL,
  `ordrreceivedid` varchar(10) DEFAULT NULL,
  `ordrtoproddate` date DEFAULT NULL,
  `ordrout` varchar(20) DEFAULT NULL,
  `ordroutdate` date DEFAULT NULL,
  `ordrtransportprice` decimal(10,2) DEFAULT NULL,
  `ordrassemblyprice` decimal(10,2) DEFAULT NULL,
  `ordrcomments` varchar(255) DEFAULT NULL,
  `ordrproddate` date DEFAULT NULL,
  `TRTYPENAME` varchar(255) DEFAULT NULL,
  `trtype` varchar(4) DEFAULT NULL,
  `ORGANIZATION` varchar(100) DEFAULT NULL,
  `ROOMID` varchar(10) DEFAULT NULL,
  `USERID` varchar(10) DEFAULT NULL,
  `LOCATION` varchar(100) DEFAULT NULL,
  `rawdata` varchar(1000) DEFAULT NULL,
  `deviceid` varchar(100) DEFAULT NULL,
  `devicename` varchar(100) DEFAULT NULL,
  `actime` varchar(100) DEFAULT NULL,
  `rectime` varchar(100) DEFAULT NULL,
  `ordrtr_state` int DEFAULT NULL,
  `ordrtr_id` varchar(50) DEFAULT NULL,
  `ordrtr_confirm` int DEFAULT NULL,
  `ordrtr_confirm_date` date DEFAULT NULL,
  `ordrtr_confirm_emp` varchar(100) DEFAULT NULL,
  `ordrtr_edit_date` date DEFAULT NULL,
  `ordrtr_edit_emp` varchar(100) DEFAULT NULL,
  `ordrtr_edit_cause` varchar(1000) DEFAULT NULL,
  `ordrtr_del_date` date DEFAULT NULL,
  `ordrtr_del_emp` varchar(100) DEFAULT NULL,
  `ordrtr_del_cause` varchar(1000) DEFAULT NULL,
  `ordrtr_check_date` date DEFAULT NULL,
  `ordrtr_checkyn` varchar(1000) DEFAULT NULL,
  `ordrtr_check_emp` varchar(100) DEFAULT NULL,
  `ordrtr_check_cause` varchar(1000) DEFAULT NULL,
  `ordrbranch` varchar(16) DEFAULT NULL,
  `ordrnum` varchar(19) NOT NULL,
  `department_id` int DEFAULT NULL,
  `TransType` int DEFAULT NULL,
  `pos_session_id` varchar(64) DEFAULT NULL,
  `sp_primary_code` varchar(50) DEFAULT NULL,
  `sp_selling_code` varchar(50) DEFAULT NULL,
  `sp_pm_name` varchar(255) DEFAULT NULL,
  `sp_pm_unit_id` int DEFAULT NULL,
  `sp_categories` int DEFAULT NULL,
  `sp_manufacturer_id` int DEFAULT NULL,
  `sp_cost` decimal(18,4) DEFAULT NULL,
  `sp_cost_date` date DEFAULT NULL,
  `sp_source_table` varchar(50) DEFAULT NULL,
  `sp_current_stock` decimal(18,4) DEFAULT NULL,
  `sp_selling_price` decimal(18,4) DEFAULT NULL,
  `sp_coupon_discount` decimal(18,4) DEFAULT NULL,
  `sp_company_discount` decimal(18,4) DEFAULT NULL,
  `sp_supplier_discount` decimal(18,4) DEFAULT NULL,
  `sp_total_discount` decimal(18,4) DEFAULT NULL,
  `sp_current_company_stock` decimal(18,2) DEFAULT NULL,
  `sp_current_branch_stock` decimal(18,4) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `transactions_order_other` (
  `id` int NOT NULL,
  `company_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `ordrid` varchar(10) DEFAULT NULL,
  `ordrdid` int DEFAULT NULL,
  `ordrtr_transbranch` int DEFAULT NULL,
  `ordrcustomerid` int DEFAULT NULL,
  `ordrcustomername` varchar(27) DEFAULT NULL,
  `ordrdate` date DEFAULT NULL,
  `ordrsource` varchar(100) DEFAULT NULL,
  `ordrtooutdate` date DEFAULT NULL,
  `ordrpayment` varchar(100) DEFAULT NULL,
  `ordrprodid` varchar(10) DEFAULT NULL,
  `ordrbname` varchar(100) DEFAULT NULL,
  `ordrsub` int DEFAULT NULL,
  `ordrbsize` int DEFAULT NULL,
  `ordrmu` varchar(100) DEFAULT NULL,
  `ordrsize` varchar(255) DEFAULT NULL,
  `ordrlen` varchar(100) DEFAULT NULL,
  `ordrwidth` varchar(100) DEFAULT NULL,
  `ordrthick` varchar(100) DEFAULT NULL,
  `ordrmat` varchar(100) DEFAULT NULL,
  `ordrpaint` varchar(100) DEFAULT NULL,
  `ordrcolor` varchar(100) DEFAULT NULL,
  `ordrcarving` varchar(100) DEFAULT NULL,
  `ordraccs` varchar(100) DEFAULT NULL,
  `ordrbkod` varchar(100) DEFAULT NULL,
  `ordrpriceoffer` int DEFAULT NULL,
  `ordrretailsel` int DEFAULT NULL,
  `ordrwholesalesel` int DEFAULT NULL,
  `ordrprodsel` int DEFAULT NULL,
  `ordrap` decimal(10,2) DEFAULT NULL,
  `ordrnoatyn` varchar(10) DEFAULT NULL,
  `ordrpriceofferdate` date DEFAULT NULL,
  `ordrpriceaccdate` date DEFAULT NULL,
  `ordrordrconfirmed` date DEFAULT NULL,
  `ordrconfirmdate` date DEFAULT NULL,
  `ordrproddays` int DEFAULT NULL,
  `ordrreceivedid` varchar(10) DEFAULT NULL,
  `ordrtoproddate` date DEFAULT NULL,
  `ordrout` varchar(20) DEFAULT NULL,
  `ordroutdate` date DEFAULT NULL,
  `ordrtransportprice` decimal(10,2) DEFAULT NULL,
  `ordrassemblyprice` decimal(10,2) DEFAULT NULL,
  `ordrcomments` varchar(255) DEFAULT NULL,
  `ordrproddate` date DEFAULT NULL,
  `TRTYPENAME` varchar(255) DEFAULT NULL,
  `trtype` varchar(4) DEFAULT NULL,
  `ORGANIZATION` varchar(100) DEFAULT NULL,
  `ROOMID` varchar(10) DEFAULT NULL,
  `USERID` varchar(10) DEFAULT NULL,
  `LOCATION` varchar(100) DEFAULT NULL,
  `rawdata` varchar(1000) DEFAULT NULL,
  `deviceid` varchar(100) DEFAULT NULL,
  `devicename` varchar(100) DEFAULT NULL,
  `actime` varchar(100) DEFAULT NULL,
  `rectime` varchar(100) DEFAULT NULL,
  `ordrtr_state` int DEFAULT NULL,
  `ordrtr_id` varchar(50) DEFAULT NULL,
  `ordrtr_confirm` int DEFAULT NULL,
  `ordrtr_confirm_date` date DEFAULT NULL,
  `ordrtr_confirm_emp` varchar(100) DEFAULT NULL,
  `ordrtr_edit_date` date DEFAULT NULL,
  `ordrtr_edit_emp` varchar(100) DEFAULT NULL,
  `ordrtr_edit_cause` varchar(1000) DEFAULT NULL,
  `ordrtr_del_date` date DEFAULT NULL,
  `ordrtr_del_emp` varchar(100) DEFAULT NULL,
  `ordrtr_del_cause` varchar(1000) DEFAULT NULL,
  `ordrtr_check_date` date DEFAULT NULL,
  `ordrtr_checkyn` varchar(1000) DEFAULT NULL,
  `ordrtr_check_emp` varchar(100) DEFAULT NULL,
  `ordrtr_check_cause` varchar(1000) DEFAULT NULL,
  `ordrbranch` varchar(16) DEFAULT NULL,
  `ordrnum` varchar(19) DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `TransType` int DEFAULT NULL,
  `error_description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `transactions_plan` (
  `id` int NOT NULL,
  `num` varchar(36) NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `transbranch` int NOT NULL,
  `pid` varchar(8) DEFAULT NULL,
  `cid` varchar(50) DEFAULT NULL,
  `tid` varchar(50) DEFAULT NULL,
  `pmid` varchar(50) DEFAULT NULL,
  `acc` varchar(20) DEFAULT NULL,
  `sub` varchar(20) DEFAULT NULL,
  `annot` varchar(1000) NOT NULL,
  `date` date DEFAULT NULL,
  `sellerid` varchar(50) DEFAULT NULL,
  `empid` varchar(50) DEFAULT NULL,
  `orderedp` varchar(66) DEFAULT NULL,
  `orderid` varchar(20) DEFAULT NULL,
  `orderdid` int DEFAULT NULL,
  `branchid` varchar(50) DEFAULT NULL,
  `consumerid` varchar(50) DEFAULT NULL,
  `frombranchid` varchar(50) DEFAULT NULL,
  `zorchil_type` int DEFAULT NULL,
  `zorchilgargasan_id` int DEFAULT NULL,
  `freq_id` varchar(50) DEFAULT NULL,
  `position_id` varchar(50) DEFAULT NULL,
  `TRTYPENAME` varchar(255) DEFAULT NULL,
  `trtype` varchar(4) DEFAULT NULL,
  `TransType` int DEFAULT NULL,
  `ORGANIZATION` varchar(50) DEFAULT NULL,
  `ROOMID` varchar(50) DEFAULT NULL,
  `USERID` varchar(50) DEFAULT NULL,
  `LOCATION` varchar(50) DEFAULT NULL,
  `rawdata` varchar(1000) DEFAULT NULL,
  `deviceid` varchar(50) DEFAULT NULL,
  `devicename` varchar(50) DEFAULT NULL,
  `actime` varchar(50) DEFAULT NULL,
  `count` int DEFAULT NULL,
  `state` int DEFAULT NULL,
  `confirm` int DEFAULT NULL,
  `confirm_date` date DEFAULT NULL,
  `confirm_emp` varchar(50) DEFAULT NULL,
  `edit_date` date DEFAULT NULL,
  `edit_emp` varchar(50) DEFAULT NULL,
  `edit_cause` varchar(500) DEFAULT NULL,
  `del_date` date DEFAULT NULL,
  `del_emp` varchar(50) DEFAULT NULL,
  `del_cause` varchar(500) DEFAULT NULL,
  `check_date` date DEFAULT NULL,
  `checkyn` varchar(500) DEFAULT NULL,
  `check_emp` varchar(50) DEFAULT NULL,
  `check_cause` varchar(500) DEFAULT NULL,
  `planid` varchar(50) DEFAULT NULL,
  `departmen_id` int DEFAULT NULL,
  `pos_session_id` varchar(64) DEFAULT NULL,
  `sp_primary_code` varchar(50) DEFAULT NULL,
  `sp_selling_code` varchar(50) DEFAULT NULL,
  `sp_pm_name` varchar(255) DEFAULT NULL,
  `sp_pm_unit_id` int DEFAULT NULL,
  `sp_categories` int DEFAULT NULL,
  `sp_manufacturer_id` int DEFAULT NULL,
  `sp_cost` decimal(18,4) DEFAULT NULL,
  `sp_cost_date` date DEFAULT NULL,
  `sp_source_table` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `transactions_plan_other` (
  `id` int NOT NULL,
  `num` varchar(36) DEFAULT NULL,
  `company_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `transbranch` int DEFAULT NULL,
  `pid` varchar(8) DEFAULT NULL,
  `cid` varchar(50) DEFAULT NULL,
  `tid` varchar(50) DEFAULT NULL,
  `pmid` varchar(50) DEFAULT NULL,
  `acc` varchar(20) DEFAULT NULL,
  `sub` varchar(20) DEFAULT NULL,
  `annot` varchar(1000) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `sellerid` varchar(50) DEFAULT NULL,
  `empid` varchar(50) DEFAULT NULL,
  `orderedp` varchar(66) DEFAULT NULL,
  `orderid` varchar(20) DEFAULT NULL,
  `orderdid` int DEFAULT NULL,
  `branchid` varchar(50) DEFAULT NULL,
  `consumerid` varchar(50) DEFAULT NULL,
  `frombranchid` varchar(50) DEFAULT NULL,
  `zorchil_type` int DEFAULT NULL,
  `zorchilgargasan_id` int DEFAULT NULL,
  `freq_id` varchar(50) DEFAULT NULL,
  `position_id` varchar(50) DEFAULT NULL,
  `TRTYPENAME` varchar(255) DEFAULT NULL,
  `trtype` varchar(4) DEFAULT NULL,
  `TransType` int DEFAULT NULL,
  `ORGANIZATION` varchar(50) DEFAULT NULL,
  `ROOMID` varchar(50) DEFAULT NULL,
  `USERID` varchar(50) DEFAULT NULL,
  `LOCATION` varchar(50) DEFAULT NULL,
  `rawdata` varchar(1000) DEFAULT NULL,
  `deviceid` varchar(50) DEFAULT NULL,
  `devicename` varchar(50) DEFAULT NULL,
  `actime` varchar(50) DEFAULT NULL,
  `count` int DEFAULT NULL,
  `state` int DEFAULT NULL,
  `confirm` int DEFAULT NULL,
  `confirm_date` date DEFAULT NULL,
  `confirm_emp` varchar(50) DEFAULT NULL,
  `edit_date` date DEFAULT NULL,
  `edit_emp` varchar(50) DEFAULT NULL,
  `edit_cause` varchar(500) DEFAULT NULL,
  `del_date` date DEFAULT NULL,
  `del_emp` varchar(50) DEFAULT NULL,
  `del_cause` varchar(500) DEFAULT NULL,
  `check_date` date DEFAULT NULL,
  `checkyn` varchar(500) DEFAULT NULL,
  `check_emp` varchar(50) DEFAULT NULL,
  `check_cause` varchar(500) DEFAULT NULL,
  `planid` varchar(50) DEFAULT NULL,
  `departmen_id` int DEFAULT NULL,
  `error_description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `transactions_pos` (
  `id` int NOT NULL,
  `session_id` varchar(64) DEFAULT NULL,
  `company_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `emp_id` varchar(10) DEFAULT NULL,
  `pos_date` date DEFAULT NULL,
  `pos_time` datetime DEFAULT NULL,
  `order_id` varchar(64) DEFAULT NULL,
  `total_quantity` int DEFAULT NULL,
  `total_amount` decimal(18,2) DEFAULT NULL,
  `total_discount` decimal(18,2) DEFAULT NULL,
  `cashback` decimal(18,0) DEFAULT NULL,
  `cashback_payment_type` int DEFAULT NULL,
  `payable_amount` decimal(18,0) DEFAULT NULL,
  `deposit_amount` decimal(18,0) DEFAULT NULL,
  `payment_type` int DEFAULT NULL,
  `remarks` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `status` int NOT NULL DEFAULT '1',
  `sub_transaction_ids` json DEFAULT NULL,
  `transport_price` decimal(18,0) DEFAULT NULL,
  `assembly_price` decimal(18,0) NOT NULL,
  `TRTYPENAME` varchar(255) NOT NULL,
  `trtype` varchar(4) NOT NULL,
  `TransType` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `UnifiedInventoryCode` (
`cost_code` varchar(100)
,`cost` decimal(18,2)
,`cost_date` date
,`primary_code` varchar(100)
,`selling_code` varchar(100)
,`pm_name` varchar(255)
,`pm_unit_id` int
,`categories` int
,`manufacturer_id` bigint
,`source_table` varchar(13)
);
CREATE TABLE `unified_lookup` (
`cost_code` varchar(100)
,`cost` decimal(18,2)
,`primary_code` varchar(100)
,`selling_code` varchar(100)
,`pm_name` varchar(255)
,`pm_unit_id` int
,`categories` int
,`manufacturer_id` bigint
,`source_table` varchar(13)
);
CREATE TABLE `users` (
  `id` int NOT NULL,
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '$2a$10$OyIyhW8VD6/4X2A/2IA3mOvwvx.a4spsEteH9tjqf69hq70jFnNmu',
  `created_by` varchar(50) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `empid` varchar(50) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `user_activity_log` (
  `log_id` bigint NOT NULL,
  `emp_id` varchar(10) NOT NULL,
  `table_name` varchar(100) NOT NULL,
  `record_id` bigint NOT NULL,
  `action` enum('create','update','delete','request_edit','request_delete','approve','decline') NOT NULL,
  `details` json DEFAULT NULL,
  `request_id` bigint DEFAULT NULL,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `user_levels` (
  `id` int NOT NULL,
  `userlevel_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `Description` varchar(255) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `user_level_permissions` (
  `id` int NOT NULL,
  `userlevel_id` int NOT NULL,
  `action` varchar(20) DEFAULT NULL,
  `action_key` varchar(255) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `view_inventory_report_summary` (
`primary_code` varchar(50)
,`pm_name` varchar(255)
,`pm_unit_id` int
,`opening_acc` double(19,2)
,`opening_sub` double(19,2)
,`increase_acc` double(19,2)
,`increase_sub` double(19,2)
,`decrease_acc` double(19,2)
,`decrease_sub` double(19,2)
,`closing_acc` double(19,2)
,`closing_sub` double(19,2)
,`calculated_closing_acc` double(22,2)
,`diff_vs_actual_closing_sub` double(22,2)
);
CREATE TABLE `view_transactions_income` (
`id` int
,`or_num` varchar(50)
,`ortr_transbranch` int
,`or_o_barimt` varchar(50)
,`company_id` int
,`branch_id` int
,`or_g_id` int
,`or_burtgel` int
,`or_chig` int
,`or_torol` int
,`or_type_id` int
,`or_av_now` int
,`or_av_time` varchar(50)
,`or_date` date
,`orcash_or_id` int
,`or_or` double(15,2)
,`or_vallut_id` int
,`or_valut_choice` int
,`or_bar_suu` varchar(17)
,`or_bcode` varchar(50)
,`or_orderid` varchar(102)
,`or_tailbar1` varchar(65)
,`orBurtgel_rd` varchar(27)
,`or_eb` int
,`or_bank` varchar(7)
,`or_uglug_id` varchar(15)
,`or_emp_receiver` varchar(10)
,`or_tur_receiver` varchar(10)
,`or_other_receiver` varchar(100)
,`or_org_id` varchar(10)
,`TRTYPENAME` varchar(100)
,`trtype` varchar(4)
,`TransType` int
,`ORGANIZATION` varchar(50)
,`ROOMID` varchar(10)
,`USERID` varchar(10)
,`LOCATION` varchar(50)
,`deviceid` varchar(50)
,`devicename` varchar(50)
,`rawdata` varchar(500)
,`actime` date
,`rectime` date
,`ortr_state` int
,`ortr_id` varchar(50)
,`ortr_confirm` int
,`ortr_confirm_date` date
,`ortr_confirm_emp` varchar(10)
,`ortr_edit_date` date
,`ortr_edit_emp` varchar(10)
,`ortr_edit_cause` varchar(500)
,`ortr_del_date` date
,`ortr_del_emp` varchar(10)
,`ortr_del_cause` varchar(500)
,`ortr_check_date` date
,`ortr_checkyn` varchar(500)
,`ortr_check_emp` varchar(10)
,`ortr_check_cause` varchar(500)
);
ALTER TABLE `audit_log`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_abhuvaari`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_HBChig_id2_HBTorol_id2_Hbaitsaagch_id2` (`company_id`, `HBChig_id2`, `HBTorol_id2`, `Hbaitsaagch_id2`),
  ADD KEY `HBTorol_id2` (`company_id`, `HBTorol_id2`),
  ADD KEY `Hbaitsaagch_id2` (`company_id`, `Hbaitsaagch_id2`);
ALTER TABLE `code_bayarodor`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_fest_year_fest_month` (`company_id`, `fest_year`, `fest_month`);
ALTER TABLE `code_bkod`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_bkod_bkod_cost_bkod_prod_bkod_spec_bkod_prim_bkod_date` (`company_id`, `bkod`, `bkod_cost`, `bkod_prod`, `bkod_spec`, `bkod_prim`, `bkod_date`);
ALTER TABLE `code_bkodprim`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_1ab68fd7` (`company_id`, `bkod_Tk`, `bkod_Tk_name`, `bkod_Tk_muid`, `bkod_tk_tkkod`, `bkod_Tk_SKU`, `bkod_Tk_date`, `bkod_Tk_prod`, `bkod_Tk_size`, `bkod_tk_length`, `bkod_tk_width`, `bkod_tk_thick`),
  ADD KEY `bkod_Tk_muid` (`company_id`, `bkod_Tk_muid`);
ALTER TABLE `code_branches`
  ADD PRIMARY KEY (`company_id`, `branch_id`);
ALTER TABLE `code_cashier`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_chiglel`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_department`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_company_department_id` (`company_id`, `department_id`),
  ADD KEY `idx_company_department_id` (`company_id`, `department_id`);
ALTER TABLE `code_edhorongo`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_ehkod_company_id` (`company_id`, `ehkod`);
ALTER TABLE `code_edhorongo_other`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_expenseangilal`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_expensebalancetype`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_expensebaltype`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_k1_k2_k3_k4_k5_k6_` (`company_id`, `k1`, `k2`, `k3`, `k4`, `k5`, `k6_`),
  ADD KEY `k2` (`company_id`, `k2`),
  ADD KEY `k3` (`company_id`, `k3`),
  ADD KEY `k4` (`company_id`, `k4`),
  ADD KEY `k5` (`company_id`, `k5`),
  ADD KEY `k6_` (`company_id`, `k6_`);
ALTER TABLE `code_expensetype`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_expenseutga`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_frequency`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_huvaari`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD KEY `position_id` (`company_id`, `position_id`);
ALTER TABLE `code_incometype`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_initiator`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_material`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_xmkod_xmkod_muid_xmkod_cost_xmkod_tkkod` (`company_id`, `xmkod`, `xmkod_muid`, `xmkod_cost`, `xmkod_tkkod`),
  ADD KEY `xmkod_muid` (`company_id`, `xmkod_muid`);
ALTER TABLE `code_materialprim`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_53ccf867` (`company_id`, `xmkodtk`, `xmkodtk_name`, `xmkodtk_muid`, `xmkodtk_type`, `xmkodtk_tkkod`),
  ADD KEY `xmkodtk_muid` (`company_id`, `xmkodtk_muid`);
ALTER TABLE `code_position`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_company_position_id` (`company_id`, `position_id`),
  ADD UNIQUE KEY `uniq_company_position_name` (`company_id`, `position_name`);
ALTER TABLE `code_position_other`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_room`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_status`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `id` (`company_id`, `id`);
ALTER TABLE `code_talbai`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_torol`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_transaction`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_UITransType_UITransTypeName_UITrtype` (`company_id`, `UITransType`, `UITransTypeName`, `UITrtype`),
  ADD UNIQUE KEY `UITransType` (`company_id`, `UITransType`);
ALTER TABLE `code_unit`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_userlevel_settings`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uls_function` (`company_id`, `uls_id`, `function_name`);
ALTER TABLE `code_valut`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_violation`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_woodprocctype`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_woodsort`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_woodtype`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `code_workplace`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_workplace_id` (`company_id`, `workplace_id`),
  ADD KEY `workplace_position_id` (`company_id`, `workplace_position_id`);
ALTER TABLE `code_workplace_other`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `companies`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `company_licenses`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `company_module_licenses`
  ADD PRIMARY KEY (`company_id`, `module_key`),
  ADD KEY `module_key` (`company_id`, `module_key`);
ALTER TABLE `forms`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `form_submissions`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `license_plans`
  ADD PRIMARY KEY (`id`);
ALTER TABLE `modules`
  ADD PRIMARY KEY (`module_key`),
  ADD KEY `fk_modules_parent` (`parent_key`);
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`company_id`, `notification_id`);
ALTER TABLE `payments`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `pending_request`
  ADD PRIMARY KEY (`company_id`, `request_id`),
  ADD UNIQUE KEY `idx_pending_unique` (`company_id`, `table_name`, `record_id`, `emp_id`, `request_type`, `is_pending`);
ALTER TABLE `report_definitions`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `report_key` (`company_id`, `report_key`);
ALTER TABLE `request_seen_counts`
  ADD PRIMARY KEY (`company_id`, `emp_id`);
ALTER TABLE `role_default_modules`
  ADD PRIMARY KEY (`company_id`, `role_id`, `module_key`),
  ADD KEY `idx_company_module_key` (`company_id`, `module_key`);
ALTER TABLE `role_module_permissions`
  ADD PRIMARY KEY (`company_id`, `position_id`, `module_key`),
  ADD KEY `module_key` (`company_id`, `module_key`),
  ADD KEY `fk_rmp_role` (`company_id`, `position_id`);
ALTER TABLE `tbl_beltgenniiluulegch`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_manuf_id` (`company_id`, `manuf_id`);
ALTER TABLE `tbl_bhuvaari`
  ADD UNIQUE KEY `uniq_BH_id_bh_YM` (`company_id`, `BH_id`, `bh_YM`);
ALTER TABLE `tbl_contracter`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_manuf_id_manuf_rd_manuf_phone` (`company_id`, `manuf_id`, `manuf_rd`, `manuf_phone`),
  ADD KEY `manuf_id` (`company_id`, `manuf_id`);
ALTER TABLE `tbl_currate`
  ADD UNIQUE KEY `uniq_Valutid_CurDate_ratenum` (`company_id`, `Valutid`, `CurDate`, `ratenum`);
ALTER TABLE `tbl_discount`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_946b42ff` (`company_id`, `inventory_code`, `start_date`, `end_date`, `discount_amount`, `manufacturer_id`, `coupon_code`, `branchid`, `branch_id`, `department_id`),
  ADD KEY `branchid` (`company_id`, `branchid`);
ALTER TABLE `tbl_discount_other`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `tbl_employee`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_emp_id_emp_lname_emp_fname_emp_rd_emp_sector_id` (`emp_id`,`emp_lname`,`emp_fname`,`emp_rd`),
  ADD KEY `Company_id` (`Company_id`);
ALTER TABLE `tbl_employment`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_b2a0973c` (`company_id`, `employment_emp_id`, `employment_position_id`, `employment_workplace_id`, `employment_date`, `employment_department_id`, `employment_branch_id`),
  ADD KEY `employment_company_id` (`company_id`),
  ADD KEY `employment_branch_id` (`company_id`, `employment_branch_id`),
  ADD KEY `employment_department_id` (`company_id`, `employment_department_id`),
  ADD KEY `employment_user_level` (`company_id`, `employment_user_level`),
  ADD KEY `tbl_employment_ibfk_6` (`company_id`, `employment_senior_empid`);
ALTER TABLE `tbl_employment_other`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `tbl_expenseorg`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_z_org_id` (`company_id`, `z_org_id`);
ALTER TABLE `tbl_hongololt`
  ADD UNIQUE KEY `uniq_hon_g_id_hon_year_hon_month` (`company_id`, `hon_g_id`, `hon_year`, `hon_month`);
ALTER TABLE `tbl_sale`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_43ddfc0b` (`company_id`, `hkod`, `hstartmmdate`, `hendmmdate`, `hsalemmp`, `hsalepermm`, `hstartbndate`, `hendbndate`, `hsalepbn`, `hsaleperbn`, `hcoupon`, `branchid`);
ALTER TABLE `tbl_sellingprice`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_product_primary_code_price_date_company_id` (`company_id`, `product_primary_code`, `price_date`);
ALTER TABLE `tbl_sellingprice_other`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `tbl_workplace_schedule`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_ws_id_ws_workplace_id_ws_emp_id_ws_date` (`company_id`, `ws_id`, `ws_workplace_id`, `ws_emp_id`, `ws_date`),
  ADD KEY `ws_emp_id` (`company_id`, `ws_emp_id`);
ALTER TABLE `tbl_workplace_schedule_other`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `tenant_tables`
  ADD PRIMARY KEY (`table_name`);
ALTER TABLE `transactions_contract`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_d1def43f` (`company_id`, `g_num`, `g_id`, `g_burtgel_id`, `g_chig`, `g_torol`, `g_sq`, `g_start`, `g_end`, `branch_id`, `g_cancel`),
  ADD KEY `company_id` (`company_id`);
ALTER TABLE `transactions_contract_other`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `transactions_expense`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_z_num_company_id_branch_id_ztr_transbranch_z_barimt` (`company_id`, `z_num`, `branch_id`, `ztr_transbranch`, `z_barimt`),
  ADD KEY `branch_id` (`company_id`, `branch_id`),
  ADD KEY `z_angilal_b` (`company_id`, `z_angilal_b`),
  ADD KEY `company_id` (`company_id`),
  ADD KEY `z_from` (`company_id`, `z_from`),
  ADD KEY `TransType` (`company_id`, `TransType`);
ALTER TABLE `transactions_expense_other`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `transactions_income`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_db40a088` (`company_id`, `or_num`, `ortr_transbranch`, `or_o_barimt`, `branch_id`),
  ADD KEY `company_id` (`company_id`);
ALTER TABLE `transactions_income_other`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `transactions_inventory`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_bmtr_num_company_id_branch_id_bmtr_transbranch` (`company_id`, `bmtr_num`, `branch_id`, `bmtr_transbranch`),
  ADD KEY `company_id` (`company_id`),
  ADD KEY `sp_pm_unit_id` (`company_id`, `sp_pm_unit_id`);
ALTER TABLE `transactions_inventory_other`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `transactions_order`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_company_id_branch_id_ordrid_ordrdid_ordrtr_transbranch` (`company_id`, `branch_id`, `ordrid`, `ordrdid`, `ordrtr_transbranch`),
  ADD KEY `sp_pm_unit_id` (`company_id`, `sp_pm_unit_id`);
ALTER TABLE `transactions_order_other`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `transactions_plan`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_num_company_id_branch_id_transbranch` (`company_id`, `num`, `branch_id`, `transbranch`),
  ADD KEY `company_id` (`company_id`);
ALTER TABLE `transactions_plan_other`
  ADD PRIMARY KEY (`company_id`, `id`);
ALTER TABLE `transactions_pos`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD KEY `branch_id` (`company_id`, `branch_id`),
  ADD KEY `company_id` (`company_id`),
  ADD KEY `emp_id` (`company_id`, `emp_id`),
  ADD KEY `department_id` (`company_id`, `department_id`),
  ADD KEY `status` (`company_id`, `status`),
  ADD KEY `payment_type` (`company_id`, `payment_type`),
  ADD KEY `cashback_payment_type` (`company_id`, `cashback_payment_type`);
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `empid` (`empid`),
  ADD KEY `fk_users_createdby` (`created_by`);
ALTER TABLE `user_activity_log`
  ADD PRIMARY KEY (`company_id`, `log_id`);
ALTER TABLE `user_levels`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD UNIQUE KEY `uniq_company_userlevel_id` (`company_id`, `userlevel_id`),
  ADD KEY `idx_company_userlevel_id` (`company_id`, `userlevel_id`);
ALTER TABLE `user_level_permissions`
  ADD PRIMARY KEY (`company_id`, `id`),
  ADD KEY `idx_company_userlevel_id` (`company_id`, `userlevel_id`);
ALTER TABLE `audit_log`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `code_abhuvaari`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `code_bayarodor`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=169;
ALTER TABLE `code_bkod`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `code_bkodprim`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `code_branches`
  MODIFY `branch_id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=32;
ALTER TABLE `code_cashier`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;
ALTER TABLE `code_chiglel`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=32;
ALTER TABLE `code_department`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;
ALTER TABLE `code_edhorongo`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `code_edhorongo_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `code_expenseangilal`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=49;
ALTER TABLE `code_expensebalancetype`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=112;
ALTER TABLE `code_expensebaltype`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=204;
ALTER TABLE `code_expensetype`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=62;
ALTER TABLE `code_expenseutga`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=39;
ALTER TABLE `code_frequency`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;
ALTER TABLE `code_huvaari`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `code_incometype`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=23;
ALTER TABLE `code_initiator`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;
ALTER TABLE `code_material`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `code_materialprim`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `code_position`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=50;
ALTER TABLE `code_position_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `code_room`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=98;
ALTER TABLE `code_status`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;
ALTER TABLE `code_talbai`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `code_torol`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;
ALTER TABLE `code_transaction`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=186;
ALTER TABLE `code_unit`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=34;
ALTER TABLE `code_userlevel_settings`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `code_valut`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;
ALTER TABLE `code_violation`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;
ALTER TABLE `code_woodprocctype`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;
ALTER TABLE `code_woodsort`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;
ALTER TABLE `code_woodtype`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;
ALTER TABLE `code_workplace`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `code_workplace_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `companies`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `company_licenses`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `forms`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `form_submissions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `notifications`
  MODIFY `notification_id` bigint NOT NULL AUTO_INCREMENT;
ALTER TABLE `payments`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `pending_request`
  MODIFY `request_id` bigint NOT NULL AUTO_INCREMENT;
ALTER TABLE `report_definitions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `tbl_beltgenniiluulegch`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `tbl_contracter`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `tbl_discount`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `tbl_discount_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `tbl_employee`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `tbl_employment`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `tbl_employment_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `tbl_expenseorg`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `tbl_sale`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `tbl_sellingprice`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `tbl_sellingprice_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `tbl_workplace_schedule`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `tbl_workplace_schedule_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `transactions_contract`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `transactions_contract_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `transactions_expense`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `transactions_expense_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `transactions_income`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `transactions_income_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `transactions_inventory`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `transactions_inventory_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `transactions_order`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `transactions_order_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `transactions_plan`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `transactions_plan_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `transactions_pos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `users`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `user_activity_log`
  MODIFY `log_id` bigint NOT NULL AUTO_INCREMENT;
ALTER TABLE `user_levels`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;
ALTER TABLE `user_level_permissions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
ALTER TABLE `code_abhuvaari`
  ADD CONSTRAINT `code_abhuvaari_ibfk_1` FOREIGN KEY (`company_id`, `HBChig_id2`) REFERENCES `code_chiglel` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `code_abhuvaari_ibfk_2` FOREIGN KEY (`company_id`, `HBTorol_id2`) REFERENCES `code_torol` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `code_abhuvaari_ibfk_3` FOREIGN KEY (`company_id`, `Hbaitsaagch_id2`) REFERENCES `code_huvaari` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `code_bkodprim`
  ADD CONSTRAINT `code_bkodprim_ibfk_1` FOREIGN KEY (`company_id`, `bkod_Tk_muid`) REFERENCES `code_unit` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `code_expensebaltype`
  ADD CONSTRAINT `code_expensebaltype_ibfk_2` FOREIGN KEY (`company_id`, `k2`) REFERENCES `code_expenseangilal` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `code_expensebaltype_ibfk_3` FOREIGN KEY (`company_id`, `k3`) REFERENCES `code_expensetype` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `code_expensebaltype_ibfk_4` FOREIGN KEY (`company_id`, `k4`) REFERENCES `code_expenseutga` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `code_expensebaltype_ibfk_5` FOREIGN KEY (`company_id`, `k5`) REFERENCES `code_expensebalancetype` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `code_expensebaltype_ibfk_6` FOREIGN KEY (`company_id`, `k6_`) REFERENCES `code_expensebalancetype` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `code_materialprim`
  ADD CONSTRAINT `code_materialprim_ibfk_1` FOREIGN KEY (`company_id`, `xmkodtk_muid`) REFERENCES `code_unit` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `code_workplace`
  ADD CONSTRAINT `code_workplace_ibfk_1` FOREIGN KEY (`company_id`, `workplace_position_id`) REFERENCES `code_position` (`company_id`, `position_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `company_module_licenses`
  ADD CONSTRAINT `company_module_licenses_ibfk_2` FOREIGN KEY (`module_key`) REFERENCES `modules` (`module_key`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `company_module_licenses_ibfk_3` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `modules`
  ADD CONSTRAINT `fk_modules_parent` FOREIGN KEY (`parent_key`) REFERENCES `modules` (`module_key`);
ALTER TABLE `request_seen_counts`
  ADD CONSTRAINT `fk_seen_emp` FOREIGN KEY (`company_id`, `emp_id`) REFERENCES `tbl_employment` (`employment_company_id`, `employment_emp_id`);
ALTER TABLE `role_default_modules`
  ADD CONSTRAINT `role_default_modules_ibfk_2` FOREIGN KEY (`module_key`) REFERENCES `modules` (`module_key`);
ALTER TABLE `role_module_permissions`
  ADD CONSTRAINT `role_module_permissions_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `role_module_permissions_ibfk_3` FOREIGN KEY (`module_key`) REFERENCES `modules` (`module_key`);
ALTER TABLE `tbl_beltgenniiluulegch`
  ADD CONSTRAINT `tbl_beltgenniiluulegch_ibfk_1` FOREIGN KEY (`company_id`, `manuf_id`) REFERENCES `tbl_contracter` (`company_id`, `manuf_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `tbl_currate`
  ADD CONSTRAINT `tbl_currate_ibfk_1` FOREIGN KEY (`company_id`, `Valutid`) REFERENCES `code_valut` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `tbl_discount`
  ADD CONSTRAINT `tbl_discount_ibfk_1` FOREIGN KEY (`company_id`, `branchid`) REFERENCES `code_branches` (`company_id`, `branch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `tbl_employment`
  ADD CONSTRAINT `tbl_employment_ibfk_1` FOREIGN KEY (`employment_company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `tbl_employment_ibfk_2` FOREIGN KEY (`employment_company_id`, `employment_emp_id`) REFERENCES `tbl_employee` (`Company_id`, `emp_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `tbl_employment_ibfk_3` FOREIGN KEY (`employment_company_id`, `employment_branch_id`) REFERENCES `code_branches` (`company_id`, `branch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `tbl_employment_ibfk_4` FOREIGN KEY (`employment_company_id`, `employment_department_id`) REFERENCES `code_department` (`company_id`, `department_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `tbl_employment_ibfk_5` FOREIGN KEY (`employment_user_level`) REFERENCES `user_levels` (`userlevel_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `tbl_employment_ibfk_6` FOREIGN KEY (`employment_company_id`, `employment_senior_empid`) REFERENCES `tbl_employee` (`Company_id`, `emp_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `tbl_employment_other`
  ADD CONSTRAINT `tbl_employment_other_ibfk_1` FOREIGN KEY (`employment_company_id`, `employment_branch_id`) REFERENCES `code_branches` (`company_id`, `branch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `tbl_employment_other_ibfk_2` FOREIGN KEY (`employment_company_id`, `employment_department_id`) REFERENCES `code_department` (`company_id`, `department_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `tbl_expenseorg`
  ADD CONSTRAINT `tbl_expenseorg_ibfk_1` FOREIGN KEY (`company_id`, `z_org_id`) REFERENCES `tbl_contracter` (`company_id`, `manuf_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `tbl_workplace_schedule`
  ADD CONSTRAINT `tbl_workplace_schedule_ibfk_1` FOREIGN KEY (`company_id`, `ws_emp_id`) REFERENCES `tbl_employee` (`Company_id`, `emp_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `transactions_contract`
  ADD CONSTRAINT `transactions_contract_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `transactions_expense`
  ADD CONSTRAINT `transactions_expense_ibfk_1` FOREIGN KEY (`company_id`, `branch_id`) REFERENCES `code_branches` (`company_id`, `branch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_expense_ibfk_2` FOREIGN KEY (`company_id`, `z_angilal_b`) REFERENCES `code_branches` (`company_id`, `branch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_expense_ibfk_3` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_expense_ibfk_4` FOREIGN KEY (`company_id`, `z_from`) REFERENCES `code_cashier` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_expense_ibfk_5` FOREIGN KEY (`TransType`) REFERENCES `code_transaction` (`UITransType`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `transactions_income`
  ADD CONSTRAINT `transactions_income_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `transactions_inventory`
  ADD CONSTRAINT `transactions_inventory_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_inventory_ibfk_2` FOREIGN KEY (`company_id`, `sp_pm_unit_id`) REFERENCES `code_unit` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `transactions_order`
  ADD CONSTRAINT `transactions_order_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_order_ibfk_2` FOREIGN KEY (`company_id`, `sp_pm_unit_id`) REFERENCES `code_unit` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `transactions_plan`
  ADD CONSTRAINT `transactions_plan_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `transactions_pos`
  ADD CONSTRAINT `transactions_pos_ibfk_1` FOREIGN KEY (`company_id`, `branch_id`) REFERENCES `code_branches` (`company_id`, `branch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_pos_ibfk_2` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_pos_ibfk_3` FOREIGN KEY (`company_id`, `emp_id`) REFERENCES `tbl_employee` (`Company_id`, `emp_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_pos_ibfk_5` FOREIGN KEY (`company_id`, `status`) REFERENCES `code_status` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_pos_ibfk_6` FOREIGN KEY (`company_id`, `payment_type`) REFERENCES `code_cashier` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_pos_ibfk_8` FOREIGN KEY (`company_id`, `cashback_payment_type`) REFERENCES `code_cashier` (`company_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `users`
  ADD CONSTRAINT `users_ibfk_1` FOREIGN KEY (`company_id`, `empid`) REFERENCES `tbl_employment` (`employment_company_id`, `employment_emp_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `users_ibfk_2` FOREIGN KEY (`company_id`, `empid`) REFERENCES `tbl_employee` (`Company_id`, `emp_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `user_level_permissions`
  ADD CONSTRAINT `user_level_permissions_ibfk_1` FOREIGN KEY (`userlevel_id`) REFERENCES `user_levels` (`userlevel_id`),
  ADD CONSTRAINT `user_level_permissions_ibfk_2` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
