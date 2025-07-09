```jsx
export default function handler(req, res) {
  if (req.method === 'POST') {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (!/^\S+@\S+$/i.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    console.log('Contact Submission:', { name, email, message });
    return res.status(200).json({ message: 'Message received successfully' });
  } else {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
```
