import React from 'react';
import MoodTable from './MoodTable';

const DayPlanDetail = ({ data, onSave, isReadOnly, displayDate }) => {

  // Funkcja pomocnicza do aktualizacji pojedynczych pól
  const handleLocalChange = (field, value) => {
    if (isReadOnly) return;
    // Wysyłamy zaktualizowany obiekt do nadrzędnego WeeklyView
    onSave({
      ...data,
      [field]: value
    });
  };

  return (
    <div className="card rounded-l-none bg-base-100 shadow-xl p-6 border-l-4 border-secondary">
      <p className="text-lg font-bold mb-2 text-center text-primary">{displayDate}</p>
      <MoodTable
        moodData={data?.moodTracker}
        isReadOnly={isReadOnly}
        onUpdate={(updatedMoodTracker) => handleLocalChange('moodTracker', updatedMoodTracker)}
      />

      <h2 className="text-xl font-bold flex items-center gap-2">
        Plan Dnia
        <div className="badge badge-secondary badge-outline uppercase text-[10px]">Aktywizacja</div>
      </h2>

      <div className="space-y-6">
        {/* Planowana aktywność  */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-bold">Planowana aktywność:</span>
          </label>
          <input
            type="text"
            placeholder="Wybierz realistyczny, mały krok..."
            className="input input-bordered w-full"
            value={data?.activity || ""}
            disabled={isReadOnly}
            onChange={(e) => handleLocalChange('activity', e.target.value)}
          />
          <p className="text-[10px] opacity-50 mt-1 italic">
            * Wskazówka: Nie oceniaj – obserwuj. Samo podjęcie próby jest sukcesem.
          </p>
        </div>

        {/* Kategorie  */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-bold">Kategoria:</span>
          </label>
          <div className="flex flex-wrap gap-4">
            {["przyjemność", "obowiązek", "relacje", "dbanie o siebie"].map((cat) => (
              <label key={cat} className="label cursor-pointer gap-2">
                <input
                  type="radio"
                  name="category"
                  className="radio radio-primary radio-sm"
                  checked={data?.category === cat}
                  disabled={isReadOnly}
                  onChange={() => handleLocalChange('category', cat)}
                />
                
                <span className="label-text capitalize">{cat}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Czy wykonana?  */}
        <div className="form-control">
          <label className="label">
            <span className="label-text font-bold">Czy wykonana?</span>
          </label>
          <div className="flex gap-4">
            {["tak", "częściowo", "nie"].map((status) => (
              <label key={status} className="label cursor-pointer gap-2">
                <input
                  type="radio"
                  name="status"
                  className="radio radio-secondary radio-sm"
                  checked={data?.status === status}
                  disabled={isReadOnly}
                  onChange={() => handleLocalChange('status', status)}
                />
                <span className="label-text capitalize">{status}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Wyniki: Nastrój i Energia  */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-base-200 rounded-lg">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-bold text-primary">Nastrój po (0–10): {data?.moodAfter || 0}</span>
            </label>
            <input
              type="range" min="0" max="10"
              className="range range-primary range-sm"
              value={data?.moodAfter || 0}
              disabled={isReadOnly}
              onChange={(e) => handleLocalChange('moodAfter', Number(e.target.value))}
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text font-bold text-secondary">Energia po (0–10): {data?.energyAfter || 0}</span>
            </label>
            <input
              type="range" min="0" max="10"
              className="range range-secondary range-sm"
              value={data?.energyAfter || 0}
              disabled={isReadOnly}
              onChange={(e) => handleLocalChange('energyAfter', Number(e.target.value))}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayPlanDetail;
