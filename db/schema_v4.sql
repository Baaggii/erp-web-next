CREATE TABLE SOrlogo (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `or_num` VARCHAR(120) NULL,
  `or_o_barimt` VARCHAR(120) NULL,
  `or_g_id` BIGINT NULL,
  `or_burtgel` VARCHAR(120) NULL,
  `or_chig` VARCHAR(120) NULL,
  `or_torol` VARCHAR(120) NULL,
  `or_h_b` VARCHAR(120) NULL,
  `or_type_id` BIGINT NULL,
  `or_av_now` VARCHAR(120) NULL,
  `or_date` DATE NULL,
  `orcash_or_id` BIGINT NULL,
  `or_or` VARCHAR(120) NULL,
  `or_valut_choice` VARCHAR(120) NULL,
  `or_orderid` VARCHAR(120) NULL,
  `or_eb` VARCHAR(120) NULL,
  `or_emp_receiver` VARCHAR(120) NULL,
  `or_tur_receiver` VARCHAR(120) NULL,
  `or_org_id` BIGINT NULL,
  `trtypename` VARCHAR(120) NULL,
  `trtype` VARCHAR(120) NULL,
  `uitranstypename` VARCHAR(120) NULL,
  `organization` VARCHAR(120) NULL,
  `roomid` VARCHAR(120) NULL,
  `userid` VARCHAR(120) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE SZardal (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `z_num` VARCHAR(120) NULL,
  `z_barimt` VARCHAR(120) NULL,
  `z_tosov_code` VARCHAR(120) NULL,
  `z_tosov_zuil` VARCHAR(120) NULL,
  `z_taibar` VARCHAR(120) NULL,
  `z_angilal_b` VARCHAR(120) NULL,
  `z_angilal` VARCHAR(120) NULL,
  `z_torol` VARCHAR(120) NULL,
  `z_utga` VARCHAR(120) NULL,
  `z_from` VARCHAR(120) NULL,
  `z_emp_receiver` VARCHAR(120) NULL,
  `z_tur_receiver` VARCHAR(120) NULL,
  `z_other_receiver` VARCHAR(120) NULL,
  `z_org_id` BIGINT NULL,
  `z_date` DATE NULL,
  `z` VARCHAR(120) NULL,
  `z_valut_choice` VARCHAR(120) NULL,
  `z_mat_code` VARCHAR(120) NULL,
  `z_tailbar1` VARCHAR(120) NULL,
  `z_eb` VARCHAR(120) NULL,
  `z_orderid` VARCHAR(120) NULL,
  `z_month` VARCHAR(120) NULL,
  `z_noat_oor_month` VARCHAR(120) NULL,
  `zar_uglug_eseh_code` VARCHAR(120) NULL,
  `zar_uglug_month` VARCHAR(120) NULL,
  `trtypename` VARCHAR(120) NULL,
  `trtype` VARCHAR(120) NULL,
  `uitranstypename` VARCHAR(120) NULL,
  `organization` VARCHAR(120) NULL,
  `roomid` VARCHAR(120) NULL,
  `userid` VARCHAR(120) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE tusuv (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `tus_num` VARCHAR(120) NULL,
  `tus_pid` VARCHAR(120) NULL,
  `tus_cid` VARCHAR(120) NULL,
  `tus_tid` VARCHAR(120) NULL,
  `tus_pmid` VARCHAR(120) NULL,
  `tus_acc` VARCHAR(120) NULL,
  `tus_sub` VARCHAR(120) NULL,
  `tus_prod` VARCHAR(120) NULL,
  `tus_annot` VARCHAR(120) NULL,
  `tus_date` DATE NULL,
  `tus_sellerid` VARCHAR(120) NULL,
  `tus_empid` VARCHAR(120) NULL,
  `tus_orderedp` VARCHAR(120) NULL,
  `tus_orderid` VARCHAR(120) NULL,
  `tus_orderdid` VARCHAR(120) NULL,
  `tus_branchid` VARCHAR(120) NULL,
  `tus_consumerid` VARCHAR(120) NULL,
  `tus_consumername` VARCHAR(120) NULL,
  `tus_coupcode` VARCHAR(120) NULL,
  `tus_return` VARCHAR(120) NULL,
  `tus_frombranchid` VARCHAR(120) NULL,
  `tus_avug` VARCHAR(120) NULL,
  `tus_dupercent` VARCHAR(120) NULL,
  `tus_frombranch_barimt` VARCHAR(120) NULL,
  `trtypename` VARCHAR(120) NULL,
  `trtype` VARCHAR(120) NULL,
  `uitranstypename` VARCHAR(120) NULL,
  `organization` VARCHAR(120) NULL,
  `roomid` VARCHAR(120) NULL,
  `userid` VARCHAR(120) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE BMBurtgel (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `bmtr_num` VARCHAR(120) NULL,
  `bmtr_pid` VARCHAR(120) NULL,
  `bmtr_cid` VARCHAR(120) NULL,
  `bmtr_tid` VARCHAR(120) NULL,
  `bmtr_pmid` VARCHAR(120) NULL,
  `plan_day` VARCHAR(120) NULL,
  `source` VARCHAR(120) NULL,
  `req` VARCHAR(120) NULL,
  `payment` VARCHAR(120) NULL,
  `bmtr_acc` VARCHAR(120) NULL,
  `bmtr_sub` VARCHAR(120) NULL,
  `bmtr_prod` VARCHAR(120) NULL,
  `bmtr_annot` VARCHAR(120) NULL,
  `bmtr_date` DATE NULL,
  `bmtr_sellerid` VARCHAR(120) NULL,
  `bmtr_seller` VARCHAR(120) NULL,
  `bmtr_empid` VARCHAR(120) NULL,
  `bmtr_orderedp` VARCHAR(120) NULL,
  `bmtr_orderid` VARCHAR(120) NULL,
  `bmtr_orderdid` VARCHAR(120) NULL,
  `bmtr_branchid` VARCHAR(120) NULL,
  `bmtr_consumerid` VARCHAR(120) NULL,
  `bmtr_consumername` VARCHAR(120) NULL,
  `bmtr_coupcode` VARCHAR(120) NULL,
  `bmtr_return` VARCHAR(120) NULL,
  `bmtr_frombranchid` VARCHAR(120) NULL,
  `bmtr_avug` VARCHAR(120) NULL,
  `bmtr_dupercent` VARCHAR(120) NULL,
  `bmtr_frombranch_barimt` VARCHAR(120) NULL,
  `trtypename` VARCHAR(120) NULL,
  `trtype` VARCHAR(120) NULL,
  `uitranstypename` VARCHAR(120) NULL,
  `organization` VARCHAR(120) NULL,
  `roomid` VARCHAR(120) NULL,
  `userid` VARCHAR(120) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE MMorder (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `ordrid` VARCHAR(120) NULL,
  `ordrdid` VARCHAR(120) NULL,
  `ordrcustomerid` VARCHAR(120) NULL,
  `ordrcustomername` VARCHAR(120) NULL,
  `ordrrd` VARCHAR(120) NULL,
  `ordradd` VARCHAR(120) NULL,
  `ordrphone` VARCHAR(120) NULL,
  `ordrdate` DATE NULL,
  `ordrsource` VARCHAR(120) NULL,
  `ordrtooutdate` DATE NULL,
  `ordrpayment` VARCHAR(120) NULL,
  `ordrprodid` VARCHAR(120) NULL,
  `ordrbname` VARCHAR(120) NULL,
  `ordrsub` VARCHAR(120) NULL,
  `ordrmu` VARCHAR(120) NULL,
  `ordrsize` VARCHAR(120) NULL,
  `ordrlen` VARCHAR(120) NULL,
  `ordrwidth` VARCHAR(120) NULL,
  `ordrthick` VARCHAR(120) NULL,
  `ordrmat` VARCHAR(120) NULL,
  `ordrpaint` VARCHAR(120) NULL,
  `ordrcolor` VARCHAR(120) NULL,
  `ordrcarving` VARCHAR(120) NULL,
  `ordraccs` VARCHAR(120) NULL,
  `ordrbkod` VARCHAR(120) NULL,
  `ordrpriceoffer` VARCHAR(120) NULL,
  `ordrretailsel` VARCHAR(120) NULL,
  `ordrwholesalesel` VARCHAR(120) NULL,
  `ordrprodsel` VARCHAR(120) NULL,
  `ordrunitprice` VARCHAR(120) NULL,
  `ordrsalepercent` VARCHAR(120) NULL,
  `ordrsaleap` VARCHAR(120) NULL,
  `ordrnoatyn` VARCHAR(120) NULL,
  `ordrpriceofferdate` DATE NULL,
  `ordrpriceaccdate` DATE NULL,
  `ordrordrconfirmed` VARCHAR(120) NULL,
  `ordrconfirmdate` DATE NULL,
  `ordrproddays` VARCHAR(120) NULL,
  `ordrreceivedid` VARCHAR(120) NULL,
  `ordrtoproddate` DATE NULL,
  `ordrout` VARCHAR(120) NULL,
  `ordroutdate` DATE NULL,
  `ordrtransportprice` VARCHAR(120) NULL,
  `ordrassemblyprice` VARCHAR(120) NULL,
  `ordrcomments` VARCHAR(120) NULL,
  `ordrproddate` DATE NULL,
  `width` VARCHAR(120) NULL,
  `thickness` VARCHAR(120) NULL,
  `trtype` VARCHAR(120) NULL,
  `uitranstypename` VARCHAR(120) NULL,
  `organization` VARCHAR(120) NULL,
  `roomid` VARCHAR(120) NULL,
  `userid` VARCHAR(120) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE SGereeJ (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `g_id` BIGINT NULL,
  `g_burtgel_id` BIGINT NULL,
  `g_chig` VARCHAR(120) NULL,
  `g_torol` VARCHAR(120) NULL,
  `g_daatgah` VARCHAR(120) NULL,
  `g_baritsaa_must` VARCHAR(120) NULL,
  `g_ab_tur` VARCHAR(120) NULL,
  `g_ab_huviin` VARCHAR(120) NULL,
  `g_sq` VARCHAR(120) NULL,
  `g_start` VARCHAR(120) NULL,
  `g_end` VARCHAR(120) NULL,
  `g_desc` VARCHAR(120) NULL,
  `trtypename` VARCHAR(120) NULL,
  `trtype` VARCHAR(120) NULL,
  `uitranstypename` VARCHAR(120) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- Users table for authentication
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `company` VARCHAR(100) DEFAULT 'ModMarket ХХК',
  `role` ENUM('admin','user') DEFAULT 'user',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Dynamic form submissions storage
CREATE TABLE IF NOT EXISTS `form_submissions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `form_id` VARCHAR(100) NOT NULL,
  `data` JSON NOT NULL,
  `submitted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Seed initial admin user with known password 'Admin@123'
-- Generate hash via Node: `require('bcrypt').hash('Admin@123', 10, console.log)`
INSERT INTO `users` (`email`, `password`, `name`, `company`, `role`)
VALUES (
  'admin@modmarket.mn',
  '$2b$10$Z9s94pu0QEKnn1J8/p36Xuw3ULxX5gE/UfjTXyW6uxS0921gys8wu',  -- hash for 'Admin@123'
  'Administrator',
  'ModMarket ХХК',
  'admin'
);

CREATE TABLE companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  /* …any company-wide settings… */
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE user_companies (
  user_id     INT                       NOT NULL,
  company_id  INT                       NOT NULL,
  empid       VARCHAR(50)               NOT NULL,
  role        ENUM('user','admin')      NOT NULL DEFAULT 'user',
  PRIMARY KEY (user_id, company_id),
  UNIQUE KEY ux_company_empid (company_id, empid),
  FOREIGN KEY (user_id)    REFERENCES users(id),
  FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB;

ALTER TABLE users
  ADD COLUMN created_by VARCHAR(50) NOT NULL AFTER password,
  ADD CONSTRAINT fk_users_created_by
    FOREIGN KEY (created_by) REFERENCES users(empid);

ALTER TABLE users
  ADD COLUMN created_by INT    NOT NULL AFTER password,
  ADD FOREIGN KEY (created_by) REFERENCES users(id);

ALTER TABLE user_companies
  ADD COLUMN updated_at DATETIME
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
    AFTER created_at;

### 3. Recommended Architecture & Configuration Enhancements
To support a **main user** who:
1. **Creates Companies**
2. **Manages Licenses** (enable/disable modules per company after payment)
3. **Assigns & Manages Company Users**

Consider the following structure and patterns:

#### 3.1 Database Schema Extensions
```sql
-- Companies table holds tenant records
CREATE TABLE companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  owner_user_id INT NOT NULL,         -- main user relationship
  created_at DATETIME DEFAULT NOW()
);

-- License plans definitions
CREATE TABLE license_plans (
  id INT PRIMARY KEY,
  name VARCHAR(50),                   -- Basic, Intermediate, Advanced
  modules JSON,                       -- ["finance","reports",…]
  price DECIMAL(10,2)
);

-- Company licenses after purchase
CREATE TABLE company_licenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT REFERENCES companies(id),
  plan_id INT REFERENCES license_plans(id),
  start_date DATETIME,
  end_date DATETIME,
  status ENUM('active','expired','cancelled')
);

-- Payments record for audit & webhook tracking
CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_license_id INT REFERENCES company_licenses(id),
  provider VARCHAR(50),               -- e.g. 'stripe'
  provider_payment_id VARCHAR(255),
  amount DECIMAL(10,2),
  currency VARCHAR(10),
  status VARCHAR(30),                 -- 'succeeded','pending','failed'
  created_at DATETIME DEFAULT NOW()
);