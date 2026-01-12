/**
 * Generuje klucz tygodnia w formacie RRRR-Wxx (np. 2024-W42),
 * gdzie tydzień zawsze zaczyna się w poniedziałek.
 */
export const getWeekKey = (date) => {
  const d = new Date(date);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7)); // ISO 8601 alignment
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
};

/**
 * Zwraca obiekt Date dla konkretnego dnia tygodnia w wybranym kluczu tygodnia
 */
export const getDateFromWeekKey = (weekKey, dayIndex) => {
  const [year, week] = weekKey.split("-W");
  const simple = new Date(year, 0, 4);
  const dayOffset = (simple.getDay() || 7) - 1;
  const dayOne = new Date(simple.getTime() - dayOffset * 86400000);
  const weekOffset = (parseInt(week) - 1) * 7;
  const targetDate = new Date(dayOne.getTime() + (weekOffset + dayIndex) * 86400000);
  return targetDate;
};

/**
 * Zwraca zakres dat tygodnia w formacie przyjaznym dla użytkownika
 */
export const getFullWeekRange = (weekKey) => {
  if (!weekKey) return "";
  const [year, week] = weekKey.split("-W");
  const simple = new Date(year, 0, 4);
  const dayOffset = (simple.getDay() || 7) - 1;
  const dayOne = new Date(simple.getTime() - dayOffset * 86400000);
  const weekOffset = (parseInt(week) - 1) * 7;
  const startDate = new Date(dayOne.getTime() + weekOffset * 86400000);
  const endDate = new Date(startDate.getTime() + 6 * 86400000);
  const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
  return `${startDate.toLocaleDateString('pl-PL', options)} - ${endDate.toLocaleDateString('pl-PL', options)}`;
};

/**
 * Zwraca klucz sąsiedniego tygodnia (poprzedni/następny)
 */
export const getAdjacentWeekKey = (weekKey, direction) => {
  const currentDate = getDateFromWeekKey(weekKey, 0);
  const offset = direction === "next" ? 7 : -7;
  const newDate = new Date(currentDate);
  newDate.setDate(newDate.getDate() + offset);
  return getWeekKey(newDate);
};

/**
 * Zwraca etykietę dnia w formacie "Poniedziałek, 12 stycznia 2026"
 */
export const getDayLabel = (weekKey, dayIndex) => {
  const date = getDateFromWeekKey(weekKey, dayIndex);
  return date.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

/**
 * Usuwa polskie znaki diakrytyczne
 */
export const removePolishAccents = (str) => {
  if (typeof str !== 'string') return str;
  const map = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
  };
  return str.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (m) => map[m]);
};
