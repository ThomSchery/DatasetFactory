import { createBrowserRouter, type RouteObject } from "react-router";

import { Empty } from "../components/common/UiStates";
import { AnnotationReviewScreen } from "../features/annotations";
import { DashboardScreen } from "../features/dashboard";
import { MaterialsScreen } from "../features/materials";
import { ProfileCreateScreen } from "../features/profiles";
import { AppShell } from "./AppShell";

/*
 * Exactly the five FE-04 routes plus a catch-all for unknown paths. The
 * dashboard and materials screens landed in FE-001-F2 and profile creation in
 * FE-001-F3; the remaining two still render an explicit empty state naming the
 * ticket that builds them.
 *
 * `handle.heading` feeds the shell's `<h1>` so the heading and the route stay
 * defined in one place.
 */

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
      { index: true, element: <DashboardScreen />, handle: { heading: "Dashboard" } },
      {
        path: "profiles/new",
        element: <ProfileCreateScreen />,
        handle: { heading: "Nowy profil gry" },
      },
      { path: "materials", element: <MaterialsScreen />, handle: { heading: "Materiały" } },
      {
        path: "annotations/:runId",
        element: <AnnotationReviewScreen />,
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
