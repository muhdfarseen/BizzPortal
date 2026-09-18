import {
  BatchGroup,
  batchStartQuarter,
  batchStartsIn,
  batchStartYears,
  currentQuarter,
  periodLabel,
} from './organization.model';

/** A batch with only the fields the period helpers read. */
function batch(startDate: string | null, name = 'Batch 01'): BatchGroup {
  return { id: name, name, startDate, lgs: [] };
}

describe('the quarter a batch starts in', () => {
  it('reads the quarter from the month it began', () => {
    expect(batchStartQuarter('2026-01-06')).toEqual({ year: 2026, quarter: 1 });
    expect(batchStartQuarter('2026-03-31')).toEqual({ year: 2026, quarter: 1 });
    expect(batchStartQuarter('2026-04-01')).toEqual({ year: 2026, quarter: 2 });
    expect(batchStartQuarter('2026-06-30')).toEqual({ year: 2026, quarter: 2 });
    expect(batchStartQuarter('2026-07-01')).toEqual({ year: 2026, quarter: 3 });
    expect(batchStartQuarter('2026-10-01')).toEqual({ year: 2026, quarter: 4 });
    expect(batchStartQuarter('2026-12-31')).toEqual({ year: 2026, quarter: 4 });
  });

  it('keeps a January batch in January for readers in every timezone', () => {
    // `new Date('2026-01-01')` is UTC midnight, which January readers in the
    // Americas see as 31 December — filing the batch a quarter early.
    expect(batchStartQuarter('2026-01-01')).toEqual({ year: 2026, quarter: 1 });
  });

  it('puts a batch with no usable start date in no quarter at all', () => {
    expect(batchStartQuarter(null)).toBeNull();
    expect(batchStartQuarter(undefined)).toBeNull();
    expect(batchStartQuarter('')).toBeNull();
    expect(batchStartQuarter('   ')).toBeNull();
    expect(batchStartQuarter('not a date')).toBeNull();
    expect(batchStartQuarter('2026-13-01')).toBeNull();
  });
});

describe('the quarter in progress', () => {
  it('reads the quarter out of the day it is given', () => {
    // Local-time parts, so the assertion holds whatever the machine's zone is.
    expect(currentQuarter(new Date(2026, 0, 15))).toEqual({ year: 2026, quarter: 1 });
    expect(currentQuarter(new Date(2026, 2, 31))).toEqual({ year: 2026, quarter: 1 });
    expect(currentQuarter(new Date(2026, 3, 1))).toEqual({ year: 2026, quarter: 2 });
    expect(currentQuarter(new Date(2026, 8, 18))).toEqual({ year: 2026, quarter: 3 });
    expect(currentQuarter(new Date(2026, 11, 31))).toEqual({ year: 2026, quarter: 4 });
    expect(currentQuarter(new Date(2027, 0, 1))).toEqual({ year: 2027, quarter: 1 });
  });

  it('reads today when it is given nothing', () => {
    const today = new Date();

    expect(currentQuarter()).toEqual({
      year: today.getFullYear(),
      quarter: Math.floor(today.getMonth() / 3) + 1,
    });
  });
});

describe('narrowing batches to a period', () => {
  const batches = [batch('2025-10-13', 'Batch 01'), batch('2026-07-06', 'Batch 02')];

  const matching = (year: number | null, quarter: number | null): string[] =>
    batches.filter((candidate) => batchStartsIn(candidate, year, quarter)).map(({ name }) => name);

  it('keeps every batch while neither a year nor a quarter is chosen', () => {
    expect(matching(null, null)).toEqual(['Batch 01', 'Batch 02']);
  });

  it('applies the year and the quarter together', () => {
    expect(matching(2025, null)).toEqual(['Batch 01']);
    expect(matching(2026, 3)).toEqual(['Batch 02']);
    expect(matching(2026, 4)).toEqual([]);
    expect(matching(2026, null)).toEqual(['Batch 02']);
    expect(matching(null, 4)).toEqual(['Batch 01']);
  });

  it('never matches a batch whose start date the portal does not hold', () => {
    expect(batchStartsIn(batch(null), 2026, null)).toBe(false);
    expect(batchStartsIn(batch(null), null, 1)).toBe(false);
  });
});

describe('the years worth offering', () => {
  it('lists the years the batches start in, once each and oldest first', () => {
    const years = batchStartYears([
      batch('2026-01-06'),
      batch('2025-10-13'),
      batch('2026-07-06'),
      batch(null),
    ]);

    expect(years).toEqual([2025, 2026]);
  });
});

describe('how a period reads', () => {
  it('names only the parts that were chosen', () => {
    expect(periodLabel(2026, 2)).toBe('Q2 2026');
    expect(periodLabel(2026, null)).toBe('2026');
    expect(periodLabel(null, 2)).toBe('Q2');
    expect(periodLabel(null, null)).toBe('');
  });
});
