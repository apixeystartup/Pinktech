// Pinktech is the platform: the "PINKTECH" tenant owns the only super admin and
// it applies to every tenant. Regular tenants are just tenants — none of them
// can hold a super admin of its own, no matter what a role is named.
//
// Older databases (seeded before the canonical code was fixed) use "PLATFORM"
// for the same platform tenant, so both codes are recognised as the platform.
// New tenants are always created with PLATFORM_TENANT_CODE ("PINKTECH").
const PLATFORM_TENANT_CODE = "PINKTECH";

const PLATFORM_TENANT_CODES = [PLATFORM_TENANT_CODE, "PLATFORM"];

function isPlatformTenant(tenant) {
  return PLATFORM_TENANT_CODES.includes(String(tenant?.code || "").trim().toUpperCase());
}

// "Super Admin" is Pinktech's own role: it is seeded directly into the platform
// tenant and is the only super admin, shared by every tenant. No tenant may
// create or rename a role to it (nor create a SYSTEM role) through the API.
const PLATFORM_ROLE_NAME_RE = /^super\s*admin$/i;

function isReservedPlatformRoleName(name) {
  return PLATFORM_ROLE_NAME_RE.test(String(name || "").trim());
}

const RESERVED_ROLE_MESSAGE =
  "The Super Admin role belongs to Pinktech (the platform) and applies to all tenants; it cannot be created or renamed for a tenant.";

// The tenant admin's seat in the org tree. Created automatically with every
// tenant, assigned to the tenant admin, and never deleted by imports or the
// Roles UI — without it the admin drops out of Org Explore.
const FOUNDER_ROLE_NAME = "Founder";

function isFounderRoleName(name) {
  return String(name || "").trim().toLowerCase() === "founder";
}

module.exports = {
  PLATFORM_TENANT_CODE,
  PLATFORM_TENANT_CODES,
  isPlatformTenant,
  isReservedPlatformRoleName,
  RESERVED_ROLE_MESSAGE,
  FOUNDER_ROLE_NAME,
  isFounderRoleName,
};
