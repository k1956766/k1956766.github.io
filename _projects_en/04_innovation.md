---
layout: page
title: "Effects of Firm Size and Regional Characteristics on Innovation Output"
toc_text: "Firm Size & Regional Innovation (GWR)"
group: "Research Projects"
group_order: 3
oneliner: "Do large firms drive innovation? Using geographically weighted regression, I mapped how the answer differs by region."
importance: 1
description: "Team Project · Urban & Regional Analysis · 2024.9 – 2024.12"
---

<table class="table table-sm research-facts">
  <tbody>
    <tr><th scope="row">Type</th><td>Course team project (3 members)</td></tr>
    <tr><th scope="row">Role</th><td>Team leader · proposed the topic, reviewed prior studies, preprocessed and compiled data, interpreted results</td></tr>
    <tr><th scope="row">Data</th><td>Patent applications and knowledge-based industry establishment data for 225 si-gun-gu nationwide (2022)</td></tr>
    <tr><th scope="row">Methods</th><td>OLS, geographically weighted regression (GWR)</td></tr>
  </tbody>
</table>

#### Background
- In 2012, large firms filed more patent applications than SMEs, but **in 2022, SMEs' applications surpassed those of large and mid-sized firms.**
- As innovation has flourished in urban clusters such as Pangyo and Magok, there has been growing discussion that small firms can also lead innovation where inter-firm collaboration and labor sharing are easy.
- Conversely, in regions where linking with nearby firms is difficult, large firms with strong in-house capabilities may lead innovation. I focused on the possibility that the relationship between firm size and innovation differs by region.

#### Research Questions
- In knowledge-based industries, do larger establishments lead to more patent applications?
- How does that effect differ by region, such as between the Seoul metropolitan area and the rest of the country?

#### Data & Methods
- We analyzed 225 si-gun-gu nationwide in 2022. Island areas far from other regions (Ongjin-gun, Ulleung-gun, Jeju-si, Seogwipo-si) were excluded as unsuitable for GWR.
- The dependent variable was **the number of patent applications by si-gun-gu (natural log)** from the Intellectual Property Statistics Service (IPSS). Instead of patent registrations, which take nearly 2 years, we used applications, which reflect the most recent knowledge-creation activity.
- The key variables were the average establishment size (employees ÷ establishments) in knowledge-based services (professional, scientific, and technical services) and knowledge-based manufacturing (13 industries with a patent application share of 1% or more).
- By also controlling for employment in both industries, we designed the establishment size variable to mean "whether the same workforce is concentrated in a few establishments or spread across many." Population, population density, commercial-zone area, and the number of graduate students were also controlled.
- We estimated the nationwide average effect with heteroskedasticity-robust OLS and region-specific effects with **geographically weighted regression (GWR)**. Because administrative areas vary greatly in size, we used an adaptive bandwidth chosen to minimize the corrected AIC.

#### Key Findings
- Patent applications averaged 811, but the gap was very large, from a minimum of 4 to a maximum of 15,645 (Suwon-si). Applications were concentrated in the Seoul metropolitan area, Cheonan, and Asan, and in manufacturing cities such as Ulsan, Pohang, Gumi, and Changwon.

<figure class="research-figure">
  <img data-zoomable width="900" height="999" src="/assets/img/research/innovation/fig1.jpg" alt="Map of 2022 patent applications by si-gun-gu nationwide, shown in quartiles" loading="lazy">
  <figcaption><strong>Figure 1. Patent applications by si-gun-gu (2022)</strong> Patent applications are divided into quartiles; darker colors mean more applications. Applications cluster in the Seoul metropolitan area, northern Chungcheong, and Yeongnam manufacturing cities, showing that manufacturing also plays a large role in innovation.</figcaption>
</figure>

- In the OLS results, **each 1-person increase in average establishment size in knowledge-based services raised patent applications by about 4.9%.** In contrast, establishment size in knowledge-based manufacturing was not significant.
- Each additional 1,000 employees raised patent applications by about 1.9% in services and about 1.0% in manufacturing. An increase of 1,000 graduate students was associated with an increase of about 7.4%, confirming the importance of higher education institutions.

**Table 1. Comparison of OLS and GWR coefficients (dependent variable: ln patent applications)**

| Variable | OLS | GWR min | GWR median | GWR max |
|---|---|---|---|---|
| Knowledge-based services establishment size (persons) | 0.049*** | 0.012 | 0.053 | 0.115 |
| Knowledge-based manufacturing establishment size (persons) | 0.008 | -0.030 | 0.002 | 0.019 |
| Knowledge-based services employment (thousands) | 0.019*** | -0.050 | 0.015 | 0.028 |
| Graduate students (thousands) | 0.074*** | 0.041 | 0.066 | 0.178 |
| Adjusted R² / Local R² | 0.730 | 0.731 | 0.764 | 0.869 |

<p class="figure-note">OLS estimates a single coefficient for the whole country; GWR estimates a different coefficient for each si-gun-gu. The adjusted R² of the overall GWR model is 0.777, similar to OLS in explanatory power, but it shows how much the coefficients vary by region. *** p&lt;0.01</p>

- In the GWR, the effect of services establishment size **ranged from about 1.2% to 11.5% depending on the region**. It was positive everywhere, but its magnitude varied widely.
- In the Seoul metropolitan area, including Seoul, the coefficients were low and not statistically significant. The size effect grew toward the southern coast, especially toward Gyeongsangnam-do.
- Manufacturing establishment size was not significant in most regions. It was, however, significantly positive in parts of Chungcheongnam-do and Jeollabuk-do, such as Daejeon and Jeonju, and in Inje, Yangyang, Pyeongchang, and Hongcheon in Gangwon.

<figure class="research-figure">
  <img data-zoomable width="1400" height="1400" src="/assets/img/research/innovation/fig2.jpg" alt="Four maps of GWR-estimated establishment size coefficients for services and manufacturing and their statistical significance" loading="lazy">
  <figcaption><strong>Figure 2. GWR establishment size coefficients and significance</strong> The top row shows the growth rate of patent applications per 1-person increase in establishment size, and the bottom row shows the significance of those coefficients (services on the left, manufacturing on the right). For services, only the Seoul metropolitan area is not significant, and the effect grows toward the south; for manufacturing, the effect is significant only in some regions.</figcaption>
</figure>

#### Implications
- The results show that in the Seoul metropolitan area, with its dense population and firms and an established regional innovation system, **innovation can occur regardless of establishment size**.
- This is consistent with prior research showing that collaborating small firms can narrow the innovation gap with large firms (Nieto & Santamaría, 2010). Support for SMEs may matter more in large cities with strong innovation environments.
- In contrast, in non-capital regions such as Yeongnam, larger establishments have an advantage in innovation, so innovation policy should be designed to fit regional characteristics.

#### Limitations & Next Steps
- The si-gun-gu unit is too large to capture recent, densely formed industrial clusters. Even within Yongin-si, for example, residential Gwanggyo and Giheung-gu, home to the semiconductor industry, differ greatly in innovation characteristics.
- This was not possible this time because of patent data limitations, but analysis with patent application data at the administrative-dong level could yield more insights.
