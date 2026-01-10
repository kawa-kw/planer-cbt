import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const MoodChart = ({ plannedActivities }) => {
  const days = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];

  const calculateAverage = (moodTracker, field) => {
    if (!moodTracker) return 0;
    const pory = ['rano', 'poludnie', 'wieczor'];

    // Obliczamy sumę wartości dla dostępnych pomiarów
    const total = pory.reduce((sum, pora) => {
      return sum + (moodTracker[pora]?.[field] || 0);
    }, 0);

    // Zwracamy średnią (dzieloną przez 3 pory dnia zgodnie z arkuszem)
    return parseFloat((total / 3).toFixed(1));
  };

  const data = days.map(day => {
    const tracker = plannedActivities?.[day]?.moodTracker;
    return {
      name: day.substring(0, 3),
      nastrój: calculateAverage(tracker, 'mood'),
      energia: calculateAverage(tracker, 'energy'),
    };
  });

  return (
    <div className="card rounded-t-none bg-base-100 shadow-xl p-6 mb-8 border-t-4 border-primary">
      <div className="flex justify-between items-center mb-4">
        <h2 className="card-title text-sm uppercase opacity-70">
          Tygodniowy Trend Nastroju i Energii (Średnia dobowa)
        </h2>
        <div className="badge badge-ghost text-[10px]">Skala 0-10</div>
      </div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
            <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: '12px',
                border: 'none',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
              }}
            />
            <Legend verticalAlign="top" height={36} />
            <Line
              name="Średni Nastrój"
              type="monotone"
              dataKey="nastrój"
              stroke="#4f46e5"
              strokeWidth={4}
              dot={{ r: 4, fill: '#4f46e5' }}
              activeDot={{ r: 8 }}
            />
            <Line
              name="Średnia Energia"
              type="monotone"
              dataKey="energia"
              stroke="#ec4899"
              strokeWidth={4}
              dot={{ r: 4, fill: '#ec4899' }}
              activeDot={{ r: 8 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] opacity-50 mt-4 italic text-center">
        Wykres prezentuje uśredniony poziom z trzech porów dnia (Rano, Południe, Wieczór) zgodnie z tabelą monitoringu.
      </p>
    </div>
  );
};

export default MoodChart;
