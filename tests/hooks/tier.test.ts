import { describe, it, expect } from 'vitest';
import { countSpecCriteria, detectEscalation, resolveTier } from '../../src/hooks/tier.js';

describe('countSpecCriteria', () => {
  it('returns 0 for null', () => {
    expect(countSpecCriteria(null)).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(countSpecCriteria('')).toBe(0);
  });

  it('counts unchecked criteria', () => {
    const spec = `As a user, I can do things.

- [ ] First criterion
- [ ] Second criterion
- [x] Already done
- [ ] Third criterion`;
    expect(countSpecCriteria(spec)).toBe(3);
  });

  it('ignores checked criteria', () => {
    const spec = `- [x] Done one\n- [x] Done two`;
    expect(countSpecCriteria(spec)).toBe(0);
  });

  it('requires line start', () => {
    const spec = `Some text - [ ] not a criterion`;
    expect(countSpecCriteria(spec)).toBe(0);
  });
});

describe('detectEscalation', () => {
  it('detects [COMPLEX] marker', () => {
    expect(detectEscalation('Some plan text\n[COMPLEX]\nMore text')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(detectEscalation('[complex]')).toBe(true);
    expect(detectEscalation('[Complex]')).toBe(true);
  });

  it('returns false when absent', () => {
    expect(detectEscalation('A normal plan without markers')).toBe(false);
  });
});

describe('resolveTier', () => {
  it('returns auto for small plans with few criteria', () => {
    expect(resolveTier(1, 0, false)).toBe('auto');
    expect(resolveTier(2, 3, false)).toBe('auto');
    expect(resolveTier(1, 1, false)).toBe('auto');
  });

  it('returns tracked for medium plans', () => {
    expect(resolveTier(3, 0, false)).toBe('tracked');
    expect(resolveTier(4, 5, false)).toBe('tracked');
    expect(resolveTier(5, 6, false)).toBe('tracked');
  });

  it('returns full for large plans', () => {
    expect(resolveTier(6, 0, false)).toBe('full');
    expect(resolveTier(7, 2, false)).toBe('full');
    expect(resolveTier(10, 0, false)).toBe('full');
  });

  it('returns full for many criteria regardless of steps', () => {
    expect(resolveTier(2, 7, false)).toBe('full');
    expect(resolveTier(1, 8, false)).toBe('full');
  });

  it('returns full when agent escalates regardless of counts', () => {
    expect(resolveTier(1, 1, true)).toBe('full');
    expect(resolveTier(2, 2, true)).toBe('full');
  });

  it('agent escalation takes priority over auto', () => {
    expect(resolveTier(1, 0, true)).toBe('full');
  });

  describe('boundary cases', () => {
    it('2 steps + 3 criteria = auto', () => {
      expect(resolveTier(2, 3, false)).toBe('auto');
    });

    it('2 steps + 4 criteria = tracked', () => {
      expect(resolveTier(2, 4, false)).toBe('tracked');
    });

    it('3 steps + 3 criteria = tracked', () => {
      expect(resolveTier(3, 3, false)).toBe('tracked');
    });

    it('5 steps + 6 criteria = tracked', () => {
      expect(resolveTier(5, 6, false)).toBe('tracked');
    });

    it('5 steps + 7 criteria = full', () => {
      expect(resolveTier(5, 7, false)).toBe('full');
    });

    it('6 steps + 0 criteria = full', () => {
      expect(resolveTier(6, 0, false)).toBe('full');
    });
  });
});
