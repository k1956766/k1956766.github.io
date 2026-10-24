---
layout: page
title: 연구
permalink: /projects/
description: 데이터로 도시에 던진 질문들과 그 답을 정리했어요.
nav: true
nav_order: 2
toc:
  sidebar: left
---

{% assign groups = site.projects | group_by: "group" | sort: "name" %}
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
