const express = require("express");
const fs = require("node:fs");
const path = require("node:path");

const projectDirectory = path.resolve(__dirname, "..", "..");
const databaseConfigDirectory = path.join(projectDirectory, "DB");
require("dotenv").config({ path: path.join(databaseConfigDirectory, ".env") });

const app = express();
const publicDirectory = path.resolve(__dirname, "..", "..", "frontend", "public");
const database = process.env.DB_DATABASE || "PrensasOvrPrueba";
const serverName = process.env.DB_SERVER || "est04db";
const databaseApiBaseUrl = (process.env.DB_API_BASE_URL || "").replace(/\/+$/, "");
const databaseApiTimeout = Number(process.env.DB_API_TIMEOUT || 20000);
const imageStatusSql = `
  CASE
    WHEN TRY_CONVERT(int, [Status]) IN (0, 1) THEN TRY_CONVERT(int, [Status])
    WHEN LOWER(LTRIM(RTRIM(COALESCE([Estado], N'')))) IN (N'buena', N'good', N'1') THEN 1
    WHEN LOWER(LTRIM(RTRIM(COALESCE([Estado], N'')))) IN (N'mala', N'bad', N'no good', N'0') THEN 0
    ELSE NULL
  END`;

async function executeReadQuery(command) {
  if (!databaseApiBaseUrl) {
    const error = new Error("Configura DB_API_BASE_URL en DB/.env de CamarasOvr.");
    error.status = 503;
    throw error;
  }
  if (!databaseApiBaseUrl.startsWith("https://") || !Number.isSafeInteger(databaseApiTimeout) || databaseApiTimeout < 1) {
    const error = new Error("La configuración de la API de base de datos no es válida.");
    error.status = 503;
    throw error;
  }
  if (!/^\s*SELECT\b/i.test(command) || /;|--|\/\*|\*\//.test(command)) {
    throw new Error("La aplicación solo permite consultas SELECT de una instrucción.");
  }

  let response;
  try {
    response = await fetch(`${databaseApiBaseUrl}/api/Utility/executeSQLCommand`, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ server: serverName, db: database, command }),
      signal: AbortSignal.timeout(databaseApiTimeout),
    });
  } catch (cause) {
    const error = new Error(`No fue posible contactar la API corporativa (${cause.name}).`);
    error.status = 502;
    throw error;
  }

  let result;
  try {
    result = await response.json();
  } catch {
    const error = new Error(`La API corporativa respondió con un formato inválido (HTTP ${response.status}).`);
    error.status = 502;
    throw error;
  }
  if (!response.ok || !result || typeof result !== "object" || result.success !== true || !Array.isArray(result.rows)) {
    const error = new Error(result.message || `La API corporativa rechazó la consulta (HTTP ${response.status}).`);
    error.status = 502;
    throw error;
  }
  return result.rows;
}

function escapeSqlString(value) {
  return value.replace(/'/g, "''");
}

function escapeSqlLike(value) {
  return value.replace(/[~%_[\]]/g, (character) => `~${character}`);
}

function parseModel(model) {
  const match = String(model || "").trim().match(/^(\d{4})(.*)$/);
  return {
    recipe: match ? match[1] : null,
    partNumbers: match ? match[2].split(/[_\s-]+/).filter(Boolean) : [],
  };
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function readFilters(query) {
  const filters = [];

  for (const [key, column] of [["from", "FechaFoto"], ["to", "FechaFoto"]]) {
    const value = query[key];
    if (!value) continue;
    if (!isValidDate(value)) {
      const error = new Error(`La fecha "${key}" no es válida.`);
      error.status = 400;
      throw error;
    }
    const dateValue = `CONVERT(date, N'${value}', 23)`;
    filters.push(key === "from" ? `[${column}] >= ${dateValue}` : `[${column}] < DATEADD(day, 1, ${dateValue})`);
  }

  if (query.from && query.to && query.from > query.to) {
    const error = new Error("La fecha inicial no puede ser posterior a la fecha final.");
    error.status = 400;
    throw error;
  }

  for (const [key, column] of [["line", "Linea"], ["camera", "Camara"]]) {
    const value = query[key];
    if (!value) continue;
    if (typeof value !== "string" || value.length > 200) {
      const error = new Error(`El filtro "${key}" no es válido.`);
      error.status = 400;
      throw error;
    }
    filters.push(`[${column}] = N'${escapeSqlString(value)}'`);
  }

  return filters.length ? `WHERE ${filters.join(" AND ")}` : "";
}

function isWithinRoot(root, candidate) {
  if (!candidate) return null;
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(path.isAbsolute(candidate) ? candidate : resolvedRoot, ...(path.isAbsolute(candidate) ? [] : [candidate]));
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return resolvedCandidate;
}

function resolvePhotoPath(root, { fullPath, folder, fileName }) {
  if (!root) return null;
  let realRoot;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    return null;
  }
  const candidates = [
    fullPath,
    folder && fileName ? path.join(folder, fileName) : null,
    fileName,
  ];
  for (const candidate of candidates) {
    try {
      const resolved = isWithinRoot(realRoot, candidate);
      if (!resolved) continue;
      const realPhoto = fs.realpathSync(resolved);
      if (isWithinRoot(realRoot, realPhoto) && fs.statSync(realPhoto).isFile()) return realPhoto;
    } catch {
      // An invalid or inaccessible database path is treated as an unavailable photo.
    }
  }
  return null;
}

app.use(express.static(publicDirectory));
app.use("/api", (request, response, next) => {
  const origin = request.get("origin");
  const expectedOrigin = `${request.protocol}://${request.get("host")}`;
  const referer = request.get("referer");
  let refererOrigin;
  try {
    if (referer) refererOrigin = new URL(referer).origin;
  } catch {
    return response.status(403).json({ error: "La solicitud debe originarse desde este panel." });
  }
  if (
    request.get("sec-fetch-site") === "cross-site"
    || (origin && origin !== expectedOrigin)
    || (!origin && refererOrigin && refererOrigin !== expectedOrigin)
  ) {
    return response.status(403).json({ error: "La solicitud debe originarse desde este panel." });
  }
  next();
});

app.get("/api/options", async (_request, response, next) => {
  try {
    const records = await executeReadQuery(`
      SELECT N'line' AS [kind], CONVERT(nvarchar(200), [Linea]) AS [value]
      FROM [dbo].[Autoraking]
      WHERE [Linea] IS NOT NULL AND LTRIM(RTRIM([Linea])) <> N''
      GROUP BY [Linea]
      UNION ALL
      SELECT N'camera' AS [kind], CONVERT(nvarchar(200), [Camara]) AS [value]
      FROM [dbo].[Autoraking]
      WHERE [Camara] IS NOT NULL AND LTRIM(RTRIM([Camara])) <> N''
      GROUP BY [Camara]
      ORDER BY [kind], [value]
    `);
    response.json({
      lines: records.filter((row) => row.kind === "line").map((row) => row.value),
      cameras: records.filter((row) => row.kind === "camera").map((row) => row.value),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/summary", async (request, response, next) => {
  try {
    const where = readFilters(request.query);
    const records = await executeReadQuery(`
      SELECT [photoDate], [total], [good], [bad], [unknown], [totalBytes], [goodBytes], [badBytes],
        SUM([total]) OVER() AS [grandTotal],
        SUM([good]) OVER() AS [grandGood],
        SUM([bad]) OVER() AS [grandBad],
        SUM([unknown]) OVER() AS [grandUnknown],
        SUM([totalBytes]) OVER() AS [grandTotalBytes],
        SUM([goodBytes]) OVER() AS [grandGoodBytes],
        SUM([badBytes]) OVER() AS [grandBadBytes],
        SUM([unknownBytes]) OVER() AS [grandUnknownBytes]
      FROM (
        SELECT CONVERT(date, [FechaFoto]) AS [photoDate],
          COUNT_BIG(*) AS [total],
          SUM(CASE WHEN ${imageStatusSql} = 1 THEN CONVERT(bigint, 1) ELSE CONVERT(bigint, 0) END) AS [good],
          SUM(CASE WHEN ${imageStatusSql} = 0 THEN CONVERT(bigint, 1) ELSE CONVERT(bigint, 0) END) AS [bad],
          SUM(CASE WHEN ${imageStatusSql} IS NULL THEN CONVERT(bigint, 1) ELSE CONVERT(bigint, 0) END) AS [unknown],
          SUM(COALESCE(TRY_CONVERT(bigint, [TamanoBytes]), CONVERT(bigint, 0))) AS [totalBytes],
          SUM(CASE WHEN ${imageStatusSql} = 1 THEN COALESCE(TRY_CONVERT(bigint, [TamanoBytes]), CONVERT(bigint, 0)) ELSE CONVERT(bigint, 0) END) AS [goodBytes],
          SUM(CASE WHEN ${imageStatusSql} = 0 THEN COALESCE(TRY_CONVERT(bigint, [TamanoBytes]), CONVERT(bigint, 0)) ELSE CONVERT(bigint, 0) END) AS [badBytes],
          SUM(CASE WHEN ${imageStatusSql} IS NULL THEN COALESCE(TRY_CONVERT(bigint, [TamanoBytes]), CONVERT(bigint, 0)) ELSE CONVERT(bigint, 0) END) AS [unknownBytes]
        FROM [dbo].[Autoraking] ${where}
        GROUP BY CONVERT(date, [FechaFoto])
      ) AS daily
      ORDER BY [photoDate]
    `);
    const allDatesQuery = { ...request.query };
    delete allDatesQuery.from;
    delete allDatesQuery.to;
    const allTimeRecords = await executeReadQuery(`
      SELECT COALESCE(
        SUM(COALESCE(TRY_CONVERT(bigint, [TamanoBytes]), CONVERT(bigint, 0))),
        CONVERT(bigint, 0)
      ) AS [allTimeBytes]
      FROM [dbo].[Autoraking] ${readFilters(allDatesQuery)}
    `);
    const totals = records.length
      ? {
        total: records[0].grandTotal,
        good: records[0].grandGood,
        bad: records[0].grandBad,
        unknown: records[0].grandUnknown,
        totalBytes: records[0].grandTotalBytes,
        goodBytes: records[0].grandGoodBytes,
        badBytes: records[0].grandBadBytes,
        unknownBytes: records[0].grandUnknownBytes,
        allTimeBytes: allTimeRecords[0]?.allTimeBytes ?? 0,
      }
      : {
        total: 0,
        good: 0,
        bad: 0,
        unknown: 0,
        totalBytes: 0,
        goodBytes: 0,
        badBytes: 0,
        unknownBytes: 0,
        allTimeBytes: allTimeRecords[0]?.allTimeBytes ?? 0,
      };
    response.json({
      totals,
      byDate: records.map(({
        photoDate,
        total,
        good,
        bad,
        unknown,
        totalBytes,
        goodBytes,
        badBytes,
      }) => ({
        photoDate,
        total,
        good,
        bad,
        unknown,
        totalBytes,
        goodBytes,
        badBytes,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/models", async (request, response, next) => {
  try {
    const where = readFilters(request.query);
    const records = await executeReadQuery(`
      SELECT [Modelo] AS [model],
        COUNT_BIG(*) AS [photos],
        SUM(CASE WHEN ${imageStatusSql} = 1 THEN CONVERT(bigint, 1) ELSE CONVERT(bigint, 0) END) AS [good],
        SUM(CASE WHEN ${imageStatusSql} = 0 THEN CONVERT(bigint, 1) ELSE CONVERT(bigint, 0) END) AS [bad],
        SUM(CASE WHEN ${imageStatusSql} IS NULL THEN CONVERT(bigint, 1) ELSE CONVERT(bigint, 0) END) AS [unknown]
      FROM [dbo].[Autoraking]
      ${where ? `${where} AND [Modelo] IS NOT NULL AND LTRIM(RTRIM([Modelo])) <> N''` : "WHERE [Modelo] IS NOT NULL AND LTRIM(RTRIM([Modelo])) <> N''"}
      GROUP BY [Modelo]
      ORDER BY [model]
    `);
    response.json({
      models: records.map((row) => ({
        model: row.model,
        ...parseModel(row.model),
        photos: Number(row.photos),
        good: Number(row.good),
        bad: Number(row.bad),
        unknown: Number(row.unknown),
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/photos", async (request, response, next) => {
  try {
    const baseWhere = readFilters(request.query);
    const conditions = baseWhere ? baseWhere.slice(6) : "";
    const whereParts = conditions ? [conditions] : [];
    const resultFilter = request.query.result || "";
    if (!["", "good", "bad", "unknown"].includes(resultFilter)) {
      const error = new Error("El filtro de resultado no es válido.");
      error.status = 400;
      throw error;
    }
    const resultWhere = resultFilter === "unknown"
      ? `${imageStatusSql} IS NULL`
      : resultFilter
        ? `${imageStatusSql} = ${resultFilter === "good" ? "1" : "0"}`
        : "";
    if (resultWhere) whereParts.push(resultWhere);
    const model = request.query.model || "";
    if (model) {
      if (typeof model !== "string" || model.length > 200) {
        const error = new Error("El filtro de modelo no es válido.");
        error.status = 400;
        throw error;
      }
      whereParts.push(`[Modelo] = N'${escapeSqlString(model)}'`);
    }
    const search = request.query.search || "";
    if (search) {
      if (typeof search !== "string" || search.trim().length > 200) {
        const error = new Error("El nombre de imagen debe tener como máximo 200 caracteres.");
        error.status = 400;
        throw error;
      }
      whereParts.push(`[NombreImagen] LIKE N'%${escapeSqlLike(search.trim())}%' ESCAPE N'~'`);
    }
    const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
    const page = Number(request.query.page || 1);
    const limit = Number(request.query.limit || 24);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      const error = new Error("La página o cantidad solicitada no es válida.");
      error.status = 400;
      throw error;
    }
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset)) {
      const error = new Error("La página solicitada es demasiado grande.");
      error.status = 400;
      throw error;
    }
    const records = await executeReadQuery(`
      SELECT [ID] AS [id], [FechaFoto] AS [photoDate], [FechaCopiado] AS [copiedDate],
        [Linea] AS line, [Camara] AS camera, [IP_Camara] AS cameraIp,
        [Estado] AS state, [Status] AS status, [Modelo] AS model,
        [NombreImagen] AS imageName, [Ruta] AS folder, [RutaCompleta] AS fullPath, [TamanoBytes] AS bytes,
        ${imageStatusSql} AS isGood, COUNT_BIG(*) OVER() AS totalRows
      FROM [dbo].[Autoraking]
      ${whereClause}
      ORDER BY [FechaFoto] DESC, [ID] DESC
      OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
    `);
    response.json({
      photos: records.map(({ totalRows, ...photo }) => ({
        ...photo,
        isGood: photo.isGood == null ? null : Number(photo.isGood),
      })),
      total: records.length ? Number(records[0].totalRows) : 0,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/photos/:id/image", async (request, response, next) => {
  try {
    if (!/^\d+$/.test(request.params.id)) return response.status(400).json({ error: "El identificador de foto no es válido." });
    const imageRoot = process.env.IMAGE_ROOT;
    if (!imageRoot) return response.status(503).json({ error: "Configura IMAGE_ROOT en el archivo DB/.env." });
    const records = await executeReadQuery(
      `SELECT [RutaCompleta] AS [fullPath], [Ruta] AS [folder], [NombreImagen] AS [fileName] FROM [dbo].[Autoraking] WHERE [ID] = ${request.params.id}`,
    );
    const imagePath = records[0] && resolvePhotoPath(imageRoot, records[0]);
    if (!imagePath) return response.status(404).json({ error: "No se encontró la foto dentro de la carpeta configurada." });
    response.type(path.extname(imagePath));
    const imageStream = fs.createReadStream(imagePath);
    imageStream.on("error", (error) => {
      console.error("No se pudo leer la imagen:", error.message);
      if (!response.headersSent) response.status(404).json({ error: "No se pudo leer la imagen." });
      else response.destroy(error);
    });
    imageStream.pipe(response);
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  const status = error.status || 500;
  if (status >= 500) console.error("Error en la solicitud:", error.message);
  response.status(status).json({
    error: status >= 500 && !error.isConfigurationError
      ? "No se pudo completar la consulta. Revisa la conexión SQL Server y la configuración."
      : error.message,
  });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 4910);
  const host = process.env.HOST || "127.0.0.1";
  app.listen(port, host, () => console.log(`Panel de cámaras disponible en http://${host}:${port}`));
}

module.exports = { app, isWithinRoot, parseModel, resolvePhotoPath };
