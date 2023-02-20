/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement } from "react";
import { ChatRoomProvider, useConnectState } from "gokv/react";
import { ErrorBoundary, JSONViewer, TextInput } from "./_components.tsx";

export default function TestChatRoom() {
  return (
    <div>
      Test `ChatRoom` with React
    </div>
  );
}
