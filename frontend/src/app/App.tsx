import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RouterProvider } from "react-router";

import { WidthGuard } from "./WidthGuard";
import { createQueryClient } from "./queryClient";
import { createAppRouter } from "./routes";

/**
 * Composition root of the frontend: cache, width guard and router, in that
 * order. The guard sits above the router so a narrow window states the
 * problem instead of rendering a squeezed shell behind it (FE-07).
 */
export function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createAppRouter);

  return (
    <QueryClientProvider client={queryClient}>
      <WidthGuard>
        <RouterProvider router={router} />
      </WidthGuard>
    </QueryClientProvider>
  );
}
