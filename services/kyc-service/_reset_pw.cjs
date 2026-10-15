const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

(async () => {
  const c = await mongoose.createConnection("mongodb://127.0.0.1:27017/pink_saas", { serverSelectionTimeoutMS: 8000 }).asPromise();
  const hash = await bcrypt.hash("Admin@12345", 10);
  const res = await c.collection("users").updateOne(
    { email: "superadmin@example.com" },
    { $set: { passwordHash: hash, status: "ACTIVE", lockUntil: null, loginAttempts: 0 } }
  );
  console.log("matched:", res.matchedCount, "modified:", res.modifiedCount);
  const u = await c.collection("users").findOne({ email: "superadmin@example.com" });
  console.log("verify match:", await bcrypt.compare("Admin@12345", u.passwordHash));
  await c.close();
  process.exit(0);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
