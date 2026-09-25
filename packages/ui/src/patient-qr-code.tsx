"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export interface PatientQrCodeProps {
  payload: string;
  size?: number;
}

export function PatientQrCode({ payload, size = 120 }: PatientQrCodeProps) {
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSource(null);
    void QRCode.toDataURL(payload, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#173f3b", light: "#ffffff" },
    })
      .then((value) => {
        if (active) setSource(value);
      })
      .catch(() => {
        if (active) setSource(null);
      });
    return () => {
      active = false;
    };
  }, [payload, size]);

  return (
    <div className="odyssey-patient-qr" style={{ width: size, height: size }}>
      {source ? (
        <img
          alt="Patient identification QR code"
          height={size}
          src={source}
          width={size}
        />
      ) : (
        <span
          aria-label="Preparing patient identification QR code"
          role="status"
        />
      )}
    </div>
  );
}
