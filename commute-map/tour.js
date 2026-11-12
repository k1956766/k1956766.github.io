/* '처음이시라면?' 안내: 주요 버튼을 하나씩 비추며 설명. app.js와 따로 동작(화면 요소만 읽음) */
(() => {
  const $ = (s) => document.querySelector(s);
  const mobile = () => window.matchMedia('(max-width:720px)').matches;
  // sel: 비출 요소, need: 그 요소가 보이게 미리 할 일
  const STEPS = [
    { sel: '.stop.a', t: '1. 직장 A 정하기', d: '역 이름·주소·회사 이름을 입력하거나 "지도에서 고르기"를 눌러 지도에서 직접 고르세요. 직장을 정하면 대중교통으로 갈 수 있는 동네가 지도에 칠해져요.' },
    { sel: '.stop.b', t: '2. 맞벌이라면 직장 B', d: '두 사람 직장을 모두 넣으면 둘 다 통근할 수 있는 곳만 칠해져요. 비워 두면 A만 기준으로 봐요.' },
    { sel: '.limit', t: '3. 최대 통근시간', d: '출근 시간대에 보통 걸리는 시간이 이보다 짧은 곳만 보여 줘요. 막대를 움직여 조절하세요.' },
    { sel: '#kind', t: '4. 매매·전세·월세와 예산', d: '거래 방식을 고르고 아래 예산 막대로 상한을 정하면, 그 안에 드는 아파트 단지만 남아요.' },
    { sel: '.mode', t: '5. 이동수단·환승', d: '버스·지하철·기차를 끄고 켜거나 환승 횟수를 줄이면 그 조건으로 통근시간을 다시 계산해요.' },
    { sel: '#map', t: '6. 지도 보기', d: '초록이 진할수록 가까운 곳이에요. 동그라미는 아파트 단지이고 색은 가격(파랑 싼 곳 → 빨강 비싼 곳)이에요. 지도를 누르면 그 자리에서 직장까지 시간과 경로가 나와요.', map: true },
    { sel: '#apt-count', t: '7. 단지 목록', d: '조건에 맞는 단지가 통근시간 순으로 나와요. 단지를 누르면 지도에서 위치를 보여 주고, "세부정보"에서 면적별 가격을 볼 수 있어요.' },
    { sel: '#lg-price', t: '8. 가격 범례', d: '색 칸을 두 번 누르면 그 사이 가격대만 남아요(예: 3억 칸 → 6억 칸). "전체 해제"로 처음부터 고를 수 있어요.', legend: true },
    { sel: '#bx-tog', t: '9. 최적의 집 찾기', d: '통근시간·주거비·연식 중 무엇을 중요하게 볼지 삼각형에서 정하면, 잘 맞는 집을 1·2·3순위 숫자로 지도에 표시해요. 순위를 누르면 그 순위만 골라 볼 수 있어요.', legend: true },
    { sel: '#o-ctl', t: '10. 지하철 노선', d: '"노선"을 누르면 지하철 노선이 지도에 그려져요. 위치를 알아보는 데만 쓰여요.' },
  ];
  let i = 0, box, card;
  function build() {
    box = document.createElement('div'); box.className = 'tour-hole';
    card = document.createElement('div'); card.className = 'tour-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
    document.body.append(box, card);
    card.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'next') go(i + 1); else if (b.dataset.a === 'prev') go(i - 1); else end();
    });
    document.addEventListener('keydown', key);
    window.addEventListener('resize', place);
  }
  function key(e) { if (!card) return; if (e.key === 'Escape') end(); else if (e.key === 'ArrowRight') go(i + 1); else if (e.key === 'ArrowLeft') go(i - 1); }
  function end() {
    box?.remove(); card?.remove(); box = card = null;
    document.removeEventListener('keydown', key); window.removeEventListener('resize', place);
    try { localStorage.setItem('commute-tour', '1'); } catch (e) { /* 저장 안 됨 */ }
  }
  function visible(el) { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function go(k) {
    if (k >= STEPS.length) { end(); return; }
    i = Math.max(0, k); const s = STEPS[i];
    // 범례 단계: 접혀 있으면 펼침(휴대폰) / 아래 창 단계: 휴대폰에서 창을 올려 보이게
    if (s.legend) { const lg = $('#legend'); if (lg?.classList.contains('min')) $('#lg-tog')?.click(); }
    const el = $(s.sel);
    if (el && !s.map) el.scrollIntoView({ block: 'center', behavior: 'instant' });
    card.innerHTML = `<p class="tour-n">${i + 1} / ${STEPS.length}</p><h3>${s.t.replace(/^\d+\. /, '')}</h3><p>${s.d}</p>
      ${el && visible(el) ? '' : '<p class="tour-x">이 항목은 직장을 정하면 나타나요.</p>'}
      <div class="tour-b"><button type="button" data-a="end" class="tour-skip">닫기</button><span></span>
      ${i ? '<button type="button" data-a="prev">이전</button>' : ''}<button type="button" data-a="next" class="tour-go">${i === STEPS.length - 1 ? '끝' : '다음'}</button></div>`;
    requestAnimationFrame(place);
    card.querySelector('.tour-go').focus();
  }
  function place() {
    if (!card) return;
    const s = STEPS[i], el = $(s.sel), W = window.innerWidth, H = window.innerHeight, pad = 6;
    let r = el && visible(el) ? el.getBoundingClientRect() : null;
    if (r && s.map) { const m = r; r = { left: m.left + m.width * 0.3, top: m.top + 60, width: m.width * 0.4, height: Math.min(m.height * 0.4, 320) }; r.right = r.left + r.width; r.bottom = r.top + r.height; }
    if (r) Object.assign(box.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    else Object.assign(box.style, { display: 'block', left: W / 2 + 'px', top: H / 2 + 'px', width: '0px', height: '0px' });
    // 카드는 비춘 곳 옆(오른쪽 → 왼쪽 → 아래 → 위 순으로 자리 있는 곳)
    const cw = Math.min(320, W - 24); card.style.width = cw + 'px';
    const ch = card.offsetHeight; let x, y;
    if (mobile() || !r) { x = (W - cw) / 2; y = r && r.top > H / 2 ? Math.max(12, r.top - ch - 16) : Math.min(H - ch - 12, (r ? r.bottom : H / 2) + 16); }
    else if (r.right + 16 + cw < W) { x = r.right + 16; y = Math.min(Math.max(12, r.top), H - ch - 12); }
    else if (r.left - 16 - cw > 0) { x = r.left - 16 - cw; y = Math.min(Math.max(12, r.top), H - ch - 12); }
    else { x = Math.min(Math.max(12, r.left), W - cw - 12); y = r.bottom + 16 + ch < H ? r.bottom + 16 : Math.max(12, r.top - ch - 16); }
    Object.assign(card.style, { left: x + 'px', top: y + 'px' });
  }
  function start() { if (!card) build(); go(0); }
  // 오른쪽 위 버튼
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'tour-btn'; btn.textContent = '처음이시라면?';
  btn.addEventListener('click', start);
  document.body.append(btn);
  window.startTour = start;
})();
