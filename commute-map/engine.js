/* 통근 지도 계산 엔진: 역방향 RAPTOR (집 → 직장, 07:30~08:30 매분 출발의 보통·최적 시간)
   직장 도착 마감 A별로 '가장 늦은 출발시각'(LD)을 거꾸로 구하고, 집 출발 t의 소요시간 = min{A : LD_A >= t} - t.
   마감이 늦어질수록 LD는 커지기만 하므로 앞 마감의 결과를 이어서 씀(range RAPTOR). */
function makeEngine(D, opt) {
  const O = Object.assign({ slack: 90, rounds: 8, t0: 7.5 * 3600, win: 60, maxMin: 150, step: 60, detour: 1.3 }, opt || {});
  const { patStops, pso, pto, times, spOff, spP, spK, trOff, trTo, trW, cOff, cStop, cW, cxy } = D;
  const S = pso.length ? D.S : 0, P = pso.length - 1, C = cOff.length - 1, NEG = -1e9;
  const LD = new Float64Array(D.S), markS = new Uint8Array(D.S), markP = new Int32Array(P).fill(-1), touched = [], oldv = new Float64Array(D.S);
  // 07:30보다 이른 출발시각은 쓸모없으므로(집 출발은 07:30 이후) 그런 값은 퍼뜨리지 않음 → 결과는 같고 계산은 줄어듦
  function back(cell, A) {
    let marked = [];
    for (let j = cOff[cell]; j < cOff[cell + 1]; j++) { const s = cStop[j], t = A - cW[j] * 60; if (t > LD[s] && t >= O.t0) { LD[s] = t; marked.push(s); } }
    const relax = (list) => { const out = []; for (const s of list) { const ts = LD[s]; for (let j = trOff[s]; j < trOff[s + 1]; j++) { const u = trTo[j], t = ts - trW[j] * 60; if (t > LD[u] && t >= O.t0) { LD[u] = t; out.push(u); } } } return out; };
    for (let r = 0; r < O.rounds && marked.length; r++) {
      for (const p of touched) markP[p] = -1; touched.length = 0; // 회차 시작 값은 바뀐 정류장만 oldv에 보관(전체 복사 생략)
      for (const s of marked) for (let j = spOff[s]; j < spOff[s + 1]; j++) { const p = spP[j], k = spK[j]; if (markP[p] < 0) touched.push(p); if (k > markP[p]) markP[p] = k; }
      const nm = [];
      for (const p of touched) {
        const k0 = markP[p];
        const so = pso[p], ns = pso[p + 1] - so, to = pto[p], nt = (pto[p + 1] - to) / (2 * ns); let trip = -1;
        for (let k = k0; k >= 0; k--) {
          const s = patStops[so + k];
          if (trip >= 0) { const d = times[to + trip * 2 * ns + 2 * k + 1] - O.slack; if (d > LD[s] && d >= O.t0) { if (!markS[s]) { markS[s] = 1; oldv[s] = LD[s]; nm.push(s); } LD[s] = d; } }
          const pt = markS[s] ? oldv[s] : LD[s];
          if (pt > NEG / 2 && (trip < 0 || times[to + trip * 2 * ns + 2 * k] <= pt)) {
            let lo = trip < 0 ? 0 : trip, hi = nt - 1, f = -1;
            while (lo <= hi) { const m = (lo + hi) >> 1; if (times[to + m * 2 * ns + 2 * k] <= pt) { f = m; lo = m + 1; } else hi = m - 1; }
            if (f >= 0) trip = f;
          }
        }
      }
      for (const s of nm) markS[s] = 0;
      marked = nm.concat(relax(nm));
    }
  }
  // 직장 칸 → 결과 [보통(n) | 최적(n)] (분, 255 = 150분 안에 못 감)
  function query(cell) {
    const T0 = O.t0, maxT = O.maxMin * 60, As = [];
    for (let a = T0 + O.step; a <= T0 + O.win * 60 + maxT; a += O.step) As.push(a);
    LD.fill(NEG);
    const SN = D.S, snap = new Float32Array(As.length * SN), cx = cxy[2 * cell], cy = cxy[2 * cell + 1];
    for (let i = 0; i < As.length; i++) { back(cell, As[i]); snap.set(LD, i * SN); }
    // 칸 c가 마감 As[i]에 맞추려면 가장 늦게 언제 나서야 하나 (필요한 마감만 계산)
    const f = (c, i, wk) => { const A = As[i], base = i * SN; let m = A - wk; for (let j = cOff[c]; j < cOff[c + 1]; j++) { const v = snap[base + cStop[j]] - cW[j] * 60; if (v > m) m = v; } return m; };
    const out = new Uint8Array(2 * C), n = O.win, tt = new Float64Array(n), last = As.length - 1;
    const enc = (v) => (v >= maxT ? 255 : Math.min(254, Math.floor(v / 60)));
    for (let c = 0; c < C; c++) {
      const wk = Math.hypot(cxy[2 * c] - cx, cxy[2 * c + 1] - cy) * O.detour / 75 * 60;
      if (f(c, last, wk) < T0) { out[c] = 255; out[C + c] = 255; continue; } // 150분 안에 못 감
      // 처음으로 T0 이후 출발이 가능한 마감을 이분 탐색으로 찾고, 그 뒤로는 한 번씩만 계산(memo)
      let lo = 0, hi = last; while (lo < hi) { const m = (lo + hi) >> 1; if (f(c, m, wk) >= T0) hi = m; else lo = m + 1; }
      let i = lo, fi = f(c, i, wk);
      for (let k = 0; k < n; k++) { const t = T0 + k * 60; while (i <= last && fi < t) { i++; if (i <= last) fi = f(c, i, wk); } tt[k] = i <= last ? As[i] - t : 1e9; }
      tt.sort(); out[c] = enc(tt[(n - 1) >> 1]); out[C + c] = enc(tt[0]);
    }
    return out;
  }
  return { query, C };
}
if (typeof module !== 'undefined') module.exports = { makeEngine };
