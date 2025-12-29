import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore, collection, addDoc, query, where,
  onSnapshot, deleteDoc, doc, updateDoc
} from "firebase/firestore";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
    hour: '', activity: '', context: '', pleasure: 5, mastery: 5,
    emotion: '', emotionIntensity: 5, isPleasant: 'Tak', notes: '', userId: ''
  });
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const auth = getAuth(app);
  const [user, setUser] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [targetUid, setTargetUid] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      // Logika sprawdzania uprawnień
      const urlParams = new URLSearchParams(window.location.search);
      const viewAsUid = urlParams.get('viewAs');

      if (viewAsUid && !currentUser) {
        // Jeśli jest link udostępniania i NIE jesteśmy zalogowani jako właściciel
        setIsReadOnly(true);
        setTargetUid(viewAsUid);
      } else if (currentUser) {
        // Jeśli jesteśmy zalogowani (nawet jeśli weszliśmy z linku, priorytet ma nasze konto)
        setIsReadOnly(false);
        setTargetUid(currentUser.uid);
      }
    });
    return () => unsubscribe();
  }, [auth]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, [auth]);

  useEffect(() => {
    if (!targetUid) return;

    const q = query(
      collection(db, "activities"),
      where("date", "==", selectedDate),
      where("userId", "==", targetUid)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const data = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setActivities(data.sort((a, b) => a.hour.localeCompare(b.hour)));
    });

    return () => unsubscribe();
  }, [selectedDate, targetUid]);

  const handleLogin = (e) => {
    e.preventDefault();
    signInWithEmailAndPassword(auth, loginEmail, loginPassword)
      .catch(err => alert("Błąd logowania: " + err.message));
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
      setFormData({ hour: '', activity: '', context: '', pleasure: 5, mastery: 5, emotion: '', emotionIntensity: 5, isPleasant: 'Tak', notes: '', userId: '' });
    } catch (err) { alert(err); }
  };

  const startEdit = (act) => {
    setEditingId(act.id);
    setFormData({ ...act });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exportToPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const title = removePolishAccents("Dzienny plan aktywnosci - nurt CBT");
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(11);
    doc.text(`Data: ${selectedDate}`, 14, 22);

    const tableColumn = [
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

    const tableRows = activities.map(act => [
      act.hour,
      removePolishAccents(act.activity),
      removePolishAccents(act.context),
      act.pleasure,
      act.mastery,
      removePolishAccents(act.emotion),
      act.emotionIntensity,
      act.isPleasant,
      removePolishAccents(act.notes)
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 30,
      styles: {
        fontSize: 9,
        font: "helvetica",
        cellPadding: 3
      },
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: [255, 255, 255]
      },
      columnStyles: {
        8: { cellWidth: 60 }
      }
    });

    doc.save(`plan-cbt-${selectedDate}.pdf`);
  };

  const shareLink = `${window.location.origin}${window.location.pathname}?viewAs=${user?.uid}`;

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareLink);
    alert("Link do podglądu skopiowany! Możesz go wysłać osobie trzeciej.");
  };

  const urlParams = new URLSearchParams(window.location.search);
  const hasViewParam = urlParams.has('viewAs');

  if (!user && !hasViewParam) {
    return (
      <div className="hero min-h-screen bg-base-200">
        <div className="card w-full max-w-sm shadow-2xl bg-base-100">
          <form className="card-body" onSubmit={handleLogin}>
            <h2 className="text-2xl font-bold">Logowanie do Planera CBT</h2>
            <div className="form-control">
              <label className="label"><span className="label-text">E-mail</span></label>
              <input type="email" onChange={(e) => setLoginEmail(e.target.value)} className="input input-bordered" required />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Hasło</span></label>
              <input type="password" onChange={(e) => setLoginPassword(e.target.value)} className="input input-bordered" required />
            </div>
            <button className="btn btn-primary mt-6">Zaloguj się</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200 p-4 md:p-8">
      <div className="max-w-[1800px] mx-auto">
        <header className="mb-8 lg:mb-0 text-center relative">
          <h1 className="text-3xl font-bold text-primary mb-2">Dzienny plan aktywności – CBT</h1>
          <p className="text-base-content/70">Wypełniaj plan na bieżąco lub po zakończeniu aktywności.</p>
          {isReadOnly && <p className="badge badge-warning mt-4">Read only</p>}
          <div className={`relative flex gap-2 flex-wrap justify-end mt-8 -mb-8 z-10 ${isReadOnly ? 'lg:-mb-6' : ''}`}>
            {!isReadOnly && <button className="btn btn-outline btn-secondary btn-sm" onClick={copyShareLink}>
              Share Link
            </button>}
            <button
              onClick={exportToPDF}
              className="btn btn-outline btn-accent btn-sm"
              disabled={activities.length === 0}
            >
              Pobierz PDF z {selectedDate}
            </button>
          </div>
        </header>
        <div className="flex gap-4 items-center mb-4">
          <button
            className="hidden btn btn-ghost btn-sm lg:flex lg:gap-2 lg:items-center relative z-10"
            onClick={() => setIsFormExpanded(!isFormExpanded)}><AngleIcon className={isFormExpanded ? 'transform rotate-180' : ''} />
            {isReadOnly ? 'Wybierz datę' : isFormExpanded ? 'Zwiń formularz' : 'Rozwiń formularz'}
            <span className="badge badge-info font-bold">{selectedDate}</span>
          </button>
        </div>
        <div className="relative grid grid-cols-1 lg:grid-cols-6 gap-8">
          <div className={`lg:col-span-2 space-y-6 ${isFormExpanded ? 'lg:relative lg:left-0' : 'lg:absolute lg:left-[-100%]'} transition-all duration-300 ease-in-out relative`}>
            <div className="relative card bg-base-100 shadow-xl p-6">
              <h2 className="card-title mb-4">Wybierz datę</h2>
              <input
                type="date"
                className="input input-bordered"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            <div className={`${isReadOnly ? 'hidden lg:block' : ''} card bg-base-100 shadow-xl p-6`}>
              <h2 className="card-title mb-4">{editingId ? "Edytuj wpis" : "Nowa aktywność"}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="form-control">
                  <label className="label text-xs font-bold uppercase">Godzina</label>
                  <input name="hour" type="time" className="input input-bordered" value={formData.hour} onChange={handleChange} required />
                </div>

                <div className="form-control">
                  <input name="activity" placeholder="Co dokładnie robisz?" className="input input-bordered" value={formData.activity} onChange={handleChange} required />
                </div>

                <div className="form-control">
                  <input name="context" placeholder="Gdzie / Z kim?" className="input input-bordered" value={formData.context} onChange={handleChange} />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Przyjemność: {formData.pleasure} </span>
                  </label>
                  <input name="pleasure" type="range" min="1" max="10" className="range range-primary range-sm" value={formData.pleasure} onChange={handleChange} />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Skuteczność (Mastery): {formData.mastery} </span>
                  </label>
                  <input name="mastery" type="range" min="1" max="10" className="range range-secondary range-sm" value={formData.mastery} onChange={handleChange} />
                </div>

                <div className="form-control">
                  <input name="emotion" placeholder="Emocje (np. lęk, radość)" className="input input-bordered" value={formData.emotion} onChange={handleChange} />
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Nasilenie emocji: {formData.emotionIntensity} </span>
                  </label>
                  <input name="emotionIntensity" type="range" min="1" max="10" className="range range-accent range-sm" value={formData.emotionIntensity} onChange={handleChange} />
                </div>

                <select name="isPleasant" className="select select-bordered w-full" value={formData.isPleasant} onChange={handleChange}>
                  <option value="Nie">Czy przyjemna? Nie</option>
                  <option value="Tak">Czy przyjemna? Tak</option>
                </select>

                <textarea name="notes" placeholder="Uwagi / Myśli automatyczne" className="textarea textarea-bordered h-24 w-full leading-snug" value={formData.notes} onChange={handleChange} />

                <button type="submit" className="btn btn-primary w-full" disabled={isReadOnly}>
                  {editingId ? "Zapisz zmiany" : "Dodaj wpis"}
                </button>
                {editingId && (
                  <button type="button" className="btn btn-ghost w-full" onClick={() => { setEditingId(null); setFormData({ hour: '', activity: '', context: '', pleasure: 5, mastery: 5, emotion: '', emotionIntensity: 5, isPleasant: 'Tak', notes: '' }); }}>
                    Anuluj
                  </button>
                )}
              </form>
            </div>
          </div>

          <div className={`${isFormExpanded ? 'lg:col-span-4' : 'lg:col-span-6'} transition-all duration-300 ease-in-out relative`}>
            <div className="card bg-base-100 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table table-zebra w-full">
                  <thead className="bg-base-300">
                    <tr>
                      <th className="!relative">Godzina</th>
                      <th className="min-w-[300px] max-w-[400px]">Aktywność / Kontekst</th>
                      <th className="text-center">P / M </th>
                      <th>Emocje</th>
                      <th>Przyjemna?</th>
                      <th className="min-w-[300px] max-w-[400px]">Uwagi</th>
                      <th>Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.length > 0 ? activities.map(act => (
                      <tr key={act.id} className="hover">
                        <td className="font-bold">{act.hour}</td>
                        <td className="min-w-[300px] max-w-[400px]">
                          <div className="font-bold whitespace-normal">{act.activity}</div>
                          <div className="text-xs opacity-50">{act.context}</div>
                        </td>
                        <td className="text-center">
                          <div className="tooltip badge badge-primary badge-outline mr-2" data-tip="Przyjemność">{act.pleasure}</div>
                          <div className="tooltip badge badge-secondary badge-outline" data-tip="Skuteczność/Mastery">{act.mastery}</div>
                        </td>
                        <td className="max-w-xs truncate text-xs">
                          <span className="tooltip badge badge-accent badge-outline mr-2" data-tip="Nasilenie emocji">{act.emotionIntensity}</span> {act.emotion}
                        </td>
                        <td> 
                          <span className={`badge badge-outline ${act.isPleasant === 'Tak' ? 'badge-success' : 'badge-error'}`}>{act.isPleasant}</span>
                        </td>
                        <td className="text-xs italic opacity-70 whitespace-normal min-w-[300px] max-w-[400px]">{act.notes}</td>
                        <td className="space-x-2">
                          <button className="btn btn-ghost btn-xs text-info" disabled={isReadOnly} onClick={() => startEdit(act)}>Edytuj</button>
                          <button className="btn btn-ghost btn-xs text-error" disabled={isReadOnly} onClick={() => deleteDoc(doc(db, "activities", act.id))}>Usuń</button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan="6" className="text-center py-10 opacity-50">Brak aktywności dla wybranej daty.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {activities.length > 0 && (
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="alert alert-info shadow-lg">
                  <div>
                    <h3 className="font-bold">Najwyższa skuteczność dziś:</h3>
                    <div className="text-sm font-medium">
                      {activities.reduce((prev, current) => (prev.mastery > current.mastery) ? prev : current).activity}
                    </div>
                  </div>
                </div>
                <div className="alert alert-success shadow-lg text-success-content">
                  <div>
                    <h3 className="font-bold">Największa przyjemność dziś:</h3>
                    <div className="text-sm font-medium">
                      {activities.reduce((prev, current) => (prev.pleasure > current.pleasure) ? prev : current).activity}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

export default MainPage;
