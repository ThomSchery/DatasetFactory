import { createBrowserRouter, useParams, type RouteObject } from "react-router";

import { Empty } from "../components/common/UiStates";
import { AppShell } from "./AppShell";

/*
 * Exactly the five FE-04 routes plus a catch-all for unknown paths. Each one
 * renders an explicit empty state; the screens themselves belong to
 * FE-001-F2 … FE-001-F5 and are deliberately not started here.
 *
 * `handle.heading` feeds the shell's `<h1>` so the heading and the route stay
 * defined in one place.
 */

function DashboardRoute() {
  return (
    <Empty
      description="Ekran dashboardu powstaje w FE-001-F2. Pokaże aktywny projekt i run, liczby klatek per status oraz stan FFmpeg, Tesseractu, katalogu roboczego i GPU."
      title="Dashboard nie jest jeszcze zbudowany"
    />
  );
}

function NewProfileRoute() {
  return (
    <Empty
      description="Formularz profilu powstaje w FE-001-F3: obraz referencyjny, rysowanie regionów HUD i klasy bazowe oraz per gra."
      title="Tworzenie profilu nie jest jeszcze zbudowane"
    />
  );
}

function MaterialsRoute() {
  return (
    <Empty
      description="Ekran materiałów powstaje w FE-001-F2: import lokalnego pliku wideo, wybór profilu, interwał próbkowania i uruchomienie runu."
      title="Materiały nie są jeszcze zbudowane"
    />
  );
}

function AnnotationsRoute() {
  // `runId` comes from the URL and nowhere else — the backend stays the only
  // source of durable state (FE-04).
  const { runId } = useParams<{ runId: string }>();

  return (
    <Empty
      description={`Weryfikacja klatek powstaje w FE-001-F4. Run z adresu: ${runId ?? "brak"}.`}
      title="Weryfikacja nie jest jeszcze zbudowana"
    />
  );
}

function ExportsRoute() {
  return (
    <Empty
      description="Ekran eksportów powstaje w FE-001-F5: uruchomienie eksportu COCO, status, manifest i ścieżka wyniku."
      title="Eksporty nie są jeszcze zbudowane"
    />
  );
}

function NotFoundRoute() {
  return (
    <Empty
      description="Ten adres nie należy do żadnej z pięciu tras aplikacji. Wybierz destynację z nawigacji."
      title="Nie ma takiej trasy"
    />
  );
}

export const appRoutes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardRoute />, handle: { heading: "Dashboard" } },
      {
        path: "profiles/new",
        element: <NewProfileRoute />,
        handle: { heading: "Nowy profil gry" },
      },
      { path: "materials", element: <MaterialsRoute />, handle: { heading: "Materiały" } },
      {
        path: "annotations/:runId",
        element: <AnnotationsRoute />,
        handle: { heading: "Anotacje" },
      },
      { path: "exports", element: <ExportsRoute />, handle: { heading: "Eksporty" } },
      { path: "*", element: <NotFoundRoute />, handle: { heading: "Nieznana trasa" } },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(appRoutes);
}
