import { AppEmptyState, AppPageHeader } from "./design-system";

export function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <>
      {title && <AppPageHeader title={title} />}
      <AppEmptyState text={text} />
    </>
  );
}
