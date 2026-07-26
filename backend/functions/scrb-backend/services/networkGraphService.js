/**
 * networkGraphService.js
 * ----------------------------------------------------------------------------
 * Builds React Flow / Cytoscape compatible graph structures ({ nodes, edges })
 * for the SCRB Criminal Network Graph module.
 *
 * This service NEVER writes raw SQL / ZCQL. All data access goes through
 * datastoreService (single-record / field lookups) and relationshipService
 * (relationship expansion). This service is purely responsible for:
 *
 *   - orchestrating traversal across related tables
 *   - de-duplicating nodes / edges
 *   - preventing cycles / infinite recursion
 *   - enforcing MAX_DEPTH / MAX_NODES safety limits
 *   - shaping the output into React Flow compatible JSON
 *
 * NOTE ON ASSUMED SERVICE CONTRACTS
 * ----------------------------------------------------------------------------
 * This module was generated against the *described* signatures of the
 * existing services (relationshipService, datastoreService, queryBuilderService,
 * quickmlService, relationship.js, queryMap.js). Since those files were not
 * supplied, this service calls them using the most conventional shape:
 *
 *   datastoreService.getRecordById(tableName, id)
 *   datastoreService.getRecordsByField(tableName, fieldName, value)
 *
 *   relationshipService.expandRecord(tableName, record, relationKeys)
 *   relationshipService.expandMany(tableName, records, relationKeys)
 *   relationshipService.getRelatedRecords(tableName, recordId, relatedTable, foreignKey)
 *
 * If your actual implementations differ (different argument order, different
 * return shape, promise vs callback, etc.), adjust the thin wrapper functions
 * in the "DATA ACCESS ADAPTERS" section below — the rest of the file (graph
 * building, dedup, cycle protection, traversal orchestration) does not need
 * to change.
 * ----------------------------------------------------------------------------
 */

import relationshipService from './relationshipService.js';
import datastoreService from './datastoreService.js';
import primaryKeys from '../config/primaryKeys.js';
import logger from '../utils/logger.js';
import { TABLES, RELATIONS, GRAPH_LIMITS } from '../config/graphConstants.js';

/* ============================================================================
 * SAFETY LIMITS
 * ========================================================================== */

const MAX_DEPTH = GRAPH_LIMITS?.MAX_DEPTH ?? 5;
const MAX_NODES = GRAPH_LIMITS?.MAX_NODES ?? 500;

/**
 * Cap for the unfiltered/global network (GET /graph/network with no filter).
 * Seed count only — MAX_DEPTH / MAX_NODES bound the expansion from each seed.
 */
const GLOBAL_NETWORK_SEED_CASES = GRAPH_LIMITS?.GLOBAL_NETWORK_SEED_CASES ?? 25;

/* ============================================================================
 * DATA ACCESS ADAPTERS
 * (thin wrappers so the rest of the file is decoupled from exact signatures)
 * ========================================================================== */

/**
 * Fetch a single record by primary key from a Catalyst table.
 * @param {string} tableName
 * @param {string|number} id
 * @returns {Promise<object|null>}
 */
async function getRecordById(tableName, id) {
  if (!id) return null;
  try {
    // Traversal ids come from `recordId()`, which prefers Catalyst's ROWID,
    // while datastoreService.getRecordById resolves against the table's
    // BUSINESS key (config/primaryKeys.js — e.g. accused -> accusedmasterid).
    // Whenever those differ, every hop after the first missed and the walk
    // stopped dead at a single node. Accept either form rather than editing the
    // ~15 `recordId()` call sites, each of which would have to name its table.
    const record = await datastoreService.getRecordById(tableName, id);
    if (record) return record;

    const byRowId = await datastoreService.getByColumn(null, tableName, 'ROWID', id);
    return byRowId || null;
  } catch (err) {
    logger.error(`[networkGraphService] getRecordById failed for ${tableName}#${id}: ${err.message}`);
    return null;
  }
}

/**
 * Fetch multiple records from a table where fieldName === value.
 * @param {string} tableName
 * @param {string} fieldName
 * @param {string|number} value
 * @returns {Promise<Array<object>>}
 */
async function getRecordsByField(tableName, fieldName, value) {
  if (!value) return [];
  try {
    const records = await datastoreService.getRecordsByField(tableName, fieldName, value);
    return Array.isArray(records) ? records : [];
  } catch (err) {
    logger.error(`[networkGraphService] getRecordsByField failed for ${tableName}.${fieldName}=${value}: ${err.message}`);
    return [];
  }
}

/**
 * Expand a single record's relationships using the shared relationship engine.
 * @param {string} tableName
 * @param {object} record
 * @param {Array<string>} relationKeys - keys from relationship.js / RELATIONS config
 * @returns {Promise<object>} the expanded record
 */
async function expandRelationships(tableName, record, relationKeys = []) {
  if (!record) return null;
  try {
    // relationshipService.expandRecord is (catalystApp, table, record, depth,
    // maxDepth) and — unlike getRelatedRecords — carries NO arg-shifting shim.
    // Calling it as (tableName, record, relationKeys) bound `table` to the
    // record object and `record` to the relationKeys array, so `relationships
    // [table]` missed, the `!relationConfig` guard fired, and this returned the
    // relationKeys ARRAY instead of an expanded record. Every downstream
    // `expanded.Unit` / `expanded.unitId` read was therefore undefined, which
    // is why a traversed case produced a bare node with no unit, court,
    // officer or crime-head attached.
    //
    // `relationKeys` is vestigial: expandRecord derives the relations to walk
    // from config/relationships.js keyed on the table name.
    return await relationshipService.expandRecord(null, tableName, record);
  } catch (err) {
    logger.error(`[networkGraphService] expandRelationships failed for ${tableName}: ${err.message}`);
    return record;
  }
}

/**
 * Get related records for a record via the relationship engine
 * (e.g. all Accused for a Case, all Sections for an Act, etc.)
 * @param {string} tableName - source table
 * @param {string|number} recordId - source record id
 * @param {string} relatedTable - target table name
 * @param {string} [foreignKey] - optional explicit FK override
 * @returns {Promise<Array<object>>}
 */
async function getRelatedRecords(tableName, recordId, relatedTable, foreignKey) {
  if (!recordId) return [];
  try {
    const related = await relationshipService.getRelatedRecords(tableName, recordId, relatedTable, foreignKey);
    return Array.isArray(related) ? related : [];
  } catch (err) {
    logger.error(`[networkGraphService] getRelatedRecords failed for ${tableName}#${recordId} -> ${relatedTable}: ${err.message}`);
    return [];
  }
}

/* ============================================================================
 * GRAPH STATE CONTAINER
 * ========================================================================== */

/**
 * Creates a fresh graph accumulator object with de-dup maps, a visited-set
 * for cycle detection, and a running node counter for MAX_NODES enforcement.
 */
function createGraphState() {
  return {
    nodeMap: new Map(), // nodeId -> node object
    edgeMap: new Map(), // edgeId -> edge object
    visited: new Set(), // `${tableName}:${recordId}` -> already traversed
    nodeCount: 0,
    truncated: false,
  };
}

/* ============================================================================
 * HELPER BUILDERS (required by spec)
 * ========================================================================== */

/**
 * Build a React Flow compatible node.
 * @param {string|number} id - raw record id
 * @param {string} type - node "type" (e.g. 'case', 'victim', 'accused')
 * @param {string} label - human readable label
 * @param {object} data - full data payload for the node
 * @returns {{id:string, type:string, label:string, data:object}}
 */
function buildNode(id, type, label, data = {}) {
  const resolved = label ?? `${type}_${id}`;
  return {
    id: `${type}_${id}`,
    type,
    // `name` is the frontend contract (networkService.js NetworkNode); `label`
    // is retained for the existing React Flow consumers. `centrality` is filled
    // in by serializeGraph once the full edge set is known.
    name: resolved,
    label: resolved,
    data,
  };
}

/**
 * Build a React Flow compatible edge.
 * @param {string} sourceNodeId - already-prefixed node id (e.g. 'case_101')
 * @param {string} targetNodeId - already-prefixed node id
 * @param {string} label - relationship label (e.g. 'HAS_VICTIM')
 * @returns {{id:string, source:string, target:string, label:string}}
 */
function buildEdge(sourceNodeId, targetNodeId, label) {
  return {
    id: `edge_${sourceNodeId}__${targetNodeId}__${label}`,
    source: sourceNodeId,
    target: targetNodeId,
    label,
    // `weight` is the frontend contract (NetworkEdge). Structural edges from the
    // traversal are unweighted, so 1. A true co-occurrence weight (how many
    // cases two accused share, as graphNetworks/main.py computed) needs the
    // accused-to-accused topology discussed in DEPLOY.md, not a field default.
    weight: 1,
  };
}

/**
 * Add a node to the graph state, de-duplicating by node.id.
 * Enforces MAX_NODES. Returns false if the node was rejected (limit hit).
 * @param {object} graph - graph state (see createGraphState)
 * @param {object} node - node built via buildNode()
 * @returns {boolean} whether the node was added (or already existed)
 */
function addNode(graph, node) {
  if (!node) return false;
  if (graph.nodeMap.has(node.id)) {
    return true; // already present - not an error, just a dedup no-op
  }
  if (graph.nodeCount >= MAX_NODES) {
    graph.truncated = true;
    logger.warn(`[networkGraphService] MAX_NODES (${MAX_NODES}) reached. Truncating graph.`);
    return false;
  }
  graph.nodeMap.set(node.id, node);
  graph.nodeCount += 1;
  return true;
}

/**
 * Add an edge to the graph state, de-duplicating by edge.id.
 * Silently no-ops if either endpoint node is missing from the graph.
 * @param {object} graph - graph state
 * @param {object} edge - edge built via buildEdge()
 */
function addEdge(graph, edge) {
  if (!edge) return;
  if (!graph.nodeMap.has(edge.source) || !graph.nodeMap.has(edge.target)) {
    // Do not create dangling edges - both endpoints must exist as nodes.
    return;
  }
  if (graph.edgeMap.has(edge.id)) return;
  graph.edgeMap.set(edge.id, edge);
}

/**
 * Cycle / re-visit guard. Returns true if (tableName, recordId) has already
 * been traversed in this graph build, and marks it visited otherwise.
 * @param {object} graph
 * @param {string} tableName
 * @param {string|number} recordId
 * @returns {boolean} true if this is a DUPLICATE visit (caller should stop)
 */
function isVisited(graph, tableName, recordId) {
  const key = `${tableName}:${recordId}`;
  if (graph.visited.has(key)) return true;
  graph.visited.add(key);
  return false;
}

/**
 * Serialize the accumulated graph state into final React Flow JSON.
 * @param {object} graph
 * @returns {{nodes: Array, edges: Array, meta: object}}
 */
function serializeGraph(graph) {
  const nodes = Array.from(graph.nodeMap.values());
  const edges = Array.from(graph.edgeMap.values());

  // Degree centrality, normalized to 0..1 by the maximum possible degree
  // (n - 1). The frontend's NetworkNode contract requires `centrality` and uses
  // it to scale node prominence, so it has to be comparable across graphs of
  // different sizes — a raw degree count would make every large graph look
  // uniformly important. Neither Python graph job computes any centrality
  // measure (build_network_dataset emits bare co-accused pairs;
  // graphNetworks emits an edge-level casescount), so degree is computed here.
  const degree = new Map();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const maxPossible = nodes.length > 1 ? nodes.length - 1 : 0;
  for (const node of nodes) {
    const d = degree.get(node.id) ?? 0;
    node.degree = d;
    node.centrality = maxPossible > 0 ? Number((d / maxPossible).toFixed(4)) : 0;
  }

  return {
    nodes,
    edges,
    meta: {
      nodeCount: graph.nodeMap.size,
      edgeCount: graph.edgeMap.size,
      truncated: graph.truncated,
      maxDepth: MAX_DEPTH,
      maxNodes: MAX_NODES,
    },
  };
}

/* ============================================================================
 * FIELD / LABEL HELPERS
 * ========================================================================== */

/**
 * Label columns for a `casemaster` row, most human-meaningful first.
 *
 * `crimeno` and `caseno` are confirmed real columns (services/mapService.js
 * reads them directly) and `firnumber` comes from config/querymap.js
 * (`CASE_BY_NUMBER.where.firNumber -> "firnumber"`). The camelCase spellings are
 * kept as trailing fallbacks so the synthetic fixtures in
 * scratch/verify_graph_traversal.mjs still label correctly.
 */
const CASE_LABEL_KEYS = ['crimeno', 'caseno', 'firnumber', 'caseNumber', 'firNumber', 'title'];

/**
 * Read the first present value among `names`, case-insensitively.
 *
 * WHY CASE-INSENSITIVE: this file was written against a camelCase schema
 * (`unitId`, `crimeHeadId`, `districtName`) but the Catalyst Data Store tables
 * are all-lowercase (`unitid`, `crimeheadid`, `districtname` — see
 * config/primaryKeys.js and config/querymap.js). JS property access is
 * case-sensitive, so every one of those reads was silently undefined against
 * real rows while passing against the camelCase test fixtures.
 *
 * @param {object} record
 * @param {...string} names - candidate keys, in priority order
 * @returns {*} the first non-empty value, or undefined
 */
function field(record, ...names) {
  if (!record) return undefined;
  for (const name of names) {
    const v = record[name];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  const wanted = names.map((n) => n.toLowerCase());
  for (const key of Object.keys(record)) {
    if (!wanted.includes(key.toLowerCase())) continue;
    const v = record[key];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/**
 * Human-readable label for a node.
 *
 * Falls back to any `*name` / `*number` / `*title` column before giving up and
 * showing `#ROWID`. The exact label column differs per table (`unitname`,
 * `districtname`, `firnumber`, …) and the callers' camelCase candidate lists
 * matched none of them — which is why every node in the deployed graph rendered
 * as `#54650000000014575`. The generic sweep means a table whose label column
 * nobody documented still gets a usable label.
 */
function safeLabel(record, candidates = ['name', 'title', 'label', 'caseNumber', 'accountNumber', 'transactionId']) {
  if (!record) return 'Unknown';

  const direct = field(record, ...candidates);
  if (direct && typeof direct !== 'object') return String(direct);

  for (const key of Object.keys(record)) {
    if (!/(name|number|title)$/i.test(key)) continue;
    if (/id$/i.test(key)) continue; // *nameid / *numberid are keys, not labels
    const v = record[key];
    if (v !== undefined && v !== null && v !== '' && typeof v !== 'object') return String(v);
  }

  return record.ROWID ? `#${record.ROWID}` : 'Unknown';
}

function recordId(record) {
  return record?.ROWID ?? record?.id ?? record?.ID;
}

/* ============================================================================
 * TRAVERSAL: CASE
 * ========================================================================== */

/**
 * Traverse a Case and all of its directly / indirectly related entities:
 * Victim -> Accused -> Police Station -> District -> State -> Court ->
 * Investigating Officer -> Crime Head -> Crime Sub Head -> Acts -> Sections ->
 * Charge Sheet -> Bank Accounts -> Financial Transactions -> Transaction Alerts.
 *
 * @param {object} graph - graph state
 * @param {string|number} caseId
 * @param {number} depth - current recursion depth
 */
async function traverseCase(graph, caseId, depth = 0) {
  if (depth > MAX_DEPTH || graph.truncated) return;
  if (isVisited(graph, TABLES.CASE_MASTER, caseId)) return;

  const caseRecord = await getRecordById(TABLES.CASE_MASTER, caseId);
  if (!caseRecord) {
    logger.warn(`[networkGraphService] Case ${caseId} not found`);
    return;
  }

  const expandedCase = await expandRelationships(TABLES.CASE_MASTER, caseRecord, RELATIONS.CASE_MASTER);
  const caseNode = buildNode(caseId, 'case', safeLabel(expandedCase, CASE_LABEL_KEYS), expandedCase);
  if (!addNode(graph, caseNode)) return;

  // --- Unit / Police Station -----------------------------------------------
  // `casemaster` has NO `unitid` column: the FK is `policestationid`, so
  // expandRecord names the expansion `.policestation` (alias = FK minus the
  // trailing "id", see config/relationships.js). The camelCase `.unitId` /
  // `.Unit` reads this replaced matched nothing on a real row, which is why a
  // deployed graph was 25 isolated case nodes with no edges at all.
  const caseUnitId = field(expandedCase, 'policestationid', 'unitid');
  const caseUnit = expandedCase.policestation || expandedCase.unit
    || (caseUnitId ? await getRecordById(TABLES.UNIT, caseUnitId) : null);
  if (caseUnit) {
    const unitId = recordId(caseUnit) ?? caseUnitId;
    const unitNode = buildNode(unitId, 'policeStation', safeLabel(caseUnit, ['unitname', 'unitName', 'name']), caseUnit);
    if (addNode(graph, unitNode)) {
      addEdge(graph, buildEdge(caseNode.id, unitNode.id, 'INVESTIGATED_AT'));
      await traverseDistrictAndState(graph, caseUnit, unitNode, depth + 1);
    }
  }

  // --- Court -----------------------------------------------------------------
  const caseCourtId = field(expandedCase, 'courtid');
  const caseCourt = expandedCase.court
    || (caseCourtId ? await getRecordById(TABLES.COURT, caseCourtId) : null);
  if (caseCourt) {
    const courtId = recordId(caseCourt) ?? caseCourtId;
    const courtNode = buildNode(courtId, 'court', safeLabel(caseCourt, ['courtname', 'courtName', 'name']), caseCourt);
    if (addNode(graph, courtNode)) {
      addEdge(graph, buildEdge(caseNode.id, courtNode.id, 'TRIED_AT'));
    }
  }

  // --- Investigating Officer ---------------------------------------------
  // FK is `policepersonid` -> `.policeperson` (table `employee`).
  const caseOfficerId = field(expandedCase, 'policepersonid', 'investigatingofficerid', 'ioid');
  const caseOfficer = expandedCase.policeperson || expandedCase.investigatingofficer
    || (caseOfficerId ? await getRecordById(TABLES.EMPLOYEE, caseOfficerId) : null);
  if (caseOfficer) {
    const officerId = recordId(caseOfficer) ?? caseOfficerId;
    const officerNode = buildNode(officerId, 'officer', safeLabel(caseOfficer, ['employeename', 'name', 'employeeName']), caseOfficer);
    if (addNode(graph, officerNode)) {
      addEdge(graph, buildEdge(caseNode.id, officerNode.id, 'INVESTIGATED_BY'));
    }
  }

  // --- Crime Head / Sub Head ------------------------------------------------
  // `casemaster` splits the classification across two FKs: `crimemajorheadid`
  // -> `.crimemajorhead` (table `crimehead`) and `crimeminorheadid` ->
  // `.crimeminorhead` (table `crimesubhead`). There is no `crimeheadid` column
  // on casemaster, so the old `.crimeHeadId` read never resolved.
  const caseCrimeHeadId = field(expandedCase, 'crimemajorheadid', 'crimeheadid');
  const caseCrimeHead = expandedCase.crimemajorhead || expandedCase.crimehead
    || (caseCrimeHeadId ? await getRecordById(TABLES.CRIME_HEAD, caseCrimeHeadId) : null);
  if (caseCrimeHead) {
    const crimeHeadId = recordId(caseCrimeHead) ?? caseCrimeHeadId;
    const crimeHeadNode = buildNode(crimeHeadId, 'crimeHead', safeLabel(caseCrimeHead, ['crimeheadname', 'name', 'crimeHeadName']), caseCrimeHead);
    if (addNode(graph, crimeHeadNode)) {
      addEdge(graph, buildEdge(caseNode.id, crimeHeadNode.id, 'CLASSIFIED_AS'));

      // The case's own minor head comes off the expansion directly; the
      // getRelatedRecords sweep still picks up any other sub-heads of this head.
      const minorHead = expandedCase.crimeminorhead;
      const subHeads = await getRelatedRecords(TABLES.CRIME_HEAD, crimeHeadId, TABLES.CRIME_SUB_HEAD);
      for (const subHead of (minorHead ? [minorHead, ...subHeads] : subHeads)) {
        const subHeadId = recordId(subHead);
        const subHeadNode = buildNode(subHeadId, 'crimeSubHead', safeLabel(subHead, ['crimesubheadname', 'name', 'crimeSubHeadName']), subHead);
        if (addNode(graph, subHeadNode)) {
          addEdge(graph, buildEdge(crimeHeadNode.id, subHeadNode.id, 'HAS_SUBHEAD'));
        }
      }
    }
  }

  // --- Acts / Sections --------------------------------------------------
  const acts = await getRelatedRecords(TABLES.CASE_MASTER, caseId, TABLES.ACT);
  for (const act of acts) {
    const actId = recordId(act);
    const actNode = buildNode(actId, 'act', safeLabel(act, ['actName', 'name']), act);
    if (addNode(graph, actNode)) {
      addEdge(graph, buildEdge(caseNode.id, actNode.id, 'CHARGED_UNDER_ACT'));

      const sections = await getRelatedRecords(TABLES.ACT, actId, TABLES.SECTION);
      for (const section of sections) {
        const sectionId = recordId(section);
        const sectionNode = buildNode(sectionId, 'section', safeLabel(section, ['sectionName', 'sectionNumber', 'name']), section);
        if (addNode(graph, sectionNode)) {
          addEdge(graph, buildEdge(actNode.id, sectionNode.id, 'HAS_SECTION'));
        }
      }
    }
  }

  // --- Charge Sheet -----------------------------------------------------
  const chargeSheets = await getRelatedRecords(TABLES.CASE_MASTER, caseId, TABLES.CHARGE_SHEET_DETAILS);
  for (const chargeSheet of chargeSheets) {
    const csId = recordId(chargeSheet);
    const csNode = buildNode(csId, 'chargeSheet', safeLabel(chargeSheet, ['chargeSheetNumber', 'name']), chargeSheet);
    if (addNode(graph, csNode)) {
      addEdge(graph, buildEdge(caseNode.id, csNode.id, 'HAS_CHARGESHEET'));
    }
  }

  // --- Victims (and their downstream Accused / financial trail) ----------
  await traverseVictim(graph, caseId, caseNode, depth + 1);

  // --- Accused directly linked to case (in case not reached via victim) --
  const accusedList = await getRelatedRecords(TABLES.CASE_MASTER, caseId, TABLES.ACCUSED);
  for (const accused of accusedList) {
    const accusedId = recordId(accused);
    // NO isVisited() pre-check here: it is test-AND-SET, and traverseAccused
    // runs the same guard itself. Checking here consumed the mark, so the
    // callee's own check always saw "already visited" and returned immediately
    // — the accused branch never executed once.
    await traverseAccused(graph, accusedId, depth + 1, caseNode);
  }
}

/**
 * Traverse Victims for a given case, linking Case -> Victim -> Accused.
 * @param {object} graph
 * @param {string|number} caseId
 * @param {object} caseNode - already-built case node
 * @param {number} depth
 */
async function traverseVictim(graph, caseId, caseNode, depth = 0) {
  if (depth > MAX_DEPTH || graph.truncated) return;

  const victims = await getRelatedRecords(TABLES.CASE_MASTER, caseId, TABLES.VICTIM);
  for (const victim of victims) {
    const victimId = recordId(victim);
    if (isVisited(graph, TABLES.VICTIM, victimId)) continue;

    const victimNode = buildNode(victimId, 'victim', safeLabel(victim, ['name', 'victimName']), victim);
    if (!addNode(graph, victimNode)) return;
    addEdge(graph, buildEdge(caseNode.id, victimNode.id, 'HAS_VICTIM'));

    // Complainant details linked to the victim (if applicable)
    const complainants = await getRelatedRecords(TABLES.VICTIM, victimId, TABLES.COMPLAINANT_DETAILS);
    for (const complainant of complainants) {
      const complainantId = recordId(complainant);
      const complainantNode = buildNode(complainantId, 'complainant', safeLabel(complainant, ['name', 'complainantName']), complainant);
      if (addNode(graph, complainantNode)) {
        addEdge(graph, buildEdge(victimNode.id, complainantNode.id, 'FILED_BY'));
      }
    }

    // Accused associated with this victim
    const accusedList = await getRelatedRecords(TABLES.VICTIM, victimId, TABLES.ACCUSED);
    for (const accused of accusedList) {
      const accusedId = recordId(accused);
      // See the note in traverseCase: traverseAccused self-guards, and
      // isVisited() is test-and-set, so a pre-check here disables the callee.
      await traverseAccused(graph, accusedId, depth + 1, victimNode);
    }
  }
}

/**
 * Traverse District -> State starting from a Unit (police station) record.
 * @param {object} graph
 * @param {object} unit
 * @param {object} unitNode
 * @param {number} depth
 */
async function traverseDistrictAndState(graph, unit, unitNode, depth = 0) {
  if (depth > MAX_DEPTH || graph.truncated) return;

  // `unit.districtid` -> `.district`, `district.stateid` -> `.state`. Both were
  // read as camelCase (`districtId` / `.District`) and so never resolved.
  const districtId = field(unit, 'districtid') ?? unit.district?.ROWID;
  const district = unit.district || (districtId ? await getRecordById(TABLES.DISTRICT, districtId) : null);
  if (!district) return;

  const dId = recordId(district) ?? districtId;
  const districtNode = buildNode(dId, 'district', safeLabel(district, ['districtname', 'districtName', 'name']), district);
  if (!addNode(graph, districtNode)) return;
  addEdge(graph, buildEdge(unitNode.id, districtNode.id, 'LOCATED_IN'));

  // District demographics (context data - attached, not deeply traversed)
  const demographics = await getRelatedRecords(TABLES.DISTRICT, dId, TABLES.DISTRICT_DEMOGRAPHICS);
  for (const demo of demographics) {
    const demoId = recordId(demo);
    const demoNode = buildNode(demoId, 'demographics', safeLabel(demo, ['name']) , demo);
    if (addNode(graph, demoNode)) {
      addEdge(graph, buildEdge(districtNode.id, demoNode.id, 'HAS_DEMOGRAPHICS'));
    }
  }

  const stateId = field(district, 'stateid') ?? district.state?.ROWID;
  const state = district.state || (stateId ? await getRecordById(TABLES.STATE, stateId) : null);
  if (!state) return;

  const sId = recordId(state) ?? stateId;
  const stateNode = buildNode(sId, 'state', safeLabel(state, ['statename', 'stateName', 'name']), state);
  if (addNode(graph, stateNode)) {
    addEdge(graph, buildEdge(districtNode.id, stateNode.id, 'PART_OF_STATE'));
  }
}

/* ============================================================================
 * TRAVERSAL: ACCUSED
 * ========================================================================== */

/**
 * Traverse an Accused and their related cases, arrests, bank accounts,
 * transactions, alerts, police stations and crime types.
 * @param {object} graph
 * @param {string|number} accusedId
 * @param {number} depth
 * @param {object} [linkFromNode] - optional node to link the accused FROM (e.g. victim/case)
 */
async function traverseAccused(graph, accusedId, depth = 0, linkFromNode = null) {
  if (depth > MAX_DEPTH || graph.truncated) return;
  if (isVisited(graph, TABLES.ACCUSED, accusedId)) return;

  const accusedRecord = await getRecordById(TABLES.ACCUSED, accusedId);
  if (!accusedRecord) return;

  const expandedAccused = await expandRelationships(TABLES.ACCUSED, accusedRecord, RELATIONS.ACCUSED);
  const accusedNode = buildNode(accusedId, 'accused', safeLabel(expandedAccused, ['name', 'accusedName']), expandedAccused);
  if (!addNode(graph, accusedNode)) return;

  if (linkFromNode) {
    addEdge(graph, buildEdge(linkFromNode.id, accusedNode.id, 'INVOLVES_ACCUSED'));
  }

  // --- Cases linked to accused (captures many-to-many accused<->case) ----
  const cases = await getRelatedRecords(TABLES.ACCUSED, accusedId, TABLES.CASE_MASTER);
  for (const caseRecord of cases) {
    const caseId = recordId(caseRecord);
    const caseNode = buildNode(caseId, 'case', safeLabel(caseRecord, CASE_LABEL_KEYS), caseRecord);
    if (addNode(graph, caseNode)) {
      addEdge(graph, buildEdge(accusedNode.id, caseNode.id, 'ACCUSED_IN'));
    }
  }

  // --- Arrests / Surrender -------------------------------------------------
  const arrests = await getRelatedRecords(TABLES.ACCUSED, accusedId, TABLES.ARREST_SURRENDER);
  for (const arrest of arrests) {
    const arrestId = recordId(arrest);
    const arrestNode = buildNode(arrestId, 'arrest', safeLabel(arrest, ['arrestNumber', 'name']), arrest);
    if (addNode(graph, arrestNode)) {
      addEdge(graph, buildEdge(accusedNode.id, arrestNode.id, 'ARRESTED'));

      // Police station that made the arrest. `arrestsurrender.policestationid`
      // -> `.policestation`; there is no `unitid` on that table either.
      const arrestingUnitId = field(arrest, 'policestationid', 'unitid');
      if (arrestingUnitId || arrest.policestation) {
        const unit = arrest.policestation || (await getRecordById(TABLES.UNIT, arrestingUnitId));
        if (unit) {
          const unitId = recordId(unit) ?? arrestingUnitId;
          const unitNode = buildNode(unitId, 'policeStation', safeLabel(unit, ['unitname', 'unitName', 'name']), unit);
          if (addNode(graph, unitNode)) {
            addEdge(graph, buildEdge(arrestNode.id, unitNode.id, 'ARRESTED_BY_UNIT'));
          }
        }
      }
    }
  }

  // --- Bank accounts linked to accused --------------------------------
  await traverseAccounts(graph, TABLES.ACCUSED, accusedId, accusedNode, depth + 1);

  // --- Crime types associated with the accused (via their cases) ---------
  for (const caseRecord of cases) {
    const majorHeadId = field(caseRecord, 'crimemajorheadid', 'crimeheadid');
    const crimeHead = caseRecord.crimemajorhead || caseRecord.crimehead
      || (majorHeadId ? await getRecordById(TABLES.CRIME_HEAD, majorHeadId) : null);
    if (crimeHead) {
      const crimeHeadId = recordId(crimeHead) ?? majorHeadId;
      const crimeHeadNode = buildNode(crimeHeadId, 'crimeHead', safeLabel(crimeHead, ['crimeheadname', 'name', 'crimeHeadName']), crimeHead);
      if (addNode(graph, crimeHeadNode)) {
        addEdge(graph, buildEdge(accusedNode.id, crimeHeadNode.id, 'ASSOCIATED_CRIME_TYPE'));
      }
    }
  }
}

/* ============================================================================
 * TRAVERSAL: BANK ACCOUNTS
 * ========================================================================== */

/**
 * Traverse bank accounts linked to a source record (Accused or CaseMaster)
 * and, for each account, cascade into its financial transactions.
 * @param {object} graph
 * @param {string} sourceTable
 * @param {string|number} sourceId
 * @param {object} sourceNode
 * @param {number} depth
 */
async function traverseAccounts(graph, sourceTable, sourceId, sourceNode, depth = 0) {
  if (depth > MAX_DEPTH || graph.truncated) return;

  const links = await getRelatedRecords(sourceTable, sourceId, TABLES.BANK_ACCOUNT_LINK);
  for (const link of links) {
    const linkId = recordId(link);
    const accountNode = buildNode(linkId, 'bankAccount', safeLabel(link, ['accountNumber', 'name']), link);
    if (!addNode(graph, accountNode)) continue;
    addEdge(graph, buildEdge(sourceNode.id, accountNode.id, 'LINKED_ACCOUNT'));

    await traverseTransactions(graph, linkId, accountNode, depth + 1);
  }
}

/* ============================================================================
 * TRAVERSAL: FINANCIAL TRANSACTIONS
 * ========================================================================== */

/**
 * Traverse financial transactions for a bank account and cascade into
 * transaction alerts.
 * @param {object} graph
 * @param {string|number} accountId
 * @param {object} accountNode
 * @param {number} depth
 */
async function traverseTransactions(graph, accountId, accountNode, depth = 0) {
  if (depth > MAX_DEPTH || graph.truncated) return;

  const transactions = await getRelatedRecords(TABLES.BANK_ACCOUNT_LINK, accountId, TABLES.FINANCIAL_TRANSACTION);
  for (const txn of transactions) {
    const txnId = recordId(txn);
    if (isVisited(graph, TABLES.FINANCIAL_TRANSACTION, txnId)) continue;

    const txnNode = buildNode(txnId, 'transaction', safeLabel(txn, ['transactionId', 'referenceNumber']), txn);
    if (!addNode(graph, txnNode)) return;
    addEdge(graph, buildEdge(accountNode.id, txnNode.id, 'HAS_TRANSACTION'));

    // Destination account (if different from source).
    // `financialtransaction.destinationaccountid` -> `.destinationaccount`.
    const destAccountId = field(txn, 'destinationaccountid', 'toaccountid');
    if (destAccountId && destAccountId !== accountId) {
      const destAccount = txn.destinationaccount
        || (await getRecordById(TABLES.BANK_ACCOUNT_LINK, destAccountId));
      if (destAccount) {
        const destNode = buildNode(destAccountId, 'bankAccount', safeLabel(destAccount, ['accountNumber', 'name']), destAccount);
        if (addNode(graph, destNode)) {
          addEdge(graph, buildEdge(txnNode.id, destNode.id, 'CREDITED_TO'));
        }
      }
    }

    await traverseAlerts(graph, txnId, txnNode, depth + 1);
  }
}

/* ============================================================================
 * TRAVERSAL: TRANSACTION ALERTS
 * ========================================================================== */

/**
 * Traverse transaction alerts raised against a financial transaction.
 * @param {object} graph
 * @param {string|number} transactionId
 * @param {object} transactionNode
 * @param {number} depth
 */
async function traverseAlerts(graph, transactionId, transactionNode, depth = 0) {
  if (depth > MAX_DEPTH || graph.truncated) return;

  const alerts = await getRelatedRecords(TABLES.FINANCIAL_TRANSACTION, transactionId, TABLES.TRANSACTION_ALERT);
  for (const alert of alerts) {
    const alertId = recordId(alert);
    const alertNode = buildNode(alertId, 'alert', safeLabel(alert, ['alertType', 'name']), alert);
    if (addNode(graph, alertNode)) {
      addEdge(graph, buildEdge(transactionNode.id, alertNode.id, 'FLAGGED_BY_ALERT'));
    }
  }
}

/* ============================================================================
 * PUBLIC ORCHESTRATORS (one per API endpoint)
 * ========================================================================== */

/**
 * GET /graph/case/:id
 * Builds the full relationship graph rooted at a CaseMaster record.
 * @param {string|number} caseId
 * @returns {Promise<{nodes:Array, edges:Array, meta:object}>}
 */
async function buildCaseGraph(caseId) {
  const graph = createGraphState();
  await traverseCase(graph, caseId, 0);
  logger.info(`[networkGraphService] buildCaseGraph(${caseId}) -> ${graph.nodeMap.size} nodes, ${graph.edgeMap.size} edges`);
  return serializeGraph(graph);
}

/**
 * GET /graph/accused/:id
 * Builds the full relationship graph rooted at an Accused record.
 * @param {string|number} accusedId
 * @returns {Promise<{nodes:Array, edges:Array, meta:object}>}
 */
async function buildAccusedGraph(accusedId) {
  const graph = createGraphState();
  await traverseAccused(graph, accusedId, 0, null);
  logger.info(`[networkGraphService] buildAccusedGraph(${accusedId}) -> ${graph.nodeMap.size} nodes, ${graph.edgeMap.size} edges`);
  return serializeGraph(graph);
}

/**
 * GET /graph/transaction/:id
 * Builds a focused graph around a single FinancialTransaction: source
 * account, destination account, related case, alerts, officer, district.
 * @param {string|number} transactionId
 * @returns {Promise<{nodes:Array, edges:Array, meta:object}>}
 */
async function buildTransactionGraph(transactionId) {
  const graph = createGraphState();

  const txnRecord = await getRecordById(TABLES.FINANCIAL_TRANSACTION, transactionId);
  if (!txnRecord) {
    logger.warn(`[networkGraphService] Transaction ${transactionId} not found`);
    return serializeGraph(graph);
  }

  const txnNode = buildNode(transactionId, 'transaction', safeLabel(txnRecord, ['transactionId', 'referenceNumber']), txnRecord);
  addNode(graph, txnNode);

  // Source account. Real column names per config/relationships.js:
  // sourceaccountid / destinationaccountid / casemasterid / investigatingofficerid.
  const sourceAccountId = field(txnRecord, 'sourceaccountid', 'accountid');
  if (sourceAccountId) {
    const sourceAccount = await getRecordById(TABLES.BANK_ACCOUNT_LINK, sourceAccountId);
    if (sourceAccount) {
      const sourceNode = buildNode(sourceAccountId, 'bankAccount', safeLabel(sourceAccount, ['accountNumber', 'name']), sourceAccount);
      if (addNode(graph, sourceNode)) {
        addEdge(graph, buildEdge(sourceNode.id, txnNode.id, 'HAS_TRANSACTION'));
      }
    }
  }

  // Destination account
  const destAccountId = field(txnRecord, 'destinationaccountid', 'toaccountid');
  if (destAccountId) {
    const destAccount = await getRecordById(TABLES.BANK_ACCOUNT_LINK, destAccountId);
    if (destAccount) {
      const destNode = buildNode(destAccountId, 'bankAccount', safeLabel(destAccount, ['accountNumber', 'name']), destAccount);
      if (addNode(graph, destNode)) {
        addEdge(graph, buildEdge(txnNode.id, destNode.id, 'CREDITED_TO'));
      }
    }
  }

  // Related case
  const caseId = field(txnRecord, 'casemasterid', 'caseid');
  if (caseId) {
    const caseRecord = await getRecordById(TABLES.CASE_MASTER, caseId);
    if (caseRecord) {
      const caseNode = buildNode(caseId, 'case', safeLabel(caseRecord, CASE_LABEL_KEYS), caseRecord);
      if (addNode(graph, caseNode)) {
        addEdge(graph, buildEdge(caseNode.id, txnNode.id, 'FINANCIAL_TRAIL'));
      }

      // Investigating Officer via case
      const officerId = field(caseRecord, 'policepersonid', 'investigatingofficerid', 'ioid');
      if (officerId) {
        const officer = await getRecordById(TABLES.EMPLOYEE, officerId);
        if (officer) {
          const officerNode = buildNode(officerId, 'officer', safeLabel(officer, ['employeename', 'name', 'employeeName']), officer);
          if (addNode(graph, officerNode)) {
            addEdge(graph, buildEdge(caseNode.id, officerNode.id, 'INVESTIGATED_BY'));
          }
        }
      }

      // District via case's Unit
      const unitId = field(caseRecord, 'policestationid', 'unitid');
      if (unitId) {
        const unit = await getRecordById(TABLES.UNIT, unitId);
        if (unit) {
          const unitNode = buildNode(unitId, 'policeStation', safeLabel(unit, ['unitname', 'unitName', 'name']), unit);
          if (addNode(graph, unitNode)) {
            addEdge(graph, buildEdge(caseNode.id, unitNode.id, 'INVESTIGATED_AT'));
            await traverseDistrictAndState(graph, unit, unitNode, 1);
          }
        }
      }
    }
  }

  // Alerts on this transaction
  await traverseAlerts(graph, transactionId, txnNode, 1);

  logger.info(`[networkGraphService] buildTransactionGraph(${transactionId}) -> ${graph.nodeMap.size} nodes, ${graph.edgeMap.size} edges`);
  return serializeGraph(graph);
}

/**
 * GET /graph/network/:caseId
 * Recursively builds the COMPLETE criminal network starting from a case,
 * cascading through every victim, accused, their other cases, and the full
 * financial trail of each accused - subject to MAX_DEPTH / MAX_NODES limits.
 * @param {string|number} caseId
 * @returns {Promise<{nodes:Array, edges:Array, meta:object}>}
 */
async function buildNetworkGraph(caseId) {
  const graph = createGraphState();

  // Seed traversal from the case (this internally reaches victims + directly
  // linked accused). We then expand outward: for every accused discovered,
  // pull in their OTHER cases and recurse into those too, up to MAX_DEPTH.
  await traverseCase(graph, caseId, 0);

  let frontierDepth = 1;
  let accusedIdsToExpand = Array.from(graph.visited)
    .filter((key) => key.startsWith(`${TABLES.ACCUSED}:`))
    .map((key) => key.split(':')[1]);

  while (accusedIdsToExpand.length > 0 && frontierDepth <= MAX_DEPTH && !graph.truncated) {
    const nextFrontier = [];

    for (const accusedId of accusedIdsToExpand) {
      const relatedCases = await getRelatedRecords(TABLES.ACCUSED, accusedId, TABLES.CASE_MASTER);
      for (const relatedCase of relatedCases) {
        const relatedCaseId = recordId(relatedCase);
        // No isVisited() pre-check — traverseCase self-guards, and the check is
        // test-and-set (see traverseCase's accused loop).
        await traverseCase(graph, relatedCaseId, frontierDepth);

        const newAccused = Array.from(graph.visited)
          .filter((key) => key.startsWith(`${TABLES.ACCUSED}:`))
          .map((key) => key.split(':')[1]);
        for (const id of newAccused) {
          if (!accusedIdsToExpand.includes(id) && !nextFrontier.includes(id)) {
            nextFrontier.push(id);
          }
        }
      }
      if (graph.truncated) break;
    }

    accusedIdsToExpand = nextFrontier;
    frontierDepth += 1;
  }

  logger.info(`[networkGraphService] buildNetworkGraph(${caseId}) -> ${graph.nodeMap.size} nodes, ${graph.edgeMap.size} edges, depth=${frontierDepth}`);
  return serializeGraph(graph);
}

/**
 * GET /graph/network  (no caseId / accusedId)
 * Builds the GLOBAL criminal network: seeds from at most
 * GLOBAL_NETWORK_SEED_CASES cases and expands each with the same traversal used
 * by the case-scoped graph, subject to MAX_DEPTH / MAX_NODES.
 *
 * @param {object} catalystApp - required; the seed listing is a ZCQL read.
 * @param {{ seedCases?: number }} [options]
 * @returns {Promise<{nodes:Array, edges:Array, meta:object}>}
 */
async function buildGlobalNetworkGraph(catalystApp, options = {}) {
  const seedCases = options.seedCases ?? GLOBAL_NETWORK_SEED_CASES;
  const graph = createGraphState();

  let cases = [];
  try {
    cases = await datastoreService.getAllRows(catalystApp, TABLES.CASE_MASTER, seedCases);
  } catch (err) {
    logger.error(`[networkGraphService] buildGlobalNetworkGraph: seed listing failed: ${err.message}`);
    return serializeGraph(graph);
  }

  // Seed with the table's BUSINESS key, not ROWID. `traverseCase` resolves the
  // case via `getRecordById`, which queries `WHERE casemasterid = ?` (see
  // config/primaryKeys.js) — so seeding with `recordId()`'s ROWID made every
  // lookup miss and the global graph came back empty every time.
  const caseKey = primaryKeys[TABLES.CASE_MASTER];
  for (const caseRecord of Array.isArray(cases) ? cases : []) {
    if (graph.truncated) break;
    const id = (caseKey ? caseRecord?.[caseKey] : undefined) ?? recordId(caseRecord);
    if (!id) continue;
    await traverseCase(graph, id, 0);
  }

  logger.info(
    `[networkGraphService] buildGlobalNetworkGraph(seedCases=${seedCases}) -> ` +
    `${graph.nodeMap.size} nodes, ${graph.edgeMap.size} edges`
  );

  const serialized = serializeGraph(graph);
  serialized.meta.scope = 'global';
  serialized.meta.seedCases = seedCases;
  serialized.meta.seedCasesFound = Array.isArray(cases) ? cases.length : 0;
  return serialized;
}

/* ============================================================================
 * EXPORTS
 * ========================================================================== */

export default {
  // public orchestrators
  buildCaseGraph,
  buildAccusedGraph,
  buildTransactionGraph,
  buildNetworkGraph,
  buildGlobalNetworkGraph,

  // helper builders (exported for unit testing per spec)
  buildNode,
  buildEdge,
  addNode,
  addEdge,
  expandRelationships,

  // traversal functions (exported for unit testing per spec)
  traverseCase,
  traverseVictim,
  traverseAccused,
  traverseTransactions,
  traverseAccounts,
  traverseAlerts,
};
