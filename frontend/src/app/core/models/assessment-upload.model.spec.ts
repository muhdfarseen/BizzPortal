import { AssessmentExam, TraineeAssessment, TraineeLookup } from './assessment.model';
import {
  UploadPreview,
  buildErrorCsv,
  buildTemplateCsv,
  sheetEmployeeIds,
  validateUpload,
} from './assessment-upload.model';

const EXAM: AssessmentExam = { id: 'pre', name: 'Pre', maxScore: 90 };

const ROSTER: readonly TraineeAssessment[] = [
  { employeeId: 'EMP-1', name: 'Aarav Nair', results: {} },
  {
    employeeId: 'EMP-2',
    name: 'Meera Iyer',
    results: { pre: { score: 60, cefr: 'B2', assessedOn: null } },
  },
  { employeeId: 'EMP-3', name: 'Rahul Das', results: {} },
];

/**
 * The roster as the lookup answers it: only the ids a sheet asked about, plus
 * the count of the whole group. Here the sheet asks about all of them, which is
 * what the old roster-based validation saw.
 */
const GROUP: TraineeLookup = {
  groupSize: ROSTER.length,
  trainees: ROSTER.map(({ employeeId, name }) => ({ employeeId, name })),
};

/** Stand-in for the configured CEFR mapping, so the specs stay about validation. */
function levelFor(score: number): string {
  return score >= 60 ? 'B2' : 'A2';
}

function validate(rows: readonly (readonly string[])[], group: TraineeLookup = GROUP) {
  return validateUpload({ rows, group, exam: EXAM, levelFor });
}

const HEADER = ['Emp ID', 'Name', 'Score'];

describe('buildTemplateCsv', () => {
  it('prefills the group with each trainee’s current score', () => {
    const csv = buildTemplateCsv(ROSTER, 'pre');

    expect(csv.split('\r\n')).toEqual([
      'Emp ID,Name,Score',
      'EMP-1,Aarav Nair,',
      'EMP-2,Meera Iyer,60',
      'EMP-3,Rahul Das,',
    ]);
  });

  it('leaves the score blank for an exam the trainee has not taken', () => {
    const csv = buildTemplateCsv(ROSTER, 'mid');

    expect(csv).not.toContain(',60');
    expect(csv.split('\r\n')[1]).toBe('EMP-1,Aarav Nair,');
  });
});

describe('validateUpload', () => {
  it('accepts a clean sheet and derives each level', () => {
    const preview = validate([
      HEADER,
      ['EMP-1', 'Aarav Nair', '45'],
      ['EMP-2', 'Meera Iyer', '78'],
    ]);

    expect(preview.sheetError).toBeNull();
    expect(preview.validRows).toBe(2);
    expect(preview.errorRows).toBe(0);
    expect(preview.rows.map((row) => row.cefr)).toEqual(['A2', 'B2']);
    expect(preview.rows.every((row) => row.ok)).toBe(true);
  });

  it('reports trainees of the group that the sheet leaves out', () => {
    const preview = validate([HEADER, ['EMP-1', 'Aarav Nair', '45']]);

    expect(preview.validRows).toBe(1);
    expect(preview.missingFromSheet).toBe(2);
  });

  it('takes how many the sheet left out from the group size, not from the ids returned', () => {
    // The lookup answers with only the ids the sheet named, so the roster's
    // length is the number it found — the count of the whole group is the only
    // thing that can say how many it did not.
    const preview = validate([HEADER, ['EMP-1', 'Aarav Nair', '45']], {
      groupSize: 500,
      trainees: [{ employeeId: 'EMP-1', name: 'Aarav Nair' }],
    });

    expect(preview.validRows).toBe(1);
    expect(preview.missingFromSheet).toBe(499);
  });

  it('counts an employee id listed twice once when reporting the shortfall', () => {
    const preview = validate([
      HEADER,
      ['EMP-1', 'Aarav Nair', '45'],
      ['EMP-1', 'Aarav Nair', '60'],
    ]);

    expect(preview.missingFromSheet).toBe(2);
  });

  it('accepts a renamed header and ignores extra columns', () => {
    const preview = validate([
      ['EmpID', 'Trainee Name', 'Marks', 'Batch'],
      ['EMP-1', 'Aarav Nair', '45', 'B1'],
    ]);

    expect(preview.sheetError).toBeNull();
    expect(preview.validRows).toBe(1);
  });

  it('refuses a sheet that is missing a template column', () => {
    const preview = validate([
      ['Emp ID', 'Name'],
      ['EMP-1', 'Aarav Nair'],
    ]);

    expect(preview.rows).toEqual([]);
    expect(preview.sheetError).toContain('Score');
    expect(preview.sheetError).toContain('Download the template');
  });

  it('refuses an empty file', () => {
    expect(validate([]).sheetError).toBe('The file is empty.');
  });

  it('refuses a sheet with a header but no data rows', () => {
    expect(validate([HEADER]).sheetError).toBe('The file has no data rows.');
  });

  it('skips blank rows instead of failing them', () => {
    const preview = validate([HEADER, ['EMP-1', 'Aarav Nair', '45'], ['', '', ''], ['  ', '', '']]);

    expect(preview.rows.length).toBe(1);
    expect(preview.validRows).toBe(1);
  });

  it('refuses an employee id that is not in the group', () => {
    const preview = validate([HEADER, ['EMP-999', 'Someone Else', '45']]);

    expect(preview.validRows).toBe(0);
    expect(preview.rows[0].errors[0].code).toBe('unknown-empid');
    expect(preview.rows[0].errors[0].message).toContain('EMP-999');
  });

  it('refuses a missing employee id', () => {
    const preview = validate([HEADER, ['', 'Aarav Nair', '45']]);

    expect(preview.rows[0].errors[0].code).toBe('missing-empid');
  });

  it('refuses the same employee id twice', () => {
    const preview = validate([
      HEADER,
      ['EMP-1', 'Aarav Nair', '45'],
      ['EMP-1', 'Aarav Nair', '50'],
    ]);

    expect(preview.validRows).toBe(1);
    expect(preview.rows[1].errors[0].code).toBe('duplicate-empid');
  });

  it('refuses a missing, non-numeric or out-of-range score', () => {
    const preview = validate([
      HEADER,
      ['EMP-1', 'Aarav Nair', ''],
      ['EMP-2', 'Meera Iyer', 'absent'],
      ['EMP-3', 'Rahul Das', '91'],
    ]);

    expect(preview.rows.map((row) => row.errors[0].code)).toEqual([
      'missing-score',
      'invalid-score',
      'score-out-of-range',
    ]);
    expect(preview.validRows).toBe(0);
  });

  it('refuses a fractional score, which the portal stores as whole numbers', () => {
    const preview = validate([HEADER, ['EMP-1', 'Aarav Nair', '45.5']]);

    expect(preview.rows[0].errors[0].code).toBe('score-out-of-range');
    expect(preview.validRows).toBe(0);
  });

  it('warns when the name differs from the roster but still imports the row', () => {
    const preview = validate([HEADER, ['EMP-1', 'Aarav N', '45']]);

    expect(preview.rows[0].ok).toBe(true);
    expect(preview.rows[0].warnings[0].code).toBe('name-mismatch');
    expect(preview.rows[0].warnings[0].message).toContain('Aarav Nair');
    expect(preview.rows[0].rosterName).toBe('Aarav Nair');
    expect(preview.validRows).toBe(1);
  });

  it('numbers rows as the spreadsheet does, header first', () => {
    const preview = validate([
      HEADER,
      ['EMP-1', 'Aarav Nair', '45'],
      ['EMP-2', 'Meera Iyer', '78'],
    ]);

    expect(preview.rows.map((row) => row.rowNumber)).toEqual([2, 3]);
  });
});

describe('sheetEmployeeIds', () => {
  it('reads the distinct numeric employee ids a sheet names', () => {
    expect(
      sheetEmployeeIds([HEADER, ['41201', 'Aarav Nair', '45'], ['41202', 'Meera Iyer', '78']]),
    ).toEqual([41201, 41202]);
  });

  it('lists a number once however often the sheet repeats it', () => {
    expect(sheetEmployeeIds([HEADER, ['41201', 'Aarav', '45'], ['41201', 'Aarav', '60']])).toEqual([
      41201,
    ]);
  });

  it('drops values the lookup could not take, and blank rows', () => {
    expect(
      sheetEmployeeIds([HEADER, ['EMP-1', 'Aarav', '45'], ['', '', ''], ['0', 'X', '1']]),
    ).toEqual([]);
  });

  it('names no ids when the header cannot be read', () => {
    expect(
      sheetEmployeeIds([
        ['Who', 'Score'],
        ['41201', '45'],
      ]),
    ).toEqual([]);
    expect(sheetEmployeeIds([])).toEqual([]);
  });
});

describe('buildErrorCsv', () => {
  const preview: UploadPreview = validate([
    HEADER,
    ['EMP-1', 'Aarav Nair', '45'],
    ['EMP-999', 'Someone Else', '91'],
  ]);

  it('writes one line per problem, with the row it came from', () => {
    const lines = buildErrorCsv(preview).split('\r\n');

    expect(lines[0]).toBe('Row,Emp ID,Name,Score,Issue');
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain('EMP-999');
    expect(lines[1]).toContain('is not in this group');
    expect(lines[2]).toContain('between 0 and 90');
  });

  it('writes only the header when nothing failed', () => {
    const clean: UploadPreview = validate([HEADER, ['EMP-1', 'Aarav Nair', '45']]);

    expect(buildErrorCsv(clean)).toBe('Row,Emp ID,Name,Score,Issue');
  });
});
