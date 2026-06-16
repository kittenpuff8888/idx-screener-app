import { Card } from "./Card";

export function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border-negative/30 bg-negative/10">
      <h3 className="font-semibold text-negative">Unable to load this view</h3>
      <p className="mt-2 text-sm text-text">{message}</p>
    </Card>
  );
}
