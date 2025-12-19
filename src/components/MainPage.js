import { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
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

function MainPage() {
  const [activities, setActivities] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    hour: '', activity: '', context: '', pleasure: 5, mastery: 5,
    emotion: '', emotionIntensity: 5, isPleasant: 'Nie', notes: ''
  });

  useEffect(() => {
    const q = query(collection(db, "activities"), where("date", "==", selectedDate));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const data = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setActivities(data.sort((a, b) => a.hour.localeCompare(b.hour)));
    });
    return () => unsubscribe();
  }, [selectedDate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
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
      setFormData({ hour: '', activity: '', context: '', pleasure: 5, mastery: 5, emotion: '', emotionIntensity: 5, isPleasant: 'Nie', notes: '' });
    } catch (err) { console.error(err); }
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

  return (
    <div className="min-h-screen bg-base-200 p-4 md:p-8">
      <div className="max-w-[1800px] mx-auto">
        <header className="mb-8 text-center relative">
          <h1 className="text-3xl font-bold text-primary mb-2">Dzienny plan aktywności – CBT</h1>
          <p className="text-base-content/70">Wypełniaj plan na bieżąco lub po zakończeniu aktywności.</p>
          <button
            onClick={exportToPDF}
            className="btn btn-outline btn-accent btn-sm ml-4 absolute -bottom-[82px] right-6 z-10 md:bottom-auto md:top-0 md:right-0"
            disabled={activities.length === 0}
          >
            Pobierz PDF
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          <div className="lg:col-span-1 space-y-6">
            <div className="card bg-base-100 shadow-xl p-6">
              <h2 className="card-title mb-4">Wybierz datę</h2>
              <input
                type="date"
                className="input input-bordered w-full"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            <div className="card bg-base-100 shadow-xl p-6">
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

                <textarea name="notes" placeholder="Uwagi / Myśli automatyczne" className="textarea textarea-bordered h-24 w-full" value={formData.notes} onChange={handleChange} />

                <button type="submit" className="btn btn-primary w-full">
                  {editingId ? "Zapisz zmiany" : "Dodaj wpis"}
                </button>
                {editingId && (
                  <button type="button" className="btn btn-ghost w-full" onClick={() => { setEditingId(null); setFormData({ hour: '', activity: '', context: '', pleasure: 5, mastery: 5, emotion: '', emotionIntensity: 5, isPleasant: 'Nie', notes: '' }); }}>
                    Anuluj
                  </button>
                )}
              </form>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="card bg-base-100 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table table-zebra w-full">
                  <thead className="bg-base-300">
                    <tr>
                      <th>Godzina</th>
                      <th>Aktywność / Kontekst</th>
                      <th className="text-center">P / M </th>
                      <th>Emocje</th>
                      <th>Uwagi</th>
                      <th>Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.length > 0 ? activities.map(act => (
                      <tr key={act.id} className="hover">
                        <td className="font-bold">{act.hour}</td>
                        <td>
                          <div className="font-bold">{act.activity}</div>
                          <div className="text-xs opacity-50">{act.context}</div>
                        </td>
                        <td className="text-center">
                          <div className="badge badge-primary badge-outline mr-1">{act.pleasure}</div>
                          <div className="badge badge-secondary badge-outline">{act.mastery}</div>
                        </td>
                        <td>
                          <div>{act.emotion}</div>
                          <div className="text-xs italic">Siła: {act.emotionIntensity}</div>
                        </td>
                        <td className="max-w-xs truncate text-xs italic opacity-70">{act.notes}</td>
                        <td className="space-x-2">
                          <button className="btn btn-ghost btn-xs text-info" onClick={() => startEdit(act)}>Edytuj</button>
                          <button className="btn btn-ghost btn-xs text-error" onClick={() => deleteDoc(doc(db, "activities", act.id))}>Usuń</button>
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
