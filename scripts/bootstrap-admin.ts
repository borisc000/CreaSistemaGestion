import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function getCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return cert({ projectId, clientEmail, privateKey });
  }

  return applicationDefault();
}

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const tenantId = process.env.BOOTSTRAP_TENANT_ID || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || "crea-default";

  if (!email) {
    throw new Error("Missing BOOTSTRAP_ADMIN_EMAIL env variable.");
  }

  if (!getApps().length) {
    initializeApp({
      credential: getCredential(),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
  }

  const auth = getAuth();
  const user = await auth.getUserByEmail(email);

  await auth.setCustomUserClaims(user.uid, {
    role: "admin",
    tenantId
  });

  console.log(`Custom claims updated for ${email} (${user.uid}). role=admin tenantId=${tenantId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
