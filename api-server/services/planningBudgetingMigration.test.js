import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const phase1TablesPath = new URL('../../db/migrations/2026-03-10_planning_budgeting_phase1_tables.sql', import.meta.url);
const phase1AlignmentPath = new URL('../../db/migrations/2026-03-10_planning_budgeting_phase1_constraint_alignment.sql', import.meta.url);
const phase23Path = new URL('../../db/migrations/2026-03-10_planning_budgeting_phase2_phase3.sql', import.meta.url);

test('planning and budgeting phase 1 migration defines core configuration-driven tables', () => {
  const sql = fs.readFileSync(phase1TablesPath, 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS plan_header/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS plan_line/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS budget_header/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS budget_line/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS business_rule_header/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS business_rule_condition/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS business_rule_action/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS business_dimension_map/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS rule_execution_log/);

  assert.match(sql, /rule_domain ENUM\('financial','planning','budgeting','inventory','notification','dashboard','ai','approval','security','generic'\)/);
  assert.match(sql, /action_type ENUM\('create_transaction','create_plan','create_budget_line','create_notification','write_journal','call_procedure','update_field','block_transaction','request_approval','ai_analyze','ai_notify'\)/);
});

test('planning and budgeting phase 1 alignment migration scopes natural keys by tenant', () => {
  const sql = fs.readFileSync(phase1AlignmentPath, 'utf8');

  assert.match(sql, /ADD UNIQUE KEY uq_plan_header_company_plan_no \(company_id, plan_no\)/);
  assert.match(sql, /ADD UNIQUE KEY uq_budget_header_company_budget_no \(company_id, budget_no\)/);
  assert.match(sql, /ADD UNIQUE KEY uq_business_rule_header_company_rule_code \(company_id, rule_code\)/);
});

test('planning and budgeting phase 2+3 migration extends dynamic engine and stored procedures', () => {
  const sql = fs.readFileSync(phase23Path, 'utf8');

  assert.match(sql, /ALTER TABLE code_transaction[\s\S]*supports_budget_check/);
  assert.match(sql, /ALTER TABLE notifications[\s\S]*plan_id BIGINT/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS dashboard_plan_budget_metrics/);
  assert.match(sql, /INSERT INTO modules \(module_key, label, parent_key, show_in_sidebar, show_in_header, company_id\)[\s\S]*planning_transactions/);

  assert.match(sql, /CREATE PROCEDURE sp_rule_evaluate_transaction/);
  assert.match(sql, /CREATE PROCEDURE sp_budget_validate_transaction/);
  assert.match(sql, /CREATE PROCEDURE sp_plan_rollup_status/);
  assert.match(sql, /CREATE PROCEDURE sp_plan_resource_validate/);
  assert.match(sql, /CREATE PROCEDURE sp_plan_generate_followup/);
  assert.match(sql, /CREATE PROCEDURE sp_budget_consume_from_transaction/);
  assert.match(sql, /CREATE PROCEDURE sp_dashboard_refresh_plan_budget_metrics/);
});
