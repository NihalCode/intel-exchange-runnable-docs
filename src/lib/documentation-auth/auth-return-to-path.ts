/** Path to return to after Auth0 login — never bounce back to auth UX routes. */
export function authReturnToFromPath(pathname: string): string {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return "/";
  if (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/access") ||
    pathname.startsWith("/post-login") ||
    pathname.startsWith("/invite")
  ) {
    return "/";
  }
  return pathname;
}
