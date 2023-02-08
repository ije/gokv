/// <reference lib="dom" />
/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement, type FC, Fragment, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { TestReactChatRoom } from "./TestReactChatRoom.tsx";
import { TestReactDocument } from "./TestReactDocument.tsx";
import { TestReactImage } from "./TestReactImage.tsx";

// use api.gokv.dev endpoint for integration test
localStorage.setItem("GOKV_ENV", "development");

const integrationTests = [
  ["KV Storage", "./TestKVStorage.ts"],
  ["File Storage", "./TestFileStorage.ts"],
];

interface Task {
  name: string;
  desc?: string;
  done: boolean;
  duration?: number;
  error?: string;
  hidden?: boolean;
}

function Index() {
  return (
    <ul>
      <li>
        <a href="/integration">Integration Testings</a>
      </li>
      <li>
        <a href="/test-react-chatroom">
          Test `ChatRoom` with React
        </a>
      </li>
      <li>
        <a href="/test-react-document">
          Test `Document` with React
        </a>
      </li>
      <li>
        <a href="/test-react-image">
          Test `FileStorage` with React
        </a>
      </li>
    </ul>
  );
}

function IntegrationTest() {
  const [tasks, setTasks] = useState<Task[]>([]);

  async function test(name: string, src: string | CallableFunction, desc?: string) {
    setTasks((tasks) => [...tasks, { name, desc, done: false }]);
    const subTasks: [string, CallableFunction][] = [];
    let duration: number | undefined;
    let error: string | undefined;
    let hidden: boolean | undefined;
    try {
      const { test: testFn, ...rest } = typeof src === "string" ? await import(src) : { test: src };
      if (typeof testFn === "function") {
        const t = Date.now();
        await testFn();
        duration = Date.now() - t;
      } else {
        hidden = true;
      }
      for (const [key, value] of Object.entries(rest)) {
        if (key.startsWith("test_") && typeof value === "function") {
          subTasks.push([key.slice(5), value]);
        }
      }
    } catch (e) {
      console.error(e);
      error = e.message;
    }
    setTasks((tasks) =>
      tasks.map((task) => {
        if (task.name === name && task.desc === desc) {
          return { ...task, done: true, duration, error, hidden };
        }
        return task;
      })
    );
    for (const [desc, fn] of subTasks) {
      await test(name, fn, desc);
    }
  }

  useEffect(() => {
    (async () => {
      for (const [name, module] of integrationTests) {
        await test(name, module);
      }
    })();
  }, []);

  return (
    <>
      <h2>Integration Testing</h2>
      <ul>
        {tasks.filter((t) => !t.hidden).map((task) => (
          <li id={task.name}>
            <strong>{task.name} {task.desc && <em>({task.desc})</em>}</strong>
            &nbsp;
            {!task.done && <em>testing...</em>}
            {task.done && !task.error && (
              <span>
                ✅{" "}
                {task.duration && (
                  <em>{task.duration >= 1000 ? (task.duration / 1000).toFixed(1) + "s" : task.duration + "ms"}</em>
                )}
              </span>
            )}
            {task.done && task.error && <span style={{ color: "red" }}>❌ {task.error}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}

const routes: Record<string, FC> = {
  "/": Index,
  "/integration": IntegrationTest,
  "/test-react-chatroom": TestReactChatRoom,
  "/test-react-document": TestReactDocument,
  "/test-react-image": TestReactImage,
};

createRoot(document.getElementById("root")!).render(
  createElement(routes[location.pathname] ?? <p>Page not found</p>),
);
