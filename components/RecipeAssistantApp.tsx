"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ChatInterface from "./ChatInterface";
import DocumentManager from "./DocumentManager";
import styles from "./RecipeAssistantApp.module.css";

// Az alkalmazasban megjelenitheto nezetek tipusa.
type ApplicationView = "chat" | "documents";

// A fo frontend alkalmazaskomponens.
export default function RecipeAssistantApp() {
  const router = useRouter();

  // Alapertelmezetten a chatfelulet jelenik meg.
  const [activeView, setActiveView] = useState<ApplicationView>("chat");

  // Ha az oldal ?view=documents parameterrel nyilik meg,
  // automatikusan a Dokumentumkezeles ful jelenik meg.
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);

    if (searchParams.get("view") === "documents") {
      setActiveView("documents");
    }
  }, []);

  return (
    <div>
      <nav
        className={styles.navigation}
        aria-label="Alkalmazasnezetek"
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
          Dokumentumkezeles
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
