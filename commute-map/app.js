/* 통근권 집찾기 — 정적 사이트용 클라이언트
   data/grid.json            : 250m 격자 중심 좌표(인덱스 순서 고정)
   data/w/{직장칸}.bin        : Uint8Array(2n) = [보통(p50) n개][최적(p1) n개], 255 = 도달 불가
*/
(() => {
  const DEBUG_MASK = /(^|&)dbg=1/.test(location.hash.slice(1));
  const RAMP = ['#0E5E58', '#1F8A70', '#5DB37E', '#A9D48F', '#E2EDA2'];
  // 가격 색: 파랑(싼 곳) → 보라 → 자홍 → 빨강(비싼 곳). 구간 수에 맞춰 보간.
  const PRICE_STOPS = ['#3D65EE', '#627DEF', '#74B2E9', '#91B7E5', '#ABCEEE', '#B3D0F1', '#D4D5DF', '#DDD9DD', '#F9C7A9', '#F4C398', '#F3A47D', '#EA836B', '#DA5C58', '#CF4B4C', '#AD0D1D']; // 사용자 지정 파랑→회색→빨강
  const range = (a, b, s) => { const o = []; for (let v = a; v <= b + 1e-9; v += s) o.push(Math.round(v)); return o; };
  // pi/ni/wi: apts.json types 안 가격·건수·기간(최근 3/6/12개월) 위치. 금액 단위는 만원.
  const KINDS = {
    sale:   { name: '매매', pi: 1, ni: 2, wi: 9, bud: { min: 1, max: 20.5, step: 0.5, mul: 10000 }, fixed: range(10000, 150000, 10000), round: 1000 },
    jeonse: { name: '전세', pi: 3, ni: 4, wi: 10, bud: { min: 1, max: 10.5, step: 0.5, mul: 10000 }, fixed: range(5000, 60000, 5000), round: 1000 },
    rent:   { name: '월세', pi: 6, ni: 8, wi: 11, bud: { min: 30, max: 210, step: 10, mul: 1 }, fixed: range(50, 150, 10), round: 5 },
  };
  const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  function rampN(n) { // RAMP을 n칸으로 보간
    if (n <= 1) return [RAMP[0]];
    return Array.from({ length: n }, (_, k) => {
      const tpos = (k / (n - 1)) * (RAMP.length - 1), a = Math.floor(tpos), b = Math.min(RAMP.length - 1, a + 1), f = tpos - a;
      const A = hex(RAMP[a]), B = hex(RAMP[b]);
      return '#' + A.map((x, j) => Math.round(x + (B[j] - x) * f).toString(16).padStart(2, '0')).join('');
    });
  }
  let bandColors = rampN(5);
  function interp(stops, n) {
    if (n <= 1) return [stops[0]];
    return Array.from({ length: n }, (_, k) => {
      const tpos = (k / (n - 1)) * (stops.length - 1), a = Math.floor(tpos), b = Math.min(stops.length - 1, a + 1), f = tpos - a;
      const A = hex(stops[a]), B = hex(stops[b]);
      return '#' + A.map((x, j) => Math.round(x + (B[j] - x) * f).toString(16).padStart(2, '0')).join('');
    });
  }
  const bandOf = (v) => Math.min(bandColors.length - 1, Math.floor(v / 10));
  const HALF_LAT = 125 / 111320, HALF_LON = 125 / 88290; // 서울 위도 기준 125m
  const $ = (id) => document.getElementById(id);

  const state = { grid: null, a: null, b: null, limit: 50, picking: null, hover: -1,
    opacity: 0.55, priceMode: 'fixed', pick: null, modes: '1111', tr: -1, routeCell: -1, all: [], open: null, apts: [], kind: 'sale', budget: Infinity, minArea: 59, minN: 2, prio: 'eq', extra: 15, matches: [], showN: 30, sel: null };

  let buckets = new Map();

  const map = L.map('map', { zoomControl: false, minZoom: 10, maxZoom: 17 }).setView([37.5565, 126.99], 11);
  L.control.zoom({ position: 'topright' }).addTo(map);
  if (DEBUG_MASK) window.__map = map;
  // 배경지도: 국토교통부 브이월드(키 없으면 OSM으로 대체)
  const VW_KEY = ''; // 브이월드 키는 Cloudflare 배포 때 넣음(commute-cf.yml). 비어 있으면 OSM 지도·역 검색만
  const hasVW = /^[0-9A-F-]{30,}$/i.test(VW_KEY);
  L.tileLayer(hasVW ? `https://api.vworld.kr/req/wmts/1.0.0/${VW_KEY}/Base/{z}/{y}/{x}.png` : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, className: 'basemap',
    attribution: hasVW ? '&copy; <a href="https://www.vworld.kr">국토교통부 브이월드</a>' : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자',
  }).addTo(map);

  /* ---------- 격자 캔버스 레이어 ---------- */
  const GridCanvas = L.Layer.extend({
    onAdd(m) {
      this._c = L.DomUtil.create('canvas', 'grid-canvas');

      m.getPane('overlayPane').appendChild(this._c);
      m.on('moveend zoomend resize viewreset', this.redraw, this);
      m.on('zoomstart', () => (this._c.style.visibility = 'hidden'));
      m.on('zoomend', () => (this._c.style.visibility = 'visible'));
      this.redraw();
    },
    redraw() {
      const m = map, size = m.getSize(), c = this._c, dpr = window.devicePixelRatio || 1;
      const tl = m.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(c, tl);
      c.width = size.x * dpr; c.height = size.y * dpr;
      c.style.width = size.x + 'px'; c.style.height = size.y + 'px';
      const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      const g = state.grid; if (!g || !state.a?.data || state.picking) return; // 직장 고르는 중엔 통근시간 층을 비워 처음 지도처럼
      const b = m.getBounds().pad(0.05);
      ctx.globalAlpha = state.opacity; // 칸 색만 투명하게
      for (let i = 0; i < g.n; i++) {
        const lat = g.lat[i], lon = g.lon[i];
        if (lat < b.getSouth() || lat > b.getNorth() || lon < b.getWest() || lon > b.getEast()) continue;
        if (!isLive(i)) { if (DEBUG_MASK) { const q0 = m.latLngToContainerPoint([lat + HALF_LAT, lon - HALF_LON]), q1 = m.latLngToContainerPoint([lat - HALF_LAT, lon + HALF_LON]); ctx.fillStyle = 'rgba(220,30,30,.55)'; ctx.fillRect(q0.x, q0.y, q1.x - q0.x + .6, q1.y - q0.y + .6); } continue; }
        const v = metric(i); if (v == null || v > state.limit) continue;
        const p0 = m.latLngToContainerPoint([lat + HALF_LAT, lon - HALF_LON]);
        const p1 = m.latLngToContainerPoint([lat - HALF_LAT, lon + HALF_LON]);
        ctx.fillStyle = bandColors[bandOf(v)];
        ctx.fillRect(p0.x, p0.y, p1.x - p0.x + 0.6, p1.y - p0.y + 0.6);
      }
      ctx.globalAlpha = 1; // 테두리·단지 점은 또렷하게
      // 도달 영역 바깥 테두리
      ctx.strokeStyle = 'rgba(31,43,61,0.85)'; ctx.lineWidth = m.getZoom() >= 13 ? 1.6 : 1.1; ctx.beginPath();
      for (let i = 0; i < g.n; i++) {
        const lat = g.lat[i], lon = g.lon[i];
        if (lat < b.getSouth() || lat > b.getNorth() || lon < b.getWest() || lon > b.getEast()) continue;
        if (!inside(i)) continue;
        const p0 = m.latLngToContainerPoint([lat + HALF_LAT, lon - HALF_LON]);
        const p1 = m.latLngToContainerPoint([lat - HALF_LAT, lon + HALF_LON]);
        const [nN, nS, nW, nE] = nb[i];
        if (!inside(nN)) { ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p0.y); }
        if (!inside(nS)) { ctx.moveTo(p0.x, p1.y); ctx.lineTo(p1.x, p1.y); }
        if (!inside(nW)) { ctx.moveTo(p0.x, p0.y); ctx.lineTo(p0.x, p1.y); }
        if (!inside(nE)) { ctx.moveTo(p1.x, p0.y); ctx.lineTo(p1.x, p1.y); }
      }
      ctx.stroke();
      const z = m.getZoom(), r = z >= 14 ? 6 : z >= 12 ? 4.5 : 3;
      ctx.lineWidth = z >= 12 ? 1.5 : 1;
      const tiered = best.on;
      // 최적의 집 찾기: 순위 숫자 배지. 3→2→1 순서로 그려 1순위가 위에 오게
      const list = tiered ? state.matches.slice().sort((x, y) => (y.tier || 9) - (x.tier || 9)) : state.matches;
      const R = z >= 14 ? 11 : z >= 12 ? 9.5 : 8;
      const tierPts = [];
      for (const a of list) {
        if (a.lat < b.getSouth() || a.lat > b.getNorth() || a.lon < b.getWest() || a.lon > b.getEast()) continue;
        const p = m.latLngToContainerPoint([a.lat, a.lon]);
        ctx.globalAlpha = state.sel && a !== state.sel ? 0.25 : 1; // 단지를 고르면 나머지는 흐리게
        if (tiered && a.tier) { tierPts.push({ a, x: p.x, y: p.y }); continue; } // 순위 배지는 아래에서 묶어 그림
        ctx.beginPath(); ctx.arc(p.x, p.y, a === state.sel ? r + 3 : r, 0, 7);
        ctx.fillStyle = state.priceColors[a.cls]; ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = a === state.sel ? 2.5 : (z >= 12 ? 1.2 : 0.8); ctx.stroke();
      }
      // 순위 배지: 같은 순위끼리 화면에서 겹치면 하나로 묶고 'n곳' 꼬리표. 1순위가 맨 위
      state.clusters = [];
      if (tierPts.length) {
        const D2 = (R * 1.7) ** 2, used = new Set();
        for (const t of [1, 2, 3]) for (const q of tierPts) {
          if (q.a.tier !== t || used.has(q)) continue;
          const mem = tierPts.filter((o) => o.a.tier === t && !used.has(o) && (o.x - q.x) ** 2 + (o.y - q.y) ** 2 < D2);
          mem.forEach((o) => used.add(o));
          const sel = mem.find((o) => o.a === state.sel);
          const c = sel || mem.reduce((m, o) => (o.a.rc.score > m.a.rc.score ? o : m), mem[0]); // 대표: 가장 점수 높은 단지 위치·가격 색
          state.clusters.push({ tier: t, x: c.x, y: c.y, a: c.a, members: mem.map((o) => o.a) });
        }
        for (const cl of state.clusters.slice().reverse()) { // 3→1 순서로 그려 1순위가 위
          const a = cl.a, rr = a === state.sel ? R + 2 : R, n = cl.members.length;
          ctx.globalAlpha = state.sel && !cl.members.includes(state.sel) ? 0.25 : 1;
          ctx.beginPath(); ctx.arc(cl.x, cl.y, rr, 0, 7);
          ctx.fillStyle = state.priceColors[a.cls]; ctx.fill();
          ctx.strokeStyle = '#000'; ctx.lineWidth = a === state.sel ? 2.5 : 1.2; ctx.stroke();
          ctx.font = `800 ${Math.round(rr * 1.15)}px Pretendard, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.strokeText(cl.tier, cl.x, cl.y + 0.5); ctx.fillStyle = '#111'; ctx.fillText(cl.tier, cl.x, cl.y + 0.5);
          if (n > 1) { // 꼬리표 'n곳'
            const txt = `${n}곳`; ctx.font = '700 11px Pretendard, system-ui, sans-serif';
            const w = ctx.measureText(txt).width + 8, hx = cl.x + rr * 0.55, hy = cl.y - rr - 2;
            ctx.beginPath(); ctx.roundRect ? ctx.roundRect(hx, hy - 7, w, 14, 7) : ctx.rect(hx, hy - 7, w, 14);
            ctx.fillStyle = '#1F2B3D'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(txt, hx + 4, hy + 0.5);
          }
        }
      }
      ctx.globalAlpha = 1;
      if (state.sel && !(best.on && state.sel.tier)) { const a = state.sel, p = m.latLngToContainerPoint([a.lat, a.lon]); ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, 7); ctx.fillStyle = state.priceColors[a.cls]; ctx.fill(); ctx.strokeStyle = '#1F2B3D'; ctx.lineWidth = 2.5; ctx.stroke(); }
      if (state.hover >= 0) {
        const i = state.hover;
        const p0 = m.latLngToContainerPoint([g.lat[i] + HALF_LAT, g.lon[i] - HALF_LON]);
        const p1 = m.latLngToContainerPoint([g.lat[i] - HALF_LAT, g.lon[i] + HALF_LON]);
        ctx.strokeStyle = '#1F2B3D'; ctx.lineWidth = 2; ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
      }
    },
  });
  const layer = new GridCanvas().addTo(map);

  /* ---------- 값 계산 ---------- */
  let nb = []; // 칸별 [북, 남, 서, 동] 이웃 인덱스(-1=없음)
  const isLive = (i) => !state.grid.live || state.grid.live.charCodeAt(i) === 49; // '1'
  const inside = (i) => { if (i < 0 || !isLive(i)) return false; const v = metric(i); return v != null && v <= state.limit; };
  const t = (wp, i, best) => {
    if (!wp?.data) return null;
    const v = wp.data[(best ? state.grid.n : 0) + i];
    return v === 255 ? null : v;
  };
  // 각자 상한: 우선인 사람은 T분, 다른 사람은 T+N분까지. 둘 다 같게면 둘 다 T분.
  const cap = (k) => (!state.b?.data || state.prio === 'eq' || state.prio === k) ? state.limit : state.limit + state.extra;
  // 지도에 칠할 값(이 값이 T 이하면 통과). 우선인 사람 시간, 동등이면 더 먼 쪽.
  function metric(i) {
    const ta = t(state.a, i, false); if (ta == null) return null;
    if (!state.b?.data) return ta;
    const tb = t(state.b, i, false); if (tb == null) return null;
    if (state.prio === 'a') return tb <= cap('b') ? ta : null;
    if (state.prio === 'b') return ta <= cap('a') ? tb : null;
    return Math.max(ta, tb);
  }
  // 목록 2차 정렬값: 차선인 사람 시간, 동등이면 합계
  function second(i) {
    const ta = t(state.a, i, false), tb = state.b?.data ? t(state.b, i, false) : 0;
    return state.prio === 'a' ? tb : state.prio === 'b' ? ta : ta + tb;
  }

  /* ---------- 단지 조건 ---------- */
  const won = (v) => v >= 10000 ? `${(v / 10000).toFixed(v % 10000 === 0 ? 0 : 1).replace(/\.0$/, '')}억` : `${v.toLocaleString()}만`;
  // 월세: 거래마다 환산한 월세(보증금 0 기준, t[13])에서 '내 보증금'만큼 빼서 '내 보증금으로 계약하면 내는 월세'로 비교.
  // 전월세전환율 5%(법정 상한 = 기준금리 3.00%+2%p, 사이트 자료로 잰 시장 중간값 약 5.3%)
  const CONV = 0.05, CONV_M = CONV / 12;
  const eq0 = (t) => (t[13] != null ? t[13] : t[6] != null ? t[6] + (t[7] || 0) * CONV_M : null); // 옛 자료(t[13] 없음) 대비
  const rentAt = (t) => { const e = eq0(t); return e == null ? null : Math.max(0, Math.round(e - (state.myDep || 0) * CONV_M)); };
  const priceOf = (t, pi) => (state.kind === 'rent' ? rentAt(t) : t[pi]);
  function computeMatches() {
    state.matches = [];
    if (!state.a?.data) return;
    const { pi, ni, wi } = KINDS[state.kind];
    for (const [seq, name, dong, year, lat, lon, cell, types, hh, sale] of state.apts) {
      if (cell < 0) continue;
      const v = metric(cell); if (v == null || v > state.limit) continue;
      let best = null;
      for (const t of types) {
        const pv = priceOf(t, pi);
        if (t[0] < state.minArea || pv == null || pv > state.budget || t[ni] < state.minN) continue;
        if (!best || pv < priceOf(best, pi)) best = t;
      }
      if (!best) continue;
      state.matches.push({ seq, name, dong, year, lat, lon, cell, v, types, hh: hh == null ? -1 : hh, sale: sale || 0, flag: best[12] || 0, area: best[0], price: priceOf(best, pi), n: best[ni], w: best[wi], mr: best[6], dep: best[7], eq: eq0(best), ym: best[5] });
    }
    for (const a of state.matches) a.v2 = second(a.cell);
    state.matches.sort((x, y) => x.v - y.v || x.v2 - y.v2 || x.price - y.price);
    // 구간 경계(각 경계 이상이면 다음 구간). 고정: 종류별 단위, 자연: Jenks 10분위
    state.breaks = state.priceMode === 'jenks' ? priceBreaks(state.matches.map((a) => a.price)) : KINDS[state.kind].fixed;
    state.priceColors = interp(PRICE_STOPS, state.breaks.length + 1);
    for (const a of state.matches) { let c = 0; while (c < state.breaks.length && a.price >= state.breaks[c]) c++; a.cls = c; }
    // 범례에서 고른 가격 구간만 남김(아무것도 안 골랐으면 전체)
    if (state.pick) for (const k of [...state.pick]) if (k > state.breaks.length) state.pick.delete(k);
    state.all = state.matches;
    if (state.pick) state.matches = state.matches.filter((a) => state.pick.has(a.cls));
    if (state.sel && !state.matches.includes(state.sel)) state.sel = state.matches.find((a) => a.seq === state.sel.seq) || null;
  }
  // Jenks 자연 구간: 정렬된 값에서 k개 구간의 경계(상한값 k-1개)를 구함. 1,500개 넘으면 등간격 표본 사용.
  function jenks(vals, k) {
    let x = vals.slice().sort((a, b) => a - b);
    if (x.length > 1500) { const s = []; for (let i = 0; i < 1500; i++) s.push(x[Math.floor(i * (x.length - 1) / 1499)]); x = s; }
    const n = x.length; if (n <= k) return [...new Set(x)].slice(0, -1);
    const L = Array.from({ length: n + 1 }, () => new Int32Array(k + 1)), V = Array.from({ length: n + 1 }, () => new Float64Array(k + 1).fill(Infinity));
    for (let j = 1; j <= k; j++) { L[1][j] = 1; V[1][j] = 0; }
    for (let l = 2; l <= n; l++) {
      let s1 = 0, s2 = 0, w = 0, v = 0;
      for (let m = 1; m <= l; m++) {
        const i3 = l - m + 1, val = x[i3 - 1]; s2 += val * val; s1 += val; w++; v = s2 - (s1 * s1) / w;
        const i4 = i3 - 1;
        if (i4 !== 0) for (let j = 2; j <= k; j++) if (V[l][j] >= v + V[i4][j - 1]) { L[l][j] = i3; V[l][j] = v + V[i4][j - 1]; }
      }
      L[l][1] = 1; V[l][1] = v;
    }
    const br = []; let kk = n;
    for (let j = k; j >= 2; j--) { const id = L[kk][j] - 2; br.unshift(x[id]); kk = L[kk][j] - 1; }
    return br;
  }
  function priceBreaks(prices) {
    if (prices.length < 10) return [];
    const R = KINDS[state.kind].round;
    // Jenks 상한값 다음 값부터 다음 구간 → 경계는 상한을 반올림 단위로 올린 값
    const r = jenks(prices, 10).map((v) => Math.max(R, Math.ceil((v + 1) / R) * R));
    return [...new Set(r)].sort((a, b) => a - b);
  }
  function renderPriceLegend() {
    const el = $('lg-price-body'), br = state.breaks || [], cols = state.priceColors || [];
    const K = KINDS[state.kind];
    $('lg-price-title').textContent = `단지 ${K.name}${state.kind === 'rent' ? '(월)' : '가'}`;
    $('pmode').setAttribute('aria-pressed', String(state.priceMode === 'jenks'));
    // 하나도 안 켜졌으면 '전체 선택', 하나라도 켜져 있으면 '전체 해제'
    const none = !!state.pick && state.pick.size === 0, tg = $('pick-toggle');
    tg.textContent = none ? '전체 선택' : '전체 해제';
    tg.title = none ? '모든 가격 구간을 켭니다' : '모든 가격 구간을 끕니다 — 칸을 눌러 원하는 구간만 켜세요';
    if (!state.all.length) { el.innerHTML = '<span class="pz-none">조건에 맞는 단지가 없습니다</span>'; return; }
    const n = cols.length, on = !!state.pick, lab = (v) => won(v);
    const segs = cols.map((c, k) => {
      const lo = k === 0 ? null : br[k - 1], hi = k < br.length ? br[k] : null;
      const tip = lo == null ? `${won(hi)} 미만` : hi == null ? `${won(lo)} 이상` : `${won(lo)}~${won(hi)}`;
      const cnt = state.all.filter((a) => a.cls === k).length, sel = on && state.pick.has(k);
      return `<button type="button" class="${on && !sel ? 'off' : ''}${sel ? ' sel' : ''}" data-c="${k}" style="background:${c}" aria-pressed="${sel}" title="${tip} · ${cnt}곳 (두 칸을 차례로 누르면 그 사이가 모두 켜져요)" aria-label="${tip} ${cnt}곳"></button>`;
    }).join('');
    // 눈금: 경계값을 최대 6개까지 간격을 두고 표시
    const stride = Math.max(1, Math.ceil(br.length / 6));
    const ticks = br.map((v, i) => ({ v, i })).filter(({ i }) => (br.length - 1 - i) % stride === 0) // 마지막 경계부터 고르게
      .map(({ v, i }) => { const pos = ((i + 1) / n) * 100; return `<span class="${pos > 94 ? 'edge-r' : ''}" style="left:${pos}%">${lab(v)}</span>`; }).join('');
    el.innerHTML = `<div class="pbar">${segs}</div><div class="pticks">${ticks}</div>
      <div class="pnote"><span>싼 곳</span><span>${state.anchor != null ? '끝 구간을 누르세요' : on ? `${n}개 중 ${state.pick.size}개 선택` : '두 칸을 눌러 범위 고르기'}</span><span>비싼 곳</span></div>`;
  }
  function renderList() {
    const ol = $('apt-list'), kindName = KINDS[state.kind].name;
    if (!state.a) { $('apt-count').textContent = '단지 목록'; ol.innerHTML = '<li class="none">직장을 정하면 통근시간 안에 있는 아파트 단지가 여기에 나옵니다.</li>'; $('apt-more').hidden = true; return; }
    $('apt-count').textContent = best.on ? `내게 맞는 집 ${[...best.show].sort().join('·')}순위 ${state.matches.length.toLocaleString()}곳` : `조건에 맞는 단지 ${state.matches.length.toLocaleString()}곳`;
    if (!state.matches.length) { ol.innerHTML = state.all.length ? '<li class="none">고른 가격 구간이 없습니다. 오른쪽 아래 가격 범례의 칸을 눌러 보고 싶은 구간을 켜 주세요.</li>' : '<li class="none">조건에 맞는 단지가 없습니다. 최대 통근시간이나 예산을 늘려 보세요.</li>'; $('apt-more').hidden = true; return; }
    // 경로 상자는 단지 카드 안으로 옮겨 쓰므로, 목록을 다시 그리기 전에 원래 자리로 돌려 둠
    const rt = $('route'); if (rt.parentElement !== $('ro-sec')) $('ro-sec').appendChild(rt);
    $('ro-sec').classList.toggle('in-one', !!(state.sel && state.matches.includes(state.sel)));
    if (state.sel && state.matches.includes(state.sel)) {
      // 단지 하나만 보기: 선택한 단지 카드(통근시간·가는 길·면적별 가격)만
      const a = state.sel, k = state.matches.indexOf(a);
      const tb = state.b?.data ? t(state.b, a.cell, false) : null, ta = t(state.a, a.cell, false);
      const bb = state.b?.data ? t(state.b, a.cell, true) : null, ba = t(state.a, a.cell, true);
      $('apt-count').textContent = '선택한 단지';
      ol.innerHTML = `<li class="apt one sel" data-k="${k}">
        <button type="button" class="back" id="apt-back">← 목록으로 (${state.matches.length.toLocaleString()}곳)</button>
        <span class="nm">${a.name}</span><span class="sub">${a.dong}${a.year ? `, ${a.year}년` : ''}</span>
        <div class="one-t"><div class="ro-item a"><span class="ro-k">A까지</span><b>${ta}분</b><small>빠르면 ${ba}분</small></div>
        ${tb == null ? '' : `<div class="ro-item b"><span class="ro-k">B까지</span><b>${tb}분</b><small>빠르면 ${bb}분</small></div>`}</div>
        <div id="route-slot"></div>
        ${detailHTML(a)}</li>`;
      $('route-slot').appendChild(rt);
      $('apt-more').hidden = true;
      return;
    }
    ol.innerHTML = state.matches.slice(0, state.showN).map((a, k) => {
      const tb = state.b?.data ? t(state.b, a.cell, false) : null, ta = t(state.a, a.cell, false);
      const tm = tb == null ? `${ta}분` : `A ${ta} / B ${tb}분`;
      return `<li class="apt${a === state.sel ? ' sel' : ''}" data-k="${k}" tabindex="0">
        <span class="nm">${a.name}</span><span class="tm">${tm}</span>
        <span class="sub">${a.dong}${a.year ? `, ${a.year}년` : ''}</span>
        <span class="pr${state.kind === 'rent' ? ' rent' : ''}">${state.kind === 'rent' ? `${a.area}㎡ 월세 ${won(a.mr)} · 보증금 ${won(a.dep || 0)}` : `${a.area}㎡ ${kindName} ${won(a.price)}`} (${a.w ? `최근 ${a.w}개월 ` : ''}${a.n}건)</span>
        ${state.kind === 'rent' ? `<span class="pr2">${rentNote(a)}</span>` : ''}
        ${best.on && a.rc ? rankLine(a) : ''}
        <button type="button" class="more-d" data-k="${k}" aria-expanded="${state.open === a.seq}">${state.open === a.seq ? '접기' : '세부정보'}</button>
        ${state.open === a.seq ? detailHTML(a) : ''}</li>`;
    }).join('');
    $('apt-more').hidden = state.matches.length <= state.showN;
  }
  // 세부정보: 면적형별 가격(현재 거래 종류). 월세는 보증금도 함께.
  // 월세 단지 한 줄: 내 보증금 기준으로 바꾼 월세
  function rentNote(a) {
    const D = state.myDep || 0;
    const base = D ? `내 보증금 ${won(D)} 기준` : '보증금 없이(모두 월세로)';
    if (D && a.price <= 0) return `${base} 월세 없음 <small>(내 보증금이 이 집 전세 수준)</small>`;
    const adj = D && (a.dep || 0) > D ? ' · 보증금을 줄이는 셈이라 집주인 동의 필요' : '';
    return `${base} 월 <b>${won(a.price)}</b>${adj}`;
  }
  function detailHTML(a) {
    const K = KINDS[state.kind];
    const rows = a.types.filter((t) => t[K.pi] != null).map((t) => {
      const pv = priceOf(t, K.pi);
      const extra = state.kind === 'rent' ? `<td>${t[7] != null ? won(t[7]) : '–'}</td><td>${pv != null ? won(pv) : '–'}</td>` : '';
      const ok = t[0] >= state.minArea && pv != null && pv <= state.budget && t[K.ni] >= state.minN;
      return `<tr class="${ok ? '' : 'dim'}"><td>${t[0]}㎡</td><td>${won(t[K.pi])}</td>${extra}<td>${t[K.wi] ? `${t[K.wi]}개월 ` : ''}${t[K.ni]}건</td></tr>`;
    }).join('');
    const head = state.kind === 'rent' ? `<th>면적</th><th>월세</th><th>보증금</th><th>${state.myDep ? '내 보증금 기준' : '모두 월세로'}</th><th>거래</th>` : `<th>면적</th><th>${K.name}</th><th>거래</th>`;
    const last = a.ym ? `최근 거래 ${a.ym.slice(0, 4)}년 ${+a.ym.slice(4)}월` : '';
    return `<div class="detail"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
      <p>가격은 최근 3개월에 거래가 2건 이상이면 3개월, 아니면 6개월, 그래도 없으면 12개월 거래의 중위값입니다(해제된 거래 제외). ${state.kind === 'rent' ? '월세·보증금은 같은 면적형 계약을 보증금까지 월세로 바꿔(전환율 연 5%) 줄 세웠을 때 가운데 계약의 값입니다. ' : ''}흐린 줄은 지금 조건(면적·예산·거래 수)에 안 맞는 면적형입니다. ${last}</p></div>`;
  }
  function selectApt(a, fly) {
    state.sel = a; state.hover = a.cell;
    if (mobile() && sheetH != null && sheetH < 140) setSheet(false); // 접혀 있으면 단지 정보가 보이게 펼침
    if (fly) map.flyTo([a.lat, a.lon], Math.max(map.getZoom(), 15), { duration: 0.6 });
    renderReadout(a.cell); renderList(); layer.redraw(); showRoute(a.cell);
    const k = state.matches.indexOf(a);
    if (k >= state.showN) { state.showN = k + 10; renderList(); }
    $('apt-count').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /* ---------- 최적의 집 찾기 ----------
     1) 조건에 맞는 단지마다 월 주거비·통근시간·연식을 구함
     2) 항목마다 (후보 중앙값 − 이 집 값) ÷ 사분위 범위로 눈금을 맞춤 → 크기 차이는 살리고 항목끼리 공평하게
     3) 삼각형에서 고른 비중으로 더해 순위를 내고 상위 2%씩 1·2·3순위
     4) 화면에는 세 항목 모두 비중 순서로 제 단위로(25% 이상은 굵게): 주거비(원, 같은 면적·연식대 대비), 통근(월 시간), 연식(년)(같은 면적대 대비)
     계산 기준(고정): 집값·보증금의 절반은 대출(대출금리), 절반은 내 돈(예금금리)으로 보고 월 이자 비용을 주거비로 봄 */
  const CALC = { wage: 10320, days: 21, fare: 1550 };
  // wage: 2026년 최저임금 시급 / fare: 수도권 지하철 기본요금. 집값·보증금은 전월세전환율(CONV, 연 5%)로 월 비용 환산
  const BEST_DEF = { wt: 1 / 3, wc: 1 / 3, wy: 1 / 3, small: 1 }; // small: 1이면 소규모 단지 빼기
  const TIER_COL = ['#3B0764', '#7E22CE', '#C084FC'];
  const best = { ...BEST_DEF, on: false, show: new Set([1, 2, 3]) }; // show: 지도·목록에 보일 순위
  try { const v = JSON.parse(localStorage.getItem('commute-best4') || '{}'); for (const k of Object.keys(BEST_DEF)) if (v[k] != null) best[k] = v[k]; } catch (e) { /* 저장 안 됨 */ }
  const thisYear = new Date().getFullYear();
  const man = (v) => `${Math.round(v).toLocaleString()}만`;
  const ageBand = (y) => { const g = thisYear - y; return g <= 5 ? 0 : g <= 10 ? 1 : g <= 20 ? 2 : 3; };
  const areaBand = (m2) => m2 < 40 ? 0 : m2 < 60 ? 1 : m2 < 85 ? 2 : m2 < 115 ? 3 : 4;
  const KIND_BIT = { sale: 1, jeonse: 2, rent: 4 };
  const SMALL_HH = 150; // K-apt 의무관리 기준 근처: 이보다 작거나 K-apt에 없으면 소규모
  const RATE = CONV_M; // 월 이율: 사이트 전체를 전월세전환율 5%로 통일
  function costOf(a) {
    const house = state.kind === 'rent' ? a.eq : a.price * RATE; // 만원/월(월세는 보증금까지 월세로 바꾼 값 — 내 보증금과 무관)
    const ta = t(state.a, a.cell, false), tb = state.b?.data ? t(state.b, a.cell, false) : null;
    const mins = (ta || 0) + (tb || 0), people = tb == null ? 1 : 2;
    const time = mins * 2 * CALC.days * (CALC.wage / 60) / 10000; // 만원/월
    const fare = people * 2 * CALC.days * CALC.fare / 10000; // 만원/월
    return { house, mins, time, age: thisYear - a.year, total: house + time + fare };
  }
  const median = (xs) => { const ys = xs.slice().sort((x, y) => x - y), k = ys.length >> 1; return ys.length % 2 ? ys[k] : (ys[k - 1] + ys[k]) / 2; };
  const quant = (ys, q) => { const p = (ys.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return ys[lo] + (ys[hi] - ys[lo]) * (p - lo); };
  // (중앙값 − 값) ÷ 사분위 범위: 낮을수록 좋은 값이 양수 점수
  function robust(list, key) {
    const ys = list.map((a) => a.rc[key]).sort((x, y) => x - y);
    const m = quant(ys, 0.5), iqr = (quant(ys, 0.75) - quant(ys, 0.25)) || (ys[ys.length - 1] - ys[0]) || 1;
    for (const a of list) a.rc['z_' + key] = (m - a.rc[key]) / iqr;
  }
  const hhText = (a) => a.hh < 0 ? '' : a.hh >= SMALL_HH ? `${a.hh.toLocaleString()}세대` : '소규모';
  // 보여 줄 항목: 비중 25% 이상인 것만, 비중 큰 순서로 (100이면 하나, 50:50이면 둘, 고르게면 셋)
  function shownKeys() {
    const sw = best.wt + best.wc + best.wy || 1;
    return [['house', best.wc], ['mins', best.wt], ['age', best.wy]].sort((x, y) => y[1] - x[1]).map(([k, w]) => ({ k, main: w / sw >= 0.25 }));
  }
  const couple = () => !!state.b?.data;
  const hrs = (dm) => dm * 2 * CALC.days / 60; // 하루 차이(분) → 한 달 시간
  function unitText(k, v, avg) { // v: 좋은 쪽이 양수
    const r = Math.round(Math.abs(v)), good = v >= 0;
    if (k === 'house') return `주거비 월 ${man(Math.abs(v))}원 ${good ? '아낌' : '더 듦'}`;
    if (k === 'mins') return `통근 월 ${r}시간 ${good ? '아낌' : '더 씀'}${couple() ? '(둘 합쳐)' : ''}`;
    return r < 1 ? '연식 비슷' : `${r}년 더 ${good ? '신축' : '구축'}`;
  }
  const dval = (c, k) => k === 'house' ? c.dHouse : k === 'mins' ? hrs(c.dMins) : c.dAge;
  function rankLine(a) {
    const c = a.rc, keys = shownKeys(); // 세 항목 모두, 비중 큰 순서로 / 비중 25% 이상은 굵게
    const head = keys.map(({ k, main }) => `<span class="rk-l">· ${main ? `<b>${unitText(k, dval(c, k))}</b>` : unitText(k, dval(c, k))}</span>`).join('');
    const rent = state.kind === 'rent' ? `<small>월세 ${won(a.mr)} + 보증금 ${won(a.dep || 0)}×5%÷12(월 ${man((a.dep || 0) * RATE)}) = 주거비 월 ${man(c.house)}원</small>` : '';
    return `<span class="rk"><i class="t${a.tier}">${a.tier}순위</i>${head}${hhText(a) ? `<small>${hhText(a)}</small>` : ''}${rent}</span>`;
  }
  function skipText(k) {
    const xs = [k.small && `소규모 단지 ${k.small}곳`, k.rental && `임대 단지 ${k.rental}곳`, k.chk && `이웃보다 유난히 싸 가격 확인이 필요한 ${k.chk}곳`, k.year && `준공 연도를 모르는 ${k.year}곳`].filter(Boolean);
    return xs.length ? ` 추천에서 뺀 곳: ${xs.join(', ')}.` : '';
  }
  function computeBest() {
    for (const a of state.all || []) { a.tier = 0; a.rc = null; }
    const info = $('bx-info');
    if (!best.on || !state.a?.data) { if (info) info.textContent = ''; if ($('bx-why')) $('bx-why').textContent = ''; return; }
    const cand = []; const skip = { year: 0, chk: 0, rental: 0, small: 0 };
    const bit = KIND_BIT[state.kind];
    for (const a of state.matches) {
      if (!a.year) { skip.year++; continue; }                 // 준공 연도 모름
      if (a.sale === 3) { skip.rental++; continue; }           // K-apt상 임대 단지
      if (a.flag & bit) { skip.chk++; continue; }             // 이웃보다 크게 싸서 가격 확인 필요
      if (best.small && a.hh >= 0 && a.hh < SMALL_HH) { skip.small++; continue; } // 소규모 단지(-1은 단지정보 수집 전이라 판단 보류)
      a.rc = costOf(a); a.rc.ab = ageBand(a.year); a.rc.mb = areaBand(a.area); cand.push(a);
    }
    if (!cand.length) { state.matches = []; if (info) info.innerHTML = `<p class="bx-n">조건에 맞는 단지가 없어요.${skipText(skip)}</p>`; return; }
    robust(cand, 'house'); robust(cand, 'mins'); robust(cand, 'age');
    // 비슷한 집: 같은 면적대·연식대(5곳 미만이면 같은 면적대 전체)의 중앙값
    // 비슷한 집: 같은 면적대·연식대 → 5곳 미만이면 인접 연식대까지 → 그래도 부족하면 같은 면적대
    const grp = new Map(), grpA = new Map();
    const add = (m, k, a) => { const g = m.get(k) || []; g.push(a); m.set(k, g); };
    for (const a of cand) { add(grp, a.rc.mb + '_' + a.rc.ab, a); add(grpA, a.rc.mb, a); }
    const summ = (xs) => ({ n: xs.length, total: median(xs.map((a) => a.rc.total)), house: median(xs.map((a) => a.rc.house)), time: median(xs.map((a) => a.rc.time)), mins: median(xs.map((a) => a.rc.mins)), age: median(xs.map((a) => a.rc.age)) });
    const grpN = new Map();
    for (const a of cand) {
      const key = a.rc.mb + '_' + a.rc.ab;
      if (grpN.has(key) || (grp.get(key) || []).length >= 5) continue;
      grpN.set(key, summ([-1, 0, 1].flatMap((d) => grp.get(a.rc.mb + '_' + (a.rc.ab + d)) || [])));
    }
    for (const m of [grp, grpA]) for (const [k, xs] of m) m.set(k, summ(xs));
    const all = summ(cand); // 같은 면적대도 5곳 미만이면 후보 전체와 비교
    for (const [k, g] of grpA) if (g.n < 5) grpA.set(k, all);
    const sw = best.wt + best.wc + best.wy || 1;
    for (const a of cand) {
      const key = a.rc.mb + '_' + a.rc.ab, g = grp.get(key), gn = grpN.get(key);
      const p = g.n >= 5 ? g : gn && gn.n >= 5 ? gn : grpA.get(a.rc.mb);
      const pa = grpA.get(a.rc.mb);
      a.rc.save = p.total - a.rc.total; a.rc.dHouse = p.house - a.rc.house; a.rc.dMins = pa.mins - a.rc.mins; a.rc.dAge = pa.age - a.rc.age;
      a.rc.score = (best.wt * a.rc.z_mins + best.wc * a.rc.z_house + best.wy * a.rc.z_age) / sw;
    }
    cand.sort((x, y) => y.rc.score - x.rc.score || y.rc.save - x.rc.save);
    const n = cand.length, cnt = [0, 0, 0];
    cand.forEach((a, i) => { const tier = Math.floor(i * 50 / n) + 1; if (tier <= 3) { a.tier = tier; cnt[tier - 1]++; } });
    state.matches = cand.filter((a) => a.tier && best.show.has(a.tier)); // 순위 버튼으로 끈 순위는 숨김
    if (state.sel && !state.matches.includes(state.sel)) state.sel = null;
    if (info) {
      const keys = shownKeys();
      const avg = (t, k) => { const xs = cand.filter((a) => a.tier === t); return xs.length ? xs.reduce((s, a) => s + dval(a.rc, k), 0) / xs.length : 0; };
      info.innerHTML = [1, 2, 3].map((t) => `<div class="bx-t${best.show.has(t) ? '' : ' off'}" role="button" tabindex="0" data-t="${t}" aria-pressed="${best.show.has(t)}" title="눌러서 ${t}순위 보이기/숨기기"><div class="bx-h"><b>${t}순위</b><span>${cnt[t - 1]}곳</span></div><small>${keys.map(({ k }) => `· 평균 ${unitText(k, avg(t, k))}`).join('<br>')}</small></div>`).join('');
      const why = $('bx-why'); if (why) why.textContent = `조건에 맞는 ${n.toLocaleString()}곳을 고른 비중대로 줄 세워 상위 2%씩 나눴어요. 주거비는 면적·연식이 비슷한 집, 통근시간·연식은 면적이 비슷한 집의 보통값과 비교했어요. 항목은 비중이 큰 순서로 보여 주고, 연식은 비교한 집들보다 몇 년 더 신축인지예요.${skipText(skip)}`;
    }
  }
  // 삼각형 비중 고르기: 꼭짓점 = 통근(위), 주거비(왼쪽 아래), 연식(오른쪽 아래)
  const TRI = { W: 168, H: 146, P: [[84, 14], [14, 132], [154, 132]] };
  function triPoint() { const [A, B, C] = TRI.P, s = best.wt + best.wc + best.wy || 1, u = best.wt / s, v = best.wc / s, w = best.wy / s; return [u * A[0] + v * B[0] + w * C[0], u * A[1] + v * B[1] + w * C[1]]; }
  function triWeights(x, y) {
    const [A, B, C] = TRI.P, d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
    let u = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / d, v = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / d;
    u = Math.max(0, u); v = Math.max(0, v); let w = Math.max(0, 1 - u - v); const s = u + v + w; return [u / s, v / s, w / s];
  }
  function drawTri() {
    const [x, y] = triPoint(), [A, B, C] = TRI.P;
    $('bx-tri').innerHTML = `<polygon points="${A} ${B} ${C}" fill="#F5F3FF" stroke="#7E22CE" stroke-width="1.5"/>
      <text x="${A[0]}" y="${A[1] - 4}" text-anchor="middle">통근시간</text><text x="${B[0] - 2}" y="${B[1] + 13}" text-anchor="start">주거비</text><text x="${C[0] + 2}" y="${C[1] + 13}" text-anchor="end">연식</text>
      <circle cx="${x}" cy="${y}" r="8" fill="#3B0764" stroke="#fff" stroke-width="2.5"/>`;
    const s = best.wt + best.wc + best.wy || 1;
    $('bx-w').innerHTML = `통근 <b>${Math.round(100 * best.wt / s)}</b> · 주거비 <b>${Math.round(100 * best.wc / s)}</b> · 연식 <b>${Math.round(100 * best.wy / s)}</b>`;
  }
  function saveBest() { try { localStorage.setItem('commute-best4', JSON.stringify({ wt: best.wt, wc: best.wc, wy: best.wy, small: best.small })); } catch (e) { /* 저장 안 됨 */ } }
  function bestUI() {
    // 순위 버튼: 눌러서 켜고 끄기(하나는 남김)
    const togT = (e) => {
      const el = e.target.closest('.bx-t'); if (!el) return;
      const t = +el.dataset.t;
      if (best.show.has(t)) { if (best.show.size > 1) best.show.delete(t); } else best.show.add(t);
      state.showN = 30; refresh();
    };
    $('bx-info').addEventListener('click', togT);
    $('bx-info').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togT(e); } });
    const tog = $('bx-tog'); if (!tog) return;
    drawTri();
    const sm = $('bx-small'); if (sm) { sm.checked = !!best.small; sm.addEventListener('change', () => { best.small = sm.checked ? 1 : 0; saveBest(); state.showN = 30; refresh(); }); }
    tog.addEventListener('click', () => { best.on = !best.on; tog.setAttribute('aria-pressed', String(best.on)); $('bx-body').hidden = !best.on; state.showN = 30; refresh(); });
    let raf = 0;
    const svg = $('bx-tri');
    const move = (e) => {
      const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * TRI.W / r.width, y = (e.clientY - r.top) * TRI.H / r.height;
      [best.wt, best.wc, best.wy] = triWeights(x, y); drawTri();
      cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { state.showN = 30; refresh(); });
    };
    svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture(e.pointerId); move(e); });
    svg.addEventListener('pointermove', (e) => { if (svg.hasPointerCapture(e.pointerId)) move(e); });
    svg.addEventListener('pointerup', () => saveBest());
  }

  function refresh() { document.body.classList.toggle('has-work', !!state.a); computeMatches(); computeBest(); renderList(); renderPriceLegend(); layer.redraw(); renderReadout(state.hover); $('legend').classList.toggle('empty', !state.a); }

  /* ---------- 격자 찾기 ---------- */
  const bkey = (lat, lon) => `${Math.floor(lat / 0.005)}_${Math.floor(lon / 0.005)}`;
  function nearestCell(lat, lon) {
    let best = -1, bd = Infinity;
    const by = Math.floor(lat / 0.005), bx = Math.floor(lon / 0.005);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const i of buckets.get(`${by + dy}_${bx + dx}`) || []) {
        const d = ((state.grid.lat[i] - lat) / HALF_LAT) ** 2 + ((state.grid.lon[i] - lon) / HALF_LON) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return bd <= 2.2 ? best : -1; // 칸 밖이면 -1
  }

  /* ---------- 직장 칸 자료: 64칸 묶음 파일에서 꺼내기 ---------- */
  /* 직장 칸을 고르면 브라우저(웹 워커)에서 바로 계산. 같은 칸은 기억해 둠 */
  const worker = new Worker('worker.js?v=2'); let qid = 0; const pending = new Map(), cache = new Map();
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') { busy(`계산 자료 받는 중 ${Math.round((m.got / m.total) * 100)}% (처음 한 번만)`); return; }
    if (m.type === 'ready') return;
    const p = pending.get(m.id); if (!p) return; pending.delete(m.id);
    if (m.type === 'error') p.reject(new Error(m.msg)); else { if (m.ms != null) console.info(`통근시간 계산 ${m.ms}ms`); p.resolve(m.med ? { data: m.data, med: m.med } : m.data); }
  };
  worker.postMessage({ type: 'init' }); // 페이지 열 때 미리 자료 받기 시작
  const optKey = () => `${state.modes}|${state.tr}`;
  function ask(msg) { const id = ++qid; const p = new Promise((resolve, reject) => pending.set(id, { resolve, reject })); worker.postMessage({ ...msg, id }); return p; }
  function loadWork(i) {
    const key = `${i}|${optKey()}`;
    if (cache.has(key)) return cache.get(key);
    const p = ask({ type: 'query', cell: i, modes: state.modes, tr: state.tr });
    cache.set(key, p); p.catch(() => cache.delete(key));
    return p;
  }
  // 이동수단·환승 조건이 바뀌면 직장 A·B를 다시 계산
  async function recompute() {
    const ks = ['a', 'b'].filter((k) => state[k]); if (!ks.length) { syncHash(); return; }
    busy('통근시간 다시 계산 중…');
    try { for (const k of ks) { const r = await loadWork(state[k].idx); state[k].data = r.data; state[k].med = r.med; } }
    catch (e) { toast('통근시간을 계산하지 못했습니다.'); }
    busy(''); syncHash(); refresh(); if (state.routeCell >= 0) showRoute(state.routeCell);
  }
  /* ---------- 경로: 누른 칸(또는 단지)에서 직장까지 '보통' 출발 기준 대표 경로 ---------- */
  const CAT = { 1: ['지하철', 'm1'], 2: ['기차', 'm2'], 3: ['광역버스', 'm3'], 4: ['버스', 'm4'] };
  const hhmm = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let routeSeq = 0;
  async function showRoute(cell) {
    state.routeCell = cell; const el = $('route'); const my = ++routeSeq;
    if (cell < 0 || !state.a) { el.hidden = true; return; }
    el.hidden = false; el.innerHTML = '<p class="rt-wait">가는 길 찾는 중…</p>';
    const parts = [];
    for (const k of ['a', 'b']) {
      const w = state[k]; if (!w?.med) continue;
      const ai = w.med[cell];
      if (ai === 255) { parts.push(`<div class="rt"><div class="rt-h"><b>${k.toUpperCase()}까지</b> 150분 안에 갈 수 없음</div></div>`); continue; }
      let r; try { r = await ask({ type: 'path', work: w.idx, home: cell, ai, modes: state.modes, tr: state.tr }); } catch (e) { continue; }
      if (my !== routeSeq) return;
      const rides = r.legs.filter((l) => l.k === 'ride');
      const sum = rides.length ? `${rides.map((l) => CAT[l.cat][0]).filter((v, i, a) => a.indexOf(v) === i).join('+')}, 환승 ${rides.length - 1}회` : '걸어서';
      const li = r.legs.map((l) => l.k === 'walk'
        ? `<li class="rt-walk">도보 ${Math.max(1, Math.round(l.sec / 60))}분</li>`
        : `<li class="rt-ride ${CAT[l.cat][1]}"><span class="rt-tag">${CAT[l.cat][0]}</span> <b>${esc(l.name)}</b><br><span class="rt-st">${esc(l.from)} ${hhmm(l.dep)} → ${esc(l.to)} ${hhmm(l.arr)} · ${l.stops}정거장</span></li>`).join('');
      parts.push(`<div class="rt"><div class="rt-h"><b>${k.toUpperCase()}까지</b> ${hhmm(r.depart)} 출발 → ${hhmm(r.arrive)} 도착 <span class="rt-sum">${sum}</span></div><ol>${li}</ol></div>`);
    }
    if (my !== routeSeq) return;
    el.innerHTML = parts.join('') + '<p class="rt-note">보통 걸리는 시각에 나섰을 때의 예시 경로입니다. 나서는 시각에 따라 경로가 달라질 수 있어요.</p>';
  }
  let busyEl = null;
  function busy(msg) { if (!busyEl) { busyEl = document.createElement('div'); busyEl.className = 'busy'; document.body.appendChild(busyEl); } busyEl.textContent = msg; busyEl.hidden = !msg; }

  /* ---------- 직장 지정 ---------- */
  const markers = {};
  // 직장을 정한 뒤 통근권(조건에 맞는 단지)과 직장이 한눈에 보이게 지도 맞추기. 패널·범례·아래 창에 가리지 않게 여백
  function focusShed() {
    const pts = [];
    for (const k of ['a', 'b']) if (state[k]) pts.push([state[k].lat, state[k].lon]);
    for (const a of state.matches || []) pts.push([a.lat, a.lon]);
    if (!pts.length) return;
    let b = L.latLngBounds(pts);
    if (pts.length < 3) b = b.pad(0.5);
    const mob = mobile();
    const tl = mob ? [16, 70] : [(panelEl.getBoundingClientRect().right || 0) + 16, 20];
    const br = mob ? [16, (sheetH || window.innerHeight * 0.5) + 16] : [24, 20]; // 범례는 오른쪽 아래 구석만 가려서 여백에서 뺌
    map.flyToBounds(b, { paddingTopLeft: tl, paddingBottomRight: br, maxZoom: 14, duration: 0.6 });
  }
  async function setWorkplace(key, lat, lon, label, focus) {
    const i = nearestCell(lat, lon);
    if (i < 0) { toast('서울·인천·경기 안의 사람 사는 곳을 골라 주세요.'); return; }
    let data;
    busy('통근시간 계산 중…');
    let med;
    try { const r = await loadWork(i); data = r.data; med = r.med; }
    catch (e) { busy(''); toast('통근시간을 계산하지 못했습니다. 잠시 뒤 다시 골라 주세요.'); return; }
    busy('');
    state[key] = { idx: i, lat, lon, label: label || '지도에서 고른 위치', data, med };
    if (markers[key]) markers[key].remove();
    markers[key] = L.marker([lat, lon], {
      keyboard: false, icon: L.divIcon({ className: '', html: `<div class="wp-marker ${key}">${key.toUpperCase()}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
    }).addTo(map);
    document.querySelector(`.stop.${key}`).classList.add('set');
    $(`where-${key}`).textContent = state[key].label;
    { const q = $(`q-${key}`); if (!label) { q.value = ''; q.placeholder = '지도에서 고른 곳'; } else if (!q.value) q.value = label; }
    if (key === 'b') $('clear-b').hidden = false;
    syncHash(); refresh();
    if (focus) focusShed();
  }
  function clearB() {
    state.b = null; markers.b?.remove(); delete markers.b;
    document.querySelector('.stop.b').classList.remove('set');
    $('where-b').textContent = '비워 두면 A만 기준으로 봅니다'; $('q-b').value = ''; $('q-b').placeholder = '맞벌이라면 (선택)'; $('clear-b').hidden = true;
    syncHash(); refresh();
  }

  /* ---------- 판독창 ---------- */
  function renderReadout(i) {
    if (!state.a) { $('ro').hidden = true; $('ro-empty').hidden = false; $('ro-empty').textContent = '먼저 직장 A를 정해 주세요. 역 이름으로 찾거나 지도에서 고를 수 있어요.'; return; }
    if (i < 0) { $('ro').hidden = true; $('ro-empty').hidden = false; $('ro-empty').textContent = (mobile() ? '지도를 눌러 보세요' : '지도 위에 커서를 올리거나 눌러 보세요') + '. 그 자리에 살 때 통근시간이 여기에 나옵니다.'; return; }
    $('ro').hidden = false; $('ro-empty').hidden = true;
    for (const k of ['a', 'b']) {
      const wrap = k === 'a' ? document.querySelector('.ro-item.a') : $('ro-b-wrap');
      if (k === 'b' && !state.b) { wrap.hidden = true; continue; }
      wrap.hidden = false;
      const med = t(state[k], i, false), best = t(state[k], i, true);
      const c = cap(k), over = med == null || med > c;
      wrap.classList.toggle('off', over);
      $(`ro-${k}`).innerHTML = med == null ? '–' : `${med}<small>분</small>`;
      const slack = med == null ? '' : over ? `, ${med - c}분 초과` : (state.b && c !== state.limit ? `, 여유 ${c - med}분` : '');
      $(`ro-${k}-best`).textContent = med == null ? '150분 안에 갈 수 없음' : `빠르면 ${best}분${slack}`;
    }
  }

  /* ---------- 범례 ---------- */
  function renderLegend() {
    const L = state.limit, nb10 = Math.ceil(L / 10);
    bandColors = rampN(nb10);
    $('ramp').innerHTML = bandColors.map((c, k) => `<span style="background:${c};flex:${Math.min(10, L - k * 10)}"></span>`).join('');
    const ticks = []; for (let m = 0; m < L; m += 10) ticks.push(m);
    // 끝 눈금(오른쪽 정렬)과 그 앞 눈금(가운데 정렬)이 겹치면 앞 눈금 생략 — 글자 폭을 실제로 재서 판단
    const W = (window.innerWidth <= 720 ? window.innerWidth - 16 - 20 - 62 - 92 : 280 - 28);
    const mctx = (renderLegend._c ||= document.createElement('canvas').getContext('2d'));
    mctx.font = `${window.innerWidth <= 720 ? 10 : 11}px ${getComputedStyle(document.body).fontFamily}`;
    const tw = (s) => mctx.measureText(String(s)).width;
    if (ticks.length > 1) {
      const p = ticks[ticks.length - 1], xp = (p / L) * W;
      if (xp + tw(p) / 2 + 4 > W - tw(L)) ticks.pop();
    }
    ticks.push(L);
    $('ramp-labels').innerHTML = ticks.map((m) => `<span style="left:${(m / L) * 100}%">${m}</span>`).join('');
    $('lim-out').textContent = `${state.limit}분`;
    const T = state.limit, N = state.extra;
    let hint = `출근 시간대에 보통 ${T}분 안에 닿는 곳만 칠합니다.`, title = '통근시간(분)';
    if (state.b) {
      if (state.prio === 'eq') { hint = `A와 B 모두 ${T}분 안에 닿는 곳만 칠합니다. 색은 더 먼 쪽 기준입니다.`; title = '더 먼 쪽 통근시간(분)'; }
      else { const P = state.prio.toUpperCase(), O = state.prio === 'a' ? 'B' : 'A';
        hint = `${P}는 ${T}분, ${O}는 ${T + N}분 안에 닿는 곳만 칠합니다. 색은 ${P} 기준입니다.`; title = `${P} 통근시간(분)`; }
    }
    $('lim-hint').textContent = hint; $('lg-time-title').textContent = title;
    $('prio-wrap').hidden = !state.b; $('extra-wrap').hidden = !state.b || state.prio === 'eq';
    $('extra-out').textContent = `+${N}분`;
    $('lim-label').textContent = state.b && state.prio !== 'eq' ? `${state.prio.toUpperCase()}의 최대 통근시간` : '최대 통근시간';
  }

  /* ---------- 공유용 주소 ---------- */
  function syncHash() {
    const p = new URLSearchParams();
    if (state.a) p.set('a', `${state.a.lat.toFixed(5)},${state.a.lon.toFixed(5)}`);
    if (state.b) p.set('b', `${state.b.lat.toFixed(5)},${state.b.lon.toFixed(5)}`);
    p.set('t', state.limit); p.set('k', state.kind); if (state.priceMode === 'jenks') p.set('pb', 'j'); if (state.pick) p.set('pc', [...state.pick].sort((a, b) => a - b).join('.') || 'none'); p.set('m', state.minArea); p.set('n', state.minN); if (state.b) { p.set('pr', state.prio); p.set('x', state.extra); }
    if (state.budget !== Infinity) p.set('p', state.budget);
    if (state.kind === 'rent' && state.myDep) p.set('d', state.myDep);
    if (state.modes !== '1111') p.set('md', state.modes); if (state.tr >= 0) p.set('tr', state.tr);
    history.replaceState(null, '', '#' + p.toString());
    renderLegend();
  }

  let toastTimer;
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), 3600); }

  function setPicking(key) {
    state.picking = state.picking === key ? null : key;
    document.querySelectorAll('.pick').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === state.picking)));
    document.body.classList.toggle('picking', !!state.picking);
    layer.redraw(); // 고르는 동안 통근시간·단지 층 숨김, 끝나면 다시
    if (state.picking) toast(`지도에서 직장 ${state.picking.toUpperCase()} 위치를 눌러 주세요.`);
  }

  /* ---------- 이벤트 ---------- */
  map.on('click', (e) => {
    if (state.picking) { const k = state.picking; setPicking(k); setWorkplace(k, e.latlng.lat, e.latlng.lng); return; }
    if (!state.a) { setWorkplace('a', e.latlng.lat, e.latlng.lng); return; }
    const cp = map.latLngToContainerPoint(e.latlng); let hit = null, hd = 12 * 12;
    if (best.on && state.clusters) { // 묶인 배지를 누르면 그 단지들이 보이게 확대, 하나면 그 단지 선택
      let cl = null, cd = 14 * 14;
      for (const c of state.clusters) { const d = (c.x - cp.x) ** 2 + (c.y - cp.y) ** 2; if (d < cd) { cd = d; cl = c; } }
      if (cl && cl.members.length > 1) { map.flyToBounds(L.latLngBounds(cl.members.map((a) => [a.lat, a.lon])).pad(0.6), { maxZoom: Math.min(17, map.getZoom() + 3), duration: 0.5 }); return; }
      if (cl) { selectApt(cl.a, false); return; }
    }
    for (const a of state.matches) { const p = map.latLngToContainerPoint([a.lat, a.lon]); const d = (p.x - cp.x) ** 2 + (p.y - cp.y) ** 2; if (d < hd) { hd = d; hit = a; } }
    if (hit) { selectApt(hit, false); return; }
    if (state.sel) { state.sel = null; renderList(); }
    state.hover = nearestCell(e.latlng.lat, e.latlng.lng); renderReadout(state.hover); layer.redraw(); showRoute(state.hover);
  });
  let raf;
  map.on('mousemove', (e) => {
    if (!state.grid || !state.a) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = nearestCell(e.latlng.lat, e.latlng.lng);
      if (i !== state.hover) { state.hover = i; renderReadout(i); layer.redraw(); }
    });
  });
  document.querySelectorAll('.pick').forEach((b) => b.addEventListener('click', () => setPicking(b.dataset.key)));
  $('clear-b').addEventListener('click', clearB);
  $('lim').addEventListener('input', (e) => { state.limit = +e.target.value; syncHash(); refresh(); });
  function setBudgetUI() {
    const B = KINDS[state.kind].bud, s = $('bud');
    // 예산 막대 맨 끝 = 제한 없음(바로 앞 칸: 매매 20억·전세 10억·월세 200만). 그보다 큰 예산(옛 링크)은 제한 없음으로
    if (state.budget !== Infinity && state.budget / B.mul >= B.max) state.budget = Infinity;
    s.min = B.min; s.max = B.max; s.step = B.step;
    s.value = state.budget === Infinity ? B.max : Math.min(B.max, Math.max(B.min, state.budget / B.mul));
    $('bud-label').textContent = state.kind === 'rent' ? (state.myDep ? '월세 예산(내 보증금 기준)' : '월세 예산(보증금까지 월세로)') : '예산';
    $('bud-out').textContent = state.budget === Infinity ? '제한 없음' : `${won(state.budget)} 이하`;
  }
  $('bud').addEventListener('input', (e) => {
    const B = KINDS[state.kind].bud, v = +e.target.value;
    state.budget = v >= B.max ? Infinity : Math.round(v * B.mul);
    setBudgetUI(); syncHash(); refresh();
  });
  function setKind(k) {
    if (!KINDS[k]) return;
    const changed = state.kind !== k; state.kind = k;
    document.querySelectorAll('#kind button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.kind === k)));
    if (changed) { state.budget = Infinity; state.pick = null; state.anchor = null; } // 단위가 달라서 예산은 초기화
    $('dep-box').hidden = k !== 'rent';
    setBudgetUI();
  }
  // 월세: 내 보증금(억원) — 단지마다 이 보증금으로 계약할 때 월세로 바꿔 비교
  let depT;
  $('mydep').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
    state.myDep = isFinite(v) && v > 0 ? Math.round(Math.min(v, 50) * 10000) : 0; // 만원
    clearTimeout(depT); depT = setTimeout(() => { setBudgetUI(); syncHash(); refresh(); }, 250);
  });
  document.querySelectorAll('#kind button').forEach((b) => b.addEventListener('click', () => { setKind(b.dataset.kind); syncHash(); refresh(); }));
  $('pmode').addEventListener('click', () => { state.priceMode = state.priceMode === 'jenks' ? 'fixed' : 'jenks'; state.pick = null; state.anchor = null; syncHash(); refresh(); });
  // 가격 범례 칸 누르기: 구간 고르기/해제(여러 개 가능)
  /* 휴대폰: 조건 창 위 손잡이를 끌어 높이 조절, 끝 가까이에서는 위·아래로 붙음 */
  const panelEl = document.querySelector('.panel'), mobile = () => window.matchMedia('(max-width:720px)').matches;
  const sheetLim = () => { const H = window.innerHeight; return { min: 58, def: Math.round(H * 0.52), max: Math.round(H * 0.78) }; };
  let sheetH = null;
  function setSheetH(h) {
    sheetH = h; document.documentElement.style.setProperty('--sheet-h', h + 'px');
    document.body.classList.toggle('sheet-low', h < 140);
    // 조건 창을 높이 올리면 남은 지도가 좁아서 범례를 잠시 버튼으로 줄였다가, 내리면 되돌림
    const high = h > sheetLim().def + 60, lg = $('legend');
    if (high && !lg.classList.contains('min')) { setLegendMin(true); autoLg = true; }
    else if (!high && autoLg) { setLegendMin(false); autoLg = false; }
  }
  let autoLg = false;
  function setLegendMin(min) {
    $('legend').classList.toggle('min', min);
    const t = $('lg-tog'); t.textContent = min ? '범례 · 최적의 집 찾기' : '숨기기';
    t.setAttribute('aria-expanded', String(!min)); t.setAttribute('aria-label', min ? '범례 보기' : '범례 숨기기');
  }
  function setSheet(min) { setSheetH(min ? sheetLim().min : sheetLim().def); if (min) panelEl.scrollTop = 0; }
  (() => {
    const hd = $('sheet-handle'); let y0 = 0, h0 = 0, moved = false, id = null;
    hd.addEventListener('pointerdown', (e) => {
      if (!mobile()) return;
      id = e.pointerId; hd.setPointerCapture(id); y0 = e.clientY; h0 = panelEl.getBoundingClientRect().height; moved = false;
      document.body.classList.add('dragging');
    });
    hd.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const d = y0 - e.clientY; if (Math.abs(d) > 4) moved = true;
      const L = sheetLim(); setSheetH(Math.min(L.max, Math.max(L.min, h0 + d)));
    });
    const end = (e) => {
      if (e.pointerId !== id) return; id = null; document.body.classList.remove('dragging');
      const L = sheetLim(), h = sheetH ?? L.def;
      if (!moved) { setSheet(h > L.min + 20); return; } // 짧게 누르면 접기 ↔ 기본 높이
      if (h < L.min + (L.def - L.min) * 0.35) setSheet(true);                 // 아래쪽 끝 가까이 → 맨 아래
      else if (h > L.max - (L.max - L.def) * 0.35) setSheetH(L.max);           // 위쪽 끝 가까이 → 맨 위(지도는 남김)
    };
    hd.addEventListener('pointerup', end); hd.addEventListener('pointercancel', end);
    hd.addEventListener('keydown', (e) => {
      const L = sheetLim(), h = sheetH ?? L.def;
      if (e.key === 'ArrowUp') { setSheetH(Math.min(L.max, h + 60)); e.preventDefault(); }
      if (e.key === 'ArrowDown') { setSheetH(Math.max(L.min, h - 60)); e.preventDefault(); }
    });
    window.addEventListener('resize', () => { if (sheetH != null) { const L = sheetLim(); setSheetH(Math.min(L.max, Math.max(L.min, sheetH))); } renderLegend(); renderPriceLegend(); });
  })();
  $('lg-tog').addEventListener('click', () => { autoLg = false; setLegendMin(!$('legend').classList.contains('min')); });

  $('to-top').addEventListener('click', () => { document.querySelector('.panel').scrollTo({ top: 0, behavior: 'smooth' }); });
  // 버튼 3개(버스·지하철·기차) ↔ 내부 수단 4가지 [지하철·전철, 기차, 광역·시외버스, 시내·마을버스]
  function setModesUI() {
    document.querySelectorAll('#modes button').forEach((b) => b.setAttribute('aria-pressed', String([...b.dataset.bits].some((i) => state.modes[+i] === '1'))));
    $('trmax').value = String(state.tr);
  }
  $('modes').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const bits = [...b.dataset.bits].map(Number), m = state.modes.split(''), on = bits.some((i) => m[i] === '1');
    for (const i of bits) m[i] = on ? '0' : '1';
    if (!m.includes('1')) { toast('이동수단을 하나 이상 골라 주세요.'); return; }
    state.modes = m.join(''); setModesUI(); recompute();
  });
  $('trmax').addEventListener('change', (e) => { state.tr = +e.target.value; recompute(); });
  $('pick-toggle').addEventListener('click', () => { state.pick = state.pick && state.pick.size === 0 ? null : new Set(); state.anchor = null; state.showN = 30; syncHash(); refresh(); });
  $('lg-price-body').addEventListener('click', (e) => {
    const b = e.target.closest('.pbar button'); if (!b) return; const k = +b.dataset.c;
    // 두 번 눌러 범위: 첫 클릭은 그 칸만(시작점), 다음 클릭은 시작점~이 칸 사이 전부, 그다음은 다시 시작점
    if (state.anchor == null) { state.pick = new Set([k]); state.anchor = k; }
    else { const lo = Math.min(state.anchor, k), hi = Math.max(state.anchor, k); state.pick = new Set(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)); state.anchor = null; }
    if (state.pick.size === state.priceColors.length) state.pick = null;
    state.showN = 30; syncHash(); refresh();
  });
  $('area').addEventListener('change', (e) => { state.minArea = +e.target.value; syncHash(); refresh(); });
  $('minn').addEventListener('change', (e) => { state.minN = +e.target.value; syncHash(); refresh(); });
  function setPrio(p) {
    state.prio = p;
    document.querySelectorAll('#prio button').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.p === p)));
  }
  document.querySelectorAll('#prio button').forEach((b) => b.addEventListener('click', () => { setPrio(b.dataset.p); syncHash(); refresh(); }));
  $('extra').addEventListener('input', (e) => { state.extra = +e.target.value; syncHash(); refresh(); });
  $('apt-more').addEventListener('click', () => { state.showN += 30; renderList(); });
  function setOpacity(v) {
    state.opacity = v / 100; $('op').value = v; $('op-out').textContent = `${v}%`;
    layer.redraw();
    $('ramp').style.opacity = state.opacity;
    try { localStorage.setItem('commute-opacity', String(v)); } catch (e) { /* 저장 안 되면 그대로 */ }
  }
  $('op').addEventListener('input', (e) => setOpacity(+e.target.value));
  try { const sv = +localStorage.getItem('commute-opacity'); if (sv >= 20 && sv <= 90) setOpacity(sv); else setOpacity(55); } catch (e) { setOpacity(55); }
  $('apt-list').addEventListener('click', (e) => {
    if (e.target.closest('#apt-back')) { state.sel = null; renderList(); layer.redraw(); showRoute(-1); $('apt-count').scrollIntoView({ block: 'nearest' }); return; }
    if (e.target.closest('.one')) return;
    const btn = e.target.closest('.more-d');
    if (btn) { const a = state.matches[+btn.dataset.k]; state.open = state.open === a.seq ? null : a.seq; selectApt(a, false); return; }
    if (e.target.closest('.detail')) return;
    const li = e.target.closest('.apt'); if (li) selectApt(state.matches[+li.dataset.k], true);
  });
  $('apt-list').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const li = e.target.closest('.apt'); if (li) selectApt(state.matches[+li.dataset.k], true); } });


  /* ---------- 위치 알아보기: 지하철 노선 (누르는 동작 없음, 보기 전용) ---------- */
  const ORIENT_KEY = 'commute-orient2'; // 노선은 기본 꺼짐(누르면 켜짐)
  let orient = { rail: false };
  try { Object.assign(orient, JSON.parse(localStorage.getItem(ORIENT_KEY) || '{}')); } catch (e) { /* 저장 안 됨 */ }
  function mkPane(name, z) { const p = map.createPane(name); p.style.zIndex = z; p.style.pointerEvents = 'none'; return name; }
  const P_RAIL = mkPane('o-rail', 410), P_LAB = mkPane('o-lab', 620);
  const oLayers = { rail: L.layerGroup() };
  function zoomClass() {
    const z = map.getZoom(), c = map.getContainer().classList;
    for (let i = 8; i <= 18; i++) c.toggle(`z${i}`, i === z);
    c.toggle('zlo', z <= 11); c.toggle('zmid', z === 12); c.toggle('zhi', z >= 13);
    if (railLine) { const w = z <= 11 ? 1.2 : z <= 13 ? 1.8 : 2.6; railCase.setStyle({ weight: w + 1.6 }); railLine.setStyle({ weight: w }); }
  }
  let railLine = null, railCase = null;
  function applyOrient() {
    for (const k of Object.keys(oLayers)) { if (orient[k]) oLayers[k].addTo(map); else oLayers[k].remove(); }
    document.querySelectorAll('#o-ctl [data-o]').forEach((b) => b.setAttribute('aria-pressed', String(!!orient[b.dataset.o])));
    try { localStorage.setItem(ORIENT_KEY, JSON.stringify(orient)); } catch (e) { /* 저장 안 됨 */ }
  }
  async function initOrient() {
    // 지도 오른쪽 위: 표시 켜고 끄기 + 내 위치
    const Ctl = L.Control.extend({ options: { position: 'topright' }, onAdd() {
      const d = L.DomUtil.create('div', 'o-ctl'); d.id = 'o-ctl';
      d.innerHTML = '<button type="button" data-o="rail" aria-pressed="false" title="지하철 노선 보기">노선</button>';
      L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d; } });
    map.addControl(new Ctl());
    $('o-ctl').addEventListener('click', (e) => { const b = e.target.closest('[data-o]'); if (!b) return; orient[b.dataset.o] = !orient[b.dataset.o]; applyOrient(); });
    map.on('zoomend', zoomClass); zoomClass(); applyOrient();
    const get = (f) => fetch(`data/orient/${f}`).then((r) => r.json());
    try {
      const [rail] = await Promise.all(['rail.json'].map(get));
      railCase = L.geoJSON(rail, { pane: P_RAIL, interactive: false, style: { color: '#fff', weight: 2.8, opacity: 0.85, lineCap: 'round' } }).addTo(oLayers.rail);
      railLine = L.geoJSON(rail, { pane: P_RAIL, interactive: false, style: (f) => ({ color: f.properties.c, weight: 1.2, opacity: 0.9, lineCap: 'round' }) }).addTo(oLayers.rail);
      zoomClass();
    } catch (e) { /* 표시 자료가 없어도 지도는 동작 */ }
  }

  // apts.json v2(열 단위) → 원래 행 모양 [seq, 이름, 동, 연도, 위도, 경도, 칸, 면적형들, 세대수, 분양형태]
  function unpackApts(c) {
    const n = c.seq.length, out = new Array(n); let la = 0, lo = 0, r = 0;
    const nt = c.t.length;
    for (let i = 0; i < n; i++) {
      la += c.lat[i]; lo += c.lon[i];
      const ty = [];
      for (let k = 0; k < c.tn[i]; k++, r++) { const row = new Array(nt); for (let j = 0; j < nt; j++) row[j] = c.t[j][r]; ty.push(row); }
      out[i] = [c.seq[i], c.name[i], c.dong[i], c.year[i], la / 1e5, lo / 1e5, c.cell[i], ty, c.hh[i], c.sale[i]];
    }
    return out;
  }
  /* ---------- 시작 ---------- */
  (async () => {
    const [g, apts, stations, seoul] = await Promise.all([
      fetch('data/grid.json').then((r) => r.json()),
      fetch('data/apts.json').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('data/stations.json').then((r) => r.json()),
      fetch('data/region.geojson').then((r) => r.json()),
    ]);
    state.grid = g; state.apts = apts && apts.v === 2 ? unpackApts(apts) : apts;
    // 자료 기준일: 제목 아래 한 줄 — 실거래가 갱신일 · 대중교통 시간표
    Promise.all([fetch('data/apts_meta.json').then((r) => (r.ok ? r.json() : null)).catch(() => null), fetch('data/rt2/meta.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)]).then(([pm, rm]) => {
      const d = (s) => { const [y, mo, da] = s.split('-').map(Number); return `${y}년 ${mo}월 ${da}일`; };
      const gt = rm && rm.gtfs ? rm.gtfs.replace(/^KTDB (\d{4})-(\d{2}) (.*)$/, (_, y, mo, w) => `${y}년 ${+mo}월 ${w}`) : '';
      const parts = [pm && pm.updated ? `실거래가 ${d(pm.updated)} 갱신` : '', gt ? `대중교통 시간표 ${gt}` : ''].filter(Boolean);
      if ($('asof')) $('asof').textContent = parts.length ? `자료 기준 · ${parts.join(' · ')}` : '';
    });
    fetch('data/apts_meta.json').then((r) => (r.ok ? r.json() : null)).then((m) => { if (m && $('price-basis')) $('price-basis').textContent = `${m.from.slice(0, 4)}년 ${+m.from.slice(4)}월~${m.to.slice(0, 4)}년 ${+m.to.slice(4)}월, ${m.updated} 갱신`; }).catch(() => {});
    { // grid.json v2: 칸 번호(gx,gy)·좌표(1e-5도)가 앞 값과의 차이로 들어 있음 → 풀기
      let gx, gy;
      if (g.v === 2) {
        const un = (d, f) => { const o = new Float64Array(d.length); let v = 0; for (let i = 0; i < d.length; i++) { v += d[i]; o[i] = v * f; } return o; };
        gx = un(g.gx, 1); gy = un(g.gy, 1); g.lat = un(g.lat, 1e-5); g.lon = un(g.lon, 1e-5);
      } else { const S = g.size_m || 250; gx = g.ids.map((id) => +id.split('_')[0] / S); gy = g.ids.map((id) => +id.split('_')[1] / S); }
      const key = (x, y) => x * 100000 + y, pos = new Map();
      for (let i = 0; i < g.n; i++) pos.set(key(gx[i], gy[i]), i);
      nb = Array.from({ length: g.n }, (_, i) => { const f = (dx, dy) => pos.get(key(gx[i] + dx, gy[i] + dy)) ?? -1; return [f(0, 1), f(0, -1), f(-1, 0), f(1, 0)]; }); }
    for (let i = 0; i < g.n; i++) { const k = bkey(g.lat[i], g.lon[i]); (buckets.get(k) || buckets.set(k, []).get(k)).push(i); }
    const outline = L.geoJSON(seoul, { interactive: false, style: { color: '#1F2B3D', weight: 1.5, opacity: 0.55, fill: false } }).addTo(map);
    const narrow = window.innerWidth <= 720;
    // 처음 지도: 강남역 중심. 조건 창(왼쪽 / 휴대폰은 아래)에 가리지 않게 보이는 칸 가운데로 옮김
    map.setView([37.4979, 127.0276], 13, { animate: false });
    map.panBy(narrow ? [0, Math.round(window.innerHeight * 0.26)] : [-190, 0], { animate: false });
    initOrient(); bestUI();
    $('basis').textContent = '국가교통DB 2025년 3월 평일 시간표, 평일 오전 7시 30분~8시 30분 사이 출발, 보행 시속 4.5km, 지하철 환승은 국가교통DB 환승시간 기준, 버스 구간 시간은 서울시 실측 운행기록(2025년 3월 평일 출근시간)으로 보정. 통근시간은 직장을 고를 때 브라우저에서 바로 계산합니다.';

    /* ---------- 직장 검색: 역 → 장소(회사·건물) → 주소 ---------- */
    // 브이월드 검색 API(JSONP): 장소(회사·건물) + 도로명·지번 주소
    const BBOX = '126.10,36.89,127.86,38.30'; // 서울·인천·경기
    const norm = (s) => s.replace(/\s+/g, '');
    let jsonpN = 0;
    const jsonp = (url) => new Promise((res) => {
      const cb = `__vw${Date.now()}_${jsonpN++}`, sc = document.createElement('script');
      const end = (v) => { clearTimeout(t); delete window[cb]; sc.remove(); res(v); };
      const t = setTimeout(() => end(null), 5000);
      window[cb] = (d) => end(d); sc.onerror = () => end(null);
      sc.src = `${url}&callback=${cb}`; document.head.appendChild(sc);
    });
    const vw = (q, type, category) => !hasVW ? Promise.resolve([]) : jsonp('https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&size=6&page=1&format=json&errorformat=json'
      + `&type=${type}${category ? `&category=${category}` : ''}&bbox=${BBOX}&query=${encodeURIComponent(q)}&key=${VW_KEY}&domain=${encodeURIComponent(location.origin)}`)
      .then((d) => (d && d.response && d.response.status === 'OK' && d.response.result && d.response.result.items) || []);
    const inCap = (t) => /^(서울|인천|경기)/.test(t || '');
    const searchVW = async (q) => {
      const looksAddr = /\d/.test(q); // 번지가 있으면 주소를 장소보다 먼저
      const [pl, road, parcel] = await Promise.all([vw(q, 'place'), looksAddr ? vw(q, 'address', 'road') : [], looksAddr ? vw(q, 'address', 'parcel') : []]);
      const out = [];
      for (const x of pl) { const ad = x.address || {}; if (inCap(ad.road || ad.parcel)) out.push({ kind: 'place', name: x.title, sub: ad.road || ad.parcel || '', lat: +x.point.y, lon: +x.point.x, order: looksAddr ? 2 : 1 }); }
      for (const x of [...road, ...parcel].slice(0, 4)) { const ad = x.address || {}; const nm = ad.road || ad.parcel; if (inCap(nm)) out.push({ kind: 'addr', name: nm, sub: ad.bldnm || (ad.road && ad.parcel && ad.parcel !== ad.road ? ad.parcel : ''), lat: +x.point.y, lon: +x.point.x, order: looksAddr ? 1 : 2 }); }
      return out;
    };
    const KIND = { st: '역', place: '장소', addr: '주소' };
    for (const k of ['a', 'b']) {
      const input = $(`q-${k}`), list = $(`sugg-${k}`);
      let items = [], active = -1, timer = null, seq = 0;
      const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
      const render = () => {
        if (!items.length) { list.innerHTML = '<li class="sg-none">찾는 곳이 없습니다. 다른 이름이나 주소로 찾거나 지도에서 골라 주세요.</li>'; }
        else list.innerHTML = items.map((x, i) => `<li role="option" id="sg-${k}-${i}" class="sg${i === active ? ' on' : ''}" data-i="${i}">
          <span class="sg-k">${KIND[x.kind]}</span><span class="sg-n">${x.name}</span>${x.sub ? `<span class="sg-s">${x.sub}</span>` : ''}</li>`).join('');
        list.hidden = false; input.setAttribute('aria-expanded', 'true');
        if (active >= 0) input.setAttribute('aria-activedescendant', `sg-${k}-${active}`); else input.removeAttribute('aria-activedescendant');
      };
      const choose = (x) => {
        if (!x) return; close(); input.value = x.name;
        setWorkplace(k, x.lat, x.lon, x.kind === 'st' ? x.name : `${x.name}${x.sub && x.kind === 'place' ? ` (${x.sub})` : ''}`, true);
      };
      const run = async () => {
        const q = input.value.trim(); const my = ++seq;
        if (q.length < 2) { close(); return; }
        const nq = norm(q).replace(/역$/, '');
        const st = stations.filter(([n]) => norm(n).replace(/역$/, '').includes(nq)).slice(0, 4)
          .map(([n, la, lo]) => ({ kind: 'st', name: n, sub: '지하철역', lat: la, lon: lo, order: 0 }));
        items = st; active = items.length ? 0 : -1; render();
        const more = await searchVW(q);
        if (my !== seq) return; // 더 새 입력이 있으면 버림
        const seen = new Set(items.map((x) => x.name));
        for (const x of more.sort((a, b) => a.order - b.order)) if (!seen.has(x.name)) { seen.add(x.name); items.push(x); }
        items = items.slice(0, 9); if (active < 0 && items.length) active = 0; render();
      };
      input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 250); });
      input.addEventListener('keydown', (e) => {
        if (list.hidden && e.key === 'Enter') { run(); e.preventDefault(); return; }
        if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); render(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
        else if (e.key === 'Enter') { choose(items[active]); e.preventDefault(); }
        else if (e.key === 'Escape') close();
      });
      list.addEventListener('mousedown', (e) => { const li = e.target.closest('.sg'); if (li) { e.preventDefault(); choose(items[+li.dataset.i]); } });
      input.addEventListener('blur', () => setTimeout(close, 120));
    }

    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get('t')) { state.limit = Math.min(90, Math.max(15, +p.get('t') || 50)); $('lim').value = state.limit; }
    if (KINDS[p.get('k')]) setKind(p.get('k'));
    if (p.get('pb') === 'j') state.priceMode = 'jenks';
    if (/^[01]{4}$/.test(p.get('md') || '') && p.get('md') !== '0000') state.modes = p.get('md');
    if (p.get('tr') != null && /^[0-3]$/.test(p.get('tr'))) state.tr = +p.get('tr');
    setModesUI();
    if (p.get('pc')) state.pick = new Set(p.get('pc') === 'none' ? [] : p.get('pc').split('.').map(Number).filter((k) => k >= 0 && k < 40));
    if (p.get('m') != null) { state.minArea = +p.get('m') || 0; $('area').value = String(state.minArea); }
    if (p.get('p')) state.budget = +p.get('p') || Infinity;
    if (p.get('d')) { state.myDep = Math.max(0, +p.get('d') || 0); $('mydep').value = state.myDep ? String(state.myDep / 10000) : ''; }
    if (p.get('n')) { state.minN = Math.max(1, +p.get('n') || 2); $('minn').value = String(state.minN); }
    if (['eq', 'a', 'b'].includes(p.get('pr'))) setPrio(p.get('pr'));
    if (p.get('x')) { state.extra = Math.min(60, Math.max(0, +p.get('x') || 0)); $('extra').value = state.extra; }
    setBudgetUI(); renderLegend(); renderReadout(-1); renderList();
    if (mobile()) setLegendMin(true); // 휴대폰은 범례를 접은 채로 시작 → 지도를 넓게
    $('legend').classList.toggle('empty', !state.a);
    for (const k of ['a', 'b']) {
      const v = p.get(k); if (!v) continue;
      const [la, lo] = v.split(',').map(Number); if (isFinite(la) && isFinite(lo)) await setWorkplace(k, la, lo, null, true);
    }
  })();
})();
