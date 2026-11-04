const state = {
  page: 1,
  limit: 24,
  total: 0,
  photos: [],
  models: [],
  dailyRecords: [],
  resultFilter: "all",
  galleryModel: "",
  galleryDate: "",
  photoSearch: "",
  filters: {},
};
const elements = {
  form: document.querySelector("#filters-form"),
  dateFrom: document.querySelector("#date-from"),
  dateTo: document.querySelector("#date-to"),
  line: document.querySelector("#line-filter"),
  camera: document.querySelector("#camera-filter"),
  resultFilter: document.querySelector("#result-filter"),
  photoGrid: document.querySelector("#photo-grid"),
  emptyState: document.querySelector("#empty-state"),
  error: document.querySelector("#error-banner"),
  chart: document.querySelector("#chart"),
  dialog: document.querySelector("#photo-dialog"),
};

function toLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value, options = { day: "2-digit", month: "short", year: "numeric" }) {
  if (!value) return "—";
  const dateParts = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const isDateOnly = dateParts && String(value).length === 10;
  const date = isDateOnly
    ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-MX", options).format(date);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("es-MX");
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 bytes";
  if (bytes < 1024) return `${formatNumber(bytes)} bytes`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unitIndex = -1;
  do {
    amount /= 1024;
    unitIndex += 1;
  } while (amount >= 1024 && unitIndex < units.length - 1);
  return `${amount.toLocaleString("es-MX", { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
}

function formatPercent(part, total) {
  const count = Number(part) || 0;
  const denominator = Number(total) || 0;
  return `${(denominator ? (count / denominator) * 100 : 0).toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`;
}

function currentParams() {
  return new URLSearchParams(Object.entries(state.filters).filter(([, value]) => value));
}

async function requestJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "No se pudo completar la consulta.");
  return payload;
}

function setError(message) {
  elements.error.textContent = message;
  elements.error.hidden = !message;
  document.querySelector("#connection-text").textContent = message ? "Sin conexión" : "Datos actualizados";
}

function addOptions(select, values, placeholder) {
  select.replaceChildren(new Option(placeholder, ""));
  for (const value of values) select.add(new Option(value, value));
}

async function loadOptions() {
  try {
    const options = await requestJson("/api/options");
    addOptions(elements.line, options.lines, "Todas las líneas");
    addOptions(elements.camera, options.cameras, "Todas las cámaras");
    setError("");
  } catch (error) {
    setError(error.message);
  }
}

function appendSvgElement(parent, name, attributes = {}, text) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  parent.append(element);
  return element;
}

function appendChartTableRows(days) {
  const body = document.querySelector("#chart-data-rows");
  body.replaceChildren();
  const dateFrom = document.querySelector("#daily-date-from").value;
  const dateTo = document.querySelector("#daily-date-to").value;
  const minPhotosValue = document.querySelector("#daily-photos-min").value;
  const maxPhotosValue = document.querySelector("#daily-photos-max").value;
  const minPhotos = minPhotosValue === "" ? null : Number(minPhotosValue);
  const maxPhotos = maxPhotosValue === "" ? null : Number(maxPhotosValue);
  const filteredDays = days.filter((day) => {
    const photoDate = String(day.photoDate).slice(0, 10);
    const total = Number(day.total) || 0;
    return (!dateFrom || photoDate >= dateFrom)
      && (!dateTo || photoDate <= dateTo)
      && (minPhotos === null || total >= minPhotos)
      && (maxPhotos === null || total <= maxPhotos);
  });
  for (const day of filteredDays) {
    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    const dateButton = document.createElement("button");
    dateButton.type = "button";
    dateButton.className = "daily-date-button";
    dateButton.textContent = formatDate(day.photoDate, { day: "2-digit", month: "short", year: "numeric" });
    dateButton.setAttribute("aria-label", `Ver fotos del ${dateButton.textContent}`);
    dateButton.addEventListener("click", () => showDatePhotos(String(day.photoDate).slice(0, 10)));
    dateCell.append(dateButton);
    row.append(dateCell);
    const cells = [
      formatNumber(day.total),
      formatNumber(day.good),
      formatPercent(day.good, day.total),
      formatNumber(day.bad),
      formatPercent(day.bad, day.total),
      formatBytes(day.totalBytes),
      formatBytes(day.goodBytes),
      formatBytes(day.badBytes),
    ];
    for (const value of cells) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
  document.querySelector("#daily-filter-summary").textContent =
    `${formatNumber(filteredDays.length)} de ${formatNumber(days.length)} días`;
  if (!filteredDays.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 9;
    cell.className = "daily-empty";
    cell.textContent = "No hay días que coincidan con los filtros.";
    row.append(cell);
    body.append(row);
  }
}

function setMetricsLoading(loading) {
  document.querySelector(".metrics").setAttribute("aria-busy", String(loading));
  for (const key of ["total", "good", "bad", "unknown"]) {
    const value = document.querySelector(`#${key}-count`);
    value.classList.toggle("is-loading", loading);
    value.setAttribute("aria-label", loading ? "Cargando" : value.textContent);
    document.querySelector(`#${key}-size`).classList.toggle("is-loading", loading);
  }
}

function setChartLoading(loading) {
  elements.chart.classList.toggle("is-loading", loading);
  elements.chart.setAttribute("aria-busy", String(loading));
  elements.chart.querySelector(".chart-loading")?.remove();
  if (!loading) return;

  const skeleton = document.createElement("div");
  skeleton.className = "chart-loading";
  skeleton.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 12; index += 1) {
    const column = document.createElement("span");
    column.className = "chart-loading-column";
    for (let bar = 0; bar < 3; bar += 1) {
      const segment = document.createElement("i");
      segment.className = `chart-loading-bar chart-loading-bar-${bar}`;
      column.append(segment);
    }
    skeleton.append(column);
  }
  elements.chart.append(skeleton);
}

function setModelsLoading(loading) {
  const rows = document.querySelector("#model-data-rows");
  rows.setAttribute("aria-busy", String(loading));
  rows.querySelectorAll(".loading-row").forEach((row) => row.remove());
  if (!loading) return;

  for (let index = 0; index < 5; index += 1) {
    const row = document.createElement("tr");
    row.className = "loading-row";
    row.setAttribute("aria-hidden", "true");
    for (let column = 0; column < 8; column += 1) {
      const cell = document.createElement("td");
      const skeleton = document.createElement("span");
      skeleton.className = `skeleton skeleton-line skeleton-line-${column}`;
      cell.append(skeleton);
      row.append(cell);
    }
    rows.append(row);
  }
  document.querySelector("#model-count").textContent = "Cargando modelos…";
  document.querySelector("#model-empty-state").hidden = true;
}

function setPhotosLoading(loading) {
  elements.photoGrid.classList.toggle("is-loading", loading);
  elements.photoGrid.setAttribute("aria-busy", String(loading));
  elements.photoGrid.querySelector(".photo-loading")?.remove();
  if (!loading) return;

  const skeleton = document.createElement("div");
  skeleton.className = "photo-loading";
  skeleton.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 8; index += 1) {
    const card = document.createElement("div");
    card.className = "photo-skeleton";
    const image = document.createElement("span");
    image.className = "skeleton photo-skeleton-image";
    const title = document.createElement("span");
    title.className = "skeleton skeleton-line";
    const detail = document.createElement("span");
    detail.className = "skeleton skeleton-line skeleton-line-short";
    card.append(image, title, detail);
    skeleton.append(card);
  }
  elements.photoGrid.append(skeleton);
}

function dateOrdinal(value) {
  const date = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return date ? Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3])) / 86400000 : NaN;
}

function renderChart(days) {
  elements.chart.replaceChildren();
  state.dailyRecords = days;
  appendChartTableRows(days);
  if (!days.length) {
    const empty = document.createElement("div");
    empty.className = "chart-empty";
    empty.textContent = "No hay actividad en el periodo seleccionado.";
    elements.chart.append(empty);
    return;
  }
  const series = days.map((day) => ({
    date: day.photoDate,
    dateOrdinal: dateOrdinal(day.photoDate),
    total: Number(day.total),
    good: Number(day.good),
    bad: Number(day.bad),
    unknown: Number(day.unknown),
  }));
  const largest = Math.max(1, ...series.map((day) => day.total));
  const firstDay = Math.min(...series.map((day) => day.dateOrdinal));
  const lastDay = Math.max(...series.map((day) => day.dateOrdinal));
  const calendarSpan = Math.max(1, lastDay - firstDay + 1);
  const roughStep = largest / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= roughStep);
  const axisMaximum = step * 5;
  const margin = { top: 20, right: 44, bottom: 40, left: 62 };
  const plotHeight = 220;
  const plotWidth = Math.max(700, calendarSpan * 40);
  const width = margin.left + plotWidth + margin.right;
  const height = margin.top + plotHeight + margin.bottom;
  const slot = plotWidth / calendarSpan;
  const groupWidth = Math.min(50, slot * 0.72);
  const barGap = 2;
  const barWidth = (groupWidth - barGap * 2) / 3;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("chart-svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("aria-hidden", "true");

  for (let tick = 0; tick <= 5; tick += 1) {
    const value = step * tick;
    const y = margin.top + plotHeight - (value / axisMaximum) * plotHeight;
    appendSvgElement(svg, "line", {
      x1: margin.left,
      y1: y,
      x2: margin.left + plotWidth,
      y2: y,
      class: "chart-grid-line",
    });
    appendSvgElement(svg, "text", {
      x: margin.left - 10,
      y: y + 4,
      "text-anchor": "end",
      class: "chart-axis-label",
    }, formatNumber(value));
    appendSvgElement(svg, "text", {
      x: margin.left + plotWidth + 9,
      y: y + 4,
      "text-anchor": "start",
      class: "chart-axis-label chart-percent-label",
    }, `${tick * 20}%`);
  }

  const labelInterval = Math.max(1, Math.ceil(series.length / 14));
  const percentPoints = [];
  series.forEach((day, index) => {
    const calendarOffset = day.dateOrdinal - firstDay;
    const center = margin.left + slot * (calendarOffset + 0.5);
    const goodPercent = day.total ? (day.good / day.total) * 100 : 0;
    percentPoints.push({
      x: center,
      y: margin.top + plotHeight - (goodPercent / 100) * plotHeight,
      date: day.date,
      percent: goodPercent,
    });
    const x = center - groupWidth / 2;
    const results = [
      ["good", "Buenas", "chart-bar-good"],
      ["bad", "Malas", "chart-bar-bad"],
      ["unknown", "Sin clasificar", "chart-bar-unknown"],
    ];
    results.forEach(([key, label, className], resultIndex) => {
      const count = day[key];
      const barHeight = (count / axisMaximum) * plotHeight;
      const rect = appendSvgElement(svg, "rect", {
        x: x + resultIndex * (barWidth + barGap),
        y: margin.top + plotHeight - barHeight,
        width: barWidth,
        height: barHeight,
        rx: 2,
        class: className,
      });
      rect.style.animationDelay = `${Math.min(index * 18, 360)}ms`;
      appendSvgElement(rect, "title", {}, `${formatDate(day.date)} · ${label}: ${formatNumber(count)}`);
    });
    if (index % labelInterval === 0 || index === series.length - 1) {
      const dateLabel = appendSvgElement(svg, "text", {
        x: center,
        y: margin.top + plotHeight + 20,
        "text-anchor": "middle",
        class: "chart-axis-label chart-date-label",
      }, formatDate(day.date, { day: "2-digit", month: "short" }));
      dateLabel.setAttribute("role", "button");
      dateLabel.setAttribute("tabindex", "0");
      dateLabel.setAttribute("aria-label", `Ver fotos del ${formatDate(day.date)}`);
      dateLabel.setAttribute("title", `Ver fotos del ${formatDate(day.date)}`);
      dateLabel.addEventListener("click", () => showDatePhotos(day.date));
      dateLabel.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showDatePhotos(day.date);
        }
      });
    }
  });
  const percentPath = percentPoints
    .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
    .join(" ");
  appendSvgElement(svg, "path", {
    d: percentPath,
    class: "chart-good-percent-line",
  });
  percentPoints.forEach((point) => {
    const marker = appendSvgElement(svg, "circle", {
      cx: point.x,
      cy: point.y,
      r: 3.5,
      class: "chart-good-percent-point",
    });
    appendSvgElement(marker, "title", {}, `${formatDate(point.date)} · Fotos buenas: ${point.percent.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`);
    appendSvgElement(svg, "text", {
      x: point.x,
      y: point.y < margin.top + 22 ? point.y + 17 : point.y - 9,
      "text-anchor": "middle",
      class: "chart-good-percent-value",
    }, formatPercent(point.percent, 100));
  });
  elements.chart.append(svg);
}

function renderModels() {
  const query = document.querySelector("#model-search").value.trim().toLocaleLowerCase("es-MX");
  const rows = document.querySelector("#model-data-rows");
  rows.replaceChildren();
  const visibleModels = state.models.filter((item) => {
    return [item.model, item.recipe, ...item.partNumbers]
      .some((value) => value.toLocaleLowerCase("es-MX").includes(query));
  });

  for (const item of visibleModels) {
    const row = document.createElement("tr");
    const modelCell = document.createElement("td");
    modelCell.className = "relation-model";
    modelCell.textContent = item.model;

    const recipeCell = document.createElement("td");
    const recipeBadge = document.createElement("span");
    recipeBadge.className = "recipe-badge";
    recipeBadge.textContent = item.recipe || "No identificada";
    recipeCell.append(recipeBadge);

    const partCell = document.createElement("td");
    partCell.className = "part-number-list";
    if (item.partNumbers.length) {
      for (const partNumber of item.partNumbers) {
        const chip = document.createElement("span");
        chip.className = "part-number-chip";
        chip.textContent = partNumber;
        partCell.append(chip);
      }
    } else {
      partCell.textContent = "No identificados";
    }

    row.append(modelCell, recipeCell, partCell);
    for (const [key, result, label] of [
      ["photos", "all", "todas"],
      ["good", "good", "buenas"],
      ["bad", "bad", "malas"],
    ]) {
      const cell = document.createElement("td");
      cell.className = `relation-count relation-${key}`;
      const viewButton = document.createElement("button");
      viewButton.type = "button";
      viewButton.className = `relation-view relation-view-${key}`;
      viewButton.setAttribute("aria-label", `Ver ${formatNumber(item[key])} fotos ${label} del modelo ${item.model}`);
      viewButton.title = `Ver ${formatNumber(item[key])} fotos ${label}`;
      const eye = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      eye.setAttribute("viewBox", "0 0 24 24");
      eye.setAttribute("aria-hidden", "true");
      const outline = document.createElementNS("http://www.w3.org/2000/svg", "path");
      outline.setAttribute("d", "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z");
      const pupil = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      pupil.setAttribute("cx", "12");
      pupil.setAttribute("cy", "12");
      pupil.setAttribute("r", "3");
      eye.append(outline, pupil);
      const count = document.createElement("span");
      count.textContent = formatNumber(item[key]);
      viewButton.append(eye, count);
      viewButton.addEventListener("click", () => showModelPhotos(item.model, result));
      cell.append(viewButton);
      row.append(cell);
      if (key === "good" || key === "bad") {
        const percentCell = document.createElement("td");
        percentCell.className = `relation-percent relation-${key}-percent`;
        percentCell.textContent = formatPercent(item[key], item.photos);
        row.append(percentCell);
      }
    }
    rows.append(row);
  }

  document.querySelector("#model-count").textContent =
    `${formatNumber(visibleModels.length)} de ${formatNumber(state.models.length)} modelos`;
  document.querySelector("#model-empty-state").hidden = visibleModels.length > 0;
}

function updateGalleryScope() {
  const scope = document.querySelector("#gallery-scope");
  scope.hidden = !state.galleryModel && !state.galleryDate;
  document.querySelector("#gallery-scope-label").textContent =
    [
      state.galleryDate ? `Fecha seleccionada: ${formatDate(state.galleryDate)}` : "",
      state.galleryModel ? `Modelo seleccionado: ${state.galleryModel}` : "",
    ].filter(Boolean).join(" · ");
}

function showModelPhotos(model, result) {
  clearTimeout(photoSearchTimer);
  state.galleryModel = model;
  state.galleryDate = "";
  state.resultFilter = result;
  state.page = 1;
  state.photoSearch = "";
  document.querySelector("#result-filter").value = result;
  document.querySelector("#photo-search").value = "";
  updateGalleryScope();
  loadPhotos().catch((error) => setError(error.message));
  document.querySelector("#fotos").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showDatePhotos(date) {
  clearTimeout(photoSearchTimer);
  state.galleryDate = date;
  state.galleryModel = "";
  state.resultFilter = "all";
  state.page = 1;
  state.photoSearch = "";
  document.querySelector("#result-filter").value = "all";
  document.querySelector("#photo-search").value = "";
  updateGalleryScope();
  loadPhotos().catch((error) => setError(error.message));
  document.querySelector("#fotos").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadSummary() {
  setMetricsLoading(true);
  setChartLoading(true);
  try {
    const params = currentParams();
    const data = await requestJson(`/api/summary?${params}`);
    for (const key of ["total", "good", "bad", "unknown"]) {
      document.querySelector(`#${key}-count`).textContent = formatNumber(data.totals[key]);
      document.querySelector(`#${key}-size`).textContent = formatBytes(data.totals[`${key}Bytes`]);
    }
    renderChart(data.byDate);
  } finally {
    setMetricsLoading(false);
    setChartLoading(false);
  }
}

async function loadModels() {
  setModelsLoading(true);
  try {
    const params = currentParams();
    const data = await requestJson(`/api/models?${params}`);
    state.models = data.models;
  } finally {
    setModelsLoading(false);
    renderModels();
  }
}

function stateFor(photo) {
  if (photo.isGood === true || photo.isGood === 1) return "good";
  if (photo.isGood === false || photo.isGood === 0) return "bad";
  return "unknown";
}

function makeMeta(label, value) {
  const span = document.createElement("span");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  span.append(strong, document.createTextNode(value || "—"));
  span.title = `${label}: ${value || "—"}`;
  return span;
}

function showPhoto(photo, imageUrl) {
  const image = document.querySelector("#dialog-image");
  const unavailable = document.querySelector("#dialog-image-unavailable");
  image.hidden = false;
  unavailable.hidden = true;
  image.alt = `Foto ampliada: ${photo.imageName || photo.id}`;
  image.onerror = () => {
    image.hidden = true;
    unavailable.hidden = false;
  };
  image.onload = () => {
    image.hidden = false;
    unavailable.hidden = true;
  };
  image.src = imageUrl;
  document.querySelector("#dialog-caption").textContent =
    `${photo.imageName || "Foto"} · ${photo.camera || "Cámara sin nombre"} · ${formatDate(photo.photoDate)}`;
  elements.dialog.showModal();
}

function createPhotoCard(photo) {
  const result = stateFor(photo);
  const card = document.createElement("article");
  card.className = "photo-card";
  card.dataset.result = result;

  const preview = document.createElement("button");
  preview.type = "button";
  preview.className = "photo-preview";
  preview.setAttribute("aria-label", `Ampliar foto ${photo.imageName || photo.id}`);
  const image = document.createElement("img");
  const imageUrl = `/api/photos/${encodeURIComponent(photo.id)}/image`;
  image.src = imageUrl;
  image.alt = `Captura de ${photo.camera || "cámara sin nombre"}`;
  image.loading = "lazy";
  image.addEventListener("error", () => {
    image.remove();
    const missing = document.createElement("span");
    missing.className = "image-missing";
    missing.textContent = "Imagen no disponible. Revisa IMAGE_ROOT, el acceso a la carpeta de red y sus permisos de lectura.";
    preview.prepend(missing);
  }, { once: true });
  preview.addEventListener("click", () => showPhoto(photo, imageUrl));

  const badge = document.createElement("span");
  badge.className = `state-badge ${result}`;
  badge.textContent = result === "good" ? "✓ Buena" : result === "bad" ? "! Mala" : "? Sin clasificar";
  preview.append(image, badge);

  const info = document.createElement("div");
  info.className = "photo-info";
  const name = document.createElement("div");
  name.className = "photo-name";
  name.textContent = photo.imageName || `Foto ${photo.id}`;
  name.title = name.textContent;
  const meta = document.createElement("div");
  meta.className = "photo-meta";
  meta.append(
    makeMeta("Fecha", formatDate(photo.photoDate)),
    makeMeta("Cámara", photo.camera),
    makeMeta("Línea", photo.line),
    makeMeta("Modelo", photo.model),
  );
  const details = document.createElement("details");
  details.className = "photo-details";
  const summary = document.createElement("summary");
  summary.textContent = "Ver todos los datos";
  const allFields = document.createElement("div");
  allFields.className = "photo-all-fields";
  allFields.append(
    makeMeta("ID", photo.id),
    makeMeta("Fecha de captura", formatDate(photo.photoDate, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })),
    makeMeta("Fecha de copiado", formatDate(photo.copiedDate, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })),
    makeMeta("Línea", photo.line),
    makeMeta("Cámara", photo.camera),
    makeMeta("IP de cámara", photo.cameraIp),
    makeMeta("Estado", photo.state),
    makeMeta("Status", photo.status),
    makeMeta("Modelo", photo.model),
    makeMeta("Nombre de imagen", photo.imageName),
    makeMeta("Ruta", photo.folder),
    makeMeta("Ruta completa", photo.fullPath),
    makeMeta("Tamaño", photo.bytes == null ? "—" : `${formatNumber(photo.bytes)} bytes`),
  );
  details.append(summary, allFields);
  info.append(name, meta, details);
  card.append(preview, info);
  return card;
}

function renderPhotos() {
  elements.photoGrid.replaceChildren();
  state.photos.forEach((photo, index) => {
    const card = createPhotoCard(photo);
    card.style.setProperty("--entry-delay", `${Math.min(index * 35, 420)}ms`);
    elements.photoGrid.append(card);
  });
  elements.emptyState.hidden = state.photos.length > 0;
  document.querySelector("#results-count").textContent = `${formatNumber(state.total)} fotos encontradas`;
  document.querySelector("#page-label").textContent = `Página ${state.page} de ${Math.max(1, Math.ceil(state.total / state.limit))}`;
  document.querySelector("#previous-page").disabled = state.page <= 1;
  document.querySelector("#next-page").disabled = state.page * state.limit >= state.total;
}

async function loadPhotos() {
  setPhotosLoading(true);
  try {
    const params = currentParams();
    if (state.galleryDate) {
      params.set("from", state.galleryDate);
      params.set("to", state.galleryDate);
    }
    params.set("page", String(state.page));
    params.set("limit", String(state.limit));
    if (state.resultFilter !== "all") params.set("result", state.resultFilter);
    if (state.galleryModel) params.set("model", state.galleryModel);
    if (state.photoSearch) params.set("search", state.photoSearch);
    const data = await requestJson(`/api/photos?${params}`);
    state.photos = data.photos;
    state.total = data.total;
  } finally {
    setPhotosLoading(false);
    renderPhotos();
  }
}

async function loadDashboard() {
  setError("");
  document.querySelector("#connection-text").textContent = "Cargando datos…";
  try {
    await Promise.all([loadSummary(), loadModels(), loadPhotos()]);
    document.querySelector("#connection-text").textContent = "Datos actualizados";
  } catch (error) {
    setError(error.message);
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  state.filters = {
    from: elements.dateFrom.value,
    to: elements.dateTo.value,
    line: elements.line.value,
    camera: elements.camera.value,
  };
  state.galleryDate = "";
  state.page = 1;
  updateGalleryScope();
  loadDashboard();
});
elements.resultFilter.addEventListener("change", () => {
  state.resultFilter = elements.resultFilter.value;
  state.page = 1;
  loadDashboard();
});
document.querySelector("#previous-page").addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    loadDashboard();
  }
});
document.querySelector("#next-page").addEventListener("click", () => {
  if (state.page * state.limit < state.total) {
    state.page += 1;
    loadDashboard();
  }
});
document.querySelector("#refresh-button").addEventListener("click", loadDashboard);
document.querySelector("#model-search").addEventListener("input", renderModels);
let photoSearchTimer;
document.querySelector("#photo-search").addEventListener("input", (event) => {
  state.photoSearch = event.target.value.trim();
  state.page = 1;
  clearTimeout(photoSearchTimer);
  photoSearchTimer = setTimeout(() => loadPhotos().catch((error) => setError(error.message)), 300);
});
document.querySelector("#clear-gallery-scope").addEventListener("click", () => {
  clearTimeout(photoSearchTimer);
  state.galleryModel = "";
  state.galleryDate = "";
  state.resultFilter = "all";
  state.photoSearch = "";
  state.page = 1;
  document.querySelector("#result-filter").value = "all";
  document.querySelector("#photo-search").value = "";
  updateGalleryScope();
  loadPhotos().catch((error) => setError(error.message));
});
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((link) => link.classList.remove("active"));
    item.classList.add("active");
  });
});
document.querySelector("#close-dialog").addEventListener("click", () => elements.dialog.close());
elements.dialog.addEventListener("click", (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});
document.querySelector("#daily-table-filters").addEventListener("input", () => {
  appendChartTableRows(state.dailyRecords);
});
document.querySelector("#daily-table-filters").addEventListener("reset", () => {
  requestAnimationFrame(() => appendChartTableRows(state.dailyRecords));
});

const today = new Date();
const weekAgo = new Date(today);
weekAgo.setDate(today.getDate() - 6);
elements.dateFrom.value = toLocalDate(weekAgo);
elements.dateTo.value = toLocalDate(today);
state.filters = { from: elements.dateFrom.value, to: elements.dateTo.value, line: "", camera: "" };
updateGalleryScope();
loadOptions().then(loadDashboard);
