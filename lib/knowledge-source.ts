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
- A dokumentumalapú és az általános modelltudásból származó információkat világosan különítsd el.
- Használd a „Dokumentumalapú információ” és az „Általános műszaki tájékoztatás” címeket, ha mindkét forrást használod.
- Ne írj felül dokumentált műszaki adatot általános modelltudással.
- Ha a dokumentum és az általános modelltudás eltér, ismertesd az eltérést, és a dokumentumban szereplő adatot kezeld elsődlegesként.
- Az általános modelltudásból származó részben jelezd, hogy az információ nem a feltöltött dokumentumokból származik.
- A válasz végén külön sorold fel a felhasznált dokumentumokat, valamint szükség esetén az „Általános AI-tudás” megjelölést.
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
