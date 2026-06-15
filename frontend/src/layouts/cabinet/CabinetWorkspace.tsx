import type { ReactNode } from "react";
import { moduleMap } from "@/config/module-map";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { Placeholder } from "@/shared/ui/Placeholder";

export function CabinetWorkspace(
  props: CabinetModuleProps & { overlay?: ReactNode; sidebarCollapsed?: boolean },
) {
  const Module = moduleMap[props.activeComponent];
  const { overlay, sidebarCollapsed, ...moduleProps } = props;

  return (
    <section
      className={`relative h-[calc(100vh-64px)] overflow-y-auto px-4 pb-24 pt-4 transition-all duration-200 sm:px-6 lg:pb-8 lg:pt-6 ${
        sidebarCollapsed
          ? "lg:ml-[var(--gd-sidebar-collapsed-width)]"
          : "lg:ml-[var(--gd-sidebar-width)]"
      }`}
    >
      {Module ? (
        <Module {...moduleProps} />
      ) : (
        <Placeholder
          title="Модуль пока не подключён на фронте"
          text="Пункт пришёл из меню backend, но React-компонент для его code/component не указан в module-map.ts."
        />
      )}
      {overlay}
    </section>
  );
}
