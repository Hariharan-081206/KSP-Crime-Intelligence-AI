// ============================================================================
// Primary Keys Configuration
// ============================================================================

const primaryKeys = {

    // Master Tables
    state: "stateid",
    district: "districtid",
    unit: "unitid",
    unittype: "unittypeid",

    employee: "employeeid",
    rank: "rankid",
    designation: "designationid",

    religionmaster: "religionid",
    castemaster: "caste_master_id",
    occupationmaster: "occupationid",

    court: "courtid",

    // Crime
    crimehead: "crimeheadid",
    crimesubhead: "crimesubheadid",

    act: "actid",
    section: "sectionid",

    crimeheadactsection: "crimeheadactsectionid",
    actsectionassociation: "actsectionassociationid",

    gravityoffence: "gravityoffenceid",

    // Case
    casemaster: "casemasterid",
    victim: "victimmasterid",
    accused: "accusedmasterid",
    complainantdetails: "complainantid",
    chargesheetdetails: "chargesheetid",
    arrestsurrender: "arrestsurrenderid",

    // Financial
    bankaccountlink: "accountid",
    financialtransaction: "transactionid",
    transactionalert: "alertid",

    // Analytics
    earlywarnings: "warningid",
    offenderclusters: "clusterid",
    districtdemographics: "districtid",
    casecategory: "casecategoryid",
    casestatusmaster: "casestatusid",

    // AI / Misc
    behaviorclusters: "clusterid",
    hotspotclusters: "clusterid",
    forecastresults: "forecastid",
    crimepatterns: "patternid",
    conversationlog: "conversationid",
    ragdocuments: "documentid",
    ragqueries: "queryid",
    offerprofile: "offerprofileid",
    auditlog: "auditid",
    notification: "notificationid",
    dashboardcache: "cacheid"

};

export default primaryKeys;