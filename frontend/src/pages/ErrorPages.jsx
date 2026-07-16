import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

function ErrorLayout({ code, title, message }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">Error</div>
      <div className="mt-3 text-7xl font-display font-bold tracking-tight">{code}</div>
      <h1 className="mt-4 text-2xl font-display font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted-foreground text-sm max-w-md">{message}</p>
      <Button asChild className="mt-6" data-testid={`goto-home-${code}`}><Link to="/">Back to workspace</Link></Button>
    </div>
  );
}

export const UnauthorizedPage = () => (
  <ErrorLayout code="401" title="Sign in required" message="You need to be signed in to view this page." />
);
export const ForbiddenPage = () => (
  <ErrorLayout code="403" title="Not allowed" message="Your account role does not have access to this resource." />
);
export const NotFoundPage = () => (
  <ErrorLayout code="404" title="Page not found" message="The page you're looking for doesn't exist or has moved." />
);
export const ServerErrorPage = () => (
  <ErrorLayout code="500" title="Something went wrong" message="An unexpected error occurred. Please try again." />
);
