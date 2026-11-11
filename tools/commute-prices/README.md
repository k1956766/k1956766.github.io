# 통근권 집찾기 실거래가 매일 갱신

- 실행: GitHub Actions `commute-prices` (매일 05:10 KST, 수동 실행도 가능)
- 키: 저장소 Settings → Secrets and variables → Actions → `DATA_GO_KR_KEY` (공공데이터포털 일반 인증키)
- 자료: `data/{trade|rent}_YYYYMM.csv.gz` (국토교통부 아파트 매매·전월세 실거래가, 필요한 열만), 최근 13개월 보관
- 결과: `commute-map/data/apts.json`, `apts_meta.json`
- 가격 규칙: 최근 3개월 거래 2건 이상 → 3개월 중앙값, 아니면 6개월(2건 이상), 아니면 12개월. 해제 거래 제외.
- 새 단지 좌표: 주소정보 좌표 API는 해외에서 접속이 끊겨 Actions에서 못 씀 → `pending_coords.csv` 목록을 PC에서 조회해 `apt_coord.csv`에 추가.
- 출처: 국토교통부 실거래가 공개(공공데이터포털, 이용허락범위 제한 없음), 행정안전부 주소정보 좌표제공 API.
