// TypeScript React Rule File
// This file demonstrates support for .tsx files

export const rule = {
  name: "typescript-react-best-practices",
  description: "Best practices for TypeScript React development",
  rules: [
    "Always use TypeScript for type safety",
    "Prefer functional components with hooks",
    "Use proper typing for props and state",
  ],
};

// Example component structure
interface ComponentProps {
  title: string;
  count: number;
}

export const ExampleComponent: React.FC<ComponentProps> = ({ title, count }) => {
  return (
    <div>
      <h1>{title}</h1>
      <p>Count: {count}</p>
    </div>
  );
};

