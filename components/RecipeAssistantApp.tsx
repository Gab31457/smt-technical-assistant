"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ChatInterface from "./ChatInterface";
import DocumentManager from "./DocumentManager";
import styles from "./RecipeAssistantApp.module.css";

// Az alkalmazásban megjeleníthető nézetek típusa.
type ApplicationView = "chat" | "documents";

// A fő frontend alkalmazáskomponens.
export default function RecipeAssistantApp() {
  const router = useRouter();

  // Alapértelmezetten a chatfelület jelenik meg.
  const [activeView, setActiveView] = useState<ApplicationView>("chat");

  // Ha az oldal ?view=documents paraméterrel nyílik meg,
  // a következő eseményciklusban megnyitjuk a Dokumentumkezelést.
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
          onClick={() => setActiveView("chat")}
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
          onClick={() => setActiveView("documents")}
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
