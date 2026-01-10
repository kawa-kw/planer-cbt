/**
 * Generuje klucz tygodnia w formacie RRRR-Wxx (np. 2024-W42), 
 * gdzie tydzień zawsze zaczyna się w poniedziałek.
 */

export const getWeekKey = (date) => {
  const d = new Date(date);
  // Ustawienie na czwartek w bieżącym tygodniu (standard ISO 8601)
  // To gwarantuje, że zawsze trafimy w poprawny numer tygodnia roku
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

  return `${d.getFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
};

/**
 * Zwraca datę dla konkretnego dnia tygodnia w wybranym kluczu tygodnia
 * @param {string} weekKey - Format "YYYY-Www"
 * @param {number} dayIndex - 0 dla Poniedziałku, 6 dla Niedzieli
 */

export const getDateFromWeekKey = (weekKey, dayIndex) => {
  const [year, week] = weekKey.split("-W");
  // Ustawienie na 4 stycznia (zawsze w 1. tygodniu roku wg ISO)
  const simple = new Date(year, 0, 4);
  const dayOffset = (simple.getDay() || 7) - 1;
  const dayOne = new Date(simple.getTime() - dayOffset * 86400000);

  const weekOffset = (parseInt(week) - 1) * 7;
  const targetDate = new Date(dayOne.getTime() + (weekOffset + dayIndex) * 86400000);

  return targetDate.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

/**
 * Zwraca zakres dat dla danego tygodnia do wyświetlenia w UI
 */
export const getWeekRangeDisplay = (date) => {
  const curr = new Date(date);
  const first = curr.getDate() - (curr.getDay() || 7) + 1;
  const last = first + 6;

  const firstDay = new Date(curr.setDate(first)).toLocaleDateString();
  const lastDay = new Date(curr.setDate(last)).toLocaleDateString();
  return `${firstDay} – ${lastDay}`;
};

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

export const removePolishAccents = (str) => {
  if (typeof str !== 'string') return str;
  const map = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
  };
  return str.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (match) => map[match]);
};
