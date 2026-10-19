import { defineRailway, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "sfo" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 500 });
  const justVolume = volume("just-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 500 });
  const postgresVolumeVndh = volume("postgres-volume-vndh", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 500 });
  const postgresVolumeT8dx = volume("postgres-volume-T8dx", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 500 });
  const paymaytaxApi = service("paymaytax-api", {
    start: "prisma migrate resolve --applied 20260624_add_user_kyc_fields || true; prisma migrate deploy && node dist/server.js",
    healthcheck: "/api/health",
    replicas: { "sfo": 1 },
    deploy: { limitOverride: { containers: { cpu: 5, memoryBytes: 5000000000 } }, restartPolicyType: "ALWAYS" },
    networking: { tcpProxies: { "5432": {} } },
    volumeMounts: { "/var/lib/postgresql/data": postgresVolumeT8dx },
    env: { AI_MODEL: preserve(), AI_PROVIDER: preserve(), API_VERSION: preserve(), BLIND_INDEX_KEY: preserve(), DATABASE_URL: preserve(), DIRECT_URL: preserve(), EMAIL_FROM: preserve(), ENABLE_CRON: preserve(), ENCRYPTION_KEY: preserve(), ERASE_TEST_ACCOUNTS: preserve(), FRONTEND_URL: preserve(), GEMINI_API_KEY: preserve(), GROQ_API_KEY: preserve(), JWT_ACCESS_SECRET: preserve(), JWT_REFRESH_SECRET: preserve(), KUDISMS_API_TOKEN: preserve(), KUDISMS_APPNAME_CODE: preserve(), KUDISMS_SENDER_ID: preserve(), KUDISMS_SILENT_MODE: preserve(), KUDISMS_TEMPLATE_CODE: preserve(), LOG_LEVEL: preserve(), NODE_ENV: preserve(), PAYSTACK_PUBLIC_KEY: preserve(), PAYSTACK_SECRET_KEY: preserve(), PAYSTACK_WEBHOOK_SECRET: preserve(), PGPASSWORD: preserve(), PII_ENCRYPTION_KEY: preserve(), PORT: preserve(), PUBLIC_API_URL: preserve(), RESEND_API_KEY: preserve(), VITE_API_BASE_URL: preserve() },
  });

  return project("paymytax", {
    resources: [paymaytaxApi, Postgres, postgresVolume, justVolume, postgresVolumeVndh, postgresVolumeT8dx],
  });
});
