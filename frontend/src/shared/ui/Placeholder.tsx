export function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">{title}</h1>
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-slate-600">{text}</p>
      </section>
    </>
  );
}
