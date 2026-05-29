"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import {
  createPropertyUpdateRequest,
  fetchMyProperties,
  fetchPropertyCorrectionRequests,
  processPropertyCorrectionRequest,
} from "@/lib/objects";
import type { CabinetModuleProps } from "@/shared/types/cabinet";
import { Placeholder } from "@/shared/ui/Placeholder";
import type {
  MyPropertiesResponse,
  MyProperty,
  PropertyCorrectionRequest,
} from "@/types/objects";

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
};

type PropertyItem = {
  id: string;
  type: string;
  number: string;
  entrance: number | null;
  floor: number | null;
  area: number | null;
  status: string;
  erc_account: string | null;
  owner: OwnerInfo | null;
};

type OwnerItem = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  properties_count: number;
  properties: Array<{ id: string; type: string; number: string }>;
};

type UserOption = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
};

type Dashboard = {
  building: Building;
  statistics: Statistics;
  typeDistribution: TypeDistribution[];
  recentActions: ActivityLog[];
};

type Tab = "overview" | "building" | "properties" | "owners";
type CorrectionRequestsTab = "pending" | "processed";

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

export function MyBuildingPage({ activeRole, objects, openModule }: CabinetModuleProps) {
  const [activeTab, setActiveTab] = useState<Tab>("properties");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [owners, setOwners] = useState<OwnerItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [correctionRequestsOpen, setCorrectionRequestsOpen] = useState(false);
  const [correctionRequests, setCorrectionRequests] = useState<PropertyCorrectionRequest[]>([]);
  const [correctionRequestsLoading, setCorrectionRequestsLoading] = useState(false);
  const [correctionRequestsError, setCorrectionRequestsError] = useState("");
  const [correctionRequestsPendingCount, setCorrectionRequestsPendingCount] = useState(0);
  const [correctionRequestProcessingID, setCorrectionRequestProcessingID] = useState<string | null>(null);
  const [correctionRequestProcessError, setCorrectionRequestProcessError] = useState("");

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
  const isChairmanRole = normalizedRole === "CHAIRMAN";
  const canEdit = EDIT_ROLES.has(normalizedRole);

  useEffect(() => {
    if (isOwnerRole) {
      return;
    }

    void loadAll();
  }, [isOwnerRole, isChairmanRole]);

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
        item.erc_account,
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
      if (isChairmanRole) {
        void loadCorrectionRequests();
      } else {
        setCorrectionRequestsPendingCount(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  }

  async function loadCorrectionRequests() {
    setCorrectionRequestsLoading(true);
    setCorrectionRequestsError("");

    try {
      const data = await fetchPropertyCorrectionRequests();
      setCorrectionRequests(data.requests);
      setCorrectionRequestsPendingCount(data.pendingCount);
    } catch (err) {
      setCorrectionRequestsError(
        err instanceof Error ? err.message : "Не удалось загрузить запросы",
      );
    } finally {
      setCorrectionRequestsLoading(false);
    }
  }

  function openCorrectionRequests() {
    setCorrectionRequestsOpen(true);
    setCorrectionRequestProcessError("");
    void loadCorrectionRequests();
  }

  async function processCorrectionRequest(requestID: string) {
    setCorrectionRequestProcessingID(requestID);
    setCorrectionRequestProcessError("");

    try {
      await processPropertyCorrectionRequest(requestID);
      await loadCorrectionRequests();
    } catch (err) {
      setCorrectionRequestProcessError(
        err instanceof Error ? err.message : "Не удалось отметить заявку как обработанную",
      );
    } finally {
      setCorrectionRequestProcessingID(null);
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
    return <OwnerObjectsView openModule={openModule} />;
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {isChairmanRole && (
            <button
              type="button"
              onClick={openCorrectionRequests}
              className="relative inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
              disabled={correctionRequestsLoading}
            >
              Запросы на корректировку
              {correctionRequestsPendingCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white shadow">
                  {correctionRequestsPendingCount}
                </span>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => refreshData("Данные обновлены")}
            className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Загрузка..." : "Обновить данные"}
          </button>
        </div>
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
                      <td className="border-b border-slate-100 px-4 py-3">{formatValue(item.erc_account)}</td>
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

      {correctionRequestsOpen && (
        <CorrectionRequestsModal
          requests={correctionRequests}
          loading={correctionRequestsLoading}
          error={correctionRequestsError}
          processError={correctionRequestProcessError}
          processingID={correctionRequestProcessingID}
          onProcess={processCorrectionRequest}
          onClose={() => setCorrectionRequestsOpen(false)}
        />
      )}
    </div>
  );
}

function OwnerObjectsView({
  openModule,
}: {
  openModule: (code: string) => void;
}) {
  const [data, setData] = useState<MyPropertiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailsProperty, setDetailsProperty] = useState<MyProperty | null>(null);
  const [requestProperty, setRequestProperty] = useState<MyProperty | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [requestType, setRequestType] = useState("payer_data");
  const [newValue, setNewValue] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetchMyProperties()
      .then((nextData) => {
        if (!cancelled) setData(nextData);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Не удалось загрузить объекты");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function openRequest(property: MyProperty) {
    setRequestProperty(property);
    setRequestType("payer_data");
    setNewValue("");
    setComment("");
  }

  async function submitRequest() {
    if (!requestProperty) return;
    setSaving(true);
    try {
      await createPropertyUpdateRequest(requestProperty.id, {
        requestType,
        newValue,
        comment,
      });
      setToast("Заявка отправлена");
      setRequestProperty(null);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Не удалось отправить заявку");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Placeholder title="Мои объекты" text="Загрузка объектов..." />;
  }

  if (error || !data) {
    return (
      <section className="rounded-3xl border border-red-100 bg-white p-8 text-slate-700 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">Мои объекты</h1>
        <p className="mt-4 text-red-600">Не удалось загрузить объекты. Попробуйте обновить страницу.</p>
      </section>
    );
  }

  const ownerObjects = data.properties;

  return (
    <div className="space-y-7 bg-slate-50 pb-8 text-slate-900">
      <div>
        <h1 className="text-3xl font-bold">Мои объекты</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Здесь отображаются все объекты недвижимости, которыми вы владеете в данном ЖК.
        </p>
      </div>

      {toast && (
        <div className="rounded-2xl border border-sky-100 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-800">
          {toast}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OwnerSummaryCard label="Всего объектов" value={data.summary.totalObjects} />
        <OwnerSummaryCard label="Активных объектов" value={data.summary.activeObjects} />
        <OwnerSummaryCard label="Лицевых счетов" value={data.summary.ercAccounts} />
        <OwnerSummaryCard label="Активных голосований" value={data.summary.activeVotings} />
      </div>

      {ownerObjects.length === 0 ? (
        <section className="rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-bold">У вас пока нет привязанных объектов недвижимости.</h2>
          <p className="mt-3 text-slate-500">
            Если вы считаете, что это ошибка, обратитесь к председателю ОСИ.
          </p>
        </section>
      ) : (
        <div className="space-y-5">
          {ownerObjects.map((item) => (
            <OwnerPropertyCard
              key={item.id}
              property={item}
              onDetails={() => setDetailsProperty(item)}
              onRequest={() => openRequest(item)}
              onVotings={() => openModule("votings_active")}
            />
          ))}
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-3xl border border-sky-100 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-4xl gap-4 text-sm leading-6 text-slate-600">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-lg font-bold text-sky-700">
            i
          </div>
          <div>
            <p>Лицевой счёт ЕРЦ привязан к объекту недвижимости и не меняется при смене собственника.</p>
            <p>Если данные плательщика устарели, отправьте заявку на переоформление.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          className="w-full rounded-2xl border border-sky-200 px-5 py-3 text-sm font-bold text-sky-700 hover:bg-sky-50 md:w-auto"
        >
          Как это работает?
        </button>
      </section>

      {detailsProperty && (
        <OwnerModal title={detailsProperty.title} onClose={() => setDetailsProperty(null)}>
          <InfoGrid
            items={[
              ["Полный адрес", detailsProperty.building.fullAddress],
              ["Тип объекта", detailsProperty.typeLabel],
              ["Номер", detailsProperty.number],
              ["ЖК", detailsProperty.building.name],
              ["Площадь", detailsProperty.area === null ? null : `${formatArea(detailsProperty.area)} м²`],
              ["Этаж", detailsProperty.floor],
              ["Подъезд", detailsProperty.entrance],
              ["Доля владения", formatShare(detailsProperty.share)],
              ["Лицевой счёт ЕРЦ", detailsProperty.ercAccount || "Не указан"],
              ["Плательщик", detailsProperty.payerName],
              ["Статус плательщика", detailsProperty.payerStatusLabel],
              ["Последнее обновление", formatDateOnly(detailsProperty.payerUpdatedAt)],
            ]}
          />
          <VotingParticipation property={detailsProperty} expanded />
        </OwnerModal>
      )}

      {requestProperty && (
        <OwnerModal title="Запросить изменение" onClose={() => setRequestProperty(null)}>
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Что хотите изменить?</span>
              <select
                value={requestType}
                onChange={(event) => setRequestType(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-sky-400"
              >
                <option value="payer_data">Данные плательщика</option>
                <option value="contact_phone">Телефон для связи</option>
                <option value="erc_account_wrong">Лицевой счёт указан неверно</option>
                <option value="other">Другое</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Новое значение</span>
              <input
                value={newValue}
                onChange={(event) => setNewValue(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Комментарий</span>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={4}
                className="mt-2 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400"
              />
            </label>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRequestProperty(null)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={submitRequest}
                disabled={saving}
                className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving ? "Отправка..." : "Отправить заявку"}
              </button>
            </div>
          </div>
        </OwnerModal>
      )}

      {infoOpen && (
        <OwnerModal title="Как это работает?" onClose={() => setInfoOpen(false)}>
          <div className="space-y-3 text-sm leading-6 text-slate-600">
            <p>Лицевой счёт относится к конкретному объекту недвижимости: квартире, кладовой, паркоместу или нежилому помещению.</p>
            <p>При смене собственника лицевой счёт объекта сохраняется.</p>
            <p>Новый владелец должен переоформить данные плательщика, чтобы квитанции и уведомления приходили на его имя.</p>
          </div>
        </OwnerModal>
      )}
    </div>
  );
}

function OwnerSummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <section className="flex min-h-32 flex-col justify-between rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-3 text-4xl font-bold text-slate-900">{value}</p>
    </section>
  );
}

function OwnerPropertyCard({
  property,
  onDetails,
  onRequest,
  onVotings,
}: {
  property: MyProperty;
  onDetails: () => void;
  onRequest: () => void;
  onVotings: () => void;
}) {
  return (
    <section className="grid items-stretch gap-5 overflow-hidden rounded-3xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[180px_minmax(360px,1fr)_280px_180px]">
      <PropertyPreview property={property} />

      <div className="flex min-w-0 flex-col p-1">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 text-2xl font-bold text-slate-900">{property.title}</h2>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${propertyBadgeClass(property.status)}`}>
            {property.statusLabel}
          </span>
        </div>
        <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
          {property.building.fullAddress}
        </p>

        <div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
          <InfoPill label="Площадь" value={property.area === null ? "-" : `${formatArea(property.area)} м²`} />
          <InfoPill label="Этаж" value={formatValue(property.floor)} />
          <InfoPill label="Подъезд" value={formatValue(property.entrance)} />
          <InfoPill label="Доля" value={formatShare(property.share)} />
        </div>

        <VotingParticipation property={property} />
      </div>

      <aside className="min-w-0 rounded-3xl border border-slate-100 bg-slate-50 p-5 md:col-span-2 xl:col-span-1">
        <p className="text-xs font-bold uppercase text-slate-400">Лицевой счёт ЕРЦ</p>
        <p className="mt-2 break-words text-xl font-bold text-slate-900">{property.ercAccount || "Не указан"}</p>

        <dl className="mt-5 space-y-4 text-sm">
          <div>
            <dt className="font-semibold text-slate-400">Плательщик</dt>
            <dd className="mt-1 font-bold text-slate-800">{formatValue(property.payerName)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-400">Статус плательщика</dt>
            <dd className="mt-1">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${payerBadgeClass(property.payerStatus)}`}>
                {property.payerStatusLabel}
              </span>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-400">Последнее обновление</dt>
            <dd className="mt-1 font-bold text-slate-800">{formatDateOnly(property.payerUpdatedAt)}</dd>
          </div>
        </dl>
      </aside>

      <div className="flex min-w-0 flex-col gap-3 md:col-span-2 xl:col-span-1 xl:justify-center">
        <button
          type="button"
          onClick={onDetails}
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          Подробнее
        </button>
        <button
          type="button"
          onClick={onRequest}
          className="w-full rounded-2xl border border-sky-200 px-4 py-3 text-center text-sm font-bold text-sky-700 hover:bg-sky-50"
        >
          Запросить изменение
        </button>
        <button
          type="button"
          onClick={onVotings}
          className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-center text-sm font-bold text-white hover:bg-sky-700"
        >
          Активные голосования
        </button>
      </div>
    </section>
  );
}

function PropertyPreview({ property }: { property: MyProperty }) {
  if (property.imageUrl) {
    return (
      <div
        className="min-h-44 rounded-3xl bg-cover bg-center md:h-full md:min-h-56"
        style={{ backgroundImage: `url(${property.imageUrl})` }}
        aria-label={property.title}
      />
    );
  }

  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-sky-50 to-slate-100 text-sky-700 md:h-full md:min-h-56">
      <span className="text-5xl" aria-hidden="true">{propertyIcon(property.type)}</span>
      <span className="mt-3 text-sm font-bold">{property.typeLabel}</span>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-bold text-slate-800">{value}</p>
    </div>
  );
}

function VotingParticipation({
  property,
  expanded = false,
}: {
  property: MyProperty;
  expanded?: boolean;
}) {
  const items = [
    ["Общие голосования", property.votingParticipation.general],
    ["Квартиры и НП", property.votingParticipation.apartmentCommercial],
    ["Кладовые и паркоместа", property.votingParticipation.storageParking],
  ] as const;

  return (
    <div className={expanded ? "mt-6" : "mt-5"}>
      <h3 className="text-sm font-bold text-slate-900">Участие в голосованиях</h3>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {items.map(([label, active]) => (
          <div
            key={label}
            className="flex min-h-16 flex-col justify-between gap-2 rounded-2xl border border-slate-100 px-4 py-3 text-sm lg:flex-row lg:items-center"
          >
            <span className="font-semibold text-slate-600">{label}</span>
            <span className={`whitespace-nowrap font-bold ${active ? "text-emerald-600" : "text-slate-400"}`}>
              {active ? "✓ Участвует" : "○ Не участвует"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OwnerModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
      <section className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-50"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
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
          placeholder="Поиск по ФИО, email, телефону, номеру имущества..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {["№", "Собственник", "Email", "Телефон", "Количество объектов", "Список имущества"].map((heading) => (
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

function CorrectionRequestsModal({
  requests,
  loading,
  error,
  processError,
  processingID,
  onProcess,
  onClose,
}: {
  requests: PropertyCorrectionRequest[];
  loading: boolean;
  error: string;
  processError: string;
  processingID: string | null;
  onProcess: (requestID: string) => void;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<CorrectionRequestsTab>("pending");
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const processedRequests = requests.filter((request) => request.status === "processed");
  const visibleRequests = activeTab === "pending" ? pendingRequests : processedRequests;
  const emptyText =
    activeTab === "pending"
      ? "Нет заявок во вкладке «Ожидают обработки»"
      : "Нет заявок во вкладке «Обработанные»";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
      <section className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Запросы на корректировку</h2>
            <p className="mt-1 text-sm text-slate-500">
              Заявки пользователей на изменение данных об имуществе
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-50"
          >
            ×
          </button>
        </div>

        <div className="mb-5 border-b border-slate-200">
          <nav className="flex gap-1 overflow-x-auto">
            {[
              ["pending", "Ожидают обработки"],
              ["processed", "Обработанные"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key as CorrectionRequestsTab)}
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

        {loading && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
            Загрузка...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
            {error}
          </div>
        )}

        {!loading && !error && processError && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
            {processError}
          </div>
        )}

        {!loading && !error && visibleRequests.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
            {emptyText}
          </div>
        )}

        {!loading && !error && visibleRequests.length > 0 && (
          <div className="space-y-3">
            {visibleRequests.map((request) => {
              const isPending = request.status === "pending";
              const isProcessed = request.status === "processed";

              return (
                <article
                  key={request.id}
                  className={`rounded-2xl border p-4 ${
                    isPending ? "border-sky-200 bg-sky-50/70" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900">
                          {propertyTypeLabel(request.propertyType)} №{request.propertyNumber}
                        </h3>
                        {isPending && (
                          <span className="rounded-full bg-sky-600 px-2.5 py-1 text-xs font-bold text-white">
                            Ожидает обработки
                          </span>
                        )}
                        {isProcessed && (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            Обработано
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {request.userName}
                        {request.userPhone ? `, ${request.userPhone}` : ""}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-slate-500">
                      {formatDate(request.createdAt)}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                    <InfoPill label="Что изменить" value={requestTypeLabel(request.requestType)} />
                    <InfoPill label="Новое значение" value={formatValue(request.newValue)} />
                    <InfoPill label="Комментарий" value={formatValue(request.comment)} />
                  </div>

                  <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-500">
                      {isProcessed && request.processedAt
                        ? `Дата обработки: ${formatDate(request.processedAt)}`
                        : `Статус: ${requestStatusLabel(request.status)}`}
                    </p>
                    {isPending && (
                      <button
                        type="button"
                        onClick={() => onProcess(request.id)}
                        disabled={processingID === request.id}
                        className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
                      >
                        {processingID === request.id ? "Обработка..." : "Отметить как обработано"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
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

function requestTypeLabel(type: string) {
  const labels: Record<string, string> = {
    payer_data: "Данные плательщика",
    contact_phone: "Телефон для связи",
    erc_account_wrong: "Лицевой счёт указан неверно",
    other: "Другое",
  };

  return labels[type] || type || "-";
}

function requestStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "В ожидании",
    approved: "Одобрено",
    rejected: "Отклонено",
  };

  return labels[status] || status;
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

function formatDateOnly(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatShare(value: number | null) {
  if (value === null || value === undefined) return "-";
  return `${Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;
}

function propertyIcon(type: string) {
  switch (type) {
    case "parking":
    case "parking_space":
      return "P";
    case "storeroom":
    case "storage":
      return "□";
    case "commercial":
    case "commercial_room":
    case "commercial_unit":
      return "▣";
    default:
      return "⌂";
  }
}

function propertyBadgeClass(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700";
    case "inactive":
      return "bg-slate-100 text-slate-600";
    case "disputed":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function payerBadgeClass(status: string) {
  switch (status) {
    case "confirmed":
      return "bg-emerald-50 text-emerald-700";
    case "pending":
      return "bg-amber-50 text-amber-700";
    case "not_confirmed":
      return "bg-slate-100 text-slate-600";
    case "rejected":
      return "bg-red-50 text-red-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}
