/* 통근 지도 — 정적 사이트용 클라이언트
   data/grid.json            : 250m 격자 중심 좌표(인덱스 순서 고정)
   data/w/{직장칸}.bin        : Uint8Array(2n) = [보통(p50) n개][최적(p1) n개], 255 = 도달 불가
*/
(() => {
  const DEBUG_MASK = /(^|&)dbg=1/.test(location.hash.slice(1));
  const RAMP = ['#0E5E58', '#1F8A70', '#5DB37E', '#A9D48F', '#E2EDA2'];
  // 가격 색: 파랑(싼 곳) → 보라 → 자홍 → 빨강(비싼 곳). 구간 수에 맞춰 보간.
  const PRICE_STOPS = ['#1D4ED8', '#3B82F6', '#7C3AED', '#C026D3', '#E11D48', '#B91C1C'];
  const range = (a, b, s) => { const o = []; for (let v = a; v <= b + 1e-9; v += s) o.push(Math.round(v)); return o; };
  // pi/ni: apts.json types 안 가격·건수 위치. 금액 단위는 만원.
  const KINDS = {
    sale:   { name: '매매', pi: 1, ni: 2, bud: { min: 1, max: 40, step: 0.5, mul: 10000 }, fixed: range(10000, 150000, 10000), round: 1000 },
    jeonse: { name: '전세', pi: 3, ni: 4, bud: { min: 1, max: 20, step: 0.5, mul: 10000 }, fixed: range(5000, 60000, 5000), round: 1000 },
    rent:   { name: '월세', pi: 6, ni: 8, bud: { min: 10, max: 300, step: 10, mul: 1 }, fixed: range(50, 150, 10), round: 5 },
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
    opacity: 0.55, priceMode: 'fixed', open: null, apts: [], kind: 'sale', budget: Infinity, minArea: 59, minN: 2, prio: 'eq', extra: 15, matches: [], showN: 30, sel: null };

  let buckets = new Map();

  const map = L.map('map', { zoomControl: false, minZoom: 10, maxZoom: 17 }).setView([37.5565, 126.99], 11);
  L.control.zoom({ position: 'topright' }).addTo(map);
  if (DEBUG_MASK) window.__map = map;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, className: 'basemap',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> 기여자',
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
      const g = state.grid; if (!g || !state.a?.data) return;
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
      const z = m.getZoom(), r = z >= 14 ? 5 : z >= 12 ? 3.5 : 2.4;
      ctx.lineWidth = z >= 12 ? 1.5 : 1;
      for (const a of state.matches) {
        if (a.lat < b.getSouth() || a.lat > b.getNorth() || a.lon < b.getWest() || a.lon > b.getEast()) continue;
        const p = m.latLngToContainerPoint([a.lat, a.lon]);
        ctx.beginPath(); ctx.arc(p.x, p.y, a === state.sel ? r + 3 : r, 0, 7);
        ctx.fillStyle = state.priceColors[a.cls]; ctx.fill();
        ctx.strokeStyle = a === state.sel ? '#1F2B3D' : '#fff'; ctx.lineWidth = a === state.sel ? 2.5 : (z >= 12 ? 1.5 : 1); ctx.stroke();
      }
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
  function computeMatches() {
    state.matches = [];
    if (!state.a?.data) return;
    const { pi, ni } = KINDS[state.kind];
    for (const [seq, name, dong, year, lat, lon, cell, types] of state.apts) {
      if (cell < 0) continue;
      const v = metric(cell); if (v == null || v > state.limit) continue;
      let best = null;
      for (const t of types) {
        if (t[0] < state.minArea || t[pi] == null || t[pi] > state.budget || t[ni] < state.minN) continue;
        if (!best || t[pi] < best[pi]) best = t;
      }
      if (!best) continue;
      state.matches.push({ seq, name, dong, year, lat, lon, cell, v, types, area: best[0], price: best[pi], n: best[ni], dep: best[7], ym: best[5] });
    }
    for (const a of state.matches) a.v2 = second(a.cell);
    state.matches.sort((x, y) => x.v - y.v || x.v2 - y.v2 || x.price - y.price);
    // 구간 경계(각 경계 이상이면 다음 구간). 고정: 종류별 단위, 자연: Jenks 10분위
    state.breaks = state.priceMode === 'jenks' ? priceBreaks(state.matches.map((a) => a.price)) : KINDS[state.kind].fixed;
    state.priceColors = interp(PRICE_STOPS, state.breaks.length + 1);
    for (const a of state.matches) { let c = 0; while (c < state.breaks.length && a.price >= state.breaks[c]) c++; a.cls = c; }
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
    if (!state.matches.length) { el.innerHTML = '<span class="pz-none">조건에 맞는 단지가 없습니다</span>'; return; }
    const n = cols.length, lab = (v) => won(v);
    const segs = cols.map((c, k) => {
      const lo = k === 0 ? null : br[k - 1], hi = k < br.length ? br[k] : null;
      const tip = lo == null ? `${won(hi)} 미만` : hi == null ? `${won(lo)} 이상` : `${won(lo)}~${won(hi)}`;
      const cnt = state.matches.filter((a) => a.cls === k).length;
      return `<span style="background:${c}" title="${tip} · ${cnt}곳"></span>`;
    }).join('');
    // 눈금: 경계값을 최대 6개까지 간격을 두고 표시
    const stride = Math.max(1, Math.ceil(br.length / (window.innerWidth <= 720 ? 4 : 6)));
    const ticks = br.map((v, i) => ({ v, i })).filter(({ i }) => (br.length - 1 - i) % stride === 0) // 마지막 경계부터 고르게
      .map(({ v, i }) => { const pos = ((i + 1) / n) * 100; return `<span class="${pos > 94 ? 'edge-r' : ''}" style="left:${pos}%">${lab(v)}</span>`; }).join('');
    el.innerHTML = `<div class="pbar">${segs}</div><div class="pticks">${ticks}</div>
      <div class="pnote"><span>싼 곳</span><span>${state.priceMode === 'jenks' ? '자연 구간 ' + n + '단계' : '고정 구간 ' + n + '단계'}</span><span>비싼 곳</span></div>`;
  }
  function renderList() {
    const ol = $('apt-list'), kindName = KINDS[state.kind].name;
    if (!state.a) { $('apt-count').textContent = '단지 목록'; ol.innerHTML = '<li class="none">직장을 정하면 통근시간 안에 있는 아파트 단지가 여기에 나옵니다.</li>'; $('apt-more').hidden = true; return; }
    $('apt-count').textContent = `조건에 맞는 단지 ${state.matches.length.toLocaleString()}곳`;
    if (!state.matches.length) { ol.innerHTML = '<li class="none">조건에 맞는 단지가 없습니다. 최대 통근시간이나 예산을 늘려 보세요.</li>'; $('apt-more').hidden = true; return; }
    ol.innerHTML = state.matches.slice(0, state.showN).map((a, k) => {
      const tb = state.b?.data ? t(state.b, a.cell, false) : null, ta = t(state.a, a.cell, false);
      const tm = tb == null ? `${ta}분` : `A ${ta} / B ${tb}분`;
      return `<li class="apt${a === state.sel ? ' sel' : ''}" data-k="${k}" tabindex="0">
        <span class="nm">${a.name}</span><span class="tm">${tm}</span>
        <span class="sub">${a.dong}${a.year ? `, ${a.year}년` : ''}</span>
        <span class="pr">${a.area}㎡ ${kindName} ${won(a.price)} (${a.n}건)</span>
        <button type="button" class="more-d" data-k="${k}" aria-expanded="${state.open === a.seq}">${state.open === a.seq ? '접기' : '세부정보'}</button>
        ${state.open === a.seq ? detailHTML(a) : ''}</li>`;
    }).join('');
    $('apt-more').hidden = state.matches.length <= state.showN;
  }
  // 세부정보: 면적형별 가격(현재 거래 종류). 월세는 보증금도 함께.
  function detailHTML(a) {
    const K = KINDS[state.kind];
    const rows = a.types.filter((t) => t[K.pi] != null).map((t) => {
      const extra = state.kind === 'rent' ? `<td>${t[7] != null ? won(t[7]) : '–'}</td>` : '';
      const ok = t[0] >= state.minArea && t[K.pi] <= state.budget && t[K.ni] >= state.minN;
      return `<tr class="${ok ? '' : 'dim'}"><td>${t[0]}㎡</td><td>${won(t[K.pi])}</td>${extra}<td>${t[K.ni]}건</td></tr>`;
    }).join('');
    const head = state.kind === 'rent' ? '<th>면적</th><th>월세</th><th>보증금</th><th>거래</th>' : `<th>면적</th><th>${K.name}</th><th>거래</th>`;
    const last = a.ym ? `최근 거래 ${a.ym.slice(0, 4)}년 ${+a.ym.slice(4)}월` : '';
    return `<div class="detail"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
      <p>${state.kind === 'rent' ? '월세·보증금은 같은 면적형 월세 계약의 각각 중위값입니다. ' : ''}흐린 줄은 지금 조건(면적·예산·거래 수)에 안 맞는 면적형입니다. ${last}</p></div>`;
  }
  function selectApt(a, fly) {
    state.sel = a; state.hover = a.cell;
    if (fly) map.flyTo([a.lat, a.lon], Math.max(map.getZoom(), 15), { duration: 0.6 });
    renderReadout(a.cell); renderList(); layer.redraw();
    const k = state.matches.indexOf(a);
    if (k >= state.showN) { state.showN = k + 10; renderList(); }
    document.querySelector(`.apt[data-k="${k}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  function refresh() { computeMatches(); renderList(); renderPriceLegend(); layer.redraw(); renderReadout(state.hover); $('legend').classList.toggle('empty', !state.a); }

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
  const bundles = new Map();
  async function loadWork(i) {
    const B = state.grid.bundle || 64, n = state.grid.n, k = Math.floor(i / B);
    if (!bundles.has(k)) {
      const p = fetch(`data/wb/${k}.bin`).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); });
      bundles.set(k, p); p.catch(() => bundles.delete(k));
    }
    const buf = await bundles.get(k);
    return new Uint8Array(buf, (i % B) * 2 * n, 2 * n);
  }

  /* ---------- 직장 지정 ---------- */
  const markers = {};
  async function setWorkplace(key, lat, lon, label) {
    const i = nearestCell(lat, lon);
    if (i < 0) { toast('서울 안의 위치를 골라 주세요. 서울 밖 업무지구는 곧 추가합니다.'); return; }
    let data;
    try { data = await loadWork(i); }
    catch (e) { toast('이 위치의 통근시간 자료를 불러오지 못했습니다. 잠시 뒤 다시 골라 주세요.'); return; }
    state[key] = { idx: i, lat, lon, label: label || '지도에서 고른 위치', data };
    if (markers[key]) markers[key].remove();
    markers[key] = L.marker([lat, lon], {
      keyboard: false, icon: L.divIcon({ className: '', html: `<div class="wp-marker ${key}">${key.toUpperCase()}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
    }).addTo(map);
    document.querySelector(`.stop.${key}`).classList.add('set');
    $(`where-${key}`).textContent = state[key].label;
    if (key === 'b') $('clear-b').hidden = false;
    syncHash(); refresh();
  }
  function clearB() {
    state.b = null; markers.b?.remove(); delete markers.b;
    document.querySelector('.stop.b').classList.remove('set');
    $('where-b').textContent = '비워 두면 A만 기준으로 봅니다'; $('q-b').value = ''; $('clear-b').hidden = true;
    syncHash(); refresh();
  }

  /* ---------- 판독창 ---------- */
  function renderReadout(i) {
    if (!state.a) { $('ro').hidden = true; $('ro-empty').hidden = false; $('ro-empty').textContent = '먼저 직장 A를 정해 주세요. 역 이름으로 찾거나 지도에서 고를 수 있어요.'; return; }
    if (i < 0) { $('ro').hidden = true; $('ro-empty').hidden = false; $('ro-empty').textContent = '지도 위에 커서를 올리거나 눌러 보세요. 그 자리에 살 때 통근시간이 여기에 나옵니다.'; return; }
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
    if (window.innerWidth <= 720 && L - ticks[ticks.length - 1] <= 5 && ticks.length > 1) ticks.pop(); // 좁은 화면에서 끝 눈금 겹침 방지
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
    p.set('t', state.limit); p.set('k', state.kind); if (state.priceMode === 'jenks') p.set('pb', 'j'); p.set('m', state.minArea); p.set('n', state.minN); if (state.b) { p.set('pr', state.prio); p.set('x', state.extra); }
    if (state.budget !== Infinity) p.set('p', state.budget);
    history.replaceState(null, '', '#' + p.toString());
    renderLegend();
  }

  let toastTimer;
  function toast(msg) { const el = $('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), 3600); }

  function setPicking(key) {
    state.picking = state.picking === key ? null : key;
    document.querySelectorAll('.pick').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === state.picking)));
    document.body.classList.toggle('picking', !!state.picking);
    if (state.picking) toast(`지도에서 직장 ${state.picking.toUpperCase()} 위치를 눌러 주세요.`);
  }

  /* ---------- 이벤트 ---------- */
  map.on('click', (e) => {
    if (state.picking) { const k = state.picking; setPicking(k); setWorkplace(k, e.latlng.lat, e.latlng.lng); return; }
    if (!state.a) { setWorkplace('a', e.latlng.lat, e.latlng.lng); return; }
    const cp = map.latLngToContainerPoint(e.latlng); let hit = null, hd = 12 * 12;
    for (const a of state.matches) { const p = map.latLngToContainerPoint([a.lat, a.lon]); const d = (p.x - cp.x) ** 2 + (p.y - cp.y) ** 2; if (d < hd) { hd = d; hit = a; } }
    if (hit) { selectApt(hit, false); return; }
    state.hover = nearestCell(e.latlng.lat, e.latlng.lng); renderReadout(state.hover); layer.redraw();
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
    s.min = B.min; s.max = B.max; s.step = B.step;
    s.value = state.budget === Infinity ? B.max : Math.min(B.max, Math.max(B.min, state.budget / B.mul));
    $('bud-label').textContent = state.kind === 'rent' ? '월세 예산' : '예산';
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
    if (changed) state.budget = Infinity; // 단위가 달라서 예산은 초기화
    setBudgetUI();
  }
  document.querySelectorAll('#kind button').forEach((b) => b.addEventListener('click', () => { setKind(b.dataset.kind); syncHash(); refresh(); }));
  $('pmode').addEventListener('click', () => { state.priceMode = state.priceMode === 'jenks' ? 'fixed' : 'jenks'; syncHash(); refresh(); });
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
    const btn = e.target.closest('.more-d');
    if (btn) { const a = state.matches[+btn.dataset.k]; state.open = state.open === a.seq ? null : a.seq; selectApt(a, false); return; }
    if (e.target.closest('.detail')) return;
    const li = e.target.closest('.apt'); if (li) selectApt(state.matches[+li.dataset.k], true);
  });
  $('apt-list').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const li = e.target.closest('.apt'); if (li) selectApt(state.matches[+li.dataset.k], true); } });

  /* ---------- 시작 ---------- */
  (async () => {
    const [g, apts, stations, seoul] = await Promise.all([
      fetch('data/grid.json').then((r) => r.json()),
      fetch('data/apts.json').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('data/stations.json').then((r) => r.json()),
      fetch('data/seoul.geojson').then((r) => r.json()),
    ]);
    state.grid = g; state.apts = apts;
    { const S = g.size_m || 250, pos = new Map(g.ids.map((id, i) => [id, i]));
      nb = g.ids.map((id) => { const [x, y] = id.split('_').map(Number); const f = (dx, dy) => pos.get(`${x + dx}_${y + dy}`) ?? -1; return [f(0, S), f(0, -S), f(-S, 0), f(S, 0)]; }); }
    for (let i = 0; i < g.n; i++) { const k = bkey(g.lat[i], g.lon[i]); (buckets.get(k) || buckets.set(k, []).get(k)).push(i); }
    const outline = L.geoJSON(seoul, { interactive: false, style: { color: '#1F2B3D', weight: 1.5, opacity: 0.55, fill: false } }).addTo(map);
    const narrow = window.innerWidth <= 720;
    map.fitBounds(outline.getBounds(), narrow
      ? { paddingTopLeft: [8, 8], paddingBottomRight: [8, Math.round(window.innerHeight * 0.52)] }
      : { paddingTopLeft: [380, 24], paddingBottomRight: [24, 24] });
    $('basis').textContent = '국가교통DB 2025년 3월 평일 시간표, 평일 오전 7시 30분~8시 30분 사이 출발, 보행 시속 4.5km 기준.';

    /* ---------- 직장 검색: 역 → 장소(회사·건물) → 주소 ---------- */
    let places = null, geocoder = null;
    try { if (window.kakao?.maps) kakao.maps.load(() => { places = new kakao.maps.services.Places(); geocoder = new kakao.maps.services.Geocoder(); }); } catch (e) { /* 검색 서비스 없이 역 검색만 */ }
    const SEOUL_RECT = '126.76,37.41,127.19,37.72';
    const norm = (s) => s.replace(/\s+/g, '');
    const searchKakao = (q) => new Promise((res) => {
      if (!places) return res([]);
      const looksAddr = /\d/.test(q); // 번지가 있으면 주소를 장소보다 먼저
      const out = []; let pending = 2;
      const done = () => { if (--pending === 0) res(out); };
      places.keywordSearch(q, (d, st) => {
        if (st === kakao.maps.services.Status.OK) for (const x of d.slice(0, 6)) out.push({ kind: 'place', name: x.place_name, sub: x.road_address_name || x.address_name, lat: +x.y, lon: +x.x, order: looksAddr ? 2 : 1 });
        done();
      }, { rect: SEOUL_RECT, size: 6 });
      geocoder.addressSearch(q, (d, st) => {
        if (st === kakao.maps.services.Status.OK) for (const x of d.filter((x) => (x.address_name || '').startsWith('서울')).slice(0, 3)) out.push({ kind: 'addr', name: x.road_address?.address_name || x.address_name, sub: x.road_address && x.road_address.address_name !== x.address_name ? x.address_name : '', lat: +x.y, lon: +x.x, order: looksAddr ? 1 : 2 });
        done();
      });
    });
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
        setWorkplace(k, x.lat, x.lon, x.kind === 'st' ? x.name : `${x.name}${x.sub && x.kind === 'place' ? ` (${x.sub})` : ''}`);
        map.flyTo([x.lat, x.lon], Math.max(map.getZoom(), 13), { duration: 0.6 });
      };
      const run = async () => {
        const q = input.value.trim(); const my = ++seq;
        if (q.length < 2) { close(); return; }
        const nq = norm(q).replace(/역$/, '');
        const st = stations.filter(([n]) => norm(n).replace(/역$/, '').includes(nq)).slice(0, 4)
          .map(([n, la, lo]) => ({ kind: 'st', name: n, sub: '지하철역', lat: la, lon: lo, order: 0 }));
        items = st; active = items.length ? 0 : -1; render();
        const more = await searchKakao(q);
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
    if (p.get('m') != null) { state.minArea = +p.get('m') || 0; $('area').value = String(state.minArea); }
    if (p.get('p')) state.budget = +p.get('p') || Infinity;
    if (p.get('n')) { state.minN = Math.max(1, +p.get('n') || 2); $('minn').value = String(state.minN); }
    if (['eq', 'a', 'b'].includes(p.get('pr'))) setPrio(p.get('pr'));
    if (p.get('x')) { state.extra = Math.min(60, Math.max(0, +p.get('x') || 0)); $('extra').value = state.extra; }
    setBudgetUI(); renderLegend(); renderReadout(-1); renderList();
    $('legend').classList.toggle('empty', !state.a);
    for (const k of ['a', 'b']) {
      const v = p.get(k); if (!v) continue;
      const [la, lo] = v.split(',').map(Number); if (isFinite(la) && isFinite(lo)) await setWorkplace(k, la, lo);
    }
  })();
})();
