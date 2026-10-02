"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

export interface QrVerifyProps {
  payload: string;
  documentId: string;
  size?: number;
}

export function QrVerify({ payload, documentId, size = 68 }: QrVerifyProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(payload, {
      width: size,
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#173f3b", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl(null);
      });

    return () => {
      active = false;
    };
  }, [payload, size]);

  return (
    <div className="pmr-qr-wrapper">
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={`Verification QR code for document ${documentId}`}
          width={size}
          height={size}
          style={{ display: "block" }}
        />
      ) : (
        <div
          style={{
            width: size,
            height: size,
            background: "#eee",
            border: "1px solid #ccc",
          }}
          aria-label="Generating verification QR"
        />
      )}
      <div style={{ fontSize: "7pt", color: "#444" }}>
        <strong>Scan to Verify Authenticity</strong>
        <div>Doc ID: {documentId}</div>
        <div>SHA-256 Non-Repudiation</div>
      </div>
    </div>
  );
}
