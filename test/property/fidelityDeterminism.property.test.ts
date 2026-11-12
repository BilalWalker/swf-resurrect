import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { buildFidelityReport, serialiseFidelityReport } from '../../src/verify/core/report';
import { fcConfig } from './config';
import { genReportInputs } from './gen/genReportInputs';

describe('Fidelity_Report determinism', () => {
  // Feature: verify, Property 14: Report serialisation is deterministic
  // **Validates: Requirements 9.1, 9.3, 13.3**
  it('serialises byte for byte the same for the same inputs', () => {
    fc.assert(
      fc.property(genReportInputs, (inputs) => {
        const a = serialiseFidelityReport(buildFidelityReport(inputs));
        const b = serialiseFidelityReport(buildFidelityReport(inputs));
        expect(b).toBe(a);
      }),
      fcConfig,
    );
  });
});
