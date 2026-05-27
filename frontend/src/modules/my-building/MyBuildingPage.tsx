import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { Placeholder } from "@/shared/ui/Placeholder";

type BuildingObjects = Record<string, unknown>;
type OwnerObject = {
  property_type: string;
  number: string;
  area: string | number;
  status: string;
};

const BUILDING_INFO_ROLES = new Set([
  "CHAIRMAN",
  "COUNCIL_MEMBER",
  "AUDITOR",
  "SYSTEM_ADMIN",
]);

export function MyBuildingPage({ activeRole, objects }: CabinetModuleProps) {
  if (!objects) {
    return <Placeholder title="Мои объекты" text="Загрузка данных..." />;
  }

  if (BUILDING_INFO_ROLES.has(activeRole.trim().toUpperCase())) {
    const building = objects as BuildingObjects;

    return (
      <>
        <h1 className="mb-8 text-3xl font-bold">Мой МЖК</h1>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-6 text-xl font-semibold">🏢 Данные дома</h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="Город" value={building.city} />
            <InfoCard label="Район" value={building.district} />
            <InfoCard label="Наименование ЖК" value={building.building_name} />
            <InfoCard label="Улица" value={building.street} />
            <InfoCard label="Дом" value={formatHouse(building)} />
            <InfoCard label="Этажность" value={building.floors_count} />
            <InfoCard label="Подъезды" value={building.entrances_count} />
            <InfoCard label="Квартиры" value={building.apartments_count} />
            <InfoCard label="НП" value={building.commercial_units_count} />
            <InfoCard label="Кладовые" value={building.storerooms_count} />
            <InfoCard label="Паркоместа" value={building.parking_spaces_count} />
          </div>
        </section>
      </>
    );
  }

  const ownerObjects = Array.isArray(objects) ? (objects as OwnerObject[]) : [];

  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">Мои объекты</h1>

      {ownerObjects.length === 0 && (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-xl font-semibold">📭 Объекты не найдены</h2>
          <p className="text-slate-600">
            Для роли <b>{activeRole}</b> объекты имущества пока не назначены.
          </p>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {ownerObjects.map((item) => (
          <section
            key={`${item.property_type}-${item.number}`}
            className="rounded-2xl border bg-white p-6 shadow-sm"
          >
            <h2 className="text-xl font-semibold">
              {propertyTypeLabel(item.property_type)} №{item.number}
            </h2>
            <p className="mt-3 text-slate-600">Площадь: {item.area} м²</p>
            <p className="mt-1 text-slate-500">Статус: {item.status}</p>
          </section>
        ))}
      </div>
    </>
  );
}

function InfoCard({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{formatValue(value)}</p>
    </div>
  );
}

function formatHouse(building: BuildingObjects) {
  return [stringValue(building.house_number), stringValue(building.house_fraction)]
    .filter(Boolean)
    .join("/");
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && value.trim() === "") return "—";

  return String(value);
}

function stringValue(value: unknown) {
  if (typeof value !== "string") return "";

  return value.trim();
}

function propertyTypeLabel(type: string) {
  const map: Record<string, string> = {
    apartment: "Квартира",
    parking: "Паркоместо",
    storage: "Кладовая",
    commercial_room: "НП",
  };

  return map[type] || type;
}
