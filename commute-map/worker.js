/* 통근시간 계산 워커: 시간표·보행표를 한 번 받아 두고, 직장 칸을 받으면 [보통|최적] 분 배열과 경로를 돌려줌 */
importScripts('engine.js');
const TA = { uint16: Uint16Array, uint32: Uint32Array, int32: Int32Array, uint8: Uint8Array, float32: Float32Array };
let ready = null, base = 'data/rt4/', names = null, routes = null, patCat = null, D = null;
async function bytes(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  return buf;
}
// pack_rt.py로 묶은 배열 풀기: s 바이트 평면 되돌리기, d/g:X 차이 누적, v 운행 간 차이 누적(times)
function unshuf(b, w) {
  if (w === 1) return b;
  const n = b.length / w, o = new Uint8Array(b.length);
  for (let j = 0; j < w; j++) { const p = j * n; for (let i = 0; i < n; i++) o[i * w + j] = b[p + i]; }
  return o;
}
function cum(a, off) { // 2^bits 나머지 누적. off가 있으면 구간마다 새로 시작
  const U = a.BYTES_PER_ELEMENT === 4 ? new Uint32Array(a.buffer, a.byteOffset, a.length) : a.BYTES_PER_ELEMENT === 2 ? new Uint16Array(a.buffer, a.byteOffset, a.length) : new Uint8Array(a.buffer, a.byteOffset, a.length);
  if (!off) { for (let i = 1; i < U.length; i++) U[i] = U[i] + U[i - 1]; return; }
  for (let c = 0; c < off.length - 1; c++) for (let i = off[c] + 1; i < off[c + 1]; i++) U[i] = U[i] + U[i - 1];
}
async function init() {
  const M = await (await fetch(base + 'meta.json')).json(); D = { S: M.S };
  let got = 0; const keys = Object.keys(M.types);
  await Promise.all(keys.map(async (k) => {
    const T = TA[M.types[k]], e = (M.enc || {})[k] || 'o';
    let b = await bytes(`${base}${k}.bin.gz`);
    if (e !== 'o') b = unshuf(b, T.BYTES_PER_ELEMENT);
    if (b.byteOffset % T.BYTES_PER_ELEMENT) b = b.slice();
    D[k] = new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT);
    postMessage({ type: 'progress', got: ++got, total: keys.length + 1 });
  }));
  const E = M.enc || {};
  for (const k of Object.keys(E)) if (E[k] === 'd') cum(D[k]);            // 오프셋 배열 먼저
  for (const k of Object.keys(E)) if (E[k].startsWith('g:')) cum(D[k], D[E[k].slice(2)]);
  if (E.times === 'v') { const t = D.times; for (let p = 0; p < D.pto.length - 1; p++) { const w = 2 * (D.pso[p + 1] - D.pso[p]); for (let o = D.pto[p] + w; o < D.pto[p + 1]; o++) t[o] = (t[o] + t[o - w]) & 0xffff; } }
  if (M.timesDelta) { const t = D.times; for (let p = 0; p < D.pto.length - 1; p++) { const ns = D.pso[p + 1] - D.pso[p]; for (let o = D.pto[p]; o < D.pto[p + 1]; o += 2 * ns) for (let i = 1; i < 2 * ns; i++) t[o + i] = (t[o + i - 1] + t[o + i]) & 0xffff; } }
  routes = await (await fetch(base + 'routes.json')).json();
  patCat = new Uint8Array(D.pto.length - 1); for (let p = 0; p < patCat.length; p++) patCat[p] = routes[D.patRoute[p]][1];
  postMessage({ type: 'progress', got: keys.length + 1, total: keys.length + 1 });
  return makeEngine(D);
}
// 조건 → 엔진 옵션. modes: '1111' = [지하철·전철, 기차, 광역·시외버스, 시내·마을버스], tr: 최대 환승(-1 = 제한 없음)
const maskCache = new Map();
function opts(modes, tr) {
  const o = {};
  if (modes && modes !== '1111') {
    if (!maskCache.has(modes)) { const m = new Uint8Array(patCat.length); for (let p = 0; p < m.length; p++) m[p] = modes[patCat[p] - 1] === '1' ? 1 : 0; maskCache.set(modes, m); }
    o.mask = maskCache.get(modes);
  }
  if (tr != null && tr >= 0) o.rides = tr + 1;
  return o;
}
async function stopNames() { if (!names) names = await (await fetch(base + 'stopnames.json')).json(); return names; }
onmessage = async (e) => {
  const m = e.data;
  try {
    if (!ready) ready = init();
    const E = await ready;
    if (m.type === 'query') {
      const t = performance.now(); const r = E.query(m.cell, opts(m.modes, m.tr));
      postMessage({ type: 'result', id: m.id, ms: Math.round(performance.now() - t), data: r.data, med: r.med }, [r.data.buffer, r.med.buffer]);
    } else if (m.type === 'path') {
      const N = await stopNames(); const r = E.path(m.work, m.home, m.ai, opts(m.modes, m.tr));
      // 걷기 구간 합치고(0분 걷기 생략), 차량 구간에 노선 이름·종류·정류장 이름 붙이기
      const legs = [];
      for (const l of r.legs) {
        if (l.k === 'walk') { const last = legs[legs.length - 1]; if (last && last.k === 'walk') last.sec += l.sec; else legs.push({ k: 'walk', sec: l.sec }); }
        else { const [name, cat] = routes[D.patRoute[l.p]]; legs.push({ k: 'ride', name, cat, from: N[l.from], to: N[l.to], dep: l.dep, arr: l.arr, stops: l.stops }); }
      }
      const out = legs.filter((l) => l.k === 'ride' || l.sec >= 30);
      let arrive = r.depart; for (const l of r.legs) arrive = l.k === 'ride' ? l.arr : arrive + l.sec;
      postMessage({ type: 'result', id: m.id, data: { depart: r.depart, arrive, legs: out } });
    } else postMessage({ type: 'ready' });
  } catch (err) { ready = null; postMessage({ type: 'error', id: m.id, msg: String(err) }); }
};
