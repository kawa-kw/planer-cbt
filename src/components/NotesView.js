// ...existing code...
import React, { useState, useEffect } from 'react';
import { getWeekKey } from "../helpers";
import { collection, addDoc, query, where, orderBy, onSnapshot, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";

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
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

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
      setSelectedNotes((prev) => prev.filter((id) => notesData.some((n) => n.id === id)));
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

  const openEditNote = (note) => {
    setEditingNoteId(note.id);
    setEditTitle(note.title || "");
    setEditContent(note.content || "");
  };

  const closeEditNote = () => {
    setEditingNoteId(null);
    setEditTitle("");
    setEditContent("");
  };

  const handleUpdateNote = async () => {
    if (!editingNoteId) return;
    if (!editTitle.trim() || !editContent.trim()) return;

    setIsSavingEdit(true);
    let didSave = false;
    try {
      await updateDoc(doc(db, "notes", editingNoteId), {
        title: editTitle.trim(),
        content: editContent.trim(),
        updatedAt: serverTimestamp(),
      });
      didSave = true;
    } catch (error) {
      console.error("Błąd edycji notatki:", error);
      alert("Nie udało się zapisać zmian. Sprawdź połączenie.");
    } finally {
      setIsSavingEdit(false);
      if (didSave) closeEditNote();
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
      {/* Modal edycji */}
      {editingNoteId && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg text-secondary">Edytuj notatkę</h3>
            <p className="text-xs opacity-60 mt-1">Zmienisz tytuł i treść, a notatka zostanie nadpisana.</p>

            <div className="form-control mt-4">
              <label className="label py-1">
                <span className="label-text text-xs font-bold uppercase">Tytuł</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full font-bold focus:border-secondary focus:ring-1 focus:ring-secondary"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={100}
                disabled={isSavingEdit}
              />
            </div>

            <div className="form-control mt-3">
              <label className="label py-1">
                <span className="label-text text-xs font-bold uppercase">Treść</span>
              </label>
              <textarea
                className="textarea textarea-bordered h-40 leading-relaxed text-base focus:border-secondary focus:ring-1 focus:ring-secondary"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                disabled={isSavingEdit}
              />
            </div>

            <div className="modal-action">
              <button className="btn" onClick={closeEditNote} disabled={isSavingEdit}>
                Anuluj
              </button>
              <button
                className={`btn btn-secondary text-white ${isSavingEdit ? "loading" : ""}`}
                onClick={handleUpdateNote}
                disabled={!editTitle.trim() || !editContent.trim() || isSavingEdit}
              >
                Zapisz zmiany
              </button>
            </div>
          </div>
          <div className="modal-backdrop">
            <button onClick={closeEditNote} disabled={isSavingEdit}>close</button>
          </div>
        </div>
      )}

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
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 p-2 rounded-xl bg-base-200/60 border border-base-300">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{note.dateString}</span>
                  </div>
	                  <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="btn btn-xs btn-outline btn-error btn-square tooltip flex items-center justify-center p-0"
                        data-tip="Usuń"
                        aria-label="Usuń notatkę"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M9 3.75A.75.75 0 0 1 9.75 3h4.5a.75.75 0 0 1 .75.75V5.25h4.5a.75.75 0 0 1 0 1.5h-1.06l-1.12 13.44A2.25 2.25 0 0 1 15.08 22H8.92a2.25 2.25 0 0 1-2.24-1.81L5.56 6.75H4.5a.75.75 0 0 1 0-1.5H9V3.75Zm1.5 1.5v0h3v0h-3ZM8.06 6.75l1.1 13.2a.75.75 0 0 0 .75.6h5.18a.75.75 0 0 0 .75-.6l1.1-13.2H8.06Zm2.19 2.25a.75.75 0 0 1 .75.75v8.25a.75.75 0 0 1-1.5 0V9.75a.75.75 0 0 1 .75-.75Zm4.5 0a.75.75 0 0 1 .75.75v8.25a.75.75 0 0 1-1.5 0V9.75a.75.75 0 0 1 .75-.75Z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        onClick={() => openEditNote(note)}
                        className="btn btn-xs btn-outline btn-secondary btn-square tooltip flex items-center justify-center p-0"
                        data-tip="Edytuj"
                        aria-label="Edytuj notatkę"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path d="M16.862 4.487a1.5 1.5 0 0 1 2.12 2.121l-9.9 9.9a4.5 4.5 0 0 1-1.897 1.13l-2.35.783a.75.75 0 0 1-.948-.948l.783-2.35a4.5 4.5 0 0 1 1.13-1.897l9.9-9.9Z" />
                          <path d="M19.5 8.25 15.75 4.5" />
                        </svg>
                      </button>
	                    <label className="ml-4 flex items-center gap-2 cursor-pointer">
	                      <input
	                        type="checkbox"
	                        checked={selectedNotes && selectedNotes.includes(note.id)}
                        onChange={() => handleSelectNote(note.id)}
                        className="checkbox checkbox-accent checkbox-sm"
                        aria-label="Dodaj do raportu tygodniowego"
                      />
                      <span className="text-xs font-semibold">Dodaj do raportu</span>
                    </label>
                    
                  </div>
                </div>
                <h3 className="card-title text-sm text-secondary mb-1">{note.title}</h3>
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
