"""통근권 집찾기 — 아파트 실거래가 매일 갱신 (GitHub Actions에서 실행)

1) 최근 N개월(기본 3, 이번 달 포함) 매매·전월세를 83개 시군구에서 다시 받아 월별 파일을 덮어씀
   (늦게 들어온 신고·해제 표시 반영). 실패한 지역은 이전 자료를 그대로 둠.
2) 오늘 기준 최근 12개월로 단지·면적형별 가격을 계산
   - 최근 3개월 거래 2건 이상 → 3개월 중앙값, 아니면 6개월(2건 이상), 아니면 12개월 중앙값
   - 해제된 매매(cdealType=O) 제외
3) commute-map/data/apts.json, apts_meta.json 저장. 좌표 없는 새 단지는 pending_coords.csv로 남김
   (주소정보 좌표 API는 국내에서만 접속되어 PC에서 따로 채움).

키: 환경변수 DATA_GO_KR_KEY. 키와 요청 주소는 어디에도 출력하지 않는다.
"""
import os, sys, json, time, glob, datetime as dt, urllib.parse, xml.etree.ElementTree as ET
import requests, numpy as np, pandas as pd
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DATA = os.path.join(HERE, 'data')
SITE = os.path.join(ROOT, 'commute-map', 'data')
N_REFETCH = int(os.environ.get('N_REFETCH', '3'))
WIN = 12
EQ_RATE = 0.0417   # 보증금 월 환산 이자율(대출 4.88%·예금 3.45% 반반)
KST = dt.timezone(dt.timedelta(hours=9))
today = dt.datetime.now(KST).date()


def months_back(n):
    out, y, m = [], today.year, today.month
    for _ in range(n):
        out.append(f'{y}{m:02d}')
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return out


TC = ['aptSeq', 'aptNm', 'umdNm', 'umdCd', 'sggCd', 'buildYear', 'dealYear', 'dealMonth', 'dealAmount', 'excluUseAr', 'cdealType',
      'roadNmSggCd', 'roadNmCd', 'roadNmbCd', 'roadNmBonbun', 'roadNmBubun',
      'dealingGbn', 'floor', 'landLeaseholdGbn', 'buyerGbn', 'slerGbn', 'bonbun', 'bubun']   # 이상 거래 판정·단지정보 연결용
RC = ['aptSeq', 'aptNm', 'umdNm', 'sggCd', 'buildYear', 'dealYear', 'dealMonth', 'deposit', 'monthlyRent', 'excluUseAr',
      'roadnmsggcd', 'roadnmcd', 'roadnmbcd', 'roadnmbonbun', 'roadnmbubun',
      'contractType', 'useRRRight', 'floor', 'jibun']   # 갱신 계약 제외·단지정보 연결용
EP = {'trade': 'RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev', 'rent': 'RTMSDataSvcAptRent/getRTMSDataSvcAptRent'}


def fetch(key, kind, gu, ym):
    rows, page = [], 1
    while True:
        root = None
        for attempt in range(3):
            try:
                r = requests.get('https://apis.data.go.kr/1613000/' + EP[kind],
                                 params={'serviceKey': key, 'LAWD_CD': gu, 'DEAL_YMD': ym, 'numOfRows': '1000', 'pageNo': str(page)}, timeout=30)
                root = ET.fromstring(r.content)
                break
            except Exception:
                time.sleep(3 * (attempt + 1))
        if root is None:
            raise RuntimeError('network')
        code = root.findtext('.//resultCode')
        if code not in ('000', '00'):
            raise RuntimeError(f'resultCode {code}')
        rows += [{c.tag: (c.text or '').strip() for c in it} for it in root.findall('.//item')]
        if page * 1000 >= int(root.findtext('.//totalCount') or 0):
            return rows
        page += 1


def refetch():
    key = os.environ.get('DATA_GO_KR_KEY', '')
    if not key:
        print('DATA_GO_KR_KEY 없음 — 수집 건너뜀')
        return
    key = urllib.parse.unquote(key)
    codes = [c.strip() for c in open(os.path.join(HERE, 'codes.txt')) if c.strip()]
    # 접속 점검: 처음 3곳이 모두 실패하면 이번 실행은 수집을 건너뛰고 기존 자료로만 계산
    t0 = time.time(); ok = 0
    for gu in codes[:3]:
        try:
            fetch(key, 'trade', gu, months_back(1)[0]); ok += 1
        except RuntimeError as e:
            print('점검 실패', gu, e, flush=True)
    print('접속 점검', ok, '/ 3,', round(time.time() - t0), '초', flush=True)
    if ok == 0:
        return
    for kind in ('trade', 'rent'):
        cols = TC if kind == 'trade' else RC
        for ym in months_back(N_REFETCH):
            f = os.path.join(DATA, f'{kind}_{ym}.csv.gz')
            old = pd.read_csv(f, dtype=str) if os.path.exists(f) else pd.DataFrame(columns=cols)
            parts, fail = [], []
            for gu in codes:
                try:
                    rows = fetch(key, kind, gu, ym)
                    if rows:
                        parts.append(pd.DataFrame(rows))
                except RuntimeError as e:
                    fail.append(f'{gu}({e})')
                    if 'sggCd' in old:
                        parts.append(old[old.sggCd == gu])     # 실패한 지역은 이전 자료 유지
            new = pd.concat(parts, ignore_index=True) if parts else old
            new = new.reindex(columns=cols)
            new.to_csv(f, index=False, compression='gzip')
            print(kind, ym, 'rows', len(new), 'fail', len(fail), ' '.join(fail[:5]), flush=True)
    # 13개월보다 오래된 월 파일 정리
    keep = set(months_back(WIN + 1))
    for f in glob.glob(os.path.join(DATA, '*.csv.gz')):
        if os.path.basename(f).split('_')[1][:6] not in keep:
            os.remove(f)


SALE_CODE = {'분양': 1, '혼합': 2, '임대': 3}


KAPT_DONE = False


def kapt_join(t, r):
    """K-apt 단지정보(kapt.csv)를 법정동코드+지번으로 실거래 단지와 연결 → {aptSeq: (세대수, 분양형태 1분양·2혼합·3임대)}.
    K-apt에 없는 단지(대개 의무관리 대상이 아닌 소규모)는 (0, 0)."""
    import re, difflib
    f = os.path.join(HERE, 'kapt.csv')
    if not os.path.exists(f):
        return {}
    k = pd.read_csv(f, dtype=str)
    def jb(addr):
        m = re.search(r'\s(산?\d+)(?:-(\d*))?(?:\s|$)', str(addr) + ' ')
        return (m.group(1).lstrip('0'), (m.group(2) or '0').lstrip('0') or '0') if m else (None, None)
    k[['bon', 'bu']] = k.kaptAddr.apply(lambda a: pd.Series(jb(a)))
    idx = {}
    for x in k.itertuples():
        if x.bon:
            idx.setdefault((x.bjdCode, x.bon, x.bu), []).append(x)
    # 실거래 단지의 법정동코드·지번
    um = t.dropna(subset=['umdCd']).drop_duplicates(['sggCd', 'umdNm']).set_index(['sggCd', 'umdNm']).umdCd.to_dict()
    loc = {}
    for x in t.drop_duplicates('aptSeq').itertuples():
        if isinstance(x.bonbun, str):
            loc[x.aptSeq] = (str(x.sggCd) + str(x.umdCd).zfill(5), x.bonbun.lstrip('0') or '0', str(x.bubun).lstrip('0') or '0', x.aptNm)
    for x in r.drop_duplicates('aptSeq').itertuples():
        if x.aptSeq in loc or not isinstance(x.jibun, str):
            continue
        ucd = um.get((x.sggCd, x.umdNm))
        bon, _, bu = x.jibun.partition('-')
        if ucd:
            loc[x.aptSeq] = (str(x.sggCd) + str(ucd).zfill(5), bon.lstrip('0') or '0', bu.lstrip('0') or '0', x.aptNm)
    out = {}
    for seq, (bjd, bon, bu, nm) in loc.items():
        cs = idx.get((bjd, bon, bu))
        if not cs:
            continue
        c = max(cs, key=lambda x: difflib.SequenceMatcher(None, str(x.kaptName), str(nm)).ratio())
        hh = pd.to_numeric(c.kaptdaCnt, errors='coerce')
        out[seq] = (0 if pd.isna(hh) else int(hh), SALE_CODE.get(str(c.codeSaleNm), 0))
    # 수집이 덜 끝났으면(목록 대비 98% 미만) K-apt에 없는 단지를 소규모로 단정하지 않음
    lf = os.path.join(HERE, 'kapt_work', 'list.csv')
    global KAPT_DONE
    KAPT_DONE = not os.path.exists(lf) or len(k) >= 0.98 * len(pd.read_csv(lf, dtype=str))
    print('K-apt 연결', len(out), '/', len(loc), '수집 완료' if KAPT_DONE else '수집 중(나머지는 판단 보류)', flush=True)
    return out


num = lambda s: pd.to_numeric(s.astype(str).str.replace(',', '').str.strip(), errors='coerce')


def build():
    MS = months_back(WIN)
    rd = lambda kind: pd.concat([pd.read_csv(os.path.join(DATA, f'{kind}_{m}.csv.gz'), dtype=str)
                                 for m in MS if os.path.exists(os.path.join(DATA, f'{kind}_{m}.csv.gz'))], ignore_index=True)
    t = rd('trade')
    t = t[t.cdealType.fillna('') != 'O'].copy()              # 해제된 거래 제외
    t['price'] = num(t.dealAmount); t['area'] = num(t.excluUseAr).round(); t['ym'] = t.dealYear + t.dealMonth.str.zfill(2)
    r = rd('rent')
    r['dep'] = num(r.deposit); r['mr'] = num(r.monthlyRent); r['area'] = num(r.excluUseAr).round(); r['ym'] = r.dealYear + r.dealMonth.str.zfill(2)
    # ---- 이상 거래 걸러내기: 근거가 있는 것만 뺀다 ----
    ex = {}
    def drop(df, mask, why):
        mask = mask.fillna(False); ex[why] = int(mask.sum()); return df[~mask]
    if 'dealingGbn' in t: t = drop(t, t.dealingGbn.fillna('').str.contains('직거래'), '매매 직거래')
    if 'landLeaseholdGbn' in t: t = drop(t, t.landLeaseholdGbn.fillna('').eq('Y'), '토지임대부')
    if 'contractType' in r: r = drop(r, r.contractType.fillna('').eq('갱신') | r.useRRRight.fillna('').eq('사용'), '전월세 갱신계약')
    r['eq'] = r.mr + r.dep * EQ_RATE / 12            # 월세 이상치 판정용 월 환산액
    def drop_outlier(df, val, why):
        # 같은 단지·같은 면적형 거래 4건 이상일 때, 로그 가격이 중앙값에서 3×MAD(정규 환산) 넘게 벗어나면 뺀다
        lv = np.log(df[val].clip(lower=1)); g = lv.groupby([df.aptSeq, df.area])
        med = g.transform('median'); mad = (lv - med).abs().groupby([df.aptSeq, df.area]).transform('median') * 1.4826
        n = g.transform('size')
        bad = (n >= 4) & (mad > 0) & ((lv - med).abs() > 3 * mad)
        return drop(df, bad, why)
    t = drop_outlier(t, 'price', '매매 단지 내 이상치')
    j = drop_outlier(r[r.mr == 0], 'dep', '전세 단지 내 이상치')
    w = drop_outlier(r[r.mr > 0], 'eq', '월세 단지 내 이상치')
    print('제외한 거래', ex, flush=True)

    def tier(df, val, extra=None):
        out = None
        for k in (3, 6, 12):
            x = df[df.ym >= MS[k - 1]]
            agg = {'p': (val, 'median'), 'n': (val, 'size'), 'y': ('ym', 'max')}
            if extra:
                agg['e'] = (extra, 'median')
            g = x.groupby(['aptSeq', 'area']).agg(**agg); g['w'] = k
            if k < 12:
                g = g[g.n >= 2]
            out = g if out is None else pd.concat([out, g[~g.index.isin(out.index)]])
        return out

    sale = tier(t, 'price').rename(columns={'p': 'sale', 'n': 'sn', 'y': 'sy', 'w': 'sw'})
    jeon = tier(j, 'dep').rename(columns={'p': 'jeonse', 'n': 'jn', 'y': 'jy', 'w': 'jw'})
    mon = tier(w, 'mr', 'dep').rename(columns={'p': 'mrent', 'e': 'mdep', 'n': 'mn', 'y': 'my', 'w': 'mw'})
    ty = sale.join(jeon, how='outer').join(mon, how='outer').reset_index()
    info0 = pd.concat([t[['aptSeq', 'umdNm', 'buildYear']], r[['aptSeq', 'umdNm', 'buildYear']]]).drop_duplicates('aptSeq').set_index('aptSeq')
    ty = ty.join(info0, on='aptSeq')
    ty['sgg'] = ty.aptSeq.str[:5]
    yr = pd.to_numeric(ty.buildYear, errors='coerce')
    ty['ab'] = pd.cut(today.year - yr, [-99, 5, 10, 20, 999], labels=False)
    ty['mb'] = pd.cut(ty.area, [0, 40, 60, 85, 115, 9999], labels=False, right=False)
    # 이웃(같은 동·면적대·연식대, 5단지 미만이면 같은 시군구) 대표 가격보다 크게 낮은 단지는 '가격 확인 필요'
    ty['meq'] = ty.mrent + ty.mdep * EQ_RATE / 12
    flag = np.zeros(len(ty), dtype=int)
    for bit, col, thr in ((1, 'sale', 0.55), (2, 'jeonse', 0.5), (4, 'meq', 0.5)):
        v = ty[col]
        def nb(keys):
            g = v.groupby([ty[k] for k in keys]); return g.transform('median'), g.transform('count')
        m1, c1 = nb(['sgg', 'umdNm', 'mb', 'ab']); m2, c2 = nb(['sgg', 'mb', 'ab'])
        ref = np.where(c1 >= 5, m1, np.where(c2 >= 5, m2, np.nan))
        flag |= np.where(v.notna() & (v < thr * ref), bit, 0)
    ty['flag'] = flag
    print('가격 확인 필요(매매/전세/월세)', int((flag & 1).astype(bool).sum()), int((flag & 2).astype(bool).sum()), int((flag & 4).astype(bool).sum()), flush=True)
    kapt = kapt_join(t, r)
    info = pd.concat([t[['aptSeq', 'aptNm', 'umdNm', 'buildYear']], r[['aptSeq', 'aptNm', 'umdNm', 'buildYear']]]) \
        .groupby('aptSeq').agg(lambda s: s.mode().iat[0] if len(s.dropna().mode()) else '')
    geo = pd.read_csv(os.path.join(HERE, 'apt_coord.csv'), dtype={'aptSeq': str})[['aptSeq', 'lat', 'lon']].dropna().drop_duplicates('aptSeq')
    G = json.load(open(os.path.join(SITE, 'grid.json')))
    tree = cKDTree(np.column_stack([np.array(G['lon']) * 88.4e3, np.array(G['lat']) * 111e3]))
    dd, ii = tree.query(np.column_stack([geo.lon * 88.4e3, geo.lat * 111e3]))
    geo['cell'] = np.where(dd <= 300, ii, -1)
    ty = ty.sort_values(['aptSeq', 'area']); grp = dict(tuple(ty.groupby('aptSeq')))
    iv = lambda v: None if pd.isna(v) else int(round(v)); cn = lambda v: 0 if pd.isna(v) else int(v)
    sv = lambda v: str(v) if pd.notna(v) else ''
    out = []
    for a in geo.itertuples():
        if a.aptSeq not in info.index or a.aptSeq not in grp:
            continue
        types = [[int(x.area), iv(x.sale), cn(x.sn), iv(x.jeonse), cn(x.jn), max(sv(x.sy), sv(x.jy), sv(x.my)),
                  iv(x.mrent), iv(x.mdep), cn(x.mn), cn(x.sw), cn(x.jw), cn(x.mw), int(x.flag)] for x in grp[a.aptSeq].itertuples() if pd.notna(x.area)]
        if not types:
            continue
        nm = info.loc[a.aptSeq]
        out.append([a.aptSeq, nm.aptNm, nm.umdNm, int(nm.buildYear) if str(nm.buildYear).isdigit() else None,
                    round(a.lat, 5), round(a.lon, 5), int(a.cell), types, *(kapt.get(a.aptSeq, (0, 0) if KAPT_DONE else (-1, 0)) if kapt else (-1, 0))])  # 세대수(-1=단지정보 수집 전, 0=K-apt 미등록), 분양형태
    json.dump(out, open(os.path.join(SITE, 'apts.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'from': MS[-1], 'to': MS[0], 'updated': today.isoformat(), 'complexes': len(out)},
              open(os.path.join(SITE, 'apts_meta.json'), 'w'), ensure_ascii=False)
    # 좌표 없는 단지(새 단지) — PC에서 주소정보 좌표 API로 채울 목록
    have = set(geo.aptSeq)
    tt = t[~t.aptSeq.isin(have)].drop_duplicates('aptSeq')
    pend = pd.DataFrame({'aptSeq': tt.aptSeq, 'name': tt.aptNm, 'sggCd': tt.sggCd, 'umdCd': tt.umdCd, 'umdNm': tt.umdNm,
                         'roadSgg': tt.roadNmSggCd, 'roadCd': tt.roadNmCd, 'udrt': tt.roadNmbCd, 'bon': tt.roadNmBonbun, 'bu': tt.roadNmBubun})
    rr = r[~r.aptSeq.isin(have) & ~r.aptSeq.isin(tt.aptSeq)].drop_duplicates('aptSeq')
    pend = pd.concat([pend, pd.DataFrame({'aptSeq': rr.aptSeq, 'name': rr.aptNm, 'sggCd': rr.sggCd, 'umdCd': '', 'umdNm': rr.umdNm,
                                          'roadSgg': rr.roadnmsggcd, 'roadCd': rr.roadnmcd, 'udrt': rr.roadnmbcd,
                                          'bon': rr.roadnmbonbun, 'bu': rr.roadnmbubun})])
    pend.sort_values('aptSeq').to_csv(os.path.join(HERE, 'pending_coords.csv'), index=False)
    print('window', MS[-1], '~', MS[0], 'complexes', len(out), 'pending coords', len(pend))


if __name__ == '__main__':
    if '--build-only' not in sys.argv:
        refetch()
    build()
