# Embedding- és chunkinghatékonyság összesítése

A teljesen sikeres [rag-batch_2026-10-23T10-08-16.515Z_18c21d](https://oneharman-my.sharepoint.com/personal/gabor_kobli_harman_com/Documents/Microsoft%20Copilot%20Chat-f%C3%A1jlok/rag-batch_2026-10-23T10-08-16.515Z_18c21d.json) futás alapján a rendszer **20/20 tesztesetet teljesített**, technikai hiba nélkül.

## Összesített eredmények
- megfelelési arány: **100%**
- átlagos Precision@5: **0,32**
- átlagos Recall@5: **0,8667**
- átlagos MRR: **0,7558**
- első releváns találat átlagos helyezése: **1,75**
- átlagos retrieval idő: **397,75 ms**
- medián retrieval idő: **351 ms**
- leggyorsabb retrieval: **294 ms**
- leglassabb retrieval: **897 ms**
- átlagos teljes válaszidő: **5,90 másodperc**

## Releváns találatok helyezése

A 20 tesztből:
- **12 esetben** az első helyen volt releváns chunk;
- **4 esetben** a második helyen;
- **2 esetben** a harmadik helyen;
- **1 esetben** a negyedik helyen;
- **1 esetben** az ötödik helyen.

Ez azt jelenti, hogy a releváns információ:
- az esetek **60%-ában az első találat volt**;
- az esetek **80%-ában az első két találat között volt**;
- minden tesztnél bekerült a végső Top 5-be.

## Dokumentumtípusonkénti eredmények

| **Típus** | **Tesztek** | **Precision@5** | **Recall@5** | **MRR** | **Első releváns hely** | **Retrieval** |
|----|----|----|----|----|----|----|
| PDF | 12 | 0,30 | 0,861 | 0,896 | 1,33 | 407 ms |
| DOCX | 4 | 0,30 | 0,75 | 0,417 | 2,50 | 408 ms |
| XLSX | 2 | 0,20 | 1,00 | 0,60 | 3,00 | 367 ms |
| TXT | 2 | 0,60 | 1,00 | 0,75 | 1,50 | 356 ms |

## Értékelés
- A **PDF-feldolgozás a legerősebb**. A releváns chunk átlagosan az első vagy második helyre került.
- A **TXT-eredmények szintén nagyon jók**, teljes Recall@5 és magas Precision@5 mellett.
- Az **XLSX mindkét tesztje sikeres**, ezért nem szükséges Markdown formátumra cserélni. A releváns táblázatrész mindkét esetben bekerült a Top 5-be.
- A **DOCX zajosabb**, a releváns chunkok későbbi helyen jelennek meg, de mind a négy válasz megfelelő volt.

## Nyelvenkénti eredmények

| **Kérdés nyelve** | **Tesztek** | **Precision@5** | **Recall@5** | **MRR** | **Első releváns hely** | **Retrieval** |
|----|----|----|----|----|----|----|
| Magyar | 15 | 0,333 | 0,867 | 0,741 | 1,87 | 400 ms |
| Angol | 5 | 0,280 | 0,867 | 0,800 | 1,40 | 390 ms |

A Recall@5 magyar és angol kérdéseknél gyakorlatilag azonos. Az angol kérdések releváns találatai valamivel előrébb kerültek, de a kétnyelvű keresés mindkét irányban megfelelően működik.

## Chunking értékelése
- **15 tesztnél teljes Recall@5** született, vagyis minden előre megjelölt releváns chunk bekerült.
- **5 tesztnél részleges Recall@5** volt, de legalább egy releváns chunk minden esetben bekerült.
- Egyetlen tesztnél sem volt Recall@5 = 0.
- A Top 5 kontextus ezért minden kérdésben elegendő volt a helyes válaszhoz.

A 0,32 átlagos Precision@5 nem jelent hibát. Több tesztnél csak egy vagy két chunk volt előre relevánsnak jelölve, miközben a rendszer öt forrást adott vissza. Emiatt matematikailag a tipikus érték 0,2 vagy 0,4, még akkor is, ha a szükséges információ megfelelően megtalálható.

## Végső következtetés

Az embedding- és chunkingfolyamat a kötelező projektkövetelményekhez **megfelelő**:
- minden tesztnél megtalálta a válaszhoz szükséges információt;
- minden dokumentumtípus sikeresen kereshető;
- a magyar és angol kérdések egyaránt működnek;
- a releváns chunk átlagosan az első két találat között van;
- a retrieval idő átlagosan 0,4 másodperc alatt marad;
- az XLSX-feldolgozást nem szükséges lecserélni;
- további rangsorolási vagy chunkingmódosítás nem indokolt.
