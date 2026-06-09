import { moduleMap } from "@/config/module-map";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { Placeholder } from "@/shared/ui/Placeholder";

export function CabinetWorkspace(
  props: CabinetModuleProps & { sidebarCollapsed?: boolean },
) {
  const Module = moduleMap[props.activeComponent];

  return (
    <section
      className={`h-[calc(100vh-80px)] overflow-y-auto px-4 py-5 transition-all duration-200 sm:px-6 lg:px-8 lg:py-8 ${
        props.sidebarCollapsed ? "lg:ml-24" : "lg:ml-72"
      }`}
    >
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
