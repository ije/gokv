/// <reference lib="dom" />
/** @jsx createElement */
/** @jsxFrag Fragment */
import type { FC, ReactNode } from "react";
import { createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import TestChatRoom from "./TestChatRoom.tsx";
import TestDocument from "./TestDocument.tsx";
import TestFileStorage from "./TestFileStorage.tsx";
import TestImage from "./TestImage.tsx";
import TestKVStorage from "./TestKVStorage.tsx";

const tests: [string, FC, ReactNode][] = [
  [
    "/test-chatroom",
    TestChatRoom,
    <>
      Test <code>`ChatRoom`</code> class
    </>,
  ],
  [
    "/test-document",
    TestDocument,
    <>
      Test <code>`Document`</code> class
    </>,
  ],
  [
    "/test-filestorage",
    TestFileStorage,
    <>
      Test <code>`FileStorage`</code> class
    </>,
  ],
  [
    "/test-image",
    TestImage,
    <>
      Test <code>`Image`</code> component
    </>,
  ],
  [
    "/test-kvstorage",
    TestKVStorage,
    <>
      Test <code>`TestKVStorage`</code> class
    </>,
  ],
];

// use api.gokv.dev endpoint for integration test
localStorage.setItem("GOKV_ENV", "development");

const routes: Record<string, FC> = {
  "/": () => {
    const authInfo = JSON.parse(document.getElementById("auth-info")?.textContent ?? "{}");
    return (
      <>
        <header>
          <h1>Gokv Testing</h1>
          {authInfo.user && (
            <p>
              Signed in as <img src={authInfo.user.avatarUrl} /> <strong>{authInfo.user.name}</strong> with{" "}
              <em>{authInfo.provider}</em>
            </p>
          )}
          {!authInfo.user && (
            <p>
              <a href="/login">Login</a>
            </p>
          )}
        </header>
        <ul>
          {tests.map(([path, _, children]) => (
            <li key={path}>
              <a href={path}>{children}</a>
            </li>
          ))}
        </ul>
      </>
    );
  },
  ...tests.reduce((acc, [path, Component]) => ({ ...acc, [path]: Component }), {}),
};

createRoot(document.getElementById("root")!).render(
  createElement(routes[location.pathname] ?? <p>Page not found</p>),
);
