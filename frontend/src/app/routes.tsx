import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { lazy, Suspense } from "react";

import { Empty, Loading } from "../components/common/UiStates";
import { AnnotationReviewScreen, RunListScreen } from "../features/annotations";
import { MaterialsScreen, RunSetupScreen } from "../features/materials";
import { ProfileWorkspaceScreen } from "../features/profiles";
import { AppShell } from "./AppShell";

const ExportsScreen = lazy(() =>
  import("../features/exports").then((module) => ({ default: module.ExportsScreen })),
);

/*
 * FE-022 removed the Dashboard: `/` opens Upload. Every other address that
 * existed before still resolves, so deep links keep working, and unknown
 * paths get a named empty state.
 *
 * `handle.heading` names the page for assistive technology; `headingInScreen`
 * marks the two screens that draw their own visible heading (Figma: "Run
 * Setup", "Review frames").
 */

function NotFoundRoute() {
  return (
    <Empty
      description="This address does not belong to any screen. Choose a section from the side bar."
      title="No such page"
    />
  );
}

function ExportsRoute() {
  return (
    <Suspense fallback={<Loading label="Loading the exports screen…" />}>
      <ExportsScreen />
    </Suspense>
  );
}

export const appRoutes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate replace to="/materials" /> },
      {
        path: "profiles",
        element: <ProfileWorkspaceScreen />,
        handle: { heading: "Setup for scan" },
      },
      {
        path: "profiles/new",
        element: <ProfileWorkspaceScreen initialCreate />,
        handle: { heading: "New profile" },
      },
      { path: "materials", element: <MaterialsScreen />, handle: { heading: "Upload" } },
      {
        path: "run",
        element: <RunSetupScreen />,
        handle: { heading: "Run Setup", headingInScreen: true },
      },
      { path: "annotations", element: <RunListScreen />, handle: { heading: "Annotations" } },
      {
        path: "annotations/:runId",
        element: <AnnotationReviewScreen />,
        handle: { heading: "Review frames", headingInScreen: true },
      },
      { path: "exports", element: <ExportsRoute />, handle: { heading: "Exports" } },
      { path: "*", element: <NotFoundRoute />, handle: { heading: "Unknown page" } },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(appRoutes);
}
