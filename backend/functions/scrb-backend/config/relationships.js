// ============================================================================
// SCRB Relationship Configuration
// Compact Version
// ============================================================================

const relationships = {

  // --------------------------------------------------------------------------
  // MASTER TABLES
  // --------------------------------------------------------------------------

  state: {},

  district: {
    stateid: ["state", "stateid"]
  },

  unittype: {},

  unit: {
    districtid: ["district", "districtid"],
    stateid: ["state", "stateid"],
    unittypeid: ["unittype", "unittypeid"]
  },

  rank: {},

  designation: {},

  employee: {
    rankid: ["rank", "rankid"],
    designationid: ["designation", "designationid"],
    districtid: ["district", "districtid"],
    stateid: ["state", "stateid"],
    unitid: ["unit", "unitid"]
  },

  court: {
    districtid: ["district", "districtid"],
    stateid: ["state", "stateid"]
  },

  religionmaster: {},

  castemaster: {
    religionid: ["religionmaster", "religionid"]
  },

  occupationmaster: {},

  casecategory: {},

  casestatusmaster: {},

  gravityoffence: {},

  // --------------------------------------------------------------------------
  // CRIME
  // --------------------------------------------------------------------------

  crimehead: {},

  crimesubhead: {
    crimeheadid: ["crimehead", "crimeheadid"]
  },

  act: {},

  section: {
    actid: ["act", "actid"]
  },

  crimeheadactsection: {
    crimeheadid: ["crimehead", "crimeheadid"],
    actid: ["act", "actid"],
    sectionid: ["section", "sectionid"]
  },

  actsectionassociation: {
    actid: ["act", "actid"],
    sectionid: ["section", "sectionid"],
    casemasterid: ["casemaster", "casemasterid"]
  },

  // --------------------------------------------------------------------------
  // CASE MASTER
  // --------------------------------------------------------------------------

  casemaster: {

    policepersonid: ["employee", "employeeid"],

    policestationid: ["unit", "unitid"],

    casecategoryid: ["casecategory", "casecategoryid"],

    gravityoffenceid: ["gravityoffence", "gravityoffenceid"],

    crimemajorheadid: ["crimehead", "crimeheadid"],

    crimeminorheadid: ["crimesubhead", "crimesubheadid"],

    casestatusid: ["casestatusmaster", "casestatusid"],

    courtid: ["court", "courtid"]

  },

  // --------------------------------------------------------------------------
  // VICTIM
  // --------------------------------------------------------------------------

  victim: {

    casemasterid: ["casemaster", "casemasterid"]

  },

  // --------------------------------------------------------------------------
  // ACCUSED
  // --------------------------------------------------------------------------

  accused: {

    casemasterid: ["casemaster", "casemasterid"]

  },

  // --------------------------------------------------------------------------
  // COMPLAINANT
  // --------------------------------------------------------------------------

  complainantdetails: {

    casemasterid: ["casemaster", "casemasterid"],

    religionid: ["religionmaster", "religionid"],

    casteid: ["castemaster", "caste_master_id"],

    occupationid: ["occupationmaster", "occupationid"]

  },

  // --------------------------------------------------------------------------
  // CHARGESHEET
  // --------------------------------------------------------------------------

  chargesheetdetails: {

    casemasterid: ["casemaster", "casemasterid"],

    policepersonid: ["employee", "employeeid"]

  },

  // --------------------------------------------------------------------------
  // ARREST
  // --------------------------------------------------------------------------

  arrestsurrender: {

    casemasterid: ["casemaster", "casemasterid"],

    accusedmasterid: ["accused", "accusedmasterid"],

    courtid: ["court", "courtid"],

    ioid: ["employee", "employeeid"],

    policestationid: ["unit", "unitid"],

    arrestsurrenderdistrictid: ["district", "districtid"],

    arrestsurrenderstateid: ["state", "stateid"]

  },

  // --------------------------------------------------------------------------
  // BANK
  // --------------------------------------------------------------------------

  bankaccountlink: {

    accusedmasterid: ["accused", "accusedmasterid"],

    victimmasterid: ["victim", "victimmasterid"],

    complainantid: ["complainantdetails", "complainantid"],

    casemasterid: ["casemaster", "casemasterid"]

  },

  // --------------------------------------------------------------------------
  // FINANCIAL TRANSACTIONS
  // --------------------------------------------------------------------------

  financialtransaction: {

    sourceaccountid: ["bankaccountlink", "accountid"],

    destinationaccountid: ["bankaccountlink", "accountid"],

    casemasterid: ["casemaster", "casemasterid"],

    transactionlocationdistrictid: ["district", "districtid"],

    investigatingofficerid: ["employee", "employeeid"]

  },

  // --------------------------------------------------------------------------
  // ALERTS
  // --------------------------------------------------------------------------

  transactionalert: {

    transactionid: ["financialtransaction", "transactionid"],

    casemasterid: ["casemaster", "casemasterid"]

  },

  earlywarnings: {

    districtid: ["district", "districtid"],

    crimesubheadid: ["crimesubhead", "crimesubheadid"]

  },

  offenderclusters: {

    casemasterid: ["casemaster", "casemasterid"],

    crimesubheadid: ["crimesubhead", "crimesubheadid"]

  },

  // --------------------------------------------------------------------------
  // ANALYTICS
  // --------------------------------------------------------------------------

  districtdemographics: {

    districtid: ["district", "districtid"]

  },

  // --------------------------------------------------------------------------
  // TABLES WITHOUT RELATIONSHIPS
  // --------------------------------------------------------------------------

//   behaviorclusters: {},

//   hotspotclusters: {},

//   forecastresults: {},

//   crimepatterns: {},

//   conversationlog: {},

//   ragdocuments: {},

//   ragqueries: {},

//   offerprofile: {},

//   auditlog: {},

//   notification: {},

//   dashboardcache: {}

};

export default relationships;