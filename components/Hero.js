```jsx
import Link from 'next/link';

export default function Hero() {
  return (
    <section className="bg-blue-100 py-16 px-4 text-center">
      <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-4">
        Unlock AI for Your Small Business, Securely
      </h1>
      <p className="text-xl text-gray-600 mb-8">
        Harness big company AI APIs while safeguarding your data, privacy, and competitive edge.
      </p>
      <Link href="/contact">
        <a className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition">
          Get Started
        </a>
      </Link>
    </section>
  );
}
```
