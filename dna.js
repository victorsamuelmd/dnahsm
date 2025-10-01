function displayError(message) {
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = `<p class="text-red-500 font-semibold">${message}</p>`;
}

function displayResults(results, ageInDays) {
  const resultsDiv = document.getElementById("results");
  const ageInMonths = Math.floor(ageInDays / 30.4375);
  const remainingDays = ageInDays % 30;
  let html = `<h3 class="font-bold mb-2">Resultados (Edad: ${ageInMonths} meses y ${remainingDays} días)</h3>`;

  const formatResult = (name, zScore, flag) => {
    if (zScore === null || isNaN(zScore)) {
      return `<div class="text-sm"><strong class="text-gray-700">${name}:</strong> No calculado (falta de datos o rango inválido).</div>`;
    }
    let flagHtml = "";
    if (flag) {
      flagHtml = `<span class="text-red-500 font-semibold ml-2">(${flag}: Por favor, verifique la medición)</span>`;
    }
    return `<div class="text-sm"><strong class="text-gray-700">${name}:</strong> ${zScore.toFixed(2)} ${flagHtml}</div>`;
  };

  const indicatorNames = {
    waz: "Peso para la Edad (P/E)",
    lhfaz: "Talla/Longitud para la Edad (T/E)",
    whz: "Peso para la Talla/Longitud (P/T)",
    bmiz: "IMC para la Edad (IMC/E)",
    hcaz: "Perímetro Cefálico para la Edad (PC/E)",
  };

  const flagTranslations = {
    "Too low": "Demasiado bajo",
    "Too high": "Demasiado alto",
  };

  html += formatResult(
    indicatorNames.waz,
    results.waz,
    flagTranslations[results.flags.waz],
  );
  html += formatResult(
    indicatorNames.lhfaz,
    results.lhfaz,
    flagTranslations[results.flags.lhfaz],
  );
  html += formatResult(
    indicatorNames.whz,
    results.whz,
    flagTranslations[results.flags.whz],
  );
  if (results.bmi) {
    html += `<div class="text-sm"><strong class="text-gray-700">IMC:</strong> ${results.bmi.toFixed(2)}</div>`;
  }
  html += formatResult(
    indicatorNames.bmiz,
    results.bmiz,
    flagTranslations[results.flags.bmiz],
  );
  html += formatResult(
    indicatorNames.hcaz,
    results.hcaz,
    flagTranslations[results.flags.hcaz],
  );

  resultsDiv.innerHTML = html;
}

function calculateAgeInDays(birthDateString, measurementDateString) {
  const birthDate = new Date(`${birthDateString}T00:00:00Z`);
  const measurementDate = new Date(`${measurementDateString}T00:00:00Z`);
  const diffTime = measurementDate.getTime() - birthDate.getTime();
  if (diffTime < 0) {
    return -1;
  }
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function calculateZScore(X, L, M, S) {
  if (L !== 0) {
    return (Math.pow(X / M, L) - 1) / (L * S);
  } else {
    return Math.log(X / M) / S;
  }
}

function calculateBMI(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

function interpolateLMS(table, indexValue, indexKey) {
  if (!table) return null;
  const p1 = table.find((p) => p[indexKey] >= indexValue);
  const p0_index = table.findIndex((p) => p[indexKey] >= indexValue) - 1;
  const p0 = table[p0_index];

  if (!p0 || !p1) return null;

  if (p1[indexKey] === indexValue) {
    return { L: p1.L, M: p1.M, S: p1.S };
  }

  const x0 = p0[indexKey];
  const x1 = p1[indexKey];
  const x = indexValue;
  const weight = (x - x0) / (x1 - x0);

  const L = p0.L + weight * (p1.L - p0.L);
  const M = p0.M + weight * (p1.M - p0.M);
  const S = p0.S + weight * (p1.S - p0.S);

  return { L, M, S };
}

function calculateZScores(params) {
  const results = { flags: {} };
  const bmi = calculateBMI(params.weight, params.lengthHeight);
  results.bmi = bmi;
  results.waz = calculateAgeBasedZScore(
    "wfa",
    params.sex,
    params.ageInDays,
    params.weight,
  );
  results.hcaz = calculateAgeBasedZScore(
    "hcfa",
    params.sex,
    params.ageInDays,
    params.headCirc,
  );
  results.lhfaz = calculateLengthHeightForAgeZScore(
    params.sex,
    params.ageInDays,
    params.lengthHeight,
    params.measure,
  );
  results.bmiz = calculateAgeBasedZScore(
    "bfa",
    params.sex,
    params.ageInDays,
    bmi,
  );
  results.whz = calculateWeightForLengthHeightZScore(
    params.sex,
    params.lengthHeight,
    params.weight,
    params.measure,
  );
  results.flags.waz = flagBIV(results.waz, -6, 5);
  results.flags.lhfaz = flagBIV(results.lhfaz, -6, 6);
  results.flags.whz = flagBIV(results.whz, -5, 5);
  results.flags.bmiz = flagBIV(results.bmiz, -5, 5);
  results.flags.hcaz = flagBIV(results.hcaz, -5, 5);
  return results;
}

function calculateAgeBasedZScore(indicator, sex, ageInDays, measurement) {
  if (
    !measurement ||
    !whoGrowthCharts[indicator] ||
    !whoGrowthCharts[indicator][sex]
  )
    return null;
  const lmsParams = interpolateLMS(
    whoGrowthCharts[indicator][sex],
    ageInDays,
    "x",
  );
  if (!lmsParams) return null;
  return calculateZScore(measurement, lmsParams.L, lmsParams.M, lmsParams.S);
}

function calculateLengthHeightForAgeZScore(
  sex,
  ageInDays,
  lengthHeight,
  measure,
) {
  if (!lengthHeight) return null;
  let adjustedLH = lengthHeight;
  if (ageInDays < 730 && measure === "standing") {
    adjustedLH += 0.7;
  } else if (ageInDays >= 730 && measure === "recumbent") {
    adjustedLH -= 0.7;
  }
  const lmsParams = interpolateLMS(whoGrowthCharts.lhfa[sex], ageInDays, "x");
  if (!lmsParams) return null;
  return calculateZScore(adjustedLH, lmsParams.L, lmsParams.M, lmsParams.S);
}

function calculateWeightForLengthHeightZScore(
  sex,
  lengthHeight,
  weight,
  measure,
) {
  if (!lengthHeight || !weight) return null;
  let table, indexKey, indicator;
  if (measure === "recumbent") {
    if (lengthHeight < 45 || lengthHeight > 110) return null;
    indicator = "wfl";
  } else {
    if (lengthHeight < 65 || lengthHeight > 120) return null;
    indicator = "wfh";
  }
  if (!whoGrowthCharts[indicator] || !whoGrowthCharts[indicator][sex]) {
    return null;
  }
  table = whoGrowthCharts[indicator][sex];
  indexKey = "x";
  const lmsParams = interpolateLMS(table, lengthHeight, indexKey);
  if (!lmsParams) return null;
  return calculateZScore(weight, lmsParams.L, lmsParams.M, lmsParams.S);
}

function flagBIV(zScore, lower, upper) {
  if (zScore === null || isNaN(zScore)) return null;
  if (zScore < lower) return "Too low";
  if (zScore > upper) return "Too high";
  return null;
}

// Original hsm.html script
document.addEventListener("DOMContentLoaded", function() {
  const wflZ = document.getElementById("wflZ");
  const weightZ = document.getElementById("weightZ");
  const diagnosticarBtn = document.getElementById("diagnosticarBtn");
  const resultadoDiv = document.getElementById("resultado-diagnostico");
  const complicacionesChecklist = document.getElementById(
    "complicaciones-checklist",
  );
  const alertaComplicaciones = document.getElementById("alerta-complicaciones");
  const decisionManejoDiv = document.getElementById(
    "decision-manejo-resultado",
  );
  const planManejoTemplate = document.getElementById("plan-manejo-template");
  const plantillaTexto = document.getElementById("plantilla-texto");
  const copyBtn = document.getElementById("copy-btn");
  const pesoInput = document.getElementById("peso");

  const tabF75 = document.getElementById("tab-f75");
  const tabFtlc = document.getElementById("tab-ftlc");
  const calculatorF75 = document.getElementById("calculator-f75");
  const calculatorFtlc = document.getElementById("calculator-ftlc");

  const pesoF75Input = document.getElementById("peso-f75");
  const tipoDntF75Select = document.getElementById("tipo-dnt-f75");
  const calcularF75Btn = document.getElementById("calcular-f75-btn");
  const resultadoF75Div = document.getElementById("resultado-f75");

  const pesoFtlcInput = document.getElementById("peso-ftlc");
  const tipoDntFtlcSelect = document.getElementById("tipo-dnt-ftlc");
  const etapaFtlcSelect = document.getElementById("etapa-ftlc");
  const calcularFtlcBtn = document.getElementById("calcular-ftlc-btn");
  const resultadoFtlcDiv = document.getElementById("resultado-ftlc");

  const calcularSeguimientoBtn = document.getElementById(
    "calcular-seguimiento-btn",
  );
  const planSeguimientoTemplate = document.getElementById(
    "plan-seguimiento-template",
  );
  const plantillaSeguimientoTexto = document.getElementById(
    "plantilla-seguimiento-texto",
  );
  const copySeguimientoBtn = document.getElementById("copy-seguimiento-btn");

  const generarEgresoBtn = document.getElementById("generar-egreso-btn");
  const planEgresoTemplate = document.getElementById("plan-egreso-template");
  const plantillaEgresoTexto = document.getElementById(
    "plantilla-egreso-texto",
  );
  const copyEgresoBtn = document.getElementById("copy-egreso-btn");

  const calcularDhakaBtn = document.getElementById("calcular-dhaka-btn");
  const resultadoDhakaDiv = document.getElementById("resultado-dhaka");

  document.getElementById("measurementDate").valueAsDate = new Date();

  const calculateBtn = document.getElementById("calculateBtn");
  if (calculateBtn) {
    calculateBtn.addEventListener("click", () => {
      const params = {
        birthDate: document.getElementById("birthDate").value,
        measurementDate: document.getElementById("measurementDate").value,
        sex: document.getElementById("sex").value,
        weight: parseFloat(document.getElementById("weight-z").value) || null,
        lengthHeight:
          parseFloat(document.getElementById("lengthHeight").value) || null,
        measure: document.getElementById("measure").value,
        headCirc: parseFloat(document.getElementById("headCirc").value) || null,
      };

      if (!params.birthDate || !params.measurementDate) {
        displayError(
          "Por favor, ingrese fechas de nacimiento y medición válidas.",
        );
        return;
      }
      params.ageInDays = calculateAgeInDays(
        params.birthDate,
        params.measurementDate,
      );
      if (params.ageInDays < 0) {
        displayError(
          "La fecha de medición debe ser posterior a la fecha de nacimiento.",
        );
        return;
      }

      const results = calculateZScores(params);
      displayResults(results, params.ageInDays);

      // Auto-populate the z-score field in the diagnosis section
      if (results.whz !== null && !isNaN(results.whz)) {
        wflZ.value = results.whz.toFixed(2);
      }
    });
  }
  let clasificacion = "";
  let diagnosticoTexto = "";
  let hayComplicaciones = false;
  let dhakaScore = -1;
  let dhakaCondiciones = [];

  const f75Data = {
    estabilizacion: {
      moderada: [10, 14],
      severa_sin_edema: [7, 10],
      severa_con_edema: [4, 7],
    },
    transicion: {
      moderada: [20, 25],
      severa_sin_edema: [13, 16, 19],
      severa_con_edema: [10, 13, 16, 19],
    },
  };

  const ftlcData = {
    moderada: [
      { dias: "1 a 7", kcalRequerida: 150, kcalSobre: 500 },
      { dias: "8 a 23", kcalRequerida: 200, kcalSobre: 500 },
      { dias: "24 a 39", kcalRequerida: 200, kcalSobre: 500 },
      { dias: "40 a 70", kcalRequerida: 200, kcalSobre: 500 },
    ],
    severa: [
      { dias: "1 a 3", kcalRequerida: 80, kcalSobre: 500 },
      { dias: "4 a 7", kcalRequerida: 100, kcalSobre: 500 },
      { dias: "8 a 15", kcalRequerida: 135, kcalSobre: 500 },
      { dias: "15 a 30", kcalRequerida: 150, kcalSobre: 500 },
      { dias: "31 a 60", kcalRequerida: 200, kcalSobre: 500 },
    ],
  };

  function obtenerRangoPorDias(tipoDesnutricion, dias) {
    if (typeof dias !== 'number') {
      return "Entrada inválida. Por favor, ingrese un número.";
    }

    if (tipoDesnutricion === "moderada") {

      switch (true) {
        case (dias >= 1 && dias <= 7):
          return 0;
        case (dias >= 8 && dias <= 23):
          return 1;
        case (dias >= 24 && dias <= 39):
          return 2;
        case (dias >= 40 && dias <= 70):
          return 3;
        default:
          return "El número está fuera de los rangos definidos.";
      }
    }

    switch (true) {
      case (dias >= 1 && dias <= 3):
        return 0;
      case (dias >= 4 && dias <= 7):
        return 1;
      case (dias >= 8 && dias <= 14):
        return 2;
      case (dias >= 15 && dias <= 30):
        return 3;
      case (dias >= 31 && dias <= 60):
        return 4;
      default:
        return "El número está fuera de los rangos definidos.";
    }
  }

  function calculateFtlc(peso, tipo, etapaIndex) {
    const etapaData = ftlcData[tipo][etapaIndex];
    const kcalNecesarias = peso * etapaData.kcalRequerida;
    const sobresDia = (kcalNecesarias / etapaData.kcalSobre).toFixed(1);
    return sobresDia;

  }

  function populateEtapaFtlc() {
    const tipo = tipoDntFtlcSelect.value;
    etapaFtlcSelect.innerHTML = "";
    ftlcData[tipo].forEach((etapa, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = `Días ${etapa.dias}`;
      etapaFtlcSelect.appendChild(option);
    });
  }

function generarTextoDhaka(condiciones) {
    if (condiciones.length === 0) return "";

    const textos = {
      dhaka_apariencia: "su apariencia general es",
      dhaka_respiracion: "su respiración es",
      dhaka_piel: "el pliegue cutáneo regresa",
      dhaka_lagrimas: "sus lágrimas están"
    };

    const frases = [];
    const grupos = {};

    condiciones.forEach(cond => {
      if (!grupos[cond.name]) {
        grupos[cond.name] = [];
      }
      grupos[cond.name].push(cond.text.toLowerCase());
    });

    for (const nombre in grupos) {
      const valores = grupos[nombre];
      if (valores.length > 0) {
        const conector = " o ";
        if (nombre === 'dhaka_sed') {
          frases.push(`${valores.join(conector)}`);
        } else {
          frases.push(`${textos[nombre]} ${valores.join(conector)}`);
        }
      }
    }

    return `porque ${frases.join(", ")}`;
  }

  function getCIE10(clasificacion) {
    switch (clasificacion) {
      case "severa":
        return "E43X";
      case "moderada":
        return "E44.0";
      case "riesgo":
        return "E44.1";
      default:
        return "";
    }
  }

  function getTemplate(
    manejo,
    clasificacion,
    diagnosticoTexto,
    peso,
    f75Calculos,
    ftlcCalculos,
  ) {
    const pesoStr = peso ? `${peso} kg` : "(no especificado)";
    const cie10 = getCIE10(clasificacion);

    const complicacionesChecks = document.querySelectorAll(
      '#complicaciones-checklist input[type="checkbox"]:checked',
    );
    const concienciaAlterada = document.getElementById('complicacion-consciencia').checked;
    const glucometriaValor = parseFloat(document.getElementById('glucometria-valor').value);

    let complicacionesDesc = Array.from(complicacionesChecks)
      .map((cb) => cb.dataset.text.trim())
      .join(", ");
    let analisisComplicaciones = hayComplicaciones
      ? `Presenta signos de complicación: ${complicacionesDesc}. `
      : "Sin signos de complicación evidentes. ";

    let dhakaTexto = "";
    if (dhakaScore === 0) {
      dhakaTexto = "Clínicamente sin deshidratación (DHAKA: 0). ";
    } else if (dhakaScore > 0) {
      const textoCondiciones = generarTextoDhaka(dhakaCondiciones);
      dhakaTexto = `Clínicamente con ${resultadoDhakaDiv.textContent.split(".")[1].trim().toLowerCase()} (DHAKA: ${dhakaScore}) ${textoCondiciones}. `;
    }

    let plan = "";
    if (manejo === "hospitalario") {
      let planHidratacion =
        "C - Evaluar estado de hidratación. No usar líquidos endovenosos de mantenimiento.";
      const tieneDiarreaVomito = Array.from(complicacionesChecks).some((cb) =>
        cb.dataset.text.includes("Diarrea/vómito"),
      );
      if (dhakaScore > 0 || tieneDiarreaVomito) {
        if (concienciaAlterada) {
          planHidratacion =
            "C - Hidratar (CON alteración de conciencia): Administrar bolo de Lactato de Ringer 15 ml/kg en 1h. Tomar glucometría. NO LÍQUIDOS DE MANTENIMIENTO. Vigilar FC, FR, estado de conciencia c/10 min y diuresis horaria.";
        } else {
          if (clasificacion === "severa") {
            planHidratacion =
              "C - Hidratar (SIN alteración de conciencia, DNA Severa): Preparar 1L SRO 75 + 10ml Cloruro de Potasio y administrar 10 ml/kg/hora (máx 12h).";
          } else {
            planHidratacion =
              "C - Hidratar (SIN alteración de conciencia, DNA Moderada): Administrar 75 ml/kg de SRO 75 en 4-6 horas.";
          }
        }
      }

      let planHipoglicemia = "B - Evitar hipoglicemia: Tomar glucometría cada 4 horas y SOS si hay alteración de conciencia. Corregir con cautela.";
      if (!isNaN(glucometriaValor)) {
          if (glucometriaValor < 54) {
              const resumen = `B - Glucosa ${glucometriaValor} mg/dl (Hipoglicemia), por lo que se inicia manejo:\n`;
              let planDetallado = "";
              if (concienciaAlterada) {
                  planDetallado = `    - Administre un bolo de DAD 10 %, a razón de 5 ml/kg por SNG o vía endovenosa en cinco minutos.\n    - Repita la glucometria a los 15 minutos si se administró endovenosa, o a los 30 minutos si se administró por vía enteral.\n    - Si persiste hipoglicemia, repita el bolo de DAD 10 % de 5 ml/kg.\n    - Repita la glucometría.\n    - Si hay mejoría, continúe con F-75 por SNG cada 30 minutos, a razón de 3 ml/kg/toma, durante 2 horas.\n    - Repita la glucometría cada hora.\n    - Si persiste la hipoglicemia, presenta hipotermia o el nivel de consciencia se deteriora, continúe con manejo individualizado y descarte patologías infecciosas.`;
              } else {
                  planDetallado = `    - Administre un bolo de DAD 10 %, a razón de 5 ml/kg/dosis por vía oral o por SNG.\n    - Tome una glucometria a los 30 minutos.\n    - Si persiste la hipoglicemia, repita el bolo de DAD10 % de 5 ml/kg.\n    - Si hay mejoría, continúe con F-75, a razón de 3 ml/kg/toma cada 30 minutos durante 2 horas por vía oral o por SNG.`;
              }
              planHipoglicemia = resumen + planDetallado;
          } else {
              planHipoglicemia = `B - Glucosa ${glucometriaValor} mg/dl (Normal), por lo que se continuará vigilancia cada 4 horas y SOS si hay alteración de conciencia.`;
          }
      }

      let tipoF75 = "";
      if (clasificacion === "moderada") tipoF75 = "moderada";
      if (clasificacion === "severa") {
        const edema =
          document.querySelector('input[name="edema"]:checked').value === "si";
        tipoF75 = edema ? "severa_con_edema" : "severa_sin_edema";
      }
      const ampicilinaDosis = Math.round(peso * 50);
      const volTomaDia1 = Math.round(peso * f75Data.estabilizacion[tipoF75][0]);
      const mlKgDia2 = f75Data.estabilizacion[tipoF75][1];
      const mlKgDia3 = f75Data.transicion[tipoF75][0];

      plan =
        `Se decide hospitalizar para manejo de Desnutrición Aguda ${clasificacion} con complicaciones. Se inicia plan de estabilización:\n` +
        `1. A - Asegurar vía aérea, administrar O2 si es necesario.\n` +
        `2. ${planHipoglicemia}\n` +
        `3. ${planHidratacion} Vigilar estrictamente signos de sobrecarga hídrica.\n` +
        `4. D - Vigilar función renal y estimar gasto urinario.\n` +
        `5. F - Iniciar F-75: Administrar ${volTomaDia1} ml cada 3 horas. Se recomienda aumento progresivo según evolución y tolerancia: Día 2 a ${mlKgDia2} ml/kg/toma y Día 3 a ${mlKgDia3} ml/kg/toma (recalcular con peso diario).\n` +
        `6. G - Corregir Anemia Grave: Transfundir GRE (10 ml/kg en 3h) si Hb < 4, o < 6 con falla cardíaca.\n` +
        `7. H - Manejo de Hipotermia: Abrigar y mantener calor corporal.\n` +
        `8. I - Infección: Iniciar Ampicilina ${ampicilinaDosis} mg IV cada 6 horas.\n` +
        `9. L - Lactancia Materna: Continuar y promover activamente a libre demanda.\n` +
        `10. M - Micronutrientes: Iniciar Ácido Fólico 5mg VO DU. NO iniciar hierro, sulfato de zinc u otros micronutrientes en esta fase. NO desparasitar en fase aguda.\n\n` +
        `Paraclínicos: Solicitar hemograma, ionograma, BUN, creatinina, glicemia.\n` +
        `11. Pesar y tallar diariamente con técnica correcta.`;
    } else {
      if (clasificacion === "severa" || clasificacion === "moderada") {
        plan = `Se decide manejo ambulatorio de Desnutrición Aguda ${clasificacion} sin complicaciones, con prueba de apetito positiva. Se inicia manejo con FTLC (Fórmula Terapéutica Lista para Consumo), ${ftlcCalculos.sobresDia} sobres/día. Se entregan indicaciones claras a la familia y se programa seguimiento estricto. Se educan sobre signos de alarma para reconsultar.`;
      } else {
        plan = `Se decide manejo ambulatorio para ${diagnosticoTexto}. Se brindan recomendaciones nutricionales, se entregan micronutrientes si están indicados y se programa control ambulatorio. Se educan sobre signos de alarma.`;
      }
    }

    return `ANÁLISIS:\nPaciente con peso de ${pesoStr} quien presenta hallazgos clínicos y antropométricos compatibles con ${diagnosticoTexto} (CIE-10: ${cie10}). ${dhakaTexto}${analisisComplicaciones}Se considera paciente con alto riesgo de morbimortalidad que requiere intervención nutricional inmediata.\n\nPLAN:\n${plan}\n- Notificación obligatoria a Sivigila.\n- Activación de ruta de manejo integral para la desnutrición aguda.`;
  }

  function actualizarDecisionManejo() {
    const apetitoNegativo = document.getElementById("apetito-negativo").checked;
    hayComplicaciones = Array.from(
      complicacionesChecklist.querySelectorAll('input[type="checkbox"]'),
    ).some((cb) => cb.checked);
    const peso = parseFloat(document.getElementById("weight-z").value);

    if (hayComplicaciones) {
      alertaComplicaciones.classList.remove("hidden");
    } else {
      alertaComplicaciones.classList.add("hidden");
    }

    let manejo = "";
    let plantilla = "";

    if (hayComplicaciones) {
      manejo = "hospitalario";
      decisionManejoDiv.innerHTML = `<h3 class="text-2xl font-bold text-red-600 mb-2">MANEJO HOSPITALARIO</h3><p class="text-gray-600">El paciente presenta una o más complicaciones que requieren manejo intrahospitalario inmediato.</p>`;
    } else if (clasificacion === "severa") {
      if (apetitoNegativo) {
        manejo = "hospitalario";
        decisionManejoDiv.innerHTML = `<h3 class="text-2xl font-bold text-red-600 mb-2">MANEJO HOSPITALARIO</h3><p class="text-gray-600">Paciente con DNA Severa y prueba de apetito negativa. Requiere manejo intrahospitalario.</p>`;
      } else {
        manejo = "ambulatorio";
        decisionManejoDiv.innerHTML = `<h3 class="text-2xl font-bold text-green-600 mb-2">MANEJO AMBULATORIO</h3><p class="text-gray-600">Paciente con DNA Severa sin complicaciones y prueba de apetito positiva. Puede ser manejado de forma ambulatoria.</p>`;
      }
    } else if (clasificacion === "moderada" || clasificacion === "riesgo") {
      manejo = "ambulatorio";
      decisionManejoDiv.innerHTML = `<h3 class="text-2xl font-bold text-green-600 mb-2">MANEJO AMBULATORIO</h3><p class="text-gray-600">Paciente con ${diagnosticoTexto} sin complicaciones. El manejo es ambulatorio.</p>`;
    } else {
      decisionManejoDiv.innerHTML = `<p class="text-gray-500 text-lg">Complete las secciones de diagnóstico y complicaciones para generar la recomendación de manejo.</p>`;
      planManejoTemplate.classList.add("hidden");
      return;
    }

    let f75Calculos = { volumenPorToma: 0, volumenDiario: 0 };
    let ftlcCalculos = { sobresDia: 0 };

    if (!isNaN(peso) && peso > 0) {
      let tipoF75 = "";
      if (clasificacion === "moderada") tipoF75 = "moderada";
      if (clasificacion === "severa") {
        const edema =
          document.querySelector('input[name="edema"]:checked').value === "si";
        tipoF75 = edema ? "severa_con_edema" : "severa_sin_edema";
      }
      if (tipoF75) {
        const mlKgToma = f75Data.estabilizacion[tipoF75][0]; // Initial stabilization dose
        f75Calculos.volumenPorToma = Math.round(peso * mlKgToma);
        f75Calculos.volumenDiario = f75Calculos.volumenPorToma * 8;
      }

      let tipoFtlc = "";
      if (clasificacion === "moderada") tipoFtlc = "moderada";
      if (clasificacion === "severa") tipoFtlc = "severa";
      if (tipoFtlc) { ftlcCalculos.sobresDia = calculateFtlc(peso, tipoFtlc, 0) }
    }

    plantilla = getTemplate(
      manejo,
      clasificacion,
      diagnosticoTexto,
      peso,
      f75Calculos,
      ftlcCalculos,
    );
    plantillaTexto.value = plantilla;
    planManejoTemplate.classList.remove("hidden");
  }

  diagnosticarBtn.addEventListener("click", () => {
    const zScore = parseFloat(document.getElementById("wflZ").value);
    const edema =
      document.querySelector('input[name="edema"]:checked').value === "si";
    const pb = parseFloat(document.getElementById("pb").value);
    const peso = parseFloat(document.getElementById("weight-z").value);
    const glucometriaValor = parseFloat(document.getElementById('glucometria-valor').value);

    if (isNaN(peso) || peso <= 0) {
      resultadoDiv.innerHTML = `<p class="text-red-500 font-semibold">Por favor, ingrese un peso válido.</p>`;
      return;
    }
    pesoF75Input.value = peso;
    pesoFtlcInput.value = peso;

    let resultadoHTML = "";
    clasificacion = "";
    diagnosticoTexto = "";

    if (zScore <= -3) {
      clasificacion = "severa";
      diagnosticoTexto = "Desnutrición Aguda Severa";
      resultadoHTML = `<h4 class="text-2xl font-bold text-red-600">${diagnosticoTexto}</h4><ul class="mt-2 text-left list-disc list-inside text-gray-700">${edema ? "<li>Presencia de edema bilateral.</li>" : ""}${pb <= 11.5 ? `<li>PB ≤ 11.5 cm (valor: ${pb}).</li>` : ""}${!isNaN(zScore) ? `<li>P/T Z-score ≤ -3 (valor: ${zScore}).</li>` : ""}</ul>`;
    } else if (zScore > -3 && zScore <= -2) {
      clasificacion = "moderada";
      diagnosticoTexto = "Desnutrición Aguda Moderada";
      resultadoHTML = `<h4 class="text-2xl font-bold text-yellow-600">${diagnosticoTexto}</h4><p class="mt-2 text-gray-700">P/T Z-score entre -3 y -2 (valor: ${zScore}).</p>`;
    } else if (zScore > -2 && zScore <= -1) {
      clasificacion = "riesgo";
      diagnosticoTexto = "Riesgo de Desnutrición Aguda";
      resultadoHTML = `<h4 class="text-2xl font-bold text-blue-600">${diagnosticoTexto}</h4><p class="mt-2 text-gray-700">P/T Z-score entre -2 y -1 (valor: ${zScore}).</p>`;
    } else if (zScore > -1) {
      clasificacion = "normal";
      diagnosticoTexto = "Estado Nutricional Normal";
      resultadoHTML = `<h4 class="text-2xl font-bold text-green-600">${diagnosticoTexto}</h4><p class="mt-2 text-gray-700">Indicadores dentro de la normalidad (P/T Z-score: ${zScore}).</p>`;
    } else {
      clasificacion = "";
      resultadoHTML = `<p class="text-gray-500">Datos insuficientes o no válidos para clasificar.</p>`;
    }

    if (!isNaN(glucometriaValor)) {
        if (glucometriaValor < 54) {
            resultadoHTML += `<p class="mt-2 font-semibold text-red-600">Hipoglicemia (valor: ${glucometriaValor} mg/dl).</p>`;
        } else {
            resultadoHTML += `<p class="mt-2 text-gray-700">Glucometría normal (valor: ${glucometriaValor} mg/dl).</p>`;
        }
    }

    resultadoDiv.innerHTML = resultadoHTML;
    actualizarDecisionManejo();
  });

  complicacionesChecklist.addEventListener("change", actualizarDecisionManejo);

  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(plantillaTexto.value).then(() => {
      copyBtn.textContent = "¡Copiado!";
      setTimeout(() => {
        copyBtn.textContent = "Copiar";
      }, 2000);
    })
  });

  tabF75.addEventListener("click", () => {
    tabF75.classList.add("active");
    tabFtlc.classList.remove("active");
    calculatorF75.classList.remove("hidden");
    calculatorFtlc.classList.add("hidden");
  });

  tabFtlc.addEventListener("click", () => {
    tabFtlc.classList.add("active");
    tabF75.classList.remove("active");
    calculatorFtlc.classList.remove("hidden");
    calculatorF75.classList.add("hidden");
  });

  calcularF75Btn.addEventListener("click", () => {
    const peso = parseFloat(pesoF75Input.value);
    const tipo = tipoDntF75Select.value;
    if (isNaN(peso) || peso <= 0) {
      resultadoF75Div.innerHTML = `<p class="text-red-500 font-semibold">Ingrese un peso válido.</p>`;
      return;
    }

    const estabilizacionMlKg = f75Data.estabilizacion[tipo][0];
    const estabilizacionToma = Math.round(peso * estabilizacionMlKg);
    const estabilizacionDia = estabilizacionToma * 8;

    let transicionHTML = f75Data.transicion[tipo]
      .map((mlkg, index) => {
        const volToma = Math.round(peso * mlkg);
        return `<tr><td class="py-1 px-2 border">Paso ${index + 1}</td><td class="py-1 px-2 border">${volToma} ml</td></tr>`;
      })
      .join("");

    resultadoF75Div.innerHTML = `
                    <h4 class="font-bold text-lg mb-2">Fase Estabilización</h4>
                    <p><strong>Volumen por toma (24h iniciales):</strong> <span class="text-lg font-semibold text-[#A3B18A]">${estabilizacionToma} ml</span> (cada 3h)</p>
                    <h4 class="font-bold text-lg mt-4 mb-2">Fase Transición (Progresión)</h4>
                    <table class="w-full text-sm text-left border-collapse">
                        <thead><tr class="bg-gray-100"><th class="py-1 px-2 border">Etapa</th><th class="py-1 px-2 border">Volumen por Toma</th></tr></thead>
                        <tbody>${transicionHTML}</tbody>
                    </table>
                `;
  });

  tipoDntFtlcSelect.addEventListener("change", populateEtapaFtlc);

  calcularFtlcBtn.addEventListener("click", () => {
    const peso = parseFloat(pesoFtlcInput.value);
    const tipo = tipoDntFtlcSelect.value;
    const etapaIndex = etapaFtlcSelect.value;
    if (isNaN(peso) || peso <= 0 || !etapaIndex) {
      resultadoFtlcDiv.innerHTML = `<p class="text-red-500 font-semibold">Ingrese datos válidos.</p>`;
      return;
    }
    const sobresDia = calculateFtlc(peso, tipo, etapaIndex);

    resultadoFtlcDiv.innerHTML = `
                    <p class="font-semibold text-gray-800">Para un paciente de <strong class="text-[#344E41]">${peso} kg</strong> en la etapa <strong class="text-[#344E41]">Días ${ftlcData[tipo].dias}</strong>:</p>
                    <div class="mt-4">
                        <span class="block">Sobres de FTLC por día:</span>
                        <span class="text-2xl font-bold text-[#A3B18A]">${sobresDia}</span>
                    </div>
                `;
  });

  calcularSeguimientoBtn.addEventListener("click", () => {
    const peso = parseFloat(document.getElementById("peso-seguimiento").value);
    const dia = parseInt(document.getElementById("dia-tratamiento").value);
    const tipo = document.getElementById("tipo-dnt-seguimiento").value;

    if (isNaN(peso) || peso <= 0 || isNaN(dia) || dia < 1) {
      plantillaSeguimientoTexto.value =
        "Por favor, ingrese un peso y día de tratamiento válidos.";
      planSeguimientoTemplate.classList.remove("hidden");
      return;
    }

    let planNutricional = "";
    const diaTransicionFTLC = tipo === "severa_con_edema" ? 6 : 5;

    if (dia < diaTransicionFTLC) {
      let proximoMlKg;
      let proximaFaseTexto;
      if (dia === 1) {
        proximoMlKg = f75Data.estabilizacion[tipo][0];
        proximaFaseTexto = "Fase de Estabilización (primeras 24h)";
      } else if (dia === 2) {
        proximoMlKg = f75Data.estabilizacion[tipo][1];
        proximaFaseTexto = "Fase de Estabilización (25-48h)";
      } else {
        const pasosTransicion = f75Data.transicion[tipo];
        const pasoIndex = dia - 3;
        proximoMlKg = pasosTransicion[pasoIndex];
        proximaFaseTexto = `Fase de Transición (Día ${dia}, Paso ${pasoIndex + 1})`;
      }
      const nuevoVolumenToma = Math.round(peso * proximoMlKg);
      const cucharadas = (nuevoVolumenToma * 0.0365).toFixed(1);
      const agua = (nuevoVolumenToma * 0.91).toFixed(1);
      planNutricional = `N - Nutrición: Se ajusta/progresa Fórmula F-75 a ${nuevoVolumenToma} ml cada 3 horas, correspondiente a ${proximaFaseTexto}. (Preparar con ${cucharadas} cucharadas en ${agua} ml de agua).`;
    } else {
      const etapaIndex = obtenerRangoPorDias(tipo, dia);
      const sobresDia = calculateFtlc(peso, tipo, etapaIndex);
      proximaFaseTexto = `Transición a FTLC (Día ${dia})`;
      planNutricional = `N - Nutrición: Paciente cumple criterios para iniciar transición a FTLC. Se inicia manejo con ${sobresDia} sobres/día, vigilando tolerancia.`;
    }

    const plantilla =
      `ANÁLISIS:\nPaciente en día ${dia} de manejo intrahospitalario por Desnutrición Aguda. Peso actual: ${peso} kg. \n[Describir evolución clínica, tolerancia a la vía oral, diuresis, etc.]\n\nPLAN:\nSe continúa manejo según ABCDARIO:\n` +
      `A - SV: [TA: FC: FR: SatO2:]. Paciente sin dificultad respiratoria.\n` +
      `B - Glucometría: [Resultado]. Se continúa vigilancia c/4h y SOS.\n` +
      `C - Hidratación: [Hidratado/Deshidratado]. Se vigilan signos de sobrecarga hídrica.\n` +
      `D - Diuresis: [Positiva/Negativa].\n` +
      `F - Vía Oral: [Tolerancia].\n` +
      `G - Anemia: [Clínica].\n` +
      `H - Temperatura: [Valor]. Paciente normotérmico.\n` +
      `I - Infección: [Sin/Con] signos de respuesta inflamatoria.\n` +
      `L - Lactancia Materna: Se promueve activamente.\n` +
      `M - Micronutrientes: Continúa Ácido Fólico 1mg/día.\n` +
      `${planNutricional}\n` +
      `P - Piel: [Estado de la piel].\n` +
      `R - Realimentación: Sin signos de síndrome de realimentación.\n` +
      `S - Desarrollo: Se promueve estimulación y juego.\n` +
      `V - Vacunación: [Esquema].`;

    plantillaSeguimientoTexto.value = plantilla;
    planSeguimientoTemplate.classList.remove("hidden");
  });

  copySeguimientoBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(plantillaSeguimientoTexto.value).then(() => {
      copySeguimientoBtn.textContent = "¡Copiado!";
      setTimeout(() => {
        copySeguimientoBtn.textContent = "Copiar";
      }, 2000);
    })
  });

  generarEgresoBtn.addEventListener("click", () => {
    const peso = parseFloat(document.getElementById("peso-egreso").value);
    const tipo = document.getElementById("tipo-dnt-egreso").value;

    if (isNaN(peso) || peso <= 0) {
      plantillaEgresoTexto.value =
        "Por favor, ingrese un peso de egreso válido.";
      planEgresoTemplate.classList.remove("hidden");
      return;
    }

    let cie10 = tipo === "severa" ? "E43X" : "E44.0";
    const etapaData =
      tipo === "severa" ? ftlcData.severa[2] : ftlcData.moderada[1]; // Etapa post-hospitalización
    const kcalNecesarias = peso * etapaData.kcalRequerida;
    const sobresDia = (kcalNecesarias / etapaData.kcalSobre).toFixed(1);

    const plantilla =
      `ANÁLISIS:\nPaciente con diagnóstico de Desnutrición Aguda ${tipo} (CIE-10: ${cie10}) que completa 7 días de manejo intrahospitalario con adecuada evolución clínica y ganancia de peso. Peso de egreso: ${peso} kg. Cumple criterios para continuar manejo ambulatorio.\n\nPLAN DE EGRESO:\n` +
      `1. Nutrición: Continuar manejo con Fórmula Terapéutica Lista para Consumo (FTLC), administrar ${sobresDia} sobres al día, distribuidos en varias tomas.\n` +
      `2. L - Lactancia Materna: Continuar y promover activamente a libre demanda.\n` +
      `3. Recomendaciones: Educar a la familia sobre la administración de la FTLC, signos de alarma (vómito, diarrea, fiebre, rechazo a la vía oral) para reconsultar de inmediato.\n` +
      `4. Órdenes:\n` +
      `   - Cita de control en 7 días con médico general o pediatría.\n` +
      `   - Valoración por Nutrición y Trabajo Social.\n` +
      `   - Solicitar Hemograma de control.\n` +
      `   - Suministro de Ácido Fólico 1 mg/día.\n` +
      `   - Verificar y completar esquema de vacunación según PAI.\n` +
      `5. Se entrega fórmula FTLC para cubrimiento de 7 días y se asegura la comprensión del plan por parte de los cuidadores.`;

    plantillaEgresoTexto.value = plantilla;
    planEgresoTemplate.classList.remove("hidden");
  });

  copyEgresoBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(plantillaEgresoTexto.value).then(() => {
      copyEgresoBtn.textContent = "¡Copiado!";
      setTimeout(() => {
        copyEgresoBtn.textContent = "Copiar";
      }, 2000);
    });
  });

  calcularDhakaBtn.addEventListener("click", () => {
    const form = document.getElementById("dhaka-form");
    const inputs = form.querySelectorAll('input[type="radio"]:checked');
    if (inputs.length < 4) {
      resultadoDhakaDiv.textContent = "Por favor, complete todos los campos.";
      resultadoDhakaDiv.className = "mt-2 font-semibold text-gray-500";
      dhakaScore = -1;
      return;
    }
    let score = 0;
    dhakaCondiciones = [];
    inputs.forEach((input) => {
      const value = parseInt(input.value);
      if (value > 0) {
        dhakaCondiciones.push({ 
          name: input.name,
          text: input.nextElementSibling.textContent.trim()
        });
      }
      score += value;
    });
    dhakaScore = score;

    if (score <= 1) {
      resultadoDhakaDiv.textContent = `Puntaje: ${score}. Sin Deshidratación.`;
      resultadoDhakaDiv.className = "mt-2 font-semibold text-green-600";
    } else if (score >= 2 && score <= 3) {
      resultadoDhakaDiv.textContent = `Puntaje: ${score}. Algún Grado de Deshidratación.`;
      resultadoDhakaDiv.className = "mt-2 font-semibold text-yellow-600";
    } else { // score >= 4
      resultadoDhakaDiv.textContent = `Puntaje: ${score}. Deshidratación Severa.`;
      resultadoDhakaDiv.className = "mt-2 font-semibold text-red-600";
    }
    actualizarDecisionManejo(); // Recalculate plan with new DHAKA score
  });

  const accordionHeaders = document.querySelectorAll(".accordion-header");
  accordionHeaders.forEach((header) => {
    header.addEventListener("click", () => {
      const content = header.nextElementSibling;
      const icon = header.querySelector("span");
      if (content.style.maxHeight) {
        content.style.maxHeight = null;
        icon.style.transform = "rotate(0deg)";
      } else {
        document
          .querySelectorAll(".accordion-content")
          .forEach((c) => (c.style.maxHeight = null));
        document
          .querySelectorAll(".accordion-header span")
          .forEach((i) => (i.style.transform = "rotate(0deg)"));
        content.style.maxHeight = content.scrollHeight + "px";
        icon.style.transform = "rotate(180deg)";
      }
    });
  });

  const navLinks = document.querySelectorAll(".nav-link");
  const sections = document.querySelectorAll("section");
  window.addEventListener("scroll", () => {
    let current = "";
    sections.forEach((section) => {
      const sectionTop = section.offsetTop;
      if (pageYOffset >= sectionTop - 80) {
        current = section.getAttribute("id");
      }
    });
    navLinks.forEach((link) => {
      link.classList.remove("active");
      if (link.getAttribute("href").includes(current)) {
        link.classList.add("active");
      }
    });
  });

  const ctx = document.getElementById("timelineChart").getContext("2d");
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["Fases del Tratamiento"],
      datasets: [
        {
          label: "Estabilización (días)",
          data: [3],
          backgroundColor: "#FEE2E2",
          borderColor: "#EF4444",
          borderWidth: 1,
          barPercentage: 0.5,
        },
        {
          label: "Transición (días)",
          data: [11],
          backgroundColor: "#FEF3C7",
          borderColor: "#F59E0B",
          borderWidth: 1,
          barPercentage: 0.5,
        },
        {
          label: "Rehabilitación (días)",
          data: [46],
          backgroundColor: "#D1FAE5",
          borderColor: "#10B981",
          borderWidth: 1,
          barPercentage: 0.5,
        },
      ],
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: "Duración Aproximada por Fase (Total ~60 días)",
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || "";
              if (label) {
                label += ": ";
              }
              if (context.parsed.x !== null) {
                let duration = context.parsed.x;
                if (context.datasetIndex === 0) label += `1 a ${duration}`;
                if (context.datasetIndex === 1)
                  label += `${3 + 1} a ${3 + duration}`;
                if (context.datasetIndex === 2)
                  label += `${14 + 1} a ${14 + duration}`;
                label += " días";
              }
              return label;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          title: { display: true, text: "Días de Tratamiento" },
        },
        y: { stacked: true },
      },
    },
  });

  const complicacionConsciencia = document.getElementById('complicacion-consciencia');
  const dhakaLetargico = document.getElementById('dhaka-letargico');
  const dhakaNormal = document.getElementById('dhaka-normal');
  const dhakaForm = document.getElementById('dhaka-form');

  function sincronizarConsciencia(source) {
    if (source === 'complicacion' && complicacionConsciencia && dhakaLetargico && dhakaNormal) {
      if (complicacionConsciencia.checked) {
        dhakaLetargico.checked = true;
      } else {
        dhakaNormal.checked = true;
      }
    }

    if (source === 'dhaka' && complicacionConsciencia && dhakaLetargico) {
      complicacionConsciencia.checked = dhakaLetargico.checked;
    }
    
    // Disparar un evento 'change' en los formularios afectados para que otras lógicas reaccionen
    const changeEvent = new Event('change', { bubbles: true });
    if (source === 'complicacion') {
        dhakaForm.dispatchEvent(changeEvent);
    }
    
    // Llamar a las funciones de recálculo directamente
    actualizarDecisionManejo();
    if (document.getElementById('calcular-dhaka-btn')) {
        document.getElementById('calcular-dhaka-btn').click();
    }
  }

  if (complicacionConsciencia && dhakaLetargico && dhakaNormal && dhakaForm) {
    complicacionConsciencia.addEventListener('change', () => sincronizarConsciencia('complicacion'));
    dhakaForm.addEventListener('change', () => sincronizarConsciencia('dhaka'));
  }

  populateEtapaFtlc();
});
