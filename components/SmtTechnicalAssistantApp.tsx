"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ChatInterface from "./ChatInterface";
import DocumentManager from "./DocumentManager";
import styles from "./SmtTechnicalAssistantApp.module.css";

type ApplicationView = "chat" | "documents";

export default function SmtTechnicalAssistantApp() {
  const router = useRouter();

  const [activeView, setActiveView] =
    useState<ApplicationView>("chat");

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);

    if (searchParams.get("view") !== "documents") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setActiveView("documents");
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  function showChat(): void {
    setActiveView("chat");
    window.history.replaceState({}, "", "/");
  }

  function showDocuments(): void {
    setActiveView("documents");
    window.history.replaceState({}, "", "/?view=documents");
  }

  return (
    <div>
      <nav
        className={styles.navigation}
        aria-label="Alkalmazásnézetek"
      >
        <button
          type="button"
          className={
            activeView === "chat"
              ? styles.activeNavigationButton
              : styles.navigationButton
          }
          onClick={showChat}
        >
          Asszisztens
        </button>

        <button
          type="button"
          className={
            activeView === "documents"
              ? styles.activeNavigationButton
              : styles.navigationButton
          }
          onClick={showDocuments}
        >
          Dokumentumkezelés
        </button>

        <button
          type="button"
          className={styles.navigationButton}
          onClick={() => router.push("/evaluation")}
        >
          Evaluation
        </button>
      </nav>

      {activeView === "chat" ? (
        <ChatInterface />
      ) : (
        <DocumentManager />
      )}
    </div>
  );
}
