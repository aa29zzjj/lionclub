import { QRCodeSVG } from "qrcode.react";

export default function QrCode({ value }: { value: string }) {
  return (
    <QRCodeSVG
      value={value}
      size={200}
      level="M"
      marginSize={4}
      bgColor="#FFFFFF"
      fgColor="#12224A"
      title="QR Code"
      className="h-full w-full"
    />
  );
}
