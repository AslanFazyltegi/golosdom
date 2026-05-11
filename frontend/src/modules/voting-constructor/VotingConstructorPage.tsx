import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { Placeholder } from "@/shared/ui/Placeholder";

export function VotingConstructorPage(props: CabinetModuleProps) {
  const isChairman = props.activeRole === "CHAIRMAN";
  const isAdmin = props.activeRole === "SYSTEM_ADMIN";

  const titleMap: Record<string, string> = {
    voting_constructor: "Конструктор голосования",
    voting_constructor_create: "Создать новый опросный лист",
    voting_constructor_approval: "На утверждении у совета дома",
    voting_constructor_revision: "На доработке",
    voting_constructor_pending_publication: "Ожидающие публикации",
    voting_constructor_published: "Опубликованные",
    voting_constructor_draft: "Черновик",
  };

  const pageTitle =
    titleMap[props.activeComponent] || "Конструктор голосования";

  if (!isChairman && !isAdmin) {
    return (
      <Placeholder
        title="Нет доступа"
        text="У вашей активной роли нет доступа к конструктору голосования."
      />
    );
  }

  if (
    props.activeComponent !== "voting_constructor" &&
    props.activeComponent !== "voting_constructor_create"
  ) {
    return (
      <Placeholder
        title={pageTitle}
        text="Здесь будет список опросных листов по выбранному статусу."
      />
    );
  }

  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">{pageTitle}</h1>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <form onSubmit={props.createVoting} className="grid gap-3">
          <input
            className="rounded-xl border p-3"
            placeholder="Название голосования"
            value={props.title}
            onChange={(e) => props.setTitle(e.target.value)}
          />
          <textarea
            className="rounded-xl border p-3"
            placeholder="Описание"
            value={props.description}
            onChange={(e) => props.setDescription(e.target.value)}
          />
          <input
            className="rounded-xl border p-3"
            placeholder="Вопрос"
            value={props.question}
            onChange={(e) => props.setQuestion(e.target.value)}
          />
          <textarea
            className="rounded-xl border p-3"
            rows={4}
            placeholder="Варианты ответа, каждый с новой строки"
            value={props.optionsText}
            onChange={(e) => props.setOptionsText(e.target.value)}
          />

          {props.createError && (
            <p className="text-sm text-red-600">{props.createError}</p>
          )}

          <button
            type="submit"
            disabled={props.creating}
            className="w-fit rounded-xl bg-blue-600 px-5 py-3 text-white disabled:opacity-50"
          >
            {props.creating ? "Создаём..." : "Создать голосование"}
          </button>
        </form>
      </section>
    </>
  );
}
