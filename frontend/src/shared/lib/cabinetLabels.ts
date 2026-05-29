export function roleLabel(role: string) {
  const normalized = role.trim().toUpperCase();
  const labels: Record<string, string> = {
    OWNER: "Собственник",
    CHAIRMAN: "Председатель ОСИ",
    COUNCIL_MEMBER: "Член совета дома",
    AUDITOR: "Ревизор",
    REVISION_MEMBER: "Член ревизионной комиссии",
    REVISION_COMMISSION_MEMBER: "Член ревизионной комиссии",
    ADMIN: "Администратор",
    SYSTEM_ADMIN: "Администратор системы",
  };

  return labels[normalized] || role;
}

export function propertyTypeLabel(type: string) {
  const normalized = type.trim().toUpperCase();
  const labels: Record<string, string> = {
    APARTMENT: "Квартира",
    COMMERCIAL: "Нежилое помещение",
    COMMERCIAL_ROOM: "Нежилое помещение",
    NON_RESIDENTIAL: "Нежилое помещение",
    PARKING: "Паркинг",
    STORAGE: "Кладовая",
    STOREROOM: "Кладовая",
  };

  return labels[normalized] || type;
}
