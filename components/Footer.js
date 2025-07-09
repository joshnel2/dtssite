```jsx
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-800 text-white p-4">
      <div className="container mx-auto text-center">
        <p>© 2025 AIEdge Solutions. All rights reserved.</p>
        <ul className="flex justify-center space-x-4 mt-2">
          <li><Link href="/privacy-policy"><a className="hover:underline">Privacy Policy</a></Link></li>
          <li><Link href="/terms-of-service"><a className="hover:underline">Terms of Service</a></Link></li>
        </ul>
      </div>
    </footer>
  );
}
```
