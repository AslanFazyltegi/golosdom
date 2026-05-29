"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { Placeholder } from "@/shared/ui/Placeholder";

type Building = {
  id: string;
  building_name: string | null;
  city: string;
  district: string | null;
  street: string;
  house_number: string;
  house_fraction: string | null;
  image_url?: string | null;
  floors_count: number | null;
  entrances_count: number | null;
  apartments_count: number | null;
  commercial_units_count: number | null;
  storerooms_count: number | null;
  parking_spaces_count: number | null;
};

type Statistics = {
  apartments: number;
  commercial: number;
  storerooms: number;
  parking: number;
  entrances: number;
  floors: number;
  totalProperties: number;
  withOwner: number;
  withoutOwner: number;
  uniqueOwners: number;
};

type TypeDistribution = {
  type: string;
  count: number;
};

type ActivityLog = {
  id: string;
  description: string;
  created_by?: string;
  created_at: string;
};

type OwnerInfo = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  erc_account: string | null;
};

type PropertyItem = {
  id: string;
  type: string;
  number: string;
  entrance: number | null;
  floor: number | null;
  area: number | null;
  status: string;
  owner: OwnerInfo | null;
};

type OwnerItem = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  erc_account: string | null;
  properties_count: number;
  properties: Array<{ id: string; type: string; number: string }>;
};

type UserOption = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  erc_account: string | null;
};

type OwnerObject = {
  property_type: string;
  number: string;
  area: string | number | null;
  status: string;
};

type Dashboard = {
  building: Building;
  statistics: Statistics;
  typeDistribution: TypeDistribution[];
  recentActions: ActivityLog[];
};

type Tab = "overview" | "building" | "properties" | "owners";

const EDIT_ROLES = new Set(["CHAIRMAN", "ADMIN"]);
const PROPERTY_TYPES = ["apartment", "commercial_room", "storage", "parking"];
const PAGE_SIZES = [10, 25, 50];

const emptyStats: Statistics = {
  apartments: 0,
  commercial: 0,
  storerooms: 0,
  parking: 0,
  entrances: 0,
  floors: 0,
  totalProperties: 0,
  withOwner: 0,
  withoutOwner: 0,
  uniqueOwners: 0,
};

export function MyBuildingPage({ activeRole, objects }: CabinetModuleProps) {
  const [activeTab, setActiveTab] = useState<Tab>("properties");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [owners, setOwners] = useState<OwnerItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const [propertyQuery, setPropertyQuery] = useState("");
  const [ownerQuery, setOwnerQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [entranceFilter, setEntranceFilter] = useState("all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [sortBy, setSortBy] = useState("number");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [editingBuilding, setEditingBuilding] = useState(false);
  const [buildingForm, setBuildingForm] = useState<Partial<Building>>({});
  const [editingProperty, setEditingProperty] = useState<PropertyItem | null>(null);
  const [propertyForm, setPropertyForm] = useState<Partial<PropertyItem> & { user_id?: string }>({});

  const normalizedRole = activeRole.trim().toUpperCase();
  const isOwnerRole = normalizedRole === "OWNER";
  const canEdit = EDIT_ROLES.has(normalizedRole);

  useEffect(() => {
    if (isOwnerRole) {
      return;
    }

    void loadAll();
  }, [isOwnerRole]);

  const filteredProperties = useMemo(() => {
    const query = propertyQuery.trim().toLowerCase();
    const filtered = properties.filter((item) => {
      const owner = item.owner;
      const searchable = [
        item.number,
        propertyTypeLabel(item.type),
        item.type,
        item.entrance,
        item.floor,
        owner?.name,
        owner?.email,
        owner?.phone,
        owner?.erc_account,
      ]
        .map((value) => formatValue(value).toLowerCase())
        .join(" ");

      if (query && !searchable.includes(query)) return false;
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (ownerFilter === "with" && !owner) return false;
      if (ownerFilter === "without" && owner) return false;
      if (entranceFilter !== "all" && String(item.entrance ?? "") !== entranceFilter) return false;
      if (floorFilter !== "all" && String(item.floor ?? "") !== floorFilter) return false;

      return true;
    });

    return filtered.sort((a, b) => compareProperties(a, b, sortBy));
  }, [properties, propertyQuery, typeFilter, ownerFilter, entranceFilter, floorFilter, sortBy]);

  const pagedProperties = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProperties.slice(start, start + pageSize);
  }, [filteredProperties, page, pageSize]);

  const filteredOwners = useMemo(() => {
    const query = ownerQuery.trim().toLowerCase();
    if (!query) return owners;

    return owners.filter((owner) =>
      [
        owner.name,
        owner.email,
        owner.phone,
        owner.erc_account,
        owner.properties.map((item) => `${propertyTypeLabel(item.type)} ${item.number}`).join(" "),
      ]
        .map((value) => formatValue(value).toLowerCase())
        .join(" ")
        .includes(query),
    );
  }, [owners, ownerQuery]);

  const entrances = useMemo(() => distinctNumberOptions(properties.map((item) => item.entrance)), [properties]);
  const floors = useMemo(() => distinctNumberOptions(properties.map((item) => item.floor)), [properties]);
  const stats = dashboard?.statistics ?? emptyStats;
  const building = dashboard?.building ?? buildingFromObjects(objects);
  const totalPages = Math.max(1, Math.ceil(filteredProperties.length / pageSize));
  const rangeStart = filteredProperties.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, filteredProperties.length);

  async function loadAll() {
    setLoading(true);
    setError("");

    try {
      const [dashboardData, propertyData, ownerData, userData] = await Promise.all([
        apiFetch("/api/v1/objects/dashboard") as Promise<Dashboard>,
        apiFetch("/api/v1/objects/properties") as Promise<PropertyItem[]>,
        apiFetch("/api/v1/objects/owners") as Promise<OwnerItem[]>,
        apiFetch("/api/v1/objects/users") as Promise<UserOption[]>,
      ]);

      setDashboard(dashboardData);
      setProperties(propertyData);
      setOwners(ownerData);
      setUsers(userData);
      setBuildingForm(dashboardData.building);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  }

  async function refreshData(message?: string) {
    await loadAll();
    if (message) showToast(message);
  }

  async function saveBuilding() {
    if (!dashboard?.building) return;
    setSaving(true);
    try {
      await apiFetch("/api/v1/objects/building", {
        method: "PATCH",
        body: JSON.stringify(buildingPayload(buildingForm)),
      });
      setEditingBuilding(false);
      await refreshData("Данные МЖК успешно обновлены");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения данных МЖК");
    } finally {
      setSaving(false);
    }
  }

  async function saveProperty() {
    if (!editingProperty) return;
    setSaving(true);
    try {
      await apiFetch(`/api/v1/objects/properties/${editingProperty.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          type: propertyForm.type,
          number: propertyForm.number,
          entrance: numberOrNull(propertyForm.entrance),
          floor: numberOrNull(propertyForm.floor),
          area: numberOrNull(propertyForm.area),
          user_id: propertyForm.user_id || null,
        }),
      });
      setEditingProperty(null);
      await refreshData("Имущество успешно обновлено");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения имущества");
    } finally {
      setSaving(false);
    }
  }

  function openPropertyDrawer(item: PropertyItem) {
    setEditingProperty(item);
    setPropertyForm({
      ...item,
      user_id: item.owner?.id ?? "",
    });
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3500);
  }

  if (isOwnerRole) {
    return <OwnerObjectsView activeRole={activeRole} objects={objects} />;
  }

  if (!objects && loading) {
    return <Placeholder title="Мой МЖК" text="Загрузка данных..." />;
  }

  return (
    <div className="min-h-screen bg-slate-50 px-1 pb-10 text-slate-900 md:px-3">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-normal">Мой МЖК</h1>
          <p className="mt-1 text-sm text-slate-500">
            Информация по дому, имуществу и собственникам
          </p>
        </div>
        <button
          type="button"
          onClick={() => refreshData("Данные обновлены")}
          className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "Загрузка..." : "Обновить данные"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {toast && (
        <div className="fixed right-6 top-6 z-50 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-medium text-emerald-700 shadow-lg">
          {toast}
        </div>
      )}

      <HeroCard building={building} stats={stats} />

      <div className="mt-6 border-b border-slate-200">
        <nav className="flex gap-1 overflow-x-auto">
          {[
            ["overview", "Обзор"],
            ["building", "Данные МЖК"],
            ["properties", "Имущество"],
            ["owners", "Собственники"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key as Tab)}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition ${
                activeTab === key
                  ? "border-sky-500 text-sky-700"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {loading && !dashboard ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-slate-500 shadow-sm">
          Загрузка...
        </section>
      ) : null}

      {!loading && !dashboard && !error ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-slate-500 shadow-sm">
          Нет данных
        </section>
      ) : null}

      {dashboard && activeTab === "overview" && (
        <OverviewTab
          building={dashboard.building}
          stats={dashboard.statistics}
          distribution={dashboard.typeDistribution}
        />
      )}

      {dashboard && activeTab === "building" && (
        <BuildingTab
          buildingForm={buildingForm}
          setBuildingForm={setBuildingForm}
          canEdit={canEdit}
          editing={editingBuilding}
          saving={saving}
          onEdit={() => setEditingBuilding(true)}
          onCancel={() => {
            setBuildingForm(dashboard.building);
            setEditingBuilding(false);
          }}
          onSave={saveBuilding}
        />
      )}

      {dashboard && activeTab === "properties" && (
        <>
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <input
                value={propertyQuery}
                onChange={(event) => {
                  setPropertyQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Поиск по номеру, типу, собственнику, телефону, лицевому счету..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
              />
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Select label="Тип имущества" value={typeFilter} onChange={(value) => {
                  setTypeFilter(value);
                  setPage(1);
                }}>
                  <option value="all">Все</option>
                  {PROPERTY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {propertyTypeLabel(type)}
                    </option>
                  ))}
                </Select>
                <Select label="Собственник" value={ownerFilter} onChange={(value) => {
                  setOwnerFilter(value);
                  setPage(1);
                }}>
                  <option value="all">Все</option>
                  <option value="with">С собственником</option>
                  <option value="without">Без собственника</option>
                </Select>
                <Select label="Подъезд" value={entranceFilter} onChange={(value) => {
                  setEntranceFilter(value);
                  setPage(1);
                }}>
                  <option value="all">Все</option>
                  {entrances.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
                <Select label="Этаж" value={floorFilter} onChange={(value) => {
                  setFloorFilter(value);
                  setPage(1);
                }}>
                  <option value="all">Все</option>
                  {floors.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
                <Select label="Сортировка" value={sortBy} onChange={(value) => {
                  setSortBy(value);
                  setPage(1);
                }}>
                  <option value="number">По номеру</option>
                  <option value="type">По типу</option>
                  <option value="owner">По собственнику</option>
                  <option value="entrance">По подъезду</option>
                  <option value="floor">По этажу</option>
                </Select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      "№",
                      "Тип имущества",
                      "Номер",
                      "Подъезд",
                      "Этаж",
                      "Площадь, м²",
                      "Собственник",
                      "Телефон",
                      "Лицевой счет ЕРЦ",
                      "Статус",
                      "Действия",
                    ].map((heading) => (
                      <th key={heading} className="border-b border-slate-200 px-4 py-3 font-semibold">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedProperties.map((item, index) => (
                    <tr key={item.id} className="transition hover:bg-sky-50/60">
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-500">
                        {(page - 1) * pageSize + index + 1}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <PropertyTypeBadge type={item.type} />
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 font-semibold">{item.number}</td>
                      <td className="border-b border-slate-100 px-4 py-3">{formatValue(item.entrance)}</td>
                      <td className="border-b border-slate-100 px-4 py-3">{formatValue(item.floor)}</td>
                      <td className="border-b border-slate-100 px-4 py-3">{formatArea(item.area)}</td>
                      <td className="border-b border-slate-100 px-4 py-3">{item.owner?.name || "-"}</td>
                      <td className="border-b border-slate-100 px-4 py-3">{formatValue(item.owner?.phone)}</td>
                      <td className="border-b border-slate-100 px-4 py-3">{formatValue(item.owner?.erc_account)}</td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <OwnerStatusBadge assigned={Boolean(item.owner)} />
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => openPropertyDrawer(item)}
                            className="rounded-lg border border-sky-200 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50"
                          >
                            Редактировать
                          </button>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredProperties.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-500">Нет данных</div>
            )}

            <div className="flex flex-col gap-3 border-t border-slate-100 p-4 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
              <span>
                Показано {rangeStart}-{rangeEnd} из {filteredProperties.length}
              </span>
              <div className="flex items-center gap-3">
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-700 disabled:opacity-40"
                >
                  Назад
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-700 disabled:opacity-40"
                >
                  Вперед
                </button>
              </div>
            </div>
          </section>

          <BottomBlocks stats={stats} distribution={dashboard.typeDistribution} actions={dashboard.recentActions} />
        </>
      )}

      {dashboard && activeTab === "owners" && (
        <OwnersTab owners={filteredOwners} query={ownerQuery} setQuery={setOwnerQuery} />
      )}

      {editingProperty && (
        <PropertyDrawer
          property={propertyForm}
          users={users}
          saving={saving}
          setProperty={setPropertyForm}
          onClose={() => setEditingProperty(null)}
          onSave={saveProperty}
        />
      )}
    </div>
  );
}

function OwnerObjectsView({
  activeRole,
  objects,
}: {
  activeRole: string;
  objects: unknown;
}) {
  if (!objects) {
    return <Placeholder title="Мои объекты" text="Загрузка данных..." />;
  }

  const ownerObjects = Array.isArray(objects) ? (objects as OwnerObject[]) : [];

  return (
    <>
      <h1 className="mb-8 text-3xl font-bold">Мои объекты</h1>

      {ownerObjects.length === 0 && (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-xl font-semibold">Объекты не найдены</h2>
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
            <p className="mt-3 text-slate-600">
              Площадь: {formatValue(item.area)} м²
            </p>
            <p className="mt-1 text-slate-500">
              Статус: {formatValue(item.status)}
            </p>
          </section>
        ))}
      </div>
    </>
  );
}

function HeroCard({ building, stats }: { building: Building | null; stats: Statistics }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="flex h-36 w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-sky-100 to-slate-100 text-5xl text-sky-600 md:w-52">
            {building?.image_url ? (
              <div
                aria-hidden="true"
                className="h-full w-full bg-cover bg-center"
                style={{ backgroundImage: `url(${building.image_url})` }}
              />
            ) : (
              <span aria-hidden="true">⌂</span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="truncate text-2xl font-bold">{formatValue(building?.building_name)}</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Активный
              </span>
            </div>
            <p className="text-sm font-medium text-slate-600">
              {[building?.city, building?.district ? `район ${building.district}` : ""].filter(Boolean).join(", ")}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {[building?.street, formatHouse(building)].filter(Boolean).join(", ")}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Квартиры" value={stats.apartments} />
          <StatCard label="НП" value={stats.commercial} />
          <StatCard label="Кладовые" value={stats.storerooms} />
          <StatCard label="Паркоместа" value={stats.parking} />
          <StatCard label="Подъезды" value={stats.entrances} />
          <StatCard label="Этажность" value={stats.floors} />
          <StatCard label="Всего объектов" value={stats.totalProperties} />
          <StatCard label="Собственников" value={stats.uniqueOwners} />
        </div>
      </div>
    </section>
  );
}

function OverviewTab({
  building,
  stats,
  distribution,
}: {
  building: Building;
  stats: Statistics;
  distribution: TypeDistribution[];
}) {
  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-3">
      <Panel title="Данные дома">
        <InfoGrid
          items={[
            ["Наименование ЖК", building.building_name],
            ["Город", building.city],
            ["Район", building.district],
            ["Улица", building.street],
            ["Дом", building.house_number],
            ["Корпус/дробь дома", building.house_fraction],
            ["Этажность", building.floors_count],
            ["Подъезды", building.entrances_count],
            ["Квартиры", building.apartments_count],
            ["НП", building.commercial_units_count],
            ["Кладовые", building.storerooms_count],
            ["Паркоместа", building.parking_spaces_count],
          ]}
        />
      </Panel>
      <Panel title="Статистика имущества">
        <InfoGrid
          items={[
            ["Всего объектов", stats.totalProperties],
            ["С собственником", stats.withOwner],
            ["Без собственника", stats.withoutOwner],
            ["Уникальных собственников", stats.uniqueOwners],
          ]}
        />
      </Panel>
      <Panel title="Распределение по типам">
        <DistributionList items={distribution} total={stats.totalProperties} />
      </Panel>
    </div>
  );
}

function BuildingTab({
  buildingForm,
  setBuildingForm,
  canEdit,
  editing,
  saving,
  onEdit,
  onCancel,
  onSave,
}: {
  buildingForm: Partial<Building>;
  setBuildingForm: (value: Partial<Building>) => void;
  canEdit: boolean;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const fields: Array<[keyof Building, string, string]> = [
    ["building_name", "Наименование ЖК", "text"],
    ["city", "Город", "text"],
    ["district", "Район", "text"],
    ["street", "Улица", "text"],
    ["house_number", "Дом", "text"],
    ["house_fraction", "Корпус/дробь дома", "text"],
    ["floors_count", "Этажность", "number"],
    ["entrances_count", "Подъезды", "number"],
    ["apartments_count", "Квартиры", "number"],
    ["commercial_units_count", "НП", "number"],
    ["storerooms_count", "Кладовые", "number"],
    ["parking_spaces_count", "Паркоместа", "number"],
  ];

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-bold">Данные МЖК</h2>
        {canEdit && !editing && (
          <button type="button" onClick={onEdit} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
            Редактировать
          </button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fields.map(([key, label, type]) => (
          <label key={key} className="block">
            <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
            <input
              type={type}
              disabled={!editing}
              value={formatInputValue(buildingForm[key])}
              onChange={(event) =>
                setBuildingForm({
                  ...buildingForm,
                  [key]: type === "number" ? numberOrNull(event.target.value) : event.target.value,
                })
              }
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition disabled:text-slate-600 focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
            />
          </label>
        ))}
      </div>
      {editing && (
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Отмена
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      )}
    </section>
  );
}

function OwnersTab({
  owners,
  query,
  setQuery,
}: {
  owners: OwnerItem[];
  query: string;
  setQuery: (value: string) => void;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по ФИО, email, телефону, лицевому счету, номеру имущества..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {["№", "Собственник", "Email", "Телефон", "Лицевой счет ЕРЦ", "Количество объектов", "Список имущества"].map((heading) => (
                <th key={heading} className="border-b border-slate-200 px-4 py-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {owners.map((owner, index) => (
              <tr key={owner.id} className="transition hover:bg-sky-50/60">
                <td className="border-b border-slate-100 px-4 py-3 text-slate-500">{index + 1}</td>
                <td className="border-b border-slate-100 px-4 py-3 font-semibold">{owner.name}</td>
                <td className="border-b border-slate-100 px-4 py-3">{owner.email}</td>
                <td className="border-b border-slate-100 px-4 py-3">{formatValue(owner.phone)}</td>
                <td className="border-b border-slate-100 px-4 py-3">{formatValue(owner.erc_account)}</td>
                <td className="border-b border-slate-100 px-4 py-3">{owner.properties_count}</td>
                <td className="border-b border-slate-100 px-4 py-3">
                  {owner.properties.map((item) => `${propertyTypeLabel(item.type)} ${item.number}`).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {owners.length === 0 && <div className="p-6 text-center text-sm text-slate-500">Нет данных</div>}
    </section>
  );
}

function PropertyDrawer({
  property,
  users,
  saving,
  setProperty,
  onClose,
  onSave,
}: {
  property: Partial<PropertyItem> & { user_id?: string };
  users: UserOption[];
  saving: boolean;
  setProperty: (value: Partial<PropertyItem> & { user_id?: string }) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-950/30">
      <aside className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-xl font-bold">Редактирование имущества</h2>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <Select label="Тип имущества" value={property.type || ""} onChange={(value) => setProperty({ ...property, type: value })}>
            {PROPERTY_TYPES.map((type) => (
              <option key={type} value={type}>
                {propertyTypeLabel(type)}
              </option>
            ))}
          </Select>
          <DrawerInput label="Номер" value={property.number} onChange={(value) => setProperty({ ...property, number: value })} />
          <DrawerInput label="Подъезд" type="number" value={property.entrance} onChange={(value) => setProperty({ ...property, entrance: numberOrNull(value) })} />
          <DrawerInput label="Этаж" type="number" value={property.floor} onChange={(value) => setProperty({ ...property, floor: numberOrNull(value) })} />
          <DrawerInput label="Площадь, м²" type="number" value={property.area} onChange={(value) => setProperty({ ...property, area: numberOrNull(value) })} />
          <label className="block">
            <span className="text-xs font-semibold uppercase text-slate-500">Собственник</span>
            <select
              value={property.user_id || ""}
              onChange={(event) => setProperty({ ...property, user_id: event.target.value })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
            >
              <option value="">Без собственника</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {[user.name || user.email, user.email, user.phone].filter(Boolean).join(" / ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 p-5">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Отмена
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function BottomBlocks({
  stats,
  distribution,
  actions,
}: {
  stats: Statistics;
  distribution: TypeDistribution[];
  actions: ActivityLog[];
}) {
  const withOwnerPercent = stats.totalProperties ? (stats.withOwner / stats.totalProperties) * 100 : 0;
  const withoutOwnerPercent = stats.totalProperties ? (stats.withoutOwner / stats.totalProperties) * 100 : 0;

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-3">
      <Panel title="Статистика имущества">
        <InfoGrid
          items={[
            ["Всего объектов", stats.totalProperties],
            ["С собственником", `${stats.withOwner} (${withOwnerPercent.toFixed(1)}%)`],
            ["Без собственника", `${stats.withoutOwner} (${withoutOwnerPercent.toFixed(1)}%)`],
            ["Уникальных собственников", stats.uniqueOwners],
          ]}
        />
      </Panel>
      <Panel title="Распределение по типам">
        <DistributionList items={distribution} total={stats.totalProperties} />
      </Panel>
      <Panel title="Недавние действия">
        {actions.length === 0 ? (
          <p className="text-sm text-slate-500">Нет данных</p>
        ) : (
          <div className="space-y-3">
            {actions.map((item) => (
              <div key={item.id} className="rounded-xl bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">{item.description}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDate(item.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function DistributionList({ items, total }: { items: TypeDistribution[]; total: number }) {
  return (
    <div className="space-y-3">
      {PROPERTY_TYPES.map((type) => {
        const count = items.find((item) => item.type === type)?.count ?? 0;
        const percent = total ? Math.round((count / total) * 100) : 0;
        return (
          <div key={type}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">{propertyTypeLabel(type)}</span>
              <span className="text-slate-500">{count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function InfoGrid({ items }: { items: Array<[string, unknown]> }) {
  return (
    <div className="grid gap-3">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
          <span className="text-sm text-slate-500">{label}</span>
          <span className="text-right text-sm font-semibold text-slate-900">{formatValue(value)}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 transition hover:border-sky-200 hover:bg-sky-50">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{formatValue(value)}</p>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
      >
        {children}
      </select>
    </label>
  );
}

function DrawerInput({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: unknown;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
      <input
        type={type}
        value={formatInputValue(value)}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
      />
    </label>
  );
}

function PropertyTypeBadge({ type }: { type: string }) {
  const tone = type === "apartment" ? "bg-sky-50 text-sky-700" : type === "parking" ? "bg-violet-50 text-violet-700" : type === "storage" ? "bg-amber-50 text-amber-700" : "bg-cyan-50 text-cyan-700";
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{propertyTypeLabel(type)}</span>;
}

function OwnerStatusBadge({ assigned }: { assigned: boolean }) {
  return assigned ? (
    <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Назначен</span>
  ) : (
    <span className="inline-flex rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">Без собственника</span>
  );
}

function propertyTypeLabel(type: string) {
  const labels: Record<string, string> = {
    apartment: "Квартира",
    commercial: "НП (нежилое)",
    commercial_room: "НП (нежилое)",
    storage: "Кладовая",
    storeroom: "Кладовая",
    parking: "Паркоместо",
  };
  return labels[type] || type || "-";
}

function compareProperties(a: PropertyItem, b: PropertyItem, sortBy: string) {
  if (sortBy === "type") return propertyTypeLabel(a.type).localeCompare(propertyTypeLabel(b.type), "ru");
  if (sortBy === "owner") return (a.owner?.name || "").localeCompare(b.owner?.name || "", "ru");
  if (sortBy === "entrance") return (a.entrance ?? 0) - (b.entrance ?? 0) || naturalCompare(a.number, b.number);
  if (sortBy === "floor") return (a.floor ?? 0) - (b.floor ?? 0) || naturalCompare(a.number, b.number);
  return naturalCompare(a.number, b.number);
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" });
}

function distinctNumberOptions(values: Array<number | null>) {
  return Array.from(new Set(values.filter((value): value is number => value !== null && value !== undefined)))
    .sort((a, b) => a - b)
    .map(String);
}

function buildingPayload(building: Partial<Building>) {
  return {
    building_name: building.building_name ?? null,
    city: building.city ?? "",
    district: building.district ?? null,
    street: building.street ?? "",
    house_number: building.house_number ?? "",
    house_fraction: building.house_fraction ?? null,
    floors_count: numberOrNull(building.floors_count),
    entrances_count: numberOrNull(building.entrances_count),
    apartments_count: numberOrNull(building.apartments_count),
    commercial_units_count: numberOrNull(building.commercial_units_count),
    storerooms_count: numberOrNull(building.storerooms_count),
    parking_spaces_count: numberOrNull(building.parking_spaces_count),
  };
}

function buildingFromObjects(objects: unknown): Building | null {
  if (!objects || Array.isArray(objects) || typeof objects !== "object") return null;
  const item = objects as Record<string, unknown>;
  return {
    id: String(item.id || ""),
    building_name: nullableString(item.building_name),
    city: String(item.city || ""),
    district: nullableString(item.district),
    street: String(item.street || ""),
    house_number: String(item.house_number || ""),
    house_fraction: nullableString(item.house_fraction),
    floors_count: nullableNumber(item.floors_count),
    entrances_count: nullableNumber(item.entrances_count),
    apartments_count: nullableNumber(item.apartments_count),
    commercial_units_count: nullableNumber(item.commercial_units_count),
    storerooms_count: nullableNumber(item.storerooms_count),
    parking_spaces_count: nullableNumber(item.parking_spaces_count),
  };
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function nullableNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function formatHouse(building: Building | null) {
  if (!building) return "";
  return [building.house_number, building.house_fraction].filter(Boolean).join("/");
}

function formatArea(value: number | null) {
  if (value === null || value === undefined) return "-";
  return Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" && value.trim() === "") return "-";
  return String(value);
}

function formatInputValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
