import { ROLES } from './roles'

// Per-role PDF template (spec Section 5 / §7.12). The backend's SmartBrowz
// export branches the actual template on `role`; the frontend only needs to
// send the right role + a human label for the button.
//   policymaker  -> district/state summary report (aggregates, no PII)
//   investigator -> full case investigation packet (case, network, timeline)
//   analyst      -> analytical report (model perf, clusters, factor attribution)
export const EXPORT_TEMPLATE = {
  [ROLES.POLICYMAKER]: { key: 'summary', label: 'Export Summary Report' },
  [ROLES.INVESTIGATOR]: { key: 'case-packet', label: 'Export Case Packet' },
  [ROLES.ANALYST]: { key: 'analytical', label: 'Export Analytical Report' },
}

export function exportTemplateFor(role) {
  return EXPORT_TEMPLATE[role] ?? { key: 'summary', label: 'Export PDF' }
}
