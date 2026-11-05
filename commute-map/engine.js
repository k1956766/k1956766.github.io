/* 통근 지도 계산 엔진: 역방향 RAPTOR (집 → 직장, 07:30~08:30 매분 출발의 보통·최적 시간)
   직장 도착 마감 A별로 '가장 늦은 출발시각'(LD)을 거꾸로 구하고, 집 출발 t의 소요시간 = min{A : LD_A >= t} - t.
   마감이 늦어질수록 LD는 커지기만 하므로 앞 마감의 결과를 이어서 씀(range RAPTOR).
   조건: mask(쓸 수 있는 노선 패턴), rides(최대 승차 횟수 = 환승 + 1). 경로: 한 칸의 대표 경로를 되짚어 줌. */
function makeEngine(D, opt) {
  const O = Object.assign({ slack: 90, rounds: 8, t0: 7.5 * 3600, win: 60, maxMin: 150, step: 60, detour: 1.3 }, opt || {});
  const { patStops, pso, pto, times, spOff, spP, spK, trOff, trTo, trW, cOff, cStop, cW, cxy } = D;
  const P = pso.length - 1, C = cOff.length - 1, NEG = -1e9, SN = D.S;
  const LD = new Float64Array(SN), markS = new Uint8Array(SN), markP = new Int32Array(P).fill(-1), touched = [], oldv = new Float64Array(SN);
  // 경로 되짚기용(필요할 때만 기록): 종류 0=직장까지 걷기, 1=차량, 2=환승 걷기
  const pK = new Int8Array(SN), pA = new Int32Array(SN), pB = new Int32Array(SN), pC = new Int32Array(SN);
  let mask = null, rides = O.rounds, track = false;
  const deadlines = () => { const As = []; for (let a = O.t0 + O.step; a <= O.t0 + O.win * 60 + O.maxMin * 60; a += O.step) As.push(a); return As; };
  // 07:30보다 이른 출발시각은 쓸모없으므로(집 출발은 07:30 이후) 퍼뜨리지 않음 → 결과는 같고 계산은 줄어듦
  function back(cell, A) {
    let marked = [];
    for (let j = cOff[cell]; j < cOff[cell + 1]; j++) {
      const s = cStop[j], t = A - cW[j] * 60;
      if (t > LD[s] && t >= O.t0) { LD[s] = t; marked.push(s); if (track) { pK[s] = 0; pA[s] = cW[j] * 60; } }
    }
    const relax = (list) => {
      const out = [];
      for (const s of list) {
        const ts = LD[s];
        for (let j = trOff[s]; j < trOff[s + 1]; j++) {
          const u = trTo[j], t = ts - trW[j] * 60;
          if (t > LD[u] && t >= O.t0) { LD[u] = t; out.push(u); if (track) { pK[u] = 2; pA[u] = s; pB[u] = trW[j] * 60; } }
        }
      }
      return out;
    };
    for (let r = 0; r < rides && marked.length; r++) {
      for (const p of touched) markP[p] = -1; touched.length = 0;
      for (const s of marked) for (let j = spOff[s]; j < spOff[s + 1]; j++) {
        const p = spP[j], k = spK[j];
        if (mask && !mask[p]) continue;
        if (markP[p] < 0) touched.push(p); if (k > markP[p]) markP[p] = k;
      }
      const nm = [];
      for (const p of touched) {
        const k0 = markP[p];
        const so = pso[p], ns = pso[p + 1] - so, to = pto[p], nt = (pto[p + 1] - to) / (2 * ns); let trip = -1, selK = -1;
        for (let k = k0; k >= 0; k--) {
          const s = patStops[so + k];
          if (trip >= 0) {
            const d = times[to + trip * 2 * ns + 2 * k + 1] - O.slack;
            if (d > LD[s] && d >= O.t0) {
              if (!markS[s]) { markS[s] = 1; oldv[s] = LD[s]; nm.push(s); }
              LD[s] = d; if (track) { pK[s] = 1; pA[s] = p; pB[s] = trip; pC[s] = selK; }
            }
          }
          const pt = markS[s] ? oldv[s] : LD[s];
          if (pt > NEG / 2 && (trip < 0 || times[to + trip * 2 * ns + 2 * k] <= pt)) {
            let lo = trip < 0 ? 0 : trip, hi = nt - 1, f = -1;
            while (lo <= hi) { const m = (lo + hi) >> 1; if (times[to + m * 2 * ns + 2 * k] <= pt) { f = m; lo = m + 1; } else hi = m - 1; }
            if (f >= 0 && f !== trip) { trip = f; selK = k; }
          }
        }
      }
      for (const s of nm) markS[s] = 0;
      marked = nm.concat(relax(nm));
    }
  }
  function setOpts(o) { mask = (o && o.mask) || null; rides = Math.min(O.rounds, (o && o.rides) || O.rounds); }
  // 직장 칸 → { data: [보통(C) | 최적(C)] 분(255 = 150분 안에 못 감), med: 칸별 '보통' 출발이 맞춘 마감 번호 }
  function query(cell, o) {
    setOpts(o); track = false;
    const T0 = O.t0, maxT = O.maxMin * 60, As = deadlines();
    LD.fill(NEG);
    const snap = new Float32Array(As.length * SN), cx = cxy[2 * cell], cy = cxy[2 * cell + 1];
    for (let i = 0; i < As.length; i++) { back(cell, As[i]); snap.set(LD, i * SN); }
    const f = (c, i, wk) => { const A = As[i], base = i * SN; let m = A - wk; for (let j = cOff[c]; j < cOff[c + 1]; j++) { const v = snap[base + cStop[j]] - cW[j] * 60; if (v > m) m = v; } return m; };
    const out = new Uint8Array(2 * C), med = new Uint8Array(C).fill(255), n = O.win, tt = new Float64Array(n), ai = new Int32Array(n), ord = Array.from({ length: n }, (_, k) => k), last = As.length - 1;
    const enc = (v) => (v >= maxT ? 255 : Math.min(254, Math.floor(v / 60)));
    for (let c = 0; c < C; c++) {
      const wk = Math.hypot(cxy[2 * c] - cx, cxy[2 * c + 1] - cy) * O.detour / 75 * 60;
      if (f(c, last, wk) < T0) { out[c] = 255; out[C + c] = 255; continue; }
      let lo = 0, hi = last; while (lo < hi) { const m = (lo + hi) >> 1; if (f(c, m, wk) >= T0) hi = m; else lo = m + 1; }
      let i = lo, fi = f(c, i, wk);
      for (let k = 0; k < n; k++) { const t = T0 + k * 60; while (i <= last && fi < t) { i++; if (i <= last) fi = f(c, i, wk); } tt[k] = i <= last ? As[i] - t : 1e9; ai[k] = i; }
      ord.sort((x, y) => tt[x] - tt[y]);
      const mk = ord[(n - 1) >> 1];
      out[c] = enc(tt[mk]); out[C + c] = enc(tt[ord[0]]);
      if (tt[mk] < maxT && ai[mk] <= last && ai[mk] < 255) med[c] = ai[mk];
    }
    return { data: out, med };
  }
  // 대표 경로: 직장 칸 work, 집 칸 home, 마감 번호 ai(query의 med) → 구간 목록
  function path(work, home, ai, o) {
    setOpts(o); track = true;
    const As = deadlines(), A = As[ai]; LD.fill(NEG); back(work, A); track = false;
    const legs = [];
    // 집에서 나설 수 있는 가장 늦은 시각을 주는 정류장(또는 직접 걷기)
    const wk = Math.hypot(cxy[2 * home] - cxy[2 * work], cxy[2 * home + 1] - cxy[2 * work + 1]) * O.detour / 75 * 60;
    let best = A - wk, s0 = -1, w0 = 0;
    for (let j = cOff[home]; j < cOff[home + 1]; j++) { const v = LD[cStop[j]] - cW[j] * 60; if (v > best) { best = v; s0 = cStop[j]; w0 = cW[j] * 60; } }
    if (s0 < 0) return { depart: Math.round(A - wk), arrive: A, legs: [{ k: 'walk', sec: Math.round(wk), to: 'work' }] };
    legs.push({ k: 'walk', sec: w0, to: s0 });
    let s = s0, guard = 0, arrive = A;
    while (guard++ < 30) {
      if (pK[s] === 0) { legs.push({ k: 'walk', sec: pA[s], to: 'work' }); break; }
      if (pK[s] === 2) { legs.push({ k: 'walk', sec: pB[s], to: pA[s] }); s = pA[s]; continue; }
      const p = pA[s], trip = pB[s], e = pC[s], so = pso[p], ns = pso[p + 1] - so, to = pto[p];
      let kb = -1; for (let k = 0; k <= e; k++) if (patStops[so + k] === s) kb = k;
      const es = patStops[so + e];
      legs.push({ k: 'ride', p, from: s, to: es, dep: times[to + trip * 2 * ns + 2 * kb + 1], arr: times[to + trip * 2 * ns + 2 * e], stops: e - kb });
      if (es === s) break; s = es;
    }
    return { depart: Math.round(best), arrive, legs };
  }
  return { query, path, C, P };
}
if (typeof module !== 'undefined') module.exports = { makeEngine };
