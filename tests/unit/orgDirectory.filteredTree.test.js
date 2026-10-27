jest.mock("../../services/org-service/src/models/user.model", () => ({}));
jest.mock("../../services/org-service/src/models/role.model", () => ({
  effectiveLevel: (role) => role.level,
  effectiveScope: (role) => role.scope,
}));

const { filteredTree } = require("../../services/org-service/src/services/orgDirectory.service");

function position(id, name, roleId, parentPositionId = null, zone = null) {
  return {
    _id: id,
    name,
    roleId,
    parentPositionId,
    zone,
    isVacant: false,
    isVirtualRoot: false,
    sno: null,
  };
}

function makeSnapshot() {
  const adminRole = { _id: "admin-role", name: "Admin", level: 1, scope: "ALL_INDIA" };
  const rbmRole = { _id: "rbm-role", name: "RBM", level: 2, scope: "ZONE" };
  const salesRole = { _id: "sales-role", name: "Sales Executive", level: 3, scope: "AREA" };
  const positions = [
    position("admin", "Tenant Admin", adminRole._id),
    position("rbm-north", "Rita North", rbmRole._id, "admin", "North"),
    position("rbm-south", "Ravi South", rbmRole._id, "admin", "South"),
    position("sales", "Sam Sales", salesRole._id, "admin", "North"),
  ];

  return {
    positions,
    byId: new Map(positions.map((person) => [person._id, person])),
    byEmpId: new Map(),
    childrenByParent: new Map([
      ["__root__", ["admin"]],
      ["admin", ["rbm-north", "rbm-south", "sales"]],
    ]),
    roleById: new Map([
      [adminRole._id, adminRole],
      [rbmRole._id, rbmRole],
      [salesRole._id, salesRole],
    ]),
    maxLevel: 3,
    tenantId: "tenant-1",
  };
}

describe("filtered organization tree", () => {
  it("keeps the common manager and every matching RBM while excluding unrelated branches", () => {
    const result = filteredTree(makeSnapshot(), { q: "RBM" });

    expect(result.count).toBe(2);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0].name).toBe("Tenant Admin");
    expect(result.roots[0].children.map((child) => child.name).sort()).toEqual([
      "Ravi South",
      "Rita North",
    ]);
  });

  it("returns no tree when no position matches", () => {
    expect(filteredTree(makeSnapshot(), { q: "doctor" })).toEqual({
      count: 0,
      roots: [],
    });
  });

  it("combines a role and area filter without dropping the manager chain", () => {
    const result = filteredTree(makeSnapshot(), {
      roleId: "rbm-role",
      zone: "North",
    });

    expect(result.count).toBe(1);
    expect(result.roots[0].name).toBe("Tenant Admin");
    expect(result.roots[0].children.map((child) => child.name)).toEqual(["Rita North"]);
  });
});
