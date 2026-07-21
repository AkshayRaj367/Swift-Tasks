// Server-side helpers for the implicit local user.
// MVP: single-user. The isolation that matters here is per-project.

import { db } from "./db";

const LOCAL_EMAIL = "local@swifttasks.dev";

export async function getCurrentUser() {
  let user = await db.user.findUnique({ where: { email: LOCAL_EMAIL } });
  if (!user) {
    user = await db.user.create({
      data: { email: LOCAL_EMAIL, name: "Local Developer" },
    });
  }
  return user;
}
