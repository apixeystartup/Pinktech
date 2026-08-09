/**
 * Which Role on a User drives org-chart level, edges, and counts.
 * Mirrors test/server Position.roleId (single id): prefer designation match, then CUSTOM, else first.
 */

const { norm } = require("./orgNorm");

function ridKey(rid) {
  if (!rid) return null;
  return String(rid._id || rid);
}

function primaryOrgRoleId(user, roleById) {
  const chain = user.roleIds || [];
  if (!chain.length) return null;

  const des = user.designationOverride?.trim();
  if (des) {
    const key = norm(des);
    for (const rid of chain) {
      const id = ridKey(rid);
      if (!id) continue;
      const role = roleById.get(id);
      if (!role) continue;
      for (const a of role.aliases || []) {
        if (norm(a) === key) return id;
      }
      if (norm(role.name) === key) return id;
    }
  }

  for (const rid of chain) {
    const id = ridKey(rid);
    if (!id) continue;
    const role = roleById.get(id);
    if (role?.type === "CUSTOM") return id;
  }

  return ridKey(chain[0]);
}

module.exports = { primaryOrgRoleId, ridKey };
