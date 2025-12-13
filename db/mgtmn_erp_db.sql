-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Dec 09, 2025 at 06:29 PM
-- Server version: 8.0.43-cll-lve
-- PHP Version: 8.4.14

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `mgtmn_erp_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `audit_log`
--

CREATE TABLE `audit_log` (
  `id` int NOT NULL,
  `table_name` varchar(255) DEFAULT NULL,
  `action` varchar(10) DEFAULT NULL,
  `changed_at` datetime DEFAULT NULL,
  `changed_by` varchar(255) DEFAULT NULL,
  `row_id` varchar(100) DEFAULT NULL,
  `old_data` text,
  `new_data` text,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_band`
--

CREATE TABLE `code_band` (
  `band_id` bigint NOT NULL,
  `band_code` varchar(64) NOT NULL,
  `band_name` varchar(128) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `company_id` int NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_bayarodor`
--

CREATE TABLE `code_bayarodor` (
  `id` int NOT NULL,
  `fest_year` int NOT NULL,
  `fest_month` int NOT NULL,
  `fest_day` int DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_bkod`
--

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
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_bkodprim`
--

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
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `classification_code` varchar(10) DEFAULT NULL,
  `tax_type` enum('VATABLE','VAT_FREE','VAT_ZERO') DEFAULT 'VATABLE',
  `tax_reason_code` varchar(3) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_branches`
--

CREATE TABLE `code_branches` (
  `id` int NOT NULL,
  `branch_id` int NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_calendar_days`
--

CREATE TABLE `code_calendar_days` (
  `id` int NOT NULL,
  `company_id` int NOT NULL DEFAULT '0',
  `branch_id` int DEFAULT NULL,
  `date_day` date NOT NULL,
  `is_holiday` tinyint(1) NOT NULL DEFAULT '0',
  `is_weekend` tinyint(1) NOT NULL DEFAULT '0',
  `is_halfday` tinyint(1) NOT NULL DEFAULT '0',
  `name` varchar(100) DEFAULT NULL,
  `repeat_annually` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_cashier`
--

CREATE TABLE `code_cashier` (
  `id` int NOT NULL,
  `cahier_id` int NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_chiglel`
--

CREATE TABLE `code_chiglel` (
  `id` int NOT NULL,
  `chig_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_department`
--

CREATE TABLE `code_department` (
  `id` int NOT NULL,
  `department_id` int DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_edhorongo`
--

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
  `category` int DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_edhorongo_other`
--

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
  `error_description` varchar(255) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_expenseangilal`
--

CREATE TABLE `code_expenseangilal` (
  `id` int NOT NULL,
  `exp_angilal_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_expensebalancetype`
--

CREATE TABLE `code_expensebalancetype` (
  `id` int NOT NULL,
  `exp_balance_angilal_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_expensebaltype`
--

CREATE TABLE `code_expensebaltype` (
  `id` int NOT NULL,
  `k1` int NOT NULL,
  `k2` int NOT NULL,
  `k3` int NOT NULL,
  `k4` int NOT NULL,
  `k5` int NOT NULL,
  `k6_` int NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_expensetype`
--

CREATE TABLE `code_expensetype` (
  `id` int NOT NULL,
  `expense_type` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_expenseutga`
--

CREATE TABLE `code_expenseutga` (
  `id` int NOT NULL,
  `expense_utga_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_frequency`
--

CREATE TABLE `code_frequency` (
  `id` int NOT NULL,
  `frequency_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_incometype`
--

CREATE TABLE `code_incometype` (
  `id` int NOT NULL,
  `income_type_id` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `isreceivable` tinyint(1) NOT NULL DEFAULT '0',
  `isaverage` tinyint(1) NOT NULL DEFAULT '0',
  `company_id` int NOT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `classification_code` varchar(10) DEFAULT NULL COMMENT 'POSAPI classification code',
  `tax_type` enum('VATABLE','VAT_FREE','VAT_ZERO') DEFAULT 'VATABLE',
  `tax_reason_code` varchar(3) DEFAULT NULL COMMENT 'Reason code for VAT‑free or zero‑rated services'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_income_priority`
--

CREATE TABLE `code_income_priority` (
  `id` int NOT NULL,
  `utility_id` int NOT NULL,
  `priority_order` int NOT NULL,
  `is_base` tinyint(1) NOT NULL DEFAULT '0',
  `company_id` int NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_initiator`
--

CREATE TABLE `code_initiator` (
  `id` int NOT NULL,
  `initiator` int NOT NULL,
  `description` varchar(255) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_material`
--

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
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_materialprim`
--

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
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `classification_code` varchar(10) DEFAULT NULL,
  `tax_type` enum('VATABLE','VAT_FREE','VAT_ZERO') DEFAULT 'VATABLE',
  `tax_reason_code` varchar(3) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_orav_eseh`
--

CREATE TABLE `code_orav_eseh` (
  `id` int NOT NULL,
  `av_eseh` int NOT NULL,
  `av_eseh_desctiption` varchar(50) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_penalty`
--

CREATE TABLE `code_penalty` (
  `id` int NOT NULL,
  `penalty_id` int NOT NULL,
  `penalty_name` varchar(255) NOT NULL,
  `penalty_type` varchar(255) NOT NULL,
  `penalty_interestperday` int NOT NULL DEFAULT '5',
  `penalty_maxinterest` int NOT NULL DEFAULT '50',
  `penalty_startdayofmonth` int NOT NULL DEFAULT '26',
  `penalty_incometype` int DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_position`
--

CREATE TABLE `code_position` (
  `id` int NOT NULL,
  `position_id` int NOT NULL,
  `position_name` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `position_amcode` varchar(7) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_position_other`
--

CREATE TABLE `code_position_other` (
  `id` int NOT NULL,
  `workplace_id` int DEFAULT NULL,
  `workplace_ner` varchar(28) DEFAULT NULL,
  `workplace_position_id` int DEFAULT NULL,
  `error_description` varchar(255) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_reason`
--

CREATE TABLE `code_reason` (
  `id` int NOT NULL,
  `reason_id` int NOT NULL,
  `reason` varchar(255) NOT NULL,
  `is_respectful` tinyint(1) NOT NULL DEFAULT '0',
  `company_id` int NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Гэрээ цуцлах, бусад шалтгаан тодорхойлох шаардлагатай үед';

-- --------------------------------------------------------

--
-- Table structure for table `code_room`
--

CREATE TABLE `code_room` (
  `id` int NOT NULL,
  `room_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_status`
--

CREATE TABLE `code_status` (
  `id` int NOT NULL,
  `status` varchar(64) NOT NULL,
  `description` varchar(255) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_talbai`
--

CREATE TABLE `code_talbai` (
  `id` int NOT NULL,
  `talbai_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_torol`
--

CREATE TABLE `code_torol` (
  `id` int NOT NULL,
  `torol_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `uses_sqm` decimal(5,2) NOT NULL COMMENT 'Ашиглах м2',
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_transaction`
--

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
  `new_inv_code_allowed` tinyint(1) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_unit`
--

CREATE TABLE `code_unit` (
  `id` int NOT NULL,
  `unit_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `unit` varchar(10) DEFAULT NULL,
  `Unitcode_wood` int DEFAULT NULL,
  `Unitcode_nonwood` int DEFAULT NULL,
  `per_sqm` tinyint(1) DEFAULT NULL,
  `per_ab` tinyint(1) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_userlevel_settings`
--

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
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_utility`
--

CREATE TABLE `code_utility` (
  `utility_id` bigint NOT NULL,
  `utility_code` varchar(64) NOT NULL,
  `utility_name` varchar(128) NOT NULL,
  `utility_mu` int NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `company_id` int NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_utility_band`
--

CREATE TABLE `code_utility_band` (
  `utility_id` bigint NOT NULL,
  `band_id` bigint NOT NULL,
  `is_allowed` tinyint(1) NOT NULL DEFAULT '1',
  `company_id` int NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_utility_rates`
--

CREATE TABLE `code_utility_rates` (
  `rate_id` bigint NOT NULL,
  `uchig_id` int DEFAULT NULL,
  `utorol_id` int DEFAULT NULL,
  `utility_id` bigint NOT NULL,
  `band_id` bigint NOT NULL,
  `effective_from` date NOT NULL,
  `effective_to` date DEFAULT NULL,
  `unit_price` decimal(18,6) NOT NULL DEFAULT '0.000000',
  `eqip_lloss` decimal(5,2) DEFAULT NULL,
  `maintenance_per` decimal(5,2) DEFAULT NULL,
  `fixed_fee` decimal(18,2) NOT NULL DEFAULT '0.00',
  `per_unit` int DEFAULT NULL,
  `is_base` tinyint(1) NOT NULL DEFAULT '0',
  `penalty_interestperday` decimal(1,1) DEFAULT '0.5',
  `penalty_maxinterest` int DEFAULT '50',
  `penalty_startdayofmonth` int DEFAULT '26',
  `relatedto_incometype` int DEFAULT NULL,
  `require_bill_lines` tinyint(1) NOT NULL DEFAULT '1',
  `currency` char(3) NOT NULL DEFAULT 'MNT',
  `company_id` int NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `request_enabled` tinyint(1) DEFAULT '0',
  `request_requires_income` tinyint(1) DEFAULT '0',
  `request_requires_approval` tinyint(1) DEFAULT '0',
  `approver_config` json DEFAULT NULL,
  `print_template_id` bigint DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_valut`
--

CREATE TABLE `code_valut` (
  `id` int NOT NULL,
  `currency_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_violation`
--

CREATE TABLE `code_violation` (
  `id` int NOT NULL,
  `violation_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_week_config`
--

CREATE TABLE `code_week_config` (
  `id` int NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int DEFAULT NULL,
  `day_of_week` tinyint NOT NULL,
  `is_day_off` tinyint(1) NOT NULL DEFAULT '0',
  `effective_from` date NOT NULL,
  `effective_to` date DEFAULT NULL,
  `name` varchar(50) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_woodprocctype`
--

CREATE TABLE `code_woodprocctype` (
  `id` int NOT NULL,
  `proccessing_type_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_woodsort`
--

CREATE TABLE `code_woodsort` (
  `id` int NOT NULL,
  `sort_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_woodtype`
--

CREATE TABLE `code_woodtype` (
  `id` int NOT NULL,
  `woodtype_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `code_workplace`
--

CREATE TABLE `code_workplace` (
  `id` int NOT NULL,
  `company_id` int NOT NULL,
  `workplace_id` int NOT NULL,
  `workplace_name` varchar(50) NOT NULL,
  `position_id` int NOT NULL,
  `year` int DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `companies`
--

CREATE TABLE `companies` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `company_id` int NOT NULL DEFAULT '0',
  `Gov_Registration_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `Address` varchar(255) NOT NULL,
  `Telephone` varchar(50) NOT NULL,
  `website` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `company_licenses`
--

CREATE TABLE `company_licenses` (
  `id` int NOT NULL,
  `company_id` int DEFAULT NULL,
  `plan_id` int DEFAULT NULL,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `status` enum('active','expired','cancelled') DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `company_module_licenses`
--

CREATE TABLE `company_module_licenses` (
  `company_id` int NOT NULL,
  `module_key` varchar(50) NOT NULL,
  `licensed` tinyint(1) DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `contract1`
--

CREATE TABLE `contract1` (
  `id` int NOT NULL,
  `g_num` varchar(50) NOT NULL,
  `g_id` int NOT NULL,
  `g_chig` int NOT NULL,
  `g_torol` int NOT NULL,
  `g_sq` decimal(15,2) NOT NULL,
  `g_start` date NOT NULL,
  `g_end` date NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `department_id` int NOT NULL,
  `g_burtgel_id` int DEFAULT NULL,
  `g_daatgah` double(15,2) DEFAULT NULL,
  `g_baritsaa_must` double(15,2) DEFAULT NULL,
  `g_ab_tur` int DEFAULT NULL,
  `g_ab_huviin` int DEFAULT NULL,
  `g_cancel` date DEFAULT NULL,
  `g_desc` varchar(255) DEFAULT NULL,
  `baitsaagch_id` varchar(50) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `TRTYPENAME` varchar(100) DEFAULT NULL,
  `trtype` varchar(4) DEFAULT NULL,
  `TransType` int DEFAULT NULL,
  `ROOMID` varchar(10) DEFAULT NULL,
  `USERID` varchar(10) DEFAULT NULL,
  `count` int DEFAULT NULL,
  `state` int DEFAULT NULL,
  `transbranch` int DEFAULT NULL,
  `contract_id` varchar(24) DEFAULT NULL,
  `confirm` int DEFAULT NULL,
  `confirm_date` date DEFAULT NULL,
  `confirm_emp` varchar(11) DEFAULT NULL,
  `edit_date` date DEFAULT NULL,
  `edit_emp` varchar(8) DEFAULT NULL,
  `edit_cause` varchar(1000) DEFAULT NULL,
  `del_date` date DEFAULT NULL,
  `del_emp` varchar(10) DEFAULT NULL,
  `del_cause` varchar(1000) DEFAULT NULL,
  `check_date` date DEFAULT NULL,
  `checkyn` varchar(10) DEFAULT NULL,
  `check_emp` varchar(10) DEFAULT NULL,
  `check_cause` varchar(1000) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` varchar(50) NOT NULL DEFAULT 'system',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `contractor_request`
--

CREATE TABLE `contractor_request` (
  `request_id` bigint NOT NULL,
  `contract_g_id` int NOT NULL,
  `util_id` bigint NOT NULL,
  `band_id` bigint NOT NULL,
  `request_type` varchar(50) NOT NULL,
  `description` text,
  `requires_income` tinyint(1) DEFAULT '0',
  `requires_approval` tinyint(1) DEFAULT '0',
  `print_conditions` json DEFAULT NULL,
  `status` enum('open','pending_income','pending_approval','ready_to_print','printed','closed') DEFAULT 'open',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `contract_receivable_cache`
--

CREATE TABLE `contract_receivable_cache` (
  `g_id` int NOT NULL,
  `rec` decimal(18,2) DEFAULT NULL,
  `pen` decimal(18,2) DEFAULT NULL,
  `final` decimal(18,2) DEFAULT NULL,
  `unpaid` decimal(18,2) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ebarimt_api_log`
--

CREATE TABLE `ebarimt_api_log` (
  `id` int NOT NULL,
  `invoice_id` int DEFAULT NULL,
  `action` varchar(50) DEFAULT NULL,
  `request_payload` text,
  `response_payload` text,
  `response_code` varchar(10) DEFAULT NULL,
  `error_code` int DEFAULT NULL,
  `error_message` text,
  `attempt_no` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `notes` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ebarimt_customer`
--

CREATE TABLE `ebarimt_customer` (
  `id` int NOT NULL,
  `customer_type` enum('BUSINESS','INDIVIDUAL') DEFAULT 'BUSINESS',
  `name` varchar(255) NOT NULL,
  `registration_no` varchar(20) DEFAULT NULL,
  `tin` varchar(14) DEFAULT NULL,
  `ebarimt_consumer_no` varchar(20) DEFAULT NULL,
  `address` text,
  `contact_info` text,
  `buyer_name` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ebarimt_invoice`
--

CREATE TABLE `ebarimt_invoice` (
  `id` int NOT NULL,
  `invoice_no` varchar(50) NOT NULL,
  `bill_id_suffix` varchar(6) DEFAULT NULL,
  `type` enum('B2C','B2B') NOT NULL DEFAULT 'B2C',
  `customer_tin` varchar(14) DEFAULT NULL,
  `consumer_no` varchar(20) DEFAULT NULL,
  `total_amount` decimal(12,2) NOT NULL,
  `total_vat` decimal(12,2) DEFAULT NULL,
  `total_city_tax` decimal(12,2) DEFAULT NULL,
  `total_bonus` decimal(12,2) DEFAULT NULL,
  `receipt_date` datetime NOT NULL,
  `ebarimt_id` varchar(33) DEFAULT NULL,
  `status` enum('PENDING','SENDING','REGISTERED','FAILED','CANCELLED') DEFAULT 'PENDING',
  `error_code` int DEFAULT NULL,
  `error_message` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `merchant_id` int NOT NULL,
  `ebarimt_date` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ebarimt_invoice_item`
--

CREATE TABLE `ebarimt_invoice_item` (
  `id` int NOT NULL,
  `invoice_id` int DEFAULT NULL,
  `product_code` varchar(50) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `measure_unit` varchar(50) DEFAULT NULL,
  `quantity` decimal(12,2) NOT NULL,
  `unit_price` decimal(12,2) NOT NULL,
  `total_amount` decimal(12,2) NOT NULL,
  `vat_amount` decimal(12,2) DEFAULT NULL,
  `city_tax_amount` decimal(12,2) DEFAULT NULL,
  `bonus_amount` decimal(12,2) DEFAULT NULL,
  `barcode_text` varchar(50) DEFAULT NULL,
  `barcode_type` enum('EAN13','CODE128','QRCODE','UNDEFINED') DEFAULT 'UNDEFINED',
  `classification_code` varchar(10) DEFAULT NULL,
  `tax_product_code` varchar(10) DEFAULT NULL,
  `tax_type` enum('VAT_ABLE','VAT_FREE','VAT_ZERO') DEFAULT 'VAT_ABLE',
  `item_data_json` json DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ebarimt_invoice_payment`
--

CREATE TABLE `ebarimt_invoice_payment` (
  `id` int NOT NULL,
  `invoice_id` int DEFAULT NULL,
  `payment_code` enum('CASH','PAYMENT_CARD','BANK_TRANSFER','MOBILE_WALLET') NOT NULL DEFAULT 'CASH',
  `payment_status` enum('PAID','PAY','REVERSED','ERROR') DEFAULT 'PAID',
  `amount` decimal(12,2) NOT NULL,
  `exchange_code` varchar(50) DEFAULT NULL,
  `payment_data_json` json DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ebarimt_reference_code`
--

CREATE TABLE `ebarimt_reference_code` (
  `id` int NOT NULL,
  `code_type` enum('district','classification','tax_reason','barcode_type','payment_code') NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `description_mn` varchar(255) DEFAULT NULL,
  `description_en` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `forms`
--

CREATE TABLE `forms` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `schema_json` json NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `form_submissions`
--

CREATE TABLE `form_submissions` (
  `id` int NOT NULL,
  `form_id` varchar(100) NOT NULL,
  `data` json NOT NULL,
  `submitted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `international_code`
--

CREATE TABLE `international_code` (
  `code` varchar(10) NOT NULL,
  `name` text NOT NULL,
  `code_type` enum('GS1','ISBN','UNDEFINED') NOT NULL,
  `tax_type` enum('VATABLE','VAT_FREE','VAT_ZERO') NOT NULL,
  `tax_reason_code` varchar(3) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Stand-in structure for view `InventoryStockPerBranch`
-- (See below for the actual view)
--
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

-- --------------------------------------------------------

--
-- Stand-in structure for view `InventoryStockPerCompany`
-- (See below for the actual view)
--
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

-- --------------------------------------------------------

--
-- Stand-in structure for view `InventoryTransactionView`
-- (See below for the actual view)
--
CREATE TABLE `InventoryTransactionView` (
);

-- --------------------------------------------------------

--
-- Table structure for table `license_plans`
--

CREATE TABLE `license_plans` (
  `id` int NOT NULL,
  `name` varchar(50) DEFAULT NULL,
  `modules` json DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `merchant`
--

CREATE TABLE `merchant` (
  `id` int NOT NULL,
  `company_id` int NOT NULL,
  `merchant_name` varchar(255) NOT NULL,
  `tax_registration_no` varchar(14) NOT NULL,
  `branch_no` varchar(10) DEFAULT NULL,
  `district_code` varchar(4) DEFAULT NULL,
  `pos_no` varchar(10) DEFAULT NULL,
  `pos_registration_no` varchar(20) DEFAULT NULL,
  `device_mac` varchar(17) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `modules`
--

CREATE TABLE `modules` (
  `id` int NOT NULL,
  `module_key` varchar(50) NOT NULL,
  `label` varchar(100) NOT NULL,
  `parent_key` varchar(50) DEFAULT NULL,
  `show_in_sidebar` tinyint(1) DEFAULT '1',
  `show_in_header` tinyint(1) DEFAULT '0',
  `company_id` int NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Triggers `modules`
--
DELIMITER $$
CREATE TRIGGER `log_update_modules` AFTER UPDATE ON `modules` FOR EACH ROW INSERT INTO audit_log (table_name, action, changed_at, row_id, old_data, new_data)
VALUES ('modules', 'UPDATE', NOW(), OLD.module_key, OLD.label, NEW.label)
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `notification_id` bigint NOT NULL,
  `recipient_empid` varchar(10) NOT NULL,
  `type` enum('request','response') NOT NULL,
  `related_id` bigint NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payments`
--

CREATE TABLE `payments` (
  `id` int NOT NULL,
  `company_license_id` int DEFAULT NULL,
  `provider` varchar(50) DEFAULT NULL,
  `provider_payment_id` varchar(255) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `status` varchar(30) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `pending_request`
--

CREATE TABLE `pending_request` (
  `request_id` bigint NOT NULL,
  `table_name` varchar(100) NOT NULL,
  `record_id` varchar(191) NOT NULL,
  `emp_id` varchar(10) NOT NULL,
  `senior_empid` varchar(10) NOT NULL,
  `request_type` enum('edit','delete','report_approval') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `request_reason` text NOT NULL,
  `proposed_data` json DEFAULT NULL,
  `original_data` json DEFAULT NULL,
  `status` enum('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `responded_at` timestamp NULL DEFAULT NULL,
  `response_empid` varchar(10) DEFAULT NULL,
  `response_notes` text,
  `is_pending` tinyint(1) GENERATED ALWAYS AS ((case when (`status` = _utf8mb4'pending') then 1 else NULL end)) STORED,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `pos_session`
--

CREATE TABLE `pos_session` (
  `id` bigint UNSIGNED NOT NULL,
  `session_uuid` varchar(36) NOT NULL,
  `company_id` bigint NOT NULL,
  `branch_id` bigint NOT NULL,
  `merchant_id` bigint NOT NULL,
  `pos_no` varchar(32) NOT NULL,
  `device_uuid` varchar(64) DEFAULT NULL,
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at` datetime DEFAULT NULL,
  `current_user_id` bigint DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `report_approvals`
--

CREATE TABLE `report_approvals` (
  `id` bigint UNSIGNED NOT NULL,
  `company_id` int DEFAULT NULL,
  `request_id` bigint NOT NULL,
  `procedure_name` varchar(191) NOT NULL,
  `parameters_json` json NOT NULL,
  `approved_by` varchar(64) DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `snapshot_file_path` varchar(255) DEFAULT NULL,
  `snapshot_file_name` varchar(191) DEFAULT NULL,
  `snapshot_file_mime` varchar(64) DEFAULT NULL,
  `snapshot_file_size` bigint DEFAULT NULL,
  `snapshot_archived_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `report_definitions`
--

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
  `company_id` int NOT NULL DEFAULT '2',
  `updated_by` varchar(50) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `report_income_plan`
--

CREATE TABLE `report_income_plan` (
  `id` int NOT NULL,
  `company_id` int DEFAULT NULL,
  `branch_id` int DEFAULT NULL,
  `report_year` int DEFAULT NULL,
  `report_month` tinyint DEFAULT NULL,
  `income_type_id` int DEFAULT NULL,
  `income_type_name` varchar(255) DEFAULT NULL,
  `total_income` decimal(18,2) DEFAULT NULL,
  `billable_days_lastyear` int DEFAULT NULL,
  `avg_per_day` decimal(18,2) DEFAULT NULL,
  `plan_days` int DEFAULT NULL,
  `plan_value` decimal(18,2) DEFAULT NULL,
  `plan_percent` decimal(5,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `report_transaction_locks`
--

CREATE TABLE `report_transaction_locks` (
  `id` bigint UNSIGNED NOT NULL,
  `company_id` int DEFAULT NULL,
  `request_id` bigint NOT NULL,
  `table_name` varchar(128) NOT NULL,
  `record_id` varchar(191) NOT NULL,
  `status` enum('pending','locked') NOT NULL DEFAULT 'pending',
  `created_by` varchar(64) DEFAULT NULL,
  `status_changed_by` varchar(64) DEFAULT NULL,
  `status_changed_at` datetime DEFAULT NULL,
  `finalized_by` varchar(64) DEFAULT NULL,
  `finalized_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `request_approvers`
--

CREATE TABLE `request_approvers` (
  `id` bigint NOT NULL,
  `request_id` bigint NOT NULL,
  `position_id` bigint NOT NULL,
  `workplace_id` bigint NOT NULL,
  `status` enum('pending','approved','declined') DEFAULT 'pending',
  `approved_at` datetime DEFAULT NULL,
  `approved_by` bigint DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `request_print_form`
--

CREATE TABLE `request_print_form` (
  `id` bigint NOT NULL,
  `template_path` varchar(255) NOT NULL,
  `description` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `request_seen_counts`
--

CREATE TABLE `request_seen_counts` (
  `emp_id` varchar(10) NOT NULL,
  `incoming_pending` int NOT NULL DEFAULT '0',
  `incoming_accepted` int NOT NULL DEFAULT '0',
  `incoming_declined` int NOT NULL DEFAULT '0',
  `outgoing_accepted` int NOT NULL DEFAULT '0',
  `outgoing_declined` int NOT NULL DEFAULT '0',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `role_default_modules`
--

CREATE TABLE `role_default_modules` (
  `id` int NOT NULL,
  `role_id` int NOT NULL,
  `module_key` varchar(50) NOT NULL,
  `allowed` tinyint(1) DEFAULT '1',
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `role_module_permissions`
--

CREATE TABLE `role_module_permissions` (
  `company_id` int NOT NULL,
  `position_id` int NOT NULL,
  `module_key` varchar(50) NOT NULL,
  `allowed` tinyint(1) DEFAULT '1',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `seq_0_to_30`
--

CREATE TABLE `seq_0_to_30` (
  `num` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `service_coding`
--

CREATE TABLE `service_coding` (
  `id` int NOT NULL,
  `classification_code` varchar(10) NOT NULL,
  `name` text NOT NULL,
  `tax_type` enum('VATABLE','VAT_FREE','VAT_ZERO') NOT NULL,
  `tax_reason_code` varchar(3) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_beltgenniiluulegch`
--

CREATE TABLE `tbl_beltgenniiluulegch` (
  `id` int NOT NULL,
  `manuf_id` varchar(10) NOT NULL,
  `manuf_agrdate` date DEFAULT NULL,
  `manuf_agrenddate` date DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_bills`
--

CREATE TABLE `tbl_bills` (
  `bill_id` bigint NOT NULL,
  `contract_id` bigint DEFAULT NULL,
  `contract_number` varchar(64) DEFAULT NULL,
  `bill_no` varchar(64) DEFAULT NULL,
  `bill_date` date DEFAULT NULL,
  `period_start` date DEFAULT NULL,
  `period_end` date DEFAULT NULL,
  `currency` char(3) NOT NULL DEFAULT 'MNT',
  `status` enum('draft','approved','paid') NOT NULL DEFAULT 'draft',
  `total_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `company_id` int NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_bill_lines`
--

CREATE TABLE `tbl_bill_lines` (
  `line_id` bigint NOT NULL,
  `bill_id` bigint DEFAULT NULL,
  `request_id` bigint DEFAULT NULL,
  `bill_no` varchar(64) DEFAULT NULL,
  `contract_number` int DEFAULT NULL,
  `isnew_equipment` tinyint(1) DEFAULT '0',
  `bill_date` date NOT NULL,
  `period_start` date DEFAULT NULL,
  `period_end` date DEFAULT NULL,
  `currency` char(3) DEFAULT NULL,
  `utility_id` bigint NOT NULL,
  `band_id` bigint NOT NULL,
  `is_allowed` tinyint(1) DEFAULT NULL,
  `reading_prev` decimal(18,6) DEFAULT NULL,
  `reading_curr` decimal(18,6) DEFAULT NULL,
  `qty` decimal(18,6) DEFAULT NULL,
  `unit` int DEFAULT NULL,
  `unit_price` decimal(18,6) NOT NULL DEFAULT '0.000000',
  `fixed_fee` decimal(18,2) NOT NULL DEFAULT '0.00',
  `amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `note` varchar(255) DEFAULT NULL,
  `party_name` varchar(255) DEFAULT NULL,
  `source_sheet` varchar(128) DEFAULT NULL,
  `company_id` int NOT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Triggers `tbl_bill_lines`
--
DELIMITER $$
CREATE TRIGGER `trg_tbl_bill_lines_before_insert` BEFORE INSERT ON `tbl_bill_lines` FOR EACH ROW BEGIN
  DECLARE v_prev DECIMAL(18,6);

  CALL sp_get_previous_reading(
    NEW.contract_number,
    NEW.utility_id,
    NEW.band_id,
    NEW.bill_date,
    NEW.period_end,
    v_prev
  );

  SET NEW.reading_prev = v_prev;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_tbl_bill_lines_bi` BEFORE INSERT ON `tbl_bill_lines` FOR EACH ROW BEGIN
    DECLARE v_allowed TINYINT;

    CALL sp_check_billline_allowed(
        NEW.utility_id,
        NEW.band_id,
        v_allowed
    );

    SET NEW.is_allowed = v_allowed;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_tbl_bill_lines_bu` BEFORE UPDATE ON `tbl_bill_lines` FOR EACH ROW BEGIN
    DECLARE v_allowed TINYINT;

    CALL sp_check_billline_allowed(
        NEW.utility_id,
        NEW.band_id,
        v_allowed
    );

    SET NEW.is_allowed = v_allowed;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_contracter`
--

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
  `company_id` int NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_currate`
--

CREATE TABLE `tbl_currate` (
  `id` int NOT NULL,
  `Valutid` int NOT NULL,
  `CurDate` date NOT NULL,
  `ratenum` int NOT NULL,
  `Crate` decimal(10,2) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_discount`
--

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
  `sp_total_discount` decimal(18,4) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Triggers `tbl_discount`
--
DELIMITER $$
CREATE TRIGGER `trg_resolve_discount_inventory_metadata` BEFORE INSERT ON `tbl_discount` FOR EACH ROW BEGIN
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
    NEW.inventory_code,
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
CREATE TRIGGER `trg_resolve_discount_inventory_metadata_update` BEFORE UPDATE ON `tbl_discount` FOR EACH ROW BEGIN
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
    NEW.inventory_code,
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

-- --------------------------------------------------------

--
-- Table structure for table `tbl_discount_other`
--

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
  `error_description` varchar(255) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_employee`
--

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
  `emp_TTD` varchar(20) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_employment`
--

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
  `employment_senior_plan_empid` varchar(20) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_employment_other`
--

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
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_employment_schedule`
--

CREATE TABLE `tbl_employment_schedule` (
  `id` int NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `workplace_id` int NOT NULL,
  `emp_id` varchar(4) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `department_id` int NOT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_expenseorg`
--

CREATE TABLE `tbl_expenseorg` (
  `id` int NOT NULL,
  `z_org_id` varchar(10) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_hongololt`
--

CREATE TABLE `tbl_hongololt` (
  `id` int NOT NULL,
  `hon_g_id` int NOT NULL,
  `hon_startdate` date DEFAULT NULL,
  `hon_enddate` date DEFAULT NULL,
  `hon_year` int NOT NULL,
  `hon_month` int NOT NULL,
  `hon_per` decimal(5,2) DEFAULT NULL,
  `hon_size` decimal(10,2) DEFAULT NULL,
  `tushaalnum` varchar(255) DEFAULT NULL,
  `decidedby` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_hongololt_backup`
--

CREATE TABLE `tbl_hongololt_backup` (
  `id` int NOT NULL DEFAULT '0',
  `hon_g_id` int NOT NULL,
  `hon_startdate` date DEFAULT NULL,
  `hon_enddate` date DEFAULT NULL,
  `hon_year` int NOT NULL,
  `hon_month` int NOT NULL,
  `hon_per` decimal(5,2) DEFAULT NULL,
  `hon_size` decimal(10,2) DEFAULT NULL,
  `tushaalnum` varchar(255) DEFAULT NULL,
  `decidedby` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_sale`
--

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
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_sellingprice`
--

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
  `sp_source_table` varchar(50) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Triggers `tbl_sellingprice`
--
DELIMITER $$
CREATE TRIGGER `trg_resolve_sellingprice_inventory_metadata` BEFORE INSERT ON `tbl_sellingprice` FOR EACH ROW BEGIN
  DECLARE v_primary_code VARCHAR(50);
  DECLARE v_selling_code VARCHAR(50);
  DECLARE v_pm_name VARCHAR(255);
  DECLARE v_pm_unit_id INT;
  DECLARE v_categories INT;
  DECLARE v_manufacturer_id INT;
  DECLARE v_cost DECIMAL(18,4);
  DECLARE v_cost_date DATE;
  DECLARE v_source_table VARCHAR(50);

  -- Call the updated stored procedure with OUT parameters
  CALL resolve_inventory_metadata(
    NEW.product_primary_code,
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

  -- Assign the resolved values to NEW fields
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
CREATE TRIGGER `trg_resolve_sellprice_inventory_metadata` BEFORE INSERT ON `tbl_sellingprice` FOR EACH ROW BEGIN
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
    NEW.product_primary_code,
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
CREATE TRIGGER `trg_resolve_sellprice_inventory_metadata_update` BEFORE UPDATE ON `tbl_sellingprice` FOR EACH ROW BEGIN
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
    NEW.product_primary_code,
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

-- --------------------------------------------------------

--
-- Table structure for table `tbl_sellingprice_other`
--

CREATE TABLE `tbl_sellingprice_other` (
  `id` int NOT NULL,
  `product_primary_code` varchar(50) NOT NULL,
  `price_date` date NOT NULL,
  `company_id` varchar(1) NOT NULL,
  `selling_price` double(10,2) DEFAULT NULL,
  `whole` double(10,2) DEFAULT NULL,
  `prod` double(10,2) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_tariff`
--

CREATE TABLE `tbl_tariff` (
  `id` int NOT NULL,
  `chig_id` int NOT NULL,
  `torol_id` int NOT NULL,
  `corp` int NOT NULL DEFAULT '1',
  `size` decimal(18,2) NOT NULL,
  `mu` int NOT NULL,
  `ab` varchar(50) NOT NULL,
  `Dmonth` int NOT NULL,
  `dundaj2025` decimal(18,2) NOT NULL,
  `une1` decimal(18,2) NOT NULL,
  `une2` decimal(18,2) NOT NULL,
  `dundaj202512` decimal(18,2) NOT NULL,
  `uneM1` decimal(18,2) NOT NULL,
  `uneM2` decimal(18,2) NOT NULL,
  `respects_billabledays` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Авлагыг ажиллах хоногоор тооцох эсэх',
  `Tyear` int NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `department_id` int NOT NULL,
  `label1` varchar(2) DEFAULT NULL,
  `label2` varchar(30) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_utility_contracts`
--

CREATE TABLE `tbl_utility_contracts` (
  `contract_id` bigint NOT NULL,
  `contract_number` varchar(64) NOT NULL,
  `party_id` bigint DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `status` enum('active','inactive') DEFAULT 'active',
  `company_id` int NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tbl_workplace`
--

CREATE TABLE `tbl_workplace` (
  `id` int NOT NULL,
  `wchig_id` int NOT NULL,
  `wtorol_id` int NOT NULL,
  `workplace_id` int NOT NULL,
  `wor_type_id` int NOT NULL,
  `date` date NOT NULL,
  `company_id` int NOT NULL,
  `department_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tenant_tables`
--

CREATE TABLE `tenant_tables` (
  `table_name` varchar(100) NOT NULL,
  `is_shared` tinyint(1) DEFAULT '0',
  `seed_on_create` tinyint(1) DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transactions_contract`
--

CREATE TABLE `transactions_contract` (
  `id` int NOT NULL,
  `g_num` varchar(50) NOT NULL,
  `g_id` int NOT NULL,
  `g_burtgel_id` varchar(10) NOT NULL,
  `g_chig` int NOT NULL,
  `g_torol` int NOT NULL,
  `g_sq` decimal(15,2) NOT NULL,
  `g_start` date NOT NULL,
  `g_end` date NOT NULL,
  `company_id` int NOT NULL,
  `department_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `g_cancel` date DEFAULT NULL,
  `g_cancel_reason` int DEFAULT NULL,
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
  `g_ab_tur` decimal(5,3) DEFAULT '0.000',
  `g_ab_huviin` decimal(5,3) DEFAULT '0.000',
  `pos_session_id` varchar(64) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Triggers `transactions_contract`
--
DELIMITER $$
CREATE TRIGGER `tr_contract_trtype_insert` BEFORE INSERT ON `transactions_contract` FOR EACH ROW BEGIN
  DECLARE v_trtype VARCHAR(10);
  DECLARE v_trtypename VARCHAR(255);

  CALL fill_transaction_type_fields(NEW.TransType, v_trtype, v_trtypename);

  SET NEW.trtype = v_trtype;
  SET NEW.TRTYPENAME = v_trtypename;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `tr_contract_trtype_update` BEFORE UPDATE ON `transactions_contract` FOR EACH ROW BEGIN
  DECLARE v_trtype VARCHAR(10);
  DECLARE v_trtypename VARCHAR(255);

  CALL fill_transaction_type_fields(NEW.TransType, v_trtype, v_trtypename);

  SET NEW.trtype = v_trtype;
  SET NEW.TRTYPENAME = v_trtypename;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `transactions_contract_g_num_bi` BEFORE INSERT ON `transactions_contract` FOR EACH ROW BEGIN
  SET NEW.`g_num` = CONCAT(
    UPPER(CONCAT(
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26))
    )),
    '-',
    UPPER(CONCAT(
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26))
    )),
    '-',
    UPPER(CONCAT(
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26))
    )),
    '-',
    UPPER(CONCAT(
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26))
    ))
  );
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_fill_fields_from_latest_g_id` BEFORE INSERT ON `transactions_contract` FOR EACH ROW BEGIN
  DECLARE v_burtgel_id VARCHAR(10);
  DECLARE v_chig INT;
  DECLARE v_torol INT;
  DECLARE v_sq DECIMAL(15,2);
  DECLARE v_start DATE;
  DECLARE v_end DATE;

  IF NEW.g_id IS NOT NULL AND NEW.g_id <> '' THEN
    CALL fill_contract_from_latest_g_id(
      NEW.g_id,
      v_burtgel_id,
      v_chig,
      v_torol,
      v_sq,
      v_start,
      v_end
    );

    SET NEW.g_burtgel_id = IFNULL(NEW.g_burtgel_id, v_burtgel_id);
    SET NEW.g_chig       = IFNULL(NEW.g_chig, v_chig);
    SET NEW.g_torol      = IFNULL(NEW.g_torol, v_torol);
    SET NEW.g_sq         = IFNULL(NEW.g_sq, v_sq);
    SET NEW.g_start      = IFNULL(NEW.g_start, v_start);
    SET NEW.g_end        = IFNULL(NEW.g_end, v_end);
  END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `transactions_contract_other`
--

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
  `error_description` varchar(255) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Triggers `transactions_contract_other`
--
DELIMITER $$
CREATE TRIGGER `transactions_contract_other_g_num_bi` BEFORE INSERT ON `transactions_contract_other` FOR EACH ROW BEGIN
  SET NEW.`g_num` = CONCAT(
    UPPER(CONCAT(
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26))
    )),
    '-',
    UPPER(CONCAT(
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26))
    )),
    '-',
    UPPER(CONCAT(
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26))
    )),
    '-',
    UPPER(CONCAT(
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26)),
      CHAR(FLOOR(65 + RAND() * 26))
    ))
  );
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `transactions_expense`
--

CREATE TABLE `transactions_expense` (
  `id` int NOT NULL,
  `z_num` varchar(50) NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `merchant_id` bigint DEFAULT NULL,
  `pos_no` varchar(32) DEFAULT NULL,
  `ztr_transbranch` int NOT NULL,
  `z_barimt` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
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
  `z` double(15,2) NOT NULL,
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
  `sp_source_table` varchar(50) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Triggers `transactions_expense`
--
DELIMITER $$
CREATE TRIGGER `transactions_expense_z_num_bi` BEFORE INSERT ON `transactions_expense` FOR EACH ROW BEGIN
  IF NEW.z_num IS NULL OR NEW.z_num = '' THEN
    SET NEW.z_num = CONCAT(
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
CREATE TRIGGER `trg_resolve_expense_inventory_metadata` BEFORE INSERT ON `transactions_expense` FOR EACH ROW BEGIN
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
    NEW.z_mat_code,
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
CREATE TRIGGER `trg_resolve_expense_inventory_metadata_update` BEFORE UPDATE ON `transactions_expense` FOR EACH ROW BEGIN
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
    NEW.z_mat_code,
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

-- --------------------------------------------------------

--
-- Table structure for table `transactions_expense_other`
--

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
  `error_description` varchar(255) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transactions_income`
--

CREATE TABLE `transactions_income` (
  `id` int NOT NULL,
  `or_num` varchar(50) NOT NULL,
  `ortr_transbranch` int NOT NULL,
  `or_o_barimt` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `or_g_id` int DEFAULT NULL,
  `or_burtgel` int DEFAULT NULL,
  `or_chig` int DEFAULT NULL,
  `sp_curr_receivables` decimal(15,0) DEFAULT NULL,
  `sp_curr_penalty` decimal(15,0) DEFAULT NULL,
  `sp_curr_receivableswithpenalty` int DEFAULT NULL,
  `or_torol` int DEFAULT NULL,
  `or_type_id` int DEFAULT NULL,
  `or_av_now` int DEFAULT NULL,
  `or_av_time` varchar(50) DEFAULT NULL,
  `or_date` date DEFAULT NULL,
  `orcash_or_id` int DEFAULT NULL,
  `or_or` double(15,2) NOT NULL,
  `total_amount_without_tax` decimal(18,2) NOT NULL DEFAULT '0.00',
  `vat_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `city_tax` decimal(18,2) NOT NULL DEFAULT '0.00',
  `tax_type` enum('VATABLE','VAT_FREE','CITY_TAX_ONLY') NOT NULL DEFAULT 'VATABLE',
  `or_vallut_id` int DEFAULT NULL,
  `or_valut_choice` int DEFAULT NULL,
  `or_vat` decimal(15,0) DEFAULT NULL,
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
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `ebarimt_invoice_id` int DEFAULT NULL,
  `request_id` bigint DEFAULT NULL,
  `merchant_id` int DEFAULT NULL,
  `pos_no` varchar(32) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Triggers `transactions_income`
--
DELIMITER $$
CREATE TRIGGER `tr_income_trtype` BEFORE INSERT ON `transactions_income` FOR EACH ROW BEGIN
  DECLARE v_trtype VARCHAR(10);
  DECLARE v_trtypename VARCHAR(255);

  CALL fill_transaction_type_fields(NEW.TransType, v_trtype, v_trtypename);

  SET NEW.trtype = v_trtype;
  SET NEW.TRTYPENAME = v_trtypename;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `tr_income_trtype_update` BEFORE INSERT ON `transactions_income` FOR EACH ROW BEGIN
  DECLARE v_trtype VARCHAR(10);
  DECLARE v_trtypename VARCHAR(255);

  CALL fill_transaction_type_fields(NEW.TransType, v_trtype, v_trtypename);

  SET NEW.trtype = v_trtype;
  SET NEW.TRTYPENAME = v_trtypename;
END
$$
DELIMITER ;
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
CREATE TRIGGER `trg_resolve_contract_receivables` BEFORE INSERT ON `transactions_income` FOR EACH ROW trigger_block: BEGIN

    -- ALL DECLARES MUST COME FIRST!
    DECLARE v_curr_receivables            DECIMAL(18,2);
    DECLARE v_curr_penalty                DECIMAL(18,2);
    DECLARE v_curr_receivableswithpenalty DECIMAL(18,2);

    -- Skip when global skip flag is set
    IF @skip_triggers = 1 THEN
        LEAVE trigger_block;
    END IF;

    -- Skip when g_id = -1
    IF NEW.or_g_id = -1 THEN
        LEAVE trigger_block;
    END IF;

    CALL resolve_contract_receivables(
        NEW.or_g_id,
        NEW.or_date,
        v_curr_receivables,
        v_curr_penalty,
        v_curr_receivableswithpenalty
    );

    SET NEW.sp_curr_receivables            = v_curr_receivables;
    SET NEW.sp_curr_penalty                = v_curr_penalty;
    SET NEW.sp_curr_receivableswithpenalty = v_curr_receivableswithpenalty;

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

-- --------------------------------------------------------

--
-- Table structure for table `transactions_income_other`
--

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
  `error_description` varchar(255) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transactions_inventory`
--

CREATE TABLE `transactions_inventory` (
  `id` int NOT NULL,
  `bmtr_num` varchar(50) NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `merchant_id` bigint DEFAULT NULL,
  `pos_no` varchar(32) DEFAULT NULL,
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
  `transaction_datetime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Triggers `transactions_inventory`
--
DELIMITER $$
CREATE TRIGGER `bi_assign_bmtr_actid` BEFORE INSERT ON `transactions_inventory` FOR EACH ROW BEGIN
  DECLARE last_id BIGINT UNSIGNED;

  IF NEW.bmtr_actid IS NULL OR NEW.bmtr_actid = 0 THEN
    SELECT MAX(bmtr_actid) INTO last_id
      FROM transactions_inventory;
    SET NEW.bmtr_actid = IFNULL(last_id, 0) + 1;
  END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `transactions_inventory_bmtr_num_bi` BEFORE INSERT ON `transactions_inventory` FOR EACH ROW BEGIN
  IF NEW.bmtr_num IS NULL OR NEW.bmtr_num = '' THEN
    SET NEW.bmtr_num = CONCAT(
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
CREATE TRIGGER `trg_calculate_price_discount` BEFORE INSERT ON `transactions_inventory` FOR EACH ROW BEGIN
  DECLARE v_price DECIMAL(18,4);
  DECLARE v_discount_company DECIMAL(5,2);
  DECLARE v_discount_supplier DECIMAL(5,2);
  DECLARE v_discount_coupon DECIMAL(5,2);
  DECLARE v_total_discount DECIMAL(18,4);

  CALL get_selling_price_and_discount(
    NEW.sp_selling_code,
    NEW.company_id,
    NEW.bmtr_transbranch,
    NEW.bmtr_date,
    NEW.bmtr_coupcode,
    v_price,
    v_discount_company,
    v_discount_supplier,
    v_discount_coupon,
    v_total_discount
  );

  SET NEW.sp_selling_price = v_price;
  SET NEW.sp_company_discount = v_discount_company;
  SET NEW.sp_supplier_discount = v_discount_supplier;
  SET NEW.sp_coupon_discount = v_discount_coupon;
  SET NEW.sp_total_discount = v_total_discount;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_calculate_price_discount_update` BEFORE UPDATE ON `transactions_inventory` FOR EACH ROW BEGIN
  DECLARE v_price DECIMAL(18,4);
  DECLARE v_discount_company DECIMAL(5,2);
  DECLARE v_discount_supplier DECIMAL(5,2);
  DECLARE v_discount_coupon DECIMAL(5,2);
  DECLARE v_total_discount DECIMAL(18,4);

  CALL get_selling_price_and_discount(
    NEW.sp_selling_code,
    NEW.company_id,
    NEW.bmtr_transbranch,
    NEW.bmtr_date,
    NEW.bmtr_coupcode,
    v_price,
    v_discount_company,
    v_discount_supplier,
    v_discount_coupon,
    v_total_discount
  );

  SET NEW.sp_selling_price = v_price;
  SET NEW.sp_company_discount = v_discount_company;
  SET NEW.sp_supplier_discount = v_discount_supplier;
  SET NEW.sp_coupon_discount = v_discount_coupon;
  SET NEW.sp_total_discount = v_total_discount;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_resolve_inventory_metadata` BEFORE INSERT ON `transactions_inventory` FOR EACH ROW BEGIN
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
    NEW.bmtr_pmid,
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
CREATE TRIGGER `trg_resolve_inventory_metadata_update` BEFORE UPDATE ON `transactions_inventory` FOR EACH ROW BEGIN
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
    NEW.bmtr_pmid,
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
CREATE TRIGGER `trg_set_current_stock` BEFORE INSERT ON `transactions_inventory` FOR EACH ROW BEGIN
  DECLARE v_stock DECIMAL(18,4);

  CALL calculate_stock_per_branch(
    NEW.bmtr_transbranch,
    NEW.sp_primary_code,
    NEW.bmtr_date,
    v_stock
  );

  SET NEW.sp_current_stock = v_stock;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_set_current_stock_update` BEFORE UPDATE ON `transactions_inventory` FOR EACH ROW BEGIN
  DECLARE v_stock DECIMAL(18,4);

  CALL calculate_stock_branch(
    NEW.bmtr_transbranch,
    NEW.sp_primary_code,
    NEW.bmtr_date,
    v_stock
  );

  SET NEW.sp_current_stock = v_stock;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_transactions_inventory_insert` BEFORE INSERT ON `transactions_inventory` FOR EACH ROW BEGIN
  DECLARE v_trtype VARCHAR(10);
  DECLARE v_trtypename VARCHAR(255);

  CALL fill_transaction_type_fields(NEW.TransType, v_trtype, v_trtypename);

  SET NEW.trtype = v_trtype;
  SET NEW.TRTYPENAME = v_trtypename;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_transactions_inventory_update` BEFORE UPDATE ON `transactions_inventory` FOR EACH ROW BEGIN
  DECLARE v_trtype VARCHAR(10);
  DECLARE v_trtypename VARCHAR(255);

  CALL fill_transaction_type_fields(NEW.TransType, v_trtype, v_trtypename);

  SET NEW.trtype = v_trtype;
  SET NEW.TRTYPENAME = v_trtypename;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `transactions_inventory_other`
--

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
  `error_description` varchar(255) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transactions_order`
--

CREATE TABLE `transactions_order` (
  `id` int NOT NULL,
  `company_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `merchant_id` bigint DEFAULT NULL,
  `pos_no` varchar(32) DEFAULT NULL,
  `ordrid` varchar(10) NOT NULL,
  `ordrdid` int NOT NULL,
  `ordrtr_transbranch` int NOT NULL,
  `ordrcustomerid` int DEFAULT NULL,
  `ordrcustomername` varchar(27) DEFAULT NULL,
  `ordrcoupcode` varchar(20) DEFAULT NULL,
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
  `ordrap` decimal(10,2) GENERATED ALWAYS AS ((`ordrsub` * `sp_selling_price`)) STORED,
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
  `sp_current_branch_stock` decimal(18,4) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Triggers `transactions_order`
--
DELIMITER $$
CREATE TRIGGER `transactions_order_ordrnum_bi` BEFORE INSERT ON `transactions_order` FOR EACH ROW BEGIN
  IF NEW.ordrnum IS NULL OR NEW.ordrnum = '' THEN
    SET NEW.ordrnum = CONCAT(
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
CREATE TRIGGER `trg_order_calculate_price_discount` BEFORE INSERT ON `transactions_order` FOR EACH ROW BEGIN
  DECLARE v_price DECIMAL(18,4);
  DECLARE v_discount_company DECIMAL(5,2);
  DECLARE v_discount_supplier DECIMAL(5,2);
  DECLARE v_discount_coupon DECIMAL(5,2);
  DECLARE v_total_discount DECIMAL(18,4);

  CALL get_selling_price_and_discount(
    NEW.sp_selling_code,
    NEW.company_id,
    NEW.branch_id,
    NEW.ordrdate,
    NEW.ordrcoupcode,
    v_price,
    v_discount_company,
    v_discount_supplier,
    v_discount_coupon,
    v_total_discount
  );

  SET NEW.sp_selling_price = v_price;
  SET NEW.sp_company_discount = v_discount_company;
  SET NEW.sp_supplier_discount = v_discount_supplier;
  SET NEW.sp_coupon_discount = v_discount_coupon;
  SET NEW.sp_total_discount = v_total_discount;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_order_calculate_price_discount_update` BEFORE UPDATE ON `transactions_order` FOR EACH ROW BEGIN
  DECLARE v_price DECIMAL(18,4);
  DECLARE v_discount_company DECIMAL(5,2);
  DECLARE v_discount_supplier DECIMAL(5,2);
  DECLARE v_discount_coupon DECIMAL(5,2);
  DECLARE v_total_discount DECIMAL(18,4);

  CALL get_selling_price_and_discount(
    NEW.sp_selling_code,
    NEW.company_id,
    NEW.branch_id,
    NEW.ordrdate,
    NEW.ordrcoupcode,
    v_price,
    v_discount_company,
    v_discount_supplier,
    v_discount_coupon,
    v_total_discount
  );

  SET NEW.sp_selling_price = v_price;
  SET NEW.sp_company_discount = v_discount_company;
  SET NEW.sp_supplier_discount = v_discount_supplier;
  SET NEW.sp_coupon_discount = v_discount_coupon;
  SET NEW.sp_total_discount = v_total_discount;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_resolve_order_inventory_metadata` BEFORE INSERT ON `transactions_order` FOR EACH ROW BEGIN
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
    NEW.ordrbkod,
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
CREATE TRIGGER `trg_resolve_order_inventory_metadata_update` BEFORE UPDATE ON `transactions_order` FOR EACH ROW BEGIN
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
    NEW.ordrbkod,
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
CREATE TRIGGER `trg_transactions_order_insert` AFTER INSERT ON `transactions_order` FOR EACH ROW BEGIN
  UPDATE transactions_order ti
  JOIN code_transaction ct ON ct.UITransType = NEW.TransType
  SET ti.TRTYPENAME = ct.UITransTypeName,
      ti.trtype = ct.UITrtype
  WHERE ti.id = NEW.id;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_transactions_order_update` AFTER UPDATE ON `transactions_order` FOR EACH ROW BEGIN
  UPDATE transactions_order ti
  JOIN code_transaction ct ON ct.UITransType = NEW.TransType
  SET ti.TRTYPENAME = ct.UITransTypeName,
      ti.trtype = ct.UITrtype
  WHERE ti.id = NEW.id;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `transactions_order_other`
--

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
  `error_description` varchar(255) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transactions_plan`
--

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
  `sp_source_table` varchar(50) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Triggers `transactions_plan`
--
DELIMITER $$
CREATE TRIGGER `transactions_plan_num_bi` BEFORE INSERT ON `transactions_plan` FOR EACH ROW BEGIN
  IF NEW.num IS NULL OR NEW.num = '' THEN
    SET NEW.num = CONCAT(
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
CREATE TRIGGER `transactions_plan_pid_bi` BEFORE INSERT ON `transactions_plan` FOR EACH ROW BEGIN
  DECLARE next_id VARCHAR(10);
  DECLARE prefix CHAR(1);
  DECLARE latest_plan_id VARCHAR(10);
  IF NEW.pid IS NULL OR NEW.pid = '' THEN
    IF NEW.transbranch = 1 THEN
-- Use prefix 'A' for branch 1
SELECT RIGHT(MAX(pid), 5)
INTO next_id
FROM transactions_plan
WHERE pid LIKE 'A%';
SET next_id = IFNULL(next_id, 0) + 1;
SET NEW.pid = CONCAT('A', LPAD(next_id, 5, '0'));
ELSE
-- Use transbranch number as prefix
SELECT RIGHT(MAX(pid), 4)
INTO next_id
FROM transactions_plan
WHERE pid LIKE CONCAT(NEW.transbranch, '%');
SET next_id = IFNULL(next_id, 0) + 1;
SET NEW.pid = CONCAT(NEW.transbranch, LPAD(next_id, 4, '0'));
END IF;
  END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_resolve_plan_inventory_metadata` BEFORE INSERT ON `transactions_plan` FOR EACH ROW BEGIN
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
    NEW.pmid,
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
CREATE TRIGGER `trg_resolve_plan_inventory_metadata_update` BEFORE UPDATE ON `transactions_plan` FOR EACH ROW BEGIN
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
    NEW.pmid,
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
CREATE TRIGGER `trg_transactions_plan_insert` BEFORE INSERT ON `transactions_plan` FOR EACH ROW BEGIN
  DECLARE v_trtype VARCHAR(10);
  DECLARE v_trtypename VARCHAR(255);

  CALL fill_transaction_type_fields(NEW.TransType, v_trtype, v_trtypename);

  SET NEW.trtype = v_trtype;
  SET NEW.TRTYPENAME = v_trtypename;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_transactions_plan_update` BEFORE UPDATE ON `transactions_plan` FOR EACH ROW BEGIN
  DECLARE v_trtype VARCHAR(10);
  DECLARE v_trtypename VARCHAR(255);

  CALL fill_transaction_type_fields(NEW.TransType, v_trtype, v_trtypename);

  SET NEW.trtype = v_trtype;
  SET NEW.TRTYPENAME = v_trtypename;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `transactions_plan_other`
--

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
  `error_description` varchar(255) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transactions_pos`
--

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
  `assembly_price` decimal(18,0) DEFAULT NULL,
  `TRTYPENAME` varchar(255) NOT NULL,
  `trtype` varchar(4) NOT NULL,
  `TransType` int NOT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transactions_posservices`
--

CREATE TABLE `transactions_posservices` (
  `id` int NOT NULL,
  `transaction_id` int NOT NULL,
  `service_id` int NOT NULL,
  `service_name` varchar(255) NOT NULL,
  `measure_unit` varchar(50) DEFAULT NULL,
  `quantity` decimal(10,2) DEFAULT '1.00',
  `unit_price` decimal(18,2) NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `vat_amount` decimal(18,2) DEFAULT '0.00',
  `city_tax` decimal(18,2) DEFAULT '0.00',
  `bonus_amount` decimal(18,2) DEFAULT '0.00',
  `classification_code` varchar(10) NOT NULL,
  `tax_type` varchar(10) NOT NULL,
  `tax_reason_code` varchar(10) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transactions_test`
--

CREATE TABLE `transactions_test` (
  `id` bigint UNSIGNED NOT NULL,
  `company_id` int NOT NULL,
  `request_id` bigint NOT NULL,
  `customer_name` varchar(191) NOT NULL,
  `status` enum('draft','pending','approved') NOT NULL DEFAULT 'pending',
  `total_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transactions_test_detail`
--

CREATE TABLE `transactions_test_detail` (
  `id` bigint UNSIGNED NOT NULL,
  `transaction_id` bigint UNSIGNED NOT NULL,
  `line_no` int NOT NULL,
  `sku` varchar(64) DEFAULT NULL,
  `quantity` decimal(18,2) NOT NULL DEFAULT '0.00',
  `line_total` decimal(18,2) NOT NULL DEFAULT '0.00',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `company_id` int NOT NULL DEFAULT '0',
  `created_by` varchar(50) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transaction_temporaries`
--

CREATE TABLE `transaction_temporaries` (
  `id` bigint UNSIGNED NOT NULL,
  `company_id` bigint NOT NULL,
  `table_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `form_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `config_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `module_key` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payload_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `raw_values_json` longtext COLLATE utf8mb4_unicode_ci,
  `cleaned_values_json` longtext COLLATE utf8mb4_unicode_ci,
  `created_by` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_senior_empid` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_id` bigint DEFAULT NULL,
  `department_id` bigint DEFAULT NULL,
  `status` enum('pending','promoted','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `chain_uuid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pending_key` char(1) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (if((`status` = 'pending'),'1',NULL)) STORED,
  `review_notes` text COLLATE utf8mb4_unicode_ci,
  `reviewed_by` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `promoted_record_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `chk_temp_pending_reviewer` CHECK (`status` = 'pending' OR `plan_senior_empid` IS NULL),
  `updated_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transaction_temporary_review_history`
--

CREATE TABLE `transaction_temporary_review_history` (
  `id` bigint UNSIGNED NOT NULL,
  `temporary_id` bigint UNSIGNED NOT NULL,
  `chain_uuid` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` enum('forwarded','promoted','rejected') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reviewer_empid` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `forwarded_to_empid` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `promoted_record_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transaction_vat_summary`
--

CREATE TABLE `transaction_vat_summary` (
  `id` bigint UNSIGNED NOT NULL,
  `transaction_id` bigint UNSIGNED NOT NULL,
  `tax_type` enum('VAT','CITY_TAX','OTHER') NOT NULL,
  `tax_rate` decimal(6,3) NOT NULL,
  `tax_amount` decimal(18,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Stand-in structure for view `UnifiedInventoryCode`
-- (See below for the actual view)
--
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

-- --------------------------------------------------------

--
-- Stand-in structure for view `unified_lookup`
-- (See below for the actual view)
--
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

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int NOT NULL,
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '$2a$10$OyIyhW8VD6/4X2A/2IA3mOvwvx.a4spsEteH9tjqf69hq70jFnNmu',
  `created_by` varchar(50) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `empid` varchar(50) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_activity_log`
--

CREATE TABLE `user_activity_log` (
  `log_id` bigint NOT NULL,
  `emp_id` varchar(10) NOT NULL,
  `table_name` varchar(100) NOT NULL,
  `record_id` varchar(191) NOT NULL,
  `action` enum('create','update','delete','request_edit','request_delete','approve','decline','request_report_approval','approve_report','decline_report') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `details` json DEFAULT NULL,
  `request_id` bigint DEFAULT NULL,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_levels`
--

CREATE TABLE `user_levels` (
  `id` int NOT NULL,
  `userlevel_id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `Description` varchar(255) NOT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_level_permissions`
--

CREATE TABLE `user_level_permissions` (
  `id` int NOT NULL,
  `userlevel_id` int NOT NULL,
  `action` varchar(20) DEFAULT NULL,
  `action_key` varchar(255) DEFAULT NULL,
  `company_id` int NOT NULL DEFAULT '2',
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Stand-in structure for view `view_inventory_report_summary`
-- (See below for the actual view)
--
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

-- --------------------------------------------------------

--
-- Stand-in structure for view `view_transactions_income`
-- (See below for the actual view)
--
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

--
-- Indexes for dumped tables
--

--
-- Indexes for table `audit_log`
--
ALTER TABLE `audit_log`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_band`
--
ALTER TABLE `code_band`
  ADD PRIMARY KEY (`band_id`),
  ADD UNIQUE KEY `band_code` (`band_code`);

--
-- Indexes for table `code_bayarodor`
--
ALTER TABLE `code_bayarodor`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_fest_year_fest_month` (`fest_year`,`fest_month`);

--
-- Indexes for table `code_bkod`
--
ALTER TABLE `code_bkod`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_bkod_bkod_cost_bkod_prod_bkod_spec_bkod_prim_bkod_date` (`bkod`,`bkod_cost`,`bkod_prod`,`bkod_spec`,`bkod_prim`,`bkod_date`);

--
-- Indexes for table `code_bkodprim`
--
ALTER TABLE `code_bkodprim`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_1ab68fd7` (`bkod_Tk`,`bkod_Tk_name`,`bkod_Tk_muid`,`bkod_tk_tkkod`,`bkod_Tk_SKU`,`bkod_Tk_date`,`bkod_Tk_prod`,`bkod_Tk_size`,`bkod_tk_length`,`bkod_tk_width`,`bkod_tk_thick`),
  ADD KEY `bkod_Tk_muid` (`bkod_Tk_muid`);

--
-- Indexes for table `code_branches`
--
ALTER TABLE `code_branches`
  ADD PRIMARY KEY (`company_id`,`branch_id`),
  ADD UNIQUE KEY `branch_id` (`branch_id`,`company_id`),
  ADD KEY `id` (`id`,`branch_id`,`company_id`),
  ADD KEY `idx_company_branch` (`company_id`,`branch_id`);

--
-- Indexes for table `code_calendar_days`
--
ALTER TABLE `code_calendar_days`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_company_branch_date` (`company_id`,`branch_id`,`date_day`);

--
-- Indexes for table `code_cashier`
--
ALTER TABLE `code_cashier`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_chiglel`
--
ALTER TABLE `code_chiglel`
  ADD PRIMARY KEY (`id`),
  ADD KEY `chig_id` (`chig_id`,`company_id`);

--
-- Indexes for table `code_department`
--
ALTER TABLE `code_department`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `department_id_3` (`department_id`,`company_id`);

--
-- Indexes for table `code_edhorongo`
--
ALTER TABLE `code_edhorongo`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_ehkod_company_id` (`ehkod`,`company_id`);

--
-- Indexes for table `code_edhorongo_other`
--
ALTER TABLE `code_edhorongo_other`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_expenseangilal`
--
ALTER TABLE `code_expenseangilal`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_expensebalancetype`
--
ALTER TABLE `code_expensebalancetype`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_expensebaltype`
--
ALTER TABLE `code_expensebaltype`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_k1_k2_k3_k4_k5_k6_` (`k1`,`k2`,`k3`,`k4`,`k5`,`k6_`),
  ADD KEY `k2` (`k2`),
  ADD KEY `k3` (`k3`),
  ADD KEY `k4` (`k4`),
  ADD KEY `k5` (`k5`),
  ADD KEY `k6_` (`k6_`);

--
-- Indexes for table `code_expensetype`
--
ALTER TABLE `code_expensetype`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_expenseutga`
--
ALTER TABLE `code_expenseutga`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_frequency`
--
ALTER TABLE `code_frequency`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_incometype`
--
ALTER TABLE `code_incometype`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_income_priority`
--
ALTER TABLE `code_income_priority`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_initiator`
--
ALTER TABLE `code_initiator`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_material`
--
ALTER TABLE `code_material`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_xmkod_xmkod_muid_xmkod_cost_xmkod_tkkod` (`xmkod`,`xmkod_muid`,`xmkod_cost`,`xmkod_tkkod`),
  ADD KEY `xmkod_muid` (`xmkod_muid`);

--
-- Indexes for table `code_materialprim`
--
ALTER TABLE `code_materialprim`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_53ccf867` (`xmkodtk`,`xmkodtk_name`,`xmkodtk_muid`,`xmkodtk_type`,`xmkodtk_tkkod`),
  ADD KEY `xmkodtk_muid` (`xmkodtk_muid`);

--
-- Indexes for table `code_orav_eseh`
--
ALTER TABLE `code_orav_eseh`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `av_eseh` (`av_eseh`);

--
-- Indexes for table `code_penalty`
--
ALTER TABLE `code_penalty`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_position`
--
ALTER TABLE `code_position`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_position_id` (`position_id`),
  ADD UNIQUE KEY `position_name` (`position_name`);

--
-- Indexes for table `code_position_other`
--
ALTER TABLE `code_position_other`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_reason`
--
ALTER TABLE `code_reason`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_room`
--
ALTER TABLE `code_room`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_status`
--
ALTER TABLE `code_status`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `id` (`id`);

--
-- Indexes for table `code_talbai`
--
ALTER TABLE `code_talbai`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_torol`
--
ALTER TABLE `code_torol`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `torol_id` (`torol_id`,`company_id`),
  ADD UNIQUE KEY `torol_id_2` (`torol_id`,`company_id`,`deleted_at`);

--
-- Indexes for table `code_transaction`
--
ALTER TABLE `code_transaction`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_UITransType_UITransTypeName_UITrtype` (`UITransType`,`UITransTypeName`,`UITrtype`),
  ADD UNIQUE KEY `UITransType` (`UITransType`);

--
-- Indexes for table `code_unit`
--
ALTER TABLE `code_unit`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unit_id` (`unit_id`,`company_id`);

--
-- Indexes for table `code_userlevel_settings`
--
ALTER TABLE `code_userlevel_settings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uls_function` (`uls_id`,`function_name`);

--
-- Indexes for table `code_utility`
--
ALTER TABLE `code_utility`
  ADD PRIMARY KEY (`utility_id`),
  ADD UNIQUE KEY `utility_code` (`utility_code`);

--
-- Indexes for table `code_utility_band`
--
ALTER TABLE `code_utility_band`
  ADD PRIMARY KEY (`utility_id`,`band_id`),
  ADD KEY `fk_cub_band` (`band_id`);

--
-- Indexes for table `code_utility_rates`
--
ALTER TABLE `code_utility_rates`
  ADD PRIMARY KEY (`rate_id`),
  ADD KEY `idx_rates_lookup` (`uchig_id`,`utility_id`,`band_id`,`effective_from`,`effective_to`),
  ADD KEY `fk_rate_band_mig` (`band_id`),
  ADD KEY `utorol_id` (`utorol_id`),
  ADD KEY `idx_code_utility_rates_util_band` (`utility_id`,`band_id`);

--
-- Indexes for table `code_valut`
--
ALTER TABLE `code_valut`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_violation`
--
ALTER TABLE `code_violation`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_week_config`
--
ALTER TABLE `code_week_config`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_company_branch_day_period` (`company_id`,`branch_id`,`day_of_week`,`effective_from`);

--
-- Indexes for table `code_woodprocctype`
--
ALTER TABLE `code_woodprocctype`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_woodsort`
--
ALTER TABLE `code_woodsort`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_woodtype`
--
ALTER TABLE `code_woodtype`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `code_workplace`
--
ALTER TABLE `code_workplace`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `company_id` (`company_id`,`workplace_id`),
  ADD UNIQUE KEY `uniq_company_id_workplace_id_workplace_name_position_id` (`company_id`,`workplace_id`,`position_id`) USING BTREE;

--
-- Indexes for table `companies`
--
ALTER TABLE `companies`
  ADD PRIMARY KEY (`id`),
  ADD KEY `id` (`id`);

--
-- Indexes for table `company_licenses`
--
ALTER TABLE `company_licenses`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `company_module_licenses`
--
ALTER TABLE `company_module_licenses`
  ADD PRIMARY KEY (`company_id`,`module_key`),
  ADD KEY `module_key` (`module_key`);

--
-- Indexes for table `contract1`
--
ALTER TABLE `contract1`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_114204cf` (`g_num`,`g_id`,`g_chig`,`g_torol`,`g_sq`,`g_start`,`g_end`,`company_id`,`branch_id`,`department_id`);

--
-- Indexes for table `contractor_request`
--
ALTER TABLE `contractor_request`
  ADD PRIMARY KEY (`request_id`),
  ADD KEY `fk_request_utility_band` (`util_id`,`band_id`),
  ADD KEY `idx_contractor_request_contract` (`contract_g_id`);

--
-- Indexes for table `contract_receivable_cache`
--
ALTER TABLE `contract_receivable_cache`
  ADD PRIMARY KEY (`g_id`);

--
-- Indexes for table `ebarimt_api_log`
--
ALTER TABLE `ebarimt_api_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_invoice_log` (`invoice_id`);

--
-- Indexes for table `ebarimt_customer`
--
ALTER TABLE `ebarimt_customer`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `ebarimt_invoice`
--
ALTER TABLE `ebarimt_invoice`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `invoice_no` (`invoice_no`),
  ADD KEY `fk_ebarimt_invoice_merchant` (`merchant_id`);

--
-- Indexes for table `ebarimt_invoice_item`
--
ALTER TABLE `ebarimt_invoice_item`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_invoice_item` (`invoice_id`);

--
-- Indexes for table `ebarimt_invoice_payment`
--
ALTER TABLE `ebarimt_invoice_payment`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_invoice_payment` (`invoice_id`);

--
-- Indexes for table `ebarimt_reference_code`
--
ALTER TABLE `ebarimt_reference_code`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `forms`
--
ALTER TABLE `forms`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `form_submissions`
--
ALTER TABLE `form_submissions`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `international_code`
--
ALTER TABLE `international_code`
  ADD PRIMARY KEY (`code`);

--
-- Indexes for table `license_plans`
--
ALTER TABLE `license_plans`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `merchant`
--
ALTER TABLE `merchant`
  ADD PRIMARY KEY (`id`),
  ADD KEY `company_id` (`company_id`);

--
-- Indexes for table `modules`
--
ALTER TABLE `modules`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `module_key` (`module_key`,`company_id`),
  ADD KEY `fk_modules_parent` (`parent_key`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`notification_id`);

--
-- Indexes for table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `pending_request`
--
ALTER TABLE `pending_request`
  ADD PRIMARY KEY (`request_id`),
  ADD UNIQUE KEY `idx_pending_unique` (`table_name`,`record_id`,`emp_id`,`request_type`,`is_pending`);

--
-- Indexes for table `pos_session`
--
ALTER TABLE `pos_session`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_pos_session_uuid` (`session_uuid`),
  ADD KEY `idx_pos_session_lookup` (`company_id`,`branch_id`,`merchant_id`);

--
-- Indexes for table `report_approvals`
--
ALTER TABLE `report_approvals`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_report_approvals_request` (`request_id`);

--
-- Indexes for table `report_definitions`
--
ALTER TABLE `report_definitions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `report_key` (`report_key`);

--
-- Indexes for table `report_income_plan`
--
ALTER TABLE `report_income_plan`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_report` (`company_id`,`branch_id`,`report_year`,`report_month`,`income_type_id`);

--
-- Indexes for table `report_transaction_locks`
--
ALTER TABLE `report_transaction_locks`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_report_locks_request_record` (`request_id`,`table_name`,`record_id`),
  ADD KEY `idx_report_locks_request` (`request_id`),
  ADD KEY `idx_report_locks_table` (`table_name`),
  ADD KEY `idx_report_locks_company` (`company_id`),
  ADD KEY `idx_report_locks_status` (`status`);

--
-- Indexes for table `request_approvers`
--
ALTER TABLE `request_approvers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_request_approvers_request` (`request_id`);

--
-- Indexes for table `request_print_form`
--
ALTER TABLE `request_print_form`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `request_seen_counts`
--
ALTER TABLE `request_seen_counts`
  ADD PRIMARY KEY (`emp_id`);

--
-- Indexes for table `role_default_modules`
--
ALTER TABLE `role_default_modules`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `role_id` (`role_id`,`module_key`,`company_id`),
  ADD KEY `module_key` (`module_key`);

--
-- Indexes for table `role_module_permissions`
--
ALTER TABLE `role_module_permissions`
  ADD PRIMARY KEY (`company_id`,`position_id`,`module_key`),
  ADD KEY `module_key` (`module_key`);

--
-- Indexes for table `seq_0_to_30`
--
ALTER TABLE `seq_0_to_30`
  ADD PRIMARY KEY (`num`);

--
-- Indexes for table `service_coding`
--
ALTER TABLE `service_coding`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `classification_code` (`classification_code`);

--
-- Indexes for table `tbl_beltgenniiluulegch`
--
ALTER TABLE `tbl_beltgenniiluulegch`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_manuf_id` (`manuf_id`);

--
-- Indexes for table `tbl_bills`
--
ALTER TABLE `tbl_bills`
  ADD PRIMARY KEY (`bill_id`),
  ADD KEY `contract_number` (`contract_number`),
  ADD KEY `fk_bills_contract` (`contract_id`);

--
-- Indexes for table `tbl_bill_lines`
--
ALTER TABLE `tbl_bill_lines`
  ADD PRIMARY KEY (`line_id`),
  ADD KEY `contract_number` (`contract_number`,`bill_no`,`period_start`,`period_end`,`currency`),
  ADD KEY `bill_id` (`bill_id`),
  ADD KEY `utility_id` (`utility_id`),
  ADD KEY `band_id` (`band_id`),
  ADD KEY `unit` (`unit`),
  ADD KEY `fk_billlines_request` (`request_id`);

--
-- Indexes for table `tbl_contracter`
--
ALTER TABLE `tbl_contracter`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_manuf_id_manuf_rd_manuf_phone` (`manuf_id`,`manuf_rd`,`manuf_phone`),
  ADD KEY `manuf_id` (`manuf_id`);

--
-- Indexes for table `tbl_currate`
--
ALTER TABLE `tbl_currate`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_Valutid_CurDate_ratenum` (`Valutid`,`CurDate`,`ratenum`);

--
-- Indexes for table `tbl_discount`
--
ALTER TABLE `tbl_discount`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_946b42ff` (`inventory_code`,`start_date`,`end_date`,`discount_amount`,`manufacturer_id`,`coupon_code`,`branchid`,`company_id`,`branch_id`,`department_id`),
  ADD KEY `branchid` (`branchid`);

--
-- Indexes for table `tbl_discount_other`
--
ALTER TABLE `tbl_discount_other`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_employee`
--
ALTER TABLE `tbl_employee`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_emp_id_emp_lname_emp_fname_emp_rd_emp_sector_id` (`emp_id`,`emp_lname`,`emp_fname`,`emp_rd`),
  ADD KEY `Company_id` (`Company_id`);

--
-- Indexes for table `tbl_employment`
--
ALTER TABLE `tbl_employment`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_b2a0973c` (`employment_emp_id`,`employment_company_id`,`employment_position_id`,`employment_workplace_id`,`employment_date`,`employment_department_id`,`employment_branch_id`),
  ADD KEY `employment_company_id` (`employment_company_id`),
  ADD KEY `employment_branch_id` (`employment_branch_id`),
  ADD KEY `employment_department_id` (`employment_department_id`),
  ADD KEY `employment_user_level` (`employment_user_level`),
  ADD KEY `tbl_employment_ibfk_6` (`employment_senior_empid`),
  ADD KEY `tbl_employment_ibfk_7` (`employment_senior_plan_empid`);

--
-- Indexes for table `tbl_employment_other`
--
ALTER TABLE `tbl_employment_other`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_employment_schedule`
--
ALTER TABLE `tbl_employment_schedule`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_9af45951` (`company_id`,`branch_id`,`workplace_id`,`emp_id`,`start_date`,`department_id`);

--
-- Indexes for table `tbl_expenseorg`
--
ALTER TABLE `tbl_expenseorg`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_z_org_id` (`z_org_id`);

--
-- Indexes for table `tbl_hongololt`
--
ALTER TABLE `tbl_hongololt`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_hon_g_id_hon_range` (`hon_g_id`,`hon_startdate`,`hon_enddate`),
  ADD UNIQUE KEY `uniq_hon_g_id_range` (`hon_g_id`,`hon_startdate`,`hon_enddate`);

--
-- Indexes for table `tbl_sale`
--
ALTER TABLE `tbl_sale`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_43ddfc0b` (`hkod`,`hstartmmdate`,`hendmmdate`,`hsalemmp`,`hsalepermm`,`hstartbndate`,`hendbndate`,`hsalepbn`,`hsaleperbn`,`hcoupon`,`branchid`);

--
-- Indexes for table `tbl_sellingprice`
--
ALTER TABLE `tbl_sellingprice`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_product_primary_code_price_date_company_id` (`product_primary_code`,`price_date`,`company_id`);

--
-- Indexes for table `tbl_sellingprice_other`
--
ALTER TABLE `tbl_sellingprice_other`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tbl_tariff`
--
ALTER TABLE `tbl_tariff`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_e9d7db89` (`chig_id`,`torol_id`,`corp`,`size`,`mu`,`Dmonth`,`dundaj2025`,`une1`,`une2`,`dundaj202512`,`uneM1`,`uneM2`,`Tyear`,`company_id`,`branch_id`,`department_id`),
  ADD KEY `Tyear` (`Tyear`),
  ADD KEY `mu` (`mu`);

--
-- Indexes for table `tbl_utility_contracts`
--
ALTER TABLE `tbl_utility_contracts`
  ADD PRIMARY KEY (`contract_id`),
  ADD UNIQUE KEY `contract_number` (`contract_number`);

--
-- Indexes for table `tbl_workplace`
--
ALTER TABLE `tbl_workplace`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_c4260af4` (`wchig_id`,`wtorol_id`,`workplace_id`,`wor_type_id`,`date`,`company_id`,`department_id`,`branch_id`);

--
-- Indexes for table `tenant_tables`
--
ALTER TABLE `tenant_tables`
  ADD PRIMARY KEY (`table_name`);

--
-- Indexes for table `transactions_contract`
--
ALTER TABLE `transactions_contract`
  ADD PRIMARY KEY (`id`,`company_id`) USING BTREE,
  ADD UNIQUE KEY `g_id` (`g_id`,`g_chig`,`g_torol`,`g_sq`,`g_start`,`g_end`,`company_id`,`deleted_at`) USING BTREE,
  ADD KEY `company_id` (`company_id`),
  ADD KEY `branchid` (`branchid`),
  ADD KEY `confirm_emp` (`confirm_emp`);

--
-- Indexes for table `transactions_contract_other`
--
ALTER TABLE `transactions_contract_other`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `transactions_expense`
--
ALTER TABLE `transactions_expense`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_z_num_company_id_branch_id_ztr_transbranch_z_barimt` (`z_num`,`company_id`,`branch_id`,`ztr_transbranch`,`z_barimt`),
  ADD KEY `company_id` (`company_id`),
  ADD KEY `z_from` (`z_from`),
  ADD KEY `TransType` (`TransType`),
  ADD KEY `z_angilal_b` (`z_angilal_b`,`company_id`) USING BTREE;

--
-- Indexes for table `transactions_expense_other`
--
ALTER TABLE `transactions_expense_other`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `transactions_income`
--
ALTER TABLE `transactions_income`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_db40a088` (`or_num`,`ortr_transbranch`,`or_o_barimt`,`company_id`,`branch_id`),
  ADD KEY `company_id` (`company_id`),
  ADD KEY `TransType` (`TransType`),
  ADD KEY `branch_id` (`branch_id`),
  ADD KEY `fk_transactions_income_invoice` (`ebarimt_invoice_id`),
  ADD KEY `fk_income_request` (`request_id`),
  ADD KEY `fk_transactions_income_merchant` (`merchant_id`);

--
-- Indexes for table `transactions_income_other`
--
ALTER TABLE `transactions_income_other`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `transactions_inventory`
--
ALTER TABLE `transactions_inventory`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_bmtr_num_company_id_branch_id_bmtr_transbranch` (`bmtr_num`,`company_id`,`branch_id`,`bmtr_transbranch`),
  ADD KEY `company_id` (`company_id`),
  ADD KEY `sp_pm_unit_id` (`sp_pm_unit_id`);

--
-- Indexes for table `transactions_inventory_other`
--
ALTER TABLE `transactions_inventory_other`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `transactions_order`
--
ALTER TABLE `transactions_order`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_company_id_branch_id_ordrid_ordrdid_ordrtr_transbranch` (`company_id`,`branch_id`,`ordrid`,`ordrdid`,`ordrtr_transbranch`),
  ADD KEY `sp_pm_unit_id` (`sp_pm_unit_id`);

--
-- Indexes for table `transactions_order_other`
--
ALTER TABLE `transactions_order_other`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `transactions_plan`
--
ALTER TABLE `transactions_plan`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_num_company_id_branch_id_transbranch` (`num`,`company_id`,`branch_id`,`transbranch`),
  ADD KEY `company_id` (`company_id`);

--
-- Indexes for table `transactions_plan_other`
--
ALTER TABLE `transactions_plan_other`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `transactions_pos`
--
ALTER TABLE `transactions_pos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `branch_id` (`branch_id`),
  ADD KEY `company_id` (`company_id`),
  ADD KEY `emp_id` (`emp_id`),
  ADD KEY `department_id` (`department_id`),
  ADD KEY `status` (`status`),
  ADD KEY `payment_type` (`payment_type`),
  ADD KEY `cashback_payment_type` (`cashback_payment_type`);

--
-- Indexes for table `transactions_posservices`
--
ALTER TABLE `transactions_posservices`
  ADD PRIMARY KEY (`id`),
  ADD KEY `transaction_id` (`transaction_id`),
  ADD KEY `service_id` (`service_id`);

--
-- Indexes for table `transactions_test`
--
ALTER TABLE `transactions_test`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_transactions_test_company` (`company_id`),
  ADD KEY `idx_transactions_test_request` (`request_id`);

--
-- Indexes for table `transactions_test_detail`
--
ALTER TABLE `transactions_test_detail`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_transactions_detail_transaction` (`transaction_id`);

--
-- Indexes for table `transaction_temporaries`
--
ALTER TABLE `transaction_temporaries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_temp_company` (`company_id`),
  ADD KEY `idx_temp_status` (`status`),
  ADD KEY `idx_temp_table` (`table_name`),
  ADD KEY `idx_temp_plan_senior` (`plan_senior_empid`),
  ADD KEY `idx_temp_status_plan_senior` (`status`,`plan_senior_empid`),
  ADD UNIQUE KEY `idx_temp_chain_pending` (`chain_uuid`,`pending_key`),
  ADD KEY `idx_temp_creator` (`created_by`);

--
-- Indexes for table `transaction_temporary_review_history`
--
ALTER TABLE `transaction_temporary_review_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_temp_history_temp` (`temporary_id`),
  ADD KEY `idx_temp_history_action` (`action`);

--
-- Triggers `transaction_temporaries`
--
DELIMITER $$
CREATE TRIGGER `trg_temp_clear_reviewer` BEFORE UPDATE ON `transaction_temporaries` FOR EACH ROW SET NEW.plan_senior_empid = IF(NEW.status = 'pending', NEW.plan_senior_empid, NULL)$$
DELIMITER ;

--
-- Indexes for table `transaction_vat_summary`
--
ALTER TABLE `transaction_vat_summary`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `empid` (`empid`),
  ADD KEY `fk_users_createdby` (`created_by`),
  ADD KEY `idx_users_updated_by` (`updated_by`);

--
-- Indexes for table `user_activity_log`
--
ALTER TABLE `user_activity_log`
  ADD PRIMARY KEY (`log_id`);

--
-- Indexes for table `user_levels`
--
ALTER TABLE `user_levels`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `userlever_id_2` (`userlevel_id`),
  ADD KEY `userlever_id` (`userlevel_id`);

--
-- Indexes for table `user_level_permissions`
--
ALTER TABLE `user_level_permissions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_level_id` (`userlevel_id`),
  ADD KEY `company_id` (`company_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `audit_log`
--
ALTER TABLE `audit_log`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_band`
--
ALTER TABLE `code_band`
  MODIFY `band_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_bayarodor`
--
ALTER TABLE `code_bayarodor`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_bkod`
--
ALTER TABLE `code_bkod`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_bkodprim`
--
ALTER TABLE `code_bkodprim`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_branches`
--
ALTER TABLE `code_branches`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_calendar_days`
--
ALTER TABLE `code_calendar_days`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_cashier`
--
ALTER TABLE `code_cashier`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_chiglel`
--
ALTER TABLE `code_chiglel`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_department`
--
ALTER TABLE `code_department`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_edhorongo`
--
ALTER TABLE `code_edhorongo`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_edhorongo_other`
--
ALTER TABLE `code_edhorongo_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_expenseangilal`
--
ALTER TABLE `code_expenseangilal`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_expensebalancetype`
--
ALTER TABLE `code_expensebalancetype`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_expensebaltype`
--
ALTER TABLE `code_expensebaltype`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_expensetype`
--
ALTER TABLE `code_expensetype`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_expenseutga`
--
ALTER TABLE `code_expenseutga`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_frequency`
--
ALTER TABLE `code_frequency`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_incometype`
--
ALTER TABLE `code_incometype`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_income_priority`
--
ALTER TABLE `code_income_priority`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_initiator`
--
ALTER TABLE `code_initiator`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_material`
--
ALTER TABLE `code_material`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_materialprim`
--
ALTER TABLE `code_materialprim`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_orav_eseh`
--
ALTER TABLE `code_orav_eseh`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_penalty`
--
ALTER TABLE `code_penalty`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_position`
--
ALTER TABLE `code_position`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_position_other`
--
ALTER TABLE `code_position_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_reason`
--
ALTER TABLE `code_reason`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_room`
--
ALTER TABLE `code_room`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_status`
--
ALTER TABLE `code_status`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_talbai`
--
ALTER TABLE `code_talbai`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_torol`
--
ALTER TABLE `code_torol`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_transaction`
--
ALTER TABLE `code_transaction`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_unit`
--
ALTER TABLE `code_unit`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_userlevel_settings`
--
ALTER TABLE `code_userlevel_settings`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_utility`
--
ALTER TABLE `code_utility`
  MODIFY `utility_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_utility_rates`
--
ALTER TABLE `code_utility_rates`
  MODIFY `rate_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_valut`
--
ALTER TABLE `code_valut`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_violation`
--
ALTER TABLE `code_violation`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_week_config`
--
ALTER TABLE `code_week_config`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_woodprocctype`
--
ALTER TABLE `code_woodprocctype`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_woodsort`
--
ALTER TABLE `code_woodsort`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_woodtype`
--
ALTER TABLE `code_woodtype`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `code_workplace`
--
ALTER TABLE `code_workplace`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `companies`
--
ALTER TABLE `companies`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `company_licenses`
--
ALTER TABLE `company_licenses`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `contract1`
--
ALTER TABLE `contract1`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `contractor_request`
--
ALTER TABLE `contractor_request`
  MODIFY `request_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ebarimt_api_log`
--
ALTER TABLE `ebarimt_api_log`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ebarimt_customer`
--
ALTER TABLE `ebarimt_customer`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ebarimt_invoice`
--
ALTER TABLE `ebarimt_invoice`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ebarimt_invoice_item`
--
ALTER TABLE `ebarimt_invoice_item`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ebarimt_invoice_payment`
--
ALTER TABLE `ebarimt_invoice_payment`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ebarimt_reference_code`
--
ALTER TABLE `ebarimt_reference_code`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `forms`
--
ALTER TABLE `forms`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `form_submissions`
--
ALTER TABLE `form_submissions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `merchant`
--
ALTER TABLE `merchant`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `modules`
--
ALTER TABLE `modules`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `notification_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payments`
--
ALTER TABLE `payments`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `pending_request`
--
ALTER TABLE `pending_request`
  MODIFY `request_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `pos_session`
--
ALTER TABLE `pos_session`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `report_approvals`
--
ALTER TABLE `report_approvals`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `report_definitions`
--
ALTER TABLE `report_definitions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `report_income_plan`
--
ALTER TABLE `report_income_plan`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `report_transaction_locks`
--
ALTER TABLE `report_transaction_locks`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `request_approvers`
--
ALTER TABLE `request_approvers`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `request_print_form`
--
ALTER TABLE `request_print_form`
  MODIFY `id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `role_default_modules`
--
ALTER TABLE `role_default_modules`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `service_coding`
--
ALTER TABLE `service_coding`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_beltgenniiluulegch`
--
ALTER TABLE `tbl_beltgenniiluulegch`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_bills`
--
ALTER TABLE `tbl_bills`
  MODIFY `bill_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_bill_lines`
--
ALTER TABLE `tbl_bill_lines`
  MODIFY `line_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_contracter`
--
ALTER TABLE `tbl_contracter`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_currate`
--
ALTER TABLE `tbl_currate`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_discount`
--
ALTER TABLE `tbl_discount`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_discount_other`
--
ALTER TABLE `tbl_discount_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_employee`
--
ALTER TABLE `tbl_employee`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_employment`
--
ALTER TABLE `tbl_employment`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_employment_other`
--
ALTER TABLE `tbl_employment_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_employment_schedule`
--
ALTER TABLE `tbl_employment_schedule`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_expenseorg`
--
ALTER TABLE `tbl_expenseorg`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_hongololt`
--
ALTER TABLE `tbl_hongololt`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_sale`
--
ALTER TABLE `tbl_sale`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_sellingprice`
--
ALTER TABLE `tbl_sellingprice`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_sellingprice_other`
--
ALTER TABLE `tbl_sellingprice_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_tariff`
--
ALTER TABLE `tbl_tariff`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_utility_contracts`
--
ALTER TABLE `tbl_utility_contracts`
  MODIFY `contract_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tbl_workplace`
--
ALTER TABLE `tbl_workplace`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_contract`
--
ALTER TABLE `transactions_contract`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_contract_other`
--
ALTER TABLE `transactions_contract_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_expense`
--
ALTER TABLE `transactions_expense`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_expense_other`
--
ALTER TABLE `transactions_expense_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_income`
--
ALTER TABLE `transactions_income`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_income_other`
--
ALTER TABLE `transactions_income_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_inventory`
--
ALTER TABLE `transactions_inventory`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_inventory_other`
--
ALTER TABLE `transactions_inventory_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_order`
--
ALTER TABLE `transactions_order`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_order_other`
--
ALTER TABLE `transactions_order_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_plan`
--
ALTER TABLE `transactions_plan`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_plan_other`
--
ALTER TABLE `transactions_plan_other`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_pos`
--
ALTER TABLE `transactions_pos`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_posservices`
--
ALTER TABLE `transactions_posservices`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_test`
--
ALTER TABLE `transactions_test`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transactions_test_detail`
--
ALTER TABLE `transactions_test_detail`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transaction_temporaries`
--
ALTER TABLE `transaction_temporaries`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transaction_vat_summary`
--
ALTER TABLE `transaction_vat_summary`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_activity_log`
--
ALTER TABLE `user_activity_log`
  MODIFY `log_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_levels`
--
ALTER TABLE `user_levels`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_level_permissions`
--
ALTER TABLE `user_level_permissions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

-- --------------------------------------------------------

--
-- Structure for view `InventoryStockPerBranch`
--
DROP TABLE IF EXISTS `InventoryStockPerBranch`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `InventoryStockPerBranch`  AS SELECT `ti`.`company_id` AS `company_id`, `ti`.`bmtr_transbranch` AS `branch_id`, ifnull(`unified`.`primary_code`,`ti`.`bmtr_pmid`) AS `item_code`, `unified`.`pm_name` AS `pm_name`, sum((case when ((`ti`.`trtype` in ('bmor','asor')) and (`ti`.`bmtr_branchid` = `ti`.`bmtr_transbranch`)) then `ti`.`bmtr_sub` else 0 end)) AS `total_in_qty`, sum((case when ((`ti`.`trtype` in ('bmza','asza')) and (`ti`.`bmtr_frombranchid` = `ti`.`bmtr_transbranch`)) then `ti`.`bmtr_sub` when (`ti`.`trtype` in ('bmsh','assh')) then `ti`.`bmtr_sub` else 0 end)) AS `total_out_qty`, sum((case when ((`ti`.`trtype` in ('bmor','asor')) and (`ti`.`bmtr_branchid` = `ti`.`bmtr_transbranch`)) then (`ti`.`bmtr_sub` * `unified`.`cost`) else 0 end)) AS `total_in_value`, (sum((case when ((`ti`.`trtype` in ('bmor','asor')) and (`ti`.`bmtr_branchid` = `ti`.`bmtr_transbranch`)) then `ti`.`bmtr_sub` else 0 end)) - sum((case when ((`ti`.`trtype` in ('bmza','asza')) and (`ti`.`bmtr_frombranchid` = `ti`.`bmtr_transbranch`)) then `ti`.`bmtr_sub` when (`ti`.`trtype` in ('bmsh','assh')) then `ti`.`bmtr_sub` else 0 end))) AS `on_hand_qty`, (case when (sum((case when ((`ti`.`trtype` in ('bmor','asor')) and (`ti`.`bmtr_branchid` = `ti`.`bmtr_transbranch`)) then `ti`.`bmtr_sub` else 0 end)) > 0) then (sum((case when ((`ti`.`trtype` in ('bmor','asor')) and (`ti`.`bmtr_branchid` = `ti`.`bmtr_transbranch`)) then (`ti`.`bmtr_sub` * `unified`.`cost`) else 0 end)) / nullif(sum((case when ((`ti`.`trtype` in ('bmor','asor')) and (`ti`.`bmtr_branchid` = `ti`.`bmtr_transbranch`)) then `ti`.`bmtr_sub` else 0 end)),0)) else 0 end) AS `avg_cost`, round(((sum((case when ((`ti`.`trtype` in ('bmor','asor')) and (`ti`.`bmtr_branchid` = `ti`.`bmtr_transbranch`)) then `ti`.`bmtr_sub` else 0 end)) - sum((case when ((`ti`.`trtype` in ('bmza','asza')) and (`ti`.`bmtr_frombranchid` = `ti`.`bmtr_transbranch`)) then `ti`.`bmtr_sub` when (`ti`.`trtype` in ('bmsh','assh')) then `ti`.`bmtr_sub` else 0 end))) * (case when (sum((case when ((`ti`.`trtype` in ('bmor','asor')) and (`ti`.`bmtr_branchid` = `ti`.`bmtr_transbranch`)) then `ti`.`bmtr_sub` else 0 end)) > 0) then (sum((case when ((`ti`.`trtype` in ('bmor','asor')) and (`ti`.`bmtr_branchid` = `ti`.`bmtr_transbranch`)) then (`ti`.`bmtr_sub` * `unified`.`cost`) else 0 end)) / nullif(sum((case when ((`ti`.`trtype` in ('bmor','asor')) and (`ti`.`bmtr_branchid` = `ti`.`bmtr_transbranch`)) then `ti`.`bmtr_sub` else 0 end)),0)) else 0 end)),2) AS `inventory_value` FROM (`transactions_inventory` `ti` left join (select `cm`.`xmkod` AS `cost_code`,`cm`.`xmkod_cost` AS `cost`,`cm`.`xmkod_date` AS `cost_date`,`cmp`.`xmkodtk` AS `primary_code`,`cmp`.`xmkodtk_tkkod` AS `selling_code`,`cmp`.`xmkodtk_name` AS `pm_name`,`cmp`.`xmkodtk_muid` AS `pm_unit_id`,`cm`.`category` AS `categories`,0 AS `manufacturer_id`,'material_cost' AS `source_table` from (`code_material` `cm` left join `code_materialprim` `cmp` on((`cm`.`xmkod_tkkod` = `cmp`.`xmkodtk`))) union all select `cp`.`bkod` AS `cost_code`,`cp`.`bkod_cost` AS `cost`,`cp`.`bkod_date` AS `cost_date`,`cpp`.`bkod_Tk` AS `primary_code`,`cpp`.`bkod_Tk` AS `selling_code`,`cpp`.`bkod_Tk_name` AS `pm_name`,`cpp`.`bkod_Tk_muid` AS `pm_unit_id`,`cp`.`category` AS `categories`,`cp`.`bkod_prod` AS `manufacturer_id`,'product_cost' AS `source_table` from (`code_bkod` `cp` left join `code_bkodprim` `cpp` on((`cp`.`bkod_prim` = `cpp`.`bkod_Tk`))) union all select `cpp`.`bkod_Tk` AS `cost_code`,NULL AS `cost`,NULL AS `cost_date`,`cpp`.`bkod_Tk` AS `primary_code`,`cpp`.`bkod_Tk` AS `selling_code`,`cpp`.`bkod_Tk_name` AS `pm_name`,`cpp`.`bkod_Tk_muid` AS `pm_unit_id`,`cpp`.`category` AS `categories`,`cpp`.`bkod_Tk_prod` AS `manufacturer_id`,'product_prim' AS `source_table` from `code_bkodprim` `cpp` union all select `cmp`.`xmkodtk` AS `cost_code`,NULL AS `cost`,NULL AS `cost_date`,`cmp`.`xmkodtk` AS `primary_code`,`cmp`.`xmkodtk_tkkod` AS `selling_code`,`cmp`.`xmkodtk_name` AS `pm_name`,`cmp`.`xmkodtk_muid` AS `pm_unit_id`,`cmp`.`category` AS `categories`,0 AS `manufacturer_id`,'material_prim' AS `source_table` from `code_materialprim` `cmp` union all select `eh`.`ehkod` AS `cost_code`,`eh`.`ehkod_price` AS `cost`,`eh`.`ehkod_date` AS `cost_date`,`eh`.`ehkod` AS `primary_code`,`eh`.`ehkod` AS `selling_code`,`eh`.`ehkod_name` AS `pm_name`,`eh`.`ehkod_muid` AS `pm_unit_id`,`eh`.`category` AS `categories`,0 AS `manufacturer_id`,'property' AS `source_table` from `code_edhorongo` `eh`) `unified` on((`ti`.`bmtr_pmid` = `unified`.`cost_code`))) GROUP BY `ti`.`company_id`, `ti`.`bmtr_transbranch`, ifnull(`unified`.`primary_code`,`ti`.`bmtr_pmid`), `unified`.`pm_name` ;

-- --------------------------------------------------------

--
-- Structure for view `InventoryStockPerCompany`
--
DROP TABLE IF EXISTS `InventoryStockPerCompany`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `InventoryStockPerCompany`  AS SELECT `ti`.`company_id` AS `company_id`, sum((case when ((`ti`.`trtype` in ('bmor','asor')) and ((`ti`.`bmtr_frombranchid` is null) or (`ti`.`bmtr_frombranchid` = 0))) then `ti`.`bmtr_sub` else 0 end)) AS `fifo_lifo_qty`, sum((case when ((`ti`.`trtype` in ('bmor','asor')) and ((`ti`.`bmtr_frombranchid` is null) or (`ti`.`bmtr_frombranchid` = 0))) then (`ti`.`bmtr_sub` * `unified`.`cost`) else 0 end)) AS `fifo_lifo_value`, `unified`.`primary_code` AS `item_code`, `unified`.`pm_name` AS `pm_name`, sum((case when ((`ti`.`trtype` in ('bmor','asor')) and ((`ti`.`bmtr_frombranchid` is null) or (`ti`.`bmtr_frombranchid` = 0))) then `ti`.`bmtr_sub` when ((`ti`.`trtype` in ('bmor','asor')) and (`ti`.`bmtr_frombranchid` is not null)) then 0 else 0 end)) AS `total_in_qty`, sum((case when ((`ti`.`trtype` in ('bmza','asza')) and ((`ti`.`bmtr_branchid` is null) or (`ti`.`bmtr_branchid` = 0))) then `ti`.`bmtr_sub` when (`ti`.`trtype` in ('bmsh','assh')) then `ti`.`bmtr_sub` when ((`ti`.`trtype` in ('bmza','asza')) and (`ti`.`bmtr_branchid` is not null) and (`ti`.`bmtr_frombranchid` is not null)) then 0 else 0 end)) AS `total_out_qty`, sum((case when ((`ti`.`trtype` in ('bmor','asor')) and ((`ti`.`bmtr_frombranchid` is null) or (`ti`.`bmtr_frombranchid` = 0))) then (`ti`.`bmtr_sub` * `unified`.`cost`) when ((`ti`.`trtype` in ('bmor','asor')) and (`ti`.`bmtr_frombranchid` is not null)) then 0 else 0 end)) AS `total_in_value`, (sum((case when ((`ti`.`trtype` in ('bmor','asor')) and ((`ti`.`bmtr_frombranchid` is null) or (`ti`.`bmtr_frombranchid` = 0))) then `ti`.`bmtr_sub` else 0 end)) - sum((case when ((`ti`.`trtype` in ('bmza','asza')) and ((`ti`.`bmtr_branchid` is null) or (`ti`.`bmtr_branchid` = 0))) then `ti`.`bmtr_sub` when (`ti`.`trtype` in ('bmsh','assh')) then `ti`.`bmtr_sub` else 0 end))) AS `on_hand_qty`, (case when (sum((case when ((`ti`.`trtype` in ('bmor','asor')) and ((`ti`.`bmtr_frombranchid` is null) or (`ti`.`bmtr_frombranchid` = 0))) then `ti`.`bmtr_sub` else 0 end)) > 0) then (sum((case when ((`ti`.`trtype` in ('bmor','asor')) and ((`ti`.`bmtr_frombranchid` is null) or (`ti`.`bmtr_frombranchid` = 0))) then (`ti`.`bmtr_sub` * `unified`.`cost`) else 0 end)) / nullif(sum((case when ((`ti`.`trtype` in ('bmor','asor')) and ((`ti`.`bmtr_frombranchid` is null) or (`ti`.`bmtr_frombranchid` = 0))) then `ti`.`bmtr_sub` else 0 end)),0)) else 0 end) AS `avg_cost`, round(((sum((case when ((`ti`.`trtype` in ('bmor','asor')) and ((`ti`.`bmtr_frombranchid` is null) or (`ti`.`bmtr_frombranchid` = 0))) then `ti`.`bmtr_sub` else 0 end)) - sum((case when ((`ti`.`trtype` in ('bmza','asza')) and ((`ti`.`bmtr_branchid` is null) or (`ti`.`bmtr_branchid` = 0))) then `ti`.`bmtr_sub` when (`ti`.`trtype` in ('bmsh','assh')) then `ti`.`bmtr_sub` else 0 end))) * (case when (sum((case when ((`ti`.`trtype` in ('bmor','asor')) and ((`ti`.`bmtr_frombranchid` is null) or (`ti`.`bmtr_frombranchid` = 0))) then `ti`.`bmtr_sub` else 0 end)) > 0) then (sum((case when ((`ti`.`trtype` in ('bmor','asor')) and ((`ti`.`bmtr_frombranchid` is null) or (`ti`.`bmtr_frombranchid` = 0))) then (`ti`.`bmtr_sub` * `unified`.`cost`) else 0 end)) / nullif(sum((case when ((`ti`.`trtype` in ('bmor','asor')) and ((`ti`.`bmtr_frombranchid` is null) or (`ti`.`bmtr_frombranchid` = 0))) then `ti`.`bmtr_sub` else 0 end)),0)) else 0 end)),2) AS `inventory_value` FROM (`transactions_inventory` `ti` left join (select `cm`.`xmkod` AS `cost_code`,`cm`.`xmkod_cost` AS `cost`,`cm`.`xmkod_date` AS `cost_date`,`cmp`.`xmkodtk` AS `primary_code`,`cmp`.`xmkodtk_tkkod` AS `selling_code`,`cmp`.`xmkodtk_name` AS `pm_name`,`cmp`.`xmkodtk_muid` AS `pm_unit_id`,`cm`.`category` AS `categories`,0 AS `manufacturer_id`,'material_cost' AS `source_table` from (`code_material` `cm` left join `code_materialprim` `cmp` on((`cm`.`xmkod_tkkod` = `cmp`.`xmkodtk`))) union all select `cp`.`bkod` AS `cost_code`,`cp`.`bkod_cost` AS `cost`,`cp`.`bkod_date` AS `cost_date`,`cpp`.`bkod_Tk` AS `primary_code`,`cpp`.`bkod_Tk` AS `selling_code`,`cpp`.`bkod_Tk_name` AS `pm_name`,`cpp`.`bkod_Tk_muid` AS `pm_unit_id`,`cp`.`category` AS `categories`,`cp`.`bkod_prod` AS `manufacturer_id`,'product_cost' AS `source_table` from (`code_bkod` `cp` left join `code_bkodprim` `cpp` on((`cp`.`bkod_prim` = `cpp`.`bkod_Tk`))) union all select `cpp`.`bkod_Tk` AS `cost_code`,NULL AS `cost`,NULL AS `cost_date`,`cpp`.`bkod_Tk` AS `primary_code`,`cpp`.`bkod_Tk` AS `selling_code`,`cpp`.`bkod_Tk_name` AS `pm_name`,`cpp`.`bkod_Tk_muid` AS `pm_unit_id`,`cpp`.`category` AS `categories`,`cpp`.`bkod_Tk_prod` AS `manufacturer_id`,'product_prim' AS `source_table` from `code_bkodprim` `cpp` union all select `cmp`.`xmkodtk` AS `cost_code`,NULL AS `cost`,NULL AS `cost_date`,`cmp`.`xmkodtk` AS `primary_code`,`cmp`.`xmkodtk_tkkod` AS `selling_code`,`cmp`.`xmkodtk_name` AS `pm_name`,`cmp`.`xmkodtk_muid` AS `pm_unit_id`,`cmp`.`category` AS `categories`,0 AS `manufacturer_id`,'material_prim' AS `source_table` from `code_materialprim` `cmp` union all select `eh`.`ehkod` AS `cost_code`,`eh`.`ehkod_price` AS `cost`,`eh`.`ehkod_date` AS `cost_date`,`eh`.`ehkod` AS `primary_code`,`eh`.`ehkod` AS `selling_code`,`eh`.`ehkod_name` AS `pm_name`,`eh`.`ehkod_muid` AS `pm_unit_id`,`eh`.`category` AS `categories`,0 AS `manufacturer_id`,'property' AS `source_table` from `code_edhorongo` `eh`) `unified` on((`ti`.`bmtr_pmid` = `unified`.`cost_code`))) GROUP BY `ti`.`company_id`, `unified`.`primary_code`, `unified`.`pm_name` ;

-- --------------------------------------------------------

--
-- Structure for view `InventoryTransactionView`
--
DROP TABLE IF EXISTS `InventoryTransactionView`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `InventoryTransactionView`  AS SELECT `u`.`primary_code` AS `primary_code`, (select json_object('avg_cost',(sum((`ti`.`bmtr_sub` * `u`.`cost`)) / nullif(sum(`ti`.`bmtr_sub`),0)),'item_cost_qty',sum(`ti`.`bmtr_sub`),'item_cost_value',sum((`ti`.`bmtr_sub` * `u`.`cost`))) from `transactions_inventory` `ti` where ((`ti`.`trtype` in ('bmor','asor')) and ((`ti`.`bmtr_frombranchid` is null) or (`ti`.`bmtr_frombranchid` = 0)) and (`ti`.`bmtr_date` <= curdate()) and ((`ti`.`bmtr_pmid` = `u`.`cost_code`) or (`ti`.`bmtr_pmid` = `u`.`primary_code`)))) AS `cost_metrics`, (select `sp`.`selling_price` from `tbl_sellingprice` `sp` where ((`sp`.`product_primary_code` = `u`.`selling_code`) and (`sp`.`price_date` <= curdate()) and (`sp`.`company_id` = 2)) order by `sp`.`price_date` desc limit 1) AS `sell_price`, (select `d`.`discount_percent` from `tbl_discount` `d` where (((`d`.`inventory_code` = `u`.`cost_code`) or (`d`.`inventory_code` = `u`.`primary_code`) or (`d`.`inventory_code` = `u`.`selling_code`)) and ((`d`.`coupon_code` is null) or (`d`.`coupon_code` = '0')) and (`d`.`start_date` <= curdate()) and (`d`.`end_date` >= curdate()) and (`d`.`company_id` = 2) and (`d`.`branchid` = 4)) order by `d`.`start_date` desc limit 1) AS `discount_percent` FROM (select `unified_all`.`cost_code` AS `cost_code`,`unified_all`.`cost` AS `cost`,`unified_all`.`cost_date` AS `cost_date`,`unified_all`.`primary_code` AS `primary_code`,`unified_all`.`selling_code` AS `selling_code`,`unified_all`.`pm_name` AS `pm_name`,`unified_all`.`pm_unit_id` AS `pm_unit_id`,`unified_all`.`categories` AS `categories`,`unified_all`.`source_table` AS `source_table` from (select `cm`.`xmkod` AS `cost_code`,`cm`.`xmkod_cost` AS `cost`,`cm`.`xmkod_date` AS `cost_date`,`cmp`.`xmkodtk` AS `primary_code`,`cmp`.`xmkodtk_tkkod` AS `selling_code`,`cmp`.`xmkodtk_name` AS `pm_name`,`cmp`.`xmkodtk_muid` AS `pm_unit_id`,`cm`.`category` AS `categories`,'material_cost' AS `source_table` from (`code_material` `cm` left join `code_materialprim` `cmp` on((`cm`.`xmkod_tkkod` = `cmp`.`xmkodtk`))) union all select `cp`.`bkod` AS `cost_code`,`cp`.`bkod_cost` AS `cost`,`cp`.`bkod_date` AS `cost_date`,`cpp`.`bkod_Tk` AS `primary_code`,`cpp`.`bkod_Tk` AS `selling_code`,`cpp`.`bkod_Tk_name` AS `pm_name`,`cpp`.`bkod_Tk_muid` AS `pm_unit_id`,`cp`.`category` AS `categories`,'product_cost' AS `source_table` from (`code_bkod` `cp` left join `code_bkodprim` `cpp` on((`cp`.`bkod_prim` = `cpp`.`bkod_Tk`))) union all select `eh`.`id` AS `cost_code`,`eh`.`ehkod_price` AS `cost`,`eh`.`ehkod_date` AS `cost_date`,`eh`.`id` AS `primary_code`,`eh`.`id` AS `selling_code`,`eh`.`name` AS `pm_name`,`eh`.`ehkod_muid` AS `pm_unit_id`,`eh`.`category` AS `categories`,'property' AS `source_table` from `code_edhorongo` `eh`) `unified_all` where ((`unified_all`.`cost_code` = '600001') or (`unified_all`.`primary_code` = '600001'))) AS `u` GROUP BY `u`.`primary_code` ;

-- --------------------------------------------------------

--
-- Structure for view `UnifiedInventoryCode`
--
DROP TABLE IF EXISTS `UnifiedInventoryCode`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `UnifiedInventoryCode`  AS SELECT `unified`.`cost_code` AS `cost_code`, `unified`.`cost` AS `cost`, `unified`.`cost_date` AS `cost_date`, `unified`.`primary_code` AS `primary_code`, `unified`.`selling_code` AS `selling_code`, `unified`.`pm_name` AS `pm_name`, `unified`.`pm_unit_id` AS `pm_unit_id`, `unified`.`categories` AS `categories`, `unified`.`manufacturer_id` AS `manufacturer_id`, `unified`.`source_table` AS `source_table` FROM (select `cpp`.`bkod_Tk` AS `cost_code`,NULL AS `cost`,NULL AS `cost_date`,`cpp`.`bkod_Tk` AS `primary_code`,`cpp`.`bkod_Tk` AS `selling_code`,`cpp`.`bkod_Tk_name` AS `pm_name`,`cpp`.`bkod_Tk_muid` AS `pm_unit_id`,`cpp`.`category` AS `categories`,`cpp`.`bkod_Tk_prod` AS `manufacturer_id`,'product_prim' AS `source_table` from `code_bkodprim` `cpp` union all select `cmp`.`xmkodtk` AS `cost_code`,NULL AS `cost`,NULL AS `cost_date`,`cmp`.`xmkodtk` AS `primary_code`,`cmp`.`xmkodtk_tkkod` AS `selling_code`,`cmp`.`xmkodtk_name` AS `pm_name`,`cmp`.`xmkodtk_muid` AS `pm_unit_id`,`cmp`.`category` AS `categories`,0 AS `manufacturer_id`,'material_prim' AS `source_table` from `code_materialprim` `cmp` union all select `eh`.`ehkod` AS `cost_code`,`eh`.`ehkod_price` AS `cost`,`eh`.`ehkod_date` AS `cost_date`,`eh`.`ehkod` AS `primary_code`,`eh`.`ehkod` AS `selling_code`,`eh`.`ehkod_name` AS `pm_name`,`eh`.`ehkod_muid` AS `pm_unit_id`,`eh`.`category` AS `categories`,0 AS `manufacturer_id`,'property' AS `source_table` from `code_edhorongo` `eh`) AS `unified` ORDER BY `unified`.`cost_code` ASC, `unified`.`pm_name` ASC ;

-- --------------------------------------------------------

--
-- Structure for view `unified_lookup`
--
DROP TABLE IF EXISTS `unified_lookup`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `unified_lookup`  AS SELECT `combined`.`cost_code` AS `cost_code`, max(`combined`.`cost`) AS `cost`, max(`combined`.`primary_code`) AS `primary_code`, max(`combined`.`selling_code`) AS `selling_code`, max(`combined`.`pm_name`) AS `pm_name`, max(`combined`.`pm_unit_id`) AS `pm_unit_id`, max(`combined`.`categories`) AS `categories`, max(`combined`.`manufacturer_id`) AS `manufacturer_id`, max(`combined`.`source_table`) AS `source_table` FROM (select distinct `cm`.`xmkod` AS `cost_code`,`cm`.`xmkod_cost` AS `cost`,`cmp`.`xmkodtk` AS `primary_code`,`cmp`.`xmkodtk_tkkod` AS `selling_code`,`cmp`.`xmkodtk_name` AS `pm_name`,`cmp`.`xmkodtk_muid` AS `pm_unit_id`,`cm`.`category` AS `categories`,0 AS `manufacturer_id`,'material_cost' AS `source_table` from (`code_material` `cm` left join `code_materialprim` `cmp` on((`cm`.`xmkod_tkkod` = `cmp`.`xmkodtk`))) union all select distinct `cp`.`bkod` AS `cost_code`,`cp`.`bkod_cost` AS `cost`,`cpp`.`bkod_Tk` AS `primary_code`,`cpp`.`bkod_Tk` AS `selling_code`,`cpp`.`bkod_Tk_name` AS `pm_name`,`cpp`.`bkod_Tk_muid` AS `pm_unit_id`,`cp`.`category` AS `categories`,`cp`.`bkod_prod` AS `manufacturer_id`,'product_cost' AS `source_table` from (`code_bkod` `cp` left join `code_bkodprim` `cpp` on((`cp`.`bkod_prim` = `cpp`.`bkod_Tk`))) union all select distinct `cpp`.`bkod_Tk` AS `cost_code`,NULL AS `cost`,`cpp`.`bkod_Tk` AS `primary_code`,`cpp`.`bkod_Tk` AS `selling_code`,`cpp`.`bkod_Tk_name` AS `pm_name`,`cpp`.`bkod_Tk_muid` AS `pm_unit_id`,`cpp`.`category` AS `categories`,`cpp`.`bkod_Tk_prod` AS `manufacturer_id`,'product_prim' AS `source_table` from `code_bkodprim` `cpp` union all select distinct `cmp`.`xmkodtk` AS `cost_code`,NULL AS `cost`,`cmp`.`xmkodtk` AS `primary_code`,`cmp`.`xmkodtk_tkkod` AS `selling_code`,`cmp`.`xmkodtk_name` AS `pm_name`,`cmp`.`xmkodtk_muid` AS `pm_unit_id`,`cmp`.`category` AS `categories`,0 AS `manufacturer_id`,'material_prim' AS `source_table` from `code_materialprim` `cmp` union all select distinct `eh`.`ehkod` AS `cost_code`,`eh`.`ehkod_price` AS `cost`,`eh`.`ehkod` AS `primary_code`,`eh`.`ehkod` AS `selling_code`,`eh`.`ehkod_name` AS `pm_name`,`eh`.`ehkod_muid` AS `pm_unit_id`,`eh`.`category` AS `categories`,0 AS `manufacturer_id`,'property' AS `source_table` from `code_edhorongo` `eh`) AS `combined` GROUP BY `combined`.`cost_code` ;

-- --------------------------------------------------------

--
-- Structure for view `view_inventory_report_summary`
--
DROP TABLE IF EXISTS `view_inventory_report_summary`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `view_inventory_report_summary`  AS SELECT `inv`.`sp_primary_code` AS `primary_code`, `inv`.`sp_pm_name` AS `pm_name`, `inv`.`sp_pm_unit_id` AS `pm_unit_id`, sum((case when ((`tx`.`inventory_stock` = 1) and (`inv`.`bmtr_date` = '2025-01-01')) then ifnull(`inv`.`bmtr_acc`,0) else 0 end)) AS `opening_acc`, sum((case when ((`tx`.`inventory_stock` = 1) and (`inv`.`bmtr_date` = '2025-01-01')) then ifnull(`inv`.`bmtr_sub`,0) else 0 end)) AS `opening_sub`, sum((case when ((`tx`.`trn_affects_stock` = 1) and (`inv`.`bmtr_date` >= '2025-01-01') and (`inv`.`bmtr_date` < '2025-08-01') and (`tx`.`trn_inventory_change` = 'increase')) then ifnull(`inv`.`bmtr_acc`,0) else 0 end)) AS `increase_acc`, sum((case when ((`tx`.`trn_affects_stock` = 1) and (`inv`.`bmtr_date` >= '2025-01-01') and (`inv`.`bmtr_date` < '2025-08-01') and (`tx`.`trn_inventory_change` = 'increase')) then ifnull(`inv`.`bmtr_sub`,0) else 0 end)) AS `increase_sub`, sum((case when ((`tx`.`trn_affects_stock` = 1) and (`inv`.`bmtr_date` >= '2025-01-01') and (`inv`.`bmtr_date` < '2025-08-01') and (`tx`.`trn_inventory_change` = 'decrease')) then ifnull(`inv`.`bmtr_acc`,0) else 0 end)) AS `decrease_acc`, sum((case when ((`tx`.`trn_affects_stock` = 1) and (`inv`.`bmtr_date` >= '2025-01-01') and (`inv`.`bmtr_date` < '2025-08-01') and (`tx`.`trn_inventory_change` = 'decrease')) then ifnull(`inv`.`bmtr_sub`,0) else 0 end)) AS `decrease_sub`, sum((case when ((`tx`.`inventory_stock` = 1) and (`inv`.`bmtr_date` = '2025-08-01')) then ifnull(`inv`.`bmtr_acc`,0) else 0 end)) AS `closing_acc`, sum((case when ((`tx`.`inventory_stock` = 1) and (`inv`.`bmtr_date` = '2025-08-01')) then ifnull(`inv`.`bmtr_sub`,0) else 0 end)) AS `closing_sub`, ((sum((case when ((`tx`.`inventory_stock` = 1) and (`inv`.`bmtr_date` = '2025-01-01')) then ifnull(`inv`.`bmtr_acc`,0) else 0 end)) + sum((case when ((`tx`.`trn_affects_stock` = 1) and (`inv`.`bmtr_date` >= '2025-01-01') and (`inv`.`bmtr_date` < '2025-08-01') and (`tx`.`trn_inventory_change` = 'increase')) then ifnull(`inv`.`bmtr_acc`,0) else 0 end))) - sum((case when ((`tx`.`trn_affects_stock` = 1) and (`inv`.`bmtr_date` >= '2025-01-01') and (`inv`.`bmtr_date` < '2025-08-01') and (`tx`.`trn_inventory_change` = 'decrease')) then ifnull(`inv`.`bmtr_acc`,0) else 0 end))) AS `calculated_closing_acc`, (((sum((case when ((`tx`.`inventory_stock` = 1) and (`inv`.`bmtr_date` = '2025-07-01')) then ifnull(`inv`.`bmtr_sub`,0) else 0 end)) + sum((case when ((`tx`.`trn_affects_stock` = 1) and (`inv`.`bmtr_date` >= '2025-07-01') and (`inv`.`bmtr_date` < '2025-08-01') and (`tx`.`trn_inventory_change` = 'increase')) then ifnull(`inv`.`bmtr_sub`,0) else 0 end))) - sum((case when ((`tx`.`trn_affects_stock` = 1) and (`inv`.`bmtr_date` >= '2025-07-01') and (`inv`.`bmtr_date` < '2025-08-01') and (`tx`.`trn_inventory_change` = 'decrease')) then ifnull(`inv`.`bmtr_sub`,0) else 0 end))) - sum((case when ((`tx`.`inventory_stock` = 1) and (`inv`.`bmtr_date` = '2025-08-01')) then ifnull(`inv`.`bmtr_sub`,0) else 0 end))) AS `diff_vs_actual_closing_sub` FROM (`code_transaction` `tx` join `transactions_inventory` `inv` on((`inv`.`TransType` = `tx`.`UITransType`))) WHERE ((`tx`.`trn_category` = 'inventory') AND (`inv`.`bmtr_transbranch` = 4)) GROUP BY `inv`.`sp_primary_code`, `inv`.`sp_pm_name`, `inv`.`sp_pm_unit_id` HAVING ((`opening_sub` <> 0) OR (`increase_sub` <> 0) OR (`decrease_sub` <> 0) OR (`closing_sub` <> 0)) ;

-- --------------------------------------------------------

--
-- Structure for view `view_transactions_income`
--
DROP TABLE IF EXISTS `view_transactions_income`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `view_transactions_income`  AS SELECT `transactions_income`.`id` AS `id`, `transactions_income`.`or_num` AS `or_num`, `transactions_income`.`ortr_transbranch` AS `ortr_transbranch`, `transactions_income`.`or_o_barimt` AS `or_o_barimt`, `transactions_income`.`company_id` AS `company_id`, `transactions_income`.`branch_id` AS `branch_id`, `transactions_income`.`or_g_id` AS `or_g_id`, `transactions_income`.`or_burtgel` AS `or_burtgel`, `transactions_income`.`or_chig` AS `or_chig`, `transactions_income`.`or_torol` AS `or_torol`, `transactions_income`.`or_type_id` AS `or_type_id`, `transactions_income`.`or_av_now` AS `or_av_now`, `transactions_income`.`or_av_time` AS `or_av_time`, `transactions_income`.`or_date` AS `or_date`, `transactions_income`.`orcash_or_id` AS `orcash_or_id`, `transactions_income`.`or_or` AS `or_or`, `transactions_income`.`or_vallut_id` AS `or_vallut_id`, `transactions_income`.`or_valut_choice` AS `or_valut_choice`, `transactions_income`.`or_bar_suu` AS `or_bar_suu`, `transactions_income`.`or_bcode` AS `or_bcode`, `transactions_income`.`or_orderid` AS `or_orderid`, `transactions_income`.`or_tailbar1` AS `or_tailbar1`, `transactions_income`.`orBurtgel_rd` AS `orBurtgel_rd`, `transactions_income`.`or_eb` AS `or_eb`, `transactions_income`.`or_bank` AS `or_bank`, `transactions_income`.`or_uglug_id` AS `or_uglug_id`, `transactions_income`.`or_emp_receiver` AS `or_emp_receiver`, `transactions_income`.`or_tur_receiver` AS `or_tur_receiver`, `transactions_income`.`or_other_receiver` AS `or_other_receiver`, `transactions_income`.`or_org_id` AS `or_org_id`, `transactions_income`.`TRTYPENAME` AS `TRTYPENAME`, `transactions_income`.`trtype` AS `trtype`, `transactions_income`.`TransType` AS `TransType`, `transactions_income`.`ORGANIZATION` AS `ORGANIZATION`, `transactions_income`.`ROOMID` AS `ROOMID`, `transactions_income`.`USERID` AS `USERID`, `transactions_income`.`LOCATION` AS `LOCATION`, `transactions_income`.`deviceid` AS `deviceid`, `transactions_income`.`devicename` AS `devicename`, `transactions_income`.`rawdata` AS `rawdata`, `transactions_income`.`actime` AS `actime`, `transactions_income`.`rectime` AS `rectime`, `transactions_income`.`ortr_state` AS `ortr_state`, `transactions_income`.`ortr_id` AS `ortr_id`, `transactions_income`.`ortr_confirm` AS `ortr_confirm`, `transactions_income`.`ortr_confirm_date` AS `ortr_confirm_date`, `transactions_income`.`ortr_confirm_emp` AS `ortr_confirm_emp`, `transactions_income`.`ortr_edit_date` AS `ortr_edit_date`, `transactions_income`.`ortr_edit_emp` AS `ortr_edit_emp`, `transactions_income`.`ortr_edit_cause` AS `ortr_edit_cause`, `transactions_income`.`ortr_del_date` AS `ortr_del_date`, `transactions_income`.`ortr_del_emp` AS `ortr_del_emp`, `transactions_income`.`ortr_del_cause` AS `ortr_del_cause`, `transactions_income`.`ortr_check_date` AS `ortr_check_date`, `transactions_income`.`ortr_checkyn` AS `ortr_checkyn`, `transactions_income`.`ortr_check_emp` AS `ortr_check_emp`, `transactions_income`.`ortr_check_cause` AS `ortr_check_cause` FROM `transactions_income` ;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `code_bkodprim`
--
ALTER TABLE `code_bkodprim`
  ADD CONSTRAINT `code_bkodprim_ibfk_1` FOREIGN KEY (`bkod_Tk_muid`) REFERENCES `code_unit` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `code_expensebaltype`
--
ALTER TABLE `code_expensebaltype`
  ADD CONSTRAINT `code_expensebaltype_ibfk_2` FOREIGN KEY (`k2`) REFERENCES `code_expenseangilal` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `code_expensebaltype_ibfk_3` FOREIGN KEY (`k3`) REFERENCES `code_expensetype` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `code_expensebaltype_ibfk_4` FOREIGN KEY (`k4`) REFERENCES `code_expenseutga` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `code_expensebaltype_ibfk_5` FOREIGN KEY (`k5`) REFERENCES `code_expensebalancetype` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `code_expensebaltype_ibfk_6` FOREIGN KEY (`k6_`) REFERENCES `code_expensebalancetype` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `code_materialprim`
--
ALTER TABLE `code_materialprim`
  ADD CONSTRAINT `code_materialprim_ibfk_1` FOREIGN KEY (`xmkodtk_muid`) REFERENCES `code_unit` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `code_utility_band`
--
ALTER TABLE `code_utility_band`
  ADD CONSTRAINT `fk_cub_band` FOREIGN KEY (`band_id`) REFERENCES `code_band` (`band_id`),
  ADD CONSTRAINT `fk_cub_util` FOREIGN KEY (`utility_id`) REFERENCES `code_utility` (`utility_id`);

--
-- Constraints for table `code_utility_rates`
--
ALTER TABLE `code_utility_rates`
  ADD CONSTRAINT `code_utility_rates_ibfk_2` FOREIGN KEY (`utorol_id`) REFERENCES `code_torol` (`torol_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `code_utility_rates_ibfk_3` FOREIGN KEY (`uchig_id`) REFERENCES `code_chiglel` (`chig_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_rate_band` FOREIGN KEY (`band_id`) REFERENCES `code_band` (`band_id`),
  ADD CONSTRAINT `fk_rate_util` FOREIGN KEY (`utility_id`) REFERENCES `code_utility` (`utility_id`);

--
-- Constraints for table `company_module_licenses`
--
ALTER TABLE `company_module_licenses`
  ADD CONSTRAINT `company_module_licenses_ibfk_2` FOREIGN KEY (`module_key`) REFERENCES `modules` (`module_key`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `company_module_licenses_ibfk_3` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `contractor_request`
--
ALTER TABLE `contractor_request`
  ADD CONSTRAINT `fk_request_contract` FOREIGN KEY (`contract_g_id`) REFERENCES `transactions_contract` (`g_id`),
  ADD CONSTRAINT `fk_request_utility_band` FOREIGN KEY (`util_id`,`band_id`) REFERENCES `code_utility_rates` (`utility_id`, `band_id`);

--
-- Constraints for table `ebarimt_api_log`
--
ALTER TABLE `ebarimt_api_log`
  ADD CONSTRAINT `fk_invoice_log` FOREIGN KEY (`invoice_id`) REFERENCES `ebarimt_invoice` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `ebarimt_invoice`
--
ALTER TABLE `ebarimt_invoice`
  ADD CONSTRAINT `fk_ebarimt_invoice_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchant` (`id`);

--
-- Constraints for table `ebarimt_invoice_item`
--
ALTER TABLE `ebarimt_invoice_item`
  ADD CONSTRAINT `fk_invoice_item` FOREIGN KEY (`invoice_id`) REFERENCES `ebarimt_invoice` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `ebarimt_invoice_payment`
--
ALTER TABLE `ebarimt_invoice_payment`
  ADD CONSTRAINT `fk_invoice_payment` FOREIGN KEY (`invoice_id`) REFERENCES `ebarimt_invoice` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `merchant`
--
ALTER TABLE `merchant`
  ADD CONSTRAINT `merchant_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`);

--
-- Constraints for table `modules`
--
ALTER TABLE `modules`
  ADD CONSTRAINT `fk_modules_parent` FOREIGN KEY (`parent_key`) REFERENCES `modules` (`module_key`);

--
-- Constraints for table `request_approvers`
--
ALTER TABLE `request_approvers`
  ADD CONSTRAINT `fk_request_approvers_request` FOREIGN KEY (`request_id`) REFERENCES `contractor_request` (`request_id`) ON DELETE CASCADE;

--
-- Constraints for table `request_seen_counts`
--
ALTER TABLE `request_seen_counts`
  ADD CONSTRAINT `fk_seen_emp` FOREIGN KEY (`emp_id`) REFERENCES `tbl_employment` (`employment_emp_id`);

--
-- Constraints for table `role_default_modules`
--
ALTER TABLE `role_default_modules`
  ADD CONSTRAINT `role_default_modules_ibfk_2` FOREIGN KEY (`module_key`) REFERENCES `modules` (`module_key`);

--
-- Constraints for table `role_module_permissions`
--
ALTER TABLE `role_module_permissions`
  ADD CONSTRAINT `role_module_permissions_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `role_module_permissions_ibfk_3` FOREIGN KEY (`module_key`) REFERENCES `modules` (`module_key`);

--
-- Constraints for table `tbl_beltgenniiluulegch`
--
ALTER TABLE `tbl_beltgenniiluulegch`
  ADD CONSTRAINT `tbl_beltgenniiluulegch_ibfk_1` FOREIGN KEY (`manuf_id`) REFERENCES `tbl_contracter` (`manuf_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `tbl_bills`
--
ALTER TABLE `tbl_bills`
  ADD CONSTRAINT `fk_bills_contract` FOREIGN KEY (`contract_id`) REFERENCES `tbl_utility_contracts` (`contract_id`);

--
-- Constraints for table `tbl_bill_lines`
--
ALTER TABLE `tbl_bill_lines`
  ADD CONSTRAINT `fk_billlines_request` FOREIGN KEY (`request_id`) REFERENCES `contractor_request` (`request_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_bl_bill` FOREIGN KEY (`bill_id`) REFERENCES `tbl_bills` (`bill_id`),
  ADD CONSTRAINT `fk_bl_util` FOREIGN KEY (`utility_id`) REFERENCES `code_utility` (`utility_id`),
  ADD CONSTRAINT `tbl_bill_lines_ibfk_1` FOREIGN KEY (`unit`) REFERENCES `code_unit` (`unit_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `tbl_currate`
--
ALTER TABLE `tbl_currate`
  ADD CONSTRAINT `tbl_currate_ibfk_1` FOREIGN KEY (`Valutid`) REFERENCES `code_valut` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `tbl_discount`
--
ALTER TABLE `tbl_discount`
  ADD CONSTRAINT `tbl_discount_ibfk_1` FOREIGN KEY (`branchid`) REFERENCES `code_branches` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `tbl_employment`
--
ALTER TABLE `tbl_employment`
  ADD CONSTRAINT `tbl_employment_ibfk_1` FOREIGN KEY (`employment_company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `tbl_employment_ibfk_2` FOREIGN KEY (`employment_emp_id`) REFERENCES `tbl_employee` (`emp_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `tbl_employment_ibfk_5` FOREIGN KEY (`employment_user_level`) REFERENCES `user_levels` (`userlevel_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `tbl_employment_ibfk_6` FOREIGN KEY (`employment_senior_empid`) REFERENCES `tbl_employee` (`emp_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `tbl_employment_ibfk_7` FOREIGN KEY (`employment_senior_plan_empid`) REFERENCES `tbl_employee` (`emp_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `tbl_expenseorg`
--
ALTER TABLE `tbl_expenseorg`
  ADD CONSTRAINT `tbl_expenseorg_ibfk_1` FOREIGN KEY (`z_org_id`) REFERENCES `tbl_contracter` (`manuf_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `tbl_tariff`
--
ALTER TABLE `tbl_tariff`
  ADD CONSTRAINT `tbl_tariff_ibfk_2` FOREIGN KEY (`mu`) REFERENCES `code_unit` (`unit_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `transactions_contract`
--
ALTER TABLE `transactions_contract`
  ADD CONSTRAINT `transactions_contract_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_contract_ibfk_2` FOREIGN KEY (`branchid`) REFERENCES `code_branches` (`branch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_contract_ibfk_3` FOREIGN KEY (`confirm_emp`) REFERENCES `tbl_employee` (`emp_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `transactions_expense`
--
ALTER TABLE `transactions_expense`
  ADD CONSTRAINT `transactions_expense_ibfk_3` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_expense_ibfk_4` FOREIGN KEY (`z_from`) REFERENCES `code_cashier` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_expense_ibfk_5` FOREIGN KEY (`TransType`) REFERENCES `code_transaction` (`UITransType`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `transactions_income`
--
ALTER TABLE `transactions_income`
  ADD CONSTRAINT `fk_income_request` FOREIGN KEY (`request_id`) REFERENCES `contractor_request` (`request_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_transactions_income_invoice` FOREIGN KEY (`ebarimt_invoice_id`) REFERENCES `ebarimt_invoice` (`id`),
  ADD CONSTRAINT `fk_transactions_income_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchant` (`id`),
  ADD CONSTRAINT `transactions_income_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_income_ibfk_2` FOREIGN KEY (`TransType`) REFERENCES `code_transaction` (`UITransType`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_income_ibfk_3` FOREIGN KEY (`branch_id`) REFERENCES `code_branches` (`branch_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `transactions_inventory`
--
ALTER TABLE `transactions_inventory`
  ADD CONSTRAINT `transactions_inventory_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_inventory_ibfk_2` FOREIGN KEY (`sp_pm_unit_id`) REFERENCES `code_unit` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `transactions_order`
--
ALTER TABLE `transactions_order`
  ADD CONSTRAINT `transactions_order_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_order_ibfk_2` FOREIGN KEY (`sp_pm_unit_id`) REFERENCES `code_unit` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `transactions_plan`
--
ALTER TABLE `transactions_plan`
  ADD CONSTRAINT `transactions_plan_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `transactions_pos`
--
ALTER TABLE `transactions_pos`
  ADD CONSTRAINT `transactions_pos_ibfk_1` FOREIGN KEY (`branch_id`) REFERENCES `code_branches` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_pos_ibfk_2` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_pos_ibfk_3` FOREIGN KEY (`emp_id`) REFERENCES `tbl_employee` (`emp_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_pos_ibfk_5` FOREIGN KEY (`status`) REFERENCES `code_status` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_pos_ibfk_6` FOREIGN KEY (`payment_type`) REFERENCES `code_cashier` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `transactions_pos_ibfk_8` FOREIGN KEY (`cashback_payment_type`) REFERENCES `code_cashier` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `transactions_posservices`
--
ALTER TABLE `transactions_posservices`
  ADD CONSTRAINT `transactions_posservices_ibfk_1` FOREIGN KEY (`transaction_id`) REFERENCES `transactions_pos` (`id`),
  ADD CONSTRAINT `transactions_posservices_ibfk_2` FOREIGN KEY (`service_id`) REFERENCES `service_coding` (`id`);

--
-- Constraints for table `transactions_test_detail`
--
ALTER TABLE `transactions_test_detail`
  ADD CONSTRAINT `fk_transactions_test_detail_transaction` FOREIGN KEY (`transaction_id`) REFERENCES `transactions_test` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `users_ibfk_1` FOREIGN KEY (`empid`) REFERENCES `tbl_employment` (`employment_emp_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `users_ibfk_2` FOREIGN KEY (`empid`) REFERENCES `tbl_employee` (`emp_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

--
-- Constraints for table `user_level_permissions`
--
ALTER TABLE `user_level_permissions`
  ADD CONSTRAINT `user_level_permissions_ibfk_1` FOREIGN KEY (`userlevel_id`) REFERENCES `user_levels` (`userlevel_id`),
  ADD CONSTRAINT `user_level_permissions_ibfk_2` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
