// 익명 이용 통계 받기: POST /api/e  { s: 방문번호, site, e: [[초, 이름, a, b, n], ...] }
// IP·쿠키·User-Agent는 저장하지 않음. 지역은 Cloudflare가 붙여 주는 시도 단위(request.cf.region)만.
const NAMES = new Set(['visit', 'work', 'how', 'cond', 'apt', 'detail', 'best', 'tier', 'route', 'calc', 'err', 'outside', 'nofind', 'tour', 'tourend', 'pmode', 'legend', 'hide', 'leave']);
const SITES = new Set(['cf', 'gh', 'preview', 'etc']);
const H = { 'Access-Control-Allow-Origin': '*' };
const SCHEMA = `CREATE TABLE IF NOT EXISTS ev (ts INTEGER NOT NULL, day TEXT NOT NULL, sid TEXT, site TEXT, name TEXT, a TEXT, b TEXT, n REAL, region TEXT);
CREATE INDEX IF NOT EXISTS ev_day ON ev(day, name);`;
export async function onRequestPost({ request, env }) {
  if (!env.DB) return new Response(null, { status: 204, headers: H }); // 저장소가 아직 없으면 조용히 버림
  let j;
  try { const t = await request.text(); if (t.length > 20000) return new Response(null, { status: 413, headers: H }); j = JSON.parse(t); } catch (e) { return new Response(null, { status: 400, headers: H }); }
  const sid = String(j.s || '').replace(/[^a-z0-9]/g, '').slice(0, 12), site = SITES.has(j.site) ? j.site : 'etc';
  const evs = Array.isArray(j.e) ? j.e.slice(0, 100) : [];
  const now = Date.now(), day = new Date(now + 9 * 3600e3).toISOString().slice(0, 10); // 한국 날짜
  const region = request.cf && request.cf.country === 'KR' ? String(request.cf.region || '').slice(0, 30) : (request.cf && request.cf.country) || '';
  const s = (v) => (v == null ? null : String(v).slice(0, 60));
  const stmt = env.DB.prepare('INSERT INTO ev (ts, day, sid, site, name, a, b, n, region) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const rows = evs.filter((x) => Array.isArray(x) && NAMES.has(x[1])).map((x) => stmt.bind(now, day, sid, site, x[1], s(x[2]), s(x[3]), typeof x[4] === 'number' && isFinite(x[4]) ? x[4] : null, x[1] === 'visit' ? region : null));
  if (rows.length) {
    try { await env.DB.batch(rows); }
    catch (e) { if (/no such table/.test(String(e))) { await env.DB.exec(SCHEMA); await env.DB.batch(rows); } else throw e; }
  }
  return new Response(null, { status: 204, headers: H });
}
export function onRequestOptions() { return new Response(null, { status: 204, headers: { ...H, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } }); }
