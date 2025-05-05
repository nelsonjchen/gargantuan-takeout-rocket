declare module "cloudflare:test" {
  // ProvidedEnv controls the type of `import("cloudflare:test").env`
  interface ProvidedEnv extends Env {
    VITE_AZ_STORAGE_TEST_URL: string;
  }
}