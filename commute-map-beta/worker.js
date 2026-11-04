/* 통근시간 계산 워커: 시간표·보행표를 한 번 받아 두고, 직장 칸을 받으면 [보통|최적] 분 배열을 돌려줌 */
importScripts('engine.js');
const TA = { uint16: Uint16Array, int32: Int32Array, uint8: Uint8Array, float32: Float32Array };
let ready = null;
async function bytes(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) { // gzip 그대로 받은 경우 브라우저에서 풀기
    const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  return buf; // 서버가 이미 풀어서 준 경우
}
async function init(base) {
  const M = await (await fetch(base + 'meta.json')).json(); const D = { S: M.S };
  let got = 0; const keys = Object.keys(M.types);
  await Promise.all(keys.map(async (k) => {
    const b = await bytes(`${base}${k}.bin.gz`), T = TA[M.types[k]];
    D[k] = new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT);
    postMessage({ type: 'progress', got: ++got, total: keys.length });
  }));
  if (M.timesDelta) { const t = D.times; for (let p = 0; p < D.pto.length - 1; p++) { const ns = D.pso[p + 1] - D.pso[p]; for (let o = D.pto[p]; o < D.pto[p + 1]; o += 2 * ns) for (let i = 1; i < 2 * ns; i++) t[o + i] = (t[o + i - 1] + t[o + i]) & 0xffff; } }
  return makeEngine(D);
}
onmessage = async (e) => {
  const m = e.data;
  try {
    if (!ready) ready = init(m.base || 'data/rt/');
    const E = await ready;
    if (m.type === 'query') { const t = performance.now(); const out = E.query(m.cell); postMessage({ type: 'result', id: m.id, cell: m.cell, ms: Math.round(performance.now() - t), data: out }, [out.buffer]); }
    else postMessage({ type: 'ready' });
  } catch (err) { ready = null; postMessage({ type: 'error', id: m.id, msg: String(err) }); }
};
