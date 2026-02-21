import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig();

config.default.minify = true;
if (config.middleware && "external" in config.middleware && config.middleware.external) {
  config.middleware.minify = true;
}

export default config;
