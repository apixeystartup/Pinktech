import { createContext, useContext } from "react";

/**
 * The film clock is shared through context rather than props so that any scene
 * or primitive can read the current time without prop drilling. It lives in its
 * own module because react-refresh requires component-only files.
 */
export const DemoClockContext = createContext(null);

export function useClock() {
  return useContext(DemoClockContext);
}