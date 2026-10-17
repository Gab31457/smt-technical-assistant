"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

import styles from "./DocumentManager.module.css";

/*
 * A backend által visszaadott dokumentum szerkezete.
 */
interface DocumentItem {
  id: string;
  originalFilename: string;
  title: string | null;
  mimeType: string;
  status:
    | "uploaded"
    | "processing"
    | "completed"
    | "failed";
  metadata: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  chunkCount: number;
  chunksWithEmbedding: number;
}

/*
 * A GET /api/documents sikeres válasza.
 */
interface SuccessfulDocumentListResponse {
  success: true;
  count: number;
  documents: DocumentItem[];
}

/*
 * Általános sikertelen API-válasz.
 */
interface FailedApiResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/*
 * A POST /api/upload sikeres válasza.
 */
interface SuccessfulUploadResponse {
  success: true;
  message: string;
  document: {
    id: string;
    originalFilename: string;
    title: string | null;
    mimeType: string;
    status: string;
    createdAt: string;
  };
}

/*
 * A POST /api/process sikeres válasza.
 */
interface SuccessfulProcessResponse {
  success: true;
  message: string;
  document: {
    id: string;
    originalFilename: string;
    title: string | null;
    status: string;
  };
  processing: {
    chunkCount: number;
    embeddingCount: number;
    embeddingModel: string;
  };
}

/*
 * A DELETE /api/documents/:id sikeres válasza.
 */
interface SuccessfulDeleteResponse {
  success: true;
  message: string;
  deletedDocument: {
    id: string;
    originalFilename: string;
    title: string | null;
    previousStatus: string;
  };
}

/*
 * A dokumentum állapotának magyar megnevezése.
 */
function getStatusLabel(
  status: DocumentItem["status"]
): string {
  switch (status) {
    case "uploaded":
      return "Feltöltve";

    case "processing":
      return "Feldolgozás alatt";

    case "completed":
      return "Feldolgozva";

    case "failed":
      return "Sikertelen";

    default:
      return status;
  }
}

/*
 * A fájlméret olvasható formázása.
 *
 * A metadata mezőből érkező érték típusa futásidőben
 * nem feltétlenül garantált, ezért unknown értéket fogadunk.
 */
function formatFileSize(
  value: unknown
): string | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return null;
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(
    value /
    (1024 * 1024)
  ).toFixed(2)} MB`;
}

/*
 * ISO dátum magyar formázása.
 */
function formatDate(
  isoDate: string | null
): string {
  if (!isoDate) {
    return "Nincs adat";
  }

  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return "Érvénytelen dátum";
  }

  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/*
 * A frontend dokumentumkezelő komponense.
 */
export default function DocumentManager() {
  /*
   * A backendből lekért dokumentumlista.
   */
  const [documents, setDocuments] = useState<
    DocumentItem[]
  >([]);


  /*
   * Dokumentumlista betöltési állapota.
   */
  const [isLoadingDocuments, setIsLoadingDocuments] =
    useState(true);

  /*
   * Fájlfeltöltés állapota.
   */
  const [isUploading, setIsUploading] =
    useState(false);

  /*
   * Az éppen feldolgozott dokumentum azonosítója.
   */
  const [
    processingDocumentId,
    setProcessingDocumentId,
  ] = useState<string | null>(null);

  /*
   * Az éppen törölt dokumentum azonosítója.
   */
  const [
    deletingDocumentId,
    setDeletingDocumentId,
  ] = useState<string | null>(null);

  /*
   * Sikeres művelet után megjelenő üzenet.
   */
  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);

  /*
   * Hiba esetén megjelenő üzenet.
   */
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  /*
   * A dokumentumlista lekérése.
   *
   * A useCallback biztosítja, hogy a függvény
   * referenciája ne változzon minden renderelésnél.
   */
  const loadDocuments =
    useCallback(async (): Promise<void> => {
      setIsLoadingDocuments(true);

      try {
        const response = await fetch(
          "/api/documents",
          {
            method: "GET",

            /*
             * Nem szeretnénk, hogy a böngésző
             * korábbi dokumentumlistát használjon.
             */
            cache: "no-store",
          }
        );

        const responseBody =
          (await response.json()) as
            | SuccessfulDocumentListResponse
            | FailedApiResponse;

        if (
          !response.ok ||
          responseBody.success === false
        ) {
          const apiError =
            responseBody.success === false
              ? responseBody.error.message
              : "A dokumentumlista nem tölthető be.";

          throw new Error(apiError);
        }

        setDocuments(responseBody.documents);
      } catch (error) {
        const readableError =
          error instanceof Error
            ? error.message
            : "Ismeretlen hiba történt.";

        setErrorMessage(readableError);
      } finally {
        setIsLoadingDocuments(false);
      }
    }, []);

  /*
   * A komponens első megjelenésekor lekérjük
   * a dokumentumlistát.
   */
 useEffect(() => {
  // Az első dokumentumlekérést a következő eseményciklusra
  // ütemezzük. Így nem történik közvetlen, szinkron
  // állapotmódosítás a useEffect törzsében.
  const timeoutId = window.setTimeout(() => {
    void loadDocuments();
  }, 0);

  // Ha a komponens még a lekérés elindítása előtt megszűnik,
  // töröljük a függőben lévő időzítést.
  return () => {
    window.clearTimeout(timeoutId);
  };
}, [loadDocuments]);

  /*
   * A fájlválasztó változásának kezelése.
   * A kiválasztás után automatikusan elindul
   * a feltöltés és a feldolgozás.
   */
  async function handleFileChange(
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> {
    const file = event.target.files?.[0];

    if (!file || isUploading) {
      return;
    }

    const fileInput = event.target;
    const formData = new FormData();
    formData.append("file", file);

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const uploadResponse = await fetch(
        "/api/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const uploadResponseBody =
        (await uploadResponse.json()) as
          | SuccessfulUploadResponse
          | FailedApiResponse;

      if (
        !uploadResponse.ok ||
        uploadResponseBody.success === false
      ) {
        const apiError =
          uploadResponseBody.success === false
            ? uploadResponseBody.error.message
            : "A fájl feltöltése sikertelen.";

        throw new Error(apiError);
      }

      await processDocument(
        uploadResponseBody.document.id
      );
    } catch (error) {
      const readableError =
        error instanceof Error
          ? error.message
          : "Ismeretlen feltöltési hiba történt.";

      setErrorMessage(readableError);
      await loadDocuments();
    } finally {
      fileInput.value = "";
      setIsUploading(false);
    }
  }

  /*
   * Egy feltöltött dokumentum feldolgozása.
   *
   * Ez a művelet:
   *
   * - chunkokat hoz létre;
   * - OpenAI embeddingeket készít;
   * - pgvector mezőbe menti az embeddingeket.
   */
  async function processDocument(
    documentId: string
  ): Promise<void> {
    if (processingDocumentId) {
      return;
    }

    setProcessingDocumentId(documentId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(
        "/api/process",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            documentId,
          }),
        }
      );

      const responseBody =
        (await response.json()) as
          | SuccessfulProcessResponse
          | FailedApiResponse;

      if (
        !response.ok ||
        responseBody.success === false
      ) {
        const apiError =
          responseBody.success === false
            ? responseBody.error.message
            : "A dokumentum feldolgozása sikertelen.";

        throw new Error(apiError);
      }

      setSuccessMessage(
        `${responseBody.message} Létrehozott chunkok: ${responseBody.processing.chunkCount}.`
      );

      await loadDocuments();
    } catch (error) {
      const readableError =
        error instanceof Error
          ? error.message
          : "Ismeretlen feldolgozási hiba történt.";

      setErrorMessage(readableError);

      /*
       * Hiba esetén is újratöltjük a listát,
       * hogy a failed állapot látható legyen.
       */
      await loadDocuments();
    } finally {
      setProcessingDocumentId(null);
    }
  }

  /*
   * Egy dokumentum és a hozzá tartozó chunkok törlése.
   */
  async function deleteDocument(
    documentItem: DocumentItem
  ): Promise<void> {
    if (deletingDocumentId) {
      return;
    }

    /*
     * A törlés előtt megerősítést kérünk.
     */
    const shouldDelete = window.confirm(
      `Biztosan törölni szeretné ezt a dokumentumot?\n\n${documentItem.originalFilename}\n\nA hozzá tartozó chunkok és embeddingek is törlődnek.`
    );

    if (!shouldDelete) {
      return;
    }

    setDeletingDocumentId(documentItem.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(
        `/api/documents/${documentItem.id}`,
        {
          method: "DELETE",
        }
      );

      const responseBody =
        (await response.json()) as
          | SuccessfulDeleteResponse
          | FailedApiResponse;

      if (
        !response.ok ||
        responseBody.success === false
      ) {
        const apiError =
          responseBody.success === false
            ? responseBody.error.message
            : "A dokumentum törlése sikertelen.";

        throw new Error(apiError);
      }

      setSuccessMessage(responseBody.message);
      await loadDocuments();
    } catch (error) {
      const readableError =
        error instanceof Error
          ? error.message
          : "Ismeretlen törlési hiba történt.";

      setErrorMessage(readableError);
    } finally {
      setDeletingDocumentId(null);
    }
  }

  return (
    <section
      className={styles.documentManager}
    >
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>
            SMT műszaki dokumentumok
          </h2>

          <p className={styles.description}>
            Töltsön fel SMT műszaki dokumentumokat, majd dolgozza fel őket
            szemantikus kereséshez.
          </p>
        </div>

        <button
          className={styles.refreshButton}
          type="button"
          onClick={() =>
            void loadDocuments()
          }
          disabled={isLoadingDocuments}
        >
          {isLoadingDocuments
            ? "Frissítés..."
            : "Lista frissítése"}
        </button>
      </div>

      <div className={styles.uploadForm}>
        <input
          id="document-file"
          type="file"
          accept=".txt,.md,.pdf,.docx,.xlsx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) =>
            void handleFileChange(event)
          }
          disabled={
            isUploading ||
            Boolean(processingDocumentId)
          }
          style={{ display: "none" }}
        />

        <button
          className={styles.uploadButton}
          type="button"
          onClick={() => {
            const fileInput =
              document.getElementById(
                "document-file"
              ) as HTMLInputElement | null;

            fileInput?.click();
          }}
          disabled={
            isUploading ||
            Boolean(processingDocumentId)
          }
        >
          {isUploading || processingDocumentId
            ? "Feltöltés és feldolgozás..."
            : "Fájl feltöltése"}
        </button>
      </div>

      {successMessage && (
        <div
          className={styles.successMessage}
          role="status"
        >
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div
          className={styles.errorMessage}
          role="alert"
        >
          <strong>Hiba:</strong>{" "}
          {errorMessage}
        </div>
      )}

      <div className={styles.listHeader}>
        <h3>Feltöltött dokumentumok</h3>

        <span>
          {documents.length} dokumentum
        </span>
      </div>

      {isLoadingDocuments ? (
        <div className={styles.loadingState}>
          Dokumentumok betöltése...
        </div>
      ) : documents.length === 0 ? (
        <div className={styles.emptyState}>
          <div
            className={styles.emptyIcon}
            aria-hidden="true"
          >
            📄
          </div>

          <h3>
            Még nincs feltöltött dokumentum
          </h3>

          <p>
            Válasszon ki egy SMT műszaki dokumentumot a feltöltéshez.
          </p>
        </div>
      ) : (
        <div className={styles.documentList}>
          {documents.map((documentItem) => {

            const isDeleting =
              deletingDocumentId ===
              documentItem.id;

            const fileSize = formatFileSize(
              documentItem.metadata
                .fileSizeBytes
            );

            return (
              <article
                key={documentItem.id}
                className={styles.documentCard}
              >
                <div
                  className={
                    styles.documentMain
                  }
                >
                  <div
                    className={
                      styles.documentTitleRow
                    }
                  >
                    <div
                      className={
                        styles.fileIcon
                      }
                      aria-hidden="true"
                    >
                      {documentItem.mimeType ===
                      "application/pdf"
                        ? "PDF"
                        : documentItem.mimeType ===
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          ? "DOCX"
                          : documentItem.mimeType ===
                              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            ? "XLSX"
                            : documentItem.mimeType ===
                                "text/markdown"
                              ? "MD"
                              : "TXT"}
                    </div>

                    <div>
                      <h4
                        className={
                          styles.documentTitle
                        }
                      >
                        {documentItem.title ||
                          documentItem.originalFilename}
                      </h4>

                      <p
                        className={
                          styles.filename
                        }
                      >
                        {
                          documentItem.originalFilename
                        }
                      </p>
                    </div>
                  </div>

                  <div
                    className={
                      styles.documentMetadata
                    }
                  >
                    <span>
                      Feltöltve:{" "}
                      {formatDate(
                        documentItem.createdAt
                      )}
                    </span>

                    {fileSize && (
                      <span>
                        Méret: {fileSize}
                      </span>
                    )}

                    <span>
                      Chunkok:{" "}
                      {documentItem.chunkCount}
                    </span>

                    <span>
                      Embeddingek:{" "}
                      {
                        documentItem
                          .chunksWithEmbedding
                      }
                    </span>
                  </div>

                  {documentItem.errorMessage && (
                    <div
                      className={
                        styles.documentError
                      }
                    >
                      {
                        documentItem.errorMessage
                      }
                    </div>
                  )}
                </div>

                <div
                  className={
                    styles.documentActions
                  }
                >
                  <span
                    className={`${styles.statusBadge} ${
                      styles[
                        `status_${documentItem.status}`
                      ]
                    }`}
                  >
                    {getStatusLabel(
                      documentItem.status
                    )}
                  </span>


                  <button
                    className={
                      styles.deleteButton
                    }
                    type="button"
                    onClick={() =>
                      void deleteDocument(
                        documentItem
                      )
                    }
                    disabled={
                      documentItem.status ===
                        "processing" ||
                      Boolean(
                        processingDocumentId
                      ) ||
                      Boolean(
                        deletingDocumentId
                      )
                    }
                  >
                    {isDeleting
                      ? "Törlés..."
                      : "Törlés"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}