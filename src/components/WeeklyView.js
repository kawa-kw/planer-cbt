import { useState, useEffect } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import DayPlanDetail from "./DayPlanDetail";
import { getAdjacentWeekKey, getDateFromWeekKey, getFullWeekRange, getWeekKey, removePolishAccents } from "../helpers";
import WeeklySummary from "./WeeklySummary";
import MoodChart from "./MoodChart";

const DAYS = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];

const WeeklyView = ({ db, targetUid, isReadOnly, initialDate }) => {
  const [weeklyData, setWeeklyData] = useState(null);
  const [currentWeekKey, setCurrentWeekKey] = useState("");
  const [activeDayIndex, setActiveDayIndex] = useState(() => {
    if (initialDate) {
      // Pobieramy numer dnia (0 dla Niedzieli, 1 dla Poniedziałku...)
      const day = new Date(initialDate).getDay();
      // Konwertujemy na Twój format (0-Poniedziałek, 6-Niedziela)
      return day === 0 ? 6 : day - 1;
    }
    return 0;
  });

  const currentDayName = DAYS[activeDayIndex];
  const weekRange = getFullWeekRange(currentWeekKey);

  const goToNextWeek = () => setCurrentWeekKey(prev => getAdjacentWeekKey(prev, "next"));
  const goToPreviousWeek = () => setCurrentWeekKey(prev => getAdjacentWeekKey(prev, "prev"));

  useEffect(() => {
    // Initialize with current week if empty
    if (!currentWeekKey) setCurrentWeekKey(getWeekKey(new Date()));
  }, []);

  useEffect(() => {
    if (!targetUid || !currentWeekKey) return;

    const docRef = doc(db, "weeklyData", `${targetUid}_${currentWeekKey}`);
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) setWeeklyData(docSnap.data());
      else setWeeklyData(null);
    });

    return () => unsub();
  }, [db, targetUid, currentWeekKey]);

  const handleWeeklyUpdate = async (newData, isTopLevel = false) => {
    if (isReadOnly) return;
    const docRef = doc(db, "weeklyData", `${targetUid}_${currentWeekKey}`);

    try {
      if (isTopLevel) {
        // Pozwala zapisać moodStart, energyStart, moodEnd, energyEnd
        await updateDoc(docRef, newData);
      } else {
        // Aktualizuje obiekt summaries (pola tekstowe)
        await updateDoc(docRef, { summaries: { ...weeklyData.summaries, ...newData } });
      }
    } catch (error) {
      console.error("Błąd aktualizacji tygodnia:", error);
    }
  };

  // Funkcja aktualizacji konkretnego dnia w dzienniku aktywizacji
  const handleDayUpdate = async (dayData) => {
    if (isReadOnly) return;
    const currentDayName = DAYS[activeDayIndex];
    const docRef = doc(db, "weeklyData", `${targetUid}_${currentWeekKey}`);

    await updateDoc(docRef, {
      [`plannedActivities.${currentDayName}`]: dayData
    });
  };

  const exportWeeklyToPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const weekRange = getFullWeekRange(currentWeekKey);
    doc.setFontSize(16);
    doc.text(removePolishAccents(`Tygodniowy plan aktywizacji: ${weekRange}`), 14, 15);

    // SEKCJA 1: Dziennik Aktywizacji
    const mainTableColumn = ["Dzien", "Aktywnosc", "Kategoria", "Wykonano", "Nastroj po", "Energia po"];
    const mainTableRows = DAYS.map(day => {
      const act = weeklyData.plannedActivities?.[day] || {};
      return [
        removePolishAccents(day), // DODANO: removePolishAccents dla nazwy dnia
        removePolishAccents(act.activity || ""),
        removePolishAccents(act.category || ""),
        removePolishAccents(act.status || ""),
        act.moodAfter || "-",
        act.energyAfter || "-"
      ];
    });

    autoTable(doc, {
      head: [mainTableColumn],
      body: mainTableRows,
      startY: 25,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 8 }
    });

    // SEKCJA 2: Monitoring Dobowy Nastroju
    doc.addPage();
    doc.setFontSize(14);
    doc.text(removePolishAccents("Monitoring Dobowy Nastroju"), 14, 15);

    const moodTableColumn = ["Dzien", "Pora", "Nastroj", "Energia", "Notatka"];
    const moodTableRows = [];

    DAYS.forEach(day => {
      const tracker = weeklyData.plannedActivities?.[day]?.moodTracker || {};
      ['rano', 'poludnie', 'wieczor'].forEach((pora, idx) => {
        moodTableRows.push([
          // DODANO: removePolishAccents dla nazwy dnia
          idx === 0 ? removePolishAccents(day) : "",
          pora.charAt(0).toUpperCase() + pora.slice(1),
          tracker[pora]?.mood || "-",
          tracker[pora]?.energy || "-",
          removePolishAccents(tracker[pora]?.note || "")
        ]);
      });
    });

    autoTable(doc, {
      head: [moodTableColumn],
      body: moodTableRows,
      startY: 25,
      theme: 'striped',
      headStyles: { fillColor: [236, 72, 153] },
      styles: { fontSize: 7 }
    });

    // SEKCJA 3: Podsumowanie (upewnij się, że s.mostHelpful itp. też mają removePolishAccents)
    let finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.text(removePolishAccents("Podsumowanie Tygodnia (CBT)"), 14, finalY);

    const s = weeklyData.summaries || {};
    doc.setFontSize(9);
    doc.text(removePolishAccents(`Co pomoglo: ${s.mostHelpful || ""}`), 14, finalY + 7);
    doc.text(removePolishAccents(`Najtrudniejsze: ${s.hardest || ""}`), 14, finalY + 14);

    doc.save(`plan-tygodniowy-${currentWeekKey}.pdf`);
  };

  const currentDayDate = currentWeekKey
    ? getDateFromWeekKey(currentWeekKey, activeDayIndex).toLocaleDateString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    : "";


  return (
    <div className="min-h-screen bg-base-200 p-4 md:p-8">
      {/* Dynamiczny Nagłówek Tygodniowy */}
      <div className="text-center mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-primary flex justify-center items-center gap-2">
          Tygodniowy plan aktywizacji
        </h1>
        <div className="flex justify-center gap-6 items-center my-4">
          <button className="btn btn-outline btn-secondary btn-xs" onClick={goToPreviousWeek}>← <span className="hidden md:inline ml-1">Poprzedni tydzień</span></button>
          <span className="text-xs md:text-base font-bold">{weekRange}</span>
          <button className="btn btn-outline btn-secondary btn-xs" onClick={goToNextWeek}><span className="hidden md:inline mr-1">Następny tydzień</span> →</button>
        </div>
        {isReadOnly && <p className="badge badge-warning mt-4">Read only</p>}
      </div>
      <div className="flex justify-end gap-2 mb-4">
        <button
          onClick={exportWeeklyToPDF}
          className="btn btn-outline btn-accent btn-sm"
          disabled={!weeklyData}
        >
          Eksportuj Tydzień (PDF)
        </button>
      </div>
      <MoodChart className="hidden lg:block" plannedActivities={weeklyData?.plannedActivities} />

      {/* Tabela Nastroju i Energii - Początek tygodnia */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card bg-base-100 shadow p-4">
          <h3 className="font-bold mb-2">Nastrój na początku tygodnia (0-10): {weeklyData?.moodStart || 0}</h3>
          <input
            type="range" min="0" max="10" className="range range-primary"
            disabled={isReadOnly}
            value={weeklyData?.moodStart || 0}
            onChange={(e) => handleWeeklyUpdate({ moodStart: Number(e.target.value) }, true)}
          />
        </div>
        <div className="card bg-base-100 shadow p-4">
          <h3 className="font-bold mb-2">Energia na początku tygodnia (0-10): {weeklyData?.energyStart || 0}</h3>
          <input
            type="range" min="0" max="10" className="range range-secondary"
            disabled={isReadOnly}
            value={weeklyData?.energyStart || 0}
            onChange={(e) => handleWeeklyUpdate({ energyStart: Number(e.target.value) }, true)}
          />
        </div>
      </section>

      {/* Dni Tygodnia - Nawigacja */}
      <div className="tabs tabs-boxed justify-center">
        {DAYS.map((day, index) => (
          <button
            key={day}
            className={`tab ${activeDayIndex === index ? "tab-active" : ""}`}
            onClick={() => setActiveDayIndex(index)}
          >
            {day}
          </button>
        ))}
      </div>

      {/* Przekazujemy datę do szczegółów dnia */}
      <DayPlanDetail
        data={weeklyData?.plannedActivities?.[currentDayName]}
        onSave={handleDayUpdate}
        isReadOnly={isReadOnly}
        displayDate={currentDayDate} // NOWY PROP
      />
      {/* Sekcja Podsumowania Tygodnia */}
      <WeeklySummary
        summaries={weeklyData?.summaries}
        moodEnd={weeklyData?.moodEnd}
        energyEnd={weeklyData?.energyEnd}
        onUpdate={handleWeeklyUpdate}
        isReadOnly={isReadOnly}
      />
    </div>
  );
};

export default WeeklyView;
