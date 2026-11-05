export const __state = { pathname: "/app" };
export const usePathname = () => (globalThis as { __PATH?: string }).__PATH ?? "/app";
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, back() {} });
export const useSearchParams = () => new URLSearchParams();
export const redirect = (to: string): never => { throw new Error(`redirect:${to}`); };
export const notFound = (): never => { throw new Error("notFound"); };
