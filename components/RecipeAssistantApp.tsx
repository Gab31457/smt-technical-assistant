"use client";

import { useState } from "react";

import ChatInterface from "./ChatInterface";
import DocumentManager from "./DocumentManager";

import styles from "./RecipeAssistantApp.module.css";

// Az alkalmazásban megjeleníthető nézetek típusa.
type ApplicationView = "chat" | "documents";

// A fő frontend alkalmazáskomponens.
//
// Ez a komponens kezeli a receptasszisztens és
// a dokumentumkezelő felület közötti váltást.
export default function RecipeAssistantApp() {
  // Alapértelmezetten a chatfelület jelenik meg.
  const [activeView, setActiveView] =
    useState<ApplicationView>("chat");

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
          Receptasszisztens
        </button>

        <button
          type="button"
          className={
            activeView === "documents"
              ? styles.activeNavigationButton
              : styles.navigationButton
          }
          onClick={() =>
            setActiveView("documents")
          }
        >
          Dokumentumkezelés
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