// ============================================================================
// SCRB Query Map
// Maps QuickML Intents → Catalyst DataStore Tables
// ============================================================================

const queryMap = {

    // ------------------------------------------------------------------------
    // CASES
    // ------------------------------------------------------------------------

    CASE_LOOKUP: {
        table: "casemaster",
        where: {
            caseId: "casemasterid"
        }
    },

    CASE_BY_NUMBER: {
        table: "casemaster",
        where: {
            firNumber: "firnumber"
        }
    },

    CASE_BY_STATUS: {
        table: "casemaster",
        where: {
            status: "casestatusid"
        }
    },

    CASE_BY_POLICE_STATION: {
        table: "casemaster",
        where: {
            policeStation: "policestationid"
        }
    },

    CASE_BY_IO: {
        table: "casemaster",
        where: {
            officer: "policepersonid"
        }
    },

    // ------------------------------------------------------------------------
    // EMPLOYEE
    // ------------------------------------------------------------------------

    EMPLOYEE_LOOKUP: {
        table: "employee",
        where: {
            employeeId: "employeeid"
        }
    },

    EMPLOYEE_BY_RANK: {
        table: "employee",
        where: {
            rank: "rankid"
        }
    },

    EMPLOYEE_BY_DISTRICT: {
        table: "employee",
        where: {
            district: "districtid"
        }
    },

    // ------------------------------------------------------------------------
    // POLICE STATION
    // ------------------------------------------------------------------------

    POLICE_STATION_LOOKUP: {
        table: "unit",
        where: {
            stationId: "unitid"
        }
    },

    POLICE_STATION_BY_DISTRICT: {
        table: "unit",
        where: {
            district: "districtid"
        }
    },

    // ------------------------------------------------------------------------
    // VICTIM
    // ------------------------------------------------------------------------

    VICTIM_LOOKUP: {
        table: "victim",
        where: {
            victimId: "victimmasterid"
        }
    },

    // ------------------------------------------------------------------------
    // ACCUSED
    // ------------------------------------------------------------------------

    ACCUSED_LOOKUP: {
        table: "accused",
        where: {
            accusedId: "accusedmasterid"
        }
    },

    // ------------------------------------------------------------------------
    // CHARGESHEET
    // ------------------------------------------------------------------------

    CHARGESHEET_LOOKUP: {
        table: "chargesheetdetails",
        where: {
            caseId: "casemasterid"
        }
    },

    // ------------------------------------------------------------------------
    // ARREST
    // ------------------------------------------------------------------------

    ARREST_LOOKUP: {
        table: "arrestsurrender",
        where: {
            accusedId: "accusedmasterid"
        }
    },

    // ------------------------------------------------------------------------
    // FINANCIAL
    // ------------------------------------------------------------------------

    TRANSACTION_LOOKUP: {
        table: "financialtransaction",
        where: {
            transactionId: "transactionid"
        }
    },

    TRANSACTION_BY_CASE: {
        table: "financialtransaction",
        where: {
            caseId: "casemasterid"
        }
    },

    TRANSACTION_BY_DISTRICT: {
        table: "financialtransaction",
        where: {
            district: "transactionlocationdistrictid"
        }
    },

    // ------------------------------------------------------------------------
    // BANK ACCOUNT
    // ------------------------------------------------------------------------

    ACCOUNT_LOOKUP: {
        table: "bankaccountlink",
        where: {
            accountId: "accountid"
        }
    },

    // ------------------------------------------------------------------------
    // CRIME
    // ------------------------------------------------------------------------

    CRIME_HEAD_LOOKUP: {
        table: "crimehead",
        where: {
            crimeHead: "crimeheadid"
        }
    },

    CRIME_SUBHEAD_LOOKUP: {
        table: "crimesubhead",
        where: {
            crimeSubHead: "crimesubheadid"
        }
    },

    // ------------------------------------------------------------------------
    // DISTRICT
    // ------------------------------------------------------------------------

    DISTRICT_LOOKUP: {
        table: "district",
        where: {
            districtId: "districtid"
        }
    },

    // ------------------------------------------------------------------------
    // STATE
    // ------------------------------------------------------------------------

    STATE_LOOKUP: {
        table: "state",
        where: {
            stateId: "stateid"
        }
    },

    // ------------------------------------------------------------------------
    // COURT
    // ------------------------------------------------------------------------

    COURT_LOOKUP: {
        table: "court",
        where: {
            courtId: "courtid"
        }
    },

    // ------------------------------------------------------------------------
    // ANALYTICS
    // ------------------------------------------------------------------------

    DISTRICT_DEMOGRAPHICS: {
        table: "districtdemographics",
        where: {
            district: "districtid"
        }
    },

    OFFENDER_CLUSTER: {
        table: "offenderclusters",
        where: {
            caseId: "casemasterid"
        }
    },

    EARLY_WARNING: {
        table: "earlywarnings",
        where: {
            district: "districtid"
        }
    },

    // ------------------------------------------------------------------------
    // DEFAULT
    // ------------------------------------------------------------------------

    DEFAULT: {
        table: "casemaster",
        where: {}
    }

};

export default queryMap;