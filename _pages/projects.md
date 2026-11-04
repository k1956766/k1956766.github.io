---
layout: page
title: 연구
permalink: /projects/
alt_url: /en/projects/
description: 데이터로 도시에 던진 질문들과 그 답을 정리했어요.
nav: true
nav_order: 2
toc:
  sidebar: left
---

{% assign ordered_all = site.projects | sort: "importance" | sort: "group_order" %}
<nav class="research-overview" aria-label="연구 한눈에 보기" data-toc-skip>
  <p class="research-overview-label">한눈에 보기</p>
  <ol>
  {% for project in ordered_all %}
    <li>
      <a href="#{{ project.slug | slice: 3, 30 }}">
        <span class="ro-group">{{ project.group }}</span>
        <span class="ro-title">{{ project.toc_text }}</span>
        <span class="ro-line">{{ project.oneliner }}</span>
      </a>
    </li>
  {% endfor %}
  </ol>
</nav>
{% assign ordered = site.projects | sort: "group_order" | map: "group" | uniq %}
<div class="research-list">
{% for gname in ordered %}
  {% assign items = site.projects | where: "group", gname | sort: "importance" %}
  <h2 class="research-group" id="group-{{ forloop.index }}" data-toc-text="{{ gname }}">{{ gname }} <span class="research-count">{{ items.size }}</span></h2>
  {% for project in items %}
  <section class="card research-card">
    <h3 class="card-title research-title" id="{{ project.slug | slice: 3, 30 }}" data-toc-text="{{ project.toc_text }}">{{ project.title }}</h3>
    <p class="research-desc">{{ project.description }}</p>
    <div class="research-body">
      {{ project.content }}
    </div>
  </section>
  {% endfor %}
{% endfor %}
</div>
<script src="{{ "/assets/js/anchor-fix.js" | relative_url }}"></script>
