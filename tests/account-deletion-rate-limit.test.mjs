import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("retired endpoint does not load any DB/auth/quota/proof provider, even on repeated old-client requests", async () => {
  const source = readFileSync(new URL("../src/app/api/me/account-deletion/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }; let dependencies = 0;
  vm.runInNewContext(code, { module, exports: module.exports, Response, require() { dependencies++; throw Error("retired route must not load dependencies"); } });
  for (let count = 0; count < 20; count++) {
    const response = await module.exports.POST(new Proxy({}, { get() { throw Error("must not inspect request, quota, auth or proof"); } }));
    assert.equal(response.status, 410); assert.equal((await response.json()).requestCreated, false);
  }
  assert.equal(dependencies, 0);
});
