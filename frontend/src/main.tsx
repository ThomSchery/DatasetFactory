import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Loading } from "./components/common/UiStates";
import { DesignHarness } from "./design-harness";
import "./styles/global.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("DatasetFactory root element is missing");
}

const showDesignHarness =
  new URLSearchParams(window.location.search).get("view") === "design-harness";

createRoot(rootElement).render(
  <StrictMode>
    {showDesignHarness ? (
      <DesignHarness />
    ) : (
      <Loading label="Uruchamianie DatasetFactory…" />
    )}
  </StrictMode>,
);
