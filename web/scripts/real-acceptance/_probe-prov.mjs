import { providerConfig } from "./provider.mjs";
try {
  const c = providerConfig();
  console.log(JSON.stringify({ baseUrl: c.baseUrl, model: c.model, keyLen: c.apiKey.length, textKeyLen: (c.textApiKey||"").length, textModel: c.textModel }));
} catch (e) { console.log("ERR", e.message); }
