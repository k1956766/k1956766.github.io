/* 익명 이용 통계: 개인을 알아볼 수 없는 기록만 모아 doorto.pages.dev/api/e 로 보냄.
   - 쿠키·IP·기기 번호를 쓰지 않음. 방문 번호는 탭을 닫으면 사라지는 임의 값(sessionStorage).
   - 직장 위치는 역 이름 또는 약 3km 칸으로만, 검색어는 보내지 않음.
   - 브라우저의 '추적 안 함(Do Not Track)'이 켜져 있으면 아무것도 보내지 않음. */
(function () {
  const off = navigator.doNotTrack === '1' || window.doNotTrack === '1' || /^(localhost|127\.|\[::1\])/.test(location.hostname) || location.protocol === 'file:';
  const host = location.hostname;
  const site = host === 'doorto.pages.dev' ? 'cf' : host.endsWith('.doorto.pages.dev') ? 'preview' : host.endsWith('github.io') ? 'gh' : 'etc';
  const URL_ = host.endsWith('doorto.pages.dev') ? '/api/e' : 'https://doorto.pages.dev/api/e';
  let sid = '';
  try { sid = sessionStorage.getItem('dt-sid') || ''; if (!sid) { sid = Math.random().toString(36).slice(2, 12); sessionStorage.setItem('dt-sid', sid); } } catch (e) { sid = Math.random().toString(36).slice(2, 12); }
  const q = []; const t0 = Date.now(); let active = 0, lastAct = Date.now(), sentLeave = false;
  const cut = (v) => (v == null ? null : String(v).slice(0, 60));
  function ev(name, a, b, n) { if (off) return; q.push([Math.round((Date.now() - t0) / 1000), name, cut(a), cut(b), n == null || !isFinite(n) ? null : +n]); if (q.length >= 40) flush(); }
  function flush(beacon) {
    if (off || !q.length) return;
    const body = JSON.stringify({ s: sid, site, e: q.splice(0, q.length) });
    try {
      if (beacon && navigator.sendBeacon) { navigator.sendBeacon(URL_, new Blob([body], { type: 'text/plain' })); return; }
      fetch(URL_, { method: 'POST', body, keepalive: true, mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
    } catch (e) { /* 통계는 실패해도 그만 */ }
  }
  // 실제로 화면을 보고 있던 시간(초): 30초 넘게 아무 조작이 없으면 멈춘 것으로 봄
  setInterval(() => { if (document.visibilityState === 'visible' && Date.now() - lastAct < 30000) active += 5; }, 5000);
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((k) => addEventListener(k, () => { lastAct = Date.now(); }, { passive: true }));
  setInterval(() => flush(false), 30000);
  function leave() { if (!sentLeave) { sentLeave = true; ev('leave', null, null, active); } flush(true); }
  addEventListener('pagehide', leave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { ev('hide', null, null, active); flush(true); } else sentLeave = false; });
  addEventListener('error', (e) => ev('err', 'js', e.message || 'error'));

  // 첫 기록: 들어온 경로(도메인만), 기기, 공유 링크로 왔는지
  let ref = 'direct';
  try { if (document.referrer) { const h = new URL(document.referrer).hostname.replace(/^www\.|^m\./, ''); ref = h === host ? 'self' : h; } } catch (e) { /* 그대로 */ }
  const w = innerWidth, dev = /Mobi|Android|iPhone/i.test(navigator.userAgent) || w < 700 ? 'mobile' : w < 1100 ? 'tablet' : 'desktop';
  const hp = new URLSearchParams(location.hash.slice(1));
  ev('visit', ref, dev, hp.get('a') ? 1 : 0);

  // 조건 묶음은 조작이 멈춘 뒤 4초에 한 번만(같은 조건이면 안 보냄)
  let condT = 0, lastCond = '';
  function cond(s) { clearTimeout(condT); condT = setTimeout(() => { if (s !== lastCond) { lastCond = s; ev('cond', s); } }, 4000); }
  // 직장 위치: 역 이름이거나, 약 3km(0.03도) 칸으로 뭉갠 좌표
  const grid = (lat, lon) => `${(Math.floor(lat / 0.03) * 0.03 + 0.015).toFixed(3)},${(Math.floor(lon / 0.03) * 0.03 + 0.015).toFixed(3)}`;
  window.dtStats = { ev, cond, grid, flush };
})();
