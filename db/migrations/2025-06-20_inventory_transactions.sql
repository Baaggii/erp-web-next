-- Basic coding tables for references
CREATE TABLE IF NOT EXISTS branches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_subs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  budget_id INT NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  FOREIGN KEY (budget_id) REFERENCES budgets(id)
);

CREATE TABLE IF NOT EXISTS inventories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS productions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_subs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL
);

-- Inventory transactions table
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transaction_date DATE NOT NULL,
  branch_id INT,
  employee_id INT,
  budget_id INT,
  budget_sub_id INT,
  transaction_id INT,
  inventory_id INT,
  production_id INT,
  order_id INT,
  order_sub_id INT,
  customer_id INT,
  qty DECIMAL(10,2),
  price DECIMAL(10,2),
  created_by VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES branches(id),
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  FOREIGN KEY (budget_id) REFERENCES budgets(id),
  FOREIGN KEY (budget_sub_id) REFERENCES budget_subs(id),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  FOREIGN KEY (inventory_id) REFERENCES inventories(id),
  FOREIGN KEY (production_id) REFERENCES productions(id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (order_sub_id) REFERENCES order_subs(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (created_by) REFERENCES users(empid)
);
