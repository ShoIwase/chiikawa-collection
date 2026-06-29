"use client";

import Image from "next/image";

type Props = {
  src: string;
  alt: string;
  onClose: () => void;
};

export default function ImageLightbox({ src, alt, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/85 z-50 flex flex-col items-center justify-center px-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="閉じる"
        className="absolute top-5 right-5 text-white text-3xl leading-none"
      >
        ✕
      </button>

      <div
        className="relative w-full max-w-xs aspect-square"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={src}
          alt={alt}
          fill
          className="object-contain"
          unoptimized
        />
      </div>

      <p
        className="mt-4 text-white text-sm text-center max-w-xs"
        onClick={(e) => e.stopPropagation()}
      >
        {alt}
      </p>
    </div>
  );
}
