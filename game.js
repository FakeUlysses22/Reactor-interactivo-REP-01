
//Reactor interactivo test 1

(() => {

 
  const el = id => document.getElementById(id);

  const app          = el("app");
  const userNameEl   = el("userName");
  const switchUserBtn = el("switchUserBtn");
  const fullscreenBtn = el("fullscreenBtn");

  const timeLeftEl    = el("timeLeft");
  const durationReadEl = el("durationRead");
  const bestEl        = el("best");

  const lamp       = el("lamp");
  const statusText = el("statusText");

  const powerRead  = el("powerRead");
  const tempRead   = el("tempRead");
  const pressRead  = el("pressRead");
  const powerHint  = el("powerHint");
  const tempHint   = el("tempHint");
  const pressHint  = el("pressHint");

  const runScoreEl  = el("runScore");
  const scoreHintEl = el("scoreHint");
  const eventText   = el("eventText");

  const microTag  = el("microTag");
  const microBody = el("microBody");

  const rodsSlider = el("rodsSlider");
  const coolSlider = el("coolSlider");
  const rodsPct    = el("rodsPct");
  const coolPct    = el("coolPct");

  const scramBtn   = el("scramBtn");
  const bankBtn    = el("bankBtn");
  const startBtn   = el("startBtn");
  const restartBtn = el("restartBtn");

  const overlay     = el("overlay");
  const overlayClose = el("overlayClose");
  const nickInput   = el("nickInput");
  const loginBtn    = el("loginBtn");
  const guestBtn    = el("guestBtn");

  const endOverlay  = el("endOverlay");
  const endTitle    = el("endTitle");
  const endBody     = el("endBody");
  const endHint     = el("endHint");
  const playAgainBtn = el("playAgainBtn");
  const closeEndBtn  = el("closeEndBtn");

  const showAllBtn = el("showAllBtn");
  const showMeBtn  = el("showMeBtn");
  const lbBody     = el("lbBody");

  const canvas = el("reactorCanvas");
  const ctx    = canvas.getContext("2d");

  // claves localStorage
  const K = {
    currentUser: "cn_rvr_current_user_v1",
    users:  "cn_rvr_users_v1",
    scores: "cn_rvr_scores_v1",
    best:   "cn_rvr_best_v1",
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) ?? fallback) : fallback;
    } catch { return fallback; }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  // parámetros del juego - calibrados a mano, no tocar sin probar
  const CONFIG = {
    duration: 60,
    tutorialSeconds: 12,   // los primeros segundos son más lentos pa que la gente entienda
    scramPenaltyMultiplier: 0.55,
    meltdownMax: 100,
    redGrace: 1.05,        // cuánto tiempo en rojo antes de que se acelere el meltdown
    scoreRate: 1.0,
    riskRate: 1.0,
    eventMinGap: 6.5,
    eventMaxGap: 10.0,
    eventDuration: 2.6,
  };

  // estado del juego - todo en un objeto pa no andar pasando vars
  const S = {
    running: false,
    tLeft: CONFIG.duration,

    rods: 55,    // 0 = retiradas (máx reactividad), 100 = insertas (apagado)
    coolant: 55,

    power: 40,   // 0..120
    temp: 40,
    press: 35,
    xenon: 18,   // veneno retardado, se acumula con potencia alta
    meltdown: 0,
    redTime: 0,

    runScore: 0,
    scramDebuff: 0,

    event: null,
    eventUntil: 0,
    nextEventAt: 0,
    cavitation: 0,  // reduce efectividad del coolant
    voidSpike: 0,   // feedback positivo transitorio (el efecto void del RBMK)

    microCooldown: 0,
    lastMicroKey: "",
  };

  // usuario actual
  let currentUser = loadJSON(K.currentUser, { nick: "Invitado" });
  if (!currentUser?.nick) currentUser = { nick: "Invitado" };
  userNameEl.textContent = currentUser.nick;

  let best = Number(localStorage.getItem(K.best) || "0");
  if (!Number.isFinite(best)) best = 0;
  bestEl.textContent = String(Math.floor(best));

  // utils
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp  = (a, b, t) => a + (b - a) * t;
  const now   = () => performance.now() / 1000;

  function setLamp(state) {
    lamp.classList.remove("green", "yellow", "red");
    lamp.classList.add(state);
  }

  function showOverlay() {
    overlay.classList.remove("hidden");
    nickInput.value = "";
    nickInput.focus();
  }
  function hideOverlay() { overlay.classList.add("hidden"); }

  function showEnd(title, body, hint) {
    endTitle.textContent = title;
    endBody.innerHTML   = body;
    endHint.textContent = hint;
    endOverlay.classList.remove("hidden");
  }
  function hideEnd() { endOverlay.classList.add("hidden"); }

  function sanitizeNick(raw) {
    const s = (raw || "").trim().toUpperCase();
    return s.replace(/[^A-Z0-9_-]/g, "").slice(0, 14) || "INVITADO";
  }

  function ensureUser(nick) {
    const users = loadJSON(K.users, []);
    if (!users.some(u => u.nick === nick)) {
      users.push({ nick, createdAt: Date.now() });
      saveJSON(K.users, users);
    }
  }

  function setCurrentUser(nick) {
    currentUser = { nick };
    saveJSON(K.currentUser, currentUser);
    userNameEl.textContent = nick;
  }

  function addScoreRecord(rec) {
    const scores = loadJSON(K.scores, []);
    scores.push(rec);
    saveJSON(K.scores, scores);
    if (rec.score > best) {
      best = rec.score;
      localStorage.setItem(K.best, String(best));
      bestEl.textContent = String(best);
    }
  }

  function getTopScores(limit = 10) {
    const scores = loadJSON(K.scores, []);
    // mejor puntaje por usuario
    const bestByNick = {};
    for (const s of scores) {
      if (!bestByNick[s.nick] || s.score > bestByNick[s.nick].score)
        bestByNick[s.nick] = s;
    }
    return Object.values(bestByNick).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  function getMyScores(nick, limit = 12) {
    return loadJSON(K.scores, [])
      .filter(s => s.nick === nick)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m =>
      ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])
    );
  }

  function renderLeaderboardTop() {
    const top = getTopScores(10);
    lbBody.innerHTML = "";
    if (!top.length) {
      lbBody.innerHTML = `<tr><td colspan="3" style="color:rgba(255,255,255,.55);padding:10px 6px;">Aún no hay puntajes. Sé el primero.</td></tr>`;
      return;
    }
    top.forEach((s, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="mono">${i+1}</td><td>${escapeHtml(s.nick)}</td><td class="right mono">${Math.floor(s.score)}</td>`;
      lbBody.appendChild(tr);
    });
  }

  function renderLeaderboardMine() {
    const mine = getMyScores(currentUser.nick || "Invitado", 12);
    lbBody.innerHTML = "";
    if (!mine.length) {
      lbBody.innerHTML = `<tr><td colspan="3" style="color:rgba(255,255,255,.55);padding:10px 6px;">Sin historial aún. Juega y cobra con BANK.</td></tr>`;
      return;
    }
    mine.forEach((s, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="mono">${i+1}</td><td>${escapeHtml(s.survived ? "BANK" : "FALLO")}</td><td class="right mono">${Math.floor(s.score)}</td>`;
      lbBody.appendChild(tr);
    });
  }

  // microlecciones - mensajes contextuales según lo que pase
  const MICRO = {
    start:  { tag:"TIP",       text:"Sube potencia para puntuar. Si se acerca al ROJO: baja reactividad o sube flujo. BANK para asegurar." },
    yellow: { tag:"OPERACIÓN", text:"AMARILLO: corrige ahora. Las emergencias se evitan con acciones tempranas." },
    red:    { tag:"PELIGRO",   text:"ROJO: riesgo crítico. BANK para asegurar o SCRAM para salvar (menos puntos/seg)." },
    xenon:  { tag:"HISTORIA",  text:"Xenón: tras alta potencia puede aparecer un bajón retardado. No sobrecorrijas con pánico." },
    cav:    { tag:"HISTORIA",  text:"Cavitación: la refrigeración efectiva baja. Reduce potencia y estabiliza el flujo." },
    void:   { tag:"HISTORIA",  text:"Vacío/ebullición: con poco flujo y calor alto, la reactividad puede dispararse." },
    bank:   { tag:"OBJETIVO",  text:"BANK: cobra y guarda tu puntaje. Estrategia: arriesga alto y retírate a tiempo." },
    scram:  { tag:"OPERACIÓN", text:"SCRAM salva, pero baja la tasa de puntaje por un rato. Úsalo como última línea." },
  };

  function setMicro(key) {
    if (S.microCooldown > 0 && key === S.lastMicroKey) return;
    const m = MICRO[key];
    if (!m) return;
    microTag.textContent  = m.tag;
    microBody.textContent = m.text;
    S.lastMicroKey   = key;
    S.microCooldown  = 3.2;
  }

  // dificultad crece con el tiempo, más lento al principio pa que aprendan
  function difficultyRamp() {
    const elapsed = CONFIG.duration - S.tLeft;
    const t   = clamp(elapsed / Math.max(1, CONFIG.duration), 0, 1);
    const tut = clamp(elapsed / CONFIG.tutorialSeconds, 0, 1);
    const base = elapsed < CONFIG.tutorialSeconds
      ? tut * tut * 0.55
      : 0.55 + t * t * 0.45;
    return clamp(base, 0, 1);
  }

  function band(v, gMax, yMax) {
    if (v <= gMax) return "green";
    if (v <= yMax) return "yellow";
    return "red";
  }

  function overallStatus() {
    const tB = band(S.temp, 72, 88);
    const pB = band(S.press, 70, 88);
    let worst = "green";
    if (tB === "red" || pB === "red")       worst = "red";
    else if (tB === "yellow" || pB === "yellow") worst = "yellow";
    if (S.meltdown > 70) worst = "red";
    else if (S.meltdown > 45 && worst === "green") worst = "yellow";
    return worst;
  }

  // eventos aleatorios durante la partida
  // el xenon es lo más interesante del RBMK - veneno retardado real
  const EVENTS = [
    {
      key: "xenon",
      apply() {
        S.xenon = clamp(S.xenon + 22, 0, 100);
        setMicro("xenon");
        eventText.textContent = "Xenón: aparecerá un bajón retardado (calma, ajuste fino).";
      }
    },
    {
      key: "cav",
      apply() {
        S.cavitation = Math.max(S.cavitation, 0.9);
        setMicro("cav");
        eventText.textContent = "Cavitación: baja la refrigeración efectiva temporalmente.";
      }
    },
    {
      key: "void",
      apply() {
        S.voidSpike = Math.max(S.voidSpike, 1.0);
        setMicro("void");
        eventText.textContent = "Vacío: riesgo de feedback positivo si estás caliente y con poco flujo.";
      }
    }
  ];

  function scheduleEvent() {
    const d = difficultyRamp();
    S.nextEventAt = now() + lerp(CONFIG.eventMaxGap, CONFIG.eventMinGap, d) + Math.random() * 2.0;
  }
  function triggerEvent() {
    const e = EVENTS[Math.floor(Math.random() * EVENTS.length)];
    S.event      = e;
    S.eventUntil = now() + CONFIG.eventDuration;
    e.apply();
    scheduleEvent();
  }

  // simulación física - un step por frame
  function simulate(dt) {
    const d = difficultyRamp();

    S.microCooldown = Math.max(0, S.microCooldown - dt);

    // decaimiento de eventos
    if (S.cavitation > 0) S.cavitation = Math.max(0, S.cavitation - dt * (0.22 + d * 0.18));
    if (S.voidSpike  > 0) S.voidSpike  = Math.max(0, S.voidSpike  - dt * (0.35 + d * 0.25));

    // xenón: se construye con potencia alta, se quema solo
    const xenBuild = (S.power / 100) * (1.0 + d * 0.9);
    const xenBurn  = 0.48 + d * 0.20;
    S.xenon = clamp(S.xenon + (xenBuild - xenBurn) * dt * 6.5, 0, 100);

    // reactividad neta
    const rodReactivity = 1 - S.rods / 100;
    const xenPenalty    = (S.xenon / 100) * (0.55 + d * 0.25);
    const lowCool  = clamp((45 - S.coolant) / 45, 0, 1);
    const hotness  = clamp((S.temp - 65) / 40, 0, 1);
    const voidRisk = lowCool * hotness;
    const voidBoost = (S.voidSpike * 0.70 + voidRisk * 0.55) * (0.45 + d * 0.90);
    const reactivity = clamp(rodReactivity + voidBoost - xenPenalty, 0, 1.25);

    // potencia
    const coolingDamp = (S.coolant / 100) * 0.12;
    const pTarget = 10 + reactivity * 105 - coolingDamp * 18;
    S.power = clamp(S.power + (pTarget - S.power) * (0.12 + d * 0.10), 0, 120);

    // temperatura y presión
    const cavLoss    = 1 - S.cavitation * 0.55;
    const coolingEff = (S.coolant / 100) * cavLoss;

    const heatIn    = (S.power / 100) * (11.5 + d * 3.5) * CONFIG.riskRate;
    const heatOut   = coolingEff * (10.2 + d * 2.4);
    const extraHeat = voidRisk * (1.0 + d * 1.4);
    S.temp = clamp(S.temp + (S.temp + heatIn - heatOut + extraHeat - S.temp) * (0.14 + d * 0.10), 0, 120);

    const pressRise = (S.temp / 100) * (6.4 + d * 2.2) + (S.power / 100) * (3.4 + d * 1.5);
    const pressFall = coolingEff * (5.4 + d * 1.7);
    S.press = clamp(S.press + (S.press + pressRise - pressFall - S.press) * (0.12 + d * 0.09), 0, 120);

    // ruido pequeño pa que no se vea estático
    const n = Math.random() - 0.5;
    S.power = clamp(S.power + n * 0.18, 0, 120);
    S.temp  = clamp(S.temp  + n * 0.28, 0, 120);
    S.press = clamp(S.press + n * 0.22, 0, 120);

    // meltdown
    const tempRed = S.temp > 88;
    const pressRed = S.press > 88;
    const runaway  = S.power > 98 && S.coolant < 45;

    let meltDelta = 0;
    if (tempRed || pressRed) meltDelta += (20 + d * 14) * CONFIG.riskRate;
    if (runaway)             meltDelta += (26 + d * 18) * CONFIG.riskRate;

    const stable = S.temp < 72 && S.press < 70;
    if (stable)                    meltDelta -= 22 + d * 10;
    else if (!tempRed && !pressRed) meltDelta -= 7;

    S.meltdown = clamp(S.meltdown + meltDelta * dt, 0, CONFIG.meltdownMax);

    const status = overallStatus();
    if (status === "red") S.redTime += dt;
    else S.redTime = Math.max(0, S.redTime - dt * 1.7);
    if (S.redTime > CONFIG.redGrace)
      S.meltdown = clamp(S.meltdown + 40 * dt, 0, CONFIG.meltdownMax);

    // puntaje: proporcional a potencia, penalizado por inestabilidad
    const powerFactor  = Math.pow(clamp(S.power / 100, 0, 1.2), 1.25);
    const safetyPenalty = (S.meltdown / 100) * 0.75 + (status === "red" ? 0.35 : status === "yellow" ? 0.12 : 0);
    const debuff = lerp(1.0, CONFIG.scramPenaltyMultiplier, clamp(S.scramDebuff, 0, 1));
    const gain   = Math.max(0, (1.2 + powerFactor * 6.2) * (1 - safetyPenalty) * debuff) * CONFIG.scoreRate;
    S.runScore += gain * dt * 60;

    if (S.scramDebuff > 0) S.scramDebuff = Math.max(0, S.scramDebuff - dt * 0.28);

    if (S.meltdown >= CONFIG.meltdownMax) { endRun(true, "meltdown"); return; }

    if (status === "yellow") setMicro("yellow");
    if (status === "red")    setMicro("red");

    S.tLeft -= dt;
    if (S.tLeft <= 0) { bankRun(true, "timeout"); return; }

    const tNow = now();
    if (S.nextEventAt === 0) scheduleEvent();
    if (tNow >= S.nextEventAt) triggerEvent();
    if (S.event && tNow > S.eventUntil) {
      S.event = null;
      eventText.textContent = "Operación nominal. Decide cuánto arriesgar.";
    }
  }

  function renderUI() {
    durationReadEl.textContent = `${CONFIG.duration}s`;
    timeLeftEl.textContent     = String(Math.max(0, Math.ceil(S.tLeft)));

    const status = overallStatus();
    setLamp(status);
    statusText.textContent = status === "green" ? "ESTABLE" : status === "yellow" ? "CUIDADO" : "PELIGRO";

    powerRead.textContent = `${Math.round(S.power)}%`;
    tempRead.textContent  = `${Math.round(S.temp)}°`;
    pressRead.textContent = `${Math.round(S.press)}%`;
    rodsPct.textContent   = String(Math.round(S.rods));
    coolPct.textContent   = String(Math.round(S.coolant));
    runScoreEl.textContent = String(Math.floor(S.runScore));

    powerHint.textContent = S.power > 95 ? "Alta (puntos altos, riesgo alto)" :
                            S.power > 75 ? "Buena para puntuar" :
                            S.power > 45 ? "Estable" : "Baja (segura, pocos puntos)";
    tempHint.textContent  = S.temp  > 88 ? "CRÍTICO" : S.temp  > 72 ? "Subiendo" : "En margen";
    pressHint.textContent = S.press > 88 ? "CRÍTICO" : S.press > 70 ? "Elevada"  : "En margen";

    scoreHintEl.textContent = S.meltdown > 70 ? "Riesgo extremo: BANK o SCRAM" :
                              S.meltdown > 45 ? "Riesgo creciendo: decide" : "Más potencia = más puntos";
  }

  // canvas - visualización del núcleo
  function resizeCanvas() {
    const { width, height } = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(width  * devicePixelRatio));
    const h = Math.max(240, Math.floor(height * devicePixelRatio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
  }

  function draw() {
    resizeCanvas();
    const w = canvas.width, h = canvas.height;
    const cx = w * 0.50, cy = h * 0.57;
    const coreR  = Math.min(w, h) * 0.28;
    const vesselR = coreR * 1.45;
    const status = overallStatus();
    const t = performance.now() / 1000;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fillRect(0, 0, w, h);

    const glow = clamp((S.power / 120) * 0.62 + (S.meltdown / 100) * 0.92, 0, 1);
    const col  = status === "red" ? [255,92,122] : status === "yellow" ? [255,209,102] : [122,167,255];

    const halo = ctx.createRadialGradient(cx, cy, coreR * 0.2, cx, cy, vesselR * 1.15);
    halo.addColorStop(0, `rgba(${col},${0.18 + glow * 0.42})`);
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, vesselR * 1.15, 0, Math.PI * 2); ctx.fill();

    ctx.lineWidth   = Math.max(2, vesselR * 0.03);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath(); ctx.arc(cx, cy, vesselR, 0, Math.PI * 2); ctx.stroke();

    ctx.lineWidth   = Math.max(1, vesselR * 0.018);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath(); ctx.arc(cx, cy, vesselR * 0.86, 0, Math.PI * 2); ctx.stroke();

    const coreGrad = ctx.createRadialGradient(cx, cy, coreR * 0.2, cx, cy, coreR);
    coreGrad.addColorStop(0, `rgba(${col},${0.10 + glow * 0.32})`);
    coreGrad.addColorStop(1, "rgba(0,0,0,0.60)");
    ctx.fillStyle = coreGrad;
    ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill();

    const colsN  = 18, rowsN = 12;
    const rodsIns = clamp(S.rods / 100, 0, 1);
    const rodH   = lerp(coreR * 0.12, coreR * 0.92, rodsIns);
    const boil   = clamp(((S.temp - 70) / 30) * 0.75 + ((S.press - 70) / 30) * 0.45, 0, 1);
    const chaos  = clamp((S.meltdown / 100) * 1.25 + (status === "red" ? 0.6 : status === "yellow" ? 0.25 : 0), 0, 1.6);

    for (let r = 0; r < rowsN; r++) {
      for (let c = 0; c < colsN; c++) {
        const gx = (c / (colsN - 1) - 0.5) * coreR * 1.75;
        const gy = (r / (rowsN - 1) - 0.5) * coreR * 1.15;
        const x = cx + gx, y = cy + gy;
        const dx = x - cx, dy = y - cy;
        if (dx*dx + dy*dy > coreR*coreR) continue;

        const chW  = coreR * 0.08;
        const chH  = coreR * 0.20;
        const wave = Math.sin(t * 2.2 + c * 0.55 + r * 0.35) * 0.5 + 0.5;
        const heat = clamp((S.power / 120) * 0.85 + wave * 0.35 - rodsIns * 0.20 + chaos * 0.10, 0, 1);

        ctx.fillStyle = `rgba(255,255,255,${0.05 + heat * 0.10})`;
        ctx.beginPath(); ctx.roundRect(x - chW/2, y - chH/2, chW, chH, chW/2); ctx.fill();

        const seg = clamp(rodH * 0.32 + (wave - 0.5) * coreR * 0.02, chH * 0.12, chH * 0.92);
        ctx.fillStyle = `rgba(0,0,0,${0.30 + rodsIns * 0.45})`;
        ctx.beginPath(); ctx.roundRect(x - chW/2, y - chH/2, chW, seg, chW/2); ctx.fill();

        if (heat > 0.62) {
          ctx.strokeStyle = `rgba(255,209,102,${0.05 + heat * 0.10})`;
          ctx.lineWidth   = 1 * devicePixelRatio;
          ctx.strokeRect(x - chW/2, y - chH/2, chW, chH);
        }

        if (boil > 0.02 && Math.random() < boil * 0.18) {
          const bx = x + (Math.random() - 0.5) * chW * 0.6;
          const by = y + (Math.random() - 0.5) * chH * 0.3;
          const br = (0.8 + Math.random() * 1.8) * devicePixelRatio;
          ctx.fillStyle = `rgba(255,255,255,${0.06 + boil * 0.13})`;
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // loop de refrigeración
    const flow  = clamp(S.coolant / 100, 0, 1);
    const pipeY = cy + vesselR * 0.78;
    const pipeW = vesselR * 1.55;
    const pipeH = vesselR * 0.14;

    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth   = Math.max(2, pipeH * 0.18);
    ctx.beginPath(); ctx.roundRect(cx - pipeW/2, pipeY - pipeH/2, pipeW, pipeH, pipeH/2); ctx.stroke();

    const streaks = Math.floor(10 + flow * 18);
    for (let i = 0; i < streaks; i++) {
      const p = (t * (0.6 + flow * 1.9) + i / streaks) % 1;
      const x = cx - pipeW/2 + p * pipeW;
      const y = pipeY + Math.sin(t * 2 + i) * 0.5 * pipeH * 0.10;
      ctx.strokeStyle = `rgba(86,240,166,${0.05 + flow * 0.13})`;
      ctx.lineWidth   = Math.max(1, pipeH * 0.10);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + pipeW * (0.03 + flow * 0.06), y); ctx.stroke();
    }

    if (status === "red")    { ctx.fillStyle = "rgba(255,92,122,0.06)";  ctx.fillRect(0,0,w,h); }
    else if (status === "yellow") { ctx.fillStyle = "rgba(255,209,102,0.04)"; ctx.fillRect(0,0,w,h); }

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = `${Math.max(10, 12 * devicePixelRatio)}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillText("RBMK CORE",   cx - vesselR * 0.95, cy - vesselR * 1.02);
    ctx.fillText("COOLANT LOOP", cx - vesselR * 0.95, pipeY + pipeH * 0.85);

    if (S.running) requestAnimationFrame(draw);
  }

  // controles
  function setRods(v) {
    S.rods = clamp(v, 0, 100);
    rodsSlider.value     = String(Math.round(S.rods));
    rodsPct.textContent  = String(Math.round(S.rods));
  }
  function setCool(v) {
    S.coolant = clamp(v, 0, 100);
    coolSlider.value    = String(Math.round(S.coolant));
    coolPct.textContent = String(Math.round(S.coolant));
  }

  rodsSlider.addEventListener("input", () => setRods(Number(rodsSlider.value)));
  coolSlider.addEventListener("input", () => setCool(Number(coolSlider.value)));

  function scram() {
    if (!S.running) return;
    setRods(100);
    setCool(clamp(S.coolant + 25, 0, 100));
    S.voidSpike   = 0;
    S.cavitation  = Math.max(0, S.cavitation - 0.60);
    S.redTime     = 0;
    S.scramDebuff = clamp(S.scramDebuff + 1.0, 0, 1); // penaliza spam de scram
    setMicro("scram");
    eventText.textContent = "SCRAM: barras insertadas. Estabiliza y decide si cobras.";
  }

  function bankRun(auto = false, cause = "bank") {
    if (!S.running) return;
    const score = Math.floor(S.runScore);
    const nick  = currentUser.nick || "Invitado";
    addScoreRecord({ nick, score, createdAt: Date.now(), duration: CONFIG.duration, survived: true, cause });
    S.running = false;
    startBtn.disabled   = false;
    restartBtn.disabled = false;
    renderLeaderboardTop();
    const msg = auto
      ? "Tiempo cumplido: la sala de control declara turno cerrado. Puntaje asegurado."
      : "Cobro confirmado: aseguraste el puntaje antes de que la máquina te cobrara a ti.";
    showEnd(
      "BANK — PUNTAJE GUARDADO",
      `<b>${msg}</b><br><br>Usuario: <b>${escapeHtml(nick)}</b><br>Puntaje: <b>${score}</b>`,
      "Consejo: busca el máximo riesgo que puedas sostener 10–15s y cobra justo antes del ROJO."
    );
  }

  function endRun(exploded, cause = "meltdown") {
    const nick = currentUser.nick || "Invitado";
    const lost = Math.floor(S.runScore);
    addScoreRecord({ nick, score: 0, createdAt: Date.now(), duration: CONFIG.duration, survived: false, cause });
    S.running = false;
    startBtn.disabled   = false;
    restartBtn.disabled = false;
    renderLeaderboardTop();
    showEnd(
      "FALLO — RONDA PERDIDA",
      `<b>${exploded ? "El núcleo entró en régimen crítico." : "Inestabilidad crítica."} La ronda se pierde.</b><br><br>Perdiste el puntaje de la ronda: <b>${lost}</b>`,
      "Lección histórica: los accidentes rara vez son un solo error; son pequeñas decisiones que se acumulan."
    );
  }

  // game loop
  let raf = null, lastTS = 0;

  function resetRun() {
    Object.assign(S, {
      tLeft: CONFIG.duration, rods: 55, coolant: 55,
      power: 40, temp: 40, press: 35, xenon: 18,
      meltdown: 0, redTime: 0, runScore: 0, scramDebuff: 0,
      event: null, eventUntil: 0, nextEventAt: 0,
      cavitation: 0, voidSpike: 0, microCooldown: 0, lastMicroKey: "",
    });
    setMicro("start");
    eventText.textContent = "Operación nominal. Decide cuánto arriesgar.";
    setRods(55); setCool(55);
    renderUI();
  }

  function startGame() {
    hideOverlay(); hideEnd();
    if (S.running) return;
    resetRun();
    S.running = true;
    startBtn.disabled   = true;
    restartBtn.disabled = false;
    lastTS = 0;
    requestAnimationFrame(draw);
    raf = requestAnimationFrame(loop);
  }

  function restartGame() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    S.running = false;
    startGame();
  }

  function loop(ts) {
    if (!S.running) return;
    if (!lastTS) lastTS = ts;
    const dt = Math.min(0.05, (ts - lastTS) / 1000);
    lastTS = ts;
    simulate(dt);
    renderUI();
    raf = requestAnimationFrame(loop);
  }

  // teclado
  window.addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    if (document.activeElement === nickInput) return;
    if (!S.running && !overlay.classList.contains("hidden")) {
      if (!["shift","control","alt","meta"].includes(k)) hideOverlay();
      return;
    }
    const step = e.shiftKey ? 6 : 3;
    if (k === " ")      { e.preventDefault(); scram(); return; }
    if (k === "enter")  { e.preventDefault(); bankRun(false, "bank"); return; }
    if (k === "w" || e.key === "ArrowUp")    setRods(S.rods - step);
    if (k === "s" || e.key === "ArrowDown")  setRods(S.rods + step);
    if (k === "d" || e.key === "ArrowRight") setCool(S.coolant + step);
    if (k === "a" || e.key === "ArrowLeft")  setCool(S.coolant - step);
  });

  // botones
  scramBtn.addEventListener("click", scram);
  bankBtn.addEventListener("click",  () => bankRun(false, "bank"));
  startBtn.addEventListener("click",   startGame);
  restartBtn.addEventListener("click", restartGame);
  playAgainBtn.addEventListener("click", startGame);
  closeEndBtn.addEventListener("click",  hideEnd);
  showAllBtn.addEventListener("click", renderLeaderboardTop);
  showMeBtn.addEventListener("click",  renderLeaderboardMine);
  switchUserBtn.addEventListener("click", showOverlay);
  overlayClose.addEventListener("click", () => overlay.classList.add("hidden"));

  loginBtn.addEventListener("click", () => {
    const nick = sanitizeNick(nickInput.value);
    ensureUser(nick);
    setCurrentUser(nick);
    hideOverlay();
    renderLeaderboardTop();
  });
  guestBtn.addEventListener("click", () => {
    setCurrentUser("Invitado");
    hideOverlay();
    renderLeaderboardTop();
  });

  fullscreenBtn.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await app.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  });

  // init
  durationReadEl.textContent = `${CONFIG.duration}s`;
  bestEl.textContent = String(Math.floor(best));
  userNameEl.textContent = currentUser.nick;
  renderLeaderboardTop();
  showOverlay();

})();
