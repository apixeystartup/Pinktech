jest.mock("../../services/org-service/src/services/orgDirectory.service", () => ({
  loadSnapshot: jest.fn(),
  filteredTree: jest.fn(),
}));
jest.mock("../../services/org-service/src/services/orgMutations.service", () => ({}));
jest.mock("../../services/org-service/src/services/orgRegistry.service", () => ({}));
jest.mock("../../services/org-service/src/services/orgWorkbookImport.service", () => ({}));
jest.mock("../../services/org-service/src/services/orgRollback.service", () => ({}));

const orgDirectory = require("../../services/org-service/src/services/orgDirectory.service");
const controller = require("../../services/org-service/src/services/orgExplorer.controller");

describe("getFilteredTree", () => {
  it("passes directory search and filter criteria to the tree builder", async () => {
    const snapshot = { byId: new Map() };
    const result = { count: 2, roots: [{ id: "admin", children: [] }] };
    orgDirectory.loadSnapshot.mockResolvedValue(snapshot);
    orgDirectory.filteredTree.mockReturnValue(result);
    const req = {
      tenantId: "tenant-1",
      auth: { isOrgAdmin: true },
      query: {
        q: "RBM",
        zone: "North",
        role_id: "rbm-role",
        level: "2",
        filled_only: "true",
      },
    };
    const res = { json: jest.fn() };
    const next = jest.fn();

    await controller.getFilteredTree(req, res, next);

    expect(orgDirectory.filteredTree).toHaveBeenCalledWith(snapshot, {
      q: "RBM",
      zone: "North",
      region: null,
      state: null,
      hq: null,
      designation: null,
      roleId: "rbm-role",
      level: "2",
      manager: null,
      vacantOnly: false,
      filledOnly: true,
      strictGeography: false,
      limit: 1000,
    });
    expect(res.json).toHaveBeenCalledWith(result);
    expect(next).not.toHaveBeenCalled();
  });
});
