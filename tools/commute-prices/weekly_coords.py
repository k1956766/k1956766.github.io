"""새 단지 좌표 채우기(주 1회). 주소정보 좌표 API는 국내에서만 접속되므로 조회는 사용자 PC에서 한다.

  python weekly_coords.py prepare <법정동코드 전체자료.txt> <출력 csv>
      pending_coords.csv → PC 조회용 입력(aptSeq, admCd, rnMgtSn, udrtYn, buldMnnm, buldSlno)
      최근 28일 안에 조회했는데 결과가 없던 단지는 건너뜀(coord_tried.csv)
  python weekly_coords.py merge <PC 결과 csv>
      결과(UTM-K 출입구 좌표)를 WGS84로 바꿔 apt_coord.csv에 추가, coord_tried.csv 갱신
"""
import os, sys, datetime as dt
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
TRIED = os.path.join(HERE, 'coord_tried.csv')
today = dt.date.today()


def prepare(bjd_path, out):
    p = pd.read_csv(os.path.join(HERE, 'pending_coords.csv'), dtype=str)
    if os.path.exists(TRIED):
        t = pd.read_csv(TRIED, dtype=str)
        recent = t[pd.to_datetime(t.date) >= pd.Timestamp(today - dt.timedelta(days=28))]
        p = p[~p.aptSeq.isin(recent.aptSeq)]
    L = pd.read_csv(bjd_path, sep='\t', encoding='cp949', dtype=str)
    L.columns = ['code', 'name', 'st']
    L = L[L.st == '존재']
    L['sgg'] = L.code.str[:5]; L['last'] = L.name.str.split().str[-1]
    lut = L.drop_duplicates(['sgg', 'last']).set_index(['sgg', 'last']).code
    adm = []
    for r in p.itertuples():
        if isinstance(r.umdCd, str) and r.umdCd:
            adm.append(r.sggCd + r.umdCd)
        else:
            adm.append(lut.get((r.sggCd, r.umdNm), ''))
    p['admCd'] = adm
    p = p[(p.admCd != '') & p.roadCd.notna() & p.roadSgg.notna() & p.bon.notna()]
    n = lambda s: pd.to_numeric(s, errors='coerce').fillna(0).astype(int)
    outdf = pd.DataFrame({'aptSeq': p.aptSeq, 'admCd': p.admCd, 'rnMgtSn': p.roadSgg + p.roadCd,
                          'udrtYn': p.udrt.fillna('0'), 'buldMnnm': n(p.bon), 'buldSlno': n(p.bu)})
    outdf.to_csv(out, index=False)
    print('pending', len(pd.read_csv(os.path.join(HERE, 'pending_coords.csv'))), 'to query', len(outdf))


def merge(res_path):
    import pyproj
    res = pd.read_csv(res_path, dtype={'aptSeq': str})
    g = pd.read_csv(os.path.join(HERE, 'apt_coord.csv'), dtype={'aptSeq': str})
    ok = res[(res.status == 'ok') & ~res.aptSeq.isin(g.aptSeq)].drop_duplicates('aptSeq').copy()
    if len(ok):
        tf = pyproj.Transformer.from_crs(5179, 4326, always_xy=True)
        lon, lat = tf.transform(ok.entX.astype(float).values, ok.entY.astype(float).values)
        ok['lat'] = lat; ok['lon'] = lon
        add = pd.DataFrame({c: (ok[c].values if c in ok else '') for c in g.columns})
        g = pd.concat([g, add], ignore_index=True)
        g.to_csv(os.path.join(HERE, 'apt_coord.csv'), index=False)
    tried = pd.DataFrame({'aptSeq': res.aptSeq, 'status': res.status, 'date': today.isoformat()})
    if os.path.exists(TRIED):
        tried = pd.concat([pd.read_csv(TRIED, dtype=str), tried]).drop_duplicates('aptSeq', keep='last')
    tried.to_csv(TRIED, index=False)
    print('queried', len(res), 'added', len(ok), 'statuses', res.status.value_counts().to_dict())


if __name__ == '__main__':
    if sys.argv[1] == 'prepare':
        prepare(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == 'merge':
        merge(sys.argv[2])
