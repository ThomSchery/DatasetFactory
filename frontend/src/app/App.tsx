import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RouterProvider } from "react-router";

import { createQueryClient } from "./queryClient";
import { createAppRouter } from "./routes";

/**
 * Composition root of the frontend: cache and router.
 *
 * FE-021 removed the width guard that used to sit between them. FE-07 refused
 * anything under 1280 px rather than squeezing the layout; the user's design
 * specifies 360 px upwards, so the shell now lays out at every width instead
 * of replacing itself with a message.
 */
export function App() {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createAppRouter);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
