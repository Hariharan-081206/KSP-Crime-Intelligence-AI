// ============================================================================
// File: config/graphConstants.js
// SCRB Network Graph Constants
// ============================================================================

/**
 * Catalyst Table Names
 */
export const TABLES = {

    CASEMASTER: "casemaster",
    CASE_MASTER: "casemaster",

    ACCUSED: "accused",

    VICTIM: "victim",

    COMPLAINANT: "complainantdetails",
    COMPLAINANT_DETAILS: "complainantdetails",

    EMPLOYEE: "employee",

    UNIT: "unit",

    DISTRICT: "district",

    STATE: "state",

    COURT: "court",

    CRIME_HEAD: "crimehead",

    CRIME_MINOR_HEAD: "crimeminorhead",
    CRIME_SUB_HEAD: "crimeminorhead",

    ACT: "act",

    SECTION: "section",

    ACT_SECTION_ASSOCIATION: "actsectionassociation",

    CHARGESHEET: "chargesheetdetails",
    CHARGE_SHEET_DETAILS: "chargesheetdetails",

    ARREST: "arrestsurrender",
    ARREST_SURRENDER: "arrestsurrender",

    BANK_ACCOUNT: "bankaccountlink",
    BANK_ACCOUNT_LINK: "bankaccountlink",

    FINANCIAL_TRANSACTION: "financialtransaction",

    TRANSACTION_ALERT: "transactionalert"

};


/**
 * Graph Limits
 */
export const GRAPH_LIMITS = {

    MAX_DEPTH: 5,

    MAX_NODES: 500,

    /**
     * Cap for the UNFILTERED network graph (GET /graph/network with no
     * caseId/accusedId). The global graph is seeded from at most this many
     * cases; MAX_DEPTH / MAX_NODES then bound the expansion. Prevents the
     * frontend's default, filter-less call from attempting a whole-table walk.
     */
    GLOBAL_NETWORK_SEED_CASES: 25,

    MAX_EDGES: 1000,

    DEFAULT_LIMIT: 100,

    MAX_CASES: 100,

    MAX_TRANSACTIONS: 300

};


/**
 * Graph Node Types
 */
export const NODE_TYPES = {

    CASE: "case",

    ACCUSED: "accused",

    VICTIM: "victim",

    EMPLOYEE: "employee",

    POLICE_STATION: "station",

    DISTRICT: "district",

    STATE: "state",

    COURT: "court",

    CRIME_HEAD: "crimeHead",

    CRIME_MINOR_HEAD: "crimeMinorHead",

    ACT: "act",

    SECTION: "section",

    BANK_ACCOUNT: "bankAccount",

    TRANSACTION: "transaction",

    ALERT: "alert",

    CHARGESHEET: "chargesheet"

};


/**
 * Edge Labels
 */
export const EDGE_TYPES = {

    REGISTERED_AT: "REGISTERED_AT",

    INVESTIGATED_BY: "INVESTIGATED_BY",

    BELONGS_TO: "BELONGS_TO",

    OCCURRED_IN: "OCCURRED_IN",

    VICTIM: "VICTIM",

    ACCUSED: "ACCUSED",

    FILED_IN: "FILED_IN",

    CHARGESHEET: "CHARGESHEET",

    HAS_ACCOUNT: "HAS_ACCOUNT",

    SENT_TRANSACTION: "SENT",

    RECEIVED_TRANSACTION: "RECEIVED",

    GENERATED_ALERT: "ALERT",

    RELATED_CASE: "RELATED_CASE"

};


/**
 * Relationship Mapping
 * Used by networkGraphService
 */
export const RELATIONS = {

    CASEMASTER: {

        accused: TABLES.ACCUSED,

        victims: TABLES.VICTIM,

        complainants: TABLES.COMPLAINANT,

        officer: TABLES.EMPLOYEE,

        station: TABLES.UNIT,

        court: TABLES.COURT,

        chargeSheet: TABLES.CHARGESHEET,

        transactions: TABLES.FINANCIAL_TRANSACTION

    },

    ACCUSED: {

        arrests: TABLES.ARREST,

        bankAccounts: TABLES.BANK_ACCOUNT,

        transactions: TABLES.FINANCIAL_TRANSACTION

    },

    BANK_ACCOUNT: {

        transactions: TABLES.FINANCIAL_TRANSACTION

    },

    TRANSACTION: {

        alerts: TABLES.TRANSACTION_ALERT

    }

};


/**
 * Risk Levels
 */
export const RISK_LEVELS = {

    LOW: "LOW",

    MEDIUM: "MEDIUM",

    HIGH: "HIGH",

    CRITICAL: "CRITICAL"

};


/**
 * Behaviour Categories
 */
export const BEHAVIOUR_TYPES = {

    REPEAT_OFFENDER: "Repeat Offender",

    HABITUAL: "Habitual Criminal",

    ORGANIZED: "Organized Criminal",

    LONE_WOLF: "Lone Wolf",

    FINANCIAL: "Financial Fraudster",

    CYBER: "Cyber Specialist",

    PROPERTY: "Property Crime Specialist",

    VIOLENT: "Violent Offender",

    MONEY_MULE: "Money Mule",

    MASTERMIND: "Mastermind",

    ASSOCIATE: "Associate",

    UNKNOWN: "Unknown"

};


/**
 * Graph Colors
 * (Optional - useful for frontend)
 */
export const NODE_COLORS = {

    case: "#2563eb",

    accused: "#dc2626",

    victim: "#16a34a",

    employee: "#9333ea",

    station: "#ea580c",

    district: "#0f766e",

    court: "#7c3aed",

    transaction: "#0891b2",

    account: "#0284c7",

    alert: "#ef4444"

};


export default {

    TABLES,

    GRAPH_LIMITS,

    NODE_TYPES,

    EDGE_TYPES,

    RELATIONS,

    RISK_LEVELS,

    BEHAVIOUR_TYPES,

    NODE_COLORS

};