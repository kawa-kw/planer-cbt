import React from 'react';

const MoodCard = ({ label, values, onChange, isReadOnly }) => {
  const points = [0, 2, 4, 6, 8, 10]; // Uproszczone punkty wyboru dla wygody

  const renderSelector = (field, colorClass) => (
    <div className="flex flex-col gap-2 mt-2">
      <div className="flex justify-between w-full px-1 text-[10px] opacity-50 font-bold uppercase">
        <span>{field === 'mood' ? 'Nastrój' : 'Energia'}</span>
        <span>{values?.[field] || 0}/10</span>
      </div>
      <div className="grid grid-cols-6 gap-1">
        {points.map((point) => (
          <button
            key={point}
            disabled={isReadOnly}
            onClick={() => onChange(field, point)}
            className={`btn btn-xs md:btn-sm ${values?.[field] === point
                ? colorClass
                : 'btn-ghost bg-base-200'
              } transition-all border-none`}
          >
            {point}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="card bg-base-200/50 shadow-sm p-4 border border-base-300">
      <div className="flex items-center gap-2 mb-3">
        <span className="badge badge-neutral badge-sm font-bold uppercase tracking-wider">{label}</span>
      </div>

      <div className="space-y-4">
        {renderSelector('mood', 'btn-primary text-white')}
        {renderSelector('energy', 'btn-secondary text-white')}

        <div className="form-control w-full mt-2">
          <input
            type="text"
            placeholder="Krótka notatka / sytuacja..."
            className="input input-bordered input-sm w-full bg-base-100"
            value={values?.note || ""}
            disabled={isReadOnly}
            onChange={(e) => onChange('note', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

const MoodTable = ({ moodData, onUpdate, isReadOnly }) => {
  const poryDnia = [
    { key: 'rano', label: 'Rano' },
    { key: 'poludnie', label: 'Południe' },
    { key: 'wieczor', label: 'Wieczór' }
  ];

  const handleUpdate = (pora, field, value) => {
    const updatedMoodData = {
      ...moodData,
      [pora]: { ...moodData?.[pora], [field]: value }
    };
    onUpdate(updatedMoodData);
  };

  return (
    <div className="mb-4 border-b border-base-300 pb-6">
      <h3 className="font-bold text-lg mb-4">
        Monitoring Dobowy Nastroju
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {poryDnia.map((pora) => (
          <MoodCard
            key={pora.key}
            label={pora.label}
            values={moodData?.[pora.key]}
            isReadOnly={isReadOnly}
            onChange={(f, v) => handleUpdate(pora.key, f, v)}
          />
        ))}
      </div>
    </div>
  );
};

export default MoodTable;
