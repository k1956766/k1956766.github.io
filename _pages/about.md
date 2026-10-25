---
layout: about
title: 소개
permalink: /
alt_url: /en/
description: 경기연구원 기후에너지환경부 연구원. 데이터로 도시를 읽고, 더 나은 내일을 그려요.
subtitle: 경기연구원 기후에너지환경부 연구원
selected_papers: false
social: false
announcements:
  enabled: false
latest_posts:
  enabled: false
---

<div class="intro has-photo">
  <figure class="intro-photo"><img src="/assets/img/profile.png" width="354" height="472" alt="임강혁 프로필 사진"></figure>
  <p class="intro-headline">데이터로 도시를 읽고,<br>더 나은 내일을 그려요</p>
  <p class="intro-lead">안녕하세요, 임강혁이에요. 지도와 데이터로 도시의 문제를 풀어내는 일을 하고 있어요.</p>
</div>

<ol class="story story-steps">
  <li class="story-item">
    <span class="story-num">01</span>
    <div class="story-body">
      <p class="story-meta">2015 – 2020 · 수원대학교 전자공학과</p>
      <h3 class="story-title">회로에서 도시로</h3>
      <p class="story-text">처음엔 전자공학을 공부했어요. 그러다 기술 하나보다 더 넓은 관점에서, 많은 사람의 삶을 실제로 이롭게 바꾸는 일을 하고 싶어졌어요. 그 답을 사람이 살고, 일하고, 머무는 공간인 도시에서 찾았어요. 그래서 고민 끝에 과감히 전공을 바꾸기로 했어요.</p>
    </div>
  </li>
  <li class="story-item">
    <span class="story-num">02</span>
    <div class="story-body">
      <p class="story-meta">2020 – 2023 · 중앙대학교</p>
      <h3 class="story-title">도시라는 학문을 만나다</h3>
      <p class="story-text">중앙대학교 도시시스템공학전공으로 편입하며 도시라는 학문을 처음 접했어요. 도시를 읽는 법부터 계획하고 설계하는 법까지 배우며, 알면 알수록 도시의 매력에 더 깊이 빠져들었어요. <strong>졸업설계로 우수상</strong>을 받았고, <strong>학과 수석</strong>으로 졸업했어요.</p>
    </div>
  </li>
  <li class="story-item">
    <span class="story-num">03</span>
    <div class="story-body">
      <p class="story-meta">2023 – 2025 · 서울대학교 환경대학원</p>
      <h3 class="story-title">데이터로 도시에 질문하기</h3>
      <p class="story-text">서울대학교 환경대학원에서 GIS와 공간데이터 분석을 중심으로 깊이 있게 공부했어요. “인구감소지역을 떠난 사람들은 어디서, 어떤 일을 하게 될까?” 이 질문을 석사논문으로 풀었고, <strong>대한국토도시계획학회 우수논문상</strong>을 받았어요. 한국수자원공사 물 수요관리 지침 개정과 한국형 물문화 연구에도 참여했는데, 물문화 과제에서는 <strong>프로젝트 매니저</strong>를 맡아 일정과 결과물까지 과제 전체를 이끌었어요.</p>
    </div>
  </li>
  <li class="story-item is-now">
    <span class="story-num">04</span>
    <div class="story-body">
      <p class="story-meta">2026 – 현재 · 경기연구원</p>
      <h3 class="story-title">지금은, 에너지 전환의 현장에서</h3>
      <p class="story-text">경기연구원 기후에너지환경부에서 일하고 있어요. 탄소중립으로 가는 길에서 도시가 무엇을 준비해야 하는지, 데이터와 공간분석으로 답을 찾고 있어요. 에너지 전환이 앞으로 도시의 모습을 어떻게 바꿀지, 그 변화를 한발 앞서 함께 그려 가고 있어요.</p>
    </div>
  </li>
</ol>

<section class="home-news">
  <p class="home-topics-label">최근 소식</p>
  <ul>
  {% for n in site.data.news limit: 5 %}
    <li><span class="news-date">{{ n.date }}</span><span class="news-text">{{ n.text }}</span></li>
  {% endfor %}
  </ul>
</section>

<div class="home-next">
  <a class="home-btn is-primary" href="/projects/">연구 9건 살펴보기</a>
  <a class="home-btn" href="/cv/">CV 보기</a>
</div>

<div class="home-topics">
  <p class="home-topics-label">관심 주제</p>
  <ul class="keyword-chips is-links">
    <li><a href="/projects/#thesis">인구감소지역</a></li>
    <li><a href="/projects/#mobility">탄소중립·에너지 전환</a></li>
    <li><a href="/projects/#bus">교통·모빌리티</a></li>
    <li><a href="/projects/#cheonggye">도시재생</a></li>
    <li><a href="/projects/#innovation">지역혁신</a></li>
    <li><a href="/projects/#water_culture">물 관리</a></li>
    <li><a href="/cv/#skills">GIS·공간분석</a></li>
  </ul>
</div>

<div class="home-contact">
  <p class="home-contact-title">함께 이야기하고 싶다면</p>
  <p>연구 협업이나 문의는 이메일로 연락 주세요.</p>
  <a class="home-mail" href="mailto:khim@gri.re.kr">khim@gri.re.kr</a>
</div>
