import { useState, useEffect, useRef } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { getFullWeekRange, getWeekKey, getDateFromWeekKey, addDaysToIsoDate, parseTimeToMinutes, removePolishAccents } from "../helpers";
import MoodChart from "./MoodChart";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import qrCodeImage from '../assets/images/cbt-qr-code.png';

const DAYS = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];
const HOURS = Array.from({ length: 20 }, (_, i) => String((i + 7) % 24).padStart(2, "0"));
const CBT_DAY_START_MINUTES = 7 * 60;
const CBT_DAY_END_EXCLUSIVE_MINUTES = 3 * 60;

const getDateIso = (weekKey, dayIndex) => {
  const d = getDateFromWeekKey(weekKey, dayIndex);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const getCbtDayActivities = (dateIso, allActivities) => {
  const nextDate = addDaysToIsoDate(dateIso, 1);
  return allActivities.filter((act) => {
    const mins = parseTimeToMinutes(act.hour);
    if (act.date === dateIso) return mins !== null && mins >= CBT_DAY_START_MINUTES;
    if (act.date === nextDate) return mins !== null && mins < CBT_DAY_END_EXCLUSIVE_MINUTES;
    return false;
  });
};

const WeekFocusMap = ({ weekKey, allActivities }) => {
  const rows = DAYS.map((day, i) => {
    const dateIso = getDateIso(weekKey, i);
    const dayActs = getCbtDayActivities(dateIso, allActivities);
    const statesByHour = HOURS.map((h) => dayActs.find((a) => a.hour?.startsWith(`${h}:`))?.focusState);
    return { day, statesByHour };
  });

  return (
    <div className="overflow-x-auto">
      <table className="table w-full" style={{ fontSize: '9px' }}>
        <thead>
          <tr>
            <th className="text-[9px] text-base-content/60 bg-base-100 py-1 px-1">Dzień</th>
            {HOURS.map((h) => (
              <th key={h} className="text-center text-[9px] text-base-content/60 py-1 px-0">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.day}>
              <th className="bg-base-200 text-left text-[9px] !p-1 rounded-none whitespace-nowrap">{row.day.substring(0, 3)}</th>
              {row.statesByHour.map((state, idx) => {
                let cellClass = "bg-base-100";
                let label = "";
                if (state === "chaos") { cellClass = "bg-warning text-warning-content"; label = "CH"; }
                else if (state === "hiperfokus") { cellClass = "bg-primary text-primary-content"; label = "F"; }
                else if (state) { cellClass = "bg-info/20 text-info"; label = "OK"; }
                return (
                  <td key={idx} className={`text-center ${cellClass} !p-0`} style={{ height: '16px' }}>
                    <span className="text-[8px] font-bold">{label}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-3 text-[10px] mt-2 px-1">
        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-warning inline-block" />Chaos</div>
        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-info/20 inline-block" />Balans</div>
        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-primary inline-block" />Hiperfokus</div>
        <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-base-200 border border-base-300 inline-block" />Brak</div>
      </div>
    </div>
  );
};

const WeeklySummariesOverview = ({ db, targetUid, onNavigateToWeek }) => {
  const [weeks, setWeeks] = useState([]);
  const [allActivities, setAllActivities] = useState([]);
  const [selectedWeekKeys, setSelectedWeekKeys] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const chartRefs = useRef({});

  const currentWeekIso = getWeekKey(new Date());

  const parseWeekKey = (wk) => {
    const [year, week] = wk.split("-W").map(Number);
    return year * 100 + week;
  };

  useEffect(() => {
    if (!targetUid) { setWeeks([]); return; }
    const q = query(collection(db, "weeklyData"), where("userId", "==", targetUid));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => d.data());
      // Sortuj malejąco — aktualny (najnowszy) tydzień na górze
      data.sort((a, b) => parseWeekKey(b.weekKey) - parseWeekKey(a.weekKey));
      setWeeks(data);
    });
    return () => unsub();
  }, [db, targetUid]);

  useEffect(() => {
    if (!targetUid) { setAllActivities([]); return; }
    const q = query(collection(db, "activities"), where("userId", "==", targetUid));
    const unsub = onSnapshot(q, (snap) => {
      setAllActivities(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    });
    return () => unsub();
  }, [db, targetUid]);

  const toggleWeek = (weekKey) => {
    setSelectedWeekKeys((prev) =>
      prev.includes(weekKey) ? prev.filter((k) => k !== weekKey) : [...prev, weekKey]
    );
  };

  const orderedSelectedWeeks = weeks.filter((w) => selectedWeekKeys.includes(w.weekKey));

  const exportToPDF = async () => {
    if (orderedSelectedWeeks.length === 0) return;
    setIsExporting(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = 297;
      const rightMargin = 10;
      const qrSize = 35;
      const qrX = pageW - rightMargin - qrSize;
      const centerX = qrX + qrSize / 2;

      const firstRange = getFullWeekRange(orderedSelectedWeeks[orderedSelectedWeeks.length - 1].weekKey);
      const lastRange = getFullWeekRange(orderedSelectedWeeks[0].weekKey);
      const dateRangeLabel = orderedSelectedWeeks.length === 1
        ? firstRange
        : `${firstRange.split(' - ')[0]} - ${lastRange.split(' - ')[1]}`;

      // STRONA 1: header + spis tygodni
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(79, 70, 229);
      doc.text(removePolishAccents("Zestawienie Tygodni"), 14, 16);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(removePolishAccents(dateRangeLabel), 14, 23);

      doc.setTextColor(128, 128, 128);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Katarzyna Walenko", centerX, 16, { align: 'center' });
      doc.addImage(qrCodeImage, 'PNG', qrX, 19, qrSize, qrSize);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text("Zobacz wiecej w aplikacji", centerX, 56, { align: 'center' });
      doc.text("CBT Planer", centerX, 60, { align: 'center' });

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(removePolishAccents("Wybrane tygodnie:"), 14, 32);

      const tableRows = orderedSelectedWeeks.map((w) => [
        w.weekKey,
        removePolishAccents(getFullWeekRange(w.weekKey))
      ]);
      autoTable(doc, {
        head: [["Tydzien", "Daty"]],
        body: tableRows,
        startY: 35,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [79, 70, 229] },
        columnStyles: { 0: { cellWidth: 30 } },
        margin: { right: qrSize + rightMargin + 15 }
      });

      // KOLEJNE STRONY: jedna na tydzień
      for (const week of orderedSelectedWeeks) {
        doc.addPage();
        const weekRange = getFullWeekRange(week.weekKey);

        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(79, 70, 229);
        doc.text(removePolishAccents(`Tydzien: ${week.weekKey}`), 14, 16);

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(removePolishAccents(weekRange), 14, 22);

        doc.setTextColor(128, 128, 128);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Katarzyna Walenko", centerX, 16, { align: 'center' });
        doc.addImage(qrCodeImage, 'PNG', qrX, 19, qrSize, qrSize);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0, 0, 0);
        doc.text("Zobacz wiecej w aplikacji", centerX, 56, { align: 'center' });
        doc.text("CBT Planer", centerX, 60, { align: 'center' });

        let currentY = 28;

        // Wykres nastroju
        const chartEl = chartRefs.current[week.weekKey];
        if (chartEl) {
          try {
            const canvas = await html2canvas(chartEl, { backgroundColor: '#ffffff', scale: 2 });
            const maxChartWidth = 170;
            const maxChartHeight = 56;
            let chartWidth = maxChartWidth;
            let chartHeight = (canvas.height * chartWidth) / canvas.width;
            if (chartHeight > maxChartHeight) {
              chartHeight = maxChartHeight;
              chartWidth = (canvas.width * chartHeight) / canvas.height;
            }

            doc.addImage(canvas.toDataURL('image/png'), 'PNG', 10, currentY, chartWidth, chartHeight);
            currentY += chartHeight + 8;
          } catch (e) { currentY += 5; }
        }

        // Mapa skupienia
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(removePolishAccents("Tygodniowa Mapa Skupienia (ADHD)"), 14, currentY);
        currentY += 5;

        const mapHead = [removePolishAccents("Dzien/Godz"), ...HOURS];
        const mapRows = DAYS.map((day, i) => {
          const dateIso = getDateIso(week.weekKey, i);
          const dayActs = getCbtDayActivities(dateIso, allActivities);
          const row = [removePolishAccents(day.substring(0, 3))];
          HOURS.forEach(h => {
            const act = dayActs.find(a => a.hour?.startsWith(`${h}:`));
            if (act) {
              const state = act.focusState || 'spokoj';
              if (state === 'chaos') row.push({ content: 'CH', styles: { fillColor: [251,191,36], textColor: [255,255,255], fontStyle: 'bold' } });
              else if (state === 'hiperfokus') row.push({ content: 'F', styles: { fillColor: [147,51,234], textColor: [255,255,255], fontStyle: 'bold' } });
              else row.push({ content: 'OK', styles: { fillColor: [224,242,254], textColor: [12,74,110], fontStyle: 'bold' } });
            } else {
              row.push({ content: '', styles: { fillColor: [245,245,245] } });
            }
          });
          return row;
        });

        autoTable(doc, {
          head: [mapHead],
          body: mapRows,
          startY: currentY,
          theme: 'grid',
          headStyles: { fillColor: [255,255,255], textColor: [0,0,0], halign: 'center', fontSize: 7, lineWidth: 0.2, lineColor: [180,180,180] },
          styles: { fontSize: 7, cellPadding: 1, minCellHeight: 6, halign: 'center', valign: 'middle' },
          columnStyles: { 0: { cellWidth: 18, halign: 'left', fontStyle: 'bold', fillColor: [255,255,255], textColor: [0,0,0] } }
        });

        const legendY = doc.lastAutoTable.finalY + 4;
        doc.setFillColor(251,191,36); doc.rect(14, legendY, 4, 4, 'F');
        doc.setFontSize(7); doc.setFont("helvetica","normal"); doc.setTextColor(0,0,0);
        doc.text("Chaos", 20, legendY + 3);
        doc.setFillColor(224,242,254); doc.rect(36, legendY, 4, 4, 'F');
        doc.text("Balans", 42, legendY + 3);
        doc.setFillColor(147,51,234); doc.rect(60, legendY, 4, 4, 'F');
        doc.setTextColor(0,0,0); doc.text("Hiperfokus", 66, legendY + 3);
      }

      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`Strona ${i} z ${pageCount}`, pageW - 10, 205, { align: 'right' });
      }

      doc.save(`zestawienie-tygodni-${new Date().toISOString().split('T')[0]}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-base-200 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-primary mb-2">Zestawienie Tygodni</h1>
          <p className="text-base-content/70 text-sm">
            Zaznacz tygodnie, aby zobaczyć ich zestawienie poniżej.
          </p>
        </header>

        {orderedSelectedWeeks.length > 0 && (
          <div className="flex justify-end mb-4">
            <button
              className="btn btn-sm btn-outline btn-accent"
              onClick={exportToPDF}
              disabled={isExporting}
            >
              {isExporting ? 'Generowanie...' : `Pobierz PDF (${orderedSelectedWeeks.length} tygodni)`}
            </button>
          </div>
        )}

        {/* Lista tygodni z checkboxami */}
        <div className="card bg-base-100 shadow-md p-4 mb-8">
          {weeks.length === 0 ? (
            <p className="text-center py-8 opacity-50">Brak danych tygodniowych.</p>
          ) : (
            <div className="divide-y divide-base-200">
              {weeks.map((week) => (
                <div key={week.weekKey} className="flex items-center justify-between gap-3 py-2">
                  <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary checkbox-sm flex-shrink-0"
                      checked={selectedWeekKeys.includes(week.weekKey)}
                      onChange={() => toggleWeek(week.weekKey)}
                    />
                    <span className={`font-mono text-sm font-bold flex-shrink-0 ${
                      week.weekKey === currentWeekIso ? "text-primary" : ""
                    }`}>
                      {week.weekKey}{week.weekKey === currentWeekIso && <span className="badge badge-primary badge-xs ml-2 p-2">bieżący</span>}
                    </span>
                    <span className="text-sm text-base-content/60 truncate">{getFullWeekRange(week.weekKey)}</span>
                  </label>
                  <button
                    className="btn btn-xs btn-ghost text-primary flex-shrink-0"
                    onClick={() => onNavigateToWeek(week.weekKey)}
                  >
                    Otwórz →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Zestawienie wybranych tygodni — grid 2 kolumny na desktop */}
        {orderedSelectedWeeks.length > 0 && (
          <>
            <div className="divider text-base-content/50 text-sm mb-6">Zestawienie wybranych tygodni</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
              {orderedSelectedWeeks.map((week) => (
                <div key={week.weekKey} className="card bg-base-100 shadow-md border-t-4 border-primary rounded-none">
                  <div className="card-body p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-primary text-sm">{week.weekKey}</h3>
                          {week.weekKey === currentWeekIso && (
                            <span className="badge badge-primary badge-xs p-2">Bieżący tydzień</span>
                          )}
                        </div>
                        <p className="text-xs text-base-content/60">{getFullWeekRange(week.weekKey)}</p>
                      </div>
                      <button
                        className="btn btn-xs btn-outline btn-primary"
                        onClick={() => onNavigateToWeek(week.weekKey)}
                      >
                        Otwórz →
                      </button>
                    </div>

                    <div className="divider text-[10px] my-1">Wykres nastroju</div>
                    <div style={{ height: '200px' }}>
                      <MoodChart plannedActivities={week.plannedActivities} compact />
                    </div>

                    {/* Ukryty kontener do renderowania wykresu dla PDF */}
                    <div
                      ref={(el) => { chartRefs.current[week.weekKey] = el; }}
                      style={{ position: 'absolute', left: '-9999px', top: 0, width: '760px', height: '240px', backgroundColor: '#ffffff', padding: '12px' }}
                    >
                      <MoodChart plannedActivities={week.plannedActivities} compact />
                    </div>

                    <div className="divider text-[10px] mt-3 mb-1">Mapa skupienia (ADHD)</div>
                    <WeekFocusMap weekKey={week.weekKey} allActivities={allActivities} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WeeklySummariesOverview;
