import { moduleMap } from "@/config/module-map";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { Placeholder } from "@/shared/ui/Placeholder";

export function CabinetWorkspace(props: CabinetModuleProps) {
  const Module = moduleMap[props.activeComponent];

  return (
    <section className="ml-72 h-[calc(100vh-80px)] flex-1 overflow-y-auto p-8">
      {Module ? (
        <Module {...props} />
      ) : (
        <Placeholder
          title="Модуль пока не подключён на фронте"
          text="Пункт пришёл из меню backend, но React-компонент для его code/component не указан в module-map.ts."
        />
      )}
    </section>
  );
}
