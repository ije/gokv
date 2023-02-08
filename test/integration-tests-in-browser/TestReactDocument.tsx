/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement, Fragment, useState } from "react";
import { DocumentProvider, useConnectState, useDocument, useSnapshot } from "gokv/react";
import { ErrorBoundary, JSONViewer, TextInput } from "./_components.tsx";

export function TestReactDocument() {
  return (
    <>
      <div style={{ minHeight: 300 }}>
        <DocumentApp name="Session #1" id="dev-doc" />
      </div>
      <Hr />
      <div style={{ minHeight: 300 }}>
        <DocumentApp name="Session #2" id="dev-doc" />
      </div>
    </>
  );
}

const iconAdd = (
  <svg width="32" height="32" viewBox="0 0 32 32">
    <path
      fill="currentColor"
      d="M16 4c6.6 0 12 5.4 12 12s-5.4 12-12 12S4 22.6 4 16S9.4 4 16 4m0-2C8.3 2 2 8.3 2 16s6.3 14 14 14s14-6.3 14-14S23.7 2 16 2z"
    />
    <path fill="currentColor" d="M24 15h-7V8h-2v7H8v2h7v7h2v-7h7z" />
  </svg>
);

const iconRemove = (
  <svg width="32" height="32" viewBox="0 0 32 32">
    <path
      fill="currentColor"
      d="M16 2C8.2 2 2 8.2 2 16s6.2 14 14 14s14-6.2 14-14S23.8 2 16 2zm0 26C9.4 28 4 22.6 4 16S9.4 4 16 4s12 5.4 12 12s-5.4 12-12 12z"
    />
    <path
      fill="currentColor"
      d="M21.4 23L16 17.6L10.6 23L9 21.4l5.4-5.4L9 10.6L10.6 9l5.4 5.4L21.4 9l1.6 1.6l-5.4 5.4l5.4 5.4z"
    />
  </svg>
);

function TagInput({ tags }: { tags: string[] }) {
  const snap = useSnapshot(tags);
  const [tag, setTag] = useState("");

  const addTag = () => {
    if (tag) {
      tags.push(tag);
      setTag("");
    }
  };

  const removeTag = (index: number) => {
    tags.splice(index, 1);
  };

  return (
    <div className="tag-input">
      {snap.map((tag, i) => (
        <section>
          <TextInput value={tag} onChange={(v) => tags[i] = v} />
          <button onClick={() => removeTag(i)}>{iconRemove}</button>
        </section>
      ))}
      <section>
        <input
          type="text"
          name="tag"
          value={tag}
          onChange={(e) => setTag(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && addTag()}
        />
        <button onClick={addTag}>{iconAdd}</button>
      </section>
    </div>
  );
}

function DocumentApp({ name, id }: { name: string; id: string }) {
  return (
    <ErrorBoundary>
      <DocumentProvider id={id} fallback={<div>Loading...</div>}>
        <DocumentAppUI name={name} />
      </DocumentProvider>
    </ErrorBoundary>
  );
}

function DocumentAppUI({ name }: { name: string }) {
  const doc = useDocument<{ foo: string; words: string[] }>();
  const foo = useSnapshot(doc, "foo");
  const connectState = useConnectState();

  return (
    <div className="flex">
      <div className="w-half">
        <h3>
          Document Editor <em>{name}, {connectState === "connected" ? "Online" : "Offline"}</em>
        </h3>
        <p>
          <label>
            <code>&nbsp;&nbsp;foo:</code>
            <TextInput value={foo} onChange={(v) => doc.foo = v} key="foo" />
          </label>
        </p>
        <p>
          <label>
            <code>words:</code>
            <TagInput tags={doc.words} />
          </label>
        </p>
      </div>
      <div className="w-half">
        <h3>State</h3>
        <JSONViewer data={doc} />
      </div>
    </div>
  );
}

function Hr() {
  return <div style={{ width: "100%", height: 1, backgroundColor: "#eee", margin: "48px 0" }} />;
}
