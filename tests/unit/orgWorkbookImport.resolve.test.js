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
});
