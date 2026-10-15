const { resolveManagerMappings } = require('../../services/org-service/src/services/orgWorkbookImport.service');

describe('orgWorkbookImport.resolveManagerMappings', () => {
  it('resolves employee reporting to vacant manager by empId', () => {
    const rows = [
      { rowNumber: 1, empId: 'EMP01', name: 'VACANT MANAGER', isVacant: true, designation: 'GM', reportingManagerRaw: null },
      { rowNumber: 2, empId: 'EMP02', name: 'Alice', isVacant: false, designation: 'BM', reportingManagerRaw: 'EMP01' },
    ];

    const mapping = resolveManagerMappings(rows);
    expect(mapping[0].resolvedIdx).toBe(-1);
    expect(mapping[0].resolution).toBe('root');
    expect(mapping[1].resolvedIdx).toBe(0);
    expect(mapping[1].resolution).toBe('empId');
  });

  it('prefers non-vacant empId when duplicate empId exists', () => {
    const rows = [
      { rowNumber: 1, empId: 'EMP01', name: 'John', isVacant: false, designation: 'BM', reportingManagerRaw: null },
      { rowNumber: 2, empId: 'EMP01', name: 'VACANT SEAT', isVacant: true, designation: 'BM', reportingManagerRaw: null },
      { rowNumber: 3, empId: 'EMP02', name: 'Bob', isVacant: false, designation: 'BM', reportingManagerRaw: 'EMP01' },
    ];

    const mapping = resolveManagerMappings(rows);
    // EMP01 should resolve to the non-vacant row at index 0
    expect(mapping[2].resolvedIdx).toBe(0);
    expect(mapping[2].resolution).toBe('empId');
  });

  it('resolves reporting strings like "VACANT - EMP01" to the vacant emp row', () => {
    const rows = [
      { rowNumber: 1, empId: 'EMP01', name: 'VACANT MANAGER', isVacant: true, designation: 'GM', reportingManagerRaw: null },
      { rowNumber: 2, empId: 'EMP02', name: 'Alice', isVacant: false, designation: 'BM', reportingManagerRaw: 'VACANT - EMP01' },
    ];

    const mapping = resolveManagerMappings(rows);
    expect(mapping[1].resolvedIdx).toBe(0);
    expect(mapping[1].resolution).toBe('empId');
  });

  it('falls back to an existing tenant user by empId when the manager is absent from the workbook', () => {
    const rows = [
      { rowNumber: 1, empId: 'EMP02', name: 'Alice', isVacant: false, designation: 'BM', reportingManagerRaw: 'EMP01' },
      { rowNumber: 2, empId: 'EMP03', name: 'Bob', isVacant: false, designation: 'BM', reportingManagerRaw: 'EMP02' },
    ];
    const dbIndex = new Map([['EMP01', { _id: 'founderUserId', empCode: 'EMP01' }]]);

    const mapping = resolveManagerMappings(rows, dbIndex);
    expect(mapping[0].resolvedDbUserId).toBe('founderUserId');
    expect(mapping[0].resolution).toBe('dbEmpId');
    expect(mapping[1].resolvedIdx).toBe(0);
    expect(mapping[1].resolution).toBe('empId');
  });

  it('keeps external_root when neither workbook rows nor the db index match', () => {
    const rows = [
      { rowNumber: 1, empId: 'EMP02', name: 'Alice', isVacant: false, designation: 'BM', reportingManagerRaw: 'XZZ999' },
    ];

    const mapping = resolveManagerMappings(rows, new Map());
    expect(mapping[0].resolvedIdx).toBe(-1);
    expect(mapping[0].resolvedDbUserId).toBeNull();
    expect(mapping[0].resolution).toBe('external_root');
  });
});
