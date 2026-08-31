import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.05,
  sendDefaultPii: false,
  initialScope: {
    tags: { application: "patient-web", data_classification: "no-phi" },
  },
  beforeSend(event) {
    delete event.user;
    delete event.request;
    delete event.breadcrumbs;
    delete event.extra;
    delete event.message;
    event.exception?.values?.forEach((value) => {
      value.value = "Application error";
    });
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
