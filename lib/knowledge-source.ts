// A chatbot által használható tudásforrás-módok.
export type KnowledgeSourceMode =
  | "documents"
  | "model"
  | "hybrid";

// Alapértelmezetten csak a feltöltött dokumentumokat használjuk.
export const DEFAULT_KNOWLEDGE_SOURCE_MODE:
  KnowledgeSourceMode = "documents";

// Ellenőrzi, hogy a kapott érték támogatott tudásforrás-mód-e.
export function isKnowledgeSourceMode(
  value: unknown
): value is KnowledgeSourceMode {
  return (
    value === "documents" ||
    value === "model" ||
    value === "hybrid"
  );
}

// A kiválasztott módhoz tartozó kiegészítő rendszerutasítás.
export function getKnowledgeSourceInstruction(
  mode: KnowledgeSourceMode
): string {
  if (mode === "model") {
    return `
# TUDÁSFORRÁS: CSAK A MODELL ÁLTALÁNOS TUDÁSA
- Ne használd a feltöltött dokumentumokat és dokumentumrészleteket.
- A választ az általános modelltudásod alapján készítsd el.
- A válaszban egyértelműen jelezd, hogy az információ nem a feltöltött dokumentumokból származik.
- Ne állítsd, hogy a válasz gyártói dokumentációból vagy helyi munkautasításból származik.
- Ha egy pontos géptípushoz, szoftververzióhoz, paraméterhez vagy hibakódhoz nincs megbízható ismereted, jelezd a bizonytalanságot.
- Ne találj ki pontos műszaki értéket, határértéket, biztonsági előírást vagy javítási lépést.
- A válasz végén a Források szakaszban ezt add meg: Általános AI-tudás.
`.trim();
  }

  if (mode === "hybrid") {
    return `
# TUDÁSFORRÁS: FELTÖLTÖTT DOKUMENTUMOK ÉS ÁLTALÁNOS MODELLTUDÁS
- Elsődlegesen a visszakeresett dokumentumokat használd.
- A dokumentumokban szereplő információkat kezeld elsődleges forrásként.
- Ha a dokumentumok nem tartalmaznak elegendő információt, a választ általános modelltudással kiegészítheted.
- Ne írj felül dokumentált műszaki adatot általános modelltudással.
- Ha a dokumentum és az általános modelltudás eltér, ismertesd az eltérést, és a dokumentumban szereplő adatot kezeld elsődlegesként.

# KÖTELEZŐ HIBRID VÁLASZFORMÁTUM
Ha dokumentumalapú információt és általános modelltudást is használsz, a válaszban pontosan ezeket a külön szakaszcímeket használd:

## Dokumentumalapú információ
Ebben a szakaszban kizárólag a feltöltött dokumentumokból származó információ szerepelhet.

## Általános műszaki tájékoztatás
Ebben a szakaszban kizárólag az általános modelltudásból származó kiegészítés szerepelhet.
A szakasz elején kötelezően írd le ezt a mondatot:
„Ez a rész nem a feltöltött dokumentumokból származik.”

## Források
- Sorold fel a ténylegesen felhasznált dokumentumok címét vagy fájlnevét.
- Ha általános modelltudást is használtál, külön felsorolási pontként kötelezően add meg: „Általános AI-tudás”.

- Ne keverd össze a két szakasz információit.
- Ha nem találtál releváns dokumentumot, a „Dokumentumalapú információ” szakaszban ezt egyértelműen jelezd.
- Ha kizárólag dokumentumalapú információt használtál, az általános műszaki tájékoztatási szakaszt hagyd el.
- Ha kizárólag általános modelltudás alapján tudsz válaszolni, jelezd, hogy nem találtál releváns dokumentumot, majd külön add meg az általános tájékoztatást.
`.trim();
  }

  return `
# TUDÁSFORRÁS: CSAK FELTÖLTÖTT DOKUMENTUMOK
- Kizárólag a visszakeresett dokumentumok és dokumentumrészletek alapján válaszolj.
- Ne használd az általános modelltudásodat a hiányzó műszaki információ pótlására.
- Ha nincs megfelelő dokumentumtalálat, ezt egyértelműen jelezd.
- Ne találj ki hibakódot, paramétert, határértéket, alkatrészt, biztonsági előírást vagy eljárási lépést.
- A válasz végén kizárólag a ténylegesen felhasznált dokumentumokat nevezd meg.
`.trim();
}
