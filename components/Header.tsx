import Link from "next/link";

export default function Header({ right }: { right?: React.ReactNode }) {
  return (
    <header className="top">
      <h1><Link href="/">📖 Pohádkovač</Link></h1>
      <div className="row">
        {right}
        <Link className="btn" href="/settings">Nastavení</Link>
      </div>
    </header>
  );
}
