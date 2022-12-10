/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement, Fragment } from "react";

export function JSONViewer(
  { data, indent = 2 }: { data: Record<string, unknown> | unknown[]; indent?: number },
) {
  const isArray = Array.isArray(data);
  const sym = isArray ? "[]" : "{}";
  const len = isArray ? data.length : Object.keys(data).length;
  if (len === 0) {
    return <code>{sym}</code>;
  }
  const viewer = (
    <>
      <code>{sym[0]}</code>
      <br />
      {Object.entries(data).map(([key, value], i) => {
        if (typeof value === "object" && value !== null) {
          return (
            <Fragment key={key}>
              <code>
                {" ".repeat(indent)}
                <span className="key">{key}</span>
                <span className="colon">{": "}</span>
              </code>
              <JSONViewer data={value as typeof data} indent={indent + 2} />
              {i < len - 1 && <code className="comma">,</code>}
              <br />
            </Fragment>
          );
        }
        return (
          <Fragment key={key}>
            <code>
              {" ".repeat(indent)}
              <span className="key">{key}</span>
              <span className="colon">{": "}</span>
              <span className={"value " + typeof value}>{String(value)}</span>
              {i < len - 1 && <span className="comma">,</span>}
            </code>
            <br />
          </Fragment>
        );
      })}
      <code>{" ".repeat(indent - 2) + sym[1]}</code>
    </>
  );
  if (indent === 2) {
    return (
      <div className="json-viewer info">
        <pre>{viewer}</pre>
      </div>
    );
  }
  return viewer;
}