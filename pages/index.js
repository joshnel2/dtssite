```jsx
import Hero from '../components/Hero';

export default function Home() {
  return (
    <div>
      <Hero />
      <div className="container mx-auto py-12 px-4 text-center">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">
          Why Choose AIEdge Solutions?
        </h2>
        <p className="text-lg text-gray-600">
          We provide secure, scalable AI integration for small businesses, protecting your data and
          enhancing your competitive edge with top-tier API solutions.
        </p>
      </div>
    </div>
  );
}
```

**File Path: pages/privacy-policy.js**
(Content to copy:
```jsx
export default function PrivacyPolicy() {
  return (
    <div className="container mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Privacy Policy</h1>
      <p className="text-lg text-gray-600 mb-4">
        At AIEdge Solutions, we prioritize your data privacy. We implement industry-leading security
        measures to protect your information while using AI APIs.
      </p>
      <p className="text-lg text-gray-600 mb-4">
        Contact us for details on our data protection policies and how we ensure your business’s security.
      </p>
    </div>
  );
}
```

**File Path: pages/services.js**
(Content to copy:
```jsx
export default function Services() {
  return (
    <div className="container mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Our Services</h1>
      <ul className="list-disc list-inside text-lg text-gray-600 space-y-2">
        <li>Secure AI API integration for small businesses</li>
        <li>Data encryption and privacy protection</li>
        <li>Customized AI solutions to maintain industry edge</li>
        <li>Ongoing support and scalability consulting</li>
      </ul>
    </div>
  );
}
```
