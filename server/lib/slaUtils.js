'use strict';

/**
 * Compute first-response and resolution deadlines from an SLA policy row.
 *
 * @param {string} priority  - 'low' | 'medium' | 'high' | 'urgent'
 * @param {object|null} policy - sla_policies row from the DB (or null)
 * @param {Date|string} createdAt - ticket creation time (used as base)
 * @returns {{ firstResponseDueAt: Date|null, resolutionDueAt: Date|null }}
 */
function computeSlaDeadlines(priority, policy, createdAt) {
  if (!policy) return { firstResponseDueAt: null, resolutionDueAt: null };

  const base = new Date(createdAt).getTime();
  const responseMin  = policy[`response_${priority}_minutes`];
  const resolutionMin = policy[`resolution_${priority}_minutes`];

  return {
    firstResponseDueAt: responseMin != null ? new Date(base + responseMin * 60_000) : null,
    resolutionDueAt:    resolutionMin != null ? new Date(base + resolutionMin * 60_000) : null,
  };
}

module.exports = { computeSlaDeadlines };
