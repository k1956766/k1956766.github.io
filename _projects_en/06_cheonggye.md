---
layout: page
title: "Green Infrastructure as a Catalyst for Urban Regeneration"
toc_text: "Cheonggyecheon & Urban Regeneration"
group: "Research Projects"
group_order: 3
oneliner: "I tracked, parcel by parcel, how much private development the Cheonggyecheon restoration drew in, and for how long."
importance: 3
description: "Joint research · Cheonggyecheon restoration and private development"
---

<table class="table table-sm research-facts">
  <tbody>
    <tr><th scope="row">Type</th><td>Joint research (4 members, co-author)</td></tr>
    <tr><th scope="row">Role</th><td>Data collection and preprocessing, report writing</td></tr>
    <tr><th scope="row">Study area</th><td>Parcels around the restored section of Cheonggyecheon Stream (1993–2015)</td></tr>
    <tr><th scope="row">Data</th><td>79,830 observations, including building permits, officially assessed individual land prices, and zoning</td></tr>
    <tr><th scope="row">Methods</th><td>Logistic DID, K-means cluster analysis</td></tr>
  </tbody>
</table>

#### Background
- Green infrastructure is drawing attention as a key tool for urban regeneration because of its varied economic, social, and environmental benefits.
- Existing studies have mainly shown that green infrastructure raises nearby land prices or commercial sales. However, they have not fully explained **its long-term effects or its role in attracting private development**.
- The Cheonggyecheon restoration turned an aging elevated highway, a piece of gray infrastructure, into a walkable waterfront green space. It is a landmark case of reviving the declining commercial core of Seoul's historic downtown.

#### Research Questions
- How much does public green infrastructure stimulate private development in surrounding areas?
- How does this effect vary with parcel characteristics (use, land price, accessibility)?

#### Data & Methods
- Of the roughly 11 km of Cheonggyecheon, I chose the **roughly 1.7 km urban-stream section** crossing downtown and its surrounding parcels as the study area. I excluded the cultural/natural-stream section, which is widely mixed with markets, and the residential/everyday-stream section.
- I compiled building permit data from the National Spatial Data Infrastructure Portal (NSDI) at the parcel level. New construction, reconstruction, and change of use counted as private development; balcony alterations and temporary structures were excluded.
- I compared the 10 years before (1993–2002) and after (2006–2015) the project, and estimated a **logistic difference-in-differences (DID) model** with the occurrence of private development (0/1) as the dependent variable. There are 79,830 observations.
- The net effect was measured with a "post-project period × distance to Cheonggyecheon" interaction term. I controlled for parcel size, officially assessed individual land price, zoning, number of subway lines within 300 m, and whether height restrictions had been lifted.
- I ran a **K-means cluster analysis (K=5)** on parcel size, zoning, assessed land price, and subway accessibility, then estimated the DID model separately for each cluster.

<figure class="research-figure">
  <img data-zoomable width="1400" height="717" src="/assets/img/research/cheonggye/fig1.jpg" alt="Map of the Cheonggyecheon urban-stream section and surrounding study-area parcels" loading="lazy">
  <figcaption><strong>Figure 1. Study area</strong> The left panel shows study-area parcels around the Cheonggyecheon urban-stream section (blue line); the upper right shows the selected 1.7 km within the restored section. The analysis covers the old downtown commercial area at the heart of Seoul.</figcaption>
</figure>

#### Key Findings
- In 5-year periods, the share of parcels with private development was 0.51% in Phase I and 2.54% in Phase II, then **rose sharply to 5.69% in Phase III, right after the restoration.** It remained higher than before the project in Phase IV, at 4.69%.

<figure class="research-figure">
  <img data-zoomable width="1238" height="868" src="/assets/img/research/cheonggye/fig2.png" alt="Maps and shares of parcels with private development in four periods before and after the project" loading="lazy">
  <figcaption><strong>Figure 2. Parcels with private development by period</strong> Parcels with at least one private development in each 5-year period are shown in dark green. Development parcels became noticeably more common after the project (right) than before (left), and the effect continued 10 years later.</figcaption>
</figure>

**Table 1. Logistic DID estimation results (odds ratios, key variables)**

| Variable | Model 1 | Model 2 (with controls) |
|---|---|---|
| Post-project period (Time) | 4.812*** | 6.364*** |
| Distance to Cheonggyecheon (Distance) | 1.001*** | 1.001*** |
| Time × Distance | 0.999*** | 0.998*** |
| Central commercial zone (vs. Class 1 residential) | – | 2.388*** |
| Height restriction lifted | – | 0.762*** |
| Pseudo R² | 0.038 | 0.141 |

<p class="figure-note">An interaction odds ratio below 1 means that after the project, the probability of development declined with distance from Cheonggyecheon. In other words, parcels closer to the stream saw more private development. *** p&lt;0.001</p>

- The interaction term was significant in both models: **after the restoration, parcels closer to the stream were more likely to see private development.**
- Larger parcels, higher land prices, and better subway access were associated with higher development probability. Central commercial zones were about 2.38 times more likely than Class 1 residential zones.
- Contrary to expectations, areas where height restrictions were lifted had lower development probability. I interpreted this as many of these areas lying in the Sewoon District, where long-delayed redevelopment blocked individual projects.
- The cluster analysis identified five types: residential, semi-peripheral, central commercial, office, and peripheral. Development increased after the project in all types, but **the distance effect was significant only for "central commercial" (0.996***) and "office" (0.998**).**

<figure class="research-figure">
  <img data-zoomable width="1400" height="1202" src="/assets/img/research/cheonggye/fig3.jpg" alt="Map of parcel distribution for five K-means cluster types and an English table summarizing cluster characteristics" loading="lazy">
  <figcaption><strong>Figure 3. K-means clustering results</strong> A map of parcels divided into five types, with each type's average parcel size, zoning, assessed land price, and subway accessibility. The Cheonggyecheon effect was clear in "central commercial" (K=2), which has the highest assessed land prices, and "office" (K=3), dominated by large parcels (highlighted in orange in the table).</figcaption>
</figure>

#### Implications
- The study provides empirical evidence that public green infrastructure attracts private development and that **the effect lasts for nearly 10 years**.
- The effect was strongest on high-value commercial and office parcels, consistent with the Seoul Metropolitan Government's aim of shifting downtown toward high-value-added industries.
- It shows that even cities with limited budgets can use green infrastructure as seed investment for regeneration strategies. However, institutions that block individual development, such as redevelopment zone designations, can offset the effect and should also be considered.
