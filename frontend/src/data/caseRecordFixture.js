// DEMO-ONLY fixture for the §5 Case Record drawer. This is the single
// deliberate exception to the "no fixtures" rule and is ONLY reachable when
// VITE_DEMO_MODE === 'true' AND the live GET /api/case/:caseId/record endpoint
// is unavailable (it does not exist in scrb-backend yet — see Backend Gaps).
// It mirrors the raw KSP DB relations named in the spec (§5 of proj_contxt.md).
export function buildCaseRecordFixture(caseId) {
  return {
    case_master: {
      CaseMasterID: 4471,
      CrimeNo: caseId,
      CrimeRegisteredDate: '2024-03-11',
      IncidentFromDate: '2024-03-10 21:40',
      BriefFacts:
        'Complainant reports house-break and theft of gold ornaments and cash while premises were unoccupied. Point of entry: rear window.',
      latitude: 12.9716,
      longitude: 77.5946,
      PoliceStationID: 118,
      CrimeMinorHeadID: 33,
      GravityOffenceID: 4,
      DistrictID: 1,
    },
    accused: [
      { AccusedMasterID: 'A_1783', CaseMasterID: 4471, AccusedName: 'Ravi Kumar', AgeYear: 29, GenderID: 'M' },
      { AccusedMasterID: 'A_1810', CaseMasterID: 4471, AccusedName: 'Suresh Nayak', AgeYear: 34, GenderID: 'M' },
    ],
    victim: [
      { VictimMasterID: 'V_2201', CaseMasterID: 4471, VictimName: 'Lakshmi Rao', AgeYear: 52 },
    ],
    arrest_surrender: [
      { ArrestSurrenderID: 'AR_551', CaseMasterID: 4471, AccusedMasterID: 'A_1783', IOID: 'E_204', type: 'Arrest', date: '2024-03-19' },
    ],
    chargesheet_details: [
      { CSID: 'CS_119', CaseMasterID: 4471, cstype: 'A', filedOn: '2024-05-02' },
    ],
    complainant: {
      ComplainantID: 'C_990', CaseMasterID: 4471, name: 'Lakshmi Rao', ReligionID: 2, CasteID: 14, OccupationID: 7,
    },
    acts_sections: [
      { ActCode: 'IPC', SectionCode: '454', CaseMasterID: 4471, description: 'House-trespass to commit offence' },
      { ActCode: 'IPC', SectionCode: '380', CaseMasterID: 4471, description: 'Theft in dwelling house' },
    ],
    _demo: true,
  }
}
