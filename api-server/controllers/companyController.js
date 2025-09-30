import {
  listCompanies,
  insertTableRow,
  updateTableRow,
  deleteTableRowCascade,
  deleteUserLevelPermissionsForCompany,
  getPrimaryKeyColumns,
  getEmploymentSession,
  getUserLevelActions,
  createCompanySeedBackup,
  createCompanyFullBackup,
  listCompanySeedBackupsForUser,
  restoreCompanySeedBackup,
  restoreCompanyFullBackup,
} from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';

async function hasSystemSettingsAccess(req) {
  const session =
    req.session ||
    (await getEmploymentSession(req.user.empid, req.user.companyId));
  if (await hasAction(session, 'system_settings')) {
    return true;
  }
  const actions = await getUserLevelActions(req.user.userLevel);
  return !!actions?.permissions?.system_settings;
}

export async function listCompaniesHandler(req, res, next) {
  try {
    const companies = await listCompanies(req.user.empid);
    res.json(companies);
  } catch (err) {
    next(err);
  }
}

export async function createCompanyHandler(req, res, next) {
  try {
    res.locals.logTable = 'companies';
    const body = req.body || {};
    const { seedTables, seedRecords, overwrite = false, ...company } = body;
    company.created_by = req.user.empid;
    if (!(await hasSystemSettingsAccess(req))) {
      return res.sendStatus(403);
    }
    const shouldSeed =
      Object.prototype.hasOwnProperty.call(body, 'seedTables') ||
      Object.prototype.hasOwnProperty.call(body, 'seedRecords');
    const result = shouldSeed
      ? await insertTableRow(
          'companies',
          company,
          seedTables,
          seedRecords,
          overwrite,
          req.user.empid,
        )
      : await insertTableRow('companies', company);
    res.locals.insertId = result?.id;
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateCompanyHandler(req, res, next) {
  try {
    res.locals.logTable = 'companies';
    const updates = { ...req.body };
    delete updates.created_by;
    delete updates.created_at;
    if (!(await hasSystemSettingsAccess(req))) {
      return res.sendStatus(403);
    }
    await updateTableRow('companies', req.params.id, updates);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}

export async function deleteCompanyHandler(req, res, next) {
  try {
    res.locals.logTable = 'companies';
    if (!(await hasSystemSettingsAccess(req))) {
      return res.sendStatus(403);
    }
    const rawId = req.params.id;
    const companyId = Number(rawId);
    if (!Number.isFinite(companyId) || companyId <= 0) {
      return res.status(400).json({ message: 'A valid company id is required' });
    }

    const ownedCompanies = await listCompanies(req.user.empid);
    const company = (ownedCompanies || []).find((c) => Number(c.id) === companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    const createBackup = !!req.body?.createBackup;
    const backupScopeRaw =
      typeof req.body?.backupType === 'string'
        ? req.body.backupType
        : typeof req.body?.backupScope === 'string'
        ? req.body.backupScope
        : '';
    const normalizedScope = String(backupScopeRaw || '')
      .trim()
      .toLowerCase();
    const backupStrategy = ['full', 'full-data', 'data', 'all'].includes(
      normalizedScope,
    )
      ? 'full'
      : 'seed';
    const backupNameRaw = req.body?.backupName;
    const trimmedBackupName =
      typeof backupNameRaw === 'string' ? backupNameRaw.trim() : '';
    if (createBackup && !trimmedBackupName) {
      return res
        .status(400)
        .json({ message: 'backupName is required when createBackup is true' });
    }

    let backupMetadata = null;
    if (createBackup) {
      const backupOptions = {
        backupName: trimmedBackupName,
        originalBackupName:
          typeof backupNameRaw === 'string' ? backupNameRaw : trimmedBackupName,
        requestedBy: req.user?.id ?? null,
        companyName:
          company.name || company.company_name || company.companyName || '',
      };
      backupMetadata =
        backupStrategy === 'full'
          ? await createCompanyFullBackup(companyId, backupOptions)
          : await createCompanySeedBackup(companyId, backupOptions);
    }

    const tenantCompanyId = company.company_id;
    const pkCols = await getPrimaryKeyColumns('companies');
    let cascadeIdentifier;
    if (Array.isArray(pkCols) && pkCols.length > 0) {
      const idParts = pkCols.map((col) => company[col]);
      if (idParts.some((part) => part === undefined)) {
        cascadeIdentifier = `${tenantCompanyId}-${company.id}`;
      } else if (pkCols.length === 1) {
        cascadeIdentifier = idParts[0];
      } else {
        cascadeIdentifier = idParts.join('-');
      }
    } else {
      cascadeIdentifier = `${tenantCompanyId}-${company.id}`;
    }
    await deleteTableRowCascade(
      'companies',
      cascadeIdentifier,
      company.id,
      {
        tenantCompanyId,
        // Ensure tenant-specific permission rows are removed in the same
        // transaction so they cannot block the cascade via FK constraints.
        beforeDelete: (conn) =>
          deleteUserLevelPermissionsForCompany(company.id, conn),
        deletedBy: req.user?.empid ?? null,
      },
    );
    res.status(200).json({
      backup: backupMetadata || null,
      company: {
        id: companyId,
        name: company.name || company.company_name || company.companyName || '',
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
}

export async function listCompanyBackupsHandler(req, res, next) {
  try {
    if (!(await hasSystemSettingsAccess(req))) {
      return res.sendStatus(403);
    }
    const ownedCompanies = await listCompanies(req.user.empid);
    const userId = req.user?.id;
    const backups = await listCompanySeedBackupsForUser(userId, ownedCompanies);
    res.json({ backups });
  } catch (err) {
    next(err);
  }
}

export async function restoreCompanyBackupHandler(req, res, next) {
  try {
    if (!(await hasSystemSettingsAccess(req))) {
      return res.sendStatus(403);
    }
    const body = req.body || {};
    const { sourceCompanyId, targetCompanyId, fileName } = body;
    const requestedTypeRaw =
      typeof body.type === 'string' ? body.type.trim().toLowerCase() : '';
    if (requestedTypeRaw && requestedTypeRaw !== 'seed') {
      return res.status(400).json({
        message: 'Use the full restore endpoint for tenant data backups.',
      });
    }
    const sourceId = Number(sourceCompanyId);
    const targetId = Number(targetCompanyId);
    if (!Number.isFinite(sourceId) || sourceId <= 0) {
      return res
        .status(400)
        .json({ message: 'sourceCompanyId is required and must be positive' });
    }
    if (!Number.isFinite(targetId) || targetId <= 0) {
      return res
        .status(400)
        .json({ message: 'targetCompanyId is required and must be positive' });
    }
    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ message: 'fileName is required' });
    }

    const ownedCompanies = await listCompanies(req.user.empid);
    const userId = req.user?.id;
    const targetCompany = (ownedCompanies || []).find(
      (c) => Number(c.id) === targetId,
    );
    if (!targetCompany) {
      return res.status(403).json({ message: 'Target company not found' });
    }

    const accessibleBackups = await listCompanySeedBackupsForUser(
      userId,
      ownedCompanies,
    );
    const hasAccess = accessibleBackups.some(
      (entry) =>
        entry.companyId === sourceId &&
        entry.fileName === fileName.trim() &&
        (entry.type ?? 'seed') === 'seed',
    );
    if (!hasAccess) {
      return res.status(404).json({ message: 'Backup not found' });
    }

    const summary = await restoreCompanySeedBackup(
      sourceId,
      fileName,
      targetId,
      req.user?.empid ?? null,
    );
    res.json({ summary });
  } catch (err) {
    if (err?.status) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    next(err);
  }
}

export async function restoreCompanyFullBackupHandler(req, res, next) {
  try {
    if (!(await hasSystemSettingsAccess(req))) {
      return res.sendStatus(403);
    }
    const body = req.body || {};
    const { sourceCompanyId, targetCompanyId, fileName } = body;
    const typeHint =
      typeof body.type === 'string' ? body.type.trim().toLowerCase() : '';
    if (typeHint && typeHint !== 'full' && typeHint !== 'data') {
      return res.status(400).json({
        message: 'Full restore requires a tenant data snapshot.',
      });
    }
    const sourceId = Number(sourceCompanyId);
    const targetId = Number(targetCompanyId);
    if (!Number.isFinite(sourceId) || sourceId <= 0) {
      return res
        .status(400)
        .json({ message: 'sourceCompanyId is required and must be positive' });
    }
    if (!Number.isFinite(targetId) || targetId <= 0) {
      return res
        .status(400)
        .json({ message: 'targetCompanyId is required and must be positive' });
    }
    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ message: 'fileName is required' });
    }

    const ownedCompanies = await listCompanies(req.user.empid);
    const userId = req.user?.id;
    const targetCompany = (ownedCompanies || []).find(
      (c) => Number(c.id) === targetId,
    );
    if (!targetCompany) {
      return res.status(403).json({ message: 'Target company not found' });
    }

    const accessibleBackups = await listCompanySeedBackupsForUser(
      userId,
      ownedCompanies,
    );
    const hasAccess = accessibleBackups.some(
      (entry) =>
        entry.companyId === sourceId &&
        entry.fileName === fileName.trim() &&
        entry.type === 'full',
    );
    if (!hasAccess) {
      return res.status(404).json({ message: 'Backup not found' });
    }

    const summary = await restoreCompanyFullBackup(
      sourceId,
      fileName,
      targetId,
      req.user?.empid ?? null,
    );
    res.json({ summary });
  } catch (err) {
    if (err?.status) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    next(err);
  }
}
