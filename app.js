const phone = document.querySelector(".phone");
const screens = Array.from(document.querySelectorAll(".screen"));
const navButtons = Array.from(document.querySelectorAll("[data-target]"));
const bottomButtons = Array.from(document.querySelectorAll(".bottom-nav button"));
const toast = document.querySelector(".toast");
const settingsSheet = document.querySelector(".settings-sheet");
const settingsPanelTitle = document.querySelector("#settings-panel-title");
const settingsPanelContent = document.querySelector(".settings-panel-content");
const avatarInput = document.querySelector("[data-avatar-input]");

let toastTimer;
let periodIndex = 0;
let profilePhoto = "";
let activePhotoSlot = "";
let activePhotoStream = null;
const periodLabels = ["\u00daltimos 3 ciclos", "\u00daltimos 6 ciclos", "Ciclo atual"];
const seriesLabels = {
  dor: "Dor",
  edema: "Edema",
  sensibilidade: "Sensibilidade",
  humor: "Humor",
};
const symptomDisplayNames = ["Dor", "Edema", "Sensibilidade", "Humor"];
const symptomClassNames = ["symptom-dor", "symptom-edema", "symptom-sensibilidade", "symptom-humor"];
const symptomImageSources = [
  "imagem/dor-card.png",
  "imagem/edema-card.png",
  "imagem/sensibilidade-card.png",
  "imagem/humor-card.png",
];
const normalImageSource = "imagem/normal-card.png";
const fallbackImageSource = "imagem/sensibilidade-card.png";
const photoSlotTemplates = [
  { name: "Frente", className: "front-view", placeholder: "imagem/radar-frente-card.png" },
  { name: "Lado", className: "side-view", placeholder: "imagem/radar-frente-card.png" },
  { name: "Costas", className: "back-view", placeholder: "imagem/radar-costas-card.png" },
];
const photoSlotImages = {};

try {
  profilePhoto = localStorage.getItem("radar-lipedema-profile-photo") || "";
} catch (error) {
  profilePhoto = "";
}

function getPainLabel(value) {
  return value >= 8 ? "Intensa" : value >= 4 ? "Moderada" : "Leve";
}

function getCurrentSymptomValues() {
  return Array.from(document.querySelectorAll('#register [data-symptom]')).map((input) => Number(input.value));
}

function getEvolutionLabel(score) {
  if (score >= 85) {
    return "Excelente";
  }

  if (score >= 70) {
    return "Bom";
  }

  if (score >= 55) {
    return "Aten&ccedil;&atilde;o";
  }

  return "Cuidado";
}

function updateEvolutionScore(values = getCurrentSymptomValues()) {
  const symptomValues = values.length ? values : [6, 5, 7, 4];
  const average = symptomValues.reduce((total, value) => total + value, 0) / symptomValues.length;
  const score = Math.max(0, Math.min(100, Math.round(100 - average * 4)));
  const label = getEvolutionLabel(score);
  const summary =
    score >= 85
      ? "Evolu&ccedil;&atilde;o forte: sintomas controlados e rotina consistente."
      : score >= 70
        ? "Bom progresso: continue registrando edema, medidas, h&aacute;bitos e ciclo."
        : score >= 55
          ? "Aten&ccedil;&atilde;o aos sinais: compare sintomas, fotos e tratamentos."
          : "Sintomas em alta: acompanhe os dados e procure suporte profissional.";
  const stars = score >= 85 ? "★ ★ ★" : score >= 70 ? "★ ★ ☆" : score >= 55 ? "★ ☆ ☆" : "☆ ☆ ☆";

  document.querySelectorAll("[data-evolution-score]").forEach((item) => {
    item.textContent = score;
  });
  document.querySelectorAll("[data-evolution-label]").forEach((item) => {
    item.innerHTML = label;
  });
  document.querySelectorAll("[data-evolution-stars]").forEach((item) => {
    item.textContent = stars;
  });
  document.querySelectorAll("[data-evolution-summary]").forEach((item) => {
    item.innerHTML = summary;
  });

  return score;
}

function buildPremiumDataset(values = getCurrentSymptomValues()) {
  const symptomValues = values.length ? values : [6, 5, 7, 4];
  const [dor, edema, sensibilidade, humor] = symptomValues;
  const score = updateEvolutionScore(symptomValues);
  const cycleIndex = [
    { label: "Ciclo atual", dor, edema, sensibilidade, humor, peso: 67.3, coxa: 61.0, adesao: 82 },
    { label: "Ciclo anterior", dor: 7, edema: 6, sensibilidade: 8, humor: 4, peso: 67.7, coxa: 61.4, adesao: 74 },
    { label: "2 ciclos atr&aacute;s", dor: 8, edema: 7, sensibilidade: 8, humor: 3, peso: 68.1, coxa: 61.8, adesao: 68 },
  ];
  const previous = cycleIndex[1];
  const deltas = {
    dor: dor - previous.dor,
    edema: edema - previous.edema,
    sensibilidade: sensibilidade - previous.sensibilidade,
    peso: cycleIndex[0].peso - previous.peso,
    coxa: cycleIndex[0].coxa - previous.coxa,
    adesao: cycleIndex[0].adesao - previous.adesao,
  };
  const insights = [
    sensibilidade >= 7
      ? "Sensibilidade alta na fase l&uacute;tea: priorizar rotina anti-inflamat&oacute;ria e descanso."
      : "Sensibilidade abaixo do pico recente: manter acompanhamento.",
    edema >= 6
      ? "Edema acima da meta: comparar com ingest&atilde;o de &aacute;gua, meia compressiva e ciclo."
      : "Edema dentro da faixa acompanhada no ciclo atual.",
    dor >= 7
      ? "Dor elevada: registrar localiza&ccedil;&atilde;o e resposta aos tratamentos."
      : "Dor em queda frente ao ciclo anterior.",
  ];

  return {
    generatedAt: "14/07/2026 09:41",
    score,
    status: getEvolutionLabel(score),
    records: {
      sintomas: 28,
      edema: 19,
      medidas: 8,
      peso: 21,
      tratamentos: 12,
      habitos: 26,
      fotos: 9,
      ciclo: 3,
    },
    cycleIndex,
    deltas,
    insights,
  };
}

function formatDelta(value, suffix = "") {
  if (value === 0) {
    return `0${suffix}`;
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1).replace(".", ",")}${suffix}`;
}

function formatHabitValue(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

function setProfilePhoto(src) {
  document.querySelectorAll(".avatar").forEach((avatar) => {
    avatar.classList.toggle("has-photo", Boolean(src));
    avatar.style.backgroundImage = src ? `url("${src}")` : "";
  });
}

function saveProfilePhoto(src) {
  profilePhoto = src;
  try {
    localStorage.setItem("radar-lipedema-profile-photo", src);
  } catch (error) {
    // A foto continua na tela mesmo se o navegador bloquear armazenamento local.
  }
  setProfilePhoto(src);
  saveProfileToServer({ name: document.querySelector("#home-title")?.textContent?.replace("Ol\u00e1, ", "") || "Ana", photoDataUrl: src });
}

function openAvatarPicker() {
  avatarInput?.click();
}

async function apiRequest(path, options = {}) {
  try {
    const response = await fetch(path, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return data || { ok: false, error: `HTTP ${response.status}` };
    }

    return data;
  } catch (error) {
    console.warn("API indispon\u00edvel:", error.message);
    return null;
  }
}

function collectPanelData(root = settingsPanelContent) {
  const fields = {};

  root.querySelectorAll("input, select, textarea").forEach((field, index) => {
    if (field.type === "file") {
      return;
    }

    const label = field.closest("label")?.textContent?.replace(/\s+/g, " ").trim();
    const key = field.name || field.placeholder || label || `campo_${index + 1}`;
    fields[key] = field.type === "checkbox" ? field.checked : field.value;
  });

  root.querySelectorAll("[data-habit-stepper]").forEach((row) => {
    fields[row.dataset.habitStepper] = {
      value: Number(row.dataset.value),
      unit: row.dataset.unit,
    };
  });

  const selectedCycleDay = root.querySelector(".mini-calendar .cycle-day.selected");
  if (selectedCycleDay) {
    fields.cycleDay = Number(selectedCycleDay.textContent);
  }

  return fields;
}

function saveRecordToServer(recordType, payload) {
  return apiRequest("/api/records", {
    method: "POST",
    body: { recordType, payload },
  });
}

function saveProfileToServer(profile) {
  return apiRequest("/api/profile", {
    method: "PUT",
    body: profile,
  });
}

function savePhotoToServer(slot, imageDataUrl) {
  return apiRequest("/api/photos", {
    method: "POST",
    body: { slot, imageDataUrl },
  });
}

async function loadServerState() {
  const data = await apiRequest("/api/bootstrap");
  if (!data || data.ok === false) {
    return;
  }

  if (data.profile?.name) {
    document.querySelector("#home-title").textContent = `Ol\u00e1, ${data.profile.name}`;
  }

  if (data.profile?.photoDataUrl) {
    profilePhoto = data.profile.photoDataUrl;
    setProfilePhoto(profilePhoto);
  }

  (data.photos || []).forEach((photo) => {
    photoSlotImages[photo.slot] = photo.imageDataUrl;
  });
}

function renderPhotoSlot(slot) {
  const captured = Boolean(photoSlotImages[slot.name]);
  const src = photoSlotImages[slot.name] || slot.placeholder;

  return `
    <button class="${captured ? "captured" : ""}" type="button" data-photo-slot="${slot.name}">
      <span class="photo-thumb ${slot.className} ${captured ? "has-photo" : ""}">
        <img src="${src}" alt="${captured ? `Foto ${slot.name}` : `Refer&ecirc;ncia ${slot.name}`}">
      </span>
      <span><strong>${slot.name}</strong><small>${captured ? "Foto adicionada" : "Toque na c&acirc;mera"}</small></span>
      <span class="camera-pill ${captured ? "done" : ""}" data-photo-status>
        <svg class="icon"><use href="#${captured ? "i-check" : "i-camera"}"></use></svg>
      </span>
    </button>
  `;
}

function updatePhotoSlotImage(slotName, photoSrc) {
  const row = settingsPanelContent.querySelector(`[data-photo-slot="${slotName}"]`);
  photoSlotImages[slotName] = photoSrc;

  if (!row) {
    return;
  }

  const thumb = row.querySelector(".photo-thumb");
  const image = thumb.querySelector("img");
  row.classList.add("captured");
  thumb.classList.add("has-photo");
  image.src = photoSrc;
  image.alt = `Foto ${slotName}`;
  row.querySelector("small").textContent = "Foto adicionada";
  row.querySelector("[data-photo-status]").classList.add("done");
  row.querySelector("[data-photo-status]").innerHTML = '<svg class="icon"><use href="#i-check"></use></svg>';
}

function closePhotoCamera() {
  if (activePhotoStream) {
    activePhotoStream.getTracks().forEach((track) => track.stop());
  }

  activePhotoStream = null;
  activePhotoSlot = "";
  settingsPanelContent.querySelector("[data-camera-capture]")?.remove();
}

function renderPhotoCamera(slotName) {
  closePhotoCamera();
  activePhotoSlot = slotName;
  settingsPanelContent.insertAdjacentHTML(
    "beforeend",
    `
      <div class="photo-camera-capture" data-camera-capture>
        <section class="camera-capture-card" aria-label="Camera para ${slotName}">
          <div class="camera-preview-frame">
            <video autoplay muted playsinline data-camera-preview></video>
            <span class="camera-loading">Abrindo c&acirc;mera...</span>
          </div>
          <div class="camera-action-row">
            <button class="panel-button" type="button" data-camera-action="capture">Tirar foto</button>
            <button class="panel-button secondary" type="button" data-camera-action="gallery">Galeria</button>
            <button class="panel-button secondary" type="button" data-camera-action="close">Cancelar</button>
          </div>
        </section>
      </div>
    `
  );
}

async function openPhotoCapture(slotName) {
  const fallbackInput = settingsPanelContent.querySelector(`[data-photo-input="${slotName}"]`);

  if (!navigator.mediaDevices?.getUserMedia) {
    fallbackInput?.click();
    return;
  }

  renderPhotoCamera(slotName);

  try {
    activePhotoStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
    const preview = settingsPanelContent.querySelector("[data-camera-preview]");
    const frame = settingsPanelContent.querySelector(".camera-preview-frame");
    preview.srcObject = activePhotoStream;
    await preview.play();
    frame?.classList.add("ready");
  } catch (error) {
    closePhotoCamera();
    showToast("C\u00e2mera bloqueada. Escolha da galeria.");
    fallbackInput?.click();
  }
}

function capturePhotoFromCamera() {
  const preview = settingsPanelContent.querySelector("[data-camera-preview]");
  if (!preview || !activePhotoSlot || !preview.videoWidth) {
    showToast("C\u00e2mera ainda abrindo");
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = preview.videoWidth;
  canvas.height = preview.videoHeight;
  canvas.getContext("2d").drawImage(preview, 0, 0, canvas.width, canvas.height);
  const photoSrc = canvas.toDataURL("image/jpeg", 0.9);
  const slotName = activePhotoSlot;
  updatePhotoSlotImage(slotName, photoSrc);
  savePhotoToServer(slotName, photoSrc);
  closePhotoCamera();
  showToast(`Foto ${slotName} tirada`);
}

function getComparisonTone(value) {
  if (value < 0) {
    return "positive";
  }

  if (value > 0) {
    return "warning";
  }

  return "neutral";
}

function renderPremiumResource(resourceId) {
  const data = buildPremiumDataset();
  const recordTotal = Object.values(data.records).reduce((total, value) => total + value, 0);
  const comparisonCards = [
    { label: "Dor", value: formatDelta(data.deltas.dor), note: "Intensidade comparada", tone: getComparisonTone(data.deltas.dor) },
    { label: "Edema", value: formatDelta(data.deltas.edema), note: "Incha&ccedil;o no ciclo", tone: getComparisonTone(data.deltas.edema) },
    { label: "Peso", value: formatDelta(data.deltas.peso, " kg"), note: "Varia&ccedil;&atilde;o corporal", tone: getComparisonTone(data.deltas.peso) },
    { label: "Coxa", value: formatDelta(data.deltas.coxa, " cm"), note: "Medida principal", tone: getComparisonTone(data.deltas.coxa) },
  ];
  const improvedCount = comparisonCards.filter((card) => card.tone === "positive").length;
  const warningCount = comparisonCards.filter((card) => card.tone === "warning").length;
  const comparisonSummary =
    improvedCount >= 3
      ? {
          title: "Ciclo com melhora consistente nos principais marcadores.",
          detail: "Os registros apontam evolu&ccedil;&atilde;o positiva em sintomas e medidas frente ao ciclo anterior.",
        }
      : warningCount >= 3
        ? {
            title: "Ciclo pede mais aten&ccedil;&atilde;o e acompanhamento.",
            detail: "Os sinais subiram em rela&ccedil;&atilde;o ao ciclo anterior; vale revisar rotina, h&aacute;bitos e tratamentos.",
          }
        : {
            title: "Ciclo com melhora parcial e alguns pontos de aten&ccedil;&atilde;o.",
            detail: "Use esse painel para enxergar padr&otilde;es antes de gerar o relat&oacute;rio completo.",
          };
  const pdfSections = [
    { title: "Resumo cl&iacute;nico", headline: "Sintoma predominante + evolu&ccedil;&atilde;o", detail: "Texto claro para levar na consulta." },
    { title: "Gr&aacute;ficos", headline: "Correla&ccedil;&atilde;o por ciclo e fase", detail: "Dor, edema, sensibilidade e humor." },
    { title: "Fotos e medidas", headline: "Comparativo visual + cent&iacute;metros", detail: "Frente, lado, costas e medidas corporais." },
    { title: "Dicas geradas", headline: data.insights[0], detail: "Baseado nos registros recentes." },
  ];
  const resourceTemplates = {
    "cycle-comparison": {
      title: "Comparativos entre ciclos",
      content: `
        <div class="premium-resource-panel">
          <article class="premium-output-hero comparison-hero">
            <div class="premium-hero-top">
              <span>Score atual</span>
              <b>${data.status}</b>
            </div>
            <strong>${data.score}<small>/100</small></strong>
            <div class="premium-score-track" style="--score:${data.score}%;"><i></i></div>
            <p>Comparativo gerado com ${recordTotal} registros conectados entre sintomas, medidas, h&aacute;bitos e ciclo.</p>
          </article>
          <div class="comparison-grid">
            ${comparisonCards.map((card) => `
              <article class="delta-card ${card.tone}">
                <span>${card.label}</span>
                <strong>${card.value}</strong>
                <small>${card.note}</small>
                <em>${card.tone === "positive" ? "Melhorou" : card.tone === "warning" ? "Aten&ccedil;&atilde;o" : "Est&aacute;vel"}</em>
              </article>
            `).join("")}
          </div>
          <article class="comparison-summary">
            <span>Leitura do ciclo</span>
            <strong>${comparisonSummary.title}</strong>
            <p>${comparisonSummary.detail}</p>
          </article>
          <div class="cycle-comparison-list">
            ${data.cycleIndex.map((cycle, index) => `
              <article>
                <i class="cycle-dot ${index === 0 ? "current" : ""}"></i>
                <div>
                  <span>${cycle.label}</span>
                  <strong>Dor ${cycle.dor}/10 - Edema ${cycle.edema}/10</strong>
                  <small>Peso ${cycle.peso.toFixed(1).replace(".", ",")} kg | Coxa ${cycle.coxa.toFixed(1).replace(".", ",")} cm</small>
                  <div class="cycle-metric-bar" style="--bar:${cycle.adesao}%;"><b></b><em>Ader&ecirc;ncia ${cycle.adesao}%</em></div>
                </div>
              </article>
            `).join("")}
          </div>
        </div>
      `,
    },
    "pdf-report": {
      title: "Relat&oacute;rio detalhado em PDF",
      content: `
        <div class="premium-resource-panel">
          <article class="premium-output-hero pdf-hero">
            <div class="premium-hero-top">
              <span>PDF profissional</span>
              <b>Pronto</b>
            </div>
            <strong>${data.score}<small>/100</small></strong>
            <div class="premium-score-track" style="--score:${data.score}%;"><i></i></div>
            <p>Relat&oacute;rio feminino, organizado e individual, com score, sintomas, edema, medidas, tratamentos, h&aacute;bitos, fotos e ciclo.</p>
          </article>
          <div class="pdf-section-list">
            ${pdfSections.map((section, index) => `
              <article>
                <b>${String(index + 1).padStart(2, "0")}</b>
                <div>
                  <span>${section.title}</span>
                  <strong>${section.headline}</strong>
                  <small>${section.detail}</small>
                </div>
              </article>
            `).join("")}
          </div>
          <div class="premium-action-footer">
            <button class="panel-button" type="button" data-panel-action="export-pdf">Gerar PDF</button>
            <small>Arquivo com capa, resumo, comparativos e dicas geradas pelos registros.</small>
          </div>
        </div>
      `,
    },
    "data-export": {
      title: "Exporta&ccedil;&atilde;o de dados",
      content: `
        <div class="premium-resource-panel">
          <article class="premium-output-hero">
            <span>Pacote de dados</span>
            <strong>${recordTotal}<small> registros</small></strong>
            <p>Exporta&ccedil;&atilde;o estruturada para backup, an&aacute;lise ou relat&oacute;rio profissional.</p>
          </article>
          <div class="export-schema">
            ${Object.entries(data.records).map(([key, value]) => `<span>${key}<strong>${value}</strong></span>`).join("")}
          </div>
          <div class="export-format-list">
            <article>
              <strong>CSV</strong>
              <span>Planilha com score, sintomas, ciclos e registros.</span>
              <small>radar-lipedema-dados.csv</small>
            </article>
            <article>
              <strong>JSON</strong>
              <span>Dados estruturados para backup ou integra&ccedil;&atilde;o.</span>
              <small>radar-lipedema-dados.json</small>
            </article>
          </div>
          <div class="settings-action-row">
            <button class="panel-button" type="button" data-panel-action="export-csv">Exportar CSV</button>
            <button class="panel-button secondary" type="button" data-panel-action="export-json">Exportar JSON</button>
          </div>
        </div>
      `,
    },
  };

  return resourceTemplates[resourceId];
}

function updatePremiumSummaries() {
  const data = buildPremiumDataset();
  const recordTotal = Object.values(data.records).reduce((total, value) => total + value, 0);
  const summaries = {
    "cycle-comparison": `${data.cycleIndex.length} ciclos - score ${data.score}/100`,
    "pdf-report": `${recordTotal} registros para PDF`,
    "data-export": `CSV + JSON - ${recordTotal} registros`,
  };

  Object.entries(summaries).forEach(([key, value]) => {
    const target = document.querySelector(`[data-premium-summary="${key}"]`);
    if (target) {
      target.textContent = value;
    }
  });
}

function downloadFile(filename, mimeType, content) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeReportText(value) {
  return String(value)
    .replace(/&aacute;/g, "a")
    .replace(/&eacute;/g, "e")
    .replace(/&iacute;/g, "i")
    .replace(/&oacute;/g, "o")
    .replace(/&uacute;/g, "u")
    .replace(/&atilde;/g, "a")
    .replace(/&ccedil;/g, "c")
    .replace(/&ecirc;/g, "e")
    .replace(/&otilde;/g, "o")
    .replace(/&Aacute;/g, "A")
    .replace(/&Eacute;/g, "E")
    .replace(/&Iacute;/g, "I")
    .replace(/&Oacute;/g, "O")
    .replace(/&Uacute;/g, "U")
    .replace(/&Atilde;/g, "A")
    .replace(/&Ccedil;/g, "C")
    .replace(/&Ecirc;/g, "E")
    .replace(/&Otilde;/g, "O")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function escapePdfText(value) {
  return normalizeReportText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function createSimplePdf(lines) {
  const pageWidth = 595;
  const pageHeight = 842;
  const contentLines = [];
  let y = 790;

  lines.forEach((line) => {
    const text = escapePdfText(line.text || "");
    const size = line.size || 11;
    const leading = line.leading || size + 8;
    contentLines.push(`BT /F1 ${size} Tf ${line.x || 48} ${y} Td (${text}) Tj ET`);
    y -= leading;
  });

  const stream = contentLines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function getReportLines() {
  const data = buildPremiumDataset();
  const totalRecords = Object.values(data.records).reduce((total, value) => total + value, 0);

  return [
    { text: "Radar Lipedema - Relatorio Premium", size: 20, leading: 28 },
    { text: `Gerado em: ${data.generatedAt}`, size: 10, leading: 22 },
    { text: `Score de evolucao: ${data.score}/100 - ${data.status}`, size: 15, leading: 26 },
    { text: `Total de registros analisados: ${totalRecords}`, size: 12, leading: 24 },
    { text: "Resumo dos registros", size: 14, leading: 22 },
    ...Object.entries(data.records).map(([key, value]) => ({ text: `${key}: ${value}`, size: 11, leading: 17 })),
    { text: "Comparativo entre ciclos", size: 14, leading: 24 },
    ...data.cycleIndex.map((cycle) => ({
      text: `${cycle.label}: dor ${cycle.dor}/10, edema ${cycle.edema}/10, sensibilidade ${cycle.sensibilidade}/10, peso ${cycle.peso} kg, aderencia ${cycle.adesao}%`,
      size: 10,
      leading: 17,
    })),
    { text: "Insights e dicas geradas", size: 14, leading: 24 },
    ...data.insights.map((insight) => ({ text: `- ${insight}`, size: 10, leading: 17 })),
    { text: "Observacao: este relatorio apoia acompanhamento e nao substitui avaliacao profissional.", size: 9, leading: 14 },
  ];
}

function pdfColor([red, green, blue]) {
  return `${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)}`;
}

function pdfRect(x, y, width, height, fill, stroke = null) {
  const fillCommand = fill ? `q ${pdfColor(fill)} rg ${x} ${y} ${width} ${height} re f Q` : "";
  const strokeCommand = stroke ? `q ${pdfColor(stroke)} RG 1 w ${x} ${y} ${width} ${height} re S Q` : "";
  return [fillCommand, strokeCommand].filter(Boolean).join("\n");
}

function pdfText(text, x, y, size = 11, color = [0.13, 0.09, 0.16], font = "F1") {
  return `BT /${font} ${size} Tf ${pdfColor(color)} rg ${x} ${y} Td (${escapePdfText(text)}) Tj ET`;
}

function wrapReportLine(text, maxLength = 72) {
  const words = normalizeReportText(text).split(" ");
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length > maxLength) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }

    currentLine = nextLine;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function createPremiumReportPdf() {
  const data = buildPremiumDataset();
  const totalRecords = Object.values(data.records).reduce((total, value) => total + value, 0);
  const commands = [];
  const pageWidth = 595;
  const pageHeight = 842;
  const pink = [0.91, 0.23, 0.55];
  const purple = [0.43, 0.20, 0.85];
  const lavender = [0.96, 0.92, 1.0];
  const softPink = [1.0, 0.93, 0.97];
  const ink = [0.13, 0.09, 0.16];
  const muted = [0.43, 0.38, 0.49];
  const line = [0.90, 0.84, 0.95];

  commands.push(pdfRect(0, 0, pageWidth, pageHeight, [1.0, 0.985, 1.0]));
  commands.push(pdfRect(0, 748, pageWidth, 94, lavender));
  commands.push(pdfRect(0, 748, pageWidth, 10, pink));
  commands.push(pdfRect(412, 748, 183, 94, [0.89, 0.78, 1.0]));
  commands.push(pdfText("Radar Lipedema", 42, 807, 24, purple, "F2"));
  commands.push(pdfText("Relatorio Premium", 42, 784, 15, ink, "F2"));
  commands.push(pdfText(`Gerado em ${data.generatedAt}`, 42, 765, 10, muted));
  commands.push(pdfText(`${data.score}`, 438, 800, 34, ink, "F2"));
  commands.push(pdfText("/100", 492, 802, 13, muted, "F2"));
  commands.push(pdfText(data.status, 440, 780, 13, purple, "F2"));

  commands.push(pdfText("Score de evolucao", 42, 719, 15, ink, "F2"));
  commands.push(pdfText("Uma leitura consolidada de sintomas, edema, medidas, peso, habitos, fotos e ciclo.", 42, 700, 10, muted));
  commands.push(pdfRect(42, 681, 510, 10, [0.93, 0.90, 0.96]));
  commands.push(pdfRect(42, 681, Math.round(510 * (data.score / 100)), 10, pink));

  commands.push(pdfText("Resumo dos registros", 42, 646, 15, ink, "F2"));
  const recordLabels = [
    ["Sintomas", data.records.sintomas],
    ["Edema", data.records.edema],
    ["Medidas", data.records.medidas],
    ["Peso", data.records.peso],
    ["Tratamentos", data.records.tratamentos],
    ["Habitos", data.records.habitos],
    ["Fotos", data.records.fotos],
    ["Ciclo", data.records.ciclo],
  ];
  recordLabels.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? 42 : 304;
    const y = 607 - row * 43;
    commands.push(pdfRect(x, y, 248, 32, [1, 1, 1], line));
    commands.push(pdfText(label, x + 14, y + 19, 10, muted, "F2"));
    commands.push(pdfText(String(value), x + 204, y + 18, 14, purple, "F2"));
  });

  commands.push(pdfText("Comparativo entre ciclos", 42, 414, 15, ink, "F2"));
  commands.push(pdfRect(42, 390, 510, 24, purple));
  ["Ciclo", "Dor", "Edema", "Sens.", "Peso", "Adesao"].forEach((title, index) => {
    const x = [54, 222, 274, 334, 400, 472][index];
    commands.push(pdfText(title, x, 398, 10, [1, 1, 1], "F2"));
  });
  data.cycleIndex.forEach((cycle, index) => {
    const y = 357 - index * 35;
    commands.push(pdfRect(42, y, 510, 30, index % 2 === 0 ? [1, 1, 1] : [0.99, 0.97, 1.0], line));
    commands.push(pdfText(cycle.label, 54, y + 11, 9, ink, "F2"));
    commands.push(pdfText(`${cycle.dor}/10`, 224, y + 11, 9, muted));
    commands.push(pdfText(`${cycle.edema}/10`, 276, y + 11, 9, muted));
    commands.push(pdfText(`${cycle.sensibilidade}/10`, 338, y + 11, 9, muted));
    commands.push(pdfText(`${cycle.peso.toFixed(1)} kg`, 396, y + 11, 9, muted));
    commands.push(pdfText(`${cycle.adesao}%`, 480, y + 11, 9, muted));
  });

  commands.push(pdfText("Insights e dicas geradas", 42, 252, 15, ink, "F2"));
  let insightY = 212;
  data.insights.forEach((insight, index) => {
    commands.push(pdfRect(42, insightY - 8, 510, 36, index === 0 ? softPink : [1, 1, 1], line));
    commands.push(pdfRect(54, insightY + 4, 10, 10, index === 0 ? pink : purple));
    wrapReportLine(insight, 74).slice(0, 2).forEach((lineText, lineIndex) => {
      commands.push(pdfText(lineText, 74, insightY + 4 - lineIndex * 13, 9, ink));
    });
    insightY -= 47;
  });

  commands.push(pdfRect(42, 38, 510, 38, [0.98, 0.95, 1.0], line));
  commands.push(pdfText("Observacao", 58, 60, 10, purple, "F2"));
  commands.push(pdfText("Este relatorio apoia acompanhamento e nao substitui avaliacao profissional.", 58, 47, 9, muted));
  commands.push(pdfText(`Total analisado: ${totalRecords} registros`, 420, 23, 9, muted));

  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function downloadPdfReport() {
  downloadFile("radar-lipedema-relatorio.pdf", "application/pdf", createPremiumReportPdf());
}

function downloadJsonExport() {
  downloadFile(
    "radar-lipedema-dados.json",
    "application/json",
    JSON.stringify(buildPremiumDataset(), null, 2)
  );
}

function downloadCsvExport() {
  const data = buildPremiumDataset();
  const rows = [
    ["tipo", "campo", "valor"],
    ["score", "score", data.score],
    ["score", "status", normalizeReportText(data.status)],
    ...Object.entries(data.records).map(([key, value]) => ["registros", key, value]),
    ...data.cycleIndex.flatMap((cycle) => [
      [cycle.label, "dor", cycle.dor],
      [cycle.label, "edema", cycle.edema],
      [cycle.label, "sensibilidade", cycle.sensibilidade],
      [cycle.label, "humor", cycle.humor],
      [cycle.label, "peso", cycle.peso],
      [cycle.label, "coxa", cycle.coxa],
      [cycle.label, "adesao", cycle.adesao],
    ]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadFile("radar-lipedema-dados.csv", "text/csv;charset=utf-8", csv);
}

const settingsPanels = {
  profile: {
    title: "Perfil",
    content: `
      <form class="settings-form" data-panel-form="profile">
        <div class="profile-photo-card">
          <button class="avatar profile-avatar" type="button" data-avatar-trigger aria-label="Alterar foto do perfil">
            <span data-avatar-initial>A</span>
          </button>
          <div>
            <strong>Foto do perfil</strong>
            <p>Toque para escolher uma imagem da galeria.</p>
          </div>
        </div>
        <label class="settings-field">Nome
          <input name="name" value="Ana" autocomplete="name">
        </label>
        <label class="settings-field">E-mail
          <input name="email" type="email" value="ana@email.com" autocomplete="email">
        </label>
        <label class="settings-field">Objetivo
          <select name="goal">
            <option>Entender padr&otilde;es do ciclo</option>
            <option>Reduzir sintomas</option>
            <option>Acompanhar tratamento</option>
          </select>
        </label>
        <div class="settings-action-row">
          <button class="panel-button" type="submit">Salvar perfil</button>
          <button class="panel-button secondary" type="button" data-panel-action="avatar">Alterar foto</button>
        </div>
      </form>
    `,
  },
  cycle: {
    title: "Prefer&ecirc;ncias do ciclo",
    content: `
      <div class="settings-form">
        <label class="settings-field">Dura&ccedil;&atilde;o do ciclo
          <div class="stepper-row" data-stepper="cycleLength">
            <button type="button" data-step="-1">-</button>
            <output>28 dias</output>
            <button type="button" data-step="1">+</button>
          </div>
        </label>
        <label class="settings-field">Dura&ccedil;&atilde;o da menstrua&ccedil;&atilde;o
          <div class="stepper-row" data-stepper="periodLength">
            <button type="button" data-step="-1">-</button>
            <output>5 dias</output>
            <button type="button" data-step="1">+</button>
          </div>
        </label>
        <div class="panel-list">
          <div class="panel-row"><span>Previs&atilde;o autom&aacute;tica<small>Usar registros para estimar fases</small></span><label class="switch"><input type="checkbox" checked><i></i></label></div>
          <div class="panel-row"><span>Marcar ciclo irregular<small>Ajusta alertas e insights</small></span><label class="switch"><input type="checkbox"><i></i></label></div>
        </div>
        <button class="panel-button" type="button" data-panel-action="save-cycle">Salvar prefer&ecirc;ncias</button>
      </div>
    `,
  },
  reminders: {
    title: "Lembretes",
    content: `
      <div class="settings-form">
        <div class="panel-list">
          <div class="panel-row"><span>Registrar sintomas<small>Todos os dias &agrave;s 20:00</small></span><label class="switch"><input type="checkbox" checked><i></i></label></div>
          <div class="panel-row"><span>In&iacute;cio do ciclo<small>Alertar previs&atilde;o menstrual</small></span><label class="switch"><input type="checkbox" checked><i></i></label></div>
          <div class="panel-row"><span>Insights semanais<small>Resumo aos domingos</small></span><label class="switch"><input type="checkbox"><i></i></label></div>
        </div>
        <label class="settings-field">Hor&aacute;rio principal
          <input type="time" value="20:00">
        </label>
        <button class="panel-button" type="button" data-panel-action="save-reminders">Salvar lembretes</button>
      </div>
    `,
  },
  goals: {
    title: "Meta de sintomas",
    content: `
      <div class="settings-form">
        <article class="settings-mini-card">
          <strong>Meta atual</strong>
          <p>Manter dor e edema abaixo de 5/10 durante a fase l&uacute;tea.</p>
        </article>
        <label class="range-line" style="--color: #f43f82">
          <span>Dor m&aacute;xima <output>5</output></span>
          <input type="range" min="0" max="10" value="5">
        </label>
        <label class="range-line" style="--color: #8b5cf6">
          <span>Edema m&aacute;ximo <output>5</output></span>
          <input type="range" min="0" max="10" value="5">
        </label>
        <button class="panel-button" type="button" data-panel-action="save-goals">Salvar meta</button>
      </div>
    `,
  },
  premium: {
    title: "Plano Premium",
    content: `
      <div class="settings-form">
        <article class="settings-mini-card premium-panel">
          <strong>Premium ativo</strong>
          <p>Insights avan&ccedil;ados, relat&oacute;rios em PDF, comparativos e exporta&ccedil;&atilde;o de dados.</p>
        </article>
        <div class="panel-list">
          <div class="panel-row"><span>Status<small>Renova em 14/08/2026</small></span><strong>Ativo</strong></div>
          <button type="button" data-panel-action="invoice">Ver recibo</button>
          <button type="button" data-panel-action="manage-plan">Gerenciar assinatura</button>
        </div>
      </div>
    `,
  },
  backup: {
    title: "Backup e dados",
    content: `
      <div class="settings-form">
        <article class="settings-mini-card">
          <strong>&Uacute;ltimo backup</strong>
          <p><span class="backup-status" data-backup-status>Hoje, 09:41</span></p>
        </article>
        <div class="settings-action-row">
          <button class="panel-button" type="button" data-panel-action="run-backup">Fazer backup agora</button>
          <button class="panel-button secondary" type="button" data-panel-action="export-csv">Exportar CSV</button>
          <button class="panel-button secondary" type="button" data-panel-action="export-pdf">Exportar PDF</button>
        </div>
      </div>
    `,
  },
  privacy: {
    title: "Privacidade",
    content: `
      <div class="settings-form">
        <div class="panel-list">
          <div class="panel-row"><span>Bloqueio por senha<small>Solicitar ao abrir o app</small></span><label class="switch"><input type="checkbox" checked><i></i></label></div>
          <div class="panel-row"><span>Dados an&ocirc;nimos<small>Ajudar a melhorar os insights</small></span><label class="switch"><input type="checkbox"><i></i></label></div>
          <button type="button" data-panel-action="change-password">Alterar senha</button>
          <button type="button" data-panel-action="delete-data">Apagar dados locais</button>
        </div>
      </div>
    `,
  },
  support: {
    title: "Ajuda e suporte",
    content: `
      <div class="settings-form">
        <div class="panel-list">
          <button type="button" data-panel-action="faq">Perguntas frequentes</button>
          <button type="button" data-panel-action="contact">Falar com suporte</button>
          <button type="button" data-panel-action="tutorial">Ver tutorial do app</button>
        </div>
        <article class="settings-mini-card">
          <strong>Suporte priorit&aacute;rio</strong>
          <p>Tempo estimado de resposta: 2 horas.</p>
        </article>
      </div>
    `,
  },
};
const registerPanels = {
  pain: {
    title: "Registrar dor",
    render() {
      const painValue = Number(document.querySelector('[data-symptom="dor"]')?.value || 4);
      const painLabel = getPainLabel(painValue);
      const painPercent = painValue * 10;
      return `
        <div class="pain-register-panel">
          <section class="pain-level-card" style="--pain-fill:${painPercent}%; --pain-progress:${painPercent}">
            <div class="pain-panel-heading">
              <p class="panel-question">Como est&aacute; sua dor hoje?</p>
              <span class="pain-status-pill" data-pain-detail-label>${painLabel}</span>
            </div>
            <div class="pain-meter" data-pain-meter>
              <svg viewBox="0 0 240 142" aria-hidden="true">
                <defs>
                  <linearGradient id="pain-meter-gradient" x1="34" y1="116" x2="206" y2="116" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#2dbd61"></stop>
                    <stop offset="62%" stop-color="#ff9f2d"></stop>
                    <stop offset="100%" stop-color="#ff3d42"></stop>
                  </linearGradient>
                </defs>
                <path class="meter-track" pathLength="100" d="M34 116A86 86 0 0 1 206 116"></path>
                <path class="meter-progress" pathLength="100" d="M34 116A86 86 0 0 1 206 116"></path>
              </svg>
              <div class="pain-score">
                <strong data-pain-detail-value>${painValue}</strong>
                <span>/10</span>
                <small>intensidade</small>
              </div>
            </div>
            <div class="pain-scale">
              <span>0</span>
              <span>Leve</span>
              <span>Moderada</span>
              <span>Intensa</span>
            </div>
            <input class="pain-detail-range" style="--pain-fill:${painPercent}%" type="range" min="0" max="10" value="${painValue}" data-pain-detail-range aria-label="Intensidade da dor">
          </section>

          <p class="panel-question">Onde voc&ecirc; sente dor?</p>
          <div class="body-picker-card">
            <div class="pain-body-grid">
              <figure class="pain-body-option active">
                <img class="pain-body-map" src="imagem/radar-frente-card.png" alt="Mapa de dor na frente do corpo">
                <figcaption>Frente</figcaption>
              </figure>
              <figure class="pain-body-option">
                <img class="pain-body-map" src="imagem/radar-costas-card.png" alt="Mapa de dor nas costas do corpo">
                <figcaption>Costas</figcaption>
              </figure>
            </div>
            <button class="panel-button secondary edit-areas-button" type="button" data-panel-action="edit-pain-areas">
              <svg class="icon"><use href="#i-edit"></use></svg>
              Editar &aacute;reas
            </button>
          </div>

          <label class="settings-field pain-note-field"><span>Observa&ccedil;&otilde;es <small>(opcional)</small></span>
            <textarea placeholder="Como voc&ecirc; descreveria sua dor hoje?"></textarea>
          </label>
          <button class="panel-button" type="button" data-panel-action="save-pain">Salvar dor</button>
        </div>
      `;
    },
  },
  edema: {
    title: "Registrar edema",
    render() {
      return `
        <div class="smart-register-panel">
          <article class="register-data-card">
            <span class="register-item-icon edema"><svg class="icon"><use href="#i-drop"></use></svg></span>
            <div>
              <strong>Edema de hoje</strong>
              <p>Use esse dado para cruzar incha&ccedil;o com ciclo, peso, h&aacute;bitos e tratamentos.</p>
            </div>
          </article>
          <label class="range-line" style="--color:#8b5cf6">
            <span>N&iacute;vel de incha&ccedil;o <output>5</output></span>
            <input type="range" min="0" max="10" value="5" data-edema-level>
          </label>
          <p class="panel-question">Onde voc&ecirc; sente edema?</p>
          <div class="body-picker-card">
            <div class="pain-body-grid">
              <figure class="pain-body-option active">
                <img class="pain-body-map" src="imagem/radar-frente-card.png" alt="Mapa de edema na frente do corpo">
                <figcaption>Frente</figcaption>
              </figure>
              <figure class="pain-body-option">
                <img class="pain-body-map" src="imagem/radar-costas-card.png" alt="Mapa de edema nas costas do corpo">
                <figcaption>Costas</figcaption>
              </figure>
            </div>
            <button class="panel-button secondary edit-areas-button" type="button" data-panel-action="edit-edema-areas">
              <svg class="icon"><use href="#i-edit"></use></svg>
              Editar &aacute;reas
            </button>
          </div>
          <label class="settings-field pain-note-field"><span>Observa&ccedil;&otilde;es <small>(opcional)</small></span>
            <textarea placeholder="Observa&ccedil;&otilde;es sobre o edema de hoje"></textarea>
          </label>
          <button class="panel-button" type="button" data-panel-action="save-edema">Salvar edema</button>
        </div>
      `;
    },
  },
  measures: {
    title: "Registrar medidas",
    render() {
      const measures = [
        ["Coxa direita", "61,0"],
        ["Coxa esquerda", "60,5"],
        ["Joelho direito", "40,0"],
        ["Joelho esquerdo", "39,5"],
        ["Panturrilha direita", "37,2"],
        ["Panturrilha esquerda", "36,8"],
        ["Tornozelo direito", "23,0"],
        ["Tornozelo esquerdo", "22,8"],
      ];
      return `
        <div class="smart-register-panel">
          <article class="register-data-card">
            <span class="register-item-icon measures"><svg class="icon"><use href="#i-edit"></use></svg></span>
            <div>
              <strong>Medidas corporais</strong>
              <p>Alimenta gr&aacute;ficos de evolu&ccedil;&atilde;o e relat&oacute;rios para consulta.</p>
            </div>
          </article>
          <div class="measure-list">
            ${measures.map(([label, value]) => `
              <label class="measure-row">
                <span>${label}</span>
                <input inputmode="decimal" value="${value}">
                <small>cm</small>
              </label>
            `).join("")}
          </div>
          <button class="panel-button" type="button" data-panel-action="save-measures">Salvar medidas</button>
        </div>
      `;
    },
  },
  weight: {
    title: "Registrar peso",
    render() {
      return `
        <div class="smart-register-panel weight-register-panel">
          <article class="weight-value-card">
            <span>Peso atual</span>
            <strong>67,3 <small>kg</small></strong>
            <p><b>-0,4 kg</b> vs ontem</p>
          </article>
          <div class="weight-actions">
            <button type="button" data-panel-action="weight-minus">-</button>
            <button type="button" data-panel-action="weight-plus">+</button>
          </div>
          <label class="settings-field pain-note-field"><span>Observa&ccedil;&otilde;es <small>(opcional)</small></span>
            <textarea placeholder="Algo mudou na rotina, alimenta&ccedil;&atilde;o ou reten&ccedil;&atilde;o?"></textarea>
          </label>
          <button class="panel-button" type="button" data-panel-action="save-weight">Salvar peso</button>
        </div>
      `;
    },
  },
  treatments: {
    title: "Registrar tratamentos",
    render() {
      return `
        <div class="smart-register-panel">
          <div class="panel-list checklist-panel">
            <label class="panel-row"><span>Drenagem linf&aacute;tica<small>Realizada hoje</small></span><input type="checkbox" checked></label>
            <label class="panel-row"><span>Pressoterapia<small>Sess&atilde;o ou equipamento</small></span><input type="checkbox" checked></label>
            <label class="panel-row"><span>LPG<small>Tratamento complementar</small></span><input type="checkbox"></label>
            <label class="panel-row"><span>Fisioterapia<small>Mobilidade e dor</small></span><input type="checkbox" checked></label>
            <label class="panel-row"><span>Exerc&iacute;cio<small>Muscula&ccedil;&atilde;o, caminhada</small></span><input type="checkbox" checked></label>
            <label class="panel-row"><span>Meia compressiva<small>Uso cont&iacute;nuo</small></span><input type="checkbox"></label>
            <label class="panel-row"><span>Medicamentos<small>Conforme prescri&ccedil;&atilde;o</small></span><input type="checkbox"></label>
            <label class="panel-row"><span>Suplementos<small>Conforme orienta&ccedil;&atilde;o</small></span><input type="checkbox"></label>
          </div>
          <label class="settings-field pain-note-field"><span>Observa&ccedil;&otilde;es <small>(opcional)</small></span>
            <textarea placeholder="Ex.: drenagem com terapeuta X"></textarea>
          </label>
          <button class="panel-button" type="button" data-panel-action="save-treatments">Salvar tratamentos</button>
        </div>
      `;
    },
  },
  habits: {
    title: "Registrar h&aacute;bitos",
    render() {
      return `
        <div class="smart-register-panel">
          <div class="panel-list habit-panel">
            <div class="panel-row" data-habit-stepper="water" data-value="2" data-min="0" data-max="5" data-step-size="0.25" data-unit="litros"><span>&Aacute;gua<small data-habit-value>2 litros</small></span><span class="stepper-inline"><button type="button" data-habit-step="-1">-</button><button type="button" data-habit-step="1">+</button></span></div>
            <div class="panel-row"><span>Meia compressiva<small>Usou hoje?</small></span><label class="switch"><input type="checkbox" checked><i></i></label></div>
            <div class="panel-row"><span>Exerc&iacute;cios<small>Caminhada</small></span><svg class="icon"><use href="#i-arrow"></use></svg></div>
            <div class="panel-row" data-habit-stepper="sleep" data-value="7" data-min="0" data-max="12" data-step-size="0.5" data-unit="horas"><span>Sono<small data-habit-value>7 horas</small></span><span class="stepper-inline"><button type="button" data-habit-step="-1">-</button><button type="button" data-habit-step="1">+</button></span></div>
            <div class="panel-row"><span>Alimenta&ccedil;&atilde;o anti-inflamat&oacute;ria<small>Marcada no dia</small></span><label class="switch"><input type="checkbox" checked><i></i></label></div>
          </div>
          <button class="panel-button" type="button" data-panel-action="save-habits">Salvar h&aacute;bitos</button>
        </div>
      `;
    },
  },
  "symptoms-extra": {
    title: "Registrar sintomas",
    render() {
      return `
        <div class="smart-register-panel">
          <div class="panel-list symptom-extra-panel">
            <div class="panel-row"><span>Hematomas<small>Manchas ou roxos novos</small></span><label class="switch"><input type="checkbox" checked><i></i></label></div>
            <label class="settings-field">Onde?
              <select>
                <option>Coxa esquerda</option>
                <option>Coxa direita</option>
                <option>Panturrilha</option>
              </select>
            </label>
            <label class="range-line" style="--color:#f59e2e">
              <span>Sensibilidade ao toque <output>6</output></span>
              <input type="range" min="0" max="10" value="6">
            </label>
            <label class="settings-field">Mobilidade
              <select>
                <option>Boa</option>
                <option>Reduzida</option>
                <option>Limitada</option>
              </select>
            </label>
            <label class="range-line" style="--color:#8b5cf6">
              <span>Peso nas pernas <output>7</output></span>
              <input type="range" min="0" max="10" value="7">
            </label>
          </div>
          <label class="settings-field pain-note-field"><span>Outros sintomas <small>(opcional)</small></span>
            <textarea placeholder="Ex.: cansa&ccedil;o, incha&ccedil;o abdominal"></textarea>
          </label>
          <button class="panel-button" type="button" data-panel-action="save-symptoms-extra">Salvar sintomas</button>
        </div>
      `;
    },
  },
  "cycle-record": {
    title: "Registrar ciclo",
    render() {
      return `
        <div class="smart-register-panel">
          <article class="register-data-card">
            <span class="register-item-icon cycle"><svg class="icon"><use href="#i-calendar"></use></svg></span>
            <div>
              <strong>Julho 2026</strong>
              <p>Ciclo ajuda o app a encontrar padr&otilde;es de dor, edema e sensibilidade.</p>
            </div>
          </article>
          <div class="mini-calendar" aria-label="Calendario do ciclo">
            ${["D","S","T","Q","Q","S","S"].map((day) => `<b>${day}</b>`).join("")}
            ${Array.from({ length: 28 }, (_, index) => {
              const day = index + 1;
              const className = [14, 15, 16, 17, 18, 19].includes(day) ? "cycle-day marked" : day === 20 ? "cycle-day ovulation" : "cycle-day";
              return `<button class="${className}" type="button">${day}</button>`;
            }).join("")}
          </div>
          <div class="cycle-legend">
            <span><i class="period"></i>Menstrua&ccedil;&atilde;o</span>
            <span><i class="pms"></i>TPM</span>
            <span><i class="ovulation"></i>Ovula&ccedil;&atilde;o</span>
          </div>
          <button class="panel-button" type="button" data-panel-action="save-cycle-record">Salvar ciclo</button>
        </div>
      `;
    },
  },
  photos: {
    title: "Registrar fotos",
    render() {
      return `
        <div class="photo-register-panel">
          <p class="photo-guidance">Tire fotos na mesma posi&ccedil;&atilde;o e ilumina&ccedil;&atilde;o para comparar.</p>
          <div class="photo-list">
            ${photoSlotTemplates.map(renderPhotoSlot).join("")}
          </div>
          <div class="photo-capture-inputs">
            ${photoSlotTemplates.map((slot) => `<input class="photo-capture-input" type="file" accept="image/*" data-photo-input="${slot.name}">`).join("")}
          </div>
          <label class="settings-field">Observa&ccedil;&otilde;es <small>(opcional)</small>
            <input placeholder="Observa&ccedil;&otilde;es sobre as fotos">
          </label>
          <button class="panel-button" type="button" data-panel-action="save-photos">Salvar fotos</button>
        </div>
      `;
    },
  },
};
const stepperValues = {
  cycleLength: { value: 28, min: 21, max: 35, label: "dias" },
  periodLength: { value: 5, min: 2, max: 9, label: "dias" },
};

function setActiveButton(buttons, screenId) {
  buttons.forEach((button) => {
    const isActive = button.dataset.target === screenId;
    button.classList.toggle("active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function showScreen(screenId) {
  screens.forEach((screen) => {
    screen.classList.toggle("active", screen.id === screenId);
  });

  phone.dataset.screen = screenId;
  setActiveButton(bottomButtons, screenId === "login" ? "home" : screenId);
}

function setTab(group, tabName) {
  const buttons = Array.from(group.querySelectorAll("[data-tab]"));
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });

  if (group.dataset.tabGroup === "register") {
    document.querySelector('[data-panel="cycle"]').classList.toggle("active", tabName === "cycle");
    document.querySelector('[data-panel="symptoms"]').classList.add("active");
    return;
  }

  if (group.dataset.tabGroup === "history") {
    document.querySelectorAll("#history [data-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.panel === tabName);
    });
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function openSettingsPanel(panelId) {
  const panel = settingsPanels[panelId];
  if (!panel) {
    return;
  }

  settingsPanelTitle.innerHTML = panel.title;
  settingsPanelContent.innerHTML = panel.content;
  setProfilePhoto(profilePhoto);
  settingsSheet.classList.add("open");
  settingsSheet.setAttribute("aria-hidden", "false");
}

function openRegisterPanel(panelId) {
  const panel = registerPanels[panelId];
  if (!panel) {
    return;
  }

  settingsPanelTitle.innerHTML = panel.title;
  settingsPanelContent.innerHTML = panel.render();
  settingsSheet.classList.add("open");
  settingsSheet.setAttribute("aria-hidden", "false");
}

function closeSettingsPanel() {
  closePhotoCamera();
  settingsSheet.classList.remove("open");
  settingsSheet.setAttribute("aria-hidden", "true");
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.target;
    if (target) {
      showScreen(target);
    }
  });
});

document.querySelectorAll("[data-target][tabindex]").forEach((item) => {
  item.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      showScreen(item.dataset.target);
    }
  });
});

function renderEmailVerificationPanel(email) {
  settingsPanelTitle.textContent = "Confirme seu e-mail";
  settingsPanelContent.innerHTML = `
    <div class="settings-form">
      <article class="settings-mini-card">
        <strong>Enviamos um código</strong>
        <p>Digite o código de 6 dígitos que enviamos para <b>${email}</b> para confirmar sua conta.</p>
      </article>
      <label class="settings-field">
        <span>Código de verificação</span>
        <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="000000" data-verify-code-input autocomplete="one-time-code">
      </label>
      <div class="settings-action-row">
        <button class="panel-button" type="button" data-verify-action="confirm" data-verify-email="${email}">Confirmar código</button>
        <button class="panel-button secondary" type="button" data-verify-action="resend" data-verify-email="${email}">Reenviar código</button>
      </div>
    </div>
  `;
  settingsSheet.classList.add("open");
  settingsSheet.setAttribute("aria-hidden", "false");
  settingsPanelContent.querySelector("[data-verify-code-input]")?.focus();
}

async function handleVerifyAction(action, email) {
  if (action === "resend") {
    const result = await apiRequest("/api/auth/resend-code", { method: "POST", body: { email } });
    showToast(result?.message || "Código reenviado");
    return;
  }

  if (action === "confirm") {
    const codeInput = settingsPanelContent.querySelector("[data-verify-code-input]");
    const code = codeInput?.value.trim() || "";

    if (code.length !== 6) {
      showToast("Digite o código de 6 dígitos");
      return;
    }

    const result = await apiRequest("/api/auth/verify-email", {
      method: "POST",
      body: { email, code },
    });

    if (!result || result.ok === false) {
      showToast(result?.error || "Código inválido ou expirado.");
      return;
    }

    closeSettingsPanel();
    await loadServerState();
    showScreen("home");
    showToast("Conta verificada! Bem-vinda ao Radar Lipedema");
  }
}

async function handleAuthAction(actionName) {
  const emailInput = document.querySelector("[data-login-email]");
  const passwordInput = document.querySelector("[data-login-password]");
  const email = emailInput?.value.trim() || "";
  const password = passwordInput?.value || "";

  if (actionName === "register" || actionName === "login") {
    if (!email || !password) {
      showToast("Preencha e-mail e senha");
      return;
    }

    const result = await apiRequest(`/api/auth/${actionName}`, {
      method: "POST",
      body: { email, password },
    });

    if (!result || result.ok === false) {
      showToast(result?.error || "Não foi possível continuar. Tente de novo.");
      return;
    }

    if (passwordInput) {
      passwordInput.value = "";
    }

    if (result.pendingVerification) {
      renderEmailVerificationPanel(result.email);
      showToast("Enviamos um código para o seu e-mail");
      return;
    }

    await loadServerState();
    showScreen("home");
    showToast("Bem-vinda de volta");
    return;
  }

  if (actionName === "forgot") {
    if (!email) {
      showToast("Digite seu e-mail para recuperar a senha");
      return;
    }

    const result = await apiRequest("/api/auth/forgot-password", {
      method: "POST",
      body: { email },
    });
    showToast(result?.message || result?.error || "Não foi possível enviar a recuperação agora.");
    return;
  }

  if (actionName === "logout") {
    await apiRequest("/api/auth/logout", { method: "POST" });
    closeSettingsPanel();
    showScreen("login");
    showToast("Você saiu da conta");
  }
}

document.querySelectorAll("[data-auth-action]").forEach((button) => {
  button.addEventListener("click", () => {
    handleAuthAction(button.dataset.authAction);
  });
});

async function handlePasswordResetFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("resetToken");
  if (!token) {
    return;
  }

  window.history.replaceState({}, "", window.location.pathname);
  const password = window.prompt("Digite sua nova senha (mínimo 6 caracteres):");
  if (!password) {
    return;
  }

  const result = await apiRequest("/api/auth/reset-password", {
    method: "POST",
    body: { token, password },
  });

  showToast(
    result?.ok
      ? "Senha atualizada! Faça login com a nova senha."
      : result?.error || "Não foi possível redefinir a senha."
  );
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-avatar-trigger]")) {
    openAvatarPicker();
  }
});

avatarInput?.addEventListener("change", () => {
  const file = avatarInput.files?.[0];
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    showToast("Escolha uma imagem");
    avatarInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    saveProfilePhoto(String(reader.result));
    avatarInput.value = "";
    showToast("Foto do perfil atualizada");
  });
  reader.readAsDataURL(file);
});

document.querySelectorAll("[data-tab-group] [data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const group = button.parentElement;
    setTab(group, button.dataset.tab);
  });
});

document.querySelectorAll("[data-history-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const group = document.querySelector('[data-tab-group="history"]');
    if (group) {
      setTab(group, button.dataset.historyTab);
      showToast("Calend\u00e1rio do ciclo aberto");
    }
  });
});

document.querySelectorAll(".flow-grid button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".flow-grid button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  });
});

document.querySelectorAll(".cycle-options button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".cycle-options button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
  });
});

document.querySelectorAll(".range-line input").forEach((input) => {
  const output = input.closest(".range-line").querySelector("output");
  input.addEventListener("input", () => {
    output.value = input.value;
    output.textContent = input.value;
  });
});

document.querySelectorAll("[data-toast]").forEach((button) => {
  button.addEventListener("click", () => {
    showToast(button.dataset.toast);
  });
});

document.querySelectorAll("[data-settings-panel]").forEach((button) => {
  button.addEventListener("click", () => {
    openSettingsPanel(button.dataset.settingsPanel);
  });
});

document.querySelectorAll("[data-premium-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const resource = renderPremiumResource(button.dataset.premiumAction);
    if (!resource) {
      return;
    }

    settingsPanelTitle.innerHTML = resource.title;
    settingsPanelContent.innerHTML = resource.content;
    settingsSheet.classList.add("open");
    settingsSheet.setAttribute("aria-hidden", "false");
  });
});

document.querySelectorAll("[data-register-panel]").forEach((button) => {
  button.addEventListener("click", () => {
    openRegisterPanel(button.dataset.registerPanel);
  });
});

document.querySelectorAll("[data-close-settings]").forEach((button) => {
  button.addEventListener("click", closeSettingsPanel);
});

settingsPanelContent.addEventListener("input", (event) => {
  const painRange = event.target.closest("[data-pain-detail-range]");
  if (painRange) {
    const painValue = Number(painRange.value);
    const painLabel = getPainLabel(painValue);
    const painPercent = painValue * 10;
    const mainPainRange = document.querySelector('[data-symptom="dor"]');
    const mainPainOutput = mainPainRange?.closest(".range-line").querySelector("output");
    const painLevelCard = settingsPanelContent.querySelector(".pain-level-card");
    settingsPanelContent.querySelector("[data-pain-detail-value]").textContent = painValue;
    settingsPanelContent.querySelector("[data-pain-detail-label]").textContent = painLabel;
    painRange.style.setProperty("--pain-fill", `${painPercent}%`);
    painLevelCard?.style.setProperty("--pain-fill", `${painPercent}%`);
    painLevelCard?.style.setProperty("--pain-progress", painPercent);
    if (mainPainRange && mainPainOutput) {
      mainPainRange.value = painValue;
      mainPainOutput.value = painValue;
      mainPainOutput.textContent = painValue;
    }
    return;
  }

  const range = event.target.closest(".range-line input");
  if (range) {
    const output = range.closest(".range-line").querySelector("output");
    output.value = range.value;
    output.textContent = range.value;
  }
});

settingsPanelContent.addEventListener("change", (event) => {
  const photoInput = event.target.closest("[data-photo-input]");
  if (!photoInput) {
    return;
  }

  const file = photoInput.files?.[0];
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    showToast("Escolha uma imagem");
    photoInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const slotName = photoInput.dataset.photoInput;
    const photoSrc = String(reader.result);
    updatePhotoSlotImage(slotName, photoSrc);
    savePhotoToServer(slotName, photoSrc);

    photoInput.value = "";
    showToast(`Foto ${slotName} adicionada`);
  });
  reader.readAsDataURL(file);
});

settingsPanelContent.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target.closest("[data-panel-form]");
  if (form && form.dataset.panelForm === "profile") {
    const formData = new FormData(form);
    const name = formData.get("name") || "Ana";
    const email = formData.get("email") || "";
    const goal = formData.get("goal") || "";
    document.querySelector("#home-title").textContent = `Ol\u00e1, ${name}`;
    saveProfileToServer({ name, email, goal, photoDataUrl: profilePhoto });
    showToast("Perfil salvo");
    closeSettingsPanel();
  }
});

settingsPanelContent.addEventListener("click", (event) => {
  const verifyAction = event.target.closest("[data-verify-action]");
  if (verifyAction) {
    handleVerifyAction(verifyAction.dataset.verifyAction, verifyAction.dataset.verifyEmail);
    return;
  }

  const cameraAction = event.target.closest("[data-camera-action]");
  if (cameraAction) {
    const actionName = cameraAction.dataset.cameraAction;
    if (actionName === "capture") {
      capturePhotoFromCamera();
      return;
    }

    if (actionName === "gallery") {
      const slotName = activePhotoSlot;
      const photoInput = settingsPanelContent.querySelector(`[data-photo-input="${slotName}"]`);
      closePhotoCamera();
      photoInput?.click();
      return;
    }

    closePhotoCamera();
    return;
  }

  const photoSlot = event.target.closest("[data-photo-slot]");
  if (photoSlot) {
    openPhotoCapture(photoSlot.dataset.photoSlot);
    return;
  }

  const habitButton = event.target.closest("[data-habit-step]");
  if (habitButton) {
    const row = habitButton.closest("[data-habit-stepper]");
    const direction = Number(habitButton.dataset.habitStep);
    const stepSize = Number(row.dataset.stepSize);
    const min = Number(row.dataset.min);
    const max = Number(row.dataset.max);
    const nextValue = Math.max(min, Math.min(max, Number(row.dataset.value) + direction * stepSize));
    row.dataset.value = String(nextValue);
    row.querySelector("[data-habit-value]").textContent = `${formatHabitValue(nextValue)} ${row.dataset.unit}`;
    showToast(row.dataset.habitStepper === "water" ? "\u00c1gua ajustada" : "Sono ajustado");
    return;
  }

  const cycleDay = event.target.closest(".mini-calendar .cycle-day");
  if (cycleDay) {
    cycleDay.closest(".mini-calendar").querySelectorAll(".cycle-day").forEach((day) => {
      day.classList.remove("selected");
    });
    cycleDay.classList.add("selected");
    showToast(`Dia ${cycleDay.textContent} selecionado`);
    return;
  }

  const stepButton = event.target.closest("[data-step]");
  if (stepButton) {
    const stepper = stepButton.closest("[data-stepper]");
    const config = stepperValues[stepper.dataset.stepper];
    const nextValue = config.value + Number(stepButton.dataset.step);
    config.value = Math.max(config.min, Math.min(config.max, nextValue));
    stepper.querySelector("output").textContent = `${config.value} ${config.label}`;
    return;
  }

  const action = event.target.closest("[data-panel-action]");
  if (!action) {
    return;
  }

  const actionName = action.dataset.panelAction;
  if (actionName === "avatar") {
    openAvatarPicker();
    return;
  }

  const messages = {
    avatar: "Foto atualizada",
    "save-cycle": "Prefer\u00eancias do ciclo salvas",
    "save-reminders": "Lembretes salvos",
    "save-goals": "Meta de sintomas salva",
    invoice: "Recibo aberto",
    "manage-plan": "Assinatura aberta",
    "run-backup": "Backup conclu\u00eddo agora",
    "export-csv": "CSV exportado",
    "export-json": "JSON exportado",
    "export-pdf": "PDF exportado",
    "change-password": "Tela de senha aberta",
    "delete-data": "Confirma\u00e7\u00e3o para apagar dados aberta",
    faq: "FAQ aberta",
    contact: "Suporte aberto",
    tutorial: "Tutorial iniciado",
    "edit-pain-areas": "\u00c1reas de dor editadas",
    "edit-edema-areas": "\u00c1reas de edema editadas",
    "save-pain": "Dor registrada",
    "save-edema": "Edema registrado",
    "save-measures": "Medidas salvas",
    "save-weight": "Peso registrado",
    "weight-minus": "Peso ajustado",
    "weight-plus": "Peso ajustado",
    "save-treatments": "Tratamentos salvos",
    "save-habits": "H\u00e1bitos salvos",
    "save-symptoms-extra": "Sintomas registrados",
    "save-photos": "Fotos salvas",
    "save-cycle-record": "Ciclo registrado",
  };

  if (actionName === "run-backup") {
    const status = settingsPanelContent.querySelector("[data-backup-status]");
    if (status) {
      status.textContent = "Agora mesmo";
    }
  }

  if (actionName === "export-pdf") {
    downloadPdfReport();
  }

  if (actionName === "export-csv") {
    downloadCsvExport();
  }

  if (actionName === "export-json") {
    downloadJsonExport();
  }

  showToast(messages[actionName] || "A\u00e7\u00e3o conclu\u00edda");
  if (actionName.startsWith("save-")) {
    saveRecordToServer(actionName, {
      fields: collectPanelData(),
      photos: Object.keys(photoSlotImages),
      savedAt: new Date().toISOString(),
    });
    updateEvolutionScore();
    updatePremiumSummaries();
    closeSettingsPanel();
  }
});

document.querySelectorAll(".legend-item").forEach((button) => {
  button.addEventListener("click", () => {
    const series = button.dataset.series;
    const isMuted = button.classList.toggle("muted");
    document.querySelectorAll(`.chart [data-series="${series}"]`).forEach((item) => {
      item.classList.toggle("series-hidden", isMuted);
    });
    showToast(`${seriesLabels[series]} ${isMuted ? "ocultado" : "visivel"}`);
  });
});

document.querySelectorAll("[data-period-step]").forEach((button) => {
  button.addEventListener("click", () => {
    const step = Number(button.dataset.periodStep);
    periodIndex = (periodIndex + step + periodLabels.length) % periodLabels.length;
    document.querySelector("[data-period-label]").textContent = periodLabels[periodIndex];
    showToast(`Per\u00edodo: ${periodLabels[periodIndex]}`);
  });
});

document.querySelectorAll("[data-save-register]").forEach((button) => {
  button.addEventListener("click", () => {
    const values = getCurrentSymptomValues();
    document.querySelectorAll(".symptoms-card .metric-row").forEach((row, index) => {
      const value = values[index];
      row.style.setProperty("--value", `${value * 10}%`);
      row.querySelector("span:nth-child(2)").textContent = `${value}/10`;
    });

    const average = values.reduce((total, value) => total + value, 0) / values.length;
    const maxValue = Math.max(...values);
    const dominantIndex = values.indexOf(maxValue);
    const isNormal = maxValue <= 1;
    const dominantLevel = isNormal ? "Sem alerta" : maxValue >= 8 ? "Intenso" : maxValue >= 5 ? "Moderado" : "Leve";
    const dominantCard = document.querySelector("[data-dominant-card]");
    const dominantImage = document.querySelector("[data-dominant-image]");
    document.querySelector(".symptoms-card .card-title-row span").textContent = `m\u00e9dia ${average.toFixed(1)}/10`;
    document.querySelector("[data-dominant-name]").textContent = isNormal ? "Normal" : symptomDisplayNames[dominantIndex];
    document.querySelector("[data-dominant-level]").textContent = dominantLevel;
    if (dominantCard) {
      dominantCard.classList.remove("symptom-dor", "symptom-edema", "symptom-sensibilidade", "symptom-humor", "symptom-neutral");
      dominantCard.classList.add(isNormal ? "symptom-neutral" : symptomClassNames[dominantIndex]);
    }
    if (dominantImage) {
      dominantImage.onerror = () => {
        dominantImage.onerror = null;
        dominantImage.src = fallbackImageSource;
      };
      dominantImage.src = isNormal ? normalImageSource : symptomImageSources[dominantIndex];
      dominantImage.alt = isNormal ? "Mapa corporal normal" : `Mapa corporal de ${symptomDisplayNames[dominantIndex].toLowerCase()}`;
    }
    const score = updateEvolutionScore(values);
    updatePremiumSummaries();
    document.querySelector(".insight-card p").textContent =
      values[2] >= 7
        ? "Sensibilidade continua em destaque na fase l\u00fatea."
        : score >= 80
          ? "Seu score melhorou com sintomas mais controlados e rotina consistente."
          : "Seu registro alimentou novos insights de padr\u00e3o e evolu\u00e7\u00e3o.";

    saveRecordToServer("daily_register", {
      symptoms: {
        dor: values[0],
        edema: values[1],
        sensibilidade: values[2],
        humor: values[3],
      },
      average,
      score,
      dominant: isNormal ? "Normal" : symptomDisplayNames[dominantIndex],
      dominantLevel,
      note: document.querySelector("#register .notes-field textarea")?.value || "",
      savedAt: new Date().toISOString(),
    });

    showToast("Registro salvo");
    showScreen("home");
  });
});

async function bootApp() {
  await handlePasswordResetFromUrl();
  const me = await apiRequest("/api/auth/me");

  if (me?.authenticated) {
    await loadServerState();
    showScreen("home");
  } else {
    showScreen("login");
  }
}

updateEvolutionScore();
updatePremiumSummaries();
setProfilePhoto(profilePhoto);
bootApp();
