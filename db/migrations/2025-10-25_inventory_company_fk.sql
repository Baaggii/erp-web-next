-- Add company scoping to inventory-related tables

-- Parent tables
ALTER TABLE branches ADD COLUMN company_id INT NOT NULL; 
ALTER TABLE branches ADD UNIQUE KEY u_branches_company (company_id, id);

ALTER TABLE employees ADD COLUMN company_id INT NOT NULL;
ALTER TABLE employees ADD UNIQUE KEY u_employees_company (company_id, id);

ALTER TABLE products ADD COLUMN company_id INT NOT NULL;
ALTER TABLE products ADD UNIQUE KEY u_products_company (company_id, id);

ALTER TABLE budgets ADD COLUMN company_id INT NOT NULL;
ALTER TABLE budgets ADD UNIQUE KEY u_budgets_company (company_id, id);

ALTER TABLE budget_subs ADD COLUMN company_id INT NOT NULL;
ALTER TABLE budget_subs ADD UNIQUE KEY u_budget_subs_company (company_id, id);
ALTER TABLE budget_subs DROP FOREIGN KEY budget_subs_ibfk_1;
ALTER TABLE budget_subs
  ADD CONSTRAINT fk_budget_subs_budget FOREIGN KEY (company_id, budget_id)
    REFERENCES budgets (company_id, id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;

ALTER TABLE inventories ADD COLUMN company_id INT NOT NULL;
ALTER TABLE inventories ADD UNIQUE KEY u_inventories_company (company_id, id);

ALTER TABLE productions ADD COLUMN company_id INT NOT NULL;
ALTER TABLE productions ADD UNIQUE KEY u_productions_company (company_id, id);

ALTER TABLE orders ADD COLUMN company_id INT NOT NULL;
ALTER TABLE orders ADD UNIQUE KEY u_orders_company (company_id, id);

ALTER TABLE order_subs ADD COLUMN company_id INT NOT NULL;
ALTER TABLE order_subs ADD UNIQUE KEY u_order_subs_company (company_id, id);
ALTER TABLE order_subs DROP FOREIGN KEY order_subs_ibfk_1;
ALTER TABLE order_subs
  ADD CONSTRAINT fk_order_subs_order FOREIGN KEY (company_id, order_id)
    REFERENCES orders (company_id, id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;

ALTER TABLE customers ADD COLUMN company_id INT NOT NULL;
ALTER TABLE customers ADD UNIQUE KEY u_customers_company (company_id, id);

ALTER TABLE transactions ADD COLUMN company_id INT NOT NULL;
ALTER TABLE transactions ADD UNIQUE KEY u_transactions_company (company_id, id);

-- Child table
ALTER TABLE inventory_transactions
  ADD COLUMN company_id INT NOT NULL AFTER id,
  DROP FOREIGN KEY inventory_transactions_ibfk_1,
  DROP FOREIGN KEY inventory_transactions_ibfk_2,
  DROP FOREIGN KEY inventory_transactions_ibfk_3,
  DROP FOREIGN KEY inventory_transactions_ibfk_4,
  DROP FOREIGN KEY inventory_transactions_ibfk_5,
  DROP FOREIGN KEY inventory_transactions_ibfk_6,
  DROP FOREIGN KEY inventory_transactions_ibfk_7,
  DROP FOREIGN KEY inventory_transactions_ibfk_8,
  DROP FOREIGN KEY inventory_transactions_ibfk_9,
  DROP FOREIGN KEY inventory_transactions_ibfk_10,
  DROP FOREIGN KEY inventory_transactions_ibfk_11;

ALTER TABLE inventory_transactions
  ADD CONSTRAINT fk_it_branch FOREIGN KEY (company_id, branch_id)
    REFERENCES branches (company_id, id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_it_employee FOREIGN KEY (company_id, employee_id)
    REFERENCES employees (company_id, id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_it_budget FOREIGN KEY (company_id, budget_id)
    REFERENCES budgets (company_id, id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_it_budget_sub FOREIGN KEY (company_id, budget_sub_id)
    REFERENCES budget_subs (company_id, id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_it_transaction FOREIGN KEY (company_id, transaction_id)
    REFERENCES transactions (company_id, id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_it_inventory FOREIGN KEY (company_id, inventory_id)
    REFERENCES inventories (company_id, id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_it_production FOREIGN KEY (company_id, production_id)
    REFERENCES productions (company_id, id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_it_order FOREIGN KEY (company_id, order_id)
    REFERENCES orders (company_id, id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_it_order_sub FOREIGN KEY (company_id, order_sub_id)
    REFERENCES order_subs (company_id, id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_it_customer FOREIGN KEY (company_id, customer_id)
    REFERENCES customers (company_id, id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT fk_it_created_by FOREIGN KEY (created_by)
    REFERENCES users (empid)
    ON UPDATE CASCADE ON DELETE RESTRICT;
