---
layout: page
title: "Factors Behind Changes in Bus Boardings and Alightings after New Public Transit Policies"
toc_text: "Transit Policy & Bus Ridership"
group: "Research Projects"
group_order: 3
oneliner: "I explained changes in bus ridership after Seoul's Climate Card and K-Pass with neighborhood building uses."
importance: 2
description: "BK Interdisciplinary Seminar · 2024.4 – 2024.8"
---

<table class="table table-sm research-facts">
  <tbody>
    <tr><th scope="row">Type</th><td>BK Interdisciplinary Seminar joint research (5 members, final presentation 2024.8.26)</td></tr>
    <tr><th scope="row">Role</th><td>Team leader · research administration, literature review, data preprocessing and analysis, presentation</td></tr>
    <tr><th scope="row">Data</th><td>Bus boardings and alightings for 426 administrative dongs in Seoul · building floor area by use</td></tr>
    <tr><th scope="row">Methods</th><td>T-test, Moran's I, spatial error model (SEM)</td></tr>
  </tbody>
</table>

#### Background
- Traffic congestion, air pollution, and energy consumption are growing problems. This makes TOD (transit-oriented development), which builds cities around public transit rather than private cars, increasingly important.
- In the first half of 2024, Seoul's Climate Card (pilot in January) and K-Pass (May, replacing the Altteul Transportation Card) were introduced in quick succession. K-Pass passed 2 million users within 3 months of launch.
- These new policies called for empirical evidence on **where actual transit use changed, and with which factors**.

#### Research Questions
- After the new transit policies, did bus boardings and alightings in Seoul change differently than before?
- Which building uses, measured as floor area by use in each administrative dong, are associated with bus use?

#### Data & Methods
- Using Seoul's 426 administrative dongs as the unit, I used bus boardings and alightings from the Public Data Portal (February–June, 2023–2024) as the dependent variable.
- The independent variables are **building floor area by use (2024)** from the Building Data Open System. Following prior research (Kim Ji-yun et al., 2015), I grouped them into major categories such as residential, commercial, office, and cultural & assembly, and subcategories such as apartment housing and Class 1 neighborhood living facilities.
- As a pilot test, I compared monthly changes in boardings and alightings before (2018→2019) and after (2023→2024) the policies with a T-test, and checked spatial autocorrelation with Moran's I.
- Based on the spatial autocorrelation of residuals and Lagrange multiplier (LM) tests, I chose a **spatial error model (SEM)** over OLS and the spatial lag model. I estimated a base model with major-category variables and an extended model with subcategory variables.

<figure class="research-figure">
  <img data-zoomable width="1400" height="434" src="/assets/img/research/bus/fig1.png" alt="English research flowchart with four stages: variable construction, pilot test, spatial error model, and results" loading="lazy">
  <figcaption><strong>Figure 1. Research flow</strong> I built variables at the administrative-dong level, first checked changes and spatial patterns with a T-test and Moran's I, and then analyzed factors with SEM. The steps were designed so that the pilot test results justify the model choice.</figcaption>
</figure>

#### Key Findings
- The T-test showed that in every month from February to June, **changes in bus boardings and alightings differed significantly before and after the policies** (t = -22.66 to -26.86, p &lt; 0.001).
- Moran's I for the changes was 0.156–0.200 in 2018–2019 and 0.147–0.175 in 2023–2024. This indicates modest but **positive spatial autocorrelation**: when use changes in one neighborhood, nearby neighborhoods tend to change similarly.

<figure class="research-figure">
  <img data-zoomable width="1285" height="702" src="/assets/img/research/bus/fig2.png" alt="Comparison of LISA cluster maps of June changes in bus boardings and alightings, 2018-2019 and 2023-2024" loading="lazy">
  <figcaption><strong>Figure 2. Spatial clusters of changes in bus boardings and alightings (June)</strong> Red (High-High) marks neighborhoods with large changes clustered together; blue (Low-Low) marks clusters of small changes. Before the policies, clusters were scattered across the south and major transit hubs; afterward, they shifted to a pattern concentrated around the city center.</figcaption>
</figure>

- In the spatial dependence diagnostics, Moran's I of the OLS residuals was 0.159 (p &lt; 0.001), violating OLS assumptions. Robust LM (lag) was not significant (p = 0.339) and only Robust LM (error) was significant (p &lt; 0.001), so SEM was appropriate for all months from February to June.

**Table 1. SEM estimation results (May, dependent variable: ln bus boardings and alightings)**

| Model | Variable (building floor area) | Coefficient | z-value |
|---|---|---|---|
| Base | Residential | 2.22e-06*** | 4.80 |
| Base | Cultural | 1.74e-05*** | 4.05 |
| Base | Commercial | 6.48e-06*** | 6.90 |
| Base | Office | 7.20e-06*** | 4.26 |
| Extended | Retail facilities | 1.19e-05*** | 3.65 |
| Extended | Religious facilities | 7.34e-05*** | 5.25 |

<p class="figure-note">The spatial error term λ was significant in both the base model (R² 0.457, λ 0.364) and the extended model (R² 0.492, λ 0.355). All uses shown have positive coefficients: neighborhoods with more floor area in these uses had more bus use. In the extended model, apartment housing, office facilities, Class 1 neighborhood living facilities, and cultural & assembly facilities were also significant. *** p&lt;0.001</p>

- In the base model, **residential, cultural, commercial, and office floor area were significant positive factors in all months from February to June**. In May, the remaining uses, such as education & welfare and parks & industry, were not significant at the 5% level.
- In the extended model, apartment housing, office facilities, Class 1 neighborhood living facilities, retail facilities, cultural & assembly facilities, and religious facilities were significant across February to June. All variables had VIFs below 10, so multicollinearity was not a concern.
- I interpreted commercial areas as drawing bus use because they are centers of daily activity with good walkability and dense bus routes. Religious facilities often have little parking and sit in residential or mixed-use areas, which I saw as translating into transit demand.

#### Implications
- By comparing changes in use before and after the new transit policies at the administrative-dong level, I provided **empirical evidence for gauging policy effects**.
- By identifying the specific building uses associated with bus use, the study offers variables to consider when designing future TOD policies.
- The dong-level results can serve as baseline data for locally tailored transit policies.

#### Limitations & Next Steps
- Usage data for the Climate Card were not public, so I could not directly isolate the effect of a specific policy.
- Non-policy factors such as weather and economic conditions were not fully accounted for.
- Transit use varies by time of day and by weekday versus weekend, so finer time segmentation would yield more realistic results.
