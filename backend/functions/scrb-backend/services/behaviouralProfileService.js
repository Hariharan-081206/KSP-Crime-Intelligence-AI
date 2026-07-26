/**
 * services/behaviouralProfileService.js
 *
 * SCRB AI Investigation System — Behavioural Profiling Engine
 * ---------------------------------------------------------------------------
 * Given any investigator input (caseId, crime number, accused name, district,
 * crime head, crime type, financial transaction, bank account, or a free-text
 * natural language question), this engine:
 *
 *   1. Resolves the input into a concrete set of matching Accused records
 *      (via QuickML intent detection + queryBuilderService + datastoreService)
 *   2. Expands relationships for each accused (via relationshipService)
 *   3. Runs crime / financial / temporal / geographic / network analysis
 *   4. Classifies behaviour, scores risk, predicts reoffending
 *   5. Produces a ranked list of full behavioural profiles + a natural
 *      language answer for the chat UI.
 *
 * ---------------------------------------------------------------------------
 * ASSUMED SERVICE CONTRACTS
 * ---------------------------------------------------------------------------
 * This file is written against the following expected exports from your
 * existing shared services. If your actual signatures differ, only the
 * small adapter functions in the "SERVICE ADAPTERS" section below need to
 * change — nothing else in this file references the services directly.
 *
 *  logger.js (default export)
 *    - info(message, meta?)
 *    - warn(message, meta?)
 *    - error(message, meta?)
 *    - debug(message, meta?)
 *
 *  formatter.js (named exports)
 *    - successResponse(data, message?)      -> { success:true, message, data }
 *    - errorResponse(message, code?, details?) -> { success:false, message, code, details }
 *    - formatDate(date)                      -> ISO/display string
 *
 *  constants.js (named exports)
 *    - HTTP_STATUS { OK, BAD_REQUEST, NOT_FOUND, INTERNAL_ERROR, ... }
 *    - ERROR_MESSAGES { ... }
 *
 *  datastoreService.js (named exports)
 *    - getRecordById(tableName, id)
 *    - getRecords(tableName, criteria = { where, limit, offset, orderBy })
 *    - searchRecords(tableName, searchTerm, columns = [])
 *    - executeZCQL(zcqlQuery)
 *
 *  queryBuilderService.js (named exports)
 *    - buildWhereClause(filters = {})
 *    - buildZCQL(tableName, filters = {}, options = {})
 *
 *  relationshipService.js (named exports) — the single source of truth for
 *  ALL cross-table joins/expansions. This engine never hand-rolls a JOIN.
 *    - getCasesForAccused(accusedId)
 *    - getRelatedAccusedForCase(caseId)
 *    - getBankAccountsForAccused(accusedId)
 *    - getTransactionsForAccount(accountId)
 *    - getAlertsForAccount(accountId)
 *    - getVictimsForCase(caseId)
 *    - getAssociatesForAccused(accusedId, depth = 1)
 *    - getSharedCases(accusedIdA, accusedIdB)
 *
 *  quickmlService.js (named exports)
 *    - detectIntent(text) -> { intent, entities: {}, confidence: 0..1 }
 *
 *  auditService.js (named exports)
 *    - logAction(actorId, action, meta = {})
 *
 * ---------------------------------------------------------------------------
 */

import logger from '../utils/logger.js';
import { successResponse, errorResponse } from '../utils/formatter.js';
import { HTTP_STATUS } from '../utils/constants.js';
import * as datastoreService from './datastoreService.js';
import * as queryBuilderService from './queryBuilderService.js';
import * as relationshipService from './relationshipService.js';
import * as quickmlService from './quickmlService.js';
import * as auditService from './auditService.js';

/* =============================================================================
 * MODULE-LOCAL CONSTANTS
 * =============================================================================
 */

const TABLES = {
  CASE_MASTER: 'CaseMaster',
  VICTIM: 'Victim',
  ACCUSED: 'Accused',
  COMPLAINANT_DETAILS: 'ComplainantDetails',
  BANK_ACCOUNT_LINK: 'BankAccountLink',
  FINANCIAL_TRANSACTION: 'FinancialTransaction',
  TRANSACTION_ALERT: 'TransactionAlert',
  CRIME_HEAD: 'CrimeHead',
  CRIME_SUB_HEAD: 'CrimeSubHead',
  ACT: 'Act',
  SECTION: 'Section',
  DISTRICT: 'District',
  STATE: 'State',
  ARREST_SURRENDER: 'ArrestSurrender',
  CHARGE_SHEET_DETAILS: 'ChargeSheetDetails',
  OFFENDER_CLUSTERS: 'OffenderClusters',
  BEHAVIOR_CLUSTERS: 'BehaviorClusters',
};

const BEHAVIOUR_TYPES = Object.freeze({
  REPEAT_OFFENDER: 'Repeat Offender',
  HABITUAL_CRIMINAL: 'Habitual Criminal',
  ORGANIZED_CRIMINAL: 'Organized Criminal',
  LONE_WOLF: 'Lone Wolf',
  CYBER_FRAUD_SPECIALIST: 'Cyber Fraud Specialist',
  FINANCIAL_FRAUDSTER: 'Financial Fraudster',
  PROPERTY_OFFENDER: 'Property Offender',
  VIOLENT_OFFENDER: 'Violent Offender',
  DRUG_NETWORK: 'Drug Network',
  MONEY_MULE: 'Money Mule',
  GANG_COORDINATOR: 'Gang Coordinator',
  MASTERMIND: 'Mastermind',
  ASSOCIATE: 'Associate',
  UNKNOWN: 'Unknown',
});

const RISK_LEVELS = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

// Case-insensitive keyword sets used to classify crime heads into broad
// categories, so we never depend on hardcoded crime-head IDs.
const CRIME_CATEGORY_KEYWORDS = Object.freeze({
  CYBER: ['cyber', 'online fraud', 'phishing', 'otp', 'sim swap', 'hacking', 'digital'],
  FINANCIAL: ['fraud', 'cheating', 'forgery', 'embezzlement', 'money laundering', 'ponzi', 'chit fund'],
  VIOLENT: ['murder', 'assault', 'grievous', 'hurt', 'homicide', 'rape', 'kidnap', 'robbery', 'dacoity'],
  PROPERTY: ['theft', 'burglary', 'housebreaking', 'stolen', 'trespass'],
  DRUG: ['ndps', 'narcotic', 'drug', 'peddling', 'contraband'],
});

const CRIME_SEVERITY_WEIGHTS = Object.freeze({
  VIOLENT: 10,
  DRUG: 8,
  FINANCIAL: 7,
  CYBER: 6,
  PROPERTY: 4,
  OTHER: 2,
});

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/* =============================================================================
 * GENERIC HELPERS
 * =============================================================================
 */

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const average = (numbers) => {
  const nums = numbers.filter((n) => Number.isFinite(n));
  if (!nums.length) return 0;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
};

const sum = (numbers) => numbers.reduce((total, n) => total + safeNumber(n), 0);

const max = (numbers) => (numbers.length ? Math.max(...numbers.map((n) => safeNumber(n))) : 0);

const min = (numbers) => (numbers.length ? Math.min(...numbers.map((n) => safeNumber(n))) : 0);

const groupBy = (items, keyFn) =>
  items.reduce((acc, item) => {
    const key = keyFn(item) ?? 'UNKNOWN';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

const mode = (items, keyFn) => {
  const groups = groupBy(items, keyFn);
  let bestKey = null;
  let bestCount = -1;
  for (const [key, group] of Object.entries(groups)) {
    if (group.length > bestCount) {
      bestCount = group.length;
      bestKey = key;
    }
  }
  return { value: bestKey, count: bestCount < 0 ? 0 : bestCount };
};

const daysBetween = (dateA, dateB) => {
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.abs(Math.round((b.getTime() - a.getTime()) / MS_PER_DAY));
};

const calculateAge = (dob) => {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return age;
};

const getAgeGroup = (age) => {
  if (age === null || age === undefined) return 'Unknown';
  if (age < 18) return 'Minor';
  if (age <= 25) return '18-25';
  if (age <= 35) return '26-35';
  if (age <= 45) return '36-45';
  if (age <= 60) return '46-60';
  return '60+';
};

const classifyCrimeCategory = (label = '') => {
  const text = String(label).toLowerCase();
  for (const [category, keywords] of Object.entries(CRIME_CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) return category;
  }
  return 'OTHER';
};

const round = (value, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round(safeNumber(value) * factor) / factor;
};

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

/* =============================================================================
 * SERVICE ADAPTERS
 * Thin wrappers so the rest of this file is decoupled from the exact
 * shared-service call signatures. Adjust ONLY these if your real services
 * differ from the assumed contracts documented above.
 * =============================================================================
 */

async function fetchAccusedRecord(accusedId) {
  return datastoreService.getRecordById(TABLES.ACCUSED, accusedId);
}

async function fetchCasesForAccused(accusedId) {
  const cases = await relationshipService.getCasesForAccused(accusedId);
  return toArray(cases);
}

async function fetchRelatedAccusedForCase(caseId) {
  const accused = await relationshipService.getRelatedAccusedForCase(caseId);
  return toArray(accused);
}

async function fetchBankAccountsForAccused(accusedId) {
  const accounts = await relationshipService.getBankAccountsForAccused(accusedId);
  return toArray(accounts);
}

async function fetchTransactionsForAccount(accountId) {
  const txns = await relationshipService.getTransactionsForAccount(accountId);
  return toArray(txns);
}

async function fetchAlertsForAccount(accountId) {
  const alerts = await relationshipService.getAlertsForAccount(accountId);
  return toArray(alerts);
}

async function fetchVictimsForCase(caseId) {
  const victims = await relationshipService.getVictimsForCase(caseId);
  return toArray(victims);
}

async function fetchAssociates(accusedId, depth = 1) {
  const associates = await relationshipService.getAssociatesForAccused(accusedId, depth);
  return toArray(associates);
}

async function searchAccusedByName(name) {
  const rows = await datastoreService.searchRecords(TABLES.ACCUSED, name, ['Name']);
  return toArray(rows);
}

async function searchCasesByCriteria(filters) {
  const where = queryBuilderService.buildWhereClause(filters);
  const rows = await datastoreService.getRecords(TABLES.CASE_MASTER, { where });
  return toArray(rows);
}

/* =============================================================================
 * STEP 1 — INPUT RESOLUTION
 * Resolves ANY supported investigator input into a concrete accusedIds[] set.
 * =============================================================================
 */

/**
 * @param {object} input
 * @param {string} [input.caseId]
 * @param {string} [input.crimeNumber]
 * @param {string} [input.accusedName]
 * @param {string} [input.district]
 * @param {string} [input.crimeHead]
 * @param {string} [input.crimeType]
 * @param {string} [input.financialTransaction]  transaction reference / id
 * @param {string} [input.bankAccount]            account number
 * @param {string} [input.question]               free-text natural language
 * @returns {Promise<{accusedIds:string[], matchedCases:object[], intent:string, entities:object, confidence:number}>}
 */
export async function resolveInputEntities(input = {}) {
  const accusedIdSet = new Set();
  let matchedCases = [];
  let intent = 'DIRECT_LOOKUP';
  let entities = {};
  let confidence = 1;

  try {
    // Natural language question always goes through QuickML first so that
    // structured fields present in the payload (if any) are enriched with
    // intent-detected entities rather than overridden by them.
    if (input.question && typeof input.question === 'string' && input.question.trim().length > 0) {
      const detection = await quickmlService.detectIntent(input.question);
      intent = detection?.intent || 'UNKNOWN_INTENT';
      entities = detection?.entities || {};
      confidence = safeNumber(detection?.confidence, 0.5);
      logger.info('QuickML intent detected', { intent, entities, confidence });
    }

    const merged = { ...entities, ...input };

    // Direct accused id / name
    if (merged.accusedId) accusedIdSet.add(String(merged.accusedId));

    if (merged.accusedName) {
      const rows = await searchAccusedByName(merged.accusedName);
      rows.forEach((row) => accusedIdSet.add(String(row.ROWID || row.accusedId || row.id)));
    }

    // Case-based lookup (caseId or crimeNumber)
    if (merged.caseId || merged.crimeNumber) {
      const caseFilters = {};
      if (merged.caseId) caseFilters.ROWID = merged.caseId;
      if (merged.crimeNumber) caseFilters.CrimeNumber = merged.crimeNumber;
      const cases = merged.caseId
        ? toArray(await datastoreService.getRecordById(TABLES.CASE_MASTER, merged.caseId))
        : await searchCasesByCriteria(caseFilters);

      matchedCases = matchedCases.concat(cases);

      for (const caseRecord of cases) {
        const caseIdValue = caseRecord.ROWID || caseRecord.caseId || merged.caseId;
        const relatedAccused = await fetchRelatedAccusedForCase(caseIdValue);
        relatedAccused.forEach((acc) => accusedIdSet.add(String(acc.ROWID || acc.accusedId || acc.id)));
      }
    }

    // District / crime head / crime type driven discovery
    if (merged.district || merged.crimeHead || merged.crimeType) {
      const filters = {};
      if (merged.district) filters.District = merged.district;
      if (merged.crimeHead) filters.CrimeHead = merged.crimeHead;
      if (merged.crimeType) filters.CrimeType = merged.crimeType;

      const cases = await searchCasesByCriteria(filters);
      matchedCases = matchedCases.concat(cases);

      for (const caseRecord of cases) {
        const caseIdValue = caseRecord.ROWID || caseRecord.caseId;
        const relatedAccused = await fetchRelatedAccusedForCase(caseIdValue);
        relatedAccused.forEach((acc) => accusedIdSet.add(String(acc.ROWID || acc.accusedId || acc.id)));
      }
    }

    // Financial-transaction or bank-account driven discovery
    if (merged.bankAccount) {
      const accountRows = await datastoreService.getRecords(TABLES.BANK_ACCOUNT_LINK, {
        where: queryBuilderService.buildWhereClause({ AccountNumber: merged.bankAccount }),
      });
      for (const link of toArray(accountRows)) {
        if (link.AccusedId || link.accusedId) {
          accusedIdSet.add(String(link.AccusedId || link.accusedId));
        }
      }
    }

    if (merged.financialTransaction) {
      const txnRows = await datastoreService.getRecords(TABLES.FINANCIAL_TRANSACTION, {
        where: queryBuilderService.buildWhereClause({ TransactionReference: merged.financialTransaction }),
      });
      for (const txn of toArray(txnRows)) {
        const accountId = txn.AccountId || txn.accountId;
        if (!accountId) continue;
        const link = await datastoreService.getRecordById(TABLES.BANK_ACCOUNT_LINK, accountId);
        if (link && (link.AccusedId || link.accusedId)) {
          accusedIdSet.add(String(link.AccusedId || link.accusedId));
        }
      }
    }

    return {
      accusedIds: Array.from(accusedIdSet),
      matchedCases,
      intent,
      entities,
      confidence,
    };
  } catch (error) {
    logger.error('resolveInputEntities failed', { error: error.message, input });
    throw error;
  }
}

/* =============================================================================
 * STEP 2 — IDENTITY
 * =============================================================================
 */

async function buildIdentity(accusedRecord) {
  const age = calculateAge(accusedRecord.DateOfBirth || accusedRecord.dob);
  return {
    accusedId: accusedRecord.ROWID || accusedRecord.accusedId || accusedRecord.id,
    name: accusedRecord.Name || accusedRecord.name || 'Unknown',
    gender: accusedRecord.Gender || accusedRecord.gender || 'Unknown',
    age,
    ageGroup: getAgeGroup(age),
    nationality: accusedRecord.Nationality || accusedRecord.nationality || 'Indian',
    occupation: accusedRecord.Occupation || accusedRecord.occupation || 'Unknown',
    address: accusedRecord.Address || accusedRecord.address || '',
    district: accusedRecord.District || accusedRecord.district || 'Unknown',
    state: accusedRecord.State || accusedRecord.state || 'Unknown',
    photo: accusedRecord.Photo || accusedRecord.photo || null,
  };
}

/* =============================================================================
 * STEP 3 — CRIME HISTORY ANALYSIS
 * =============================================================================
 */

/**
 * @param {string} accusedId
 * @returns {Promise<{cases:object[], crimeProfile:object}>}
 */
export async function analyseCrimeHistory(accusedId) {
  const cases = await fetchCasesForAccused(accusedId);

  const totalCases = cases.length;
  const openCases = cases.filter((c) => /open|under investigation|pending/i.test(c.Status || c.status || '')).length;
  const closedCases = cases.filter((c) => /closed|disposed/i.test(c.Status || c.status || '')).length;
  const convictions = cases.filter((c) => /convict/i.test(c.TrialOutcome || c.trialOutcome || '')).length;
  const pendingTrials = cases.filter((c) => /trial pending|charge ?sheet filed/i.test(c.TrialOutcome || c.trialOutcome || c.Status || '')).length;
  const acquittals = cases.filter((c) => /acquit/i.test(c.TrialOutcome || c.trialOutcome || '')).length;

  const crimeHeadLabels = cases.map((c) => c.CrimeHead || c.crimeHead || '').filter(Boolean);
  const sectionLabels = cases.map((c) => c.Section || c.section || '').filter(Boolean);

  const primaryCrimeHeadMode = mode(cases, (c) => c.CrimeHead || c.crimeHead || 'Unknown');
  const secondaryCandidates = crimeHeadLabels.filter((label) => label !== primaryCrimeHeadMode.value);
  const secondaryCrimeHeadMode = mode(
    secondaryCandidates.map((label) => ({ CrimeHead: label })),
    (c) => c.CrimeHead
  );
  const mostFrequentSectionMode = mode(cases, (c) => c.Section || c.section || 'Unknown');

  const categories = crimeHeadLabels.map(classifyCrimeCategory);
  const categoryWeights = categories.map((cat) => CRIME_SEVERITY_WEIGHTS[cat] ?? CRIME_SEVERITY_WEIGHTS.OTHER);
  const crimeSeverity = totalCases > 0 ? round(average(categoryWeights), 2) : 0;

  const firstCaseDate = cases.length
    ? min(cases.map((c) => new Date(c.RegistrationDate || c.registrationDate || c.CreatedTime).getTime()).filter((t) => Number.isFinite(t)))
    : null;
  const spanDays = firstCaseDate ? daysBetween(firstCaseDate, Date.now()) : null;
  const crimeFrequency = spanDays && spanDays > 0 ? round((totalCases / spanDays) * 365, 3) : totalCases;

  const crimeProfile = {
    totalCases,
    openCases,
    closedCases,
    convictions,
    pendingTrials,
    acquittals,
    primaryCrimeHead: primaryCrimeHeadMode.value || 'Unknown',
    secondaryCrimeHead: secondaryCrimeHeadMode.value || 'None',
    mostFrequentCrime: primaryCrimeHeadMode.value || 'Unknown',
    mostFrequentSection: mostFrequentSectionMode.value || 'Unknown',
    crimeFrequencyPerYear: crimeFrequency,
    crimeSeverity,
    crimeCategories: [...new Set(categories)],
  };

  return { cases, crimeProfile };
}

/* =============================================================================
 * STEP 4 — FINANCIAL PATTERN ANALYSIS
 * =============================================================================
 */

/**
 * @param {string} accusedId
 * @returns {Promise<object>} financialPattern
 */
export async function analyseFinancialPattern(accusedId) {
  const accounts = await fetchBankAccountsForAccused(accusedId);

  let allTransactions = [];
  let allAlerts = [];

  for (const account of accounts) {
    const accountId = account.ROWID || account.accountId || account.AccountNumber;
    const [txns, alerts] = await Promise.all([
      fetchTransactionsForAccount(accountId),
      fetchAlertsForAccount(accountId),
    ]);
    allTransactions = allTransactions.concat(txns);
    allAlerts = allAlerts.concat(alerts);
  }

  const amounts = allTransactions.map((t) => safeNumber(t.Amount || t.amount));
  const incoming = allTransactions.filter((t) => /credit|incoming|deposit/i.test(t.Type || t.type || ''));
  const outgoing = allTransactions.filter((t) => /debit|outgoing|withdrawal/i.test(t.Type || t.type || ''));

  const incomingTotal = sum(incoming.map((t) => safeNumber(t.Amount || t.amount)));
  const outgoingTotal = sum(outgoing.map((t) => safeNumber(t.Amount || t.amount)));

  const suspiciousAccounts = accounts.filter((account) => {
    const accountId = account.ROWID || account.accountId || account.AccountNumber;
    return allAlerts.some((alert) => String(alert.AccountId || alert.accountId) === String(accountId));
  });

  let moneyFlowPattern = 'Balanced';
  if (incomingTotal > outgoingTotal * 1.5) moneyFlowPattern = 'Net Accumulation (funds retained)';
  else if (outgoingTotal > incomingTotal * 1.5) moneyFlowPattern = 'Rapid Layering / Pass-through';

  const distinctAccountsUsedPerTxnWindow = new Set(allTransactions.map((t) => t.AccountId || t.accountId)).size;
  const rapidMovement = allTransactions.length > 0 && distinctAccountsUsedPerTxnWindow >= 3;

  let launderingRisk = 'LOW';
  const alertRatio = allTransactions.length ? allAlerts.length / allTransactions.length : 0;
  if (alertRatio > 0.3 || (rapidMovement && suspiciousAccounts.length >= 2)) launderingRisk = 'HIGH';
  else if (alertRatio > 0.1 || suspiciousAccounts.length >= 1) launderingRisk = 'MEDIUM';

  return {
    linkedBankAccounts: accounts.length,
    accountNumbers: accounts.map((a) => a.AccountNumber || a.accountNumber).filter(Boolean),
    suspiciousAccounts: suspiciousAccounts.length,
    numberOfTransactions: allTransactions.length,
    averageTransaction: round(average(amounts), 2),
    maximumTransaction: round(max(amounts), 2),
    minimumTransaction: round(min(amounts), 2),
    incoming: round(incomingTotal, 2),
    outgoing: round(outgoingTotal, 2),
    moneyFlowPattern,
    moneyLaunderingRisk: launderingRisk,
    totalAlerts: allAlerts.length,
  };
}

/* =============================================================================
 * STEP 5 — NETWORK PATTERN ANALYSIS (relationshipService only, no manual JOINs)
 * =============================================================================
 */

/**
 * @param {string} accusedId
 * @param {object[]} cases  cases already resolved for this accused (avoids refetch)
 * @returns {Promise<object>} networkPattern
 */
export async function analyseNetwork(accusedId, cases = []) {
  const associates = await fetchAssociates(accusedId, 1);

  let sharedCasesTotal = 0;
  const sharedCaseIds = new Set();
  for (const associate of associates) {
    const associateId = associate.ROWID || associate.accusedId || associate.id;
    const shared = toArray(await relationshipService.getSharedCases(accusedId, associateId));
    shared.forEach((c) => sharedCaseIds.add(c.ROWID || c.caseId));
    sharedCasesTotal += shared.length;
  }

  let connectedVictims = [];
  for (const caseRecord of cases) {
    const caseId = caseRecord.ROWID || caseRecord.caseId;
    const victims = await fetchVictimsForCase(caseId);
    connectedVictims = connectedVictims.concat(victims);
  }

  const accounts = await fetchBankAccountsForAccused(accusedId);
  let connectedTransactions = [];
  let connectedAlerts = [];
  for (const account of accounts) {
    const accountId = account.ROWID || account.accountId || account.AccountNumber;
    const [txns, alerts] = await Promise.all([
      fetchTransactionsForAccount(accountId),
      fetchAlertsForAccount(accountId),
    ]);
    connectedTransactions = connectedTransactions.concat(txns);
    connectedAlerts = connectedAlerts.concat(alerts);
  }

  const gangMembers = associates.filter((a) =>
    /gang|organized|network/i.test(a.RelationshipType || a.relationshipType || a.Role || '')
  );

  const networkSize = 1 + associates.length;

  const possiblePairs = networkSize > 1 ? (networkSize * (networkSize - 1)) / 2 : 1;
  const networkDensity = possiblePairs > 0 ? round(clamp(sharedCaseIds.size / possiblePairs, 0, 1), 3) : 0;

  const centralityScore = associates.length > 0 ? round(clamp(sharedCasesTotal / (associates.length * 2), 0, 1), 3) : 0;

  return {
    knownAssociates: associates.length,
    associateNames: associates.map((a) => a.Name || a.name).filter(Boolean),
    gangMembers: gangMembers.length,
    sharedCases: sharedCaseIds.size,
    connectedAccounts: accounts.length,
    connectedTransactions: connectedTransactions.length,
    connectedAlerts: connectedAlerts.length,
    connectedVictims: connectedVictims.length,
    networkSize,
    networkDensity,
    centralityScore,
  };
}

/* =============================================================================
 * STEP 6 — TEMPORAL PATTERN ANALYSIS
 * =============================================================================
 */

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * @param {object[]} cases
 * @returns {object} temporalPattern
 */
export function analyseTemporalPattern(cases = []) {
  const dates = cases
    .map((c) => new Date(c.RegistrationDate || c.registrationDate || c.IncidentDate || c.incidentDate))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (!dates.length) {
    return {
      peakMonth: 'Unknown',
      peakWeekday: 'Unknown',
      peakTime: 'Unknown',
      seasonalTrend: 'Insufficient data',
      crimeIntervalDays: null,
      dormantPeriodDays: null,
    };
  }

  const monthMode = mode(dates, (d) => MONTH_NAMES[d.getMonth()]);
  const weekdayMode = mode(dates, (d) => WEEKDAY_NAMES[d.getDay()]);
  const hourBucketMode = mode(dates, (d) => {
    const hour = d.getHours();
    if (hour >= 5 && hour < 12) return 'Morning (05:00-12:00)';
    if (hour >= 12 && hour < 17) return 'Afternoon (12:00-17:00)';
    if (hour >= 17 && hour < 21) return 'Evening (17:00-21:00)';
    return 'Night (21:00-05:00)';
  });

  const intervals = [];
  for (let i = 1; i < dates.length; i += 1) {
    intervals.push(daysBetween(dates[i - 1], dates[i]));
  }
  const crimeIntervalDays = intervals.length ? round(average(intervals.filter(Boolean)), 1) : null;
  const dormantPeriodDays = intervals.length ? round(max(intervals.filter(Boolean)), 1) : null;

  const quarterCounts = groupBy(dates, (d) => `Q${Math.floor(d.getMonth() / 3) + 1}`);
  const busiestQuarter = Object.entries(quarterCounts).sort((a, b) => b[1].length - a[1].length)[0];
  const seasonalTrend = busiestQuarter
    ? `Elevated activity in ${busiestQuarter[0]} (${busiestQuarter[1].length} of ${dates.length} cases)`
    : 'No clear seasonal trend';

  return {
    peakMonth: monthMode.value,
    peakWeekday: weekdayMode.value,
    peakTime: hourBucketMode.value,
    seasonalTrend,
    crimeIntervalDays,
    dormantPeriodDays,
  };
}

/* =============================================================================
 * STEP 7 — GEOGRAPHIC PATTERN ANALYSIS
 * =============================================================================
 */

/**
 * @param {object[]} cases
 * @returns {object} geographicPattern
 */
export function analyseGeography(cases = []) {
  if (!cases.length) {
    return {
      primaryDistrict: 'Unknown',
      secondaryDistrict: 'None',
      primaryPoliceStation: 'Unknown',
      crimeRadiusKm: null,
      travelPattern: 'Insufficient data',
      interstateActivity: false,
      mostActiveLocations: [],
    };
  }

  const districtMode = mode(cases, (c) => c.District || c.district || 'Unknown');
  const secondaryDistricts = cases
    .map((c) => c.District || c.district)
    .filter((d) => d && d !== districtMode.value);
  const secondaryDistrictMode = mode(
    secondaryDistricts.map((d) => ({ District: d })),
    (c) => c.District
  );

  const stationMode = mode(cases, (c) => c.PoliceStation || c.policeStation || 'Unknown');
  const stateSet = new Set(cases.map((c) => c.State || c.state).filter(Boolean));
  const districtSet = new Set(cases.map((c) => c.District || c.district).filter(Boolean));

  const coords = cases
    .map((c) => ({ lat: safeNumber(c.Latitude || c.latitude, NaN), lng: safeNumber(c.Longitude || c.longitude, NaN) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  let crimeRadiusKm = null;
  if (coords.length >= 2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const haversine = (p1, p2) => {
      const R = 6371;
      const dLat = toRad(p2.lat - p1.lat);
      const dLng = toRad(p2.lng - p1.lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.asin(Math.sqrt(a));
    };
    let maxDistance = 0;
    for (let i = 0; i < coords.length; i += 1) {
      for (let j = i + 1; j < coords.length; j += 1) {
        maxDistance = Math.max(maxDistance, haversine(coords[i], coords[j]));
      }
    }
    crimeRadiusKm = round(maxDistance, 2);
  }

  const locationCounts = groupBy(cases, (c) => c.District || c.district || 'Unknown');
  const mostActiveLocations = Object.entries(locationCounts)
    .map(([district, list]) => ({ district, cases: list.length }))
    .sort((a, b) => b.cases - a.cases)
    .slice(0, 5);

  let travelPattern = 'Localized (single district)';
  if (districtSet.size > 1 && districtSet.size <= 3) travelPattern = 'Regional (multi-district)';
  else if (districtSet.size > 3) travelPattern = 'Wide-ranging (extensive multi-district)';

  return {
    primaryDistrict: districtMode.value,
    secondaryDistrict: secondaryDistrictMode.value || 'None',
    primaryPoliceStation: stationMode.value,
    crimeRadiusKm,
    travelPattern,
    interstateActivity: stateSet.size > 1,
    mostActiveLocations,
  };
}

/* =============================================================================
 * STEP 8 — MODUS OPERANDI INFERENCE
 * =============================================================================
 */

function inferModusOperandi(cases, crimeProfile, financialPattern, networkPattern) {
  const narratives = cases
    .map((c) => c.Narrative || c.narrative || c.MethodUsed || c.methodUsed || '')
    .join(' ')
    .toLowerCase();

  const usesFakeIdentity = /fake id|fake identity|impersonat|forged document/i.test(narratives);
  const usesFakeAccounts = /fake account|mule account|dummy account/i.test(narratives) || financialPattern.suspiciousAccounts > 0;
  const usesMultipleSim = /multiple sim|sim swap|new sim/i.test(narratives);
  const usesMultipleBankAccounts = financialPattern.linkedBankAccounts > 2;
  const usesCash = /cash/i.test(narratives);
  const usesOnlineWallet = /wallet|upi|paytm|phonepe|gpay/i.test(narratives);
  const usesCrypto = /crypto|bitcoin|usdt|wallet address/i.test(narratives);
  const usesPublicWifi = /public wifi|cyber cafe|internet cafe/i.test(narratives);
  const worksAlone = networkPattern.knownAssociates === 0;
  const worksWithNetwork = networkPattern.knownAssociates > 0;

  const preferredMethodMode = mode(cases, (c) => c.CrimeSubHead || c.crimeSubHead || c.CrimeHead || c.crimeHead || 'Unknown');
  const preferredTargetMode = mode(cases, (c) => c.VictimType || c.victimType || c.TargetProfile || 'General Public');

  return {
    preferredMethod: preferredMethodMode.value || 'Unknown',
    preferredTarget: preferredTargetMode.value || 'Unknown',
    preferredVictims: preferredTargetMode.value || 'Unknown',
    typicalCrimeDurationDays: crimeProfile.crimeFrequencyPerYear
      ? round(365 / Math.max(crimeProfile.crimeFrequencyPerYear, 0.01), 1)
      : null,
    usesFakeIdentity,
    usesFakeAccounts,
    usesMultipleSim,
    usesMultipleBankAccounts,
    usesCash,
    usesOnlineWallet,
    usesCrypto,
    usesPublicWifi,
    worksAlone,
    worksWithNetwork,
  };
}

/* =============================================================================
 * STEP 9 — BEHAVIOURAL CLASSIFICATION (data-driven, not hardcoded per accused)
 * =============================================================================
 */

export function classifyBehaviour({ crimeProfile, modusOperandi, networkPattern, financialPattern }) {
  const scores = {};
  const add = (type, points) => {
    scores[type] = (scores[type] || 0) + points;
  };

  if (crimeProfile.totalCases >= 10) add(BEHAVIOUR_TYPES.HABITUAL_CRIMINAL, 4);
  else if (crimeProfile.totalCases >= 3) add(BEHAVIOUR_TYPES.REPEAT_OFFENDER, 3);

  if (crimeProfile.crimeCategories.includes('CYBER')) add(BEHAVIOUR_TYPES.CYBER_FRAUD_SPECIALIST, 4);
  if (crimeProfile.crimeCategories.includes('FINANCIAL')) add(BEHAVIOUR_TYPES.FINANCIAL_FRAUDSTER, 3);
  if (crimeProfile.crimeCategories.includes('PROPERTY')) add(BEHAVIOUR_TYPES.PROPERTY_OFFENDER, 3);
  if (crimeProfile.crimeCategories.includes('VIOLENT')) add(BEHAVIOUR_TYPES.VIOLENT_OFFENDER, 4);
  if (crimeProfile.crimeCategories.includes('DRUG')) add(BEHAVIOUR_TYPES.DRUG_NETWORK, 4);

  if (financialPattern.moneyLaunderingRisk === 'HIGH' && financialPattern.numberOfTransactions > 0) {
    if (modusOperandi.usesMultipleBankAccounts && networkPattern.knownAssociates > 0) {
      add(BEHAVIOUR_TYPES.MONEY_MULE, 2);
    }
  }

  if (networkPattern.networkSize >= 5 && networkPattern.networkDensity >= 0.4) {
    add(BEHAVIOUR_TYPES.ORGANIZED_CRIMINAL, 4);
    if (networkPattern.centralityScore >= 0.6) add(BEHAVIOUR_TYPES.GANG_COORDINATOR, 3);
  }

  if (networkPattern.centralityScore >= 0.75 && crimeProfile.totalCases >= 5) {
    add(BEHAVIOUR_TYPES.MASTERMIND, 3);
  } else if (networkPattern.knownAssociates > 0 && networkPattern.centralityScore < 0.3) {
    add(BEHAVIOUR_TYPES.ASSOCIATE, 2);
  }

  if (modusOperandi.worksAlone && crimeProfile.totalCases >= 1) {
    add(BEHAVIOUR_TYPES.LONE_WOLF, 2);
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (!ranked.length) {
    return { primary: BEHAVIOUR_TYPES.UNKNOWN, secondary: [], confidence: 0 };
  }

  const [topType, topScore] = ranked[0];
  const totalScore = sum(ranked.map(([, s]) => s));
  const confidence = totalScore > 0 ? round(topScore / totalScore, 2) : 0;
  const secondary = ranked.slice(1, 3).map(([type]) => type);

  return { primary: topType, secondary, confidence };
}

/* =============================================================================
 * STEP 10 — RISK ASSESSMENT
 * =============================================================================
 */

/**
 * @returns {{score:number, level:string, reasoning:string[]}}
 */
export function calculateRiskScore({ crimeProfile, behaviourPattern, financialPattern, networkPattern, geographicPattern }) {
  let score = 0;
  const reasoning = [];

  if (crimeProfile.totalCases >= 10) {
    score += 20;
    reasoning.push(`Habitual offender with ${crimeProfile.totalCases} registered cases`);
  } else if (crimeProfile.totalCases >= 3) {
    score += 12;
    reasoning.push(`Repeat offender with ${crimeProfile.totalCases} registered cases`);
  } else if (crimeProfile.totalCases > 0) {
    score += 5;
  }

  if (crimeProfile.convictions > 0) {
    score += Math.min(15, crimeProfile.convictions * 5);
    reasoning.push(`${crimeProfile.convictions} prior conviction(s)`);
  }

  if (crimeProfile.crimeCategories.includes('VIOLENT')) {
    score += 20;
    reasoning.push('History of violent crime');
  }

  if (crimeProfile.crimeCategories.includes('DRUG')) {
    score += 15;
    reasoning.push('Involvement in narcotics-related crime');
  }

  if (financialPattern.moneyLaunderingRisk === 'HIGH') {
    score += 15;
    reasoning.push('High money laundering risk from financial transaction analysis');
  } else if (financialPattern.moneyLaunderingRisk === 'MEDIUM') {
    score += 8;
    reasoning.push('Moderate money laundering indicators');
  }

  if (financialPattern.maximumTransaction >= 1000000) {
    score += 10;
    reasoning.push('Large-value financial fraud detected (transaction >= 10L)');
  } else if (financialPattern.maximumTransaction >= 100000) {
    score += 5;
    reasoning.push('Significant financial fraud detected (transaction >= 1L)');
  }

  if (geographicPattern.interstateActivity) {
    score += 10;
    reasoning.push('Operates across multiple states');
  } else if ((geographicPattern.mostActiveLocations || []).length > 2) {
    score += 5;
    reasoning.push('Active across multiple districts');
  }

  if (networkPattern.gangMembers > 0 || behaviourPattern.primary === BEHAVIOUR_TYPES.ORGANIZED_CRIMINAL) {
    score += 15;
    reasoning.push('Confirmed association with an organized gang/network');
  } else if (networkPattern.knownAssociates > 0) {
    score += 5;
    reasoning.push(`Known network of ${networkPattern.knownAssociates} associate(s)`);
  }

  if ([BEHAVIOUR_TYPES.MASTERMIND, BEHAVIOUR_TYPES.GANG_COORDINATOR].includes(behaviourPattern.primary)) {
    score += 10;
    reasoning.push(`Classified as ${behaviourPattern.primary} within the network`);
  }

  score = clamp(round(score, 0), 0, 100);

  let level = RISK_LEVELS.LOW;
  if (score >= 80) level = RISK_LEVELS.CRITICAL;
  else if (score >= 55) level = RISK_LEVELS.HIGH;
  else if (score >= 30) level = RISK_LEVELS.MEDIUM;

  if (!reasoning.length) reasoning.push('Limited historical data available for this accused');

  return { score, level, reasoning };
}

/* =============================================================================
 * STEP 11 — PREDICTION
 * =============================================================================
 */

function generatePrediction({ crimeProfile, temporalPattern, geographicPattern, networkPattern, riskAssessment, behaviourPattern }) {
  // Baseline reoffending probability driven by risk score, nudged by
  // recidivism-relevant signals (prior cases, active network, open cases).
  let reoffendProbability = riskAssessment.score * 0.7;
  if (crimeProfile.openCases > 0) reoffendProbability += 8;
  if (crimeProfile.totalCases >= 5) reoffendProbability += 7;
  if (networkPattern.knownAssociates > 0) reoffendProbability += 5;
  if (crimeProfile.convictions === 0 && crimeProfile.totalCases > 0) reoffendProbability += 5; // no deterrent effect yet
  reoffendProbability = clamp(round(reoffendProbability, 0), 0, 99);

  const confidenceInputs = [
    crimeProfile.totalCases > 0 ? 1 : 0,
    temporalPattern.peakMonth !== 'Unknown' ? 1 : 0,
    geographicPattern.primaryDistrict !== 'Unknown' ? 1 : 0,
    networkPattern.knownAssociates >= 0 ? 1 : 0,
  ];
  const predictionConfidence = round((sum(confidenceInputs) / confidenceInputs.length) * 100, 0);

  return {
    probabilityOfReoffending: reoffendProbability,
    likelyCrimeType: crimeProfile.primaryCrimeHead,
    likelyDistrict: geographicPattern.primaryDistrict,
    likelyTime: temporalPattern.peakTime,
    likelyAssociates: networkPattern.associateNames.slice(0, 5),
    predictionConfidence,
    predictedBehaviourTrend: behaviourPattern.primary,
  };
}

/* =============================================================================
 * STEP 12 — AI SUMMARY
 * =============================================================================
 */

export function generateSummary(profile) {
  const { identity, crimeProfile, behaviourPattern, geographicPattern, financialPattern, networkPattern, riskAssessment, prediction } = profile;

  const parts = [];

  parts.push(
    `${identity.name} is a ${behaviourPattern.primary.toLowerCase()} with ${crimeProfile.totalCases} registered case(s)` +
      (geographicPattern.primaryDistrict !== 'Unknown'
        ? ` primarily across ${geographicPattern.primaryDistrict}${geographicPattern.secondaryDistrict !== 'None' ? ` and ${geographicPattern.secondaryDistrict}` : ''}.`
        : '.')
  );

  if (financialPattern.linkedBankAccounts > 0) {
    parts.push(
      `Financial transaction analysis shows usage of ${financialPattern.linkedBankAccounts} linked bank account(s) ` +
        `with a ${financialPattern.moneyLaunderingRisk.toLowerCase()} money laundering risk profile.`
    );
  }

  if (networkPattern.knownAssociates > 0) {
    parts.push(
      `Network analysis indicates collaboration with ${networkPattern.knownAssociates} known associate(s)` +
        (networkPattern.gangMembers > 0 ? `, including ${networkPattern.gangMembers} identified gang member(s).` : '.')
    );
  }

  parts.push(
    `Risk Score ${riskAssessment.score} (${riskAssessment.level}). Probability of reoffending ${prediction.probabilityOfReoffending}%.`
  );

  return parts.join(' ');
}

/* =============================================================================
 * STEP 13 — BUILD A SINGLE FULL PROFILE
 * =============================================================================
 */

/**
 * @param {string} accusedId
 * @param {object} [context]  optional context carried from resolution (e.g. quickmlConfidence)
 * @returns {Promise<object>} a fully assembled behavioural profile
 */
export async function buildProfile(accusedId, context = {}) {
  const accusedRecord = await fetchAccusedRecord(accusedId);
  if (!accusedRecord) {
    throw Object.assign(new Error(`Accused record not found for id: ${accusedId}`), { statusCode: HTTP_STATUS?.NOT_FOUND || 404 });
  }

  const identity = await buildIdentity(accusedRecord);
  const { cases, crimeProfile } = await analyseCrimeHistory(accusedId);
  const financialPattern = await analyseFinancialPattern(accusedId);
  const networkPattern = await analyseNetwork(accusedId, cases);
  const temporalPattern = analyseTemporalPattern(cases);
  const geographicPattern = analyseGeography(cases);
  const modusOperandi = inferModusOperandi(cases, crimeProfile, financialPattern, networkPattern);
  const behaviourPattern = classifyBehaviour({ crimeProfile, modusOperandi, networkPattern, financialPattern });
  const riskAssessment = calculateRiskScore({ crimeProfile, behaviourPattern, financialPattern, networkPattern, geographicPattern });
  const prediction = generatePrediction({ crimeProfile, temporalPattern, geographicPattern, networkPattern, riskAssessment, behaviourPattern });

  const profile = {
    identity,
    crimeProfile,
    behaviourPattern: {
      classification: behaviourPattern.primary,
      alternateClassifications: behaviourPattern.secondary,
      classificationConfidence: behaviourPattern.confidence,
      modusOperandi,
    },
    geographicPattern,
    temporalPattern,
    financialPattern,
    networkPattern,
    riskAssessment,
    prediction,
    summary: '',
    _meta: {
      relevance: safeNumber(context.quickmlConfidence, 1),
    },
  };

  profile.summary = generateSummary(profile);
  return profile;
}

/* =============================================================================
 * STEP 14 — RANK MULTIPLE PROFILES
 * =============================================================================
 */

/**
 * Ranks profiles using a weighted blend of relevance (QuickML confidence /
 * direct-match certainty), case volume, risk score, so the most
 * investigation-worthy profiles surface first.
 *
 * @param {object[]} profiles
 * @param {object} [context]
 * @returns {object[]} sorted profiles (descending)
 */
export function rankProfiles(profiles = [], context = {}) {
  const quickmlConfidence = safeNumber(context.confidence, 1);

  const maxCases = max(profiles.map((p) => p.crimeProfile.totalCases)) || 1;
  const maxRisk = 100;

  const scored = profiles.map((profile) => {
    const relevanceScore = safeNumber(profile._meta?.relevance, quickmlConfidence);
    const caseVolumeScore = profile.crimeProfile.totalCases / maxCases;
    const riskScoreNormalized = profile.riskAssessment.score / maxRisk;
    const quickmlScore = quickmlConfidence;

    const rankScore =
      relevanceScore * 0.3 + caseVolumeScore * 0.25 + riskScoreNormalized * 0.35 + quickmlScore * 0.1;

    return { profile, rankScore: round(rankScore, 4) };
  });

  scored.sort((a, b) => b.rankScore - a.rankScore);

  return scored.map(({ profile, rankScore }) => {
    delete profile._meta;
    return { ...profile, rankScore };
  });
}

/* =============================================================================
 * STEP 15 — TOP-LEVEL ORCHESTRATOR
 * =============================================================================
 */

/**
 * Main entry point for the AI Investigation workflow.
 *
 * @param {object} input  see resolveInputEntities() for supported fields
 * @param {object} [actor]  { actorId } for audit logging
 * @returns {Promise<{answer:string, profiles:object[]}>}
 */
export async function generateProfiles(input = {}, actor = {}) {
  const startedAt = Date.now();

  try {
    const { accusedIds, intent, entities, confidence } = await resolveInputEntities(input);

    if (!accusedIds.length) {
      const answer = 'No matching accused could be identified for the given input. Please refine your query (try a case ID, accused name, district, or crime type).';
      await auditService.logAction(actor.actorId || 'system', 'BEHAVIOUR_PROFILE_NO_MATCH', { input, intent });
      return { answer, profiles: [] };
    }

    logger.info('Building behavioural profiles', { accusedCount: accusedIds.length, intent });

    const profiles = [];
    for (const accusedId of accusedIds) {
      try {
        const profile = await buildProfile(accusedId, { quickmlConfidence: confidence });
        profiles.push(profile);
      } catch (profileError) {
        logger.warn('Skipping accused due to profile build failure', { accusedId, error: profileError.message });
      }
    }

    const rankedProfiles = rankProfiles(profiles, { confidence });

    const answer = buildAnswerNarrative(rankedProfiles, { intent, entities });

    await auditService.logAction(actor.actorId || 'system', 'BEHAVIOUR_PROFILE_GENERATED', {
      input,
      intent,
      profileCount: rankedProfiles.length,
      durationMs: Date.now() - startedAt,
    });

    return { answer, profiles: rankedProfiles };
  } catch (error) {
    logger.error('generateProfiles failed', { error: error.message, input });
    throw error;
  }
}

function buildAnswerNarrative(rankedProfiles, { intent } = {}) {
  if (!rankedProfiles.length) {
    return 'No behavioural profiles could be generated for this query.';
  }

  if (rankedProfiles.length === 1) {
    return rankedProfiles[0].summary;
  }

  const top = rankedProfiles[0];
  const highRiskCount = rankedProfiles.filter((p) => ['HIGH', 'CRITICAL'].includes(p.riskAssessment.level)).length;

  return (
    `Found ${rankedProfiles.length} matching accused profiles. ` +
    `${highRiskCount} classified as HIGH/CRITICAL risk. ` +
    `Top match: ${top.identity.name} (${top.behaviourPattern.classification}, Risk Score ${top.riskAssessment.score}). ` +
    `${top.summary}`
  );
}

/* =============================================================================
 * EXPORTS
 * =============================================================================
 */

export default {
  resolveInputEntities,
  analyseCrimeHistory,
  analyseFinancialPattern,
  analyseNetwork,
  analyseTemporalPattern,
  analyseGeography,
  classifyBehaviour,
  calculateRiskScore,
  generateSummary,
  buildProfile,
  rankProfiles,
  generateProfiles,
  BEHAVIOUR_TYPES,
  RISK_LEVELS,
};
