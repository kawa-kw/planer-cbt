import React from 'react';

const MoodRow = ({ label, values, onChange, isReadOnly }) => (
  <tr>
    <td className="font-bold text-xs uppercase">{label}</td>
    <td>
      <input
        type="range" min="0" max="10"
        className="range range-primary range-xs"
        value={values?.mood || 5}
        disabled={isReadOnly}
        onChange={(e) => onChange('mood', Number(e.target.value))}
      />
      <div className="text-[10px] text-center">{values?.mood || 5}/10</div>
    </td>
    <td>
      <input
        type="range" min="0" max="10"
        className="range range-secondary range-xs"
        value={values?.energy || 5}
        disabled={isReadOnly}
        onChange={(e) => onChange('energy', Number(e.target.value))}
      />
      <div className="text-[10px] text-center">{values?.energy || 5}/10</div>
    </td>
    <td>
      <input
        type="text"
        placeholder="Krótki kontekst..."
        className="input input-ghost input-xs w-full"
        value={values?.note || ""}
        disabled={isReadOnly}
        onChange={(e) => onChange('note', e.target.value)}
      />
    </td>
  </tr>
);

const MoodTable = ({ moodData, onUpdate, isReadOnly }) => {
  const poryDnia = [
    { key: 'rano', label: 'Rano' },
    { key: 'poludnie', label: 'Południe' },
    { key: 'wieczor', label: 'Wieczór' }
  ];

  const handleRowChange = (pora, field, value) => {
    const updatedMoodData = {
      ...moodData,
      [pora]: { ...moodData?.[pora], [field]: value }
    };
    onUpdate(updatedMoodData);
  };

  return (
    <div className="mb-6 border-b pb-6">
      <h3 className="text-lg font-bold mb-4 tracking-tighter">
        Tabela Nastroju i Energii
      </h3>
      <div className="overflow-x-auto">
        <table className="table table-compact w-full">
          <thead>
            <tr>
              <th>Pora</th>
              <th>Nastrój (0-10)</th>
              <th>Energia (0-10)</th>
              <th>Notatka/Sytuacja</th>
            </tr>
          </thead>
          <tbody>
            {poryDnia.map((pora) => (
              <MoodRow
                key={pora.key}
                label={pora.label}
                values={moodData?.[pora.key]}
                isReadOnly={isReadOnly}
                onChange={(f, v) => handleRowChange(pora.key, f, v)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[9px] opacity-50 mt-2 italic">
        * Skala: 0 = bardzo słabo (smutek), 10 = bardzo dobrze (radość)
      </p>
    </div>
  );
};

export default MoodTable;
