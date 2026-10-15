/**
 * Canonical permission catalog.
 *
 * Single source of truth lives in `@pink/shared` so the seeded catalog can never
 * drift from the codes the platform's middleware and frontend expect.
 */
module.exports = require("@pink/shared").permissions;
