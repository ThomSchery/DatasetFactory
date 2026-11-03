import { createBrowserRouter, type RouteObject } from "react-router";
import { lazy, Suspense } from "react";

import { Empty, Loading } from "../components/common/UiStates";
import { AnnotationReviewScreen, RunListScreen } from "../features/annotations";
import { DashboardScreen } from "../features/dashboard";
import { MaterialsScreen, RunSetupScreen } from "../features/materials";
import { ProfilesScreen } from "../features/profiles";
import { AppShell } from "./AppShell";

const ExportsScreen = lazy(() =>
  import("../features/exports").then((module) => ({ default: module.ExportsScreen })),
);

/*
 * The FE-04 routes plus `/run`, which FE-021 split out of `/materials` so the
 * Upload and Run steps of the Figma switch open different screens, plus a
 * catch-all for unknown paths. Every earlier address still resolves, so deep
 * links kept from before the redesign keep working.
 *
 * `handle.heading` feeds the shell's `<h1>` so the heading and the route stay
 * defined in one place.
 */

function NotFoundRoute() {
  return (
    <Empty
      description="Ten adres nie należy do żadnej z pięciu tras aplikacji. Wybierz destynację z nawigacji."
      title="Nie ma takiej trasy"
    />
  );
}

function ExportsRoute() {
  return (
    <Suspense fallback={<Loading label="Ładowanie ekranu eksportów…" />}>
      <ExportsScreen />
    </Suspense>
  );
}

export const appRoutes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardScreen />, handle: { heading: "Dashboard" } },
      {
        path: "profiles",
        element: <ProfilesScreen />,
        handle: { heading: "Profile gier" },
      },
      {
        path: "profiles/new",
        element: <ProfilesScreen initialCreate />,
        handle: { heading: "Nowy profil gry" },
      },
      { path: "materials", element: <MaterialsScreen />, handle: { heading: "Materiały" } },
      { path: "run", element: <RunSetupScreen />, handle: { heading: "Run Setup" } },
      { path: "annotations", element: <RunListScreen />, handle: { heading: "Anotacje" } },
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
