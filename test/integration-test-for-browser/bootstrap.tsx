/** @jsx createElement  */
import { createElement, useEffect, useState } from "react";
import { render } from "react-dom";

const tests = [
  ["foo", "./foo.ts"],
];

interface Task {
  name: string;
  done: boolean;
  duration?: number;
  error?: string;
}

function TestApp() {
  const [tasks, setTasks] = useState<Task[]>([]);

  async function test(name: string, module: string) {
    setTasks((tasks) => [...tasks, { name, done: false }]);
    let duration: number | undefined;
    let error: string | undefined;
    try {
      const { test: testFn } = await import(module);
      const t = Date.now();
      await testFn();
      duration = Date.now() - t;
    } catch (e) {
      error = e.message;
    }
    setTasks((tasks) =>
      tasks.map((task) => {
        if (task.name === name) {
          return { ...task, done: true, duration, error };
        }
        return task;
      })
    );
  }

  useEffect(() => {
    (async () => {
      for (const [name, module] of tests) {
        await test(name, module);
      }
    })();
  }, []);

  return (
    <div>
      <h1>Gokv Testing</h1>
      <ul>
        {tasks.map((task) => (
          <li id={task.name}>
            <strong>{task.name}</strong>
            {!task.done && <em>testing...</em>}
            {task.done && !task.error && <span>✅ {task.duration !== undefined && <em>{task.duration}ms</em>}</span>}
            {task.done && task.error && <span style={{ color: "red" }}>❌ {task.error}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

render(<TestApp />, document.getElementById("root"));
