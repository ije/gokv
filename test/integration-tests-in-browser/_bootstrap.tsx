/// <reference lib="dom" />
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import TestDocument from "./TestDocument.tsx";

createRoot(document.getElementById("root")!).render(
  createElement(TestDocument),
);
