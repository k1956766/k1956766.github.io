r"""K-apt 수집(재시작 가능): 1) 목록을 list.csv에 저장 2) 기본정보를 basis.csv에 한 줄씩 덧붙임.
게이트웨이 오류(HTTP_ERROR)가 이어지면 길게 쉬었다가 다시 시도한다. 여러 번 실행해도 이미 받은 것은 건너뜀.
사용: python3 kapt_fetch.py <시군구코드 txt> <작업 폴더>  → 작업 폴더에 list.csv, basis.csv, 마지막에 kapt.csv(기본정보만) 저장
GitHub Actions(kapt.yml)에서 월 1회 실행. 키는 환경변수 DATA_GO_KR_KEY."""
import os, sys, csv, time, requests, json
K = os.environ['DATA_GO_KR_KEY']; S = requests.Session()
codes = [c.strip() for c in open(sys.argv[1]) if c.strip()]
D = sys.argv[2]; LF = os.path.join(D, 'list.csv'); BF = os.path.join(D, 'basis.csv')
fails = [0]; STOP = [False]  # STOP: 일일 호출 한도(429) → 오늘은 그만, 다음 실행이 이어서
def get(url, params):
    for i in range(8):
        if STOP[0]: return None
        try:
            r = S.get(url, params={'serviceKey': K, '_type': 'json', **params}, timeout=30)
            if r.status_code == 429 or 'LIMITED_NUMBER_OF_SERVICE_REQUESTS' in r.text:
                STOP[0] = True; print('일일 호출 한도 도달 — 다음 실행에서 이어서', flush=True); return None
            if r.status_code == 200 and '"response"' in r.text:
                fails[0] = 0; return r.json()
        except Exception: pass
        fails[0] += 1
        time.sleep(3 if fails[0] < 5 else 30)
    return None
# 1) 목록
lst = {}
if os.path.exists(LF):
    for row in csv.DictReader(open(LF, encoding='utf-8')): lst[row['kaptCode']] = row
done_sgg = {r['bjdCode'][:5] for r in lst.values() if r.get('bjdCode')}
with open(LF, 'a', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=['kaptCode', 'kaptName', 'bjdCode']);
    if not lst: w.writeheader()
    for c in codes:
        if c in done_sgg: continue
        j = get('https://apis.data.go.kr/1613000/AptListService4/getSigunguAptList4', {'sigunguCode': c, 'numOfRows': 1000, 'pageNo': 1})
        if not j: print('목록 실패', c, flush=True); continue
        items = j['response']['body'].get('items') or []
        if isinstance(items, dict): items = [items]
        for it in items:
            if it['kaptCode'] not in lst:
                lst[it['kaptCode']] = it; w.writerow({k: it.get(k) for k in ['kaptCode', 'kaptName', 'bjdCode']})
        f.flush(); print('목록', c, len(items), flush=True)
print('목록 합계', len(lst), flush=True)
# 2) 기본정보
F = ['kaptCode', 'kaptName', 'bjdCode', 'kaptAddr', 'doroJuso', 'codeSaleNm', 'codeAptNm', 'kaptdaCnt', 'kaptDongCnt', 'kaptUsedate', 'ktownFlrNo']
have = set()
if os.path.exists(BF):
    have = {r['kaptCode'] for r in csv.DictReader(open(BF, encoding='utf-8')) if r.get('kaptdaCnt')}
todo = [c for c in lst if c not in have]
print('기본정보 남은 것', len(todo), flush=True)
import threading
from concurrent.futures import ThreadPoolExecutor
new = not os.path.exists(BF)
lock = threading.Lock(); cnt = [0]
f = open(BF, 'a', newline='', encoding='utf-8'); w = csv.DictWriter(f, fieldnames=F)
if new: w.writeheader()
def one(c):
    if STOP[0]: return
    j = get('https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5', {'kaptCode': c})
    it = (j or {}).get('response', {}).get('body', {}).get('item') or {}
    with lock:
        if it: w.writerow({k: it.get(k) for k in F}); f.flush()
        cnt[0] += 1
        if cnt[0] % 250 == 0: print('기본정보', cnt[0], '/', len(todo), flush=True)
with ThreadPoolExecutor(int(os.environ.get('NT', '3'))) as ex: list(ex.map(one, todo))
f.close()
import pandas as pd
b = pd.read_csv(BF, dtype=str).drop_duplicates('kaptCode', keep='last')
b.to_csv(os.path.join(D, 'kapt.csv'), index=False)
print('끝' if not STOP[0] else '중간 저장', 'kapt.csv', len(b), '/', len(lst), flush=True)
