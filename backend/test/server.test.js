const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { once } = require("node:events");
process.env.DB_API_BASE_URL = "https://sql-api.test/est_api";
process.env.DB_DATABASE = "PrensasOvrPrueba";
process.env.DB_SERVER = "est04db";
const { app, isWithinRoot, parseModel, resolvePhotoPath } = require("../src/server");

test("accepts photo paths within the configured directory", () => {
  const root = path.resolve("test-images");
  assert.equal(isWithinRoot(root, path.join(root, "camera", "photo.jpg")), path.join(root, "camera", "photo.jpg"));
});

test("rejects paths that escape the configured directory", () => {
  const root = path.resolve("test-images");
  assert.equal(isWithinRoot(root, path.resolve(root, "..", "private.jpg")), null);
});

test("returns no photo path when no image root is configured", () => {
  assert.equal(resolvePhotoPath("", { fullPath: "photo.jpg" }), null);
});

test("parses recipe and part numbers without dropping leading zeroes", () => {
  assert.deepEqual(parseModel("0039_08035004_08035005"), {
    recipe: "0039",
    partNumbers: ["08035004", "08035005"],
  });
  assert.deepEqual(parseModel("modelo-invalido"), { recipe: null, partNumbers: [] });
});

test("serves the dashboard and rejects invalid filters before querying SQL Server", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Inspección de cámaras/);
  const styles = await fetch(`${baseUrl}/styles.css`);
  assert.equal(styles.status, 200);
  assert.match(await styles.text(), /color-scheme:\s*dark/);
  const appScript = await fetch(`${baseUrl}/app.js`);
  assert.equal(appScript.status, 200);
  assert.match(await appScript.text(), /chart-data-rows/);

  const invalidDate = await fetch(`${baseUrl}/api/summary?from=not-a-date`);
  assert.equal(invalidDate.status, 400);
  const impossibleDate = await fetch(`${baseUrl}/api/summary?from=2026-02-31`);
  assert.equal(impossibleDate.status, 400);
  const invalidResult = await fetch(`${baseUrl}/api/photos?result=unexpected`);
  assert.equal(invalidResult.status, 400);
  const crossSite = await fetch(`${baseUrl}/api/options`, {
    headers: { "sec-fetch-site": "cross-site" },
  });
  assert.equal(crossSite.status, 403);
});

test("uses the corporate API for single, read-only SELECT queries", async (t) => {
  const originalFetch = global.fetch;
  const originalImageRoot = process.env.IMAGE_ROOT;
  delete process.env.IMAGE_ROOT;
  const queries = [];
  global.fetch = async (url, options) => {
    if (!String(url).startsWith("https://sql-api.test/")) return originalFetch(url, options);
    const body = JSON.parse(options.body);
    assert.equal(body.server, "est04db");
    assert.equal(body.db, "PrensasOvrPrueba");
    assert.match(body.command, /^\s*SELECT\b/i);
    assert.doesNotMatch(body.command, /;|--|\/\*|\*\//);
    queries.push(body.command);

    let rows = [];
    if (body.command.includes("N'line' AS [kind]")) {
      rows = [{ kind: "line", value: "Línea 1" }, { kind: "camera", value: "Cámara A" }];
    } else if (body.command.includes("grandTotal")) {
      rows = [{
        photoDate: "2026-11-04", total: 1, good: 1, bad: 0, unknown: 0,
        totalBytes: 1536, goodBytes: 1536, badBytes: 0, unknownBytes: 0,
        grandTotal: 1, grandGood: 1, grandBad: 0, grandUnknown: 0,
        grandTotalBytes: 1536, grandGoodBytes: 1536, grandBadBytes: 0, grandUnknownBytes: 0,
      }];
    } else if (body.command.includes("AS [allTimeBytes]")) {
      rows = [{ allTimeBytes: 987654321 }];
    } else if (body.command.includes("GROUP BY [Modelo]")) {
      rows = [{ model: "0039_08035004_08035005", photos: "7", good: "6", bad: "1", unknown: "0" }];
    } else if (body.command.includes("totalRows")) {
      rows = [{ id: 1, isGood: 1, totalRows: 1 }];
    }
    return new Response(JSON.stringify({ success: true, rows }), { status: 200 });
  };

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    global.fetch = originalFetch;
    if (originalImageRoot === undefined) delete process.env.IMAGE_ROOT;
    else process.env.IMAGE_ROOT = originalImageRoot;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const optionsResponse = await fetch(`${baseUrl}/api/options`);
  assert.deepEqual(await optionsResponse.json(), { lines: ["Línea 1"], cameras: ["Cámara A"] });
  const summaryResponse = await fetch(`${baseUrl}/api/summary?from=2026-11-01&camera=${encodeURIComponent("Cámara O'Brien")}`);
  assert.equal(summaryResponse.status, 200);
  const summary = await summaryResponse.json();
  assert.equal(summary.totals.total, 1);
  assert.deepEqual(
    [summary.totals.totalBytes, summary.totals.goodBytes, summary.totals.badBytes, summary.totals.unknownBytes],
    [1536, 1536, 0, 0],
  );
  assert.equal(summary.totals.allTimeBytes, 987654321);
  assert.equal(summary.byDate.length, 1);
  assert.deepEqual(
    [summary.byDate[0].totalBytes, summary.byDate[0].goodBytes, summary.byDate[0].badBytes],
    [1536, 1536, 0],
  );
  assert.match(queries[1], /Cámara O''Brien/);
  assert.match(queries[1], /SUM\(COALESCE\(TRY_CONVERT\(bigint, \[TamanoBytes\]\)/);
  assert.match(queries[1], /AS \[goodBytes\]/);
  assert.match(queries[1], /AS \[badBytes\]/);
  assert.match(queries[1], /SELECT \[photoDate\], \[total\], \[good\], \[bad\], \[unknown\], \[totalBytes\], \[goodBytes\], \[badBytes\]/);
  assert.match(queries[2], /AS \[allTimeBytes\]/);
  assert.doesNotMatch(queries[2], /\[FechaFoto\]/);
  assert.match(queries[2], /Cámara O''Brien/);
  assert.equal(summary.byDate[0].totalBytes, 1536);
  assert.equal(summary.byDate[0].goodBytes, 1536);

  const modelsResponse = await fetch(`${baseUrl}/api/models?camera=${encodeURIComponent("Cámara O'Brien")}`);
  assert.equal(modelsResponse.status, 200);
  const modelData = await modelsResponse.json();
  assert.deepEqual(modelData.models, [
    {
      model: "0039_08035004_08035005",
      recipe: "0039",
      partNumbers: ["08035004", "08035005"],
      photos: 7,
      good: 6,
      bad: 1,
      unknown: 0,
    },
  ]);
  assert.match(queries[3], /GROUP BY \[Modelo\]/);
  assert.match(queries[3], /Cámara O''Brien/);

  const photosResponse = await fetch(`${baseUrl}/api/photos?result=good&page=1`);
  assert.equal(photosResponse.status, 200);
  assert.equal((await photosResponse.json()).total, 1);
  const search = "CAM_100%[x]~";
  const searchResponse = await fetch(
    `${baseUrl}/api/photos?model=${encodeURIComponent("0039_O'Brien")}&result=bad&search=${encodeURIComponent(search)}&page=1`,
  );
  assert.equal(searchResponse.status, 200);
  assert.equal((await searchResponse.json()).total, 1);
  assert.match(queries[5], /\[Modelo\] = N'0039_O''Brien'/);
  assert.match(queries[5], /\[NombreImagen\] LIKE N'%CAM~_100~%~\[x~\]~~%' ESCAPE N'~'/);
  assert.match(queries[5], /END AS isGood, COUNT_BIG\(\*\) OVER\(\) AS totalRows\s+FROM[\s\S]+WHERE[\s\S]+?= 0 AND \[Modelo\]/);
  const invalidSearchResponse = await fetch(`${baseUrl}/api/photos?search=${"x".repeat(201)}`);
  assert.equal(invalidSearchResponse.status, 400);
  assert.equal(queries.length, 6);

  const imageResponse = await fetch(`${baseUrl}/api/photos/1/image`);
  assert.equal(imageResponse.status, 503);
  assert.match((await imageResponse.json()).error, /IMAGE_ROOT/);
});
