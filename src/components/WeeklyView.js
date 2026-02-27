import { useState, useEffect, useRef } from "react";
import { doc, onSnapshot, updateDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

import DayPlanDetail from "./DayPlanDetail";
import { getAdjacentWeekKey, getDateFromWeekKey, getFullWeekRange, getWeekKey, removePolishAccents } from "../helpers";
import WeeklySummary from "./WeeklySummary";
import MoodChart from "./MoodChart";
import qrCodeImage from '../assets/images/cbt-qr-code.png';

const DAYS = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];

const WeeklyView = ({ db, targetUid, isReadOnly, initialDate }) => {
  const chartRef = useRef(null);
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
    // Generate chart image first
    let chartImageData = null;
    if (chartRef.current && weeklyData?.plannedActivities) {
      try {
        const canvas = await html2canvas(chartRef.current, {
          backgroundColor: '#ffffff',
          scale: 2
        });
        chartImageData = canvas.toDataURL('image/png');
      } catch (error) {
        console.error('Error generating chart image:', error);
      }
    }

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

    const okTextColor = [12, 74, 110];

    // STRONA 1: PODSUMOWANIE TYGODNIA
    // Nagłówek po lewej
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(79, 70, 229);
    doc.text(removePolishAccents(`Podsumowanie Tygodnia: ${weekRange}`), 14, 15);
    
    // Prawa kolumna - wyśrodkowana względem jednej osi pionowej (z marginesem od prawej)
    const rightMargin = 10;
    const qrCodeSize = 40;
    const qrCodeX = 297 - rightMargin - qrCodeSize - 10; // 243 - z marginesem
    const centerX = qrCodeX + (qrCodeSize / 2); // Środek dla wyrównania elementów
    
    // Imię i nazwisko (szare, większe, wyrównane do linii nagłówka)
    doc.setTextColor(128, 128, 128);
    doc.setFontSize(14); 
    doc.setFont("helvetica", "bold");
    doc.text("Katarzyna Walenko", centerX, 16, { align: 'center' });
    
    // QR code pod imieniem (40mm × 40mm)
    doc.addImage(qrCodeImage, 'PNG', qrCodeX, 20, qrCodeSize, qrCodeSize);
    
    // Napisy pod QR code (wyśrodkowane)
    doc.setFontSize(8); 
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text("Zobacz wiecej w aplikacji", centerX, 62, { align: 'center' });
    doc.text("CBT Planer", centerX, 66, { align: 'center' });

    let currentY = 25; // Wykres pod tytułem

    // Wykres nastroju wyrównany do lewej krawędzi (160mm × 80mm)
    if (chartImageData) {
      const chartWidth = 160;
      const chartHeight = 80;
      const chartX = 2; // Wyrównany do lewej krawędzi
      
      doc.addImage(chartImageData, 'PNG', chartX, currentY, chartWidth, chartHeight);
      currentY += chartHeight + 15; // Margines dolny po wykresie
    }

    // Refleksje i Wnioski pod wykresem (pełna szerokość)
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.text(removePolishAccents("Refleksje i Wnioski (CBT)"), 14, currentY);
    currentY += 8;

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
      doc.text(removePolishAccents(item.label), 14, currentY);
      currentY += 5;
      doc.setFont("helvetica", "normal");
      const splitText = doc.splitTextToSize(removePolishAccents(item.value || "- brak wpisu -"), 260);
      doc.text(splitText, 14, currentY);
      currentY += (splitText.length * 4) + 4;
    });

    let finalY = currentY + 10;

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
            row.push({ content: 'OK', styles: { fillColor: [224, 242, 254], textColor: [12, 74, 110], fontStyle: 'bold' } });
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

    doc.setGState(new doc.GState({opacity: 0.3})); doc.setFillColor(58, 191, 248); doc.rect(36, legendY, 5, 5, 'F'); doc.setGState(new doc.GState({opacity: 1.0}));
    doc.setTextColor(12, 74, 110); doc.setFontSize(5); doc.setFont("helvetica", "bold"); doc.text("OK", 38.5, legendY + 3.5, { align: 'center' });
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
      doc.setTextColor(0,0,0);
      doc.text(removePolishAccents(`${day} (${dateStringPL})`), 14, 15);
      // Add QR code in top right corner (zmniejszony o 1/3)
      doc.addImage(qrCodeImage, 'PNG', 260, 10, 16.67, 16.67);

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(removePolishAccents("Plan Aktywizacji (Glowny Cel)"), 14, 30);

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
        startY: 35,
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
          else { doc.setGState(new doc.GState({opacity: 0.3})); doc.setFillColor(58, 191, 248); letter = 'OK'; }

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

        doc.setGState(new doc.GState({opacity: 0.3})); doc.setFillColor(58, 191, 248); doc.rect(36, mapY, 5, 5, 'F'); doc.setGState(new doc.GState({opacity: 1.0}));
        doc.setTextColor(12, 74, 110); doc.setFontSize(5); doc.setFont("helvetica", "bold"); doc.text("OK", 38.5, mapY + 3.5, { align: 'center' });
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
              else { data.cell.styles.textColor = [58, 191, 248]; data.cell.styles.fontStyle = 'bold'; }
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
                    else if (state) { cellClass = "bg-info/20 text-info"; label = "OK"; }

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
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded inline-block bg-info/20" /><span>Balans (OK)</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-primary inline-block" /><span>Hiperfokus (F)</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-base-200 inline-block" /><span>Brak danych</span></div>
        </div>

        <div className="divider my-8" />
        <MoodChart className="hidden lg:block" plannedActivities={weeklyData?.plannedActivities} />
      </div>

      {/* Hidden chart for PDF export */}
      {weeklyData?.plannedActivities && (
        <div ref={chartRef} style={{ position: 'absolute', left: '-9999px', width: '800px', height: '400px', backgroundColor: '#ffffff', padding: '20px' }}>
          <MoodChart plannedActivities={weeklyData.plannedActivities} />
        </div>
      )}

      {activeDayIndex === 6 && (
        <section className="animate-fade-in">
          <WeeklySummary
            summaries={weeklyData?.summaries}
            onUpdate={handleWeeklyUpdate}
            isReadOnly={isReadOnly}
          />
        </section>
      )}
    </div>
  );
};

export default WeeklyView;
