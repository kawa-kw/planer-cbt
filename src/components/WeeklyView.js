import { useState, useEffect } from "react";
import { doc, onSnapshot, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
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
      const day = new Date(initialDate).getDay();
      return day === 0 ? 6 : day - 1;
    }
    return 0;
  });

  const currentDayName = DAYS[activeDayIndex];
  const weekRange = getFullWeekRange(currentWeekKey);

  const goToNextWeek = () => setCurrentWeekKey(prev => getAdjacentWeekKey(prev, "next"));
  const goToPreviousWeek = () => setCurrentWeekKey(prev => getAdjacentWeekKey(prev, "prev"));

  useEffect(() => {
    if (!currentWeekKey) setCurrentWeekKey(getWeekKey(new Date()));
  }, [currentWeekKey]);

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
        await updateDoc(docRef, newData);
      } else {
        await updateDoc(docRef, { summaries: { ...weeklyData.summaries, ...newData } });
      }
    } catch (error) {
      console.error("Błąd aktualizacji tygodnia:", error);
    }
  };

  const handleDayUpdate = async (dayData) => {
    if (isReadOnly) return;
    const currentDayName = DAYS[activeDayIndex];
    const docRef = doc(db, "weeklyData", `${targetUid}_${currentWeekKey}`);

    await updateDoc(docRef, {
      [`plannedActivities.${currentDayName}`]: dayData
    });
  };

  // --- FUNKCJA EKSPORTU PDF ---
  const exportWeeklyToPDF = async () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const weekRange = getFullWeekRange(currentWeekKey);

    // 1. Pobieramy WSZYSTKIE aktywności z widoku dziennego dla tego użytkownika
    // (Pobieramy raz, a potem filtrujemy w pętli dla wydajności)
    let allDailyActivities = [];
    try {
      const q = query(collection(db, "activities"), where("userId", "==", targetUid));
      const querySnapshot = await getDocs(q);
      allDailyActivities = querySnapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.log("Błąd pobierania aktywności dziennych:", error);
    }

    // STRONA 1: PODSUMOWANIE TYGODNIA
    doc.setFontSize(18);
    doc.setTextColor(79, 70, 229);
    doc.text(removePolishAccents(`Podsumowanie Tygodnia: ${weekRange}`), 14, 15);
    doc.setTextColor(0, 0, 0);

    const metricsData = [
      ["Poczatek Tygodnia", `Nastroj: ${weeklyData?.moodStart ?? 0}/10`, `Energia: ${weeklyData?.energyStart ?? 0}/10`],
      ["Koniec Tygodnia", `Nastroj: ${weeklyData?.moodEnd ?? 0}/10`, `Energia: ${weeklyData?.energyEnd ?? 0}/10`]
    ];

    autoTable(doc, {
      head: [["Okres", "Nastroj (srednia)", "Energia (srednia)"]],
      body: metricsData,
      startY: 25,
      theme: 'grid',
      headStyles: { fillColor: [220, 220, 220], textColor: 50 },
      styles: { fontSize: 10, halign: 'center' }
    });

    let finalY = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.text(removePolishAccents("Refleksje i Wnioski (CBT)"), 14, finalY);
    finalY += 8;

    const s = weeklyData?.summaries || {};
    const summaryItems = [
      { label: "Co pomoglo najbardziej:", value: s.mostHelpful },
      { label: "Co bylo najtrudniejsze:", value: s.hardest },
      { label: "Pozytywny wplyw na nastroj:", value: s.positiveInfluence },
      { label: "Cel na przyszly tydzien:", value: s.nextWeekGoal }
    ];

    doc.setFontSize(11);
    summaryItems.forEach((item) => {
      doc.setFont("helvetica", "bold");
      doc.text(removePolishAccents(item.label), 14, finalY);
      finalY += 6;
      doc.setFont("helvetica", "normal");
      const splitText = doc.splitTextToSize(removePolishAccents(item.value || "- brak wpisu -"), 260);
      doc.text(splitText, 14, finalY);
      finalY += (splitText.length * 5) + 8;
      if (finalY > 180) { doc.addPage(); finalY = 20; }
    });

    // STRONY 2-8: SZCZEGÓŁY DLA KAŻDEGO DNIA
    for (let i = 0; i < DAYS.length; i++) {
      const day = DAYS[i];
      doc.addPage();
      const dateObj = getDateFromWeekKey(currentWeekKey, i);
      const dateStringPL = dateObj.toLocaleDateString("pl-PL"); // np. 15.01.2024 (do nagłówka)

      // Formatowanie daty do porównania z bazą (YYYY-MM-DD)
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const dateStringISO = `${yyyy}-${mm}-${dd}`;

      const dayData = weeklyData?.plannedActivities?.[day] || {};

      // Nagłówek Dnia
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(79, 70, 229);
      doc.text(removePolishAccents(`${day} (${dateStringPL})`), 14, 15);
      doc.setTextColor(0, 0, 0);

      // TABELA 1: Plan Aktywizacji (Główny cel z widoku tygodniowego)
      doc.setFontSize(12);
      doc.text(removePolishAccents("Plan Aktywizacji (Glowny Cel)"), 14, 25);

      const activityRow = [
        removePolishAccents(dayData.activity || ""),
        removePolishAccents(dayData.category || ""),
        removePolishAccents(dayData.status || "nie"),
        dayData.moodAfter ?? "-",
        dayData.energyAfter ?? "-"
      ];

      autoTable(doc, {
        head: [["Aktywnosc", "Kategoria", "Wykonano", "Nastroj po", "Energia po"]],
        body: [activityRow],
        startY: 30,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 10 }
      });

      // TABELA 2: Monitoring Dobowy Nastroju
      let trackerY = doc.lastAutoTable.finalY + 10;
      doc.text(removePolishAccents("Monitoring Dobowy Nastroju"), 14, trackerY);

      const tracker = dayData.moodTracker || {};
      const trackerRows = ['rano', 'poludnie', 'wieczor'].map(pora => [
        removePolishAccents(pora.charAt(0).toUpperCase() + pora.slice(1)),
        tracker[pora]?.mood ?? "-",
        tracker[pora]?.energy ?? "-",
        removePolishAccents(tracker[pora]?.note || "")
      ]);

      autoTable(doc, {
        head: [["Pora", "Nastroj", "Energia", "Notatka / Sytuacja"]],
        body: trackerRows,
        startY: trackerY + 5,
        theme: 'striped',
        headStyles: { fillColor: [236, 72, 153] },
        styles: { fontSize: 10 },
        columnStyles: { 3: { cellWidth: 100 } }
      });

      // TABELA 3: Dzienny plan aktywności – CBT (Szczegółowa tabela z Widoku Dziennego)
      let logY = doc.lastAutoTable.finalY + 15;
      doc.text(removePolishAccents("Dzienny plan aktywnosci - CBT"), 14, logY);

      // Filtrowanie i sortowanie aktywności dla danego dnia
      const dailyActivities = allDailyActivities
        .filter(act => act.date === dateStringISO)
        .sort((a, b) => (a.hour || '').localeCompare(b.hour || ''));

      // Kolumny zgodne z MainPage.js
      const dailyColumns = [
        "Godzina",
        "Aktywnosc",
        "Kontekst",
        "Przyj. (1-10)",
        "Skut. (1-10)",
        "Emocje",
        "Sila",
        "Przyj.?",
        "Uwagi"
      ];

      const dailyRows = dailyActivities.map(act => [
        act.hour,
        removePolishAccents(act.activity || ""),
        removePolishAccents(act.context || ""),
        act.pleasure,
        act.mastery,
        removePolishAccents(act.emotion || ""),
        act.emotionIntensity,
        act.isPleasant,
        removePolishAccents(act.notes || "")
      ]);

      if (dailyRows.length === 0) {
        dailyRows.push(["-", "Brak wpisow w widoku dziennym", "-", "-", "-", "-", "-", "-", "-"]);
      }

      autoTable(doc, {
        head: [dailyColumns],
        body: dailyRows,
        startY: logY + 5,
        theme: 'grid',
        // Stylowanie zgodne z MainPage.js
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
        styles: { fontSize: 9, cellPadding: 3 },
        columnStyles: { 8: { cellWidth: 50 } } // Uwagi węższe, żeby się zmieściło
      });
    }

    // Stopka
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Strona ${i} z ${pageCount}`, 280, 200, { align: 'right' });
    }

    doc.save(`raport-tygodniowy-${currentWeekKey}.pdf`);
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
     
      <h2 className="text-2xl md:text-3xl font-bold text-secondary my-8 text-center">
        Podsumowanie Tygodnia
      </h2>
      {/* Tabela Nastroju i Energii - Początek tygodnia */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
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
      <MoodChart className="hidden lg:block" plannedActivities={weeklyData?.plannedActivities} />
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
