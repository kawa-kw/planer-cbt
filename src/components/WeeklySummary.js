import React from 'react';

const WeeklySummary = ({ summaries, onUpdate, isReadOnly }) => {
  const handleChange = (field, value) => {
    // Używamy onUpdate, bo tak nazywa się prop przekazany z góry
    onUpdate({ ...summaries, [field]: value });
  };

  return (
    <div className="card rounded-t-none bg-base-100 shadow-xl p-6 border-t-4 border-primary mt-8">
      <h2 className="card-title font-bold mb-6">
        Podsumowanie Tygodnia (CBT)
      </h2>

      <div className="space-y-6">
        {/* Pola tekstowe z dokumentu CBT_tygodniowy_dziennik_aktywizacji-1.docx */}
        <div className="form-control">
          <label className="label-text font-bold mb-2">Co pomogło najbardziej:</label>
          <textarea
            className="textarea textarea-bordered focus:border-accent focus:ring-1 focus:ring-accent leading-normal"
            disabled={isReadOnly}
            value={summaries?.mostHelpful || ""}
            onChange={(e) => handleChange('mostHelpful', e.target.value)}
          />
        </div>

        <div className="form-control">
          <label className="label-text font-bold mb-2">Co było najtrudniejsze:</label>
          <textarea
            className="textarea textarea-bordered focus:border-accent focus:ring-1 focus:ring-accent leading-normal"
            disabled={isReadOnly}
            value={summaries?.hardest || ""}
            onChange={(e) => handleChange('hardest', e.target.value)}
          />
        </div>

        <div className="form-control">
          <label className="label-text font-bold mb-2">Jakie aktywności miały pozytywny wpływ na nastrój:</label>
          <textarea
            className="textarea textarea-bordered focus:border-accent focus:ring-1 focus:ring-accent leading-normal"
            disabled={isReadOnly}
            value={summaries?.positiveInfluence || ""}
            onChange={(e) => handleChange('positiveInfluence', e.target.value)}
          />
        </div>

        <div className="form-control">
          <label className="label-text font-bold mb-2">Jedna rzecz, którą chcę spróbować w kolejnym tygodniu:</label>
          <input
            className="focus:border-accent focus:ring-1 focus:ring-accent input input-bordered"
            disabled={isReadOnly}
            value={summaries?.nextWeekGoal || ""}
            onChange={(e) => handleChange('nextWeekGoal', e.target.value)}
          />
        </div>
      </div>

      <div className="mt-8 text-center text-xs italic opacity-60">
        Ważne: Działanie często poprzedza poprawę samopoczucia. Małe kroki = realna zmiana.
      </div>
    </div>
  );
};

export default WeeklySummary;