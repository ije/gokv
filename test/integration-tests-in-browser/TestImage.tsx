/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement, useState } from "react";
import { Image } from "gokv/react";
import { JSONViewer } from "./_components.tsx";

export default function TestImage() {
  const [mode, setMode] = useState(0);
  const [image, setImage] = useState<{ src?: string; alt?: string }>({});

  return (
    <div className="flex">
      <div className="w-half">
        <h3>Image Display</h3>
        <div className="flex" style={{ gap: 8, marginBottom: 16 }}>
          fit mode:
          <label>
            <input type="radio" name="mode" checked={mode === 0} onChange={() => setMode(0)} />
            cover
          </label>
          <label>
            <input type="radio" name="mode" checked={mode === 1} onChange={() => setMode(1)} />
            contain
          </label>
          <label>
            <input type="radio" name="mode" checked={mode === 2} onChange={() => setMode(2)} />
            dynamic
          </label>
        </div>
        {mode === 0 && (
          <Image
            width={240}
            height={240}
            src={image.src}
            alt={image.alt}
          />
        )}
        {mode === 1 && (
          <Image
            width={240}
            height={240}
            src={image.src}
            alt={image.alt}
            fit="contain"
          />
        )}
        {mode === 2 && (
          <Image
            width={240}
            src={image.src}
            alt={image.alt}
          />
        )}
        <h3>Image Upload</h3>
        <Image
          width={240}
          height={240}
          placeholder="Select or drag an image"
          src={image.src}
          alt={image.alt}
          onChange={setImage}
          contentEditable
        />
      </div>
      <div className="w-half">
        <h3>State</h3>
        <JSONViewer data={{ image }} />
      </div>
    </div>
  );
}
