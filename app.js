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
let activeFoodScanStream = null;
let activeRegisterPanelId = null;
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
  { name: "Frente", className: "front-view", placeholder: "imagem/imagem/referencia-frente.png" },
  { name: "Lado", className: "side-view", placeholder: "imagem/imagem/referencia-lado.png" },
  { name: "Costas", className: "back-view", placeholder: "imagem/imagem/referencia-costas.png" },
];
const photoSlotImages = {};
let recordHistory = [];
let currentProfile = null;
const phaseNames = ["Menstrual", "Folicular", "Ovulatória", "Lútea"];

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

function updateEvolutionScore(values) {
  if (!values || !values.length) {
    document.querySelectorAll("[data-evolution-score]").forEach((item) => {
      item.textContent = "--";
    });
    document.querySelectorAll("[data-evolution-label]").forEach((item) => {
      item.textContent = "Sem dados";
    });
    document.querySelectorAll("[data-evolution-stars]").forEach((item) => {
      item.textContent = "☆ ☆ ☆";
    });
    document.querySelectorAll("[data-evolution-summary]").forEach((item) => {
      item.textContent = "Registre seus sintomas de hoje para calcular seu score de evolução.";
    });
    return null;
  }

  const severityValues = [values[0], values[1], values[2], 10 - values[3]];
  const average = severityValues.reduce((total, value) => total + value, 0) / severityValues.length;
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

function getPeriodCutoffDate(index) {
  const cycleLength = currentProfile?.cycleLength || 28;

  if (index === 2 && currentProfile?.lastPeriodStart) {
    return new Date(currentProfile.lastPeriodStart);
  }

  const cycles = index === 1 ? 6 : 3;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cycles * cycleLength);
  return cutoff;
}

function getPeriodFilteredHistory() {
  const cutoffDate = getPeriodCutoffDate(periodIndex);
  return { history: getDailyRegisters().filter((entry) => entry.date >= cutoffDate), cutoffDate };
}

function getFoodScanRegisters() {
  return recordHistory
    .filter((record) => record.recordType === "save-food-scan")
    .map((record) => ({
      date: new Date(record.createdAt),
      items: Array.isArray(record.payload?.items) ? record.payload.items : [],
      totalCalories: Number(record.payload?.totalCalories) || 0,
      totalProtein: Number(record.payload?.totalProtein) || 0,
      totalCarbs: Number(record.payload?.totalCarbs) || 0,
      totalFat: Number(record.payload?.totalFat) || 0,
      mealSlot: record.payload?.mealSlot || null,
    }))
    .sort((a, b) => a.date - b.date);
}

function getDailyRegisters() {
  return recordHistory
    .filter((record) => record.recordType === "daily_register" && record.payload?.symptoms)
    .map((record) => ({
      date: new Date(record.createdAt),
      dor: Number(record.payload.symptoms.dor) || 0,
      edema: Number(record.payload.symptoms.edema) || 0,
      sensibilidade: Number(record.payload.symptoms.sensibilidade) || 0,
      humor: Number(record.payload.symptoms.humor) || 0,
    }))
    .sort((a, b) => a.date - b.date);
}

function averageOf(entries, key) {
  return entries.length ? entries.reduce((total, entry) => total + entry[key], 0) / entries.length : null;
}

function computeCycleDayInfo(date, profile) {
  if (!profile?.lastPeriodStart) {
    return null;
  }

  const cycleLength = profile.cycleLength || 28;
  const periodLength = profile.periodLength || 5;
  const start = new Date(`${String(profile.lastPeriodStart).slice(0, 10)}T00:00:00`);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);

  const daysSinceStart = Math.round((target - start) / 86_400_000);
  const cycleDay = (((daysSinceStart % cycleLength) + cycleLength) % cycleLength) + 1;
  const ovulationDay = Math.max(periodLength + 3, cycleLength - 14);

  let phase;
  if (cycleDay <= periodLength) {
    phase = "Menstrual";
  } else if (cycleDay >= ovulationDay - 1 && cycleDay <= ovulationDay + 1) {
    phase = "Ovulatória";
  } else if (cycleDay < ovulationDay - 1) {
    phase = "Folicular";
  } else {
    phase = "Lútea";
  }

  return { cycleDay, cycleLength, periodLength, phase };
}

function computeCycleInfo(profile) {
  const info = computeCycleDayInfo(new Date(), profile);
  if (!info) {
    return null;
  }

  return { ...info, percent: Math.round((info.cycleDay / info.cycleLength) * 100) };
}

function computeSymptomsByCyclePhase(cutoffDate) {
  if (!currentProfile?.lastPeriodStart) {
    return null;
  }

  const daily = cutoffDate ? getDailyRegisters().filter((entry) => entry.date >= cutoffDate) : getDailyRegisters();
  if (daily.length < 4) {
    return null;
  }

  const byPhase = { Menstrual: [], "Folicular": [], "Ovulatória": [], "Lútea": [] };
  daily.forEach((entry) => {
    const info = computeCycleDayInfo(entry.date, currentProfile);
    if (info) {
      byPhase[info.phase].push(entry);
    }
  });

  const phaseAverages = Object.keys(byPhase).map((phase) => ({
    phase,
    count: byPhase[phase].length,
    dor: averageOf(byPhase[phase], "dor"),
    edema: averageOf(byPhase[phase], "edema"),
    sensibilidade: averageOf(byPhase[phase], "sensibilidade"),
    humor: averageOf(byPhase[phase], "humor"),
  }));

  const withData = phaseAverages.filter((entry) => entry.count > 0);
  if (withData.length < 2) {
    return null;
  }

  return { phaseAverages, generatedAt: new Date().toLocaleString("pt-BR") };
}

function computeCyclePhaseInsights(cutoffDate) {
  const data = computeSymptomsByCyclePhase(cutoffDate);
  if (!data) {
    return [];
  }

  const withData = data.phaseAverages.filter((entry) => entry.count >= 2);
  const results = [];

  [
    { key: "dor", color: "pink" },
    { key: "edema", color: "purple" },
    { key: "sensibilidade", color: "orange" },
    { key: "humor", color: "teal" },
  ].forEach(({ key, color }) => {
    const sorted = [...withData].sort((a, b) => b[key] - a[key]);
    if (sorted.length < 2) {
      return;
    }

    const highest = sorted[0];
    const lowest = sorted[sorted.length - 1];
    const diff = +(highest[key] - lowest[key]).toFixed(1);
    if (diff < 1) {
      return;
    }

    results.push({
      color,
      label: seriesLabels[key],
      text:
        key === "humor"
          ? `Costuma ser melhor na fase ${highest.phase} (${highest[key].toFixed(1)}/10) do que na fase ${lowest.phase} (${lowest[key].toFixed(1)}/10), com base nos seus registros.`
          : `Costuma ser mais alto(a) na fase ${highest.phase} (${highest[key].toFixed(1)}/10) do que na fase ${lowest.phase} (${lowest[key].toFixed(1)}/10), com base nos seus registros.`,
    });
  });

  return results;
}

function compareSymptomGroups(daily, records, extractActive, symptomKey) {
  const symptomsByDate = new Map();
  daily.forEach((entry) => {
    const key = entry.date.toISOString().slice(0, 10);
    if (!symptomsByDate.has(key)) {
      symptomsByDate.set(key, []);
    }
    symptomsByDate.get(key).push(entry);
  });

  const pairs = records
    .map((record) => {
      const active = extractActive(record);
      const key = new Date(record.createdAt).toISOString().slice(0, 10);
      const entries = symptomsByDate.get(key);
      const symptomValue = entries ? averageOf(entries, symptomKey) : null;
      return active === null || symptomValue === null ? null : { active, symptomValue };
    })
    .filter(Boolean);

  const activeGroup = pairs.filter((pair) => pair.active);
  const inactiveGroup = pairs.filter((pair) => !pair.active);
  if (activeGroup.length < 3 || inactiveGroup.length < 3) {
    return null;
  }

  const activeAvg = activeGroup.reduce((total, pair) => total + pair.symptomValue, 0) / activeGroup.length;
  const inactiveAvg = inactiveGroup.reduce((total, pair) => total + pair.symptomValue, 0) / inactiveGroup.length;
  const diff = +(inactiveAvg - activeAvg).toFixed(1);
  if (Math.abs(diff) < 1) {
    return null;
  }

  return { activeAvg: +activeAvg.toFixed(1), inactiveAvg: +inactiveAvg.toFixed(1), diff, activeCount: activeGroup.length, inactiveCount: inactiveGroup.length };
}

function medianSplitPredicate(records, extractValue) {
  const values = records.map(extractValue).filter((value) => value !== null && Number.isFinite(value));
  if (values.length < 6) {
    return () => null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return (record) => {
    const value = extractValue(record);
    return value === null || !Number.isFinite(value) ? null : value >= median;
  };
}

function computeHabitSymptomCorrelations(cutoffDate) {
  const daily = cutoffDate ? getDailyRegisters().filter((entry) => entry.date >= cutoffDate) : getDailyRegisters();
  if (daily.length < 6) {
    return [];
  }

  const sinceTime = cutoffDate ? cutoffDate.getTime() : 0;
  const treatments = recordHistory.filter((record) => record.recordType === "save-treatments" && new Date(record.createdAt).getTime() >= sinceTime);
  const habits = recordHistory.filter((record) => record.recordType === "save-habits" && new Date(record.createdAt).getTime() >= sinceTime);

  const factors = [
    {
      id: "drenagem",
      symptomKey: "edema",
      result: compareSymptomGroups(daily, treatments, (record) => record.payload?.fields?.drenagem === true, "edema"),
      color: "purple",
      symptomLabel: "Edema",
      activeDesc: "com drenagem linfática registrada",
      inactiveDesc: "sem",
      actionText: "Agendar ou realizar uma sess&atilde;o de drenagem linf&aacute;tica hoje",
      lowerIsBetter: true,
    },
    {
      id: "exercicio",
      symptomKey: "dor",
      result: compareSymptomGroups(daily, treatments, (record) => record.payload?.fields?.exercicio === true, "dor"),
      color: "pink",
      symptomLabel: "Dor",
      activeDesc: "com exercício registrado",
      inactiveDesc: "sem",
      actionText: "Fazer um exerc&iacute;cio leve hoje",
      lowerIsBetter: true,
    },
    {
      id: "garmentHours",
      symptomKey: "edema",
      result: compareSymptomGroups(daily, treatments, medianSplitPredicate(treatments, (record) => Number(record.payload?.fields?.garmentHours)), "edema"),
      color: "purple",
      symptomLabel: "Edema",
      activeDesc: "com mais horas de uso da meia de compressão",
      inactiveDesc: "com menos uso",
      actionText: "Usar a meia de compress&atilde;o por mais horas hoje",
      lowerIsBetter: true,
    },
    {
      id: "water",
      symptomKey: "edema",
      result: compareSymptomGroups(daily, habits, medianSplitPredicate(habits, (record) => Number(record.payload?.fields?.water?.value)), "edema"),
      color: "teal",
      symptomLabel: "Edema",
      activeDesc: "com mais água registrada",
      inactiveDesc: "com menos água",
      actionText: "Beber mais &aacute;gua hoje",
      lowerIsBetter: true,
    },
    {
      id: "sleep",
      symptomKey: "humor",
      result: compareSymptomGroups(daily, habits, medianSplitPredicate(habits, (record) => Number(record.payload?.fields?.sleep?.value)), "humor"),
      color: "teal",
      symptomLabel: "Humor",
      activeDesc: "com mais horas de sono",
      inactiveDesc: "com menos sono",
      actionText: "Priorizar dormir mais hoje",
      lowerIsBetter: false,
    },
    {
      id: "lpg",
      symptomKey: "edema",
      result: compareSymptomGroups(daily, treatments, (record) => record.payload?.fields?.lpg === true, "edema"),
      color: "purple",
      symptomLabel: "Edema",
      activeDesc: "com LPG registrado",
      inactiveDesc: "sem",
      actionText: "Agendar uma sess&atilde;o de LPG",
      lowerIsBetter: true,
    },
    {
      id: "pressoterapia",
      symptomKey: "edema",
      result: compareSymptomGroups(daily, treatments, (record) => record.payload?.fields?.pressoterapia === true, "edema"),
      color: "purple",
      symptomLabel: "Edema",
      activeDesc: "com pressoterapia registrada",
      inactiveDesc: "sem",
      actionText: "Agendar uma sess&atilde;o de pressoterapia",
      lowerIsBetter: true,
    },
    {
      id: "medicamentos",
      symptomKey: "dor",
      result: compareSymptomGroups(daily, treatments, (record) => record.payload?.fields?.medicamentos === true, "dor"),
      color: "pink",
      symptomLabel: "Dor",
      activeDesc: "com medicamentos conforme prescri&ccedil;&atilde;o",
      inactiveDesc: "sem",
      actionText: "Verificar com seu m&eacute;dico sobre manter os medicamentos prescritos em dia",
      lowerIsBetter: true,
    },
    {
      id: "antiInflammatoryDiet",
      symptomKey: "sensibilidade",
      result: compareSymptomGroups(daily, habits, (record) => record.payload?.fields?.antiInflammatoryDiet === true, "sensibilidade"),
      color: "orange",
      symptomLabel: "Sensibilidade",
      activeDesc: "com alimenta&ccedil;&atilde;o anti-inflamat&oacute;ria marcada",
      inactiveDesc: "sem",
      actionText: "Priorizar alimenta&ccedil;&atilde;o anti-inflamat&oacute;ria hoje",
      lowerIsBetter: true,
    },
  ];

  return factors.filter((factor) => factor.result);
}

function computeHabitSymptomInsights(cutoffDate) {
  return computeHabitSymptomCorrelations(cutoffDate).map((factor) => ({
    color: factor.color,
    label: factor.symptomLabel,
    text: `Nos dias ${factor.activeDesc}, sua m&eacute;dia de ${factor.symptomLabel.toLowerCase()} foi ${factor.result.activeAvg}/10, contra ${factor.result.inactiveAvg}/10 nos dias ${factor.inactiveDesc} — baseado em ${factor.result.activeCount + factor.result.inactiveCount} registros.`,
  }));
}

function renderCycleCard(profile) {
  const info = computeCycleInfo(profile);
  const phaseEl = document.querySelector("[data-cycle-phase]");
  const dayEl = document.querySelector("[data-cycle-day]");
  const ringEl = document.querySelector("[data-cycle-ring]");
  const registerPhaseEl = document.querySelector("[data-register-cycle-phase]");
  const registerDayEl = document.querySelector("[data-register-cycle-day]");

  if (!info) {
    if (phaseEl) phaseEl.textContent = "Registre a data do seu ciclo";
    if (dayEl) dayEl.textContent = "Ajustes > Preferências do ciclo";
    if (ringEl) {
      ringEl.style.setProperty("--percent", "0");
      ringEl.setAttribute("aria-label", "Sem dados do ciclo");
    }
    if (registerPhaseEl) registerPhaseEl.textContent = "Sem dados do ciclo ainda";
    if (registerDayEl) registerDayEl.textContent = "Informe a data em Ajustes > Preferências do ciclo.";
    return;
  }

  if (phaseEl) phaseEl.textContent = `Fase ${info.phase}`;
  if (dayEl) dayEl.textContent = `Dia ${info.cycleDay} de ${info.cycleLength}`;
  if (ringEl) {
    ringEl.style.setProperty("--percent", String(info.percent));
    ringEl.setAttribute("aria-label", `${info.percent} por cento do ciclo`);
  }
  if (registerPhaseEl) registerPhaseEl.textContent = `Fase ${info.phase} — Dia ${info.cycleDay} de ${info.cycleLength}`;
  if (registerDayEl) registerDayEl.textContent = cyclePhaseSummaries[info.phase] || "";
}

const cyclePhaseSummaries = {
  Menstrual: "Fase de menstruação. Priorize descanso e observe seus sintomas de dor e edema.",
  Folicular: "Energia tende a subir nessa fase. Bom momento para retomar hábitos e rotina.",
  "Ovulatória": "Período fértil. Sensibilidade pode aumentar para algumas mulheres.",
  "Lútea": "Fase pré-menstrual. Sintomas como dor e sensibilidade costumam ficar mais intensos.",
};

const actionPlanByPhase = {
  Menstrual: {
    exercise: "Caminhada leve de 15-20 minutos ou alongamento suave. Evite treinos de alto impacto hoje.",
    nutrition: "Priorize ferro (folhas verdes, feijão) e hidratação. Reduza sal para não somar com a retenção típica da fase.",
    stress: "Dê prioridade ao descanso — uma respiração guiada de 5 minutos ajuda a aliviar a tensão.",
  },
  Folicular: {
    exercise: "Sua energia tende a subir — bom momento para caminhadas mais longas ou um treino de força leve.",
    nutrition: "Inclua proteínas magras e vegetais coloridos para sustentar o pique dessa fase.",
    stress: "Aproveite a disposição maior para organizar sua rotina da semana.",
  },
  "Ovulatória": {
    exercise: "Sensibilidade pode aumentar — prefira exercícios de baixo impacto como natação ou bicicleta leve.",
    nutrition: "Reforce alimentos anti-inflamatórios (ômega-3, açafrão, gengibre) — veja o guia completo em Alimentação anti-inflamatória.",
    stress: "Técnicas de respiração e mindfulness ajudam a lidar com a sensibilidade típica dessa fase.",
  },
  "Lútea": {
    exercise: "Sintomas costumam ficar mais intensos — foque em alongamento e drenagem manual, evitando esforço alto.",
    nutrition: "Reduza açúcar e sódio, aumente a água — ajuda a conter o inchaço característico da TPM.",
    stress: "Priorize o sono e técnicas de relaxamento; os sintomas físicos tendem a mexer com o humor nessa fase.",
  },
};

function renderCycleTimeline(profile) {
  const info = computeCycleInfo(profile);
  const daysContainer = document.querySelector("[data-cycle-days]");
  const titleEl = document.querySelector("[data-cycle-phase-title]");
  const textEl = document.querySelector("[data-cycle-phase-text]");

  if (!info) {
    if (daysContainer) {
      daysContainer.innerHTML = "";
    }
    if (titleEl) titleEl.textContent = "Sem dados do ciclo ainda";
    if (textEl) textEl.textContent = "Informe a data do seu último ciclo em Ajustes > Preferências do ciclo para acompanhar aqui.";
    return;
  }

  if (daysContainer) {
    daysContainer.innerHTML = Array.from({ length: info.cycleLength }, (_, index) => {
      const day = index + 1;
      const className = day < info.cycleDay ? "done" : day === info.cycleDay ? "active" : "";
      return `<span class="${className}">${day}</span>`;
    }).join("");
  }

  if (titleEl) titleEl.textContent = `Fase ${info.phase}`;
  if (textEl) textEl.textContent = cyclePhaseSummaries[info.phase] || "";
}

function computeInsights(history, cutoffDate) {
  if (history.length < 2) {
    return [];
  }

  const half = Math.max(1, Math.floor(history.length / 2));
  const recent = history.slice(-half);
  const earlier = history.slice(0, history.length - half);
  const insights = computeCyclePhaseInsights(cutoffDate);

  if (earlier.length) {
    [
      { key: "dor", color: "pink" },
      { key: "edema", color: "purple" },
      { key: "sensibilidade", color: "orange" },
    ].forEach(({ key, color }) => {
      const delta = averageOf(recent, key) - averageOf(earlier, key);
      if (Math.abs(delta) >= 0.5) {
        insights.push({
          color,
          label: seriesLabels[key],
          text: `${delta > 0 ? "Aumentou" : "Diminuiu"} em média ${Math.abs(delta).toFixed(1)} pontos nos registros mais recentes.`,
        });
      }
    });

    const humorDelta = averageOf(recent, "humor") - averageOf(earlier, "humor");
    if (Math.abs(humorDelta) >= 0.5) {
      insights.push({
        color: "teal",
        label: "Humor",
        text: `${humorDelta > 0 ? "Melhorou" : "Piorou"} em média ${Math.abs(humorDelta).toFixed(1)} pontos nos registros mais recentes.`,
      });
    }
  }

  const overallAverages = {
    dor: averageOf(history, "dor"),
    edema: averageOf(history, "edema"),
    sensibilidade: averageOf(history, "sensibilidade"),
  };
  const worstKey = ["dor", "edema", "sensibilidade"].sort((a, b) => overallAverages[b] - overallAverages[a])[0];
  insights.push({
    color: worstKey === "dor" ? "pink" : worstKey === "edema" ? "purple" : "orange",
    label: seriesLabels[worstKey],
    text: `É o sintoma com maior média entre os seus registros (${overallAverages[worstKey].toFixed(1)}/10).`,
  });

  const bruisingInsight = computeBruisingInsight(cutoffDate);
  if (bruisingInsight) {
    insights.push(bruisingInsight);
  }

  insights.push(...computeHabitSymptomInsights(cutoffDate));

  return insights;
}

function computeBruisingInsight(cutoffDate) {
  const sinceTime = cutoffDate ? cutoffDate.getTime() : 0;
  const entries = recordHistory.filter((record) => record.recordType === "save-symptoms-extra" && new Date(record.createdAt).getTime() >= sinceTime);
  if (entries.length < 3) {
    return null;
  }

  const withBruising = entries.filter((entry) => entry.payload?.fields?.hasBruising === true).length;
  if (!withBruising) {
    return null;
  }

  const percent = Math.round((withBruising / entries.length) * 100);
  return {
    color: "orange",
    label: "Hematomas",
    text: `Presentes em ${percent}% dos seus últimos ${entries.length} registros de sintomas extras.`,
  };
}

const mlsItemPoints = {
  hormonal: 2,
  resistente: 4,
  dorPressao: 3,
  sensibilidadeToque: 2,
  hematomasFrio: 2,
  pesoVolume: 2,
  dorRepouso: 4,
  dorPalpacao: 4,
  disproporcao: 4,
  pernasColuna: 3,
  peleNodular: 2,
  ortopedico: 4,
};

function mlsStageFor(score) {
  if (score > 30) {
    return { stage: 3, label: "Est&aacute;gio 3 &mdash; Lipedema avan&ccedil;ado", plainLabel: "Estágio 3 — Lipedema avançado" };
  }
  if (score >= 15) {
    return { stage: 2, label: "Est&aacute;gio 2 &mdash; Lipedema manifesto", plainLabel: "Estágio 2 — Lipedema manifesto" };
  }
  return { stage: 1, label: "Est&aacute;gio 1 &mdash; Lipedema inicial", plainLabel: "Estágio 1 — Lipedema inicial" };
}

function mlsApplicabilityText(bmiOk, stemmerOk) {
  if (bmiOk === null && stemmerOk === null) {
    return "Informe seu IMC e o resultado do sinal de Stemmer para saber se o score se aplica bem ao seu caso.";
  }
  if (bmiOk === false) {
    return "Seu IMC est&aacute; acima de 40 &mdash; o score original n&atilde;o foi validado nessa faixa, pode ser menos preciso pra voc&ecirc;.";
  }
  if (stemmerOk === false) {
    return "Sinal de Stemmer positivo pode indicar linfedema associado &mdash; vale procurar avalia&ccedil;&atilde;o espec&iacute;fica para linfedema al&eacute;m do lipedema.";
  }
  if (bmiOk === true && stemmerOk === true) {
    return "Seu perfil est&aacute; dentro dos crit&eacute;rios do estudo original &mdash; o score tende a ser uma boa refer&ecirc;ncia pro seu caso.";
  }
  return "Complete o IMC e o sinal de Stemmer acima para uma avalia&ccedil;&atilde;o completa da aplicabilidade do score.";
}

function computeTreatmentAdherence() {
  const entries = recordHistory.filter((record) => record.recordType === "save-treatments");
  const total = entries.length;
  const percentOf = (predicate) => (total ? Math.round((entries.filter(predicate).length / total) * 100) : null);

  const garmentHoursValues = entries
    .map((entry) => Number(entry.payload?.fields?.garmentHours))
    .filter((value) => Number.isFinite(value));
  const avgGarmentHours = garmentHoursValues.length
    ? +(garmentHoursValues.reduce((sum, value) => sum + value, 0) / garmentHoursValues.length).toFixed(1)
    : null;

  return {
    totalEntries: total,
    drenagem: percentOf((entry) => entry.payload?.fields?.drenagem === true),
    fisioterapia: percentOf((entry) => entry.payload?.fields?.fisioterapia === true),
    exercicio: percentOf((entry) => entry.payload?.fields?.exercicio === true),
    avgGarmentHours,
  };
}

function computeRoutineSuggestion() {
  const recent = getDailyRegisters().slice(-7);
  const avgDor = averageOf(recent, "dor");
  const avgEdema = averageOf(recent, "edema");
  const adherence = computeTreatmentAdherence();
  const cycleInfo = computeCycleInfo(currentProfile);

  const garmentLastReplacedAt = currentProfile?.garmentLastReplacedAt ? String(currentProfile.garmentLastReplacedAt).slice(0, 10) : null;
  const daysSinceReplaced = garmentLastReplacedAt
    ? Math.floor((Date.now() - new Date(`${garmentLastReplacedAt}T00:00:00`).getTime()) / 86_400_000)
    : null;

  const items = [];
  const correlations = computeHabitSymptomCorrelations();
  const helpsWhenActive = (factor) => (factor.lowerIsBetter ? factor.result.diff > 0 : factor.result.diff < 0);
  const findHelpfulFactor = (id) => correlations.find((factor) => factor.id === id && helpsWhenActive(factor));

  const waterFactor = findHelpfulFactor("water");
  items.push(
    waterFactor
      ? {
          text: "Beber mais &aacute;gua hoje",
          reason: `Nos seus dias com mais &aacute;gua registrada, o edema ficou em ${waterFactor.result.activeAvg}/10 contra ${waterFactor.result.inactiveAvg}/10 nos dias com menos.`,
        }
      : { text: "Beber pelo menos 2 litros de &aacute;gua ao longo do dia", reason: "H&aacute;bito de base recomendado para quem tem lipedema." }
  );
  items.push({ text: "Elevar as pernas por 15 a 20 minutos em algum momento do dia", reason: "Favorece o retorno venoso e linf&aacute;tico." });

  const sleepFactor = findHelpfulFactor("sleep");
  if (sleepFactor) {
    items.push({
      text: "Priorizar dormir mais hoje",
      reason: `Nos seus dias com mais sono, o humor ficou em ${sleepFactor.result.activeAvg}/10 contra ${sleepFactor.result.inactiveAvg}/10 nos dias com menos sono.`,
    });
  }

  ["lpg", "pressoterapia", "medicamentos", "antiInflammatoryDiet"].forEach((id) => {
    const factor = findHelpfulFactor(id);
    if (factor) {
      items.push({
        text: factor.actionText,
        reason: `Nos seus dias ${factor.activeDesc}, ${factor.symptomLabel.toLowerCase()} ficou em ${factor.result.activeAvg}/10 contra ${factor.result.inactiveAvg}/10 nos dias ${factor.inactiveDesc}.`,
      });
    }
  });

  const garmentFactor = findHelpfulFactor("garmentHours");
  if (currentProfile?.garmentCompressionClass) {
    if (adherence.avgGarmentHours !== null && adherence.avgGarmentHours < 8) {
      items.push({
        text: "Tentar usar a meia de compress&atilde;o por mais horas hoje",
        reason: garmentFactor
          ? `M&eacute;dia registrada: ${adherence.avgGarmentHours}h/dia. Nos dias com mais uso, o edema ficou em ${garmentFactor.result.activeAvg}/10 contra ${garmentFactor.result.inactiveAvg}/10.`
          : `M&eacute;dia registrada nos &uacute;ltimos dias: ${adherence.avgGarmentHours}h/dia.`,
      });
    } else {
      items.push({
        text: "Manter o uso da meia de compress&atilde;o durante o dia",
        reason: adherence.avgGarmentHours !== null ? `Uso m&eacute;dio registrado: ${adherence.avgGarmentHours}h/dia.` : null,
      });
    }
  } else {
    items.push({ text: "Informar sua classe de compress&atilde;o em Ajustes para receber lembretes de uso da meia", reason: null });
  }

  if (daysSinceReplaced !== null && daysSinceReplaced >= 120) {
    items.push({
      text: "Considerar trocar a meia de compress&atilde;o",
      reason: `J&aacute; se passaram ${daysSinceReplaced} dias desde a &uacute;ltima troca registrada.`,
    });
  }

  const drenagemFactor = findHelpfulFactor("drenagem");
  const exercicioFactor = findHelpfulFactor("exercicio");
  if (adherence.totalEntries >= 3) {
    if (adherence.drenagem !== null && adherence.drenagem < 40) {
      items.push({
        text: "Agendar ou realizar uma sess&atilde;o de drenagem linf&aacute;tica esta semana",
        reason: drenagemFactor
          ? `Presente em apenas ${adherence.drenagem}% dos seus registros. Nos dias com drenagem, o edema ficou em ${drenagemFactor.result.activeAvg}/10 contra ${drenagemFactor.result.inactiveAvg}/10.`
          : `Presente em apenas ${adherence.drenagem}% dos seus &uacute;ltimos registros de tratamento.`,
      });
    }
    if (adherence.fisioterapia !== null && adherence.fisioterapia < 40) {
      items.push({
        text: "Encaixar uma sess&atilde;o de fisioterapia",
        reason: `Presente em apenas ${adherence.fisioterapia}% dos seus &uacute;ltimos registros de tratamento.`,
      });
    }
    if (adherence.exercicio !== null && adherence.exercicio < 40) {
      items.push({
        text: "Fazer uma caminhada leve ou exerc&iacute;cio de baixo impacto",
        reason: exercicioFactor
          ? `Presente em apenas ${adherence.exercicio}% dos seus registros. Nos dias com exerc&iacute;cio, sua dor ficou em ${exercicioFactor.result.activeAvg}/10 contra ${exercicioFactor.result.inactiveAvg}/10.`
          : `Presente em apenas ${adherence.exercicio}% dos seus &uacute;ltimos registros de tratamento.`,
      });
    }
  } else {
    items.push({ text: "Registrar tratamentos (drenagem, fisioterapia, exerc&iacute;cio) para receber sugest&otilde;es mais precisas", reason: null });
  }

  if (avgDor !== null && avgDor >= 6) {
    items.push({
      text: "Priorizar repouso e evitar longos per&iacute;odos em p&eacute; hoje",
      reason: `Sua dor m&eacute;dia nos &uacute;ltimos ${recent.length} registros est&aacute; em ${avgDor.toFixed(1)}/10.`,
    });
  }

  if (avgEdema !== null && avgEdema >= 6) {
    items.push({
      text: "Reduzir o consumo de sal hoje e elevar as pernas com mais frequ&ecirc;ncia",
      reason: `Seu edema m&eacute;dio recente est&aacute; em ${avgEdema.toFixed(1)}/10.`,
    });
  }

  if (cycleInfo) {
    if (cycleInfo.phase === "Lútea") {
      items.push({
        text: "Redobrar aten&ccedil;&atilde;o aos sintomas hoje",
        reason: "Voc&ecirc; est&aacute; na fase l&uacute;tea do ciclo, quando sintomas de lipedema tendem a piorar.",
      });
    } else if (cycleInfo.phase === "Menstrual") {
      items.push({
        text: "Ir com calma em exerc&iacute;cios de maior impacto hoje",
        reason: "Voc&ecirc; est&aacute; na fase menstrual do ciclo.",
      });
    }
  } else {
    items.push({ text: "Informar a data do seu &uacute;ltimo ciclo em Ajustes para cruzar sintomas com a fase hormonal", reason: null });
  }

  return { generatedAt: new Date().toLocaleString("pt-BR"), items };
}

function renderHomeSnapshot(latest) {
  const hasData = Boolean(latest);
  const values = hasData ? [latest.dor, latest.edema, latest.sensibilidade, latest.humor] : [];

  document.querySelectorAll(".symptoms-card .metric-row").forEach((row, index) => {
    const value = hasData ? values[index] : 0;
    row.style.setProperty("--value", `${value * 10}%`);
    row.querySelector("span:nth-child(2)").textContent = hasData ? `${value}/10` : "--";
  });

  const average = hasData ? values.reduce((total, value) => total + value, 0) / values.length : 0;
  const severityValues = hasData ? [values[0], values[1], values[2], 10 - values[3]] : [];
  const maxSeverity = hasData ? Math.max(...severityValues) : 0;
  const dominantIndex = severityValues.indexOf(maxSeverity);
  const isNormal = !hasData || maxSeverity <= 1;
  const dominantLevel = !hasData ? "Sem registros" : isNormal ? "Sem alerta" : maxSeverity >= 8 ? "Intenso" : maxSeverity >= 5 ? "Moderado" : "Leve";

  const titleRow = document.querySelector(".symptoms-card .card-title-row span");
  if (titleRow) {
    titleRow.textContent = hasData ? `média ${average.toFixed(1)}/10` : "sem registros ainda";
  }

  const dominantCard = document.querySelector("[data-dominant-card]");
  const dominantImage = document.querySelector("[data-dominant-image]");
  const dominantName = document.querySelector("[data-dominant-name]");
  const dominantLevelEl = document.querySelector("[data-dominant-level]");
  if (dominantName) {
    dominantName.textContent = !hasData ? "Sem dados" : isNormal ? "Normal" : symptomDisplayNames[dominantIndex];
  }
  if (dominantLevelEl) {
    dominantLevelEl.textContent = dominantLevel;
  }
  if (dominantCard) {
    dominantCard.classList.remove("symptom-dor", "symptom-edema", "symptom-sensibilidade", "symptom-humor", "symptom-neutral");
    dominantCard.classList.add(!hasData || isNormal ? "symptom-neutral" : symptomClassNames[dominantIndex]);
  }
  if (dominantImage) {
    dominantImage.onerror = () => {
      dominantImage.onerror = null;
      dominantImage.src = fallbackImageSource;
    };
    dominantImage.src = !hasData || isNormal ? normalImageSource : symptomImageSources[dominantIndex];
    dominantImage.alt = !hasData ? "Sem dados ainda" : isNormal ? "Mapa corporal normal" : `Mapa corporal de ${symptomDisplayNames[dominantIndex].toLowerCase()}`;
  }

  const score = updateEvolutionScore(hasData ? values : null);

  const insightText = document.querySelector(".insight-card p");
  if (insightText) {
    insightText.textContent = !hasData
      ? "Registre seus sintomas de hoje para começar a receber insights."
      : values[2] >= 7
        ? "Sensibilidade continua em destaque nos seus últimos registros."
        : score >= 80
          ? "Seu score está ótimo, sintomas controlados e rotina consistente."
          : "Seu registro mais recente alimenta seus insights de padrão e evolução.";
  }

  return score;
}

function renderSymptomChart(history) {
  const svg = document.querySelector(".chart");
  if (!svg) {
    return;
  }

  svg.querySelectorAll(".phase").forEach((el) => el.remove());
  const areaPath = svg.querySelector(".symptom-area");
  if (areaPath) {
    areaPath.setAttribute("d", "");
  }

  const points = history.slice(-8);
  const xStart = 30;
  const xEnd = 322;
  const yTop = 26;
  const yBottom = 206;
  const xFor = (index) => (points.length <= 1 ? (xStart + xEnd) / 2 : xStart + ((xEnd - xStart) * index) / (points.length - 1));
  const yFor = (value) => yBottom - (value / 10) * (yBottom - yTop);

  const phaseClassMap = { Menstrual: "phase-menstrual", "Folicular": "phase-folicular", "Ovulatória": "phase-ovulatoria", "Lútea": "phase-lutea" };
  const pointPhases = points.map((point) => (currentProfile?.lastPeriodStart ? computeCycleDayInfo(point.date, currentProfile)?.phase : null));

  if (points.length && currentProfile?.lastPeriodStart) {
    const xPositions = points.map((_, index) => xFor(index));
    const bandsHtml = points
      .map((_, index) => {
        const phase = pointPhases[index];
        if (!phase) {
          return "";
        }
        const left = index === 0 ? xStart : (xPositions[index - 1] + xPositions[index]) / 2;
        const right = index === points.length - 1 ? xEnd : (xPositions[index] + xPositions[index + 1]) / 2;
        return `<rect class="phase ${phaseClassMap[phase]}" x="${left.toFixed(1)}" y="${yTop}" width="${Math.max(0, right - left).toFixed(1)}" height="${yBottom - yTop}"></rect>`;
      })
      .join("");
    svg.insertAdjacentHTML("afterbegin", bandsHtml);
  }

  ["dor", "edema", "sensibilidade", "humor"].forEach((key) => {
    const linePath = svg.querySelector(`path.line[data-series="${key}"]`);
    const dotsGroup = svg.querySelector(`g.dots[data-series="${key}"]`);
    if (!linePath || !dotsGroup) {
      return;
    }

    if (points.length < 2) {
      linePath.setAttribute("d", "");
      dotsGroup.innerHTML = "";
      return;
    }

    linePath.setAttribute(
      "d",
      points.map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)} ${yFor(point[key]).toFixed(1)}`).join(" ")
    );
    dotsGroup.innerHTML = points
      .map((point, index) => `<circle cx="${xFor(index).toFixed(1)}" cy="${yFor(point[key]).toFixed(1)}" r="5"></circle>`)
      .join("");
  });

  const labelsRow = document.querySelector(".phase-labels");
  if (labelsRow) {
    labelsRow.innerHTML = points.length
      ? points
          .map((point, index) => {
            const phase = pointPhases[index];
            const dot = phase ? `<i class="phase-dot ${phaseClassMap[phase]}" aria-hidden="true"></i>` : "";
            return `<span>${dot}${point.date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>`;
          })
          .join("")
      : "<span>Sem registros ainda</span>";
  }
}

function renderSymptomTable(history) {
  const rows = document.querySelectorAll(".symptom-table > div");
  ["dor", "edema", "sensibilidade", "humor"].forEach((key, index) => {
    const row = rows[index];
    if (!row) {
      return;
    }

    const average = averageOf(history, key);
    row.querySelector("strong").textContent = average === null ? "--" : average.toFixed(1);
    row.querySelector("i").style.setProperty("--value", average === null ? "0%" : `${average * 10}%`);
  });
}

function renderDeepInsights(history) {
  const container = document.querySelector(".insight-list.deep-insights");
  if (!container) {
    return;
  }

  const insights = computeInsights(history);
  if (!insights.length) {
    container.innerHTML = `
      <article>
        <span class="round-icon teal"></span>
        <p>Continue registrando seus sintomas para desbloquear <strong>insights personalizados</strong> baseados nos seus dados reais.</p>
      </article>
    `;
    return;
  }

  container.innerHTML = insights
    .map(
      (insight) => `
        <article>
          <span class="round-icon ${insight.color}"></span>
          <p><strong>${insight.label}</strong> ${insight.text}</p>
        </article>
      `
    )
    .join("");
}

function renderActionPlan(profile, history) {
  const container = document.querySelector("[data-action-plan]");
  if (!container) {
    return;
  }

  const info = computeCycleInfo(profile);
  if (!info) {
    container.innerHTML = `
      <p class="diet-guide-intro">Informe a data do seu último ciclo em Ajustes &gt; Preferências do ciclo para receber um plano ajustado à sua fase.</p>
    `;
    return;
  }

  const plan = actionPlanByPhase[info.phase];
  const worst = computeInsights(history).find((insight) => insight.text.includes("maior média"));

  container.innerHTML = `
    <p class="diet-guide-intro">Fase ${info.phase} — Dia ${info.cycleDay} de ${info.cycleLength}${
      worst ? `. Seu sintoma de maior atenção agora: <strong>${worst.label}</strong>.` : ""
    }</p>
    <div class="insight-list">
      <article>
        <span class="round-icon teal"></span>
        <p><strong>Exercício</strong> ${plan.exercise}</p>
      </article>
      <article>
        <span class="round-icon orange"></span>
        <p><strong>Nutrição</strong> ${plan.nutrition}</p>
      </article>
      <article>
        <span class="round-icon pink"></span>
        <p><strong>Manejo do estresse</strong> ${plan.stress}</p>
      </article>
    </div>
  `;
}

function renderInsightsHero(history) {
  const strongEl = document.querySelector(".insights-hero strong");
  const spanEl = document.querySelector(".insights-hero span");
  if (!strongEl || !spanEl) {
    return;
  }

  const count = computeInsights(history).length;
  strongEl.textContent = count ? `${count} padr${count === 1 ? "ão" : "ões"}` : "Sem padrões ainda";

  if (history.length) {
    const days = Math.max(1, Math.round((history[history.length - 1].date - history[0].date) / 86_400_000) + 1);
    spanEl.textContent = `Baseado em ${history.length} registro${history.length === 1 ? "" : "s"} (${days} dia${days === 1 ? "" : "s"})`;
  } else {
    spanEl.textContent = "Registre seus sintomas para começar";
  }
}

function renderRecentTrendCards(history) {
  const titleLabel = document.querySelector(".forecast-card .section-label");
  const kicker = document.querySelector(".forecast-card .card-title-row span");
  const grid = document.querySelector(".forecast-grid");
  if (!grid) {
    return;
  }

  if (titleLabel) {
    titleLabel.textContent = "Últimos registros";
  }
  if (kicker) {
    kicker.textContent = "real";
  }

  const recent = history.slice(-3).reverse();
  if (!recent.length) {
    grid.innerHTML = `<article><strong>Sem registros</strong><span>Registre seus sintomas</span><i class="risk"></i></article>`;
    return;
  }

  grid.innerHTML = recent
    .map((record) => {
      const average = (record.dor + record.edema + record.sensibilidade + record.humor) / 4;
      const riskClass = average >= 7 ? "risk high" : average >= 4 ? "risk mid" : "risk";
      return `
        <article>
          <strong>${record.date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</strong>
          <span>Média ${average.toFixed(1)}</span>
          <i class="${riskClass}"></i>
        </article>
      `;
    })
    .join("");
}

const recordTypeLabels = {
  daily_register: "Registros diários",
  "save-edema": "Edema",
  "save-measures": "Medidas",
  "save-weight": "Peso",
  "save-treatments": "Tratamentos",
  "save-habits": "Hábitos",
  "save-symptoms-extra": "Sintomas extras",
  "save-cycle-record": "Ciclo",
  "save-pain": "Dor detalhada",
  "save-photos": "Fotos",
  "save-mls": "Munich Lipedema Score",
  "save-food-scan": "Alimentos escaneados",
};

function buildPremiumDataset() {
  const history = getDailyRegisters();
  const latest = history[history.length - 1] || null;
  const score = updateEvolutionScore(latest ? [latest.dor, latest.edema, latest.sensibilidade, latest.humor] : null);

  const recordsByType = {};
  recordHistory.forEach((record) => {
    recordsByType[record.recordType] = (recordsByType[record.recordType] || 0) + 1;
  });

  const half = Math.max(1, Math.ceil(history.length / 2));
  const currentPeriod = history.slice(-half);
  const previousPeriod = history.length > half ? history.slice(0, history.length - half) : [];

  const averagesOf = (entries) => ({
    dor: averageOf(entries, "dor"),
    edema: averageOf(entries, "edema"),
    sensibilidade: averageOf(entries, "sensibilidade"),
    humor: averageOf(entries, "humor"),
  });

  const currentAverages = averagesOf(currentPeriod);
  const previousAverages = averagesOf(previousPeriod);
  const delta = (key) => (currentAverages[key] === null || previousAverages[key] === null ? null : +(currentAverages[key] - previousAverages[key]).toFixed(1));

  const insightObjects = computeInsights(history);
  const insights = insightObjects.length
    ? insightObjects.map((insight) => `${insight.label}: ${insight.text}`)
    : ["Continue registrando seus sintomas para gerar insights personalizados."];

  const cycleInfo = computeCycleInfo(currentProfile);
  const worstInsight = insightObjects.find((insight) => insight.text.includes("maior média"));
  const actionPlan = cycleInfo
    ? {
        phase: cycleInfo.phase,
        cycleDay: cycleInfo.cycleDay,
        cycleLength: cycleInfo.cycleLength,
        focusSymptom: worstInsight ? worstInsight.label : null,
        ...actionPlanByPhase[cycleInfo.phase],
      }
    : null;

  return {
    generatedAt: new Date().toLocaleString("pt-BR"),
    score,
    status: score === null ? "Sem dados" : getEvolutionLabel(score),
    hasEnoughData: history.length >= 2,
    totalRecords: recordHistory.length,
    records: recordsByType,
    currentPeriod: { count: currentPeriod.length, averages: currentAverages },
    previousPeriod: { count: previousPeriod.length, averages: previousAverages },
    deltas: {
      dor: delta("dor"),
      edema: delta("edema"),
      sensibilidade: delta("sensibilidade"),
      humor: delta("humor"),
    },
    insights,
    actionPlan,
  };
}

const dietMacroRatios = { carbs: 0.45, protein: 0.25, fat: 0.30 };
const activityMultipliers = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};
const mealSlotLabels = {
  breakfast: "Café da manhã",
  lunch: "Almoço",
  snack: "Lanche",
  dinner: "Jantar",
};
const mealSlotOrder = ["breakfast", "lunch", "snack", "dinner"];

function inferMealSlot(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 18) return "snack";
  if (hour >= 18 && hour < 23) return "dinner";
  return "snack";
}

function getLatestWeightKg() {
  const record = recordHistory.find((entry) => entry.recordType === "save-weight" && typeof entry.payload?.weight === "number");
  return record ? Number(record.payload.weight) : null;
}

function getStepsToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const record = recordHistory.find((entry) => {
    if (entry.recordType !== "save-steps") return false;
    const day = new Date(entry.createdAt);
    day.setHours(0, 0, 0, 0);
    return day.getTime() === today.getTime();
  });
  return record ? Number(record.payload?.steps) || 0 : 0;
}

function computeCaloriesBurnedFromSteps(steps, weightKg) {
  if (!steps || !weightKg) {
    return 0;
  }
  return Math.round(steps * weightKg * 0.0005);
}

function computeCalorieGoal(profile, weightKg) {
  if (!profile?.birthdate || !profile?.sex || !profile?.activityLevel || !profile?.heightCm || !weightKg) {
    return null;
  }

  const birth = new Date(`${String(profile.birthdate).slice(0, 10)}T00:00:00`);
  const ageMs = Date.now() - birth.getTime();
  const age = Math.floor(ageMs / (365.25 * 86_400_000));
  const heightCm = Number(profile.heightCm);

  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (profile.sex === "male" ? 5 : -161);
  const multiplier = activityMultipliers[profile.activityLevel] || activityMultipliers.sedentary;
  const calorieGoal = Math.round(bmr * multiplier);

  return {
    age,
    calorieGoal,
    carbsG: Math.round((calorieGoal * dietMacroRatios.carbs) / 4),
    proteinG: Math.round((calorieGoal * dietMacroRatios.protein) / 4),
    fatG: Math.round((calorieGoal * dietMacroRatios.fat) / 9),
  };
}

function buildNutritionDashboard() {
  const weightKg = getLatestWeightKg();
  const goal = computeCalorieGoal(currentProfile, weightKg);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayScans = getFoodScanRegisters().filter((entry) => {
    const day = new Date(entry.date);
    day.setHours(0, 0, 0, 0);
    return day.getTime() === today.getTime();
  });

  const consumedCalories = todayScans.reduce((total, entry) => total + entry.totalCalories, 0);
  const consumedProtein = todayScans.reduce((total, entry) => total + entry.totalProtein, 0);
  const consumedCarbs = todayScans.reduce((total, entry) => total + entry.totalCarbs, 0);
  const consumedFat = todayScans.reduce((total, entry) => total + entry.totalFat, 0);

  const steps = getStepsToday();
  const caloriesBurned = computeCaloriesBurnedFromSteps(steps, weightKg);
  const remaining = goal ? goal.calorieGoal - consumedCalories + caloriesBurned : null;

  const meals = mealSlotOrder.map((slot) => ({
    slot,
    label: mealSlotLabels[slot],
    entries: todayScans.filter((entry) => entry.mealSlot === slot),
  }));
  const otherEntries = todayScans.filter((entry) => !mealSlotOrder.includes(entry.mealSlot));
  if (otherEntries.length) {
    meals.push({ slot: "other", label: "Outros horários", entries: otherEntries });
  }

  return {
    goal,
    weightKg,
    steps,
    caloriesBurned,
    consumedCalories,
    consumedProtein,
    consumedCarbs,
    consumedFat,
    remaining,
    meals,
  };
}

function computeStreak(history) {
  if (!history.length) {
    return 0;
  }

  const oneDay = 86_400_000;
  const registeredDays = new Set(
    history.map((record) => {
      const day = new Date(record.date);
      day.setHours(0, 0, 0, 0);
      return day.getTime();
    })
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let cursor = today.getTime();
  if (!registeredDays.has(cursor)) {
    cursor -= oneDay;
  }

  let streak = 0;
  while (registeredDays.has(cursor)) {
    streak += 1;
    cursor -= oneDay;
  }

  return streak;
}

function renderGamification(history) {
  const streak = computeStreak(history);
  const xp = recordHistory.length * 10;
  const xpPerLevel = 200;
  const level = Math.floor(xp / xpPerLevel) + 1;
  const xpIntoLevel = xp % xpPerLevel;
  const insightCount = computeInsights(history).length;
  const lutealEntries = currentProfile?.lastPeriodStart
    ? history.filter((entry) => computeCycleDayInfo(entry.date, currentProfile)?.phase === "Lútea").length
    : 0;

  const achievements = {
    "primeiro-registro": recordHistory.length >= 1,
    "sete-dias": streak >= 7,
    exploradora: recordHistory.length >= 10,
    "fase-lutea": lutealEntries >= 3,
    padroes: insightCount >= 3,
    mestre: recordHistory.length >= 30,
  };
  const unlockedCount = Object.values(achievements).filter(Boolean).length;

  document.querySelectorAll("[data-streak-days]").forEach((el) => {
    el.textContent = `${streak} dia${streak === 1 ? "" : "s"}`;
  });
  document.querySelectorAll("[data-streak-note]").forEach((el) => {
    el.textContent = streak > 0 ? "Continue assim!" : "Registre hoje para começar";
  });
  document.querySelectorAll("[data-streak-count]").forEach((el) => {
    el.textContent = streak;
  });
  document.querySelectorAll("[data-level]").forEach((el) => {
    el.textContent = `Nível ${level}`;
  });
  document.querySelectorAll("[data-xp-bar]").forEach((el) => {
    el.style.setProperty("--xp", `${Math.round((xpIntoLevel / xpPerLevel) * 100)}%`);
  });
  document.querySelectorAll("[data-xp-label]").forEach((el) => {
    el.textContent = `${xpIntoLevel} / ${xpPerLevel} XP`;
  });
  document.querySelectorAll("[data-xp-value]").forEach((el) => {
    el.textContent = xp;
  });
  document.querySelectorAll("[data-achievement-count]").forEach((el) => {
    el.textContent = unlockedCount;
  });
  document.querySelectorAll("[data-achievement]").forEach((button) => {
    const unlocked = Boolean(achievements[button.dataset.achievement]);
    button.classList.toggle("locked", !unlocked);
  });
}

function renderHistoryPeriodViews() {
  const { history: periodHistory } = getPeriodFilteredHistory();
  renderSymptomChart(periodHistory);
}

function renderDynamicData() {
  const history = getDailyRegisters();
  renderHomeSnapshot(history[history.length - 1] || null);
  renderHistoryPeriodViews();
  renderSymptomTable(history);
  renderDeepInsights(history);
  renderInsightsHero(history);
  renderActionPlan(currentProfile, history);
  renderRecentTrendCards(history);
  renderGamification(history);
  renderCycleCard(currentProfile);
  renderCycleTimeline(currentProfile);
  updatePremiumSummaries();
  renderReminderBanner();
  renderMlsHomeCard();
}

function renderMlsHomeCard() {
  const scoreEl = document.querySelector("[data-mls-home-score]");
  const stageEl = document.querySelector("[data-mls-home-stage]");
  if (!scoreEl || !stageEl) {
    return;
  }

  const lastMls = [...recordHistory].reverse().find((record) => record.recordType === "save-mls");
  if (!lastMls) {
    scoreEl.textContent = "--";
    stageEl.textContent = "Toque para fazer sua autoavaliação";
    return;
  }

  const score = Number(lastMls.payload?.fields?.score) || 0;
  const stage = mlsStageFor(score);
  scoreEl.textContent = score;
  stageEl.innerHTML = `${stage.label} — toque para reavaliar`;
}

function dismissedRemindersToday() {
  try {
    const key = `dismissedReminders:${new Date().toISOString().slice(0, 10)}`;
    return { key, list: JSON.parse(localStorage.getItem(key) || "[]") };
  } catch (error) {
    return { key: "", list: [] };
  }
}

function computeActiveReminders() {
  const reminders = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = today.toISOString().slice(0, 10);

  if (currentProfile?.reminderDailyEnabled !== false) {
    const hasLoggedToday = getDailyRegisters().some((entry) => entry.date.toISOString().slice(0, 10) === todayKey);
    if (!hasLoggedToday) {
      reminders.push({
        id: "daily",
        icon: "i-edit",
        color: "pink",
        text: "Voc&ecirc; ainda n&atilde;o registrou seus sintomas hoje.",
        panel: "pain",
      });
    }
  }

  const garmentLastReplacedAt = currentProfile?.garmentLastReplacedAt ? String(currentProfile.garmentLastReplacedAt).slice(0, 10) : null;
  const daysSinceReplaced = garmentLastReplacedAt
    ? Math.floor((Date.now() - new Date(`${garmentLastReplacedAt}T00:00:00`).getTime()) / 86_400_000)
    : null;
  if (daysSinceReplaced !== null && daysSinceReplaced >= 120) {
    reminders.push({
      id: "garment",
      icon: "i-drop",
      color: "orange",
      text: `J&aacute; fazem ${daysSinceReplaced} dias desde a &uacute;ltima troca da sua meia de compress&atilde;o.`,
      panel: "treatments",
    });
  }

  if (currentProfile?.reminderCycleAlertEnabled !== false) {
    const info = computeCycleDayInfo(today, currentProfile);
    if (info) {
      const daysUntilNext = info.cycleLength - info.cycleDay + 1;
      if (daysUntilNext <= 1) {
        reminders.push({
          id: "cycle",
          icon: "i-calendar",
          color: "purple",
          text: "Previs&atilde;o: seu ciclo deve come&ccedil;ar hoje ou amanh&atilde;.",
          panel: "cycle-record",
        });
      }
    }
  }

  return reminders;
}

function renderReminderBanner() {
  const container = document.querySelector("[data-reminder-banner]");
  const badge = document.querySelector("[data-reminder-badge]");
  if (!container) {
    return;
  }

  const { list: dismissed } = dismissedRemindersToday();
  const reminders = computeActiveReminders().filter((reminder) => !dismissed.includes(reminder.id));

  if (badge) {
    badge.hidden = reminders.length === 0;
  }

  container.innerHTML = reminders
    .map(
      (reminder) => `
        <article class="reminder-banner-item ${reminder.color}" data-reminder-panel="${reminder.panel}">
          <span class="reminder-banner-icon"><svg class="icon"><use href="#${reminder.icon}"></use></svg></span>
          <p>${reminder.text}</p>
          <button type="button" data-reminder-dismiss="${reminder.id}" aria-label="Dispensar lembrete">
            <svg class="icon"><use href="#i-check"></use></svg>
          </button>
        </article>
      `
    )
    .join("");
}

document.addEventListener("click", (event) => {
  const dismissButton = event.target.closest("[data-reminder-dismiss]");
  if (dismissButton) {
    const { key, list } = dismissedRemindersToday();
    const id = dismissButton.dataset.reminderDismiss;
    if (key && !list.includes(id)) {
      localStorage.setItem(key, JSON.stringify([...list, id]));
    }
    renderReminderBanner();
    return;
  }

  const reminderItem = event.target.closest("[data-reminder-panel]");
  if (reminderItem) {
    openRegisterPanel(reminderItem.dataset.reminderPanel);
  }
});

function formatDelta(value, suffix = "") {
  if (value === null) {
    return "--";
  }

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

  currentProfile = data.profile || null;

  if (data.profile?.name) {
    document.querySelector("#home-title").textContent = `Ol\u00e1, ${data.profile.name}`;
  }

  if (data.profile?.goal) {
    document.querySelectorAll("[data-profile-goal]").forEach((el) => {
      el.textContent = data.profile.goal;
    });
  }

  if (data.profile?.photoDataUrl) {
    profilePhoto = data.profile.photoDataUrl;
    setProfilePhoto(profilePhoto);
  }

  (data.photos || []).forEach((photo) => {
    photoSlotImages[photo.slot] = photo.imageDataUrl;
  });

  recordHistory = data.records || [];
  renderDynamicData();
}

function renderPhotoSlot(slot) {
  const captured = Boolean(photoSlotImages[slot.name]);
  const src = photoSlotImages[slot.name] || slot.placeholder;

  return `
    <div class="photo-slot-row">
      <button class="${captured ? "captured" : ""}" type="button" data-photo-slot="${slot.name}">
        <span class="photo-thumb ${slot.className} ${captured ? "has-photo" : ""}">
          <img src="${src}" alt="${captured ? `Foto ${slot.name}` : `Refer&ecirc;ncia ${slot.name}`}">
        </span>
        <span><strong>${slot.name}</strong><small>${captured ? "Foto adicionada" : "Toque na c&acirc;mera"}</small></span>
        <span class="camera-pill ${captured ? "done" : ""}" data-photo-status>
          <svg class="icon"><use href="#${captured ? "i-check" : "i-camera"}"></use></svg>
        </span>
      </button>
      ${captured ? `<button class="photo-history-link" type="button" data-photo-history="${slot.name}">Ver evolu&ccedil;&atilde;o</button>` : ""}
    </div>
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

async function openPhotoHistory(slotName) {
  settingsPanelTitle.textContent = `Evolução — ${slotName}`;
  settingsPanelContent.innerHTML = `<p class="photo-guidance">Carregando fotos...</p>`;

  const result = await apiRequest(`/api/photos/history?slot=${encodeURIComponent(slotName)}`);
  const photos = result?.ok ? result.photos : [];

  settingsPanelContent.innerHTML = `
    <div class="photo-history-panel">
      <p class="photo-guidance">${
        photos.length
          ? `${photos.length} foto${photos.length === 1 ? "" : "s"} registrada${photos.length === 1 ? "" : "s"}, da mais recente &agrave; mais antiga.`
          : "Nenhuma foto registrada ainda para este &acirc;ngulo."
      }</p>
      <div class="photo-history-grid">
        ${photos
          .map(
            (photo) => `
              <figure>
                <img src="${photo.imageDataUrl}" alt="Foto ${slotName} em ${new Date(photo.createdAt).toLocaleDateString("pt-BR")}">
                <figcaption>${new Date(photo.createdAt).toLocaleDateString("pt-BR")}</figcaption>
              </figure>
            `
          )
          .join("")}
      </div>
      <button class="panel-button secondary" type="button" data-photo-history-back>Voltar</button>
    </div>
  `;
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

function closeFoodScanCamera() {
  if (activeFoodScanStream) {
    activeFoodScanStream.getTracks().forEach((track) => track.stop());
  }
  activeFoodScanStream = null;
  settingsPanelContent.querySelector("[data-food-camera-capture]")?.remove();
}

function renderFoodScanCamera() {
  closeFoodScanCamera();
  const body = settingsPanelContent.querySelector("[data-food-scan-body]");
  if (!body) {
    return;
  }

  body.insertAdjacentHTML(
    "beforeend",
    `
      <div class="photo-camera-capture food-scan-camera" data-food-camera-capture>
        <section class="camera-capture-card" aria-label="Câmera para o prato">
          <div class="camera-preview-frame">
            <video autoplay muted playsinline data-food-camera-preview></video>
            <span class="camera-loading">Abrindo câmera...</span>
            <span class="food-scan-frame-corner tl" aria-hidden="true"></span>
            <span class="food-scan-frame-corner tr" aria-hidden="true"></span>
            <span class="food-scan-frame-corner bl" aria-hidden="true"></span>
            <span class="food-scan-frame-corner br" aria-hidden="true"></span>
          </div>
          <p class="food-scan-camera-hint">Os alimentos devem estar bem iluminados e dentro do enquadramento.</p>
          <div class="food-scan-camera-actions">
            <button class="food-scan-camera-side" type="button" data-food-camera-action="gallery">
              <svg class="icon"><use href="#i-gallery"></use></svg>
              <span>Galeria</span>
            </button>
            <button class="food-scan-camera-shutter" type="button" data-food-camera-action="capture" aria-label="Tirar foto">
              <svg class="icon"><use href="#i-camera"></use></svg>
            </button>
            <button class="food-scan-camera-side" type="button" data-food-camera-action="close">
              <span class="x-icon"></span>
              <span>Cancelar</span>
            </button>
          </div>
        </section>
      </div>
    `
  );
}

async function openFoodScanCamera() {
  const fallbackInput = settingsPanelContent.querySelector("[data-food-scan-input]");

  if (!navigator.mediaDevices?.getUserMedia) {
    fallbackInput?.click();
    return;
  }

  renderFoodScanCamera();

  try {
    activeFoodScanStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
    const preview = settingsPanelContent.querySelector("[data-food-camera-preview]");
    const frame = settingsPanelContent.querySelector("[data-food-camera-capture] .camera-preview-frame");
    preview.srcObject = activeFoodScanStream;
    await preview.play();
    frame?.classList.add("ready");
  } catch (error) {
    closeFoodScanCamera();
    showToast("Câmera bloqueada. Escolha da galeria.");
    fallbackInput?.click();
  }
}

function captureFoodScanPhoto() {
  const preview = settingsPanelContent.querySelector("[data-food-camera-preview]");
  if (!preview || !preview.videoWidth) {
    showToast("Câmera ainda abrindo");
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = preview.videoWidth;
  canvas.height = preview.videoHeight;
  canvas.getContext("2d").drawImage(preview, 0, 0, canvas.width, canvas.height);
  const photoSrc = canvas.toDataURL("image/jpeg", 0.85);
  closeFoodScanCamera();
  submitFoodScan(photoSrc);
}

function renderFoodScanLoading() {
  const body = settingsPanelContent.querySelector("[data-food-scan-body]");
  if (!body) {
    return;
  }
  body.innerHTML = `<p class="diet-guide-intro">Analisando a foto...</p>`;
}

function renderFoodScanResult(result) {
  const body = settingsPanelContent.querySelector("[data-food-scan-body]");
  if (!body) {
    return;
  }

  if (!result || result.ok === false) {
    body.innerHTML = `
      <p class="diet-guide-intro">${result?.error || "Não foi possível analisar a foto agora. Tente novamente."}</p>
      <button class="panel-button" type="button" data-panel-action="open-food-scan-camera">Tentar de novo</button>
    `;
    return;
  }

  if (!result.items.length) {
    body.innerHTML = `
      <p class="diet-guide-intro">Não conseguimos identificar alimentos nessa foto com confiança. Tente uma foto mais próxima e bem iluminada.</p>
      <button class="panel-button" type="button" data-panel-action="open-food-scan-camera">Tirar outra foto</button>
    `;
    return;
  }

  const itemsHtml = result.items.map((item) => renderFoodScanItemHtml(item)).join("");

  body.innerHTML = `
    <p class="diet-guide-intro">Estimativa da IA a partir da foto — não é uma pesagem exata.</p>
    <p class="food-scan-total"><strong>${result.totalCalories}</strong> kcal estimadas no total</p>
    <div class="insight-list">${itemsHtml}</div>
    <button class="panel-button secondary" type="button" data-panel-action="open-food-scan-camera">Escanear outro prato</button>
  `;
}

function renderFoodScanItemHtml(item) {
  const color = item.match ? (item.match.category === "good" ? "teal" : "pink") : "orange";
  const verdict = item.match
    ? item.match.category === "good"
      ? `Está na lista de alimentos anti-inflamatórios: <strong>${item.match.name}</strong>.`
      : `Está na lista de alimentos a evitar: <strong>${item.match.name}</strong>.`
    : "Sem correspondência direta na nossa lista — classificação apenas da estimativa da IA.";
  const calories = item.estimatedCalories !== null ? `~${item.estimatedCalories} kcal` : "calorias não estimadas";
  return `
    <article>
      <span class="round-icon ${color}"></span>
      <p><strong>${item.name}</strong>${item.portion ? ` (${item.portion})` : ""} — ${calories}. ${verdict}</p>
    </article>
  `;
}

async function submitFoodScan(imageDataUrl) {
  renderFoodScanLoading();
  const mealSlot = inferMealSlot();
  const result = await apiRequest("/api/food-scan", { method: "POST", body: { imageDataUrl, mealSlot } });

  if (activeRegisterPanelId === "nutrition-dashboard") {
    await loadServerState();
    openRegisterPanel("nutrition-dashboard");
    showToast(result?.ok === false ? result.error || "Não foi possível analisar a foto agora." : "Prato adicionado");
    return;
  }

  renderFoodScanResult(result);
}

function getComparisonTone(value, higherIsBetter = false) {
  if (value === null || value === 0) {
    return "neutral";
  }

  const improved = higherIsBetter ? value > 0 : value < 0;
  return improved ? "positive" : "warning";
}

function renderPremiumResource(resourceId) {
  const data = buildPremiumDataset();
  const scoreLabel = data.score === null ? "--" : data.score;
  const comparisonCards = [
    { label: "Dor", value: formatDelta(data.deltas.dor), note: "Média do período atual vs anterior", tone: getComparisonTone(data.deltas.dor) },
    { label: "Edema", value: formatDelta(data.deltas.edema), note: "Média do período atual vs anterior", tone: getComparisonTone(data.deltas.edema) },
    { label: "Sensibilidade", value: formatDelta(data.deltas.sensibilidade), note: "Média do período atual vs anterior", tone: getComparisonTone(data.deltas.sensibilidade) },
    { label: "Humor", value: formatDelta(data.deltas.humor), note: "Média do período atual vs anterior", tone: getComparisonTone(data.deltas.humor, true) },
  ];
  const improvedCount = comparisonCards.filter((card) => card.tone === "positive").length;
  const warningCount = comparisonCards.filter((card) => card.tone === "warning").length;
  const comparisonSummary = !data.hasEnoughData
    ? {
        title: "Ainda não há registros suficientes.",
        detail: "Registre seus sintomas em pelo menos 2 dias diferentes para desbloquear comparativos reais.",
      }
    : improvedCount >= 3
      ? {
          title: "Período com melhora consistente nos principais sintomas.",
          detail: "Os registros apontam evolu&ccedil;&atilde;o positiva frente ao per&iacute;odo anterior.",
        }
      : warningCount >= 3
        ? {
            title: "Período pede mais aten&ccedil;&atilde;o e acompanhamento.",
            detail: "Os sinais subiram em rela&ccedil;&atilde;o ao per&iacute;odo anterior; vale revisar rotina, h&aacute;bitos e tratamentos.",
          }
        : {
            title: "Período com melhora parcial e alguns pontos de aten&ccedil;&atilde;o.",
            detail: "Use esse painel para enxergar padr&otilde;es antes de gerar o relat&oacute;rio completo.",
          };
  const pdfSections = [
    { title: "Resumo cl&iacute;nico", headline: "Sintoma predominante + evolu&ccedil;&atilde;o", detail: "Texto claro para levar na consulta." },
    { title: "Gr&aacute;ficos", headline: "Hist&oacute;rico real de dor, edema, sensibilidade e humor", detail: "Gerado a partir dos seus registros." },
    { title: "Fotos", headline: "Comparativo visual", detail: "Frente, lado e costas." },
    { title: "Dicas geradas", headline: data.insights[0], detail: "Baseado nos registros recentes." },
  ];
  const periodItems = [
    { label: "Período atual", period: data.currentPeriod },
    { label: "Período anterior", period: data.previousPeriod },
  ];
  const resourceTemplates = {
    "cycle-comparison": {
      title: "Comparativos entre per&iacute;odos",
      content: `
        <div class="premium-resource-panel">
          <article class="premium-output-hero comparison-hero">
            <div class="premium-hero-top">
              <span>Score atual</span>
              <b>${data.status}</b>
            </div>
            <strong>${scoreLabel}<small>/100</small></strong>
            <div class="premium-score-track" style="--score:${data.score || 0}%;"><i></i></div>
            <p>Comparativo gerado com ${data.totalRecords} registro${data.totalRecords === 1 ? "" : "s"} conectados entre sintomas, h&aacute;bitos, tratamentos e fotos.</p>
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
            <span>Leitura do per&iacute;odo</span>
            <strong>${comparisonSummary.title}</strong>
            <p>${comparisonSummary.detail}</p>
          </article>
          <div class="cycle-comparison-list">
            ${periodItems.map((item, index) => `
              <article>
                <i class="cycle-dot ${index === 0 ? "current" : ""}"></i>
                <div>
                  <span>${item.label}</span>
                  ${item.period.count
                    ? `
                      <strong>Dor ${item.period.averages.dor.toFixed(1)}/10 - Edema ${item.period.averages.edema.toFixed(1)}/10</strong>
                      <small>Sensibilidade ${item.period.averages.sensibilidade.toFixed(1)}/10 | Humor ${item.period.averages.humor.toFixed(1)}/10</small>
                    `
                    : `<strong>Sem registros suficientes</strong><small>Continue registrando sintomas para preencher esse per&iacute;odo.</small>`}
                  <small>${item.period.count} registro${item.period.count === 1 ? "" : "s"}</small>
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
            <strong>${scoreLabel}<small>/100</small></strong>
            <div class="premium-score-track" style="--score:${data.score || 0}%;"><i></i></div>
            <p>Relat&oacute;rio feminino, organizado e individual, com score, sintomas, h&aacute;bitos, tratamentos, fotos e insights reais.</p>
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
            <small>Arquivo com capa, resumo, comparativos e dicas geradas pelos seus registros reais.</small>
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
            <strong>${data.totalRecords}<small> registros</small></strong>
            <p>Exporta&ccedil;&atilde;o estruturada para backup, an&aacute;lise ou relat&oacute;rio profissional.</p>
          </article>
          <div class="export-schema">
            ${Object.entries(data.records).map(([key, value]) => `<span>${recordTypeLabels[key] || key}<strong>${value}</strong></span>`).join("") || "<span>Nenhum registro ainda<strong>0</strong></span>"}
          </div>
          <div class="export-format-list">
            <article>
              <strong>CSV</strong>
              <span>Planilha com score, sintomas e registros reais.</span>
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
  const summaries = {
    "cycle-comparison": data.hasEnoughData ? `${data.currentPeriod.count + data.previousPeriod.count} registros comparados` : "Registre mais dias para comparar",
    "pdf-report": `${data.totalRecords} registros para PDF`,
    "data-export": `CSV + JSON - ${data.totalRecords} registros`,
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
    .replace(/&aacute;/g, "\u00e1")
    .replace(/&eacute;/g, "\u00e9")
    .replace(/&iacute;/g, "\u00ed")
    .replace(/&oacute;/g, "\u00f3")
    .replace(/&uacute;/g, "\u00fa")
    .replace(/&atilde;/g, "\u00e3")
    .replace(/&ccedil;/g, "\u00e7")
    .replace(/&ecirc;/g, "\u00ea")
    .replace(/&otilde;/g, "\u00f5")
    .replace(/&Aacute;/g, "\u00c1")
    .replace(/&Eacute;/g, "\u00c9")
    .replace(/&Iacute;/g, "\u00cd")
    .replace(/&Oacute;/g, "\u00d3")
    .replace(/&Uacute;/g, "\u00da")
    .replace(/&Atilde;/g, "\u00c3")
    .replace(/&Ccedil;/g, "\u00c7")
    .replace(/&Ecirc;/g, "\u00ca")
    .replace(/&Otilde;/g, "\u00d5")
    .replace(/\u2014/g, "\u0097")
    .replace(/\u2013/g, "\u0096")
    .split("")
    .map((char) => (char.charCodeAt(0) <= 0xff ? char : "?"))
    .join("");
}

function escapePdfText(value) {
  return normalizeReportText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfLatin1Bytes(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return bytes;
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
  const scoreLabel = data.score === null ? "--" : data.score;
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
  commands.push(pdfText("Relatório Premium", 42, 784, 15, ink, "F2"));
  commands.push(pdfText(`Gerado em ${data.generatedAt}`, 42, 765, 10, muted));
  commands.push(pdfText(`${scoreLabel}`, 438, 800, 34, ink, "F2"));
  commands.push(pdfText("/100", 492, 802, 13, muted, "F2"));
  commands.push(pdfText(data.status, 440, 780, 13, purple, "F2"));

  commands.push(pdfText("Score de evolução", 42, 719, 15, ink, "F2"));
  commands.push(pdfText("Uma leitura consolidada dos seus registros reais de sintomas, hábitos, tratamentos e fotos.", 42, 700, 10, muted));
  commands.push(pdfRect(42, 681, 510, 10, [0.93, 0.90, 0.96]));
  commands.push(pdfRect(42, 681, Math.round(510 * ((data.score || 0) / 100)), 10, pink));

  commands.push(pdfText("Resumo dos registros", 42, 646, 15, ink, "F2"));
  const recordLabels = Object.entries(data.records).map(([key, value]) => [recordTypeLabels[key] || key, value]);
  if (!recordLabels.length) {
    recordLabels.push(["Nenhum registro ainda", 0]);
  }
  recordLabels.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? 42 : 304;
    const y = 607 - row * 43;
    commands.push(pdfRect(x, y, 248, 32, [1, 1, 1], line));
    commands.push(pdfText(label, x + 14, y + 19, 10, muted, "F2"));
    commands.push(pdfText(String(value), x + 204, y + 18, 14, purple, "F2"));
  });

  commands.push(pdfText("Comparativo entre períodos", 42, 424, 15, ink, "F2"));
  commands.push(pdfRect(42, 390, 510, 24, purple));
  ["Período", "Dor", "Edema", "Sens.", "Humor"].forEach((title, index) => {
    const x = [54, 254, 320, 386, 452][index];
    commands.push(pdfText(title, x, 398, 10, [1, 1, 1], "F2"));
  });
  [
    { label: "Atual", period: data.currentPeriod },
    { label: "Anterior", period: data.previousPeriod },
  ].forEach(({ label, period }, index) => {
    const y = 357 - index * 35;
    commands.push(pdfRect(42, y, 510, 30, index % 2 === 0 ? [1, 1, 1] : [0.99, 0.97, 1.0], line));
    commands.push(pdfText(label, 54, y + 11, 9, ink, "F2"));
    if (period.count) {
      commands.push(pdfText(`${period.averages.dor.toFixed(1)}/10`, 256, y + 11, 9, muted));
      commands.push(pdfText(`${period.averages.edema.toFixed(1)}/10`, 322, y + 11, 9, muted));
      commands.push(pdfText(`${period.averages.sensibilidade.toFixed(1)}/10`, 388, y + 11, 9, muted));
      commands.push(pdfText(`${period.averages.humor.toFixed(1)}/10`, 454, y + 11, 9, muted));
    } else {
      commands.push(pdfText("Sem registros suficientes", 256, y + 11, 9, muted));
    }
  });

  commands.push(pdfText("Insights e dicas geradas", 42, 252, 15, ink, "F2"));
  let insightY = 212;
  data.insights.slice(0, 4).forEach((insight, index) => {
    commands.push(pdfRect(42, insightY - 8, 510, 36, index === 0 ? softPink : [1, 1, 1], line));
    commands.push(pdfRect(54, insightY + 4, 10, 10, index === 0 ? pink : purple));
    wrapReportLine(insight, 74).slice(0, 2).forEach((lineText, lineIndex) => {
      commands.push(pdfText(lineText, 74, insightY + 4 - lineIndex * 13, 9, ink));
    });
    insightY -= 47;
  });

  commands.push(pdfRect(42, 38, 510, 38, [0.98, 0.95, 1.0], line));
  commands.push(pdfText("Observação", 58, 60, 10, purple, "F2"));
  commands.push(pdfText("Este relatório apoia acompanhamento e não substitui avaliação profissional.", 58, 47, 9, muted));
  commands.push(pdfText(`Total analisado: ${data.totalRecords} registros`, 420, 23, 9, muted));

  const planCommands = [];
  planCommands.push(pdfRect(0, 0, pageWidth, pageHeight, [1.0, 0.985, 1.0]));
  planCommands.push(pdfRect(0, 748, pageWidth, 94, lavender));
  planCommands.push(pdfRect(0, 748, pageWidth, 10, pink));
  planCommands.push(pdfText("Radar Lipedema", 42, 807, 24, purple, "F2"));
  planCommands.push(pdfText("Plano de ação personalizado", 42, 784, 15, ink, "F2"));
  planCommands.push(pdfText(`Gerado em ${data.generatedAt}`, 42, 765, 10, muted));

  if (!data.actionPlan) {
    planCommands.push(
      pdfText("Informe a data do último ciclo em Ajustes > Preferências do ciclo para gerar um plano ajustado à fase.", 42, 700, 11, muted)
    );
  } else {
    const plan = data.actionPlan;
    planCommands.push(
      pdfText(
        `Fase ${plan.phase} — Dia ${plan.cycleDay} de ${plan.cycleLength}${plan.focusSymptom ? ` · Sintoma de maior atenção: ${plan.focusSymptom}` : ""}`,
        42,
        712,
        11,
        purple,
        "F2"
      )
    );

    let planY = 668;
    [
      { title: "Exercício", text: plan.exercise, color: [0.86, 0.98, 0.97] },
      { title: "Nutrição", text: plan.nutrition, color: [1.0, 0.94, 0.83] },
      { title: "Manejo do estresse", text: plan.stress, color: [1.0, 0.89, 0.94] },
    ].forEach(({ title, text, color }) => {
      const lines = wrapReportLine(text, 78);
      const boxHeight = 30 + lines.length * 14;
      planCommands.push(pdfRect(42, planY - boxHeight, 510, boxHeight, color, line));
      planCommands.push(pdfText(title, 58, planY - 18, 11, ink, "F2"));
      lines.forEach((lineText, lineIndex) => {
        planCommands.push(pdfText(lineText, 58, planY - 36 - lineIndex * 14, 9, muted));
      });
      planY -= boxHeight + 14;
    });
  }

  planCommands.push(pdfRect(42, 38, 510, 38, [0.98, 0.95, 1.0], line));
  planCommands.push(pdfText("Observação", 58, 60, 10, purple, "F2"));
  planCommands.push(
    pdfText("Orientações gerais de bem-estar, não um plano médico individual — ajuste com profissionais de saúde.", 58, 47, 9, muted)
  );

  return buildPdfDocument([commands, planCommands], pageWidth, pageHeight);
}

function buildPdfDocument(pages, pageWidth, pageHeight) {
  const pageCommandSets = Array.isArray(pages[0]) ? pages : [pages];
  const pageCount = pageCommandSets.length;
  const fontF1Ref = 3;
  const fontF2Ref = 4;
  const pageObjRefs = pageCommandSets.map((_, index) => 5 + index);
  const contentObjRefs = pageCommandSets.map((_, index) => 5 + pageCount + index);

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageCount} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ...pageCommandSets.map(
      (_, index) =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontF1Ref} 0 R /F2 ${fontF2Ref} 0 R >> >> /Contents ${contentObjRefs[index]} 0 R >>`
    ),
    ...pageCommandSets.map((commands) => {
      const stream = commands.join("\n");
      return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    }),
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

  return new Blob([pdfLatin1Bytes(pdf)], { type: "application/pdf" });
}

function createClinicalReportPdf() {
  const data = buildPremiumDataset();
  const adherence = computeTreatmentAdherence();
  const commands = [];
  const pageWidth = 595;
  const pageHeight = 842;
  const purple = [0.43, 0.20, 0.85];
  const lavender = [0.96, 0.92, 1.0];
  const ink = [0.13, 0.09, 0.16];
  const muted = [0.43, 0.38, 0.49];
  const line = [0.90, 0.84, 0.95];
  const pct = (value) => (value === null ? "Sem registros" : `${value}%`);

  commands.push(pdfRect(0, 0, pageWidth, pageHeight, [1.0, 0.985, 1.0]));
  commands.push(pdfRect(0, 762, pageWidth, 80, lavender));
  commands.push(pdfRect(0, 762, pageWidth, 10, purple));
  commands.push(pdfText("Radar Lipedema", 42, 807, 22, purple, "F2"));
  commands.push(pdfText("Relatório para acompanhamento médico", 42, 786, 13, ink, "F2"));
  commands.push(pdfText(`Gerado em ${data.generatedAt}`, 42, 769, 9, muted));

  const lastMls = [...recordHistory].reverse().find((record) => record.recordType === "save-mls");
  const mlsScore = lastMls ? Number(lastMls.payload?.fields?.score) || 0 : null;
  const mlsStageLabel = mlsScore !== null ? mlsStageFor(mlsScore).plainLabel : null;

  commands.push(pdfText("Dados da paciente", 42, 732, 14, ink, "F2"));
  commands.push(pdfRect(42, 649, 510, 71, [1, 1, 1], line));
  commands.push(pdfText(`Nome: ${currentProfile?.name || "Não informado"}`, 56, 700, 10, ink));
  commands.push(pdfText(`Estágio: ${currentProfile?.lipedemaStage ? `Estágio ${currentProfile.lipedemaStage}` : "Não informado"}`, 56, 685, 10, ink));
  commands.push(pdfText(`Tipo: ${currentProfile?.lipedemaType ? `Tipo ${currentProfile.lipedemaType}` : "Não informado"}`, 56, 670, 10, ink));
  commands.push(
    pdfText(
      mlsScore !== null ? `Munich Lipedema Score (autoavaliação): ${mlsScore}/40 — ${mlsStageLabel}` : "Munich Lipedema Score: não avaliado ainda",
      56,
      655,
      10,
      ink
    )
  );

  commands.push(pdfText("Aderência ao tratamento conservador", 42, 615, 14, ink, "F2"));
  commands.push(pdfText(`Baseado em ${adherence.totalEntries} registro(s) de tratamento salvos no período.`, 42, 596, 9, muted));

  const adherenceRows = [
    ["Drenagem linfática", pct(adherence.drenagem)],
    ["Fisioterapia", pct(adherence.fisioterapia)],
    ["Exercício", pct(adherence.exercicio)],
    ["Uso médio da meia compressiva", adherence.avgGarmentHours === null ? "Sem registros" : `${adherence.avgGarmentHours} h/dia`],
    ["Classe de compressão", currentProfile?.garmentCompressionClass || "Não informado"],
  ];
  adherenceRows.forEach(([label, value], index) => {
    const y = 570 - index * 30;
    commands.push(pdfRect(42, y, 510, 26, index % 2 === 0 ? [1, 1, 1] : [0.99, 0.97, 1.0], line));
    commands.push(pdfText(label, 56, y + 15, 10, ink));
    commands.push(pdfText(String(value), 470, y + 15, 10, purple, "F2"));
  });

  commands.push(pdfText("Evolução dos sintomas", 42, 400, 14, ink, "F2"));
  commands.push(pdfRect(42, 350, 510, 40, purple));
  ["Período", "Dor", "Edema", "Sens.", "Humor"].forEach((title, index) => {
    const x = [54, 254, 320, 386, 452][index];
    commands.push(pdfText(title, x, 373, 10, [1, 1, 1], "F2"));
  });
  [
    { label: "Atual", period: data.currentPeriod },
    { label: "Anterior", period: data.previousPeriod },
  ].forEach(({ label, period }, index) => {
    const y = 344 - index * 30;
    commands.push(pdfRect(42, y, 510, 26, index % 2 === 0 ? [1, 1, 1] : [0.99, 0.97, 1.0], line));
    commands.push(pdfText(label, 54, y + 14, 9, ink, "F2"));
    if (period.count) {
      commands.push(pdfText(`${period.averages.dor.toFixed(1)}/10`, 256, y + 14, 9, muted));
      commands.push(pdfText(`${period.averages.edema.toFixed(1)}/10`, 322, y + 14, 9, muted));
      commands.push(pdfText(`${period.averages.sensibilidade.toFixed(1)}/10`, 388, y + 14, 9, muted));
      commands.push(pdfText(`${period.averages.humor.toFixed(1)}/10`, 454, y + 14, 9, muted));
    } else {
      commands.push(pdfText("Sem registros suficientes", 256, y + 14, 9, muted));
    }
  });

  commands.push(pdfRect(42, 60, 510, 44, [0.98, 0.95, 1.0], line));
  commands.push(pdfText("Observação", 58, 88, 10, purple, "F2"));
  commands.push(pdfText("Relatório gerado a partir de registros da própria paciente no app Radar", 58, 75, 9, muted));
  commands.push(pdfText("Lipedema. Não substitui avaliação clínica presencial.", 58, 63, 9, muted));
  commands.push(pdfText(`Total de registros analisados: ${data.totalRecords}`, 372, 23, 9, muted));

  return buildPdfDocument(commands, pageWidth, pageHeight);
}

function downloadPdfReport() {
  downloadFile("radar-lipedema-relatorio.pdf", "application/pdf", createPremiumReportPdf());
}

function downloadClinicalPdfReport() {
  downloadFile("radar-lipedema-relatorio-medico.pdf", "application/pdf", createClinicalReportPdf());
}

function downloadJsonExport() {
  downloadFile(
    "radar-lipedema-dados.json",
    "application/json",
    JSON.stringify(buildPremiumDataset(), null, 2)
  );
}

function formatBackupTimestamp(value) {
  if (!value) {
    return "Nenhum backup ainda";
  }

  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function runBackup() {
  downloadFile(
    "radar-lipedema-backup.json",
    "application/json",
    JSON.stringify({ generatedAt: new Date().toISOString(), profile: currentProfile, records: recordHistory, photos: photoSlotImages }, null, 2)
  );

  const result = await apiRequest("/api/backup", { method: "POST" });
  if (currentProfile && result?.lastBackupAt) {
    currentProfile.lastBackupAt = result.lastBackupAt;
  }

  const status = settingsPanelContent.querySelector("[data-backup-status]");
  if (status) {
    status.textContent = formatBackupTimestamp(currentProfile?.lastBackupAt);
  }
}

function downloadCsvExport() {
  const data = buildPremiumDataset();
  const periodRow = (label, period) => [
    period.count
      ? [label, "dor", period.averages.dor.toFixed(1)]
      : [label, "dor", ""],
    [label, "edema", period.count ? period.averages.edema.toFixed(1) : ""],
    [label, "sensibilidade", period.count ? period.averages.sensibilidade.toFixed(1) : ""],
    [label, "humor", period.count ? period.averages.humor.toFixed(1) : ""],
    [label, "registros", period.count],
  ];
  const rows = [
    ["tipo", "campo", "valor"],
    ["score", "score", data.score],
    ["score", "status", normalizeReportText(data.status)],
    ["score", "total_registros", data.totalRecords],
    ...Object.entries(data.records).map(([key, value]) => ["registros", recordTypeLabels[key] || key, value]),
    ...periodRow("periodo_atual", data.currentPeriod),
    ...periodRow("periodo_anterior", data.previousPeriod),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadFile("radar-lipedema-dados.csv", "text/csv;charset=utf-8", csv);
}

const settingsPanels = {
  profile: {
    title: "Perfil",
    render() {
      const name = currentProfile?.name || "";
      const email = currentProfile?.email || "";
      const goal = currentProfile?.goal || "";
      const initial = escapeHtml((name.trim().charAt(0) || "?").toUpperCase());
      const goalOptions = ["Entender padrões do ciclo", "Reduzir sintomas", "Acompanhar tratamento"];

      const stage = currentProfile?.lipedemaStage || "";
      const stageOptions = [
        ["1", "Estágio 1"],
        ["2", "Estágio 2"],
        ["3", "Estágio 3"],
      ];

      const type = currentProfile?.lipedemaType || "";
      const typeOptions = [
        ["I", "Tipo I (quadril e coxas)"],
        ["II", "Tipo II (coxas até joelhos)"],
        ["III", "Tipo III (quadril até tornozelos)"],
        ["IV", "Tipo IV (braços)"],
        ["V", "Tipo V (panturrilhas)"],
      ];

      const compressionClass = currentProfile?.garmentCompressionClass || "";
      const compressionOptions = ["15-20 mmHg", "20-30 mmHg", "30-40 mmHg", "40-50 mmHg"];

      const birthdate = currentProfile?.birthdate ? String(currentProfile.birthdate).slice(0, 10) : "";
      const sex = currentProfile?.sex || "";
      const sexOptions = [
        ["female", "Feminino"],
        ["male", "Masculino"],
      ];
      const activityLevel = currentProfile?.activityLevel || "";
      const activityLevelOptions = [
        ["sedentary", "Sedentário (pouco ou nenhum exercício)"],
        ["light", "Leve (exercício leve 1-3x/semana)"],
        ["moderate", "Moderado (exercício moderado 3-5x/semana)"],
        ["active", "Ativo (exercício intenso 6-7x/semana)"],
        ["very_active", "Muito ativo (exercício intenso diário ou físico)"],
      ];

      const garmentLastReplacedAt = currentProfile?.garmentLastReplacedAt
        ? String(currentProfile.garmentLastReplacedAt).slice(0, 10)
        : "";
      const today = new Date().toISOString().slice(0, 10);
      const daysSinceReplaced = garmentLastReplacedAt
        ? Math.floor((Date.now() - new Date(`${garmentLastReplacedAt}T00:00:00`).getTime()) / 86_400_000)
        : null;
      const garmentOverdue = daysSinceReplaced !== null && daysSinceReplaced >= 120;
      const garmentHint =
        daysSinceReplaced === null
          ? ""
          : `<p class="settings-hint${garmentOverdue ? " warning" : ""}">${daysSinceReplaced} dia${daysSinceReplaced === 1 ? "" : "s"} desde a última troca da meia${garmentOverdue ? " — a compressão cai com o uso, considere trocar." : "."}</p>`;

      const buildOptions = (options, selectedValue, asPairs = false) => {
        const pairs = asPairs ? options : options.map((value) => [value, value]);
        return [`<option value="">Não informado</option>`]
          .concat(
            pairs.map(
              ([value, label]) => `<option value="${escapeHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeHtml(label)}</option>`
            )
          )
          .join("");
      };

      return `
        <form class="settings-form" data-panel-form="profile">
          <div class="profile-photo-card">
            <button class="avatar profile-avatar" type="button" data-avatar-trigger aria-label="Alterar foto do perfil">
              <span data-avatar-initial>${initial}</span>
            </button>
            <div>
              <strong>Foto do perfil</strong>
              <p>Toque para escolher uma imagem da galeria.</p>
            </div>
          </div>
          <label class="settings-field">Nome
            <input name="name" value="${escapeHtml(name)}" autocomplete="name">
          </label>
          <label class="settings-field">E-mail
            <input name="email" type="email" value="${escapeHtml(email)}" autocomplete="email">
          </label>
          <label class="settings-field">Objetivo
            <select name="goal">
              ${goalOptions.map((option) => `<option${option === goal ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}
            </select>
          </label>
          <label class="settings-field">Altura <small>(cm — usada para calcular seu IMC e sua meta calórica)</small>
            <input name="heightCm" type="number" min="100" max="230" inputmode="numeric" value="${currentProfile?.heightCm || ""}" placeholder="Ex.: 165">
          </label>
          <label class="settings-field">Data de nascimento <small>(usada para calcular sua meta calórica individual)</small>
            <input type="date" name="birthdate" value="${birthdate}" max="${today}">
          </label>
          <label class="settings-field">Sexo biológico <small>(usado para calcular sua meta calórica individual)</small>
            <select name="sex">${buildOptions(sexOptions, sex, true)}</select>
          </label>
          <label class="settings-field">Nível de atividade física <small>(usado para calcular sua meta calórica individual)</small>
            <select name="activityLevel">${buildOptions(activityLevelOptions, activityLevel, true)}</select>
          </label>
          <label class="settings-field">Estágio do lipedema <small>(conforme diagnóstico médico)</small>
            <select name="lipedemaStage">${buildOptions(stageOptions, stage, true)}</select>
          </label>
          <label class="settings-field">Tipo do lipedema <small>(conforme diagnóstico médico)</small>
            <select name="lipedemaType">${buildOptions(typeOptions, type, true)}</select>
          </label>
          <label class="settings-field">Classe de compressão da meia
            <select name="garmentCompressionClass">${buildOptions(compressionOptions, compressionClass)}</select>
          </label>
          <label class="settings-field">Data da última troca da meia
            <input type="date" name="garmentLastReplacedAt" value="${garmentLastReplacedAt}" max="${today}">
          </label>
          ${garmentHint}
          <div class="settings-action-row">
            <button class="panel-button" type="submit">Salvar perfil</button>
            <button class="panel-button secondary" type="button" data-panel-action="avatar">Alterar foto</button>
          </div>
        </form>
      `;
    },
  },
  cycle: {
    title: "Prefer&ecirc;ncias do ciclo",
    render() {
      stepperValues.cycleLength.value = currentProfile?.cycleLength || 28;
      stepperValues.periodLength.value = currentProfile?.periodLength || 5;
      const lastPeriodStart = currentProfile?.lastPeriodStart ? String(currentProfile.lastPeriodStart).slice(0, 10) : "";
      const today = new Date().toISOString().slice(0, 10);
      return `
        <div class="settings-form">
          <label class="settings-field">Data do &uacute;ltimo in&iacute;cio do ciclo
            <input type="date" data-cycle-field="lastPeriodStart" value="${lastPeriodStart}" max="${today}">
          </label>
          <label class="settings-field">Dura&ccedil;&atilde;o do ciclo
            <div class="stepper-row" data-stepper="cycleLength">
              <button type="button" data-step="-1">-</button>
              <output>${stepperValues.cycleLength.value} dias</output>
              <button type="button" data-step="1">+</button>
            </div>
          </label>
          <label class="settings-field">Dura&ccedil;&atilde;o da menstrua&ccedil;&atilde;o
            <div class="stepper-row" data-stepper="periodLength">
              <button type="button" data-step="-1">-</button>
              <output>${stepperValues.periodLength.value} dias</output>
              <button type="button" data-step="1">+</button>
            </div>
          </label>
          <button class="panel-button" type="button" data-panel-action="save-cycle">Salvar prefer&ecirc;ncias</button>
        </div>
      `;
    },
  },
  reminders: {
    title: "Lembretes",
    render() {
      const dailyEnabled = currentProfile?.reminderDailyEnabled !== false;
      const cycleAlertEnabled = currentProfile?.reminderCycleAlertEnabled !== false;
      const weeklyInsightEnabled = currentProfile?.reminderWeeklyInsightEnabled === true;
      const reminderTime = currentProfile?.reminderTime || "20:00";
      const email = currentProfile?.email || "";
      return `
        <div class="settings-form">
          <div class="panel-list">
            <div class="panel-row"><span>Registrar sintomas<small>Lembrete di&aacute;rio por e-mail</small></span><label class="switch"><input type="checkbox" data-reminder-field="dailyEnabled"${dailyEnabled ? " checked" : ""}><i></i></label></div>
            <div class="panel-row"><span>In&iacute;cio do ciclo<small>Alertar previs&atilde;o menstrual por e-mail</small></span><label class="switch"><input type="checkbox" data-reminder-field="cycleAlertEnabled"${cycleAlertEnabled ? " checked" : ""}><i></i></label></div>
            <div class="panel-row"><span>Insights semanais<small>Resumo aos domingos por e-mail</small></span><label class="switch"><input type="checkbox" data-reminder-field="weeklyInsightEnabled"${weeklyInsightEnabled ? " checked" : ""}><i></i></label></div>
          </div>
          <label class="settings-field">Hor&aacute;rio do lembrete di&aacute;rio
            <input type="time" data-reminder-field="time" value="${reminderTime}">
          </label>
          <p class="settings-hint">${email ? `Os lembretes s&atilde;o enviados por e-mail para ${escapeHtml(email)}.` : "Cadastre um e-mail v&aacute;lido para receber os lembretes."}</p>
          <button class="panel-button" type="button" data-panel-action="save-reminders">Salvar lembretes</button>
        </div>
      `;
    },
  },
  goals: {
    title: "Meta de sintomas",
    render() {
      const lastGoal = [...recordHistory].reverse().find((record) => record.recordType === "save-goals");
      const maxDor = Number(lastGoal?.payload?.fields?.maxDor) || 5;
      const maxEdema = Number(lastGoal?.payload?.fields?.maxEdema) || 5;
      return `
        <div class="settings-form">
          <article class="settings-mini-card">
            <strong>Meta atual</strong>
            <p>${lastGoal ? `Manter dor abaixo de ${maxDor}/10 e edema abaixo de ${maxEdema}/10.` : "Voc&ecirc; ainda n&atilde;o definiu uma meta. Ajuste os controles abaixo e salve."}</p>
          </article>
          <label class="range-line" style="--color: #f43f82">
            <span>Dor m&aacute;xima <output>${maxDor}</output></span>
            <input type="range" name="maxDor" min="0" max="10" value="${maxDor}">
          </label>
          <label class="range-line" style="--color: #8b5cf6">
            <span>Edema m&aacute;ximo <output>${maxEdema}</output></span>
            <input type="range" name="maxEdema" min="0" max="10" value="${maxEdema}">
          </label>
          <button class="panel-button" type="button" data-panel-action="save-goals">Salvar meta</button>
        </div>
      `;
    },
  },
  premium: {
    title: "Plano Premium",
    content: `
      <div class="settings-form">
        <article class="settings-mini-card premium-panel">
          <strong>Recursos liberados</strong>
          <p>Insights avan&ccedil;ados, relat&oacute;rios em PDF, comparativos e exporta&ccedil;&atilde;o de dados est&atilde;o dispon&iacute;veis gratuitamente enquanto o app est&aacute; em lan&ccedil;amento.</p>
        </article>
        <div class="panel-list">
          <div class="panel-row"><span>Cobran&ccedil;a<small>Nenhuma assinatura paga ativa</small></span><strong>Grátis</strong></div>
        </div>
      </div>
    `,
  },
  backup: {
    title: "Backup e dados",
    render() {
      return `
        <div class="settings-form">
          <article class="settings-mini-card">
            <strong>Último backup</strong>
            <p><span class="backup-status" data-backup-status>${formatBackupTimestamp(currentProfile?.lastBackupAt)}</span></p>
          </article>
          <div class="settings-action-row">
            <button class="panel-button" type="button" data-panel-action="run-backup">Fazer backup agora</button>
            <button class="panel-button secondary" type="button" data-panel-action="export-csv">Exportar CSV</button>
            <button class="panel-button secondary" type="button" data-panel-action="export-pdf">Exportar PDF</button>
            <button class="panel-button secondary" type="button" data-panel-action="export-clinical-pdf">Relatório para o médico</button>
          </div>
        </div>
      `;
    },
  },
  privacy: {
    title: "Privacidade",
    content: `
      <div class="settings-form">
        <div class="panel-list">
          <button type="button" data-settings-panel="change-password">Alterar senha</button>
          <button type="button" data-settings-panel="delete-account">Apagar conta e dados</button>
        </div>
      </div>
    `,
  },
  "change-password": {
    title: "Alterar senha",
    content: `
      <form class="settings-form" data-panel-form="change-password">
        <label class="settings-field">Senha atual
          <span class="password-field-wrap">
            <input name="currentPassword" type="password" autocomplete="current-password" required minlength="6">
            <button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha">Mostrar</button>
          </span>
        </label>
        <label class="settings-field">Nova senha
          <span class="password-field-wrap">
            <input name="newPassword" type="password" autocomplete="new-password" required minlength="6">
            <button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha">Mostrar</button>
          </span>
        </label>
        <label class="settings-field">Confirmar nova senha
          <span class="password-field-wrap">
            <input name="confirmPassword" type="password" autocomplete="new-password" required minlength="6">
            <button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha">Mostrar</button>
          </span>
        </label>
        <button class="panel-button" type="submit">Salvar nova senha</button>
      </form>
    `,
  },
  "delete-account": {
    title: "Apagar conta e dados",
    content: `
      <div class="settings-form">
        <article class="settings-mini-card">
          <strong>Isso é definitivo</strong>
          <p>Sua conta, registros, fotos e hist&oacute;rico ser&atilde;o apagados permanentemente do nosso banco de dados. N&atilde;o &eacute; poss&iacute;vel desfazer.</p>
        </article>
        <label class="settings-field">Digite sua senha para confirmar
          <span class="password-field-wrap">
            <input data-delete-account-password type="password" autocomplete="current-password">
            <button type="button" class="password-toggle" data-password-toggle aria-label="Mostrar senha">Mostrar</button>
          </span>
        </label>
        <button class="panel-button danger" type="button" data-panel-action="confirm-delete-account">Apagar conta e todos os dados</button>
      </div>
    `,
  },
  support: {
    title: "Ajuda e suporte",
    content: `
      <div class="settings-form">
        <div class="panel-list">
          <a href="https://radarlipedema.com.br/#duvidas" target="_blank" rel="noopener">Perguntas frequentes</a>
          <a href="mailto:hertima.suporte@gmail.com">Falar com suporte</a>
        </div>
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
              <figure class="pain-body-option active" data-body-view="Frente">
                <img class="pain-body-map" src="imagem/radar-frente-card.png" alt="Mapa de dor na frente do corpo">
                <figcaption>Frente</figcaption>
              </figure>
              <figure class="pain-body-option" data-body-view="Costas">
                <img class="pain-body-map" src="imagem/radar-costas-card.png" alt="Mapa de dor nas costas do corpo">
                <figcaption>Costas</figcaption>
              </figure>
            </div>
            <button class="panel-button secondary edit-areas-button" type="button" data-toggle-areas="pain-areas">
              <svg class="icon"><use href="#i-edit"></use></svg>
              <span data-areas-toggle-label>Editar &aacute;reas</span>
            </button>
            <div class="body-areas-checklist" data-areas-list="pain-areas" hidden>
              <label><input type="checkbox" name="areaCoxaEsquerda"> Coxa esquerda</label>
              <label><input type="checkbox" name="areaCoxaDireita"> Coxa direita</label>
              <label><input type="checkbox" name="areaPanturrilhaEsquerda"> Panturrilha esquerda</label>
              <label><input type="checkbox" name="areaPanturrilhaDireita"> Panturrilha direita</label>
              <label><input type="checkbox" name="areaTornozeloEsquerdo"> Tornozelo esquerdo</label>
              <label><input type="checkbox" name="areaTornozeloDireito"> Tornozelo direito</label>
              <label><input type="checkbox" name="areaQuadril"> Quadril</label>
              <label><input type="checkbox" name="areaBracoEsquerdo"> Bra&ccedil;o esquerdo</label>
              <label><input type="checkbox" name="areaBracoDireito"> Bra&ccedil;o direito</label>
            </div>
          </div>

          <label class="settings-field pain-note-field"><span>Observa&ccedil;&otilde;es <small>(opcional)</small></span>
            <textarea placeholder="Como voc&ecirc; descreveria sua dor hoje?"></textarea>
          </label>
          <button class="panel-button" type="button" data-panel-action="save-pain">Salvar dor</button>
        </div>
      `;
    },
  },
  mls: {
    title: "Munich Lipedema Score",
    render() {
      const lastMls = [...recordHistory].reverse().find((record) => record.recordType === "save-mls");
      const items = lastMls?.payload?.fields?.items || {};
      const subcutis = lastMls?.payload?.fields?.subcutis ?? "0";
      const stemmer = lastMls?.payload?.fields?.stemmer ?? "unknown";
      const checked = (key) => (items[key] ? " checked" : "");
      const initialScore = Object.entries(mlsItemPoints).reduce((total, [key, points]) => total + (items[key] ? points : 0), Number(subcutis) || 0);
      const initialStage = mlsStageFor(initialScore);

      const lastWeightRecord = [...recordHistory].reverse().find((record) => record.recordType === "save-weight");
      const weightKg = lastWeightRecord ? Number(lastWeightRecord.payload?.weight) : null;
      const heightCm = currentProfile?.heightCm ? Number(currentProfile.heightCm) : null;
      const bmi = weightKg && heightCm ? weightKg / (heightCm / 100) ** 2 : null;
      const bmiText = bmi
        ? `${bmi.toFixed(1)} (peso e altura do seu perfil)`
        : "Informe seu peso (Registrar &gt; Peso) e altura (Ajustes &gt; Perfil) para calcular";
      const bmiOk = bmi === null ? null : bmi < 40;
      const stemmerOk = stemmer === "unknown" ? null : stemmer === "negative";

      return `
        <div class="smart-register-panel mls-panel">
          <p class="panel-question">Autoavalia&ccedil;&atilde;o baseada no Munich Lipedema Score (von Lukowicz, Wagner &amp; Bauer, 2019) &mdash; n&atilde;o substitui exame cl&iacute;nico, ultrassom ou diagn&oacute;stico m&eacute;dico.</p>
          <article class="mls-score-card">
            <strong data-mls-score>${initialScore}</strong><span>/40 pontos</span>
            <p data-mls-stage>${initialStage.label}</p>
          </article>
          <p class="section-label">Hist&oacute;rico</p>
          <div class="panel-list checklist-panel">
            <label class="panel-row"><span>In&iacute;cio em fase de mudan&ccedil;a hormonal (puberdade, gravidez, menopausa)<small>2 pontos</small></span><input type="checkbox" data-mls-item="hormonal" data-mls-points="2"${checked("hormonal")}></label>
            <label class="panel-row"><span>Circunfer&ecirc;ncia ou forma dos membros n&atilde;o muda com dieta ou exerc&iacute;cio<small>4 pontos</small></span><input type="checkbox" data-mls-item="resistente" data-mls-points="4"${checked("resistente")}></label>
          </div>
          <p class="section-label">Queixas nas &aacute;reas afetadas</p>
          <div class="panel-list checklist-panel">
            <label class="panel-row"><span>Dor &agrave; press&atilde;o ou ao esfor&ccedil;o<small>3 pontos</small></span><input type="checkbox" data-mls-item="dorPressao" data-mls-points="3"${checked("dorPressao")}></label>
            <label class="panel-row"><span>Sensibilidade &agrave; press&atilde;o e ao toque<small>2 pontos</small></span><input type="checkbox" data-mls-item="sensibilidadeToque" data-mls-points="2"${checked("sensibilidadeToque")}></label>
            <label class="panel-row"><span>Manchas roxas com facilidade e sensa&ccedil;&atilde;o de frio<small>2 pontos</small></span><input type="checkbox" data-mls-item="hematomasFrio" data-mls-points="2"${checked("hematomasFrio")}></label>
            <label class="panel-row"><span>Sensa&ccedil;&atilde;o de peso ou piora do volume ao longo do dia ou com calor<small>2 pontos</small></span><input type="checkbox" data-mls-item="pesoVolume" data-mls-points="2"${checked("pesoVolume")}></label>
            <label class="panel-row"><span>Dor em repouso<small>4 pontos</small></span><input type="checkbox" data-mls-item="dorRepouso" data-mls-points="4"${checked("dorRepouso")}></label>
            <label class="panel-row"><span>Dor ao toque/palpa&ccedil;&atilde;o durante exame<small>4 pontos</small></span><input type="checkbox" data-mls-item="dorPalpacao" data-mls-points="4"${checked("dorPalpacao")}></label>
          </div>
          <p class="section-label">Morfologia</p>
          <div class="panel-list checklist-panel">
            <label class="panel-row"><span>Diferen&ccedil;a desproporcional entre corpo superior e inferior (tamanhos de roupa diferentes)<small>4 pontos</small></span><input type="checkbox" data-mls-item="disproporcao" data-mls-points="4"${checked("disproporcao")}></label>
            <label class="panel-row"><span>Pernas em formato de coluna, sem defini&ccedil;&atilde;o na regi&atilde;o do tornozelo<small>3 pontos</small></span><input type="checkbox" data-mls-item="pernasColuna" data-mls-points="3"${checked("pernasColuna")}></label>
            <label class="panel-row"><span>Irregularidades na pele das coxas ou gordura endurecida/nodular<small>2 pontos</small></span><input type="checkbox" data-mls-item="peleNodular" data-mls-points="2"${checked("peleNodular")}></label>
            <label class="panel-row"><span>Altera&ccedil;&otilde;es ortop&eacute;dicas associadas (ex.: joelho valgo)<small>4 pontos</small></span><input type="checkbox" data-mls-item="ortopedico" data-mls-points="4"${checked("ortopedico")}></label>
          </div>
          <label class="settings-field">Espessura do subcut&acirc;neo acima do tornozelo <small>(somente se voc&ecirc; tiver essa medida de um exame)</small>
            <select data-mls-subcutis>
              <option value="0"${subcutis === "0" ? " selected" : ""}>N&atilde;o sei / menos de 12mm</option>
              <option value="2"${subcutis === "2" ? " selected" : ""}>12 a 15mm</option>
              <option value="3"${subcutis === "3" ? " selected" : ""}>15 a 20mm</option>
              <option value="4"${subcutis === "4" ? " selected" : ""}>Mais de 20mm</option>
            </select>
          </label>
          <p class="section-label">O score se aplica ao seu caso?</p>
          <p class="panel-question">Sinal de Stemmer: tente beliscar e levantar uma prega de pele na base dos dedos do p&eacute; (segundo dedo).</p>
          <label class="settings-field">
            <select data-mls-stemmer>
              <option value="negative"${stemmer === "negative" ? " selected" : ""}>Consigo beliscar uma prega de pele (sinal negativo, t&iacute;pico de lipedema)</option>
              <option value="positive"${stemmer === "positive" ? " selected" : ""}>N&atilde;o consigo, a pele est&aacute; muito firme (sinal positivo, pode indicar linfedema associado)</option>
              <option value="unknown"${stemmer === "unknown" ? " selected" : ""}>Ainda n&atilde;o testei</option>
            </select>
          </label>
          <article class="mls-applicability-card">
            <p><strong>IMC:</strong> <span data-mls-bmi-text>${bmiText}</span></p>
            <p data-mls-applicability>${mlsApplicabilityText(bmiOk, stemmerOk)}</p>
          </article>
          <p class="settings-hint">O Munich Lipedema Score original foi validado em pacientes sem linfedema relevante (sinal de Stemmer negativo) e sem obesidade com IMC acima de 40. Use como refer&ecirc;ncia para conversar com seu m&eacute;dico &mdash; n&atilde;o &eacute; um diagn&oacute;stico.</p>
          <button class="panel-button" type="button" data-panel-action="save-mls">Salvar avalia&ccedil;&atilde;o</button>
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
              <figure class="pain-body-option active" data-body-view="Frente">
                <img class="pain-body-map" src="imagem/radar-frente-card.png" alt="Mapa de edema na frente do corpo">
                <figcaption>Frente</figcaption>
              </figure>
              <figure class="pain-body-option" data-body-view="Costas">
                <img class="pain-body-map" src="imagem/radar-costas-card.png" alt="Mapa de edema nas costas do corpo">
                <figcaption>Costas</figcaption>
              </figure>
            </div>
            <button class="panel-button secondary edit-areas-button" type="button" data-toggle-areas="edema-areas">
              <svg class="icon"><use href="#i-edit"></use></svg>
              <span data-areas-toggle-label>Editar &aacute;reas</span>
            </button>
            <div class="body-areas-checklist" data-areas-list="edema-areas" hidden>
              <label><input type="checkbox" name="areaCoxaEsquerda"> Coxa esquerda</label>
              <label><input type="checkbox" name="areaCoxaDireita"> Coxa direita</label>
              <label><input type="checkbox" name="areaPanturrilhaEsquerda"> Panturrilha esquerda</label>
              <label><input type="checkbox" name="areaPanturrilhaDireita"> Panturrilha direita</label>
              <label><input type="checkbox" name="areaTornozeloEsquerdo"> Tornozelo esquerdo</label>
              <label><input type="checkbox" name="areaTornozeloDireito"> Tornozelo direito</label>
              <label><input type="checkbox" name="areaQuadril"> Quadril</label>
              <label><input type="checkbox" name="areaBracoEsquerdo"> Bra&ccedil;o esquerdo</label>
              <label><input type="checkbox" name="areaBracoDireito"> Bra&ccedil;o direito</label>
            </div>
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
      const measureLabels = [
        "Coxa direita",
        "Coxa esquerda",
        "Joelho direito",
        "Joelho esquerdo",
        "Panturrilha direita",
        "Panturrilha esquerda",
        "Tornozelo direito",
        "Tornozelo esquerdo",
      ];
      const lastMeasures = [...recordHistory].reverse().find((record) => record.recordType === "save-measures");
      const measures = measureLabels.map((label) => [label, lastMeasures?.payload?.fields?.[label] || ""]);
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
                <input inputmode="decimal" value="${value}" placeholder="0,0">
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
      const weightHistory = recordHistory.filter((record) => record.recordType === "save-weight" && typeof record.payload?.weight === "number");
      const lastWeight = weightHistory[0]?.payload?.weight ?? null;
      const previousWeight = weightHistory[1]?.payload?.weight ?? null;
      const currentValue = lastWeight ?? 60;
      const delta = lastWeight !== null && previousWeight !== null ? +(lastWeight - previousWeight).toFixed(1) : null;
      const deltaText =
        delta === null
          ? "Sem registro anterior para comparar"
          : `${delta > 0 ? "+" : ""}${delta.toFixed(1).replace(".", ",")} kg vs último registro`;

      return `
        <div class="smart-register-panel weight-register-panel">
          <article class="weight-value-card" data-weight-card data-value="${currentValue}">
            <span>Peso atual</span>
            <strong data-weight-display>${lastWeight !== null ? lastWeight.toFixed(1).replace(".", ",") : "--"} <small>kg</small></strong>
            <p><b data-weight-delta>${deltaText}</b></p>
          </article>
          <div class="weight-actions">
            <button type="button" data-weight-step="-1">-</button>
            <button type="button" data-weight-step="1">+</button>
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
            <label class="panel-row"><span>Drenagem linf&aacute;tica<small>Realizada hoje</small></span><input type="checkbox" name="drenagem"></label>
            <label class="panel-row"><span>Pressoterapia<small>Sess&atilde;o ou equipamento</small></span><input type="checkbox" name="pressoterapia"></label>
            <label class="panel-row"><span>LPG<small>Tratamento complementar</small></span><input type="checkbox" name="lpg"></label>
            <label class="panel-row"><span>Fisioterapia<small>Mobilidade e dor</small></span><input type="checkbox" name="fisioterapia"></label>
            <label class="panel-row"><span>Exerc&iacute;cio<small>Muscula&ccedil;&atilde;o, caminhada</small></span><input type="checkbox" name="exercicio"></label>
            <label class="panel-row"><span>Meia compressiva<small>Horas de uso hoje</small></span><input type="number" name="garmentHours" min="0" max="24" step="1" inputmode="numeric" placeholder="0" style="width:64px;text-align:center"></label>
            <label class="panel-row"><span>Medicamentos<small>Conforme prescri&ccedil;&atilde;o</small></span><input type="checkbox" name="medicamentos"></label>
            <label class="panel-row"><span>Suplementos<small>Conforme orienta&ccedil;&atilde;o</small></span><input type="checkbox" name="suplementos"></label>
          </div>
          <label class="settings-field pain-note-field"><span>Observa&ccedil;&otilde;es <small>(opcional)</small></span>
            <textarea placeholder="Ex.: drenagem com terapeuta X"></textarea>
          </label>
          <button class="panel-button" type="button" data-panel-action="save-treatments">Salvar tratamentos</button>
        </div>
      `;
    },
  },
  routine: {
    title: "Rotina do dia",
    render() {
      const suggestion = computeRoutineSuggestion();
      const itemsHtml = suggestion.items
        .map(
          (item) => `
            <label class="panel-row">
              <span>${item.text}${item.reason ? `<small>${item.reason}</small>` : ""}</span>
              <input type="checkbox">
            </label>
          `
        )
        .join("");
      return `
        <div class="smart-register-panel">
          <p class="panel-question">Sugest&otilde;es geradas a partir dos seus pr&oacute;prios registros de sintomas, tratamentos e ciclo.</p>
          <div class="panel-list checklist-panel">
            ${itemsHtml}
          </div>
          <p class="settings-hint">Gerado em ${suggestion.generatedAt}. N&atilde;o substitui orienta&ccedil;&atilde;o m&eacute;dica &mdash; use como lembrete organizado do seu dia.</p>
        </div>
      `;
    },
  },
  "diet-guide": {
    title: "Alimenta&ccedil;&atilde;o anti-inflamat&oacute;ria",
    render() {
      return `
        <div class="smart-register-panel diet-guide-panel">
          <p class="diet-guide-intro">Orienta&ccedil;&otilde;es gerais baseadas em material da Associa&ccedil;&atilde;o Brasileira de Lipedema (ABL) e do Dr. Alexandre Amato. N&atilde;o substitui acompanhamento com nutricionista.</p>

          <p class="section-label">Priorize</p>
          <div class="panel-list diet-guide-list good">
            ${antiInflammatoryFoodGuide.good
              .map(
                (item) =>
                  `<div class="panel-row"><span class="diet-guide-icon"><svg class="icon"><use href="#i-check"></use></svg></span><span>${item.name}${item.detail ? `<small>${item.detail}</small>` : ""}</span></div>`
              )
              .join("")}
          </div>

          <p class="section-label">Evite ou reduza</p>
          <div class="panel-list diet-guide-list avoid">
            ${antiInflammatoryFoodGuide.avoid
              .map(
                (item) =>
                  `<div class="panel-row"><span class="diet-guide-icon"><span class="x-icon"></span></span><span>${item.name}${item.detail ? `<small>${item.detail}</small>` : ""}</span></div>`
              )
              .join("")}
          </div>

          <article class="mls-applicability-card">
            <p><strong>Distribui&ccedil;&atilde;o sugerida:</strong> 40&ndash;50% carboidratos, ~30% gorduras, 20&ndash;30% prote&iacute;nas, com aten&ccedil;&atilde;o &agrave; ingest&atilde;o de fibras (cerca de 40g/dia).</p>
          </article>

          <p class="diet-guide-note">Isso &eacute; orienta&ccedil;&atilde;o geral, n&atilde;o um plano individual. Sensibilidades a l&aacute;cteos ou gl&uacute;ten variam de pessoa pra pessoa &mdash; o ideal &eacute; ajustar com um nutricionista que conhe&ccedil;a lipedema.</p>
          <button class="panel-button secondary" type="button" data-close-settings>Voltar</button>
        </div>
      `;
    },
  },
  "nutrition-dashboard": {
    title: "Hoje",
    render() {
      const data = buildNutritionDashboard();

      if (!data.goal) {
        return `
          <div class="smart-register-panel nutrition-dashboard-panel">
            <img src="imagem/imagem/scanner de alimentos-intro.png" alt="" class="food-scanner-mascot">
            <p class="diet-guide-intro">Informe idade, sexo e n&iacute;vel de atividade em Ajustes &gt; Perfil, e registre seu peso em Registrar &gt; Peso, para calcular sua meta cal&oacute;rica individualizada.</p>
            <button class="panel-button" type="button" data-settings-panel="profile">Completar perfil</button>
            <button class="panel-button secondary" type="button" data-open-register-panel="food-scanner">Escanear um prato mesmo assim</button>
            <button class="text-button diet-guide-link" type="button" data-open-register-panel="diet-guide">O que &eacute; alimenta&ccedil;&atilde;o anti-inflamat&oacute;ria? Ver orienta&ccedil;&otilde;es</button>
          </div>
        `;
      }

      const percent = Math.max(0, Math.min(100, Math.round((data.consumedCalories / data.goal.calorieGoal) * 100)));

      const macroRow = (label, consumed, goal, color) => {
        const value = goal ? Math.max(0, Math.min(100, Math.round((consumed / goal) * 100))) : 0;
        return `
          <div class="metric-row" style="--value: ${value}%; --color: ${color}">
            <span>${label}</span><span>${consumed} / ${goal} g</span><i></i>
          </div>
        `;
      };

      const mealsWithFood = data.meals.filter((meal) => meal.entries.length);
      const mealsHtml = mealsWithFood.length
        ? mealsWithFood
            .map(
              (meal) => `
                <div class="nutrition-meal-group">
                  <p class="section-label">${meal.label}</p>
                  <div class="insight-list">
                    ${meal.entries.map((entry) => entry.items.map((item) => renderFoodScanItemHtml(item)).join("")).join("")}
                  </div>
                </div>
              `
            )
            .join("")
        : `<p class="diet-guide-note">Nenhum prato escaneado hoje ainda.</p>`;

      return `
        <div class="smart-register-panel nutrition-dashboard-panel">
          <div class="nutrition-ring-wrap">
            <div class="nutrition-ring" style="--percent: ${percent}"></div>
            <div class="nutrition-ring-label">
              <strong>${data.remaining}</strong>
              <span>kcal restantes</span>
            </div>
          </div>
          <div class="nutrition-summary-row">
            <div><strong>${data.consumedCalories}</strong><span>Consumidas</span></div>
            <div><strong>${data.goal.calorieGoal}</strong><span>Meta</span></div>
            <div><strong>${data.caloriesBurned}</strong><span>Gastas</span></div>
          </div>

          ${macroRow("Carboidratos", data.consumedCarbs, data.goal.carbsG, "var(--purple)")}
          ${macroRow("Prote&iacute;na", data.consumedProtein, data.goal.proteinG, "var(--pink)")}
          ${macroRow("Gordura", data.consumedFat, data.goal.fatG, "var(--orange)")}

          <div class="nutrition-steps-row">
            <label class="settings-field">Passos de hoje <small>(usados para estimar calorias gastas)</small>
              <input type="number" inputmode="numeric" min="0" data-steps-input value="${data.steps || ""}" placeholder="Ex.: 6000">
            </label>
            <button class="panel-button secondary" type="button" data-panel-action="save-steps">Salvar passos</button>
          </div>

          <p class="section-label">Alimenta&ccedil;&atilde;o de hoje</p>
          ${mealsHtml}

          <div data-food-scan-body>
            <button class="panel-button" type="button" data-panel-action="open-food-scan-camera">Escanear novo prato</button>
            <input type="file" accept="image/*" capture="environment" data-food-scan-input hidden>
          </div>

          <p class="diet-guide-note">Estimativa da IA a partir das fotos escaneadas &mdash; n&atilde;o &eacute; uma pesagem exata. Meta calculada com a f&oacute;rmula de Mifflin-St Jeor a partir do seu perfil.</p>
          <button class="text-button diet-guide-link" type="button" data-open-register-panel="diet-guide">O que &eacute; alimenta&ccedil;&atilde;o anti-inflamat&oacute;ria? Ver orienta&ccedil;&otilde;es</button>
        </div>
      `;
    },
  },
  "food-scanner": {
    title: "Scanner de alimentos",
    render() {
      return `
        <div class="smart-register-panel food-scanner-panel">
          <img src="imagem/imagem/scanner de alimentos-intro.png" alt="" class="food-scanner-mascot">
          <p class="diet-guide-intro">Tire uma foto do seu prato. Uma IA identifica os alimentos e estima as calorias, e o app cruza cada um com a lista real de alimentos anti-inflamatórios do guia de dieta &mdash; sem achismo escondido.</p>
          <div data-food-scan-body>
            <button class="panel-button" type="button" data-panel-action="open-food-scan-camera">Tirar foto do prato</button>
            <input type="file" accept="image/*" capture="environment" data-food-scan-input hidden>
          </div>
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
            <div class="panel-row"><span>Meia compressiva<small>Usou hoje?</small></span><label class="switch"><input type="checkbox" name="usedGarmentToday"><i></i></label></div>
            <div class="panel-row" data-habit-stepper="exercise" data-value="0" data-min="0" data-max="120" data-step-size="5" data-unit="min"><span>Exerc&iacute;cio<small data-habit-value>0 min</small></span><span class="stepper-inline"><button type="button" data-habit-step="-1">-</button><button type="button" data-habit-step="1">+</button></span></div>
            <div class="panel-row" data-habit-stepper="sleep" data-value="7" data-min="0" data-max="12" data-step-size="0.5" data-unit="horas"><span>Sono<small data-habit-value>7 horas</small></span><span class="stepper-inline"><button type="button" data-habit-step="-1">-</button><button type="button" data-habit-step="1">+</button></span></div>
            <div class="panel-row"><span>Alimenta&ccedil;&atilde;o anti-inflamat&oacute;ria<small>Marcada no dia</small></span><label class="switch"><input type="checkbox" name="antiInflammatoryDiet"><i></i></label></div>
          </div>
          <button class="text-button diet-guide-link" type="button" data-open-register-panel="diet-guide">O que &eacute; alimenta&ccedil;&atilde;o anti-inflamat&oacute;ria? Ver orienta&ccedil;&otilde;es</button>
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
            <div class="panel-row"><span>Hematomas<small>Manchas ou roxos novos hoje</small></span><label class="switch"><input type="checkbox" name="hasBruising"><i></i></label></div>
            <label class="settings-field">Onde?
              <select name="bruisingLocation">
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
  settingsPanelContent.innerHTML = panel.render ? panel.render() : panel.content;
  setProfilePhoto(profilePhoto);
  settingsSheet.classList.add("open");
  settingsSheet.setAttribute("aria-hidden", "false");
}

function openRegisterPanel(panelId) {
  const panel = registerPanels[panelId];
  if (!panel) {
    return;
  }

  activeRegisterPanelId = panelId;
  settingsPanelTitle.innerHTML = panel.title;
  settingsPanelContent.innerHTML = panel.render();
  settingsSheet.classList.add("open");
  settingsSheet.setAttribute("aria-hidden", "false");
}

function closeSettingsPanel() {
  closePhotoCamera();
  closeFoodScanCamera();
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmailVerificationPanel(email) {
  const safeEmail = escapeHtml(email);
  settingsPanelTitle.textContent = "Confirme seu e-mail";
  settingsPanelContent.innerHTML = `
    <div class="settings-form">
      <article class="settings-mini-card">
        <strong>Enviamos um código</strong>
        <p>Digite o código de 6 dígitos que enviamos para <b>${safeEmail}</b> para confirmar sua conta.</p>
      </article>
      <label class="settings-field">
        <span>Código de verificação</span>
        <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="000000" data-verify-code-input autocomplete="one-time-code">
      </label>
      <div class="settings-action-row">
        <button class="panel-button" type="button" data-verify-action="confirm" data-verify-email="${safeEmail}">Confirmar código</button>
        <button class="panel-button secondary" type="button" data-verify-action="resend" data-verify-email="${safeEmail}">Reenviar código</button>
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

document.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-password-toggle]");
  if (!toggle) {
    return;
  }

  const input = toggle.previousElementSibling;
  if (!input) {
    return;
  }

  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  toggle.textContent = showing ? "Mostrar" : "Ocultar";
  toggle.setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
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

document.querySelectorAll("[data-achievement]").forEach((button) => {
  button.addEventListener("click", () => {
    const message = button.classList.contains("locked") ? button.dataset.toastLocked : button.dataset.toastUnlocked;
    showToast(message);
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
  const mlsField = event.target.closest("[data-mls-item], [data-mls-subcutis]");
  if (mlsField) {
    const subcutisPoints = Number(settingsPanelContent.querySelector("[data-mls-subcutis]")?.value || 0);
    const itemsScore = Array.from(settingsPanelContent.querySelectorAll("[data-mls-item]:checked")).reduce(
      (total, input) => total + Number(input.dataset.mlsPoints),
      0
    );
    const score = itemsScore + subcutisPoints;
    const stage = mlsStageFor(score);
    const scoreEl = settingsPanelContent.querySelector("[data-mls-score]");
    const stageEl = settingsPanelContent.querySelector("[data-mls-stage]");
    if (scoreEl) scoreEl.textContent = score;
    if (stageEl) stageEl.innerHTML = stage.label;
    return;
  }

  const stemmerField = event.target.closest("[data-mls-stemmer]");
  if (stemmerField) {
    const stemmer = stemmerField.value;
    const stemmerOk = stemmer === "unknown" ? null : stemmer === "negative";
    const bmiText = settingsPanelContent.querySelector("[data-mls-bmi-text]")?.textContent || "";
    const bmiOk = bmiText.startsWith("Informe") ? null : parseFloat(bmiText) < 40;
    const applicabilityEl = settingsPanelContent.querySelector("[data-mls-applicability]");
    if (applicabilityEl) applicabilityEl.innerHTML = mlsApplicabilityText(bmiOk, stemmerOk);
    return;
  }

  const foodScanInput = event.target.closest("[data-food-scan-input]");
  if (foodScanInput) {
    const file = foodScanInput.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast("Escolha uma imagem");
      foodScanInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      foodScanInput.value = "";
      submitFoodScan(String(reader.result));
    });
    reader.readAsDataURL(file);
    return;
  }

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
    const name = formData.get("name") || currentProfile?.name || "";
    const email = formData.get("email") || "";
    const goal = formData.get("goal") || "";
    const lipedemaStage = formData.get("lipedemaStage") || null;
    const lipedemaType = formData.get("lipedemaType") || null;
    const garmentCompressionClass = formData.get("garmentCompressionClass") || null;
    const garmentLastReplacedAt = formData.get("garmentLastReplacedAt") || null;
    const heightCm = formData.get("heightCm") || null;
    const birthdate = formData.get("birthdate") || null;
    const sex = formData.get("sex") || null;
    const activityLevel = formData.get("activityLevel") || null;
    document.querySelector("#home-title").textContent = `Ol\u00e1, ${name}`;
    saveProfileToServer({
      name,
      email,
      goal,
      photoDataUrl: profilePhoto,
      lipedemaStage,
      lipedemaType,
      garmentCompressionClass,
      garmentLastReplacedAt,
      heightCm,
      birthdate,
      sex,
      activityLevel,
    }).then(() => loadServerState());
    showToast("Perfil salvo");
    closeSettingsPanel();
    return;
  }

  if (form && form.dataset.panelForm === "change-password") {
    const formData = new FormData(form);
    const currentPassword = String(formData.get("currentPassword") || "");
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (newPassword.length < 6) {
      showToast("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast("A confirma\u00e7\u00e3o n\u00e3o bate com a nova senha.");
      return;
    }

    apiRequest("/api/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    }).then((result) => {
      if (!result || result.ok === false) {
        showToast(result?.error || "N\u00e3o foi poss\u00edvel trocar a senha.");
        return;
      }
      showToast("Senha alterada com sucesso");
      closeSettingsPanel();
    });
  }
});

settingsPanelContent.addEventListener("click", (event) => {
  const nestedCloseTrigger = event.target.closest("[data-close-settings]");
  if (nestedCloseTrigger) {
    closeSettingsPanel();
    return;
  }

  const nestedPanelTrigger = event.target.closest("[data-settings-panel]");
  if (nestedPanelTrigger) {
    openSettingsPanel(nestedPanelTrigger.dataset.settingsPanel);
    return;
  }

  const nestedRegisterTrigger = event.target.closest("[data-open-register-panel]");
  if (nestedRegisterTrigger) {
    openRegisterPanel(nestedRegisterTrigger.dataset.openRegisterPanel);
    return;
  }

  const bodyViewOption = event.target.closest("[data-body-view]");
  if (bodyViewOption) {
    bodyViewOption.parentElement.querySelectorAll("[data-body-view]").forEach((option) => {
      option.classList.toggle("active", option === bodyViewOption);
    });
    return;
  }

  const areasToggle = event.target.closest("[data-toggle-areas]");
  if (areasToggle) {
    const list = settingsPanelContent.querySelector(`[data-areas-list="${areasToggle.dataset.toggleAreas}"]`);
    const label = areasToggle.querySelector("[data-areas-toggle-label]");
    if (list && label) {
      const willShow = list.hidden;
      list.hidden = !willShow;
      label.textContent = willShow ? "Ocultar áreas" : "Editar áreas";
    }
    return;
  }

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

  const foodCameraAction = event.target.closest("[data-food-camera-action]");
  if (foodCameraAction) {
    const actionName = foodCameraAction.dataset.foodCameraAction;
    if (actionName === "capture") {
      captureFoodScanPhoto();
      return;
    }

    if (actionName === "gallery") {
      const foodScanInput = settingsPanelContent.querySelector("[data-food-scan-input]");
      closeFoodScanCamera();
      foodScanInput?.click();
      return;
    }

    closeFoodScanCamera();
    return;
  }

  const photoSlot = event.target.closest("[data-photo-slot]");
  if (photoSlot) {
    openPhotoCapture(photoSlot.dataset.photoSlot);
    return;
  }

  const photoHistoryButton = event.target.closest("[data-photo-history]");
  if (photoHistoryButton) {
    openPhotoHistory(photoHistoryButton.dataset.photoHistory);
    return;
  }

  const photoHistoryBack = event.target.closest("[data-photo-history-back]");
  if (photoHistoryBack) {
    openRegisterPanel("photos");
    return;
  }

  const weightStepButton = event.target.closest("[data-weight-step]");
  if (weightStepButton) {
    const card = document.querySelector("[data-weight-card]");
    const direction = Number(weightStepButton.dataset.weightStep);
    const nextValue = Math.max(30, Math.min(200, +(Number(card.dataset.value) + direction * 0.1).toFixed(1)));
    card.dataset.value = String(nextValue);
    card.querySelector("[data-weight-display]").innerHTML = `${nextValue.toFixed(1).replace(".", ",")} <small>kg</small>`;
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
    const habitStepperLabels = { water: "\u00c1gua ajustada", sleep: "Sono ajustado", exercise: "Exerc\u00edcio ajustado" };
    showToast(habitStepperLabels[row.dataset.habitStepper] || "Ajustado");
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

  if (actionName === "open-food-scan-camera") {
    openFoodScanCamera();
    return;
  }

  if (actionName === "confirm-delete-account") {
    const passwordInput = settingsPanelContent.querySelector("[data-delete-account-password]");
    const password = passwordInput?.value || "";

    if (!password) {
      showToast("Digite sua senha para confirmar.");
      return;
    }

    if (!window.confirm("Tem certeza? Sua conta e todos os dados ser\u00e3o apagados permanentemente.")) {
      return;
    }

    apiRequest("/api/account", {
      method: "DELETE",
      body: { password },
    }).then((result) => {
      if (!result || result.ok === false) {
        showToast(result?.error || "N\u00e3o foi poss\u00edvel apagar a conta.");
        return;
      }
      closeSettingsPanel();
      currentProfile = null;
      showScreen("login");
      showToast("Conta e dados apagados.");
    });
    return;
  }

  const messages = {
    avatar: "Foto atualizada",
    "save-cycle": "Prefer\u00eancias do ciclo salvas",
    "save-reminders": "Lembretes salvos",
    "save-goals": "Meta de sintomas salva",
    "run-backup": "Backup conclu\u00eddo agora",
    "export-csv": "CSV exportado",
    "export-json": "JSON exportado",
    "export-pdf": "PDF exportado",
    "export-clinical-pdf": "Relatório para o médico exportado",
    "save-pain": "Dor registrada",
    "save-edema": "Edema registrado",
    "save-measures": "Medidas salvas",
    "save-weight": "Peso registrado",
    "save-treatments": "Tratamentos salvos",
    "save-habits": "H\u00e1bitos salvos",
    "save-symptoms-extra": "Sintomas registrados",
    "save-photos": "Fotos salvas",
    "save-cycle-record": "Ciclo registrado",
  };

  if (actionName === "run-backup") {
    runBackup();
  }

  if (actionName === "export-pdf") {
    downloadPdfReport();
  }

  if (actionName === "export-clinical-pdf") {
    downloadClinicalPdfReport();
  }

  if (actionName === "export-csv") {
    downloadCsvExport();
  }

  if (actionName === "export-json") {
    downloadJsonExport();
  }

  if (actionName === "save-cycle") {
    const lastPeriodStart = settingsPanelContent.querySelector('[data-cycle-field="lastPeriodStart"]')?.value || "";
    saveProfileToServer({
      cycleLength: stepperValues.cycleLength.value,
      periodLength: stepperValues.periodLength.value,
      lastPeriodStart,
    }).then(() => loadServerState());
    showToast(messages[actionName]);
    closeSettingsPanel();
    return;
  }

  if (actionName === "save-mls") {
    const items = {};
    settingsPanelContent.querySelectorAll("[data-mls-item]").forEach((input) => {
      items[input.dataset.mlsItem] = input.checked;
    });
    const subcutis = settingsPanelContent.querySelector("[data-mls-subcutis]")?.value || "0";
    const stemmer = settingsPanelContent.querySelector("[data-mls-stemmer]")?.value || "unknown";
    const score = Object.entries(mlsItemPoints).reduce((total, [key, points]) => total + (items[key] ? points : 0), Number(subcutis));
    const stage = mlsStageFor(score);

    saveRecordToServer("save-mls", {
      fields: { items, subcutis, stemmer, score, stage: stage.stage },
      savedAt: new Date().toISOString(),
    }).then(() => loadServerState());
    showToast(`MLS: ${score}/40 pontos`);
    closeSettingsPanel();
    return;
  }

  if (actionName === "save-steps") {
    const stepsInput = settingsPanelContent.querySelector("[data-steps-input]");
    const steps = Math.max(0, Math.round(Number(stepsInput?.value) || 0));
    saveRecordToServer("save-steps", { steps, savedAt: new Date().toISOString() }).then(async () => {
      await loadServerState();
      openRegisterPanel("nutrition-dashboard");
    });
    showToast("Passos salvos");
    return;
  }

  if (actionName === "save-reminders") {
    const dailyEnabled = settingsPanelContent.querySelector('[data-reminder-field="dailyEnabled"]')?.checked ?? true;
    const cycleAlertEnabled = settingsPanelContent.querySelector('[data-reminder-field="cycleAlertEnabled"]')?.checked ?? true;
    const weeklyInsightEnabled = settingsPanelContent.querySelector('[data-reminder-field="weeklyInsightEnabled"]')?.checked ?? false;
    const time = settingsPanelContent.querySelector('[data-reminder-field="time"]')?.value || "20:00";
    saveProfileToServer({
      reminderDailyEnabled: dailyEnabled,
      reminderCycleAlertEnabled: cycleAlertEnabled,
      reminderWeeklyInsightEnabled: weeklyInsightEnabled,
      reminderTime: time,
    }).then(() => loadServerState());
    showToast(messages[actionName]);
    closeSettingsPanel();
    return;
  }

  showToast(messages[actionName] || "A\u00e7\u00e3o conclu\u00edda");
  if (actionName.startsWith("save-")) {
    const extra = actionName === "save-weight" ? { weight: Number(document.querySelector("[data-weight-card]")?.dataset.value) } : {};
    saveRecordToServer(actionName, {
      ...extra,
      fields: collectPanelData(),
      photos: Object.keys(photoSlotImages),
      savedAt: new Date().toISOString(),
    }).then(() => loadServerState());
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
    renderHistoryPeriodViews();
    showToast(`Per\u00edodo: ${periodLabels[periodIndex]}`);
  });
});

document.querySelectorAll('[data-panel-action="mark-period-start"]').forEach((button) => {
  button.addEventListener("click", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await saveProfileToServer({ lastPeriodStart: today });
    await loadServerState();
    showToast("Hoje marcado como 1º dia do ciclo");
  });
});

document.querySelectorAll("[data-save-register]").forEach((button) => {
  button.addEventListener("click", async () => {
    const values = getCurrentSymptomValues();
    const average = values.reduce((total, value) => total + value, 0) / values.length;
    const severityValues = [values[0], values[1], values[2], 10 - values[3]];
    const maxSeverity = Math.max(...severityValues);
    const dominantIndex = severityValues.indexOf(maxSeverity);
    const isNormal = maxSeverity <= 1;
    const dominantLevel = isNormal ? "Sem alerta" : maxSeverity >= 8 ? "Intenso" : maxSeverity >= 5 ? "Moderado" : "Leve";

    const flow = document.querySelector(".flow-grid button.active")?.dataset.flow || "Nenhum";

    await saveRecordToServer("daily_register", {
      symptoms: {
        dor: values[0],
        edema: values[1],
        sensibilidade: values[2],
        humor: values[3],
      },
      average,
      dominant: isNormal ? "Normal" : symptomDisplayNames[dominantIndex],
      dominantLevel,
      flow,
      note: document.querySelector("#register .notes-field textarea")?.value || "",
      savedAt: new Date().toISOString(),
    });

    await loadServerState();
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

renderDynamicData();
setProfilePhoto(profilePhoto);
bootApp();
