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
KST = dt.timezone(dt.timedelta(hours=9))
today = dt.datetime.now(KST).date()


def months_back(n):
    out, y, m = [], today.year, today.month
    for _ in range(n):
        out.append(f'{y}{m:02d}')
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return out


TC = ['aptSeq', 'aptNm', 'umdNm', 'umdCd', 'sggCd', 'buildYear', 'dealYear', 'dealMonth', 'dealAmount', 'excluUseAr', 'cdealType',
      'roadNmSggCd', 'roadNmCd', 'roadNmbCd', 'roadNmBonbun', 'roadNmBubun']
RC = ['aptSeq', 'aptNm', 'umdNm', 'sggCd', 'buildYear', 'dealYear', 'dealMonth', 'deposit', 'monthlyRent', 'excluUseAr',
      'roadnmsggcd', 'roadnmcd', 'roadnmbcd', 'roadnmbonbun', 'roadnmbubun']
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
    j = r[r.mr == 0]; w = r[r.mr > 0]

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
                  iv(x.mrent), iv(x.mdep), cn(x.mn), cn(x.sw), cn(x.jw), cn(x.mw)] for x in grp[a.aptSeq].itertuples() if pd.notna(x.area)]
        if not types:
            continue
        nm = info.loc[a.aptSeq]
        out.append([a.aptSeq, nm.aptNm, nm.umdNm, int(nm.buildYear) if str(nm.buildYear).isdigit() else None,
                    round(a.lat, 5), round(a.lon, 5), int(a.cell), types])
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
