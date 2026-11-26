// 통계 요약 보기: GET /api/stats?days=30  (머리글 x-key = 환경값 STATS_KEY 일 때만)
export async function onRequestGet({ request, env }) {
  const J = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!env.STATS_KEY || request.headers.get('x-key') !== env.STATS_KEY) return J({ error: 'key' }, 401);
  if (!env.DB) return J({ error: 'nodb' }, 503);
  const u = new URL(request.url), days = Math.min(400, Math.max(1, +u.searchParams.get('days') || 30));
  const from = new Date(Date.now() + 9 * 3600e3 - (days - 1) * 86400e3).toISOString().slice(0, 10);
  const site = u.searchParams.get('site'); const sw = site ? ' AND site = ?2' : '';
  const q = async (sql) => { const st = env.DB.prepare(sql); return (await (site ? st.bind(from, site) : st.bind(from)).all()).results; };
  // 원자료는 13개월(395일)만 보관
  try { await env.DB.prepare('DELETE FROM ev WHERE ts < ?').bind(Date.now() - 395 * 86400e3).run(); } catch (e) { return J({ error: 'empty', days }); }
  const W = `day >= ?1${sw}`;
  const [daily, sites, refs, devs, regions, names, works, hows, conds, apts, aptRank, routes, tours, tourEnds, nofind, errs, calc, active, funnel] = await Promise.all([
    q(`SELECT day, COUNT(DISTINCT sid) AS visits, SUM(name='work') AS works, SUM(name='apt') AS apts FROM ev WHERE ${W} GROUP BY day ORDER BY day`),
    q(`SELECT site AS k, COUNT(DISTINCT sid) AS v FROM ev WHERE ${W} AND name='visit' GROUP BY site ORDER BY v DESC`),
    q(`SELECT a AS k, COUNT(*) AS v FROM ev WHERE ${W} AND name='visit' AND a <> 'self' GROUP BY a ORDER BY v DESC LIMIT 15`),
    q(`SELECT b AS k, COUNT(*) AS v FROM ev WHERE ${W} AND name='visit' GROUP BY b ORDER BY v DESC`),
    q(`SELECT region AS k, COUNT(*) AS v FROM ev WHERE ${W} AND name='visit' GROUP BY region ORDER BY v DESC LIMIT 12`),
    q(`SELECT name AS k, COUNT(*) AS v, COUNT(DISTINCT sid) AS u FROM ev WHERE ${W} GROUP BY name ORDER BY v DESC`),
    q(`SELECT b AS k, COUNT(DISTINCT sid) AS v FROM ev WHERE ${W} AND name='work' GROUP BY b ORDER BY v DESC LIMIT 30`),
    q(`SELECT a AS k, COUNT(*) AS v FROM ev WHERE ${W} AND name='how' GROUP BY a ORDER BY v DESC`),
    q(`SELECT a AS k, COUNT(DISTINCT sid) AS v FROM ev WHERE ${W} AND name='cond' GROUP BY a ORDER BY v DESC LIMIT 400`),
    q(`SELECT a AS k, COUNT(DISTINCT sid) AS v FROM ev WHERE ${W} AND name='apt' GROUP BY a ORDER BY v DESC LIMIT 20`),
    q(`SELECT CASE WHEN n<=3 THEN '1~3번째' WHEN n<=10 THEN '4~10번째' WHEN n<=30 THEN '11~30번째' ELSE '31번째 이후' END AS k, COUNT(*) AS v FROM ev WHERE ${W} AND name='apt' GROUP BY k`),
    q(`SELECT a AS k, COUNT(*) AS v FROM ev WHERE ${W} AND name='route' GROUP BY a`),
    q(`SELECT a AS k, COUNT(DISTINCT sid) AS v FROM ev WHERE ${W} AND name='tour' GROUP BY a ORDER BY CAST(a AS INTEGER)`),
    q(`SELECT b AS k, COUNT(*) AS v FROM ev WHERE ${W} AND name='tourend' GROUP BY b`),
    q(`SELECT a AS k, COUNT(*) AS v FROM ev WHERE ${W} AND name='nofind' GROUP BY a`),
    q(`SELECT a || ' · ' || IFNULL(b,'') AS k, COUNT(*) AS v FROM ev WHERE ${W} AND name IN ('err','outside') GROUP BY k ORDER BY v DESC LIMIT 10`),
    q(`SELECT COUNT(*) AS c, AVG(n) AS avg, MAX(n) AS mx FROM ev WHERE ${W} AND name='calc'`),
    q(`SELECT CASE WHEN m<30 THEN '30초 미만' WHEN m<120 THEN '30초~2분' WHEN m<600 THEN '2~10분' ELSE '10분 이상' END AS k, COUNT(*) AS v FROM (SELECT sid, MAX(n) AS m FROM ev WHERE ${W} AND name IN ('leave','hide') GROUP BY sid) GROUP BY k`),
    q(`SELECT COUNT(DISTINCT sid) AS visit, COUNT(DISTINCT CASE WHEN name='work' THEN sid END) AS work, COUNT(DISTINCT CASE WHEN name='apt' THEN sid END) AS apt, COUNT(DISTINCT CASE WHEN name='route' THEN sid END) AS route, COUNT(DISTINCT CASE WHEN name='best' AND a='on' THEN sid END) AS best, COUNT(DISTINCT CASE WHEN name='work' AND a='b' THEN sid END) AS couple FROM ev WHERE ${W}`),
  ]);
  return J({ days, from, site: site || 'all', daily, sites, refs, devs, regions, names, works, hows, conds, apts, aptRank, routes, tours, tourEnds, nofind, errs, calc: calc[0], active, funnel: funnel[0] });
}
