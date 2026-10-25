---
layout: page
title: "Employment and Income Characteristics of Out-Migrants from Depopulating Areas"
toc_text: "M.S. Thesis: Depopulating-Area Migrants"
group: "Master's Thesis"
group_order: 1
oneliner: "Who leaves depopulating areas, and does their income really rise after they leave? I answered with a full-population panel of 530,000 people."
importance: 1
description: "Master's Thesis · Graduate School of Environmental Studies, Seoul National University · 2025"
---

<table class="table table-sm research-facts">
  <tbody>
    <tr><th scope="row">Type</th><td>Master's thesis (M.S. in City Planning)</td></tr>
    <tr><th scope="row">Period</th><td>2024.12 – 2025.7 (degree conferred 2025.8)</td></tr>
    <tr><th scope="row">Role</th><td>Sole author, from research design through data construction, analysis, and writing</td></tr>
    <tr><th scope="row">Data</th><td>Statistics Korea Population Statistics Register integrated analysis DB (2015–2023, full-population panel of 533,798 people)</td></tr>
    <tr><th scope="row">Methods</th><td>Logistic regression, multiple regression, CEM matching + staggered DID</td></tr>
    <tr><th scope="row">Recognition</th><td><strong>Best Paper Award</strong>, Korean Planning Association Spring Conference (2025.4)</td></tr>
  </tbody>
</table>

#### Background
- Korea's 89 depopulating si-gun-gu are seeing their local economies weaken under continuous out-migration. From 2020 to 2023, the top reason for moving out of depopulating areas was "work" (28.0%), unlike the national trend, where housing ranks first.
- Yet prior studies stopped at typologies based on demographic characteristics, such as classifying or clustering areas by risk of regional extinction. Data linking income and employment were hard to obtain.
- As a result, **who leaves, and whether their income actually rises after leaving**, had never been tested empirically.

#### Research Questions
- What characteristics did people who left depopulating areas have?
- What factors most affected the income change of out-migrants?
- How does the rate of income change evolve over time after migration?

#### Data & Methods
- Using the Statistics Korea Population Statistics Register integrated analysis DB, I built a full-population panel linking population, housing, employment, and income. I tracked people who lived in depopulating areas in 2015, aged 26 (in 2015) to 64 (in 2023), through 2023, and analyzed **533,798 people**. I cleaned about 450 million raw records and automated the analysis modules.
- Income was defined as the larger of earned and business income, deflated to real terms with each province's consumer price index.
- Destinations were classified into 6 types: the Seoul metropolitan area, non-capital large cities, non-capital small and medium cities, other depopulating areas, innovation cities, and non-movers. For people who moved more than once, I treated the area where they lived longest as their effective destination.
- I used binary and multinomial logistic regression to analyze **who leaves**, and multiple regression with the 2015→2023 income change rate as the dependent variable to analyze **what changes income**.
- Because migration timing differs across individuals, I used the staggered difference-in-differences (staggered DID) method of Callaway & Sant'Anna (2021). I reduced selection bias with CEM matching on age, sex, and income in the 2 years before moving (8 quantiles); after matching, SMDs were close to 0.
- I estimated rigorously with a balanced panel observed from 2 years before to 3 years after the move (moves in 2018–2020), and supplemented the long-term trend up to 6 years after the move with an unbalanced panel.

#### Key Findings
- **Those who leave are not the vulnerable but people with strong labor-market competitiveness.** Higher real income (odds ratio 2.21) and working at a large firm (1.64) increased the likelihood of leaving.
- In contrast, day laborers (0.57), homeowners (0.73), and older people with longer job tenure were more likely to stay. Pre-move income was also higher for every migration type than for non-movers, contrary to earlier findings that low-income people leave.

**Table 1. Logistic regression results for out-migration (key variables)**

| Variable | Reference category | Odds ratio |
|---|---|---|
| Real income (log) | – | 2.21*** |
| Large-firm employment | Small business | 1.64*** |
| Homeownership | Non-owner | 0.73*** |
| Day laborer | Regular employee | 0.57*** |
| Employment duration (log) | – | 0.59*** |
| Age (per 1 year) | – | 0.94*** |

<p class="figure-note">Binary logit results estimating out-migration (reference: non-movers) from characteristics in 2015 (*** p&lt;0.001). Values above 1 mean a higher likelihood of leaving; income and large-firm employment raised out-migration most strongly.</p>

- In the multinomial logit, the high-income and large-firm effects appeared for every destination. The large-firm effect was largest for the Seoul metropolitan area (2.08) and non-capital small and medium cities (2.13). **Competitive people did not necessarily choose the capital region.**
- What determined the income change rate was **the kind of job people got, more than where they went**. The standardized coefficients of job tenure, employment status, and firm size were larger than those of destination, and among destinations only the Seoul metropolitan area (0.034) had a positive effect.

<figure class="research-figure">
  <img data-zoomable width="1400" height="956" src="/assets/img/research/thesis/fig1.png" alt="Graph of income change rates for migrants and matched stayers from 2 years before to 3 years after the move in the balanced panel, with bars for the migration effect (ATT) at each time point" loading="lazy">
  <figcaption><strong>Figure 1. Effect of migration on the income change rate (balanced panel)</strong> In the upper panel, the solid navy line is migrants and the dashed gray line is matched stayers. The lower bars show the difference between them (ATT), and the lines on the bars are 95% confidence intervals. To the right of the dashed orange line (after migration), the bars turn dark navy and grow. The gap widens to 5.4%p 1 year after migration and remains at 2.9%p after 3 years.</figcaption>
</figure>

- There was no effect in the year of migration (−1.1%p). But **from 1 year later, migrants' income change rate was 5.4%p higher than that of stayers**, and a gap of about 2.8–2.9%p persisted after 2–3 years.
- In the unbalanced panel up to 6 years later, the gap was 2.7%p after 1 year and then narrowed to 1.1–1.4%p, but it was significant at every time point. The gap is not temporary; it accumulates.

<figure class="research-figure">
  <img data-zoomable width="1400" height="956" src="/assets/img/research/thesis/fig2.png" alt="Graph of income change rates for migrants and stayers from 2 years before to 6 years after the move in the unbalanced panel, with the migration effect (ATT) at each time point" loading="lazy">
  <figcaption><strong>Figure 2. Effect of migration on the income change rate (unbalanced panel, up to 6 years after)</strong> Even with observation extended to 6 years after the move, all post-migration bars stay above 0, and no confidence interval crosses 0. The effect peaks at 2.7%p after 1 year and then stabilizes around 1%p. The income gap between migrants and stayers does not disappear but persists over the long term.</figcaption>
</figure>

**Table 2. ATT over time by destination (unbalanced panel)**

| Destination | After 1 year | After 3 years | After 6 years |
|---|---|---|---|
| Seoul metropolitan area | 0.091 | 0.060 | 0.053 |
| Non-capital large cities | 0.060 | 0.046 | 0.037 |
| Non-capital small and medium cities | 0.072 | 0.047 | 0.043 |
| Depopulating areas | 0.065 | 0.037 | 0.037 |
| Innovation cities | 0.063 | 0.045 | 0.051 |

<p class="figure-note">Results from 5 models, each matched separately by destination; all values are significant at p&lt;0.001. Because the samples differ across models, magnitudes are not directly comparable across regions, but the initial effect was largest for the Seoul metropolitan area, and the effect for innovation cities stayed relatively stable over time.</p>

- By group, the post-migration effect on the income change rate was larger for women than for men, and for people from small businesses than for people from large firms.

#### Implications
- Depopulation should be reframed not as "young people leave, older people stay" but as **an outflow of high-quality human capital and employment capacity**.
- Employment characteristics, not region, drove income. Expanding quality jobs through support for conversion to regular employment, incentives for long-term tenure, and attracting firms and public institutions could help ease out-migration.
- The findings can support tailored policies that move beyond uniform Local Extinction Response Fund projects, for example by splitting support into short- and mid-to-long-term phases that match the pace of post-migration income change.

#### Limitations & Next Steps
- The data lacked human-capital variables such as education, educational attainment, and family composition, so migration factors could not be fully controlled. Individual fixed effects were also not controlled.
- The observation period for each migration cohort is at most 6 years, short relative to the average length of residence (about 7.9 years).
- Job changes were not identified separately; identifying them to show changes in employment characteristics more clearly is left for future research.
