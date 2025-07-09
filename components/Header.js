```jsx
import Link from 'next/link';

export default function Header() {
  return (
    <header className="bg-blue-600 text-white p-4">
      <nav className="container mx-auto flex justify-between items-center">
        <Link href="/">
          <a className="text-2xl font-bold">AIEdge Solutions</a>
        </Link>
        <ul className="flex space-x-6">
          <li><Link href="/"><a className="hover:underline">Home</a></Link></li>
          <li><Link href="/about"><a className="hover:underline">About</a></Link></li>
          <li><Link href="/services"><a className="hover:underline">Services</a></Link></li>
          <li><Link href="/contact"><a className="hover:underline">Contact</a></Link></li>
        </ul>
      </nav>
    </header>
  );
}
```
