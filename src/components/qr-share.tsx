"use client";

import { useRef } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { Download, Printer } from "lucide-react";

type QrShareProps = {
  url: string;
  stageName: string;
  slug: string;
};

// Shows the musician's QR code with download (PNG) and print options.
// The print sheet is hidden on screen and is the only thing printed (see globals.css).
export function QrShare({ url, stageName, slug }: QrShareProps) {
  const canvasWrap = useRef<HTMLDivElement>(null);
  const displayUrl = url.replace(/^https?:\/\//, "");

  function download() {
    const canvas = canvasWrap.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `qr-code-${slug}.png`;
    link.click();
  }

  return (
    <>
      <div className="qr-frame"><QRCodeSVG value={url} size={140} level="M" marginSize={2} title={`QR code para ${displayUrl}`} /></div>
      <span className="qr-url">{displayUrl}</span>
      <div className="qr-actions">
        <button className="button button-outline button-small" type="button" onClick={download}><Download size={14} /> Baixar imagem</button>
        <button className="button button-outline button-small" type="button" onClick={() => window.print()}><Printer size={14} /> Imprimir</button>
      </div>

      <div ref={canvasWrap} hidden aria-hidden="true">
        <QRCodeCanvas value={url} size={1024} level="M" marginSize={4} />
      </div>

      <div className="qr-print-sheet" aria-hidden="true">
        <p className="qr-print-kicker">Peça sua música</p>
        <h2>{stageName}</h2>
        <QRCodeSVG value={url} size={360} level="M" marginSize={2} />
        <p>Aponte a câmera do celular para o código e escolha uma música do repertório.</p>
        <p className="qr-print-url">{displayUrl}</p>
      </div>
    </>
  );
}
