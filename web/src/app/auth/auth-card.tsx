import type { ReactNode } from "react";

// Same visual frame as /login for the public account pages.
export function AuthCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#0D2137_0%,#1A3A5C_50%,#0F2D4A_100%)] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-pop">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-white">D</div>
          <h1 className="text-xl font-extrabold tracking-wide text-t1">{title}</h1>
          {description && <p className="mt-1 text-sm text-t2">{description}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
