"use client";

import { useState } from "react";

type VerifiedMediaImageProps = Readonly<{
  src: string;
  className: string;
  width: number;
  height: number;
}>;

export function VerifiedMediaImage({
  src,
  className,
  width,
  height,
}: VerifiedMediaImageProps) {
  const [unavailable, setUnavailable] = useState(false);
  if (unavailable) return null;

  return (
    // The protected, same-origin endpoint needs the viewer's session cookie. The
    // Next image optimizer does not forward it, so it cannot be used here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      className={className}
      width={width}
      height={height}
      alt=""
      aria-hidden="true"
      decoding="async"
      onError={() => setUnavailable(true)}
    />
  );
}
