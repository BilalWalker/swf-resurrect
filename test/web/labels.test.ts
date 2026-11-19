import { describe, expect, it } from 'vitest';
import { uploadLimits } from '../../web/client/src/labels';

describe('upload limits line', () => {
  it('names ActionScript 3, the size limit and the time from the server options', () => {
    expect(uploadLimits(20, 300)).toBe('ActionScript 3 .swf only, up to 20 MB. Most files take under a minute; large games a few minutes (limit 5 min).');
    expect(uploadLimits(8, 90)).toContain('(limit 90 s)');
  });
});
