import type { ConnectState } from "../../types/react.d.ts";
import { createContext, createElement, useContext, useState } from "react";

export const ConnectStateContext = createContext<{ state: ConnectState; setState: (state: ConnectState) => void }>({
  state: "connecting",
  setState: () => {},
});

export function ConnectStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConnectState>("connecting");
  return createElement(ConnectStateContext.Provider, { value: { state, setState } }, children);
}

export const useConnectState = (): ConnectState => {
  const { state } = useContext(ConnectStateContext);
  return state;
};
