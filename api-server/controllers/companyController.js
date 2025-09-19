import {
  listCompanies,
  insertTableRow,
  updateTableRow,
  deleteTableRowCascade,
  getEmploymentSession,
  getUserLevelActions,
  createCompanySeedBackup,
  listCompanySeedBackupsForUser,
  restoreCompanySeedBackup,
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
      backupMetadata = await createCompanySeedBackup(companyId, {
        backupName: trimmedBackupName,
        originalBackupName:
          typeof backupNameRaw === 'string' ? backupNameRaw : trimmedBackupName,
        requestedBy: req.user?.id ?? null,
        companyName:
          company.name || company.company_name || company.companyName || '',
      });
    }

    await deleteTableRowCascade('companies', companyId, companyId);
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
      (entry) => entry.companyId === sourceId && entry.fileName === fileName.trim(),
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
