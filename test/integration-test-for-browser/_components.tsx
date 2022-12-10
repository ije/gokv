/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement, Fragment, useCallback, useEffect, useState } from "react";
import { useSnapshot } from "gokv/react";

export function TextInput(props: { value: string; onChange: (value: string) => void }) {
  const [value, setValue] = useState(props.value);

  // deno-lint-ignore no-explicit-any
  const onChange = useCallback((e: any) => {
    const value = e.currentTarget.value;
    setValue(value);
    props.onChange(value);
  }, []);

  useEffect(() => {
    setValue(props.value);
  }, [props.value]);

  return <input type="text" value={value} onChange={onChange} />;
}

export function JSONViewer({ data, indent = 2 }: { data: Record<string, unknown> | unknown[]; indent?: number }) {
  const snap = useSnapshot(data);
  const isArray = Array.isArray(snap);
  const sym = isArray ? "[]" : "{}";
  const len = isArray ? snap.length : Object.keys(snap).length;
  if (len === 0) {
    return <code>{sym}</code>;
  }
  const viewer = (
    <>
      <code>{sym[0]}</code>
      <br />
      {Object.entries(snap).map(([key, value], i) => {
        if (typeof value === "object" && value !== null) {
          return (
            <Fragment key={key}>
              <code>
                {" ".repeat(indent)}
                <span className="key">{key}</span>
                <span className="colon">{": "}</span>
              </code>
              <JSONViewer data={(data as Record<string, unknown>)[key] as typeof data} indent={indent + 2} />
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
