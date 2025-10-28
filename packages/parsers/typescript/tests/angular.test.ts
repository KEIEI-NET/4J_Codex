import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";

import { buildCli } from "../src/cli";

let workdir: string;

beforeEach(() => {
  workdir = join(tmpdir(), `codex-ts-parser-angular-${Date.now()}`);
  mkdirSync(workdir, { recursive: true });
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

test("extracts Angular decorators, injections, and router facts", async () => {
  const appComponentPath = join(workdir, "app.component.ts");
  writeFileSync(
    appComponentPath,
    [
      "import { Component } from '@angular/core';",
      "import { HttpClient } from '@angular/common/http';",
      "",
      "@Component({ selector: 'app-root', templateUrl: './app.component.html', standalone: true })",
      "export class AppComponent {",
      "  constructor(private http: HttpClient) {}",
      "  loadUsers() {",
      "    return this.http.get('/api/users');",
      "  }",
      "}",
      ""
    ].join("\n"),
    "utf-8"
  );

  const routesPath = join(workdir, "app-routing.module.ts");
  writeFileSync(
    routesPath,
    [
      "import { NgModule } from '@angular/core';",
      "import { RouterModule, Routes } from '@angular/router';",
      "import { AppComponent } from './app.component';",
      "",
      "const routes: Routes = [",
      "  { path: '', component: AppComponent },",
      "  { path: 'lazy', loadChildren: () => import('./lazy/lazy.module').then((m) => m.LazyModule) }",
      "];",
      "",
      "@NgModule({",
      "  imports: [RouterModule.forRoot(routes)]",
      "})",
      "export class AppRoutingModule {}",
      ""
    ].join("\n"),
    "utf-8"
  );

  const inPath = join(workdir, "files.jsonl");
  const outPath = join(workdir, "facts.jsonl");
  writeFileSync(
    inPath,
    [
      JSON.stringify({ path: appComponentPath }),
      JSON.stringify({ path: routesPath })
    ].join("\n") + "\n",
    "utf-8"
  );

  const cli = buildCli();
  await cli.parseAsync(["parse", "--in", inPath, "--out", outPath], { from: "user" });

  const facts = readFileSync(outPath, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  const angularSymbol = facts.find(
    (fact) => fact.type === "AngularSymbol" && fact.className === "AppComponent"
  );
  expect(angularSymbol).toMatchObject({ decorator: "Component", selector: "app-root", standalone: true });

  const injectionFact = facts.find(
    (fact) => fact.type === "AngularInjection" && fact.className === "AppComponent"
  );
  expect(injectionFact).toMatchObject({ token: "HttpClient", parameter: "http" });

  const httpCall = facts.find(
    (fact) => fact.type === "HttpCall" && fact.className === "AppComponent"
  );
  expect(httpCall).toMatchObject({
    httpMethod: "GET",
    url: "/api/users",
    rel: "CALLS_HTTP",
    owner: "loadUsers"
  });

  const routeFacts = facts.filter((fact) => fact.type === "AngularRoute");
  expect(routeFacts.length).toBeGreaterThanOrEqual(2);
  expect(routeFacts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: "", component: "AppComponent", method: "forRoot" }),
      expect.objectContaining({ path: "lazy", loadChildren: expect.stringContaining("import('./lazy/lazy.module')"), method: "forRoot" })
    ])
  );
});
