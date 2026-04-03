'use strict';

const { computeSlaDeadlines } = require('../lib/slaUtils');

// ── Fixtures ──────────────────────────────────────────────────
const BASE_POLICY = {
  response_low_minutes:       480,  // 8h
  response_medium_minutes:    240,  // 4h
  response_high_minutes:      60,   // 1h
  response_urgent_minutes:    15,   // 15m
  resolution_low_minutes:     2880, // 48h
  resolution_medium_minutes:  1440, // 24h
  resolution_high_minutes:    480,  // 8h
  resolution_urgent_minutes:  240,  // 4h
};

const BASE_TIME = new Date('2025-01-01T09:00:00.000Z');

// ═══════════════════════════════════════════════════════════════
// computeSlaDeadlines
// ═══════════════════════════════════════════════════════════════
describe('computeSlaDeadlines', () => {
  test('returns null deadlines when policy is null', () => {
    const result = computeSlaDeadlines('high', null, BASE_TIME);
    expect(result).toEqual({ firstResponseDueAt: null, resolutionDueAt: null });
  });

  test('returns null deadlines when policy is undefined', () => {
    const result = computeSlaDeadlines('medium', undefined, BASE_TIME);
    expect(result).toEqual({ firstResponseDueAt: null, resolutionDueAt: null });
  });

  test('low priority — correct deadline offsets', () => {
    const { firstResponseDueAt, resolutionDueAt } = computeSlaDeadlines('low', BASE_POLICY, BASE_TIME);

    expect(firstResponseDueAt).toBeInstanceOf(Date);
    expect(resolutionDueAt).toBeInstanceOf(Date);

    const responseOffsetMin = (firstResponseDueAt - BASE_TIME) / 60_000;
    const resolutionOffsetMin = (resolutionDueAt - BASE_TIME) / 60_000;

    expect(responseOffsetMin).toBe(480);
    expect(resolutionOffsetMin).toBe(2880);
  });

  test('medium priority — correct deadline offsets', () => {
    const { firstResponseDueAt, resolutionDueAt } = computeSlaDeadlines('medium', BASE_POLICY, BASE_TIME);
    expect((firstResponseDueAt - BASE_TIME) / 60_000).toBe(240);
    expect((resolutionDueAt - BASE_TIME) / 60_000).toBe(1440);
  });

  test('high priority — correct deadline offsets', () => {
    const { firstResponseDueAt, resolutionDueAt } = computeSlaDeadlines('high', BASE_POLICY, BASE_TIME);
    expect((firstResponseDueAt - BASE_TIME) / 60_000).toBe(60);
    expect((resolutionDueAt - BASE_TIME) / 60_000).toBe(480);
  });

  test('urgent priority — correct deadline offsets', () => {
    const { firstResponseDueAt, resolutionDueAt } = computeSlaDeadlines('urgent', BASE_POLICY, BASE_TIME);
    expect((firstResponseDueAt - BASE_TIME) / 60_000).toBe(15);
    expect((resolutionDueAt - BASE_TIME) / 60_000).toBe(240);
  });

  test('createdAt as ISO string — parses correctly', () => {
    const isoString = '2025-06-15T14:30:00.000Z';
    const { firstResponseDueAt } = computeSlaDeadlines('urgent', BASE_POLICY, isoString);
    const base = new Date(isoString);
    expect((firstResponseDueAt - base) / 60_000).toBe(15);
  });

  test('null policy minute field — returns null for that deadline', () => {
    const partialPolicy = {
      ...BASE_POLICY,
      response_high_minutes: null,
    };
    const { firstResponseDueAt, resolutionDueAt } = computeSlaDeadlines('high', partialPolicy, BASE_TIME);
    expect(firstResponseDueAt).toBeNull();
    expect(resolutionDueAt).toBeInstanceOf(Date);
  });

  test('both policy minute fields null — both deadlines null', () => {
    const emptyPolicy = {
      response_low_minutes: null,
      response_medium_minutes: null,
      response_high_minutes: null,
      response_urgent_minutes: null,
      resolution_low_minutes: null,
      resolution_medium_minutes: null,
      resolution_high_minutes: null,
      resolution_urgent_minutes: null,
    };
    const { firstResponseDueAt, resolutionDueAt } = computeSlaDeadlines('medium', emptyPolicy, BASE_TIME);
    expect(firstResponseDueAt).toBeNull();
    expect(resolutionDueAt).toBeNull();
  });

  test('deadlines are Date objects, not strings', () => {
    const { firstResponseDueAt, resolutionDueAt } = computeSlaDeadlines('medium', BASE_POLICY, BASE_TIME);
    expect(firstResponseDueAt).toBeInstanceOf(Date);
    expect(resolutionDueAt).toBeInstanceOf(Date);
  });

  test('resolution deadline is strictly after response deadline for same priority', () => {
    const { firstResponseDueAt, resolutionDueAt } = computeSlaDeadlines('high', BASE_POLICY, BASE_TIME);
    expect(resolutionDueAt.getTime()).toBeGreaterThan(firstResponseDueAt.getTime());
  });
});
