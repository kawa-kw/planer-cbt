import { useState, useEffect } from "react";
import { doc, onSnapshot, updateDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import DayPlanDetail from "./DayPlanDetail";
import { getAdjacentWeekKey, getDateFromWeekKey, getFullWeekRange, getWeekKey, removePolishAccents } from "../helpers";
import WeeklySummary from "./WeeklySummary";
import MoodChart from "./MoodChart";
import qrCodeImage from '../assets/images/cbt-qr-code.png';

const DAYS = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];

const WeeklyView = ({ db, targetUid, isReadOnly, initialDate }) => {
  const [weeklyData, setWeeklyData] = useState(null);
  const [weeklyActivities, setWeeklyActivities] = useState([]);
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
  const currentWeekIso = getWeekKey(new Date());

  const goToNextWeek = () => setCurrentWeekKey(prev => getAdjacentWeekKey(prev, "next"));
  const goToPreviousWeek = () => setCurrentWeekKey(prev => getAdjacentWeekKey(prev, "prev"));
  const goToCurrentWeek = () => setCurrentWeekKey(currentWeekIso);

  useEffect(() => {
    if (!currentWeekKey) setCurrentWeekKey(getWeekKey(new Date()));
  }, [currentWeekKey]);

  useEffect(() => {
    if (!targetUid || !currentWeekKey) return;

    const docRef = doc(db, "weeklyData", `${targetUid}_${currentWeekKey}`);
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setWeeklyData(docSnap.data());
      } else if (!isReadOnly) {
        const initialData = {
          userId: targetUid,
          weekKey: currentWeekKey,
          moodStart: 0,
          energyStart: 0,
          moodEnd: 0,
          energyEnd: 0,
          plannedActivities: DAYS.reduce((acc, day) => ({
            ...acc, [day]: {
              activity: "",
              category: "",
              status: "nie",
              moodAfter: 0,
              energyAfter: 0,
              moodTracker: {
                rano: { mood: 0, energy: 0, note: "" },
                poludnie: { mood: 0, energy: 0, note: "" },
                wieczor: { mood: 0, energy: 0, note: "" }
              }
            }
          }), {}),
          summaries: { mostHelpful: "", hardest: "", positiveInfluence: "", nextWeekGoal: "" }
        };
        setDoc(docRef, initialData).catch(error => console.error("Błąd tworzenia tygodnia:", error));
      } else {
        setWeeklyData(null);
      }
    });

    return () => unsub();
  }, [db, targetUid, currentWeekKey, isReadOnly]);

  useEffect(() => {
    if (!targetUid || !currentWeekKey) {
      setWeeklyActivities([]);
      return;
    }

    const q = query(collection(db, "activities"), where("userId", "==", targetUid));
    const unsub = onSnapshot(q, (querySnapshot) => {
      const data = querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setWeeklyActivities(data);
    }, (error) => {
      console.error("Błąd pobierania aktywności tygodniowych:", error);
    });

    return () => unsub();
  }, [db, targetUid, currentWeekKey]);

  const hours = Array.from({ length: 20 }, (_, i) => {
    const hour = (i + 7) % 24;
    return String(hour).padStart(2, "0");
  });

  const getWeekDateIso = (index) => {
    const dateObj = getDateFromWeekKey(currentWeekKey, index);
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const weeklyFocusRows = currentWeekKey ? DAYS.map((day, index) => {
    const dateIso = getWeekDateIso(index);
    const dailyActs = weeklyActivities.filter(act => act.date === dateIso);
    const statesByHour = hours.map(h => dailyActs.find(act => act.hour && act.hour.startsWith(`${h}:`))?.focusState);
    return { day, statesByHour };
  }) : [];

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

  const exportWeeklyToPDF = async () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const weekRange = getFullWeekRange(currentWeekKey);
    let allDailyActivities = [];
    try {
      const q = query(collection(db, "activities"), where("userId", "==", targetUid));
      const querySnapshot = await getDocs(q);
      allDailyActivities = querySnapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.log("Błąd pobierania aktywności dziennych:", error);
    }

    const okTextColor = [14, 116, 144];

    // STRONA 1: PODSUMOWANIE TYGODNIA
    doc.setFontSize(18);
    doc.setTextColor(79, 70, 229);
    doc.text(removePolishAccents(`Podsumowanie Tygodnia: ${weekRange}`), 14, 15);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10); 
    doc.text("Katarzyna Walenko", 14, 22);
    
    // Add QR code in top right corner (powiększony o 1/3)
    doc.addImage(qrCodeImage, 'PNG', 246, 8, 33.33, 33.33);
    doc.setFontSize(8); 
    doc.text("Zobacz wiecej", 252, 43);
    doc.text("w aplikacji", 254, 47);

    // Layout: Refleksje po lewej, tabela nastroju po prawej
    const leftColumnX = 14;
    const rightColumnX = 155;
    let leftY = 35;  // Zmniejszony górny margin

    // LEWA KOLUMNA: Refleksje i Wnioski
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(removePolishAccents("Refleksje i Wnioski (CBT)"), leftColumnX, leftY);
    leftY += 8;

    const s = weeklyData?.summaries || {};
    const summaryItems = [
      { label: "Co pomoglo najbardziej:", value: s.mostHelpful },
      { label: "Co bylo najtrudniejsze:", value: s.hardest },
      { label: "Pozytywny wplyw na nastroj:", value: s.positiveInfluence },
      { label: "Cel na przyszly tydzien:", value: s.nextWeekGoal }
    ];

    doc.setFontSize(10);
    summaryItems.forEach((item) => {
      doc.setFont("helvetica", "bold");
      doc.text(removePolishAccents(item.label), leftColumnX, leftY);
      leftY += 5;
      doc.setFont("helvetica", "normal");
      const splitText = doc.splitTextToSize(removePolishAccents(item.value || "- brak wpisu -"), 130);
      doc.text(splitText, leftColumnX, leftY);
      leftY += (splitText.length * 4) + 4;  // Zmniejszony odstęp dolny (było +6)
    });

    // PRAWA KOLUMNA: Tabela nastroju i energii
    // Wyrównana do dołu sekcji Refleksje
    const metricsData = [
      ["Poczatek Tygodnia", `Nastroj: ${weeklyData?.moodStart ?? 0}/10`, `Energia: ${weeklyData?.energyStart ?? 0}/10`],
      ["Koniec Tygodnia", `Nastroj: ${weeklyData?.moodEnd ?? 0}/10`, `Energia: ${weeklyData?.energyEnd ?? 0}/10`]
    ];
    
    // Wyrównaj tabelę do dołu sekcji refleksji
    const tableHeight = 26;
    const rightY = leftY - tableHeight;

    autoTable(doc, {
      head: [["Okres", "Nastroj", "Energia"]],
      body: metricsData,
      startY: rightY,
      margin: { left: rightColumnX },
      theme: 'grid',
      headStyles: { fillColor: [220, 220, 220], textColor: 50, fontSize: 9 },
      styles: { fontSize: 9, halign: 'center', cellPadding: 2 },
      tableWidth: 120
    });

    let finalY = Math.max(leftY, doc.lastAutoTable.finalY) + 10;  // Zmniejszony dolny margines (było +15)

    // --- TYGODNIOWA MAPA SKUPIENIA Z LITERAMI ---
    if (finalY > 130) { doc.addPage(); finalY = 20; }

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(removePolishAccents("Tygodniowa Mapa Skupienia (ADHD)"), 14, finalY);
    finalY += 6;

    const hours = Array.from({ length: 20 }, (_, i) => {
      const hour = (i + 7) % 24;
      return String(hour).padStart(2, '0');
    });
    const mapHeadRow = ["Dzien/Godz", ...hours];

    const mapRows = DAYS.map((day, index) => {
      const dateObj = getDateFromWeekKey(currentWeekKey, index);
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const dateStringISO = `${yyyy}-${mm}-${dd}`;
      const dailyActs = allDailyActivities.filter(act => act.date === dateStringISO);

      const row = [removePolishAccents(day)];

      hours.forEach(h => {
        const actInHour = dailyActs.find(act => act.hour && act.hour.startsWith(`${h}:`));
        if (actInHour) {
          const state = actInHour.focusState || 'spokój';
          // Dodano litery (content) do komórek
          if (state === 'chaos') {
            row.push({ content: 'CH', styles: { fillColor: [251, 191, 36], textColor: [255, 255, 255], fontStyle: 'bold' } });
          } else if (state === 'hiperfokus') {
            row.push({ content: 'F', styles: { fillColor: [147, 51, 234], textColor: [255, 255, 255], fontStyle: 'bold' } });
          } else {
            row.push({ content: 'OK', styles: { fillColor: [186, 230, 253], textColor: [14, 116, 144], fontStyle: 'bold' } });
          }
        } else {
          row.push({ content: '', styles: { fillColor: [245, 245, 245] } });
        }
      });
      return row;
    });

    autoTable(doc, {
      head: [mapHeadRow],
      body: mapRows,
      startY: finalY,
      theme: 'grid',
      headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], halign: 'center', fontSize: 8, lineWidth: 0.2, lineColor: [180, 180, 180] },
      styles: { fontSize: 8, cellPadding: 1, minCellHeight: 7, halign: 'center', valign: 'middle' },
      columnStyles: {
        0: { cellWidth: 30, halign: 'left', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] }
      }
    });

    // Legenda do tygodniowej mapy
    let legendY = doc.lastAutoTable.finalY + 5;

    doc.setFillColor(251, 191, 36); doc.rect(14, legendY, 5, 5, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.text("CH", 16.5, legendY + 3.5, { align: 'center' });
    doc.setTextColor(0, 0, 0); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text("Chaos", 21, legendY + 3.5);

    doc.setGState(new doc.GState({opacity: 0.5})); doc.setFillColor(58, 191, 248); doc.rect(36, legendY, 5, 5, 'F'); doc.setGState(new doc.GState({opacity: 1.0}));
    doc.setTextColor(14, 116, 144); doc.setFontSize(5); doc.setFont("helvetica", "bold"); doc.text("OK", 38.5, legendY + 3.5, { align: 'center' });
    doc.setTextColor(0, 0, 0); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text("Balans", 43, legendY + 3.5);

    doc.setFillColor(147, 51, 234); doc.rect(60, legendY, 5, 5, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.text("F", 62.5, legendY + 3.5, { align: 'center' });
    doc.setTextColor(0, 0, 0); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text("Hiperfokus", 67, legendY + 3.5);

    doc.setFillColor(245, 245, 245); doc.rect(88, legendY, 5, 5, 'F'); doc.text("Brak wpisu", 95, legendY + 3.5);
    // ------------------------------------------------------------------

    for (let i = 0; i < DAYS.length; i++) {
      const day = DAYS[i];
      doc.addPage();
      const dateObj = getDateFromWeekKey(currentWeekKey, i);
      const dateStringPL = dateObj.toLocaleDateString("pl-PL");
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const dateStringISO = `${yyyy}-${mm}-${dd}`;
      const dayData = weeklyData?.plannedActivities?.[day] || {};

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(79, 70, 229);
      doc.text(removePolishAccents(`${day} (${dateStringPL})`), 14, 15);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10); 
      doc.text("Katarzyna Walenko", 14, 21);
      
      // Add QR code in top right corner (zmniejszony o 1/3)
      doc.addImage(qrCodeImage, 'PNG', 254, 8, 16.67, 16.67);
      doc.setFontSize(8); 
      doc.text("Zobacz wiecej", 254, 27);
      doc.text("w aplikacji", 256, 31);

      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(removePolishAccents("Plan Aktywizacji (Glowny Cel)"), 14, 28);

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
        startY: 33,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 10 }
      });

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

      const dailyActivities = allDailyActivities
        .filter(act => act.date === dateStringISO)
        .sort((a, b) => (a.hour || '').localeCompare(b.hour || ''));

      let dynamicY = doc.lastAutoTable.finalY + 15;

      if (dailyActivities.length > 0) {
        doc.setFontSize(12); doc.setTextColor(0, 0, 0);
        doc.text(removePolishAccents("Mapa skupienia w ciagu dnia (ADHD):"), 14, dynamicY);
        let currentX = 14;
        let mapY = dynamicY;

        dailyActivities.forEach(act => {
          if (currentX > 270) { currentX = 14; mapY += 15; }
          doc.setFontSize(8);
          doc.setTextColor(0, 0, 0);
          doc.text(act.hour, currentX, mapY + 5);

          const state = act.focusState || 'spokój';
          let letter = 'OK';
          if (state === 'chaos') { doc.setFillColor(251, 191, 36); letter = 'CH'; }
          else if (state === 'hiperfokus') { doc.setFillColor(147, 51, 234); letter = 'F'; }
          else { doc.setGState(new doc.GState({opacity: 0.5})); doc.setFillColor(58, 191, 248); letter = 'OK'; }

          doc.rect(currentX, mapY + 7, 10, 5, 'F');
          if (state === 'spokój' || !state) { doc.setGState(new doc.GState({opacity: 1.0})); }

          if (state === 'spokój' || !state) {
            doc.setTextColor(...okTextColor);
          } else {
            doc.setTextColor(255, 255, 255);
          }
          doc.setFontSize(7);
          doc.setFont("helvetica", "bold");
          doc.text(letter, currentX + 5, mapY + 10.5, { align: 'center' });

          currentX += 14;
        });

        // Legenda mapy dziennej (z literami)
        mapY += 18;
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");

        doc.setFillColor(251, 191, 36); doc.rect(14, mapY, 5, 5, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.text("CH", 16.5, mapY + 3.5, { align: 'center' });
        doc.setTextColor(0, 0, 0); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text("Chaos", 21, mapY + 3.5);

        doc.setGState(new doc.GState({opacity: 0.5})); doc.setFillColor(58, 191, 248); doc.rect(36, mapY, 5, 5, 'F'); doc.setGState(new doc.GState({opacity: 1.0}));
        doc.setTextColor(14, 116, 144); doc.setFontSize(5); doc.setFont("helvetica", "bold"); doc.text("OK", 38.5, mapY + 3.5, { align: 'center' });
        doc.setTextColor(0, 0, 0); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text("Balans", 43, mapY + 3.5);

        doc.setFillColor(147, 51, 234); doc.rect(60, mapY, 5, 5, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.text("F", 62.5, mapY + 3.5, { align: 'center' });
        doc.setTextColor(0, 0, 0); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text("Hiperfokus", 67, mapY + 3.5);

        dynamicY = mapY + 15;
      }

      doc.setFontSize(12); doc.setTextColor(0, 0, 0);
      doc.text(removePolishAccents("Dzienny plan aktywnosci - CBT"), 14, dynamicY);

      const dailyColumns = ["Godzina", "Aktywnosc", "Kontekst", "Przyj.", "Skut.", "Emocje", "Sila", "Przyj.?", "Skupienie", "Uwagi"];
      const dailyRows = dailyActivities.map(act => [
        act.hour,
        removePolishAccents(act.activity || ""),
        removePolishAccents(act.context || ""),
        act.pleasure,
        act.mastery,
        removePolishAccents(act.emotion || ""),
        act.emotionIntensity,
        act.isPleasant,
        removePolishAccents(act.focusState || "spokoj"),
        removePolishAccents(act.notes || "")
      ]);

      if (dailyRows.length === 0) {
        dailyRows.push(["-", "Brak wpisow w widoku dziennym", "-", "-", "-", "-", "-", "-", "-", "-"]);
      }

      autoTable(doc, {
        head: [dailyColumns],
        body: dailyRows,
        startY: dynamicY + 5,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: { 9: { cellWidth: 40 } },
        didParseCell: function (data) {
          if (data.section === 'body') {
            if (data.column.index === 7) {
              const value = data.cell.raw;
              if (value === 'Tak') { data.cell.styles.textColor = [22, 163, 74]; data.cell.styles.fontStyle = 'bold'; }
              else if (value === 'Nie') { data.cell.styles.textColor = [220, 38, 38]; }
            }
            if (data.column.index === 8) {
              const value = data.cell.raw;
              if (value === 'chaos') { data.cell.styles.textColor = [251, 191, 36]; data.cell.styles.fontStyle = 'bold'; }
              else if (value === 'hiperfokus') { data.cell.styles.textColor = [147, 51, 234]; data.cell.styles.fontStyle = 'bold'; }
              else { data.cell.styles.textColor = [54, 203, 148]; data.cell.styles.fontStyle = 'bold'; }
            }
          }
        }
      });
    }

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
    <div className="min-h-[calc(100vh-64px)] bg-base-200 p-4 md:p-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-primary flex justify-center items-center gap-2">
          Tygodniowy plan aktywizacji
        </h1>
        <div className="relative flex flex-wrap justify-center gap-4 items-center my-4">
          <button className="btn btn-outline btn-secondary btn-xs" onClick={goToPreviousWeek}>← <span className="hidden md:inline ml-1">Poprzedni tydzień</span></button>
          <span className="text-xs md:text-base font-bold">{weekRange}</span>
          <button className="btn btn-outline btn-secondary btn-xs" onClick={goToNextWeek}><span className="hidden md:inline mr-1">Następny tydzień</span> →</button>
          {currentWeekKey && currentWeekKey !== currentWeekIso && (
            <button className="btn btn-outline btn-info btn-xs" onClick={goToCurrentWeek}>Bieżący tydzień</button>
          )}
        </div>
        {isReadOnly && <p className="badge badge-warning mt-4">Read only</p>}
      </div>
      <div className="flex justify-end gap-2 mb-4">
        <button
          onClick={exportWeeklyToPDF}
          className="btn btn-xs md:btn-sm btn-outline btn-accent"
          disabled={!weeklyData}
        >
          Eksportuj Tydzień (PDF)
        </button>
      </div>

      <div className="tabs tabs-boxed justify-center mb-6">
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

      <DayPlanDetail
        data={weeklyData?.plannedActivities?.[currentDayName]}
        onSave={handleDayUpdate}
        isReadOnly={isReadOnly}
        displayDate={currentDayDate}
      />

      <div className="divider my-8">Analiza i Podsumowanie Tygodnia</div>

      <div className="card bg-base-100 shadow-xl p-6 border-r-4 border-info rounded-r-none mb-12">
        <h3 className="text-lg font-bold text-center mb-5 text-base-content/70">Tygodniowa mapa skupienia (ADHD)</h3>
        <div className="overflow-x-auto">
          <table className="table table-xs md:w-full">
            <thead>
              <tr className="text-primary-content h-8">
                <th className="text-base-content/70 text-[11px] py-1 px-2 rounded-none">Dzień / godz.</th>
                {hours.map(hour => (
                  <th key={hour} className="text-center text-base-content/70 text-[11px] py-1">{hour}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeklyFocusRows.map(row => (
                <tr key={row.day}>
                  <th className="bg-base-200 text-left text-[11px] rounded-none !p-2">{row.day}</th>
                  {row.statesByHour.map((state, idx) => {
                    let cellClass = "bg-base-100";
                    let label = "";
                    let customStyle = null;
                    if (state === "chaos") { cellClass = "bg-warning text-warning-content"; label = "CH"; }
                    else if (state === "hiperfokus") { cellClass = "bg-primary text-primary-content"; label = "F"; }
                    else if (state) { cellClass = "bg-info text-info-content"; label = "OK"; }

                    return (
                      <td key={`${row.day}-${idx}`} className={`text-center ${cellClass} !p-0 md:!p-2`} style={customStyle}>
                        <span className="text-[10px] font-bold inline-flex items-center justify-center">{label}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs mt-3">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-warning inline-block" /><span>Chaos (CH)</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-info inline-block" /><span>Balans (OK)</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-primary inline-block" /><span>Hiperfokus (F)</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-base-200 inline-block" /><span>Brak danych</span></div>
        </div>

        <div className="divider my-8" />
        <MoodChart className="hidden lg:block" plannedActivities={weeklyData?.plannedActivities} />
      </div>

      {activeDayIndex === 0 && (
        <section className="animate-fade-in">
          <h2 className="text-xl font-bold text-primary mb-6 text-center">
            Start Tygodnia
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card bg-base-200/50 p-4">
              <h3 className="font-bold mb-2">Nastrój na początku tygodnia (0-10): {weeklyData?.moodStart || 0}</h3>
              <input
                type="range" min="0" max="10" className="range range-primary"
                disabled={isReadOnly}
                value={weeklyData?.moodStart || 0}
                onChange={(e) => handleWeeklyUpdate({ moodStart: Number(e.target.value) }, true)}
              />
              <div className="w-full flex justify-between text-xs px-2 mt-2 opacity-50">
                <span>0</span><span>5</span><span>10</span>
              </div>
            </div>
            <div className="card bg-base-200/50 p-4">
              <h3 className="font-bold mb-2">Energia na początku tygodnia (0-10): {weeklyData?.energyStart || 0}</h3>
              <input
                type="range" min="0" max="10" className="range range-secondary"
                disabled={isReadOnly}
                value={weeklyData?.energyStart || 0}
                onChange={(e) => handleWeeklyUpdate({ energyStart: Number(e.target.value) }, true)}
              />
              <div className="w-full flex justify-between text-xs px-2 mt-2 opacity-50">
                <span>0</span><span>5</span><span>10</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeDayIndex === 6 && (
        <section className="animate-fade-in">
          <WeeklySummary
            summaries={weeklyData?.summaries}
            moodEnd={weeklyData?.moodEnd}
            energyEnd={weeklyData?.energyEnd}
            onUpdate={handleWeeklyUpdate}
            isReadOnly={isReadOnly}
          />
        </section>
      )}
    </div>
  );
};

export default WeeklyView;
