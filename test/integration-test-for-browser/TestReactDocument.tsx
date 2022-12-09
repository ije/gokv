/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement, Fragment } from "react";
import { useDocument, useSnapshot } from "gokv/react";
import { JSONViewer } from "./_components.tsx";

export function TestReactDocument() {
  return (
    <>
      <DocumentApp />
      <Hr />
      <DocumentApp />
    </>
  );
}

function DocumentApp() {
  const { doc, loading, error } = useDocument<{ foo: string }>("dev-doc");
  const snap = useSnapshot(doc);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div className="info info-error">Error: {error.message}</div>;
  }

  return (
    <div className="flex">
      <div className="w-half">
        <h3>Editor</h3>
        <div>
          <label>
            <span>Foo:</span>
            <input value={snap.foo} onChange={(e) => doc.foo = e.currentTarget.value} />
          </label>
        </div>
      </div>
      <div className="w-half">
        <h3>State</h3>
        <JSONViewer data={snap} />
      </div>
    </div>
  );
}

function Hr() {
  return <div style={{ width: "100%", height: 1, backgroundColor: "#eee", margin: "48px 0" }} />;
}
