---
layout: page
title: 연구
permalink: /projects/
description: 수행한 연구와 그 성과를 정리했습니다.
nav: true
nav_order: 2
toc:
  sidebar: left
---

{% assign sorted_projects = site.projects | sort: "importance" %}
<div class="research-list">
{% for project in sorted_projects %}
  <section class="card research-card mt-3 p-3" id="{{ project.title | slugify: 'raw' }}">
    <h2 class="card-title research-title">{{ project.title }}</h2>
    <p class="research-desc">{{ project.description }}</p>
    <div class="research-body">
      {{ project.content }}
    </div>
  </section>
{% endfor %}
</div>
