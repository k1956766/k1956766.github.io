---
layout: page
title: Kanghyeok Im
permalink: /en/
lang: en
alt_url: /
description: Researcher, Department of Climate, Energy & Environment, Gyeonggi Research Institute
---

<div class="intro has-photo is-en">
  <figure class="intro-photo"><img src="/assets/img/profile.png" width="354" height="472" alt="Portrait of Kanghyeok Im"></figure>
  <p class="intro-headline">I read cities through data<br>to help shape a better tomorrow</p>
  <p class="intro-lead">Hi, I'm Kanghyeok Im. I use maps and data to tackle urban problems.</p>
</div>

<ol class="story story-steps">
  <li class="story-item">
    <span class="story-num">01</span>
    <div class="story-body">
      <p class="story-meta">2015 – 2020 · Electronic Engineering, University of Suwon</p>
      <h3 class="story-title">From circuits to cities</h3>
      <p class="story-text">I started out in electronic engineering. Over time I wanted to work on something broader than a single technology — something that improves the lives of many people. I found that answer in the city, where people live, work, and spend their days, so I decided to change my field.</p>
    </div>
  </li>
  <li class="story-item">
    <span class="story-num">02</span>
    <div class="story-body">
      <p class="story-meta">2020 – 2023 · Chung-Ang University</p>
      <h3 class="story-title">Discovering urban studies</h3>
      <p class="story-text">I transferred into Urban Systems Engineering at Chung-Ang University and met urban studies for the first time. Learning how to read, plan, and design cities drew me in deeper, and I graduated <strong>first in my department</strong> with an <strong>award-winning capstone project</strong>.</p>
    </div>
  </li>
  <li class="story-item">
    <span class="story-num">03</span>
    <div class="story-body">
      <p class="story-meta">2023 – 2025 · Graduate School of Environmental Studies, Seoul National University</p>
      <h3 class="story-title">Asking cities questions with data</h3>
      <p class="story-text">At Seoul National University I focused on GIS and spatial data analysis. My master's thesis asked, “Where do people who leave depopulating regions go, and what work do they find?” — and won the <strong>Best Paper Award</strong> from the Korean Planning Association. I also worked on commissioned studies for K-water on water demand management and on Korean water culture, serving as <strong>project manager</strong> for the latter.</p>
    </div>
  </li>
  <li class="story-item is-now">
    <span class="story-num">04</span>
    <div class="story-body">
      <p class="story-meta">2026 – Present · Gyeonggi Research Institute</p>
      <h3 class="story-title">Now, at the front line of the energy transition</h3>
      <p class="story-text">I work in the Department of Climate, Energy & Environment at Gyeonggi Research Institute. I use data and spatial analysis to understand what cities need to prepare on the road to carbon neutrality, and how the energy transition will reshape them.</p>
    </div>
  </li>
</ol>

<section class="home-news">
  <p class="home-topics-label">News</p>
  <ul>
  {% for n in site.data.news_en limit: 5 %}
    <li><span class="news-date">{{ n.date }}</span><span class="news-text">{{ n.text }}</span></li>
  {% endfor %}
  </ul>
</section>

<div class="home-next">
  <a class="home-btn is-primary" href="/en/projects/">Explore 9 research projects</a>
  <a class="home-btn" href="/en/cv/">View CV</a>
</div>

<div class="home-topics">
  <p class="home-topics-label">Research interests</p>
  <ul class="keyword-chips is-links">
    <li><a href="/en/projects/#thesis">Depopulating regions</a></li>
    <li><a href="/en/projects/#mobility">Carbon neutrality & energy transition</a></li>
    <li><a href="/en/projects/#bus">Transport & mobility</a></li>
    <li><a href="/en/projects/#cheonggye">Urban regeneration</a></li>
    <li><a href="/en/projects/#innovation">Regional innovation</a></li>
    <li><a href="/en/projects/#water_culture">Water management</a></li>
    <li><a href="/en/cv/#skills">GIS & spatial analysis</a></li>
  </ul>
</div>

<div class="home-contact">
  <p class="home-contact-title">Let's talk</p>
  <p>For research collaboration or inquiries, please reach out by email.</p>
  <a class="home-mail" href="mailto:khim@gri.re.kr">khim@gri.re.kr</a>
</div>
