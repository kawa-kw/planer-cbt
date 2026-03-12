// ...existing code...
import React, { useState, useEffect } from 'react';
import { getWeekKey } from "../helpers";
import { collection, addDoc, query, where, orderBy, onSnapshot, deleteDoc, doc, serverTimestamp } from "firebase/firestore";

const NotesView = ({ db, targetUid, isReadOnly }) => {
  // Stan wybranych notatek do raportu tygodniowego
  const [selectedNotes, setSelectedNotes] = useState([]);
  const [weekKey, setWeekKey] = useState("");

  // Synchronizacja z localStorage na podstawie tygodnia
  useEffect(() => {
    const currentWeek = getWeekKey(new Date());
    setWeekKey(currentWeek);
    const stored = localStorage.getItem(`selectedNotes_${currentWeek}`);
    setSelectedNotes(stored ? JSON.parse(stored) : []);
  }, []);

  // Reset zaznaczeń w poniedziałek (zmiana tygodnia)
  useEffect(() => {
    const interval = setInterval(() => {
      const currentWeek = getWeekKey(new Date());
      if (currentWeek !== weekKey) {
        setWeekKey(currentWeek);
        setSelectedNotes([]);
        localStorage.setItem(`selectedNotes_${currentWeek}`, JSON.stringify([]));
      }
    }, 60 * 60 * 1000); // sprawdzaj co godzinę
    return () => clearInterval(interval);
  }, [weekKey]);

  // Zapisuj stan do localStorage przy zmianie
  useEffect(() => {
    if (weekKey) {
      localStorage.setItem(`selectedNotes_${weekKey}`, JSON.stringify(selectedNotes));
    }
  }, [selectedNotes, weekKey]);

  // Obsługa zaznaczania checkboxa
  const handleSelectNote = (id) => {
    setSelectedNotes((prev) =>
      prev.includes(id)
        ? prev.filter((noteId) => noteId !== id)
        : [...prev, id]
    );
  };
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pobieranie notatek (tylko dla właściciela - reguły Firebase to wymuszą)
  useEffect(() => {
    if (!targetUid) return;

    // Jeśli jesteśmy w trybie ReadOnly (terapeuta), nie pobieramy notatek
    // To dodatkowe zabezpieczenie po stronie frontendu
    if (isReadOnly) {
      setNotes([]);
      return;
    }

    const q = query(
      collection(db, "notes"),
      where("userId", "==", targetUid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotes(notesData);
      // Zapisz wszystkie notatki do localStorage
      localStorage.setItem('allNotes', JSON.stringify(notesData));
    }, (error) => {
      console.error("Błąd pobierania notatek:", error);
    });

    return () => unsubscribe();
  }, [db, targetUid, isReadOnly]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "notes"), {
        userId: targetUid,
        title: title,
        content: content,
        createdAt: serverTimestamp(),
        dateString: new Date().toLocaleDateString('pl-PL')
      });
      setTitle("");
      setContent("");
    } catch (error) {
      console.error("Błąd dodawania notatki:", error);
      alert("Nie udało się zapisać notatki. Sprawdź połączenie.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNote = async (id) => {
    if (window.confirm("Czy na pewno chcesz usunąć tę notatkę?")) {
      try {
        await deleteDoc(doc(db, "notes", id));
      } catch (error) {
        console.error("Błąd usuwania:", error);
      }
    }
  };

  // Jeśli ktoś jakimś cudem wejdzie tu w trybie readonly, wyświetlamy komunikat
  if (isReadOnly) {
    return (
      <div className="alert alert-warning shadow-lg">
        <span>Notatki są prywatne i widoczne tylko dla pacjenta.</span>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-64px)] bg-base-200 p-4 md:p-8 space-y-8 lg:space-y-0 max-w-4xl mx-auto animate-fade-in lg:flex lg:max-w-full lg:justify-start lg:items-stretch lg:gap-6">
      {/* Formularz dodawania */}
      <div className="card bg-base-100 shadow-xl border-t-4 rounded-t-none border-accent w-full lg:max-w-md">
        <div className="card-body">
          <h2 className="card-title text-accent">Nowa notatka</h2>
          <form onSubmit={handleAddNote} className="space-y-4 mt-2">
            <div className="form-control">
              <input
                type="text"
                placeholder="Tytuł notatki"
                className="input input-bordered w-full font-bold focus:border-accent focus:ring-1 focus:ring-accent"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="form-control">
              <textarea
                className="textarea textarea-bordered h-32 lg:h-80 leading-relaxed text-base focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="Treść notatki..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              ></textarea>
            </div>
            <div className="card-actions justify-end">
              <button
                type="submit"
                className={`btn btn-accent text-white w-full ${isSubmitting ? 'loading' : ''}`}
                disabled={!title.trim() || !content.trim()}
              >
                Zapisz wpis
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Lista wpisów */}
      <div className="space-y-4 lg:flex-1">
        <h3 className="text-xl font-bold opacity-70 ml-2 border-b pb-2">Historia wpisów <span className="badge badge-accent">{notes.length}</span></h3>

        {notes.length === 0 ? (
          <div className="text-center py-10 opacity-50 bg-base-200/50 rounded-xl">
            <p>Twój dziennik jest pusty. Zapisz pierwszą myśl powyżej.</p>
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="card bg-base-100 shadow-md hover:shadow-lg transition-all duration-300">
              <div className="card-body p-6">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="card-title text-sm text-secondary mb-1">{note.title}</h3>
                    <p className="text-xs opacity-50 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                      </svg>
                      {note.dateString}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedNotes && selectedNotes.includes(note.id)}
                        onChange={() => handleSelectNote(note.id)}
                        className="checkbox checkbox-accent"
                        aria-label="Dodaj do raportu tygodniowego"
                      />
                      <span className="text-xs">Dołącz do raportu</span>
                    </label>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="btn btn-ghost btn-circle btn-xs hover:opacity-100 tooltip tooltip-left"
                      data-tip="Usuń notatkę"
                    >✕</button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-base-content/80">
                  {note.content}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotesView;
