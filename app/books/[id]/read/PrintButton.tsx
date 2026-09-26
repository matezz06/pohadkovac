"use client";
export default function PrintButton() {
  return <button className="primary" onClick={() => window.print()}>Tisk / Uložit PDF</button>;
}
