import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  getFirestore, collection, addDoc, query, where,
  onSnapshot, deleteDoc, doc, updateDoc
} from "firebase/firestore";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import WeeklyView from "./WeeklyView";
import NotesView from "./NotesView";

const firebaseConfig = {
  apiKey: "AIzaSyAAWvWHUoQhdeL7PicXgMwOTRfSWVrVm9I",
  authDomain: "planer-cbt.firebaseapp.com",
  projectId: "planer-cbt",
  storageBucket: "planer-cbt.firebasestorage.app",
  messagingSenderId: "1085998206122",
  appId: "1:1085998206122:web:caed6f5dcbf017ca8014d3",
  measurementId: "G-7YVGX1NPTY"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const removePolishAccents = (str) => {
  if (typeof str !== 'string') return str;
  const map = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z'
  };
  return str.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (match) => map[match]);
};

const AngleIcon = ({ className }) => (
  <svg className={`h-5 w-5 inline-block ml-2 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
  </svg>
);

function MainPage() {
  const [activities, setActivities] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingId, setEditingId] = useState(null);

  const [formData, setFormData] = useState({
    hour: '', activity: '', context: '', pleasure: 0, mastery: 0,
    emotion: '', emotionIntensity: 0, isPleasant: 'Tak', focusState: 'spokój', notes: '', userId: ''
  });

  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const auth = getAuth(app);
  const [user, setUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [targetUid, setTargetUid] = useState(null);
  const [activeTab, setActiveTab] = useState("daily");
  const selectedDayName = new Date(selectedDate).toLocaleDateString("pl-PL", { weekday: "long" });
  const todayIso = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      const urlParams = new URLSearchParams(window.location.search);
      const viewAsUid = urlParams.get('viewAs');
      if (viewAsUid && !currentUser) {
        setIsReadOnly(true);
        setTargetUid(viewAsUid);
      } else if (currentUser) {
        setIsReadOnly(false);
        setTargetUid(currentUser.uid);
      } else {
        setTargetUid(null);
      }
    });
    return () => unsubscribe();
  }, [auth]);

  useEffect(() => {
    if (!targetUid) {
      setActivities([]);
      return;
    }
    const q = query(
      collection(db, "activities"),
      where("userId", "==", targetUid),
      where("date", "==", selectedDate)
    );
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const data = querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setActivities(data.sort((a, b) => a.hour.localeCompare(b.hour)));
    }, (error) => {
      console.error("Błąd pobierania danych:", error);
    });
    return () => unsubscribe();
  }, [selectedDate, targetUid]);

  const handleLogin = (e) => {
    e.preventDefault();
    signInWithEmailAndPassword(auth, loginEmail, loginPassword)
      .catch(err => alert("Błąd logowania: " + err.message));
  };

  const handlePasswordReset = () => {
    if (!loginEmail) {
      alert("Proszę wpisać adres e-mail w polu logowania, aby zresetować hasło.");
      return;
    }
    sendPasswordResetEmail(auth, loginEmail)
      .then(() => alert("Link do resetowania hasła został wysłany na Twój adres e-mail."))
      .catch((error) => alert("Błąd resetowania hasła: " + error.message));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        userId: user.uid,
        pleasure: Number(formData.pleasure),
        mastery: Number(formData.mastery),
        emotionIntensity: Number(formData.emotionIntensity),
        date: selectedDate
      };
      if (editingId) {
        await updateDoc(doc(db, "activities", editingId), payload);
        setEditingId(null);
      } else {
        await addDoc(collection(db, "activities"), payload);
      }
      setFormData({ hour: '', activity: '', context: '', pleasure: 0, mastery: 0, emotion: '', emotionIntensity: 0, isPleasant: 'Tak', focusState: 'spokój', notes: '', userId: '' });
    } catch (err) { alert(err); }
  };

  const startEdit = (act) => {
    setEditingId(act.id);
    setFormData({ ...act, focusState: act.focusState || 'spokój' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setIsFormExpanded(true); // Automatycznie rozwija formularz przy edycji z mapy
  };

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const title = removePolishAccents("Dzienny plan aktywnosci - nurt CBT");
    doc.setFontSize(16); doc.text(title, 14, 15);
    doc.setFontSize(11); doc.text(`Data: ${selectedDate}`, 14, 22);

    const tableColumn = ["Godzina", "Aktywnosc", "Kontekst", "Przyj.", "Skut.", "Emocje", "Sila", "Przyj.?", "Skupienie", "Uwagi"];
    const okFillColor = [54, 203, 148, 0.3];
    const okTextColor = [4, 55, 36];

    // Tabela w PDF zawiera tylko pełne wpisy (z nazwą aktywności)
    const tableRows = activities
      .filter(act => act.activity && act.activity.trim() !== '')
      .map(act => [
        act.hour,
        removePolishAccents(act.activity),
        removePolishAccents(act.context),
        act.pleasure,
        act.mastery,
        removePolishAccents(act.emotion),
        act.emotionIntensity,
        act.isPleasant,
        removePolishAccents(act.focusState || "spokoj"),
        removePolishAccents(act.notes)
      ]);

    if (tableRows.length === 0) {
      tableRows.push(["-", "Brak pelnych wpisow", "-", "-", "-", "-", "-", "-", "-", "-"]);
    }

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 30,
      styles: { fontSize: 8, font: "helvetica", cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
      columnStyles: { 9: { cellWidth: 40 } },
      didParseCell: function (data) {
        if (data.section === 'body') {
          if (data.column.index === 7) {
            const val = data.cell.raw;
            if (val === 'Tak') { data.cell.styles.textColor = [22, 163, 74]; data.cell.styles.fontStyle = 'bold'; }
            else if (val === 'Nie') { data.cell.styles.textColor = [220, 38, 38]; }
          }
          if (data.column.index === 8) {
            const val = data.cell.raw;
            if (val === 'chaos') { data.cell.styles.textColor = [251, 191, 36]; data.cell.styles.fontStyle = 'bold'; }
            else if (val === 'hiperfokus') { data.cell.styles.textColor = [147, 51, 234]; data.cell.styles.fontStyle = 'bold'; }
            else if (val !== '-') { data.cell.styles.fillColor = okFillColor; data.cell.styles.textColor = okTextColor; data.cell.styles.fontStyle = 'bold'; }
          }
        }
      }
    });

    let mapY = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(12); doc.setTextColor(0, 0, 0);
    doc.text("Mapa skupienia w ciagu dnia (wszystkie wpisy):", 14, mapY);
    let currentX = 14;

    // Mapa w PDF zawiera wszystkie wpisy (także te tylko ze stanem skupienia)
    activities.forEach(act => {
      if (currentX > 270) { currentX = 14; mapY += 15; }
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(act.hour, currentX, mapY + 5);

      const state = act.focusState || 'spokój';
      let letter = 'OK';
      if (state === 'chaos') { doc.setFillColor(251, 191, 36); letter = 'CH'; }
      else if (state === 'hiperfokus') { doc.setFillColor(147, 51, 234); letter = 'F'; }
      else { doc.setFillColor(54, 203, 148); doc.setGState(new doc.GState({opacity: 0.3})); letter = 'OK'; }

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

    mapY += 18;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");

    doc.setFillColor(251, 191, 36); doc.rect(14, mapY, 5, 5, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.text("CH", 16.5, mapY + 3.5, { align: 'center' });
    doc.setTextColor(0, 0, 0); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text("Chaos", 21, mapY + 3.5);

    doc.setGState(new doc.GState({opacity: 0.3})); doc.setFillColor(54, 203, 148); doc.rect(36, mapY, 5, 5, 'F'); doc.setGState(new doc.GState({opacity: 1.0}));
    doc.setTextColor(4, 55, 36); doc.setFontSize(5); doc.setFont("helvetica", "bold"); doc.text("OK", 38.5, mapY + 3.5, { align: 'center' });
    doc.setTextColor(0, 0, 0); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text("balans", 43, mapY + 3.5);

    doc.setFillColor(147, 51, 234); doc.rect(60, mapY, 5, 5, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.text("F", 62.5, mapY + 3.5, { align: 'center' });
    doc.setTextColor(0, 0, 0); doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text("Hiperfokus", 67, mapY + 3.5);

    doc.save(`plan-cbt-${selectedDate}.pdf`);
  };

  const shareLink = `${window.location.origin}${window.location.pathname}?viewAs=${user?.uid}`;
  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
    alert("Link do podglądu skopiowany! Możesz go wysłać osobie trzeciej.");
  };

  const urlParams = new URLSearchParams(window.location.search);
  const hasViewParam = urlParams.has('viewAs');

  // Filtrujemy pełne aktywności do widoku tabeli i podsumowań
  const fullActivities = activities.filter(act => act.activity && act.activity.trim() !== '');

  if (!user && !hasViewParam) {
    return (
      <div className="hero min-h-[calc(100vh-64px)] bg-base-200">
        <div className="card w-full max-w-sm shadow-2xl bg-base-100">
          <form className="card-body" onSubmit={handleLogin}>
            <h2 className="text-2xl font-bold">Logowanie do Planera CBT</h2>
            <div className="form-control">
              <label className="label"><span className="label-text">E-mail</span></label>
              <input type="email" onChange={(e) => setLoginEmail(e.target.value)} className="input input-bordered focus:border-accent focus:ring-1 focus:ring-accent" required />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Hasło</span></label>
              <input type="password" onChange={(e) => setLoginPassword(e.target.value)} className="input input-bordered focus:border-accent focus:ring-1 focus:ring-accent" required />
              <label className="label">
                <span onClick={handlePasswordReset} className="label-text-alt link link-hover text-primary cursor-pointer">
                  Zapomniałeś hasła?
                </span>
              </label>
            </div>
            <button className="btn btn-primary mt-6">Zaloguj się</button>
          </form>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="tabs tab-bordered justify-center flex-wrap gap-2 md:gap-4 py-2 px-2">
        <button className={`tab px-1 ${activeTab === "daily" ? "tab-active font-bold text-secondary" : ""}`} onClick={() => setActiveTab("daily")}>Widok Dzienny</button>
        <button className={`tab px-1 ${activeTab === "weekly" ? "tab-active font-bold text-secondary" : ""}`} onClick={() => setActiveTab("weekly")}>Widok Tygodniowy</button>
        {!isReadOnly && <button className={`tab px-1 ${activeTab === 'notes' ? 'tab-active font-bold text-secondary' : ''}`} onClick={() => setActiveTab('notes')}>Notatki</button>}
      </div>

      {activeTab === "daily" && (
        <div className="min-h-[calc(100vh-64px)] bg-base-200 p-4 md:p-8 overflow-x-hidden">
          <div className="max-w-[1800px] mx-auto">
            <header className="mb-8 lg:mb-0 text-center relative">
              <h1 className="text-3xl font-bold text-primary mb-2">Dzienny plan aktywności – CBT</h1>
              <p className="text-base-content/70">Wypełniaj plan na bieżąco lub zaznacz sam stan skupienia.</p>
              {isReadOnly && <p className="badge badge-warning mt-4">Read only</p>}
              <div className={`relative flex gap-2 flex-wrap justify-end mt-8 -mb-8 z-10 ${isReadOnly ? 'lg:-mb-6' : ''}`}>
                {!isReadOnly && <button className="btn btn-outline btn-secondary btn-sm" onClick={copyShareLink}>Share Link</button>}
                <button onClick={exportToPDF} className="btn btn-outline btn-accent btn-sm" disabled={activities.length === 0}>Pobierz PDF z {selectedDate}</button>
              </div>
            </header>
            <div className="flex gap-4 items-center mb-4">
              <button className="hidden btn btn-ghost btn-sm lg:flex lg:gap-2 lg:items-center relative z-10" onClick={() => setIsFormExpanded(!isFormExpanded)}>
                <AngleIcon className={isFormExpanded ? 'transform rotate-180' : ''} />
                {isReadOnly ? 'Wybierz datę' : isFormExpanded ? 'Zwiń formularz' : 'Rozwiń formularz'}
                <span className="badge badge-info font-bold">{selectedDate} • {selectedDayName}</span>
              </button>
            </div>
            <div className="relative grid grid-cols-1 lg:grid-cols-6 gap-8">
              <div className={`lg:col-span-2 space-y-6 min-w-0 ${isFormExpanded ? 'lg:relative lg:left-0' : 'lg:absolute lg:left-[-100%]'} transition-all duration-300 ease-in-out relative`}>
                <div className="relative card bg-base-100 shadow-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="card-title">Wybierz datę</h2>
                    {selectedDate !== todayIso && (
                      <button type="button" className="btn btn-xs btn-outline" onClick={() => setSelectedDate(todayIso)}>
                        Dzisiaj
                      </button>
                    )}
                  </div>
                  <input type="date" className="input input-bordered focus:border-accent focus:ring-1 focus:ring-accent" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                  <span className="text-xs opacity-70 pt-1 pl-1 capitalize">{selectedDayName}</span>
                </div>

                <div className={`${isReadOnly ? 'hidden lg:block' : ''} card bg-base-100 shadow-xl p-6`}>
                  <h2 className="card-title mb-4">{editingId ? "Edytuj wpis" : "Nowa aktywność / Skupienie"}</h2>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="form-control">
                      <label className="label text-xs font-bold uppercase">Godzina (wymagane)</label>
                      <input name="hour" type="time" className="input input-bordered focus:border-accent focus:ring-1 focus:ring-accent" value={formData.hour} onChange={handleChange} required />
                    </div>

                    {/* Stan Skupienia przeniesiony wyżej dla ułatwienia */}
                    <div className="form-control bg-base-200/50 p-3 rounded-xl border border-base-300">
                      <label className="label pb-1"><span className="label-text font-bold">Stan skupienia (ADHD)</span></label>
                      <div className="flex flex-col gap-2 mt-2">
                        <label className="cursor-pointer flex items-center gap-3">
                          <input type="radio" name="focusState" value="chaos" className="radio radio-warning radio-sm" checked={formData.focusState === 'chaos'} onChange={handleChange} />
                          <span className="label-text text-warning font-semibold">Rozproszenie/chaos</span>
                        </label>
                        <label className="cursor-pointer flex items-center gap-3">
                          <input type="radio" name="focusState" value="spokój" className="radio radio-success radio-sm" checked={formData.focusState === 'spokój'} onChange={handleChange} />
                          <span className="label-text text-success font-semibold">Balans/spokój</span>
                        </label>
                        <label className="cursor-pointer flex items-center gap-3">
                          <input type="radio" name="focusState" value="hiperfokus" className="radio radio-primary radio-sm" checked={formData.focusState === 'hiperfokus'} onChange={handleChange} />
                          <span className="label-text text-primary font-semibold">Hiperfokus</span>
                        </label>
                      </div>
                    </div>

                    <div className="form-control">
                      {/* ZMIANA: activity nie jest już wymagane (required) */}
                      <textarea
                        name="activity"
                        placeholder="Co robisz? (Zostaw puste dla samego skupienia)"
                        className="textarea textarea-bordered h-24 w-full leading-snug focus:border-accent focus:ring-1 focus:ring-accent"
                        value={formData.activity}
                        onChange={handleChange}
                      />
                    </div>
                    <div className="form-control">
                      <input name="context" placeholder="Gdzie / Z kim?" className="input input-bordered focus:border-accent focus:ring-1 focus:ring-accent" value={formData.context} onChange={handleChange} />
                    </div>

                    <div className="form-control">
                      <label className="label"><span className="label-text">Przyjemność: {formData.pleasure} </span></label>
                      <input name="pleasure" type="range" min="1" max="10" className="range range-primary range-sm" value={formData.pleasure} onChange={handleChange} />
                    </div>
                    <div className="form-control">
                      <label className="label"><span className="label-text">Skuteczność (Mastery): {formData.mastery} </span></label>
                      <input name="mastery" type="range" min="1" max="10" className="range range-secondary range-sm" value={formData.mastery} onChange={handleChange} />
                    </div>
                    <div className="form-control">
                      <input name="emotion" placeholder="Emocje (np. lęk, radość)" className="input input-bordered focus:border-accent focus:ring-1 focus:ring-accent" value={formData.emotion} onChange={handleChange} />
                    </div>
                    <div className="form-control">
                      <label className="label"><span className="label-text">Nasilenie emocji: {formData.emotionIntensity} </span></label>
                      <input name="emotionIntensity" type="range" min="1" max="10" className="range range-accent range-sm" value={formData.emotionIntensity} onChange={handleChange} />
                    </div>
                    <select name="isPleasant" className="select select-bordered w-full" value={formData.isPleasant} onChange={handleChange}>
                      <option value="Nie">Czy przyjemna? Nie</option>
                      <option value="Tak">Czy przyjemna? Tak</option>
                    </select>
                    <textarea name="notes" placeholder="Uwagi / Myśli automatyczne" className="textarea textarea-bordered h-24 w-full leading-snug focus:border-accent focus:ring-1 focus:ring-accent" value={formData.notes} onChange={handleChange} />

                    <button type="submit" className="btn btn-primary w-full" disabled={isReadOnly}>{editingId ? "Zapisz zmiany" : "Zapisz"}</button>

                    {/* Przycisk Usuwania dodany w trybie edycji, by ułatwić zarządzanie wpisami z samej mapy */}
                    {editingId && (
                      <div className="flex gap-2 w-full mt-2">
                        <button type="button" className="btn btn-ghost flex-1" onClick={() => { setEditingId(null); setFormData({ hour: '', activity: '', context: '', pleasure: 0, mastery: 0, emotion: '', emotionIntensity: 0, isPleasant: 'Tak', focusState: 'spokój', notes: '' }); }}>
                          Anuluj
                        </button>
                        <button type="button" className="btn btn-outline btn-error flex-1" disabled={isReadOnly} onClick={() => { deleteDoc(doc(db, "activities", editingId)); setEditingId(null); setFormData({ hour: '', activity: '', context: '', pleasure: 0, mastery: 0, emotion: '', emotionIntensity: 0, isPleasant: 'Tak', focusState: 'spokój', notes: '' }); }}>
                          Usuń wpis
                        </button>
                      </div>
                    )}
                  </form>
                </div>
              </div>

              <div className={`${isFormExpanded ? 'lg:col-span-4' : 'lg:col-span-6'} min-w-0 transition-all duration-300 ease-in-out relative`}>
                <div className="card bg-base-100 shadow-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="table table-zebra w-full text-sm">
                      <thead className="bg-base-300">
                        <tr>
                          <th className="!relative">Godzina</th>
                          <th className="min-w-[200px] max-w-[300px]">Aktywność / Kontekst</th>
                          <th className="text-center">P / M </th>
                          <th>Emocje</th>
                          <th>Skupienie</th>
                          <th>Przyjemna?</th>
                          <th className="min-w-[200px] max-w-[300px]">Uwagi</th>
                          <th>Akcje</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Tabela wyświetla tylko pełne aktywności */}
                        {fullActivities.length > 0 ? fullActivities.map(act => (
                          <tr key={act.id} className="hover">
                            <td className="font-bold">{act.hour}</td>
                            <td className="min-w-[200px] max-w-[300px]">
                              <div className="font-bold whitespace-normal">{act.activity}</div>
                              <div className="text-xs opacity-50">{act.context}</div>
                            </td>
                            <td className="text-center">
                              <div className="tooltip badge badge-primary badge-outline mr-1" data-tip="Przyjemność">{act.pleasure}</div>
                              <div className="tooltip badge badge-secondary badge-outline" data-tip="Skuteczność/Mastery">{act.mastery}</div>
                            </td>
                            <td className="max-w-xs truncate text-xs">
                              <span className="tooltip badge badge-accent badge-outline mr-1" data-tip="Nasilenie emocji">{act.emotionIntensity}</span> {act.emotion}
                            </td>
                            <td>
                              {act.focusState === 'chaos' && <span className="badge badge-warning badge-sm font-bold">Chaos</span>}
                              {(act.focusState === 'spokój' || !act.focusState) && <span className="badge badge-sm font-bold border" style={{backgroundColor: '#36cb944d', color: '#043724', borderColor: '#36cb944d'}}>balans</span>}
                              {act.focusState === 'hiperfokus' && <span className="badge badge-primary badge-sm text-white font-bold">Hiperfokus</span>}
                            </td>
                            <td>
                              <span className={`badge badge-outline ${act.isPleasant === 'Tak' ? 'badge-success' : 'badge-error'}`}>{act.isPleasant}</span>
                            </td>
                            <td className="text-xs italic opacity-70 whitespace-normal min-w-[200px] max-w-[300px]">{act.notes}</td>
                            <td className="space-x-1 flex flex-col gap-1">
                              <button className="btn btn-ghost btn-xs text-info" disabled={isReadOnly} onClick={() => startEdit(act)}>Edytuj</button>
                              <button className="btn btn-ghost btn-xs text-error" disabled={isReadOnly} onClick={() => deleteDoc(doc(db, "activities", act.id))}>Usuń</button>
                            </td>
                          </tr>
                        )) : (
                          <tr><td colSpan="8" className="text-center py-10 opacity-50">Brak pełnych aktywności w tym dniu.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Kafelki obliczane tylko dla pełnych aktywności */}
                {fullActivities.length > 0 && (
                  <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="alert alert-info shadow-lg">
                      <div>
                        <h3 className="font-bold">Najwyższa skuteczność dziś (M):</h3>
                        <div className="text-sm font-medium">
                          {fullActivities.reduce((prev, current) => (prev.mastery > current.mastery) ? prev : current).activity}
                        </div>
                      </div>
                    </div>
                    <div className="alert alert-success shadow-lg text-success-content">
                      <div>
                        <h3 className="font-bold">Największa przyjemność dziś (P):</h3>
                        <div className="text-sm font-medium">
                          {fullActivities.reduce((prev, current) => (prev.pleasure > current.pleasure) ? prev : current).activity}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mapa Skupienia bierze wszystkie wpisy z bazy (też te bez aktywności) */}
                {activities.length > 0 && (
                  <div className="card bg-base-100 shadow-xl p-6 mt-8 border-t-4 rounded-t-none border-primary">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      Mapa Skupienia (ADHD)
                    </h3>
                    <div className="flex flex-wrap gap-3 items-end">
                      {activities.map(act => {
                        let bgColor = "";
                        let textColor = "";
                        let customStyle = { backgroundColor: '#36cb944d', color: '#043724' };
                        let letter = "OK";
                        if (act.focusState === 'chaos') { bgColor = "bg-warning"; textColor = "text-white"; customStyle = null; letter = "CH"; }
                        if (act.focusState === 'hiperfokus') { bgColor = "bg-primary"; textColor = "text-white"; customStyle = null; letter = "F"; }

                        return (
                          <div
                            key={act.id}
                            className="flex flex-col items-center gap-1 group cursor-pointer"
                            onClick={() => startEdit(act)} // Kwadrat jest klikalny i wczytuje wpis do edycji
                          >
                            <span className="text-[11px]">{act.hour}</span>
                            <div className={`w-8 h-8 rounded-md shadow-sm tooltip ${bgColor} ${textColor} transition-transform hover:scale-110 flex items-center justify-center text-[10px] font-bold`} style={customStyle} data-tip={act.activity || "Tylko stan skupienia"}>
                              {letter}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-6 pt-4 border-t border-base-200 text-sm opacity-80 font-semibold">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-warning rounded-full shadow-sm flex items-center justify-center text-white text-[9px] font-bold">CH</div> Chaos
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full shadow-sm flex items-center justify-center text-[9px] font-bold" style={{backgroundColor: '#36cb944d', color: '#043724'}}>OK</div> balans
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-primary rounded-full shadow-sm flex items-center justify-center text-white text-[9px] font-bold">F</div> Hiperfokus
                      </div>
                    </div>
                    <p className="text-xs opacity-50 mt-4 italic">Wskazówka: Kliknij na kwadracik, aby go edytować lub usunąć.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'weekly' && <WeeklyView db={db} user={user} targetUid={targetUid} isReadOnly={isReadOnly} initialDate={selectedDate} />}
      {!isReadOnly && activeTab === 'notes' && <NotesView db={db} targetUid={targetUid} isReadOnly={isReadOnly} />}
    </>
  );
}

export default MainPage;
