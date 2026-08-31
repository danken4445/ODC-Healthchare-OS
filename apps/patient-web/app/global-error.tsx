"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { application: "patient-web", boundary: "global-error" },
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <h1>Something went wrong.</h1>
        <p>Please try again. If the problem continues, contact your clinic.</p>
      </body>
    </html>
  );
}
